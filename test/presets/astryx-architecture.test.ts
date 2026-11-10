import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createMockApiState, buildMockApi } from "../helpers/mock-cavalry-api.js";
import { MG_HELPERS_SOURCE } from "../../src/runtime/mg_helpers.js";
import {
  ASTRYX_THEMES,
  ASTRYX_THEME_NAMES,
  resolveAstryxTheme,
} from "../../src/themes/astryx-themes.js";
import {
  validateMgPurity,
  selfCorrectMgPurity,
} from "../../src/validation/validate-mg-purity.js";
import {
  lookupPresetCompact,
  PRESET_CATALOG_AGENT_RULE,
  PRESET_DEFS,
} from "../../src/lib/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function runInMgContext(body: string) {
  const state = createMockApiState();
  const api = buildMockApi(state);
  const context = vm.createContext({ api, console });
  const result = new vm.Script(
    `(function () {\n${MG_HELPERS_SOURCE}\n${body}\n})()`,
  ).runInContext(context) as Record<string, unknown>;
  return { result, state, context };
}

test("Pattern A: ASTRYX_THEMES exports all 7 SaaS palettes and _mg.applySceneTheme binds _mg.theme.* tokens", () => {
  assert.deepEqual(ASTRYX_THEME_NAMES, [
    "neutral",
    "matcha",
    "gothic",
    "butter",
    "stone",
    "chocolate",
    "y2k",
  ]);

  assert.deepEqual(ASTRYX_THEMES.matcha, {
    bgSurface: "#0D1512",
    cardFill: "#14221C",
    textPrimary: "#ECFDF5",
    textMuted: "#86EFAC",
    accentPrimary: "#10B981",
    strokeColor: "#1F352B",
    cardCornerRadius: 14,
    layoutPadding: 24,
  });

  const { result, state } = runInMgContext(`
    const defaultFill = _mg.theme.cardFill;
    const defaultRadius = _mg.theme.cardCornerRadius;
    const applied = _mg.applySceneTheme("matcha");
    const card = _mg.shape("rect", "SaaSCard", {
      w: 320,
      h: 180,
      fill: _mg.theme.cardFill,
      radius: _mg.theme.cardCornerRadius,
      stroke: _mg.theme.strokeColor,
      strokeWidth: 1
    });
    return {
      defaultFill,
      defaultRadius,
      applied,
      themeCardFill: _mg.theme.cardFill,
      themeRadius: _mg.theme.cardCornerRadius,
      themePadding: _mg.theme.layoutPadding,
      card
    };
  `);

  assert.equal(result.defaultFill, "#181B20");
  assert.equal(result.defaultRadius, 12);
  assert.equal(result.themeCardFill, "#14221C");
  assert.equal(result.themeRadius, 14);
  assert.equal(result.themePadding, 24);
  const cardLayer = state.layers.get(result.card as string)!;
  assert.ok(cardLayer, "card layer created via _mg.shape using _mg.theme tokens");
  assert.equal(resolveAstryxTheme("UNKNOWN").themeName, "neutral");
});

test("Pattern B: AGENTS.md contains 120-line preset catalog + rule, and lazy .doc.mjs files stay <= 110 tokens", async () => {
  const agentsPath = path.join(root, "AGENTS.md");
  assert.ok(existsSync(agentsPath), "AGENTS.md exists at repo root");
  const agentsMd = readFileSync(agentsPath, "utf8");
  assert.ok(
    agentsMd.includes(PRESET_CATALOG_AGENT_RULE),
    "AGENTS.md contains the explicit preset-first rule",
  );

  for (const def of PRESET_DEFS) {
    assert.ok(
      agentsMd.includes(`${def.id} | ${def.category} |`),
      `AGENTS.md lists preset ${def.id}`,
    );
    const docPath = path.join(root, "dist", "presets", "docs", `${def.id}.doc.mjs`);
    assert.ok(existsSync(docPath), `lazy doc file exists for ${def.id}`);
    const content = readFileSync(docPath, "utf8");
    const tokenEst = Math.ceil(content.length / 4);
    assert.ok(
      tokenEst <= 110,
      `${def.id}.doc.mjs token estimate (${tokenEst}) must be <= 110`,
    );
  }

  const firstPresetId = PRESET_DEFS[0].id;
  const sampleDocUrl = pathToFileURL(
    path.join(root, "dist", "presets", "docs", `${firstPresetId}.doc.mjs`),
  ).href;
  const sampleMod = await import(sampleDocUrl);
  assert.equal(sampleMod.PRESET_DOC.id, firstPresetId);

  const compactLookup = lookupPresetCompact(firstPresetId);
  assert.equal(compactLookup.ok, true);
  if (compactLookup.ok) {
    assert.equal(compactLookup.preset.id, firstPresetId);
    assert.ok(compactLookup.preset.tokenEstimate <= 110);
  }
});

test("Pattern C: validateMgPurity scores Grade A scripts >= 90 and flags violations with exact line autoFixPrompt", () => {
  const pureScript = `api.startUndo("Astryx Scene");
try {
  _mg.applySceneTheme("matcha");
  const card = _mg.shape("rect", "Card 1", {
    w: 360,
    h: 220,
    fill: _mg.theme.cardFill,
    radius: _mg.theme.cardCornerRadius
  });
  _mg.spring(card, "scale", [0.85, 0.85], [1, 1], { f0: 0, f1: 28, preset: "snappy" });
} finally {
  api.endUndo();
}`;

  const pureReport = validateMgPurity(pureScript);
  assert.equal(pureReport.score, 100);
  assert.equal(pureReport.grade, "A");
  assert.equal(pureReport.passed, true);
  assert.equal(pureReport.violations.length, 0);

  const impureScript = `const c1 = api.create("basicShape", "Card 1");
api.set(c1, { "material.materialColor": "#14221C", "generator.cornerRadius": 14 });
const c2 = api.create("basicShape", "Card 2");
api.set(c2, { "material.materialColor": "#10B981", "strokeColor": "#1F352B" });
for (let f = 0; f < 30; f++) {
  api.keyframe(c1, "position.y", f, f * 4);
}`;

  const impureReport = validateMgPurity(impureScript);
  assert.equal(impureReport.passed, false);
  assert.ok(impureReport.score < 75, `expected score < 75, got ${impureReport.score}`);
  assert.equal(impureReport.breakdown.atomicUndoSafety, 0);
  assert.equal(impureReport.breakdown.mgPrimitivePurity, 10); // 4 calls -> -20
  assert.equal(impureReport.breakdown.tokenizedStyling, 10); // 3 hex -> -15
  assert.equal(impureReport.breakdown.proceduralMotionPurity, 10); // 1 loop -> -10
  assert.equal(impureReport.score, 30);
  assert.equal(impureReport.grade, "F");
  assert.ok(impureReport.autoFixPrompt.includes("Line 1:"));
  assert.ok(impureReport.autoFixPrompt.includes("Line 2:"));
  assert.ok(impureReport.autoFixPrompt.includes("Line 5:"));
  assert.ok(!impureReport.autoFixPrompt.includes("\n\n"), "autoFixPrompt is 1 paragraph");

  const corrected = selfCorrectMgPurity(impureScript, { theme: "matcha" });
  assert.equal(corrected.selfCorrected, true);
  assert.equal(corrected.finalValidation.passed, true);
  assert.ok(corrected.finalValidation.score >= 90);
  assert.equal(corrected.finalValidation.grade, "A");
});
