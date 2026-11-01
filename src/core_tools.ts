/**
 * The core tool surface: the four calls that cover most scene work — build a
 * batch of operations, verify a handful of frames, render a sequence, and ask
 * the live build what it exposes. Everything here is atomic (one Undo group)
 * and returns a bounded summary rather than a scene dump.
 *
 * `ENABLE_LEGACY_TOOLS` still adds the original granular one-attribute-at-a-time
 * tools; nothing in this file depends on them.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { compileBatch, type BatchOp } from "./batch.js";
import { EASING_LIST } from "./lib.js";
import {
  formatRenderSummary,
  runRenderFrames,
  type RenderFramesResult,
} from "./render-frames.js";
import { runVerifyFrames } from "./verify.js";
import { runProbe } from "./probe.js";
import { executeMotionScript } from "./runtime/execute.js";

const FRAME_LIST = z
  .union([z.string(), z.array(z.union([z.string(), z.number()]))])
  .describe('Frames as a list or ranges: "0-215", "0,10-20:5", [0,12,24].');

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

/** Batch frames into bounded arrays so a 216-frame render cannot flood context. */
function renderPayload(result: RenderFramesResult, manifestLimit: number) {
  const bound = <T,>(values: T[], limit: number) => ({
    items: values.slice(0, limit),
    omitted: Math.max(0, values.length - limit),
  });
  return {
    status: result.status,
    outDir: result.outDir,
    pattern: result.pattern,
    scale: result.scale,
    requested: result.requested,
    rendered: bound(result.rendered, manifestLimit),
    reused: bound(result.reused, manifestLimit),
    pending: bound(result.pending, manifestLimit),
    missing: bound(result.missing, manifestLimit),
    restoredFrame: result.restoredFrame,
    chunks: result.chunks.map(chunk => ({
      index: chunk.index,
      status: chunk.status,
      frames: chunk.frames.length,
      rendered: chunk.rendered.length,
      durationMs: chunk.durationMs,
      error: chunk.error,
    })),
    progressFile: result.progressFile,
    durationMs: result.durationMs,
    summary: formatRenderSummary(result),
    limitations: result.limitations,
  };
}

