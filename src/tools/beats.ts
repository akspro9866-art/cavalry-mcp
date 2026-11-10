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

export type SfxKind = "whoosh" | "pop" | "click" | "riser" | "subDrop" | "chime";

export interface SfxCueSpec {
  frame: number;
  timeSeconds?: number;
  kind?: SfxKind;
  gainDb?: number;
  durationMs?: number;
  pitchHz?: number;
  label?: string;
}

export interface TimelineJsonContract {
  schema: "claude-motion/timeline@1";
  fps: number;
  bpm: number | null;
  durationSeconds: number;
  targetLufs: number;
  truePeakCeilingDb: number;
  sampleRate: number;
  beats: Array<{ index: number; frame: number; timeSeconds: number }>;
  cues: Array<{
    index: number;
    frame: number;
    timeSeconds: number;
    kind: SfxKind;
    gainDb: number;
    durationMs: number;
    pitchHz: number;
    label: string;
  }>;
}

export interface SfxCompileOptions {
  targetLufs?: number;
  sampleRate?: number;
  cues?: SfxCueSpec[];
  pythonScriptPath?: string;
}

export interface SfxCompileResult {
  outWavPath: string;
  engine: "python-sfx" | "ts-synthesizer";
  sampleRate: number;
  durationSeconds: number;
  measuredLufs: number;
  targetLufs: number;
  cueCount: number;
  timeline: TimelineJsonContract;
}

const DEFAULT_CYCLE_KINDS: readonly SfxKind[] = ["subDrop", "pop", "click", "whoosh", "chime", "riser"];

/**
 * Build the `timeline.json` contract (`whaleyxbt/claude-motion` `sfx/` format)
 * mapping beat frames and optional motion cues into a deterministic cue sheet.
 */
export function buildTimelineJsonContract(
  analysis: BeatAnalysis,
  cues?: SfxCueSpec[],
  opts: { targetLufs?: number; sampleRate?: number } = {},
): TimelineJsonContract {
  const fps = analysis.fps > 0 ? analysis.fps : 60;
  const sampleRate = Math.max(8000, Math.round(opts.sampleRate ?? 44100));
  const targetLufs = opts.targetLufs ?? -14;
  const beats = analysis.frames.map((frame, index) => ({
    index,
    frame,
    timeSeconds: roundTime(frame / fps),
  }));

  const rawCues: SfxCueSpec[] =
    cues && cues.length > 0
      ? cues
      : beats.map((beat, idx) => ({
          frame: beat.frame,
          timeSeconds: beat.timeSeconds,
          kind: DEFAULT_CYCLE_KINDS[idx % DEFAULT_CYCLE_KINDS.length],
          gainDb: idx === 0 ? 0 : -2,
          label: `beat_${String(idx + 1).padStart(2, "0")}`,
        }));

  const normalizedCues = rawCues.map((cue, index) => {
    const frame = Math.max(0, Math.round(Number(cue.frame) || 0));
    const timeSeconds = cue.timeSeconds != null ? roundTime(Number(cue.timeSeconds)) : roundTime(frame / fps);
    const kind: SfxKind = cue.kind ?? DEFAULT_CYCLE_KINDS[index % DEFAULT_CYCLE_KINDS.length];
    const defaultDur =
      kind === "click" ? 35 : kind === "pop" ? 75 : kind === "whoosh" ? 210 : kind === "riser" ? 320 : 180;
    const defaultPitch =
      kind === "subDrop" ? 68 : kind === "pop" ? 320 : kind === "click" ? 1400 : kind === "chime" ? 880 : 240;
    return {
      index,
      frame,
      timeSeconds,
      kind,
      gainDb: Number.isFinite(Number(cue.gainDb)) ? Number(cue.gainDb) : 0,
      durationMs: Math.max(15, Math.round(Number(cue.durationMs ?? defaultDur))),
      pitchHz: Math.max(30, Number(cue.pitchHz ?? defaultPitch)),
      label: cue.label ?? `${kind}_${frame}`,
    };
  });

  const lastCueEnd = normalizedCues.reduce(
    (max, cue) => Math.max(max, cue.timeSeconds + cue.durationMs / 1000 + 0.15),
    0,
  );
  const durationSeconds = roundTime(
    Math.max(analysis.durationSeconds ?? 0, beats.at(-1)?.timeSeconds ?? 0, lastCueEnd, 0.5),
  );

  return {
    schema: "claude-motion/timeline@1",
    fps,
    bpm: analysis.bpm,
    durationSeconds,
    targetLufs,
    truePeakCeilingDb: -1.0,
    sampleRate,
    beats,
    cues: normalizedCues,
  };
}

