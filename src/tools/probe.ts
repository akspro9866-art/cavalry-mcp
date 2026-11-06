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
import { executeMotionScript, type ScriptOutcome } from "../runtime/execute.js";
import { getConfig, type StallionConfig } from "../bridge/stallion.js";

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
}

export function normalizeProbe(input: ProbeInput = {}): NormalizedProbe {
  if (input && typeof input !== "object") throw new Error("Probe options must be an object");
  return {
    layerIds: stringList(input.layerIds, 20),
    sampleTypes: input.sampleTypes !== false,
    includeLayerTypes: input.includeLayerTypes !== false,
    functions: input.functions && input.functions.length ? stringList(input.functions, 200) : [...PROBE_FUNCTIONS],
    inlineSurface: input.inlineSurface === true,
    writeFile: path.resolve(input.writeFile ?? defaultReportPath()),
  };
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
  };
}
