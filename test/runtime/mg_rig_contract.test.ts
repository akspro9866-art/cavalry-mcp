import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createMockApiState, buildMockApi } from "../helpers/mock-cavalry-api.js";
import { MG_HELPERS_SOURCE } from "../../src/runtime/mg_helpers.js";

/**
 * The Phase 3 contract for the _mg runtime: a re-applied spec must not duplicate
 * nodes, wires or keyframes, layers have to be addressable by the same
 * deterministic semantic id Stallion reads back over HTTP, and the rig terms
 * refclone tunes (stiffness, damping, overshoot, holdFrames, staggerOffset) must
 * mean something concrete in Cavalry 2.8.
 */
/**
 * Values that leave the vm belong to another realm, and node:assert/strict
 * compares prototypes, so every script result is normalised through JSON before
 * it is asserted on. The payloads are plain objects, numbers and strings.
 */
const plain = <T>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;

function run(body: string) {
  const state = createMockApiState();
  const api = buildMockApi(state);
  const context = vm.createContext({ api, console });
  const script = new vm.Script(`(function () {\n${MG_HELPERS_SOURCE}\n${body}\n})()`);
  const result = plain<Record<string, unknown>>(script.runInContext(context));
  return { result, state, api };
}

/** Same harness with a recording cavalry.Path, so parsed geometry is observable. */
function runSvg(body: string) {
  const state = createMockApiState();
  const api = buildMockApi(state);
  const commands: string[] = [];
  class Path {
    moveTo(x: number, y: number) { commands.push(`M${round(x)},${round(y)}`); }
    lineTo(x: number, y: number) { commands.push(`L${round(x)},${round(y)}`); }
    curveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number) {
      commands.push(`C${round(x1)},${round(y1)},${round(x2)},${round(y2)},${round(x)},${round(y)}`);
    }
    quadTo(x1: number, y1: number, x: number, y: number) {
      commands.push(`Q${round(x1)},${round(y1)},${round(x)},${round(y)}`);
    }
    closePath() { commands.push("Z"); }
  }
  const withEditable = Object.assign(api, {
    createEditable(path: Path, name: string) {
      assert.ok(path instanceof Path, "the parsed geometry must be a cavalry.Path");
      const id = api.create("shape", name);
      state.order.push(`createEditable:${name}`);
      return id;
    },
  });
  const context = vm.createContext({ api: withEditable, console, cavalry: { Path } });
  const result = plain<Record<string, unknown>>(
    new vm.Script(`(function () {\n${MG_HELPERS_SOURCE}\n${body}\n})()`).runInContext(context),
  );
  return { result, commands, state, api: withEditable };
}

const round = (value: number) => Math.round(value * 1000) / 1000;

const asRecord = (value: unknown) => value as Record<string, never>;
const field = <T>(value: unknown, key: string): T => (asRecord(value) as unknown as Record<string, T>)[key];
/** The __svgParse side-channel: { path, meta } with the geometry left in the Path. */
const metaOf = <T>(result: unknown): T => field<T>(result, "meta");

test("_mg.wire skips a connection that is already there instead of double-wiring", () => {
  const { result, state } = run(`
    const card = _mg.shape("rectangle", "Card");
    const stag = _mg.layer("stagger", "Stagger", { offset: 3 });
    const first = _mg.wire(stag, "id", card, "shapeTimeOffset");
    const again = _mg.wire(stag, "id", card, "shapeTimeOffset");
    const specForm = _mg.wire({ from: stag, fromAttr: "id", to: card, toAttr: "deformers" });
    return { card, stag, first, again, specForm };
  `);
  const { card, stag } = result as unknown as { card: string; stag: string };
  assert.equal(field(result.first, "wired"), true, "the positional form still connects");
  assert.equal(field(result.again, "wired"), false);
  assert.equal(field(result.again, "skipped"), "already-wired");
  assert.equal(field(result.again, "source"), `${stag}.id`);
  assert.equal(field(result.specForm, "wired"), true, "a different attribute is a different wire");
  // Two distinct attributes, one wire each: the duplicate never reached the bridge.
  assert.equal(state.connections.length, 2);
  assert.equal(state.order.filter(entry => entry.startsWith("connect:")).length, 2);
  assert.equal(state.connections.every(entry => entry.sourceId === stag && entry.targetId === card), true);
});

