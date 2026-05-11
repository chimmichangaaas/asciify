import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { imageDataToAscii, AsciiResult } from './ascii';
import { decodeImageFile } from './decode-image';
import { decodeGifFile, GifDecodeResult } from './decode-gif';
import { decodeVideoFile } from './decode-video';
import type { UiToCode, AsciiFramePayload, QuotaStatus } from './types';

const WIDTH_CHARS      = 130;
const WIDTH_CHARS_ANIM = 60;
const MAX_FRAMES_GIF   = 24;
const MAX_FRAMES_VIDEO = 24;
const VIDEO_SAMPLE_FPS = 12;
const RAMP             = '@X&$#x*+=-. ';
const GIF_CELL         = 6;
const VIDEO_FRAME_DELAY_CS = Math.round(100 / VIDEO_SAMPLE_FPS);

const FREE_IMAGES_PER_DAY  = 5;
const FREE_VIDEOS_LIFETIME = 2;

type SourceKind = 'image' | 'gif' | 'video';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const drop         = $('drop');
const browseBtn    = $<HTMLButtonElement>('browseBtn');
const fileInput    = $<HTMLInputElement>('file');
const fileName     = $('fileName');
const status       = $('status');
const preview      = $<HTMLPreElement>('preview');
const emptyMsg     = $('emptyMsg');
const insertBtn    = $<HTMLButtonElement>('insert');
const exportGifBtn      = $<HTMLButtonElement>('exportGif');
const smoothMergeWrap   = $('smoothMergeWrap');
const smoothMergeCheck  = $<HTMLInputElement>('smoothMerge');
const quotaBar     = $('quotaBar');
const imgQuota     = $('imgQuota');
const vidQuota     = $('vidQuota');
const imgPip       = $('imgPip');
const vidPip       = $('vidPip');
const paywall      = $('paywall');
const paywallMsg   = $('paywallMsg');
const upgradeBtn   = $<HTMLButtonElement>('upgradeBtn');
const upgradeBtn2  = $<HTMLButtonElement>('upgradeBtn2');
const modeSwitcher = $('modeSwitcher');
const modeBtn      = $<HTMLButtonElement>('modeBtn');

let latest: AsciiResult[]       = [];
let latestDelays: number[]      = [];
let latestRawFrames: ImageData[] = []; // kept for smooth merge original image
let currentKind: SourceKind     = 'image';
let quota: QuotaStatus | null   = null;
let debugAsNormal               = false; // owner toggle: simulate free-user view

// ── Debug mode toggle ─────────────────────────────────────────────────────────

// Returns quota with owner/paid flags overridden when debugging as normal user
function effectiveQuota(): QuotaStatus | null {
  if (!quota) return null;
  if (debugAsNormal) return { ...quota, isPaid: false, isOwner: false };
  return quota;
}

modeBtn.addEventListener('click', () => {
  debugAsNormal = !debugAsNormal;
  if (debugAsNormal) {
    modeBtn.textContent = '👤 USER MODE';
    modeBtn.style.color = '#18a0fb';
    modeBtn.style.borderColor = '#18a0fb';
  } else {
    modeBtn.textContent = '⚙ OWNER MODE';
    modeBtn.style.color = '#f5a623';
    modeBtn.style.borderColor = '#f5a623';
  }
  updateQuotaUI();
  // Re-evaluate smooth merge visibility based on simulated identity
  if (latest.length > 1) {
    smoothMergeWrap.style.display = effectiveQuota()?.isOwner ? 'flex' : 'none';
  }
});

// ── Status helpers ────────────────────────────────────────────────────────────

function setStatus(msg: string, isError = false, isSuccess = false) {
  status.textContent = msg;
  status.classList.toggle('error', isError);
  status.classList.toggle('success', isSuccess);
}

function setPreview(result: AsciiResult | null) {
  if (!result) { preview.style.display = 'none'; emptyMsg.textContent = ''; return; }
  emptyMsg.textContent = '';
  preview.style.display = 'block';
  preview.textContent = result.text;
}

// ── Quota UI ──────────────────────────────────────────────────────────────────

function pipClass(used: number, max: number): string {
  const ratio = used / max;
  if (ratio >= 1) return 'danger';
  if (ratio >= 0.6) return 'warn';
  return '';
}

function updateQuotaUI() {
  const eq = effectiveQuota();
  if (!eq) return;

  if (eq.isPaid) {
    quotaBar.style.display = 'none';
    paywall.style.display = 'none';
    return;
  }

  quotaBar.style.display = 'flex';

  const imgLeft = Math.max(0, FREE_IMAGES_PER_DAY - eq.imageCount);
  const vidLeft = Math.max(0, FREE_VIDEOS_LIFETIME - eq.videoCount);

  imgQuota.textContent = `Images: ${imgLeft}/${FREE_IMAGES_PER_DAY} today`;
  vidQuota.textContent = `Videos: ${vidLeft}/${FREE_VIDEOS_LIFETIME} lifetime`;

  imgPip.className = 'pip ' + pipClass(eq.imageCount, FREE_IMAGES_PER_DAY);
  vidPip.className = 'pip ' + pipClass(eq.videoCount, FREE_VIDEOS_LIFETIME);

  // Show/hide paywall overlay based on current file type
  refreshInsertState();
}

