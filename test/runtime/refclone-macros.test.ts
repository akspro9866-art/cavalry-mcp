import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createMockApiState, buildMockApi } from "../helpers/mock-cavalry-api.js";
import { MG_HELPERS_SOURCE } from "../../src/runtime/mg_helpers.js";
import { compileInspection } from "../../src/runtime/inspect.js";

/**
 * Run a body with the full _mg/_rb runtime in the headless mock and return its
 * value plus the mock state. No HTTP, no Stallion, no Cavalry.
 */
function run(body: string) {
  const state = createMockApiState();
  const api = buildMockApi(state);
  const context = vm.createContext({ api, console, state });
  const script = new vm.Script(`(function () {\n${MG_HELPERS_SOURCE}\n${body}\n})()`);
  const result = script.runInContext(context) as Record<string, unknown>;
  return { result, state, api };
}

// ------------------------------------------------------------------ P2.1

test("patch with frame writes only at the target frame and preserves neighbour tangents", () => {
  const { result, state } = run(`
    const shape = _rb.rect("Bar", 200, 40, {});
    _mg.kf(shape, "position.x", [[0, 0], [24, 200], [48, 400]], "None");
    api.modifyKeyframeTangent(shape, { "position.x": { frame: 0, outAngle: 0, outWeight: 6 } });
    api.modifyKeyframeTangent(shape, { "position.x": { frame: 24, inAngle: 10, inWeight: 5, outAngle: -4, outWeight: 7 } });
    const before = JSON.stringify(state.tangents);
    _mg.patch({ target: shape, attrs: { "position.x": 260 }, frame: 30 });
    return { before, after: JSON.stringify(state.tangents), shape };
  `);
  const before = JSON.parse(String(result.before));
  const after = JSON.parse(String(result.after));
  // neighbours 0 and 24 keep their exact tangent state
  assert.deepEqual(after, before);
  const key = `${result.shape}|position.x|30`;
  // the patch itself lands a plain keyframe at 30 with no tangent record
  assert.equal(after[key], undefined);
  const times = state.keyframes
    .filter((k) => k.layerId === result.shape && "position.x" in k.attributes)
    .map((k) => k.frame)
    .sort((a, b) => a - b);
  assert.deepEqual(times, [0, 24, 30, 48]);
});

test("patch at a frame restores the caller's keyframe selection", () => {
  const { result } = run(`
    const shape = _rb.rect("Bar", 200, 40, {});
    _mg.kf(shape, "opacity", [[0, 0], [24, 100]], "None");
    api.setSelectedKeyframeIds(["kf#1"]);
    _mg.patch({ target: shape, attrs: { opacity: 55 }, frame: 12 });
    return { selection: api.getSelectedKeyframeIds(), shape };
  `);
  assert.deepEqual(result.selection, ["kf#1"]);
});

test("_mg.kf accepts weighted cubic Bezier tuples and writes the tangents", () => {
  const { result, state } = run(`
    const shape = _rb.rect("Curvy", 100, 100, {});
    _mg.kf(shape, "position.x", [
      [0, 0, { outAngle: 0, outWeight: 8 }],
      [24, 200, { inAngle: 0, inWeight: 8, outAngle: -30, outWeight: 4 }],
      [48, 100]
    ], "None");
    return { shape };
  `);
  const shape = String(result.shape);
  const at = (frame: number) => state.tangents[`${shape}|position.x|${frame}`];
  assert.equal(at(0).outAngle, 0);
  assert.equal(at(0).outWeight, 8);
  assert.equal(at(24).inAngle, 0);
  assert.equal(at(24).inWeight, 8);
  assert.equal(at(24).outAngle, -30);
  assert.equal(at(24).outWeight, 4);
  assert.equal(at(48), undefined, "plain tuple leaves tangents untouched");
});

// ------------------------------------------------------------------ P2.2