test("_mg.wire exclusive refuses another source; force sends Cavalry's replace flag", () => {
  const refused = run(`
    const card = _mg.shape("rectangle", "Card");
    const slow = _mg.layer("oscillator", "Slow", { strength: 1 });
    const fast = _mg.layer("oscillator", "Fast", { strength: 2 });
    _mg.wire(slow, "id", card, "rotation");
    try {
      _mg.wire({ from: fast, fromAttr: "id", to: card, toAttr: "rotation", exclusive: true });
      return { threw: null };
    } catch (e) {
      return { threw: String(e && e.message) };
    }
  `);
  assert.match(field<string>(refused.result, "threw"), /already driven by .*\.id/);
  assert.equal(refused.state.order.filter(entry => entry.startsWith("connect:")).length, 1);

  const forced = run(`
    const card = _mg.shape("rectangle", "Card");
    const slow = _mg.layer("oscillator", "Slow", { strength: 1 });
    const fast = _mg.layer("oscillator", "Fast", { strength: 2 });
    _mg.wire(slow, "id", card, "rotation");
    const overwrite = _mg.wire({ from: fast, fromAttr: "id", to: card, toAttr: "rotation", force: true });
    const permissive = _mg.wire({ from: slow, fromAttr: "id", to: card, toAttr: "position.x" });
    const exclusive = _mg.wire({ from: slow, fromAttr: "id", to: card, toAttr: "rotation", exclusive: true });
    return { overwrite, permissive, exclusive };
  `);
  assert.equal(field(forced.result.overwrite, "wired"), true);
  assert.equal(field(forced.result.permissive, "wired"), true);
  assert.equal(field(forced.result.exclusive, "skipped"), "already-wired", "the same source is never a conflict");
  const order = forced.state.order.filter(entry => entry.startsWith("connect:"));
  assert.equal(order.length, 3);
  // force is api.connect's fifth argument, the same convention cavalry_batch uses.
  assert.equal(order.filter(entry => entry.endsWith("!")).length, 1);
});

test("_mg.modulate retunes the modifier already on the attribute instead of stacking", () => {
  const { result, state } = run(`
    const card = _mg.shape("rectangle", "Card");
    const one = _mg.modulate(card, "position.y", { type: "organicFloat", amplitude: 12 });
    const two = _mg.modulate(card, "position.y", { type: "organicFloat", amplitude: 30 });
    const quiet = api.getCompLayers(false).length;
    const strength = api.get(one.nodes[0], "strength");
    const forced = _mg.modulate(card, "position.y", { type: "organicFloat", amplitude: 44, force: true });
    return {
      card, one, two, quiet, strength,
      firstNode: one.nodes[0],
      forcedNode: forced.nodes[0],
      forcedStrength: api.get(forced.nodes[0], "strength"),
      forcedReused: forced.reused.length,
      loud: api.getCompLayers(false).length,
    };
  `);
  assert.deepEqual(field(result.two, "nodes"), field(result.one, "nodes"), "the same noise node drives the attribute");
  assert.equal(field(result.two, "created"), 0);
  assert.deepEqual(field(result.two, "reused"), field(result.one, "nodes"));
  assert.equal(result.strength, 30, "the last amplitude wins on the single node");
  assert.equal(result.quiet, 2, "card plus one noise node, even after two modulations");
  assert.notEqual(result.forcedNode, result.firstNode, "force builds the second node instead of retuning the first");
  assert.equal(result.forcedStrength, 44);
  assert.equal(result.forcedReused, 0, "a forced pass reuses nothing");
  assert.equal(result.loud, 3, "force is the documented escape hatch for a second node");
  assert.equal(state.connections.filter(entry => entry.targetAttr === "position.y").length, 2);
});

