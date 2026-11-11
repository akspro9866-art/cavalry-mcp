/**
 * Atomic Undo Group Wrapper (`src/dsl/undo-wrapper.ts`).
 * Ensures all batch mutations are executed within a try / finally block
 * that guarantees cavalry.endUndoGroup() executes even if exceptions occur.
 */

export function wrapAtomicUndo(scriptBody: string, groupName = "mcp_atomic_batch"): string {
  return `(function() {
  const _mg = globalThis.__mg_init ? globalThis.__mg_init() : createMgRuntime();
  cavalry.beginUndoGroup(${JSON.stringify(groupName)});
  try {
${scriptBody}
  } finally {
    cavalry.endUndoGroup();
  }
})();`;
}
