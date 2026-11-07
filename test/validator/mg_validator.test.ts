import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ATTRIBUTE_ALIASES,
  canonicalAttribute,
  editDistance,
  fuzzyMatchPresets,
  normalizeMgManifest,
  validateMgManifest,
} from "../../src/validator/mg_validator.js";
import { PRESET_DEFS } from "../../src/presets/cavalry_snippets.js";

test("the alias table maps the documented hallucinations onto real 2.8.0 paths", () => {
  assert.equal(canonicalAttribute("fillColor"), "material.fillColor");
  assert.equal(canonicalAttribute("fill.color"), "material.fillColor");
  assert.equal(canonicalAttribute("strokeColor"), "stroke.strokeColor");
  assert.equal(canonicalAttribute("pos"), "position");
  assert.equal(canonicalAttribute("rot"), "rotation");
  assert.equal(canonicalAttribute("alpha"), "opacity");
  // Real paths are left untouched, and unknown names have no mapping.
  assert.equal(canonicalAttribute("material.fillColor"), null);
  assert.equal(canonicalAttribute("rotation"), null);
  assert.equal(canonicalAttribute("position.x"), null);
  assert.equal(canonicalAttribute("definitelyNotAnAttr"), null);
});

test("layer attrs are normalized in place and every rewrite is reported", () => {
  const result = validateMgManifest({
    layers: [
      { as: "$card", kind: "shape", shape: "rectangle", attrs: { fillColor: "#ff0055", pos: [10, 20] } },
      { as: "$label", kind: "text", text: "hi", attrs: { alpha: 0.5 } },
    ],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const fixes = result.fixes;
  assert.deepEqual(
    fixes.map(fix => [fix.from, fix.to]).sort(),
    [["alpha", "opacity"], ["fillColor", "material.fillColor"], ["pos", "position"]],
  );
  assert.equal(result.normalized.layers?.[0].attrs?.["material.fillColor"], "#ff0055");
  assert.deepEqual(result.normalized.layers?.[0].attrs?.position, [10, 20]);
  assert.equal(result.normalized.layers?.[1].attrs?.opacity, 0.5);
  assert.equal(result.normalized.layers?.[0].attrs?.fillColor, undefined);
});

test("set and keyframe op attrs are normalized with their op context in `where`", () => {
  const result = validateMgManifest({
    ops: [
      { op: "set", target: "$card", attrs: { strokeColor: "#ffffff" } },
      { op: "keyframe", target: "$card", frames: [{ frame: 0, attrs: { rot: 0 } }, { frame: 12, attrs: { rot: 90 } }] },
    ],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.normalized.ops?.[0].attrs?.["stroke.strokeColor"], "#ffffff");
  const keyframeOp = result.normalized.ops?.[1];
  assert.ok(keyframeOp && keyframeOp.op === "keyframe");
  if (keyframeOp.op !== "keyframe") return;
  assert.equal(keyframeOp.frames[0].attrs.rotation, 0);
  assert.equal(keyframeOp.frames[1].attrs.rotation, 90);
  assert.ok(result.fixes.some(fix => fix.where === "ops[0].attrs" && fix.to === "stroke.strokeColor"));
  assert.ok(result.fixes.some(fix => fix.where === "ops[1].frames[1].attrs" && fix.to === "rotation"));
});

test("a malformed manifest fails with per-entry actionable errors", () => {
  const result = validateMgManifest({
    layers: [{ as: "", kind: "shape" }],
    ops: [{ op: "warp", target: "$x" }],
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.some(error => error.includes("layers[0].as")), result.errors.join("\n"));
  assert.ok(result.errors.some(error => error.includes("ops[0]")), result.errors.join("\n"));
});

test("a non-object manifest is rejected, never thrown", () => {
  for (const input of [null, 42, "manifest", []]) {
    const result = validateMgManifest(input);
    assert.equal(result.ok, false);
  }
});

test("unknown preset ids fail with the top-3 nearest library ids", () => {
  const result = validateMgManifest({
    presets: [{ id: "counter_sprng_cout" }],
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors[0].includes("unknown preset"), result.errors[0]);
  assert.ok(Array.isArray(result.suggestions) && result.suggestions.length <= 3 && result.suggestions.length >= 1);
  for (const suggestion of result.suggestions) {
    assert.ok(PRESET_DEFS.some(def => def.id === suggestion), `suggestion ${suggestion} must exist in the library`);
  }
});

test("preset aliases auto-resolve and are reported as fixes", () => {
  const aliased = validateMgManifest({ presets: [{ id: "counter_rig" }] });
  assert.equal(aliased.ok, true);
  if (!aliased.ok) return;
  assert.equal(aliased.normalized.presets?.[0].id, "number_counter");
  assert.ok(aliased.fixes.some(fix => fix.from === "counter_rig" && fix.to === "number_counter"));
  const direct = validateMgManifest({ presets: [{ id: "number_counter" }] });
  assert.equal(direct.ok, true);
  if (!direct.ok) return;
  assert.deepEqual(direct.fixes, []);
});

test("fuzzyMatchPresets is deterministic and bounded", () => {
  const hits = fuzzyMatchPresets("counter", 3);
  assert.ok(hits.length >= 1 && hits.length <= 3);
  const scores = hits.map(hit => hit.score);
  assert.deepEqual([...scores].sort((a, b) => a - b), scores);
  assert.equal(fuzzyMatchPresets("", 3).length, 0);
});

test("editDistance is a bounded Damerau-Levenshtein", () => {
  assert.equal(editDistance("kitten", "sitting"), 3);
  assert.equal(editDistance("abc", "bac"), 1); // transposition
  assert.equal(editDistance("same", "same"), 0);
});

test("normalizeMgManifest throws only on structural errors", () => {
  const normalized = normalizeMgManifest({ ops: [{ op: "set", target: "$a", attrs: { alpha: 1 } }] });
  assert.equal(normalized.ops?.[0].attrs?.opacity, 1);
  assert.throws(() => normalizeMgManifest({ ops: [{ op: "nope" }] }), /ops\[0\]/);
});

test("the alias table is frozen and every mapping is non-trivial", () => {
  assert.equal(Object.isFrozen(ATTRIBUTE_ALIASES), true);
  for (const [from, to] of Object.entries(ATTRIBUTE_ALIASES)) {
    assert.ok(from.length > 1 && to.length > 1 && from !== to, `${from} -> ${to}`);
  }
});