test("_mg.modulate staggerFalloff reuses its stagger and falloff pair", () => {
  const { result, state } = run(`
    const base = _mg.shape("rectangle", "Grid");
    const dup = _mg.duplicator(base, "linear", 6, [600, 0]);
    const one = _mg.modulate(dup, "shapeTimeOffset", { type: "staggerFalloff", offset: 4, falloff: { strength: 80 } });
    const two = _mg.modulate(dup, "shapeTimeOffset", { type: "staggerFalloff", offset: 9, falloff: { strength: 55 } });
    return {
      dup, one, two,
      offset: api.get(two.stagger, "offset"),
      strength: api.get(two.falloff, "strength"),
      layers: api.getCompLayers(false).length,
    };
  `);
  const one = result.one as { stagger: string; falloff: string; created: number };
  const two = result.two as { stagger: string; falloff: string; created: number; reused: { stagger: boolean; falloff: boolean } };
  assert.equal(two.stagger, one.stagger);
  assert.equal(two.falloff, one.falloff);
  assert.equal(two.created, 0);
  assert.equal(two.reused.stagger, true);
  assert.equal(two.reused.falloff, true);
  assert.equal(result.offset, 9);
  assert.equal(result.strength, 55);
  // base + duplicator + one stagger + one falloff; the second pass added nothing.
  assert.equal(result.layers, 4);
  assert.equal(state.connections.filter(entry => entry.targetId === result.dup).length, 2);
});

test("_mg.modulate spring samples rig terms and is idempotent on an identical re-run", () => {
  const { result, state } = run(`
    const card = _mg.shape("rectangle", "Card");
    const first = _mg.modulate(card, "position.x", { type: "spring", rest: 0, stiffness: 1, dampingRatio: 0.35, duration: 30, startFrame: 4, amplitude: 60 });
    const again = _mg.modulate(card, "position.x", { type: "spring", rest: 0, stiffness: 1, dampingRatio: 0.35, duration: 30, startFrame: 4, amplitude: 60 });
    const retuned = _mg.modulate(card, "position.x", { type: "spring", rest: 0, stiffness: 4, dampingRatio: 0.35, duration: 30, startFrame: 4, amplitude: 60 });
    const stiff = _mg.modulate(card, "rotation", { type: "spring", stiffness: 220, dampingRatio: 0.35, duration: 30 });
    return { card, first, again, retuned, stiff, frames: api.getKeyframeTimes(card, "position.x") };
  `);
  const card = result.card as string;
  const first = result.first as {
    keyframes: number; cycles: number; dampingRatio: number; stiffness: number; overshoot: number;
    aliased: boolean; rest: number; restSource: string;
  };
  assert.equal(first.stiffness, 1);
  assert.equal(first.dampingRatio, 0.35);
  assert.ok(Math.abs(first.cycles - 4.47) < 0.02, `one rad/frame over 30 frames is ~4.47 cycles, got ${first.cycles}`);
  assert.ok(first.overshoot > 0.25 && first.overshoot < 0.35, "zeta 0.35 overshoots by about 30%");
  assert.equal(first.aliased, false);
  assert.equal(first.rest, 0);
  assert.equal(first.restSource, "spec", "a pinned rest is the spec's, not whatever the playhead holds");
  const again = result.again as { skipped?: string; keyframes: number; applied?: number };
  assert.equal(again.skipped, "already-sampled");
  assert.equal(again.keyframes, first.keyframes);
  assert.equal(again.applied, undefined, "the skipped path writes nothing");
  const frames = result.frames as number[];
  assert.equal(frames.length, first.keyframes);
  assert.equal(frames[0], 4, "startFrame is where the sample window begins");
  // Same sample window, different rig: skipping would freeze the old curve, so
  // the keys are replaced in place and the count stays the same.
  const retuned = result.retuned as { skipped?: string; keyframes: number; retuned: boolean };
  assert.equal(retuned.skipped, undefined, "a retuned rig is never reported as already sampled");
  assert.equal(retuned.retuned, true);
  assert.equal(retuned.keyframes, first.keyframes);
  assert.equal(frames.length, retuned.keyframes, "the frame times are the same grid, not a second one");
  // Stiffness the sample budget cannot hold is reported instead of turned into noise.
  const stiff = result.stiff as { aliased: boolean; cycles: number; restSource: string };
  assert.equal(stiff.aliased, true, `220 over 30 frames is ${stiff.cycles} cycles across 15 samples`);
  assert.equal(stiff.restSource, "layer", "an unpinned rest is still read from the layer, as before");
  assert.equal(state.keyframes.filter(entry => entry.layerId === card && "rotation" in entry.attributes).length > 0, true);
  const mid = state.keyframes.filter(entry => entry.layerId === card && entry.frame === 12 && "position.x" in entry.attributes);
  assert.equal(mid.length, 2, "retuning re-keyed the frame instead of extending the track");
  const firstSample = Number(mid[0].attributes["position.x"]);
  const retunedSample = Number(mid[1].attributes["position.x"]);
  assert.ok(Math.abs(firstSample) > Math.abs(retunedSample), `k=4 decays faster than k=1 at frame 12: ${firstSample} then ${retunedSample}`);
  assert.ok(retunedSample !== 0 || firstSample !== 0, "the two passes are not the same curve");
  const last = state.keyframes
    .filter(entry => entry.layerId === card && entry.frame === frames[frames.length - 1] && "position.x" in entry.attributes)
    .pop();
  assert.equal(last?.attributes["position.x"], 0, "the window settles back on the pinned rest");
});

