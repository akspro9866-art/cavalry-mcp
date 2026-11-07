/**
 * `resolveRenderFrameFastPixels` — live/mock pixel parity for
 * `/render_frame_fast`. A live script host has no binary read: it writes the
 * PNG to disk and names `outPath`. The client must read those bytes so
 * downstream SSIM/IoU verification is identical against live Cavalry and the
 * mock.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { resolveRenderFrameFastPixels } from "../../src/bridge/stallion.js";

const writePng = (file: string): Buffer => {
  const image = new PNG({ width: 2, height: 2 });
  for (let pixel = 0; pixel < 4; pixel++) {
    image.data[pixel * 4] = 32;
    image.data[pixel * 4 + 1] = 79;
    image.data[pixel * 4 + 2] = 224;
    image.data[pixel * 4 + 3] = 255;
  }
  const bytes = PNG.sync.write(image);
  fs.writeFileSync(file, bytes);
  return bytes;
};

test("a disk-only envelope (live shape) is read back and labeled pixelSource: disk", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cav-rff-")), "fast-000000.png");
  const bytes = writePng(file);
  const resolved = resolveRenderFrameFastPixels({ ok: true, outPath: file, inline: false });
  assert.equal(resolved.pixelSource, "disk");
  assert.equal(resolved.inline, false);
  assert.equal(resolved.pngBase64, bytes.toString("base64"));
  assert.equal(resolved.outPath, file);
});

test("the v0.11 `file` field is accepted when outPath is absent", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cav-rff-")), "fast-000001.png");
  writePng(file);
  const resolved = resolveRenderFrameFastPixels({ ok: true, file });
  assert.equal(resolved.pixelSource, "disk");
  assert.equal(resolved.outPath, file);
  assert.ok((resolved.pngBase64 ?? "").length > 0);
});

test("inline buffers (mock shape) win and are labeled pixelSource: inline", () => {
  const inline = resolveRenderFrameFastPixels({ ok: true, pngBase64: "aGVsbG8=" });
  assert.equal(inline.pixelSource, "inline");
  assert.equal(inline.pngBase64, "aGVsbG8=");
  // The inlineBase64 spelling normalizes onto pngBase64.
  const alt = resolveRenderFrameFastPixels({ ok: true, inlineBase64: "aGVsbG8=" } as never);
  assert.equal(alt.pixelSource, "inline");
  assert.equal(alt.pngBase64, "aGVsbG8=");
});

test("a missing or unreadable file degrades honestly — no fabricated pixels", () => {
  const missing = resolveRenderFrameFastPixels({ ok: true, outPath: path.join(os.tmpdir(), "definitely-missing.png") });
  assert.equal(missing.pixelSource, "unavailable");
  assert.equal(missing.pngBase64, undefined);
  assert.match(String(missing.inlineNote), /disk readback failed/);
  const noPath = resolveRenderFrameFastPixels({ ok: true });
  assert.equal(noPath.pixelSource, "unavailable");
  // Failed envelopes pass through untouched.
  const failed = resolveRenderFrameFastPixels({ ok: false, error: "no comp" });
  assert.equal(failed.pixelSource, undefined);
});
