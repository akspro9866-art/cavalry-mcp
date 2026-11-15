/** Declarative timelines, analytical springs, Ola counters and particle presets. Verbatim chunk of the injected _mg DSL; mg_helpers.ts concatenates these in order.
 *
 * Extracted as standalone math from Motion Canvas (timeline combinators),
 * Motion / Framer Motion (closed-form damped harmonic oscillator) and Ola
 * (analytical critically-damped step). The Node-side mirror of these exact
 * algorithms lives in `src/prelude/motion-core.js`; keep the two in sync. */
export const MG_MOTION_CORE_SOURCE = String.raw`  /**
   * Exact analytical solution of the damped harmonic oscillator for a
   * from -> to move with initial velocity (Motion / Framer Motion spring).
   * Covers underdamped (zeta < 1), critically damped (zeta == 1) and
   * overdamped (zeta > 1) regimes; returns { at(frame), velocityAt(frame),
   * settleFrame, regime, overshoot, ... }. restDelta is an absolute value
   * distance (default 0.001).
   */
  solveSpring(opts) {
    opts = opts || {};
    const from = Number(opts.from == null ? 0 : opts.from);
    const to = Number(opts.to == null ? 1 : opts.to);
    const stiffness = Math.max(1e-6, Number(opts.stiffness == null ? 100 : opts.stiffness));
    const damping = Math.max(0, Number(opts.damping == null ? 10 : opts.damping));
    const mass = Math.max(1e-6, Number(opts.mass == null ? 1 : opts.mass));
    const velocity = Number(opts.velocity == null ? 0 : opts.velocity);
    const fps = Math.max(1, Number(opts.fps) || 60);
    const restDelta = Math.max(1e-9, Number(opts.restDelta == null ? 0.001 : opts.restDelta));
    const omega0 = Math.sqrt(stiffness / mass);
    const zeta = damping / (2 * Math.sqrt(stiffness * mass));
    const delta = to - from;
    const regime = Math.abs(zeta - 1) < 1e-6 ? "critically" : (zeta < 1 ? "underdamped" : "overdamped");
    let atTime = null;
    let velocityAtTime = null;
    if (regime === "underdamped") {
      const wd = omega0 * Math.sqrt(1 - zeta * zeta);
      const c1 = delta;
      const c2 = (zeta * omega0 * delta - velocity) / wd;
      const a = zeta * omega0;
      atTime = function (t) { return to - Math.exp(-a * t) * (c1 * Math.cos(wd * t) + c2 * Math.sin(wd * t)); };
      velocityAtTime = function (t) {
        return Math.exp(-a * t) * (a * (c1 * Math.cos(wd * t) + c2 * Math.sin(wd * t)) + wd * (c1 * Math.sin(wd * t) - c2 * Math.cos(wd * t)));
      };
    } else if (regime === "critically") {
      const c1 = delta;
      const c2 = omega0 * delta - velocity;
      atTime = function (t) { return to - (c1 + c2 * t) * Math.exp(-omega0 * t); };
      velocityAtTime = function (t) { return Math.exp(-omega0 * t) * (omega0 * c1 + omega0 * c2 * t - c2); };
    } else {
      const s = omega0 * Math.sqrt(zeta * zeta - 1);
      const r1 = -zeta * omega0 + s;
      const r2 = -zeta * omega0 - s;
      const ca = (-velocity - r2 * delta) / (r1 - r2);
      const cb = delta - ca;
      atTime = function (t) { return to - ca * Math.exp(r1 * t) - cb * Math.exp(r2 * t); };
      velocityAtTime = function (t) { return -(ca * r1 * Math.exp(r1 * t) + cb * r2 * Math.exp(r2 * t)); };
    }
    const scale = Math.max(Math.abs(delta), 1);
    const rest = restDelta * scale;
    let settleTime = 0;
    if (regime === "underdamped") {
      const wd = omega0 * Math.sqrt(1 - zeta * zeta);
      const c1 = delta;
      const c2 = (zeta * omega0 * delta - velocity) / wd;
      const amp = Math.sqrt(c1 * c1 + c2 * c2);
      settleTime = _mg.__mgClamp(Math.log(Math.max(amp, rest) / rest) / Math.max(1e-6, zeta * omega0), 0, 120);
    } else {
      // Critically/overdamped: geometric scan + bisection on the exact
      // displacement (sum of at most two exponentials), verified to hold.
      const disp = function (t) { return Math.abs(atTime(t) - to); };
      if (disp(0) <= rest) {
        settleTime = 0;
      } else {
        let tLow = 0;
        let hi = null;
        let t = 0.5 / Math.max(1e-6, omega0);
        for (let guard = 0; guard < 200 && t < 120; guard++) {
          if (disp(t) <= rest) {
            let holds = true;
            const mults = [1.25, 1.6, 2.2, 3.2];
            for (let m = 0; m < mults.length; m++) {
              if (disp(t * mults[m]) > rest) { holds = false; break; }
            }
            if (holds) { hi = t; break; }
          }
          tLow = t;
          t *= 1.4;
        }
        if (hi === null) {
          settleTime = 120;
        } else {
          for (let i = 0; i < 60; i++) {
            const mid = (tLow + hi) / 2;
            if (disp(mid) <= rest) hi = mid; else tLow = mid;
          }
          settleTime = _mg.__mgClamp(hi, 0, 120);
        }
      }
    }
    const settleFrame = Math.max(1, Math.ceil(settleTime * fps));
    const spring = {
      from: from, to: to, stiffness: stiffness, damping: damping, mass: mass,
      velocity: velocity, fps: fps, restDelta: restDelta, omega0: omega0, zeta: zeta,
      regime: regime, settleTime: settleTime, settleFrame: settleFrame, durationFrames: settleFrame,
      overshoot: 0, atTime: atTime, velocityAtTime: velocityAtTime,
      at: function (frame) { return atTime(_mg.__mgClamp(frame, 0, settleFrame) / fps); },
      velocityAt: function (frame) { return velocityAtTime(_mg.__mgClamp(frame, 0, settleFrame) / fps); },
    };
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
  },

  /* ---- private math helpers (mirrored in src/prelude/motion-core.js) ---- */

  __mgClamp(v, min, max) { return Math.max(min, Math.min(max, v)); },

  __mgNormAngle(deg) {
    let a = deg % 360;
    if (a >= 180) a -= 360;
    if (a < -180) a += 360;
    return a;
  },

  /** Slope (value units per frame) as a tangent angle in (frames, value) space. */
  __mgSlopeDegrees(slopePerFrame) {
    return this.__mgNormAngle(Math.atan2(slopePerFrame, 1) * (180 / Math.PI));
  },

  /** Slope-matched handle pair; in-handle points opposite to out-handle. */
  __mgSlopeHandles(slopePerFrame, weight) {
    const deg = this.__mgSlopeDegrees(slopePerFrame);
    return { outAngle: deg, outWeight: weight, inAngle: this.__mgNormAngle(deg + 180), inWeight: weight };
  },

  /** Second derivative of a solved spring at time t (central difference). */
  __mgCurvature(spring, t) {
    const h = 1 / spring.fps / 4;
    const y0 = spring.atTime(Math.max(0, t - h));
    const y1 = spring.atTime(t);
    const y2 = spring.atTime(t + h);
    return (y2 - 2 * y1 + y0) / (h * h);
  },

  /** Bisection-refined sign change of fn on [t0, t1]. */
  __mgRefineSign(fn, t0, t1) {
    let lo = t0;
    let hi = t1;
    let flo = fn(lo);
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const fm = fn(mid);
      if (Math.abs(fm) < 1e-12) return mid;
      if ((flo > 0) === (fm > 0)) { lo = mid; flo = fm; } else { hi = mid; }
    }
    return (lo + hi) / 2;
  },

  __mgNormalizeEnd(result, fallback) {
    if (typeof result === "number" && isFinite(result)) return Math.round(result);
    if (result && typeof result === "object" && typeof result.endFrame === "number") return Math.round(result.endFrame);
    return fallback;
  },

  __mgResolveEase(spec) {
    const builtins = {
      linear: function (t) { return t; },
      easeIn: function (t) { return t * t; },
      easeOut: function (t) { return 1 - (1 - t) * (1 - t); },
      easeInOut: function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
      easeInCubic: function (t) { return t * t * t; },
      easeOutCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
      easeInOutCubic: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
      expoOut: function (t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); },
      backOut: function (t) { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    };
    if (spec == null) return builtins.easeOutCubic;
    if (typeof spec === "string") {
      const fn = builtins[spec];
      if (!fn) throw new Error("unknown easing " + String(spec));
      return fn;
    }
    if (Array.isArray(spec) && spec.length === 4) {
      return function (t) { return _mg.__mgCubicBezier(spec[0], spec[1], spec[2], spec[3], t); };
    }
    if (typeof spec === "function") return spec;
    throw new Error("easing must be a name, [x1,y1,x2,y2] or function");
  },

  /** Newton-Raphson cubic-bezier easing (bisection fallback). */
  __mgCubicBezier(x1, y1, x2, y2, t) {
    const ax = 1 - 3 * x2 + 3 * x1;
    const bx = 3 * x2 - 6 * x1;
    const cx = 3 * x1;
    const ay = 1 - 3 * y2 + 3 * y1;
    const by = 3 * y2 - 6 * y1;
    const cy = 3 * y1;
    const xAt = function (u) { return ((ax * u + bx) * u + cx) * u; };
    const yAt = function (u) { return ((ay * u + by) * u + cy) * u; };
    const dxAt = function (u) { return (3 * ax * u + 2 * bx) * u + cx; };
    const u0 = _mg.__mgClamp(t, 0, 1);
    if (u0 === 0 || u0 === 1) return yAt(u0);
    let u = u0;
    for (let i = 0; i < 12; i++) {
      const err = xAt(u) - u0;
      if (Math.abs(err) < 1e-7) return yAt(u);
      const d = dxAt(u);
      if (Math.abs(d) < 1e-7) break;
      u = _mg.__mgClamp(u - err / d, 0, 1);
    }
    let lo = 0;
    let hi = 1;
    u = u0;
    for (let i = 0; i < 40; i++) {
      const err = xAt(u) - u0;
      if (Math.abs(err) < 1e-7) break;
      if (err < 0) lo = u; else hi = u;
      u = (lo + hi) / 2;
    }
    return yAt(u);
  },

  __mgBakeTween(tl, spec) {
    if (!spec || spec.id == null || spec.attr == null) throw new Error("tl.tween requires id and attr");
    const from = Number(spec.from) || 0;
    const to = Number(spec.to) || 0;
    const duration = Math.max(0, Math.round(Number(spec.duration) || 0));
    const start = tl.frame;
    const points = [];
    if (spec.spring != null) {
      const merged = { from: from, to: to, fps: tl.fps, velocity: spec.velocity || 0 };
      const springOpts = typeof spec.spring === "object" ? spec.spring : {};
      for (const k in springOpts) merged[k] = springOpts[k];
      const spring = _mg.solveSpring(merged);
      const frames = Math.max(duration, spring.settleFrame);
      for (let f = 0; f <= frames; f++) points.push([start + f, Math.round(spring.at(f) * 10000) / 10000]);
    } else if (spec.ola != null) {
      const tau = typeof spec.ola === "object" ? spec.ola.tau : spec.ola;
      const traj = _mg.olaTrajectory(
        [{ frame: start, value: from }, { frame: start + Math.max(1, duration), value: to }],
        { fps: tl.fps, tau: tau == null ? 0.15 : tau, velocity0: spec.velocity || 0 },
      );
      for (let i = 0; i < traj.points.length; i++) points.push([traj.points[i].frame, Math.round(traj.points[i].value * 10000) / 10000]);
    } else {
      const ease = _mg.__mgResolveEase(spec.easing);
      for (let f = 0; f <= duration; f++) {
        const u = duration === 0 ? 1 : f / duration;
        points.push([start + f, Math.round((from + (to - from) * ease(u)) * 10000) / 10000]);
      }
    }
    const entry = { id: spec.id, attr: spec.attr, points: points, ease: spec.ease || "None" };
    tl.writeEntry(entry);
    return { endFrame: start + duration, points: points.length };
  },

  __mgBakeSpringTask(tl, spec) {
    if (!spec || spec.id == null || spec.attr == null) throw new Error("tl.springTask requires id and attr");
    const start = tl.frame;
    const merged = { from: spec.from == null ? 0 : spec.from, to: spec.to == null ? 1 : spec.to, fps: tl.fps, velocity: spec.velocity || 0 };
    const springOpts = typeof spec.spring === "object" ? spec.spring : {};
    for (const k in springOpts) merged[k] = springOpts[k];
    const spring = _mg.solveSpring(merged);
    const points = _mg.springExtremaKeyframes(spring, { startFrame: start, handleWeight: spec.handleWeight });
    const entry = { id: spec.id, attr: spec.attr, points: points, ease: "None" };
    tl.writeEntry(entry);
    return { endFrame: start + spring.settleFrame, points: points.length };
  },

  /**
   * Declarative timeline combinators (Motion Canvas sequencing model).
   * _mg.timeline({ fps, frame, write }) returns a stateful cursor { frame,
   * fps } with all/chain/waitFor/delay/sequence combinators plus tween and
   * springTask task factories, so preset code expresses timing declaratively
   * instead of hard-coding keyframe frame numbers. Tasks animate relative to
   * the cursor's current frame; combinators land the cursor on the latest
   * endFrame. opts.write (optional) receives { id, attr, points, ease } per
   * baked task; the default write goes through _mg.kf, which understands
   * [frame, value, handles] tuples for tangent-exact spring baking.
   */
  timeline(opts) {
    opts = opts || {};
    const fps = Math.max(1, Number(opts.fps) || 60);
    const write = typeof opts.write === "function" ? opts.write : null;
    const tl = {
      fps: fps,
      frame: Math.max(0, Math.round(Number(opts.frame) || 0)),
      batch: [],
      writeEntry(entry) {
        if (write) { write(entry); return; }
        this.batch.push(entry);
        const pts = entry.points.map(function (p) {
          return Array.isArray(p) && p.length > 2 ? [p[0], p[1], p[2]] : [p[0], p[1]];
        });
        _mg.kf(entry.id, entry.attr, pts, entry.ease || "None");
      },
      get endFrame() { return this.frame; },
      chain() {
        for (let i = 0; i < arguments.length; i++) {
          const end = _mg.__mgNormalizeEnd(arguments[i](this), this.frame);
          this.frame = Math.max(this.frame, end);
        }
        return this.frame;
      },
      all() {
        const base = this.frame;
        let maxEnd = base;
        for (let i = 0; i < arguments.length; i++) {
          this.frame = base;
          const end = _mg.__mgNormalizeEnd(arguments[i](this), this.frame);
          maxEnd = Math.max(maxEnd, end);
        }
        this.frame = maxEnd;
        return this.frame;
      },
      waitFor(frames) {
        this.frame += Math.max(0, Math.round(Number(frames) || 0));
        return this.frame;
      },
      delay(frames, task) {
        this.waitFor(frames);
        return this.chain(task);
      },
      sequence(stagger) {
        const gap = Math.max(0, Math.round(Number(stagger) || 0));
        const base = this.frame;
        let maxEnd = base;
        for (let i = 1; i < arguments.length; i++) {
          this.frame = base + (i - 1) * gap;
          const end = _mg.__mgNormalizeEnd(arguments[i](this), this.frame);
          maxEnd = Math.max(maxEnd, end);
        }
        this.frame = maxEnd;
        return this.frame;
      },
      tween(spec) { return function () { return _mg.__mgBakeTween(tl, spec); }; },
      springTask(spec) { return function () { return _mg.__mgBakeSpringTask(tl, spec); }; },
    };
    return tl;
  },

  /**
   * Extrema + inflection keyframe selection for a solved spring: start frame,
   * settle frame, every local extremum (flat tangents) and every curvature
   * sign change (slope tangents). Returns [frame, value, handles] tuples so
   * keyframe counts stay proportional to curve complexity, not duration.
   */
  springExtremaKeyframes(spring, opts) {
    opts = opts || {};
    const startFrame = Math.max(0, Math.round(Number(opts.startFrame) || 0));
    const weight = _mg.__mgClamp(Number(opts.handleWeight == null ? 0.33 : opts.handleWeight), 0.01, 1);
    const frames = [];
    const push = function (f, handles) {
      frames.push({ frame: f, value: spring.at(f), slope: spring.velocityAtTime(f / spring.fps), handles: handles });
    };
    push(0, _mg.__mgSlopeHandles(spring.velocityAtTime(0), weight));
    const extrema = [];
    const inflections = [];
    const last = spring.settleFrame;
    let prevSlope = spring.velocityAtTime(0);
    let prevCurv = _mg.__mgCurvature(spring, 0);
    for (let f = 1; f <= last; f++) {
      const t = f / spring.fps;
      const slope = spring.velocityAtTime(t);
      if ((prevSlope > 0) !== (slope > 0) && Math.abs(prevSlope) > 1e-9 && Math.abs(slope) > 1e-9) {
        extrema.push(_mg.__mgRefineSign(spring.velocityAtTime, (f - 1) / spring.fps, t));
      }
      prevSlope = slope;
      const curv = _mg.__mgCurvature(spring, t);
      if ((prevCurv > 0) !== (curv > 0) && Math.abs(prevCurv) > 1e-9 && Math.abs(curv) > 1e-9) {
        inflections.push(_mg.__mgRefineSign(function (tt) { return _mg.__mgCurvature(spring, tt); }, (f - 1) / spring.fps, t));
      }
      prevCurv = curv;
    }
    for (let i = 0; i < extrema.length; i++) {
      const f = Math.round(extrema[i] * spring.fps);
      if (f > 0 && f < last) push(f, { outAngle: 0, outWeight: weight, inAngle: 180, inWeight: weight });
    }
    for (let i = 0; i < inflections.length; i++) {
      const f = Math.round(inflections[i] * spring.fps);
      const taken = frames.some(function (p) { return p.frame === f; });
      if (f > 0 && f < last && !taken) push(f, _mg.__mgSlopeHandles(spring.velocityAtTime(f / spring.fps), weight));
    }
    push(last, _mg.__mgSlopeHandles(spring.velocityAtTime(last / spring.fps), weight));
    frames.sort(function (a, b) { return a.frame - b.frame; });
    return frames.map(function (p) {
      const handles = {};
      let n = 0;
      for (const k in p.handles) { handles[k] = p.handles[k]; n++; }
      const tuple = [startFrame + p.frame, Math.round(p.value * 10000) / 10000];
      if (n > 0) tuple.push(handles);
      return tuple;
    });
  },

  /**
   * Bake an analytical spring into sparse smooth-bezier keyframes on
   * (layerId, attr): samples only start/end + extrema + inflection frames,
   * each with angle/weight handles derived from the exact derivative.
   * opts: { from, to, stiffness, damping, mass, velocity, fps, restDelta,
   *         handleWeight, startFrame }. Property aliases (x, y, position,
   * scale) resolve through _mg.__propertyAttrs.
   */
  bakeSpringKeyframes(layerId, attr, opts) {
    opts = opts || {};
    const spring = this.solveSpring(opts);
    const attrs = this.__propertyAttrs(attr);
    const baked = [];
    for (let i = 0; i < attrs.length; i++) {
      const points = this.springExtremaKeyframes(spring, { startFrame: opts.startFrame || 0, handleWeight: opts.handleWeight });
      this.kf(layerId, attrs[i], points, "None");
      baked.push({ attr: attrs[i], keyframes: points.length });
    }
    return { element: layerId, regime: spring.regime, settleFrame: spring.settleFrame, overshoot: spring.overshoot, attrs: baked };
  },

  /**
   * One exact analytical critically-damped spring step (Ola):
   * omega = 2/tau; x = current - target; e = exp(-omega*dt);
   * next = target + (x + (v + omega*x)*dt)*e; nextV = (v - omega*(v + omega*x)*dt)*e.
   * Returns [nextValue, nextVelocity] — velocity-continuous by construction.
   */
  olaStep(current, target, velocity, dt, tau) {
    const omega = 2 / Math.max(1e-6, tau == null ? 0.15 : tau);
    const step = Math.max(0, dt);
    const x = current - target;
    const e = Math.exp(-omega * step);
    return [
      target + (x + (velocity + omega * x) * step) * e,
      (velocity - omega * (velocity + omega * x) * step) * e,
    ];
  },

  /**
   * Integrate _mg.olaStep across [{ frame, value }] waypoints at fps. Each
   * waypoint switches the chase target from its frame onward; the velocity
   * carries through every switch, so numeric readouts stay velocity-continuous
   * with no keyframe velocity cliffs. Returns { points, finalVelocity }.
   */
  olaTrajectory(waypoints, opts) {
    opts = opts || {};
    const fps = Math.max(1, Number(opts.fps) || 60);
    const tau = Math.max(0.001, Number(opts.tau == null ? 0.15 : opts.tau));
    const sorted = (waypoints || []).map(function (w) {
      return { frame: Math.round(Number(w.frame) || 0), value: Number(w.value) || 0 };
    }).sort(function (a, b) { return a.frame - b.frame; });
    if (!sorted.length) return { points: [], finalVelocity: 0 };
    const dt = 1 / fps;
    let current = sorted[0].value;
    let v = Number(opts.velocity0) || 0;
    const points = [{ frame: sorted[0].frame, value: current, velocity: v }];
    let wi = 1;
    for (let f = sorted[0].frame + 1; f <= sorted[sorted.length - 1].frame; f++) {
      while (wi < sorted.length && f >= sorted[wi].frame) wi++;
      const target = sorted[Math.min(wi, sorted.length) - 1].value;
      const stepped = _mg.olaStep(current, target, v, dt, tau);
      current = stepped[0];
      v = stepped[1];
      points.push({ frame: f, value: current, velocity: v });
    }
    return { points: points, finalVelocity: v };
  },

  /**
   * Velocity-continuous numeric counter (Ola) driving a text layer through a
   * stringGenerator: waypoints = [{ frame, value }], tau = time constant.
   * Keyframes only on frames where the DISPLAYED value (quantized to the
   * generator precision) changes, so SaaS counters and chart readouts stay
   * smooth without per-frame keyframe spam or velocity cliffs.
   */
  animateCounter(textLayerId, waypoints, tau) {
    if (textLayerId == null) throw new Error("_mg.animateCounter requires textLayerId");
    const sorted = (waypoints || []).map(function (w) {
      return { frame: Math.round(Number(w.frame) || 0), value: Number(w.value) || 0 };
    }).sort(function (a, b) { return a.frame - b.frame; });
    if (sorted.length < 2) throw new Error("_mg.animateCounter requires at least two waypoints");
    let decimals = 0;
    for (let i = 0; i < sorted.length; i++) {
      const s = String(sorted[i].value);
      const dot = s.indexOf(".");
      if (dot >= 0) decimals = Math.max(decimals, s.length - dot - 1);
    }
    const traj = this.olaTrajectory(sorted, { tau: tau == null ? 0.15 : tau });
    const id = api.create("stringGenerator", "OLA Counter");
    api.set(id, { "generator.precision": decimals });
    api.set(id, { "generator.length": 1 });
    api.connect(id, "id", textLayerId, "text");
    const step = Math.pow(10, -decimals);
    const pts = [];
    let lastShown = null;
    for (let i = 0; i < traj.points.length; i++) {
      const shown = Math.round(traj.points[i].value / step) * step;
      if (lastShown === null || Math.abs(shown - lastShown) >= step * 0.999) {
        pts.push([traj.points[i].frame, Math.round(shown * 10000) / 10000]);
        lastShown = shown;
      }
    }
    if (pts.length < 2) pts.push([sorted[sorted.length - 1].frame, pts.length ? pts[pts.length - 1][1] : 0]);
    this.kf(id, "generator.number", pts, "None");
    return { generatorId: id, textId: textLayerId, waypoints: sorted.length, precision: decimals, keyframes: pts.length, finalVelocity: traj.finalVelocity };
  },

  /**
   * Proton's normalized behaviour ratios mapped onto native Cavalry 2.8
   * Emitter + Behaviour parameter dictionaries. Proton ratios are per-second /
   * per-life quantities; Cavalry emits per-frame at 60fps, so rates multiply
   * by 60 and per-life ramps map onto start/end behaviour pairs. Applied by
   * _mg.particleRig with fault-tolerant sets (unsupported attrs are skipped
   * and reported, never fatal).
   */
  PARTICLE_PRESETS: {
    uiDust: {
      label: "UI background dust",
      emitter: { "emitter.rate": 4, "emitter.life": [180, 300], "emitter.speed": [1.5, 4], "emitter.direction": [0, 360], "emitter.size": [2, 4] },
      behaviours: [
        { type: "wander", attrs: { "wander.strength": 0.4, "wander.frequency": 0.25 } },
        { type: "alpha", attrs: { "alpha.start": 0.35, "alpha.end": 0.0 } },
        { type: "scale", attrs: { "scale.start": 0.35, "scale.end": 1.0 } },
      ],
    },
    confettiBurst: {
      label: "Confetti burst",
      emitter: { "emitter.rate": 0, "emitter.burst": 26, "emitter.life": [45, 75], "emitter.speed": [8, 18], "emitter.direction": [0, 360], "emitter.size": [6, 14], "emitter.spin": [-240, 240] },
      behaviours: [
        { type: "gravity", attrs: { "gravity.strength": 0.55 } },
        { type: "repel", attrs: { "repel.strength": 0.5, "repel.radius": 220 } },
        { type: "alpha", attrs: { "alpha.start": 1.0, "alpha.end": 0.0 } },
        { type: "scale", attrs: { "scale.start": 1.0, "scale.end": 0.2 } },
      ],
    },
    dataStream: {
      label: "Data stream",
      emitter: { "emitter.rate": 9, "emitter.life": [90, 150], "emitter.speed": [6, 12], "emitter.direction": [90], "emitter.directionJitter": 8, "emitter.size": [2, 5] },
      behaviours: [
        { type: "turbulence", attrs: { "turbulence.strength": 0.3, "turbulence.frequency": 1.4 } },
        { type: "alpha", attrs: { "alpha.start": 0.15, "alpha.end": 0.85 } },
        { type: "scale", attrs: { "scale.start": 0.6, "scale.end": 1.0 } },
      ],
    },
  },

  /**
   * Build a native Emitter rig from a PARTICLE_PRESETS entry. opts:
   * { x, y, overrides: { emitter, behaviours } }. Every api.set is
   * fault-tolerant: applied attrs land, unsupported ones are reported in the
   * result's skipped lists so agents can see what a given build ignored.
   */
  particleRig(name, presetName, opts) {
    opts = opts || {};
    const preset = this.PARTICLE_PRESETS[presetName];
    if (!preset) throw new Error("_mg.particleRig: unknown preset " + String(presetName) + " (have " + Object.keys(this.PARTICLE_PRESETS).join(", ") + ")");
    try { if (_rb && typeof _rb.fresh === "function") _rb.fresh(); } catch (e) {}
    const emitterAttrs = {};
    for (const k in preset.emitter) emitterAttrs[k] = preset.emitter[k];
    const oe = (opts.overrides || {}).emitter || {};
    for (const k in oe) emitterAttrs[k] = oe[k];
    const emitterId = api.create("emitter", name || "Particles");
    const applied = [];
    const skipped = [];
    for (const k in emitterAttrs) {
      const one = {}; one[k] = emitterAttrs[k];
      try { api.set(emitterId, one); applied.push(k); } catch (e) { skipped.push(k); }
    }
    if (opts.x != null || opts.y != null) {
      try { api.set(emitterId, { x: Number(opts.x) || 0, y: Number(opts.y) || 0 }); applied.push("x", "y"); } catch (e) { skipped.push("x", "y"); }
    }
    const behaviourIds = [];
    const ob = (opts.overrides || {}).behaviours || [];
    const behaviours = preset.behaviours.map(function (b, i) {
      const attrs = {};
      for (const k in b.attrs) attrs[k] = b.attrs[k];
      const ov = (ob[i] || {}).attrs || {};
      for (const k in ov) attrs[k] = ov[k];
      return { type: b.type, attrs: attrs };
    });
    for (let i = 0; i < behaviours.length; i++) {
      const b = behaviours[i];
      let bid = null;
      try { bid = api.create(b.type, name + " " + b.type); } catch (e) { skipped.push("behaviour:" + b.type); continue; }
      const bApplied = [];
      const bSkipped = [];
      for (const k in b.attrs) {
        const one = {}; one[k] = b.attrs[k];
        try { api.set(bid, one); bApplied.push(k); } catch (e) { bSkipped.push(k); }
      }
      try {
        api.connect(bid, "id", emitterId, "behaviours");
      } catch (e) {
        try { api.connect(bid, "id", emitterId, "behavior"); } catch (e2) { skipped.push("connect:" + b.type); }
      }
      behaviourIds.push({ id: bid, type: b.type, applied: bApplied, skipped: bSkipped });
    }
    return { emitter: emitterId, behaviours: behaviourIds, applied: applied, skipped: skipped, preset: presetName };
  },
`;
