// RAMPAGE, floor 1310 of each lap (200 floors of chain while the callouts were the
// combo's): the word catches FIRE.
//
// Its trail is red, amber and gold (sparks.js STEPS) and its colour red (kit.js
// STEP_BANDS), and the letters are metal at a red heat, amber at the crown; the fire over
// them carries the yellow. (Gold over amber over red, the first cut, was the same orange
// as a CHAIN.) Fire burns along every top edge, in the game's own fire idiom (the rising
// floor's rim, the decor's torch): flames are LIGHT, so they take NO dark outline -- a
// dark rim made the rising floor's first tongues a row of thorns -- and a one-pixel halo
// of deep red instead; a band of heat along the edge they burn from, because at 1x it is
// the glowing band that reads as fire, not the tongues (the rising floor again); and each
// tongue tapers from a round root to a point, hw = w(1-u)^0.75 (1 + 0.3u), leaning as it
// rises, crimson at the tip through orange to yellow, the pale core only low down.
//
// The first cut stood seven-row templates on the letters' outline: a fringe of little
// spikes that read as a crown or as grass, not as fire; the second, thin tongues 7.5 px
// apart, a row of birthday candles. These are up to twenty-one rows, three and a half to
// five and a half pixels wide at the root, one every five pixels so neighbours overlap
// into one blaze, tallest in the middle of each edge, rooted in a heat band two pixels
// clear of the letters.
//
// THE ENTRANCE slams it down from above in whole-pixel drops, white-hot on impact a few
// pixels past its mark, and the flames flicker between two sets of tongues while it is
// up.

import { layoutWord, colour, bevelBody, lifted, ground, frame, hash2, rgba } from './kit.js';

// Two more rows over the letters than the tallest tongue needs (21 rows from five over the
// crown, and its halo): at 26 the tallest tongues' halo landed on the canvas's top row and
// was cut flat there.
export const METRICS = { K: 9, R: 4.5, gap: 9, pad: [14, 28, 14, 12], reach: 8 };
const BANDS = ['AMBER', 'RED', 'RED'];
// Tip to root: crimson, red-orange, orange, yellow; the pale core low in the middle.
const FIRE = ['#c8141e', '#ff3c1e', '#ff7a1e', '#ffa232', '#ffd23c', '#fff6c0'];
const HALO = '#ff2a1a';
/** The dark row between the letters and their fire. */
const SOOT = [42, 8, 6, 255];

/** A letter at forging heat: bright crowns, the body light, the foot a step down. */
const faceTone = (ty) => (ty < 0.1 ? 6 : ty < 0.78 ? 5 : 4);

/**
 * Fire along the letters' top edges. An edge is a run of columns whose topmost letter pixel
 * lies in the letter's top quarter; along it, over the outline row and a row of soot, a band
 * of yellow and orange heat, and from that band tongues rise every 5 px, tallest mid-run.
 * `set` picks the flicker. Only on pixels that are not letter.
 */
