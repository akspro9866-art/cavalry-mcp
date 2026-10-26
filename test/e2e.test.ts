/**
 * Full-stack test: the REAL server (src/index.ts, all tools registered) is
 * pointed at a mock Stallion via env vars (read at import time), connected
 * through an in-memory MCP transport, and driven with a real MCP Client —
 * exactly the path a ZCode/Claude client takes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { startMockStallion } from "./helpers/mockStallion.js";

const mock = await startMockStallion();
const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "cav-e2e-"));
process.env.CAVALRY_PORT = String(mock.port);
process.env.CAVALRY_RESULT_PATH = path.join(workdir, "result.json");
process.env.ENABLE_LEGACY_TOOLS = "true";

const { server } = await import("../src/index.js");
const [clientToServer, serverToClient] = InMemoryTransport.createLinkedPair();
await server.connect(serverToClient);
const client = new Client({ name: "e2e-test", version: "0.0.0" });
await client.connect(clientToServer);

test.after(async () => {
  await mock.close();
  fs.rmSync(workdir, { recursive: true, force: true });
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

test("all tools are registered and listed", async () => {
  const listed = await client.listTools();
  const names = listed.tools.map((t) => t.name);
  for (const expected of [
    "cavalry_ping",
    "cavalry_run_script",
    "cavalry_batch",
    "cavalry_create_layer",
    "cavalry_set_attribute",
    "cavalry_get_attribute",
    "cavalry_connect",
    "cavalry_keyframe",
    "cavalry_magic_easing",
    "cavalry_get_keyframes",
    "cavalry_animate_in",
    "cavalry_get_scene_layers",
    "cavalry_get_selected_layers",
    "cavalry_select_layers",
    "cavalry_delete_layers",
    "cavalry_duplicate_layer",
    "cavalry_rename_layer",
    "cavalry_reorder_layer",
    "cavalry_set_parent",
    "cavalry_set_layer_timing",
    "cavalry_get_composition_info",
    "cavalry_set_composition_info",
    "cavalry_set_current_frame",
    "cavalry_get_current_frame",
    "cavalry_render_png",
    "cavalry_render_filmstrip",
    "cavalry_render_video",
    "cavalry_get_render_queue",
    "cavalry_cancel_render",
    "cavalry_import_asset",
    "cavalry_list_attributes",
    "cavalry_get_bounding_box",
    "cavalry_save_scene",
    "cavalry_open_scene",
    "cavalry_add_dynamic_attribute",
    "cavalry_undo",
    "cavalry_layer_order",
    "cavalry_keyframe_edit",
    "cavalry_get_connections",
    "cavalry_expression",
    "cavalry_gradient",
    "cavalry_generate_palette",
    "cavalry_compositions",
    "cavalry_transform",
    "cavalry_layer_types",
    "cavalry_playback",
  ]) {
    assert.ok(names.includes(expected), `missing tool ${expected}`);
  }
});

test("ping sees the mock bridge", async () => {
  const res = await call("cavalry_ping", {});
  assert.equal(res.isError, undefined);
  assert.match(textOf(res), /reachable/i);
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
  const text = textOf(res);
  assert.match(text, /4\/4 ops succeeded/);
  assert.match(text, /bg=basicShape#\d+/);
  assert.equal(mock.state.layers.get("basicShape#1")?.attrs["material.materialColor"], "#101828");
});

test("batch validation errors come back as isError without hitting the bridge", async () => {
  const res = await call("cavalry_batch", {
    operations: [{ op: "set", layerId: "$ghost", attributes: { x: 1 } }],
  });
  assert.equal(res.isError, true);
  assert.match(textOf(res), /\$ghost/);
});

test("get_scene_layers returns structured JSON rows", async () => {
  const res = await call("cavalry_get_scene_layers", {});
  assert.equal(res.isError, undefined);
  const rows = JSON.parse(textOf(res));
  assert.ok(Array.isArray(rows));
  const bg = rows.find((r: { name?: string }) => r.name === "BG");
  assert.ok(bg, "BG row present");
  assert.equal(bg.type, "basicShape");
  assert.equal(typeof bg.id, "string");
});

test("keyframe multi-frame form lands all keyframes in one call", async () => {
  const res = await call("cavalry_keyframe", {
    layerId: "basicShape#1",
    keyframes: [
      { frame: 0, attributes: { "position.y": 100 } },
      { frame: 15, attributes: { "position.y": 0 } },
    ],
  });
  assert.equal(res.isError, undefined);
  const frames = mock.state.keyframes.filter((k) => k.layerId === "basicShape#1" && "position.y" in k.attributes);
  assert.deepEqual(frames.map((k) => k.frame), [0, 15]);
});

test("magic_easing rejects invalid easing names at the schema level", async () => {
  const res = await call("cavalry_magic_easing", {
    layerId: "basicShape#1",
    attrPath: "position.y",
    frame: 0,
    easingType: "EaseInOut", // does not exist in Cavalry
  });
  assert.equal(res.isError, true);
  assert.match(textOf(res), /EaseInOut|invalid|enum/i);
});

test("script errors inside tools come back with isError and the message", async () => {
  const res = await call("cavalry_get_attribute", { layerId: "missing#42", attrPath: "opacity" });
  assert.equal(res.isError, true);
  assert.match(textOf(res), /missing#42/);
});

test("render_video drives the render queue and returns ids", async () => {
  const res = await call("cavalry_render_video", {});
  assert.equal(res.isError, undefined);
  const parsed = JSON.parse(textOf(res).replace(/^Video render started: /, ""));
  assert.match(parsed.renderQueueItemId, /renderQueueItem/);
  assert.equal(mock.state.order.includes(`backgroundRender:${parsed.renderQueueItemId}`), true);
});

test("render_png returns an inline image block", async () => {
  const pngPath = path.join(workdir, "frame.png");
  const res = await call("cavalry_render_png", { filePath: pngPath, scale: 100 });
  assert.equal(res.isError, undefined);
  assert.ok(fs.existsSync(pngPath), "file written by mock renderPNGFrame");
  const img = res.content.find((c) => c.type === "image");
  assert.ok(img, "inline image block present");
  assert.equal(img.mimeType, "image/png");
  assert.ok((img.data ?? "").length > 50, "non-trivial base64 payload");
});

test("render_filmstrip composites sampled frames into one image", async () => {
  const res = await call("cavalry_render_filmstrip", { frames: 3, scale: 50, columns: 3 });
  assert.equal(res.isError, undefined);
  const text = textOf(res);
  assert.match(text, /Filmstrip: 3\/3 frames \[0, 30, 60\]/);
  const img = res.content.find((c) => c.type === "image");
  assert.ok(img, "inline composite image present");
  const setFrames = mock.state.order.filter((o) => o.startsWith("setFrame:"));
  assert.deepEqual(setFrames, ["setFrame:0", "setFrame:30", "setFrame:60"]);
});

test("delete_layers reports what was actually removed", async () => {
  const before = mock.state.layers.size;
  const res = await call("cavalry_delete_layers", { layerIds: ["basicShape#1", "missing#99"] });
  assert.equal(res.isError, undefined);
  const parsed = JSON.parse(textOf(res).replace(/^Layers deleted: /, ""));
  assert.equal(parsed.requested, 2);
  assert.equal(parsed.removed, before > 0 ? 1 : 0);
  assert.deepEqual(parsed.notFound, ["missing#99"]);
});

test("animate_in applies a preset and reports applied steps", async () => {
  await call("cavalry_create_layer", { layerType: "textShape", name: "Title" });
  const titleId = [...mock.state.layers.entries()].find(([, l]) => l.name === "Title")?.[0];
  assert.ok(titleId);
  const res = await call("cavalry_animate_in", { layerId: titleId, preset: "springUp", startFrame: 5, duration: 20 });
  assert.equal(res.isError, undefined);
  const parsed = JSON.parse(textOf(res));
  assert.equal(parsed.preset, "springUp");
  assert.ok(parsed.applied.length >= 2);
  assert.ok(mock.state.easings.some((e) => e.name === "SpringOut" && e.frame === 5));
});

test("import_asset returns asset and layer ids", async () => {
  const res = await call("cavalry_import_asset", { filePath: "C:/footage/bg.png" });
  assert.equal(res.isError, undefined);
  const parsed = JSON.parse(textOf(res).replace(/^Imported: /, ""));
  assert.match(parsed.assetId, /asset#/);
  assert.match(parsed.layerId, /imageAsset#/);
});

test("undo is feature-detected and reports clearly when missing", async () => {
  const res = await call("cavalry_undo", {});
  assert.equal(res.isError, true); // mock api has no undo
  assert.match(textOf(res), /api\.undo is not available/);
});

test("ping reports the Cavalry version when reachable", async () => {
  const res = await call("cavalry_ping", {});
  assert.equal(res.isError, undefined);
  assert.match(textOf(res), /version: 2\.8\.0/i);
});

test("layer_order moves layers and restores the selection", async () => {
  const create = await call("cavalry_create_layer", { layerType: "basicShape", name: "OrderTarget" });
  assert.equal(create.isError, undefined);
  const target = textOf(create).replace(/^Created layer: /, "").replace(/^"|"$/g, "");
  await call("cavalry_select_layers", { layerIds: ["basicShape#1"] });
  const res = await call("cavalry_layer_order", { layerIds: [target], to: "front" });
  assert.equal(res.isError, undefined);
  const parsed = JSON.parse(textOf(res).replace(/^Layer order: /, ""));
  assert.deepEqual(parsed.applied, [target]);
  assert.ok(mock.state.order.includes(`bringToFront:${target}`));
  assert.deepEqual(mock.state.selection, ["basicShape#1"]); // selection restored
});

test("keyframe_edit deletes specific keyframes and whole animations", async () => {
  await call("cavalry_create_layer", { layerType: "null", name: "KF" });
  const kf = [...mock.state.layers.entries()].find(([, l]) => l.name === "KF")?.[0];
  assert.ok(kf);
  await call("cavalry_keyframe", {
    layerId: kf,
    keyframes: [
      { frame: 0, attributes: { "position.x": 0 } },
      { frame: 30, attributes: { "position.x": 5 } },
      { frame: 60, attributes: { "position.y": 1 } },
    ],
  });
  const del = await call("cavalry_keyframe_edit", { action: "delete", layerId: kf, attrPath: "position.x", frames: [30] });
  assert.equal(del.isError, undefined);
  const remaining = mock.state.keyframes.filter((k) => k.layerId === kf);
  assert.deepEqual(remaining.map((k) => k.frame), [0, 60]);

  const wipe = await call("cavalry_keyframe_edit", { action: "deleteAnimation", layerId: kf });
  assert.equal(wipe.isError, undefined);
  assert.equal(mock.state.keyframes.filter((k) => k.layerId === kf).length, 0);

  const vel = await call("cavalry_keyframe_edit", {
    action: "setVelocity",
    layerId: kf,
    attrPath: "position.x",
    spec: { frame: 0, leftSpeed: 0.5 },
  });
  assert.equal(vel.isError, undefined);
  assert.ok(mock.state.order.some((o) => o.startsWith(`setKeyframeVelocity:${kf}:`)));
});

test("get_connections reports incoming and outgoing wiring", async () => {
  const a = (await call("cavalry_create_layer", { layerType: "null", name: "ConnA" })).content[0]?.text;
  const b = (await call("cavalry_create_layer", { layerType: "basicShape", name: "ConnB" })).content[0]?.text;
  const idA = (a ?? "").replace(/^Created layer: /, "").replace(/"/g, "");
  const idB = (b ?? "").replace(/^Created layer: /, "").replace(/"/g, "");
  await call("cavalry_connect", {
    sourceLayerId: idA,
    sourceAttr: "id",
    targetLayerId: idB,
    targetAttr: "position.x",
  });
  const res = await call("cavalry_get_connections", { layerId: idB });
  assert.equal(res.isError, undefined);
  const parsed = JSON.parse(textOf(res));
  assert.equal(parsed.incoming["position.x"], `${idA}.id`);
  const out = await call("cavalry_get_connections", { layerId: idA });
  const outParsed = JSON.parse(textOf(out));
  assert.deepEqual(outParsed.outgoing["id"], [`${idB}.position.x`]);
});

test("expression set and get round trip", async () => {
  const create = await call("cavalry_create_layer", { layerType: "null", name: "Expr" });
  const id = textOf(create).replace(/^Created layer: /, "").replace(/"/g, "");
  const set = await call("cavalry_expression", { action: "set", layerId: id, attrPath: "position.y", expression: "value + sin(time)" });
  assert.equal(set.isError, undefined);
  const get = await call("cavalry_expression", { action: "get", layerId: id, attrPath: "position.y" });
  const parsed = JSON.parse(textOf(get));
  assert.equal(parsed.has, true);
  assert.equal(parsed.expression, "value + sin(time)");
});

test("gradient sets color stops in one call", async () => {
  const create = await call("cavalry_create_layer", { layerType: "linearGradient", name: "Grad" });
  const id = textOf(create).replace(/^Created layer: /, "").replace(/"/g, "");
  const res = await call("cavalry_gradient", {
    layerId: id,
    attrPath: "generator.gradient",
    colors: ["#ffffff", "#4ffd7a", "#ff24e0"],
  });
  assert.equal(res.isError, undefined);
  assert.deepEqual(mock.state.layers.get(id)?.attrs["generator.gradient"], ["#ffffff", "#4ffd7a", "#ff24e0"]);
});

test("generate_palette returns the requested number of colors", async () => {
  const res = await call("cavalry_generate_palette", { baseColor: "#3366ff", count: 5, type: "complementary" });
  assert.equal(res.isError, undefined);
  const colors = JSON.parse(textOf(res));
  assert.equal(colors.length, 5);
  assert.equal(colors[0], "#3366ff");
});

test("compositions: create, setActive, list and layers", async () => {
  const created = await call("cavalry_compositions", { action: "create", name: "Intro" });
  assert.equal(created.isError, undefined);
  const compId = textOf(created).replace(/^Created comp: /, "").replace(/"/g, "");
  assert.match(compId, /comp#/);

  const setActive = await call("cavalry_compositions", { action: "setActive", compId });
  assert.equal(setActive.isError, undefined);
  assert.equal(mock.state.activeComp, compId);

  const list = await call("cavalry_compositions", { action: "list" });
  const parsedList = JSON.parse(textOf(list));
  assert.ok(parsedList.comps.some((c: { id: string }) => c.id === compId));
  assert.equal(parsedList.activeCompId, compId);

  const layers = await call("cavalry_compositions", { action: "layers", compId, type: "basicShape" });
  const rows = JSON.parse(textOf(layers));
  assert.ok(Array.isArray(rows) && rows.every((r: { type?: string }) => r.type === "basicShape"));
});

test("compositions: new scene requires confirm", async () => {
  const refused = await call("cavalry_compositions", { action: "new" });
  assert.equal(refused.isError, true);
  assert.match(textOf(refused), /confirm/);
  const ok = await call("cavalry_compositions", { action: "new", confirm: true });
  assert.equal(ok.isError, undefined);
  assert.ok(mock.state.order.includes("newScene"));
});

test("transform actions hit the right api calls", async () => {
  const create = await call("cavalry_create_layer", { layerType: "basicShape", name: "Xform" });
  const id = textOf(create).replace(/^Created layer: /, "").replace(/"/g, "");
  assert.equal((await call("cavalry_transform", { action: "reset", layerId: id })).isError, undefined);
  assert.equal((await call("cavalry_transform", { action: "freeze", layerId: id })).isError, undefined);
  assert.equal((await call("cavalry_transform", { action: "centrePivot", layerId: id, doCentroid: true })).isError, undefined);
  assert.ok(mock.state.order.includes(`resetTransform:${id}`));
  assert.ok(mock.state.order.includes(`freezeTransform:${id}`));
  assert.ok(mock.state.order.includes(`centrePivot:${id}:true`));
});

test("layer_types lists available layer types", async () => {
  const res = await call("cavalry_layer_types", {});
  assert.equal(res.isError, undefined);
  const types = JSON.parse(textOf(res));
  assert.ok(types.some((t: { type: string }) => t.type === "noiseDeformer"));
  const exp = await call("cavalry_layer_types", { includeExperimental: true });
  assert.ok(JSON.parse(textOf(exp)).some((t: { type: string }) => t.type === "experimentalThing"));
});

test("playback plays and stops", async () => {
  assert.equal((await call("cavalry_playback", { action: "play" })).isError, undefined);
  assert.ok(mock.state.order.includes("play"));
  assert.equal((await call("cavalry_playback", { action: "stop" })).isError, undefined);
  assert.ok(mock.state.order.includes("stop"));
});

test("get_scene_layers includes the selected flag", async () => {
  const first = [...mock.state.layers.keys()][0];
  if (first) await call("cavalry_select_layers", { layerIds: [first] });
  const res = await call("cavalry_get_scene_layers", {});
  const rows = JSON.parse(textOf(res));
  assert.ok(typeof rows[0]?.selected === "boolean");
  if (first) assert.equal(rows.find((r: { id: string }) => r.id === first)?.selected, true);
});
