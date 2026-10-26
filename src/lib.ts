/**
 * Pure helpers shared by tools and tests. No imports from the MCP SDK or
 * the bridge — everything here is string in / string out.
 */

/**
 * Interpolate a value as a JavaScript string literal. JSON.stringify already
 * escapes quotes, backslashes and control characters; \u2028/\u2029 are valid
 * JSON raw but break JS string literals, so they are escaped explicitly.
 */
export function jsString(s: string): string {
  return JSON.stringify(String(s))
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export type Outcome = { ok: true; text: string } | { ok: false; text: string };

export const NO_RESULT_MESSAGE =
  "No result from Cavalry. Is Cavalry running with the Stallion script active (Scripts > Stallion)? If it already is, the script may still be running — increase CAVALRY_RESULT_TIMEOUT_MS.";

interface CavalryResult {
  ok?: boolean;
  error?: string;
  stack?: string;
  result?: unknown;
  writeFailed?: string;
}

/**
 * Parse the result JSON written by the wrapped script into a structured
 * outcome: ok:false results should be returned to MCP clients with
 * isError: true.
 */
export function parseOutcome(raw: string): Outcome {
  if (!raw) {
    return { ok: false, text: NO_RESULT_MESSAGE };
  }
  let out: CavalryResult;
  try {
    out = JSON.parse(raw) as CavalryResult;
  } catch {
    return { ok: false, text: `Unparsable result from Cavalry: ${raw.slice(0, 500)}` };
  }
  if (out.writeFailed) {
    return {
      ok: false,
      text: `Script ran but could not write its result file: ${out.writeFailed}`,
    };
  }
  if (out.ok === false) {
    const error = out.error ?? "unknown Cavalry script error";
    return { ok: false, text: out.stack ? `${error}\n${out.stack}` : error };
  }
  const r = out.result;
  if (r === undefined) {
    return { ok: true, text: "ok" };
  }
  return { ok: true, text: typeof r === "string" ? r : JSON.stringify(r) };
}

/** Magic Easing names verified against Cavalry 2.8 (no "EaseInOut"/"Linear"). */
export const EASING_NAMES = [
  "SlowIn",
  "SlowOut",
  "SlowInSlowOut",
  "VerySlowIn",
  "VerySlowOut",
  "VerySlowInVerySlowOut",
  "SpringIn",
  "SpringOut",
  "SpringInSpringOut",
  "SmallSpringIn",
  "SmallSpringOut",
  "SmallSpringInSmallSpringOut",
  "AnticipateIn",
  "OvershootOut",
  "AnticipateInOvershootOut",
  "BounceIn",
  "BounceOut",
  "BounceInBounceOut",
  "None",
  "Custom",
] as const;

export const EASING_LIST = EASING_NAMES.join(", ");

/**
 * Build the script that reports a layer list as structured JSON. `idsExpr`
 * is a JS expression evaluating to an array of layer ids. Every field is
 * read defensively — layers of different types expose different attributes.
 */
export function sceneLayersScript(idsExpr: string): string {
  return `
var __ids = ${idsExpr};
var __sel = [];
try { __sel = api.getSelection() || []; } catch (e) {}
function __isSelected(id) { for (var s = 0; s < __sel.length; s++) { if (__sel[s] === id) return true; } return false; }
var __info = [];
function __g(fn) { try { return fn(); } catch (e) { return null; } }
for (var i = 0; i < __ids.length; i++) {
  (function (id) {
    __info.push({
      id: id,
      type: __g(function () { return api.getLayerType(id); }),
      name: __g(function () { return api.getNiceName(id); }),
      visible: __g(function () { return api.get(id, "visible"); }),
      selected: __isSelected(id),
      position: __g(function () { return { x: Number(api.get(id, "position.x")), y: Number(api.get(id, "position.y")) }; }),
      inFrame: __g(function () { return api.getInFrame(id); }),
      outFrame: __g(function () { return api.getOutFrame(id); }),
      parent: __g(function () { var p = api.getParent(id); return p || null; })
    });
  })(__ids[i]);
}
__result = __info;`;
}
