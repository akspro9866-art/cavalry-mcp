#!/usr/bin/env node
import fs from "node:fs";
import { compilePreset, hasPreset, listPresets, presetRig } from "../dist/presets/cavalry_snippets.js";
import { executeMotionScript } from "../dist/runtime/execute.js";
import { compileInspection } from "../dist/runtime/inspect.js";
import { formatExecutionState } from "../dist/state.js";
import { loadBeatSource, formatBeatSummary } from "../dist/beats.js";
import { runPromo } from "../dist/promo.js";
import { runVerifyFrames } from "../dist/verify.js";
import { runRenderFrames, formatRenderSummary } from "../dist/render-frames.js";
import { runProbe } from "../dist/probe.js";

const usage = `stallion -e "<javascript>" | -f <script.js> | -p <preset> '<json>' | --list [category] | --rig <preset> | --sel
         --audio-beats <audio|beats.json> [--fps N] [--beats-out <file>] [--ffmpeg <path>]
         --render-promo <plan.json> [--out <mp4>] [--audio <track>] [--workdir <dir>] [--dry-run]
         --verify-frames <f1,f2,f3|f1-f3:step> [--out <dir>] [--scale N] [--comp <id>]
         --render-frames <f1-f2|f1,f2|f1-f2:step> [--out <dir>] [--pattern <p>] [--scale N] [--comp <id>]
             [--chunk N] [--per-frame-ms N] [--timeout-ms N] [--grace-ms N] [--no-resume]
         --probe [--layer <id>]... [--function <name>]... [--types] [--inline-surface] [--capabilities-out <file>]
         (global flags: --state, --fps N, --ffmpeg <path>)`;

const args = process.argv.slice(2);

