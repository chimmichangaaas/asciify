import { imageDataToAscii, AsciiResult } from './ascii';
import { decodeImageFile } from './decode-image';
import { decodeGifFile }   from './decode-gif';
import { decodeVideoFile } from './decode-video';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';

// ── Anti-copy deterrents (client-side only — cosmetic protection) ─────────────
// NB: nothing client-side can truly protect bundled JS. These are deterrents
// against casual copying. Real protection requires server-side rendering.

(function antiCopy() {
  // Disable right-click context menu
  document.addEventListener('contextmenu', e => {
    // Allow on text/email inputs so users can paste
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    e.preventDefault();
  });

  // Block common dev-tools / source-view shortcuts
  document.addEventListener('keydown', e => {
    const k = e.key;
    const ctrl = e.ctrlKey || e.metaKey;
    // F12
    if (k === 'F12') { e.preventDefault(); return; }
    // Ctrl/Cmd + U (view source)
    if (ctrl && (k === 'u' || k === 'U')) { e.preventDefault(); return; }
    // Ctrl/Cmd + S (save page)
    if (ctrl && (k === 's' || k === 'S')) { e.preventDefault(); return; }
    // Ctrl/Cmd + Shift + I/J/C (inspector / console / element picker)
    if (ctrl && e.shiftKey && (k === 'I' || k === 'J' || k === 'C' || k === 'i' || k === 'j' || k === 'c')) {
      e.preventDefault();
      return;
    }
  });

  // Block native drag-image (prevents drag-saving previews)
  document.addEventListener('dragstart', e => {
    const t = e.target as HTMLElement;
    if (t && t.tagName === 'IMG') e.preventDefault();
  });

  // Console warning — won't stop anyone but flags casual copiers
  try {
    const big = 'background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;font-size:24px;font-weight:700;padding:14px 22px;border-radius:8px';
    const small = 'color:#71717a;font-size:12px;line-height:1.6';
    console.log('%cASCII Studio', big);
    console.log(
      '%cThis is a closed-source tool by Yash Saindane.\n' +
      'If you copy this code you will be reported under copyright law.\n\n' +
      'Want to use it commercially or partner?\n→ https://x.com/yashsaindane',
      small,
    );
    // Override console.log/etc. to deter automated scraping
    if (typeof window !== 'undefined') {
      Object.defineProperty(window, '__SOURCE__', {
        get() { console.warn('Nice try.'); return null; },
      });
    }
  } catch {}
})();

// ── DOM refs ──────────────────────────────────────────────────────────────────

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ── Tab switching (Style / Reveal / Export) ──────────────────────────────────
(function tabSwitcher() {
  const sidebar = document.getElementById('sidebar')!;
  const btns = document.querySelectorAll<HTMLButtonElement>('.tab-btn');
  const STORAGE = 'ascii_studio_tab';
  // Restore previous tab
  const saved = (() => { try { return localStorage.getItem(STORAGE); } catch { return null; } })();
  if (saved && ['style', 'mask', 'export'].includes(saved)) {
    sidebar.setAttribute('data-tab', saved);
    btns.forEach(b => b.classList.toggle('active', b.dataset.tab === saved));
  }
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab!;
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sidebar.setAttribute('data-tab', tab);
      try { localStorage.setItem(STORAGE, tab); } catch {}
    });
  });
})();

const dropZone         = $('dropZone');
const fileInput        = $<HTMLInputElement>('fileInput');
const thumbImg         = $<HTMLImageElement>('thumbImg');
const dropFileName     = $('dropFileName');
const rampInput        = $<HTMLInputElement>('ramp');
const rampRow          = $('rampRow');
const renderModeSelect = $<HTMLSelectElement>('renderModeSelect');
const widthSlider      = $<HTMLInputElement>('widthSlider');
const widthVal         = $('widthVal');
const colorToggle      = $('colorToggle');
const invertToggle     = $('invertToggle');
const autoContrastTgl  = $('autoContrastToggle');
const cellAspectSlider = $<HTMLInputElement>('cellAspectSlider');
const cellAspectVal    = $('cellAspectVal');
const edgeToggle       = $('edgeToggle');
const edgeRow          = $('edgeRow');
const edgeSlider       = $<HTMLInputElement>('edgeSlider');
const edgeVal          = $('edgeVal');
const animSection      = $('animSection');
const maxFramesSlider  = $<HTMLInputElement>('maxFramesSlider');
const maxFramesVal     = $('maxFramesVal');
const sampleFpsSlider  = $<HTMLInputElement>('sampleFpsSlider');
const sampleFpsVal     = $('sampleFpsVal');
const gifCellSlider    = $<HTMLInputElement>('gifCellSlider');
const gifCellVal       = $('gifCellVal');
const blendStepsSlider = $<HTMLInputElement>('blendStepsSlider');
const blendStepsVal    = $('blendStepsVal');
const holdFramesSlider = $<HTMLInputElement>('holdFramesSlider');
const holdFramesVal    = $('holdFramesVal');
const smoothMergeRow   = $('smoothMergeRow');
const smoothMergeTgl   = $('smoothMergeToggle');
const btnReset         = $<HTMLButtonElement>('btnReset');
const btnPng           = $<HTMLButtonElement>('btnPng');
const btnGif           = $<HTMLButtonElement>('btnGif');
const statusBar        = $('statusBar');
const infoLabel        = $('infoLabel');
const canvasEl         = $<HTMLCanvasElement>('preview');
const emptyState       = $('emptyState');
const scrubber         = $('scrubber');
const frameSlider      = $<HTMLInputElement>('frameSlider');
const frameLabel       = $('frameLabel');
const playBtn          = $<HTMLButtonElement>('playBtn');
const zoomIn           = $<HTMLButtonElement>('zoomIn');
const zoomOut          = $<HTMLButtonElement>('zoomOut');
const zoomFit          = $<HTMLButtonElement>('zoomFit');
const zoomLabel        = $('zoomLabel');
const canvasWrap       = $('canvasWrap');
const originMarker     = $('originMarker');

// Quick action buttons
const btnWebcam        = $<HTMLButtonElement>('btnWebcam');
const btnCompare       = $<HTMLButtonElement>('btnCompare');
const btnShare         = $<HTMLButtonElement>('btnShare');

// Theme
const themeRow         = $('themeRow');
const customThemeBox   = $('customThemeBox');
const themeFg          = $<HTMLInputElement>('themeFg');
const themeBg          = $<HTMLInputElement>('themeBg');

// Overlay
const scanlinesSlider  = $<HTMLInputElement>('scanlinesSlider');
const scanlinesVal     = $('scanlinesVal');
const vignetteSlider   = $<HTMLInputElement>('vignetteSlider');
const vignetteVal      = $('vignetteVal');
const grainSlider      = $<HTMLInputElement>('grainSlider');
const grainVal         = $('grainVal');
const glowSlider       = $<HTMLInputElement>('glowSlider');
const glowVal          = $('glowVal');

// Reverse + paint
const reverseToggle    = $('reverseToggle');
const paintHelp        = $('paintHelp');
const btnClearPaint    = $<HTMLButtonElement>('btnClearPaint');

// Export buttons
const btnTxt           = $<HTMLButtonElement>('btnTxt');
const btnSvg           = $<HTMLButtonElement>('btnSvg');
const btnHtml          = $<HTMLButtonElement>('btnHtml');
const btnMd            = $<HTMLButtonElement>('btnMd');
const btnAnsi          = $<HTMLButtonElement>('btnAnsi');
const btnExportRevealGif = $<HTMLButtonElement>('btnExportRevealGif');
const btnJpg           = $<HTMLButtonElement>('btnJpg');
const btnWebp          = $<HTMLButtonElement>('btnWebp');
const btnPng2x         = $<HTMLButtonElement>('btnPng2x');
const btnPng4x         = $<HTMLButtonElement>('btnPng4x');
const btnJson          = $<HTMLButtonElement>('btnJson');
const btnPy            = $<HTMLButtonElement>('btnPy');
const btnCpp           = $<HTMLButtonElement>('btnCpp');
const btnJs            = $<HTMLButtonElement>('btnJs');
const btnCopy          = $<HTMLButtonElement>('btnCopy');
const btnWebm          = $<HTMLButtonElement>('btnWebm');
const btnMp4           = $<HTMLButtonElement>('btnMp4');
const btnAniSvg        = $<HTMLButtonElement>('btnAniSvg');
const btnHtmlInteractive = $<HTMLButtonElement>('btnHtmlInteractive');
const btnLottie        = $<HTMLButtonElement>('btnLottie');
const hoverModeSelect  = $<HTMLSelectElement>('hoverModeSelect');
const hoverRadiusSlider = $<HTMLInputElement>('hoverRadiusSlider');
const hoverRadiusVal   = $('hoverRadiusVal');
const hoverStrengthSlider = $<HTMLInputElement>('hoverStrengthSlider');
const hoverStrengthVal = $('hoverStrengthVal');
const hoverSmoothSlider = $<HTMLInputElement>('hoverSmoothSlider');
const hoverSmoothVal    = $('hoverSmoothVal');
const hoverSpeedSlider  = $<HTMLInputElement>('hoverSpeedSlider');
const hoverSpeedVal     = $('hoverSpeedVal');
const hoverFalloffSelect= $<HTMLSelectElement>('hoverFalloffSelect');
const hoverColorToggle  = $('hoverColorToggle');
const hoverColorRow     = $('hoverColorRow');
const hoverColorInput   = $<HTMLInputElement>('hoverColorInput');
const hoverIdleToggle   = $('hoverIdleToggle');

// Compare
const compareWrap      = $('compareWrap');
const compareImg       = $<HTMLImageElement>('compareImg');
const compareCanvas    = $<HTMLCanvasElement>('compareCanvas');
const compareDivider   = $('compareDivider');

// Mask controls
const maskProgressSlider = $<HTMLInputElement>('maskProgressSlider');
const maskProgressVal    = $('maskProgressVal');
const btnMaskReset       = $<HTMLButtonElement>('btnMaskReset');
const btnMaskPlay        = $<HTMLButtonElement>('btnMaskPlay');
const dirGrid            = $('dirGrid');
const presetRow          = $('presetRow');
const durationSlider     = $<HTMLInputElement>('durationSlider');
const durationVal        = $('durationVal');
const easingSelect       = $<HTMLSelectElement>('easingSelect');
const flipDurSlider      = $<HTMLInputElement>('flipDurSlider');
const flipDurVal         = $('flipDurVal');
const flipRateSlider     = $<HTMLInputElement>('flipRateSlider');
const flipRateVal        = $('flipRateVal');
const vertJitterSlider   = $<HTMLInputElement>('vertJitterSlider');
const vertJitterVal      = $('vertJitterVal');
const flipCharsetInput   = $<HTMLInputElement>('flipCharsetInput');
const waveAmtSlider      = $<HTMLInputElement>('waveAmtSlider');
const waveAmtVal         = $('waveAmtVal');
const waveFreqSlider     = $<HTMLInputElement>('waveFreqSlider');
const waveFreqVal        = $('waveFreqVal');
const edgeNoiseSlider    = $<HTMLInputElement>('edgeNoiseSlider');
const edgeNoiseVal       = $('edgeNoiseVal');
const colorModeSelect    = $<HTMLSelectElement>('colorModeSelect');
const monoColorRow       = $('monoColorRow');
const monoColorInput     = $<HTMLInputElement>('monoColorInput');

// ── Settings state ────────────────────────────────────────────────────────────

type SourceKind = 'image' | 'gif' | 'video';

const S = {
  ramp:          '@X&$#x*+=-. ',
  widthChars:    130,
  color:         true,
  invert:        true,
  autoContrast:  true,
  cellAspect:    1.0,
  edgeOn:        false,
  edgeThreshold: 40,
  maxFrames:     24,
  sampleFps:     12,
  gifCell:       6,
  blendSteps:    20,
  holdFrames:    5,
  smoothMerge:   false,
  // Render mode
  renderMode:    'ascii' as 'ascii'|'halftone'|'block'|'geometric'|'braille'|'bayer',
  // Theme
  theme:         'auto' as 'auto'|'matrix'|'amber'|'cyber'|'mono'|'sepia'|'custom',
  themeFg:       '#e6e6e6',
  themeBg:       '#0a0a0c',
  // Overlay
  scanlines:     0,
  vignette:      0,
  grain:         0,
  glow:          0,
  // Hover effects (live in preview, baked into Interactive HTML export)
  hoverMode:     'none' as
    | 'none' | 'glow' | 'scale' | 'invert'
    | 'magnet' | 'repel' | 'vortex' | 'wave' | 'levitate'
    | 'spotlight' | 'comet' | 'glitch' | 'particles' | 'tilt'
    | 'plasma' | 'lens' | 'lightning' | 'shockwave' | 'aurora'
    | 'mask-reveal' | 'mask-paint' | 'mask-trail' | 'mask-erase',
  hoverRadius:   5,
  hoverStrength: 60,
  hoverSmooth:   22,      // cursor lag % (5 = very smooth/laggy, 100 = instant)
  hoverSpeed:    1.0,     // animation speed multiplier (0.2 - 3.0)
  hoverFalloff:  'smoothstep' as 'smoothstep'|'linear'|'exp'|'quad'|'step',
  hoverUseColor: false,   // override default colors with custom
  hoverColor:    '#4f46e5',
  hoverIdle:     true,    // keep animating when cursor isn't moving
};

// Mask state
type Direction = 'lr'|'rl'|'tb'|'bt'|'tl-br'|'tr-bl'|'bl-tr'|'br-tl'|'radial-out'|'radial-in'|'random'|'diag-stripes'|'paint'|'multi-front';
type Easing    = 'linear'|'in'|'out'|'in-out'|'step'|'exp';
type ColorMode = 'fade-grey'|'glitch'|'mono'|'opacity'|'invert';

const M = {
  progress:     0,
  direction:    'lr' as Direction,
  duration:     2.0,
  easing:       'linear' as Easing,
  flipDuration: 0.6,
  flipRate:     20,
  vertJitter:   2,
  flipCharset:  '01/\\_*+.-=',
  waveAmount:   0,
  waveFreq:     8,
  edgeNoise:    0,
  colorMode:    'fade-grey' as ColorMode,
  monoColor:    '#ff8050',
  reverse:      false,
  origin:       null as { row: number, col: number } | null,
  paintTimings: null as Map<number, number> | null,  // key=row*cols+col, val=order index
  paintCount:   0,
};

// ── Runtime state ─────────────────────────────────────────────────────────────

let lastFile:      File | null    = null;
let rawFrames:     ImageData[]    = [];
let rawDelays:     number[]       = [];
let asciiFrames:   AsciiResult[]  = [];
let currentKind:   SourceKind     = 'image';
let zoomPct        = 100;
let playing        = false;
let currentFrame   = 0;
let animTimer:     number | null  = null;
let maskRaf:       number | null  = null;
let maskPlayStart: number | null  = null; // timestamp when play began
let maskPlayFrom:  number         = 0;   // progress value when play began

// ── Canvas context ────────────────────────────────────────────────────────────

const CELL = 9;                                       // ↑ from 6 — much sharper preview
const DPR  = Math.min(2, window.devicePixelRatio || 1); // hi-DPI rendering
const ctx  = canvasEl.getContext('2d', { willReadFrequently: true })!;

// State for runtime: webcam, compare
let webcamStream: MediaStream | null = null;
let webcamRaf:    number | null      = null;
let compareMode   = false;
let hoverCell:    { row: number; col: number } | null = null;
let hoverPx:      { x: number; y: number } | null = null; // raw cursor in canvas px-space
let hoverPxSm:    { x: number; y: number } | null = null; // smoothed (lerped) cursor for organic feel
let hoverVel      = 0;                                     // smoothed cursor speed (px/frame)
let hoverRaf:     number | null = null;
let hoverTime     = 0;
let hoverActive   = false;

// Smooth easing — used to make proximity falloffs feel natural instead of linear
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Compute proximity 0..1 from distance + radius using the user-selected falloff curve.
// 0 = at radius edge (no effect), 1 = at cursor (max effect).
function proxFromDist(distPx: number, radiusPx: number): number {
  if (distPx >= radiusPx) return 0;
  const linear = 1 - distPx / radiusPx;
  switch (S.hoverFalloff) {
    case 'linear':     return linear;
    case 'quad':       return linear * linear;
    case 'exp':        return Math.exp(-distPx * distPx / (radiusPx * radiusPx * 0.5));
    case 'step':       return linear > 0.4 ? 1 : (linear > 0.1 ? 0.5 : 0);
    case 'smoothstep':
    default:           return smoothstep(radiusPx, 0, distPx);
  }
}
// Comet trail: last N cursor positions with timestamps
const cometTrail: Array<{ x: number; y: number; t: number }> = [];
// Particle system — supports multiple visual types
type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; hue: number; kind: 'dot' | 'star' | 'spark' };
const particles:  Particle[] = [];
// Shockwave ring state — spawned on velocity spikes
const shockwaves: Array<{ x: number; y: number; t: number; maxR: number }> = [];
// Lightning bolt segments cached briefly for stability
type LightningBolt = { from: { x: number; y: number }; to: { x: number; y: number }; midpoints: Array<{ x: number; y: number }>; t: number };
const lightningBolts: LightningBolt[] = [];
// Mask hover state: per-cell "touched at time" buffer + dims
let maskBuf:  Float32Array | null = null;
let maskDims: { rows: number; cols: number } | null = null;
function ensureMaskBuf(rows: number, cols: number) {
  if (!maskBuf || !maskDims || maskDims.rows !== rows || maskDims.cols !== cols) {
    maskBuf  = new Float32Array(rows * cols);
    maskDims = { rows, cols };
  }
}
function clearMaskBuf() { if (maskBuf) maskBuf.fill(0); }

// ── Status ────────────────────────────────────────────────────────────────────

function setStatus(msg: string, cls: '' | 'ok' | 'err' = '') {
  statusBar.textContent = msg;
  statusBar.className   = cls;
}

// ── Toggle helper ─────────────────────────────────────────────────────────────

function isOn(el: HTMLElement) { return el.classList.contains('on'); }

function makeToggle(el: HTMLElement, initial: boolean, onChange: (on: boolean) => void) {
  el.classList.toggle('on', initial);
  el.addEventListener('click', () => {
    el.classList.toggle('on');
    onChange(el.classList.contains('on'));
  });
}

// ── Slider helper ─────────────────────────────────────────────────────────────

function makeSlider(
  slider: HTMLInputElement,
  valEl: HTMLElement,
  fmt: (v: number) => string,
  onChange: (v: number) => void,
  onFinish?: (v: number) => void,
) {
  const read = () => parseFloat(slider.value);
  slider.addEventListener('input', () => {
    valEl.textContent = fmt(read());
    onChange(read());
  });
  if (onFinish) {
    slider.addEventListener('change', () => onFinish(read()));
  }
  // Init display
  valEl.textContent = fmt(read());
  onChange(read());
}

// ── Wire up settings controls ─────────────────────────────────────────────────

