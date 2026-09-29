// Boot the desktop build and prove it actually came up.
//
//   npx electron electron/smoke.js [out.png]
//
// Same protocol handler and same preload as main.js, but the window renders OFFSCREEN
// and the audio is muted at the Chromium level: this has to be runnable while somebody
// is working without a fullscreen window taking over the display or a crusade march
// starting up unannounced.
//
// It exists because "it builds" and "it runs" are different claims. A packaged Electron
// app can produce a perfectly valid exe that opens a black window because one module
// 404ed behind a custom scheme, and the only honest way to tell the difference is to
// start it, read the console, and LOOK at a frame.
//
// Exits non-zero, loudly, on: a failed load, a renderer console error, the boot overlay
// still being on screen (index.html leaves it up with the reason), no canvas, the
// preload bridge not exposed, or no frame painted at all. It lists every 404 but does
// not judge the frame it captures -- nothing checks for one that is all one colour --
// so open the PNG.

import { app, BrowserWindow, protocol } from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SCHEME = 'vytis';
const OUT = process.argv.find((a) => a.endsWith('.png')) || 'smoke.png';

// The backing store, read from the game's own constants rather than repeated here.
const { SW, SH } = await import('../src/game/constants.js');

protocol.registerSchemesAsPrivileged([{
  scheme: SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
}]);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png',
};

const missing = [];

async function serve(request) {
  let rel = decodeURIComponent(new URL(request.url).pathname);
  if (rel === '' || rel === '/') rel = '/index.html';
  const full = path.join(ROOT, rel);
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return new Response('forbidden', { status: 403 });
  try {
    const body = await fsp.readFile(full);
    return new Response(body, {
      status: 200,
      headers: { 'content-type': TYPES[path.extname(full).toLowerCase()] || 'application/octet-stream' },
    });
  } catch {
    missing.push(rel);
    return new Response('not found', { status: 404 });
  }
}

app.commandLine.appendSwitch('mute-audio');
app.disableHardwareAcceleration();   // offscreen rendering wants the software path

const errors = [];
let done = false;

function finish(code, why) {
  if (done) return;
  done = true;
  console.log(`\n  ${code === 0 ? 'SMOKE PASS' : 'SMOKE FAIL'} - ${why}`);
  app.exit(code);
}

app.whenReady().then(async () => {
  protocol.handle(SCHEME, serve);

  // Sized to the backing store, not to a literal. At 960x540 against a 1920x1080
  // buffer the smoke capture would be a half-scale downsample of the frame, which is
  // the one thing this tool exists to show faithfully.
  const win = new BrowserWindow({
    width: SW, height: SH, show: false,
    webPreferences: {
      preload: path.join(HERE, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      offscreen: true,
    },
  });

  win.webContents.on('console-message', (e) => {
    // Electron 37+ passes an event object; older builds passed positional args.
    const level = typeof e === 'object' ? e.level : arguments[1];
    const message = typeof e === 'object' ? e.message : arguments[2];
    if (level === 'error' || level === 3) errors.push(message);
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    finish(1, `did-fail-load ${code} ${desc} ${url}`);
  });

  let frame = null;
  win.webContents.on('paint', (_e, _dirty, image) => { frame = image; });
  win.webContents.setFrameRate(30);

  await win.loadURL(`${SCHEME}://game/index.html`);

  // Let the attract demo actually run: the menu draws a live simulation behind it, so
  // a frame grabbed the instant the page loads proves much less than one grabbed after
  // the loop has been turning for a few seconds.
  await new Promise((r) => setTimeout(r, 6000));

  const state = await win.webContents.executeJavaScript(`(() => {
    const boot = document.getElementById('boot');
    const c = document.getElementById('screen');
    return {
      boot: boot ? boot.textContent : null,
      canvas: c ? [c.width, c.height] : null,
      shell: typeof window.gameShell === 'object' && window.gameShell !== null,
    };
  })()`);

  console.log(`  canvas     ${state.canvas ? state.canvas.join(' x ') : 'MISSING'}`);
  console.log(`  shell API  ${state.shell ? 'exposed' : 'MISSING'}`);
  console.log(`  404s       ${missing.length ? missing.join(', ') : 'none'}`);
  console.log(`  errors     ${errors.length ? errors.length : 'none'}`);
  for (const e of errors.slice(0, 8)) console.log(`    ${e}`);

  if (frame) {
    fs.writeFileSync(OUT, frame.toPNG());
    const size = frame.getSize();
    console.log(`  frame      ${size.width}x${size.height} -> ${OUT}`);
  }

  if (state.boot !== null) return finish(1, `boot overlay still showing: ${state.boot.slice(0, 200)}`);
  if (!state.canvas) return finish(1, 'no canvas in the document');
  if (!state.shell) return finish(1, 'the preload bridge is not exposed');
  if (errors.length) return finish(1, `${errors.length} console error(s)`);
  if (!frame) return finish(1, 'the renderer never painted a frame');
  finish(0, 'the desktop build boots, serves its modules and draws');
});