test("an unpinned spring rest reads the playhead, which is why a replayed rig pins it", () => {
  const { result } = run(`
    const card = _mg.shape("rectangle", "Card");
    const derived = _mg.modulate(card, "position.x", { type: "spring", duration: 30, startFrame: 4, amplitude: 60, damping: 6, frequency: 2.25 });
    // Once the rig is keyed, the layer's own evaluated value is what api.get
    // answers with: re-running unpinned would settle the spring on frame 4's
    // sample instead of on the layer. Pinning rest removes the dependency.
    api.setFrame(4);
    const rerun = _mg.modulate(card, "position.x", { type: "spring", duration: 30, startFrame: 4, amplitude: 60, damping: 6, frequency: 2.25, force: true });
    const pinned = _mg.modulate(card, "scale.x", { type: "spring", rest: 1, duration: 30, startFrame: 4, amplitude: 0.4, damping: 6, frequency: 2.25 });
    return { derived, rerun, pinned };
  `);
  const derived = result.derived as { rest: number; restSource: string };
  assert.equal(derived.restSource, "layer");
  assert.equal(derived.rest, 0, "an untouched layer sits at zero, so the curve is the plain cosine");
  const rerun = result.rerun as { rest: number, retuned: boolean };
  assert.equal(rerun.rest, 60, "the unpinned rest followed the playhead — documented, not accidental");
  const pinned = result.pinned as { rest: number; restSource: string; amplitude: number };
  assert.equal(pinned.restSource, "spec");
  assert.equal(pinned.rest, 1, "a pinned equilibrium is used verbatim at any playhead");
  assert.equal(pinned.amplitude, 0.4);
});

test("_mg.rig maps the five tunables onto the routes Cavalry 2.8 actually has", () => {
  const { result } = run(`
    const stiff = _mg.rig({ stiffness: 400, mass: 1, dampingRatio: 0.2 });
    const tuned = _mg.rig({ stiffness: 100, overshoot: 0.05 });
    const critical = _mg.rig({ stiffness: 100, dampingRatio: 1.2 });
    const coefficient = _mg.rig({ stiffness: 100, damping: 30 });
    const timing = _mg.rig({ holdFrames: 6, staggerOffset: 3 });
    const defaulted = _mg.rig({});
    return { stiff, tuned, critical, coefficient, timing, defaulted };
  `);
  const stiff = result.stiff as Record<string, number | string | boolean>;
  assert.equal(stiff.angularFrequency, 20, "omega0 = sqrt(k/m) in radians per frame");
  assert.equal(stiff.dampingCoefficient, 8, "c = 2 zeta omega0 m");
  assert.ok(Math.abs((stiff.overshoot as number) - 0.527) < 0.002, `zeta 0.2 overshoots about 52.7%, got ${stiff.overshoot}`);
  assert.equal(stiff.easing, "OvershootOut");
  const tuned = result.tuned as Record<string, number | string>;
  assert.ok(Math.abs(tuned.dampingRatio - 0.69) < 0.01, "an overshoot target inverts to a damping ratio");
  assert.equal(tuned.easing, "SpringOut");
  const critical = result.critical as Record<string, number | string | boolean>;
  assert.equal(critical.underdamped, false);
  assert.equal(critical.easing, "SlowOut", "an overdamped spring must not pick a springy curve");
  const coefficient = result.coefficient as Record<string, number>;
  assert.equal(coefficient.dampingRatio, 1.5, "a coefficient above 1 reads as c/(2*sqrt(k*m)), clamped at 1.5");
  const timing = result.timing as Record<string, number>;
  assert.equal(timing.holdFrames, 6);
  assert.equal(timing.staggerOffset, 3);
  const defaulted = result.defaulted as Record<string, number | string | boolean>;
  assert.equal(defaulted.stiffness, 100);
  assert.equal(defaulted.dampingRatio, 0.5);
  assert.equal(defaulted.holdFrames, 0);
  assert.equal(defaulted.underdamped, true);
});