function flames(p, P, plan, set) {
  const { w } = p;
  const solid = (x, y) => y >= 0 && y < p.h && x >= 0 && x < w && P.mat[y * w + x] !== 0;
  const cols = FIRE.map(rgba);
  const lit = [];
  const put = (x, y, tone) => {
    if (x < 0 || y < 0 || x >= w || y >= p.h || solid(x, y)) return;
    const c = tone === 7 ? SOOT : cols[Math.max(0, Math.min(5, tone))];
    p.set(x, y, [c[0], c[1], c[2], 255]);
    lit.push(x, y);
  };
  // The runs of top edge, per letter.
  const runs = [];
  for (const L of plan.letters) {
    let run = null;
    for (let x = Math.floor(L.x0); x <= Math.ceil(L.x1); x++) {
      let y = 0;
      while (y < p.h && !solid(x, y)) y++;
      const top = y < p.h && (y - plan.top) / plan.inkH < 0.26;
      if (top && run && Math.abs(y - run.ys[run.ys.length - 1]) <= 1) { run.ys.push(y); continue; }
      if (run) runs.push(run);
      run = top ? { x0: x, ys: [y] } : null;
    }
    if (run) runs.push(run);
  }
  for (const run of runs) {
    const n = run.ys.length;
    // The band burns two pixels clear of the letter: its outline row and the shadow row
    // over it stay dark, the keyline every other callout has all round. Laid on the outline
    // itself, the first cut's heat met the amber crowns with nothing between them, and at
    // their top edges the letters ran into the fire (1.4:1 against it).
    run.ys.forEach((y, i) => {
      put(run.x0 + i, y - 2, 7);
      put(run.x0 + i, y - 3, 4);
      put(run.x0 + i, y - 4, 3);
    });
    if (n < 4) continue;
    // Close enough that neighbours overlap into one blaze with peaks, not a row of candles
    // (the second cut, at one tongue in 7.5 px, 2.6-4 px wide, was a birthday cake). The
    // tallest go down first so the shorter ones' bright roots lie over their feet.
    const count = Math.max(1, Math.round(n / 5));
    const tongues = [];
    for (let k = 0; k < count; k++) {
      const hs = hash2(run.x0 + k, set, 17);
      const fx = run.x0 + (k + 0.5) * n / count + (hs - 0.5) * 3;
      const mid = 1 - Math.abs((k + 0.5) / count - 0.5) * 2;       // 1 mid-run, 0 at its ends
      const h = Math.round(6 + 15 * (0.35 + 0.65 * mid) * (0.4 + 0.6 * hash2(k, run.x0, set + 3)));
      const w0 = 3.5 + 2 * hash2(run.x0, k, set + 9);
      const lean = (hash2(k, set, run.x0 + 1) - 0.5) * 2.4;
      tongues.push({ fx, h, w0, lean });
    }
    tongues.sort((a, b) => b.h - a.h);
    for (const { fx, h, w0, lean } of tongues) {
      const y0 = run.ys[Math.max(0, Math.min(n - 1, Math.round(fx - run.x0)))] - 5;
      for (let r = 0; r < h; r++) {
        const u = r / Math.max(1, h - 1);
        const hw = w0 * Math.pow(1 - u, 0.75) * (1 + 0.3 * u);
        const cx = fx + lean * u * u * h * 0.35;
        const xa = Math.round(cx - hw), xb = Math.round(cx + hw);
        for (let x = xa; x <= xb; x++) {
          const inset = Math.min(x - xa, xb - x);
          let tone = u > 0.78 ? 0 : u > 0.52 ? 1 : u > 0.28 ? 2 : 3;
          if (inset >= 1) tone++;
          if (u < 0.3 && inset >= 2) tone = 5;
          put(x, y0 - r, tone);
        }
      }
    }
  }
  // A one-pixel deep-red halo round the fire, on empty pixels only: its light, not a rim.
  for (let i = 0; i < lit.length; i += 2) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1]]) {
      const X = lit[i] + dx, Y = lit[i + 1] + dy;
      if (X >= 0 && Y >= 0 && X < w && Y < p.h && !p.alpha(X, Y)) p.set(X, Y, HALO, 0.35);
    }
  }
}

export function paint(word) {
  const plan = layoutWord(word, METRICS);
  let P = null;
  const body = () => P || (P = bevelBody(plan, { bevel: 2, faceTone, edge: [6, 6, 4, 2, 1] }));
  const make = (lift, set) => {
    const Q = lift ? lifted(body(), lift) : body();
    const p = colour(Q, BANDS);
    ground(p);
    flames(p, Q, plan, set);
    return frame(p, plan, 0, Q);
  };
  return {
    frames: [
      // The letters' plan in one warm piece and the frame in the next (callouts.js): together
      // they were the heaviest piece of the warm-up, 20 ms cold.
      function* settled() { body(); yield; return make(0, 0); },
      () => make(0, 1),
      () => make(3, 2),
    ],
    seq: [[2, 0.03, 0, -92], [2, 0.03, 0, -38], [2, 0.05, 0, 7], [0, 0.04, 0, -2]],
    loop: [[0, 0.09], [1, 0.09]],
  };
}
