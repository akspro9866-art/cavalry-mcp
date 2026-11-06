/**
 * Windows-safe filesystem teardown.
 *
 * On Windows a file stays locked for a moment after the handle that wrote it is
 * closed: `ffmpeg` may still be exiting, an antivirus scanner may have just
 * opened the PNG, or the test process itself still holds a decoded buffer. A
 * plain `fs.rmSync(dir, { recursive: true, force: true })` then throws `EBUSY`
 * or `EPERM`, and because these calls sit in `finally` blocks and `test.after`
 * hooks the failure masks the real test result — a green suite reports red, and
 * on CI the run is wasted.
 *
 * Every teardown in this repository goes through here. The policy is the one
 * the brief fixes: five retries at 150 ms, and a missing tree is success rather
 * than an error.
 *
 * Scope: this is for *scratch* trees (temp dirs, frame caches, mkdtemp output).
 * It deliberately never runs as a fallback against durable job state, where a
 * half-removed directory is worse than a locked one — refclone keeps its own
 * narrower retry for that (`src/core.mjs`, `replaceStateFile`).
 */

import fs from "node:fs";
import path from "node:path";

/** Retry policy shared by every teardown call site. */
export const REMOVE_MAX_RETRIES = 5;
export const REMOVE_RETRY_DELAY_MS = 150;

/** Errors that mean "something still holds this", not "this cannot be removed". */
const TRANSIENT_CODES = new Set(["EBUSY", "EPERM", "ENOTEMPTY", "EAGAIN", "ETIMEDOUT", "UNKNOWN"]);

export interface RemoveTreeOptions {
  /** Attempts after the first. Default {@link REMOVE_MAX_RETRIES}. */
  maxRetries?: number;
  /** Milliseconds between attempts. Default {@link REMOVE_RETRY_DELAY_MS}. */
  retryDelay?: number;
}

export function isTransientRemoveError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return typeof code === "string" && TRANSIENT_CODES.has(code);
}

/** Block this thread without a timer; teardown hooks are synchronous. */
function sleepSync(ms: number): void {
  if (ms <= 0) return;
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      /* Busy wait: SharedArrayBuffer is unavailable in this host. */
    }
  }
}

function rmOnce(target: string): void {
  fs.rmSync(target, {
    recursive: true,
    force: true,
    maxRetries: REMOVE_MAX_RETRIES,
    retryDelay: REMOVE_RETRY_DELAY_MS,
  });
}

/**
 * Remove a directory tree, tolerating Windows handle locks.
 *
 * `fs.rmSync` retries *file* removals internally, but a *directory* whose handle
 * is still open is refused before that retry loop starts, so a second pass is
 * still needed. The fallback walks depth-first so a locked leaf cannot block the
 * siblings beside it.
 *
 * @returns the number of attempts used (1 means it went cleanly).
 * @throws the last transient error if the budget is exhausted, or any
 *         non-transitive error immediately. `ENOENT` is never an error here.
 */
export function removeTreeSync(target: string, options: RemoveTreeOptions = {}): number {
  const maxRetries = Math.max(0, Math.floor(options.maxRetries ?? REMOVE_MAX_RETRIES));
  const retryDelay = Math.max(0, Math.floor(options.retryDelay ?? REMOVE_RETRY_DELAY_MS));

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      rmOnce(target);
      return attempt + 1;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | null)?.code;
      if (code === "ENOENT") return attempt + 1;
      if (!isTransientRemoveError(error)) throw error;
      // Node's own retry budget is exhausted; sweep the tree manually so an
      // open directory handle does not strand everything under it.
      try {
        removeDepthFirst(target);
        return attempt + 1;
      } catch (walkError) {
        if ((walkError as NodeJS.ErrnoException)?.code === "ENOENT") return attempt + 1;
        if (!isTransientRemoveError(walkError)) throw walkError;
        if (attempt === maxRetries) throw error;
        sleepSync(retryDelay);
      }
    }
  }

  rmOnce(target);
  return maxRetries + 1;
}

/**
 * Best-effort async teardown for `test.after` hooks that are already async and
 * must not block the event loop for the whole retry budget.
 */
export async function removeTree(target: string, options: RemoveTreeOptions = {}): Promise<number> {
  const maxRetries = Math.max(0, Math.floor(options.maxRetries ?? REMOVE_MAX_RETRIES));
  const retryDelay = Math.max(0, Math.floor(options.retryDelay ?? REMOVE_RETRY_DELAY_MS));

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      await fs.promises.rm(target, {
        recursive: true,
        force: true,
        maxRetries: REMOVE_MAX_RETRIES,
        retryDelay: REMOVE_RETRY_DELAY_MS,
      });
      return attempt + 1;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | null)?.code;
      if (code === "ENOENT") return attempt + 1;
      if (!isTransientRemoveError(error)) throw error;
      if (attempt === maxRetries) throw error;
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }
  return maxRetries + 1;
}

/** Leaf-first sweep, so one locked file cannot keep its parent alive. */
function removeDepthFirst(target: string): void {
  if (!fs.existsSync(target)) return;
  const stack: string[] = [target];
  const order: Array<{ path: string; directory: boolean }> = [];
  while (stack.length) {
    const current = stack.pop() as string;
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") continue;
      throw error;
    }
    order.push({ path: current, directory: stat.isDirectory() && !stat.isSymbolicLink() });
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      for (const child of fs.readdirSync(current)) stack.push(path.join(current, child));
    }
  }
  // Reverse of a pre-order walk is a leaf-first walk.
  for (const entry of order.reverse()) {
    try {
      if (entry.directory) fs.rmdirSync(entry.path);
      else fs.unlinkSync(entry.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") continue;
      throw error;
    }
  }
}

/**
 * Tear down a scratch tree without letting teardown failure hide a test result.
 * Use this in `finally` blocks where the body already succeeded.
 */
export function tryRemoveTreeSync(target: string, options: RemoveTreeOptions = {}): boolean {
  try {
    removeTreeSync(target, options);
    return true;
  } catch {
    return false;
  }
}
