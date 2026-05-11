export type AsciiOptions = {
  widthChars: number;
  ramp: string;
  invert?: boolean;
  autoContrast?: boolean;
  gamma?: number;
  edgeThreshold?: number | null;
  cellAspect?: number;
  // When true, returns per-cell RGB with value boosted to 1 (ascii-view style).
  color?: boolean;
};

export type AsciiResult = {
  text: string;
  columns: number;
  rows: number;
  // RGB triples per cell, row-major. Length = cols * rows * 3. Present when opts.color.
  colors?: Uint8Array;
  // Image-wide mean RGB in 0..255. Use for tinted backgrounds / vignettes.
  meanColor?: [number, number, number];
};

export function imageDataToAscii(img: ImageData, opts: AsciiOptions): AsciiResult {
  const wantColor = !!opts.color;
  const ramp = opts.invert ? reverseString(opts.ramp) : opts.ramp;
  if (ramp.length === 0) throw new Error('ramp must contain at least one character');
  const cellAspect = opts.cellAspect ?? 0.5;
  const gamma = opts.gamma ?? 1;

  const cols = Math.max(1, Math.floor(opts.widthChars));
  const rows = Math.max(1, Math.floor((img.height / img.width) * cols * cellAspect));

  const cellW = img.width / cols;
  const cellH = img.height / rows;
  const data = img.data;
  const rampMax = ramp.length - 1;

  // Pass 1: per-cell mean R,G,B in 0..1, composited against black (transparent → black background).
  const avgR = new Float32Array(cols * rows);
  const avgG = new Float32Array(cols * rows);
  const avgB = new Float32Array(cols * rows);

  for (let cy = 0; cy < rows; cy++) {
    const y0 = Math.floor(cy * cellH);
    const y1 = Math.min(img.height, Math.floor((cy + 1) * cellH));
    for (let cx = 0; cx < cols; cx++) {
      const x0 = Math.floor(cx * cellW);
      const x1 = Math.min(img.width, Math.floor((cx + 1) * cellW));

      let sr = 0, sg = 0, sb = 0, count = 0;
      for (let y = y0; y < y1; y++) {
        let i = (y * img.width + x0) * 4;
        for (let x = x0; x < x1; x++, i += 4) {
          const a = data[i + 3] / 255;
          sr += (data[i] * a) / 255;
          sg += (data[i + 1] * a) / 255;
          sb += (data[i + 2] * a) / 255;
          count++;
        }
      }
      const n = count === 0 ? 1 : count;
      const idx = cy * cols + cx;
      avgR[idx] = sr / n;
      avgG[idx] = sg / n;
      avgB[idx] = sb / n;
    }
  }

  // HSV value = max(R, G, B). This is what ascii-view uses for brightness, and it's
  // preferable to luminance here because it preserves vivid saturated colors better.
  const val = new Float32Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) {
    const r = avgR[i], g = avgG[i], b = avgB[i];
    val[i] = r > g ? (r > b ? r : b) : (g > b ? g : b);
  }

  // Auto-contrast on HSV value.
  let loClip = 0;
  let hiClip = 1;
  if (opts.autoContrast) {
    const sorted = Float32Array.from(val).sort();
    loClip = sorted[Math.floor(sorted.length * 0.02)];
    hiClip = sorted[Math.floor(sorted.length * 0.98)];
    if (hiClip - loClip < 0.01) { loClip = 0; hiClip = 1; }
  }
  const range = hiClip - loClip || 1;

  // Sobel on the stretched value grid (computed lazily inside the loop using val directly
  // works fine since the constant loClip shift cancels out in gradients).
  let sobelX: Float32Array | null = null;
  let sobelY: Float32Array | null = null;
  const edgeThreshold = opts.edgeThreshold ?? null;
  if (edgeThreshold !== null && cols > 2 && rows > 2) {
    sobelX = new Float32Array(cols * rows);
    sobelY = new Float32Array(cols * rows);
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        const tl = val[(y - 1) * cols + (x - 1)];
        const tc = val[(y - 1) * cols + x];
        const tr = val[(y - 1) * cols + (x + 1)];
        const ml = val[y * cols + (x - 1)];
        const mr = val[y * cols + (x + 1)];
        const bl = val[(y + 1) * cols + (x - 1)];
        const bc = val[(y + 1) * cols + x];
        const br = val[(y + 1) * cols + (x + 1)];
        sobelX[y * cols + x] = -tl + tr - 2 * ml + 2 * mr - bl + br;
        sobelY[y * cols + x] = tl + 2 * tc + tr - bl - 2 * bc - br;
      }
    }
  }

  const lines: string[] = [];
  const rowChars: string[] = new Array(cols);
  const colors = wantColor ? new Uint8Array(cols * rows * 3) : undefined;
  const thr2 = edgeThreshold !== null ? edgeThreshold * edgeThreshold : 0;

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const idx = cy * cols + cx;

      // Character selection.
      let ch: string;
      if (sobelX && sobelY && sobelX[idx] * sobelX[idx] + sobelY[idx] * sobelY[idx] >= thr2) {
        ch = edgeChar(Math.atan2(sobelY[idx], sobelX[idx]) * 180 / Math.PI);
      } else {
        let norm = (val[idx] - loClip) / range;
        if (norm < 0) norm = 0; else if (norm > 1) norm = 1;
        norm = norm * norm; // value² — ascii-view's contrast trick
        if (gamma !== 1) norm = Math.pow(norm, gamma);
        const ri = Math.min(rampMax, Math.max(0, Math.floor(norm * (rampMax + 1 - 1e-9))));
        ch = ramp.charAt(ri);
      }
      rowChars[cx] = ch;

      // Display color: boost HSV value to 1 by scaling RGB by 1/max. Keeps hue + saturation
      // so colorful pixels (red shirt, orange skin) stand out, while neutral grays stay bright/white.
      if (colors) {
        const r = avgR[idx], g = avgG[idx], b = avgB[idx];
        const m = val[idx];
        let cr: number, cg: number, cb: number;
        if (m < 1e-3) {
          cr = cg = cb = 255; // pure black input → draw white char so it's visible on dark bg
        } else {
          const k = 255 / m;
          cr = r * k;
          cg = g * k;
          cb = b * k;
        }
        const o = idx * 3;
        colors[o] = cr > 255 ? 255 : cr < 0 ? 0 : cr;
        colors[o + 1] = cg > 255 ? 255 : cg < 0 ? 0 : cg;
        colors[o + 2] = cb > 255 ? 255 : cb < 0 ? 0 : cb;
      }
    }
    lines.push(rowChars.join(''));
  }

  // Image-wide mean color, in 0..255. Used by the sandbox to tint the frame background.
  let sumR = 0, sumG = 0, sumB = 0;
  for (let i = 0; i < cols * rows; i++) {
    sumR += avgR[i];
    sumG += avgG[i];
    sumB += avgB[i];
  }
  const n = cols * rows;
  const meanColor: [number, number, number] = [
    Math.round((sumR / n) * 255),
    Math.round((sumG / n) * 255),
    Math.round((sumB / n) * 255),
  ];

  return { text: lines.join('\n'), columns: cols, rows, colors, meanColor };
}

function edgeChar(angleDeg: number): string {
  const a = angleDeg;
  if ((22.5 <= a && a <= 67.5) || (-157.5 <= a && a <= -112.5)) return '\\';
  if ((67.5 <= a && a <= 112.5) || (-112.5 <= a && a <= -67.5)) return '_';
  if ((112.5 <= a && a <= 157.5) || (-67.5 <= a && a <= -22.5)) return '/';
  return '|';
}

function reverseString(s: string): string {
  let out = '';
  for (let i = s.length - 1; i >= 0; i--) out += s.charAt(i);
  return out;
}
