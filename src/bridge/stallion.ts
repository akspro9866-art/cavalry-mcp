/** Abortable, serialized client for Stallion's native and legacy protocols. */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ATOMIC_SCRIPT_MARKER, wrapAtomicScript, wrapLegacyResult } from "../runtime/atomic.js";
import {
  defaultStatePath,
  ensureStateDir,
  readExecutionState,
  stateFromEnvelope,
  type ExecutionState,
} from "../shared/state.js";

export const EXPRESSION_PAYLOAD_TYPES = [
  "javaScriptShape",
  "javaScriptUtility",
  "javaScriptModifier",
  "javaScriptDeformer",
  "javaScriptEmitter",
  "skslShader",
  "skslFilter",
  "preRenderExpression",
  "postRenderExpression",
] as const;

export type ExpressionPayloadType = (typeof EXPRESSION_PAYLOAD_TYPES)[number];

export const CAVALRY_EXECUTION_CONTEXTS = [
  "script",
  "plugin",
  "render",
  "shape",
  "utility",
  "deformer",
  "emitter",
  "modifier",
] as const;

export type CavalryExecutionContext = (typeof CAVALRY_EXECUTION_CONTEXTS)[number];

export const CONTEXT_GLOBALS_BY_CONTEXT: Record<CavalryExecutionContext, readonly string[]> = {
  script: ["console", "api", "cavalry", "ui"],
  plugin: ["console", "api", "ctx", "cavalry", "ui", "plugin", "install"],
  render: ["console", "api", "render"],
  shape: ["console", "ctx", "cavalry"],
  utility: ["console", "ctx", "cavalry"],
  deformer: ["console", "ctx", "cavalry", "def"],
  emitter: ["console", "ctx", "cavalry"],
  modifier: ["console", "ctx", "cavalry"],
};

export interface ConsoleDiagnosticEntry {
  level: string;
  text: string;
}

export interface ContextValidationResult {
  valid: boolean;
  context: CavalryExecutionContext;
  allowedGlobals: string[];
  forbiddenUsages: string[];
  diagnostics: ConsoleDiagnosticEntry[];
}

export interface SkslValidationResult {
  valid: boolean;
  uniforms: Array<{ type: string; name: string }>;
  errors: string[];
  warnings: string[];
  diagnostics: ConsoleDiagnosticEntry[];
}

export interface ExpressionReceipt {
  sceneStateHash?: string | null;
  consoleDiagnostics: ConsoleDiagnosticEntry[];
  jsLogDiagnostics: ConsoleDiagnosticEntry[];
  beatBBoxes?: Record<string, unknown>;
  payloadType: ExpressionPayloadType | string;
  context: CavalryExecutionContext;
  applied: string[];
  skipped: string[];
  valid: boolean;
  uniforms?: Array<{ type: string; name: string }>;
}

export interface ExpressionExecutionResult {
  ok: boolean;
  seq: string;
  raw: string;
  applied: string[];
  skipped: string[];
  receipt: ExpressionReceipt;
  error?: string;
}

export function isExpressionPayloadType(type: unknown): type is ExpressionPayloadType {
  return typeof type === "string" && (EXPRESSION_PAYLOAD_TYPES as readonly string[]).includes(type);
}

export function payloadTypeToExecutionContext(type: string): CavalryExecutionContext {
  switch (type) {
    case "javaScriptShape":
      return "shape";
    case "javaScriptUtility":
      return "utility";
    case "javaScriptModifier":
      return "modifier";
    case "javaScriptDeformer":
      return "deformer";
    case "javaScriptEmitter":
      return "emitter";
    case "preRenderExpression":
    case "postRenderExpression":
    case "renderSetupExpression":
    case "render":
      return "render";
    case "plugin":
      return "plugin";
    case "shape":
    case "utility":
    case "deformer":
    case "emitter":
    case "modifier":
      return type;
    default:
      return "script";
  }
}

export function validateCavalryContextUsage(code: string, contextOrPayloadType: string): ContextValidationResult {
  const context = payloadTypeToExecutionContext(contextOrPayloadType);
  const allowed = new Set(CONTEXT_GLOBALS_BY_CONTEXT[context]);
  const allNamespaces = ["api", "cavalry", "ctx", "def", "ui", "plugin", "install", "render"];
  const stripped = String(code ?? "")
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, " ")
    .replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '""');
  const forbiddenUsages: string[] = [];
  const diagnostics: ConsoleDiagnosticEntry[] = [];
  for (const ns of allNamespaces) {
    if (allowed.has(ns)) continue;
    const pattern = new RegExp(`\\b${ns}\\s*\\.\\s*([A-Za-z_]\\w*)`, "g");
    for (const match of stripped.matchAll(pattern)) {
      const usage = `${ns}.${match[1]}`;
      if (!forbiddenUsages.includes(usage)) {
        forbiddenUsages.push(usage);
        diagnostics.push({
          level: "error",
          text: `Context '${context}' (${contextOrPayloadType}) does not expose '${ns}' (found '${usage}'). Allowed globals: ${[...allowed].join(", ")}`,
        });
      }
    }
  }
  return {
    valid: forbiddenUsages.length === 0,
    context,
    allowedGlobals: [...allowed],
    forbiddenUsages,
    diagnostics,
  };
}

