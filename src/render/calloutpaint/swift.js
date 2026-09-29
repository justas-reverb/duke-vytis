// SWIFT, floor 330 of each lap (50 floors of chain, the combo's first step, until the
// callouts moved to the tower's heights): the first, so the lightest word -- clean, thin,
// and fast.
//
// Cyan, the colour the trail takes on at this step (sparks.js STEPS: amber, gold and, new
// here, cyan), in slim strokes leaning forward on a whole-pixel staircase: a pixel font's
// italic. Behind it, streaks of the step's other two colours, gold and amber, trailing off
// to the left as though the word had just arrived at speed -- which it has: it comes in
// from the right in three whole-pixel jumps, overshoots by a few pixels and settles.
//
// Nothing glows yet. Glow and heat are what the later steps add.

import { layoutWord, colour, bevelBody, shearPlan, ground, frame, hash2, NIGHT } from './kit.js';

export const METRICS = { K: 8, R: 3.5, gap: 10, pad: [150, 8, 24, 12], reach: 8 };
const SLANT = 0.26;                        // italic lean [px across per px up]
const BANDS = ['CYAN', 'CYAN', 'CYAN'];
const STREAK = ['#fff6c0', '#ffd23c', '#ffa232', '#ff5a1e'];   // GOLD and AMBER, hot to cool

/** Face: the highlight across the top rows, then light, the body only at the foot. */
const faceTone = (ty) => (ty < 0.16 ? 6 : ty < 0.72 ? 5 : 4);

/**
 * Speed streaks off the left of the word: a few long thin lines at different heights, each
 * starting at the first letter's edge and running `len` px left, hot at the word and
 * stepping down to amber and out. Only on empty pixels, so they never cross a letter.
 */
function streaks(p, plan, x0, long = 1) {
  const rows = [0.18, 0.42, 0.63, 0.86];
  rows.forEach((ty, k) => {
    const y = Math.round(plan.top + ty * plan.inkH);
    const len = Math.round((34 + 40 * hash2(k, 7, 3)) * long);
    const th = k === 1 || k === 2 ? 2 : 1;
    // Start where the first letter's ink is on this row (italic moves it), minus a gap.
    let sx = x0;
    while (sx < p.w && !p.alpha(sx, y)) sx++;
    sx -= 4 + k;
    for (let i = 0; i < len; i++) {
      const f = i / len;
      const c = f < 0.12 ? STREAK[0] : f < 0.35 ? STREAK[1] : f < 0.7 ? STREAK[2] : STREAK[3];
      const a = f < 0.5 ? 1 : f < 0.75 ? 0.7 : 0.4;
      for (let j = 0; j < th; j++) {
        const x = sx - i, yy = y + j;
        if (!p.alpha(x, yy)) p.set(x, yy, c, a);
      }
      // A dark rim under the line holds it off a pale sky, as the speed streaks' rim does.
      if (!p.alpha(sx - i, y + th)) p.set(sx - i, y + th, NIGHT, 0.5 * a);
    }
  });
}

export function paint(word) {
  const plan = layoutWord(word, METRICS);
  const foot = plan.bottom;
  let P = null;
  const body = () => P || (P = shearPlan(bevelBody(plan, { bevel: 1, faceTone, edge: [6, 6, 5, 3, 2] }), SLANT, foot));
  // The italic leans the word right by half its lean on average: anchor on where it stands.
  const lean = Math.round(plan.inkH * SLANT / 2);
  const make = (long) => {
    const p = colour(body(), BANDS);
    ground(p);
    streaks(p, plan, plan.letters[0].x0, long);
    return frame(p, plan, lean, body());
  };
  return {
    frames: [
      // The letters' plan in one warm piece and the frame in the next (callouts.js): together
      // they were the heaviest piece of the warm-up, 20 ms cold.
      function* settled() { body(); yield; return make(1); },
      () => make(1.9),
    ],
    // In from the right in whole-pixel jumps, long streaks while it moves; overshoot, settle.
    seq: [[1, 0.035, 150, 0], [1, 0.035, 60, 0], [1, 0.035, 18, 0], [0, 0.05, -5, 0]],
  };
}
