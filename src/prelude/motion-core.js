/**
 * motion-core.js — standalone, zero-dependency motion math prelude.
 *
 * This module is the compile-time mirror of the `_mg` runtime fragment in
 * `src/runtime/mg_helpers/motion-core.ts`. The algorithms are extracted from
 * open-source animation projects as standalone pure math (no engine code):
 *
 *   - Timeline combinators ....... Motion Canvas sequencing model
 *                                  (all/chain/delay/waitFor/sequence over a
 *                                  stateful frame cursor, `ctx.frame`/`ctx.fps`).
 *   - Analytical spring solver ... Motion / Framer Motion spring: the exact
 *                                  closed form of the damped harmonic
 *                                  oscillator for under-, critically- and
 *                                  over-damped regimes.
 *   - Critically damped step ..... Ola's analytical critically-damped spring
 *                                  step (`olaStep`) for velocity-continuous
 *                                  counters and chart transitions.
 *   - Particle presets ........... Proton's normalized behaviour ratios
 *                                  (RandomDrift / Attraction / Repulsion /
 *                                  AlphaFade / ScaleDecay) mapped onto native
 *                                  Cavalry Emitter + Behaviour parameters.
 *
 * Nothing here imports an engine; every function is pure and runs identically
 * in Node (preset compilation, tests) and inside the Cavalry IIFE prelude.
 */

export const DEFAULT_FPS = 60;

const clampNum = (v, min, max) => Math.max(min, Math.min(max, v));

/* ------------------------------------------------------------------ *
 * Declarative timeline combinators (Motion Canvas sequencing model)
 * ------------------------------------------------------------------ */

/**
 * Built-in named easings for `tl.tween({ easing: "name" })`. Curve families
 * are deliberately tiny; anything richer should pass a cubic-bezier array or
 * spring/ola options instead.
 */
export const BUILTIN_EASINGS = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  expoOut: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  backOut: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

/**
 * Newton–Raphson cubic-bezier easing evaluator for `x1,y1,x2,y2` control
 * points in the CSS `cubic-bezier()` convention (x is time, y is progress,
 * endpoints pinned at (0,0) and (1,1)). Falls back to bisection when Newton
 * fails to converge (non-monotone x solvers).
 */
export function evaluateCubicBezier(x1, y1, x2, y2, t) {
  const ax = 1 - 3 * x2 + 3 * x1;
  const bx = 3 * x2 - 6 * x1;
  const cx = 3 * x1;
  const ay = 1 - 3 * y2 + 3 * y1;
  const by = 3 * y2 - 6 * y1;
  const cy = 3 * y1;
  const xAt = (u) => ((ax * u + bx) * u + cx) * u;
  const yAt = (u) => ((ay * u + by) * u + cy) * u;
  const dxAt = (u) => (3 * ax * u + 2 * bx) * u + cx;
  const u0 = clampNum(t, 0, 1);
  if (u0 === 0 || u0 === 1) return yAt(u0);
  // Newton–Raphson: solve x(u) = t.
  let u = u0;
  for (let i = 0; i < 12; i++) {
    const err = xAt(u) - u0;
    if (Math.abs(err) < 1e-7) return yAt(u);
    const d = dxAt(u);
    if (Math.abs(d) < 1e-7) break;
    u = clampNum(u - err / d, 0, 1);
  }
  // Bisection fallback (x(u) is monotone for valid control points).
  let lo = 0;
  let hi = 1;
  u = u0;
  for (let i = 0; i < 40; i++) {
    const err = xAt(u) - u0;
    if (Math.abs(err) < 1e-7) break;
    if (err < 0) lo = u;
    else hi = u;
    u = (lo + hi) / 2;
  }
  return yAt(u);
}

function resolveEasing(spec) {
  if (spec == null) return BUILTIN_EASINGS.easeOutCubic;
  if (typeof spec === "string") {
    const fn = BUILTIN_EASINGS[spec];
    if (!fn) throw new Error(`motion-core: unknown easing "${spec}"`);
    return fn;
  }
  if (Array.isArray(spec) && spec.length === 4) {
    const [x1, y1, x2, y2] = spec;
    return (t) => evaluateCubicBezier(x1, y1, x2, y2, t);
  }
  if (typeof spec === "function") return spec;
  throw new Error("motion-core: easing must be a name, [x1,y1,x2,y2] or function");
}

