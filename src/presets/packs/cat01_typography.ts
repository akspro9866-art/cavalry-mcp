import type { PresetDef } from "../types.js";

export const CAT01_TYPOGRAPHY: PresetDef[] = [
  {
    id: "kinetic_text",
    title: "Kinetic Text",
    category: "typography",
    description: "Word/character reveal via subMesh + stagger: words rise and spring to full scale with zero keyframe hand-work.",
    params: {
      text: { type: "string", default: "MOVE FAST", description: "Text content" },
      fontSize: { type: "double", default: 96, description: "Font size in px" },
      color: { type: "color", default: "#FFFFFF", description: "Text fill" },
      level: { type: "int", default: 1, description: "subMesh level: 0 lines, 1 words, 2 characters" },
      stagger: { type: "double", default: 6, description: "Per-segment time offset in frames" },
      startFrame: { type: "int", default: 0, description: "First animation frame" },
      duration: { type: "int", default: 30, description: "Reveal duration in frames" },
      distance: { type: "double", default: 60, description: "Vertical rise distance in px" },
      x: { type: "double", default: 0, description: "Horizontal centre" },
      y: { type: "double", default: 0, description: "Vertical centre" },
      easing: { type: "string", default: "SpringOut", description: "Magic easing name" },
    },
    code: `
const start = __o.startFrame;
const end = start + __o.duration;
const t = _rb.text(__o.text, __o.fontSize, { color: __o.color, x: __o.x, y: __o.y });
track("text", t);
const mesh = _rb.layer("subMesh", "Word Reveal", { levelMode: __o.level });
api.connect(mesh, "id", t, "deformers");
const offset = __o.staggerOffset != null ? __o.staggerOffset : __o.stagger;
track("stagger", _rb.stagger(mesh, offset));
_rb.kf(mesh, "shapeScale.x", [[start, 0], [end, 1]], __o.easing);
_rb.kf(mesh, "shapeScale.y", [[start, 0], [end, 1]], __o.easing);
_rb.kf(mesh, "shapePosition.y", [[start, __o.distance], [end, 0]], __o.easing);
track("subMesh", mesh);
`,
  },
  {
    id: "glitch_text",
    title: "Glitch Text",
    category: "typography",
    description: "Character subMesh roughened by high-frequency noise on position and scale, decaying to a clean lockup by frame 25.",
    params: {
      text: { type: "string", default: "SYSTEM ERROR", description: "Text content" },
      fontSize: { type: "double", default: 88, description: "Font size in px" },
      color: { type: "color", default: "#F8FAFC", description: "Text fill" },
      intensity: { type: "double", default: 55, description: "Noise displacement strength" },
      duration: { type: "int", default: 25, description: "Decay duration in frames" },
      x: { type: "double", default: 0, description: "Horizontal centre" },
      y: { type: "double", default: 0, description: "Vertical centre" },
    },
    code: `
const t = _rb.text(__o.text, __o.fontSize, { color: __o.color, x: __o.x, y: __o.y });
track("text", t);
const mesh = _rb.layer("subMesh", "Char Glitch", { levelMode: 2 });
api.connect(mesh, "id", t, "deformers");
track("subMesh", mesh);
const jitter = _rb.layer("noise", "Position Jitter", {
  strength: __o.intensity,
  "generator.frequency": 0.9,
  "generator.timeScale": 3.5,
  "generator.seed": 7
});
api.connect(jitter, "id", mesh, "shapePosition.x");
_rb.kf(jitter, "strength", [[0, __o.intensity], [__o.duration, 0]], "Linear");
const shake = _rb.layer("noise", "Scale Jitter", {
  strength: 0.18,
  "generator.frequency": 1.3,
  "generator.timeScale": 4.5,
  "generator.seed": 11
});
api.connect(shake, "id", mesh, "shapeScale.x");
_rb.kf(shake, "strength", [[0, 0.18], [__o.duration, 0]], "Linear");
track("noise", jitter);
`,
  },
  {
    id: "typewriter_prompt",
    title: "Typewriter Prompt",
    category: "typography",
    description: "AI-style input bar with character-by-character reveal and a blinking cursor driven by an oscillator.",
    params: {
      promptText: { type: "string", default: "Ask anything...", description: "Text being typed" },
      typingSpeed: { type: "double", default: 2, description: "Frames between characters" },
      boxWidth: { type: "double", default: 860, description: "Input bar width" },
      accentColor: { type: "color", default: "#10B981", description: "Cursor + focus accent" },
      textColor: { type: "color", default: "#E2E8F0", description: "Prompt text colour" },
      x: { type: "double", default: 0, description: "Bar centre x" },
      y: { type: "double", default: 0, description: "Bar centre y" },
    },
    code: `
const w = __o.boxWidth, h = 92;
const bar = _rb.rect("Prompt Bar", w, h, {
  fill: "#0F172A", radius: h / 2, x: __o.x, y: __o.y,
  stroke: true, strokeColor: "#334155", strokeWidth: 2
});
track("bar", bar);
const pad = 38;
const text = _rb.textLeft(__o.promptText, 30, __o.x - w / 2 + pad, __o.y, { color: __o.textColor });
track("text", text);
const mesh = _rb.layer("subMesh", "Typing Reveal", { levelMode: 2 });
api.connect(mesh, "id", text, "deformers");
track("subMesh", mesh);
const steps = String(__o.promptText).length + 1;
_rb.kf(mesh, "shapeOpacity", [[0, 0], [steps * __o.typingSpeed, 100]], "Linear");
_rb.stagger(mesh, __o.typingSpeed, "shapeTimeOffset");
const cursorX = __o.x + w / 2 - pad;
const cursor = _rb.rect("Cursor", 3, 42, { fill: __o.accentColor, radius: 1.5, x: __o.x - w / 2 + pad, y: __o.y });
track("cursor", cursor);
_rb.kf(cursor, "position.x", [[0, __o.x - w / 2 + pad], [steps * __o.typingSpeed, cursorX]], "Linear");
const blink = _rb.layer("oscillator", "Cursor Blink", { strength: 60, frequency: 2.4 });
api.connect(blink, "id", cursor, "opacity");
_rb.opacity(cursor, 60);
track("oscillator", blink);
`,
  },
  {
    id: "highlight_pill_text",
    title: "Highlight Pill Text",
    category: "typography",
    description: "Headline with a rounded highlight pill wiping on from the left, sized to the measured text width.",
    params: {
      text: { type: "string", default: "Ship faster", description: "Headline" },
      textColor: { type: "color", default: "#F8FAFC", description: "Text fill" },
      pillColor: { type: "color", default: "#10B981", description: "Highlight fill" },
      padding: { type: "double", default: 26, description: "Horizontal pill padding" },
      cornerRadius: { type: "double", default: 18, description: "Pill corner radius" },
      fontSize: { type: "double", default: 72, description: "Font size in px" },
      x: { type: "double", default: 0, description: "Centre x" },
      y: { type: "double", default: 0, description: "Centre y" },
    },
    code: `
const probe = _rb.text(__o.text, __o.fontSize, { color: __o.textColor, x: __o.x, y: __o.y });
const bb = api.getBoundingBox(probe, false);
const textW = Number(bb.width) || String(__o.text).length * __o.fontSize * 0.55;
api.deleteLayer(probe);
const pillW = textW + __o.padding * 2;
const pillH = __o.fontSize + __o.padding * 1.1;
const pill = _rb.rect("Highlight Pill", pillW, pillH, {
  fill: __o.pillColor, radius: __o.cornerRadius, x: 0, y: __o.y
});
_rb.anchor(pill, -1, 0);
_rb.pos(pill, __o.x - pillW / 2, __o.y);
_rb.kf(pill, "scale.x", [[0, 0.001], [22, 1]], "ExpoOut");
track("pill", pill);
const text = _rb.text(__o.text, __o.fontSize, { color: __o.textColor, x: __o.x, y: __o.y });
track("text", text);
_rb.fade(text, 12, 14, 0, 100, "SlowOut");
`,
  },
  {
    id: "ticker_marquee",
    title: "Ticker Marquee",
    category: "typography",
    description: "Endless-feeling horizontal ticker: a label plus star separator repeated in a linear duplicator, scrolled by one cell on loop-safe keyframes.",
    params: {
      text: { type: "string", default: "ACME", description: "Ticker label" },
      count: { type: "int", default: 8, description: "Repeated labels" },
      speed: { type: "double", default: 90, description: "Frames per full cell scroll" },
      gap: { type: "double", default: 46, description: "Space between labels in px" },
      color: { type: "color", default: "#94A3B8", description: "Label colour" },
      accentColor: { type: "color", default: "#10B981", description: "Separator colour" },
      y: { type: "double", default: 0, description: "Ticker baseline y" },
    },
    code: `
const label = _rb.text(__o.text, 30, { color: __o.color, x: 0, y: __o.y, name: "Ticker Label" });
const bb = api.getBoundingBox(label, false);
const labelW = Number(bb.width) || String(__o.text).length * 17;
const cell = labelW + __o.gap * 2;
const star = _rb.star("Ticker Star", 14, { fill: __o.accentColor, points: 4, x: cell / 2, y: __o.y });
const d1 = _rb.dup(label, { name: "Ticker Labels", distribution: "linear", count: __o.count * 2, size: cell * (__o.count * 2) });
track("labels", d1);
const d2 = _rb.dup(star, { name: "Ticker Stars", distribution: "linear", count: __o.count * 2, size: cell * (__o.count * 2) });
track("stars", d2);
_rb.kfAt(label, "x", [[0, 0], [__o.speed * 4, -cell * 4]], "Linear");
_rb.kf(star, "position.x", [[0, cell / 2], [__o.speed * 4, cell / 2 - cell * 4]], "Linear");
const bar = _rb.rect("Ticker Rail", 1600, 2, { fill: "#1F2937", x: 0, y: __o.y - 34 });
track("rail", bar);
`,
  },
];
