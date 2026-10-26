import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {
  PRESET_DEFS,
  PRESET_NAMES,
  PRESET_CATEGORIES,
  PRESET_ALIASES,
  resolvePresetName,
  hasPreset,
  getPreset,
  compilePreset,
  listPresets,
} from "../src/presets/cavalry_snippets.js";
import { RB_HELPERS_SOURCE } from "../src/presets/rig_builders.js";

const CATEGORY_TOTAL = 14;

/** Mock Cavalry bridge: records calls, returns stable ids, never touches a real app. */
function makeApi() {
  let next = 0;
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const log = (method: string, args: unknown[]) => {
    calls.push({ method, args });
  };
  const api = {
    select: (...args: unknown[]) => log("select", args),
    getSelection: (...args: unknown[]) => {
      log("getSelection", args);
      return [];
    },
    create: (type: string, name?: string) => {
      log("create", [type, name]);
      next += 1;
      return `${type}#${next}`;
    },
    primitive: (type: string, name?: string) => {
      log("primitive", [type, name]);
      next += 1;
      return `basicShape#${next}`;
    },
    set: (...args: unknown[]) => log("set", args),
    setGenerator: (...args: unknown[]) => log("setGenerator", args),
    keyframe: (...args: unknown[]) => log("keyframe", args),
    magicEasing: (...args: unknown[]) => log("magicEasing", args),
    connect: (...args: unknown[]) => log("connect", args),
    parent: (...args: unknown[]) => log("parent", args),
    deleteLayer: (...args: unknown[]) => log("deleteLayer", args),
    get: (...args: unknown[]) => {
      log("get", args);
      return 0;
    },
    getBoundingBox: (...args: unknown[]) => {
      log("getBoundingBox", args);
      return { centre: { x: 0, y: 0 }, width: 120, height: 60 };
    },
  };
  return { api, calls };
}

function runCompiled(code: string) {
  const { api, calls } = makeApi();
  const ctx = vm.createContext({ api, console });
  const script = new vm.Script(`(function () {\n${RB_HELPERS_SOURCE}\n${code}\n})()`);
  const result = script.runInContext(ctx) as { preset?: string } & Record<string, unknown>;
  return { result, calls };
}

/** One override per param type, built from the preset's own param metadata. */
function typedOverrides(def: (typeof PRESET_DEFS)[number]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, param] of Object.entries(def.params)) {
    switch (param.type) {
      case "string": out[key] = "Smoke Test"; break;
      case "int": out[key] = 7; break;
      case "double": out[key] = 1.5; break;
      case "bool": out[key] = true; break;
      case "color": out[key] = "#123456"; break;
      case "json": out[key] = [1, 2, 3]; break;
    }
  }
  return out;
}

