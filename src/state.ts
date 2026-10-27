/**
 * Execution-state loopback: the Stallion wrapper writes a tiny JSON snapshot
 * after every atomic Undo group closes; Node reads it back for spatial and
 * error feedback. The file is per-machine (not per-call) and correlated by
 * `seq`, so a stale snapshot can never be mistaken for the current run.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface ExecutionBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  centre?: { x: number; y: number };
}

export interface ExecutionCompInfo {
  id?: string;
  name?: string | null;
  fps?: number | null;
  startFrame?: number | null;
  endFrame?: number | null;
  resolution?: [number, number] | null;
  width?: number | null;
  height?: number | null;
}

export interface ExecutionState {
  seq?: string;
  status: "ok" | "error";
  errorStack: string | null;
  createdLayerIds: string[];
  activeSelection: string[];
  compInfo: ExecutionCompInfo | null;
  boundingBoxes: Record<string, ExecutionBoundingBox>;
  modifiedLayerIds?: string[];
  durationMs?: number;
  writtenAt?: string;
  writeFailed?: string;
}

/** `~/.cavalry-mcp/last-execution-state.json`, overridable for sandboxes. */
export function defaultStatePath(): string {
  return process.env.CAVALRY_STATE_PATH || path.join(os.homedir(), ".cavalry-mcp", "last-execution-state.json");
}

export function ensureStateDir(statePath: string): void {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeBox(value: unknown): ExecutionBoundingBox | null {
  if (!value || typeof value !== "object") return null;
  const box = value as Record<string, unknown>;
  const x = num(box.x) ?? 0;
  const y = num(box.y) ?? 0;
  const width = num(box.width) ?? 0;
  const height = num(box.height) ?? 0;
  const centre = box.centre && typeof box.centre === "object"
    ? {
        x: num((box.centre as Record<string, unknown>).x) ?? x + width / 2,
        y: num((box.centre as Record<string, unknown>).y) ?? y + height / 2,
      }
    : undefined;
  return { x, y, width, height, ...(centre ? { centre } : {}) };
}

function normalizeState(value: unknown): ExecutionState | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const boxes: Record<string, ExecutionBoundingBox> = {};
  if (raw.boundingBoxes && typeof raw.boundingBoxes === "object") {
    for (const [id, box] of Object.entries(raw.boundingBoxes as Record<string, unknown>)) {
      const normalized = normalizeBox(box);
      if (normalized) boxes[id] = normalized;
    }
  }
  const compRaw = raw.compInfo && typeof raw.compInfo === "object"
    ? raw.compInfo as Record<string, unknown>
    : null;
  let resolution: [number, number] | null = null;
  if (Array.isArray(compRaw?.resolution)) {
    const w = num(compRaw?.resolution[0]);
    const h = num(compRaw?.resolution[1]);
    if (w != null && h != null) resolution = [w, h];
  } else if (compRaw?.resolution && typeof compRaw.resolution === "object") {
    const r = compRaw.resolution as Record<string, unknown>;
    const w = num(r.x ?? r.width);
    const h = num(r.y ?? r.height);
    if (w != null && h != null) resolution = [w, h];
  }
  const compInfo: ExecutionCompInfo | null = compRaw
    ? {
        id: typeof compRaw.id === "string" ? compRaw.id : undefined,
        name: typeof compRaw.name === "string" ? compRaw.name : null,
        fps: num(compRaw.fps),
        startFrame: num(compRaw.startFrame),
        endFrame: num(compRaw.endFrame),
        resolution,
        width: num(compRaw.width) ?? resolution?.[0] ?? null,
        height: num(compRaw.height) ?? resolution?.[1] ?? null,
      }
    : null;
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  const state: ExecutionState = {
    seq: typeof raw.seq === "string" ? raw.seq : undefined,
    status: raw.status === "error" ? "error" : "ok",
    errorStack: typeof raw.errorStack === "string" ? raw.errorStack : null,
    createdLayerIds: strings(raw.createdLayerIds),
    activeSelection: strings(raw.activeSelection),
    compInfo,
    boundingBoxes: boxes,
    modifiedLayerIds: strings(raw.modifiedLayerIds),
  };
  if (typeof raw.durationMs === "number") state.durationMs = raw.durationMs;
  if (typeof raw.writtenAt === "string") state.writtenAt = raw.writtenAt;
  if (typeof raw.writeFailed === "string") state.writeFailed = raw.writeFailed;
  return state;
}

/** Read the last snapshot, only if it belongs to `seq` (when supplied). */
export function readExecutionState(statePath: string, seq?: string): ExecutionState | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8")) as unknown;
    const state = normalizeState(parsed);
    if (!state) return null;
    if (seq && state.seq !== seq) return null;
    return state;
  } catch {
    return null;
  }
}

/** Fallback for bridges that embed the snapshot in the result envelope. */
export function stateFromEnvelope(raw: string, seq?: string): ExecutionState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const candidate = parsed.state ?? parsed.telemetry;
    const state = normalizeState(candidate);
    if (!state) return null;
    if (seq && state.seq && state.seq !== seq) return null;
    return state;
  } catch {
    return null;
  }
}

/** Compact one-line summary for CLI stderr and logs. */
export function formatExecutionState(state: ExecutionState): string {
  const parts: string[] = [state.status.toUpperCase()];
  const comp = state.compInfo;
  if (comp) {
    const res = comp.resolution ? `${comp.resolution[0]}x${comp.resolution[1]}` : comp.width && comp.height ? `${comp.width}x${comp.height}` : null;
    const range = comp.startFrame != null && comp.endFrame != null ? ` frames ${comp.startFrame}-${comp.endFrame}` : "";
    parts.push([comp.name || comp.id, res, comp.fps != null ? `${comp.fps}fps` : null].filter(Boolean).join(" ") + range);
  }
  if (state.createdLayerIds.length) parts.push(`${state.createdLayerIds.length} created`);
  if (state.activeSelection.length) parts.push(`${state.activeSelection.length} selected`);
  if (state.boundingBoxes) {
    const boxes = Object.keys(state.boundingBoxes).length;
    if (boxes) parts.push(`${boxes} bbox`);
  }
  if (state.durationMs != null) parts.push(`${state.durationMs}ms`);
  return parts.join(" | ");
}
