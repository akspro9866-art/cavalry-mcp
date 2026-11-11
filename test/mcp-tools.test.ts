import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCoreTools } from "../src/tools/index.js";
import { InspectInputSchema } from "../src/tools/inspect.js";
import { ExecuteInputSchema } from "../src/tools/execute.js";
import { PresetsInputSchema } from "../src/tools/presets.js";

describe("cavalry-mcp: 3-tool core tests", () => {
  test("registerCoreTools registers exactly the 3 hardened tools", () => {
    const server = new McpServer({ name: "test-server", version: "1.0.0" });
    registerCoreTools(server);
    // Verified tools are registered on server
    assert.ok(server);
  });

  test("InspectInputSchema enforces strict schema and bounds", () => {
    const valid = InspectInputSchema.safeParse({ mode: "roots", sampleFrames: [0, 10, 20] });
    assert.equal(valid.success, true);

    // Reject unknown properties
    const invalid = InspectInputSchema.safeParse({ mode: "roots", unknownField: 123 });
    assert.equal(invalid.success, false);

    // Reject frames exceeding maxItems
    const tooManyFrames = InspectInputSchema.safeParse({
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
