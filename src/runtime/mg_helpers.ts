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
  duplicator(shapeId, distType = "grid", count = [5, 5], size = [1200, 700], attrs = {}) {
    const linear = String(distType).indexOf("linear") === 0;
    const dupId = _rb.dup(shapeId, {
      distribution: linear ? "linear" : "grid",
      count,
      size,
      attrs: attrs || {}
    });
    return dupId;
  },
  kf(id, attr, framesAndValues, magicEase = "SpringOut") {
    return _rb.kf(id, attr, framesAndValues, magicEase);
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
