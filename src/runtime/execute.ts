import { parseOutcome, type Outcome } from "../lib.js";
import { runScriptWithResult, type StallionConfig } from "../stallion.js";

export async function executeMotionScript(
  code: string,
  config?: StallionConfig,
  opts?: { timeoutMs?: number; helpers?: boolean },
): Promise<Outcome> {
  try {
    const raw = await runScriptWithResult(code, config, { helpers: true, ...opts });
    return parseOutcome(raw);
  } catch (err) {
    return { ok: false, text: err instanceof Error ? err.message : String(err) };
  }
}
