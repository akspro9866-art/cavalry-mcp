#!/usr/bin/env node
/**
 * cavalry-mcp — MCP server that controls Cavalry animation software through
 * the Stallion bridge. Works with ZCode (https://zcode.z.ai) and any MCP
 * client; tools appear as mcp__cavalry__<tool_name>.
 *
 *   ZCode <--MCP (stdio)--> cavalry-mcp <--HTTP POST--> Stallion <---> Cavalry
 *
 * Readback: Stallion's /post only ever returns a fixed ack body (upstream
 * supports nothing else), so tool scripts write a JSON result via
 * api.writeToFile(path, json, true) and this server waits for that file
 * (matched by a per-call UUID — see stallion.ts). Tool scripts assign
 * __result to return data. Bridge calls are serialized in a queue because
 * Cavalry executes scripts on a single JS thread.
 *
 * Verified against Cavalry 2.8 (see also README):
 *   - layer fill color:      api.set(id, { "material.materialColor": "#hex" })
 *   - shape dimensions:      api.set(id, { "generator.dimensions": [w, h] })
 *   - generator swap:        api.setGenerator(id, "generator", "rectangleShape")
 *   - save to a path:        api.saveSceneAs(path)   (api.saveScene takes no args)
 *   - playhead:              api.setFrame(f) / api.getFrame()
 *   - layer timing:          api.setInFrame(id, f) / api.setOutFrame(id, f) /
 *                            api.offsetLayerTime(id, delta)
 *   - hierarchy:             api.reorder(id, underId), api.parent(id, parentId),
 *                            api.unParent(id), api.getParent(id)
 *   - rename / duplicate:    api.rename(id, name), api.duplicate(id, withInputConnections)
 *   - assets:                api.loadAsset(path, isSequence) → assetId, then
 *                            api.addAssetToComp(assetId) → layerId
 *   - introspection:         api.getAttributes(id), api.getAttributeDefinition(id, attr),
 *                            api.getAnimatedAttributes(id), api.getKeyframeTimes(id, attr)
 *   - video render:          render queue — api.addRenderQueueItem(compId),
 *                            api.backgroundRender(itemId), api.getRenderPath(),
 *                            api.getRenderQueueItems(), api.cancelRender()
 *   - Magic Easing names:    SlowIn…BounceInBounceOut, None, Custom (no
 *       "EaseInOut"/"Linear"); easing applies to the keyframe's OUTGOING segment
 *   - api.autokey pref: static api.set() on an already-animated attribute
 *       creates a keyframe at the current playhead — prefer keyframe()
 *   - keyframe surgery:      api.deleteKeyframe(id, attr, frame),
 *                            api.deleteAnimation(id, attr),
 *                            api.setKeyframeVelocity / clearKeyframeVelocity
 *                            take {attr: {frame, …}} dictionaries
 *   - z-order:               api.bringForward/bringToFront/moveBackward/
 *                            moveToBack operate on the SELECTION (no id args)
 *   - preCompose:            also selection-based; name is optional
 *   - comp layers:           api.getCompLayers(topLevel, compId) /
 *                            getCompLayersOfType(topLevel, type, compId)
 *   - gradients:             api.setGradientFromColors(id, attr, [hex…])
 *   - palettes:              api.generateHarmoniousPalette(hex, count, type)
 *   - expressions:           api.setAttributeExpression(id, attr, code)
 *   - connections readback:  api.getInConnectedAttributes(id) +
 *                            api.getInConnection(id, attr) /
 *                            api.getOutConnections(id, attr)
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runScriptWithResult, sendToCavalry, pingStallion, getConfig } from "./stallion.js";
import {
  jsString,
  parseOutcome,
  EASING_NAMES,
  EASING_LIST,
  sceneLayersScript,
  type Outcome,
} from "./lib.js";
import { compileBatch, type BatchOp } from "./batch.js";
import { compileAnimateIn, ANIMATE_PRESETS } from "./presets.js";
import { decodePng, encodePng, compositeGrid, sampleFrames } from "./filmstrip.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Register the original tool surface only when explicitly enabled. */
export function registerLegacyTools(server: McpServer): void {

/** Run a script through the bridge and parse the outcome. Never throws. */
async function exec(
  code: string,
  opts?: { timeoutMs?: number },
): Promise<{ outcome: Outcome; raw: string }> {
  try {
    const raw = await runScriptWithResult(code, undefined, opts);
    return { outcome: parseOutcome(raw), raw };
  } catch (err) {
    return {
      outcome: { ok: false, text: err instanceof Error ? err.message : String(err) },
      raw: "",
    };
  }
}

function textResult(text: string, isError = false) {
  return isError
    ? { content: [{ type: "text" as const, text }], isError: true }
    : { content: [{ type: "text" as const, text }] };
}

/** exec + wrap into an MCP result with an optional prefix. */
async function runCode(prefix: string, code: string, opts?: { timeoutMs?: number }) {
  const { outcome } = await exec(code, opts);
  return textResult(`${prefix}${outcome.text}`, !outcome.ok);
}

/** Poll until a file exists with size > 0 (Cavalry writes renders async). */
async function waitForFile(filePath: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (fs.statSync(filePath).size > 0) return true;
    } catch {
      /* not written yet */
    }
    await sleep(150);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Tool: ping — check if Cavalry is reachable
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_ping",
  "Check if Cavalry is running and the Stallion bridge is reachable. When reachable, also reports the Cavalry version.",
  {},
  async () => {
    const reachable = await pingStallion();
    if (!reachable) {
      return {
        content: [
          {
            type: "text",
            text: "Cavalry is not reachable. Make sure Cavalry is running and the Stallion script is active (Scripts > Stallion).",
          },
        ],
      };
    }
    const { outcome } = await exec(`__result = (typeof api.getCavalryVersion === "function") ? api.getCavalryVersion() : null;`, { timeoutMs: 5000 });
    const version = outcome.ok && outcome.text !== "ok" && outcome.text !== "null" ? outcome.text.replace(/^"|"$/g, "") : null;
    return {
      content: [
        {
          type: "text",
          text: version
            ? `Cavalry is reachable via Stallion. Cavalry version: ${version}.`
            : "Cavalry is reachable via Stallion.",
        },
      ],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: batch — many operations in ONE round trip
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_batch",
  `Execute a list of operations in a single round trip — building a scene this way costs one bridge call instead of one per step (each bridge call has ~1s latency). Each op runs in its own try/catch, so one failure doesn't kill the batch; per-op ok/error comes back. Give a create/duplicate op "as": "name" and reference it later as "$name" in any layerId field.
Ops: create {layerType, name?, as?} | duplicate {layerId, as?, withInputConnections?} | set {layerId, attributes} | keyframe {layerId, keyframes:[{frame, attributes}]} | easing {layerId, attrPath, frame, easingType} | connect {sourceLayerId, sourceAttr, targetLayerId, targetAttr, force?} | setGenerator {layerId, generatorType, attrPath?} | addDynamic {layerId, attrName, attrType} | rename {layerId, name} | order {layerId, to: forward|front|backward|back} | expression {layerId, attrPath, expression} | gradient {layerId, attrPath, colors:[hex,…]} | select {layerIds} | delete {layerIds} | timing {layerId, inFrame?, outFrame?, offset?} | setParent {layerId, parentLayerId?} | reorder {layerId, underLayerId}.
Example: [{"op":"create","layerType":"basicShape","name":"BG","as":"bg"},{"op":"set","layerId":"$bg","attributes":{"material.materialColor":"#101828"}},{"op":"keyframe","layerId":"$bg","keyframes":[{"frame":0,"attributes":{"position.x":0}},{"frame":30,"attributes":{"position.x":200}}]}]`,
  { operations: z.array(z.record(z.string(), z.unknown())).describe("Ordered list of operations") },
  async ({ operations }) => {
    let code: string;
    try {
      code = compileBatch(operations as BatchOp[]);
    } catch (e) {
      return textResult(`Invalid batch: ${e instanceof Error ? e.message : String(e)}`, true);
    }
    const { outcome } = await exec(code);
    if (!outcome.ok) return textResult(`Batch failed: ${outcome.text}`, true);
    let summary = outcome.text;
    try {
      const parsed = JSON.parse(outcome.text) as {
        refs: Record<string, string>;
        results: Array<{ index: number; op: string; ok: boolean; error?: string }>;
      };
      const failed = parsed.results.filter((r) => !r.ok);
      const refLines = Object.entries(parsed.refs).map(([k, v]) => `${k}=${v}`);
      summary =
        `Batch ok: ${parsed.results.length - failed.length}/${parsed.results.length} ops succeeded` +
        (refLines.length ? `\nrefs: ${refLines.join(", ")}` : "") +
        (failed.length
          ? `\nfailed:\n${failed.map((r) => `  [${r.index}] ${r.op}: ${r.error}`).join("\n")}`
          : "");
    } catch {
      /* keep raw text */
    }
    return textResult(summary);
  },
);

// ---------------------------------------------------------------------------
// Tool: create_layer
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_create_layer",
  `Create a new layer in the Cavalry scene and return its ID. Common layer types: basicShape, textShape, null, group, subMesh, linearGradient, duplicator, connectShape, noiseDeformer, stagger, spreadsheet, javaScriptUtility, javaScriptShape, imageAsset, videoAsset, soundAsset. (Note: there is no "colorPlane" type — use a basicShape with a rectangleShape generator for solid backgrounds.) For multi-layer scenes prefer cavalry_batch.`,
  {
    layerType: z.string().describe('The layer type ID, e.g. "textShape", "basicShape", "null"'),
    name: z.string().describe("Display name for the new layer"),
  },
  async ({ layerType, name }) =>
    runCode("Created layer: ", `__result = api.create(${jsString(layerType)}, ${jsString(name)});`),
);

// ---------------------------------------------------------------------------
// Tool: set_attribute
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_set_attribute",
  `Set one or more attributes on a Cavalry layer. Attributes use dot-notation paths, e.g. "position.x", "fontSize". Shape fill color is "material.materialColor"; shape size is "generator.dimensions": [w, h].`,
  {
    layerId: z.string().describe("The layer ID (e.g. from create_layer)"),
    attributes: z
      .record(z.string(), z.unknown())
      .describe('Key-value map of attribute paths to values, e.g. {"fontSize": 48, "position.x": 100}'),
  },
  async ({ layerId, attributes }) =>
    runCode(
      `Attributes set on ${layerId}: `,
      `api.set(${jsString(layerId)}, ${JSON.stringify(attributes)});`,
    ),
);