export function validateSkslSource(code: string): SkslValidationResult {
  const src = String(code ?? "").trim();
  const errors: string[] = [];
  const warnings: string[] = [];
  const uniforms: Array<{ type: string; name: string }> = [];

  if (!src) {
    errors.push("SkSL source is empty");
  } else {
    let depth = 0;
    for (const ch of src) {
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      if (depth < 0) break;
    }
    if (depth !== 0) {
      errors.push("SkSL syntax error: unbalanced braces `{}`");
    }
    if (!/\b(?:half4|vec4|float4)\s+main\s*\(/.test(src)) {
      errors.push("SkSL shader must define a `half4 main(float2 fragCoord)` or `vec4 main(vec2 coord)` entry point");
    }
    if (/\bgl_FragColor\b/.test(src)) {
      warnings.push("SkSL uses return value from `main(float2 fragCoord)` instead of legacy GLSL `gl_FragColor`");
    }
    for (const match of src.matchAll(/\buniform\s+(float|int|bool|half\d*|vec\d+|float\d+|mat\d+|shader)\s+([A-Za-z_]\w*)\s*;/g)) {
      uniforms.push({ type: match[1], name: match[2] });
    }
  }

  const diagnostics: ConsoleDiagnosticEntry[] = [
    ...errors.map((e) => ({ level: "error", text: e })),
    ...warnings.map((w) => ({ level: "warn", text: w })),
  ];
  return {
    valid: errors.length === 0,
    uniforms,
    errors,
    warnings,
    diagnostics,
  };
}

export function captureJsLogDiagnostics(logPathOrText?: string | null): ConsoleDiagnosticEntry[] {
  if (!logPathOrText) return [];
  let raw = String(logPathOrText);
  if (!raw.includes("\n") && (raw.endsWith(".txt") || raw.endsWith(".log") || raw.includes("/") || raw.includes("\\"))) {
    try {
      if (fs.existsSync(raw)) {
        raw = fs.readFileSync(raw, "utf8");
      } else {
        return [];
      }
    } catch {
      return [];
    }
  }
  const entries: ConsoleDiagnosticEntry[] = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const bracketMatch = /^\[(ERROR|WARN|WARNING|INFO|LOG)\]\s*(.*)$/i.exec(line);
    if (bracketMatch) {
      const tag = bracketMatch[1].toLowerCase();
      const level = tag === "warning" ? "warn" : tag;
      entries.push({ level, text: bracketMatch[2].slice(0, 240) });
      continue;
    }
    if (/\b(ReferenceError|TypeError|SyntaxError|Error|error)\b/.test(line)) {
      entries.push({ level: "error", text: line.slice(0, 240) });
    } else if (/\b(warn|warning|Skipped layer|unknown attribute)\b/i.test(line)) {
      entries.push({ level: "warn", text: line.slice(0, 240) });
    } else {
      entries.push({ level: "info", text: line.slice(0, 240) });
    }
  }
  return entries.slice(-64);
}

export interface StallionPayload {
  type: "script" | ExpressionPayloadType | "renderSetupExpression";
  code: string;
  path?: string;
  seq?: string;
  statePath?: string;
  targetId?: string;
  layerId?: string;
  attachTo?: string;
  beatFrames?: number[];
}

export interface StallionConfig {
  url: string;
  host: string;
  port: number;
  token: string;
  httpTimeoutMs: number;
  resultTimeoutMs: number;
  resultPath: string;
  statePath?: string;
}

function intEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function loadConfig(): StallionConfig {
  const legacyHost = process.env.CAVALRY_HOST ?? "127.0.0.1";
  const legacyPort = Number.parseInt(process.env.CAVALRY_PORT ?? "8080", 10);
  const port = Number.isFinite(legacyPort) && legacyPort > 0 ? legacyPort : 8080;
  const rawUrl = process.env.STALLION_URL || `http://${legacyHost}:${port}`;
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("STALLION_URL must use http or https");
  }
  return {
    url: rawUrl.replace(/\/$/, ""),
    host: parsed.hostname,
    port: Number(parsed.port) || (parsed.protocol === "https:" ? 443 : 80),
    token: process.env.STALLION_TOKEN ?? "",
    httpTimeoutMs: intEnv("CAVALRY_HTTP_TIMEOUT_MS", intEnv("CAVALRY_TIMEOUT_MS", 5000)),
    resultTimeoutMs: intEnv("CAVALRY_RESULT_TIMEOUT_MS", intEnv("CAVALRY_TIMEOUT_MS", 5000)),
    resultPath: process.env.CAVALRY_RESULT_PATH ?? path.join(os.tmpdir(), `cavalry-mcp-result-${process.pid}.json`),
    statePath: defaultStatePath(),
  };
}

