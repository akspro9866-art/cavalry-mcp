import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { startMockStallion } from "./helpers/mockStallion.js";
import { INSPECT_MAX_CHARS } from "../src/runtime/inspect.js";

const mock = await startMockStallion({ native: true });
process.env.STALLION_URL = `http://127.0.0.1:${mock.port}`;
delete process.env.ENABLE_LEGACY_TOOLS;
const { server } = await import("../src/index.js");
const [clientToServer, serverToClient] = InMemoryTransport.createLinkedPair();
await server.connect(serverToClient);
const client = new Client({ name: "core-test", version: "0.0.0" });
await client.connect(clientToServer);

test.after(async () => {
  await client.close();
  await server.close();
  await mock.close();
});

interface ToolResult { isError?: boolean; content: Array<{ type: string; text?: string }> }
async function call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  return await client.callTool({ name, arguments: args }) as unknown as ToolResult;
}
function text(result: ToolResult): string {
  return result.content.map(item => item.text ?? "").join("\n");
}

test("default MCP surface is exactly three compact tools", async () => {
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map(tool => tool.name).sort(), [
    "cavalry_inspect",
    "cavalry_run_preset",
    "cavalry_run_script",
  ]);
  for (const tool of listed.tools) {
    assert.ok((tool.description ?? "").trim().split(/\s+/).length < 40);
  }
});

test("run_script injects _mg and returns values in one Undo group", async () => {
  const res = await call("cavalry_run_script", {
    code: `const id = _mg.shape("rectangle", "Fast", { opacity: 80 }); return { id };`,
  });
  assert.equal(res.isError, undefined, text(res));
  assert.match(JSON.parse(text(res)).id, /basicShape#/);
  assert.equal(mock.state.order[0], "startUndo:AI Motion Batch");
  assert.equal(mock.state.order.at(-1), "endUndo");
});

test("inspection is essential-only and bounded", async () => {
  await call("cavalry_run_script", {
    code: `const ids = []; for (let i = 0; i < 12; i++) ids.push(_mg.layer("null", "A very long layer name " + i)); api.select(ids); return ids.length;`,
  });
  const res = await call("cavalry_inspect", { mode: "selection" });
  assert.equal(res.isError, undefined, text(res));
  assert.ok(text(res).length <= INSPECT_MAX_CHARS);
  const payload = JSON.parse(text(res));
  assert.equal(payload.truncated, true);
  assert.deepEqual(Object.keys(payload.layers[0]).sort(), ["id", "name", "niceName", "type"]);
});

test("all canonical presets execute through the same pipeline", async () => {
  for (const name of ["kinetic_text", "bento_cards", "dot_matrix_bg", "number_counter"] as const) {
    const res = await call("cavalry_run_preset", { name, params: {} });
    assert.equal(res.isError, undefined, `${name}: ${text(res)}`);
    assert.equal(JSON.parse(text(res)).preset, name);
  }
  const target = [...mock.state.layers.keys()][0];
  const pulse = await call("cavalry_run_preset", { name: "pulse_oscillator", params: { targetId: target } });
  assert.equal(pulse.isError, undefined, text(pulse));
  const pulseResult = JSON.parse(text(pulse));
  assert.equal(pulseResult.target, target);
  assert.match(pulseResult.oscillator, /oscillator#/);
});

test("runtime errors include exact messages", async () => {
  const res = await call("cavalry_run_script", { code: `throw new Error("core boom");` });
  assert.equal(res.isError, true);
  assert.match(text(res), /core boom/);
  assert.equal(mock.state.order.at(-1), "endUndo");
});