test("_mg.keyframe maps refclone properties and bezier easing to the runtime", () => {
  const { result, state } = run(`
    const shape = _rb.rect("Box", 100, 100, {});
    const out = _mg.keyframe({ element: shape, property: "x", startFrame: 10, endFrame: 34, startValue: 0, endValue: 500, easing: { type: "cubic-bezier", y1: 0.2, y2: 1.1 } });
    return { out, shape };
  `);
  assert.equal(result.out.attrs.length, 1);
  assert.equal(result.out.attrs[0], "position.x");
  assert.notEqual(result.out.easing, "Custom", "bezier easing resolves to a real curve, never Custom");
  const frames = state.keyframes.filter((k) => k.layerId === result.shape && "position.x" in k.attributes).map((k) => k.frame);
  assert.deepEqual(frames.sort((a, b) => a - b), [10, 34]);
  const easings = state.easings.filter((e) => e.layerId === result.shape && e.attrPath === "position.x");
  assert.equal(easings.length, 1);
  assert.equal(easings[0].name, result.out.easing, "the recorded magic easing matches the reported one");
});

test("_mg.keyframe writes weighted-bezier tangents when given explicit handles", () => {
  const { result, state } = run(`
    const shape = _rb.rect("Box", 100, 100, {});
    _mg.keyframe({ element: shape, property: "y", startFrame: 0, endFrame: 30, startValue: 10, endValue: 300, easing: { type: "weighted-bezier", inWeight: 6, inAngle: -5, outWeight: 9, outAngle: 12 } });
    return { shape };
  `);
  const shape = String(result.shape);
  const start = state.tangents[`${shape}|position.y|0`];
  const end = state.tangents[`${shape}|position.y|30`];
  assert.equal(start.outAngle, 12);
  assert.equal(start.outWeight, 9);
  assert.equal(end.inAngle, -5);
  assert.equal(end.inWeight, 6);
});

test("_mg.keyframes lays multi-point tracks with per-point handles", () => {
  const { result, state } = run(`
    const shape = _rb.rect("Box", 100, 100, {});
    _mg.keyframes({ element: shape, property: "scale", points: [
      { frame: 0, value: 0 },
      { frame: 12, value: 120, handles: { outAngle: 0, outWeight: 4 } },
      { frame: 24, value: 100 }
    ], easing: "SpringOut" });
    return { shape };
  `);
  const shape = String(result.shape);
  const frames = state.keyframes.filter((k) => k.layerId === shape && "scale.x" in k.attributes).map((k) => k.frame);
  assert.deepEqual(frames.sort((a, b) => a - b), [0, 12, 24]);
  const tangents = state.tangents[`${shape}|scale.x|12`];
  assert.equal(tangents.outAngle, 0);
  assert.equal(tangents.outWeight, 4);
  const easings = state.easings.filter((e) => e.layerId === shape && e.attrPath === "scale.x");
  assert.deepEqual(easings.map((e) => e.frame).sort((a, b) => a - b), [0], "magic easing only where the point carries no explicit handles");
});

test("_mg.behavior bakes a damped spring into per-frame keyframes", () => {
  const { result, state } = run(`
    const shape = _rb.rect("Springy", 100, 100, {});
    const out = _mg.behavior({ element: shape, type: "spring", property: "y", startFrame: 5, parameters: { dampingRatio: 0.35, naturalFrequency: 6, initialValue: 0, targetValue: 200 }, duration: 40 });
    return { out, shape };
  `);
  assert.equal(result.out.type, "spring");
  const frames = state.keyframes.filter((k) => k.layerId === result.shape && "position.y" in k.attributes).map((k) => k.frame);
  assert.equal(frames.length, 41, "one keyframe per frame from 5 to 45");
  assert.deepEqual(frames.sort((a, b) => a - b)[0], 5);
  const first = state.keyframes.find((k) => k.layerId === result.shape && k.frame === 5 && "position.y" in k.attributes);
  const last = state.keyframes.find((k) => k.layerId === result.shape && k.frame === 45 && "position.y" in k.attributes);
  assert.equal(first.attributes["position.y"], 0, "spring starts at initialValue");
  assert.ok(Math.abs(last.attributes["position.y"] - 200) < 0.5, "spring settles at targetValue");
});

