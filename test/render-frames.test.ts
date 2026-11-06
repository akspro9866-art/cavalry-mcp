import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { buildMockApi, createMockApiState } from "./mock-cavalry-api.js";
import type { MockApi } from "./mock-cavalry-api.js";
import { wrapAtomicScript } from "../src/runtime/atomic.js";
import { NO_RESULT_MESSAGE, toSceneUri } from "../src/lib.js";
import type { ScriptOutcome } from "../src/runtime/execute.js";
import {
  buildRenderChunkScript,
  chunkSizeFor,
  defaultFramesDir,
  estimateRenderDurationMs,
  frameTarget,
  normalizeRenderFrames,
  planRenderChunks,
  renderProgressSchema,
  runRenderFrames,
  type NormalizedRenderFrames,
} from "../src/render-frames.js";
import { removeTreeSync } from "../src/fs-safe.js";

const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "cav-render-"));
test.after(() => removeTreeSync(workdir));

function dir(tag: string): string {
  return path.join(workdir, tag);
}

/**
 * Execute a chunk against the mock API, exactly as the bridge would: the script
 * is atomic-wrapped, run in a sandbox, and answered with its `__result`.
 *
 * `failOnChunk` models the case that cost real time to diagnose: the POST never
 * answers, so the script is NOT run by us (nothing lands on disk) or, with
 * `writeFilesAnyway`, the bridge keeps rendering after the deadline and only the
 * answer is lost.
 */
function mockExecutor(api: MockApi, opts: { failOnChunk?: number; writeFilesAnyway?: boolean } = {}) {
  const calls: Array<{ frames: number[]; budget: { timeoutMs: number; httpTimeoutMs: number } }> = [];
  const execute = async (
    code: string,
    budget: { timeoutMs: number; httpTimeoutMs: number },
  ): Promise<ScriptOutcome> => {
    const payload = JSON.parse(/const __render = ([\s\S]*?);\n/.exec(code)?.[1] ?? "{}") as {
      entries: Array<{ frame: number; base: string }>;
    };
    const entries = payload.entries ?? [];
    const index = calls.length;
    calls.push({ frames: entries.map(entry => entry.frame), budget });
    if (opts.failOnChunk === index) {
      if (opts.writeFilesAnyway) {
        for (const entry of entries) {
          fs.mkdirSync(path.dirname(entry.base), { recursive: true });
          fs.writeFileSync(`${entry.base}.png`, "x");
        }
      }
      return { ok: false, text: NO_RESULT_MESSAGE, state: null };
    }
    const context = vm.createContext({ api, console });
    new vm.Script(wrapAtomicScript(code, false)).runInContext(context);
    const manifest = (context as { __result?: unknown }).__result;
    return { ok: true, text: JSON.stringify(manifest ?? null), state: null };
  };
  return { execute, calls };
}

test("render: chunk size is derived from the deadline, not guessed", () => {
  // The 45 s ceiling that used to live only in the environment.
  assert.equal(chunkSizeFor({ timeoutMs: 45_000, perFrameMs: 1_000 }), 40);
  assert.equal(chunkSizeFor({ timeoutMs: 25_000, perFrameMs: 1_000 }), 23);
  assert.equal(chunkSizeFor({ timeoutMs: 25_000, perFrameMs: 11_000 }), 2);
  assert.equal(chunkSizeFor({ timeoutMs: 5_000, perFrameMs: 60_000 }), 1, "never below one frame");
  assert.equal(chunkSizeFor({ timeoutMs: 45_000, perFrameMs: 1_000, chunkFrames: 12 }), 12, "explicit wins");
  assert.equal(chunkSizeFor({ timeoutMs: 45_000, perFrameMs: 1_000, chunkFrames: 900 }), 40, "capped");
  assert.deepEqual(planRenderChunks([0, 1, 2, 3, 4], 2), [[0, 1], [2, 3], [4]]);
  assert.equal(estimateRenderDurationMs(10, { chunkFrames: 2, perFrameMs: 1_000, overheadMs: 500 }), 5 * 2_500);

  // An explicit chunk size raises the deadline rather than guaranteeing a timeout.
  const forced = normalizeRenderFrames({
    frames: [0],
    outDir: dir("forced-budget"),
    chunkFrames: 20,
    perFrameMs: 900,
    timeoutMs: 5_000,
  });
  assert.equal(forced.budget.chunkFrames, 20);
  assert.equal(forced.budget.timeoutMs, 20 * 900 + 2_000);
  assert.ok(forced.budget.httpTimeoutMs > forced.budget.timeoutMs);
});