const CONFIG = loadConfig();
export function getConfig(): StallionConfig {
  return CONFIG;
}

let queueTail: Promise<unknown> = Promise.resolve();
export function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = queueTail.then(fn, fn);
  queueTail = run.catch(() => undefined);
  return run;
}

function headers(config: StallionConfig): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
  };
}

async function fetchWithTimeout(
  url: string,
  config: StallionConfig,
  init: RequestInit = {},
  timeoutMs?: number,
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { ...headers(config), ...init.headers },
    signal: AbortSignal.timeout(timeoutMs ?? config.httpTimeoutMs),
  });
}

function connectionError(err: unknown, url: string, timeoutMs: number): Error {
  if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
    return new Error(`Timed out after ${timeoutMs} ms waiting for Stallion at ${url}.`);
  }
  const code = (err as NodeJS.ErrnoException | undefined)?.code ??
    (err as { cause?: NodeJS.ErrnoException } | undefined)?.cause?.code;
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return new Error(`Cannot reach Stallion at ${url}. Start Cavalry and run Scripts > Stallion.`);
  }
  return err instanceof Error ? err : new Error(String(err));
}

async function post(
  code: string,
  type: StallionPayload["type"],
  config: StallionConfig,
  seq?: string,
  statePath?: string,
  httpTimeoutMs?: number,
): Promise<string> {
  const url = `${config.url}/post`;
  const budget = httpTimeoutMs ?? config.httpTimeoutMs;
  try {
    const response = await fetchWithTimeout(
      url,
      config,
      {
        method: "POST",
        body: JSON.stringify({
          type,
          code,
          ...(seq ? { seq } : {}),
          ...(statePath ? { statePath } : {}),
        } satisfies StallionPayload),
      },
      budget,
    );
    if (!response.ok) throw new Error(`Stallion returned ${response.status}: ${await response.text()}`);
    return response.text();
  } catch (err) {
    throw connectionError(err, url, budget);
  }
}

/** Fire-and-forget compatibility API; scripts are still isolated and atomic. */
export async function sendToCavalry(
  code: string,
  type: StallionPayload["type"] = "script",
  config: StallionConfig = CONFIG,
): Promise<string> {
  const wrapped = type === "script" && !code.startsWith(ATOMIC_SCRIPT_MARKER)
    ? wrapAtomicScript(code)
    : code;
  return post(wrapped, type, config);
}

export interface ScriptExecution {
  raw: string;
  seq: string;
  statePath: string;
  state: ExecutionState | null;
}

const nativeSupport = new Map<string, boolean>();
async function supportsNativeResults(config: StallionConfig): Promise<boolean> {
  const key = `${config.url}|${config.token}`;
  const cached = nativeSupport.get(key);
  if (cached !== undefined) return cached;
  let supported = false;
  try {
    const response = await fetchWithTimeout(`${config.url}/get`, config);
    if (response.ok) {
      const body = await response.json() as { kind?: string; type?: string };
      supported = body.kind === "status" || body.type === "__stallion_result__" || body.kind === "result";
    }
  } catch {
    // Older Stallion has no /get; use its result-file protocol.
  }
  nativeSupport.set(key, supported);
  return supported;
}

function readFileMatch(resultPath: string, seq: string): string | null {
  try {
    const text = fs.readFileSync(resultPath, "utf8");
    const parsed = JSON.parse(text) as { seq?: string };
    return parsed.seq === seq ? text : null;
  } catch {
    return null;
  }
}

async function waitForFile(resultPath: string, seq: string, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = readFileMatch(resultPath, seq);
    if (match) return match;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return readFileMatch(resultPath, seq) ?? "";
}

async function waitForNative(config: StallionConfig, seq: string, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetchWithTimeout(`${config.url}/get`, config);
      if (response.ok) {
        const text = await response.text();
        const parsed = JSON.parse(text) as { seq?: string; kind?: string };
        if (parsed.kind === "result" && parsed.seq === seq) return text;
      }
    } catch {
      // A render or modal can delay one poll; the overall deadline remains bounded.
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  return "";
}

/**
 * Execute one script and read the telemetry snapshot the wrapper writes after
 * the Undo group closes. The result channel is awaited first, then the state
 * file is read (or the envelope fallback is used) so callers get both in one
 * round trip.
 */
