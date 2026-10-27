import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createMockApiState, buildMockApi } from "./mock-cavalry-api.js";
import { MG_HELPERS_SOURCE } from "../src/runtime/mg_helpers.js";
import { PRESET_DEFS, compilePreset } from "../src/presets/cavalry_snippets.js";

function run(body: string) {
  const state = createMockApiState();
  const api = buildMockApi(state);
  const context = vm.createContext({ api, console });
  const result = new vm.Script(`(function () {\n${MG_HELPERS_SOURCE}\n${body}\n})()`).runInContext(context) as Record<string, unknown>;
  return { result, state, context };
}

test("applyTheme binds palette, typography and radius for future layers", () => {
  const { result, state } = run(`
    const applied = _mg.applyTheme({
      colors: { primary: "#FF0000" },
      typography: { font: "Inter", style: "SemiBold", scale: 2 },
      radius: { scale: 2 }
    });
    const card = _rb.rect("Card", 100, 50, { fill: "#10B981", radius: 8, x: 0, y: 0 });
    const label = _rb.text("Hi", 20, { color: "#F8FAFC" });
    return {
      applied,
      card,
      label,
      primary: _rb.c("#10B981"),
      token: _rb.c("@primary"),
      background: _rb.c("#0B0C10")
    };
  `);
  assert.equal(result.primary.r, 255, "catalogue design colour is retinted");
  assert.equal(result.token.r, 255, "@role tokens resolve");
  assert.equal(result.background.b, 16, "untouched roles keep their literal colour");

  const card = state.layers.get(result.card as string)!;
  assert.equal(card.attrs["material.materialColor"].r, 255);
  assert.equal(card.attrs["generator.cornerRadius"], 16, "radius scale applied at creation");

  const label = state.layers.get(result.label as string)!;
  assert.equal(label.attrs.fontSize, 40, "typography scale applied at creation");
  assert.equal(label.attrs.font.font, "Inter");
  assert.equal(label.attrs.font.style, "SemiBold");

  const applied = result.applied as { palette: { id: string; swatches: Record<string, number> } };
  assert.ok(applied.palette && applied.palette.id, "scene palette was registered");
  const palette = state.layers.get(applied.palette.id)!;
  assert.equal(palette.type, "colorArray");
  assert.ok(Number(palette.attrs["array.count"]) >= 1);
  assert.notEqual(applied.palette.swatches.primary, undefined);
});

test("applyTheme retints existing layers in place and scales fonts/radius once", () => {
  const { result, state } = run(`
    const card = _rb.rect("Card", 120, 60, { fill: "#10B981", radius: 10, x: 0, y: 0 });
    const label = _rb.text("Old", 30, { color: "#F8FAFC" });
    const shapesBefore = api.getAllSceneLayers().filter((id) => {
      const type = api.getLayerType(id);
      return type === "basicShape" || type === "textShape";
    }).length;
    const first = _mg.applyTheme({
      colors: { primary: "#00FF88", text: "#CCCCCC" },
      typography: { font: "Space Grotesk", scale: 2 },
      radius: { scale: 1.5 },
      palette: false,
      ids: [card, label]
    });
    const second = _mg.applyTheme({
      colors: { primary: "#00FF88", text: "#CCCCCC" },
      typography: { font: "Space Grotesk", scale: 2 },
      radius: { scale: 1.5 },
      palette: false,
      ids: [card, label]
    });
    const shapesAfter = api.getAllSceneLayers().filter((id) => {
      const type = api.getLayerType(id);
      return type === "basicShape" || type === "textShape";
    }).length;
    return {
      card, label, first, second, shapesBefore, shapesAfter,
      fill: api.get(card, "material.materialColor"),
      textColor: api.get(label, "material.materialColor"),
      fontSize: api.get(label, "fontSize"),
      font: api.get(label, "font"),
      radius: api.get(card, "generator.cornerRadius")
    };
  `);
  assert.equal(result.shapesBefore, result.shapesAfter, "no destructive rebuild");
  assert.equal((result.fill as { r: number; g: number }).r, 0);
  assert.equal((result.fill as { g: number }).g, 255);
  assert.equal((result.textColor as { r: number; g: number; b: number }).g, 204);
  assert.equal(result.fontSize, 60, "font scale applied once, not compounded");
  assert.equal((result.font as { font: string }).font, "Space Grotesk");
  assert.equal(result.radius, 15, "radius scale applied once, not compounded");
  assert.equal((result.first as { recolored: number }).recolored, 2);
  assert.equal((result.second as { recolored: number }).recolored, 0);
});

test("applyTheme(null) clears the binding", () => {
  const { result } = run(`
    _mg.applyTheme({ colors: { primary: "#FF0000" }, palette: false, apply: false });
    const themed = _rb.c("#10B981");
    const previous = _mg.applyTheme(null);
    const raw = _rb.c("#10B981");
    return { themed, previous: previous.previous, raw, current: _mg.theme() };
  `);
  assert.equal((result.themed as { r: number }).r, 255);
  assert.equal((result.raw as { g: number; b: number }).g, 185);
  assert.equal((result.raw as { b: number }).b, 129);
  assert.equal(result.current, null);
  assert.ok((result.previous as { colors: { primary: string } }).colors.primary === "#FF0000");
});

test("a preset compiled after applyTheme uses the new palette", () => {
  const preset = compilePreset("cursor_click_flow", {});
  const { result, state } = run(`
    _mg.applyTheme({ colors: { primary: "#FF00AA" }, palette: false, apply: false });
    (function () {
      ${preset}
    })();
    return { button: _mg.presetRoots().byKey.button };
  `);
  const button = state.layers.get(result.button as string)!;
  const fill = button.attrs["material.materialColor"] as { r: number; g: number; b: number };
  assert.equal(fill.r, 255);
  assert.equal(fill.g, 0);
  assert.equal(fill.b, 170);
});

test("theme is inert for all 120 presets until applyTheme is called", () => {
  const scripts = PRESET_DEFS.map((def) => `(function () {\n${compilePreset(def.id, {})}\n})();`).join("\n");
  const { result, state } = run(`
    _mg.applyTheme({ colors: { primary: "#FF00AA" }, palette: false, apply: false });
    ${scripts}
    const fills = api.getAllSceneLayers()
      .map((id) => api.getLayerType(id) === "basicShape" ? api.get(id, "material.materialColor") : null)
      .filter((c) => c && c.r === 255 && c.g === 0 && c.b === 170);
    return { fills: fills.length, layers: api.getAllSceneLayers().length, presets: ${PRESET_DEFS.length} };
  `);
  assert.ok((result.layers as number) > 500, `all presets built layers (${result.layers})`);
  assert.ok((result.fills as number) >= 30, `theme reached many preset fills (${result.fills})`);
  assert.ok(state.layers.size > 0);
});
