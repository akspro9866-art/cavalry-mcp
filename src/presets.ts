/**
 * One-call animation presets for cavalry_animate_in. Each preset reads the
 * layer's current values inside Cavalry first (so keyframes land relative to
 * where the layer already is), then writes keyframes + Magic Easing.
 *
 * Attribute values in the generated script are JS expressions over those
 * reads (e.g. `y0 + dist`), and every step is individually try/catch-guarded
 * with applied/failed lists returned as the tool result — a layer type that
 * lacks e.g. "weight" degrades gracefully instead of erroring.
 */
import { jsString } from "./lib.js";

export const ANIMATE_PRESETS = [
  "fadeIn",
  "fadeUp",
  "springUp",
  "slideInLeft",
  "popIn",
  "dropBounce",
] as const;

export type AnimatePreset = (typeof ANIMATE_PRESETS)[number];

export interface PresetParams {
  layerId: string;
  preset: AnimatePreset;
  startFrame?: number;
  duration?: number;
  distance?: number;
}

/** attr values are JS expressions evaluated inside Cavalry (over x0/y0/o0/w0/dist). */
interface PresetDef {
  keyframes: Array<{ at: "start" | "end"; attrs: Record<string, string> }>;
  easing?: Array<{ attr: string; name: string }>;
}

const PRESETS: Record<AnimatePreset, PresetDef> = {
  fadeIn: {
    keyframes: [
      { at: "start", attrs: { opacity: "0" } },
      { at: "end", attrs: { opacity: "o0" } },
    ],
  },
  fadeUp: {
    keyframes: [
      { at: "start", attrs: { opacity: "0", "position.y": "y0 + dist" } },
      { at: "end", attrs: { opacity: "o0", "position.y": "y0" } },
    ],
  },
  springUp: {
    keyframes: [
      { at: "start", attrs: { opacity: "0", "position.y": "y0 + dist" } },
      { at: "end", attrs: { opacity: "o0", "position.y": "y0" } },
    ],
    easing: [{ attr: "position.y", name: "SpringOut" }],
  },
  slideInLeft: {
    keyframes: [
      { at: "start", attrs: { opacity: "0", "position.x": "x0 - dist" } },
      { at: "end", attrs: { opacity: "o0", "position.x": "x0" } },
    ],
  },
  popIn: {
    keyframes: [
      { at: "start", attrs: { opacity: "0", weight: "0" } },
      { at: "end", attrs: { opacity: "o0", weight: "w0" } },
    ],
    easing: [{ attr: "weight", name: "SmallSpringOut" }],
  },
  dropBounce: {
    keyframes: [
      { at: "start", attrs: { "position.y": "y0 - dist * 2" } },
      { at: "end", attrs: { "position.y": "y0" } },
    ],
    easing: [{ attr: "position.y", name: "BounceOut" }],
  },
};

export function compileAnimateIn(p: PresetParams): string {
  const id = jsString(p.layerId);
  const start = p.startFrame ?? 0;
  const duration = p.duration ?? 30;
  const dist = p.distance ?? 100;
  const end = start + duration;
  const def = PRESETS[p.preset];

  const steps: string[] = [];
  for (const kf of def.keyframes) {
    const frame = kf.at === "start" ? start : end;
    const attrs = Object.entries(kf.attrs)
      .map(([k, v]) => `${jsString(k)}: (${v})`)
      .join(", ");
    steps.push(
      `step(${jsString(`keyframe @${frame}`)}, function () { api.keyframe(id, ${frame}, { ${attrs} }); });`,
    );
  }
  for (const e of def.easing ?? []) {
    steps.push(
      `step(${jsString(`easing ${e.attr} ${e.name}`)}, function () { api.magicEasing(id, ${jsString(e.attr)}, ${start}, ${jsString(e.name)}); });`,
    );
  }

  return `(function () {
var id = ${id};
var dist = ${dist};
var applied = [], failed = [];
function step(label, fn) { try { fn(); applied.push(label); } catch (e) { failed.push(label + ": " + String(e && e.message ? e.message : e)); } }
var x0 = 0, y0 = 0, o0 = 100, w0 = 100;
try { x0 = Number(api.get(id, "position.x")) || 0; } catch (e) {}
try { y0 = Number(api.get(id, "position.y")) || 0; } catch (e) {}
try { o0 = Number(api.get(id, "opacity")); if (!isFinite(o0)) o0 = 100; } catch (e) {}
try { w0 = Number(api.get(id, "weight")); if (!isFinite(w0)) w0 = 100; } catch (e) {}
${steps.join("\n")}
__result = { preset: ${jsString(p.preset)}, startFrame: ${start}, endFrame: ${end}, applied: applied, failed: failed };
})()`;
}