// ---------------------------------------------------------------------------
// Tool: get_attribute
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_get_attribute",
  "Read the value of an attribute from a Cavalry layer.",
  {
    layerId: z.string().describe("The layer ID"),
    attrPath: z.string().describe('The attribute path, e.g. "position.x", "fontSize"'),
  },
  async ({ layerId, attrPath }) =>
    runCode("", `__result = api.get(${jsString(layerId)}, ${jsString(attrPath)});`),
);

// ---------------------------------------------------------------------------
// Tool: connect
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_connect",
  `Connect an output attribute to an input attribute between layers. Use "id" as the outAttr to connect a layer's main output.`,
  {
    sourceLayerId: z.string().describe("Source layer ID"),
    sourceAttr: z.string().describe('Source attribute path (use "id" for the main output)'),
    targetLayerId: z.string().describe("Target layer ID"),
    targetAttr: z.string().describe("Target attribute path"),
    force: z.boolean().optional().describe("If true, overwrite any existing connection on the target attribute"),
  },
  async ({ sourceLayerId, sourceAttr, targetLayerId, targetAttr, force }) => {
    const forceArg = force ? ", true" : "";
    const code = `__result = api.connect(${jsString(sourceLayerId)}, ${jsString(sourceAttr)}, ${jsString(targetLayerId)}, ${jsString(targetAttr)}${forceArg});`;
    return runCode(`Connected ${sourceLayerId}.${sourceAttr} → ${targetLayerId}.${targetAttr}: `, code);
  },
);

