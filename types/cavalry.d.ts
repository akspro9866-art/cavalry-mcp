type CavalryAttributes = Record<string, unknown>;
type CavalryKeyframe = [frame: number, value: unknown];

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
}

interface MotionGraphicsHelpers {
  comp(w?: number, h?: number, fps?: number, endFrame?: number, bgColor?: string): string;
  shape(type: string, name: string, attrs?: CavalryAttributes): string;
  layer(type: string, name: string, attrs?: CavalryAttributes): string;
  text(str: string, size?: number, color?: string, extraAttrs?: CavalryAttributes): string;
  wire(srcId: string, srcAttr: string, dstId: string, dstAttr: string): void;
  deform(targetId: string, deformerType: string, name: string, attrs?: CavalryAttributes): string;
  subMesh(textId: string, level?: 0 | 1 | 2, staggerOffset?: number, easing?: string): {
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
  kf(id: string, attr: string, framesAndValues: CavalryKeyframe[], magicEase?: string): string[];
  selection(): string[];
  sel(): string | undefined;
}

declare const api: CavalryAPI;
declare const _mg: MotionGraphicsHelpers;
