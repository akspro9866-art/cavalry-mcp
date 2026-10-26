import type { PresetDef } from "../types.js";

export const CAT06_DEVTOOLS_CLI: PresetDef[] = [
  {
    id: "ide_code_diff",
    title: "IDE Code Diff",
    category: "devtools_cli",
    description: "Code window where removed lines collapse and added lines grow, anchored left with a staggered Quart ease.",
    params: {
      removedCount: { type: "int", default: 3, description: "Removed lines" },
      addedCount: { type: "int", default: 4, description: "Added lines" },
      width: { type: "double", default: 760, description: "Window width" },
    },
    code: `
const w = __o.width, h = 440;
const win = _rb.rect("Code Window", w, h, { fill: "#0F172A", radius: 18, stroke: true, strokeColor: "#27303F", strokeWidth: 2 });
track("window", win);
const bar = _rb.rect("Title Bar", w, 46, { fill: "#111827", radius: 18, x: 0, y: h / 2 - 23 });
for (let i = 0; i < 3; i++) _rb.circle("Win Dot " + i, 6, { fill: ["#EF4444", "#F59E0B", "#10B981"][i], x: -w / 2 + 28 + i * 22, y: h / 2 - 23 });
_rb.textLeft("diff.tsx", 15, -w / 2 + 110, h / 2 - 23, { color: "#94A3B8" });
const left = -w / 2 + 78;
let row = 0;
for (let i = 0; i < __o.removedCount; i++) {
  const y = h / 2 - 82 - row * 34;
  const sign = _rb.text("-", 16, { color: "#EF4444", x: left - 34, y: y });
  const line = _rb.rect("Removed " + (i + 1), 360 + (i % 3) * 60, 12, { fill: "#7F1D1D", radius: 6, opacity: 90 });
  _rb.anchor(line, -1, 0);
  _rb.pos(line, left, y);
  _rb.kf(line, "scale.x", [[i * 3, 1], [i * 3 + 20, 0.18]], "SlowInSlowOut");
  row++;
}
for (let i = 0; i < __o.addedCount; i++) {
  const y = h / 2 - 82 - row * 34;
  const sign = _rb.text("+", 16, { color: "#10B981", x: left - 34, y: y });
  const line = _rb.rect("Added " + (i + 1), 300 + (i % 3) * 70, 12, { fill: "#064E3B", radius: 6, opacity: 95 });
  _rb.anchor(line, -1, 0);
  _rb.pos(line, left, y);
  _rb.scale(line, 0.001, 1);
  _rb.kf(line, "scale.x", [[i * 3 + 8, 0.001], [i * 3 + 30, 1]], "SlowInSlowOut");
  row++;
}
const plus = _rb.text("+12  −4", 14, { color: "#94A3B8", x: w / 2 - 60, y: -h / 2 + 26, name: "Diff Stats" });
`,
  },
  {
    id: "terminal_cli_spinner",
    title: "Terminal Spinner",
    category: "devtools_cli",
    description: "CLI window with rotating arc spinner that resolves into a springy [OK] badge.",
    params: {
      command: { type: "string", default: "npm run deploy", description: "Command" },
      outputText: { type: "string", default: "Uploaded 24 files · 1.2s", description: "Output line" },
      successColor: { type: "color", default: "#10B981", description: "Success accent" },
    },
    code: `
const w = 720, h = 340;
const win = _rb.rect("Terminal", w, h, { fill: "#0B0F14", radius: 16, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
track("window", win);
_rb.rect("Term Title", w, 40, { fill: "#111827", radius: 16, x: 0, y: h / 2 - 20 });
for (let i = 0; i < 3; i++) _rb.circle("Term Dot " + i, 5, { fill: ["#EF4444", "#F59E0B", "#10B981"][i], x: -w / 2 + 24 + i * 18, y: h / 2 - 20 });
_rb.textLeft("zsh — deploy", 13, -w / 2 + 82, h / 2 - 20, { color: "#64748B" });
_rb.textLeft("$ " + __o.command, 20, -w / 2 + 30, 60, { color: "#E2E8F0", font: "Courier New" });
const spinner = _rb.arc("Spinner", 14, 4, 30, 280, { fill: __o.successColor, x: -w / 2 + 34, y: 14 });
track("spinner", spinner);
_rb.kf(spinner, "rotation", [[0, 0], [40, 720]], "Linear");
_rb.fade(spinner, 36, 6, 100, 0, "SlowOut");
_rb.textLeft(__o.outputText, 16, -w / 2 + 30, -20, { color: "#64748B", font: "Courier New" });
const badge = _rb.pill("OK Badge", 70, 30, { fill: __o.successColor, radius: 8, x: -w / 2 + 50, y: 14 });
_rb.pop(badge, 40, 14, { ease: "SpringOut" });
const ok = _rb.text("OK", 13, { color: "#04120C", x: -w / 2 + 50, y: 14, name: "OK Label" });
_rb.pop(ok, 40, 14, { ease: "SpringOut" });
const cursor = _rb.rect("Term Cursor", 9, 18, { fill: "#E2E8F0", x: -w / 2 + 30 + String(__o.command).length * 11 + 14, y: 60 });
_rb.kf(cursor, "opacity", [[0, 100], [12, 0], [24, 100], [36, 0]], "None");
`,
  },
  {
    id: "json_payload_tree",
    title: "JSON Payload Tree",
    category: "devtools_cli",
    description: "Indented key/value token pills sweeping open row by row with an Expo ease.",
    params: {
      rows: { type: "int", default: 6, description: "Rows" },
      keyColor: { type: "color", default: "#8B5CF6", description: "Key pill" },
      valColor: { type: "color", default: "#10B981", description: "Value pill" },
    },
    code: `
const keys = ["id", "name", "email", "plan", "usage", "created_at", "status", "region"];
const vals = ["1284", "Acme Inc", "team@acme.co", "scale", "42000", "2026-10-27", "active", "eu-west-1"];
const n = Math.min(__o.rows, keys.length);
const left = -300;
const open = _rb.text("{", 30, { color: "#64748B", x: left, y: 120, name: "JSON Open" });
for (let i = 0; i < n; i++) {
  const y = 80 - i * 46;
  const keyW = 68 + i * 7;
  const kp = _rb.rect("Key " + (i + 1), keyW, 28, { fill: __o.keyColor, radius: 6, opacity: 30 });
  _rb.anchor(kp, -1, 0);
  _rb.pos(kp, left + 36, y);
  _rb.scale(kp, 0.001, 1);
  _rb.kf(kp, "scale.x", [[i * 4, 0.001], [i * 4 + 16, 1]], "ExpoOut");
  _rb.textLeft(JSON.stringify(keys[i]), 16, left + 44, y, { color: "#C4B5FD", font: "Courier New" });
  const vp = _rb.rect("Value " + (i + 1), 130 + (i % 3) * 40, 28, { fill: __o.valColor, radius: 6, opacity: 18 });
  _rb.anchor(vp, -1, 0);
  _rb.pos(vp, left + 36 + keyW + 14, y);
  _rb.scale(vp, 0.001, 1);
  _rb.kf(vp, "scale.x", [[i * 4 + 4, 0.001], [i * 4 + 20, 1]], "ExpoOut");
  _rb.textLeft(JSON.stringify(vals[i]), 16, left + 44 + keyW + 14, y, { color: "#6EE7B7", font: "Courier New" });
}
_rb.text("}", 30, { color: "#64748B", x: left, y: 80 - n * 46, name: "JSON Close" });
const badge = _rb.pill("JSON Badge", 88, 30, { fill: "#1E293B", radius: 8, x: 330, y: 140 });
_rb.text("JSON", 14, { color: "#94A3B8", x: 330, y: 140, name: "JSON Badge Label" });
track("open", open);
track("badge", badge);
`,
  },
  {
    id: "git_branch_merge",
    title: "Git Branch Merge",
    category: "devtools_cli",
    description: "Feature branch draws out of main, commits pop along the way, then the branch merges back.",
    params: {
      commits: { type: "int", default: 4, description: "Commits on the branch" },
      mainColor: { type: "color", default: "#475569", description: "Main line" },
      branchColor: { type: "color", default: "#10B981", description: "Branch line + commits" },
    },
    code: `
const main = _rb.line("Main Line", -440, -70, 440, -70, 5, __o.mainColor);
_rb.draw(main, 0, 20, "SlowInSlowOut");
_rb.textLeft("main", 15, -470, -100, { color: "#64748B" });
const up = _rb.line("Branch Up", -220, -70, -140, 60, 5, __o.branchColor);
_rb.draw(up, 8, 20, "SlowInSlowOut");
const across = _rb.line("Branch Across", -140, 60, 180, 60, 5, __o.branchColor);
_rb.draw(across, 18, 30, "SlowInSlowOut");
const down = _rb.line("Branch Down", 180, 60, 250, -70, 5, __o.branchColor);
_rb.draw(down, 34, 44, "SlowInSlowOut");
_rb.textLeft("feature/checkout", 15, -150, 92, { color: __o.branchColor });
for (let i = 0; i < __o.commits; i++) {
  const t = i / Math.max(1, __o.commits - 1);
  const x = -140 + t * 320, y = 60;
  const dot = _rb.dot("Commit " + (i + 1), x, y, 18, __o.branchColor, { glow: 16, glowIntensity: 1.6 });
  _rb.pop(dot, 18 + i * 5, 12, { ease: "SpringOut" });
  if (i === 0) track("commit", dot);
}
const merge = _rb.dot("Merge Dot", 250, -70, 22, "#FBBF24", { glow: 18, glowIntensity: 2 });
_rb.pop(merge, 46, 14, { ease: "SpringOut" });
_rb.text("merged", 15, { color: "#FBBF24", x: 250, y: -118, name: "Merge Label" });
`,
  },
  {
    id: "webhook_event_ping",
    title: "Webhook Event Ping",
    category: "devtools_cli",
    description: "Source and target endpoint badges with a glowing POST 200 packet racing across the wire.",
    params: {
      label: { type: "string", default: "POST 200", description: "Packet label" },
      packetColor: { type: "color", default: "#10B981", description: "Packet accent" },
      duration: { type: "int", default: 60, description: "Travel finish frame" },
    },
    code: `
const src = _rb.rect("Source Endpoint", 180, 74, { fill: "#151A23", radius: 14, x: -430, y: 0, stroke: true, strokeColor: "#334155", strokeWidth: 2 });
_rb.text("APP", 18, { color: "#F8FAFC", x: -430, y: 0, name: "Source Label" });
const dst = _rb.rect("Target Endpoint", 220, 74, { fill: "#151A23", radius: 14, x: 430, y: 0, stroke: true, strokeColor: "#334155", strokeWidth: 2 });
_rb.text("SERVICE", 18, { color: "#F8FAFC", x: 430, y: 0, name: "Target Label" });
const wire = _rb.line("Webhook Wire", -330, 0, 310, 0, 3, "#334155");
_rb.draw(wire, 0, 18, "SlowInSlowOut");
track("wire", wire);
const packet = _rb.pill("Packet", 130, 36, { fill: __o.packetColor, radius: 18, x: -330, y: 0 });
_rb.glow(packet, __o.packetColor, 22, 2);
const packetLabel = _rb.text(__o.label, 13, { color: "#04120C", x: -330, y: 0, name: "Packet Label" });
track("packet", packet);
_rb.kf(packet, "position.x", [[10, -330], [__o.duration, 310]], "SlowInSlowOut");
_rb.kfAt(packetLabel, "x", [[10, -330], [__o.duration, 310]], "SlowInSlowOut");
_rb.fade(packet, 10, 6, 0, 100, "SlowIn");
_rb.fade(packetLabel, 10, 6, 0, 100, "SlowIn");
const ok = _rb.check("Delivery Check", 430, 58, 26, __o.packetColor);
_rb.pop(ok, __o.duration, 12, { ease: "SpringOut" });
`,
  },
  {
    id: "sdk_language_tabs",
    title: "SDK Language Tabs",
    category: "devtools_cli",
    description: "Language tab bar with a sliding active underline and a code panel that swaps in with a spring.",
    params: {
      activeIndex: { type: "int", default: 1, description: "Active tab 0-3" },
      accentColor: { type: "color", default: "#10B981", description: "Accent" },
      switchFrame: { type: "int", default: 24, description: "Tab switch frame" },
    },
    code: `
const langs = ["TypeScript", "Python", "Go", "Rust"];
const w = 760, tabW = 150;
const panel = _rb.rect("Code Panel", w, 360, { fill: "#0F172A", radius: 16, x: 0, y: -40, stroke: true, strokeColor: "#27303F", strokeWidth: 2 });
track("panel", panel);
const bar = _rb.rect("Tab Bar", w, 54, { fill: "#111827", radius: 14, x: 0, y: 178 });
for (let i = 0; i < 4; i++) {
  _rb.text(langs[i], 16, { color: i === __o.activeIndex ? "#F8FAFC" : "#64748B", x: -285 + i * tabW, y: 178, name: "Tab " + langs[i] });
}
const underline = _rb.rect("Tab Underline", tabW - 40, 3, { fill: __o.accentColor, radius: 2, x: -285, y: 152 });
_rb.glow(underline, __o.accentColor, 10, 1.4);
_rb.kf(underline, "position.x", [[__o.switchFrame, -285], [__o.switchFrame + 18, -285 + __o.activeIndex * tabW]], "SpringOut");
_rb.textLeft("const client = new SDK({", 18, -320, 90, { color: "#E2E8F0", font: "Courier New" });
_rb.textLeft("  apiKey: process.env.KEY,", 18, -320, 50, { color: "#94A3B8", font: "Courier New" });
_rb.textLeft("  region: \\"eu-west-1\\"", 18, -320, 10, { color: "#94A3B8", font: "Courier New" });
_rb.textLeft("});", 18, -320, -30, { color: "#E2E8F0", font: "Courier New" });
const langBadge = _rb.pill("Lang Badge", 110, 28, { fill: "#1E293B", radius: 6, x: 280, y: 124 });
const langText = _rb.text(langs[__o.activeIndex], 13, { color: __o.accentColor, x: 280, y: 124, name: "Lang Badge Text" });
_rb.pop(langBadge, __o.switchFrame + 10, 14, { ease: "SpringOut" });
_rb.pop(langText, __o.switchFrame + 10, 14, { ease: "SpringOut" });
`,
  },
  {
    id: "api_latency_race",
    title: "API Latency Race",
    category: "devtools_cli",
    description: "Two horizontal race bars: our endpoint snaps to full in 15 frames, the legacy endpoint crawls linearly.",
    params: {
      fastLabel: { type: "string", default: "Our API", description: "Fast label" },
      slowLabel: { type: "string", default: "Legacy API", description: "Slow label" },
      fastColor: { type: "color", default: "#10B981", description: "Fast bar" },
      slowColor: { type: "color", default: "#EF4444", description: "Slow bar" },
    },
    code: `
const w = 720;
const rows = [120, -20];
const labels = [__o.fastLabel, __o.slowLabel];
const colors = [__o.fastColor, __o.slowColor];
for (let i = 0; i < 2; i++) {
  const y = rows[i];
  _rb.textLeft(labels[i], 18, -440, y + 34, { color: "#94A3B8" });
  const trackBar = _rb.rect("Race Track " + (i + 1), w, 34, { fill: "#1F2937", radius: 17, x: 0, y: y });
  const fill = _rb.rect("Race Fill " + (i + 1), w, 34, { fill: colors[i], radius: 17 });
  _rb.anchor(fill, -1, 0);
  _rb.pos(fill, -w / 2, y);
  _rb.scale(fill, 0.001, 1);
  _rb.kf(fill, "scale.x", i === 0 ? [[0, 0.001], [15, 1]] : [[0, 0.001], [90, 0.58]], i === 0 ? "SlowOut" : "Linear");
  if (i === 0) { track("fast", fill); _rb.glow(fill, colors[i], 14, 1.2); }
}
_rb.textRight("42 ms", 18, 400, 154, { color: __o.fastColor });
_rb.textRight("1.8 s", 18, 400, 14, { color: __o.slowColor });
`,
  },
  {
    id: "syntax_token_blocks",
    title: "Syntax Token Blocks",
    category: "devtools_cli",
    description: "Grid of multi-coloured code pills assembling with a per-cell QuartOut stagger.",
    params: {
      rows: { type: "int", default: 5, description: "Rows" },
      cols: { type: "int", default: 7, description: "Columns" },
      accentColor: { type: "color", default: "#8B5CF6", description: "Primary token colour" },
    },
    code: `
const palette = [__o.accentColor, "#10B981", "#3B82F6", "#F59E0B", "#64748B"];
const cw = 104, ch = 34, gapX = 16, gapY = 18;
const totalW = __o.cols * cw + (__o.cols - 1) * gapX;
const totalH = __o.rows * ch + (__o.rows - 1) * gapY;
for (let r = 0; r < __o.rows; r++) {
  for (let c = 0; c < __o.cols; c++) {
    const x = -totalW / 2 + cw / 2 + c * (cw + gapX);
    const y = totalH / 2 - ch / 2 - r * (ch + gapY);
    const width = 42 + ((r * 7 + c * 3) % 5) * 12;
    const block = _rb.rect("Token " + r + "-" + c, width, ch, {
      fill: palette[(r + c) % palette.length], radius: 8,
      x: x + (cw - width) / 2, y: y, opacity: 90
    });
    _rb.pop(block, (r * __o.cols + c) * 1.6, 14, { ease: "SlowOut" });
    if (r === 0 && c === 0) track("token", block);
  }
}
`,
  },
  {
    id: "npm_install_progress",
    title: "NPM Install Progress",
    category: "devtools_cli",
    description: "Terminal install with segmented progress filling to 100% and a stringGenerator package counter.",
    params: {
      pkgName: { type: "string", default: "cavalry-sdk", description: "Package name" },
      totalPackages: { type: "int", default: 120, description: "Total packages" },
      barColor: { type: "color", default: "#10B981", description: "Progress colour" },
    },
    code: `
const w = 720, h = 300;
const win = _rb.rect("Install Terminal", w, h, { fill: "#0B0F14", radius: 16, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
track("window", win);
_rb.rect("Install Title", w, 40, { fill: "#111827", radius: 16, x: 0, y: h / 2 - 20 });
for (let i = 0; i < 3; i++) _rb.circle("Install Dot " + i, 5, { fill: ["#EF4444", "#F59E0B", "#10B981"][i], x: -w / 2 + 24 + i * 18, y: h / 2 - 20 });
_rb.textLeft("installing " + __o.pkgName, 13, -w / 2 + 82, h / 2 - 20, { color: "#64748B" });
const cmd = _rb.textLeft("$ npm install " + __o.pkgName, 20, -w / 2 + 30, 70, { color: "#E2E8F0", font: "Courier New" });
const trackBar = _rb.rect("Install Track", w - 60, 18, { fill: "#1F2937", radius: 9, x: 0, y: 0 });
const fill = _rb.rect("Install Fill", w - 60, 18, { fill: __o.barColor, radius: 9 });
_rb.anchor(fill, -1, 0);
_rb.pos(fill, -(w - 60) / 2, 0);
_rb.scale(fill, 0.001, 1);
_rb.kf(fill, "scale.x", [[0, 0.001], [70, 1]], "SlowInSlowOut");
track("fill", fill);
for (let i = 1; i < 10; i++) {
  _rb.rect("Segment " + i, 2, 18, { fill: "#0B0F14", x: -(w - 60) / 2 + (i / 10) * (w - 60), y: 0 });
}
const counter = _rb.textLeft(String(__o.totalPackages) + " / " + __o.totalPackages, 18, -w / 2 + 30, -64, { color: "#94A3B8", name: "Install Counter" });
_rb.counter(counter, { from: 0, to: __o.totalPackages, suffix: " / " + __o.totalPackages, duration: 70, ease: "SlowInSlowOut", length: 1, prefix: "" });
const done = _rb.textRight("resolved", 14, w / 2 - 30, -64, { color: "#64748B" });
`,
  },
  {
    id: "error_stack_auto_fix",
    title: "Error Stack Auto-Fix",
    category: "devtools_cli",
    description: "Red error card shakes with decaying noise, then hands off to an emerald Resolved card with a spring.",
    params: {
      errorText: { type: "string", default: "TypeError: undefined is not a function", description: "Error message" },
      fixText: { type: "string", default: "Resolved automatically", description: "Fix message" },
    },
    code: `
const errCard = _rb.rect("Error Card", 640, 150, { fill: "#2A0F12", radius: 18, x: 0, y: 0, stroke: true, strokeColor: "#7F1D1D", strokeWidth: 2 });
track("errorCard", errCard);
const errLabel = _rb.textLeft(__o.errorText, 18, -280, 30, { color: "#FCA5A5", font: "Courier New" });
const errSub = _rb.textLeft("at auth.ts:42", 15, -280, -8, { color: "#7F1D1D", font: "Courier New" });
const shake = _rb.layer("noise", "Error Shake", { strength: 16, "generator.frequency": 1.2, "generator.timeScale": 5, "generator.seed": 4 });
api.connect(shake, "id", errCard, "position.x");
_rb.kf(shake, "strength", [[0, 16], [15, 0]], "Linear");
const fixCard = _rb.rect("Resolved Card", 640, 150, { fill: "#052E22", radius: 18, x: 0, y: 0, stroke: true, strokeColor: "#065F46", strokeWidth: 2 });
_rb.scale(fixCard, 0.001, 0.001);
_rb.kf(fixCard, "scale.x", [[25, 0.001], [39, 1]], "SpringOut");
_rb.kf(fixCard, "scale.y", [[25, 0.001], [39, 1]], "SpringOut");
_rb.fade(fixCard, 25, 6, 0, 100, "SlowOut");
track("fixCard", fixCard);
_rb.kf(errCard, "scale.x", [[25, 1], [35, 0.92]], "SlowIn");
_rb.kf(errCard, "scale.y", [[25, 1], [35, 0.92]], "SlowIn");
_rb.kf(errCard, "opacity", [[25, 100], [35, 0]], "SlowIn");
_rb.fade(errLabel, 25, 8, 100, 0, "SlowIn");
_rb.fade(errSub, 25, 8, 100, 0, "SlowIn");
const fixLabel = _rb.textLeft(__o.fixText, 18, -280, 16, { color: "#6EE7B7", font: "Courier New" });
_rb.fade(fixLabel, 30, 8, 0, 100, "SlowOut");
const check = _rb.check("Fix Check", 260, 0, 42, "#10B981");
_rb.pop(check, 32, 14, { ease: "SpringOut" });
`,
  },
];