// ---------------------------------------------------------------------------
// Tool: keyframe — single or multi-frame in one call
// ---------------------------------------------------------------------------
const keyframeItemSchema = z.object({
  frame: z.number().describe("Frame number"),
  attributes: z.record(z.string(), z.unknown()).describe('Attribute values at this frame, e.g. {"position.x": 0}'),
});

server.tool(
  "cavalry_keyframe",
  "Set keyframes on a layer. Either a single frame (frame + attributes) or a whole curve in one call via keyframes: [{frame, attributes}] — one bridge round trip regardless of how many keyframes. Returns the keyframe ID(s). Re-keyframing the same attribute+frame replaces the value in place (keeping its easing).",
  {
    layerId: z.string().describe("The layer ID"),
    frame: z.number().optional().describe("Frame for the single-keyframe form"),
    attributes: z.record(z.string(), z.unknown()).optional().describe("Attributes for the single-keyframe form"),
    keyframes: z.array(keyframeItemSchema).optional().describe("Multiple keyframes in one call"),
  },
  async ({ layerId, frame, attributes, keyframes }) => {
    const multi = keyframes ?? [];
    const single = frame !== undefined || attributes !== undefined;
    if (multi.length > 0 && single) {
      return textResult("Pass either frame+attributes or keyframes[], not both.", true);
    }
    if (!single && multi.length === 0) {
      return textResult("Provide either frame+attributes or a non-empty keyframes array.", true);
    }
    const list = multi.length > 0 ? multi : [{ frame: frame as number, attributes: attributes ?? {} }];
    const code = `(function () {
var kfs = ${JSON.stringify(list)};
var r = [];
for (var j = 0; j < kfs.length; j++) { r.push(api.keyframe(${jsString(layerId)}, kfs[j].frame, kfs[j].attributes)); }
__result = r.length === 1 ? r[0] : r;
})();`;
    return runCode(`Keyframes set on ${layerId} (${list.length} @ ${list.map((k) => k.frame).join(", ")}): `, code);
  },
);

