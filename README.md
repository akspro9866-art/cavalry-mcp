# cavalry-mcp

Low-token Cavalry automation through Stallion. Build complete motion rigs in one atomic script, use procedural presets, or bypass MCP schemas entirely with the CLI.

```
Agent <--MCP/CLI--> cavalry-mcp <--POST /post + GET /get--> Stallion <---> Cavalry
```

## Three-tool core

Only these tools are exposed by default:

| Tool | Purpose |
|---|---|
| `cavalry_run_script` | Batched JavaScript with `_mg` helpers, structured readback, and one Undo group |
| `cavalry_inspect` | Bounded id/name/niceName/type summaries for `selection` or `roots` |
| `cavalry_run_preset` | One-shot procedural rigs with custom JSON parameters |

```js
const title = _mg.text("MOTION", 110, "#FFFFFF");
const rig = _mg.subMesh(title, 1, 8);
_mg.kf(title, "scale", [[0, 0], [30, 100]]);
return { title, ...rig };
```

Set `ENABLE_LEGACY_TOOLS=true` to restore the original granular tools. They are intentionally off by default to minimize MCP schema tokens and network round-trips.

## Zero-MCP CLI

```bash
node bin/stallion-cli.mjs -e 'return _mg.text("FAST", 96);'
node bin/stallion-cli.mjs -f ./rig.js
node bin/stallion-cli.mjs -p kinetic_text '{"text":"HELLO"}'
node bin/stallion-cli.mjs --sel
```

Install the package to expose the `stallion` command. Run `npm run build` after changing source because the CLI imports `dist/`.

## Editing and review pipeline

The CLI flags and `_mg` methods below are additive; the three-tool MCP surface is unchanged.

| Capability | How to call it |
|---|---|
| In-place restyle/retime without rebuilding layers | `_mg.patchSelected({ fill, text, fontSize, opacity, shiftKeyframes, easing, duplicator })` |
| Inline vector from a traced SVG | `_mg.svg(parent, { path })`, or `_mg.svg(parent, { d, name, pos, scale })` when `api.createEditable` exists |
| Magic-easing boundary move | `_mg.ease(id, "position.y", { inFrame, outFrame, from, to, magicEasing })`; a raw `bezier` maps to the nearest accepted curve, never `Custom` |
| Deterministic stagger | `_mg.stagger([id, ...], { attr, inFrame, outFrame, from, to, delayFrames, easing })` |
| Compact in-place drift patch | `_mg.patch({ target, attrs | delta, frame })`; `_mg.patchSelected` delegates geometry deltas here |
| Beat-aware animation | `stallion --audio-beats track.wav [--beats-out beats.json]`, then `_mg.syncToFrames(beats, ...)` |
| Multi-scene MP4 | `stallion --render-promo plan.json [--out promo.mp4] [--audio track.mp3] [--workdir dir] [--dry-run]` |
| Procedural behaviours | `_mg.modulate(id, "position", { type: "spring" \| "organicFloat" \| "staggerFalloff" \| "oscillator" \| "noise" })` |
| Dynamic connectors | `_mg.connectDynamic(sourceId, targetId, { color, width, curve })` |
| Global theme binding | `_mg.applyTheme({ colors, typography, radius })`, `_mg.applyTheme(null)` to clear |
| Frame previews + collisions | `stallion --verify-frames 0,30,60` or `0-60:10` |

Every execution still runs in one Undo group. After the group closes, the wrapper writes `~/.cavalry-mcp/last-execution-state.json` (status, error stack, created layers, selection, comp info and world-space bounding boxes); MCP returns the same snapshot as `_meta.telemetry`. `--verify-frames` renders PNGs into `~/.cavalry-mcp/previews` and warns when non-background layers overlap at the sampled frames — it restores the original playhead and active comp afterwards.

The four procedural primitives (`svg`, `ease`, `stagger`, `patch`) are the runtime contract for `refclone`'s Stage 4/5 scripts: the identical call signatures are emitted by `refclone/src/dsl/_mg.mjs`, and refclone's cross-repo contract test executes its compiled ten-layer script and a framed patch script against this prelude and the headless mock API. `_mg.ease` accepts Cavalry names or refclone aliases (`ExpoOut`, `CubicInOut`, `BackOut`, ...); "Custom" is deliberately never sent to `api.magicEasing`.

Promo rendering needs a local `ffmpeg` (pass `--ffmpeg <path>`); beat analysis also honours `FFMPEG_PATH`. A pre-analysed JSON beat file lets `--audio-beats` run without ffmpeg.

## Procedural presets

