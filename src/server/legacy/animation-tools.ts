/** Legacy tool group extracted verbatim from index.ts; registration order is preserved by the caller. */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { jsString } from "../../shared/lib.js";
import { runCode, textResult } from "./helpers.js";

export function registerAnimationTools(server: McpServer): void {
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
    action: z.enum(["delete", "deleteAnimation", "setVelocity", "clearVelocity"]).describe("What to do to the keyframes of one attribute"),
    layerId: z.string().describe("The layer ID returned by create_layer, cavalry_batch, or a scene inspection"),
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
    layerId: z.string().describe("The layer ID returned by create_layer, cavalry_batch, or a scene inspection"),
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
    action: z.enum(["set", "get"]).describe("Whether to write a JavaScript expression or read the current one"),
    layerId: z.string().describe("The layer ID returned by create_layer, cavalry_batch, or a scene inspection"),
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
    layerId: z.string().describe("The layer ID returned by create_layer, cavalry_batch, or a scene inspection"),
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
    type: z.enum(["monochromatic", "analogous", "complementary", "splitComplementary", "triadic", "square", "rectangular", "circular", "goldenRatio"]).describe("Color harmony rule used to derive the palette"),
  },
  async ({ baseColor, count, type }) =>
    runCode("", `__result = api.generateHarmoniousPalette(${jsString(baseColor)}, ${count}, ${jsString(type)});`),
);
}
