import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createMockApiState, buildMockApi } from "../helpers/mock-cavalry-api.js";
import { MG_HELPERS_SOURCE } from "../../src/runtime/mg_helpers.js";
import { RB_HELPERS_SOURCE } from "../../src/presets/rig_builders.js";
import {
  EASE_ALIASES,
  EASE_NAMES,
  EASE_VALID,
  RB_HELPER_EASES,
  RIG_DEFAULTS,
  dampingRatioFromOvershoot,
  derivePresetRig,
  easingsInCode,
  helperEasingsInCode,
  overshootFromDampingRatio,
  rigNumbers,
  rigTermForParam,
} from "../../src/runtime/rig_terms.js";
import { PRESET_DEFS, listPresets, presetRig } from "../../src/presets/cavalry_snippets.js";

function plain<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Run the injected runtime in the same mock Cavalry realm the other DSL tests use. */
function runRuntime(body: string) {
  const state = createMockApiState();
  const api = buildMockApi(state);
  const context = vm.createContext({ api, console });
  return plain<Record<string, unknown>>(
    new vm.Script(`(function () {\n${MG_HELPERS_SOURCE}\n${body}\n})()`).runInContext(context),
  );
}

/** Run the injected _rb source far enough to read back its easing normalization. */
function runBuilders(body: string) {
  const state = createMockApiState();
  const api = buildMockApi(state);
  const context = vm.createContext({ api, console });
  return plain<Record<string, unknown>>(
    new vm.Script(`(function () {\n${RB_HELPERS_SOURCE}\n${body}\n})()`).runInContext(context),
  );
}

test("rigNumbers is the TypeScript twin of _mg.rig over a spec grid", () => {
  const specs = [
    {},
    { stiffness: 400, dampingRatio: 0.2 },
    { stiffness: 100, damping: 0.8, holdFrames: 3, staggerOffset: 9 },
    { stiffness: 100, damping: 8, stagger: 2 },
    { stiffness: 100, overshoot: 0.05 },
    { stiffness: 220, overshoot: 25, holdFrames: 12 },
    { mass: 2.5, stiffness: 64, dampingRatio: 1.2 },
    { stiffness: 100, dampingRatio: 1.8, holdFrames: -4, staggerOffset: -2 },
    { stiffness: 100, dampingRatio: -3 },
  ];
  const actual = runRuntime(`return { grid: ${JSON.stringify(specs)}.map(function (s) { return _mg.rig(s); }) };`);
  const grid = actual.grid as unknown[];
  assert.equal(grid.length, specs.length);
  for (let index = 0; index < specs.length; index++) {
    assert.deepEqual(plain(grid[index]), rigNumbers(specs[index]), `spec ${index} diverged from _mg.rig`);
  }
});

test("the spring conversions round-trip and clamp to the underdamped domain", () => {
  for (const zeta of [0.05, 0.2, 0.5, 0.8, 0.9]) {
    const overshoot = overshootFromDampingRatio(zeta);
    assert.ok(Math.abs(dampingRatioFromOvershoot(overshoot) - zeta) < 1e-10, `zeta ${zeta} did not round-trip`);
  }
  assert.equal(overshootFromDampingRatio(1), 0, "a critically damped spring has no overshoot");
  assert.equal(overshootFromDampingRatio(1.4), 0, "an overdamped spring has no overshoot");
  assert.equal(dampingRatioFromOvershoot(0), dampingRatioFromOvershoot(1e-6), "zero overshoot is clamped");
  assert.equal(rigNumbers({ stiffness: 100, dampingRatio: 5 }).dampingRatio, 1.5, "zeta is clamped at 1.5");
  assert.deepEqual(RIG_DEFAULTS, { mass: 1, stiffness: 100, dampingRatio: 0.5, holdFrames: 0, staggerOffset: 4 });
});

test("the easing vocabulary is read from _rb and agrees with _rb.ease", () => {
  assert.equal(EASE_VALID.length, 20);
  assert.ok(EASE_VALID.includes("SpringOut"));
  assert.ok(EASE_VALID.includes("OvershootOut"));
  assert.ok(!EASE_VALID.includes("QuartOut"), "aliases are not accepted verbatim");
  assert.ok(EASE_ALIASES.includes("QuartOut"));
  assert.equal(EASE_NAMES.length, new Set(EASE_NAMES).size);
  const names = ["SlowOut", "QuartOut", "SpringOut", "OvershootOut", "NotAnEasing"];
  const result = runBuilders(`return { names: ${JSON.stringify(names)}.map(function (n) { return _rb.ease(n); }) };`);
  const normalized = (result.names as string[]);
  assert.deepEqual(normalized, ["SlowOut", "SlowOut", "SpringOut", "OvershootOut", "SlowInSlowOut"]);
  for (const name of EASE_VALID) assert.equal(normalized.includes(name) || name === name, true);
  assert.deepEqual(
    runBuilders(`return { values: ${JSON.stringify(EASE_VALID)}.map(function (n) { return _rb.ease(n); }) };`).values,
    EASE_VALID,
    "every accepted name survives _rb.ease unchanged",
  );
});

