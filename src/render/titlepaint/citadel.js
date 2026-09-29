// CITADEL: letters of cut stone, edged in gold, as a herald would letter a gate -- and in the
// hollow of the D, the zone's arms on a shield.
//
// Built from the font's square pixels as the citadel is built from ashlar: every row of a
// letter is one course, laid in blocks two squares long with the joints breaking a square
// along from the course below -- fine, pale joints, as dressed stone has, where the crypt's
// are dark and rough. Each block is the pale warm-grey of the zone's ledges (#a69e95 to
// #b5ada5) with a chiselled chamfer: a lit top and left edge, a shaded foot and right edge.
// Round the whole letter runs a gilt edge in the decor banner's golds (decorpaint/
// citadel.js GOLD): bright where it faces the light, deep amber where it faces away, then
// the near-black outline. (A gilt cross cut into one letter's face was tried and dropped: in
// a stem seven pixels of stone wide it came out a yellow speck.)
//
// THE ARMS. The brief asked for cut stone with gold AND heraldry, and the first cut had only
// the first two: at a glance, and at 1x, it was pale block letters with a gold rim -- the
// one title of the twelve that could have been any zone's text with a tint. The heraldry
// could not go ON a stem (the cross above), so it goes in the hollow of the D, as the
// dungeon's skull sits in its O: a heater shield bearing the zone's own device, the black
// castle on gold of the citadel's banners (decorpaint/citadel.js CASTLE, EMBLEM) -- "or, a
// castle sable". The shield is 19 x 24 with its rim lit from the upper left, a dark engraved
// line inside the rim and a bright gold field, so the dark castle stands on the brightest
// thing in the word; the D's hollow is 33 px across, which leaves the backdrop showing
// between the shield's own outline and the stems' shadow, and the D still reads as a D.
//
// AGAINST THE CITADEL. The walls behind are blue stone and arches (#566f9c to #3d5480,
// luminance ~0.08-0.15); pale warm stone is brighter than them and opposite in hue, and the
// gold edge and dark outline cut it out from the columns it crosses.
//
// THE ENTRANCE: each letter is set down into place like a dressed block, with a thud.

import { layoutWord, cellMap, depthInSteps, Plan, dropShadowSteps, haloSteps, hash2, overdue } from './util.js';

const STONE = ['#2d2a33', '#56525e', '#7e7984', '#a39d98', '#b4aea7', '#c8c2ba', '#dcd7cf', '#f0ece6'];
// The banner's golds (decorpaint/citadel.js GOLD), darkest first.
const GOLD = ['#6f3524', '#a9632b', '#dc9a33', '#f4c64e', '#fff0a8'];
const M_STONE = 1, M_GOLD = 2, M_CREST = 3, M_CHARGE = 4;
// The banner's castle and its gate (decorpaint/citadel.js EMBLEM, DOOR).
const CHARGE = ['#2a1f2e', '#a9632b'];
const INK = '#0d0b14';
const SHADOW = '#070610';

export const METRICS = { K: 11, R: 5.5, gap: 12, pad: [16, 16, 18, 16], reach: 4 };

function* ashlar(plan) {
  const { w, h, K } = plan;
  const { cell, list } = cellMap(plan);
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = cell[i] >= 0 ? 1 : 0;
  const dep = yield* depthInSteps(mask, w, h, 4);
  const P = new Plan(w, h);
  for (let y = 0; y < h; y++) {
    if (overdue()) yield;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      const q = list[cell[i]];
      // The block: two squares along the course, starting on even squares on even courses
      // and odd ones on odd courses.
      const pairStart = q.c - ((q.c + q.r) & 1);
      const bx0 = Math.round(plan.letters[q.li].ox + pairStart * K - (K - 1) / 2);
      const u = x - bx0, v = y - q.y0;
      let t;
      if (u === 2 * K - 1 || v === K - 1) t = 2;            // the joint, fine and pale-ish
      else {
        t = hash2(pairStart, q.r, 3 + q.li) < 0.3 ? 4 : 5;
        if (hash2(x >> 1, y >> 1, 9) < 0.12) t--;
        if (v === 0 || u === 0) t = 6;
        if (v === 0 && u === 0) t = 7;
        if (v === K - 2 || u === 2 * K - 2) t = 3;
      }
      // The gilt edge: the letter's outer two pixels, lit or deep by the way they face.
      if (dep[i] <= 2) {
        const up = !mask[i - w] || (dep[i] === 2 && !mask[i - 2 * w]);
        const left = !mask[i - 1] || (dep[i] === 2 && !mask[i - 2]);
        const down = !mask[i + w] || (dep[i] === 2 && !mask[i + 2 * w]);
        const right = !mask[i + 1] || (dep[i] === 2 && !mask[i + 2]);
        let g = up || left ? 4 : down || right ? 1 : 2;
        if (dep[i] === 2) g = up || left ? 3 : down || right ? 2 : 3;
        if ((up || left) && (down || right)) g = 2;
        P.put(x, y, M_GOLD, g);
        continue;
      }
      P.put(x, y, M_STONE, t);
    }
  }
  return P;
}

