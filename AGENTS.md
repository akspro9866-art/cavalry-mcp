# Cavalry agent rules

- Never loop single-action MCP or HTTP calls. Batch scene work into one `cavalry_run_script` or `node bin/stallion-cli.mjs -e "..."` execution.
- Always prefer `_mg.*` helpers and procedural Cavalry nodes (`duplicator`, `subMesh`, `stagger`, `noise`, `oscillator`, `magicEasing`) over per-layer keyframe spam.
- Return a compact value from scripts. Use `cavalry_inspect` for selection/root IDs; never dump the scene graph.
- When tweaking existing layers, use `const id = _mg.sel()` (`api.getSelection()[0]`) instead of querying the scene.
- Prefer `cavalry_run_preset` or `stallion -p` for standard rigs. The library has 120 presets in 14 category packs (`src/presets/packs/cat01…cat14`); discover IDs with `node bin/stallion-cli.mjs --list [category]`.
- New presets go in the matching category pack, compose shared `_rb.*` factories from `src/presets/rig_builders.ts`, and must run with default `{}` params. Add a coverage case to `test/library.test.ts` when the param types or rig surface change.
- Scripts are isolated IIFEs and grouped into one Undo step. Do not add another Undo group.
- Keep `ENABLE_LEGACY_TOOLS` unset unless a client explicitly needs the original granular tools.
- Use Cavalry API methods only. Never substitute After Effects APIs; `types/cavalry.d.ts` is the local contract.