test("registry: 120 unique presets spanning 14 catalogued categories", () => {
  assert.equal(PRESET_DEFS.length, 120);
  assert.equal(PRESET_NAMES.length, 120);
  assert.equal(PRESET_CATEGORIES.length, CATEGORY_TOTAL);
  const ids = PRESET_DEFS.map((def) => def.id);
  assert.equal(new Set(ids).size, 120);
  assert.deepEqual([...PRESET_NAMES], ids);
  for (const def of PRESET_DEFS) {
    assert.ok(PRESET_CATEGORIES.some((cat) => cat.id === def.category), `${def.id} has an unknown category`);
    assert.ok(def.title.length > 0 && def.description.length > 0, `${def.id} needs copy`);
    assert.match(def.code, /track\(/, `${def.id} should expose a tracked layer`);
  }
});

test("registry: category distribution is 5 x 4 + 10 x 10", () => {
  const counts = new Map<string, number>();
  for (const def of PRESET_DEFS) counts.set(def.category, (counts.get(def.category) ?? 0) + 1);
  for (const cat of PRESET_CATEGORIES) {
    const [start, end] = cat.presets.split("-").map(Number);
    assert.equal(counts.get(cat.id), end - start + 1, `${cat.id} preset count`);
  }
});

test("listPresets: filters by id, category id, category index and label", () => {
  assert.equal(listPresets().length, 120);
  assert.equal(listPresets("fintech_billing").length, 10);
  assert.equal(listPresets("9").length, 10);
  assert.equal(listPresets("social_proof_cta").length, 10);
  assert.equal(listPresets("trust_badges_row").length, 1);
  assert.equal(listPresets("no-such-category").length, 0);
});

test("aliases: legacy ids resolve and compile with translated parameters", () => {
  assert.equal(resolvePresetName("bento_grid"), "bento_cards");
  assert.equal(resolvePresetName("spring_card"), "bento_cards");
  assert.equal(resolvePresetName("counter_rig"), "number_counter");
  assert.equal(resolvePresetName("bg_grid"), "dot_matrix_bg");
  for (const alias of Object.keys(PRESET_ALIASES)) assert.ok(hasPreset(alias), alias);
  const grid = compilePreset("bg_grid", { count: [2, 3], scaleStrength: 50, dotSize: 4 });
  assert.match(grid, /"cols":2/);
  assert.match(grid, /"rows":3/);
  assert.match(grid, /"amp":0.5/);
  assert.match(grid, /"dotSize":4/);
  const sheet = compilePreset("spring_card", {});
  assert.match(sheet, /"count":\[1,1\]/);
});

test("compile: defaults and typed overrides produce parseable scripts for all 120", () => {
  for (const def of PRESET_DEFS) {
    const defaultCode = compilePreset(def.id, {});
    assert.ok(defaultCode.includes(`preset: "${def.id}"`), `${def.id} return tag`);
    new vm.Script(`(function () {\n${defaultCode}\n})()`, { filename: `${def.id}.defaults.js` });
    const overrideCode = compilePreset(def.id, typedOverrides(def));
    assert.ok(overrideCode.includes(JSON.stringify(def.id)), `${def.id} override tag`);
    new vm.Script(`(function () {\n${overrideCode}\n})()`, { filename: `${def.id}.overrides.js` });
  }
});

test("execute: every preset runs against a mock bridge with defaults", () => {
  for (const def of PRESET_DEFS) {
    const code = compilePreset(def.id, {});
    const { result, calls } = runCompiled(code);
    assert.equal(result.preset, def.id, `${def.id} return payload`);
    for (const [key, value] of Object.entries(result)) {
      if (key === "preset") continue;
      assert.equal(typeof value, "string", `${def.id} tracked ${key} should be a layer id`);
      assert.ok((value as string).length > 0, `${def.id} tracked ${key} empty`);
    }
    assert.ok(
      calls.some((call) => call.method === "keyframe" || call.method === "connect"),
      `${def.id} should animate via keyframes or a connected generator`,
    );
  }
});

test("execute: every preset survives full typed overrides", () => {
  for (const def of PRESET_DEFS) {
    const code = compilePreset(def.id, typedOverrides(def));
    const { result } = runCompiled(code);
    assert.equal(result.preset, def.id, `${def.id} override run`);
  }
});

test("bridge safety: dashPattern is serialized as a string (Cavalry 2.8 rejects arrays)", () => {
  let seen = 0;
  for (const def of PRESET_DEFS) {
    const { calls } = runCompiled(compilePreset(def.id, {}));
    for (const call of calls) {
      if (call.method !== "set") continue;
      const attrs = call.args[1] as Record<string, unknown> | undefined;
      if (attrs && "dashPattern" in attrs) {
        seen += 1;
        assert.equal(typeof attrs.dashPattern, "string", `${def.id} dashPattern`);
      }
    }
  }
  assert.ok(seen >= 4, `expected dashed presets to exercise dashPattern, saw ${seen}`);
});

test("getPreset: unknown ids are rejected", () => {
  assert.equal(getPreset("does_not_exist"), undefined);
  assert.throws(() => compilePreset("does_not_exist", {}), /Unknown preset/);
});
