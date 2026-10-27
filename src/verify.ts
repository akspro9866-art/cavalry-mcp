/**
 * Frame verification: render isolated PNG previews at specific frames and warn
 * about world-space bounding-box collisions in the active composition.
 *
 * Everything happens in one atomic Undo script so the original timeline frame
 * is restored even when a render throws. Node only normalises options and
 * checks that Cavalry actually wrote each preview file.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { executeMotionScript, type ScriptOutcome } from "./runtime/execute.js";
import type { StallionConfig } from "./stallion.js";

export interface VerifyFramesInput {
  /** `"0,10,20"`, `"0-20:5"` ranges, or an explicit number array. */
  frames: string | number[];
  /** Defaults to `$CAVALRY_PREVIEW_DIR` or `~/.cavalry-mcp/previews`. */
  outDir?: string;
  /** Comp to activate for the render (restored afterwards). */
  comp?: string;
  /** PNG scale percentage passed to `api.renderPNGFrame` (default 100). */
  scale?: number;
  /** Preview file prefix (default `frame`). */
  prefix?: string;
  /** Maximum collision entries per frame (default 40). */
  maxCollisions?: number;
  /** Maximum layers inspected per frame (default 150). */
  maxLayers?: number;
  /** Maximum number of frames requested in one call (default 120). */
  maxFrames?: number;
  /** Include hidden layers and layers outside their in/out range. */
  includeHidden?: boolean;
}

export interface NormalizedVerifyFrames {
  frames: number[];
  outDir: string;
  comp: string | null;
  scale: number;
  prefix: string;
  maxCollisions: number;
  maxLayers: number;
  includeHidden: boolean;
}

export interface VerifyLayerRef {
  id: string;
  name: string;
  type: string;
}

export interface VerifyCollision {
  frame: number;
  a: VerifyLayerRef;
  b: VerifyLayerRef;
  overlap: { x: number; y: number; width: number; height: number };
  area: number;
}

export interface VerifyFrameEntry {
  frame: number;
  file: string;
  layers: number;
  collisions: number;
}

export interface VerifyCompSummary {
  id: string | null;
  name: string | null;
  fps: number | null;
  startFrame: number | null;
  endFrame: number | null;
  width: number;
  height: number;
}

export interface VerifyMissingPreview {
  frame: number;
  file: string;
}

export interface VerifyFramesResult {
  outDir: string;
  prefix: string;
  scale: number;
  comp: VerifyCompSummary | null;
  restoredFrame: number;
  frames: VerifyFrameEntry[];
  collisions: VerifyCollision[];
  missing: VerifyMissingPreview[];
  warnings: string[];
}

export interface VerifyFramesOptions {
  config?: StallionConfig;
  execute?: (code: string) => Promise<ScriptOutcome>;
}

