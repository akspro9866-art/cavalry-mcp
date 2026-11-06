/**
 * The procedural-rig vocabulary outside the injected runtime.
 *
 * "_mg.rig" (src/runtime/mg_helpers.ts) is the implementation that runs inside
 * Cavalry; this module is its TypeScript twin, used for anything that has to
 * reason about a rig without a bridge: preset metadata, cavalry_list_presets,
 * the library's static checks and refclone's pre-render contract validator.
 *
 * The two must agree. test/preset_rig_metadata.test.ts runs a grid of specs
 * through both and fails on any divergence, so a change to the runtime maths
 * cannot quietly make the advertised metadata wrong.
 *
 * Terms (all frame-based, matching the second-order spring model):
 *   stiffness      k, spring constant per unit mass (frame^-2)
 *   damping        c, either a ratio (at or below 1) or a coefficient in force per frame
 *   dampingRatio   zeta = c / (2 * sqrt(k * m))
 *   overshoot      Os = exp(-zeta*pi / sqrt(1 - zeta^2)), first peak past rest
 *   holdFrames     frames a move waits before it starts
 *   staggerOffset  frames between consecutive followers of a staggered group
 */
import { RB_HELPERS_SOURCE } from "../presets/rig_builders.js";

export type RigTerm = "stiffness" | "damping" | "dampingRatio" | "overshoot" | "staggerOffset" | "holdFrames";

/** Fallbacks "_mg.rig" applies; also what Cavalry 2.8's magic easings are tuned against. */
export const RIG_DEFAULTS = { mass: 1, stiffness: 100, dampingRatio: 0.5, holdFrames: 0, staggerOffset: 4 } as const;

export interface RigSpec {
  mass?: number;
  stiffness?: number;
  damping?: number;
  dampingRatio?: number;
  overshoot?: number;
  holdFrames?: number;
  staggerOffset?: number;
  stagger?: number;
}

export interface RigNumbers extends RigSpec {
  mass: number;
  stiffness: number;
  dampingRatio: number;
  dampingCoefficient: number;
  angularFrequency: number;
  dampedFrequency: number;
  cyclesPerFrame: number;
  overshoot: number;
  underdamped: boolean;
  holdFrames: number;
  staggerOffset: number;
  easing: string;
}

const round4 = (value: number) => Math.round(value * 10000) / 10000;
const round3 = (value: number) => Math.round(value * 1000) / 1000;
const num = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/** First-peak overshoot of an underdamped spring; 0 once zeta reaches 1. */
export function overshootFromDampingRatio(zeta: number): number {
  if (!(zeta < 1) || zeta < 0) return 0;
  return Math.exp((-zeta * Math.PI) / Math.sqrt(1 - zeta * zeta));
}

/** The damping ratio that first peaks at `overshoot` (fraction, not percent). */
export function dampingRatioFromOvershoot(overshoot: number): number {
  const os = Math.min(Math.max(overshoot > 1 ? overshoot / 100 : overshoot, 1e-6), 0.999);
  const l = Math.log(os);
  return -l / Math.sqrt(Math.PI * Math.PI + l * l);
}

/**
 * Mirror of "_mg.rig". Same clamps (zeta 0..1.5, stiffness and mass floored at
 * 1e-6), same rounding, same easing pick.
 */