// ---------------------------------------------------------------------------
// Tool: magic_easing — schema-validated easing names
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_magic_easing",
  `Apply Magic Easing to a keyframe. The easing affects the keyframe's OUTGOING segment (toward the next keyframe). Valid names: ${EASING_LIST}.`,
  {
    layerId: z.string().describe("The layer ID"),
    attrPath: z.string().describe("The attribute path"),
    frame: z.number().describe("The frame of the keyframe to ease"),
    easingType: z.enum(EASING_NAMES).describe("Easing type"),
  },
  async ({ layerId, attrPath, frame, easingType }) =>
    runCode(
      "Easing applied: ",
      `api.magicEasing(${jsString(layerId)}, ${jsString(attrPath)}, ${frame}, ${jsString(easingType)});`,
    ),
);

// ---------------------------------------------------------------------------
// Tool: get_keyframes — list animation on a layer
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_get_keyframes",
  "List keyframe frames for a layer: for one attribute (attrPath) or for every animated attribute of the layer.",
  {
    layerId: z.string().describe("The layer ID"),
    attrPath: z.string().optional().describe("Attribute path; omit to list all animated attributes"),
  },
  async ({ layerId, attrPath }) => {
    const code = attrPath
      ? `__result = { attrPath: ${jsString(attrPath)}, frames: api.getKeyframeTimes(${jsString(layerId)}, ${jsString(attrPath)}) };`
      : `(function () {
var attrs = api.getAnimatedAttributes(${jsString(layerId)});
var out = {};
for (var i = 0; i < attrs.length; i++) { (function (a) { out[a] = api.getKeyframeTimes(${jsString(layerId)}, a); })(attrs[i]); }
__result = out;
})();`;
    return runCode("", code);
  },
);

// ---------------------------------------------------------------------------
// Tool: animate_in — one-call animation presets
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_animate_in",
  `Animate a layer's entrance in one call: writes keyframes + Magic Easing relative to the layer's current position (reads position/opacity/weight inside Cavalry first). Presets: fadeIn, fadeUp, springUp (SpringOut), slideInLeft, popIn (SmallSpringOut on weight), dropBounce (BounceOut). Any attribute a layer type lacks is skipped and reported in "failed" — the rest still applies.`,
  {
    layerId: z.string().describe("The layer ID"),
    preset: z.enum(ANIMATE_PRESETS).describe("Animation preset"),
    startFrame: z.number().optional().describe("First keyframe frame (default 0)"),
    duration: z.number().optional().describe("Frames from start to end (default 30)"),
    distance: z.number().optional().describe("Travel distance in px for move presets (default 100)"),
  },
  async ({ layerId, preset, startFrame, duration, distance }) =>
    runCode("", compileAnimateIn({ layerId, preset, startFrame, duration, distance })),
);

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
  "Rename a layer.",
  {
    layerId: z.string().describe("The layer ID"),
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
    layerId: z.string().describe("The layer ID"),
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
    layerId: z.string().describe("The layer ID"),
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
    fps: z.number().positive().optional().describe("Frame rate"),
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
      fs.rmSync(workdir, { recursive: true, force: true });
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

// ---------------------------------------------------------------------------
// Tool: import_asset
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_import_asset",
  "Import a media file (image / image sequence / video / audio) into the scene: loads it as an asset and adds it to the active composition. Returns both the asset ID and the new layer ID.",
  {
    filePath: z.string().describe("Absolute path to the media file"),
    isSequence: z.boolean().optional().describe("True if filePath is an image sequence (default false)"),
  },
  async ({ filePath, isSequence }) => {
    const code = `(function () {
var asset = api.loadAsset(${jsString(filePath)}, ${isSequence ? "true" : "false"});
var layer = api.addAssetToComp(asset);
__result = { assetId: asset, layerId: layer };
})();`;
    return runCode("Imported: ", code);
  },
);

// ---------------------------------------------------------------------------
// Tool: list_attributes — attribute dictionary for a layer
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_list_attributes",
  "List every attribute path on a layer (api.getAttributes) — the dictionary that turns attribute guessing into one lookup. Set definitions:true to also fetch each attribute's definition (capped at 200 attributes).",
  {
    layerId: z.string().describe("The layer ID"),
    definitions: z.boolean().optional().describe("Include per-attribute definitions (default false)"),
  },
  async ({ layerId, definitions }) => {
    const defs = definitions
      ? `var defs = {};
var cap = Math.min(attrs.length, 200);
for (var i = 0; i < cap; i++) { (function (a) { try { defs[a] = api.getAttributeDefinition(id, a); } catch (e) { defs[a] = null; } })(attrs[i]); }
__result = { attributes: attrs, definitions: defs, truncated: attrs.length > cap };`
      : `__result = { attributes: attrs };`;
    const code = `(function () {
var id = ${jsString(layerId)};
var attrs = api.getAttributes(id);
${defs}
})();`;
    return runCode("", code);
  },
);