export async function runScriptWithExecution(
  code: string,
  config: StallionConfig = CONFIG,
  opts?: { timeoutMs?: number; httpTimeoutMs?: number; helpers?: boolean; statePath?: string },
): Promise<ScriptExecution> {
  const seq = randomUUID();
  const statePath = opts?.statePath
    ?? config.statePath
    ?? process.env.CAVALRY_STATE_PATH
    ?? defaultStatePath();
  try {
    ensureStateDir(statePath);
  } catch {
    // A read-only home should not stop the script; telemetry just stays null.
  }
  const atomic = wrapAtomicScript(code, opts?.helpers ?? false, { seq, statePath });
  const raw = await enqueue(async () => {
    const native = await supportsNativeResults(config);
    if (native) {
      await post(atomic, "script", config, seq, statePath, opts?.httpTimeoutMs);
      return waitForNative(config, seq, opts?.timeoutMs ?? config.resultTimeoutMs);
    }
    await post(wrapLegacyResult(atomic, seq, config.resultPath), "script", config, seq, statePath, opts?.httpTimeoutMs);
    return waitForFile(config.resultPath, seq, opts?.timeoutMs ?? config.resultTimeoutMs);
  });
  const state = readExecutionState(statePath, seq) ?? stateFromEnvelope(raw, seq);
  return { raw, seq, statePath, state };
}

export async function runScriptWithResult(
  code: string,
  config: StallionConfig = CONFIG,
  opts?: { timeoutMs?: number; httpTimeoutMs?: number; helpers?: boolean; statePath?: string },
): Promise<string> {
  return (await runScriptWithExecution(code, config, opts)).raw;
}

/** Batch-step request — mirrors the bridge contract in stallion's BatchStep.ts. */
export interface BatchStepRequest {
  script?: string;
  /** Declarative `_mg` manifest; typed loosely so manifest interfaces assign. */
  dslManifest?: object;
  sampleFrames?: number[];
  queryLayers?: string[];
  renderFrames?: boolean;
  renderOutputDir?: string;
  dirtyAttributesOnly?: boolean;
  scale?: number;
  compId?: string;
}

export interface BatchStepFrameEntry {
  geometries?: Array<Record<string, unknown>>;
  renderedPngPath?: string;
  renderError?: string;
  [key: string]: unknown;
}

/** Reshaped `/batch-step` envelope (one GET /get payload). */
export interface BatchStepResponse {
  ok: boolean;
  kind?: string;
  seq?: unknown;
  compId?: string;
  executionTimeMs?: number;
  scriptResult?: unknown;
  manifestResult?: { ok?: boolean; created?: Record<string, string>; ops?: Array<Record<string, unknown>>; errors?: string[] };
  frames?: Record<string, BatchStepFrameEntry>;
  compactDomTsv?: string;
  sampledFrames?: number;
  rendered?: number;
  renderErrors?: Array<{ frame: number; error: string }>;
  restoredFrame?: number;
  error?: string;
  code?: string;
  [key: string]: unknown;
}

export interface ReadbackResponse {
  ok: boolean;
  kind?: string;
  compId?: string;
  frame?: number;
  total?: number;
  returned?: number;
  truncated?: boolean;
  nextOffset?: number;
  layers?: Array<Record<string, unknown>>;
  error?: string;
  code?: string;
  [key: string]: unknown;
}

/** POST /post with a pre-shaped payload (batch-step, state, layers readback). */
async function postRaw(
  payload: Record<string, unknown>,
  config: StallionConfig,
  httpTimeoutMs?: number,
): Promise<void> {
  const url = `${config.url}/post`;
  const budget = httpTimeoutMs ?? config.httpTimeoutMs;
  try {
    const response = await fetchWithTimeout(url, config, { method: "POST", body: JSON.stringify(payload) }, budget);
    if (!response.ok) throw new Error(`Stallion returned ${response.status}: ${await response.text()}`);
  } catch (err) {
    throw connectionError(err, url, budget);
  }
}

/** Poll /get until the payload with this seq carries the expected kind. */
async function waitForKind(
  config: StallionConfig,
  seq: string,
  kind: string,
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetchWithTimeout(`${config.url}/get`, config);
      if (response.ok) {
        const text = await response.text();
        const parsed = JSON.parse(text) as { seq?: unknown; kind?: string };
        if (parsed.kind === kind && String(parsed.seq) === seq) return text;
      }
    } catch {
      // A render or modal can delay one poll; the overall deadline remains bounded.
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  return "";
}

/**
 * One atomic batch-step round trip: execute + step + measure + render. The
 * result is the reshaped envelope served on GET /get (`kind: "batch-step"`).
 */
