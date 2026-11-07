/**
 * The `--strict-dsl` zero-slop agent surface: exactly four tools, no
 * granular escape hatches.
 *
 *   - `cavalry_exec_mg`      — validate + normalize a `_mg` manifest, execute
 *                              it in ONE /batch-step round trip.
 *   - `cavalry_query_presets`— bounded keyword search across the 120-preset
 *                              library with signatures and required params.
 *   - `cavalry_inspect_rig`  — stallion `/batch_inspect`: compact hierarchy +
 *                              bounding-box trajectory summary, geometry only.
 *   - `cavalry_clone_beat`   — trigger refclone's autonomous local pipeline
 *                              for one reference beat; returns convergence
 *                              telemetry (bbox L2, SSIM, LLM token count).
 *
 * Registered INSTEAD of the compact/legacy surfaces when the server is
 * started with `--strict-dsl` or `CAVALRY_MCP_STRICT_DSL=1`. The per-frame
 * keyframe setters and single-attribute setters of the legacy surface are the
 * "AI slop" path — under this flag they are not merely hidden, they are not
 * even listed, so an agent cannot drift into them.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  runBatchInspect,
  runBatchStep,
  type BatchInspectResponse,
} from "../bridge/stallion.js";
import { searchPresets } from "../lib/index.js";
import { compilePreset, PRESET_DEFS, resolvePresetName } from "../presets/cavalry_snippets.js";
import { validateMgManifest, type MgValidationOk } from "../validator/mg_validator.js";

function jsonResult(payload: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

function textResult(text: string, isError = false) {
  return { content: [{ type: "text" as const, text }], ...(isError ? { isError: true } : {}) };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Preset invocation: resolved client-side, executed inside the batch-step script. */
interface PresetInvocation {
  id: string;
  params?: Record<string, unknown>;
}

function presetPrelude(invocations: PresetInvocation[]): { script: string; errors: string[]; applied: string[] } {
  // Same prelude contract as the compact surface: each preset body returns its
  // tracked roots, aliased as `$<presetId>_<key>` so the manifest and later
  // patches can address them.
  const errors: string[] = [];
  const applied: string[] = [];
  const chunks: string[] = [];
  for (const invocation of invocations) {
    let resolved = invocation.id;
    try {
      resolved = resolvePresetName(invocation.id);
    } catch {
      /* handled below */
    }
    if (!PRESET_DEFS.some((def) => def.id === resolved)) {
      errors.push(`${invocation.id}: unknown preset id — query cavalry_query_presets first.`);
      continue;
    }
    const script = compilePreset(resolved, invocation.params ?? {});
    chunks.push(`var __presetResult = (function () {
${script}
})();
if (__presetResult && typeof __presetResult === "object") {
  for (var __key in __presetResult) {
    if (__key === "preset") continue;
    var __layerId = __presetResult[__key];
    if (typeof __layerId === "string" && __layerId && typeof _mg !== "undefined") {
      _mg.alias(__layerId, ${JSON.stringify(resolved)} + "_" + __key);
    }
  }
}`);
    applied.push(resolved);
  }
  return { script: chunks.join("\n"), errors, applied };
}

