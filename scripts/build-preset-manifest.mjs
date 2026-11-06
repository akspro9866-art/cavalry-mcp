/**
 * Write dist/presets/preset_manifest.json from the compiled preset library.
 *
 * Run after `tsc` (the `build` npm script does this). Keeping generation in a
 * script rather than a tsc plugin means the manifest is a build artifact of the
 * same definitions the MCP server ships, never a second hand-maintained table.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modulePath = path.join(root, "dist", "presets", "manifest.js");

let module;
try {
  module = await import(pathToFileURL(modulePath).href);
} catch (err) {
  console.error(`[preset-manifest] build dist first (missing ${modulePath}): ${err?.message ?? err}`);
  process.exit(1);
}

const { buildPresetManifest, serializePresetManifest, estimatePresetManifestTokens, PRESET_MANIFEST_FILE } = module;
const json = serializePresetManifest(buildPresetManifest());
const outFile = path.join(root, "dist", PRESET_MANIFEST_FILE);
mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, json, "utf8");

const entries = buildPresetManifest().presets.length;
const tokens = estimatePresetManifestTokens(json);
console.log(`[preset-manifest] ${entries} presets, ${json.length} bytes, ~${tokens} tokens -> ${outFile}`);
if (tokens >= 1500) {
  console.error(`[preset-manifest] over the 1500-token budget (${tokens}); trim signatures or categories`);
  process.exit(1);
}
