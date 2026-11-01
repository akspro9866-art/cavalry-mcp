import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { buildMockApi, createMockApiState } from "./mock-cavalry-api.js";
import type { MockApi } from "./mock-cavalry-api.js";
import { wrapAtomicScript } from "../src/runtime/atomic.js";
import { PROBE_FUNCTIONS, buildProbeScript, normalizeProbe, runProbe } from "../src/probe.js";
import type { ScriptOutcome } from "../src/runtime/execute.js";

const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "cav-probe-"));
test.after(() => fs.rmSync(workdir, { recursive: true, force: true }));

function sandboxExecutor(api: MockApi) {
  return async (code: string): Promise<ScriptOutcome> => {
    const context = vm.createContext({ api, console });
    new vm.Script(wrapAtomicScript(code, false)).runInContext(context);
    return { ok: true, text: JSON.stringify((context as { __result?: unknown }).__result ?? null), state: null };
  };
}

test("probe: defaults, caps and the report target", () => {
  const previous = process.env.CAVALRY_CAPABILITIES_PATH;
  process.env.CAVALRY_CAPABILITIES_PATH = path.join(workdir, "env-capabilities.json");
  try {
    const defaults = normalizeProbe();
    assert.equal(defaults.sampleTypes, true);
    assert.equal(defaults.includeLayerTypes, true);
    assert.equal(defaults.inlineSurface, false);
    assert.deepEqual(defaults.layerIds, []);
    assert.deepEqual(defaults.functions, [...PROBE_FUNCTIONS]);
    assert.equal(defaults.writeFile, process.env.CAVALRY_CAPABILITIES_PATH);
    assert.ok(defaults.functions.includes("getNiceName"), "the trap names are watched");
    assert.ok(defaults.functions.includes("getName"));
  } finally {
    if (previous === undefined) delete process.env.CAVALRY_CAPABILITIES_PATH;
    else process.env.CAVALRY_CAPABILITIES_PATH = previous;
  }

  const capped = normalizeProbe({
    layerIds: Array.from({ length: 40 }, (_, index) => `null#${index}`),
    functions: Array.from({ length: 300 }, (_, index) => `fn${index}`),
  });
  assert.equal(capped.layerIds.length, 20);
  assert.equal(capped.functions.length, 200);
  assert.throws(() => normalizeProbe("nope" as never), /Probe options must be an object/);
});

test("probe: the script asks the live api, not a static list", () => {
  const script = buildProbeScript(
    normalizeProbe({ layerIds: ["textShape#1"], functions: ["getNiceName", "getName"], inlineSurface: true }),
  );
  assert.match(script, /Object\.keys\(api\)\.filter\(\(key\) => typeof api\[key\] === "function"\)/);
  assert.match(script, /capabilities\[name\] = typeof api\[name\] === "function"/);
  assert.match(script, /api\.getAllLayerTypes\(false\)/);
  assert.match(script, /api\.getAttributes\(id\)/);
  assert.match(script, /api\.getName === "function"/);
  assert.match(script, /api\.modifyKeyframeTangent !== "function"/);
  assert.match(script, /"textShape#1"/);
});

test("probe: reports what this build has, writes the full document to disk", async () => {
  const state = createMockApiState();
  const api = buildMockApi(state);
  const layer = api.create("basicShape", "Probe me");
  api.set(layer, { "position.x": 10 });
  api.keyframe(layer, 0, { "position.x": 0 });
  const reportFile = path.join(workdir, "capabilities.json");

  const result = await runProbe(
    { layerIds: [layer, "null#404"], writeFile: reportFile },
    { execute: sandboxExecutor(api) },
  );

  assert.equal(result.file, reportFile);
  assert.equal(result.capabilities.getNiceName, true);
  assert.equal(result.capabilities.getName, false, "api.getName does not exist");
  assert.equal(result.capabilities.modifyKeyframeTangent, false);
  assert.ok(result.present.includes("renderPNGFrame"));
  assert.ok(result.missing.includes("getName"));
  assert.ok(result.warnings.some(warning => /modifyKeyframeTangent is unavailable/.test(warning)));
  assert.ok(result.warnings.some(warning => /not present in this scene: null#404/.test(warning)));
  assert.equal(result.surface, null, "the long list belongs in the file");
  assert.ok(result.apiFunctionCount > 40);
  assert.ok(result.comp.id, "active comp reported");

  const sample = result.attributeSamples.find(entry => entry.id === layer);
  assert.ok(sample, "requested layer sampled");
  assert.equal(sample.type, "basicShape");
  assert.equal(sample.name, "Probe me");
  assert.ok(sample.attributeCount > 0);
  assert.deepEqual(sample.animated, ["position.x"]);
  assert.ok(!("attributes" in sample), "the summary stays token-bounded");

  const report = JSON.parse(fs.readFileSync(reportFile, "utf8")) as {
    surface: string[];
    capabilities: Record<string, boolean>;
    attributeSamples: Array<{ id: string; attributes: string[] }>;
    comp: { name: string | null; width: number | null; fps: number | null };
  };
  assert.ok(report.surface.includes("getAttributes"));
  assert.equal(report.capabilities.getName, false);
  assert.ok(report.attributeSamples.find(entry => entry.id === layer).attributes.length > 0);
  assert.equal(report.comp.name, "Comp 1");
  assert.equal(report.comp.width, 1920);
});

test("probe: inlineSurface returns the whole function list", async () => {
  const api = buildMockApi(createMockApiState());
  const result = await runProbe(
    { inlineSurface: true, writeFile: path.join(workdir, "inline.json"), sampleTypes: false, includeLayerTypes: false },
    { execute: sandboxExecutor(api) },
  );
  assert.ok(Array.isArray(result.surface));
  assert.ok(result.surface.includes("magicEasing"));
  assert.equal(result.layerTypes, null);
});

test("probe: a bridge failure or unparsable answer is an error, not an empty report", async () => {
  const reportFile = path.join(workdir, "never.json");
  await assert.rejects(
    runProbe({ writeFile: reportFile }, { execute: async () => ({ ok: false, text: "Stallion is not running" }) }),
    /API probe failed: Stallion is not running/,
  );
  await assert.rejects(
    runProbe({ writeFile: reportFile }, { execute: async () => ({ ok: true, text: "not json" }) }),
    /API probe returned unparsable data/,
  );
  await assert.rejects(
    runProbe({ writeFile: reportFile }, { execute: async () => ({ ok: true, text: "null" }) }),
    /API probe returned no report/,
  );
  assert.equal(fs.existsSync(reportFile), false);
});

test("probe: a read-only report target still returns the summary", async () => {
  const api = buildMockApi(createMockApiState());
  const result = await runProbe(
    { writeFile: path.join(workdir, "blocked.json") },
    {
      execute: sandboxExecutor(api),
      writeFile: () => {
        throw new Error("EACCES");
      },
    },
  );
  assert.ok(result.warnings.some(warning => /could not be written/.test(warning)));
  assert.ok(result.present.length > 0);
});
