/**
 * Low-token preset discovery index.
 *
 * A precomputed, lightweight index over the 146 procedural SaaS presets (16
 * category packs — plus the procedural/card packs) mapping preset ID,
 * category, motion tags and compact parameter signatures. The MCP lookup
 * query returns ONLY matching signatures and required parameters — never the
 * full preset implementation code — so agent context stays bounded regardless
 * of library size.
 *
 * The index is generated at build time (`scripts/build-discovery-index.mjs`
 * → `dist/presets/discovery_index.json`) and read lazily here; the heavy
 * `cavalry_snippets` preset library is never statically imported by this
 * module (the in-memory fallback rebuilds it only when the artifact is
 * missing, e.g. in tests before a full build).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface DiscoveryParamSignature {
	name: string;
	type: string;
	/** Compact default rendering — never a full implementation. */
	default: string;
}

export interface DiscoveryEntry {
	id: string;
	title: string;
	category: string;
	motionTags: string[];
	requiredParams: string[];
	params: DiscoveryParamSignature[];
	defaultDuration: number;
	summary: string;
}

export interface DiscoveryQueryOptions {
	/** Space-separated keywords; every word must match (AND) across id/title/tags/category/summary. */
	query?: string;
	/** Category filter: id, wire code or label fragment. */
	category?: string;
	/** Tag filter: every tag must appear in the preset's motion tags. */
	tags?: string[];
	/** Max entries returned (default 12, hard cap 48). */
	limit?: number;
}

export interface DiscoveryResult {
	query: string;
	category: string | null;
	tags: string[];
	matched: number;
	total: number;
	presets: Array<Pick<DiscoveryEntry, "id" | "title" | "category" | "motionTags" | "requiredParams" | "params" | "defaultDuration">>;
}

export const DISCOVERY_INDEX_FILE = "presets/discovery_index.json";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const indexFilePath = (): string =>
	process.env.CAVALRY_DISCOVERY_INDEX
		? path.resolve(process.env.CAVALRY_DISCOVERY_INDEX)
		: path.join(root, "dist", DISCOVERY_INDEX_FILE);

let cache: DiscoveryEntry[] | null = null;

/** Build the index in memory from the compiled preset library (fallback path). */
async function buildDiscoveryIndexInMemory(): Promise<DiscoveryEntry[]> {
	const { PRESET_DEFS } = await import("./cavalry_snippets.js");
	const { motionSignatureFor, requiredParamsFor, defaultDurationFor } = await import("./manifest.js");
	return PRESET_DEFS.map((def) => ({
		id: def.id,
		title: def.title,
		category: def.category,
		motionTags: motionSignatureFor(def).split("+").filter(Boolean),
		requiredParams: requiredParamsFor(def),
		params: Object.entries(def.params).map(([name, param]) => ({
			name,
			type: param.type,
			default: renderDefault(param.default),
		})),
		defaultDuration: defaultDurationFor(def),
		summary: def.description,
	}));
}

function renderDefault(value: unknown): string {
	if (value === undefined) return "";
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	if (Array.isArray(value)) return value.join(",");
	return JSON.stringify(value);
}

/**
 * Parse a compact parameter signature ("name:type=default|…") back into
 * structured entries; the artifact stores the machine-compact string form.
 */
function parseParamSignature(signature: string): DiscoveryParamSignature[] {
	if (!signature) return [];
	return signature
		.split("|")
		.filter(Boolean)
		.map((chunk) => {
			const colon = chunk.indexOf(":");
			const equals = chunk.indexOf("=", colon === -1 ? 0 : colon);
			if (colon === -1 || equals === -1) return { name: chunk, type: "string", default: "" };
			return {
				name: chunk.slice(0, colon),
				type: chunk.slice(colon + 1, equals),
				default: chunk.slice(equals + 1),
			};
		});
}

/** Normalize one raw artifact row into a DiscoveryEntry. */
function normalizeEntry(raw: Record<string, unknown>): DiscoveryEntry {
	const params = Array.isArray(raw.params)
		? (raw.params as DiscoveryParamSignature[])
		: parseParamSignature(String(raw.paramSignature ?? ""));
	return {
		id: String(raw.id ?? ""),
		title: String(raw.title ?? ""),
		category: String(raw.category ?? ""),
		motionTags: Array.isArray(raw.motionTags) ? (raw.motionTags as string[]) : [],
		requiredParams: Array.isArray(raw.requiredParams) ? (raw.requiredParams as string[]) : [],
		params,
		defaultDuration: Number(raw.defaultDuration) || 60,
		summary: String(raw.summary ?? ""),
	};
}

/** Load the precomputed discovery index (cached; artifact first, in-memory fallback). */
export async function loadDiscoveryIndex(): Promise<DiscoveryEntry[]> {
	if (cache) return cache;
	const file = indexFilePath();
	try {
		const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { presets?: Array<Record<string, unknown>> };
		if (Array.isArray(parsed.presets) && parsed.presets.length) {
			cache = parsed.presets.map(normalizeEntry);
			return cache;
		}
	} catch {
		// Artifact missing (fresh checkout, partial build) — fall through.
	}
	cache = await buildDiscoveryIndexInMemory();
	return cache;
}

/** Test/CLI hook: drop the cached index. */
export function clearDiscoveryIndexCache(): void {
	cache = null;
}

/** Case-insensitive substring containment on lowercased haystacks. */
function contains(haystacks: string[], needle: string): boolean {
	const n = needle.toLowerCase();
	return haystacks.some((h) => h.toLowerCase().includes(n));
}

/**
 * Zero-bloat lookup: every query word must match (AND) across id/title/motion
 * tags/category/summary; category and tag filters narrow further. Results
 * carry signatures and required parameters ONLY — no preset code.
 */
export async function queryDiscoveryIndex(options: DiscoveryQueryOptions = {}): Promise<DiscoveryResult> {
	const all = await loadDiscoveryIndex();
	const words = (options.query ?? "").split(/\s+/).map((w) => w.trim()).filter(Boolean);
	const category = options.category?.trim() || null;
	const tags = (options.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);
	const limit = Math.max(1, Math.min(Number(options.limit) || 12, 48));

	const candidates = all.filter((entry) => {
		if (category) {
			const c = category.toLowerCase();
			const hit =
				entry.category.toLowerCase() === c ||
				entry.category.toLowerCase().includes(c) ||
				entry.id.toLowerCase().includes(c);
			if (!hit) return false;
		}
		if (tags.length && !tags.every((tag) => entry.motionTags.some((t) => t.toLowerCase().includes(tag)))) return false;
		if (!words.length) return true;
		const haystacks = [entry.id, entry.title, entry.category, entry.summary, entry.motionTags.join(" ")];
		return words.every((word) => contains(haystacks, word));
	});

	return {
		query: words.join(" "),
		category,
		tags,
		matched: candidates.length,
		total: all.length,
		presets: candidates.slice(0, limit).map((entry) => ({
			id: entry.id,
			title: entry.title,
			category: entry.category,
			motionTags: entry.motionTags,
			requiredParams: entry.requiredParams,
			params: entry.params,
			defaultDuration: entry.defaultDuration,
		})),
	};
}
