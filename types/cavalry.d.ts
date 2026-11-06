type CavalryAttributes = Record<string, unknown>;
type CavalryKeyframe = [frame: number, value: unknown];

/**
 * Weighted cubic Bézier handles for one keyframe. Angles are Cavalry tangent
 * angles (0 = flat); weights are in frames. Written through
 * api.modifyKeyframeTangent inside the same undo group.
 */
interface CavalryKeyframeHandles {
  inWeight?: number;
  inAngle?: number;
  outWeight?: number;
  outAngle?: number;
  /** 0 Bezier, 1 Linear, 2 Step. */
  interpolation?: number;
}

/** [frame, value] or [frame, value, handles]. */
type CavalryKfPoint = [frame: number, value: unknown, handles?: CavalryKeyframeHandles];

interface CavalryAPI {
  create(type: string, name?: string, allowDefaultPreset?: boolean): string;
  primitive(type: string, name: string): string;
  set(id: string, attrs: CavalryAttributes): void;
  get(id: string, attr: string): unknown;
  connect(srcId: string, srcAttr: string, dstId: string, dstAttr: string, force?: boolean): void;
  parent(id: string, parentId: string): void;
  unParent(id: string): void;
  keyframe(id: string, frame: number, attrs: CavalryAttributes): string;
  magicEasing(id: string, attr: string, frame: number, easing: string, expression?: string): void;
  getSelection(sortByHierarchyOrder?: boolean): string[];
  getActiveComp(): string;
  getCompLayers(topLevel: boolean): string[];
  getLayerType(id: string): string;
  getNiceName(id: string): string;
  setGenerator(id: string, attr: string, generatorType: string): void;
  setInFrame(id: string, frame: number): void;
  setOutFrame(id: string, frame: number): void;
  startUndoGroup(name: string): void;
  endUndoGroup(): void;
  writeToFile(path: string, contents: string, overwrite?: boolean): boolean;
  // --- keyframe surgery and tangent state (Cavalry 2.8) ---
  /** type: 0 Bezier, 1 Linear, 2 Step; also newFrame/newValue. */
  modifyKeyframe(id: string, dictionary: Record<string, { frame: number; newFrame?: number; newValue?: unknown; type?: number }>): void;
  modifyKeyframeTangent(
    id: string,
    dictionary: Record<string, { frame: number; inHandle?: boolean; outHandle?: boolean; angle?: number; weight?: number; angleLocked?: boolean; weightLocked?: boolean; xValue?: number; yValue?: number }>,
  ): void;
  /** left/rightSpeed 0.0..2.0, left/rightInfluence 0.01..1.0. */
  setKeyframeVelocity(id: string, dictionary: Record<string, { frame: number; leftSpeed?: number; rightSpeed?: number; leftInfluence?: number; rightInfluence?: number }>): void;
  clearKeyframeVelocity(id: string, dictionary: Record<string, { frame: number }>): void;
  deleteKeyframe(id: string, attr: string, frame: number): void;
  deleteAnimation(id: string, attr: string): void;
  getKeyframeTimes(id: string, attr: string): number[];
  getKeyframeIdsForAttribute(id: string, attr: string): string[];
  getSelectedKeyframeIds(): string[];
  setSelectedKeyframeIds(keyframeIds: string[]): void;
  getSelectedKeyframes(): unknown;
  getAttributeFromKeyframeId(keyframeId: string): string;
  // --- playhead and evaluation ---
  getFrame(): number;
  setFrame(frame: number): void;
  /** world=true returns the world-space box with centre. */
  getBoundingBox(id: string, world?: boolean): { x: number; y: number; width: number; height: number; centre?: { x: number; y: number } } | null;
  getPivotPosition(id: string): { x: number; y: number };
  // --- introspection ---
  getChildren(id: string): string[];
  getAnimatedAttributes(id: string): string[];
  getAttributes(id: string): string[];
  getAttributeDefinition(id: string, attr: string): { name: string; type: string } | null;
  getInConnectedAttributes(id: string): string[];
  getInConnection(id: string, attr: string): string | string[];
  getOutConnections(id: string, attr: string): Array<{ dstId: string; dstAttr: string }> | string[];
}

