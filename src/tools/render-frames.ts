/**
 * Sequence rendering: turn a frame range into numbered PNGs with one bridge
 * call per chunk instead of one per frame.
 *
 * Cavalry's `api.renderPNGFrame` renders the frame the playhead is on, and a
 * chunk that overruns the result deadline does not stop running — the bridge
 * keeps working through the script. So this module does three things the
 * frame-by-frame route cannot: it sizes each chunk against a measured per-frame
 * cost, it treats the files themselves as the progress signal, and when a chunk
 * is cut short it reports the frames that are still pending instead of
 * re-sending work the bridge may already be doing.
 */
import fs from "node:fs";
import path from "node:path";
import { executeMotionScript, type ScriptOutcome } from "../runtime/execute.js";
import { NO_RESULT_MESSAGE, toSceneUri } from "../shared/lib.js";
import { getConfig, type StallionConfig } from "../bridge/stallion.js";
import { defaultPreviewDir, parseFrameList } from "./verify.js";

export interface RenderFramesInput {
  /** `"0-215"`, `"0,10-20:5"`, or an explicit array of frame numbers. */
  frames: string | Array<string | number>;
  /** Output directory for the numbered PNGs. */
  outDir?: string;
  /** File name template; `%0Nd` is replaced by the padded frame number. */
  pattern?: string;
  /** PNG scale percentage passed to `api.renderPNGFrame` (default 100). */
  scale?: number;
  /** Comp to activate for the render (restored afterwards). */
  comp?: string;
  /** Frames per bridge call. Overrides the budget-derived size when set. */
  chunkFrames?: number;
  /** Expected per-frame cost, used to size chunks against the deadline. */
  perFrameMs?: number;
  /** Result deadline for one chunk (default: the configured result timeout). */
  timeoutMs?: number;
  /** POST deadline for one chunk (defaults to `timeoutMs` plus headroom). */
  httpTimeoutMs?: number;
  /** Extra wait for files that arrive after a chunk stops answering. */
  graceMs?: number;
  /** Reuse existing non-empty files instead of re-rendering them (default true). */
  resume?: boolean;
  /** Maximum frames accepted in one call (default 2000). */
  maxFrames?: number;
  /** Progress document path (default `<outDir>/render-progress.json`). */
  progressFile?: string;
}

export interface RenderChunkBudget {
  chunkFrames: number;
  perFrameMs: number;
  timeoutMs: number;
  httpTimeoutMs: number;
  graceMs: number;
  overheadMs: number;
}

export interface NormalizedRenderFrames {
  frames: number[];
  files: Array<{ frame: number; base: string; file: string }>;
  outDir: string;
  pattern: string;
  scale: number;
  comp: string | null;
  budget: RenderChunkBudget;
  resume: boolean;
  progressFile: string;
}

export interface RenderChunkRecord {
  index: number;
  frames: number[];
  status: "rendered" | "partial" | "timed-out" | "error" | "skipped";
  rendered: number[];
  missing: number[];
  durationMs: number;
  error: string | null;
}

export interface RenderFramesResult {
  status: "complete" | "partial" | "failed";
  outDir: string;
  pattern: string;
  scale: number;
  requested: number;
  reused: number[];
  rendered: number[];
  pending: number[];
  missing: Array<{ frame: number; file: string; reason: string }>;
  chunks: RenderChunkRecord[];
  restoredFrame: number | null;
  progressFile: string;
  durationMs: number;
  limitations: string[];
}

export interface RenderFramesOptions {
  config?: StallionConfig;
  execute?: (code: string, budget: { timeoutMs: number; httpTimeoutMs: number }) => Promise<ScriptOutcome>;
  statFile?: (file: string) => number;
  sleep?: (ms: number) => Promise<void>;
  onChunk?: (chunk: RenderChunkRecord) => void;
}

const DEFAULT_PATTERN = "frame-%06d";
const DEFAULT_OVERHEAD_MS = 2_000;
const DEFAULT_PER_FRAME_MS = 900;
const MAX_CHUNK_FRAMES = 40;
const MIN_CHUNK_FRAMES = 1;

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** `~/.cavalry-mcp/previews/frames`, overridable per call or by environment. */
export function defaultFramesDir(): string {
  return process.env.CAVALRY_FRAMES_DIR || path.join(defaultPreviewDir(), "frames");
}

/** Pattern tokens are `%06d`-style; a bare `%d` means no padding. */
function padFrame(value: number, width: number): string {
  const sign = value < 0 ? "-" : "";
  let text = String(Math.abs(Math.round(value)));
  while (text.length < width) text = `0${text}`;
  return `${sign}${text}`;
}

