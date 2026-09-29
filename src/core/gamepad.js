// Gamepads, read into the same Input the keyboard writes.
//
// Steam, the Steam Deck and a phone with a controller all need a pad, and the game was
// keyboard-only. The Gamepad API has no events for buttons -- only a snapshot you ask
// for -- so this polls navigator.getGamepads() once per animation frame (the Loop's
// onFrame, before that frame's simulation steps) and turns what changed into the two
// things the rest of the game already understands:
//
//   In play, key presses on the Input: the D-pad and the left stick hold 'PadLeft' or
//   'PadRight', and A presses 'PadA', a jump key. They go through Input.padDown/padUp,
//   the keydown handler's own work, so `axis`, `jumpHeld` and the jump buffer come out
//   exactly as they do for a keyboard, and a replay records a pad as it records keys.
//   Nothing here touches the simulation directly; that is the whole design.
//
//   In the menus, key CODES handed to onKey: the D-pad and stick flicks arrive as the
//   arrow keys, A as Space, B as Escape, Back as O (the options) and Start, X and Y as
//   'PadStart', 'PadX' and 'PadY', which main.js turns into the key the screen on show
//   wants (Start is Escape in a run and Enter outside one; Y is S, the stats; X is H,
//   the help, or Q from the pause). main.js feeds them to the same handler its keydown
//   listener runs, so there is one copy of the menu logic, not two.
//
// Button numbers are the W3C "standard" mapping, which Chromium (and so Electron and the
// Steam Deck, whose Steam Input presents an Xbox pad) reports for every common pad. A pad
// the browser cannot map reports mapping '' with its buttons in the maker's order; it is
// read with the standard numbers anyway, because a pad that half works beats one that
// silently does nothing, and axes 0 and 1 are the left stick on nearly all of them.

// The stick is digital here, as the keys are: `axis` is -1, 0 or 1 and the physics was
// tuned for that. Hysteresis is what keeps a resting stick from drifting and a stick held
// near the threshold from chattering: it engages past ENGAGE and lets go only under
// RELEASE. Both are fractions of full deflection (0..1); a worn stick rests at 0.05-0.2.
export const STICK_ENGAGE = 0.5;
export const STICK_RELEASE = 0.3;

// A held direction in the menus repeats like a held arrow key: once on the press, again
// after REPEAT_DELAY, then every REPEAT_RATE. Seconds; the OS keyboard default is about
// 0.5 then 0.033, which is far too fast to steer a menu with a thumb.
export const REPEAT_DELAY = 0.4;
export const REPEAT_RATE = 0.1;

// W3C standard mapping.
export const BTN = {
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7,
  BACK: 8, START: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15, HOME: 16,
};
const NBTN = 17;

// Direction -> [its D-pad button, the key code a menu gets].
const DIRS = {
  up: [BTN.UP, 'ArrowUp'],
  down: [BTN.DOWN, 'ArrowDown'],
  left: [BTN.LEFT, 'ArrowLeft'],
  right: [BTN.RIGHT, 'ArrowRight'],
};
const DIR_NAMES = Object.keys(DIRS);

// Face and system buttons -> the code a menu gets. Pressed once per press, never
// repeated: a held A must not page through the whole guide. X and Y were left out at
// first, and with them every screen only a letter opens: a player on a pad alone could
// not reach the stats or the help, nor leave a paused run for the title. The shoulders came
// with the replays: on the scoreboard A, B, X, Y and Start were all spoken for, so RB is
// the instant replay (R) and LB the race against the best run (G); main.js says what each
// means on the other screens (the title, the replays, a replay being watched).
const PRESSES = [
  [BTN.A, 'Space'],
  [BTN.B, 'Escape'],
  [BTN.X, 'PadX'],
  [BTN.Y, 'PadY'],
  [BTN.START, 'PadStart'],
  [BTN.BACK, 'KeyO'],
  [BTN.LB, 'PadLB'],
  [BTN.RB, 'PadRB'],
];

/** One step of the play axis's hysteresis: -1, 0 or 1 from the last value and stick x. */
export function stickAxis(prev, x) {
  if (prev > 0 && x >= STICK_RELEASE) return 1;
  if (prev < 0 && x <= -STICK_RELEASE) return -1;
  if (x >= STICK_ENGAGE) return 1;
  if (x <= -STICK_ENGAGE) return -1;
  return 0;
}

/**
 * One step of the menu direction's hysteresis: 'up', 'down', 'left', 'right' or null.
 *
 * Unlike the play axis this picks ONE direction, the stronger of the two: a thumb
 * flicking down a list is never exactly vertical, and reading both components would
 * change the option's value every time the cursor moved.
 */
export function stickDir(prev, x, y) {
  if (prev) {
    const along = prev === 'up' ? -y : prev === 'down' ? y : prev === 'left' ? -x : x;
    if (along >= STICK_RELEASE) return prev;
  }
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ax < STICK_ENGAGE && ay < STICK_ENGAGE) return null;
  if (ax >= ay) return x > 0 ? 'right' : 'left';
  return y > 0 ? 'down' : 'up';   // standard mapping: stick down is +y
}

