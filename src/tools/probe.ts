/**
 * Live API probe: ask this running Cavalry build what it actually exposes,
 * instead of trusting documentation or guessing attribute paths.
 *
 * The trap this exists for is cheap to describe and expensive to hit: `api.getName`
 * does not exist while `api.getNiceName` does, `text.fontSize` returns the text
 * object while `fontSize` returns the number, and whether `deleteAnimation` or
 * `modifyKeyframeTangent` is available changes between builds. One call answers
 * all of it, and the full report is written to disk so the MCP payload stays compact.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { executeMotionScript, type ScriptOutcome } from "../runtime/execute.js";
import { getConfig, type StallionConfig } from "../bridge/stallion.js";

export interface KnowledgeChunk {
  id: string;
  title: string;
  category: string;
  context: string;
  content: string;
  attributes: string[];
  deprecatedAliases: Record<string, string>;
  tags: string[];
}

export interface ApiSignatureParam {
  name: string;
  type: string;
  description: string;
}

export interface ApiSignatureEntry {
  name: string;
  signature: string;
  context: string[];
  params: ApiSignatureParam[];
  returns: string;
  description: string;
  example: string;
  deprecated: boolean;
}

export interface ProbeInput {
  /** Layer ids whose full attribute list should be read (max 20). */
  layerIds?: string[];
  /** Read one representative layer per layer type in the active comp (default true). */
  sampleTypes?: boolean;
  /** Include `api.getAllLayerTypes()` in the report (default true). */
  includeLayerTypes?: boolean;
  /** Specific function names to test; the built-in watch-list is used when omitted. */
  functions?: string[];
  /** Include the full function-name list in the returned payload (default false). */
  inlineSurface?: boolean;
  /** Report path (default `~/.cavalry-mcp/cavalry-api-capabilities.json`). */
  writeFile?: string;
  /** Optional offline documentation and API reference search query. */
  query?: string;
  /** When true and `query` is provided, return offline docs without calling the live bridge. */
  offlineOnly?: boolean;
}

export interface ProbeAttributeSample {
  id: string;
  type: string;
  name: string | null;
  attributeCount: number;
  attributes: string[];
  animated: string[];
}

export interface ProbeReport {
  generatedAt: string;
  comp: { id: string | null; name: string | null; fps: number | null; width: number | null; height: number | null; startFrame: number | null; endFrame: number | null };
  apiFunctionCount: number;
  surface: string[];
  capabilities: Record<string, boolean>;
  layerTypes: unknown;
  attributeSamples: ProbeAttributeSample[];
  warnings: string[];
}

export interface ProbeResult extends Omit<ProbeReport, "surface" | "attributeSamples"> {
  file: string;
  present: string[];
  missing: string[];
  surface: string[] | null;
  attributeSamples: Array<Omit<ProbeAttributeSample, "attributes">>;
  offlineDocs?: KnowledgeChunk[];
  apiSignatures?: ApiSignatureEntry[];
}

let cachedKnowledgeChunks: KnowledgeChunk[] | null = null;
let cachedApiReference: ApiSignatureEntry[] | null = null;

function dataFilePath(fileName: string): string {
  return fileURLToPath(new URL(`../../data/${fileName}`, import.meta.url));
}

export function loadKnowledgeChunks(): KnowledgeChunk[] {
  if (!cachedKnowledgeChunks) {
    const raw = fs.readFileSync(dataFilePath("knowledge_chunks.json"), "utf8");
    cachedKnowledgeChunks = JSON.parse(raw) as KnowledgeChunk[];
  }
  return cachedKnowledgeChunks;
}

export function loadApiReference(): ApiSignatureEntry[] {
  if (!cachedApiReference) {
    const raw = fs.readFileSync(dataFilePath("api_reference.json"), "utf8");
    cachedApiReference = JSON.parse(raw) as ApiSignatureEntry[];
  }
  return cachedApiReference;
}

/**
 * Search the offline Cavalry 2.7+/2.8+ Knowledge Base (`data/knowledge_chunks.json`)
 * across titles, content, attribute paths, deprecated aliases, categories, and tags.
 */