export async function runBatchStep(
  request: BatchStepRequest,
  config: StallionConfig = CONFIG,
  opts?: { timeoutMs?: number; httpTimeoutMs?: number },
): Promise<BatchStepResponse> {
  const seq = randomUUID();
  const payload: Record<string, unknown> = { type: "batch-step", seq };
  for (const key of ["script", "dslManifest", "sampleFrames", "queryLayers", "renderFrames", "renderOutputDir", "dirtyAttributesOnly", "scale", "compId"] as const) {
    const value = request[key];
    if (value !== undefined) payload[key] = value;
  }
  const raw = await enqueue(async () => {
    await postRaw(payload, config, opts?.httpTimeoutMs);
    return waitForKind(config, seq, "batch-step", opts?.timeoutMs ?? Math.max(config.resultTimeoutMs, 60_000));
  });
  if (!raw) {
    return { ok: false, kind: "batch-step", seq, error: "No batch-step result from Stallion — is the bridge running Stallion v0.11+?" };
  }
  try {
    return JSON.parse(raw) as BatchStepResponse;
  } catch {
    return { ok: false, kind: "batch-step", seq, error: `Unparsable batch-step result: ${raw.slice(0, 500)}` };
  }
}

/**
 * Structured readback (`state` or `layers`) — the cheap scene walk the compact
 * inspector serializes to TSV. Executed through the bridge's readback runtime,
 * never mutating, so no undo group opens.
 */
export async function runReadback(
  kind: "state" | "layers",
  request: { frame?: number; attrs?: string[]; offset?: number; limit?: number; budgetMs?: number; attributes?: boolean; compId?: string } = {},
  config: StallionConfig = CONFIG,
  opts?: { timeoutMs?: number; httpTimeoutMs?: number },
): Promise<ReadbackResponse> {
  const seq = randomUUID();
  const payload: Record<string, unknown> = { type: kind, seq };
  for (const key of ["frame", "attrs", "offset", "limit", "budgetMs", "attributes", "compId"] as const) {
    const value = request[key];
    if (value !== undefined) payload[key] = value;
  }
  const raw = await enqueue(async () => {
    await postRaw(payload, config, opts?.httpTimeoutMs);
    return waitForKind(config, seq, kind, opts?.timeoutMs ?? Math.max(config.resultTimeoutMs, 30_000));
  });
  if (!raw) {
    return { ok: false, kind, seq, error: `No ${kind} readback from Stallion — is the bridge running Stallion v0.10+?` };
  }
  try {
    return JSON.parse(raw) as ReadbackResponse;
  } catch {
    return { ok: false, kind, seq, error: `Unparsable ${kind} result: ${raw.slice(0, 500)}` };
  }
}

