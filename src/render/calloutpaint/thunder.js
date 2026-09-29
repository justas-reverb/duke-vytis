// THUNDER, floor 1970 of each lap (300 floors of chain while the callouts were the
// combo's): the word is STRUCK.
//
// Its trail is violet, cyan and white (sparks.js STEPS) and its colour violet (kit.js
// STEP_BANDS), and the letters are charged with it: white-hot crowns over violet, in a
// strong violet glow -- brighter than SOARING's. (White over cyan over violet, the first
// cut, averaged to the same pale blue as CHARGE.) Lightning strikes the word while it is
// up: bolts in the STORM title's idiom (titlepaint/storm.js), which learned that a strike
// is a SLANT -- long legs one way, short snaps back, a fork off the middle -- and that a
// bolt zigzagging evenly left and right is a squiggle, a worm. Each bolt is a white core
// two pixels wide in two rings of violet glow, coming down out of the dark above the word
// onto the tops of its letters, and each letter hit flashes white. Two sets of strikes,
// flashed over the word in turn.
//
// Between the strikes the word CRACKLES: small bolts, half a strike's size, land on the tops
// of a few letters, on one set and then another, the way RAMPAGE's flames flicker. The
// strikes are four flashes of a twentieth of a second in its 1.6 s, and between them the
// first cut was a plain violet word in a glow -- in real frames at 1x, SOARING in another
// colour, the one step of the seven that did not say what it was for most of the time it
// was up. More strikes would have been more white flashes; the crackle never lights a
// letter.
//
// Every bolt ends inside the canvas, thinning to a one-pixel core over its last rows, as it
// comes out of the dark. The first cut ran each one up to the canvas's top row and cut it
// flat there -- every bolt started on the same ruled line -- and a bolt drifting left off
// the H ran out through the canvas's left edge.
//
// THE ENTRANCE is the flash itself: the word first appears white, struck, with the first
// bolts across it, shudders a pixel or three either way, and settles charged.

import { layoutWord, colour, bevelBody, lifted, ground, glow, frame, Pix, hash2 } from './kit.js';
import { rng } from '../decorpaint/util.js';

export const METRICS = { K: 9, R: 5, gap: 9, pad: [16, 58, 16, 16], reach: 8 };
const BANDS = ['WHITE', 'VIOLET', 'VIOLET'];
const GLOW = ['#8c46f0', '#6a2cd0', '#4c1a9c'];
// The storm rod's lightning (decorpaint/storm.js BOLT).
const BOLT = { core: '#ffffff', dim: '#f3e8ff', glow: '#b061ff', haze: '#7d2fe0' };
/** Clear pixels kept between any bolt and the canvas's edges, glow included. [px; 3] */
const MARGIN = 3;
/** Rows over which a strike thins to a one-pixel core as it comes out of the dark. [px; 10] */
const TAPER = 10;

const faceTone = (ty) => (ty < 0.14 ? 6 : ty < 0.8 ? 5 : 4);

/**
 * The path of a discharge onto each of `which` letters, as cells [x, y, dim, thin], built UP
 * from the strike point on the letter's top, so it always lands: slanting one way -- long
 * legs across and up, short snaps back -- until it has risen `rise` px or reached the
 * canvas's top margin. A strike's long legs lean in toward the middle of the word, so the
 * outer letters' bolts come in over the word rather than out through its sides.
 *   big: long legs of five to eight px across and four to six down, snaps of one or two, a
 *        fork off its upper half; legs steeper than that (three to six across in four to
 *        seven down) came out nearly plumb, a wriggling line.
 *   small (the crackle): the same idiom at half the size -- legs of four to six across and
 *        four or five up, a short fork -- 26 to 34 px in all, from a top node picked by hash.
 *        One pixel wide and 10 to 15 px tall, the first cut, read at 1x as accents over the
 *        letters (U and E with acute accents) and at 3x as hairs; a bolt needs its two-pixel
 *        core and its fork.
 * Two pixels wide, each thinning to a one-pixel core over its own top TAPER rows.
 */
