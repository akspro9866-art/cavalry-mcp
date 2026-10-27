import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { startMockStallion } from "./helpers/mockStallion.js";
import type { StallionConfig } from "../src/stallion.js";
import { readExecutionState, formatExecutionState } from "../src/state.js";
import { parseOutcome } from "../src/lib.js";

const exec = promisify(execFile);
const mock = await startMockStallion({ native: true });
const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "cav-telemetry-"));
const statePath = path.join(workdir, "state.json");
process.env.STALLION_URL = `http://127.0.0.1:${mock.port}`;
process.env.CAVALRY_STATE_PATH = statePath;
delete process.env.ENABLE_LEGACY_TOOLS;
// Load stallion only after STALLION_URL points at the mock: its module-level
// CONFIG must never resolve to a live bridge on 127.0.0.1:8080.
const { runScriptWithExecution } = await import("../src/stallion.js");
const { server } = await import("../src/index.js");
const [clientToServer, serverToClient] = InMemoryTransport.createLinkedPair();
await server.connect(serverToClient);
const client = new Client({ name: "telemetry-test", version: "0.0.0" });
await client.connect(clientToServer);

const config: StallionConfig = {
  url: `http://127.0.0.1:${mock.port}`,
  host: "127.0.0.1",
  port: mock.port,
  token: "",
  httpTimeoutMs: 2000,
  resultTimeoutMs: 3000,
  resultPath: path.join(workdir, "result.json"),
  statePath,
};

test.after(async () => {
  await client.close();
  await server.close();
  await mock.close();
  fs.rmSync(workdir, { recursive: true, force: true });
});

interface ToolResult {
  isError?: boolean;
  content: Array<{ type: string; text?: string }>;
  _meta?: { telemetry?: Record<string, unknown> };
}

async function call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  return await client.callTool({ name, arguments: args }) as unknown as ToolResult;
}

test("state file captures status, created ids, comp info and bounding boxes after Undo", async () => {
  const execution = await runScriptWithExecution(
    `const rect = _mg.shape("rectangle", "State Rect", { "position.x": 100, "position.y": 50 }); api.select([rect]); return { rect };`,
    config,
    { helpers: true },
  );
  const outcome = parseOutcome(execution.raw);
  assert.equal(outcome.ok, true, outcome.text);
  assert.ok(execution.state, "state snapshot present");
  const state = execution.state!;
  assert.equal(state.seq, execution.seq);
  assert.equal(state.status, "ok");
  assert.deepEqual(state.activeSelection.length, 1);
  const created = state.createdLayerIds[0];
  assert.match(created, /basicShape#/);
  assert.equal(state.activeSelection[0], created);
  assert.ok(state.boundingBoxes[created], "created layer bbox");
  assert.equal(state.boundingBoxes[created].width, 100);
  assert.equal(state.compInfo?.fps, 60);
  assert.deepEqual(state.compInfo?.resolution, [1920, 1080]);
  assert.equal(state.compInfo?.startFrame, 0);
  assert.equal(state.compInfo?.endFrame, 60);
  assert.match(formatExecutionState(state), /OK.*created|OK.*bbox/i);

  // The state file itself is seq-matched and readable by path.
  assert.deepEqual(readExecutionState(statePath, execution.seq)?.createdLayerIds, [created]);
  assert.equal(readExecutionState(statePath, "another-run"), null);
  assert.equal(mock.state.order[0], "startUndo:AI Motion Batch");
  assert.equal(mock.state.order.at(-1), "endUndo");
});

test("failed scripts still write error telemetry outside the Undo group", async () => {
  const execution = await runScriptWithExecution(`throw new Error("telemetry boom");`, config);
  const outcome = parseOutcome(execution.raw);
  assert.equal(outcome.ok, false);
  assert.match(outcome.text, /telemetry boom/);
  assert.equal(execution.state?.status, "error");
  assert.match(execution.state?.errorStack ?? "", /telemetry boom/);
  assert.equal(mock.state.order.at(-1), "endUndo");
});

test("legacy result-file protocol also carries the state file", async () => {
  const legacy = await startMockStallion();
  try {
    const legacyConfig: StallionConfig = {
      ...config,
      port: legacy.port,
      url: `http://127.0.0.1:${legacy.port}`,
      resultPath: path.join(workdir, "legacy-result.json"),
      statePath: path.join(workdir, "legacy-state.json"),
    };
    const execution = await runScriptWithExecution(
      `const id = _mg.layer("null", "Legacy State"); return id;`,
      legacyConfig,
      { helpers: true },
    );
    assert.equal(parseOutcome(execution.raw).ok, true);
    assert.equal(execution.state?.status, "ok");
    assert.equal(execution.state?.createdLayerIds.length, 1);
    assert.ok(readExecutionState(legacyConfig.statePath!, execution.seq));
  } finally {
    await legacy.close();
  }
});

test("MCP results expose telemetry in _meta without changing the text payload", async () => {
  const res = await call("cavalry_run_script", {
    code: `const id = _mg.shape("ellipse", "Meta Ellipse"); return { id };`,
  });
  assert.equal(res.isError, undefined);
  const text = res.content.map((c) => c.text ?? "").join("\n");
  const parsed = JSON.parse(text) as { id: string };
  assert.match(parsed.id, /basicShape#/);
  assert.ok(res._meta?.telemetry, "telemetry meta present");
  const telemetry = res._meta!.telemetry as {
    status: string;
    createdLayerIds: string[];
    compInfo?: { resolution?: number[] };
  };
  assert.equal(telemetry.status, "ok");
  assert.ok(telemetry.createdLayerIds.includes(parsed.id));
  assert.deepEqual(telemetry.compInfo?.resolution, [1920, 1080]);
});

test("CLI --state reports the same snapshot on stderr", async () => {
  const cli = path.resolve("bin/stallion-cli.mjs");
  const env = {
    ...process.env,
    STALLION_URL: `http://127.0.0.1:${mock.port}`,
    CAVALRY_STATE_PATH: statePath,
  };
  const { stdout, stderr } = await exec(
    process.execPath,
    [cli, "-e", `const id = _mg.layer("null", "CLI State"); return id;`, "--state"],
    { env },
  );
  assert.match(stdout, /null#/);
  const snapshot = JSON.parse(stderr) as { status: string; createdLayerIds: string[] };
  assert.equal(snapshot.status, "ok");
  assert.ok(snapshot.createdLayerIds.length >= 1);
});
