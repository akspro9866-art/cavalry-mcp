#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { compilePreset, PRESET_NAMES } from "./presets/cavalry_snippets.js";
import { executeMotionScript } from "./runtime/execute.js";
import { compileInspection } from "./runtime/inspect.js";
import { registerLegacyTools } from "./legacy.js";

const server = new McpServer({ name: "cavalry-mcp", version: "3.0.0" });

function result(outcome: { ok: boolean; text: string }) {
  return {
    content: [{ type: "text" as const, text: outcome.text }],
    ...(!outcome.ok ? { isError: true } : {}),
  };
}

server.tool(
  "cavalry_run_script",
  "Run batched Cavalry JavaScript with _mg helpers and one Undo group. Return a value for JSON readback.",
  { code: z.string() },
  async ({ code }) => result(await executeMotionScript(code)),
);

server.tool(
  "cavalry_inspect",
  "Inspect compact layer id/name/niceName/type summaries for the selection or active composition roots.",
  { mode: z.enum(["selection", "roots"]).default("selection") },
  async ({ mode }) => result(await executeMotionScript(compileInspection(mode), undefined, { helpers: false })),
);

server.tool(
  "cavalry_run_preset",
  "Build a parameterized procedural motion rig in one atomic Cavalry execution.",
  {
    name: z.enum(PRESET_NAMES),
    params: z.record(z.string(), z.unknown()).optional(),
  },
  async ({ name, params }) => result(await executeMotionScript(compilePreset(name, params))),
);

if (process.env.ENABLE_LEGACY_TOOLS === "true") registerLegacyTools(server);

export { server };

async function main() {
  await server.connect(new StdioServerTransport());
}

if (!process.env.NODE_TEST_CONTEXT) {
  main().catch(err => {
    console.error("Failed to start cavalry-mcp:", err);
    process.exit(1);
  });
}
