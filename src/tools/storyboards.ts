/**
 * Storyboard catalogue and frame planner.
 *
 * The 103 Remotion-style scene templates (T001-T103) live as markdown under
 * `scripts/wave2/storyboards/` (copied from motion-craft `references/storyboards`).
 * Each category file has `### T0xx · Title` blocks followed by a metadata line
 * (`durasi 20s · 16:9 · gaya "..." · bgm B26 · komponen: ...`) and a scene table.
 *
 * `storyboardFramePlan()` ports motion-craft `buildSceneTimeline()`: scene
 * boundaries follow the table's relative weights, end frames are exclusive, and
 * transitions that overlap absorb a shared overlap budget (match cuts and END
 * never overlap). Everything is deterministic - no clock, no randomness.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  cuesFromActions,
  resolveBgmTrack,
  type ActionSfx,
  type BgmTrack,
  type SfxCueSpec,
} from "./beats.js";

export const STORYBOARD_DIR = fileURLToPath(new URL("../../scripts/wave2/storyboards", import.meta.url));

export const CAMERA_BEHAVIOR: Record<string, string> = {
  HOLD: "Hold the readable framing.",
  PUSH: "Short push into the needed detail, then hold.",
  PULL: "Pull out to reveal the relationship or result.",
  TYPE: "Follow the typing area when a static frame is not enough.",
  CURSOR: "Keep the control and the cursor tip inside one frame.",
  GLIDE: "Glide along the subject motion or reading order.",
};

export const TRANSITION_NAMES: Record<string, string> = {
  MC: "match-cut",
  END: "none",
  WGL: "whip-glide-left",
  WGU: "whip-glide-up",
  PZI: "portal-zoom-in",
  SSU: "spring-sheet-up",
  MORPH: "shared-element-morph",
};

export interface StoryboardBeat {
  number: number;
  startSeconds: number;
  endSeconds: number;
  weight: number;
  visual: string;
  motion: string;
  camera: string;
  transition: string;
  sfx: string[];
  sfxActions: ActionSfx[];
  rawSfx: string;
}

export interface StoryboardScenePlan {
  sceneIndex: number;
  pacingRole: string;
  startFrame: number;
  endFrame: number;
  durationInFrames: number;
  contentFrames: number;
  startSeconds: number;
  endSeconds: number;
  camera: string;
  cameraSplineBehavior: string;
  enterTransition: string;
  exitTransition: string;
  enterOverlapFrames: number;
  exitOverlapFrames: number;
  jCutAudioFrame: number | null;
  visual: string;
  motion: string;
  sfx: string[];
  sfxActions: ActionSfx[];
}

export interface StoryboardDef {
  id: string;
  title: string;
  category: string;
  file: string;
  durationSeconds: number;
  aspect: string;
  style: string | null;
  bgmId: string | null;
  bgm: BgmTrack | null;
  components: string[];
  beats: StoryboardBeat[];
  warnings: string[];
}

export interface StoryboardIndexEntry {
  id: string;
  title: string;
  durationSeconds: number;
  aspect: string;
  category: string;
  file: string;
}

export interface StoryboardIndex {
  directory: string;
  templates: StoryboardIndexEntry[];
  categories: Array<{ number: number; title: string; file: string; ids: string[] }>;
}

export interface StoryboardPlanOptions {
  fps?: number;
  overlapFrames?: number;
  /** Override the template duration (seconds). */
  durationSeconds?: number;
  /** Alternate directory containing the category markdown files. */
  dir?: string;
}

export interface StoryboardPlan {
  id: string;
  title: string;
  category: string;
  aspect: string;
  style: string | null;
  fps: number;
  durationSeconds: number;
  totalFrames: number;
  overlapFrames: number;
  bgm: BgmTrack | null;
  components: string[];
  scenes: StoryboardScenePlan[];
  cues: SfxCueSpec[];
  warnings: string[];
}

