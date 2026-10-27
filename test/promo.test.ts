import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { startMockStallion } from "./helpers/mockStallion.js";
import { wrapAtomicScript } from "../src/runtime/atomic.js";
import type { ScriptOutcome } from "../src/runtime/execute.js";
import {
  normalizePromoPlan,
  buildPromoScript,
  buildPromoCommands,
  runPromo,
} from "../src/promo.js";

function mockExecutor(mock: Awaited<ReturnType<typeof startMockStallion>>, statePath: string) {
  return async (code: string): Promise<ScriptOutcome> => {
    const context = vm.createContext({ api: mock.api, console });
    const wrapped = wrapAtomicScript(code, false, { seq: "promo-test", statePath });
    new vm.Script(wrapped).runInContext(context);
    return {
      ok: true,
      text: JSON.stringify((context as { __result?: unknown }).__result ?? null),
      state: null,
    };
  };
}

function recordingRunner(writes: string[]) {
  return async (_cmd: string, args: string[]) => {
    writes.push(args.join(" "));
    const output = args[args.length - 1];
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, "fake mp4");
    return "";
  };
}

test("promo: plan validation and normalisation", () => {
  assert.throws(() => normalizePromoPlan({ scenes: [] }), /non-empty scenes/);
  assert.throws(() => normalizePromoPlan({}), /non-empty scenes/);
  const plan = normalizePromoPlan(
    {
      scenes: ["comp#1", { comp: "comp#2", start: 10, end: 20, step: 2, name: "outro" }],
      fps: 30,
      width: 800,
      height: 600,
    },
    path.join(os.tmpdir(), "cav-promo-normalize"),
  );
  assert.equal(plan.fps, 30);
  assert.equal(plan.scenes.length, 2);
  assert.equal(plan.scenes[0].comp, "comp#1");
  assert.equal(plan.scenes[0].name, "scene_01");
  assert.equal(plan.scenes[1].step, 2);
  assert.equal(plan.scenes[1].name, "outro");
  assert.equal(plan.width, 800);
  assert.ok(plan.out.endsWith("promo.mp4"));
});

test("promo: script renders every sampled frame and returns a manifest", async () => {
  const mock = await startMockStallion({ native: true });
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "cav-promo-script-"));
  try {
    const plan = normalizePromoPlan(
      { scenes: [{ comp: "comp#1", start: 0, end: 4, step: 2 }], width: 64, height: 36 },
      workDir,
    );
    const script = buildPromoScript(plan);
    assert.match(script, /renderPNGFrame/);
    assert.match(script, /setActiveComp/);
    const context = vm.createContext({ api: mock.api, console });
    new vm.Script(wrapAtomicScript(script, false)).runInContext(context);
    const manifest = (context as { __result?: { rendered: number; files: Array<{ file: string; frame: number }> } }).__result!;
    assert.equal(manifest.rendered, 3);
    // The manifest was built inside the vm realm; copy into host arrays before
    // strict comparison (cross-realm prototypes are not reference-equal).
    assert.deepEqual(Array.from(manifest.files, (file) => file.frame as number), [0, 2, 4]);
    for (const file of manifest.files) assert.ok(fs.existsSync(file.file), file.file);
    assert.ok(mock.state.order.includes("setFrame:4"));
  } finally {
    await mock.close();
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test("promo: runPromo encodes scenes, concatenates and renames the master", async () => {
  const mock = await startMockStallion({ native: true });
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "cav-promo-run-"));
  const writes: string[] = [];
  try {
    const result = await runPromo(
      {
        scenes: [
          { comp: "comp#1", start: 0, end: 2 },
          { comp: "comp#1", start: 10, end: 12 },
        ],
        width: 64,
        height: 36,
      },
      {
        workDir,
        execute: mockExecutor(mock, path.join(workDir, "state.json")),
        runCommand: recordingRunner(writes),
      },
    );
    assert.equal(result.frames, 6);
    assert.equal(result.rendered.length, 6);
    for (const entry of result.rendered) assert.ok(fs.existsSync(entry.file), entry.file);
    assert.equal(writes.length, 3, "two scene encodes + concat");
    assert.match(writes[0], /-f concat/);
    assert.match(writes[2], /promo_silent\.mp4/);
    assert.ok(fs.existsSync(result.out), "silent master renamed to the requested output");
    assert.equal(fs.readFileSync(result.out, "utf8"), "fake mp4");
    const images = fs.readFileSync(path.join(workDir, "scene_01", "images.txt"), "utf8");
    assert.match(images, /ffconcat version 1\.0/);
    assert.match(images, /duration 0\.016667/);
    assert.match(images, /frame_000000\.png/);
    assert.equal(result.scenes[0].frames, 3);
    assert.equal(result.scenes[1].firstFrame, 10);
  } finally {
    await mock.close();
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test("promo: dry-run predicts frames and commands without touching Cavalry", async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "cav-promo-dry-"));
  try {
    const result = await runPromo(
      {
        scenes: [
          { comp: "comp#1", start: 0, end: 4, step: 2 },
          { comp: "comp#2", start: 30, end: 30 },
        ],
        width: 128,
        height: 720,
      },
      { workDir, dryRun: true },
    );
    assert.equal(result.dryRun, true);
    assert.equal(result.frames, 4, "3 + 1 predicted frames");
    assert.equal(result.commands.length, 3);
    assert.equal(result.rendered.length, 4);
    for (const entry of result.rendered) assert.equal(fs.existsSync(entry.file), false);
    assert.match(result.commands[0].args.join(" "), /scale=128:720/);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test("promo: background audio adds a mux command and skips the rename", async () => {
  const mock = await startMockStallion({ native: true });
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "cav-promo-audio-"));
  const audio = path.join(workDir, "track.mp3");
  fs.writeFileSync(audio, "fake audio");
  const writes: string[] = [];
  try {
    const result = await runPromo(
      {
        scenes: [{ comp: "comp#1", start: 0, end: 1 }],
        audio,
        width: 32,
        height: 32,
      },
      {
        workDir,
        execute: mockExecutor(mock, path.join(workDir, "state.json")),
        runCommand: recordingRunner(writes),
      },
    );
    assert.equal(result.commands.length, 3, "encode + concat + mux");
    assert.equal(result.commands.at(-1)?.label, "mux background audio");
    const mux = writes.at(-1) ?? "";
    assert.match(mux, /-c:a aac/);
    assert.match(mux, /-shortest/);
    assert.ok(fs.existsSync(result.out));
  } finally {
    await mock.close();
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test("promo: commands scale and pad mismatched comp resolutions", () => {
  const plan = normalizePromoPlan(
    { scenes: [{ comp: "comp#1", start: 0, end: 10 }], width: 1080, height: 1920 },
    path.join(os.tmpdir(), "cav-promo-commands"),
  );
  const manifest = {
    scenes: [{ comp: "comp#1", dir: plan.scenes[0].dir, frames: 11, firstFrame: 0, lastFrame: 10, step: 1 }],
    rendered: 11,
    files: Array.from({ length: 11 }, (_, frame) => ({ scene: 0, frame, file: path.join(plan.scenes[0].dir, `frame_${frame}.png`) })),
  };
  const { commands, concatPath } = buildPromoCommands(plan, manifest);
  assert.match(commands[0].args.join(" "), /force_original_aspect_ratio=decrease/);
  assert.match(commands[0].args.join(" "), /pad=1080:1920/);
  assert.equal(concatPath, path.join(plan.workDir, "scenes.txt"));
});
