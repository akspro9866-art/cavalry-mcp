/**
 * Unified SceneSpecV2 Schema Validator (`src/schema/SceneSpecV2.ts`).
 * Hardened to M8ven Trust Index Grade A:
 * - Strict .strict() (additionalProperties: false)
 * - Explicit maxLength / maxItems bounds
 * - Strict required fields
 */
import { z } from "zod";

const BoundedScalarValueSchema = z.union([
  z.string().max(1024),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const BoundedAttrValueSchema = z.union([
  BoundedScalarValueSchema,
  z.array(BoundedScalarValueSchema).max(64),
  z.strictObject({
    x: z.number().finite(),
    y: z.number().finite(),
  }),
]);

export const SceneLayerKeyframeSchema = z.strictObject({
  frame: z.number().min(0).max(100000).describe("Keyframe frame index (0-100000)"),
  value: BoundedAttrValueSchema.describe("Deterministic keyframe attribute value"),
  easing: z.string().min(1).max(64).optional().describe("Optional Cavalry easing curve name"),
  bezier: z.array(z.number().finite()).max(4).optional().describe("Optional cubic Bezier control points"),
});

export const SceneLayerConnectionSchema = z.strictObject({
  attrPath: z.string().min(1).max(128).describe("Target attribute path receiving the connection"),
  from: z.string().min(1).max(128).describe("Source node or attribute identifier"),
});

export const SceneLayerSpecSchema = z.strictObject({
  id: z.string().min(1).max(80).describe("Unique layer identifier within the scene"),
  type: z.string().min(1).max(64).describe("Layer or primitive type identifier"),
  name: z.string().min(1).max(128).optional().describe("Display name for the created layer"),
  parent: z.string().min(1).max(80).nullable().optional().describe("Optional parent layer identifier"),
  attrs: z.record(z.string().min(1).max(64), BoundedAttrValueSchema).optional().describe("Static attribute map"),
  keyframes: z.record(z.string().min(1).max(64), z.array(SceneLayerKeyframeSchema).max(64)).optional().describe("Animated keyframes keyed by attribute path"),
  connections: z.array(SceneLayerConnectionSchema).max(32).optional().describe("Graph attribute connections"),
});

export const SceneSpecV2Schema = z.strictObject({
  version: z.literal("2.0").describe("SceneSpec schema version identifier"),
  resolution: z.tuple([z.number().int().min(16).max(7680), z.number().int().min(16).max(4320)]).describe("Composition width and height in pixels"),
  fps: z.number().min(1).max(240).describe("Composition frame rate in frames per second"),
  theme: z.string().min(1).max(64).optional().describe("Optional Astryx theme identifier"),
  layers: z.array(SceneLayerSpecSchema).max(200).describe("Ordered list of layer specifications (max 200)"),
});

export type SceneSpecV2 = z.infer<typeof SceneSpecV2Schema>;
export type SceneLayerSpec = z.infer<typeof SceneLayerSpecSchema>;

export interface ValidationResult {
  valid: boolean;
  data?: SceneSpecV2;
  errors?: string[];
}

export function validateSceneSpecV2(spec: unknown): ValidationResult {
  const result = SceneSpecV2Schema.safeParse(spec);
  if (result.success) {
    return { valid: true, data: result.data };
  }
  return {
    valid: false,
    errors: result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`),
  };
}
