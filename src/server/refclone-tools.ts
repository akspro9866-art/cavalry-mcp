/** The isolated refclone_strict surface. No subprocesses or MCP-to-MCP calls. */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { PRESET_PACKS } from "../core-exports.js";
import type { PresetParamDef } from "../presets/types.js";

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export const inspectReferenceSchema = z.strictObject({
  videoPath: z.string().min(1).describe("Local reference video path to inspect."),
  startSec: z.number().nonnegative().optional().describe("Start time in seconds, zero or greater."),
  endSec: z.number().positive().optional().describe("End time in seconds, greater than startSec."),
  fps: z.number().positive().optional().describe("Positive sampling frame rate for reference inspection."),
  outputDir: z.string().optional().describe("Optional directory for reference inspection artifacts."),
}).refine(args => args.endSec === undefined || args.endSec > (args.startSec ?? 0), {
  path: ["endSec"], message: "endSec must be greater than startSec",
});

export const compileAndConvergeSchema = z.strictObject({
  // Keep every key intact. refclone's strict BeatSpec validator owns rejection
  // of raw code/invalid operations BEFORE any execution; do not strip here.
  beatSpec: z.record(z.string(), z.unknown()).describe("Declarative BeatSpec, validated strictly by refclone; raw code properties are forbidden."),
  outputDir: z.string().optional().describe("Optional directory for convergence artifacts."),
  maxIterations: z.number().int().min(1).max(8).optional().describe("Maximum convergence iterations, integer from 1 through 8."),
});

export type InspectReferenceArgs = z.infer<typeof inspectReferenceSchema>;
export type CompileAndConvergeArgs = z.infer<typeof compileAndConvergeSchema>;

/** Named exports required from refclone/src/strict/index.mjs. */
export interface RefcloneAdapter {
  inspectReference(args: InspectReferenceArgs): Promise<JsonValue>;
  compileAndConverge(args: CompileAndConvergeArgs): Promise<JsonValue>;
}

export interface RefcloneToolDependencies {
  /** Injectable in-process adapter loader; never invoked during registration. */
  loadRefclone?: () => Promise<RefcloneAdapter>;
}

/** Resolve from this package, never cwd. An override must be an absolute file path. */
export function resolveRefcloneModuleUrl(explicit = process.env.REFCLONE_MODULE_PATH): string {
  if (explicit !== undefined) {
    if (!path.isAbsolute(explicit)) throw new Error("REFCLONE_MODULE_PATH must be an absolute file path");
    return pathToFileURL(explicit).href;
  }
  return new URL("../../../refclone/src/strict/index.mjs", import.meta.url).href;
}

export async function loadRefcloneModule(
  explicit = process.env.REFCLONE_MODULE_PATH,
  importer: (url: string) => Promise<unknown> = url => import(url),
): Promise<RefcloneAdapter> {
  const loaded = await importer(resolveRefcloneModuleUrl(explicit));
  if (!loaded || typeof loaded !== "object" ||
      !("inspectReference" in loaded) || typeof loaded.inspectReference !== "function" ||
      !("compileAndConverge" in loaded) || typeof loaded.compileAndConverge !== "function") {
    throw new Error("refclone module must export inspectReference(args) and compileAndConverge(args)");
  }
  return loaded as RefcloneAdapter;
}

export interface PresetPackSignatures {
  id: string;
  name: string;
  presets: Array<{
    id: string;
    description: string;
    /** Registry schema descriptors: type is string/int/double/bool/color/json. */
    params: Record<string, PresetParamDef>;
  }>;
}

/** Exact category IDs only. Empty means none; unknown IDs fail atomically. */
export function getPresetSignatures(packNames: string[]): { packs: PresetPackSignatures[] } {
  z.array(z.string()).max(15).parse(packNames);
  const packs = [...new Set(packNames)].map(id => {
    const pack = PRESET_PACKS.find(candidate => candidate.id === id);
    if (!pack) throw new Error(`Unknown preset pack: ${id}`);
    return {
      id: pack.id,
      name: pack.name,
      presets: pack.presets.map(preset => ({
        id: preset.id,
        description: preset.description,
        params: Object.fromEntries(Object.entries(preset.params).map(([key, param]) => [key, {
          type: param.type,
          default: Array.isArray(param.default) ? [...param.default] : param.default,
          ...(param.description === undefined ? {} : { description: param.description }),
        }])),
      })),
    };
  });
  return { packs };
}

function failed(payload: JsonValue): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  return payload.ok === false || payload.success === false || payload.isError === true ||
    payload.blocked === true ||
    (typeof payload.status === "string" && ["failed", "failure", "error", "blocked"].includes(payload.status.toLowerCase()));
}

async function dispatch(call: () => Promise<JsonValue>): Promise<CallToolResult> {
  try {
    const payload = await call();
    const text = JSON.stringify(payload);
    if (text === undefined) throw new Error("refclone returned no JSON result");
    return { content: [{ type: "text", text }], ...(failed(payload) ? { isError: true } : {}) };
  } catch (error) {
    // A thrown call may have reached the host. Never claim rollback/no mutation
    // or convergence without telemetry from refclone.
    return {
      isError: true,
      content: [{ type: "text", text: JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        liveState: "unknown",
      }) }],
    };
  }
}

export function registerRefcloneTools(server: McpServer, dependencies: RefcloneToolDependencies = {}): void {
  const load = dependencies.loadRefclone ?? (() => loadRefcloneModule());
  // registerTool accepts strict Zod objects with SDK v1/Zod v4; server.tool's
  // raw-shape overload would strip unknown top-level keys before the callback.
  server.registerTool("refclone_inspect_reference", {
    description: "Inspect a reference video in-process through refclone. Returns reference evidence, not a claim about the live Cavalry scene.",
    inputSchema: inspectReferenceSchema,
  }, args => dispatch(async () => (await load()).inspectReference(args)));

  server.registerTool("refclone_get_preset_signatures", {
    description: "Read signatures for up to 15 exact preset pack IDs. Empty requests return no packs. Never returns executable preset bodies.",
    inputSchema: z.strictObject({
      packNames: z.array(z.string()).max(15).describe("Exact registry category IDs to return; empty means no signatures, not all packs."),
    }),
  }, args => dispatch(async () => getPresetSignatures(args.packNames) as unknown as JsonValue));

  server.registerTool("refclone_compile_and_converge", {
    description: "Validate a declarative BeatSpec in refclone, then compile and converge in-process. Raw code is forbidden by refclone strict validation; failed or blocked outcomes are errors.",
    inputSchema: compileAndConvergeSchema,
  }, args => dispatch(async () => (await load()).compileAndConverge(args)));
}