function patternWidth(pattern: string): number | null {
  const token = pattern.match(/%0?(\d*)d/);
  if (!token) return null;
  return token[1] ? Number(token[1]) : 0;
}

/**
 * The file Cavalry will write: it appends `.png` when the path has no extension.
 *
 * `base` is the **scene URI** — the value that crosses the Stallion bridge
 * inside a JSON payload, so it is always forward-slash and therefore byte-stable
 * between a Windows and a Linux runner. `file` is the **disk path** the local
 * `fs` stats afterwards, and keeps native separators. They name the same file;
 * do not substitute one for the other.
 */
export function frameTarget(outDir: string, pattern: string, frame: number): { base: string; file: string } {
  const width = patternWidth(pattern);
  const name = width === null
    ? `${pattern.replace(/[/\\]/g, "")}_${padFrame(frame, 6)}`
    : pattern.replace(/%0?\d*d/, padFrame(frame, width));
  const nativeBase = path.join(outDir, name).replace(/\.[Pp][Nn][Gg]$/, "");
  return { base: toSceneUri(nativeBase), file: `${nativeBase}.png` };
}

/**
 * Largest frame count that still fits the deadline, from the measured cost of
 * one frame. Guessing this number is what turns a render into a timeout: too
 * small is slow, too large loses the whole chunk's result.
 */
export function chunkSizeFor(budget: {
  timeoutMs: number;
  perFrameMs: number;
  overheadMs?: number;
  chunkFrames?: number;
}): number {
  if (budget.chunkFrames !== undefined && Number.isFinite(Number(budget.chunkFrames))) {
    return clampInt(budget.chunkFrames, MIN_CHUNK_FRAMES, MIN_CHUNK_FRAMES, MAX_CHUNK_FRAMES);
  }
  const perFrame = Math.max(50, Number(budget.perFrameMs) || DEFAULT_PER_FRAME_MS);
  const usable = Math.max(0, Number(budget.timeoutMs) - (budget.overheadMs ?? DEFAULT_OVERHEAD_MS));
  return clampInt(Math.floor(usable / perFrame), MIN_CHUNK_FRAMES, MIN_CHUNK_FRAMES, MAX_CHUNK_FRAMES);
}

export function planRenderChunks(frames: number[], chunkFrames: number): number[][] {
  const size = Math.max(1, Math.round(chunkFrames));
  const chunks: number[][] = [];
  for (let index = 0; index < frames.length; index += size) {
    chunks.push(frames.slice(index, index + size));
  }
  return chunks;
}

export function estimateRenderDurationMs(
  frameCount: number,
  budget: { chunkFrames: number; perFrameMs: number; overheadMs?: number },
): number {
  const chunks = Math.ceil(frameCount / Math.max(1, budget.chunkFrames));
  return Math.round(chunks * (budget.chunkFrames * budget.perFrameMs + (budget.overheadMs ?? DEFAULT_OVERHEAD_MS)));
}

function sanitizePattern(pattern: string): string {
  const trimmed = String(pattern || DEFAULT_PATTERN).trim();
  if (!trimmed) return DEFAULT_PATTERN;
  // A path separator would escape the output directory; a bare name is expected.
  const safe = trimmed.replace(/[/\\]/g, "");
  return patternWidth(safe) === null && !/%d/.test(safe) ? `${safe}-%06d` : safe;
}

export function normalizeRenderFrames(
  input: RenderFramesInput,
  config: StallionConfig = getConfig(),
): NormalizedRenderFrames {
  if (!input || typeof input !== "object") throw new Error("Render options must be an object");
  const maxFrames = clampInt(input.maxFrames, 2_000, 1, 20_000);
  const frames = parseFrameList(input.frames, maxFrames, "render_frames");
  const pattern = sanitizePattern(input.pattern ?? DEFAULT_PATTERN);
  const outDir = path.resolve(input.outDir || defaultFramesDir());
  const requestedTimeoutMs = clampInt(input.timeoutMs, config.resultTimeoutMs, 1_000, 1_800_000);
  const perFrameMs = clampInt(input.perFrameMs, DEFAULT_PER_FRAME_MS, 50, 60_000);
  const chunkFrames = chunkSizeFor({ timeoutMs: requestedTimeoutMs, perFrameMs, chunkFrames: input.chunkFrames });
  // An explicit `chunkFrames` is a request, not a hint: honouring it against a
  // 5 s deadline would guarantee a timeout, so the deadline grows to cover the
  // chunk instead. (A derived size already fits by construction.)
  const timeoutMs = Math.min(
    1_800_000,
    Math.max(requestedTimeoutMs, chunkFrames * perFrameMs + DEFAULT_OVERHEAD_MS),
  );
  const httpTimeoutMs = clampInt(
    input.httpTimeoutMs,
    Math.min(1_800_000, timeoutMs + Math.max(5_000, chunkFrames * perFrameMs)),
    1_000,
    3_600_000,
  );
  const comp = typeof input.comp === "string" && input.comp.trim() ? input.comp.trim() : null;
  return {
    frames,
    files: frames.map(frame => {
      const target = frameTarget(outDir, pattern, frame);
      return { frame, ...target };
    }),
    outDir,
    pattern,
    scale: clampInt(input.scale, 100, 1, 400),
    comp,
    budget: {
      chunkFrames,
      perFrameMs,
      timeoutMs,
      httpTimeoutMs,
      graceMs: clampInt(input.graceMs, 20_000, 0, 600_000),
      overheadMs: DEFAULT_OVERHEAD_MS,
    },
    resume: input.resume !== false,
    progressFile: path.resolve(input.progressFile ?? path.join(outDir, "render-progress.json")),
  };
}

