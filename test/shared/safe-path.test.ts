/**
 * Path sanitisation tests — run with `npm test`.
 *
 * Tool file parameters are jailed to cwd, ~/.cavalry-mcp and the OS temp
 * directory; traversal, UNC device paths, drive roots and NUL bytes are
 * rejected with a caller-facing error.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { resolveSandboxedPath, sanitizeNameSegment } from "../../src/shared/safe-path.js";
import { toForwardSlashes } from "../../src/shared/fs-forward-slash.js";

test("relative paths resolve inside the cwd sandbox and normalise to forward slashes", () => {
  const resolved = resolveSandboxedPath("previews/frames", "previews/frames", "outDir");
  assert.equal(resolved, toForwardSlashes(path.resolve("previews/frames")));
  assert.ok(!resolved.includes("\\"), "the sandbox contract is forward slashes");
});

test("paths under ~/.cavalry-mcp and the OS temp directory are allowed", () => {
  const scratch = path.join(os.homedir(), ".cavalry-mcp", "previews");
  assert.equal(resolveSandboxedPath(scratch, scratch, "outDir"), toForwardSlashes(scratch));
  const temp = path.join(os.tmpdir(), "render-frame-export");
  assert.equal(resolveSandboxedPath(temp, temp, "outDir"), toForwardSlashes(temp));
});

test("traversal outside the sandbox is rejected", () => {
  assert.throws(() => resolveSandboxedPath("../../../../etc/passwd", "x", "outDir"), /escapes the allowed sandbox/);
  assert.throws(() => resolveSandboxedPath("C:\\Windows\\System32\\config", "x", "outDir"), /escapes the allowed sandbox/);
});

test("UNC, drive-root and NUL byte inputs are rejected outright", () => {
  assert.throws(() => resolveSandboxedPath("\\\\server\\share\\scene", "x", "outDir"), /UNC or protocol path/);
  assert.throws(() => resolveSandboxedPath("C:\\", "x", "outDir"), /not a drive root/);
  assert.throws(() => resolveSandboxedPath("previews\0/evil", "x", "outDir"), /NUL byte/);
});

test("sanitizeNameSegment rejects separators and dot segments", () => {
  assert.equal(sanitizeNameSegment("frame", "frame", "prefix"), "frame");
  assert.throws(() => sanitizeNameSegment("../evil", "frame", "prefix"), /plain file name/);
  assert.throws(() => sanitizeNameSegment("sub/dir", "frame", "prefix"), /plain file name/);
  assert.throws(() => sanitizeNameSegment("..", "frame", "prefix"), /"\."\.\."?|\.\./);
});

test("toForwardSlashes normalises Windows separators", () => {
  assert.equal(toForwardSlashes("a\\b\\c"), "a/b/c");
  assert.equal(toForwardSlashes(null), "");
  assert.equal(toForwardSlashes(undefined), "");
});