makeToggle(colorToggle,    S.color,       v => { S.color       = v; onSettingsChange(); });
makeToggle(invertToggle,   S.invert,      v => { S.invert      = v; onSettingsChange(); });
makeToggle(autoContrastTgl,S.autoContrast,v => { S.autoContrast= v; onSettingsChange(); });
makeToggle(edgeToggle,     S.edgeOn,      v => {
  S.edgeOn = v;
  edgeRow.style.display = v ? 'flex' : 'none';
  onSettingsChange();
});
makeToggle(smoothMergeTgl, S.smoothMerge, v => { S.smoothMerge = v; });

// Width: show value live, rebuild on release
makeSlider(widthSlider, widthVal, v => `${v}`,
  v => { S.widthChars = v; },
  _  => onSettingsChange(),
);

// Cell aspect: rebuild live (fast)
makeSlider(cellAspectSlider, cellAspectVal, v => v.toFixed(2),
  v => { S.cellAspect = v; onSettingsChange(); },
);

// Edge threshold: rebuild live
makeSlider(edgeSlider, edgeVal, v => `${v}`,
  v => { S.edgeThreshold = v; onSettingsChange(); },
);

// GIF export params: update value live, no visual rebuild needed
makeSlider(gifCellSlider,    gifCellVal,    v => `${v} px`, v => { S.gifCell    = v; });
makeSlider(blendStepsSlider, blendStepsVal, v => `${v}`,    v => { S.blendSteps = v; });
makeSlider(holdFramesSlider, holdFramesVal, v => `${v}`,    v => { S.holdFrames = v; });

// Max frames / sample FPS: re-decode the file on release (they affect decoding, not conversion)
makeSlider(maxFramesSlider, maxFramesVal, v => `${v}`,
  v => { S.maxFrames = v; },
  _ => reloadFile(),
);
makeSlider(sampleFpsSlider, sampleFpsVal, v => `${v}`,
  v => { S.sampleFps = v; },
  _ => reloadFile(),
);

rampInput.addEventListener('change', () => { S.ramp = rampInput.value || ' '; onSettingsChange(); });

renderModeSelect.addEventListener('change', () => {
  S.renderMode = renderModeSelect.value as typeof S.renderMode;
  // Hide ramp input for non-ASCII modes (their characters are fixed)
  rampRow.style.display = S.renderMode === 'ascii' ? 'flex' : 'none';
  onSettingsChange();
});

// ── Mask controls ─────────────────────────────────────────────────────────────

// Mask style change — re-renders at the current scrubber position
function maskStyleChange() { renderAtProgress(M.progress); }

// Style sliders
makeSlider(durationSlider,    durationVal,    v => `${v.toFixed(1)} s`,  v => { M.duration     = v; maskStyleChange(); });
makeSlider(flipDurSlider,     flipDurVal,     v => `${v.toFixed(2)} s`,  v => { M.flipDuration = v; maskStyleChange(); });
makeSlider(flipRateSlider,    flipRateVal,    v => `${v} ch/s`,          v => { M.flipRate     = v; maskStyleChange(); });
makeSlider(vertJitterSlider,  vertJitterVal,  v => `${v} rows`,          v => { M.vertJitter   = v; maskStyleChange(); });
makeSlider(waveAmtSlider,     waveAmtVal,     v => `${v}%`,              v => { M.waveAmount   = v; maskStyleChange(); });
makeSlider(waveFreqSlider,    waveFreqVal,    v => `${v}`,               v => { M.waveFreq     = v; maskStyleChange(); });
makeSlider(edgeNoiseSlider,   edgeNoiseVal,   v => `${v}%`,              v => { M.edgeNoise    = v; maskStyleChange(); });

flipCharsetInput.addEventListener('input', () => {
  M.flipCharset = flipCharsetInput.value || '*+=-_.';
  maskStyleChange();
});

easingSelect.addEventListener('change', () => {
  M.easing = easingSelect.value as Easing;
  maskStyleChange();
});

colorModeSelect.addEventListener('change', () => {
  M.colorMode = colorModeSelect.value as ColorMode;
  monoColorRow.style.display = M.colorMode === 'mono' ? 'flex' : 'none';
  maskStyleChange();
});

monoColorInput.addEventListener('input', () => {
  M.monoColor = monoColorInput.value;
  maskStyleChange();
});

// Direction grid — set active button + state
dirGrid.querySelectorAll<HTMLButtonElement>('.dir-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    dirGrid.querySelectorAll('.dir-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    M.direction = btn.dataset.dir as Direction;
    maskStyleChange();
  });
});

// Presets — quick configurations (can patch both M and S)
type Preset = { M?: Partial<typeof M>; S?: Partial<typeof S> };
const PRESETS: Record<string, Preset> = {
  wipe:    { M: { direction: 'lr',         duration: 1.5, easing: 'linear', flipDuration: 0.4, waveAmount: 0,  edgeNoise: 0,  colorMode: 'fade-grey', vertJitter: 0 } },
  matrix:  { M: { direction: 'tb',         duration: 3.0, easing: 'linear', flipDuration: 1.0, waveAmount: 0,  edgeNoise: 15, colorMode: 'mono', monoColor: '#3ddc84', vertJitter: 1, flipCharset: '01ABCDEFGHJKLMNPQRSTUVWXYZ' } },
  glitch:  { M: { direction: 'random',     duration: 0.8, easing: 'linear', flipDuration: 0.5, waveAmount: 0,  edgeNoise: 0,  colorMode: 'glitch', vertJitter: 4 } },
  bloom:   { M: { direction: 'radial-out', duration: 2.5, easing: 'out',    flipDuration: 0.7, waveAmount: 8,  edgeNoise: 0,  colorMode: 'fade-grey', vertJitter: 0 } },
  wave:    { M: { direction: 'lr',         duration: 2.5, easing: 'in-out', flipDuration: 0.6, waveAmount: 25, waveFreq: 6, edgeNoise: 5, colorMode: 'fade-grey', vertJitter: 0 } },
  shatter: { M: { direction: 'radial-in',  duration: 1.8, easing: 'in',     flipDuration: 0.4, waveAmount: 0,  edgeNoise: 30, colorMode: 'glitch', vertJitter: 6 } },
};

presetRow.querySelectorAll<HTMLButtonElement>('.preset-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const preset = PRESETS[chip.dataset.preset!];
    if (!preset) return;
    if (preset.M) Object.assign(M, preset.M);
    if (preset.S) {
      Object.assign(S, preset.S);
      // Sync the relevant UI bits + rebuild ASCII (since render mode / theme changed)
      syncSettingsUI();
      buildAscii();
    } else {
      maskStyleChange();
    }
    syncMaskUI();
  });
});

function syncMaskUI() {
  durationSlider.value     = String(M.duration);    durationVal.textContent    = `${M.duration.toFixed(1)} s`;
  flipDurSlider.value      = String(M.flipDuration);flipDurVal.textContent     = `${M.flipDuration.toFixed(2)} s`;
  flipRateSlider.value     = String(M.flipRate);    flipRateVal.textContent    = `${M.flipRate} ch/s`;
  vertJitterSlider.value   = String(M.vertJitter);  vertJitterVal.textContent  = `${M.vertJitter} rows`;
  waveAmtSlider.value      = String(M.waveAmount);  waveAmtVal.textContent     = `${M.waveAmount}%`;
  waveFreqSlider.value     = String(M.waveFreq);    waveFreqVal.textContent    = `${M.waveFreq}`;
  edgeNoiseSlider.value    = String(M.edgeNoise);   edgeNoiseVal.textContent   = `${M.edgeNoise}%`;
  flipCharsetInput.value   = M.flipCharset;
  easingSelect.value       = M.easing;
  colorModeSelect.value    = M.colorMode;
  monoColorInput.value     = M.monoColor;
  monoColorRow.style.display = M.colorMode === 'mono' ? 'flex' : 'none';
  dirGrid.querySelectorAll<HTMLButtonElement>('.dir-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.dir === M.direction);
  });
}

// Progress scrubber — direct control
maskProgressSlider.addEventListener('input', () => {
  stopMaskPlay();
  const p = parseInt(maskProgressSlider.value) / 100;
  M.progress = p;
  maskProgressVal.textContent = `${maskProgressSlider.value}%`;
  renderAtProgress(p);
});

btnMaskReset.addEventListener('click', () => {
  stopMaskPlay();
  M.progress = 0;
  maskProgressSlider.value = '0';
  maskProgressVal.textContent = '0%';
  renderAtProgress(0);
});

btnMaskPlay.addEventListener('click', () => {
  if (maskPlayStart !== null) { stopMaskPlay(); return; }
  if (M.progress >= 1) {
    M.progress = 0;
    maskProgressSlider.value = '0';
    maskProgressVal.textContent = '0%';
  }
  maskPlayFrom  = M.progress;
  maskPlayStart = performance.now();
  btnMaskPlay.textContent = '⏸ Pause';
  requestAnimationFrame(maskPlayTick);
});

// ── Theme + Overlay wiring ────────────────────────────────────────────────────

themeRow.querySelectorAll<HTMLButtonElement>('.preset-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    themeRow.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    S.theme = chip.dataset.theme as typeof S.theme;
    customThemeBox.style.display = S.theme === 'custom' ? 'block' : 'none';
    if (M.progress > 0 && M.progress < 1) renderAtProgress(M.progress);
    else renderFrame(currentFrame);
  });
});

themeFg.addEventListener('input', () => {
  S.themeFg = themeFg.value;
  if (S.theme === 'custom') {
    if (M.progress > 0 && M.progress < 1) renderAtProgress(M.progress);
    else renderFrame(currentFrame);
  }
});
themeBg.addEventListener('input', () => {
  S.themeBg = themeBg.value;
  if (S.theme === 'custom') {
    if (M.progress > 0 && M.progress < 1) renderAtProgress(M.progress);
    else renderFrame(currentFrame);
  }
});

// Hover effect controls
hoverModeSelect.addEventListener('change', () => {
  S.hoverMode = hoverModeSelect.value as typeof S.hoverMode;
  if (S.hoverMode === 'none') {
    hoverCell = null;
    if (hoverRaf !== null) { cancelAnimationFrame(hoverRaf); hoverRaf = null; }
  }
  // Reset CSS transform from tilt mode + clear effect buffers
  canvasEl.style.transform = `scale(${zoomPct / 100})`;
  cometTrail.length = 0;
  particles.length  = 0;
  shockwaves.length = 0;
  lightningBolts.length = 0;
  clearMaskBuf();
  // Re-render to clear any previous hover state
  if (M.progress > 0 && M.progress < 1) renderAtProgress(M.progress);
  else renderFrame(currentFrame);
});
makeSlider(hoverRadiusSlider,   hoverRadiusVal,   v => `${v}`,        v => { S.hoverRadius = v; });
makeSlider(hoverStrengthSlider, hoverStrengthVal, v => `${v}%`,       v => { S.hoverStrength = v; });
makeSlider(hoverSmoothSlider,   hoverSmoothVal,   v => `${v}%`,       v => { S.hoverSmooth = v; });
makeSlider(hoverSpeedSlider,    hoverSpeedVal,    v => `${v.toFixed(1)}×`, v => { S.hoverSpeed = v; });

hoverFalloffSelect.addEventListener('change', () => {
  S.hoverFalloff = hoverFalloffSelect.value as typeof S.hoverFalloff;
  if (hoverActive) {
    if (M.progress > 0 && M.progress < 1) renderAtProgress(M.progress);
    else renderFrame(currentFrame);
  }
});

makeToggle(hoverColorToggle, false, v => {
  S.hoverUseColor = v;
  hoverColorRow.style.display = v ? 'flex' : 'none';
});
hoverColorInput.addEventListener('input', () => { S.hoverColor = hoverColorInput.value; });

makeToggle(hoverIdleToggle, true, v => { S.hoverIdle = v; });

makeSlider(scanlinesSlider, scanlinesVal, v => `${v}%`, v => {
  S.scanlines = v;
  if (M.progress > 0 && M.progress < 1) renderAtProgress(M.progress); else renderFrame(currentFrame);
});
makeSlider(vignetteSlider, vignetteVal, v => `${v}%`, v => {
  S.vignette = v;
  if (M.progress > 0 && M.progress < 1) renderAtProgress(M.progress); else renderFrame(currentFrame);
});
makeSlider(grainSlider, grainVal, v => `${v}%`, v => {
  S.grain = v;
  if (M.progress > 0 && M.progress < 1) renderAtProgress(M.progress); else renderFrame(currentFrame);
});
makeSlider(glowSlider, glowVal, v => `${v}%`, v => {
  S.glow = v;
  if (M.progress > 0 && M.progress < 1) renderAtProgress(M.progress); else renderFrame(currentFrame);
});

// Reverse toggle
makeToggle(reverseToggle, false, v => { M.reverse = v; renderAtProgress(M.progress); });

// Paint mode help row
function updateDirectionUI() {
  paintHelp.style.display = M.direction === 'paint' ? 'block' : 'none';
  // Show origin marker only for radial directions
  const showMarker = (M.direction === 'radial-out' || M.direction === 'radial-in') && M.origin !== null;
  originMarker.style.display = showMarker ? 'block' : 'none';
  positionOriginMarker();
}

// Hook into existing direction grid clicks
dirGrid.querySelectorAll<HTMLButtonElement>('.dir-btn').forEach(btn => {
  btn.addEventListener('click', () => updateDirectionUI());
});

btnClearPaint.addEventListener('click', () => {
  M.paintTimings = null;
  M.paintCount = 0;
  renderAtProgress(M.progress);
});

// Canvas click → set origin (for radial) or paint (for paint mode)
function canvasToCell(e: MouseEvent): { row: number; col: number } | null {
  const frame = asciiFrames[currentFrame] || asciiFrames[0];
  if (!frame) return null;
  const rect = canvasEl.getBoundingClientRect();
  const xPct = (e.clientX - rect.left) / rect.width;
  const yPct = (e.clientY - rect.top)  / rect.height;
  const cols = frame.text.split('\n').reduce((m, l) => Math.max(m, l.length), 0);
  const rows = frame.text.split('\n').length;
  return {
    col: Math.max(0, Math.min(cols - 1, Math.floor(xPct * cols))),
    row: Math.max(0, Math.min(rows - 1, Math.floor(yPct * rows))),
  };
}

let painting = false;
canvasEl.addEventListener('mousedown', e => {
  if (M.direction === 'radial-out' || M.direction === 'radial-in') {
    const cell = canvasToCell(e);
    if (cell) {
      M.origin = cell;
      updateDirectionUI();
      renderAtProgress(M.progress);
    }
  } else if (M.direction === 'paint') {
    painting = true;
    if (!M.paintTimings) { M.paintTimings = new Map(); M.paintCount = 0; }
    paintAt(e);
  }
});
canvasEl.addEventListener('mousemove', e => {
  if (painting) paintAt(e);
  if (S.hoverMode === 'none') return;

  // Pixel-space cursor (logical coords, accounts for DPR + zoom CSS scaling)
  const rect = canvasEl.getBoundingClientRect();
  const logW = canvasEl.width  / DPR;
  const logH = canvasEl.height / DPR;
  const px = ((e.clientX - rect.left) / rect.width)  * logW;
  const py = ((e.clientY - rect.top)  / rect.height) * logH;

  hoverPx = { x: px, y: py };
  if (!hoverPxSm) hoverPxSm = { x: px, y: py };

  // 3D Tilt: pure CSS, no canvas redraw
  if (S.hoverMode === 'tilt') {
    const xPct = (e.clientX - rect.left) / rect.width;
    const yPct = (e.clientY - rect.top)  / rect.height;
    const rotY = (xPct - 0.5) * 22 * (S.hoverStrength / 100); // ±11° at 100%
    const rotX = (0.5 - yPct) * 18 * (S.hoverStrength / 100);
    canvasEl.style.transform = `perspective(1100px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg)`;
    return;
  }

  // Also derive cell for paint mode + origin click
  const cell = canvasToCell(e);
  if (cell) hoverCell = cell;

  hoverActive = true;
  startHoverLoop();
});

canvasEl.addEventListener('mouseleave', () => {
  if (S.hoverMode === 'tilt') { canvasEl.style.transform = ''; return; }
  if (S.hoverMode === 'none') return;
  hoverActive  = false;
  hoverCell    = null;
  hoverPx      = null;
  hoverPxSm    = null;
  cometTrail.length = 0;
  particles.length  = 0;
  shockwaves.length = 0;
  lightningBolts.length = 0;
  clearMaskBuf();
  if (hoverRaf !== null) { cancelAnimationFrame(hoverRaf); hoverRaf = null; }
  if (M.progress > 0 && M.progress < 1) renderAtProgress(M.progress);
  else renderFrame(currentFrame);
});
window.addEventListener('mouseup', () => { painting = false; });

function paintAt(e: MouseEvent) {
  const cell = canvasToCell(e);
  if (!cell) return;
  const frame = asciiFrames[currentFrame] || asciiFrames[0];
  if (!frame) return;
  const cols = frame.text.split('\n').reduce((m, l) => Math.max(m, l.length), 0);
  // Add a small radius (3 cells) per move to make brush feel chunky
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      if (dr * dr + dc * dc > 4) continue;
      const r = cell.row + dr, c = cell.col + dc;
      if (r < 0 || c < 0 || c >= cols) continue;
      const k = r * cols + c;
      if (!M.paintTimings!.has(k)) {
        M.paintTimings!.set(k, M.paintCount++);
      }
    }
  }
  renderAtProgress(M.progress);
}

function positionOriginMarker() {
  if (!M.origin || !canvasEl.width) return;
  const frame = asciiFrames[currentFrame] || asciiFrames[0];
  if (!frame) return;
  const cols = frame.text.split('\n').reduce((m, l) => Math.max(m, l.length), 0);
  const rows = frame.text.split('\n').length;
  const xPct = (M.origin.col + 0.5) / cols;
  const yPct = (M.origin.row + 0.5) / rows;
  const logW = canvasEl.width  / DPR;
  const logH = canvasEl.height / DPR;
  const scale = zoomPct / 100;
  originMarker.style.left = `${xPct * logW * scale}px`;
  originMarker.style.top  = `${yPct * logH * scale}px`;
}

// ── Webcam ────────────────────────────────────────────────────────────────────

btnWebcam.addEventListener('click', async () => {
  if (webcamStream) {
    stopWebcam();
    return;
  }
  try {
    setStatus('Starting webcam…');
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    webcamStream = stream;
    btnWebcam.classList.add('active');
    btnWebcam.textContent = '🛑 Stop Cam';

    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();

    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const tc = tmp.getContext('2d', { willReadFrequently: true })!;

    let lastT = 0;
    const tick = (now: number) => {
      if (!webcamStream) return;
      // Throttle ~12 fps for ASCII conversion
      if (now - lastT > 80) {
        lastT = now;
        tc.drawImage(video, 0, 0, w, h);
        const img = tc.getImageData(0, 0, w, h);
        rawFrames = [img];
        rawDelays = [100];
        currentKind = 'image';
        try { buildAscii(); } catch {}
      }
      webcamRaf = requestAnimationFrame(tick);
    };
    webcamRaf = requestAnimationFrame(tick);
    setStatus('● Webcam active', 'ok');
  } catch (err) {
    setStatus('Webcam denied or unavailable', 'err');
  }
});

