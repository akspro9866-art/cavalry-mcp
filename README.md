# cavalry-mcp

MCP server that connects [ZCode](https://zcode.z.ai) (or any MCP client — Claude Desktop, Cursor, …) to [Cavalry](https://cavalry.scenegroup.co) animation software. Build whole scenes in **one round trip** with batch operations, animate with keyframes/presets/Magic Easing, preview the timeline as a **filmstrip image returned inline**, start **video renders** through Cavalry's render queue — and **read real data back**: layer IDs, attribute values, bounding boxes, composition info.

```
ZCode <--MCP (stdio)--> cavalry-mcp <--HTTP POST--> Stallion <---> Cavalry
                            ^
                            └── results come back via api.writeToFile()
```

## Why this fork is different

This is a rebuilt and heavily fixed version of [kacperchlebowicz/Cavalry-mcp](https://github.com/kacperchlebowicz/Cavalry-mcp) (written for Claude Desktop). The original had a fundamental problem: **Stallion's `/post` endpoint always responds with a fixed ack body, so no tool could ever return data** — `create_layer` lost the layer ID, every "get" tool was blind, and several API calls used names that don't exist in Cavalry.

This version fixes all of that and rebuilds the workflow around the bridge's real constraint: every script POST costs roughly a second (Stallion picks up scripts at ~1 Hz), so the server is designed to do **fewer, richer round trips**.

- **Batch operations (`cavalry_batch`)** — create/keyframe/connect/… dozens of ops in ONE call, with `$refs` so ops can use layer IDs created earlier in the same batch. Each op is individually error-isolated.
- **Two-way readback.** Tool scripts capture results and errors, write them to a JSON file via `api.writeToFile()`, and the node side matches them by a per-call UUID. Every tool returns real data.
- **Serialized bridge queue + per-process result file.** Cavalry executes scripts on one thread; calls are queued so results can never interleave, and each server instance uses its own result file — two MCP clients on one machine don't clobber each other.
- **Visual feedback loop.** `cavalry_render_png` returns the frame **inline as an image block**, and `cavalry_render_filmstrip` composites N sampled frames across the timeline into one contact sheet — judge motion in a single round trip.
- **Video output.** `cavalry_render_video` drives Cavalry's render queue in the background (`addRenderQueueItem` + `backgroundRender`), with `get_render_queue` / `cancel_render` to manage it.
- **Correct API surface**, verified against Cavalry 2.8 and the official scripting docs (several of these cost hours to discover):
  - Shape fill color is `material.materialColor`, not `fill.color`.
  - Shape size is `generator.dimensions: [w, h]`; the rectangle generator type is `rectangleShape` (there is no `colorPlane` layer type — use a basicShape).
  - Save As is `api.saveSceneAs(path)`; `api.saveScene()` takes no arguments.
  - Playhead is `api.setFrame()` / `api.getFrame()`; `api.setCurrentFrame` doesn't exist.
  - Layer timing is `api.setInFrame/setOutFrame/offsetLayerTime`; hierarchy is `api.reorder/parent/unParent`.
  - Assets: `api.loadAsset(path, isSequence)` then `api.addAssetToComp(assetId)`.
  - Introspection: `api.getAttributes(id)` lists every attribute path — no more guessing.
  - `api.getBoundingBox(id, worldSpace)` takes two arguments; world position = position + local centre.
  - Magic Easing names are `SlowIn`, `SlowOut`, `SlowInSlowOut`, `BounceIn/Out`, `SpringIn/Out`, `OvershootOut`, `None`, … — **there is no `EaseInOut` or `Linear`** (the schema rejects them), and easing applies to a keyframe's *outgoing* segment.
  - With the `autokey` preference on, a static `api.set()` on an already-animated attribute silently creates a keyframe at the playhead — prefer `keyframe()`.
- **Error transparency.** Script exceptions are captured and returned with `isError: true` instead of vanishing; connection failures name the likely cause (Stallion not running).

## Prerequisites

- [Cavalry](https://cavalry.scenegroup.co) 2.8+ with the [Stallion](https://github.com/scenery-io/stallion) script enabled: **Scripts > Stallion** (must be re-started each Cavalry session)
- Node.js >= 18.17

## Install

```bash
git clone https://github.com/akspro9866-art/cavalry-mcp.git
cd cavalry-mcp
npm install
npm run build
```

## Configure in ZCode

Add to `~/.zcode/cli/config.json`:

```json
{
  "mcp": {
    "servers": {
      "cavalry": {
        "command": "node",
        "args": ["<path-to>/cavalry-mcp/dist/index.js"]
      }
    }
  }
}
```

### Claude Desktop / Cursor

```json
{
  "mcpServers": {
    "cavalry": {
      "command": "node",
      "args": ["<path-to>/cavalry-mcp/dist/index.js"]
    }
  }
}
```

Tools appear as `mcp__cavalry__<tool_name>`.

### Environment variables (all optional)

| Variable | Default | Purpose |
|---|---|---|
| `CAVALRY_HOST` | `127.0.0.1` | Stallion host |
| `CAVALRY_PORT` | `8080` | Stallion port |
| `CAVALRY_HTTP_TIMEOUT_MS` | `10000` | Timeout for the HTTP ack |
| `CAVALRY_RESULT_TIMEOUT_MS` | `120000` | How long to wait for a script's result file (renders are slow) |
| `CAVALRY_TIMEOUT_MS` | *(legacy)* | Sets both timeouts at once |
| `CAVALRY_RESULT_PATH` | `<tmpdir>/cavalry-mcp-result-<pid>.json` | Result file (per-process by default) |

## Available tools

### Scene building & data

| Tool | Notes |
|---|---|
| `cavalry_ping` | Reachability check |
| `cavalry_batch` | **Many ops in one round trip** — see below |
| `cavalry_run_script` | Arbitrary JS; assign `__result` to return data |
| `cavalry_create_layer` | Returns the new layer ID (e.g. `textShape#3`) |
| `cavalry_set_attribute` | `{"material.materialColor": "#101828"}`, `{"generator.dimensions": [1920, 1080]}` |
| `cavalry_get_attribute` | Returns the value |
| `cavalry_get_scene_layers` / `cavalry_get_selected_layers` | Structured JSON: id, type, name, visible, position, in/out, parent |
| `cavalry_list_attributes` | Every attribute path on a layer (+ optional definitions) — the dictionary that ends attribute guessing |
| `cavalry_select_layers` / `cavalry_delete_layers` | Delete verifies what was actually removed |
| `cavalry_duplicate_layer` | `api.duplicate`, keeps your selection |
| `cavalry_rename_layer` | |
| `cavalry_get_bounding_box` | local (default) or world space |
| `cavalry_import_asset` | Image/sequence/video/audio → asset + layer IDs |
| `cavalry_add_dynamic_attribute` | |

### Animation

| Tool | Notes |
|---|---|
| `cavalry_keyframe` | Single keyframe **or a whole curve** (`keyframes: [{frame, attributes}]`) in one call |
| `cavalry_magic_easing` | Schema-validated enum of the 20 real easing names |
| `cavalry_get_keyframes` | Keyframe frames per attribute |
| `cavalry_animate_in` | Presets in one call: `fadeIn`, `fadeUp`, `springUp`, `slideInLeft`, `popIn`, `dropBounce` — keyframed relative to the layer's current position |

### Composition & timing

| Tool | Notes |
|---|---|
| `cavalry_get_composition_info` | resolution, fps, frame range, current frame |
| `cavalry_set_composition_info` | width/height, fps, inFrame/outFrame |
| `cavalry_set_current_frame` / `cavalry_get_current_frame` | |
| `cavalry_set_layer_timing` | Trim in/out points, or slide a layer by N frames |
| `cavalry_reorder_layer` / `cavalry_set_parent` | Stack order and hierarchy |

### Render & export

| Tool | Notes |
|---|---|
| `cavalry_render_png` | Renders and **returns the image inline** (set `returnImage:false` to skip) |
| `cavalry_render_filmstrip` | N frames sampled across the timeline → one contact-sheet image, returned inline |
| `cavalry_render_video` | Starts a **background render-queue video render** of the active comp |
| `cavalry_get_render_queue` / `cavalry_cancel_render` | Manage renders |
| `cavalry_save_scene` / `cavalry_open_scene` | Save As verified by watching the file on disk |
| `cavalry_undo` | Experimental — feature-detected, clear error if this Cavalry build lacks it |

### Batch example

```json
[
  { "op": "create", "layerType": "basicShape", "name": "BG", "as": "bg" },
  { "op": "set", "layerId": "$bg", "attributes": { "material.materialColor": "#101828", "generator.dimensions": [1920, 1080] } },
  { "op": "create", "layerType": "textShape", "name": "Title", "as": "title" },
  { "op": "set", "layerId": "$title", "attributes": { "fontSize": 120, "text": "HELLO" } },
  { "op": "keyframe", "layerId": "$title",
    "keyframes": [
      { "frame": 0,  "attributes": { "position.y": -200, "opacity": 0 } },
      { "frame": 30, "attributes": { "position.y": 0,    "opacity": 100 } }
    ] },
  { "op": "easing", "layerId": "$title", "attrPath": "position.y", "frame": 0, "easingType": "SpringOut" },
  { "op": "timing", "layerId": "$bg", "inFrame": 0, "outFrame": 90 }
]
```

One tool call builds the whole scene (a per-op script would cost ~1 s per step in bridge latency).

## Tips

- Renders are async inside Cavalry: the PNG reflects the scene state when the render *completes*. Make scene changes and renders in separate tool calls.
- Each bridge call costs ~1 s (Stallion picks up scripts at ~1 Hz) — prefer `cavalry_batch`, multi-frame `cavalry_keyframe`, and `cavalry_render_filmstrip` over repeated small calls.
- `api.saveSceneAs` tears down the Stallion script context — after a Save As you must re-run **Scripts > Stallion** before further tool calls.
- Layer IDs are strings like `textShape#3`, numbered per type across the scene.
- `cavalry_render_video` output format follows the render queue item's settings — configure defaults once in Cavalry's Render window; `outputPath` sets the item's filename on a best-effort basis.
- Reading the Cavalry scripting docs helps a lot: <https://cavalry.studio/docs/tech-info/scripting/api-module>

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # unit tests + bridge integration against a mock Stallion + full MCP e2e
```

The test suite runs the real server against an in-memory MCP client and a mock Stallion (an HTTP server executing scripts in a `node:vm` sandbox with a modelled `api`), so bridge behavior — seq matching, the write-failure retry, queue serialization, timeouts — is covered without Cavalry installed. CI runs build + tests on Linux and Windows.

## Credits

- [kacperchlebowicz/Cavalry-mcp](https://github.com/kacperchlebowicz/Cavalry-mcp) — the original Claude Desktop version this project rebuilt
- [scenery-io/stallion](https://github.com/scenery-io/stallion) — the VSCode/Cavalry scripting bridge this server talks to
- [Scene Group](https://cavalry.scenegroup.co) — Cavalry

## License

MIT
