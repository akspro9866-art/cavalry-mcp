import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { PRESET_PACKS } from "../../src/core-exports.js";
import {
  getPresetSignatures, loadRefcloneModule, registerRefcloneTools, resolveRefcloneModuleUrl,
  type RefcloneAdapter, type RefcloneToolDependencies, type JsonValue,
} from "../../src/server/refclone-tools.js";

async function connected(dependencies: RefcloneToolDependencies = {}) {
  const server = new McpServer({ name: "refclone-dispatch-test", version: "0.0.0" });
  registerRefcloneTools(server, dependencies);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "refclone-dispatch-test", version: "0.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    call: (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args }) as Promise<CallToolResult>,
    close: async () => { await client.close(); await server.close(); },
  };
}
function payload(result: CallToolResult): any {
  const text = result.content[0];
  assert.equal(text.type, "text");
  return JSON.parse((text as { text: string }).text);
}
const fixturePath = fileURLToPath(new URL("../helpers/refclone-adapter.mjs", import.meta.url));

test("module URL resolves from package location, with absolute Windows-safe overrides only", async () => {
  assert.equal(resolveRefcloneModuleUrl(), new URL("../../../refclone/src/strict/index.mjs", import.meta.url).href);
  const specialPath = fileURLToPath(new URL("../helpers/a%20space%23fixture.mjs", import.meta.url));
  assert.equal(resolveRefcloneModuleUrl(specialPath), pathToFileURL(specialPath).href);
  for (const bad of ["", "./relative.mjs", "https://example.com/refclone.mjs"]) {
    assert.throws(() => resolveRefcloneModuleUrl(bad), /absolute file path/);
  }
  let imported = "";
  const adapter: RefcloneAdapter = { inspectReference: async () => null, compileAndConverge: async () => null };
  assert.equal(await loadRefcloneModule(fixturePath, async url => { imported = url; return adapter; }), adapter);
  assert.equal(imported, pathToFileURL(fixturePath).href);
  for (const invalid of [null, {}, { default: adapter }, { inspectReference: () => null }]) {
    await assert.rejects(loadRefcloneModule(fixturePath, async () => invalid), /must export/);
  }
});

test("real in-process dynamic import dispatches the named fixture exports without spawning", async () => {
  const previous = process.env.REFCLONE_MODULE_PATH;
  process.env.REFCLONE_MODULE_PATH = fixturePath;
  const session = await connected();
  try {
    const result = await session.call("refclone_inspect_reference", { videoPath: "reference.mp4" });
    assert.equal(result.isError, undefined);
    assert.deepEqual(payload(result), { ok: true, method: "inspectReference", args: { videoPath: "reference.mp4" }, liveState: "unknown" });
    const blocked = await session.call("refclone_compile_and_converge", { beatSpec: {} });
    assert.equal(blocked.isError, true);
    assert.equal(payload(blocked).method, "compileAndConverge");
  } finally {
    await session.close();
    if (previous === undefined) delete process.env.REFCLONE_MODULE_PATH;
    else process.env.REFCLONE_MODULE_PATH = previous;
  }
});

