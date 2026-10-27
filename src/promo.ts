/**
 * Multi-scene promo renderer: renders each scene comp to a PNG sequence inside
 * Cavalry, encodes the sequences with local ffmpeg, concatenates them and
 * optionally muxes a background audio track into a final .mp4.
 *
 * The Cavalry side is a single atomic Undo script. Node owns ffmpeg so the
 * bridge never has to stream large binaries through the fire-and-forget post
 * endpoint.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { executeMotionScript, type ScriptOutcome } from "./runtime/execute.js";
import type { StallionConfig } from "./stallion.js";

export interface PromoSceneInput {
  comp: string;
  start?: number;
  end?: number;
  step?: number;
  name?: string;
}

export interface PromoTransition {
  type?: "none" | "fade";
  durationSeconds?: number;
}

export interface PromoPlanInput {
  scenes: Array<string | PromoSceneInput>;
  out?: string;
  fps?: number;
  width?: number;
  height?: number;
  audio?: string | null;
  workDir?: string;
  scale?: number;
  crf?: number;
  preset?: string;
  maxFramesPerScene?: number;
  transition?: PromoTransition;
}

export interface PromoScenePlan {
  index: number;
  comp: string;
  name: string;
  start: number | null;
  end: number | null;
  step: number;
  dir: string;
  maxFrames: number;
}

export interface NormalizedPromo {
  scenes: PromoScenePlan[];
  out: string;
  fps: number;
  width: number;
  height: number;
  audio: string | null;
  workDir: string;
  scale: number;
  crf: number;
  preset: string;
  transition: PromoTransition;
}

export interface PromoCommand {
  label: string;
  cmd: string;
  args: string[];
}

export interface PromoManifestScene {
  comp: string;
  dir: string;
  firstFrame?: number | null;
  lastFrame?: number | null;
  step?: number;
  frames: number;
  truncated?: boolean;
}

export interface PromoManifest {
  scenes: PromoManifestScene[];
  rendered: number;
  files: Array<{ scene: number; frame: number; file: string }>;
}

export interface PromoResult {
  out: string;
  workDir: string;
  fps: number;
  dryRun: boolean;
  scenes: Array<{ comp: string; dir: string; firstFrame: number | null; lastFrame: number | null; step: number; frames: number }>;
  frames: number;
  rendered: Array<{ scene: number; frame: number; file: string }>;
  commands: PromoCommand[];
  log: string[];
}

export interface PromoOptions {
  config?: StallionConfig;
  workDir?: string;
  dryRun?: boolean;
  ffmpegPath?: string;
  execute?: (code: string) => Promise<ScriptOutcome>;
  runCommand?: (cmd: string, args: string[]) => Promise<string>;
}

function positive(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function frameNumber(value: unknown, fallback: number | null): number | null {
  if (value == null || value === "") return fallback;
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : fallback;
}

function padFrame(frame: number): string {
  let text = String(Math.max(0, Math.round(frame)));
  while (text.length < 6) text = `0${text}`;
  return text;
}

export function normalizePromoPlan(input: unknown, workDir?: string): NormalizedPromo {
  if (!input || typeof input !== "object") throw new Error("Promo plan must be a JSON object");
  const raw = input as PromoPlanInput;
  if (!Array.isArray(raw.scenes) || raw.scenes.length === 0) throw new Error("Promo plan needs a non-empty scenes array");

  const fps = positive(raw.fps, 60);
  const resolvedWork = path.resolve(workDir ?? raw.workDir ?? path.join(os.homedir(), ".cavalry-mcp", "promos", new Date().toISOString().replace(/[:.]/g, "-")));
  const scenes: PromoScenePlan[] = raw.scenes.map((entry, index) => {
    const scene: PromoSceneInput = typeof entry === "string" ? { comp: entry } : entry;
    if (!scene || typeof scene !== "object" || !scene.comp) {
      throw new Error(`Promo scene ${index + 1} needs a comp id`);
    }
    return {
      index,
      comp: String(scene.comp),
      name: String(scene.name ?? `scene_${String(index + 1).padStart(2, "0")}`),
      start: frameNumber(scene.start, null),
      end: frameNumber(scene.end, null),
      step: Math.max(1, Math.round(positive(scene.step, 1))),
      dir: path.join(resolvedWork, String(scene.name ?? `scene_${String(index + 1).padStart(2, "0")}`)),
      maxFrames: Math.max(1, Math.round(positive(raw.maxFramesPerScene, 1200))),
    };
  });

  return {
    scenes,
    out: path.resolve(raw.out ?? path.join(resolvedWork, "promo.mp4")),
    fps,
    width: Math.round(positive(raw.width, 1920)),
    height: Math.round(positive(raw.height, 1080)),
    audio: raw.audio ? path.resolve(raw.audio) : null,
    workDir: resolvedWork,
    scale: positive(raw.scale, 100),
    crf: positive(raw.crf, 18),
    preset: raw.preset ? String(raw.preset) : "medium",
    transition: raw.transition && typeof raw.transition === "object" ? raw.transition : { type: "none" },
  };
}

/** One atomic script that renders every scene's frame samples. */
export function buildPromoScript(plan: NormalizedPromo): string {
  const scenes = plan.scenes.map((scene) => ({
    comp: scene.comp,
    dir: scene.dir.replace(/\\/g, "/"),
    start: scene.start,
    end: scene.end,
    step: scene.step,
    maxFrames: scene.maxFrames,
  }));
  return `const __promo = ${JSON.stringify({ scenes, scale: plan.scale })};
const __pad = (n) => {
  let s = String(Math.max(0, Math.round(n)));
  while (s.length < 6) s = "0" + s;
  return s;
};
const __scenes = [];
const __files = [];
for (let i = 0; i < __promo.scenes.length; i++) {
  const scene = __promo.scenes[i];
  api.setActiveComp(scene.comp);
  let start = scene.start;
  if (start == null) {
    try { start = api.getInFrame(scene.comp); } catch (e) { start = 0; }
  }
  let end = scene.end;
  if (end == null) {
    try { end = api.getOutFrame(scene.comp); } catch (e) { end = start + 60; }
  }
  start = Math.round(Number(start) || 0);
  end = Math.round(Number(end) || 0);
  if (end < start) { const swap = start; start = end; end = swap; }
  const step = Math.max(1, Math.round(Number(scene.step) || 1));
  const limit = Math.max(1, Math.round(Number(scene.maxFrames) || 1200));
  let frames = 0;
  let last = start;
  let truncated = false;
  for (let f = start; f <= end; f += step) {
    if (frames >= limit) { truncated = true; break; }
    api.setFrame(f);
    const base = scene.dir + "/frame_" + __pad(f);
    api.renderPNGFrame(base, __promo.scale);
    __files.push({ scene: i, frame: f, file: base + ".png" });
    frames += 1;
    last = f;
  }
  __scenes.push({
    comp: scene.comp,
    dir: scene.dir,
    firstFrame: frames ? start : null,
    lastFrame: frames ? last : null,
    step: step,
    frames: frames,
    truncated: truncated
  });
}
return { scenes: __scenes, rendered: __files.length, files: __files };`;
}

