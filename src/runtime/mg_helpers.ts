import Bezier from "bezier-easing";
import SVGPathCommander from "svg-path-commander";
import { RB_HELPERS_SOURCE } from "../presets/rig_builders.js";
import { MG_SCENE_SOURCE } from "./mg_helpers/scene.js";
import { MG_EASING_SOURCE } from "./mg_helpers/easing.js";
import { MG_PATCH_SOURCE } from "./mg_helpers/patch.js";
import { MG_SVG_SOURCE } from "./mg_helpers/svg.js";
import { MG_THEME_SOURCE } from "./mg_helpers/theme.js";
import { MG_MODULATE_SOURCE } from "./mg_helpers/modulate.js";
import { MG_SEMANTIC_SOURCE } from "./mg_helpers/semantic.js";
import { MG_KEYFRAMES_SOURCE } from "./mg_helpers/keyframes.js";
import { MG_STUDIO_SOURCE } from "./mg_helpers/studio.js";
import { MG_CANVALRY_SOURCE } from "./mg_helpers/canvalry.js";
import { MG_MOTION_SOURCE } from "./mg_helpers/motion.js";
import { MG_RASTER_SOURCE } from "./mg_helpers/raster.js";

/** JavaScript injected into Cavalry; this module is never executed by Node. */
const MG_BASE_SOURCE =
  MG_SCENE_SOURCE +
  MG_EASING_SOURCE +
  MG_PATCH_SOURCE +
  MG_SVG_SOURCE +
  MG_THEME_SOURCE +
  MG_MODULATE_SOURCE +
  MG_SEMANTIC_SOURCE +
  MG_KEYFRAMES_SOURCE +
  MG_STUDIO_SOURCE +
  MG_CANVALRY_SOURCE +
  MG_MOTION_SOURCE +
  MG_RASTER_SOURCE;

/** _mg legacy DSL + _rb rig builders, injected into one script scope. */
export const MG_HELPERS_SOURCE = `${MG_BASE_SOURCE}\n${RB_HELPERS_SOURCE}`;

export interface OklchColor {
  l: number;
  c: number;
  h: number;
}

export interface CssGradientStop {
  color: string;
  offset: number;
}

export interface ParsedCssLinearGradient {
  angle: number;
  stops: CssGradientStop[];
}

export interface IsometricCardTransform {
  rotateX: number;
  rotateZ: number;
  scaleY: number;
  elevation: number;
  parallaxOffset: { x: number; y: number };
  startFrame: number;
  duration: number;
  shadowSpecs: Array<{
    radius: number;
    offsetX: number;
    offsetY: number;
    opacity: number;
  }>;
}

export interface SpringPhysicsOptions {
  stiffness?: number;
  damping?: number;
  mass?: number;
  initialVelocity?: number;
  tolerance?: number;
}

function parseHexRgb(hex: string): { r: number; g: number; b: number } {
  let s = String(hex ?? "#FFFFFF").replace("#", "").trim();
  if (s.length === 3) {
    s = s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2);
  }
  return {
    r: parseInt(s.slice(0, 2), 16) || 0,
    g: parseInt(s.slice(2, 4), 16) || 0,
    b: parseInt(s.slice(4, 6), 16) || 0,
  };
}

