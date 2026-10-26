import type { PresetDef } from "../types.js";

export const CAT13_ONBOARDING_PLG: PresetDef[] = [
  {
    id: "welcome_modal",
    title: "Welcome Modal",
    category: "onboarding_plg",
    description: "A first-run welcome modal springs over a dimmed backdrop, with brand pill, feature checklist and a glowing CTA.",
    params: {
      brand: { type: "string", default: "ACME", description: "Product wordmark" },
      headline: { type: "string", default: "Welcome to Acme", description: "Modal heading" },
      ctaText: { type: "string", default: "Create my workspace", description: "Primary button label" },
      accentColor: { type: "color", default: "#10B981", description: "CTA colour" },
    },
    code: `
const m = _rb.modal("Welcome", 780, 520, { start: 2, duration: 18, fill: "#111827" });
track("card", m.card);
const brand = _rb.logoPill("Welcome Brand", __o.brand, 0, 176, {
  width: 136, height: 40, fontSize: 15, fill: "#0B1220", strokeColor: "#1E3A4A", color: __o.accentColor
});
_rb.pop(brand.pill, 8, 16, { from: 0.6, ease: "SpringOut" });
_rb.pop(brand.mark, 8, 16, { from: 0.6, ease: "SpringOut" });
_rb.pop(brand.text, 8, 16, { from: 0.6, ease: "SpringOut" });
const head = _rb.text(__o.headline, 38, { color: "#F8FAFC", x: 0, y: 104 });
_rb.pop(head, 9, 18, { from: 0.82, ease: "SpringOut" });
const sub = _rb.text("Let us get your workspace set up in under a minute.", 16, { color: "#94A3B8", x: 0, y: 62 });
_rb.fade(sub, 13, 14, 0, 100, "SlowOut");
const feats = ["Unlimited projects", "Real-time collaboration", "Instant exports"];
for (let i = 0; i < feats.length; i++) {
  const y = 6 - i * 38;
  const ck = _rb.checkBadge("Welcome Check " + i, -262, y, 26, __o.accentColor);
  _rb.fade(ck.circle, 15 + i * 4, 12, 0, 100, "SlowOut");
  _rb.fade(ck.check, 15 + i * 4, 12, 0, 100, "SlowOut");
  const label = _rb.textLeft(feats[i], 17, -238, y, { color: "#CBD5E1" });
  _rb.fade(label, 15 + i * 4, 12, 0, 100, "SlowOut");
}
const cta = _rb.pill("Welcome CTA", 340, 66, { fill: __o.accentColor, x: 0, y: -158 });
_rb.pop(cta, 24, 18, { from: 0.4, ease: "SpringOut" });
_rb.glow(cta, __o.accentColor, 28, 0.8);
track("cta", cta);
const ctaLabel = _rb.text(__o.ctaText, 19, { color: "#04120C", x: 0, y: -158 });
_rb.pop(ctaLabel, 25, 18, { from: 0.6, ease: "SpringOut" });
_rb.sonar("Welcome CTA Sonar", 0, -158, 120, __o.accentColor, { count: 2, start: 30, gap: 10, duration: 26, width: 2, from: 35 });
const foot = _rb.text("No credit card required  -  cancel anytime", 12, { color: "#475569", x: 0, y: -214 });
_rb.fade(foot, 32, 12, 0, 100, "SlowOut");
`,
  },
  {
    id: "step_progress_onboarding",
    title: "Step Progress Onboarding",
    category: "onboarding_plg",
    description: "A four-step setup stepper draws its connector, pops completed checks and pulses the active step before the CTA.",
    params: {
      heading: { type: "string", default: "Set up your workspace", description: "Page heading" },
      ctaText: { type: "string", default: "Continue setup", description: "Primary button label" },
      accentColor: { type: "color", default: "#10B981", description: "Completed colour" },
      activeColor: { type: "color", default: "#38BDF8", description: "Active step colour" },
    },
    code: `
const heading = _rb.text(__o.heading, 34, { color: "#F8FAFC", x: 0, y: 214 });
_rb.fade(heading, 0, 12, 0, 100, "SlowOut");
const sub = _rb.text("Four quick steps and you are shipping.", 15, { color: "#64748B", x: 0, y: 176 });
_rb.fade(sub, 2, 12, 0, 100, "SlowOut");
const lineTrack = _rb.rect("Step Track", 660, 4, { fill: "#1F2937", radius: 2, x: 0, y: 60 });
const lineFill = _rb.rect("Step Fill", 660, 4, { fill: __o.accentColor, radius: 2 });
_rb.anchor(lineFill, -1, 0);
_rb.pos(lineFill, -330, 60);
_rb.kf(lineFill, "scale.x", [[6, 0.001], [30, 0.667]], "SlowInOut");
track("progress", lineFill);
const names = ["Account", "Workspace", "Invite team", "Launch"];
const subs = ["done", "done", "in progress", "next"];
for (let i = 0; i < 4; i++) {
  const x = -330 + i * 220;
  const done = i < 2;
  const active = i === 2;
  const circle = _rb.circle("Step " + (i + 1), 30, {
    fill: done ? __o.accentColor : "#0B1220", x: x, y: 60,
    stroke: true, strokeColor: done ? __o.accentColor : (active ? __o.activeColor : "#334155"), strokeWidth: active ? 3 : 2
  });
  _rb.pop(circle, 6 + i * 5, 16, { from: 0.4, ease: "SpringOut" });
  if (done) {
    const ck = _rb.text("\\u2713", 26, { color: "#04120C", x: x, y: 60, name: "Step Check " + i });
    _rb.pop(ck, 8 + i * 5, 14, { from: 0.001, ease: "SpringOut" });
  } else {
    const num = _rb.text(String(i + 1), 20, { color: active ? __o.activeColor : "#64748B", x: x, y: 60, name: "Step Num " + i });
    _rb.pop(num, 8 + i * 5, 14, { from: 0.6, ease: "SpringOut" });
  }
  const label = _rb.text(names[i], 17, { color: done ? "#F8FAFC" : (active ? "#F8FAFC" : "#64748B"), x: x, y: 2, name: "Step Label " + i });
  _rb.fade(label, 10 + i * 5, 12, 0, 100, "SlowOut");
  const subLabel = _rb.text(subs[i], 11, { color: active ? __o.activeColor : "#475569", x: x, y: -22, name: "Step Sub " + i });
  _rb.fade(subLabel, 10 + i * 5, 12, 0, 100, "SlowOut");
  if (active) {
    _rb.glow(circle, __o.activeColor, 26, 1.2);
    _rb.sonar("Step Sonar", x, 60, 30, __o.activeColor, { count: 2, start: 24, gap: 16, duration: 30, width: 2, from: 60 });
    track("activeStep", circle);
  }
}
const cta = _rb.pill("Step CTA", 300, 60, { fill: __o.accentColor, x: 0, y: -150 });
_rb.pop(cta, 32, 18, { from: 0.5, ease: "SpringOut" });
_rb.glow(cta, __o.accentColor, 26, 0.7);
track("cta", cta);
const ctaText = _rb.text(__o.ctaText, 18, { color: "#04120C", x: 0, y: -150 });
_rb.pop(ctaText, 33, 18, { from: 0.6, ease: "SpringOut" });
const hint = _rb.text("About 40 seconds left  -  you can finish this later", 11, { color: "#475569", x: 0, y: -200 });
_rb.fade(hint, 36, 12, 0, 100, "SlowOut");
`,
  },
  {
    id: "feature_tour_spotlight",
    title: "Feature Tour Spotlight",
    category: "onboarding_plg",
    description: "The dashboard dims, a spotlight ring draws around the primary action and a tooltip card pops with tour controls.",
    params: {
      stepTitle: { type: "string", default: "Create your first project", description: "Tooltip heading" },
      stepCount: { type: "int", default: 1, description: "Current step (1-3)" },
      accentColor: { type: "color", default: "#38BDF8", description: "Spotlight colour" },
    },
    code: `
const dash = _rb.rect("Tour Dashboard", 880, 520, { fill: "#0B0F14", radius: 22, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.pop(dash, 0, 20, { from: 0.96, ease: "SpringOut", fade: false });
track("dashboard", dash);
_rb.textLeft("Projects", 24, -400, 196, { color: "#F8FAFC" });
_rb.rect("Search Field", 240, 36, { fill: "#111827", radius: 18, x: -40, y: 196, stroke: true, strokeColor: "#1F2937", strokeWidth: 1 });
_rb.textLeft("Search projects...", 13, -144, 196, { color: "#475569" });
const newBtn = _rb.pill("New Project Button", 156, 40, { fill: __o.accentColor, x: 320, y: 196 });
_rb.text("+ New project", 14, { color: "#04121C", x: 320, y: 196 });
const rows = [
  { label: "Q4 launch film", value: "Live", dot: "#10B981" },
  { label: "Pricing page loop", value: "Draft", dot: "#F59E0B" },
  { label: "Sales deck intro", value: "Live", dot: "#10B981" },
  { label: "Brand stinger", value: "Review", dot: "#38BDF8" }
];
for (let i = 0; i < rows.length; i++) {
  _rb.listRow("Tour Row " + i, 800, 56, { x: 0, y: 110 - i * 66, label: rows[i].label, value: rows[i].value, dotColor: rows[i].dot, fill: "#0F141B", strokeColor: "#1B2430" });
}
const dim = _rb.rect("Tour Dim", 1920, 1080, { fill: "#000000", x: 0, y: 0, opacity: 0 });
_rb.fade(dim, 6, 10, 0, 52, "SlowOut");
const ring = _rb.circle("Tour Spotlight", 78, { fill: "#000000", alpha: 0, x: 320, y: 196 });
_rb.stroke(ring, __o.accentColor, 4, { capStyle: 1, trim: [0, 100] });
_rb.glow(ring, __o.accentColor, 30, 1.6);
_rb.pop(ring, 12, 18, { from: 0.5, ease: "SpringOut", fade: false });
track("spotlight", ring);
const lift = _rb.pill("Spotlit Button", 156, 40, { fill: __o.accentColor, x: 320, y: 196 });
_rb.pop(lift, 13, 16, { from: 0.7, ease: "SpringOut" });
const liftText = _rb.text("+ New project", 14, { color: "#04121C", x: 320, y: 196 });
_rb.pop(liftText, 13, 16, { from: 0.7, ease: "SpringOut" });
const tip = _rb.rect("Tour Tooltip", 380, 190, { fill: "#111827", radius: 18, x: 210, y: -40, stroke: true, strokeColor: __o.accentColor, strokeWidth: 2 });
_rb.glow(tip, __o.accentColor, 26, 0.5);
_rb.pop(tip, 18, 18, { from: 0.8, ease: "SpringOut", fade: false });
track("tooltip", tip);
const step = _rb.textLeft("STEP " + (__o.stepCount || 1) + " OF 3", 11, 42, 20, { color: __o.accentColor });
_rb.fade(step, 22, 10, 0, 100, "SlowOut");
const tipTitle = _rb.textLeft(__o.stepTitle, 20, 42, -8, { color: "#F8FAFC" });
_rb.fade(tipTitle, 22, 10, 0, 100, "SlowOut");
const tipLine1 = _rb.textLeft("Projects hold your scenes, shots", 13, 42, -38, { color: "#94A3B8" });
_rb.fade(tipLine1, 24, 10, 0, 100, "SlowOut");
const tipLine2 = _rb.textLeft("and render queue in one place.", 13, 42, -58, { color: "#94A3B8" });
_rb.fade(tipLine2, 26, 10, 0, 100, "SlowOut");
for (let i = 0; i < 3; i++) {
  const d = _rb.dot("Tour Dot " + i, 50 + i * 16, -104, 7, i === 0 ? __o.accentColor : "#334155");
  _rb.fade(d, 26 + i * 2, 8, 0, 100, "SlowOut");
}
const next = _rb.pill("Tour Next", 108, 34, { fill: __o.accentColor, x: 326, y: -104 });
_rb.pop(next, 28, 14, { from: 0.6, ease: "SpringOut" });
const nextText = _rb.text("Next", 13, { color: "#04121C", x: 326, y: -104 });
_rb.pop(nextText, 28, 14, { from: 0.6, ease: "SpringOut" });
const skip = _rb.textLeft("Skip tour", 12, 112, -104, { color: "#64748B" });
_rb.fade(skip, 28, 10, 0, 100, "SlowOut");
`,
  },
  {
    id: "checklist_activation",
    title: "Checklist Activation",
    category: "onboarding_plg",
    description: "An activation checklist checks tasks off with strike-throughs while the completion bar fills to half and the CTA pops.",
    params: {
      heading: { type: "string", default: "Get started", description: "Card heading" },
      ctaText: { type: "string", default: "Invite your team", description: "Primary button label" },
      accentColor: { type: "color", default: "#10B981", description: "Completion colour" },
    },
    code: `
const card = _rb.rect("Checklist Card", 620, 560, { fill: "#111827", radius: 24, x: 0, y: 0, stroke: true, strokeColor: "#27303F", strokeWidth: 2 });
_rb.pop(card, 0, 20, { from: 0.94, ease: "SpringOut", fade: false });
track("card", card);
const heading = _rb.textLeft(__o.heading, 28, -270, 222, { color: "#F8FAFC" });
_rb.fade(heading, 4, 10, 0, 100, "SlowOut");
const count = _rb.textRight("2 of 4 complete", 13, 270, 226, { color: "#64748B" });
_rb.fade(count, 26, 10, 0, 100, "SlowOut");
const prog = _rb.progress("Checklist Progress", 540, 10, { x: 0, y: 176, pct: 0.5, start: 10, duration: 30, color: __o.accentColor, trackColor: "#1F2937" });
track("progress", prog.fill);
const items = ["Create your account", "Connect a data source", "Invite your team", "Publish your first project"];
const doneAt = [16, 26, 0, 0];
for (let i = 0; i < 4; i++) {
  const y = 84 - i * 66;
  const done = i < 2;
  const active = i === 2;
  const circle = _rb.circle("Task Circle " + i, 21, {
    fill: "#0B1220", x: -230, y: y,
    stroke: true, strokeColor: active ? "#38BDF8" : "#334155", strokeWidth: 2
  });
  _rb.fade(circle, 8 + i * 3, 10, 0, 100, "SlowOut");
  if (done) {
    const filled = _rb.circle("Task Done " + i, 21, { fill: __o.accentColor, x: -230, y: y });
    _rb.pop(filled, doneAt[i], 12, { from: 0.001, ease: "SpringOut", fade: false });
    const ck = _rb.text("\\u2713", 18, { color: "#04120C", x: -230, y: y, name: "Task Check " + i });
    _rb.pop(ck, doneAt[i], 12, { from: 0.001, ease: "SpringOut" });
    const strike = _rb.line("Task Strike " + i, -196, y, -196 + items[i].length * 8.8, y, 2, "#475569");
    _rb.kf(strike, "scale.x", [[doneAt[i], 0.001], [doneAt[i] + 10, 1]], "SlowInOut");
  } else if (active) {
    const inner = _rb.dot("Task Active Dot", -230, y, 10, "#38BDF8", { glow: 12 });
    _rb.kf(inner, "scale.x", [[18, 0.8], [28, 1.3], [38, 0.8]], "SlowInOut");
    _rb.kf(inner, "scale.y", [[18, 0.8], [28, 1.3], [38, 0.8]], "SlowInOut");
    const go = _rb.textRight("Resume  ->", 12, 268, y, { color: "#38BDF8" });
    _rb.fade(go, 30, 10, 0, 100, "SlowOut");
  }
  const label = _rb.textLeft(items[i], 17, -196, y, { color: done ? "#64748B" : (active ? "#F8FAFC" : "#94A3B8") });
  _rb.fade(label, 8 + i * 3, 10, 0, 100, "SlowOut");
}
const cta = _rb.pill("Checklist CTA", 300, 58, { fill: __o.accentColor, x: 0, y: -220 });
_rb.pop(cta, 36, 18, { from: 0.5, ease: "SpringOut" });
_rb.glow(cta, __o.accentColor, 24, 0.7);
track("cta", cta);
const ctaText = _rb.text(__o.ctaText, 18, { color: "#04120C", x: 0, y: -220 });
_rb.pop(ctaText, 37, 18, { from: 0.6, ease: "SpringOut" });
`,
  },
  {
    id: "empty_state_invite",
    title: "Empty State Invite",
    category: "onboarding_plg",
    description: "A dashed empty-state frame builds its skeleton rows, then a plus orb pops and the create CTA springs in with sonar.",
    params: {
      heading: { type: "string", default: "No projects yet", description: "Empty state heading" },
      ctaText: { type: "string", default: "Create project", description: "Primary button label" },
      accentColor: { type: "color", default: "#38BDF8", description: "Accent colour" },
    },
    code: `
const frame = _rb.rect("Empty Frame", 340, 220, { fill: "#0B0F14", radius: 24, x: 0, y: 100 });
_rb.stroke(frame, "#334155", 3, { capStyle: 0, dash: [10, 8] });
_rb.kf(frame, "scale.x", [[2, 0.001], [20, 1]], "SpringOut");
_rb.kf(frame, "scale.y", [[2, 0.001], [20, 1]], "SpringOut");
track("frame", frame);
for (let i = 0; i < 3; i++) {
  const row = _rb.rect("Empty Skeleton " + i, 220 - i * 34, 18, { fill: "#111827", radius: 9, x: 0, y: 160 - i * 32 });
  _rb.kf(row, "position.y", [[6 + i * 3, 176 - i * 32], [20 + i * 3, 160 - i * 32]], "SlowOut");
  _rb.fade(row, 6 + i * 3, 12, 0, 100, "SlowOut");
}
const plus = _rb.circle("Empty Plus", 26, { fill: __o.accentColor, x: 118, y: 24 });
_rb.glow(plus, __o.accentColor, 22, 1.2);
_rb.pop(plus, 22, 16, { from: 0.001, ease: "SpringOut" });
const plusGlyph = _rb.text("+", 30, { color: "#04121C", x: 118, y: 24, name: "Empty Plus Glyph" });
_rb.pop(plusGlyph, 22, 16, { from: 0.001, ease: "SpringOut" });
_rb.sonar("Empty Plus Sonar", 118, 24, 26, __o.accentColor, { count: 2, start: 26, gap: 10, duration: 26, width: 2, from: 55 });
const heading = _rb.text(__o.heading, 34, { color: "#F8FAFC", x: 0, y: -66 });
_rb.pop(heading, 12, 18, { from: 0.86, ease: "SpringOut" });
const copy = _rb.text("Create your first project to start rendering.", 15, { color: "#64748B", x: 0, y: -104 });
_rb.fade(copy, 16, 12, 0, 100, "SlowOut");
const cta = _rb.pill("Empty CTA", 280, 58, { fill: __o.accentColor, x: 0, y: -166 });
_rb.pop(cta, 26, 18, { from: 0.4, ease: "SpringOut" });
_rb.glow(cta, __o.accentColor, 26, 0.8);
track("cta", cta);
const ctaText = _rb.text(__o.ctaText, 18, { color: "#04121C", x: 0, y: -166 });
_rb.pop(ctaText, 27, 18, { from: 0.6, ease: "SpringOut" });
_rb.sonar("Empty CTA Sonar", 0, -166, 110, __o.accentColor, { count: 2, start: 32, gap: 12, duration: 28, width: 2, from: 35 });
const alt = _rb.text("or import from GitHub", 12, { color: "#475569", x: 0, y: -228 });
_rb.fade(alt, 32, 12, 0, 100, "SlowOut");
`,
  },
  {
    id: "template_picker",
    title: "Template Picker",
    category: "onboarding_plg",
    description: "A two-by-two template gallery pops in card by card, a selection ring and check settle on one, then the CTA appears.",
    params: {
      heading: { type: "string", default: "Start from a template", description: "Gallery heading" },
      ctaText: { type: "string", default: "Use this template", description: "Primary button label" },
      accentColor: { type: "color", default: "#8B5CF6", description: "Selection colour" },
    },
    code: `
const heading = _rb.text(__o.heading, 32, { color: "#F8FAFC", x: 0, y: 240 });
_rb.pop(heading, 0, 18, { from: 0.88, ease: "SpringOut" });
const sub = _rb.text("Pick a layout and make it yours.", 14, { color: "#64748B", x: 0, y: 206 });
_rb.fade(sub, 3, 12, 0, 100, "SlowOut");
const templates = ["Launch page", "Dashboard", "Pricing", "Mobile app"];
const tags = ["Free", "Pro", "Free", "New"];
const colors = ["#0EA5E9", "#8B5CF6", "#10B981", "#F59E0B"];
for (let i = 0; i < 4; i++) {
  const col = i % 2, row = Math.floor(i / 2);
  const x = -195 + col * 390;
  const y = 62 - row * 220;
  const card = _rb.rect("Template Card " + i, 370, 210, { fill: "#111827", radius: 22, x: x, y: y, stroke: true, strokeColor: i === 1 ? __o.accentColor : "#27303F", strokeWidth: 2 });
  _rb.pop(card, 4 + i * 4, 18, { from: 0.85, ease: "SpringOut", fade: false });
  const thumb = _rb.rect("Template Thumb " + i, 330, 118, { fill: colors[i], radius: 14, x: x, y: y + 28 });
  _rb.alpha(thumb, 32);
  _rb.circle("Template Orb " + i, 34, { fill: colors[i], alpha: 90, x: x - 96, y: y + 34 });
  _rb.rect("Template Bar " + i, 170, 12, { fill: colors[i], radius: 6, x: x + 20, y: y + 6, alpha: 120 });
  _rb.rect("Template Bar B " + i, 120, 8, { fill: "#94A3B8", radius: 4, x: x - 10, y: y - 12, alpha: 60 });
  _rb.fade(thumb, 5 + i * 4, 12, 0, 100, "SlowOut");
  const title = _rb.textLeft(templates[i], 16, x - 163, y - 58, { color: "#E2E8F0" });
  _rb.fade(title, 7 + i * 4, 10, 0, 100, "SlowOut");
  const tag = _rb.badge("Template Tag " + i, tags[i], x + 120, y - 58, { fill: "#0F172A", color: "#94A3B8", fontSize: 10, height: 22, stroke: true, strokeColor: "#27303F" });
  _rb.fade(tag.pill, 7 + i * 4, 10, 0, 100, "SlowOut");
  _rb.fade(tag.text, 7 + i * 4, 10, 0, 100, "SlowOut");
  if (i === 0) track("card", card);
}
const ring = _rb.rect("Template Selected", 378, 218, { fill: "#000000", alpha: 0, radius: 24, x: 195, y: 62, stroke: true, strokeColor: __o.accentColor, strokeWidth: 3 });
_rb.glow(ring, __o.accentColor, 22, 0.9);
_rb.pop(ring, 26, 16, { from: 0.9, ease: "SpringOut", fade: false });
track("selected", ring);
const picked = _rb.checkBadge("Template Check", 362, 151, 32, __o.accentColor);
_rb.pop(picked.circle, 28, 14, { from: 0.001, ease: "SpringOut" });
_rb.pop(picked.check, 28, 14, { from: 0.001, ease: "SpringOut" });
const cta = _rb.pill("Template CTA", 300, 58, { fill: __o.accentColor, x: 0, y: -316 });
_rb.pop(cta, 36, 18, { from: 0.5, ease: "SpringOut" });
_rb.glow(cta, __o.accentColor, 24, 0.7);
track("cta", cta);
const ctaText = _rb.text(__o.ctaText, 18, { color: "#F8FAFC", x: 0, y: -316 });
_rb.pop(ctaText, 37, 18, { from: 0.6, ease: "SpringOut" });
`,
  },
  {
    id: "sample_data_import",
    title: "Sample Data Import",
    category: "onboarding_plg",
    description: "A CSV import card animates its progress to one hundred percent, percent counter climbing as sample rows fade in.",
    params: {
      fileName: { type: "string", default: "sales_q4.csv", description: "File name" },
      rowCount: { type: "int", default: 1204, description: "Imported row count" },
      accentColor: { type: "color", default: "#10B981", description: "Progress colour" },
    },
    code: `
const card = _rb.rect("Import Card", 720, 460, { fill: "#111827", radius: 24, x: 0, y: 0, stroke: true, strokeColor: "#27303F", strokeWidth: 2 });
_rb.pop(card, 0, 18, { from: 0.94, ease: "SpringOut", fade: false });
track("card", card);
const heading = _rb.textLeft("Import sample data", 24, -320, 176, { color: "#F8FAFC" });
_rb.fade(heading, 3, 10, 0, 100, "SlowOut");
const type = _rb.textRight("CSV", 11, 320, 180, { color: "#64748B" });
_rb.fade(type, 3, 10, 0, 100, "SlowOut");
const fileRow = _rb.rect("Import File Row", 640, 64, { fill: "#0B0F14", radius: 14, x: 0, y: 100, stroke: true, strokeColor: "#1F2937", strokeWidth: 1 });
_rb.fade(fileRow, 5, 10, 0, 100, "SlowOut");
const icon = _rb.rect("Import Icon", 40, 40, { fill: __o.accentColor, radius: 10, x: -286, y: 100 });
_rb.alpha(icon, 30);
_rb.text("CSV", 10, { color: __o.accentColor, x: -286, y: 100 });
const fileName = _rb.textLeft(__o.fileName, 15, -254, 112, { color: "#E2E8F0" });
_rb.fade(fileName, 6, 10, 0, 100, "SlowOut");
const fileMeta = _rb.textLeft("2.4 MB  -  1,204 rows", 11, -254, 90, { color: "#64748B" });
_rb.fade(fileMeta, 6, 10, 0, 100, "SlowOut");
const ready = _rb.badge("Import Ready", "Ready", 282, 100, { fill: "#0F172A", color: "#94A3B8", fontSize: 11, height: 24, stroke: true, strokeColor: "#27303F" });
_rb.fade(ready.pill, 8, 8, 0, 100, "SlowOut");
_rb.fade(ready.text, 8, 8, 0, 100, "SlowOut");
const prog = _rb.progress("Import Progress", 640, 10, { x: 0, y: 24, pct: 1, start: 8, duration: 30, color: __o.accentColor, trackColor: "#1F2937" });
track("progress", prog.fill);
const pctText = _rb.textRight("100%", 13, 320, 50, { color: __o.accentColor });
_rb.fade(pctText, 8, 8, 0, 100, "SlowOut");
_rb.counter(pctText, { from: 0, to: 100, suffix: "%", start: 8, duration: 30, ease: "SlowOut", length: 1 });
track("percent", pctText);
const rowData = [
  ["4021", "Enterprise plan", "$2,400"],
  ["4022", "Team plan", "$480"],
  ["4023", "Starter plan", "$96"],
  ["4024", "Enterprise plan", "$2,400"]
];
for (let i = 0; i < 4; i++) {
  const y = -6 - i * 38;
  const bg = _rb.rect("Import Row " + i, 640, 30, { fill: "#0F141B", radius: 8, x: 0, y: y });
  _rb.fade(bg, 18 + i * 5, 10, 0, 100, "SlowOut");
  const idText = _rb.textLeft("id " + rowData[i][0], 11, -310, y, { color: "#475569" });
  const nameText = _rb.textLeft(rowData[i][1], 12, -220, y, { color: "#CBD5E1" });
  const amountText = _rb.textRight(rowData[i][2], 12, 150, y, { color: "#E2E8F0" });
  const okDot = _rb.dot("Import Row Dot " + i, 300, y, 8, __o.accentColor);
  _rb.fade(idText, 18 + i * 5, 10, 0, 100, "SlowOut");
  _rb.fade(nameText, 18 + i * 5, 10, 0, 100, "SlowOut");
  _rb.fade(amountText, 18 + i * 5, 10, 0, 100, "SlowOut");
  _rb.fade(okDot, 18 + i * 5, 10, 0, 100, "SlowOut");
}
const success = _rb.badge("Import Success", "\\u2713  1,204 rows imported", 0, -204, { fill: "#052E22", color: "#34D399", fontSize: 14, height: 36, stroke: true, strokeColor: "#065F46" });
_rb.pop(success.pill, 44, 16, { from: 0.5, ease: "SpringOut" });
_rb.pop(success.text, 44, 16, { from: 0.5, ease: "SpringOut" });
track("success", success.pill);
`,
  },
  {
    id: "invite_team_modal",
    title: "Invite Team Modal",
    category: "onboarding_plg",
    description: "An invite modal springs over a backdrop while teammate chips pop in one by one and the send button locks in with a glow.",
    params: {
      workspace: { type: "string", default: "Acme workspace", description: "Workspace label" },
      seatCount: { type: "int", default: 3, description: "Seats left" },
      accentColor: { type: "color", default: "#38BDF8", description: "Primary colour" },
    },
    code: `
const m = _rb.modal("Invite", 660, 540, { start: 2, duration: 18, fill: "#111827" });
track("card", m.card);
const heading = _rb.text("Invite your team", 32, { color: "#F8FAFC", x: 0, y: 190 });
_rb.pop(heading, 8, 18, { from: 0.86, ease: "SpringOut" });
const sub = _rb.text(__o.workspace + "  -  " + (__o.seatCount || 3) + " seats left", 13, { color: "#64748B", x: 0, y: 156 });
_rb.fade(sub, 11, 12, 0, 100, "SlowOut");
const input = _rb.rect("Invite Input", 560, 60, { fill: "#0B0F14", radius: 14, x: 0, y: 96, stroke: true, strokeColor: "#334155", strokeWidth: 2 });
_rb.fade(input, 10, 10, 0, 100, "SlowOut");
const placeholder = _rb.textLeft("name@company.com", 15, -250, 96, { color: "#475569" });
_rb.fade(placeholder, 11, 10, 0, 100, "SlowOut");
const add = _rb.pill("Invite Add", 92, 40, { fill: "#1E293B", x: 216, y: 96 });
_rb.fade(add, 11, 10, 0, 100, "SlowOut");
const addText = _rb.text("Add", 12, { color: "#94A3B8", x: 216, y: 96 });
_rb.fade(addText, 11, 10, 0, 100, "SlowOut");
const invites = [
  { email: "maya@acme.dev", initials: "MC", color: "#8B5CF6" },
  { email: "leo@acme.dev", initials: "LT", color: "#38BDF8" },
  { email: "sara@acme.dev", initials: "SK", color: "#10B981" }
];
for (let i = 0; i < invites.length; i++) {
  const x = -185 + i * 185;
  const start = 14 + i * 8;
  const chip = _rb.pill("Invite Chip " + i, 172, 42, { fill: "#0F172A", x: x, y: 26, stroke: true, strokeColor: "#27303F", strokeWidth: 1 });
  _rb.pop(chip, start, 14, { from: 0.6, ease: "SpringOut" });
  const avatar = _rb.circle("Invite Avatar " + i, 13, { fill: invites[i].color, x: x - 60, y: 26 });
  _rb.pop(avatar, start, 14, { from: 0.001, ease: "SpringOut" });
  const initials = _rb.text(invites[i].initials, 9, { color: "#0B0C10", x: x - 60, y: 26, name: "Invite Initials " + i });
  _rb.pop(initials, start, 14, { from: 0.5, ease: "SpringOut" });
  const email = _rb.textLeft(invites[i].email, 12, x - 42, 26, { color: "#CBD5E1" });
  _rb.pop(email, start, 14, { from: 0.6, ease: "SpringOut" });
  if (i === 0) track("chip", chip);
}
const more = _rb.rect("Invite More", 172, 42, { fill: "#0B0F14", radius: 21, x: 0, y: -32, stroke: true, strokeColor: "#334155", strokeWidth: 1 });
_rb.stroke(more, "#334155", 1, { capStyle: 0, dash: [7, 6] });
const moreText = _rb.text("+ Add another", 11, { color: "#64748B", x: 0, y: -32 });
_rb.fade(moreText, 40, 10, 0, 100, "SlowOut");
const perm = _rb.textLeft("\\u2713  Can edit projects and comment", 12, -270, -96, { color: "#94A3B8" });
_rb.fade(perm, 22, 10, 0, 100, "SlowOut");
const send = _rb.pill("Invite Send", 340, 60, { fill: __o.accentColor, x: 0, y: -168 });
_rb.pop(send, 36, 18, { from: 0.5, ease: "SpringOut" });
_rb.glow(send, __o.accentColor, 26, 0.8);
track("send", send);
const sendText = _rb.text("Send 3 invites", 18, { color: "#04121C", x: 0, y: -168 });
_rb.pop(sendText, 37, 18, { from: 0.6, ease: "SpringOut" });
const done = _rb.badge("Invite Done", "\\u2713  Invites sent", 0, -228, { fill: "#052E22", color: "#34D399", fontSize: 12, height: 28, stroke: true, strokeColor: "#065F46" });
_rb.pop(done.pill, 48, 14, { from: 0.4, ease: "SpringOut" });
_rb.pop(done.text, 48, 14, { from: 0.4, ease: "SpringOut" });
track("done", done.pill);
`,
  },
  {
    id: "aha_moment_confetti",
    title: "Aha Moment Confetti",
    category: "onboarding_plg",
    description: "A first-insight card counts revenue up as its sparkline draws, then confetti bursts and an unlocked badge pops.",
    params: {
      headline: { type: "string", default: "Your first insight is ready", description: "Celebration heading" },
      value: { type: "double", default: 24.8, description: "Metric value in thousands" },
      accentColor: { type: "color", default: "#10B981", description: "Celebration colour" },
    },
    code: `
const heading = _rb.text(__o.headline, 30, { color: "#F8FAFC", x: 0, y: 268 });
_rb.pop(heading, 0, 18, { from: 0.86, ease: "SpringOut" });
const sub = _rb.text("We found money hiding in your organic channel.", 13, { color: "#64748B", x: 0, y: 236 });
_rb.fade(sub, 3, 12, 0, 100, "SlowOut");
const card = _rb.rect("Aha Card", 640, 320, { fill: "#111827", radius: 24, x: 0, y: 30, stroke: true, strokeColor: "#27303F", strokeWidth: 2 });
_rb.pop(card, 2, 20, { from: 0.92, ease: "SpringOut", fade: false });
_rb.glow(card, __o.accentColor, 32, 0.3);
track("card", card);
const label = _rb.textLeft("REVENUE ATTRIBUTION", 11, -288, 150, { color: __o.accentColor });
_rb.fade(label, 6, 10, 0, 100, "SlowOut");
const valueSeed = "$" + Number(__o.value || 24.8).toFixed(1) + "k";
const value = _rb.textLeft(valueSeed, 54, -288, 88, { color: "#F8FAFC" });
_rb.fade(value, 6, 10, 0, 100, "SlowOut");
_rb.counter(value, { from: 0, to: Number(__o.value || 24.8), prefix: "$", suffix: "k", start: 8, duration: 36, decimals: 1, ease: "SlowOut", length: 1 });
track("value", value);
const valueSub = _rb.textLeft("attributed to organic search", 12, -288, 48, { color: "#64748B" });
_rb.fade(valueSub, 10, 10, 0, 100, "SlowOut");
const delta = _rb.badge("Aha Delta", "+38%", 196, 158, { fill: "#052E22", color: "#34D399", fontSize: 12, height: 26 });
_rb.pop(delta.pill, 12, 14, { from: 0.6, ease: "SpringOut" });
_rb.pop(delta.text, 12, 14, { from: 0.6, ease: "SpringOut" });
_rb.sparkline("Aha Spark", [20, 34, 28, 52, 46, 70, 62, 88, 100], 300, 110, 120, 40, __o.accentColor, 4, { start: 10, stagger: 3, glow: 10, glowIntensity: 1.2 });
const check = _rb.checkBadge("Aha Check", 286, 158, 32, __o.accentColor, { glow: 14 });
_rb.pop(check.circle, 38, 16, { from: 0.001, ease: "SpringOut" });
_rb.pop(check.check, 38, 16, { from: 0.001, ease: "SpringOut" });
const badge = _rb.badge("Aha Badge", "Aha moment unlocked", 0, -172, { fill: "#052E22", color: "#34D399", fontSize: 14, height: 36, stroke: true, strokeColor: "#065F46" });
_rb.pop(badge.pill, 42, 16, { from: 0.5, ease: "SpringOut" });
_rb.pop(badge.text, 42, 16, { from: 0.5, ease: "SpringOut" });
track("badge", badge.pill);
_rb.confetti("Aha Confetti", 0, 30, 24, [__o.accentColor, "#38BDF8", "#F59E0B", "#F472B6", "#A78BFA"], { start: 18, duration: 36, spread: 250, lift: 40 });
_rb.confetti("Aha Confetti B", 0, -172, 12, [__o.accentColor, "#38BDF8", "#F59E0B"], { start: 44, duration: 26, spread: 150, lift: 10 });
const foot = _rb.text("Share this win with your team", 11, { color: "#475569", x: 0, y: -236 });
_rb.fade(foot, 46, 12, 0, 100, "SlowOut");
`,
  },
  {
    id: "trial_countdown_banner",
    title: "Trial Countdown Banner",
    category: "onboarding_plg",
    description: "A trial banner drops in, its day counter ticks down while the trial-usage bar fills and the upgrade CTA pops.",
    params: {
      days: { type: "int", default: 5, description: "Days left" },
      plan: { type: "string", default: "Pro trial", description: "Plan name" },
      accentColor: { type: "color", default: "#F59E0B", description: "Warning colour" },
    },
    code: `
const banner = _rb.rect("Trial Banner", 920, 132, { fill: "#1C1206", radius: 20, x: 0, y: 160, stroke: true, strokeColor: "#78350F", strokeWidth: 2 });
_rb.kf(banner, "position.y", [[0, 250], [18, 160]], "SpringOut");
_rb.fade(banner, 0, 12, 0, 100, "SlowOut");
track("banner", banner);
const badgeCircle = _rb.circle("Trial Icon", 26, { fill: __o.accentColor, x: -398, y: 160 });
_rb.pop(badgeCircle, 6, 14, { from: 0.001, ease: "SpringOut" });
const bang = _rb.text("!", 26, { color: "#1C1206", x: -398, y: 160 });
_rb.pop(bang, 6, 14, { from: 0.001, ease: "SpringOut" });
const title = _rb.textLeft("Your " + __o.plan + " is ending", 19, -352, 184, { color: "#FEF3C7" });
_rb.fade(title, 8, 10, 0, 100, "SlowOut");
const sub = _rb.textLeft("Upgrade to keep workflows and exports running.", 12, -352, 154, { color: "#B8A082" });
_rb.fade(sub, 10, 10, 0, 100, "SlowOut");
const daysText = _rb.text(String(__o.days || 5), 44, { color: __o.accentColor, x: 120, y: 190 });
_rb.fade(daysText, 8, 8, 0, 100, "SlowOut");
_rb.counter(daysText, { from: (__o.days || 5) + 4, to: __o.days || 5, start: 10, duration: 40, ease: "SlowInOut", length: 1 });
track("days", daysText);
const daysLabel = _rb.text("days left", 10, { color: "#B8A082", x: 120, y: 148 });
_rb.fade(daysLabel, 10, 8, 0, 100, "SlowOut");
const prog = _rb.progress("Trial Progress", 840, 6, { x: 0, y: 112, pct: 0.86, start: 22, duration: 20, color: __o.accentColor, trackColor: "#3A2A12" });
track("progress", prog.fill);
const cta = _rb.pill("Trial CTA", 190, 54, { fill: __o.accentColor, x: 330, y: 166 });
_rb.pop(cta, 22, 16, { from: 0.5, ease: "SpringOut" });
_rb.glow(cta, __o.accentColor, 24, 0.8);
track("cta", cta);
const ctaText = _rb.text("Upgrade now", 16, { color: "#1C1206", x: 330, y: 166 });
_rb.pop(ctaText, 23, 16, { from: 0.6, ease: "SpringOut" });
const close = _rb.text("\\u00D7", 16, { color: "#B8A082", x: 438, y: 204 });
_rb.fade(close, 30, 8, 0, 100, "SlowOut");
const card = _rb.rect("Trial Plan Card", 760, 260, { fill: "#111827", radius: 22, x: 0, y: -120, stroke: true, strokeColor: "#27303F", strokeWidth: 1 });
_rb.pop(card, 12, 20, { from: 0.94, ease: "SpringOut", fade: false });
const planTitle = _rb.textLeft("Everything in Pro", 22, -330, -52, { color: "#F8FAFC" });
_rb.fade(planTitle, 16, 10, 0, 100, "SlowOut");
const perks = ["Unlimited projects", "Priority rendering", "Team workspaces"];
for (let i = 0; i < perks.length; i++) {
  const y = -92 - i * 32;
  const ck = _rb.checkBadge("Trial Check " + i, -330, y, 22, __o.accentColor);
  _rb.fade(ck.circle, 24 + i * 4, 10, 0, 100, "SlowOut");
  _rb.fade(ck.check, 24 + i * 4, 10, 0, 100, "SlowOut");
  const label = _rb.textLeft(perks[i], 15, -302, y, { color: "#CBD5E1" });
  _rb.fade(label, 24 + i * 4, 10, 0, 100, "SlowOut");
}
const note = _rb.textLeft("Upgrade before the timer ends to keep your workspace.", 12, -330, -206, { color: "#64748B" });
_rb.fade(note, 36, 12, 0, 100, "SlowOut");
`,
  },
];