export function searchOfflineDocs(
  query: string,
  options: { category?: string; context?: string; limit?: number } = {},
): KnowledgeChunk[] {
  const chunks = loadKnowledgeChunks();
  const limit = Math.max(1, Math.min(50, options.limit ?? 10));
  const categoryFilter = options.category?.trim().toLowerCase();
  const contextFilter = options.context?.trim().toLowerCase();
  const tokens = String(query ?? "")
    .toLowerCase()
    .split(/[\s,;|/]+/)
    .map(t => t.trim())
    .filter(Boolean);

  const scored: Array<{ chunk: KnowledgeChunk; score: number }> = [];
  for (const chunk of chunks) {
    if (categoryFilter && chunk.category.toLowerCase() !== categoryFilter) continue;
    if (contextFilter && chunk.context.toLowerCase() !== contextFilter) continue;
    if (tokens.length === 0) {
      scored.push({ chunk, score: 1 });
      continue;
    }
    const haystack = [
      chunk.id,
      chunk.title,
      chunk.category,
      chunk.context,
      chunk.content,
      ...chunk.attributes,
      ...Object.keys(chunk.deprecatedAliases ?? {}),
      ...Object.values(chunk.deprecatedAliases ?? {}),
      ...chunk.tags,
    ]
      .join(" ")
      .toLowerCase();

    let score = 0;
    for (const token of tokens) {
      if (chunk.id.toLowerCase().includes(token)) score += 6;
      if (chunk.title.toLowerCase().includes(token)) score += 5;
      if (chunk.tags.some(t => t.toLowerCase().includes(token))) score += 4;
      if (chunk.attributes.some(a => a.toLowerCase().includes(token))) score += 4;
      if (Object.keys(chunk.deprecatedAliases ?? {}).some(k => k.toLowerCase().includes(token))) score += 5;
      if (haystack.includes(token)) score += 2;
    }
    if (score > 0) scored.push({ chunk, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(entry => entry.chunk);
}

/**
 * Look up an API signature or search matching signatures from `data/api_reference.json`.
 */
export function lookupApiSignature(nameOrQuery: string): ApiSignatureEntry | null {
  const entries = loadApiReference();
  const q = String(nameOrQuery ?? "").trim().toLowerCase();
  if (!q) return null;
  const normalized = q.startsWith("api.") || q.startsWith("cavalry.") || q.startsWith("ctx.") ? q : `api.${q}`;
  const exact = entries.find(
    entry => entry.name.toLowerCase() === q || entry.name.toLowerCase() === normalized,
  );
  if (exact) return exact;
  return (
    entries.find(
      entry =>
        entry.name.toLowerCase().includes(q) ||
        entry.signature.toLowerCase().includes(q) ||
        entry.description.toLowerCase().includes(q),
    ) ?? null
  );
}

/** Search multiple API signatures matching a query string. */
export function searchApiSignatures(query: string, limit = 8): ApiSignatureEntry[] {
  const entries = loadApiReference();
  const tokens = String(query ?? "")
    .toLowerCase()
    .split(/[\s,;|/]+/)
    .map(t => t.trim())
    .filter(Boolean);
  if (!tokens.length) return entries.slice(0, limit);
  const scored: Array<{ entry: ApiSignatureEntry; score: number }> = [];
  for (const entry of entries) {
    let score = 0;
    const text = `${entry.name} ${entry.signature} ${entry.description} ${entry.context.join(" ")}`.toLowerCase();
    for (const token of tokens) {
      if (entry.name.toLowerCase() === token || entry.name.toLowerCase() === `api.${token}`) score += 8;
      else if (entry.name.toLowerCase().includes(token)) score += 4;
      if (text.includes(token)) score += 2;
    }
    if (score > 0) scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.entry);
}

/**
 * Resolve deprecated or ambiguous attribute names to verified Cavalry 2.7+/2.8+ canonical paths.
 */
export function resolveAttributePath(
  layerType: string,
  attrOrDeprecated: string,
): { canonical: string; deprecated: boolean; note: string } {
  const type = String(layerType ?? "").trim();
  const attr = String(attrOrDeprecated ?? "").trim();
  if (type === "ellipse" && (attr === "generator.dimensions" || attr === "dimensions")) {
    return {
      canonical: "generator.radius",
      deprecated: true,
      note: "Ellipse primitives in Cavalry 2.8 have no dimensions attribute; use 'generator.radius' as [rx, ry].",
    };
  }
  for (const chunk of loadKnowledgeChunks()) {
    const mapped = chunk.deprecatedAliases?.[attr];
    if (mapped) {
      return {
        canonical: mapped,
        deprecated: true,
        note: `Mapped deprecated '${attr}' to verified 2.8 path '${mapped}' (${chunk.title}).`,
      };
    }
  }
  return {
    canonical: attr,
    deprecated: false,
    note: "Canonical attribute path.",
  };
}

/** Names the clone pipeline depends on; each is answered with a yes or a no. */
export const PROBE_FUNCTIONS: readonly string[] = [
  "getActiveComp", "setActiveComp", "getCompLayers", "getCompositionList", "getAllLayerTypes",
  "create", "duplicate", "duplicateSelection", "deleteLayer", "layerExists", "getLayerType",
  "getNiceName", "getName", "select", "getSelection", "getParent", "parent", "unParent", "reorder",
  "get", "set", "getAttributes", "getAttributeDefinition", "addDynamic", "setGenerator",
  "connect", "getInConnection", "getOutConnections",
  "keyframe", "getKeyframeTimes", "getKeyframeIdsForAttribute", "getAnimatedAttributes",
  "deleteKeyframe", "deleteAnimation", "modifyKeyframe", "modifyKeyframeTangent",
  "setKeyframeVelocity", "clearKeyframeVelocity", "magicEasing", "getMagicEasing",
  "setAttributeExpression", "getAttributeExpression",
  "getInFrame", "getOutFrame", "setInFrame", "setOutFrame", "offsetLayerTime",
  "getFrame", "setFrame", "play", "stop", "getBoundingBox",
  "renderPNGFrame", "addRenderQueueItem", "backgroundRender", "getRenderQueueItems", "cancelRender", "getRenderPath",
  "writeToFile", "readFromFile", "filePathExists", "makeFolder", "loadAsset",
  "startUndoGroup", "endUndoGroup", "newScene", "save", "open",
];

function defaultReportPath(): string {
  return process.env.CAVALRY_CAPABILITIES_PATH
    || path.join(os.homedir(), ".cavalry-mcp", "cavalry-api-capabilities.json");
}

function stringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(entry => String(entry)).filter(Boolean).slice(0, limit);
}

export interface NormalizedProbe {
  layerIds: string[];
  sampleTypes: boolean;
  includeLayerTypes: boolean;
  functions: string[];
  inlineSurface: boolean;
  writeFile: string;
  query?: string;
  offlineOnly?: boolean;
}

export function normalizeProbe(input: ProbeInput = {}): NormalizedProbe {
  if (input && typeof input !== "object") throw new Error("Probe options must be an object");
  const normalized: NormalizedProbe = {
    layerIds: stringList(input.layerIds, 20),
    sampleTypes: input.sampleTypes !== false,
    includeLayerTypes: input.includeLayerTypes !== false,
    functions: input.functions && input.functions.length ? stringList(input.functions, 200) : [...PROBE_FUNCTIONS],
    inlineSurface: input.inlineSurface === true,
    writeFile: path.resolve(input.writeFile ?? defaultReportPath()),
  };
  if (typeof input.query === "string" && input.query.trim()) {
    normalized.query = input.query.trim();
  }
  if (input.offlineOnly === true) {
    normalized.offlineOnly = true;
  }
  return normalized;
}

export function buildProbeScript(options: NormalizedProbe): string {
  const payload = {
    layerIds: options.layerIds,
    sampleTypes: options.sampleTypes,
    includeLayerTypes: options.includeLayerTypes,
    functions: options.functions,
  };
  return `const __probe = ${JSON.stringify(payload)};
const __read = (fn) => { try { return fn(); } catch (e) { return null; }; };
const __num = (value, fallback) => { const n = Number(value); return isFinite(n) ? n : fallback; };
const surface = Object.keys(api).filter((key) => typeof api[key] === "function").sort();
const capabilities = {};
for (let i = 0; i < __probe.functions.length; i++) {
  const name = __probe.functions[i];
  capabilities[name] = typeof api[name] === "function";
}
const compId = __read(() => api.getActiveComp());
const compName = compId ? __read(() => (typeof api.getNiceName === "function" ? api.getNiceName(compId) : null)) : null;
const resRaw = compId ? __read(() => api.get(compId, "resolution")) : null;
let width = null;
let height = null;
if (Array.isArray(resRaw)) { width = __num(resRaw[0], null); height = __num(resRaw[1], null); }
else if (resRaw && typeof resRaw === "object") { width = __num(resRaw.x != null ? resRaw.x : resRaw.width, null); height = __num(resRaw.y != null ? resRaw.y : resRaw.height, null); }
const layerTypes = __probe.includeLayerTypes && typeof api.getAllLayerTypes === "function"
  ? __read(() => api.getAllLayerTypes(false))
  : null;
const warnings = [];
if (typeof api.getName === "function") warnings.push("api.getName exists in this build; the verified name accessor elsewhere is api.getNiceName.");
if (typeof api.modifyKeyframeTangent !== "function") warnings.push("api.modifyKeyframeTangent is unavailable; curve shape must come from keyframe density or magicEasing.");
const wanted = {};
for (let i = 0; i < __probe.layerIds.length; i++) wanted[__probe.layerIds[i]] = true;
if (__probe.sampleTypes && typeof api.getCompLayers === "function") {
  const ids = __read(() => api.getCompLayers(false)) || [];
  const seenType = {};
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (wanted[id]) continue;
    const type = __read(() => api.getLayerType(id));
    if (!type || seenType[type]) continue;
    seenType[type] = true;
    wanted[id] = true;
    if (Object.keys(seenType).length >= 40) break;
  }
}
const attributeSamples = [];
for (const id of Object.keys(wanted)) {
  if (attributeSamples.length >= 60) break;
  if (typeof api.layerExists === "function" && !__read(() => api.layerExists(id))) {
    warnings.push("Requested layer id is not present in this scene: " + id);
    continue;
  }
  const names = __read(() => (typeof api.getAttributes === "function" ? api.getAttributes(id) : null));
  const animated = __read(() => (typeof api.getAnimatedAttributes === "function" ? api.getAnimatedAttributes(id) : null)) || [];
  attributeSamples.push({
    id: id,
    type: __read(() => api.getLayerType(id)) || "unknown",
    name: __read(() => (typeof api.getNiceName === "function" ? api.getNiceName(id) : null)),
    attributeCount: Array.isArray(names) ? names.length : 0,
    attributes: Array.isArray(names) ? names : [],
    animated: animated,
  });
}
__result = {
  generatedAt: new Date().toISOString(),
  comp: {
    id: compId || null,
    name: compName || null,
    fps: compId ? (typeof api.get === "function" ? __read(() => api.get(compId, "fps")) : null) : null,
    width: width,
    height: height,
    startFrame: compId ? __read(() => api.get(compId, "startFrame")) : null,
    endFrame: compId ? __read(() => api.get(compId, "endFrame")) : null
  },
  apiFunctionCount: surface.length,
  surface: surface,
  capabilities: capabilities,
  layerTypes: layerTypes,
  attributeSamples: attributeSamples,
  warnings: warnings
};`;
}

function normalizeReport(value: unknown): ProbeReport {
  if (!value || typeof value !== "object") throw new Error("API probe returned no report");
  const raw = value as Record<string, unknown>;
  const compRaw = (raw.comp && typeof raw.comp === "object" ? raw.comp : {}) as Record<string, unknown>;
  const numOrNull = (entry: unknown): number | null => {
    const n = Number(entry);
    return entry == null || !Number.isFinite(n) ? null : n;
  };
  const capabilities: Record<string, boolean> = {};
  if (raw.capabilities && typeof raw.capabilities === "object") {
    for (const [name, present] of Object.entries(raw.capabilities as Record<string, unknown>)) {
      capabilities[name] = present === true;
    }
  }
  const samples: ProbeAttributeSample[] = Array.isArray(raw.attributeSamples)
    ? raw.attributeSamples.map(entry => {
        const item = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
        return {
          id: String(item.id ?? ""),
          type: String(item.type ?? "unknown"),
          name: item.name == null ? null : String(item.name),
          attributeCount: numOrNull(item.attributeCount) ?? 0,
          attributes: stringList(item.attributes, 400),
          animated: stringList(item.animated, 40),
        };
      })
    : [];
  const surface = stringList(raw.surface, 2_000);
  return {
    generatedAt: typeof raw.generatedAt === "string" ? raw.generatedAt : new Date().toISOString(),
    comp: {
      id: compRaw.id == null ? null : String(compRaw.id),
      name: compRaw.name == null ? null : String(compRaw.name),
      fps: numOrNull(compRaw.fps),
      width: numOrNull(compRaw.width),
      height: numOrNull(compRaw.height),
      startFrame: numOrNull(compRaw.startFrame),
      endFrame: numOrNull(compRaw.endFrame),
    },
    apiFunctionCount: numOrNull(raw.apiFunctionCount) ?? surface.length,
    surface,
    capabilities,
    layerTypes: raw.layerTypes ?? null,
    attributeSamples: samples,
    warnings: stringList(raw.warnings, 40),
  };
}

export async function runProbe(
  input: ProbeInput = {},
  opts: {
    config?: StallionConfig;
    execute?: (code: string) => Promise<ScriptOutcome>;
    writeFile?: (file: string, text: string) => void;
  } = {},
): Promise<ProbeResult> {
  const config = opts.config ?? getConfig();
  const options = normalizeProbe(input);
  const offlineDocs = options.query ? searchOfflineDocs(options.query) : undefined;
  const apiSignatures = options.query ? searchApiSignatures(options.query) : undefined;

  if (options.offlineOnly && options.query) {
    return {
      generatedAt: new Date().toISOString(),
      comp: { id: null, name: null, fps: null, width: null, height: null, startFrame: null, endFrame: null },
      apiFunctionCount: 0,
      capabilities: {},
      layerTypes: null,
      present: [],
      missing: [],
      surface: null,
      attributeSamples: [],
      file: options.writeFile,
      warnings: [],
      offlineDocs,
      apiSignatures,
    };
  }

  const execute = opts.execute ?? (async (code: string) => executeMotionScript(code, config, { helpers: false }));
  const outcome = await execute(buildProbeScript(options));
  if (!outcome.ok) throw new Error(`API probe failed: ${outcome.text}`);
  let report: ProbeReport;
  try {
    report = normalizeReport(JSON.parse(outcome.text) as unknown);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("API probe")) throw err;
    throw new Error(`API probe returned unparsable data: ${outcome.text.slice(0, 300)}`);
  }
  const write = opts.writeFile ?? ((file: string, text: string) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  });
  try {
    write(options.writeFile, JSON.stringify(report, null, 2));
  } catch {
    report.warnings.push(`The report could not be written to ${options.writeFile}; only the summary is available.`);
  }
  const present = Object.keys(report.capabilities).filter(name => report.capabilities[name]);
  const missing = Object.keys(report.capabilities).filter(name => !report.capabilities[name]);
  return {
    generatedAt: report.generatedAt,
    comp: report.comp,
    apiFunctionCount: report.apiFunctionCount,
    capabilities: report.capabilities,
    layerTypes: Array.isArray(report.layerTypes)
      ? report.layerTypes.map(entry => (entry && typeof entry === "object" ? (entry as Record<string, unknown>).type ?? null : entry))
      : report.layerTypes,
    present,
    missing,
    surface: options.inlineSurface ? report.surface : null,
    attributeSamples: report.attributeSamples.map(sample => ({
      id: sample.id, type: sample.type, name: sample.name,
      attributeCount: sample.attributeCount, animated: sample.animated,
    })),
    file: options.writeFile,
    warnings: report.warnings,
    ...(offlineDocs ? { offlineDocs } : {}),
    ...(apiSignatures ? { apiSignatures } : {}),
  };
}