export function registerStrictTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // cavalry_exec_mg — validate + execute a full _mg payload in one shot
  // -------------------------------------------------------------------------
  server.tool(
    "cavalry_exec_mg",
    "Compile and execute a full declarative _mg manifest (plus optional preset invocations) in ONE atomic round trip. The manifest is validated and normalized first: common attribute aliases (fillColor -> material.fillColor, rot -> rotation, alpha -> opacity, pos -> position, …) are rewritten and reported as `fixes`. No raw per-frame keyframe baking, no raw Cavalry JS.",
    {
      manifest: z.record(z.string(), z.unknown()).describe('Declarative _mg manifest: { comp?: {width,height,fps,endFrame,bg}, layers?: [{as, kind: "shape"|"layer"|"text"|"svg"|"image", ...}], ops?: [{op: "set"|"keyframe"|"easing"|"connect"|"expression"|"delete"|"order"|"fit", ...}], presets?: [{id, params}] }. Later ops address created layers as "$name".'),
      script: z.string().optional().describe("Optional raw JS body for rig logic the manifest cannot express (escape hatch; _mg/_rb are preloaded). Prefer manifest ops."),
      sampleFrames: z.array(z.number().int()).max(64).optional().describe("Frames to sample after execution (max 64). Default [0]."),
      queryLayers: z.array(z.string()).max(200).optional().describe("Layer ids/aliases ($name) to measure."),
      comp: z.string().optional().describe("Comp id to activate for the call (restored afterwards)."),
    },
    async args => {
      try {
        const validation = validateMgManifest({ ...args.manifest } as object);
        if (!validation.ok) {
          return jsonResult({ ok: false, stage: "validation", errors: validation.errors, ...(validation.suggestions ? { presetSuggestions: validation.suggestions } : {}) }, true);
        }
        const good = validation as MgValidationOk;
        const prelude = presetPrelude(((good.normalized.presets ?? []) as PresetInvocation[]) ?? []);
        const scriptChunks: string[] = [];
        if (prelude.script) scriptChunks.push(prelude.script);
        if (args.script) scriptChunks.push(args.script);
        const { compileMgDsl } = await import("../runtime/mg_manifest.js");
        const manifest = { ...good.normalized } as Record<string, unknown>;
        delete manifest.presets; // already resolved into the prelude
        const compiled = compileMgDsl(manifest as never);
        const script = scriptChunks.length ? `${scriptChunks.join("\n")}\n${compiled}` : compiled;
        const response = await runBatchStep({
          script,
          sampleFrames: args.sampleFrames && args.sampleFrames.length ? args.sampleFrames : [0],
          queryLayers: args.queryLayers,
          compId: args.comp,
        });
        if (!response.ok) {
          return jsonResult({ ok: false, stage: "execution", error: response.error ?? "unknown batch-step failure", fixes: good.fixes, presetErrors: prelude.errors.length ? prelude.errors : undefined }, true);
        }
        return jsonResult({
          ok: true,
          fixes: good.fixes,
          warnings: good.warnings,
          presetsApplied: prelude.applied,
          compactDomTsv: response.compactDomTsv ?? "",
          sampleFrameGeometries: response.frames ?? {},
          executionTimeMs: response.executionTimeMs,
        });
      } catch (err) {
        return textResult(`cavalry_exec_mg failed: ${message(err)}`, true);
      }
    },
  );

  // -------------------------------------------------------------------------
  // cavalry_query_presets — bounded preset discovery
  // -------------------------------------------------------------------------
  server.tool(
    "cavalry_query_presets",
    "Keyword-filter the 120-preset procedural library (14 category packs) and return compact preset signatures: id, motion signature, required parameters, defaults. Always query before invoking a preset in cavalry_exec_mg — the catalog is never listed inline.",
    {
      query: z.string().optional().describe('Space-separated keywords; every word must match (AND). Examples: "counter spring", "progress bar", "stagger".'),
      category: z.string().optional().describe("Category filter: id, index (1-14) or label fragment."),
    },
    async args => {
      try {
        const result = searchPresets(args.query ?? "", args.category);
        return jsonResult({
          query: result.query,
          category: result.category,
          matched: result.matched,
          total: result.total,
          presets: result.presets.map(preset => ({
            id: preset.id,
            title: preset.title,
            category: preset.category,
            motionSignature: preset.motionSignature,
            requiredParams: preset.requiredParams,
            defaultDuration: preset.defaultDuration,
            params: preset.params,
          })),
        });
      } catch (err) {
        return textResult(`cavalry_query_presets failed: ${message(err)}`, true);
      }
    },
  );

  // -------------------------------------------------------------------------
  // cavalry_inspect_rig — compact hierarchy + bbox trajectory summary
  // -------------------------------------------------------------------------
  server.tool(
    "cavalry_inspect_rig",
    "Inspect the live rig through stallion /batch_inspect: scrub the requested frames, return each layer's world-space bounding-box trajectory and attribute values in one compact summary. Geometry only — no rendering, playhead restored.",
    {
      frames: z.array(z.number().int()).min(1).max(64).describe("Frames to evaluate (1..64), e.g. [f_start, f_mid1, f_mid2, f_end]."),
      layerIds: z.array(z.string()).max(200).optional().describe("Layer ids/aliases to measure. Default: every layer in the active comp."),
      attributes: z.array(z.string()).max(16).optional().describe("Attribute paths to include (default: position/scale/rotation/opacity)."),
      comp: z.string().optional().describe("Comp id (default: active comp)."),
    },
    async args => {
      try {
        const response: BatchInspectResponse = await runBatchInspect({
          frames: args.frames,
          layerIds: args.layerIds,
          attributes: args.attributes,
          compId: args.comp,
        });
        if (!response.ok) {
          return jsonResult({ ok: false, error: response.error ?? "unknown batch_inspect failure", code: response.code }, true);
        }
        return jsonResult(summarizeInspection(response));
      } catch (err) {
        return textResult(`cavalry_inspect_rig failed: ${message(err)}`, true);
      }
    },
  );

  // -------------------------------------------------------------------------
  // cavalry_clone_beat — refclone's autonomous local pipeline, one beat
  // -------------------------------------------------------------------------
  server.tool(
    "cavalry_clone_beat",
    "Run refclone's autonomous zero-slop pipeline for one reference beat (local, deterministic): deconstruction -> promotion -> _mg compile -> Stage 4.5 bbox solver -> SSIM gate. Returns the final convergence telemetry (bbox L2 before/after, SSIM, LLM tokens consumed). Requires the sibling refclone checkout (or CAVALRY_REFCLONE_PATH).",
    {
      plan: z.record(z.string(), z.unknown()).optional().describe("Inline zero-slop pipeline plan (tracks, crops, elements, comp, thresholds). Written to a temp file and passed as --plan."),
      planPath: z.string().optional().describe("Path to a plan JSON on disk. Takes precedence over `plan`."),
      refclonePath: z.string().optional().describe("Path to the refclone checkout (its src/cli.mjs is used). Default: $CAVALRY_REFCLONE_PATH or the sibling directory."),
      jobDirectory: z.string().optional().describe("Directory for run artifacts."),
      baseUrl: z.string().optional().describe("Stallion base URL override (default http://127.0.0.1:8080 or $STALLION_URL)."),
      timeoutMs: z.number().int().min(1000).max(900_000).optional().describe("Wall-clock budget for the run (default 300000)."),
    },
    async args => {
      try {
        const outcome = await runRefcloneBeat(args);
        return jsonResult(outcome.payload, !outcome.ok);
      } catch (err) {
        return textResult(`cavalry_clone_beat failed: ${message(err)}`, true);
      }
    },
  );
}