/** `~/.cavalry-mcp/previews`, overridable for sandboxes and CI. */
export function defaultPreviewDir(): string {
  return process.env.CAVALRY_PREVIEW_DIR || path.join(os.homedir(), ".cavalry-mcp", "previews");
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function tooManyFrames(maxFrames: number): Error {
  return new Error(`Too many frames; limit is ${maxFrames} per --verify-frames call. Use a step or split the request.`);
}

function parseFrameList(input: string | number[], maxFrames: number): number[] {
  if (!Array.isArray(input) && typeof input !== "string") {
    throw new Error("Frames must be a comma list or a number array");
  }
  const values: number[] = [];
  if (Array.isArray(input)) {
    for (const entry of input) {
      const n = Number(entry);
      if (!Number.isFinite(n)) throw new Error(`Invalid frame value: ${String(entry)}`);
      values.push(Math.round(n));
    }
  } else {
    const tokens = input.split(",").map((token) => token.trim()).filter(Boolean);
    if (!tokens.length) throw new Error("--verify-frames needs at least one frame, e.g. 0,30,60");
    for (const token of tokens) {
      const range = token.match(/^(-?\d+)\s*(?:-|\.\.)\s*(-?\d+)(?::(\d+))?$/);
      if (range) {
        let start = Number(range[1]);
        let end = Number(range[2]);
        if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error(`Invalid frame range: ${token}`);
        if (end < start) {
          const swap = start;
          start = end;
          end = swap;
        }
        const step = Math.max(1, Math.round(Number(range[3] ?? 1)));
        const count = Math.floor((end - start) / step) + 1;
        if (values.length + count > maxFrames) throw tooManyFrames(maxFrames);
        for (let frame = start; frame <= end; frame += step) values.push(frame);
        continue;
      }
      if (!/^-?\d+$/.test(token)) throw new Error(`Invalid frame token: ${token}`);
      values.push(Number(token));
    }
  }
  if (!values.length) throw new Error("--verify-frames needs at least one frame, e.g. 0,30,60");

  const unique: number[] = [];
  const seen = new Set<number>();
  for (const frame of values) {
    if (seen.has(frame)) continue;
    seen.add(frame);
    unique.push(frame);
  }
  if (unique.length > maxFrames) throw tooManyFrames(maxFrames);
  return unique;
}

export function normalizeVerifyFrames(input: VerifyFramesInput): NormalizedVerifyFrames {
  if (!input || typeof input !== "object") throw new Error("Verify options must be an object");
  const maxFrames = clampInt(input.maxFrames, 120, 1, 2000);
  const frames = parseFrameList(input.frames, maxFrames);
  const prefix = String(input.prefix || "frame").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  const comp = typeof input.comp === "string" && input.comp.trim() ? input.comp.trim() : null;
  return {
    frames,
    outDir: path.resolve(input.outDir || defaultPreviewDir()),
    comp,
    scale: clampInt(input.scale, 100, 1, 400),
    prefix: prefix || "frame",
    maxCollisions: clampInt(input.maxCollisions, 40, 1, 200),
    maxLayers: clampInt(input.maxLayers, 150, 1, 500),
    includeHidden: input.includeHidden === true,
  };
}

/** One atomic script: render each frame, restore the playhead, analyse boxes. */
export function buildVerifyScript(options: NormalizedVerifyFrames): string {
  const payload = {
    frames: options.frames,
    outDir: options.outDir.replace(/\\/g, "/"),
    comp: options.comp,
    scale: options.scale,
    prefix: options.prefix,
    maxCollisions: options.maxCollisions,
    maxLayers: options.maxLayers,
    includeHidden: options.includeHidden,
  };
  return `const __verify = ${JSON.stringify(payload)};
const __read = (fn) => { try { return fn(); } catch (e) { return null; } };
const __num = (value, fallback) => { const n = Number(value); return isFinite(n) ? n : fallback; };
const __pad = (frame) => {
  const sign = frame < 0 ? "-" : "";
  let text = String(Math.abs(Math.round(frame)));
  while (text.length < 6) text = "0" + text;
  return sign + text;
};
const __prevComp = __read(() => api.getActiveComp());
if (__verify.comp) api.setActiveComp(__verify.comp);
const __prevFrame = __num(__read(() => api.getFrame()), 0);
const __compId = __read(() => api.getActiveComp());
const __compName = __read(() => api.getNiceName(__compId));
const __compFps = __read(() => api.get(__compId, "fps"));
const __startRaw = __read(() => api.get(__compId, "startFrame"));
const __endRaw = __read(() => api.get(__compId, "endFrame"));
const __compStart = __num(__startRaw != null ? __startRaw : __read(() => api.getInFrame(__compId)), null);
const __compEnd = __num(__endRaw != null ? __endRaw : __read(() => api.getOutFrame(__compId)), null);
const __resRaw = __read(() => api.get(__compId, "resolution"));
let __compWidth = 0;
let __compHeight = 0;
if (Array.isArray(__resRaw)) {
  __compWidth = __num(__resRaw[0], 0);
  __compHeight = __num(__resRaw[1], 0);
} else if (__resRaw && typeof __resRaw === "object") {
  __compWidth = __num(__resRaw.x != null ? __resRaw.x : __resRaw.width, 0);
  __compHeight = __num(__resRaw.y != null ? __resRaw.y : __resRaw.height, 0);
} else if (__resRaw != null) {
  const __wh = String(__resRaw).split("x");
  if (__wh.length === 2) {
    __compWidth = __num(__wh[0], 0);
    __compHeight = __num(__wh[1], 0);
  }
}
if (!(__compWidth > 0)) __compWidth = 1920;
if (!(__compHeight > 0)) __compHeight = 1080;
// Behaviour/deformer nodes are not visual layers; their boxes would only add noise.
const __nonVisual = {
  "null": true,
  falloff: true,
  noise: true,
  oscillator: true,
  stagger: true,
  noiseDeformer: true,
  connectShape: true,
  meshDistribution: true,
  colorArray: true,
  valueBlend: true
};
const __all = __read(() => api.getCompLayers(false));
const __ids = [];
if (Array.isArray(__all)) {
  const __seen = {};
  for (let i = 0; i < __all.length && __ids.length < __verify.maxLayers; i++) {
    const id = __all[i];
    if (__seen[id]) continue;
    __seen[id] = true;
    __ids.push(id);
  }
}
const __parents = {};
for (let i = 0; i < __ids.length; i++) {
  const id = __ids[i];
  const parent = __read(() => api.getParent(id));
  if (parent && parent !== id) __parents[id] = String(parent);
}
const __related = (one, two) => {
  let current = __parents[one];
  for (let depth = 0; current && depth < 32; depth++) {
    if (current === two) return true;
    current = __parents[current];
  }
  current = __parents[two];
  for (let depth = 0; current && depth < 32; depth++) {
    if (current === one) return true;
    current = __parents[current];
  }
  return false;
};
const __activeAt = (id, frame) => {
  if (__verify.includeHidden) return true;
  const inFrame = __read(() => api.getInFrame(id));
  const outFrame = __read(() => api.getOutFrame(id));
  if (inFrame != null && __num(inFrame, frame) > frame) return false;
  if (outFrame != null && __num(outFrame, frame) < frame) return false;
  return true;
};
const __visible = (id) => {
  if (__read(() => api.get(id, "visible")) === false) return false;
  if (__read(() => api.get(id, "hidden")) === true) return false;
  return true;
};
const __box = (id) => {
  const raw = __read(() => api.getBoundingBox(id, true));
  if (!raw || typeof raw !== "object") return null;
  let x = __num(raw.x != null ? raw.x : raw.left, null);
  let y = __num(raw.y != null ? raw.y : raw.top, null);
  if (x == null || y == null) return null;
  let width = __num(raw.width, 0);
  let height = __num(raw.height, 0);
  if (!(width > 0) && raw.right != null) width = __num(raw.right, x) - x;
  if (!(height > 0) && raw.bottom != null) height = __num(raw.bottom, y) - y;
  width = Math.abs(width);
  height = Math.abs(height);
  if (!(width > 1) || !(height > 1)) return null;
  // Full-bleed backgrounds are intentional; do not warn about every layer over them.
  if (width >= __compWidth * 0.9 && height >= __compHeight * 0.9) return null;
  return { x: x, y: y, width: width, height: height };
};
const __collisions = [];
const __frames = [];
try {
  for (let i = 0; i < __verify.frames.length; i++) {
    const frame = __verify.frames[i];
    api.setFrame(frame);
    const base = __verify.outDir + "/" + __verify.prefix + "_" + __pad(frame);
    api.renderPNGFrame(base, __verify.scale);
    const entries = [];
    for (let j = 0; j < __ids.length; j++) {
      const id = __ids[j];
      if (!__activeAt(id, frame) || !__visible(id)) continue;
      const type = __read(() => api.getLayerType(id));
      if (type && __nonVisual[type]) continue;
      const box = __box(id);
      if (!box) continue;
      entries.push({
        id: id,
        type: type || "layer",
        name: String(__read(() => api.getNiceName(id)) || id),
        box: box
      });
    }
    const found = [];
    for (let a = 0; a < entries.length; a++) {
      for (let b = a + 1; b < entries.length; b++) {
        const left = entries[a];
        const right = entries[b];
        if (__related(left.id, right.id)) continue;
        const x = Math.max(left.box.x, right.box.x);
        const y = Math.max(left.box.y, right.box.y);
        const width = Math.min(left.box.x + left.box.width, right.box.x + right.box.width) - x;
        const height = Math.min(left.box.y + left.box.height, right.box.y + right.box.height) - y;
        if (width <= 1 || height <= 1) continue;
        found.push({
          frame: frame,
          a: { id: left.id, name: left.name, type: left.type },
          b: { id: right.id, name: right.name, type: right.type },
          overlap: { x: x, y: y, width: width, height: height },
          area: Math.round(width * height)
        });
      }
    }
    found.sort((one, two) => two.area - one.area);
    let kept = 0;
    for (let k = 0; k < found.length && kept < __verify.maxCollisions; k++) {
      __collisions.push(found[k]);
      kept += 1;
    }
    __frames.push({ frame: frame, file: base + ".png", layers: entries.length, collisions: kept });
  }
} finally {
  try { api.setFrame(__prevFrame); } catch (e) {}
  if (__verify.comp && __prevComp) { try { api.setActiveComp(__prevComp); } catch (e) {} }
}
return {
  comp: {
    id: __compId,
    name: __compName,
    fps: __num(__compFps, null),
    startFrame: __compStart,
    endFrame: __compEnd,
    width: __compWidth,
    height: __compHeight
  },
  outDir: __verify.outDir,
  prefix: __verify.prefix,
  scale: __verify.scale,
  restoredFrame: __prevFrame,
  frames: __frames,
  collisions: __collisions
};`;
}

export function formatVerifyWarning(collision: VerifyCollision): string {
  const size = `${Math.round(collision.overlap.width)}x${Math.round(collision.overlap.height)}`;
  return `frame ${collision.frame}: "${collision.a.name}" (${collision.a.type} ${collision.a.id}) overlaps "${collision.b.name}" (${collision.b.type} ${collision.b.id}) by ${size} (${collision.area}px^2)`;
}

function normalizeManifest(value: unknown): {
  comp: VerifyCompSummary | null;
  restoredFrame: number;
  frames: VerifyFrameEntry[];
  collisions: VerifyCollision[];
} {
  if (!value || typeof value !== "object") throw new Error("Frame verification returned no manifest");
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.frames)) throw new Error("Frame verification returned no frame manifest");
  const num = (entry: unknown, fallback: number): number => {
    const n = Number(entry);
    return Number.isFinite(n) ? n : fallback;
  };
  const frames: VerifyFrameEntry[] = raw.frames.map((entry, index) => {
    const item = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    return {
      frame: num(item.frame, index),
      file: typeof item.file === "string" ? item.file : "",
      layers: num(item.layers, 0),
      collisions: num(item.collisions, 0),
    };
  });
  const collisions: VerifyCollision[] = Array.isArray(raw.collisions)
    ? raw.collisions.map((entry) => {
        const item = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
        return item as unknown as VerifyCollision;
      })
    : [];
  const compRaw = raw.comp && typeof raw.comp === "object" ? raw.comp as Record<string, unknown> : null;
  const comp: VerifyCompSummary | null = compRaw
    ? {
        id: typeof compRaw.id === "string" ? compRaw.id : null,
        name: typeof compRaw.name === "string" ? compRaw.name : null,
        fps: Number.isFinite(Number(compRaw.fps)) ? Number(compRaw.fps) : null,
        startFrame: Number.isFinite(Number(compRaw.startFrame)) ? Number(compRaw.startFrame) : null,
        endFrame: Number.isFinite(Number(compRaw.endFrame)) ? Number(compRaw.endFrame) : null,
        width: num(compRaw.width, 0),
        height: num(compRaw.height, 0),
      }
    : null;
  return { comp, restoredFrame: num(raw.restoredFrame, 0), frames, collisions };
}

