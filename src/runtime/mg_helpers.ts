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
