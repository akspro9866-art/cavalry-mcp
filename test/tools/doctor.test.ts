/**
 * cavalry_doctor — the one tool whose job is to say whether the other tools can
 * work. Tests here point it at the headless mock bridge (so the bridge and runtime
 * checks have a real answer to find), at a closed port (so the failure path is a
 * message and not a hang), and with the binaries reported as data rather than
 * asserted as present, because CI runners do not all install ffmpeg.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { startMockStallion } from "../helpers/mockStallion.js";

const mock = await startMockStallion({ native: true });
process.env.STALLION_URL = `http://127.0.0.1:${mock.port}`;
delete process.env.ENABLE_LEGACY_TOOLS;

const { runDoctor, formatDoctorReport, matchesExpectedVersion } = await import("../../src/tools/doctor.js");
// These tests exercise the granular CRUD surface, which the compact 3-tool
// default hides: opt in before the server module is evaluated.
process.env.CAVALRY_MCP_LEGACY_CRUD = "1";
const { server } = await import("../../src/index.js");
const [clientToServer, serverToClient] = InMemoryTransport.createLinkedPair();
await server.connect(serverToClient);
const client = new Client({ name: "doctor-test", version: "0.0.0" });
await client.connect(clientToServer);

test.after(async () => {
  await client.close();
  await server.close();
  await mock.close();
});

type Check = { name: string; status: string; detail: string; ms?: number; hint?: string };
const checkOf = (checks: Check[], name: string): Check => {
  const found = checks.find(entry => entry.name === name);
  assert.ok(found, `no ${name} check in ${JSON.stringify(checks.map(c => c.name))}`);
  return found!;
};

/** A port nothing is listening on, obtained the boring way: bind, read, close. */
async function closedPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as net.AddressInfo;
  await new Promise<void>(resolve => server.close(() => resolve()));
  return port;
}

test("doctor is registered with a described schema", async () => {
  const listed = await client.listTools();
  const doctor = listed.tools.find(tool => tool.name === "cavalry_doctor");
  assert.ok(doctor, "cavalry_doctor is missing from the tool list");
  assert.ok((doctor!.description ?? "").trim().split(/\s+/).length < 40, "description is too long");
  const props = doctor!.inputSchema.properties as Record<string, { description?: string }>;
  for (const key of ["timeoutMs", "probeRuntime", "expectedVersion", "format"]) {
    assert.ok(props[key], `missing parameter ${key}`);
    assert.ok((props[key]?.description ?? "").length > 20, `${key} has no useful description`);
  }
});

test("against a live bridge every check answers", async () => {
  const report = await runDoctor({ timeoutMs: 4000 });
  // `ok` is derived from the checks, so it is asserted as a relationship rather
  // than as a constant: a runner without ffmpeg installed is a real failure, and
  // the doctor must say so instead of grading on a curve.
  assert.equal(report.ok, !report.checks.some(check => check.status === "fail"));
  assert.equal(report.bridge.reachable, true);
  assert.equal(report.bridge.statusRead, true);
  assert.equal(report.bridge.cavalry, "2.8.0");

  const bridge = checkOf(report.checks, "bridge");
  assert.equal(bridge.status, "ok");
  assert.equal(typeof bridge.ms, "number");
  // Latency is reported even when it is fine: "reachable" and "reachable in 4 s"
  // are different problems upstream.
  assert.match(bridge.detail, /\d+ ms/);

  const runtime = checkOf(report.checks, "runtime");
  assert.equal(runtime.status, "ok");
  assert.equal(report.runtime.ready, true);
  assert.equal(report.runtime.version, "2.8.0");

  for (const name of ["ffmpeg", "ffprobe"]) {
    const entry = checkOf(report.checks, name);
    assert.ok(["ok", "fail"].includes(entry.status), `${name} should not be ambiguous: ${entry.status}`);
    const binary = report.binaries[name as keyof typeof report.binaries] as { available: boolean };
    assert.equal(binary.available, entry.status === "ok");
  }
  assert.equal(checkOf(report.checks, "workspace").status, "ok");
  assert.ok(Date.parse(report.generatedAt) > 0);
});

test("probeRuntime:false keeps the call network-and-binaries only", async () => {
  const report = await runDoctor({ probeRuntime: false });
  const runtime = checkOf(report.checks, "runtime");
  assert.equal(runtime.status, "skipped");
  assert.match(runtime.detail, /disabled/);
  assert.equal(report.runtime.ready, false);
  assert.equal(checkOf(report.checks, "bridge").status, "ok");
});

test("a closed port fails loudly, quickly and with a fix", async () => {
  const port = await closedPort();
  const started = Date.now();
  const report = await runDoctor({ url: `http://127.0.0.1:${port}`, timeoutMs: 1500 });
  assert.ok(Date.now() - started < 8000, "doctor must not hang on a dead bridge");
  assert.equal(report.ok, false);
  assert.equal(report.bridge.reachable, false);
  const bridge = checkOf(report.checks, "bridge");
  assert.equal(bridge.status, "fail");
  assert.match(bridge.hint ?? "", /Scripts > Stallion/);
  assert.equal(checkOf(report.checks, "runtime").status, "skipped");
  assert.ok(report.nextSteps.length > 0);
  assert.match(report.summary, /blocking/);
});

test("a version mismatch is a warning with the diff stated", async () => {
  const report = await runDoctor({ expectedVersion: "3.5" });
  const runtime = checkOf(report.checks, "runtime");
  assert.equal(runtime.status, "warn");
  assert.match(runtime.detail, /2\.8\.0/);
  assert.match(runtime.detail, /3\.5/);
  // A warning alone must not make the report a failure.
  assert.equal(report.ok, !report.checks.some(check => check.status === "fail"));
  assert.equal(report.checks.filter(check => check.status === "warn").length >= 1, true);
});

test("the text rendering is one line per check plus fixes", async () => {
  const report = await runDoctor({ url: `http://127.0.0.1:${await closedPort()}`, timeoutMs: 1200 });
  const text = formatDoctorReport(report);
  assert.match(text, /^cavalry_doctor — not ready/);
  for (const check of report.checks) {
    assert.ok(text.includes(check.name), `line for ${check.name} missing`);
  }
  assert.match(text, /FAIL bridge/);
  assert.match(text, /→ Start Cavalry/);
});

test("cavalry_doctor answers through the MCP surface", async () => {
  const res = (await client.callTool({ name: "cavalry_doctor", arguments: { format: "json" } })) as unknown as {
    isError?: boolean;
    content: Array<{ text?: string }>;
  };
  const payload = JSON.parse(res.content.map(item => item.text ?? "").join("\n")) as Awaited<ReturnType<typeof runDoctor>>;
  assert.equal(payload.bridge.reachable, true);
  assert.ok(Array.isArray(payload.checks));
  const text = (await client.callTool({ name: "cavalry_doctor", arguments: {} })) as unknown as { content: Array<{ text?: string }> };
  assert.match(text.content[0].text ?? "", /^cavalry_doctor — /);
});

test("version comparison tolerates build suffixes", () => {
  assert.equal(matchesExpectedVersion("2.8.0", "2.8"), true);
  assert.equal(matchesExpectedVersion("2.8.4-beta.1", "2.8"), true);
  assert.equal(matchesExpectedVersion("2.7.1", "2.8"), false);
  assert.equal(matchesExpectedVersion("3.0.0", "2.8"), false);
  assert.equal(matchesExpectedVersion("", "2.8"), false);
  assert.equal(matchesExpectedVersion("2.8", ""), false);
});
