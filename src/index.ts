#!/usr/bin/env node
/**
 * cavalry-mcp-zcode — MCP server for ZCode (https://zcode.z.ai) that
 * controls Cavalry animation software through the Stallion bridge.
 *
 *   ZCode <--MCP (stdio)--> cavalry-mcp-zcode <--HTTP POST--> Stallion <---> Cavalry
 *
 * Register in ZCode via ~/.zcode/cli/config.json under mcp.servers.
 * Tools appear in ZCode as mcp__cavalry__<tool_name>.
 *
 * Readback: Stallion's /post only ever returns a fixed ack body, so every tool
 * script writes a JSON result via api.writeToFile() and this server polls that
 * file (see stallion.ts runScriptWithResult). Tool scripts assign __result to
 * return data. Verified against Cavalry 2.8:
 *   - layer fill color:      api.set(id, { "material.materialColor": "#hex" })
 *   - shape dimensions:      api.set(id, { "generator.dimensions": [w, h] })
 *   - generator swap:        api.setGenerator(id, "generator", "rectangleShape")
 *   - save to a path:        api.saveSceneAs(path)   (api.saveScene takes no args)
 *   - playhead:              api.setFrame(f)          (api.setCurrentFrame: n/a)
 *   - Magic Easing names:    SlowIn, SlowOut, SlowInSlowOut, VerySlowIn/Out/
 *       VerySlowInVerySlowOut, SpringIn/Out/SpringInSpringOut, SmallSpringIn/
 *       Out/SmallSpringInSmallSpringOut, AnticipateIn, OvershootOut,
 *       AnticipateInOvershootOut, BounceIn, BounceOut, BounceInBounceOut,
 *       None, Custom   (there is no "EaseInOut"/"Linear")
 *   - easing applies to the keyframe's OUTGOING segment
 *   - api.autokey pref: static api.set() on an already-animated attribute
 *       creates a keyframe at the current playhead — prefer keyframe()
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs";
import { runScriptWithResult, sendToCavalry, pingStallion } from "./stallion.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const server = new McpServer({
  name: "cavalry-mcp",
  version: "2.0.0",
});

/** Escape a string for interpolation into a JS string literal. */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Parse the result JSON written by the wrapped script and format it. */
function formatResult(raw: string): string {
  if (!raw) {
    return "Error: no result from Cavalry. Is Cavalry running with the Stallion script active (Scripts > Stallion)?";
  }
  let out: { ok?: boolean; error?: string; result?: unknown; writeFailed?: string };
  try {
    out = JSON.parse(raw);
  } catch {
    return `Error: unparsable result: ${raw.slice(0, 500)}`;
  }
  if (out.ok === false) {
    return `Error: ${out.error ?? "unknown Cavalry script error"}`;
  }
  if (out.writeFailed) {
    return `Error: script ran but could not write its result file: ${out.writeFailed}`;
  }
  const r = out.result;
  if (r === undefined) return "ok";
  return typeof r === "string" ? r : JSON.stringify(r);
}

async function runScript(code: string): Promise<string> {
  const raw = await runScriptWithResult(code);
  return formatResult(raw);
}

