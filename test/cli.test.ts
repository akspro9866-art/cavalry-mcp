import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { startMockStallion } from "./helpers/mockStallion.js";
import { removeTreeSync } from "../src/fs-safe.js";

const exec = promisify(execFile);
const mock = await startMockStallion({ native: true });
const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "stallion-cli-test-"));
const cli = path.resolve("bin/stallion-cli.mjs");
const env = { ...process.env, STALLION_URL: `http://127.0.0.1:${mock.port}` };

test.after(async () => {
  await mock.close();
  removeTreeSync(workdir);
});

test("CLI -e executes inline JavaScript with helpers", async () => {
  const { stdout } = await exec(process.execPath, [cli, "-e", `return _mg.text("CLI", 55);`], { env });
  assert.match(stdout, /textShape#/);
});

test("CLI --sel prints compact selection data", async () => {
  await exec(process.execPath, [cli, "-e", `api.select([_mg.sel() ?? api.getCompLayers(true)[0]]); return _mg.sel();`], { env });
  const { stdout } = await exec(process.execPath, [cli, "--sel"], { env });
  const payload = JSON.parse(stdout);
  assert.equal(payload.mode, "selection");
  assert.ok(Array.isArray(payload.layers));
});

test("CLI -p runs named presets with JSON parameters", async () => {
  const { stdout } = await exec(process.execPath, [cli, "-p", "counter_rig", `{"endVal":250}`], { env });
  assert.equal(JSON.parse(stdout).preset, "number_counter");
});

test("CLI -f executes a local script file", async () => {
  const file = path.join(workdir, "rig.js");
  fs.writeFileSync(file, `return { made: _mg.shape("ellipse", "From File") };`);
  const { stdout } = await exec(process.execPath, [cli, "-f", file], { env });
  assert.match(JSON.parse(stdout).made, /basicShape#/);
});

test("CLI --audio-beats converts timestamps to frames at --fps", async () => {
  const beatsFile = path.join(workdir, "beats.json");
  fs.writeFileSync(beatsFile, JSON.stringify({ times: [0, 0.5, 1] }));
  const { stdout, stderr } = await exec(process.execPath, [cli, "--audio-beats", beatsFile, "--fps", "24"], { env });
  const payload = JSON.parse(stdout);
  assert.equal(payload.fps, 24);
  assert.deepEqual(payload.frames, [0, 12, 24]);
  assert.match(stderr, /\[beats\] 3 beats/);
});

test("CLI --render-promo --dry-run returns the render and ffmpeg plan", async () => {
  const planFile = path.join(workdir, "promo.json");
  fs.writeFileSync(
    planFile,
    JSON.stringify({
      scenes: [{ comp: "comp#1", start: 0, end: 2 }],
      width: 64,
      height: 36,
      workDir: path.join(workdir, "promo-out"),
    }),
  );
  const { stdout } = await exec(process.execPath, [cli, "--render-promo", planFile, "--dry-run"], { env });
  const payload = JSON.parse(stdout);
  assert.equal(payload.dryRun, true);
  assert.equal(payload.frames, 3);
  assert.equal(payload.commands.length, 2);
  assert.equal(payload.commands[0].cmd, "ffmpeg");
  assert.match(payload.commands[0].args.join(" "), /images\.txt/);
  assert.match(payload.rendered[0].file, /frame_000000\.png/);
});

test("CLI --verify-frames renders previews and warns about collisions", async () => {
  const cliEnv = { ...env, CAVALRY_PREVIEW_DIR: path.join(workdir, "previews") };
  const created = await exec(
    process.execPath,
    [cli, "-e", `return [_rb.rect("Panel", 400, 200, { x: 0, y: 0 }), _rb.rect("Badge", 200, 100, { x: 150, y: 100 })];`],
    { env: cliEnv },
  );
  const ids = new Set<string>(JSON.parse(created.stdout));
  const { stdout, stderr } = await exec(process.execPath, [cli, "--verify-frames", "0,20"], { env: cliEnv });
  const payload = JSON.parse(stdout);
  assert.equal(payload.frames.length, 2);
  for (const entry of payload.frames) assert.ok(fs.existsSync(entry.file), entry.file);
  const pair = payload.collisions.find(
    (collision: { a: { id: string }; b: { id: string } }) => ids.has(collision.a.id) && ids.has(collision.b.id),
  );
  assert.ok(pair, "the two overlapping panels are reported");
  assert.match(stderr, /\[verify\] WARNING frame 0: "Panel"/);
  assert.match(stderr, /\[verify\] 2 preview\(s\)/);
});

test("CLI --render-frames chunks the sequence and reports the budget it used", async () => {
  const framesDir = path.join(workdir, "cli-frames");
  const cliEnv = { ...env, CAVALRY_FRAMES_DIR: framesDir };
  const { stdout, stderr } = await exec(
    process.execPath,
    [cli, "--render-frames", "0-3", "--chunk", "2", "--per-frame-ms", "120", "--timeout-ms", "6000", "--scale", "60"],
    { env: cliEnv },
  );
  const payload = JSON.parse(stdout);
  assert.equal(payload.status, "complete");
  assert.equal(payload.outDir, framesDir);
  assert.equal(payload.scale, 60);
  assert.deepEqual(payload.rendered, [0, 1, 2, 3]);
  assert.deepEqual(payload.pending, []);
  assert.equal(payload.chunks.length, 2, "--chunk 2 over four frames");
  assert.ok(payload.budget === undefined || payload.budget.httpTimeoutMs > 6000);
  assert.match(stderr, /\[render\] chunk 0: rendered \(2\/2\)/);
  assert.match(stderr, /\[render\] complete \| 4 rendered/);
  for (const frame of [0, 1, 2, 3]) {
    assert.ok(fs.existsSync(path.join(framesDir, `frame-${String(frame).padStart(6, "0")}.png`)));
  }
  assert.ok(fs.existsSync(path.join(framesDir, "render-progress.json")));

  // Second call resumes: nothing is sent back to the bridge.
  const resumed = await exec(
    process.execPath,
    [cli, "--render-frames", "0-3", "--chunk", "2"],
    { env: cliEnv },
  );
  const resumePayload = JSON.parse(resumed.stdout);
  assert.equal(resumePayload.status, "complete");
  assert.deepEqual(resumePayload.rendered, []);
  assert.equal(resumePayload.reused.length, 4);
  assert.match(resumed.stderr, /\[render\] complete \| 0 rendered \| 4 reused/);
});

test("CLI --rig publishes the preset's procedural tuning contract as JSON", async () => {
  const { stdout } = await exec(process.execPath, [cli, "--rig", "bento_cards"], { env });
  const contract = JSON.parse(stdout);
  assert.equal(contract.id, "bento_cards");
  for (const term of ["stiffness", "dampingRatio", "overshoot", "staggerOffset", "holdFrames", "easing", "easings", "tunable"]) {
    assert.ok(term in contract, `missing ${term} in --rig output`);
  }
  assert.equal(contract.tunable.staggerOffset, "stagger");
  await assert.rejects(exec(process.execPath, [cli, "--rig", "unknown"], { env }), /Unknown preset/);
});

test("CLI --probe answers capability questions and writes the report file", async () => {
  const reportFile = path.join(workdir, "capabilities.json");
  const { stdout, stderr } = await exec(
    process.execPath,
    [cli, "--probe", "--capabilities-out", reportFile, "--function", "getNiceName", "--function", "getName", "--no-types"],
    { env },
  );
  const payload = JSON.parse(stdout);
  assert.equal(payload.capabilities.getNiceName, true);
  assert.equal(payload.capabilities.getName, false, "the name accessor the docs promise does not exist");
  assert.equal(payload.file, reportFile);
  assert.equal(payload.surface, null, "--inline-surface was not passed");
  assert.ok(fs.existsSync(reportFile));
  const report = JSON.parse(fs.readFileSync(reportFile, "utf8")) as { surface: string[] };
  assert.ok(report.surface.includes("renderPNGFrame"));
  assert.match(stderr, /\[probe\] 1 present \/ 1 missing/);
});
