# cavalry-mcp

MCP server that connects [ZCode](https://zcode.z.ai) (or any MCP client) to [Cavalry](https://cavalry.scenegroup.co) animation software. Create layers, set attributes, animate with keyframes and Magic Easing, render frames, save scenes — and **read real data back**: layer IDs, attribute values, bounding boxes, composition info.

```
ZCode <--MCP (stdio)--> cavalry-mcp <--HTTP POST--> Stallion <---> Cavalry
                            ^
                            └── results come back via api.writeToFile()
```

## Why this fork is different

This is a rebuilt and heavily fixed version of [kacperchlebowicz/Cavalry-mcp](https://github.com/kacperchlebowicz/Cavalry-mcp) (written for Claude Desktop), reconfigured for ZCode. The original had a fundamental problem: **Stallion's `/post` endpoint always responds with a fixed ack body, so no tool could ever return data** — `create_layer` lost the layer ID, every "get" tool was blind, and several API calls used names that don't exist in Cavalry.

This version fixes all of that:

- **Two-way readback.** Tool scripts capture results and errors, write them to a JSON file via `api.writeToFile()`, and the node side polls that file (matched by a per-call sequence number). Every tool returns real data.
- **Correct API surface**, verified against Cavalry 2.8 (see the notes below — several of these cost us hours to discover):
  - Shape fill color is `material.materialColor`, not `fill.color`.
  - Shape size is `generator.dimensions: [w, h]`; the rectangle generator type is `rectangleShape` (there is no `colorPlane` layer type — use a basicShape).
  - Save As is `api.saveSceneAs(path)`; `api.saveScene()` takes no arguments.
  - Playhead is `api.setFrame()`; `api.setCurrentFrame` doesn't exist.
  - `api.getBoundingBox(id, worldSpace)` takes two arguments; world position = position + local centre.
  - Magic Easing names are `SlowIn`, `SlowOut`, `SlowInSlowOut`, `BounceIn/Out`, `SpringIn/Out`, `OvershootOut`, `None`, … — **there is no `EaseInOut` or `Linear`**, and easing applies to a keyframe's *outgoing* segment.
  - With the `autokey` preference on, a static `api.set()` on an already-animated attribute silently creates a keyframe at the playhead — prefer `keyframe()`.
- **Error transparency.** Script exceptions are captured and reported to the client instead of vanishing.

## Prerequisites

- [Cavalry](https://cavalry.scenegroup.co) 2.8+ with the [Stallion](https://github.com/scenery-io/stallion) script enabled: **Scripts > Stallion** (must be re-started each Cavalry session)
- Node.js >= 18

## Install

```bash
git clone https://github.com/<owner>/cavalry-mcp.git
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

Tools appear as `mcp__cavalry__<tool_name>`.

### Environment variables (all optional)

| Variable | Default | Purpose |
|---|---|---|
| `CAVALRY_HOST` | `127.0.0.1` | Stallion host |
| `CAVALRY_PORT` | `8080` | Stallion port |
| `CAVALRY_TIMEOUT_MS` | `120000` | Per-request timeout |
| `CAVALRY_RESULT_PATH` | `<tmpdir>/cavalry-mcp-result.json` | Where tool scripts write their JSON results |

## Available tools

| Tool | Notes |
|---|---|
| `cavalry_ping` | Reachability check |
| `cavalry_run_script` | Arbitrary JS; assign `__result` to return data |
| `cavalry_create_layer` | Returns the new layer ID (e.g. `textShape#3`) |
| `cavalry_set_attribute` | `{"material.materialColor": "#101828"}`, `{"generator.dimensions": [1920, 1080]}` |
| `cavalry_get_attribute` | Returns the value |
| `cavalry_connect` | Attribute connections between layers |
| `cavalry_keyframe` | `api.keyframe(id, frame, {attr: value})`; re-keyframing the same frame replaces in place |
| `cavalry_magic_easing` | `BounceOut`, `SlowInSlowOut`, `None`, … (see list above) |
| `cavalry_get_scene_layers` / `cavalry_get_selected_layers` | `id \| type \| name` list |
| `cavalry_select_layers` / `cavalry_delete_layers` | |
| `cavalry_get_composition_info` | resolution, fps, frame range |
| `cavalry_set_current_frame` | |
| `cavalry_render_png` | Render reflects end-of-script state — render in a separate call |
| `cavalry_set_generator` | `attrPath: "generator"`, `generatorType: "rectangleShape"` |
| `cavalry_duplicate_layer` | Returns the new layer ID |
| `cavalry_get_bounding_box` | local (default) or world space |
| `cavalry_save_scene` | With path = Save As (verified by watching the file on disk) |
| `cavalry_open_scene` | |
| `cavalry_add_dynamic_attribute` | |

## Tips

- Renders are async inside Cavalry: the PNG reflects the scene state when the render *completes*. Make scene changes and renders in separate tool calls.
- `api.saveSceneAs` tears down the Stallion script context — after a Save As you must re-run **Scripts > Stallion** before further tool calls.
- Layer IDs are strings like `textShape#3`, numbered per type across the scene.
- Reading the Cavalry scripting docs helps a lot: <https://cavalry.studio/docs/tech-info/scripting/api-module>

## Build from source

```bash
npm install
npm run build
```

## Credits

- [kacperchlebowicz/Cavalry-mcp](https://github.com/kacperchlebowicz/Cavalry-mcp) — the original Claude Desktop version this project rebuilt
- [scenery-io/stallion](https://github.com/scenery-io/stallion) — the VSCode/Cavalry scripting bridge this server talks to
- [Scene Group](https://cavalry.scenegroup.co) — Cavalry

## License

MIT
