// The prestige badge: x2, x3 ... beside a callout's word on every lap of the tower after
// the first, for a Duke who has climbed a whole lap of the zones and not died.
//
// The user asked for a 2x beside the next announcement, as a mark of prestige: the thing a
// player is proud of. So it is not a number in the HUD's font. It is lettered in the
// callouts' own kit (kit.js) at art resolution, one art pixel per backing pixel: the same
// font as a skeleton, the same bevel lit from the upper left, the same ramps, the same
// drop shadow, dark bed and stepped glow as the words -- so it reads as part of the callout
// and not as a sticker on it -- and made precious: a plaque of red enamel in a bevelled gold
// frame, gules and or, the colours of the Vytis's own arms, with the lap in polished gold on
// it (GLORY's metal: pale top, dark horizon, a lighter reflection under it), a warm glow
// round it and a four-point glint on its corner that twinkles while it is up.
//
// The x is the font's X drawn smaller, on the digits' baseline, a lower-case times sign:
// at the digits' size "X2" read as a word, not as a multiplier.
//
// One badge serves all seven words of its lap, so it is painted once per lap, ahead (see
// callouts.js warmBadges): the second lap's while the first is being climbed.
//
// Everything is in ART pixels, one to one with the backing store, y down.

import { layoutWord, Plan, ramp7, ground, glow, mix, NIGHT } from './kit.js';
import { FIXED } from '../sparks.js';

/** The digits' letterforms: node spacing, stroke half-width, gap. [art px] */
const DIG = { K: 5, R: 2.5, gap: 5 };
/** The same, a size up, for the entrance's pop: a second drawing, not a scaled one. */
const POP = { K: 6, R: 3, gap: 6 };
/** Enamel showing round the lettering inside the frame, across and down. [art px] */
const MARGIN = [7, 5];
/** The gold frame's width, and the cut across each corner. [art px] */
const RIM = 3;
const CHAMFER = 5;
/** Room round the plaque for its shadow, dark bed and glow. [art px] */
const ROOM = 12;

const M_ENAMEL = 1, M_RIM = 2, M_GOLD = 3;

/**
 * Red enamel, darkest first: the trail's RED ramp's deep tone pulled toward night for the
 * body, and a step toward its body colour for the gloss. The enamel is the dark ground the
 * gold stands off, so the digits read the same over every zone: measured beside THUNDER over
 * all twelve at four heights, 7.5:1 at worst against the brightest tenth of what surrounds
 * them and 5.6:1 against the backdrop's median (tools/test-callouts.mjs, 3).
 */
const RED = FIXED.RED;
const ENAMEL = [mix(RED[0], NIGHT, 0.8), mix(RED[0], NIGHT, 0.55), mix(RED[0], NIGHT, 0.3), RED[0],
  mix(RED[0], RED[1], 0.3)];
const GLOW = ['#ffb030', '#f09a1c', '#c0600c'];
const SHADOW = '#140802';

/** Polished metal by height in the lettering, as GLORY's: pale top, dark horizon, reflection. */
function metal(ty) {
  return ty < 0.16 ? 6 : ty < 0.42 ? 5 : ty < 0.52 ? 4 : ty < 0.6 ? 2 : ty < 0.82 ? 4 : 3;
}

/** A tone from how a surface faces the light (up and to the left): lit 6 ... shaded 1. */
function facing(nx, ny) {
  const l = nx * -0.6 + ny * -0.8;
  return l > 0.55 ? 6 : l > 0.15 ? 5 : l > -0.3 ? 4 : l > -0.7 ? 2 : 1;
}

/**
 * Lay the badge out: the lettering's distance field (the digits from the font, the times
 * sign added as two strokes), and the plaque's box round them.
 */