const isDown = (b) => (b == null ? false
  : typeof b === 'number' ? b > 0.5
  : !!b.pressed);
const num = (v) => (Number.isFinite(v) ? v : 0);

function newPad() {
  return {
    now: new Array(NBTN).fill(false),
    was: new Array(NBTN).fill(false),
    fresh: new Array(NBTN).fill(false),   // pressed this poll, and news (see poll)
    x: 0,              // play axis after hysteresis
    dir: null,         // menu direction after hysteresis
    nx: 0,             // this poll's reading of both, before it is judged a touch
    nd: null,
    rep: { up: -1, down: -1, left: -1, right: -1 },   // seconds to next repeat; -1 idle
    active: false,     // touched this poll
  };
}

/** Whether a pad is holding a menu direction this poll, on the D-pad or the stick. */
const holdsDir = (st, name) => st.nd === name || !!st.now[DIRS[name][0]];

export class Gamepad {
  /**
   * @param input  the game's Input
   * @param opts.onKey   (code) => void, a menu key press or repeat
   * @param opts.onLost  () => void, the pad that was driving went away
   * @param opts.onTouch () => void, a pad was touched this poll (a press, or the stick
   *                     engaging or turning), before its menu keys are handed on
   * @param opts.nav     where getGamepads lives (tests pass a fake)
   * @param opts.target  where the connect events arrive (window)
   */
  constructor(input, { onKey = null, onLost = null, onTouch = null, nav, target } = {}) {
    this.input = input;
    this.onKey = onKey;
    this.onLost = onLost;
    this.onTouch = onTouch;
    this.nav = nav || (typeof navigator !== 'undefined' ? navigator : null);
    this.pads = new Map();   // gamepad.index -> state
    this.driver = -1;        // the index of the pad that drives; the last one touched
    // Set when the browser refuses the API outright -- a cross-origin iframe whose
    // permissions policy leaves out `gamepad` throws a SecurityError on every call.
    // Asked once and then left alone, rather than throwing sixty times a second.
    this.blocked = false;
    this._seen = new Set();

    const t = target || (typeof window !== 'undefined' ? window : null);
    if (t && t.addEventListener) {
      // Polling also notices a pad that vanished, but the event says so at once, and a
      // pad pulled out mid-jump should pause the game now, not on the next frame.
      t.addEventListener('gamepaddisconnected', (e) => {
        if (e && e.gamepad) this._lose(e.gamepad.index);
      });
    }
  }

  /** Every connected pad, or none. Never throws. */
  _read() {
    if (this.blocked || !this.nav || typeof this.nav.getGamepads !== 'function') return [];
    try {
      return this.nav.getGamepads() || [];
    } catch (e) {
      this.blocked = true;
      console.warn('gamepads unavailable here:', e && e.message ? e.message : e);
      return [];
    }
  }

  /** Read every pad once. `dt` is the frame's length in seconds, for the menu repeat. */
  poll(dt) {
    const list = this._read();
    const seen = this._seen;
    seen.clear();

    // Every pad is read before any is judged, so that each one's news can be weighed
    // against what the driving pad is doing THIS frame, in whatever order they are listed.
    for (let i = 0; i < list.length; i++) {
      const gp = list[i];
      if (!gp || gp.connected === false) continue;
      seen.add(gp.index);
      let st = this.pads.get(gp.index);
      if (!st) { st = newPad(); this.pads.set(gp.index, st); }
      // A button past the standard seventeen (a DualSense's touchpad click is the
      // eighteenth) still says which pad is in someone's hands, so it is read too -- and
      // like the rest, only its PRESS is a touch. It used to count every frame it was
      // held, so a held touchpad took lastDevice back from the keyboard each frame and
      // took the driving from the pad actually being played.
      const b = gp.buttons || [];
      const nb = Math.max(NBTN, b.length);
      for (let k = 0; k < nb; k++) st.now[k] = isDown(b[k]);
      const ax = gp.axes || [];
      const x = num(ax[0]);
      const y = num(ax[1]);
      st.nx = stickAxis(st.x, x);
      st.nd = stickDir(st.dir, x, y);
    }

    // A pad that is no longer listed has gone, whether or not the event said so.
    for (const index of this.pads.keys()) if (!seen.has(index)) this._lose(index);

    // A touch is a button's press, or the stick engaging or turning -- but not one the
    // driving pad is making at the same moment. One controller can reach the page as two
    // pads (Steam Input presents a PlayStation pad as a virtual Xbox one, and a browser
    // that also reads the real one sees both), and the two copies of a press need not
    // land in the same poll. Counted as two players, the late copy took the driving
    // across: the handover let go of the jump, cutting it to a hop in mid-air, and the
    // copy refilled the jump buffer and pressed the menu key a second time. A second
    // player still takes over with anything the first is not already doing.
    const drv = this.pads.get(this.driver) || null;
    let touched = -1;
    for (const [index, st] of this.pads) {
      const other = drv && drv !== st ? drv : null;
      let edge = false;
      // `fresh` is a press that is news: what the jump and the menu keys act on.
      for (let k = 0; k < st.now.length; k++) {
        st.fresh[k] = st.now[k] && !st.was[k] && !(other && other.now[k]);
        if (st.fresh[k]) edge = true;
      }
      if (st.nx !== 0 && st.nx !== st.x && !(other && other.nx === st.nx)) edge = true;
      if (st.nd && st.nd !== st.dir && !(other && holdsDir(other, st.nd))) edge = true;
      st.x = st.nx;
      st.dir = st.nd;
      st.active = edge;
      if (edge) touched = index;
    }

    // Two pads: the last one used drives, and the one it takes over from lets go of what
    // it held (_handover), so a stick left pushed on the old pad does not keep running
    // the Duke into a wall.
    if (touched >= 0) {
      this.input.lastDevice = 'pad';
      if (touched !== this.driver) { this._handover(drv, this.pads.get(touched)); this.driver = touched; }
      // Every touch, in every state, as every key press is: main.js asks for the sound here.
      // Only the menus' presses used to reach it (through onKey), so a pad in a run never
      // asked at all. Before the menu keys, as a keydown's own listener runs before onKey's.
      if (this.onTouch) this.onTouch();
    }

    for (const [index, st] of this.pads) {
      const drives = index === this.driver;
      if (drives) this._drive(st);
      this._menu(st, dt, drives);
      for (let k = 0; k < st.now.length; k++) st.was[k] = st.now[k];
    }
  }