/**
 * Create a stateful frame cursor with declarative sequencing combinators.
 *
 * A *task* is `() => number | { endFrame } | void`: it animates relative to
 * the cursor's current `tl.frame` and reports the frame it finishes on (either
 * by returning it or by leaving `tl.frame` advanced). Combinators never write
 * raw frame numbers into preset code — that is the anti-hallucination gate.
 *
 * @param {{ fps?: number, frame?: number, write?: (entry: {id,attr,points,ease}) => void }} opts
 *   `write` (optional) receives each finished tween's baked keyframes. When
 *   omitted, points accumulate on `tl.batch` for the caller to flush.
 */
export function createTimeline(opts = {}) {
  const fps = Math.max(1, Number(opts.fps) || DEFAULT_FPS);
  const tl = {
    /** Optional sink for baked keyframes (defaults to accumulating on `batch`). */
    _write: typeof opts.write === "function" ? opts.write : null,
    fps,
    frame: Math.max(0, Math.round(Number(opts.frame) || 0)),
    batch: [],
    /** Frames consumed so far — the cursor, always the latest endFrame. */
    get endFrame() {
      return this.frame;
    },
    /** Run tasks strictly one after another; cursor lands on the last end. */
    chain(...tasks) {
      for (const task of tasks) {
        const end = normalizeEnd(task(this), this.frame);
        this.frame = Math.max(this.frame, end);
      }
      return this.frame;
    },
    /**
     * Run tasks in parallel, all starting at the cursor's frame. Each task
     * sees the same start frame; the cursor advances to the maximum endFrame.
     */
    all(...tasks) {
      const base = this.frame;
      let maxEnd = base;
      for (const task of tasks) {
        this.frame = base;
        const end = normalizeEnd(task(this), this.frame);
        maxEnd = Math.max(maxEnd, end);
      }
      this.frame = maxEnd;
      return this.frame;
    },
    /** Pure gap: advance the cursor by `frames` without running anything. */
    waitFor(frames) {
      this.frame += Math.max(0, Math.round(Number(frames) || 0));
      return this.frame;
    },
    /** Offset `task` by `frames` from the cursor, then land on its end. */
    delay(frames, task) {
      this.waitFor(frames);
      return this.chain(task);
    },
    /**
     * Start each task `stagger` frames after the previous task's start. The
     * cursor lands on the maximum endFrame across staggered tasks.
     */
    sequence(stagger, ...tasks) {
      const gap = Math.max(0, Math.round(Number(stagger) || 0));
      const base = this.frame;
      let maxEnd = base;
      for (let i = 0; i < tasks.length; i++) {
        this.frame = base + i * gap;
        const end = normalizeEnd(tasks[i](this), this.frame);
        maxEnd = Math.max(maxEnd, end);
      }
      this.frame = maxEnd;
      return this.frame;
    },
    /**
     * Tween task factory. spec = { id, attr, from, to, duration, easing?,
     * spring?, ola?, ease? } — exactly one of easing/spring/ola. When run,
     * samples keyframes at integer frames and hands them to `write` (or the
     * batch). Points are `[frame, value]` pairs, or
     * `[frame, value, handles]` when `spring` baking is enabled.
     */
    tween(spec) {
      return () => bakeTweenPoints(tl, spec);
    },
    /** Spring task factory — bakes only start/end + extrema keyframes. */
    springTask(spec) {
      return () => bakeSpringTaskPoints(tl, spec);
    },
  };
  return tl;
}

function normalizeEnd(result, fallback) {
  if (typeof result === "number" && isFinite(result)) return Math.round(result);
  if (result && typeof result === "object" && typeof result.endFrame === "number") {
    return Math.round(result.endFrame);
  }
  return fallback;
}

