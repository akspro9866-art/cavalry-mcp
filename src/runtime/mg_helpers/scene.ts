/** Scene, layer, alias, text, wire and duplicator builders. Verbatim chunk of the injected _mg DSL; mg_helpers.ts concatenates these in order. */
export const MG_SCENE_SOURCE = String.raw`
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
`;
