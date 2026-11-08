import { RB_HELPERS_SOURCE } from "../presets/rig_builders.js";

/** JavaScript injected into Cavalry; this module is never executed by Node. */
const MG_BASE_SOURCE = String.raw`
const _mg = {
  comp(w = 1920, h = 1080, fps = 60, endFrame = 180, bgColor = "#0B0C10") {
    const id = api.getActiveComp();
    api.set(id, { "resolution.x": w, "resolution.y": h, fps, backgroundColor: bgColor });
    // Cavalry 2.8: api.setOutFrame() resolves but does not update the comp;
    // the startFrame/endFrame attributes are the working route.
    api.set(id, { startFrame: 0, endFrame });
    try { api.setInFrame(id, 0); } catch (e) {}
    return id;
  },
  set(id, attrs) {
    return _rb.set(id, attrs);
  },
  shape(type, name, attrs = {}) {
    const spec = this.__splitAlias(attrs);
    const id = api.primitive(type, name);
    if (Object.keys(spec.attrs).length) _rb.set(id, spec.attrs);
    if (spec.alias != null) this.alias(id, spec.alias);
    return id;
  },
  layer(type, name, attrs = {}) {
    const spec = this.__splitAlias(attrs);
    const id = api.create(type, name);
    if (Object.keys(spec.attrs).length) _rb.set(id, spec.attrs);
    if (spec.alias != null) this.alias(id, spec.alias);
    return id;
  },
  /**
   * Register a stable, human-readable handle for a layer ("@hero_card"). The
   * registry lives on globalThis because Cavalry 2.8 has no cross-execution
   * store: a build script can alias the roots it created and a later refinement
   * script patches those exact layers without carrying opaque ids. Aliases are
   * slugged with the same rule as semantic ids, so "@Hero Card" and
   * "@hero_card" are the same handle.
   */
  alias(id, name) {
    const key = this.__aliasKey(name);
    if (!key) throw new Error("_mg.alias requires a non-empty name");
    const layerId = String(id);
    if (!layerId) throw new Error("_mg.alias requires a layer id");
    this.__aliasMap()[key] = layerId;
    return "@" + key;
  },
  /** Every registered alias as { "@handle": "layerId" }, for diagnostics. */
  aliases() {
    const map = this.__aliasMap();
    const out = {};
    const keys = Object.keys(map);
    for (let i = 0; i < keys.length; i++) out["@" + keys[i]] = map[keys[i]];
    return out;
  },
  __aliasKey(name) {
    const text = String(name == null ? "" : name).trim().replace(/^@+/, "");
    return text ? this.__slug(text) : "";
  },
  __aliasMap() {
    try {
      if (!globalThis.__mgAliases || typeof globalThis.__mgAliases !== "object") globalThis.__mgAliases = {};
      return globalThis.__mgAliases;
    } catch (e) {
      return {};
    }
  },
  /** Keep "alias" out of api.set: it is runtime metadata, not a Cavalry attr. */
  __splitAlias(attrs) {
    const source = attrs && typeof attrs === "object" ? attrs : {};
    const out = {};
    let alias = null;
    const keys = Object.keys(source);
    for (let i = 0; i < keys.length; i++) {
      if (keys[i] === "alias") alias = source[keys[i]];
      else out[keys[i]] = source[keys[i]];
    }
    return { attrs: out, alias: alias };
  },
  text(str, size = 80, color = "#FFFFFF", extraAttrs = {}) {
    const theme = this.theme();
    const typography = theme && theme.typography ? theme.typography : null;
    let fontSize = Number(size) || 80;
    if (typography && Number(typography.scale) > 0) fontSize = fontSize * Number(typography.scale);
    const attrs = Object.assign({
      text: str,
      fontSize: fontSize,
      horizontalAlignment: 1,
      verticalAlignment: 1,
      "material.materialColor": color
    }, extraAttrs);
    if (typography && typography.font && attrs.font == null) {
      attrs.font = { font: typography.font, style: typography.style || "Regular" };
    }
    return _mg.layer("textShape", String(str).slice(0, 40) || "Text", attrs);
  },
  /**
   * Evaluated inputs of one attribute as "sourceId.sourceAttr" strings.
   * Cavalry 2.8 returns a single string from api.getInConnection and uses "" for
   * "nothing drives this"; some builds answer with a list. Normalising both here
   * keeps every idempotency check on one read path.
   */
  __inConnections(dstId, dstAttr) {
    let raw = null;
    try { raw = api.getInConnection(dstId, dstAttr); } catch (e) { return []; }
    if (raw == null || raw === "") return [];
    const list = Array.isArray(raw) ? raw : [raw];
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const value = list[i];
      if (value == null || value === "") continue;
      out.push(String(typeof value === "object" ? (value.id != null ? value.id + "." + (value.attr != null ? value.attr : "") : value.srcId || "") : value));
    }
    return out;
  },

  /** Layer type of an id, or "" when this build cannot answer. */
  __layerType(id) {
    if (id == null || id === "") return "";
    try { return String(api.getLayerType(id) || ""); } catch (e) { return ""; }
  },

  /** First modifier node of nodeType already driving attr on target, or null. */
  __findModifier(target, attr, nodeType) {
    const inputs = this.__inConnections(target, attr);
    for (let i = 0; i < inputs.length; i++) {
      const id = String(inputs[i]).split(".")[0];
      if (this.__layerType(id) === nodeType) return id;
    }
    return null;
  },

  /**
   * Idempotent connect. api.connect appends an input every time it is called, so
   * re-running a rig doubled its deformer, stagger or filter stack. The wire is
   * read back first: an attribute already driven by "srcId.srcAttr" is left
   * alone and reported as skipped.
   *
   *   wire(srcId, srcAttr, dstId, dstAttr)            // original positional form
   *   wire({ from, fromAttr, to, toAttr, force?, exclusive? })
   *
   * force re-wires over an existing input (passed as api.connect's fifth
   * argument, the same convention cavalry_batch uses). exclusive is opt-in and
   * refuses to add a second source where one already drives the attribute — the
   * default stays permissive because "deformers" and "filters" legitimately
   * carry several inputs.
   */
  wire(srcId, srcAttr, dstId, dstAttr, opts) {
    let from = srcId, fromAttr = srcAttr, to = dstId, toAttr = dstAttr;
    if (srcId && typeof srcId === "object") {
      const spec = srcId;
      from = spec.from != null ? spec.from : spec.srcId;
      fromAttr = spec.fromAttr != null ? spec.fromAttr : spec.srcAttr;
      to = spec.to != null ? spec.to : spec.dstId;
      toAttr = spec.toAttr != null ? spec.toAttr : spec.dstAttr;
      opts = spec;
    }
    opts = opts || {};
    const source = String(from) + "." + String(fromAttr);
    const sink = String(to) + "." + String(toAttr);
    const existing = this.__inConnections(to, toAttr);
    if (existing.indexOf(source) >= 0) {
      return { wired: false, skipped: "already-wired", source: source, target: sink, existing: existing };
    }
    if (opts.exclusive && existing.length && !opts.force) {
      throw new Error("_mg.wire: " + sink + " is already driven by " + existing[0] + "; pass force to replace it");
    }
    const result = opts.force ? api.connect(from, fromAttr, to, toAttr, true) : api.connect(from, fromAttr, to, toAttr);
    return { wired: true, source: source, target: sink, replaced: existing.slice(), result: result };
  },
  deform(targetId, deformerType, name, attrs = {}) {
    const id = _mg.layer(deformerType, name, attrs);
    _mg.wire(id, "id", targetId, "deformers");
    return id;
  },
  subMesh(textId, level = 1, staggerOffset = 8) {
    const subMeshId = _mg.layer("subMesh", "Text Segments", {
      levelMode: level,
      shapeTimeOffset: staggerOffset
    });
    const staggerId = _mg.layer("stagger", "Segment Stagger", { offset: staggerOffset });
    _mg.wire(staggerId, "id", subMeshId, "shapeTimeOffset");
    _mg.wire(subMeshId, "id", textId, "deformers");
    return { subMeshId, staggerId };
  },
  /**
   * Duplicator rig. Legacy positional form (shapeId, distType, count, size,
   * attrs) is unchanged. The object form emitted by refclone accepts
   * { base, count, distribution, size, attrs, stagger, falloff } where
   * distribution is "linear" | "grid" | "circle" | "point", stagger is
   * { type, lagFrames, offset } and falloff is { type, influence } — a
   * stagger node and a falloff node are created and wired when requested.
   */
  duplicator(shapeId, distType = "grid", count = [5, 5], size = [1200, 700], attrs = {}) {
    if (shapeId && typeof shapeId === "object") {
      const spec = shapeId;
      const base = spec.base != null ? spec.base : spec.shapeId;
      if (base == null) throw new Error("_mg.duplicator object form requires base");
      const dist = String(spec.distribution || "linear");
      const linear = dist.indexOf("linear") === 0 || dist === "circle" || dist === "point";
      const countArg = Array.isArray(spec.count) ? spec.count : (Number(spec.count) || 2);
      const dupId = _rb.dup(base, {
        distribution: linear ? "linear" : "grid",
        count: countArg,
        size: spec.size || [1200, 700],
        attrs: spec.attrs || {}
      });
      if (dist === "circle" || dist === "point") {
        try { this.set(dupId, { distribution: dist }); } catch (e) { console.warn("_mg.duplicator: distribution '" + dist + "' rejected: " + e); }
      }
      if (spec.falloff) {
        const cfg = typeof spec.falloff === "number" ? { influence: spec.falloff } : spec.falloff;
        const falloffId = this.layer("falloff", "Duplicator Falloff", { influence: Number(cfg.influence != null ? cfg.influence : 1) });
        try { api.connect(falloffId, "id", dupId, "deformers"); } catch (e) { console.warn("_mg.duplicator: falloff connect failed: " + e); }
      }
      if (spec.stagger) {
        const cfg = typeof spec.stagger === "number" ? { offset: spec.stagger } : spec.stagger;
        const staggerId = this.layer("stagger", "Duplicator Stagger", { offset: Math.round(Number(cfg.lagFrames != null ? cfg.lagFrames : (cfg.offset != null ? cfg.offset : 4))) });
        try { api.connect(staggerId, "id", dupId, "shapeTimeOffset"); } catch (e) { console.warn("_mg.duplicator: stagger connect failed: " + e); }
      }
      return dupId;
    }
    const linear = String(distType).indexOf("linear") === 0;
    const dupId = _rb.dup(shapeId, {
      distribution: linear ? "linear" : "grid",
      count,
      size,
      attrs: attrs || {}
    });
    return dupId;
  },
  /**
   * Keyframe writer. framesAndValues accepts plain [frame, value] pairs
   * (delegated to _rb.kf with the named magic easing, unchanged behaviour) or
   * weighted cubic Bézier tuples [frame, value, { inWeight, inAngle,
   * outWeight, outAngle, interpolation? }] where the explicit handles are
   * written through api.modifyKeyframeTangent inside the same undo group.
   * Angles are Cavalry tangent angles (0 = flat); weights are in frames.
   */
  kf(id, attr, framesAndValues, magicEase = "SpringOut") {
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
  patch(spec) {
    const list = Array.isArray(spec) ? spec : [spec];
    const results = [];
    let index = null;
    const scene = () => { if (!index) index = this.__semanticIndex(); return index; };
    for (let i = 0; i < list.length; i++) {
      const entry = list[i] || {};
      const queries = [].concat(entry.semantics || [], entry.semantic != null ? [entry.semantic] : []);
      const resolved = [];
      for (let q = 0; q < queries.length; q++) {
        const hits = this.find(queries[q], scene());
        if (!hits.length) throw new Error("_mg.patch: no layer in the active comp matches " + queries[q]);
        for (let h = 0; h < hits.length; h++) if (resolved.indexOf(hits[h]) < 0) resolved.push(hits[h]);
      }
      let targets;
      if (entry.alias != null) {
        const handle = "@" + this.__aliasKey(entry.alias);
        const hits = this.find(handle, scene());
        if (!hits.length) throw new Error("_mg.patch: no layer matches alias " + handle);
        targets = hits;
      } else if (Array.isArray(entry.ids) && entry.ids.length) targets = entry.ids.slice();
      else if (entry.target != null) {
        const literal = String(entry.target);
        // "type#n" is a layer id, so it never needs a comp walk (the same
        // convention __patchTargets uses for explicit references).
        if (literal.indexOf("#") >= 0) targets = [literal];
        else {
          const hits = this.find(literal, scene());
          targets = hits.length ? hits : [literal];
        }
      } else targets = this.__patchTargets(entry);
      if (resolved.length) {
        const merged = targets.slice();
        for (let r = 0; r < resolved.length; r++) if (merged.indexOf(resolved[r]) < 0) merged.push(resolved[r]);
        targets = merged;
      }
      const frame = entry.frame == null ? null : Math.round(Number(entry.frame));
      const changes = [];
      const skipped = [];
      const compare = entry.force !== true && entry.diff !== false && frame == null;
      for (let t = 0; t < targets.length; t++) {
        const id = targets[t];
        const semanticId = index ? this.semantic(id, index) : null;
        const attrs = {};
        if (entry.attrs) {
          const keys = Object.keys(entry.attrs);
          for (let k = 0; k < keys.length; k++) attrs[keys[k]] = entry.attrs[keys[k]];
        }
        if (entry.delta) {
          const keys = Object.keys(entry.delta);
          for (let k = 0; k < keys.length; k++) {
            const current = Number(api.get(id, keys[k]));
            attrs[keys[k]] = (isFinite(current) ? current : 0) + Number(entry.delta[keys[k]] || 0);
          }
        }
        if (entry.multiply) {
          const keys = Object.keys(entry.multiply);
          for (let k = 0; k < keys.length; k++) {
            const factor = Number(entry.multiply[keys[k]]);
            if (!isFinite(factor)) throw new Error("_mg.patch: multiply requires a finite factor for " + keys[k]);
            const current = Number(api.get(id, keys[k]));
            const base = isFinite(current) ? current : 0;
            attrs[keys[k]] = (attrs[keys[k]] != null ? Number(attrs[keys[k]]) : base) * factor;
          }
        }
        const written = {};
        const keys = Object.keys(attrs);
        for (let k = 0; k < keys.length; k++) {
          const key = keys[k];
          if (compare && this.__sameValue(this.__readAttr(id, key), attrs[key])) {
            skipped.push({ id: id, semantic: semanticId, attr: key, value: attrs[key], reason: "unchanged" });
            continue;
          }
          written[key] = attrs[key];
        }
        if (Object.keys(written).length) {
          if (frame != null && isFinite(frame)) this.patchKeyframeSafe(id, written, frame);
          else this.set(id, written);
          changes.push({ id: id, semantic: semanticId, attrs: written, frame: frame });
        }
        if (entry.shiftKeyframes != null || entry.easing != null) {
          this.patchSelected({ ids: [id], shiftKeyframes: entry.shiftKeyframes, easing: entry.easing });
        }
      }
      const outcome = { patched: changes.length, changes: changes, skipped: skipped, targets: targets.slice() };
      if (queries.length) outcome.semantics = queries.slice();
      results.push(outcome);
    }
    return results.length === 1 ? results[0] : results;
  },

  /**
   * Build an editable vector layer from a VTracer SVG file (verified asset route)
   * or an inline path d (cavalry.Path + api.createEditable). Parent, position
   * and scale are applied to the created layer; the composition is untouched.
   *
   * spec = { path?, d?, name?, pos?: {x,y}, scale?,
   *          viewBox?, center?, scaleTo?, flipY?, report? }
   *
   * The inline route normalises the geometry through __svgParse before it reaches
   * Cavalry; the asset route hands the file to api.loadAsset, so the viewBox of an
   * imported SVG is whatever the asset's own reader does with it — scale and
   * position are still applied to the layer. report:true returns
   * { id, subpaths, commands, unsupported, bounds, ... } next to the layer id for
   * callers that need to check the artwork landed where they expected.
   */
  svg(parent, spec) {
    spec = spec || {};
    let id = null;
    let meta = null;
    if (spec.path) {
      const asset = api.loadAsset(String(spec.path), false);
      id = api.addAssetToComp(asset);
      meta = { route: "asset", normalized: false };
    } else if (spec.d != null) {
      if (typeof api.createEditable !== "function") {
        throw new Error("_mg.svg: this Cavalry build has no api.createEditable; pass spec.path so the verified SVG asset route can run");
      }
      const parsed = this.__svgParse(spec.d, spec);
      meta = parsed.meta;
      meta.route = "path";
      id = api.createEditable(parsed.path, spec.name || "Vector");
    } else {
      throw new Error("_mg.svg requires spec.path or spec.d");
    }
    if (spec.name) {
      try { api.rename(id, String(spec.name)); } catch (e) {}
    }
    if (parent != null && parent !== id) {
      try {
        if (String(parent) !== String(api.getActiveComp())) api.parent(id, parent);
      } catch (e) {}
    }
    if (spec.pos) this.set(id, { position: { x: Number(spec.pos.x) || 0, y: Number(spec.pos.y) || 0 } });
    if (spec.scale != null) this.set(id, { scale: Number(spec.scale) || 1 });
    if (spec.report) {
      const outcome = { id: id };
      const keys = Object.keys(meta);
      for (let k = 0; k < keys.length; k++) outcome[keys[k]] = meta[keys[k]];
      return outcome;
    }
    return id;
  },

  /** "minX minY w h" | {x,y,width,height} | [x,y,w,h] -> box or null. */
  __viewBox(value) {
    if (value == null || value === "") return null;
    if (typeof value === "string") {
      const parts = value.match(/-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) || [];
      if (parts.length < 4) return null;
      return { x: Number(parts[0]), y: Number(parts[1]), width: Number(parts[2]), height: Number(parts[3]) };
    }
    if (Array.isArray(value) && value.length >= 4) {
      return { x: Number(value[0]), y: Number(value[1]), width: Number(value[2]), height: Number(value[3]) };
    }
    if (typeof value === "object") {
      const box = {
        x: Number(value.x != null ? value.x : value.minX),
        y: Number(value.y != null ? value.y : value.minY),
        width: Number(value.width != null ? value.width : value.w),
        height: Number(value.height != null ? value.height : value.h)
      };
      if (!(isFinite(box.x) && isFinite(box.y) && isFinite(box.width) && isFinite(box.height))) return null;
      return box;
    }
    return null;
  },

  /**
   * Parse the SVG path subset VTracer and friends emit into a cavalry.Path, with
   * the normalisation vector art needs before it sits on a layer.
   *
   * opts = { viewBox?, center?, scaleTo?, flipY? }
   *
   *   viewBox  Cavalry anchors an editable at its own coordinate origin, so art
   *            from an SVG whose viewBox does not start at 0,0 would otherwise sit
   *            offset by that amount; the min corner is re-mapped to (0,0).
   *   center   anchors the control bounds on the layer origin instead, which is
   *            what a pivot-driven pop or rotation wants; it replaces the viewBox
   *            shift.
   *   scaleTo  fits the longest axis of the bounds to this many units.
   *   flipY    mirrors y, for SVG art (y grows down) landing in a comp whose y
   *            grows up. Opt-in, because which way is upright is the comp's call.
   *
   * Sub-paths are counted so compound shapes — counters, holes, multi-contour
   * logos — are visible to the caller, and commands this parser cannot express
   * (arcs, anything exotic) are reported under unsupported with their
   * parameters skipped whole, instead of leaking numbers into the next command as
   * stray line segments the way a silent drop used to.
   */
  __svgParse(d, opts) {
    opts = opts || {};
    if (typeof cavalry === "undefined" || typeof cavalry.Path !== "function") {
      throw new Error("_mg.svg: new cavalry.Path() is unavailable in this build; pass a .svg asset path instead");
    }
    const path = new cavalry.Path();
    if (typeof path.moveTo !== "function" || typeof path.lineTo !== "function") {
      throw new Error("_mg.svg: cavalry.Path has no moveTo/lineTo in this build; pass a .svg asset path instead");
    }
    const tokens = String(d).match(/[a-zA-Z]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) || [];
    let i = 0;
    let cmd = "M";
    let x = 0, y = 0, startX = 0, startY = 0;
    let lastCx = null, lastCy = null;
    let subpaths = 0;
    let skip = false;
    const ops = [];
    const unsupported = [];
    const limits = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    const num = () => { const value = Number(tokens[i]); i += 1; return isFinite(value) ? value : 0; };
    const see = (px, py) => {
      if (px < limits.minX) limits.minX = px;
      if (px > limits.maxX) limits.maxX = px;
      if (py < limits.minY) limits.minY = py;
      if (py > limits.maxY) limits.maxY = py;
    };
    // Pass 1: resolve every command to absolute pen coordinates, so relative
    // runs, implicit repeats and reflected handles are all in one place before
    // any transform is applied.
    while (i < tokens.length) {
      if (/^[a-zA-Z]$/.test(tokens[i])) {
        cmd = tokens[i];
        i++;
        skip = false;
        if (cmd === "Z" || cmd === "z") {
          ops.push({ c: "Z" });
          x = startX; y = startY;
          lastCx = null; lastCy = null;
          continue;
        }
        const probe = cmd.toUpperCase();
        if (probe !== "M" && probe !== "L" && probe !== "H" && probe !== "V"
          && probe !== "C" && probe !== "S" && probe !== "Q" && probe !== "T") {
          // Includes A/a (elliptical arcs) and anything else this build cannot
          // express: the command is reported and its numeric parameters skipped.
          unsupported.push(cmd);
          skip = true;
          continue;
        }
      }
      if (skip) { i++; continue; }
      const upper = cmd.toUpperCase();
      const rel = cmd !== upper;
      if (upper === "M" || upper === "L") {
        const nx = num(), ny = num();
        x = rel ? x + nx : nx;
        y = rel ? y + ny : ny;
        see(x, y);
        if (upper === "M") {
          subpaths += 1;
          startX = x; startY = y;
          ops.push({ c: "M", x: x, y: y });
          cmd = rel ? "l" : "L";
        } else ops.push({ c: "L", x: x, y: y });
        lastCx = null; lastCy = null;
      } else if (upper === "H") {
        const nx = num();
        x = rel ? x + nx : nx;
        see(x, y);
        ops.push({ c: "L", x: x, y: y });
        lastCx = null; lastCy = null;
      } else if (upper === "V") {
        const ny = num();
        y = rel ? y + ny : ny;
        see(x, y);
        ops.push({ c: "L", x: x, y: y });
        lastCx = null; lastCy = null;
      } else if (upper === "C" || upper === "S") {
        let x1, y1;
        if (upper === "S") {
          // Smooth cubic: the first handle mirrors the previous curve's second.
          x1 = lastCx == null ? x : 2 * x - lastCx;
          y1 = lastCy == null ? y : 2 * y - lastCy;
        } else {
          x1 = rel ? x + num() : num();
          y1 = rel ? y + num() : num();
        }
        const x2 = rel ? x + num() : num();
        const y2 = rel ? y + num() : num();
        const nx = rel ? x + num() : num();
        const ny = rel ? y + num() : num();
        ops.push({ c: "C", x1: x1, y1: y1, x2: x2, y2: y2, x: nx, y: ny });
        see(x1, y1); see(x2, y2); see(nx, ny);
        lastCx = x2; lastCy = y2;
        x = nx; y = ny;
      } else if (upper === "Q" || upper === "T") {
        let qx, qy;
        if (upper === "T") {
          qx = lastCx == null ? x : 2 * x - lastCx;
          qy = lastCy == null ? y : 2 * y - lastCy;
        } else {
          qx = rel ? x + num() : num();
          qy = rel ? y + num() : num();
        }
        const nx = rel ? x + num() : num();
        const ny = rel ? y + num() : num();
        ops.push({ c: "Q", qx: qx, qy: qy, x: nx, y: ny });
        see(qx, qy); see(nx, ny);
        lastCx = qx; lastCy = qy;
        x = nx; y = ny;
      } else {
        i++;
      }
    }
    const hasBounds = isFinite(limits.minX) && isFinite(limits.maxX);
    const box = this.__viewBox(opts.viewBox);
    let ox = box && isFinite(box.x) ? box.x : 0;
    let oy = box && isFinite(box.y) ? box.y : 0;
    if (opts.center && hasBounds) {
      ox = (limits.minX + limits.maxX) / 2;
      oy = (limits.minY + limits.maxY) / 2;
    }
    let scale = 1;
    if (opts.scaleTo != null && hasBounds) {
      const span = Math.max(limits.maxX - limits.minX, limits.maxY - limits.minY);
      if (span > 0 && Number(opts.scaleTo) > 0) scale = Number(opts.scaleTo) / span;
    }
    const flip = opts.flipY === true;
    const map = (px, py) => [(px - ox) * scale, (flip ? oy - py : py - oy) * scale];
    // Pass 2: hand the normalised geometry to Cavalry.
    for (let k = 0; k < ops.length; k++) {
      const op = ops[k];
      if (op.c === "Z") {
        if (typeof path.closePath === "function") path.closePath();
        else if (typeof path.close === "function") path.close();
      } else if (op.c === "M") {
        const p = map(op.x, op.y);
        path.moveTo(p[0], p[1]);
      } else if (op.c === "L") {
        const p = map(op.x, op.y);
        path.lineTo(p[0], p[1]);
      } else if (op.c === "C") {
        if (typeof path.curveTo !== "function") throw new Error("_mg.svg: cavalry.Path has no curveTo in this build");
        const a = map(op.x1, op.y1);
        const b = map(op.x2, op.y2);
        const p = map(op.x, op.y);
        path.curveTo(a[0], a[1], b[0], b[1], p[0], p[1]);
      } else if (op.c === "Q") {
        const a = map(op.qx, op.qy);
        const p = map(op.x, op.y);
        if (typeof path.quadTo === "function") path.quadTo(a[0], a[1], p[0], p[1]);
        else if (typeof path.curveTo === "function") path.curveTo(a[0], a[1], p[0], p[1], p[0], p[1]);
        else throw new Error("_mg.svg: cavalry.Path has no quadratic/curve support in this build");
      }
    }
    const bounds = hasBounds
      ? {
        x: (limits.minX - ox) * scale,
        y: (flip ? oy - limits.maxY : limits.minY - oy) * scale,
        width: (limits.maxX - limits.minX) * scale,
        height: (limits.maxY - limits.minY) * scale
      }
      : null;
    return {
      path: path,
      meta: {
        subpaths: subpaths,
        commands: ops.length,
        unsupported: unsupported,
        viewBox: box,
        center: opts.center === true,
        flipY: flip,
        scale: Math.round(scale * 1e6) / 1e6,
        bounds: bounds
      }
    };
  },

  /** Path only — kept so existing callers and presets see the previous shape. */
  __svgPath(d, opts) {
    return this.__svgParse(d, opts).path;
  },

  /** The currently applied theme, or null. */
  theme() {
    return _rb.theme();
  },

  /**
   * Bind a palette / typography / radius theme to the scene and every preset.
   *
   * tokens = {
   *   colors: { primary, secondary, accent, text, muted, background, ... },
   *   typography: { font, style, scale },
   *   radius: { scale, sm, md, lg, pill },
   *   palette?: false, apply?: false, target?: "selection"|"preset"|"comp"|ids,
   *   ids?: string[], recolor?: false, registerOnly?: true
   * }
   *
   * Forward binding is automatic: _rb.c maps the catalogue's design colours
   * through the theme, so every preset compiled after this call picks it up.
   * Passing targets (or calling with a selection / tracked preset) also retints
   * existing layers in place, with no rebuild. applyTheme(null) clears the theme.
   */
  applyTheme(tokens) {
    if (tokens === null || tokens === undefined) {
      let prev = null;
      try { prev = globalThis.__mgTheme || null; delete globalThis.__mgTheme; } catch (e) {}
      return { cleared: true, previous: prev };
    }
    if (typeof tokens !== "object") throw new Error("applyTheme: tokens must be an object");

    const prev = this.theme() || {};
    const prevColors = prev.colors || {};
    const colors = {};
    const prevKeys = Object.keys(prevColors);
    for (let i = 0; i < prevKeys.length; i++) colors[prevKeys[i]] = prevColors[prevKeys[i]];
    const provided = tokens.colors || tokens.paletteColors || {};
    const providedKeys = Object.keys(provided);
    for (let i = 0; i < providedKeys.length; i++) {
      if (provided[providedKeys[i]] != null) colors[providedKeys[i]] = provided[providedKeys[i]];
    }

    const typography = Object.assign({}, prev.typography || {}, tokens.typography || {});
    const radius = Object.assign({}, prev.radius || {}, tokens.radius || {});
    const prevTypeScale = prev.typography && Number(prev.typography.scale) > 0 ? Number(prev.typography.scale) : 1;
    const prevRadiusScale = prev.radius && Number(prev.radius.scale) > 0 ? Number(prev.radius.scale) : 1;
    const theme = {
      colors: colors,
      typography: typography,
      radius: radius,
      at: Date.now(),
      palette: prev.palette || null
    };

    // Register the palette so artists can pick the same swatches by hand.
    if (tokens.palette !== false && tokens.register !== false) {
      let paletteId = null;
      try { paletteId = api.getScenePalette(); } catch (e) {}
      if (paletteId) {
        const swatches = {};
        const roleKeys = Object.keys(colors);
        for (let i = 0; i < roleKeys.length; i++) {
          const role = roleKeys[i];
          const reuse = prev.palette && prev.palette.id === paletteId &&
            prev.palette.swatches && prev.palette.swatches[role] != null &&
            prevColors[role] === colors[role];
          if (reuse) {
            swatches[role] = prev.palette.swatches[role];
            continue;
          }
          try {
            swatches[role] = api.addSceneSwatch(_rb.rawColor(colors[role]), "theme/" + role);
          } catch (e) {}
        }
        theme.palette = { id: paletteId, swatches: swatches };
      }
    }
    try { globalThis.__mgTheme = theme; } catch (e) {}

    let targets = [];
    if (Array.isArray(tokens.ids) && tokens.ids.length) {
      targets = tokens.ids.slice();
    } else if (tokens.target === "comp") {
      try { targets = api.getCompLayers(true) || []; } catch (e) { targets = []; }
    } else if (typeof tokens.target === "string" && tokens.target.indexOf("#") >= 0) {
      targets = [tokens.target];
    } else {
      try { targets = this.__patchTargets({ target: tokens.target || "auto" }); } catch (e) { targets = []; }
    }

    const all = [];
    const seen = {};
    const walk = (id, depth) => {
      if (!id || seen[id] || depth > 8) return;
      seen[id] = true;
      all.push(id);
      let kids = null;
      try { kids = api.getChildren(id); } catch (e) { kids = null; }
      if (kids && kids.length) {
        for (let i = 0; i < kids.length; i++) walk(kids[i], depth + 1);
      }
    };
    for (let i = 0; i < targets.length; i++) walk(targets[i], 0);

    const shouldApply = tokens.apply !== false && tokens.registerOnly !== true;
    let recolored = 0;
    let fonts = 0;
    let radii = 0;

    if (shouldApply) {
      const recolor = tokens.recolor !== false;
      const nextTypeScale = Number(typography.scale) > 0 ? Number(typography.scale) : 1;
      const fontRatio = prevTypeScale > 0 ? nextTypeScale / prevTypeScale : 1;
      const nextRadiusScale = Number(radius.scale) > 0 ? Number(radius.scale) : 1;
      const radiusRatio = prevRadiusScale > 0 ? nextRadiusScale / prevRadiusScale : 1;

      for (let i = 0; i < all.length; i++) {
        const id = all[i];
        let type = "";
        try { type = api.getLayerType(id) || ""; } catch (e) {}

        if (recolor) {
          let colorAttr = null;
          if (type === "basicShape" || type === "textShape") colorAttr = "material.materialColor";
          else if (type === "strokeMaterial") colorAttr = "strokeColor";
          else if (type === "glowFilter") colorAttr = "glowColor";
          if (colorAttr) {
            let current = null;
            try { current = api.get(id, colorAttr); } catch (e) { current = null; }
            if (current != null) {
              const mapped = _rb.themeColor(current);
              if (_rb.hex(mapped) !== _rb.hex(current)) {
                try {
                  _rb.set(id, _rb.one(colorAttr, mapped));
                  recolored += 1;
                } catch (e) {}
              }
            }
          }
        }

        if (type === "textShape") {
          if (typography.font) {
            try {
              _rb.set(id, { font: { font: typography.font, style: typography.style || "Regular" } });
              fonts += 1;
            } catch (e) {}
          }
          if (fontRatio !== 1) {
            try {
              const size = Number(api.get(id, "fontSize")) || 0;
              if (size) {
                _rb.set(id, { fontSize: size * fontRatio });
                fonts += 1;
              }
            } catch (e) {}
          }
        }

        if (type === "basicShape" && radiusRatio !== 1) {
          try {
            const r = Number(api.get(id, "generator.cornerRadius")) || 0;
            if (r) {
              _rb.set(id, { "generator.cornerRadius": r * radiusRatio });
              radii += 1;
            }
          } catch (e) {}
        }
      }
    }

    return {
      theme: { colors: colors, typography: typography, radius: radius },
      palette: theme.palette,
      targets: targets,
      recolored: recolored,
      fonts: fonts,
      radii: radii,
      applied: shouldApply
    };
  },

  /**
   * Attach a behaviour to an attribute without rebuilding the layer.
   *
   *   _mg.modulate(layerId, "position.y", "organicFloat")
   *   _mg.modulate(layerId, ["rotation", "opacity"], { type: "organicFloat", amplitude: 12 })
   *   _mg.modulate(layerId, "scale.x", { type: "spring", amplitude: 0.2, duration: 40 })
   *   _mg.modulate(duplicatorId, "shapeTimeOffset", { type: "staggerFalloff", offset: 3 })
   *
   * organicFloat creates a noise node (or oscillator when type is oscillator);
   * spring has no native node in Cavalry 2.8, so it bakes a damped cosine into
   * keyframes; staggerFalloff wires a falloff into a stagger on the target.
   *
   * Every branch is idempotent: a node of the requested type already driving that
   * attribute is retuned in place and reported under reused, and the wire is
   * skipped when it is already connected. Pass force to build a second node.
   * stiffness / dampingRatio / overshoot / holdFrames are taken through _mg.rig.
   */
  modulate(layerId, attrPath, config) {
    config = config == null ? {} : config;
    if (typeof config === "string") config = { type: config };
    if (typeof config !== "object") throw new Error("modulate: config must be an object or a preset name");
    const type = config.type || config.behavior || config.preset || "organicFloat";
    const num = (value, fallback) => {
      const n = Number(value);
      return isFinite(n) ? n : fallback;
    };

    let target = layerId;
    if (target && typeof target === "object") target = target.id || target.layerId;
    if (target == null || target === "" || target === "selection" || target === "auto" || target === "preset") {
      let sel = [];
      try { const current = api.getSelection(); if (current) for (let i = 0; i < current.length; i++) sel.push(current[i]); } catch (e) {}
      const roots = this.presetRoots();
      target = sel.length ? sel[0] : (roots && roots.ids && roots.ids.length ? roots.ids[0] : null);
    }
    if (!target) throw new Error("modulate: no target layer (pass a layer id or select one)");

    const expandAttr = (value) => {
      if (value == null || value === "") return [];
      if (Array.isArray(value)) {
        const out = [];
        for (let i = 0; i < value.length; i++) {
          const parts = expandAttr(value[i]);
          for (let p = 0; p < parts.length; p++) if (out.indexOf(parts[p]) < 0) out.push(parts[p]);
        }
        return out;
      }
      const name = String(value);
      if (name === "position") return ["position.x", "position.y"];
      if (name === "scale") return ["scale.x", "scale.y"];
      return [name];
    };
    const attrList = expandAttr(config.attr != null ? config.attr : attrPath);

    if (type === "spring") {
      if (!attrList.length) throw new Error("modulate: attrPath is required");
      if (attrList.length !== 1) throw new Error("modulate: spring needs one scalar attribute");
      const attr = attrList[0];
      /*
       * The equilibrium the spring settles on. api.get answers at the playhead,
       * so a derived rest is whatever an earlier write left under it — after a
       * sampled rig has been keyed once, re-reading the layer feeds the curve's
       * own value back in as its rest. That is the documented default (it keeps
       * every existing call site producing what it produced before), but a rig
       * that has to be reproducible across runs pins it with { rest: n }.
       */
      let rest = 0;
      let restSource = "layer";
      const restSpec = config.rest != null ? config.rest : config.settleTo;
      if (restSpec != null) {
        rest = Number(restSpec);
        restSource = "spec";
      } else {
        try { rest = Number(api.get(target, attr)); } catch (e) { rest = 0; }
      }
      if (!isFinite(rest)) rest = 0;
      const duration = Math.max(6, Math.round(config.duration == null ? 45 : Number(config.duration)));
      // stiffness / dampingRatio / overshoot are the rig vocabulary (see _mg.rig);
      // they are expressed through the same damped cosine, converted to the
      // normalised window this sampler integrates over. Bare damping / frequency
      // keep their native sampler meaning, so existing call sites are unchanged.
      const rigSpec = config.stiffness != null || config.dampingRatio != null || config.overshoot != null
        ? this.rig(config) : null;
      const hold = Math.max(0, Math.round(Number(config.holdFrames == null ? 0 : config.holdFrames)));
      const startFrame = Math.round(config.startFrame == null ? 0 : Number(config.startFrame)) + (rigSpec ? rigSpec.holdFrames : hold);
      const unit = /scale/i.test(attr);
      const fallbackAmplitude = unit ? 0.15 : (/opacity/i.test(attr) ? 20 : 40);
      const amplitude = Number(config.amplitude != null ? config.amplitude : (config.distance != null ? config.distance : fallbackAmplitude));
      let damping = config.damping == null ? 6 : Number(config.damping);
      let frequency = config.frequency == null ? 2.25 : Number(config.frequency);
      if (rigSpec) {
        damping = rigSpec.dampingRatio * rigSpec.angularFrequency * duration;
        frequency = rigSpec.cyclesPerFrame * duration;
      }
      let samples = Math.max(4, Math.min(24, Math.round(duration / 2)));
      if (samples > duration) samples = duration;
      // Nyquist: a sampled cosine needs at least two points per cycle. Cavalry
      // has no native spring node, so a rig stiffer than the sample budget can
      // hold is reported rather than silently turned into noise.
      const aliased = frequency * 2 > samples;
      const points = [];
      for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        const decay = Math.exp(-damping * t);
        const value = rest + amplitude * decay * Math.cos(Math.PI * 2 * frequency * t);
        points.push([startFrame + Math.round(t * duration), Math.round(value * 1000) / 1000]);
      }
      points[samples][1] = rest;
      const times = points.map(function (p) { return p[0]; });
      /*
       * Two runs of the same rig always land on the same frame times, so the
       * window alone cannot prove the curve is unchanged: retuning stiffness
       * keeps the sample grid and replaces the values. Remember the exact spec
       * that produced the keys (same globalThis pattern __rememberPreset uses)
       * and skip only when both the spec and the window still match. Without a
       * remembered spec the safe move is to rewrite — keying frames that already
       * exist updates their values instead of duplicating keys.
       */
      const rigKey = String(target) + "|" + attr;
      const signature = [duration, samples, startFrame, rest, amplitude, damping, frequency].join("|");
      let cache = null;
      try {
        if (!globalThis.__mgSpringRigs) globalThis.__mgSpringRigs = {};
        cache = globalThis.__mgSpringRigs;
      } catch (e) { cache = null; }
      let already = null;
      try { already = (api.getKeyframeTimes(target, attr) || []).slice().sort(function (a, b) { return a - b; }); } catch (e) { already = null; }
      const sameWindow = !!already && already.length === times.length
        && times.every(function (frame, index) { return already[index] === frame; });
      if (!config.force && sameWindow && cache && cache[rigKey] === signature) {
        return {
          type: "spring",
          target: target,
          attrs: [attr],
          node: null,
          keyframes: points.length,
          duration: duration,
          rest: rest,
          restSource: restSource,
          amplitude: amplitude,
          cycles: Math.round(frequency * 100) / 100,
          aliased: aliased,
          skipped: "already-sampled",
          eased: "unchanged — the same sampled rig is already keyed on this attribute"
        };
      }
      _rb.kf(target, attr, points, "None");
      if (cache) cache[rigKey] = signature;
      return {
        type: "spring",
        target: target,
        attrs: [attr],
        node: null,
        keyframes: points.length,
        duration: duration,
        rest: rest,
        restSource: restSource,
        amplitude: amplitude,
        cycles: Math.round(frequency * 100) / 100,
        stiffness: rigSpec ? rigSpec.stiffness : null,
        dampingRatio: rigSpec ? rigSpec.dampingRatio : null,
        overshoot: rigSpec ? rigSpec.overshoot : null,
        aliased: aliased,
        retuned: sameWindow,
        eased: "sampled damped cosine (no native spring node in Cavalry 2.8)",
        applied: points.length
      };
    }

    if (type === "staggerFalloff") {
      if (!attrList.length) throw new Error("modulate: attrPath is required for staggerFalloff");
      const attr = attrList[0];
      const staggerCfg = config.stagger || {};
      const falloffCfg = config.falloff || {};
      const name = config.name || "Falloff";
      const offset = Number(config.offset != null ? config.offset : (staggerCfg.offset != null ? staggerCfg.offset : 4));
      const falloffAttrs = {
        size: falloffCfg.size || config.size || [800, 800],
        strength: falloffCfg.strength != null ? num(falloffCfg.strength, 100) : (config.falloffStrength != null ? num(config.falloffStrength, 100) : 100),
        shapeType: falloffCfg.shapeType != null ? falloffCfg.shapeType : (config.shapeType != null ? config.shapeType : 0),
        pathMode: falloffCfg.pathMode != null ? falloffCfg.pathMode : 0
      };
      if (falloffCfg.angles != null) falloffAttrs.angles = falloffCfg.angles;
      if (falloffCfg.repetitions != null) falloffAttrs.repetitions = falloffCfg.repetitions;
      if (falloffCfg.seed != null) falloffAttrs.seed = falloffCfg.seed;
      if (config.seed != null) falloffAttrs.seed = config.seed;
      const staggerAttrs = { offset: offset };
      if (staggerCfg.strength != null) staggerAttrs.strength = staggerCfg.strength;
      if (staggerCfg.minimum != null) staggerAttrs.minimum = staggerCfg.minimum;
      if (staggerCfg.maximum != null) staggerAttrs.maximum = staggerCfg.maximum;
      // Re-running the rig retunes the nodes that already drive the attribute
      // instead of stacking a second stagger/falloff pair on top of them.
      const reuse = !config.force;
      let stagger = reuse ? this.__findModifier(target, attr, "stagger") : null;
      const reused = { stagger: !!stagger, falloff: false };
      if (stagger) { try { _rb.set(stagger, staggerAttrs); } catch (e) {} }
      else stagger = _rb.layer("stagger", name + " Stagger", staggerAttrs);
      const own = String(this.__inConnections(stagger, "falloffs")[0] || "").split(".")[0];
      let falloff = reuse && own && this.__layerType(own) === "falloff" ? own : null;
      if (falloff) { reused.falloff = true; try { _rb.set(falloff, falloffAttrs); } catch (e) {} }
      else falloff = _rb.layer("falloff", name + " Falloff", falloffAttrs);
      _mg.wire(stagger, "id", target, attr);
      _mg.wire(falloff, "id", stagger, "falloffs");
      return {
        type: "staggerFalloff",
        target: target,
        attrs: [attr],
        falloff: falloff,
        stagger: stagger,
        offset: offset,
        reused: reused,
        created: (reused.stagger ? 0 : 1) + (reused.falloff ? 0 : 1),
        applied: 2
      };
    }

    if (type !== "organicFloat" && type !== "noise" && type !== "oscillator") {
      throw new Error("modulate: unknown type " + type);
    }
    if (!attrList.length) throw new Error("modulate: attrPath is required");

    const name = config.name || (type === "oscillator" ? "Oscillator" : "Float");
    const frequency = config.frequency == null ? 0.35 : Number(config.frequency);
    const timeScale = config.timeScale == null ? 1 : Number(config.timeScale);
    const nodes = [];
    let amplitudeUsed = 0;

    const reusedNodes = [];
    for (let i = 0; i < attrList.length; i++) {
      const attr = attrList[i];
      const unit = /scale|opacity/i.test(attr);
      const fallback = unit ? (/opacity/i.test(attr) ? 18 : 0.12) : 30;
      const amplitude = Number(config.amplitude != null ? config.amplitude : (config.strength != null ? config.strength : fallback));
      amplitudeUsed = amplitude;
      const nodeType = type === "oscillator" ? "oscillator" : "noise";
      let attrs;
      if (nodeType === "oscillator") {
        attrs = { strength: amplitude, frequency: frequency, timeScale: timeScale };
        if (config.trigType != null) attrs.trigType = config.trigType;
        if (config.waveType != null) attrs.waveType = config.waveType;
        if (config.offset != null) attrs.offset = config.offset;
        if (config.stagger != null) attrs.stagger = config.stagger;
      } else {
        attrs = {
          strength: amplitude,
          "generator.frequency": frequency,
          "generator.timeScale": timeScale,
          "generator.seed": (config.seed == null ? 7 : Number(config.seed)) + i
        };
        if (config.gain != null) attrs["generator.gain"] = config.gain;
        if (config.octaves != null) attrs["generator.octaves"] = config.octaves;
        if (config.lacunarity != null) attrs["generator.lacunarity"] = config.lacunarity;
        if (config.offset != null) attrs["generator.offset"] = config.offset;
        if (config.strengthToZero != null) attrs.strengthToZero = config.strengthToZero;
        if (config.useNormals != null) attrs.useNormals = config.useNormals;
      }
      // An oscillator or noise node already wired to this attribute is retuned in
      // place; only force builds a second one. Re-running a modulation must never
      // stack nodes — the visible result is the sum of every input.
      let node = config.force ? null : this.__findModifier(target, attr, nodeType);
      if (node) {
        try { _rb.set(node, attrs); reusedNodes.push(node); } catch (e) { node = null; }
      }
      if (!node) node = _rb.layer(nodeType, name + " " + attr, attrs);
      _mg.wire(node, "id", target, attr);
      nodes.push(node);
    }

    return {
      type: type,
      target: target,
      attrs: attrList,
      nodes: nodes,
      amplitude: amplitudeUsed,
      frequency: frequency,
      reused: reusedNodes,
      created: nodes.length - reusedNodes.length,
      applied: nodes.length
    };
  },

  /**
   * Native Connect Shape connector between two layers. Two mesh distributions
   * read the layers' pivots (the documented Source/Target input), so the wire
   * follows both layers when they are moved or animated.
   *
   * styleSpec = { color?, width?, dash?, curve?, targetMode?, count?,
   *               maxConnections?, distance?, name? }
   */
  connectDynamic(sourceId, targetId, styleSpec) {
    styleSpec = styleSpec || {};
    let source = sourceId;
    let target = targetId;
    if (source && typeof source === "object") source = source.id || source.layerId;
    if (target && typeof target === "object") target = target.id || target.layerId;
    if (!source || !target) throw new Error("connectDynamic: sourceId and targetId are required");

    const name = styleSpec.name || "Dynamic Connector";
    const makeMesh = (layerId, tag) => {
      const mesh = _rb.layer("meshDistribution", name + " " + tag, {
        count: Math.max(1, Math.round(Number(styleSpec.count == null ? 1 : styleSpec.count))),
        fill: styleSpec.fill !== false,
        scaleToFit: styleSpec.scaleToFit !== false,
        ignoreEmptySubMeshes: true
      });
      api.connect(layerId, "id", mesh, "inputShape");
      return mesh;
    };
    const sourceMesh = makeMesh(source, "Source");
    const targetMesh = makeMesh(target, "Target");

    const curve = styleSpec.curve === true || styleSpec.lineType === "bezier" || Number(styleSpec.lineType) === 2;
    let targetMode = 1;
    const mode = styleSpec.targetMode;
    if (mode === 0 || mode === "within" || mode === "range" || mode === "withinRange") targetMode = 0;
    else if (mode === 2 || mode === "index" || mode === "pointIndex") targetMode = 2;
    const connector = _rb.layer("connectShape", name, {
      lineType: curve ? 2 : 0,
      targetMode: targetMode,
      maxConnections: Math.max(1, Math.round(Number(styleSpec.maxConnections == null ? 1 : styleSpec.maxConnections))),
      maxPerPointConnections: Math.max(1, Math.round(Number(styleSpec.maxPerPointConnections == null ? 1 : styleSpec.maxPerPointConnections))),
      distance: Number(styleSpec.distance == null ? 100000 : styleSpec.distance),
      sortByDistance: true,
      ignoreTarget: false,
      autoBezierMode: 1,
      controlPointLengthBias: { x: 0.5, y: 0.5 }
    });
    api.connect(sourceMesh, "id", connector, "sourceGenerator");
    api.connect(targetMesh, "id", connector, "targetGenerator");
    _rb.stroke(connector, styleSpec.color || "@border", styleSpec.width == null ? 3 : Number(styleSpec.width), {
      capStyle: 1,
      dash: styleSpec.dash
    });

    const centre = (id) => {
      try {
        const bb = api.getBoundingBox(id, false);
        if (bb && bb.centre) return { x: Number(bb.centre.x) || 0, y: Number(bb.centre.y) || 0 };
      } catch (e) {}
      return { x: 0, y: 0 };
    };
    const a = centre(source);
    const b = centre(target);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return {
      connector: connector,
      source: source,
      target: target,
      sourceMesh: sourceMesh,
      targetMesh: targetMesh,
      anchors: {
        source: a,
        target: b,
        length: Math.sqrt(dx * dx + dy * dy),
        angle: Math.atan2(dy, dx) * 180 / Math.PI
      },
      follows: true
    };
  },

  /**
   * Scene-memory registry of the roots each preset created. globalThis is the
   * only cross-execution store Cavalry 2.8 exposes (there is no api.readFile).
   */
  __rememberPreset(presetId, tracked) {
    try {
      const ids = [];
      const byKey = {};
      const keys = Object.keys(tracked || {});
      for (let i = 0; i < keys.length; i++) {
        const id = tracked[keys[i]];
        if (typeof id !== "string" || !id) continue;
        byKey[keys[i]] = id;
        if (ids.indexOf(id) < 0) ids.push(id);
      }
      globalThis.__mgPresetRoots = {
        preset: presetId,
        ids: ids,
        byKey: byKey,
        at: Date.now()
      };
    } catch (e) {}
    return tracked;
  },

  /**
   * Slug rule shared with Stallion's /state readback (Introspect.ts __slug):
   * non-alphanumerics collapse to "_", trimmed, lowercased, capped at 48 chars.
   * Both sides must agree, or a semantic id captured over HTTP cannot be
   * addressed inside a script.
   */
  __slug(text) {
    return String(text == null ? "" : text)
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase()
      .slice(0, 48);
  },

  __niceName(id) {
    if (id == null || id === "") return "";
    try { return String(api.getNiceName(id) || ""); } catch (e) { return ""; }
  },

  /**
   * Scene-derived index for one call: every comp layer in api.getCompLayers(false)
   * order, keyed by layer id, semantic id and slug. Rebuilt per call on purpose —
   * caching it would go stale the moment a preset creates a layer, and the walk is
   * one read per layer rather than one per attribute.
   */
  __semanticIndex() {
    const index = { order: [], byId: {}, bySemantic: {}, bySlug: {} };
    let ids = [];
    try { ids = api.getCompLayers(false) || []; } catch (e) { ids = []; }
    for (let i = 0; i < ids.length; i++) {
      const id = String(ids[i]);
      const type = this.__layerType(id);
      const name = this.__niceName(id);
      const slug = this.__slug(name || type);
      const semantic = (slug || "layer") + "_" + i;
      const row = { id: id, index: i, name: name, type: type, slug: slug, semanticId: semantic };
      index.order.push(id);
      index.byId[id] = row;
      index.bySemantic[semantic] = id;
      if (!index.bySlug[slug]) index.bySlug[slug] = [];
      index.bySlug[slug].push(id);
    }
    return index;
  },

  /**
   * Deterministic semantic id for a layer — slug of its nice name plus its index
   * in the comp, e.g. beat_02_card_spring_3. Same scheme as the Stallion readback,
   * so the id a diff pass reads out of /state is the id a refinement patch writes
   * back to, without carrying opaque bridge ids between runs.
   */
  semantic(id, index) {
    const row = (index || this.__semanticIndex()).byId[String(id)];
    return row ? row.semanticId : null;
  },

  /** Every layer of the active comp as { id, semanticId, name, type }, in comp order. */
  semantics(limit) {
    const index = this.__semanticIndex();
    const cap = limit == null ? index.order.length : Math.max(0, Math.round(Number(limit)));
    const out = [];
    for (let i = 0; i < index.order.length && i < cap; i++) {
      const row = index.byId[index.order[i]];
      out.push({ id: row.id, semanticId: row.semanticId, name: row.name, type: row.type });
    }
    return out;
  },

  /**
   * Resolve a live layer id, an exact semantic id, an "@alias" handle, or a bare
   * slug (all layers that share it) to layer ids. Returns [] when nothing
   * matches so the caller decides whether that is an error. An alias handle is
   * resolved through the globalThis registry first and falls back to the first
   * comp-order layer whose slug matches when the alias was never registered.
   */
  find(query, index) {
    const target = index || this.__semanticIndex();
    const text = String(query == null ? "" : query).trim();
    if (!text) return [];
    if (text.charAt(0) === "@") {
      const key = this.__aliasKey(text);
      if (!key) return [];
      const registered = this.__aliasMap()[key];
      if (registered != null && target.byId[String(registered)]) return [String(registered)];
      const named = target.bySlug[key];
      return named && named.length ? [named[0]] : [];
    }
    if (target.byId[text]) return [text];
    if (target.bySemantic[text]) return [target.bySemantic[text]];
    const hits = target.bySlug[text] || target.bySlug[this.__slug(text)];
    return hits ? hits.slice() : [];
  },

  __readAttr(id, attr) {
    try { return api.get(id, attr); } catch (e) { return null; }
  },

  /**
   * Value equality good enough to prove a write is a no-op: numbers within a
   * relative 1e-6, exact strings and booleans, deep equality for arrays and
   * objects. A colour object and its hex spelling are deliberately *not* treated
   * as equal — anything the comparison cannot prove equal is written.
   */
  __sameValue(current, wanted) {
    if (current == null || wanted == null) return false;
    if (typeof wanted === "number") {
      const n = Number(current);
      if (!isFinite(n) || !isFinite(wanted)) return false;
      return Math.abs(n - wanted) <= 1e-6 * Math.max(1, Math.abs(wanted));
    }
    if (typeof wanted === "string") return (typeof current === "string" || typeof current === "number") && String(current) === wanted;
    if (typeof wanted === "boolean") return !!current === wanted;
    if (Array.isArray(wanted)) {
      if (!Array.isArray(current) || current.length !== wanted.length) return false;
      for (let i = 0; i < wanted.length; i++) if (!this.__sameValue(current[i], wanted[i])) return false;
      return true;
    }
    if (typeof wanted === "object") {
      if (typeof current !== "object" || Array.isArray(current)) return false;
      const keys = Object.keys(wanted);
      for (let i = 0; i < keys.length; i++) if (!this.__sameValue(current[keys[i]], wanted[keys[i]])) return false;
      return true;
    }
    return false;
  },

  presetRoots() {
    try {
      return globalThis.__mgPresetRoots || null;
    } catch (e) {
      return null;
    }
  },

  /**
   * Expand explicit ids, semantic ids, the live selection, or the last preset's
   * roots. semantic/semantics take precedence over the selection fallback so a
   * refinement pass can address the layer a diff was measured on rather than
   * whatever happens to be selected now.
   */
  __patchTargets(spec) {
    spec = spec || {};
    const queries = [].concat(spec.semantics || [], spec.semantic != null ? [spec.semantic] : []);
    if (queries.length) {
      const index = this.__semanticIndex();
      const hits = [];
      for (let q = 0; q < queries.length; q++) {
        const found = this.find(queries[q], index);
        if (!found.length) throw new Error("_mg: no layer in the active comp matches " + queries[q]);
        for (let f = 0; f < found.length; f++) if (hits.indexOf(found[f]) < 0) hits.push(found[f]);
      }
      return hits;
    }
    const tracked = this.presetRoots();
    let roots = [];
    if (Array.isArray(spec.ids) && spec.ids.length) {
      roots = spec.ids.slice();
    } else if (typeof spec.target === "string" && spec.target.indexOf("#") >= 0) {
      roots = [spec.target];
    } else if (spec.target === "preset") {
      roots = tracked && tracked.ids ? tracked.ids.slice() : [];
    } else {
      const sel = [];
      try {
        const current = api.getSelection();
        if (current) for (let i = 0; i < current.length; i++) sel.push(current[i]);
      } catch (e) {}
      roots = sel.length ? sel : (tracked && tracked.ids ? tracked.ids.slice() : []);
    }
    if (!roots.length) throw new Error("No layers selected and no preset roots tracked");
    return roots;
  },

  /**
   * Incrementally retune selected layers or the last preset's roots in place.
   * Never deletes or recreates nodes: colours/text/attrs are set directly,
   * keyframes are retimed with api.modifyKeyframe and easings with
   * api.magicEasing.
   *
   * spec = {
   *   target?: "selection" | "preset" | "<layerId>", ids?: string[],
   *   color?, fill?, stroke?, strokeColor?, glowColor?,
   *   text?: string | { "<id>"|"<niceName>"|"<trackedKey>": string },
   *   fontSize?, opacity?,
   *   duplicator?: { count?, size?, direction?, distribution? },
   *   attrs?: {...}, byType?: { textShape: {...}, duplicator: {...} },
   *   shiftKeyframes?: number | { frames, attrs? },
   *   easing?: string | { name, attrs?, frames? }
   * }
   */
  patchSelected(spec) {
    spec = spec || {};
    // Geometry deltas need a read-modify-write per layer; _mg.patch owns that
    // route and delegates styling back here.
    if (spec.delta) return this.patch(spec);
    const roots = this.__patchTargets(spec);
    const tracked = this.presetRoots() || { byKey: {} };
    const keyById = {};
    const byKey = tracked.byKey || {};
    const keyNames = Object.keys(byKey);
    for (let i = 0; i < keyNames.length; i++) keyById[byKey[keyNames[i]]] = keyNames[i];

    const all = [];
    const seen = {};
    const walk = (id, depth) => {
      if (!id || seen[id] || depth > 8) return;
      seen[id] = true;
      all.push(id);
      let kids = null;
      try { kids = api.getChildren(id); } catch (e) { kids = null; }
      if (kids && kids.length) {
        for (let i = 0; i < kids.length; i++) walk(kids[i], depth + 1);
      }
    };
    for (let i = 0; i < roots.length; i++) walk(roots[i], 0);

    let changes = 0;
    const touched = {};
    const mark = (id) => { touched[id] = true; };
    const applySet = (id, attrs) => {
      try {
        _rb.set(id, attrs);
        changes += 1;
        mark(id);
        return true;
      } catch (e) {
        return false;
      }
    };
    const typeOf = (id) => {
      try { return api.getLayerType(id) || ""; } catch (e) { return ""; }
    };

    const fill = spec.fill != null ? spec.fill : spec.color;
    const strokeColor = spec.strokeColor != null ? spec.strokeColor : spec.stroke;
    const glowColor = spec.glowColor;

    for (let i = 0; i < all.length; i++) {
      const id = all[i];
      const type = typeOf(id);
      const isText = type === "textShape";

      if (fill != null && (type === "basicShape" || isText || spec.includeAll)) {
        applySet(id, { "material.materialColor": _rb.c(fill) });
      }
      if (strokeColor != null) applySet(id, { strokeColor: _rb.c(strokeColor) });
      if (glowColor != null) applySet(id, { glowColor: _rb.c(glowColor) });

      if (isText) {
        if (typeof spec.text === "string") {
          applySet(id, { text: spec.text });
        } else if (spec.text && typeof spec.text === "object") {
          const nice = (() => { try { return api.getNiceName(id); } catch (e) { return null; } })();
          const key = keyById[id];
          const next =
            spec.text[id] != null ? spec.text[id] :
            (nice != null && spec.text[nice] != null ? spec.text[nice] :
            (key != null && spec.text[key] != null ? spec.text[key] : null));
          if (next != null) applySet(id, { text: String(next) });
        }
        if (spec.fontSize != null) applySet(id, { fontSize: Number(spec.fontSize) });
      }

      if (spec.opacity != null) applySet(id, { opacity: Number(spec.opacity) });

      if (spec.duplicator && type === "duplicator") {
        const d = spec.duplicator;
        if (d.count != null) applySet(id, { "generator.count": d.count });
        if (d.size != null) applySet(id, { "generator.size": d.size });
        if (d.direction != null) applySet(id, { "generator.direction": d.direction });
        if (d.distribution) {
          try {
            api.setGenerator(id, "generator", d.distribution);
            changes += 1;
            mark(id);
          } catch (e) {}
        }
      }

      if (spec.byType && spec.byType[type]) applySet(id, spec.byType[type]);
      if (spec.attrs) applySet(id, spec.attrs);
    }

    const animatedAttrs = (id, cfg) => {
      if (cfg && Array.isArray(cfg.attrs) && cfg.attrs.length) return cfg.attrs;
      try { return api.getAnimatedAttributes(id) || []; } catch (e) { return []; }
    };

    if (spec.shiftKeyframes != null) {
      const cfg = typeof spec.shiftKeyframes === "number"
        ? { frames: spec.shiftKeyframes }
        : spec.shiftKeyframes;
      const offset = Number(cfg.frames) || 0;
      if (offset) {
        for (let i = 0; i < all.length; i++) {
          const id = all[i];
          const attrs = animatedAttrs(id, cfg);
          for (let a = 0; a < attrs.length; a++) {
            const attr = attrs[a];
            let times = [];
            try { times = api.getKeyframeTimes(id, attr) || []; } catch (e) { times = []; }
            times = times.slice().sort(offset > 0 ? (x, y) => y - x : (x, y) => x - y);
            for (let t = 0; t < times.length; t++) {
              const frame = Number(times[t]);
              try {
                const dict = {};
                dict[attr] = { frame: frame, newFrame: frame + offset };
                api.modifyKeyframe(id, dict);
                changes += 1;
                mark(id);
              } catch (e) {}
            }
          }
        }
      }
    }

    if (spec.easing != null) {
      const cfg = typeof spec.easing === "string" ? { name: spec.easing } : spec.easing;
      const ease = _rb.ease(cfg.name);
      for (let i = 0; i < all.length; i++) {
        const id = all[i];
        const attrs = animatedAttrs(id, cfg);
        for (let a = 0; a < attrs.length; a++) {
          const attr = attrs[a];
          let times = Array.isArray(cfg.frames) && cfg.frames.length ? cfg.frames.slice() : [];
          if (!times.length) {
            try { times = api.getKeyframeTimes(id, attr) || []; } catch (e) { times = []; }
          }
          for (let t = 0; t < times.length; t++) {
            try {
              api.magicEasing(id, attr, Number(times[t]), ease);
              changes += 1;
              mark(id);
            } catch (e) {}
          }
        }
      }
    }

    return {
      patched: Object.keys(touched).length,
      changes: changes,
      ids: all,
      preset: tracked.preset || null
    };
  },

  /**
   * Snap or pulse rigs onto audio-derived frame numbers. The frames array must
   * already be in comp frames (the CLI --audio-beats helper converts seconds at
   * the active comp's FPS).
   *
   * spec:
   *   function(frame, index)                 -> custom callback
   *   "pulse" | "flash" | "snap" | "stagger" -> built-in modes
   *   { type, ids?, target?, duration?, peak?, low?, attrs?, ease?, count?, offset? }
   */
  syncToFrames(frames, spec) {
    const list = [];
    for (let i = 0; i < (frames || []).length; i++) {
      const f = Math.round(Number(frames[i]));
      if (isFinite(f) && f >= 0 && list.indexOf(f) < 0) list.push(f);
    }
    list.sort((a, b) => a - b);
    if (!list.length) throw new Error("syncToFrames: no valid frames supplied");

    if (typeof spec === "function") {
      for (let i = 0; i < list.length; i++) spec(list[i], i);
      return { frames: list, mode: "callback", applied: list.length };
    }
    if (typeof spec === "string") spec = { type: spec };
    spec = spec || {};
    if (typeof spec.callback === "function") {
      for (let i = 0; i < list.length; i++) spec.callback(list[i], i);
      return { frames: list, mode: "callback", applied: list.length };
    }

    const mode = spec.type || spec.mode || "pulse";
    const targets = spec.ids && spec.ids.length
      ? spec.ids.slice()
      : (spec.target && String(spec.target).indexOf("#") >= 0
        ? [spec.target]
        : this.__patchTargets({ target: spec.target || "auto" }));
    const ease = spec.ease || "SlowOut";
    const duration = Math.max(2, Math.round(spec.duration == null ? 6 : Number(spec.duration)));
    let applied = 0;

    if (mode === "pulse" || mode === "flash" || mode === "bounce") {
      const opacity = mode === "flash";
      const attrs = spec.attrs && spec.attrs.length
        ? spec.attrs
        : (opacity ? ["opacity"] : ["scale.x", "scale.y"]);
      const peak = spec.peak == null ? (opacity ? 45 : 1.12) : Number(spec.peak);
      const rest = spec.rest == null ? (opacity ? 100 : 1) : Number(spec.rest);
      for (let t = 0; t < targets.length; t++) {
        const id = targets[t];
        for (let a = 0; a < attrs.length; a++) {
          const attr = attrs[a];
          for (let f = 0; f < list.length; f++) {
            const start = Math.max(0, list[f] - 1);
            _rb.kf(id, attr, [
              [start, rest],
              [list[f] + Math.round(duration / 2), peak],
              [list[f] + duration, rest]
            ], ease);
            applied += 1;
          }
        }
      }
      return { frames: list, mode: mode, targets: targets, applied: applied };
    }

    if (mode === "snap") {
      const cfgAttrs = spec.attrs && spec.attrs.length ? spec.attrs : null;
      for (let t = 0; t < targets.length; t++) {
        const id = targets[t];
        let attrs = cfgAttrs;
        if (!attrs) {
          try { attrs = api.getAnimatedAttributes(id) || []; } catch (e) { attrs = []; }
        }
        for (let a = 0; a < attrs.length; a++) {
          const attr = attrs[a];
          let times = [];
          try { times = api.getKeyframeTimes(id, attr) || []; } catch (e) { times = []; }
          for (let k = 0; k < times.length; k++) {
            const frame = Number(times[k]);
            let best = list[0];
            let bestDist = Math.abs(best - frame);
            for (let b = 1; b < list.length; b++) {
              const dist = Math.abs(list[b] - frame);
              if (dist < bestDist) { best = list[b]; bestDist = dist; }
            }
            if (best !== frame) {
              try {
                const dict = {};
                dict[attr] = { frame: frame, newFrame: best };
                api.modifyKeyframe(id, dict);
                applied += 1;
              } catch (e) {}
            }
          }
        }
      }
      return { frames: list, mode: "snap", targets: targets, applied: applied };
    }

    if (mode === "stagger") {
      let total = spec.count == null ? null : Number(spec.count);
      let offset = spec.offset == null ? 0 : Number(spec.offset);
      if (!offset && list.length > 1) offset = Math.round((list[list.length - 1] - list[0]) / (list.length - 1));
      for (let t = 0; t < targets.length; t++) {
        const id = targets[t];
        let type = "";
        try { type = api.getLayerType(id) || ""; } catch (e) {}
        if (type !== "duplicator") continue;
        const stagger = _rb.layer("stagger", "Beat Stagger", { offset: offset || 4 });
        try { api.connect(stagger, "id", id, "shapeTimeOffset"); } catch (e) {}
        applied += 1;
        let count = total;
        if (count == null) {
          try {
            const current = api.get(id, "generator.count");
            count = Array.isArray(current) ? Number(current[0]) * Number(current[1]) : Number(current);
          } catch (e) { count = 0; }
        }
        if (count > 0) {
          const step = count > list.length ? Math.floor(count / list.length) : 1;
          for (let f = 0; f < list.length; f++) {
            const value = count <= list.length ? f + 1 : Math.min(count, (f + 1) * step);
            _rb.kf(id, "generator.count", [[list[f], value]], "None");
            applied += 1;
          }
        }
      }
      return { frames: list, mode: "stagger", targets: targets, applied: applied };
    }

    throw new Error("syncToFrames: unknown mode " + mode);
  },

  /**
   * Write one keyframe, optionally with explicit weighted cubic Bézier
   * handles. Plain writes are a bare api.keyframe at exactly 'frame'; handle
   * objects add api.modifyKeyframeTangent (per side) and api.modifyKeyframe
   * (interpolation type) on the same frame. Neighbouring keyframes are never
   * touched — tangent safety comes from writing only at 'frame'.
   */
  __kfWrite(id, attr, frame, value, handles) {
    const dict = {};
    dict[attr] = value;
    api.keyframe(id, frame, dict);
    if (!handles) return { frame: frame, tangents: false };
    const tangents = [];
    const wantsIn = handles.inWeight != null || handles.inAngle != null;
    const wantsOut = handles.outWeight != null || handles.outAngle != null;
    if (wantsIn) {
      const spec = { frame: frame, inHandle: true, outHandle: false, angleLocked: false, weightLocked: false };
      if (handles.inAngle != null) spec.angle = Number(handles.inAngle);
      if (handles.inWeight != null) spec.weight = Number(handles.inWeight);
      const t = {}; t[attr] = spec;
      try { api.modifyKeyframeTangent(id, t); tangents.push("in"); } catch (e) {}
    }
    if (wantsOut) {
      const spec = { frame: frame, inHandle: false, outHandle: true, angleLocked: false, weightLocked: false };
      if (handles.outAngle != null) spec.angle = Number(handles.outAngle);
      if (handles.outWeight != null) spec.weight = Number(handles.outWeight);
      const t = {}; t[attr] = spec;
      try { api.modifyKeyframeTangent(id, t); tangents.push("out"); } catch (e) {}
    }
    if (handles.interpolation != null) {
      const m = {}; m[attr] = { frame: frame, type: Math.round(Number(handles.interpolation)) };
      try { api.modifyKeyframe(id, m); } catch (e) {}
    }
    return { frame: frame, tangents: tangents };
  },

  /**
   * Snapshot everything readable about the keyframes of (id, attr) before a
   * patch touches it: the keyframe times, and — when this Cavalry build
   * exposes keyframe selection — the raw selected-keyframe state of each
   * keyframe id. The caller's keyframe selection is captured and restored.
   * Cavalry 2.8 has no per-keyframe tangent getter, so what cannot be read
   * cannot be restored; the guarantee is that the patch never writes at any
   * frame other than the target.
   */
  __kfGuardSnapshot(id, attr) {
    const guard = { id: id, attr: attr, times: [], selection: null, keyframes: null };
    try { guard.times = (api.getKeyframeTimes(id, attr) || []).slice().sort((a, b) => a - b); } catch (e) {}
    const canSelect = typeof api.setSelectedKeyframeIds === "function"
      && typeof api.getKeyframeIdsForAttribute === "function"
      && typeof api.getSelectedKeyframes === "function";
    if (!canSelect) return guard;
    try {
      if (typeof api.getSelectedKeyframeIds === "function") guard.selection = api.getSelectedKeyframeIds() || [];
    } catch (e) {}
    let kfIds = [];
    try { kfIds = api.getKeyframeIdsForAttribute(id, attr) || []; } catch (e) {}
    if (kfIds.length) {
      try {
        api.setSelectedKeyframeIds(kfIds);
        guard.keyframes = api.getSelectedKeyframes();
      } catch (e) {
        guard.keyframes = null;
      }
    }
    return guard;
  },

  /** Re-assert recorded keyframe state and restore the caller's selection. */
  __kfGuardRestore(guard) {
    if (!guard) return;
    try {
      if (guard.selection && typeof api.setSelectedKeyframeIds === "function") api.setSelectedKeyframeIds(guard.selection);
    } catch (e) {}
  },

  /**
   * Tangent-safe keyframe patch: writes value(s) at exactly 'frame' for every
   * attr in 'attrs', having snapshotted each attribute's keyframe state, and
   * restores the selection inside the same undo group. Neighbour tangents are
   * never rewritten by this path.
   */
  patchKeyframeSafe(id, attrs, frame) {
    const guards = {};
    const keys = Object.keys(attrs || {});
    const at = Math.round(Number(frame));
    for (let k = 0; k < keys.length; k++) guards[keys[k]] = this.__kfGuardSnapshot(id, keys[k]);
    try {
      for (let k = 0; k < keys.length; k++) {
        const guard = guards[keys[k]];
        // A correction pass always targets the same critical frames. Rewrite
        // the value of an existing key through modifyKeyframe so repeated
        // iterations never stack two keys at one frame or disturb tangents.
        if (guard && guard.times.indexOf(at) >= 0) {
          const dict = {};
          dict[keys[k]] = { frame: at, newValue: attrs[keys[k]] };
          try { api.modifyKeyframe(id, dict); continue; } catch (e) {}
        }
        this.__kfWrite(id, keys[k], at, attrs[keys[k]], null);
      }
    } finally {
      for (let k = 0; k < keys.length; k++) this.__kfGuardRestore(guards[keys[k]]);
    }
    return { id: id, frame: Math.round(Number(frame)), attrs: keys, guarded: Object.keys(guards).length };
  },

  /** Open one undo group for the whole operations body; nesting is collapsed. */
  undoGroup(spec) {
    spec = spec || {};
    if (typeof spec.operations !== "function") throw new Error("_mg.undoGroup requires an operations function");
    const outermost = !this.__undoDepth;
    this.__undoDepth = (this.__undoDepth || 0) + 1;
    const canUndo = outermost && typeof api.startUndoGroup === "function";
    if (canUndo) api.startUndoGroup(String(spec.name || spec.id || "refclone batch"));
    try {
      return spec.operations();
    } finally {
      this.__undoDepth -= 1;
      if (canUndo && typeof api.endUndoGroup === "function") api.endUndoGroup();
    }
  },

  /**
   * Declarative two-boundary keyframe macro emitted by refclone Stage 3/4.
   * spec = { element, property, startFrame, endFrame, startValue, endValue, easing? }
   * easing: "BounceOut" | { name } | { type: "cubic-bezier", y1, y2 }
   *   | { type: "weighted-bezier", inWeight, inAngle, outWeight, outAngle }
   * property aliases: x→position.x, y→position.y, scale_x→scale.x,
   * scale_y→scale.y; "position"/"scale" drive both axes with the same values.
   */
  keyframe(spec) {
    if (!spec || spec.element == null || spec.property == null) throw new Error("_mg.keyframe requires element and property");
    const startFrame = Math.round(Number(spec.startFrame));
    const endFrame = Math.round(Number(spec.endFrame));
    if (!isFinite(startFrame) || !isFinite(endFrame) || startFrame === endFrame) {
      throw new Error("_mg.keyframe requires distinct integer startFrame and endFrame");
    }
    const startValue = Number(spec.startValue);
    const endValue = Number(spec.endValue);
    if (!isFinite(startValue) || !isFinite(endValue)) throw new Error("_mg.keyframe requires finite startValue and endValue");
    const attrs = this.__propertyAttrs(spec.property);
    const easing = spec.easing || {};
    let handles = null;
    let name = null;
    if (typeof easing === "string") name = easing;
    else if (easing.type === "weighted-bezier" || easing.inWeight != null || easing.outWeight != null) {
      handles = { inWeight: easing.inWeight, inAngle: easing.inAngle, outWeight: easing.outWeight, outAngle: easing.outAngle };
    } else if (easing.type === "cubic-bezier" || easing.y1 != null) {
      name = this.__nearestEase([0.25, Number(easing.y1) || 0, 0.75, Number(easing.y2) || 1]);
    } else if (easing.name) name = easing.name;
    const resolved = name ? this.__easeName(name) : null;
    for (let i = 0; i < attrs.length; i++) {
      if (handles) {
        this.__kfWrite(spec.element, attrs[i], startFrame, startValue, handles);
        this.__kfWrite(spec.element, attrs[i], endFrame, endValue, handles);
      } else {
        this.kf(spec.element, attrs[i], [[startFrame, startValue], [endFrame, endValue]], resolved || "None");
      }
    }
    return { element: spec.element, property: spec.property, attrs: attrs, easing: handles ? "weighted-bezier" : (resolved || "None"), startFrame: startFrame, endFrame: endFrame };
  },

  /**
   * Multi-point keyframe macro: { element, property, points: [{ frame, value,
   * handles? }...], easing? }. The easing applies to every outgoing segment
   * (Cavalry magic easing is per-keyframe-outgoing); explicit per-point
   * handles bypass it for that keyframe.
   */
  keyframes(spec) {
    if (!spec || spec.element == null || spec.property == null) throw new Error("_mg.keyframes requires element and property");
    const points = Array.isArray(spec.points) ? spec.points : [];
    if (points.length < 2) throw new Error("_mg.keyframes requires at least two points");
    const attrs = this.__propertyAttrs(spec.property);
    const easing = spec.easing || {};
    let name = typeof easing === "string" ? easing : (easing.name || (easing.type === "cubic-bezier" ? this.__nearestEase([0.25, Number(easing.y1) || 0, 0.75, Number(easing.y2) || 1]) : null));
    const resolved = name ? this.__easeName(name) : "None";
    const applied = [];
    for (let i = 0; i < attrs.length; i++) {
      const attr = attrs[i];
      for (let p = 0; p < points.length; p++) {
        const point = points[p] || {};
        const frame = Math.round(Number(point.frame));
        if (!isFinite(frame)) throw new Error("_mg.keyframes points require integer frames");
        const handles = point.handles || null;
        this.__kfWrite(spec.element, attr, frame, point.value, handles);
        if (!handles && p < points.length - 1) {
          try { api.magicEasing(spec.element, attr, frame, resolved); } catch (e) {}
        }
        applied.push({ attr: attr, frame: frame });
      }
    }
    return { element: spec.element, property: spec.property, attrs: attrs, points: applied.length / attrs.length, easing: resolved };
  },

  /**
   * Behaviour macro emitted for damped-spring promotions: bakes the analytic
   * spring y(t) = target - exp(-z*w*t) * cos(wd*t) * (target - initial) into
   * per-frame keyframes with linear interpolation (a faithful piecewise
   * sampling of the continuous curve, no tangent guessing).
   * spec = { element, type: "spring", property, startFrame,
   *          parameters: { dampingRatio, naturalFrequency, initialValue, targetValue }, duration? }
   */
  behavior(spec) {
    if (!spec || spec.element == null || spec.property == null) throw new Error("_mg.behavior requires element and property");
    const type = String(spec.type || "spring").toLowerCase();
    const params = spec.parameters || {};
    if (type !== "spring") throw new Error("_mg.behavior supports type 'spring' (got " + type + ")");
    const zeta = Number(params.dampingRatio);
    const omega0 = Number(params.naturalFrequency);
    const initial = Number(params.initialValue);
    const target = Number(params.targetValue);
    if (!(zeta >= 0) || !(omega0 > 0)) throw new Error("_mg.behavior spring requires dampingRatio >= 0 and naturalFrequency > 0");
    if (!isFinite(initial) || !isFinite(target)) throw new Error("_mg.behavior spring requires finite initialValue and targetValue");
    const startFrame = Math.round(Number(spec.startFrame)) || 0;
    const duration = Math.round(Number(spec.duration)) || 0;
    let endFrame = startFrame + duration;
    if (!(duration > 0)) {
      try { endFrame = Math.round(Number(api.get(api.getActiveComp(), "endFrame")) || 0); } catch (e) { endFrame = 0; }
    }
    if (!(endFrame > startFrame)) endFrame = startFrame + 48;
    const attrs = this.__propertyAttrs(spec.property);
    const wd = omega0 * Math.sqrt(Math.max(0, 1 - zeta * zeta));
    const baked = [];
    for (let i = 0; i < attrs.length; i++) {
      const attr = attrs[i];
      const pts = [];
      for (let f = startFrame; f <= endFrame; f++) {
        const time = f - startFrame;
        const envelope = Math.exp(-zeta * omega0 * time);
        const value = target - envelope * Math.cos(wd * time) * (target - initial);
        pts.push([f, value]);
      }
      _rb.kf(spec.element, attr, pts, "None");
      baked.push({ attr: attr, keyframes: pts.length });
    }
    return { element: spec.element, type: "spring", property: spec.property, attrs: attrs, keyframes: baked };
  },

  /** Map refclone property aliases to concrete attribute paths. */
  __propertyAttrs(property) {
    const p = String(property);
    if (p === "x") return ["position.x"];
    if (p === "y") return ["position.y"];
    if (p === "scale_x") return ["scale.x"];
    if (p === "scale_y") return ["scale.y"];
    if (p === "position") return ["position.x", "position.y"];
    if (p === "scale") return ["scale.x", "scale.y"];
    return [p];
  },

  /**
   * Trim-path shorthand on a stroke/shape layer. 'start'/'end' are percentages
   * (trimStart/trimEnd), 'offset' shifts the trim window; 'travel' animates
   * trimEnd across the comp — a number means [0 → travel] over the comp range,
   * or pass { inFrame, outFrame, from, to, easing? } for explicit bounds.
   */
  trim(id, spec) {
    spec = spec || {};
    const attrs = {};
    if (spec.start != null) attrs.trimStart = Number(spec.start);
    if (spec.end != null) attrs.trimEnd = Number(spec.end);
    if (spec.offset != null) attrs.trimOffset = Number(spec.offset);
    if (Object.keys(attrs).length) this.set(id, attrs);
    let traveled = null;
    if (spec.travel != null) {
      const cfg = typeof spec.travel === "number" ? { inFrame: 0, from: 0, to: Number(spec.travel) } : spec.travel;
      let outFrame = cfg.outFrame;
      if (outFrame == null) {
        try { outFrame = Math.round(Number(api.get(api.getActiveComp(), "endFrame")) || 0); } catch (e) { outFrame = 0; }
      }
      const inFrame = Math.round(Number(cfg.inFrame)) || 0;
      const from = Number(cfg.from) || 0;
      const to = Number(cfg.to != null ? cfg.to : (spec.end != null ? spec.end : 100));
      _rb.kf(id, "trimEnd", [[inFrame, from], [Math.round(Number(outFrame)), to]], cfg.easing || spec.easing || "SlowOut");
      traveled = { attr: "trimEnd", from: from, to: to, inFrame: inFrame, outFrame: Math.round(Number(outFrame)) };
    }
    return { id: id, attrs: attrs, travel: traveled };
  },

  /**
   * Clipping-mask / track-matte binding. 'masks' is an array of
   * { id, mode: "alpha" | "invertedAlpha" | "luminance" }. The mask layer ids
   * are written to the target's 'masks' attribute and the matte mode is set
   * per entry. Failures are reported, never swallowed.
   */
  mask(targetId, masks) {
    const list = Array.isArray(masks) ? masks : [masks];
    const MODES = { alpha: 0, invertedAlpha: 1, luminance: 2 };
    const applied = [];
    const warnings = [];
    const ids = [];
    for (let i = 0; i < list.length; i++) {
      const entry = list[i] || {};
      const maskId = entry.id != null ? String(entry.id) : (entry.idPath != null ? String(entry.idPath) : null);
      if (!maskId) { warnings.push("mask entry missing id"); continue; }
      ids.push(maskId);
      const mode = entry.mode == null ? "alpha" : String(entry.mode);
      if (!(mode in MODES)) warnings.push("unknown matte mode '" + mode + "'");
      applied.push({ id: maskId, mode: mode });
    }
    if (ids.length) {
      try { this.set(targetId, { masks: ids }); } catch (e) { warnings.push("masks attribute rejected: " + e); }
      const first = applied[0] && applied[0].mode in MODES ? MODES[applied[0].mode] : null;
      if (first != null) {
        try { this.set(targetId, { matteMode: first }); } catch (e) { warnings.push("matteMode rejected: " + e); }
      }
    }
    if (warnings.length) {
      for (let w = 0; w < warnings.length; w++) console.warn("_mg.mask: " + warnings[w]);
    }
    return { target: targetId, applied: applied, warnings: warnings };
  },

  /** Skia-style blend mode on a layer or group (live attribute: blendMode). */
  blend(id, mode) {
    this.set(id, { blendMode: String(mode) });
    return { id: id, blendMode: String(mode) };
  },

  /**
   * Typography shorthand for textShape layers: fontSize, lineHeight (written
   * to the live lineSpacing attribute), letterSpacing and textBoxSize.
   */
  typography(id, spec) {
    spec = spec || {};
    const attrs = {};
    if (spec.fontSize != null) attrs.fontSize = Number(spec.fontSize);
    if (spec.lineHeight != null) attrs.lineSpacing = Number(spec.lineHeight);
    if (spec.letterSpacing != null) attrs.letterSpacing = Number(spec.letterSpacing);
    if (spec.textBoxSize != null) attrs.textBoxSize = spec.textBoxSize;
    if (Object.keys(attrs).length) this.set(id, attrs);
    return { id: id, attrs: attrs };
  },

  /**
   * SubMesh level targeting by name: "characters" | "words" | "lines" →
   * levelMode 0 | 1 | 2 on the text's subMesh deformer (created when absent).
   */
  subMeshLevel(textId, level) {
    const LEVELS = { characters: 0, words: 1, lines: 2 };
    const numeric = typeof level === "number" ? level : LEVELS[String(level).toLowerCase()];
    if (!(numeric >= 0 && numeric <= 2)) throw new Error("_mg.subMeshLevel: level must be characters|words|lines (got " + level + ")");
    let subMeshId = null;
    try {
      const incoming = api.getInConnectedAttributes(textId) || [];
      for (let i = 0; i < incoming.length; i++) {
        if (String(incoming[i]).indexOf("deformers") !== 0) continue;
        // getInConnection returns a single "sourceId.attr" descriptor (or an
        // array of them on some builds) — normalise both shapes.
        const raw = api.getInConnection(textId, incoming[i]);
        const sources = Array.isArray(raw) ? raw : [raw];
        for (let s = 0; s < sources.length; s++) {
          const otherId = String(sources[s] || "").split(".")[0];
          if (otherId && api.getLayerType(otherId) === "subMesh") { subMeshId = otherId; break; }
        }
        if (subMeshId) break;
      }
    } catch (e) {}
    if (subMeshId) {
      this.set(subMeshId, { levelMode: numeric });
      return { subMeshId: subMeshId, levelMode: numeric, created: false };
    }
    const made = this.subMesh(textId, numeric);
    return { subMeshId: made.subMeshId, staggerId: made.staggerId, levelMode: numeric, created: true };
  },

  /**
   * Filter attachment: { motionBlur?, gaussianBlur?, dropShadow?, noise? }.
   * motionBlur is the layer attribute; the rest are filter nodes connected to
   * the target's "filters" attribute (live node names: gaussianBlurFilter,
   * dropShadowFilter, grainFilter).
   */
  filter(id, spec) {
    spec = spec || {};
    const applied = [];
    if (spec.motionBlur != null) {
      this.set(id, { motionBlur: !!spec.motionBlur });
      applied.push({ kind: "motionBlur", value: !!spec.motionBlur });
    }
    if (spec.gaussianBlur) {
      const cfg = typeof spec.gaussianBlur === "number" ? { blurRadius: spec.gaussianBlur } : spec.gaussianBlur;
      const filterId = this.layer("gaussianBlurFilter", "Gaussian Blur", { blurRadius: Number(cfg.blurRadius) || 4 });
      try { api.connect(filterId, "id", id, "filters"); applied.push({ kind: "gaussianBlur", id: filterId }); } catch (e) { console.warn("_mg.filter: gaussianBlur connect failed: " + e); }
    }
    if (spec.dropShadow) {
      const cfg = typeof spec.dropShadow === "number" ? { shadowRadius: spec.dropShadow } : spec.dropShadow;
      const attrs = {};
      if (cfg.radius != null) attrs.shadowRadius = Number(cfg.radius);
      if (cfg.offsetX != null) attrs.shadowOffsetX = Number(cfg.offsetX);
      if (cfg.offsetY != null) attrs.shadowOffsetY = Number(cfg.offsetY);
      if (cfg.color != null) attrs.shadowColor = cfg.color;
      if (cfg.opacity != null) attrs.shadowOpacity = Number(cfg.opacity);
      const filterId = this.layer("dropShadowFilter", "Drop Shadow", attrs);
      try { api.connect(filterId, "id", id, "filters"); applied.push({ kind: "dropShadow", id: filterId }); } catch (e) { console.warn("_mg.filter: dropShadow connect failed: " + e); }
    }
    if (spec.noise) {
      const cfg = typeof spec.noise === "number" ? { grainAmount: spec.noise } : spec.noise;
      const attrs = {};
      if (cfg.amount != null) attrs.grainAmount = Number(cfg.amount);
      const filterId = this.layer("grainFilter", "Noise", attrs);
      try { api.connect(filterId, "id", id, "filters"); applied.push({ kind: "noise", id: filterId }); } catch (e) { console.warn("_mg.filter: noise connect failed: " + e); }
    }
    return { id: id, applied: applied };
  },

  /** Corner rounding on a shape generator (live attribute: generator.cornerRadius). */
  corner(id, radius) {
    this.set(id, { "generator.cornerRadius": Number(radius) || 0 });
    return { id: id, cornerRadius: Number(radius) || 0 };
  },

  /**
   * Video raster → Cavalry composition space.
   *
   * refclone measures elements in top-left, y-down pixel coordinates; Cavalry
   * positions layers from a centred origin with y up. Pure conversion: no scene
   * reads or writes, so a plan can be validated before anything changes.
   *
   *   _mg.fromRaster(x, y, compWidth, compHeight)
   *   _mg.fromRaster([x, y], compWidth, compHeight)
   *   _mg.fromRaster({ x, y }, compWidth, compHeight)
   */
  fromRaster(x, y, compWidth, compHeight) {
    let rx = x;
    let ry = y;
    let cw = compWidth;
    let ch = compHeight;
    if (x && typeof x === "object") {
      if (Array.isArray(x)) { rx = x[0]; ry = x[1]; }
      else { rx = x.x; ry = x.y; }
      cw = y;
      ch = compWidth;
    }
    const px = Number(rx);
    const py = Number(ry);
    if (!isFinite(px) || !isFinite(py)) throw new Error("_mg.fromRaster: x/y must be finite numbers");
    const width = Number(cw) > 0 ? Number(cw) : 1920;
    const height = Number(ch) > 0 ? Number(ch) : 1080;
    return { x: px - width / 2, y: height / 2 - py };
  },

  /**
   * Fit one layer's measured world bounds to a target box, synchronously.
   *
   * Geometry is resized intrinsically first — basicShape generator.dimensions
   * or generator.radius, textShape fontSize — then the residual is closed with
   * the layer's scale, so a rotated or unusual layer still converges. The
   * position is corrected from the freshly measured box after every resize,
   * never from assumed pivot maths: an uncentred pivot or an intrinsic text
   * offset is simply a delta. getBoundingBox is evaluated at the current
   * playhead, so callers fit static layout before animation is written.
   *
   * targetBox: {x,y,width,height} where x/y is the min corner of the box in
   * getBoundingBox's space (Cavalry-centred, y up), [x,y,width,height], or
   * {centre:{x,y},width,height}. options.space "raster" interprets the box as
   * top-left, y-down video pixels and needs compWidth/compHeight (or reads the
   * active comp resolution). layerId also accepts an "@alias" registered by
   * _mg.alias, a semantic id, or a slug; the resolved live id is reported.
   *
   * options: { space, compWidth, compHeight, tolerance=0.5, maxPasses=5,
   *            intrinsic=true, preserveAspect=false, fitWidth=true }
   * Returns { ok, layerId, type, space, target, box, passes, error, applied }.
   * A parented layer whose parent transform is not identity can need extra
   * passes: the same correction is applied and the residual is reported rather
   * than assumed away.
   */
  fitToBounds(layerId, targetBox, options) {
    const opts = options || {};
    const requested = String(layerId == null ? "" : layerId).trim();
    if (requested) {
      let hits = [];
      try { hits = this.find(requested); } catch (e) { hits = []; }
      if (hits.length) layerId = hits[0];
      else if (requested.charAt(0) === "@") throw new Error("_mg.fitToBounds: no layer matches alias " + requested);
    }
    const num = function (v, fallback) { const n = Number(v); return isFinite(n) ? n : fallback; };
    const readBox = function () {
      let bb = null;
      try { bb = api.getBoundingBox(layerId, true); } catch (e) { return null; }
      if (!bb || typeof bb !== "object") return null;
      const arr = Array.isArray(bb);
      const width = arr ? num(bb[2], 0) : num(bb.width != null ? bb.width : bb.w, 0);
      const height = arr ? num(bb[3], 0) : num(bb.height != null ? bb.height : bb.h, 0);
      const x = arr ? num(bb[0], 0) : num(bb.x, 0);
      const y = arr ? num(bb[1], 0) : num(bb.y, 0);
      if (!(width > 0) || !(height > 0)) return null;
      return { x: x, y: y, width: width, height: height };
    };
    const readPoint = function (path, fallback) {
      let v = null;
      try { v = api.get(layerId, path); } catch (e) { v = null; }
      if (Array.isArray(v)) return [num(v[0], fallback[0]), num(v[1], fallback[1])];
      if (v && typeof v === "object") return [num(v.x, fallback[0]), num(v.y, fallback[1])];
      return [fallback[0], fallback[1]];
    };
    const readAny = function (path) {
      try { return api.get(layerId, path); } catch (e) { return undefined; }
    };
    const writePoint = function (path, x, y) {
      const attrs = {};
      attrs[path] = [x, y];
      _mg.set(layerId, attrs);
    };
    const write = function (attrs) { _mg.set(layerId, attrs); };

    // ---- target box ------------------------------------------------------
    let spec = targetBox;
    if (Array.isArray(spec)) spec = { x: spec[0], y: spec[1], width: spec[2], height: spec[3] };
    if (!spec || typeof spec !== "object") {
      throw new Error("_mg.fitToBounds: targetBox must be {x,y,width,height} or [x,y,width,height]");
    }
    const tw = num(spec.width, 0);
    const th = num(spec.height, 0);
    if (!(tw > 0) || !(th > 0)) throw new Error("_mg.fitToBounds: targetBox needs positive width and height");
    let tx;
    let ty;
    if (spec.centre && typeof spec.centre === "object") {
      tx = num(spec.centre.x, 0) - tw / 2;
      ty = num(spec.centre.y, 0) - th / 2;
    } else if (spec.cx != null || spec.cy != null) {
      tx = num(spec.cx, 0) - tw / 2;
      ty = num(spec.cy, 0) - th / 2;
    } else {
      tx = num(spec.x, 0);
      ty = num(spec.y, 0);
    }
    const space = String(opts.space || "comp");
    if (space === "raster") {
      let cw = num(opts.compWidth, 0);
      let ch = num(opts.compHeight, 0);
      if (!(cw > 0) || !(ch > 0)) {
        let compId = null;
        try { compId = api.getActiveComp(); } catch (e) { compId = null; }
        let res = null;
        if (compId) { try { res = api.get(compId, "resolution"); } catch (e) { res = null; } }
        const rw = Array.isArray(res) ? num(res[0], 0) : (res && typeof res === "object" ? num(res.x != null ? res.x : res.width, 0) : 0);
        const rh = Array.isArray(res) ? num(res[1], 0) : (res && typeof res === "object" ? num(res.y != null ? res.y : res.height, 0) : 0);
        cw = cw > 0 ? cw : (rw > 0 ? rw : 1920);
        ch = ch > 0 ? ch : (rh > 0 ? rh : 1080);
      }
      // Raster y is the top edge and grows down; getBoundingBox y is the min
      // corner of the box and grows up.
      const rasterY = ty;
      tx = tx - cw / 2;
      ty = ch / 2 - rasterY - th;
    }

    const tolerance = opts.tolerance != null ? Math.max(0, num(opts.tolerance, 0.5)) : 0.5;
    let maxPasses = Math.round(num(opts.maxPasses, 5));
    maxPasses = Math.max(1, Math.min(10, maxPasses));
    const preserveAspect = opts.preserveAspect === true;
    const intrinsic = opts.intrinsic !== false;
    const fitWidth = opts.fitWidth !== false;

    let type = "";
    try { type = String(api.getLayerType(layerId) || ""); } catch (e) { type = ""; }
    let box = readBox();
    if (!box) throw new Error("_mg.fitToBounds: layer " + layerId + " has no measurable bounding box");
    const applied = { intrinsic: "none", scale: false, position: false };
    let passes = 0;
    let fits = false;
    for (; passes < maxPasses; passes++) {
      const errX = Math.abs(tx - box.x);
      const errY = Math.abs(ty - box.y);
      const errW = Math.abs(box.width - tw);
      const errH = Math.abs(box.height - th);
      if (errX <= tolerance && errY <= tolerance && (!fitWidth || errW <= tolerance) && errH <= tolerance) {
        fits = true;
        break;
      }

      if (passes === 0 && intrinsic) {
        const sx = tw / box.width;
        const sy = th / box.height;
        if (type === "textShape") {
          const size = num(readAny("fontSize"), 0);
          if (size > 0) {
            const ratio = preserveAspect ? Math.min(sx, sy) : sy;
            write({ fontSize: size * ratio });
            applied.intrinsic = "fontSize";
            box = readBox() || box;
          }
        } else {
          const dims = readAny("generator.dimensions");
          const radius = readAny("generator.radius");
          const dimW = Array.isArray(dims) ? num(dims[0], 0) : (dims && typeof dims === "object" ? num(dims.x != null ? dims.x : dims.width, 0) : 0);
          const dimH = Array.isArray(dims) ? num(dims[1], 0) : (dims && typeof dims === "object" ? num(dims.y != null ? dims.y : dims.height, 0) : 0);
          const radX = Array.isArray(radius) ? num(radius[0], 0) : (radius && typeof radius === "object" ? num(radius.x != null ? radius.x : radius.width, 0) : 0);
          const radY = Array.isArray(radius) ? num(radius[1], 0) : (radius && typeof radius === "object" ? num(radius.y != null ? radius.y : radius.height, 0) : (typeof radius === "number" ? radius : 0));
          const ux = preserveAspect ? Math.min(sx, sy) : sx;
          const uy = preserveAspect ? ux : sy;
          if (dimW > 0 && dimH > 0) {
            write({ "generator.dimensions": [dimW * ux, dimH * uy] });
            applied.intrinsic = "dimensions";
            box = readBox() || box;
          } else if (radX > 0 && radY > 0) {
            write({ "generator.radius": [radX * ux, radY * uy] });
            applied.intrinsic = "radius";
            box = readBox() || box;
          } else if (typeof radius === "number" && radius > 0) {
            const u = Math.min(sx, sy);
            write({ "generator.radius": radius * u });
            applied.intrinsic = "radius";
            box = readBox() || box;
          }
        }
      }

      // Residual after the intrinsic resize. A rotated layer's AABB does not
      // scale exactly linearly, so this runs on every pass and the loop above
      // decides when the residual is small enough.
      const scaleX = preserveAspect ? Math.min(tw / box.width, th / box.height) : tw / box.width;
      const scaleY = preserveAspect ? scaleX : th / box.height;
      if (Math.abs(scaleX - 1) > 0.0001 || Math.abs(scaleY - 1) > 0.0001) {
        const cur = readPoint("scale", [1, 1]);
        writePoint("scale", cur[0] * scaleX, cur[1] * scaleY);
        applied.scale = true;
        box = readBox() || box;
      }

      // Re-measured box → exact position delta. A stale box must never be used
      // for this: generator and scale edits move the box around the pivot.
      const pos = readPoint("position", [0, 0]);
      const dx = tx - box.x;
      const dy = ty - box.y;
      if (Math.abs(dx) > 0.0001 || Math.abs(dy) > 0.0001) {
        writePoint("position", pos[0] + dx, pos[1] + dy);
        applied.position = true;
        box = readBox() || box;
      }
    }
    // One last measurement when the loop exited by iteration count, so the
    // reported box is always the scene's current state.
    box = readBox() || box;
    const error = { x: tx - box.x, y: ty - box.y, width: box.width - tw, height: box.height - th };
    const ok =
      Math.abs(error.x) <= tolerance &&
      Math.abs(error.y) <= tolerance &&
      Math.abs(error.width) <= tolerance &&
      Math.abs(error.height) <= tolerance;
    return {
      ok: ok,
      layerId: layerId,
      type: type,
      space: space,
      target: { x: tx, y: ty, width: tw, height: th },
      box: box,
      passes: Math.max(1, passes),
      error: error,
      applied: applied
    };
  },

  selection() {
    return api.getSelection();
  },
  sel() {
    return api.getSelection()[0];
  }
};
`;

/** _mg legacy DSL + _rb rig builders, injected into one script scope. */
export const MG_HELPERS_SOURCE = `${MG_BASE_SOURCE}\n${RB_HELPERS_SOURCE}`;
