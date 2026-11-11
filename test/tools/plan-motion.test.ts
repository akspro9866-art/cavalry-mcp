import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CARD_WORLD_PRESET_IDS,
  ENERGY_ARC_IDS,
  PLAN_MOTION_VERSION,
  SAAS_STORYBOARDS,
  SHOT_GRAMMAR_IDS,
  planMotionTimeline,
} from "../../scripts/wave2/plan-motion.mjs";
import { PRESET_DEFS, getPreset } from "../../src/presets/cavalry_snippets.js";
import { fittsCursorAt, splineAt } from "../../src/runtime/mg_helpers.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../..");
const SCRIPT = path.join(ROOT, "scripts", "wave2", "plan-motion.mjs");
const SHOT_DIR = path.join(ROOT, ".qoder", "skills", "open-video-harness", "recipes", "shot");
const ARC_DIR = path.join(ROOT, ".qoder", "skills", "open-video-harness", "recipes", "sequences");

function runCli(args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env },
  });
}

function withTempDir<T>(run: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plan-motion-"));
  try {
    return run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("plan-motion: default SaaS storyboard yields a frame-accurate deterministic plan", () => {
  const plan = planMotionTimeline();
  assert.equal(plan.version, PLAN_MOTION_VERSION);
  assert.equal(plan.storyboard.id, "T031");
  assert.equal(plan.storyboard.aspect, "9:16");
  assert.equal(plan.width, 1080);
  assert.equal(plan.height, 1920);
  assert.equal(plan.fps, 30);
  assert.equal(plan.durationSeconds, 20);
  assert.equal(plan.totalFrames, 600);
  assert.equal(plan.beats.length, 5);
  assert.equal(plan.energyArc?.id, "explainer-30s");
  assert.equal(plan.bgm?.id, "B26");
  assert.equal(plan.bgm?.bpm, 122);
  assert.equal(plan.checks.wordBudget, "pass");
  assert.equal(plan.checks.maxWordsPerBeat, 4);
  assert.equal(plan.checks.frameRangesContiguous, true);
  assert.equal(plan.checks.sfxWithinRanges, true);

  // Deterministic: two invocations produce byte-identical JSON.
  assert.equal(JSON.stringify(planMotionTimeline()), JSON.stringify(plan));
});

test("plan-motion: every catalog named by the MD is present and registered", () => {
  assert.equal(SAAS_STORYBOARDS.length, 10);
  assert.deepEqual([...SAAS_STORYBOARDS], [
    "T031", "T032", "T033", "T034", "T035", "T036", "T037", "T038", "T039", "T040",
  ]);

  assert.equal(SHOT_GRAMMAR_IDS.length, 24);
  assert.equal(new Set(SHOT_GRAMMAR_IDS).size, 24);
  for (const id of SHOT_GRAMMAR_IDS) {
    assert.ok(fs.existsSync(path.join(SHOT_DIR, `${id}.md`)), `missing shot card ${id}.md`);
  }

  assert.equal(ENERGY_ARC_IDS.length, 10);
  assert.equal(new Set(ENERGY_ARC_IDS).size, 10);
  const arcFiles = fs.readdirSync(ARC_DIR).filter((name) => name.endsWith(".md") && name !== "README.md");
  assert.equal(arcFiles.length, 10, "10 sequence skeletons on disk");

  // All 21 cat16 builders exist in the executable library, card_worlds only.
  assert.equal(CARD_WORLD_PRESET_IDS.length, 21);
  const cardWorlds = PRESET_DEFS.filter((def) => def.category === "card_worlds").map((def) => def.id);
  assert.equal(cardWorlds.length, 21);
  for (const id of CARD_WORLD_PRESET_IDS) {
    assert.ok(getPreset(id), `preset ${id} is not registered`);
    assert.ok(cardWorlds.includes(id), `${id} is not in the card_worlds pack`);
  }
  assert.ok(cardWorlds.includes("page_turn_book"));

  // The plan only ever routes beats to real card-world presets.
  for (const entry of planMotionTimeline().presets) {
    assert.ok(CARD_WORLD_PRESET_IDS.includes(entry.presetId), `${entry.presetId} is not a cat16 builder`);
  }
});

test("plan-motion: beats are asymmetric, contiguous and stay inside their frame ranges", () => {
  const plan = planMotionTimeline({ storyboard: "T032" });
  assert.equal(plan.storyboard.aspect, "16:9");
  assert.equal(plan.width, 1920);
  assert.equal(plan.height, 1080);
  assert.equal(plan.checks.asymmetricDurations, "pass");

  const durations = plan.beats.map((beat) => beat.durationFrames);
  assert.equal(new Set(durations).size, durations.length, "no two beats share a duration");
  assert.ok(new Set(durations).size > 1);
  assert.ok(plan.checks.durationSpreadFrames >= Math.round(plan.totalFrames * 0.04));

  let cursor = 0;
  for (const beat of plan.beats) {
    assert.equal(beat.startFrame, cursor);
    assert.equal(beat.endFrame, beat.startFrame + beat.durationFrames);
    assert.equal(beat.frameRange, `${beat.startFrame}-${beat.endFrame}`);
    assert.ok(beat.wordBudget.count <= 4);
    assert.equal(beat.wordBudget.ok, true);
    assert.ok(beat.camera.keyframes.length >= 3);
    assert.equal(beat.camera.samples[0].frame, beat.startFrame);
    assert.equal(beat.camera.samples.at(-1).frame, beat.endFrame);
    cursor = beat.endFrame;
  }
  assert.equal(cursor, plan.totalFrames);

  assert.ok(plan.sfx.length > 0, "T032/T031-family SFX rows must map to cues");
  for (const cue of plan.sfx) {
    const beat = plan.beats[cue.scene - 1];
    assert.ok(cue.frame >= beat.startFrame && cue.frame < beat.endFrame);
  }
});

test("plan-motion: the four-word display cap is enforced on overrides", () => {
  assert.throws(
    () => planMotionTimeline({ storyboard: "T031", beats: [{ copy: "one two three four five" }] }),
    (error: Error & { code?: string }) => error.code === "PLAN_WORD_BUDGET",
  );
  const plan = planMotionTimeline({ storyboard: "T031", beats: [{ copy: "one two three four" }] });
  assert.equal(plan.beats[0].displayCopy, "one two three four");
  assert.equal(plan.beats[0].wordBudget.count, 4);
  assert.equal(plan.checks.wordBudget, "pass");
});

test("plan-motion: spline camera samples match the mg_helpers C1 mirror", () => {
  for (const shotGrammar of ["push-in", "orbit", "dutch", "top-down"]) {
    const plan = planMotionTimeline({ storyboard: "T033", shotGrammar });
    assert.equal(plan.shotGrammar?.id, shotGrammar);
    for (const beat of plan.beats) {
      assert.equal(beat.cameraBehavior, shotGrammar);
      for (const sample of beat.camera.samples) {
        const [x, y, scale, rotation] = splineAt(sample.frame, beat.camera.keyframes);
        const round = (value: number) => Math.round(value * 10000) / 10000;
        assert.equal(sample.x, round(x));
        assert.equal(sample.y, round(y));
        assert.equal(sample.scale, round(scale));
        assert.equal(sample.rotation, round(rotation));
      }
    }
  }
});

test("plan-motion: Fitts cursor samples match fittsCursorAt in mg_helpers", () => {
  const plan = planMotionTimeline({ storyboard: "T031" });
  const beat = plan.beats.find((entry) => entry.cursor);
  assert.ok(beat, "T031 scene 3 uses CURSOR");
  const trajectory = beat!.cursor!.trajectory as Array<[number, number, number]>;
  assert.ok(trajectory.length >= 4, "overshoot + settle waypoints");
  const frames = trajectory.map(([frame]) => frame);
  assert.deepEqual(frames, [...frames].sort((a, b) => a - b));
  for (const sample of beat!.cursor!.samples) {
    const point = fittsCursorAt(sample.frame, trajectory);
    assert.deepEqual({ x: sample.x, y: sample.y }, point);
  }
  assert.equal(plan.cursorTargets.length, 1);
  assert.equal(plan.cursorTargets[0].targets.at(-1)?.click, true);
});

test("plan-motion: overrides pick grammar, arc, bgm, fps and canvas", () => {
  const plan = planMotionTimeline({
    storyboard: "T031",
    shotGrammar: "push-in",
    energyArc: "launch-15s",
    bgm: "B25",
    durationSeconds: 12,
    fps: 60,
  });
  assert.equal(plan.shotGrammar?.id, "push-in");
  assert.equal(plan.energyArc?.id, "launch-15s");
  assert.equal(plan.energyArc?.arc[0], 3);
  assert.equal(plan.bgm?.id, "B25");
  assert.equal(plan.bgm?.bpm, 116);
  assert.equal(plan.fps, 60);
  assert.equal(plan.totalFrames, 720);
  assert.equal(plan.checks.frameRangesContiguous, true);
  assert.equal(plan.checks.sfxWithinRanges, true);
  // Explicit grammar replaces the per-beat storyboard camera codes.
  assert.ok(plan.beats.every((beat) => beat.cameraBehavior === "push-in"));
});

test("plan-motion: unknown inputs fail with actionable codes", () => {
  const cases: Array<[() => unknown, string]> = [
    [() => planMotionTimeline({ storyboard: "T999" }), "PLAN_STORYBOARD_UNKNOWN"],
    [() => planMotionTimeline({ storyboard: "demo" }), "PLAN_STORYBOARD_INVALID"],
    [() => planMotionTimeline({ shotGrammar: "dolly-zoom" }), "PLAN_SHOT_GRAMMAR_UNKNOWN"],
    [() => planMotionTimeline({ energyArc: "slow-burn" }), "PLAN_ENERGY_ARC_UNKNOWN"],
    [() => planMotionTimeline({ bgm: "B99" }), "PLAN_BGM_UNKNOWN"],
    [() => planMotionTimeline({ bgm: "music" }), "PLAN_BGM_INVALID"],
    [() => planMotionTimeline({ fps: 0 }), "PLAN_FPS_INVALID"],
    [() => planMotionTimeline({ durationSeconds: -1 }), "PLAN_DURATION_INVALID"],
  ];
  for (const [run, code] of cases) {
    assert.throws(run, (error: Error & { code?: string }) => error.code === code, code);
  }
});

test("plan-motion CLI: writes JSON with --out and prints help", () => {
  withTempDir((dir) => {
    const out = path.join(dir, "nested", "plan.json");
    const result = runCli([
      "--storyboard", "T032", "--fps", "24", "--bgm", "B25", "--out", out,
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /wrote .*plan\.json \(5 beats, 480 frames\)/);
    const plan = JSON.parse(fs.readFileSync(out, "utf8"));
    assert.equal(plan.storyboard.id, "T032");
    assert.equal(plan.fps, 24);
    assert.equal(plan.totalFrames, 480);
    assert.equal(plan.bgm.id, "B25");
    assert.equal(plan.checks.frameRangesContiguous, true);
  });

  const help = runCli(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--storyboard <T001\.\.T103>/);
  assert.match(help.stdout, /--shot-grammar/);

  const unknown = runCli(["--storyboard", "T999"]);
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /PLAN_STORYBOARD_UNKNOWN/);

  const badFlag = runCli(["--nope", "x"]);
  assert.equal(badFlag.status, 1);
  assert.match(badFlag.stderr, /PLAN_ARGS_INVALID/);
});
