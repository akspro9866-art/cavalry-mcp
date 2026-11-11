import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {
  RB_HELPERS_SOURCE,
  buildDuikConnectorRig,
  buildDuikTwoBoneIK,
  buildDuikAutomationRig,
  buildDuik2DCameraRig,
  duikConnectorRemap,
  duikTwoBoneAngles,
  duikWheelRotation,
  duikSpringValue,
} from "../../src/presets/rig_builders.js";

function makeApi() {
  let next = 0;
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const log = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args });
  };
  const api = {
    select: log("select"),
    getSelection: () => [],
    create: (type: string) => {
      next += 1;
      calls.push({ method: "create", args: [type] });
      return `${type}#${next}`;
    },
    primitive: (type: string) => {
      next += 1;
      calls.push({ method: "primitive", args: [type] });
      return `basicShape#${next}`;
    },
    set: log("set"),
    connect: log("connect"),
    parent: log("parent"),
    keyframe: log("keyframe"),
    magicEasing: log("magicEasing"),
    hide: log("hide"),
    get: () => 0,
    getBoundingBox: () => ({ centre: { x: 0, y: 0 }, width: 120, height: 60 }),
  };
  return { api, calls };
}

interface RigDsl {
  buildDuikConnectorRig: (name: string, o?: Record<string, unknown>) => Record<string, unknown>;
  buildDuikTwoBoneIK: (name: string, o?: Record<string, unknown>) => Record<string, unknown>;
  buildDuikAutomationRig: (name: string, o?: Record<string, unknown>) => Record<string, unknown>;
  buildDuik2DCameraRig: (name: string, o?: Record<string, unknown>) => Record<string, unknown>;
}

function run(body: string) {
  const { api, calls } = makeApi();
  const context = vm.createContext({ api, console });
  const result = new vm.Script(`(function () {\n${RB_HELPERS_SOURCE}\n${body}\n})()`).runInContext(context) as Record<string, unknown>;
  return { result, calls, api };
}

test("duik rigs: every builder runs with {} defaults and returns layer ids", () => {
  const { result } = run(`
    return {
      connector: _rb.buildDuikConnectorRig("Conn Test"),
      ik: _rb.buildDuikTwoBoneIK("IK Test"),
      spring: _rb.buildDuikAutomationRig("Spring Test", { kind: "spring" }),
      wheel: _rb.buildDuikAutomationRig("Wheel Test", { kind: "wheel" }),
      swing: _rb.buildDuikAutomationRig("Swing Test", { kind: "swing" }),
      blink: _rb.buildDuikAutomationRig("Blink Test", { kind: "blink" }),
      looper: _rb.buildDuikAutomationRig("Looper Test", { kind: "looper" }),
      camera: _rb.buildDuik2DCameraRig("Cam Test")
    };
  `);
  const connector = result.connector as { controller: string; targets: string[] };
  assert.equal(typeof connector.controller, "string");
  assert.equal(connector.targets.length, 5, "connector default target count");
  const ik = result.ik as { root: string; upper: string; lower: string; clamped: boolean };
  assert.ok(ik.root && ik.upper && ik.lower, "IK returns all bones");
  assert.equal(ik.clamped, false);
  for (const kind of ["spring", "wheel", "swing", "blink", "looper"]) {
    const rig = result[kind] as { body: string; samples: number[] };
    assert.equal(typeof rig.body, "string", `${kind} body`);
    assert.ok(rig.samples.length > 4, `${kind} baked samples`);
    assert.ok(rig.samples.every((n) => Number.isFinite(n)), `${kind} finite samples`);
  }
  const camera = result.camera as { camera: string; shake: string; truck: string; pedestal: string; zoom: string; dutch: string };
  assert.ok(camera.camera && camera.shake && camera.truck && camera.pedestal && camera.zoom && camera.dutch, "camera rig surface");
});

test("duik IK: law of cosines reaches the target and clamps unreachable goals", () => {
  const reachable = duikTwoBoneAngles(120, 0, 170, 150);
  assert.equal(reachable.clamped, false);
  const endX = Math.cos(reachable.upper) * 170 + Math.cos(reachable.upper + reachable.lower) * 150;
  const endY = Math.sin(reachable.upper) * 170 + Math.sin(reachable.upper + reachable.lower) * 150;
  assert.ok(Math.abs(endX - 120) < 1e-6, `endX ${endX}`);
  assert.ok(Math.abs(endY) < 1e-6, `endY ${endY}`);
  const clamped = duikTwoBoneAngles(4000, 0, 100, 100);
  assert.equal(clamped.reach, 200, "clamped to full chain length");
  assert.equal(clamped.clamped, true);
  assert.ok(Math.abs(clamped.endX - 200) < 1e-6, "clamped endpoint sits on the chain");
  const stretched = duikTwoBoneAngles(4000, 0, 100, 100, 1, 1.2);
  assert.equal(stretched.reach, 240, "stretch widens the reach clamp");
  const minClamped = duikTwoBoneAngles(1, 0, 100, 90);
  assert.ok(minClamped.reach >= 10, "target inside the dead zone is pushed out");
});

test("duik wheel: rotation is proportional to distance and inverse to radius", () => {
  assert.ok(Math.abs(duikWheelRotation(Math.PI * 50, 50) - 180) < 1e-9, "half turn for pi*r");
  assert.ok(Math.abs(duikWheelRotation(100, 50) - 2 * duikWheelRotation(50, 50)) < 1e-9, "distance doubles rotation");
  assert.ok(Math.abs(duikWheelRotation(100, 100) - duikWheelRotation(50, 50)) < 1e-9, "radius doubles half the rotation");
  assert.equal(duikWheelRotation(100, 0), 0, "zero radius never divides");
  assert.equal(duikWheelRotation(-100, 50), -duikWheelRotation(100, 50), "reverse travel negates");
});

test("duik connector: remap hits both endpoints and clamps outside the range", () => {
  assert.equal(duikConnectorRemap(0, 0, 1, -420, 420), -420);
  assert.equal(duikConnectorRemap(1, 0, 1, -420, 420), 420);
  assert.equal(duikConnectorRemap(0.5, 0, 1, -420, 420), 0);
  assert.equal(duikConnectorRemap(-9, 0, 1, -420, 420), -420, "clamped below");
  assert.equal(duikConnectorRemap(9, 0, 1, -420, 420), 420, "clamped above");
  assert.equal(duikConnectorRemap(-2, 0, 1, 0, 100, false), -200, "unclamped extrapolates");
});

test("duik automation: spring decays toward rest and stays deterministic", () => {
  const early = Math.abs(duikSpringValue(0.1));
  const late = Math.abs(duikSpringValue(2.5));
  assert.ok(early > late, "spring decays");
  assert.equal(duikSpringValue(0), 0, "starts at rest");
  assert.equal(duikSpringValue(0.37), duikSpringValue(0.37), "pure");
});

test("duik builders: exported factory expressions call the _rb rigs", () => {
  assert.match(buildDuikConnectorRig("C"), /_rb\.buildDuikConnectorRig\("C", \{\}\)/);
  assert.match(buildDuikTwoBoneIK("I"), /_rb\.buildDuikTwoBoneIK\("I", \{\}\)/);
  assert.match(buildDuikAutomationRig("A"), /_rb\.buildDuikAutomationRig\("A", \{\}\)/);
  assert.match(buildDuik2DCameraRig("K"), /_rb\.buildDuik2DCameraRig\("K", \{\}\)/);
});
