import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createMockApiState, buildMockApi } from "./mock-cavalry-api.js";
import { MG_HELPERS_SOURCE } from "../src/runtime/mg_helpers.js";
import { compilePreset } from "../src/presets/cavalry_snippets.js";

/**
 * Run a body with the full _mg/_rb runtime in the headless mock and return its
 * value plus the mock layers. No HTTP, no Stallion, no Cavalry.
 */
function run(body: string) {
  const state = createMockApiState();
  const api = buildMockApi(state);
  const context = vm.createContext({ api, console });
  const script = new vm.Script(`(function () {\n${MG_HELPERS_SOURCE}\n${body}\n})()`);
  const result = script.runInContext(context) as Record<string, unknown>;
  return { result, state, api };
}

test("patchSelected mutates selection in place: colours, text, size, opacity", () => {
  const { result, state } = run(`
    const card = _rb.rect("Card", 320, 180, { fill: "#111111", x: 100, y: 50 });
    const label = _rb.text("Old label", 32, { color: "#FFFFFF", x: 100, y: 50 });
    api.select([card, label]);
    const before = api.getCompLayers(true).length;
    const patch = _mg.patchSelected({
      fill: "#FF6600",
      text: "New label",
      fontSize: 44,
      opacity: 80
    });
    return { patch, before, after: api.getCompLayers(true).length, card: card, label: label };
  `);
  assert.equal(result.before, 2);
  assert.equal(result.after, 2, "no layers are created or destroyed");
  const card = state.layers.get(result.card as string)!;
  const label = state.layers.get(result.label as string)!;
  assert.equal(card.attrs["material.materialColor"].r, 255);
  assert.equal(card.attrs["material.materialColor"].g, 102);
  assert.equal(card.attrs.opacity, 80);
  assert.equal(label.attrs.text, "New label");
  assert.equal(label.attrs.fontSize, 44);
  assert.equal((result.patch as { patched: number }).patched, 2);
});

test("patchSelected retimes keyframes, applies easing and retunes duplicators", () => {
  const { result, state } = run(`
    const bar = _rb.rect("Bar", 40, 8, { x: 0, y: 0 });
    _rb.kf(bar, "position.x", [[0, 0], [10, 120], [20, 240]], "Linear");
    const dup = _rb.dup(bar, { distribution: "grid", columns: 4, rows: 3, width: 600, height: 300 });
    api.select([bar, dup]);
    const patch = _mg.patchSelected({
      duplicator: { count: [6, 2], size: [800, 240] },
      shiftKeyframes: 12,
      easing: "BounceOut"
    });
    return { patch, bar: bar, dup: dup };
  `);
  const bar = state.layers.get(result.bar as string)!;
  const dup = state.layers.get(result.dup as string)!;
  assert.deepEqual(bar.attrs["generator.count"], undefined);
  assert.deepEqual(Array.from(dup.attrs["generator.count"] as number[]), [6, 2]);
  assert.deepEqual(Array.from(dup.attrs["generator.size"] as number[]), [800, 240]);
  const frames = state.keyframes.filter((k) => k.layerId === result.bar && "position.x" in k.attributes).map((k) => k.frame);
  assert.deepEqual(frames.sort((a, b) => a - b), [12, 22, 32]);
  assert.equal(state.keyframes.length, 3, "retiming does not duplicate keyframes");
  const easings = state.easings.filter((e) => e.layerId === result.bar);
  assert.deepEqual(easings.map((e) => e.name), ["None", "None", "BounceOut", "BounceOut", "BounceOut"]);
});

test("patchSelected falls back to the last preset's tracked roots", () => {
  const preset = compilePreset("bento_cards", {});
  const { result, state } = run(`
    (function () {
      ${preset}
    })();
    const before = api.getCompLayers(true).length;
    const patch = _mg.patchSelected({ color: "#11AA33" });
    return { before, after: api.getCompLayers(true).length, patch: patch };
  `);
  assert.equal(result.before, result.after, "preset patched without rebuilding");
  const patch = result.patch as { preset: string; patched: number; ids: string[] };
  assert.equal(patch.preset, "bento_cards");
  assert.ok(patch.patched >= 1, `expected the card shape touched, got ${patch.patched}`);
  const card = state.layers.get((patch.ids as string[])[0])!;
  const cardFill = card.attrs["material.materialColor"] as { r: number; g: number; b: number };
  assert.equal(cardFill.r, 0x11);
  assert.equal(cardFill.g, 0xaa);
  assert.equal(cardFill.b, 0x33);
  const fills = state.layers
    .values()
    .map((layer) => layer.attrs["material.materialColor"])
    .filter(Boolean) as Array<{ r: number; g: number; b: number }>;
  assert.ok(fills.some((fill) => fill.r === 0x11 && fill.g === 0xaa && fill.b === 0x33), "fill rewritten in place");
});

