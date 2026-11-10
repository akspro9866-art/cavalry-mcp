/**
 * Context-scoped TypeScript definitions for all 8 Cavalry 2.8.0 execution contexts
 * (`@scenery/cavalry-types` parity):
 *   1. `script`   — JavaScript Editor / Stallion scripts (`console`, `api`, `cavalry`, `ui`)
 *   2. `plugin`   — Cavalry Plugins (`console`, `api`, `ctx`, `cavalry`, `ui`, `plugin`, `install`)
 *   3. `render`   — Pre/Post/Setup Render Scripts (`console`, `api`, `render`)
 *   4. `shape`    — `javaScriptShape` (`console`, `ctx`, `cavalry`)
 *   5. `utility`  — `javaScriptUtility` (`console`, `ctx`, `cavalry`)
 *   6. `deformer` — `javaScriptDeformer` (`console`, `ctx`, `cavalry`, `def`)
 *   7. `emitter`  — `javaScriptEmitter` (`console`, `ctx`, `cavalry`)
 *   8. `modifier` — `javaScriptModifier` (`console`, `ctx`, `cavalry`)
 */

type CavalryExecutionContext =
  | "script"
  | "plugin"
  | "render"
  | "shape"
  | "utility"
  | "deformer"
  | "emitter"
  | "modifier";

interface CavalryBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  centre: { x: number; y: number };
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface CavalryConsoleNamespace {
  log(...data: unknown[]): void;
  info(...data: unknown[]): void;
  warn(...data: unknown[]): void;
  error(...data: unknown[]): void;
  debug(...data: unknown[]): void;
}

interface CavalryCtxNamespace {
  readonly index: number;
  readonly count: number;
  readonly positionX: number;
  readonly positionY: number;
  readonly attributeId: string;
  readonly layerId: string;
  saveObject(name: string, object: unknown): void;
  loadObject(name: string): unknown;
  hasObject(name: string): boolean;
  niceName(): string;
  transformationMatrix(): CavalryMatrixInstance;
  globalTransformationMatrix(): CavalryMatrixInstance;
}

interface CavalryPathInstance {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  cubicTo(cp1X: number, cp1Y: number, cp2X: number, cp2Y: number, endX: number, endY: number): void;
  quadTo(cp1X: number, cp1Y: number, endX: number, endY: number): void;
  arcTo(cp1X: number, cp1Y: number, cp2X: number, cp2Y: number, radius: number): void;
  conicTo(cp1X: number, cp1Y: number, endX: number, endY: number, weight: number): void;
  convertConicsToQuads(): void;
  close(): void;
  addText(text: string, fontSize: number, positionX: number, positionY: number): void;
  addRect(fromX: number, fromY: number, toX: number, toY: number): void;
  addEllipse(centreX: number, centreY: number, radiusX: number, radiusY: number): void;
  clear(): void;
  translate(x: number, y: number): void;
  rotate(degrees: number): void;
  scale(x: number, y: number): void;
  append(pathToAdd: CavalryPathInstance): void;
  intersect(intersectPath: CavalryPathInstance): void;
  unite(unitePath: CavalryPathInstance): void;
  difference(differencePath: CavalryPathInstance): void;
  convertToCurves(): void;
  convertToLines(linesPerCurve: number): void;
  toObject(): unknown;
  fromObject(objectToRead: unknown): void;
  boundingBox(): CavalryBoundingBox;
  empty(): boolean;
  pointCount(): number;
  contains(x: number, y: number): boolean;
  pathData(): unknown;
  setPathData(data: unknown): void;
  offset(distance: number, round: boolean): void;
  trim(start: number, end: number, travel: number, reverse: boolean): void;
  resample(edgeLength: number): void;
  relax(iterations: number, radius: number, relaxationStrength: number): void;
  smooth(iterations: number, smoothStrength: number): void;
  length(): number;
  pointAtParam(param: number): { x: number; y: number };
  tangentAtParam(param: number): { x: number; y: number };
  normalAtParam(param: number): { x: number; y: number };
  angleAtParam(param: number): number;
  paramAtLength(length: number): number;
  findClosestPoint(x: number, y: number): {
    position: { x: number; y: number };
    tangent: { x: number; y: number };
    normal: { x: number; y: number };
  };
  mergeOverlaps(): void;
  reverse(): void;
  isClockwise(): boolean;
  applyMatrix(matrix: unknown): void;
}

