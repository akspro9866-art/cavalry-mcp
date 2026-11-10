/** Semantic addressing, patchSelected and syncToFrames. Verbatim chunk of the injected _mg DSL; mg_helpers.ts concatenates these in order. */
export const MG_SEMANTIC_SOURCE = String.raw`  __rememberPreset(presetId, tracked) {
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
`;
