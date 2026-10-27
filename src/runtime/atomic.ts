import { MG_HELPERS_SOURCE } from "./mg_helpers.js";

export const ATOMIC_SCRIPT_MARKER = "/* cavalry-mcp:atomic */";

export interface AtomicTelemetry {
  seq: string;
  statePath: string;
}

/**
 * One isolated scope and one Undo step; Stallion captures return/errors.
 *
 * When telemetry is enabled the wrapper snapshots the active comp before the
 * script, and after the Undo group has closed writes a compact state file:
 * status, error stack, created layer ids, selection, comp info and world-space
 * bounding boxes. The write happens in a `finally`, outside the Undo group, so
 * a failed script still leaves usable spatial state behind.
 */
export function wrapAtomicScript(code: string, withHelpers = false, telemetry?: AtomicTelemetry): string {
  const statePathLiteral = telemetry ? JSON.stringify(telemetry.statePath) : "null";
  const seqLiteral = telemetry ? JSON.stringify(telemetry.seq) : "null";
  return `${ATOMIC_SCRIPT_MARKER}
__result = (() => {
  const __statePath = ${statePathLiteral};
  const __seq = ${seqLiteral};
  const __read = (fn) => { try { return fn(); } catch (_) { return null; } };
  const __top = () => {
    const ids = __read(() => api.getCompLayers(true));
    return Array.isArray(ids) ? ids : [];
  };
  const __compInfo = () => {
    const id = __read(() => api.getActiveComp());
    if (!id) return null;
    const fps = __read(() => api.get(id, "fps"));
    const resolution = __read(() => api.get(id, "resolution"));
    const startRaw = __read(() => api.get(id, "startFrame"));
    const endRaw = __read(() => api.get(id, "endFrame"));
    const startFrame = startRaw == null ? __read(() => api.getInFrame(id)) : startRaw;
    const endFrame = endRaw == null ? __read(() => api.getOutFrame(id)) : endRaw;
    let res = null;
    if (Array.isArray(resolution)) res = [Number(resolution[0]) || 0, Number(resolution[1]) || 0];
    else if (resolution && typeof resolution === "object") res = [Number(resolution.x) || 0, Number(resolution.y) || 0];
    else if (resolution != null) {
      const wh = String(resolution).split("x");
      if (wh.length === 2) res = [Number(wh[0]) || 0, Number(wh[1]) || 0];
    }
    return {
      id: String(id),
      name: __read(() => api.getNiceName(id)),
      fps: fps == null ? null : Number(fps),
      startFrame: startFrame == null ? null : Number(startFrame),
      endFrame: endFrame == null ? null : Number(endFrame),
      resolution: res,
      width: res ? res[0] : null,
      height: res ? res[1] : null
    };
  };
  const __state = __statePath ? {
    seq: __seq,
    status: "ok",
    errorStack: null,
    createdLayerIds: [],
    activeSelection: [],
    compInfo: null,
    boundingBoxes: {},
    modifiedLayerIds: []
  } : null;
  const __before = __state ? __top() : [];
  const __started = Date.now();
  const __finalize = () => {
    if (!__state) return;
    try {
      const __after = __top();
      const __seen = {};
      for (let i = 0; i < __before.length; i++) __seen[__before[i]] = true;
      for (let i = 0; i < __after.length; i++) {
        if (!__seen[__after[i]]) __state.createdLayerIds.push(__after[i]);
      }
      __state.activeSelection = __read(() => api.getSelection()) || [];
      __state.compInfo = __compInfo();
      const __ids = __state.createdLayerIds.concat(__state.activeSelection.filter((id) => __after.indexOf(id) >= 0));
      const __boxed = {};
      for (let i = 0; i < __ids.length && i < 50; i++) {
        const id = __ids[i];
        if (__boxed[id]) continue;
        __boxed[id] = true;
        const bb = __read(() => api.getBoundingBox(id, true));
        if (bb && typeof bb === "object") {
          const box = {
            x: Number(bb.x) || 0,
            y: Number(bb.y) || 0,
            width: Number(bb.width) || 0,
            height: Number(bb.height) || 0
          };
          if (bb.centre && typeof bb.centre === "object") {
            box.centre = { x: Number(bb.centre.x) || 0, y: Number(bb.centre.y) || 0 };
          }
          __state.boundingBoxes[id] = box;
        }
      }
      __state.durationMs = Date.now() - __started;
      __state.writtenAt = new Date().toISOString();
      try {
        globalThis.__cavalryMcpState = __state;
        globalThis.__stallionState = __state;
      } catch (_) {}
      try {
        api.writeToFile(__statePath, JSON.stringify(__state), true);
      } catch (__writeErr) {
        try {
          api.writeToFile(__statePath, JSON.stringify({
            seq: __seq,
            status: __state.status,
            errorStack: __state.errorStack,
            writeFailed: String(__writeErr)
          }), true);
        } catch (_) {}
      }
    } catch (_) {}
  };
  const __undo = typeof api.startUndoGroup === "function";
  if (__undo) api.startUndoGroup("AI Motion Batch");
  let __value;
  try {
    __value = (() => {
      ${withHelpers ? MG_HELPERS_SOURCE : ""}
      return (() => {
${code}
      })();
    })();
  } catch (__err) {
    if (__state) {
      __state.status = "error";
      __state.errorStack = __err && __err.stack ? String(__err.stack) : String(__err);
    }
    throw __err;
  } finally {
    try {
      if (__undo) api.endUndoGroup();
    } finally {
      __finalize();
    }
  }
  if (typeof __result === "undefined") __result = __value;
  return __result;
})()`;
}

/** Legacy Stallion fallback: the same result envelope via api.writeToFile. */
export function wrapLegacyResult(atomicCode: string, seq: string, resultPath: string): string {
  return `(function () {
var __out = { ok: true, seq: ${JSON.stringify(seq)} };
var __result;
try {
  var __returned = ${atomicCode};
  if (typeof __result === "undefined") __result = __returned;
  if (typeof __result !== "undefined") __out.result = __result;
} catch (err) {
  __out.ok = false;
  __out.error = err.toString();
  __out.stack = err.stack;
}
try {
  api.writeToFile(${JSON.stringify(resultPath)}, JSON.stringify(__out), true);
} catch (err) {
  try { api.writeToFile(${JSON.stringify(resultPath)}, JSON.stringify({ ok: false, seq: ${JSON.stringify(seq)}, error: err.toString(), stack: err.stack, writeFailed: err.toString() }), true); } catch (_) {}
}
})()`;
}
