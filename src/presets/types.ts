export type PresetCategoryId =
  | "typography"
  | "ui_mockups"
  | "data_viz"
  | "polish_camera"
  | "ai_agents"
  | "devtools_cli"
  | "collab_presence"
  | "workflows_nodes"
  | "fintech_billing"
  | "security_auth"
  | "cloud_devops"
  | "voice_audio_video"
  | "onboarding_plg"
  | "social_proof_cta";

export interface PresetCategory {
  id: PresetCategoryId;
  label: string;
  presets: string;
}

export const PRESET_CATEGORIES: PresetCategory[] = [
  { id: "typography", label: "Hero Typography & Messaging", presets: "1-5" },
  { id: "ui_mockups", label: "UI Components & Product Mockups", presets: "6-10" },
  { id: "data_viz", label: "Data Visualization & KPI", presets: "11-15" },
  { id: "polish_camera", label: "Backgrounds, Transitions & Camera", presets: "16-20" },
  { id: "ai_agents", label: "AI Agents, LLMs & Copilot", presets: "21-30" },
  { id: "devtools_cli", label: "Developer Tools, Code & Terminal", presets: "31-40" },
  { id: "collab_presence", label: "Multiplayer Collaboration & Presence", presets: "41-50" },
  { id: "workflows_nodes", label: "Workflow Automation & Node Graphs", presets: "51-60" },
  { id: "fintech_billing", label: "Fintech, Payments & Billing", presets: "61-70" },
  { id: "security_auth", label: "Security, Auth & Identity", presets: "71-80" },
  { id: "cloud_devops", label: "Cloud, DevOps & Infrastructure", presets: "81-90" },
  { id: "voice_audio_video", label: "Voice, Audio & Video", presets: "91-100" },
  { id: "onboarding_plg", label: "Onboarding & Product-Led Growth", presets: "101-110" },
  { id: "social_proof_cta", label: "Social Proof & Call-to-Action", presets: "111-120" },
];

export type PresetParamType = "string" | "int" | "double" | "bool" | "color" | "json";

export interface PresetParamDef {
  type: PresetParamType;
  default: string | number | boolean | Array<string | number>;
  description?: string;
}

export interface PresetDef {
  id: string;
  title: string;
  category: PresetCategoryId;
  description: string;
  params: Record<string, PresetParamDef>;
  /** JavaScript body executed with __o (params), _mg, _rb and track(key, id). */
  code: string;
}

/** Flatten param metadata into the default overrides object used by compiled code. */
export function presetDefaults(def: PresetDef): Record<string, string | number | boolean | Array<string | number>> {
  const out: Record<string, string | number | boolean | Array<string | number>> = {};
  for (const [key, param] of Object.entries(def.params)) out[key] = param.default;
  return out;
}

/** Defaults with legacy aliases folded in for presets that predate the library. */
export function defaultsFor(def: PresetDef, overrides: Record<string, unknown>): Record<string, unknown> {
  return Object.assign(presetDefaults(def), overrides);
}