interface CavalryMeshInstance {
  addPath(path: CavalryPathInstance, material?: unknown): void;
  count(): number;
  empty(): boolean;
  clear(): void;
  getBoundingBox(): CavalryBoundingBox;
  getPathDataAtIndex(index: number): unknown;
  setPathAtIndex(index: number, path: unknown): void;
  setPathDataAtIndex(index: number, pathData: unknown): void;
  setMaterialAtIndex(index: number, material: unknown): void;
  getPathAtIndex(index: number): CavalryPathInstance;
  addChildMesh(mesh: CavalryMeshInstance): void;
  clearChildMeshes(): void;
  childMeshCount(): number;
  getChildMeshAtIndex(index: number): CavalryMeshInstance;
  setChildMeshAtIndex(index: number, mesh: CavalryMeshInstance): void;
  getFlattenedPath(): CavalryPathInstance;
}

interface CavalryMatrixInstance {
  setPosition(x: number, y: number): void;
  setRotation(angle: number): void;
  setScale(x: number, y: number): void;
  setSkew(x: number, y: number): void;
  position(): { x: number; y: number };
  rotation(): number;
  scale(): unknown;
  multiply(matrix: CavalryMatrixInstance): CavalryMatrixInstance;
  inverted(): CavalryMatrixInstance;
  invert(): void;
  isFinite(): boolean;
  isIdentity(): boolean;
  mapRect(rect: unknown): CavalryBoundingBox;
  mapPoint(point: unknown): { x: number; y: number };
  mapPoints(points: unknown): unknown;
  setFromArray(array: number[]): void;
}

