#!/usr/bin/env node
/**
 * scripts/wave2/plan-motion.mjs
 *
 * Standalone beat-sheet planner: one storyboard (scripts/wave2/storyboards/)
 * plus one OpenVideoHarness shot-grammar card and energy-arc skeleton become a
 * frame-accurate JSON plan for `_mg` scene compilation.
 *
 * Contract:
 *   planMotionTimeline({ storyboard, shotGrammar, energyArc, bgm,
 *                        durationSeconds, fps, width, height, beats })
 *
 * The output carries:
 *   - asymmetric frame ranges (no uniform 3-second slides; a hold is budgeted
 *     before the action),
 *   - the four-words-per-beat display-copy cap (motion-launch-videos),
 *   - C1 spline camera waypoints sampled with the `splineAt` cubic Hermite
 *     mirror from src/runtime/mg_helpers.ts,
 *   - Fitts's Law cursor targets sampled with `fittsCursorAt`,
 *   - cat16 card-world preset ids (21 builders, incl. page_turn_book),
 *   - frame-accurate SFX cues mapped onto the action catalogue in beats.ts.
 *
 * The module is self-contained so `node scripts/wave2/plan-motion.mjs` runs
 * before `npm run build`; the only files it reads are the storyboard markdown,
 * the installed OpenVideoHarness skill recipes, the cat16 preset pack and the
 * BGM catalogue in beats.ts.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const PLAN_MOTION_VERSION = '1.0.0'

export const SAAS_STORYBOARDS = Object.freeze([
	'T031', 'T032', 'T033', 'T034', 'T035', 'T036', 'T037', 'T038', 'T039', 'T040'
])

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const STORYBOARD_DIR = path.join(ROOT, 'scripts', 'wave2', 'storyboards')
const GRAMMAR_DIRS = [
	path.join(ROOT, '.qoder', 'skills', 'open-video-harness', 'recipes', 'shot'),
	path.join(ROOT, '.agents', 'skills', 'open-video-harness', 'recipes', 'shot'),
	path.join(ROOT, '..', 'wave2-sources', 'OpenVideoHarness', 'recipes', 'shot')
]
const ARC_DIRS = [
	path.join(ROOT, '.qoder', 'skills', 'open-video-harness', 'recipes', 'sequences'),
	path.join(ROOT, '.agents', 'skills', 'open-video-harness', 'recipes', 'sequences'),
	path.join(ROOT, '..', 'wave2-sources', 'OpenVideoHarness', 'recipes', 'sequences')
]
const CAT16_PATH = path.join(ROOT, 'src', 'presets', 'packs', 'cat16_card_grid_worlds.ts')
const BEATS_PATH = path.join(ROOT, 'src', 'tools', 'beats.ts')

/** The 24 OpenVideoHarness camera shot-grammar cards (recipes/shot/). */
export const SHOT_GRAMMAR_IDS = Object.freeze([
	'close-up', 'crane', 'cross-line', 'direction', 'drift', 'dutch', 'extreme-close',
	'extreme-wide', 'eye-level', 'high-angle', 'hold-line', 'long', 'low-angle',
	'medium-close', 'medium', 'orbit', 'pan', 'pull-out', 'push-in', 'static',
	'tilt', 'top-down', 'track', 'wide'
])

/** The 10 whole-film energy-arc skeletons (recipes/sequences/). */
export const ENERGY_ARC_IDS = Object.freeze([
	'launch-15s', 'explainer-30s', 'product-film-60s', 'time-dilation-replay',
	'machine-eye-portrait', 'making-of-self', 'mascot-style-tour', 'workflow-as-story',
	'data-along-time', 'live-countdown'
])

/** The 21 cat16 builders required by the Wave-2 audit. */
export const CARD_WORLD_PRESET_IDS = Object.freeze([
	'coverflow_3d', 'ferris_wheel_cards', 'cube_roll_3d', 'cylinder_cards_3d',
	'helix_cards_3d', 'sphere_cards_3d', 'z_depth_tunnel',
	'bento_grid_reveal', 'explode_to_grid', 'layout_morph_grid_to_carousel',
	'masonry_zoom_detail', 'grid_recap_zoom_out',
	'card_stack_swipe', 'fan_spread_cards', 'polaroid_drop_table', 'card_flip_3d',
	'page_curl_card', 'page_turn_book', 'accordion_fold_card',
	'lived_in_ui_shells', 'data_globe'
])

const FALLBACK_GRAMMARS = SHOT_GRAMMAR_IDS.map((id) => ({
	id, name: id, oneLiner: '', grammar: id === 'direction' ? 'edit' : 'move'
}))