test("render: frame lists, patterns and file targets normalise safely", () => {
  const outDir = dir("normalize");
  const normalized = normalizeRenderFrames({
    frames: "0-3,10-12:2",
    outDir,
    pattern: "shot-%03d",
    scale: 500,
    chunkFrames: 2,
    perFrameMs: 1_000,
    timeoutMs: 20_000,
  });
  assert.deepEqual(normalized.frames, [0, 1, 2, 3, 10, 12]);
  assert.equal(normalized.scale, 400, "scale clamped to the supported range");
  assert.equal(normalized.budget.chunkFrames, 2);
  assert.ok(normalized.budget.httpTimeoutMs > normalized.budget.timeoutMs, "POST outlives the poll budget");
  assert.equal(normalized.budget.graceMs, 20_000);
  assert.equal(normalized.resume, true);
  assert.deepEqual(
    normalized.files.map(entry => path.basename(entry.file)),
    ["shot-000.png", "shot-001.png", "shot-002.png", "shot-003.png", "shot-010.png", "shot-012.png"],
  );
  assert.equal(normalized.progressFile, path.join(outDir, "render-progress.json"));

  // A pattern with no token still yields padded, in-directory names.
  // `base` is the scene URI (always forward-slash); `file` is the local disk
  // path (native separators). Same file, two forms — see frameTarget's doc.
  assert.equal(frameTarget(outDir, "f-%06d", 7).base, toSceneUri(path.join(outDir, "f-000007")));
  assert.equal(frameTarget(outDir, "f-%06d", 7).file, path.join(outDir, "f-000007.png"));
  assert.doesNotMatch(frameTarget(outDir, "f-%06d", 7).base, /\\/);
  // Cavalry appends .png itself, so a pattern that already says so must not double it.
  assert.equal(frameTarget(outDir, "frame-%06d.png", 1).file, path.join(outDir, "frame-000001.png"));
  assert.equal(normalizeRenderFrames({ frames: [0], outDir, pattern: "a/b/name" }).pattern, "abname-%06d");
  assert.equal(normalizeRenderFrames({ frames: [0], outDir }).pattern, "frame-%06d");
  assert.throws(() => normalizeRenderFrames({ frames: "nope", outDir }), /Invalid frame token/);
  assert.throws(
    () => normalizeRenderFrames({ frames: "0-1000", maxFrames: 50, outDir }),
    /Too many frames; limit is 50 per render_frames call/,
  );

  const previous = process.env.CAVALRY_FRAMES_DIR;
  process.env.CAVALRY_FRAMES_DIR = dir("env-frames");
  try {
    assert.equal(defaultFramesDir(), dir("env-frames"));
    assert.equal(normalizeRenderFrames({ frames: [0] }).outDir, dir("env-frames"));
  } finally {
    if (previous === undefined) delete process.env.CAVALRY_FRAMES_DIR;
    else process.env.CAVALRY_FRAMES_DIR = previous;
  }
});

test("render: chunk script renders each frame and restores playhead and comp", () => {
  const script = buildRenderChunkScript({ scale: 75, comp: "comp#2" }, [{ frame: 4, base: "/tmp/x/frame-000004" }]);
  assert.match(script, /api\.setActiveComp\(__render\.comp\)/);
  assert.match(script, /api\.setFrame\(entry\.frame\)/);
  assert.match(script, /api\.renderPNGFrame\(entry\.base, __render\.scale\)/);
  assert.match(script, /finally \{[\s\S]*api\.setFrame\(__prevFrame\)/, "restore runs even on error");
});

test("render: chunks a sequence, restores the playhead and writes every file", async () => {
  const state = createMockApiState();
  const api = buildMockApi(state);
  state.frame = 9;
  const outDir = dir("sequence");
  const { execute, calls } = mockExecutor(api);

  const result = await runRenderFrames(
    { frames: "0-4", outDir, chunkFrames: 2, perFrameMs: 1_000, timeoutMs: 20_000 },
    { execute, sleep: async () => {} },
  );

  assert.equal(result.status, "complete");
  assert.deepEqual(result.rendered, [0, 1, 2, 3, 4]);
  assert.deepEqual(result.pending, []);
  assert.equal(result.missing.length, 0);
  assert.equal(result.reused.length, 0);
  assert.deepEqual(calls.map(call => call.frames), [[0, 1], [2, 3], [4]]);
  assert.equal(calls[0].budget.timeoutMs, 20_000);
  assert.ok(calls[0].budget.httpTimeoutMs > 20_000);
  assert.equal(result.restoredFrame, 9);
  assert.equal(state.frame, 9, "playhead handed back");
  for (let frame = 0; frame <= 4; frame++) {
    const file = path.join(outDir, `frame-${String(frame).padStart(6, "0")}.png`);
    assert.ok(fs.existsSync(file) && fs.statSync(file).size > 0, file);
  }
  const progress = JSON.parse(fs.readFileSync(result.progressFile, "utf8")) as Record<string, unknown>;
  assert.equal(progress.schema, renderProgressSchema());
  assert.equal(progress.status, "complete");
  assert.deepEqual(progress.pending, []);
  assert.equal((progress.chunks as unknown[]).length, 3);
});

test("render: resume reuses files on disk and never re-sends them", async () => {
  const state = createMockApiState();
  const api = buildMockApi(state);
  const outDir = dir("resume");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "frame-000001.png"), "cached");

  const { execute, calls } = mockExecutor(api);
  const result = await runRenderFrames(
    { frames: "0-3", outDir, chunkFrames: 2 },
    { execute, sleep: async () => {} },
  );

  assert.equal(result.status, "complete");
  assert.deepEqual(result.reused, [1]);
  assert.deepEqual(calls.map(call => call.frames), [[0, 2], [3]], "frame 1 never goes back to the bridge");
  assert.ok(result.limitations.join(" ").match(/already on disk were reused/));
  assert.equal(fs.statSync(path.join(outDir, "frame-000001.png")).size, 6, "cached file untouched");

  const forced = await runRenderFrames(
    { frames: "0-3", outDir, chunkFrames: 4, resume: false },
    { execute: mockExecutor(api).execute, sleep: async () => {} },
  );
  assert.deepEqual(forced.reused, []);
});