function concatList(sceneDir: string, frames: Array<{ frame: number }>, fps: number): string {
  const duration = (1 / fps).toFixed(6);
  const lines = ["ffconcat version 1.0"];
  for (const entry of frames) {
    const file = path.join(sceneDir, `frame_${padFrame(entry.frame)}.png`).replace(/\\/g, "/");
    lines.push(`file '${file}'`);
    lines.push(`duration ${duration}`);
  }
  if (frames.length) {
    const last = path.join(sceneDir, `frame_${padFrame(frames[frames.length - 1].frame)}.png`).replace(/\\/g, "/");
    lines.push(`file '${last}'`);
  }
  return `${lines.join("\n")}\n`;
}

export function buildPromoCommands(
  plan: NormalizedPromo,
  manifest: PromoManifest,
  ffmpegPath = "ffmpeg",
): { commands: PromoCommand[]; concatPath: string; silentOut: string } {
  const commands: PromoCommand[] = [];
  const scaleFilter = `scale=${plan.width}:${plan.height}:force_original_aspect_ratio=decrease,pad=${plan.width}:${plan.height}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
  const sceneVideos: string[] = [];

  manifest.scenes.forEach((scene, index) => {
    const files = manifest.files.filter((entry) => entry.scene === index);
    if (!files.length) return;
    const imagesPath = path.join(scene.dir, "images.txt");
    const sceneOut = path.join(plan.workDir, `${String(index + 1).padStart(2, "0")}_${plan.scenes[index].name}.mp4`);
    sceneVideos.push(sceneOut);
    commands.push({
      label: `encode scene ${index + 1} (${files.length} frames)`,
      cmd: ffmpegPath,
      args: [
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", imagesPath,
        "-vf", `fps=${plan.fps},${scaleFilter}`,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-crf", String(plan.crf),
        "-preset", plan.preset,
        "-r", String(plan.fps),
        sceneOut,
      ],
    });
  });

  const concatPath = path.join(plan.workDir, "scenes.txt");
  const silentOut = path.join(plan.workDir, "promo_silent.mp4");
  if (sceneVideos.length) {
    commands.push({
      label: `concat ${sceneVideos.length} scene(s)`,
      cmd: ffmpegPath,
      args: ["-y", "-f", "concat", "-safe", "0", "-i", concatPath, "-c", "copy", silentOut],
    });
  }
  if (plan.audio) {
    commands.push({
      label: "mux background audio",
      cmd: ffmpegPath,
      args: [
        "-y",
        "-i", silentOut,
        "-i", plan.audio,
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        plan.out,
      ],
    });
  }
  return { commands, concatPath, silentOut };
}

async function writeImageLists(manifest: PromoManifest, plan: NormalizedPromo): Promise<string> {
  for (let i = 0; i < manifest.scenes.length; i += 1) {
    const scene = manifest.scenes[i];
    const files = manifest.files.filter((entry) => entry.scene === i);
    if (!files.length) continue;
    await fs.mkdir(scene.dir, { recursive: true });
    await fs.writeFile(path.join(scene.dir, "images.txt"), concatList(scene.dir, files, plan.fps), "utf8");
  }
  const concatPath = path.join(plan.workDir, "scenes.txt");
  const lines = manifest.scenes
    .map((scene, index) => ({ scene, index }))
    .filter(({ scene }) => scene.frames > 0)
    .map(({ index }) => `file '${path.join(plan.workDir, `${String(index + 1).padStart(2, "0")}_${plan.scenes[index].name}.mp4`).replace(/\\/g, "/")}'`);
  await fs.writeFile(concatPath, `${lines.join("\n")}\n`, "utf8");
  return concatPath;
}

function defaultRunCommand(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") reject(new Error(`${cmd} not found. Install ffmpeg or pass --ffmpeg <path>.`));
      else reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${cmd} exited with ${code}: ${stderr.trim().split("\n").slice(-4).join(" ")}`));
    });
  });
}

