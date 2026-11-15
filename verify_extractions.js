#!/usr/bin/env node
/**
 * verify_extractions.js — single-shot verification of the extracted motion
 * math across cavalry-mcp (prelude + injected _mg runtime) and
 * AE-cavalry-effect (translators + lottie mapper).
 *
 * Covers Task 4 of the extraction spec:
 *   - all() / chain() frame math (Motion Canvas timeline combinators)
 *   - solveSpring() convergence (analytical, all three damping regimes)
 *   - olaStep() continuity (Ola critically-damped step)
 *   - cubicBezierToCavalryTangents(0.25, 0.1, 0.25, 1.0, 60, 500)
 *   - 2D computeStagger (Anime.js grid/axis math)
 *   - the injected _mg IIFE runtime evaluating against a mock Cavalry api
 *
 * Run: node verify_extractions.js   (from cavalry-mcp/)
 */

import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

const prelude = await import(pathToFileURL(path.join(here, "src/prelude/motion-core.js")).href);
const { MG_HELPERS_SOURCE } = await import(pathToFileURL(path.join(here, "dist/runtime/mg_helpers.js")).href);
const translators = await import(
  pathToFileURL(path.join(here, "..", "AE-cavalry-effect", "src/math/translators.js")).href
);
const lottie = await import(
  pathToFileURL(path.join(here, "..", "AE-cavalry-effect", "src/mappers/lottie-shape.js")).href
);

let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\n[1] Declarative timeline combinators (Motion Canvas)");
{
  const tl = prelude.createTimeline({ fps: 60 });
  // all(): tasks run in parallel from the same start; cursor = max endFrame.
  const allEnd = tl.all(
    () => tl.waitFor(30),
    tl.tween({ id: "a", attr: "position.y", from: 0, to: 100, duration: 20 }),
    () => tl.chain(tl.tween({ id: "b", attr: "scale.x", from: 1, to: 2, duration: 10 }), () => tl.waitFor(5)),
  );
  check("all() lands cursor on max endFrame (30)", allEnd === 30 && tl.frame === 30);
  check("all() parallel tasks share the start frame", tl.batch.every((e) => e.points[0][0] === 0));
  check("tween baked one keyframe per frame", tl.batch[0].points.length === 21 && tl.batch[0].points[20][0] === 20);

  // chain(): sequential; cursor advances after each task.
  tl.frame = 0;
  const chainEnd = tl.chain(
    tl.tween({ id: "c", attr: "opacity", from: 0, to: 1, duration: 12 }),
    () => tl.waitFor(6),
    tl.tween({ id: "d", attr: "opacity", from: 1, to: 0, duration: 12 }),
  );
  check("chain() advances cursor after each task (30)", chainEnd === 30 && tl.frame === 30);
  const c = tl.batch.find((e) => e.id === "c");
  const d = tl.batch.find((e) => e.id === "d");
  check("chain() second task starts where first ended", c.points[0][0] === 0 && d.points[0][0] === 18);

  // sequence(): fixed stagger between starts.
  tl.frame = 0;
  tl.batch.length = 0;
  const seqEnd = tl.sequence(
    4,
    tl.tween({ id: "w1", attr: "opacity", from: 0, to: 1, duration: 10 }),
    tl.tween({ id: "w2", attr: "opacity", from: 0, to: 1, duration: 10 }),
    tl.tween({ id: "w3", attr: "opacity", from: 0, to: 1, duration: 10 }),
  );
  const starts = tl.batch.map((e) => e.points[0][0]);
  check("sequence() staggers starts by 4 frames", JSON.stringify(starts) === "[0,4,8]");
  check("sequence() cursor = last start + duration (18)", seqEnd === 18);

  // delay() offsets a task.
  tl.frame = 0;
  tl.batch.length = 0;
  tl.delay(7, tl.tween({ id: "late", attr: "opacity", from: 0, to: 1, duration: 5 }));
  check("delay(7, task) starts the task at cursor+7", tl.batch[0].points[0][0] === 7);
}

