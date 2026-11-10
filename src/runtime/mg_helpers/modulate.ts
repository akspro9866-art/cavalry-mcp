/** Modifier routing (noise/oscillator/spring/stagger) and connectDynamic. Verbatim chunk of the injected _mg DSL; mg_helpers.ts concatenates these in order. */
export const MG_MODULATE_SOURCE = String.raw`  modulate(layerId, attrPath, config) {
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
`;
