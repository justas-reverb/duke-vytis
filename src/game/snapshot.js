// A copy of a whole Game, for seeking a replay.
//
// Seeking by simulating from floor 0 is exact and was measured too slow for the end of a
// long run: 0.45 s to reach the last ten seconds of a ten-minute climb, headless, most of
// it the particle pool (tools/test-replay.mjs prints the numbers). So playback keeps a
// copy of the game every REPLAY_KEYFRAME_EVERY steps, and a seek restores the nearest one
// and simulates the rest.
//
// The copy is generic -- it walks the object graph from the Game down -- rather than a
// snapshot method on every class, because the simulation is spread over a dozen classes
// that other work changes all the time, and a hand-written snapshot that missed one new
// field would restore a game that is almost the same. What a generic copy gets wrong it
// gets wrong loudly: tools/test-replay.mjs restores copies mid-run and compares every
// value of the restored game with the one that was never copied, every step, to the
// death.
//
// Five rules, each for something that would otherwise break a restored game (or, the third,
// weigh every copy down):
//
//   - Functions are never copied. On a Game they are the UI's hooks (onDeath commits the
//     stats, the handleEvents wrapper main.js installs from render/gamesounds.js plays the
//     sound effects and reads the LIVE game), and a restored copy must not fire them. A
//     hook that stands in for one of the class's own methods -- gamesounds.js assigns
//     game.handleEvents, a wrapper round Game.prototype.handleEvents, as an own property
//     -- is replaced by that method, not
//     by nothing: the first version wrote `undefined` there, which SHADOWS the method, so
//     the first step of an instant replay restored from a copy of the live game threw
//     "this.handleEvents is not a function". No test caught it because no test's game had
//     main.js's hooks on it. The same goes for ANY own function that shadows a method of
//     the object's class: render/gamesounds.js wraps game.step as well as handleEvents,
//     and with only handleEvents on the list, the copy of a real live game threw on
//     `.step`, the recorder turned its copies off without a word, and the instant replay
//     in the shipped game simulated the whole run from floor 0 instead of restoring the
//     last ten seconds (tools/test-replayui.mjs boots main.js with its real hooks and
//     holds the recorder's copies to it). Any other function in the state is a closure
//     with hidden state that cannot be copied -- Rng kept its state in one until this was
//     written -- so it is an error, not a silent share.
//   - Constant tables the modules export (the combo tiers, the milestones, the companions'
//     lines, the themes) are SHARED, not copied: the game finds a tier with
//     COMBO_TIERS.indexOf(r.tier), and a copied tier is not in the table.
//   - A frozen object is shared too: it cannot change, and a race's course (course.js) is
//     frozen so that the copies do not each carry the ghost's whole tower.
//   - The input is left out (null); whoever restores the copy gives it one.
//   - Identity inside the state is kept: the tower's `last` is the same object as its
//     entry in `floors`, and the particle pool's stream is the game's `fx`.

import * as constants from './constants.js';
import * as flavour from './flavour.js';
import * as combo from './combo.js';
import * as themes from './themes.js';
import * as compdialogue from './compdialogue.js';
import * as companions from './companions.js';
import * as stages from './stages.js';

// Keys a Game may carry a function on: the UI's hooks. Dropped from the copy.
const HOOK = /^(on[A-Z]\w*|handleEvents)$/;

let shared = null;
function sharedTables() {
  if (shared) return shared;
  shared = new WeakSet();
  const walk = (v, depth) => {
    if (v === null || typeof v !== 'object' || shared.has(v) || depth > 8) return;
    shared.add(v);
    if (ArrayBuffer.isView(v)) return;
    if (v instanceof Map || v instanceof Set) {
      for (const x of v.values()) walk(x, depth + 1);
      return;
    }
    for (const k of Object.keys(v)) walk(v[k], depth + 1);
  };
  for (const mod of [constants, flavour, combo, themes, compdialogue, companions, stages]) {
    for (const k of Object.keys(mod)) walk(mod[k], 0);
  }
  return shared;
}

/**
 * A deep copy of `game` with its input left out and its hooks dropped. Throws on a
 * function in the state that is not a hook (see the header): the caller decides whether
 * that is fatal. The copy is a Game (same prototype) and can be stepped as one.
 */
export function snapshot(game) {
  const keep = sharedTables();
  const memo = new Map();
  if (game.input) memo.set(game.input, null);

  const copy = (v) => {
    if (v === null || typeof v !== 'object') return v;
    if (keep.has(v)) return v;
    // A frozen object cannot change, so a copy may share it: a race's course (course.js),
    // up to ~10,000 floors of the ghost's tower, frozen for exactly this -- copied, it would
    // cost every copy of the game, one every ten seconds of a playback, a copy of the tower.
    if (Object.isFrozen(v)) return v;
    const seen = memo.get(v);
    if (seen !== undefined) return seen;
    let c;
    if (ArrayBuffer.isView(v)) {
      c = v.slice();
      memo.set(v, c);
      return c;
    }
    if (Array.isArray(v)) {
      const n = v.length;
      c = new Array(n);
      memo.set(v, c);
      for (let i = 0; i < n; i++) {
        const x = v[i];
        if (typeof x === 'function') throw new Error('snapshot: a function in an array');
        c[i] = (x === null || typeof x !== 'object') ? x : copy(x);
      }
      return c;
    }
    if (v instanceof Map) {
      c = new Map();
      memo.set(v, c);
      for (const [k, x] of v) c.set(copy(k), copy(x));
      return c;
    }
    if (v instanceof Set) {
      c = new Set();
      memo.set(v, c);
      for (const x of v) c.add(copy(x));
      return c;
    }
    // A spread, not Object.create and a property at a time. Adding properties with a
    // computed key (`c[k] = ...`) turns an object with more than a dozen of them into a
    // hash table -- V8's limit for keyed stores -- and a restored Game, Companion or
    // particle pool then ran every access through a lookup: 33 us a step instead of 3,
    // and the code the LIVE game shares with it went on at 19 us a step afterwards,
    // polluted by the shapes it had seen. A spread copies the object's own layout in one
    // go, the prototype is put back in one transition, and every store below writes a
    // property that already exists.
    c = { ...v };
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype) Object.setPrototypeOf(c, proto);
    memo.set(v, c);
    for (const k of Object.keys(v)) {
      const x = v[k];
      if (x === null || (typeof x !== 'object' && typeof x !== 'function')) continue;
      if (typeof x === 'function') {
        // Written over, not deleted: a delete would turn the copy into a hash table too.
        // Over with the class's own method where there is one (see the header), so the
        // copy runs the game's code and none of the UI's.
        const own = proto && proto !== Object.prototype ? proto[k] : undefined;
        if (typeof own === 'function') { c[k] = own; continue; }
        if (HOOK.test(k)) { c[k] = undefined; continue; }
        throw new Error(`snapshot: a function in the state at .${k}`);
      }
      c[k] = copy(x);
    }
    return c;
  };

  const out = copy(game);
  out.input = null;
  return out;
}