test("_mg.duplicator object form builds the rig with falloff and stagger", () => {
  const { result, state } = run(`
    const base = _rb.rect("Cell", 40, 40, {});
    const dupId = _mg.duplicator({ base, count: 6, distribution: "linear", size: [600, 0], stagger: { type: "temporal", lagFrames: 3, offset: 3 }, falloff: { type: "linear", influence: 0.8 } });
    return { dupId };
  `);
  const dupId = String(result.dupId);
  assert.equal(state.layers.get(dupId)!.type, "duplicator");
  const connected = state.connections.map((c) => `${c.sourceId}->${c.targetId}`);
  assert.ok(connected.some((c) => c.includes(dupId) && c.includes("falloff#") === false ? false : c.includes(dupId)), JSON.stringify(connected));
  // falloff and stagger both point at the duplicator
  assert.ok(state.connections.some((c) => c.targetId === dupId && c.sourceId.startsWith("falloff")));
  assert.ok(state.connections.some((c) => c.targetId === dupId && c.sourceId.startsWith("stagger")));
});

test("_mg.undoGroup collapses nesting into one undo pair", () => {
  const { result } = run(`
    _mg.undoGroup({ id: "outer", name: "Outer Batch", operations: () => {
      _rb.rect("A", 10, 10, {});
      _mg.undoGroup({ id: "inner", name: "Inner Batch", operations: () => {
        _rb.rect("B", 10, 10, {});
      } });
      return "done";
    } });
    return { order: state.order };
  `);
  const starts = (result.order as string[]).filter((entry) => entry.startsWith("startUndo:"));
  const ends = (result.order as string[]).filter((entry) => entry === "endUndo");
  assert.equal(starts.length, 1, JSON.stringify(result.order));
  assert.equal(ends.length, 1);
  assert.equal(starts[0], "startUndo:Outer Batch");
});

test("_mg.trim writes trim attributes and an animated trimEnd travel", () => {
  const { result, state } = run(`
    const shape = _rb.rect("Shape", 300, 20, {});
    const stroke = _rb.stroke(shape, "#FFFFFF", 4, { trim: [10, 90] });
    const out = _mg.trim(stroke, { start: 10, end: 90, travel: { inFrame: 0, outFrame: 24, from: 0, to: 100 } });
    return { out, stroke };
  `);
  assert.equal(result.out.attrs.trimStart, 10);
  const travel = result.out.travel as { attr: string; to: number };
  assert.equal(travel.attr, "trimEnd");
  assert.equal(travel.to, 100);
  const frames = state.keyframes.filter((k) => k.layerId === result.stroke && "trimEnd" in k.attributes).map((k) => k.frame);
  assert.deepEqual(frames.sort((a, b) => a - b), [0, 24]);
});

test("_mg.mask binds mask layers and reports unknown modes", () => {
  const { result, state } = run(`
    const target = _rb.rect("Target", 100, 100, {});
    const maskA = _rb.rect("MaskA", 40, 40, {});
    const out = _mg.mask(target, [{ id: maskA, mode: "alpha" }, { id: "ghost#9", mode: "weirdMode" }]);
    return { out, target };
  `);
  const applied = result.out.applied as Array<{ id: string; mode: string }>;
  assert.equal(applied.length, 2);
  assert.equal(applied[1].id, "ghost#9");
  assert.equal(applied[1].mode, "weirdMode");
  assert.ok(result.out.warnings.some((w: string) => w.includes("unknown matte mode 'weirdMode'")));
  const layer = state.layers.get(String(result.target))!;
  // both entries are written to the masks attribute; the unknown mode is
  // reported as a warning, not silently dropped
  assert.deepEqual(Array.from(layer.attrs["masks"] as string[]), [applied[0].id, "ghost#9"]);
});

