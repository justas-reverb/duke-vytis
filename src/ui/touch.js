// Touch controls for a phone: the on-screen keys the Android build (android/) plays with, and a
// phone's browser.
//
// The game is driven by key codes alone -- Input holds the keys and fills the jump buffer, onKey
// in main.js works the menus -- so a touch here IS a key: each button dispatches the keydown and
// keyup a keyboard would, on the same window, and nothing else in the game knows touch exists.
// A replay records a thumb as it records a key. The pad went in the other way (gamepad.js writes
// into Input and hands onKey its codes) because a pad has buttons of its own that the screens
// name; a phone has none, so its buttons are the keys the screens already name.
//
// Which buttons:
//   < >      the arrows, held -- a thumb slides from one to the other without lifting
//   SPACE    the jump, held as long as the finger is down (HOLD TO CHAIN); start, choose, skip
//   ESC      the pause in a run, back everywhere else
//   ^ v      the menus' up and down, put away in a run
//   the top row: the keys the last frame drew as keycaps (menuskin.js watchCaps) -- S H O R on
//            the title, S Q on the pause, R G on the scoreboard -- so what a screen offers is
//            what its hints say, with no second list of every screen's keys to go stale.
//
// Every button is placed in CSS pixels from the viewport alone (touchLayout), and the same
// numbers place the elements and hit-test the fingers: the element under a finger is never
// asked, so a test drives all of it with no DOM (the fake page has none).

import { REPEAT_DELAY, REPEAT_RATE } from '../core/gamepad.js';

// Sizes in hundredths of the viewport's SHORT side [u; on a phone held sideways 1 u is 3.6 to
// 4.1 CSS pixels, so a 24 u button is 14-16 mm across, about a thumb].
const M = 3;                              // margin from the viewport's edges [u]
const MOVE = { w: 24, h: 26, gap: 2 };    // < and >, side by side at the bottom left [u]
const ARROW = { w: 24, h: 15, gap: 2 };   // ^ and v, stacked over them [u]
const JUMP = 34;                          // SPACE, round, bottom right: its diameter [u]
const KEY_H = 12;                         // ESC and the top row's keys: their height [u]
const KEY_GAP = 2;                        // between the top row's keys [u]
const SLOP = 2;                           // how far outside a button a finger still presses it [u]

/**
 * How long a key stays in the top row after a frame last drew its keycap [s; 0.25]. A hint that
 * fades or flashes must not make its button blink, and a screen that draws its keys every other
 * frame (a menu capped at 60 fps on a 120 Hz phone) must not either.
 */
const STRIP_HOLD = 0.25;

/** The buttons that are always there (`menu`: not in a run). */
const FIXED = [
  { id: 'left', code: 'ArrowLeft', label: '◀', cls: 'arrow' },
  { id: 'right', code: 'ArrowRight', label: '▶', cls: 'arrow' },
  { id: 'up', code: 'ArrowUp', label: '▲', cls: 'arrow', menu: true },
  { id: 'down', code: 'ArrowDown', label: '▼', cls: 'arrow', menu: true },
  { id: 'jump', code: 'Space', label: 'SPACE', sub: 'JUMP', cls: 'big round' },
  { id: 'esc', code: 'Escape', label: 'ESC' },
];
const FIXED_CODES = new Set(FIXED.map((b) => b.code));

/** The keys a held finger repeats outside a run, as a held key repeats: the menus' cursor. */
const REPEATS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

// A keycap's legend -> the key it names. The pad's own buttons (A, B, X, Y, LB, RB) name no key:
// a replay screen worded for a pad says them, and KeyA is a move-left key, not the pad's A.
const CAP_KEYS = {
  SPACE: 'Space', ESC: 'Escape', ENTER: 'Enter', DEL: 'Delete',
  LEFT: 'ArrowLeft', RIGHT: 'ArrowRight', UP: 'ArrowUp', DOWN: 'ArrowDown',
};
const PAD_LETTERS = new Set(['A', 'B', 'X', 'Y']);

/** The key a keycap's legend names, or null for a word that is not a key (ARROWS, HOLD). */
export function capCode(label) {
  if (CAP_KEYS[label]) return CAP_KEYS[label];
  if (/^[A-Z]$/.test(label) && !PAD_LETTERS.has(label)) return 'Key' + label;
  return null;
}

