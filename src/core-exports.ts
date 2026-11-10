/**
 * Side-effect-free `cavalry-mcp/core` (also usable through a dependency alias).
 * No MCP startup, bridge calls, filesystem writes, or refclone imports.
 *
 * `compileMgDsl(manifest: MgDslManifest): string` emits JS, NOT a validation
 * result. It handles comp/layers/ops only; validate first and expand presets
 * separately with compilePreset. MG_HELPERS_SOURCE includes the _rb helpers.
 *
 * `cavalrySnippets` is the cavalry_snippets MODULE NAMESPACE, not an id map or
 * array. Use cavalrySnippets.PRESET_DEFS (PresetDef[], library order),
 * cavalrySnippets.getPreset(id), or cavalrySnippets.listPresets(category).
 * A PresetDef has {id, title, category, description, params, code, rig?};
 * params maps names to {type, default, description?}. `code` is a JS body.
 *
 * PRESET_PACKS is an ARRAY of {id, name, presets: PresetDef[]}. IDs are the
 * real category keys, names are their labels, and both packs and presets keep
 * library order. Definitions are shared with the registry; treat as read-only.
 */
import { PRESET_CATEGORIES, PRESET_DEFS } from "./presets/cavalry_snippets.js";
import type { PresetDef } from "./presets/types.js";

export * from "./runtime/mg_manifest.js";
export { MG_HELPERS_SOURCE } from "./runtime/mg_helpers.js";
export { RB_HELPERS_SOURCE } from "./presets/rig_builders.js";
export * as cavalrySnippets from "./presets/cavalry_snippets.js";
export * from "./presets/cavalry_snippets.js";
export * from "./presets/types.js";
export * from "./validator/mg_validator.js";
export * from "./themes/astryx-themes.js";
export * from "./validation/validate-mg-purity.js";
export { searchPresets, resolvePreset } from "./lib/index.js";
export type { PresetSearchHit, PresetSearchResult, PresetResolveOk, PresetResolveError } from "./lib/index.js";
export {
  motionSignatureFor,
  requiredParamsFor,
  defaultDurationFor,
  summaryEightWordsFor,
  formatCompactPresetLine,
  buildCompactPresetDoc,
  buildCompactPresetCatalogLines,
  lookupPresetCompact,
  PRESET_CATALOG_AGENT_RULE,
} from "./presets/manifest.js";
export type { CompactPresetDoc } from "./presets/manifest.js";

export interface PresetPack {
  id: string;
  name: string;
  presets: PresetDef[];
}

export const PRESET_PACKS: PresetPack[] = PRESET_CATEGORIES
  // Dynamic categories (cloned styles) are a runtime filesystem registry, not
  // part of the static 120-script library this surface describes.
  .filter(category => category.presets !== "dynamic")
  .map(category => ({
    id: category.id,
    name: category.label,
    presets: PRESET_DEFS.filter(preset => preset.category === category.id),
  }));
