"use strict";
(() => {
  // src/code.ts
  var PREFERRED_FONTS = [
    { family: "Roboto Mono", style: "Regular" },
    { family: "JetBrains Mono", style: "Regular" },
    { family: "IBM Plex Mono", style: "Regular" },
    { family: "Source Code Pro", style: "Regular" },
    { family: "Courier New", style: "Regular" },
    { family: "Courier", style: "Regular" }
  ];
  var FALLBACK_FONT = { family: "Inter", style: "Regular" };
  var CELL = 8;
  var FONT_SIZE = 10;
  var PADDING = 24;
  var CORNER_RADIUS = 12;
  var BG_FALLBACK = { r: 0.035, g: 0.035, b: 0.045 };
  var FRAME_DELAY_S = 1e-3;
  var VARIANT_GAP = 20;
  var FREE_IMAGES_PER_DAY = 5;
  var FREE_VIDEOS_LIFETIME = 2;
  var OWNER_ID = "969271541578717927";
  async function loadQuota() {
    var _a;
    const stored = await figma.clientStorage.getAsync("quota");
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    if (!stored || stored.lastResetDate !== today) {
      return { imageCount: 0, videoCount: (_a = stored == null ? void 0 : stored.videoCount) != null ? _a : 0, lastResetDate: today };
    }
    return stored;
  }
  async function saveQuota(q) {
    await figma.clientStorage.setAsync("quota", q);
  }
  function isOwner() {
    var _a;
    return !!OWNER_ID && ((_a = figma.currentUser) == null ? void 0 : _a.id) === OWNER_ID;
  }
  function isPaidUser() {
    var _a, _b;
    if (isOwner()) return true;
    try {
      return ((_b = (_a = figma.payments) == null ? void 0 : _a.status) == null ? void 0 : _b.type) === "PAID";
    } catch (e) {
      return false;
    }
  }
  async function getQuotaStatus() {
    const q = await loadQuota();
    return { imageCount: q.imageCount, videoCount: q.videoCount, isPaid: isPaidUser(), isOwner: isOwner() };
  }
  function send(msg2) {
    figma.ui.postMessage(msg2);
  }
  function tintedVignetteFill(meanColor) {
    if (!meanColor) return { type: "SOLID", color: BG_FALLBACK };
    const [mr, mg, mb] = meanColor;
    const lum = 0.2126 * mr + 0.7152 * mg + 0.0722 * mb;
    const desat = 0.4;
    const r0 = lum + (mr - lum) * desat;
    const g0 = lum + (mg - lum) * desat;
    const b0 = lum + (mb - lum) * desat;
    const cb = 0.12;
    const center = { r: r0 / 255 * cb, g: g0 / 255 * cb, b: b0 / 255 * cb, a: 1 };
    const edge = { r: 0.01, g: 0.01, b: 0.015, a: 1 };
    return {
      type: "GRADIENT_RADIAL",
      gradientStops: [{ position: 0, color: center }, { position: 1, color: edge }],
      gradientTransform: [[1, 0, 0], [0, 1, 0]]
    };
  }
  var FRAME_SHADOW = {
    type: "DROP_SHADOW",
    color: { r: 0, g: 0, b: 0, a: 0.45 },
    offset: { x: 0, y: 12 },
    radius: 32,
    spread: 0,
    visible: true,
    blendMode: "NORMAL"
  };
  (async () => {
    figma.showUI(__html__, { width: 360, height: 680, themeColors: true });
    const quota = await getQuotaStatus();
    send({ type: "quota", quota });
    if (!OWNER_ID) {
      setTimeout(() => {
        var _a, _b;
        const uid = (_b = (_a = figma.currentUser) == null ? void 0 : _a.id) != null ? _b : "unavailable \u2014 make sure you are logged in";
        figma.ui.postMessage({ type: "ownerHint", userId: uid });
      }, 600);
    }
  })();
  figma.ui.onmessage = async (msg2) => {
    var _a;
    if (msg2.type === "checkout") {
      try {
        await ((_a = figma.payments) == null ? void 0 : _a.initiateCheckoutAsync({ interstitial: "PAID_FEATURE" }));
        send({ type: "quota", quota: await getQuotaStatus() });
      } catch (err) {
        figma.notify("Checkout unavailable in dev mode \u2014 publish to Community first.", { error: true });
      }
      return;
    }
    if (msg2.type !== "insert") return;
    const paid = isPaidUser();
    if (!paid) {
      const q = await loadQuota();
      if (msg2.kind === "image" && q.imageCount >= FREE_IMAGES_PER_DAY) {
        figma.notify("Daily image limit reached \u2014 upgrade to continue.", { error: true });
        send({ type: "quota", quota: { imageCount: q.imageCount, videoCount: q.videoCount, isPaid: false } });
        return;
      }
      if (msg2.kind === "animation" && q.videoCount >= FREE_VIDEOS_LIFETIME) {
        figma.notify("Free video limit reached \u2014 upgrade to continue.", { error: true });
        send({ type: "quota", quota: { imageCount: q.imageCount, videoCount: q.videoCount, isPaid: false } });
        return;
      }
    }
    try {
      const { font, isMonospace } = await loadBestFont();
      if (!isMonospace) figma.notify("No monospace font \u2014 using Inter, spacing may look off.");
      if (msg2.frames.length === 1) {
        figma.notify("Rendering\u2026", { timeout: 1200 });
        const parent = await buildAsciiFrame(msg2.frames[0], font, "ASCII");
        const center = figma.viewport.center;
        parent.x = Math.round(center.x - parent.width / 2);
        parent.y = Math.round(center.y - parent.height / 2);
        figma.currentPage.appendChild(parent);
        figma.currentPage.selection = [parent];
        figma.viewport.scrollAndZoomIntoView([parent]);
      } else {
        figma.notify(`Building ${msg2.frames.length} frames\u2026`, { timeout: 5e3 });
        await buildAnimationGroup(msg2.frames, font);
      }
      if (!paid) {
        const q = await loadQuota();
        if (msg2.kind === "image") q.imageCount++;
        else q.videoCount++;
        await saveQuota(q);
        send({ type: "quota", quota: { imageCount: q.imageCount, videoCount: q.videoCount, isPaid: false } });
      }
      send({ type: "done", frameCount: msg2.frames.length });
      figma.notify(msg2.frames.length === 1 ? "\u2713 ASCII inserted." : `\u2713 Done \u2014 ${msg2.frames.length} keyframes inserted.`);
    } catch (err) {
      figma.notify(`ASCII insert failed: ${err.message}`, { error: true });
    }
  };
  async function loadBestFont() {
    for (const font of PREFERRED_FONTS) {
      try {
        await figma.loadFontAsync(font);
        return { font, isMonospace: true };
      } catch (e) {
      }
    }
    await figma.loadFontAsync(FALLBACK_FONT);
    return { font: FALLBACK_FONT, isMonospace: false };
  }
  async function fillAsciiNode(node, payload, font, name) {
    const lines = payload.text.split("\n");
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
    tpl.lineHeight = { unit: "PIXELS", value: CELL };
    tpl.letterSpacing = { unit: "PIXELS", value: 0 };
    tpl.characters = "#";
    const glyphOffsetX = (CELL - tpl.width) / 2;
    const glyphOffsetY = (CELL - tpl.height) / 2;
    const defaultFill = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    for (let row = 0; row < rows; row++) {
      const line = lines[row];
      const y = PADDING + row * CELL + glyphOffsetY;
      for (let col = 0; col < line.length; col++) {
        const ch = line.charAt(col);
        if (ch === " ") continue;
        const t = tpl.clone();
        t.characters = ch;
        if (colors) {
          const o = (row * cols + col) * 3;
          t.fills = [{ type: "SOLID", color: { r: colors[o] / 255, g: colors[o + 1] / 255, b: colors[o + 2] / 255 } }];
        } else {
          t.fills = defaultFill;
        }
        t.x = PADDING + col * CELL + glyphOffsetX;
        t.y = y;
        node.appendChild(t);
      }
      if (row % 4 === 3) await new Promise((r) => setTimeout(r, 0));
      if (row % 10 === 9) figma.notify(`Rendering\u2026 ${Math.round((row + 1) / rows * 100)}%`, { timeout: 800 });
    }
    tpl.remove();
  }
  async function buildAsciiFrame(payload, font, name) {
    const frame = figma.createFrame();
    await fillAsciiNode(frame, payload, font, name);
    return frame;
  }
  async function buildAsciiComponent(payload, font, name) {
    const comp = figma.createComponent();
    await fillAsciiNode(comp, payload, font, name);
    return comp;
  }
  async function buildAnimationGroup(frames, font) {
    const GAP = 100;
    const center = figma.viewport.center;
    const components = [];
    for (let i = 0; i < frames.length; i++) {
      figma.notify(`Building frame ${i + 1} / ${frames.length}\u2026`, { timeout: 1500 });
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
    let originalComp = null;
    if (msg.smoothMerge && msg.originalImageBytes && msg.originalImageBytes.length > 0) {
      const figmaImg = figma.createImage(new Uint8Array(msg.originalImageBytes));
      originalComp = figma.createComponent();
      originalComp.name = "Frame=Original";
      const ref = components[0];
      originalComp.resize(ref.width, ref.height);
      originalComp.fills = [{ type: "IMAGE", scaleMode: "FILL", imageHash: figmaImg.hash }];
      originalComp.cornerRadius = CORNER_RADIUS;
      originalComp.effects = [FRAME_SHADOW];
      originalComp.clipsContent = true;
      originalComp.x = xCursor;
      originalComp.y = 0;
      figma.currentPage.appendChild(originalComp);
    }
    const allVariants = originalComp ? [...components, originalComp] : components;
    const compSet = figma.combineAsVariants(allVariants, figma.currentPage);
    compSet.name = "ASCII Animation";
    const dissolveIn = { type: "DISSOLVE", easing: { type: "EASE_OUT" }, duration: 0.9 };
    const dissolveOut = { type: "DISSOLVE", easing: { type: "EASE_IN" }, duration: 0.9 };
    if (originalComp) {
      for (let i = 0; i < components.length - 1; i++) {
        components[i].reactions = [{
          trigger: { type: "AFTER_TIMEOUT", timeout: FRAME_DELAY_S },
          actions: [{ type: "NODE", destinationId: components[i + 1].id, navigation: "CHANGE_TO", transition: null, preserveScrollPosition: false }]
        }];
      }
      components[components.length - 1].reactions = [{
        trigger: { type: "AFTER_TIMEOUT", timeout: FRAME_DELAY_S },
        actions: [{ type: "NODE", destinationId: originalComp.id, navigation: "CHANGE_TO", transition: dissolveIn, preserveScrollPosition: false }]
      }];
      originalComp.reactions = [{
        trigger: { type: "AFTER_TIMEOUT", timeout: 2 },
        actions: [{ type: "NODE", destinationId: components[0].id, navigation: "CHANGE_TO", transition: dissolveOut, preserveScrollPosition: false }]
      }];
    } else {
      for (let i = 0; i < components.length; i++) {
        const next = components[(i + 1) % components.length];
        components[i].reactions = [{
          trigger: { type: "AFTER_TIMEOUT", timeout: FRAME_DELAY_S },
          actions: [{ type: "NODE", destinationId: next.id, navigation: "CHANGE_TO", transition: null, preserveScrollPosition: false }]
        }];
      }
    }
    const instance = components[0].createInstance();
    const screen = figma.createFrame();
    screen.name = "ASCII Animation \u2014 Play";
    screen.fills = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }];
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
})();
