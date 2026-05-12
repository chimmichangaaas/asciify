# Asciify

> Turn images, GIFs and videos into living typographic art.
> A standalone web dashboard with mask reveals, dither modes, themes, and one-click exports.

<p align="center">
  <img src="docs/hero.png" alt="Asciify preview" width="800" />
</p>

---

## Features

### 🎨 Rendering
- **6 render modes** — ASCII, Halftone Dots, Block Pixels, Geometric, Braille (8× density), Bayer Dither
- **7 color themes** — Auto, Matrix, Amber, Cyberpunk, Mono, Sepia, fully Custom duotone
- **Background overlays** — scanlines, vignette, grain, additive glow
- **High-DPI canvas** — text renders crisp at any zoom

### ⚡ Mask Reveal Engine
- **12 directions** — L/R, T/B, all 4 diagonals, radial out/in, random scatter, diagonal stripes, paint-it-yourself, multi-front
- **6 easing curves** — Linear, Ease In/Out/InOut, Stepped, Exponential
- **Live progress scrubber** — drag to reveal any amount in real time
- **Distortion** — wave amount + frequency, edge noise
- **5 flip color modes** — Fade Grey, Glitch RGB, Mono Accent, Opacity, Inverted
- **7 presets** — Wipe, Matrix, Glitch, Bloom, Wave, Shatter, Halftone Print
- **Click-to-set radial origin** + **drag-to-paint custom reveals**
- **Reverse mode** — same controls running backwards

### 📦 Exports
- **PNG** (raster) · **SVG** (vector) · **TXT** (plain) · **HTML** (with inline color spans)
- **Markdown** code blocks · **ANSI** escape codes
- **Animated GIF** (regular animation)
- **Reveal GIF** (bakes the entire mask reveal at 24 fps with global palette)

### 🛠 Workflow
- **Live webcam input** — real-time face → ASCII at ~12 fps
- **Side-by-side compare** — original vs ASCII with draggable divider
- **Share via URL** — entire config encoded in URL hash, one-click copy
- **Keyboard shortcuts** — `Space` play/pause, `R` reset, `←/→` scrub, `F` fit zoom

### 🔌 Figma plugin (bonus)
A separate Figma plugin (`src/code.ts` + `src/ui.ts`) ships with:
- Image / GIF / video → ASCII directly on the Figma canvas
- Animated component sets with prototype playback
- GIF export
- Built-in monetization scaffold (free tier + Figma payments hook)

---

## Quick start

### Use the standalone dashboard
1. Download `dist/dashboard.html` from this repo
2. Open it in any modern browser — that's it
3. Drag an image, GIF or video onto the canvas

No server, no installation, no tracking.

### Build from source

```bash
npm install
npm run build         # production (minified + mangled)
npm run build:dev     # development (readable, source maps inline)
npm run dev           # watch mode
```

Outputs:
- `dist/dashboard.html` — standalone web dashboard
- `dist/ui.html` + `dist/code.js` — Figma plugin

### Install the Figma plugin
1. Run `npm run build`
2. In Figma → Plugins → Development → Import plugin from manifest
3. Pick `manifest.json` at the repo root

---

## Project structure

```
asciify/
├── src/
│   ├── ascii.ts            # core image → ASCII conversion
│   ├── decode-image.ts     # PNG/JPG decoder
│   ├── decode-gif.ts       # GIF frame extractor (gifuct-js)
│   ├── decode-video.ts     # video frame sampler (HTML5 video)
│   ├── code.ts             # Figma plugin sandbox code
│   ├── ui.ts               # Figma plugin UI
│   ├── ui.html             # Figma plugin UI shell
│   ├── dashboard.ts        # standalone dashboard logic
│   └── dashboard.html      # standalone dashboard shell
├── dist/                   # built artifacts
├── manifest.json           # Figma plugin manifest
└── build.mjs               # esbuild pipeline
```

---

## Tech stack

- **TypeScript** + **esbuild** — no webpack, no vite
- **gifenc** for GIF encoding
- **gifuct-js** for GIF decoding
- Vanilla DOM — no React / Vue / framework
- Canvas 2D — no WebGL / WebGPU
- Single-file HTML bundles for the dashboard and Figma UI

---

## Author

**Yash Saindane**
- 𝕏 / Twitter: [@yashsaindane](https://x.com/yashsaindane)
- GitHub: [@yashsaindane](https://github.com/yashsaindane)
- LinkedIn: [yashsaindane](https://linkedin.com/in/yashsaindane)

If you ship something cool with Asciify, tag me — I'd love to see it.

---

## License

**© 2026 Yash Saindane. All rights reserved.**

This is a closed-source project. The source is published for transparency and learning, **not** for redistribution or derivative works.

- ❌ Do not republish or rehost this code
- ❌ Do not bundle, sell, or rebrand
- ❌ Do not train ML models on this codebase
- ✅ Personal use, learning, and bug reports are welcome
- ✅ Want to use this commercially or partner up? Reach out via the links above

See [LICENSE](./LICENSE) for the full terms.

---

<p align="center"><sub>Built with care · v1.0.0</sub></p>
