/** Tangent-safe keyframe writes, undoGroup and refclone macros. Verbatim chunk of the injected _mg DSL; mg_helpers.ts concatenates these in order. */
export const MG_KEYFRAMES_SOURCE = String.raw`  __kfWrite(id, attr, frame, value, handles) {
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
`;
