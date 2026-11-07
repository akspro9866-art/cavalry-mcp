/**
 * Headless Cavalry 2.8 API + Stallion loopback for tests and CI.
 *
 * The mock models the parts of Cavalry the bridge touches: layers attached to
 * comps, attributes, keyframes, expressions, connections, the Scene Palette,
 * render-queue calls, world-space bounding boxes and filesystem writes. It is
 * plain ESM JavaScript so the CI matrix can load it on every supported Node
 * version without a TypeScript build step.
 *
 * `startMockStallion` executes the same wrapper a real Stallion would run and
 * serves seq-matched results over GET /get (native) or the legacy result file.
 */
import vm from "node:vm";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_COMP = "comp#1";
const COMP_DEFAULTS = {
  fps: 60,
  resolution: { x: 1920, y: 1080 },
  startFrame: 0,
  // The legacy filmstrip defaults to the comp out-frame; the historical mock
  // contract (and its tests) use a 60-frame comp.
  endFrame: 60,
  backgroundColor: "#000000",
};

export function createMockApiState() {
  return {
    layers: new Map(),
    keyframes: [],
    easings: [],
    // Per-keyframe tangent/velocity state, keyed `${layerId}|${attr}|${frame}`.
    // Mirrors the live setKeyframeVelocity / modifyKeyframeTangent contract.
    tangents: {},
    keyframeSelection: [],
    selection: [],
    order: [],
    expressions: new Map(),
    connections: [],
    parents: new Map(),
    comps: [{ id: DEFAULT_COMP, name: "Comp 1", attrs: { ...COMP_DEFAULTS } }],
    activeComp: DEFAULT_COMP,
    compAttrs: { ...COMP_DEFAULTS },
    frame: 0,
    markers: [],
    renderQueue: [],
    assets: [],
    paletteId: null,
  };
}

function layerOf(state, id) {
  const layer = state.layers.get(id);
  if (!layer) throw new Error(`layer ${id} not found`);
  return layer;
}

function compOf(state, id) {
  return state.comps.find((comp) => comp.id === id) ?? null;
}

function positionOf(layer) {
  const attrs = layer.attrs ?? {};
  if (Array.isArray(attrs.position)) {
    return { x: Number(attrs.position[0]) || 0, y: Number(attrs.position[1]) || 0 };
  }
  if (attrs.position && typeof attrs.position === "object") {
    return { x: Number(attrs.position.x) || 0, y: Number(attrs.position.y) || 0 };
  }
  return {
    x: Number(attrs["position.x"]) || 0,
    y: Number(attrs["position.y"]) || 0,
  };
}

function sizeOf(layer) {
  const attrs = layer.attrs ?? {};
  const scale = Array.isArray(attrs.scale)
    ? [Number(attrs.scale[0]) || 1, Number(attrs.scale[1]) || 1]
    : [Number(attrs["scale.x"]) || 1, Number(attrs["scale.y"]) || 1];
  let width = 100;
  let height = 100;
  const dims = attrs["generator.dimensions"];
  if (Array.isArray(dims)) {
    width = Number(dims[0]) || width;
    height = Number(dims[1]) || height;
  } else if (dims && typeof dims === "object") {
    width = Number(dims.x) || width;
    height = Number(dims.y) || height;
  }
  const radius = attrs["generator.radius"];
  if (Array.isArray(radius)) {
    width = (Number(radius[0]) || width / 2) * 2;
    height = (Number(radius[1]) || height / 2) * 2;
  } else if (typeof radius === "number") {
    width = radius * 2;
    height = radius * 2;
  }
  if (layer.type === "textShape") {
    const text = String(attrs.text ?? layer.name ?? "");
    const fontSize = Number(attrs.fontSize) || 60;
    width = Math.max(fontSize * 0.6 * Math.max(1, text.length), fontSize);
    height = fontSize * 1.2;
  }
  return { width: Math.abs(width * scale[0]), height: Math.abs(height * scale[1]) };
}

/** Linear interpolation of (id, attr) keyframes at the current playhead. */
function evalKeyframes(state, id, attr) {
  const kfs = state.keyframes
    .filter((k) => k.layerId === id && attr in k.attributes)
    .sort((a, b) => a.frame - b.frame);
  if (!kfs.length) return { found: false, value: undefined };
  const f = state.frame;
  if (f <= kfs[0].frame) return { found: true, value: kfs[0].attributes[attr] };
  if (f >= kfs[kfs.length - 1].frame) return { found: true, value: kfs[kfs.length - 1].attributes[attr] };
  for (let i = 0; i < kfs.length - 1; i++) {
    if (f >= kfs[i].frame && f <= kfs[i + 1].frame) {
      const va = Number(kfs[i].attributes[attr]);
      const vb = Number(kfs[i + 1].attributes[attr]);
      if (Number.isFinite(va) && Number.isFinite(vb)) {
        const t = (f - kfs[i].frame) / (kfs[i + 1].frame - kfs[i].frame || 1);
        return { found: true, value: va + (vb - va) * t };
      }
      return {
        found: true,
        value: f - kfs[i].frame <= kfs[i + 1].frame - f ? kfs[i].attributes[attr] : kfs[i + 1].attributes[attr],
      };
    }
  }
  return { found: false, value: undefined };
}