function stopWebcam() {
  if (webcamStream) { webcamStream.getTracks().forEach(t => t.stop()); webcamStream = null; }
  if (webcamRaf !== null) { cancelAnimationFrame(webcamRaf); webcamRaf = null; }
  btnWebcam.classList.remove('active');
  btnWebcam.textContent = '📷 Webcam';
}

// ── Compare mode ──────────────────────────────────────────────────────────────

btnCompare.addEventListener('click', () => {
  if (!rawFrames.length) return;
  compareMode = !compareMode;
  btnCompare.classList.toggle('active', compareMode);
  if (compareMode) {
    syncCompare();
    compareWrap.classList.add('on');
  } else {
    compareWrap.classList.remove('on');
  }
});

function syncCompare() {
  if (!compareMode || !rawFrames.length) return;
  // Original image
  const tmp = document.createElement('canvas');
  tmp.width = rawFrames[0].width; tmp.height = rawFrames[0].height;
  tmp.getContext('2d')!.putImageData(rawFrames[0], 0, 0);
  compareImg.src = tmp.toDataURL();
  // ASCII canvas — copy current preview
  const cc = compareCanvas.getContext('2d')!;
  compareCanvas.width  = canvasEl.width;
  compareCanvas.height = canvasEl.height;
  cc.drawImage(canvasEl, 0, 0);
}

// Draggable divider
let draggingDivider = false;
compareDivider.addEventListener('mousedown', e => { draggingDivider = true; e.preventDefault(); });
window.addEventListener('mouseup', () => { draggingDivider = false; });
window.addEventListener('mousemove', e => {
  if (!draggingDivider) return;
  const rect = compareWrap.getBoundingClientRect();
  const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
  compareDivider.style.left = `${pct}%`;
  compareCanvas.style.clipPath = `inset(0 0 0 ${pct}%)`;
});

// ── Share via URL hash + share modal ─────────────────────────────────────────

// Public URL where the dashboard is hosted. When the page is opened over file://
// (i.e. running locally), shared links won't work for OG previews, so we fall
// back to this canonical URL so previews still render correctly when posted.
const PUBLIC_URL = 'https://yashsaindane.github.io/ascii-studio/';

function buildShareUrl(): string {
  const state = { S, M: { ...M, paintTimings: M.paintTimings ? Array.from(M.paintTimings.entries()) : null } };
  const json  = JSON.stringify(state);
  const b64   = btoa(unescape(encodeURIComponent(json)));
  const base  = (location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? PUBLIC_URL
    : `${location.origin}${location.pathname}`;
  return `${base}#${b64}`;
}

const shareBackdrop   = document.getElementById('shareBackdrop')!;
const shareCloseBtn   = document.getElementById('shareClose')!;
const shareDismissBtn = document.getElementById('shareDismiss')!;
const shareLinkInput  = document.getElementById('shareLinkInput') as HTMLInputElement;
const shareCopyBtn    = document.getElementById('shareCopyBtn') as HTMLButtonElement;

btnShare.addEventListener('click', () => {
  const url = buildShareUrl();
  shareLinkInput.value = url;
  shareBackdrop.style.display = 'flex';
  // Auto-select for quick keyboard copy
  setTimeout(() => { shareLinkInput.focus(); shareLinkInput.select(); }, 100);
});

function hideShare() { shareBackdrop.style.display = 'none'; }
shareCloseBtn.addEventListener('click', hideShare);
shareDismissBtn.addEventListener('click', hideShare);
shareBackdrop.addEventListener('click', e => { if (e.target === shareBackdrop) hideShare(); });

shareCopyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(shareLinkInput.value);
    shareCopyBtn.textContent = '✓ Copied';
    shareCopyBtn.classList.add('copied');
    setTimeout(() => {
      shareCopyBtn.textContent = 'Copy';
      shareCopyBtn.classList.remove('copied');
    }, 1800);
  } catch {
    shareLinkInput.select();
    document.execCommand('copy');
    shareCopyBtn.textContent = '✓ Copied';
    setTimeout(() => { shareCopyBtn.textContent = 'Copy'; }, 1800);
  }
});

// Social share buttons
document.querySelectorAll<HTMLButtonElement>('.share-social').forEach(btn => {
  btn.addEventListener('click', () => {
    const net = btn.dataset.net!;
    const url = encodeURIComponent(shareLinkInput.value);
    const text = encodeURIComponent('Just made some ASCII art with ASCII Studio by @yashsaindane');
    let target = '';
    switch (net) {
      case 'x':        target = `https://twitter.com/intent/tweet?text=${text}&url=${url}`; break;
      case 'linkedin': target = `https://www.linkedin.com/sharing/share-offsite/?url=${url}`; break;
      case 'reddit':   target = `https://reddit.com/submit?url=${url}&title=${encodeURIComponent('ASCII Studio — typographic art tool')}`; break;
      case 'whatsapp': target = `https://wa.me/?text=${text}%20${url}`; break;
    }
    if (target) window.open(target, '_blank', 'noopener,width=600,height=560');
  });
});

function loadFromHash() {
  if (location.hash.length < 2) return;
  try {
    const json  = decodeURIComponent(escape(atob(location.hash.slice(1))));
    const state = JSON.parse(json);
    Object.assign(S, state.S);
    Object.assign(M, state.M);
    if (Array.isArray(M.paintTimings)) {
      M.paintTimings = new Map(M.paintTimings as any);
    }
    syncMaskUI();
    syncSettingsUI();
  } catch {}
}

function syncSettingsUI() {
  rampInput.value          = S.ramp;
  renderModeSelect.value   = S.renderMode;
  rampRow.style.display    = S.renderMode === 'ascii' ? 'flex' : 'none';
  widthSlider.value        = String(S.widthChars);   widthVal.textContent       = String(S.widthChars);
  cellAspectSlider.value   = String(S.cellAspect);   cellAspectVal.textContent  = S.cellAspect.toFixed(2);
  edgeSlider.value         = String(S.edgeThreshold);edgeVal.textContent        = String(S.edgeThreshold);
  gifCellSlider.value      = String(S.gifCell);      gifCellVal.textContent     = `${S.gifCell} px`;
  blendStepsSlider.value   = String(S.blendSteps);   blendStepsVal.textContent  = String(S.blendSteps);
  holdFramesSlider.value   = String(S.holdFrames);   holdFramesVal.textContent  = String(S.holdFrames);
  maxFramesSlider.value    = String(S.maxFrames);    maxFramesVal.textContent   = String(S.maxFrames);
  sampleFpsSlider.value    = String(S.sampleFps);    sampleFpsVal.textContent   = String(S.sampleFps);
  scanlinesSlider.value    = String(S.scanlines);    scanlinesVal.textContent   = `${S.scanlines}%`;
  vignetteSlider.value     = String(S.vignette);     vignetteVal.textContent    = `${S.vignette}%`;
  grainSlider.value        = String(S.grain);        grainVal.textContent       = `${S.grain}%`;
  glowSlider.value         = String(S.glow);         glowVal.textContent        = `${S.glow}%`;
  themeFg.value            = S.themeFg;
  themeBg.value            = S.themeBg;
  themeRow.querySelectorAll<HTMLButtonElement>('.preset-chip').forEach(c => c.classList.toggle('active', c.dataset.theme === S.theme));
  customThemeBox.style.display = S.theme === 'custom' ? 'block' : 'none';
  colorToggle.classList.toggle('on',     S.color);
  invertToggle.classList.toggle('on',    S.invert);
  autoContrastTgl.classList.toggle('on', S.autoContrast);
  edgeToggle.classList.toggle('on',      S.edgeOn);
  smoothMergeTgl.classList.toggle('on',  S.smoothMerge);
  reverseToggle.classList.toggle('on',   M.reverse);
  edgeRow.style.display = S.edgeOn ? 'flex' : 'none';
}

// Load shared state on init
loadFromHash();

// Keyboard shortcuts
window.addEventListener('keydown', e => {
  // Skip when typing in inputs
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  if (e.code === 'Space') {
    e.preventDefault();
    btnMaskPlay.click();
  } else if (e.code === 'KeyR') {
    btnMaskReset.click();
  } else if (e.code === 'ArrowLeft') {
    e.preventDefault();
    const next = Math.max(0, parseInt(maskProgressSlider.value) - (e.shiftKey ? 1 : 5));
    maskProgressSlider.value = String(next);
    maskProgressSlider.dispatchEvent(new Event('input'));
  } else if (e.code === 'ArrowRight') {
    e.preventDefault();
    const next = Math.min(100, parseInt(maskProgressSlider.value) + (e.shiftKey ? 1 : 5));
    maskProgressSlider.value = String(next);
    maskProgressSlider.dispatchEvent(new Event('input'));
  } else if (e.code === 'KeyF') {
    zoomFit.click();
  }
});

// ── Reset ─────────────────────────────────────────────────────────────────────

const DEFAULTS = { ...S };

btnReset.addEventListener('click', () => {
  Object.assign(S, DEFAULTS);

  rampInput.value = S.ramp;

  widthSlider.value      = String(S.widthChars);   widthVal.textContent      = String(S.widthChars);
  cellAspectSlider.value = String(S.cellAspect);   cellAspectVal.textContent = S.cellAspect.toFixed(2);
  edgeSlider.value       = String(S.edgeThreshold);edgeVal.textContent       = String(S.edgeThreshold);
  gifCellSlider.value    = String(S.gifCell);      gifCellVal.textContent    = `${S.gifCell} px`;
  blendStepsSlider.value = String(S.blendSteps);   blendStepsVal.textContent = String(S.blendSteps);
  holdFramesSlider.value = String(S.holdFrames);   holdFramesVal.textContent = String(S.holdFrames);
  maxFramesSlider.value  = String(S.maxFrames);    maxFramesVal.textContent  = String(S.maxFrames);
  sampleFpsSlider.value  = String(S.sampleFps);    sampleFpsVal.textContent  = String(S.sampleFps);

  colorToggle.classList.toggle('on',     S.color);
  invertToggle.classList.toggle('on',    S.invert);
  autoContrastTgl.classList.toggle('on', S.autoContrast);
  edgeToggle.classList.toggle('on',      S.edgeOn);
  smoothMergeTgl.classList.toggle('on',  S.smoothMerge);
  edgeRow.style.display = S.edgeOn ? 'flex' : 'none';

  onSettingsChange();
});

// ── File loading ──────────────────────────────────────────────────────────────

function classify(file: File): SourceKind {
  if (file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')) return 'gif';
  if (file.type.startsWith('video/')) return 'video';
  return 'image';
}

async function reloadFile() {
  if (lastFile) await loadFile(lastFile);
}

async function loadFile(file: File) {
  stopAnim();
  stopMask();
  setStatus('Loading…');
  rawFrames = []; asciiFrames = [];
  emptyState.style.display = 'none';
  lastFile = file;

  try {
    currentKind = classify(file);

    if (currentKind === 'image') {
      rawFrames = [await decodeImageFile(file)];
      rawDelays = [100];
    } else if (currentKind === 'gif') {
      const r = await decodeGifFile(file, S.maxFrames);
      rawFrames = r.frames; rawDelays = r.delays;
    } else {
      rawFrames = await decodeVideoFile(file, { maxFrames: S.maxFrames, sampleFps: S.sampleFps });
      rawDelays = rawFrames.map(() => Math.round(100 / S.sampleFps));
    }

    if (!rawFrames.length) throw new Error('No frames decoded');

    // Thumbnail
    const tmp = document.createElement('canvas');
    tmp.width = rawFrames[0].width; tmp.height = rawFrames[0].height;
    tmp.getContext('2d')!.putImageData(rawFrames[0], 0, 0);
    thumbImg.src = tmp.toDataURL();
    thumbImg.style.display = 'block';
    dropFileName.textContent = file.name;
    dropFileName.style.display = 'block';

    const isAnim = rawFrames.length > 1;
    animSection.style.display    = isAnim ? 'block' : 'none';
    scrubber.style.display       = isAnim ? 'flex'  : 'none';
    smoothMergeRow.style.display = isAnim ? 'flex'  : 'none';
    frameSlider.max   = String(rawFrames.length - 1);
    frameSlider.value = '0';
    currentFrame      = 0;

    await buildAscii();

    if (isAnim) startAnim();
    // Re-render mask at current progress if scrubber was already set
    if (M.progress > 0) renderAtProgress(M.progress);
  } catch (err) {
    setStatus((err as Error).message || 'Load failed', 'err');
  }
}

// ── ASCII conversion ──────────────────────────────────────────────────────────

// ── Custom render modes ───────────────────────────────────────────────────────

// Density-ordered (densest first → sparsest → space)
const HALFTONE_RAMP  = '⬤●⬭◍○∘·  ';   // size-graduated dots
const BLOCK_RAMP     = '█▓▒░ ';
const GEOMETRIC_RAMP = '●◉◎○◌⋅ ';
const BAYER_4 = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5],
];

function resampleToImageData(img: ImageData, w: number, h: number): ImageData {
  const src = document.createElement('canvas');
  src.width = img.width; src.height = img.height;
  src.getContext('2d')!.putImageData(img, 0, 0);
  const dst = document.createElement('canvas');
  dst.width = w; dst.height = h;
  const dc = dst.getContext('2d')!;
  (dc as any).imageSmoothingEnabled = true;
  (dc as any).imageSmoothingQuality = 'high';
  dc.drawImage(src, 0, 0, w, h);
  return dc.getImageData(0, 0, w, h);
}

function imageDataToBraille(img: ImageData, widthChars: number, invert: boolean, autoContrast: boolean): AsciiResult {
  // Aspect: each braille char represents 2 pixel-cols × 4 pixel-rows.
  // Visually a typical font cell is ~ 0.5 wide:tall, so a braille char displays ~2:4 dots
  // in a 0.5:1 cell — meaning each "dot row" is ~0.25 cell tall, each "dot col" ~0.25 cell wide.
  // For natural image aspect: heightChars ≈ imageAspect × widthChars (with cellAspect baked in).
  const aspect = img.height / img.width;
  const heightChars = Math.max(1, Math.round(aspect * widthChars));
  const sw = widthChars * 2;
  const sh = heightChars * 4;
  const sampled = resampleToImageData(img, sw, sh);
  const d = sampled.data;

  // Find threshold via simple mean luminance for autoContrast
  let lumSum = 0;
  if (autoContrast) {
    for (let i = 0; i < d.length; i += 4) {
      lumSum += (d[i] * 0.2126 + d[i+1] * 0.7152 + d[i+2] * 0.0722) / 255;
    }
  }
  const threshold = autoContrast ? lumSum / (d.length / 4) : 0.5;

  // Map (col, row) within the 2×4 sub-grid → braille bit
  const dotMap: Array<[number, number, number]> = [
    [0, 0, 1 << 0], // dot 1
    [0, 1, 1 << 1], // dot 2
    [0, 2, 1 << 2], // dot 3
    [1, 0, 1 << 3], // dot 4
    [1, 1, 1 << 4], // dot 5
    [1, 2, 1 << 5], // dot 6
    [0, 3, 1 << 6], // dot 7
    [1, 3, 1 << 7], // dot 8
  ];

  let text = '';
  const colors = new Uint8Array(widthChars * heightChars * 3);

  for (let cy = 0; cy < heightChars; cy++) {
    for (let cx = 0; cx < widthChars; cx++) {
      let bits = 0;
      let r = 0, g = 0, b = 0, count = 0;
      for (const [dx, dy, mask] of dotMap) {
        const sx = cx * 2 + dx;
        const sy = cy * 4 + dy;
        const idx = (sy * sw + sx) * 4;
        const lum = (d[idx] * 0.2126 + d[idx+1] * 0.7152 + d[idx+2] * 0.0722) / 255;
        const filled = invert ? lum < threshold : lum >= threshold;
        if (filled) bits |= mask;
        r += d[idx]; g += d[idx+1]; b += d[idx+2]; count++;
      }
      text += String.fromCharCode(0x2800 + bits);
      const o = (cy * widthChars + cx) * 3;
      colors[o]   = Math.round(r / count);
      colors[o+1] = Math.round(g / count);
      colors[o+2] = Math.round(b / count);
    }
    if (cy < heightChars - 1) text += '\n';
  }

  return { text, columns: widthChars, rows: heightChars, colors };
}

function imageDataToBayer(img: ImageData, widthChars: number, invert: boolean, cellAspect: number): AsciiResult {
  const aspect = img.height / img.width;
  const heightChars = Math.max(1, Math.round(aspect * widthChars * 0.5 * cellAspect));
  const sampled = resampleToImageData(img, widthChars, heightChars);
  const d = sampled.data;

  let text = '';
  const colors = new Uint8Array(widthChars * heightChars * 3);

  for (let y = 0; y < heightChars; y++) {
    for (let x = 0; x < widthChars; x++) {
      const idx = (y * widthChars + x) * 4;
      let lum = (d[idx] * 0.2126 + d[idx+1] * 0.7152 + d[idx+2] * 0.0722) / 255;
      if (invert) lum = 1 - lum;
      const thresh = (BAYER_4[y % 4][x % 4] + 0.5) / 16;
      text += lum > thresh ? '█' : ' ';
      const o = (y * widthChars + x) * 3;
      colors[o]   = d[idx];
      colors[o+1] = d[idx+1];
      colors[o+2] = d[idx+2];
    }
    if (y < heightChars - 1) text += '\n';
  }

  return { text, columns: widthChars, rows: heightChars, colors };
}

function rampForMode(): string {
  switch (S.renderMode) {
    case 'halftone':  return HALFTONE_RAMP;
    case 'block':     return BLOCK_RAMP;
    case 'geometric': return GEOMETRIC_RAMP;
    default:          return S.ramp;
  }
}

async function buildAscii() {
  if (!rawFrames.length) return;
  setStatus('Converting…');

  if (S.renderMode === 'braille') {
    asciiFrames = rawFrames.map(f => imageDataToBraille(f, S.widthChars, S.invert, S.autoContrast));
  } else if (S.renderMode === 'bayer') {
    asciiFrames = rawFrames.map(f => imageDataToBayer(f, S.widthChars, S.invert, S.cellAspect));
  } else {
    const ramp = rampForMode();
    asciiFrames = rawFrames.map(f =>
      imageDataToAscii(f, {
        widthChars:    S.widthChars,
        ramp,
        invert:        S.invert,
        autoContrast:  S.autoContrast,
        edgeThreshold: S.edgeOn ? S.edgeThreshold : null,
        cellAspect:    S.cellAspect,
        color:         S.color,
      }),
    );
  }

  if (M.progress > 0) renderAtProgress(M.progress);
  else renderFrame(currentFrame);
  [btnPng, btnJpg, btnWebp, btnSvg, btnPng2x, btnPng4x,
   btnTxt, btnMd, btnHtml, btnAnsi, btnJson, btnPy, btnCpp, btnJs, btnCopy,
   btnHtmlInteractive].forEach(b => b.disabled = false);
  const isAnim = asciiFrames.length >= 2;
  btnGif.disabled    = !isAnim;
  btnWebm.disabled   = !isAnim;
  btnMp4.disabled    = !isAnim;
  btnAniSvg.disabled = !isAnim;
  btnLottie.disabled = !isAnim;

  const f0 = asciiFrames[0];
  infoLabel.textContent =
    `${rawFrames.length} frame${rawFrames.length > 1 ? 's' : ''} · ` +
    `${f0.columns}×${f0.rows} chars · ` +
    `${rawFrames[0].width}×${rawFrames[0].height} px`;
  setStatus(`✓ Ready — ${rawFrames.length} frame${rawFrames.length > 1 ? 's' : ''}`, 'ok');
}