export function rigNumbers(spec: RigSpec = {}): RigNumbers {
  const mass = Math.max(num(spec.mass, RIG_DEFAULTS.mass), 1e-6);
  const stiffness = Math.max(num(spec.stiffness, RIG_DEFAULTS.stiffness), 1e-6);
  const omega0 = Math.sqrt(stiffness / mass);
  let zeta: number | null = null;
  if (spec.dampingRatio != null) zeta = num(spec.dampingRatio, RIG_DEFAULTS.dampingRatio);
  else if (spec.damping != null) {
    const d = num(spec.damping, 0);
    zeta = d <= 1 ? d : d / (2 * Math.sqrt(stiffness * mass));
  }
  const requestedOvershoot = spec.overshoot != null ? num(spec.overshoot, 0) : null;
  if (requestedOvershoot != null && requestedOvershoot > 0 && zeta == null) {
    zeta = dampingRatioFromOvershoot(requestedOvershoot);
  }
  if (zeta == null) zeta = RIG_DEFAULTS.dampingRatio;
  zeta = Math.max(0, Math.min(1.5, zeta));
  const omegaD = zeta < 1 ? omega0 * Math.sqrt(1 - zeta * zeta) : 0;
  const impliedOvershoot = overshootFromDampingRatio(zeta);
  return {
    mass,
    stiffness,
    dampingRatio: round4(zeta),
    dampingCoefficient: round4(2 * zeta * omega0 * mass),
    angularFrequency: round4(omega0),
    dampedFrequency: round4(omegaD),
    cyclesPerFrame: round4(omegaD / (2 * Math.PI)),
    overshoot: round3(impliedOvershoot),
    underdamped: zeta < 1,
    holdFrames: Math.max(0, Math.round(num(spec.holdFrames, RIG_DEFAULTS.holdFrames))),
    staggerOffset: Math.max(1, Math.round(num(spec.staggerOffset != null ? spec.staggerOffset : spec.stagger, RIG_DEFAULTS.staggerOffset))),
    easing: zeta >= 1 ? "SlowOut" : impliedOvershoot >= 0.2 ? "OvershootOut" : "SpringOut",
  };
}

/**
 * The accepted magic-easing names, read out of the injected "_rb" source rather
 * than restated here. A preset that asks for a name outside this table silently
 * falls back to SlowInSlowOut at runtime, which is exactly the drift a metadata
 * pass should catch — so the table keeps one owner.
 */
function readEaseTable(block: RegExp, collect: (entry: string) => string[]): string[] {
  const match = RB_HELPERS_SOURCE.match(block);
  if (!match) throw new Error("rig_terms: could not read the easing table out of RB_HELPERS_SOURCE");
  const out: string[] = [];
  for (const entry of match[1].split(",")) out.push(...collect(entry.trim()));
  if (!out.length) throw new Error("rig_terms: the easing table parsed empty");
  return [...new Set(out)];
}

/** Names a caller may write (QuartOut, ExpoIn, ...) — the aliases "_rb.ease" folds. */
export const EASE_ALIASES: string[] = readEaseTable(/EASE_MAP:\s*\{([\s\S]*?)\n\s*\}/, entry => {
  const pair = entry.match(/^([A-Za-z]+)\s*:\s*"([^"]+)"$/);
  return pair ? [pair[1], pair[2]] : [];
});

