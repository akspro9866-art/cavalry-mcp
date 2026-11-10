/**
 * Canvalry-inspired utilities, OKLCH perceptual color interpolation,
 * isometric SaaS card perspective helpers, aefunctions expression helpers,
 * and damped harmonic oscillator / Spring Modifier helpers.
 * Injected into _mg before MG_RASTER_SOURCE closes the _mg object literal.
 */
export const MG_CANVALRY_SOURCE = String.raw`  hexToOklch(hex) {
    const rgb = _rb.rawColor(hex);
    const toLin = (v) => {
      const c = Math.max(0, Math.min(255, Number(v) || 0)) / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const r = toLin(rgb.r), g = toLin(rgb.g), b = toLin(rgb.b);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    const C = Math.sqrt(A * A + B * B);
    const H = C < 1e-4 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
    return {
      l: Math.round(L * 10000) / 10000,
      c: Math.round(C * 10000) / 10000,
      h: Math.round(H * 100) / 100
    };
  },

  oklchToHex(lch) {
    lch = lch || { l: 0, c: 0, h: 0 };
    const L = Number(lch.l) || 0;
    const C = Number(lch.c) || 0;
    const rad = ((Number(lch.h) || 0) * Math.PI) / 180;
    const A = C * Math.cos(rad);
    const B = C * Math.sin(rad);
    const l_ = L + 0.3963377774 * A + 0.2158037573 * B;
    const m_ = L - 0.1055613458 * A - 0.0638541728 * B;
    const s_ = L - 0.0894841775 * A - 1.2914855480 * B;
    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;
    const rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
    const toSrgb = (v) => {
      const clamped = Math.max(0, Math.min(1, v));
      const gamma = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
      let hex = Math.round(gamma * 255).toString(16).toUpperCase();
      return hex.length < 2 ? "0" + hex : hex;
    };
    return "#" + toSrgb(rLin) + toSrgb(gLin) + toSrgb(bLin);
  },

  lerpOklch(hexA, hexB, t) {
    const u = Math.max(0, Math.min(1, Number(t) || 0));
    const a = this.hexToOklch(hexA);
    const b = this.hexToOklch(hexB);
    let dh = b.h - a.h;
    if (a.c < 1e-4) dh = 0;
    else if (b.c < 1e-4) dh = 0;
    else if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
    const h = a.c < 1e-4 ? b.h : (b.c < 1e-4 ? a.h : (a.h + dh * u + 360) % 360);
    return this.oklchToHex({
      l: a.l + (b.l - a.l) * u,
      c: a.c + (b.c - a.c) * u,
      h: h
    });
  },

  oklchGradient(colors, steps) {
    const list = Array.isArray(colors) && colors.length >= 2 ? colors : ["#0F172A", "#10B981"];
    const total = Math.max(2, Math.round(Number(steps) || 5));
    const stops = [];
    for (let i = 0; i < total; i++) {
      const u = i / (total - 1);
      const scaled = u * (list.length - 1);
      const idx = Math.min(list.length - 2, Math.floor(scaled));
      const localT = scaled - idx;
      stops.push({
        color: this.lerpOklch(list[idx], list[idx + 1], localT),
        offset: Math.round(u * 1000) / 1000
      });
    }
    return stops;
  },

  parseCssGradient(cssString, opts) {
    opts = opts || {};
    const raw = String(cssString || "").trim();
    const innerMatch = raw.match(/linear-gradient\s*\(([\s\S]*)\)/i);
    const body = innerMatch ? innerMatch[1] : raw;
    const parts = body.split(",").map((s) => s.trim()).filter(Boolean);
    let angle = 180;
    let startIdx = 0;
    if (parts.length > 0) {
      const degMatch = parts[0].match(/^(-?\d+(?:\.\d+)?)deg$/i);
      if (degMatch) {
        angle = ((Number(degMatch[1]) % 360) + 360) % 360;
        startIdx = 1;
      } else if (/^to\s+/i.test(parts[0])) {
        const dir = parts[0].toLowerCase().replace(/^to\s+/, "").trim();
        const map = { top: 0, "top right": 45, right: 90, "bottom right": 135, bottom: 180, "bottom left": 225, left: 270, "top left": 315 };
        if (map[dir] != null) angle = map[dir];
        startIdx = 1;
      }
    }
    const rawStops = [];
    const stopParts = parts.slice(startIdx);
    for (let i = 0; i < stopParts.length; i++) {
      const tokens = stopParts[i].split(/\s+/).filter(Boolean);
      const color = _rb.hex(tokens[0] || "#000000");
      let offset = null;
      if (tokens[1] && tokens[1].endsWith("%")) {
        offset = Math.max(0, Math.min(1, parseFloat(tokens[1]) / 100));
      } else if (tokens[1] && isFinite(Number(tokens[1]))) {
        offset = Math.max(0, Math.min(1, Number(tokens[1])));
      }
      rawStops.push({ color: color, offset: offset });
    }
    if (rawStops.length === 0) {
      rawStops.push({ color: "#0F172A", offset: 0 }, { color: "#10B981", offset: 1 });
    }
    for (let i = 0; i < rawStops.length; i++) {
      if (rawStops[i].offset == null) {
        rawStops[i].offset = rawStops.length === 1 ? 0 : Math.round((i / (rawStops.length - 1)) * 1000) / 1000;
      }
    }
    let stops = rawStops;
    if (opts.oklch && rawStops.length >= 2) {
      const enriched = [];
      for (let i = 0; i < rawStops.length - 1; i++) {
        const a = rawStops[i];
        const b = rawStops[i + 1];
        enriched.push(a);
        const midColor = this.lerpOklch(a.color, b.color, 0.5);
        const midOffset = Math.round(((a.offset + b.offset) / 2) * 1000) / 1000;
        enriched.push({ color: midColor, offset: midOffset });
      }
      enriched.push(rawStops[rawStops.length - 1]);
      stops = enriched;
    }
    return { angle: angle, stops: stops };
  },

  cssGradient(layerId, cssString, opts) {
    opts = opts || {};
    const parsed = this.parseCssGradient(cssString, { oklch: opts.oklch !== false });
    const shaderId = _rb.layer("linearGradient", opts.name || "CSS Linear Gradient", {
      rotation: parsed.angle
    });
    const colors = parsed.stops.map((s) => s.color);
    try {
      api.set(shaderId, {
        "generator.colors": colors.map((c) => _rb.c(c)),
        "generator.stops": parsed.stops.map((s) => s.offset)
      });
    } catch (e) {}
    try {
      api.connect(shaderId, "id", layerId, "material.shader");
    } catch (e) {}
    return { shaderId: shaderId, target: layerId, angle: parsed.angle, stops: parsed.stops };
  },

  explodeShapeLayers(layerId) {
    if (!layerId) throw new Error("_mg.explodeShapeLayers requires a layerId");
    let pos = [0, 0];
    let rot = 0;
    let scl = [1, 1];
    try {
      const p = api.get(layerId, "position");
      if (Array.isArray(p)) pos = [Number(p[0]) || 0, Number(p[1]) || 0];
      else if (p && typeof p === "object") pos = [Number(p.x) || 0, Number(p.y) || 0];
      rot = Number(api.get(layerId, "rotation")) || 0;
      const s = api.get(layerId, "scale");
      if (Array.isArray(s)) scl = [Number(s[0]) || 1, Number(s[1]) || 1];
      else if (s && typeof s === "object") scl = [Number(s.x) || 1, Number(s.y) || 1];
    } catch (e) {}
    const baseName = this.__niceName(layerId) || "Shape";
    const group = _rb.layer("null", baseName + " Exploded Group", {
      position: pos,
      rotation: rot,
      scale: scl
    });
    const children = [];
    let contours = [];
    try {
      if (typeof api.getEditablePath === "function") {
        const pathObj = api.getEditablePath(layerId);
        if (pathObj && typeof pathObj.contours === "function") contours = pathObj.contours() || [];
      }
    } catch (e) {}
    const count = contours.length > 0 ? contours.length : 2;
    for (let i = 0; i < count; i++) {
      let childId;
      if (contours[i] && typeof api.createEditable === "function") {
        childId = api.createEditable(contours[i], baseName + " Part " + (i + 1));
      } else {
        childId = _rb.rect(baseName + " Part " + (i + 1), 60, 60, { x: pos[0], y: pos[1] });
      }
      try { api.parent(childId, group); } catch (e) {}
      children.push(childId);
    }
    try { _rb.hide(layerId); } catch (e) {}
    return { source: layerId, group: group, layers: children, count: children.length };
  },

  setAllImageShadersToMipmaps(filterQuality = 3) {
    const quality = Number(filterQuality) >= 0 ? Math.round(Number(filterQuality)) : 3;
    let layers = [];
    try { layers = api.getCompLayers(false) || []; } catch (e) { layers = []; }
    const updated = [];
    for (let i = 0; i < layers.length; i++) {
      const id = layers[i];
      let type = "";
      try { type = String(api.getLayerType(id) || ""); } catch (e) {}
      if (type === "imageShader" || type === "svgShape") {
        try {
          api.set(id, { filterQuality: quality, mipmaps: true });
          updated.push(id);
        } catch (e) {}
      }
    }
    return { filterQuality: quality, count: updated.length, updated: updated };
  },

  isometricCard(layerId, opts) {
    opts = opts || {};
    const rotateX = opts.rotateX == null ? 60 : Number(opts.rotateX);
    const rotateZ = opts.rotateZ == null ? -45 : Number(opts.rotateZ);
    const elevation = opts.elevation == null ? 24 : Number(opts.elevation);
    const index = opts.index == null ? 0 : Number(opts.index);
    const staggerFrames = opts.staggerFrames == null ? 6 : Number(opts.staggerFrames);
    const startFrame = (opts.startFrame == null ? 0 : Number(opts.startFrame)) + Math.round(index * staggerFrames);
    const duration = opts.duration == null ? 24 : Number(opts.duration);
    const scaleY = Math.round(Math.cos((rotateX * Math.PI) / 180) * 10000) / 10000;
    const parallaxOffset = {
      x: Math.round(elevation * 0.7071 * 100) / 100,
      y: Math.round(elevation * 0.7071 * 100) / 100
    };
    _rb.set(layerId, {
      rotation: rotateZ,
      scale: [1, scaleY]
    });
    const shadows = [];
    const shadowLayers = opts.shadowLayers == null ? 2 : Math.max(1, Math.min(4, Number(opts.shadowLayers)));
    for (let s = 0; s < shadowLayers; s++) {
      const mult = s + 1;
      const sh = _rb.layer("dropShadowFilter", "Iso Shadow " + mult, {
        shadowRadius: Math.round(elevation * 0.9 * mult),
        shadowOffsetX: Math.round(-parallaxOffset.x * 0.6 * mult),
        shadowOffsetY: Math.round(-parallaxOffset.y * 0.85 * mult),
        shadowOpacity: Math.max(12, Math.round(38 / mult)),
        shadowColor: opts.shadowColor || "#000000"
      });
      try { api.connect(sh, "id", layerId, "filters"); } catch (e) {}
      shadows.push(sh);
    }
    if (opts.animate !== false) {
      let curY = 0;
      try { curY = Number(api.get(layerId, "position.y")) || 0; } catch (e) {}
      _rb.kf(layerId, "position.y", [[startFrame, curY - elevation], [startFrame + duration, curY + parallaxOffset.y]], "SpringOut");
      _rb.fade(layerId, startFrame, Math.min(14, duration), 0, 100, "SlowOut");
    }
    return {
      layerId: layerId,
      rotateX: rotateX,
      rotateZ: rotateZ,
      scaleY: scaleY,
      elevation: elevation,
      parallaxOffset: parallaxOffset,
      startFrame: startFrame,
      shadows: shadows
    };
  },

  remap(value, inMin, inMax, outMin, outMax, clamp = true) {
    const v = Number(value) || 0;
    const a = Number(inMin) || 0;
    const b = Number(inMax) || 1;
    const c = Number(outMin) || 0;
    const d = Number(outMax) || 1;
    const span = b - a;
    let t = Math.abs(span) < 1e-12 ? 0 : (v - a) / span;
    if (clamp !== false) t = Math.max(0, Math.min(1, t));
    return c + t * (d - c);
  },

  layerRect(layerId, worldSpace = false) {
    let bb = null;
    try { bb = api.getBoundingBox(layerId, Boolean(worldSpace)); } catch (e) { bb = null; }
    const num = (v, fb) => { const n = Number(v); return isFinite(n) ? n : fb; };
    if (!bb || typeof bb !== "object") {
      return { left: -60, top: 30, width: 120, height: 60, cx: 0, cy: 0, right: 60, bottom: -30 };
    }
    const w = Array.isArray(bb) ? num(bb[2], 120) : num(bb.width != null ? bb.width : bb.w, 120);
    const h = Array.isArray(bb) ? num(bb[3], 60) : num(bb.height != null ? bb.height : bb.h, 60);
    const cx = bb.centre && typeof bb.centre === "object" ? num(bb.centre.x, 0) : num(bb.x, -w / 2) + w / 2;
    const cy = bb.centre && typeof bb.centre === "object" ? num(bb.centre.y, 0) : num(bb.y, -h / 2) + h / 2;
    return {
      left: cx - w / 2,
      top: cy + h / 2,
      right: cx + w / 2,
      bottom: cy - h / 2,
      width: w,
      height: h,
      cx: cx,
      cy: cy
    };
  },

  addLineBreaks(text, maxCharsPerLine = 36) {
    const limit = Math.max(4, Math.round(Number(maxCharsPerLine) || 36));
    const words = String(text == null ? "" : text).trim().split(/\s+/).filter(Boolean);
    if (!words.length) return "";
    const lines = [];
    let current = words[0];
    for (let i = 1; i < words.length; i++) {
      if ((current + " " + words[i]).length <= limit) {
        current += " " + words[i];
      } else {
        lines.push(current);
        current = words[i];
      }
    }
    lines.push(current);
    return lines.join("\n");
  },

  springPhysics(opts) {
    opts = opts || {};
    const stiffness = Math.max(1e-3, Number(opts.stiffness == null ? 180 : opts.stiffness));
    const damping = Math.max(1e-3, Number(opts.damping == null ? 14 : opts.damping));
    const mass = Math.max(1e-3, Number(opts.mass == null ? 1 : opts.mass));
    const omega0 = Math.sqrt(stiffness / mass);
    const zeta = damping / (2 * Math.sqrt(stiffness * mass));
    const omegaD = zeta < 1 ? omega0 * Math.sqrt(1 - zeta * zeta) : 0;
    const settlingTime = zeta > 0 ? Math.min(10, Math.round((-Math.log(0.005) / (zeta * omega0)) * 1000) / 1000) : 2;
    return {
      stiffness: stiffness,
      damping: damping,
      mass: mass,
      omega0: Math.round(omega0 * 10000) / 10000,
      dampingRatio: Math.round(zeta * 10000) / 10000,
      omegaD: Math.round(omegaD * 10000) / 10000,
      settlingTime: settlingTime
    };
  },

  attachSpringModifier(layerId, attrPath, opts) {
    opts = opts || {};
    const physics = this.springPhysics(opts);
    const modId = _rb.layer("springModifier", opts.name || "Spring Modifier", {
      stiffness: physics.stiffness,
      damping: physics.damping,
      mass: physics.mass
    });
    try {
      this.wire(modId, "id", layerId, attrPath || "position");
    } catch (e) {}
    return { modifierId: modId, target: layerId, attrPath: attrPath || "position", physics: physics };
  },
`;
