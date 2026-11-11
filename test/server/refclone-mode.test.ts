import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/index.js";

const REFCLONE = ["refclone_inspect_reference", "refclone_get_preset_signatures", "refclone_compile_and_converge"].sort();
const STRICT_DSL = ["cavalry_exec_mg", "cavalry_query_presets", "cavalry_inspect_rig", "cavalry_clone_beat"].sort();
const COMPACT = [
  "cavalry_apply_dsl",
  "cavalry_search_presets",
  "cavalry_inspect_compact",
  "list_cloned_styles",
  "instantiate_cloned_style",
  "sync_active_comp_to_cloned_style",
].sort();
const CRUD = [
  ...COMPACT, "cavalry_run_script", "cavalry_inspect", "cavalry_run_preset", "cavalry_batch",
  "cavalry_verify_frames", "cavalry_render_frames", "cavalry_probe_api", "cavalry_doctor",
].sort();

function* flagCases() {
  for (const strict of [undefined, "false", "1", "true"]) {
    for (const crud of [undefined, "false", "1", "true"]) {
      for (const legacy of [undefined, "false", "1", "true"]) {
        for (const cli of [false, true]) {
          yield { env: { CAVALRY_MCP_STRICT_DSL: strict, CAVALRY_MCP_LEGACY_CRUD: crud, ENABLE_LEGACY_TOOLS: legacy }, argv: cli ? ["--strict-dsl"] : [] };
        }
      }
    }
  }
}

for (const mode of ["refclone_strict", "interactive_authoring", undefined]) {
  test(`exact ListTools for ${mode ?? "unset mode"}: all 128 legacy/DSL flag combinations`, async () => {
    for (const { env, argv } of flagCases()) {
      let loads = 0;
      const server = createServer({
        env: { ...env, MCP_MODE: mode }, argv,
        refclone: { loadRefclone: async () => { loads++; throw new Error("must stay deferred"); } },
      });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "mode-regression", version: "0.0.0" });
      try {
        await server.connect(serverTransport);
        await client.connect(clientTransport);
        const strict = argv.length > 0 || ["1", "true"].includes(env.CAVALRY_MCP_STRICT_DSL ?? "");
        const crud = ["1", "true"].includes(env.CAVALRY_MCP_LEGACY_CRUD ?? "");
        const expected = mode === "refclone_strict" ? REFCLONE : mode === "interactive_authoring" ? CRUD :
          strict ? STRICT_DSL : crud ? CRUD : COMPACT;
        const actual = (await client.listTools()).tools.map(tool => tool.name).sort();
        assert.deepEqual(actual, expected, JSON.stringify({ mode, env, argv }));
        assert.equal(loads, 0);
        if (mode === "refclone_strict") {
          const denied = await client.callTool({ name: "cavalry_run_script", arguments: { code: "return 1" } });
          assert.equal(denied.isError, true);
          assert.equal(loads, 0);
        }
      } finally {
        await client.close();
        await server.close();
      }
    }
  });
}

test("invalid explicit MCP_MODE fails before registrations under every flag combination", () => {
  for (const mode of ["", "strict", "REFCLONE_STRICT", "refclone_strict ", "interactive"]) {
    for (const { env, argv } of flagCases()) {
      assert.throws(() => createServer({ env: { ...env, MCP_MODE: mode }, argv }), /Invalid MCP_MODE/);
    }
  }
});
