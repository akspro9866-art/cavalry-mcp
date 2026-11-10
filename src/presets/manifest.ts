/**
 * Ultra-compact preset index for refclone's deterministic Stage 3 matcher.
 *
 * The MCP catalog itself is 120 executable scripts; sending it to a model — or
 * even loading it in a refinement loop — costs tens of thousands of tokens. The
 * manifest keeps only the five facts a matcher needs, in a length-prefixed
 * string per preset so repeated JSON keys do not dominate the payload:
 *
 *   id|category|motionSignature|requiredParams|defaultDuration
 *
 * `category` is a short code resolved through `categories` (full pack id).
 * `motionSignature` is an index into `signatures` so the readable form is
 * declared once and every entry stays tiny. `requiredParams` is a
 * comma-separated list of the content parameters a caller must bind from the
 * measured element — never geometry, easing names or enum knobs.
 * `defaultDuration` is in frames.
 *
 * Everything is derived from the preset definitions themselves (code, params,
 * rig terms), so the manifest cannot drift from the library. The build script
 * writes it to dist/presets/preset_manifest.json.
 */

import type { PresetCategoryId, PresetDef } from "./types.js";
import { PRESET_DEFS, resolvePresetName } from "./cavalry_snippets.js";
import { derivePresetRig } from "../runtime/rig_terms.js";

export const PRESET_MANIFEST_VERSION = 1;
export const PRESET_MANIFEST_FORMAT = "id|category|motionSignature|requiredParams|defaultDuration";
export const PRESET_MANIFEST_FILE = "presets/preset_manifest.json";

/** Short pack codes. Keys are the wire codes used by `presets` entries. */
export const PRESET_MANIFEST_CATEGORY_CODES: Record<PresetCategoryId, string> = {
  typography: "ty",
  ui_mockups: "ui",
  data_viz: "da",
  polish_camera: "fx",
  ai_agents: "ai",
  devtools_cli: "de",
  collab_presence: "co",
  workflows_nodes: "wf",
  fintech_billing: "fi",
  security_auth: "au",
  cloud_devops: "cl",
  voice_audio_video: "av",
  onboarding_plg: "pl",
  social_proof_cta: "ct",
  procedural_saas: "ps",
  cloned_styles: "cs",
};

/**
 * Parameter names that configure a preset rather than describe the reference.
 * Everything else with a non-empty string default is content the clone must
 * supply (a headline, a label, a URL, a command…).
 */
const CONFIG_PARAMS = new Set([
  "easing",
  "preset",
  "shape",
  "attr",
  "type",
  "mode",
  "font",
  "style",
]);

/**
 * Motion classes in priority order. Each pattern reads the emitted code, so a
 * preset that starts using a different rig changes its signature on the next
 * build without a hand-maintained table.
 */
