import { parseGIF, decompressFrames } from 'gifuct-js';

type ParsedFrame = {
  dims: { top: number; left: number; width: number; height: number };
  patch: Uint8ClampedArray;
  disposalType: number;
  delay: number; // centiseconds (GIF spec)
};

export type GifDecodeResult = {
  frames: ImageData[];
  delays: number[]; // centiseconds per frame, matching GIF spec
};

export async function decodeGifFile(file: File, maxFrames: number): Promise<GifDecodeResult> {
  const buf = await file.arrayBuffer();
  const gif = parseGIF(buf);
  const frames = decompressFrames(gif, true) as unknown as ParsedFrame[];
  if (frames.length === 0) throw new Error('GIF has no frames');

  const width = (gif.lsd?.width as number) ?? frames[0].dims.width;
  const height = (gif.lsd?.height as number) ?? frames[0].dims.height;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable');

  const step = Math.max(1, Math.ceil(frames.length / maxFrames));
  const out: ImageData[] = [];
  const delays: number[] = [];
  let prevSnapshot: ImageData | null = null;

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const { dims } = frame;

    if (frame.disposalType === 3) {
      prevSnapshot = ctx.getImageData(0, 0, width, height);
    }

    const patch = ctx.createImageData(dims.width, dims.height);
    patch.data.set(frame.patch);
    ctx.putImageData(patch, dims.left, dims.top);

    if (i % step === 0) {
      out.push(ctx.getImageData(0, 0, width, height));
      // delay from gifuct is in centiseconds; clamp to minimum 2 (20ms) so browsers don't ignore it
      delays.push(Math.max(2, frame.delay || 10));
      if (out.length >= maxFrames) break;
    }

    if (frame.disposalType === 2) {
      ctx.clearRect(dims.left, dims.top, dims.width, dims.height);
    } else if (frame.disposalType === 3 && prevSnapshot) {
      ctx.putImageData(prevSnapshot, 0, 0);
    }
  }

  return { frames: out, delays };
}
