import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { clonedPreviewDir } from "../../src/presets/cloned.js";

// Render output must never be committed: test setup points the preview root at
// a fresh temp dir, and the default root is the gitignored .cloned-renders area.

test("clonedPreviewDir honours CAVALRY_MCP_CLONED_RENDER_DIR into a temp root", () => {
  const previous = process.env.CAVALRY_MCP_CLONED_RENDER_DIR;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cloned-renders-"));
  process.env.CAVALRY_MCP_CLONED_RENDER_DIR = tmp;
  try {
    const dir = clonedPreviewDir("smoke_test_style");
    assert.ok(dir.startsWith(path.resolve(tmp) + path.sep), `preview dir escaped temp root: ${dir}`);
    assert.ok(dir.includes(`smoke_test_style${path.sep}`), dir);
  } finally {
    if (previous === undefined) delete process.env.CAVALRY_MCP_CLONED_RENDER_DIR;
    else process.env.CAVALRY_MCP_CLONED_RENDER_DIR = previous;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("default clonedPreviewDir lands in the gitignored .cloned-renders scratch area", () => {
  const previous = process.env.CAVALRY_MCP_CLONED_RENDER_DIR;
  delete process.env.CAVALRY_MCP_CLONED_RENDER_DIR;
  try {
    const dir = clonedPreviewDir("smoke_test_style");
    assert.ok(dir.includes(`${path.sep}.cloned-renders${path.sep}`), dir);
  } finally {
    if (previous !== undefined) process.env.CAVALRY_MCP_CLONED_RENDER_DIR = previous;
  }
});