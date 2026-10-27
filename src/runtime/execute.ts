import { parseOutcome, type Outcome } from "../lib.js";
import { runScriptWithExecution, type StallionConfig } from "../stallion.js";
import type { ExecutionState } from "../state.js";

export type ScriptOutcome = Outcome & { state?: ExecutionState | null };

export async function executeMotionScript(
  code: string,
  config?: StallionConfig,
  opts?: { timeoutMs?: number; helpers?: boolean; statePath?: string },
): Promise<ScriptOutcome> {
  try {
    const execution = await runScriptWithExecution(code, config, { helpers: true, ...opts });
    return { ...parseOutcome(execution.raw), state: execution.state };
  } catch (err) {
    return { ok: false, text: err instanceof Error ? err.message : String(err), state: null };
  }
}
