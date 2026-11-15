/**
 * Path sanitisation for MCP tool file parameters.
 *
 * Tool-facing file paths (`outDir`, `writeFile`, `planPath`, `jobDirectory`,
 * `renderOutputDir`) are resolved against an explicit allow-list of roots and
 * POSIX-normalised, so a caller can never escape the sandbox with `..`,
 * absolute drives, UNC device paths or NUL bytes:
 *
 *   - the agent's working directory (`process.cwd()`)
 *   - the cavalry-mcp scratch tree (`~/.cavalry-mcp`)
 *   - the OS temp directory
 *
 * Every allowed root and the resolved result are compared with
 * `path.relative`, which is the only traversal check that survives Windows
 * drive letters, forward/backslash mixes and repeated separators.
 */

import os from "node:os";
import path from "node:path";
import { toForwardSlashes } from "./fs-forward-slash.js";

export interface SandboxRoots {
	/** Additional allowed roots (already absolute). */
	extraRoots?: string[];
	/** Disable the OS temp directory (rarely wanted). */
	disallowTemp?: boolean;
}

export function sandboxRoots(extraRoots?: string[]): string[] {
	const roots = [process.cwd(), path.join(os.homedir(), ".cavalry-mcp")];
	if (extraRoots?.length) roots.push(...extraRoots);
	return roots;
}

/** True when `candidate` is exactly `root` or lives underneath it. */
function underRoot(root: string, candidate: string): boolean {
	const rel = path.relative(root, candidate);
	return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Resolve a tool-supplied file path inside the sandbox. Returns the
 * forward-slash absolute path, or throws with a caller-facing message.
 *
 * @param value   the raw parameter (may be undefined → `fallback`)
 * @param fallback default when `value` is absent
 * @param label   parameter name for error messages
 */
export function resolveSandboxedPath(value: string | undefined, fallback: string, label: string, extraRoots?: string[]): string {
	const raw = (value ?? fallback ?? "").trim();
	if (!raw) return toForwardSlashes(path.resolve(fallback));
	if (raw.includes("\0")) throw new Error(`${label} contains a NUL byte and was rejected.`);
	if (/^(\\\\|\/\/)/.test(raw)) throw new Error(`${label} must not be a UNC or protocol path (got "${raw}").`);
	// Windows device names / drive-relative shenanigans: strip and re-check via resolution.
	const resolved = path.resolve(raw.replace(/^([A-Za-z]):[\\/]+/, "$1:\\"));
	if (/[A-Za-z]:$/.test(resolved) || /[A-Za-z]:\\$/.test(resolved)) {
		throw new Error(`${label} must point at a file or directory, not a drive root.`);
	}
	const roots = [...sandboxRoots(extraRoots), os.tmpdir()];
	for (const root of roots) {
		if (underRoot(root, resolved)) return toForwardSlashes(resolved);
	}
	throw new Error(
		`${label} escapes the allowed sandbox (cwd, ~/.cavalry-mcp, temp). ` +
			`Resolved "${toForwardSlashes(resolved)}" — pass a path under one of those roots.`,
	);
}

/** Restrict a value to a safe single path segment (file name / prefix). */
export function sanitizeNameSegment(value: string | undefined, fallback: string, label: string): string {
	const raw = (value ?? fallback ?? "").toString();
	if (!raw) return fallback;
	if (raw.includes("\0")) throw new Error(`${label} contains a NUL byte and was rejected.`);
	if (/[/\\]/.test(raw)) throw new Error(`${label} must be a plain file name without path separators (got "${raw}").`);
	if (/^\.{1,2}$/.test(raw)) throw new Error(`${label} must not be "." or "..".`);
	return raw;
}
