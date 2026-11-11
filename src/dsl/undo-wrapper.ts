/**
 * Atomic Undo Group Wrapper (`src/dsl/undo-wrapper.ts`).
 * Ensures all batch mutations are executed within a try / finally block
 * that guarantees cavalry.endUndoGroup() executes even if exceptions occur.
 */

import { createMgRuntimeSource } from "./mg-runtime.js";

export function wrapAtomicUndo(scriptBody: string, groupName = "mcp_atomic_batch"): string {
  const runtimeDecl = createMgRuntimeSource().trim();
  return `(function() {
${runtimeDecl}
  const _mg = globalThis.__mg_init ? globalThis.__mg_init() : createMgRuntime();
  if (typeof globalThis.cavalry !== "object" || !globalThis.cavalry) {
    globalThis.cavalry = {};
  }
  if (typeof cavalry.beginUndoGroup !== "function") {
    cavalry.beginUndoGroup = typeof api !== "undefined" && typeof api.startUndoGroup === "function"
      ? function(name) { return api.startUndoGroup(name); }
      : function() {};
  }
  if (typeof cavalry.endUndoGroup !== "function") {
    cavalry.endUndoGroup = typeof api !== "undefined" && typeof api.endUndoGroup === "function"
      ? function() { return api.endUndoGroup(); }
      : function() {};
  }
  cavalry.beginUndoGroup(${JSON.stringify(groupName)});
  try {
${scriptBody}
  } finally {
    cavalry.endUndoGroup();
  }
})();`;
}
