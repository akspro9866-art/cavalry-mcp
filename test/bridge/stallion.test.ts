import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import {
  CAVALRY_EXECUTION_CONTEXTS,
  CONTEXT_GLOBALS_BY_CONTEXT,
  EXPRESSION_PAYLOAD_TYPES,
  captureJsLogDiagnostics,
  executeExpressionPayload,
  isExpressionPayloadType,
  payloadTypeToExecutionContext,
  runScriptWithResult,
  sendToCavalry,
  validateCavalryContextUsage,
  validateSkslSource,
  type StallionConfig,
} from "../../src/bridge/stallion.js";
import { parseOutcome } from "../../src/shared/lib.js";
import { startMockStallion } from "../helpers/mockStallion.js";

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
  const { loadConfig } = await import("../../src/bridge/stallion.js");
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

test("Phase 2: 8 Cavalry execution contexts and context-scoped global validation", () => {
  assert.deepEqual([...CAVALRY_EXECUTION_CONTEXTS], [
    "script",
    "plugin",
    "render",
    "shape",
    "utility",
    "deformer",
    "emitter",
    "modifier",
  ]);
  assert.ok(CONTEXT_GLOBALS_BY_CONTEXT.deformer.includes("def"));
  assert.ok(CONTEXT_GLOBALS_BY_CONTEXT.render.includes("render"));
  assert.ok(CONTEXT_GLOBALS_BY_CONTEXT.plugin.includes("install"));

  const okDeformer = validateCavalryContextUsage("var pts = def.getPoints(); return pts;", "javaScriptDeformer");
  assert.equal(okDeformer.valid, true);
  assert.equal(okDeformer.context, "deformer");

  const badUtility = validateCavalryContextUsage("api.create('basicShape'); ui.show();", "javaScriptUtility");
  assert.equal(badUtility.valid, false);
  assert.deepEqual(badUtility.forbiddenUsages, ["api.create", "ui.show"]);
});

test("Phase 2: all 9 expression/shader payload types return seq-matched receipts and capture js_log.txt diagnostics", async () => {
  assert.equal(EXPRESSION_PAYLOAD_TYPES.length, 9);
  for (const pt of EXPRESSION_PAYLOAD_TYPES) {
    assert.equal(isExpressionPayloadType(pt), true);
  }

  const sksl = validateSkslSource("uniform float uTime;\nhalf4 main(float2 fragCoord) { return half4(uTime); }");
  assert.equal(sksl.valid, true);
  assert.deepEqual(sksl.uniforms, [{ type: "float", name: "uTime" }]);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cav-jslog-"));
  const jsLogPath = path.join(tmpDir, "js_log.txt");
  fs.writeFileSync(jsLogPath, "[WARN] Skipped layer 'Title' because it is not of type 'javaScriptShape'\n[ERROR] ReferenceError: bogus is not defined\n");

  const parsedLog = captureJsLogDiagnostics(jsLogPath);
  assert.equal(parsedLog.length, 2);
  assert.equal(parsedLog[0].level, "warn");
  assert.equal(parsedLog[1].level, "error");

  let lastResult: Record<string, unknown> = { kind: "status" };
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/get") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(lastResult));
      return;
    }
    if (req.method === "POST" && req.url === "/post") {
      let body = "";
      req.on("data", (chunk) => { body += String(chunk); });
      req.on("end", () => {
        const parsed = JSON.parse(body) as { type: string; seq: string };
        lastResult = {
          type: "__stallion_result__",
          kind: "result",
          seq: parsed.seq,
          ok: true,
          applied: [`${parsed.type}#1`],
          skipped: [],
          receipt: {
            sceneStateHash: "0123456789abcdef",
            consoleDiagnostics: [],
            jsLogDiagnostics: [],
            beatBBoxes: {},
            payloadType: parsed.type,
            context: payloadTypeToExecutionContext(parsed.type),
            applied: [`${parsed.type}#1`],
            skipped: [],
            valid: true,
          },
        };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const port: number = await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve((server.address() as { port: number }).port);
    });
  });

  try {
    const cfg = configFor(port, tmpResultPath());
    for (const payloadType of EXPRESSION_PAYLOAD_TYPES) {
      const code = payloadType.startsWith("sksl")
        ? "uniform float uTime;\nhalf4 main(float2 fragCoord) { return half4(1.0); }"
        : payloadType.includes("Render")
          ? "console.log(render.frame);"
          : "return ctx.frame;";
      const res = await executeExpressionPayload(payloadType, code, cfg, { jsLogPath });
      assert.equal(res.ok, true);
      assert.deepEqual(res.applied, [`${payloadType}#1`]);
      assert.equal(res.receipt.payloadType, payloadType);
      assert.equal(res.receipt.context, payloadTypeToExecutionContext(payloadType));
      assert.equal(res.receipt.valid, true);
      assert.equal(res.receipt.sceneStateHash, "0123456789abcdef");
      assert.equal(res.receipt.jsLogDiagnostics.length, 2);
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
