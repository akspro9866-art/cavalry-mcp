/** Legacy tool group extracted verbatim from index.ts; registration order is preserved by the caller. */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs";
import { sendToCavalry } from "../../bridge/stallion.js";
import { jsString } from "../../shared/lib.js";
import { exec, runCode, textResult, sleep } from "./helpers.js";

export function registerAssetTools(server: McpServer): void {
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
    layerId: z.string().describe("The layer ID returned by create_layer, cavalry_batch, or a scene inspection"),
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
    layerId: z.string().describe("The layer ID returned by create_layer, cavalry_batch, or a scene inspection"),
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
    layerId: z.string().describe("The layer ID returned by create_layer, cavalry_batch, or a scene inspection"),
    attrName: z.string().describe("Name for the new attribute"),
    attrType: z.string().describe('Type of attribute: "int", "double", "bool", "string", "color", "int2d", "double2d", "position2d"'),
  },
  async ({ layerId, attrName, attrType }) =>
    runCode(
      "Dynamic attribute added: ",
      `api.addDynamic(${jsString(layerId)}, ${jsString(attrName)}, ${jsString(attrType)});`,
    ),
);
}
