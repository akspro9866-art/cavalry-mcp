import type { PresetDef } from "../types.js";

const mkShape = `
function mkMorphShape(name, kind, size, color, hidden) {
  if (kind === "star") {
    const s = _rb.star(name, size, { fill: color, points: 5, innerRadius: size * 0.2 });
    if (hidden) _rb.hide(s);
    return s;
  }
  if (kind === "circle" || kind === "ellipse") {
    const e = _rb.circle(name, size / 2, { fill: color });
    if (hidden) _rb.hide(e);
    return e;
  }
  if (kind === "triangle") {
    const t = _rb.poly(name, size, 3, { fill: color, rotation: 90 });
    if (hidden) _rb.hide(t);
    return t;
  }
  const r = _rb.rect(name, size, size, { fill: color, radius: size * 0.16 });
  if (hidden) _rb.hide(r);
  return r;
}
`;

export const CAT04_POLISH_CAMERA: PresetDef[] = [
  {
    id: "dot_matrix_bg",
    title: "Dot Matrix Background",
    category: "polish_camera",
    description: "Grid of dots roughened by two noise behaviours on scale, over a dark full-frame backdrop.",
    params: {
      cols: { type: "int", default: 22, description: "Dot columns" },
      rows: { type: "int", default: 12, description: "Dot rows" },
      dotSize: { type: "double", default: 7, description: "Dot diameter" },
      color: { type: "color", default: "#394052", description: "Dot fill" },
      amp: { type: "double", default: 0.45, description: "Noise scale strength" },
      seed: { type: "int", default: 1, description: "Noise seed" },
    },
    code: `
const bg = _rb.rect("Matrix Backdrop", 1920, 1080, { fill: "#0B0C10" });
track("bg", bg);
const dot = _rb.circle("Matrix Dot", __o.dotSize / 2, { fill: __o.color, opacity: 85 });
track("dot", dot);
const grid = _rb.dup(dot, { name: "Dot Matrix", columns: __o.cols, rows: __o.rows, width: 1720, height: 940 });
track("grid", grid);
const nx = _rb.layer("noise", "Dot Scale X", { strength: __o.amp, "generator.frequency": 0.08, "generator.timeScale": 0.35, "generator.seed": __o.seed });
const ny = _rb.layer("noise", "Dot Scale Y", { strength: __o.amp, "generator.frequency": 0.08, "generator.timeScale": 0.35, "generator.seed": __o.seed + 1 });
api.connect(nx, "id", dot, "scale.x");
api.connect(ny, "id", dot, "scale.y");
track("noise", nx);
`,
  },
  {
    id: "stroke_trim_reveal",
    title: "Stroke Trim Reveal",
    category: "polish_camera",
    description: "Stroke-only shape with round caps, self-drawing through an Expo-style trim ramp.",
    params: {
      shape: { type: "string", default: "rounded_rect", description: "rounded_rect, ellipse, star or triangle" },
      width: { type: "double", default: 8, description: "Stroke width" },
      color: { type: "color", default: "#10B981", description: "Stroke colour" },
      size: { type: "double", default: 340, description: "Shape size" },
      duration: { type: "int", default: 40, description: "Draw duration" },
      x: { type: "double", default: 0, description: "Centre x" },
      y: { type: "double", default: 0, description: "Centre y" },
    },
    code: `
const kind = String(__o.shape).toLowerCase();
let shape;
if (kind.indexOf("ellipse") >= 0 || kind.indexOf("circle") >= 0) shape = _rb.circle("Trim Shape", __o.size / 2, { fill: "#0B0C10", alpha: 0, x: __o.x, y: __o.y });
else if (kind.indexOf("star") >= 0) shape = _rb.star("Trim Shape", __o.size, { fill: "#0B0C10", points: 5, x: __o.x, y: __o.y });
else if (kind.indexOf("triangle") >= 0) shape = _rb.poly("Trim Shape", __o.size, 3, { fill: "#0B0C10", x: __o.x, y: __o.y, rotation: 90 });
else shape = _rb.rect("Trim Shape", __o.size, __o.size * 0.72, { fill: "#0B0C10", radius: __o.size * 0.12, x: __o.x, y: __o.y });
_rb.alpha(shape, 0);
const stroke = _rb.stroke(shape, __o.color, __o.width, { capStyle: 1, trim: [0, 0] });
track("shape", shape);
track("stroke", stroke);
_rb.kf(stroke, "trimEnd", [[0, 0], [__o.duration, 100]], "ExpoOut");
_rb.glow(shape, __o.color, 18, 1.2);
`,
  },
  {
    id: "morph_shape",
    title: "Morph Shape",
    category: "polish_camera",
    description: "Morph behaviour blends a source primitive into a hidden target shape over a Quart ramp.",
    params: {
      from: { type: "string", default: "rounded_rect", description: "Source: rounded_rect, circle, star, triangle" },
      to: { type: "string", default: "star", description: "Target shape" },
      color: { type: "color", default: "#10B981", description: "Fill colour" },
      size: { type: "double", default: 340, description: "Shape size" },
      duration: { type: "int", default: 45, description: "Morph duration" },
      x: { type: "double", default: 0, description: "Centre x" },
      y: { type: "double", default: 0, description: "Centre y" },
    },
    code: `
${mkShape}
const source = mkMorphShape("Morph Source", String(__o.from), __o.size, __o.color, false);
_rb.center(source, __o.x, __o.y);
const target = mkMorphShape("Morph Target", String(__o.to), __o.size, __o.color, true);
_rb.center(target, __o.x, __o.y);
const morph = _rb.layer("morph", "Morph");
try { api.connect(target, "id", morph, "target"); } catch (e) { api.connect(target, "id", morph, "shapes"); }
api.connect(morph, "id", source, "deformers");
_rb.kf(morph, "strength", [[0, 0], [__o.duration, 100]], "SlowInSlowOut");
track("source", source);
track("target", target);
track("morph", morph);
`,
  },
  {
    id: "pulse_oscillator",
    title: "Pulse Oscillator",
    category: "polish_camera",
    description: "Oscillator wired to a layer's position, rotation or scale; builds a demo tile when nothing is selected.",
    params: {
      attr: { type: "string", default: "rotation", description: "position, rotation or scale" },
      amplitude: { type: "double", default: 12, description: "Oscillation strength" },
      frequency: { type: "double", default: 1, description: "Oscillations per second" },
      targetId: { type: "string", default: "", description: "Optional existing layer id" },
    },
    code: `
let target = __o.targetId || "";
if (!target) {
  const sel = api.getSelection();
  if (sel && sel.length) target = sel[0];
}
if (!target) {
  target = _rb.rect("Pulse Tile", 240, 240, { fill: "#10B981", radius: 48, x: 0, y: 0 });
  _rb.glow(target, "#10B981", 34, 2);
  const label = _rb.text("PULSE", 22, { color: "#04120C", x: 0, y: 0, name: "Pulse Label" });
  api.parent(label, target);
}
const attr = __o.attr === "scale" ? "scale.y" : (__o.attr === "position" ? "position.y" : (__o.attr === "rotation" ? "rotation" : __o.attr));
const osc = _rb.layer("oscillator", "Pulse", {
  strength: __o.strength != null ? __o.strength : __o.amplitude,
  frequency: __o.frequency
});
api.connect(osc, "id", target, attr);
track("target", target);
track("oscillator", osc);
`,
  },
  {
    id: "camera_rig_25d",
    title: "2.5D Camera Rig",
    category: "polish_camera",
    description: "Two-level camera null: noise drift on the parent, eased zoom/pan on the child, with a demo card scene parented into it.",
    params: {
      zoom: { type: "double", default: 1.16, description: "Zoom target scale" },
      panX: { type: "double", default: 90, description: "Pan x" },
      panY: { type: "double", default: -40, description: "Pan y" },
      drift: { type: "double", default: 14, description: "Noise drift amplitude" },
      endFrame: { type: "int", default: 90, description: "Move duration" },
    },
    code: `
const rig = _rb.layer("null", "Camera_25D_Ctrl");
track("cameraCtrl", rig);
_rb.pos(rig, 0, 0);
const driftX = _rb.layer("noise", "Camera Drift X", { strength: __o.drift, "generator.frequency": 0.05, "generator.timeScale": 0.25, "generator.seed": 3 });
const driftY = _rb.layer("noise", "Camera Drift Y", { strength: __o.drift, "generator.frequency": 0.05, "generator.timeScale": 0.25, "generator.seed": 8 });
api.connect(driftX, "id", rig, "position.x");
api.connect(driftY, "id", rig, "position.y");
const move = _rb.layer("null", "Camera_25D_Move");
api.parent(move, rig);
track("cameraMove", move);
_rb.kf(move, "scale.x", [[0, 1], [__o.endFrame, __o.zoom]], "SlowInSlowOut");
_rb.kf(move, "scale.y", [[0, 1], [__o.endFrame, __o.zoom]], "SlowInSlowOut");
_rb.kf(move, "position.x", [[0, 0], [__o.endFrame, __o.panX]], "SlowInSlowOut");
_rb.kf(move, "position.y", [[0, 0], [__o.endFrame, __o.panY]], "SlowInSlowOut");
const bg = _rb.rect("Camera Backdrop", 2400, 1400, { fill: "#0B0C10" });
api.parent(bg, move);
track("bg", bg);
const glow = _rb.circle("Camera Orb", 260, { fill: "#10B981", alpha: 22, x: 420, y: 120 });
api.parent(glow, move);
const card = _rb.rect("Camera Card", 420, 260, { fill: "#151A23", radius: 28, x: -240, y: -40, stroke: true, strokeColor: "#27303F", strokeWidth: 2 });
api.parent(card, move);
track("card", card);
const title = _rb.text("BUILD 2.5D", 44, { color: "#F8FAFC", x: -240, y: -20, name: "Camera Title" });
api.parent(title, move);
const sub = _rb.text("Parallax rig · zoom + pan", 18, { color: "#94A3B8", x: -240, y: -72, name: "Camera Sub" });
api.parent(sub, move);
`,
  },
];
