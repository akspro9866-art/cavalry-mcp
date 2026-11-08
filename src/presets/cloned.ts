/**
 * Runtime registry for Stage 6 "cloned style" presets.
 *
 * Presets are NOT imported at build time: every call re-reads
 * `src/presets/cloned/*.json` (or `CAVALRY_MCP_CLONED_DIR`), so a style
 * exported by refclone becomes available without a rebuild or restart.
 *
 * A preset stores normalized scene DNA only:
 *   - layout anchors/sizes are 0..1 ratios of the original comp;
 *   - keyframe times are 0..1 ratios of the original duration;
 *   - frame-like procedural knobs (stagger lags, delay/hold frames) are
 *     0..1 ratios; physical knobs (spring stiffness/damping, oscillator
 *     frequency) and easing expressions are preserved verbatim;
 *   - content is `{{token}}` slots.
 *
 * Hydration resolves slots, scales ratios to the requested comp size /
 * duration and returns a plain `_mg` manifest, which the MCP tool compiles and
 * executes through one Stallion `/batch-step` round trip.
 *
 * Reverse sync (`syncClonedStyleOverrides`) folds a live comp's rig readback
 * (`export_comp_rig_overrides`) back into the preset: procedural/visual attrs
 * land in `rig_overrides` (applied by hydration above `base_attrs`), text
 * sizes land in `font_size` scaled to the preset's default comp width, and
 * frame-like knobs are re-normalized to 0..1 ratios.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { MgDslLayerSpec, MgDslManifest, MgDslOpSpec } from "../runtime/mg_manifest.js";

export const CLONED_STYLE_SCHEMA = "cloned_style_preset.v1";
export const CLONED_STYLE_CATEGORY = "cloned_styles";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const STYLE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** `src/presets/cloned` for a repo checkout, `dist/presets/cloned` for a package. */
export function clonedStylesDir(): string {
  if (process.env.CAVALRY_MCP_CLONED_DIR) return path.resolve(process.env.CAVALRY_MCP_CLONED_DIR);
  const repoRoot = path.resolve(MODULE_DIR, "..", "..");
  const hasSourceTree = fs.existsSync(path.join(repoRoot, "src", "presets"));
  return hasSourceTree
    ? path.join(repoRoot, "src", "presets", "cloned")
    : path.join(MODULE_DIR, "cloned");
}

export interface ClonedStyleSummary {
  id: string;
  description: string;
  default_duration_sec: number;
  slot_keys: string[];
}

export interface ClonedSlotRule {
  type?: string;
  format?: string;
  default?: unknown;
  max_chars?: number;
  max_words?: number;
  line_breaks?: number;
  length?: number;
  min_items?: number;
  max_items?: number;
  item?: Record<string, ClonedSlotRule>;
}

export interface ClonedStyleLayer {
  as?: string;
  kind?: string;
  name?: string;
  anchor?: { rx?: number; ry?: number };
  size?: { rw?: number; rh?: number };
  base_attrs?: Record<string, unknown>;
  motion?: Array<{ t?: number; attrs?: Record<string, unknown> }>;
  easings?: Array<{ t?: number; attr?: string; easing?: string; expression?: string }>;
  shape?: string;
  layerType?: string;
  text_template?: string;
  font?: string;
  font_size?: number;
  text_color_slot?: string;
  file_template?: string;
  fill_slot?: string;
}

export interface ClonedStylePreset {
  schema?: string;
  stage6_version?: string;
  style_id?: string;
  description?: string;
  defaults?: {
    width?: number;
    height?: number;
    fps?: number;
    duration_sec?: number;
    total_frames?: number;
    hero_norm?: number;
  };
  slots?: Record<string, unknown>;
  /** Stage 6 colour roles; older presets keep them here, newer ones in slots. */
  palette?: Record<string, unknown>;
  slot_schema?: Record<string, ClonedSlotRule>;
  rig?: Record<string, unknown>;
  rig_overrides?: Record<string, Record<string, unknown>>;
  scene?: {
    layers?: ClonedStyleLayer[];
    extra_ops?: Array<Record<string, unknown>>;
  };
}

export interface InstantiateClonedStyleRequest {
  style_id: string;
  duration_sec?: number;
  fps?: number;
  width?: number;
  height?: number;
  slots?: Record<string, unknown>;
}

