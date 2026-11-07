/**
 * `--strict-dsl` surface contract: exactly four tools, validator wired into
 * execution, /batch_inspect summarization, and the refclone beat bridge.
 *
 * Runs against the same in-process lightweight mock the core suite uses; the
 * v0.11 kinds are synthesized deterministically from the mock scene state.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { startMockStallion, type MockApiState } from "../helpers/mockStallion.js";

const mock = await startMockStallion({ native: true });
const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "cav-strict-"));
process.env.STALLION_URL = `http://127.0.0.1:${mock.port}`;
delete process.env.CAVALRY_MCP_LEGACY_CRUD;
delete process.env.ENABLE_LEGACY_TOOLS;
// The strict surface is selected before the server module is evaluated.
process.env.CAVALRY_MCP_STRICT_DSL = "1";
const { server } = await import("../../src/index.js");
const [clientToServer, serverToClient] = InMemoryTransport.createLinkedPair();
await server.connect(serverToClient);
const client = new Client({ name: "strict-test", version: "0.0.0" });
await client.connect(clientToServer);

test.after(async () => {
  await client.close();
  await server.close();
  await mock.close();
  delete process.env.CAVALRY_MCP_STRICT_DSL;
  removeTreeSync(workdir);
});

// Local import must come after the mock env is in place; keep the helper here.
import { removeTreeSync } from "../../src/shared/fs-safe.js";

interface ToolResult { isError?: boolean; content: Array<{ type: string; text?: string }> }
async function call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  return await client.callTool({ name, arguments: args }) as unknown as ToolResult;
}
function payload(result: ToolResult): Record<string, unknown> {
  assert.equal(result.isError, undefined, `tool errored: ${result.content.map(item => item.text ?? "").join("\n")}`);
  return JSON.parse(result.content.map(item => item.text ?? "").join("\n"));
}

test("the strict surface is EXACTLY the four zero-slop tools", async () => {
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map(tool => tool.name).sort(), [
    "cavalry_clone_beat",
    "cavalry_exec_mg",
    "cavalry_inspect_rig",
    "cavalry_query_presets",
  ]);
});

test("cavalry_exec_mg validates, normalizes aliases and reports its fixes", async () => {
  const result = await call("cavalry_exec_mg", {
    manifest: {
      comp: { width: 1920, height: 1080, fps: 60, endFrame: 180 },
      layers: [{ as: "$card", kind: "shape", shape: "rectangle", attrs: { fillColor: "#204fe0", pos: [240, 135] } }],
      ops: [{ op: "set", target: "$card", attrs: { alpha: 0.9 } }],
    },
    sampleFrames: [0],
  });
  const body = payload(result);
  assert.equal(body.ok, true);
  const fixes = body.fixes as Array<{ from: string; to: string }>;
  assert.deepEqual(fixes.map(fix => fix.to).sort(), ["material.fillColor", "opacity", "position"]);
});

test("cavalry_exec_mg rejects an unknown preset id with top-3 suggestions", async () => {
  const result = await call("cavalry_exec_mg", {
    manifest: { presets: [{ id: "counter_sprng_cout" }] },
  });
  assert.equal(result.isError, true);
  const body = JSON.parse(result.content[0].text ?? "{}");
  assert.equal(body.stage, "validation");
  assert.ok(Array.isArray(body.presetSuggestions) && body.presetSuggestions.length >= 1);
});

test("cavalry_query_presets returns compact signatures with required params", async () => {
  const result = await call("cavalry_query_presets", { query: "counter" });
  const body = payload(result);
  assert.ok(Number(body.total) >= 120);
  assert.ok(Number(body.matched) >= 1);
  const first = (body.presets as Array<Record<string, unknown>>)[0];
  assert.ok(first.id && typeof first.motionSignature === "string");
  assert.ok(Array.isArray(first.requiredParams));
});

test("cavalry_inspect_rig summarizes the bbox trajectory from /batch_inspect", async () => {
  // Seed the mock scene: a layer moving 0 -> 200 across frames 0..24.
  const state = mock.state as MockApiState;
  const layerId = `shape#inspect-${Date.now().toString(36)}`;
  state.layers.set(layerId, { type: "rectangle", name: "card", attrs: { "generator.dimensions": [200, 100], position: [0, -50] } });
  state.keyframes.push({ layerId, frame: 0, attributes: { "position.x": 0 } });
  state.keyframes.push({ layerId, frame: 24, attributes: { "position.x": 200 } });

  const result = await call("cavalry_inspect_rig", { frames: [0, 12, 24], layerIds: [layerId] });
  const body = payload(result);
  assert.equal(body.ok, true);
  assert.equal(body.compFrameRate, 60);
  assert.deepEqual(body.compResolution, [1920, 1080]);
  const layer = (body.layers as Record<string, Record<string, unknown>>)[layerId];
  assert.ok(layer, "the measured layer is summarized");
  const trajectory = layer.trajectory as Array<{ f: number; cx: number }>;
  assert.equal(trajectory.length, 3);
  assert.equal(trajectory[0].cx, 0);
  assert.equal(trajectory[1].cx, 100);
  assert.equal(trajectory[2].cx, 200);
  const drift = layer.drift as { dx: number; dy: number };
  assert.equal(drift.dx, 200);
});

// The clone_beat tests run the real sibling refclone checkout; cavalry-mcp's
// own CI checks out only this repo, so there they skip deterministically (in
// refclone's CI and any local sibling layout they run for real).
const refcloneCandidates = [
  process.env.CAVALRY_REFCLONE_PATH,
  path.resolve(import.meta.dirname, "..", "..", "..", "refclone", "src", "cli.mjs"),
].filter((candidate): candidate is string => Boolean(candidate));
const refcloneAvailable = refcloneCandidates.some((candidate) => fs.existsSync(candidate));

test("cavalry_clone_beat reports the deterministic blocked outcome without an LLM hook", { skip: !refcloneAvailable && "sibling refclone checkout not available in this CI layout" }, async () => {
  // The real sibling checkout runs `zero-slop` with a plan that has no
  // manifest and no llm hook: the honest outcome is a blocked telemetry with
  // zero LLM calls — never a fabricated rig.
  const planPath = path.join(workdir, "beat-plan.json");
  fs.writeFileSync(planPath, JSON.stringify({ tracks: [], crops: [], elements: [], sampleFrames: [0] }));
  const result = await call("cavalry_clone_beat", { planPath });
  const body = payload(result);
  assert.equal(body.blocked, true);
  assert.equal(body.reason, "no manifest and no LLM hook: Stage 2 cannot synthesize a rig");
  assert.deepEqual(body.llmCalls, []);
  assert.ok(typeof body.durationMs === "number");
});

test("cavalry_clone_beat requires a plan (validated before the CLI is resolved)", async () => {
  const result = await call("cavalry_clone_beat", {});
  assert.equal(result.isError, true);
  const body = JSON.parse(result.content[0].text ?? "{}");
  assert.match(String(body.error), /plan/);
});
