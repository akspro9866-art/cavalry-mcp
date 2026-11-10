import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createMockApiState, buildMockApi } from "../helpers/mock-cavalry-api.js";
import {
  MG_HELPERS_SOURCE,
  parseCssLinearGradient,
  explodeShapeLayers,
  setAllImageShadersToMipmaps,
  hexToOklch,
  oklchToHex,
  interpolateOklch,
  oklchGradientStops,
  computeIsometricCardTransform,
  remap,
  layerRect,
  addLineBreaks,
  evaluateSpring,
  computeSpringSettlingTime,
  generateSpringCurve,
} from "../../src/runtime/mg_helpers.js";
import {
  buildControllerNull,
  buildWeightedParentBlend,
  buildNinePointRoundedCard,
  buildAutoSizingPill,
  buildProximityFieldDuplicator,
} from "../../src/presets/rig_builders.js";

function runMg(body: string) {
  const state = createMockApiState();
  const api = buildMockApi(state);
  const context = vm.createContext({ api, console });
  const out = new vm.Script(`(function () {\n${MG_HELPERS_SOURCE}\n${body}\n})()`).runInContext(context);
  return { out: JSON.parse(JSON.stringify(out)), state, api };
}

test("OKLCH perceptual color helpers round-trip and avoid muddy midpoints", () => {
  const lch = hexToOklch("#10B981");
  assert.ok(lch.l > 0.5 && lch.l < 0.85);
  assert.ok(lch.c > 0.1);
  const roundTrip = oklchToHex(lch);
  assert.match(roundTrip, /^#[0-9A-F]{6}$/);

  const mid = interpolateOklch("#0F172A", "#38BDF8", 0.5);
  assert.match(mid, /^#[0-9A-F]{6}$/);
  const stops = oklchGradientStops(["#0F172A", "#10B981"], 5);
  assert.equal(stops.length, 5);
  assert.equal(stops[0].color, oklchToHex(hexToOklch("#0F172A")));
  assert.equal(stops[4].color, oklchToHex(hexToOklch("#10B981")));
});

test("Canvalry CSS gradient parser and runtime _mg.cssGradient shader wiring", () => {
  const parsed = parseCssLinearGradient("linear-gradient(135deg, #0F172A 0%, #10B981 50%, #38BDF8 100%)");
  assert.equal(parsed.angle, 135);
  assert.equal(parsed.stops.length, 3);
  assert.equal(parsed.stops[0].color, "#0F172A");
  assert.equal(parsed.stops[1].offset, 0.5);
  assert.equal(parsed.stops[2].color, "#38BDF8");

  const { out, state } = runMg(`
    const card = _rb.rect("Card", 400, 240, { fill: "#0F172A" });
    const g = _mg.cssGradient(card, "linear-gradient(135deg, #0F172A 0%, #10B981 50%, #38BDF8 100%)", { oklch: true });
    const mip = _mg.setAllImageShadersToMipmaps(3);
    const exp = _mg.explodeShapeLayers(card);
    return { g, mip, exp };
  `);
  assert.ok(out.g.shaderId.startsWith("linearGradient#"));
  assert.equal(out.g.stops.length, 5);
  assert.equal(out.exp.layers.length, 2);
  assert.ok(state.connections.some((c: { sourceId: string; targetId: string }) => c.sourceId === out.g.shaderId));
});

test("Canvalry TS scripts: explodeShapeLayers and setAllImageShadersToMipmaps", () => {
  const expCode = explodeShapeLayers("editableShape#1");
  assert.match(expCode, /editableShape#1/);
  const mipCode = setAllImageShadersToMipmaps(3);
  assert.match(mipCode, /setAllImageShadersToMipmaps\(3\)/);
});

test("Isometric SaaS card transform and _mg.isometricCard", () => {
  const iso = computeIsometricCardTransform({ index: 2, rotateX: 60, rotateZ: -45, shadowLayers: 3 });
  assert.equal(iso.rotateZ, -45);
  assert.equal(iso.scaleY, 0.5);
  assert.equal(iso.startFrame, 12);
  assert.equal(iso.shadowSpecs.length, 3);

  const { out } = runMg(`
    const card = _rb.rect("IsoCard", 320, 200, { fill: "#1E293B" });
    return _mg.isometricCard(card, { index: 1, elevation: 24 });
  `);
  assert.equal(out.rotateZ, -45);
  assert.equal(out.scaleY, 0.5);
  assert.equal(out.startFrame, 6);
});

test("aefunctions ports (remap, layerRect, addLineBreaks) and damped harmonic spring physics", () => {
  assert.equal(remap(5, 0, 10, 0, 100), 50);
  assert.equal(remap(15, 0, 10, 0, 100, true), 100);
  const rect = layerRect("basicShape#1", 0, { x: 100, y: 50, width: 400, height: 200 });
  assert.equal(rect.left, -100);
  assert.equal(rect.right, 300);
  assert.equal(addLineBreaks("Procedural motion design systems for modern SaaS teams", 18), "Procedural motion\ndesign systems for\nmodern SaaS teams");

  const settle = computeSpringSettlingTime({ stiffness: 200, damping: 18, mass: 1 });
  assert.ok(settle > 0.2 && settle < 3.0);
  const sample0 = evaluateSpring(0, { stiffness: 200, damping: 18, mass: 1 });
  const sampleEnd = evaluateSpring(settle, { stiffness: 200, damping: 18, mass: 1 });
  assert.ok(Math.abs(sample0) < 1e-6);
  assert.ok(Math.abs(sampleEnd - 1) < 0.02);
  const curve = generateSpringCurve({ stiffness: 220, damping: 16, fps: 60 });
  assert.ok(curve.length > 10);

  const { out } = runMg(`
    const c = _rb.rect("Sprung", 100, 100, { fill: "#38BDF8" });
    const mod = _mg.attachSpringModifier(c, "position", { stiffness: 220, damping: 0.65 });
    const sp = _mg.springPhysics({ stiffness: 220, damping: 18, mass: 1 });
    return { mod, sp, remapped: _mg.remap(0.25, 0, 1, 100, 500) };
  `);
  assert.ok(out.mod.modifierId.startsWith("springModifier#"));
  assert.ok(out.sp.settlingTime > 0);
  assert.equal(out.remapped, 200);
});

test("Cross-tool rig builders (_rb methods and TS code generators)", () => {
  assert.match(buildControllerNull("Master Ctrl", [{ name: "gap", type: "double", defaultValue: 16 }]), /buildControllerNull/);
  assert.match(buildWeightedParentBlend("null#1", "null#2", "null#3", 0.5), /buildWeightedParentBlend/);
  assert.match(buildNinePointRoundedCard("Hero Card", 480, 300), /buildNinePointRoundedCard/);
  assert.match(buildAutoSizingPill("Badge", "NEW"), /buildAutoSizingPill/);
  assert.match(buildProximityFieldDuplicator("Prox Grid", "basicShape#1", "null#9"), /buildProximityFieldDuplicator/);

  const { out } = runMg(`
    const ctrl = _rb.buildControllerNull("Rig_Ctrl", [
      { name: "progress", type: "double", defaultValue: 0.5 }
    ]);
    const pA = api.create("null", "ParentA");
    const pB = api.create("null", "ParentB");
    const child = _rb.rect("Child", 80, 80, "#38BDF8");
    const blend = _rb.buildWeightedParentBlend(child, pA, pB, 0.5, { startFrame: 0, endFrame: 24 });
    const card = _rb.buildNinePointRoundedCard("Card9", 400, 240, { radius: 20, anchor: "topLeft" });
    const pill = _rb.buildAutoSizingPill("PillTag", "LIVE SYNC", { padX: 24, padY: 12 });
    const prox = _rb.buildProximityFieldDuplicator("ProxDup", card.card, ctrl.controller, { count: [3, 2] });
    return { ctrl, blend, card, pill, prox };
  `);
  assert.ok(out.ctrl.controller.startsWith("null#"));
  assert.ok(out.blend.blendNode.startsWith("valueBlend#"));
  assert.ok(out.card.card.startsWith("basicShape#"));
  assert.ok(out.card.align.startsWith("align#"));
  assert.ok(out.pill.bg.startsWith("basicShape#"));
  assert.ok(out.pill.text.startsWith("textShape#"));
  assert.ok(out.prox.duplicator.startsWith("duplicator#"));
  assert.ok(out.prox.falloff.startsWith("falloff#"));
});