interface MotionGraphicsThemeTokens {
  colors?: Record<string, string>;
  typography?: { font?: string; style?: string; scale?: number };
  radius?: Record<string, number>;
  palette?: boolean;
  apply?: boolean;
  target?: "selection" | "preset" | "comp" | string;
  ids?: string[];
  recolor?: boolean;
  registerOnly?: boolean;
}

interface MotionGraphicsThemeState {
  colors: Record<string, string>;
  typography: { font?: string; style?: string; scale?: number };
  radius: Record<string, number>;
}

/** A box in getBoundingBox space: x/y are the box's min corner. */
interface MotionGraphicsBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MotionGraphicsFitOptions {
  /** "comp" (default) or "raster" (top-left, y-down video pixels). */
  space?: "comp" | "raster";
  compWidth?: number;
  compHeight?: number;
  /** Accepted residual in composition pixels. Default 0.5. */
  tolerance?: number;
  /** Maximum measurement/correction rounds. Default 5, capped at 10. */
  maxPasses?: number;
  /** Resize generator.dimensions/radius/fontSize before using scale. Default true. */
  intrinsic?: boolean;
  /** Keep the layer's aspect ratio. Default false (both axes exact). */
  preserveAspect?: boolean;
  /** When false, width is reported but not gated. Default true. */
  fitWidth?: boolean;
}

interface MotionGraphicsFitResult {
  ok: boolean;
  layerId: string;
  type: string;
  space: string;
  target: MotionGraphicsBox;
  box: MotionGraphicsBox;
  passes: number;
  error: MotionGraphicsBox;
  applied: { intrinsic: string; scale: boolean; position: boolean };
}

interface MotionGraphicsPatchEntry {
  /** Stable handle registered by _mg.alias or the `alias` creation attribute. */
  alias?: string;
  /** Layer id, semantic id, or "@alias" handle. */
  target?: string;
  ids?: string[];
  semantic?: string;
  semantics?: string[];
  attrs?: Record<string, unknown>;
  delta?: Record<string, number>;
  /** Multiplicative factor applied after attrs/delta: current × factor. */
  multiply?: Record<string, number>;
  frame?: number;
  shiftKeyframes?: number | { frames: number; attrs?: string[] };
  easing?: unknown;
  /** Write even when the current value already matches. */
  force?: boolean;
  /** false disables the unchanged-value skip. */
  diff?: boolean;
}

interface MotionGraphicsPatchResult {
  patched: number;
  changes: Array<{ id: string; semantic: string | null; attrs: Record<string, unknown>; frame: number | null }>;
  skipped: Array<{ id: string; semantic: string | null; attr: string; value: unknown; reason: "unchanged" }>;
  targets: string[];
  semantics?: string[];
}

