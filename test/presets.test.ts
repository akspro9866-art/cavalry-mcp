import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { compileAnimateIn, ANIMATE_PRESETS } from "../src/presets.js";

function runPreset(preset: (typeof ANIMATE_PRESETS)[number], attrs: Record<string, number> = {}) {
  const keyframes: Array<{ layerId: string; frame: number; attributes: Record<string, unknown> }> = [];
  const easings: Array<{ attrPath: string; frame: number; name: string }> = [];
  const api = {
    get: (_id: string, attr: string) => {
      if (attr in attrs) return attrs[attr];
      throw new Error(`no attr ${attr}`);
    },
    keyframe: (layerId: string, frame: number, attributes: Record<string, unknown>) => {
      keyframes.push({ layerId, frame, attributes });
      return "kf";
    },
    magicEasing: (_id: string, attrPath: string, frame: number, name: string) => {
      easings.push({ attrPath, frame, name });
    },
  };
  const ctx = vm.createContext({ api });
  new vm.Script(compileAnimateIn({ layerId: "textShape#1", preset, startFrame: 10, duration: 25, distance: 80 })).runInContext(ctx);
  const result = (ctx as { __result?: { applied: string[]; failed: string[] } }).__result;
  // spread into host arrays: vm-realm arrays fail strict deepEqual prototype checks
  return {
    keyframes,
    easings,
    result: result ? { applied: [...result.applied], failed: [...result.failed] } : undefined,
  };
}

test("springUp: keyframes relative to current position + SpringOut on the start keyframe", () => {
  const { keyframes, easings, result } = runPreset("springUp", { "position.x": 5, "position.y": -40, opacity: 80 });
  assert.deepEqual(result?.failed, []);
  const start = keyframes.find((k) => k.frame === 10);
  const end = keyframes.find((k) => k.frame === 35);
  assert.equal(start?.attributes["position.y"], -40 + 80); // y0 + dist
  assert.equal(start?.attributes["opacity"], 0);
  assert.equal(end?.attributes["position.y"], -40); // back to y0
  assert.equal(end?.attributes["opacity"], 80);
  assert.equal(easings.length, 1);
  assert.equal(easings[0].name, "SpringOut");
  assert.equal(easings[0].frame, 10); // outgoing segment of the start keyframe
});

test("fadeIn: only opacity, no easing", () => {
  const { keyframes, easings, result } = runPreset("fadeIn", { opacity: 60 });
  assert.deepEqual(result?.failed, []);
  assert.equal(keyframes.length, 2);
  assert.equal(keyframes[0].attributes["opacity"], 0);
  assert.equal(keyframes[1].attributes["opacity"], 60);
  assert.equal(easings.length, 0);
});

test("dropBounce: falls from above with BounceOut", () => {
  const { keyframes, easings } = runPreset("dropBounce", { "position.y": 12 });
  assert.equal(keyframes[0].attributes["position.y"], 12 - 160); // y0 - dist*2
  assert.equal(keyframes[1].attributes["position.y"], 12);
  assert.equal(easings[0].name, "BounceOut");
});

test("popIn: weight 0→w0 with SmallSpringOut; missing weight degrades gracefully", () => {
  const withWeight = runPreset("popIn", { weight: 150, opacity: 100 });
  assert.equal(withWeight.keyframes[1].attributes["weight"], 150);
  assert.equal(withWeight.easings[0].name, "SmallSpringOut");

  // layer without weight/opacity attributes: opacity defaults to 100, weight step fails but is reported
  const bare = runPreset("popIn", {});
  assert.equal(bare.keyframes.length, 2); // both keyframe steps ran (values defaulted)
  assert.equal(bare.result?.failed.length, 0);
});

test("defaults are applied (start 0, duration 30, distance 100)", () => {
  const api = {
    get: () => {
      throw new Error("no attrs");
    },
    keyframe: () => "kf",
    magicEasing: () => undefined,
  };
  const ctx = vm.createContext({ api });
  new vm.Script(compileAnimateIn({ layerId: "basicShape#1", preset: "fadeUp" })).runInContext(ctx);
  const result = (ctx as { __result?: { startFrame: number; endFrame: number } }).__result;
  assert.equal(result?.startFrame, 0);
  assert.equal(result?.endFrame, 30);
});