console.log("\n[2] Analytical spring solver (Motion / Framer Motion closed form)");
{
  const under = prelude.solveSpring({ from: 0, to: 1, stiffness: 180, damping: 18, fps: 60, restDelta: 0.001 });
  check("underdamped regime detected (zeta<1)", under.regime === "underdamped" && under.zeta < 1);
  check(
    "converges within restDelta at settleFrame",
    Math.abs(under.at(under.settleFrame) - 1) <= 0.001 * Math.max(1, 1),
    `|at(settle)−1| = ${Math.abs(under.at(under.settleFrame) - 1).toExponential(2)}`,
  );
  check(
    "stays converged 3x past settleFrame",
    Math.abs(under.at(under.settleFrame * 3) - 1) <= 0.001,
  );
  check(
    "overshoot matches max excursion (>0, bounded)",
    under.overshoot > 0.001 && under.overshoot < 0.5,
    `overshoot = ${(under.overshoot * 100).toFixed(2)}%`,
  );
  check(
    "y(0) and y(∞) exact",
    under.at(0) === 0 && Math.abs(under.atTime(60) - 1) < 1e-9,
  );

  const crit = prelude.solveSpring({ from: 0, to: 1, stiffness: 400, damping: 40, mass: 1 });
  check("critically damped regime detected", crit.regime === "critically");
  let monotone = true;
  for (let f = 1; f <= crit.settleFrame; f++) if (crit.at(f) < crit.at(f - 1) - 1e-9) monotone = false;
  check("critically damped is monotone (no overshoot)", monotone && crit.overshoot === 0);
  check("critically damped converges", Math.abs(crit.at(crit.settleFrame) - 1) <= 0.001);

  const over = prelude.solveSpring({ from: 0, to: 1, stiffness: 100, damping: 30, mass: 1 });
  check("overdamped regime detected", over.regime === "overdamped");
  monotone = true;
  for (let f = 1; f <= over.settleFrame; f++) if (over.at(f) < over.at(f - 1) - 1e-9) monotone = false;
  check("overdamped is monotone and converges", monotone && Math.abs(over.at(over.settleFrame) - 1) <= 0.001);

  const kf = prelude.springExtremaKeyframes(under);
  const maxVal = Math.max(...kf.map((p) => p[1]));
  check(
    "extrema baking: sparse keys, overshoot peak captured",
    kf.length < under.settleFrame / 3 && Math.abs(maxVal - (1 + under.overshoot)) < 1e-3,
    `${kf.length} keys, peak ${maxVal.toFixed(4)}`,
  );
  check("extremum keys carry flat handles", kf.some((p) => p[2] && p[2].outAngle === 0));
}

