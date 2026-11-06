/**
 * The declarative `_mg` manifest: types, the in-host interpreter source, and
 * the client-side compiler.
 *
 * One manifest schema is interpreted in two places that must never drift:
 *
 *   - inside Cavalry, by the vendored copy of `MG_MANIFEST_RUNTIME` that
 *     stallion's `/batch-step` endpoint evaluates when a payload carries
 *     `dslManifest` (stallion never parses JSON manifests itself — it ships
 *     this runtime and runs it in the script host, next to the preloaded
 *     `_mg` helpers);
 *   - on the Node side, where `compileMgDsl` emits a self-contained script
 *     body that defines the same interpreter and immediately calls it, for
 *     callers going through `executeMotionScript` (or a bridge that predates
 *     the preloaded runtime).
 *
 * The interpreter is deliberately dependency-light: it only assumes `_mg`
 * (shape/layer/text/alias/fitToBounds) and the raw `api` surface. The `_rb`
 * rig builders are *not* used here — preset expansion happens client-side in
 * `compileMgDsl`/`resolvePreset`, which can read the 120-preset library.
 */

/** Declarative `_mg` manifest accepted by stallion `/batch-step` and `compileMgDsl`. */
export interface MgDslManifest {
	/** Comp setup applied before any layer exists. */
	comp?: {
		width?: number;
		height?: number;
		fps?: number;
		endFrame?: number;
		bg?: string;
	};
	/** Layers created in order; `as` names the alias later ops address as `$name`. */
	layers?: MgDslLayerSpec[];
	/** Ordered operations. One op failing never aborts the rest. */
	ops?: MgDslOpSpec[];
}

export type MgDslLayerSpec =
	| {
			as: string;
			kind: "shape";
			/** Primitive generator, e.g. "rectangle" | "ellipse" | "polygon". */
			shape: string;
			name?: string;
			attrs?: Record<string, unknown>;
	  }
	| {
			as: string;
			kind: "layer";
			/** Any Cavalry layer type, e.g. "group" | "preComp" | "null". */
			layerType: string;
			name?: string;
			attrs?: Record<string, unknown>;
	  }
	| {
			as: string;
			kind: "text";
			text: string;
			size?: number;
			color?: string;
			font?: string;
			attrs?: Record<string, unknown>;
	  }
	| {
			as: string;
			kind: "svg";
			/** Scene URI (forward slashes) of an .svg file on disk. */
			file: string;
			name?: string;
			attrs?: Record<string, unknown>;
	  }
	| {
			as: string;
			kind: "image";
			/** Scene URI (forward slashes) of an image file on disk. */
			file: string;
			name?: string;
			attrs?: Record<string, unknown>;
	  };

export type MgDslTarget = string;

export type MgDslOpSpec =
	| { op: "set"; target: MgDslTarget; attrs: Record<string, unknown> }
	| {
			op: "keyframe";
			target: MgDslTarget;
			frames: Array<{ frame: number; attrs: Record<string, unknown> }>;
			/** Applied after the keyframes land: one easing spec per entry. */
			easing?: MgDslEasingSpec | MgDslEasingSpec[];
	  }
	| { op: "easing"; target: MgDslTarget; attr: string; frame: number; easing: string; expression?: string }
	| { op: "connect"; from: MgDslTarget; fromAttr: string; to: MgDslTarget; toAttr: string; force?: boolean }
	| { op: "expression"; target: MgDslTarget; attrPath: string; expression: string }
	| { op: "delete"; targets: MgDslTarget[] }
	| { op: "order"; target: MgDslTarget; to: "forward" | "front" | "backward" | "back" }
	| {
			op: "fit";
			target: MgDslTarget;
			box: { x: number; y: number; width: number; height: number };
			space?: "comp" | "raster";
			compWidth?: number;
			compHeight?: number;
			tolerance?: number;
			preserveAspect?: boolean;
	  };

/** One Magic Easing write: `Custom` may carry its expression. */
export interface MgDslEasingSpec {
	attr: string;
	easing: string;
	expression?: string;
}

/** Interpreter return value, mirrored by `scriptResult` in the batch-step envelope. */
export interface MgDslManifestResult {
	ok: boolean;
	created: Record<string, string>;
	ops: Array<{ index: number; op: string; target?: string; ok: boolean; error?: string }>;
	errors: string[];
}

export const MG_MANIFEST_VERSION = "1.0.0";