// ---------------------------------------------------------------------------
// Tool: ping — check if Cavalry is reachable
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_ping",
  "Check if Cavalry is running and the Stallion bridge is reachable",
  {},
  async () => {
    const reachable = await pingStallion();
    return {
      content: [
        {
          type: "text",
          text: reachable
            ? "Cavalry is reachable via Stallion."
            : "Cavalry is not reachable. Make sure Cavalry is running and the Stallion script is active (Scripts > Stallion).",
        },
      ],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: run_script — execute arbitrary JavaScript in Cavalry
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_run_script",
  "Execute arbitrary JavaScript in Cavalry's JavaScript Editor (api/cavalry/ui namespaces). Assign __result to return data, e.g. __result = api.get(id, \"opacity\").",
  { code: z.string().describe("JavaScript code to execute in Cavalry") },
  async ({ code }) => {
    const text = await runScript(code);
    return { content: [{ type: "text", text }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: create_layer
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_create_layer",
  `Create a new layer in the Cavalry scene and return its ID. Common layer types: basicShape, textShape, null, group, subMesh, linearGradient, duplicator, connectShape, noiseDeformer, stagger, spreadsheet, javaScriptUtility, javaScriptShape, imageAsset, videoAsset, soundAsset. (Note: there is no "colorPlane" type — use a basicShape with a rectangleShape generator for solid backgrounds.)`,
  {
    layerType: z.string().describe('The layer type ID, e.g. "textShape", "basicShape", "null"'),
    name: z.string().describe("Display name for the new layer"),
  },
  async ({ layerType, name }) => {
    const code = `__result = api.create("${esc(layerType)}", "${esc(name)}");`;
    const text = await runScript(code);
    return { content: [{ type: "text", text: `Created layer: ${text}` }] };
  },
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
      .describe(
        'Key-value map of attribute paths to values, e.g. {"fontSize": 48, "position.x": 100}',
      ),
  },
  async ({ layerId, attributes }) => {
    const attrJson = JSON.stringify(attributes);
    const code = `api.set("${esc(layerId)}", ${attrJson});`;
    const text = await runScript(code);
    return { content: [{ type: "text", text: `Attributes set on ${layerId}: ${text}` }] };
  },
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
  async ({ layerId, attrPath }) => {
    const code = `__result = api.get("${esc(layerId)}", "${esc(attrPath)}");`;
    const text = await runScript(code);
    return { content: [{ type: "text", text: `${layerId}.${attrPath} = ${text}` }] };
  },
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
    const code = `__result = api.connect("${esc(sourceLayerId)}", "${esc(sourceAttr)}", "${esc(targetLayerId)}", "${esc(targetAttr)}"${forceArg});`;
    const text = await runScript(code);
    return {
      content: [{ type: "text", text: `Connected ${sourceLayerId}.${sourceAttr} → ${targetLayerId}.${targetAttr}: ${text}` }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: keyframe
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_keyframe",
  "Set a keyframe on a layer attribute at a specific frame. Returns the keyframe ID. Re-keyframing the same attribute+frame replaces the value in place (keeping its easing).",
  {
    layerId: z.string().describe("The layer ID"),
    frame: z.number().describe("The frame number"),
    attributes: z
      .record(z.string(), z.unknown())
      .describe('Key-value map of attribute paths to values at this frame, e.g. {"position.x": 0}'),
  },
  async ({ layerId, frame, attributes }) => {
    const attrJson = JSON.stringify(attributes);
    const code = `__result = api.keyframe("${esc(layerId)}", ${frame}, ${attrJson});`;
    const text = await runScript(code);
    return { content: [{ type: "text", text: `Keyframe set on ${layerId} at frame ${frame}: ${text}` }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: magic_easing
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_magic_easing",
  `Apply Magic Easing to a keyframe. Valid easing names (Cavalry 2.8): SlowIn, SlowOut, SlowInSlowOut, VerySlowIn, VerySlowOut, VerySlowInVerySlowOut, SpringIn, SpringOut, SpringInSpringOut, SmallSpringIn, SmallSpringOut, SmallSpringInSmallSpringOut, AnticipateIn, OvershootOut, AnticipateInOvershootOut, BounceIn, BounceOut, BounceInBounceOut, None, Custom. The easing affects the keyframe's OUTGOING segment (toward the next keyframe).`,
  {
    layerId: z.string().describe("The layer ID"),
    attrPath: z.string().describe("The attribute path"),
    frame: z.number().describe("The frame of the keyframe to ease"),
    easingType: z.string().describe('Easing type, e.g. "BounceOut", "SlowInSlowOut", "None"'),
  },
  async ({ layerId, attrPath, frame, easingType }) => {
    const code = `api.magicEasing("${esc(layerId)}", "${esc(attrPath)}", ${frame}, "${esc(easingType)}");`;
    const text = await runScript(code);
    return { content: [{ type: "text", text: `Easing applied: ${text}` }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: get_scene_layers
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_get_scene_layers",
  "Get a list of all layers in the current Cavalry scene with their IDs and types.",
  {},
  async () => {
    const code = `
var layers = api.getAllSceneLayers();
var info = [];
for (var i = 0; i < layers.length; i++) {
  info.push(layers[i] + " | " + api.getLayerType(layers[i]) + " | " + api.getNiceName(layers[i]));
}
__result = info.join("\\n");`;
    const text = await runScript(code);
    return { content: [{ type: "text", text }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: get_selected_layers
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_get_selected_layers",
  "Get the currently selected layers in Cavalry.",
  {},
  async () => {
    const code = `
var sel = api.getSelection();
var info = [];
for (var i = 0; i < sel.length; i++) {
  info.push(sel[i] + " | " + api.getLayerType(sel[i]) + " | " + api.getNiceName(sel[i]));
}
__result = info.join("\\n");`;
    const text = await runScript(code);
    return { content: [{ type: "text", text }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: select_layers
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_select_layers",
  "Select specific layers in Cavalry by their IDs.",
  { layerIds: z.array(z.string()).describe("Array of layer IDs to select") },
  async ({ layerIds }) => {
    const idsJson = JSON.stringify(layerIds);
    const code = `api.select(${idsJson});`;
    const text = await runScript(code);
    return { content: [{ type: "text", text: `Selection set: ${text}` }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: delete_layers
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_delete_layers",
  "Delete layers from the Cavalry scene by their IDs.",
  { layerIds: z.array(z.string()).describe("Array of layer IDs to delete") },
  async ({ layerIds }) => {
    const deletes = layerIds.map((id) => `api.deleteLayer("${esc(id)}");`).join("\n");
    const code = `${deletes}\n__result = ${layerIds.length};`;
    const text = await runScript(code);
    return { content: [{ type: "text", text: `Layers deleted (${layerIds.length}): ${text}` }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: get_composition_info
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_get_composition_info",
  "Get information about the active composition (resolution, frame range, FPS).",
  {},
  async () => {
    const code = `
var comp = api.getActiveComp();
__result = {
  compId: comp,
  resolution: { x: Number(api.get(comp, "resolution.x")), y: Number(api.get(comp, "resolution.y")) },
  fps: Number(api.get(comp, "fps")),
  inFrame: Number(api.getInFrame(comp)),
  outFrame: Number(api.getOutFrame(comp))
};`;
    const text = await runScript(code);
    return { content: [{ type: "text", text }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: set_current_frame
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_set_current_frame",
  "Set the playhead to a specific frame in the timeline.",
  { frame: z.number().describe("Frame number to jump to") },
  async ({ frame }) => {
    const code = `api.setFrame(${frame});`;
    const text = await runScript(code);
    return { content: [{ type: "text", text: `Frame set to ${frame}: ${text}` }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: render_png
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_render_png",
  "Render the current frame as a PNG file. Note: the PNG reflects the scene state at the time the render completes, so render in a separate call after changing the scene.",
  {
    filePath: z.string().describe("Absolute file path for the output PNG"),
    scale: z.number().optional().describe("Scale percentage (100 = 1x, 200 = 2x). Defaults to 100."),
  },
  async ({ filePath, scale }) => {
    const s = scale ?? 100;
    const code = `api.renderPNGFrame("${esc(filePath)}", ${s});`;
    const text = await runScript(code);
    return { content: [{ type: "text", text: `Rendered to ${filePath}: ${text}` }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: set_generator
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_set_generator",
  `Set a generator on a layer attribute. For shapes pass attrPath "generator" and a generator type such as "rectangleShape", "ellipseShape", "polygonShape", "starShape". Size a rectangle with set_attribute using {"generator.dimensions": [w, h]}.`,
  {
    layerId: z.string().describe("The layer ID"),
    attrPath: z.string().default("generator").describe('The attribute that accepts the generator, usually "generator"'),
    generatorType: z.string().describe('The generator type ID, e.g. "rectangleShape"'),
  },
  async ({ layerId, attrPath, generatorType }) => {
    const code = `api.setGenerator("${esc(layerId)}", "${esc(attrPath)}", "${esc(generatorType)}");`;
    const text = await runScript(code);
    return { content: [{ type: "text", text: `Generator set: ${text}` }] };
  },
);

// ---------------------------------------------------------------------------
// Tool: duplicate_layer
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_duplicate_layer",
  "Duplicate a layer in the scene. Returns the new layer ID.",
  { layerId: z.string().describe("The layer ID to duplicate") },
  async ({ layerId }) => {
    const code = `
api.select(["${esc(layerId)}"]);
__result = api.duplicateSelection();`;
    const text = await runScript(code);
    return { content: [{ type: "text", text: `Duplicated: ${text}` }] };
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
  async ({ layerId, worldSpace }) => {
    const ws = worldSpace ? "true" : "false";
    const code = `__result = api.getBoundingBox("${esc(layerId)}", ${ws});`;
    const text = await runScript(code);
    return { content: [{ type: "text", text }] };
  },
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
      const text = await runScript(`__result = api.saveScene();`);
      return { content: [{ type: "text", text: `Scene saved: ${text}` }] };
    }
    // Save As runs fire-and-forget: saving can reset the script context, so no
    // in-scene result capture. Success is verified by watching the file on disk.
    let prev = 0;
    try {
      prev = fs.statSync(filePath).mtimeMs;
    } catch {
      /* target does not exist yet */
    }
    await sendToCavalry(`api.saveSceneAs("${esc(filePath)}");`);
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      await sleep(200);
      try {
        const st = fs.statSync(filePath);
        if (st.mtimeMs > prev) {
          return {
            content: [{ type: "text", text: `Scene saved to ${filePath} (${st.size} bytes)` }],
          };
        }
      } catch {
        /* not written yet */
      }
    }
    return {
      content: [{ type: "text", text: `Save command sent; file not observed at ${filePath} within 20s.` }],
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
  async ({ filePath }) => {
    const code = `__result = api.openScene("${esc(filePath)}");`;
    const text = await runScript(code);
    return { content: [{ type: "text", text: `Scene opened: ${text}` }] };
  },
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
  async ({ layerId, attrName, attrType }) => {
    const code = `api.addDynamic("${esc(layerId)}", "${esc(attrName)}", "${esc(attrType)}");`;
    const text = await runScript(code);
    return { content: [{ type: "text", text: `Dynamic attribute added: ${text}` }] };
  },
);

// ---------------------------------------------------------------------------
// Start the server
// ---------------------------------------------------------------------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Failed to start cavalry-mcp server:", err);
  process.exit(1);
});
