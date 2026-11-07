# cavalry-mcp

![CI](https://github.com/akspro9866-art/cavalry-mcp/actions/workflows/ci.yml/badge.svg)

Low-token [Cavalry](https://cavalry.scenegroup.co) automation through
[Stallion](https://github.com/akspro9866-art/stallion). Build whole motion rigs in one atomic
script, call one of 120 procedural presets, or bypass MCP schemas entirely with the bundled CLI.

```
Agent / IDE  <--MCP stdio / CLI-->  cavalry-mcp  <--HTTP-->  Stallion  <--->  Cavalry 2.8
```

The server is deliberately small. Every tool is a thin, schema-checked wrapper around one
Cavalry execution, and every execution is one Undo group. The value is in what runs *inside*
that execution: the `_mg` helper DSL, the batch compiler, the preset library, and the
render/verify/readback loops that keep an agent from paying a one-second round trip per
attribute.

This repository is the middle layer of a three-part stack:

| Layer | Repository | Role |
|---|---|---|
| `refclone-cli` | [akspro9866-art/refclone](https://github.com/akspro9866-art/refclone) | evidence-gated video-to-Cavalry pipeline; optional consumer of this server |
| **`cavalry-mcp`** | **this repository** | MCP server, `_mg` runtime, presets, and the zero-MCP `stallion` CLI |
| Stallion | [akspro9866-art/stallion](https://github.com/akspro9866-art/stallion) | Cavalry extension that exposes the script host over HTTP |

---

## Contents

- [Requirements](#requirements)
- [Install](#install)
- [Connect an MCP client](#connect-an-mcp-client)
- [Core tools](#core-tools)
  - [`cavalry_run_script`](#cavalry_run_script)
  - [`cavalry_inspect`](#cavalry_inspect)
  - [`cavalry_run_preset`](#cavalry_run_preset)
  - [`cavalry_batch`](#cavalry_batch)
  - [`cavalry_verify_frames`](#cavalry_verify_frames)
  - [`cavalry_render_frames`](#cavalry_render_frames)
  - [`cavalry_probe_api`](#cavalry_probe_api)
  - [`cavalry_doctor`](#cavalry_doctor)
- [The `_mg` helper DSL](#the-_mg-helper-dsl)
- [Procedural presets](#procedural-presets)
- [Zero-MCP CLI](#zero-mcp-cli)
- [Execution state and telemetry](#execution-state-and-telemetry)
- [Environment variables](#environment-variables)
- [Legacy tools](#legacy-tools-enable_legacy_toolstrue)
- [Tips and known behaviour](#tips-and-known-behaviour)
- [Development](#development)
- [Repository layout](#repository-layout)
- [Credits](#credits)
- [License](#license)

---

## Requirements

| Requirement | Why |
|---|---|
| **Cavalry 2.8.x** | the build the preset library and attribute paths are verified against. `cavalry_doctor` compares against `2.8` by default; Stallion itself declares support from **2.4.0**. |
| **Stallion** from [akspro9866-art/stallion](https://github.com/akspro9866-art/stallion) | the HTTP bridge this server talks to. Enable it in Cavalry with **Scripts → Stallion**; it must be re-run after every Cavalry start and after a Save As. |
| **Node.js >= 18.17** | runs the MCP server and the CLI. |
| `ffmpeg` / `ffprobe` *(optional)* | promo encoding (`--render-promo`) and audio-beat analysis (`--audio-beats`) use ffmpeg; `cavalry_doctor` uses ffprobe to check the pair. PNG sequence renders and frame previews are native and need neither. |
| An MCP-capable client | Qoder, Claude Code/Desktop, Cursor, ZCode, Antigravity, Codex, or any client that can spawn a stdio server. |

Cavalry is proprietary software and is not part of this repository. Stallion is a separate MIT
project; this server verifies the bridge's native result channel and falls back to the legacy
result file when an older build is listening.

## Install

```bash
git clone https://github.com/akspro9866-art/cavalry-mcp.git
cd cavalry-mcp
npm ci
npm run build
npm test
```

`npm run build` runs `tsc` and then `scripts/build-preset-manifest.mjs`, which writes
`dist/presets/preset_manifest.json`. The build fails if that manifest exceeds its 1500-token
budget, because it is meant to be readable by an agent.

The package declares two binaries:

| Binary | Entry point | Purpose |
|---|---|---|
| `cavalry-mcp` | `dist/index.js` | the stdio MCP server |
| `stallion` | `bin/stallion-cli.mjs` | the zero-MCP CLI (imports `dist/`, so build first) |

## Connect an MCP client

### Z.ai ZCode

`%USERPROFILE%\.zcode\cli\config.json` (or `<project>\.zcode\config.json`) nests servers under
`mcp.servers`:

```json
{
  "mcp": {
    "servers": {
      "cavalry": {
        "command": "node",
        "args": ["C:/Users/<you>/tools/cavalry-mcp/dist/index.js"]
      }
    }
  }
}
```

### Claude Desktop / Claude Code / Cursor

```json
{
  "mcpServers": {
    "cavalry": {
      "command": "node",
      "args": ["C:/Users/<you>/tools/cavalry-mcp/dist/index.js"]
    }
  }
}
```

Tools appear to the client as `mcp__cavalry__<tool_name>`. The server writes nothing to stdout
except the MCP protocol stream; diagnostics go to stderr.

## Core tools

Eight tools are exposed by default. They are intentionally few: every additional schema is
context the model pays for on every turn, and every additional round trip costs about a second
of bridge latency.

| Tool | Purpose |
|---|---|
| `cavalry_run_script` | batched JavaScript with `_mg` helpers, one Undo group, JSON readback |
| `cavalry_inspect` | bounded `id`/`name`/`niceName`/`type` summaries, optionally sampled per frame |
| `cavalry_run_preset` | build a parameterized procedural rig in one execution |
| `cavalry_batch` | compile many scene operations into one atomic round trip |
| `cavalry_verify_frames` | render a few frames; report collisions, unseen layers, missing previews |
| `cavalry_render_frames` | render a whole range in deadline-sized, resumable chunks |
| `cavalry_probe_api` | ask the live build which functions, types and attributes actually exist |
| `cavalry_doctor` | one-shot diagnosis of bridge, runtime, binaries and workspace |

Set `ENABLE_LEGACY_TOOLS=true` to add the original 44 granular tools described
[below](#legacy-tools-enable_legacy_toolstrue).

### `cavalry_run_script`

The workhorse. The `code` string is wrapped in one isolated scope and one
`api.startUndoGroup("AI Motion Batch")` / `api.endUndoGroup()` pair with `try/finally`; the
`_mg` helpers are injected into that scope. Use `return` to send a JSON-serialisable value back:

```js
const title = _mg.text("MOTION", 110, "#FFFFFF");
const rig = _mg.subMesh(title, 1, 8);
_mg.kf(title, "scale", [[0, 0], [30, 100]]);
_mg.ease(title, "opacity", { inFrame: 0, outFrame: 24, from: 0, to: 100 });
return { title, ...rig };
```

The result is the JSON text of the returned value. A thrown error is returned as an MCP error
with the stack, and the applied edits remain — Cavalry has no transactional rollback. The
response also carries the telemetry snapshot in `_meta.telemetry` when one was captured
(`status`, `errorStack`, `createdLayerIds`, `activeSelection`, `compInfo`, world-space
`boundingBoxes`, `durationMs`). The same snapshot is written to disk, outside the Undo group, so
a failed script still leaves usable spatial evidence behind.

Rules that matter:

- One script is one Undo step. Do not try to make half of it undoable separately.
- Prefer returning `{ id, ... }` maps over printing; the text payload is what the model reads.
- Renders are asynchronous inside Cavalry. Change the scene and render in separate calls.
- A script that overruns the result deadline may still be running. The deadline stops the
  *wait*, not the bridge.

### `cavalry_inspect`

Returns a compact summary of the current selection or the active composition's roots. It is the
cheap way to learn ids before a patch, without dumping the scene.

| Parameter | Default | Meaning |
|---|---|---|
| `mode` | `selection` | `selection` or `roots` (the active comp's top-level layers) |
| `sampleFrames` | — | up to 16 integer frames; adds world-space bbox, transform, opacity and in/out connections per sampled layer, then restores the playhead |
| `sampleIds` | — | up to 50 layer ids to sample; defaults to whatever `mode` selected |

The per-frame sample is evaluated telemetry, not a keyframe listing. It tells you where a layer
*will be* at a frame, which is what a collision check or a layout correction needs.

### `cavalry_run_preset`

```json
{
  "name": "payment_card_checkout",
  "params": { "amount": "$99.00", "accentColor": "#22D3EE" }
}
```

`name` is constrained to the 120 shipped preset ids. `params` is optional; each preset runs
with its declared defaults when it is omitted. Parameter keys are checked against that preset's
declared parameters — an unknown key is reported instead of silently ignored.

This is the only preset entry point needed from MCP. The CLI can list presets and print their
rig contract without a model in the loop; see [Procedural presets](#procedural-presets).

### `cavalry_batch`

Many ordered operations, one atomic round trip. Each operation returns its own `ok`/`error`;
one failure does not abort the batch, and the result reports `executed`, `failed`, `refs` and
`errors`.

Name a new layer with `"as": "bg"` and reference it later as `"$bg"`. Both forms resolve inside
the same execution.

| Op | Fields |
|---|---|
| `create` | `layerType`, `name?`, `as?` |
| `duplicate` | `layerId`, `as?`, `withInputConnections?` |
| `set` | `layerId`, `attributes` |
| `keyframe` | `layerId`, `frame`, `attributes` — **or** `layerId`, `keyframes: [{ frame, attributes }]` |
| `easing` | `layerId`, `attrPath`, `frame`, `easingType`, `expression?` |
| `connect` | `sourceLayerId`, `sourceAttr`, `targetLayerId`, `targetAttr`, `force?` |
| `setGenerator` | `layerId`, `generatorType`, `attrPath?` |
| `addDynamic` | `layerId`, `attrName`, `attrType` |
| `rename` | `layerId`, `name` |
| `order` | `layerId`, `to`: `forward` \| `front` \| `backward` \| `back` |
| `expression` | `layerId`, `attrPath`, `expression` |
| `gradient` | `layerId`, `attrPath`, `colors: [hex, …]` |
| `select` | `layerIds` |
| `delete` | `layerIds` |
| `timing` | `layerId`, `inFrame?`, `outFrame?`, `offset?` |
| `setParent` | `layerId`, `parentLayerId?` |
| `reorder` | `layerId`, `underLayerId` |

`easingType` is one of the 20 names Cavalry 2.8 accepts: `SlowIn`, `SlowOut`,
`SlowInSlowOut`, `VerySlowIn`, `VerySlowOut`, `VerySlowInVerySlowOut`, `SpringIn`,
`SpringOut`, `SpringInSpringOut`, `SmallSpringIn`, `SmallSpringOut`,
`SmallSpringInSmallSpringOut`, `AnticipateIn`, `OvershootOut`, `AnticipateInOvershootOut`,
`BounceIn`, `BounceOut`, `BounceInBounceOut`, `None`, `Custom`. An `expression` is accepted only
with `Custom` or `None`. There is no `Linear` or `EaseInOut` name in this build.

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
  { "op": "easing", "layerId": "$title", "attrPath": "opacity", "frame": 0, "easingType": "Custom", "expression": "1 - (1-t)*(1-t)*0.4" },
  { "op": "order", "layerId": "$title", "to": "front" },
  { "op": "gradient", "layerId": "$bg", "attrPath": "generator.gradient", "colors": ["#101828", "#2d3a8c"] },
  { "op": "expression", "layerId": "$title", "attrPath": "position.x", "expression": "value * 2" },
  { "op": "timing", "layerId": "$bg", "inFrame": 0, "outFrame": 90 }
]
```

One call builds the whole scene. The same work as separate tools would cost roughly a second
per operation in bridge latency.

### `cavalry_verify_frames`

Renders a small set of frames and answers the questions a layout pass actually has: did the PNG
arrive, did non-background layers overlap, and did anything requested stay invisible?

| Parameter | Default | Meaning |
|---|---|---|
| `frames` | required | `"0-215"`, `"0,10-20:5"`, or `[0, 12, 24]` |
| `outDir` | `~/.cavalry-mcp/previews` | preview directory |
| `comp` | active comp | comp id to activate, restored afterwards |
| `scale` | `100` | PNG scale percentage (1–400) |
| `prefix` | `frame` | preview file prefix |
| `includeHidden` | `false` | also inspect hidden and out-of-range layers |

It restores the original playhead and active composition, returns a warning list, and marks
missing previews. Treat a collision as a question, not a verdict — overlapping title cards and
intentional layering are real.

### `cavalry_render_frames`

`api.renderPNGFrame` renders whatever frame the playhead is on, and a Stallion request that
overruns its result deadline does **not** stop running. The frame-by-frame route therefore pays
about a second of bridge latency per frame, and the "send 36 frames at once" route loses the
whole result when the deadline expires. This tool sits between the two:

- chunk size is derived from a per-frame cost estimate against the deadline:
  `chunkFrames = floor((timeoutMs - overheadMs) / perFrameMs)`, clamped to 1–40. Both the result
  deadline and the HTTP deadline are raised per call instead of relying on
  `CAVALRY_RESULT_TIMEOUT_MS`;
- each chunk is one atomic script that restores the playhead and active comp afterwards;
- the files on disk are the progress signal. After an unanswered chunk it waits `graceMs` for
  late files, counts what arrived, and stops rather than re-sending work the bridge may still be
  doing;
- `render-progress.json` in the output directory records
  `cavalry-mcp/render-progress@1` — status, budget, completed and pending frames — and
  `resume` (default on) reuses non-empty frames, so a long render is continued by calling the
  same tool again.

| Parameter | Default | Meaning |
|---|---|---|
| `frames` | required | ranges, lists, or an array |
| `outDir` | `~/.cavalry-mcp/previews/frames` | output directory |
| `pattern` | `frame-%06d` | file name template with one padded token |
| `scale` | `100` | PNG scale percentage (1–400) |
| `comp` | active comp | comp to activate, restored afterwards |
| `chunkFrames` | auto | frames per bridge call, overriding the budget estimate (1–40) |
| `perFrameMs` | `900` | measured cost of one frame, used to size chunks (50–60000) |
| `timeoutMs` | per-call | result deadline for a single chunk (1000–1800000) |
| `graceMs` | `20000` | extra wait for files that land after a chunk stops answering (0–600000) |
| `resume` | `true` | reuse non-empty files already on disk |
| `manifestLimit` | `50` | max entries per frame list in the result |

```json
{ "frames": "0-215", "outDir": "C:/renders/hero", "timeoutMs": 45000, "perFrameMs": 300 }
```

Measured against Cavalry 2.8.0 and a 736×414 comp: 216 frames in 6 chunks in 40 s (~175 ms per
frame), with the playhead returned to frame 211.

### `cavalry_probe_api`

Documentation and the live build disagree about names. One call settles it: the function keys of
`Object.keys(api)`, a yes/no per watched name, one representative layer per type with its full
attribute list, and `api.getAllLayerTypes()`.

| Parameter | Default | Meaning |
|---|---|---|
| `layerIds` | — | up to 20 ids whose full attribute list to read |
| `functions` | built-in watch list | function names to test |
| `sampleTypes` | `true` | read one representative layer per type in the active comp |
| `includeLayerTypes` | `true` | include `api.getAllLayerTypes()` in the report |
| `inlineSurface` | `false` | return the full function-name list, not just the file path |
| `writeFile` | `~/.cavalry-mcp/cavalry-api-capabilities.json` | report path |

The tool payload stays a summary; the full report is written to disk. For the 2.8.0 build used
in development: 320 API functions, 256 layer types, 82 attributes on a `textShape`, and seven
watched names absent (`getName`, `getCompositionList`, `duplicateSelection`, `startUndoGroup`,
`endUndoGroup`, `save`, `open`).

### `cavalry_doctor`

One call, four groups of checks, with a concrete next step for every failure:

| Check | What it proves |
|---|---|
| `bridge` | `GET /` and `GET /get` answer, the reported Stallion/Cavalry versions, and whether the listener is the headless mock |
| `runtime` | `api.exec` actually runs and the seq-matched result channel delivers — version, active comp, layer count, frame, scene path, unsaved-changes warning |
| `ffmpeg` / `ffprobe` | the binaries resolve and print a version |
| `workspace` | the telemetry state directory is writable and the result/timeout configuration is readable |

| Parameter | Default | Meaning |
|---|---|---|
| `timeoutMs` | `4000` | per-probe ceiling (250–60000); raise it while Cavalry is mid-render |
| `probeRuntime` | `true` | set `false` for a network-and-binaries-only check |
| `expectedVersion` | `CAVALRY_EXPECTED_VERSION`, else `2.8` | Cavalry minor to compare against |
| `format` | `text` | `text` for one line per check with fixes, `json` for the structured report |

A slow runtime probe is usually a busy Cavalry: the script host is single-threaded, so a modal
dialog or a running render looks like a timeout. The doctor says so instead of treating it as a
dead bridge.

## The `_mg` helper DSL

`_mg` is injected into every `cavalry_run_script` and preset execution. It is a plain object of
functions that compile down to `api.*` calls — no hidden state except the alias registry and the
preset-root registry, both held on `globalThis` so they survive across executions in one Cavalry
session.

Everything below also runs through [`types/cavalry.d.ts`](types/cavalry.d.ts), which is the
TypeScript contract for the injected API and helpers.

### Scene construction and handles

| Helper | Purpose |
|---|---|
| `_mg.comp(w?, h?, fps?, endFrame?, bgColor?)` | create and activate a composition (defaults `1920, 1080, 60, 180, "#0B0C10"`) |
| `_mg.set(id, attrs)` | apply a dot-path attribute map to one layer |
| `_mg.shape(type, name, attrs?)` | create a shape layer |
| `_mg.layer(type, name, attrs?)` | create any layer type |
| `_mg.text(str, size?, color?, extraAttrs?)` | create a text layer (defaults `80`, `#FFFFFF`) |
| `_mg.alias(id, name)` | register a stable `@handle` for a layer; returns the handle |
| `_mg.aliases()` | every registered alias as `{ "@handle": "layerId" }` |
| `_mg.find(query, index?)` | resolve a layer id, semantic id, slug or `@alias` to ids |
| `_mg.semantic(id, index?)` | read or assign a semantic id on a layer |
| `_mg.semantics(limit?)` | list semantic ids in the active comp |
| `_mg.selection()` / `_mg.sel()` | the current selection as ids / the first id |
| `_mg.undoGroup({ id?, name?, operations })` | run a function inside one named Undo group; nesting collapses to the outermost pair |

Aliases are the recommended way to address layers across calls. A live id like `textShape#7`
changes when a scene is recreated; `@hero_title` does not.

### Structure and rigging

| Helper | Purpose |
|---|---|
| `_mg.wire(srcId, srcAttr, dstId, dstAttr)` | connect one attribute to another |
| `_mg.deform(targetId, deformerType, name, attrs?)` | add a deformer to a layer |
| `_mg.subMesh(textId, level?, staggerOffset?)` | sub-mesh a text layer and add a stagger; returns `{ subMeshId, staggerId }` |
| `_mg.duplicator(shapeId, distType?, count?, size?, attrs?)` | build a duplicator rig (defaults `grid`, `[5, 5]`, `[1200, 700]`) |
| `_mg.svg(parent, spec)` | editable vector from a VTracer SVG file or an inline path `d`; parent, position and scale are applied |
| `_mg.mask(targetId, masks)` | apply `alpha`, `invertedAlpha` or `luminance` masks |
| `_mg.blend(id, mode)` | set a blend mode |
| `_mg.typography(id, spec)` | `fontSize`, `lineHeight`, `letterSpacing`, `textBoxSize` |
| `_mg.subMeshLevel(textId, level)` | switch a sub-mesh between characters, words and lines (`0`, `1`, `2`) |
| `_mg.filter(id, spec)` | `motionBlur`, `gaussianBlur`, `dropShadow`, `noise` |
| `_mg.corner(id, radius)` | corner radius on a shape |

### Animation and timing

| Helper | Purpose |
|---|---|
| `_mg.kf(id, attr, points, magicEase?)` | write keyframes from `[frame, value]` or `[frame, value, handles]` tuples; default easing `SpringOut` |
| `_mg.keyframe(spec)` | declarative two-boundary move: `{ element, property, startFrame, endFrame, startValue, endValue, easing? }` |
| `_mg.keyframes(spec)` | multi-point curve: `{ element, property, points, easing? }`; per-point handles bypass the segment easing |
| `_mg.ease(id, attr, spec)` | boundary move with `magicEasing`, `{ kind: "bezier" }`, or a spring descriptor; accepts `position`/`scale` to drive both axes |
| `_mg.stagger(ids, spec)` | deterministic per-layer delay: `{ attr, inFrame, outFrame, from, to, delayFrames, easing }` |
| `_mg.behavior(spec)` | bake an analytic damped spring to per-frame keyframes: `{ element, type: "spring", property, startFrame, parameters, duration }` |
| `_mg.syncToFrames(frames, spec)` | retime animation to beat frames |
| `_mg.trim(id, spec)` | trim start/end/offset and travel |
| `_mg.modulate(layerId, attrPath, config)` | procedural modulation: `spring`, `organicFloat`, `staggerFalloff`, `oscillator`, `noise` |
| `_mg.connectDynamic(sourceId, targetId, styleSpec?)` | dynamic connector between layers |

Easing names are the 20 Cavalry names above. `_mg.ease` also accepts the friendly aliases that
refclone emits — `ExpoOut`, `CubicInOut`, `BackOut`, `QuarticIn`, `Linear` and friends — and
maps a raw cubic-bezier to the *nearest accepted preset* by RMS over 11 samples. It never sends
`Custom` to `api.magicEasing`; that API needs a separate expression argument and is not
equivalent.

`_mg.rig(spec)` is a pure descriptor helper: give it `stiffness`, `mass`, `damping`/
`dampingRatio` or `overshoot`, and it returns the implied frequencies, overshoot, suggested
easing and hold/stagger terms without writing anything. It is what a refinement loop uses to
translate spring language into Cavalry's vocabulary.

### Patching, layout and convergence

| Helper | Purpose |
|---|---|
| `_mg.patch(spec)` | idempotent in-place adjustments; never creates or recreates layers |
| `_mg.patchSelected(spec)` | restyle/retime the selection or the last preset's roots |
| `_mg.patchKeyframeSafe(id, attrs, frame)` | write values at one exact frame without stacking keys or rewriting neighbour tangents |
| `_mg.fitToBounds(layerId, targetBox, options?)` | fit a layer's measured world bounds to a target box synchronously |
| `_mg.fromRaster(x, y, compWidth, compHeight)` | convert top-left, y-down video pixels to Cavalry-centred, y-up comp space |
| `_mg.theme()` / `_mg.applyTheme(tokens \| null)` | read the bound theme / bind a palette, typography and radius for future layers |

`_mg.patch` is the correction primitive. A spec targets layers by any of `alias`, `target`,
`ids`, `semantic` or `semantics`, and applies any of:

| Field | Effect |
|---|---|
| `attrs` | absolute dot-path values |
| `delta` | additive values — read the current value, then add |
| `multiply` | multiplicative factor applied after `attrs`/`delta` |
| `frame` | write at that frame through `patchKeyframeSafe` instead of at the playhead |
| `shiftKeyframes` | slide existing keys by frames (optionally only for named attrs) |
| `easing` | retune existing keyframe easing |
| `force` / `diff` | `force: true` or `diff: false` writes even when the value already matches |

Static writes are compared with the evaluated attribute first, so re-applying the same spec is a
no-op and reports the value under `skipped` rather than writing a duplicate. A frame-targeted
write always lands, because Cavalry 2.8 has no value-at-frame getter. `patch` returns
`{ patched, changes, skipped, targets }` per spec (or an array of those when given an array).

`_mg.fitToBounds` resizes the intrinsic geometry first — `generator.dimensions` or
`generator.radius` for shapes, `fontSize` for text — then closes the residual with scale, and
corrects position from the freshly measured box after every pass. Options are `space`
(`comp` or `raster`), `compWidth`/`compHeight`, `tolerance` (default `0.5`), `maxPasses`
(default `5`, max `10`), `intrinsic` (default `true`), `preserveAspect` and `fitWidth`. It
returns `{ ok, layerId, type, space, target, box, passes, error, applied }`. `layerId` accepts
an `@alias`, a semantic id or a slug; the resolved live id is reported.

## Procedural presets

The registry ships **120 presets across 14 category packs** — a self-contained SaaS
motion-graphics library. Every preset is an isolated IIFE inside its own Undo group, with
`try/finally`. It returns a map of role → layer id plus `preset: "<id>"`, so you can keep
animating the pieces it built.

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

Presets are stored as category packs in `src/presets/packs/cat01…cat14` and composed from
shared `_rb` factories in `src/presets/rig_builders.ts`. Every preset accepts `{}` and runs with
its declared defaults. Parameters declare the types `string`, `int`, `double`, `bool`, `color`
(hex string) and `json` (object or array).

Accepted aliases:

| Alias | Preset |
|---|---|
| `bento_grid`, `spring_card` | `bento_cards` |
| `counter_rig` | `number_counter` |
| `bg_grid` | `dot_matrix_bg` |

Categories 9–14 and presets 59–60 extend the original 58-preset brief; they follow the same
conventions — `_rb` factories, verified Cavalry 2.8 attribute paths, floor-pinned bars, one
guarded Undo group — but their layouts and parameters were designed to be consistent with the
brief rather than transcribed from it.

### Preset manifest

`npm run build` writes `dist/presets/preset_manifest.json`. Its declared format is:

```
id|category|motionSignature|requiredParams|defaultDuration
```

Each entry is one line under `presets`, with abbreviated category codes resolved by the adjacent
`categories` map. The manifest is generated from the same definitions the server ships, never
hand-maintained, and the build enforces a 1500-token budget. `refclone` consumes it to choose a
preset without loading the whole library into context; it looks for
`REFCLONE_PRESET_MANIFEST`, then `CAVALRY_MCP_PRESET_MANIFEST`, then a sibling checkout.

## Zero-MCP CLI

`bin/stallion-cli.mjs` exposes the same runtime without an MCP client. It imports `dist/`, so run
`npm run build` after changing source. Installing the package exposes the `stallion` command.

```bash
node bin/stallion-cli.mjs -e 'return _mg.text("FAST", 96);'
node bin/stallion-cli.mjs -f ./rig.js
node bin/stallion-cli.mjs -p kinetic_text '{"text":"HELLO"}'
node bin/stallion-cli.mjs --list
node bin/stallion-cli.mjs --list fintech_billing
node bin/stallion-cli.mjs --rig payment_card_checkout
node bin/stallion-cli.mjs --sel
node bin/stallion-cli.mjs --verify-frames 0,60,120 --scale 50
node bin/stallion-cli.mjs --render-frames 0-215 --out ./frames --chunk 20
node bin/stallion-cli.mjs --probe --capabilities-out ./capabilities.json
```

| Mode | Flags |
|---|---|
| Script | `-e "<javascript>"`, `-f <file.js>` |
| Preset | `-p <preset> '<json>'`, `--list [category]`, `--rig <preset>` |
| Selection | `--sel` |
| Beats | `--audio-beats <audio-or-json>` `[--fps N]` `[--beats-out file]` `[--ffmpeg path]` |
| Promo | `--render-promo <plan.json>` `[--out promo.mp4]` `[--audio track]` `[--workdir dir]` `[--dry-run]` |
| Verify | `--verify-frames <f1,f2,f3 \| f1-f3:step>` `[--out dir]` `[--scale N]` `[--comp id]` |
| Render | `--render-frames <range>` `[--out dir]` `[--pattern p]` `[--scale N]` `[--comp id]` `[--chunk N]` `[--per-frame-ms N]` `[--timeout-ms N]` `[--grace-ms N]` `[--no-resume]` |
| Probe | `--probe` `[--layer id]…` `[--function name]…` `[--no-types]` `[--inline-surface]` `[--capabilities-out file]` |
| Global | `--state`, `--fps N`, `--ffmpeg <path>` |

`--state` prints the execution snapshot to stderr on success; on failure the snapshot is always
printed. `--rig` prints the preset's spring/easing contract (derived from its script and
parameter defaults), which is what a refinement loop reads before retuning it. `--probe` writes
its report to `~/.cavalry-mcp/cavalry-api-capabilities.json` unless `--capabilities-out` is
given.

Promo rendering needs a local `ffmpeg` (pass `--ffmpeg <path>`); beat analysis honours
`FFMPEG_PATH`. A pre-analysed JSON beat file lets `--audio-beats` run without ffmpeg.

## Execution state and telemetry

After every atomic execution the wrapper snapshots the active comp before the script, then writes
a compact state file after the Undo group has closed — in a `finally`, outside the group:

```json
{
  "seq": "…",
  "status": "ok",
  "errorStack": null,
  "createdLayerIds": ["textShape#7"],
  "activeSelection": ["textShape#7"],
  "compInfo": { "id": "comp#1", "name": "Main", "fps": 60, "startFrame": 0, "endFrame": 180, "resolution": [1920, 1080] },
  "boundingBoxes": { "textShape#7": { "x": -300, "y": -60, "width": 600, "height": 120, "centre": { "x": 0, "y": 0 } } },
  "durationMs": 123,
  "writtenAt": "2026-11-01T00:00:00.000Z"
}
```

- The MCP server returns the same object as `_meta.telemetry` without changing the text payload
  that scripts and existing clients parse.
- The CLI prints it to stderr with `--state`, and always on a failed execution.
- The path is `~/.cavalry-mcp/last-execution-state.json` (override with
  `CAVALRY_STATE_PATH`). If the first write fails, a smaller `writeFailed` payload is attempted
  so the node side still learns what happened.
- Bounding boxes cover up to 50 created or selected layers and are measured in world space at
  the playhead after the script ran.

## Environment variables

All are optional.

| Variable | Default | Purpose |
|---|---|---|
| `STALLION_URL` | `http://127.0.0.1:8080` | Stallion base URL; must be `http` or `https` |
| `STALLION_TOKEN` | empty | bearer token when `stallion.json` configures one |
| `CAVALRY_HOST` / `CAVALRY_PORT` | `127.0.0.1` / `8080` | legacy URL configuration used when `STALLION_URL` is unset |
| `CAVALRY_HTTP_TIMEOUT_MS` | `5000` | abort timeout for every HTTP request; long render callers override it per call |
| `CAVALRY_RESULT_TIMEOUT_MS` | `5000` | overall structured-result wait; per-call `timeoutMs` overrides it |
| `CAVALRY_TIMEOUT_MS` | *(legacy)* | sets both timeouts at once when the specific variables are unset |
| `CAVALRY_RESULT_PATH` | `<tmpdir>/cavalry-mcp-result-<pid>.json` | legacy fallback result file |
| `CAVALRY_STATE_PATH` | `~/.cavalry-mcp/last-execution-state.json` | telemetry snapshot path |
| `CAVALRY_PREVIEW_DIR` | `~/.cavalry-mcp/previews` | `cavalry_verify_frames` / `--verify-frames` output |
| `CAVALRY_FRAMES_DIR` | `~/.cavalry-mcp/previews/frames` | `cavalry_render_frames` / `--render-frames` output |
| `CAVALRY_CAPABILITIES_PATH` | `~/.cavalry-mcp/cavalry-api-capabilities.json` | `cavalry_probe_api` / `--probe` report |
| `CAVALRY_EXPECTED_VERSION` | `2.8` | the Cavalry minor `cavalry_doctor` compares against |
| `FFMPEG_PATH` | `ffmpeg` | ffmpeg binary for beats and promo encoding |
| `FFPROBE_PATH` | `ffprobe` | ffprobe binary used by `cavalry_doctor` |
| `ENABLE_LEGACY_TOOLS` | `false` | register the original 44 granular MCP tools |

## Legacy tools (`ENABLE_LEGACY_TOOLS=true`)

The original surface remains available for existing clients. It is off by default to keep MCP
schema tokens and round trips down. All 44 tools run through the same atomic wrapper and the
same state capture.

### Scene building and data

| Tool | Notes |
|---|---|
| `cavalry_ping` | reachability check plus Cavalry version |
| `cavalry_run_script` | arbitrary JS; assign `__result` or use `return` to send data back |
| `cavalry_create_layer` | returns the new layer id, e.g. `textShape#3` |
| `cavalry_set_attribute` | `{"material.materialColor": "#101828"}`, `{"generator.dimensions": [1920, 1080]}` |
| `cavalry_get_attribute` | returns the value |
| `cavalry_connect` | connect one attribute to another (the single-operation form of the batch `connect`) |
| `cavalry_get_scene_layers` / `cavalry_get_selected_layers` | structured JSON: id, type, name, visible, selected, position, in/out, parent |
| `cavalry_list_attributes` | every attribute path on a layer, optionally with definitions |
| `cavalry_get_connections` | incoming connections per attribute plus outgoing connections per attribute and id |
| `cavalry_select_layers` / `cavalry_delete_layers` | delete verifies what was actually removed |
| `cavalry_duplicate_layer` | `api.duplicate`, keeps your selection |
| `cavalry_rename_layer` | rename in place |
| `cavalry_layer_order` | z-order without a second layer id: `forward` / `front` / `backward` / `back`, selection-safe |
| `cavalry_get_bounding_box` | local (default) or world space |
| `cavalry_import_asset` | image/sequence/video/audio → asset and layer ids |
| `cavalry_add_dynamic_attribute` | add a dynamic attribute to a layer |
| `cavalry_layer_types` | every layer type in this build (`[{type, name}]`, including experimental on request) |
| `cavalry_transform` | `reset` / `freeze` / `centrePivot` |

### Animation

| Tool | Notes |
|---|---|
| `cavalry_keyframe` | one keyframe **or a whole curve** (`keyframes: [{frame, attributes}]`) in one call |
| `cavalry_keyframe_edit` | delete keys at frames, wipe an attribute's (or a layer's) animation, set/clear per-keyframe velocity |
| `cavalry_magic_easing` | schema-validated enum of the 20 real easing names; `expression` is accepted with `Custom`/`None` only |
| `cavalry_get_keyframes` | keyframe frames per attribute |
| `cavalry_animate_in` | presets in one call: `fadeIn`, `fadeUp`, `springUp`, `slideInLeft`, `popIn`, `dropBounce` |
| `cavalry_expression` | set or read a per-attribute JavaScript expression |

### Style and colour

| Tool | Notes |
|---|---|
| `cavalry_gradient` | one-call gradient from hex stops (`setGradientFromColors`) |
| `cavalry_generate_palette` | harmonious palettes: monochromatic, analogous, complementary, triadic, goldenRatio, … |

### Composition and timing

| Tool | Notes |
|---|---|
| `cavalry_get_composition_info` | resolution, fps, frame range, current frame |
| `cavalry_set_composition_info` | width/height, fps, inFrame/outFrame |
| `cavalry_compositions` | list/create/set-active comps, list a comp's layers, preCompose, new scene (confirm-gated) |
| `cavalry_set_current_frame` / `cavalry_get_current_frame` | playhead control |
| `cavalry_playback` | play/stop the timeline so the user can watch |
| `cavalry_set_layer_timing` | trim in/out points or slide a layer by N frames |
| `cavalry_reorder_layer` / `cavalry_set_parent` | stack order and hierarchy |

### Render and export

| Tool | Notes |
|---|---|
| `cavalry_render_png` | renders and returns the image inline (`returnImage: false` to skip) |
| `cavalry_render_filmstrip` | N frames across the timeline → one contact sheet image |
| `cavalry_render_video` | starts a background render-queue video render of the active comp |
| `cavalry_get_render_queue` / `cavalry_cancel_render` | manage renders |
| `cavalry_save_scene` / `cavalry_open_scene` | Save As verified by watching the file on disk |
| `cavalry_undo` | experimental, feature-detected; a clear error if this build lacks it |

## Tips and known behaviour

- **Batch, always.** One bridge round trip costs about a second. Use `cavalry_batch`, one
  `cavalry_run_script`, or the CLI instead of a loop of single-attribute calls.
- **Renders are asynchronous inside Cavalry.** The PNG reflects the scene state when the render
  *completes*. Make scene changes and renders in separate calls.
- **`api.saveSceneAs` tears down the Stallion script context.** After a Save As, re-run
  **Scripts → Stallion** before further tool calls.
- **Layer ids are strings** like `textShape#3`, numbered per type across the scene. Treat them
  as ephemeral; register an `_mg.alias` for anything you will address again.
- **`cavalry_render_video` follows the render queue item's settings.** Configure defaults once
  in Cavalry's Render window; `outputPath` sets the item's filename on a best-effort basis.
- **`Custom` is not a magic-easing preset.** `api.magicEasing` needs a separate expression
  argument, so helpers map raw beziers to the nearest accepted curve rather than sending it.
- **A timed-out script is not a cancelled script.** The deadline stops the wait; the bridge may
  still be executing. Inspect the state file and reconcile before re-sending.
- The Cavalry scripting reference is the authority on attribute paths:
  <https://cavalry.studio/docs/tech-info/scripting/api-module>. When it disagrees with the
  build, `cavalry_probe_api` wins.

## Development

```bash
npm ci
npm run build      # tsc -> dist/ and the preset manifest
npm test           # 262 tests, no Cavalry required
```

The suite runs the real server against an in-memory MCP client and a mock Stallion: an HTTP
server that executes scripts in a `node:vm` sandbox with a modelled `api`. Bridge behaviour —
seq matching, the write-failure retry, queue serialization, timeouts, the friendly connection
error — is therefore covered without Cavalry installed. `test/presets/library.test.ts` compiles and
executes all 120 presets with defaults and typed overrides against the same mock. Theme,
telemetry, render-chunking, verify, probe and MCP schema tests run in the same suite.

CI runs `npm ci`, `npm run build` and `npm test` on Ubuntu and Windows with Node 20, 22 and 24.

Useful scripts:

| Command | Effect |
|---|---|
| `npm run dev` | `tsc --watch` |
| `npm run build:manifest` | regenerate `dist/presets/preset_manifest.json` only |
| `npm start` | run the built server directly |
| `npm run test:watch` | watch-mode test run through `tsx` |

## Repository layout

```
src/
  index.ts             MCP server, core registration, legacy gate
  server/
    core-tools.ts      core MCP tools: batch, verify, render, probe, doctor
    legacy/
      index.ts         the 44 opt-in granular tools
      animate-presets.ts  one-call animation presets for cavalry_animate_in
      filmstrip.ts     PNG contact sheets for the legacy preview tools
  tools/
    batch.ts           batch operation compiler
    beats.ts           audio-beat analysis
    doctor.ts          bridge/runtime/binary/workspace diagnosis
    probe.ts           live API capability report
    promo.ts           multi-scene MP4 promo renderer
    render-frames.ts   chunked, resumable PNG sequence render
    verify.ts          frame previews, collisions, missing files
  bridge/
    stallion.ts        serialized HTTP client, native + legacy result channels
  shared/
    lib.ts             string, outcome and JSON helpers
    fs-safe.ts         Windows-safe tree removal
    state.ts           execution-state snapshots
  runtime/
    atomic.ts          one Undo group, result envelope, state capture
    execute.ts         script execution and result formatting
    inspect.ts         bounded selection/roots summaries
    mg_helpers.ts      the `_mg` DSL
    rig_terms.ts       spring/easing contract derivation
  presets/
    cavalry_snippets.ts  compilePreset, listPresets, PRESET_NAMES
    rig_builders.ts      shared `_rb` factories
    manifest.ts          preset manifest builder
    packs/cat01…cat14    the 120 presets
bin/stallion-cli.mjs   the zero-MCP CLI
scripts/               build-time preset manifest
types/cavalry.d.ts     API and `_mg` TypeScript declarations
test/
  bridge/ cli/ e2e/ helpers/ legacy/ presets/ runtime/ server/ shared/ tools/
                       grouped unit, mock-bridge, MCP e2e and preset-library tests
```

## Credits

- [kacperchlebowicz/Cavalry-mcp](https://github.com/kacperchlebowicz/Cavalry-mcp) — the original
  Claude Desktop version this project rebuilt
- [scenery-io/stallion](https://github.com/scenery-io/stallion) — the upstream Stallion project;
  this stack is developed against the [akspro9866-art fork](https://github.com/akspro9866-art/stallion),
  which adds the seq-matched result channel, status heartbeat, readback message types and mock
  bridge this server uses
- [Scene Group](https://cavalry.scenegroup.co) — Cavalry

## License

MIT
