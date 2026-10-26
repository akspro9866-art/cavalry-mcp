import type { PresetDef } from "../types.js";

export const CAT05_AI_AGENTS: PresetDef[] = [
  {
    id: "ai_token_stream",
    title: "AI Token Stream",
    category: "ai_agents",
    description: "Words stream in through a subMesh stagger while the whole line carries an accent glow.",
    params: {
      text: { type: "string", default: "Generating your answer with context", description: "Streamed text" },
      baseColor: { type: "color", default: "#F8FAFC", description: "Text fill" },
      glowColor: { type: "color", default: "#8B5CF6", description: "Accent glow" },
      fontSize: { type: "double", default: 54, description: "Font size" },
      duration: { type: "int", default: 36, description: "Stream duration" },
      stagger: { type: "double", default: 3, description: "Per-word delay" },
    },
    code: `
const t = _rb.text(__o.text, __o.fontSize, { color: __o.baseColor, x: 0, y: 0 });
track("text", t);
const mesh = _rb.layer("subMesh", "Token Stream", { levelMode: 1 });
api.connect(mesh, "id", t, "deformers");
_rb.stagger(mesh, __o.stagger);
_rb.kf(mesh, "shapeOpacity", [[0, 0], [__o.duration, 100]], "SlowOut");
_rb.kf(mesh, "shapePosition.y", [[0, 18], [__o.duration, 0]], "SlowOut");
_rb.glow(t, __o.glowColor, 26, 1.3);
track("subMesh", mesh);
const caret = _rb.rect("Stream Caret", 4, __o.fontSize * 0.8, { fill: __o.glowColor, radius: 2, x: __o.fontSize * 2.4, y: 0 });
_rb.fade(caret, 0, 4, 0, 100, "Linear");
track("caret", caret);
`,
  },
  {
    id: "ai_thinking_shimmer",
    title: "AI Thinking Shimmer",
    category: "ai_agents",
    description: "Thinking badge with a soft light band sweeping across the pill while three dots pulse.",
    params: {
      label: { type: "string", default: "Thinking", description: "Badge label" },
      width: { type: "double", default: 340, description: "Pill width" },
      baseColor: { type: "color", default: "#1E1B33", description: "Pill fill" },
      shimmerColor: { type: "color", default: "#C4B5FD", description: "Sweep colour" },
    },
    code: `
const w = __o.width, h = 64;
const pill = _rb.rect("Thinking Pill", w, h, { fill: __o.baseColor, radius: h / 2, x: 0, y: 0, stroke: true, strokeColor: "#3B3356", strokeWidth: 1 });
track("pill", pill);
_rb.textLeft(__o.label, 22, -w / 2 + 28, 0, { color: "#DDD6FE" });
for (let i = 0; i < 3; i++) {
  const d = _rb.circle("Think Dot " + (i + 1), 5, { fill: "#A78BFA", x: w / 2 - 54 + i * 18, y: 0 });
  _rb.kf(d, "opacity", [[i * 6, 30], [i * 6 + 8, 100], [i * 6 + 22, 30]], "SlowInSlowOut");
}
const sweep = _rb.rect("Shimmer", 52, h - 12, { fill: __o.shimmerColor, radius: 26, x: -w / 2 + 40, y: 0 });
_rb.alpha(sweep, 22);
_rb.glow(sweep, __o.shimmerColor, 18, 1.4);
track("shimmer", sweep);
_rb.kf(sweep, "position.x", [[0, -w / 2 + 40], [46, w / 2 - 40]], "SlowInSlowOut");
_rb.kf(sweep, "position.x", [[60, -w / 2 + 40], [106, w / 2 - 40]], "SlowInSlowOut");
`,
  },
  {
    id: "rag_context_funnel",
    title: "RAG Context Funnel",
    category: "ai_agents",
    description: "Document cards spiral inward from an outer ring into a glowing context hub, staggered and eased.",
    params: {
      docCount: { type: "int", default: 6, description: "Document cards" },
      radius: { type: "double", default: 330, description: "Outer ring radius" },
      hubTitle: { type: "string", default: "CONTEXT", description: "Hub label" },
      accentColor: { type: "color", default: "#8B5CF6", description: "Hub accent" },
    },
    code: `
const n = __o.docCount;
const hub = _rb.circle("Context Hub", 92, { fill: "#141126", x: 0, y: 0 });
_rb.stroke(hub, __o.accentColor, 3, { capStyle: 1, trim: [0, 100] });
_rb.glow(hub, __o.accentColor, 40, 2.2);
track("hub", hub);
_rb.text(__o.hubTitle, 17, { color: "#DDD6FE", x: 0, y: 0, name: "Hub Title" });
const pulse = _rb.circle("Hub Pulse", 100, { fill: "#000000", alpha: 0, x: 0, y: 0 });
const ps = _rb.stroke(pulse, __o.accentColor, 2, { capStyle: 1, trim: [0, 100] });
_rb.kf(pulse, "scale.x", [[0, 0.6], [40, 1.4]], "SlowOut");
_rb.kf(pulse, "scale.y", [[0, 0.6], [40, 1.4]], "SlowOut");
_rb.kf(pulse, "opacity", [[0, 80], [40, 0]], "SlowOut");
for (let i = 0; i < n; i++) {
  const ang = (i / n) * Math.PI * 2 + Math.PI / 6;
  const ox = Math.cos(ang) * __o.radius, oy = Math.sin(ang) * __o.radius;
  const ix = Math.cos(ang) * 120, iy = Math.sin(ang) * 120;
  const card = _rb.rect("Doc " + (i + 1), 84, 104, { fill: "#1B1830", radius: 12, x: ox, y: oy, stroke: true, strokeColor: "#3B3356", strokeWidth: 1 });
  _rb.kf(card, "position.x", [[i * 3, ox], [i * 3 + 26, ix]], "SlowIn");
  _rb.kf(card, "position.y", [[i * 3, oy], [i * 3 + 26, iy]], "SlowIn");
  _rb.kf(card, "scale.x", [[i * 3, 1], [i * 3 + 26, 0.55]], "SlowIn");
  _rb.kf(card, "scale.y", [[i * 3, 1], [i * 3 + 26, 0.55]], "SlowIn");
  _rb.fade(card, i * 3, 12, 0, 100, "SlowOut");
  _rb.fade(card, i * 3 + 20, 12, 100, 35, "SlowIn");
  if (i === 0) track("doc", card);
}
`,
  },
  {
    id: "copilot_inline_ghost",
    title: "Copilot Inline Ghost",
    category: "ai_agents",
    description: "Typed code plus ghost autocomplete that firms up while a Tab keycap bounces to accept it.",
    params: {
      typedText: { type: "string", default: "const user =", description: "Typed code" },
      ghostText: { type: "string", default: " await fetchUser();", description: "Ghost completion" },
      acceptFrame: { type: "int", default: 24, description: "Tab accept frame" },
      accentColor: { type: "color", default: "#8B5CF6", description: "Ghost accent" },
    },
    code: `
const main = _rb.textLeft(__o.typedText, 34, -460, 0, { color: "#F8FAFC" });
track("typed", main);
const bb = api.getBoundingBox(main, false);
const w = Number(bb.width) || String(__o.typedText).length * 20;
const ghost = _rb.textLeft(__o.ghostText, 34, -460 + w + 6, 0, { color: __o.accentColor });
_rb.opacity(ghost, 35);
track("ghost", ghost);
_rb.kf(ghost, "opacity", [[__o.acceptFrame, 35], [__o.acceptFrame + 10, 100]], "SlowInSlowOut");
const key = _rb.keycap("Tab Key", "Tab", -460 + w + 6 + String(__o.ghostText).length * 17 + 40, 0, { width: 64, height: 42, fill: "#1E1B33", strokeColor: "#4C1D95", color: "#DDD6FE", fontSize: 17 });
track("keycap", key);
_rb.pop(key, __o.acceptFrame, 14, { ease: "SpringOut" });
_rb.glow(key, __o.accentColor, 16, 1.2);
const cursor = _rb.rect("Ghost Caret", 3, 36, { fill: __o.accentColor, radius: 1.5, x: -460 + w, y: 0 });
_rb.kf(cursor, "opacity", [[0, 20], [__o.acceptFrame, 100], [__o.acceptFrame + 8, 20]], "SlowInSlowOut");
`,
  },
  {
    id: "magic_wand_sparkle",
    title: "Magic Wand Sparkle",
    category: "ai_agents",
    description: "Radial burst of 4-point stars that inflate past full size and vanish, with a glowing centre.",
    params: {
      sparkleCount: { type: "int", default: 12, description: "Sparkles" },
      radius: { type: "double", default: 220, description: "Burst radius" },
      color: { type: "color", default: "#FBBF24", description: "Sparkle colour" },
    },
    code: `
const core = _rb.star("Wand Core", 64, { fill: "#FFF7ED", points: 4, innerRadius: 9, x: 0, y: 0, rotation: 0 });
_rb.glow(core, __o.color, 30, 2.4);
track("core", core);
_rb.pop(core, 0, 16, { ease: "SpringOut" });
for (let i = 0; i < __o.sparkleCount; i++) {
  const ang = (i / __o.sparkleCount) * Math.PI * 2;
  const r = __o.radius * (0.55 + (i % 3) * 0.18);
  const s = _rb.star("Sparkle " + (i + 1), 26 + (i % 4) * 8, {
    fill: __o.color, points: 4, innerRadius: 5,
    x: Math.cos(ang) * r, y: Math.sin(ang) * r, rotation: i * 24
  });
  const start = 6 + i * 2;
  _rb.kf(s, "scale.x", [[start, 0], [start + 7, 1.3], [start + 24, 0]], "SlowOut");
  _rb.kf(s, "scale.y", [[start, 0], [start + 7, 1.3], [start + 24, 0]], "SlowOut");
  _rb.kf(s, "rotation", [[start, i * 24], [start + 24, i * 24 + 90]], "SlowOut");
  if (i === 0) track("sparkle", s);
}
`,
  },
  {
    id: "agent_step_chain",
    title: "Agent Step Chain",
    category: "ai_agents",
    description: "Vertical reasoning steps whose status dots light up and checkmarks pop in sequence.",
    params: {
      steps: { type: "json", default: ["Plan the task", "Search sources", "Execute the fix"], description: "Step labels" },
      stepDelay: { type: "double", default: 10, description: "Frames between steps" },
      activeColor: { type: "color", default: "#8B5CF6", description: "Pending dot" },
      doneColor: { type: "color", default: "#10B981", description: "Completed dot" },
    },
    code: `
const steps = Array.isArray(__o.steps) ? __o.steps : ["Plan", "Search", "Execute"];
const n = steps.length;
const rail = _rb.rect("Step Rail", 2, n * 80, { fill: "#27303F", x: -230, y: 0 });
track("rail", rail);
for (let i = 0; i < n; i++) {
  const y = ((n - 1) / 2 - i) * 80;
  const row = _rb.listRow("Step " + (i + 1), 480, 64, {
    label: steps[i], x: 0, y: y, dotColor: __o.activeColor,
    fill: "#151A23", strokeColor: "#27303F", pad: 20
  });
  const start = i * __o.stepDelay;
  _rb.fade(row.card, start, 10, 0, 100, "SlowOut");
  _rb.slide(row.card, start, 16, 24, 0, "SlowOut");
  _rb.pop(row.dot, start + 8, 12, { ease: "SpringOut" });
  const checkText = _rb.text("✓", 22, { color: __o.doneColor, x: 216, y: y, name: "Step Check " + (i + 1) });
  _rb.pop(checkText, start + 12, 12, { ease: "SpringOut" });
  if (i === 0) track("row", row.card);
}
`,
  },
  {
    id: "vector_embedding_cloud",
    title: "Vector Embedding Cloud",
    category: "ai_agents",
    description: "Noise-jittered dot cloud with a glowing semantic-cluster halo and label.",
    params: {
      count: { type: "int", default: 96, description: "Embeddings" },
      clusterPos: { type: "json", default: [180, 60], description: "[x,y] cluster centre" },
      highlightColor: { type: "color", default: "#8B5CF6", description: "Cluster accent" },
    },
    code: `
const cols = Math.ceil(Math.sqrt(__o.count));
const rows = Math.ceil(__o.count / cols);
const dot = _rb.circle("Embedding Dot", 4, { fill: "#64748B", opacity: 70 });
track("dot", dot);
const grid = _rb.dup(dot, { name: "Embedding Cloud", columns: cols, rows: rows, width: 1500, height: 760 });
track("grid", grid);
const nx = _rb.layer("noise", "Embedding Drift X", { strength: 18, "generator.frequency": 0.25, "generator.timeScale": 0.3, "generator.seed": 5 });
const ny = _rb.layer("noise", "Embedding Drift Y", { strength: 18, "generator.frequency": 0.25, "generator.timeScale": 0.3, "generator.seed": 9 });
api.connect(nx, "id", dot, "position.x");
api.connect(ny, "id", dot, "position.y");
const cx = __o.clusterPos[0], cy = __o.clusterPos[1];
const halo = _rb.circle("Cluster Halo", 150, { fill: __o.highlightColor, alpha: 22, x: cx, y: cy });
_rb.glow(halo, __o.highlightColor, 46, 2);
track("halo", halo);
const ring = _rb.circle("Cluster Ring", 88, { fill: "#000000", alpha: 0, x: cx, y: cy });
_rb.stroke(ring, __o.highlightColor, 1.5, { capStyle: 1, trim: [0, 100] });
_rb.kf(ring, "rotation", [[0, 0], [120, 180]], "Linear");
_rb.text("semantic cluster", 14, { color: "#C4B5FD", x: cx, y: cy - 78, name: "Cluster Label" });
`,
  },
  {
    id: "model_selector_pill",
    title: "Model Selector Pill",
    category: "ai_agents",
    description: "Segmented model switcher with a spring-loaded active pill sliding between labels.",
    params: {
      leftLabel: { type: "string", default: "GPT-4o", description: "Left option" },
      rightLabel: { type: "string", default: "Claude", description: "Right option" },
      pillColor: { type: "color", default: "#8B5CF6", description: "Active pill" },
      switchFrame: { type: "int", default: 30, description: "Switch frame" },
    },
    code: `
const w = 440, h = 66, seg = w / 2 - 8;
const trackBar = _rb.rect("Model Track", w, h, { fill: "#111827", radius: h / 2, stroke: true, strokeColor: "#27303F", strokeWidth: 1 });
track("track", trackBar);
const active = _rb.rect("Active Pill", seg, h - 12, { fill: __o.pillColor, radius: (h - 12) / 2, x: -w / 4 });
_rb.glow(active, __o.pillColor, 18, 1.3);
track("active", active);
_rb.kf(active, "position.x", [[__o.switchFrame, -w / 4], [__o.switchFrame + 20, w / 4]], "SpringOut");
_rb.text(__o.leftLabel, 18, { color: "#F8FAFC", x: -w / 4 });
_rb.text(__o.rightLabel, 18, { color: "#F8FAFC", x: w / 4 });
`,
  },
  {
    id: "context_window_meter",
    title: "Context Window Meter",
    category: "ai_agents",
    description: "Left-anchored token bar compressing from 95% to 5% with an emerald fill and savings counter.",
    params: {
      beforePct: { type: "double", default: 95, description: "Starting usage %" },
      afterPct: { type: "double", default: 5, description: "Ending usage %" },
      width: { type: "double", default: 720, description: "Bar width" },
    },
    code: `
const w = __o.width, h = 46;
const trackBar = _rb.rect("Token Track", w, h, { fill: "#1F2937", radius: h / 2, x: 0, y: 0 });
track("track", trackBar);
const fill = _rb.rect("Token Fill", w, h, { fill: "#10B981", radius: h / 2 });
_rb.anchor(fill, -1, 0);
_rb.pos(fill, -w / 2, 0);
_rb.scale(fill, __o.beforePct / 100, 1);
_rb.kf(fill, "scale.x", [[0, __o.beforePct / 100], [50, __o.afterPct / 100]], "SlowInSlowOut");
track("fill", fill);
const danger = _rb.rect("Token Danger", w, h, { fill: "#EF4444", radius: h / 2 });
_rb.anchor(danger, -1, 0);
_rb.pos(danger, -w / 2, 0);
_rb.scale(danger, __o.beforePct / 100, 1);
_rb.kf(danger, "scale.x", [[0, __o.beforePct / 100], [50, __o.afterPct / 100]], "SlowInSlowOut");
_rb.kf(danger, "opacity", [[0, 100], [50, 0]], "SlowOut");
_rb.textLeft("CONTEXT WINDOW", 14, -w / 2, 46, { color: "#64748B" });
const saved = _rb.textRight("saved", 16, w / 2, 46, { color: "#10B981" });
`,
  },
  {
    id: "prompt_to_ui_wireframe",
    title: "Prompt to UI Wireframe",
    category: "ai_agents",
    description: "Prompt bar stretches, a panel unfolds, and wireframe cards stagger into place.",
    params: {
      promptText: { type: "string", default: "Build an analytics dashboard", description: "Prompt" },
      panelCount: { type: "int", default: 4, description: "Wireframe cards" },
      accentColor: { type: "color", default: "#8B5CF6", description: "Prompt accent" },
    },
    code: `
const prompt = _rb.rect("Prompt Bar", 620, 68, { fill: "#111827", radius: 34, x: 0, y: 250, stroke: true, strokeColor: __o.accentColor, strokeWidth: 2 });
track("prompt", prompt);
_rb.textLeft(__o.promptText, 22, -270, 250, { color: "#E2E8F0" });
_rb.kf(prompt, "scale.x", [[0, 1], [22, 1.42]], "SlowInSlowOut");
const panel = _rb.rect("Wireframe Panel", 880, 430, { fill: "#0F1520", radius: 22, x: 0, y: -60, stroke: true, strokeColor: "#27303F", strokeWidth: 2 });
_rb.scale(panel, 1, 0.02);
_rb.kf(panel, "scale.y", [[14, 0.02], [34, 1]], "SlowInSlowOut");
_rb.fade(panel, 14, 12, 0, 100, "SlowOut");
track("panel", panel);
const n = __o.panelCount;
const cols = Math.min(2, n);
const cw = 380, ch = 150;
for (let i = 0; i < n; i++) {
  const col = i % cols, row = Math.floor(i / cols);
  const x = (col - (cols - 1) / 2) * (cw + 20);
  const y = 40 - row * (ch + 20);
  const card = _rb.rect("Wire Card " + (i + 1), cw, ch, { fill: "#0B0C10", radius: 12, x: x, y: y, stroke: true, strokeColor: "#334155", strokeWidth: 1 });
  _rb.pop(card, 34 + i * 4, 16, { ease: "SpringOut" });
  const header = _rb.rect("Wire Header " + (i + 1), cw - 40, 12, { fill: __o.accentColor, radius: 6, x: x, y: y + ch / 2 - 26 });
  const lineA = _rb.rect("Wire Line A " + (i + 1), cw - 80, 8, { fill: "#334155", radius: 4, x: x - 20, y: y });
  const lineB = _rb.rect("Wire Line B " + (i + 1), cw - 140, 8, { fill: "#334155", radius: 4, x: x - 50, y: y - 26 });
  api.parent(header, card);
  api.parent(lineA, card);
  api.parent(lineB, card);
  if (i === 0) track("card", card);
}
`,
  },
];
