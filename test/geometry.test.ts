import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createMockApiState, buildMockApi } from "./mock-cavalry-api.js";
import { MG_HELPERS_SOURCE } from "../src/runtime/mg_helpers.js";

/**
 * Phase 1 of the refclone contract: video-raster pixels must land in Cavalry's
 * centred, y-up composition space exactly, and a layer must be able to reach a
 * target pixel box in one synchronous, measured pass — no vision loop.
 */
const plain = <T>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T;

function run(body: string) {
  const state = createMockApiState();
  const api = buildMockApi(state);
  const context = vm.createContext({ api, console });
  const script = new vm.Script(`(function () {\n${MG_HELPERS_SOURCE}\n${body}\n})()`);
  const result = plain<Record<string, unknown>>(script.runInContext(context));
  return { result, state, api };
}

const box = (value: unknown) => value as { x: number; y: number; width: number; height: number };
const applied = (value: unknown) => value as { intrinsic: string; scale: boolean; position: boolean };

test("_mg.fromRaster maps top-left y-down pixels to centred y-up comp space", () => {
  const { result } = run(`
    return {
      topLeft: _mg.fromRaster(0, 0, 1920, 1080),
      centre: _mg.fromRaster(960, 540, 1920, 1080),
      bottomRight: _mg.fromRaster(1920, 1080, 1920, 1080),
      point: _mg.fromRaster([480, 270], 1920, 1080),
      object: _mg.fromRaster({ x: 480, y: 270 }, 1920, 1080),
      square: _mg.fromRaster(500, 500, 1000, 1000)
    };
  `);
  assert.deepEqual(result.topLeft, { x: -960, y: 540 });
  assert.deepEqual(result.centre, { x: 0, y: 0 });
  assert.deepEqual(result.bottomRight, { x: 960, y: -540 });
  assert.deepEqual(result.point, { x: -480, y: 270 });
  assert.deepEqual(result.object, { x: -480, y: 270 });
  assert.deepEqual(result.square, { x: 0, y: 0 });
});

test("_mg.fromRaster rejects non-finite pixels instead of emitting NaN positions", () => {
  assert.throws(
    () => run(`return _mg.fromRaster("not-a-number", 10, 1920, 1080);`),
    /x\/y must be finite/,
  );
});

test("_mg.fitToBounds sizes a shape generator and aligns its measured box", () => {
  const { result } = run(`
    const id = _mg.shape("rectangle", "Card", { "generator.dimensions": [100, 100] });
    const fit = _mg.fitToBounds(id, { x: 120, y: 240, width: 240, height: 80 });
    return { id, fit, box: api.getBoundingBox(id, true) };
  `);
  const fit = result.fit as Record<string, unknown>;
  assert.equal(fit.ok, true);
  assert.equal(fit.type, "basicShape");
  assert.equal(applied(fit.applied).intrinsic, "dimensions");
  const measured = box(result.box);
  assert.equal(measured.x, 120);
  assert.equal(measured.y, 240);
  assert.equal(measured.width, 240);
  assert.equal(measured.height, 80);
  const error = box(fit.error);
  assert.ok(Math.abs(error.x) <= 0.5 && Math.abs(error.y) <= 0.5);
  assert.ok(Math.abs(error.width) <= 0.5 && Math.abs(error.height) <= 0.5);
});

test("_mg.fitToBounds uses generator.radius for radial primitives", () => {
  const { result } = run(`
    const id = _mg.layer("basicShape", "Ellipse", { "generator.radius": [30, 20] });
    const fit = _mg.fitToBounds(id, [0, 0, 200, 100]);
    return { fit, radius: api.get(id, "generator.radius"), box: api.getBoundingBox(id, true) };
  `);
  const fit = result.fit as Record<string, unknown>;
  assert.equal(fit.ok, true);
  assert.equal(applied(fit.applied).intrinsic, "radius");
  const radius = result.radius as number[];
  assert.equal(radius[0], 100);
  assert.equal(radius[1], 50);
  assert.deepEqual(box(result.box), { x: 0, y: 0, width: 200, height: 100, centre: { x: 100, y: 50 }, left: 0, right: 200, top: 0, bottom: 100 });
});

