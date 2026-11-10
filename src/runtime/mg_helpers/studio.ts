/** Studio shorthands: trim, mask, blend, typography, filter, corner. Verbatim chunk of the injected _mg DSL; mg_helpers.ts concatenates these in order. */
export const MG_STUDIO_SOURCE = String.raw`  trim(id, spec) {
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
`;
