/**
 * Audio beat analysis for the CLI bridge.
 *
 * Two input paths:
 *  - a JSON/text file with frames, seconds or beat objects (no ffmpeg needed);
 *  - a local audio file decoded by ffmpeg to mono s16le PCM and analysed with
 *    an energy-flux onset detector.
 *
 * Everything is converted to comp frames at the active comp's FPS so the
 * resulting array can be passed straight to `_mg.syncToFrames`.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export type BeatUnit = "frames" | "seconds";

export interface BeatAnalysis {
  source: "json" | "text" | "ffmpeg";
  fps: number;
  frames: number[];
  times: number[];
  count: number;
  durationSeconds: number | null;
  bpm: number | null;
}

export interface OnsetOptions {
  windowSize?: number;
  hopSize?: number;
  minGapMs?: number;
  /** Adaptive threshold multiplier over the flux standard deviation. */
  threshold?: number;
  /** Ignore transients quieter than this fraction of the loudest RMS. */
  silenceFloor?: number;
}

export interface BeatEntry {
  frame?: number;
  time?: number;
  timestamp?: number;
  seconds?: number;
  value?: number;
}

export interface BeatPayload {
  fps?: number;
  unit?: BeatUnit;
  frames?: Array<number | BeatEntry>;
  times?: Array<number | BeatEntry>;
  beats?: Array<number | BeatEntry>;
  bpm?: number;
  duration?: number;
  durationSeconds?: number;
}

export interface DetectOptions extends OnsetOptions {
  fps?: number;
  ffmpegPath?: string;
}

const ABSOLUTE_MIN_GAP_MS = 90;

export function framesFromSeconds(times: number[], fps: number): number[] {
  const safeFps = Number(fps) > 0 ? Number(fps) : 60;
  const frames: number[] = [];
  for (const value of times) {
    const frame = Math.round(Number(value) * safeFps);
    if (Number.isFinite(frame) && frame >= 0 && !frames.includes(frame)) frames.push(frame);
  }
  return frames.sort((a, b) => a - b);
}