/** Reduce the batch_inspect envelope to the trajectory summary agents read. */
export function summarizeInspection(response: BatchInspectResponse): Record<string, unknown> {
  const timeline = response.timeline ?? {};
  const layers: Record<string, unknown> = {};
  const frameKeys = Object.keys(timeline).sort((a, b) => Number(a) - Number(b));
  const ids = new Set<string>();
  for (const frameKey of frameKeys) {
    for (const id of Object.keys(timeline[frameKey] ?? {})) ids.add(id);
  }
  for (const id of ids) {
    const path: Array<{ f: number; cx: number; cy: number; w: number; h: number }> = [];
    let first: Record<string, unknown> | null = null;
    let last: Record<string, unknown> | null = null;
    let visibleFrames = 0;
    for (const frameKey of frameKeys) {
      const entry = timeline[frameKey]?.[id];
      if (!entry) continue;
      if (!first) first = { frame: Number(frameKey), ...entry };
      last = { frame: Number(frameKey), ...entry };
      if (entry.visible) visibleFrames++;
      path.push({ f: Number(frameKey), cx: Math.round(entry.bbox.cx * 100) / 100, cy: Math.round(entry.bbox.cy * 100) / 100, w: Math.round(entry.bbox.w * 100) / 100, h: Math.round(entry.bbox.h * 100) / 100 });
    }
    const drift = first && last ? { dx: Math.round(((last.bbox as { cx: number }).cx - (first.bbox as { cx: number }).cx) * 100) / 100, dy: Math.round(((last.bbox as { cy: number }).cy - (first.bbox as { cy: number }).cy) * 100) / 100 } : null;
    layers[id] = {
      measuredFrames: path.length,
      visibleFrames,
      first: first ? { frame: first.frame, bbox: first.bbox } : null,
      last: last ? { frame: last.frame, bbox: last.bbox } : null,
      drift,
      attrs: first ? (first.attrs as Record<string, unknown>) : {},
      trajectory: path,
    };
  }
  return {
    ok: true,
    compId: response.compId,
    compFrameRate: response.compFrameRate ?? null,
    compResolution: response.compResolution ?? null,
    frames: frameKeys.map(Number),
    unknownLayerIds: response.unknownLayerIds,
    restoredFrame: response.restoredFrame,
    layers,
  };
}