test("rig terms drive ease, stagger and modulate without a new call shape", () => {
  const { result, state } = run(`
    const a = _mg.shape("rectangle", "A");
    const b = _mg.shape("rectangle", "B");
    const held = _mg.ease(a, "position.y", { inFrame: 0, outFrame: 20, from: 300, to: 0, holdFrames: 6 });
    const sprung = _mg.ease(b, "position.x", { inFrame: 0, outFrame: 20, from: 0, to: 300, stiffness: 400, dampingRatio: 0.2 });
    const named = _mg.ease(b, "opacity", { inFrame: 0, outFrame: 20, from: 0, to: 100, magicEasing: "ExpoOut", stiffness: 400 });
    const offset = _mg.stagger([a, b], { attr: "scale.x", inFrame: 0, outFrame: 10, from: 0.4, to: 1, staggerOffset: 3 });
    return { a, b, held, sprung, named, offset };
  `);
  assert.equal(field(result.held, "inFrame"), 6, "holdFrames delays the move, it does not stretch it");
  assert.equal(field(result.held, "holdFrames"), 6);
  assert.equal(field(result.held, "outFrame"), 20);
  assert.equal(field(result.sprung, "easing"), "OvershootOut");
  assert.equal(field(result.named, "easing"), "VerySlowOut", "an explicit easing name still wins over the rig guess");
  assert.equal(field(result.offset, "staggerOffset"), 3);
  assert.equal(field(result.offset, "delayFrames"), 3, "the original key is still reported");
  const sprungFrames = state.keyframes
    .filter(entry => entry.layerId === result.b && "position.x" in entry.attributes)
    .map(entry => entry.frame);
  assert.deepEqual(sprungFrames, [0, 20]);
  const scaleFrames = state.keyframes
    .filter(entry => entry.layerId === result.b && "scale.x" in entry.attributes)
    .map(entry => entry.frame);
  assert.deepEqual(scaleFrames, [3, 13], "the follower is offset by staggerOffset");
});

test("semantic ids follow the Stallion readback scheme and address a patch", () => {
  const { result, state, api } = run(`
    const group = _mg.layer("group", "beat 02");
    const card = _mg.shape("rectangle", "card spring");
    const dot = _mg.shape("ellipse", "card spring");
    const all = _mg.semantics();
    const sem = _mg.semantic(card);
    const patched = _mg.patch({ semantic: sem, attrs: { "position.x": 240 } });
    const again = _mg.patch({ semantic: sem, attrs: { "position.x": 240 } });
    const bySlug = _mg.patch({ semantics: ["card_spring"], attrs: { opacity: 60 } });
    const twice = _mg.patch({ semantics: ["card_spring"], attrs: { opacity: 60 } });
    return { group, card, dot, all, sem, patched, again, bySlug, twice };
  `);
  const card = result.card as string;
  const index = (api.getCompLayers(false) as string[]).indexOf(card);
  assert.ok(index >= 0);
  assert.equal(result.sem, `card_spring_${index}`, "slug(niceName)_compIndex, the same scheme as Introspect.ts");
  assert.equal((result.all as unknown[]).length, 3);
  const slugRows = result.all as Array<{ semanticId: string; name: string; type: string }>;
  assert.deepEqual(slugRows.map(row => row.semanticId), [
    `beat_02_0`,
    `card_spring_1`,
    `card_spring_2`,
  ]);
  assert.equal(slugRows[0].name, "beat 02");
  const patched = result.patched as { patched: number; changes: Array<{ semantic: string; id: string }>; targets: string[]; semantics: string[] };
  assert.equal(patched.patched, 1);
  assert.deepEqual(patched.targets, [card]);
  assert.deepEqual(patched.semantics, [result.sem]);
  assert.equal(patched.changes[0].semantic, result.sem);
  assert.equal(api.get(card, "position.x"), 240);
  const again = result.again as { patched: number; skipped: Array<{ reason: string; attr: string; semantic: string }> };
  assert.equal(again.patched, 0, "re-applying the same spec writes nothing");
  assert.equal(again.skipped.length, 1);
  assert.equal(again.skipped[0].reason, "unchanged");
  assert.equal(again.skipped[0].attr, "position.x");
  assert.equal(again.skipped[0].semantic, result.sem);
  // A bare slug addresses every layer that shares the label.
  const bySlug = result.bySlug as { patched: number; targets: string[] };
  assert.equal(bySlug.patched, 2);
  assert.deepEqual(bySlug.targets, [card, result.dot]);
  assert.equal((result.twice as { patched: number }).patched, 0);
  assert.equal((result.twice as { skipped: unknown[] }).skipped.length, 2);
  assert.equal(api.get(result.dot as string, "opacity"), 60);
  // Nothing was duplicated by any of it.
  assert.equal((api.getCompLayers(false) as string[]).length, 3);
  assert.equal(state.keyframes.length, 0, "static semantic writes do not keyframe");
});

