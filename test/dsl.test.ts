import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { wrapAtomicUndo } from "../src/dsl/undo-wrapper.js";
import { createMgRuntimeSource } from "../src/dsl/mg-runtime.js";
import { applyMgPatch, compileMgBatch, validateSceneSpecV2 } from "../src/lib/index.js";
import { buildMockApi, createMockApiState, executeInMock } from "./helpers/mock-cavalry-api.js";

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

  test("wrapAtomicUndo calls endUndoGroup in finally when body throws", () => {
    const state = createMockApiState();
    const api = buildMockApi(state);
    const undoEvents: string[] = [];
    const cavalry = {
      beginUndoGroup: (name: string) => undoEvents.push(`begin:${name}`),
      endUndoGroup: () => undoEvents.push("end"),
    };
    const wrapped = wrapAtomicUndo('throw new Error("intentional failure");', "err_group");
    assert.throws(() => executeInMock(wrapped, api, { cavalry }), /intentional failure/);
    assert.deepEqual(undoEvents, ["begin:err_group", "end"]);
  });

  test("compileMgBatch executes idempotently across repeated runs without duplicating nodes", () => {
    const state = createMockApiState();
    state.layers.clear();
    const api = buildMockApi(state);
    const undoEvents: string[] = [];
    const cavalry = {
      beginUndoGroup: (name: string) => undoEvents.push(`begin:${name}`),
      endUndoGroup: () => undoEvents.push("end"),
    };

    const spec = {
      version: "2.0" as const,
      resolution: [1920, 1080] as [number, number],
      fps: 60,
      layers: [
        { id: "src_null", type: "null", name: "DriverNull" },
        {
          id: "card_1",
          type: "rectangle",
          name: "HeroCard",
          attrs: { "position.x": 100 },
          keyframes: {
            "position.x": [
              { frame: 0, value: 0 },
              { frame: 30, value: 100, easing: "SlowOut" },
            ],
          },
          connections: [{ attrPath: "opacity", from: "DriverNull.id" }],
        },
      ],
    };

    const script = compileMgBatch(spec, { groupName: "idem_batch" });
    executeInMock(script, api, { cavalry });
    const countAfterFirst = state.layers.size;
    const kfAfterFirst = state.keyframes.length;
    const connAfterFirst = state.connections.length;

    assert.equal(countAfterFirst, 2);
    assert.equal(kfAfterFirst, 2);
    assert.equal(connAfterFirst, 1);

    // Second identical batch run must reuse existing layers and avoid duplicating keyframes/connections
    executeInMock(script, api, { cavalry });
    assert.equal(state.layers.size, countAfterFirst);
    assert.equal(state.keyframes.length, kfAfterFirst);
    assert.equal(state.connections.length, connAfterFirst);
    assert.deepEqual(undoEvents, ["begin:idem_batch", "end", "begin:idem_batch", "end"]);
  });
});
