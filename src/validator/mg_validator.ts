/**
 * Pre-flight `_mg` AST & attribute alias validator.
 *
 * Every `_mg` payload that is about to be compiled or POSTed to Stallion goes
 * through here first. Two jobs:
 *
 *   1. **Structure** — a Zod schema rejects malformed manifests with a
 *      deterministic, actionable message (which entry, which key, what was
 *      expected) before a single token of bridge time is spent on it.
 *   2. **Aliases** — an automatic Cavalry 2.8.0 attribute normalizer rewrites
 *      the attribute names LLMs hallucinate most onto the real paths
 *      (`fillColor` → `material.fillColor`, `rot` → `rotation`, …). Every
 *      rewrite is recorded in `fixes[]`; unknown-but-plausible aliases are
 *      reported instead of guessed at.
 *
 * Preset ids referenced by a manifest's `presets` array are validated against
 * the 14 category packs; a near miss auto-resolves (alias table first, then a
 * bounded edit-distance match), and a real miss returns the top 3 candidates
 * so the caller can correct course in one turn.
 *
 * This module is allowed to import zod; it must stay out of `src/lib` (which
 * is the pure, zod-free surface refclone embeds).
 */

import { z } from "zod";
import { PRESET_ALIASES, PRESET_DEFS, resolvePresetName } from "../presets/cavalry_snippets.js";

// ---------------------------------------------------------------------------
// Attribute alias table
// ---------------------------------------------------------------------------

/**
 * Hallucinated alias → canonical Cavalry 2.8.0 attribute path. Only
 * unambiguous, non-destructive mappings belong here: the value shape must be
 * identical on both sides (a color string maps to a color attribute, a number
 * path to a number path).
 */
export const ATTRIBUTE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  // Fill
  fillcolor: "material.fillColor",
  "fill.color": "material.fillColor",
  fillcolour: "material.fillColor",
  fill: "material.fillColor",
  // Stroke
  strokecolor: "stroke.strokeColor",
  "stroke.color": "stroke.strokeColor",
  strokecolour: "stroke.strokeColor",
  strokewidth: "stroke.strokeWidth",
  // Transform
  pos: "position",
  positionx: "position.x",
  positiony: "position.y",
  rot: "rotation",
  alpha: "opacity",
  opactiy: "opacity",
  scl: "scale",
});

/** Look up the canonical path for an attribute name, or null when it is not an alias. */
export function canonicalAttribute(name: string): string | null {
  const key = String(name ?? "").trim();
  if (!key) return null;
  return ATTRIBUTE_ALIASES[key.toLowerCase()] ?? null;
}

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const attrsSchema = z.record(z.string(), z.unknown());

const easingSpecSchema = z.object({
  attr: z.string().min(1),
  easing: z.string().min(1),
  expression: z.string().optional(),
});

const layerSpecSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("shape"),
    as: z.string().min(1, "layer `as` alias must be a non-empty string"),
    shape: z.string().min(1, "a shape layer needs a primitive `shape` (rectangle, ellipse, polygon, …)"),
    name: z.string().optional(),
    attrs: attrsSchema.optional(),
  }),
  z.object({
    kind: z.literal("layer"),
    as: z.string().min(1),
    layerType: z.string().min(1, "a layer entry needs a Cavalry `layerType` (group, preComp, null, …)"),
    name: z.string().optional(),
    attrs: attrsSchema.optional(),
  }),
  z.object({
    kind: z.literal("text"),
    as: z.string().min(1),
    text: z.string(),
    size: z.number().optional(),
    color: z.string().optional(),
    font: z.string().optional(),
    name: z.string().optional(),
    attrs: attrsSchema.optional(),
  }),
  z.object({
    kind: z.literal("svg"),
    as: z.string().min(1),
    file: z.string().min(1, "an svg layer needs a scene-URI `file` (forward slashes)"),
    name: z.string().optional(),
    attrs: attrsSchema.optional(),
  }),
  z.object({
    kind: z.literal("image"),
    as: z.string().min(1),
    file: z.string().min(1, "an image layer needs a scene-URI `file` (forward slashes)"),
    name: z.string().optional(),
    attrs: attrsSchema.optional(),
  }),
]);