function onSettingsChange() { buildAscii(); }

// ── Canvas rendering ──────────────────────────────────────────────────────────

// ── Theme palette ─────────────────────────────────────────────────────────────

type Palette = { bg: string; fgFn: (r:number,g:number,b:number)=>string; };
function getPalette(): Palette {
  switch (S.theme) {
    case 'matrix':
      return {
        bg: '#001100',
        fgFn: (r,g,b) => {
          const lum = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
          const v = Math.round(60 + 195 * lum);
          return `rgb(0,${v},${Math.round(v * 0.4)})`;
        },
      };
    case 'amber':
      return {
        bg: '#1a0a00',
        fgFn: (r,g,b) => {
          const lum = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
          const v = Math.round(50 + 205 * lum);
          return `rgb(${v},${Math.round(v * 0.65)},${Math.round(v * 0.05)})`;
        },
      };
    case 'cyber':
      return {
        bg: '#0a001f',
        fgFn: (r,g,b) => {
          const lum = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
          // Duotone: dark = magenta, bright = cyan
          if (lum < 0.5) {
            const v = lum * 2; // 0-1
            return `rgb(${Math.round(255 * v + 100 * (1 - v))},0,${Math.round(255 * v + 100 * (1 - v))})`;
          } else {
            const v = (lum - 0.5) * 2;
            return `rgb(${Math.round(0 + 255 * (1-v))},${Math.round(255 * v)},${Math.round(255)})`;
          }
        },
      };
    case 'mono':
      return {
        bg: '#000000',
        fgFn: (r,g,b) => {
          const lum = Math.round((r * 0.2126 + g * 0.7152 + b * 0.0722));
          return `rgb(${lum},${lum},${lum})`;
        },
      };
    case 'sepia':
      return {
        bg: '#1f140a',
        fgFn: (r,g,b) => {
          const lum = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
          const v = Math.round(60 + 195 * lum);
          return `rgb(${v},${Math.round(v * 0.75)},${Math.round(v * 0.45)})`;
        },
      };
    case 'custom': {
      const [fr, fg, fb] = hexToRgb(S.themeFg);
      return {
        bg: S.themeBg,
        fgFn: (r,g,b) => {
          const lum = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
          return `rgb(${Math.round(fr * lum)},${Math.round(fg * lum)},${Math.round(fb * lum)})`;
        },
      };
    }
    default: // auto — image colors
      return {
        bg: '#0a0a0c',
        fgFn: (r,g,b) => `rgb(${r},${g},${b})`,
      };
  }
}

// ── Overlay (scanlines / vignette / grain / glow) ─────────────────────────────