// ---------------------------------------------------------------------------
// Tool: get_bounding_box
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_get_bounding_box",
  "Get the bounding box of a layer: {x, y, width, height, centre:{x,y}, left, right, top, bottom}. The layer's world position = position + local centre, so to centre a layer at the composition centre set position = -centre (local space).",
  {
    layerId: z.string().describe("The layer ID"),
    worldSpace: z.boolean().optional().describe("true = world space (includes position), false = local space (default)"),
  },
  async ({ layerId, worldSpace }) =>
    runCode("", `__result = api.getBoundingBox(${jsString(layerId)}, ${worldSpace ? "true" : "false"});`),
);

// ---------------------------------------------------------------------------
// Tool: save_scene
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_save_scene",
  "Save the current Cavalry scene. With filePath this is Save As (api.saveSceneAs); without it the scene saves in place (api.saveScene, only possible for previously saved scenes).",
  { filePath: z.string().optional().describe("Absolute file path for 'Save As'") },
  async ({ filePath }) => {
    if (!filePath) {
      // Saving can reset the Stallion script context, so the result write may
      // never happen — bound the wait and say so instead of hanging for 2 min.
      const { outcome, raw } = await exec(`__result = api.saveScene();`, { timeoutMs: 15000 });
      if (outcome.ok) return textResult(`Scene saved: ${outcome.text}`);
      if (raw === "") {
        return textResult(
          "Save command sent; no confirmation within 15s. Saving can reset the Stallion script context — check Cavalry, and re-run Scripts > Stallion if tools stop responding.",
        );
      }
      return textResult(`Save failed: ${outcome.text}`, true);
    }
    // Save As runs fire-and-forget: saving resets the script context, so no
    // in-scene result capture. Success is verified by watching the file on disk.
    let prev = 0;
    try {
      prev = fs.statSync(filePath).mtimeMs;
    } catch {
      /* target does not exist yet */
    }
    await sendToCavalry(`api.saveSceneAs(${jsString(filePath)});`);
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      await sleep(200);
      try {
        const st = fs.statSync(filePath);
        if (st.mtimeMs > prev) {
          return {
            content: [{ type: "text", text: `Scene saved to ${filePath} (${st.size} bytes). Note: Save As resets the Stallion script context — re-run Scripts > Stallion before further tool calls.` }],
          };
        }
      } catch {
        /* not written yet */
      }
    }
    return {
      content: [{ type: "text", text: `Save command sent; file not observed at ${filePath} within 20s.` }],
      isError: true,
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: open_scene
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_open_scene",
  "Open a Cavalry scene file (.cv).",
  { filePath: z.string().describe("Absolute path to the .cv file") },
  async ({ filePath }) => runCode("Scene opened: ", `__result = api.openScene(${jsString(filePath)});`),
);

// ---------------------------------------------------------------------------
// Tool: add_dynamic_attribute
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_add_dynamic_attribute",
  `Add a dynamic attribute to a layer. Types: "int", "double", "bool", "string", "color", "int2d", "double2d", "position2d".`,
  {
    layerId: z.string().describe("The layer ID"),
    attrName: z.string().describe("Name for the new attribute"),
    attrType: z.string().describe('Type of attribute: "int", "double", "bool", "string", "color", "int2d", "double2d", "position2d"'),
  },
  async ({ layerId, attrName, attrType }) =>
    runCode(
      "Dynamic attribute added: ",
      `api.addDynamic(${jsString(layerId)}, ${jsString(attrName)}, ${jsString(attrType)});`,
    ),
);

// ---------------------------------------------------------------------------
// Tool: undo (feature-detected — not in the documented API surface)
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_undo",
  "Trigger Cavalry's undo. Experimental: the scripting API does not officially document undo — if this Cavalry build lacks api.undo the tool returns an error saying so.",
  {},
  async () =>
    runCode(
      "",
      `if (typeof api.undo !== "function") { throw new Error("api.undo is not available in this Cavalry version"); }
api.undo();
__result = "undo triggered";`,
    ),
);

