/** Legacy tool group extracted verbatim from index.ts; registration order is preserved by the caller. */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { jsString, sceneLayersScript } from "../../shared/lib.js";
import { runCode, textResult } from "./helpers.js";

export function registerSceneTools(server: McpServer): void {
// ---------------------------------------------------------------------------
// Tool: get_scene_layers — structured, one call
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_get_scene_layers",
  "List all layers in the current scene as structured JSON: id, type, name, visible, position, inFrame/outFrame, parent — one call instead of a get_attribute round trip per layer.",
  {},
  async () => runCode("", sceneLayersScript("api.getAllSceneLayers()")),
);

// ---------------------------------------------------------------------------
// Tool: get_selected_layers
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_get_selected_layers",
  "Get the currently selected layers in Cavalry as structured JSON (same shape as get_scene_layers).",
  {},
  async () => runCode("", sceneLayersScript("api.getSelection()")),
);

// ---------------------------------------------------------------------------
// Tool: select_layers
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_select_layers",
  "Select specific layers in Cavalry by their IDs.",
  { layerIds: z.array(z.string()).describe("Array of layer IDs to select") },
  async ({ layerIds }) => runCode("Selection set: ", `api.select(${JSON.stringify(layerIds)});`),
);

// ---------------------------------------------------------------------------
// Tool: delete_layers — verifies what was actually removed
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_delete_layers",
  "Delete layers from the Cavalry scene by their IDs. Verifies against the scene afterwards and reports how many were actually removed and which IDs were not found.",
  { layerIds: z.array(z.string()).describe("Array of layer IDs to delete") },
  async ({ layerIds }) => {
    const dels = layerIds.map((id) => `api.deleteLayer(${jsString(id)});`).join(" ");
    const code = `(function () {
var ids = ${JSON.stringify(layerIds)};
var before = api.getAllSceneLayers();
${dels}
var after = api.getAllSceneLayers();
var removed = 0;
for (var i = 0; i < ids.length; i++) { if (after.indexOf(ids[i]) === -1 && before.indexOf(ids[i]) !== -1) removed++; }
var notFound = [];
for (var j = 0; j < ids.length; j++) { if (before.indexOf(ids[j]) === -1) notFound.push(ids[j]); }
__result = { requested: ids.length, removed: removed, notFound: notFound };
})();`;
    return runCode("Layers deleted: ", code);
  },
);

// ---------------------------------------------------------------------------
// Tool: duplicate_layer — api.duplicate, no selection clobbering
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_duplicate_layer",
  "Duplicate a layer in the scene and return the new layer ID. Uses api.duplicate (keeps input connections); falls back to select+duplicateSelection, restoring your selection afterwards.",
  { layerId: z.string().describe("The layer ID to duplicate") },
  async ({ layerId }) => {
    const code = `(function () {
var d = (typeof api.duplicate === "function") ? api.duplicate(${jsString(layerId)}, true) : undefined;
if (!d) {
  var sel = api.getSelection();
  api.select([${jsString(layerId)}]);
  d = api.duplicateSelection();
  api.select(sel);
}
__result = d;
})();`;
    return runCode("Duplicated: ", code);
  },
);

// ---------------------------------------------------------------------------
// Tool: rename_layer
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_rename_layer",
  "Rename an existing layer without changing its ID, attributes or animation.",
  {
    layerId: z.string().describe("The layer ID returned by create_layer, cavalry_batch, or a scene inspection"),
    name: z.string().describe("New display name"),
  },
  async ({ layerId, name }) =>
    runCode("Renamed: ", `api.rename(${jsString(layerId)}, ${jsString(name)});`),
);

// ---------------------------------------------------------------------------
// Tool: hierarchy — reorder / parent
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_reorder_layer",
  "Move a layer in the layer stack, directly under another layer.",
  {
    layerId: z.string().describe("The layer ID to move"),
    underLayerId: z.string().describe("The layer it should sit under"),
  },
  async ({ layerId, underLayerId }) =>
    runCode("Reordered: ", `api.reorder(${jsString(layerId)}, ${jsString(underLayerId)});`),
);

server.tool(
  "cavalry_set_parent",
  "Parent a layer to another layer (or unparent it by omitting parentLayerId).",
  {
    layerId: z.string().describe("The layer ID returned by create_layer, cavalry_batch, or a scene inspection"),
    parentLayerId: z.string().optional().describe("New parent layer ID; omit or leave out to unparent"),
  },
  async ({ layerId, parentLayerId }) =>
    parentLayerId
      ? runCode("Parented: ", `api.parent(${jsString(layerId)}, ${jsString(parentLayerId)});`)
      : runCode("Unparented: ", `api.unParent(${jsString(layerId)});`),
);