function bakeTweenPoints(tl, spec) {
  if (!spec || spec.id == null || spec.attr == null) {
    throw new Error("tl.tween requires id and attr");
  }
  const from = Number(spec.from) || 0;
  const to = Number(spec.to) || 0;
  const duration = Math.max(0, Math.round(Number(spec.duration) || 0));
  const start = tl.frame;
  const points = [];
  if (spec.spring != null) {
    const spring = solveSpring({
      from,
      to,
      fps: tl.fps,
      velocity: spec.velocity || 0,
      ...(typeof spec.spring === "object" ? spec.spring : {}),
    });
    const frames = Math.max(duration, spring.settleFrame);
    for (let f = 0; f <= frames; f++) points.push([start + f, spring.at(f)]);
  } else if (spec.ola != null) {
    const tau = typeof spec.ola === "object" ? spec.ola.tau : spec.ola;
    const traj = olaTrajectory(
      [{ frame: start, value: from }, { frame: start + Math.max(1, duration), value: to }],
      { fps: tl.fps, tau: tau == null ? 0.15 : tau, velocity0: spec.velocity || 0 },
    );
    for (const p of traj.points) points.push([p.frame, p.value]);
  } else {
    const ease = resolveEasing(spec.easing);
    for (let f = 0; f <= duration; f++) {
      const u = duration === 0 ? 1 : f / duration;
      points.push([start + f, from + (to - from) * ease(u)]);
    }
  }
  const entry = { id: spec.id, attr: spec.attr, points, ease: spec.ease || "None" };
  if (tl._write) tl._write(entry);
  else tl.batch.push(entry);
  return { endFrame: start + duration, points: points.length };
}

function bakeSpringTaskPoints(tl, spec) {
  if (!spec || spec.id == null || spec.attr == null) {
    throw new Error("tl.springTask requires id and attr");
  }
  const start = tl.frame;
  const spring = solveSpring({
    from: spec.from == null ? 0 : spec.from,
    to: spec.to == null ? 1 : spec.to,
    fps: tl.fps,
    velocity: spec.velocity || 0,
    ...(typeof spec.spring === "object" ? spec.spring : {}),
  });
  const points = springExtremaKeyframes(spring, { startFrame: start });
  const entry = { id: spec.id, attr: spec.attr, points, ease: "None" };
  if (tl._write) tl._write(entry);
  else tl.batch.push(entry);
  return { endFrame: start + spring.settleFrame, points: points.length };
}

/* ------------------------------------------------------------------ *
 * Analytical spring solver (Motion / Framer Motion closed form)
 * ------------------------------------------------------------------ */

/**
 * Exact analytical solution of the damped harmonic oscillator
 *
 *     m·x''(t) + c·x'(t) + k·x(t) = 0
 *
 * for a `from -> to` animation with initial velocity, covering all three
 * damping regimes:
 *
 *   underdamped    ζ < 1:  y = to − e^(−ζω0 t)(C1·cos(ωd t) + C2·sin(ωd t))
 *   critically     ζ ≈ 1:  y = to − (C1 + C2·t)·e^(−ω0 t)
 *   overdamped     ζ > 1:  y = to − A·e^(r1 t) − B·e^(r2 t)
 *
 * where ω0 = √(k/m), ζ = c / (2√(k·m)), ωd = ω0√(1−ζ²) and r1/2 = −ζω0 ± ω0√(ζ²−1).
 *
 * @returns solver with `at(frame)`, `atTime(t)`, `velocityAt(frame)`,
 *   `settleFrame`, `settleTime`, `regime`, `overshoot`.
 */
