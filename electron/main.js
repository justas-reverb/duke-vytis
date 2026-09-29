// The desktop shell.
//
// Everything the game is lives in src/ and runs unchanged in a browser; this is the
// window it gets when it is an application instead of a tab. Nothing about the game
// knows it is here beyond one optional bridge (see preload.cjs), so `npm run serve`
// and the packaged exe are running the same code.
//
// --- why a custom scheme and not file:// --------------------------------------
//
// The game is ES modules and it fetch()es its optional sound samples. Browsers -- and
// Chromium inside Electron is a browser -- refuse both over file://, and refuse them
// silently enough that the page just looks broken. index.html says so in as many words
// because that failure has been hit before.
//
// The usual answer is to start an HTTP server inside the app and point the window at
// localhost. That works and it is what play.bat does, but it means a packaged game
// opens a listening socket, picks a port that something else may already have, and
// trips whatever firewall prompt Windows feels like showing. A privileged scheme gets
// the same module and fetch semantics with no socket and no port: `standard` makes it
// URL-resolvable like http, `secure` puts it in a secure context, and supportFetchAPI
// lets the sample loader work.

import { app, BrowserWindow, Menu, dialog, ipcMain, protocol, shell } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerReplayFiles } from './replayfiles.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SCHEME = 'vytis';
const ORIGIN = `${SCHEME}://game`;

// A packaged game that cannot be asked whether it works is one somebody has to
// double-click to find out about. `"Duke Vytis.exe" --smoke` boots the real build with
// the window rendering offscreen and the audio muted, checks that it served its modules
// and painted a frame, prints what it found and exits with a status -- no window, no
// sound, no crusade march starting up while somebody is on a call.
const SMOKE = process.argv.includes('--smoke');

// `"Duke Vytis.exe" --mute` boots the real game, window and all, with the sound off.
//
// For launching a build to look at it while somebody is on a call, or in a room, or
// twenty times in an afternoon. The page already honours ?mute (and a localStorage flag
// beside it); this is the same switch reachable from the command line, so nothing new
// has to be maintained in the audio layer.
const MUTE = process.argv.includes('--mute');
if (SMOKE) {
  await import('./smoke.js');
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
};

/**
 * Serve one file out of the app directory.
 *
 * Read through fs rather than handed to net.fetch as a file URL, because in a packaged
 * build these paths are inside app.asar -- fs sees through the archive and a file URL
 * does not.
 */
async function serve(request) {
  let rel;
  try {
    rel = decodeURIComponent(new URL(request.url).pathname);
  } catch {
    return new Response('bad url', { status: 400 });
  }
  if (rel === '' || rel === '/') rel = '/index.html';

  // path.join normalises away any ../, and the containment check is what makes that
  // load-bearing rather than incidental.
  const full = path.join(ROOT, rel);
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) {
    return new Response('forbidden', { status: 403 });
  }
  try {
    const body = await fs.readFile(full);
    return new Response(body, {
      status: 200,
      headers: { 'content-type': TYPES[path.extname(full).toLowerCase()] || 'application/octet-stream' },
    });
  } catch {
    // A missing file is ordinary here: loadSamples() probes for sound files that a
    // build is not required to have, and treats 404 as "synthesise it instead".
    return new Response('not found', { status: 404 });
  }
}

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 640,
    minHeight: 360,
    // Fullscreen from the first frame. A game that opens in a resizable window with a
    // menu bar is the thing this shell exists to stop being.
    fullscreen: true,
    show: false,
    backgroundColor: '#05030a',
    autoHideMenuBar: true,
    title: 'Duke Vytis and the Quest for New Lands',
    icon: path.join(ROOT, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(HERE, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Chromium throttles timers and rAF in a window it thinks is in the background.
      // For a game that is the difference between alt-tabbing back to a paused-looking
      // screen and alt-tabbing back to the run you left.
      backgroundThrottling: false,
      // Sound with no gesture first. A browser holds a page's AudioContext until a click, a
      // key or a touch -- a gamepad button is none of those -- so a player with only a pad
      // would never hear the game; here the context comes up running and a pad press alone
      // (main.js ensureAudio, through the pad's onTouch) brings it back if anything stops it.
      // This is Electron's default, written down so the desktop build does not hang on one.
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  // Show only once there is a frame to show, or the first thing the player sees is a
  // white rectangle while Chromium starts up.
  win.once('ready-to-show', () => {
    win.show();
    win.focus();
    sendFullscreen();
  });

  for (const ev of ['enter-full-screen', 'leave-full-screen']) win.on(ev, sendFullscreen);

  // The game owns every key. Kill the menu so Alt does not open one and Ctrl+R cannot
  // reload a run out from under the player, but keep one way into devtools -- a
  // packaged game with no console is very hard to diagnose a report against.
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12') { win.webContents.toggleDevTools(); e.preventDefault(); }
  });

  // Nothing in this app should ever navigate anywhere or open a second window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN)) e.preventDefault();
  });

  win.loadURL(`${ORIGIN}/index.html${MUTE ? '?mute' : ''}`);
}

function sendFullscreen() {
  if (win && !win.isDestroyed()) win.webContents.send('shell:fullscreen', win.isFullScreen());
}

// Must happen before 'ready'.
if (!SMOKE) {
  protocol.registerSchemesAsPrivileged([{
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  }]);
}

// A second copy of a game competing for the same save file helps nobody.
if (SMOKE) {
  // smoke.js owns the whole lifecycle; nothing below should run.
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  Menu.setApplicationMenu(null);

  app.whenReady().then(() => {
    protocol.handle(SCHEME, serve);
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => app.quit());

  ipcMain.on('shell:toggle-fullscreen', () => {
    if (!win || win.isDestroyed()) return;
    win.setFullScreen(!win.isFullScreen());
  });

  ipcMain.on('shell:quit', () => app.quit());

  // A replay file out and in: the save and open dialogs (electron/replayfiles.js).
  registerReplayFiles({ ipcMain, dialog, fs, path, app, getWindow: () => win });
}