/** SFX tokens used by the storyboards, longest/most specific first. */
const SFX_TOKENS: Array<[RegExp, ActionSfx]> = [
  [/pop-plop/i, "popPlop"],
  [/pop-in|pop-pluck/i, "popIn"],
  [/data-reveal/i, "dataReveal"],
  [/confirm-glass|confirm/i, "chime"],
  [/impact/i, "impact"],
  [/success|selesai/i, "success"],
  [/\berror\b|gagal/i, "error"],
  [/\bclick\b|klik/i, "click"],
  [/\btype\b|ketik|typing/i, "typing"],
  [/\bprog\b|progress/i, "progress"],
  [/hover|rollover/i, "hover"],
  [/whoosh|swish|swipe|transisi/i, "transition"],
];

function isNoneToken(token: string): boolean {
  return token === "" || token === "—" || token === "–" || token === "-" || /^(none|jeda)$/i.test(token);
}

/** Split a storyboard SFX cell into actions and unknown tokens. */
export function parseSfxTokens(cell: string): { actions: ActionSfx[]; unknown: string[] } {
  const actions: ActionSfx[] = [];
  const unknown: string[] = [];
  for (const rawToken of String(cell ?? "").split(/[,+/]|&/)) {
    const token = rawToken.trim();
    if (isNoneToken(token)) continue;
    const match = SFX_TOKENS.find(([pattern]) => pattern.test(token));
    if (match) {
      if (!actions.includes(match[1])) actions.push(match[1]);
    } else {
      unknown.push(token);
    }
  }
  return { actions, unknown };
}

function readCategoryFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    throw new Error(
      `Storyboard folder not found: ${dir}. Expected scripts/wave2/storyboards (copied from motion-craft references/storyboards).`,
    );
  }
  return fs
    .readdirSync(dir)
    .filter((name) => /^\d{2}-.+\.md$/.test(name))
    .sort();
}

function parseRow(line: string): string[] {
  return line
    .split(/(?<!\\)\|/)
    .slice(1, -1)
    .map((value) => value.trim().replace(/\\\|/g, "|"));
}

function parseComponents(metadata: string): string[] {
  const tail = metadata.split(/komponen\s*:/i)[1];
  if (!tail) return [];
  const tags = Array.from(tail.matchAll(/<([A-Za-z][\w.]*)/g)).map((match) => match[1]);
  if (tags.length) return Array.from(new Set(tags));
  return tail
    .split(/[,·]/)
    .map((value) => value.trim().replace(/^`|`$/g, ""))
    .filter((value) => value && !/^opsional$/i.test(value));
}

