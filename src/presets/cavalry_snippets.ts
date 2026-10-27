import type { PresetDef, PresetParamDef } from "./types.js";
import { PRESET_CATEGORIES, presetDefaults } from "./types.js";
import { CAT01_TYPOGRAPHY } from "./packs/cat01_typography.js";
import { CAT02_UI_MOCKUPS } from "./packs/cat02_ui_mockups.js";
import { CAT03_DATA_VIZ } from "./packs/cat03_data_viz.js";
import { CAT04_POLISH_CAMERA } from "./packs/cat04_polish_camera.js";
import { CAT05_AI_AGENTS } from "./packs/cat05_ai_agents.js";
import { CAT06_DEVTOOLS_CLI } from "./packs/cat06_devtools_cli.js";
import { CAT07_COLLAB_PRESENCE } from "./packs/cat07_collab_presence.js";
import { CAT08_WORKFLOWS_NODES } from "./packs/cat08_workflows_nodes.js";
import { CAT09_FINTECH_BILLING } from "./packs/cat09_fintech_billing.js";
import { CAT10_SECURITY_AUTH } from "./packs/cat10_security_auth.js";
import { CAT11_CLOUD_DEVOPS } from "./packs/cat11_cloud_devops.js";
import { CAT12_VOICE_AUDIO_VIDEO } from "./packs/cat12_voice_audio_video.js";
import { CAT13_ONBOARDING_PLG } from "./packs/cat13_onboarding_plg.js";
import { CAT14_SOCIAL_PROOF_CTA } from "./packs/cat14_social_proof_cta.js";

/** Every preset definition, in library order (1-120). */
export const PRESET_DEFS: PresetDef[] = [
  ...CAT01_TYPOGRAPHY,
  ...CAT02_UI_MOCKUPS,
  ...CAT03_DATA_VIZ,
  ...CAT04_POLISH_CAMERA,
  ...CAT05_AI_AGENTS,
  ...CAT06_DEVTOOLS_CLI,
  ...CAT07_COLLAB_PRESENCE,
  ...CAT08_WORKFLOWS_NODES,
  ...CAT09_FINTECH_BILLING,
  ...CAT10_SECURITY_AUTH,
  ...CAT11_CLOUD_DEVOPS,
  ...CAT12_VOICE_AUDIO_VIDEO,
  ...CAT13_ONBOARDING_PLG,
  ...CAT14_SOCIAL_PROOF_CTA,
];

const BY_ID = new Map(PRESET_DEFS.map(def => [def.id, def]));

/** Canonical preset ids, exposed as a zod-compatible non-empty tuple. */
export const PRESET_NAMES = PRESET_DEFS.map(def => def.id) as [string, ...string[]];

export type PresetName = string;
export type PresetOptions = Record<string, unknown>;

/** Legacy ids kept from the original 5-preset build. */
export const PRESET_ALIASES: Record<string, string> = {
  bento_grid: "bento_cards",
  spring_card: "bento_cards",
  counter_rig: "number_counter",
  bg_grid: "dot_matrix_bg",
};

export function resolvePresetName(name: string): string {
  return PRESET_ALIASES[name] ?? name;
}

export function hasPreset(name: string): boolean {
  return BY_ID.has(resolvePresetName(name));
}

export function getPreset(name: string): PresetDef | undefined {
  return BY_ID.get(resolvePresetName(name));
}

/** Parameter shims for callers of the original preset ids. */
function legacyDefaults(name: string, options: PresetOptions): PresetOptions {
  const out: PresetOptions = {};
  if (name === "spring_card") out.count = [1, 1];
  if (name === "bg_grid") {
    if (Array.isArray(options.count) && options.count.length >= 2) {
      out.cols = options.count[0];
      out.rows = options.count[1];
    }
    if (options.scaleStrength != null) out.amp = Number(options.scaleStrength) / 100;
    if (options.dotSize != null) out.dotSize = options.dotSize;
  }
  return out;
}

/** Compile one preset into a self-contained Cavalry script body. */
export function compilePreset(name: string, options: PresetOptions = {}): string {
  const def = getPreset(name);
  if (!def) throw new Error(`Unknown preset: ${name}`);
  const resolved = Object.assign(
    presetDefaults(def),
    legacyDefaults(name, options),
    options,
  );
  return `const __o = ${JSON.stringify(resolved)};
const __tracked = {};
function track(key, id) { __tracked[key] = id; return id; }
${def.code}
const __presetId = ${JSON.stringify(def.id)};
// Remember the tracked roots across executions so _mg.patchSelected can retune
// a preset after the selection has changed. Guarded for bare test harnesses.
if (typeof _mg !== "undefined" && _mg.__rememberPreset) _mg.__rememberPreset(__presetId, __tracked);
return Object.assign({}, __tracked, { preset: ${JSON.stringify(def.id)} });`;
}

export interface PresetSummary {
  id: string;
  title: string;
  category: string;
  categoryLabel: string;
  description: string;
  params: Record<string, PresetParamDef>;
}

/**
 * Lightweight metadata for CLI discovery. Does not include preset code, so it
 * never inflates the MCP tool schema.
 */
export function listPresets(category?: string): PresetSummary[] {
  const wanted = (category ?? "").trim().toLowerCase();
  return PRESET_DEFS.filter(def => {
    if (!wanted) return true;
    const meta = PRESET_CATEGORIES.find(cat => cat.id === def.category);
    const index = String(PRESET_CATEGORIES.findIndex(cat => cat.id === def.category) + 1);
    return (
      def.id === wanted ||
      def.category === wanted ||
      index === wanted ||
      (meta != null && meta.label.toLowerCase().includes(wanted))
    );
  }).map(def => ({
    id: def.id,
    title: def.title,
    category: def.category,
    categoryLabel: PRESET_CATEGORIES.find(cat => cat.id === def.category)?.label ?? def.category,
    description: def.description,
    params: def.params,
  }));
}

export { PRESET_CATEGORIES };
