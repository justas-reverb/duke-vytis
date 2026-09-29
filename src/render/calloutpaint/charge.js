// CHARGE, floor 660 of each lap (100 floors of chain while the callouts were the combo's):
// heavier than SWIFT, and armoured -- blued steel.
//
// The step's trail is cyan, azure and gold (sparks.js STEPS), and its colour is blue
// (kit.js STEP_BANDS). The letters are azure steel, shaded like polished metal rather than
// lit from one side -- pale where they catch the sky at the top of the steel, a dark horizon
// across the middle, a lighter reflection under it -- with their top two font rows lit
// cyan. Strokes are thicker than SWIFT's and bevelled three pixels deep, so the word has
// weight. (A gold crown, the first cut, read well and put CHARGE's words within 13 of
// THUNDER's in colour: the step's colour is blue.)
//
// THE ENTRANCE is a charge: the word rams in from the LEFT, the opposite way to SWIFT's slide,
// dragging cyan motion streaks behind it, and strikes white-hot a few pixels past its mark
// before it settles; a glint then runs along the steel.

import { layoutWord, colour, bevelBody, lifted, ground, frame, hash2, NIGHT } from './kit.js';

export const METRICS = { K: 8, R: 4.5, gap: 9, pad: [140, 8, 12, 12], reach: 8 };
const BANDS = ['CYAN', 'AZURE', 'AZURE'];
const STREAK = ['#e4fffc', '#6ae8ff', '#18b4f0', '#3c64f0'];   // CYAN into AZURE

/** Polished metal: bright crown, a dark horizon a little below the middle, a reflection. */
function faceTone(ty, x, y) {
  // The reflection and the foot a step lighter than a true mirror would have them: azure's
  // body tone is dark (luminance 0.16), and with it under the horizon the letters' median
  // fell to 3.9:1 against their own edge over STORM's clouds.
  const bands = [[0.12, 6], [0.46, 5], [0.54, 3], [0.8, 5], [2, 4]];
  for (let k = 0; k < bands.length; k++) {
    const [lim, t] = bands[k];
    if (ty < lim) {
      const next = bands[k + 1];
      if (next && lim - ty < 0.014 && ((x + y) & 1)) return next[1];
      return t;
    }
  }
  return 3;
}

/** Motion streaks off the left of the word: heavy, three pixels, stepping out to azure. */
function streaks(p, plan) {
  const x0 = plan.letters[0].x0;
  [0.2, 0.5, 0.78].forEach((ty, k) => {
    const y = Math.round(plan.top + ty * plan.inkH) - 1;
    const len = Math.round(70 + 50 * hash2(k, 3, 9));
    let sx = x0;
    while (sx < p.w && !p.alpha(sx, y + 1)) sx++;
    sx -= 3;
    for (let i = 0; i < len; i++) {
      const f = i / len;
      const c = f < 0.1 ? STREAK[0] : f < 0.35 ? STREAK[1] : f < 0.7 ? STREAK[2] : STREAK[3];
      const a = f < 0.55 ? 1 : f < 0.8 ? 0.7 : 0.4;
      for (let j = 0; j < 3; j++) if (!p.alpha(sx - i, y + j)) p.set(sx - i, y + j, j === 2 ? STREAK[3] : c, a);
      if (!p.alpha(sx - i, y + 3)) p.set(sx - i, y + 3, NIGHT, 0.55 * a);
      if (!p.alpha(sx - i, y - 1)) p.set(sx - i, y - 1, NIGHT, 0.4 * a);
    }
  });
}

export function paint(word) {
  const plan = layoutWord(word, METRICS);
  let P = null;
  const body = () => P || (P = bevelBody(plan, { bevel: 3, faceTone, edge: [6, 6, 4, 2, 1] }));
  const make = (lift, withStreaks) => {
    const p = colour(lift ? lifted(body(), lift) : body(), BANDS);
    ground(p);
    if (withStreaks) streaks(p, plan);
    return frame(p, plan, 0, body());
  };
  return {
    frames: [
      // The letters' plan in one warm piece and the frame in the next (callouts.js): together
      // they were the heaviest piece of the warm-up, 20 ms cold.
      function* settled() { body(); yield; return make(0, false); },
      () => make(0, true),
      () => make(2, false),
      // The glint: the steel two tones up, drawn as a narrow band crossing the word.
      () => frame(colour(lifted(body(), 3), BANDS), plan),
    ],
    seq: [[1, 0.035, -170, 0], [1, 0.035, -66, 0], [1, 0.035, -16, 0], [2, 0.05, 6, 0], [0, 0.04, -2, 0]],
    sweep: { frame: 3, from: 0.32, dur: 0.4, band: 12 },
  };
}
