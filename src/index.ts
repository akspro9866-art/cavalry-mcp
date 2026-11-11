#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerCompactTools } from "./server/compact-tools.js";
import { registerCoreTools } from "./server/core-tools.js";
import { registerStrictTools } from "./server/strict-tools.js";
import { loadRefcloneModule, registerRefcloneTools, type RefcloneToolDependencies } from "./server/refclone-tools.js";
import { compilePreset, PRESET_NAMES } from "./presets/cavalry_snippets.js";
import { executeMotionScript, type ScriptOutcome } from "./runtime/execute.js";
import { compileInspection } from "./runtime/inspect.js";
import { z } from "zod";

function result(outcome: ScriptOutcome) {
  return {
    content: [{ type: "text" as const, text: outcome.text }],
    ...(!outcome.ok ? { isError: true } : {}),
    // Spatial/error feedback without changing the text payload that scripts
    // and existing clients parse.
    ...(outcome.state ? { _meta: { telemetry: outcome.state } } : {}),
  };
}

export interface ServerOptions {
  env?: NodeJS.ProcessEnv;
  argv?: readonly string[];
  refclone?: RefcloneToolDependencies;
}

/** Build registrations without connecting a transport; injectable for offline tests. */
export function createServer({ env = process.env, argv = process.argv, refclone }: ServerOptions = {}): McpServer {
  // Explicit mode wins over every older flag. Even an empty explicit mode is
  // invalid: never turn a typo into an unexpectedly permissive tool surface.
  const mode = env.MCP_MODE;
  if (mode !== undefined && mode !== "refclone_strict" && mode !== "interactive_authoring") {
    throw new Error(`Invalid MCP_MODE ${JSON.stringify(mode)}; expected refclone_strict or interactive_authoring`);
  }
  const server = new McpServer({ name: "cavalry-mcp", version: "3.4.0" });
  if (mode === "refclone_strict") {
    registerRefcloneTools(server, refclone ?? { loadRefclone: () => loadRefcloneModule(env.REFCLONE_MODULE_PATH) });
    return server;
  }

  const interactive = mode === "interactive_authoring";
  const strictDsl = !interactive && (
    argv.includes("--strict-dsl") ||
    env.CAVALRY_MCP_STRICT_DSL === "1" || env.CAVALRY_MCP_STRICT_DSL === "true"
  );
  if (strictDsl) {
    registerStrictTools(server);
    return server;
  }

  // Compatibility caveat: unset MCP_MODE still honors the older opt-ins.
  // Legacy pre-v3.4 granular per-attribute tools were removed; interactive_authoring
  // enables CRUD core tools alongside the compact surface.
  const legacyCrud =
    interactive || env.CAVALRY_MCP_LEGACY_CRUD === "1" || env.CAVALRY_MCP_LEGACY_CRUD === "true";
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
  // Unset mode and no opt-ins preserve the existing compact three-tool default.
  registerCompactTools(server);
  return server;
}

export const server = createServer();

async function main() {
  await server.connect(new StdioServerTransport());
}

if (!process.env.NODE_TEST_CONTEXT) {
  main().catch(err => {
    console.error("Failed to start cavalry-mcp:", err);
    process.exit(1);
  });
}