export function solveSpring(opts = {}) {
  const from = Number(opts.from == null ? 0 : opts.from);
  const to = Number(opts.to == null ? 1 : opts.to);
  const stiffness = Math.max(1e-6, Number(opts.stiffness == null ? 100 : opts.stiffness));
  const damping = Math.max(0, Number(opts.damping == null ? 10 : opts.damping));
  const mass = Math.max(1e-6, Number(opts.mass == null ? 1 : opts.mass));
  const velocity = Number(opts.velocity == null ? 0 : opts.velocity);
  const fps = Math.max(1, Number(opts.fps) || DEFAULT_FPS);
  const restDelta = Math.max(1e-9, Number(opts.restDelta == null ? 0.001 : opts.restDelta));

  const omega0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const delta = to - from;
  const regime = Math.abs(zeta - 1) < 1e-6 ? "critically" : zeta < 1 ? "underdamped" : "overdamped";

  let atTime;
  let velocityAtTime;
  if (regime === "underdamped") {
    const wd = omega0 * Math.sqrt(1 - zeta * zeta);
    const c1 = delta;
    const c2 = (zeta * omega0 * delta - velocity) / wd;
    const a = zeta * omega0;
    atTime = (t) => to - Math.exp(-a * t) * (c1 * Math.cos(wd * t) + c2 * Math.sin(wd * t));
    // y' = e^(−a t)·( a·f − f' ) with f = c1·cos + c2·sin, f' = ωd(c2·cos − c1·sin)
    velocityAtTime = (t) =>
      Math.exp(-a * t) *
      (a * (c1 * Math.cos(wd * t) + c2 * Math.sin(wd * t)) +
        wd * (c1 * Math.sin(wd * t) - c2 * Math.cos(wd * t)));
  } else if (regime === "critically") {
    const c1 = delta;
    const c2 = omega0 * delta - velocity;
    atTime = (t) => to - (c1 + c2 * t) * Math.exp(-omega0 * t);
    velocityAtTime = (t) =>
      Math.exp(-omega0 * t) * (omega0 * c1 + omega0 * c2 * t - c2);
  } else {
    const s = omega0 * Math.sqrt(zeta * zeta - 1);
    const r1 = -zeta * omega0 + s; // slow root (dominates the tail)
    const r2 = -zeta * omega0 - s;
    const a = (-velocity - r2 * delta) / (r1 - r2);
    const b = delta - a;
    atTime = (t) => to - a * Math.exp(r1 * t) - b * Math.exp(r2 * t);
    velocityAtTime = (t) => -(a * r1 * Math.exp(r1 * t) + b * r2 * Math.exp(r2 * t));
  }

  // Settling time: |displacement| ≤ restDelta (absolute, scaled by the move).
  // Underdamped: exact decay envelope e^(−ζω0 t)·√(C1²+C2²) (conservative —
  // the envelope upper-bounds the oscillation). Critically/overdamped: the
  // displacement is a sum of at most two exponentials, so the first crossing
  // is found by geometric scan + bisection and verified to hold.
  const scale = Math.max(Math.abs(delta), 1);
  const rest = restDelta * scale;
  let settleTime;
  if (regime === "underdamped") {
    const wd = omega0 * Math.sqrt(1 - zeta * zeta);
    const c1 = delta;
    const c2 = (zeta * omega0 * delta - velocity) / wd;
    const amp = Math.sqrt(c1 * c1 + c2 * c2);
    settleTime = clampNum(Math.log(Math.max(amp, rest) / rest) / Math.max(1e-6, zeta * omega0), 0, 120);
  } else {
    const disp = (t) => Math.abs(atTime(t) - to);
    if (disp(0) <= rest) {
      settleTime = 0;
    } else {
      let tLow = 0;
      let hi = null;
      let t = 0.5 / Math.max(1e-6, omega0);
      for (let guard = 0; guard < 200 && t < 120; guard++) {
        if (disp(t) <= rest) {
          // Candidate crossing: only accept once it STAYS below rest.
          let holds = true;
          for (const m of [1.25, 1.6, 2.2, 3.2]) {
            if (disp(t * m) > rest) {
              holds = false;
              break;
            }
          }
          if (holds) {
            hi = t;
            break;
          }
        }
        tLow = t;
        t *= 1.4;
      }
      if (hi === null) {
        settleTime = 120;
      } else {
        for (let i = 0; i < 60; i++) {
          const mid = (tLow + hi) / 2;
          if (disp(mid) <= rest) hi = mid;
          else tLow = mid;
        }
        settleTime = clampNum(hi, 0, 120);
      }
    }
  }
  const settleFrame = Math.max(1, Math.ceil(settleTime * fps));

  const spring = {
    from,
    to,
    stiffness,
    damping,
    mass,
    velocity,
    fps,
    restDelta,
    omega0,
    zeta,
    regime,
    settleTime,
    settleFrame,
    durationFrames: settleFrame,
    overshoot: 0,
    atTime,
    velocityAtTime,
    at(frame) {
      return atTime(clampNum(frame, 0, settleFrame) / fps);
    },
    velocityAt(frame) {
      return velocityAtTime(clampNum(frame, 0, settleFrame) / fps);
    },
  };

  // Measured overshoot (first excursion past `to`), 0 when none.
  const dir = delta === 0 ? 1 : Math.sign(delta);
  let maxOver = 0;
  const scanFrames = Math.min(settleFrame * 2 + 60, Math.round(60 * fps));
  for (let f = 1; f <= scanFrames; f++) {
    const over = (spring.at(f) - to) * dir;
    if (over > maxOver) maxOver = over;
    if (f > settleFrame && maxOver === 0) break;
  }
  spring.overshoot = delta === 0 ? 0 : maxOver / Math.abs(delta);
  return spring;
}