function layout(lap, m) {
  const text = String(lap);
  const Rf = Math.floor(m.R);
  const inkH = 6 * m.K + 2 * Rf + 1;
  // The times sign: a little over half the digits' height, standing on their baseline.
  const xs = Math.round(inkH * 0.55) | 1;
  const S = xs - 2 * Rf - 1;
  const left = ROOM + RIM + MARGIN[0];
  const top = ROOM + RIM + MARGIN[1];
  const side = ROOM + RIM + MARGIN[0];
  const plan = layoutWord(text, { K: m.K, R: m.R, gap: m.gap,
    pad: [left + xs + m.gap, top, side, ROOM + RIM + MARGIN[1]], reach: 3 });
  const x0 = left + Rf + 0.5, y0 = top + inkH - 1 - Rf - S + 0.5;
  const segs = [[x0, y0, x0 + S, y0 + S], [x0 + S, y0, x0, y0 + S]];
  const { w, d, qx, qy } = plan;
  for (let y = Math.floor(y0 - Rf - 3); y < Math.ceil(y0 + S + Rf + 3); y++) {
    for (let x = left - 3; x < left + xs + 3; x++) {
      const px = x + 0.5, py = y + 0.5, i = y * w + x;
      for (const [ax, ay, bx, by] of segs) {
        const vx = bx - ax, vy = by - ay;
        let t = ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = ax + vx * t, cy = ay + vy * t;
        const dd = Math.hypot(px - cx, py - cy);
        if (dd < d[i]) { d[i] = dd; qx[i] = cx; qy[i] = cy; }
      }
    }
  }
  const last = plan.letters[plan.letters.length - 1];
  const box = [left - MARGIN[0] - RIM, top - MARGIN[1] - RIM, last.x1 + MARGIN[0] + RIM, top + inkH + MARGIN[1] + RIM];
  return { plan, box, top, inkH };
}

/**
 * The plaque and its lettering as a material plan: enamel, the gold frame bevelled in two
 * slopes (its outer edge lit up and to the left, its inner edge the other way, so it
 * stands proud of the enamel), and the lettering bevelled crisp -- one pixel of edge,
 * lit or shaded by the way it faces -- round a polished face, cut into the enamel by a
 * dark line and a shadow down and to the right. `lift` raises the gold (white-hot).
 */
function body(L, lift = 0) {
  const { plan, box, top, inkH } = L;
  const { w, h, d, qx, qy, R } = plan;
  const [X0, Y0, X1, Y1] = box;
  const P = new Plan(w, h);
  const gold = (i) => d[i] <= R;
  for (let y = Y0; y < Y1; y++) {
    for (let x = X0; x < X1; x++) {
      const dl = x - X0, dr = X1 - 1 - x, dt = y - Y0, db = Y1 - 1 - y;
      const dx = Math.min(dl, dr), dy = Math.min(dt, db);
      if (dx + dy < CHAMFER) continue;
      const i = y * w + x;
      // Distance in from the plaque's edge, the corners cut at 45 degrees, and the way the
      // nearest edge faces.
      const dc = (dx + dy - CHAMFER) * Math.SQRT1_2;
      const e = Math.min(dx, dy, dc);
      let nx = 0, ny = 0;
      if (e === dc && dc < Math.min(dx, dy)) {
        nx = (dl < dr ? -1 : 1) * Math.SQRT1_2; ny = (dt < db ? -1 : 1) * Math.SQRT1_2;
      } else if (dx < dy) nx = dl < dr ? -1 : 1;
      else ny = dt < db ? -1 : 1;
      if (e < RIM) {
        // The frame: outer slope, flat, inner slope.
        const t = e < 1 ? facing(nx, ny) : e < RIM - 1 ? 5 : facing(-nx, -ny) - 1;
        P.mat[i] = M_RIM;
        P.tone[i] = Math.min(6, Math.max(1, t) + lift);
        continue;
      }
      if (gold(i)) {
        const ty = (y + 0.5 - top) / inkH;
        let t;
        if (d[i] > R - 1) {
          const n = d[i] || 1;
          t = facing((x + 0.5 - qx[i]) / n, (y + 0.5 - qy[i]) / n);
        } else t = metal(ty);
        P.mat[i] = M_GOLD;
        P.tone[i] = Math.min(6, t + lift);
        continue;
      }
      // Enamel: the frame's shadow along the top, a gloss across the upper half, the cut
      // round the lettering and its shadow down and to the right.
      let t = y - Y0 < RIM + 1 ? 1 : y < (Y0 + Y1) / 2 ? 3 : 2;
      if (t === 3 && y === Math.floor((Y0 + Y1) / 2) - 1 && (x & 1)) t = 2;
      if (d[i] <= R + 1) t = 0;
      else if (gold((y - 1) * w + x - 1) || d[(y - 1) * w + x - 1] <= R + 1) t = 0;
      else if (d[(y - 2) * w + x - 2] <= R) t = Math.min(t, 1);
      P.mat[i] = M_ENAMEL;
      P.tone[i] = Math.min(4, t + (lift ? 1 : 0));
    }
  }
  P.despeckle(1);
  return P;
}

