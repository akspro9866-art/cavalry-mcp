import { test } from "node:test";
import assert from "node:assert/strict";
import { jsString, parseOutcome, NO_RESULT_MESSAGE, EASING_NAMES, sceneLayersScript } from "../src/lib.js";
import vm from "node:vm";

test("jsString escapes quotes, backslashes and control characters into valid JS literals", () => {
  const tricky = 'He said "hi" \\ and\nleft\tnewlines\x07';
  const literal = jsString(tricky);
  // evaluating the literal must reproduce the original string exactly
  const round = new vm.Script(`(${literal})`).runInNewContext();
  assert.equal(round, tricky);
});

test("jsString escapes U+2028/U+2029 which break JS string literals", () => {
  const literal = jsString("a\u2028b\u2029c");
  assert.ok(!literal.includes("\u2028"));
  assert.ok(!literal.includes("\u2029"));
  const round = new vm.Script(`(${literal})`).runInNewContext();
  assert.equal(round, "a\u2028b\u2029c");
});

test("parseOutcome: empty raw gives the no-result error", () => {
  const o = parseOutcome("");
  assert.equal(o.ok, false);
  assert.equal(o.text, NO_RESULT_MESSAGE);
});

test("parseOutcome: unparsable raw reports a snippet", () => {
  const o = parseOutcome("{not json");
  assert.equal(o.ok, false);
  assert.match(o.text, /Unparsable/);
});

test("parseOutcome: script error surfaces", () => {
  const o = parseOutcome(JSON.stringify({ ok: false, seq: "s", error: "boom" }));
  assert.equal(o.ok, false);
  assert.equal(o.text, "boom");
});

test("parseOutcome: writeFailed surfaces (retry payload)", () => {
  const o = parseOutcome(JSON.stringify({ ok: false, seq: "s", writeFailed: "disk full" }));
  assert.equal(o.ok, false);
  assert.match(o.text, /disk full/);
});

test("parseOutcome: result passthrough (string, object, undefined)", () => {
  assert.deepEqual(parseOutcome(JSON.stringify({ ok: true, seq: "s", result: "plain" })), {
    ok: true,
    text: "plain",
  });
  const obj = parseOutcome(JSON.stringify({ ok: true, seq: "s", result: { a: 1 } }));
  assert.equal(obj.ok, true);
  assert.deepEqual(JSON.parse(obj.text), { a: 1 });
  assert.deepEqual(parseOutcome(JSON.stringify({ ok: true, seq: "s" })), { ok: true, text: "ok" });
});

test("EASING_NAMES: 20 verified names, no EaseInOut/Linear", () => {
  assert.equal(EASING_NAMES.length, 20);
  assert.ok(!EASING_NAMES.includes("EaseInOut" as never));
  assert.ok(!EASING_NAMES.includes("Linear" as never));
});

test("sceneLayersScript evaluates against a mock api and returns structured rows", () => {
  const api = {
    getAllSceneLayers: () => ["basicShape#1", "textShape#2"],
    getLayerType: (id: string) => (id.startsWith("basicShape") ? "basicShape" : "textShape"),
    getNiceName: (id: string) => `name of ${id}`,
    get: (id: string, attr: string) => {
      if (attr === "visible") return true;
      if (attr === "position.x") return 10;
      if (attr === "position.y") return -20;
      throw new Error("no attr " + attr);
    },
    getInFrame: () => 0,
    getOutFrame: () => 90,
    getParent: () => "",
  };
  const ctx = vm.createContext({ api, __result: undefined });
  new vm.Script(sceneLayersScript("api.getAllSceneLayers()")).runInContext(ctx);
  // JSON round trip normalizes the vm-realm objects into host-realm ones
  const rows = JSON.parse(JSON.stringify((ctx as { __result?: unknown }).__result));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    id: "basicShape#1",
    type: "basicShape",
    name: "name of basicShape#1",
    visible: true,
    position: { x: 10, y: -20 },
    inFrame: 0,
    outFrame: 90,
    parent: null,
  });
});
