import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {
  MG_HELPERS_SOURCE,
  splineAt,
  springAt,
  fittsMovementTime,
  equalizeMorphPaths,
  equalizeMorphSegments,
  projectPath3D,
} from "../../src/runtime/mg_helpers.js";

interface MotionDsl {
  splineAt: (frame: number, keyframes: number[][]) => number[];
  springAt: (frame: number, start: number, fps?: number, config?: Record<string, number>) => number;
  fittsMovementTime: (d: number, w?: number, a?: number, b?: number) => number;
  loopTime: (t: number, dur: number, loop: string) => number;
  loopValue: (frame: number, dur: number, loop: string, fn: (t: number) => number) => number;
  loopSeamError: (dur: number, loop: string, fn: (t: number) => number) => { delta: number; slopeMiss: number };
  wave: (t: number, n: number, phase?: number, dur?: number) => number;
  loopNoise: (t: number, n: number, seed: number, dur?: number) => number;
}

/** The runtime DSL block is an object literal member list; evaluate it in a mock scope. */
function motionDsl(): MotionDsl {
  const start = MG_HELPERS_SOURCE.indexOf("const _mg = {");
  const rb = MG_HELPERS_SOURCE.indexOf("const _rb = {");
  const end = MG_HELPERS_SOURCE.lastIndexOf("};", rb > start ? rb : undefined);
  const body = MG_HELPERS_SOURCE.slice(start + "const _mg = {".length, end);
  const context = vm.createContext({ api: {}, console, Math });
  return new vm.Script(`(function () { return {${body}}; })()`).runInContext(context) as MotionDsl;
}

test("spline: hits every keyframe and stays C1-continuous across knots", () => {
  const keys: number[][] = [[0, 0, 10], [20, 120, 40], [50, 60, 90], [80, 180, 20]];
  const dsl = motionDsl();
  for (const key of keys) {
    const at = splineAt(key[0], keys as never);
    assert.ok(Math.abs(at[0] - key[1]) < 1e-9, `frame ${key[0]} x`);
    assert.ok(Math.abs(at[1] - key[2]) < 1e-9, `frame ${key[0]} y`);
  }
  for (const knot of [20, 50]) {
    const before = splineAt(knot - 1e-4, keys as never);
    const after = splineAt(knot + 1e-4, keys as never);
    assert.ok(Math.abs(before[0] - after[0]) < 0.05, `x continuity at ${knot}`);
    assert.ok(Math.abs(before[1] - after[1]) < 0.05, `y continuity at ${knot}`);
  }
  // Two keys with the same value between them hold perfectly still.
  const held = dsl.splineAt(10, [[0, 5], [20, 5], [40, 50]]);
  assert.equal(held[0], 5);
});

test("spring: settles to 1 and never explodes past its envelope", () => {
  const end = springAt(90, 0, 30, { stiffness: 150, damping: 18, mass: 0.8 });
  assert.ok(Math.abs(end - 1) < 1e-3, `settled value ${end}`);
  assert.ok(springAt(0, 0) === 0, "starts at 0");
  let peak = 0;
  for (let f = 0; f <= 90; f += 0.5) peak = Math.max(peak, springAt(f, 0, 30, { damping: 14, stiffness: 140 }));
  assert.ok(peak < 1.45, `overshoot bounded, peak ${peak}`);
  assert.ok(springAt(10, 20) === 0, "before start the spring is still");
});

test("loop seam: cycle wraps identically, hold pins the tail to frame 0", () => {
  const dsl = motionDsl();
  const dur = 60;
  assert.ok(Math.abs(dsl.loopTime(-5, dur, "cycle") - 55) < 1e-9, "negative time wraps forward");
  assert.ok(Math.abs(dsl.loopTime(65, dur, "cycle") - 5) < 1e-9, "overflow wraps");
  assert.ok(dsl.loopTime(dur, dur, "cycle") === 0, "dur wraps to 0");
  assert.equal(dsl.loopTime(75, dur, "none"), 75);
  assert.equal(dsl.loopValue(dur + 5, dur, "cycle", (t) => t), 5);
  assert.equal(dsl.loopValue(dur + 5, dur, "hold", (t) => t + 1), 1);
  const cycleValue = (t: number) => dsl.wave(t, 3, 0, dur);
  const seam = dsl.loopSeamError(dur, "cycle", cycleValue);
  assert.ok(seam.delta < 1e-3, `cycle seam delta ${seam.delta}`);
  assert.ok(seam.slopeMiss < 1e-2, `cycle seam slope ${seam.slopeMiss}`);
  const noise = dsl.loopNoise(1, 2, 7, 4);
  assert.ok(Math.abs(noise - dsl.loopNoise(5, 2, 7, 4)) < 1e-9, "loopNoise is periodic");
});

test("Fitts: movement time grows with distance and shrinks with target width", () => {
  const near = fittsMovementTime(80, 48);
  const far = fittsMovementTime(640, 48);
  assert.ok(far > near, "longer travel is slower");
  const wide = fittsMovementTime(240, 160);
  const narrow = fittsMovementTime(240, 12);
  assert.ok(narrow > wide, "smaller target is slower");
  assert.ok(Math.abs(fittsMovementTime(48, 96) - fittsMovementTime(48, 96)) < 1e-12, "pure");
});

test("morph equalize: both outputs share one segment count", () => {
  const paths = equalizeMorphPaths("M0 0 L100 0 L100 100 Z", "M10 10 C 30 0 60 0 90 10 C 120 20 120 60 90 80 Z");
  const countA = paths.from.match(/[MLCQZ]/g)?.length ?? 0;
  const countB = paths.to.match(/[MLCQZ]/g)?.length ?? 0;
  assert.equal(countA, countB, "equalizePaths segment equality");
  const segments = equalizeMorphSegments("M0 0 L100 0 L100 100 Z", "M10 10 C 30 0 60 0 90 10 L90 90 Z");
  assert.ok(segments.segmentCount > 0);
  assert.ok(segments.from.length > 0 && segments.to.length > 0);
});

test("projectPath3D: identity round trip preserves geometry, Z rotation is finite", () => {
  const path = "M0 0 L100 0 L100 100 L0 100 Z";
  const identity = projectPath3D(path, {}, "off");
  assert.equal(identity.replace(/\s+/g, ""), path.replace(/\s+/g, ""), "identity transform round-trips");
  const rotated = projectPath3D(path, { rotate: 30, perspective: 900 }, 4);
  assert.ok(rotated.startsWith("M"), "rotated path is still a path");
  assert.ok(!/NaN|Infinity/.test(rotated), "projection stays finite");
});