function isOverLimit(): boolean {
  const eq = effectiveQuota();
  if (!eq || eq.isPaid) return false;
  if (currentKind === 'image' && eq.imageCount >= FREE_IMAGES_PER_DAY) return true;
  if ((currentKind === 'gif' || currentKind === 'video') && eq.videoCount >= FREE_VIDEOS_LIFETIME) return true;
  return false;
}

function refreshInsertState() {
  if (latest.length === 0) return;

  if (isOverLimit()) {
    insertBtn.disabled = true;
    paywall.style.display = 'flex';
    if (currentKind === 'image') {
      paywallMsg.textContent = `You've used all ${FREE_IMAGES_PER_DAY} free images for today. Resets at midnight.`;
    } else {
      paywallMsg.textContent = `You've used your ${FREE_VIDEOS_LIFETIME} free video conversions. Upgrade for unlimited.`;
    }
  } else {
    insertBtn.disabled = false;
    paywall.style.display = 'none';
  }
}

// ── File classification ───────────────────────────────────────────────────────

function classify(file: File): SourceKind {
  if (file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')) return 'gif';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('image/')) return 'image';
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (['mp4', 'webm', 'mov', 'm4v'].includes(ext)) return 'video';
  if (['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(ext)) return 'image';
  throw new Error(`Unsupported file type: ${file.type || ext || 'unknown'}`);
}

// ── File loading ──────────────────────────────────────────────────────────────

async function loadFile(file: File) {
  try {
    setStatus(`Loading ${file.name}...`);
    insertBtn.disabled = true;
    exportGifBtn.style.display = 'none';
    smoothMergeWrap.style.display = 'none';
    paywall.style.display = 'none';
    fileName.textContent = file.name;

    const kind = classify(file);
    currentKind = kind;
    let frames: ImageData[];

    if (kind === 'image') {
      frames = [await decodeImageFile(file)];
      latestDelays = [100];
    } else if (kind === 'gif') {
      const result: GifDecodeResult = await decodeGifFile(file, MAX_FRAMES_GIF);
      frames = result.frames;
      latestDelays = result.delays;
    } else {
      frames = await decodeVideoFile(file, { maxFrames: MAX_FRAMES_VIDEO, sampleFps: VIDEO_SAMPLE_FPS });
      latestDelays = frames.map(() => VIDEO_FRAME_DELAY_CS);
    }
    latestRawFrames = frames;

    if (frames.length === 0) throw new Error('No frames decoded');

    const widthChars = kind === 'image' ? WIDTH_CHARS : WIDTH_CHARS_ANIM;
    latest = frames.map(f =>
      imageDataToAscii(f, {
        widthChars,
        ramp: RAMP,
        invert: true,
        autoContrast: true,
        edgeThreshold: null,
        cellAspect: 1,
        color: true,
      }),
    );

    setStatus(`${latest.length} frame${latest.length === 1 ? '' : 's'} · ${latest[0].columns}×${latest[0].rows}`);
    setPreview(latest[0]);
    if (latest.length > 1) {
      exportGifBtn.style.display = 'block';
      // Smooth Merge only makes sense for animations and only for owner
      if (effectiveQuota()?.isOwner) smoothMergeWrap.style.display = 'flex';
    }

    refreshInsertState(); // apply quota gate after load
  } catch (err) {
    latest = [];
    setPreview(null);
    setStatus((err as Error).message || 'Failed to load file', true);
  }
}

// ── Insert ─────────────────────────────────────────────────────────────────────

insertBtn.addEventListener('click', async () => {
  if (latest.length === 0 || isOverLimit()) return;

  const payload: AsciiFramePayload[] = latest.map(f => ({
    text: f.text,
    colors: f.colors ? Array.from(f.colors) : undefined,
    meanColor: f.meanColor,
  }));

  const kind = currentKind === 'image' ? 'image' : 'animation';
  const doSmoothMerge = smoothMergeCheck.checked && quota?.isOwner && !debugAsNormal && latestRawFrames.length > 0;

  let originalImageBytes: number[] | undefined;
  if (doSmoothMerge) {
    originalImageBytes = await frameToPngBytes(latestRawFrames[0]);
  }

  const msg: UiToCode = {
    type: 'insert', frames: payload,
    columns: latest[0].columns, rows: latest[0].rows,
    kind, smoothMerge: doSmoothMerge, originalImageBytes,
  };
  parent.postMessage({ pluginMessage: msg }, '*');
  setStatus('Inserting into Figma…');
  insertBtn.disabled = true;
});

// ── Upgrade buttons ───────────────────────────────────────────────────────────

function triggerCheckout() {
  parent.postMessage({ pluginMessage: { type: 'checkout' } }, '*');
}

upgradeBtn.addEventListener('click', triggerCheckout);
upgradeBtn2.addEventListener('click', triggerCheckout);

// ── Export GIF ────────────────────────────────────────────────────────────────

exportGifBtn.addEventListener('click', async () => {
  if (latest.length === 0) return;
  exportGifBtn.disabled = true;
  exportGifBtn.textContent = 'Encoding GIF…';
  try {
    const doSmooth = smoothMergeCheck.checked && !!quota?.isOwner && latestRawFrames.length > 0;
    await exportGif(latest, latestDelays, {
      smoothMerge: doSmooth,
      rawFrame: doSmooth ? latestRawFrames[0] : undefined,
    });
    setStatus('✓ GIF downloaded!', false, true);
  } catch (err) {
    setStatus((err as Error).message || 'GIF export failed', true);
  } finally {
    exportGifBtn.disabled = false;
    exportGifBtn.textContent = 'Export Animation as GIF';
  }
});

// ── Drop zone events ──────────────────────────────────────────────────────────

browseBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
drop.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { const f = fileInput.files?.[0]; if (f) loadFile(f); });
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragging'); });
drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('dragging');
  const f = e.dataTransfer?.files?.[0];
  if (f) loadFile(f);
});