test("render: a timed-out chunk stops the run, keeps pending frames and never re-sends", async () => {
  const state = createMockApiState();
  const api = buildMockApi(state);
  const outDir = dir("timeout");
  const { execute, calls } = mockExecutor(api, { failOnChunk: 1 });
  let polls = 0;

  const result = await runRenderFrames(
    { frames: "0-7", outDir, chunkFrames: 2, graceMs: 120 },
    {
      execute,
      sleep: async () => {
        polls += 1;
      },
    },
  );

  assert.ok(polls > 0, "the grace window polled the files instead of giving up");
  assert.equal(result.status, "partial", "the run stopped early, the render did not fail");
  assert.deepEqual(calls.map(call => call.frames), [[0, 1], [2, 3]], "no chunk is sent twice");
  assert.deepEqual(result.pending, [2, 3, 4, 5, 6, 7]);
  assert.deepEqual(result.rendered, [0, 1]);
  assert.equal(result.chunks[1].status, "timed-out");
  assert.ok(result.limitations.join(" ").match(/stopped answering/));
  const progress = JSON.parse(fs.readFileSync(result.progressFile, "utf8")) as { status: string; pending: number[] };
  assert.equal(progress.status, "partial");
  assert.deepEqual(progress.pending, [2, 3, 4, 5, 6, 7]);
});

test("render: files that land after the deadline count and the run continues", async () => {
  const state = createMockApiState();
  const api = buildMockApi(state);
  const outDir = dir("late");
  // Chunk 1 answers nothing but the bridge keeps rendering its frames.
  const { execute, calls } = mockExecutor(api, { failOnChunk: 1, writeFilesAnyway: true });

  const result = await runRenderFrames(
    { frames: "0-5", outDir, chunkFrames: 2, graceMs: 50 },
    { execute, sleep: async () => {} },
  );

  assert.equal(calls.length, 3, "a chunk whose files arrived is not a reason to stop");
  assert.equal(result.status, "complete");
  assert.deepEqual(result.rendered, [0, 1, 2, 3, 4, 5]);
  assert.equal(result.chunks[1].status, "partial", "answered late, not missing");
  assert.equal(result.missing.length, 0);
});

test("render: an error inside a chunk is reported per frame, not as a dead run", async () => {
  const state = createMockApiState();
  const api = buildMockApi(state) as MockApi & { renderPNGFrame: (file: string, scale: number) => void };
  const original = api.renderPNGFrame;
  let boom = false;
  api.renderPNGFrame = (file: string, scale: number) => {
    if (boom) throw new Error("disk full");
    boom = true;
    original(file, scale);
  };
  const outDir = dir("frame-error");
  const { execute, calls } = mockExecutor(api);

  const result = await runRenderFrames(
    { frames: "0-1", outDir, chunkFrames: 2 },
    { execute, sleep: async () => {} },
  );

  assert.equal(calls.length, 1, "one chunk, no retry");
  assert.deepEqual(result.rendered, [0]);
  assert.equal(result.missing.length, 1);
  assert.equal(result.missing[0].frame, 1);
  assert.equal(result.status, "partial");
  assert.ok(fs.existsSync(path.join(outDir, "frame-000000.png")));
});

test("render: normalize errors surface as failures rather than partial success", async () => {
  await assert.rejects(
    runRenderFrames({ frames: [], outDir: dir("empty") }, { execute: async () => ({ ok: true, text: "{}" }) }),
    /render_frames needs at least one frame/,
  );
});

test("render: budget document is the normalized one the run used", () => {
  const normalized: NormalizedRenderFrames = normalizeRenderFrames({
    frames: [0],
    outDir: dir("budget"),
    perFrameMs: 2_000,
    timeoutMs: 30_000,
  });
  assert.equal(normalized.budget.perFrameMs, 2_000);
  assert.equal(normalized.budget.chunkFrames, chunkSizeFor({ timeoutMs: 30_000, perFrameMs: 2_000 }));
  assert.equal(normalized.budget.overheadMs, 2_000);
});
