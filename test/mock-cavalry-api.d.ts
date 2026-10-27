import type { Server } from "node:http";

export interface MockLayer {
  type: string;
  name: string;
  compId?: string;
  attrs: Record<string, unknown>;
}

export interface MockKeyframe {
  layerId: string;
  frame: number;
  attributes: Record<string, unknown>;
}

export interface MockEasing {
  layerId: string;
  attrPath: string;
  frame: number;
  name: string;
}

export interface MockComp {
  id: string;
  name: string;
  attrs: Record<string, unknown>;
}

export interface MockApiState {
  layers: Map<string, MockLayer>;
  keyframes: MockKeyframe[];
  easings: MockEasing[];
  selection: string[];
  order: string[];
  expressions: Map<string, string>;
  connections: Array<{ sourceId: string; sourceAttr: string; targetId: string; targetAttr: string }>;
  parents: Map<string, string>;
  comps: MockComp[];
  activeComp: string;
  compAttrs: Record<string, unknown>;
  frame: number;
  markers: Array<{ id: string; time: number }>;
  renderQueue: string[];
  assets: Array<{ id: string; path: string }>;
  paletteId: string | null;
}

export interface MockApiHooks {
  writeToFile?: (filePath: string, content: string, overwriteExisting?: boolean) => boolean;
  native?: boolean;
  port?: number;
  state?: MockApiState;
}

export interface MockApi {
  create(type: string, name?: string): string;
  primitive(type: string, name?: string): string;
  get(id: string, attr: string): unknown;
  set(id: string, attrs: Record<string, unknown>): boolean;
  connect(sourceId: string, sourceAttr: string, targetId: string, targetAttr: string, force?: boolean): boolean;
  getSelection(): string[];
  select(ids: string[]): void;
  getAllSceneLayers(): string[];
  getCompLayers(topLevel?: boolean): string[];
  getChildren(layerId?: string | null): string[];
  getComps(): string[];
  getActiveComp(): string;
  setActiveComp(id: string): void;
  getBoundingBox(id: string, worldSpace?: boolean): {
    x: number; y: number; width: number; height: number;
    centre: { x: number; y: number };
    left: number; right: number; top: number; bottom: number;
  };
  getScenePalette(): string;
  addSceneSwatch(color: string, name?: string): number;
  writeToFile(filePath: string, content: string, overwriteExisting?: boolean): boolean;
  [key: string]: unknown;
}

export function createMockApiState(): MockApiState;
export function buildMockApi(state: MockApiState, hooks?: MockApiHooks): MockApi;
export function executeInMock(code: string, api: MockApi, context?: Record<string, unknown>): {
  context: Record<string, unknown>;
  result: unknown;
  state: unknown;
};
export function startMockStallion(hooks?: MockApiHooks): Promise<{
  port: number;
  state: MockApiState;
  api: MockApi;
  close(): Promise<void>;
}>;
export type { Server };