/** Names api.magicEasing accepts verbatim — the canonical set. */
export const EASE_VALID: string[] = readEaseTable(/EASE_VALID:\s*\[([\s\S]*?)\]/, entry => {
  const name = entry.replace(/["'\s]/g, "");
  return /^[A-Za-z]+$/.test(name) ? [name] : [];
});

/** Every easing name a script can mention, canonical or alias. */
export const EASE_NAMES: string[] = [...new Set([...EASE_ALIASES, ...EASE_VALID])];

/** Which easing names a preset script can reach, in source order. */
export function easingsInCode(code: string): string[] {
  const found: string[] = [];
  for (const match of code.matchAll(/["']([A-Za-z][A-Za-z0-9]*)["']/g)) {
    const name = match[1];
    if (EASE_NAMES.includes(name) && !found.includes(name)) found.push(name);
  }
  return found;
}

/**
 * Default easing of each _rb builder, read off the injected source: a builder
 * called without an explicit `ease` animates with whatever its body falls back
 * to (pop -> SpringOut, fade -> SlowInSlowOut, ...). A preset's own code never
 * mentions those names, so scanning the preset alone would report an eased rig
 * for a preset that pops on a spring.
 *
 * test/preset_rig_metadata.test.ts compares this table against _rb.ease() run in
 * a vm, so a builder whose default moves cannot quietly mislabel the library.
 */
export const RB_HELPER_EASES: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  const header = /^ {2}([A-Za-z][A-Za-z0-9_]*)\(/gm;
  const bodies: Array<[string, number]> = [];
  for (const match of RB_HELPERS_SOURCE.matchAll(header)) bodies.push([match[1], (match.index ?? 0) + match[0].length]);
  for (let i = 0; i < bodies.length; i++) {
    const [name, start] = bodies[i];
    const end = i + 1 < bodies.length ? bodies[i + 1][1] - 4 : RB_HELPERS_SOURCE.length;
    const body = RB_HELPERS_SOURCE.slice(start, end);
    const fallback = body.match(/ease\w*\s*\|\|\s*["']([A-Za-z]+)["']/);
    if (fallback && EASE_NAMES.includes(fallback[1])) out[name] = fallback[1];
  }
  return out;
})();

/** Easings a script reaches through _rb builders it calls without an explicit ease. */
export function helperEasingsInCode(code: string): string[] {
  const found: string[] = [];
  for (const match of code.matchAll(/_rb\.([A-Za-z][A-Za-z0-9_]*)\(/g)) {
    const name = match[1];
    const def = RB_HELPER_EASES[name];
    if (def && !found.includes(def)) found.push(def);
  }
  return found;
}

/** Which rig term a preset parameter name stands for, or null when it is not a rig knob. */
export function rigTermForParam(name: string): RigTerm | null {
  const key = name.charAt(0).toLowerCase() + name.slice(1);
  if (/^(stiffness|springStiffness)$/.test(key)) return "stiffness";
  if (/^dampingRatio$/.test(key)) return "dampingRatio";
  if (/^damping$/.test(key)) return "damping";
  if (/^overshoot$/.test(key)) return "overshoot";
  if (/^(stagger|staggerOffset|delay|delayFrames)$/.test(key)) return "staggerOffset";
  if (/^(hold|holdFrames)$/.test(key)) return "holdFrames";
  return null;
}

export interface PresetRigTerms extends Omit<RigNumbers, "easing"> {
  /** "spring" when the script can reach a Spring or SmallSpring easing. */
  springKind: "spring" | "eased";
  /** Every easing name the script mentions, in source order. */
  easings: string[];
  /** The easing a refinement pass should retune first: a spring when there is one. */
  easing: string;
  /** What "_mg.rig" picks for these numbers — the metadata's own sanity check. */
  suggestedEasing: string;
  /** rig term to the preset parameter that controls it, when the preset exposes one. */
  tunable: Partial<Record<RigTerm, string>>;
}

/** A preset's optional hand-declared rig block: numbers plus an explicit easing name. */
export type PresetRigOverride = Partial<RigSpec> & { easing?: string };

/**
 * Derive the rig contract of one preset: the numbers its script will actually run
 * with, plus which of its declared parameters a caller can retune. It reads the
 * preset's own parameter defaults, so it stays true as the library grows and
 * needs no hand-maintained table.
 *
 * "def.rig" wins last, for the rare script whose easing is data-driven and so
 * cannot be read off the source.
 */
export function derivePresetRig(def: {
  code: string;
  params?: Record<string, { type: string; default: unknown }>;
  rig?: PresetRigOverride | null;
}): PresetRigTerms {
  const spec: RigSpec = {};
  const tunable: Partial<Record<RigTerm, string>> = {};
  for (const [name, param] of Object.entries(def.params ?? {})) {
    const term = rigTermForParam(name);
    if (!term) continue;
    if (param.type === "int" || param.type === "double") {
      spec[term] = Number(param.default);
      tunable[term] = name;
    }
  }
  if (def.rig) {
    const numbers: RigSpec = { ...def.rig };
    delete (numbers as { easing?: string }).easing;
    Object.assign(spec, numbers);
  }
  const { easing: suggestedEasing, ...rest } = rigNumbers(spec);
  const easings = [...new Set([...easingsInCode(def.code), ...helperEasingsInCode(def.code)])];
  const springKind: "spring" | "eased" = easings.some(name => name.includes("Spring")) ? "spring" : "eased";
  const easing =
    def.rig?.easing != null
      ? String(def.rig.easing)
      : easings.includes(suggestedEasing)
        ? suggestedEasing
        : easings.find(name => name.includes("Spring")) ?? easings[0] ?? "SlowInSlowOut";
  return { ...rest, easing, suggestedEasing, springKind, easings, tunable };
}
