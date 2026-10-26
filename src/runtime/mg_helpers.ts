import { RB_HELPERS_SOURCE } from "../presets/rig_builders.js";

/** JavaScript injected into Cavalry; this module is never executed by Node. */
const MG_BASE_SOURCE = String.raw`
const _mg = {
  comp(w = 1920, h = 1080, fps = 60, endFrame = 180, bgColor = "#0B0C10") {
    const id = api.getActiveComp();
    api.set(id, { "resolution.x": w, "resolution.y": h, fps, backgroundColor: bgColor });
    api.setInFrame(id, 0);
    api.setOutFrame(id, endFrame);
    return id;
  },
  set(id, attrs) {
    return _rb.set(id, attrs);
  },
  shape(type, name, attrs = {}) {
    const id = api.primitive(type, name);
    if (Object.keys(attrs).length) _rb.set(id, attrs);
    return id;
  },
  layer(type, name, attrs = {}) {
    const id = api.create(type, name);
    if (Object.keys(attrs).length) _rb.set(id, attrs);
    return id;
  },
  text(str, size = 80, color = "#FFFFFF", extraAttrs = {}) {
    return _mg.layer("textShape", String(str).slice(0, 40) || "Text", Object.assign({
      text: str,
      fontSize: size,
      horizontalAlignment: 1,
      verticalAlignment: 1,
      "material.materialColor": color
    }, extraAttrs));
  },
  wire(srcId, srcAttr, dstId, dstAttr) {
    return api.connect(srcId, srcAttr, dstId, dstAttr);
  },
  deform(targetId, deformerType, name, attrs = {}) {
    const id = _mg.layer(deformerType, name, attrs);
    _mg.wire(id, "id", targetId, "deformers");
    return id;
  },
  subMesh(textId, level = 1, staggerOffset = 8) {
    const subMeshId = _mg.layer("subMesh", "Text Segments", {
      levelMode: level,
      shapeTimeOffset: staggerOffset
    });
    const staggerId = _mg.layer("stagger", "Segment Stagger", { offset: staggerOffset });
    _mg.wire(staggerId, "id", subMeshId, "shapeTimeOffset");
    _mg.wire(subMeshId, "id", textId, "deformers");
    return { subMeshId, staggerId };
  },
  duplicator(shapeId, distType = "grid", count = [5, 5], size = [1200, 700], attrs = {}) {
    const linear = String(distType).indexOf("linear") === 0;
    const dupId = _rb.dup(shapeId, {
      distribution: linear ? "linear" : "grid",
      count,
      size,
      attrs: attrs || {}
    });
    return dupId;
  },
  kf(id, attr, framesAndValues, magicEase = "SpringOut") {
    return _rb.kf(id, attr, framesAndValues, magicEase);
  },
  selection() {
    return api.getSelection();
  },
  sel() {
    return api.getSelection()[0];
  }
};
`;

/** _mg legacy DSL + _rb rig builders, injected into one script scope. */
export const MG_HELPERS_SOURCE = `${MG_BASE_SOURCE}\n${RB_HELPERS_SOURCE}`;