interface MotionGraphicsHelpers {
  comp(w?: number, h?: number, fps?: number, endFrame?: number, bgColor?: string): string;
  shape(type: string, name: string, attrs?: CavalryAttributes & { alias?: string }): string;
  layer(type: string, name: string, attrs?: CavalryAttributes & { alias?: string }): string;
  text(str: string, size?: number, color?: string, extraAttrs?: CavalryAttributes & { alias?: string }): string;
  /** Register a stable "@handle" for a layer in the cross-execution alias registry. */
  alias(id: string, name: string): string;
  /** Every registered alias as { "@handle": "layerId" }. */
  aliases(): Record<string, string>;
  /** Resolve ids/semantic ids/aliases to layer ids. */
  find(query: string, index?: unknown): string[];
  /** Idempotent in-place delta/absolute patch by id, semantic id, selection or alias. */
  patch(spec: MotionGraphicsPatchEntry | MotionGraphicsPatchEntry[]): MotionGraphicsPatchResult | MotionGraphicsPatchResult[];
  patchSelected(spec: Record<string, unknown>): Record<string, unknown>;
  /** Video raster pixels (top-left, y-down) → Cavalry comp space (centred, y-up). */
  fromRaster(x: number, y: number, compWidth: number, compHeight: number): { x: number; y: number };
  fromRaster(point: [number, number] | { x: number; y: number }, compWidth: number, compHeight: number): { x: number; y: number };
  /** Fit a layer's measured world bounds to a target box synchronously. */
  fitToBounds(
    layerId: string,
    targetBox: MotionGraphicsBox | [number, number, number, number] | { centre: { x: number; y: number }; width: number; height: number },
    options?: MotionGraphicsFitOptions,
  ): MotionGraphicsFitResult;
  wire(srcId: string, srcAttr: string, dstId: string, dstAttr: string): void;
  deform(targetId: string, deformerType: string, name: string, attrs?: CavalryAttributes): string;
  subMesh(textId: string, level?: 0 | 1 | 2, staggerOffset?: number): {
    subMeshId: string;
    staggerId: string;
  };
  duplicator(
    shapeId: string,
    distType?: string,
    count?: number | [number, number],
    size?: [number, number],
    attrs?: CavalryAttributes,
  ): string;
  kf(id: string, attr: string, framesAndValues: CavalryKfPoint[], magicEase?: string): string[];
  theme(): MotionGraphicsThemeState | null;
  applyTheme(tokens: MotionGraphicsThemeTokens | null): Record<string, unknown>;
  modulate(
    layerId: string | null,
    attrPath: string | string[],
    config?: string | Record<string, unknown>,
  ): Record<string, unknown>;
  connectDynamic(sourceId: string, targetId: string, styleSpec?: Record<string, unknown>): Record<string, unknown>;
  selection(): string[];
  sel(): string | undefined;
  // --- refclone Stage 3/4 macros (v3.2.0) ---
  keyframe(spec: { element: string; property: string; startFrame: number; endFrame: number; startValue: number; endValue: number; easing?: unknown }): Record<string, unknown>;
  keyframes(spec: { element: string; property: string; points: Array<{ frame: number; value: unknown; handles?: CavalryKeyframeHandles }>; easing?: unknown }): Record<string, unknown>;
  behavior(spec: { element: string; type: "spring"; property: string; startFrame: number; parameters: { dampingRatio: number; naturalFrequency: number; initialValue: number; targetValue: number }; duration?: number }): Record<string, unknown>;
  undoGroup(spec: { id?: string; name?: string; operations: () => unknown }): unknown;
  trim(id: string, spec: { start?: number; end?: number; offset?: number; travel?: number | { inFrame?: number; outFrame?: number; from?: number; to?: number; easing?: string } }): Record<string, unknown>;
  mask(targetId: string, masks: Array<{ id: string; mode?: "alpha" | "invertedAlpha" | "luminance" }>): Record<string, unknown>;
  blend(id: string, mode: string): Record<string, unknown>;
  typography(id: string, spec: { fontSize?: number; lineHeight?: number; letterSpacing?: number; textBoxSize?: [number, number] }): Record<string, unknown>;
  subMeshLevel(textId: string, level: "characters" | "words" | "lines" | 0 | 1 | 2): Record<string, unknown>;
  filter(id: string, spec: { motionBlur?: boolean; gaussianBlur?: number | { blurRadius?: number }; dropShadow?: number | { radius?: number; offsetX?: number; offsetY?: number; color?: string; opacity?: number }; noise?: number | { amount?: number } }): Record<string, unknown>;
  corner(id: string, radius: number): Record<string, unknown>;
}

declare const api: CavalryAPI;
declare const _mg: MotionGraphicsHelpers;