// ---------------------------------------------------------------------------
// Tool: set_layer_timing — trim in/out, slide in time
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_set_layer_timing",
  "Set a layer's in/out points (trim) or slide the whole layer in time. Provide any of inFrame, outFrame, offset (frames).",
  {
    layerId: z.string().describe("The layer ID returned by create_layer, cavalry_batch, or a scene inspection"),
    inFrame: z.number().optional().describe("New in point (frame)"),
    outFrame: z.number().optional().describe("New out point (frame)"),
    offset: z.number().optional().describe("Shift the layer by this many frames (negative = earlier)"),
  },
  async ({ layerId, inFrame, outFrame, offset }) => {
    const steps: string[] = [];
    if (inFrame !== undefined) steps.push(`api.setInFrame(id, ${inFrame});`);
    if (outFrame !== undefined) steps.push(`api.setOutFrame(id, ${outFrame});`);
    if (offset !== undefined) steps.push(`api.offsetLayerTime(id, ${offset});`);
    if (steps.length === 0) return textResult("Provide at least one of inFrame, outFrame, offset.", true);
    const code = `(function () {
var id = ${jsString(layerId)};
var applied = [], failed = [];
function step(k, fn) { try { fn(); applied.push(k); } catch (e) { failed.push(k + ": " + String(e && e.message ? e.message : e)); } }
${inFrame !== undefined ? `step("inFrame", function () { api.setInFrame(id, ${inFrame}); });` : ""}
${outFrame !== undefined ? `step("outFrame", function () { api.setOutFrame(id, ${outFrame}); });` : ""}
${offset !== undefined ? `step("offset", function () { api.offsetLayerTime(id, ${offset}); });` : ""}
__result = { applied: applied, failed: failed };
})();`;
    return runCode("Timing set: ", code);
  },
);

// ---------------------------------------------------------------------------
// Tool: composition info / settings
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_get_composition_info",
  "Get information about the active composition: resolution, fps, frame range, current playhead frame.",
  {},
  async () => {
    const code = `
var comp = api.getActiveComp();
__result = {
  compId: comp,
  resolution: { x: Number(api.get(comp, "resolution.x")), y: Number(api.get(comp, "resolution.y")) },
  fps: Number(api.get(comp, "fps")),
  inFrame: Number(api.getInFrame(comp)),
  outFrame: Number(api.getOutFrame(comp)),
  currentFrame: Number(api.getFrame())
};`;
    return runCode("", code);
  },
);

server.tool(
  "cavalry_set_composition_info",
  "Change the active composition's settings: width/height (resolution), fps, inFrame/outFrame (frame range). Only provided fields are changed; the final state is read back and returned.",
  {
    width: z.number().int().positive().optional().describe("Composition width in px"),
    height: z.number().int().positive().optional().describe("Composition height in px"),
    fps: z.number().positive().optional().describe("Composition playback/frame rate in frames per second"),
    inFrame: z.number().optional().describe("First frame of the range"),
    outFrame: z.number().optional().describe("Last frame of the range"),
  },
  async ({ width, height, fps, inFrame, outFrame }) => {
    if (width === undefined && height === undefined && fps === undefined && inFrame === undefined && outFrame === undefined) {
      return textResult("Provide at least one of width, height, fps, inFrame, outFrame.", true);
    }
    const code = `(function () {
var comp = api.getActiveComp();
var applied = [], failed = [];
function step(k, fn) { try { fn(); applied.push(k); } catch (e) { failed.push(k + ": " + String(e && e.message ? e.message : e)); } }
${width !== undefined ? `step("width", function () { api.set(comp, { "resolution.x": ${width} }); });` : ""}
${height !== undefined ? `step("height", function () { api.set(comp, { "resolution.y": ${height} }); });` : ""}
${fps !== undefined ? `step("fps", function () { api.set(comp, { "fps": ${fps} }); });` : ""}
${inFrame !== undefined ? `step("inFrame", function () { api.setInFrame(comp, ${inFrame}); });` : ""}
${outFrame !== undefined ? `step("outFrame", function () { api.setOutFrame(comp, ${outFrame}); });` : ""}
__result = {
  applied: applied, failed: failed,
  now: {
    resolution: { x: Number(api.get(comp, "resolution.x")), y: Number(api.get(comp, "resolution.y")) },
    fps: Number(api.get(comp, "fps")),
    inFrame: Number(api.getInFrame(comp)),
    outFrame: Number(api.getOutFrame(comp))
  }
};
})();`;
    return runCode("Composition updated: ", code);
  },
);

// ---------------------------------------------------------------------------
// Tool: playhead
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_set_current_frame",
  "Set the playhead to a specific frame in the timeline.",
  { frame: z.number().describe("Frame number to jump to") },
  async ({ frame }) => runCode(`Frame set to ${frame}: `, `api.setFrame(${frame});`),
);

server.tool(
  "cavalry_get_current_frame",
  "Read the current playhead frame.",
  {},
  async () => runCode("Current frame: ", `__result = api.getFrame();`),
);
}