export interface HydratedClonedStyle {
  manifest: MgDslManifest;
  meta: {
    style_id: string;
    width: number;
    height: number;
    fps: number;
    duration_sec: number;
    total_frames: number;
    hero_frame: number;
    layer_count: number;
    op_count: number;
    slot_warnings: string[];
    unknown_tokens: string[];
  };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const round = (value: number, places = 6): number => {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const numberOr = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

function deepClone<T>(value: T): T {
  return value === null || value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

export function normalizeClonedStyleId(value: unknown): string {
  const id = String(value ?? "").trim().toLowerCase();
  if (!STYLE_ID_PATTERN.test(id)) {
    throw new Error(`Invalid style_id ${JSON.stringify(value)}; expected [a-z0-9_-], starting alphanumeric, max 64 chars`);
  }
  return id;
}

/** Bounded metadata for the system prompt: no scene graph, no slots payload. */
export function listClonedStyles(): ClonedStyleSummary[] {
  const dir = clonedStylesDir();
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter(file => file.endsWith(".json"));
  } catch {
    return [];
  }
  const styles: ClonedStyleSummary[] = [];
  for (const file of files.sort()) {
    try {
      const preset = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as ClonedStylePreset;
      if (!isObject(preset.scene) || !Array.isArray(preset.scene.layers)) continue;
      styles.push({
        id: String(preset.style_id ?? file.replace(/\.json$/, "")),
        description: String(preset.description ?? ""),
        default_duration_sec: round(numberOr(preset.defaults?.duration_sec, 0), 3),
        slot_keys: Object.keys(preset.slots ?? {}),
      });
    } catch {
      // A half-written or invalid preset is skipped, never guessed at.
    }
  }
  return styles;
}

export function loadClonedStyleFile(styleId: unknown): { preset: ClonedStylePreset; file: string } {
  const id = normalizeClonedStyleId(styleId);
  const file = path.join(clonedStylesDir(), `${id}.json`);
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    const known = listClonedStyles().map(style => style.id);
    throw new Error(`Cloned style ${JSON.stringify(id)} not found at ${file}${known.length ? `; known: ${known.join(", ")}` : "; export one with refclone --extract-style"}`);
  }
  let preset: ClonedStylePreset;
  try {
    preset = JSON.parse(raw) as ClonedStylePreset;
  } catch (error) {
    throw new Error(`Cloned style ${id} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (preset.schema && preset.schema !== CLONED_STYLE_SCHEMA) {
    throw new Error(`Cloned style ${id} uses unsupported schema ${JSON.stringify(preset.schema)}; expected ${CLONED_STYLE_SCHEMA}`);
  }
  if (!isObject(preset.scene) || !Array.isArray(preset.scene.layers) || !preset.scene.layers.length) {
    throw new Error(`Cloned style ${id} has no scene.layers; re-export it from refclone Stage 6`);
  }
  return { preset, file };
}

/** Flatten nested slot objects/arrays into `items.0.text` style token keys. */
function flattenTokens(value: unknown, prefix: string, out: Record<string, unknown>): void {
  if (prefix) out[prefix] = value;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => flattenTokens(entry, `${prefix}.${index}`, out));
    return;
  }
  if (isObject(value)) {
    for (const [key, entry] of Object.entries(value)) flattenTokens(entry, prefix ? `${prefix}.${key}` : key, out);
  }
}

function mergeSlots(defaults: Record<string, unknown>, provided: Record<string, unknown> | undefined): Record<string, unknown> {
  const merged = deepClone(defaults);
  for (const [key, value] of Object.entries(provided ?? {})) {
    if (key === "items" && Array.isArray(value)) {
      merged.items = value.map(item => (typeof item === "string" ? { text: item } : deepClone(item)));
      continue;
    }
    merged[key] = deepClone(value);
  }
  return merged;
}

function slotWarnings(schema: Record<string, ClonedSlotRule> | undefined, slots: Record<string, unknown>): string[] {
  const warnings: string[] = [];
  const checkText = (label: string, rule: ClonedSlotRule | undefined, value: unknown) => {
    if (!rule || rule.type !== "string" || typeof value !== "string") return;
    if (rule.max_chars != null && value.length > rule.max_chars) {
      warnings.push(`${label}: ${value.length} chars exceeds max_chars ${rule.max_chars}`);
    }
    const words = value.trim() ? value.trim().split(/\s+/).length : 0;
    if (rule.max_words != null && words > rule.max_words) {
      warnings.push(`${label}: ${words} words exceeds max_words ${rule.max_words}`);
    }
  };
  for (const [key, rule] of Object.entries(schema ?? {})) {
    const value = slots[key];
    if (rule.type === "string") {
      checkText(key, rule, value);
      continue;
    }
    if (rule.type === "array" && Array.isArray(value)) {
      if (rule.min_items != null && value.length < rule.min_items) warnings.push(`${key}: ${value.length} items below min_items ${rule.min_items}`);
      if (rule.max_items != null && value.length > rule.max_items) warnings.push(`${key}: ${value.length} items above max_items ${rule.max_items}`);
      value.forEach((item, index) => checkText(`${key}.${index}.text`, rule.item?.text, isObject(item) ? item.text : item));
    }
  }
  return warnings;
}

function resolveTokens(value: unknown, tokens: Record<string, unknown>, unknown: Set<string>): unknown {
  if (typeof value === "string") {
    const exact = /^\{\{([^{}]+)\}\}$/.exec(value);
    if (exact) {
      const key = exact[1].trim();
      if (key in tokens) return deepClone(tokens[key]);
      unknown.add(key);
      return value;
    }
    return value.replace(/\{\{([^{}]+)\}\}/g, (match, rawKey: string) => {
      const key = rawKey.trim();
      if (key in tokens) return String(tokens[key]);
      unknown.add(key);
      return match;
    });
  }
  if (Array.isArray(value)) return value.map(entry => resolveTokens(entry, tokens, unknown));
  if (isObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) out[key] = resolveTokens(entry, tokens, unknown);
    return out;
  }
  return value;
}

/** `{ __frame_ratio: 0.2 }` -> frame at the new duration. */
function denormalizeFrameRatios(value: unknown, totalFrames: number): unknown {
  if (Array.isArray(value)) return value.map(entry => denormalizeFrameRatios(entry, totalFrames));
  if (isObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === "__frame_ratio") {
      return Math.round(clamp01(numberOr(value.__frame_ratio, 0)) * totalFrames);
    }
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) out[key] = denormalizeFrameRatios(entry, totalFrames);
    return out;
  }
  return value;
}

function aliasFor(value: unknown, fallback: string): string {
  const text = String(value ?? "").trim().replace(/^[$@]/, "");
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || fallback;
}

function denormalizeAttrs(
  attrs: Record<string, unknown> | undefined,
  tokens: Record<string, unknown>,
  unknown: Set<string>,
  width: number,
  height: number,
  totalFrames: number,
): Record<string, unknown> {
  const resolved = resolveTokens(attrs ?? {}, tokens, unknown);
  const withFrames = denormalizeFrameRatios(resolved, totalFrames);
  return isObject(withFrames) ? withFrames : {};
}

function splitPointerAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "scale") {
      if (Array.isArray(value) && value.length >= 2) {
        out["scale.x"] = numberOr(value[0], 1);
        out["scale.y"] = numberOr(value[1], 1);
      } else {
        out["scale.x"] = numberOr(value, 1);
        out["scale.y"] = numberOr(value, 1);
      }
      continue;
    }
    out[key] = value;
  }
  return out;
}

function denormalizeBox(box: unknown, width: number, height: number): unknown {
  if (!isObject(box)) return box;
  if (["rx", "ry", "rw", "rh"].every(key => Number.isFinite(Number(box[key])))) {
    return {
      x: round(numberOr(box.rx, 0.5) * width - width / 2),
      y: round(height / 2 - numberOr(box.ry, 0.5) * height),
      width: round(Math.max(0, numberOr(box.rw, 0)) * width),
      height: round(Math.max(0, numberOr(box.rh, 0)) * height),
    };
  }
  return box;
}

/**
 * Resolve slots, denormalize ratios and produce an executable `_mg` manifest.
 * Throws only when the preset is structurally unusable; slot overflows are
 * reported as warnings so a slightly longer headline does not silently fail.
 */
export function hydrateClonedStyle(request: InstantiateClonedStyleRequest): HydratedClonedStyle {
  const { preset } = loadClonedStyleFile(request.style_id);
  const defaults = preset.defaults ?? {};
  const width = Math.max(1, Math.round(numberOr(request.width ?? defaults.width, 1920)));
  const height = Math.max(1, Math.round(numberOr(request.height ?? defaults.height, 1080)));
  const fps = Math.max(1, Math.round(numberOr(request.fps ?? defaults.fps, 25)));
  const durationSec = Math.max(0.1, numberOr(request.duration_sec ?? defaults.duration_sec, numberOr(defaults.total_frames, 150) / fps));
  const totalFrames = Math.max(1, Math.round(durationSec * fps));
  const heroFrame = Math.round((Number.isFinite(Number(defaults.hero_norm)) ? clamp01(Number(defaults.hero_norm)) : 0.5) * totalFrames);
  const sourceWidth = Math.max(1, numberOr(defaults.width, 1920));
  const fontScale = width / sourceWidth;

  const slots = mergeSlots({ ...(preset.palette ?? {}), ...(preset.slots ?? {}) }, request.slots);
  const warnings = slotWarnings(preset.slot_schema, slots);
  const tokens: Record<string, unknown> = {};
  flattenTokens(slots, "", tokens);
  const unknown = new Set<string>();

  const layers: MgDslLayerSpec[] = [];
  const ops: MgDslOpSpec[] = [];
  const aliasByRef = new Map<string, string>();

  (preset.scene?.layers ?? []).forEach((layer, index) => {
    const alias = aliasFor(layer.as ?? layer.name, `layer_${index}`);
    const kind = String(layer.kind ?? "shape");
    const name = String(layer.name ?? alias);
    aliasByRef.set(alias, alias);
    if (layer.as) aliasByRef.set(String(layer.as), alias);
    if (layer.name) aliasByRef.set(String(layer.name), alias);

    const anchor = layer.anchor ?? { rx: 0.5, ry: 0.5 };
    const size = layer.size ?? { rw: 0, rh: 0 };
    const x = round(numberOr(anchor.rx, 0.5) * width - width / 2);
    const y = round(height / 2 - numberOr(anchor.ry, 0.5) * height);
    const layerWidth = round(Math.max(0, numberOr(size.rw, 0)) * width);
    const layerHeight = round(Math.max(0, numberOr(size.rh, 0)) * height);

    const overrides = preset.rig_overrides?.[alias] ?? preset.rig_overrides?.[String(layer.name ?? "")] ?? {};
    const attrs = denormalizeAttrs({ ...(layer.base_attrs ?? {}), ...overrides }, tokens, unknown, width, height, totalFrames);
    attrs.position = [x, y];
    if (kind !== "text") attrs["generator.dimensions"] = [layerWidth, layerHeight];
    // Cavalry's ellipse primitive sizes from generator.radius (a vector radius),
    // not generator.dimensions; without it the ellipse falls back to its default
    // radius and oversizes badly. Explicit radius in base_attrs (donut ring) wins.
    if (String(layer.shape ?? "") === "ellipse" && attrs["generator.radius"] == null) {
      attrs["generator.radius"] = [round(layerWidth / 2), round(layerHeight / 2)];
    }

    if (kind === "text") {
      delete attrs.text;
      delete attrs.fontSize;
      const text = String(resolveTokens(layer.text_template ?? "{{headline}}", tokens, unknown) ?? "");
      const color = String(resolveTokens(layer.text_color_slot ?? "{{text_color}}", tokens, unknown) ?? "#111111");
      const fontSize = Math.max(1, round(numberOr(layer.font_size, 48) * fontScale, 2));
      const spec: Record<string, unknown> = { as: alias, kind: "text", text, size: fontSize, color, attrs };
      if (layer.font) spec.font = String(layer.font);
      layers.push(spec as MgDslLayerSpec);
    } else if (kind === "svg" || kind === "image") {
      const file = String(resolveTokens(layer.file_template ?? "", tokens, unknown) ?? "");
      layers.push({ as: alias, kind, file, name, attrs } as MgDslLayerSpec);
    } else if (kind === "layer") {
      layers.push({ as: alias, kind: "layer", layerType: String(layer.layerType ?? "group"), name, attrs } as MgDslLayerSpec);
    } else {
      layers.push({ as: alias, kind: "shape", shape: String(layer.shape ?? "rectangle"), name, attrs } as MgDslLayerSpec);
    }

    const motion = Array.isArray(layer.motion) ? layer.motion : [];
    if (motion.length) {
      const frames = motion.map((entry, frameIndex) => {
        const raw = { ...(entry.attrs ?? {}) };
        const position = isObject(raw.pos) ? raw.pos : null;
        const dimensions = isObject(raw.size) ? raw.size : null;
        // `pos`/`size` objects are the normalized shorthand; a numeric `size`
        // is a real attribute (e.g. pixelateFilter.size) and must survive.
        if (position) delete raw.pos;
        if (dimensions) delete raw.size;
        const attrsOut = splitPointerAttrs(denormalizeAttrs(raw, tokens, unknown, width, height, totalFrames));
        if (position) {
          attrsOut["position.x"] = round(numberOr(position.rx, 0.5) * width - width / 2);
          attrsOut["position.y"] = round(height / 2 - numberOr(position.ry, 0.5) * height);
        }
        if (dimensions && kind !== "text") {
          const motionWidth = round(Math.max(0, numberOr(dimensions.rw, 0)) * width);
          const motionHeight = round(Math.max(0, numberOr(dimensions.rh, 0)) * height);
          attrsOut["generator.dimensions"] = [motionWidth, motionHeight];
          if (String(layer.shape ?? "") === "ellipse" && attrsOut["generator.radius"] == null) {
            attrsOut["generator.radius"] = [round(motionWidth / 2), round(motionHeight / 2)];
          }
        }
        return {
          frame: Math.round(clamp01(numberOr(entry.t, frameIndex === 0 ? 0 : 1)) * totalFrames),
          attrs: attrsOut,
        };
      });
      ops.push({ op: "keyframe", target: `$${alias}`, frames });
    }

    for (const easing of Array.isArray(layer.easings) ? layer.easings : []) {
      const expression = easing.expression ? String(easing.expression) : undefined;
      const name = String(easing.easing ?? (expression ? "Custom" : ""));
      if (!name || (name === "Custom" && !expression)) continue;
      const attr = String(easing.attr ?? "position");
      const frame = Math.round(clamp01(numberOr(easing.t, 0)) * totalFrames);
      const attrs = attr === "position" || attr === "scale" ? [`${attr}.x`, `${attr}.y`] : [attr];
      for (const axis of attrs) {
        const spec: Record<string, unknown> = { op: "easing", target: `$${alias}`, attr: axis, frame, easing: name };
        if (expression) spec.expression = expression;
        ops.push(spec as MgDslOpSpec);
      }
    }
  });

  const resolveTarget = (target: unknown): string => {
    const text = String(target ?? "").trim();
    if (!text) return text;
    const bare = text.replace(/^[$@]/, "");
    return aliasByRef.get(text) ?? aliasByRef.get(bare) ?? aliasByRef.get(aliasFor(bare, bare)) ?? text;
  };

  for (const extra of preset.scene?.extra_ops ?? []) {
    const copy = deepClone(extra);
    if (typeof copy.target === "string") copy.target = `$${resolveTarget(copy.target)}`;
    if (Array.isArray(copy.targets)) copy.targets = copy.targets.map(target => `$${resolveTarget(target)}`);
    // `connect` ops address two endpoints by alias; both need the `$` prefix or
    // the compiler passes the bare alias string straight to api.connect().
    if (typeof copy.from === "string") copy.from = `$${resolveTarget(copy.from)}`;
    if (typeof copy.to === "string") copy.to = `$${resolveTarget(copy.to)}`;
    if (copy.attrs) copy.attrs = denormalizeAttrs(copy.attrs as Record<string, unknown>, tokens, unknown, width, height, totalFrames);
    if (copy.box && copy.normalized_box === true) {
      copy.box = denormalizeBox(copy.box, width, height);
      delete copy.normalized_box;
    }
    if (copy.op === "easing" && copy.t != null) {
      copy.frame = Math.round(clamp01(numberOr(copy.t, 0)) * totalFrames);
      delete copy.t;
    }
    ops.push(copy as unknown as MgDslOpSpec);
  }

  const backgroundColor = String(resolveTokens("{{bg_color}}", tokens, unknown) ?? "#FFFFFF");
  const manifest: MgDslManifest = {
    // endFrame is inclusive: a 143-frame comp spans 0..142.
    comp: { width, height, fps, endFrame: Math.max(0, totalFrames - 1), bg: backgroundColor },
    layers,
    ops,
  };

  return {
    manifest,
    meta: {
      style_id: normalizeClonedStyleId(request.style_id),
      width,
      height,
      fps,
      duration_sec: round(totalFrames / fps, 3),
      total_frames: totalFrames,
      hero_frame: heroFrame,
      layer_count: layers.length,
      op_count: ops.length,
      slot_warnings: warnings,
      unknown_tokens: [...unknown],
    },
  };
}

/** Frame-like knobs are stored as 0..1 duration ratios; physics stays verbatim. */
function isFrameLikeRigKey(key: string): boolean {
  return /stagger|lagFrames|delayFrames|offsetFrames|holdFrames|inFrame|outFrame|startFrame|endFrame/i.test(key);
}

/** Attribute paths that carry a colour and can map back to a palette slot. */
const COLOR_ATTR_PATTERN = /^(?:material\.materialColor|strokeColor|glowColor)$|color$/i;

/** Hex string or host colour object -> `#RRGGBB` (upper-case); null otherwise. */
function normalizedColor(value: unknown): string | null {
  if (typeof value === "string") {
    const raw = value.trim().replace("#", "");
    if (/^[0-9a-fA-F]{3}$/.test(raw)) return ("#" + raw[0] + raw[0] + raw[1] + raw[1] + raw[2] + raw[2]).toUpperCase();
    if (/^[0-9a-fA-F]{6}$/.test(raw)) return ("#" + raw).toUpperCase();
    if (/^[0-9a-fA-F]{8}$/.test(raw)) return ("#" + raw.slice(0, 6)).toUpperCase();
    return null;
  }
  if (isObject(value)) {
    const { r, g, b } = value as { r?: unknown; g?: unknown; b?: unknown };
    if ([r, g, b].every(n => Number.isFinite(Number(n)))) {
      const hex = (n: unknown) => Math.max(0, Math.min(255, Math.round(Number(n)))).toString(16).padStart(2, "0");
      return ("#" + hex(r) + hex(g) + hex(b)).toUpperCase();
    }
  }
  return null;
}

/** Minimal structural view of stallion's `export_comp_rig_overrides` envelope. */
export interface ExportedRigLayer {
  id?: string;
  name?: string;
  type?: string;
  hidden?: boolean;
  attrs?: Record<string, unknown>;
  animated?: string[];
}

export interface ExportedRigSnapshot {
  ok?: boolean;
  compId?: string;
  compResolution?: [number, number] | null;
  compEndFrame?: number | null;
  layers?: ExportedRigLayer[];
  error?: string;
}

export interface ClonedStyleSyncResult {
  style_id: string;
  preset_path: string;
  dry_run: boolean;
  updated_layers: Array<{ layer: string; attrs: string[] }>;
  font_size_updates: Array<{ layer: string; px: number; stored: number }>;
  /** Tokenized colours rethemed consistently across every layer become slot defaults. */
  palette_updates: Array<{ role: string; from: string | null; to: string }>;
  unmatched_layers: Array<{ name: string; type: string }>;
  skipped: Array<{ layer: string; attr: string; reason: string }>;
  rig_overrides: Record<string, Record<string, unknown>>;
}

/**
 * Fold a live comp's rig readback into the preset on disk.
 *
 * Matching is by node name against the preset's alias/`as`/`name` — the
 * instantiation script renames every created layer to its alias, so the round
 * trip is stable even for text nodes (whose Cavalry name is otherwise the copy
 * itself). Keyframed attributes are skipped: their current value is a sampled
 * pose, not a base override. Values equal to what the preset already produces
 * are skipped, and a colour slot edited consistently across every layer moves
 * the palette default instead of freezing a literal colour into the rig.
 * Throws only when the preset cannot be loaded or written; every per-layer
 * mismatch is reported instead.
 */
export function syncClonedStyleOverrides(
  styleIdInput: unknown,
  exported: ExportedRigSnapshot,
  options: { dryRun?: boolean } = {},
): ClonedStyleSyncResult {
  const styleId = normalizeClonedStyleId(styleIdInput);
  if (!exported || exported.ok === false) {
    throw new Error(`export_comp_rig_overrides failed for ${styleId}: ${String(exported?.error ?? "unknown readback error")}`);
  }
  const { preset, file } = loadClonedStyleFile(styleId);
  const defaultsWidth = Math.max(1, numberOr(preset.defaults?.width, 1920));
  const compWidth = Array.isArray(exported.compResolution) && Number(exported.compResolution[0]) > 0
    ? Number(exported.compResolution[0])
    : defaultsWidth;
  const totalFrames = Math.max(1, Math.round(numberOr(exported.compEndFrame, numberOr(preset.defaults?.total_frames, 1))));

  const layers = preset.scene?.layers ?? [];
  const byKey = new Map<string, { alias: string; layer: ClonedStyleLayer }>();
  layers.forEach((layer, index) => {
    const alias = aliasFor(layer.as ?? layer.name, `layer_${index}`);
    for (const key of [alias, layer.as, layer.name]) {
      if (key == null || String(key).trim() === "") continue;
      const text = String(key);
      if (!byKey.has(text)) byKey.set(text, { alias, layer });
      const lower = text.toLowerCase();
      if (!byKey.has(lower)) byKey.set(lower, { alias, layer });
    }
  });

  // What the preset produces with its current defaults; separates real artist
  // tweaks from values that merely restate the template.
  const defaultSpecs = new Map<string, Record<string, any>>();
  for (const spec of hydrateClonedStyle({ style_id: styleId }).manifest.layers ?? []) {
    defaultSpecs.set(String((spec as Record<string, any>).as ?? ""), spec as Record<string, any>);
  }
  const slotDefaults: Record<string, unknown> = { ...(preset.palette ?? {}), ...(preset.slots ?? {}) };

  // `alias|attr` -> slot role for tokenized values (colours today).
  const tokenByAliasAttr = new Map<string, string>();
  const rememberToken = (alias: string, attr: string, value: unknown) => {
    const token = typeof value === "string" ? /^\{\{\s*([^{}]+?)\s*\}\}$/.exec(value) : null;
    if (token) tokenByAliasAttr.set(`${alias}|${attr}`, token[1].trim());
  };
  layers.forEach((layer, index) => {
    const alias = aliasFor(layer.as ?? layer.name, `layer_${index}`);
    for (const [attr, value] of Object.entries(layer.base_attrs ?? {})) rememberToken(alias, attr, value);
    if (layer.kind === "text") rememberToken(alias, "material.materialColor", layer.text_color_slot);
    if (layer.fill_slot) rememberToken(alias, "material.materialColor", layer.fill_slot);
  });

  const updated: Array<{ layer: string; attrs: string[] }> = [];
  const fontSizeUpdates: Array<{ layer: string; px: number; stored: number }> = [];
  const paletteUpdates: Array<{ role: string; from: string | null; to: string }> = [];
  const unmatched: Array<{ name: string; type: string }> = [];
  const skipped: Array<{ layer: string; attr: string; reason: string }> = [];
  const overrides: Record<string, Record<string, unknown>> = deepClone(preset.rig_overrides ?? {});
  const pending = new Map<string, Record<string, unknown>>();
  const stash = (alias: string, attr: string, value: unknown) => {
    const bucket = pending.get(alias) ?? {};
    bucket[attr] = value;
    pending.set(alias, bucket);
  };
  const colorRoles = new Map<string, Array<{ alias: string; attr: string; hex: string }>>();
  const colorObserved = new Map<string, Set<string>>(); // role -> every observed hex

  for (const layer of exported.layers ?? []) {
    const name = String(layer?.name ?? "");
    const match = byKey.get(name) ?? byKey.get(name.toLowerCase());
    if (!match) {
      if (unmatched.length < 20) unmatched.push({ name, type: String(layer?.type ?? "") });
      continue;
    }
    const animated = new Set((layer.animated ?? []).map(String));
    const attrsIn = isObject(layer.attrs) ? layer.attrs : {};
    const defaultSpec = defaultSpecs.get(match.alias);
    const expectedFor = (attr: string): unknown => {
      if (!defaultSpec) return undefined;
      if (attr === "material.materialColor" && match.layer.kind === "text") return defaultSpec.color;
      return isObject(defaultSpec.attrs) ? (defaultSpec.attrs as Record<string, unknown>)[attr] : undefined;
    };
    for (const [attr, value] of Object.entries(attrsIn)) {
      if (!attr || value === undefined) continue;
      if (animated.has(attr)) {
        skipped.push({ layer: match.alias, attr, reason: "animated" });
        continue;
      }
      const expected = expectedFor(attr);
      if (attr === "fontSize" && match.layer.kind === "text") {
        const px = Number(value);
        if (!Number.isFinite(px) || px <= 0) {
          skipped.push({ layer: match.alias, attr, reason: "non-numeric font size" });
          continue;
        }
        const expectedPx = Number(defaultSpec?.size);
        if (Number.isFinite(expectedPx) && Math.abs(px - expectedPx) < 0.5) {
          skipped.push({ layer: match.alias, attr, reason: "matches default" });
          continue;
        }
        const stored = round((px * defaultsWidth) / compWidth, 2);
        match.layer.font_size = stored;
        fontSizeUpdates.push({ layer: match.alias, px: round(px, 2), stored });
        continue;
      }
      if (COLOR_ATTR_PATTERN.test(attr)) {
        const hex = normalizedColor(value);
        if (!hex) {
          skipped.push({ layer: match.alias, attr, reason: "non-colour value" });
          continue;
        }
        const expectedHex = normalizedColor(expected);
        const changed = expectedHex === null || expectedHex !== hex;
        const role = tokenByAliasAttr.get(`${match.alias}|${attr}`) ?? null;
        if (!changed) skipped.push({ layer: match.alias, attr, reason: "matches default" });
        if (role) {
          const observed = colorObserved.get(role) ?? new Set<string>();
          observed.add(hex);
          colorObserved.set(role, observed);
          if (changed) {
            const votes = colorRoles.get(role) ?? [];
            votes.push({ alias: match.alias, attr, hex });
            colorRoles.set(role, votes);
          }
        } else if (changed) {
          stash(match.alias, attr, hex);
        }
        continue;
      }
      if (expected === undefined) {
        // The host declares dozens of stock attrs the preset never set
        // (letterSpacing, autoScaleFontSize, posterize…). Treating those as
        // artist tweaks would freeze host defaults into rig_overrides on the
        // very first sync, so only preset-owned attributes are eligible.
        skipped.push({ layer: match.alias, attr, reason: "not preset-owned" });
        continue;
      }
      if (JSON.stringify(value) === JSON.stringify(expected)) {
        skipped.push({ layer: match.alias, attr, reason: "matches default" });
        continue;
      }
      if (isFrameLikeRigKey(attr) && typeof value === "number" && Number.isFinite(value)) {
        stash(match.alias, attr, { __frame_ratio: round(clamp01(value / totalFrames)) });
        continue;
      }
      stash(match.alias, attr, deepClone(value));
    }
  }

  // Tokenized colours edited to one unanimous value are a retheme, not a rig
  // override: move the slot default so future instantiations keep the tokens.
  // Mixed edits (one layer nudged) stay per-layer overrides.
  for (const [role, votes] of colorRoles) {
    const observed = colorObserved.get(role) ?? new Set<string>();
    if (observed.size === 1) {
      const to = [...observed][0];
      const from = normalizedColor(slotDefaults[role]);
      if (from !== to) {
        paletteUpdates.push({ role, from, to });
        if (isObject(preset.slots) && role in preset.slots) preset.slots[role] = to;
        if (isObject(preset.palette) && role in preset.palette) preset.palette[role] = to;
      }
      continue;
    }
    for (const vote of votes) stash(vote.alias, vote.attr, vote.hex);
  }

  for (const [alias, attrs] of pending) {
    overrides[alias] = { ...(overrides[alias] ?? {}), ...attrs };
    updated.push({ layer: alias, attrs: Object.keys(attrs) });
  }

  const dryRun = options.dryRun === true;
  if (!dryRun && (updated.length || fontSizeUpdates.length || paletteUpdates.length)) {
    preset.rig_overrides = overrides;
    const tmp = `${file}.tmp-${process.pid}-${Date.now().toString(36)}`;
    fs.writeFileSync(tmp, `${JSON.stringify(preset, null, 2)}\n`, "utf8");
    fs.renameSync(tmp, file);
  }

  return {
    style_id: styleId,
    preset_path: file,
    dry_run: dryRun,
    updated_layers: updated,
    font_size_updates: fontSizeUpdates,
    palette_updates: paletteUpdates,
    unmatched_layers: unmatched,
    skipped,
    rig_overrides: overrides,
  };
}

/** Temporary preview directory, one per style/timestamp. */
export function clonedPreviewDir(styleId: string): string {
  const safe = normalizeClonedStyleId(styleId);
  return path.join(process.env.CAVALRY_MCP_CLONED_RENDER_DIR
    ? path.resolve(process.env.CAVALRY_MCP_CLONED_RENDER_DIR)
    : path.join(MODULE_DIR, "..", "..", ".cloned-renders"), safe, Date.now().toString(36));
}