function takeValue(flag) {
  const index = args.indexOf(flag);
  if (index < 0) return null;
  const value = args[index + 1];
  if (value == null || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  args.splice(index, 2);
  return value;
}

function takeBool(flag) {
  const index = args.indexOf(flag);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

/** Repeatable flag: `--layer a --layer b`. */
function takeValues(flag) {
  const values = [];
  for (;;) {
    const index = args.indexOf(flag);
    if (index < 0) return values;
    const value = args[index + 1];
    if (value == null || value.startsWith("--")) throw new Error(`${flag} requires a value`);
    args.splice(index, 2);
    values.push(value);
  }
}

const stateFlag = takeBool("--state");
const fpsFlag = takeValue("--fps");
const beatsOut = takeValue("--beats-out");
const ffmpegFlag = takeValue("--ffmpeg");
const outFlag = takeValue("--out");
const audioFlag = takeValue("--audio");
const workFlag = takeValue("--workdir");
const dryRun = takeBool("--dry-run");
const audioBeats = takeValue("--audio-beats");
const renderPromo = takeValue("--render-promo");
const verifyFrames = takeValue("--verify-frames");
const renderFrames = takeValue("--render-frames");
const probeApi = takeBool("--probe");
const patternFlag = takeValue("--pattern");
const scaleFlag = takeValue("--scale");
const compFlag = takeValue("--comp");
const chunkFlag = takeValue("--chunk");
const perFrameFlag = takeValue("--per-frame-ms");
const timeoutFlag = takeValue("--timeout-ms");
const graceFlag = takeValue("--grace-ms");
const noResume = takeBool("--no-resume");
const capabilitiesOut = takeValue("--capabilities-out");
const inlineSurface = takeBool("--inline-surface");
const noTypes = takeBool("--no-types");
const layerFlag = takeValues("--layer");
const functionFlag = takeValues("--function");

/** Undefined keeps the module default; the CLI never hard-codes a budget. */
function num(value) {
  if (value == null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Expected a number, got "${value}"`);
  return parsed;
}

let code;
let helpers = true;

async function activeCompFps() {
  if (fpsFlag) return Number(fpsFlag) > 0 ? Number(fpsFlag) : 60;
  const probe = await executeMotionScript(
    `const id = api.getActiveComp(); return { fps: Number(api.get(id, "fps")) || 60 };`,
    undefined,
    { helpers: false },
  );
  if (probe.ok) {
    try {
      const fps = Number(JSON.parse(probe.text).fps);
      if (fps > 0) return fps;
    } catch {
      // fall through to the default
    }
  }
  return 60;
}

try {
  if (audioBeats) {
    const fps = await activeCompFps();
    const analysis = await loadBeatSource(audioBeats, fps, {
      fps,
      ffmpegPath: ffmpegFlag || undefined,
    });
    if (beatsOut) {
      fs.writeFileSync(
        beatsOut,
        JSON.stringify({ fps: analysis.fps, frames: analysis.frames, times: analysis.times, bpm: analysis.bpm }, null, 2),
      );
    }
    console.log(JSON.stringify(analysis));
    console.error(`[beats] ${formatBeatSummary(analysis)}${beatsOut ? ` -> ${beatsOut}` : ""}`);
  } else if (renderPromo) {
    const plan = JSON.parse(fs.readFileSync(renderPromo, "utf8"));
    if (!plan || typeof plan !== "object" || Array.isArray(plan)) throw new Error("Promo plan must be a JSON object");
    if (outFlag) plan.out = outFlag;
    if (audioFlag) plan.audio = audioFlag;
    if (workFlag) plan.workDir = workFlag;
    if (fpsFlag) plan.fps = Number(fpsFlag);
    const result = await runPromo(plan, {
      workDir: workFlag || undefined,
      dryRun,
      ffmpegPath: ffmpegFlag || undefined,
    });
    console.log(JSON.stringify(result, null, 2));
    if (!dryRun && result.rendered === 0) process.exitCode = 1;
  } else if (verifyFrames) {
    const result = await runVerifyFrames({
      frames: verifyFrames,
      outDir: outFlag || undefined,
      scale: num(scaleFlag),
      comp: compFlag || undefined,
    });
    console.log(JSON.stringify(result, null, 2));
    for (const warning of result.warnings) console.error(`[verify] WARNING ${warning}`);
    console.error(
      `[verify] ${result.frames.length} preview(s) -> ${result.outDir}` +
        (result.collisions.length ? ` | ${result.collisions.length} collision(s)` : "") +
        ` | frame restored to ${result.restoredFrame}`,
    );
    if (result.missing.length) process.exitCode = 1;
  } else if (renderFrames) {
    const result = await runRenderFrames(
      {
        frames: renderFrames,
        outDir: outFlag || undefined,
        pattern: patternFlag || undefined,
        scale: num(scaleFlag),
        comp: compFlag || undefined,
        chunkFrames: num(chunkFlag),
        perFrameMs: num(perFrameFlag),
        timeoutMs: num(timeoutFlag),
        graceMs: num(graceFlag),
        resume: noResume ? false : undefined,
      },
      { onChunk: chunk => console.error(`[render] chunk ${chunk.index}: ${chunk.status} (${chunk.rendered.length}/${chunk.frames.length})`) },
    );
    console.log(JSON.stringify(result, null, 2));
    for (const note of result.limitations) console.error(`[render] NOTE ${note}`);
    console.error(`[render] ${formatRenderSummary(result)}`);
    if (result.status !== "complete") process.exitCode = 1;
  } else if (probeApi) {
    const result = await runProbe({
      layerIds: layerFlag.length ? layerFlag : undefined,
      functions: functionFlag.length ? functionFlag : undefined,
      sampleTypes: noTypes ? false : undefined,
      inlineSurface,
      writeFile: capabilitiesOut || undefined,
    });
    console.log(JSON.stringify(result, null, 2));
    console.error(
      `[probe] ${result.present.length} present / ${result.missing.length} missing` +
        ` | ${result.apiFunctionCount} api function(s) | ${result.attributeSamples.length} sample(s) -> ${result.file}`,
    );
    for (const warning of result.warnings) console.error(`[probe] WARNING ${warning}`);
  } else {
    if (args[0] === "-e" && args[1]) {
      code = args[1];
    } else if (args[0] === "-f" && args[1]) {
      code = fs.readFileSync(args[1], "utf8");
    } else if (args[0] === "-p" && args[1]) {
      if (!hasPreset(args[1])) throw new Error(`Unknown preset: ${args[1]}`);
      const params = args[2] ? JSON.parse(args[2]) : {};
      if (!params || Array.isArray(params) || typeof params !== "object") {
        throw new Error("Preset arguments must be a JSON object");
      }
      code = compilePreset(args[1], params);
    } else if (args[0] === "--list") {
      const presets = listPresets(args[1]);
      if (presets.length === 0) throw new Error(`No presets found for category: ${args[1]}`);
      const idWidth = Math.min(34, Math.max(...presets.map(p => p.id.length)) + 2);
      for (const preset of presets) {
        const params = Object.entries(preset.params)
          .map(([key, def]) => `${key}=${JSON.stringify(def.default)}`)
          .join(" ");
        console.log(`${preset.id.padEnd(idWidth)}${preset.title.padEnd(30)}[${preset.category}]  ${params}`);
      }
    } else if (args[0] === "--rig") {
      if (!args[1]) throw new Error("--rig requires a preset id");
      const contract = presetRig(args[1]);
      if (!contract) throw new Error(`Unknown preset: ${args[1]}`);
      console.log(JSON.stringify({ id: args[1], ...contract }, null, 2));
    } else if (args[0] === "--sel") {
      code = compileInspection("selection");
      helpers = false;
    } else {
      console.error(usage);
      process.exitCode = args[0] === "--help" || args[0] === "-h" ? 0 : 1;
    }

    if (code !== undefined) {
      const outcome = await executeMotionScript(code, undefined, { helpers });
      if (outcome.ok) console.log(outcome.text);
      else {
        console.error(outcome.text);
        process.exitCode = 1;
      }
      if (outcome.state && stateFlag) console.error(JSON.stringify(outcome.state, null, 2));
      else if (outcome.state && !outcome.ok) console.error(`[state] ${formatExecutionState(outcome.state)}`);
    }
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