function drawOverlay(c: CanvasRenderingContext2D, w: number, h: number) {
  // Scanlines
  if (S.scanlines > 0) {
    c.save();
    c.globalAlpha = S.scanlines * 0.005; // 0–0.5
    c.fillStyle = '#000';
    for (let y = 0; y < h; y += 2) c.fillRect(0, y, w, 1);
    c.restore();
  }
  // Grain
  if (S.grain > 0) {
    const a = S.grain * 0.012;
    const id = c.getImageData(0, 0, w, h);
    const d  = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 255 * a;
      d[i]   = Math.max(0, Math.min(255, d[i]   + n));
      d[i+1] = Math.max(0, Math.min(255, d[i+1] + n));
      d[i+2] = Math.max(0, Math.min(255, d[i+2] + n));
    }
    c.putImageData(id, 0, 0);
  }
  // Vignette
  if (S.vignette > 0) {
    c.save();
    const grad = c.createRadialGradient(w/2, h/2, Math.min(w, h) * 0.3, w/2, h/2, Math.max(w, h) * 0.7);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${S.vignette * 0.012})`);
    c.fillStyle = grad;
    c.fillRect(0, 0, w, h);
    c.restore();
  }
  // Glow (additive blur — applied via shadow)
  if (S.glow > 0) {
    // Lift overall brightness with an additive layer
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = `rgba(80,140,255,${S.glow * 0.003})`;
    c.fillRect(0, 0, w, h);
    c.restore();
  }
}

// ── Hover effect overlay ─────────────────────────────────────────────────────

function drawHoverEffect(c: CanvasRenderingContext2D, frame: AsciiResult, cw: number, ch: number) {
  if (S.hoverMode === 'none' || S.hoverMode === 'tilt' || !hoverPxSm) return;
  const pal       = getPalette();
  const lines     = frame.text.split('\n');
  const rows      = lines.length;
  const cols      = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const radius    = S.hoverRadius;
  const strength  = S.hoverStrength / 100;
  const speed     = S.hoverSpeed;                            // animation speed multiplier
  const t         = performance.now() * 0.001 * speed;       // time scaled by user speed
  const cursorX   = hoverPxSm.x;
  const cursorY   = hoverPxSm.y;
  const radiusPx  = radius * CELL;
  // Custom accent color: if enabled, parse hex to RGB; else use NEUTRAL WHITE
  // (no purple tint — hover effects stay clean unless user explicitly picks a color)
  const useCustom = S.hoverUseColor;
  const customHex = S.hoverColor;
  const [cR, cG, cB]    = useCustom ? hexToRgb(customHex) : [255, 255, 255];  // primary highlight
  const [c2R, c2G, c2B] = useCustom ? hexToRgb(customHex) : [220, 220, 230];  // soft secondary
  const accentColor   = useCustom ? customHex : '#ffffff';
  const accent2Color  = useCustom ? customHex : '#e0e0e8';

  // ── Whole-canvas effects (early-return, don't do per-cell loop) ────────────

  if (S.hoverMode === 'spotlight') {
    const r = radiusPx;
    // 1. Dim mask
    const grad = c.createRadialGradient(cursorX, cursorY, 0, cursorX, cursorY, r * 2.2);
    grad.addColorStop(0.00, 'rgba(0,0,0,0)');
    grad.addColorStop(0.30, 'rgba(0,0,0,0.10)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.45)');
    grad.addColorStop(0.85, 'rgba(2,1,4,0.85)');
    grad.addColorStop(1.00, 'rgba(2,1,4,0.95)');
    c.fillStyle = grad;
    c.fillRect(0, 0, cw, ch);

    // 2. Slowly rotating light rays — 6 conical wedges emanating from cursor
    c.save();
    c.globalCompositeOperation = 'lighter';
    const rays = 6;
    for (let i = 0; i < rays; i++) {
      const ang = (i / rays) * Math.PI * 2 + t * 0.25;
      const rayWidth = Math.PI * 0.12;
      const reach = r * (1.6 + Math.sin(t * 0.8 + i) * 0.15);
      c.beginPath();
      c.moveTo(cursorX, cursorY);
      c.arc(cursorX, cursorY, reach, ang - rayWidth, ang + rayWidth);
      c.closePath();
      const rayGrad = c.createRadialGradient(cursorX, cursorY, 0, cursorX, cursorY, reach);
      rayGrad.addColorStop(0,    `rgba(${c2R},${c2G},${c2B},0.0)`);
      rayGrad.addColorStop(0.15, `rgba(${c2R},${c2G},${c2B},0.18)`);
      rayGrad.addColorStop(1,    `rgba(${c2R},${c2G},${c2B},0.0)`);
      c.fillStyle = rayGrad;
      c.fill();
    }
    c.restore();

    // 3. Inner soft halo
    c.save();
    c.globalCompositeOperation = 'lighter';
    const halo = c.createRadialGradient(cursorX, cursorY, 0, cursorX, cursorY, r * 0.6);
    halo.addColorStop(0.00, `rgba(${c2R},${c2G},${c2B},0.28)`);
    halo.addColorStop(0.55, `rgba(${c2R},${c2G},${c2B},0.08)`);
    halo.addColorStop(1.00, `rgba(${c2R},${c2G},${c2B},0)`);
    c.fillStyle = halo;
    c.fillRect(0, 0, cw, ch);

    // 4. Dust motes drifting in the beam (8 small particles orbiting slowly)
    for (let i = 0; i < 10; i++) {
      const ang   = t * 0.5 + i * 0.7;
      const orbR  = r * (0.25 + (i % 3) * 0.18);
      const px    = cursorX + Math.cos(ang) * orbR + Math.sin(t * 0.3 + i) * 8;
      const py    = cursorY + Math.sin(ang * 0.7) * orbR + Math.cos(t * 0.4 + i) * 6;
      const size  = 1.2 + Math.sin(t * 2 + i) * 0.6;
      c.fillStyle = `rgba(${cR},${cG},${cB},${0.5 + Math.sin(t + i) * 0.2})`;
      c.beginPath();
      c.arc(px, py, size, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    return;
  }

  if (S.hoverMode === 'comet') {
    // Add new sample only if cursor actually moved
    const last = cometTrail[cometTrail.length - 1];
    if (!last || Math.hypot(cursorX - last.x, cursorY - last.y) > 1.5) {
      cometTrail.push({ x: cursorX, y: cursorY, t });
    }
    while (cometTrail.length > 36) cometTrail.shift();

    // Smooth trail with bezier curves between samples for natural flow
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < cometTrail.length; i++) {
      const p = cometTrail[i];
      const age = (t - p.t) / 0.7;
      if (age >= 1) continue;
      const fade = (1 - age) * (1 - age);      // ease-out for natural decay
      const idxFade = i / cometTrail.length;   // newer points stronger
      const size = (10 + idxFade * 18) * Math.sqrt(fade) * strength;
      const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 3.2);
      g.addColorStop(0,    `rgba(${cR},${cG},${cB},${0.55 * fade})`);
      g.addColorStop(0.4,  `rgba(${c2R},${c2G},${c2B},${0.22 * fade})`);
      g.addColorStop(1,    `rgba(${c2R},${c2G},${c2B},0)`);
      c.fillStyle = g;
      c.fillRect(p.x - size * 3, p.y - size * 3, size * 6, size * 6);
      // Hot white core only on the freshest 6 samples
      if (i >= cometTrail.length - 6) {
        c.fillStyle = `rgba(255,255,255,${0.85 * fade * idxFade})`;
        c.beginPath();
        c.arc(p.x, p.y, size * 0.25, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.restore();
    // Brighten chars within trail radius (uses pixel-space cursor — smooth)
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < lines[row].length; col++) {
        const glyph = lines[row][col];
        if (glyph === ' ') continue;
        const cellCx = col * CELL + CELL / 2;
        const cellCy = row * CELL + CELL / 2;
        const dist = Math.hypot(cellCx - cursorX, cellCy - cursorY);
        if (dist > radiusPx * 0.7) continue;
        const prox = proxFromDist(dist, radiusPx * 0.7);
        c.save();
        c.shadowColor = accent2Color;
        c.shadowBlur = 10 * prox;
        c.fillStyle = `rgba(255,255,255,${0.6 + prox * 0.4})`;
        c.fillText(glyph, col * CELL, row * CELL);
        c.restore();
      }
    }
    return;
  }

  if (S.hoverMode === 'particles') {
    // Emit count scales with cursor velocity (more particles when moving fast)
    const emitCount = Math.min(6, 1 + Math.floor(hoverVel * 0.5));
    for (let i = 0; i < emitCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.4 + Math.random() * (1.5 + hoverVel * 0.2);
      // Pick a particle TYPE — 70% dot, 20% star, 10% spark
      const r = Math.random();
      const kind: Particle['kind'] = r < 0.7 ? 'dot' : r < 0.9 ? 'star' : 'spark';
      particles.push({
        x:  cursorX + (Math.random() - 0.5) * 4,
        y:  cursorY + (Math.random() - 0.5) * 4,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.4,
        life: 0,
        maxLife: 1.4 + Math.random() * 1.4,
        size: kind === 'star' ? 3 + Math.random() * 2 : kind === 'spark' ? 1 + Math.random() : 1.5 + Math.random() * 2.8,
        hue: useCustom ? 0 : 0,   // hue is unused unless useCustom is on; particles default to white
        kind,
      });
    }
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += 1 / 60;
      p.vy += 0.018;            // gentler gravity
      p.vx *= 0.985;            // gentler drag → particles drift longer
      p.vy *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      // Soft repel from cursor for organic spread
      const dxc = p.x - cursorX;
      const dyc = p.y - cursorY;
      const dc  = Math.hypot(dxc, dyc) || 1;
      if (dc < radiusPx) {
        const push = (1 - dc / radiusPx) * 0.18 * strength;
        p.vx += (dxc / dc) * push;
        p.vy += (dyc / dc) * push;
      }
      if (p.life >= p.maxLife) { particles.splice(i, 1); continue; }
      const fade  = 1 - p.life / p.maxLife;
      const alpha = fade * fade;

      // Color: white-neutral by default, OR custom hex when toggle is on
      const rgbBase = useCustom ? `${cR},${cG},${cB}` : `255,255,255`;
      const glowEdge = useCustom ? `${cR},${cG},${cB}` : `225,225,235`;

      if (p.kind === 'star') {
        // 4-point star drawn as a "+" cross with glow
        const r = p.size * (1 + (1 - fade) * 0.5);
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.life * 2);
        const g = c.createRadialGradient(0, 0, 0, 0, 0, r * 4);
        g.addColorStop(0, `rgba(${rgbBase},${alpha * 0.9})`);
        g.addColorStop(1, `rgba(${glowEdge},0)`);
        c.fillStyle = g;
        c.fillRect(-r * 4, -r * 4, r * 8, r * 8);
        c.fillStyle = `rgba(255,255,255,${alpha})`;
        c.fillRect(-r * 2, -0.5, r * 4, 1);
        c.fillRect(-0.5, -r * 2, 1, r * 4);
        c.restore();
      } else if (p.kind === 'spark') {
        const ang = Math.atan2(p.vy, p.vx);
        const len = 6 + Math.hypot(p.vx, p.vy) * 2;
        c.save();
        c.translate(p.x, p.y);
        c.rotate(ang);
        c.strokeStyle = `rgba(${rgbBase},${alpha})`;
        c.lineWidth = 1.2;
        c.shadowColor = useCustom ? S.hoverColor : '#ffffff';
        c.shadowBlur = 4;
        c.beginPath();
        c.moveTo(-len * 0.6, 0);
        c.lineTo(len * 0.4, 0);
        c.stroke();
        c.restore();
      } else {
        const r2 = p.size * (1 + (1 - fade) * 1.2);
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r2 * 3.4);
        g.addColorStop(0,    `rgba(${rgbBase},${alpha})`);
        g.addColorStop(0.45, `rgba(${rgbBase},${alpha * 0.4})`);
        g.addColorStop(1,    `rgba(${glowEdge},0)`);
        c.fillStyle = g;
        c.fillRect(p.x - r2 * 3.4, p.y - r2 * 3.4, r2 * 6.8, r2 * 6.8);
      }
    }
    if (particles.length > 140) particles.splice(0, particles.length - 140);
    c.restore();
    return;
  }

  // ─── 🌀 Plasma — fluid blobs of color following cursor ────────────────────
  if (S.hoverMode === 'plasma') {
    c.save();
    c.globalCompositeOperation = 'screen';
    // 3 wobbling color blobs orbiting cursor at different phases
    for (let i = 0; i < 3; i++) {
      const phase   = t * (1 + i * 0.3) + i * 2.1;
      const orbR    = radiusPx * 0.18 * strength;
      const blobX   = cursorX + Math.cos(phase) * orbR;
      const blobY   = cursorY + Math.sin(phase * 0.9) * orbR;
      const breath  = 0.85 + Math.sin(t * 2 + i) * 0.15;
      const r       = radiusPx * (0.55 + i * 0.12) * strength * breath;
      const blob = c.createRadialGradient(blobX, blobY, 0, blobX, blobY, r);
      if (useCustom) {
        blob.addColorStop(0,    `rgba(${cR},${cG},${cB},0.55)`);
        blob.addColorStop(0.5,  `rgba(${cR},${cG},${cB},0.15)`);
        blob.addColorStop(1,    `rgba(${cR},${cG},${cB},0)`);
      } else {
        // Neutral white blobs with subtle alpha variation per layer (no hue cycling)
        const alpha = 0.45 - i * 0.08;
        blob.addColorStop(0,    `rgba(255,255,255,${alpha})`);
        blob.addColorStop(0.5,  `rgba(245,245,250,${alpha * 0.3})`);
        blob.addColorStop(1,    `rgba(230,230,240,0)`);
      }
      c.fillStyle = blob;
      c.fillRect(0, 0, cw, ch);
    }
    c.restore();
    // Distort nearby chars with a noise-based wobble in addition to glow
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < lines[row].length; col++) {
        const glyph = lines[row][col];
        if (glyph === ' ') continue;
        const cellCx = col * CELL + CELL / 2;
        const cellCy = row * CELL + CELL / 2;
        const dPx = Math.hypot(cellCx - cursorX, cellCy - cursorY);
        if (dPx > radiusPx) continue;
        const prox = proxFromDist(dPx, radiusPx);
        const wob  = Math.sin(t * 3 + col * 0.4 + row * 0.6) * prox * 3 * strength;
        c.save();
        c.shadowColor = accent2Color;
        c.shadowBlur  = 10 * prox;
        c.globalAlpha = 0.7 + prox * 0.3;
        c.fillStyle = `rgba(255,255,255,${prox * 0.9})`;
        c.fillText(glyph, col * CELL, row * CELL + wob);
        c.restore();
      }
    }
    return;
  }

  // ─── 💫 Shockwave — expanding rings spawn on cursor velocity spikes ──────
  if (S.hoverMode === 'shockwave') {
    // Spawn new ring when cursor moves fast enough (and don't double-spawn rapidly)
    const last = shockwaves[shockwaves.length - 1];
    const minGap = 0.10; // s
    if (hoverVel > 0.9 && (!last || t - last.t > minGap)) {
      shockwaves.push({ x: cursorX, y: cursorY, t, maxR: radiusPx * (1.5 + hoverVel * 0.05) });
    }
    // Render + age rings
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const r       = shockwaves[i];
      const age     = (t - r.t) / 1.0;
      if (age >= 1) { shockwaves.splice(i, 1); continue; }
      const eased   = age * (2 - age);              // ease-out
      const radius  = eased * r.maxR;
      const alpha   = (1 - age) * (1 - age) * 0.85;
      const width   = (1 - age) * 4 + 1;
      // Outer halo
      c.strokeStyle = `rgba(${c2R},${c2G},${c2B},${alpha * 0.5})`;
      c.lineWidth = width * 3;
      c.beginPath();
      c.arc(r.x, r.y, radius, 0, Math.PI * 2);
      c.stroke();
      // Sharp ring
      c.strokeStyle = `rgba(${cR},${cG},${cB},${alpha})`;
      c.lineWidth = width;
      c.beginPath();
      c.arc(r.x, r.y, radius, 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();
    // Chars near any ring frontier get pushed outward briefly + glow
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < lines[row].length; col++) {
        const glyph = lines[row][col];
        if (glyph === ' ') continue;
        const cellCx = col * CELL + CELL / 2;
        const cellCy = row * CELL + CELL / 2;
        let pushAmt = 0;
        let glow = 0;
        for (const r of shockwaves) {
          const age = (t - r.t) / 1.0;
          if (age >= 1) continue;
          const eased = age * (2 - age);
          const ringR = eased * r.maxR;
          const d = Math.hypot(cellCx - r.x, cellCy - r.y);
          const distToRing = Math.abs(d - ringR);
          if (distToRing < CELL * 2) {
            const ringProx = 1 - distToRing / (CELL * 2);
            const fade = 1 - age;
            pushAmt = Math.max(pushAmt, ringProx * fade * strength * 6);
            glow = Math.max(glow, ringProx * fade);
          }
        }
        if (pushAmt > 0) {
          // Find nearest ring + push direction
          let best: typeof shockwaves[0] | null = null;
          let bestD = Infinity;
          for (const r of shockwaves) {
            const d = Math.hypot(cellCx - r.x, cellCy - r.y);
            if (d < bestD) { bestD = d; best = r; }
          }
          if (best) {
            const dx = cellCx - best.x;
            const dy = cellCy - best.y;
            const d  = Math.hypot(dx, dy) || 1;
            c.save();
            c.shadowColor = accent2Color;
            c.shadowBlur = 8 * glow;
            c.fillStyle = `rgba(255,255,255,${0.7 + glow * 0.3})`;
            c.fillText(glyph, col * CELL + (dx / d) * pushAmt, row * CELL + (dy / d) * pushAmt);
            c.restore();
          }
        }
      }
    }
    return;
  }

  // ─── 🌌 Aurora — flowing color waves rippling across the canvas ──────────
  if (S.hoverMode === 'aurora') {
    c.save();
    c.globalCompositeOperation = 'screen';
    const layers = 4;
    for (let layer = 0; layer < layers; layer++) {
      const freq = 0.012 + layer * 0.004;
      const amp  = 60 + layer * 25;
      const phase = t * 0.6 + layer * 1.7;
      // Build a wide ribbon via Path2D
      c.beginPath();
      c.moveTo(0, ch);
      for (let x = 0; x <= cw; x += 8) {
        // Influence: closer to cursor X = larger amplitude pulse
        const cursorInf = Math.exp(-Math.pow((x - cursorX) / (radiusPx * 1.8), 2));
        const y = ch * 0.35 + Math.sin(x * freq + phase) * amp * (0.7 + cursorInf * strength * 1.5)
                + Math.cos(x * freq * 1.7 + phase * 0.8) * amp * 0.4
                - (cursorY - ch / 2) * cursorInf * 0.3;
        c.lineTo(x, y);
      }
      c.lineTo(cw, ch);
      c.closePath();
      const grad = c.createLinearGradient(0, 0, 0, ch);
      if (useCustom) {
        grad.addColorStop(0,   `rgba(${cR},${cG},${cB},0)`);
        grad.addColorStop(0.5, `rgba(${cR},${cG},${cB},${0.12 - layer * 0.02})`);
        grad.addColorStop(1,   `rgba(${cR},${cG},${cB},0)`);
      } else {
        // Neutral white ribbons — alpha-driven layering, no hue
        const a = 0.18 - layer * 0.03;
        grad.addColorStop(0,   `rgba(255,255,255,0)`);
        grad.addColorStop(0.5, `rgba(255,255,255,${a})`);
        grad.addColorStop(1,   `rgba(235,235,245,0)`);
      }
      c.fillStyle = grad;
      c.fill();
    }
    c.restore();
    return;
  }

  // ─── 🎭 Mask hover modes — paint/reveal/erase the ASCII with the cursor ──
  if (S.hoverMode === 'mask-reveal' || S.hoverMode === 'mask-paint' ||
      S.hoverMode === 'mask-trail'  || S.hoverMode === 'mask-erase') {
    ensureMaskBuf(rows, cols);

    // Wipe canvas to bg — we'll redraw chars selectively
    c.fillStyle = pal.bg;
    c.fillRect(0, 0, cw, ch);

    // Update touch buffer for paint/trail/erase modes — only iterate the
    // bounding box of the cursor radius for performance
    if (S.hoverMode !== 'mask-reveal' && maskBuf) {
      const minCol = Math.max(0, Math.floor((cursorX - radiusPx) / CELL));
      const maxCol = Math.min(cols - 1, Math.ceil((cursorX + radiusPx) / CELL));
      const minRow = Math.max(0, Math.floor((cursorY - radiusPx) / CELL));
      const maxRow = Math.min(rows - 1, Math.ceil((cursorY + radiusPx) / CELL));
      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          const cellCx = col * CELL + CELL / 2;
          const cellCy = row * CELL + CELL / 2;
          const d = Math.hypot(cellCx - cursorX, cellCy - cursorY);
          if (d <= radiusPx) {
            // Stronger strength = larger "stamp" effect
            maskBuf[row * cols + col] = t;
          }
        }
      }
    }

    // Configurable timing for paint/trail modes (use S.hoverSpeed)
    const FADE_IN_S    = 0.20 / speed;
    const SETTLE_S     = 0.45 / speed;   // flip duration (trail mode)
    const HOLD_S       = 1.40 / speed;   // how long fully-revealed lasts
    const FADE_OUT_S   = 0.60 / speed;
    const charset      = M.flipCharset || '01/\\_*+.-=';

    // Render every char based on mode
    for (let row = 0; row < rows; row++) {
      const line = lines[row];
      for (let col = 0; col < line.length; col++) {
        const glyph = line[col];
        if (glyph === ' ') continue;
        const cellCx = col * CELL + CELL / 2;
        const cellCy = row * CELL + CELL / 2;
        const o = (row * frame.columns + col) * 3;
        const fr = frame.colors ? frame.colors[o]     : 230;
        const fg = frame.colors ? frame.colors[o + 1] : 230;
        const fb = frame.colors ? frame.colors[o + 2] : 230;
        const themedStyle = pal.fgFn(fr, fg, fb);

        let alpha = 0;
        let displayGlyph = glyph;
        let extraGlow = 0;

        // mask-reveal: realtime spotlight — only cells in cursor radius are visible
        if (S.hoverMode === 'mask-reveal') {
          const d = Math.hypot(cellCx - cursorX, cellCy - cursorY);
          if (d >= radiusPx) continue;
          alpha = proxFromDist(d, radiusPx);
          extraGlow = alpha;
        }
        // mask-paint: chars fade in when touched, fade out after HOLD time
        else if (S.hoverMode === 'mask-paint' && maskBuf) {
          const touchedAt = maskBuf[row * cols + col];
          if (touchedAt === 0) continue;
          const age = t - touchedAt;
          if (age < FADE_IN_S)              alpha = age / FADE_IN_S;
          else if (age < FADE_IN_S + HOLD_S) alpha = 1;
          else if (age < FADE_IN_S + HOLD_S + FADE_OUT_S) {
            const fadeAge = age - FADE_IN_S - HOLD_S;
            alpha = 1 - fadeAge / FADE_OUT_S;
          } else continue;
        }
        // mask-trail: chars flip-then-settle when touched, then fade away
        else if (S.hoverMode === 'mask-trail' && maskBuf) {
          const touchedAt = maskBuf[row * cols + col];
          if (touchedAt === 0) continue;
          const age = t - touchedAt;
          if (age < SETTLE_S) {
            // Flipping phase
            const flipPhase = Math.floor(t * M.flipRate);
            const idx = Math.abs(flipPhase + col * 7 + row * 3) % charset.length;
            displayGlyph = charset[idx];
            alpha = Math.min(1, (age / SETTLE_S) * 1.2);
            extraGlow = 0.6;
          } else if (age < SETTLE_S + HOLD_S) {
            alpha = 1;
          } else if (age < SETTLE_S + HOLD_S + FADE_OUT_S) {
            alpha = 1 - (age - SETTLE_S - HOLD_S) / FADE_OUT_S;
          } else continue;
        }
        // mask-erase: starts fully visible, cursor erases cells (inverse of paint)
        else if (S.hoverMode === 'mask-erase' && maskBuf) {
          const touchedAt = maskBuf[row * cols + col];
          if (touchedAt === 0) { alpha = 1; }
          else {
            const age = t - touchedAt;
            if (age < FADE_OUT_S) alpha = 1 - age / FADE_OUT_S;
            else continue; // fully erased — skip
          }
        }

        if (alpha <= 0) continue;

        c.save();
        c.globalAlpha = alpha;
        if (extraGlow > 0.1) {
          c.shadowColor = accent2Color;
          c.shadowBlur = 8 * extraGlow * strength;
        }
        c.fillStyle = themedStyle;
        c.fillText(displayGlyph, col * CELL, row * CELL);
        c.restore();
      }
    }

    // Subtle cursor halo so the user always sees where they're painting
    if (S.hoverMode !== 'mask-reveal') {
      c.save();
      c.globalCompositeOperation = 'lighter';
      const halo = c.createRadialGradient(cursorX, cursorY, 0, cursorX, cursorY, radiusPx);
      halo.addColorStop(0,    `rgba(${c2R},${c2G},${c2B},0.15)`);
      halo.addColorStop(0.7,  `rgba(${c2R},${c2G},${c2B},0.04)`);
      halo.addColorStop(1,    `rgba(${c2R},${c2G},${c2B},0)`);
      c.fillStyle = halo;
      c.fillRect(0, 0, cw, ch);
      c.restore();
    }
    return;
  }

  // ─── ⚡ Lightning — electric arcs from cursor to nearby chars ────────────
  if (S.hoverMode === 'lightning') {
    // Spawn new bolts toward random nearby chars (capped)
    if (lightningBolts.length < 8) {
      for (let i = 0; i < 2; i++) {
        // Pick a random angle + distance within radius
        const a = Math.random() * Math.PI * 2;
        const d = (0.3 + Math.random() * 0.7) * radiusPx;
        const tx = cursorX + Math.cos(a) * d;
        const ty = cursorY + Math.sin(a) * d;
        // Generate jagged midpoints
        const segs = 4 + Math.floor(Math.random() * 3);
        const midpoints: Array<{ x: number; y: number }> = [];
        for (let s = 1; s < segs; s++) {
          const tt = s / segs;
          const lx = cursorX + (tx - cursorX) * tt;
          const ly = cursorY + (ty - cursorY) * tt;
          // Perpendicular jitter
          const perpX = -(ty - cursorY);
          const perpY = (tx - cursorX);
          const perpLen = Math.hypot(perpX, perpY) || 1;
          const jit = (Math.random() - 0.5) * 12 * strength;
          midpoints.push({ x: lx + (perpX / perpLen) * jit, y: ly + (perpY / perpLen) * jit });
        }
        lightningBolts.push({ from: { x: cursorX, y: cursorY }, to: { x: tx, y: ty }, midpoints, t });
      }
    }
    // Draw + age bolts
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = lightningBolts.length - 1; i >= 0; i--) {
      const b = lightningBolts[i];
      const age = (t - b.t) / 0.15;     // bolts last ~150 ms
      if (age >= 1) { lightningBolts.splice(i, 1); continue; }
      const alpha = (1 - age);
      const pts = [b.from, ...b.midpoints, b.to];
      // Outer cyan glow
      c.strokeStyle = `rgba(180,220,255,${alpha * 0.35})`;
      c.lineWidth = 5;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y);
      for (let p = 1; p < pts.length; p++) c.lineTo(pts[p].x, pts[p].y);
      c.stroke();
      // Hot white core
      c.strokeStyle = `rgba(255,255,255,${alpha})`;
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y);
      for (let p = 1; p < pts.length; p++) c.lineTo(pts[p].x, pts[p].y);
      c.stroke();
    }
    c.restore();
    // Brighten chars near any bolt endpoint
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < lines[row].length; col++) {
        const glyph = lines[row][col];
        if (glyph === ' ') continue;
        const cellCx = col * CELL + CELL / 2;
        const cellCy = row * CELL + CELL / 2;
        const dist = Math.hypot(cellCx - cursorX, cellCy - cursorY);
        if (dist > radiusPx) continue;
        const prox = proxFromDist(dist, radiusPx);
        // Flicker
        const flicker = 0.7 + Math.random() * 0.3;
        c.save();
        c.shadowColor = '#aaccff';
        c.shadowBlur = 8 * prox;
        c.fillStyle = `rgba(${230 + 25 * prox},${240 + 15 * prox},255,${prox * flicker})`;
        c.fillText(glyph, col * CELL, row * CELL);
        c.restore();
      }
    }
    return;
  }

  // ── Per-cell effects (pixel-precise distance + smoothstep falloff) ─────────

  for (let row = 0; row < rows; row++) {
    const line = lines[row];
    for (let col = 0; col < line.length; col++) {
      const glyph = line[col];
      if (glyph === ' ') continue;

      const cellX  = col * CELL;
      const cellY  = row * CELL;
      const cellCx = cellX + CELL / 2;
      const cellCy = cellY + CELL / 2;
      const dxPx   = cellCx - cursorX;
      const dyPx   = cellCy - cursorY;
      const distPx = Math.hypot(dxPx, dyPx);
      if (distPx > radiusPx) continue;

      // User-selected falloff curve
      const proximity = proxFromDist(distPx, radiusPx);
      if (proximity < 0.005) continue;

      const o = (row * frame.columns + col) * 3;
      const fr = frame.colors ? frame.colors[o]     : 230;
      const fg = frame.colors ? frame.colors[o + 1] : 230;
      const fb = frame.colors ? frame.colors[o + 2] : 230;
      const themedStyle = pal.fgFn(fr, fg, fb);

      // Clear old glyph cleanly
      c.fillStyle = pal.bg;
      c.fillRect(cellX - 2, cellY - 2, CELL + 4, CELL + 4);

      switch (S.hoverMode) {
        case 'glow': {
          // Multi-layer bloom: 3 stacked shadow passes at different radii for true cinematic bloom
          c.save();
          c.shadowOffsetX = 0; c.shadowOffsetY = 0;
          c.fillStyle = themedStyle;
          // Outer halo — wide soft glow
          c.shadowColor = useCustom ? S.hoverColor : themedStyle;
          c.shadowBlur  = 26 * strength * proximity;
          c.globalAlpha = 0.5;
          c.fillText(glyph, cellX, cellY);
          // Mid bloom
          c.shadowBlur  = 12 * strength * proximity;
          c.globalAlpha = 0.8;
          c.fillText(glyph, cellX, cellY);
          // Tight core
          c.shadowBlur  = 4 * strength * proximity;
          c.globalAlpha = 1;
          c.fillText(glyph, cellX, cellY);
          // White-hot center on the closest cells
          if (proximity > 0.55) {
            c.shadowBlur = 0;
            c.fillStyle  = `rgba(255,255,255,${(proximity - 0.55) * 1.5})`;
            c.fillText(glyph, cellX, cellY);
          }
          c.restore();
          break;
        }
        case 'scale': {
          const scale = 1 + strength * proximity * 0.55;       // gentler max scale
          c.save();
          c.translate(cellCx, cellCy);
          c.scale(scale, scale);
          c.shadowColor = themedStyle;
          c.shadowBlur  = 4 * proximity;
          c.fillStyle   = themedStyle;
          c.fillText(glyph, -CELL / 2, -CELL / 2);
          c.restore();
          break;
        }
        case 'wave': {
          // Time-decaying ripple — phase moves outward smoothly
          const phase  = distPx / CELL - t * 4;
          const env    = proximity * proximity;                // squared envelope = soft edge
          const offset = Math.sin(phase * 1.2) * env * strength * 5;
          c.save();
          c.fillStyle = themedStyle;
          c.fillText(glyph, cellX, cellY + offset);
          c.restore();
          break;
        }
        case 'magnet': {
          // Smooth pull with eased proximity
          const pullStrength = proximity * strength * 0.42;
          const pullX = -dxPx * pullStrength;
          const pullY = -dyPx * pullStrength;
          c.save();
          c.shadowColor = themedStyle;
          c.shadowBlur  = 3 * proximity;
          c.fillStyle = themedStyle;
          c.fillText(glyph, cellX + pullX, cellY + pullY);
          c.restore();
          break;
        }
        case 'repel': {
          // Smooth push with normalized direction vector + eased force
          const d = distPx || 0.001;
          const force = proximity * proximity * strength * (radiusPx * 0.45);
          const pushX = (dxPx / d) * force;
          const pushY = (dyPx / d) * force;
          c.save();
          c.globalAlpha = 0.55 + proximity * 0.45;
          c.fillStyle = themedStyle;
          c.fillText(glyph, cellX + pushX, cellY + pushY);
          c.restore();
          break;
        }
        case 'vortex': {
          // Swirl around pixel cursor with smooth angle delta
          const ang0     = Math.atan2(dyPx, dxPx);
          const angDelta = proximity * Math.PI * strength * 0.6;
          const newDist  = distPx * (1 - proximity * 0.22 * strength);
          const nx = cursorX + Math.cos(ang0 + angDelta) * newDist;
          const ny = cursorY + Math.sin(ang0 + angDelta) * newDist;
          c.save();
          c.shadowColor = accentColor;
          c.shadowBlur = 5 * proximity;
          c.fillStyle = themedStyle;
          c.fillText(glyph, nx - CELL / 2, ny - CELL / 2);
          c.restore();
          break;
        }
        case 'levitate': {
          // Float up + slow horizontal sway — eased
          const lift = -strength * proximity * 5;
          const sway = Math.sin(t * 1.8 + col * 0.4 + row * 0.25) * proximity * 1.5;
          c.save();
          c.shadowColor = accent2Color;
          c.shadowBlur = 4 * proximity;
          c.fillStyle = themedStyle;
          c.fillText(glyph, cellX + sway, cellY + lift);
          c.restore();
          break;
        }
        case 'glitch': {
          // Less manic — change glyph slowly (every ~50ms) + softer RGB shift
          const glitchSet = '!@#$%&*+=?/<>|\\01ABCXYZ';
          const stepSeed  = Math.floor(t * 14 + col * 5 + row * 3);
          const glitchGlyph = proximity > 0.25 ? glitchSet[Math.abs(stepSeed) % glitchSet.length] : glyph;
          const offX = Math.sin(stepSeed * 1.3) * proximity * 1.4;
          const offY = Math.cos(stepSeed * 0.7) * proximity * 0.8;
          c.save();
          c.globalCompositeOperation = 'screen';
          // Subtle RGB-shift using neutral red/cyan (not purple) — classic chromatic-aberration look
          c.fillStyle = `rgba(255,80,80,${0.5 * proximity + 0.1})`;
          c.fillText(glitchGlyph, cellX + offX - 1, cellY + offY);
          c.fillStyle = `rgba(80,220,255,${0.4 * proximity + 0.1})`;
          c.fillText(glitchGlyph, cellX + offX + 1, cellY + offY);
          c.fillStyle = themedStyle;
          c.fillText(glitchGlyph, cellX + offX, cellY + offY);
          c.restore();
          break;
        }
        case 'invert': {
          // Smoothly cross-fade between original and inverted via proximity
          const ir = Math.round(fr * (1 - proximity) + (255 - fr) * proximity);
          const ig = Math.round(fg * (1 - proximity) + (255 - fg) * proximity);
          const ib = Math.round(fb * (1 - proximity) + (255 - fb) * proximity);
          c.fillStyle = `rgb(${ir},${ig},${ib})`;
          c.fillText(glyph, cellX, cellY);
          break;
        }
        case 'lens': {
          // Magnifying-glass bulge — scale + radial push outward + chromatic aberration
          const lensP = proximity * proximity * strength;            // squared = soft outer
          const scale = 1 + lensP * 0.9;
          const d = distPx || 0.001;
          const nx = dxPx / d, ny = dyPx / d;
          // Push chars outward proportional to bulge strength
          const push = lensP * radiusPx * 0.18;
          const px2 = nx * push, py2 = ny * push;
          // Chromatic aberration scales with distance from center (more split at edge)
          const ab = (1 - proximity) * 2.2 * strength;
          c.save();
          c.translate(cellCx + px2, cellCy + py2);
          c.scale(scale, scale);
          if (ab > 0.3) {
            // Red shifted negative perpendicular, blue shifted positive
            c.globalCompositeOperation = 'screen';
            c.fillStyle = `rgba(${fr},30,30,0.65)`;
            c.fillText(glyph, -CELL / 2 - ab, -CELL / 2);
            c.fillStyle = `rgba(30,${fg},${fb},0.65)`;
            c.fillText(glyph, -CELL / 2 + ab, -CELL / 2);
            c.globalCompositeOperation = 'source-over';
            c.fillStyle = themedStyle;
            c.fillText(glyph, -CELL / 2, -CELL / 2);
          } else {
            c.shadowColor = themedStyle;
            c.shadowBlur = 3 * lensP;
            c.fillStyle = themedStyle;
            c.fillText(glyph, -CELL / 2, -CELL / 2);
          }
          c.restore();
          break;
        }
      }
    }
  }
}

function startHoverLoop() {
  if (hoverRaf !== null) return;
  const tick = () => {
    if (!hoverActive || S.hoverMode === 'none' || S.hoverMode === 'tilt' || !hoverPx || !hoverPxSm) {
      hoverRaf = null;
      return;
    }
    // User-controlled smoothing factor (5 = very lazy follow, 100 = instant)
    const SMOOTH = S.hoverSmooth / 100;
    const prevX = hoverPxSm.x;
    const prevY = hoverPxSm.y;
    hoverPxSm.x += (hoverPx.x - hoverPxSm.x) * SMOOTH;
    hoverPxSm.y += (hoverPx.y - hoverPxSm.y) * SMOOTH;
    const v = Math.hypot(hoverPxSm.x - prevX, hoverPxSm.y - prevY);
    hoverVel += (v - hoverVel) * 0.3;

    // If 'idle' is OFF and cursor has barely moved + effect isn't animated-by-time,
    // skip redraw to save CPU when the user wants the effect to settle.
    const TIMED_MODES = new Set([
      'wave', 'glitch', 'comet', 'particles', 'vortex', 'levitate',
      'plasma', 'aurora', 'shockwave', 'lightning',
      'mask-paint', 'mask-trail', 'mask-erase',   // these animate via fade-out timers
    ]);
    if (S.hoverIdle || TIMED_MODES.has(S.hoverMode) || v > 0.05) {
      if (M.progress > 0 && M.progress < 1) renderAtProgress(M.progress);
      else renderFrame(currentFrame);
    }

    hoverRaf = requestAnimationFrame(tick);
  };
  hoverRaf = requestAnimationFrame(tick);
}

function setCanvasSize(c: HTMLCanvasElement, c2: CanvasRenderingContext2D, cssW: number, cssH: number) {
  c.width  = Math.round(cssW * DPR);
  c.height = Math.round(cssH * DPR);
  c.style.width  = `${cssW}px`;
  c.style.height = `${cssH}px`;
  c2.setTransform(DPR, 0, 0, DPR, 0, 0);
}

function renderFrame(fi: number) {
  if (!asciiFrames.length) return;
  const frame = asciiFrames[Math.min(fi, asciiFrames.length - 1)];
  if (!frame) return;

  const lines = frame.text.split('\n');
  const rows  = lines.length;
  const cols  = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const cw    = cols * CELL;
  const ch    = rows * CELL;

  setCanvasSize(canvasEl, ctx, cw, ch);
  const pal = getPalette();
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, cw, ch);
  ctx.font = `${CELL}px 'SF Mono','Menlo','Consolas',monospace`;
  ctx.textBaseline = 'top';
  ctx.textRendering = 'geometricPrecision' as any;
  (ctx as any).imageSmoothingEnabled = true;

  for (let row = 0; row < rows; row++) {
    const line = lines[row];
    for (let col = 0; col < line.length; col++) {
      const glyph = line[col];
      if (glyph === ' ') continue;
      if (frame.colors) {
        const o = (row * frame.columns + col) * 3;
        ctx.fillStyle = pal.fgFn(frame.colors[o], frame.colors[o+1], frame.colors[o+2]);
      } else {
        ctx.fillStyle = pal.fgFn(230, 230, 230);
      }
      ctx.fillText(glyph, col * CELL, row * CELL);
    }
  }

  drawOverlay(ctx, cw, ch);
  drawHoverEffect(ctx, frame, cw, ch);
  applyZoom(zoomPct);
  frameLabel.textContent = `${fi + 1} / ${asciiFrames.length}`;
  frameSlider.value = String(fi);
  syncCompare();
}

// ── Regular animation playback ────────────────────────────────────────────────

function startAnim() {
  if (playing || asciiFrames.length < 2) return;
  playing = true;
  playBtn.textContent = '⏸';
  tick();
}

function stopAnim() {
  playing = false;
  if (animTimer !== null) { clearTimeout(animTimer); animTimer = null; }
  playBtn.textContent = '▶';
}

function tick() {
  if (!playing || !asciiFrames.length) return;
  renderFrame(currentFrame);
  const delay = (rawDelays[currentFrame] ?? 10) * 10;
  currentFrame = (currentFrame + 1) % asciiFrames.length;
  animTimer = setTimeout(tick, delay) as unknown as number;
}

playBtn.addEventListener('click', () => {
  if (M.active) return; // mask owns the canvas
  if (playing) stopAnim(); else startAnim();
});

frameSlider.addEventListener('input', () => {
  if (M.active) return;
  stopAnim();
  currentFrame = parseInt(frameSlider.value);
  renderFrame(currentFrame);
});

// ── Mask reveal — scrubber-driven, cell-based ────────────────────────────────

// Deterministic noise: stable per position
function noise(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// Per-cell normalized position along the chosen direction (0=enters first, 1=enters last)
function cellPosition(row: number, col: number, rows: number, cols: number, dir: Direction): number {
  const Rmax = Math.max(1, rows - 1);
  const Cmax = Math.max(1, cols - 1);

  // Custom origin override (for radial directions)
  const origin = M.origin;
  const cx = origin ? origin.col : Cmax / 2;
  const cy = origin ? origin.row : Rmax / 2;
  // Max distance from origin to any corner
  const maxDist = Math.max(
    Math.hypot(cx, cy),
    Math.hypot(Cmax - cx, cy),
    Math.hypot(cx, Rmax - cy),
    Math.hypot(Cmax - cx, Rmax - cy),
  );

  switch (dir) {
    case 'lr':         return col / Cmax;
    case 'rl':         return (Cmax - col) / Cmax;
    case 'tb':         return row / Rmax;
    case 'bt':         return (Rmax - row) / Rmax;
    case 'tl-br':      return (col + row) / (Cmax + Rmax);
    case 'tr-bl':      return ((Cmax - col) + row) / (Cmax + Rmax);
    case 'bl-tr':      return (col + (Rmax - row)) / (Cmax + Rmax);
    case 'br-tl':      return ((Cmax - col) + (Rmax - row)) / (Cmax + Rmax);
    case 'radial-out': return Math.hypot(col - cx, row - cy) / Math.max(0.001, maxDist);
    case 'radial-in':  return 1 - Math.hypot(col - cx, row - cy) / Math.max(0.001, maxDist);
    case 'random':     return noise(row * 31.7 + col * 17.3 + 5.1);
    case 'diag-stripes': {
      const stripeIdx = Math.floor((col + row) / 4);
      return (stripeIdx % 8) / 8 + ((col + row) % 4) / 32;
    }
    case 'multi-front': {
      // Two fronts: from L and R, meeting at center
      const fromL = col / Cmax;
      const fromR = (Cmax - col) / Cmax;
      return Math.min(fromL, fromR) * 2; // 0 at edges, ~1 at center
    }
    case 'paint': {
      if (!M.paintTimings || M.paintCount === 0) return 0;
      const k = row * cols + col;
      const t = M.paintTimings.get(k);
      return t === undefined ? 0 : t / Math.max(1, M.paintCount - 1);
    }
  }
}

function applyEasing(p: number, e: Easing): number {
  p = Math.max(0, Math.min(1, p));
  switch (e) {
    case 'in':     return p * p;
    case 'out':    return 1 - (1 - p) * (1 - p);
    case 'in-out': return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    case 'step':   return Math.floor(p * 8) / 8;
    case 'exp':    return p === 0 ? 0 : Math.pow(2, 10 * p - 10);
    default:       return p;
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// Render the mask at a given progress (0 = initial state, 1 = final state)
// Reverse mode flips the meaning so: 0 = visible, 1 = hidden
function renderAtProgress(p: number) {
  const frame = asciiFrames[currentFrame] || asciiFrames[0];
  if (!frame) return;

  // Effective progress for rendering — reverse swaps the endpoints
  const effP = M.reverse ? (1 - p) : p;

  if (effP <= 0) {
    // Blank canvas (or "fully hidden" in normal mode = blank, "fully revealed" in reverse = the frame)
    const cols = frame.text.split('\n').reduce((m, l) => Math.max(m, l.length), 0);
    const rows = frame.text.split('\n').length;
    setCanvasSize(canvasEl, ctx, cols * CELL, rows * CELL);
    const pal = getPalette();
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, cols * CELL, rows * CELL);
    drawOverlay(ctx, cols * CELL, rows * CELL);
    applyZoom(zoomPct);
    return;
  }
  if (effP >= 1) { renderFrame(currentFrame); return; }

  const totalTime = M.duration + M.flipDuration;
  renderMaskFrame(effP * totalTime, frame);
}

// Play animation: advance progress from maskPlayFrom → 1
function maskPlayTick(now: number) {
  if (maskPlayStart === null) return;
  const elapsed       = (now - maskPlayStart) / 1000;
  const totalTime     = M.duration + M.flipDuration;
  const remainingTime = (1 - maskPlayFrom) * totalTime;
  const p             = Math.min(1, maskPlayFrom + elapsed / Math.max(0.01, remainingTime));

  M.progress = p;
  maskProgressSlider.value    = String(Math.round(p * 100));
  maskProgressVal.textContent = `${Math.round(p * 100)}%`;
  renderAtProgress(p);

  if (p < 1) maskRaf = requestAnimationFrame(maskPlayTick);
  else       stopMaskPlay();
}

function stopMaskPlay() {
  if (maskRaf !== null) { cancelAnimationFrame(maskRaf); maskRaf = null; }
  maskPlayStart = null;
  btnMaskPlay.textContent = '▶ Play';
}

function stopMask() { stopMaskPlay(); }

function renderMaskFrame(t: number, frame: AsciiResult) {
  const lines = frame.text.split('\n');
  const rows  = lines.length;
  const cols  = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const cw    = cols * CELL;
  const ch    = rows * CELL;

  setCanvasSize(canvasEl, ctx, cw, ch);
  const pal = getPalette();

  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, cw, ch);
  ctx.font = `${CELL}px 'SF Mono','Menlo','Consolas',monospace`;
  ctx.textBaseline = 'top';
  ctx.textRendering = 'geometricPrecision' as any;

  const charset       = M.flipCharset || '*+=-_.';
  const jitterPhase   = Math.floor(t * 15);
  const totalRevealT  = M.duration; // last cell's tEnter at progress=1
  const flipPhase     = Math.floor(t * M.flipRate);

  // Distortion factors (0–0.5 max shift in normalized cellPos)
  const waveAmt   = M.waveAmount * 0.01; // 0..0.5
  const noiseAmt  = M.edgeNoise  * 0.01;
  const waveFreq  = Math.max(1, M.waveFreq);

  const [mr, mg, mb] = hexToRgb(M.monoColor);

  for (let row = 0; row < rows; row++) {
    const line = lines[row];
    for (let col = 0; col < line.length; col++) {
      const finalGlyph = line[col];
      if (finalGlyph === ' ') continue;

      // 1) Base position along the chosen direction
      let cp = cellPosition(row, col, rows, cols, M.direction);

      // 2) Wave: sinusoidal shift along perpendicular axis (looks wavy)
      if (waveAmt > 0) {
        // Pick perpendicular based on direction family
        let perpVal: number;
        switch (M.direction) {
          case 'lr': case 'rl':                       perpVal = row; break;
          case 'tb': case 'bt':                       perpVal = col; break;
          case 'tl-br': case 'br-tl':                 perpVal = col - row; break;
          case 'tr-bl': case 'bl-tr':                 perpVal = col + row; break;
          case 'radial-out': case 'radial-in':        perpVal = Math.atan2(row - rows / 2, col - cols / 2) * waveFreq; break;
          default:                                    perpVal = row + col; break;
        }
        cp += Math.sin((perpVal / waveFreq) * Math.PI * 2) * waveAmt;
      }

      // 3) Edge noise: random per-cell offset
      if (noiseAmt > 0) {
        cp += (noise(row * 13.7 + col * 7.3) - 0.5) * 2 * noiseAmt;
      }

      cp = Math.max(0, Math.min(1, cp));

      // 4) Easing
      const easedCp = applyEasing(cp, M.easing);

      // 5) Cell timing
      const tEnter  = easedCp * totalRevealT;
      const tSettle = tEnter + M.flipDuration;

      if (t < tEnter) continue;

      const settled  = t >= tSettle;
      const progress = settled ? 1 : (t - tEnter) / Math.max(0.001, M.flipDuration);

      // 6) Glyph
      const flipIdx  = Math.abs(flipPhase + col * 7 + row * 3) % charset.length;
      let   glyph    = settled ? finalGlyph : charset[flipIdx];
      let   drawRow  = row;

      if (!settled && M.vertJitter > 0) {
        const jit = Math.round(
          (noise(row * 37 + col * 13 + jitterPhase) - 0.5) * 2 * M.vertJitter * (1 - progress),
        );
        drawRow = Math.max(0, Math.min(rows - 1, row + jit));
      }

      // 7) Colour — apply theme palette to source colour
      const sr = frame.colors ? frame.colors[(row * frame.columns + col) * 3]     : 230;
      const sg = frame.colors ? frame.colors[(row * frame.columns + col) * 3 + 1] : 230;
      const sb = frame.colors ? frame.colors[(row * frame.columns + col) * 3 + 2] : 230;
      // Get themed final colour as RGB tuple
      const themedStyle = pal.fgFn(sr, sg, sb);
      const m = themedStyle.match(/rgb\((\d+),(\d+),(\d+)\)/);
      const fr = m ? parseInt(m[1]) : sr;
      const fg = m ? parseInt(m[2]) : sg;
      const fb = m ? parseInt(m[3]) : sb;

      let style: string;
      if (settled) {
        style = themedStyle;
      } else {
        switch (M.colorMode) {
          case 'fade-grey': {
            const r = Math.round(fr * progress + 160 * (1 - progress));
            const g = Math.round(fg * progress + 160 * (1 - progress));
            const b = Math.round(fb * progress + 160 * (1 - progress));
            style = `rgb(${r},${g},${b})`;
            break;
          }
          case 'glitch': {
            const seed = row * 13 + col * 7 + flipPhase;
            const gr   = Math.floor(noise(seed) * 255);
            const gg   = Math.floor(noise(seed + 1.5) * 255);
            const gb   = Math.floor(noise(seed + 2.7) * 255);
            style = `rgb(${gr},${gg},${gb})`;
            break;
          }
          case 'mono': {
            const r = Math.round(fr * progress + mr * (1 - progress));
            const g = Math.round(fg * progress + mg * (1 - progress));
            const b = Math.round(fb * progress + mb * (1 - progress));
            style = `rgb(${r},${g},${b})`;
            break;
          }
          case 'opacity':
            style = `rgba(${fr},${fg},${fb},${(0.25 + 0.75 * progress).toFixed(2)})`;
            break;
          case 'invert':
            style = `rgb(${255 - fr},${255 - fg},${255 - fb})`;
            break;
          default:
            style = `rgb(${fr},${fg},${fb})`;
        }
      }
      ctx.fillStyle = style;
      ctx.fillText(glyph, col * CELL, drawRow * CELL);
    }
  }

  drawOverlay(ctx, cw, ch);
  drawHoverEffect(ctx, frame, cw, ch);
  applyZoom(zoomPct);
}

// ── Zoom ──────────────────────────────────────────────────────────────────────

function applyZoom(pct: number) {
  zoomPct = pct;
  const scale = pct / 100;
  // Logical (CSS) size is canvas.width / DPR
  const logW = canvasEl.width  / DPR;
  const logH = canvasEl.height / DPR;
  canvasEl.style.width  = `${logW * scale}px`;
  canvasEl.style.height = `${logH * scale}px`;
  zoomLabel.textContent = `${pct}%`;
  positionOriginMarker();
}

zoomIn.addEventListener('click',  () => applyZoom(Math.min(400, zoomPct + 25)));
zoomOut.addEventListener('click', () => applyZoom(Math.max(10,  zoomPct - 25)));
zoomFit.addEventListener('click', () => {
  if (!canvasEl.width) return;
  const wrap = canvasWrap.getBoundingClientRect();
  const logW = canvasEl.width  / DPR;
  const logH = canvasEl.height / DPR;
  const pct  = Math.floor(Math.min(
    (wrap.width  - 48) / logW,
    (wrap.height - 48) / logH,
  ) * 100);
  applyZoom(Math.max(10, Math.min(400, pct)));
});

// ── PNG export ────────────────────────────────────────────────────────────────

btnPng.addEventListener('click', () => {
  if (!asciiFrames.length) return;
  if (maskPlayStart === null && M.progress >= 1) renderFrame(currentFrame);
  canvasEl.toBlob(blob => downloadBlob(blob!, 'ascii-art.png'), 'image/png');
});

// ── Export helpers ───────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function downloadText(text: string, filename: string, mime = 'text/plain') {
  downloadBlob(new Blob([text], { type: mime }), filename);
}
async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(`✓ ${label} copied to clipboard`, 'ok');
  } catch {
    setStatus(`Copy failed — clipboard blocked`, 'err');
  }
}

// Paint a single ASCII frame to a canvas at any cell size. Used by HD exports + video.
function paintFrameTo(c: HTMLCanvasElement, frame: AsciiResult, cellSize: number, withOverlay = true): { w: number; h: number } {
  const lines = frame.text.split('\n');
  const rows  = lines.length;
  const cols  = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const w = cols * cellSize;
  const h = rows * cellSize;
  c.width = w; c.height = h;
  const cc = c.getContext('2d', { willReadFrequently: true })!;
  const pal = getPalette();
  cc.fillStyle = pal.bg;
  cc.fillRect(0, 0, w, h);
  cc.font = `${cellSize}px 'SF Mono','Menlo','Consolas',monospace`;
  cc.textBaseline = 'top';
  (cc as any).textRendering = 'geometricPrecision';

  for (let row = 0; row < rows; row++) {
    const line = lines[row];
    for (let col = 0; col < line.length; col++) {
      const glyph = line[col];
      if (glyph === ' ') continue;
      if (frame.colors) {
        const o = (row * frame.columns + col) * 3;
        cc.fillStyle = pal.fgFn(frame.colors[o], frame.colors[o+1], frame.colors[o+2]);
      } else {
        cc.fillStyle = pal.fgFn(230, 230, 230);
      }
      cc.fillText(glyph, col * cellSize, row * cellSize);
    }
  }
  if (withOverlay) drawOverlay(cc, w, h);
  return { w, h };
}

btnTxt.addEventListener('click', () => {
  if (!asciiFrames.length) return;
  downloadText(asciiFrames[currentFrame].text, 'ascii-art.txt');
});

btnMd.addEventListener('click', () => {
  if (!asciiFrames.length) return;
  const txt = '```\n' + asciiFrames[currentFrame].text + '\n```\n';
  downloadText(txt, 'ascii-art.md', 'text/markdown');
});

btnHtml.addEventListener('click', () => {
  if (!asciiFrames.length) return;
  const f = asciiFrames[currentFrame];
  const pal = getPalette();
  const lines = f.text.split('\n');
  let out = `<pre style="background:${pal.bg};font-family:'SF Mono','Menlo',monospace;font-size:10px;line-height:1;padding:16px;margin:0;">`;
  for (let r = 0; r < lines.length; r++) {
    const line = lines[r];
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      const safe = ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '&' ? '&amp;' : ch;
      if (ch === ' ') { out += safe; continue; }
      let style = 'color:#e6e6e6';
      if (f.colors) {
        const o = (r * f.columns + c) * 3;
        style = `color:${pal.fgFn(f.colors[o], f.colors[o+1], f.colors[o+2])}`;
      }
      out += `<span style="${style}">${safe}</span>`;
    }
    out += '\n';
  }
  out += '</pre>';
  downloadText(out, 'ascii-art.html', 'text/html');
});

btnSvg.addEventListener('click', () => {
  if (!asciiFrames.length) return;
  const f = asciiFrames[currentFrame];
  const pal = getPalette();
  const lines = f.text.split('\n');
  const cw = f.columns * CELL;
  const ch = lines.length * CELL;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}" viewBox="0 0 ${cw} ${ch}">`;
  svg += `<rect width="${cw}" height="${ch}" fill="${pal.bg}"/>`;
  svg += `<g font-family="SF Mono, Menlo, Consolas, monospace" font-size="${CELL}" dominant-baseline="hanging">`;
  for (let r = 0; r < lines.length; r++) {
    for (let c = 0; c < lines[r].length; c++) {
      const ch2 = lines[r][c];
      if (ch2 === ' ') continue;
      const safe = ch2 === '<' ? '&lt;' : ch2 === '>' ? '&gt;' : ch2 === '&' ? '&amp;' : ch2;
      let fill = '#e6e6e6';
      if (f.colors) {
        const o = (r * f.columns + c) * 3;
        fill = pal.fgFn(f.colors[o], f.colors[o+1], f.colors[o+2]);
      }
      svg += `<text x="${c * CELL}" y="${r * CELL}" fill="${fill}">${safe}</text>`;
    }
  }
  svg += `</g></svg>`;
  downloadText(svg, 'ascii-art.svg', 'image/svg+xml');
});

