/**
 * Unified SceneSpecV2 Schema Validator (`src/schema/SceneSpecV2.ts`).
 * Hardened to M8ven Trust Index Grade A:
 * - Strict .strict() (additionalProperties: false)
 * - Explicit maxLength / maxItems bounds
 * - Strict required fields
 */
import { z } from "zod";

export const SceneLayerKeyframeSchema = z.object({
  frame: z.number().min(0).max(100000),
  value: z.unknown(),
  easing: z.string().max(64).optional(),
  bezier: z.array(z.number()).max(4).optional(),
}).strict();

export const SceneLayerConnectionSchema = z.object({
  attrPath: z.string().min(1).max(128),
  from: z.string().min(1).max(128),
}).strict();

export const SceneLayerSpecSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.string().min(1).max(64),
  name: z.string().max(128).optional(),
  parent: z.string().max(80).nullable().optional(),
  attrs: z.record(z.string().max(64), z.unknown()).optional(),
  keyframes: z.record(z.string().max(64), z.array(SceneLayerKeyframeSchema).max(64)).optional(),
  connections: z.array(SceneLayerConnectionSchema).max(32).optional(),
}).strict();

export const SceneSpecV2Schema = z.object({
  version: z.literal("2.0"),
  resolution: z.tuple([z.number().int().min(16).max(7680), z.number().int().min(16).max(4320)]),
  fps: z.number().min(1).max(240),
  theme: z.string().max(64).optional(),
  layers: z.array(SceneLayerSpecSchema).max(200),
}).strict();

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