export async function runVerifyFrames(
  input: VerifyFramesInput,
  opts: VerifyFramesOptions = {},
): Promise<VerifyFramesResult> {
  const normalized = normalizeVerifyFrames(input);
  fs.mkdirSync(normalized.outDir, { recursive: true });
  const execute = opts.execute ?? ((code: string) => executeMotionScript(code, opts.config, { helpers: false }));
  const outcome = await execute(buildVerifyScript(normalized));
  if (!outcome.ok) throw new Error(`Frame verification failed: ${outcome.text}`);
  let manifest: ReturnType<typeof normalizeManifest>;
  try {
    manifest = normalizeManifest(JSON.parse(outcome.text) as unknown);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Frame verification")) throw err;
    throw new Error(`Frame verification returned unparsable data: ${outcome.text.slice(0, 300)}`);
  }

  const missing: VerifyMissingPreview[] = [];
  for (const entry of manifest.frames) {
    if (!entry.file || !fs.existsSync(entry.file)) {
      missing.push({ frame: entry.frame, file: entry.file });
    }
  }
  const warnings = [
    ...manifest.collisions.map(formatVerifyWarning),
    ...missing.map((entry) => `frame ${entry.frame}: preview was not written (${entry.file})`),
  ];
  return {
    outDir: normalized.outDir,
    prefix: normalized.prefix,
    scale: normalized.scale,
    comp: manifest.comp,
    restoredFrame: manifest.restoredFrame,
    frames: manifest.frames,
    collisions: manifest.collisions,
    missing,
    warnings,
  };
}