/** One atomic script: render this chunk's frames, then restore playhead and comp. */
export function buildRenderChunkScript(
  options: Pick<NormalizedRenderFrames, "scale" | "comp">,
  entries: Array<{ frame: number; base: string }>,
): string {
  const payload = { scale: options.scale, comp: options.comp, entries };
  return `const __render = ${JSON.stringify(payload)};
const __read = (fn) => { try { return fn(); } catch (e) { return null; }; };
const __num = (value, fallback) => { const n = Number(value); return isFinite(n) ? n : fallback; };
const __prevComp = __read(() => api.getActiveComp());
if (__render.comp) api.setActiveComp(__render.comp);
const __prevFrame = __num(__read(() => api.getFrame()), 0);
const __files = [];
const __failed = [];
try {
  for (let i = 0; i < __render.entries.length; i++) {
    const entry = __render.entries[i];
    try {
      api.setFrame(entry.frame);
      api.renderPNGFrame(entry.base, __render.scale);
      __files.push({ frame: entry.frame, base: entry.base });
    } catch (err) {
      __failed.push({ frame: entry.frame, error: String(err && err.message ? err.message : err) });
    }
  }
} finally {
  try { api.setFrame(__prevFrame); } catch (e) {}
  if (__render.comp && __prevComp) { try { api.setActiveComp(__prevComp); } catch (e) {} }
}
__result = { restoredFrame: __prevFrame, rendered: __files, failed: __failed };`;
}

interface ChunkManifest {
  restoredFrame: number | null;
  rendered: number[];
  failed: Array<{ frame: number; error: string }>;
}

function parseChunkManifest(text: string): ChunkManifest | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const raw = parsed as Record<string, unknown>;
  const entries = Array.isArray(raw.rendered) ? raw.rendered : [];
  const rendered: number[] = [];
  for (const entry of entries) {
    const frame = entry && typeof entry === "object" ? Number((entry as Record<string, unknown>).frame) : NaN;
    if (Number.isFinite(frame)) rendered.push(frame);
  }
  const failed = Array.isArray(raw.failed)
    ? raw.failed.map(entry => {
        const item = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
        return { frame: Number(item.frame), error: typeof item.error === "string" ? item.error : "render error" };
      })
    : [];
  return {
    restoredFrame: Number.isFinite(Number(raw.restoredFrame)) ? Number(raw.restoredFrame) : null,
    rendered,
    failed,
  };
}

function isTimeoutText(text: string): boolean {
  return text.includes(NO_RESULT_MESSAGE) || /Timed out after/i.test(text);
}

function sizeOf(statFile: (file: string) => number, file: string): number {
  try {
    return statFile(file);
  } catch {
    return 0;
  }
}

async function pollForFiles(
  files: string[],
  graceMs: number,
  statFile: (file: string) => number,
  sleep: (ms: number) => Promise<void>,
): Promise<Set<string>> {
  const present = new Set<string>();
  for (const file of files) {
    if (sizeOf(statFile, file) > 0) present.add(file);
  }
  if (present.size === files.length || graceMs <= 0) return present;
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline && present.size < files.length) {
    await sleep(Math.min(250, Math.max(10, deadline - Date.now())));
    for (const file of files) {
      if (present.has(file)) continue;
      if (sizeOf(statFile, file) > 0) present.add(file);
    }
  }
  return present;
}

export function renderProgressSchema(): string {
  return "cavalry-mcp/render-progress@1";
}

