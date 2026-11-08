/**
 * Three compressed tools for runtime cloned styles:
 *
 *   list_cloned_styles      -> bounded metadata only (id/description/duration/slot keys)
 *   instantiate_cloned_style -> slot hydration + denormalization + one atomic
 *                               Cavalry batch that creates a NEW comp, applies
 *                               the `_mg` manifest and renders the hero frame.
 *   sync_active_comp_to_cloned_style -> reads manual rig tweaks out of the
 *                               active comp and folds them back into the
 *                               preset on disk (rig_overrides/font_size).
 *
 * No scene graph and no full preset JSON ever enters the model context.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runBatchStep, runExportCompRigOverrides, type ExportCompRigOverridesResponse } from "../bridge/stallion.js";
import { compileMgDsl } from "../runtime/mg_manifest.js";
import { rigOverridesReadbackScript } from "../runtime/rig_readback.js";
import {
  clonedPreviewDir,
  hydrateClonedStyle,
  listClonedStyles,
  normalizeClonedStyleId,
  syncClonedStyleOverrides,
} from "../presets/cloned.js";

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

/**
 * Read rig overrides from the live bridge, preferring the native
 * `export_comp_rig_overrides` kind. Bridges older than that kind ignore the
 * unknown `type` entirely and never answer, so the first sync pays one short
 * probe; the outcome is cached for the process and the batch-step fallback
 * (identical envelope) takes over. An answered failure from the native kind
 * is returned as-is — no silent reroute around a real script error.
 */
let nativeRigOverrides: boolean | null = null;

async function readRigOverrides(
  compId?: string,
  layerIds?: string[],
): Promise<{ envelope: ExportCompRigOverridesResponse; route: "handler" | "batch-step" }> {
  if (nativeRigOverrides !== false) {
    const native = await runExportCompRigOverrides(
      { compId, layerIds },
      undefined,
      nativeRigOverrides === true
        ? { timeoutMs: 30_000, httpTimeoutMs: 15_000 }
        : { timeoutMs: 2_500, httpTimeoutMs: 2_500 },
    );
    if (native.ok) {
      nativeRigOverrides = true;
      return { envelope: native, route: "handler" };
    }
    const unanswered = /No export_comp_rig_overrides result|Unparsable export_comp_rig_overrides/.test(native.error ?? "");
    if (!unanswered) return { envelope: native, route: "handler" };
    nativeRigOverrides = false;
  }
  const response = await runBatchStep(
    {
      script: rigOverridesReadbackScript({ compId: compId ?? "", layerIds: layerIds ?? [], attributes: [] }),
      sampleFrames: [],
    },
    undefined,
    { timeoutMs: 60_000, httpTimeoutMs: 30_000 },
  );
  const scriptResult = response.scriptResult as Record<string, unknown> | null;
  if (!response.ok || !scriptResult || typeof scriptResult !== "object") {
    return {
      envelope: {
        ok: false,
        kind: "export_comp_rig_overrides",
        error: response.error ?? "batch-step rig readback failed",
        code: response.code,
      },
      route: "batch-step",
    };
  }
  return { envelope: scriptResult as ExportCompRigOverridesResponse, route: "batch-step" };
}