test("_mg.fitToBounds calibrates text fontSize, then closes width with scale", () => {
  const { result } = run(`
    const id = _mg.text("HELLO", 60, "#ffffff");
    const fit = _mg.fitToBounds(id, { x: -300, y: 100, width: 260, height: 90 });
    return { id, fit, fontSize: api.get(id, "fontSize"), scale: api.get(id, "scale") };
  `);
  const fit = result.fit as Record<string, unknown>;
  assert.equal(fit.ok, true);
  assert.equal(fit.type, "textShape");
  assert.equal(applied(fit.applied).intrinsic, "fontSize");
  assert.equal(applied(fit.applied).scale, true);
  const measured = fit.box as ReturnType<typeof box>;
  assert.equal(measured.width, 260);
  assert.equal(measured.height, 90);
  // fontSize moved from 60 towards the 90px box, and the residual was scale-only
  assert.ok(Number(result.fontSize) > 60, String(result.fontSize));
});

test("_mg.fitToBounds reads raster boxes for Stage 4 without re-deriving the origin", () => {
  const { result } = run(`
    const id = _mg.shape("rectangle", "Raster Card");
    const fit = _mg.fitToBounds(id, { x: 0, y: 0, width: 100, height: 60 }, { space: "raster", compWidth: 1920, compHeight: 1080 });
    return { fit, box: api.getBoundingBox(id, true) };
  `);
  const fit = result.fit as Record<string, unknown>;
  assert.equal(fit.ok, true);
  assert.equal(fit.space, "raster");
  assert.deepEqual(fit.target, { x: -960, y: 480, width: 100, height: 60 });
  // raster top-left (0,0) becomes the box whose min corner is the comp's
  // top-left; y-up flips the vertical placement.
  assert.equal(box(result.box).x, -960);
  assert.equal(box(result.box).y, 480);
});

test("_mg.fitToBounds is idempotent: a fitting call writes nothing", () => {
  const { result } = run(`
    const id = _mg.shape("rectangle", "Card", { "generator.dimensions": [100, 100] });
    const first = _mg.fitToBounds(id, { x: 10, y: 20, width: 300, height: 150 });
    const before = {
      position: api.get(id, "position"),
      dimensions: api.get(id, "generator.dimensions")
    };
    const second = _mg.fitToBounds(id, { x: 10, y: 20, width: 300, height: 150 });
    const after = {
      position: api.get(id, "position"),
      dimensions: api.get(id, "generator.dimensions")
    };
    return { first, second, before, after };
  `);
  const first = result.first as Record<string, unknown>;
  const second = result.second as Record<string, unknown>;
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.passes, 1, "an already-fitting layer converges on the first measurement");
  assert.deepEqual(second.applied, { intrinsic: "none", scale: false, position: false });
  assert.deepEqual(result.after, result.before, "the second call must not move or resize the layer");
  assert.deepEqual(second.box, first.box);
});

test("_mg.fitToBounds rejects unmeasurable layers and empty targets", () => {
  assert.throws(
    () => run(`return _mg.fitToBounds("missing#1", { x: 0, y: 0, width: 10, height: 10 });`),
    /no measurable bounding box/,
  );
  assert.throws(
    () => run(`
      const id = _mg.shape("rectangle", "Card");
      return _mg.fitToBounds(id, { x: 0, y: 0, width: 0, height: 10 });
    `),
    /positive width and height/,
  );
});

test("_mg.fitToBounds resolves @alias, semantic ids and slugs to the live layer", () => {
  const { result } = run(`
    const id = _mg.shape("rectangle", "Hero Card", { "generator.dimensions": [40, 40] });
    _mg.alias(id, "@hero_card");
    const fromAlias = _mg.fitToBounds("@hero_card", { x: 0, y: 0, width: 200, height: 100 });
    const fromRooted = _mg.fitToBounds("@@Hero Card", { x: 20, y: 30, width: 240, height: 120 });
    return { id, fromAlias, fromRooted, box: api.getBoundingBox(id, true) };
  `);
  const fromAlias = result.fromAlias as Record<string, unknown>;
  const fromRooted = result.fromRooted as Record<string, unknown>;
  assert.equal(fromAlias.ok, true);
  assert.equal(fromAlias.layerId, result.id, "the alias resolves to the same live layer id");
  assert.equal(fromRooted.layerId, result.id);
  const measured = box(result.box);
  assert.equal(measured.width, 240);
  assert.equal(measured.height, 120);
  assert.throws(
    () => run(`return _mg.fitToBounds("@never_registered", { x: 0, y: 0, width: 10, height: 10 });`),
    /no layer matches alias/,
  );
});