function discharges(plan, solid, which, seed, small) {
  const r = rng(small ? 'THUNDER-CRACKLE' : 'THUNDER-BOLT', seed);
  const cells = [];
  const lo = MARGIN + 2, hi = plan.w - 1 - MARGIN - 3;
  let pts = [];
  const leg = (x0, y0, dx, dy, dim) => {
    const n = Math.max(Math.abs(dx), Math.abs(dy));
    for (let s = 1; s <= n; s++) pts.push([Math.round(x0 + dx * s / n), Math.round(y0 + dy * s / n), dim]);
  };
  // Keep a leg's end inside the side margins: it turns back rather than run off the canvas.
  const across = (x, dx) => (x + dx < lo || x + dx > hi ? -dx : dx);
  const taper = small ? 6 : TAPER;
  for (const li of which) {
    pts = [];
    const L = plan.letters[li];
    const top = Math.min(...L.nodes.map((nd) => nd.r));
    const tops = L.nodes.filter((q) => q.r === top)
      .sort((a, b) => Math.abs(a.x - (L.x0 + L.x1) / 2) - Math.abs(b.x - (L.x0 + L.x1) / 2));
    // A strike lands on the node nearest the letter's middle; a crackle anywhere on its top.
    const nd = small ? tops[Math.floor(hash2(li, seed, 7) * tops.length)] : tops[0];
    let x = Math.round(nd.x - 0.5), y = Math.round(nd.y - 0.5);
    while (y > 0 && solid(x, y - 1)) y--;
    // The long legs run toward the middle of the word as they rise.
    const drift = small ? (hash2(li, seed, 3) < 0.5 ? 1 : -1) : ((L.x0 + L.x1) / 2 < plan.w / 2 ? -1 : 1);
    const rise = small ? r.int(26, 34) : Infinity;
    const y0 = y;
    let fork = null;
    for (let k = 0; y > MARGIN + 1 && y0 - y < rise; k++) {
      const back = k & 1;
      const dx = across(x, small ? (back ? drift * r.int(1, 2) : -drift * r.int(4, 6)) : (back ? drift * r.int(1, 2) : -drift * r.int(5, 8)));
      const dy = Math.min(y - MARGIN - 1, small ? (back ? r.int(1, 2) : r.int(4, 5)) : (back ? r.int(1, 2) : r.int(4, 6)));
      leg(x, y, dx, -dy, k === 0);
      x += dx; y -= dy;
      if (k === 2) fork = [x, y];
    }
    if (fork) {
      let [fx, fy] = fork;
      // A crackle's fork is one leg, a twig off the side: with a second leg snapping back it
      // met the stem again, and each small bolt had a loop in it, a squiggle.
      for (let k = 0; k < (small ? 1 : 3) && fy > MARGIN + 2; k++) {
        const dx = across(fx, (k & 1) ? -drift * 2 : drift * r.int(3, 5));
        const dy = Math.min(fy - MARGIN - 1, r.int(3, 5));
        leg(fx, fy, dx, -dy, true);
        fx += dx; fy -= dy;
      }
    }
    // Thin over its own last rows, where it comes out of the dark: a one-pixel core there,
    // two below.
    const yTop = Math.min(...pts.map((q) => q[1]));
    for (const [x1, y1, dim] of pts) {
      const thin = y1 < yTop + taper;
      cells.push([x1, y1, dim || thin, thin]);
      if (!thin) cells.push([x1 + 1, y1, true, false]);
    }
  }
  return cells;
}

/**
 * Lay discharge cells into `out` on the pixels `free` allows: a haze two pixels round a
 * strike's core (one round a thin one), a glow ring, the core. `mix` blends them over what
 * is there -- the crackle, painted into a copy of the word over its glow and shadow bed --
 * where a strike's own Pix, drawn over the word, is set outright.
 */
function lay(out, cells, free, mix) {
  // Blended, each pixel takes the haze once and the glow once, however many cells it touches:
  // stacked, the haze thickened to an opaque blot wherever a bolt doubled back.
  const hazed = new Uint8Array(out.w * out.h);
  const put = mix
    ? (x, y, c, a) => {
      if (x < 0 || y < 0 || x >= out.w || y >= out.h) return;
      const k = (c === BOLT.haze ? 1 : 2);
      if (hazed[y * out.w + x] & k) return;
      hazed[y * out.w + x] |= k;
      out.blend(x, y, c, a);
    }
    : (x, y, c, a) => out.set(x, y, c, a);
  for (const [x, y, , thin] of cells) {
    const R = thin ? 1 : 2;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > R || !free(x + dx, y + dy)) continue;
      if (mix || out.alpha(x + dx, y + dy) === 0) put(x + dx, y + dy, BOLT.haze, thin ? 0.4 : 0.55);
    }
  }
  for (const [x, y, , thin] of cells) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (free(x + dx, y + dy)) put(x + dx, y + dy, BOLT.glow, thin ? 0.8 : 0.95);
  }
  for (const [x, y, dim] of cells) if (free(x, y)) out.set(x, y, dim ? BOLT.dim : BOLT.core);
}