/** Convert `#RRGGBB` hex color to perceptual OKLCH `{ l, c, h }`. */
export function hexToOklch(hex: string): OklchColor {
  const rgb = parseHexRgb(hex);
  const toLin = (v: number): number => {
    const c = Math.max(0, Math.min(255, Number(v) || 0)) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const r = toLin(rgb.r);
  const g = toLin(rgb.g);
  const b = toLin(rgb.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  const C = Math.sqrt(A * A + B * B);
  const H = C < 1e-4 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return {
    l: Math.round(L * 10000) / 10000,
    c: Math.round(C * 10000) / 10000,
    h: Math.round(H * 100) / 100,
  };
}

/** Convert perceptual OKLCH `{ l, c, h }` back to `#RRGGBB` hex. */
export function oklchToHex(lch: OklchColor): string {
  const L = Number(lch?.l) || 0;
  const C = Number(lch?.c) || 0;
  const rad = ((Number(lch?.h) || 0) * Math.PI) / 180;
  const A = C * Math.cos(rad);
  const B = C * Math.sin(rad);
  const l_ = L + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = L - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = L - 0.0894841775 * A - 1.2914855480 * B;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  const rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  const toSrgb = (v: number): string => {
    const clamped = Math.max(0, Math.min(1, v));
    const gamma = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
    const hex = Math.round(gamma * 255).toString(16).toUpperCase();
    return hex.length < 2 ? `0${hex}` : hex;
  };
  return `#${toSrgb(rLin)}${toSrgb(gLin)}${toSrgb(bLin)}`;
}

/** Perceptual OKLCH color interpolation (avoids muddy gray sRGB midpoints). */
export function interpolateOklch(hexA: string, hexB: string, t: number): string {
  const u = Math.max(0, Math.min(1, Number(t) || 0));
  const a = hexToOklch(hexA);
  const b = hexToOklch(hexB);
  let dh = b.h - a.h;
  if (a.c < 1e-4 || b.c < 1e-4) dh = 0;
  else if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const h = a.c < 1e-4 ? b.h : b.c < 1e-4 ? a.h : (a.h + dh * u + 360) % 360;
  return oklchToHex({
    l: a.l + (b.l - a.l) * u,
    c: a.c + (b.c - a.c) * u,
    h,
  });
}

/** Generate `steps` evenly spaced OKLCH-interpolated gradient stops across `colors`. */
export function oklchGradientStops(colors: string[], steps = 5): CssGradientStop[] {
  const list = Array.isArray(colors) && colors.length >= 2 ? colors : ["#0F172A", "#10B981"];
  const total = Math.max(2, Math.round(Number(steps) || 5));
  const stops: CssGradientStop[] = [];
  for (let i = 0; i < total; i++) {
    const u = i / (total - 1);
    const scaled = u * (list.length - 1);
    const idx = Math.min(list.length - 2, Math.floor(scaled));
    const localT = scaled - idx;
    stops.push({
      color: interpolateOklch(list[idx], list[idx + 1], localT),
      offset: Math.round(u * 1000) / 1000,
    });
  }
  return stops;
}

/**
 * Ported from `phillip-motion/Canvalry-scripts` (CSS Gradient Converter):
 * parses `linear-gradient(135deg, #0F172A 0%, #10B981 50%, #38BDF8 100%)`
 * into angle + normalized stops, optionally inserting perceptual OKLCH midpoints.
 */
export function parseCssLinearGradient(
  cssString: string,
  opts: { oklch?: boolean } = {},
): ParsedCssLinearGradient {
  const raw = String(cssString ?? "").trim();
  const innerMatch = raw.match(/linear-gradient\s*\(([\s\S]*)\)/i);
  const body = innerMatch ? innerMatch[1] : raw;
  const parts = body
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  let angle = 180;
  let startIdx = 0;
  if (parts.length > 0) {
    const degMatch = parts[0].match(/^(-?\d+(?:\.\d+)?)deg$/i);
    if (degMatch) {
      angle = ((Number(degMatch[1]) % 360) + 360) % 360;
      startIdx = 1;
    } else if (/^to\s+/i.test(parts[0])) {
      const dir = parts[0].toLowerCase().replace(/^to\s+/, "").trim();
      const map: Record<string, number> = {
        top: 0,
        "top right": 45,
        right: 90,
        "bottom right": 135,
        bottom: 180,
        "bottom left": 225,
        left: 270,
        "top left": 315,
      };
      if (map[dir] != null) angle = map[dir];
      startIdx = 1;
    }
  }
  const rawStops: Array<{ color: string; offset: number | null }> = [];
  for (const part of parts.slice(startIdx)) {
    const tokens = part.split(/\s+/).filter(Boolean);
    const hexRgb = parseHexRgb(tokens[0] || "#000000");
    const hex = `#${[hexRgb.r, hexRgb.g, hexRgb.b]
      .map(v => v.toString(16).toUpperCase().padStart(2, "0"))
      .join("")}`;
    let offset: number | null = null;
    if (tokens[1] && tokens[1].endsWith("%")) {
      offset = Math.max(0, Math.min(1, parseFloat(tokens[1]) / 100));
    } else if (tokens[1] && Number.isFinite(Number(tokens[1]))) {
      offset = Math.max(0, Math.min(1, Number(tokens[1])));
    }
    rawStops.push({ color: hex, offset });
  }
  if (rawStops.length === 0) {
    rawStops.push({ color: "#0F172A", offset: 0 }, { color: "#10B981", offset: 1 });
  }
  const normalizedStops: CssGradientStop[] = rawStops.map((s, i) => ({
    color: s.color,
    offset:
      s.offset != null
        ? s.offset
        : rawStops.length === 1
          ? 0
          : Math.round((i / (rawStops.length - 1)) * 1000) / 1000,
  }));

  if (opts.oklch && normalizedStops.length >= 2) {
    const enriched: CssGradientStop[] = [];
    for (let i = 0; i < normalizedStops.length - 1; i++) {
      const a = normalizedStops[i];
      const b = normalizedStops[i + 1];
      enriched.push(a);
      enriched.push({
        color: interpolateOklch(a.color, b.color, 0.5),
        offset: Math.round(((a.offset + b.offset) / 2) * 1000) / 1000,
      });
    }
    enriched.push(normalizedStops[normalizedStops.length - 1]);
    return { angle, stops: enriched };
  }
  return { angle, stops: normalizedStops };
}

/**
 * Ported from `phillip-motion/Canvalry-scripts` (Explode Shape Layers):
 * emits a self-contained Cavalry script expression that explodes `editableShapeId`.
 */
export function explodeShapeLayers(editableShapeId: string): string {
  if (!editableShapeId) throw new Error("explodeShapeLayers requires a non-empty editableShapeId");
  return `_mg.explodeShapeLayers(${JSON.stringify(editableShapeId)})`;
}

/**
 * Ported from `phillip-motion/Canvalry-scripts` (Set All Image Shaders to Mipmaps):
 * emits a self-contained Cavalry script call setting `filterQuality` (default 3 = High + Mipmaps).
 */
export function setAllImageShadersToMipmaps(filterQuality = 3): string {
  return `_mg.setAllImageShadersToMipmaps(${Math.max(0, Math.round(Number(filterQuality) || 3))})`;
}

/**
 * Isometric SaaS card perspective helper from `sickn33/antigravity-design-expert`:
 * computes 2D isometric equivalences for `rotateX(60deg) rotateZ(-45deg)`,
 * multi-layered diffused shadows, Z-axis parallax offset, and `0.1s` (6f @ 60fps) domino staggers.
 */
export function computeIsometricCardTransform(
  opts: {
    rotateX?: number;
    rotateZ?: number;
    elevation?: number;
    index?: number;
    staggerFrames?: number;
    startFrame?: number;
    duration?: number;
    shadowLayers?: number;
  } = {},
): IsometricCardTransform {
  const rotateX = opts.rotateX ?? 60;
  const rotateZ = opts.rotateZ ?? -45;
  const elevation = opts.elevation ?? 24;
  const index = opts.index ?? 0;
  const staggerFrames = opts.staggerFrames ?? 6;
  const startFrame = (opts.startFrame ?? 0) + Math.round(index * staggerFrames);
  const duration = opts.duration ?? 24;
  const scaleY = Math.round(Math.cos((rotateX * Math.PI) / 180) * 10000) / 10000;
  const parallaxOffset = {
    x: Math.round(elevation * 0.7071 * 100) / 100,
    y: Math.round(elevation * 0.7071 * 100) / 100,
  };
  const count = Math.max(1, Math.min(4, opts.shadowLayers ?? 2));
  const shadowSpecs = Array.from({ length: count }, (_, idx) => {
    const mult = idx + 1;
    return {
      radius: Math.round(elevation * 0.9 * mult),
      offsetX: Math.round(-parallaxOffset.x * 0.6 * mult),
      offsetY: Math.round(-parallaxOffset.y * 0.85 * mult),
      opacity: Math.max(12, Math.round(38 / mult)),
    };
  });
  return {
    rotateX,
    rotateZ,
    scaleY,
    elevation,
    parallaxOffset,
    startFrame,
    duration,
    shadowSpecs,
  };
}

/** Linearly remap `value` from `[inMin, inMax]` to `[outMin, outMax]` (`motiondeveloper/aefunctions`). */
export function remap(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
  clamp = true,
): number {
  const span = inMax - inMin;
  let t = Math.abs(span) < 1e-12 ? 0 : (value - inMin) / span;
  if (clamp) t = Math.max(0, Math.min(1, t));
  return outMin + t * (outMax - outMin);
}

/** Compute normalized bounding rectangle metadata (`motiondeveloper/aefunctions` `layerRect`). */
export function layerRect(
  layerId: string,
  _t = 0,
  opts: { width?: number; height?: number; x?: number; y?: number } = {},
): { layerId: string; left: number; top: number; right: number; bottom: number; width: number; height: number; cx: number; cy: number } {
  const width = Number(opts.width ?? 120);
  const height = Number(opts.height ?? 60);
  const cx = Number(opts.x ?? 0);
  const cy = Number(opts.y ?? 0);
  return {
    layerId,
    left: cx - width / 2,
    top: cy + height / 2,
    right: cx + width / 2,
    bottom: cy - height / 2,
    width,
    height,
    cx,
    cy,
  };
}

/** Wrap `text` at word boundaries so no line exceeds `maxCharsPerLine` (`motiondeveloper/aefunctions`). */
export function addLineBreaks(text: string, maxCharsPerLine = 36): string {
  const limit = Math.max(4, Math.round(Number(maxCharsPerLine) || 36));
  const words = String(text ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "";
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    if ((current + " " + words[i]).length <= limit) {
      current += " " + words[i];
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines.join("\n");
}

/**
 * Evaluate a damped harmonic oscillator at time `t` (in seconds) from `0` to `1`
 * matching SwiftUI `interpolatingSpring` / `react-spring` physics.
 */
export function evaluateSpring(t: number, opts: SpringPhysicsOptions = {}): number {
  if (t <= 0) return 0;
  const stiffness = Math.max(1e-3, opts.stiffness ?? 180);
  const damping = Math.max(1e-3, opts.damping ?? 14);
  const mass = Math.max(1e-3, opts.mass ?? 1);
  const v0 = opts.initialVelocity ?? 0;
  const omega0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  if (zeta < 1) {
    const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
    const env = Math.exp(-zeta * omega0 * t);
    const coeffSin = (zeta * omega0 - v0) / omegaD;
    return 1 - env * (Math.cos(omegaD * t) + coeffSin * Math.sin(omegaD * t));
  }
  if (Math.abs(zeta - 1) < 1e-6) {
    const env = Math.exp(-omega0 * t);
    return 1 - env * (1 + (omega0 - v0) * t);
  }
  const s = omega0 * Math.sqrt(zeta * zeta - 1);
  const r1 = -zeta * omega0 + s;
  const r2 = -zeta * omega0 - s;
  const c2 = (v0 - r1) / (r1 - r2);
  const c1 = 1 + c2;
  return 1 - (c1 * Math.exp(r1 * t) - c2 * Math.exp(r2 * t));
}

/** Compute settling time `T_settle` (in seconds) for a damped spring within `tolerance` (default `0.005`). */
export function computeSpringSettlingTime(opts: SpringPhysicsOptions = {}): number {
  const stiffness = Math.max(1e-3, opts.stiffness ?? 180);
  const damping = Math.max(1e-3, opts.damping ?? 14);
  const mass = Math.max(1e-3, opts.mass ?? 1);
  const tolerance = Math.max(1e-5, Math.min(0.1, opts.tolerance ?? 0.005));
  const omega0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const decayRate = Math.min(zeta, 1) * omega0;
  if (decayRate <= 1e-6) return 4;
  return Math.min(10, Math.round((-Math.log(tolerance) / decayRate) * 1000) / 1000);
}

/** Sample a damped spring curve into `[frame, value]` keyframe pairs. */
export function generateSpringCurve(
  opts: SpringPhysicsOptions & {
    fps?: number;
    startFrame?: number;
    from?: number;
    to?: number;
  } = {},
): Array<[number, number]> {
  const fps = Math.max(1, opts.fps ?? 60);
  const startFrame = Math.round(opts.startFrame ?? 0);
  const from = opts.from ?? 0;
  const to = opts.to ?? 1;
  const settlingSeconds = computeSpringSettlingTime(opts);
  const totalFrames = Math.max(4, Math.min(240, Math.round(settlingSeconds * fps)));
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= totalFrames; i++) {
    const t = i / fps;
    const u = i === totalFrames ? 1 : evaluateSpring(t, opts);
    const val = from + (to - from) * u;
    points.push([startFrame + i, Math.round(val * 10000) / 10000]);
  }
  return points;
}

/* ------------------------------------------------------------------ *
 * Wave-2 compile-time motion math (Node side).
 *
 * These mirror the injected `_mg` motion helpers so presets can bake pure
 * keyframe tables at COMPILE time. They never run inside Cavalry; the emitted
 * expressions remain pure functions of frame t. Ports of motion-craft
 * easing-and-timing, motion-launch-videos core.js and motion-canvas tweening.
 * ------------------------------------------------------------------ */

/** A camera/spline waypoint: `[frame, ...values]` (motion-craft splineAt). */
export type SplineKeyframe = number[];

/** One superposed spring event (motion-launch-videos Prop). */
export interface SpringEvent {
  t: number;
  /** Relative delta for a spring move; ignored when `set` is true. */
  d?: number;
  /** `[zeta, omega]` damping ratio + natural frequency. */
  sp?: [number, number];
  /** Instant jump that cancels earlier springs. */
  set?: boolean;
  /** Absolute value when `set` is true. */
  v?: number;
}

export interface MultiSpringOptions {
  dur?: number;
  loop?: "hold" | "cycle" | "none";
}

const clampNum = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));

/**
 * C1-continuous cubic Hermite spline (motion-craft `splineAt`). Pure compile-time
 * mirror of `_mg.splineAt`; holds perfectly still between equal-valued waypoints.
 */
export function splineAt(frame: number, keyframes: SplineKeyframe[]): number[] {
  const n = keyframes.length;
  if (n === 0) return [];
  if (frame <= keyframes[0][0]) return keyframes[0].slice(1);
  if (frame >= keyframes[n - 1][0]) return keyframes[n - 1].slice(1);
  let i = 0;
  for (let k = 0; k < n - 1; k++) {
    if (frame >= keyframes[k][0] && frame <= keyframes[k + 1][0]) {
      i = k;
      break;
    }
  }
  const p0 = keyframes[Math.max(0, i - 1)];
  const p1 = keyframes[i];
  const p2 = keyframes[i + 1];
  const p3 = keyframes[Math.min(n - 1, i + 2)];
  const dt = p2[0] - p1[0];
  if (dt <= 0) return p1.slice(1);
  const u = clampNum((frame - p1[0]) / dt, 0, 1);
  const u2 = u * u;
  const u3 = u2 * u;
  const dims = p1.length - 1;
  const out: number[] = new Array(dims);
  for (let d = 1; d <= dims; d++) {
    const y0 = p0[d], y1 = p1[d], y2 = p2[d], y3 = p3[d];
    const m1 = i === 0 ? 0
      : Math.abs(y1 - y0) < 1e-4 || Math.abs(y2 - y1) < 1e-4 ? 0
      : ((y2 - y0) / (p2[0] - p0[0])) * dt;
    const m2 = i + 1 === n - 1 ? 0
      : Math.abs(y3 - y2) < 1e-4 || Math.abs(y2 - y1) < 1e-4 ? 0
      : ((y3 - y1) / (p3[0] - p1[0])) * dt;
    out[d - 1] =
      (2 * u3 - 3 * u2 + 1) * y1 +
      (u3 - 2 * u2 + u) * m1 +
      (-2 * u3 + 3 * u2) * y2 +
      (u3 - u2) * m2;
  }
  return out;
}

/** Smooth spring 0 -> 1 from frame `start` (motion-craft `springAt`), closed-form. */
export function springAt(
  frame: number,
  start: number,
  fps = 30,
  config: { damping?: number; stiffness?: number; mass?: number; initialVelocity?: number } = {},
): number {
  return evaluateSpring((frame - start) / Math.max(1e-6, fps), {
    stiffness: config.stiffness ?? 140,
    damping: config.damping ?? 14,
    mass: config.mass ?? 0.75,
    initialVelocity: config.initialVelocity ?? 0,
  });
}

/** Overlapping-action follow-through spring (motion-craft `staggeredSpringAt`). */
export function staggeredSpringAt(
  frame: number,
  baseStart: number,
  layerIndex: number,
  fps = 30,
  stepFrames = 3,
): number {
  const idx = layerIndex || 0;
  return springAt(frame, baseStart + idx * stepFrames, fps, {
    damping: 13 + idx * 1.2,
    stiffness: Math.max(115, 155 - idx * 12),
    mass: 0.68 + idx * 0.08,
  });
}

/** Phase-shifted micro-bob (motion-craft `microBob`). Pure sin/cos of frame. */
export function microBob(
  frame: number,
  elementIndex = 0,
  amplitudePx = 3.5,
  speed = 0.22,
): { dy: number; rotDeg: number } {
  const phase = elementIndex * 1.85;
  return {
    dy: Math.sin(frame * speed + phase) * amplitudePx,
    rotDeg: Math.cos(frame * (speed * 0.8) + phase) * (amplitudePx * 0.25),
  };
}

/** Fitts's Law movement time in seconds: `a + b * log2(2D / W)`. */
export function fittsMovementTime(distance: number, targetWidth = 48, a = 0.05, b = 0.12): number {
  const D = Math.max(1, distance);
  const W = Math.max(1, targetWidth);
  return a + b * Math.log2((2 * D) / W);
}

/**
 * Build a Fitts-timed cursor trajectory: each hop's duration derives from
 * `fittsMovementTime`, with an overshoot + correction submovement before clicks.
 * targets: `[{ x, y, width?, click? }]`. Returns `[frame, x, y][]` waypoints.
 */
export function fittsCursorTrajectory(
  targets: Array<{ x: number; y: number; width?: number; click?: boolean }>,
  opts: { fps?: number; startFrame?: number; a?: number; b?: number; overshootPx?: number } = {},
): Array<[number, number, number]> {
  const fps = Math.max(1, opts.fps ?? 30);
  const over = opts.overshootPx ?? 4.5;
  const out: Array<[number, number, number]> = [];
  let frame = Math.round(opts.startFrame ?? 0);
  let prevX = targets.length ? targets[0].x : 0;
  let prevY = targets.length ? targets[0].y : 0;
  out.push([frame, prevX, prevY]);
  for (let i = 1; i < targets.length; i++) {
    const tgt = targets[i];
    const dx = tgt.x - prevX, dy = tgt.y - prevY;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const mt = fittsMovementTime(dist, tgt.width ?? 48, opts.a, opts.b);
    const travel = Math.max(2, Math.round(mt * fps));
    const arrive = frame + travel;
    if (tgt.click) {
      const fOver = Math.max(frame + 1, arrive - Math.round(travel * 0.28));
      const fSettle = Math.max(fOver + 1, arrive - Math.round(travel * 0.16));
      out.push([fOver, tgt.x + (dx / dist) * over, tgt.y + (dy / dist) * over]);
      out.push([fSettle, tgt.x, tgt.y]);
    }
    out.push([arrive, tgt.x, tgt.y]);
    frame = arrive;
    prevX = tgt.x;
    prevY = tgt.y;
  }
  return out.sort((p, q) => p[0] - q[0]);
}

const settleOf = (sp: [number, number]): number => 16 / Math.max(1e-6, sp[0] * sp[1]);

function springStep(tau: number, sp: [number, number]): number {
  if (tau <= 0) return 0;
  if (tau >= settleOf(sp)) return 1;
  return evaluateSpring(tau, {
    stiffness: sp[1] * sp[1],
    damping: 2 * sp[0] * sp[1],
    mass: 1,
  });
}

/**
 * Closed-form multi-spring sum (motion-launch-videos `Prop.at`): base value plus
 * one superposed spring per target change, with hold/cycle seam carry-over.
 * Pure function of `t`; no integration or external state.
 */
export function multiSpringValue(
  t: number,
  v0: number,
  events: SpringEvent[],
  opts: MultiSpringOptions = {},
): number {
  const dur = opts.dur ?? 0;
  const loop = opts.loop ?? "none";
  let v = v0;
  let i0 = 0;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.set && e.t <= t) {
      v = e.v ?? v;
      i0 = i + 1;
    }
  }
  for (let i = i0; i < events.length; i++) {
    const e = events[i];
    if (!e.set && e.sp) v += (e.d ?? 0) * springStep(t - e.t, e.sp);
  }
  if (dur > 0 && loop !== "none") {
    let k = -1;
    let firstSet = Infinity;
    for (let i = 0; i < events.length; i++) {
      if (events[i].set) {
        k = i;
        if (firstSet === Infinity) firstSet = events[i].t;
      }
    }
    const tail = events.slice(k + 1).filter(e => !e.set && (e.d ?? 0) !== 0 && e.sp && e.t + settleOf(e.sp) > dur);
    if (tail.length && t < firstSet) {
      for (const e of tail) v += (e.d ?? 0) * (springStep(t + dur - e.t, e.sp as [number, number]) - 1);
    }
  }
  return v;
}

