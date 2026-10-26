export const PRESET_NAMES = [
  "kinetic_text",
  "bento_cards",
  "dot_matrix_bg",
  "number_counter",
  "pulse_oscillator",
  "bento_grid",
  "spring_card",
  "counter_rig",
  "bg_grid",
] as const;

export type PresetName = (typeof PRESET_NAMES)[number];
export type PresetOptions = Record<string, unknown>;

const ALIASES: Record<string, PresetName> = {
  bento_grid: "bento_cards",
  spring_card: "bento_cards",
  counter_rig: "number_counter",
  bg_grid: "dot_matrix_bg",
};

function compile(name: PresetName, options: PresetOptions): string {
  const o = JSON.stringify(options);
  switch (name) {
    case "kinetic_text":
      return `const o = ${o};
const start = o.startFrame ?? 0, duration = o.duration ?? 30;
const textId = _mg.text(o.text ?? "KINETIC", o.fontSize ?? 96, o.color ?? "#FFFFFF", o.attrs ?? {});
const rig = _mg.subMesh(textId, o.level ?? 1, o.staggerOffset ?? 8);
_mg.kf(rig.subMeshId, "shapeScale.x", [[start, 0], [start + duration, 1]], o.easing ?? "SpringOut");
_mg.kf(rig.subMeshId, "shapeScale.y", [[start, 0], [start + duration, 1]], o.easing ?? "SpringOut");
_mg.kf(rig.subMeshId, "shapePosition.y", [[start, o.distance ?? 40], [start + duration, 0]], o.easing ?? "SpringOut");
return { preset: "kinetic_text", textId, ...rig };`;
    case "bento_cards":
      return `const o = ${o};
const start = o.startFrame ?? 0, duration = o.duration ?? 30;
const cardId = _mg.shape("rectangle", o.name ?? "Bento Card", {
  "generator.dimensions": o.cardSize ?? [320, 180],
  "generator.cornerRadius": o.radius ?? 24,
  "material.materialColor": o.fill ?? "#181B24"
});
const strokeId = _mg.layer("strokeMaterial", "Card Stroke", {
  strokeColor: o.stroke ?? "#3D4354",
  width: o.strokeWidth ?? 2
});
_mg.wire(strokeId, "id", cardId, "stroke");
const dupId = _mg.duplicator(cardId, "grid", o.count ?? [o.columns ?? 3, o.rows ?? 2], o.size ?? [1100, 650], o.duplicatorAttrs ?? {});
_mg.kf(cardId, "scale", [[start, 0], [start + duration, 100]], o.easing ?? "QuartOut");
_mg.kf(cardId, "position.y", [[start, o.distance ?? 60], [start + duration, 0]], o.easing ?? "QuartOut");
return { preset: "bento_cards", cardId, strokeId, dupId };`;
    case "dot_matrix_bg":
      return `const o = ${o};
const dotId = _mg.shape("ellipse", o.name ?? "Matrix Dot", {
  "generator.dimensions": [o.dotSize ?? 8, o.dotSize ?? 8],
  "material.materialColor": o.color ?? "#394052",
  opacity: o.opacity ?? 60
});
const dupId = _mg.duplicator(dotId, "grid", o.count ?? [20, 12], o.size ?? [1600, 900]);
const scaleNoiseId = _mg.layer("noise", "Dot Scale Noise", { strength: o.scaleStrength ?? 35, "generator.frequency": o.frequency ?? 0.08, "generator.seed": o.seed ?? 1 });
const opacityNoiseId = _mg.layer("noise", "Dot Opacity Noise", { strength: o.opacityStrength ?? 30, "generator.frequency": o.frequency ?? 0.08, "generator.seed": (o.seed ?? 1) + 1 });
_mg.wire(scaleNoiseId, "id", dotId, "scale");
_mg.wire(opacityNoiseId, "id", dotId, "opacity");
return { preset: "dot_matrix_bg", dotId, dupId, scaleNoiseId, opacityNoiseId };`;
    case "number_counter":
      return `const o = ${o};
const start = o.startFrame ?? 0, duration = o.duration ?? 60;
const textId = _mg.text(o.label ?? "0", o.fontSize ?? 96, o.color ?? "#FFFFFF", o.textAttrs ?? {});
const counterId = _mg.layer("stringGenerator", "Number Counter", {
  "generator.precision": o.decimals ?? 0,
  "generator.length": o.length ?? 1,
  prefix: o.prefix ?? "",
  suffix: o.suffix ?? ""
});
_mg.wire(counterId, "id", textId, "text");
_mg.kf(counterId, "generator.number", [[start, o.startVal ?? 0], [start + duration, o.endVal ?? 100]], o.easing ?? "SlowInSlowOut");
return { preset: "number_counter", textId, counterId };`;
    case "pulse_oscillator":
      return `const o = ${o};
const targetId = o.targetId ?? _mg.sel();
if (!targetId) throw new Error("Select a layer or pass targetId");
const nodeId = _mg.layer(o.behaviour ?? "oscillator", "Pulse", { strength: o.strength ?? 12, frequency: o.frequency ?? 1 });
const attr = o.attr ?? "rotation";
_mg.wire(nodeId, "id", targetId, attr);
return { preset: "pulse_oscillator", targetId, nodeId, attr };`;
    default:
      throw new Error(`Unknown preset: ${name}`);
  }
}

/** Compile one parameterized rig; execution and Undo grouping happen centrally. */
export function compilePreset(name: PresetName, options: PresetOptions = {}): string {
  const canonical = ALIASES[name] ?? name;
  const resolved = name === "spring_card" ? { count: [1, 1], ...options } : options;
  return compile(canonical, resolved);
}
