import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  parseBeatPayload,
  framesFromSeconds,
  inferBpm,
  detectBeatsFromPcm,
  readBeatFile,
  analyzeAudioFile,
} from "../src/beats.js";

function pcmClickTrack(opts: { durationSeconds: number; intervalSeconds: number; sampleRate?: number }): Buffer {
  const sampleRate = opts.sampleRate ?? 16000;
  const total = Math.round(opts.durationSeconds * sampleRate);
  const samples = new Int16Array(total);
  const burstSamples = Math.round(0.025 * sampleRate);
  for (let beat = opts.intervalSeconds; beat < opts.durationSeconds; beat += opts.intervalSeconds) {
    const start = Math.round(beat * sampleRate);
    for (let i = 0; i < burstSamples && start + i < total; i += 1) {
      const envelope = Math.exp(-i / (burstSamples * 0.28));
      const value = Math.sin((2 * Math.PI * 1000 * i) / sampleRate) * envelope * 0.9;
      samples[start + i] = Math.round(value * 32767);
    }
  }
  return Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
}

function wavFromPcm(pcm: Buffer, sampleRate = 16000): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const hasFfmpeg = spawnSync("ffmpeg", ["-version"], { windowsHide: true }).status === 0;

test("beats: integer arrays are frames, fractional arrays are seconds", () => {
  const frames = parseBeatPayload([0, 30, 60], 60);
  assert.deepEqual(frames.frames, [0, 30, 60]);
  assert.equal(frames.fps, 60);
  assert.equal(frames.count, 3);

  const seconds = parseBeatPayload([0, 0.5, 1.25], 60);
  assert.deepEqual(seconds.frames, [0, 30, 75]);
  assert.deepEqual(seconds.times, [0, 0.5, 1.25]);
});

test("beats: objects honour explicit fps, units and beat entries", () => {
  const obj = parseBeatPayload({ fps: 30, beats: [{ time: 1 }, { time: 2 }, { frame: 45 }] }, 60);
  assert.deepEqual(obj.frames, [30, 45, 60]);
  assert.equal(obj.fps, 30);

  const explicit = parseBeatPayload({ unit: "frames", times: [10, 20, 10] }, 60);
  assert.deepEqual(explicit.frames, [10, 20], "deduped and sorted");

  const timed = parseBeatPayload({ fps: 24, times: [{ seconds: 0.5 }, { timestamp: 1 }] }, 60);
  assert.deepEqual(timed.frames, [12, 24]);
});

test("beats: framesFromSeconds rounds, dedupes and sorts", () => {
  assert.deepEqual(framesFromSeconds([0.01, 0.5, 0.5001, 1], 60), [1, 30, 60]);
  assert.deepEqual(framesFromSeconds([1, 2], 0), [60, 120], "invalid fps falls back to 60");
});

test("beats: BPM inference uses the median gap", () => {
  assert.equal(inferBpm([0, 0.5, 1, 1.5, 2]), 120);
  assert.equal(inferBpm([0, 0.25, 0.5, 0.75, 1, 1.6]), 240);
  assert.equal(inferBpm([1]), null);
});

test("beats: onset detector finds a 120 BPM click track", () => {
  const pcm = pcmClickTrack({ durationSeconds: 4, intervalSeconds: 0.5 });
  const detected = detectBeatsFromPcm(pcm, 16000, { minGapMs: 200 });
  assert.ok(detected.times.length >= 6, `expected >= 6 onsets, got ${detected.times.length}`);
  for (const expected of [0.5, 1, 1.5, 2]) {
    assert.ok(
      detected.times.some((time) => Math.abs(time - expected) < 0.08),
      `expected an onset near ${expected}s in ${detected.times.join(", ")}`,
    );
  }
  assert.ok(detected.durationSeconds >= 3.9);
});

test("beats: a constant tone produces no false onsets", () => {
  const sampleRate = 16000;
  const samples = new Int16Array(sampleRate * 2);
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = Math.round(Math.sin((2 * Math.PI * 220 * i) / sampleRate) * 0.5 * 32767);
  }
  const pcm = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  const detected = detectBeatsFromPcm(pcm, sampleRate);
  assert.deepEqual(detected.times, []);
});

test("beats: JSON and text files load without Cavalry or ffmpeg", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cav-beats-"));
  try {
    const jsonPath = path.join(dir, "beats.json");
    fs.writeFileSync(jsonPath, JSON.stringify({ fps: 30, beats: [0, 0.5, 1] }));
    const json = await readBeatFile(jsonPath, 60);
    assert.deepEqual(json.frames, [0, 15, 30]);
    assert.equal(json.fps, 30);

    const textPath = path.join(dir, "beats.txt");
    fs.writeFileSync(textPath, "# frames\n0, 12\n24\n");
    const text = await readBeatFile(textPath, 60);
    assert.deepEqual(text.frames, [0, 12, 24]);
    assert.equal(text.source, "text");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("beats: ffmpeg decodes a WAV click track", { skip: hasFfmpeg ? false : "ffmpeg not installed" }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cav-beats-wav-"));
  try {
    const wavPath = path.join(dir, "clicks.wav");
    fs.writeFileSync(wavPath, wavFromPcm(pcmClickTrack({ durationSeconds: 4, intervalSeconds: 0.5 })));
    const analysis = await analyzeAudioFile(wavPath, { fps: 30, minGapMs: 200 });
    assert.equal(analysis.source, "ffmpeg");
    assert.equal(analysis.fps, 30);
    assert.ok(analysis.frames.length >= 6);
    assert.ok(analysis.frames.some((frame) => Math.abs(frame - 15) <= 3), `expected a beat near frame 15: ${analysis.frames.join(",")}`);
    assert.equal(analysis.bpm, 120);
    assert.ok((analysis.durationSeconds ?? 0) >= 3.9);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