// ---------------------------------------------------------------------------
// Tool: layer_order — z-order without needing another layer ID
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_layer_order",
  `Move layers in the layer stack by relative or absolute z-order: forward (up one), front (top), backward (down one), back (bottom). Cavalry's stacking APIs are selection-based, so this tool selects each layer, moves it, and restores your selection.`,
  {
    layerIds: z.array(z.string()).min(1).describe("Layer IDs to move (processed in order)"),
    to: z.enum(["forward", "front", "backward", "back"]).describe("Where to move the layers"),
  },
  async ({ layerIds, to }) => {
    const fn = { forward: "api.bringForward();", front: "api.bringToFront();", backward: "api.moveBackward();", back: "api.moveToBack();" }[to];
    const code = `(function () {
var ids = ${JSON.stringify(layerIds)};
var prev = api.getSelection();
var applied = [], failed = [];
function step(id) { try { api.select([id]); ${fn} applied.push(id); } catch (e) { failed.push(id + ": " + String(e && e.message ? e.message : e)); } }
for (var i = 0; i < ids.length; i++) step(ids[i]);
try { api.select(prev); } catch (e) {}
__result = { to: ${jsString(to)}, applied: applied, failed: failed };
})();`;
    return runCode("Layer order: ", code);
  },
);

// ---------------------------------------------------------------------------
// Tool: keyframe_edit — delete/modify existing animation
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_keyframe_edit",
  `Edit or remove EXISTING animation (cavalry_keyframe only creates). Actions:
- delete: remove keyframes at specific frames — frames: [0, 30]
- deleteAnimation: remove ALL keyframes on one attribute (attrPath) — or every animated attribute of the layer when attrPath is omitted
- setVelocity: per-keyframe velocity/spacing — spec: {"position.x": {frame: 30, leftSpeed, rightSpeed, leftInfluence, rightInfluence}}
- clearVelocity: reset the four speed/influence fields — spec: {"position.x": {frame: 30}}`,
  {
    action: z.enum(["delete", "deleteAnimation", "setVelocity", "clearVelocity"]),
    layerId: z.string().describe("The layer ID"),
    attrPath: z.string().optional().describe("Attribute path (required for delete/setVelocity/clearVelocity; optional for deleteAnimation)"),
    frames: z.array(z.number()).optional().describe("Frames of the keyframes to delete (action: delete)"),
    spec: z.record(z.string(), z.unknown()).optional().describe("Per-attribute keyframe dictionary (actions: setVelocity / clearVelocity)"),
  },
  async ({ action, layerId, attrPath, frames, spec }) => {
    if (action === "delete") {
      if (!attrPath) return textResult("delete requires attrPath.", true);
      if (!frames || frames.length === 0) return textResult("delete requires a non-empty frames array.", true);
      const code = `(function () {
var id = ${jsString(layerId)}, attr = ${jsString(attrPath)};
var applied = [], failed = [];
function step(f) { try { api.deleteKeyframe(id, attr, f); applied.push(f); } catch (e) { failed.push(f + ": " + String(e && e.message ? e.message : e)); } }
var fs = ${JSON.stringify(frames)};
for (var i = 0; i < fs.length; i++) step(fs[i]);
__result = { deleted: applied, failed: failed };
})();`;
      return runCode("Keyframes deleted: ", code);
    }
    if (action === "deleteAnimation") {
      const code = attrPath
        ? `api.deleteAnimation(${jsString(layerId)}, ${jsString(attrPath)}); __result = { attributes: [${jsString(attrPath)}] };`
        : `(function () {
var attrs = api.getAnimatedAttributes(${jsString(layerId)});
var applied = [], failed = [];
for (var i = 0; i < attrs.length; i++) { (function (a) { try { api.deleteAnimation(${jsString(layerId)}, a); applied.push(a); } catch (e) { failed.push(a + ": " + String(e && e.message ? e.message : e)); } })(attrs[i]); }
__result = { attributes: applied, failed: failed };
})();`;
      return runCode("Animation deleted: ", code);
    }
    // setVelocity / clearVelocity
    if (!attrPath || !spec) return textResult(`${action} requires attrPath and spec.`, true);
    const fn = action === "setVelocity" ? "api.setKeyframeVelocity" : "api.clearKeyframeVelocity";
    return runCode(
      `${action} applied: `,
      `${fn}(${jsString(layerId)}, ${JSON.stringify({ [attrPath]: spec })}); __result = ${jsString(attrPath)};`,
    );
  },
);

// ---------------------------------------------------------------------------
// Tool: get_connections — effect/dependency wiring readback
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_get_connections",
  "Read the connection graph around a layer in one call: every attribute that has an incoming connection (with its source), and every outgoing connection for every attribute plus the main output (\"id\"). Use it to see how effects/modifiers are wired before rewiring with cavalry_connect.",
  {
    layerId: z.string().describe("The layer ID"),
  },
  async ({ layerId }) => {
    const code = `(function () {
var id = ${jsString(layerId)};
function __g(fn) { try { return fn(); } catch (e) { return null; } }
var incoming = {};
var inAttrs = __g(function () { return api.getInConnectedAttributes(id); }) || [];
for (var i = 0; i < inAttrs.length; i++) { (function (a) { incoming[a] = __g(function () { return api.getInConnection(id, a); }); })(inAttrs[i]); }
var outgoing = {};
var attrs = __g(function () { return api.getAttributes(id); }) || [];
for (var j = 0; j < attrs.length; j++) { (function (a) { var o = __g(function () { return api.getOutConnections(id, a); }); if (o && o.length) outgoing[a] = o; })(attrs[j]); }
var idOut = __g(function () { return api.getOutConnections(id, "id"); });
if (idOut && idOut.length) outgoing["id"] = idOut;
__result = { layerId: id, incoming: incoming, outgoing: outgoing };
})();`;
    return runCode("", code);
  },
);

