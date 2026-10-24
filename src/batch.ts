/**
 * Compiler for cavalry_batch: turns a JSON operation list into ONE Cavalry
 * script, so building a scene costs a single bridge round trip instead of
 * one per step (Stallion executes each POST with ~1s latency).
 *
 * Each op runs in its own try/catch — one failing op never kills the batch;
 * per-op ok/error is reported back. Ops can reference layer ids created by
 * earlier ops in the same batch: give the create/duplicate op an `as` name
 * and use "$name" as any layerId argument.
 */
import { jsString } from "./lib.js";

export interface BatchKeyframe {
  frame: number;
  attributes: Record<string, unknown>;
}

export type BatchOp =
  | { op: "create"; layerType: string; name?: string; as?: string }
  | { op: "duplicate"; layerId: string; as?: string; withInputConnections?: boolean }
  | { op: "set"; layerId: string; attributes: Record<string, unknown> }
  | {
      op: "keyframe";
      layerId: string;
      frame?: number;
      attributes?: Record<string, unknown>;
      keyframes?: BatchKeyframe[];
    }
  | { op: "easing"; layerId: string; attrPath: string; frame: number; easingType: string }
  | {
      op: "connect";
      sourceLayerId: string;
      sourceAttr: string;
      targetLayerId: string;
      targetAttr: string;
      force?: boolean;
    }
  | { op: "setGenerator"; layerId: string; generatorType: string; attrPath?: string }
  | { op: "addDynamic"; layerId: string; attrName: string; attrType: string }
  | { op: "rename"; layerId: string; name: string }
  | { op: "select"; layerIds: string[] }
  | { op: "delete"; layerIds: string[] }
  | { op: "timing"; layerId: string; inFrame?: number; outFrame?: number; offset?: number }
  | { op: "setParent"; layerId: string; parentLayerId?: string }
  | { op: "reorder"; layerId: string; underLayerId: string };

const OPS = new Set([
  "create",
  "duplicate",
  "set",
  "keyframe",
  "easing",
  "connect",
  "setGenerator",
  "addDynamic",
  "rename",
  "select",
  "delete",
  "timing",
  "setParent",
  "reorder",
]);

