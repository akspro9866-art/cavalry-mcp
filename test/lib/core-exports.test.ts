import { test, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const IDS = [
  "typography", "ui_mockups", "data_viz", "polish_camera", "ai_agents", "devtools_cli",
  "collab_presence", "workflows_nodes", "fintech_billing", "security_auth", "cloud_devops",
  "voice_audio_video", "onboarding_plg", "social_proof_cta", "procedural_saas", "card_worlds",
];
let core: typeof import("cavalry-mcp/core");

test("built package core import cannot start MCP, HTTP, subprocesses or filesystem writes", async () => {
  const previousContext = process.env.NODE_TEST_CONTEXT;
  const previousMode = process.env.MCP_MODE;
  delete process.env.NODE_TEST_CONTEXT; // Do not let the index.ts test guard hide accidental startup.
  process.env.MCP_MODE = "core-must-not-read-server-mode";
  const attempts: string[] = [];
  const forbid = (label: string) => (..._args: unknown[]): never => {
    attempts.push(label);
    throw new Error(`core import attempted ${label}`);
  };
  const spies = [
    mock.method(McpServer.prototype, "connect", forbid("MCP startup")),
    mock.method(http, "request", forbid("HTTP request")),
    mock.method(http, "get", forbid("HTTP get")),
    mock.method(https, "request", forbid("HTTPS request")),
    mock.method(https, "get", forbid("HTTPS get")),
    mock.method(net.Socket.prototype, "connect", forbid("socket connect")),
    mock.method(globalThis, "fetch", forbid("fetch")),
    mock.method(childProcess, "spawn", forbid("spawn")),
    mock.method(childProcess, "spawnSync", forbid("spawnSync")),
    mock.method(childProcess, "execFile", forbid("execFile")),
    mock.method(fs, "writeFileSync", forbid("writeFileSync")),
    mock.method(fs, "writeFile", forbid("writeFile")),
    mock.method(fs, "appendFileSync", forbid("appendFileSync")),
    mock.method(fs, "mkdirSync", forbid("mkdirSync")),
    mock.method(fsPromises, "writeFile", forbid("promises.writeFile")),
    mock.method(fsPromises, "mkdir", forbid("promises.mkdir")),
  ];
  syncBuiltinESMExports();
  try {
    core = await import("cavalry-mcp/core");
    assert.deepEqual(attempts, []);
    assert.ok(!("server" in core));
    assert.ok(!("createServer" in core));
  } finally {
    for (const spy of spies) spy.mock.restore();
    syncBuiltinESMExports();
    if (previousContext === undefined) delete process.env.NODE_TEST_CONTEXT;
    else process.env.NODE_TEST_CONTEXT = previousContext;
    if (previousMode === undefined) delete process.env.MCP_MODE;
    else process.env.MCP_MODE = previousMode;
  }
});

test("core exposes the actual namespace and exact 146/16 registry without synthetic packs", () => {
  assert.equal(core.PRESET_DEFS.length, 146);
  assert.equal(core.cavalrySnippets.PRESET_DEFS, core.PRESET_DEFS);
  assert.equal(Array.isArray(core.cavalrySnippets), false);
  assert.ok(Array.isArray(core.PRESET_PACKS));
  assert.deepEqual(core.PRESET_PACKS.map(pack => pack.id), IDS);
  // PRESET_PACKS covers the static library only; the runtime cloned_styles
  // category carries no PresetDefs and is served by list_cloned_styles.
  assert.deepEqual(core.PRESET_PACKS.map(pack => pack.name), core.PRESET_CATEGORIES.filter(cat => cat.presets !== "dynamic").map(cat => cat.label));
  assert.deepEqual(core.PRESET_PACKS.map(pack => pack.presets.length), [5, 5, 5, 5, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 5, 21]);
  const all = core.PRESET_PACKS.flatMap(pack => pack.presets);
  assert.deepEqual(all, core.PRESET_DEFS);
  assert.equal(new Set(all.map(def => def.id)).size, 146);
  for (const pack of core.PRESET_PACKS) {
    for (const def of pack.presets) {
      assert.equal(def.category, pack.id);
      assert.equal(core.cavalrySnippets.getPreset(def.id), def);
      assert.equal(typeof def.code, "string");
      assert.ok(def.description);
      assert.equal(typeof core.compilePreset(def.id), "string");
    }
  }
});

test("core compiler emits JS, helpers include rig builders, validators are separate", () => {
  const source = core.compileMgDsl({ comp: { fps: 30 }, layers: [], ops: [] });
  assert.equal(typeof source, "string");
  assert.ok(source.includes(core.MG_MANIFEST_RUNTIME));
  assert.ok(core.MG_HELPERS_SOURCE.includes(core.RB_HELPERS_SOURCE));
  assert.equal(core.validateMgManifestStrict({ ops: [{ op: "invalid" }] }).ok, false);
  // compileMgDsl deliberately does not validate or execute its input.
  assert.match(core.compileMgDsl({ ops: [{ op: "invalid" }] } as never), /invalid/);
});

test("core export ships declarations and leaves package identity and existing exports intact", () => {
  const pkg = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.name, "cavalry-mcp");
  assert.equal(pkg.exports["."], "./dist/index.js");
  assert.equal(pkg.exports["./lib"], "./dist/lib/index.js");
  assert.equal(pkg.exports["./package.json"], "./package.json");
  assert.deepEqual(pkg.exports["./core"], {
    types: "./dist/core-exports.d.ts", import: "./dist/core-exports.js", default: "./dist/core-exports.js",
  });
  const declaration = fs.readFileSync(new URL("../../dist/core-exports.d.ts", import.meta.url), "utf8");
  assert.match(declaration, /PRESET_PACKS: PresetPack\[\]/);
  assert.match(declaration, /cavalrySnippets/);
});
