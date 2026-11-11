/**
 * Full-stack test: the REAL server (src/index.ts, compact + CRUD surface) is
 * pointed at a mock Stallion via env vars (read at import time), connected
 * through an in-memory MCP transport, and driven with a real MCP Client —
 * exactly the path an MCP client takes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { startMockStallion } from "../helpers/mockStallion.js";
import { removeTreeSync } from "../../src/shared/fs-safe.js";

const mock = await startMockStallion({ native: true });
const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "cav-e2e-"));
process.env.CAVALRY_PORT = String(mock.port);
process.env.CAVALRY_RESULT_PATH = path.join(workdir, "result.json");

// Exercise both the compact default and the CRUD core tools in one server pass.
process.env.CAVALRY_MCP_LEGACY_CRUD = "1";
const { server } = await import("../../src/index.js");
const [clientToServer, serverToClient] = InMemoryTransport.createLinkedPair();
await server.connect(serverToClient);
const client = new Client({ name: "e2e-test", version: "0.0.0" });
await client.connect(clientToServer);

test.after(async () => {
  await mock.close();
  removeTreeSync(workdir);
});

interface ToolResult {
  isError?: boolean;
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
}

async function call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const res = (await client.callTool({ name, arguments: args })) as unknown as ToolResult;
  return res;
}

function textOf(res: ToolResult): string {
  return res.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
}

test("all compact and CRUD tools are registered and legacy granular tools are excluded", async () => {
  const listed = await client.listTools();
  const names = listed.tools.map((t) => t.name);
  for (const expected of [
    "cavalry_apply_dsl",
    "cavalry_search_presets",
    "cavalry_inspect_compact",
    "list_cloned_styles",
    "instantiate_cloned_style",
    "sync_active_comp_to_cloned_style",
    "cavalry_run_script",
    "cavalry_inspect",
    "cavalry_run_preset",
    "cavalry_batch",
    "cavalry_probe_api",
    "cavalry_doctor",
    "cavalry_render_frames",
    "cavalry_verify_frames",
  ]) {
    assert.ok(names.includes(expected), `missing tool ${expected}`);
  }
  for (const removed of ["cavalry_ping", "cavalry_create_layer", "cavalry_set_attribute", "cavalry_magic_easing"]) {
    assert.ok(!names.includes(removed), `unexpected legacy tool ${removed}`);
  }
});

test("run_script round trip with real result data", async () => {
  const res = await call("cavalry_run_script", { code: "__result = 20 + 22;" });
  assert.equal(res.isError, undefined);
  assert.match(textOf(res), /42/);
});

test("batch builds a scene in one round trip and reports refs", async () => {
  const res = await call("cavalry_batch", {
    operations: [
      { op: "create", layerType: "basicShape", name: "BG", as: "bg" },
      { op: "set", layerId: "$bg", attributes: { "material.materialColor": "#101828", visible: true } },
      {
        op: "keyframe",
        layerId: "$bg",
        keyframes: [
          { frame: 0, attributes: { "position.x": 0 } },
          { frame: 30, attributes: { "position.x": 200 } },
        ],
      },
      { op: "duplicate", layerId: "$bg", as: "bg2" },
    ],
  });
  assert.equal(res.isError, undefined);
  const summary = JSON.parse(textOf(res));
  assert.equal(summary.ok, true);
  assert.equal(summary.executed, 4);
  assert.equal(summary.failed, 0);
  assert.match(summary.refs.bg, /basicShape#\d+/);
  assert.match(summary.refs.bg2, /basicShape#\d+/);
  assert.equal(mock.state.layers.get("basicShape#1")?.attrs["material.materialColor"], "#101828");
});

test("batch validation errors come back as isError without hitting the bridge", async () => {
  const res = await call("cavalry_batch", {
    operations: [{ op: "set", layerId: "$ghost", attributes: { x: 1 } }],
  });
  assert.equal(res.isError, true);
  assert.match(textOf(res), /\$ghost/);
});

test("compact tools search presets, apply DSL, and inspect scene", async () => {
  const search = await call("cavalry_search_presets", { query: "counter" });
  assert.equal(search.isError, undefined, textOf(search));
  assert.match(textOf(search), /counter/i);

  const applyRes = await call("cavalry_apply_dsl", {
    manifest: {
      layers: [{ as: "card", kind: "shape", type: "rectangle", name: "Card", attrs: { "material.materialColor": "#223344" } }],
    },
    sampleFrames: [0],
  });
  assert.equal(applyRes.isError, undefined, textOf(applyRes));

  const compactInspect = await call("cavalry_inspect_compact", { sampleFrames: [0] });
  assert.equal(compactInspect.isError, undefined, textOf(compactInspect));
  assert.match(textOf(compactInspect), /BG/);

  const inspect = await call("cavalry_inspect", { mode: "roots" });
  assert.equal(inspect.isError, undefined, textOf(inspect));

  const preset = await call("cavalry_run_preset", { name: "number_counter", params: {} });
  assert.equal(preset.isError, undefined, textOf(preset));
});

test("render_frames drives a real sequence through the result-file protocol", async () => {
  const setFrameRes = await call("cavalry_run_script", { code: "api.setFrame(11); __result = api.getFrame();" });
  assert.equal(setFrameRes.isError, undefined, textOf(setFrameRes));
  assert.match(textOf(setFrameRes), /11/);
  const outDir = path.join(workdir, "seq");
  const res = await call("cavalry_render_frames", { frames: "0-3", outDir, chunkFrames: 2, perFrameMs: 200, timeoutMs: 5000 });
  assert.equal(res.isError, undefined, textOf(res));
  const payload = JSON.parse(textOf(res));
  assert.equal(payload.status, "complete");
  assert.deepEqual(payload.rendered.items, [0, 1, 2, 3]);
  assert.equal(payload.chunks.length, 2);
  assert.equal(payload.restoredFrame, 11);
  for (const frame of [0, 1, 2, 3]) {
    const file = path.join(outDir, `frame-${String(frame).padStart(6, "0")}.png`);
    assert.ok(fs.existsSync(file) && fs.statSync(file).size > 0, file);
  }
  const frame = await call("cavalry_run_script", { code: "__result = api.getFrame();" });
  assert.match(textOf(frame), /11/, "the playhead is handed back to the caller");

  // A resumed call sends nothing new and stays under the token budget.
  const again = await call("cavalry_render_frames", { frames: "0-3", outDir, chunkFrames: 2 });
  const resume = JSON.parse(textOf(again));
  assert.equal(resume.status, "complete");
  assert.deepEqual(resume.rendered.items, []);
  assert.equal(resume.reused.items.length, 4);
});

test("verify_frames checks the scene before a long render", async () => {
  const built = await call("cavalry_batch", {
    operations: [
      { op: "create", layerType: "basicShape", name: "V1", as: "a" },
      { op: "set", layerId: "$a", attributes: { "generator.dimensions": [300, 200], "position.x": 0, "position.y": 0 } },
      { op: "create", layerType: "basicShape", name: "V2", as: "b" },
      { op: "set", layerId: "$b", attributes: { "generator.dimensions": [200, 100], "position.x": 100, "position.y": 50 } },
    ],
  });
  assert.equal(built.isError, undefined, textOf(built));
  const res = await call("cavalry_verify_frames", { frames: "0,10", outDir: path.join(workdir, "verify") });
  assert.equal(res.isError, undefined, textOf(res));
  const payload = JSON.parse(textOf(res));
  assert.equal(payload.frames.length, 2);
  assert.ok(payload.collisions.length > 0, "the overlapping pair is flagged");
  assert.equal(payload.missing.length, 0);
});

test("probe_api answers the naming questions the docs got wrong", async () => {
  const reportFile = path.join(workdir, "live-capabilities.json");
  const res = await call("cavalry_probe_api", { writeFile: reportFile });
  assert.equal(res.isError, undefined, textOf(res));
  const payload = JSON.parse(textOf(res));
  assert.equal(payload.capabilities.getNiceName, true);
  assert.equal(payload.capabilities.getName, false);
  assert.ok(fs.existsSync(reportFile));
});
