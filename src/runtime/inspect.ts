export type InspectMode = "selection" | "roots";

/** At most 640 ASCII bytes after JSON escaping (approximately 160 tokens). */
export const INSPECT_MAX_CHARS = 640;

export function compileInspection(mode: InspectMode): string {
  return `return (() => {
  const ids = (${mode === "selection" ? "api.getSelection()" : "api.getCompLayers(true)"}) || [];
  const read = fn => { try { return fn(); } catch (_) { return null; } };
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
  while (JSON.stringify(payload).length > ${INSPECT_MAX_CHARS} && layers.length) {
    layers.pop();
    truncated = true;
    payload.truncated = true;
  }
  return payload;
})()`;
}
