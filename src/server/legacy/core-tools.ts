/** Legacy tool group extracted verbatim from index.ts; registration order is preserved by the caller. */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { pingStallion } from "../../bridge/stallion.js";
import { jsString, EASING_NAMES, EASING_LIST } from "../../shared/lib.js";
import { compileAnimateIn, ANIMATE_PRESETS } from "./animate-presets.js";
import { exec, runCode, textResult } from "./helpers.js";

export function registerCoreTools(server: McpServer): void {
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
    layerId: z.string().describe("The layer ID returned by create_layer, cavalry_batch, or a scene inspection"),
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
  frame: z.number().describe("Frame number at which the attribute values are keyed"),
  attributes: z.record(z.string(), z.unknown()).describe('Attribute values at this frame, e.g. {"position.x": 0}'),
});

server.tool(
  "cavalry_keyframe",
  "Set keyframes on a layer. Either a single frame (frame + attributes) or a whole curve in one call via keyframes: [{frame, attributes}] — one bridge round trip regardless of how many keyframes. Returns the keyframe ID(s). Re-keyframing the same attribute+frame replaces the value in place (keeping its easing).",
  {
    layerId: z.string().describe("The layer ID returned by create_layer, cavalry_batch, or a scene inspection"),
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
    layerId: z.string().describe("The layer ID returned by create_layer, cavalry_batch, or a scene inspection"),
    attrPath: z.string().describe("The attribute path"),
    frame: z.number().describe("The frame of the keyframe to ease"),
    easingType: z.enum(EASING_NAMES).describe("Cavalry magic-easing name applied to the keyframe outgoing segment"),
    expression: z
      .string()
      .optional()
      .describe('Custom easing curve; only valid with easingType "Custom" (or "None" to disable easing).'),
  },
  async ({ layerId, attrPath, frame, easingType, expression }) => {
    if (expression !== undefined && easingType !== "Custom" && easingType !== "None") {
      return textResult(
        `Invalid easing: expression is only valid with easingType "Custom" or "None", not "${easingType}".`,
        true,
      );
    }
    const args = `${jsString(layerId)}, ${jsString(attrPath)}, ${frame}, ${jsString(easingType)}`;
    const call = expression === undefined
      ? `api.magicEasing(${args});`
      : `api.magicEasing(${args}, ${jsString(expression)});`;
    return runCode("Easing applied: ", call);
  },
);

// ---------------------------------------------------------------------------
// Tool: get_keyframes — list animation on a layer
// ---------------------------------------------------------------------------
server.tool(
  "cavalry_get_keyframes",
  "List keyframe frames for a layer: for one attribute (attrPath) or for every animated attribute of the layer.",
  {
    layerId: z.string().describe("The layer ID returned by create_layer, cavalry_batch, or a scene inspection"),
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
    layerId: z.string().describe("The layer ID returned by create_layer, cavalry_batch, or a scene inspection"),
    preset: z.enum(ANIMATE_PRESETS).describe("Animation preset"),
    startFrame: z.number().optional().describe("First keyframe frame (default 0)"),
    duration: z.number().optional().describe("Frames from start to end (default 30)"),
    distance: z.number().optional().describe("Travel distance in px for move presets (default 100)"),
  },
  async ({ layerId, preset, startFrame, duration, distance }) =>
    runCode("", compileAnimateIn({ layerId, preset, startFrame, duration, distance })),
);
}
