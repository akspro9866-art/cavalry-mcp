/**
 * Runtime motion & camera math. Verbatim chunk of the injected _mg DSL;
 * mg_helpers.ts concatenates these in order between canvalry and raster.
 *
 * Every helper is a PURE function of frame/time `t` plus its config: no Date,
 * no unseeded Math.random, no external state. Ports the closed-form spring /
 * C1 spline / Fitts cursor / multi-spring-sum patterns from motion-craft,
 * motion-launch-videos and motion-canvas into Cavalry expressions.
 */
export const MG_MOTION_SOURCE = String.raw`
  /** Clamp helper (motion-craft easing-and-timing). */
  __clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  },

  /**
   * Closed-form unit step response of a damped harmonic oscillator.
   * tau in seconds, zeta = damping ratio, omega = natural frequency (rad/s),
   * v0 = initial velocity. Returns 0 -> 1. Underdamped / critical / overdamped.
   * Mirrors the Node-side evaluateSpring so baked and live values agree.
   */
  __springUnit(tau, zeta, omega, v0) {
    if (tau <= 0) return 0;
    const z = Math.max(0, zeta);
    const w = Math.max(1e-6, omega);
    const iv = v0 || 0;
    if (z < 1) {
      const wd = w * Math.sqrt(1 - z * z);
      const env = Math.exp(-z * w * tau);
      const coeffSin = (z * w - iv) / wd;
      return 1 - env * (Math.cos(wd * tau) + coeffSin * Math.sin(wd * tau));
    }
    if (Math.abs(z - 1) < 1e-6) {
      const env = Math.exp(-w * tau);
      return 1 - env * (1 + (w - iv) * tau);
    }
    const s = w * Math.sqrt(z * z - 1);
    const r1 = -z * w + s;
    const r2 = -z * w - s;
    const c2 = (iv - r1) / (r1 - r2);
    const c1 = 1 + c2;
    return 1 - (c1 * Math.exp(r1 * tau) - c2 * Math.exp(r2 * tau));
  },

  /**
   * C1-continuous Catmull-Rom / cubic Hermite spline (motion-craft splineAt).
   * keyframes: [[frame, v1, v2, ...], ...] sorted by frame. Holds perfectly
   * still (zero tangent, no overshoot) when neighbouring waypoints share a value.
   */
  splineAt(frame, keyframes) {
    const n = keyframes.length;
    if (n === 0) return [];
    if (frame <= keyframes[0][0]) return keyframes[0].slice(1);
    if (frame >= keyframes[n - 1][0]) return keyframes[n - 1].slice(1);
    let i = 0;
    for (let k = 0; k < n - 1; k++) {
      if (frame >= keyframes[k][0] && frame <= keyframes[k + 1][0]) { i = k; break; }
    }
    const p0 = keyframes[Math.max(0, i - 1)];
    const p1 = keyframes[i];
    const p2 = keyframes[i + 1];
    const p3 = keyframes[Math.min(n - 1, i + 2)];
    const dt = p2[0] - p1[0];
    if (dt <= 0) return p1.slice(1);
    const u = this.__clamp((frame - p1[0]) / dt, 0, 1);
    const u2 = u * u;
    const u3 = u2 * u;
    const dims = p1.length - 1;
    const out = new Array(dims);
    for (let d = 1; d <= dims; d++) {
      const y0 = p0[d], y1 = p1[d], y2 = p2[d], y3 = p3[d];
      const m1 = i === 0 ? 0
        : (Math.abs(y1 - y0) < 1e-4 || Math.abs(y2 - y1) < 1e-4) ? 0
        : ((y2 - y0) / (p2[0] - p0[0])) * dt;
      const m2 = i + 1 === n - 1 ? 0
        : (Math.abs(y3 - y2) < 1e-4 || Math.abs(y2 - y1) < 1e-4) ? 0
        : ((y3 - y1) / (p3[0] - p1[0])) * dt;
      const h00 = 2 * u3 - 3 * u2 + 1;
      const h10 = u3 - 2 * u2 + u;
      const h01 = -2 * u3 + 3 * u2;
      const h11 = u3 - u2;
      out[d - 1] = h00 * y1 + h10 * m1 + h01 * y2 + h11 * m2;
    }
    return out;
  },

  /**
   * Instantaneous spline velocity for velocity-driven motion blur
   * (motion-craft splineVelocityAt). keyframes: [frame, scale, x, y, rot?].
   * blur stays 0 while the camera is calm, capped so reading text never smears.
   */
  splineVelocityAt(frame, keyframes) {
    if (keyframes.length < 2) return { vx: 0, vy: 0, vScale: 0, speedPx: 0, blurPx: 0 };
    const norm = keyframes.map(function (w) { return [w[0], w[1], w[2], w[3], w[4] == null ? 0 : w[4]]; });
    const a = this.splineAt(frame - 0.5, norm);
    const b = this.splineAt(frame + 0.5, norm);
    const vx = b[1] - a[1];
    const vy = b[2] - a[2];
    const vScale = b[0] - a[0];
    const speedPx = Math.sqrt(vx * vx + vy * vy) + Math.abs(vScale) * 450;
    const blurPx = speedPx < 18 ? 0 : this.__clamp((speedPx - 18) * 0.045, 0, 3.8);
    return { vx: vx, vy: vy, vScale: vScale, speedPx: speedPx, blurPx: blurPx };
  },

  /**
   * Smooth spring 0 -> 1 starting at frame 'start' (motion-craft springAt).
   * config: { damping = 14, stiffness = 140, mass = 0.75 }. Closed-form, pure t.
   */
  springAt(frame, start, fps, config) {
    const f = fps == null ? 30 : fps;
    const c = config || {};
    const stiffness = Math.max(1e-3, c.stiffness == null ? 140 : c.stiffness);
    const damping = Math.max(0, c.damping == null ? 14 : c.damping);
    const mass = Math.max(1e-3, c.mass == null ? 0.75 : c.mass);
    const omega = Math.sqrt(stiffness / mass);
    const zeta = damping / (2 * Math.sqrt(stiffness * mass));
    const tau = (frame - start) / Math.max(1e-6, f);
    return this.__springUnit(tau, zeta, omega, c.initialVelocity || 0);
  },

  /**
   * Overlapping action / follow-through (motion-craft staggeredSpringAt).
   * Layer 0 (container), 1 (content), 2 (badge) settle on slightly different
   * frames with layered inertia so they never stop robotically in unison.
   */
  staggeredSpringAt(frame, baseStart, layerIndex, fps, stepFrames) {
    const idx = layerIndex || 0;
    const step = stepFrames == null ? 3 : stepFrames;
    const delay = idx * step;
    return this.springAt(frame, baseStart + delay, fps, {
      damping: 13 + idx * 1.2,
      stiffness: Math.max(115, 155 - idx * 12),
      mass: 0.68 + idx * 0.08
    });
  },

  /**
   * Phase-shifted micro-bobbing (motion-craft microBob): a thin float with a
   * different phase per element while the camera holds. Pure sin/cos of frame.
   */
  microBob(frame, elementIndex, amplitudePx, speed) {
    const idx = elementIndex || 0;
    const amp = amplitudePx == null ? 3.5 : amplitudePx;
    const sp = speed == null ? 0.22 : speed;
    const phase = idx * 1.85;
    const dy = Math.sin(frame * sp + phase) * amp;
    const rotDeg = Math.cos(frame * (sp * 0.8) + phase) * (amp * 0.25);
    return { dy: dy, rotDeg: rotDeg };
  },

  /**
   * Fitts's Law movement time (seconds): MT = a + b * log2(2D / W).
   * D = distance to target, W = target width. a/b are empirical intercept/slope.
   */
  fittsMovementTime(distance, targetWidth, a, b) {
    const D = Math.max(1, distance);
    const W = Math.max(1, targetWidth == null ? 48 : targetWidth);
    const ia = a == null ? 0.05 : a;
    const ib = b == null ? 0.12 : b;
    return ia + ib * Math.log2((2 * D) / W);
  },

  /**
   * Humanize cursor waypoints with overshoot + correction submovements
   * (motion-craft AnimatedCursor.humanizeCursorWaypoints). Before each click the
   * cursor overshoots ~4.5px along its travel direction, then settles back.
   */
  __humanizeCursor(waypoints, clicks) {
    if (waypoints.length < 2 || !clicks || clicks.length === 0) return waypoints;
    const out = [];
    for (let i = 0; i < waypoints.length; i++) {
      const f = waypoints[i][0], x = waypoints[i][1], y = waypoints[i][2];
      let matching = null;
      for (let c = 0; c < clicks.length; c++) {
        if (Math.abs(clicks[c].frame - f) <= 4) { matching = clicks[c]; break; }
      }
      if (matching && i > 0) {
        const prev = waypoints[i - 1];
        const dx = x - prev[1], dy = y - prev[2];
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const overX = x + (dx / dist) * 4.5;
        const overY = y + (dy / dist) * 4.5;
        const fOver = Math.max(prev[0] + 2, matching.frame - 8);
        const fSettle = Math.max(fOver + 1, matching.frame - 5);
        if (fOver > prev[0] + 1) out.push([fOver, overX, overY]);
        if (fSettle > fOver) out.push([fSettle, x, y]);
        out.push([matching.frame, x, y]);
      } else {
        out.push([f, x, y]);
      }
    }
    out.sort(function (p, q) { return p[0] - q[0]; });
    return out;
  },

  /**
   * Fitts-law cursor trajectory evaluated at 'frame'. waypoints: [frame, x, y][],
   * clicks: [{ frame, label? }]. Returns { x, y, pressScale, opacity }. Smooth
   * C1 velocity via splineAt; overshoot/correction submovements before clicks.
   */
  fittsCursor(frame, waypoints, clicks, opts) {
    const o = opts || {};
    const cl = clicks || [];
    const processed = o.humanize === false ? waypoints : this.__humanizeCursor(waypoints, cl);
    if (!processed.length) return { x: 0, y: 0, pressScale: 1, opacity: 0 };
    const pos = this.splineAt(frame, processed);
    const cx = pos[0] || 0, cy = pos[1] || 0;
    const first = processed[0][0];
    const last = processed[processed.length - 1][0];
    let opacity = 1;
    if (o.fadeInOut !== false) {
      const fin = this.__clamp((frame - (first - 6)) / 8, 0, 1);
      const fout = 1 - this.__clamp((frame - (last + 4)) / 12, 0, 1);
      opacity = fin * fout;
    }
    let pressScale = 1;
    for (let i = 0; i < cl.length; i++) {
      const dt = frame - cl[i].frame;
      if (dt >= -2 && dt <= 14) {
        const down = this.__clamp((dt + 2) / 4, 0, 1);
        const up = this.__clamp((dt - 2) / 8, 0, 1);
        pressScale = 1 - 0.22 * (down - up);
      }
    }
    return { x: cx, y: cy, pressScale: pressScale, opacity: opacity };
  },

  /** Settling time after which a [zeta, omega] spring snaps to exactly 1 (core.js). */
  __settle(sp) {
    return 16 / Math.max(1e-6, sp[0] * sp[1]);
  },

  /** Closed-form [zeta, omega] step response with settle snap (core.js S). */
  __springStep(tau, sp) {
    if (tau <= 0) return 0;
    if (tau >= this.__settle(sp)) return 1;
    return this.__springUnit(tau, sp[0], sp[1], 0);
  },

  /** Derivative of __springStep, per second (core.js dS). */
  __springStepVel(tau, sp) {
    const z = sp[0], w = sp[1];
    if (tau <= 0 || tau >= this.__settle(sp)) return 0;
    if (z < 1) {
      const wd = w * Math.sqrt(1 - z * z);
      return (w * w / wd) * Math.exp(-z * w * tau) * Math.sin(wd * tau);
    }
    return w * w * tau * Math.exp(-w * tau);
  },

  /**
   * Closed-form multi-spring sum evaluator (motion-launch-videos Prop.at).
   * A property = base value v0 plus one spring per target change, superposed.
   * events (time order): [{ t, d, sp:[zeta,omega] }] for a relative move, or
   * [{ t, v, set:true }] for an instant jump that cancels earlier springs.
   * opts: { dur, loop } enable hold/cycle seam carry-over so a looping value is
   * continuous at the seam. Pure function of t.
   */
  multiSpringAt(t, v0, events, opts) {
    const o = opts || {};
    const dur = o.dur || 0;
    const loop = o.loop || "none";
    const ev = events || [];
    let v = v0, i0 = 0;
    for (let i = 0; i < ev.length; i++) {
      if (ev[i].set && ev[i].t <= t) { v = ev[i].v; i0 = i + 1; }
    }
    for (let i = i0; i < ev.length; i++) {
      const e = ev[i];
      if (!e.set) v += e.d * this.__springStep(t - e.t, e.sp);
    }
    if (dur > 0 && loop !== "none") {
      let k = -1, firstSet = Infinity;
      for (let i = 0; i < ev.length; i++) {
        if (ev[i].set) { k = i; if (firstSet === Infinity) firstSet = ev[i].t; }
      }
      const tail = [];
      for (let i = k + 1; i < ev.length; i++) {
        const e = ev[i];
        if (!e.set && e.d !== 0 && e.t + this.__settle(e.sp) > dur) tail.push(e);
      }
      if (tail.length && t < firstSet) {
        for (let i = 0; i < tail.length; i++) {
          const e = tail[i];
          v += e.d * (this.__springStep(t + dur - e.t, e.sp) - 1);
        }
      }
    }
    return v;
  },

  /** Velocity of multiSpringAt, per second (for motion blur). */
  multiSpringVel(t, events, opts) {
    const o = opts || {};
    const dur = o.dur || 0;
    const loop = o.loop || "none";
    const ev = events || [];
    let v = 0, i0 = 0;
    for (let i = 0; i < ev.length; i++) if (ev[i].set && ev[i].t <= t) i0 = i + 1;
    for (let i = i0; i < ev.length; i++) {
      const e = ev[i];
      if (!e.set) v += e.d * this.__springStepVel(t - e.t, e.sp);
    }
    if (dur > 0 && loop !== "none") {
      let k = -1, firstSet = Infinity;
      for (let i = 0; i < ev.length; i++) {
        if (ev[i].set) { k = i; if (firstSet === Infinity) firstSet = ev[i].t; }
      }
      const tail = [];
      for (let i = k + 1; i < ev.length; i++) {
        const e = ev[i];
        if (!e.set && e.d !== 0 && e.t + this.__settle(e.sp) > dur) tail.push(e);
      }
      if (tail.length && t < firstSet) {
        for (let i = 0; i < tail.length; i++) {
          const e = tail[i];
          v += e.d * this.__springStepVel(t + dur - e.t, e.sp);
        }
      }
    }
    return v;
  },

  /**
   * Generator-style reactive signal tweening (motion-canvas spring pattern),
   * adapted to a PURE closed form: the value chases a target signal defined by
   * keyframes [{ t, value }], each step a damped spring rather than a stateful
   * integration. sp = [zeta, omega] (default [0.72, 28] LAND). opts: { dur, loop }.
   */
  signalTween(t, keyframes, opts) {
    const o = opts || {};
    const sp = o.sp || [0.72, 28];
    if (!keyframes || keyframes.length === 0) return 0;
    const v0 = keyframes[0].value;
    const events = [];
    let prev = v0;
    for (let i = 1; i < keyframes.length; i++) {
      const kf = keyframes[i];
      events.push({ t: kf.t, d: kf.value - prev, sp: kf.sp || sp });
      prev = kf.value;
    }
    return this.multiSpringAt(t, v0, events, o);
  },

  /** Deterministic mulberry32 PRNG factory (seed: number or string). Pure. */
  seededRandom(seed) {
    let a = 0;
    if (typeof seed === "string") {
      for (let i = 0; i < seed.length; i++) a = (a * 31 + seed.charCodeAt(i)) | 0;
    } else {
      a = seed | 0;
    }
    if (a === 0) a = 123456789;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  /** Three integers -> [0,1), well mixed (core.js hash). Pure Math.random replacement. */
  hash(a, b, c) {
    let h = Math.imul((a | 0) ^ 0x3c6ef372, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13) ^ ((b || 0) | 0), 0xc2b2ae35);
    h = Math.imul(h ^ (h >>> 16) ^ ((c || 0) | 0), 0x27d4eb2f);
    h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  },

  /** Whole-cycle phase: n cycles per 'dur' seconds, exact at the loop seam. */
  cyc(t, n, phase, dur) {
    const d = dur || 1;
    return Math.PI * 2 * (n * t / d + (phase || 0));
  },

  /** Sine wave running n whole cycles per loop (core.js wave). */
  wave(t, n, phase, dur) {
    return Math.sin(this.cyc(t, n, phase, dur));
  },

  /** Smooth seeded noise in [-1,1] that loops exactly (core.js loopNoise). */
  loopNoise(t, n, seed, dur) {
    const d = dur || 1;
    return (
      Math.sin(this.cyc(t, n, this.hash(seed, 1), d)) +
      0.5 * Math.sin(this.cyc(t, 2 * n + 1, this.hash(seed, 2), d)) +
      0.25 * Math.sin(this.cyc(t, 4 * n + 3, this.hash(seed, 3), d))
    ) / 1.75;
  },

  /** Standard camera waypoint presets [frame, scale, tx, ty, rotDeg] (motion-craft). */
  cameraSplinePreset(name) {
    const presets = {
      typingZoomFollow: [[0, 1, 0, 0, 0], [14, 0.982, 12, 6, 0], [18, 1.48, 220, 110, 0], [62, 1.48, -140, 110, 0], [84, 1, 0, 0, 0]],
      cursorClickFollow: [[0, 1, 0, 0, 0], [20, 0.982, 10, 8, 0], [24, 1.42, -180, -90, 0], [54, 1.42, -180, -90, 0], [76, 1, 0, 0, 0]],
      wideCanvasGlide: [[0, 1, 0, 0, 0], [28, 1.12, -420, 0, 0], [64, 1.12, -880, 0, 0], [96, 1, 0, 0, 0]]
    };
    return presets[name] || presets.wideCanvasGlide;
  },

  /**
   * Zoom-follow-typing camera spline with pre-move anticipation and safe-zone
   * clamping (motion-craft buildTypingCameraSpline). Returns [frame,scale,tx,ty,rot][].
   */
  buildTypingCameraSpline(opts) {
    const o = opts || {};
    const typeStart = o.typeStartFrame || 0;
    const typeEnd = o.typeEndFrame == null ? typeStart + 40 : o.typeEndFrame;
    const targetX = o.targetX || 0;
    const targetY = o.targetY || 0;
    const span = o.typingSpanWidth == null ? 280 : o.typingSpanWidth;
    const zoom = o.zoomScale == null ? 1.62 : o.zoomScale;
    const vw = o.viewportWidth == null ? 1920 : o.viewportWidth;
    const vh = o.viewportHeight == null ? 1080 : o.viewportHeight;
    const cx = vw / 2, cy = vh * 0.46;
    const maxPanX = vw * (zoom - 1) * 0.85;
    const maxPanY = vh * (zoom - 1) * 0.85;
    const startTx = this.__clamp(cx - targetX * zoom, -maxPanX, maxPanX * 0.25);
    const endTx = this.__clamp(cx - (targetX + span) * zoom, -maxPanX, maxPanX * 0.25);
    const focusTy = this.__clamp(cy - targetY * zoom, -maxPanY, maxPanY * 0.35);
    const preStart = Math.max(0, typeStart - 15);
    const antic = Math.max(0, typeStart - 11);
    const pts = [[0, 1, 0, 0, 0], [preStart, 1, 0, 0, 0]];
    if (o.anticipation !== false && typeStart >= 14) pts.push([antic, 0.982, 14, 8, 0]);
    pts.push(
      [typeStart, zoom, startTx, focusTy, 0],
      [Math.round((typeStart + typeEnd) / 2), zoom, (startTx + endTx) / 2, focusTy, 0],
      [typeEnd, zoom, endTx, focusTy, 0],
      [typeEnd + 8, zoom, endTx, focusTy, 0],
      [typeEnd + 24, 1, 0, 0, 0]
    );
    return pts;
  },

  /**
   * Follow-cursor camera spline (motion-craft buildCursorFollowCameraSpline).
   * cursorWaypoints: [frame, x, y][]. Returns [frame,scale,tx,ty,rot][].
   */
  buildCursorFollowCameraSpline(cursorWaypoints, opts) {
    const o = opts || {};
    const zoom = o.zoomScale == null ? 1.28 : o.zoomScale;
    const strength = o.followStrength == null ? 0.55 : o.followStrength;
    const vw = o.viewportWidth == null ? 1920 : o.viewportWidth;
    const vh = o.viewportHeight == null ? 1080 : o.viewportHeight;
    const cx = vw / 2, cy = vh * 0.46;
    const n = cursorWaypoints.length;
    return cursorWaypoints.map(function (w, idx) {
      const f = w[0], x = w[1], y = w[2];
      const edge = idx === 0 || idx === n - 1;
      const sc = edge ? 1 : zoom;
      const focusX = cx + (x - cx) * strength;
      const focusY = cy + (y - cy) * strength;
      const tx = edge ? 0 : cx - focusX * sc;
      const ty = edge ? 0 : cy - focusY * sc;
      return [f, sc, tx, ty, 0];
    });
  },

  /**
   * Loop seam time wrapper (motion-launch-videos core.js LOOP contract).
   * loop = "hold": clamp to [0, dur], so the tail holds frame 0's still copy.
   * loop = "cycle": wrap into [0, dur), so periodic motion is continuous at the
   * seam. loop = "none": identity. Pure function of t.
   */
  loopTime(t, dur, loop) {
    const d = Math.max(1e-9, dur || 0);
    if (loop === "hold") return Math.max(0, Math.min(d, t));
    if (loop === "cycle") return ((t % d) + d) % d;
    return t;
  },

  /**
   * Evaluate a seam-safe value: fn receives the wrapped local time. For a hold
   * loop the seam frame (t = dur) reads fn(0), which is exactly what loopcheck
   * compares against frame 0; for a cycle loop it reads fn(wrap(t)).
   */
  loopValue(frame, dur, loop, valueAtFrame) {
    const d = Math.max(1e-9, dur || 0);
    if (typeof valueAtFrame !== "function") return 0;
    if (loop === "hold") {
      if (frame >= d) return valueAtFrame(0);
      return valueAtFrame(Math.max(0, frame));
    }
    return valueAtFrame(this.loopTime(frame, d, loop));
  },

  /**
   * Seam diagnostics for a periodic value function. Returns the value delta
   * across the seam (0 = visually identical) and the velocity miss: a cycle
   * loop must also match slope, so a kink at the wrap is reported separately.
   */
  loopSeamError(dur, loop, valueAtFrame) {
    const d = Math.max(1e-6, dur || 0);
    const eps = 1e-4;
    const v0 = valueAtFrame(0);
    if (loop === "hold") {
      return { delta: Math.abs(valueAtFrame(d) - v0), slopeMiss: 0 };
    }
    if (loop !== "cycle") return { delta: 0, slopeMiss: 0 };
    const vEnd = valueAtFrame(d - eps);
    const vStart = valueAtFrame(eps);
    const slopeEnd = (v0 - vEnd) / eps;
    const slopeStart = (vStart - valueAtFrame(0)) / eps;
    return { delta: Math.abs(v0 - vEnd), slopeMiss: Math.abs(slopeStart - slopeEnd) };
  },
`;