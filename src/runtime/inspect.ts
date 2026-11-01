export type InspectMode = "selection" | "roots";

/** At most 640 ASCII bytes after JSON escaping (approximately 160 tokens). */
export const INSPECT_MAX_CHARS = 640;

/** Budget when beat sampling is requested (per-frame boxes and transforms). */
export const INSPECT_SAMPLE_MAX_CHARS = 6_000;
export const INSPECT_MAX_SAMPLE_FRAMES = 16;
export const INSPECT_MAX_SAMPLE_LAYERS = 50;

export interface InspectOptions {
  /** Frames to evaluate world-space state at (bounded, deduped, sorted). */
  sampleFrames?: Array<number>;
  /** Extra layer ids to sample beyond the selection/roots scope. */
  sampleIds?: Array<string>;
}

/**
 * Inspect script. Without sampleFrames it returns the compact layer list as
 * before. With sampleFrames it additionally evaluates, per requested frame,
 * each sampled layer's world-space bounding box, world transform, effective
 * opacity and incoming attribute connections — the evaluated beat telemetry
 * the perceptual loop drives its corrections from.
 */
export function compileInspection(mode: InspectMode, options: InspectOptions = {}): string {
  const frames = (options.sampleFrames ?? [])
    .map(frame => Math.round(Number(frame)))
    .filter(frame => Number.isFinite(frame))
    .slice(0, INSPECT_MAX_SAMPLE_FRAMES)
    .sort((a, b) => a - b);
  const extraIds = (options.sampleIds ?? []).map(id => String(id)).slice(0, INSPECT_MAX_SAMPLE_LAYERS);
  const budget = frames.length ? INSPECT_SAMPLE_MAX_CHARS : INSPECT_MAX_CHARS;
  const sampleBlock = frames.length
    ? `
  const sampleFrames = ${JSON.stringify(frames)};
  const extraIds = ${JSON.stringify(extraIds)};
  const seen = {};
  const sampleIds = [];
  for (let e = 0; e < extraIds.length; e++) {
    if (!seen[extraIds[e]]) { seen[extraIds[e]] = true; sampleIds.push(extraIds[e]); }
  }
  for (let l = 0; l < layers.length && sampleIds.length < ${INSPECT_MAX_SAMPLE_LAYERS}; l++) {
    if (!seen[layers[l].id]) { seen[layers[l].id] = true; sampleIds.push(layers[l].id); }
  }
  const samples = {};
  const prevFrame = read(() => api.getFrame());
  for (let f = 0; f < sampleFrames.length; f++) {
    const frame = sampleFrames[f];
    read(() => api.setFrame(frame));
    const frameState = {};
    for (let s = 0; s < sampleIds.length; s++) {
      const sid = sampleIds[s];
      const bbox = read(() => api.getBoundingBox(sid, true));
      const pos = read(() => api.get(sid, "position"));
      const scl = read(() => api.get(sid, "scale"));
      const entry = {
        bbox: bbox && typeof bbox === "object" ? {
          x: Number(bbox.x) || 0, y: Number(bbox.y) || 0,
          width: Number(bbox.width) || 0, height: Number(bbox.height) || 0
        } : null,
        transform: {
          position: Array.isArray(pos) ? [Number(pos[0]) || 0, Number(pos[1]) || 0] : null,
          scale: Array.isArray(scl) ? [Number(scl[0]) || 0, Number(scl[1]) || 0] : null,
          rotation: read(() => Number(api.get(sid, "rotation"))) || 0
        },
        opacity: read(() => Number(api.get(sid, "opacity"))),
        connections: read(() => api.getInConnectedAttributes(sid)) || []
      };
      frameState[sid] = entry;
    }
    samples[String(frame)] = frameState;
  }
  if (prevFrame != null) read(() => api.setFrame(prevFrame));
`
    : "";
  return `return (() => {
  const read = fn => { try { return fn(); } catch (_) { return null; } };
  const ids = (${mode === "selection" ? "api.getSelection()" : "api.getCompLayers(true)"}) || [];
  const layers = [];
  let truncated = false;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const niceName = read(() => api.getNiceName(id));
    layers.push({
      id,
      name: read(() => api.get(id, "name")) || niceName,
      niceName,
      type: read(() => api.getLayerType(id))
    });
  }
  const payload = { mode: ${JSON.stringify(mode)}, layers, truncated: false };
  ${sampleBlock}${
    frames.length
      ? `  payload.samples = samples;
  payload.sampledFrames = sampleFrames;
`
      : ""
  }
  while (JSON.stringify(payload).length > ${budget} && layers.length) {
    layers.pop();
    truncated = true;
    payload.truncated = true;
  }
  return payload;
})()`;
}
