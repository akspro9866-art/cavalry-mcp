/** Keyframe tuples, easing vocabulary, rig terms, ease and stagger. Verbatim chunk of the injected _mg DSL; mg_helpers.ts concatenates these in order. */
export const MG_EASING_SOURCE = String.raw`  kf(id, attr, framesAndValues, magicEase = "SpringOut") {
    const hasHandles = framesAndValues.some((entry) => Array.isArray(entry) && entry.length > 2 && entry[2] && typeof entry[2] === "object");
    if (!hasHandles) return _rb.kf(id, attr, framesAndValues, magicEase);
    const ease = magicEase == null ? null : this.__easeName(magicEase);
    const written = [];
    for (let i = 0; i < framesAndValues.length; i++) {
      const entry = framesAndValues[i];
      if (!Array.isArray(entry) || entry.length < 2) throw new Error("_mg.kf expects [frame, value] or [frame, value, handles] tuples");
      const frame = Math.round(Number(entry[0]));
      const handles = entry.length > 2 && entry[2] && typeof entry[2] === "object" ? entry[2] : null;
      this.__kfWrite(id, attr, frame, entry[1], handles);
      if (!handles && ease && i < framesAndValues.length - 1) {
        try { api.magicEasing(id, attr, frame, ease); } catch (e) {}
      }
      written.push(frame);
    }
    return written;
  },

  /**
   * Clip-space handles for the magic-easing curves this build accepts. "Custom"
   * is deliberately absent: api.magicEasing only accepts a Custom keyframe with a
   * separate expression argument, so _mg.ease never sends that name.
   */
  EASE_CURVES: {
    None: [0, 0, 1, 1],
    SlowIn: [0.42, 0, 1, 1],
    SlowOut: [0, 0, 0.58, 1],
    SlowInSlowOut: [0.42, 0, 0.58, 1],
    VerySlowIn: [0.76, 0, 1, 1],
    VerySlowOut: [0, 0, 0.24, 1],
    VerySlowInVerySlowOut: [0.76, 0, 0.24, 1],
    SpringIn: [0.64, 0, 0.78, 0.4],
    SpringOut: [0.22, 1.4, 0.36, 1],
    SpringInSpringOut: [0.5, 1.4, 0.5, 0.4],
    AnticipateIn: [0.36, 0, 0.66, -0.56],
    OvershootOut: [0.34, 1.56, 0.64, 1],
    AnticipateInOvershootOut: [0.5, -0.4, 0.5, 1.4],
    BounceOut: [0.34, 1.56, 0.64, 1]
  },

  /** Friendly names emitted by refclone that Cavalry spells differently. */
  EASE_ALIASES: {
    QuarticIn: "SlowIn", QuarticOut: "SlowOut", QuarticInOut: "SlowInSlowOut",
    CubicIn: "SlowIn", CubicOut: "SlowOut", CubicInOut: "SlowInSlowOut",
    ExpoIn: "VerySlowIn", ExpoOut: "VerySlowOut", ExpoInOut: "VerySlowInVerySlowOut",
    BackIn: "AnticipateIn", BackOut: "OvershootOut", BackInOut: "AnticipateInOvershootOut",
    Linear: "None"
  },

  /** Normalize a requested easing to a name this Cavalry build accepts. */
  __easeName(name) {
    if (!name) return "SlowInSlowOut";
    const alias = this.EASE_ALIASES[name];
    if (alias) return alias;
    if (this.EASE_CURVES[name]) return name;
    return _rb.ease(name);
  },

  /** Closest supported curve to cubic-bezier handles, by RMS over 11 samples. */
  __nearestEase(handles) {
    if (!handles || handles.length !== 4) return "SlowInSlowOut";
    const bx = [Number(handles[0]) || 0, Number(handles[2]) || 0];
    const by = [Number(handles[1]) || 0, Number(handles[3]) || 0];
    const sample = (p, t) => {
      let lo = 0, hi = 1, x = t;
      for (let i = 0; i < 12; i++) {
        x = (lo + hi) / 2;
        const value = 3 * (1 - x) * (1 - x) * x * p[0] + 3 * (1 - x) * x * x * p[1] + x * x * x;
        if (value < t) lo = x; else hi = x;
      }
      return 3 * (1 - x) * (1 - x) * x * p[2] + 3 * (1 - x) * x * x * p[3] + x * x * x;
    };
    const curve = [bx[0], by[0], bx[1], by[1]];
    let best = "SlowInSlowOut";
    let bestScore = Infinity;
    const names = Object.keys(this.EASE_CURVES);
    for (let i = 0; i < names.length; i++) {
      const preset = this.EASE_CURVES[names[i]];
      let score = 0;
      for (let s = 0; s <= 10; s++) {
        const delta = sample(preset, s / 10) - sample(curve, s / 10);
        score += delta * delta;
      }
      if (score < bestScore) { bestScore = score; best = names[i]; }
    }
    return best;
  },

  /**
   * Rig-vocabulary normalizer. A refinement loop (refclone's Stage 4) speaks in
   * spring terms — stiffness, damping, overshoot, holdFrames, staggerOffset —
   * while Cavalry 2.8 only exposes magic easings, keyframes and the oscillator /
   * stagger / falloff nodes. This maps one onto the other with the textbook
   * second-order model, in frames:
   *
   *   omega0 = sqrt(stiffness / mass)                 rad per frame
   *   zeta   = dampingRatio, or coefficient/(2·sqrt(k·m)), or derived from the
   *            requested overshoot through Os = e^(-zeta·pi / sqrt(1 - zeta^2))
   *   x(t)   = rest + amplitude · e^(-zeta·omega0·t) · cos(omega_d·t)
   *
   * cycles and decay are the same curve expressed across a window of
   * durationFrames, which is what modulate's sampler and api.magicEasing need.
   * Returns the descriptor only — it writes nothing, so it is safe to call from a
   * validator before any scene mutation.
   */
  rig(spec) {
    spec = spec || {};
    const num = function (value, fallback) { const n = Number(value); return isFinite(n) ? n : fallback; };
    const mass = Math.max(num(spec.mass, 1), 1e-6);
    const stiffness = Math.max(num(spec.stiffness, 100), 1e-6);
    const omega0 = Math.sqrt(stiffness / mass);
    let zeta = null;
    if (spec.dampingRatio != null) zeta = num(spec.dampingRatio, 0.5);
    else if (spec.damping != null) {
      const d = num(spec.damping, 0);
      // Values at or below 1 read as a damping ratio (the usual convention for
      // this knob); anything larger is a coefficient in force per frame.
      zeta = d <= 1 ? d : d / (2 * Math.sqrt(stiffness * mass));
    }
    let overshoot = spec.overshoot != null ? num(spec.overshoot, 0) : null;
    if (overshoot != null && overshoot > 0 && zeta == null) {
      const os = Math.min(Math.max(overshoot > 1 ? overshoot / 100 : overshoot, 1e-6), 0.999);
      const l = Math.log(os);
      zeta = -l / Math.sqrt(Math.PI * Math.PI + l * l);
    }
    if (zeta == null) zeta = 0.5;
    zeta = Math.max(0, Math.min(1.5, zeta));
    const omegaD = zeta < 1 ? omega0 * Math.sqrt(1 - zeta * zeta) : 0;
    const impliedOvershoot = zeta < 1 ? Math.exp((-zeta * Math.PI) / Math.sqrt(1 - zeta * zeta)) : 0;
    return {
      mass: mass,
      stiffness: stiffness,
      dampingRatio: Math.round(zeta * 10000) / 10000,
      dampingCoefficient: Math.round(2 * zeta * omega0 * mass * 10000) / 10000,
      angularFrequency: Math.round(omega0 * 10000) / 10000,
      dampedFrequency: Math.round(omegaD * 10000) / 10000,
      cyclesPerFrame: Math.round((omegaD / (2 * Math.PI)) * 10000) / 10000,
      overshoot: Math.round(impliedOvershoot * 1000) / 1000,
      underdamped: zeta < 1,
      holdFrames: Math.max(0, Math.round(num(spec.holdFrames, 0))),
      staggerOffset: Math.max(1, Math.round(num(spec.staggerOffset != null ? spec.staggerOffset : spec.stagger, 4))),
      /** Magic-easing name that best matches this descriptor, from the accepted set. */
      easing: zeta >= 1 ? "SlowOut" : (impliedOvershoot >= 0.2 ? "OvershootOut" : "SpringOut")
    };
  },

  /**
   * Two boundary keyframes plus a supported magic-easing curve.
   *
   * spec = { inFrame, outFrame, from, to, magicEasing?, easing?, bezier?,
   *          holdFrames?, stiffness?, damping?, overshoot? }
   *   easing: { kind: "preset", name } or { kind: "bezier", handles }
   * A cubic-bezier without a matching preset resolves to the nearest accepted
   * Cavalry curve; "Custom" is never sent to api.magicEasing. holdFrames delays
   * the move; a rig name without an explicit easing is chosen from the spring
   * descriptor. attr may be "position" or "scale" to drive both axes.
   */
  ease(id, attr, spec) {
    spec = spec || {};
    const inFrame = Math.round(Number(spec.inFrame));
    const outFrame = Math.round(Number(spec.outFrame));
    if (!isFinite(inFrame) || !isFinite(outFrame) || inFrame === outFrame) {
      throw new Error("_mg.ease requires distinct integer inFrame and outFrame values");
    }
    const from = Number(spec.from);
    const to = Number(spec.to);
    if (!isFinite(from) || !isFinite(to)) throw new Error("_mg.ease requires finite from and to values");
    // holdFrames keeps the layer still before the move starts, so a stagger or a
    // beat offset is expressed in the timing rather than in the curve.
    const hold = Math.max(0, Math.round(Number(spec.holdFrames != null ? spec.holdFrames
      : (spec.easing && spec.easing.holdFrames != null ? spec.easing.holdFrames : (spec.rig && spec.rig.holdFrames) || 0))));
    const start = inFrame + hold;
    if (start === outFrame) throw new Error("_mg.ease: holdFrames moved the start onto outFrame");
    const easing = spec.easing || null;
    let name = spec.magicEasing || (easing && easing.kind === "preset" ? easing.name : null);
    const handles = spec.bezier || (easing && easing.kind === "bezier" ? easing.handles : null);
    const rigSpec = spec.rig || (name == null && handles == null
      && (spec.stiffness != null || spec.damping != null || spec.overshoot != null) ? spec : null);
    const resolved = name ? this.__easeName(name) : (rigSpec ? this.rig(rigSpec).easing : this.__nearestEase(handles));
    const attrs = attr === "position" || attr === "scale" ? [attr + ".x", attr + ".y"] : [attr];
    for (let i = 0; i < attrs.length; i++) {
      _rb.kf(id, attrs[i], [[start, from], [outFrame, to]], resolved);
    }
    return { id: id, attrs: attrs, easing: resolved, inFrame: start, outFrame: outFrame, holdFrames: hold };
  },

  /**
   * Deterministic staggered timing for a set of layers (or a group id, expanded
   * to its children). Each follower gets its own eased boundary keyframes offset
   * by delayFrames; no deformer wiring is guessed for arbitrary layer types.
   *
   * spec = { attr, from, to, inFrame, outFrame, delayFrames, easing?, magicEasing?, bezier? }
   */
  stagger(ids, spec) {
    spec = spec || {};
    let list = Array.isArray(ids) ? ids.slice() : [ids];
    if (list.length === 1) {
      let children = [];
      try { children = api.getChildren(list[0]) || []; } catch (e) { children = []; }
      if (children.length) list = children.slice();
    }
    if (list.length < 2) throw new Error("_mg.stagger needs at least two member layers");
    if (!spec.attr) throw new Error("_mg.stagger requires an attr (for example position.y)");
    const requested = spec.delayFrames != null ? spec.delayFrames : spec.staggerOffset;
    const delay = Math.round(Number(requested == null ? 4 : requested));
    if (!(delay >= 1)) throw new Error("_mg.stagger delayFrames must be at least 1");
    const inFrame = Math.round(Number(spec.inFrame));
    const outFrame = Math.round(Number(spec.outFrame));
    const applied = [];
    for (let i = 0; i < list.length; i++) {
      const offset = i * delay;
      this.ease(list[i], spec.attr, {
        inFrame: inFrame + offset, outFrame: outFrame + offset,
        from: spec.from, to: spec.to,
        magicEasing: spec.magicEasing, easing: spec.easing, bezier: spec.bezier
      });
      applied.push({ id: list[i], inFrame: inFrame + offset, outFrame: outFrame + offset });
    }
    return { ids: list, attr: spec.attr, delayFrames: delay, staggerOffset: delay, applied: applied };
  },

  /**
   * In-place delta / absolute adjustment for existing layers. Never creates,
   * duplicates or recreates layers, so the composition and playhead are kept.
   *
   * spec = {
   *   alias?: "@hero_card", target?: "<layerId>" | "<semanticId>" | "@alias",
   *   ids?: string[], semantic?: "<semanticId>" | "<slug>", semantics?: string[],
   *   attrs?: { "position.x": 120 }, delta?: { "position.x": 4 },
   *   multiply?: { "scale.x": 1.08 },
   *   frame?: 42, shiftKeyframes?, easing?, force?, diff?
   * }
   * delta is additive and multiply is multiplicative (read the current value,
   * apply delta, then multiply), so a convergence pass can correct a scale ratio
   * without first reading it into the script. Both are evaluated per target.
   * An alias resolves through the globalThis registry written by _mg.alias (and
   * the alias attribute accepted by shape/layer), so a later refinement pass can
   * address the exact layer a build created by stable handle instead of a live
   * id. Run the call inside the atomic wrapper (or _mg.undoGroup) and every
   * target lands in one Undo step; patch itself never creates a layer.
   * With frame, values are written through api.keyframe at that frame so an
   * animated attribute is corrected where the render failed, not at the playhead.
   * Static writes are compared against the evaluated attribute first: a layer that
   * already holds the requested value is reported under skipped and not written,
   * so re-applying the same spec is a no-op instead of a second pass of identical
   * keyframes. A frame-targeted write always lands, because Cavalry 2.8 has no
   * value-at-frame getter to compare against. diff:false or force:true writes
   * regardless; every target is reported so the caller can see what it addressed.
   */
`;