test("semantic addressing rejects an unknown id and keeps literal ids working", () => {
  assert.throws(
    () => run(`
      _mg.shape("rectangle", "Card");
      return _mg.patch({ semantic: "not_in_this_comp", attrs: { "position.x": 1 } });
    `),
    /no layer in the active comp matches not_in_this_comp/,
  );
  const { result, state, api } = run(`
    const card = _mg.shape("rectangle", "Card");
    const literal = _mg.patch({ target: card, attrs: { "position.y": 5 } });
    const forced = _mg.patch({ target: card, attrs: { "position.y": 5 }, force: true });
    const framed = _mg.patch({ target: card, attrs: { "position.y": 77 }, frame: 12 });
    const array = _mg.patch([
      { target: card, attrs: { "position.y": 77 } },
      { target: card, attrs: { "position.y": 90 } },
    ]);
    return { card, literal, forced, framed, array };
  `);
  assert.equal(field(result.literal, "patched"), 1);
  assert.equal(field(result.forced, "patched"), 1, "force writes even an identical value");
  // A frame-targeted keyframe is never diffed: 2.8 has no value-at-frame getter.
  assert.equal(field(result.framed, "patched"), 1);
  assert.equal(field(result.framed, "skipped").length, 0);
  const keyed = state.keyframes.filter(entry => entry.layerId === result.card && "position.y" in entry.attributes);
  assert.deepEqual(keyed.map(entry => entry.frame), [12]);
  // An unchanged entry inside a batch is skipped while its neighbour still writes.
  assert.equal(Array.isArray(result.array), true);
  assert.deepEqual((result.array as Array<{ patched: number }>).map(entry => entry.patched), [0, 1]);
  // api.get still answers 77: a keyed attribute evaluates from its keys, exactly
  // like the real app, so the static write is checked where it lands.
  assert.equal(api.get(result.card as string, "position.y"), 77, "the frame-12 key still drives the evaluated value");
  assert.equal(state.layers.get(result.card as string).attrs["position.y"], 90, "the batch's second entry wrote its value");
  // No id-shaped target string is sent through the comp walk twice.
  assert.equal((api.getCompLayers(false) as string[]).length, 1);
});

test("_mg.patchSelected addresses layers by semantic id", () => {
  const { result, api } = run(`
    const card = _mg.shape("rectangle", "beat card");
    const other = _mg.shape("rectangle", "unrelated");
    const sem = _mg.semantic(card);
    const out = _mg.patchSelected({ semantic: sem, color: "#11AA33", opacity: 55 });
    return { card, other, sem, out, opacity: api.get(card, "opacity"), otherOpacity: api.get(other, "opacity") };
  `);
  const out = result.out as { patched: number; ids: string[] };
  assert.deepEqual(out.ids, [result.card], "only the addressed layer and its children are walked");
  assert.ok(out.patched >= 1);
  assert.equal(result.opacity, 55);
  assert.notEqual(result.otherOpacity, 55, "the sibling the id does not name stays alone");
});

