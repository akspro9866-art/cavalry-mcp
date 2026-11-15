/**
 * Build the low-token preset discovery index: `dist/presets/discovery_index.json`.
 *
 * Runs AFTER `tsc` (it imports the compiled preset library) and alongside the
 * preset-manifest builder. The output maps preset ID, category, motion tags
 * and compact parameter signatures — no preset implementation code — so the
 * MCP `cavalry_discover_presets` lookup can answer without loading the full
 * library into agent context.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

/** Resolve the compiled module via a file:// URL (Windows-safe dynamic import). */
async function importDist(relative) {
	return import(pathToFileURL(path.join(dist, relative)).href);
}

const { PRESET_DEFS } = await importDist("presets/cavalry_snippets.js");
const { motionSignatureFor, requiredParamsFor, defaultDurationFor } = await importDist("presets/manifest.js");

const presets = PRESET_DEFS.map((def) => ({
	id: def.id,
	title: def.title,
	category: def.category,
	motionTags: motionSignatureFor(def).split("+").filter(Boolean),
	requiredParams: requiredParamsFor(def),
	// Compact parameter signature: "name:type=default" joined by "|" — the
	// machine-compact form the runtime parses back into structured entries.
	paramSignature: Object.entries(def.params)
		.map(([name, param]) => {
			const value = String(
				typeof param.default === "string" ? param.default : Array.isArray(param.default) ? param.default.join(",") : param.default,
			).slice(0, 16).replace(/[:|=]/g, "_");
			return `${name}:${param.type}=${value}`;
		})
		.join("|"),
	defaultDuration: defaultDurationFor(def),
	// Compact keyword hint only — never the full description or preset code.
	summary: String(def.description || "").slice(0, 32),
}));

const payload = { version: 1, format: "id|title|category|motionTags|requiredParams|paramSignature|defaultDuration|summary", presets };
const outFile = path.join(dist, "presets", "discovery_index.json");
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(payload), "utf8");

const bytes = JSON.stringify(payload).length;
const tokens = Math.ceil(bytes / 4);
console.log(`[discovery-index] ${presets.length} presets, ${bytes} bytes (~${tokens} tokens) -> ${outFile}`);
// Adaptive budget: ~80 tokens per indexed preset keeps the artifact
// proportional to the library instead of a magic constant.
if (tokens > presets.length * 80) {
	console.error(`[discovery-index] over the per-preset artifact budget (${tokens} tokens for ${presets.length} presets)`);
	process.exit(1);
}
