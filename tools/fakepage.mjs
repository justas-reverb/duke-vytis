// A browser page for src/main.js, in node: just enough window, document, storage and
// navigator to boot the REAL entry point and drive it with key events and fake pads.
//
// Written for test-gamepad and test-web, which need to prove things about main.js's
// wiring (a pad's Start pausing a run, F doing nothing inside a frame that forbids
// fullscreen, blocked storage) that no module can show on its own. It drives the
// simulation only -- update(), never renderFrame() -- so booting costs the module-load
// warm-ups and nothing per frame.
//
// window and document are EventTargets, so key events travel the same listeners in the
// same order as in a browser: Input's keydown first (it is constructed first), then
// main.js's.

import { installDom, HeadlessCanvas } from './headless.mjs';

export const PAD_BUTTONS = 17;

/** A connected pad in the W3C standard mapping, everything released and centred. */
export function makePad(index, { id = 'Fake Pad (STANDARD GAMEPAD)', mapping = 'standard' } = {}) {
  return {
    index, id, mapping, connected: true, timestamp: 0,
    buttons: Array.from({ length: PAD_BUTTONS }, () => ({ pressed: false, touched: false, value: 0 })),
    axes: [0, 0, 0, 0],
  };
}
export const press = (pad, b) => { pad.buttons[b] = { pressed: true, touched: true, value: 1 }; };
export const release = (pad, b) => { pad.buttons[b] = { pressed: false, touched: false, value: 0 }; };
export const tilt = (pad, x, y = 0) => { pad.axes[0] = x; pad.axes[1] = y; };

/** Dispatch a key event the way a browser would; returns it (for defaultPrevented). */
export function key(target, type, code, extra = {}) {
  const e = new Event(type, { cancelable: true });
  Object.assign(e, { code, repeat: false }, extra);
  target.dispatchEvent(e);
  return e;
}

/**
 * Install the globals.
 *
 * @param opts.storage            'memory' (works) or 'blocked' (every access throws, as a
 *                                third-party frame with storage refused does)
 * @param opts.fullscreenEnabled  false as in an iframe without allowfullscreen
 * @param opts.focused            what document.hasFocus() answers; change page.focused
 * @param opts.seed               Math.random is replaced by a seeded stream, so the
 *                                tower a run gets -- and whether a test's idle second
 *                                on it ends in a fall -- is the same every time
 */
export function installPage({ storage = 'memory', fullscreenEnabled = true, focused = true, seed = 1 } = {}) {
  installDom();
  let s = seed >>> 0;
  Math.random = () => {      // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const headless = globalThis.document;
  const page = { focused, pads: [], fullscreenRequests: 0, closeCalls: 0 };

  const win = new EventTarget();
  Object.assign(win, {
    innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1, closed: false,
    focus() {}, close() { page.closeCalls++; },
  });

  const els = new Map();
  for (const id of ['boot', 'focus-hint', 'saves-off']) {
    els.set(id, { id, hidden: true, textContent: '', style: {}, remove() {} });
  }
  // Starts at 1x1 like any headless canvas; the Renderer sizes it, as it does the page's.
  // focus() counts, so a test can see the game take the keyboard on a click.
  const screen = new HeadlessCanvas(1, 1);
  page.canvasFocus = 0;
  screen.focus = () => { page.canvasFocus++; };
  els.set('screen', screen);

  const doc = new EventTarget();
  Object.assign(doc, {
    __headless: true,
    createElement: headless.createElement,
    getElementById: (id) => els.get(id) || null,
    hidden: false,
    fullscreenEnabled,
    fullscreenElement: null,
    hasFocus: () => page.focused,
    exitFullscreen: () => Promise.resolve(),
    documentElement: {
      // What a browser does: resolve where fullscreen is allowed, reject where the frame
      // forbids it. The rejection is the "Uncaught (in promise)" the game must not cause.
      requestFullscreen() {
        page.fullscreenRequests++;
        return fullscreenEnabled ? Promise.resolve()
          : Promise.reject(new TypeError('Permissions check failed'));
      },
    },
  });

  globalThis.window = win;
  globalThis.document = doc;
  globalThis.location = { protocol: 'http:', search: '?mute', href: 'http://127.0.0.1/duke/index.html' };
  Object.defineProperty(globalThis, 'navigator', {
    value: { getGamepads: () => page.pads }, configurable: true, writable: true,
  });
  let raf = 0;
  globalThis.requestAnimationFrame = () => ++raf;   // never fires; tests drive frames
  globalThis.cancelAnimationFrame = () => {};

  if (storage === 'blocked') {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException("Failed to read the 'localStorage' property from 'Window': "
          + 'Access is denied for this document.', 'SecurityError');
      },
    });
  } else {
    // length and key() too, as a browser's has: the replay store lists its keys with them,
    // and without them every replay it kept looked gone the next time it looked.
    const m = new Map();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true, writable: true,
      value: {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => { m.set(k, String(v)); },
        removeItem: (k) => { m.delete(k); },
        key: (i) => [...m.keys()][i] ?? null,
        get length() { return m.size; },
      },
    });
    page.storage = m;
  }

  Object.assign(page, { win, doc, els });
  return page;
}

/**
 * Import main.js and stop its loop, so frames are only the ones a test asks for. `url`
 * boots another copy of it -- test-web boots the PACKAGED one, so node's own module
 * loader proves the package holds every module the game imports.
 */
export async function bootMain(url = '../src/main.js') {
  await import(url);
  const V = globalThis.window.VYTIS;
  V.loop.stop();
  return V;
}

/** One animation frame: the pad poll, then the frame's simulation steps. */
export function frame(V, dt = 1 / 60) {
  V.loop.onFrame(dt);
  const n = Math.round(dt / V.STEP);
  for (let i = 0; i < n; i++) V.update(V.STEP);
}