btnAnsi.addEventListener('click', () => {
  if (!asciiFrames.length) return;
  const f = asciiFrames[currentFrame];
  const lines = f.text.split('\n');
  let out = '';
  for (let r = 0; r < lines.length; r++) {
    for (let c = 0; c < lines[r].length; c++) {
      const ch = lines[r][c];
      if (ch === ' ') { out += ' '; continue; }
      if (f.colors) {
        const o = (r * f.columns + c) * 3;
        out += `\x1b[38;2;${f.colors[o]};${f.colors[o+1]};${f.colors[o+2]}m${ch}`;
      } else out += ch;
    }
    out += '\x1b[0m\n';
  }
  out += '\x1b[0m';
  downloadText(out, 'ascii-art.ansi');
});

// ── Image format exports ─────────────────────────────────────────────────────

btnJpg.addEventListener('click', () => {
  if (!asciiFrames.length) return;
  if (M.progress >= 1 || M.progress === 0) renderFrame(currentFrame);
  canvasEl.toBlob(blob => downloadBlob(blob!, 'ascii-art.jpg'), 'image/jpeg', 0.92);
});

btnWebp.addEventListener('click', () => {
  if (!asciiFrames.length) return;
  if (M.progress >= 1 || M.progress === 0) renderFrame(currentFrame);
  canvasEl.toBlob(blob => downloadBlob(blob!, 'ascii-art.webp'), 'image/webp', 0.92);
});

