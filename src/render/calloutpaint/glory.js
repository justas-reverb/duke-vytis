// GLORY, floor 2300, the top of each lap (350 floors of chain while the callouts were the
// combo's): the top of the ladder -- the heaviest word, and the brightest.
//
// Its trail is gold, white and amber (sparks.js STEPS), so the letters are polished gold
// under a white-hot crown: the metal shaded as the ZENITH title's is (titlepaint/zenith.js),
// pale where it catches the sky, a dark horizon across the middle, a lighter reflection under
// it, which is what says gold and not yellow paint; the thickest strokes of the seven, and a
// bevel that burns white on the edges turned to the light. Behind it, RADIANCE: long thin rays
// fanning up and out from behind the word in stepped, dithered bands of deep gold -- long and
// thin, because the zenith title found that short wedges read as hazard tape and wedges round
// the centre as a pinwheel -- a warm glow hugging the letters, and four-point glints on a few
// lit corners.
//
// THE ENTRANCE is a pop: the word appears BIGGER for a moment, painted at a larger node
// spacing -- whole pixels, a second drawing, not a scaled one -- white-hot, then at its own
// size still white, then cools to gold; a glint runs across it as it settles.

import { layoutWord, Plan, ramp7, ground, glow, frame, hash2, rgba } from './kit.js';
import { bandAt } from './kit.js';

export const METRICS = { K: 9, R: 5.5, gap: 9, pad: [40, 34, 40, 12], reach: 8 };
const POP = { K: 11, R: 6.5, gap: 10, pad: [40, 34, 40, 12], reach: 8 };
const M_WHITE = 1, M_GOLD = 2;
const RAY = ['#ffb030', '#f8961e', '#e87a0c'];
const GLOW = ['#ffb030', '#f09a1c', '#c0600c'];
/**
 * The crown's white: the trail's WHITE is a cool blue-white, and on gold it read as a silver
 * cap, snow on the letters. White-hot metal is warm, so the crown runs from the gold ramp's
 * own darks up through cream to white.
 */
const WHITE_HOT = ['#3a1a08', '#b85e10', '#f8961e', '#ffd67a', '#ffe8b0', '#fffbe8', '#ffffff'];

/** Polished metal by height, as zenith.js: pale top, dark horizon, a lighter reflection. */
function faceTone(ty, x, y) {
  const bands = [[0.14, 6], [0.4, 5], [0.49, 4], [0.55, 2], [0.8, 4], [2, 3]];
  for (let k = 0; k < bands.length; k++) {
    const [lim, t] = bands[k];
    if (ty < lim) {
      const next = bands[k + 1];
      if (next && lim - ty < 0.012 && ((x + y) & 1)) return next[1];
      return t;
    }
  }
  return 3;
}

function body(plan, lift) {
  const P = new Plan(plan.w, plan.h);
  const { w, h, d, qx, qy, R } = plan;
  const BEVEL = 3;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i] > R) continue;
      const ty = (y + 0.5 - plan.top) / plan.inkH;
      let t;
      if (d[i] > R - BEVEL) {
        const nx = (x + 0.5 - qx[i]) / (d[i] || 1), ny = (y + 0.5 - qy[i]) / (d[i] || 1);
        const l = nx * -0.6 + ny * -0.8;
        t = l > 0.55 ? 6 : l > 0.15 ? 5 : l > -0.3 ? 4 : l > -0.7 ? 2 : 1;
      } else t = faceTone(ty, x, y);
      // White-hot over the top two bands, gold at the foot: the step's colour (kit.js
      // STEP_BANDS). Gold with only a white crown, the first cut, averaged to the orange of
      // a CHAIN's floaters.
      P.mat[i] = bandAt(ty, x, y) < 2 ? M_WHITE : M_GOLD;
      P.tone[i] = Math.min(6, t + lift);
    }
  }
  P.despeckle(1);
  return P;
}

const GLINT = ['...1...', '...1...', '..121..', '1122211', '..121..', '...1...', '...1...'];