function isStr(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function bad(index: number, message: string): never {
  throw new Error(`operations[${index}]: ${message}`);
}

/** "$name" resolves to a ref created earlier in the batch; anything else is a literal id. */
function refExpr(layerId: string, index: number, declared: Set<string>): string {
  if (!layerId.startsWith("$")) {
    return jsString(layerId);
  }
  const name = layerId.slice(1);
  if (!declared.has(name)) {
    bad(index, `references "${layerId}" before it is created — add as: "${name}" to an earlier create/duplicate op`);
  }
  return `__refs[${jsString(name)}]`;
}

function keyframeList(
  op: Extract<BatchOp, { op: "keyframe" }>,
  index: number,
): BatchKeyframe[] {
  const multi = op.keyframes;
  const single = op.frame !== undefined || op.attributes !== undefined;
  if (multi && single) {
    bad(index, "pass either frame+attributes or keyframes[], not both");
  }
  if (multi) {
    if (!Array.isArray(multi) || multi.length === 0) bad(index, "keyframes must be a non-empty array");
    multi.forEach((k, i) => {
      if (typeof k?.frame !== "number") bad(index, `keyframes[${i}].frame must be a number`);
      if (!k.attributes || typeof k.attributes !== "object") bad(index, `keyframes[${i}].attributes must be an object`);
    });
    return multi;
  }
  if (typeof op.frame !== "number") bad(index, "frame must be a number");
  if (!op.attributes || typeof op.attributes !== "object") bad(index, "attributes must be an object");
  return [{ frame: op.frame, attributes: op.attributes }];
}

/**
 * Compile ops into a single Cavalry script. Throws Error (message includes
 * the op index) on invalid input — the tool surfaces it as isError without
 * burning a bridge round trip.
 */
export function compileBatch(ops: BatchOp[]): string {
  if (!Array.isArray(ops) || ops.length === 0) {
    throw new Error("operations must be a non-empty array");
  }
  const declared = new Set<string>();
  const declare = (index: number, as: string | undefined) => {
    if (as === undefined) return;
    if (!isStr(as)) bad(index, "as must be a non-empty string");
    if (declared.has(as)) bad(index, `as: "${as}" is declared twice`);
    declared.add(as);
  };
  const body: string[] = [];

  ops.forEach((op, i) => {
    if (!op || typeof op !== "object" || !isStr(op.op) || !OPS.has(op.op)) {
      bad(i, `unknown op "${op?.op ?? String(op)}" (valid: ${[...OPS].join(", ")})`);
    }
    switch (op.op) {
      case "create": {
        if (!isStr(op.layerType)) bad(i, "layerType must be a non-empty string");
        declare(i, op.as);
        const nameArg = isStr(op.name) ? `, ${jsString(op.name)}` : "";
        const ref = op.as !== undefined ? `__refs[${jsString(op.as)}] = ` : "";
        body.push(
          `__rec(${i}, "create", function () { ${ref}api.create(${jsString(op.layerType)}${nameArg}); ${op.as !== undefined ? `return __refs[${jsString(op.as)}];` : ""} });`,
        );
        break;
      }
      case "duplicate": {
        if (!isStr(op.layerId)) bad(i, "layerId must be a non-empty string");
        declare(i, op.as);
        const withConns = op.withInputConnections === false ? "false" : "true";
        const ref = op.as !== undefined ? `__refs[${jsString(op.as)}] = ` : "";
        const refExprStr = refExpr(op.layerId, i, declared);
        body.push(
          `__rec(${i}, "duplicate", function () { var src = ${refExprStr}; var d = (typeof api.duplicate === "function") ? api.duplicate(src, ${withConns}) : undefined; if (!d) { var sel = api.getSelection(); api.select([src]); d = api.duplicateSelection(); api.select(sel); } ${ref}d; return d; });`,
        );
        break;
      }
      case "set": {
        if (!isStr(op.layerId)) bad(i, "layerId must be a non-empty string");
        if (!op.attributes || typeof op.attributes !== "object") bad(i, "attributes must be an object");
        body.push(
          `__rec(${i}, "set", function () { return api.set(${refExpr(op.layerId, i, declared)}, ${JSON.stringify(op.attributes)}); });`,
        );
        break;
      }
      case "keyframe": {
        if (!isStr(op.layerId)) bad(i, "layerId must be a non-empty string");
        const kfs = keyframeList(op, i);
        body.push(
          `__rec(${i}, "keyframe", function () { var kfs = ${JSON.stringify(kfs)}; var r = []; for (var j = 0; j < kfs.length; j++) { r.push(api.keyframe(${refExpr(op.layerId, i, declared)}, kfs[j].frame, kfs[j].attributes)); } return r; });`,
        );
        break;
      }
      case "easing": {
        if (!isStr(op.layerId)) bad(i, "layerId must be a non-empty string");
        if (!isStr(op.attrPath)) bad(i, "attrPath must be a non-empty string");
        if (typeof op.frame !== "number") bad(i, "frame must be a number");
        if (!isStr(op.easingType)) bad(i, "easingType must be a non-empty string");
        body.push(
          `__rec(${i}, "easing", function () { return api.magicEasing(${refExpr(op.layerId, i, declared)}, ${jsString(op.attrPath)}, ${op.frame}, ${jsString(op.easingType)}); });`,
        );
        break;
      }
      case "connect": {
        for (const k of ["sourceLayerId", "sourceAttr", "targetLayerId", "targetAttr"] as const) {
          if (!isStr(op[k])) bad(i, `${k} must be a non-empty string`);
        }
        const force = op.force ? ", true" : "";
        body.push(
          `__rec(${i}, "connect", function () { return api.connect(${refExpr(op.sourceLayerId, i, declared)}, ${jsString(op.sourceAttr)}, ${refExpr(op.targetLayerId, i, declared)}, ${jsString(op.targetAttr)}${force}); });`,
        );
        break;
      }
      case "setGenerator": {
        if (!isStr(op.layerId)) bad(i, "layerId must be a non-empty string");
        if (!isStr(op.generatorType)) bad(i, "generatorType must be a non-empty string");
        const attr = isStr(op.attrPath) ? op.attrPath : "generator";
        body.push(
          `__rec(${i}, "setGenerator", function () { return api.setGenerator(${refExpr(op.layerId, i, declared)}, ${jsString(attr)}, ${jsString(op.generatorType)}); });`,
        );
        break;
      }
      case "addDynamic": {
        if (!isStr(op.layerId)) bad(i, "layerId must be a non-empty string");
        if (!isStr(op.attrName)) bad(i, "attrName must be a non-empty string");
        if (!isStr(op.attrType)) bad(i, "attrType must be a non-empty string");
        body.push(
          `__rec(${i}, "addDynamic", function () { return api.addDynamic(${refExpr(op.layerId, i, declared)}, ${jsString(op.attrName)}, ${jsString(op.attrType)}); });`,
        );
        break;
      }
      case "rename": {
        if (!isStr(op.layerId)) bad(i, "layerId must be a non-empty string");
        if (!isStr(op.name)) bad(i, "name must be a non-empty string");
        body.push(
          `__rec(${i}, "rename", function () { return api.rename(${refExpr(op.layerId, i, declared)}, ${jsString(op.name)}); });`,
        );
        break;
      }
      case "select": {
        if (!Array.isArray(op.layerIds) || op.layerIds.length === 0 || !op.layerIds.every(isStr)) {
          bad(i, "layerIds must be a non-empty array of strings");
        }
        const arr = op.layerIds.map((id) => refExpr(id, i, declared)).join(", ");
        body.push(`__rec(${i}, "select", function () { return api.select([${arr}]); });`);
        break;
      }
      case "delete": {
        if (!Array.isArray(op.layerIds) || op.layerIds.length === 0 || !op.layerIds.every(isStr)) {
          bad(i, "layerIds must be a non-empty array of strings");
        }
        const dels = op.layerIds
          .map((id) => `api.deleteLayer(${refExpr(id, i, declared)});`)
          .join(" ");
        body.push(`__rec(${i}, "delete", function () { ${dels} return ${op.layerIds.length}; });`);
        break;
      }
      case "timing": {
        if (!isStr(op.layerId)) bad(i, "layerId must be a non-empty string");
        const hasAny = op.inFrame !== undefined || op.outFrame !== undefined || op.offset !== undefined;
        if (!hasAny) bad(i, "at least one of inFrame, outFrame, offset is required");
        const stmts: string[] = [];
        if (op.inFrame !== undefined) {
          if (typeof op.inFrame !== "number") bad(i, "inFrame must be a number");
          stmts.push(`api.setInFrame(id, ${op.inFrame});`);
        }
        if (op.outFrame !== undefined) {
          if (typeof op.outFrame !== "number") bad(i, "outFrame must be a number");
          stmts.push(`api.setOutFrame(id, ${op.outFrame});`);
        }
        if (op.offset !== undefined) {
          if (typeof op.offset !== "number") bad(i, "offset must be a number");
          stmts.push(`api.offsetLayerTime(id, ${op.offset});`);
        }
        body.push(
          `__rec(${i}, "timing", function () { var id = ${refExpr(op.layerId, i, declared)}; ${stmts.join(" ")} });`,
        );
        break;
      }
      case "setParent": {
        if (!isStr(op.layerId)) bad(i, "layerId must be a non-empty string");
        if (op.parentLayerId !== undefined) {
          if (!isStr(op.parentLayerId)) bad(i, "parentLayerId must be a non-empty string or null/omitted to unparent");
          body.push(
            `__rec(${i}, "setParent", function () { return api.parent(${refExpr(op.layerId, i, declared)}, ${refExpr(op.parentLayerId, i, declared)}); });`,
          );
        } else {
          body.push(
            `__rec(${i}, "setParent", function () { return api.unParent(${refExpr(op.layerId, i, declared)}); });`,
          );
        }
        break;
      }
      case "reorder": {
        if (!isStr(op.layerId)) bad(i, "layerId must be a non-empty string");
        if (!isStr(op.underLayerId)) bad(i, "underLayerId must be a non-empty string");
        body.push(
          `__rec(${i}, "reorder", function () { return api.reorder(${refExpr(op.layerId, i, declared)}, ${refExpr(op.underLayerId, i, declared)}); });`,
        );
        break;
      }
    }
  });

  return `var __refs = {};
var __results = [];
function __rec(i, op, fn) {
  var r = { index: i, op: op, ok: true };
  try { var v = fn(); if (v !== undefined) r.result = v; } catch (e) { r.ok = false; r.error = String(e && e.message ? e.message : e); }
  __results.push(r);
}
${body.join("\n")}
__result = { refs: __refs, results: __results };`;
}
