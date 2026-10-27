import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createMockApiState, buildMockApi } from "./mock-cavalry-api.js";
import { MG_HELPERS_SOURCE } from "../src/runtime/mg_helpers.js";

function run(body: string) {
  const state = createMockApiState();
  const api = buildMockApi(state);
  const context = vm.createContext({ api, console });
  const result = new vm.Script(`(function () {\n${MG_HELPERS_SOURCE}\n${body}\n})()`).runInContext(context) as Record<string, unknown>;
  return { result, state, api };
}

test("modulate organicFloat adds a noise node wired to the attribute", () => {
  const { result, state } = run(`
    const bar = _rb.rect("Bar", 100, 20, { fill: "#10B981", x: 0, y: 0 });
    const before = api.getCompLayers(true).length;
    const mod = _mg.modulate(bar, "position.y", {
      type: "organicFloat",
      amplitude: 42,
      frequency: 0.5,
      timeScale: 2,
      seed: 3,
      octaves: 3,
      gain: 0.6
    });
    return { bar, mod, before, after: api.getCompLayers(true).length };
  `);
  assert.equal(result.after, (result.before as number) + 1, "one behaviour node is created");
  const mod = result.mod as { type: string; nodes: string[]; attrs: string[] };
  assert.equal(mod.type, "organicFloat");
  assert.equal(mod.nodes.length, 1);
  const node = state.layers.get(mod.nodes[0])!;
  assert.equal(node.type, "noise");
  assert.equal(node.attrs.strength, 42);
  assert.equal(node.attrs["generator.frequency"], 0.5);
  assert.equal(node.attrs["generator.timeScale"], 2);
  assert.equal(node.attrs["generator.seed"], 3);
  assert.equal(node.attrs["generator.octaves"], 3);
  assert.equal(node.attrs["generator.gain"], 0.6);
  assert.ok(
    state.connections.some((c) => c.sourceId === mod.nodes[0] && c.targetId === result.bar && c.targetAttr === "position.y"),
    "noise output drives the requested attribute",
  );
});

test("modulate expands compound attrs into per-axis nodes", () => {
  const { result } = run(`
    const card = _rb.rect("Card", 120, 80, { fill: "#38BDF8", x: 0, y: 0 });
    const mod = _mg.modulate(card, "position", { type: "organicFloat", amplitude: 12, seed: 10 });
    return { mod };
  `);
  const mod = result.mod as { nodes: string[]; attrs: string[]; applied: number };
  assert.deepEqual(Array.from(mod.attrs), ["position.x", "position.y"]);
  assert.equal(mod.nodes.length, 2);
  assert.equal(mod.applied, 2);
});

test("modulate oscillator uses the oscillator node", () => {
  const { result, state } = run(`
    const dot = _rb.circle("Dot", 20, { fill: "#10B981", x: 0, y: 0 });
    const mod = _mg.modulate(dot, "scale.x", {
      type: "oscillator",
      amplitude: 0.2,
      frequency: 1.4,
      waveType: 1
    });
    return { mod };
  `);
  const mod = result.mod as { nodes: string[] };
  const node = state.layers.get(mod.nodes[0])!;
  assert.equal(node.type, "oscillator");
  assert.equal(node.attrs.strength, 0.2);
  assert.equal(node.attrs.frequency, 1.4);
  assert.equal(node.attrs.waveType, 1);
});

test("modulate spring bakes a damped oscillation into keyframes", () => {
  const { result, state } = run(`
    const dot = _rb.rect("Dot", 40, 40, { fill: "#F59E0B", x: 0, y: 0 });
    _rb.pos(dot, 0, 0);
    const mod = _mg.modulate(dot, "position.y", {
      type: "spring",
      amplitude: 50,
      duration: 20,
      startFrame: 5,
      damping: 6,
      frequency: 2
    });
    return { dot, mod };
  `);
  const mod = result.mod as { keyframes: number; target: string };
  const keyframes = state.keyframes.filter((k) => k.layerId === result.dot && "position.y" in k.attributes);
  const frames = keyframes.map((k) => k.frame);
  assert.equal(frames.length, mod.keyframes);
  assert.ok(frames.length >= 4);
  assert.deepEqual(frames, [...frames].sort((a, b) => a - b), "frames are strictly ordered");
  assert.equal(frames[0], 5);
  assert.equal(frames[frames.length - 1], 25);
  const first = keyframes[0].attributes["position.y"] as number;
  const last = keyframes[keyframes.length - 1].attributes["position.y"] as number;
  assert.ok(Math.abs(first - 50) < 0.01, `spring starts at rest + amplitude (${first})`);
  assert.equal(last, 0, "spring settles back to the rest value");
});

test("modulate spring rejects compound attributes", () => {
  const { result } = run(`
    const dot = _rb.rect("Dot", 40, 40, { fill: "#F59E0B", x: 0, y: 0 });
    try {
      _mg.modulate(dot, "position", { type: "spring" });
      return { error: null };
    } catch (error) {
      return { error: String(error.message) };
    }
  `);
  assert.match(result.error as string, /spring needs one scalar attribute/);
});

test("modulate whisker target resolution and unknown types fail loudly", () => {
  const { result } = run(`
    api.select([]);
    let noTarget = null;
    try { _mg.modulate(null, "rotation", "organicFloat"); } catch (error) { noTarget = String(error.message); }
    const dot = _rb.circle("Dot", 10, { fill: "#FFF", x: 0, y: 0 });
    let unknown = null;
    try { _mg.modulate(dot, "rotation", { type: "wobble" }); } catch (error) { unknown = String(error.message); }
    return { noTarget, unknown };
  `);
  assert.match(result.noTarget as string, /no target layer/);
  assert.match(result.unknown as string, /unknown type wobble/);
});