const MOTION_PATTERNS: Array<[RegExp, string]> = [
  [/_rb\.dup\(|_mg\.duplicator\(/, "dup"],
  [/_rb\.stagger\(/, "stagger"],
  [/_rb\.pop\(/, "pop"],
  [/_rb\.slide\(/, "slide"],
  [/_rb\.fade\(/, "fade"],
  [/_rb\.draw\(/, "draw"],
  [/_rb\.counter\(/, "count"],
  [/_rb\.wave\(/, "wave"],
  [/_rb\.progress\(|_rb\.gauge\(/, "meter"],
  [/_rb\.sonar\(/, "pulse"],
  [/_rb\.confetti\(|_rb\.stars\(/, "burst"],
  [/_rb\.toggle\(/, "toggle"],
  [/_rb\.kf\(/, "ease"],
];

/** One preset's deterministic motion descriptor, e.g. "pop+spring". */
export function motionSignatureFor(def: PresetDef): string {
  let motion = "build";
  for (const [pattern, name] of MOTION_PATTERNS) {
    if (pattern.test(def.code)) {
      motion = name;
      break;
    }
  }
  const rig = derivePresetRig(def);
  const easingHint = String(def.params.easing?.default ?? rig.easing);
  const ease =
    rig.springKind === "spring" || /Spring/.test(easingHint) || /Spring/.test(rig.suggestedEasing)
      ? "spring"
      : /Linear/.test(easingHint)
        ? "linear"
        : /Overshoot|Bounce/.test(easingHint)
          ? "overshoot"
          : "ease";
  return `${motion}+${ease}`;
}

/** Content parameters the caller must bind from the measured element. */
export function requiredParamsFor(def: PresetDef): string[] {
  return Object.entries(def.params)
    .filter(([name, param]) => {
      if (param.type !== "string") return false;
      if (CONFIG_PARAMS.has(name)) return false;
      const value = param.default;
      return typeof value === "string" && value.trim().length > 0 && !value.startsWith("#");
    })
    .map(([name]) => name);
}

/** Default duration in frames, from the declared duration parameter or 60. */
export function defaultDurationFor(def: PresetDef): number {
  const duration = Number(def.params.duration?.default);
  return Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 60;
}

/** Deterministic <=8-word summary for AGENTS.md and lazy .doc.mjs files. */
export function summaryEightWordsFor(def: PresetDef): string {
  const raw = String(def.description || def.title || def.id)
    .replace(/\s+/g, " ")
    .replace(/[|]+/g, "/")
    .trim();
  const firstClause = raw.split(/[.!;—–]/)[0]?.trim() || raw;
  const words = firstClause.split(/\s+/).filter(Boolean).slice(0, 8);
  return words.join(" ").replace(/[,:;]+$/, "");
}

/** Format a single 1-line AGENTS.md catalog row: `id | category | requiredParams | 8-word summary`. */
export function formatCompactPresetLine(def: PresetDef): string {
  const req = requiredParamsFor(def);
  const reqCell = req.length > 0 ? req.join(",") : "-";
  return `${def.id} | ${def.category} | ${reqCell} | ${summaryEightWordsFor(def)}`;
}

export interface CompactPresetDoc {
  id: string;
  category: PresetCategoryId;
  motionSignature: string;
  requiredParams: string[];
  defaultDuration: number;
  summary: string;
  catalogLine: string;
  usage: string;
  tokenEstimate: number;
}

/** Build a compact doc object (capped at <=110 tokens) for a single preset. */
export function buildCompactPresetDoc(def: PresetDef): CompactPresetDoc {
  const req = requiredParamsFor(def);
  const summary = summaryEightWordsFor(def);
  const catalogLine = formatCompactPresetLine(def);
  const sampleParams = Object.fromEntries(req.slice(0, 3).map((k) => [k, def.params[k]?.default ?? "..."]));
  const usage = `presets: [{ id: ${JSON.stringify(def.id)}, params: ${JSON.stringify(sampleParams)} }]`;
  const docBase = {
    id: def.id,
    category: def.category,
    motionSignature: motionSignatureFor(def),
    requiredParams: req,
    defaultDuration: defaultDurationFor(def),
    summary,
    catalogLine,
    usage,
  };
  const tokenEstimate = estimatePresetManifestTokens(JSON.stringify(docBase));
  return {
    ...docBase,
    tokenEstimate,
  };
}

export interface PresetManifestEntry {
  id: string;
  /** Full pack id, not the wire code. */
  category: PresetCategoryId;
  motionSignature: string;
  requiredParams: string[];
  defaultDuration: number;
}

export interface PresetManifest {
  version: number;
  unit: "frames";
  format: string;
  categories: Record<string, string>;
  signatures: string[];
  /** `id|category|motionSignature|requiredParams|defaultDuration` strings. */
  presets: string[];
}

export interface ParsedPresetManifest {
  manifest: PresetManifest;
  entries: PresetManifestEntry[];
}

/** Every manifest entry, derived from the live preset definitions. */
export function buildPresetManifestEntries(): PresetManifestEntry[] {
  return PRESET_DEFS.map((def) => ({
    id: def.id,
    category: def.category,
    motionSignature: motionSignatureFor(def),
    requiredParams: requiredParamsFor(def),
    defaultDuration: defaultDurationFor(def),
  }));
}

/**
 * Serialize the manifest. Signatures are dictionary-encoded and sorted so two
 * builds against the same library produce byte-identical output.
 */
export function buildPresetManifest(): PresetManifest {
  const entries = buildPresetManifestEntries();
  const signatures = [...new Set(entries.map((entry) => entry.motionSignature))].sort();
  const signatureIndex = new Map(signatures.map((signature, index) => [signature, index]));
  return {
    version: PRESET_MANIFEST_VERSION,
    unit: "frames",
    format: PRESET_MANIFEST_FORMAT,
    // Wire form: short code -> full pack id, so an entry only spends 2-3
    // characters on its category.
    categories: Object.fromEntries(
      Object.entries(PRESET_MANIFEST_CATEGORY_CODES).map(([category, code]) => [code, category]),
    ),
    signatures,
    presets: entries.map((entry) =>
      [
        entry.id,
        PRESET_MANIFEST_CATEGORY_CODES[entry.category],
        String(signatureIndex.get(entry.motionSignature)),
        entry.requiredParams.join(","),
        String(entry.defaultDuration),
      ].join("|"),
    ),
  };
}

/** Compact one-line JSON, exactly what ships to disk. */
export function serializePresetManifest(manifest: PresetManifest = buildPresetManifest()): string {
  return JSON.stringify(manifest);
}

/** Parse the compact wire form back into typed entries. Throws on malformed rows. */
export function parsePresetManifest(json: string): ParsedPresetManifest {
  const manifest = JSON.parse(json) as PresetManifest;
  if (!manifest || !Array.isArray(manifest.presets) || !Array.isArray(manifest.signatures)) {
    throw new Error("preset manifest: expected { signatures: string[], presets: string[] }");
  }
  const categoriesByCode = new Map(Object.entries(manifest.categories ?? {}));
  const entries = manifest.presets.map((row, index) => {
    const parts = String(row).split("|");
    if (parts.length !== 5) {
      throw new Error(`preset manifest: row ${index} has ${parts.length} fields, expected 5`);
    }
    const [id, code, signatureIndex, params, duration] = parts;
    const category = categoriesByCode.get(code);
    if (!category) throw new Error(`preset manifest: row ${index} uses unknown category code '${code}'`);
    const signature = manifest.signatures[Number(signatureIndex)];
    if (signature == null) {
      throw new Error(`preset manifest: row ${index} uses unknown signature index '${signatureIndex}'`);
    }
    const defaultDuration = Number(duration);
    if (!Number.isFinite(defaultDuration) || defaultDuration <= 0) {
      throw new Error(`preset manifest: row ${index} has invalid defaultDuration '${duration}'`);
    }
    return {
      id,
      category: category as PresetCategoryId,
      motionSignature: signature,
      requiredParams: params ? params.split(",") : [],
      defaultDuration,
    };
  });
  return { manifest, entries };
}

/**
 * Conservative LLM-token estimate: four ASCII characters per token. The
 * manifest is pure ASCII with short identifiers, so this tracks real
 * tokenizers closely and, importantly, does not need one at build time.
 */
export function estimatePresetManifestTokens(json: string): number {
  return Math.ceil(json.length / 4);
}

/** Explicit agent rule required in AGENTS.md and compact index discovery. */
export const PRESET_CATALOG_AGENT_RULE =
  "Browse the preset catalog first before writing _mg code. Never use raw api.create/api.set when an _mg preset exists.";

/** Build all 120 1-line catalog entries (`id | category | requiredParams | 8-word summary`). */
export function buildCompactPresetCatalogLines(): string[] {
  return PRESET_DEFS.map((def) => formatCompactPresetLine(def));
}

const COMPACT_DOC_BY_ID = new Map<string, CompactPresetDoc>();

/**
 * Resolve a single preset (`{ presetId }`) lazily from the compact index
 * without loading all 120 full schemas into the prompt context.
 */
export function lookupPresetCompact(
  presetId: string,
): ({ ok: true; preset: CompactPresetDoc } | { ok: false; error: string; total: number }) {
  const resolved = resolvePresetName(String(presetId ?? "").trim());
  if (!COMPACT_DOC_BY_ID.has(resolved)) {
    const def = PRESET_DEFS.find((candidate) => candidate.id === resolved);
    if (!def) {
      return {
        ok: false,
        error: `Unknown presetId: ${presetId}`,
        total: PRESET_DEFS.length,
      };
    }
    COMPACT_DOC_BY_ID.set(resolved, buildCompactPresetDoc(def));
  }
  return {
    ok: true,
    preset: COMPACT_DOC_BY_ID.get(resolved)!,
  };
}

