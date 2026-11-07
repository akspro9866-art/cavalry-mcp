#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerCompactTools } from "./server/compact-tools.js";
import { registerCoreTools } from "./server/core-tools.js";
import { registerLegacyTools } from "./server/legacy/index.js";
import { registerStrictTools } from "./server/strict-tools.js";
import { compilePreset, PRESET_NAMES } from "./presets/cavalry_snippets.js";
import { executeMotionScript, type ScriptOutcome } from "./runtime/execute.js";
import { compileInspection } from "./runtime/inspect.js";
import { z } from "zod";

const server = new McpServer({ name: "cavalry-mcp", version: "3.4.0" });

function result(outcome: ScriptOutcome) {
  return {
    content: [{ type: "text" as const, text: outcome.text }],
    ...(!outcome.ok ? { isError: true } : {}),
    // Spatial/error feedback without changing the text payload that scripts
    // and existing clients parse.
    ...(outcome.state ? { _meta: { telemetry: outcome.state } } : {}),
  };
}

// `--strict-dsl` (CLI flag) or CAVALRY_MCP_STRICT_DSL=1 selects the zero-slop
// agent surface: EXACTLY four tools (cavalry_exec_mg, cavalry_query_presets,
// cavalry_inspect_rig, cavalry_clone_beat) and nothing else — the legacy
// atomic/granular tools are not registered at all, so no client can drift
// into per-frame keyframe baking.
const strictDsl =
  process.argv.includes("--strict-dsl") ||
  process.env.CAVALRY_MCP_STRICT_DSL === "1" ||
  process.env.CAVALRY_MCP_STRICT_DSL === "true";

// The granular CRUD surface — cavalry_run_script, cavalry_inspect,
// cavalry_run_preset and the cavalry_batch/verify/render/probe/doctor core —
// stays callable for internal callers behind CAVALRY_MCP_LEGACY_CRUD=1, and
// the historical per-attribute tools behind ENABLE_LEGACY_TOOLS=true (which
// implies the CRUD gate). Under --strict-dsl neither is registered.
const legacyCrud =
  process.env.CAVALRY_MCP_LEGACY_CRUD === "1" ||
  process.env.CAVALRY_MCP_LEGACY_CRUD === "true" ||
  process.env.ENABLE_LEGACY_TOOLS === "true";

if (strictDsl) {
  registerStrictTools(server);
} else {
  // The default agent surface is exactly three compact tools (see
  // compact_tools.ts): declarative scene building, bounded preset discovery and
  // strict-TSV inspection. The granular CRUD tools below are the "AI slop"
  // path — per-frame keyframe setters and raw single-attribute writes — and
  // stay available only behind the CRUD gate.
  if (legacyCrud) {
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
  }
}

if (!strictDsl) registerCompactTools(server);

if (!strictDsl && legacyCrud && process.env.ENABLE_LEGACY_TOOLS === "true") registerLegacyTools(server);

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
