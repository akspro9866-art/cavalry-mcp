import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { buildMockApi, createMockApiState } from "./mock-cavalry-api.js";
import type { MockApi } from "./mock-cavalry-api.js";
import { wrapAtomicScript } from "../src/runtime/atomic.js";
import {
  normalizeVerifyFrames,
  buildVerifyScript,
  defaultPreviewDir,
  runVerifyFrames,
  type NormalizedVerifyFrames,
} from "../src/verify.js";

type TestApi = MockApi & {
  primitive(type: string, name?: string): string;
  createComp(name: string, attrs?: Record<string, unknown>): string;
  parent(id: string, parentId: string): void;
};

interface ScriptManifest {
  comp: { id: string; name: string; width: number; height: number };
  restoredFrame: number;
  frames: Array<{ frame: number; file: string; layers: number; collisions: number }>;
  collisions: Array<{ frame: number; a: { id: string; name: string; type: string }; b: { id: string; name: string; type: string }; area: number }>;
}

/** Two overlapping cards, a full-bleed background, a parent/child pair, a hidden layer and a timed-out layer. */
function scene() {
  const state = createMockApiState();
  const api = buildMockApi(state) as TestApi;
  const rect = (name: string, width: number, height: number, x: number, y: number, extra: Record<string, unknown> = {}) => {
    const id = api.primitive("rectangle", name);
    api.set(id, { "generator.dimensions": [width, height], "position.x": x, "position.y": y, ...extra });
    return id;
  };
  const card = rect("Card", 320, 180, 100, 100);
  const title = rect("Title", 320, 180, 160, 120);
  const background = rect("Background", 1920, 1080, 0, 0);
  const group = rect("Group", 400, 300, 700, 500);
  const icon = rect("Icon", 100, 100, 700, 500);
  api.parent(icon, group);
  const ghost = rect("Ghost", 320, 180, 100, 100);
  api.set(ghost, { hidden: true });
  const late = rect("Late", 320, 180, 100, 100, { inFrame: 100, outFrame: 200 });
  return { state, api, ids: { card, title, background, group, icon, ghost, late } };
}

function executeScene(api: TestApi, options: NormalizedVerifyFrames): ScriptManifest {
  const context = vm.createContext({ api, console });
  new vm.Script(wrapAtomicScript(buildVerifyScript(options), false)).runInContext(context);
  return (context as { __result?: ScriptManifest }).__result!;
}

test("verify: frame lists, ranges and limits normalise safely", () => {
  const normalized = normalizeVerifyFrames({
    frames: "0, 10-20:5, 30, 30",
    outDir: path.join(os.tmpdir(), "cav-verify-normalize"),
    scale: 50,
    prefix: "shot 01",
  });
  assert.deepEqual(normalized.frames, [0, 10, 15, 20, 30]);
  assert.equal(normalized.scale, 50);
  assert.equal(normalized.prefix, "shot_01");
  assert.equal(normalized.maxCollisions, 40);
  assert.equal(normalized.outDir, path.resolve(path.join(os.tmpdir(), "cav-verify-normalize")));
  assert.equal(normalizeVerifyFrames({ frames: [0] }).outDir, path.resolve(defaultPreviewDir()));
  assert.throws(() => normalizeVerifyFrames({ frames: "nope" }), /Invalid frame token/);
  assert.throws(() => normalizeVerifyFrames({ frames: [] }), /at least one frame/);
  assert.throws(() => normalizeVerifyFrames({ frames: "0-1000", maxFrames: 50 }), /Too many frames/);
});

test("verify: renders previews, restores the playhead and reports real collisions", () => {
  const { state, api, ids } = scene();
  state.frame = 12;
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "cav-verify-script-"));
  try {
    const result = executeScene(api, normalizeVerifyFrames({ frames: [0, 20], outDir }));
    assert.equal(state.frame, 12, "playhead restored after the render");
    assert.equal(result.restoredFrame, 12);
    assert.deepEqual(Array.from(result.frames, (entry) => entry.frame), [0, 20]);
    assert.match(result.frames[0].file, /frame_000000\.png$/);
    for (const entry of result.frames) assert.ok(fs.existsSync(entry.file), entry.file);
    assert.equal(result.comp.width, 1920);
    assert.equal(result.comp.height, 1080);
    assert.equal(result.frames[0].layers, 4, "card, title and the group/child pair");
    const collisions = Array.from(result.collisions);
    assert.equal(collisions.length, 2, "one pair per rendered frame");
    assert.deepEqual(Array.from(collisions, (entry) => entry.frame), [0, 20]);
    assert.deepEqual([collisions[0].a.id, collisions[0].b.id].sort(), [ids.card, ids.title].sort());
    assert.equal(collisions[0].area, 260 * 160);
    const flagged = new Set<string>([collisions[0].a.id, collisions[0].b.id]);
    for (const id of [ids.background, ids.group, ids.icon, ids.ghost, ids.late]) {
      assert.equal(flagged.has(id), false, `${id} must not be collision-flagged`);
    }
    assert.deepEqual(
      state.order.filter((entry) => entry.startsWith("setFrame:")).slice(-3),
      ["setFrame:0", "setFrame:20", "setFrame:12"],
    );

    const second = api.createComp("Second", { resolution: { x: 800, y: 600 } });
    const switched = executeScene(api, normalizeVerifyFrames({ frames: [0], outDir, comp: second }));
    assert.equal(state.activeComp, "comp#1", "active comp restored");
    assert.equal(switched.comp.width, 800);
    assert.equal(switched.comp.name, "Second");
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test("verify: runVerifyFrames surfaces collision and missing-preview warnings", async () => {
  const { api } = scene();
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "cav-verify-run-"));
  const execute = async (code: string) => {
    const context = vm.createContext({ api, console });
    new vm.Script(wrapAtomicScript(code, false)).runInContext(context);
    return {
      ok: true,
      text: JSON.stringify((context as { __result?: unknown }).__result ?? null),
      state: null,
    };
  };
  try {
    const result = await runVerifyFrames({ frames: "0,20", outDir }, { execute });
    assert.equal(result.frames.length, 2);
    assert.equal(result.missing.length, 0);
    assert.equal(result.warnings.length, 2);
    assert.match(result.warnings[0], /^frame 0: "Card" .* overlaps "Title" .* by 260x160 \(41600px\^2\)$/);
    assert.ok(fs.existsSync(result.frames[0].file));
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }

  const missing = await runVerifyFrames(
    { frames: [0], outDir },
    {
      execute: async () => ({
        ok: true,
        text: JSON.stringify({
          comp: null,
          restoredFrame: 0,
          frames: [{ frame: 0, file: path.join(outDir, "missing.png"), layers: 0, collisions: 0 }],
          collisions: [],
        }),
        state: null,
      }),
    },
  );
  assert.equal(missing.missing.length, 1);
  assert.match(missing.warnings[0], /preview was not written/);
  fs.rmSync(outDir, { recursive: true, force: true });

  await assert.rejects(
    runVerifyFrames({ frames: [0], outDir }, { execute: async () => ({ ok: false, text: "boom" }) }),
    /Frame verification failed: boom/,
  );
});
