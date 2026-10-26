import { MG_HELPERS_SOURCE } from "./mg_helpers.js";

export const ATOMIC_SCRIPT_MARKER = "/* cavalry-mcp:atomic */";

/** One isolated scope and one Undo step; Stallion captures return/errors. */
export function wrapAtomicScript(code: string, withHelpers = false): string {
  return `${ATOMIC_SCRIPT_MARKER}
(() => {
  api.startUndoGroup("AI Motion Batch");
  try {
    return (() => {
      ${withHelpers ? MG_HELPERS_SOURCE : ""}
      return (() => {
${code}
      })();
    })();
  } finally {
    api.endUndoGroup();
  }
})()`;
}

/** Legacy Stallion fallback: the same result envelope via api.writeToFile. */
export function wrapLegacyResult(atomicCode: string, seq: string, resultPath: string): string {
  return `(function () {
var __out = { ok: true, seq: ${JSON.stringify(seq)} };
var __result;
try {
  var __returned = ${atomicCode};
  if (typeof __result === "undefined") __result = __returned;
  if (typeof __result !== "undefined") __out.result = __result;
} catch (err) {
  __out.ok = false;
  __out.error = err.toString();
  __out.stack = err.stack;
}
try {
  api.writeToFile(${JSON.stringify(resultPath)}, JSON.stringify(__out), true);
} catch (err) {
  try { api.writeToFile(${JSON.stringify(resultPath)}, JSON.stringify({ ok: false, seq: ${JSON.stringify(seq)}, error: err.toString(), stack: err.stack, writeFailed: err.toString() }), true); } catch (_) {}
}
})()`;
}
