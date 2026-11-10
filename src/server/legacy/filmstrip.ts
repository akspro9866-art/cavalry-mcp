/**
 * Pure raster helpers for cavalry_render_filmstrip: decode PNGs, composite
 * them into a contact-sheet grid, encode back to PNG. Kept free of bridge
 * concerns so it is unit-testable.
 */
import { PNG } from "pngjs";

export interface RasterFrame {
  width: number;
  height: number;
  /** RGBA, 8 bits per channel */
  data: Buffer;
}

export function decodePng(buf: Buffer): RasterFrame {
  const png = PNG.sync.read(buf);
  return { width: png.width, height: png.height, data: png.data };
}

export function encodePng(frame: RasterFrame): Buffer {
  const png = new PNG({ width: frame.width, height: frame.height });
  frame.data.copy(png.data);
  return PNG.sync.write(png);
}

/**
 * Lay frames out left-to-right, top-to-bottom in a grid of `columns`
 * columns. Each cell is the largest frame size; smaller frames are
 * top-left aligned in their cell over a dark background.
 */
export function compositeGrid(frames: RasterFrame[], columns: number): RasterFrame {
  if (frames.length === 0) {
    throw new Error("no frames to composite");
  }
  const cols = Math.max(1, Math.min(columns, frames.length));
  const rows = Math.ceil(frames.length / cols);
  const cellW = Math.max(...frames.map((f) => f.width));
  const cellH = Math.max(...frames.map((f) => f.height));
  const width = cols * cellW;
  const height = rows * cellH;
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 20;
    data[i * 4 + 1] = 20;
    data[i * 4 + 2] = 20;
    data[i * 4 + 3] = 255;
  }

  frames.forEach((f, idx) => {
    const ox = (idx % cols) * cellW;
    const oy = Math.floor(idx / cols) * cellH;
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        const src = (y * f.width + x) * 4;
        const dst = ((oy + y) * width + ox + x) * 4;
        const sa = f.data[src + 3] / 255;
        const da = data[dst + 3] / 255;
        const outA = sa + da * (1 - sa);
        if (outA === 0) continue;
        for (let c = 0; c < 3; c++) {
          const sc = f.data[src + c];
          const dc = data[dst + c];
          data[dst + c] = Math.round((sc * sa + dc * da * (1 - sa)) / outA);
        }
        data[dst + 3] = Math.round(outA * 255);
      }
    }
  });

  return { width, height, data };
}

/** Sample `count` frame numbers evenly across [inFrame, outFrame] inclusive. */
export function sampleFrames(inFrame: number, outFrame: number, count: number): number[] {
  if (count <= 1) return [Math.round(inFrame)];
  const span = outFrame - inFrame;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    out.push(Math.round(inFrame + (span * i) / (count - 1)));
  }
  return out;
}

export interface FilmstripBoundingBox {
  layerId: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  role?: "text" | "card" | "hero" | "background" | "ui";
  inFrame?: number;
  outFrame?: number;
}

export interface FilmstripReviewOptions {
  compWidth?: number;
  compHeight?: number;
  fps?: number;
  safeMarginPx?: number;
  minReadabilityHoldSec?: number;
  frames?: RasterFrame[];
}

export interface FilmstripReviewIssue {
  type: "collision" | "clipping" | "safe_margin" | "readability_hold" | "blank_frame";
  severity: "warning" | "error";
  layerIds: string[];
  message: string;
}

export interface FilmstripReviewResult {
  passed: boolean;
  score: number;
  issues: FilmstripReviewIssue[];
  checkedBoxes: number;
  checkedFrames: number;
}

/**
 * Automated visual review loop (remotion-dev/skills / wshobson/agents pattern):
 * Evaluates layer bounding boxes and optional raster contact-sheet frames for:
 *  - Out-of-frame clipping
 *  - Safe-margin violations
 *  - Unintended text-on-text / sibling bounding-box collisions
 *  - Readability hold duration (>= 0.70s for text elements)
 *  - Blank raster frames
 */
