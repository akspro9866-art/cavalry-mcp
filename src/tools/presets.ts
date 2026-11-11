/**
 * Core Presets Tool (`src/tools/presets.ts`).
 * Hardened to M8ven Trust Index Grade A:
 * - Strict schema (.strict() / additionalProperties: false)
 * - Explicit maxLength / maxItems bounds
 * - Strict required types
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchPresets, resolvePreset, listPresets } from "../lib/index.js";

export const PresetsInputSchema = z.object({
  action: z.enum(["search", "resolve", "list"]).describe("Action: 'search', 'resolve', or 'list'"),
  query: z.string().max(128).optional().describe("Keyword search query for presets"),
  presetId: z.string().max(80).optional().describe("Preset ID to resolve and compile"),
  params: z.record(z.string().max(64), z.unknown()).optional().describe("Preset parameter overrides"),
}).strict();

export type PresetsInput = z.infer<typeof PresetsInputSchema>;

export async function handlePresets(input: PresetsInput) {
  try {
    if (input.action === "list") {
      const presets = listPresets();
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ count: presets.length, presets }, null, 2) }],
      };
    }
    if (input.action === "search") {
      const results = searchPresets(input.query ?? "");
      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
      };
    }
    if (input.action === "resolve") {
      if (!input.presetId) {
        return {
          content: [{ type: "text" as const, text: "Error: presetId is required when action is 'resolve'" }],
          isError: true,
        };
      }
      const resolved = resolvePreset(input.presetId, input.params ?? {});
      return {
        content: [{ type: "text" as const, text: JSON.stringify(resolved, null, 2) }],
        ...(!resolved.ok ? { isError: true } : {}),
      };
    }
    return {
      content: [{ type: "text" as const, text: `Unknown action: ${String(input.action)}` }],
      isError: true,
    };
  } catch (err) {
    return {
      content: [{ type: "text" as const, text: `Presets action failed: ${String(err)}` }],
      isError: true,
    };
  }
}

export function registerPresetsTool(server: McpServer): void {
  server.tool(
    "cavalry_presets",
    "Query, search, and parameterize presets from the 120-preset SaaS library.",
    PresetsInputSchema.shape,
    async (args) => {
      const parsed = PresetsInputSchema.parse(args);
      return handlePresets(parsed);
    },
  );
}