// ── Messages from code.ts ─────────────────────────────────────────────────────

window.onmessage = (event: MessageEvent) => {
  const msg = event.data?.pluginMessage;
  if (!msg) return;

  if (msg.type === 'ownerHint') {
    const idBox   = document.getElementById('idBox')!;
    const idValue = document.getElementById('idValue')!;
    idValue.textContent = msg.userId;
    idBox.style.display = 'block';
    return;
  }

  if (msg.type === 'quota') {
    quota = msg.quota as QuotaStatus;
    updateQuotaUI();
    const badge = document.getElementById('ownerBadge')!;
    badge.style.display = quota.isOwner ? 'inline-block' : 'none';
    modeSwitcher.style.display = quota.isOwner ? 'flex' : 'none';
  }

  if (msg.type === 'done') {
    const isAnim = msg.frameCount > 1;
    setStatus(
      isAnim
        ? `✓ ${msg.frameCount} frames inserted — select "ASCII Animation — Play" and press ▶ Present`
        : '✓ Inserted into Figma!',
      false,
      true,
    );
    insertBtn.disabled = false;
  }
};

// ── GIF encoder ───────────────────────────────────────────────────────────────

function frameToPngBytes(frame: ImageData): Promise<number[]> {
  return new Promise(resolve => {
    const canvas = document.createElement('canvas');
    canvas.width = frame.width;
    canvas.height = frame.height;
    canvas.getContext('2d')!.putImageData(frame, 0, 0);
    canvas.toBlob(blob => {
      blob!.arrayBuffer().then(buf => resolve(Array.from(new Uint8Array(buf))));
    }, 'image/png');
  });
}

