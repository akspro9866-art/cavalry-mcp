import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ACTION_SFX_MAP,
  BGM_TRACKS,
  PYTHON_AUDIO_SCRIPT,
  cuesFromActions,
  probePythonAudio,
  resolveBgmTrack,
} from "../../src/tools/beats.js";
import {
  parseSfxTokens,
  listStoryboards,
  loadStoryboard,
  storyboardFramePlan,
  storyboardScaffold,
} from "../../src/tools/storyboards.js";
import { normalizePromoPlan, runPromo } from "../../src/tools/promo.js";
import { removeTreeSync } from "../../src/shared/fs-safe.js";

test("wave2 audio: BGM catalogue covers B00-B39 and rejects unknown ids", () => {
  assert.equal(BGM_TRACKS.length, 40);
  assert.equal(BGM_TRACKS[0].id, "B00");
  assert.equal(BGM_TRACKS[39].id, "B39");
  assert.deepEqual(new Set(BGM_TRACKS.map((track) => track.id)).size, 40);
  assert.equal(resolveBgmTrack("B00")?.name, "Room Tone Ambience");
  assert.equal(resolveBgmTrack("b26")?.id, "B26");
  assert.equal(resolveBgmTrack("B26")?.bpm, 122);
  assert.equal(resolveBgmTrack("B39")?.name, "Upbeat Nu-Disco Funk");
  assert.equal(resolveBgmTrack("B40"), null);
  assert.equal(resolveBgmTrack("M01"), null);
  assert.equal(resolveBgmTrack("B2"), null);
  assert.equal(resolveBgmTrack(""), null);
});

test("wave2 audio: action-bound SFX cues map to kinds, offsets and frames", () => {
  const cues = cuesFromActions(
    [
      { action: "click", frame: 30 },
      { action: "popPlop", frame: 60 },
      { action: "transition", frame: 1 },
      { action: "mystery-action", frame: 5 },
    ],
    30,
  );
  assert.equal(cues.length, 3, "unknown actions are dropped");
  assert.deepEqual(cues.map((cue) => cue.frame), [30, 62, 0]);
  assert.equal(cues[0].kind, "click");
  assert.equal(cues[0].gainDb, 0);
  assert.equal(cues[1].kind, "pop");
  assert.equal(cues[1].durationMs, ACTION_SFX_MAP.popPlop.durationMs);
  assert.equal(cues[2].frame, 0, "negative offsets clamp at frame 0");
  assert.equal(cues[0].timeSeconds, 1);
  assert.match(cues[0].label, /click_30/);
  assert.equal(cuesFromActions([], 30).length, 0);
});

test("wave2 audio: storyboard SFX cells resolve to action tokens", () => {
  assert.deepEqual(parseSfxTokens("pop-plop").actions, ["popPlop"]);
  assert.deepEqual(parseSfxTokens("TYPE (digital)").actions, ["typing"]);
  assert.deepEqual(parseSfxTokens("CLICK bila diklik").actions, ["click"]);
  assert.deepEqual(parseSfxTokens("confirm-glass").actions, ["chime"]);
  assert.deepEqual(parseSfxTokens("—").actions, []);
  assert.deepEqual(parseSfxTokens("Jeda").actions, []);
  assert.deepEqual(parseSfxTokens("nonsense-bleep").unknown, ["nonsense-bleep"]);
});

test("wave2 audio: every storyboard parses and plans a coherent frame timeline", () => {
  const entries = listStoryboards();
  assert.equal(entries.length, 103);
  assert.equal(entries[0].id, "T001");
  assert.equal(entries.at(-1)?.id, "T103");

  for (const entry of entries) {
    const plan = storyboardFramePlan(entry.id, { fps: 24 });
    assert.equal(plan.id, entry.id);
    assert.ok(plan.totalFrames > 0, `${entry.id} has frames`);
    assert.ok(plan.scenes.length >= 3, `${entry.id} has scenes`);
    assert.equal(plan.scenes[0].startFrame, 0, `${entry.id} starts at frame 0`);
    assert.equal(plan.scenes.at(-1)?.endFrame, plan.totalFrames, `${entry.id} ends at totalFrames (exclusive)`);
    assert.equal(plan.scenes.at(-1)?.exitTransition, "none");
    for (const scene of plan.scenes) {
      assert.ok(scene.durationInFrames > 0, `${entry.id} scene ${scene.sceneIndex} has frames`);
      assert.ok(scene.endFrame <= plan.totalFrames, `${entry.id} scene ${scene.sceneIndex} stays in range`);
    }
    for (let i = 1; i < plan.scenes.length; i += 1) {
      assert.ok(plan.scenes[i].startFrame > plan.scenes[i - 1].startFrame, `${entry.id} scene starts advance`);
    }
    for (const cue of plan.cues) {
      assert.ok(Number.isInteger(cue.frame) && cue.frame >= 0);
      assert.ok(cue.frame <= plan.totalFrames);
    }
  }
});