const FALLBACK_ARCS = [
	{ id: 'launch-15s', name: '15s launch teaser', arc: [3, 4, 1, 5], durationFrames: [420, 480] },
	{ id: 'explainer-30s', name: '30s explainer', arc: [2, 3, 4, 3, 5], durationFrames: [840, 960] },
	{ id: 'product-film-60s', name: '60s product film', arc: [1, 2, 3, 4, 3, 5], durationFrames: [1680, 1920] },
	{ id: 'time-dilation-replay', name: 'time dilation replay', arc: [1, 2, 5, 2, 4], durationFrames: [1800, 4500] },
	{ id: 'machine-eye-portrait', name: 'machine-eye portrait', arc: [1, 2, 3, 2, 4, 5], durationFrames: [4500, 7200] },
	{ id: 'making-of-self', name: 'making of self', arc: [2, 3, 4, 5], durationFrames: [600, 1800] },
	{ id: 'mascot-style-tour', name: 'mascot style tour', arc: [2, 3, 4, 3, 5], durationFrames: [450, 1800] },
	{ id: 'workflow-as-story', name: 'workflow as story', arc: [2, 3, 4, 3, 5], durationFrames: [600, 1800] },
	{ id: 'data-along-time', name: 'data along time', arc: [2, 3, 4, 2, 5], durationFrames: [1800, 4500] },
	{ id: 'live-countdown', name: 'live countdown', arc: [2, 3, 4, 5], durationFrames: [1200, 3600] }
]

const FALLBACK_BGM = Object.freeze({
	B25: { id: 'B25', name: 'Apple Keynote Minimal Pluck', bpm: 116, character: 'felt marimba, soft sub, rim click' },
	B26: { id: 'B26', name: 'Framer / Linear SaaS Groove', bpm: 122, character: 'warm house bass, Rhodes 7ths' }
})

// Display type never exceeds four words per beat (motion-launch-videos brief).
const MAX_DISPLAY_WORDS = 4
// A hold is budgeted before the action; >= 0.7 s keeps the read honest.
const MIN_READ_HOLD_SECONDS = 0.7
// Deterministic asymmetry vector: no two adjacent scenes share a duration.
const ASYMMETRY_VECTOR = [1.16, 0.84, 1.04, 0.9, 1.12, 0.96, 1.08]