// ---------------------------------------------------------------------------
// refclone bridge
// ---------------------------------------------------------------------------

export interface RefcloneBeatOutcome {
  ok: boolean;
  payload: Record<string, unknown>;
}

/** Resolve the refclone checkout: explicit arg → env → sibling directory. */
export function resolveRefcloneCli(explicit?: string): string {
  const candidates = [
    explicit,
    process.env.CAVALRY_REFCLONE_PATH,
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "refclone", "src", "cli.mjs"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "refclone", "src", "cli.mjs"),
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return path.resolve(candidate);
  }
  throw new Error(
    `refclone CLI not found (tried: ${candidates.join(", ")}). Pass refclonePath, set CAVALRY_REFCLONE_PATH, or check out refclone as a sibling of cavalry-mcp.`,
  );
}

/**
 * Spawn `refclone zero-slop` for one beat and return its telemetry JSON.
 * The plan travels as a temp file (Windows-safe name, forward-slash args),
 * stdout is parsed as JSON, and the child is killed at the deadline.
 */
export async function runRefcloneBeat(args: {
  plan?: Record<string, unknown>;
  planPath?: string;
  refclonePath?: string;
  jobDirectory?: string;
  baseUrl?: string;
  timeoutMs?: number;
}): Promise<RefcloneBeatOutcome> {
  // Validate the request BEFORE resolving the CLI, so a missing plan is a
  // structured JSON error even on machines without the sibling checkout.
  let planFile: string | null = null;
  if (args.planPath) {
    if (!fs.existsSync(args.planPath)) {
      return { ok: false, payload: { ok: false, error: `planPath does not exist: ${args.planPath}` } };
    }
    planFile = path.resolve(args.planPath);
  } else if (args.plan) {
    planFile = path.join(os.tmpdir(), `cavalry-clone-beat-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}.json`);
    fs.writeFileSync(planFile, JSON.stringify(args.plan), "utf8");
  } else {
    return { ok: false, payload: { ok: false, error: "cavalry_clone_beat requires `plan` (inline object) or `planPath`." } };
  }
  const cli = resolveRefcloneCli(args.refclonePath);
  // The CLI's positional parser requires a reference argument before flags;
  // zero-slop reads its input from --plan and ignores the positional.
  const cliArgs = [cli, "zero-slop", "beat", "--plan", planFile];
  if (args.jobDirectory) cliArgs.push("--job", path.resolve(args.jobDirectory));
  if (args.baseUrl) cliArgs.push("--base-url", args.baseUrl);
  const startedAt = Date.now();
  const timeoutMs = args.timeoutMs ?? 300_000;
  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, cliArgs, { cwd: path.dirname(path.dirname(cli)), windowsHide: true });
      let out = "";
      let err = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`refclone exceeded ${timeoutMs} ms and was terminated.`));
      }, timeoutMs);
      child.stdout.on("data", (chunk: Buffer) => {
        out += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        err += chunk.toString("utf8");
      });
      child.on("error", reject);
      child.on("close", code => {
        clearTimeout(timer);
        if (code === 0) resolve(out);
        else reject(new Error(`refclone exited ${code}: ${err.slice(0, 2000) || out.slice(0, 2000)}`));
      });
    });
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    return { ok: true, payload: { ...parsed, planFile, durationMs: Date.now() - startedAt } };
  } catch (error) {
    return { ok: false, payload: { ok: false, error: message(error), planFile, durationMs: Date.now() - startedAt } };
  } finally {
    if (args.plan && planFile) {
      try {
        fs.unlinkSync(planFile);
      } catch {
        /* temp cleanup is best effort */
      }
    }
  }
}
