import type { PresetDef } from "../types.js";

export const CAT02_UI_MOCKUPS: PresetDef[] = [
  {
    id: "bento_cards",
    title: "Bento Cards",
    category: "ui_mockups",
    description: "Stroke-and-fill bento grid whose cards spring up from below with a stagger; source animation drives every duplicate.",
    params: {
      count: { type: "int", default: 6, description: "Number of cards (or [cols,rows])" },
      columns: { type: "int", default: 3, description: "Grid columns when count is a number" },
      width: { type: "double", default: 320, description: "Card width" },
      height: { type: "double", default: 180, description: "Card height" },
      gap: { type: "double", default: 24, description: "Grid gap" },
      radius: { type: "double", default: 24, description: "Corner radius" },
      fillColor: { type: "color", default: "#181B24", description: "Card fill" },
      strokeColor: { type: "color", default: "#3D4354", description: "Card stroke" },
      stagger: { type: "double", default: 4, description: "Per-card time offset" },
      distance: { type: "double", default: 60, description: "Rise distance" },
      duration: { type: "int", default: 30, description: "Reveal duration" },
      easing: { type: "string", default: "SlowOut", description: "Magic easing name" },
    },
    code: `
const cols = Array.isArray(__o.count) ? __o.count[0] : __o.columns;
const rows = Array.isArray(__o.count) ? __o.count[1] : Math.ceil(__o.count / cols);
const cw = Array.isArray(__o.cardSize) ? __o.cardSize[0] : __o.width;
const ch = Array.isArray(__o.cardSize) ? __o.cardSize[1] : __o.height;
const gw = Array.isArray(__o.size) ? __o.size[0] : cols * cw + (cols - 1) * __o.gap;
const gh = Array.isArray(__o.size) ? __o.size[1] : rows * ch + (rows - 1) * __o.gap;
const fill = __o.fill != null ? __o.fill : __o.fillColor;
const stroke = __o.stroke != null ? __o.stroke : __o.strokeColor;
const card = _rb.rect("Bento Card", cw, ch, {
  fill: fill, radius: __o.radius, x: 0, y: 0,
  stroke: true, strokeColor: stroke, strokeWidth: 2
});
track("card", card);
const grid = _rb.dup(card, { name: "Bento Grid", columns: cols, rows: rows, width: gw, height: gh });
track("grid", grid);
_rb.stagger(grid, __o.stagger);
const start = __o.startFrame || 0;
const end = start + (__o.duration || 30);
_rb.kf(card, "position.y", [[start, __o.distance], [end, 0]], __o.easing);
_rb.kf(card, "scale.x", [[start, 0.92], [end, 1]], __o.easing);
_rb.kf(card, "scale.y", [[start, 0.92], [end, 1]], __o.easing);
_rb.fade(card, start, (__o.duration || 30) / 2, 0, 100, "SlowOut");
`,
  },
  {
    id: "cursor_click_flow",
    title: "Cursor Click Flow",
    category: "ui_mockups",
    description: "Pointer glides to a CTA, presses it to 92%, springs back and fires a ripple — the classic product-demo click.",
    params: {
      label: { type: "string", default: "Book a demo", description: "Button label" },
      startPos: { type: "json", default: [-420, -260], description: "[x,y] pointer start" },
      targetPos: { type: "json", default: [40, -40], description: "[x,y] button centre" },
      clickFrame: { type: "int", default: 25, description: "Frame of the click" },
      buttonColor: { type: "color", default: "#10B981", description: "Button fill" },
    },
    code: `
const sx = __o.startPos[0], sy = __o.startPos[1];
const tx = __o.targetPos[0], ty = __o.targetPos[1];
const btnW = Math.max(240, String(__o.label).length * 15 + 80), btnH = 72;
const btn = _rb.rect("CTA Button", btnW, btnH, { fill: __o.buttonColor, radius: btnH / 2, x: tx, y: ty });
track("button", btn);
const label = _rb.text(__o.label, 26, { color: "#04120C", x: tx, y: ty });
track("label", label);
const ripple = _rb.circle("Click Ripple", 54, { fill: "#000000", alpha: 0, x: tx, y: ty });
_rb.stroke(ripple, "#FFFFFF", 4, { capStyle: 1, trim: [0, 100] });
track("ripple", ripple);
const cf = __o.clickFrame;
_rb.kf(ripple, "scale.x", [[cf, 0.25], [cf + 18, 1.9]], "SlowOut");
_rb.kf(ripple, "scale.y", [[cf, 0.25], [cf + 18, 1.9]], "SlowOut");
_rb.kf(ripple, "opacity", [[cf, 100], [cf + 22, 0]], "SlowOut");
const pointer = _rb.poly("Pointer", 42, 3, { fill: "#FFFFFF", rotation: -90, x: sx, y: sy, stroke: true, strokeColor: "#0B0C10", strokeWidth: 2 });
track("pointer", pointer);
_rb.kf(pointer, "position.x", [[0, sx], [cf, tx + 8]], "SlowInSlowOut");
_rb.kf(pointer, "position.y", [[0, sy], [cf, ty + 10]], "SlowInSlowOut");
_rb.kf(pointer, "position.x", [[cf + 1, tx + 8], [cf + 6, tx + 2]], "SlowOut");
_rb.kf(btn, "scale.x", [[cf, 1], [cf + 3, 0.92], [cf + 14, 1]], "SpringOut");
_rb.kf(btn, "scale.y", [[cf, 1], [cf + 3, 0.92], [cf + 14, 1]], "SpringOut");
`,
  },
  {
    id: "toggle_switch_ui",
    title: "Toggle Switch",
    category: "ui_mockups",
    description: "Pill track cross-fades from off to on while the knob springs across; the on-fill is a stacked pill so no colour keyframing is needed.",
    params: {
      flipFrame: { type: "int", default: 12, description: "Frame the switch flips" },
      onColor: { type: "color", default: "#10B981", description: "Enabled fill" },
      offColor: { type: "color", default: "#334155", description: "Disabled fill" },
      scale: { type: "double", default: 1, description: "Overall scale multiplier" },
      x: { type: "double", default: 0, description: "Centre x" },
      y: { type: "double", default: 0, description: "Centre y" },
    },
    code: `
const s = __o.scale;
const tw = 164 * s, th = 78 * s, knob = 56 * s;
const travel = (tw - knob) / 2 - 10 * s;
const off = _rb.rect("Track Off", tw, th, { fill: __o.offColor, radius: th / 2, x: __o.x, y: __o.y });
track("track", off);
const on = _rb.rect("Track On", tw, th, { fill: __o.onColor, radius: th / 2, x: __o.x, y: __o.y });
_rb.opacity(on, 0);
track("onFill", on);
_rb.kf(on, "opacity", [[__o.flipFrame, 0], [__o.flipFrame + 10, 100]], "SlowInSlowOut");
const k = _rb.circle("Knob", knob / 2, { fill: "#FFFFFF", x: __o.x - travel, y: __o.y });
track("knob", k);
_rb.kf(k, "position.x", [[__o.flipFrame, __o.x - travel], [__o.flipFrame + 16, __o.x + travel]], "SpringOut");
`,
  },
  {
    id: "toast_stack",
    title: "Toast Stack",
    category: "ui_mockups",
    description: "Stacked notification cards slide in vertically with a staggered spring, each with a status dot and title.",
    params: {
      title: { type: "string", default: "Deployment complete", description: "Toast title" },
      count: { type: "int", default: 3, description: "Number of toasts" },
      cardColor: { type: "color", default: "#151A23", description: "Card fill" },
      accentColor: { type: "color", default: "#10B981", description: "Status dot" },
      stagger: { type: "double", default: 5, description: "Per-toast offset" },
    },
    code: `
const n = Math.max(1, Math.min(5, __o.count || 3));
const w = 460, h = 88, gap = 120;
for (let i = 0; i < n; i++) {
  const y = (i - (n - 1) / 2) * gap;
  const start = i * (__o.stagger || 5) * 2;
  const card = _rb.rect("Toast Card " + i, w, h, { fill: __o.cardColor, radius: 16, x: 0, y: y, stroke: true, strokeColor: "#27303F", strokeWidth: 1 });
  _rb.kfAt(card, "y", [[start, y - 55], [start + 24, y]], "SpringOut");
  _rb.fade(card, start, 12, 0, 100, "SlowOut");
  const dot = _rb.circle("Toast Dot " + i, 9, { fill: __o.accentColor, x: -w / 2 + 28, y: y });
  _rb.kfAt(dot, "y", [[start + 2, y - 55], [start + 26, y]], "SpringOut");
  _rb.fade(dot, start + 2, 12, 0, 100, "SlowOut");
  const title = _rb.textLeft(__o.title, 19, -w / 2 + 52, y + 10, { color: "#F8FAFC" });
  _rb.kfAt(title, "y", [[start + 3, y + 10 - 55], [start + 27, y + 10]], "SpringOut");
  _rb.fade(title, start + 3, 12, 0, 100, "SlowOut");
  const sub = _rb.textLeft("Just now · production", 14, -w / 2 + 52, y - 14, { color: "#94A3B8" });
  _rb.kfAt(sub, "y", [[start + 3, y - 14 - 55], [start + 27, y - 14]], "SpringOut");
  _rb.fade(sub, start + 3, 12, 0, 100, "SlowOut");
  if (i === 0) { track("card", card); track("dot", dot); track("title", title); }
}
`,
  },
  {
    id: "command_palette",
    title: "Command Palette",
    category: "ui_mockups",
    description: "Dark ⌘K palette with search row, four command rows, and a translucent highlight stepping down the list.",
    params: {
      query: { type: "string", default: "deploy", description: "Search query" },
      rowCount: { type: "int", default: 4, description: "Visible rows" },
      selectedIndex: { type: "int", default: 1, description: "Highlighted row" },
      highlightColor: { type: "color", default: "#10B981", description: "Selection tint" },
    },
    code: `
const shell = _rb.modal("Palette", 760, 520, { fill: "#0F172A", radius: 22, dim: 60 });
track("card", shell.card);
const search = _rb.rect("Search Bar", 700, 60, { fill: "#111827", radius: 14, x: 0, y: 196, stroke: true, strokeColor: "#334155", strokeWidth: 2 });
track("search", search);
_rb.textLeft(__o.query, 22, -324, 196, { color: "#E2E8F0" });
_rb.keycap("Cmd K", "⌘K", 310, 196, { width: 56, height: 36, fontSize: 16 });
const labels = ["Open deploy settings", "Search documentation", "Invite a teammate", "Toggle dark mode", "View build logs", "Manage API keys"];
const n = Math.min(__o.rowCount, labels.length);
const rowY = 108, step = 74;
const rows = [];
for (let i = 0; i < n; i++) {
  const y = rowY - i * step;
  const row = _rb.rect("Row " + (i + 1), 700, 62, { fill: i % 2 === 0 ? "#141C2B" : "#111827", radius: 12, x: 0, y: y });
  const label = _rb.textLeft(labels[i], 19, -324, y, { color: "#E2E8F0" });
  const hint = _rb.textRight("↵", 18, 318, y, { color: "#64748B" });
  rows.push(row);
  track("row" + i, row);
}
const selY = rowY - Math.max(0, Math.min(__o.selectedIndex, n - 1)) * step;
const highlight = _rb.rect("Selection", 700, 62, { fill: __o.highlightColor, radius: 12, x: 0, y: rowY });
_rb.alpha(highlight, 22);
track("highlight", highlight);
_rb.kf(highlight, "position.y", [[16, rowY], [34, selY]], "ExpoOut");
const rail = _rb.rect("Selection Rail", 4, 34, { fill: __o.highlightColor, radius: 2, x: -346, y: rowY });
_rb.kf(rail, "position.y", [[16, rowY], [34, selY]], "ExpoOut");
`,
  },
];
