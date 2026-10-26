import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { startMockStallion } from "./helpers/mockStallion.js";

const exec = promisify(execFile);
const mock = await startMockStallion({ native: true });
const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "stallion-cli-test-"));
const cli = path.resolve("bin/stallion-cli.mjs");
const env = { ...process.env, STALLION_URL: `http://127.0.0.1:${mock.port}` };

test.after(async () => {
  await mock.close();
  fs.rmSync(workdir, { recursive: true, force: true });
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
  assert.match(JSON.parse(stdout).made, /ellipse#/);
});
