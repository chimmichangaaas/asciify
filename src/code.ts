import type { AsciiFramePayload, UiToCode, CodeToUi, QuotaStatus } from './types';

const PREFERRED_FONTS: FontName[] = [
  { family: 'Roboto Mono', style: 'Regular' },
  { family: 'JetBrains Mono', style: 'Regular' },
  { family: 'IBM Plex Mono', style: 'Regular' },
  { family: 'Source Code Pro', style: 'Regular' },
  { family: 'Courier New', style: 'Regular' },
  { family: 'Courier', style: 'Regular' },
];

const FALLBACK_FONT: FontName = { family: 'Inter', style: 'Regular' };

const CELL = 8;
const FONT_SIZE = 10;
const PADDING = 24;
const CORNER_RADIUS = 12;
const BG_FALLBACK: RGB = { r: 0.035, g: 0.035, b: 0.045 };
const FRAME_DELAY_S = 0.001;
const VARIANT_GAP = 20;

const FREE_IMAGES_PER_DAY = 5;
const FREE_VIDEOS_LIFETIME = 2;

// Your Figma user ID — paste it here for unlimited access with no paywall.
// Leave blank to discover it: reload the plugin and a notify will show your ID.
const OWNER_ID = '969271541578717927';

// ── Quota helpers ────────────────────────────────────────────────────────────

type QuotaData = {
  imageCount: number;
  videoCount: number;
  lastResetDate: string; // 'YYYY-MM-DD'
};

async function loadQuota(): Promise<QuotaData> {
  const stored = await figma.clientStorage.getAsync('quota') as QuotaData | undefined;
  const today = new Date().toISOString().slice(0, 10);
  if (!stored || stored.lastResetDate !== today) {
    return { imageCount: 0, videoCount: stored?.videoCount ?? 0, lastResetDate: today };
  }
  return stored;
}

async function saveQuota(q: QuotaData): Promise<void> {
  await figma.clientStorage.setAsync('quota', q);
}

function isOwner(): boolean {
  return !!OWNER_ID && figma.currentUser?.id === OWNER_ID;
}

function isPaidUser(): boolean {
  if (isOwner()) return true;
  try {
    return (figma as any).payments?.status?.type === 'PAID';
  } catch {
    return false;
  }
}

async function getQuotaStatus(): Promise<QuotaStatus> {
  const q = await loadQuota();
  return { imageCount: q.imageCount, videoCount: q.videoCount, isPaid: isPaidUser(), isOwner: isOwner() };
}

function send(msg: CodeToUi) {
  figma.ui.postMessage(msg);
}

// ── Paint / shadow helpers ───────────────────────────────────────────────────

function tintedVignetteFill(meanColor?: [number, number, number]): Paint {
  if (!meanColor) return { type: 'SOLID', color: BG_FALLBACK };
  const [mr, mg, mb] = meanColor;
  const lum = 0.2126 * mr + 0.7152 * mg + 0.0722 * mb;
  const desat = 0.4;
  const r0 = lum + (mr - lum) * desat;
  const g0 = lum + (mg - lum) * desat;
  const b0 = lum + (mb - lum) * desat;
  const cb = 0.12;
  const center: RGBA = { r: (r0 / 255) * cb, g: (g0 / 255) * cb, b: (b0 / 255) * cb, a: 1 };
  const edge: RGBA = { r: 0.01, g: 0.01, b: 0.015, a: 1 };
  return {
    type: 'GRADIENT_RADIAL',
    gradientStops: [{ position: 0, color: center }, { position: 1, color: edge }],
    gradientTransform: [[1, 0, 0], [0, 1, 0]],
  };
}

const FRAME_SHADOW: DropShadowEffect = {
  type: 'DROP_SHADOW',
  color: { r: 0, g: 0, b: 0, a: 0.45 },
  offset: { x: 0, y: 12 },
  radius: 32,
  spread: 0,
  visible: true,
  blendMode: 'NORMAL',
};

// ── Boot ─────────────────────────────────────────────────────────────────────

(async () => {
  figma.showUI(__html__, { width: 360, height: 680, themeColors: true });
  const quota = await getQuotaStatus();
  send({ type: 'quota', quota });
  if (!OWNER_ID) {
    // Delay ensures the iframe is fully mounted before the message lands
    setTimeout(() => {
      const uid = figma.currentUser?.id ?? 'unavailable — make sure you are logged in';
      figma.ui.postMessage({ type: 'ownerHint', userId: uid });
    }, 600);
  }
})();

// ── Message handler ──────────────────────────────────────────────────────────