The registry ships **120 presets across 14 categories** — a complete SaaS motion-graphics library. Every preset is a self-contained rig executed as one isolated IIFE inside `api.startUndoGroup("AI Motion Batch")` / `api.endUndoGroup()` with `try/finally`. The script returns a map of role → layer ID plus `preset: "<id>"`, so you can keep animating the pieces it built.

| # | Category | Label | Presets |
|---|---|---|---|
| 1 | `typography` | Hero Typography & Messaging | 5 |
| 2 | `ui_mockups` | UI Components & Product Mockups | 5 |
| 3 | `data_viz` | Data Visualization & KPI | 5 |
| 4 | `polish_camera` | Backgrounds, Transitions & Camera | 5 |
| 5 | `ai_agents` | AI Agents, LLMs & Copilot | 10 |
| 6 | `devtools_cli` | Developer Tools, Code & Terminal | 10 |
| 7 | `collab_presence` | Multiplayer Collaboration & Presence | 10 |
| 8 | `workflows_nodes` | Workflow Automation & Node Graphs | 10 |
| 9 | `fintech_billing` | Fintech, Payments & Billing | 10 |
| 10 | `security_auth` | Security, Auth & Identity | 10 |
| 11 | `cloud_devops` | Cloud, DevOps & Infrastructure | 10 |
| 12 | `voice_audio_video` | Voice, Audio & Video | 10 |
| 13 | `onboarding_plg` | Onboarding & Product-Led Growth | 10 |
| 14 | `social_proof_cta` | Social Proof & Call-to-Action | 10 |

```bash
node bin/stallion-cli.mjs --list                  # all 120 presets
node bin/stallion-cli.mjs --list fintech_billing  # one category
node bin/stallion-cli.mjs -p payment_card_checkout '{"amount":"$99.00","accentColor":"#22D3EE"}'
```

From MCP, call `cavalry_run_preset` with `{ "preset": "payment_card_checkout", "params": { ... } }`. Presets are stored as category packs in `src/presets/packs/cat01…cat14`, composed from shared factories in `src/presets/rig_builders.ts`, and can also be driven programmatically via `compilePreset(id, params)` / `listPresets(category?)` from `src/presets/cavalry_snippets.ts` (the lightweight listing keeps the three-tool MCP schema small).

Every preset runs with default `{}` parameters. Parameters declare types `string`, `int`, `double`, `bool`, `color` (hex string) and `json` (object/array). Accepted aliases: `bento_grid` and `spring_card` → `bento_cards`, `counter_rig` → `number_counter`, `bg_grid` → `dot_matrix_bg`.

Categories 9–14 and presets 59–60 extend the original 58-preset brief (its spec stopped at preset 58). They follow the same conventions — `_rb` factories, verified Cavalry 2.8 attribute paths, floor-pinned bars, one guarded Undo group — and their layouts/parameters were designed to be consistent with the brief rather than transcribed from it.

Cavalry and `_mg` TypeScript declarations live in `types/cavalry.d.ts`; repository-specific automation rules are in `AGENTS.md` and `.cursorrules`.

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
| `STALLION_URL` | `http://127.0.0.1:8080` | Stallion base URL |
| `STALLION_TOKEN` | empty | Optional bearer token matching `stallion.json` |
| `CAVALRY_HOST` / `CAVALRY_PORT` | `127.0.0.1` / `8080` | Legacy URL configuration |
| `CAVALRY_HTTP_TIMEOUT_MS` | `5000` | Abort timeout for every HTTP request |
| `CAVALRY_RESULT_TIMEOUT_MS` | `5000` | Overall structured-result wait; increase for slow renders |
| `CAVALRY_TIMEOUT_MS` | *(legacy)* | Sets both timeouts at once |
| `CAVALRY_RESULT_PATH` | `<tmpdir>/cavalry-mcp-result-<pid>.json` | Legacy fallback result file |
| `CAVALRY_STATE_PATH` | `~/.cavalry-mcp/last-execution-state.json` | Telemetry snapshot written after every Undo group |
| `CAVALRY_PREVIEW_DIR` | `~/.cavalry-mcp/previews` | Output directory for `--verify-frames` PNGs |
| `FFMPEG_PATH` | `ffmpeg` | ffmpeg binary used for beat decoding |
| `ENABLE_LEGACY_TOOLS` | `false` | Restore the original granular MCP tools |

## Legacy tools (`ENABLE_LEGACY_TOOLS=true`)

### Scene building & data

