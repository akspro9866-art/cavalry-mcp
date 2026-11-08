import type { PresetRigOverride, PresetRigTerms } from "../runtime/rig_terms.js";

export type { PresetRigOverride, PresetRigTerms };

export type PresetCategoryId =  | "typography"
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
  | "social_proof_cta"
  /** Runtime filesystem-backed presets (refclone Stage 6); never statically imported. */
  | "cloned_styles";

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
  { id: "cloned_styles", label: "Cloned Styles (runtime)", presets: "dynamic" },
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
  /**
   * Optional rig declaration. Normally leave it out: derivePresetRig reads the
   * numbers off the declared parameters and the easings off the code. Set it when
   * the easing is data-driven, or when a preset should advertise a stiffness,
   * damping ratio, overshoot, holdFrames or staggerOffset it reaches through a
   * differently named knob.
   */
  rig?: PresetRigOverride;
}

/** Flatten param metadata into the default overrides object used by compiled code. */
export function presetDefaults(def: PresetDef): Record<string, string | number | boolean | Array<string | number>> {
  const out: Record<string, string | number | boolean | Array<string | number>> = {};
  for (const [key, param] of Object.entries(def.params)) out[key] = param.default;
  return out;
}