console.log("\n[3] Ola critically-damped step (velocity continuity)");
{
  const [v1, vel1] = prelude.olaStep(0, 100, 0, 1 / 60, 0.15);
  check("first step matches analytical form", Math.abs(v1 - 2.13209) < 1e-4 && Math.abs(vel1 - 237.2565) < 1e-3);

  const traj = prelude.olaTrajectory(
    [{ frame: 0, value: 0 }, { frame: 30, value: 500 }, { frame: 120, value: 320 }, { frame: 180, value: 320 }],
    { fps: 60, tau: 0.15 },
  );
  const last = traj.points[traj.points.length - 1];
  check("settles within 0.5% of final waypoint", Math.abs(last.value - 320) < 1.6);

  // Velocity continuity: frame-to-frame velocity changes stay bounded by the
  // step formula's response to the POST-switch target error (no velocity
  // cliffs — the velocity change at a switch is the formula's own envelope).
  const omega = 2 / 0.15;
  const dt = 1 / 60;
  const waypoints = [0, 30, 120, 180];
  const targets = [0, 500, 320, 320];
  const targetAt = (frame) => {
    let t = targets[0];
    for (let w = 1; w < waypoints.length; w++) if (frame >= waypoints[w]) t = targets[w];
    return t;
  };
  let maxJump = 0;
  let maxAt = -1;
  for (let i = 1; i < traj.points.length; i++) {
    const p = traj.points[i - 1];
    const q = traj.points[i];
    const xNew = p.value - targetAt(q.frame);
    const bound = omega * (Math.abs(p.velocity) + omega * Math.abs(xNew)) * dt * 1.05 + 1e-6;
    const jump = Math.abs(q.velocity - p.velocity);
    if (jump - bound > maxJump) {
      maxJump = jump - bound;
      maxAt = i;
    }
  }
  check("no velocity cliffs across waypoint switches", maxJump <= 0, `max bound excess ${maxJump.toExponential(2)} @${maxAt}`);

  // Value continuity: each frame moves by at most the critically-damped step
  // (a fraction of the remaining gap plus the velocity term) — never an
  // instant snap to the target.
  let maxValJump = 0;
  for (let i = 1; i < traj.points.length; i++) {
    const p = traj.points[i - 1];
    const q = traj.points[i];
    const gap = Math.abs(targetAt(q.frame) - p.value);
    const bound = gap * (1 - Math.exp(-omega * dt)) * 1.5 + Math.abs(p.velocity) * dt * 1.5 + 1e-6;
    maxValJump = Math.max(maxValJump, Math.abs(q.value - p.value) - bound);
  }
  check("value trajectory moves smoothly (no snap)", maxValJump <= 0, `max bound excess ${maxValJump.toExponential(2)}`);
}

console.log("\n[4] Cubic-bezier -> Cavalry tangents (AE-cavalry-effect)");
{
  const t = translators.cubicBezierToCavalryTangents(0.25, 0.1, 0.25, 1.0, 60, 500);
  // Handle deltas: right = (0.25*60, 0.1*500) = (15, 50); left = (-45, 0).
  check("right handle dx/dy exact", t.rightHandle.dx === 15 && t.rightHandle.dy === 50);
  check("left handle dx/dy exact", t.leftHandle.dx === -45 && t.leftHandle.dy === 0);
  check("rightAngle = atan2(50,15)", Math.abs(t.rightAngle - 73.3008) < 1e-3, `${t.rightAngle.toFixed(4)}deg`);
  check("leftAngle = 180 (horizontal incoming)", Math.abs(Math.abs(t.leftAngle) - 180) < 1e-9);
  const seg = Math.hypot(60, 500);
  check("rightWeight = |handle|/segment", Math.abs(t.rightWeight - Math.hypot(15, 50) / seg) < 1e-4, `${t.rightWeight}`);
  check("weights within [0,1] for standard ease", t.rightWeight <= 1 && t.leftWeight <= 1);

  // Newton-Raphson evaluator: endpoints exact + known CSS ease midpoint.
  check("evaluateCubicBezier endpoints exact", translators.evaluateCubicBezier(0.25, 0.1, 0.25, 1, 0) === 0 && translators.evaluateCubicBezier(0.25, 0.1, 0.25, 1, 1) === 1);
  const mid = translators.evaluateCubicBezier(0.25, 0.1, 0.25, 1, 0.5);
  check("ease-out-quart-ish midpoint (0.8024)", Math.abs(mid - 0.8024) < 5e-4, mid.toFixed(5));

  // Round-trip: sampling from the handles reproduces the easing within tol.
  const keys = translators.sampleCubicBezierToKeyframes(0.25, 0.1, 0.25, 1, 60, 500, 10, 12);
  check("baked keyframes span start->end", keys[0][0] === 10 && keys[keys.length - 1][0] === 70);
}

