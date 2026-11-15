/** Type declarations for the standalone zero-dependency prelude in motion-core.js. */

export const DEFAULT_FPS: number;

export interface TimelineTweenSpec {
  id: string;
  attr: string;
  from?: number;
  to?: number;
  duration?: number;
  easing?: string | [number, number, number, number] | ((t: number) => number);
  spring?: SpringPhysicsOptions | true;
  ola?: number | { tau: number };
  velocity?: number;
  ease?: string;
}

export interface TimelineSpringTaskSpec {
  id: string;
  attr: string;
  from?: number;
  to?: number;
  spring?: SpringPhysicsOptions | true;
  velocity?: number;
  handleWeight?: number;
}

export type KeyframeTuple = [frame: number, value: number, handles?: Record<string, number>];

export interface TimelineBatchEntry {
  id: string;
  attr: string;
  points: Array<[number, number] | KeyframeTuple>;
  ease: string;
}

export type TimelineTask = (tl: Timeline) => number | { endFrame: number } | void;

export interface Timeline {
  readonly fps: number;
  frame: number;
  readonly endFrame: number;
  batch: TimelineBatchEntry[];
  chain(...tasks: TimelineTask[]): number;
  all(...tasks: TimelineTask[]): number;
  waitFor(frames: number): number;
  delay(frames: number, task: TimelineTask): number;
  sequence(staggerFrames: number, ...tasks: TimelineTask[]): number;
  tween(spec: TimelineTweenSpec): TimelineTask;
  springTask(spec: TimelineSpringTaskSpec): TimelineTask;
}

export function createTimeline(opts?: {
  fps?: number;
  frame?: number;
  write?: (entry: TimelineBatchEntry) => void;
}): Timeline;

export interface SpringPhysicsOptions {
  from?: number;
  to?: number;
  stiffness?: number;
  damping?: number;
  mass?: number;
  velocity?: number;
  fps?: number;
  restDelta?: number;
}

export interface SolvedSpring extends Required<SpringPhysicsOptions> {
  omega0: number;
  zeta: number;
  regime: "underdamped" | "critically" | "overdamped";
  settleTime: number;
  settleFrame: number;
  durationFrames: number;
  overshoot: number;
  atTime(t: number): number;
  at(frame: number): number;
  velocityAtTime(t: number): number;
  velocityAt(frame: number): number;
}

export function solveSpring(opts?: SpringPhysicsOptions): SolvedSpring;

export function springExtremaKeyframes(
  spring: SolvedSpring,
  opts?: { startFrame?: number; handleWeight?: number },
): KeyframeTuple[];

export function slopeDegrees(slopePerFrame: number): number;

export function evaluateCubicBezier(x1: number, y1: number, x2: number, y2: number, t: number): number;

/** Returns [nextValue, nextVelocity]. */
export function olaStep(
  current: number,
  target: number,
  velocity: number,
  dt: number,
  tau?: number,
): [number, number];

export interface OlaPoint {
  frame: number;
  value: number;
  velocity: number;
}

export function olaTrajectory(
  waypoints: Array<{ frame: number; value: number }>,
  opts?: { fps?: number; tau?: number; velocity0?: number },
): { points: OlaPoint[]; finalVelocity: number };

export interface ParticlePreset {
  label: string;
  proton: Record<string, Record<string, unknown>>;
  emitter: Record<string, unknown>;
  behaviours: Array<{ type: string; attrs: Record<string, unknown> }>;
}

export const PARTICLE_PRESETS: Record<string, ParticlePreset>;

export function mapParticlePreset(
  name: keyof typeof PARTICLE_PRESETS | string,
  overrides?: {
    proton?: Record<string, Record<string, unknown>>;
    emitter?: Record<string, unknown>;
    behaviours?: Array<{ attrs?: Record<string, unknown> }>;
  },
): ParticlePreset;
