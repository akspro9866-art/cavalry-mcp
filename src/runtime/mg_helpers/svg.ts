/** SVG import, viewBox handling and path parsing. Verbatim chunk of the injected _mg DSL; mg_helpers.ts concatenates these in order. */
export const MG_SVG_SOURCE = String.raw`  svg(parent, spec) {
    spec = spec || {};
    let id = null;
    let meta = null;
    if (spec.path) {
      const asset = api.loadAsset(String(spec.path), false);
      id = api.addAssetToComp(asset);
      meta = { route: "asset", normalized: false };
    } else if (spec.d != null) {
      if (typeof api.createEditable !== "function") {
        throw new Error("_mg.svg: this Cavalry build has no api.createEditable; pass spec.path so the verified SVG asset route can run");
      }
      const parsed = this.__svgParse(spec.d, spec);
      meta = parsed.meta;
      meta.route = "path";
      id = api.createEditable(parsed.path, spec.name || "Vector");
    } else {
      throw new Error("_mg.svg requires spec.path or spec.d");
    }
    if (spec.name) {
      try { api.rename(id, String(spec.name)); } catch (e) {}
    }
    if (parent != null && parent !== id) {
      try {
        if (String(parent) !== String(api.getActiveComp())) api.parent(id, parent);
      } catch (e) {}
    }
    if (spec.pos) this.set(id, { position: { x: Number(spec.pos.x) || 0, y: Number(spec.pos.y) || 0 } });
    if (spec.scale != null) this.set(id, { scale: Number(spec.scale) || 1 });
    if (spec.report) {
      const outcome = { id: id };
      const keys = Object.keys(meta);
      for (let k = 0; k < keys.length; k++) outcome[keys[k]] = meta[keys[k]];
      return outcome;
    }
    return id;
  },

  /** "minX minY w h" | {x,y,width,height} | [x,y,w,h] -> box or null. */
  __viewBox(value) {
    if (value == null || value === "") return null;
    if (typeof value === "string") {
      const parts = value.match(/-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) || [];
      if (parts.length < 4) return null;
      return { x: Number(parts[0]), y: Number(parts[1]), width: Number(parts[2]), height: Number(parts[3]) };
    }
    if (Array.isArray(value) && value.length >= 4) {
      return { x: Number(value[0]), y: Number(value[1]), width: Number(value[2]), height: Number(value[3]) };
    }
    if (typeof value === "object") {
      const box = {
        x: Number(value.x != null ? value.x : value.minX),
        y: Number(value.y != null ? value.y : value.minY),
        width: Number(value.width != null ? value.width : value.w),
        height: Number(value.height != null ? value.height : value.h)
      };
      if (!(isFinite(box.x) && isFinite(box.y) && isFinite(box.width) && isFinite(box.height))) return null;
      return box;
    }
    return null;
  },

  /**
   * Parse the SVG path subset VTracer and friends emit into a cavalry.Path, with
   * the normalisation vector art needs before it sits on a layer.
   *
   * opts = { viewBox?, center?, scaleTo?, flipY? }
   *
   *   viewBox  Cavalry anchors an editable at its own coordinate origin, so art
   *            from an SVG whose viewBox does not start at 0,0 would otherwise sit
   *            offset by that amount; the min corner is re-mapped to (0,0).
   *   center   anchors the control bounds on the layer origin instead, which is
   *            what a pivot-driven pop or rotation wants; it replaces the viewBox
   *            shift.
   *   scaleTo  fits the longest axis of the bounds to this many units.
   *   flipY    mirrors y, for SVG art (y grows down) landing in a comp whose y
   *            grows up. Opt-in, because which way is upright is the comp's call.
   *
   * Sub-paths are counted so compound shapes — counters, holes, multi-contour
   * logos — are visible to the caller, and commands this parser cannot express
   * (arcs, anything exotic) are reported under unsupported with their
   * parameters skipped whole, instead of leaking numbers into the next command as
   * stray line segments the way a silent drop used to.
   */
  __svgParse(d, opts) {
    opts = opts || {};
    if (typeof cavalry === "undefined" || typeof cavalry.Path !== "function") {
      throw new Error("_mg.svg: new cavalry.Path() is unavailable in this build; pass a .svg asset path instead");
    }
    const path = new cavalry.Path();
    if (typeof path.moveTo !== "function" || typeof path.lineTo !== "function") {
      throw new Error("_mg.svg: cavalry.Path has no moveTo/lineTo in this build; pass a .svg asset path instead");
    }
    const tokens = String(d).match(/[a-zA-Z]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) || [];
    let i = 0;
    let cmd = "M";
    let x = 0, y = 0, startX = 0, startY = 0;
    let lastCx = null, lastCy = null;
    let subpaths = 0;
    let skip = false;
    const ops = [];
    const unsupported = [];
    const limits = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    const num = () => { const value = Number(tokens[i]); i += 1; return isFinite(value) ? value : 0; };
    const see = (px, py) => {
      if (px < limits.minX) limits.minX = px;
      if (px > limits.maxX) limits.maxX = px;
      if (py < limits.minY) limits.minY = py;
      if (py > limits.maxY) limits.maxY = py;
    };
    // Pass 1: resolve every command to absolute pen coordinates, so relative
    // runs, implicit repeats and reflected handles are all in one place before
    // any transform is applied.
    while (i < tokens.length) {
      if (/^[a-zA-Z]$/.test(tokens[i])) {
        cmd = tokens[i];
        i++;
        skip = false;
        if (cmd === "Z" || cmd === "z") {
          ops.push({ c: "Z" });
          x = startX; y = startY;
          lastCx = null; lastCy = null;
          continue;
        }
        const probe = cmd.toUpperCase();
        if (probe !== "M" && probe !== "L" && probe !== "H" && probe !== "V"
          && probe !== "C" && probe !== "S" && probe !== "Q" && probe !== "T") {
          // Includes A/a (elliptical arcs) and anything else this build cannot
          // express: the command is reported and its numeric parameters skipped.
          unsupported.push(cmd);
          skip = true;
          continue;
        }
      }
      if (skip) { i++; continue; }
      const upper = cmd.toUpperCase();
      const rel = cmd !== upper;
      if (upper === "M" || upper === "L") {
        const nx = num(), ny = num();
        x = rel ? x + nx : nx;
        y = rel ? y + ny : ny;
        see(x, y);
        if (upper === "M") {
          subpaths += 1;
          startX = x; startY = y;
          ops.push({ c: "M", x: x, y: y });
          cmd = rel ? "l" : "L";
        } else ops.push({ c: "L", x: x, y: y });
        lastCx = null; lastCy = null;
      } else if (upper === "H") {
        const nx = num();
        x = rel ? x + nx : nx;
        see(x, y);
        ops.push({ c: "L", x: x, y: y });
        lastCx = null; lastCy = null;
      } else if (upper === "V") {
        const ny = num();
        y = rel ? y + ny : ny;
        see(x, y);
        ops.push({ c: "L", x: x, y: y });
        lastCx = null; lastCy = null;
      } else if (upper === "C" || upper === "S") {
        let x1, y1;
        if (upper === "S") {
          // Smooth cubic: the first handle mirrors the previous curve's second.
          x1 = lastCx == null ? x : 2 * x - lastCx;
          y1 = lastCy == null ? y : 2 * y - lastCy;
        } else {
          x1 = rel ? x + num() : num();
          y1 = rel ? y + num() : num();
        }
        const x2 = rel ? x + num() : num();
        const y2 = rel ? y + num() : num();
        const nx = rel ? x + num() : num();
        const ny = rel ? y + num() : num();
        ops.push({ c: "C", x1: x1, y1: y1, x2: x2, y2: y2, x: nx, y: ny });
        see(x1, y1); see(x2, y2); see(nx, ny);
        lastCx = x2; lastCy = y2;
        x = nx; y = ny;
      } else if (upper === "Q" || upper === "T") {
        let qx, qy;
        if (upper === "T") {
          qx = lastCx == null ? x : 2 * x - lastCx;
          qy = lastCy == null ? y : 2 * y - lastCy;
        } else {
          qx = rel ? x + num() : num();
          qy = rel ? y + num() : num();
        }
        const nx = rel ? x + num() : num();
        const ny = rel ? y + num() : num();
        ops.push({ c: "Q", qx: qx, qy: qy, x: nx, y: ny });
        see(qx, qy); see(nx, ny);
        lastCx = qx; lastCy = qy;
        x = nx; y = ny;
      } else {
        i++;
      }
    }
    const hasBounds = isFinite(limits.minX) && isFinite(limits.maxX);
    const box = this.__viewBox(opts.viewBox);
    let ox = box && isFinite(box.x) ? box.x : 0;
    let oy = box && isFinite(box.y) ? box.y : 0;
    if (opts.center && hasBounds) {
      ox = (limits.minX + limits.maxX) / 2;
      oy = (limits.minY + limits.maxY) / 2;
    }
    let scale = 1;
    if (opts.scaleTo != null && hasBounds) {
      const span = Math.max(limits.maxX - limits.minX, limits.maxY - limits.minY);
      if (span > 0 && Number(opts.scaleTo) > 0) scale = Number(opts.scaleTo) / span;
    }
    const flip = opts.flipY === true;
    const map = (px, py) => [(px - ox) * scale, (flip ? oy - py : py - oy) * scale];
    // Pass 2: hand the normalised geometry to Cavalry.
    for (let k = 0; k < ops.length; k++) {
      const op = ops[k];
      if (op.c === "Z") {
        if (typeof path.closePath === "function") path.closePath();
        else if (typeof path.close === "function") path.close();
      } else if (op.c === "M") {
        const p = map(op.x, op.y);
        path.moveTo(p[0], p[1]);
      } else if (op.c === "L") {
        const p = map(op.x, op.y);
        path.lineTo(p[0], p[1]);
      } else if (op.c === "C") {
        if (typeof path.curveTo !== "function") throw new Error("_mg.svg: cavalry.Path has no curveTo in this build");
        const a = map(op.x1, op.y1);
        const b = map(op.x2, op.y2);
        const p = map(op.x, op.y);
        path.curveTo(a[0], a[1], b[0], b[1], p[0], p[1]);
      } else if (op.c === "Q") {
        const a = map(op.qx, op.qy);
        const p = map(op.x, op.y);
        if (typeof path.quadTo === "function") path.quadTo(a[0], a[1], p[0], p[1]);
        else if (typeof path.curveTo === "function") path.curveTo(a[0], a[1], p[0], p[1], p[0], p[1]);
        else throw new Error("_mg.svg: cavalry.Path has no quadratic/curve support in this build");
      }
    }
    const bounds = hasBounds
      ? {
        x: (limits.minX - ox) * scale,
        y: (flip ? oy - limits.maxY : limits.minY - oy) * scale,
        width: (limits.maxX - limits.minX) * scale,
        height: (limits.maxY - limits.minY) * scale
      }
      : null;
    return {
      path: path,
      meta: {
        subpaths: subpaths,
        commands: ops.length,
        unsupported: unsupported,
        viewBox: box,
        center: opts.center === true,
        flipY: flip,
        scale: Math.round(scale * 1e6) / 1e6,
        bounds: bounds
      }
    };
  },

  /** Path only — kept so existing callers and presets see the previous shape. */
  __svgPath(d, opts) {
    return this.__svgParse(d, opts).path;
  },

  /** The currently applied theme, or null. */
`;
