/**
 * Direct-import library surface (`cavalry-mcp/lib`).
 *
 * refclone imports the `_mg` compiler and the 120-preset library from here as
 * a local package — no MCP stdio JSON-RPC, no bridge round trip, no tool
 * schema. Everything exported from this module is PURE: string/JSON in,
 * string/JSON out. Nothing here may import the MCP SDK, zod, `node:fs` or any
 * other Node-only machinery beyond what `lib.ts` already uses (`node:path`
 * for the scene-URI rules), because the module must stay embeddable and
 * trivially testable.
 *
 * Contract (zero-slop pipeline):
 *   - `compileMgDsl(manifest)`      — declarative `_mg` manifest → executable
 *     Cavalry JS body (same manifest stallion's `/batch-step` accepts as
 *     `dslManifest`, interpreted by the same `MG_MANIFEST_RUNTIME`).
 *   - `searchPresets(query, cat)`   — bounded keyword search over the
 *     120-preset library; keeps the catalog out of system prompts.
 *   - `resolvePreset(presetId, params)` — one preset → executable script body.
 *   - `serializeCompactTsv(layers)` — readback layers → the compact TSV the
 *     bridge uses for `compactDomTsv`, byte-identical column order.
 */

import { compileMgDsl, MG_MANIFEST_RUNTIME, MG_MANIFEST_VERSION, type MgDslEasingSpec, type MgDslLayerSpec, type MgDslManifest, type MgDslOpSpec } from "../runtime/mg_manifest.js";
import {
	listPresets,
	resolvePresetName,
} from "../presets/cavalry_snippets.js";
import { compilePreset, PRESET_DEFS } from "../presets/cavalry_snippets.js";
import {
	buildCompactPresetCatalogLines,
	buildCompactPresetDoc,
	formatCompactPresetLine,
	lookupPresetCompact,
	motionSignatureFor,
	PRESET_CATALOG_AGENT_RULE,
	summaryEightWordsFor,
	type CompactPresetDoc,
} from "../presets/manifest.js";
import { PRESET_CATEGORIES } from "../presets/types.js";
import { derivePresetRig } from "../runtime/rig_terms.js";
import {
	ASTRYX_THEMES,
	ASTRYX_THEME_NAMES,
	DEFAULT_ASTRYX_THEME,
	resolveAstryxTheme,
	type AstryxThemeName,
	type AstryxThemeTokens,
} from "../themes/astryx-themes.js";
import {
	gradeFromScore,
	selfCorrectMgPurity,
	validateMgPurity,
	type PurityBreakdown,
	type PurityGrade,
	type PurityValidationResult,
	type PurityViolation,
	type SelfCorrectPurityOptions,
	type SelfCorrectPurityResult,
} from "../validation/validate-mg-purity.js";

export {
	compileMgDsl,
	MG_MANIFEST_RUNTIME,
	MG_MANIFEST_VERSION,
	ASTRYX_THEMES,
	ASTRYX_THEME_NAMES,
	DEFAULT_ASTRYX_THEME,
	resolveAstryxTheme,
	validateMgPurity,
	selfCorrectMgPurity,
	gradeFromScore,
	lookupPresetCompact,
	buildCompactPresetDoc,
	buildCompactPresetCatalogLines,
	formatCompactPresetLine,
	summaryEightWordsFor,
	PRESET_CATALOG_AGENT_RULE,
};
export type {
	MgDslEasingSpec,
	MgDslLayerSpec,
	MgDslManifest,
	MgDslOpSpec,
	AstryxThemeName,
	AstryxThemeTokens,
	PurityBreakdown,
	PurityGrade,
	PurityValidationResult,
	PurityViolation,
	SelfCorrectPurityOptions,
	SelfCorrectPurityResult,
	CompactPresetDoc,
};
export { PRESET_CATEGORIES, PRESET_DEFS, compilePreset, listPresets, motionSignatureFor, resolvePresetName };

/** One search hit: bounded metadata, never the preset code. */
export interface PresetSearchHit {
	id: string;
	title: string;
	category: string;
	categoryLabel: string;
	motionSignature: string;
	requiredParams: string[];
	defaultDuration: number | null;
	description: string;
	params: Record<string, { type: string; default: string | number | boolean | Array<string | number> }>;
}

export interface PresetSearchResult {
	query: string;
	category: string | null;
	matched: number;
	total: number;
	presets: PresetSearchHit[];
}

/** Content knobs a matcher must bind; config/enum knobs stay out of the way. */
const CONFIG_PARAM_NAMES = new Set(["easing", "preset", "shape", "attr", "type", "mode", "font", "style"]);

function summarize(id: string): PresetSearchHit {
	const def = PRESET_DEFS.find((candidate) => candidate.id === id);
	if (!def) throw new Error(`Unknown preset: ${id}`);
	const required = Object.entries(def.params)
		.filter(([name, param]) => param.type === "string" && !CONFIG_PARAM_NAMES.has(name) && typeof param.default === "string" && String(param.default).trim().length > 0 && !String(param.default).startsWith("#"))
		.map(([name]) => name);
	const duration = def.params.duration;
	return {
		id: def.id,
		title: def.title,
		category: def.category,
		categoryLabel: PRESET_CATEGORIES.find((cat) => cat.id === def.category)?.label ?? def.category,
		motionSignature: motionSignatureFor(def),
		requiredParams: required,
		defaultDuration: duration && Number.isFinite(Number(duration.default)) ? Number(duration.default) : null,
		description: def.description,
		params: Object.fromEntries(Object.entries(def.params).map(([name, param]) => [name, { type: param.type, default: param.default }])),
	};
}

