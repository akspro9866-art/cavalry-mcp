/**
 * Stallion bridge client — sends JavaScript to Cavalry via HTTP POST.
 *
 * Cavalry must have the Stallion script running (Scripts > Stallion).
 * The server listens on 127.0.0.1:8080 by default (hardcoded upstream,
 * nothing configurable — verified against the Stallion repo).
 *
 * Readback: Stallion's /post only ever returns a fixed ack body (upstream
 * has no support for response payloads), so tool scripts write their result
 * to a JSON file via api.writeToFile(path, json, true) and the node side
 * waits for that file, matched by a per-call UUID in the `seq` field.
 *
 * Cavalry executes scripts on a single JS thread, so all bridge traffic is
 * serialized through an internal queue — concurrent tool calls can never
 * interleave their result-file writes.
 *
 * Configuration via environment variables (all optional):
 *   CAVALRY_HOST              Stallion host   (default 127.0.0.1)
 *   CAVALRY_PORT              Stallion port   (default 8080)
 *   CAVALRY_HTTP_TIMEOUT_MS   HTTP ack timeout (default 10000)
 *   CAVALRY_RESULT_TIMEOUT_MS How long to wait for the result file
 *                            (default 120000 — long enough for renders)
 *   CAVALRY_TIMEOUT_MS        Legacy fallback that sets both timeouts
 *   CAVALRY_RESULT_PATH       Where tool scripts write their JSON result
 *                            (default <os tmpdir>/cavalry-mcp-result-<pid>.json,
 *                            per-process so multiple MCP clients don't
 *                            clobber each other's results)
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface StallionPayload {
  /** Script category: "script" for JS Editor scripts */
  type: "script" | "javaScriptShape" | "skslShader" | "renderSetupExpression";
  /** The JavaScript code to execute */
  code: string;
  /** Optional file path (used for UI scripts) */
  path?: string;
}

export interface StallionConfig {
  host: string;
  port: number;
  httpTimeoutMs: number;
  resultTimeoutMs: number;
  resultPath: string;
}

function intEnv(name: string, fallback: number): number {
  const v = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function loadConfig(): StallionConfig {
  const host = process.env.CAVALRY_HOST ?? "127.0.0.1";
  const port = Number.parseInt(process.env.CAVALRY_PORT ?? "8080", 10);
  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 8080,
    httpTimeoutMs: intEnv("CAVALRY_HTTP_TIMEOUT_MS", intEnv("CAVALRY_TIMEOUT_MS", 10000)),
    resultTimeoutMs: intEnv("CAVALRY_RESULT_TIMEOUT_MS", intEnv("CAVALRY_TIMEOUT_MS", 120000)),
    resultPath:
      process.env.CAVALRY_RESULT_PATH ??
      path.join(os.tmpdir(), `cavalry-mcp-result-${process.pid}.json`),
  };
}

const CONFIG: StallionConfig = loadConfig();

export function getConfig(): StallionConfig {
  return CONFIG;
}

/**
 * Serialize async tasks head-of-line. Cavalry runs scripts on one thread and
 * every call shares one result file, so bridge calls must not overlap.
 */
let queueTail: Promise<unknown> = Promise.resolve();
export function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = queueTail.then(fn, fn);
  queueTail = run.catch(() => undefined);
  return run;
}

/**
 * Send a script to Cavalry via Stallion's HTTP bridge.
 * Returns the raw response text from Stallion (a fixed ack; use
 * runScriptWithResult for calls that need data back).
 */