function writeProgress(
  progressFile: string,
  document: Record<string, unknown>,
): void {
  try {
    fs.mkdirSync(path.dirname(progressFile), { recursive: true });
    fs.writeFileSync(progressFile, JSON.stringify(document, null, 2));
  } catch {
    // Progress is diagnostic; a read-only target must not abort a live render.
  }
}

/**
 * Render a frame sequence in chunks. Every chunk restores the playhead and the
 * active comp, and the progress document is rewritten after each one, so an
 * interrupted run leaves a usable resume list rather than a silent stall.
 */
export async function runRenderFrames(
  input: RenderFramesInput,
  opts: RenderFramesOptions = {},
): Promise<RenderFramesResult> {
  const config = opts.config ?? getConfig();
  const normalized = normalizeRenderFrames(input, config);
  const statFile = opts.statFile ?? ((file: string) => (fs.existsSync(file) ? fs.statSync(file).size : 0));
  const sleep = opts.sleep ?? ((ms: number) => new Promise(resolve => setTimeout(resolve, ms)));
  const execute = opts.execute ?? ((code: string, budget: { timeoutMs: number; httpTimeoutMs: number }) =>
    executeMotionScript(code, config, { helpers: false, timeoutMs: budget.timeoutMs, httpTimeoutMs: budget.httpTimeoutMs }));

  fs.mkdirSync(normalized.outDir, { recursive: true });
  const startedAt = Date.now();
  const reused: number[] = [];
  const todo: Array<{ frame: number; base: string; file: string }> = [];
  for (const entry of normalized.files) {
    if (normalized.resume && sizeOf(statFile, entry.file) > 0) {
      reused.push(entry.frame);
      continue;
    }
    todo.push(entry);
  }

  const rendered: number[] = [...reused];
  const missing: RenderFramesResult["missing"] = [];
  const chunks: RenderChunkRecord[] = [];
  const byFrame = new Map(todo.map(entry => [entry.frame, entry]));
  let pending: number[] = todo.map(entry => entry.frame);
  let restoredFrame: number | null = null;
  let status: RenderFramesResult["status"] = "complete";
  const timedOutChunks: number[] = [];
  const erroredChunks: number[] = [];

  const progress = (state: RenderFramesResult["status"], chunkList: number[]): RenderFramesResult => ({
    status: state,
    outDir: normalized.outDir,
    pattern: normalized.pattern,
    scale: normalized.scale,
    requested: normalized.frames.length,
    reused,
    rendered: rendered.filter(frame => !reused.includes(frame)),
    pending: chunkList,
    missing,
    chunks,
    restoredFrame,
    progressFile: normalized.progressFile,
    durationMs: Date.now() - startedAt,
    limitations: [],
  });

  if (todo.length === 0) {
    writeProgress(normalized.progressFile, {
      schema: renderProgressSchema(),
      startedAt: new Date(startedAt).toISOString(),
      updatedAt: new Date().toISOString(),
      status: "complete",
      outDir: normalized.outDir,
      pattern: normalized.pattern,
      scale: normalized.scale,
      requested: normalized.frames.length,
      completed: normalized.frames,
      pending: [],
      chunks: 0,
    });
    return { ...progress("complete", []), limitations: reusedLimitations(reused.length) };
  }

  const plan = planRenderChunks(todo.map(entry => entry.frame), normalized.budget.chunkFrames);
  for (const [index, chunk] of plan.entries()) {
    const entries = chunk.map(frame => byFrame.get(frame)!);
    const chunkStarted = Date.now();
    const outcome = await execute(
      buildRenderChunkScript({ scale: normalized.scale, comp: normalized.comp }, entries.map(e => ({ frame: e.frame, base: e.base }))),
      { timeoutMs: normalized.budget.timeoutMs, httpTimeoutMs: normalized.budget.httpTimeoutMs },
    );
    const manifest = outcome.ok ? parseChunkManifest(outcome.text) : null;
    const reported = manifest?.rendered ?? [];
    const present = await pollForFiles(
      entries.map(entry => entry.file),
      isTimeoutText(outcome.text) ? normalized.budget.graceMs : 0,
      statFile,
      sleep,
    );
    const chunkRendered: number[] = [];
    const chunkMissing: number[] = [];
    for (const entry of entries) {
      const onDisk = present.has(entry.file) || reported.includes(entry.frame);
      if (onDisk && sizeOf(statFile, entry.file) > 0) {
        chunkRendered.push(entry.frame);
        rendered.push(entry.frame);
      } else {
        chunkMissing.push(entry.frame);
        missing.push({
          frame: entry.frame,
          file: entry.file,
          reason: outcome.ok ? (manifest ? "not reported and not on disk" : "unparsable chunk manifest") : "chunk did not answer",
        });
      }
    }
    restoredFrame = manifest?.restoredFrame ?? restoredFrame;
    let chunkStatus: RenderChunkRecord["status"] = "rendered";
    if (!outcome.ok) {
      chunkStatus = chunkRendered.length ? "partial" : isTimeoutText(outcome.text) ? "timed-out" : "error";
    } else if (chunkMissing.length) {
      chunkStatus = chunkRendered.length ? "partial" : "error";
    }
    const record: RenderChunkRecord = {
      index,
      frames: chunk,
      status: chunkStatus,
      rendered: chunkRendered,
      missing: chunkMissing,
      durationMs: Date.now() - chunkStarted,
      error: outcome.ok ? (manifest ? null : "unparsable chunk manifest") : outcome.text,
    };
    chunks.push(record);
    opts.onChunk?.(record);
    if (chunkStatus === "timed-out" || chunkStatus === "error") {
      if (chunkStatus === "timed-out") timedOutChunks.push(index);
      else erroredChunks.push(index);
    }
    const remaining = plan.slice(index + 1).flat().concat(chunkMissing);
    pending = remaining.sort((a, b) => a - b);
    writeProgress(normalized.progressFile, {
      schema: renderProgressSchema(),
      startedAt: new Date(startedAt).toISOString(),
      updatedAt: new Date().toISOString(),
      status: pending.length ? "partial" : "complete",
      outDir: normalized.outDir,
      pattern: normalized.pattern,
      scale: normalized.scale,
      budget: normalized.budget,
      requested: normalized.frames.length,
      completed: normalized.frames.filter(frame => !pending.includes(frame)),
      pending,
      chunks: chunks.map(chunkRecord => ({
        index: chunkRecord.index,
        status: chunkRecord.status,
        frames: chunkRecord.frames.length,
        rendered: chunkRecord.rendered.length,
        missing: chunkRecord.missing.length,
        durationMs: chunkRecord.durationMs,
      })),
    });
    // A chunk that stopped answering may still be running in Cavalry. Sending
    // the next one would queue behind it and double the apparent stall.
    if (chunkStatus === "timed-out" || chunkStatus === "error") {
      status = "partial";
      break;
    }
  }

  const fresh = rendered.filter(frame => !reused.includes(frame));
  status = pending.length === 0
    ? "complete"
    : fresh.length === 0
      ? (erroredChunks.length || timedOutChunks.length ? "failed" : "partial")
      : "partial";
  const limitations = buildLimitations({
    reusedCount: reused.length,
    timedOut: timedOutChunks.length,
    errored: erroredChunks.length,
    pendingCount: pending.length,
    budget: normalized.budget,
  });
  return { ...progress(status, pending), status, limitations };
}