function readAttr(state, id, attr) {
  if (id.startsWith("comp#") || compOf(state, id)) {
    const comp = compOf(state, id);
    const attrs = comp?.attrs ?? (id === DEFAULT_COMP ? state.compAttrs : null);
    if (!attrs) throw new Error(`attribute ${attr} not found on ${id}`);
    if (attr in attrs) return attrs[attr];
    if (attr.includes(".")) {
      let value = attrs;
      for (const part of attr.split(".")) {
        if (value == null || typeof value !== "object" || !(part in value)) {
          value = undefined;
          break;
        }
        value = value[part];
      }
      if (value !== undefined) return value;
    }
    throw new Error(`attribute ${attr} not found on ${id}`);
  }
  const layer = layerOf(state, id);
  if (attr === "name") return layer.name;
  const attrs = layer.attrs ?? {};
  // Cavalry's api.get returns the value evaluated at the playhead, so
  // keyframes win over any stale static value and interpolate linearly
  // between their neighbours.
  const evaluated = evalKeyframes(state, id, attr);
  if (evaluated.found) return evaluated.value;
  // Compounds compose from animated axes: position.x keyframes surface
  // through a position read too, like the real evaluation does.
  if (attr === "position" || attr === "scale") {
    const isPosition = attr === "position";
    const base = isPosition
      ? positionOf(layer)
      : Array.isArray(attrs.scale)
        ? attrs.scale
        : [Number(attrs["scale.x"]) || 1, Number(attrs["scale.y"]) || 1];
    const axisNames = isPosition ? ["position.x", "position.y"] : ["scale.x", "scale.y"];
    const fallbacks = isPosition ? [base.x, base.y] : [base[0], base[1]];
    const x = evalKeyframes(state, id, axisNames[0]);
    const y = evalKeyframes(state, id, axisNames[1]);
    if (x.found || y.found) return [x.found ? Number(x.value) : fallbacks[0], y.found ? Number(y.value) : fallbacks[1]];
  }
  if (attr in attrs) return attrs[attr];
  if (attr.includes(".")) {
    let value = attrs;
    for (const part of attr.split(".")) {
      if (value == null || typeof value !== "object" || !(part in value)) {
        value = undefined;
        break;
      }
      value = value[part];
    }
    if (value !== undefined) return value;
  }
  const pos = positionOf(layer);
  const scale = Array.isArray(attrs.scale)
    ? attrs.scale
    : [Number(attrs["scale.x"]) || 1, Number(attrs["scale.y"]) || 1];
  const defaults = {
    "position.x": pos.x,
    "position.y": pos.y,
    position: [pos.x, pos.y],
    "scale.x": scale[0],
    "scale.y": scale[1],
    scale,
    opacity: 100,
    rotation: 0,
    visible: true,
    hidden: false,
    inFrame: 0,
    outFrame: 180,
    "material.alpha": 255,
  };
  if (attr in defaults) return defaults[attr];
  throw new Error(`attribute ${attr} not found on ${id}`);
}

function writeAttr(state, id, attr, value) {
  const target = id.startsWith("comp#") && compOf(state, id)
    ? compOf(state, id).attrs
    : layerOf(state, id).attrs;
  target[attr] = value;
  if (attr === "position" && Array.isArray(value)) {
    target["position.x"] = value[0];
    target["position.y"] = value[1];
  } else if (attr === "position.x") {
    target.position = [Number(value) || 0, positionOf(layerOf(state, id)).y];
  } else if (attr === "position.y") {
    target.position = [positionOf(layerOf(state, id)).x, Number(value) || 0];
  } else if (attr === "scale" && Array.isArray(value)) {
    target["scale.x"] = value[0];
    target["scale.y"] = value[1];
  } else if (attr === "scale.x") {
    target.scale = [Number(value) || 1, Number(target["scale.y"]) || 1];
  } else if (attr === "scale.y") {
    target.scale = [Number(target["scale.x"]) || 1, Number(value) || 1];
  }
  if (id === DEFAULT_COMP) Object.assign(state.compAttrs, target);
}

function paletteId(state) {
  if (state.paletteId && state.layers.has(state.paletteId)) return state.paletteId;
  const id = `colorArray#${state.layers.size + 1}`;
  state.layers.set(id, {
    type: "colorArray",
    name: "Scene Palette",
    compId: state.activeComp,
    attrs: {},
  });
  state.paletteId = id;
  return id;
}

