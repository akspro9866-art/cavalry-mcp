import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { wrapAtomicUndo } from "../src/dsl/undo-wrapper.js";
import { createMgRuntimeSource } from "../src/dsl/mg-runtime.js";
import { applyMgPatch, compileMgBatch, validateSceneSpecV2 } from "../src/lib/index.js";

describe("cavalry-mcp: dsl and schema tests", () => {
  test("wrapAtomicUndo wraps body in IIFE with try/finally cavalry.endUndoGroup()", () => {
    const wrapped = wrapAtomicUndo('api.set("layer1", { opacity: 0.5 });', "test_group");
    assert.ok(wrapped.includes('(function() {'));
    assert.ok(wrapped.includes('cavalry.beginUndoGroup("test_group");'));
    assert.ok(wrapped.includes('api.set("layer1", { opacity: 0.5 });'));
    assert.ok(wrapped.includes('finally {'));
    assert.ok(wrapped.includes('cavalry.endUndoGroup();'));
  });

  test("createMgRuntimeSource includes idempotent patch logic", () => {
    const src = createMgRuntimeSource();
    assert.ok(src.includes('createMgRuntime'));
    assert.ok(src.includes('patch: function __mg_patch'));
  });

  test("applyMgPatch formats idempotent _mg.patch call", () => {
    const patch = applyMgPatch("card1", { attrs: { opacity: 1 } });
    assert.equal(patch, '_mg.patch("card1", {"attrs":{"opacity":1}});');
  });

  test("validateSceneSpecV2 validates strict SceneSpecV2 schema and rejects extra properties", () => {
    const validSpec = {
      version: "2.0" as const,
      resolution: [1920, 1080] as [number, number],
      fps: 60,
      layers: [
        {
          id: "card_1",
          type: "uiCard",
          name: "Card 1",
          attrs: { radius: 14 },
        },
      ],
    };

    const validRes = validateSceneSpecV2(validSpec);
    assert.equal(validRes.valid, true);
    assert.ok(validRes.data);

    // Extra property rejected by .strict()
    const invalidSpec = {
      ...validSpec,
      extraProp: "not_allowed",
    };
    const invalidRes = validateSceneSpecV2(invalidSpec);
    assert.equal(invalidRes.valid, false);
    assert.ok(invalidRes.errors && invalidRes.errors.length > 0);
  });

  test("compileMgBatch compiles SceneSpecV2 into atomic undo batch", () => {
    const spec = {
      version: "2.0" as const,
      resolution: [1920, 1080] as [number, number],
      fps: 60,
      layers: [
        { id: "hero", type: "rectangle", attrs: { fill: "#ffffff" } },
      ],
    };
    const compiled = compileMgBatch(spec, { groupName: "batch_hero" });
    assert.ok(compiled.includes('cavalry.beginUndoGroup("batch_hero");'));
    assert.ok(compiled.includes('_mg.patch("hero"'));
    assert.ok(compiled.includes('cavalry.endUndoGroup();'));
  });
});