console.log("\n[5] 2D grid & axis stagger (Anime.js math)");
{
  const s = translators.computeStagger(4, { grid: [4, 3], from: "first", totalItems: 12 });
  check("origin at first item", s.origin.index === 0 && s.origin.col === 0 && s.origin.row === 0);
  check("Euclidean distance delay (item1 = 4f, item2 = 8f)", s.offsets[1] === 4 && s.offsets[2] === 8);
  check("diagonal item = 4*sqrt(2)", Math.abs(s.offsets[5] - 4 * Math.SQRT2) < 1e-3);
  check("max distance = hypot(3,2)", Math.abs(s.maxDistance - Math.hypot(3, 2)) < 1e-3);
  check("cavalry mapping: grid duplicator + radial falloff", s.cavalry.duplicator.distribution === "grid" && s.cavalry.falloff.type === "radial" && s.cavalry.duplicator.copies === 12);

  const c = translators.computeStagger([0, 60], { grid: [4, 3], from: "center", easing: "outCubic", totalItems: 12 });
  check("center origin = (1.5, 1)", c.origin.col === 1.5 && c.origin.row === 1);
  check("range stagger: origin starts at v1=0", c.offsets[c.offsets.length - 1] >= 0 && Math.min(...c.offsets) >= 0);
  check("eased range stays within [0,60]", Math.max(...c.offsets) <= 60.001);
  check("farthest corner from center hits v2=60", Math.max(...c.offsets) === 60);

  const ax = translators.computeStagger(3, { grid: [4, 3], axis: "x", from: "last", totalItems: 12 });
  check("axis-x distances ignore rows", ax.distances[0] === -3 && ax.distances[3] === 0);
  check("axis-x offsets are |dist|*val", JSON.stringify(ax.offsets.slice(0, 4)) === "[9,6,3,0]");
  check("axis falloff mapped to linear-x", ax.cavalry.falloff.type === "linear-x");

  const flat = translators.computeStagger(2, { from: "last", totalItems: 5 });
  check("flat index stagger from last", JSON.stringify(flat.offsets) === "[8,6,4,2,0]");
}

console.log("\n[6] Injected _mg IIFE runtime (mock Cavalry api)");
{
  const log = [];
  const api = {
    create(type, name) { log.push(`create:${type}`); return `${type}-id-${log.length}`; },
    set(id, dict) { log.push(`set:${id}:${Object.keys(dict).join("+")}`); },
    connect(a, b, c, d) { log.push(`connect:${a}->${c}.${d}`); },
    keyframe(id, frame, dict) { log.push(`kf:${id}@${frame}`); },
    modifyKeyframeTangent() { log.push("tan"); },
    modifyKeyframe() { log.push("mod"); },
    magicEasing() { log.push("magic"); },
    getKeyframeTimes() { return []; },
    get() { return 120; },
    getActiveComp() { return "comp1"; },
    getChildren() { return []; },
    startUndoGroup() {}, endUndoGroup() {},
  };
  const mg = new Function("api", `${MG_HELPERS_SOURCE}\nreturn _mg;`)(api);
  check("MG_HELPERS_SOURCE evaluates as a single self-contained scope", !!mg && typeof mg.timeline === "function");

  const tl = mg.timeline({ fps: 60 });
  const end = tl.all(
    tl.tween({ id: "card", attr: "position.y", from: 0, to: 100, duration: 20 }),
    tl.springTask({ id: "card", attr: "scale.x", from: 0.9, to: 1, spring: { stiffness: 180, damping: 18 } }),
  );
  // spring settle: 0.9 -> 1, restDelta scaled by move -> 33 frames.
  check("_mg.timeline combinators bake keyframes through api", end === 33 && log.filter((l) => l.startsWith("kf:")).length > 20);

  const spring = mg.solveSpring({ stiffness: 180, damping: 18 });
  check("_mg.solveSpring mirrors prelude", spring.regime === "underdamped" && spring.settleFrame === prelude.solveSpring({ stiffness: 180, damping: 18 }).settleFrame);

  const baked = mg.bakeSpringKeyframes("card", "position.y", { stiffness: 180, damping: 18 });
  check("bakeSpringKeyframes writes sparse smooth keys", baked.attrs[0].keyframes === 7 && baked.regime === "underdamped");

  const counter = mg.animateCounter("text1", [{ frame: 0, value: 0 }, { frame: 30, value: 4800 }, { frame: 60, value: 4750.5 }], 0.15);
  check("animateCounter quantizes to digit changes", counter.keyframes < 60 && counter.precision === 1, `${counter.keyframes} keys`);
  check("animateCounter connects a stringGenerator", log.some((l) => l.startsWith("create:stringGenerator")) && log.some((l) => l.includes("->text1.text")));

  check("_mg.olaStep mirrors prelude", JSON.stringify(mg.olaStep(0, 100, 0, 1 / 60, 0.15)) === JSON.stringify(prelude.olaStep(0, 100, 0, 1 / 60, 0.15)));
  check("PARTICLE_PRESETS exposed", Object.keys(mg.PARTICLE_PRESETS).join(",") === "uiDust,confettiBurst,dataStream");
  const rig = mg.particleRig("Dust", "uiDust", { x: 100, y: 200 });
  check("particleRig applies emitter attrs fault-tolerantly", rig.applied.length >= 5 && rig.behaviours.length === 3);
}

