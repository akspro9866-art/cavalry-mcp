import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runScriptWithResult, sendToCavalry, type StallionConfig } from "../src/stallion.js";
import { parseOutcome } from "../src/lib.js";
import { startMockStallion } from "./helpers/mockStallion.js";

function tmpResultPath(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cav-test-")), "result.json");
}

function configFor(port: number, resultPath: string, overrides: Partial<StallionConfig> = {}): StallionConfig {
  return {
    url: `http://127.0.0.1:${port}`,
    host: "127.0.0.1",
    port,
    token: "",
    httpTimeoutMs: 2000,
    resultTimeoutMs: 3000,
    resultPath,
    ...overrides,
  };
}

test("round trip: __result comes back through the result file with seq matching", async () => {
  const mock = await startMockStallion();
  try {
    const cfg = configFor(mock.port, tmpResultPath());
    const raw = await runScriptWithResult(`__result = 6 * 7;`, cfg);
    const o = parseOutcome(raw);
    assert.equal(o.ok, true);
    assert.equal(o.text, "42");
  } finally {
    await mock.close();
  }
});

test("native Stallion protocol returns seq-matched structured results", async () => {
  const mock = await startMockStallion({ native: true });
  try {
    const cfg = configFor(mock.port, tmpResultPath());
    const raw = await runScriptWithResult(`return _mg.text("Hi", 42);`, cfg, { helpers: true });
    const outcome = parseOutcome(raw);
    assert.equal(outcome.ok, true);
    assert.match(outcome.text, /textShape#/);
    assert.equal(mock.state.order[0], "startUndo:AI Motion Batch");
    assert.equal(mock.state.order.at(-1), "endUndo");
  } finally {
    await mock.close();
  }
});

test("stale result file with a different seq is ignored (exact seq matching)", async () => {
  const mock = await startMockStallion();
  try {
    const resultPath = tmpResultPath();
    // a previous call's leftover result, with a plausible-but-wrong seq
    fs.writeFileSync(resultPath, JSON.stringify({ ok: true, seq: "not-our-seq", result: "STALE" }));
    const cfg = configFor(mock.port, resultPath);
    const raw = await runScriptWithResult(`__result = "FRESH";`, cfg);
    const o = parseOutcome(raw);
    assert.equal(o.ok, true);
    assert.equal(o.text, "FRESH");
  } finally {
    await mock.close();
  }
});

test("script exceptions are captured as ok:false", async () => {
  const mock = await startMockStallion();
  try {
    const cfg = configFor(mock.port, tmpResultPath());
    const raw = await runScriptWithResult(`throw new Error("boom from cavalry");`, cfg);
    const o = parseOutcome(raw);
    assert.equal(o.ok, false);
    assert.match(o.text, /boom from cavalry/);
  } finally {
    await mock.close();
  }
});

test("if the first writeToFile fails, the minimal writeFailed payload still reaches the node side", async () => {
  let failedOnce = false;
  const resultPath = tmpResultPath();
  const mock = await startMockStallion({
    writeToFile: (filePath, content) => {
      // Telemetry writes to its own state file; this test simulates the
      // result-file write failing, not every filesystem write.
      if (!failedOnce && filePath === resultPath) {
        failedOnce = true;
        throw new Error("disk full");
      }
      fs.writeFileSync(filePath, content);
      return true;
    },
  });
  try {
    const cfg = configFor(mock.port, resultPath);
    const raw = await runScriptWithResult(`__result = "x";`, cfg);
    const o = parseOutcome(raw);
    assert.equal(o.ok, false);
    assert.match(o.text, /disk full/);
  } finally {
    await mock.close();
  }
});

test("concurrent calls are serialized and each gets its own result", async () => {
  const mock = await startMockStallion();
  try {
    const cfg = configFor(mock.port, tmpResultPath());
    const [a, b, c] = await Promise.all([
      runScriptWithResult(`api.__order("a"); __result = "A";`, cfg),
      runScriptWithResult(`api.__order("b"); __result = "B";`, cfg),
      runScriptWithResult(`api.__order("c"); __result = "C";`, cfg),
    ]);
    assert.deepEqual(mock.state.order.filter(step => ["a", "b", "c"].includes(step)), ["a", "b", "c"]);
    assert.equal(parseOutcome(a).text, "A");
    assert.equal(parseOutcome(b).text, "B");
    assert.equal(parseOutcome(c).text, "C");
  } finally {
    await mock.close();
  }
});

test("no result written before the deadline resolves empty (bounded wait)", async () => {
  const mock = await startMockStallion({
    writeToFile: () => {
      throw new Error("permanently broken");
    },
  });
  try {
    const cfg = configFor(mock.port, tmpResultPath(), { resultTimeoutMs: 400 });
    const raw = await runScriptWithResult(`__result = "never written";`, cfg);
    assert.equal(raw, "");
    assert.equal(parseOutcome(raw).ok, false);
  } finally {
    await mock.close();
  }
});

test("unreachable Stallion produces the friendly connection error", async () => {
  // port with nothing listening: find one by binding and closing
  const net = await import("node:net");
  const probe = net.createServer();
  const freePort: number = await new Promise((res) => {
    probe.listen(0, "127.0.0.1", () => {
      const p = (probe.address() as { port: number }).port;
      probe.close(() => res(p));
    });
  });
  await assert.rejects(
    sendToCavalry(`__result = 1;`, "script", configFor(freePort, tmpResultPath())),
    /Cannot reach Stallion/,
  );
});

test("config: per-process default result path and split timeouts (with legacy fallback)", async () => {
  const { loadConfig } = await import("../src/stallion.js");
  const saved = { ...process.env };
  try {
    delete process.env.CAVALRY_RESULT_PATH;
    delete process.env.CAVALRY_HTTP_TIMEOUT_MS;
    delete process.env.CAVALRY_RESULT_TIMEOUT_MS;
    delete process.env.CAVALRY_TIMEOUT_MS;
    let cfg = loadConfig();
    assert.match(cfg.resultPath, new RegExp(`cavalry-mcp-result-${process.pid}\\.json$`));
    assert.equal(cfg.httpTimeoutMs, 5000);
    assert.equal(cfg.resultTimeoutMs, 5000);

    process.env.CAVALRY_HTTP_TIMEOUT_MS = "1500";
    process.env.CAVALRY_RESULT_TIMEOUT_MS = "90000";
    cfg = loadConfig();
    assert.equal(cfg.httpTimeoutMs, 1500);
    assert.equal(cfg.resultTimeoutMs, 90000);

    // legacy single knob sets both when the split knobs are absent
    delete process.env.CAVALRY_HTTP_TIMEOUT_MS;
    delete process.env.CAVALRY_RESULT_TIMEOUT_MS;
    process.env.CAVALRY_TIMEOUT_MS = "7777";
    cfg = loadConfig();
    assert.equal(cfg.httpTimeoutMs, 7777);
    assert.equal(cfg.resultTimeoutMs, 7777);
  } finally {
    Object.assign(process.env, saved);
    delete process.env.CAVALRY_TIMEOUT_MS;
  }
});
