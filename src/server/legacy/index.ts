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
import { registerCoreTools } from "./core-tools.js";
import { registerSceneTools } from "./scene-tools.js";
import { registerRenderTools } from "./render-tools.js";
import { registerAssetTools } from "./asset-tools.js";
import { registerAnimationTools } from "./animation-tools.js";
import { registerCompTools } from "./comp-tools.js";

/** Register the original tool surface only when explicitly enabled. */
export function registerLegacyTools(server: McpServer): void {
  registerCoreTools(server);
  registerSceneTools(server);
  registerRenderTools(server);
  registerAssetTools(server);
  registerAnimationTools(server);
  registerCompTools(server);
}
