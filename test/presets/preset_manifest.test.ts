import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRESET_DEFS, PRESET_NAMES } from "../../src/presets/cavalry_snippets.js";
import { PRESET_CATEGORIES } from "../../src/presets/types.js";
import {
  PRESET_MANIFEST_FILE,
  PRESET_MANIFEST_FORMAT,
  buildPresetManifest,
  buildPresetManifestEntries,
  defaultDurationFor,
  estimatePresetManifestTokens,
  motionSignatureFor,
  parsePresetManifest,
  requiredParamsFor,
  serializePresetManifest,
} from "../../src/presets/manifest.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const distFile = path.join(here, "..", "..", "dist", PRESET_MANIFEST_FILE);

test("the preset manifest covers exactly the 120 library presets in 14 packs", () => {
  const entries = buildPresetManifestEntries();
  assert.equal(entries.length, 120);
  assert.equal(PRESET_DEFS.length, 120);
  assert.deepEqual(entries.map((entry) => entry.id), [...PRESET_NAMES]);
  assert.equal(new Set(entries.map((entry) => entry.id)).size, 120);

  const packs = new Set(entries.map((entry) => entry.category));
  assert.equal(packs.size, 14);
  for (const category of PRESET_CATEGORIES) assert.ok(packs.has(category.id), category.id);

  for (const entry of entries) {
    assert.equal(typeof entry.motionSignature, "string");
    assert.match(entry.motionSignature, /^[a-z]+\+[a-z]+$/);
    assert.ok(entry.defaultDuration > 0 && entry.defaultDuration <= 600, `${entry.id}: ${entry.defaultDuration}`);
    assert.ok(Array.isArray(entry.requiredParams));
    // every declared requirement is a real parameter on the preset
    const def = PRESET_DEFS.find((candidate) => candidate.id === entry.id)!;
    for (const name of entry.requiredParams) assert.ok(name in def.params, `${entry.id}.${name}`);
  }
});

test("requiredParams are content inputs, not geometry or easing knobs", () => {
  const byId = new Map(PRESET_DEFS.map((def) => [def.id, def]));
  assert.deepEqual(requiredParamsFor(byId.get("kinetic_text")!), ["text"]);
  assert.deepEqual(requiredParamsFor(byId.get("no_such_preset") ?? { ...byId.get("kinetic_text")!, params: {} }), []);
  for (const def of PRESET_DEFS) {
    const required = requiredParamsFor(def);
    for (const name of required) {
      const param = def.params[name];
      assert.equal(param.type, "string", `${def.id}.${name}`);
      assert.notEqual(param.default, "");
      assert.ok(!String(param.default).startsWith("#"), `${def.id}.${name} is a colour, not content`);
      assert.ok(!["easing", "preset", "shape", "attr", "type", "mode", "font"].includes(name));
    }
  }
});

test("motion signatures are derived from code, so they track the rig", () => {
  const byId = new Map(PRESET_DEFS.map((def) => [def.id, def]));
  assert.equal(motionSignatureFor(byId.get("kinetic_text")!), "stagger+spring");
  assert.match(motionSignatureFor(byId.get("ticker_marquee")!), /^dup\+/);
  assert.equal(defaultDurationFor(byId.get("kinetic_text")!), 30);
  // presets without a duration parameter fall back to a known default, never NaN
  assert.equal(defaultDurationFor({ ...byId.get("kinetic_text")!, params: {} }), 60);
});

test("the serialized manifest is deterministic, parseable and under 1500 tokens", () => {
  const first = serializePresetManifest();
  const second = serializePresetManifest();
  assert.equal(first, second, "two builds of the same library must be byte-identical");

  const parsed = parsePresetManifest(first);
  assert.equal(parsed.manifest.format, PRESET_MANIFEST_FORMAT);
  assert.equal(parsed.manifest.unit, "frames");
  assert.equal(parsed.entries.length, 120);
  assert.deepEqual(parsed.entries, buildPresetManifestEntries());
  // the dictionary is sorted and has no duplicates
  const signatures = parsed.manifest.signatures;
  assert.deepEqual(signatures, [...new Set(signatures)].sort());

  const tokens = estimatePresetManifestTokens(first);
  assert.ok(tokens < 1500, `manifest costs ~${tokens} tokens (${first.length} bytes)`);
  // and every row is exactly the five contracted fields
  for (const row of parsed.manifest.presets) assert.equal(row.split("|").length, 5);
});

test("dist/presets/preset_manifest.json is the build's own output", () => {
  assert.ok(fs.existsSync(distFile), `missing ${distFile}; run npm run build`);
  assert.equal(fs.readFileSync(distFile, "utf8"), serializePresetManifest());
});

test("malformed manifest rows fail loudly instead of yielding partial entries", () => {
  const manifest = buildPresetManifest();
  const broken = { ...manifest, presets: [...manifest.presets.slice(0, 2), "not|enough|fields"] };
  assert.throws(() => parsePresetManifest(JSON.stringify(broken)), /expected 5/);
  const badCategory = { ...manifest, presets: ["x|zz|0||30"] };
  assert.throws(() => parsePresetManifest(JSON.stringify(badCategory)), /unknown category code/);
  const badSignature = { ...manifest, presets: ["x|ty|99||30"] };
  assert.throws(() => parsePresetManifest(JSON.stringify(badSignature)), /unknown signature index/);
  const badDuration = { ...manifest, presets: ["x|ty|0||nope"] };
  assert.throws(() => parsePresetManifest(JSON.stringify(badDuration)), /invalid defaultDuration/);
});