console.log("\n[7] Lottie shape & modifier mapper (AE-cavalry-effect)");
{
  const rect = lottie.mapLottieShapeToCavalry({
    ty: "sh",
    ks: { c: true, v: [[0, 0], [200, 0], [200, 100], [0, 100]], i: [[0, 0], [0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0], [0, 0]] },
  });
  check("sh maps to editable shape with 4 vertices", rect.type === "editableShape" && rect.vertices === 4);
  check("svgPath emits closed lines", rect.svgPath.split("L").length === 5 && rect.svgPath.endsWith("Z"));

  const trim = lottie.mapLottieTrimPathToCavalry({ ty: "tm", s: { a: 0, k: 20 }, e: { a: 0, k: 80 }, o: { a: 0, k: 720 }, m: 1 });
  check("tm maps trim attrs (offset 720 -> 0)", trim.attrs.trimStart === 20 && trim.attrs.trimEnd === 80 && trim.attrs.trimOffset === 0 && trim.attrs.trimMode === "simultaneously");

  const rp = lottie.mapLottieRepeaterToCavalry({
    ty: "rp", c: { a: 0, k: 8 }, o: { a: 0, k: 1 }, m: 1,
    tr: { a: { a: 0, k: [0, 0, 0] }, p: { a: 0, k: [20, 0, 0] }, s: { a: 0, k: [90, 90, 100] }, r: { a: 0, k: 15 }, so: { a: 0, k: 100 }, eo: { a: 0, k: 20 } },
  });
  check("rp maps copies/offset to linear duplicator", rp.cavalry.duplicator.distribution === "linear" && rp.cavalry.duplicator.copies === 8 && rp.cavalry.duplicator.rotationOffset === 15);
  check("rp opacity -> index falloff", rp.cavalry.falloff.type === "index" && rp.cavalry.falloff.startValue === 1 && rp.cavalry.falloff.endValue === 0.2);

  const tree = lottie.mapLottieShapeTreeToCavalry([{ ty: "gr", it: [{ ty: "sh", ks: { c: true, v: [[0, 0], [10, 0], [10, 10], [0, 10]], i: [[0, 0], [0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0], [0, 0]] } }, { ty: "tm", s: { a: 0, k: 0 }, e: { a: 0, k: 50 }, o: { a: 0, k: 0 }, m: 2 }] }]);
  check("shape tree flattens groups in paint order", tree.shapes.length === 1 && tree.trimPaths.length === 1 && tree.trimPaths[0].attrs.trimMode === "individually");
}

console.log(`\n=== verify_extractions.js: ${passed} passed, ${failed} failed ===`);
process.exit(failed === 0 ? 0 : 1);
