// SOARING, floor 990 of each lap (150 floors of chain while the callouts were the combo's):
// the first word that gives off LIGHT.
//
// Its trail is cyan, violet and magenta (sparks.js STEPS) and its colour magenta (kit.js
// STEP_BANDS), and the letters run through all three top to foot -- sky-cyan crowns,
// magenta bodies, violet feet -- a dusk sky in the strokes. Around them a glow of deep
// violet and magenta in stepped, dithered rings: deep and saturated, because a pale glow
// thinned over a coloured sky lands on grey (the pixel-art-in-code lesson on lights). SWIFT
// and CHARGE had none; from here up every word does, brighter at each step.
//
// THE ENTRANCE rises from below in whole-pixel jumps, two fading copies of the letters
// trailing under it like the wake of something going up fast, overshoots a few pixels and
// settles back.

import { layoutWord, colour, bevelBody, lifted, ground, glow, frame, Pix, rgba } from './kit.js';

export const METRICS = { K: 8, R: 4.5, gap: 9, pad: [16, 10, 16, 30], reach: 8 };
const BANDS = ['CYAN', 'MAGENTA', 'VIOLET'];
const GLOW = ['#8c46f0', '#c02890', '#6a1cb0'];
const WAKE = ['#c08cff', '#f0369c'];

/** Bright faces: the highlight on the crowns, light down the body, a step under at the foot. */
const faceTone = (ty) => (ty < 0.12 ? 6 : ty < 0.8 ? 5 : 4);

/** Two copies of the letters' silhouette below them, fading: the wake of a rise. */
function wake(p, src, gap) {
  const cs = WAKE.map(rgba);
  [[gap, 0.5, 0], [gap * 2, 0.24, 1]].forEach(([dy, a, k]) => {
    for (let y = p.h - 1; y >= 0; y--) for (let x = 0; x < p.w; x++) {
      if (p.alpha(x, y) || src.alpha(x, y - dy) < 255) continue;
      p.set(x, y, [cs[k][0], cs[k][1], cs[k][2], 255], a);
    }
  });
}

export function paint(word) {
  const plan = layoutWord(word, METRICS);
  let P = null;
  const body = () => P || (P = bevelBody(plan, { bevel: 2, faceTone, edge: [6, 6, 5, 3, 2] }));
  const make = (lift, withWake) => {
    const letters = colour(lift ? lifted(body(), lift) : body(), BANDS);
    const p = new Pix(letters.w, letters.h);
    p.data.set(letters.data);
    ground(p);
    if (withWake) wake(p, letters, 9);
    glow(p, GLOW, [0.5, 0.3, 0.14], 2);
    return frame(p, plan, 0, body());
  };
  return {
    frames: [
      // The letters' plan in one warm piece and the frame in the next (callouts.js): together
      // they were the heaviest piece of the warm-up, 20 ms cold.
      function* settled() { body(); yield; return make(0, false); },
      () => make(1, true),
    ],
    seq: [[1, 0.04, 0, 46], [1, 0.04, 0, 18], [1, 0.04, 0, 5], [0, 0.05, 0, -4]],
  };
}