function synthesizeCueSamples(
  floatBuf: Float64Array,
  sampleRate: number,
  cue: TimelineJsonContract["cues"][number],
): void {
  const startSample = Math.max(0, Math.round(cue.timeSeconds * sampleRate));
  const totalSamples = Math.max(16, Math.round((cue.durationMs / 1000) * sampleRate));
  const linearGain = Math.pow(10, cue.gainDb / 20) * 0.65;

  for (let i = 0; i < totalSamples && startSample + i < floatBuf.length; i++) {
    const t = i / sampleRate;
    const u = i / totalSamples;
    let sample = 0;
    if (cue.kind === "pop") {
      const freq = cue.pitchHz * (1 + 0.8 * Math.exp(-u * 10));
      const env = Math.sin(Math.PI * Math.min(1, u * 6)) * Math.exp(-u * 6.5);
      sample = Math.sin(2 * Math.PI * freq * t) * env;
    } else if (cue.kind === "click") {
      const env = Math.exp(-u * 22);
      sample = (Math.sin(2 * Math.PI * cue.pitchHz * t) + 0.4 * Math.sin(2 * Math.PI * cue.pitchHz * 2.3 * t)) * env;
    } else if (cue.kind === "subDrop") {
      const freq = cue.pitchHz * Math.pow(0.42, u);
      const env = Math.exp(-u * 4.2);
      sample = Math.sin(2 * Math.PI * freq * t) * env;
    } else if (cue.kind === "whoosh") {
      // Deterministic filtered pseudo-noise + swept formant
      const noise = Math.sin(i * 12.9898 + cue.index * 78.233) * 43758.5453;
      const white = (noise - Math.floor(noise)) * 2 - 1;
      const env = Math.sin(Math.PI * u) ** 1.6;
      const sweep = Math.sin(2 * Math.PI * (cue.pitchHz * (0.6 + 1.2 * u)) * t);
      sample = (0.55 * white + 0.45 * sweep) * env;
    } else if (cue.kind === "riser") {
      const freq = cue.pitchHz * (0.5 + 1.8 * u * u);
      const env = u * u * (1 - 0.15 * u);
      sample = Math.sin(2 * Math.PI * freq * t) * env;
    } else {
      // chime
      const env = Math.exp(-u * 5.0);
      sample =
        (0.65 * Math.sin(2 * Math.PI * cue.pitchHz * t) +
          0.35 * Math.sin(2 * Math.PI * cue.pitchHz * 1.5 * t)) *
        env;
    }
    floatBuf[startSample + i] += sample * linearGain;
  }
}

/**
 * Normalize a floating-point mono buffer to `targetLufs` (default `-14.0 LUFS`)
 * using ITU-R BS.1770 mean-square loudness estimation:
 *   LUFS ≈ -0.691 + 10 * log10(meanSquare)
 */
function normalizeToTargetLufs(
  floatBuf: Float64Array,
  targetLufs = -14,
): { pcm16: Buffer; measuredLufs: number } {
  let sumSq = 0;
  for (let i = 0; i < floatBuf.length; i++) {
    sumSq += floatBuf[i] * floatBuf[i];
  }
  const meanSq = sumSq / Math.max(1, floatBuf.length);
  if (meanSq <= 1e-15) {
    // Inject a brief reference tone if cues were empty so loudness is measurable
    const refLen = Math.min(floatBuf.length, 4096);
    for (let i = 0; i < refLen; i++) {
      floatBuf[i] = Math.sin((2 * Math.PI * 440 * i) / 44100) * 0.25;
    }
    return normalizeToTargetLufs(floatBuf, targetLufs);
  }
  const currentLufs = -0.691 + 10 * Math.log10(meanSq);
  const deltaDb = targetLufs - currentLufs;
  const gain = Math.pow(10, deltaDb / 20);

  let finalSumSq = 0;
  const samples = new Int16Array(floatBuf.length);
  const ceiling = Math.pow(10, -1.0 / 20); // -1.0 dBTP soft limiter
  for (let i = 0; i < floatBuf.length; i++) {
    const scaled = floatBuf[i] * gain;
    // Soft-clip only if exceeding ceiling while preserving target RMS
    const limited = Math.abs(scaled) > ceiling ? Math.sign(scaled) * (ceiling + Math.tanh(Math.abs(scaled) - ceiling) * (1 - ceiling)) : scaled;
    const clamped = Math.max(-1, Math.min(1, limited));
    finalSumSq += scaled * scaled;
    samples[i] = Math.round(clamped * 32767);
  }
  const finalMeanSq = finalSumSq / Math.max(1, floatBuf.length);
  const measuredLufs = Math.round((-0.691 + 10 * Math.log10(Math.max(1e-12, finalMeanSq))) * 100) / 100;
  return {
    pcm16: Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength),
    measuredLufs,
  };
}

function encodeWavMono16(pcm16: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm16.length, 4);
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
  header.writeUInt32LE(pcm16.length, 40);
  return Buffer.concat([header, pcm16]);
}

/**
 * Compile a beat-synced `-14 LUFS` SFX WAV track from a `BeatAnalysis` or `TimelineJsonContract`.
 */