/**
 * One set of strikes: a bolt onto the top of each chosen letter, and the letter it hits
 * flashing white. The first cut ran each bolt straight down through the word, behind it: it
 * showed only above and below the letters as two short squiggles, and nothing looked struck.
 * `word` is the finished word's Pix (a bolt covers only what is not letter); `hot` is the
 * word white-hot, from which the struck letters are copied. Returns a Pix of the strike
 * alone, laid over the word while it flashes.
 */
function bolts(plan, word, hot, which, seed) {
  const out = new Pix(plan.w, plan.h);
  const solid = (x, y) => word.alpha(x, y) === 255;
  const cells = discharges(plan, solid, which, seed, false);
  for (const li of which) {
    const L = plan.letters[li];
    // The struck letter, white-hot: copied from the hot word, letter pixels only.
    for (let yy = 0; yy < plan.h; yy++) for (let xx = Math.floor(L.x0) - 2; xx <= Math.ceil(L.x1) + 2; xx++) {
      const i = yy * plan.w + xx;
      if (plan.own[i] !== li || plan.d[i] > plan.R || !hot.alpha(xx, yy)) continue;
      out.set(xx, yy, hot.get(xx, yy));
    }
  }
  lay(out, cells, (x, y) => !solid(x, y), false);
  return out;
}

/** The settled word with the crackle on `which` letters: a whole frame, for the loop. */
function crackle(plan, word, which, seed) {
  const out = new Pix(plan.w, plan.h);
  out.data.set(word.data);
  const solid = (x, y) => word.alpha(x, y) === 255;
  lay(out, discharges(plan, solid, which, seed, true), (x, y) => !solid(x, y), true);
  return out;
}

export function paint(word) {
  const plan = layoutWord(word, METRICS);
  const n = plan.letters.length;
  let P = null, main = null, hot = null;
  const body = () => P || (P = bevelBody(plan, { bevel: 2, faceTone, edge: [6, 6, 5, 3, 2] }));
  const make = (lift) => {
    const p = colour(lift ? lifted(body(), lift) : body(), BANDS);
    ground(p);
    glow(p, GLOW, [0.55, 0.34, 0.16], 2);
    return p;
  };
  const a = [0, Math.floor(n / 2) + 1].filter((i) => i < n);
  const b = [1, n - 1].filter((i) => i < n);
  // The crackle's two sets, apart from each other: for THUNDER the U and the E, then the
  // T, the N and the R.
  const ca = [2, n - 2].filter((i) => i > 0 && i < n);
  const cb = [0, Math.floor(n / 2), n - 1].filter((i) => i < n && !ca.includes(i));
  return {
    frames: [
      // The letters' plan in one warm piece and the frame in the next (callouts.js): together
      // they were the heaviest piece of the warm-up, 20 ms cold.
      function* settled() { body(); yield; return frame(main = make(0), plan, 0, body()); },
      () => frame(hot = make(4), plan),
      () => frame(bolts(plan, main, hot, a, 1), plan),
      () => frame(bolts(plan, main, hot, b, 2), plan),
      () => frame(crackle(plan, main, ca, 3), plan),
      () => frame(crackle(plan, main, cb, 4), plan),
    ],
    seq: [[1, 0.06, 0, 0], [0, 0.03, -3, 0], [0, 0.03, 3, 0], [0, 0.03, -1, 0]],
    over: [[2, 0, 0.07], [3, 0.1, 0.16], [2, 0.62, 0.67], [3, 1.08, 1.13]],
    // Crackle on one set, a beat of none, the other set: never the same letters twice
    // running, so it jumps about the word rather than blinking in place.
    loop: [[4, 0.07], [0, 0.05], [5, 0.07], [0, 0.05]],
  };
}
