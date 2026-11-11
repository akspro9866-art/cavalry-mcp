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
  var aliases = (typeof globalThis !== 'undefined')
    ? (globalThis.__mg_aliases || (globalThis.__mg_aliases = {}))
    : {};
  function resolveLayerId(ref) {
    if (!ref) return '';
    var key = String(ref);
    if (aliases[key]) {
      try {
        if (typeof api.layerExists !== 'function' || api.layerExists(aliases[key])) {
          return aliases[key];
        }
      } catch (aliasErr) {}
    }
    try {
      if (typeof api.layerExists === 'function' && api.layerExists(key)) {
        return key;
      }
      if (typeof api.getCompLayers === 'function') {
        var all = api.getCompLayers(false) || [];
        if (all.indexOf(key) !== -1) return key;
        for (var li = 0; li < all.length; li++) {
          var cid = all[li];
          var cname = '';
          try {
            cname = typeof api.getNiceName === 'function' ? String(api.getNiceName(cid)) : String(api.get(cid, 'name'));
          } catch (nameErr) {}
          if (cname === key) return cid;
        }
      }
    } catch (lookupErr) {}
    return '';
  }

  var rawTarget = String(target == null ? '' : target);
  var targetName = typeof patchSpec.name === 'string' && patchSpec.name ? patchSpec.name : rawTarget;
  var layerId = resolveLayerId(rawTarget) || (targetName !== rawTarget ? resolveLayerId(targetName) : '');
  var exists = Boolean(layerId);

  if (!exists && patchSpec.type) {
    var primTypes = { rectangle: 1, ellipse: 1, circle: 1, polygon: 1, star: 1, capsule: 1, roundedRectangle: 1 };
    try {
      if (primTypes[patchSpec.type] && typeof api.primitive === 'function') {
        layerId = api.primitive(patchSpec.type, targetName);
      } else {
        layerId = api.create(patchSpec.type, targetName);
      }
    } catch (createErr) {}
  }

  if (layerId) {
    if (rawTarget) aliases[rawTarget] = layerId;
    if (targetName) aliases[targetName] = layerId;
  }

  if (patchSpec.parent !== undefined) {
    try {
      if (patchSpec.parent === null) {
        if (typeof api.unParent === 'function') api.unParent(layerId);
      } else if (typeof api.parent === 'function') {
        var resolvedParent = resolveLayerId(patchSpec.parent) || patchSpec.parent;
        api.parent(layerId, resolvedParent);
      }
    } catch (parentErr) {}
  }

  if (patchSpec.attrs && typeof patchSpec.attrs === 'object') {
    try {
      api.set(layerId, patchSpec.attrs);
    } catch (batchAttrErr) {
      for (var k in patchSpec.attrs) {
        try {
          var singleAttr = {};
          singleAttr[k] = patchSpec.attrs[k];
          api.set(layerId, singleAttr);
        } catch (attrErr) {}
      }
    }
  }

  if (patchSpec.keyframes && typeof patchSpec.keyframes === 'object') {
    for (var attr in patchSpec.keyframes) {
      var kfs = patchSpec.keyframes[attr];
      if (!Array.isArray(kfs)) continue;
      var existingFrames = [];
      try {
        if (typeof api.getKeyframeTimes === 'function') {
          existingFrames = api.getKeyframeTimes(layerId, attr) || [];
        }
      } catch (kfListErr) {}
      for (var i = 0; i < kfs.length; i++) {
        var kf = kfs[i];
        if (!kf || typeof kf !== 'object') continue;
        try {
          if (typeof api.deleteKeyframe === 'function') {
            try { api.deleteKeyframe(layerId, attr, kf.frame); } catch (delErr) {}
          } else if (existingFrames.indexOf(kf.frame) !== -1 && typeof api.removeKeyframe === 'function') {
            try { api.removeKeyframe(layerId, attr, kf.frame); } catch (rmErr) {}
          }
          if (typeof api.keyframe === 'function') {
            var kfAttrs = {};
            kfAttrs[attr] = kf.value;
            api.keyframe(layerId, kf.frame, kfAttrs);
            if (existingFrames.indexOf(kf.frame) === -1) existingFrames.push(kf.frame);
          }
          if (kf.easing && typeof api.magicEasing === 'function') {
            api.magicEasing(layerId, attr, kf.frame, kf.easing);
          }
        } catch (kfErr) {}
      }
    }
  }

  if (Array.isArray(patchSpec.connections)) {
    for (var c = 0; c < patchSpec.connections.length; c++) {
      var conn = patchSpec.connections[c];
      if (conn && conn.attrPath && conn.from) {
        try {
          var fromStr = String(conn.from);
          var dotIdx = fromStr.lastIndexOf('.');
          var rawSrc = dotIdx > 0 ? fromStr.slice(0, dotIdx) : fromStr;
          var srcId = resolveLayerId(rawSrc) || rawSrc;
          var srcAttr = dotIdx > 0 ? fromStr.slice(dotIdx + 1) : 'id';
          var currentConn = '';
          try {
            if (typeof api.getInConnection === 'function') {
              currentConn = String(api.getInConnection(layerId, conn.attrPath) || '');
            }
          } catch (connReadErr) {}
          if (currentConn !== srcId + '.' + srcAttr && typeof api.connect === 'function') {
            api.connect(srcId, srcAttr, layerId, conn.attrPath, true);
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
  var base = (typeof globalThis !== 'undefined' && globalThis._mg && typeof globalThis._mg === 'object') ? globalThis._mg : {};
  var runtime = {
    patch: ${IDEMPOTENT_PATCH_SOURCE.trim()},
    theme: base.theme || {},
    undoGroup: typeof base.undoGroup === 'function' ? base.undoGroup : function(name, fn) {
      if (typeof fn === 'function') fn();
    }
  };
  for (var k in base) {
    if (k !== 'patch' && !(k in runtime)) runtime[k] = base[k];
  }
  return runtime;
};
`;
}
