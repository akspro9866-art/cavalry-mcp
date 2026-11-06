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
  {
    code: z.string().describe('JavaScript body executed as one atomic Cavalry script. Use _mg.* helpers for rig work, call `return` to read a value back as JSON, and prefer cavalry_batch over many single calls — each round trip costs about a second.'),
  },
  async ({ code }) => result(await executeMotionScript(code)),
);

server.tool(
  "cavalry_inspect",
  "Inspect compact layer id/name/niceName/type summaries for the selection or active composition roots. Pass sampleFrames to also evaluate per-frame world-space bounding boxes, transforms, opacity and connections for the sampled layers (evaluated beat telemetry).",
  {
    mode: z.enum(["selection", "roots"]).default("selection").describe('Which set to summarize: the current editor selection, or the active comp\'s layer roots.'),
    sampleFrames: z.array(z.number().int()).max(16).optional().describe("Frames to evaluate at (max 16). Adds world-space bbox, transform, opacity and in/out connections per frame; the playhead is restored afterwards."),
    sampleIds: z.array(z.string()).max(50).optional().describe("Layer ids to sample (max 50). Defaults to whatever the mode selected."),
  },
  async ({ mode, sampleFrames, sampleIds }) =>
    result(await executeMotionScript(compileInspection(mode, { sampleFrames, sampleIds }), undefined, { helpers: false })),
);

server.tool(
  "cavalry_run_preset",
  "Build a parameterized procedural motion rig in one atomic Cavalry execution.",
  {
    name: z.enum(PRESET_NAMES).describe("Preset id from the library. cavalry_inspect or the library docs list the parameters each one accepts."),
    params: z.record(z.string(), z.unknown()).optional().describe("Preset parameters (rig inputs such as timing, amplitude and stagger). Keys are checked against the preset's declared parameters; anything it does not declare is reported instead of silently dropped."),
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