/**
 * Extrema + inflection keyframe selection for a solved spring: returns
 * `[frame, value, handles]` tuples containing the start frame, the settle
 * frame, every local extremum (flat tangents) and every curvature-sign
 * inflection (slope tangents) — never every frame.
 */
export function springExtremaKeyframes(spring, opts = {}) {
  const startFrame = Math.max(0, Math.round(Number(opts.startFrame) || 0));
  const handleWeight = clampNum(Number(opts.handleWeight == null ? 0.33 : opts.handleWeight), 0.01, 1);
  const frames = [];
  const push = (f, handles) => frames.push({ frame: f, value: spring.at(f), slope: spring.velocityAt(f), handles });
  push(0, slopeHandles(spring.velocityAt(0), handleWeight));

  // Scan derivative sign changes (extrema) and second-derivative sign changes
  // (inflections) on the continuous solution, refined by bisection.
  const extrema = [];
  const inflections = [];
  const last = spring.settleFrame;
  let prevSlope = spring.velocityAtTime(0);
  let prevCurv = curvatureAt(spring, 0);
  for (let f = 1; f <= last; f++) {
    const slope = spring.velocityAtTime(f / spring.fps);
    if (prevSlope > 0 !== slope > 0 && Math.abs(prevSlope) > 1e-9 && Math.abs(slope) > 1e-9) {
      extrema.push(refineSignChange((t) => spring.velocityAtTime(t), (f - 1) / spring.fps, f / spring.fps));
    }
    prevSlope = slope;
    const curv = curvatureAt(spring, f / spring.fps);
    if (prevCurv > 0 !== curv > 0 && Math.abs(prevCurv) > 1e-9 && Math.abs(curv) > 1e-9) {
      inflections.push(refineSignChange((t) => curvatureAt(spring, t), (f - 1) / spring.fps, f / spring.fps));
    }
    prevCurv = curv;
  }
  for (const t of extrema) {
    const f = Math.round(t * spring.fps);
    if (f > 0 && f < last) push(f, flatHandles(handleWeight));
  }
  for (const t of inflections) {
    const f = Math.round(t * spring.fps);
    if (f > 0 && f < last && !frames.some((p) => p.frame === f)) {
      push(f, slopeHandles(spring.velocityAtTime(f / spring.fps), handleWeight));
    }
  }
  push(last, slopeHandles(spring.velocityAtTime(last / spring.fps), handleWeight));
  frames.sort((a, b) => a.frame - b.frame);

  const out = [];
  for (const p of frames) {
    const handles = p.handles && Object.keys(p.handles).length ? p.handles : null;
    out.push([startFrame + p.frame, round4(p.value), handles || undefined]);
  }
  return out;
}

function curvatureAt(spring, t) {
  const h = 1 / spring.fps / 4;
  const y0 = spring.atTime(Math.max(0, t - h));
  const y1 = spring.atTime(t);
  const y2 = spring.atTime(t + h);
  return (y2 - 2 * y1 + y0) / (h * h);
}

