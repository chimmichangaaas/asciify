# ASCII Art & Animation — Figma Plugin

Turn an image, GIF, or short video into ASCII art inside Figma. Stills become a single monospace text layer; animations become a row of frames you can wire up with Smart Animate.

## Development

```bash
npm install
npm run build      # one-shot: writes dist/code.js + dist/ui.html
npm run watch      # rebuild on change
npm run typecheck  # tsc --noEmit
```

Then in Figma desktop: **Plugins → Development → Import plugin from manifest…** and pick `manifest.json`.

## How it works

- `src/ui.ts` runs in the plugin's iframe. It decodes the dropped file (image via `<img>`, GIF via `gifuct-js`, video via `<video>` seeking), samples pixels onto a canvas, and maps luminance to characters from a user-configurable ramp.
- `src/code.ts` runs in the Figma sandbox. It loads a monospace font (falling back through Roboto Mono → JetBrains Mono → IBM Plex Mono → Source Code Pro → Courier → Inter) and creates `TextNode`s / `FrameNode`s on the canvas.
- `src/ascii.ts` is the pure pixel→ASCII function (no DOM deps). The UI calls it once per frame.

## Controls

- **Width (chars)** — output columns (20–240, default 80).
- **Character ramp** — dark → light glyphs. Default `` .:-=+*#%@``.
- **Invert** — reverse the ramp.
- **Max frames / Sample FPS** — only shown for GIF/video. Caps Figma frame count.

## Layout

```
manifest.json
build.mjs                 # esbuild driver; inlines ui.ts into ui.html
src/
  code.ts                 # sandbox entry
  ui.html / ui.ts         # plugin UI
  ascii.ts                # luminance → char ramp
  decode-image.ts         # File → ImageData
  decode-gif.ts           # File → ImageData[] via gifuct-js
  decode-video.ts         # File → ImageData[] via <video> seeking
  types.ts                # postMessage contract
dist/                     # build output (committed for Figma import)
```

## Notes

- Character aspect is corrected by `0.5` (monospace glyphs are ~2× taller than wide), so circles stay circular.
- Transparent pixels are composited over white before luminance is measured.
- Animation frames share the layer name `ascii`, which is what Smart Animate needs to tween between frames.