// ---------------------------------------------------------------------------
// Tool: expression — per-attribute JS expressions
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_expression",
  `Set or read a JavaScript expression on an attribute (Cavalry evaluates it every frame). action "get" returns {has, expression}; action "set" applies the code — write it exactly as in Cavalry's expression field, e.g. "value * 2" or "[sin(time), 0]".`,
  {
    action: z.enum(["set", "get"]),
    layerId: z.string().describe("The layer ID"),
    attrPath: z.string().describe("The attribute path, e.g. \"position.x\""),
    expression: z.string().optional().describe("Expression code (action: set). Use \"\" to clear."),
  },
  async ({ action, layerId, attrPath, expression }) => {
    if (action === "get") {
      return runCode(
        "",
        `__result = { attrPath: ${jsString(attrPath)}, has: api.hasAttributeExpression(${jsString(layerId)}, ${jsString(attrPath)}), expression: api.getAttributeExpression(${jsString(layerId)}, ${jsString(attrPath)}) };`,
      );
    }
    if (expression === undefined) return textResult("set requires expression.", true);
    return runCode(
      "Expression set: ",
      `api.setAttributeExpression(${jsString(layerId)}, ${jsString(attrPath)}, ${jsString(expression)}); __result = ${jsString(attrPath)};`,
    );
  },
);

// ---------------------------------------------------------------------------
// Tool: gradient — one-call gradient from hex colors
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_gradient",
  'Set a gradient attribute from a list of hex colors in one call (api.setGradientFromColors), e.g. colors ["#ffffff", "#4ffd7a", "#ff24e0"] on a linearGradient layer\'s "generator.gradient" or a gradientShader\'s "generator.gradient".',
  {
    layerId: z.string().describe("The layer ID"),
    attrPath: z.string().describe('Gradient attribute path, e.g. "generator.gradient"'),
    colors: z.array(z.string()).min(2).describe("Hex color stops, in order (at least 2)"),
  },
  async ({ layerId, attrPath, colors }) =>
    runCode(
      "Gradient set: ",
      `api.setGradientFromColors(${jsString(layerId)}, ${jsString(attrPath)}, ${JSON.stringify(colors)}); __result = ${JSON.stringify(colors)};`,
    ),
);

// ---------------------------------------------------------------------------
// Tool: generate_palette — harmonious color palettes
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_generate_palette",
  `Generate a harmonious palette of hex colors from a base color (api.generateHarmoniousPalette). Types: monochromatic, analogous, complementary, splitComplementary, triadic, square, rectangular, circular, goldenRatio (count is clamped per type, e.g. triadic caps at 6). Returns the color list — apply with set/batch material.materialColor.`,
  {
    baseColor: z.string().describe('Base color as hex, e.g. "#3366ff"'),
    count: z.number().int().min(2).max(16).describe("How many colors to generate"),
    type: z.enum(["monochromatic", "analogous", "complementary", "splitComplementary", "triadic", "square", "rectangular", "circular", "goldenRatio"]),
  },
  async ({ baseColor, count, type }) =>
    runCode("", `__result = api.generateHarmoniousPalette(${jsString(baseColor)}, ${count}, ${jsString(type)});`),
);