export async function compileBeatSfxTrack(
  timelineOrAnalysis: BeatAnalysis | TimelineJsonContract,
  outWavPath: string,
  opts: SfxCompileOptions = {},
): Promise<SfxCompileResult> {
  const resolvedOut = path.resolve(outWavPath);
  const timeline: TimelineJsonContract =
    "schema" in timelineOrAnalysis
      ? timelineOrAnalysis
      : buildTimelineJsonContract(timelineOrAnalysis, opts.cues, {
          targetLufs: opts.targetLufs,
          sampleRate: opts.sampleRate,
        });

  const sampleRate = timeline.sampleRate;
  const targetLufs = opts.targetLufs ?? timeline.targetLufs ?? -14;
  const totalSamples = Math.max(sampleRate / 2, Math.round(timeline.durationSeconds * sampleRate));
  const floatBuf = new Float64Array(totalSamples);

  for (const cue of timeline.cues) {
    synthesizeCueSamples(floatBuf, sampleRate, cue);
  }

  const { pcm16, measuredLufs } = normalizeToTargetLufs(floatBuf, targetLufs);
  const wav = encodeWavMono16(pcm16, sampleRate);
  await fs.mkdir(path.dirname(resolvedOut), { recursive: true });
  await fs.writeFile(resolvedOut, wav);

  return {
    outWavPath: resolvedOut,
    engine: "ts-synthesizer",
    sampleRate,
    durationSeconds: timeline.durationSeconds,
    measuredLufs,
    targetLufs,
    cueCount: timeline.cues.length,
    timeline,
  };
}

export interface PremiereMarkerEntry {
  name: string;
  startTimeSeconds: number;
  durationSeconds: number;
  frame: number;
  color: string;
  type: "Comment" | "Chapter" | "Segmentation";
}

export interface ResolveTimelineMarker {
  frameId: number;
  color: string;
  name: string;
  note: string;
  duration: number;
}

/**
 * Export `BeatAnalysis` into Adobe Premiere Pro marker JSON format
 * (adapted from `hetpatel-11/adobe_premiere_pro_mcp`).
 */
export function exportPremiereMarkersJson(
  analysis: BeatAnalysis,
  opts: { cueNamePrefix?: string; color?: string } = {},
): { fps: number; bpm: number | null; markers: PremiereMarkerEntry[] } {
  const prefix = opts.cueNamePrefix ?? "Beat";
  const color = opts.color ?? "Green";
  const fps = analysis.fps > 0 ? analysis.fps : 60;
  return {
    fps,
    bpm: analysis.bpm,
    markers: analysis.frames.map((frame, i) => ({
      name: `${prefix} ${i + 1}`,
      startTimeSeconds: roundTime(frame / fps),
      durationSeconds: 0,
      frame,
      color,
      type: "Comment",
    })),
  };
}

/**
 * Export `BeatAnalysis` into DaVinci Resolve timeline marker dictionary format
 * (adapted from `samuelgursky/davinci-resolve-mcp`).
 */
export function exportResolveTimelineMarkers(
  analysis: BeatAnalysis,
  opts: { color?: string; note?: string } = {},
): Record<number, ResolveTimelineMarker> {
  const color = opts.color ?? "Blue";
  const note = opts.note ?? "Cavalry MCP Beat Sync";
  const out: Record<number, ResolveTimelineMarker> = {};
  analysis.frames.forEach((frame, i) => {
    out[frame] = {
      frameId: frame,
      color,
      name: `Beat_${String(i + 1).padStart(2, "0")}`,
      note,
      duration: 1,
    };
  });
  return out;
}

/**
 * Import Premiere Pro or DaVinci Resolve timeline markers into a `BeatAnalysis`.
 */
export function importNleMarkers(payload: unknown, fallbackFps = 60): BeatAnalysis {
  if (!payload || typeof payload !== "object") {
    throw new Error("importNleMarkers requires a marker object or array");
  }
  const obj = payload as Record<string, unknown>;
  const fps = Number(obj.fps) > 0 ? Number(obj.fps) : fallbackFps;
  if (Array.isArray(obj.markers)) {
    const frames = obj.markers
      .map((entry: unknown) => {
        if (!entry || typeof entry !== "object") return null;
        const m = entry as Record<string, unknown>;
        if (m.frame != null && Number.isFinite(Number(m.frame))) return Math.round(Number(m.frame));
        if (m.startTimeSeconds != null && Number.isFinite(Number(m.startTimeSeconds))) {
          return Math.round(Number(m.startTimeSeconds) * fps);
        }
        return null;
      })
      .filter((v): v is number => v != null && v >= 0);
    return parseBeatPayload({ fps, frames }, fps);
  }
  const resolveFrames = Object.entries(obj)
    .map(([key, val]) => {
      if (val && typeof val === "object" && "frameId" in (val as Record<string, unknown>)) {
        return Math.round(Number((val as Record<string, unknown>).frameId));
      }
      const k = Number(key);
      return Number.isFinite(k) ? Math.round(k) : null;
    })
    .filter((v): v is number => v != null && v >= 0);
  return parseBeatPayload({ fps, frames: resolveFrames }, fps);
}