function glints(p, plan) {
  plan.letters.forEach((L, li) => {
    if (hash2(li, 7, 41) > 0.5) return;
    let best = null;
    for (const nd of L.nodes) if (!best || nd.x + nd.y < best.x + best.y) best = nd;
    const x0 = Math.round(best.x - 0.5 - plan.R + 2) - 3, y0 = Math.round(best.y - 0.5 - plan.R + 2) - 3;
    for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) {
      const c = GLINT[j][i];
      if (c === '2') p.set(x0 + i, y0 + j, '#ffffff');
      else if (c === '1') p.set(x0 + i, y0 + j, '#fffbe8');
    }
  });
}

/**
 * Radiance: thin rays from a point under the middle of the word, fanning over its top and
 * out past its ends, each two or three pixels wide and fading in stepped, dithered bands
 * with distance from the letters' box. Only on empty pixels, and never below the letters'
 * middle, so nothing hangs down toward the Duke.
 */
function rays(p, plan, reach) {
  const L0 = plan.letters[0], L1 = plan.letters[plan.letters.length - 1];
  const bx0 = L0.x0, bx1 = L1.x1, by0 = plan.top, by1 = plan.bottom;
  const cx = (bx0 + bx1) / 2, cy = by1 - 6;
  const col = RAY.map(rgba);
  const N = 17;
  const dirs = [];
  for (let k = 0; k < N; k++) {
    const a = -Math.PI * (0.03 + 0.94 * k / (N - 1));
    dirs.push([Math.cos(a), Math.sin(a)]);
  }
  for (let y = 0; y < Math.round((by0 + by1) / 2); y++) {
    for (let x = 0; x < p.w; x++) {
      if (p.alpha(x, y)) continue;
      const ox = Math.max(0, bx0 - x, x + 1 - bx1), oy = Math.max(0, by0 - y, y + 1 - by1);
      const out = Math.hypot(ox, oy);
      if (out <= 0 || out >= reach) continue;
      const px = x + 0.5 - cx, py = y + 0.5 - cy;
      for (const [dx, dy] of dirs) {
        if (px * dx + py * dy <= 0) continue;
        const across = Math.abs(px * dy - py * dx);
        if (across > 1.7 - out / reach) continue;
        const f = out + (((x + y) & 1) ? 0.6 : -0.6);
        const a = f < reach * 0.3 ? 0.62 : f < reach * 0.62 ? 0.38 : 0.18;
        const c = col[f < reach * 0.3 ? 0 : f < reach * 0.62 ? 1 : 2];
        p.set(x, y, [c[0], c[1], c[2], 255], a);
        break;
      }
    }
  }
}

function paintWith(m, lift, bare = false, P = body(m.plan, lift)) {
  const plan = m.plan;
  const white = WHITE_HOT, gold = ramp7('GOLD');
  const p = P.toPix({ [M_WHITE]: white, [M_GOLD]: gold }, { [M_WHITE]: gold[0], [M_GOLD]: gold[0] });
  if (bare) return frame(p, plan);
  if (!lift) glints(p, plan);
  ground(p, '#140802');
  glow(p, GLOW, [0.55, 0.32, 0.15], 2);
  rays(p, plan, 30);
  return frame(p, plan, 0, P);
}

export function paint(word) {
  const main = { plan: layoutWord(word, METRICS) };
  let big = null;
  return {
    frames: [
      // The letters' plan in one warm piece and the frame in the next (callouts.js): together
      // they were the heaviest piece of the warm-up, 20 ms cold.
      function* settled() { const P = body(main.plan, 0); yield; return paintWith(main, 0, false, P); },
      function* popped() { big = { plan: layoutWord(word, POP) }; yield; return paintWith(big, 4); },
      () => paintWith(main, 3),
      () => paintWith(main, 3, true),
    ],
    seq: [[1, 0.05, 0, -6], [2, 0.05, 0, 0], [0, 0.03, 0, -2]],
    sweep: { frame: 3, from: 0.2, dur: 0.45, band: 12 },
  };
}
