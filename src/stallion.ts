/**
 * Stallion bridge client — sends JavaScript to Cavalry via HTTP POST.
 *
 * Cavalry must have the Stallion script running (Scripts > Stallion).
 * The server listens on 127.0.0.1:8080 by default.
 *
 * Readback: Cavalry's api.WebServer only ever acks /post with a fixed body,
 * so tool scripts write their result to a JSON file via api.writeToFile() and
 * the node side polls for that file (matched by a per-call sequence number).
 *
 * Configuration via environment variables (all optional):
 *   CAVALRY_HOST        Stallion host     (default 127.0.0.1)
 *   CAVALRY_PORT        Stallion port     (default 8080)
 *   CAVALRY_TIMEOUT_MS  Request timeout   (default 120000 = 2 minutes,
 *                                          long enough for renders)
 *   CAVALRY_RESULT_PATH Where tool scripts write their JSON result
 *                       (default <os tmpdir>/cavalry-mcp-result.json)
 */
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
  timeoutMs: number;
  resultPath: string;
}

function loadConfig(): StallionConfig {
  const host = process.env.CAVALRY_HOST ?? "127.0.0.1";
  const port = Number.parseInt(process.env.CAVALRY_PORT ?? "8080", 10);
  const timeoutMs = Number.parseInt(
    process.env.CAVALRY_TIMEOUT_MS ?? "120000",
    10,
  );
  const resultPath =
    process.env.CAVALRY_RESULT_PATH ??
    path.join(os.tmpdir(), "cavalry-mcp-result.json");
  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 8080,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 120000,
    resultPath,
  };
}

const CONFIG: StallionConfig = loadConfig();

export function getConfig(): StallionConfig {
  return CONFIG;
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
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
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
        `Timed out after ${config.timeoutMs} ms waiting for Cavalry. The script may still be running; increase CAVALRY_TIMEOUT_MS if this happens often.`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run a script and return the JSON string the script wrote via
 * api.writeToFile ("" if no result appeared before the timeout).
 *
 * The script is wrapped so that:
 *   - a thrown error is captured into __out.error instead of being lost
 *   - a variable named __result (if assigned) is returned as __out.result
 *   - the result JSON is written to a known file tagged with a unique seq
 *
 * The node side polls that file until the seq appears — Stallion's onPost
 * callback polls at ~1 Hz, so the HTTP ack can arrive before the script runs.
 */
export async function runScriptWithResult(
  code: string,
  config: StallionConfig = CONFIG,
): Promise<string> {
  const seq = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const resultPathLiteral = JSON.stringify(config.resultPath);
  const wrapped = `(function() {
var __out = { ok: true, seq: "${seq}" };
try {
${code}
} catch (e) { __out.ok = false; __out.error = String(e && e.message ? e.message : e); }
try { if (typeof __result !== "undefined") { __out.result = __result; } } catch (e3) {}
try { api.writeToFile(${resultPathLiteral}, JSON.stringify(__out)); } catch (e2) { __out.writeFailed = String(e2); }
})()`;

  let prevMtime = 0;
  try {
    prevMtime = fs.statSync(config.resultPath).mtimeMs;
  } catch {
    /* no previous result file */
  }

  await sendToCavalry(wrapped, "script", config);

  const deadline = Date.now() + config.timeoutMs;
  while (Date.now() < deadline) {
    await sleep(120);
    try {
      const stat = fs.statSync(config.resultPath);
      if (stat.mtimeMs === prevMtime) continue;
      const txt = fs.readFileSync(config.resultPath, "utf8");
      if (txt.includes(`"${seq}"`)) {
        return txt;
      }
    } catch {
      /* file not written yet */
    }
  }
  return "";
}

/**
 * Check if Stallion is reachable in Cavalry.
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