const keyframeEntrySchema = z.object({
  frame: z.number(),
  attrs: attrsSchema,
});

const opSpecSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set"), target: z.string().min(1), attrs: attrsSchema }),
  z.object({
    op: z.literal("keyframe"),
    target: z.string().min(1),
    frames: z.array(keyframeEntrySchema).min(1, "a keyframe op needs at least one {frame, attrs} entry"),
    easing: z.union([easingSpecSchema, z.array(easingSpecSchema)]).optional(),
  }),
  z.object({
    op: z.literal("easing"),
    target: z.string().min(1),
    attr: z.string().min(1),
    frame: z.number().finite(),
    easing: z.string().min(1),
    expression: z.string().optional(),
  }),
  z.object({
    op: z.literal("connect"),
    from: z.string().min(1),
    fromAttr: z.string().min(1),
    to: z.string().min(1),
    toAttr: z.string().min(1),
    force: z.boolean().optional(),
  }),
  z.object({
    op: z.literal("expression"),
    target: z.string().min(1),
    attrPath: z.string().min(1),
    expression: z.string().min(1),
  }),
  z.object({ op: z.literal("delete"), targets: z.array(z.string().min(1)).min(1) }),
  z.object({ op: z.literal("order"), target: z.string().min(1), to: z.enum(["forward", "front", "backward", "back"]) }),
  z.object({
    op: z.literal("fit"),
    target: z.string().min(1),
    box: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
    space: z.enum(["comp", "raster"]).optional(),
    compWidth: z.number().optional(),
    compHeight: z.number().optional(),
    tolerance: z.number().optional(),
    preserveAspect: z.boolean().optional(),
  }),
]);

export const mgManifestSchema = z.object({
  comp: z
    .object({
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      fps: z.number().positive().optional(),
      endFrame: z.number().int().positive().optional(),
      bg: z.string().optional(),
    })
    .optional(),
  layers: z.array(layerSpecSchema).max(500).optional(),
  ops: z.array(opSpecSchema).max(5000).optional(),
  presets: z
    .array(
      z.object({
        id: z.string().min(1, "a preset invocation needs its library `id`"),
        params: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .max(16)
    .optional(),
});

/** Deep-ish structural type used by the normalizer after Zod validation. */
export type ValidatedMgManifest = z.infer<typeof mgManifestSchema>;

// ---------------------------------------------------------------------------
// Preset fuzzy matching
// ---------------------------------------------------------------------------

/** Bounded Damerau-Levenshtein distance (optimal string alignment). */
export function editDistance(a: string, b: string, max = 8): number {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let prevPrev: number[] | null = null;
  let prev = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i++) {
    const cur = [i];
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, (prevPrev?.[j - 2] ?? max + 1) + 1);
      }
      cur[j] = value;
    }
    prevPrev = prev;
    prev = cur;
  }
  return prev[lb];
}

/**
 * Top `limit` preset ids closest to `query`. Ranking: substring containment
 * first (an id that starts with the query wins), then edit distance, then
 * alphabetical for determinism.
 */
export function fuzzyMatchPresets(query: string, limit = 3): Array<{ id: string; score: number }> {
  const wanted = String(query ?? "").trim().toLowerCase();
  if (!wanted) return [];
  const scored = PRESET_DEFS.map((def) => {
    const id = def.id.toLowerCase();
    let score: number;
    if (id === wanted) score = 0;
    else if (id.includes(wanted) || wanted.includes(id)) score = 1 + Math.abs(id.length - wanted.length) / 100;
    else score = 2 + editDistance(id, wanted) / Math.max(id.length, wanted.length);
    return { id: def.id, score };
  });
  scored.sort((a, b) => a.score - b.score || (a.id < b.id ? -1 : 1));
  // Always return the top `limit` — a caller that mistyped an id needs
  // candidates, not a wall of silence. Bounded by the library size.
  return scored.slice(0, limit);
}

