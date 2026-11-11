import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { listPresets, searchPresets, resolvePreset, PRESET_DEFS } from "../src/presets/index.js";

describe("cavalry-mcp: presets library tests", () => {
  test("preset definitions cover the full catalog", () => {
    assert.ok(PRESET_DEFS.length >= 120, `expected >= 120 presets, found ${PRESET_DEFS.length}`);
    const list = listPresets();
    assert.equal(list.length, PRESET_DEFS.length);
  });

  test("searchPresets returns matching presets by keyword", () => {
    const results = searchPresets("spring");
    assert.ok(results.matched > 0);
    assert.ok(results.presets.length > 0);
    assert.ok(results.presets[0].id.length > 0);
  });

  test("resolvePreset compiles valid executable script and rig parameters", () => {
    const resolved = resolvePreset("spring_text_reveal", { stiffness: 100, damping: 10 });
    assert.equal(resolved.ok, true);
    if (resolved.ok) {
      assert.equal(resolved.presetId, "spring_text_reveal");
      assert.ok(resolved.script.length > 0);
    }
  });

  test("resolvePreset rejects unknown preset with error", () => {
    const bad = resolvePreset("non_existent_preset_xyz");
    assert.equal(bad.ok, false);
  });
});