test("modulate staggerFalloff wires a falloff into a stagger node", () => {
  const { result, state } = run(`
    const card = _rb.rect("Card", 80, 40, { fill: "#10B981", x: 0, y: 0 });
    const dup = _rb.dup(card, { distribution: "grid", columns: 4, rows: 3, width: 600, height: 300 });
    const mod = _mg.modulate(dup, "shapeTimeOffset", {
      type: "staggerFalloff",
      offset: 3,
      falloff: { size: [400, 200], shapeType: 1, strength: 80, repetitions: 1, seed: 4 }
    });
    return { dup, mod };
  `);
  const mod = result.mod as { falloff: string; stagger: string; applied: number };
  const falloff = state.layers.get(mod.falloff)!;
  const stagger = state.layers.get(mod.stagger)!;
  assert.equal(falloff.type, "falloff");
  assert.equal(stagger.type, "stagger");
  assert.equal(falloff.attrs.strength, 80);
  assert.equal(falloff.attrs.shapeType, 1);
  assert.equal(stagger.attrs.offset, 3);
  assert.ok(state.connections.some((c) => c.sourceId === mod.stagger && c.targetId === result.dup && c.targetAttr === "shapeTimeOffset"));
  assert.ok(state.connections.some((c) => c.sourceId === mod.falloff && c.targetId === mod.stagger && c.targetAttr === "falloffs"));
  assert.equal(mod.applied, 2);
});

test("connectDynamic builds a native Connect Shape rig from two layers", () => {
  const { result, state } = run(`
    const a = _rb.rect("Node A", 120, 80, { fill: "#111827", x: -300, y: 0 });
    const b = _rb.rect("Node B", 120, 80, { fill: "#111827", x: 300, y: 0 });
    const before = api.getAllSceneLayers().length;
    const link = _mg.connectDynamic(a, b, {
      color: "#FF0000",
      width: 5,
      curve: true,
      dash: "10,6",
      maxConnections: 2,
      targetMode: "index"
    });
    return { a, b, link, before, after: api.getAllSceneLayers().length };
  `);
  const link = result.link as {
    connector: string;
    sourceMesh: string;
    targetMesh: string;
    anchors: { source: { x: number }; target: { x: number }; length: number };
    follows: boolean;
  };
  assert.equal(state.layers.get(link.connector)!.type, "connectShape");
  assert.equal(state.layers.get(link.sourceMesh)!.type, "meshDistribution");
  assert.equal(state.layers.get(link.targetMesh)!.type, "meshDistribution");
  assert.equal(state.layers.get(link.sourceMesh)!.attrs.count, 1);
  assert.equal(state.layers.get(link.connector)!.attrs.lineType, 2);
  assert.equal(state.layers.get(link.connector)!.attrs.targetMode, 2);
  assert.equal(state.layers.get(link.connector)!.attrs.maxConnections, 2);
  assert.equal(link.follows, true);
  assert.equal(link.anchors.source.x, -300);
  assert.equal(link.anchors.target.x, 300);
  assert.equal(link.anchors.length, 600);

  const wires = state.connections;
  assert.ok(wires.some((c) => c.sourceId === link.sourceMesh && c.targetId === link.connector && c.targetAttr === "sourceGenerator"));
  assert.ok(wires.some((c) => c.sourceId === link.targetMesh && c.targetId === link.connector && c.targetAttr === "targetGenerator"));
  assert.ok(wires.some((c) => c.sourceId === result.a && c.targetId === link.sourceMesh && c.targetAttr === "inputShape"));
  assert.ok(wires.some((c) => c.sourceId === result.b && c.targetId === link.targetMesh && c.targetAttr === "inputShape"));

  const [strokeId, stroke] = [...state.layers.entries()].find(([, layer]) => layer.type === "strokeMaterial")!;
  assert.equal(stroke.attrs.width, 5);
  assert.equal(stroke.attrs.strokeColor.r, 255);
  assert.ok(wires.some((c) => c.sourceId === strokeId && c.targetId === link.connector && c.targetAttr === "stroke"));

  const mesh = state.layers.get(link.sourceMesh)!;
  assert.equal(mesh.attrs.fill, true);
  assert.equal(mesh.attrs.scaleToFit, true);
  // Rebuilding would replace the original layers; the ids survive and only the
  // rig nodes are new.
  assert.ok(state.layers.has(result.a as string));
  assert.ok(state.layers.has(result.b as string));
  assert.equal(result.after, (result.before as number) + 4, "2 meshes + connector + stroke material");
});

test("connectDynamic resolves theme tokens and validates ids", () => {
  const { result, state } = run(`
    _mg.applyTheme({ colors: { border: "#00FF88" }, palette: false, apply: false });
    const a = _rb.circle("A", 30, { fill: "#111827", x: -100, y: 0 });
    const b = _rb.circle("B", 30, { fill: "#111827", x: 100, y: 0 });
    const link = _mg.connectDynamic(a, b, { color: "@border" });
    let error = null;
    try { _mg.connectDynamic(a, null); } catch (e) { error = String(e.message); }
    return { link, error };
  `);
  const link = result.link as { connector: string };
  const stroke = [...state.layers.values()].find((layer) => layer.type === "strokeMaterial")!;
  assert.equal(stroke.attrs.strokeColor.g, 255);
  assert.equal(stroke.attrs.strokeColor.b, 136);
  assert.equal(state.layers.get(link.connector)!.attrs.lineType, 0, "straight lines by default");
  assert.match(result.error as string, /sourceId and targetId are required/);
});
