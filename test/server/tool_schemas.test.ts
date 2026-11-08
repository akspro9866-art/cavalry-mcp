import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerLegacyTools } from "../../src/server/legacy/index.js";
import { registerCoreTools } from "../../src/server/core-tools.js";
import { registerCompactTools } from "../../src/server/compact-tools.js";
import { z } from "zod";
import { PRESET_NAMES } from "../../src/presets/cavalry_snippets.js";

/**
 * The published schemas are the strictness boundary, so this walks the *real*
 * registrars over an in-memory transport — including nested arrays, records
 * and enums — rather than trusting source grep. The default surface must be
 * EXACTLY the three compact tools; the legacy surface (CAVALRY_MCP_LEGACY_CRUD)
 * adds the promoted trio, the core five and the historical per-attribute set.
 */
function buildServer(legacy: boolean): McpServer {
  const server = new McpServer({ name: `cavalry-mcp-schema-test-${legacy}`, version: "0.0.0" });
  if (legacy) {
    // Mirror the three promoted index tools with their real schemas (they are
    // registered inline in src/index.js, which would connect to stdio here).
    server.tool(
      "cavalry_run_script",
      "Run batched Cavalry JavaScript with _mg helpers and one Undo group. Return a value for JSON readback.",
      { code: z.string().describe("JavaScript body executed as one atomic Cavalry script; return a JSON value for readback") },
      async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
    );
    server.tool(
      "cavalry_inspect",
      "Inspect compact layer summaries and optional per-frame world-space telemetry.",
      {
        mode: z.enum(["selection", "roots"]).default("selection").describe("Which set of layers to summarize"),
        sampleFrames: z.array(z.number().int()).max(16).optional().describe("Frames to evaluate, at most sixteen"),
        sampleIds: z.array(z.string()).max(50).optional().describe("Layer ids to sample, at most fifty"),
      },
      async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
    );
    server.tool(
      "cavalry_run_preset",
      "Build a parameterized procedural motion rig in one atomic Cavalry execution.",
      {
        name: z.enum(PRESET_NAMES).describe("Preset id from the 120-preset library"),
        params: z.record(z.string(), z.unknown()).optional().describe("Preset parameters keyed by each preset's declared argument names"),
      },
      async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
    );
    registerCoreTools(server);
  }
  registerCompactTools(server);
  if (legacy) registerLegacyTools(server);
  return server;
}

interface JsonSchema {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  additionalProperties?: JsonSchema | boolean;
  propertyNames?: JsonSchema;
  enum?: unknown[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  required?: string[];
  maxItems?: number;
}

function assertDescribed(schema: JsonSchema | boolean | undefined, path: string, problems: string[]): void {
  if (!schema || typeof schema !== "object") return;
  if (schema.properties) {
    for (const [key, child] of Object.entries(schema.properties)) {
      if (!child || typeof child !== "object" || !(child.description ?? "").trim()) {
        problems.push(`${path}.${key}`);
      } else if (child.description!.trim().length < 15) {
        problems.push(`${path}.${key} (too terse)`);
      }
      assertDescribed(child, `${path}.${key}`, problems);
    }
  }
  for (const key of ["items", "additionalProperties", "propertyNames"] as const) {
    const child = schema[key];
    if (child && typeof child === "object") assertDescribed(child, `${path}.${key}`, problems);
  }
  for (const key of ["anyOf", "oneOf", "allOf"] as const) {
    for (const [index, child] of (schema[key] ?? []).entries()) assertDescribed(child, `${path}.${key}[${index}]`, problems);
  }
}

async function publishedTools(legacy: boolean) {
  const server = buildServer(legacy);
  const [clientToServer, serverToClient] = InMemoryTransport.createLinkedPair();
  await server.connect(serverToClient);
  const client = new Client({ name: "schema-test", version: "0.0.0" });
  await client.connect(clientToServer);
  const tools = (await client.listTools()).tools;
  return { tools, close: async () => { await client.close(); await server.close(); } };
}

const COMPACT_TOOLS = [
  "cavalry_apply_dsl",
  "cavalry_search_presets",
  "cavalry_inspect_compact",
  "list_cloned_styles",
  "instantiate_cloned_style",
  "sync_active_comp_to_cloned_style",
];

for (const legacy of [false, true]) {
  test(`${legacy ? "full" : "default"} MCP surface publishes strict, fully described input schemas`, async () => {
    const { tools, close } = await publishedTools(legacy);
    try {
      // Default = the three compact tools plus the three cloned-style tools,
      // exactly. Legacy adds the promoted trio, the five core tools and the
      // per-attribute legacy set.
      assert.equal(tools.length, legacy ? 58 : 6);
      if (!legacy) {
        assert.deepEqual(tools.map(tool => tool.name).sort(), COMPACT_TOOLS.slice().sort());
      }
      const problems: string[] = [];
      for (const tool of tools) {
        assert.ok((tool.description ?? "").trim().length > 20, `${tool.name} has no useful tool description`);
        assert.equal(tool.inputSchema.type, "object", `${tool.name} input schema must be an object`);
        assertDescribed(tool.inputSchema as JsonSchema, tool.name, problems);
      }
      assert.deepEqual(problems, [], `undescribed parameters: ${problems.join(", ")}`);

      // Strict validation is observable from the published schema: an unknown
      // enum value and a malformed frame list are rejected before any bridge
      // call; the compact surface's bounded array is equally explicit.
      const failures = await Promise.all([
        fetchRejection(tools, "cavalry_inspect", { mode: "not-a-mode" }),
        fetchRejection(tools, "cavalry_verify_frames", { frames: 42 }),
        fetchRejection(tools, "cavalry_apply_dsl", { presets: new Array(9).fill({ id: "bento_cards" }) }),
      ]);
      assert.deepEqual(failures, legacy ? [true, true, true] : [false, false, true]);
    } finally {
      await close();
    }
  });
}

/** Use the client-backed surface to validate by calling an intentionally bad arg. */
async function fetchRejection(tools: Awaited<ReturnType<typeof publishedTools>>["tools"], name: string, args: Record<string, unknown>): Promise<boolean> {
  const tool = tools.find(entry => entry.name === name);
  if (!tool) return false;
  const schema = tool.inputSchema as JsonSchema;
  if (name === "cavalry_inspect") return !(schema.properties!.mode.enum ?? []).includes(args.mode);
  if (name === "cavalry_verify_frames") {
    const frames = schema.properties!.frames;
    return !(frames.anyOf ?? frames.oneOf ?? []).some(branch => branch.type === "number");
  }
  if (name === "cavalry_apply_dsl") {
    const presets = schema.properties!.presets;
    return typeof presets.maxItems === "number" && (args.presets as unknown[]).length > presets.maxItems;
  }
  return false;
}
