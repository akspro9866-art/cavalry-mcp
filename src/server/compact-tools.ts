/**
 * The compact tool surface for external agents: three scene tools plus the
 * two runtime cloned-style tools registered at the end (five total).
 *
 * Everything verbose lives behind them:
 *   - scene state never returns as a JSON DOM dump — `cavalry_inspect_compact`
 *     serializes the readback into the line-per-layer TSV the bridge itself
 *     uses for `compactDomTsv`;
 *   - the 120-preset catalog never enters a system prompt —
 *     `cavalry_search_presets` returns bounded metadata for a keyword query;
 *   - scene construction is declarative — `cavalry_apply_dsl` executes a
 *     `_mg` manifest (plus optional preset invocations) through ONE
 *     `/batch-step` round trip and answers with the compact DOM, sampled
 *     frame geometry and a diff summary.
 *
 * The legacy granular tools (`cavalry_run_script`, `cavalry_batch`, …) stay
 * available behind `CAVALRY_MCP_LEGACY_CRUD=1` for internal callers.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PRESET_CATEGORIES } from "../presets/types.js";
import { type MgDslManifest } from "../runtime/mg_manifest.js";
import { runBatchStep, runReadback, type BatchStepResponse } from "../bridge/stallion.js";
import { resolvePreset, searchPresets, lookupPresetCompact, serializeCompactTsv, type CompactTsvLayer } from "../lib/index.js";
import { registerClonedTools } from "./cloned-tools.js";

function textResult(text: string, isError = false) {
  return isError
    ? { content: [{ type: "text" as const, text }], isError: true }
    : { content: [{ type: "text" as const, text }] };
}

function jsonResult(payload: unknown, isError = false) {
  return textResult(JSON.stringify(payload, null, 2), isError);
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
  const errors: string[] = [];
  const applied: string[] = [];
  const chunks: string[] = [];
  for (const invocation of invocations) {
    const resolved = resolvePreset(invocation.id, invocation.params ?? {});
    if (!resolved.ok) {
      errors.push(`${invocation.id}: ${resolved.error}`);
      continue;
    }
    // Each preset body returns its tracked roots; alias them so the manifest
    // (and later patches) can address them as `$<presetId>_<key>`.
    chunks.push(`var __presetResult = (function () {
${resolved.script}
})();
if (__presetResult && typeof __presetResult === "object") {
  for (var __key in __presetResult) {
    if (__key === "preset") continue;
    var __layerId = __presetResult[__key];
    if (typeof __layerId === "string" && __layerId && typeof _mg !== "undefined") {
      _mg.alias(__layerId, ${JSON.stringify(resolved.presetId)} + "_" + __key);
    }
  }
}`);
    applied.push(resolved.presetId);
  }
  return { script: chunks.join("\n"), errors, applied };
}

function diffSummary(response: BatchStepResponse): Record<string, unknown> {
  const manifest = response.manifestResult ?? null;
  const ops = Array.isArray(manifest?.ops) ? manifest!.ops! : [];
  const failedOps = ops.filter((op) => op.ok !== true);
  const renderErrors = response.renderErrors ?? [];
  return {
    opsApplied: ops.length - failedOps.length,
    opsFailed: failedOps.length,
    layersCreated: Object.keys(manifest?.created ?? {}).length,
    aliases: manifest?.created ?? {},
    sampledFrames: response.sampledFrames ?? 0,
    framesRendered: response.rendered ?? 0,
    renderErrors: renderErrors.length ? renderErrors : undefined,
    executionTimeMs: response.executionTimeMs,
  };
}

export function registerCompactTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // cavalry_apply_dsl — one atomic build+verify round trip
  // -------------------------------------------------------------------------
  server.tool(
    "cavalry_apply_dsl",
    "Build and verify a scene in one atomic round trip: a declarative _mg manifest plus optional preset invocations, executed via /batch-step. Returns compact DOM TSV, per-frame bounding boxes and a diff summary. No raw Cavalry JS.",
    {
      manifest: z.record(z.string(), z.unknown()).optional().describe('Declarative _mg manifest: { comp?: {width,height,fps,endFrame,bg}, layers?: [{as, kind: "shape"|"layer"|"text"|"svg"|"image", ...}], ops?: [{op: "set"|"keyframe"|"easing"|"connect"|"expression"|"delete"|"order"|"fit", ...}] }. Later ops address created layers as "$name".'),
      presets: z
        .array(
          z.object({
            id: z.string().describe("Preset id from the library (aliases accepted; discover ids with cavalry_search_presets)."),
            params: z.record(z.string(), z.unknown()).optional().describe("Preset parameters keyed by the preset's declared parameter names."),
          }).describe("One preset invocation applied before the manifest."),
        )
        .max(8)
        .optional()
        .describe("Preset invocations applied before the manifest; their tracked roots are aliased as $<presetId>_<key>. Use cavalry_search_presets to find ids."),
      script: z.string().optional().describe("Optional raw JS body executed after presets and before the manifest (escape hatch; _mg/_rb are preloaded)."),
      sampleFrames: z.array(z.number().int()).max(64).optional().describe("Frames to sample after execution (max 64); each returns world-space bounding boxes. Default [0]."),
      queryLayers: z.array(z.string()).max(200).optional().describe("Layer ids/aliases ($name) to measure. Default: all layers."),
      renderFrames: z.boolean().optional().describe("Render a PNG per sampled frame."),
      renderOutputDir: z.string().optional().describe("Directory for rendered PNGs (forward slashes)."),
      comp: z.string().optional().describe("Comp id to activate for the call (restored afterwards)."),
    },
    async args => {
      try {
        const invocations = (args.presets ?? []) as PresetInvocation[];
        const prelude = presetPrelude(invocations);
        const manifest = (args.manifest ?? null) as MgDslManifest | null;
        const scriptChunks: string[] = [];
        if (prelude.script) scriptChunks.push(prelude.script);
        if (args.script) scriptChunks.push(args.script);
        const response = await runBatchStep({
          script: scriptChunks.join("\n") || undefined,
          dslManifest: manifest ?? undefined,
          sampleFrames: args.sampleFrames && args.sampleFrames.length ? args.sampleFrames : [0],
          queryLayers: args.queryLayers,
          renderFrames: args.renderFrames,
          renderOutputDir: args.renderOutputDir,
          compId: args.comp,
        });
        if (!response.ok) {
          const detail = response.error ?? "unknown batch-step failure";
          return jsonResult({ ok: false, error: detail, ...(prelude.errors.length ? { presetErrors: prelude.errors } : {}) }, true);
        }
        return jsonResult({
          ok: true,
          presetErrors: prelude.errors.length ? prelude.errors : undefined,
          presetsApplied: prelude.applied,
          compactDomTsv: response.compactDomTsv ?? "",
          sampleFrameGeometries: response.frames ?? {},
          diffSummary: diffSummary(response),
          scriptResult: response.scriptResult,
        });
      } catch (err) {
        return textResult(`cavalry_apply_dsl failed: ${message(err)}`, true);
      }
    },
  );

  // -------------------------------------------------------------------------
  // cavalry_search_presets — bounded catalog discovery
  // -------------------------------------------------------------------------
  server.tool(
    "cavalry_search_presets",
    "Search the 120-preset procedural library by keyword, motion tag (pop/slide/stagger/count/wave/…) or easing family (spring/overshoot/linear), or resolve an exact presetId from the compact index without loading all 120 full schemas.",
    {
      query: z.string().optional().describe('Space-separated keywords; every word must match (AND). Examples: "counter", "card spring", "progress bar".'),
      category: z.string().optional().describe("Category filter: id (typography), index (1-14) or label fragment (e.g. \"fintech\")."),
      presetId: z.string().optional().describe("Exact preset id or alias to resolve lazily from the compact index without loading all 120 schemas."),
    },
    async args => {
      try {
        if (args.presetId && args.presetId.trim().length > 0) {
          const compact = lookupPresetCompact(args.presetId);
          if (!compact.ok) {
            return textResult(
              `No preset matches presetId ${JSON.stringify(args.presetId)}. ${compact.total} presets exist across ${PRESET_CATEGORIES.length} packs.`,
              true,
            );
          }
          return jsonResult({
            ok: true,
            mode: "compact_lookup",
            presetId: compact.preset.id,
            preset: compact.preset,
          });
        }
        const result = searchPresets(args.query ?? "", args.category);
        if (!result.matched) {
          return textResult(
            `No preset matches ${JSON.stringify(args.query ?? "")}${args.category ? ` in category ${args.category}` : ""}. ${result.total} presets exist across ${PRESET_CATEGORIES.length} packs; try a broader keyword or drop the category filter.`,
          );
        }
        return jsonResult(result);
      } catch (err) {
        return textResult(`cavalry_search_presets failed: ${message(err)}`, true);
      }
    },
  );

  // -------------------------------------------------------------------------
  // cavalry_inspect_compact — strict-TSV scene inspection
  // -------------------------------------------------------------------------
  server.tool(
    "cavalry_inspect_compact",
    "Inspect the live scene as strict TSV (id\\ttype\\tparent\\tname\\tx,y,w,h\\tanimAttrs\\tconnections), one line per layer — the token-compact replacement for JSON DOM dumps. Pass sampleFrames to also evaluate per-frame world-space bounding boxes.",
    {
      sampleFrames: z.array(z.number().int()).max(64).optional().describe("Frames to evaluate (max 64); adds per-frame geometry. The playhead is restored."),
      queryLayers: z.array(z.string()).max(200).optional().describe("Layer ids to inspect (max 200). Default: every layer in the active comp."),
      attrs: z.array(z.string()).max(40).optional().describe("Attribute paths to include as animAttr cells (default: animated + connected attributes only)."),
      limit: z.number().int().min(1).max(1000).optional().describe("Max layers per call (default 200)."),
      offset: z.number().int().min(0).optional().describe("Layer list offset for pagination."),
      comp: z.string().optional().describe("Comp id (default: active comp)."),
    },
    async args => {
      try {
        if (args.sampleFrames && args.sampleFrames.length) {
          const response = await runBatchStep({
            sampleFrames: args.sampleFrames,
            queryLayers: args.queryLayers,
            compId: args.comp,
          });
          if (!response.ok) return textResult(`Inspect failed: ${response.error ?? "unknown error"}`, true);
          return textResult(response.compactDomTsv ?? "");
        }
        const readback = await runReadback("state", {
          attrs: args.attrs,
          limit: args.limit,
          offset: args.offset,
          compId: args.comp,
          budgetMs: 120,
        });
        if (!readback.ok) return textResult(`Inspect failed: ${readback.error ?? "unknown error"}`, true);
        const tsv = serializeCompactTsv((readback.layers ?? []) as CompactTsvLayer[]);
        const notes: string[] = [];
        if (readback.truncated) notes.push(`truncated: ${readback.returned}/${readback.total} layers; pass offset=${readback.nextOffset} for the next slice`);
        return textResult(notes.length ? `${tsv}\n# ${notes.join("; ")}` : tsv);
      } catch (err) {
        return textResult(`cavalry_inspect_compact failed: ${message(err)}`, true);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Runtime cloned styles (refclone Stage 6) — zero-rebuild filesystem reads
  // -------------------------------------------------------------------------
  registerClonedTools(server);
}