function refineSignChange(fn, t0, t1) {
  let lo = t0;
  let hi = t1;
  let flo = fn(lo);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const fm = fn(mid);
    if (Math.abs(fm) < 1e-12) return mid;
    if (flo > 0 === fm > 0) {
      lo = mid;
      flo = fm;
    } else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Slope (value units per frame) as a Cavalry tangent angle in degrees. */
export function slopeDegrees(slopePerFrame) {
  return Math.atan2(slopePerFrame, 1) * (180 / Math.PI);
}

/** Normalize an angle into [−180, 180). */
function normAngle(deg) {
  let a = deg % 360;
  if (a >= 180) a -= 360;
  if (a < -180) a += 360;
  return a;
}

/** Slope-matched handles in (frames, value) space: angle = atan2(Δv, Δf). */
function slopeHandles(slopePerFrame, weight) {
  const deg = normAngle(slopeDegrees(slopePerFrame));
  return { outAngle: deg, outWeight: weight, inAngle: normAngle(deg + 180), inWeight: weight };
}

/** Flat handles for local extrema (zero slope on both sides). */
function flatHandles(weight) {
  return { outAngle: 0, outWeight: weight, inAngle: 180, inWeight: weight };
}

/* ------------------------------------------------------------------ *
 * Critically damped step + trajectory (Ola)
 * ------------------------------------------------------------------ */

/**
 * One exact analytical critically-damped spring step (Ola):
 *
 *     ω = 2/τ, x = current − target, e = e^(−ω·dt)
 *     next  = target + (x + (v + ω·x)·dt)·e
 *     nextV = (v − ω·(v + ω·x)·dt)·e
 *
 * @returns [nextValue, nextVelocity] — velocity-continuous by construction.
 */
export function olaStep(current, target, velocity, dt, tau = 0.15) {
  const omega = 2 / Math.max(1e-6, tau);
  const step = Math.max(0, dt);
  const x = current - target;
  const e = Math.exp(-omega * step);
  const next = target + (x + (velocity + omega * x) * step) * e;
  const nextV = (velocity - omega * (velocity + omega * x) * step) * e;
  return [next, nextV];
}

/**
 * Integrate `olaStep` across `waypoints` ([{ frame, value }, ...] sorted by
 * frame) at `fps`, producing a velocity-continuous numeric readout. Each
 * waypoint's value becomes the chase target from its frame onward; the
 * velocity carries through every target switch, so no keyframe velocity
 * cliffs appear at waypoint boundaries.
 *
 * @returns {{ points: Array<{frame,value,velocity}>, finalVelocity: number }}
 */
export function olaTrajectory(waypoints, opts = {}) {
  const fps = Math.max(1, Number(opts.fps) || DEFAULT_FPS);
  const tau = Math.max(0.001, Number(opts.tau == null ? 0.15 : opts.tau));
  const sorted = [...(waypoints || [])]
    .map((w) => ({ frame: Math.round(Number(w.frame) || 0), value: Number(w.value) || 0 }))
    .sort((a, b) => a.frame - b.frame);
  if (sorted.length === 0) return { points: [], finalVelocity: 0 };
  const dt = 1 / fps;
  let current = sorted[0].value;
  let v = Number(opts.velocity0) || 0;
  const points = [{ frame: sorted[0].frame, value: current, velocity: v }];
  const lastFrame = sorted[sorted.length - 1].frame;
  let wi = 1;
  for (let f = sorted[0].frame + 1; f <= lastFrame; f++) {
    while (wi < sorted.length && f >= sorted[wi].frame) wi++;
    const target = sorted[Math.min(wi, sorted.length) - 1].value;
    const [next, nextV] = olaStep(current, target, v, dt, tau);
    current = next;
    v = nextV;
    points.push({ frame: f, value: current, velocity: v });
  }
  return { points, finalVelocity: v };
}

/* ------------------------------------------------------------------ *
 * Particle emitter behaviour ratios (Proton -> Cavalry mapping)
 * ------------------------------------------------------------------ */

/**
 * Proton's normalized behaviour ratios translated into native Cavalry 2.8
 * Emitter + Behaviour parameter dictionaries. Proton quantities are 0..1
 * ratios (per-second drift/force, per-life alpha/scale decay); Cavalry emits
 * per-frame at 60fps, so ratios convert as value × 60 for rates and
 * value × lifeFrames for per-life ramps.
 *
 * Each preset: { label, proton, emitter, behaviours } where `emitter` is an
 * attribute dictionary for the Emitter dancer and `behaviours` is a list of
 * { type, attrs } applied by `_mg.particleRig` (each set is fault-tolerant).
 */
export const PARTICLE_PRESETS = {
  /** SaaS UI background dust — sparse, slow, barely-there drift. */
  uiDust: {
    label: "UI background dust",
    proton: {
      RandomDrift: { pan: 0.08, perpan: 0.02, delayLife: 0.9 },
      AlphaFade: { in: 0.15, out: 0.6, easing: "easeOut" },
      ScaleDecay: { a: 0.35, b: 1.0 },
    },
    emitter: {
      "emitter.rate": 4,
      "emitter.life": [180, 300],
      "emitter.speed": [1.5, 4],
      "emitter.direction": [0, 360],
      "emitter.size": [2, 4],
    },
    behaviours: [
      { type: "wander", attrs: { "wander.strength": 0.4, "wander.frequency": 0.25 } },
      { type: "alpha", attrs: { "alpha.start": 0.35, "alpha.end": 0.0 } },
      { type: "scale", attrs: { "scale.start": 0.35, "scale.end": 1.0 } },
    ],
  },
  /** Confetti burst — violent radial push, fast fade, spin. */
  confettiBurst: {
    label: "Confetti burst",
    proton: {
      Initializer: { mass: [0.8, 1.6], radius: 6, dir: [0, 360], angle: [0, 30] },
      RandomDrift: { pan: 0.22, perpan: 0.05, delayLife: 0.5 },
      Attraction: { forcePositionStrength: 0.5, forcePositionRadius: 220 },
      AlphaFade: { in: 0.05, out: 0.75, easing: "easeIn" },
      ScaleDecay: { a: 1.0, b: 0.2 },
    },
    emitter: {
      "emitter.rate": 0,
      "emitter.burst": 26,
      "emitter.life": [45, 75],
      "emitter.speed": [8, 18],
      "emitter.direction": [0, 360],
      "emitter.size": [6, 14],
      "emitter.spin": [-240, 240],
    },
    behaviours: [
      { type: "gravity", attrs: { "gravity.strength": 0.55 } },
      { type: "repel", attrs: { "repel.strength": 0.5, "repel.radius": 220 } },
      { type: "alpha", attrs: { "alpha.start": 1.0, "alpha.end": 0.0 } },
      { type: "scale", attrs: { "scale.start": 1.0, "scale.end": 0.2 } },
    ],
  },
  /** Data-stream particles — vertical fall with turbulence jitter. */
  dataStream: {
    label: "Data stream",
    proton: {
      Initializer: { mass: [0.6, 1.2], dir: [70, 110], angle: [0, 8] },
      RandomDrift: { pan: 0.12, perpan: 0.03, delayLife: 0.6 },
      AlphaFade: { in: 0.1, out: 0.45, easing: "linear" },
      ScaleDecay: { a: 0.6, b: 1.0 },
    },
    emitter: {
      "emitter.rate": 9,
      "emitter.life": [90, 150],
      "emitter.speed": [6, 12],
      "emitter.direction": [90],
      "emitter.directionJitter": 8,
      "emitter.size": [2, 5],
    },
    behaviours: [
      { type: "turbulence", attrs: { "turbulence.strength": 0.3, "turbulence.frequency": 1.4 } },
      { type: "alpha", attrs: { "alpha.start": 0.15, "alpha.end": 0.85 } },
      { type: "scale", attrs: { "scale.start": 0.6, "scale.end": 1.0 } },
    ],
  },
};

/**
 * Merge a named preset with per-call overrides (deep on the top level) into a
 * concrete Cavalry configuration. Unknown preset names throw — callers should
 * never fall back to a silent default.
 */
export function mapParticlePreset(name, overrides) {
  const preset = PARTICLE_PRESETS[name];
  if (!preset) {
    throw new Error(`motion-core: unknown PARTICLE_PRESETS entry "${name}" (have ${Object.keys(PARTICLE_PRESETS).join(", ")})`);
  }
  const o = overrides || {};
  const merged = {
    label: preset.label,
    proton: { ...preset.proton, ...(o.proton || {}) },
    emitter: { ...preset.emitter, ...(o.emitter || {}) },
    behaviours: preset.behaviours.map((b, i) => ({
      type: b.type,
      attrs: { ...b.attrs, ...(((o.behaviours || [])[i] || {}).attrs || {}) },
    })),
  };
  return merged;
}

const round4 = (v) => Math.round(v * 10000) / 10000;
