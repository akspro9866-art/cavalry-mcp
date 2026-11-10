import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compositeGrid,
  sampleFrames,
  decodePng,
  encodePng,
  evaluateFilmstripReviewLoop,
  type RasterFrame,
} from "../../src/server/legacy/filmstrip.js";

function solidFrame(width: number, height: number, rgba: [number, number, number, number]): RasterFrame {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = rgba[0];
    data[i * 4 + 1] = rgba[1];
    data[i * 4 + 2] = rgba[2];
    data[i * 4 + 3] = rgba[3];
  }
  return { width, height, data };
}

function pixel(f: RasterFrame, x: number, y: number): [number, number, number, number] {
  const i = (y * f.width + x) * 4;
  return [f.data[i], f.data[i + 1], f.data[i + 2], f.data[i + 3]];
}

test("sampleFrames: endpoints and even spacing, inclusive", () => {
  assert.deepEqual(sampleFrames(0, 60, 6), [0, 12, 24, 36, 48, 60]);
  assert.deepEqual(sampleFrames(0, 60, 2), [0, 60]);
  assert.deepEqual(sampleFrames(10, 10, 4), [10, 10, 10, 10]);
  assert.deepEqual(sampleFrames(5, 9, 1), [5]);
});

test("compositeGrid: places frames left-to-right, top-to-bottom", () => {
  const red = solidFrame(2, 2, [255, 0, 0, 255]);
  const green = solidFrame(2, 2, [0, 255, 0, 255]);
  const blue = solidFrame(2, 2, [0, 0, 255, 255]);
  const grid = compositeGrid([red, green, blue], 2);
  assert.equal(grid.width, 4);
  assert.equal(grid.height, 4); // 2 rows
  assert.deepEqual(pixel(grid, 0, 0), [255, 0, 0, 255]);
  assert.deepEqual(pixel(grid, 2, 0), [0, 255, 0, 255]);
  assert.deepEqual(pixel(grid, 0, 2), [0, 0, 255, 255]);
  // empty cell keeps the dark background
  assert.deepEqual(pixel(grid, 2, 2), [20, 20, 20, 255]);
});

test("compositeGrid: smaller frames are top-left aligned in their cell", () => {
  const big = solidFrame(4, 4, [255, 255, 255, 255]);
  const small = solidFrame(2, 2, [10, 200, 10, 255]);
  const grid = compositeGrid([big, small], 2);
  assert.equal(grid.width, 8);
  assert.deepEqual(pixel(grid, 4, 0), [10, 200, 10, 255]);
  assert.deepEqual(pixel(grid, 6, 2), [20, 20, 20, 255]); // bottom-right of small's cell
});

test("compositeGrid: rejects empty input", () => {
  assert.throws(() => compositeGrid([], 3), /no frames/);
});

test("decode/encode PNG round trip", () => {
  const frame = solidFrame(3, 5, [1, 2, 3, 255]);
  const encoded = encodePng(frame);
  const decoded = decodePng(encoded);
  assert.equal(decoded.width, 3);
  assert.equal(decoded.height, 5);
  assert.deepEqual([...decoded.data], [...frame.data]);
});

test("evaluateFilmstripReviewLoop detects collisions, clipping, safe-margin and readability hold issues", () => {
  const clean = evaluateFilmstripReviewLoop([
    { layerId: "title#1", left: 200, top: 200, right: 800, bottom: 280, role: "text", inFrame: 0, outFrame: 60 },
    { layerId: "sub#2", left: 200, top: 320, right: 700, bottom: 380, role: "text", inFrame: 10, outFrame: 70 },
  ]);
  assert.equal(clean.passed, true);
  assert.equal(clean.score, 100);
  assert.equal(clean.issues.length, 0);

  const flawed = evaluateFilmstripReviewLoop([
    { layerId: "clip#1", left: -20, top: 100, right: 400, bottom: 180, role: "card" },
    { layerId: "textA#2", left: 200, top: 200, right: 600, bottom: 260, role: "text", inFrame: 0, outFrame: 20 },
    { layerId: "textB#3", left: 250, top: 220, right: 650, bottom: 280, role: "text", inFrame: 10, outFrame: 80 },
  ]);
  assert.equal(flawed.passed, false);
  assert.ok(flawed.issues.some((i) => i.type === "clipping"));
  assert.ok(flawed.issues.some((i) => i.type === "collision"));
  assert.ok(flawed.issues.some((i) => i.type === "readability_hold"));
});
