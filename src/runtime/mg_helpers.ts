/** JavaScript injected into Cavalry; this module is never executed by Node. */
export const MG_HELPERS_SOURCE = String.raw`
const _mg = {
  comp(w = 1920, h = 1080, fps = 60, endFrame = 180, bgColor = "#0B0C10") {
    const id = api.getActiveComp();
    api.set(id, { "resolution.x": w, "resolution.y": h, fps, backgroundColor: bgColor });
    api.setInFrame(id, 0);
    api.setOutFrame(id, endFrame);
    return id;
  },
  shape(type, name, attrs = {}) {
    const id = api.primitive(type, name);
    if (Object.keys(attrs).length) api.set(id, attrs);
    return id;
  },
  layer(type, name, attrs = {}) {
    const id = api.create(type, name);
    if (Object.keys(attrs).length) api.set(id, attrs);
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
    const dupId = _mg.layer("duplicator", "Duplicator");
    _mg.wire(shapeId, "id", dupId, "shapes");
    const generator = distType.endsWith("Distribution") ? distType : distType + "Distribution";
    api.setGenerator(dupId, "generator", generator);
    api.set(dupId, Object.assign({ "generator.count": count, "generator.size": size }, attrs));
    return dupId;
  },
  kf(id, attr, framesAndValues, magicEase = "SpringOut") {
    const ids = [];
    for (let i = 0; i < framesAndValues.length; i++) {
      const pair = framesAndValues[i];
      const key = { };
      key[attr] = pair[1];
      ids.push(api.keyframe(id, pair[0], key));
      if (i < framesAndValues.length - 1) api.magicEasing(id, attr, pair[0], magicEase);
    }
    return ids;
  },
  selection() {
    return api.getSelection();
  },
  sel() {
    return api.getSelection()[0];
  }
};
`;