export async function sendToCavalry(
  code: string,
  type: StallionPayload["type"] = "script",
  config: StallionConfig = CONFIG,
): Promise<string> {
  const url = `http://${config.host}:${config.port}/post`;
  const payload: StallionPayload = { type, code };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.httpTimeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `Stallion returned ${response.status}: ${await response.text()}`,
      );
    }

    return response.text();
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `Timed out after ${config.httpTimeoutMs} ms waiting for Stallion to acknowledge the script. Increase CAVALRY_HTTP_TIMEOUT_MS if this happens often.`,
      );
    }
    const code =
      (err as NodeJS.ErrnoException | undefined)?.code ??
      ((err as { cause?: NodeJS.ErrnoException } | undefined)?.cause?.code);
    if (code === "ECONNREFUSED" || code === "ENOTFOUND") {
      throw new Error(
        `Cannot reach Stallion at ${url}. Make sure Cavalry is running and the Stallion script is active (Scripts > Stallion).`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/** Read the result file and return it only if its seq matches this call. */
function readMatch(resultPath: string, seq: string): string | null {
  let txt: string;
  try {
    txt = fs.readFileSync(resultPath, "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(txt) as { seq?: string };
    return parsed && parsed.seq === seq ? txt : null;
  } catch {
    return null; // torn/partial write — keep waiting
  }
}

/**
 * Wait (near-instantly, via fs.watch with a polling backstop) for the result
 * file to contain our seq. Resolves "" on timeout.
 */
function waitForResult(resultPath: string, seq: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve) => {
    const immediate = readMatch(resultPath, seq);
    if (immediate !== null) {
      resolve(immediate);
      return;
    }
    let done = false;
    let watcher: fs.FSWatcher | null = null;
    const finish = (v: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearInterval(poll);
      watcher?.close();
      resolve(v ?? "");
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    const poll = setInterval(() => {
      const m = readMatch(resultPath, seq);
      if (m !== null) finish(m);
    }, 200);
    try {
      const dir = path.dirname(resultPath);
      const base = path.basename(resultPath);
      watcher = fs.watch(dir, (_event, filename) => {
        if (filename && path.basename(filename.toString()) === base) {
          const m = readMatch(resultPath, seq);
          if (m !== null) finish(m);
        }
      });
      watcher.on("error", () => {
        /* fall back to interval polling */
      });
    } catch {
      /* directory may not exist yet; interval polling covers it */
    }
  });
}

/**
 * Run a script and return the JSON string the script wrote via
 * api.writeToFile ("" if no result appeared before the timeout).
 *
 * The script is wrapped so that:
 *   - a thrown error is captured into __out.error instead of being lost
 *   - a variable named __result (if assigned) is returned as __out.result
 *   - the result JSON is written to a known file tagged with a unique seq
 *   - if that write fails, a minimal payload is retried so the failure
 *     reason still reaches the node side (writeFailed)
 *
 * Calls are serialized through the bridge queue.
 */
export async function runScriptWithResult(
  code: string,
  config: StallionConfig = CONFIG,
  opts?: { timeoutMs?: number },
): Promise<string> {
  const seq = randomUUID();
  const resultPathLiteral = JSON.stringify(config.resultPath);
  const wrapped = `(function() {
var __out = { ok: true, seq: ${JSON.stringify(seq)} };
try {
${code}
} catch (e) { __out.ok = false; __out.error = String(e && e.message ? e.message : e); }
try { if (typeof __result !== "undefined") { __out.result = __result; } } catch (e3) {}
try { api.writeToFile(${resultPathLiteral}, JSON.stringify(__out), true); }
catch (e2) {
  try { api.writeToFile(${resultPathLiteral}, JSON.stringify({ ok: false, seq: ${JSON.stringify(seq)}, writeFailed: String(e2) }), true); }
  catch (e4) {}
}
})()`;

  return enqueue(async () => {
    await sendToCavalry(wrapped, "script", config);
    return waitForResult(
      config.resultPath,
      seq,
      opts?.timeoutMs ?? config.resultTimeoutMs,
    );
  });
}

/**
 * Check if Stallion is reachable in Cavalry. Not queued: this must answer
 * quickly even while another call is mid-flight.
 */
export async function pingStallion(
  config: StallionConfig = CONFIG,
): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    await fetch(`http://${config.host}:${config.port}/`, {
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
