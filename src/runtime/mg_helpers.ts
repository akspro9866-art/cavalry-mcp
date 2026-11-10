import { RB_HELPERS_SOURCE } from "../presets/rig_builders.js";
import { MG_SCENE_SOURCE } from "./mg_helpers/scene.js";
import { MG_EASING_SOURCE } from "./mg_helpers/easing.js";
import { MG_PATCH_SOURCE } from "./mg_helpers/patch.js";
import { MG_SVG_SOURCE } from "./mg_helpers/svg.js";
import { MG_THEME_SOURCE } from "./mg_helpers/theme.js";
import { MG_MODULATE_SOURCE } from "./mg_helpers/modulate.js";
import { MG_SEMANTIC_SOURCE } from "./mg_helpers/semantic.js";
import { MG_KEYFRAMES_SOURCE } from "./mg_helpers/keyframes.js";
import { MG_STUDIO_SOURCE } from "./mg_helpers/studio.js";
import { MG_RASTER_SOURCE } from "./mg_helpers/raster.js";

/** JavaScript injected into Cavalry; this module is never executed by Node. */
const MG_BASE_SOURCE =
  MG_SCENE_SOURCE +
  MG_EASING_SOURCE +
  MG_PATCH_SOURCE +
  MG_SVG_SOURCE +
  MG_THEME_SOURCE +
  MG_MODULATE_SOURCE +
  MG_SEMANTIC_SOURCE +
  MG_KEYFRAMES_SOURCE +
  MG_STUDIO_SOURCE +
  MG_RASTER_SOURCE;

/** _mg legacy DSL + _rb rig builders, injected into one script scope. */
export const MG_HELPERS_SOURCE = `${MG_BASE_SOURCE}\n${RB_HELPERS_SOURCE}`;
