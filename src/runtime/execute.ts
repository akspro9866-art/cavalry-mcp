import { parseOutcome, type Outcome } from "../shared/lib.js";
import { runScriptWithExecution, type StallionConfig } from "../bridge/stallion.js";
import type { ExecutionState } from "../shared/state.js";

export type ScriptOutcome = Outcome & { state?: ExecutionState | null };

/**
 * `timeoutMs` bounds how long the result is awaited; `httpTimeoutMs` bounds the
 * POST itself. A multi-frame render chunk can legitimately outlive the default
 * poll budget, so long callers raise both together instead of relying on env.
 */
export async function executeMotionScript(
  code: string,
  config?: StallionConfig,
  opts?: { timeoutMs?: number; httpTimeoutMs?: number; helpers?: boolean; statePath?: string },
): Promise<ScriptOutcome> {
  try {
    const execution = await runScriptWithExecution(code, config, { helpers: true, ...opts });
    return { ...parseOutcome(execution.raw), state: execution.state };
  } catch (err) {
    return { ok: false, text: err instanceof Error ? err.message : String(err), state: null };
  }
}
