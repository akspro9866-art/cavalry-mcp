#!/usr/bin/env node
import fs from "node:fs";
import { compilePreset, PRESET_NAMES } from "../dist/presets/cavalry_snippets.js";
import { executeMotionScript } from "../dist/runtime/execute.js";
import { compileInspection } from "../dist/runtime/inspect.js";

const usage = `stallion -e "<javascript>" | -f <script.js> | -p <preset> '<json>' | --sel`;
const args = process.argv.slice(2);
let code;
let helpers = true;

try {
  if (args[0] === "-e" && args[1]) {
    code = args[1];
  } else if (args[0] === "-f" && args[1]) {
    code = fs.readFileSync(args[1], "utf8");
  } else if (args[0] === "-p" && args[1]) {
    if (!PRESET_NAMES.includes(args[1])) throw new Error(`Unknown preset: ${args[1]}`);
    const params = args[2] ? JSON.parse(args[2]) : {};
    if (!params || Array.isArray(params) || typeof params !== "object") {
      throw new Error("Preset arguments must be a JSON object");
    }
    code = compilePreset(args[1], params);
  } else if (args[0] === "--sel") {
    code = compileInspection("selection");
    helpers = false;
  } else {
    console.error(usage);
    process.exitCode = args[0] === "--help" || args[0] === "-h" ? 0 : 1;
  }

  if (code !== undefined) {
    const outcome = await executeMotionScript(code, undefined, { helpers });
    if (outcome.ok) console.log(outcome.text);
    else {
      console.error(outcome.text);
      process.exitCode = 1;
    }
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