/**
 * Keyword search over the preset library. A hit matches on id, title,
 * category id/label, description words, parameter names, or the deterministic
 * motion signature tokens ("pop", "spring", "stagger", …). `category` filters
 * by category id, index (1-14) or label fragment. Results are bounded (25) so
 * a broad query cannot flood an agent's context.
 */
export function searchPresets(query = "", category?: string): PresetSearchResult {
	const wantedCategory = (category ?? "").trim().toLowerCase();
	const wantedWords = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
	const hits = listPresets(wantedCategory || undefined).filter((preset) => {
		if (!wantedWords.length) return true;
		const def = PRESET_DEFS.find((candidate) => candidate.id === preset.id);
		const signature = def ? motionSignatureFor(def) : "";
		const haystack = [
			preset.id,
			preset.title,
			preset.category,
			preset.categoryLabel,
			preset.description.toLowerCase(),
			Object.keys(preset.params).join(" "),
			preset.rig.easing,
			preset.rig.suggestedEasing,
			preset.rig.springKind,
			signature,
		].join(" ").toLowerCase();
		// Every query word must land somewhere — an AND, not an OR, so
		// "counter spring" does not return every counter.
		return wantedWords.every((word) => haystack.includes(word));
	});
	return {
		query,
		category: wantedCategory || null,
		matched: hits.length,
		total: PRESET_DEFS.length,
		presets: hits.slice(0, 25).map((preset) => summarize(preset.id)),
	};
}

export interface PresetResolveOk {
	ok: true;
	presetId: string;
	/** Executable script body — feed to a bridge script post or `/batch-step`. */
	script: string;
	rig: ReturnType<typeof derivePresetRig>;
	boundParams: string[];
}

export interface PresetResolveError {
	ok: false;
	error: string;
	knownIds?: number;
	suggestion?: string;
}

/**
 * Resolve one preset by id (aliases accepted) into an executable script body.
 * Unknown params are reported by `compilePreset`'s callee check upstream; this
 * wrapper surfaces unknown ids with the library size so an agent can correct
 * course without a second round trip.
 */
export function resolvePreset(presetId: string, params: Record<string, unknown> = {}): PresetResolveOk | PresetResolveError {
	const resolved = resolvePresetName(String(presetId ?? ""));
	if (!PRESET_DEFS.some((def) => def.id === resolved)) {
		const near = PRESET_DEFS.map((def) => def.id).filter((id) => resolved.length > 3 && id.includes(resolved.slice(0, 4)))[0];
		return { ok: false, error: `Unknown preset: ${presetId}`, knownIds: PRESET_DEFS.length, ...(near ? { suggestion: near } : {}) };
	}
	const def = PRESET_DEFS.find((candidate) => candidate.id === resolved)!;
	return {
		ok: true,
		presetId: resolved,
		script: compilePreset(resolved, params),
		rig: derivePresetRig(def),
		boundParams: Object.keys(params),
	};
}

/** Columns are shared with the in-host serializer in stallion (BatchStep.ts). */
export const COMPACT_TSV_HEADER = "id\ttype\tparent\tname\tx,y,w,h\tanimAttrs\tconnections";

export interface CompactTsvLayer {
	id?: unknown;
	type?: unknown;
	parent?: unknown;
	name?: unknown;
	boundingBox?: { x?: unknown; y?: unknown; width?: unknown; height?: unknown } | null;
	bbox?: { x?: unknown; y?: unknown; width?: unknown; height?: unknown } | null;
	attrs?: Record<string, unknown> | null;
	connected?: Array<{ attrPath?: unknown; from?: unknown }> | null;
}

function cell(value: unknown): string {
	return String(value ?? "").replace(/[\t\n\r]+/g, " ");
}

function num(value: unknown): number {
	const n = Number(value);
	return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function boxOf(layer: CompactTsvLayer): { x: number; y: number; width: number; height: number } {
	const box = layer.boundingBox ?? layer.bbox ?? null;
	if (!box || typeof box !== "object") return { x: 0, y: 0, width: 0, height: 0 };
	return { x: num(box.x), y: num(box.y), width: num(box.width), height: num(box.height) };
}

/**
 * Serialize readback layers into the compact TSV. Accepts either the readback
 * envelope's `layers` array (`boundingBox` + `attrs` + `connected`) or the
 * leaner batch-step geometry entries (`bbox`). This is the Node-side twin of
 * the in-host serializer in stallion's BatchStep runtime; the cross-check
 * lives in refclone's zero-slop suite.
 */
export function serializeCompactTsv(layers: CompactTsvLayer[]): string {
	if (!Array.isArray(layers)) return COMPACT_TSV_HEADER;
	const rows = layers.map((layer) => {
		const box = boxOf(layer);
		const attrCells = Object.entries(layer.attrs ?? {})
			.slice(0, 16)
			.map(([name, value]) => `${name}=${Array.isArray(value) ? value.join(",") : String(value)}`);
		const connCells = (layer.connected ?? [])
			.slice(0, 8)
			.map((conn) => `${conn?.attrPath ?? ""}<-${conn?.from ?? ""}`)
			.filter((entry) => entry !== "<-");
		return [
			cell(layer.id),
			cell(layer.type),
			cell(layer.parent),
			cell(layer.name),
			[box.x, box.y, box.width, box.height].join(","),
			attrCells.join(";"),
			connCells.join(";"),
		].join("\t");
	});
	return rows.length ? `${COMPACT_TSV_HEADER}\n${rows.join("\n")}` : COMPACT_TSV_HEADER;
}

/** The library's version, for callers that pin against it. */
export const LIB_VERSION = "3.2.0";
