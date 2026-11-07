/**
 * Explicit test-file discovery. Node's default test runner executes every
 * file inside a `test` directory, which would also load the headless mock and
 * its .d.ts. Walking the tree ourselves keeps the list explicit, includes the
 * grouped suites, and makes CI deterministic.
 */
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function collect(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...collect(full));
    else if (entry.name.endsWith(".test.ts")) found.push(full);
  }
  return found;
}

// --live runs only the existing real-sibling refclone integration. There is
// no separate live Cavalry scene suite; all other tests use mocks/local files.
const live = process.argv.includes("--live");
const files = live ? [path.join(here, "server", "strict.test.ts")] : collect(here).sort();
const watch = process.argv.includes("--watch");
const env = { ...process.env, CAVALRY_TEST_LIVE: live ? "1" : "0" };
// Host authoring flags must not change a test's explicitly selected surface.
for (const key of ["MCP_MODE", "CAVALRY_MCP_STRICT_DSL", "CAVALRY_MCP_LEGACY_CRUD", "ENABLE_LEGACY_TOOLS", "REFCLONE_MODULE_PATH"]) delete env[key];

const result = spawnSync(process.execPath, [
  "--import", "tsx", "--test", ...(watch ? ["--watch"] : []),
  ...(live ? ["--test-name-pattern=^cavalry_clone_beat reports the deterministic blocked outcome without an LLM hook$"] : []),
  ...files,
], {
  stdio: "inherit",
  env,
});
process.exit(result.status ?? 1);
