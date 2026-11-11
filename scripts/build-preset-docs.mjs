/**
 * Scan the generated SaaS animation presets in `cavalry-mcp`, generate lazy
 * `{preset}.doc.mjs` discovery modules (each capped at <= 110 tokens) under
 * `dist/presets/docs/`, and update `AGENTS.md` at the repo root with the
 * compressed 1-line-per-preset catalog (`id | category | requiredParams | 8-word summary`)
 * and the explicit preset-first rule.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestModulePath = path.join(root, "dist", "presets", "manifest.js");
const snippetsModulePath = path.join(root, "dist", "presets", "cavalry_snippets.js");

let manifestMod;
let snippetsMod;
try {
  manifestMod = await import(pathToFileURL(manifestModulePath).href);
  snippetsMod = await import(pathToFileURL(snippetsModulePath).href);
} catch (err) {
  console.error(
    `[preset-docs] build dist first (missing compiled preset modules): ${err?.message ?? err}`,
  );
  process.exit(1);
}

const {
  buildCompactPresetDoc,
  buildCompactPresetCatalogLines,
  estimatePresetManifestTokens,
  PRESET_CATALOG_AGENT_RULE,
} = manifestMod;
const { PRESET_DEFS } = snippetsMod;

const docsDir = path.join(root, "dist", "presets", "docs");
mkdirSync(docsDir, { recursive: true });

// Also copy .mjs source modules into dist/ so both .js and .mjs imports resolve.
for (const rel of [
  ["src", "themes", "astryx-themes.mjs"],
  ["src", "validation", "validate-mg-purity.mjs"],
]) {
  const srcFile = path.join(root, ...rel);
  const distFile = path.join(root, "dist", ...rel.slice(1));
  if (existsSync(srcFile)) {
    mkdirSync(path.dirname(distFile), { recursive: true });
    copyFileSync(srcFile, distFile);
  }
}

let maxTokens = 0;
const indexMap = {};

for (const def of PRESET_DEFS) {
  const doc = buildCompactPresetDoc(def);
  const docSource = `export const PRESET_DOC = ${JSON.stringify({
    id: doc.id,
    category: doc.category,
    signature: doc.motionSignature,
    requiredParams: doc.requiredParams,
    duration: doc.defaultDuration,
    summary: doc.summary,
  })};\nexport default PRESET_DOC;\n`;

  const tokens = estimatePresetManifestTokens(docSource);
  if (tokens > 110) {
    console.error(
      `[preset-docs] ${def.id}.doc.mjs exceeds 110-token cap (${tokens} tokens)`,
    );
    process.exit(1);
  }
  if (tokens > maxTokens) maxTokens = tokens;

  const docPath = path.join(docsDir, `${def.id}.doc.mjs`);
  writeFileSync(docPath, docSource, "utf8");
  indexMap[def.id] = `./${def.id}.doc.mjs`;
}

// Write lazy loader index in dist/presets/docs/index.mjs
const loaderSource = `export const PRESET_DOC_FILES = ${JSON.stringify(indexMap, null, 2)};\nexport async function loadPresetDoc(presetId) {\n  const rel = PRESET_DOC_FILES[presetId];\n  if (!rel) return null;\n  const mod = await import(new URL(rel, import.meta.url).href);\n  return mod.PRESET_DOC ?? mod.default ?? null;\n}\n`;
writeFileSync(path.join(docsDir, "index.mjs"), loaderSource, "utf8");

// Update AGENTS.md with the explicit rule and compressed index
const agentsPath = path.join(root, "AGENTS.md");
const existingAgents = existsSync(agentsPath) ? readFileSync(agentsPath, "utf8") : "# Cavalry agent rules\n";
const startMarker = "<!-- PRESET_INDEX_START -->";
const endMarker = "<!-- PRESET_INDEX_END -->";

const catalogLines = buildCompactPresetCatalogLines();
const catalogSection = [
  startMarker,
  `## Compressed Preset Catalog (${PRESET_DEFS.length} SaaS Presets)`,
  "",
  `> **Rule**: "${PRESET_CATALOG_AGENT_RULE}"`,
  "",
  "Format: `id | category | requiredParams | 8-word summary`",
  "Lazy doc discovery: `dist/presets/docs/{preset}.doc.mjs` (capped at <= 110 tokens per preset) or `cavalry_search_presets({ presetId })`.",
  "",
  "```text",
  ...catalogLines,
  "```",
  endMarker,
].join("\n");

let nextAgents;
if (existingAgents.includes(startMarker) && existingAgents.includes(endMarker)) {
  const before = existingAgents.slice(0, existingAgents.indexOf(startMarker)).trimEnd();
  const after = existingAgents.slice(existingAgents.indexOf(endMarker) + endMarker.length).trimStart();
  nextAgents = `${before}\n\n${catalogSection}${after ? `\n\n${after}` : "\n"}`;
} else {
  nextAgents = `${existingAgents.trimEnd()}\n\n${catalogSection}\n`;
}

writeFileSync(agentsPath, nextAgents.replace(/\r\n/g, "\n"), "utf8");

console.log(
  `[preset-docs] generated ${PRESET_DEFS.length} lazy .doc.mjs files (max ${maxTokens} tokens <= 110 cap) and updated AGENTS.md`,
);
