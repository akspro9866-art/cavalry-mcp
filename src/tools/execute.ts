/**
 * Core Execute Tool (`src/tools/execute.ts`).
 * Hardened to M8ven Trust Index Grade A:
 * - Strict schema (.strict() / additionalProperties: false)
 * - Explicit maxLength / maxItems bounds
 * - Strict required types
 * - Single atomic undo group guarantee
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeMotionScript } from "../runtime/execute.js";
import { wrapAtomicUndo } from "../dsl/undo-wrapper.js";

export const ExecuteInputSchema = z.strictObject({
  code: z.string().min(1).max(1000000).describe("JavaScript code body to execute in Cavalry"),
  groupName: z.string().min(1).max(128).default("mcp_atomic_batch").describe("Undo group label for atomic batch rollback"),
  seq: z.union([z.string().min(1).max(64), z.number().finite()]).optional().describe("Caller sequence identifier"),
});

export type ExecuteInput = z.infer<typeof ExecuteInputSchema>;

export async function handleExecute(input: ExecuteInput) {
  try {
    const wrappedCode = wrapAtomicUndo(input.code, input.groupName);
    const outcome = await executeMotionScript(wrappedCode, undefined, { helpers: true });
    return {
      content: [{ type: "text" as const, text: outcome.text }],
      ...(!outcome.ok ? { isError: true } : {}),
      ...(outcome.state ? { _meta: { telemetry: outcome.state } } : {}),
    };
  } catch (err) {
    return {
      content: [{ type: "text" as const, text: `Execution failed: ${String(err)}` }],
      isError: true,
    };
  }
}

export function registerExecuteTool(server: McpServer): void {
  server.registerTool(
    "cavalry_execute",
    {
      description: "Atomically compile and execute an _mg motion script in Cavalry wrapped in an undo group.",
      inputSchema: ExecuteInputSchema,
    },
    async (args) => {
      const parsed = ExecuteInputSchema.parse(args);
      return handleExecute(parsed);
    },
  );
}
