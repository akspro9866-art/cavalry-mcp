/**
 * Reusable procedural rig factories, injected into Cavalry alongside _mg.
 * Every builder follows the verified Cavalry 2.8.0 rules:
 *  - compound attributes (position/scale/dimensions/colors) each get their
 *    own api.set call; mixing them silently drops all but the first
 *  - text geometry is offset from its layer origin, so placement subtracts
 *    the local bounding-box centre
 *  - duplicator sources are hidden; duplicates remain visible
 *  - stroke-only shapes use material.alpha = 0 (material:false is a no-op)
 *  - linear duplicators take scalar count/size, grid takes vectors
 *
 * This module is never executed by Node; it only exports a JS source string.
 */
export const RB_HELPERS_SOURCE = String.raw`
const _rb = {
  EASE_MAP: {
    Linear: "None",
    QuartIn: "SlowIn",
    QuartOut: "SlowOut",
    QuartInOut: "SlowInSlowOut",
    QuintIn: "VerySlowIn",
    QuintOut: "VerySlowOut",
    QuintInOut: "VerySlowInVerySlowOut",
    ExpoIn: "VerySlowIn",
    ExpoOut: "VerySlowOut",
    ExpoInOut: "VerySlowInVerySlowOut",
    CircIn: "SlowIn",
    CircOut: "SlowOut",
    CircInOut: "SlowInSlowOut",
    SineIn: "SlowIn",
    SineOut: "SlowOut",
    SineInOut: "SlowInSlowOut"
  },
  EASE_VALID: ["SlowIn","SlowOut","SlowInSlowOut","VerySlowIn","VerySlowOut","VerySlowInVerySlowOut","SpringIn","SpringOut","SpringInSpringOut","SmallSpringIn","SmallSpringOut","SmallSpringInSmallSpringOut","AnticipateIn","OvershootOut","AnticipateInOvershootOut","BounceIn","BounceOut","BounceInBounceOut","None","Custom"],

  ease(name) {
    if (!name) return "SlowInSlowOut";
    if (this.EASE_VALID.indexOf(name) >= 0) return name;
    return this.EASE_MAP[name] || "SlowInSlowOut";
  },

  c(value) {
    if (value && typeof value === "object") {
      return { r: value.r | 0, g: value.g | 0, b: value.b | 0, a: value.a == null ? 255 : value.a | 0 };
    }
    let s = String(value == null ? "#FFFFFF" : value).replace("#", "");
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    return {
      r: parseInt(s.substr(0, 2), 16) || 0,
      g: parseInt(s.substr(2, 2), 16) || 0,
      b: parseInt(s.substr(4, 2), 16) || 0,
      a: s.length >= 8 ? (parseInt(s.substr(6, 2), 16) || 0) : 255
    };
  },

  one(key, value) { const d = {}; d[key] = value; return d; },

  /** Locale-free thousands formatter: 48200 -> "48,200" (optional decimals). */
  fmt(value, decimals) {
    const n = Number(value) || 0;
    const fixed = decimals ? n.toFixed(decimals) : String(Math.round(n));
    const parts = fixed.split(".");
    let whole = parts[0];
    let sign = "";
    if (whole.charAt(0) === "-") { sign = "-"; whole = whole.slice(1); }
    let out = "";
    for (let i = 0; i < whole.length; i++) {
      if (i > 0 && (whole.length - i) % 3 === 0) out += ",";
      out += whole[i];
    }
    return sign + out + (parts.length > 1 ? "." + parts[1] : "");
  },

  /** New layers inherit the selection's parent; reset it before top-level creation. */
  fresh() { try { api.select([]); } catch (e) {} },

  /** Split compound/color attributes into single api.set calls. */
  set(id, attrs) {
    if (!attrs) return id;
    const compound = ["material.materialColor","strokeColor","glowColor","position","scale","rotation","generator.dimensions","generator.size","generator.count","generator.radius","generator.width","font"];
    const scalar = {};
    const keys = Object.keys(attrs);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i], v = attrs[k];
      if (compound.indexOf(k) >= 0 || (v && typeof v === "object")) api.set(id, this.one(k, v));
      else scalar[k] = v;
    }
    if (Object.keys(scalar).length) api.set(id, scalar);
    return id;
  },

  layer(type, name, attrs) {
    this.fresh();
    const id = api.create(type, name || type);
    this.set(id, attrs || {});
    return id;
  },

  pos(id, x, y) { api.set(id, { position: [x, y] }); return id; },
  dims(id, w, h) { api.set(id, { "generator.dimensions": [w, h] }); return id; },
  rad(id, r) { api.set(id, { "generator.cornerRadius": r }); return id; },
  scale(id, x, y) { api.set(id, { scale: [x, y == null ? x : y] }); return id; },
  rot(id, deg) { api.set(id, { rotation: deg }); return id; },
  opacity(id, v) { api.set(id, { opacity: v }); return id; },
  alpha(id, v) { api.set(id, { "material.alpha": v }); return id; },
  hide(id) { api.set(id, { hidden: true }); return id; },
  show(id) { api.set(id, { hidden: false }); return id; },
  fill(id, color) { api.set(id, { "material.materialColor": this.c(color) }); return id; },
  strokeColor(id, color) { api.set(id, { strokeColor: this.c(color) }); return id; },

  /** Centre geometry (text especially) on the given composition point. */
  center(id, x, y) {
    let bb = null;
    try { bb = api.getBoundingBox(id, false); } catch (e) {}
    const cx = bb && bb.centre ? Number(bb.centre.x) || 0 : 0;
    const cy = bb && bb.centre ? Number(bb.centre.y) || 0 : 0;
    this.pos(id, x - cx, y - cy);
    return id;
  },

  /** Pin one edge/corner of the geometry to (x, y). ax/ay are -1, 0 or 1. */
  edge(id, x, y, ax, ay) {
    let bb = null;
    try { bb = api.getBoundingBox(id, false); } catch (e) {}
    const cx = bb && bb.centre ? Number(bb.centre.x) || 0 : 0;
    const cy = bb && bb.centre ? Number(bb.centre.y) || 0 : 0;
    const w = bb && bb.width ? Number(bb.width) : 0;
    const h = bb && bb.height ? Number(bb.height) : 0;
    this.pos(id, x - cx - (ax || 0) * w / 2, y - cy - (ay || 0) * h / 2);
    return id;
  },

  rect(name, w, h, o) {
    o = o || {};
    this.fresh();
    const id = api.primitive("rectangle", name);
    this.dims(id, w, h);
    if (o.radius != null) this.rad(id, o.radius);
    this.fill(id, o.fill || "#1E293B");
    if (o.alpha != null) this.alpha(id, o.alpha);
    this.pos(id, o.x || 0, o.y || 0);
    if (o.rotation) this.rot(id, o.rotation);
    if (o.opacity != null) this.opacity(id, o.opacity);
    if (o.hidden) this.hide(id);
    if (o.stroke) this.stroke(id, o.strokeColor || "#334155", o.strokeWidth || 2, { capStyle: 0 });
    return id;
  },

  ellipse(name, w, h, o) {
    o = o || {};
    this.fresh();
    const id = api.primitive("ellipse", name);
    // ellipse has no dimensions attribute; its radius is a [rx, ry] vector
    api.set(id, { "generator.radius": [w / 2, h / 2] });
    this.fill(id, o.fill || "#1E293B");
    if (o.alpha != null) this.alpha(id, o.alpha);
    this.pos(id, o.x || 0, o.y || 0);
    if (o.rotation) this.rot(id, o.rotation);
    if (o.opacity != null) this.opacity(id, o.opacity);
    if (o.hidden) this.hide(id);
    if (o.stroke) this.stroke(id, o.strokeColor || "#334155", o.strokeWidth || 2, { capStyle: 1 });
    return id;
  },

  circle(name, r, o) { return this.ellipse(name, r * 2, r * 2, o); },

  star(name, size, o) {
    o = o || {};
    this.fresh();
    const id = api.primitive("star", name);
    api.set(id, {
      "generator.radius": size / 2,
      "generator.innerRadius": o.innerRadius != null ? o.innerRadius : size * 0.22,
      "generator.sides": o.points || 4,
      "generator.useInnerRadius": o.useInner !== false,
      "generator.divisions": o.divisions || 0
    });
    this.fill(id, o.fill || "#F8FAFC");
    if (o.alpha != null) this.alpha(id, o.alpha);
    this.pos(id, o.x || 0, o.y || 0);
    if (o.rotation) this.rot(id, o.rotation);
    if (o.opacity != null) this.opacity(id, o.opacity);
    if (o.hidden) this.hide(id);
    return id;
  },

  poly(name, size, sides, o) {
    o = o || {};
    this.fresh();
    const id = api.primitive("polygon", name);
    api.set(id, { "generator.radius": [size / 2, size / 2] });
    api.set(id, { "generator.sides": sides || 3 });
    this.fill(id, o.fill || "#1E293B");
    if (o.alpha != null) this.alpha(id, o.alpha);
    this.pos(id, o.x || 0, o.y || 0);
    if (o.rotation) this.rot(id, o.rotation);
    if (o.stroke) this.stroke(id, o.strokeColor || "#334155", o.strokeWidth || 2, { capStyle: 1 });
    return id;
  },

  ringPrim(name, radius, width, o) {
    o = o || {};
    this.fresh();
    const id = api.primitive("ring", name);
    api.set(id, { "generator.radius": radius, "generator.width": width });
    this.fill(id, o.fill || "#10B981");
    this.pos(id, o.x || 0, o.y || 0);
    if (o.opacity != null) this.opacity(id, o.opacity);
    return id;
  },

  arc(name, radius, width, startAngle, endAngle, o) {
    o = o || {};
    this.fresh();
    const id = api.primitive("arc", name);
    api.set(id, { "generator.radius": radius, "generator.width": width });
    api.set(id, { "generator.startAngle": startAngle, "generator.endAngle": endAngle });
    this.fill(id, o.fill || "#F8FAFC");
    this.pos(id, o.x || 0, o.y || 0);
    if (o.opacity != null) this.opacity(id, o.opacity);
    return id;
  },

  text(str, size, o) {
    o = o || {};
    this.fresh();
    const id = api.create("textShape", o.name || String(str).slice(0, 32) || "Text");
    api.set(id, {
      text: String(str),
      fontSize: size || 60,
      horizontalAlignment: o.align == null ? 1 : o.align,
      verticalAlignment: o.valign == null ? 1 : o.valign
    });
    if (o.font) api.set(id, { font: { font: o.font, style: o.style || "Regular" } });
    this.fill(id, o.color || "#F8FAFC");
    if (o.alpha != null) this.alpha(id, o.alpha);
    if (o.opacity != null) this.opacity(id, o.opacity);
    this.center(id, o.x == null ? 0 : o.x, o.y == null ? 0 : o.y);
    return id;
  },

  /** Left-aligned text whose left edge sits at x. */
  textLeft(str, size, x, y, o) {
    o = o || {};
    const id = this.text(str, size, Object.assign({}, o, { align: 0, x: 0, y: 0 }));
    this.edge(id, x, y, -1, 0);
    return id;
  },

  /** Right-aligned text whose right edge sits at x. */
  textRight(str, size, x, y, o) {
    o = o || {};
    const id = this.text(str, size, Object.assign({}, o, { align: 2, x: 0, y: 0 }));
    this.edge(id, x, y, 1, 0);
    return id;
  },

  stroke(shapeId, color, width, o) {
    o = o || {};
    this.fresh();
    const id = api.create("strokeMaterial", "Stroke");
    api.set(id, { width: width || 2 });
    this.strokeColor(id, color || "#94A3B8");
    if (o.capStyle != null) api.set(id, { capStyle: o.capStyle });
    // Cavalry 2.8 stores dashPattern as a comma-separated string ("10,8");
    // passing an array throws json type_error.302 in the bridge.
    if (o.dash) api.set(id, { dashPattern: Array.isArray(o.dash) ? o.dash.join(",") : String(o.dash) });
    if (o.trim) api.set(id, { trimStart: o.trim[0], trimEnd: o.trim[1] });
    api.connect(id, "id", shapeId, "stroke");
    return id;
  },

  glow(target, color, blur, intensity) {
    this.fresh();
    const id = api.create("glowFilter", "Glow");
    this.set(id, { glowColor: this.c(color || "#10B981") });
    const b = blur == null ? 20 : blur;
    api.set(id, { blur: [b, b] });
    api.set(id, { intensity: intensity == null ? 2 : intensity, gamma: 1 });
    api.connect(id, "id", target, "filters");
    return id;
  },

  /**
   * Pin an edge of the target's geometry to its position.
   * Helper convention: x = -1 pins the left edge (Cavalry's align x sign is
   * inverted: x:1 is the left edge), x = 1 the right edge; y = 1 the bottom.
   */
  anchor(target, x, y) {
    this.fresh();
    const id = api.create("align", "Align");
    api.set(id, { x: -(x == null ? 0 : x), y: y == null ? 0 : y });
    api.connect(id, "id", target, "deformers");
    return id;
  },

  kf(id, attr, pts, easeName) {
    const ease = this.ease(easeName);
    for (let i = 0; i < pts.length; i++) {
      const d = {}; d[attr] = pts[i][1];
      api.keyframe(id, pts[i][0], d);
      if (i < pts.length - 1) api.magicEasing(id, attr, pts[i][0], ease);
    }
    return id;
  },

  /**
   * Keyframe position using visual coordinates. Text layers carry an intrinsic
   * bbox offset (center()/edge() compensate it at creation), so raw position
   * keyframes would shift them by that offset. Shapes resolve to offset 0.
   */
  kfAt(id, axis, pts, easeName) {
    let off = 0;
    try {
      const bb = api.getBoundingBox(id, false);
      if (bb && bb.centre) off = Number(bb.centre[axis]) || 0;
    } catch (e) {}
    return this.kf(id, "position." + axis, pts.map((p) => [p[0], p[1] - off]), easeName);
  },

  pop(id, start, duration, o) {
    o = o || {};
    const from = o.from == null ? 0 : o.from;
    this.kf(id, "scale.x", [[start, from], [start + duration, 1]], o.ease || "SpringOut");
    this.kf(id, "scale.y", [[start, from], [start + duration, 1]], o.ease || "SpringOut");
    if (o.fade !== false) this.fade(id, start, duration, o.fadeFrom == null ? 0 : o.fadeFrom, o.fadeTo == null ? 100 : o.fadeTo, o.ease || "SpringOut");
    return id;
  },

  fade(id, start, duration, from, to, easeName) {
    return this.kf(id, "opacity", [[start, from == null ? 0 : from], [start + duration, to == null ? 100 : to]], easeName || "SlowInSlowOut");
  },

  slide(id, start, duration, dx, dy, easeName) {
    let x = 0, y = 0;
    try { x = Number(api.get(id, "position.x")) || 0; y = Number(api.get(id, "position.y")) || 0; } catch (e) {}
    this.kf(id, "position.x", [[start, x + dx], [start + duration, x]], easeName || "SlowOut");
    this.kf(id, "position.y", [[start, y + dy], [start + duration, y]], easeName || "SlowOut");
    return id;
  },

  stagger(target, offset, attr) {
    this.fresh();
    const id = api.create("stagger", "Stagger");
    api.set(id, { offset: offset == null ? 4 : offset });
    api.connect(id, "id", target, attr || "shapeTimeOffset");
    return id;
  },

  dup(source, o) {
    o = o || {};
    this.fresh();
    const id = api.create("duplicator", o.name || "Duplicator");
    api.connect(source, "id", id, "shapes");
    const linear = o.distribution === "linear";
    api.setGenerator(id, "generator", linear ? "linearDistribution" : "gridDistribution");
    if (linear) {
      const n = typeof o.count === "number" ? o.count : (o.columns || 5);
      api.set(id, { "generator.count": n });
      api.set(id, { "generator.size": o.size != null ? Number(o.size) : (o.width || 800) });
    } else {
      let cols = o.columns || 4, rows = o.rows || 3;
      if (Array.isArray(o.count)) { cols = Number(o.count[0]) || 1; rows = Number(o.count[1]) || 1; }
      api.set(id, { "generator.count": [cols, rows] });
      let sw = o.width || 1000, sh = o.height || 600;
      if (Array.isArray(o.size)) { sw = Number(o.size[0]) || sw; sh = Number(o.size[1]) || sh; }
      else if (typeof o.size === "number") { sw = o.size; sh = o.size; }
      api.set(id, { "generator.size": [sw, sh] });
    }
    if (o.direction != null) api.set(id, { "generator.direction": o.direction });
    if (o.attrs) this.set(id, o.attrs);
    if (o.hideSource !== false) this.hide(source);
    return id;
  },

  /** Straight connector drawn from (x1,y1) to (x2,y2); scale.x draws it on. */
  line(name, x1, y1, x2, y2, width, color, o) {
    o = o || {};
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const id = this.rect(name, len, width || 4, { fill: color || "#334155", radius: (width || 4) / 2 });
    this.anchor(id, -1, 0);
    this.pos(id, x1, y1);
    this.rot(id, angle);
    if (o.dash) this.stroke(id, o.strokeColor || color || "#334155", 1, { dash: o.dash, capStyle: 0 });
    if (o.draw) this.kf(id, "scale.x", [[o.draw[0], 0.001], [o.draw[1], 1]], o.ease || "SlowInSlowOut");
    return id;
  },

  draw(id, start, end, easeName) {
    return this.kf(id, "scale.x", [[start, 0.001], [end, 1]], easeName || "SlowInSlowOut");
  },

  counter(textId, o) {
    o = o || {};
    this.fresh();
    const id = api.create("stringGenerator", "Counter");
    api.set(id, { "generator.precision": o.decimals || 0 });
    api.set(id, { "generator.length": o.length || 1 });
    api.set(id, { prefix: o.prefix || "", suffix: o.suffix || "" });
    if (o.delimiter) api.set(id, { "generator.delimiter": o.delimiter });
    api.connect(id, "id", textId, "text");
    this.kf(id, "generator.number", [[o.start || 0, o.from == null ? 0 : o.from], [(o.start || 0) + (o.duration || 45), o.to == null ? 100 : o.to]], o.ease || "SlowOut");
    return id;
  },

  /** Linear row of rounded bars driven by one oscillator + per-copy stagger. */
  wave(name, o) {
    o = o || {};
    const width = o.width || 720;
    const barW = o.barWidth || 6;
    const color = o.color || "#10B981";
    const bar = this.rect(name + " Bar", barW, o.maxHeight || 120, { fill: color, radius: barW / 2 });
    this.anchor(bar, 0, 1);
    this.pos(bar, 0, o.y || 0);
    const d = this.dup(bar, { name: name + " Bars", distribution: "linear", count: o.count || 28, size: width });
    const osc = this.layer("oscillator", name + " Osc", {
      strength: o.strength == null ? 0.55 : o.strength,
      frequency: o.frequency == null ? 1.1 : o.frequency
    });
    api.connect(osc, "id", bar, "scale.y");
    this.stagger(d, o.stagger == null ? 2 : o.stagger);
    return { bars: d, bar: bar, oscillator: osc };
  },

  /** Track + fill progress bar; fill grows from the left edge. */
  progress(name, w, h, o) {
    o = o || {};
    const x = o.x || 0, y = o.y || 0;
    const track = this.rect(name + " Track", w, h, { fill: o.trackColor || "#1F2937", radius: h / 2, x: x, y: y });
    const fill = this.rect(name + " Fill", w, h, { fill: o.color || "#10B981", radius: h / 2 });
    this.anchor(fill, -1, 0);
    this.pos(fill, x - w / 2, y);
    const pct = o.pct == null ? 0.65 : o.pct;
    if (o.animate === false) this.scale(fill, pct, 1);
    else this.kf(fill, "scale.x", [[o.start || 0, o.from == null ? 0.001 : o.from], [(o.start || 0) + (o.duration || 45), pct]], o.ease || "SlowOut");
    return { track: track, fill: fill };
  },

  /** Background ring + progress ring (stroke trim) + centred value counter. */
  gauge(name, o) {
    o = o || {};
    const x = o.x || 0, y = o.y || 0;
    const radius = o.radius || 130, sw = o.strokeWidth || 18;
    const track = this.circle(name + " Track", radius, { fill: "#0B0C10", alpha: 0, x: x, y: y });
    this.stroke(track, o.trackColor || "#1F2937", sw, { capStyle: 1, trim: [0, 100] });
    const progress = this.circle(name + " Progress", radius, { fill: "#0B0C10", alpha: 0, x: x, y: y });
    const stroke = this.stroke(progress, o.color || "#10B981", sw, { capStyle: 1, trim: [0, 0] });
    const pct = o.pct == null ? 72 : o.pct;
    const start = o.start || 0, duration = o.duration || 45;
    this.kf(stroke, "trimEnd", [[start, 0], [start + duration, pct]], o.ease || "SlowOut");
    const to = o.counterTo == null ? pct : o.counterTo;
    const decimals = o.decimals || 0;
    const prefix = o.prefix || "";
    const suffix = o.suffix == null ? "%" : o.suffix;
    // Seed the text with the final readout so centring is measured on real glyphs;
    // stringGenerator only replaces the characters afterwards.
    const seed = o.text == null ? prefix + Number(to).toFixed(decimals) + suffix : String(o.text);
    const text = this.text(seed, o.fontSize || 48, { color: o.textColor || "#F8FAFC", x: x, y: y, name: name + " Value" });
    let counter = null;
    if (o.counter !== false) {
      counter = this.counter(text, { from: o.counterFrom == null ? 0 : o.counterFrom, to: to, prefix: prefix, suffix: suffix, start: start, duration: duration, decimals: decimals, ease: o.counterEase || o.ease });
    }
    return { track: track, progress: progress, stroke: stroke, text: text, counter: counter };
  },

  /** Dimmed backdrop + rounded card. */
  modal(name, w, h, o) {
    o = o || {};
    const dim = this.rect(name + " Dim", 1920, 1080, { fill: o.dimColor || "#000000", alpha: o.dim == null ? 55 : o.dim, x: 0, y: 0 });
    const card = this.rect(name + " Card", w, h, { fill: o.fill || "#111827", radius: o.radius == null ? 24 : o.radius, x: o.x || 0, y: o.y || 0, stroke: o.stroke !== false, strokeColor: o.strokeColor || "#334155", strokeWidth: 2 });
    if (o.pop !== false) this.pop(card, o.start || 0, o.duration || 20, { ease: "SpringOut", fade: false });
    return { dim: dim, card: card };
  },

  pill(name, w, h, o) {
    o = o || {};
    return this.rect(name, w, h, { fill: o.fill || "#1E293B", radius: o.radius == null ? h / 2 : o.radius, x: o.x || 0, y: o.y || 0, alpha: o.alpha, stroke: o.stroke, strokeColor: o.strokeColor, strokeWidth: o.strokeWidth });
  },

  dot(name, x, y, size, color, o) {
    o = o || {};
    const id = this.circle(name, (size || 10) / 2, { fill: color || "#10B981", x: x, y: y });
    if (o.glow) this.glow(id, color || "#10B981", o.glow, o.glowIntensity == null ? 2 : o.glowIntensity);
    return id;
  },

  check(name, x, y, size, color) {
    return this.text("\u2713", size || 28, { color: color || "#10B981", x: x, y: y, name: name });
  },

  keycap(name, label, x, y, o) {
    o = o || {};
    const w = o.width || 64, h = o.height || 44;
    const cap = this.rect(name, w, h, { fill: o.fill || "#1E293B", radius: o.radius == null ? 10 : o.radius, x: x, y: y, stroke: true, strokeColor: o.strokeColor || "#475569", strokeWidth: 2 });
    this.text(label, o.fontSize || 20, { color: o.color || "#E2E8F0", x: x, y: y, name: name + " Label" });
    return cap;
  },

  /** Status row: card + dot + label + trailing value. */
  listRow(name, w, h, o) {
    o = o || {};
    const x = o.x || 0, y = o.y || 0;
    const card = this.rect(name, w, h, { fill: o.fill || "#151A23", radius: o.radius == null ? 12 : o.radius, x: x, y: y, stroke: o.stroke !== false, strokeColor: o.strokeColor || "#27303F", strokeWidth: 1 });
    const pad = o.pad || 22;
    const dot = this.dot(name + " Dot", x - w / 2 + pad, y, o.dotSize || 10, o.dotColor || "#10B981");
    const label = this.textLeft(String(o.label || "Row"), o.fontSize || 18, x - w / 2 + pad + 18, y, { color: o.textColor || "#E2E8F0" });
    let value = null;
    if (o.value != null) value = this.textRight(String(o.value), o.fontSize || 18, x + w / 2 - pad, y, { color: o.valueColor || "#94A3B8" });
    return { card: card, dot: dot, label: label, value: value };
  },

  rowX(i, n, gap) { return (i - (n - 1) / 2) * gap; },
  colY(i, n, gap) { return ((n - 1) / 2 - i) * gap; },

  /** KPI tile: card, caption, large value and an optional delta chip. */
  kpiCard(name, label, value, x, y, w, h, o) {
    o = o || {};
    const card = this.rect(name, w, h, {
      fill: o.fill || "#111827", radius: o.radius == null ? 18 : o.radius,
      x: x, y: y, stroke: o.stroke !== false, strokeColor: o.strokeColor || "#27303F", strokeWidth: 1
    });
    const caption = this.textLeft(String(label), o.labelSize || 13, x - w / 2 + 24, y + h / 2 - 28, { color: o.labelColor || "#64748B", name: name + " Caption" });
    const val = this.textLeft(String(value), o.valueSize || 38, x - w / 2 + 24, y - 8, { color: o.valueColor || "#F8FAFC", name: name + " Value" });
    let delta = null;
    if (o.delta) {
      delta = this.badge(name + " Delta", String(o.delta), x + w / 2 - Math.max(42, String(o.delta).length * 7 + 22), y + h / 2 - 28, {
        fill: o.deltaFill || "#052E22", color: o.deltaColor || "#34D399", fontSize: 11, height: 22
      });
    }
    return { card: card, caption: caption, value: val, delta: delta };
  },

  /** Company/partner pill with an optional brand mark. */
  logoPill(name, label, x, y, o) {
    o = o || {};
    const h = o.height || 52, fs = o.fontSize || 18;
    const w = o.width || Math.max(h + 26, Math.round(String(label).length * fs * 0.62 + fs * 2.6));
    const pill = this.rect(name, w, h, {
      fill: o.fill || "#0F141B", radius: o.radius == null ? 14 : o.radius,
      x: x, y: y, stroke: true, strokeColor: o.strokeColor || "#222B38", strokeWidth: 1
    });
    let mark = null;
    if (o.mark !== false) {
      mark = this.circle(name + " Mark", o.markSize || 7, {
        fill: o.color || "#94A3B8", x: x - w / 2 + 22, y: y
      });
    }
    const text = this.text(String(label), fs, {
      color: o.textColor || "#CBD5E1", x: mark ? x + 10 : x, y: y, name: name + " Label"
    });
    return { pill: pill, mark: mark, text: text, w: w, h: h };
  },

  /** Phone shell: body, inset screen and notch. */
  phoneFrame(name, w, h, x, y, o) {
    o = o || {};
    const body = this.rect(name, w, h, {
      fill: o.fill || "#0B0F14", radius: o.radius == null ? 42 : o.radius,
      x: x, y: y, stroke: true, strokeColor: o.strokeColor || "#334155", strokeWidth: 3
    });
    const screen = this.rect(name + " Screen", w - 22, h - 22, {
      fill: o.screenColor || "#111827", radius: (o.radius == null ? 42 : o.radius) - 8, x: x, y: y
    });
    const notch = this.rect(name + " Notch", Math.round(w * 0.32), 18, {
      fill: o.fill || "#0B0F14", radius: 9, x: x, y: y + h / 2 - 24
    });
    return { body: body, screen: screen, notch: notch };
  },

  /** Equal-width meter segments (password strength, quotas, split bars). */
  segmentRow(name, n, w, h, x, y, o) {
    o = o || {};
    const gap = o.gap == null ? 8 : o.gap;
    const count = Math.max(1, n || 4);
    const segW = (w - gap * (count - 1)) / count;
    const segs = [];
    for (let i = 0; i < count; i++) {
      segs.push(this.rect(name + " " + (i + 1), segW, h, {
        fill: o.fill || "#1F2937", radius: o.radius == null ? h / 2 : o.radius,
        x: x - w / 2 + segW / 2 + i * (segW + gap), y: y
      }));
    }
    return segs;
  },

  /** Deterministic audio bars that pulse upward from a baseline. */
  audioBars(name, x, y, w, count, color, o) {
    o = o || {};
    const n = Math.max(3, count || 24);
    const barW = o.barWidth || 6;
    const gap = (w - n * barW) / (n > 1 ? n - 1 : 1);
    const maxH = o.maxHeight || 120;
    const dur = o.duration || 30;
    const base = o.base == null ? 0.25 : o.base;
    const start = o.start || 0;
    const bars = [];
    for (let i = 0; i < n; i++) {
      const h = maxH * (0.25 + 0.75 * Math.abs(Math.sin(i * 1.7 + (o.seed || 0))));
      const bx = x - w / 2 + barW / 2 + i * (barW + gap);
      const bar = this.rect(name + " " + (i + 1), barW, h, {
        fill: Array.isArray(color) ? color[i % color.length] : (color || "#10B981"),
        radius: barW / 2, x: bx, y: y
      });
      this.anchor(bar, 0, 1);
      this.pos(bar, bx, y);
      if (o.animate !== false) {
        const s = start + i * (o.stagger == null ? 0.8 : o.stagger);
        this.kf(bar, "scale.y", [
          [s, base],
          [s + dur * 0.22, 0.55 + (i % 3) * 0.15],
          [s + dur * 0.46, base],
          [s + dur * 0.7, 0.75 + (i % 2) * 0.2],
          [s + dur, base]
        ], o.ease || "SlowInOut");
      }
      bars.push(bar);
    }
    return bars;
  },

  /** Circular avatar with optional stroke ring and centred initials. */
  avatar(name, size, x, y, o) {
    o = o || {};
    const bg = this.circle(name, (size || 64) / 2, { fill: o.fill || "#334155", x: x, y: y });
    if (o.ring !== false) this.stroke(bg, o.ringColor || "#0B0C10", o.ringWidth || 4, { capStyle: 1, trim: [0, 100] });
    const label = this.text(o.initials || "AB", Math.max(10, (size || 64) * 0.34), {
      color: o.textColor || "#F8FAFC", x: x, y: y, name: name + " Initials"
    });
    return { bg: bg, label: label };
  },

  /** Pill + centred label sized from the text length. */
  badge(name, label, x, y, o) {
    o = o || {};
    const fs = o.fontSize || 14, h = o.height || Math.round(fs * 2.2);
    const w = o.width || Math.max(h + 12, Math.round(String(label).length * fs * 0.64 + fs * 1.8));
    const pill = this.pill(name, w, h, {
      fill: o.fill || "#1E293B", radius: o.radius == null ? h / 2 : o.radius, x: x, y: y,
      alpha: o.alpha, stroke: o.stroke, strokeColor: o.strokeColor, strokeWidth: o.strokeWidth
    });
    const text = this.text(String(label), fs, { color: o.color || "#E2E8F0", x: x, y: y, name: name + " Label" });
    return { pill: pill, text: text, w: w, h: h };
  },

  /** Automation/status card: icon dot, title and optional sub-label. */
  nodeCard(name, label, x, y, w, h, o) {
    o = o || {};
    const card = this.rect(name, w, h, {
      fill: o.fill || "#111827", radius: o.radius == null ? 16 : o.radius,
      x: x, y: y, stroke: o.stroke !== false, strokeColor: o.strokeColor || "#334155", strokeWidth: o.strokeWidth || 2
    });
    const icon = this.dot(name + " Icon", x - w / 2 + 34, y, o.iconSize || 18, o.iconColor || "#10B981", { glow: 14, glowIntensity: 1.2 });
    const title = this.textLeft(String(label), o.fontSize || 18, x - w / 2 + 58, y + (o.sub ? 12 : 0), { color: o.textColor || "#F8FAFC", name: name + " Title" });
    let sub = null;
    if (o.sub) sub = this.textLeft(String(o.sub), 12, x - w / 2 + 58, y - 12, { color: o.subColor || "#64748B", name: name + " Sub" });
    return { card: card, icon: icon, title: title, sub: sub };
  },

  /** Chat bubble with an optional left tail. */
  chatBubble(name, w, h, x, y, o) {
    o = o || {};
    const bubble = this.rect(name, w, h, {
      fill: o.fill || "#1E293B", radius: o.radius == null ? 22 : o.radius,
      x: x, y: y, stroke: o.stroke, strokeColor: o.strokeColor, strokeWidth: o.strokeWidth || 1
    });
    let tail = null;
    if (o.tail !== false) {
      tail = this.poly(name + " Tail", 26, 3, { fill: o.fill || "#1E293B", x: x - w / 2 + 20, y: y - h / 2 - 4, rotation: o.tailRotation == null ? 200 : o.tailRotation });
    }
    return { bubble: bubble, tail: tail };
  },

  /** Browser chrome: frame, title bar, traffic dots and URL pill. */
  browserFrame(name, w, h, x, y, o) {
    o = o || {};
    const frame = this.rect(name, w, h, {
      fill: o.fill || "#0B0F14", radius: o.radius == null ? 16 : o.radius,
      x: x, y: y, stroke: true, strokeColor: o.strokeColor || "#1F2937", strokeWidth: 2
    });
    const bar = this.rect(name + " Bar", w, 38, { fill: o.barColor || "#111827", radius: 16, x: x, y: y + h / 2 - 19 });
    const dots = [];
    for (let i = 0; i < 3; i++) dots.push(this.circle(name + " Dot " + i, 5, {
      fill: ["#F87171", "#FBBF24", "#34D399"][i], x: x - w / 2 + 22 + i * 16, y: y + h / 2 - 19
    }));
    const url = this.rect(name + " URL", Math.min(360, w * 0.46), 18, { fill: "#0B0F14", radius: 9, x: x, y: y + h / 2 - 19 });
    return { frame: frame, bar: bar, dots: dots, url: url };
  },

  /** Expanding sonar rings; each ring fades as it scales out. */
  sonar(name, x, y, radius, color, o) {
    o = o || {};
    const rings = [];
    const count = o.count || 3, start = o.start || 0, gap = o.gap == null ? 12 : o.gap, dur = o.duration || 36;
    for (let i = 0; i < count; i++) {
      const ring = this.circle(name + " " + (i + 1), radius, { fill: "#0B0C10", alpha: 0, x: x, y: y });
      this.stroke(ring, color || "#10B981", o.width || 3, { capStyle: 1, trim: [0, 100] });
      const s = start + i * gap;
      this.kf(ring, "scale.x", [[s, 0.45], [s + dur, 1.65]], o.ease || "SlowOut");
      this.kf(ring, "scale.y", [[s, 0.45], [s + dur, 1.65]], o.ease || "SlowOut");
      this.fade(ring, s, dur, o.from == null ? 70 : o.from, 0, "SlowOut");
      rings.push(ring);
    }
    return rings;
  },

  /** Deterministic confetti burst made from small rotating shards. */
  confetti(name, x, y, count, colors, o) {
    o = o || {};
    const bits = [];
    const palette = colors && colors.length ? colors : ["#10B981", "#38BDF8", "#F59E0B", "#F472B6", "#A78BFA"];
    const start = o.start || 0, dur = o.duration || 34;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + 0.35;
      const dist = (o.spread || 120) + (i % 4) * ((o.spread || 120) * 0.45);
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist * 0.7 - (o.lift || 20);
      const bit = this.rect(name + " " + (i + 1), i % 3 === 0 ? 10 : 6, i % 3 === 0 ? 5 : 12, {
        fill: palette[i % palette.length], radius: 2, x: x, y: y
      });
      const s = start + (i % 3) * 1.5;
      this.kf(bit, "position.x", [[s, x], [s + dur, x + dx]], "SlowOut");
      this.kf(bit, "position.y", [[s, y], [s + dur, y + dy - 30]], "SlowOut");
      this.kf(bit, "rotation", [[s, 0], [s + dur, (i % 2 ? 1 : -1) * (180 + (i % 3) * 120)]], "SlowOut");
      this.kf(bit, "scale.x", [[s, 0.001], [s + 5, 1]], "SpringOut");
      this.kf(bit, "scale.y", [[s, 0.001], [s + 5, 1]], "SpringOut");
      this.fade(bit, s + Math.max(4, dur - 14), 12, 100, 0, "SlowOut");
      bits.push(bit);
    }
    return bits;
  },

  /** Row of five rating stars, filled up to the value, optionally popping in. */
  stars(name, value, x, y, size, o) {
    o = o || {};
    const out = [];
    const n = o.count || 5, gap = size * 1.16;
    for (let i = 0; i < n; i++) {
      const star = this.star(name + " " + (i + 1), size, {
        fill: i < value ? (o.color || "#FBBF24") : (o.emptyColor || "#334155"),
        innerRadius: size * 0.24, points: 4,
        x: x + (i - (n - 1) / 2) * gap, y: y
      });
      if (o.pop) this.pop(star, o.pop[0] + i * (o.stagger || 3), o.pop[1] || 14, { from: 0.001, ease: "SpringOut" });
      out.push(star);
    }
    return out;
  },

  /** Filled status circle with a check glyph. */
  checkBadge(name, x, y, size, color, o) {
    o = o || {};
    const circle = this.circle(name, (size || 42) / 2, { fill: color || "#10B981", x: x, y: y });
    if (o.glow) this.glow(circle, color || "#10B981", o.glow, o.glowIntensity == null ? 1.6 : o.glowIntensity);
    const check = this.text(o.glyph || "\u2713", Math.round((size || 42) * 0.55), {
      color: o.textColor || "#04120C", x: x, y: y, name: name + " Check"
    });
    return { circle: circle, check: check };
  },

  /** Polyline sparkline: segments draw sequentially, endpoint dot pops. */
  sparkline(name, pts, w, h, x, y, color, width, o) {
    o = o || {};
    const arr = Array.isArray(pts) && pts.length > 1 ? pts : [20, 60, 40, 90, 70, 100];
    const vals = arr.map(function (p) { return Array.isArray(p) ? Number(p[1]) || 0 : Number(p) || 0; });
    const min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    const span = (max - min) || 1;
    const mapped = vals.map(function (v, i) {
      return [x - w / 2 + (i / (vals.length - 1)) * w, y - h / 2 + ((v - min) / span) * h * 0.8 + h * 0.1];
    });
    const segments = [];
    const stagger = o.stagger == null ? 4 : o.stagger, start = o.start || 0;
    for (let i = 1; i < mapped.length; i++) {
      const a = mapped[i - 1], b = mapped[i];
      const seg = this.line(name + " Segment " + i, a[0], a[1], b[0], b[1], width || 4, color || "#10B981", {
        draw: [start + (i - 1) * stagger, start + (i - 1) * stagger + (o.segmentDuration || 12)]
      });
      if (o.glow) this.glow(seg, color || "#10B981", o.glow, o.glowIntensity == null ? 1.4 : o.glowIntensity);
      segments.push(seg);
    }
    const last = mapped[mapped.length - 1];
    const dot = this.dot(name + " Endpoint", last[0], last[1], o.dotSize || 14, color || "#10B981", { glow: 18, glowIntensity: 1.8 });
    if (o.pop !== false) this.pop(dot, start + (mapped.length - 2) * stagger, 14, { from: 0.001, ease: "SpringOut" });
    return { segments: segments, dot: dot, points: mapped };
  },

  /** Pointer triangle + name pill grouped on a null for easy movement. */
  cursor(name, x, y, color, label, o) {
    o = o || {};
    const group = this.layer("null", name, { position: [x, y] });
    const pointer = this.poly(name + " Pointer", o.size || 30, 3, {
      fill: color || "#8B5CF6", x: x, y: y, rotation: o.rotation == null ? -35 : o.rotation
    });
    const tag = this.badge(name + " Tag", label || "Guest", x + 74, y - 20, {
      fill: color || "#8B5CF6", color: o.textColor || "#0B0C10", fontSize: o.fontSize || 12, height: o.height || 26
    });
    api.parent(pointer, group);
    api.parent(tag.pill, group);
    api.parent(tag.text, group);
    return { group: group, pointer: pointer, pill: tag.pill, label: tag.text };
  },

  /** Switch track + knob; caller animates knob x and the "on" overlay. */
  toggle(name, x, y, o) {
    o = o || {};
    const w = o.width || 84, h = o.height || 40;
    const track = this.rect(name + " Track", w, h, { fill: o.offColor || "#334155", radius: h / 2, x: x, y: y });
    const on = this.rect(name + " On", w, h, { fill: o.onColor || "#10B981", radius: h / 2, x: x, y: y });
    this.alpha(on, 0);
    const knob = this.circle(name + " Knob", h / 2 - 5, { fill: "#F8FAFC", x: x - w / 2 + h / 2, y: y });
    return { track: track, on: on, knob: knob, w: w, h: h };
  }
};
`;