export function evaluateFilmstripReviewLoop(
  boxes: FilmstripBoundingBox[],
  opts: FilmstripReviewOptions = {},
): FilmstripReviewResult {
  const compW = opts.compWidth ?? 1920;
  const compH = opts.compHeight ?? 1080;
  const fps = Math.max(1, opts.fps ?? 60);
  const margin = opts.safeMarginPx ?? 60;
  const minHoldSec = opts.minReadabilityHoldSec ?? 0.70;
  const issues: FilmstripReviewIssue[] = [];

  for (const box of boxes) {
    if (box.role === "background") continue;
    const minX = Math.min(box.left, box.right);
    const maxX = Math.max(box.left, box.right);
    const minY = Math.min(box.top, box.bottom);
    const maxY = Math.max(box.top, box.bottom);

    if (minX < 0 || minY < 0 || maxX > compW || maxY > compH) {
      issues.push({
        type: "clipping",
        severity: "error",
        layerIds: [box.layerId],
        message: `Layer '${box.layerId}' clips outside composition bounds (${compW}x${compH}).`,
      });
    } else if (
      box.role === "text" &&
      (minX < margin || minY < margin || maxX > compW - margin || maxY > compH - margin)
    ) {
      issues.push({
        type: "safe_margin",
        severity: "warning",
        layerIds: [box.layerId],
        message: `Text layer '${box.layerId}' violates ${margin}px safe title margin.`,
      });
    }

    if (box.role === "text" && typeof box.inFrame === "number" && typeof box.outFrame === "number") {
      const holdSec = Math.max(0, box.outFrame - box.inFrame) / fps;
      if (holdSec < minHoldSec) {
        issues.push({
          type: "readability_hold",
          severity: "warning",
          layerIds: [box.layerId],
          message: `Text layer '${box.layerId}' hold (${holdSec.toFixed(2)}s) is below ${minHoldSec.toFixed(2)}s readability threshold.`,
        });
      }
    }
  }

  // Check text-on-text collisions for temporally overlapping layers
  const textBoxes = boxes.filter((b) => (b.role ?? "text") === "text");
  for (let i = 0; i < textBoxes.length; i++) {
    for (let j = i + 1; j < textBoxes.length; j++) {
      const a = textBoxes[i];
      const b = textBoxes[j];
      const timeOverlap =
        a.inFrame === undefined ||
        a.outFrame === undefined ||
        b.inFrame === undefined ||
        b.outFrame === undefined ||
        (a.inFrame < b.outFrame && b.inFrame < a.outFrame);
      if (!timeOverlap) continue;

      const aMinX = Math.min(a.left, a.right);
      const aMaxX = Math.max(a.left, a.right);
      const aMinY = Math.min(a.top, a.bottom);
      const aMaxY = Math.max(a.top, a.bottom);

      const bMinX = Math.min(b.left, b.right);
      const bMaxX = Math.max(b.left, b.right);
      const bMinY = Math.min(b.top, b.bottom);
      const bMaxY = Math.max(b.top, b.bottom);

      const overlapX = Math.max(0, Math.min(aMaxX, bMaxX) - Math.max(aMinX, bMinX));
      const overlapY = Math.max(0, Math.min(aMaxY, bMaxY) - Math.max(aMinY, bMinY));
      if (overlapX > 2 && overlapY > 2) {
        issues.push({
          type: "collision",
          severity: "error",
          layerIds: [a.layerId, b.layerId],
          message: `Text bounding-box collision between '${a.layerId}' and '${b.layerId}' (${Math.round(overlapX)}x${Math.round(overlapY)}px overlap).`,
        });
      }
    }
  }

  const frames = opts.frames ?? [];
  frames.forEach((f, idx) => {
    let nonZero = 0;
    for (let i = 0; i < f.data.length; i += 4) {
      if (f.data[i] > 25 || f.data[i + 1] > 25 || f.data[i + 2] > 25) {
        nonZero++;
        break;
      }
    }
    if (nonZero === 0) {
      issues.push({
        type: "blank_frame",
        severity: "warning",
        layerIds: [],
        message: `Filmstrip frame #${idx} appears completely blank or near-black.`,
      });
    }
  });

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const score = Math.max(0, 100 - errorCount * 25 - warningCount * 10);

  return {
    passed: errorCount === 0,
    score,
    issues,
    checkedBoxes: boxes.length,
    checkedFrames: frames.length,
  };
}
