// CRUSADE, floor 1640 of each lap (250 floors of chain while the callouts were the
// combo's): heraldic -- the Duke's own colours, in enamel set in gold.
//
// Its trail is already the tricolour of Lithuania (sparks.js STEPS: gold, emerald, red), so
// the letters are the flag -- yellow over green over red, the flag's own order, split where
// the font splits its rows -- as enamel inside a gilt rim three pixels deep, the way a
// herald's badge is made: a field of colour in a raised gold edge. Over its middle stands a
// shield with the gold double-barred cross of the Vytis on red, a crest, so the word reads
// as the Duke's crusade and not just as a flag.
//
// THE ENTRANCE is a seal pressed down: struck from above in two whole-pixel drops, white-gold
// on impact, then a gleam runs across the gilt.

import { layoutWord, Plan, ramp7, ground, glow, frame, NIGHT } from './kit.js';
import { bandAt } from './kit.js';

export const METRICS = { K: 9, R: 5, gap: 9, pad: [12, 66, 12, 12], reach: 8 };
const ENAMEL = ['GOLD', 'EMERALD', 'RED'];
const M_GILT = 4;
const GLOW = ['#f09a1c', '#8c3c14'];

/**
 * The body: a gilt rim (M_GILT) the outer three pixels of every stroke, toned by the way it
 * faces, and enamel inside it in the band of its height, flat but for a lit top row.
 */
function body(plan, lift = 0) {
  const P = new Plan(plan.w, plan.h);
  const { w, h, d, qx, qy, R } = plan;
  const RIM = 2.2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i] > R) continue;
      if (d[i] > R - RIM) {
        const nx = (x + 0.5 - qx[i]) / (d[i] || 1), ny = (y + 0.5 - qy[i]) / (d[i] || 1);
        const l = nx * -0.6 + ny * -0.8;
        P.mat[i] = M_GILT;
        P.tone[i] = Math.min(6, (l > 0.55 ? 6 : l > 0.15 ? 5 : l > -0.3 ? 4 : l > -0.7 ? 3 : 2) + lift);
      } else {
        const ty = (y + 0.5 - plan.top) / plan.inkH;
        const band = bandAt(ty, x, y);
        P.mat[i] = 1 + band;
        P.tone[i] = Math.min(6, (band === 0 ? 5 : 4) + lift);
      }
    }
  }
  // The enamel's top row inside the rim a tone up: the edge of the field catching the light.
  for (let y = 1; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (P.mat[i] && P.mat[i] !== M_GILT && P.mat[i - w] === M_GILT) P.tone[i] = Math.min(6, P.tone[i] + 1);
  }
  P.despeckle(1);
  return P;
}

/** The shield: [art px] 38 wide, 48 tall, a heater's straight sides for 26 rows, then its point. */
const SH_W = 38, SH_H = 48, SH_STRAIGHT = 26;
/** Clear rows between the shield's point and the letters' tops. [art px] */
const SH_GAP = 8;

function inShield(x, r) {
  if (r < 0 || r >= SH_H) return false;
  const hw = r < SH_STRAIGHT ? SH_W / 2 : (SH_W / 2) * Math.sqrt(Math.max(0, 1 - ((r - SH_STRAIGHT + 0.5) / (SH_H - SH_STRAIGHT)) ** 2));
  return x + 0.5 >= -hw && x + 0.5 <= hw;
}

/**
 * A heater shield over the middle of the word, a crest: a red field -- the Duke's own shield
 * is red -- in a gilt rim two pixels wide, and on it the gold double-barred cross of the
 * Vytis. The first cut stood the bare cross beside the word, 16 x 28 in gold, and at 1x it
 * was a pair of typographic daggers (a double dagger either side of CRUSADE); on a shield
 * it is arms. A shield at each END of the word read well too, and made it 80 px wider than
 * any other callout: wider than the old shout, and so over the Duke longer whenever he rode
 * beside it (tools/test-callouts.mjs, 5). Above the word is sky nobody plays in. It is big
 * and stands clear: 30 x 38 and three rows over the S, at 1x its point sat on the letter
 * like a caron, and the word read CRUSADE with an S-caron -- a real Lithuanian letter.
 */
function shields(P, plan, lift) {
  const L0 = plan.letters[0], L1 = plan.letters[plan.letters.length - 1];
  const y0 = plan.top - SH_H - SH_GAP;
  const cross = (x, r) => (x >= -3 && x <= 2 && r >= 7 && r <= 40)
    || (r >= 12 && r <= 15 && x >= -8 && x <= 7) || (r >= 21 && r <= 24 && x >= -12 && x <= 11);
  const up = (t) => Math.min(6, t + lift);
  for (const cx of [Math.round((L0.x0 + L1.x1) / 2)]) {
    for (let r = 0; r < SH_H; r++) {
      for (let x = -SH_W / 2; x < SH_W / 2; x++) {
        if (!inShield(x, r)) continue;
        const rim = !(inShield(x - 3, r) && inShield(x + 3, r) && inShield(x, r - 3) && inShield(x, r + 3)
          && inShield(x - 3, r + 3) && inShield(x + 3, r + 3));
        let mat, t;
        if (rim) {
          mat = M_GILT;
          // Lit on its upper left, shaded down its right side and round the point.
          t = r < 3 || x < -SH_W / 2 + 3 ? 6 : x >= 0 && r >= 5 ? 3 : 5;
        } else if (cross(x, r)) {
          mat = M_GILT;
          t = x === -3 || r === 12 || r === 21 ? 6 : x === 2 || r === 15 || r === 24 ? 3 : 5;
        } else {
          mat = 3;                      // the red of the enamel
          t = x + r < 18 ? 4 : 3;       // the field lit from the upper left
        }
        P.put(cx + x, y0 + r, mat, up(t));
      }
    }
  }
}

/** The word and its crest as a plan, tones raised by `lift`. */
function build(plan, lift) {
  const P = body(plan, lift);
  shields(P, plan, lift);
  return P;
}

function paintWith(plan, lift, bare = false, P = build(plan, lift)) {
  const gold = ramp7('GOLD');
  const ramps = { [M_GILT]: gold };
  const edges = { [M_GILT]: gold[0] };
  ENAMEL.forEach((n, k) => { ramps[k + 1] = ramp7(n); edges[k + 1] = gold[0]; });
  const p = P.toPix(ramps, edges);
  // The gleam frame is laid over the word as a band: letters only, or its shadow and glow
  // would be laid on twice where it crosses.
  if (!bare) {
    ground(p, NIGHT);
    glow(p, GLOW, [0.3, 0.14], 2);
  }
  return frame(p, plan, 0, P);
}

export function paint(word) {
  const plan = layoutWord(word, METRICS);
  return {
    frames: [
      // The letters' plan in one warm piece and the frame in the next (callouts.js): together
      // they were the heaviest piece of the warm-up, 20 ms cold.
      function* settled() { const P = build(plan, 0); yield; return paintWith(plan, 0, false, P); },
      () => paintWith(plan, 2),
      // The gleam: everything three tones up, crossing the word as a band.
      () => paintWith(plan, 3, true),
    ],
    seq: [[1, 0.035, 0, -40], [1, 0.035, 0, -12], [1, 0.05, 0, 3], [0, 0.04, 0, -1]],
    sweep: { frame: 2, from: 0.3, dur: 0.5, band: 14 },
  };
}