/** Median inter-beat interval -> BPM, or null when there are too few beats. */
export function inferBpm(times: number[]): number | null {
  if (times.length < 3) return null;
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i += 1) {
    const gap = times[i] - times[i - 1];
    if (gap > 0.05) gaps.push(gap);
  }
  if (gaps.length < 2) return null;
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  if (!(median > 0)) return null;
  const bpm = Math.round(60 / median);
  return bpm >= 30 && bpm <= 300 ? bpm : null;
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function entryValue(entry: number | BeatEntry): number | null {
  if (typeof entry === "number") return Number.isFinite(entry) ? entry : null;
  if (!entry || typeof entry !== "object") return null;
  for (const key of ["frame", "time", "timestamp", "seconds", "value"] as const) {
    const value = entry[key];
    if (value != null && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function normalize(
  values: Array<number | BeatEntry>,
  unit: BeatUnit,
  fps: number,
  source: BeatAnalysis["source"],
  durationSeconds: number | null,
  bpm: number | null,
): BeatAnalysis {
  const frames: number[] = [];
  const times: number[] = [];
  for (const entry of values) {
    const value = entryValue(entry);
    if (value == null || value < 0) continue;
    let frame: number;
    if (typeof entry === "object" && entry && entry.frame != null) {
      frame = Math.round(Number(entry.frame));
    } else if (unit === "seconds") {
      frame = Math.round(value * fps);
    } else {
      frame = Math.round(value);
    }
    if (!Number.isFinite(frame) || frame < 0 || frames.includes(frame)) continue;
    frames.push(frame);
  }
  frames.sort((a, b) => a - b);
  for (const frame of frames) times.push(roundTime(frame / fps));
  return {
    source,
    fps,
    frames,
    times,
    count: frames.length,
    durationSeconds: durationSeconds == null ? (times.length ? times[times.length - 1] : null) : roundTime(durationSeconds),
    bpm: bpm ?? inferBpm(times),
  };
}

/**
 * Parse a beat payload. Raw arrays of integers are treated as frames; an array
 * containing fractional values is treated as seconds. Objects can set
 * `unit` explicitly, or use `frames` / `times` keys to disambiguate.
 */
export function parseBeatPayload(raw: unknown, fallbackFps = 60): BeatAnalysis {
  const fps = Number(fallbackFps) > 0 ? Number(fallbackFps) : 60;

  if (Array.isArray(raw)) {
    const numbers = raw.map((entry) => entryValue(entry as number | BeatEntry)).filter((v): v is number => v != null);
    const hasTimeObjects = raw.some(
      (entry) => typeof entry === "object" && entry != null && (entry.time != null || entry.timestamp != null || entry.seconds != null),
    );
    const unit: BeatUnit = hasTimeObjects || numbers.some((n) => !Number.isInteger(n)) ? "seconds" : "frames";
    return normalize(raw as Array<number | BeatEntry>, unit, fps, "json", null, null);
  }

  if (!raw || typeof raw !== "object") {
    throw new Error("Beat JSON must be an array or an object with frames/times/beats");
  }

  const payload = raw as BeatPayload;
  const objFps = Number(payload.fps);
  const resolvedFps = objFps > 0 ? objFps : fps;
  const explicitUnit: BeatUnit | null = payload.unit === "frames" || payload.unit === "seconds" ? payload.unit : null;
  const duration = payload.durationSeconds ?? payload.duration ?? null;

  if (Array.isArray(payload.frames)) {
    const analysis = normalize(payload.frames, "frames", resolvedFps, "json", duration == null ? null : Number(duration), payload.bpm == null ? null : Number(payload.bpm));
    return analysis;
  }

  if (Array.isArray(payload.times)) {
    const numbers = payload.times.map((entry) => entryValue(entry as number | BeatEntry)).filter((v): v is number => v != null);
    const unit: BeatUnit = explicitUnit ?? (payload.times.every((entry) => typeof entry === "object") ? "seconds" : (numbers.some((n) => !Number.isInteger(n)) ? "seconds" : "frames"));
    return normalize(payload.times, unit, resolvedFps, "json", duration == null ? null : Number(duration), payload.bpm == null ? null : Number(payload.bpm));
  }

  if (Array.isArray(payload.beats)) {
    const numbers = payload.beats.map((entry) => entryValue(entry as number | BeatEntry)).filter((v): v is number => v != null);
    const hasObjects = payload.beats.some((entry) => typeof entry === "object" && entry != null && (entry.time != null || entry.timestamp != null || entry.seconds != null));
    const unit: BeatUnit = explicitUnit ?? (hasObjects || numbers.some((n) => !Number.isInteger(n)) ? "seconds" : "frames");
    return normalize(payload.beats, unit, resolvedFps, "json", duration == null ? null : Number(duration), payload.bpm == null ? null : Number(payload.bpm));
  }

  throw new Error("Beat JSON needs one of: frames, times or beats");
}

function parseNumberList(text: string): number[] {
  return text
    .split(/[\s,;]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !token.startsWith("#"))
    .map(Number)
    .filter((value) => Number.isFinite(value) && value >= 0);
}

/** Read a .json / .txt / .csv beat source from disk. */
export async function readBeatFile(file: string, fps = 60): Promise<BeatAnalysis> {
  const ext = path.extname(file).toLowerCase();
  const text = await fs.readFile(file, "utf8");
  if (ext === ".json" || ext === ".jsonc") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error(`Beat JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
    return parseBeatPayload(parsed, fps);
  }
  const numbers = parseNumberList(text);
  const unit: BeatUnit = numbers.some((n) => !Number.isInteger(n)) ? "seconds" : "frames";
  return normalize(numbers, unit, fps, "text", null, null);
}

/**
 * Onset detection from mono s16le PCM. Energy rises (positive RMS flux) are
 * compared against an adaptive threshold and thinned by a minimum gap.
 */
export function detectBeatsFromPcm(pcm: Buffer, sampleRate: number, opts: OnsetOptions = {}): { times: number[]; durationSeconds: number } {
  const windowSize = Math.max(64, Math.round(opts.windowSize ?? 1024));
  const hop = Math.max(16, Math.round(opts.hopSize ?? 256));
  const minGap = Math.max(ABSOLUTE_MIN_GAP_MS, Number(opts.minGapMs ?? 180)) / 1000;
  const thresholdK = Number(opts.threshold ?? 1.4);
  const silenceFloor = Number(opts.silenceFloor ?? 0.08);
  const totalSamples = Math.floor(pcm.length / 2);
  if (totalSamples < windowSize) return { times: [], durationSeconds: totalSamples / sampleRate };

  const rms: number[] = [];
  for (let start = 0; start + windowSize <= totalSamples; start += hop) {
    let sum = 0;
    for (let i = start; i < start + windowSize; i += 1) {
      const sample = pcm.readInt16LE(i * 2) / 32768;
      sum += sample * sample;
    }
    rms.push(Math.sqrt(sum / windowSize));
  }

  let maxRms = 0;
  for (const value of rms) maxRms = Math.max(maxRms, value);
  const flux: number[] = rms.map((value, index) => (index === 0 ? 0 : Math.max(0, value - rms[index - 1])));
  const mean = flux.reduce((sum, value) => sum + value, 0) / flux.length;
  const variance = flux.reduce((sum, value) => sum + (value - mean) ** 2, 0) / flux.length;
  const threshold = Math.max(mean + thresholdK * Math.sqrt(variance), maxRms * 0.01);
  const floor = maxRms * silenceFloor;

  const peaks: Array<{ time: number; strength: number }> = [];
  for (let i = 1; i < flux.length - 1; i += 1) {
    if (flux[i] <= threshold || flux[i] <= flux[i - 1] || flux[i] <= flux[i + 1]) continue;
    const windowStart = i * hop;
    const localRms = Math.max(rms[i], rms[i - 1]);
    if (localRms < floor) continue;
    const time = (windowStart + windowSize / 2) / sampleRate;
    const previous = peaks[peaks.length - 1];
    if (previous && time - previous.time < minGap) {
      if (flux[i] > previous.strength) peaks[peaks.length - 1] = { time, strength: flux[i] };
      continue;
    }
    peaks.push({ time, strength: flux[i] });
  }

  return {
    times: peaks.map((peak) => roundTime(peak.time)),
    durationSeconds: roundTime(totalSamples / sampleRate),
  };
}

function ffmpegBinary(explicit?: string): string {
  return explicit || process.env.FFMPEG_PATH || "ffmpeg";
}

/** Decode with ffmpeg and analyse. Throws an actionable error if it is missing. */
export async function analyzeAudioFile(file: string, opts: DetectOptions = {}): Promise<BeatAnalysis> {
  const fps = Number(opts.fps) > 0 ? Number(opts.fps) : 60;
  const sampleRate = 16000;
  const bin = ffmpegBinary(opts.ffmpegPath);
  const args = ["-v", "error", "-nostdin", "-i", file, "-vn", "-ac", "1", "-ar", String(sampleRate), "-f", "s16le", "pipe:1"];

  const { stdout, stderr, code } = await new Promise<{ stdout: Buffer; stderr: string; code: number }>((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    const chunks: Buffer[] = [];
    let errors = "";
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      errors += chunk.toString("utf8");
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(new Error(`ffmpeg not found (${bin}). Install ffmpeg or pass --ffmpeg <path>, or provide a JSON beat file instead.`));
      } else {
        reject(error);
      }
    });
    child.on("close", (exitCode) => resolve({ stdout: Buffer.concat(chunks), stderr: errors, code: exitCode ?? 0 }));
  });

  if (code !== 0) {
    throw new Error(`ffmpeg could not decode ${file}: ${stderr.trim().split("\n").slice(-3).join(" ")}`);
  }
  if (!stdout.length) throw new Error(`ffmpeg produced no audio samples for ${file}`);

  const detected = detectBeatsFromPcm(stdout, sampleRate, opts);
  return normalize(detected.times, "seconds", fps, "ffmpeg", detected.durationSeconds, null);
}

/** Route by extension: .json/.txt/.csv are read directly, everything else is audio. */
export async function loadBeatSource(file: string, fps = 60, opts: DetectOptions = {}): Promise<BeatAnalysis> {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".json" || ext === ".jsonc" || ext === ".txt" || ext === ".csv") {
    return readBeatFile(file, fps);
  }
  return analyzeAudioFile(file, { ...opts, fps });
}

export function formatBeatSummary(analysis: BeatAnalysis): string {
  const bpm = analysis.bpm == null ? "?" : String(analysis.bpm);
  const duration = analysis.durationSeconds == null ? "?" : `${analysis.durationSeconds.toFixed(2)}s`;
  return `${analysis.count} beats | ${bpm} BPM | ${analysis.fps}fps | ${duration} | ${analysis.source}`;
}
