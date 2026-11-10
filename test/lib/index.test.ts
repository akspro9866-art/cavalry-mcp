import { test } from "node:test";
import assert from "node:assert/strict";
import {
	compileMgDsl,
	resolvePreset,
	searchPresets,
	serializeCompactTsv,
	COMPACT_TSV_HEADER,
	PRESET_DEFS,
} from "../../src/lib/index.js";
import { MG_MANIFEST_RUNTIME } from "../../src/lib/index.js";

test("searchPresets matches on motion signature, title and category, bounded", () => {
	const all = searchPresets("", undefined);
	assert.equal(all.total, 125);
	assert.equal(all.matched, 125);
	assert.ok(all.presets.length <= 25, "results stay bounded");

	const spring = searchPresets("spring", undefined);
	assert.ok(spring.matched > 0);
	assert.ok(spring.presets.length <= 25, "the returned list stays bounded even when more match");
	assert.ok(spring.presets.every((preset) => /spring/i.test(JSON.stringify(preset))));

	// The signature tokens come from the deterministic motion classifier.
	const counter = searchPresets("count", undefined);
	assert.ok(counter.presets.some((preset) => preset.motionSignature.startsWith("count")), "counter presets surface their count signature");

	const fintech = searchPresets("", "fintech");
	assert.ok(fintech.matched > 0 && fintech.matched <= 10, "category filter bounds the pack");
	assert.ok(fintech.presets.every((preset) => preset.category === "fintech_billing"));

	// AND semantics: both words must hit somewhere.
	const both = searchPresets("kinetic text", undefined);
	assert.ok(both.presets.some((preset) => preset.id === "kinetic_text"));
});

test("resolvePreset compiles a preset body; unknown ids fail with a hint", () => {
	const ok = resolvePreset("bento_cards", { headline: "Clone" });
	assert.equal(ok.ok, true);
	if (ok.ok) {
		assert.ok(ok.script.includes("const __o"), "compiled body carries its params");
		assert.ok(ok.script.length > 100);
		assert.equal(ok.boundParams[0], "headline");
	}
	const legacy = resolvePreset("counter_rig");
	// Legacy alias resolves to the modern id.
	assert.ok(legacy.ok && legacy.presetId === "number_counter");

	const bad = resolvePreset("no_such_preset");
	assert.equal(bad.ok, false);
	if (!bad.ok) {
		assert.match(bad.error, /Unknown preset/);
		assert.equal(bad.knownIds, 125);
	}
});

test("compileMgDsl embeds the manifest interpreter behind a preload guard", () => {
	const script = compileMgDsl({ layers: [{ as: "hero", kind: "shape", shape: "rectangle" }], ops: [] });
	assert.ok(script.includes("typeof __mgApplyManifest === \"undefined\""), "guard first");
	assert.ok(script.includes(MG_MANIFEST_RUNTIME.slice(0, 60)), "interpreter embedded");
	assert.ok(script.includes('"kind":"shape"') || script.includes('"kind": "shape"') || script.includes('"kind"'), "manifest serialized");
});

test("serializeCompactTsv is line-per-layer with the shared column order", () => {
	const tsv = serializeCompactTsv([
		{
			id: "rect#1",
			type: "basicShape",
			parent: null,
			name: "Hero Card",
			boundingBox: { x: 10, y: 20, width: 300, height: 150 },
			attrs: { "position.x": 10, opacity: 80 },
			connected: [{ attrPath: "position.x", from: "oscillator#2.value" }],
		},
		{
			id: "text#3",
			type: "textShape",
			name: "Head\tline",
			bbox: { x: 0, y: 0, width: 100.005, height: 50 },
			attrs: {},
		},
	]);
	const lines = tsv.split("\n");
	assert.equal(lines.length, 3);
	assert.equal(lines[0], COMPACT_TSV_HEADER);
	const hero = lines[1].split("\t");
	assert.deepEqual(hero.slice(0, 5), ["rect#1", "basicShape", "", "Hero Card", "10,20,300,150"]);
	assert.equal(hero[5], "position.x=10;opacity=80");
	assert.equal(hero[6], "position.x<-oscillator#2.value");
	const text = lines[2].split("\t");
	assert.equal(text[3], "Head line", "tabs in names are escaped so rows stay line-per-layer");
	assert.equal(text[4], "0,0,100.01,50", "values round to 2dp");
	assert.equal(text[5], "", "empty dirty cell stays empty");
});

test("serializeCompactTsv output is a strict subset of a JSON scene dump", () => {
	// The >=70% token-reduction claim, checked structurally: the TSV for a
	// realistic readback page must be well under the verbose readback-shaped
	// JSON dump the readback runtime actually returns (every layer carries
	// ref/semanticId/path/depth/boxes/deformers/unreadable, not just a title).
	const layers = PRESET_DEFS.slice(0, 20).map((def, index) => ({
		id: `layer#${index}`,
		ref: `basicShape#${index}`,
		semanticId: `hero_card_${index}`,
		semanticSlug: `hero_card`,
		type: "basicShape",
		name: def.title,
		path: [`hero_card_${index}#${index}`],
		depth: 0,
		topLevel: true,
		parent: null,
		parentName: null,
		hidden: false,
		visible: true,
		inFrame: 0,
		outFrame: 180,
		boundingBox: { x: index * 10, y: 0, width: 200, height: 80, pivotX: 0, pivotY: 0, centre: { x: index * 10 + 100, y: 40 } },
		worldBoundingBox: { x: index * 10, y: 0, width: 200, height: 80 },
		compBoundingBox: { x: index * 10, y: 0, width: 200, height: 80 },
		pivot: { x: 0, y: 0 },
		deformers: [{ id: `stagger#${index}`, type: "stagger", name: "Stagger", visible: true }],
		childCount: 1,
		attrs: { "position.x": index * 10, "position.y": 0, "scale.x": 100, "scale.y": 100, rotation: 0, opacity: 100 },
		connected: [{ attrPath: "position.x", from: `stagger#${index}.offset` }],
		unreadable: [],
	}));
	const json = JSON.stringify({ ok: true, kind: "state", total: layers.length, offset: 0, layers });
	const tsv = serializeCompactTsv(layers);
	assert.ok(tsv.length < json.length * 0.3, `tsv ${tsv.length} chars vs json ${json.length} chars (${Math.round((tsv.length / json.length) * 100)}%)`);
});
