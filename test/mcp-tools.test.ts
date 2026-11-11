import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCoreTools } from "../src/tools/index.js";
import { InspectInputSchema } from "../src/tools/inspect.js";
import { ExecuteInputSchema } from "../src/tools/execute.js";
import { PresetsInputSchema } from "../src/tools/presets.js";

describe("cavalry-mcp: 3-tool core tests", () => {
  test("registerCoreTools registers the 3 hardened tools with additionalProperties: false and runtime rejection", async () => {
    const server = new McpServer({ name: "test-server", version: "1.0.0" });
    registerCoreTools(server);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "core-tools-test", version: "0.0.0" });
    await client.connect(clientTransport);
    try {
      const { tools } = await client.listTools();
      assert.deepEqual(tools.map((t) => t.name).sort(), ["cavalry_execute", "cavalry_inspect", "cavalry_presets"]);
      for (const tool of tools) {
        assert.equal((tool.inputSchema as { additionalProperties?: unknown }).additionalProperties, false, `${tool.name} additionalProperties`);
        const req = (tool.inputSchema as { required?: string[] }).required;
        assert.ok(Array.isArray(req) && req.length > 0, `${tool.name} required array`);
      }

      const extraInspect = await client.callTool({ name: "cavalry_inspect", arguments: { mode: "roots", unknownField: true } });
      assert.equal(extraInspect.isError, true);

      const extraExecute = await client.callTool({ name: "cavalry_execute", arguments: { code: "return 1;", extra: true } });
      assert.equal(extraExecute.isError, true);

      const extraPresets = await client.callTool({ name: "cavalry_presets", arguments: { action: "search", query: "bounce", extra: true } });
      assert.equal(extraPresets.isError, true);
    } finally {
      await client.close();
      await server.close();
    }
  });

  test("InspectInputSchema enforces strict schema and bounds", () => {
    const valid = InspectInputSchema.safeParse({ mode: "roots", sampleFrames: [0, 10, 20] });
    assert.equal(valid.success, true);

    // Reject unknown properties
    const invalid = InspectInputSchema.safeParse({ mode: "roots", unknownField: 123 });
    assert.equal(invalid.success, false);

    // Reject frames exceeding maxItems
    const tooManyFrames = InspectInputSchema.safeParse({
      mode: "roots",
      sampleFrames: Array.from({ length: 100 }, (_, i) => i),
    });
    assert.equal(tooManyFrames.success, false);
  });

  test("ExecuteInputSchema requires code and rejects unknown properties", () => {
    const valid = ExecuteInputSchema.safeParse({ code: 'api.set("a", 1);', groupName: "my_group" });
    assert.equal(valid.success, true);

    const empty = ExecuteInputSchema.safeParse({ code: "" });
    assert.equal(empty.success, false);

    const extra = ExecuteInputSchema.safeParse({ code: 'api.set("a", 1);', extra: "forbidden" });
    assert.equal(extra.success, false);
  });

  test("PresetsInputSchema enforces strict actions and parameters", () => {
    const validSearch = PresetsInputSchema.safeParse({ action: "search", query: "bounce" });
    assert.equal(validSearch.success, true);

    const validResolve = PresetsInputSchema.safeParse({
      action: "resolve",
      presetId: "spring_bounce",
      params: { stiffness: 200 },
    });
    assert.equal(validResolve.success, true);

    const invalidAction = PresetsInputSchema.safeParse({ action: "destroy" });
    assert.equal(invalidAction.success, false);
  });
});
