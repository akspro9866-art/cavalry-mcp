/**
 * Low-token preset discovery index tests — run with `npm test`.
 *
 * The discovery index maps preset ID, category, motion tags and compact
 * parameter signatures; the lookup query returns ONLY matching signatures and
 * required parameters — never preset implementation code.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { queryDiscoveryIndex, loadDiscoveryIndex, clearDiscoveryIndexCache } from "../../src/presets/discovery.js";

test("the discovery index loads and covers the full preset library", async () => {
  const entries = await loadDiscoveryIndex();
  assert.ok(entries.length >= 120, `at least the 120 SaaS presets are indexed (got ${entries.length})`);
  const ids = new Set(entries.map((entry) => entry.id));
  assert.equal(ids.size, entries.length, "preset ids are unique");
  for (const entry of entries.slice(0, 25)) {
    assert.ok(entry.id, "every entry has an id");
    assert.ok(entry.category, "every entry has a category");
    assert.ok(Array.isArray(entry.motionTags), "every entry has motion tags");
    assert.ok(Array.isArray(entry.params), "every entry has a parameter signature");
    assert.ok(entry.defaultDuration > 0, "every entry has a positive default duration");
  }
});

test("queryDiscoveryIndex returns signatures and required params — never code", async () => {
  const result = await queryDiscoveryIndex({ query: "counter", limit: 10 });
  assert.ok(result.total >= 120);
  assert.ok(result.matched >= 1, "counter presets exist");
  for (const preset of result.presets) {
    for (const key of Object.keys(preset)) {
      assert.ok(["id", "title", "category", "motionTags", "requiredParams", "params", "defaultDuration"].includes(key), `no bloated field ${key}`);
    }
    assert.equal("code" in preset, false, "preset implementation code is never injected");
    assert.equal("description" in preset, false, "full descriptions are not injected");
    for (const param of preset.params) {
      assert.ok(param.name && param.type, "parameter signatures are compact name/type/default triples");
    }
  }
});

test("category and tag filters narrow the discovery query", async () => {
  const byCategory = await queryDiscoveryIndex({ category: "typography", limit: 48 });
  assert.ok(byCategory.matched >= 1);
  for (const preset of byCategory.presets) {
    assert.match(preset.category, /typography/);
  }
  const byTags = await queryDiscoveryIndex({ tags: ["spring"], limit: 48 });
  if (byTags.matched > 0) {
    for (const preset of byTags.presets) {
      assert.ok(preset.motionTags.some((tag) => tag.toLowerCase().includes("spring")), "tag filter matches motion tags");
    }
  }
});

test("the query is bounded by limit and the hard cap", async () => {
  const limited = await queryDiscoveryIndex({ limit: 3 });
  assert.ok(limited.presets.length <= 3);
  const overCap = await queryDiscoveryIndex({ limit: 999 });
  assert.ok(overCap.presets.length <= 48, "responses stay bounded even with a huge limit");
  assert.equal(overCap.matched, overCap.total);
});

test("a nonsense query matches nothing", async () => {
  const result = await queryDiscoveryIndex({ query: "zzzz_no_such_preset_zzzz" });
  assert.equal(result.matched, 0);
  assert.deepEqual(result.presets, []);
});

test("clearDiscoveryIndexCache forces a reload", async () => {
  clearDiscoveryIndexCache();
  const entries = await loadDiscoveryIndex();
  assert.ok(entries.length >= 120);
  clearDiscoveryIndexCache();
});
