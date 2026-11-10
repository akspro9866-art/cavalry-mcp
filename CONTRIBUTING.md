# Contributing

Thanks for being here. This project is the middle layer of the
refclone → cavalry-mcp → Stallion stack, and it stays small on purpose:
thin schema-checked tools around one atomic Cavalry execution.

## Prerequisites

- Node.js >= 18.17 and npm (CI runs 20 / 22 / 24 on Ubuntu and Windows).
- For live work only: Cavalry 2.8.x with the
  [Stallion](https://github.com/akspro9866-art/stallion) bridge enabled
  (**Scripts → Stallion**, re-run after every Cavalry start).
- `ffmpeg`/`ffprobe` on `PATH` for the optional promo/audio-beat paths and a
  few tests; the suite degrades honestly when they are missing.

## Development loop

```bash
git clone https://github.com/<you>/cavalry-mcp.git
cd cavalry-mcp
npm ci                # prepare runs the build, so dist/ exists after install
npm run build         # tsc + preset manifest (fails over the 1500-token budget)
npm run lint          # ESLint flat config, same tolerances as stallion
npm test              # headless suite, no Cavalry required
npm run test:ci       # lint + test, what the CI matrix runs
```

`npm run test:live` is opt-in and drives the real sibling refclone checkout;
never run it against a scene you care about. Read [SECURITY.md](SECURITY.md)
for the bridge trust model before touching execution paths.

## Ground rules

1. **No behaviour changes without a test that proves them.** Every tool stays
   a thin wrapper around one execution; every execution stays one Undo group.
2. **Keep the public surface stable.** Tool names, CLI flags, export paths
   (`"."`, `"./lib"`, `"./core"`) and the preset manifest budget are contracts.
3. **Render output never lands in git.** `.cloned-renders/` and `tmp-live-*`
   are ignored; tests point `CAVALRY_MCP_CLONED_RENDER_DIR` at temp dirs.
4. **One coherent change per commit**, using conventional-commit messages
   (`fix(deps): …`, `docs(readme): …`, `chore(ci): …`, `refactor(runtime): …`).
5. Add a line to `CHANGELOG.md` under the top entry (or an *Unreleased*
   section) for anything user-visible.

## Pull requests

- One coherent change per PR, with the tests that prove it.
- `npm run build && npm run lint && npm test` must pass locally; CI repeats
  them on the Ubuntu/Windows × Node 20/22/24 matrix.
- If you change tool schemas or the `_mg` DSL, say which inputs move and
  update the matching README section without renaming existing anchors.
- Shared stack skills are canonical here, under `.qoder/skills/`. Sibling repos
  (stallion, refclone) keep their own copies for local agents and compare them
  against this checkout byte-for-byte; edit the canonical copy here first and
  synchronise the copies rather than forking skill text.