| Tool | Notes |
|---|---|
| `cavalry_ping` | Reachability check + Cavalry version |
| `cavalry_batch` | **Many ops in one round trip** — see below |
| `cavalry_run_script` | Arbitrary JS; assign `__result` to return data |
| `cavalry_create_layer` | Returns the new layer ID (e.g. `textShape#3`) |
| `cavalry_set_attribute` | `{"material.materialColor": "#101828"}`, `{"generator.dimensions": [1920, 1080]}` |
| `cavalry_get_attribute` | Returns the value |
| `cavalry_get_scene_layers` / `cavalry_get_selected_layers` | Structured JSON: id, type, name, visible, **selected**, position, in/out, parent |
| `cavalry_list_attributes` | Every attribute path on a layer (+ optional definitions) — the dictionary that ends attribute guessing |
| `cavalry_get_connections` | Full wiring readback: incoming connections per attribute + outgoing connections per attribute and `id` — see how effects/modifiers are hooked up before rewiring |
| `cavalry_select_layers` / `cavalry_delete_layers` | Delete verifies what was actually removed |
| `cavalry_duplicate_layer` | `api.duplicate`, keeps your selection |
| `cavalry_rename_layer` | |
| `cavalry_layer_order` | Z-order without a second layer ID: forward / front / backward / back (selection-safe) |
| `cavalry_get_bounding_box` | local (default) or world space |
| `cavalry_import_asset` | Image/sequence/video/audio → asset + layer IDs |
| `cavalry_add_dynamic_attribute` | |
| `cavalry_layer_types` | Every layer type in this Cavalry build (`[{type, name}]`, incl. experimental on request) — the full menu of layers/generators/deformers/modifiers/shaders |
| `cavalry_transform` | reset / freeze / centrePivot |

### Animation

| Tool | Notes |
|---|---|
| `cavalry_keyframe` | Single keyframe **or a whole curve** (`keyframes: [{frame, attributes}]`) in one call |
| `cavalry_keyframe_edit` | Edit EXISTING animation: delete keyframes at frames, wipe an attribute's (or the whole layer's) animation, set/clear per-keyframe velocity |
| `cavalry_magic_easing` | Schema-validated enum of the 20 real easing names |
| `cavalry_get_keyframes` | Keyframe frames per attribute |
| `cavalry_animate_in` | Presets in one call: `fadeIn`, `fadeUp`, `springUp`, `slideInLeft`, `popIn`, `dropBounce` — keyframed relative to the layer's current position |
| `cavalry_expression` | Set/read a per-attribute JavaScript expression (evaluated every frame) |

### Style & color

| Tool | Notes |
|---|---|
| `cavalry_gradient` | One-call gradient from hex stops (`setGradientFromColors`) |
| `cavalry_generate_palette` | Harmonious palettes: monochromatic, analogous, complementary, triadic, goldenRatio, … |

### Composition & timing

| Tool | Notes |
|---|---|
| `cavalry_get_composition_info` | resolution, fps, frame range, current frame |
| `cavalry_set_composition_info` | width/height, fps, inFrame/outFrame |
| `cavalry_compositions` | list / create / setActive comps, list a comp's layers (optionally by type), preCompose, new scene (confirm-gated) |
| `cavalry_set_current_frame` / `cavalry_get_current_frame` | |
| `cavalry_playback` | play / stop the timeline so the user can watch |
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
  { "op": "order", "layerId": "$title", "to": "front" },
  { "op": "gradient", "layerId": "$bg", "attrPath": "generator.gradient", "colors": ["#101828", "#2d3a8c"] },
  { "op": "expression", "layerId": "$title", "attrPath": "position.x", "expression": "value * 2" },
  { "op": "timing", "layerId": "$bg", "inFrame": 0, "outFrame": 90 }
]
```

One tool call builds the whole scene (a per-op script would cost ~1 s per step in bridge latency).

## Tips

- Renders are async inside Cavalry: the PNG reflects the scene state when the render *completes*. Make scene changes and renders in separate tool calls.
- Avoid granular request loops: batch scene work into one `cavalry_run_script` or CLI execution and use `_mg`/procedural nodes instead of per-layer keyframe spam.
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

The test suite runs the real server against an in-memory MCP client and a mock Stallion (an HTTP server executing scripts in a `node:vm` sandbox with a modelled `api`), so bridge behavior — seq matching, the write-failure retry, queue serialization, timeouts — is covered without Cavalry installed. `test/library.test.ts` additionally compiles and executes all 120 presets with defaults and typed overrides against the mock bridge. CI runs build + tests on Linux and Windows.

## Credits

- [kacperchlebowicz/Cavalry-mcp](https://github.com/kacperchlebowicz/Cavalry-mcp) — the original Claude Desktop version this project rebuilt
- [scenery-io/stallion](https://github.com/scenery-io/stallion) — the VSCode/Cavalry scripting bridge this server talks to
- [Scene Group](https://cavalry.scenegroup.co) — Cavalry

## License

MIT