figma.ui.onmessage = async (msg: UiToCode) => {
  if (msg.type === 'checkout') {
    try {
      await (figma as any).payments?.initiateCheckoutAsync({ interstitial: 'PAID_FEATURE' });
      // Re-send updated quota after checkout attempt
      send({ type: 'quota', quota: await getQuotaStatus() });
    } catch (err) {
      figma.notify('Checkout unavailable in dev mode — publish to Community first.', { error: true });
    }
    return;
  }

  if (msg.type !== 'insert') return;

  // ── Quota guard ────────────────────────────────────────────────────────────
  const paid = isPaidUser();
  if (!paid) {
    const q = await loadQuota();
    if (msg.kind === 'image' && q.imageCount >= FREE_IMAGES_PER_DAY) {
      figma.notify('Daily image limit reached — upgrade to continue.', { error: true });
      send({ type: 'quota', quota: { imageCount: q.imageCount, videoCount: q.videoCount, isPaid: false } });
      return;
    }
    if (msg.kind === 'animation' && q.videoCount >= FREE_VIDEOS_LIFETIME) {
      figma.notify('Free video limit reached — upgrade to continue.', { error: true });
      send({ type: 'quota', quota: { imageCount: q.imageCount, videoCount: q.videoCount, isPaid: false } });
      return;
    }
  }

  // ── Insert ─────────────────────────────────────────────────────────────────
  try {
    const { font, isMonospace } = await loadBestFont();
    if (!isMonospace) figma.notify('No monospace font — using Inter, spacing may look off.');

    if (msg.frames.length === 1) {
      figma.notify('Rendering…', { timeout: 1200 });
      const parent = await buildAsciiFrame(msg.frames[0], font, 'ASCII');
      const center = figma.viewport.center;
      parent.x = Math.round(center.x - parent.width / 2);
      parent.y = Math.round(center.y - parent.height / 2);
      figma.currentPage.appendChild(parent);
      figma.currentPage.selection = [parent];
      figma.viewport.scrollAndZoomIntoView([parent]);
    } else {
      figma.notify(`Building ${msg.frames.length} frames…`, { timeout: 5000 });
      await buildAnimationGroup(msg.frames, font);
    }

    // ── Record usage ───────────────────────────────────────────────────────
    if (!paid) {
      const q = await loadQuota();
      if (msg.kind === 'image') q.imageCount++;
      else q.videoCount++;
      await saveQuota(q);
      send({ type: 'quota', quota: { imageCount: q.imageCount, videoCount: q.videoCount, isPaid: false } });
    }

    send({ type: 'done', frameCount: msg.frames.length });
    figma.notify(msg.frames.length === 1 ? '✓ ASCII inserted.' : `✓ Done — ${msg.frames.length} keyframes inserted.`);
  } catch (err) {
    figma.notify(`ASCII insert failed: ${(err as Error).message}`, { error: true });
  }
};

// ── Font loader ───────────────────────────────────────────────────────────────

async function loadBestFont(): Promise<{ font: FontName; isMonospace: boolean }> {
  for (const font of PREFERRED_FONTS) {
    try { await figma.loadFontAsync(font); return { font, isMonospace: true }; }
    catch { /* try next */ }
  }
  await figma.loadFontAsync(FALLBACK_FONT);
  return { font: FALLBACK_FONT, isMonospace: false };
}

// ── Rendering ─────────────────────────────────────────────────────────────────

async function fillAsciiNode(
  node: FrameNode | ComponentNode,
  payload: AsciiFramePayload,
  font: FontName,
  name: string,
): Promise<void> {
  const lines = payload.text.split('\n');
  const rows = lines.length;
  const cols = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const colors = payload.colors;

  node.name = name;
  node.resize(cols * CELL + PADDING * 2, rows * CELL + PADDING * 2);
  node.fills = [tintedVignetteFill(payload.meanColor)];
  node.cornerRadius = CORNER_RADIUS;
  node.effects = [FRAME_SHADOW];
  node.clipsContent = false;

  const tpl = figma.createText();
  tpl.fontName = font;
  tpl.fontSize = FONT_SIZE;
  tpl.lineHeight = { unit: 'PIXELS', value: CELL };
  tpl.letterSpacing = { unit: 'PIXELS', value: 0 };
  tpl.characters = '#';
  const glyphOffsetX = (CELL - tpl.width) / 2;
  const glyphOffsetY = (CELL - tpl.height) / 2;
  const defaultFill: Paint[] = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];

  for (let row = 0; row < rows; row++) {
    const line = lines[row];
    const y = PADDING + row * CELL + glyphOffsetY;
    for (let col = 0; col < line.length; col++) {
      const ch = line.charAt(col);
      if (ch === ' ') continue;
      const t = tpl.clone();
      t.characters = ch;
      if (colors) {
        const o = (row * cols + col) * 3;
        t.fills = [{ type: 'SOLID', color: { r: colors[o] / 255, g: colors[o + 1] / 255, b: colors[o + 2] / 255 } }];
      } else {
        t.fills = defaultFill;
      }
      t.x = PADDING + col * CELL + glyphOffsetX;
      t.y = y;
      node.appendChild(t);
    }
    if (row % 4 === 3) await new Promise<void>(r => setTimeout(r, 0));
    if (row % 10 === 9) figma.notify(`Rendering… ${Math.round((row + 1) / rows * 100)}%`, { timeout: 800 });
  }

  tpl.remove();
}