export async function pingStallion(config: StallionConfig = CONFIG): Promise<boolean> {
  try {
    await fetchWithTimeout(`${config.url}/`, config);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// v0.11 fast-loop kinds: batch_inspect, checkpoint, rollback, render_frame_fast
// ---------------------------------------------------------------------------

/** Reshaped `/batch_inspect` envelope (see stallion's BatchInspect.ts). */
export interface BatchInspectResponse {
  ok: boolean;
  kind?: string;
  seq?: unknown;
  compId?: string;
  compFrameRate?: number | null;
  compResolution?: [number, number] | null;
  frames?: number[];
  /** frame → layerId → { bbox: {x,y,w,h,cx,cy}, attrs, visible } */
  timeline?: Record<string, Record<string, { bbox: { x: number; y: number; w: number; h: number; cx: number; cy: number }; attrs: Record<string, unknown>; visible: boolean }>>;
  unknownLayerIds?: string[];
  restoredFrame?: number;
  error?: string;
  code?: string;
  [key: string]: unknown;
}

export interface CheckpointResponse {
  ok: boolean;
  kind?: string;
  seq?: unknown;
  snapshotId?: string;
  compId?: string;
  frame?: number;
  layerCount?: number;
  state?: object;
  tmpFile?: string | null;
  error?: string;
  code?: string;
  [key: string]: unknown;
}

export interface RollbackResponse {
  ok: boolean;
  kind?: string;
  seq?: unknown;
  snapshotId?: string;
  compId?: string;
  restoredFrame?: number;
  layerCount?: number;
  deleted?: string[];
  recreated?: Array<{ from: string; to: string }>;
  reappliedCount?: number;
  keyframesRestored?: number;
  connectionsRestored?: number;
  connectionsSkipped?: number;
  error?: string;
  code?: string;
  [key: string]: unknown;
}

export interface RenderFrameFastResponse {
  ok: boolean;
  kind?: string;
  seq?: unknown;
  compId?: string;
  frame?: number;
  scaleFactor?: number;
  scale?: number;
  file?: string;
  /** Disk path the live bridge reports when it cannot inline bytes. */
  outPath?: string;
  inline?: boolean;
  pngBase64?: string;
  /** Where the resolved pixels came from after client readback. */
  pixelSource?: "inline" | "disk" | "unavailable";
  width?: number;
  height?: number;
  sizeBytes?: number | null;
  exists?: boolean;
  contentHash?: string;
  frameHash?: string | null;
  inlineNote?: string;
  restoredFrame?: number;
  error?: string;
  code?: string;
  [key: string]: unknown;
}

/**
 * Geometry-only multi-frame readback matrix. This is the call Stage 4.5's
 * local solver hammers while it converges: no pixels rendered, playhead
 * restored, one round trip per refinement candidate evaluation batch.
 */
export async function runBatchInspect(
  request: { frames: number[]; layerIds?: string[]; attributes?: string[]; includeHidden?: boolean; compId?: string },
  config: StallionConfig = CONFIG,
  opts?: { timeoutMs?: number; httpTimeoutMs?: number },
): Promise<BatchInspectResponse> {
  const seq = randomUUID();
  const payload: Record<string, unknown> = { type: "batch_inspect", seq };
  for (const key of ["frames", "layerIds", "attributes", "includeHidden", "compId"] as const) {
    const value = request[key];
    if (value !== undefined) payload[key] = value;
  }
  const raw = await enqueue(async () => {
    await postRaw(payload, config, opts?.httpTimeoutMs);
    return waitForKind(config, seq, "batch_inspect", opts?.timeoutMs ?? Math.max(config.resultTimeoutMs, 30_000));
  });
  if (!raw) {
    return { ok: false, kind: "batch_inspect", seq, error: "No batch_inspect result from Stallion — is the bridge running Stallion v0.11+?" };
  }
  try {
    return JSON.parse(raw) as BatchInspectResponse;
  } catch {
    return { ok: false, kind: "batch_inspect", seq, error: `Unparsable batch_inspect result: ${raw.slice(0, 500)}` };
  }
}

/** Reshaped `/export_comp_rig_overrides` envelope (see stallion's ExportCompRigOverrides.ts). */
export interface ExportCompRigOverridesResponse {
  ok: boolean;
  kind?: string;
  seq?: unknown;
  compId?: string;
  frame?: number;
  compFrameRate?: number | null;
  compResolution?: [number, number] | null;
  compEndFrame?: number | null;
  layers?: Array<{
    id: string;
    name: string;
    type: string;
    parent?: string | null;
    hidden?: boolean;
    attrs?: Record<string, unknown>;
    animated?: string[];
  }>;
  layerCount?: number;
  error?: string;
  code?: string;
  [key: string]: unknown;
}

/**
 * Bounded procedural/visual attribute readback for reverse preset sync. Reads
 * one state snapshot — no playhead scrub — and returns spring/oscillator/
 * sub-mesh/color/font knobs per layer so a manual UI pass can be folded back
 * into `presets/cloned/<style>.json`.
 */
export async function runExportCompRigOverrides(
  request: { compId?: string; layerIds?: string[]; attributes?: string[] } = {},
  config: StallionConfig = CONFIG,
  opts?: { timeoutMs?: number; httpTimeoutMs?: number },
): Promise<ExportCompRigOverridesResponse> {
  const seq = randomUUID();
  const payload: Record<string, unknown> = { type: "export_comp_rig_overrides", seq };
  for (const key of ["compId", "layerIds", "attributes"] as const) {
    const value = request[key];
    if (value !== undefined) payload[key] = value;
  }
  const raw = await enqueue(async () => {
    await postRaw(payload, config, opts?.httpTimeoutMs);
    return waitForKind(config, seq, "export_comp_rig_overrides", opts?.timeoutMs ?? Math.max(config.resultTimeoutMs, 30_000));
  });
  if (!raw) {
    return { ok: false, kind: "export_comp_rig_overrides", seq, error: "No export_comp_rig_overrides result from Stallion — rebuild and relaunch the bridge (v0.11.0+)." };
  }
  try {
    return JSON.parse(raw) as ExportCompRigOverridesResponse;
  } catch {
    return { ok: false, kind: "export_comp_rig_overrides", seq, error: `Unparsable export_comp_rig_overrides result: ${raw.slice(0, 500)}` };
  }
}

/** Serialize scene state under a `snapshotId` (in-memory on the bridge + fast temp copy). */
export async function runCheckpoint(
  request: { snapshotId?: string; layerIds?: string[]; compId?: string } = {},
  config: StallionConfig = CONFIG,
  opts?: { timeoutMs?: number; httpTimeoutMs?: number },
): Promise<CheckpointResponse> {
  const seq = randomUUID();
  const payload: Record<string, unknown> = { type: "checkpoint", seq };
  for (const key of ["snapshotId", "layerIds", "compId"] as const) {
    const value = request[key];
    if (value !== undefined) payload[key] = value;
  }
  const raw = await enqueue(async () => {
    await postRaw(payload, config, opts?.httpTimeoutMs);
    return waitForKind(config, seq, "checkpoint", opts?.timeoutMs ?? Math.max(config.resultTimeoutMs, 30_000));
  });
  if (!raw) {
    return { ok: false, kind: "checkpoint", seq, error: "No checkpoint result from Stallion — is the bridge running Stallion v0.11+?" };
  }
  try {
    return JSON.parse(raw) as CheckpointResponse;
  } catch {
    return { ok: false, kind: "checkpoint", seq, error: `Unparsable checkpoint result: ${raw.slice(0, 500)}` };
  }
}

/** Restore a checkpoint by `snapshotId` or inline `state` document. */
export async function runRollback(
  request: { snapshotId?: string; state?: object; compId?: string } = {},
  config: StallionConfig = CONFIG,
  opts?: { timeoutMs?: number; httpTimeoutMs?: number },
): Promise<RollbackResponse> {
  const seq = randomUUID();
  const payload: Record<string, unknown> = { type: "rollback", seq };
  for (const key of ["snapshotId", "state", "compId"] as const) {
    const value = request[key];
    if (value !== undefined) payload[key] = value;
  }
  const raw = await enqueue(async () => {
    await postRaw(payload, config, opts?.httpTimeoutMs);
    return waitForKind(config, seq, "rollback", opts?.timeoutMs ?? Math.max(config.resultTimeoutMs, 30_000));
  });
  if (!raw) {
    return { ok: false, kind: "rollback", seq, error: "No rollback result from Stallion — is the bridge running Stallion v0.11+?" };
  }
  try {
    return JSON.parse(raw) as RollbackResponse;
  } catch {
    return { ok: false, kind: "rollback", seq, error: `Unparsable rollback result: ${raw.slice(0, 500)}` };
  }
}

/** One downscaled temp-dir render for the verify loop. */
export async function runRenderFrameFast(
  request: { frame: number; scaleFactor?: number; inline?: boolean; outDir?: string; fileName?: string; compId?: string },
  config: StallionConfig = CONFIG,
  opts?: { timeoutMs?: number; httpTimeoutMs?: number },
): Promise<RenderFrameFastResponse> {
  const seq = randomUUID();
  const payload: Record<string, unknown> = { type: "render_frame_fast", seq };
  for (const key of ["frame", "scaleFactor", "inline", "outDir", "fileName", "compId"] as const) {
    const value = request[key];
    if (value !== undefined) payload[key] = value;
  }
  const raw = await enqueue(async () => {
    await postRaw(payload, config, opts?.httpTimeoutMs);
    return waitForKind(config, seq, "render_frame_fast", opts?.timeoutMs ?? Math.max(config.resultTimeoutMs, 30_000));
  });
  if (!raw) {
    return { ok: false, kind: "render_frame_fast", seq, error: "No render_frame_fast result from Stallion — is the bridge running Stallion v0.11+?" };
  }
  try {
    return resolveRenderFrameFastPixels(JSON.parse(raw) as RenderFrameFastResponse);
  } catch {
    return { ok: false, kind: "render_frame_fast", seq, error: `Unparsable render_frame_fast result: ${raw.slice(0, 500)}` };
  }
}

/**
 * Live/mock pixel parity for `/render_frame_fast`.
 *
 * The mock synthesizes the buffer in memory (`pngBase64`, `inlineBase64` in
 * some clients); a live Cavalry script host has no binary read, so it writes
 * the PNG to disk and names it — `outPath` (newer) or `file` (v0.11). When an
 * envelope arrives without an inline buffer, the bytes are read from the
 * local filesystem here, so downstream PNG decoding and Stage 5 SSIM/IoU
 * verification work identically against both surfaces. Failures degrade
 * honestly: `pixelSource: "unavailable"` and no fabricated pixels.
 */
export function resolveRenderFrameFastPixels(envelope: RenderFrameFastResponse, readFile: typeof fs.readFileSync = fs.readFileSync): RenderFrameFastResponse {
  if (!envelope || envelope.ok !== true) return envelope;
  const index = envelope as Record<string, unknown>;
  const altInline = typeof index.inlineBase64 === "string" && index.inlineBase64.length > 0 ? (index.inlineBase64 as string) : null;
  const inline = typeof envelope.pngBase64 === "string" && envelope.pngBase64.length > 0
    ? "pngBase64"
    : altInline
      ? "inlineBase64"
      : null;
  if (inline) {
    envelope.pixelSource = "inline";
    if (inline === "inlineBase64") {
      envelope.pngBase64 = altInline!;
    }
    return envelope;
  }
  const outPath = typeof envelope.outPath === "string" && envelope.outPath
    ? envelope.outPath
    : typeof envelope.file === "string" && envelope.file
      ? envelope.file
      : null;
  if (!outPath) {
    envelope.pixelSource = "unavailable";
    return envelope;
  }
  try {
    const bytes = readFile(outPath);
    if (bytes.length === 0) throw new Error("zero-byte render");
    envelope.outPath = outPath;
    envelope.pngBase64 = bytes.toString("base64");
    envelope.pixelSource = "disk";
    envelope.inline = false;
  } catch (error) {
    envelope.pixelSource = "unavailable";
    envelope.inlineNote = `disk readback failed for ${outPath}: ${error instanceof Error ? error.message : String(error)}`;
  }
  return envelope;
}

/**
 * Execute one of the 9 expression/shader payload types (`javaScriptShape`,
 * `javaScriptUtility`, `javaScriptModifier`, `javaScriptDeformer`,
 * `javaScriptEmitter`, `skslShader`, `skslFilter`, `preRenderExpression`,
 * `postRenderExpression`) with deterministic `seq`-matched execution receipts
 * and `js_log.txt` console warning/error capture.
 */
export async function executeExpressionPayload(
  type: ExpressionPayloadType | "renderSetupExpression",
  code: string,
  config: StallionConfig = CONFIG,
  opts?: {
    seq?: string;
    targetId?: string;
    layerId?: string;
    attachTo?: string;
    beatFrames?: number[];
    jsLogPath?: string;
    timeoutMs?: number;
    httpTimeoutMs?: number;
  },
): Promise<ExpressionExecutionResult> {
  const seq = opts?.seq ?? randomUUID();
  const payload: Record<string, unknown> = { type, code, seq };
  if (opts?.targetId) payload.targetId = opts.targetId;
  if (opts?.layerId) payload.layerId = opts.layerId;
  if (opts?.attachTo) payload.attachTo = opts.attachTo;
  if (opts?.beatFrames) payload.beatFrames = opts.beatFrames;

  const isSksl = type.startsWith("sksl");
  const skslCheck = isSksl ? validateSkslSource(code) : null;
  const ctxCheck = !isSksl ? validateCavalryContextUsage(code, type) : null;
  const context = payloadTypeToExecutionContext(type);

  const raw = await enqueue(async () => {
    await postRaw(payload, config, opts?.httpTimeoutMs);
    return waitForNative(config, seq, opts?.timeoutMs ?? config.resultTimeoutMs);
  });

  const jsLogDiagnostics = captureJsLogDiagnostics(opts?.jsLogPath);
  const localDiags = isSksl ? (skslCheck?.diagnostics ?? []) : (ctxCheck?.diagnostics ?? []);
  const localValid = isSksl ? (skslCheck?.valid ?? true) : (ctxCheck?.valid ?? true);

  if (!raw) {
    return {
      ok: false,
      seq,
      raw: "",
      applied: [],
      skipped: [],
      error: `Timed out waiting for expression receipt (${type}, seq=${seq})`,
      receipt: {
        sceneStateHash: null,
        consoleDiagnostics: localDiags,
        jsLogDiagnostics,
        beatBBoxes: {},
        payloadType: type,
        context,
        applied: [],
        skipped: [],
        valid: false,
        ...(skslCheck ? { uniforms: skslCheck.uniforms } : {}),
      },
    };
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      seq,
      raw,
      applied: [],
      skipped: [],
      error: `Unparsable expression result: ${raw.slice(0, 300)}`,
      receipt: {
        sceneStateHash: null,
        consoleDiagnostics: localDiags,
        jsLogDiagnostics,
        beatBBoxes: {},
        payloadType: type,
        context,
        applied: [],
        skipped: [],
        valid: false,
      },
    };
  }

  const applied = Array.isArray(parsed.applied) ? parsed.applied.map(String) : [];
  const skipped = Array.isArray(parsed.skipped) ? parsed.skipped.map(String) : [];
  const remoteReceipt = (parsed.receipt && typeof parsed.receipt === "object" ? parsed.receipt : {}) as Record<string, unknown>;
  const remoteDiags = Array.isArray(remoteReceipt.consoleDiagnostics)
    ? (remoteReceipt.consoleDiagnostics as ConsoleDiagnosticEntry[])
    : [];
  const remoteJsLog = Array.isArray(remoteReceipt.jsLogDiagnostics)
    ? (remoteReceipt.jsLogDiagnostics as ConsoleDiagnosticEntry[])
    : [];

  const mergedConsole = [...remoteDiags];
  for (const d of localDiags) {
    if (!mergedConsole.some((r) => r.text === d.text)) mergedConsole.push(d);
  }
  const mergedJsLog = [...remoteJsLog];
  for (const d of jsLogDiagnostics) {
    if (!mergedJsLog.some((r) => r.text === d.text)) mergedJsLog.push(d);
  }

  const receipt: ExpressionReceipt = {
    sceneStateHash: typeof remoteReceipt.sceneStateHash === "string" ? remoteReceipt.sceneStateHash : null,
    consoleDiagnostics: mergedConsole,
    jsLogDiagnostics: mergedJsLog,
    beatBBoxes: (remoteReceipt.beatBBoxes && typeof remoteReceipt.beatBBoxes === "object"
      ? (remoteReceipt.beatBBoxes as Record<string, unknown>)
      : {}),
    payloadType: type,
    context,
    applied,
    skipped,
    valid: (remoteReceipt.valid !== false) && localValid,
    ...(skslCheck ? { uniforms: skslCheck.uniforms } : {}),
  };

  return {
    ok: parsed.ok === true,
    seq,
    raw,
    applied,
    skipped,
    receipt,
    ...(typeof parsed.error === "string" ? { error: parsed.error } : {}),
  };
}
