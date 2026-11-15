/**
 * Idempotent `_mg` prelude primitive tests — run with `npm test`.
 *
 * Every primitive must check for existing layer ids / behaviour connections
 * via deterministic naming before creating anything: a retry or incremental
 * patch mutates the existing attributes in place instead of duplicating
 * layers, keyframes or stagger offsets.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createMockApiState, buildMockApi } from "../helpers/mock-cavalry-api.js";
import { MG_HELPERS_SOURCE } from "../../src/runtime/mg_helpers.js";

function run(body: string) {
  const state = createMockApiState();
  const api = buildMockApi(state);
  const context = vm.createContext({ api, console });
  const raw = new vm.Script(`(function () {\n${MG_HELPERS_SOURCE}\n${body}\n})()`).runInContext(context) as Record<string, unknown>;
  // vm-realm objects carry a different Object.prototype, which breaks
  // deepStrictEqual's prototype check — round-trip through JSON so the tests
  // compare plain host-realm values.
  const result = (raw === undefined ? undefined : JSON.parse(JSON.stringify(raw))) as Record<string, unknown>;
  return { result: (result ?? {}) as Record<string, unknown>, state, api };
}

test("_mg.svg reuses an existing deterministic named layer instead of duplicating", () => {
  const { result } = run(`
    api.create("basicShape", "hero_logo");
    const first = _mg.svg(null, { name: "hero_logo", pos: { x: 10, y: 20 }, scale: 2, report: true });
    const countAfterFirst = api.getCompLayers(false).length;
    // Retry with the SAME deterministic name — the reuse path fires before any
    // asset loading or path parsing.
    const second = _mg.svg(null, { name: "hero_logo", pos: { x: 99, y: 9 }, scale: 3, report: true });
    const moved = api.get(first.id, "position");
    const scaled = api.get(first.id, "scale");
    return { first, second, countAfterFirst, countAfterSecond: api.getCompLayers(false).length, moved, scaled };
  `);
  const first = result.first as { id: string; reused: boolean };
  const second = result.second as { id: string; reused: boolean };
  assert.equal(first.reused, true, "the existing named layer is reused, not duplicated");
  assert.equal(second.reused, true, "retry reports reuse");
  assert.equal(second.id, first.id, "retry addresses the same layer id");
  assert.equal(result.countAfterFirst, result.countAfterSecond, "no duplicate layer is created");
  assert.deepEqual(result.moved, { x: 99, y: 9 }, "position mutated in place");
  assert.equal(result.scaled, 3, "scale mutated in place");
});

test("_mg.svg with reuse:false refuses to fall back to a reused layer", () => {
  const { result } = run(`
    api.create("basicShape", "hard_new_vector");
    let outcome = null;
    try {
      outcome = { id: _mg.svg(null, { name: "hard_new_vector", reuse: false, d: "M0 0 H10" }) };
    } catch (e) {
      // The mock build has no api.createEditable, so the forced creation path
      // throws — proving reuse was NOT applied.
      outcome = { error: String(e) };
    }
    return { outcome, count: api.getCompLayers(false).length };
  `);
  const outcome = result.outcome as { error?: string; id?: string };
  assert.ok(outcome.error, "reuse:false attempted the creation path (which this mock cannot serve)");
  assert.match(outcome.error ?? "", /createEditable/);
});

test("_mg.ease skips an identical boundary write on retry", () => {
  const { result } = run(`
    const card = _mg.shape("rectangle", "ease_card");
    const first = _mg.ease(card, "position.x", { inFrame: 0, outFrame: 30, from: 0, to: 200, magicEasing: "SpringOut" });
    const timesAfterFirst = (api.getKeyframeTimes(card, "position.x") || []).slice().sort((a, b) => a - b);
    const second = _mg.ease(card, "position.x", { inFrame: 0, outFrame: 30, from: 0, to: 200, magicEasing: "SpringOut" });
    const timesAfterSecond = (api.getKeyframeTimes(card, "position.x") || []).slice().sort((a, b) => a - b);
    return { first, second, timesAfterFirst, timesAfterSecond };
  `);
  const first = result.first as { reused: boolean };
  const second = result.second as { reused: boolean };
  assert.equal(first.reused, false);
  assert.equal(second.reused, true, "identical boundary keyframes are detected and skipped");
  assert.deepEqual(result.timesAfterFirst, result.timesAfterSecond, "no duplicate keyframes were stacked");
  assert.deepEqual(result.timesAfterSecond, [0, 30]);
});

test("_mg.ease with force:true rewrites despite an identical prior write", () => {
  const { result } = run(`
    const card = _mg.shape("rectangle", "force_card");
    _mg.ease(card, "position.x", { inFrame: 0, outFrame: 30, from: 0, to: 200 });
    const forced = _mg.ease(card, "position.x", { inFrame: 0, outFrame: 30, from: 0, to: 200, force: true });
    return { forced };
  `);
  assert.equal((result.forced as { reused: boolean }).reused, false, "force bypasses the reuse probe");
});

test("_mg.stagger no-ops on an identical retry and re-applies with force", () => {
  const { result } = run(`
    const a = _mg.shape("rectangle", "stg_a");
    const b = _mg.shape("rectangle", "stg_b");
    const first = _mg.stagger([a, b], { attr: "position.x", inFrame: 0, outFrame: 24, from: 0, to: 100, delayFrames: 4 });
    const timesAfterFirst = (api.getKeyframeTimes(b, "position.x") || []).slice().sort((x, y) => x - y);
    const second = _mg.stagger([a, b], { attr: "position.x", inFrame: 0, outFrame: 24, from: 0, to: 100, delayFrames: 4 });
    const timesAfterSecond = (api.getKeyframeTimes(b, "position.x") || []).slice().sort((x, y) => x - y);
    const forced = _mg.stagger([a, b], { attr: "position.x", inFrame: 0, outFrame: 24, from: 0, to: 100, delayFrames: 4, force: true });
    return { first, second, forced, timesAfterFirst, timesAfterSecond };
  `);
  const first = result.first as { applied: unknown[]; reused: boolean };
  const second = result.second as { applied: unknown[]; reused: boolean };
  const forced = result.forced as { applied: unknown[]; reused: boolean };
  assert.equal(first.reused, false);
  assert.equal(first.applied.length, 2);
  assert.equal(second.reused, true, "identical stagger is marked and skipped");
  assert.deepEqual(second.applied, [], "no layer was re-offset on the retry");
  assert.deepEqual(result.timesAfterFirst, result.timesAfterSecond, "keyframes unchanged across the retry");
  assert.equal(forced.reused, false, "force re-applies");
  assert.equal(forced.applied.length, 2);
});

test("_mg.patch diffs identical attribute writes and dedupes frame keyframes", () => {
  const { result } = run(`
    const card = _mg.shape("rectangle", "patched_hero");
    const spec = { target: card, attrs: { "position.x": 40, "position.y": 80 } };
    const first = _mg.patch(spec);
    const countAfterFirst = api.getCompLayers(false).length;
    const second = _mg.patch(spec);
    const countAfterSecond = api.getCompLayers(false).length;
    // Frame-targeted writes go through patchKeyframeSafe: the keyframe is
    // rewritten in place, never stacked.
    _mg.patch({ target: card, attrs: { "position.x": 240 }, frame: 24 });
    const timesAfterFirst = (api.getKeyframeTimes(card, "position.x") || []).slice().sort((a, b) => a - b);
    _mg.patch({ target: card, attrs: { "position.x": 260 }, frame: 24 });
    const timesAfterSecond = (api.getKeyframeTimes(card, "position.x") || []).slice().sort((a, b) => a - b);
    return { first, second, countAfterFirst, countAfterSecond, timesAfterFirst, timesAfterSecond };
  `);
  const second = result.second as { patched: number; skipped: Array<{ reason?: string }> };
  assert.equal(result.countAfterFirst, result.countAfterSecond, "patch never duplicates layers");
  assert.equal(second.patched, 0, "the identical retry writes nothing");
  assert.ok(second.skipped.length >= 2, "every unchanged attribute is reported as skipped");
  assert.ok(second.skipped.every((entry) => entry.reason === "unchanged"));
  assert.deepEqual(result.timesAfterFirst, result.timesAfterSecond, "repeated frame writes do not stack keyframes");
  assert.deepEqual(result.timesAfterSecond, [24]);
});

test("__mg_patch creates deterministically named layers once and dedupes keyframes", async () => {
  const { state } = run("");
  const api = buildMockApi(state);
  const context = vm.createContext({ api, console });
  vm.runInContext(MG_HELPERS_SOURCE, context);
  const { IDEMPOTENT_PATCH_SOURCE } = await import("../../src/dsl/mg-runtime.js");
  vm.runInContext(IDEMPOTENT_PATCH_SOURCE, context);
  const result = vm.runInContext(`(function () {
    const spec = {
      type: "rectangle",
      name: "deterministic_hero",
      attrs: { "material.materialColor": "#101828" },
      keyframes: { "position.y": [{ frame: 0, value: 10 }, { frame: 30, value: -90 }] }
    };
    __mg_patch("deterministic_hero", spec);
    const heroId = (globalThis.__mg_aliases || {}).deterministic_hero;
    const countAfterFirst = api.getCompLayers(false).length;
    const firstTimes = (api.getKeyframeTimes(heroId, "position.y") || []).slice().sort((a, b) => a - b);
    __mg_patch("deterministic_hero", spec);
    const countAfterSecond = api.getCompLayers(false).length;
    const secondTimes = (api.getKeyframeTimes(heroId, "position.y") || []).slice().sort((a, b) => a - b);
    return { heroId: String(heroId), countAfterFirst, countAfterSecond, firstTimes, secondTimes };
  })()`, context) as Record<string, unknown>;
  assert.equal(result.countAfterFirst, result.countAfterSecond, "a retry reuses the deterministically named layer");
  assert.deepEqual(result.secondTimes, [0, 30], "keyframes are deduped, not stacked");
});

test("_mg.wire refuses a second identical connection (connection idempotency)", () => {
  const { result } = run(`
    const src = _mg.shape("rectangle", "wire_src");
    const dst = _mg.shape("rectangle", "wire_dst");
    const first = _mg.wire(src, "id", dst, "rotation");
    const second = _mg.wire(src, "id", dst, "rotation");
    return { first, second };
  `);
  const first = result.first as { wired: boolean };
  const second = result.second as { wired: boolean; skipped?: string };
  assert.equal(first.wired, true);
  assert.equal(second.wired, false, "the second identical wire is refused");
  assert.equal(second.skipped, "already-wired");
});
