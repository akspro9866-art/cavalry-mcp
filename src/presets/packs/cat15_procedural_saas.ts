import type { PresetDef } from "../types.js";

export const CAT15_PROCEDURAL_SAAS: PresetDef[] = [
  {
    id: "soft_cells_bento",
    title: "Soft Cells Bento Grid",
    category: "procedural_saas",
    description: "Soft-body proximity bento grid with area-preserving squash-and-stretch and effector falloff.",
    params: {
      heading: { type: "string", default: "Adaptive Workspace", description: "Bento cluster headline" },
      stiffness: { type: "double", default: 210, description: "Spring stiffness" },
      dampingRatio: { type: "double", default: 0.48, description: "Spring damping ratio" },
      staggerOffset: { type: "int", default: 4, description: "Clone stagger offset in frames" },
      accentColor: { type: "color", default: "#10B981", description: "Primary cell accent colour" },
    },
    code: `
const board = _rb.rect("Soft Bento Board", 920, 520, { fill: "#0B0F14", radius: 28, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.pop(board, 0, 20, { from: 0.92, ease: "SpringOut", fade: false });
track("board", board);
const title = _rb.textLeft(__o.heading, 26, -410, 212, { color: "#F8FAFC" });
_rb.pop(title, 2, 18, { from: 0.85, ease: "SpringOut" });
const cellSource = _rb.rect("Soft Cell Source", 180, 120, { fill: "#111827", radius: 22, x: 0, y: -20, stroke: true, strokeColor: "#27303F", strokeWidth: 2 });
const fieldRig = _rb.buildProximityFieldDuplicator("Soft Cells", cellSource, null, {
  distribution: "grid",
  count: [4, 2],
  size: [720, 280],
  falloffSize: [380, 380],
  peakScale: 1.24,
  noiseStrength: 10
});
_rb.stagger(fieldRig.duplicator, __o.staggerOffset || 4);
_rb.kf(fieldRig.effector, "position.x", [[0, -320], [32, 0], [64, 320]], "SlowInSlowOut");
_rb.kf(fieldRig.effector, "position.y", [[0, -90], [32, 40], [64, -60]], "SlowInSlowOut");
track("duplicator", fieldRig.duplicator);
track("effector", fieldRig.effector);
const heroCell = _rb.buildNinePointRoundedCard("Soft Hero Cell", 260, 140, {
  fill: "#151A23",
  strokeColor: __o.accentColor,
  cornerRadii: [24, 12, 24, 12],
  anchor: "center",
  x: 0,
  y: -16
});
_rb.pop(heroCell.card, 6, 22, { from: 0.65, ease: "SpringOut" });
_rb.kf(heroCell.card, "scale.x", [[22, 1], [34, 1.12], [48, 1]], "SpringOut");
_rb.kf(heroCell.card, "scale.y", [[22, 1], [34, 0.89], [48, 1]], "SpringOut");
_rb.glow(heroCell.card, __o.accentColor, 26, 0.9);
track("heroCell", heroCell.card);
`,
  },
  {
    id: "marker_sync_cascade",
    title: "Marker Sync Cascade",
    category: "procedural_saas",
    description: "Beat-marker synchronized duplicator cascade and dynamics pulse for rhythmic SaaS launches.",
    params: {
      headline: { type: "string", default: "Synced to Every Beat", description: "Cascade header text" },
      staggerOffset: { type: "int", default: 3, description: "Frames between beat clones" },
      duration: { type: "int", default: 60, description: "Total cascade window in frames" },
      accentColor: { type: "color", default: "#38BDF8", description: "Beat bar highlight colour" },
    },
    code: `
const frame = _rb.rect("Marker Sync Frame", 880, 460, { fill: "#0F141B", radius: 24, x: 0, y: 0, stroke: true, strokeColor: "#222B38", strokeWidth: 2 });
_rb.pop(frame, 0, 18, { from: 0.94, ease: "SpringOut", fade: false });
track("frame", frame);
const header = _rb.textLeft(__o.headline, 26, -396, 182, { color: "#F8FAFC" });
_rb.pop(header, 2, 16, { from: 0.84, ease: "SpringOut" });
const beatChip = _rb.badge("Beat Sync Tag", "120 BPM LOCKED", 320, 182, { fill: "#052E22", color: "#34D399", fontSize: 12, height: 28, stroke: true, strokeColor: "#065F46" });
_rb.pop(beatChip.pill, 4, 14, { from: 0.5, ease: "SpringOut" });
const tile = _rb.rect("Marker Cascade Tile", 96, 180, { fill: "#1E293B", radius: 14, x: 0, y: -18, stroke: true, strokeColor: __o.accentColor, strokeWidth: 2 });
_rb.pop(tile, 0, 16, { from: 0.2, ease: "SpringOut" });
const dup = _rb.dup(tile, { name: "Marker Cascade Dup", distribution: "linear", count: 7, size: 720 });
_rb.stagger(dup, __o.staggerOffset || 3);
track("cascade", dup);
const markers = [0, 12, 24, 36, 48];
for (let i = 0; i < markers.length; i++) {
  const f = markers[i];
  const mx = -320 + i * 160;
  const dot = _rb.dot("Beat Marker " + i, mx, -162, 14, __o.accentColor, { glow: 16, glowIntensity: 1.5 });
  _rb.pop(dot, f, 12, { from: 0.001, ease: "SpringOut" });
  if (i === 0) track("marker", dot);
}
`,
  },
  {
    id: "spring_text_reveal",
    title: "Spring Text Reveal",
    category: "procedural_saas",
    description: "Sub-mesh staggered spring typography reveal with baseline clipping mask and accent sweep.",
    params: {
      headline: { type: "string", default: "Velocity at Scale", description: "Primary hero headline" },
      subheadline: { type: "string", default: "Procedural typography driven by sub-mesh springs", description: "Supporting caption" },
      stiffness: { type: "double", default: 240, description: "Spring stiffness" },
      dampingRatio: { type: "double", default: 0.45, description: "Spring damping ratio" },
      staggerOffset: { type: "int", default: 3, description: "Sub-mesh stagger offset in frames" },
      accentColor: { type: "color", default: "#10B981", description: "Underline and badge accent" },
    },
    code: `
const maskPlate = _rb.rect("Baseline Mask", 1040, 180, { fill: "#0B0C10", alpha: 0, x: 0, y: 48 });
const hero = _rb.text(__o.headline, 76, { color: "#F8FAFC", x: 0, y: 48, name: "Spring Hero Text" });
_rb.pop(hero, 0, 22, { from: 0.78, ease: "SpringOut" });
_rb.kfAt(hero, "y", [[0, -28], [22, 48]], "SpringOut");
const subMesh = _rb.layer("subMesh", "Hero Word SubMesh", { levelMode: 1 });
const stagger = _rb.stagger(subMesh, __o.staggerOffset || 3);
api.connect(subMesh, "id", hero, "deformers");
track("headline", hero);
track("subMesh", subMesh);
track("mask", maskPlate);
const bar = _rb.rect("Spring Accent Sweep", 340, 6, { fill: __o.accentColor, radius: 3, x: 0, y: -18 });
_rb.kf(bar, "scale.x", [[8, 0.001], [28, 1]], "SpringOut");
_rb.glow(bar, __o.accentColor, 18, 1.3);
const sub = _rb.text(__o.subheadline, 20, { color: "#94A3B8", x: 0, y: -64, name: "Spring SubText" });
_rb.fade(sub, 12, 16, 0, 100, "SlowOut");
track("subheadline", sub);
`,
  },
  {
    id: "shape_morph_loop",
    title: "Shape Morph Loop",
    category: "procedural_saas",
    description: "Procedural hero icon morph loop with radial burst rings and weighted parent controller.",
    params: {
      label: { type: "string", default: "Neural Core", description: "Hero badge caption" },
      duration: { type: "int", default: 60, description: "Morph cycle duration in frames" },
      accentColor: { type: "color", default: "#8B5CF6", description: "Primary morph glow colour" },
    },
    code: `
const backdrop = _rb.circle("Morph Halo", 150, { fill: "#111827", x: 0, y: 20, stroke: true, strokeColor: "#27303F", strokeWidth: 2 });
_rb.pop(backdrop, 0, 18, { from: 0.82, ease: "SpringOut" });
track("backdrop", backdrop);
const morphShape = _rb.rect("Morph Core Shape", 140, 140, { fill: __o.accentColor, radius: 18, x: 0, y: 20 });
_rb.pop(morphShape, 2, 20, { from: 0.4, ease: "SpringOut" });
const dur = Math.max(24, Number(__o.duration) || 60);
_rb.kf(morphShape, "generator.cornerRadius", [[0, 18], [Math.round(dur * 0.5), 70], [dur, 18]], "SpringOut");
_rb.kf(morphShape, "rotation", [[0, 0], [Math.round(dur * 0.5), 90], [dur, 180]], "SpringOut");
_rb.glow(morphShape, __o.accentColor, 32, 1.4);
track("morph", morphShape);
const burstSpoke = _rb.rect("Burst Spoke", 22, 6, { fill: "#38BDF8", radius: 3, x: 0, y: 20 });
const burstDup = _rb.dup(burstSpoke, { name: "Radial Burst Dup", distribution: "linear", count: 8, size: 260 });
_rb.pop(burstDup, 8, 18, { from: 0.5, ease: "SpringOut" });
track("burst", burstDup);
const caption = _rb.badge("Morph Core Label", __o.label, 0, -172, { fill: "#0F172A", color: "#F8FAFC", fontSize: 15, height: 36, stroke: true, strokeColor: __o.accentColor });
_rb.pop(caption.pill, 12, 16, { from: 0.6, ease: "SpringOut" });
track("label", caption.pill);
`,
  },
  {
    id: "csv_localiser_batch",
    title: "CSV Localiser Batch Rig",
    category: "procedural_saas",
    description: "CSV-driven localization and AB-testing rig with auto-sizing pills and controller null bindings.",
    params: {
      localeEn: { type: "string", default: "Start free trial", description: "English CTA copy" },
      localeDe: { type: "string", default: "Kostenlos testen", description: "German CTA copy" },
      localeJa: { type: "string", default: "無料トライアルを開始", description: "Japanese CTA copy" },
      staggerOffset: { type: "int", default: 5, description: "Row stagger in frames" },
      accentColor: { type: "color", default: "#10B981", description: "Active locale border colour" },
    },
    code: `
const panel = _rb.rect("Localiser Batch Panel", 860, 460, { fill: "#0B0F14", radius: 26, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.pop(panel, 0, 18, { from: 0.94, ease: "SpringOut", fade: false });
track("panel", panel);
const header = _rb.textLeft("CSV Localiser  //  Multi-Locale Auto-Sizing Pills", 20, -390, 180, { color: "#F8FAFC" });
_rb.fade(header, 2, 12, 0, 100, "SlowOut");
const rows = [
  { code: "EN-US", text: __o.localeEn },
  { code: "DE-DE", text: __o.localeDe },
  { code: "JA-JP", text: __o.localeJa }
];
const bindings = [];
for (let i = 0; i < rows.length; i++) {
  const ry = 76 - i * 104;
  const tag = _rb.badge("Locale Code " + i, rows[i].code, -310, ry, { fill: "#111827", color: "#94A3B8", fontSize: 13, height: 32, stroke: true, strokeColor: "#27303F" });
  const start = 4 + i * (__o.staggerOffset || 5);
  _rb.pop(tag.pill, start, 14, { from: 0.6, ease: "SpringOut" });
  const autoPill = _rb.buildAutoSizingPill("Locale Pill " + i, rows[i].text, {
    x: 40,
    y: ry,
    fontSize: 22,
    padX: 28,
    padY: 16,
    fill: "#111827",
    strokeColor: i === 0 ? __o.accentColor : "#334155",
    glow: i === 0 ? 20 : 0
  });
  _rb.pop(autoPill.bg, start + 2, 18, { from: 0.72, ease: "SpringOut" });
  _rb.pop(autoPill.text, start + 2, 18, { from: 0.72, ease: "SpringOut" });
  bindings.push({ name: "locale_" + i, type: "string", defaultValue: rows[i].text, targetId: autoPill.text, targetAttr: "text" });
  if (i === 0) track("primaryPill", autoPill.bg);
}
const ctrl = _rb.buildControllerNull("Localiser CSV Controller", bindings, { x: 0, y: 220 });
track("controller", ctrl.controller);
`,
  },
];