/**
 * The manifest interpreter, as source for the Cavalry script host. Evaluating
 * this string defines `__mgApplyManifest(manifest)`. It never uses template
 * literals or `${…}` (this file embeds it with String.raw) and never touches
 * Node — the identical text runs inside Cavalry and in the mock sandbox.
 *
 * Target resolution: `$name` and `@name` both hit the alias registry that
 * `_mg.alias` maintains on globalThis; anything else is a raw layer id.
 */
export const MG_MANIFEST_RUNTIME = String.raw`
var __mgApplyManifest = function (manifest) {
  var read = function (fn) { try { return fn(); } catch (e) { return null; } };
  var out = { ok: true, created: {}, ops: [], errors: [] };
  var spec = manifest && typeof manifest === "object" ? manifest : {};
  var resolve = function (target) {
    var text = String(target == null ? "" : target).trim();
    if (!text) return null;
    if ((text.charAt(0) === "$" || text.charAt(0) === "@") && typeof _mg.aliases === "function") {
      var map = _mg.aliases();
      var key = text.slice(1);
      if (map["@" + key]) return map["@" + key];
      if (map[text]) return map[text];
      return null;
    }
    return text;
  };
  var runOp = function (index, op) {
    var name = op && typeof op === "object" ? String(op.op || "") : "";
    try {
      if (name === "set") {
        var id = resolve(op.target);
        if (!id) throw new Error("unknown target " + String(op.target));
        _mg.set(id, op.attrs || {});
        return "set " + String(op.target);
      }
      if (name === "keyframe") {
        var id = resolve(op.target);
        if (!id) throw new Error("unknown target " + String(op.target));
        var frames = Array.isArray(op.frames) ? op.frames : [];
        for (var f = 0; f < frames.length; f++) {
          api.keyframe(id, Math.round(Number(frames[f].frame)), frames[f].attrs || {});
        }
        var easings = op.easing == null ? [] : (Array.isArray(op.easing) ? op.easing : [op.easing]);
        for (var e = 0; e < easings.length; e++) {
          var ease = easings[e];
          if (!ease || !ease.attr) continue;
          var at = ease.frame != null ? Math.round(Number(ease.frame)) : (frames.length ? Math.round(Number(frames[frames.length - 1].frame)) : 0);
          api.magicEasing(id, String(ease.attr), at, String(ease.easing || "Custom"), ease.expression);
        }
        return "keyframe " + String(op.target) + " x" + frames.length;
      }
      if (name === "easing") {
        var id = resolve(op.target);
        if (!id) throw new Error("unknown target " + String(op.target));
        api.magicEasing(id, String(op.attr), Math.round(Number(op.frame)), String(op.easing || "Custom"), op.expression);
        return "easing " + String(op.attr) + " " + String(op.easing);
      }
      if (name === "connect") {
        var src = resolve(op.from);
        var dst = resolve(op.to);
        if (!src || !dst) throw new Error("unknown connect endpoint " + String(op.from) + " -> " + String(op.to));
        api.connect(src, String(op.fromAttr), dst, String(op.toAttr), op.force === true);
        return "connect " + String(op.from) + "." + String(op.fromAttr) + " -> " + String(op.to) + "." + String(op.toAttr);
      }
      if (name === "expression") {
        var id = resolve(op.target);
        if (!id) throw new Error("unknown target " + String(op.target));
        api.setAttributeExpression(id, String(op.attrPath), String(op.expression));
        return "expression " + String(op.attrPath);
      }
      if (name === "delete") {
        var targets = Array.isArray(op.targets) ? op.targets : [];
        for (var d = 0; d < targets.length; d++) {
          var id = resolve(targets[d]);
          if (id) api.deleteLayer(id);
        }
        return "delete x" + targets.length;
      }
      if (name === "order") {
        var id = resolve(op.target);
        if (!id) throw new Error("unknown target " + String(op.target));
        var orderFns = {
          forward: function () { api.bringForward(); },
          front: function () { api.bringToFront(); },
          backward: function () { api.moveBackward(); },
          back: function () { api.moveToBack(); }
        };
        var orderFn = orderFns[String(op.to)];
        if (!orderFn) throw new Error("to must be one of forward, front, backward, back");
        var prev = api.getSelection();
        api.select([id]);
        try { orderFn(); } finally { try { api.select(prev); } catch (e2) {} }
        return "order " + String(op.to);
      }
      if (name === "fit") {
        var id = resolve(op.target);
        if (!id) throw new Error("unknown target " + String(op.target));
        var box = op.box || {};
        var opts = { space: op.space || "comp", tolerance: op.tolerance, preserveAspect: op.preserveAspect === true };
        if (op.compWidth != null) opts.compWidth = Number(op.compWidth);
        if (op.compHeight != null) opts.compHeight = Number(op.compHeight);
        _mg.fitToBounds(id, { x: Number(box.x) || 0, y: Number(box.y) || 0, width: Number(box.width) || 0, height: Number(box.height) || 0 }, opts);
        return "fit " + String(op.target);
      }
      throw new Error("unknown op '" + name + "'");
    } catch (err) {
      out.ok = false;
      out.errors.push(String(err && err.message ? err.message : err));
      return { error: String(err && err.message ? err.message : err) };
    }
  };
  var record = function (index, op, label) {
    if (typeof label === "string") out.ops.push({ index: index, op: String(op.op), target: op.target != null ? String(op.target) : undefined, ok: true });
    else out.ops.push({ index: index, op: String(op.op), target: op.target != null ? String(op.target) : undefined, ok: false, error: label.error });
  };
  if (spec.comp && typeof _mg.comp === "function") {
    read(function () {
      _mg.comp(
        spec.comp.width != null ? Number(spec.comp.width) : undefined,
        spec.comp.height != null ? Number(spec.comp.height) : undefined,
        spec.comp.fps != null ? Number(spec.comp.fps) : undefined,
        spec.comp.endFrame != null ? Number(spec.comp.endFrame) : undefined,
        spec.comp.bg
      );
    });
  }
  var layers = Array.isArray(spec.layers) ? spec.layers : [];
  for (var i = 0; i < layers.length; i++) {
    var layer = layers[i];
    var handle = String(layer.as || "").trim();
    try {
      var id = null;
      if (layer.kind === "shape") {
        id = _mg.shape(String(layer.shape), layer.name || handle, layer.attrs || {});
      } else if (layer.kind === "layer") {
        id = _mg.layer(String(layer.layerType), layer.name || handle, layer.attrs || {});
      } else if (layer.kind === "text") {
        var textAttrs = Object.assign({}, layer.attrs || {});
        if (layer.font) textAttrs.font = { font: String(layer.font), style: "Regular" };
        id = _mg.text(String(layer.text), layer.size != null ? Number(layer.size) : undefined, layer.color, textAttrs);
      } else if (layer.kind === "svg") {
        var ids = read(function () { return api.convertSVGToLayers(String(layer.file)); });
        if (!Array.isArray(ids) || !ids.length) throw new Error("convertSVGToLayers returned no layers for " + String(layer.file));
        id = ids[0];
        if (layer.name) read(function () { return api.rename(id, String(layer.name)); });
        if (layer.attrs && Object.keys(layer.attrs).length) _mg.set(id, layer.attrs);
        for (var s = 1; s < ids.length; s++) out.created[handle + "_" + s] = String(ids[s]);
      } else if (layer.kind === "image") {
        id = api.create("image", layer.name || handle);
        _mg.set(id, Object.assign({ assetPath: String(layer.file) }, layer.attrs || {}));
      } else {
        throw new Error("unknown layer kind '" + String(layer.kind) + "'");
      }
      if (handle) {
        _mg.alias(id, handle);
        out.created[handle] = String(id);
      }
      out.ops.push({ index: i, op: "create:" + String(layer.kind), target: handle, ok: true });
    } catch (err) {
      out.ok = false;
      var message = String(err && err.message ? err.message : err);
      out.errors.push("layer " + handle + ": " + message);
      out.ops.push({ index: i, op: "create:" + String(layer.kind || "?"), target: handle, ok: false, error: message });
    }
  }
  var ops = Array.isArray(spec.ops) ? spec.ops : [];
  for (var o = 0; o < ops.length; o++) record(o, ops[o], runOp(o, ops[o]));
  return out;
};
`;

/**
 * Compile a declarative manifest into an executable script body.
 *
 * The emitted body defines the interpreter only when the host has not already
 * got one (stallion preloads it, so the common path transmits just the call),
 * then applies the manifest and returns the result as JSON.
 */
export function compileMgDsl(manifest: MgDslManifest): string {
	return `if (typeof __mgApplyManifest === "undefined") {
${MG_MANIFEST_RUNTIME}
}
__result = __mgApplyManifest(${JSON.stringify(manifest)});`;
}
