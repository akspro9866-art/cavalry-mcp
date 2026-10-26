/** Abortable, serialized client for Stallion's native and legacy protocols. */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ATOMIC_SCRIPT_MARKER, wrapAtomicScript, wrapLegacyResult } from "./runtime/atomic.js";

export interface StallionPayload {
  type: "script" | "javaScriptShape" | "skslShader" | "renderSetupExpression";
  code: string;
  path?: string;
  seq?: string;
}

export interface StallionConfig {
  url: string;
  host: string;
  port: number;
  token: string;
  httpTimeoutMs: number;
  resultTimeoutMs: number;
  resultPath: string;
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

async function fetchWithTimeout(url: string, config: StallionConfig, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { ...headers(config), ...init.headers },
    signal: AbortSignal.timeout(config.httpTimeoutMs),
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
): Promise<string> {
  const url = `${config.url}/post`;
  try {
    const response = await fetchWithTimeout(url, config, {
      method: "POST",
      body: JSON.stringify({ type, code, ...(seq ? { seq } : {}) } satisfies StallionPayload),
    });
    if (!response.ok) throw new Error(`Stallion returned ${response.status}: ${await response.text()}`);
    return response.text();
  } catch (err) {
    throw connectionError(err, url, config.httpTimeoutMs);
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

export async function runScriptWithResult(
  code: string,
  config: StallionConfig = CONFIG,
  opts?: { timeoutMs?: number; helpers?: boolean },
): Promise<string> {
  const seq = randomUUID();
  const atomic = wrapAtomicScript(code, opts?.helpers ?? false);
  return enqueue(async () => {
    const native = await supportsNativeResults(config);
    if (native) {
      await post(atomic, "script", config, seq);
      return waitForNative(config, seq, opts?.timeoutMs ?? config.resultTimeoutMs);
    }
    await post(wrapLegacyResult(atomic, seq, config.resultPath), "script", config, seq);
    return waitForFile(config.resultPath, seq, opts?.timeoutMs ?? config.resultTimeoutMs);
  });
}

export async function pingStallion(config: StallionConfig = CONFIG): Promise<boolean> {
  try {
    await fetchWithTimeout(`${config.url}/`, config);
    return true;
  } catch {
    return false;
  }
}
