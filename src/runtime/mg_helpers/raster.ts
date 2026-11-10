/** Raster mapping, fitToBounds and selection readback. Verbatim chunk of the injected _mg DSL; mg_helpers.ts concatenates these in order. */
export const MG_RASTER_SOURCE = String.raw`  fromRaster(x, y, compWidth, compHeight) {
    let rx = x;
    let ry = y;
    let cw = compWidth;
    let ch = compHeight;
    if (x && typeof x === "object") {
      if (Array.isArray(x)) { rx = x[0]; ry = x[1]; }
      else { rx = x.x; ry = x.y; }
      cw = y;
      ch = compWidth;
    }
    const px = Number(rx);
    const py = Number(ry);
    if (!isFinite(px) || !isFinite(py)) throw new Error("_mg.fromRaster: x/y must be finite numbers");
    const width = Number(cw) > 0 ? Number(cw) : 1920;
    const height = Number(ch) > 0 ? Number(ch) : 1080;
    return { x: px - width / 2, y: height / 2 - py };
  },

  /**
   * Fit one layer's measured world bounds to a target box, synchronously.
   *
   * Geometry is resized intrinsically first — basicShape generator.dimensions
   * or generator.radius, textShape fontSize — then the residual is closed with
   * the layer's scale, so a rotated or unusual layer still converges. The
   * position is corrected from the freshly measured box after every resize,
   * never from assumed pivot maths: an uncentred pivot or an intrinsic text
   * offset is simply a delta. getBoundingBox is evaluated at the current
   * playhead, so callers fit static layout before animation is written.
   *
   * targetBox: {x,y,width,height} where x/y is the min corner of the box in
   * getBoundingBox's space (Cavalry-centred, y up), [x,y,width,height], or
   * {centre:{x,y},width,height}. options.space "raster" interprets the box as
   * top-left, y-down video pixels and needs compWidth/compHeight (or reads the
   * active comp resolution). layerId also accepts an "@alias" registered by
   * _mg.alias, a semantic id, or a slug; the resolved live id is reported.
   *
   * options: { space, compWidth, compHeight, tolerance=0.5, maxPasses=5,
   *            intrinsic=true, preserveAspect=false, fitWidth=true }
   * Returns { ok, layerId, type, space, target, box, passes, error, applied }.
   * A parented layer whose parent transform is not identity can need extra
   * passes: the same correction is applied and the residual is reported rather
   * than assumed away.
   */
  fitToBounds(layerId, targetBox, options) {
    const opts = options || {};
    const requested = String(layerId == null ? "" : layerId).trim();
    if (requested) {
      let hits = [];
      try { hits = this.find(requested); } catch (e) { hits = []; }
      if (hits.length) layerId = hits[0];
      else if (requested.charAt(0) === "@") throw new Error("_mg.fitToBounds: no layer matches alias " + requested);
    }
    const num = function (v, fallback) { const n = Number(v); return isFinite(n) ? n : fallback; };
    const readBox = function () {
      let bb = null;
      try { bb = api.getBoundingBox(layerId, true); } catch (e) { return null; }
      if (!bb || typeof bb !== "object") return null;
      const arr = Array.isArray(bb);
      const width = arr ? num(bb[2], 0) : num(bb.width != null ? bb.width : bb.w, 0);
      const height = arr ? num(bb[3], 0) : num(bb.height != null ? bb.height : bb.h, 0);
      const x = arr ? num(bb[0], 0) : num(bb.x, 0);
      const y = arr ? num(bb[1], 0) : num(bb.y, 0);
      if (!(width > 0) || !(height > 0)) return null;
      return { x: x, y: y, width: width, height: height };
    };
    const readPoint = function (path, fallback) {
      let v = null;
      try { v = api.get(layerId, path); } catch (e) { v = null; }
      if (Array.isArray(v)) return [num(v[0], fallback[0]), num(v[1], fallback[1])];
      if (v && typeof v === "object") return [num(v.x, fallback[0]), num(v.y, fallback[1])];
      return [fallback[0], fallback[1]];
    };
    const readAny = function (path) {
      try { return api.get(layerId, path); } catch (e) { return undefined; }
    };
    const writePoint = function (path, x, y) {
      const attrs = {};
      attrs[path] = [x, y];
      _mg.set(layerId, attrs);
    };
    const write = function (attrs) { _mg.set(layerId, attrs); };

    // ---- target box ------------------------------------------------------
    let spec = targetBox;
    if (Array.isArray(spec)) spec = { x: spec[0], y: spec[1], width: spec[2], height: spec[3] };
    if (!spec || typeof spec !== "object") {
      throw new Error("_mg.fitToBounds: targetBox must be {x,y,width,height} or [x,y,width,height]");
    }
    const tw = num(spec.width, 0);
    const th = num(spec.height, 0);
    if (!(tw > 0) || !(th > 0)) throw new Error("_mg.fitToBounds: targetBox needs positive width and height");
    let tx;
    let ty;
    if (spec.centre && typeof spec.centre === "object") {
      tx = num(spec.centre.x, 0) - tw / 2;
      ty = num(spec.centre.y, 0) - th / 2;
    } else if (spec.cx != null || spec.cy != null) {
      tx = num(spec.cx, 0) - tw / 2;
      ty = num(spec.cy, 0) - th / 2;
    } else {
      tx = num(spec.x, 0);
      ty = num(spec.y, 0);
    }
    const space = String(opts.space || "comp");
    if (space === "raster") {
      let cw = num(opts.compWidth, 0);
      let ch = num(opts.compHeight, 0);
      if (!(cw > 0) || !(ch > 0)) {
        let compId = null;
        try { compId = api.getActiveComp(); } catch (e) { compId = null; }
        let res = null;
        if (compId) { try { res = api.get(compId, "resolution"); } catch (e) { res = null; } }
        const rw = Array.isArray(res) ? num(res[0], 0) : (res && typeof res === "object" ? num(res.x != null ? res.x : res.width, 0) : 0);
        const rh = Array.isArray(res) ? num(res[1], 0) : (res && typeof res === "object" ? num(res.y != null ? res.y : res.height, 0) : 0);
        cw = cw > 0 ? cw : (rw > 0 ? rw : 1920);
        ch = ch > 0 ? ch : (rh > 0 ? rh : 1080);
      }
      // Raster y is the top edge and grows down; getBoundingBox y is the min
      // corner of the box and grows up.
      const rasterY = ty;
      tx = tx - cw / 2;
      ty = ch / 2 - rasterY - th;
    }

    const tolerance = opts.tolerance != null ? Math.max(0, num(opts.tolerance, 0.5)) : 0.5;
    let maxPasses = Math.round(num(opts.maxPasses, 5));
    maxPasses = Math.max(1, Math.min(10, maxPasses));
    const preserveAspect = opts.preserveAspect === true;
    const intrinsic = opts.intrinsic !== false;
    const fitWidth = opts.fitWidth !== false;

    let type = "";
    try { type = String(api.getLayerType(layerId) || ""); } catch (e) { type = ""; }
    let box = readBox();
    if (!box) throw new Error("_mg.fitToBounds: layer " + layerId + " has no measurable bounding box");
    const applied = { intrinsic: "none", scale: false, position: false };
    let passes = 0;
    let fits = false;
    for (; passes < maxPasses; passes++) {
      const errX = Math.abs(tx - box.x);
      const errY = Math.abs(ty - box.y);
      const errW = Math.abs(box.width - tw);
      const errH = Math.abs(box.height - th);
      if (errX <= tolerance && errY <= tolerance && (!fitWidth || errW <= tolerance) && errH <= tolerance) {
        fits = true;
        break;
      }

      if (passes === 0 && intrinsic) {
        const sx = tw / box.width;
        const sy = th / box.height;
        if (type === "textShape") {
          const size = num(readAny("fontSize"), 0);
          if (size > 0) {
            const ratio = preserveAspect ? Math.min(sx, sy) : sy;
            write({ fontSize: size * ratio });
            applied.intrinsic = "fontSize";
            box = readBox() || box;
          }
        } else {
          const dims = readAny("generator.dimensions");
          const radius = readAny("generator.radius");
          const dimW = Array.isArray(dims) ? num(dims[0], 0) : (dims && typeof dims === "object" ? num(dims.x != null ? dims.x : dims.width, 0) : 0);
          const dimH = Array.isArray(dims) ? num(dims[1], 0) : (dims && typeof dims === "object" ? num(dims.y != null ? dims.y : dims.height, 0) : 0);
          const radX = Array.isArray(radius) ? num(radius[0], 0) : (radius && typeof radius === "object" ? num(radius.x != null ? radius.x : radius.width, 0) : 0);
          const radY = Array.isArray(radius) ? num(radius[1], 0) : (radius && typeof radius === "object" ? num(radius.y != null ? radius.y : radius.height, 0) : (typeof radius === "number" ? radius : 0));
          const ux = preserveAspect ? Math.min(sx, sy) : sx;
          const uy = preserveAspect ? ux : sy;
          if (dimW > 0 && dimH > 0) {
            write({ "generator.dimensions": [dimW * ux, dimH * uy] });
            applied.intrinsic = "dimensions";
            box = readBox() || box;
          } else if (radX > 0 && radY > 0) {
            write({ "generator.radius": [radX * ux, radY * uy] });
            applied.intrinsic = "radius";
            box = readBox() || box;
          } else if (typeof radius === "number" && radius > 0) {
            const u = Math.min(sx, sy);
            write({ "generator.radius": radius * u });
            applied.intrinsic = "radius";
            box = readBox() || box;
          }
        }
      }

      // Residual after the intrinsic resize. A rotated layer's AABB does not
      // scale exactly linearly, so this runs on every pass and the loop above
      // decides when the residual is small enough.
      const scaleX = preserveAspect ? Math.min(tw / box.width, th / box.height) : tw / box.width;
      const scaleY = preserveAspect ? scaleX : th / box.height;
      if (Math.abs(scaleX - 1) > 0.0001 || Math.abs(scaleY - 1) > 0.0001) {
        const cur = readPoint("scale", [1, 1]);
        writePoint("scale", cur[0] * scaleX, cur[1] * scaleY);
        applied.scale = true;
        box = readBox() || box;
      }

      // Re-measured box → exact position delta. A stale box must never be used
      // for this: generator and scale edits move the box around the pivot.
      const pos = readPoint("position", [0, 0]);
      const dx = tx - box.x;
      const dy = ty - box.y;
      if (Math.abs(dx) > 0.0001 || Math.abs(dy) > 0.0001) {
        writePoint("position", pos[0] + dx, pos[1] + dy);
        applied.position = true;
        box = readBox() || box;
      }
    }
    // One last measurement when the loop exited by iteration count, so the
    // reported box is always the scene's current state.
    box = readBox() || box;
    const error = { x: tx - box.x, y: ty - box.y, width: box.width - tw, height: box.height - th };
    const ok =
      Math.abs(error.x) <= tolerance &&
      Math.abs(error.y) <= tolerance &&
      Math.abs(error.width) <= tolerance &&
      Math.abs(error.height) <= tolerance;
    return {
      ok: ok,
      layerId: layerId,
      type: type,
      space: space,
      target: { x: tx, y: ty, width: tw, height: th },
      box: box,
      passes: Math.max(1, passes),
      error: error,
      applied: applied
    };
  },

  selection() {
    return api.getSelection();
  },
  sel() {
    return api.getSelection()[0];
  }
};
`;
