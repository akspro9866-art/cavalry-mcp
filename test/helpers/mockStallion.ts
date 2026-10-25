/**
 * Mock Stallion: an HTTP server that mimics the real bridge — accepts
 * POST /post with { type, code }, executes the code inside a node:vm
 * sandbox with a mock Cavalry `api`, and answers with a fixed ack body
 * (the real one never returns script data either).
 *
 * The mock api models just enough of Cavalry for the tests: layers with
 * attributes, keyframes, comps, and a writeToFile that hits the real
 * filesystem with Cavalry's documented overwrite semantics.
 */
import vm from "node:vm";
import http from "node:http";
import fs from "node:fs";
import type { AddressInfo } from "node:net";

export interface MockApiState {
  layers: Map<string, { type: string; name: string; attrs: Record<string, unknown> }>;
  keyframes: Array<{ layerId: string; frame: number; attributes: Record<string, unknown> }>;
  easings: Array<{ layerId: string; attrPath: string; frame: number; name: string }>;
  selection: string[];
  order: string[];
  expressions: Map<string, string>;
  connections: Array<{ sourceId: string; sourceAttr: string; targetId: string; targetAttr: string }>;
  comps: Array<{ id: string; name: string }>;
  activeComp: string;
}

export function createMockApiState(): MockApiState {
  return {
    layers: new Map(),
    keyframes: [],
    easings: [],
    selection: [],
    order: [],
    expressions: new Map(),
    connections: [],
    comps: [{ id: "comp#1", name: "Comp 1" }],
    activeComp: "comp#1",
  };
}

export interface MockApiHooks {
  /** Invoked as api.writeToFile — replace to simulate failures. */
  writeToFile?: (filePath: string, content: string, overwriteExisting?: boolean) => boolean;
}