test("listing/signatures never load refclone; inspect and compile forward exact arguments", async () => {
  let loads = 0;
  const calls: unknown[] = [];
  const session = await connected({ loadRefclone: async () => {
    loads++;
    return {
      inspectReference: async args => { calls.push(["inspect", args]); return { evidence: [1, 2] }; },
      compileAndConverge: async args => { calls.push(["compile", args]); return { ok: true, converged: true }; },
    };
  } });
  try {
    const tools = (await session.client.listTools()).tools;
    assert.deepEqual(tools.map(tool => tool.name).sort(), ["refclone_compile_and_converge", "refclone_get_preset_signatures", "refclone_inspect_reference"]);
    assert.equal(loads, 0);
    for (const tool of tools) assert.equal(tool.inputSchema.additionalProperties, false);
    const inspect = tools.find(tool => tool.name === "refclone_inspect_reference")!.inputSchema;
    assert.deepEqual(Object.keys(inspect.properties!).sort(), ["endSec", "fps", "outputDir", "startSec", "videoPath"]);
    assert.deepEqual(inspect.required, ["videoPath"]);
    const compile = tools.find(tool => tool.name === "refclone_compile_and_converge")!.inputSchema;
    assert.deepEqual(Object.keys(compile.properties!).sort(), ["beatSpec", "maxIterations", "outputDir"]);
    assert.deepEqual(compile.required, ["beatSpec"]);
    await session.call("refclone_get_preset_signatures", { packNames: ["typography"] });
    assert.equal(loads, 0);
    const inspectionArgs = { videoPath: "C:/references/demo.mp4", startSec: 0, endSec: 4, fps: 12, outputDir: "C:/out" };
    assert.deepEqual(payload(await session.call("refclone_inspect_reference", inspectionArgs)), { evidence: [1, 2] });
    const compilationArgs = { beatSpec: { beats: [{ id: "hero", params: { label: "hi" } }] }, outputDir: "C:/out", maxIterations: 8 };
    assert.equal(payload(await session.call("refclone_compile_and_converge", compilationArgs)).converged, true);
    assert.deepEqual(calls, [["inspect", inspectionArgs], ["compile", compilationArgs]]);
    assert.equal(loads, 2);
  } finally { await session.close(); }
});

test("strict tool schemas reject malformed input before loading an adapter", async () => {
  let loads = 0;
  const session = await connected({ loadRefclone: async () => { loads++; throw new Error("unexpected load"); } });
  try {
    const invalidInspections = [
      {}, { videoPath: 3 }, { videoPath: "" }, { videoPath: "x", startSec: -1 },
      { videoPath: "x", endSec: 0 }, { videoPath: "x", startSec: 2, endSec: 1 },
      { videoPath: "x", fps: 0 }, { videoPath: "x", fps: -1 }, { videoPath: "x", code: "evil" },
    ];
    for (const args of invalidInspections) assert.equal((await session.call("refclone_inspect_reference", args)).isError, true);
    for (const args of [
      {}, { beatSpec: [] }, { beatSpec: "JS" }, { beatSpec: {}, maxIterations: 0 },
      { beatSpec: {}, maxIterations: 9 }, { beatSpec: {}, maxIterations: 1.5 }, { beatSpec: {}, script: "evil" },
    ]) assert.equal((await session.call("refclone_compile_and_converge", args)).isError, true);
    for (const args of [{ packNames: "typography" }, { packNames: Array(15).fill("typography") }, { packNames: [], code: "evil" }]) {
      assert.equal((await session.call("refclone_get_preset_signatures", args)).isError, true);
    }
    assert.equal(loads, 0);
  } finally { await session.close(); }
});

test("BeatSpec reaches refclone strict validation intact, including forbidden raw code", async () => {
  const seen: unknown[] = [];
  const strictBeatSpec = z.strictObject({ beats: z.array(z.strictObject({ presetId: z.string() })) });
  const session = await connected({ loadRefclone: async () => ({
    inspectReference: async () => null,
    compileAndConverge: async args => {
      seen.push(args.beatSpec);
      strictBeatSpec.parse(args.beatSpec); // Models the upstream policy boundary, not a local compiler.
      return { ok: true };
    },
  }) });
  try {
    for (const beatSpec of [
      { beats: [], code: "api.deleteLayer('x')" },
      { beats: [], script: "raw JS" },
      { beats: [{ presetId: "kinetic_text", code: "raw JS" }] },
      { beats: [], ops: [{ op: "rawScript", script: "raw JS" }] },
    ]) {
      const result = await session.call("refclone_compile_and_converge", { beatSpec });
      assert.equal(result.isError, true);
      assert.deepEqual(seen.at(-1), beatSpec, "no forbidden property may be silently stripped");
      assert.equal(payload(result).liveState, "unknown");
    }
  } finally { await session.close(); }
});