async function buildAsciiFrame(payload: AsciiFramePayload, font: FontName, name: string): Promise<FrameNode> {
  const frame = figma.createFrame();
  await fillAsciiNode(frame, payload, font, name);
  return frame;
}

async function buildAsciiComponent(payload: AsciiFramePayload, font: FontName, name: string): Promise<ComponentNode> {
  const comp = figma.createComponent();
  await fillAsciiNode(comp, payload, font, name);
  return comp;
}

async function buildAnimationGroup(frames: AsciiFramePayload[], font: FontName): Promise<void> {
  const GAP = 100;
  const center = figma.viewport.center;

  const components: ComponentNode[] = [];
  for (let i = 0; i < frames.length; i++) {
    figma.notify(`Building frame ${i + 1} / ${frames.length}…`, { timeout: 1500 });
    const comp = await buildAsciiComponent(frames[i], font, `Frame=${i + 1}`);
    figma.currentPage.appendChild(comp);
    components.push(comp);
  }

  let xCursor = 0;
  for (const comp of components) {
    comp.x = xCursor;
    comp.y = 0;
    xCursor += comp.width + VARIANT_GAP;
  }
  // xCursor now points to where the next (original) variant should go

  // ── Smooth Merge: append an "Original" variant with the raw image ──────────
  let originalComp: ComponentNode | null = null;
  if (msg.smoothMerge && msg.originalImageBytes && msg.originalImageBytes.length > 0) {
    const figmaImg = figma.createImage(new Uint8Array(msg.originalImageBytes));
    originalComp = figma.createComponent();
    originalComp.name = 'Frame=Original';
    const ref = components[0];
    originalComp.resize(ref.width, ref.height);
    originalComp.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: figmaImg.hash }];
    originalComp.cornerRadius = CORNER_RADIUS;
    originalComp.effects = [FRAME_SHADOW];
    originalComp.clipsContent = true;
    originalComp.x = xCursor;
    originalComp.y = 0;
    figma.currentPage.appendChild(originalComp);
  }

  const allVariants = originalComp ? [...components, originalComp] : components;
  const compSet = figma.combineAsVariants(allVariants, figma.currentPage);
  compSet.name = 'ASCII Animation';

  const dissolveIn:  Transition = { type: 'DISSOLVE', easing: { type: 'EASE_OUT' }, duration: 0.9 };
  const dissolveOut: Transition = { type: 'DISSOLVE', easing: { type: 'EASE_IN'  }, duration: 0.9 };

  if (originalComp) {
    // ASCII frames: all but last → instant next frame
    for (let i = 0; i < components.length - 1; i++) {
      components[i].reactions = [{
        trigger: { type: 'AFTER_TIMEOUT', timeout: FRAME_DELAY_S },
        actions: [{ type: 'NODE', destinationId: components[i + 1].id, navigation: 'CHANGE_TO', transition: null, preserveScrollPosition: false }],
      }];
    }
    // Last ASCII frame → dissolve into Original
    components[components.length - 1].reactions = [{
      trigger: { type: 'AFTER_TIMEOUT', timeout: FRAME_DELAY_S },
      actions: [{ type: 'NODE', destinationId: originalComp.id, navigation: 'CHANGE_TO', transition: dissolveIn, preserveScrollPosition: false }],
    }];
    // Original frame holds for 2 s then dissolves back to Frame=1
    originalComp.reactions = [{
      trigger: { type: 'AFTER_TIMEOUT', timeout: 2 },
      actions: [{ type: 'NODE', destinationId: components[0].id, navigation: 'CHANGE_TO', transition: dissolveOut, preserveScrollPosition: false }],
    }];
  } else {
    // Standard loop — every frame instantly advances, last wraps to first
    for (let i = 0; i < components.length; i++) {
      const next = components[(i + 1) % components.length];
      components[i].reactions = [{
        trigger: { type: 'AFTER_TIMEOUT', timeout: FRAME_DELAY_S },
        actions: [{ type: 'NODE', destinationId: next.id, navigation: 'CHANGE_TO', transition: null, preserveScrollPosition: false }],
      }];
    }
  }

  const instance = components[0].createInstance();
  const screen = figma.createFrame();
  screen.name = 'ASCII Animation — Play';
  screen.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
  screen.resize(instance.width, instance.height);
  screen.clipsContent = false;
  screen.appendChild(instance);
  instance.x = 0;
  instance.y = 0;
  figma.currentPage.appendChild(screen);

  const totalW = compSet.width + GAP + screen.width;
  const startX = Math.round(center.x - totalW / 2);
  const startY = Math.round(center.y - Math.max(compSet.height, screen.height) / 2);
  compSet.x = startX;
  compSet.y = startY;
  screen.x = startX + compSet.width + GAP;
  screen.y = startY;

  figma.currentPage.selection = [compSet, screen];
  figma.viewport.scrollAndZoomIntoView([compSet, screen]);
}
