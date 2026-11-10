/** In-place attribute patching with delta/multiply semantics. Verbatim chunk of the injected _mg DSL; mg_helpers.ts concatenates these in order. */
export const MG_PATCH_SOURCE = String.raw`  patch(spec) {
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
`;