function reusedLimitations(count: number): string[] {
  return count ? [`${count} frame(s) already on disk were reused; delete them or pass resume:false to re-render.`] : [];
}

function buildLimitations(context: {
  reusedCount: number;
  timedOut: number;
  errored: number;
  pendingCount: number;
  budget: RenderChunkBudget;
}): string[] {
  const notes: string[] = [];
  if (context.reusedCount) {
    notes.push(`${context.reusedCount} frame(s) already on disk were reused; delete them or pass resume:false to re-render.`);
  }
  if (context.timedOut) {
    notes.push(
      `A chunk stopped answering before its deadline; the bridge may still be rendering it, so the run stopped rather than re-sending the same frames. Raise perFrameMs, lower chunkFrames, or rerun to resume the pending list.`,
    );
  }
  if (context.errored) {
    notes.push("A chunk returned an error; its frames are listed as pending and the run stopped before the next chunk.");
  }
  if (context.pendingCount) {
    notes.push(`${context.pendingCount} frame(s) remain pending; the progress document lists them for a resume run.`);
  }
  notes.push(
    `Chunk size ${context.budget.chunkFrames} frame(s) at ${context.budget.perFrameMs} ms per frame against a ${context.budget.timeoutMs} ms deadline is an estimate, not a measurement of this scene.`,
  );
  return notes;
}

/** Compact single-line summary for CLI stderr. */
export function formatRenderSummary(result: RenderFramesResult): string {
  const fresh = result.rendered.length;
  return [
    result.status,
    `${fresh} rendered`,
    result.reused.length ? `${result.reused.length} reused` : null,
    result.pending.length ? `${result.pending.length} pending` : null,
    result.chunks.length ? `${result.chunks.length} chunk(s)` : null,
    `-> ${result.outDir}`,
  ].filter(Boolean).join(" | ");
}