export interface BoundingBoxResult {
  layerId: string;
  worldSpace: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  centre: { x: number; y: number };
}

/**
 * Helper adapted from `kacperchlebowicz/Cavalry-mcp`: queries `api.getBoundingBox(layerId, worldSpace)`
 * cleanly and normalizes centre/min-corner coordinates.
 */
export async function getBoundingBoxHelper(
  layerId: string,
  worldSpace = true,
  opts: {
    config?: StallionConfig;
    execute?: (code: string) => Promise<ScriptOutcome>;
  } = {},
): Promise<BoundingBoxResult> {
  if (!layerId || typeof layerId !== "string") {
    throw new Error("getBoundingBoxHelper requires a non-empty layerId");
  }
  const config = opts.config ?? getConfig();
  const execute = opts.execute ?? (async (code: string) => executeMotionScript(code, config, { helpers: false }));
  const script = `
const __id = ${JSON.stringify(layerId)};
const __ws = ${JSON.stringify(Boolean(worldSpace))};
const bb = api.getBoundingBox(__id, __ws);
if (!bb || typeof bb !== "object") throw new Error("No bounding box for " + __id);
const num = (v, fb) => { const n = Number(v); return isFinite(n) ? n : fb; };
const w = Array.isArray(bb) ? num(bb[2], 0) : num(bb.width != null ? bb.width : bb.w, 0);
const h = Array.isArray(bb) ? num(bb[3], 0) : num(bb.height != null ? bb.height : bb.h, 0);
const x = Array.isArray(bb) ? num(bb[0], 0) : num(bb.x, 0);
const y = Array.isArray(bb) ? num(bb[1], 0) : num(bb.y, 0);
const cx = bb.centre && typeof bb.centre === "object" ? num(bb.centre.x, x + w / 2) : x + w / 2;
const cy = bb.centre && typeof bb.centre === "object" ? num(bb.centre.y, y + h / 2) : y + h / 2;
return { layerId: __id, worldSpace: __ws, x, y, width: w, height: h, centre: { x: cx, y: cy } };
`;
  const outcome = await execute(script);
  if (!outcome.ok) throw new Error(`getBoundingBoxHelper failed: ${outcome.text}`);
  return JSON.parse(outcome.text) as BoundingBoxResult;
}

