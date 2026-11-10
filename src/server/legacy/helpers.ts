/** Shared bridge/result helpers for the legacy tool surface. */
import fs from "node:fs";
import { runScriptWithResult } from "../../bridge/stallion.js";
import { parseOutcome, type Outcome } from "../../shared/lib.js";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Run a script through the bridge and parse the outcome. Never throws. */
export async function exec(
  code: string,
  opts?: { timeoutMs?: number },
): Promise<{ outcome: Outcome; raw: string }> {
  try {
    const raw = await runScriptWithResult(code, undefined, opts);
    return { outcome: parseOutcome(raw), raw };
  } catch (err) {
    return {
      outcome: { ok: false, text: err instanceof Error ? err.message : String(err) },
      raw: "",
    };
  }
}

export function textResult(text: string, isError = false) {
  return isError
    ? { content: [{ type: "text" as const, text }], isError: true }
    : { content: [{ type: "text" as const, text }] };
}

/** exec + wrap into an MCP result with an optional prefix. */
export async function runCode(prefix: string, code: string, opts?: { timeoutMs?: number }) {
  const { outcome } = await exec(code, opts);
  return textResult(`${prefix}${outcome.text}`, !outcome.ok);
}

/** Poll until a file exists with size > 0 (Cavalry writes renders async). */
export async function waitForFile(filePath: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (fs.statSync(filePath).size > 0) return true;
    } catch {
      /* not written yet */
    }
    await sleep(150);
  }
  return false;
}
