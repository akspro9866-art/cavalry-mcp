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