test("wave2 audio: T032 SaaS scaffold exposes scenes, duration and BGM", () => {
  const scaffold = storyboardScaffold("T032");
  assert.equal(scaffold.template, "T032");
  assert.equal(scaffold.title, "Demo SaaS Dashboard");
  assert.equal(scaffold.aspect, "16:9");
  assert.equal(scaffold.fps, 30);
  assert.equal(scaffold.totalFrames, 600);
  assert.equal(scaffold.bgmId, "B26");
  assert.equal(scaffold.scenes.length, 5);
  assert.deepEqual(
    scaffold.scenes.map((scene) => [scene.startFrame, scene.endFrame]),
    [[0, 90], [90, 240], [240, 420], [420, 540], [540, 600]],
  );
  assert.equal(scaffold.scenes.at(-1)?.transition, "none");

  const hd = storyboardFramePlan("T032", { fps: 60 });
  assert.equal(hd.totalFrames, 1200);
  assert.equal(hd.scenes.at(-1)?.endFrame, 1200);

  const t031 = storyboardFramePlan("T031");
  assert.equal(t031.aspect, "9:16");
  assert.equal(t031.bgm?.id, "B26");
  assert.deepEqual(t031.scenes.map((scene) => scene.sfxActions), [
    ["popIn"],
    ["popPlop"],
    ["click"],
    ["chime"],
    ["chime"],
  ]);
  assert.deepEqual(t031.cues.map((cue) => cue.frame), [0, 92, 240, 420, 540]);
  assert.match(t031.components.join(","), /Coverflow3D/);
});

test("wave2 audio: storyboard ids fail loudly with actionable errors", () => {
  assert.throws(() => loadStoryboard("T32"), /Invalid storyboard id/);
  assert.throws(() => loadStoryboard("T999"), /Unknown storyboard "T999"/);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "cav-storyboards-empty-"));
  try {
    assert.throws(() => listStoryboards(empty), /Storyboard index not found/);
    assert.throws(() => loadStoryboard("T001", path.join(empty, "missing")), /Storyboard folder not found/);
  } finally {
    removeTreeSync(empty);
  }
});

test("wave2 audio: python mastering probe degrades without throwing", async () => {
  const missing = await probePythonAudio("cavalry-missing-python-binary-xyz");
  assert.equal(missing.available, false);
  assert.equal(missing.version, null);
  assert.match(missing.error ?? "", /python not found/);
  assert.match(missing.error ?? "", /TS synthesizer/);

  assert.equal(PYTHON_AUDIO_SCRIPT, "scripts/wave2/audio.py");
  const scriptPath = path.resolve(PYTHON_AUDIO_SCRIPT);
  assert.ok(fs.existsSync(scriptPath), `expected ${scriptPath}`);
});

test("wave2 audio: promo accepts a storyboard id and derives scene timing plus cues", async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "cav-promo-storyboard-"));
  try {
    const normalized = normalizePromoPlan(
      { storyboard: "T032", fps: 30, scenes: ["comp#a", "comp#b"] },
      workDir,
    );
    assert.ok(normalized.storyboard, "storyboard plan attached");
    assert.equal(normalized.storyboard?.bgm?.id, "B26");
    assert.deepEqual(
      normalized.scenes.map((scene) => [scene.start, scene.end]),
      [[0, 89], [90, 239]],
    );
    assert.ok(Array.isArray(normalized.sfxCueSheet), "storyboard cues become the cue sheet");
    assert.ok((normalized.sfxCueSheet as unknown[]).length >= 1);

    const explicit = normalizePromoPlan({ storyboard: "T032", sfxCueSheet: null }, workDir);
    assert.equal(explicit.sfxCueSheet, undefined, "explicit null disables storyboard cues");
    assert.equal(explicit.scenes.length, 5, "scene-less plans scaffold one comp per beat");
    assert.equal(explicit.scenes[0].comp, "T032_scene_01");

    const dry = await runPromo(
      { storyboard: "T032", fps: 30, width: 128, height: 720, sfxCueSheet: null },
      { workDir, dryRun: true },
    );
    assert.equal(dry.dryRun, true);
    assert.equal(dry.frames, 600, "5 scenes × 120 frames predicted");
    assert.equal(dry.storyboard?.template, "T032");
    assert.equal(dry.storyboard?.scenes.length, 5);
    assert.match(dry.log[0], /storyboard T032 · Demo SaaS Dashboard/);
    assert.match(dry.log[0], /bgm B26/);
  } finally {
    removeTreeSync(workDir);
  }
});