/** Validate (and auto-resolve) every preset id in a manifest. */
function normalizePresetInvocations(
  invocations: Array<{ id: string; params?: Record<string, unknown> }> | undefined,
  fixes: AttributeFix[],
  errors: string[],
): Array<{ id: string; params?: Record<string, unknown> }> | undefined {
  if (!Array.isArray(invocations)) return undefined;
  const out: Array<{ id: string; params?: Record<string, unknown> }> = [];
  for (let index = 0; index < invocations.length; index++) {
    const invocation = invocations[index];
    const raw = String(invocation?.id ?? "").trim();
    let resolved = "";
    try {
      resolved = resolvePresetName(raw);
    } catch {
      resolved = raw;
    }
    if (PRESET_DEFS.some((def) => def.id === resolved)) {
      if (resolved !== raw) {
        fixes.push({ where: `presets[${index}].id`, from: raw, to: resolved, reason: "preset alias" });
      }
      out.push({ ...invocation, id: resolved });
      continue;
    }
    const knownAlias = PRESET_ALIASES[raw.toLowerCase()];
    if (knownAlias && PRESET_DEFS.some((def) => def.id === knownAlias)) {
      fixes.push({ where: `presets[${index}].id`, from: raw, to: knownAlias, reason: "preset alias table" });
      out.push({ ...invocation, id: knownAlias });
      continue;
    }
    const near = fuzzyMatchPresets(raw, 3);
    const hint = near.length
      ? ` Closest preset ids: ${near.map((hit) => `'${hit.id}'`).join(", ")}.`
      : ` ${PRESET_DEFS.length} presets exist across 14 category packs; discover ids with cavalry_query_presets or cavalry_search_presets.`;
    errors.push(`presets[${index}].id: unknown preset '${raw}'.${hint}`);
  }
  return out.length ? out : undefined;
}

// ---------------------------------------------------------------------------
// Attribute normalization
// ---------------------------------------------------------------------------

export interface AttributeFix {
  /** Where the alias appeared, e.g. `layers[2].attrs` or `ops[0].keyframes[1].attrs`. */
  where: string;
  from: string;
  to: string;
  reason: string;
}

/** Rewrite one attrs record in place, recording every fix. */
function normalizeAttrsRecord(
  attrs: Record<string, unknown>,
  where: string,
  fixes: AttributeFix[],
  unknownAliases: Array<{ where: string; name: string }>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    const canonical = canonicalAttribute(key);
    if (canonical && canonical !== key) {
      fixes.push({ where, from: key, to: canonical, reason: "attribute alias normalized" });
      out[canonical] = value;
      continue;
    }
    if (!canonical && looksLikeAlias(key)) {
      unknownAliases.push({ where, name: key });
    }
    out[key] = value;
  }
  return out;
}

/**
 * Heuristic for "plausible but unknown" attribute names worth reporting: short
 * camelCase tokens without a namespace, or top-level names Cavalry 2.8 would
 * namespace. Deterministic, purely advisory — never blocking.
 */