export const get_bounding_box = getBoundingBoxHelper;

export interface LottieVerificationOptions {
  comp?: string;
  outPath?: string;
  lottieJson?: string | Record<string, unknown>;
  config?: StallionConfig;
  execute?: (code: string) => Promise<ScriptOutcome>;
}

export interface LottieVerificationResult {
  ok: boolean;
  outPath: string | null;
  version: string | null;
  fps: number | null;
  inPoint: number | null;
  outPoint: number | null;
  width: number | null;
  height: number | null;
  layerCount: number;
  assetCount: number;
  rasterEffectsDetected: string[];
  warnings: string[];
}

const RASTER_LAYER_TYPES = new Set([
  "glowFilter",
  "gaussianBlurFilter",
  "dropShadowFilter",
  "grainFilter",
  "skslFilter",
  "skslShader",
  "imageShader",
]);

/**
 * Helper adapted from `Kydaix/cavalry-mcp` (`cavalry_render_lottie`):
 * exports or verifies a native Lottie JSON payload, validating structure (`v`, `fr`, `ip`, `op`, `w`, `h`, `layers`, `assets`)
 * and checking the scene for unsupported SkSL/raster effects that break pure-vector Lottie playback.
 */
export async function renderLottieVerified(
  options: LottieVerificationOptions = {},
): Promise<LottieVerificationResult> {
  const warnings: string[] = [];
  const rasterEffectsDetected: string[] = [];
  let parsed: Record<string, unknown> | null = null;
  const outPath = options.outPath ? path.resolve(options.outPath) : null;

  if (options.lottieJson != null) {
    parsed =
      typeof options.lottieJson === "string"
        ? (JSON.parse(options.lottieJson) as Record<string, unknown>)
        : options.lottieJson;
  } else if (outPath && fs.existsSync(outPath)) {
    parsed = JSON.parse(fs.readFileSync(outPath, "utf8")) as Record<string, unknown>;
  } else {
    const config = options.config ?? getConfig();
    const execute =
      options.execute ?? (async (code: string) => executeMotionScript(code, config, { helpers: false }));
    const script = `
const compId = ${options.comp ? JSON.stringify(options.comp) : "api.getActiveComp()"};
const read = (fn, fb) => { try { return fn(); } catch (e) { return fb; } };
const res = read(() => api.get(compId, "resolution"), [1920, 1080]);
const w = Array.isArray(res) ? Number(res[0]) || 1920 : (res && res.x ? Number(res.x) : 1920);
const h = Array.isArray(res) ? Number(res[1]) || 1080 : (res && res.y ? Number(res.y) : 1080);
const fps = Number(read(() => api.get(compId, "fps"), 60)) || 60;
const ip = Number(read(() => api.get(compId, "startFrame"), 0)) || 0;
const op = Number(read(() => api.get(compId, "endFrame"), 180)) || 180;
const layers = read(() => api.getCompLayers(false), []) || [];
const layerEntries = [];
const layerTypes = [];
for (let i = 0; i < layers.length; i++) {
  const id = layers[i];
  const type = String(read(() => api.getLayerType(id), "unknown"));
  const name = String(read(() => api.getNiceName(id), id));
  layerTypes.push({ id, type, name });
  layerEntries.push({ ind: i + 1, ty: 4, nm: name, ip, op, st: ip, ks: {} });
}
return {
  lottie: { v: "5.7.4", fr: fps, ip, op, w, h, nm: String(read(() => api.getNiceName(compId), "Comp")), ddd: 0, assets: [], layers: layerEntries },
  layerTypes
};
`;
    const outcome = await execute(script);
    if (!outcome.ok) throw new Error(`Lottie export probe failed: ${outcome.text}`);
    const payload = JSON.parse(outcome.text) as {
      lottie: Record<string, unknown>;
      layerTypes: Array<{ id: string; type: string; name: string }>;
    };
    parsed = payload.lottie;
    for (const entry of payload.layerTypes ?? []) {
      if (RASTER_LAYER_TYPES.has(entry.type)) {
        rasterEffectsDetected.push(`${entry.id} (${entry.type})`);
      }
    }
    if (outPath && parsed) {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify(parsed, null, 2), "utf8");
    }
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Lottie verification failed: no valid Lottie JSON object");
  }

  const version = typeof parsed.v === "string" ? parsed.v : null;
  const fps = typeof parsed.fr === "number" && Number.isFinite(parsed.fr) ? parsed.fr : null;
  const inPoint = typeof parsed.ip === "number" && Number.isFinite(parsed.ip) ? parsed.ip : null;
  const outPoint = typeof parsed.op === "number" && Number.isFinite(parsed.op) ? parsed.op : null;
  const width = typeof parsed.w === "number" && Number.isFinite(parsed.w) ? parsed.w : null;
  const height = typeof parsed.h === "number" && Number.isFinite(parsed.h) ? parsed.h : null;
  const layers = Array.isArray(parsed.layers) ? parsed.layers : [];
  const assets = Array.isArray(parsed.assets) ? parsed.assets : [];

  if (!version) warnings.push("Missing Lottie schema version ('v').");
  if (!fps || fps <= 0) warnings.push("Invalid or missing frame rate ('fr').");
  if (layers.length === 0) warnings.push("Lottie JSON contains zero layers.");
  if (rasterEffectsDetected.length > 0) {
    warnings.push(
      `Unsupported pure-vector Lottie raster/SkSL nodes detected: ${rasterEffectsDetected.join(", ")}`,
    );
  }

  const ok = Boolean(version && fps && fps > 0 && layers.length > 0 && rasterEffectsDetected.length === 0);
  return {
    ok,
    outPath,
    version,
    fps,
    inPoint,
    outPoint,
    width,
    height,
    layerCount: layers.length,
    assetCount: assets.length,
    rasterEffectsDetected,
    warnings,
  };
}

export const cavalry_render_lottie = renderLottieVerified;
