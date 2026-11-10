/** Legacy tool group extracted verbatim from index.ts; registration order is preserved by the caller. */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { jsString, sceneLayersScript } from "../../shared/lib.js";
import { runCode, textResult } from "./helpers.js";

export function registerCompTools(server: McpServer): void {
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
    action: z.enum(["list", "create", "setActive", "layers", "preCompose", "new"]).describe("Composition operation to perform"),
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
    action: z.enum(["reset", "freeze", "centrePivot"]).describe("Transform utility to apply to the layer"),
    layerId: z.string().describe("The layer ID returned by create_layer, cavalry_batch, or a scene inspection"),
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
    action: z.enum(["play", "stop"]).describe("Start or stop timeline playback in the viewport"),
  },
  async ({ action }) =>
    runCode("", action === "play" ? `api.play(); __result = "playing";` : `api.stop(); __result = "stopped";`),
);
}