export function buildMockApi(state: MockApiState, hooks: MockApiHooks = {}) {
  let seq = 0;
  const layer = (id: string) => {
    const l = state.layers.get(id);
    if (!l) throw new Error(`layer ${id} not found`);
    return l;
  };
  return {
    create(type: string, name?: string) {
      const id = `${type}#${++seq}`;
      state.layers.set(id, { type, name: name ?? id, attrs: {} });
      return id;
    },
    get(id: string, attr: string) {
      const l = layer(id);
      if (!(attr in l.attrs)) throw new Error(`attribute ${attr} not found on ${id}`);
      return l.attrs[attr];
    },
    set(id: string, attrs: Record<string, unknown>) {
      Object.assign(layer(id).attrs, attrs);
      return true;
    },
    connect(sourceId: string, sourceAttr: string, targetId: string, targetAttr: string, force?: boolean) {
      layer(sourceId);
      layer(targetId);
      state.connections.push({ sourceId, sourceAttr, targetId, targetAttr });
      state.order.push(`connect:${sourceId}.${sourceAttr}->${targetId}.${targetAttr}${force ? "!" : ""}`);
      return true;
    },
    setGenerator(id: string, attr: string, generatorType: string) {
      layer(id);
      state.order.push(`setGenerator:${id}:${attr}:${generatorType}`);
      return true;
    },
    addDynamic(id: string, name: string, type: string) {
      layer(id);
      state.order.push(`addDynamic:${id}:${name}:${type}`);
      return true;
    },
    getAttributes(id: string) {
      return Object.keys(layer(id).attrs);
    },
    getAttributeDefinition(id: string, attr: string) {
      layer(id);
      return { attrId: attr, type: "mock" };
    },
    getAnimatedAttributes(id: string) {
      layer(id);
      return [...new Set(state.keyframes.filter((k) => k.layerId === id).flatMap((k) => Object.keys(k.attributes)))];
    },
    getKeyframeTimes(id: string, attr: string) {
      return state.keyframes.filter((k) => k.layerId === id && attr in k.attributes).map((k) => k.frame);
    },
    keyframe(id: string, frame: number, attributes: Record<string, unknown>) {
      layer(id);
      const kf = { layerId: id, frame, attributes };
      state.keyframes.push(kf);
      return `kf#${state.keyframes.length}`;
    },
    magicEasing(id: string, attrPath: string, frame: number, name: string) {
      layer(id);
      state.easings.push({ layerId: id, attrPath, frame, name });
      return true;
    },
    deleteKeyframe(id: string, attr: string, frame: number) {
      layer(id);
      const before = state.keyframes.length;
      state.keyframes = state.keyframes.filter(
        (k) => !(k.layerId === id && k.frame === frame && attr in k.attributes),
      );
      if (state.keyframes.length === before) throw new Error(`no keyframe at frame ${frame} for ${attr}`);
    },
    deleteAnimation(id: string, attr: string) {
      layer(id);
      state.keyframes = state.keyframes.filter((k) => !(k.layerId === id && attr in k.attributes));
    },
    setKeyframeVelocity(id: string, dict: unknown) {
      layer(id);
      state.order.push(`setKeyframeVelocity:${id}:${JSON.stringify(dict)}`);
    },
    clearKeyframeVelocity(id: string, dict: unknown) {
      layer(id);
      state.order.push(`clearKeyframeVelocity:${id}:${JSON.stringify(dict)}`);
    },
    getInConnectedAttributes(id: string) {
      layer(id);
      return [...new Set(state.connections.filter((c) => c.targetId === id).map((c) => c.targetAttr))];
    },
    getInConnection(id: string, attr: string) {
      layer(id);
      const c = state.connections.find((x) => x.targetId === id && x.targetAttr === attr);
      return c ? `${c.sourceId}.${c.sourceAttr}` : "";
    },
    getOutConnections(id: string, attr: string) {
      layer(id);
      return state.connections
        .filter((c) => c.sourceId === id && c.sourceAttr === attr)
        .map((c) => `${c.targetId}.${c.targetAttr}`);
    },
    setAttributeExpression(id: string, attr: string, expression: string) {
      layer(id);
      state.expressions.set(`${id}:${attr}`, expression);
    },
    getAttributeExpression(id: string, attr: string) {
      layer(id);
      return state.expressions.get(`${id}:${attr}`) ?? "";
    },
    hasAttributeExpression(id: string, attr: string) {
      layer(id);
      return state.expressions.has(`${id}:${attr}`);
    },
    setGradientFromColors(id: string, attr: string, colors: string[]) {
      layer(id);
      layer(id).attrs[attr] = [...colors];
      state.order.push(`setGradientFromColors:${id}:${attr}:${colors.length}`);
    },
    generateHarmoniousPalette(baseColor: string, count: number, type: string) {
      return Array.from({ length: count }, (_, i) => (i === 0 ? baseColor : `${baseColor}${i}`));
    },
    bringForward() {
      if (!state.selection.length) throw new Error("no selection");
      state.order.push(`bringForward:${state.selection.join(",")}`);
    },
    bringToFront() {
      if (!state.selection.length) throw new Error("no selection");
      state.order.push(`bringToFront:${state.selection.join(",")}`);
    },
    moveBackward() {
      if (!state.selection.length) throw new Error("no selection");
      state.order.push(`moveBackward:${state.selection.join(",")}`);
    },
    moveToBack() {
      if (!state.selection.length) throw new Error("no selection");
      state.order.push(`moveToBack:${state.selection.join(",")}`);
    },
    createComp(name: string) {
      const id = `comp#${state.comps.length + 1}`;
      state.comps.push({ id, name });
      return id;
    },
    getComps() {
      return state.comps.map((c) => c.id);
    },
    setActiveComp(compId: string) {
      if (!state.comps.some((c) => c.id === compId)) throw new Error(`comp ${compId} not found`);
      state.activeComp = compId;
    },
    getCompLayers(_topLevel: boolean) {
      // real API reads the active comp only
      return [...state.layers.keys()];
    },
    getCompLayersOfType(_topLevel: boolean, type: string) {
      return this.getCompLayers(_topLevel).filter((id) => state.layers.get(id)?.type === type);
    },
    preCompose(name?: string) {
      if (!state.selection.length) throw new Error("no selection");
      const compId = `comp#${state.comps.length + 1}`;
      state.comps.push({ id: compId, name: name ?? "Pre-comp" });
      const refId = `compReference#${state.comps.length}`;
      state.layers.set(refId, { type: "compReference", name: name ?? "Pre-comp", attrs: {} });
      state.order.push(`preCompose:${state.selection.join(",")}:${compId}`);
      return refId;
    },
    newScene() {
      state.layers.clear();
      state.keyframes = [];
      state.easings = [];
      state.connections = [];
      state.expressions.clear();
      state.comps = [{ id: "comp#1", name: "Comp 1" }];
      state.activeComp = "comp#1";
      state.order.push("newScene");
    },
    resetTransform(id: string) {
      layer(id);
      state.order.push(`resetTransform:${id}`);
    },
    freezeTransform(id: string) {
      layer(id);
      state.order.push(`freezeTransform:${id}`);
    },
    centrePivot(id: string, doCentroid: boolean) {
      layer(id);
      state.order.push(`centrePivot:${id}:${doCentroid}`);
    },
    getAllLayerTypes(includeExperimental: boolean) {
      const types = [
        { type: "basicShape", name: "Basic Shape" },
        { type: "textShape", name: "Text Shape" },
        { type: "linearGradient", name: "Linear Gradient" },
        { type: "noiseDeformer", name: "Noise Deformer" },
      ];
      if (includeExperimental) types.push({ type: "experimentalThing", name: "Experimental Thing" });
      return types;
    },
    play() {
      state.order.push("play");
    },
    stop() {
      state.order.push("stop");
    },
    getCavalryVersion() {
      return "2.8.0";
    },
    getActiveComp() {
      return state.activeComp;
    },
    getLayerType(id: string) {
      return state.layers.get(id)?.type ?? null;
    },
    getNiceName(id: string) {
      return state.layers.get(id)?.name ?? null;
    },
    getAllSceneLayers() {
      return [...state.layers.keys()];
    },
    getSelection() {
      return [...state.selection];
    },
    select(ids: string[]) {
      state.selection = [...ids];
    },
    deleteLayer(id: string) {
      state.layers.delete(id);
    },
    rename(id: string, name: string) {
      layer(id).name = name;
    },
    duplicate(id: string) {
      const l = layer(id);
      const nid = `${l.type}#${++seq}`;
      state.layers.set(nid, { type: l.type, name: `${l.name} copy`, attrs: { ...l.attrs } });
      return nid;
    },
    duplicateSelection() {
      if (state.selection.length !== 1) throw new Error("no single selection");
      return this.duplicate(state.selection[0]);
    },
    parent(id: string, parentId: string) {
      layer(id);
      layer(parentId);
      state.order.push(`parent:${id}->${parentId}`);
    },
    unParent(id: string) {
      layer(id);
      state.order.push(`unparent:${id}`);
    },
    getParent() {
      return "";
    },
    reorder(id: string, underId: string) {
      layer(id);
      layer(underId);
      state.order.push(`reorder:${id}:${underId}`);
    },
    setInFrame(id: string, f: number) {
      layer(id).attrs.inFrame = f;
    },
    setOutFrame(id: string, f: number) {
      layer(id).attrs.outFrame = f;
    },
    offsetLayerTime(id: string, delta: number) {
      layer(id);
      state.order.push(`offsetLayerTime:${id}:${delta}`);
    },
    getInFrame() {
      return 0;
    },
    getOutFrame() {
      return 60;
    },
    getFrame() {
      return 7;
    },
    setFrame(f: number) {
      state.order.push(`setFrame:${f}`);
    },
    renderPNGFrame(filePath: string, scale: number) {
      state.order.push(`renderPNGFrame:${filePath}:${scale}`);
      // canonical 1x1 red PNG — enough for decode/inline-image assertions
      fs.writeFileSync(
        filePath,
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
          "base64",
        ),
      );
      return true;
    },
    addRenderQueueItem(comp: string) {
      state.order.push(`addRenderQueueItem:${comp}`);
      return `renderQueueItem#${++seq}`;
    },
    backgroundRender(id: string) {
      state.order.push(`backgroundRender:${id}`);
    },
    getRenderQueueItems() {
      return ["renderQueueItem#1"];
    },
    cancelRender() {
      state.order.push("cancelRender");
    },
    getRenderPath() {
      return "C:/mock/renders";
    },
    loadAsset(p: string) {
      state.order.push(`loadAsset:${p}`);
      return `asset#${++seq}`;
    },
    addAssetToComp(assetId: string) {
      const id = `imageAsset#${++seq}`;
      state.layers.set(id, { type: "imageAsset", name: assetId, attrs: {} });
      return id;
    },
    getBoundingBox() {
      return { x: -10, y: -5, width: 20, height: 10, centre: { x: 0, y: 0 } };
    },
    writeToFile(filePath: string, content: string, overwriteExisting?: boolean) {
      if (hooks.writeToFile) return hooks.writeToFile(filePath, content, overwriteExisting);
      if (overwriteExisting === false && fs.existsSync(filePath)) return false;
      fs.writeFileSync(filePath, content);
      return true;
    },
    __order(tag: string) {
      state.order.push(tag);
    },
  };
}

export interface MockStallion {
  port: number;
  state: MockApiState;
  close(): Promise<void>;
}

/** Start the mock bridge on an ephemeral port. */
export function startMockStallion(hooks: MockApiHooks = {}): Promise<MockStallion> {
  const state = createMockApiState();
  const api = buildMockApi(state, hooks);
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      if (req.method === "POST" && req.url === "/post") {
        try {
          const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { code: string };
          const ctx = vm.createContext({ api });
          new vm.Script(payload.code).runInContext(ctx);
        } catch (e) {
          // the real bridge logs to Cavalry's log window; the wrapped script's
          // own try/catch does the error reporting via the result file
        }
        // fixed ack body, like the real Stallion
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("ack");
      } else {
        res.writeHead(404);
        res.end();
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        port: (server.address() as AddressInfo).port,
        state,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}