/** Predicted manifest for --dry-run, before Cavalry has rendered anything. */
function predictManifest(plan: NormalizedPromo): PromoManifest {
  const scenes: PromoManifestScene[] = plan.scenes.map((scene) => {
    const start = scene.start ?? 0;
    const end = scene.end ?? start + 60;
    const frames = Math.min(scene.maxFrames, Math.max(0, Math.floor((end - start) / scene.step) + 1));
    return {
      comp: scene.comp,
      dir: scene.dir,
      firstFrame: frames ? start : null,
      lastFrame: frames ? start + (frames - 1) * scene.step : null,
      step: scene.step,
      frames,
    };
  });
  const files = plan.scenes.flatMap((scene, index) => {
    const info = scenes[index];
    if (info.firstFrame == null || info.lastFrame == null) return [];
    const out: Array<{ scene: number; frame: number; file: string }> = [];
    for (let frame = info.firstFrame, n = 0; n < info.frames; frame += scene.step, n += 1) {
      out.push({ scene: index, frame, file: path.join(scene.dir, `frame_${padFrame(frame)}.png`) });
    }
    return out;
  });
  return { scenes, rendered: files.length, files };
}

export async function runPromo(input: unknown, opts: PromoOptions = {}): Promise<PromoResult> {
  const plan = normalizePromoPlan(input, opts.workDir);
  const dryRun = opts.dryRun === true;
  await fs.mkdir(plan.workDir, { recursive: true });
  for (const scene of plan.scenes) await fs.mkdir(scene.dir, { recursive: true });
  await fs.mkdir(path.dirname(plan.out), { recursive: true });

  let manifest: PromoManifest;
  const log: string[] = [];

  if (dryRun) {
    manifest = predictManifest(plan);
  } else {
    const execute = opts.execute ?? ((code: string) => executeMotionScript(code, opts.config, { helpers: false }));
    const outcome = await execute(buildPromoScript(plan));
    if (!outcome.ok) throw new Error(`Promo render failed: ${outcome.text}`);
    try {
      manifest = JSON.parse(outcome.text) as PromoManifest;
    } catch {
      throw new Error(`Promo render returned unparsable data: ${outcome.text.slice(0, 300)}`);
    }
    if (!manifest || !Array.isArray(manifest.scenes)) throw new Error("Promo render returned no scene manifest");
  }

  const { commands } = buildPromoCommands(plan, manifest, opts.ffmpegPath);
  if (!dryRun && manifest.rendered > 0) {
    await writeImageLists(manifest, plan);
    const run = opts.runCommand ?? defaultRunCommand;
    for (const command of commands) {
      log.push(`${command.label}: ${command.cmd} ${command.args.join(" ")}`);
      await run(command.cmd, command.args);
    }
    if (!plan.audio) {
      const silent = path.join(plan.workDir, "promo_silent.mp4");
      await fs.rename(silent, plan.out);
    }
  } else if (!dryRun && manifest.rendered === 0) {
    throw new Error("Promo render produced no frames");
  }

  return {
    out: plan.out,
    workDir: plan.workDir,
    fps: plan.fps,
    dryRun,
    scenes: manifest.scenes.map((scene) => ({
      comp: scene.comp,
      dir: scene.dir,
      firstFrame: scene.firstFrame ?? null,
      lastFrame: scene.lastFrame ?? null,
      step: scene.step ?? 1,
      frames: scene.frames,
    })),
    frames: manifest.rendered,
    rendered: manifest.files,
    commands,
    log,
  };
}

/** Locate the concat file path for callers that want to edit the plan. */
export function promoConcatPath(result: PromoResult): string {
  return path.join(result.workDir, "scenes.txt");
}
