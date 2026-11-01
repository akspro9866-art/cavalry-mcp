# Changelog

Notable changes to `cavalry-mcp`. Earlier releases are described by their commit
subjects (`git log --oneline`) rather than retroactively transcribed here.

## 3.1.0 — 2026-11-01

The four tools that a real clone job kept needing, promoted out of the legacy
gate, plus a transport that stops treating a long render as an error.

### Added

- `cavalry_render_frames` / `stallion --render-frames <range>`: numbered PNGs in
  chunks sized from a per-frame cost estimate against the result deadline
  (`chunkFrames = floor((timeoutMs − overheadMs) / perFrameMs)`, 1–40). One
  atomic script per chunk, playhead and active comp restored afterwards, a
  `frame → file` manifest back, and `render-progress.json`
  (`cavalry-mcp/render-progress@1`) rewritten after every chunk.
  Existing non-empty frames are reused (`resume`, default on), so an interrupted
  sequence is continued by calling the same tool again.
  Measured live on Cavalry 2.8.0 at 736×414: 216 frames in 6 chunks in 40 s
  (~175 ms/frame), where the per-frame route cost ~1 s of bridge latency each.
- `cavalry_probe_api` / `stallion --probe`: the live `Object.keys(api)` surface,
  a yes/no per watched function name, one representative layer per layer type
  with its full attribute list, and `api.getAllLayerTypes()`. The summary returns;
  the full report goes to `~/.cavalry-mcp/cavalry-api-capabilities.json`
  (`CAVALRY_CAPABILITIES_PATH`, `--capabilities-out`). On the 2.8.0 build:
  320 api functions, 256 layer types, 82 attributes on a `textShape`, and
  7 watch-list names absent (`getName`, `getCompositionList`,
  `duplicateSelection`, `startUndoGroup`, `endUndoGroup`, `save`, `open`).
- `cavalry_verify_frames`: the atomic multi-frame preview + collision checker,
  previously CLI-only, now a core tool.
- `cavalry_batch` is a core tool again with the op catalogue moved into the
  `operations` parameter description, so the tool description stays under the
  40-word budget the core surface is held to.
- `easing` batch op and `cavalry_magic_easing` accept `expression` — the curve
  Cavalry only reads for `Custom` (and tolerates with `None`). Anywhere else it
  would be silently ignored, so the compiler refuses it instead of shipping a
  no-op.

### Changed

- Timeouts are per call, not only per process. `runScriptWithResult`,
  `runScriptWithExecution` and `executeMotionScript` take `timeoutMs` (result
  wait) and `httpTimeoutMs` (the POST itself), so a chunk that legitimately
  outlives `CAVALRY_RESULT_TIMEOUT_MS` raises both together. An explicit
  `chunkFrames` grows the deadline to cover the chunk rather than guaranteeing a
  timeout.
- A chunk whose answer never arrives stops the run instead of being re-sent:
  Stallion keeps executing, so re-sending doubles the work. Files that land
  inside `graceMs` still count as rendered, and the unanswered frames go to
  `pending`.
- `parseFrameList` is shared by the verifier and the sequence renderer, and
  accepts an array of numbers as well as `"0,10-20:5"`.
- `AGENTS.md` / `.cursorrules` now record the chunked-render and probe-first
  rules, including the names that differ from the published docs.

### Compatibility

The tool count with `ENABLE_LEGACY_TOOLS` unset goes from 3 to 7. Legacy mode
still adds the granular tools; `cavalry_batch` was removed from the legacy
registration because it is now core, so a client that pinned the old three-tool
surface needs its tool list updated.
