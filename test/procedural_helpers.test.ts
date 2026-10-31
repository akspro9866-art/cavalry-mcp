import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createMockApiState, buildMockApi } from "./mock-cavalry-api.js";
import { MG_HELPERS_SOURCE } from "../src/runtime/mg_helpers.js";

/**
 * Run a body with the full _mg/_rb runtime in the headless mock. The prelude is
 * the same string injected into every Cavalry execution, so these assertions are
 * the runtime contract refclone's DSL compiles against.
 */
function run(body: string) {
  const state = createMockApiState();
  const api = buildMockApi(state);
  const context = vm.createContext({ api, console });
  const script = new vm.Script(`(function () {\n${MG_HELPERS_SOURCE}\n${body}\n})()`);
  const result = script.runInContext(context) as Record<string, unknown>;
  return { result, state, api };
}

test("_mg.ease writes two boundary keyframes and normalizes non-Cavalry preset names", () => {
  const { result, state } = run(`
    const block = _mg.shape("rectangle", "Block");
    const applied = _mg.ease(block, "position.y", {
      inFrame: 0, outFrame: 10, from: 100, to: 0, magicEasing: "ExpoOut"
    });
    const scale = _mg.ease(block, "scale", {
      inFrame: 2, outFrame: 8, from: 0.5, to: 1, easing: { kind: "preset", name: "CubicInOut" }
    });
    return { applied, scale };
  `);
  const applied = result.applied as { easing: string; attrs: string[] };
  assert.equal(applied.easing, "VerySlowOut");
  assert.equal(applied.attrs.join(","), "position.y");
  assert.equal((result.scale as { attrs: string[] }).attrs.join(","), "scale.x,scale.y");
  assert.equal(state.keyframes.filter(k => k.layerId === state.keyframes[0].layerId && "position.y" in k.attributes).map(k => k.frame).join(","), "0,10");
  assert.deepEqual(state.easings.filter(e => e.attrPath === "position.y").map(e => e.name), ["VerySlowOut"]);
  assert.equal(state.easings.filter(e => e.attrPath === "scale.x")[0].name, "SlowInSlowOut");
});

test("a bezier without a preset maps to the closest accepted curve, never Custom", () => {
  const { result, state } = run(`
    const block = _mg.shape("rectangle", "Back");
    const back = _mg.ease(block, "position.x", {
      inFrame: 0, outFrame: 20, from: 0, to: 300, bezier: [0.34, 1.56, 0.64, 1]
    });
    const sharp = _mg.ease(block, "position.y", {
      inFrame: 0, outFrame: 20, from: 0, to: 300, easing: { kind: "bezier", handles: [0.78, 0.02, 0.98, 0.9] }
    });
    return { back, sharp };
  `);
  assert.equal((result.back as { easing: string }).easing, "OvershootOut");
  assert.equal((result.sharp as { easing: string }).easing, "VerySlowIn");
  const accepted = new Set([
    "None", "SlowIn", "SlowOut", "SlowInSlowOut", "VerySlowIn", "VerySlowOut",
    "VerySlowInVerySlowOut", "SpringIn", "SpringOut", "SpringInSpringOut",
    "AnticipateIn", "OvershootOut", "AnticipateInOvershootOut", "BounceOut",
  ]);
  for (const entry of state.easings) {
    assert.notEqual(entry.name, "Custom");
    assert.equal(accepted.has(entry.name), true, `unexpected easing ${entry.name}`);
  }
});

test("_mg.stagger offsets every follower's keyframes by delayFrames", () => {
  const { result, state } = run(`
    const a = _mg.shape("rectangle", "A");
    const b = _mg.shape("rectangle", "B");
    const c = _mg.shape("rectangle", "C");
    return _mg.stagger([a, b, c], {
      attr: "position.y", inFrame: 0, outFrame: 10, from: 50, to: 0, delayFrames: 2,
      easing: { kind: "preset", name: "QuarticOut" }
    });
  `);
  assert.deepEqual((result as { delayFrames: number }).delayFrames, 2);
  const ids = (result as { ids: string[] }).ids;
  for (let index = 0; index < ids.length; index += 1) {
    const frames = state.keyframes
      .filter(entry => entry.layerId === ids[index] && "position.y" in entry.attributes)
      .map(entry => entry.frame)
      .sort((left, right) => left - right);
    assert.deepEqual(frames, [index * 2, 10 + index * 2]);
    assert.equal(state.easings.find(entry => entry.layerId === ids[index])?.name, "SlowOut");
  }
});

