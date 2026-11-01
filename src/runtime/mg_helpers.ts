import { RB_HELPERS_SOURCE } from "../presets/rig_builders.js";

/** JavaScript injected into Cavalry; this module is never executed by Node. */
const MG_BASE_SOURCE = String.raw`
const _mg = {
  comp(w = 1920, h = 1080, fps = 60, endFrame = 180, bgColor = "#0B0C10") {
    const id = api.getActiveComp();
    api.set(id, { "resolution.x": w, "resolution.y": h, fps, backgroundColor: bgColor });
    api.setInFrame(id, 0);
    api.setOutFrame(id, endFrame);
    return id;
  },
  set(id, attrs) {
    return _rb.set(id, attrs);
  },
  shape(type, name, attrs = {}) {
    const id = api.primitive(type, name);
    if (Object.keys(attrs).length) _rb.set(id, attrs);
    return id;
  },
  layer(type, name, attrs = {}) {
    const id = api.create(type, name);
    if (Object.keys(attrs).length) _rb.set(id, attrs);
    return id;
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
  wire(srcId, srcAttr, dstId, dstAttr) {
    return api.connect(srcId, srcAttr, dstId, dstAttr);
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
   * Two boundary keyframes plus a supported magic-easing curve.
   *
   * spec = { inFrame, outFrame, from, to, magicEasing?, easing?, bezier? }
   *   easing: { kind: "preset", name } or { kind: "bezier", handles }
   * A cubic-bezier without a matching preset resolves to the nearest accepted
   * Cavalry curve; "Custom" is never sent to api.magicEasing.
   * attr may be "position" or "scale" to drive both axes.
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
    const easing = spec.easing || null;
    let name = spec.magicEasing || (easing && easing.kind === "preset" ? easing.name : null);
    const handles = spec.bezier || (easing && easing.kind === "bezier" ? easing.handles : null);
    const resolved = name ? this.__easeName(name) : this.__nearestEase(handles);
    const attrs = attr === "position" || attr === "scale" ? [attr + ".x", attr + ".y"] : [attr];
    for (let i = 0; i < attrs.length; i++) {
      _rb.kf(id, attrs[i], [[inFrame, from], [outFrame, to]], resolved);
    }
    return { id: id, attrs: attrs, easing: resolved, inFrame: inFrame, outFrame: outFrame };
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
    const delay = Math.round(Number(spec.delayFrames == null ? 4 : spec.delayFrames));
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
    return { ids: list, attr: spec.attr, delayFrames: delay, applied: applied };
  },

  /**
   * In-place delta / absolute adjustment for existing layer ids. Never creates,
   * duplicates or recreates layers, so the composition and playhead are kept.
   *
   * spec = {
   *   target?: "<layerId>", ids?: string[],
   *   attrs?: { "position.x": 120 }, delta?: { "position.x": 4 },
   *   frame?: 42, shiftKeyframes?, easing?
   * }
   * With frame, values are written through api.keyframe at that frame so an
   * animated attribute is corrected where the render failed, not at the playhead.
   */
  patch(spec) {
    const list = Array.isArray(spec) ? spec : [spec];
    const results = [];
    for (let i = 0; i < list.length; i++) {
      const entry = list[i] || {};
      let targets;
      if (Array.isArray(entry.ids) && entry.ids.length) targets = entry.ids.slice();
      else if (entry.target != null) targets = [String(entry.target)];
      else targets = this.__patchTargets(entry);
      const frame = entry.frame == null ? null : Math.round(Number(entry.frame));
      const changes = [];
      for (let t = 0; t < targets.length; t++) {
        const id = targets[t];
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
        if (Object.keys(attrs).length) {
          if (frame != null && isFinite(frame)) this.patchKeyframeSafe(id, attrs, frame);
          else this.set(id, attrs);
          changes.push({ id: id, attrs: attrs, frame: frame });
        }
        if (entry.shiftKeyframes != null || entry.easing != null) {
          this.patchSelected({ ids: [id], shiftKeyframes: entry.shiftKeyframes, easing: entry.easing });
        }
      }
      results.push({ patched: changes.length, changes: changes });
    }
    return results.length === 1 ? results[0] : results;
  },

  /**
   * Build an editable vector layer from a VTracer SVG file (verified asset route)
   * or an inline path d (cavalry.Path + api.createEditable). Parent, position
   * and scale are applied to the created layer; the composition is untouched.
   *
   * spec = { path?, d?, name?, pos?: {x,y}, scale? }
   */
  svg(parent, spec) {
    spec = spec || {};
    let id = null;
    if (spec.path) {
      const asset = api.loadAsset(String(spec.path), false);
      id = api.addAssetToComp(asset);
    } else if (spec.d != null) {
      if (typeof api.createEditable !== "function") {
        throw new Error("_mg.svg: this Cavalry build has no api.createEditable; pass spec.path so the verified SVG asset route can run");
      }
      id = api.createEditable(this.__svgPath(spec.d), spec.name || "Vector");
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
    return id;
  },

  /** Parse the SVG path subset VTracer emits into a cavalry.Path. */
  __svgPath(d) {
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
    const num = () => Number(tokens[i++]);
    while (i < tokens.length) {
      if (/^[a-zA-Z]$/.test(tokens[i])) {
        cmd = tokens[i];
        i++;
        if (cmd === "Z" || cmd === "z") {
          if (typeof path.closePath === "function") path.closePath();
          else if (typeof path.close === "function") path.close();
          x = startX; y = startY;
          continue;
        }
      }
      const upper = cmd.toUpperCase();
      const rel = cmd !== upper;
      if (upper === "M" || upper === "L") {
        const nx = num(), ny = num();
        x = rel ? x + nx : nx;
        y = rel ? y + ny : ny;
        if (upper === "M") { startX = x; startY = y; path.moveTo(x, y); cmd = rel ? "l" : "L"; }
        else path.lineTo(x, y);
      } else if (upper === "H") {
        const nx = num();
        x = rel ? x + nx : nx;
        path.lineTo(x, y);
      } else if (upper === "V") {
        const ny = num();
        y = rel ? y + ny : ny;
        path.lineTo(x, y);
      } else if (upper === "C") {
        const x1 = rel ? x + num() : num();
        const y1 = rel ? y + num() : num();
        const x2 = rel ? x + num() : num();
        const y2 = rel ? y + num() : num();
        const nx = rel ? x + num() : num();
        const ny = rel ? y + num() : num();
        if (typeof path.curveTo !== "function") throw new Error("_mg.svg: cavalry.Path has no curveTo in this build");
        path.curveTo(x1, y1, x2, y2, nx, ny);
        x = nx; y = ny;
      } else if (upper === "Q") {
        const qx = rel ? x + num() : num();
        const qy = rel ? y + num() : num();
        const nx = rel ? x + num() : num();
        const ny = rel ? y + num() : num();
        if (typeof path.quadTo === "function") path.quadTo(qx, qy, nx, ny);
        else if (typeof path.curveTo === "function") path.curveTo(qx, qy, nx, ny, nx, ny);
        else throw new Error("_mg.svg: cavalry.Path has no quadratic/curve support in this build");
        x = nx; y = ny;
      } else {
        i++;
      }
    }
    return path;
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
      let rest = 0;
      try { rest = Number(api.get(target, attr)); } catch (e) { rest = 0; }
      if (!isFinite(rest)) rest = 0;
      const duration = Math.max(6, Math.round(config.duration == null ? 45 : Number(config.duration)));
      const startFrame = Math.round(config.startFrame == null ? 0 : Number(config.startFrame));
      const unit = /scale/i.test(attr);
      const fallbackAmplitude = unit ? 0.15 : (/opacity/i.test(attr) ? 20 : 40);
      const amplitude = Number(config.amplitude != null ? config.amplitude : (config.distance != null ? config.distance : fallbackAmplitude));
      const damping = config.damping == null ? 6 : Number(config.damping);
      const frequency = config.frequency == null ? 2.25 : Number(config.frequency);
      let samples = Math.max(4, Math.min(24, Math.round(duration / 2)));
      if (samples > duration) samples = duration;
      const points = [];
      for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        const decay = Math.exp(-damping * t);
        const value = rest + amplitude * decay * Math.cos(Math.PI * 2 * frequency * t);
        points.push([startFrame + Math.round(t * duration), Math.round(value * 1000) / 1000]);
      }
      points[samples][1] = rest;
      _rb.kf(target, attr, points, "None");
      return {
        type: "spring",
        target: target,
        attrs: [attr],
        node: null,
        keyframes: points.length,
        duration: duration,
        amplitude: amplitude,
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
      const falloff = _rb.layer("falloff", name + " Falloff", falloffAttrs);
      const staggerAttrs = { offset: offset };
      if (staggerCfg.strength != null) staggerAttrs.strength = staggerCfg.strength;
      if (staggerCfg.minimum != null) staggerAttrs.minimum = staggerCfg.minimum;
      if (staggerCfg.maximum != null) staggerAttrs.maximum = staggerCfg.maximum;
      const stagger = _rb.layer("stagger", name + " Stagger", staggerAttrs);
      api.connect(stagger, "id", target, attr);
      api.connect(falloff, "id", stagger, "falloffs");
      return {
        type: "staggerFalloff",
        target: target,
        attrs: [attr],
        falloff: falloff,
        stagger: stagger,
        offset: offset,
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

    for (let i = 0; i < attrList.length; i++) {
      const attr = attrList[i];
      const unit = /scale|opacity/i.test(attr);
      const fallback = unit ? (/opacity/i.test(attr) ? 18 : 0.12) : 30;
      const amplitude = Number(config.amplitude != null ? config.amplitude : (config.strength != null ? config.strength : fallback));
      amplitudeUsed = amplitude;
      let node;
      if (type === "oscillator") {
        const attrs = { strength: amplitude, frequency: frequency, timeScale: timeScale };
        if (config.trigType != null) attrs.trigType = config.trigType;
        if (config.waveType != null) attrs.waveType = config.waveType;
        if (config.offset != null) attrs.offset = config.offset;
        if (config.stagger != null) attrs.stagger = config.stagger;
        node = _rb.layer("oscillator", name + " " + attr, attrs);
      } else {
        const attrs = {
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
        node = _rb.layer("noise", name + " " + attr, attrs);
      }
      api.connect(node, "id", target, attr);
      nodes.push(node);
    }

    return {
      type: type,
      target: target,
      attrs: attrList,
      nodes: nodes,
      amplitude: amplitudeUsed,
      frequency: frequency,
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

  presetRoots() {
    try {
      return globalThis.__mgPresetRoots || null;
    } catch (e) {
      return null;
    }
  },

  /** Expand explicit ids, the live selection, or the last preset's roots. */
  __patchTargets(spec) {
    spec = spec || {};
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
    for (let k = 0; k < keys.length; k++) guards[keys[k]] = this.__kfGuardSnapshot(id, keys[k]);
    try {
      for (let k = 0; k < keys.length; k++) this.__kfWrite(id, keys[k], Math.round(Number(frame)), attrs[keys[k]], null);
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
