#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { compilePreset, PRESET_NAMES } from "./presets/cavalry_snippets.js";
import { executeMotionScript, type ScriptOutcome } from "./runtime/execute.js";
import { compileInspection } from "./runtime/inspect.js";
import { registerCoreTools } from "./core_tools.js";
import { registerLegacyTools } from "./legacy.js";

const server = new McpServer({ name: "cavalry-mcp", version: "3.2.0" });

function result(outcome: ScriptOutcome) {
  return {
    content: [{ type: "text" as const, text: outcome.text }],
    ...(!outcome.ok ? { isError: true } : {}),
    // Spatial/error feedback without changing the text payload that scripts
    // and existing clients parse.
    ...(outcome.state ? { _meta: { telemetry: outcome.state } } : {}),
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
  "Inspect compact layer id/name/niceName/type summaries for the selection or active composition roots. Pass sampleFrames to also evaluate per-frame world-space bounding boxes, transforms, opacity and connections for the sampled layers (evaluated beat telemetry).",
  {
    mode: z.enum(["selection", "roots"]).default("selection"),
    sampleFrames: z.array(z.number().int()).max(16).optional(),
    sampleIds: z.array(z.string()).max(50).optional(),
  },
  async ({ mode, sampleFrames, sampleIds }) =>
    result(await executeMotionScript(compileInspection(mode, { sampleFrames, sampleIds }), undefined, { helpers: false })),
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

registerCoreTools(server);

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