test("patchSelected addresses text by tracked key", () => {
  const preset = compilePreset("kinetic_text", { text: "OLD COPY" });
  const { result, state } = run(`
    (function () {
      ${preset}
    })();
    api.select([]);
    const patch = _mg.patchSelected({ target: "preset", text: { text: "NEW COPY" } });
    return { patch: patch };
  `);
  const texts = [...state.layers.values()].filter((layer) => layer.type === "textShape");
  assert.equal(texts.length, 1);
  assert.equal(texts[0].attrs.text, "NEW COPY");
  assert.equal((result.patch as { preset: string }).preset, "kinetic_text");
});

test("patchSelected throws with a useful message when there is nothing to patch", () => {
  assert.throws(
    () => run(`return _mg.patchSelected({ color: "#fff" });`),
    /No layers selected and no preset roots tracked/,
  );
});

test("syncToFrames pulse writes scale keyframes on every beat", () => {
  const { result, state } = run(`
    const box = _rb.rect("Pulse", 200, 120, { x: 0, y: 0 });
    api.select([box]);
    const sync = _mg.syncToFrames([10, 20], { type: "pulse", duration: 4, peak: 1.25 });
    return { sync, box: box };
  `);
  const sync = result.sync as { applied: number; mode: string; frames: number[] };
  assert.equal(sync.mode, "pulse");
  assert.deepEqual([...sync.frames], [10, 20]);
  assert.equal(sync.applied, 4, "two beats x scale.x/scale.y");
  const scaleKeys = state.keyframes.filter((k) => k.layerId === result.box && "scale.x" in k.attributes);
  assert.deepEqual(scaleKeys.map((k) => k.frame).sort((a, b) => a - b), [9, 12, 14, 19, 22, 24]);
  assert.equal(scaleKeys.find((k) => k.frame === 12)?.attributes["scale.x"], 1.25);
});

test("syncToFrames snap retimes keyframes to the nearest beat", () => {
  const { result, state } = run(`
    const card = _rb.rect("Snap", 100, 60, { x: 0, y: 0 });
    _rb.kf(card, "position.y", [[3, 0], [17, 80]], "Linear");
    api.select([card]);
    const sync = _mg.syncToFrames([0, 15], { type: "snap" });
    return { sync, card: card };
  `);
  const frames = state.keyframes
    .filter((k) => k.layerId === result.card && "position.y" in k.attributes)
    .map((k) => k.frame)
    .sort((a, b) => a - b);
  assert.deepEqual(frames, [0, 15]);
  assert.equal((result.sync as { applied: number }).applied, 2);
});

test("syncToFrames stagger connects a stagger node and ramps a duplicator on beat", () => {
  const { result, state } = run(`
    const dot = _rb.circle("Dot", 6, { fill: "#10B981", x: 0, y: 0 });
    const dup = _rb.dup(dot, { distribution: "linear", count: 8, size: 800 });
    api.select([dup]);
    const sync = _mg.syncToFrames([0, 10, 20], { type: "stagger", offset: 10 });
    return { sync, dup: dup };
  `);
  const sync = result.sync as { mode: string; applied: number };
  assert.equal(sync.mode, "stagger");
  const staggerConnection = state.connections.find(
    (c) => c.targetId === result.dup && c.targetAttr === "shapeTimeOffset",
  );
  assert.ok(staggerConnection, "stagger connected to shapeTimeOffset");
  const stagger = state.layers.get(staggerConnection.sourceId)!;
  assert.equal(stagger.type, "stagger");
  const countKeys = state.keyframes.filter((k) => k.layerId === result.dup && "generator.count" in k.attributes);
  assert.deepEqual(countKeys.map((k) => k.attributes["generator.count"]), [2, 4, 6]);
});

test("syncToFrames accepts a callback and rejects an empty beat list", () => {
  const { result } = run(`
    const seen = [];
    const sync = _mg.syncToFrames([0, 12, 24], function (frame, index) { seen.push(frame + ":" + index); });
    return { sync, seen };
  `);
  assert.deepEqual(Array.from(result.seen as string[]), ["0:0", "12:1", "24:2"]);
  assert.equal((result.sync as { mode: string }).mode, "callback");
  assert.throws(() => run(`return _mg.syncToFrames([], "pulse");`), /no valid frames/);
});