function exportHiResPng(scale: number) {
  if (!asciiFrames.length) return;
  const frame = asciiFrames[currentFrame];
  const off = document.createElement('canvas');
  paintFrameTo(off, frame, CELL * scale);
  off.toBlob(blob => downloadBlob(blob!, `ascii-art@${scale}x.png`), 'image/png');
}

btnPng2x.addEventListener('click', () => exportHiResPng(2));
btnPng4x.addEventListener('click', () => exportHiResPng(4));

// ── Code-format exports ──────────────────────────────────────────────────────

function buildCurrentText(): string {
  if (!asciiFrames.length) return '';
  return asciiFrames[currentFrame].text;
}

btnCopy.addEventListener('click', () => copyText(buildCurrentText(), 'ASCII'));

btnJson.addEventListener('click', () => {
  if (!asciiFrames.length) return;
  const f = asciiFrames[currentFrame];
  const payload = {
    version:   '1.0',
    generator: 'ASCII Studio',
    timestamp: new Date().toISOString(),
    settings: {
      S,
      M: { ...M, paintTimings: M.paintTimings ? Array.from(M.paintTimings.entries()) : null },
    },
    frame: {
      text:    f.text,
      columns: f.columns,
      rows:    f.rows,
      colors:  f.colors ? Array.from(f.colors) : null,
    },
    frameCount: asciiFrames.length,
  };
  downloadText(JSON.stringify(payload, null, 2), 'ascii-project.json', 'application/json');
});

btnPy.addEventListener('click', () => {
  if (!asciiFrames.length) return;
  const f = asciiFrames[currentFrame];
  // Escape triple quotes in content (very rare in ASCII art but possible)
  const safe = f.text.replace(/"""/g, '\\"""');
  const py = `#!/usr/bin/env python3
# Generated by ASCII Studio — ${new Date().toISOString().slice(0, 10)}
# Size: ${f.columns} × ${f.rows} chars
art = """\\
${safe}
"""

if __name__ == "__main__":
    print(art)
`;
  downloadText(py, 'ascii_art.py', 'text/x-python');
});

btnCpp.addEventListener('click', () => {
  if (!asciiFrames.length) return;
  const f = asciiFrames[currentFrame];
  const lines = f.text.split('\n').map(l =>
    '    "' + l.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '",'
  );
  const cpp = `// Generated by ASCII Studio — ${new Date().toISOString().slice(0, 10)}
// Size: ${f.columns} × ${f.rows} chars

#include <stdio.h>

const char* ascii_art[] = {
${lines.join('\n')}
    nullptr
};

int main(void) {
    for (int i = 0; ascii_art[i] != nullptr; ++i) {
        puts(ascii_art[i]);
    }
    return 0;
}
`;
  downloadText(cpp, 'ascii_art.cpp', 'text/x-c++src');
});

btnJs.addEventListener('click', () => {
  if (!asciiFrames.length) return;
  const f = asciiFrames[currentFrame];
  const text = f.text.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  const js = `// Generated by ASCII Studio — ${new Date().toISOString().slice(0, 10)}
// Self-contained canvas snippet — drop into any HTML page.
// Usage: <canvas id="ascii"></canvas>  + this script.

(function renderAscii() {
  const CELL = 9;
  const text = \`${text}\`;
  const colors = ${f.colors ? '[' + Array.from(f.colors).join(',') + ']' : 'null'};
  const cols = ${f.columns};
  const rows = ${f.rows};

  const c = document.getElementById('ascii');
  c.width  = cols * CELL;
  c.height = rows * CELL;
  const x = c.getContext('2d');
  x.fillStyle = '#0a0a0c';
  x.fillRect(0, 0, c.width, c.height);
  x.font = CELL + "px 'SF Mono','Menlo','Consolas',monospace";
  x.textBaseline = 'top';

  const lines = text.split('\\n');
  for (let r = 0; r < lines.length; r++) {
    for (let cc = 0; cc < lines[r].length; cc++) {
      const ch = lines[r][cc];
      if (ch === ' ') continue;
      if (colors) {
        const o = (r * cols + cc) * 3;
        x.fillStyle = 'rgb(' + colors[o] + ',' + colors[o+1] + ',' + colors[o+2] + ')';
      } else {
        x.fillStyle = '#e6e6e6';
      }
      x.fillText(ch, cc * CELL, r * CELL);
    }
  }
})();
`;
  downloadText(js, 'ascii_art.js', 'application/javascript');
});

// ── Video exports (WebM / MP4) via MediaRecorder ─────────────────────────────

async function exportVideo(mime: string, ext: string, fallbackBtn: HTMLButtonElement) {
  if (asciiFrames.length < 2) return;
  if (!MediaRecorder.isTypeSupported(mime)) {
    setStatus(`${ext.toUpperCase()} not supported by this browser — try WebM`, 'err');
    return;
  }
  fallbackBtn.disabled = true;
  const originalText = fallbackBtn.textContent;
  fallbackBtn.textContent = '⏳ Encoding…';
  setStatus(`Encoding ${ext.toUpperCase()}…`);

  try {
    // Off-screen canvas for video frames
    const out = document.createElement('canvas');
    const cellSize = Math.max(6, S.gifCell + 2);  // a bit larger than GIF cell for crisper video

    // Pre-render first frame to size canvas
    paintFrameTo(out, asciiFrames[0], cellSize);

    const stream = (out as any).captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

    const stopped = new Promise<void>(r => { recorder.onstop = () => r(); });

    recorder.start();

    // Render each frame with its real delay
    for (let i = 0; i < asciiFrames.length; i++) {
      paintFrameTo(out, asciiFrames[i], cellSize);
      const delayMs = (rawDelays[i] ?? 10) * 10;  // centiseconds → ms
      await new Promise(r => setTimeout(r, Math.max(33, delayMs))); // min 30fps step
    }
    // Two extra frames at the end so the last frame is fully captured
    await new Promise(r => setTimeout(r, 200));

    recorder.stop();
    await stopped;

    const blob = new Blob(chunks, { type: mime });
    downloadBlob(blob, `ascii-animation.${ext}`);
    setStatus(`✓ ${ext.toUpperCase()} saved`, 'ok');
  } catch (err) {
    setStatus((err as Error).message || `${ext} export failed`, 'err');
  } finally {
    fallbackBtn.disabled = false;
    fallbackBtn.textContent = originalText;
  }
}

btnWebm.addEventListener('click', () => exportVideo('video/webm;codecs=vp9', 'webm', btnWebm));
btnMp4.addEventListener('click', () => {
  // Try mp4 with various codec strings — browser support is patchy
  const candidates = ['video/mp4;codecs=h264', 'video/mp4;codecs=avc1', 'video/mp4'];
  const supported = candidates.find(c => MediaRecorder.isTypeSupported(c));
  if (!supported) {
    setStatus('MP4 not supported by this browser — use WebM instead', 'err');
    return;
  }
  exportVideo(supported, 'mp4', btnMp4);
});

// ── Animated SVG export (SMIL) ───────────────────────────────────────────────

btnAniSvg.addEventListener('click', () => {
  if (asciiFrames.length < 2) return;
  const f0 = asciiFrames[0];
  const lines0 = f0.text.split('\n');
  const cw = f0.columns * CELL;
  const ch = lines0.length * CELL;
  const pal = getPalette();

  // Total animation duration in seconds
  const totalSec = rawDelays.reduce((s, d) => s + d / 100, 0) || asciiFrames.length / 12;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}" viewBox="0 0 ${cw} ${ch}">`;
  svg += `<rect width="${cw}" height="${ch}" fill="${pal.bg}"/>`;
  svg += `<style>g.f{opacity:0}</style>`;
  svg += `<g font-family="SF Mono, Menlo, Consolas, monospace" font-size="${CELL}" dominant-baseline="hanging">`;

  // Build a <g class="f"> for each frame
  let cumT = 0;
  for (let fi = 0; fi < asciiFrames.length; fi++) {
    const f = asciiFrames[fi];
    const dur = (rawDelays[fi] ?? 10) / 100; // seconds for this frame
    svg += `<g class="f">`;
    const lines = f.text.split('\n');
    for (let r = 0; r < lines.length; r++) {
      for (let c = 0; c < lines[r].length; c++) {
        const ch2 = lines[r][c];
        if (ch2 === ' ') continue;
        const safe = ch2 === '<' ? '&lt;' : ch2 === '>' ? '&gt;' : ch2 === '&' ? '&amp;' : ch2;
        let fill = '#e6e6e6';
        if (f.colors) {
          const o = (r * f.columns + c) * 3;
          fill = pal.fgFn(f.colors[o], f.colors[o + 1], f.colors[o + 2]);
        }
        svg += `<text x="${c * CELL}" y="${r * CELL}" fill="${fill}">${safe}</text>`;
      }
    }
    // Show this group only between cumT and cumT+dur
    svg += `<set attributeName="opacity" to="1" begin="${cumT.toFixed(3)}s" dur="${dur.toFixed(3)}s" fill="freeze"/>`;
    svg += `<set attributeName="opacity" to="0" begin="${(cumT + dur).toFixed(3)}s" fill="freeze"/>`;
    svg += `</g>`;
    cumT += dur;
  }
  // Loop: restart all <set>s from the beginning after totalSec
  // Simplest cross-browser loop is a master <animate> ... but each <set> already uses absolute begin.
  // Wrap everything in a group with a repeating animation that resets opacity cycle:
  svg += `</g></svg>`;
  downloadText(svg, 'ascii-animation.svg', 'image/svg+xml');
});

// ── Interactive HTML export (with baked-in hover effects) ────────────────────

