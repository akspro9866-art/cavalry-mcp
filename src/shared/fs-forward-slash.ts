/**
 * POSIX path normalisation for cavalry-mcp.
 *
 * Windows development and Ubuntu CI runners must produce identical outputs:
 * every recorded, logged or compared path is forward-slash normalised through
 * this helper instead of raw `path.join`/`path.resolve` string results. It is
 * the single source of truth — import it rather than hand-rolling
 * `replace(/\\/g, "/")` again.
 */

import path from "node:path";

/** Replace Windows backslash separators with forward slashes. */
export function toForwardSlashes(p: string | null | undefined): string {
	return String(p ?? "").replace(/\\/g, "/");
}

/** Resolve to an absolute path and normalise the separator to forward slashes. */
export function resolvePosix(...segments: string[]): string {
	return toForwardSlashes(path.resolve(...segments));
}

/** Join and normalise to forward slashes without requiring an absolute base. */
export function joinPosix(...segments: string[]): string {
	return toForwardSlashes(path.join(...segments));
}
