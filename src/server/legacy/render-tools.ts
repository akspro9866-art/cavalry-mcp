/** Legacy tool group extracted verbatim from index.ts; registration order is preserved by the caller. */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getConfig } from "../../bridge/stallion.js";
import { jsString } from "../../shared/lib.js";
import { decodePng, encodePng, compositeGrid, sampleFrames } from "./filmstrip.js";
import { removeTreeSync } from "../../shared/fs-safe.js";
import { exec, runCode, textResult, waitForFile } from "./helpers.js";

export function registerRenderTools(server: McpServer): void {
// ---------------------------------------------------------------------------
// Tool: render_png — returns the image inline
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_render_png",
  "Render the current frame as a PNG file and return it inline as an image block (set returnImage:false to skip the inline preview). The PNG reflects the scene state at the time the render completes, so render in a separate call after changing the scene.",
  {
    filePath: z.string().describe("Absolute file path for the output PNG"),
    scale: z.number().optional().describe("Scale percentage (100 = 1x, 200 = 2x). Defaults to 100."),
    returnImage: z.boolean().optional().describe("Return the PNG inline as an image block (default true)"),
  },
  async ({ filePath, scale, returnImage }) => {
    const s = scale ?? 100;
    const { outcome } = await exec(`api.renderPNGFrame(${jsString(filePath)}, ${s});`);
    if (!outcome.ok) return textResult(`Render request failed: ${outcome.text}`, true);
    if (!(await waitForFile(filePath, getConfig().resultTimeoutMs))) {
      return textResult(`Render accepted but ${filePath} did not appear within ${getConfig().resultTimeoutMs / 1000}s.`, true);
    }
    const summary = `Rendered to ${filePath}`;
    if (returnImage === false) return textResult(summary);
    try {
      const data = fs.readFileSync(filePath).toString("base64");
      return {
        content: [
          { type: "text" as const, text: summary },
          { type: "image" as const, data, mimeType: "image/png" },
        ],
      };
    } catch (e) {
      return textResult(`${summary} (inline preview unavailable: ${e instanceof Error ? e.message : String(e)})`);
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: render_filmstrip — the whole timeline in one image
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_render_filmstrip",
  "Render several frames evenly sampled across the timeline and composite them into ONE contact-sheet image — judge motion in a single round trip instead of scrubbing frame by frame. Each frame costs two bridge calls, so prefer small counts (default 6). Returns the composite inline plus its temp path.",
  {
    frames: z.number().int().min(1).max(24).default(6).describe("How many frames to sample (default 6)"),
    scale: z.number().min(1).max(100).default(50).describe("Per-frame render scale % (default 50 for speed)"),
    columns: z.number().int().min(1).max(8).default(3).describe("Grid columns (default 3)"),
    returnImage: z.boolean().default(true).describe("Return the composite inline (default true)"),
  },
  async ({ frames, scale, columns, returnImage }) => {
    const rangeRes = await exec(
      `var c = api.getActiveComp(); __result = { inFrame: api.getInFrame(c), outFrame: api.getOutFrame(c) };`,
    );
    if (!rangeRes.outcome.ok) return textResult(rangeRes.outcome.text, true);
    let range: { inFrame: number; outFrame: number };
    try {
      range = JSON.parse(rangeRes.outcome.text);
    } catch {
      return textResult(`Could not read composition frame range: ${rangeRes.outcome.text}`, true);
    }
    const sampled = sampleFrames(Number(range.inFrame), Number(range.outFrame), frames);
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "cavalry-filmstrip-"));
    try {
      const rendered: Array<{ frame: number; file: string }> = [];
      for (const f of sampled) {
        const file = path.join(workdir, `f${String(f).padStart(6, "0")}.png`);
        const setFrame = await exec(`api.setFrame(${f});`);
        if (!setFrame.outcome.ok) continue;
        const render = await exec(`api.renderPNGFrame(${jsString(file)}, ${scale});`);
        if (!render.outcome.ok) continue;
        if (await waitForFile(file, Math.min(30000, getConfig().resultTimeoutMs))) {
          rendered.push({ frame: f, file });
        }
      }
      if (rendered.length === 0) {
        return textResult("No frames rendered — is the scene renderable and Stallion responding?", true);
      }
      const raster = rendered.map((r) => decodePng(fs.readFileSync(r.file)));
      const grid = compositeGrid(raster, columns);
      const outPath = path.join(os.tmpdir(), `cavalry-filmstrip-${Date.now()}.png`);
      fs.writeFileSync(outPath, encodePng(grid));
      const summary =
        `Filmstrip: ${rendered.length}/${sampled.length} frames [${rendered.map((r) => r.frame).join(", ")}] ` +
        `at ${scale}% — composite saved to ${outPath}`;
      if (!returnImage) return textResult(summary);
      const data = fs.readFileSync(outPath).toString("base64");
      return {
        content: [
          { type: "text" as const, text: summary },
          { type: "image" as const, data, mimeType: "image/png" },
        ],
      };
    } finally {
      removeTreeSync(workdir);
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: render_video — via Cavalry's render queue
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_render_video",
  "Start a BACKGROUND video render of the active composition via Cavalry's render queue (api.addRenderQueueItem + api.backgroundRender). Returns the render queue item ID and the render output path. Format/codec follow the render queue item's settings — configure defaults once in Cavalry's Render window. Optionally pass outputPath to set the item's filename (best effort). Use cavalry_get_render_queue / cavalry_cancel_render to monitor or stop.",
  {
    outputPath: z
      .string()
      .optional()
      .describe("Output file path — set on the render queue item as its filename attribute (best effort)"),
  },
  async ({ outputPath }) => {
    const code = `(function () {
var comp = api.getActiveComp();
var item = api.addRenderQueueItem(comp);
var filenameSet = null;
${outputPath ? `try { api.set(item, { "filename": ${jsString(outputPath)} }); filenameSet = true; } catch (e) { filenameSet = String(e && e.message ? e.message : e); }` : ""}
api.backgroundRender(item);
__result = { renderQueueItemId: item, comp: comp, renderPath: api.getRenderPath(), filenameSet: filenameSet };
})();`;
    return runCode("Video render started: ", code);
  },
);

server.tool(
  "cavalry_get_render_queue",
  "List Cavalry render queue items (IDs and names) — use to check what renders exist.",
  {},
  async () => {
    const code = `(function () {
var items = api.getRenderQueueItems();
var out = [];
for (var i = 0; i < items.length; i++) {
  (function (id) {
    var name = null; try { name = api.getNiceName(id); } catch (e) {}
    out.push({ id: id, name: name });
  })(items[i]);
}
__result = out;
})();`;
    return runCode("", code);
  },
);

server.tool(
  "cavalry_cancel_render",
  "Cancel any in-progress render.",
  {},
  async () => runCode("", `api.cancelRender(); __result = "cancel requested";`),
);
}
