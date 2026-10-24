import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { compileBatch, type BatchOp } from "../src/batch.js";
import { buildMockApi, createMockApiState } from "./helpers/mockStallion.js";

function runWithMockApi(code: string) {
  const state = createMockApiState();
  const api = buildMockApi(state);
  const ctx = vm.createContext({ api });
  new vm.Script(code).runInContext(ctx);
  return { state, result: (ctx as { __result?: unknown }).__result };
}

test("compileBatch: full scene build with refs, executed against a mock api", () => {
  const ops: BatchOp[] = [
    { op: "create", layerType: "basicShape", name: "BG", as: "bg" },
    { op: "set", layerId: "$bg", attributes: { "material.materialColor": "#101828", visible: true } },
    {
      op: "keyframe",
      layerId: "$bg",
      keyframes: [
        { frame: 0, attributes: { "position.x": 0 } },
        { frame: 30, attributes: { "position.x": 200 } },
      ],
    },
    { op: "easing", layerId: "$bg", attrPath: "position.x", frame: 0, easingType: "SlowOut" },
    { op: "duplicate", layerId: "$bg", as: "bg2" },
    { op: "rename", layerId: "$bg2", name: "BG copy" },
    { op: "timing", layerId: "$bg2", inFrame: 5, outFrame: 50, offset: 2 },
    { op: "setParent", layerId: "$bg2", parentLayerId: "$bg" },
  ];
  const { state, result } = runWithMockApi(compileBatch(ops));

  assert.ok(result && typeof result === "object");
  const r = result as { refs: Record<string, string>; results: Array<{ ok: boolean; error?: string }> };
  assert.ok(r.results.every((x) => x.ok), `all ops ok: ${JSON.stringify(r.results)}`);
  assert.equal(Object.keys(r.refs).length, 2);
  const bg = r.refs.bg;
  assert.match(bg, /^basicShape#/);
  assert.equal(state.layers.get(bg)?.attrs["material.materialColor"], "#101828");
  assert.equal(state.keyframes.length, 2);
  assert.equal(state.keyframes[1].frame, 30);
  assert.equal(state.easings[0].name, "SlowOut");
  assert.equal(state.layers.get(r.refs.bg2)?.name, "BG copy");
  assert.equal(state.layers.get(r.refs.bg2)?.attrs.inFrame, 5);
  assert.ok(state.order.includes(`parent:${r.refs.bg2}->${bg}`));
});

test("compileBatch: one failing op does not kill the rest", () => {
  const ops: BatchOp[] = [
    { op: "create", layerType: "basicShape", name: "A", as: "a" },
    { op: "set", layerId: "missing#99", attributes: { x: 1 } }, // layer doesn't exist
    { op: "set", layerId: "$a", attributes: { y: 2 } },
  ];
  const { result } = runWithMockApi(compileBatch(ops));
  const r = result as { results: Array<{ index: number; ok: boolean; error?: string }> };
  assert.equal(r.results.filter((x) => x.ok).length, 2);
  assert.equal(r.results[1].ok, false);
  assert.match(r.results[1].error ?? "", /missing#99/);
});

test("compileBatch: delete/select ops with refs and literal ids", () => {
  const ops: BatchOp[] = [
    { op: "create", layerType: "null", name: "N1", as: "n1" },
    { op: "create", layerType: "null", name: "N2" },
    { op: "select", layerIds: ["$n1", "null#2"] },
    { op: "delete", layerIds: ["$n1"] },
  ];
  const { state, result } = runWithMockApi(compileBatch(ops));
  const r = result as { refs: Record<string, string>; results: Array<{ ok: boolean }> };
  assert.ok(r.results.every((x) => x.ok));
  assert.ok(state.selection.includes("null#2"));
  assert.ok(!state.layers.has(r.refs.n1));
});

test("compileBatch: connect and setGenerator", () => {
  const ops: BatchOp[] = [
    { op: "create", layerType: "basicShape", name: "A", as: "a" },
    { op: "create", layerType: "textShape", name: "T", as: "t" },
    { op: "connect", sourceLayerId: "$a", sourceAttr: "id", targetLayerId: "$t", targetAttr: "weight", force: true },
    { op: "setGenerator", layerId: "$a", generatorType: "rectangleShape" },
  ];
  const { result } = runWithMockApi(compileBatch(ops));
  const r = result as { results: Array<{ ok: boolean }> };
  assert.ok(r.results.every((x) => x.ok));
});

test("compileBatch: rejects unknown op with index", () => {
  assert.throws(() => compileBatch([{ op: "explode" } as unknown as BatchOp]), /operations\[0\]: unknown op "explode"/);
});

test("compileBatch: rejects duplicate 'as' names", () => {
  const ops: BatchOp[] = [
    { op: "create", layerType: "null", name: "a", as: "x" },
    { op: "create", layerType: "null", name: "b", as: "x" },
  ];
  assert.throws(() => compileBatch(ops), /as: "x" is declared twice/);
});

test("compileBatch: rejects forward references ($ref before it exists)", () => {
  const ops: BatchOp[] = [{ op: "set", layerId: "$ghost", attributes: { x: 1 } }];
  assert.throws(() => compileBatch(ops), /operations\[0\]: references "\$ghost" before/);
});

test("compileBatch: keyframe single and multi forms are mutually exclusive", () => {
  const ops: BatchOp[] = [
    {
      op: "keyframe",
      layerId: "null#1",
      frame: 0,
      attributes: { x: 1 },
      keyframes: [{ frame: 5, attributes: { x: 2 } }],
    },
  ];
  assert.throws(() => compileBatch(ops), /not both/);
});

test("compileBatch: keyframe multi-form loops all frames in one script", () => {
  const ops: BatchOp[] = [
    { op: "create", layerType: "null", name: "n", as: "n" },
    {
      op: "keyframe",
      layerId: "$n",
      keyframes: [
        { frame: 0, attributes: { "position.y": 100 } },
        { frame: 10, attributes: { "position.y": 0 } },
        { frame: 20, attributes: { "position.y": 100 } },
      ],
    },
  ];
  const { state } = runWithMockApi(compileBatch(ops));
  assert.equal(state.keyframes.length, 3);
  assert.deepEqual(state.keyframes.map((k) => k.frame), [0, 10, 20]);
});

test("compileBatch: empty operations rejected", () => {
  assert.throws(() => compileBatch([]), /non-empty/);
});

test("compileBatch: strings with quotes/newlines survive round trip", () => {
  const ops: BatchOp[] = [
    { op: "create", layerType: "textShape", name: 'He said "hi"\nand left', as: "t" },
    { op: "rename", layerId: "$t", name: "new \"name\"\nline" },
  ];
  const { state, result } = runWithMockApi(compileBatch(ops));
  const r = result as { results: Array<{ ok: boolean }>; refs: Record<string, string> };
  assert.ok(r.results.every((x) => x.ok));
  assert.equal(state.layers.get(r.refs.t)?.name, 'new "name"\nline');
});