export function buildMockApi(state, hooks = {}) {
  let next = 0;
  const nextId = (type) => {
    let id = `${type}#${++next}`;
    while (state.layers.has(id)) id = `${type}#${++next}`;
    return id;
  };
  const api = {
    create(type, name) {
      const id = nextId(type);
      state.layers.set(id, {
        type,
        name: name ?? id,
        compId: state.activeComp,
        attrs: {},
      });
      return id;
    },
    primitive(type, name) {
      // Cavalry's api.primitive always creates a basicShape layer whose
      // generator is configured from `type`; the id prefix is basicShape#N.
      const id = api.create("basicShape", name ?? type);
      state.layers.get(id).attrs["generator.type"] = type;
      return id;
    },
    startUndoGroup(name) {
      state.order.push(`startUndo:${name}`);
    },
    endUndoGroup() {
      state.order.push("endUndo");
    },
    get(id, attr) {
      return readAttr(state, id, attr);
    },
    set(id, attrs) {
      for (const [key, value] of Object.entries(attrs ?? {})) writeAttr(state, id, key, value);
      return true;
    },
    connect(sourceId, sourceAttr, targetId, targetAttr, force) {
      layerOf(state, sourceId);
      layerOf(state, targetId);
      state.connections.push({ sourceId, sourceAttr, targetId, targetAttr });
      state.order.push(`connect:${sourceId}.${sourceAttr}->${targetId}.${targetAttr}${force ? "!" : ""}`);
      return true;
    },
    disconnect(sourceId, sourceAttr, targetId, targetAttr) {
      state.connections = state.connections.filter(
        (c) => !(c.sourceId === sourceId && c.sourceAttr === sourceAttr && c.targetId === targetId && c.targetAttr === targetAttr),
      );
    },
    setGenerator(id, attr, generatorType) {
      layerOf(state, id);
      state.order.push(`setGenerator:${id}:${attr}:${generatorType}`);
      return true;
    },
    getGenerators(id) {
      layerOf(state, id);
      return ["generator"];
    },
    getCurrentGeneratorType(id) {
      layerOf(state, id);
      return state.layers.get(id)?.attrs["generator.type"] ?? null;
    },
    addDynamic(id, name, type) {
      layerOf(state, id);
      state.order.push(`addDynamic:${id}:${name}:${type}`);
      return true;
    },
    addArrayIndex(id, attr) {
      layerOf(state, id);
      const count = Number(state.layers.get(id).attrs[`${attr}.count`]) || 0;
      state.layers.get(id).attrs[`${attr}.count`] = count + 1;
      return count;
    },
    removeArrayIndex(id, attr) {
      layerOf(state, id);
      const count = Math.max(0, (Number(state.layers.get(id).attrs[`${attr}.count`]) || 1) - 1);
      state.layers.get(id).attrs[`${attr}.count`] = count;
    },
    getArrayCount(id, attr) {
      layerOf(state, id);
      return Number(state.layers.get(id).attrs[`${attr}.count`]) || 0;
    },
    getAttributes(id) {
      if (compOf(state, id)) return Object.keys(compOf(state, id).attrs ?? {});
      return Object.keys(layerOf(state, id).attrs);
    },
    getAttributeDefinition(id) {
      layerOf(state, id);
      return { attrId: "mock", type: "mock" };
    },
    getAnimatedAttributes(id) {
      layerOf(state, id);
      return [...new Set(state.keyframes.filter((k) => k.layerId === id).flatMap((k) => Object.keys(k.attributes)))];
    },
    getKeyframeTimes(id, attr) {
      layerOf(state, id);
      // One time per keyframe: re-keying a frame that already has a key replaces
      // its value rather than adding a second key there, so the readback is a set
      // of frames even though state.keyframes keeps every write for assertions.
      return [...new Set(
        state.keyframes
          .filter((k) => k.layerId === id && attr in k.attributes)
          .map((k) => k.frame),
      )].sort((a, b) => a - b);
    },
    keyframe(id, frame, attributes) {
      layerOf(state, id);
      state.keyframes.push({ layerId: id, frame, attributes: { ...attributes } });
      return `kf#${state.keyframes.length}`;
    },
    modifyKeyframe(id, dictionary) {
      layerOf(state, id);
      for (const [attr, spec] of Object.entries(dictionary ?? {})) {
        if (!spec || typeof spec !== "object") continue;
        const frame = Number(spec.frame);
        const kf = state.keyframes.find((k) => k.layerId === id && k.frame === frame && attr in k.attributes);
        if (!kf) continue;
        if (spec.newFrame != null) kf.frame = Number(spec.newFrame);
        if (spec.newValue !== undefined) kf.attributes[attr] = spec.newValue;
        if (spec.type != null) {
          const key = `${id}|${attr}|${frame}`;
          state.tangents[key] = { ...(state.tangents[key] ?? {}), type: Number(spec.type) };
        }
      }
    },
    magicEasing(id, attrPath, frame, name, expression) {
      layerOf(state, id);
      // Cavalry only reads `expression` for "Custom" (and tolerates it with
      // "None"), so the mock records whatever arrived and lets the assertions
      // decide whether the compiler passed it through.
      state.easings.push({ layerId: id, attrPath, frame, name, expression: expression ?? null });
      return true;
    },
    getMagicEasing(id, attrPath, frame) {
      const found = state.easings.find((e) => e.layerId === id && e.attrPath === attrPath && e.frame === frame);
      return found ? { easingName: found.name, expression: found.expression ?? "" } : null;
    },
    deleteKeyframe(id, attr, frame) {
      layerOf(state, id);
      const before = state.keyframes.length;
      state.keyframes = state.keyframes.filter(
        (k) => !(k.layerId === id && k.frame === frame && attr in k.attributes),
      );
      if (state.keyframes.length === before) throw new Error(`no keyframe at frame ${frame} for ${attr}`);
    },
    deleteAnimation(id, attr) {
      layerOf(state, id);
      state.keyframes = state.keyframes.filter((k) => !(k.layerId === id && attr in k.attributes));
    },
    setKeyframeVelocity(id, dict) {
      layerOf(state, id);
      for (const [attr, spec] of Object.entries(dict ?? {})) {
        const frame = Number(spec?.frame);
        if (!Number.isFinite(frame)) continue;
        state.tangents[`${id}|${attr}|${frame}`] = {
          ...(state.tangents[`${id}|${attr}|${frame}`] ?? {}),
          velocity: { ...spec },
        };
      }
      state.order.push(`setKeyframeVelocity:${id}:${JSON.stringify(dict)}`);
    },
    clearKeyframeVelocity(id, dict) {
      layerOf(state, id);
      for (const [attr, spec] of Object.entries(dict ?? {})) {
        const key = `${id}|${attr}|${Number(spec?.frame)}`;
        if (state.tangents[key]) delete state.tangents[key].velocity;
      }
      state.order.push(`clearKeyframeVelocity:${id}:${JSON.stringify(dict)}`);
    },
    modifyKeyframeTangent(id, dictionary) {
      layerOf(state, id);
      for (const [attr, spec] of Object.entries(dictionary ?? {})) {
        if (!spec || typeof spec !== "object") continue;
        const frame = Number(spec.frame);
        if (!Number.isFinite(frame)) continue;
        const key = `${id}|${attr}|${frame}`;
        const current = state.tangents[key] ?? { inAngle: 0, inWeight: null, outAngle: 0, outWeight: null };
        const both = spec.inHandle !== false && spec.outHandle !== false;
        const touchIn = both || spec.inHandle === true;
        const touchOut = both || spec.outHandle === true;
        if (spec.angle != null) {
          if (touchIn) current.inAngle = Number(spec.angle);
          if (touchOut) current.outAngle = Number(spec.angle);
        }
        if (spec.weight != null) {
          if (touchIn) current.inWeight = Number(spec.weight);
          if (touchOut) current.outWeight = Number(spec.weight);
        }
        current.type = 0;
        state.tangents[key] = current;
      }
    },
    getKeyframeIdsForAttribute(id, attr) {
      layerOf(state, id);
      return state.keyframes
        .map((k, index) => ({ k, index }))
        .filter(({ k }) => k.layerId === id && attr in k.attributes)
        .map(({ index }) => `kf#${index + 1}`);
    },
    getSelectedKeyframeIds() {
      return [...state.keyframeSelection];
    },
    setSelectedKeyframeIds(ids) {
      state.keyframeSelection = (ids ?? []).map(String);
    },
    getSelectedKeyframes() {
      // Keyframe-id selection (set via setSelectedKeyframeIds) returns the
      // per-keyframe detail the tangent guard reads back.
      if (state.keyframeSelection.length) {
        const detail = {};
        for (const kfId of state.keyframeSelection) {
          const index = Number(String(kfId).replace(/^kf#/, "")) - 1;
          const kf = state.keyframes[index];
          if (!kf) continue;
          for (const attr of Object.keys(kf.attributes)) {
            detail[`${kf.layerId}:${attr}:${kf.frame}`] = {
              layerId: kf.layerId,
              attr,
              frame: kf.frame,
              ...(state.tangents[`${kf.layerId}|${attr}|${kf.frame}`] ?? {}),
            };
          }
        }
        return detail;
      }
      const byLayer = {};
      for (const id of state.selection) {
        const attrs = {};
        for (const kf of state.keyframes) {
          if (kf.layerId !== id) continue;
          for (const attr of Object.keys(kf.attributes)) {
            (attrs[attr] ??= []).push(kf.frame);
          }
        }
        byLayer[id] = attrs;
      }
      return byLayer;
    },
    getInConnectedAttributes(id) {
      layerOf(state, id);
      return [...new Set(state.connections.filter((c) => c.targetId === id).map((c) => c.targetAttr))];
    },
    getInConnection(id, attr) {
      layerOf(state, id);
      const connection = state.connections.find((c) => c.targetId === id && c.targetAttr === attr);
      return connection ? `${connection.sourceId}.${connection.sourceAttr}` : "";
    },
    getOutConnections(id, attr) {
      layerOf(state, id);
      return state.connections
        .filter((c) => c.sourceId === id && (attr == null || c.sourceAttr === attr))
        .map((c) => `${c.targetId}.${c.targetAttr}`);
    },
    setAttributeExpression(id, attr, expression) {
      layerOf(state, id);
      state.expressions.set(`${id}:${attr}`, expression);
    },
    getAttributeExpression(id, attr) {
      layerOf(state, id);
      return state.expressions.get(`${id}:${attr}`) ?? "";
    },
    hasAttributeExpression(id, attr) {
      layerOf(state, id);
      return state.expressions.has(`${id}:${attr}`);
    },
    setGradientFromColors(id, attr, colors) {
      layerOf(state, id);
      layerOf(state, id).attrs[attr] = [...colors];
      state.order.push(`setGradientFromColors:${id}:${attr}:${colors.length}`);
    },
    generateHarmoniousPalette(baseColor, count) {
      return Array.from({ length: count }, (_, i) => (i === 0 ? baseColor : `${baseColor}${i}`));
    },
    bringForward() {
      if (!state.selection.length) throw new Error("no selection");
      state.order.push(`bringForward:${state.selection.join(",")}`);
    },
    bringToFront() {
      if (!state.selection.length) throw new Error("no selection");
      state.order.push(`bringToFront:${state.selection.join(",")}`);
    },
    moveBackward() {
      if (!state.selection.length) throw new Error("no selection");
      state.order.push(`moveBackward:${state.selection.join(",")}`);
    },
    moveToBack() {
      if (!state.selection.length) throw new Error("no selection");
      state.order.push(`moveToBack:${state.selection.join(",")}`);
    },
    createComp(name, attrs) {
      let id = `comp#${state.comps.length + 1}`;
      while (compOf(state, id)) id = `comp#${state.comps.length + 2}`;
      state.comps.push({ id, name, attrs: { ...COMP_DEFAULTS, ...(attrs ?? {}) } });
      return id;
    },
    getComps() {
      return state.comps.map((c) => c.id);
    },
    setActiveComp(compId) {
      if (!compOf(state, compId)) throw new Error(`comp ${compId} not found`);
      state.activeComp = compId;
    },
    getCompLayers(topLevel) {
      const ids = [...state.layers.entries()]
        .filter(([, layer]) => (layer.compId ?? state.activeComp) === state.activeComp)
        .map(([id]) => id);
      if (!topLevel) return ids;
      return ids.filter((id) => !state.parents.has(id));
    },
    getCompLayersOfType(topLevel, type) {
      return api.getCompLayers(topLevel).filter((id) => state.layers.get(id)?.type === type);
    },
    getChildren(layerId) {
      if (layerId) layerOf(state, layerId);
      return [...state.layers.keys()].filter((id) => {
        const inComp = (state.layers.get(id).compId ?? state.activeComp) === state.activeComp;
        if (!inComp) return false;
        return layerId ? state.parents.get(id) === layerId : !state.parents.has(id);
      });
    },
    preCompose(name) {
      if (!state.selection.length) throw new Error("no selection");
      const compId = api.createComp(name ?? "Pre-comp", {});
      const refId = nextId("compReference");
      state.layers.set(refId, { type: "compReference", name: name ?? "Pre-comp", compId: state.activeComp, attrs: {} });
      state.order.push(`preCompose:${state.selection.join(",")}:${compId}`);
      return refId;
    },
    newScene() {
      state.layers.clear();
      state.keyframes = [];
      state.easings = [];
      state.connections = [];
      state.expressions.clear();
      state.parents.clear();
      state.selection = [];
      state.comps = [{ id: DEFAULT_COMP, name: "Comp 1", attrs: { ...COMP_DEFAULTS } }];
      state.activeComp = DEFAULT_COMP;
      state.compAttrs = { ...COMP_DEFAULTS };
      state.frame = 0;
      state.paletteId = null;
      state.order.push("newScene");
    },
    resetTransform(id) {
      layerOf(state, id);
      state.order.push(`resetTransform:${id}`);
    },
    freezeTransform(id) {
      layerOf(state, id);
      state.order.push(`freezeTransform:${id}`);
    },
    centrePivot(id, doCentroid) {
      layerOf(state, id);
      state.order.push(`centrePivot:${id}:${doCentroid}`);
    },
    getAllLayerTypes(includeExperimental) {
      const types = [
        { type: "basicShape", name: "Basic Shape" },
        { type: "textShape", name: "Text Shape" },
        { type: "linearGradient", name: "Linear Gradient" },
        { type: "noiseDeformer", name: "Noise Deformer" },
        { type: "oscillator", name: "Oscillator" },
        { type: "noise", name: "Noise" },
        { type: "falloff", name: "Falloff" },
        { type: "valueBlend", name: "Value Blend" },
        { type: "connectShape", name: "Connect Shape" },
        { type: "meshDistribution", name: "Mesh Distribution" },
        { type: "colorArray", name: "Color Array" },
        { type: "null", name: "Null" },
        { type: "duplicator", name: "Duplicator" },
      ];
      if (includeExperimental) types.push({ type: "experimentalThing", name: "Experimental Thing" });
      return types;
    },
    play() {
      state.order.push("play");
    },
    stop() {
      state.order.push("stop");
    },
    getCavalryVersion() {
      return "2.8.0";
    },
    getSceneFilePath() {
      return "C:/mock/scene.cv";
    },
    sceneHasUnsavedChanges() {
      return false;
    },
    getActiveComp() {
      return state.activeComp;
    },
    getLayerType(id) {
      return state.layers.get(id)?.type ?? null;
    },
    getNiceName(id) {
      if (compOf(state, id)) return compOf(state, id).name;
      return state.layers.get(id)?.name ?? null;
    },
    getAllSceneLayers() {
      return [...state.layers.keys()];
    },
    getSelection() {
      return [...state.selection];
    },
    select(ids) {
      state.selection = [...ids];
    },
    deleteLayer(id) {
      state.layers.delete(id);
      state.parents.delete(id);
      state.selection = state.selection.filter((s) => s !== id);
    },
    layerExists(id) {
      return state.layers.has(id);
    },
    rename(id, name) {
      layerOf(state, id).name = name;
    },
    duplicate(id) {
      const source = layerOf(state, id);
      const newId = nextId(source.type);
      state.layers.set(newId, {
        type: source.type,
        name: `${source.name} copy`,
        compId: source.compId ?? state.activeComp,
        attrs: { ...source.attrs },
      });
      return newId;
    },
    duplicateSelection() {
      if (state.selection.length !== 1) throw new Error("no single selection");
      return api.duplicate(state.selection[0]);
    },
    parent(id, parentId) {
      layerOf(state, id);
      layerOf(state, parentId);
      state.parents.set(id, parentId);
      state.order.push(`parent:${id}->${parentId}`);
    },
    unParent(id) {
      layerOf(state, id);
      state.parents.delete(id);
      state.order.push(`unparent:${id}`);
    },
    getParent(id) {
      return state.parents.get(id) ?? "";
    },
    reorder(id, underId) {
      layerOf(state, id);
      layerOf(state, underId);
      state.order.push(`reorder:${id}:${underId}`);
    },
    setInFrame(id, frame) {
      if (compOf(state, id)) {
        compOf(state, id).attrs.inFrame = frame;
        if (id === DEFAULT_COMP) state.compAttrs.inFrame = frame;
      } else {
        layerOf(state, id).attrs.inFrame = frame;
      }
    },
    setOutFrame(id, frame) {
      if (compOf(state, id)) {
        compOf(state, id).attrs.outFrame = frame;
        if (id === DEFAULT_COMP) state.compAttrs.outFrame = frame;
      } else {
        layerOf(state, id).attrs.outFrame = frame;
      }
    },
    offsetLayerTime(id, delta) {
      layerOf(state, id);
      state.order.push(`offsetLayerTime:${id}:${delta}`);
    },
    getInFrame(id) {
      if (compOf(state, id)) return Number(compOf(state, id).attrs.startFrame ?? compOf(state, id).attrs.inFrame ?? 0);
      return Number(layerOf(state, id).attrs.inFrame ?? 0);
    },
    getOutFrame(id) {
      if (compOf(state, id)) return Number(compOf(state, id).attrs.endFrame ?? compOf(state, id).attrs.outFrame ?? 180);
      return Number(layerOf(state, id).attrs.outFrame ?? 180);
    },
    getFrame() {
      return state.frame;
    },
    setFrame(frame) {
      state.frame = Number(frame);
      state.order.push(`setFrame:${frame}`);
    },
    renderPNGFrame(filePath, scale) {
      // Cavalry appends .png only when the supplied path has no extension.
      const target = filePath.toLowerCase().endsWith(".png") ? filePath : `${filePath}.png`;
      state.order.push(`renderPNGFrame:${target}:${scale}`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      // canonical 1x1 red PNG — enough for decode/inline-image assertions
      fs.writeFileSync(
        target,
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
          "base64",
        ),
      );
      return true;
    },
    addRenderQueueItem(comp) {
      state.order.push(`addRenderQueueItem:${comp}`);
      const id = `renderQueueItem#${state.renderQueue.length + 1}`;
      state.renderQueue.push(id);
      return id;
    },
    backgroundRender(id) {
      state.order.push(`backgroundRender:${id}`);
    },
    getRenderQueueItems() {
      return [...state.renderQueue];
    },
    cancelRender() {
      state.order.push("cancelRender");
    },
    getRenderPath() {
      return path.join(os.tmpdir(), "cavalry-mock-renders");
    },
    loadAsset(assetPath) {
      state.order.push(`loadAsset:${assetPath}`);
      const id = `asset#${++next}`;
      state.assets.push({ id, path: assetPath });
      return id;
    },
    addAssetToComp(assetId) {
      const id = nextId("imageAsset");
      state.layers.set(id, { type: "imageAsset", name: assetId, compId: state.activeComp, attrs: {} });
      return id;
    },
    getBoundingBox(id) {
      const layer = layerOf(state, id);
      const pos = positionOf(layer);
      const size = sizeOf(layer);
      return {
        x: pos.x - size.width / 2,
        y: pos.y - size.height / 2,
        width: size.width,
        height: size.height,
        centre: { x: pos.x, y: pos.y },
        left: pos.x - size.width / 2,
        right: pos.x + size.width / 2,
        top: pos.y - size.height / 2,
        bottom: pos.y + size.height / 2,
      };
    },
    getScenePalette() {
      return paletteId(state);
    },
    addSceneSwatch(color, name) {
      const id = paletteId(state);
      const layer = layerOf(state, id);
      const index = Number(layer.attrs["array.count"]) || 0;
      layer.attrs["array.count"] = index + 1;
      layer.attrs[`array.${index}`] = color;
      if (name) layer.attrs[`array.${index}.name`] = name;
      state.order.push(`addSceneSwatch:${index}:${color}`);
      return index;
    },
    removeSceneSwatch(index) {
      const id = paletteId(state);
      const layer = layerOf(state, id);
      delete layer.attrs[`array.${index}`];
      return true;
    },
    createTimeMarker(time) {
      const id = `timeMarker#${state.markers.length + 1}`;
      state.markers.push({ id, time: Number(time) || 0 });
      state.order.push(`createTimeMarker:${time}`);
      return id;
    },
    getTimeMarkers() {
      return state.markers.map((m) => m.id);
    },
    getTimeFromTimeMarker(id) {
      return state.markers.find((m) => m.id === id)?.time ?? null;
    },
    makeFolder(folderPath) {
      try {
        fs.mkdirSync(folderPath, { recursive: true });
        return true;
      } catch {
        return false;
      }
    },
    filePathExists(filePath) {
      return fs.existsSync(filePath);
    },
    readFromFile(filePath) {
      return fs.readFileSync(filePath, "utf8");
    },
    getHomeFolder() {
      return os.homedir();
    },
    getTempFolder() {
      return os.tmpdir();
    },
    getAppDataFolder() {
      return path.join(os.homedir(), ".cavalry-mock");
    },
    writeToFile(filePath, content, overwriteExisting) {
      if (hooks.writeToFile) return hooks.writeToFile(filePath, content, overwriteExisting);
      if (overwriteExisting === false && fs.existsSync(filePath)) return false;
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content);
      return true;
    },
    __order(tag) {
      state.order.push(tag);
    },
  };
  return api;
}

/** Execute a wrapped script in the mock VM. Returns the captured result. */
export function executeInMock(code, api, context = {}) {
  const ctx = vm.createContext({ api, console, ...context });
  new vm.Script(code).runInContext(ctx);
  return { context: ctx, result: ctx.__result, state: ctx.__stallionState };
}

// ---------------------------------------------------------------------------
// Deterministic v0.11 kind synthesis (batch-step / batch_inspect)
// ---------------------------------------------------------------------------

/** Linear keyframe evaluation for one layer attribute path at one frame. */
function evaluateAttrAtFrame(state, layerId, attrPath, frame) {
  const frames = state.keyframes
    .filter((keyframe) => keyframe.layerId === layerId && attrPath in (keyframe.attributes ?? {}))
    .map((keyframe) => ({ frame: Number(keyframe.frame), value: Number(keyframe.attributes[attrPath]) }))
    .filter((entry) => Number.isFinite(entry.frame) && Number.isFinite(entry.value))
    .sort((a, b) => a.frame - b.frame);
  if (!frames.length) return null;
  if (frame <= frames[0].frame) return frames[0].value;
  if (frame >= frames[frames.length - 1].frame) return frames[frames.length - 1].value;
  for (let index = 1; index < frames.length; index++) {
    const a = frames[index - 1];
    const b = frames[index];
    if (frame >= a.frame && frame <= b.frame) {
      const t = b.frame === a.frame ? 0 : (frame - a.frame) / (b.frame - a.frame);
      return a.value + (b.value - a.value) * t;
    }
  }
  return frames[frames.length - 1].value;
}

/** World box of one layer at one frame, keyframes applied. */
function boxAtFrame(state, layerId, frame) {
  const layer = state.layers.get(layerId);
  if (!layer) return null;
  const attrs = layer.attrs ?? {};
  const px = evaluateAttrAtFrame(state, layerId, "position.x", frame) ?? positionOf(layer).x;
  const py = evaluateAttrAtFrame(state, layerId, "position.y", frame) ?? positionOf(layer).y;
  const size = sizeOf(layer);
  const sx = Number(attrs["scale.x"]) || 1;
  const sy = Number(attrs["scale.y"]) || 1;
  const w = size.width * (sx > 5 ? sx / 100 : sx);
  const h = size.height * (sy > 5 ? sy / 100 : sy);
  return { x: px - w / 2, y: py - h / 2, w, h, cx: px, cy: py };
}

function mockLayerIds(state) {
  return [...state.layers.keys()].filter((id) => !state.layers.get(id).compId || state.layers.get(id).compId === state.activeComp);
}

/** The `/batch_inspect` envelope, computed from the mock scene graph. */
export function synthesizeBatchInspect(payload, state) {
  const frames = (Array.isArray(payload.frames) ? payload.frames : [])
    .map((value) => Math.round(Number(value)))
    .filter((value) => Number.isFinite(value))
    .slice(0, 64)
    .sort((a, b) => a - b);
  if (!frames.length) {
    return { ok: false, kind: "batch_inspect", seq: payload.seq ?? null, code: "STALLION_BAD_REQUEST", error: "batch_inspect requires a non-empty numeric `frames` array (1..64)." };
  }
  const requested = Array.isArray(payload.layerIds) ? payload.layerIds.filter((id) => typeof id === "string" && id) : [];
  const ids = (requested.length ? requested : mockLayerIds(state)).slice(0, 200);
  const wantedAttrs = (Array.isArray(payload.attributes) && payload.attributes.length
    ? payload.attributes
    : ["position.x", "position.y", "scale.x", "scale.y", "rotation", "opacity"]
  ).slice(0, 16);
  const timeline = {};
  for (const frame of frames) {
    const frameEntry = {};
    for (const id of ids) {
      const box = boxAtFrame(state, id, frame);
      if (!box) continue;
      const layer = state.layers.get(id);
      const attrs = {};
      for (const path of wantedAttrs) {
        const animated = evaluateAttrAtFrame(state, id, path, frame);
        if (animated !== null) attrs[path] = Math.round(animated * 1000) / 1000;
        else if (layer.attrs && path in layer.attrs) attrs[path] = layer.attrs[path];
      }
      frameEntry[id] = { bbox: box, attrs, visible: true };
    }
    timeline[String(frame)] = frameEntry;
  }
  const unknown = requested.filter((id) => !state.layers.has(id));
  return {
    ok: true,
    kind: "batch_inspect",
    seq: payload.seq ?? null,
    compId: state.activeComp,
    compFrameRate: 60,
    compResolution: [1920, 1080],
    frames,
    timeline,
    ...(unknown.length ? { unknownLayerIds: unknown } : {}),
    restoredFrame: 0,
  };
}

/** The `/batch-step` envelope: layers reported as compact TSV, no ops executed. */
export function synthesizeBatchStep(payload, state) {
  const rows = mockLayerIds(state).map((id) => {
    const layer = state.layers.get(id);
    const box = boxAtFrame(state, id, 0) ?? { x: 0, y: 0, w: 0, h: 0 };
    return [id, layer.type, state.parents.get(id) ?? "", layer.name, `${box.x},${box.y},${box.w},${box.h}`, "", ""].join("\t");
  });
  return {
    ok: true,
    kind: "batch-step",
    seq: payload.seq ?? null,
    compId: state.activeComp,
    executionTimeMs: 1,
    scriptResult: null,
    manifestResult: { ok: true, created: {}, ops: [], errors: [] },
    frames: {},
    compactDomTsv: rows.length ? `id\ttype\tparent\tname\tx,y,w,h\tanimAttrs\tconnections\n${rows.join("\n")}` : "",
    sampledFrames: 0,
    rendered: 0,
    renderErrors: [],
    restoredFrame: 0,
  };
}

/**
 * Start the mock bridge. `native: true` serves seq-matched results on GET /get
 * (Stallion 0.9+); otherwise the legacy result-file protocol is used. The
 * v0.11 fast-loop kinds (`batch-step`, `batch_inspect`) are synthesized
 * deterministically from the mock scene state so the strict-dsl tools are
 * testable without a live Cavalry.
 */
export function startMockStallion(hooks = {}) {
  const state = hooks.state ?? createMockApiState();
  const api = buildMockApi(state, hooks);
  let served = JSON.stringify({ kind: "status", stallion: "0.11.0", cavalry: "2.8.0" });

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      if (req.method === "POST" && req.url === "/post") {
        try {
          const body = Buffer.concat(chunks).toString("utf8");
          const payload = JSON.parse(body);
          if (payload.type === "__stallion_result__") {
            served = body;
          } else if (hooks.native && payload.type === "batch-step") {
            served = JSON.stringify(synthesizeBatchStep(payload, state));
          } else if (hooks.native && payload.type === "batch_inspect") {
            served = JSON.stringify(synthesizeBatchInspect(payload, state));
          } else if (hooks.native) {
            const ctx = vm.createContext({ api, console });
            try {
              new vm.Script(
                `var __result; var __returned = (${payload.code}); if (typeof __result === "undefined") __result = __returned;`,
              ).runInContext(ctx);
              const result = ctx.__result;
              served = JSON.stringify({
                kind: "result",
                type: "__stallion_result__",
                seq: payload.seq,
                ok: true,
                ...(result === undefined ? {} : { result }),
                ...(ctx.__stallionState ? { state: ctx.__stallionState } : {}),
              });
            } catch (err) {
              served = JSON.stringify({
                kind: "result",
                type: "__stallion_result__",
                seq: payload.seq,
                ok: false,
                error: String(err),
                stack: err instanceof Error ? err.stack : undefined,
                ...(ctx.__stallionState ? { state: ctx.__stallionState } : {}),
              });
            }
          } else {
            const ctx = vm.createContext({ api, console });
            new vm.Script(payload.code).runInContext(ctx);
          }
        } catch {
          // Wrapped script errors are delivered through the active result channel.
        }
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("ack");
        return;
      }
      if (hooks.native && req.method === "GET" && req.url === "/get") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(served);
        return;
      }
      res.writeHead(404);
      res.end();
    });
  });

  return new Promise((resolve) => {
    server.listen(hooks.port ?? 0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        port: typeof address === "object" && address ? address.port : 0,
        state,
        api,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}