export function registerCoreTools(server: McpServer): void {
  // -------------------------------------------------------------------------
  // cavalry_batch — many operations, one round trip
  // -------------------------------------------------------------------------
  server.tool(
    "cavalry_batch",
    "Execute ordered scene operations in one atomic round trip: create, set, keyframe, easing, connect, delete, more. Name new layers with \"as\" and reference them later as \"$name\". Per-op ok/error comes back; one failure does not kill the batch.",
    {
      operations: z
        .array(z.record(z.string(), z.unknown()))
        .describe(`Ordered operations. Each bridge call costs ~1s, so build scenes here instead of one call per step.
Ops: create {layerType, name?, as?} | duplicate {layerId, as?, withInputConnections?} | set {layerId, attributes} | keyframe {layerId, frame, attributes} | keyframe {layerId, keyframes:[{frame, attributes}]} | easing {layerId, attrPath, frame, easingType, expression?} | connect {sourceLayerId, sourceAttr, targetLayerId, targetAttr, force?} | setGenerator {layerId, generatorType, attrPath?} | addDynamic {layerId, attrName, attrType} | rename {layerId, name} | order {layerId, to: forward|front|backward|back} | expression {layerId, attrPath, expression} | gradient {layerId, attrPath, colors:[hex,…]} | select {layerIds} | delete {layerIds} | timing {layerId, inFrame?, outFrame?, offset?} | setParent {layerId, parentLayerId?} | reorder {layerId, underLayerId}.
easingType is one of ${EASING_LIST}; "expression" (a Cavalry easing curve) is only accepted with Custom or None. Attribute paths are dot-notation, e.g. "position.x", "material.materialColor", "fontSize".
Example: [{"op":"create","layerType":"basicShape","name":"BG","as":"bg"},{"op":"set","layerId":"$bg","attributes":{"material.materialColor":"#101828"}},{"op":"keyframe","layerId":"$bg","keyframes":[{"frame":0,"attributes":{"position.x":0}},{"frame":30,"attributes":{"position.x":200}}]},{"op":"easing","layerId":"$bg","attrPath":"position.x","frame":30,"easingType":"Custom","expression":"t*t"}]`),
    },
    async ({ operations }) => {
      let code: string;
      try {
        code = compileBatch(operations as BatchOp[]);
      } catch (err) {
        return textResult(`Invalid batch: ${message(err)}`, true);
      }
      const outcome = await executeMotionScript(code);
      if (!outcome.ok) return textResult(`Batch failed: ${outcome.text}`, true);
      try {
        const parsed = JSON.parse(outcome.text) as {
          refs?: Record<string, string>;
          results?: Array<{ index: number; op: string; ok: boolean; error?: string }>;
        };
        const results = parsed.results ?? [];
        const failed = results.filter(r => !r.ok);
        const refLines = Object.entries(parsed.refs ?? {}).map(([key, value]) => `${key}=${value}`);
        return jsonResult({
          ok: failed.length === 0,
          executed: results.length,
          failed: failed.length,
          ...(refLines.length ? { refs: parsed.refs } : {}),
          ...(failed.length ? { errors: failed.map(f => `[${f.index}] ${f.op}: ${f.error}`) } : {}),
        });
      } catch {
        // The compiler guarantees a JSON manifest; anything else is passed back
        // verbatim so the caller sees what Cavalry actually answered.
        return textResult(outcome.text);
      }
    },
  );

  // -------------------------------------------------------------------------
  // cavalry_verify_frames — render a few frames, report collisions
  // -------------------------------------------------------------------------
  server.tool(
    "cavalry_verify_frames",
    "Render specific frames and report layout collisions, unseen layers and missing previews in one call. Use it after building a scene and before committing to a long sequence render.",
    {
      frames: FRAME_LIST,
      outDir: z.string().optional().describe("Preview directory (default ~/.cavalry-mcp/previews)."),
      comp: z.string().optional().describe("Comp id to activate for the render (restored afterwards)."),
      scale: z.number().int().min(1).max(400).optional().describe("PNG scale percentage (default 100)."),
      prefix: z.string().optional().describe("Preview file prefix (default \"frame\")."),
      includeHidden: z.boolean().optional().describe("Also inspect hidden and time-out-of-range layers."),
    },
    async args => {
      try {
        const result = await runVerifyFrames({
          frames: args.frames,
          outDir: args.outDir,
          comp: args.comp,
          scale: args.scale,
          prefix: args.prefix,
          includeHidden: args.includeHidden,
        });
        return jsonResult({
          ok: result.collisions.length === 0 && result.missing.length === 0,
          comp: result.comp,
          restoredFrame: result.restoredFrame,
          outDir: result.outDir,
          frames: result.frames,
          collisions: result.collisions,
          missing: result.missing,
          warnings: result.warnings,
        });
      } catch (err) {
        return textResult(`Frame verification failed: ${message(err)}`, true);
      }
    },
  );

  // -------------------------------------------------------------------------
  // cavalry_render_frames — chunked sequence render
  // -------------------------------------------------------------------------
  server.tool(
    "cavalry_render_frames",
    "Render a frame range to numbered PNGs in chunks sized against the result deadline, restoring the playhead afterwards. Files on disk are the progress signal; a chunk cut short reports its pending frames instead of re-sending them.",
    {
      frames: FRAME_LIST,
      outDir: z.string().optional().describe("Output directory (default ~/.cavalry-mcp/previews/frames)."),
      pattern: z.string().optional().describe('File name template with a padded token (default "frame-%06d").'),
      scale: z.number().int().min(1).max(400).optional().describe("PNG scale percentage (default 100)."),
      comp: z.string().optional().describe("Comp id to activate for the render (restored afterwards)."),
      chunkFrames: z.number().int().min(1).max(40).optional().describe("Frames per bridge call; overrides the budget estimate."),
      perFrameMs: z.number().int().min(50).max(60000).optional().describe("Measured cost of one frame, used to size chunks (default 900)."),
      timeoutMs: z.number().int().min(1000).max(1800000).optional().describe("Result deadline for a single chunk."),
      graceMs: z.number().int().min(0).max(600000).optional().describe("Extra wait for files that land after a chunk stops answering (default 20000)."),
      resume: z.boolean().optional().describe("Reuse non-empty files already on disk (default true)."),
      manifestLimit: z.number().int().min(0).max(500).optional().describe("Max entries per frame list in the result (default 50)."),
    },
    async args => {
      try {
        const result = await runRenderFrames({
          frames: args.frames,
          outDir: args.outDir,
          pattern: args.pattern,
          scale: args.scale,
          comp: args.comp,
          chunkFrames: args.chunkFrames,
          perFrameMs: args.perFrameMs,
          timeoutMs: args.timeoutMs,
          graceMs: args.graceMs,
          resume: args.resume,
        });
        const payload = renderPayload(result, args.manifestLimit ?? 50);
        return jsonResult(payload, result.status === "failed");
      } catch (err) {
        return textResult(`Sequence render failed: ${message(err)}`, true);
      }
    },
  );

  // -------------------------------------------------------------------------
  // cavalry_probe_api — what does this build actually expose?
  // -------------------------------------------------------------------------
  server.tool(
    "cavalry_probe_api",
    "Ask this running Cavalry build what it exposes: the live api function list, per-layer-type attribute names, and a capabilities report written to disk. Use it before guessing an attribute path or function name.",
    {
      layerIds: z.array(z.string()).optional().describe("Layer ids whose full attribute list to read (max 20)."),
      functions: z.array(z.string()).optional().describe("Function names to test (default: the built-in watch-list)."),
      sampleTypes: z.boolean().optional().describe("Read one representative layer per type in the active comp (default true)."),
      includeLayerTypes: z.boolean().optional().describe("Include api.getAllLayerTypes() in the report (default true)."),
      inlineSurface: z.boolean().optional().describe("Return the full function-name list instead of only the file path."),
      writeFile: z.string().optional().describe("Report path (default ~/.cavalry-mcp/cavalry-api-capabilities.json)."),
    },
    async args => {
      try {
        const result = await runProbe({
          layerIds: args.layerIds,
          functions: args.functions,
          sampleTypes: args.sampleTypes,
          includeLayerTypes: args.includeLayerTypes,
          inlineSurface: args.inlineSurface,
          writeFile: args.writeFile,
        });
        return jsonResult(result);
      } catch (err) {
        return textResult(`API probe failed: ${message(err)}`, true);
      }
    },
  );
}
