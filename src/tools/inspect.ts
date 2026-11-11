/**
 * Core Inspect Tool (`src/tools/inspect.ts`).
 * Hardened to M8ven Trust Index Grade A:
 * - Strict schema (.strict() / additionalProperties: false)
 * - Explicit maxLength / maxItems bounds
 * - Strict required types
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runBatchInspect } from "../bridge/stallion.js";

export const InspectInputSchema = z.strictObject({
  mode: z.enum(["selection", "roots", "all"]).describe("Target scope to inspect in the active composition"),
  sampleFrames: z.array(z.number().int().min(0).max(100000)).max(64).optional().describe("Specific frames to sample (max 64)"),
  sampleIds: z.array(z.string().min(1).max(80)).max(200).optional().describe("Layer ids to inspect (max 200)"),
});

export type InspectInput = z.infer<typeof InspectInputSchema>;

export async function handleInspect(input: InspectInput) {
  try {
    const frames = input.sampleFrames && input.sampleFrames.length > 0 ? input.sampleFrames : [0];
    const layerIds = input.sampleIds ?? [];
    const inspectRes = await runBatchInspect({
      frames,
      layerIds,
    });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(inspectRes, null, 2) }],
    };
  } catch (err) {
    return {
      content: [{ type: "text" as const, text: `Inspection failed: ${String(err)}` }],
      isError: true,
    };
  }
}

export function registerInspectTool(server: McpServer): void {
  server.registerTool(
    "cavalry_inspect",
    {
      description: "Inspect compact layer summaries and bounding box geometry across sample frames.",
      inputSchema: InspectInputSchema,
    },
    async (args) => {
      const parsed = InspectInputSchema.parse(args);
      return handleInspect(parsed);
    },
  );
}