/** Parse one category markdown file into storyboard definitions. */
export function parseStoryboardFile(filePath: string, categoryLabel?: string): StoryboardDef[] {
  const body = fs.readFileSync(filePath, "utf8");
  const file = path.basename(filePath);
  const header = /^#\s+Storyboard\s+(.+?)\s*[·—]\s*(.+?)\s*(?:\(T\d{3}[–-]T\d{3}\))?$/m.exec(body);
  const category = categoryLabel ?? (header ? `${header[1].trim()} · ${header[2].trim()}` : file.replace(/\.md$/, ""));
  const out: StoryboardDef[] = [];

  for (const block of body.split(/\n(?=### T\d{3}\b)/)) {
    const [heading, metadata = ""] = block.split(/\r?\n/);
    const match = /^### (T\d{3}) · (.+)$/.exec(heading?.trim() ?? "");
    if (!match) continue;
    const warnings: string[] = [];
    const durationMatch = /durasi\s+([\d.]+)\s*s/i.exec(metadata);
    const durationSeconds = durationMatch ? Number(durationMatch[1]) : Number.NaN;
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      warnings.push(`${match[1]}: missing "durasi <n>s" metadata`);
    }
    const aspect = /\b(16:9|9:16|1:1)\b/.exec(metadata)?.[1] ?? "16:9";
    const style = /gaya\s+"([^"]+)"/i.exec(metadata)?.[1] ?? null;
    const bgmId = /\bbgm\s+(B\d{2})/i.exec(metadata)?.[1]?.toUpperCase() ?? null;
    const components = parseComponents(metadata);

    const beats: StoryboardBeat[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (!/^\|\s*\d+\s*\|/.test(line)) continue;
      const columns = parseRow(line);
      const [number, time, visual, motion, camera, transition] = columns;
      const range = /^([\d.]+)\s*[–\-—]\s*([\d.]+)$/.exec(time ?? "");
      if (columns.length !== 7 || !range) {
        warnings.push(`${match[1]}: skipped malformed beat row "${line.slice(0, 60)}"`);
        continue;
      }
      const startSeconds = Number(range[1]);
      const endSeconds = Number(range[2]);
      if (!(endSeconds > startSeconds)) {
        warnings.push(`${match[1]}: beat ${number} has an empty time range`);
        continue;
      }
      if (!CAMERA_BEHAVIOR[camera]) warnings.push(`${match[1]}: unknown camera code "${camera}"`);
      if (!TRANSITION_NAMES[transition]) warnings.push(`${match[1]}: unknown transition code "${transition}"`);
      const sound = String(columns[6] ?? "");
      const parsed = parseSfxTokens(sound);
      if (parsed.unknown.length) warnings.push(`${match[1]}: unmapped SFX "${parsed.unknown.join(", ")}"`);
      beats.push({
        number: Number(number),
        startSeconds,
        endSeconds,
        weight: Math.max(0, endSeconds - startSeconds),
        visual: visual ?? "",
        motion: motion ?? "",
        camera: camera ?? "HOLD",
        transition: transition ?? "MC",
        sfx: parsed.actions,
        sfxActions: parsed.actions,
        rawSfx: sound,
      });
    }

    if (!beats.length) {
      warnings.push(`${match[1]}: no valid scene rows`);
    } else {
      const last = beats[beats.length - 1].endSeconds;
      if (Number.isFinite(durationSeconds) && Math.abs(last - durationSeconds) > 0.01) {
        warnings.push(`${match[1]}: last beat ends at ${last}s but durasi is ${durationSeconds}s`);
      }
    }

    out.push({
      id: match[1],
      title: match[2].trim(),
      category,
      file: `scripts/wave2/storyboards/${file}`,
      durationSeconds,
      aspect,
      style,
      bgmId,
      bgm: bgmId ? resolveBgmTrack(bgmId) : null,
      components,
      beats,
      warnings,
    });
  }
  return out;
}

let cachedCatalog: StoryboardDef[] | null = null;
let cachedCatalogKey = "";

/** Parse every category file once. */
export function loadStoryboardCatalog(dir = STORYBOARD_DIR): StoryboardDef[] {
  const key = path.resolve(dir);
  if (cachedCatalog && cachedCatalogKey === key) return cachedCatalog;
  const catalog: StoryboardDef[] = [];
  for (const file of readCategoryFiles(dir)) {
    catalog.push(...parseStoryboardFile(path.join(dir, file)));
  }
  if (!catalog.length) {
    throw new Error(`No storyboards found in ${dir}. Expected markdown headings like "### T001 · Title".`);
  }
  catalog.sort((a, b) => a.id.localeCompare(b.id));
  cachedCatalog = catalog;
  cachedCatalogKey = key;
  return catalog;
}

