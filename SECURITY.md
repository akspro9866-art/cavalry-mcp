# Security

## Reporting

Open a **private security advisory** on the repository (Security → Report a
vulnerability) rather than a public issue, and include the version, your OS,
the tool or CLI flag that was running and the redacted command line.

## What this software does on your machine

- Runs as a stdio MCP server (or the bundled `stallion` CLI) and sends
  JavaScript to the local [Stallion](https://github.com/akspro9866-art/stallion)
  HTTP bridge, which executes it **inside the running Cavalry application**.
- Builds, mutates and renders the open Cavalry scene: every execution is one
  Undo group, but renders write PNG files to disk and promo encoding spawns
  `ffmpeg`/`ffprobe` when those optional tools are on `PATH`.
- Reads preset JSON from `src/presets/cloned/` (or `CAVALRY_MCP_CLONED_DIR`)
  and writes preview renders into `.cloned-renders/` (or
  `CAVALRY_MCP_CLONED_RENDER_DIR`), which is gitignored scratch space.
- Has no network calls of its own beyond the loopback HTTP bridge and the
  MCP stdio pipe; no telemetry, no accounts, no uploads.

## The risk you are actually taking

`cavalry_run_script`, `cavalry_batch` and the DSL/preset tools execute
arbitrary JavaScript in your animation app, and the operations they run may
come from a language model. Treat these as untrusted inputs:

- **Only connect trusted MCP clients.** Any client that can spawn this server
  can drive the bridge and mutate or render your open scene. The server does
  not authenticate MCP clients; stdio access is the trust boundary.
- **The Stallion bridge is loopback-only by default, not sandboxed.** It binds
  `127.0.0.1:8080` with no TLS; token auth is optional (`stallion.json`
  `token`, Bearer on `POST /post` and `GET /get`). Keep the default loopback
  host, and set a token whenever the port is reachable by anything else.
  Anything that can reach the bridge can execute scripts with the privileges
  of the Cavalry process.
- **Scripts come from plans and presets you did not necessarily write.**
  Review emitted script batches and cloned-style presets before executing
  them against a scene you care about; keep your own copy of any `.cv`
  project before the first build.
- **Render output is scratch, not a backup.** `.cloned-renders/` and
  `tmp-live-*` are ignored by git on purpose; do not force-add them.

## Not covered

No sandboxing of the Cavalry process, no secrets management, and no
verification of what a connected client chooses to execute. Those are yours
to decide. See [LICENSE](LICENSE) for third-party terms.