// The top row's order, so its buttons keep their places as screens come and go: the confirm
// first, then the title's keys as its hints read them, the rest after.
const ORDER = ['ENTER', 'S', 'H', 'O', 'R', 'G', 'N', 'Q', 'P', 'E', 'I', 'DEL', 'M', 'F'];
const rank = (s) => { const i = ORDER.indexOf(s); return i < 0 ? ORDER.length : i; };
const byOrder = (a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0);

// What a KeyboardEvent's `key` is for each code sent; nothing in the game reads it, but a page
// listening for keys expects it filled.
const KEY_OF = { Space: ' ', Escape: 'Escape', Enter: 'Enter', Delete: 'Delete',
  ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown' };
const keyOf = (code) => KEY_OF[code] || (code.startsWith('Key') ? code.slice(3).toLowerCase() : code);

/**
 * Where every button goes, in CSS pixels from the viewport's top left: { id: { x, y, w, h } },
 * the top row's keys as 'key:' + legend, right-aligned in `strip`'s order. Sized from the short
 * side, so held sideways or upright the buttons are the same size under the thumbs.
 */
export function touchLayout(vw, vh, strip = []) {
  const u = Math.min(vw, vh) / 100;
  const m = M * u;
  const r = {};
  const moveY = vh - m - MOVE.h * u;
  r.left = { x: m, y: moveY, w: MOVE.w * u, h: MOVE.h * u };
  r.right = { x: m + (MOVE.w + MOVE.gap) * u, y: moveY, w: MOVE.w * u, h: MOVE.h * u };
  // Over the gap between < and >, a little clear of them, so a thumb running left and right
  // does not brush one.
  const ax = m + ((2 * MOVE.w + MOVE.gap - ARROW.w) / 2) * u;
  r.down = { x: ax, y: moveY - (ARROW.gap + 1 + ARROW.h) * u, w: ARROW.w * u, h: ARROW.h * u };
  r.up = { x: ax, y: r.down.y - (ARROW.gap + ARROW.h) * u, w: ARROW.w * u, h: ARROW.h * u };
  r.jump = { x: vw - m - JUMP * u, y: vh - m - JUMP * u, w: JUMP * u, h: JUMP * u };
  r.esc = { x: m, y: m, w: 17 * u, h: KEY_H * u };
  // Right-aligned from the top right corner, and onto a second line under the first where a
  // line would reach ESC: a phone held upright has 100 u across, and the replays' list offers
  // eight keys.
  const left = r.esc.x + r.esc.w + KEY_GAP * u;
  let x = vw - m, y = m;
  for (let i = strip.length - 1; i >= 0; i--) {
    const w = Math.max(KEY_H, 5 + 4.4 * strip[i].length) * u;
    if (x - w < left && x < vw - m) { x = vw - m; y += (KEY_H + KEY_GAP) * u; }
    x -= w;
    r['key:' + strip[i]] = { x, y, w, h: KEY_H * u };
    x -= KEY_GAP * u;
  }
  return r;
}

/**
 * Whether this page is played by touch: `?touch` in the address says yes (the Android build
 * loads it so), `?notouch` no, and otherwise a device whose only pointer is coarse -- a phone, a
 * tablet -- is. A laptop with a touch screen has a fine pointer too and keeps its keyboard.
 */
export function touchWanted(loc = globalThis.location, win = globalThis.window) {
  let q = '';
  try { q = String((loc && loc.search) || ''); } catch (e) { /* none */ }
  const has = (k) => new RegExp('[?&]' + k + '(=|&|$)').test(q);
  if (has('notouch')) return false;
  if (has('touch')) return true;
  try {
    return !!(win && win.matchMedia && win.matchMedia('(pointer: coarse)').matches
      && !win.matchMedia('(any-pointer: fine)').matches);
  } catch (e) { return false; }
}

const CSS = `
#touch{position:fixed;inset:0;z-index:5;touch-action:none;-webkit-user-select:none;user-select:none;
  -webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}
#touch .tb{position:absolute;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;
  justify-content:center;border:.5vmin solid rgba(232,200,112,.55);border-radius:1.8vmin;
  background:rgba(12,8,22,.38);color:rgba(255,240,200,.92);font:700 4.4vmin/1 ui-monospace,Consolas,monospace;
  text-shadow:0 .3vmin 0 #000;pointer-events:none}
#touch .tb.round{border-radius:50%}
#touch .tb.big{font-size:5.4vmin}
#touch .tb.arrow{font-size:7vmin}
#touch .tb.on{background:rgba(232,200,112,.45);color:#fff}
#touch .tb small{font-size:2.8vmin;opacity:.8;margin-top:.8vmin}
`;

export class TouchControls {
  /**
   * @param opts.target  where the key events go (window: Input and main.js listen there)
   * @param opts.win     whose innerWidth and innerHeight the buttons are laid out in (window)
   * @param opts.doc     where the buttons are made (document); one with no body makes none and
   *                     the controls work the same, driven through pointer() (the tests)
   * @param opts.mode    () => 'run' or 'menu': in a run ^ and v are put away
   */
  constructor({ target, win, doc, mode = () => 'menu' } = {}) {
    this.target = target || globalThis.window;
    this.win = win || globalThis.window;
    this.doc = doc || globalThis.document;
    this.mode = mode;
    this.seen = new Set();       // the legends the last frame drew as keycaps (main.js watchCaps)
    this.lastSeen = new Map();   // legend -> the clock when a frame last drew it
    this.t = 0;                  // this clock [s]
    this.held = new Map();       // key code -> how many fingers hold it
    this.rep = new Map();        // key code -> seconds to its next repeat
    this.fingers = new Map();    // pointerId -> { id: the button it went down on, code }
    this.list = [];              // the buttons on screen now, laid out (buttons())
    this.sig = '';               // what `list` was laid out for
    this.root = null;
    this.els = new Map();
    this.dirty = true;
    // A blur empties Input's held keys; the fingers still down let go here too, or a thumb on >
    // when the phone locked would come back as a key never released.
    if (this.target && this.target.addEventListener) this.target.addEventListener('blur', () => this.releaseAll());
    this.relayout();
    this.mount();
  }

  /** The set the frame's drawing collects its keycaps into, emptied (main.js renderFrame). */
  beginCaps() { this.seen.clear(); return this.seen; }

  /** One animation frame, before its steps (main.js, the Loop's onFrame): repeats, the layout, the elements. */
  frame(dt) {
    this.t += dt;
    for (const s of this.seen) this.lastSeen.set(s, this.t);
    // A held arrow repeats outside a run as a held key does, at the pad's cadence -- once on the
    // press, again after REPEAT_DELAY, then every REPEAT_RATE -- and at most once a frame, so a
    // stall does not scroll a list by three. In a run nothing reads a repeat.
    if (this.mode() !== 'run') {
      for (const [code, left] of this.rep) {
        let r = left - dt;
        if (r <= 0) {
          r += REPEAT_RATE;
          if (r <= 0) r = REPEAT_RATE;
          this.send('keydown', code, true);
        }
        this.rep.set(code, r);
      }
    }
    this.relayout();
    this.render();
  }

  /** The top row's legends, in ORDER: each drawn within STRIP_HOLD, or held down now. */
  strip() {
    const out = [];
    for (const [label, at] of this.lastSeen) {
      const code = capCode(label);
      if (!code || FIXED_CODES.has(code)) continue;
      if (this.t - at <= STRIP_HOLD || this.held.get(code) > 0) out.push(label);
    }
    return out.sort(byOrder);
  }

  /** Lay the buttons out again if the viewport, the mode or the top row changed. */
  relayout() {
    const vw = (this.win && this.win.innerWidth) || 0, vh = (this.win && this.win.innerHeight) || 0;
    const run = this.mode() === 'run';
    const strip = this.strip();
    const sig = `${vw}x${vh}|${run ? 'run' : 'menu'}|${strip.join(',')}`;
    if (sig === this.sig) return;
    this.sig = sig;
    const R = touchLayout(vw, vh, strip);
    const list = [];
    for (const b of FIXED) if (!(run && b.menu)) list.push({ ...b, ...R[b.id] });
    for (const label of strip) list.push({ id: 'key:' + label, code: capCode(label), label, ...R['key:' + label] });
    this.list = list;
    this.dirty = true;
  }

  /** The buttons on screen now: [{ id, code, label, x, y, w, h, on }], CSS pixels. */
  buttons() {
    this.relayout();
    return this.list.map((b) => ({ ...b, on: this.held.get(b.code) > 0 }));
  }

  /** The button a finger at (x, y) presses: the nearest whose box, grown by SLOP, holds it. */
  hit(x, y) {
    const s = SLOP * Math.min(this.win.innerWidth, this.win.innerHeight) / 100;
    let best = null, bestD = Infinity;
    for (const b of this.list) {
      if (x < b.x - s || x > b.x + b.w + s || y < b.y - s || y > b.y + b.h + s) continue;
      const dx = x - (b.x + b.w / 2), dy = y - (b.y + b.h / 2);
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  /**
   * A finger: `type` 'down', 'move' or 'up' (a cancel is an up), `id` its pointerId, (x, y) in
   * CSS pixels. True if it is on a button. Each finger holds one key; two on one key hold it once.
   */
  pointer(type, id, x, y) {
    if (type === 'down') {
      this.relayout();
      const b = this.hit(x, y);
      this.fingers.set(id, b ? { id: b.id, code: b.code } : { id: null, code: null });
      if (b) this.press(b.code);
      return !!b;
    }
    const f = this.fingers.get(id);
    if (!f) return false;
    if (type === 'move') {
      // A thumb running on the arrows slides from one to the other: once it is over the other's
      // width, whatever its height, it lets go of this one and takes that. Off both it keeps the
      // one it had -- a thumb drifting up off > mid-run must not stop him dead.
      if (f.id !== 'left' && f.id !== 'right') return !!f.id;
      const other = this.list.find((b) => b.id === (f.id === 'left' ? 'right' : 'left'));
      if (other && x >= other.x && x <= other.x + other.w) {
        this.release(f.code);
        f.id = other.id;
        f.code = other.code;
        this.press(f.code);
      }
      return true;
    }
    this.fingers.delete(id);
    if (f.code) this.release(f.code);
    return !!f.id;
  }

  press(code) {
    const n = (this.held.get(code) || 0) + 1;
    this.held.set(code, n);
    if (n > 1) return;
    this.send('keydown', code, false);
    if (REPEATS.has(code)) this.rep.set(code, REPEAT_DELAY);
    this.dirty = true;
  }

  release(code) {
    const n = (this.held.get(code) || 0) - 1;
    if (n > 0) { this.held.set(code, n); return; }
    if (!this.held.delete(code)) return;
    this.rep.delete(code);
    this.send('keyup', code, false);
    this.dirty = true;
  }

  /** Every finger lets go. */
  releaseAll() {
    this.fingers.clear();
    for (const code of [...this.held.keys()]) { this.held.set(code, 1); this.release(code); }
  }

  send(type, code, repeat) {
    const key = keyOf(code);
    let e;
    if (typeof KeyboardEvent === 'function') {
      e = new KeyboardEvent(type, { code, key, repeat, bubbles: true, cancelable: true });
    } else {
      e = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(e, { code, key, repeat });
    }
    this.target.dispatchEvent(e);
  }

  // --- the elements ----------------------------------------------------------------------------

  /** Make the layer and its style, where there is a document to make them in. */
  mount() {
    const d = this.doc;
    if (!d || !d.body || typeof d.createElement !== 'function') return false;
    const style = d.createElement('style');
    style.textContent = CSS;
    (d.head || d.body).appendChild(style);
    const root = d.createElement('div');
    root.id = 'touch';
    d.body.appendChild(root);
    // The layer takes every finger on the page and says which button it is on. The window still
    // hears each one (it bubbles): main.js's listeners take the focus, ask for the sound and wake
    // the title's idle view on it, as for a click.
    const on = (type, kind) => root.addEventListener(type, (e) => {
      if (kind === 'down') { try { root.setPointerCapture(e.pointerId); } catch (err) { /* gone */ } }
      this.pointer(kind, e.pointerId, e.clientX, e.clientY);
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    on('pointerdown', 'down');
    on('pointermove', 'move');
    on('pointerup', 'up');
    on('pointercancel', 'up');
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.root = root;
    this.dirty = true;
    this.render();
    return true;
  }

  render() {
    if (!this.root || !this.dirty) return;
    this.dirty = false;
    const d = this.doc;
    const shown = new Set();
    const px = (v) => Math.round(v * 10) / 10 + 'px';
    for (const b of this.list) {
      let el = this.els.get(b.id);
      if (!el) {
        el = d.createElement('div');
        el.className = 'tb' + (b.cls ? ' ' + b.cls : '');
        el.textContent = b.label;
        if (b.sub) { const s = d.createElement('small'); s.textContent = b.sub; el.appendChild(s); }
        this.root.appendChild(el);
        this.els.set(b.id, el);
      }
      const st = el.style;
      st.left = px(b.x); st.top = px(b.y); st.width = px(b.w); st.height = px(b.h);
      st.display = '';
      el.classList.toggle('on', this.held.get(b.code) > 0);
      shown.add(b.id);
    }
    for (const [id, el] of this.els) if (!shown.has(id)) el.style.display = 'none';
  }
}