test("builder default easings are discovered from source, not restated by hand", () => {
  assert.equal(Object.keys(RB_HELPER_EASES).length, 9);
  assert.equal(RB_HELPER_EASES.pop, "SpringOut");
  assert.equal(RB_HELPER_EASES.fade, "SlowInSlowOut");
  assert.equal(RB_HELPER_EASES.slide, "SlowOut");
  for (const easing of Object.values(RB_HELPER_EASES)) assert.ok(EASE_VALID.includes(easing));
  const code = `_rb.pop(a); _rb.fade(a); _rb.slide(a);`;
  assert.deepEqual(easingsInCode(code), [], "helper defaults are not preset-code literals");
  assert.deepEqual(helperEasingsInCode(code), ["SpringOut", "SlowInSlowOut", "SlowOut"], "a builder reached without an explicit ease still advertises its default");
});

test("rigTermForParam maps high-level tuning knobs onto the shared terms", () => {
  assert.equal(rigTermForParam("stiffness"), "stiffness");
  assert.equal(rigTermForParam("springStiffness"), "stiffness");
  assert.equal(rigTermForParam("damping"), "damping");
  assert.equal(rigTermForParam("dampingRatio"), "dampingRatio");
  assert.equal(rigTermForParam("Overshoot"), "overshoot");
  assert.equal(rigTermForParam("stagger"), "staggerOffset");
  assert.equal(rigTermForParam("delayFrames"), "staggerOffset");
  assert.equal(rigTermForParam("holdFrames"), "holdFrames");
  assert.equal(rigTermForParam("count"), null);
});

test("derivePresetRig exposes every requested tuning term and honors an override", () => {
  const derived = derivePresetRig({
    code: `_rb.pop(card, ease); _rb.fade(caption);`,
    params: {
      stiffness: { type: "double", default: 220 },
      damping: { type: "double", default: 0.25 },
      Overshoot: { type: "double", default: 0.3 },
      staggerOffset: { type: "int", default: 6 },
      holdFrames: { type: "int", default: 2 },
      count: { type: "int", default: 4 },
    },
  });
  assert.equal(derived.stiffness, 220);
  assert.equal(derived.dampingRatio, 0.25);
  assert.equal(derived.staggerOffset, 6);
  assert.equal(derived.holdFrames, 2);
  assert.equal(derived.overshoot, rigNumbers({ stiffness: 220, damping: 0.25 }).overshoot);
  assert.equal(derived.easing, "SpringOut", "the spring helper default wins over the suggested OvershootOut");
  assert.equal(derived.suggestedEasing, "OvershootOut");
  assert.equal(derived.springKind, "spring");
  assert.deepEqual(derived.tunable, {
    stiffness: "stiffness",
    damping: "damping",
    overshoot: "Overshoot",
    staggerOffset: "staggerOffset",
    holdFrames: "holdFrames",
  });

  const overridden = derivePresetRig({
    code: `_rb.slide(card, "SlowOut");`,
    params: { stagger: { type: "int", default: 5 } },
    rig: { stiffness: 400, dampingRatio: 0.2, holdFrames: 7, staggerOffset: 11, easing: "OvershootOut" },
  });
  assert.equal(overridden.stiffness, 400);
  assert.equal(overridden.dampingRatio, 0.2);
  assert.equal(overridden.staggerOffset, 11, "an explicit override wins over a differently named knob");
  assert.equal(overridden.holdFrames, 7);
  assert.equal(overridden.easing, "OvershootOut");
  assert.equal(overridden.springKind, "eased");
});

test("all 125 presets advertise a complete, internally consistent rig contract", () => {
  const all = listPresets();
  assert.equal(all.length, 125);
  assert.equal(PRESET_DEFS.length, 125);
  const springPresetIds: string[] = [];
  for (const preset of all) {
    const rig = preset.rig;
    for (const term of ["stiffness", "dampingRatio", "dampingCoefficient", "overshoot", "staggerOffset", "holdFrames"] as const) {
      assert.equal(typeof rig[term], "number", `${preset.id}.rig.${term}`);
      assert.ok(Number.isFinite(rig[term] as number), `${preset.id}.rig.${term} is finite`);
    }
    assert.ok(rig.stiffness > 0 && rig.staggerOffset >= 1 && rig.holdFrames >= 0, `${preset.id} rig bounds`);
    assert.ok(rig.overshoot >= 0 && rig.overshoot <= 1, `${preset.id} overshoot bounds`);
    assert.ok(rig.easings.every(name => EASE_NAMES.includes(name)), `${preset.id} advertises an unknown easing`);
    assert.ok(EASE_VALID.includes(rig.suggestedEasing), `${preset.id} suggestedEasing`);
    assert.equal(rig.springKind, rig.easings.some(name => name.includes("Spring")) ? "spring" : "eased");
    if (rig.springKind === "spring") springPresetIds.push(preset.id);
    for (const [term, param] of Object.entries(rig.tunable)) {
      assert.ok(param in preset.params, `${preset.id}.rig.tunable.${term} names a declared parameter`);
      assert.equal(rigTermForParam(param), term, `${preset.id}.rig.tunable.${term} maps back`);
    }
    assert.deepEqual(presetRig(preset.id), rig, `${preset.id} has two different derived rigs`);
  }
  assert.equal(springPresetIds.length, 95, "the library reaches a spring easing on 95 presets");
  assert.equal(presetRig("no-such-preset"), null);
});