interface CavalryModuleNamespace {
  Path: new () => CavalryPathInstance;
  Mesh: new () => CavalryMeshInstance;
  Matrix: new () => CavalryMatrixInstance;
  Point: new (x?: number, y?: number) => { x: number; y: number };
  PointCloud: new () => {
    appendPoint(point: { x: number; y: number }): void;
    appendRotation(rotation: number): void;
    appendSize(point: { x: number; y: number }): void;
  };
  Line: new (x1: number, y1: number, x2: number, y2: number) => {
    length(): number;
    angle(): number;
    start(): { x: number; y: number };
    end(): { x: number; y: number };
    delta(): { x: number; y: number };
    pointAt(param: number): { x: number; y: number };
    normalAt(param: number): { x: number; y: number };
  };
  Material: new () => Record<string, unknown>;
  random(min: number, max: number, seed: number, sequence?: number): number;
  uniform(min: number, max: number, seed: number): number;
  noise1d(x: number, seed: number, frequency: number): number;
  noise2d(x: number, y: number, seed: number, frequency: number): number;
  noise3d(x: number, y: number, z: number, seed: number, frequency: number): number;
  dist(x1: number, y1: number, x2: number, y2: number): number;
  map(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number;
  norm(value: number, min: number, max: number): number;
  clamp(value: number, min: number, max: number): number;
  lerp(min: number, max: number, t: number): number;
  angleFromVector(x: number, y: number): number;
  vectorFromAngle(angle: number): { x: number; y: number };
  radiansToDegrees(radians: number): number;
  degreesToRadians(degrees: number): number;
  rgbToHsv(r: number, g: number, b: number, normalised?: boolean): { h: number; s: number; v: number };
  rgbToHex(r: number, g: number, b: number, normalised?: boolean): string;
  rgbaToHex(r: number, g: number, b: number, a: number, normalised?: boolean): string;
  hsvToRgba(h: number, s: number, v: number, normalised?: boolean): { r: number; g: number; b: number; a: number };
  hsvToHex(h: number, s: number, v: number): string;
  hexToRgba(hex: string, normalised?: boolean): { r: number; g: number; b: number; a: number };
  hexToHsv(hexValue: string): { h: number; s: number; v: number };
  nameThatColor(hexValue: string): string;
  fontExists(fontFamily: string, fontStyle: string): boolean;
  getFontFamilies(): string[];
  getFontStyles(fontFamily: string): string[];
  measureText(
    string: string,
    fontFamily: string,
    fontStyle: string,
    fontSize: number,
  ): { width: number; height: number; x: number; y: number; centreX: number; centreY: number };
  fontMetrics(
    fontFamily: string,
    fontStyle: string,
    fontSize: number,
  ): {
    top: number;
    ascent: number;
    descent: number;
    bottom: number;
    leading: number;
    averageCharacterWidth: number;
    maxCharacterWidth: number;
    xMin: number;
    xMax: number;
    xHeight: number;
    capHeight: number;
  };
  versionLessThan(version: string): boolean;
}

interface CavalryDefNamespace {
  getRootMesh(): CavalryMeshInstance;
  setRootMesh(mesh: CavalryMeshInstance): void;
  getFalloffAtPoint(x: number, y: number): number;
  getBoundingBox(): CavalryBoundingBox;
  getPoints(): Array<{ x: number; y: number }>;
  setPoints(points: unknown): void;
  readonly meshDepth: number;
  meshCountAtDepth(depth: number): number;
  getMeshesAtDepth(depth: number): CavalryMeshInstance[];
  setMeshesAtDepth(depth: number, meshes: unknown): void;
  getMeshAtDepthAtIndex(depth: number, index: number): CavalryMeshInstance;
  setMeshAtDepthAtIndex(depth: number, index: number, mesh: unknown): void;
  setTransformAtDepthAtIndex(
    depth: number,
    index: number,
    position?: unknown,
    rotation?: number,
    scale?: unknown,
  ): void;
  clearTransformAtDepthAtIndex(depth: number, index: number): void;
  centrePivotAtDepthAtIndex(depth: number, index: number): void;
  setMaterialAtDepthAtIndex(depth: number, index: number, material: unknown): void;
  highestDepthWithPath(): number;
}

interface CavalryRenderNamespace {
  readonly composition: string;
  readonly path: string;
  readonly renderQueueItem: string;
}

interface CavalryPluginNamespace {
  readonly layerId: string;
  readonly saveData: unknown;
}

interface CavalryInstallNamespace {
  readonly fromUpdate: boolean;
}

interface CavalryUiNamespace {
  add(...widgets: object[]): void;
  show(): void;
  setTitle(title: string): void;
  setBackgroundColor(color: string): void;
  addStretch(): void;
  addSpacing(spacing: number): void;
  setSpaceBetween(spacing: number): void;
  setMargins(left: number, top: number, right: number, bottom: number): void;
  addCallbackObject(callback: unknown): void;
  runFileScript(path: string): boolean;
}

/** 1. `script` context (`types/script.d.ts`) */
interface CavalryScriptContext {
  readonly context: "script";
  readonly console: CavalryConsoleNamespace;
  readonly api: CavalryAPI;
  readonly cavalry: CavalryModuleNamespace;
  readonly ui: CavalryUiNamespace;
}

/** 2. `plugin` context (`types/plugin.d.ts`) */
interface CavalryPluginContext {
  readonly context: "plugin";
  readonly console: CavalryConsoleNamespace;
  readonly api: CavalryAPI;
  readonly ctx: CavalryCtxNamespace;
  readonly cavalry: CavalryModuleNamespace;
  readonly ui: CavalryUiNamespace;
  readonly plugin: CavalryPluginNamespace;
  readonly install: CavalryInstallNamespace;
}

/** 3. `render` context (`types/render.d.ts`: Pre-Render, Post-Render, Render Setup) */
interface CavalryRenderContext {
  readonly context: "render";
  readonly console: CavalryConsoleNamespace;
  readonly api: CavalryAPI;
  readonly render: CavalryRenderNamespace;
}

/** 4. `shape` context (`types/shape.d.ts`: `javaScriptShape`) */
interface CavalryShapeContext {
  readonly context: "shape";
  readonly console: CavalryConsoleNamespace;
  readonly ctx: CavalryCtxNamespace;
  readonly cavalry: CavalryModuleNamespace;
}

/** 5. `utility` context (`types/utility.d.ts`: `javaScriptUtility`) */
interface CavalryUtilityContext {
  readonly context: "utility";
  readonly console: CavalryConsoleNamespace;
  readonly ctx: CavalryCtxNamespace;
  readonly cavalry: CavalryModuleNamespace;
}

/** 6. `deformer` context (`types/deformer.d.ts`: `javaScriptDeformer`) */
interface CavalryDeformerContext {
  readonly context: "deformer";
  readonly console: CavalryConsoleNamespace;
  readonly ctx: CavalryCtxNamespace;
  readonly cavalry: CavalryModuleNamespace;
  readonly def: CavalryDefNamespace;
}

/** 7. `emitter` context (`types/emitter.d.ts`: `javaScriptEmitter`) */
interface CavalryEmitterContext {
  readonly context: "emitter";
  readonly console: CavalryConsoleNamespace;
  readonly ctx: CavalryCtxNamespace;
  readonly cavalry: CavalryModuleNamespace;
}

/** 8. `modifier` context (`types/modifier.d.ts`: `javaScriptModifier`) */
interface CavalryModifierContext {
  readonly context: "modifier";
  readonly console: CavalryConsoleNamespace;
  readonly ctx: CavalryCtxNamespace;
  readonly cavalry: CavalryModuleNamespace;
}

interface CavalryContextGlobalsMap {
  script: CavalryScriptContext;
  plugin: CavalryPluginContext;
  render: CavalryRenderContext;
  shape: CavalryShapeContext;
  utility: CavalryUtilityContext;
  deformer: CavalryDeformerContext;
  emitter: CavalryEmitterContext;
  modifier: CavalryModifierContext;
}
