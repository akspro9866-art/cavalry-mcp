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

const files = collect(here).sort();
const watch = process.argv.includes("--watch");

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...(watch ? ["--watch"] : []), ...files], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