// The citadel banner's castle (decorpaint/citadel.js CASTLE), copied: 11 x 15, d the gate.
const CASTLE = [
  '...#.#.#...',
  '...#####...',
  '....###....',
  '....###....',
  '#.#.###.#.#',
  '###.###.###',
  '###.###.###',
  '###.###.###',
  '###########',
  '###########',
  '###########',
  '#####d#####',
  '####ddd####',
  '####ddd####',
  '####ddd####',
];
// The heater shield's rows, widest first: straight sides, then a curve to the point.
const SHIELD_ROWS = [...new Array(14).fill(19), 19, 17, 17, 15, 13, 11, 9, 7, 5, 3];
const SHIELD_W = 19;

/**
 * The arms in the hollow of the D (or an O): a gold heater shield, rim lit from the upper
 * left, a dark line engraved inside it, a bright field, and the banner's black castle. Only
 * a hollow three squares by five holds it; a B's bowls are two squares tall.
 */
function crest(P, plan) {
  const L = plan.letters.find((q) => q.ch === 'D' || q.ch === 'O');
  if (!L) return;
  const K = plan.K;
  // The hollow's middle: column 2, row 3 of the glyph.
  const cx = Math.round(L.ox + 2 * K), cy = Math.round(L.oy + 3 * K);
  const x0 = cx - (SHIELD_W >> 1), y0 = cy - (SHIELD_ROWS.length >> 1);
  const H = SHIELD_ROWS.length;
  const inS = (i, j) => j >= 0 && j < H && Math.abs(i - (SHIELD_W >> 1)) <= (SHIELD_ROWS[j] >> 1);
  // Depth in the shield: 1 on its rim, 2 the line inside it, 3+ the field.
  const depth = (i, j) => {
    for (let k = 1; k <= 3; k++) {
      if (!inS(i - k, j) || !inS(i + k, j) || !inS(i, j - k) || !inS(i, j + k) ||
          !inS(i - k, j + k) || !inS(i + k, j + k)) return k;
    }
    return 4;
  };
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < SHIELD_W; i++) {
      if (!inS(i, j)) continue;
      const dep = depth(i, j);
      let t;
      if (dep === 1) {
        const up = !inS(i, j - 1), left = !inS(i - 1, j);
        const down = !inS(i, j + 1), right = !inS(i + 1, j);
        // Lit where it faces up or left, dark where it faces down or right; the curve at the
        // foot faces down both ways, the left side of it a step lighter than the right.
        t = (up || left) && !down ? 4 : right || (down && i > SHIELD_W >> 1) ? 0 : down ? 1 : 3;
        if (up && i > SHIELD_W - 4) t = 3;
      } else if (dep === 2) {
        t = 1;
      } else {
        t = 3;
        // A glint in the field's lit corner.
        if (j <= 3 && i <= 4 && i + j <= 5) t = 4;
      }
      P.put(x0 + i, y0 + j, M_CREST, t);
    }
  }
  const cx0 = x0 + ((SHIELD_W - CASTLE[0].length) >> 1), cy0 = y0 + 2;
  CASTLE.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      if (row[i] === '#') P.put(cx0 + i, cy0 + j, M_CHARGE, 0);
      else if (row[i] === 'd') P.put(cx0 + i, cy0 + j, M_CHARGE, 1);
    }
  });
}

function* finish(P) {
  const p = yield* P.toPixSteps({ [M_STONE]: STONE, [M_GOLD]: GOLD, [M_CREST]: GOLD, [M_CHARGE]: CHARGE },
    { [M_STONE]: INK, [M_GOLD]: INK, [M_CREST]: INK });
  yield* dropShadowSteps(p, SHADOW, [[1, 1, 0.85], [2, 2, 0.7], [3, 3, 0.55]]);
  yield* haloSteps(p, SHADOW, 2, 0.5);
  return p;
}

// `plan` may be handed in already laid out (util.js layoutSteps; see basement.js).
export function paint(word, theme, plan = layoutWord(word, METRICS)) {
  return {
    plan,
    // A generator: the ashlar in one step, the outline and shadow in the next.
    frames: [function* dressed() {
      const P = yield* ashlar(plan);
      if (overdue()) yield;
      crest(P, plan);
      yield;
      return yield* finish(P);
    }],
    seq: [[0, 0.035, -16], [0, 0.035, -6], [0, 0.03, 2]],
    stagger: 0.045,
  };
}