btnHtmlInteractive.addEventListener('click', () => {
  if (!asciiFrames.length) return;
  const f = asciiFrames[currentFrame];
  const pal = getPalette();
  const lines = f.text.split('\n');
  const cw = f.columns * CELL;
  const ch = lines.length * CELL;
  const hoverMode = S.hoverMode === 'none' ? 'glow' : S.hoverMode; // always include something
  const radius = S.hoverRadius;
  const strength = S.hoverStrength / 100;

  // Build spans with row/col data + final color
  let spans = '';
  for (let r = 0; r < lines.length; r++) {
    const line = lines[r];
    let lineSpans = '';
    for (let c = 0; c < line.length; c++) {
      const ch2 = line[c];
      const safe = ch2 === '<' ? '&lt;' : ch2 === '>' ? '&gt;' : ch2 === '&' ? '&amp;' : ch2 === ' ' ? '&nbsp;' : ch2;
      let style = 'color:#e6e6e6';
      if (f.colors) {
        const o = (r * f.columns + c) * 3;
        style = `color:${pal.fgFn(f.colors[o], f.colors[o + 1], f.colors[o + 2])}`;
      }
      lineSpans += `<i data-r="${r}" data-c="${c}" style="${style}">${safe}</i>`;
    }
    spans += `<div class="row">${lineSpans}</div>`;
  }

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>ASCII Art — Interactive</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    min-height: 100vh;
    background: ${pal.bg};
    display: flex; align-items: center; justify-content: center;
    padding: 40px 20px;
    font-family: 'SF Mono','Menlo','Consolas',monospace;
  }
  .ascii {
    display: inline-block;
    line-height: 1;
    user-select: none;
  }
  .ascii .row { display: block; height: ${CELL}px; line-height: ${CELL}px; white-space: nowrap; }
  .ascii i {
    display: inline-block;
    width: ${CELL}px;
    height: ${CELL}px;
    font-size: ${CELL}px;
    font-style: normal;
    text-align: left;
    transition: transform 0.18s ease-out, text-shadow 0.18s ease-out, filter 0.18s ease-out;
    transform-origin: center;
    will-change: transform;
  }
  .ascii i:hover { color: #fff; }
  /* Hover effect: ${hoverMode} */
  ${hoverMode === 'glow' ? `
  .ascii i.fx {
    text-shadow: 0 0 ${4 * strength}px currentColor, 0 0 ${10 * strength}px currentColor;
    filter: brightness(${1 + strength * 0.5});
  }` : ''}
  ${hoverMode === 'scale' ? `
  .ascii i.fx { transform: scale(var(--scale, 1)); }` : ''}
  ${hoverMode === 'wave' ? `
  @keyframes asc-wave { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-${4 * strength}px); } }
  .ascii i.fx { animation: asc-wave 0.6s ease-out; }` : ''}
  ${hoverMode === 'magnet' ? `
  .ascii i.fx { transform: translate(var(--dx, 0), var(--dy, 0)); }` : ''}
  ${hoverMode === 'invert' ? `
  .ascii i.fx { filter: invert(1); }` : ''}
  .signature {
    position: fixed; bottom: 16px; right: 16px;
    font: 11px/1.4 'SF Mono',monospace;
    color: ${pal.fgFn(150,150,150)};
    opacity: 0.5;
  }
  .signature a { color: inherit; text-decoration: underline; }
</style>
</head>
<body>
  <div class="ascii" id="art" aria-label="Interactive ASCII art">${spans}</div>
  <div class="signature">made with <a href="https://yashsaindane.github.io/ascii-studio/" target="_blank">ASCII Studio</a></div>
<script>
(function () {
  var art = document.getElementById('art');
  var cells = Array.prototype.slice.call(art.querySelectorAll('i'));
  var radius = ${radius};
  var mode = ${JSON.stringify(hoverMode)};
  var strength = ${strength};

  // Index cells by row,col for fast lookup
  var grid = {};
  cells.forEach(function (el) {
    grid[el.dataset.r + ':' + el.dataset.c] = el;
  });

  function clearAll() {
    cells.forEach(function (el) {
      el.classList.remove('fx');
      el.style.removeProperty('--scale');
      el.style.removeProperty('--dx');
      el.style.removeProperty('--dy');
    });
  }

  art.addEventListener('mousemove', function (e) {
    var target = e.target;
    if (target.tagName !== 'I') return;
    var hr = +target.dataset.r;
    var hc = +target.dataset.c;
    clearAll();
    cells.forEach(function (el) {
      var dr = +el.dataset.r - hr;
      var dc = +el.dataset.c - hc;
      var dist = Math.hypot(dr, dc);
      if (dist > radius) return;
      var prox = 1 - dist / radius; // 0..1
      el.classList.add('fx');
      if (mode === 'scale') el.style.setProperty('--scale', String(1 + prox * strength * 0.7));
      if (mode === 'magnet') {
        el.style.setProperty('--dx', (-dc * prox * strength * 4) + 'px');
        el.style.setProperty('--dy', (-dr * prox * strength * 4) + 'px');
      }
    });
  });

  art.addEventListener('mouseleave', clearAll);
})();
</script>
</body>
</html>`;
  downloadText(html, 'ascii-art-interactive.html', 'text/html');
});

// ── Lottie JSON export ───────────────────────────────────────────────────────
// Generates a Lottie schema (Bodymovin v5.7.4) that can be imported into:
// Rive, Figma, After Effects, Webflow, Framer, lottie-web, Lottielab, etc.
// One text layer per frame with on/off visibility windows.

btnLottie.addEventListener('click', () => {
  if (asciiFrames.length < 2) return;
  const FR = 24;                           // frames per second
  const totalSec  = asciiFrames.reduce((s, _f, i) => s + (rawDelays[i] ?? 10) / 100, 0);
  const totalDur  = Math.max(1, Math.round(totalSec * FR));
  const f0 = asciiFrames[0];
  const W = f0.columns * CELL;
  const H = f0.rows    * CELL;
  const pal = getPalette();
  // Parse the theme bg as RGB 0..1 for Lottie
  function hexToLottieRgb(hex: string): number[] {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255, 1];
  }
  const bgColor = hexToLottieRgb(pal.bg.startsWith('#') ? pal.bg : '#0a0a0e');

  // Build per-frame text layers
  const layers: any[] = [];
  let cum = 0;
  for (let i = 0; i < asciiFrames.length; i++) {
    const f = asciiFrames[i];
    const dur = (rawDelays[i] ?? 10) / 100;
    const inFr  = Math.round(cum * FR);
    const outFr = Math.round((cum + dur) * FR);
    cum += dur;
    layers.push({
      ddd: 0,
      ind: i + 2,
      ty: 5,                 // text layer
      nm: `Frame ${i + 1}`,
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [0, 0, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      ao: 0,
      t: {
        d: { k: [{
          s: {
            sz:  [W, H],
            ps:  [0, 0],
            s:   CELL,                    // size in px
            f:   'SFMono-Regular',        // font
            t:   f.text,                  // text content
            ca:  0,
            j:   0,
            tr:  0,
            lh:  CELL,
            ls:  0,
            fc:  [0.9, 0.9, 0.9],         // fill color
          },
          t: 0,
        }] },
        p: {}, m: { g: 1, a: { a: 0, k: [0, 0] } }, a: [],
      },
      ip: inFr,
      op: outFr,
      st: 0,
      bm: 0,
    });
  }

  // Background solid (layer 1)
  layers.unshift({
    ddd: 0,
    ind: 1,
    ty: 1,                   // solid layer
    nm: 'BG',
    sr: 1,
    ks: {
      o: { a: 0, k: 100 },
      r: { a: 0, k: 0 },
      p: { a: 0, k: [W / 2, H / 2, 0] },
      a: { a: 0, k: [W / 2, H / 2, 0] },
      s: { a: 0, k: [100, 100, 100] },
    },
    ao: 0, sw: W, sh: H,
    sc: pal.bg.startsWith('#') ? pal.bg : '#0a0a0e',
    ip: 0, op: totalDur, st: 0, bm: 0,
  });

  const lottie = {
    v: '5.7.4',
    fr: FR,
    ip: 0,
    op: totalDur,
    w:  W,
    h:  H,
    nm: 'ASCII Studio Animation',
    ddd: 0,
    assets: [],
    fonts: { list: [{ origin: 0, fPath: '', fClass: '', fFamily: 'SF Mono', fWeight: '', fStyle: 'Regular', fName: 'SFMono-Regular', ascent: 75 }] },
    layers,
    markers: [],
    meta: { g: 'ASCII Studio by Yash Saindane', a: 'Yash Saindane', d: 'Generated ' + new Date().toISOString() },
  };

  downloadText(JSON.stringify(lottie, null, 2), 'ascii-animation.lottie.json', 'application/json');
  setStatus('✓ Lottie JSON saved — import into Rive / Figma / After Effects', 'ok');
});

// ── Mask reveal → GIF ─────────────────────────────────────────────────────────

btnExportRevealGif.addEventListener('click', async () => {
  if (!asciiFrames.length) return;
  btnExportRevealGif.disabled = true;
  btnExportRevealGif.textContent = '⏳ Encoding…';
  setStatus('Baking reveal GIF…');
  try {
    await exportMaskRevealGif();
    setStatus('✓ Reveal GIF saved!', 'ok');
  } catch (err) {
    setStatus((err as Error).message || 'Reveal GIF failed', 'err');
  } finally {
    btnExportRevealGif.disabled = false;
    btnExportRevealGif.textContent = '▶ Export Reveal GIF';
  }
});

async function exportMaskRevealGif() {
  const frame = asciiFrames[currentFrame] || asciiFrames[0];
  if (!frame) return;

  const GC = S.gifCell;
  const lines = frame.text.split('\n');
  const cols = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const rows = lines.length;
  const w = cols * GC;
  const h = rows * GC;

  const pal = getPalette();

  // Off-screen canvas at GIF cell size
  const off = document.createElement('canvas');
  off.width = w; off.height = h;
  const oc = off.getContext('2d', { willReadFrequently: true })!;
  oc.font = `${GC}px 'SF Mono','Menlo',monospace`;
  oc.textBaseline = 'top';
  (oc as any).textRendering = 'geometricPrecision';

  const FPS         = 24;
  const totalTime   = M.duration + M.flipDuration;
  const totalFrames = Math.max(2, Math.ceil(totalTime * FPS));
  const HOLD_END    = 12; // ~0.5s hold on final
  const charset     = M.flipCharset || '*+=-_.';
  const [mr, mg, mb] = hexToRgb(M.monoColor);

  // Render one mask frame to the off-screen canvas
  function renderTo(t: number) {
    oc.fillStyle = pal.bg;
    oc.fillRect(0, 0, w, h);

    const flipPhase  = Math.floor(t * M.flipRate);
    const jitterPhase = Math.floor(t * 15);
    const waveAmt    = M.waveAmount * 0.01;
    const noiseAmt   = M.edgeNoise  * 0.01;
    const waveFreq   = Math.max(1, M.waveFreq);

    for (let row = 0; row < rows; row++) {
      const line = lines[row];
      for (let col = 0; col < line.length; col++) {
        const finalGlyph = line[col];
        if (finalGlyph === ' ') continue;

        let cp = cellPosition(row, col, rows, cols, M.direction);
        if (waveAmt > 0) {
          let perp = row;
          switch (M.direction) {
            case 'tb': case 'bt': perp = col; break;
            case 'tl-br': case 'br-tl': perp = col - row; break;
            case 'tr-bl': case 'bl-tr': perp = col + row; break;
            case 'radial-out': case 'radial-in': perp = Math.atan2(row - rows / 2, col - cols / 2) * waveFreq; break;
          }
          cp += Math.sin((perp / waveFreq) * Math.PI * 2) * waveAmt;
        }
        if (noiseAmt > 0) cp += (noise(row * 13.7 + col * 7.3) - 0.5) * 2 * noiseAmt;
        cp = Math.max(0, Math.min(1, cp));
        const easedCp = applyEasing(cp, M.easing);
        const tEnter  = easedCp * M.duration;
        const tSettle = tEnter + M.flipDuration;
        if (t < tEnter) continue;

        const settled  = t >= tSettle;
        const progress = settled ? 1 : (t - tEnter) / Math.max(0.001, M.flipDuration);
        const flipIdx  = Math.abs(flipPhase + col * 7 + row * 3) % charset.length;
        let glyph    = settled ? finalGlyph : charset[flipIdx];
        let drawRow  = row;

        if (!settled && M.vertJitter > 0) {
          const jit = Math.round((noise(row * 37 + col * 13 + jitterPhase) - 0.5) * 2 * M.vertJitter * (1 - progress));
          drawRow = Math.max(0, Math.min(rows - 1, row + jit));
        }

        const sr = frame.colors ? frame.colors[(row * frame.columns + col) * 3]     : 230;
        const sg = frame.colors ? frame.colors[(row * frame.columns + col) * 3 + 1] : 230;
        const sb = frame.colors ? frame.colors[(row * frame.columns + col) * 3 + 2] : 230;
        const themedStyle = pal.fgFn(sr, sg, sb);
        const m = themedStyle.match(/rgb\((\d+),(\d+),(\d+)\)/);
        const fr = m ? parseInt(m[1]) : sr;
        const fg = m ? parseInt(m[2]) : sg;
        const fb = m ? parseInt(m[3]) : sb;

        let style: string;
        if (settled) style = themedStyle;
        else {
          switch (M.colorMode) {
            case 'fade-grey': style = `rgb(${Math.round(fr*progress+160*(1-progress))},${Math.round(fg*progress+160*(1-progress))},${Math.round(fb*progress+160*(1-progress))})`; break;
            case 'glitch':    { const s2 = row*13+col*7+flipPhase; style = `rgb(${Math.floor(noise(s2)*255)},${Math.floor(noise(s2+1.5)*255)},${Math.floor(noise(s2+2.7)*255)})`; break; }
            case 'mono':      style = `rgb(${Math.round(fr*progress+mr*(1-progress))},${Math.round(fg*progress+mg*(1-progress))},${Math.round(fb*progress+mb*(1-progress))})`; break;
            case 'opacity':   style = `rgba(${fr},${fg},${fb},${(0.25 + 0.75 * progress).toFixed(2)})`; break;
            case 'invert':    style = `rgb(${255-fr},${255-fg},${255-fb})`; break;
            default:          style = themedStyle;
          }
        }
        oc.fillStyle = style;
        oc.fillText(glyph, col * GC, drawRow * GC);
      }
    }
    drawOverlay(oc, w, h);
  }

  // Sample a mid-frame for global palette
  renderTo(totalTime * 0.5);
  const palData = new Uint8Array(oc.getImageData(0, 0, w, h).data.buffer);
  const gpal = quantize(palData, 256);

  const encoder = GIFEncoder({ repeat: 0 });
  const frameDelay = Math.round(100 / FPS); // centiseconds

  for (let i = 0; i < totalFrames; i++) {
    const p = i / (totalFrames - 1);
    const effP = M.reverse ? (1 - p) : p;
    renderTo(effP * totalTime);
    const data = new Uint8Array(oc.getImageData(0, 0, w, h).data.buffer);
    encoder.writeFrame(applyPalette(data, gpal), w, h, { palette: gpal, delay: frameDelay });
    if (i % 6 === 0) await new Promise(r => setTimeout(r, 0)); // yield
  }

  // Hold on final state
  const finalP = M.reverse ? 0 : 1;
  renderTo(finalP * totalTime);
  const finalData = new Uint8Array(oc.getImageData(0, 0, w, h).data.buffer);
  for (let i = 0; i < HOLD_END; i++) {
    encoder.writeFrame(applyPalette(finalData, gpal), w, h, { palette: gpal, delay: frameDelay });
  }

  encoder.finish();
  downloadBlob(new Blob([encoder.bytes()], { type: 'image/gif' }), 'ascii-reveal.gif');
}

// ── GIF export ────────────────────────────────────────────────────────────────

btnGif.addEventListener('click', async () => {
  if (asciiFrames.length < 2) return;
  btnGif.disabled = true;
  btnGif.textContent = 'Encoding…';
  setStatus('Encoding GIF…');
  try {
    await exportGif();
    setStatus('✓ GIF saved!', 'ok');
  } catch (err) {
    setStatus((err as Error).message || 'GIF failed', 'err');
  } finally {
    btnGif.disabled = false;
    btnGif.textContent = 'Export GIF';
  }
});

async function exportGif() {
  const GC = S.gifCell;
  const f0 = asciiFrames[0];
  const w  = f0.columns * GC;
  const h  = f0.rows    * GC;

  const asc = document.createElement('canvas');
  asc.width = w; asc.height = h;
  const ac = asc.getContext('2d', { willReadFrequently: true })!;
  ac.font = `${GC}px 'SF Mono','Menlo',monospace`;
  ac.textBaseline = 'top';

  let orig: HTMLCanvasElement | null = null;
  if (S.smoothMerge && rawFrames.length > 0) {
    const tmp = document.createElement('canvas');
    tmp.width = rawFrames[0].width; tmp.height = rawFrames[0].height;
    tmp.getContext('2d')!.putImageData(rawFrames[0], 0, 0);
    orig = document.createElement('canvas');
    orig.width = w; orig.height = h;
    const oc = orig.getContext('2d')!;
    oc.fillStyle = '#0a0a0c'; oc.fillRect(0, 0, w, h);
    oc.drawImage(tmp, 0, 0, w, h);
  }

  const blend = document.createElement('canvas');
  blend.width = w; blend.height = h;
  const bc = blend.getContext('2d', { willReadFrequently: true })!;

  const encoder = GIFEncoder({ repeat: 0 });

  function drawAscii(frame: AsciiResult) {
    ac.fillStyle = '#0a0a0c'; ac.fillRect(0, 0, w, h);
    const lines = frame.text.split('\n');
    for (let r = 0; r < lines.length; r++) {
      for (let c = 0; c < lines[r].length; c++) {
        const ch = lines[r][c]; if (ch === ' ') continue;
        ac.fillStyle = frame.colors
          ? `rgb(${frame.colors[(r * frame.columns + c) * 3]},${frame.colors[(r * frame.columns + c) * 3 + 1]},${frame.colors[(r * frame.columns + c) * 3 + 2]})`
          : '#e6e6e6';
        ac.fillText(ch, c * GC, r * GC);
      }
    }
  }

  function rgba(src: HTMLCanvasElement) {
    return new Uint8Array(src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data.buffer);
  }

  if (orig) {
    drawAscii(asciiFrames[0]);
    bc.clearRect(0, 0, w, h);
    bc.globalAlpha = 1;   bc.drawImage(asc,  0, 0);
    bc.globalAlpha = 0.5; bc.drawImage(orig, 0, 0);
    bc.globalAlpha = 1;
    const gpal = quantize(rgba(blend), 256);

    const enc = (src: HTMLCanvasElement, delay: number) => {
      const r = rgba(src);
      encoder.writeFrame(applyPalette(r, gpal), w, h, { palette: gpal, delay });
    };

    const STEPS = S.blendSteps, HOLD = S.holdFrames, DELAY = rawDelays[0] ?? 10;
    let fi = 0;
    for (let i = 0; i < HOLD; i++)           { enc(orig, 10); fi++; }
    for (let i = STEPS; i >= 1; i--) {
      drawAscii(asciiFrames[fi % asciiFrames.length]);
      bc.clearRect(0, 0, w, h);
      bc.globalAlpha = 1; bc.drawImage(asc, 0, 0);
      bc.globalAlpha = i / STEPS; bc.drawImage(orig, 0, 0); bc.globalAlpha = 1;
      enc(blend, DELAY); fi++;
    }
    for (let i = 0; i < asciiFrames.length; i++) {
      drawAscii(asciiFrames[fi % asciiFrames.length]);
      enc(asc, rawDelays[fi % asciiFrames.length] ?? 10); fi++;
    }
    for (let i = 1; i <= STEPS; i++) {
      drawAscii(asciiFrames[fi % asciiFrames.length]);
      bc.clearRect(0, 0, w, h);
      bc.globalAlpha = 1; bc.drawImage(asc, 0, 0);
      bc.globalAlpha = i / STEPS; bc.drawImage(orig, 0, 0); bc.globalAlpha = 1;
      enc(blend, DELAY); fi++;
    }
  } else {
    for (let fi = 0; fi < asciiFrames.length; fi++) {
      drawAscii(asciiFrames[fi]);
      const r = rgba(asc), p = quantize(r, 256);
      encoder.writeFrame(applyPalette(r, p), w, h, { palette: p, delay: rawDelays[fi] ?? 10 });
    }
  }

  encoder.finish();
  const blob = new Blob([encoder.bytes()], { type: 'image/gif' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'ascii-animation.gif';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── File drop ─────────────────────────────────────────────────────────────────

dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { const f = fileInput.files?.[0]; if (f) loadFile(f); });
dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('drag');
  const f = e.dataTransfer?.files?.[0]; if (f) loadFile(f);
});
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0]; if (f) loadFile(f);
});

// ── Newsletter modal ─────────────────────────────────────────────────────────

(function newsletter() {
  const STORAGE_KEY = 'ascii_studio_newsletter';
  const DELAY_MS    = 35000; // first appearance after 35 s
  const ENDPOINT    = ''; // optional: paste your endpoint here later

  const backdrop = document.getElementById('newsletterBackdrop')!;
  const closeBtn = document.getElementById('newsletterClose')!;
  const dismissBtn = document.getElementById('newsletterDismiss')!;
  const form     = document.getElementById('newsletterForm') as HTMLFormElement;
  const emailInput = document.getElementById('newsletterEmail') as HTMLInputElement;

  function getState(): { subscribed?: boolean; dismissedAt?: number } {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }
  function setState(s: object) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
  }

  function show() { backdrop.style.display = 'flex'; setTimeout(() => emailInput?.focus(), 250); }
  function hide() { backdrop.style.display = 'none'; }

  function shouldShow(): boolean {
    const s = getState();
    if (s.subscribed) return false;
    // If dismissed in last 7 days, skip
    if (s.dismissedAt && (Date.now() - s.dismissedAt) < 7 * 24 * 3600 * 1000) return false;
    return true;
  }

  if (shouldShow()) {
    setTimeout(() => { if (shouldShow()) show(); }, DELAY_MS);
  }

  closeBtn.addEventListener('click', () => {
    setState({ ...getState(), dismissedAt: Date.now() });
    hide();
  });
  dismissBtn.addEventListener('click', () => {
    setState({ ...getState(), dismissedAt: Date.now() });
    hide();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      emailInput.style.borderColor = '#dc2626';
      return;
    }
    setState({ subscribed: true, email });
    // Optional: POST to endpoint
    if (ENDPOINT) {
      try {
        await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, source: 'ascii-studio', ts: Date.now() }),
        });
      } catch {}
    }
    // Visual confirmation
    form.innerHTML = `<div style="padding:14px;color:#16a34a;font-weight:600;">✓ You're subscribed — thanks!</div>`;
    setTimeout(hide, 1800);
  });

  // Close on backdrop click (not on card)
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) {
      setState({ ...getState(), dismissedAt: Date.now() });
      hide();
    }
  });

  // ESC closes the modal
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && backdrop.style.display === 'flex') {
      setState({ ...getState(), dismissedAt: Date.now() });
      hide();
    }
  });
})();