// ---------------------------------------------------------------------------
// Tool: compositions — comp management
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_compositions",
  `Manage compositions. Actions:
- list: every comp (id + name) and the active comp id
- create: new comp by name → returns its id (does NOT switch to it)
- setActive: make a comp active (subsequent tools operate on it)
- layers: structured layer list of a comp — compId optional (active), type optional filter (e.g. "textShape"), topLevel true = only top-of-hierarchy layers
- preCompose: move the given layers (or the current selection when layerIds is omitted) into a new comp and reference it back in → returns the comp reference layer id
- new: start a NEW EMPTY SCENE (destructive — requires confirm: true)`,
  {
    action: z.enum(["list", "create", "setActive", "layers", "preCompose", "new"]),
    name: z.string().optional().describe("Comp name (actions: create, preCompose)"),
    compId: z.string().optional().describe("Comp id (actions: setActive, layers)"),
    type: z.string().optional().describe('Filter layers by layer type, e.g. "textShape" (action: layers)'),
    topLevel: z.boolean().optional().describe("Only top-of-hierarchy layers (action: layers, default true)"),
    layerIds: z.array(z.string()).optional().describe("Layers to pre-compose (action: preCompose; default = current selection)"),
    confirm: z.boolean().optional().describe("Must be true for action: new"),
  },
  async ({ action, name, compId, type, topLevel, layerIds, confirm }) => {
    switch (action) {
      case "list":
        return runCode(
          "",
          `(function () {
var comps = api.getComps();
var out = [];
for (var i = 0; i < comps.length; i++) { (function (c) { out.push({ id: c, name: (function () { try { return api.getNiceName(c); } catch (e) { return null; } })() }); })(comps[i]); }
__result = { comps: out, activeCompId: api.getActiveComp() };
})();`,
        );
      case "create":
        if (!name) return textResult("create requires name.", true);
        return runCode("Created comp: ", `__result = api.createComp(${jsString(name)});`);
      case "setActive":
        if (!compId) return textResult("setActive requires compId.", true);
        return runCode("Active comp set: ", `api.setActiveComp(${jsString(compId)}); __result = api.getActiveComp();`);
      case "layers": {
        // getCompLayers/getCompLayersOfType read the ACTIVE comp only — when a
        // compId is given we switch to it and restore the previous comp after.
        const top = topLevel === false ? "false" : "true";
        const idsExpr = `(function () {
var want = ${compId ? jsString(compId) : "null"};
var prev = null; try { prev = api.getActiveComp(); } catch (e) {}
if (want && prev && want !== prev) { try { api.setActiveComp(want); } catch (e) {} }
var ids = [];
try { ids = ${type ? `api.getCompLayersOfType(${top}, ${jsString(type)})` : `api.getCompLayers(${top})`}; } finally { if (want && prev && want !== prev) { try { api.setActiveComp(prev); } catch (e) {} } }
return ids;
})()`;
        return runCode("", sceneLayersScript(idsExpr));
      }
      case "preCompose": {
        const selectStmt = layerIds?.length ? `api.select(${JSON.stringify(layerIds)});` : "";
        const nameArg = name ? jsString(name) : "";
        return runCode(
          "Pre-composed: ",
          `(function () {
${selectStmt}
__result = api.preCompose(${nameArg});
})();`,
        );
      }
      case "new":
        if (confirm !== true) {
          return textResult("Action \"new\" discards the current scene. Pass confirm: true to proceed.", true);
        }
        return runCode("New scene: ", `api.newScene(); __result = "new scene created";`);
      default:
        return textResult(`Unknown action ${String(action)}`, true);
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: transform — reset / freeze / centre pivot
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_transform",
  `Layer transform utilities. Actions: reset (back to defaults, clears frozen transforms), freeze (bake current transform into the shape), centrePivot (move the pivot to the layer's bounding box centre, or its centroid with doCentroid: true).`,
  {
    action: z.enum(["reset", "freeze", "centrePivot"]),
    layerId: z.string().describe("The layer ID"),
    doCentroid: z.boolean().optional().describe("Centre on the centroid instead of the bounding box (action: centrePivot, default false)"),
  },
  async ({ action, layerId, doCentroid }) => {
    const code =
      action === "centrePivot"
        ? `api.centrePivot(${jsString(layerId)}, ${doCentroid === true ? "true" : "false"}); __result = ${jsString(action)};`
        : action === "reset"
          ? `api.resetTransform(${jsString(layerId)}); __result = ${jsString(action)};`
          : `api.freezeTransform(${jsString(layerId)}); __result = ${jsString(action)};`;
    return runCode("Transform: ", code);
  },
);

// ---------------------------------------------------------------------------
// Tool: layer_types — discover every layer type (incl. effects)
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_layer_types",
  'List every user-facing layer type in this Cavalry build (api.getAllLayerTypes) as [{type, name}] — the full menu of layers, generators, deformers, modifiers and shaders available for create/batch. Set includeExperimental: true to also list experimental types.',
  {
    includeExperimental: z.boolean().optional().describe("Include experimental layer types (default false)"),
  },
  async ({ includeExperimental }) =>
    runCode(
      "",
      `__result = api.getAllLayerTypes(${includeExperimental === true ? "true" : "false"});`,
    ),
);

// ---------------------------------------------------------------------------
// Tool: playback — play/stop the timeline in Cavalry
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_playback",
  "Play or stop timeline playback in the Cavalry viewport (api.play / api.stop). Useful to let the user watch an animation after building it.",
  {
    action: z.enum(["play", "stop"]),
  },
  async ({ action }) =>
    runCode("", action === "play" ? `api.play(); __result = "playing";` : `api.stop(); __result = "stopped";`),
);

}
