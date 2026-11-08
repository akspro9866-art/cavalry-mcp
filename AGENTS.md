# Cavalry agent rules

## SaaS reference video intake

[`.qoder/rules/saas-video-intake.md`](.qoder/rules/saas-video-intake.md) is always on. When a chat supplies 5–10 video paths without a build request, load [`.qoder/skills/saas-reference-analyzer/SKILL.md`](.qoder/skills/saas-reference-analyzer/SKILL.md) and run the analysis-only pipeline. The skill maps styles to this repository's generated `dist/presets/preset_manifest.json`; run `npm run build:manifest` if it is missing. Never invoke `refclone` clone/build/render commands or any `stallion` command. If any input is not SaaS UI content, abort the batch and print only: "This library is SaaS-only. Remove non-SaaS video and retry."

- Never loop single-action MCP or HTTP calls. Batch scene work into one `cavalry_run_script` or `node bin/stallion-cli.mjs -e "..."` execution.
- Always prefer `_mg.*` helpers and procedural Cavalry nodes (`duplicator`, `subMesh`, `stagger`, `noise`, `oscillator`, `magicEasing`) over per-layer keyframe spam.
- Return a compact value from scripts. Use `cavalry_inspect` for selection/root IDs; never dump the scene graph.
- When tweaking existing layers, use `const id = _mg.sel()` (`api.getSelection()[0]`) instead of querying the scene.
- Prefer `cavalry_run_preset` or `stallion -p` for standard rigs. The library has 120 presets in 14 category packs (`src/presets/packs/cat01…cat14`); discover IDs with `node bin/stallion-cli.mjs --list [category]`.
- New presets go in the matching category pack, compose shared `_rb.*` factories from `src/presets/rig_builders.ts`, and must run with default `{}` params. Add a coverage case to `test/presets/library.test.ts` when the param types or rig surface change.
- Scripts are isolated IIFEs and grouped into one Undo step. Do not add another Undo group.
- Build scenes with `cavalry_batch`, not one call per layer. Reserve `cavalry_run_script` for logic the op list cannot express.
- Render sequences with `cavalry_render_frames` (or `--render-frames`) in chunks, never a loop of single-frame calls. If a chunk times out, do not re-send it: the bridge is still running. Raise `perFrameMs`, lower `chunkFrames`, and rerun — the resume list comes from `render-progress.json`.
- Run `cavalry_probe_api` (or `--probe`) before trusting an attribute path or API name. `api.getName` does not exist, `api.getNiceName` does; text attributes are `fontSize`/`letterSpacing`/`wordSpacing`/`font`, not `text.*`. Cache the report instead of re-guessing.
- Keep `ENABLE_LEGACY_TOOLS` unset unless a client explicitly needs the original granular tools.
- Use Cavalry API methods only. Never substitute After Effects APIs; `types/cavalry.d.ts` is the local contract.