export function registerClonedTools(server: McpServer): void {
  server.tool(
    "list_cloned_styles",
    "List reusable cloned style presets exported by refclone Stage 6. Reads the preset directory at call time (no restart/rebuild). Returns only id, description, default_duration_sec and slot_keys; the scene graph stays on disk.",
    {},
    async () => {
      try {
        return jsonResult(listClonedStyles());
      } catch (err) {
        return textResult(`list_cloned_styles failed: ${message(err)}`, true);
      }
    },
  );

  server.tool(
    "instantiate_cloned_style",
    "Generate a new Cavalry comp from a cloned style: bind slots, denormalize stored ratios to the requested duration/size and execute the rig in ONE atomic /batch-step. Returns the compId and a PNG at hero time 0.5.",
    {
      style_id: z.string().describe("Cloned style id from list_cloned_styles."),
      comp_name: z.string().optional().describe("New composition name; defaults to a unique Cloned <style> name."),
      duration_sec: z.number().positive().max(300).optional().describe("Target duration in seconds (default: preset duration)."),
      fps: z.number().int().min(1).max(120).optional().describe("Target frame rate (default: preset fps)."),
      width: z.number().int().min(16).max(8192).optional().describe("Target comp width (default: preset width). Ratios scale to it."),
      height: z.number().int().min(16).max(8192).optional().describe("Target comp height (default: preset height). Ratios scale to it."),
      slots: z.record(z.string(), z.unknown()).optional().describe("Slot values: headline, subhead, cta_text, text_N, bg_color, primary_color, accent_color, text_color, logo_svg, media_N, items[]."),
    },
    async args => {
      try {
        const styleId = normalizeClonedStyleId(args.style_id);
        const hydrated = hydrateClonedStyle({ ...args, style_id: styleId });
        const meta = hydrated.meta;
        const compName = String(args.comp_name ?? "").trim()
          || `Cloned ${styleId} ${new Date().toISOString().replace(/[:.]/g, "-")}`;
        const renderDir = clonedPreviewDir(styleId).replace(/\\/g, "/");

        // The manifest is compiled into the SAME script that creates the comp:
        // batch-step applies dslManifest before user script, so a separate
        // dslManifest field would run against the previously active composition.
        const script = [
          `var __clonedComp = api.createComp(${JSON.stringify(compName)});`,
          `if (__clonedComp == null) throw new Error("api.createComp returned no composition");`,
          `api.setActiveComp(__clonedComp);`,
          `var __clonedCompId = String(api.getActiveComp());`,
          compileMgDsl(hydrated.manifest),
          `var __clonedManifest = __result;`,
          // Rename every created node to its manifest alias so the reverse
          // sync can match exported layers back to preset layers by name.
          // Text nodes are otherwise named after their copy.
          `var __clonedCreated = (__clonedManifest && __clonedManifest.created) || {};`,
          `for (var __alias in __clonedCreated) {`,
          `  if (!Object.prototype.hasOwnProperty.call(__clonedCreated, __alias)) continue;`,
          `  try { api.rename(__clonedCreated[__alias], __alias); } catch (e) {}`,
          `}`,
          `return { compId: __clonedCompId, comp_name: ${JSON.stringify(compName)}, style_id: ${JSON.stringify(styleId)}, hero_frame: ${meta.hero_frame}, manifest: __clonedManifest };`,
        ].join("\n");

        const response = await runBatchStep({
          script,
          sampleFrames: [meta.hero_frame],
          renderFrames: true,
          renderOutputDir: renderDir,
        }, undefined, { timeoutMs: 180_000, httpTimeoutMs: 60_000 });

        const scriptResult = (response.scriptResult ?? null) as Record<string, unknown> | null;
        const manifest = (scriptResult?.manifest ?? null) as { ok?: boolean; created?: Record<string, string>; ops?: Array<Record<string, unknown>>; errors?: string[] } | null;
        if (!response.ok) {
          return jsonResult({
            status: "error",
            style_id: styleId,
            stage: "batch-step",
            error: response.error ?? "unknown batch-step failure",
            code: response.code ?? null,
            render_errors: response.renderErrors ?? [],
          }, true);
        }
        if (manifest && manifest.ok === false) {
          return jsonResult({
            status: "error",
            style_id: styleId,
            stage: "manifest",
            compId: String(scriptResult?.compId ?? response.compId ?? ""),
            errors: (manifest.errors ?? []).slice(0, 12),
            failed_ops: (manifest.ops ?? []).filter(op => op.ok !== true).length,
            rendered_frame_preview_path: response.frames?.[String(meta.hero_frame)]?.renderedPngPath ?? null,
          }, true);
        }

        const frameEntry = response.frames?.[String(meta.hero_frame)] ?? null;
        const preview = frameEntry?.renderedPngPath ?? null;
        const renderError = frameEntry?.renderError ?? null;
        return jsonResult({
          status: preview ? "ok" : "rendered_without_preview",
          compId: String(scriptResult?.compId ?? response.compId ?? ""),
          style_id: styleId,
          rendered_frame_preview_path: preview,
          hero_frame: meta.hero_frame,
          duration_sec: meta.duration_sec,
          fps: meta.fps,
          width: meta.width,
          height: meta.height,
          layers_created: Object.keys(manifest?.created ?? {}).length,
          ops_applied: (manifest?.ops ?? []).filter(op => op.ok === true).length,
          slot_warnings: meta.slot_warnings.length ? meta.slot_warnings : undefined,
          unknown_tokens: meta.unknown_tokens.length ? meta.unknown_tokens : undefined,
          render_error: renderError ?? undefined,
          render_errors: response.renderErrors?.length ? response.renderErrors : undefined,
        });
      } catch (err) {
        return jsonResult({ status: "error", style_id: args.style_id ?? null, stage: "hydration", error: message(err) }, true);
      }
    },
  );

  server.tool(
    "sync_active_comp_to_cloned_style",
    "Save manual rig tweaks from a live Cavalry comp into a cloned style preset: export spring/oscillator/stagger/colors/font sizes, re-normalize frame values, write rig_overrides, font sizes and unanimous palette defaults. Read-only on the scene; dry_run previews without writing.",
    {
      style_id: z.string().describe("Cloned style id the comp was instantiated from."),
      comp_id: z.string().optional().describe("Comp to read; defaults to the active comp."),
      layer_ids: z.array(z.string()).max(200).optional().describe("Restrict the read to these layer ids (default: all comp layers, capped at 200)."),
      dry_run: z.boolean().optional().describe("Report the diff without writing the preset."),
    },
    async args => {
      try {
        const styleId = normalizeClonedStyleId(args.style_id);
        const { envelope: exported, route } = await readRigOverrides(args.comp_id, args.layer_ids);
        if (!exported.ok) {
          return jsonResult({
            status: "error",
            style_id: styleId,
            stage: "export",
            route,
            error: exported.error ?? "export_comp_rig_overrides failed",
            code: exported.code ?? null,
          }, true);
        }
        const sync = syncClonedStyleOverrides(styleId, exported, { dryRun: args.dry_run === true });
        return jsonResult({
          status: sync.dry_run ? "dry_run" : "ok",
          style_id: styleId,
          compId: exported.compId ?? null,
          route,
          preset_path: sync.preset_path,
          updated_layers: sync.updated_layers,
          font_size_updates: sync.font_size_updates,
          palette_updates: sync.palette_updates,
          unmatched_layers: sync.unmatched_layers,
          skipped: sync.skipped.length ? sync.skipped : undefined,
          rig_overrides: sync.rig_overrides,
          note: sync.dry_run ? "dry_run: preset was not written" : undefined,
        });
      } catch (err) {
        return jsonResult({ status: "error", style_id: args.style_id ?? null, stage: "sync", error: message(err) }, true);
      }
    },
  );
}