/** A four-point glint, as GLORY's, centred on (cx, cy): the big one, and the small. */
const GLINT = ['...1...', '...1...', '..121..', '1122211', '..121..', '...1...', '...1...'];
const GLINT_SMALL = ['..1..', '.121.', '12221', '.121.', '..1..'];

function glint(p, cx, cy, rows) {
  const n = rows.length, o = (n - 1) / 2;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const c = rows[j][i];
    if (c === '2') p.set(cx - o + i, cy - o + j, '#ffffff');
    else if (c === '1') p.set(cx - o + i, cy - o + j, '#fff6c0');
  }
}

/**
 * A frame the runtime can place: the Pix and its anchor, the plaque's centre. `half` is the
 * plaque's width left of that centre, so the runtime can stand its left edge a set gap
 * from the word; `letters` which pixels are the gold lettering (not the frame or the
 * enamel), for the tools that measure how well it reads.
 */
function framed(L, P, { lift = 0, bare = false, sparkle = null } = {}) {
  const letters = P.mat.map((m) => (m === M_GOLD ? 1 : 0));
  const gold7 = ramp7('GOLD');
  const p = P.toPix({ [M_ENAMEL]: ENAMEL, [M_RIM]: gold7, [M_GOLD]: gold7 },
    { [M_RIM]: gold7[0], [M_GOLD]: gold7[0] });
  const [X0, Y0, X1, Y1] = L.box;
  const ax = Math.round((X0 + X1) / 2), ay = Math.round((Y0 + Y1) / 2);
  if (!bare) {
    ground(p, SHADOW);
    glow(p, GLOW, lift ? [0.62, 0.38, 0.18] : [0.5, 0.28, 0.12], 2);
    // On the frame's upper-left corner, where the light comes from.
    if (sparkle) glint(p, X0 + 3, Y0 + 3, sparkle);
  }
  return { pix: p, ax, ay, half: ax - X0, letters };
}

/**
 * The badge for lap `lap`, in the painters' format (calloutpaint/index.js): frames painted
 * one per warm step, an entrance, a glint sweep and a twinkle.
 */
export function paint(lap) {
  const main = layout(lap, DIG);
  let P = null, big = null;
  const base = () => P || (P = body(main));
  return {
    frames: [
      // 0: settled, a small glint on the corner.
      function* settled() { base(); yield; return framed(main, P, { sparkle: GLINT_SMALL }); },
      // 1: the pop -- a size up and white-hot, the plaque struck.
      function* popped() { big = layout(lap, POP); const Q = body(big, 3); yield; return framed(big, Q, { lift: 1 }); },
      // 2: its own size, still white-hot.
      () => framed(main, body(main, 3), { lift: 1, sparkle: GLINT }),
      // 3: bare and hot, for the glint that sweeps across it as it cools.
      () => framed(main, body(main, 3), { bare: true }),
      // 4: the twinkle, the glint at full size.
      () => framed(main, base(), { sparkle: GLINT }),
    ],
    seq: [[1, 0.05, 0, 0], [2, 0.06, 0, 0]],
    sweep: { frame: 3, from: 0.14, dur: 0.36, band: 10 },
    loop: [[0, 0.46], [4, 0.1]],
  };
}