/** Markdown index of all templates (parsed from INDEX.md). */
export function loadStoryboardIndex(dir = STORYBOARD_DIR): StoryboardIndex {
  const indexPath = path.join(dir, "INDEX.md");
  if (!fs.existsSync(indexPath)) {
    throw new Error(
      `Storyboard index not found: ${indexPath}. Expected scripts/wave2/storyboards/INDEX.md (copied from motion-craft references/storyboards).`,
    );
  }
  const body = fs.readFileSync(indexPath, "utf8");
  const templates: StoryboardIndexEntry[] = [];
  const categories: StoryboardIndex["categories"] = [];
  let current: StoryboardIndex["categories"][number] | null = null;

  for (const line of body.split(/\r?\n/)) {
    const heading = /^###\s+(\d{2})\s+·\s+(.+?)\s+—\s+`([^`]+)`\s*$/.exec(line.trim());
    if (heading) {
      current = { number: Number(heading[1]), title: heading[2].trim(), file: `scripts/wave2/storyboards/${heading[3]}`, ids: [] };
      categories.push(current);
      continue;
    }
    const row = /^\|\s*(T\d{3})\s*\|\s*([^|]+?)\s*\|\s*([\d.]+)s\s*\|\s*([^|]+?)\s*\|$/.exec(line.trim());
    if (row && current) {
      const entry: StoryboardIndexEntry = {
        id: row[1],
        title: row[2].trim(),
        durationSeconds: Number(row[3]),
        aspect: row[4].trim(),
        category: current.title,
        file: current.file,
      };
      templates.push(entry);
      current.ids.push(entry.id);
    }
  }
  if (!templates.length) {
    throw new Error(`Storyboard index at ${indexPath} lists no templates.`);
  }
  return { directory: path.resolve(dir), templates, categories };
}

/** All template ids in catalogue order. */
export function listStoryboards(dir = STORYBOARD_DIR): StoryboardIndexEntry[] {
  return loadStoryboardIndex(dir).templates;
}

/** Load one storyboard by id (T001-T103). */
export function loadStoryboard(id: string, dir = STORYBOARD_DIR): StoryboardDef {
  const wanted = String(id ?? "").trim().toUpperCase();
  if (!/^T\d{3}$/.test(wanted)) {
    throw new Error(`Invalid storyboard id "${id}". Use a template id like T032.`);
  }
  const catalog = loadStoryboardCatalog(dir);
  const found = catalog.find((entry) => entry.id === wanted);
  if (!found) {
    const first = catalog[0]?.id;
    const last = catalog[catalog.length - 1]?.id;
    throw new Error(`Unknown storyboard "${wanted}". Valid ids: ${first}-${last} (${catalog.length} templates).`);
  }
  return found;
}

/**
 * Build the frame plan for a storyboard, mirroring motion-craft
 * `buildSceneTimeline()`: `totalFrames` is divided by beat weights, end frames
 * are exclusive, and overlapping exits borrow frames from the next scene.
 */
