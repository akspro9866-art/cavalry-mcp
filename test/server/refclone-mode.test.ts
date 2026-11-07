import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/index.js";

const REFCLONE = ["refclone_inspect_reference", "refclone_get_preset_signatures", "refclone_compile_and_converge"].sort();
const STRICT_DSL = ["cavalry_exec_mg", "cavalry_query_presets", "cavalry_inspect_rig", "cavalry_clone_beat"].sort();
const COMPACT = ["cavalry_apply_dsl", "cavalry_search_presets", "cavalry_inspect_compact"].sort();
const CRUD = [
  ...COMPACT, "cavalry_run_script", "cavalry_inspect", "cavalry_run_preset", "cavalry_batch",
  "cavalry_verify_frames", "cavalry_render_frames", "cavalry_probe_api", "cavalry_doctor",
].sort();
const FULL = [
  ...CRUD, "cavalry_ping", "cavalry_create_layer", "cavalry_set_attribute", "cavalry_get_attribute",
  "cavalry_connect", "cavalry_keyframe", "cavalry_magic_easing", "cavalry_get_keyframes",
  "cavalry_animate_in", "cavalry_get_scene_layers", "cavalry_get_selected_layers", "cavalry_select_layers",
  "cavalry_delete_layers", "cavalry_duplicate_layer", "cavalry_rename_layer", "cavalry_reorder_layer",
  "cavalry_set_parent", "cavalry_set_layer_timing", "cavalry_get_composition_info", "cavalry_set_composition_info",
  "cavalry_set_current_frame", "cavalry_get_current_frame", "cavalry_render_png", "cavalry_render_filmstrip",
  "cavalry_render_video", "cavalry_get_render_queue", "cavalry_cancel_render", "cavalry_import_asset",
  "cavalry_list_attributes", "cavalry_get_bounding_box", "cavalry_save_scene", "cavalry_open_scene",
  "cavalry_add_dynamic_attribute", "cavalry_undo", "cavalry_layer_order", "cavalry_keyframe_edit",
  "cavalry_get_connections", "cavalry_expression", "cavalry_gradient", "cavalry_generate_palette",
  "cavalry_compositions", "cavalry_transform", "cavalry_layer_types", "cavalry_playback",
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
        const legacy = env.ENABLE_LEGACY_TOOLS === "true";
        const crud = legacy || ["1", "true"].includes(env.CAVALRY_MCP_LEGACY_CRUD ?? "");
        const expected = mode === "refclone_strict" ? REFCLONE : mode === "interactive_authoring" ? FULL :
          strict ? STRICT_DSL : legacy ? FULL : crud ? CRUD : COMPACT;
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