test("_mg.patch applies deltas and absolute values in place, at a frame when given", () => {
  const { result, state, api } = run(`
    const box = _mg.shape("rectangle", "Box", { position: { x: 10, y: 20 } });
    const first = _mg.patch({ target: box, delta: { "position.x": 5 } });
    const second = _mg.patch({ target: box, attrs: { "position.y": 80 }, frame: 12 });
    const viaSelected = _mg.patchSelected({ target: box, delta: { "position.y": -5 } });
    return { box, first, second, viaSelected, layers: api.getCompLayers(true).length };
  `);
  const box = result.box as string;
  assert.equal(result.layers, 1);
  assert.equal(api.get(box, "position.x"), 15);
  // The absolute value with a frame is a keyframe, not a static set.
  const keyed = state.keyframes.filter(entry => entry.layerId === box && "position.y" in entry.attributes);
  assert.deepEqual(keyed.map(entry => entry.frame), [12]);
  assert.equal(keyed[0].attributes["position.y"], 80);
  // patchSelected delegates deltas to patch; the mock base attribute stays 20.
  assert.equal(api.get(box, "position.y"), 15);
  assert.deepEqual((result.first as { changes: unknown[] }).changes.length, 1);
  assert.equal((result.second as { changes: { frame: number }[] }).changes[0].frame, 12);
});

test("_mg.svg imports an SVG asset, parents it and applies pose", () => {
  const { result, state } = run(`
    const parent = _mg.shape("rectangle", "Parent");
    const mark = _mg.svg(parent, {
      path: "C:/tmp/mark.svg", name: "Mark", pos: { x: 40, y: 50 }, scale: 2
    });
    return { parent, mark };
  `);
  const mark = result.mark as string;
  assert.equal(state.layers.get(mark)?.type, "imageAsset");
  assert.equal(state.parents.get(mark), result.parent);
  // Values come from the vm realm, so compare fields rather than prototypes.
  const pose = state.layers.get(mark)?.attrs.position as { x: number; y: number };
  assert.equal(pose.x, 40);
  assert.equal(pose.y, 50);
  assert.equal(state.layers.get(mark)?.attrs.scale, 2);
  assert.equal(state.assets.length, 1);
  assert.ok(state.order.includes(`loadAsset:C:/tmp/mark.svg`));
});

test("_mg.svg builds an editable path from d when cavalry.Path exists", () => {
  const state = createMockApiState();
  let api = buildMockApi(state);
  const commands: string[] = [];
  class Path {
    moveTo(x: number, y: number) { commands.push(`M${x},${y}`); }
    lineTo(x: number, y: number) { commands.push(`L${x},${y}`); }
    curveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number) { commands.push(`C${x1},${y1},${x2},${y2},${x},${y}`); }
    closePath() { commands.push("Z"); }
  }
  api = Object.assign(api, {
    createEditable(path: Path, name: string) {
      assert.ok(path instanceof Path);
      const id = api.create("shape", name);
      state.order.push(`createEditable:${name}`);
      return id;
    },
  });
  const context = vm.createContext({ api, console, cavalry: { Path } });
  const result = new vm.Script(`(function () {\n${MG_HELPERS_SOURCE}\n
    const comp = _mg.comp(320, 180, 24, 60, "#000000");
    const mark = _mg.svg(comp, { d: "M0,0 L10,0 C10,5 5,10 0,10 Z", name: "Blob", pos: { x: 5, y: 6 } });
    return { comp, mark };
  \n})()`).runInContext(context) as { comp: string; mark: string };
  assert.deepEqual(commands, ["M0,0", "L10,0", "C10,5,5,10,0,10", "Z"]);
  assert.ok(state.order.includes("createEditable:Blob"));
  // Parenting to the active comp is a no-op, not an invalid parent call.
  assert.equal(state.parents.get(result.mark), undefined);
  const pose = state.layers.get(result.mark)?.attrs.position as { x: number; y: number };
  assert.equal(pose.x, 5);
  assert.equal(pose.y, 6);
});

test("_mg.svg explains the missing editable-path route instead of faking success", () => {
  const state = createMockApiState();
  const api = buildMockApi(state);
  assert.equal(typeof (api as { createEditable?: unknown }).createEditable, "undefined");
  assert.throws(
    () => run(`return _mg.svg(null, { d: "M0,0 L1,1" });`),
    /no api\.createEditable.*spec\.path|new cavalry\.Path\(\) is unavailable/i,
  );
});

test("the runtime never sends the Custom magic-easing name", () => {
  assert.equal(/api\.magicEasing\([^)]*"Custom"/.test(MG_HELPERS_SOURCE), false);
  for (const name of ["svg", "ease", "stagger", "patch", "patchSelected"]) {
    assert.match(MG_HELPERS_SOURCE, new RegExp(`\\n  ${name}\\(`));
  }
});
