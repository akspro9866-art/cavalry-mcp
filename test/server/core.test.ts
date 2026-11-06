import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { startMockStallion } from "../helpers/mockStallion.js";
import { INSPECT_MAX_CHARS } from "../../src/runtime/inspect.js";
import { removeTreeSync } from "../../src/shared/fs-safe.js";

const mock = await startMockStallion({ native: true });
const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "cav-core-"));
process.env.STALLION_URL = `http://127.0.0.1:${mock.port}`;
delete process.env.ENABLE_LEGACY_TOOLS;
const { server } = await import("../../src/index.js");
const [clientToServer, serverToClient] = InMemoryTransport.createLinkedPair();
await server.connect(serverToClient);
const client = new Client({ name: "core-test", version: "0.0.0" });
await client.connect(clientToServer);

test.after(async () => {
  await client.close();
  await server.close();
  await mock.close();
  removeTreeSync(workdir);
});

interface ToolResult { isError?: boolean; content: Array<{ type: string; text?: string }> }
async function call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  return await client.callTool({ name, arguments: args }) as unknown as ToolResult;
}
function text(result: ToolResult): string {
  return result.content.map(item => item.text ?? "").join("\n");
}

test("default MCP surface is the compact promoted tool set", async () => {
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map(tool => tool.name).sort(), [
    "cavalry_batch",
    "cavalry_doctor",
    "cavalry_inspect",
    "cavalry_probe_api",
    "cavalry_render_frames",
    "cavalry_run_preset",
    "cavalry_run_script",
    "cavalry_verify_frames",
  ]);
  for (const tool of listed.tools) {
    assert.ok((tool.description ?? "").trim().split(/\s+/).length < 40, `${tool.name} description is too long`);
  }
});

test("batch compiles to one atomic script and reports per-op results", async () => {
  const res = await call("cavalry_batch", {
    operations: [
      { op: "create", layerType: "basicShape", name: "Batched", as: "card" },
      { op: "set", layerId: "$card", attributes: { "position.x": 120 } },
      {
        op: "keyframe",
        layerId: "$card",
        keyframes: [
          { frame: 0, attributes: { "position.x": 0 } },
          { frame: 12, attributes: { "position.x": 240 } },
        ],
      },
      { op: "easing", layerId: "$card", attrPath: "position.x", frame: 0, easingType: "Custom", expression: "t*t*t" },
    ],
  });
  assert.equal(res.isError, undefined, text(res));
  const summary = JSON.parse(text(res));
  assert.equal(summary.ok, true);
  assert.equal(summary.executed, 4);
  assert.match(summary.refs.card, /basicShape#/);
  // The Custom expression must reach Cavalry intact; a silently dropped curve is
  // the failure mode this op variant exists to prevent.
  const easing = mock.state.easings.find(entry => entry.name === "Custom");
  assert.ok(easing, "custom easing recorded");
  assert.equal(easing.expression, "t*t*t");

  const invalid = await call("cavalry_batch", {
    operations: [
      { op: "easing", layerId: "basicShape#1", attrPath: "position.x", frame: 0, easingType: "SlowOut", expression: "t" },
    ],
  });
  assert.equal(invalid.isError, true);
  assert.match(text(invalid), /only valid with easingType Custom or None/);
});

test("render_frames chunks a sequence, restores the playhead and reports files", async () => {
  const outDir = path.join(workdir, "sequence");
  mock.state.frame = 7;
  const res = await call("cavalry_render_frames", { frames: "0-5", outDir, chunkFrames: 2 });
  assert.equal(res.isError, undefined, text(res));
  const payload = JSON.parse(text(res));
  assert.equal(payload.status, "complete");
  assert.deepEqual(payload.rendered.items, [0, 1, 2, 3, 4, 5]);
  assert.equal(payload.pending.items.length, 0);
  assert.equal(payload.chunks.length, 3, "two frames per bridge call");
  assert.equal(payload.restoredFrame, 7);
  assert.equal(mock.state.frame, 7, "playhead restored between chunks");
  for (const frame of [0, 1, 2, 3, 4, 5]) {
    const file = path.join(outDir, `frame-${String(frame).padStart(6, "0")}.png`);
    assert.ok(fs.existsSync(file), file);
  }
  assert.ok(fs.existsSync(payload.progressFile), "progress document written");
  const progress = JSON.parse(fs.readFileSync(payload.progressFile, "utf8"));
  assert.equal(progress.schema, "cavalry-mcp/render-progress@1");
  assert.equal(progress.status, "complete");
  assert.deepEqual(progress.pending, []);
});

test("probe_api writes the capabilities report and answers presence per function", async () => {
  const reportFile = path.join(workdir, "capabilities.json");
  const res = await call("cavalry_probe_api", { writeFile: reportFile });
  assert.equal(res.isError, undefined, text(res));
  const payload = JSON.parse(text(res));
  assert.equal(payload.file, reportFile);
  // The contract that cost the most guessing last time, answered directly.
  assert.equal(payload.capabilities.getNiceName, true);
  assert.equal(payload.capabilities.getName, false);
  assert.ok(payload.missing.includes("getName"));
  assert.ok(payload.present.includes("renderPNGFrame"));
  assert.equal(payload.surface, null, "the full list stays in the file unless asked for");
  const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
  assert.ok(Array.isArray(report.surface));
  assert.ok(report.surface.includes("getAttributes"));
  assert.ok(report.attributeSamples.length > 0, "type representatives sampled");
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