  /** The driving pad's controls, onto the Input. */
  _drive(st) {
    const inp = this.input;
    const l = st.now[BTN.LEFT];
    const r = st.now[BTN.RIGHT];
    // The D-pad wins over the stick while it is pressed: it is the precise one.
    const a = l || r ? (r ? 1 : 0) - (l ? 1 : 0) : st.x;
    // Held states are written every frame, not only on a change: a blur empties the
    // Input's `down` set, and a stick still held afterwards must come straight back.
    if (a < 0) inp.padDown('PadLeft'); else inp.padUp('PadLeft');
    if (a > 0) inp.padDown('PadRight'); else inp.padUp('PadRight');
    // The jump is an EDGE, as a keydown is: one press, one refill of the jump buffer.
    // Writing it every frame the button was held would refill the buffer every frame and
    // turn a held A into a stream of jumps. (`fresh`: a press, and not the copy of one
    // the pad it took over from was already making -- see poll.)
    if (st.fresh[BTN.A]) inp.padDown('PadA');
    else if (!st.now[BTN.A] && st.was[BTN.A]) inp.padUp('PadA');
  }

  /** Menu keys: presses on the edge, directions with a repeat. Only the driver speaks. */
  _menu(st, dt, drives) {
    for (const name of DIR_NAMES) {
      const held = st.now[DIRS[name][0]] || st.dir === name;
      if (!held) { st.rep[name] = -1; continue; }
      if (st.rep[name] < 0) {
        st.rep[name] = REPEAT_DELAY;
        if (drives) this._key(DIRS[name][1]);
        continue;
      }
      st.rep[name] -= dt;
      // At most one repeat a frame, and never a burst of catch-up presses after a
      // stall: a hitch in the frame rate must not scroll the options list by three.
      if (st.rep[name] <= 0) {
        // Carrying the overshoot keeps the cadence exact at any frame rate; a stall
        // longer than a whole interval starts the interval afresh instead.
        st.rep[name] += REPEAT_RATE;
        if (st.rep[name] <= 0) st.rep[name] = REPEAT_RATE;
        if (drives) this._key(DIRS[name][1]);
      }
    }
    if (!drives) return;
    for (const [btn, code] of PRESSES) {
      if (st.fresh[btn]) this._key(code);
    }
  }

  _key(code) { if (this.onKey) this.onKey(code); }

  /**
   * The driving passes from `prev` (may be null) to `next`. The directions need nothing
   * here: _drive writes both of them from `next` this same poll, which is what lets go
   * of a stick still held on `prev`. The jump is let go unless `next` is holding A too,
   * which is the same thumb on the same button reaching the page twice -- letting go
   * there cut the jump short in mid-air. For the same reason a menu direction both are
   * holding carries on `prev`'s repeat instead of pressing again.
   */
  _handover(prev, next) {
    if (!next.now[BTN.A]) this.input.padUp('PadA');
    if (!prev) return;
    for (const name of DIR_NAMES) {
      if (holdsDir(prev, name) && holdsDir(next, name)) next.rep[name] = prev.rep[name];
    }
  }

  /** Let go of everything the driving pad held on the Input. */
  _release() {
    this.input.padUp('PadLeft');
    this.input.padUp('PadRight');
    this.input.padUp('PadA');
  }

  _lose(index) {
    if (!this.pads.has(index)) return;
    this.pads.delete(index);
    if (index !== this.driver) return;
    this.driver = -1;
    this._release();
    if (this.onLost) this.onLost();
  }

  /** How many pads are connected right now; for a screen that wants to say so. */
  get count() { return this.pads.size; }
}