test("_mg.typography and _mg.blend write the live attribute names", () => {
  const { result, state } = run(`
    const text = _rb.text("Copy", 32, {});
    _mg.typography(text, { fontSize: 44, lineHeight: 1.4, letterSpacing: 2 });
    _mg.blend(text, "multiply");
    return { text };
  `);
  const layer = state.layers.get(String(result.text))!;
  assert.equal(layer.attrs["fontSize"], 44);
  assert.equal(layer.attrs["lineSpacing"], 1.4, "lineHeight maps to the live lineSpacing attribute");
  assert.equal(layer.attrs["letterSpacing"], 2);
  assert.equal(layer.attrs["blendMode"], "multiply");
});

test("_mg.subMeshLevel maps names to levelMode and reuses an existing subMesh", () => {
  const { result } = run(`
    const text = _rb.text("Copy", 32, {});
    const first = _mg.subMeshLevel(text, "words");
    const second = _mg.subMeshLevel(text, "lines");
    return { text, first, second };
  `);
  assert.equal(result.first.created, true);
  assert.equal(result.first.levelMode, 1);
  assert.equal(result.second.created, false, "second call reuses the existing subMesh deformer");
  assert.equal(result.second.levelMode, 2);
});

test("_mg.filter attaches blur/shadow/noise nodes and toggles motionBlur", () => {
  const { result, state } = run(`
    const layer = _rb.rect("Card", 200, 100, {});
    const out = _mg.filter(layer, { motionBlur: true, gaussianBlur: { blurRadius: 8 }, dropShadow: { radius: 6, offsetY: 10, color: "#000000", opacity: 0.4 }, noise: { amount: 0.2 } });
    return { out, layer };
  `);
  assert.equal((result.out.applied as Array<{ kind: string }>).length, 4);
  const layer = state.layers.get(String(result.layer))!;
  assert.equal(layer.attrs["motionBlur"], true);
  const kinds = state.layers.get(String(result.layer))!;
  void kinds;
  const filterIds = (result.out.applied as Array<{ kind: string; id?: string }>).filter((a) => a.id).map((a) => a.id!);
  assert.equal(filterIds.length, 3);
  assert.equal(state.layers.get(filterIds[0])!.type, "gaussianBlurFilter");
  assert.equal(state.layers.get(filterIds[1])!.type, "dropShadowFilter");
  assert.equal(state.layers.get(filterIds[2])!.type, "grainFilter");
  assert.ok(state.connections.every((c) => c.targetId === result.layer), "filters connect into the target");
});

test("_mg.corner rounds a shape generator", () => {
  const { result, state } = run(`
    const shape = _rb.rect("Card", 200, 100, {});
    _mg.corner(shape, 16);
    return { shape };
  `);
  const layer = state.layers.get(String(result.shape))!;
  assert.equal(layer.attrs["generator.cornerRadius"], 16);
});

// ------------------------------------------------------------------ P2.3

test("compileInspection samples per-frame world-space state when asked", () => {
  const { result } = run(`
    const shape = _rb.rect("Mover", 100, 50, {});
    _mg.kf(shape, "position.x", [[0, 0], [24, 200]], "None");
    ${compileInspection("roots", { sampleFrames: [0, 12, 24] })}
  `);
  const payload = result as unknown as {
    samples: Record<string, Record<string, { bbox: { x: number } | null; transform: { position: [number, number] | null } }>>;
    sampledFrames: number[];
  };
  assert.deepEqual(Array.from(payload.sampledFrames ?? []), [0, 12, 24]);
  const ids = Object.keys(payload.samples["12"]);
  assert.equal(ids.length, 1);
  assert.equal(payload.samples["12"][ids[0]].transform.position![0], 100, "position.x evaluated mid-track");
  assert.equal(payload.samples["0"][ids[0]].transform.position![0], 0, "playhead restored between samples");
});
