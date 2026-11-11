import type { PresetDef } from "../types.js";
import { WORLD_CITIES, WORLD_ARCS } from "../data/world_cities.js";

/**
 * cat16 — 3D card grids and lived-in product worlds.
 * Every preset is seeded/pure, runs with {} defaults, and composes _rb rigs.
 * Projection is a pure 2D bake of 3D points (proj3D / bake3D), so no external
 * camera node or plugin is required inside Cavalry.
 */
export const CAT16_CARD_GRID_WORLDS: PresetDef[] = [
  {
    id: "coverflow_3d",
    title: "3D Coverflow Shelf",
    category: "card_worlds",
    description: "Coverflow shelf of album cards rotated on Y with depth scaling and staggered pop-in.",
    params: {
      heading: { type: "string", default: "Your library, in depth", description: "Shelf headline" },
      count: { type: "int", default: 5, description: "Number of cards on the shelf" },
      duration: { type: "int", default: 72, description: "Orbit duration in frames" },
      accentColor: { type: "color", default: "#38BDF8", description: "Active card glow" },
    },
    code: `
const dur = Math.max(24, __o.duration || 72);
const count = Math.max(3, __o.count || 5);
const stage = _rb.rect("Coverflow Stage", 1060, 600, { fill: "#0B0F14", radius: 30, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.pop(stage, 0, 18, { from: 0.94, ease: "SpringOut", fade: false });
track("stage", stage);
const title = _rb.textLeft(__o.heading, 26, -470, 250, { color: "#F8FAFC" });
_rb.fade(title, 4, 14, 0, 100, "SlowOut");
for (let i = 0; i < count; i++) {
  const off = i - (count - 1) / 2;
  const card = _rb.rect("Coverflow Card " + i, 250, 330, { fill: i === Math.floor(count / 2) ? "#111827" : "#0F141B", radius: 22, x: off * 200, y: 0, stroke: true, strokeColor: i === Math.floor(count / 2) ? __o.accentColor : "#27303F", strokeWidth: 2 });
  const art = _rb.rect("Coverflow Art " + i, 210, 210, { fill: ["#10B981", "#38BDF8", "#F59E0B", "#8B5CF6", "#F472B6"][i % 5], radius: 14, x: off * 200, y: 30 });
  const label = _rb.text("SIDE " + (i + 1), 15, { color: "#94A3B8", x: off * 200, y: -126 });
  _rb.pop(card, i * 4, 20, { from: 0.6, ease: "SpringOut", fade: false });
  _rb.bake3D(card, i * 4, dur, 3, function (f, t) {
    const ang = off * 26 + Math.sin(t * Math.PI) * 10;
    const p = _rb.proj3D(off * 200, 0, Math.abs(off) * 90, { rotY: ang, perspective: 1200 });
    return { x: p.x, y: p.y, scale: p.scale, opacity: 100 - Math.abs(off) * 16 };
  });
  _rb.bake3D(art, i * 4, dur, 3, function (f, t) {
    const ang = off * 26 + Math.sin(t * Math.PI) * 10;
    const p = _rb.proj3D(off * 200, 18, Math.abs(off) * 90, { rotY: ang, perspective: 1200 });
    return { x: p.x, y: p.y, scale: p.scale, opacity: 100 - Math.abs(off) * 16 };
  });
  _rb.bake3D(label, i * 4, dur, 3, function (f, t) {
    const ang = off * 26 + Math.sin(t * Math.PI) * 10;
    const p = _rb.proj3D(off * 200, -150, Math.abs(off) * 90, { rotY: ang, perspective: 1200 });
    return { x: p.x, y: p.y, scale: p.scale, opacity: 100 - Math.abs(off) * 22 };
  });
  if (off === 0) track("heroCard", card);
}
_rb.glow(stage, __o.accentColor, 24, 0.6);
`,
  },
  {
    id: "ferris_wheel_cards",
    title: "Ferris Wheel Cards",
    category: "card_worlds",
    description: "Six cards ride a giant wheel, scaling and tilting as they orbit the hub.",
    params: {
      heading: { type: "string", default: "Every release, in rotation", description: "Wheel headline" },
      duration: { type: "int", default: 90, description: "Full rotation frames" },
      accentColor: { type: "color", default: "#F59E0B", description: "Hub accent colour" },
    },
    code: `
const dur = Math.max(30, __o.duration || 90);
const stage = _rb.circle("Ferris Hub", 54, { fill: "#0F172A", x: 0, y: 0, stroke: true, strokeColor: __o.accentColor, strokeWidth: 3 });
_rb.pop(stage, 0, 18, { from: 0.5, ease: "SpringOut", fade: false });
track("hub", stage);
const title = _rb.textLeft(__o.heading, 24, -470, 250, { color: "#F8FAFC" });
_rb.fade(title, 4, 14, 0, 100, "SlowOut");
for (let i = 0; i < 6; i++) {
  const card = _rb.rect("Wheel Card " + i, 150, 190, { fill: "#111827", radius: 18, x: Math.cos(i / 6 * Math.PI * 2) * 250, y: Math.sin(i / 6 * Math.PI * 2) * 250, stroke: true, strokeColor: "#27303F", strokeWidth: 2 });
  const tag = _rb.badge("Wheel Tag " + i, "R" + (i + 1), 0, 0, { fill: "#0F141B", color: "#E2E8F0", fontSize: 12, height: 26, stroke: true, strokeColor: "#334155" });
  _rb.pop(card, i * 3, 18, { from: 0.55, ease: "SpringOut", fade: false });
  _rb.bake3D(card, i * 3, dur, 3, function (f, t) {
    const a = i / 6 * Math.PI * 2 + t * Math.PI * 2;
    const p = _rb.proj3D(Math.cos(a) * 250, Math.sin(a) * 250, Math.sin(a) * 90, { rotY: 18, perspective: 1300 });
    return { x: p.x, y: p.y, scale: p.scale * (0.82 + 0.18 * (Math.sin(a) + 1) / 2), rotation: Math.sin(a) * 4, opacity: 60 + 40 * (Math.sin(a) + 1) / 2 };
  });
  _rb.bake3D(tag.pill, i * 3, dur, 3, function (f, t) {
    const a = i / 6 * Math.PI * 2 + t * Math.PI * 2;
    const p = _rb.proj3D(Math.cos(a) * 250, Math.sin(a) * 250 - 64, Math.sin(a) * 90, { rotY: 18, perspective: 1300 });
    return { x: p.x, y: p.y, scale: p.scale * 0.82, opacity: 55 + 45 * (Math.sin(a) + 1) / 2 };
  });
  _rb.bake3D(tag.text, i * 3, dur, 3, function (f, t) {
    const a = i / 6 * Math.PI * 2 + t * Math.PI * 2;
    const p = _rb.proj3D(Math.cos(a) * 250, Math.sin(a) * 250 - 64, Math.sin(a) * 90, { rotY: 18, perspective: 1300 });
    return { x: p.x, y: p.y, scale: p.scale * 0.82, opacity: 55 + 45 * (Math.sin(a) + 1) / 2 };
  });
  if (i === 0) track("card", card);
}
`,
  },
  {
    id: "cube_roll_3d",
    title: "Cube Roll 3D",
    category: "card_worlds",
    description: "A four-faced cube rolls forward, each face landing flat with a spring settle.",
    params: {
      label: { type: "string", default: "ROLL", description: "Face label prefix" },
      duration: { type: "int", default: 84, description: "Roll duration frames" },
      accentColor: { type: "color", default: "#8B5CF6", description: "Leading face colour" },
    },
    code: `
const dur = Math.max(30, __o.duration || 84);
const stage = _rb.rect("Cube Stage", 1000, 560, { fill: "#0B0F14", radius: 28, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.pop(stage, 0, 18, { from: 0.96, ease: "SpringOut", fade: false });
track("stage", stage);
const face = 190;
for (let i = 0; i < 4; i++) {
  const card = _rb.rect("Cube Face " + i, face, face, { fill: i === 0 ? __o.accentColor : "#111827", radius: 14, x: 0, y: 0, stroke: true, strokeColor: "#27303F", strokeWidth: 2 });
  const label = _rb.text(__o.label + " " + (i + 1), 28, { color: i === 0 ? "#0B0C10" : "#E2E8F0", x: 0, y: 0 });
  _rb.pop(card, i * 5, 18, { from: 0.7, ease: "SpringOut", fade: false });
  _rb.bake3D(card, i * 5, dur, 3, function (f, t) {
    const ang = t * Math.PI * 2;
    const p = _rb.proj3D(0, 0, face / 2, { rotX: ang * 180 / Math.PI, perspective: 1100 });
    const shadow = _rb.proj3D(0, 0, -face / 2, { rotX: ang * 180 / Math.PI, perspective: 1100 });
    const depth = Math.sin(ang + i * Math.PI / 2);
    return { x: p.x, y: p.y, scale: p.scale * 0.8, rotation: t * 90, opacity: depth > -0.2 ? 100 : 12 };
  });
  _rb.bake3D(label, i * 5, dur, 3, function (f, t) {
    const ang = t * Math.PI * 2;
    const p = _rb.proj3D(0, 0, face / 2, { rotX: ang * 180 / Math.PI, perspective: 1100 });
    return { x: p.x, y: p.y, scale: p.scale * 0.8, opacity: Math.sin(ang + i * Math.PI / 2) > -0.2 ? 100 : 0 };
  });
  if (i === 0) track("frontFace", card);
}
`,
  },
  {
    id: "cylinder_cards_3d",
    title: "Cylinder Card Carousel",
    category: "card_worlds",
    description: "Eight cards wrap a spinning cylinder with depth-based scale and opacity.",
    params: {
      heading: { type: "string", default: "A carousel that keeps spinning", description: "Cylinder headline" },
      count: { type: "int", default: 8, description: "Cards around the cylinder" },
      duration: { type: "int", default: 90, description: "Spin duration frames" },
      accentColor: { type: "color", default: "#10B981", description: "Card accent" },
    },
    code: `
const dur = Math.max(30, __o.duration || 90);
const count = Math.max(5, __o.count || 8);
const title = _rb.textLeft(__o.heading, 24, -470, 244, { color: "#F8FAFC" });
_rb.fade(title, 2, 14, 0, 100, "SlowOut");
for (let i = 0; i < count; i++) {
  const card = _rb.rect("Cylinder Card " + i, 170, 230, { fill: i % 2 === 0 ? "#111827" : "#0F141B", radius: 16, x: 0, y: 0, stroke: true, strokeColor: i === 0 ? __o.accentColor : "#27303F", strokeWidth: 2 });
  _rb.pop(card, i * 3, 18, { from: 0.6, ease: "SpringOut", fade: false });
  _rb.bake3D(card, i * 3, dur, 3, function (f, t) {
    const a = i / count * Math.PI * 2 + t * Math.PI * 2;
    const p = _rb.proj3D(Math.sin(a) * 300, 0, Math.cos(a) * 300, { perspective: 1400 });
    const front = (Math.cos(a) + 1) / 2;
    return { x: p.x, y: p.y, scale: p.scale * 0.9, opacity: 25 + 75 * front };
  });
  if (i === 0) track("card", card);
}
`,
  },
  {
    id: "helix_cards_3d",
    title: "Helix Card Stack",
    category: "card_worlds",
    description: "Cards spiral up a helix, each at its own phase on a slowly turning axis.",
    params: {
      heading: { type: "string", default: "Compounding, layer by layer", description: "Helix headline" },
      count: { type: "int", default: 14, description: "Cards in the helix" },
      duration: { type: "int", default: 96, description: "Helix rotation frames" },
      accentColor: { type: "color", default: "#38BDF8", description: "Hero card accent" },
    },
    code: `
const dur = Math.max(30, __o.duration || 96);
const count = Math.max(8, __o.count || 14);
const title = _rb.textLeft(__o.heading, 24, -470, 250, { color: "#F8FAFC" });
_rb.fade(title, 2, 14, 0, 100, "SlowOut");
for (let i = 0; i < count; i++) {
  const card = _rb.rect("Helix Card " + i, 132, 82, { fill: i % 3 === 0 ? "#151A23" : "#0F141B", radius: 12, x: 0, y: 0, stroke: true, strokeColor: i === 0 ? __o.accentColor : "#27303F", strokeWidth: 1.5 });
  _rb.pop(card, i * 2, 16, { from: 0.55, ease: "SpringOut", fade: false });
  _rb.bake3D(card, i * 2, dur, 3, function (f, t) {
    const a = i * 0.72 + t * Math.PI * 2;
    const p = _rb.proj3D(Math.sin(a) * 210, (i - (count - 1) / 2) * 42, Math.cos(a) * 210, { rotY: 12, perspective: 1500 });
    return { x: p.x + 40, y: p.y, scale: p.scale * 0.92, rotation: Math.sin(a) * 3, opacity: 30 + 70 * (Math.cos(a) + 1) / 2 };
  });
  if (i === 0) track("card", card);
}
`,
  },
  {
    id: "sphere_cards_3d",
    title: "Fibonacci Sphere Cards",
    category: "card_worlds",
    description: "Forty cards distributed on a Fibonacci sphere rotating with depth fade.",
    params: {
      heading: { type: "string", default: "The whole surface, covered", description: "Sphere headline" },
      count: { type: "int", default: 40, description: "Cards on the lattice" },
      duration: { type: "int", default: 96, description: "Sphere rotation frames" },
      accentColor: { type: "color", default: "#A78BFA", description: "Lattice accent" },
    },
    code: `
const dur = Math.max(30, __o.duration || 96);
const count = Math.max(12, __o.count || 40);
const title = _rb.textLeft(__o.heading, 24, -470, 250, { color: "#F8FAFC" });
_rb.fade(title, 2, 14, 0, 100, "SlowOut");
const pts = _rb.fibonacciSphere(count, 250);
for (let i = 0; i < pts.length; i++) {
  const p0 = pts[i];
  const dot = _rb.rect("Sphere Card " + i, 52, 72, { fill: i % 4 === 0 ? "#151A23" : "#0F141B", radius: 8, x: 0, y: 0, stroke: true, strokeColor: i % 4 === 0 ? __o.accentColor : "#27303F", strokeWidth: 1 });
  _rb.bake3D(dot, 0, dur, 4, function (f, t) {
    const p = _rb.proj3D(p0.x, p0.y, p0.z, { rotY: t * 360, rotX: 14, perspective: 1600 });
    return { x: p.x, y: p.y, scale: p.scale * 0.9, opacity: 18 + 82 * Math.max(0, (p.depth + 250) / 500) };
  });
  if (i === 0) track("lattice", dot);
}
const halo = _rb.circle("Sphere Halo", 270, { fill: "#0B0C10", alpha: 0, x: 0, y: 0 });
_rb.stroke(halo, __o.accentColor, 2, { capStyle: 1, trim: [0, 100] });
_rb.fade(halo, 0, 20, 0, 45, "SlowOut");
_rb.glow(halo, __o.accentColor, 30, 0.8);
`,
  },
  {
    id: "z_depth_tunnel",
    title: "Z-Depth Tunnel",
    category: "card_worlds",
    description: "Cards stream out of a z-depth tunnel, dimming into rack-focus as they recede.",
    params: {
      heading: { type: "string", default: "Into the stack", description: "Tunnel headline" },
      count: { type: "int", default: 9, description: "Cards in the tunnel" },
      duration: { type: "int", default: 84, description: "Tunnel travel frames" },
      accentColor: { type: "color", default: "#10B981", description: "Nearest card colour" },
    },
    code: `
const dur = Math.max(30, __o.duration || 84);
const count = Math.max(5, __o.count || 9);
const stage = _rb.rect("Tunnel Stage", 1040, 580, { fill: "#080B10", radius: 30, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.pop(stage, 0, 16, { from: 0.97, ease: "SpringOut", fade: false });
track("stage", stage);
for (let i = 0; i < count; i++) {
  const card = _rb.rect("Tunnel Card " + i, 300, 190, { fill: i === 0 ? __o.accentColor : "#111827", radius: 16, x: 0, y: 0, stroke: true, strokeColor: "#27303F", strokeWidth: 2 });
  _rb.bake3D(card, 0, dur, 3, function (f, t) {
    const z = -1200 + ((i * 140 + t * 1500) % 1200);
    const p = _rb.proj3D(0, 0, z, { perspective: 900 });
    const near = Math.max(0, (z + 1200) / 1200);
    return { x: p.x, y: p.y, scale: p.scale, opacity: 12 + 88 * near, rotation: (i % 2 ? 1 : -1) * (1 - near) * 3 };
  });
  if (i === 0) track("nearestCard", card);
}
const title = _rb.textLeft(__o.heading, 26, -470, 250, { color: "#F8FAFC" });
_rb.fade(title, 6, 14, 0, 100, "SlowOut");
`,
  },
  {
    id: "bento_grid_reveal",
    title: "Bento Grid Reveal",
    category: "card_worlds",
    description: "Nine bento tiles cascade in three waves with spring pops and accent borders.",
    params: {
      heading: { type: "string", default: "A workspace with room to think", description: "Bento headline" },
      staggerOffset: { type: "int", default: 3, description: "Frames between tiles" },
      accentColor: { type: "color", default: "#10B981", description: "Feature tile accent" },
    },
    code: `
const board = _rb.rect("Bento Board", 1000, 600, { fill: "#0B0F14", radius: 30, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.pop(board, 0, 18, { from: 0.96, ease: "SpringOut", fade: false });
track("board", board);
const title = _rb.textLeft(__o.heading, 25, -460, 258, { color: "#F8FAFC" });
_rb.pop(title, 2, 16, { from: 0.86, ease: "SpringOut" });
const spans = [[2, 1], [1, 1], [1, 1], [1, 1], [2, 1], [1, 2], [1, 1], [2, 1], [1, 1]];
let col = 0, row = 0, made = 0;
for (let i = 0; i < spans.length; i++) {
  const cw = 220, ch = 190, gap = 14;
  const wide = spans[i][0] === 2, tall = spans[i][1] === 2;
  const w = wide ? cw * 2 + gap : cw, h = tall ? ch * 2 + gap : ch;
  const x = -330 + col * (cw + gap) + (w - cw) / 2;
  const y = 120 - row * (ch + gap) - (h - ch) / 2;
  const tile = _rb.rect("Bento Tile " + i, w, h, { fill: i === 0 ? "#111827" : "#0F141B", radius: 18, x: x, y: y, stroke: true, strokeColor: i === 0 ? __o.accentColor : "#27303F", strokeWidth: 1.5 });
  _rb.pop(tile, 4 + i * (__o.staggerOffset || 3), 20, { from: 0.72, ease: "SpringOut", fade: false });
  if (i === 0) track("featureTile", tile);
  made++;
  col += wide ? 2 : 1;
  if (col >= 3) { col = 0; row += tall ? 2 : 1; }
  if (row >= 3) row = 0;
}
const note = _rb.textLeft("Ships with keyboard-first navigation", 14, -330, -244, { color: "#64748B" });
_rb.fade(note, 28, 14, 0, 100, "SlowOut");
`,
  },
  {
    id: "explode_to_grid",
    title: "Explode to Grid",
    category: "card_worlds",
    description: "Scattered cards explode outward then settle into a tidy four-column grid.",
    params: {
      heading: { type: "string", default: "From chaos to a plan", description: "Explode headline" },
      count: { type: "int", default: 12, description: "Cards in the grid" },
      seed: { type: "int", default: 7, description: "Deterministic scatter seed" },
      accentColor: { type: "color", default: "#F59E0B", description: "Grid accent" },
    },
    code: `
const dur = 72;
const count = Math.max(4, __o.count || 12);
const cols = 4, rows = Math.ceil(count / cols);
const title = _rb.textLeft(__o.heading, 26, -470, 248, { color: "#F8FAFC" });
_rb.fade(title, 2, 14, 0, 100, "SlowOut");
for (let i = 0; i < count; i++) {
  const c = i % cols, r = Math.floor(i / cols);
  const gx = (c - (cols - 1) / 2) * 230;
  const gy = ((rows - 1) / 2 - r) * 176 - 10;
  const rnd = _rb.hash(__o.seed || 7, i, 3);
  const rnd2 = _rb.hash(__o.seed || 7, i, 9);
  const card = _rb.rect("Grid Card " + i, 190, 128, { fill: i % 5 === 0 ? "#151A23" : "#0F141B", radius: 14, x: gx, y: gy, stroke: true, strokeColor: i % 5 === 0 ? __o.accentColor : "#27303F", strokeWidth: 1.5 });
  _rb.bake3D(card, 0, dur, 3, function (f, t) {
    const scatterX = (rnd - 0.5) * 1400, scatterY = (rnd2 - 0.5) * 900;
    const ease = t < 0.45 ? 0 : (t - 0.45) / 0.55;
    const e = ease * ease * (3 - 2 * ease);
    return { x: scatterX + (gx - scatterX) * e, y: scatterY + (gy - scatterY) * e, scale: 1, rotation: (1 - e) * (rnd - 0.5) * 90, opacity: 40 + 60 * e };
  });
  if (i === 0) track("card", card);
}
`,
  },
  {
    id: "layout_morph_grid_to_carousel",
    title: "Grid to Carousel Morph",
    category: "card_worlds",
    description: "FLIP layout morph: every card keeps its identity as a grid folds into a carousel.",
    params: {
      heading: { type: "string", default: "One layout, two rhythms", description: "Morph headline" },
      count: { type: "int", default: 8, description: "Cards being re-laid out" },
      duration: { type: "int", default: 78, description: "Morph duration frames" },
      accentColor: { type: "color", default: "#8B5CF6", description: "Carousel accent" },
    },
    code: `
const dur = Math.max(36, __o.duration || 78);
const count = Math.max(4, __o.count || 8);
const title = _rb.textLeft(__o.heading, 25, -470, 250, { color: "#F8FAFC" });
_rb.fade(title, 2, 14, 0, 100, "SlowOut");
const cols = 4, rows = Math.ceil(count / cols);
for (let i = 0; i < count; i++) {
  const c = i % cols, r = Math.floor(i / cols);
  const gx = (c - (cols - 1) / 2) * 230, gy = ((rows - 1) / 2 - r) * 170;
  const a = (i / count) * Math.PI - Math.PI / 2;
  const cx = Math.sin(a) * 330, cy = Math.cos(a) * 90 - 20, rot = a * 22;
  const card = _rb.rect("Morph Card " + i, 190, 126, { fill: "#111827", radius: 14, x: gx, y: gy, stroke: true, strokeColor: i === 0 ? __o.accentColor : "#27303F", strokeWidth: 1.5 });
  const label = _rb.text("CARD " + (i + 1), 14, { color: "#94A3B8", x: gx, y: gy });
  _rb.bake3D(card, 0, dur, 3, function (f, t) {
    const e = t * t * (3 - 2 * t);
    const p = _rb.proj3D(gx + (cx - gx) * e, gy + (cy - gy) * e, 0, { perspective: 0 });
    return { x: p.x, y: p.y, scale: 1 + 0.06 * Math.sin(t * Math.PI), rotation: rot * e, opacity: 100 };
  });
  _rb.bake3D(label, 0, dur, 3, function (f, t) {
    const e = t * t * (3 - 2 * t);
    return { x: gx + (cx - gx) * e, y: gy + (cy - gy) * e, rotation: rot * e };
  });
  if (i === 0) track("card", card);
}
const tag = _rb.badge("Morph Tag", "FLIP LAYOUT", 0, -230, { fill: "#0F141B", color: "#E2E8F0", fontSize: 12, height: 28, stroke: true, strokeColor: __o.accentColor });
_rb.pop(tag.pill, 8, 16, { from: 0.4, ease: "SpringOut" });
`,
  },
  {
    id: "masonry_zoom_detail",
    title: "Masonry Zoom Detail",
    category: "card_worlds",
    description: "A masonry wall of cards pushes in as one hero tile expands into a detail view.",
    params: {
      heading: { type: "string", default: "Every detail holds up close", description: "Masonry headline" },
      duration: { type: "int", default: 84, description: "Zoom duration frames" },
      accentColor: { type: "color", default: "#F472B6", description: "Detail tile accent" },
    },
    code: `
const dur = Math.max(36, __o.duration || 84);
const heights = [150, 210, 170, 240, 160, 200, 180, 230, 150];
let colY = [-170, -170, -170];
const title = _rb.textLeft(__o.heading, 25, -470, 250, { color: "#F8FAFC" });
_rb.fade(title, 2, 14, 0, 100, "SlowOut");
for (let i = 0; i < heights.length; i++) {
  const col = i % 3;
  const w = 190, h = heights[i] - 16;
  const x = (col - 1) * 220, y = colY[col] + h / 2;
  colY[col] += h + 16;
  const tile = _rb.rect("Masonry Tile " + i, w, h, { fill: i === 4 ? "#151A23" : "#0F141B", radius: 14, x: x, y: y, stroke: true, strokeColor: i === 4 ? __o.accentColor : "#27303F", strokeWidth: 1.5 });
  _rb.pop(tile, i * 2, 16, { from: 0.75, ease: "SpringOut", fade: false });
  _rb.bake3D(tile, 14 + i * 2, dur - 14, 3, function (f, t) {
    if (i !== 4) {
      const push = t * t;
      return { x: x * (1 + push * 0.12), y: y * (1 + push * 0.12), scale: 1 + push * 0.12, opacity: 100 - push * 62 };
    }
    const e = t * t * (3 - 2 * t);
    return { x: x * (1 - e) + 0, y: y * (1 - e) - 20, scale: 1 + e * 1.05, rotation: 0, opacity: 100 };
  });
  if (i === 4) track("detailTile", tile);
}
const detail = _rb.text("Signal, at full resolution", 22, { color: "#F8FAFC", x: 0, y: -220, name: "Detail Caption" });
_rb.fade(detail, 50, 16, 0, 100, "SlowOut");
`,
  },
  {
    id: "grid_recap_zoom_out",
    title: "Grid Recap Zoom Out",
    category: "card_worlds",
    description: "A twelve-tile recap grid settles from an oversized crop into a calm full view.",
    params: {
      heading: { type: "string", default: "The year, tiled out", description: "Recap headline" },
      duration: { type: "int", default: 78, description: "Zoom-out frames" },
      accentColor: { type: "color", default: "#38BDF8", description: "Highlight tile colour" },
    },
    code: `
const dur = Math.max(30, __o.duration || 78);
const title = _rb.textLeft(__o.heading, 26, -470, 252, { color: "#F8FAFC" });
_rb.pop(title, 0, 18, { from: 0.8, ease: "SpringOut" });
for (let i = 0; i < 12; i++) {
  const c = i % 4, r = Math.floor(i / 4);
  const x = (c - 1.5) * 210, y = (1 - r) * 158 - 10;
  const tile = _rb.rect("Recap Tile " + i, 184, 134, { fill: i % 6 === 0 ? "#151A23" : "#0F141B", radius: 12, x: x, y: y, stroke: true, strokeColor: i % 6 === 0 ? __o.accentColor : "#27303F", strokeWidth: 1.5 });
  const index = _rb.text("0" + (i + 1), 13, { color: "#64748B", x: x - 66, y: y - 46 });
  _rb.bake3D(tile, i * 2, dur, 3, function (f, t) {
    const e = 1 - Math.pow(1 - t, 3);
    return { x: x * (2.1 - 1.1 * e), y: y * (2.1 - 1.1 * e), scale: 1.7 - 0.7 * e, rotation: (1 - e) * (i % 2 ? 6 : -6), opacity: 30 + 70 * e };
  });
  _rb.bake3D(index, i * 2, dur, 3, function (f, t) {
    const e = 1 - Math.pow(1 - t, 3);
    return { x: (x - 66) * (2.1 - 1.1 * e), y: (y - 46) * (2.1 - 1.1 * e), opacity: 30 + 70 * e };
  });
  if (i === 0) track("tile", tile);
}
`,
  },
  {
    id: "card_stack_swipe",
    title: "Card Stack Swipe",
    category: "card_worlds",
    description: "A tinder-style stack where the top card swipes away and the next springs forward.",
    params: {
      heading: { type: "string", default: "Triage, one card at a time", description: "Stack headline" },
      count: { type: "int", default: 4, description: "Cards in the stack" },
      accentColor: { type: "color", default: "#10B981", description: "Top card accent" },
    },
    code: `
const dur = 78;
const count = Math.max(3, __o.count || 4);
const title = _rb.textLeft(__o.heading, 25, -440, 250, { color: "#F8FAFC" });
_rb.fade(title, 2, 14, 0, 100, "SlowOut");
for (let i = 0; i < count; i++) {
  const depth = count - 1 - i;
  const card = _rb.rect("Stack Card " + i, 340, 420, { fill: i === 0 ? "#111827" : "#0F141B", radius: 24, x: depth * 14, y: -depth * 12, stroke: true, strokeColor: i === 0 ? __o.accentColor : "#27303F", strokeWidth: 2 });
  const glyph = _rb.text("0" + (i + 1), 64, { color: i === 0 ? "#F8FAFC" : "#475569", x: depth * 14, y: -depth * 12 });
  _rb.pop(card, i * 5, 18, { from: 0.82, ease: "SpringOut", fade: false });
  const swipeStart = 26 + i * 8, swipeEnd = swipeStart + 20;
  _rb.kf(card, "position.x", [[0, depth * 14], [swipeStart, depth * 14], [swipeEnd, depth === 0 ? 760 : depth * 14]], "SlowInSlowOut");
  _rb.kf(card, "rotation", [[0, 0], [swipeStart, 0], [swipeEnd, depth === 0 ? 24 : 0]], "SlowInSlowOut");
  _rb.kf(card, "position.y", [[0, -depth * 12], [swipeStart, -depth * 12], [swipeStart + 6, -depth * 12 + (depth === 0 ? 0 : 14)], [swipeEnd, depth === 0 ? -40 : 0]], "SpringOut");
  _rb.kf(glyph, "position.x", [[0, depth * 14], [swipeStart, depth * 14], [swipeEnd, depth === 0 ? 760 : depth * 14]], "SlowInSlowOut");
  _rb.kf(glyph, "position.y", [[0, -depth * 12], [swipeStart, -depth * 12], [swipeEnd, depth === 0 ? -120 : -depth * 12]], "SlowInSlowOut");
  if (i === 0) track("topCard", card);
}
const hint = _rb.badge("Swipe Hint", "SWIPE TO REVIEW", 0, -270, { fill: "#0F141B", color: "#94A3B8", fontSize: 12, height: 26, stroke: true, strokeColor: "#334155" });
_rb.fade(hint.pill, 4, 12, 0, 100, "SlowOut");
`,
  },
  {
    id: "fan_spread_cards",
    title: "Fan Spread Cards",
    category: "card_worlds",
    description: "A held deck fans open around a bottom pivot with per-card rotation and lift.",
    params: {
      heading: { type: "string", default: "Pick a starting point", description: "Fan headline" },
      count: { type: "int", default: 7, description: "Cards in the fan" },
      duration: { type: "int", default: 60, description: "Fan-open frames" },
      accentColor: { type: "color", default: "#8B5CF6", description: "Fan accent" },
    },
    code: `
const dur = Math.max(24, __o.duration || 60);
const count = Math.max(5, __o.count || 7);
const title = _rb.textLeft(__o.heading, 25, -470, 250, { color: "#F8FAFC" });
_rb.fade(title, 2, 14, 0, 100, "SlowOut");
for (let i = 0; i < count; i++) {
  const idx = i - (count - 1) / 2;
  const card = _rb.rect("Fan Card " + i, 150, 230, { fill: i % 3 === 0 ? "#151A23" : "#0F141B", radius: 16, x: 0, y: -110, stroke: true, strokeColor: i === Math.floor(count / 2) ? __o.accentColor : "#27303F", strokeWidth: 1.5 });
  _rb.anchor(card, 0, 1);
  _rb.pos(card, 0, 210);
  _rb.bake3D(card, i * 2, dur, 3, function (f, t) {
    const e = t * t * (3 - 2 * t);
    return { rotation: idx * 9 * e, x: 0, y: 210, scale: 1, opacity: 100 };
  });
  _rb.kf(card, "position.y", [[i * 2, 210], [i * 2 + dur, 210 - Math.abs(idx) * 6]], "SpringOut");
  if (i === 0) track("fanCard", card);
}
`,
  },
  {
    id: "polaroid_drop_table",
    title: "Polaroid Drop Table",
    category: "card_worlds",
    description: "Polaroid photos drop onto a table, bounce once and settle into a loose collage.",
    params: {
      heading: { type: "string", default: "Scatter the good ones", description: "Table headline" },
      count: { type: "int", default: 5, description: "Photos on the table" },
      accentColor: { type: "color", default: "#F59E0B", description: "Polaroid accent" },
    },
    code: `
const count = Math.max(3, __o.count || 5);
const title = _rb.textLeft(__o.heading, 25, -470, 250, { color: "#F8FAFC" });
_rb.fade(title, 2, 14, 0, 100, "SlowOut");
const table = _rb.rect("Polaroid Table", 1000, 560, { fill: "#0B0F14", radius: 26, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
track("table", table);
for (let i = 0; i < count; i++) {
  const x = (i - (count - 1) / 2) * 190;
  const rot = (i % 2 ? 1 : -1) * (4 + i * 2);
  const photo = _rb.rect("Polaroid " + i, 170, 210, { fill: "#F8FAFC", radius: 6, x: x, y: -360, rotation: rot });
  const image = _rb.rect("Polaroid Photo " + i, 146, 146, { fill: ["#10B981", "#38BDF8", "#F472B6", "#A78BFA", "#FBBF24"][i % 5], radius: 3, x: x, y: -372, rotation: rot });
  const s = 4 + i * 5;
  _rb.kf(photo, "position.y", [[s, -420], [s + 16, 10], [s + 24, -26], [s + 34, 0]], "SpringOut");
  _rb.kf(image, "position.y", [[s, -432], [s + 16, 4], [s + 24, -32], [s + 34, -6]], "SpringOut");
  _rb.kf(photo, "rotation", [[s, rot * 3], [s + 34, rot]], "SpringOut");
  _rb.kf(image, "rotation", [[s, rot * 3], [s + 34, rot]], "SpringOut");
  if (i === 0) track("photo", photo);
}
`,
  },
  {
    id: "card_flip_3d",
    title: "Card Flip 3D",
    category: "card_worlds",
    description: "Cards flip on their Y axis through zero width, swapping front for back face.",
    params: {
      heading: { type: "string", default: "Two sides, one decision", description: "Flip headline" },
      count: { type: "int", default: 3, description: "Cards that flip" },
      duration: { type: "int", default: 72, description: "Flip sequence frames" },
      accentColor: { type: "color", default: "#38BDF8", description: "Back face accent" },
    },
    code: `
const dur = Math.max(30, __o.duration || 72);
const count = Math.max(1, __o.count || 3);
const title = _rb.textLeft(__o.heading, 25, -470, 250, { color: "#F8FAFC" });
_rb.fade(title, 2, 14, 0, 100, "SlowOut");
for (let i = 0; i < count; i++) {
  const x = (i - (count - 1) / 2) * 300;
  const front = _rb.rect("Flip Front " + i, 240, 320, { fill: "#111827", radius: 20, x: x, y: 0, stroke: true, strokeColor: "#27303F", strokeWidth: 2 });
  const back = _rb.rect("Flip Back " + i, 240, 320, { fill: "#0F141B", radius: 20, x: x, y: 0, stroke: true, strokeColor: __o.accentColor, strokeWidth: 2 });
  _rb.alpha(back, 0);
  const frontLabel = _rb.text("FRONT", 18, { color: "#94A3B8", x: x, y: 0 });
  const backLabel = _rb.text("BACK", 18, { color: __o.accentColor, x: x, y: 0 });
  _rb.alpha(backLabel, 0);
  _rb.pop(front, i * 4, 18, { from: 0.75, ease: "SpringOut", fade: false });
  const start = 16 + i * 14;
  _rb.kf(front, "scale.x", [[start, 1], [start + 10, 0.001], [dur, 0.001]], "SlowInSlowOut");
  _rb.kf(frontLabel, "scale.x", [[start, 1], [start + 10, 0.001], [dur, 0.001]], "SlowInSlowOut");
  _rb.kf(back, "scale.x", [[start, 0.001], [start + 10, 1], [dur, 1]], "SlowInSlowOut");
  _rb.kf(backLabel, "scale.x", [[start, 0.001], [start + 10, 1], [dur, 1]], "SlowInSlowOut");
  _rb.kf(back, "opacity", [[start + 9, 0], [start + 11, 100]], "Linear");
  _rb.kf(backLabel, "opacity", [[start + 9, 0], [start + 11, 100]], "Linear");
  _rb.kf(front, "opacity", [[start + 9, 100], [start + 11, 0]], "Linear");
  _rb.kf(frontLabel, "opacity", [[start + 9, 100], [start + 11, 0]], "Linear");
  if (i === 0) track("flipCard", front);
}
`,
  },
  {
    id: "page_curl_card",
    title: "Page Curl Card",
    category: "card_worlds",
    description: "A paper card peels its bottom-right corner as a folding triangle and shadow.",
    params: {
      heading: { type: "string", default: "Turn the page", description: "Curl headline" },
      duration: { type: "int", default: 66, description: "Curl duration frames" },
      accentColor: { type: "color", default: "#10B981", description: "Page accent" },
    },
    code: `
const dur = Math.max(30, __o.duration || 66);
const title = _rb.textLeft(__o.heading, 25, -440, 250, { color: "#F8FAFC" });
_rb.fade(title, 2, 14, 0, 100, "SlowOut");
const page = _rb.rect("Curl Page", 520, 360, { fill: "#F8FAFC", radius: 10, x: 0, y: 0 });
_rb.pop(page, 0, 18, { from: 0.85, ease: "SpringOut", fade: false });
track("page", page);
const curl = _rb.poly("Curl Corner", 190, 3, { fill: "#CBD5E1", x: 260, y: -180, rotation: 225 });
_rb.anchor(curl, 1, -1);
_rb.pos(curl, 260, -180);
_rb.kf(curl, "scale.x", [[8, 0.05], [8 + dur - 8, 1]], "SlowInSlowOut");
_rb.kf(curl, "scale.y", [[8, 0.05], [8 + dur - 8, 1]], "SlowInSlowOut");
_rb.kf(curl, "rotation", [[8, 180], [8 + dur - 8, 225]], "SlowInSlowOut");
_rb.glow(curl, "#94A3B8", 12, 0.5);
const line1 = _rb.textLeft("Chapter 04", 34, -190, 86, { color: "#0B0C10" });
const line2 = _rb.textLeft("The layout that ships itself", 18, -190, 40, { color: "#475569" });
_rb.fade(line1, 10, 16, 0, 100, "SlowOut");
_rb.fade(line2, 16, 16, 0, 100, "SlowOut");
`,
  },
  {
    id: "page_turn_book",
    title: "Page Turn Book",
    category: "card_worlds",
    description: "A two-page book spread whose right leaf turns 180 degrees around the spine and lands as the new left page.",
    params: {
      heading: { type: "string", default: "Turn to the next chapter", description: "Book headline" },
      duration: { type: "int", default: 72, description: "Turn duration frames" },
      accentColor: { type: "color", default: "#38BDF8", description: "Page-edge accent" },
    },
    code: `
const dur = Math.max(36, __o.duration || 72);
const title = _rb.textLeft(__o.heading, 25, -470, 250, { color: "#F8FAFC" });
_rb.fade(title, 2, 14, 0, 100, "SlowOut");
const spread = _rb.rect("Book Spread", 640, 400, { fill: "#0B0F14", radius: 12, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.pop(spread, 0, 18, { from: 0.9, ease: "SpringOut", fade: false });
track("spread", spread);
const left = _rb.rect("Left Page", 300, 380, { fill: "#F8FAFC", radius: 6, x: -160, y: 0 });
const leftLine = _rb.textLeft("Chapter 03", 26, -280, 120, { color: "#0B0C10" });
_rb.fade(left, 4, 12, 0, 100, "SlowOut");
_rb.fade(leftLine, 6, 12, 0, 100, "SlowOut");
const baseRight = _rb.rect("Right Page Back", 300, 380, { fill: "#E2E8F0", radius: 6, x: 160, y: 0 });
_rb.fade(baseRight, 4, 12, 0, 100, "SlowOut");
const baseRightLine = _rb.textLeft("Chapter 04", 26, 40, 120, { color: "#0B0C10" });
_rb.fade(baseRightLine, 6, 12, 0, 100, "SlowOut");
const spine = _rb.rect("Book Spine", 6, 380, { fill: __o.accentColor, radius: 3, x: 0, y: 0 });
_rb.fade(spine, 4, 10, 0, 70, "SlowOut");
const leafFront = _rb.rect("Turning Leaf Front", 300, 380, { fill: "#FFFFFF", radius: 6, x: 0, y: 0 });
_rb.anchor(leafFront, -1, 0);
_rb.pos(leafFront, 0, 0);
const leafBack = _rb.rect("Turning Leaf Back", 300, 380, { fill: "#F1F5F9", radius: 6, x: 0, y: 0 });
_rb.anchor(leafBack, 1, 0);
_rb.pos(leafBack, 0, 0);
const leafBackFace = _rb.textLeft("Chapter 06", 26, -280, 120, { color: "#0B0C10" });
_rb.kf(leafFront, "scale.x", [[8, 1], [8 + dur * 0.5, 0.001]], "SlowInSlowOut");
_rb.kf(leafFront, "opacity", [[8, 100], [8 + dur * 0.48, 100], [8 + dur * 0.5, 0]], "Linear");
_rb.kf(leafBack, "scale.x", [[8 + dur * 0.5, 0.001], [8 + dur, 1]], "SlowInSlowOut");
_rb.kf(leafBack, "opacity", [[8 + dur * 0.5, 0], [8 + dur * 0.52, 100]], "Linear");
_rb.fade(leafBackFace, 8 + dur * 0.55, 12, 0, 100, "SlowOut");
_rb.glow(leafFront, __o.accentColor, 16, 0.35);
_rb.glow(leafBack, "#94A3B8", 12, 0.3);
track("turningLeaf", leafFront);
`,
  },
  {
    id: "accordion_fold_card",
    title: "Accordion Fold Card",
    category: "card_worlds",
    description: "Three panels fold flat in sequence like a printed accordion, then unfold.",
    params: {
      heading: { type: "string", default: "Fold the story into three", description: "Fold headline" },
      duration: { type: "int", default: 84, description: "Fold cycle frames" },
      accentColor: { type: "color", default: "#F472B6", description: "Panel accent" },
    },
    code: `
const dur = Math.max(36, __o.duration || 84);
const title = _rb.textLeft(__o.heading, 25, -470, 250, { color: "#F8FAFC" });
_rb.fade(title, 2, 14, 0, 100, "SlowOut");
for (let i = 0; i < 3; i++) {
  const w = 240, x = (i - 1) * 252;
  const panel = _rb.rect("Accordion Panel " + i, w, 320, { fill: i === 1 ? "#151A23" : "#0F141B", radius: 14, x: x, y: 0, stroke: true, strokeColor: i === 1 ? __o.accentColor : "#27303F", strokeWidth: 2 });
  const num = _rb.text("0" + (i + 1), 40, { color: i === 1 ? "#F8FAFC" : "#64748B", x: x, y: 0 });
  _rb.pop(panel, i * 4, 18, { from: 0.8, ease: "SpringOut", fade: false });
  const a = 12 + i * 10, b = a + 18, c = b + 16;
  _rb.kf(panel, "scale.x", [[0, 1], [a, 1], [b, 0.08], [c, 1], [dur, 1]], "SlowInSlowOut");
  _rb.kf(num, "scale.x", [[0, 1], [a, 1], [b, 0.08], [c, 1], [dur, 1]], "SlowInSlowOut");
  _rb.kf(panel, "position.x", [[a, x], [b, x * 0.6], [c, x]], "SlowInSlowOut");
  _rb.kf(num, "position.x", [[a, x], [b, x * 0.6], [c, x]], "SlowInSlowOut");
  if (i === 1) track("centerPanel", panel);
}
`,
  },
  {
    id: "lived_in_ui_shells",
    title: "Lived-in UI Shells",
    category: "card_worlds",
    description: "Product chrome (browser, terminal or Mac window) assembles around live content.",
    params: {
      mode: { type: "string", default: "browser", description: "Shell: browser | terminal | mac" },
      title: { type: "string", default: "Acme Console", description: "Window title" },
      urlText: { type: "string", default: "app.acme.com/overview", description: "Address bar text" },
      accentColor: { type: "color", default: "#10B981", description: "Status accent colour" },
    },
    code: `
const mode = String(__o.mode || "browser");
const shell = _rb.rect("Shell Frame", 960, 560, { fill: "#0B0F14", radius: mode === "mac" ? 26 : 14, x: 0, y: 0, stroke: true, strokeColor: "#1F2937", strokeWidth: 2 });
_rb.pop(shell, 0, 18, { from: 0.96, ease: "SpringOut", fade: false });
track("shell", shell);
const bar = _rb.rect("Shell Bar", 960, mode === "terminal" ? 54 : 46, { fill: "#111827", radius: mode === "mac" ? 14 : 8, x: 0, y: 257 });
_rb.fade(bar, 2, 12, 0, 100, "SlowOut");
if (mode === "mac") {
  for (let i = 0; i < 3; i++) {
    _rb.circle("Mac Light " + i, 7, { fill: ["#F87171", "#FBBF24", "#34D399"][i], x: -452 + i * 22, y: 257 });
  }
  _rb.text(__o.title, 15, { color: "#E2E8F0", x: 0, y: 257 });
} else if (mode === "terminal") {
  _rb.circle("Term Live", 6, { fill: __o.accentColor, x: -446, y: 257 });
  _rb.textLeft(__o.title + " — zsh", 14, -424, 257, { color: "#94A3B8" });
} else {
  for (let i = 0; i < 3; i++) _rb.circle("Browser Dot " + i, 5, { fill: ["#F87171", "#FBBF24", "#34D399"][i], x: -446 + i * 18, y: 257 });
  const pill = _rb.rect("URL Pill", 420, 24, { fill: "#0B0F14", radius: 12, x: 20, y: 257 });
  _rb.textLeft(__o.urlText, 12, -180, 257, { color: "#94A3B8" });
  _rb.fade(pill, 6, 12, 0, 100, "SlowOut");
}
const rows = mode === "terminal" ? ["$ acme deploy --prod", "building 12 routes...", "uploading assets 98%", "deployed in 4.2s"] : ["Overview", "Usage", "Members", "Billing"];
for (let i = 0; i < rows.length; i++) {
  const y = 168 - i * 74;
  const row = _rb.rect("Shell Row " + i, 880, 62, { fill: i === 0 ? "#151A23" : "#0F141B", radius: 10, x: 0, y: y, stroke: true, strokeColor: i === 0 ? __o.accentColor : "#27303F", strokeWidth: 1 });
  const label = _rb.textLeft(rows[i], 15, -410, y, { color: mode === "terminal" ? "#34D399" : "#E2E8F0" });
  _rb.pop(row, 6 + i * 5, 16, { from: 0.7, ease: "SpringOut", fade: false });
  _rb.fade(label, 8 + i * 5, 12, 0, 100, "SlowOut");
  if (i === 0) track("firstRow", row);
}
`,
  },
  {
    id: "data_globe",
    title: "Data Globe",
    category: "card_worlds",
    description: "Dotted Fibonacci globe with great-circle city arcs and KPI HUD counters.",
    params: {
      heading: { type: "string", default: "One network, every region", description: "Globe headline" },
      count: { type: "int", default: 70, description: "Dots on the globe lattice" },
      duration: { type: "int", default: 96, description: "Rotation duration frames" },
      accentColor: { type: "color", default: "#38BDF8", description: "Arc and HUD accent" },
    },
    code: `
const dur = Math.max(36, __o.duration || 96);
const count = Math.max(30, __o.count || 70);
const cities = ${JSON.stringify(WORLD_CITIES)};
const routes = ${JSON.stringify(WORLD_ARCS)};
const title = _rb.textLeft(__o.heading, 25, -520, 290, { color: "#F8FAFC" });
_rb.fade(title, 0, 14, 0, 100, "SlowOut");
const globe = _rb.circle("Globe Halo", 250, { fill: "#0B0C10", alpha: 0, x: 0, y: 10 });
_rb.stroke(globe, "#1F2937", 2, { capStyle: 1, trim: [0, 100] });
_rb.pop(globe, 0, 18, { from: 0.3, ease: "SpringOut" });
track("globe", globe);
const pts = _rb.fibonacciSphere(count, 240);
for (let i = 0; i < pts.length; i++) {
  const dot = _rb.circle("Globe Dot " + i, i % 7 === 0 ? 3.6 : 2.2, { fill: i % 7 === 0 ? __o.accentColor : "#334155", x: 0, y: 0 });
  _rb.bake3D(dot, 0, dur, 4, function (f, t) {
    const p = _rb.proj3D(pts[i].x, pts[i].y, pts[i].z, { rotY: t * 360, rotX: 12, perspective: 1200 });
    return { x: p.x, y: p.y + 10, scale: p.scale, opacity: 12 + 88 * Math.max(0, (p.depth + 240) / 480) };
  });
  if (i === 0) track("dot", dot);
}
for (let r = 0; r < routes.length; r++) {
  const route = routes[r];
  const a = cities[route[0]], b = cities[route[1]];
  const arcPts = _rb.greatCircle([a[1], a[2]], [b[1], b[2]], 18, 250);
  for (let j = 0; j < arcPts.length; j += 2) {
    const p0 = arcPts[j];
    const bead = _rb.circle("Arc " + r + " Bead " + j, 2.6, { fill: __o.accentColor, x: 0, y: 0 });
    _rb.bake3D(bead, 0, dur, 4, function (f, t) {
      const p = _rb.proj3D(p0.x, p0.y, p0.z, { rotY: t * 360, rotX: 12, perspective: 1200 });
      const reveal = Math.min(1, Math.max(0, (t - j / 18 * 0.35) * 2.4));
      return { x: p.x, y: p.y + 10, scale: p.scale, opacity: Math.max(0, (p.depth + 240) / 480) * 90 * reveal };
    });
    if (r === 0 && j === 0) track("arc", bead);
  }
}
for (let k = 0; k < 3; k++) {
  const kx = 360 + k * 0;
  const ky = 200 - k * 84;
  const card = _rb.rect("HUD Tile " + k, 230, 68, { fill: "#0F141B", radius: 12, x: 520, y: ky, stroke: true, strokeColor: "#27303F", strokeWidth: 1.5 });
  const label = _rb.textLeft(["REGIONS", "REQUESTS", "UPTIME"][k], 11, 418, ky + 16, { color: "#64748B" });
  const valueText = _rb.textLeft(["24", "1.8M", "99.98%"][k], 22, 418, ky - 8, { color: "#F8FAFC" });
  _rb.pop(card, 6 + k * 5, 16, { from: 0.6, ease: "SpringOut", fade: false });
  _rb.fade(valueText, 10 + k * 5, 12, 0, 100, "SlowOut");
  if (k === 0) track("hud", card);
}
_rb.glow(globe, __o.accentColor, 40, 0.85);
`,
  },
];
