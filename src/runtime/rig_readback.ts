/**
 * Compatibility rig readback for bridges without the
 * `export_comp_rig_overrides` introspection kind.
 *
 * The canonical implementation is stallion's ExportCompRigOverrides.ts (a
 * `type` on POST /post). Bridges older than that kind silently ignore unknown
 * types, which would stall a correlated read until timeout — so the sync tool
 * probes once, then falls back to this script through `/batch-step`, a route
 * every Stallion >= 0.10 carries. The envelope is intentionally identical so
 * `syncClonedStyleOverrides` cannot tell the two read paths apart.
 *
 * Pure module: string in, string out. Bounds mirror the handler (200 layers,
 * 64 attrs/layer, 16 animated paths) so a fallback call cannot freeze the
 * Cavalry UI thread.
 */

export const RIG_READBACK_MAX_LAYERS = 200;
export const RIG_READBACK_MAX_ATTRS = 64;
export const RIG_READBACK_MAX_EXPLICIT = 32;
export const RIG_READBACK_MAX_ANIMATED = 16;

/**
 * Substring match against declared attribute paths — kept byte-identical to
 * stallion's RIG_ATTR_PATTERN_SOURCE. Diverging lists would make the fallback
 * produce different overrides than the native handler.
 */
const RIG_ATTR_PATTERN_SOURCE = [
  "stiffness",
  "damping",
  "mass",
  "tension",
  "friction",
  "frequency",
  "amplitude",
  "phase",
  "wobble",
  "speed",
  "rate",
  "stagger",
  "lagFrames",
  "delayFrames",
  "offsetFrames",
  "holdFrames",
  "count",
  "rows",
  "columns",
  "spacing",
  "gutter",
  "color",
  "colour",
  "fontSize",
  "tracking",
  "leading",
  "seed",
  "min",
  "max",
  "offset",
].join("|");

export interface RigOverridesReadbackJob {
  compId: string;
  layerIds: string[];
  attributes: string[];
}

/** A `/batch-step` user script (plain body; BatchStep wraps it in a function). */
export function rigOverridesReadbackScript(job: RigOverridesReadbackJob): string {
  return `var __ro = ${JSON.stringify(job)};
var __read = function (fn) { try { return fn(); } catch (e) { return null; }; };
var __num = function (v, fallback) { var n = Number(v); return isFinite(n) ? n : fallback; };
var __hex2 = function (n) { var s = Math.max(0, Math.min(255, Math.round(__num(n, 0)))).toString(16); return s.length < 2 ? '0' + s : s; };
var __color = function (v) {
  return v && typeof v === 'object' && typeof v.r === 'number' && typeof v.g === 'number' && typeof v.b === 'number'
    ? '#' + __hex2(v.r) + __hex2(v.g) + __hex2(v.b)
    : null;
};
var __rigRe = new RegExp(${JSON.stringify(`(?:${RIG_ATTR_PATTERN_SOURCE})`)}, 'i');
var __started = Date.now();
var __prevComp = __read(function () { return api.getActiveComp(); });
var __compId = __ro.compId || __prevComp;
if (!__compId) {
  return { ok: false, kind: 'export_comp_rig_overrides', error: 'No active comp to export from.', code: 'STALLION_NO_ACTIVE_COMP' };
}
if (__ro.compId && __ro.compId !== __prevComp) { __read(function () { return api.setActiveComp(__ro.compId); }); }
var __frame = __num(__read(function () { return api.getFrame(); }), 0);
var __compFrameRate = null;
var __fr = __read(function () { return api.get(__compId, 'frameRate'); });
if (__fr === null || __fr === undefined) __fr = __read(function () { return api.get(__compId, 'fps'); });
if (typeof __fr === 'number' && isFinite(__fr) && __fr > 0) __compFrameRate = __fr;
var __compResolution = null;
var __res = __read(function () { return api.get(__compId, 'resolution'); });
var __compW = null, __compH = null;
if (Array.isArray(__res) && __res.length >= 2) { __compW = Number(__res[0]); __compH = Number(__res[1]); }
else if (__res && typeof __res === 'object') { __compW = Number(__res.x); __compH = Number(__res.y); }
if (!(__compW > 0 && __compH > 0)) {
  __compW = __read(function () { return api.get(__compId, 'width'); });
  __compH = __read(function () { return api.get(__compId, 'height'); });
}
if (typeof __compW === 'number' && __compW > 0 && typeof __compH === 'number' && __compH > 0) {
  __compResolution = [__compW, __compH];
}
var __compEndFrame = __read(function () { return api.get(__compId, 'endFrame'); });
if (typeof __compEndFrame !== 'number' || !isFinite(__compEndFrame)) {
  __compEndFrame = __read(function () { return api.getOutFrame(__compId); });
}
if (typeof __compEndFrame !== 'number' || !isFinite(__compEndFrame)) __compEndFrame = null;
var __ids = __ro.layerIds.length
  ? __ro.layerIds.slice(0, ${RIG_READBACK_MAX_LAYERS})
  : (__read(function () { return api.getCompLayers(false); }) || []).slice(0, ${RIG_READBACK_MAX_LAYERS});
var __layers = [];
for (var i = 0; i < __ids.length; i++) {
  var __id = __ids[i];
  var __type = String(__read(function () { return api.getLayerType(__id); }) || '');
  if (!__type) continue;
  var __declared = __read(function () { return api.getAttributes(__id); }) || [];
  var __wanted = [];
  for (var d = 0; d < __declared.length && __wanted.length < ${RIG_READBACK_MAX_ATTRS}; d++) {
    var __path = String(__declared[d]);
    // Host bookkeeping knobs that merely look procedural; never preset inputs.
    if (/posterize/i.test(__path)) continue;
    if (__ro.attributes.indexOf(__path) !== -1 || __rigRe.test(__path)) __wanted.push(__path);
  }
  var __attrs = {};
  for (var w = 0; w < __wanted.length; w++) {
    var __val = __read(function () { return api.get(__id, __wanted[w]); });
    if (__val === null || __val === undefined) continue;
    if (Array.isArray(__val)) __attrs[__wanted[w]] = __val.map(function (item) { return typeof item === 'number' ? item : String(item); });
    else if (__color(__val)) __attrs[__wanted[w]] = __color(__val);
    else if (typeof __val === 'object') __attrs[__wanted[w]] = { x: __num(__val.x, 0), y: __num(__val.y, 0) };
    else if (typeof __val === 'number' || typeof __val === 'boolean' || typeof __val === 'string') __attrs[__wanted[w]] = __val;
    else __attrs[__wanted[w]] = String(__val);
  }
  var __animated = (__read(function () { return api.getAnimatedAttributes(__id); }) || []).slice(0, ${RIG_READBACK_MAX_ANIMATED});
  var __hidden = __read(function () { return api.get(__id, 'hidden'); });
  __layers.push({
    id: __id,
    name: String(__read(function () { return api.getNiceName(__id); }) || __id),
    type: __type,
    parent: __read(function () { return api.getParent(__id); }) || null,
    hidden: __hidden === true || __hidden === 1 || __hidden === 'true',
    attrs: __attrs,
    animated: __animated
  });
}
if (__ro.compId && __prevComp && __ro.compId !== __prevComp) { __read(function () { return api.setActiveComp(__prevComp); }); }
return {
  ok: true,
  kind: 'export_comp_rig_overrides',
  compId: String(__compId),
  frame: __frame,
  compFrameRate: __compFrameRate,
  compResolution: __compResolution,
  compEndFrame: __compEndFrame,
  layers: __layers,
  layerCount: __layers.length,
  elapsedMs: Date.now() - __started
};`;
}
