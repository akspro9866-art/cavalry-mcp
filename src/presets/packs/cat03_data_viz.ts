import type { PresetDef } from "../types.js";

export const CAT03_DATA_VIZ: PresetDef[] = [
  {
    id: "number_counter",
    title: "Number Counter",
    category: "data_viz",
    description: "stringGenerator-driven numeric readout with prefix, suffix and decimals, eased from startVal to endVal.",
    params: {
      startVal: { type: "double", default: 0, description: "Start value" },
      endVal: { type: "double", default: 100, description: "End value" },
      prefix: { type: "string", default: "", description: "Prefix, e.g. $" },
      suffix: { type: "string", default: "", description: "Suffix, e.g. K" },
      decimals: { type: "int", default: 0, description: "Decimal places" },
      fontSize: { type: "double", default: 96, description: "Font size" },
      color: { type: "color", default: "#F8FAFC", description: "Text fill" },
      duration: { type: "int", default: 60, description: "Count duration" },
      easing: { type: "string", default: "SlowOut", description: "Magic easing name" },
      x: { type: "double", default: 0, description: "Centre x" },
      y: { type: "double", default: 0, description: "Centre y" },
    },
    code: `
const text = _rb.text(String(__o.endVal), __o.fontSize, { color: __o.color, x: __o.x, y: __o.y });
track("text", text);
const counter = _rb.counter(text, {
  from: __o.startVal, to: __o.endVal, prefix: __o.prefix, suffix: __o.suffix,
  decimals: __o.decimals, duration: __o.duration || 60,
  start: __o.startFrame || 0, ease: __o.easing
});
track("counter", counter);
if (__o.label && __o.label !== "0") {
  const cap = _rb.text(__o.label, 18, { color: "#64748B", x: __o.x, y: __o.y - __o.fontSize * 0.78, name: "Counter Caption" });
  track("caption", cap);
}
`,
  },
  {
    id: "bar_chart",
    title: "Bar Chart",
    category: "data_viz",
    description: "Floor-pinned bars (align y:1) grown from the baseline with a spring stagger, values mapped to height.",
    params: {
      values: { type: "json", default: [42, 68, 54, 88, 63, 76], description: "Bar values or [x,y] pairs" },
      barWidth: { type: "double", default: 42, description: "Bar width" },
      gap: { type: "double", default: 26, description: "Space between bars" },
      color: { type: "color", default: "#10B981", description: "Bar fill" },
      maxHeight: { type: "double", default: 260, description: "Tallest bar height" },
      baselineY: { type: "double", default: -170, description: "Baseline y" },
      stagger: { type: "double", default: 4, description: "Per-bar delay in frames" },
    },
    code: `
const vals = Array.isArray(__o.values) ? __o.values : [42, 68, 54, 88, 63, 76];
const max = Math.max.apply(null, vals.map(function (v) { return Number(v) || 0; })) || 1;
const n = vals.length;
const total = n * __o.barWidth + (n - 1) * __o.gap;
const base = __o.baselineY;
const axis = _rb.rect("Baseline", total + 40, 2, { fill: "#27303F", x: 0, y: base });
track("baseline", axis);
for (let i = 0; i < n; i++) {
  const v = Number(vals[i]) || 0;
  const h = Math.max(6, (v / max) * __o.maxHeight);
  const x = -total / 2 + __o.barWidth / 2 + i * (__o.barWidth + __o.gap);
  const bar = _rb.rect("Bar " + (i + 1), __o.barWidth, h, { fill: __o.color, radius: 8, x: x, y: base });
  _rb.anchor(bar, 0, 1);
  const start = i * __o.stagger;
  _rb.kf(bar, "scale.y", [[start, 0.001], [start + 26, 1]], "SpringOut");
  _rb.fade(bar, start, 10, 0, 100, "SlowOut");
  if (i === 0) track("bar", bar);
}
`,
  },
  {
    id: "radial_progress_ring",
    title: "Radial Progress Ring",
    category: "data_viz",
    description: "Stroke-trim progress ring with round caps, a track ring underneath and a centered percentage counter.",
    params: {
      percentage: { type: "double", default: 72, description: "Progress 0-100" },
      radius: { type: "double", default: 140, description: "Ring radius" },
      strokeWidth: { type: "double", default: 18, description: "Ring thickness" },
      trackColor: { type: "color", default: "#1F2937", description: "Track stroke" },
      fillColor: { type: "color", default: "#10B981", description: "Progress stroke" },
      duration: { type: "int", default: 45, description: "Fill duration" },
      x: { type: "double", default: 0, description: "Centre x" },
      y: { type: "double", default: 0, description: "Centre y" },
    },
    code: `
const pct = Math.max(0, Math.min(100, __o.percentage));
const g = _rb.gauge("Radial Progress", {
  radius: __o.radius, strokeWidth: __o.strokeWidth,
  trackColor: __o.trackColor, color: __o.fillColor,
  pct: pct, duration: __o.duration, x: __o.x, y: __o.y,
  fontSize: Math.round(__o.radius * 0.48), suffix: "%", ease: "SlowOut", counterEase: "SlowOut"
});
track("ring", g.progress);
track("counter", g.counter);
_rb.glow(g.progress, __o.fillColor, 26, 1.4);
const label = _rb.text("CAPACITY", 15, { color: "#64748B", x: __o.x, y: __o.y - __o.radius - 30, name: "Ring Label" });
_rb.alpha(label, 80);
`,
  },
  {
    id: "trend_line_graph",
    title: "Trend Line Graph",
    category: "data_viz",
    description: "Segment-built sparkline drawing left to right, with a glowing endpoint that pops when the line lands.",
    params: {
      points: { type: "json", default: [12, 34, 28, 56, 44, 72, 66, 92], description: "Values (0-100) or [x,y] pairs" },
      width: { type: "double", default: 760, description: "Graph width" },
      height: { type: "double", default: 300, description: "Graph height" },
      lineColor: { type: "color", default: "#10B981", description: "Line colour" },
      strokeWidth: { type: "double", default: 6, description: "Line thickness" },
      stagger: { type: "double", default: 3, description: "Segment draw delay" },
    },
    code: `
const raw = Array.isArray(__o.points) ? __o.points : [12, 34, 28, 56, 44, 72, 66, 92];
const pts = [];
const maxV = Math.max.apply(null, raw.map(function (p) { return Array.isArray(p) ? (Number(p[1]) || 0) : (Number(p) || 0); })) || 1;
for (let i = 0; i < raw.length; i++) {
  const p = raw[i];
  if (Array.isArray(p)) pts.push([Number(p[0]) || 0, Number(p[1]) || 0]);
  else pts.push([-__o.width / 2 + (i / Math.max(1, raw.length - 1)) * __o.width, (Number(p) / maxV) * __o.height - __o.height / 2]);
}
for (let i = 0; i < 4; i++) {
  _rb.rect("Grid " + i, __o.width, 1, { fill: "#1F2937", x: 0, y: -__o.height / 2 + (i / 3) * __o.height });
}
let lastLine = null;
for (let i = 0; i < pts.length - 1; i++) {
  const a = pts[i], b = pts[i + 1];
  const seg = _rb.line("Trend Segment " + (i + 1), a[0], a[1], b[0], b[1], __o.strokeWidth, __o.lineColor);
  _rb.draw(seg, i * __o.stagger, i * __o.stagger + 12, "SlowInSlowOut");
  lastLine = seg;
  if (i === 0) track("segment", seg);
}
const end = pts[pts.length - 1];
const dot = _rb.dot("Endpoint", end[0], end[1], 18, __o.lineColor, { glow: 26, glowIntensity: 2 });
const endFrame = (pts.length - 1) * __o.stagger + 10;
_rb.pop(dot, endFrame, 12, { ease: "SpringOut" });
track("endpoint", dot);
const label = _rb.text("GROWTH", 14, { color: "#64748B", x: -__o.width / 2 + 44, y: __o.height / 2 + 28, name: "Trend Label" });
`,
  },
  {
    id: "node_network_hub",
    title: "Node Network Hub",
    category: "data_viz",
    description: "Central labelled hub with satellite nodes, sequentially drawn spokes and travelling accent pulses.",
    params: {
      nodeCount: { type: "int", default: 6, description: "Satellite nodes" },
      hubLabel: { type: "string", default: "API", description: "Hub label" },
      radius: { type: "double", default: 300, description: "Orbit radius" },
      lineColor: { type: "color", default: "#334155", description: "Spoke colour" },
      pulseColor: { type: "color", default: "#10B981", description: "Pulse + accent" },
    },
    code: `
const n = __o.nodeCount;
const hub = _rb.circle("Hub", 58, { fill: "#111827", x: 0, y: 0 });
_rb.stroke(hub, __o.pulseColor, 3, { capStyle: 1, trim: [0, 100] });
_rb.glow(hub, __o.pulseColor, 30, 2);
track("hub", hub);
_rb.text(__o.hubLabel, 24, { color: "#F8FAFC", x: 0, y: 0, name: "Hub Label" });
for (let i = 0; i < n; i++) {
  const ang = (i / n) * Math.PI * 2 + Math.PI / 2;
  const x = Math.cos(ang) * __o.radius, y = Math.sin(ang) * __o.radius;
  const line = _rb.line("Spoke " + (i + 1), 0, 0, x, y, 3, __o.lineColor);
  _rb.draw(line, i * 5, i * 5 + 16, "SlowInSlowOut");
  if (i === 0) track("spoke", line);
  const node = _rb.circle("Node " + (i + 1), 24, { fill: "#0F172A", x: x, y: y });
  _rb.stroke(node, __o.pulseColor, 2, { capStyle: 1, trim: [0, 100] });
  _rb.pop(node, i * 5 + 6, 14, { ease: "SpringOut" });
  if (i === 0) track("node", node);
  const pulse = _rb.dot("Pulse " + (i + 1), 0, 0, 9, __o.pulseColor, { glow: 16, glowIntensity: 2 });
  _rb.kf(pulse, "position.x", [[i * 6 + 20, 0], [i * 6 + 44, x]], "SlowInSlowOut");
  _rb.kf(pulse, "position.y", [[i * 6 + 20, 0], [i * 6 + 44, y]], "SlowInSlowOut");
  _rb.fade(pulse, i * 6 + 20, 8, 0, 100, "SlowIn");
  _rb.fade(pulse, i * 6 + 38, 8, 100, 0, "SlowOut");
  if (i === 0) track("pulse", pulse);
}
`,
  },
];