export function storyboardFramePlan(id: string, opts: StoryboardPlanOptions = {}): StoryboardPlan {
  const dir = opts.dir ?? STORYBOARD_DIR;
  const def = loadStoryboard(id, dir);
  const fps = Number.isFinite(opts.fps) && Number(opts.fps) > 0 ? Number(opts.fps) : 30;
  const overlapFrames = Number.isFinite(opts.overlapFrames) ? Math.max(0, Math.round(Number(opts.overlapFrames))) : 10;
  const durationSeconds =
    Number.isFinite(opts.durationSeconds) && Number(opts.durationSeconds) > 0 ? Number(opts.durationSeconds) : def.durationSeconds;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error(`Storyboard ${def.id} has no usable duration; pass durationSeconds.`);
  }

  const beats = def.beats;
  const totalFrames = Math.round(durationSeconds * fps);
  if (totalFrames < beats.length) {
    throw new Error(`Storyboard ${def.id} needs at least ${beats.length} frames at ${fps} fps (got ${totalFrames}).`);
  }
  const weightSum = beats.reduce((sum, beat) => sum + beat.weight, 0) || 1;
  const spare = totalFrames - beats.length;
  const boundaries = [0];
  let weightSoFar = 0;
  for (const beat of beats) {
    weightSoFar += beat.weight;
    boundaries.push(boundaries.length + Math.round((spare * weightSoFar) / weightSum));
  }

  const lengths = beats.map((_, index) => boundaries[index + 1] - boundaries[index]);
  const overlaps = beats.map((beat, index) => {
    if (index === beats.length - 1 || beat.transition === "MC" || beat.transition === "END") return 0;
    const shared = Math.min(overlapFrames, Math.floor((lengths[index] - 1) / 2), Math.floor((lengths[index + 1] - 1) / 2));
    return shared >= 2 ? shared : 0;
  });

  const exitTransitions = beats.map((beat, index) =>
    index === beats.length - 1
      ? "none"
      : overlaps[index] > 0
        ? TRANSITION_NAMES[beat.transition] ?? beat.transition
        : "match-cut",
  );

  const scenes: StoryboardScenePlan[] = beats.map((beat, index) => {
    const startFrame = boundaries[index];
    const cutFrame = boundaries[index + 1];
    const endFrame = cutFrame + overlaps[index];
    const exitTransition = exitTransitions[index];
    const enterTransition = index > 0 ? exitTransitions[index - 1] : "none";
    return {
      sceneIndex: index + 1,
      pacingRole:
        index === 0 ? "Hook dan konteks" : index === beats.length - 1 ? "Hasil dan hold" : `Beat isi ${index}`,
      startFrame,
      endFrame,
      durationInFrames: endFrame - startFrame,
      contentFrames: lengths[index],
      startSeconds: Math.round((startFrame / fps) * 1000) / 1000,
      endSeconds: Math.round((endFrame / fps) * 1000) / 1000,
      camera: beat.camera,
      cameraSplineBehavior: CAMERA_BEHAVIOR[beat.camera] ?? "Hold the readable framing.",
      enterTransition,
      exitTransition,
      enterOverlapFrames: index > 0 ? overlaps[index - 1] : 0,
      exitOverlapFrames: overlaps[index],
      jCutAudioFrame: overlaps[index] > 0 ? Math.max(startFrame, cutFrame - 4) : null,
      visual: beat.visual,
      motion: beat.motion,
      sfx: beat.sfx,
      sfxActions: beat.sfxActions,
    };
  });

  const actions = scenes.flatMap((scene) =>
    scene.sfxActions.map((action) => ({ action, frame: scene.startFrame, label: `${def.id}_s${scene.sceneIndex}_${action}` })),
  );
  const warnings = def.warnings.filter((warning) => !/unmapped SFX/.test(warning));

  return {
    id: def.id,
    title: def.title,
    category: def.category,
    aspect: def.aspect,
    style: def.style,
    fps,
    durationSeconds,
    totalFrames,
    overlapFrames,
    bgm: def.bgm,
    components: def.components,
    scenes,
    cues: cuesFromActions(actions, fps),
    warnings,
  };
}

/** Compact scaffold for tools: scene ranges plus the BGM bed. */
export interface StoryboardScaffold {
  template: string;
  title: string;
  fps: number;
  totalFrames: number;
  aspect: string;
  bgmId: string | null;
  scenes: Array<{
    scene: number;
    startFrame: number;
    endFrame: number;
    durationInFrames: number;
    camera: string;
    transition: string;
    sfx: string[];
  }>;
}

export function storyboardScaffold(id: string, opts: StoryboardPlanOptions = {}): StoryboardScaffold {
  return storyboardScaffoldFromPlan(storyboardFramePlan(id, opts));
}

export function storyboardScaffoldFromPlan(plan: StoryboardPlan): StoryboardScaffold {
  return {
    template: plan.id,
    title: plan.title,
    fps: plan.fps,
    totalFrames: plan.totalFrames,
    aspect: plan.aspect,
    bgmId: plan.bgm?.id ?? null,
    scenes: plan.scenes.map((scene) => ({
      scene: scene.sceneIndex,
      startFrame: scene.startFrame,
      endFrame: scene.endFrame,
      durationInFrames: scene.durationInFrames,
      camera: scene.camera,
      transition: scene.exitTransition,
      sfx: scene.sfx,
    })),
  };
}