test("failure, blocked and thrown outcomes are MCP errors without invented live success", async () => {
  let outcome: JsonValue = null;
  let thrown: Error | undefined;
  const session = await connected({ loadRefclone: async () => ({
    inspectReference: async () => { if (thrown) throw thrown; return outcome; },
    compileAndConverge: async () => { if (thrown) throw thrown; return outcome; },
  }) });
  try {
    for (const [tool, args] of [
      ["refclone_inspect_reference", { videoPath: "x" }],
      ["refclone_compile_and_converge", { beatSpec: {} }],
    ] as const) {
      for (const failed of [{ ok: false }, { success: false }, { blocked: true }, { ok: true, status: "blocked" }, { status: "failed" }, { isError: true }]) {
        outcome = failed;
        const result = await session.call(tool, args);
        assert.equal(result.isError, true);
        assert.deepEqual(payload(result), failed);
      }
      thrown = new Error("host state unavailable");
      const result = await session.call(tool, args);
      assert.equal(result.isError, true);
      assert.deepEqual(payload(result), { ok: false, error: "host state unavailable", liveState: "unknown" });
      thrown = undefined;
    }
  } finally { await session.close(); }
});

test("missing module is deferred until invocation and returns an honest error", async () => {
  const missing = fileURLToPath(new URL("../helpers/nonexistent-refclone.mjs", import.meta.url));
  const session = await connected({ loadRefclone: () => loadRefcloneModule(missing) });
  try {
    assert.equal((await session.client.listTools()).tools.length, 3);
    assert.deepEqual(payload(await session.call("refclone_get_preset_signatures", { packNames: [] })), { packs: [] });
    const result = await session.call("refclone_inspect_reference", { videoPath: "x" });
    assert.equal(result.isError, true);
    assert.equal(payload(result).liveState, "unknown");
    assert.match(payload(result).error, /Cannot find module|ERR_MODULE_NOT_FOUND/);
  } finally { await session.close(); }
});

test("signatures contain only requested exact pack IDs, all metadata and no script bodies", async () => {
  const session = await connected({ loadRefclone: async () => { throw new Error("must not load"); } });
  try {
    assert.deepEqual(getPresetSignatures([]), { packs: [] });
    assert.deepEqual(getPresetSignatures(["data_viz", "typography", "data_viz"]).packs.map(pack => pack.id), ["data_viz", "typography"]);
    for (const pack of PRESET_PACKS) {
      const result = await session.call("refclone_get_preset_signatures", { packNames: [pack.id] });
      assert.equal(result.isError, undefined);
      const expected = { packs: [{ id: pack.id, name: pack.name, presets: pack.presets.map(def => ({ id: def.id, description: def.description, params: def.params })) }] };
      assert.deepEqual(payload(result), expected);
      // A legitimate OTP parameter is named "code"; inspect fields, not a text
      // substring that confuses a parameter name with an executable body.
      for (const signature of payload(result).packs[0].presets) {
        assert.equal(signature.code, undefined);
        assert.equal(signature.script, undefined);
        assert.equal(signature.body, undefined);
        for (const param of Object.values(signature.params)) {
          assert.deepEqual(Object.keys(param).filter(key => !["type", "default", "description"].includes(key)), []);
        }
      }
    }
    const all = getPresetSignatures(PRESET_PACKS.map(pack => pack.id));
    assert.equal(all.packs.length, 14);
    assert.equal(all.packs.flatMap(pack => pack.presets).length, 120);
    for (const invalid of ["unknown", "1", "Typography", "cat01_typography"]) {
      const result = await session.call("refclone_get_preset_signatures", { packNames: ["typography", invalid] });
      assert.equal(result.isError, true);
      assert.match(payload(result).error, /Unknown preset pack/);
      assert.equal(payload(result).packs, undefined);
    }
  } finally { await session.close(); }
});
