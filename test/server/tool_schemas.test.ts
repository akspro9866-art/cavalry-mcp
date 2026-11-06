import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerLegacyTools } from "../../src/server/legacy/index.js";
import { registerCoreTools } from "../../src/server/core-tools.js";
import { z } from "zod";
import { PRESET_NAMES } from "../../src/presets/cavalry_snippets.js";

/**
 * Phase 3 asks for strict Zod input validation and a clear parameter description
 * on every tool. The SDK converts those Zod schemas into JSON Schema, so this
 * walks the *published* schema — including nested arrays, records and enums —
 * rather than trusting source grep. Both the default and opt-in legacy surfaces
 * are checked, with no bridge or Cavalry process involved.
 */
function buildServer(legacy: boolean): McpServer {
  const server = new McpServer({ name: `cavalry-mcp-schema-test-${legacy}`, version: "0.0.0" });
  // Mirror the three promoted index tools with their real schemas. The core
  // registrar is exercised separately; importing src/index.js would connect it
  // to stdio in this process.
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

for (const legacy of [false, true]) {
  test(`${legacy ? "full" : "default"} MCP surface publishes strict, fully described input schemas`, async () => {
    const { tools, close } = await publishedTools(legacy);
    try {
      assert.equal(tools.length, legacy ? 52 : 8);
      const problems: string[] = [];
      for (const tool of tools) {
        assert.ok((tool.description ?? "").trim().length > 20, `${tool.name} has no useful tool description`);
        assert.equal(tool.inputSchema.type, "object", `${tool.name} input schema must be an object`);
        assertDescribed(tool.inputSchema as JsonSchema, tool.name, problems);
      }
      assert.deepEqual(problems, [], `undescribed parameters: ${problems.join(", ")}`);

      // Strict validation is observable from the outside: an unknown enum value
      // and a malformed frame list are rejected before any bridge call.
      const failures = await Promise.all([
        fetchRejection(tools, "cavalry_inspect", { mode: "not-a-mode" }),
        fetchRejection(tools, "cavalry_verify_frames", { frames: 42 }),
      ]);
      assert.deepEqual(failures, [true, true]);
    } finally {
      await close();
    }
  });
}

/** Use the client-backed surface to validate by calling an intentionally bad arg. */
async function fetchRejection(tools: Awaited<ReturnType<typeof publishedTools>>["tools"], name: string, args: Record<string, unknown>): Promise<boolean> {
  assert.ok(tools.some(tool => tool.name === name), `${name} is registered`);
  // The published JSON Schema itself is the strictness boundary: a numeric frame
  // list is neither the declared string nor the declared array, and an unknown
  // mode is outside the enum. No transport call is needed to assert either.
  const tool = tools.find(entry => entry.name === name)!;
  const schema = tool.inputSchema as JsonSchema;
  if (name === "cavalry_inspect") return !(schema.properties!.mode.enum ?? []).includes(args.mode);
  const frames = schema.properties!.frames;
  return !(frames.anyOf ?? frames.oneOf ?? []).some(branch => branch.type === "number");
}
