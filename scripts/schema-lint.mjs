#!/usr/bin/env node
/**
 * MCP tool-schema lint (advisory, non-blocking in CI).
 *
 * Statically inspects every tool registration in the server sources and
 * enforces the hardening contract:
 *
 *   1. NO legacy `server.tool(` raw-shape registrations — every tool must go
 *      through `server.registerTool(...)` with an explicit config object.
 *   2. Every registration's `inputSchema` must be a `z.strictObject(...)`
 *      (→ JSON Schema `additionalProperties: false`).
 *   3. File-path parameters (outDir / writeFile / planPath / jobDirectory /
 *      renderOutputDir / path) must be sanitised with `resolveSandboxedPath`
 *      or `sanitizeNameSegment` somewhere in the same source file.
 *
 * Exit code 0 = clean; 1 = violations found (CI runs it non-blocking with
 * `|| true` so findings are advisory).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const toolDirs = ["src/server", "src/tools", "src"];

const PATH_PARAM_RE = /\b(outDir|writeFile|planPath|jobDirectory|renderOutputDir|outputPath|filePath)\b:/;

/** Extract the full paren-balanced call starting at `start` (index of '('). */
function extractCall(source, start) {
	let depth = 0;
	for (let i = start; i < source.length; i++) {
		const ch = source[i];
		if (ch === "(") depth += 1;
		else if (ch === ")") {
			depth -= 1;
			if (depth === 0) return source.slice(start, i + 1);
		}
	}
	return source.slice(start, start + 4000);
}

function* registrations(source) {
	const marker = /\.(registerTool)\(/g;
	let match;
	while ((match = marker.exec(source)) !== null) {
		const openParen = source.indexOf("(", match.index);
		yield { index: match.index, call: extractCall(source, openParen) };
	}
}

let files = [];
for (const dir of toolDirs) {
	const abs = path.join(root, dir);
	if (!fs.existsSync(abs)) continue;
	for (const entry of fs.readdirSync(abs, { recursive: false })) {
		const file = path.join(abs, entry.toString());
		if (file.endsWith(".ts") && fs.statSync(file).isFile()) files.push(file);
	}
}
files = [...new Set(files)].sort();

const problems = [];
let toolCount = 0;

/** Collect `const/let <Identifier> = z.strictObject(` definitions across all scanned files. */
const strictSchemaIds = new Set();
for (const file of files) {
	const source = fs.readFileSync(file, "utf8");
	for (const match of source.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*z\.strictObject\(/g)) {
		strictSchemaIds.add(match[1]);
	}
}

for (const file of files) {
	const rel = path.relative(root, file).replace(/\\/g, "/");
	const source = fs.readFileSync(file, "utf8");
	if (!/registerTool|server\.tool\(/.test(source)) continue;

	// 1. No legacy raw-shape registrations.
	for (const match of source.matchAll(/\bserver\.tool\(/g)) {
		problems.push(`${rel}: legacy server.tool(...) registration at char ${match.index} — convert to server.registerTool(...) with z.strictObject`);
	}

	// 2. Every registerTool carries a z.strictObject inputSchema — either
	//    inline or via an identifier defined as z.strictObject somewhere.
	for (const { call } of registrations(source)) {
		toolCount += 1;
		const inline = /inputSchema:\s*z\.strictObject\(/.test(call);
		const viaId = /inputSchema:\s*([A-Za-z_$][\w$]*)\b/.exec(call);
		if (!inline && !(viaId && strictSchemaIds.has(viaId[1]))) {
			const nameMatch = /\(\s*["'`]([\w_]+)["'`]/.exec(call);
			problems.push(`${rel}: tool ${nameMatch ? nameMatch[1] : "?"} inputSchema is not z.strictObject (additionalProperties must be false)`);
		}
	}

	// 3. Path parameters must be sanitised in the same file.
	const hasSanitiser = /resolveSandboxedPath\(|sanitizeNameSegment\(/.test(source);
	if (!hasSanitiser && PATH_PARAM_RE.test(source)) {
		problems.push(`${rel}: declares file-path parameters but never calls resolveSandboxedPath/sanitizeNameSegment`);
	}
}

for (const problem of problems) console.error(`[schema-lint] ${problem}`);
console.log(`[schema-lint] checked ${files.length} files, ${toolCount} registerTool calls, ${problems.length} problem(s)`);
if (problems.length) process.exit(1);
