import * as esbuild from 'esbuild';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const WATCH = process.argv.includes('--watch');
const DEV   = process.argv.includes('--dev') || WATCH;
const PROD  = !DEV;

await mkdir(resolve(ROOT, 'dist'), { recursive: true });
await mkdir(resolve(ROOT, 'dist/docs'), { recursive: true });

// Sync docs/og-image.png into dist/docs so the OG preview works when serving dist/.
// If the PNG is missing OR the SVG is newer, regenerate via macOS qlmanage + sips.
async function syncOgImage() {
  const svg = resolve(ROOT, 'docs/og-image.svg');
  const png = resolve(ROOT, 'docs/og-image.png');
  let needRegen = false;
  try {
    const [svgStat, pngStat] = await Promise.all([stat(svg), stat(png).catch(() => null)]);
    if (!pngStat || svgStat.mtimeMs > pngStat.mtimeMs) needRegen = true;
  } catch {}
  if (needRegen && process.platform === 'darwin') {
    try {
      // qlmanage renders the SVG; sips trims/resizes to OG dimensions
      await exec('qlmanage', ['-t', '-s', '1200', '-o', resolve(ROOT, 'docs'), svg]);
      // qlmanage writes "og-image.svg.png" — rename + resize
      const tmp = resolve(ROOT, 'docs/og-image.svg.png');
      await exec('mv', [tmp, png]);
      await exec('sips', ['-z', '630', '1200', png]);
      console.log('  docs/og-image.png regenerated from SVG');
    } catch (err) {
      console.warn('  Could not regenerate og-image.png:', err.message);
    }
  }
  // Copy PNG (+ SVG fallback + default-preview AVIF) into dist/docs
  try {
    await exec('cp', [png,                                       resolve(ROOT, 'dist/docs/og-image.png')]);
    await exec('cp', [resolve(ROOT, 'docs/og-image.svg'),        resolve(ROOT, 'dist/docs/og-image.svg')]);
    await exec('cp', [resolve(ROOT, 'docs/preview-default.avif'),resolve(ROOT, 'dist/docs/preview-default.avif')]);
  } catch {}
}
await syncOgImage();

// Shared production-hardening options (minify + mangle + strip)
const prodOpts = PROD ? {
  minify: true,
  minifyWhitespace: true,
  minifyIdentifiers: true,
  minifySyntax: true,
  legalComments: 'none',
  drop: ['debugger'],
  // Mangle non-public-API property names starting with _
  mangleProps: /^_/,
  treeShaking: true,
  sourcemap: false,
} : { sourcemap: 'inline' };

const codeBuild = {
  entryPoints: [resolve(ROOT, 'src/code.ts')],
  bundle: true,
  outfile: resolve(ROOT, 'dist/code.js'),
  platform: 'browser',
  target: 'es2017',
  format: 'iife',
  logLevel: 'info',
  ...prodOpts,
};

// UI is built in-memory so we can inline it into the HTML shell.
const uiBuild = {
  entryPoints: [resolve(ROOT, 'src/ui.ts')],
  bundle: true,
  write: false,
  platform: 'browser',
  target: 'es2017',
  format: 'iife',
  logLevel: 'info',
  ...prodOpts,
};

const dashBuild = {
  entryPoints: [resolve(ROOT, 'src/dashboard.ts')],
  bundle: true,
  write: false,
  platform: 'browser',
  target: 'es2017',
  format: 'iife',
  logLevel: 'info',
  ...prodOpts,
};

// Minify HTML by collapsing whitespace between tags
function minifyHtml(html) {
  if (!PROD) return html;
  return html
    .replace(/<!--(?!\[if).*?-->/gs, '')               // strip HTML comments (keep IE conditionals)
    .replace(/\n\s+/g, '\n')                            // collapse leading whitespace
    .replace(/\s{2,}/g, ' ')                            // collapse runs of whitespace
    .replace(/>\s+</g, '><');                           // collapse between tags
}

async function writeUiHtml() {
  const result = await esbuild.build(uiBuild);
  const js = result.outputFiles[0].text;
  const shell = await readFile(resolve(ROOT, 'src/ui.html'), 'utf8');
  const html = minifyHtml(shell.replace('<!-- SCRIPT -->', `<script>${js}</script>`));
  await writeFile(resolve(ROOT, 'dist/ui.html'), html);
  console.log('  dist/ui.html', `(${(html.length / 1024).toFixed(1)} KB${PROD ? ', minified' : ''})`);
}

async function writeDashHtml() {
  const result = await esbuild.build(dashBuild);
  const js = result.outputFiles[0].text;
  const shell = await readFile(resolve(ROOT, 'src/dashboard.html'), 'utf8');
  const html = minifyHtml(shell.replace('<!-- SCRIPT -->', `<script>${js}</script>`));
  await writeFile(resolve(ROOT, 'dist/dashboard.html'), html);
  // Also write index.html so static hosts (GitHub Pages, Vercel, Netlify) work out-of-the-box
  await writeFile(resolve(ROOT, 'dist/index.html'), html);
  console.log('  dist/index.html + dist/dashboard.html', `(${(html.length / 1024).toFixed(1)} KB${PROD ? ', minified' : ''})`);
}

if (WATCH) {
  const ctx = await esbuild.context(codeBuild);
  await ctx.watch();
  const uiCtx = await esbuild.context({
    ...uiBuild,
    plugins: [{
      name: 'rewrite-ui-html',
      setup(build) {
        build.onEnd(async () => {
          try { await writeUiHtml(); } catch (err) { console.error(err); }
        });
      },
    }],
  });
  await uiCtx.watch();
  const dashCtx = await esbuild.context({
    ...dashBuild,
    plugins: [{
      name: 'rewrite-dash-html',
      setup(build) {
        build.onEnd(async () => {
          try { await writeDashHtml(); } catch (err) { console.error(err); }
        });
      },
    }],
  });
  await dashCtx.watch();
  console.log('Watching... (dev mode, source maps on)');
} else {
  await Promise.all([
    esbuild.build(codeBuild),
    writeUiHtml(),
    writeDashHtml(),
  ]);
  console.log(`Build complete (${PROD ? 'production: minified + mangled' : 'development'}).`);
}