function looksLikeAlias(name: string): boolean {
  if (name.includes(".")) return false;
  return /^(fill|stroke|color|colour|shadow|blur|radius|cornerRadius|round|size|padding|align|tracking|leading)$/i.test(name);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export interface MgValidationOk {
  ok: true;
  /** The manifest after alias normalization — safe to compile and send. */
  normalized: ValidatedMgManifest;
  fixes: AttributeFix[];
  /** Advisory: attribute names that look like aliases but have no mapping. */
  unknownAliases: Array<{ where: string; name: string }>;
  warnings: string[];
}

export interface MgValidationError {
  ok: false;
  errors: string[];
  /** Present when the failure is a preset-id miss: the top-3 nearest ids. */
  suggestions?: string[];
}

/**
 * Validate and normalize a `_mg` manifest before compile/POST. Never throws —
 * a malformed manifest comes back as `{ ok: false, errors }` with one message
 * per problem, each naming the offending entry and the expected shape.
 */
export function validateMgManifest(manifest: unknown): MgValidationOk | MgValidationError {
  let parsed: ValidatedMgManifest;
  try {
    parsed = mgManifestSchema.parse(manifest);
  } catch (error) {
    const issues =
      typeof error === "object" && error !== null && "issues" in error
        ? (error as { issues: Array<{ path: Array<string | number>; message: string }> }).issues
        : [];
    // Format issue paths as `layers[0].as` rather than zod's `layers.0.as` —
    // the bracket form matches how the rest of the validator names entries.
    const formatPath = (path: Array<string | number>): string =>
      path.reduce<string>((acc, segment) => (typeof segment === "number" ? `${acc}[${segment}]` : (acc ? `${acc}.${segment}` : String(segment))), "");
    const errors = issues.length
      ? issues.map((issue) => `${formatPath(issue.path) || "(root)"}: ${issue.message}`)
      : [`manifest is not a valid _mg manifest: ${error instanceof Error ? error.message : String(error)}`];
    return { ok: false, errors: errors.slice(0, 20) };
  }

  const fixes: AttributeFix[] = [];
  const unknownAliases: Array<{ where: string; name: string }> = [];
  const warnings: string[] = [];

  // Layer creation attrs.
  if (parsed.layers) {
    parsed.layers = parsed.layers.map((layer, index) => {
      if (!layer.attrs) return layer;
      return { ...layer, attrs: normalizeAttrsRecord(layer.attrs, `layers[${index}].attrs`, fixes, unknownAliases) };
    });
  }

  // Op attrs: set / keyframe entries.
  if (parsed.ops) {
    parsed.ops = parsed.ops.map((op, index) => {
      if (op.op === "set") {
        return { ...op, attrs: normalizeAttrsRecord(op.attrs, `ops[${index}].attrs`, fixes, unknownAliases) };
      }
      if (op.op === "keyframe") {
        return {
          ...op,
          frames: op.frames.map((entry, frameIndex) => ({
            ...entry,
            attrs: normalizeAttrsRecord(entry.attrs, `ops[${index}].frames[${frameIndex}].attrs`, fixes, unknownAliases),
          })),
        };
      }
      return op;
    });
  }

  // Preset ids: validate against the library, auto-resolve aliases and near
  // misses, and turn real misses into actionable errors with top-3 matches.
  if (parsed.presets) {
    const firstMissingId = extractFirstPresetId(parsed.presets);
    const errors: string[] = [];
    const normalized = normalizePresetInvocations(parsed.presets, fixes, errors);
    if (!normalized && errors.length) {
      return { ok: false, errors, suggestions: fuzzyMatchPresets(firstMissingId, 3).map((hit) => hit.id) };
    }
    parsed.presets = normalized;
  }

  // Advisory warnings — non-blocking, but they usually mean an alias is missing
  // from the table, so they are reported verbatim to the caller.
  for (const entry of unknownAliases) {
    warnings.push(`${entry.where}: attribute '${entry.name}' is not a known Cavalry 2.8.0 path or alias; pass it verbatim only if the host accepts it.`);
  }

  return { ok: true, normalized: parsed, fixes, unknownAliases, warnings };
}

function extractFirstPresetId(invocations: Array<{ id: string; params?: Record<string, unknown> }> | undefined): string {
  return invocations?.find((invocation) => typeof invocation?.id === "string")?.id ?? "";
}

/**
 * Convenience wrapper: normalize only, throwing on structural errors. For
 * callers that already own their error UX (the strict tool wraps this).
 */
export function normalizeMgManifest(manifest: unknown): ValidatedMgManifest {
  const result = validateMgManifest(manifest);
  if (!result.ok) {
    const error = new Error(result.errors.join("; "));
    error.name = "MgValidationError";
    throw error;
  }
  return result.normalized;
}