test("_mg.svg keeps the raw geometry by default and normalizes on request", () => {
  const raw = runSvg(`return _mg.__svgParse("M0,0 L10,0 C10,5 5,10 0,10 Z");`);
  assert.deepEqual(raw.commands, ["M0,0", "L10,0", "C10,5,5,10,0,10", "Z"]);
  assert.equal(metaOf<{ subpaths: number }>(raw.result).subpaths, 1);

  const offset = runSvg(`return _mg.__svgParse("M120,40 L220,40 L220,140 L120,140 Z", { viewBox: "120 40 100 100" });`);
  assert.deepEqual(offset.commands, ["M0,0", "L100,0", "L100,100", "L0,100", "Z"]);

  const centered = runSvg(`return _mg.__svgParse("M100,100 L200,100 L200,200 L100,200 Z", { center: true });`);
  assert.deepEqual(centered.commands, ["M-50,-50", "L50,-50", "L50,50", "L-50,50", "Z"]);

  const fitted = runSvg(`return _mg.__svgParse("M0,0 L400,0 L400,200 L0,200 Z", { scaleTo: 100 });`);
  assert.deepEqual(fitted.commands, ["M0,0", "L100,0", "L100,50", "L0,50", "Z"]);
  const fittedMeta = metaOf<{ bounds: { width: number; height: number }; scale: number }>(fitted.result);
  assert.equal(fittedMeta.bounds.width, 100, "the reported bounds are the ones the geometry was fitted to");
  assert.equal(fittedMeta.bounds.height, 50);

  const flipped = runSvg(`return _mg.__svgParse("M0,0 L0,100", { flipY: true });`);
  assert.deepEqual(flipped.commands, ["M0,0", "L0,-100"]);

  const relative = runSvg(`return _mg.__svgParse("m10,10 l20,0 h10 v10 z", { viewBox: { x: 10, y: 10, width: 40, height: 20 } });`);
  assert.deepEqual(relative.commands, ["M0,0", "L20,0", "L30,0", "L30,10", "Z"]);

  // Nothing requested: the geometry reaches cavalry.Path untouched.
  const identity = metaOf<{ viewBox: unknown; center: boolean; flipY: boolean; scale: number }>(raw.result);
  assert.equal(identity.viewBox, null, "no viewBox means no re-anchoring");
  assert.equal(identity.center, false);
  assert.equal(identity.flipY, false);
  assert.equal(identity.scale, 1, "the default transform is the identity");
  assert.equal(typeof field(raw.result, "path"), "object", "the Path is still handed back to the caller");
});

test("_mg.svg reports compound sub-paths and refuses to mis-parse an arc", () => {
  const compound = runSvg(`return _mg.__svgParse("M0,0 L10,0 L10,10 Z M4,4 L6,4 L6,6 Z");`);
  const meta = metaOf<{ subpaths: number; unsupported: string[]; commands: number }>(compound.result);
  assert.equal(meta.subpaths, 2, "the counter is a second contour, not extra line noise");
  assert.deepEqual(meta.unsupported, []);
  assert.equal(meta.commands, 8, "M L L Z per contour, so the second triangle is a real sub-path");

  const arcs = runSvg(`return _mg.__svgParse("M0,0 A10,10 0 0 1 20,20 L30,30");`);
  const arcMeta = metaOf<{ unsupported: string[]; subpaths: number }>(arcs.result);
  assert.deepEqual(arcMeta.unsupported, ["A"]);
  assert.deepEqual(arcs.commands, ["M0,0", "L30,30"], "an arc's seven numbers cannot leak into the next command");

  const smooth = runSvg(`return _mg.__svgParse("M0,0 C0,10 10,20 20,20 S40,30 50,40 T70,80");`);
  assert.deepEqual(smooth.commands, [
    "M0,0",
    "C0,10,10,20,20,20",
    "C30,20,40,30,50,40",
    "Q60,50,70,80",
  ], "S and T reflect the previous control point instead of being dropped");

  const reported = runSvg(`
    const comp = _mg.comp(320, 180, 24, 60, "#000000");
    return _mg.svg(comp, { d: "M10,10 L110,10 L110,110 Z", name: "Mark", report: true, center: true });
  `);
  const outcome = reported.result as unknown as {
    id: string; route: string; subpaths: number; commands: number; bounds: { width: number; height: number };
  };
  assert.equal(typeof outcome.id, "string");
  assert.equal(outcome.route, "path", "the inline path route ran, not the asset loader");
  assert.equal(outcome.subpaths, 1);
  assert.equal(outcome.bounds.width, 100);
  assert.ok(reported.state.order.includes("createEditable:Mark"));

  const minimal = runSvg(`
    const comp = _mg.comp(320, 180, 24, 60, "#000000");
    return { id: _mg.svg(comp, { d: "M0,0 L10,0 Z", name: "Tiny" }) };
  `);
  assert.equal(typeof minimal.result.id, "string", "the default return shape is unchanged");
});