/**
 * Reactive signal tweening (motion-canvas spring generator pattern) adapted to a
 * pure closed form: the value chases successive targets in `keyframes` with a
 * damped spring per step. `sp` defaults to LAND `[0.72, 28]`.
 */
export function signalTweenValue(
  t: number,
  keyframes: Array<{ t: number; value: number; sp?: [number, number] }>,
  opts: MultiSpringOptions & { sp?: [number, number] } = {},
): number {
  if (!keyframes.length) return 0;
  const sp = opts.sp ?? [0.72, 28];
  const v0 = keyframes[0].value;
  const events: SpringEvent[] = [];
  let prev = v0;
  for (let i = 1; i < keyframes.length; i++) {
    const kf = keyframes[i];
    events.push({ t: kf.t, d: kf.value - prev, sp: kf.sp ?? sp });
    prev = kf.value;
  }
  return multiSpringValue(t, v0, events, opts);
}

/** Deterministic mulberry32 PRNG (motion-craft `createSeededRandom`). Pure. */
export function createSeededRandom(seed: string | number): () => number {
  let a = 0;
  if (typeof seed === "string") {
    for (let i = 0; i < seed.length; i++) a = (a * 31 + seed.charCodeAt(i)) | 0;
  } else {
    a = seed | 0;
  }
  if (a === 0) a = 123456789;
  return function mulberry32(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Three integers -> [0,1), well mixed (core.js `hash`). */
export function hashNoise(a: number, b = 0, c = 0): number {
  let h = Math.imul((a | 0) ^ 0x3c6ef372, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13) ^ (b | 0), 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16) ^ (c | 0), 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth seeded noise in [-1,1] that loops exactly over `dur` (core.js `loopNoise`). */
export function loopNoise(t: number, n: number, seed: number, dur = 1): number {
  const cyc = (cycles: number, phase: number): number => Math.PI * 2 * (cycles * t / dur + phase);
  return (
    Math.sin(cyc(n, hashNoise(seed, 1))) +
    0.5 * Math.sin(cyc(2 * n + 1, hashNoise(seed, 2))) +
    0.25 * Math.sin(cyc(4 * n + 3, hashNoise(seed, 3)))
  ) / 1.75;
}

/* ------------------------------------------------------------------ *
 * Compile-time easing + SVG morph/projection wrappers.
 * These run in Node (bezier-easing / svg-path-commander) and emit pure data
 * or pure expressions; the libraries are never injected into Cavalry.
 * ------------------------------------------------------------------ */

/** Cubic-bezier easing function via `bezier-easing` (Newton-Raphson solver). */
export function cubicBezierEasing(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  return Bezier(x1, y1, x2, y2);
}

/**
 * Sample a cubic-bezier easing into `[t, eased]` pairs for baking pure keyframes.
 * `handles` = `[x1, y1, x2, y2]`. Endpoints are exact (0 -> 0, 1 -> 1).
 */
export function sampleBezierEasing(handles: [number, number, number, number], steps = 24): Array<[number, number]> {
  const ease = Bezier(handles[0], handles[1], handles[2], handles[3]);
  const total = Math.max(2, Math.round(steps));
  const out: Array<[number, number]> = [];
  for (let i = 0; i <= total; i++) {
    const t = i / total;
    out.push([Math.round(t * 10000) / 10000, Math.round(ease(t) * 10000) / 10000]);
  }
  return out;
}

export interface MorphPaths {
  from: string;
  to: string;
  segmentCount: number;
}

/**
 * Equalize two SVG paths for morphing via `svg-path-commander.equalizePaths`:
 * both outputs share the same segment count/command order so a per-segment
 * interpolation is valid. Runs at compile time; returns plain path strings.
 */
export function equalizeMorphPaths(pathA: string, pathB: string, round: number | "off" = 4): MorphPaths {
  const [a, b] = SVGPathCommander.equalizePaths(pathA, pathB);
  return {
    from: SVGPathCommander.pathToString(a, round),
    to: SVGPathCommander.pathToString(b, round),
    segmentCount: a.length,
  };
}

/**
 * Equalize two paths at the sub-segment level (`equalizeSegments`) for smoother
 * morphs where curve subdivision matters more than command matching.
 */
export function equalizeMorphSegments(pathA: string, pathB: string, round: number | "off" = 4): MorphPaths {
  const [a, b] = SVGPathCommander.equalizeSegments(pathA, pathB);
  return {
    from: SVGPathCommander.pathToString(a, round),
    to: SVGPathCommander.pathToString(b, round),
    segmentCount: a.length,
  };
}

export interface Path3DTransform {
  /** `[rx, ry, rz]` degrees, or a single Z rotation. */
  rotate?: number | [number, number, number];
  translate?: number | [number, number, number];
  scale?: number | [number, number, number];
  skew?: number | [number, number];
  /** Transform origin `[x, y, z]`; z != 0 enables perspective projection. */
  origin?: [number, number, number];
  /** Convenience perspective distance (sets origin z). 0/undefined = orthographic. */
  perspective?: number;
}

/**
 * Project an SVG path through a 3D DOMMatrix (`svg-path-commander.transformPath`)
 * with `[rx, ry, rz]` rotation. origin z (or `perspective`) selects orthographic
 * (z = 0) vs perspective (z != 0) projection. Compile-time; returns a 2D path.
 */
export function projectPath3D(path: string, transform: Path3DTransform = {}, round: number | "off" = 4): string {
  const origin: [number, number, number] = transform.origin
    ? [transform.origin[0], transform.origin[1], transform.origin[2] ?? 0]
    : [0, 0, 0];
  if (transform.perspective != null) origin[2] = transform.perspective;
  const spec: Record<string, unknown> = { origin };
  if (transform.rotate != null) spec.rotate = transform.rotate;
  if (transform.translate != null) spec.translate = transform.translate;
  if (transform.scale != null) spec.scale = transform.scale;
  if (transform.skew != null) spec.skew = transform.skew;
  const out = SVGPathCommander.transformPath(path, spec);
  return SVGPathCommander.pathToString(out, round);
}
