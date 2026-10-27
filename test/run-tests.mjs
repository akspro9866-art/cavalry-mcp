/**
 * Explicit test-file discovery. Node's default test runner executes every
 * file inside a `test` directory, which would also load the headless mock and
 * its .d.ts. Keeping the file list explicit makes CI deterministic.
 */
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here)
  .filter((name) => name.endsWith(".test.ts"))
  .sort()
  .map((name) => path.join(here, name));

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...files], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