async function exportGif(
  frames: AsciiResult[],
  delays: number[],
  opts: { smoothMerge: boolean; rawFrame?: ImageData } = { smoothMerge: false },
): Promise<void> {
  const w = frames[0].columns * GIF_CELL;
  const h = frames[0].rows * GIF_CELL;

  // Canvas A: ASCII rendering
  const asciiCanvas = document.createElement('canvas');
  asciiCanvas.width = w; asciiCanvas.height = h;
  const asciiCtx = asciiCanvas.getContext('2d', { willReadFrequently: true })!;
  asciiCtx.font = `${GIF_CELL}px monospace`;
  asciiCtx.textBaseline = 'top';

  // Canvas B: original image scaled to GIF size (smooth merge only)
  let origCanvas: HTMLCanvasElement | null = null;
  if (opts.smoothMerge && opts.rawFrame) {
    const tmp = document.createElement('canvas');
    tmp.width = opts.rawFrame.width; tmp.height = opts.rawFrame.height;
    tmp.getContext('2d')!.putImageData(opts.rawFrame, 0, 0);
    origCanvas = document.createElement('canvas');
    origCanvas.width = w; origCanvas.height = h;
    const oc = origCanvas.getContext('2d')!;
    oc.fillStyle = '#0a0a0c';
    oc.fillRect(0, 0, w, h);
    oc.drawImage(tmp, 0, 0, w, h);
  }

  // Canvas C: compositing for blend frames
  const blendCanvas = document.createElement('canvas');
  blendCanvas.width = w; blendCanvas.height = h;
  const blendCtx = blendCanvas.getContext('2d', { willReadFrequently: true })!;

  const encoder = GIFEncoder({ repeat: 0 });

  function renderAsciiToCanvas(frame: AsciiResult) {
    asciiCtx.fillStyle = '#0a0a0c';
    asciiCtx.fillRect(0, 0, w, h);
    const lines = frame.text.split('\n');
    for (let row = 0; row < lines.length; row++) {
      const line = lines[row];
      for (let col = 0; col < line.length; col++) {
        const ch = line[col];
        if (ch === ' ') continue;
        asciiCtx.fillStyle = frame.colors
          ? `rgb(${frame.colors[(row * frame.columns + col) * 3]},${frame.colors[(row * frame.columns + col) * 3 + 1]},${frame.colors[(row * frame.columns + col) * 3 + 2]})`
          : '#e6e6e6';
        asciiCtx.fillText(ch, col * GIF_CELL, row * GIF_CELL);
      }
    }
  }

  function getRgba(src: HTMLCanvasElement): Uint8Array {
    return new Uint8Array(src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data.buffer);
  }

  // ── Frames ──────────────────────────────────────────────────────────────────
  if (origCanvas) {
    // Single global palette sampled from a mid-dissolve blend so it covers
    // both original-image colours and ASCII-on-dark colours — prevents the
    // per-frame palette shifts that cause colour shutter.
    renderAsciiToCanvas(frames[0]);
    blendCtx.clearRect(0, 0, w, h);
    blendCtx.globalAlpha = 1;   blendCtx.drawImage(asciiCanvas, 0, 0);
    blendCtx.globalAlpha = 0.5; blendCtx.drawImage(origCanvas,  0, 0);
    blendCtx.globalAlpha = 1;
    const globalPalette = quantize(getRgba(blendCanvas), 256);

    function encodeWith(src: HTMLCanvasElement, delay: number) {
      const rgba = getRgba(src);
      encoder.writeFrame(applyPalette(rgba, globalPalette), w, h, { palette: globalPalette, delay });
    }

    const BLEND_STEPS = 20;
    const HOLD_FRAMES = 5;   // ~500 ms on original before dissolve starts
    const HOLD_DELAY  = 10;  // 100 ms per hold frame
    const asciiDelay  = delays[0] ?? 10; // use same pace as ASCII throughout dissolve
    let fi = 0;

    // 1. Hold on original
    for (let i = 0; i < HOLD_FRAMES; i++) { encodeWith(origCanvas, HOLD_DELAY); fi++; }

    // 2. Dissolve in: original fades out, ASCII plays underneath
    for (let i = BLEND_STEPS; i >= 1; i--) {
      renderAsciiToCanvas(frames[fi % frames.length]);
      blendCtx.clearRect(0, 0, w, h);
      blendCtx.globalAlpha = 1;              blendCtx.drawImage(asciiCanvas, 0, 0);
      blendCtx.globalAlpha = i / BLEND_STEPS; blendCtx.drawImage(origCanvas,  0, 0);
      blendCtx.globalAlpha = 1;
      encodeWith(blendCanvas, asciiDelay);
      fi++;
    }

    // 3. Pure ASCII (one full cycle)
    for (let i = 0; i < frames.length; i++) {
      renderAsciiToCanvas(frames[fi % frames.length]);
      encodeWith(asciiCanvas, delays[fi % frames.length] ?? 10);
      fi++;
    }

    // 4. Dissolve out: original fades in, ASCII keeps playing
    for (let i = 1; i <= BLEND_STEPS; i++) {
      renderAsciiToCanvas(frames[fi % frames.length]);
      blendCtx.clearRect(0, 0, w, h);
      blendCtx.globalAlpha = 1;              blendCtx.drawImage(asciiCanvas, 0, 0);
      blendCtx.globalAlpha = i / BLEND_STEPS; blendCtx.drawImage(origCanvas,  0, 0);
      blendCtx.globalAlpha = 1;
      encodeWith(blendCanvas, asciiDelay);
      fi++;
    }
  } else {
    // Regular ASCII-only loop — per-frame palette is fine here
    function encodeCanvas(src: HTMLCanvasElement, delay: number) {
      const rgba = getRgba(src);
      const palette = quantize(rgba, 256);
      encoder.writeFrame(applyPalette(rgba, palette), w, h, { palette, delay });
    }
    for (let fi = 0; fi < frames.length; fi++) {
      renderAsciiToCanvas(frames[fi]);
      encodeCanvas(asciiCanvas, delays[fi] ?? 10);
    }
  }

  encoder.finish();
  const bytes = encoder.bytes();
  const blob = new Blob([bytes], { type: 'image/gif' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ascii-animation.gif';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
