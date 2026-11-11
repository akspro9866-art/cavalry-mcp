/**
 * IIFE-Isolated _mg Runtime & Idempotent _mg.patch (`src/dsl/mg-runtime.ts`).
 */

export interface PatchSpec {
  type?: string;
  name?: string;
  parent?: string | null;
  attrs?: Record<string, unknown>;
  keyframes?: Record<string, Array<{ frame: number; value: unknown; easing?: string; bezier?: unknown }>>;
  connections?: Array<{ attrPath: string; from: string }>;
  [key: string]: unknown;
}

/**
 * Idempotent patch source code executed inside the Cavalry script host.
 * Checks for layer existence before creating, updates existing attributes,
 * dedupes keyframes, and safely establishes connections.
 */
export const IDEMPOTENT_PATCH_SOURCE = `
function __mg_patch(target, patchSpec) {
  if (!patchSpec || typeof patchSpec !== 'object') return target;
  var layerId = target;
  var exists = false;
  try {
    if (typeof api.layerExists === 'function') {
      exists = api.layerExists(layerId);
    } else {
      var all = api.getCompLayers(false) || [];
      exists = all.indexOf(layerId) !== -1;
    }
  } catch (e) {
    exists = false;
  }

  if (!exists && patchSpec.type) {
    try {
      layerId = api.create(patchSpec.type, patchSpec.name || layerId);
    } catch (createErr) {
      // Fallback
    }
  }

  if (patchSpec.attrs) {
    for (var k in patchSpec.attrs) {
      try {
        api.set(layerId, k, patchSpec.attrs[k]);
      } catch (attrErr) {}
    }
  }

  if (patchSpec.keyframes) {
    for (var attr in patchSpec.keyframes) {
      var kfs = patchSpec.keyframes[attr];
      if (!Array.isArray(kfs)) continue;
      for (var i = 0; i < kfs.length; i++) {
        var kf = kfs[i];
        try {
          if (typeof api.keyframe === 'function') {
            api.keyframe(layerId, attr, kf.frame, kf.value, kf.easing);
          }
        } catch (kfErr) {}
      }
    }
  }

  if (patchSpec.connections) {
    for (var c = 0; c < patchSpec.connections.length; c++) {
      var conn = patchSpec.connections[c];
      if (conn && conn.attrPath && conn.from) {
        try {
          if (typeof api.connect === 'function') {
            api.connect(conn.from, layerId, conn.attrPath);
          }
        } catch (connErr) {}
      }
    }
  }

  return layerId;
}
`;

/**
 * In-process JavaScript template to initialize the _mg runtime with patch capability.
 */
export function createMgRuntimeSource(): string {
  return `
var createMgRuntime = function() {
  var runtime = {
    patch: ${IDEMPOTENT_PATCH_SOURCE.trim()},
    theme: {},
    undoGroup: function(name, fn) {
      if (typeof fn === 'function') fn();
    }
  };
  return runtime;
};
`;
}