const CJK = /[\u3400-\u9fff\uf900-\ufaff]/
const WORD_TOKEN = /[\u3400-\u9fff\uf900-\ufaff]|[A-Za-z0-9][A-Za-z0-9'’._-]*/g

function fail(code, message, details = {}) {
	const error = new Error(`${code}: ${message}`)
	error.code = code
	error.details = details
	throw error
}

function readFrontmatter(text) {
	const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
	if (!match) return {}
	const data = {}
	for (const line of match[1].split(/\r?\n/)) {
		const pair = /^([A-Za-z_]+):\s*(.*)$/.exec(line)
		if (!pair) continue
		const [, key, raw] = pair
		const value = raw.trim()
		if (value.startsWith('[') && value.endsWith(']')) {
			data[key] = value.slice(1, -1).split(',').map((part) => {
				const item = part.trim()
				return /^-?\d+(\.\d+)?$/.test(item) ? Number(item) : item.replace(/^["']|["']$/g, '')
			})
		} else if (value !== '') {
			data[key] = value.replace(/^["']|["']$/g, '')
		}
	}
	return data
}

function firstDirectory(candidates) {
	for (const directory of candidates) {
		try {
			if (fs.statSync(directory).isDirectory()) return directory
		} catch {
			// try the next candidate
		}
	}
	return null
}

function loadShotGrammars() {
	const directory = firstDirectory(GRAMMAR_DIRS)
	if (!directory) return FALLBACK_GRAMMARS.map((item) => ({ ...item }))
	const cards = []
	for (const file of fs.readdirSync(directory).filter((name) => name.endsWith('.md')).sort()) {
		const front = readFrontmatter(fs.readFileSync(path.join(directory, file), 'utf8'))
		if (typeof front.id !== 'string') continue
		cards.push({
			id: front.id,
			name: typeof front.name === 'string' ? front.name : front.id,
			oneLiner: typeof front.one_liner === 'string' ? front.one_liner : '',
			grammar: typeof front.grammar === 'string' ? front.grammar : 'move'
		})
	}
	return cards.length === 24 ? cards : FALLBACK_GRAMMARS.map((item) => ({ ...item }))
}

function loadEnergyArcs() {
	const directory = firstDirectory(ARC_DIRS)
	if (!directory) return FALLBACK_ARCS.map((item) => ({ ...item, arc: [...item.arc] }))
	const arcs = []
	for (const file of fs.readdirSync(directory).filter((name) => name.endsWith('.md') && name !== 'README.md').sort()) {
		const front = readFrontmatter(fs.readFileSync(path.join(directory, file), 'utf8'))
		if (typeof front.id !== 'string' || !Array.isArray(front.arc) || !front.arc.length) continue
		arcs.push({
			id: front.id,
			name: typeof front.name === 'string' ? front.name : front.id,
			oneLiner: typeof front.one_liner === 'string' ? front.one_liner : '',
			arc: front.arc.filter((value) => Number.isFinite(value)).map(Number),
			durationFrames: Array.isArray(front.duration_f) ? front.duration_f.map(Number) : null
		})
	}
	return arcs.length === 10 ? arcs : FALLBACK_ARCS.map((item) => ({ ...item, arc: [...item.arc] }))
}

function loadCardWorldPresets() {
	try {
		const source = fs.readFileSync(CAT16_PATH, 'utf8')
		const ids = []
		for (const match of source.matchAll(/^\s{4}id:\s*"([a-z0-9_]+)",\s*$/gm)) ids.push(match[1])
		if (ids.length >= CARD_WORLD_PRESET_IDS.length) return ids
	} catch {
		// fall through to the frozen audit list
	}
	return [...CARD_WORLD_PRESET_IDS]
}

function loadBgmCatalogue() {
	try {
		const source = fs.readFileSync(BEATS_PATH, 'utf8')
		const seed = /const BGM_SEED: Array<\[string, number, string\]> = \[([\s\S]*?)\n\];/.exec(source)
		if (seed) {
			const catalogue = new Map()
			for (const match of seed[1].matchAll(/\["([^"]+)",\s*(\d+),\s*"([^"]+)"\]/g)) {
				const index = catalogue.size
				const id = `B${String(index).padStart(2, '0')}`
				catalogue.set(id, { id, name: match[1], bpm: Number(match[2]), character: match[3] })
			}
			if (catalogue.size === 40) return catalogue
		}
	} catch {
		// fall through to the two documented defaults
	}
	return new Map(Object.entries(FALLBACK_BGM))
}

function parseStoryboard(id) {
	const files = fs.existsSync(STORYBOARD_DIR)
		? fs.readdirSync(STORYBOARD_DIR).filter((name) => /^\d{2}-.+\.md$/.test(name)).sort()
		: []
	let found = null
	for (const file of files) {
		const body = fs.readFileSync(path.join(STORYBOARD_DIR, file), 'utf8')
		for (const block of body.split(/\n(?=### T\d{3}\b)/)) {
			const heading = /^### (T\d{3}) · (.+)$/m.exec(block)
			if (!heading || heading[1] !== id) continue
			found = { block, title: heading[2].trim(), file }
			break
		}
		if (found) break
	}
	if (!found) fail('PLAN_STORYBOARD_UNKNOWN', `Unknown storyboard ${JSON.stringify(id)}.`, { known: SAAS_STORYBOARDS })
	const [headingLine, metadata = ''] = found.block.split(/\r?\n/)
	const durationSeconds = Number((/durasi\s+([\d.]+)\s*s/i.exec(metadata) ?? [])[1])
	const aspect = /\b(16:9|9:16|1:1)\b/.exec(metadata)?.[1] ?? '16:9'
	const style = /gaya\s+"([^"]+)"/i.exec(metadata)?.[1] ?? null
	const bgmId = (/\bbgm\s+(B\d{2})/i.exec(metadata)?.[1] ?? '').toUpperCase() || null
	const components = [...metadata.matchAll(/<([^>]+)>/g)].map((m) => m[1])
	const beats = []
	for (const line of found.block.split(/\r?\n/)) {
		if (!/^\|\s*\d+\s*\|/.test(line)) continue
		const cells = line.split('|').slice(1, -1).map((cell) => cell.trim())
		if (cells.length !== 7) continue
		const range = /^([\d.]+)\s*[–\-—]\s*([\d.]+)$/.exec(cells[1] ?? '')
		if (!range) continue
		beats.push({
			number: Number(cells[0]),
			startSeconds: Number(range[1]),
			endSeconds: Number(range[2]),
			visual: cells[2] ?? '',
			motion: cells[3] ?? '',
			camera: (cells[4] ?? 'HOLD').toUpperCase(),
			transition: cells[5] ?? 'MC',
			rawSfx: cells[6] ?? ''
		})
	}
	if (!beats.length) fail('PLAN_STORYBOARD_EMPTY', `Storyboard ${id} carries no beat rows.`)
	if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
		fail('PLAN_STORYBOARD_DURATION', `Storyboard ${id} has no valid "durasi <n>s" metadata.`)
	}
	return {
		id, title: found.title, file: found.file, durationSeconds, aspect, style, bgmId, components, beats,
		heading: headingLine
	}
}

function wordTokens(text) {
	return String(text ?? '').match(WORD_TOKEN) ?? []
}

function joinTokens(tokens) {
	let out = ''
	for (const token of tokens) {
		const needsSpace = out !== '' && !(CJK.test(token) && CJK.test(out.at(-1)))
		out += `${needsSpace ? ' ' : ''}${token}`
	}
	return out
}

const TRAILING_CONNECTORS = new Set([
	'dan', 'atau', 'the', 'and', 'of', 'for', 'to', 'with', 'on', 'in', 'is',
	'di', 'ke', 'dari', 'untuk', 'pada', 'yang', 'ini', 'itu', 'sebagai', 'dengan'
])

function displayCopyFromVisual(visual) {
	const cleaned = String(visual ?? '')
		.replace(/<[^>]*>/g, ' ')
		.replace(/`[^`]*`/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
	const clause = cleaned.split(/[，,。.；;：:]/)[0].trim() || cleaned
	const tokens = wordTokens(clause).slice(0, MAX_DISPLAY_WORDS)
	while (tokens.length > 1 && TRAILING_CONNECTORS.has(tokens.at(-1).toLowerCase())) tokens.pop()
	return joinTokens(tokens)
}

function resampleArc(arc, count) {
	if (count <= 0) return []
	if (arc.length === 1) return new Array(count).fill(arc[0])
	return Array.from({ length: count }, (_, index) => {
		const position = count === 1 ? 0 : (index * (arc.length - 1)) / (count - 1)
		const lower = Math.floor(position)
		const upper = Math.min(arc.length - 1, Math.ceil(position))
		const t = position - lower
		return arc[lower] + (arc[upper] - arc[lower]) * t
	})
}

function splitFrames(totalFrames, weights) {
	const sum = weights.reduce((acc, value) => acc + value, 0)
	const exact = weights.map((value) => (value / sum) * totalFrames)
	const frames = exact.map((value) => Math.max(2, Math.round(value)))
	let difference = totalFrames - frames.reduce((acc, value) => acc + value, 0)
	if (difference > 0) {
		const order = exact
			.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
			.sort((a, b) => b.fraction - a.fraction || a.index - b.index)
		for (let i = 0; i < difference; i += 1) frames[order[i % order.length].index] += 1
	} else if (difference < 0) {
		const order = frames
			.map((value, index) => ({ index, value }))
			.sort((a, b) => b.value - a.value || a.index - b.index)
		let guard = difference
		while (guard < 0) {
			let moved = false
			for (const entry of order) {
				if (frames[entry.index] > 3) {
					frames[entry.index] -= 1
					guard += 1
					moved = true
					if (guard === 0) break
				}
			}
			if (!moved) break
		}
	}
	const drift = totalFrames - frames.reduce((acc, value) => acc + value, 0)
	if (drift !== 0) frames[frames.length - 1] += drift
	return frames
}

// C1 cubic Hermite mirror of `splineAt` in src/runtime/mg_helpers.ts.
function splineAt(frame, keyframes) {
	const n = keyframes.length
	if (!n) return []
	if (frame <= keyframes[0][0]) return keyframes[0].slice(1)
	if (frame >= keyframes[n - 1][0]) return keyframes[n - 1].slice(1)
	let i = 0
	for (let k = 0; k < n - 1; k += 1) {
		if (frame >= keyframes[k][0] && frame <= keyframes[k + 1][0]) {
			i = k
			break
		}
	}
	const p0 = keyframes[Math.max(0, i - 1)]
	const p1 = keyframes[i]
	const p2 = keyframes[i + 1]
	const p3 = keyframes[Math.min(n - 1, i + 2)]
	const dt = p2[0] - p1[0]
	if (dt <= 0) return p1.slice(1)
	const u = Math.max(0, Math.min(1, (frame - p1[0]) / dt))
	const u2 = u * u
	const u3 = u2 * u
	const dimensions = p1.length - 1
	const out = new Array(dimensions)
	for (let d = 1; d <= dimensions; d += 1) {
		const y0 = p0[d], y1 = p1[d], y2 = p2[d], y3 = p3[d]
		const m1 = i === 0 ? 0
			: Math.abs(y1 - y0) < 1e-4 || Math.abs(y2 - y1) < 1e-4 ? 0
				: ((y2 - y0) / (p2[0] - p0[0])) * dt
		const m2 = i + 1 === n - 1 ? 0
			: Math.abs(y3 - y2) < 1e-4 || Math.abs(y2 - y1) < 1e-4 ? 0
				: ((y3 - y1) / (p3[0] - p1[0])) * dt
		out[d - 1] = (2 * u3 - 3 * u2 + 1) * y1 + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * y2 + (u3 - u2) * m2
	}
	return out
}

// Mirror of `fittsCursorAt` in src/runtime/mg_helpers.ts.
function fittsCursorAt(frame, trajectory) {
	if (!trajectory.length) return null
	const points = [...trajectory].sort((a, b) => a[0] - b[0])
	if (frame <= points[0][0]) return { x: points[0][1], y: points[0][2] }
	const last = points[points.length - 1]
	if (frame >= last[0]) return { x: last[1], y: last[2] }
	for (let i = 0; i < points.length - 1; i += 1) {
		const a = points[i], b = points[i + 1]
		if (frame < a[0] || frame > b[0]) continue
		const span = b[0] - a[0]
		if (span <= 0) return { x: b[1], y: b[2] }
		const t = (frame - a[0]) / span
		const eased = 1 - Math.pow(1 - t, 3)
		return { x: a[1] + (b[1] - a[1]) * eased, y: a[2] + (b[2] - a[2]) * eased }
	}
	return { x: last[1], y: last[2] }
}

// The existing Fitts trajectory builder is a compile-time helper; this mirror
// keeps the CLI dependency-free while the test suite cross-checks the output
// against src/runtime/mg_helpers.ts.
function fittsTrajectory(targets, { fps = 30, startFrame = 0 } = {}) {
	const a = 0.05, b = 0.12, over = 4.5
	const out = []
	let frame = Math.round(startFrame)
	let prevX = targets[0]?.x ?? 0
	let prevY = targets[0]?.y ?? 0
	out.push([frame, prevX, prevY])
	for (let i = 1; i < targets.length; i += 1) {
		const target = targets[i]
		const dx = target.x - prevX, dy = target.y - prevY
		const distance = Math.max(1, Math.hypot(dx, dy))
		const movement = a + b * Math.log2((2 * distance) / Math.max(1, target.width ?? 48))
		const travel = Math.max(2, Math.round(movement * fps))
		const arrive = frame + travel
		if (target.click) {
			const fOver = Math.max(frame + 1, arrive - Math.round(travel * 0.28))
			const fSettle = Math.max(fOver + 1, arrive - Math.round(travel * 0.16))
			out.push([fOver, target.x + (dx / distance) * over, target.y + (dy / distance) * over])
			out.push([fSettle, target.x, target.y])
		}
		out.push([arrive, target.x, target.y])
		frame = arrive
		prevX = target.x
		prevY = target.y
	}
	return out.sort((left, right) => left[0] - right[0])
}

const CAMERA_PRESETS = {
	HOLD: { zoom: 0, panX: 0, panY: 0, rotation: 0 },
	PUSH: { zoom: 0.09, panX: 0, panY: 0, rotation: 0 },
	PULL: { zoom: -0.07, panX: 0, panY: 0, rotation: 0 },
	GLIDE: { zoom: 0.02, panX: 46, panY: 0, rotation: 0 },
	CURSOR: { zoom: 0.05, panX: 14, panY: 9, rotation: 0 },
	TYPE: { zoom: 0, panX: 0, panY: 0, rotation: 0 }
}

const GRAMMAR_MOTION = {
	'push-in': { zoom: 0.11, panX: 0, panY: 0, rotation: 0 },
	'pull-out': { zoom: -0.09, panX: 0, panY: 0, rotation: 0 },
	pan: { zoom: 0.01, panX: 64, panY: 0, rotation: 0 },
	track: { zoom: 0.02, panX: 52, panY: 4, rotation: 0 },
	tilt: { zoom: 0.01, panX: 0, panY: 48, rotation: 0 },
	crane: { zoom: 0.03, panX: 0, panY: 56, rotation: 0 },
	orbit: { zoom: 0.04, panX: 36, panY: 10, rotation: 1.6 },
	dutch: { zoom: 0.02, panX: 0, panY: 0, rotation: 3.2 },
	drift: { zoom: 0.02, panX: 22, panY: 10, rotation: 0.6 },
	static: { zoom: 0, panX: 0, panY: 0, rotation: 0 },
	'hold-line': { zoom: 0, panX: 0, panY: 0, rotation: 0 },
	'direction': { zoom: 0, panX: 0, panY: 0, rotation: 0 },
	'cross-line': { zoom: 0.03, panX: -40, panY: 0, rotation: 0 },
	'close-up': { zoom: 0.12, panX: 0, panY: 0, rotation: 0 },
	'extreme-close': { zoom: 0.18, panX: 0, panY: 0, rotation: 0 },
	'medium-close': { zoom: 0.09, panX: 0, panY: 0, rotation: 0 },
	medium: { zoom: 0.05, panX: 0, panY: 0, rotation: 0 },
	long: { zoom: -0.03, panX: 0, panY: 0, rotation: 0 },
	wide: { zoom: -0.05, panX: 0, panY: 0, rotation: 0 },
	'extreme-wide': { zoom: -0.08, panX: 0, panY: 0, rotation: 0 },
	'eye-level': { zoom: 0.03, panX: 0, panY: 0, rotation: 0 },
	'high-angle': { zoom: 0.03, panY: -18, rotation: 0, panX: 0 },
	'low-angle': { zoom: 0.03, panY: 18, panX: 0, rotation: 0 },
	'top-down': { zoom: 0.04, panY: -26, panX: 0, rotation: 0 }
}

function cameraMotion(beat, shotGrammarId) {
	if (shotGrammarId) return GRAMMAR_MOTION[shotGrammarId] ?? CAMERA_PRESETS.HOLD
	return CAMERA_PRESETS[beat.camera] ?? CAMERA_PRESETS.HOLD
}

function buildCamera({ startFrame, endFrame, motion }) {
	const span = Math.max(1, endFrame - startFrame)
	const half = Math.round(span / 2)
	const keyframes = [
		[startFrame, 0, 0, 1, 0],
		[startFrame + half, motion.panX * 0.45, motion.panY * 0.45, 1 + motion.zoom * 0.55, motion.rotation * 0.4],
		[endFrame, motion.panX, motion.panY, 1 + motion.zoom, motion.rotation]
	]
	const sampleFrames = [startFrame, startFrame + Math.round(span * 0.25), startFrame + half, startFrame + Math.round(span * 0.75), endFrame]
	return {
		keyframes,
		samples: sampleFrames.map((frame) => {
			const [x, y, scale, rotation] = splineAt(frame, keyframes)
			return { frame, x: round(x), y: round(y), scale: round(scale), rotation: round(rotation) }
		})
	}
}

const SFX_RULES = [
	[/^TYPE\b/i, 'click'],
	[/\bCLICK\b|^tap\b/i, 'click'],
	[/impact|sub.?drop|boom/i, 'subDrop'],
	[/pop/i, 'pop'],
	[/whoosh|swipe|whip/i, 'whoosh'],
	[/riser|rise/i, 'riser'],
	[/data.?reveal|confirm|chime|ding/i, 'chime']
]

function parseSfx(raw) {
	const tokens = String(raw ?? '')
		.replace(/\([^)]*\)/g, ' ')
		.split(/[,;+/]/)
		.map((value) => value.trim())
		.filter((value) => value && !/^[—–-]+$/.test(value))
	const cues = []
	const unknown = []
	for (const token of tokens) {
		const rule = SFX_RULES.find(([pattern]) => pattern.test(token))
		if (rule) cues.push({ action: token, kind: rule[1] })
		else unknown.push(token)
	}
	return { cues, unknown }
}

function presetFor(beat, presets, index) {
	const text = `${beat.visual} ${beat.motion}`
	const rules = [
		[/globe|world|map|arc/i, ['data_globe']],
		[/terminal|browser|window|chrome|shell|console/i, ['lived_in_ui_shells']],
		[/ponsel|mobile|phone|aplikasi|app\b|layar|dashboard|ui\b|antarmuka/i, ['lived_in_ui_shells', 'card_stack_swipe', 'card_flip_3d', 'fan_spread_cards']],
		[/masonry/i, ['masonry_zoom_detail']],
		[/polaroid|foto|photo/i, ['polaroid_drop_table']],
		[/fan.?spread|kipas|deck/i, ['fan_spread_cards']],
		[/carousel|coverflow|shelf|rak/i, ['coverflow_3d']],
		[/cylinder|silinder|wrap/i, ['cylinder_cards_3d']],
		[/helix|spiral|spiral/i, ['helix_cards_3d']],
		[/sphere|bola|orbit/i, ['sphere_cards_3d']],
		[/ferris|wheel|roda/i, ['ferris_wheel_cards']],
		[/cube|kubus|roll/i, ['cube_roll_3d']],
		[/tunnel|terowongan|depth|kedalaman/i, ['z_depth_tunnel']],
		[/accordion|akordeon|fold|lipat/i, ['accordion_fold_card']],
		[/curl|peel/i, ['page_curl_card']],
		[/book|buku|page|halaman|chapter|bab/i, ['page_turn_book']],
		[/flip|balik|3d/i, ['card_flip_3d']],
		[/explode|scatter|sebar/i, ['explode_to_grid']],
		[/bento|grid|tile|kisi/i, ['bento_grid_reveal']],
		[/morph|layout|tata letak/i, ['layout_morph_grid_to_carousel']],
		[/recap|summary|ringkasan/i, ['grid_recap_zoom_out']],
		[/stack|swipe|card|kartu/i, ['card_stack_swipe', 'fan_spread_cards', 'card_flip_3d']]
	]
	for (const [pattern, candidates] of rules) {
		if (!pattern.test(text)) continue
		const available = candidates.filter((id) => presets.includes(id))
		if (available.length) return available[index % available.length]
	}
	return presets[index % presets.length]
}

function round(value, digits = 4) {
	const factor = 10 ** digits
	return Math.round(value * factor) / factor
}

function defaultDimensions(aspect, width, height) {
	if (Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0) return { width, height }
	if (aspect === '9:16') return { width: 1080, height: 1920 }
	if (aspect === '1:1') return { width: 1080, height: 1080 }
	return { width: 1920, height: 1080 }
}

/**
 * Plan one storyboard into a deterministic, frame-accurate beat sheet.
 * @param {object} options
 * @param {string} [options.storyboard='T031']  T001-T103 template id
 * @param {string} [options.shotGrammar]       one of SHOT_GRAMMAR_IDS
 * @param {string} [options.energyArc]         one of ENERGY_ARC_IDS
 * @param {string} [options.bgm]               B00-B39
 * @param {number} [options.durationSeconds]   overrides the storyboard duration
 * @param {number} [options.fps=30]
 * @param {number} [options.width]
 * @param {number} [options.height]
 * @param {Array<{copy?:string}>} [options.beats] per-scene copy overrides
 * @returns {object} beat sheet
 */
export function planMotionTimeline(options = {}) {
	const storyboardId = String(options.storyboard ?? 'T031').toUpperCase()
	if (!/^T\d{3}$/.test(storyboardId)) fail('PLAN_STORYBOARD_INVALID', 'storyboard must look like T031.')
	const storyboard = parseStoryboard(storyboardId)

	const fps = options.fps ?? 30
	if (!Number.isInteger(fps) || fps < 1 || fps > 120) fail('PLAN_FPS_INVALID', 'fps must be an integer in [1,120].')
	const durationSeconds = options.durationSeconds ?? storyboard.durationSeconds
	if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) fail('PLAN_DURATION_INVALID', 'durationSeconds must be positive.')
	const totalFrames = Math.max(storyboard.beats.length * 2, Math.round(durationSeconds * fps))

	const grammars = loadShotGrammars()
	if (options.shotGrammar && !grammars.some((card) => card.id === options.shotGrammar)) {
		fail('PLAN_SHOT_GRAMMAR_UNKNOWN', `Unknown shot grammar ${JSON.stringify(options.shotGrammar)}.`, {
			known: grammars.map((card) => card.id)
		})
	}
	const grammar = options.shotGrammar ? grammars.find((card) => card.id === options.shotGrammar) : null

	const arcs = loadEnergyArcs()
	let arc = null
	if (options.energyArc) {
		arc = arcs.find((candidate) => candidate.id === options.energyArc) ?? null
		if (!arc) fail('PLAN_ENERGY_ARC_UNKNOWN', `Unknown energy arc ${JSON.stringify(options.energyArc)}.`, { known: arcs.map((candidate) => candidate.id) })
	} else if (storyboard.beats.length === 1) {
		arc = arcs.find((candidate) => candidate.id === 'launch-15s') ?? null
	} else if (durationSeconds <= 18) {
		arc = arcs.find((candidate) => candidate.id === 'launch-15s') ?? null
	} else if (durationSeconds <= 40) {
		arc = arcs.find((candidate) => candidate.id === 'explainer-30s') ?? null
	} else {
		arc = arcs.find((candidate) => candidate.id === 'product-film-60s') ?? null
	}
	const arcValues = resampleArc(arc?.arc ?? [3, 3, 3], storyboard.beats.length)

	const bgmId = String(options.bgm ?? storyboard.bgmId ?? 'B26').toUpperCase()
	if (!/^B\d{2}$/.test(bgmId)) fail('PLAN_BGM_INVALID', 'bgm must look like B26.')
	const bgm = loadBgmCatalogue().get(bgmId) ?? null
	if (!bgm) fail('PLAN_BGM_UNKNOWN', `Unknown BGM ${JSON.stringify(bgmId)}; the catalogue is B00-B39.`)

	const presets = loadCardWorldPresets()
	const dimensions = defaultDimensions(storyboard.aspect, options.width, options.height)

	const weights = storyboard.beats.map((_, index) => {
		const energy = clampNumber(arcValues[index], 0, 5)
		return (0.75 + energy) * ASYMMETRY_VECTOR[index % ASYMMETRY_VECTOR.length]
	})
	const durations = splitFrames(totalFrames, weights)

	const warnings = []
	const beats = []
	const sfx = []
	const cursorTargets = []
	const presetsUsed = []
	let frameCursor = 0
	for (let index = 0; index < storyboard.beats.length; index += 1) {
		const source = storyboard.beats[index]
		const duration = durations[index]
		const startFrame = frameCursor
		const endFrame = Math.min(totalFrames, startFrame + duration)
		frameCursor = endFrame
		const motionKey = grammar ? null : source.camera
		const motion = cameraMotion(source, grammar?.id ?? null)
		const camera = buildCamera({ startFrame, endFrame, motion })

		const override = options.beats?.[index]
		let copy
		if (override?.copy != null) {
			const count = wordTokens(override.copy).length
			if (count > MAX_DISPLAY_WORDS) {
				fail('PLAN_WORD_BUDGET', `Beat ${index + 1} carries ${count} display words; the cap is ${MAX_DISPLAY_WORDS}.`, {
					scene: index + 1, copy: override.copy
				})
			}
			copy = String(override.copy).trim()
		} else {
			copy = displayCopyFromVisual(source.visual)
		}
		const wordCount = wordTokens(copy).length
		const readHoldFrames = Math.ceil(MIN_READ_HOLD_SECONDS * fps)
		if (duration < readHoldFrames) warnings.push(`Scene ${index + 1} is ${duration} frames, below the ${readHoldFrames}-frame readability hold.`)

		const presetId = presetFor(source, presets, index)
		presetsUsed.push({ scene: index + 1, presetId })

		const parsedSfx = parseSfx(source.rawSfx)
		for (const token of parsedSfx.unknown) warnings.push(`Scene ${index + 1}: unmapped SFX ${JSON.stringify(token)}.`)
		for (const cue of parsedSfx.cues) {
			const offset = cue.kind === 'click' || cue.kind === 'pop' ? 2 : cue.kind === 'chime' ? 4 : 0
			const frame = Math.min(endFrame - 1, startFrame + offset)
			if (frame >= startFrame) sfx.push({ scene: index + 1, frame, action: cue.action, kind: cue.kind })
		}

		let cursor = null
		if (!grammar && source.camera === 'CURSOR') {
			const targets = [
				{ x: Math.round(dimensions.width * 0.28), y: Math.round(dimensions.height * 0.58), width: 140 },
				{ x: Math.round(dimensions.width * 0.63), y: Math.round(dimensions.height * 0.62), width: 96, click: true }
			]
			const trajectory = fittsTrajectory(targets, { fps, startFrame: startFrame + 2 })
			const sampleFrames = [startFrame + 2, startFrame + Math.round(duration / 2), endFrame - 1]
			cursor = {
				targets,
				trajectory,
				samples: sampleFrames.map((frame) => ({ frame, ...fittsCursorAt(frame, trajectory) }))
			}
			cursorTargets.push({ scene: index + 1, targets, trajectory })
		}

		beats.push({
			scene: index + 1,
			storyboardBeat: source.number,
			title: storyboard.title,
			startFrame,
			endFrame,
			frameRange: `${startFrame}-${endFrame}`,
			durationFrames: duration,
			durationSeconds: round(duration / fps),
			startSeconds: round(startFrame / fps),
			endSeconds: round(endFrame / fps),
			energy: round(arcValues[index], 3),
			displayCopy: copy,
			wordBudget: { max: MAX_DISPLAY_WORDS, count: wordCount, ok: wordCount <= MAX_DISPLAY_WORDS },
			readHoldFrames,
			readHoldOk: duration >= readHoldFrames,
			cameraBehavior: grammar?.id ?? motionKey,
			cameraMotion: motion,
			camera,
			presetId,
			sfx: parsedSfx.cues.map((cue) => ({ ...cue, frame: Math.min(endFrame - 1, startFrame + (cue.kind === 'click' || cue.kind === 'pop' ? 2 : cue.kind === 'chime' ? 4 : 0)) })),
			cursor
		})
	}

	const durationsOnly = beats.map((beat) => beat.durationFrames)
	const spread = Math.max(...durationsOnly) - Math.min(...durationsOnly)
	const minSpread = Math.max(2, Math.round(totalFrames * 0.04))
	if (beats.length > 1 && spread < minSpread) {
		warnings.push(`Beat durations are within ${spread} frames; the asymmetry rule expects >= ${minSpread}.`)
	}

	const wordCheck = beats.every((beat) => beat.wordBudget.ok)
	const durationCheck = beats.length === 1 || spread >= minSpread
	return {
		version: PLAN_MOTION_VERSION,
		storyboard: {
			id: storyboard.id, title: storyboard.title, file: storyboard.file,
			sourceDurationSeconds: storyboard.durationSeconds, aspect: storyboard.aspect,
			style: storyboard.style, components: storyboard.components
		},
		fps,
		durationSeconds: round(totalFrames / fps),
		totalFrames,
		width: dimensions.width,
		height: dimensions.height,
		energyArc: arc ? {
			id: arc.id, name: arc.name, oneLiner: arc.oneLiner ?? '',
			arc: [...arc.arc], resampled: arcValues.map((value) => round(value, 3))
		} : null,
		shotGrammar: grammar ? { id: grammar.id, name: grammar.name, grammar: grammar.grammar } : null,
		bgm,
		beats,
		sfx,
		cursorTargets,
		presets: presetsUsed,
		checks: {
			wordBudget: wordCheck ? 'pass' : 'fail',
			maxWordsPerBeat: MAX_DISPLAY_WORDS,
			asymmetricDurations: durationCheck ? 'pass' : 'fail',
			durationSpreadFrames: Math.max(...beats.map((beat) => beat.durationFrames)) - Math.min(...beats.map((beat) => beat.durationFrames)),
			frameRangesContiguous: beats.every((beat, index) => index === 0 || beat.startFrame === beats[index - 1].endFrame),
			sfxWithinRanges: sfx.every((cue) => beats.every((beat) => cue.scene !== beat.scene || (cue.frame >= beat.startFrame && cue.frame < beat.endFrame)))
		},
		warnings
	}
}

function clampNumber(value, min, max) {
	return Math.max(min, Math.min(max, Number(value) || 0))
}

function parseArgs(argv) {
	const options = {}
	for (let index = 2; index < argv.length; index += 1) {
		const flag = argv[index]
		if (flag === '--help' || flag === '-h') return { help: true }
		const value = argv[index + 1]
		if (value === undefined || value.startsWith('--')) fail('PLAN_ARGS_INVALID', `Missing value for ${flag}.`)
		switch (flag) {
			case '--storyboard': options.storyboard = value; break
			case '--shot-grammar': options.shotGrammar = value; break
			case '--energy-arc': options.energyArc = value; break
			case '--bgm': options.bgm = value; break
			case '--duration': options.durationSeconds = Number(value); break
			case '--fps': options.fps = Number(value); break
			case '--width': options.width = Number(value); break
			case '--height': options.height = Number(value); break
			case '--out': options.out = value; break
			default: fail('PLAN_ARGS_INVALID', `Unknown option ${flag}.`)
		}
		index += 1
	}
	return options
}

function helpText() {
	return [
		'Usage: node scripts/wave2/plan-motion.mjs [options]',
		'',
		'  --storyboard <T001..T103>  template id (default T031; SaaS range T031-T040)',
		`  --shot-grammar <cardId>    one of ${SHOT_GRAMMAR_IDS.join(', ')}`,
		`  --energy-arc <skeletonId>  one of ${ENERGY_ARC_IDS.join(', ')}`,
		'  --bgm <B00..B39>           BGM bed (default from the storyboard, else B26)',
		'  --duration <seconds>       override the storyboard duration',
		'  --fps <fps>                frame rate (default 30)',
		'  --width/--height <px>      override the aspect-derived canvas',
		'  --out <filepath>           write the JSON beat sheet (default stdout)',
		''
	].join('\n')
}

const invokedDirectly = (() => {
	try {
		return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false
	} catch {
		return false
	}
})()

if (invokedDirectly) {
	try {
		const options = parseArgs(process.argv)
		if (options.help) {
			process.stdout.write(helpText())
		} else {
			const { out, ...planOptions } = options
			const plan = planMotionTimeline(planOptions)
			const json = `${JSON.stringify(plan, null, 2)}\n`
			if (out) {
				const target = path.resolve(out)
				fs.mkdirSync(path.dirname(target), { recursive: true })
				fs.writeFileSync(target, json)
				process.stdout.write(`wrote ${target} (${plan.beats.length} beats, ${plan.totalFrames} frames)\n`)
			} else {
				process.stdout.write(json)
			}
		}
	} catch (error) {
		process.stderr.write(`${error.message}\n`)
		process.exit(1)
	}
}
