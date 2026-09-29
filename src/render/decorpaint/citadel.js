// CITADEL: a banner on a pole -- the heraldry of the citadel: arches, order, ceremony.
//
// Redrawn from the second board (assets/decor-fixes-reference.webp): a gold cloth with a
// black castle on it, hung by two gold rings from a crossbar with a gold finial at each
// end, on a capped wooden staff standing in a stone plinth -- and four frames in which the
// cloth really moves.
//
// THE SWAY, AND WHAT WAS WRONG WITH IT. The first drawing painted one flat cloth and shifted
// each of its rows sideways by a wave: the fold stripes stepped instead of bending, and the
// cloth was 18 px wide in every frame -- a sheared rectangle, not a hanging cloth. Now each
// frame carries the flat cloth FORWARD through a shape of its own (paintCloth): the free
// edge flares out from under its ring, the lower cloth swings right and widens, the torn
// point lifts and falls, and the folds deepen from a hairline valley at rest to a lit ridge
// over a dark valley at the height of the swing. The folds are drawn on the flat cloth, so
// they bend with it rather than step. Measured row by row, the cloth is 15 px wide at rest
// and up to 18, 19 and 17 in frames 2-4; the point's lowest row is 41, 40, 37, 39.
//
// THE LOOP. The board's frames 2 and 3 both swing hard the same way. Frame 4 here eases
// back -- the upper cloth home, the point still out to the right and falling -- so 4 -> 1
// changes fewer silhouette pixels (48) than any other step (59 to 127): no jump. And what
// does not move stays put: above the castle's foot, frame 4 is frame 1 pixel for pixel but
// for its flared edge, and through the castle's rows frames 2 and 3 carry the same pixels
// one to the right (see the tie rule in paintCloth; without it the hem and the swag fold
// flickered on 4 -> 1).
//
// THE CASTLE NEVER BENDS. The swing and the widening start below it, and the flare stretches
// only the gold margin to its right; in frames 2 and 3 the cloth leans a pixel right from
// the rings, above the castle, and the castle rides it whole. Kept from the first drawing,
// where a pixel's shift through the middle of the charge broke every tower in it on two
// frames of four -- and the mapped cloth did the same thing here: with a pixel of swing
// through the castle's rows, every tower stepped sideways at one row. The board tilts the
// charge in frame 3; at 11 px a tilt is a break.
//
// The castle, 11 x 15: three towers and a curtain wall with an arched gate. The middle tower
// has a corbelled top of three merlons; towers that each ended in two merlons read, at 4x,
// as a crown, and the corbel is what makes the middle one a keep. No window: an earlier
// charge had one in the middle tower, and with the gate under it and the merlon gaps either
// side, the castle had a face. The cloth is 15 wide to leave two columns of gold either side
// of the charge; with one, the charge ran into the outline and read as a dark band.
//
// Gold, hue-shifted: pale yellow in the light, through the zone accent's orange-gold, to a
// red-brown in the folds -- not gold darkened toward grey, which on this blue went green. The
// cloth is 6.3-6.9:1 against the wall's median in a real frame (the first drawing 5.4-5.8:1).
//
// The staff is the board's brown wood; the first drawing's was black iron. Either way it is
// dark on a dark wall: the wood's body is 1.3:1, no better than the iron's. What carries it
// is a one-pixel lit column in the wood's highlight, 3.9:1 (the iron's lit edge was 3.8:1),
// its outline, and hue -- warm brown on cool blue.
//
// The plinth: two courses of brown stone, the lower one wider. Its bottom row is the stone's
// darkest tone, a contact row resting on the tile's own dark top row, and its lit tone only
// starts each stone, with a joint after it, so it grounds the staff without drawing a second
// lit line four rows above the landing line; its brightest stone (L 0.34) is half the
// ledge's lit row. No runtime shadow into the lip either: it would only put a gap in the
// landing line.
//
// What each field means, and the rules for paint() and scene(), are in index.js.

import { fit } from './util.js';

/** Share of ledges (22+ units wide) that carry anything here. */
export const CHANCE = 0.28;

const GOLD = ['#fff0a8', '#f4c64e', '#dc9a33', '#a9632b', '#6f3524'];
// Wood and stone, hue-shifted the same way: tan and warm grey in the light, toward plum in
// the shade.
const WOOD = ['#b8834e', '#8a5a38', '#5e3a28', '#3d2422', '#28171b'];
const STONE = ['#b39a80', '#8c735e', '#675243', '#463530', '#2d2124'];
const EMBLEM = '#2a1f2e';
const DOOR = GOLD[3];
const INK = '#0d0b14';

// Rows 1-8, none of which ever moves: the staff's cap, the joint block where the crossbar
// crosses the staff, the bar (lit on top), a gold finial at each end, and the gold rings at
// columns 9 and 23 that hold the cloth's corners. The left finial is one pixel wide and in
// from column 0: a first knob two wide ran into the box's edge and lost its outline there,
// which cut the bar off flat.
const TOP = [
  '...HHLBS.................',
  '...LBBSD.................',
  '....HBS..................',
  '....HBS..................',
  '.1.HLLLB.1.............1.1',
  '.0LLBBBSL1LLLLLLLLLLLLL1L0',
  '.2SBBBSSS2SSSSSSSSSSSSS2S2',
  '.3.SSSSD.3.............3.3',
];
// Row 43 down: the staff's foot, and the plinth.
const PLINTH = [
  '...LBBBS......',
  '..abbdabbdabb.',
  '..ccdeccdeccd.',
  '.abdabbdabbdab',
  '.eeeeeeeeeeeee',
];
const PAL = {
  H: WOOD[0], L: WOOD[1], B: WOOD[2], S: WOOD[3], D: WOOD[4],
  0: GOLD[0], 1: GOLD[1], 2: GOLD[2], 3: GOLD[3], 4: GOLD[4],
  a: STONE[0], b: STONE[1], c: STONE[2], d: STONE[3], e: STONE[4],
};

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

// The flat cloth: CW columns, its sides SIDE rows long, then each column's own extra length
// -- the board's torn point, deepest in the middle (TIP rows from the top), with ragged
// teeth down both sides. Each tooth is two columns wide: a one-column tooth, outlined, is a
// speck. At rest its top-left is (X0, Y0) in the box, and the castle's top-left is CC
// columns and CS rows into it.
const CW = 15, SIDE = 25, TIP = 34, X0 = 9, Y0 = 8, CS = 4, CC = 2;
const TAIL = [1, 1, 0, 2, 3, 4, 6, 9, 7, 5, 6, 6, 3, 1, 1];

// The folds are ridges, each a segment on the flat cloth from (xa, ta) to (xb, tb): x in
// the cloth's columns, t down it (0 at the bar, 1 at the point), d its depth. The SWAG is
// the pair hanging from the rings, the same in every frame.
const SWAG = [{ xa: 0.6, ta: 0, xb: 4.5, tb: 0.15, d: 0.8 }, { xa: 14.6, ta: 0, xb: 11, tb: 0.15, d: 0.8 }];

// Each frame's shape, in art px. c: the lean from the rings, which carries the castle whole;
// a1: how far the point's end of the cloth swings right beyond the lean; a2: the point's own
// lead or lag on top of that (negative: it trails the swing, frame 2); b: how much the lower
// cloth widens; e: how far the free edge flares out from under its ring; lr, lt: how many
// rows the free corner and the point lift; lit: how far the right half turns from the light.
// Frame 4 is the way back: no lean, the point still out and falling.
const FR = [
  { c: 0, a1: 0, a2: 0, b: 0, e: 0, lr: 0, lt: 0, lit: 0,
    folds: [{ xa: 5, ta: 0.55, xb: 5, tb: 1, d: 0.7 }, { xa: 10.5, ta: 0.58, xb: 10.5, tb: 1, d: 0.7 }] },
  { c: 1, a1: 2.5, a2: -1, b: 1, e: 2, lr: 2, lt: 0.5, lit: 0.2,
    folds: [{ xa: 5, ta: 0.52, xb: 4.5, tb: 1, d: 1 }, { xa: 10.5, ta: 0.54, xb: 9.5, tb: 1, d: 1 },
      { xa: 13.2, ta: 0.1, xb: 13, tb: 0.8, d: 0.9 }] },
  { c: 1, a1: 5, a2: 1, b: 1, e: 3, lr: 4, lt: 3.5, lit: 0.25,
    folds: [{ xa: 5.5, ta: 0.5, xb: 4, tb: 1, d: 1.6 }, { xa: 11, ta: 0.52, xb: 9.5, tb: 1, d: 1.3 },
      { xa: 13.2, ta: 0.08, xb: 12.9, tb: 0.8, d: 1 }] },
  { c: 0, a1: 1, a2: 1.8, b: 0.5, e: 1, lr: 1.5, lt: 1.5, lit: 0.1,
    folds: [{ xa: 5, ta: 0.54, xb: 5.5, tb: 1, d: 0.8 }, { xa: 10.5, ta: 0.56, xb: 11, tb: 1, d: 0.8 }] },
];

const ss = (a, b, t) => { const x = Math.max(0, Math.min(1, (t - a) / (b - a))); return x * x * (3 - 2 * x); };

/**
 * A ridge's shading across it, in tones: lit on its left flank (toward the light), dark on
 * its right, nothing a couple of columns off. The lit flank is weaker than the dark one, so
 * a shallow fold at rest is a dark hairline alone rather than a pale stripe beside it.
 */
function ridge(fo, x, t) {
  if (t < fo.ta || t > fo.tb) return 0;
  const k = (t - fo.ta) / (fo.tb - fo.ta);
  const q = (x - (fo.xa + (fo.xb - fo.xa) * k)) / 1.1;
  const g = 2.33 * q * Math.exp(-q * q);
  return fo.d * ss(0, 0.25, k) * (g < 0 ? 0.6 * g : g);
}

/**
 * Frame f's cloth. Mapped FORWARD: every sample of the flat cloth (an eighth of a column by
 * a quarter of a row -- the flare stretches the edge columns to two and a half times their
 * width, and at a quarter of a column that left holes) is carried to where the frame puts
 * it, and each box pixel takes the sample landing nearest its centre. Forward, because any
 * shape can be written that way and none has to be inverted.
 */
const NU = 8, NS = 4;
// What each column of samples needs in every frame, worked out once: its place across the
// cloth, its length down to the torn edge, the sag of the top edge above it, and how much
// of the flare and of the point's lift it takes. (Per sample, these were most of the build.)
const ACROSS = { u: [], len: [], sag: [], flare: [], point: [] };
for (let i = 0; i < CW * NU; i++) {
  const u = (i + 0.5) / (CW * NU);
  ACROSS.u.push(u);
  ACROSS.len.push(SIDE + TAIL[Math.floor(u * CW)]);
  ACROSS.sag.push(1.3 * Math.sin(Math.PI * u));
  ACROSS.flare.push(ss(0.86, 1, u));
  ACROSS.point.push(Math.exp(-((u - 0.5) ** 2) / 0.02));
}

function paintCloth(p, f) {
  const k = FR[f];
  const best = new Float32Array(p.w * p.h).fill(9);
  const at = new Float32Array(p.w * p.h * 3);
  for (let j = 0; j < (SIDE + 10) * NS; j++) {
    const s = (j + 0.5) / NS, t = s / TIP;
    // The lean is complete three rows under the rings, above the castle (t 0.12-0.56); the
    // swing, the widening and the lift start below it, so the castle never bends (see the
    // header). The flare runs from the ring down.
    const low = Math.max(0, (t - 0.56) / 0.44);
    const dx = k.c * ss(0.03, 0.1, t) + k.a1 * low ** 1.3 + k.a2 * t ** 6, wd = CW + k.b * low * low, fl = k.e * ss(0, 0.6, t);
    const xr = X0 + dx + wd + fl;
    const liftR = k.lr * ss(0.56, 0.88, t), liftT = k.lt * ss(0.56, 1, t);
    for (let i = 0; i < CW * NU; i++) {
      const u = ACROSS.u[i];
      // Below the torn edge, or above the top edge's sag between the rings: not cloth.
      if (s >= ACROSS.len[i] || s < ACROSS.sag[i]) continue;
      const x = X0 + dx + wd * u + fl * ACROSS.flare[i];
      const y = Y0 + s - liftR * u * u - liftT * ACROSS.point[i];
      const px = Math.floor(x), py = Math.floor(y);
      if (px < 0 || py < 0 || px >= p.w || py >= p.h) { p.spill++; continue; }
      const d = (x - px - 0.5) ** 2 + (y - py - 0.5) ** 2, n = py * p.w + px;
      // A near tie goes to the sample met first. At rest the samples sit exactly halfway
      // either side of every pixel centre, so the first always won; in frame 4 a displacement
      // of a billionth of a pixel (the point's t^6 lead, felt at the top) flipped half those
      // ties, and eight pixels of the hem and the swag fold, which do not move, flickered on
      // every 4 -> 1. Within a thousandth (a shift under 0.004 px) it is a tie.
      if (d < best[n] - 1e-3) { best[n] = d; at[3 * n] = u; at[3 * n + 1] = s; at[3 * n + 2] = xr - x; }
    }
  }
  // Cloth where a sample landed within 0.45 px of the centre: at half a pixel, the corner
  // under the right ring, carried a fiftieth of a pixel by the flare, took the column past
  // the ring.
  const inside = (px, py) => px >= 0 && py >= 0 && px < p.w && py < p.h && best[py * p.w + px] <= 0.2;
  // A pixel of air with cloth on all four sides -- where the lift squeezes the point's teeth
  // together -- is a hole the outline would fill with a black speck: it is cloth, borrowing
  // the sample of the pixel above it.
  const hole = (px, py) => !inside(px, py) && inside(px - 1, py) && inside(px + 1, py) && inside(px, py - 1) && inside(px, py + 1);
  for (let py = 1; py < p.h - 1; py++) {
    for (let px = 1; px < p.w - 1; px++) {
      if (!hole(px, py)) continue;
      const n = py * p.w + px, m = n - p.w;
      best[n] = 0;
      at[3 * n] = at[3 * m]; at[3 * n + 1] = at[3 * m + 1]; at[3 * n + 2] = at[3 * m + 2];
    }
  }
  const cloth = inside;
  // The plan: a GOLD index per pixel, CHARGE or GATE for the castle, -1 for air.
  const CHARGE = 10, GATE = 11;
  const plan = new Int8Array(p.w * p.h).fill(-1);
  for (let py = 0; py < p.h; py++) {
    for (let px = 0; px < p.w; px++) {
      const n = py * p.w + px;
      if (!cloth(px, py)) continue;
      // A pixel with no cloth beside it above, below or to either side is a torn thread the
      // outline would turn into a speck: leave it out.
      if (!cloth(px - 1, py) && !cloth(px + 1, py) && !cloth(px, py - 1) && !cloth(px, py + 1)) continue;
      const u = at[3 * n], s = at[3 * n + 1], edge = at[3 * n + 2];
      const cr = Math.floor(s) - CS, cc = Math.floor(u * CW) - CC;
      const ch = cr >= 0 && cr < CASTLE.length && cc >= 0 && cc < CASTLE[0].length ? CASTLE[cr][cc] : '.';
      if (ch === '#') { plan[n] = CHARGE; continue; }
      if (ch === 'd') { plan[n] = GATE; continue; }
      const t = s / TIP, x = u * CW;
      // Lit from the upper left: the right third a step down, the last pixel or two before
      // the free edge -- wherever the flare has carried it -- another step, as it turns away.
      let tone = 1 + 0.6 * ss(8, 13, x) + 0.8 * (1 - ss(0.5, 1.6, edge));
      tone += k.lit * ss(6, 11, x) * (1 - ss(12.5, 14, x)) * ss(0.4, 0.7, t);
      for (const fo of SWAG) tone += ridge(fo, x, t);
      for (const fo of k.folds) tone += ridge(fo, x, t);
      if (s < 1.3 * Math.sin(Math.PI * u) + 1) tone += 1.2;        // the hem, under the bar
      plan[n] = Math.max(0, Math.min(s < 3 ? 4 : 3, Math.round(tone)));
    }
  }
  // Despeckle, twice: a gold pixel whose tone none of its gold neighbours share takes the
  // tone most of them have. Where the flare stretches the cloth's right edge, the edge's
  // darkening and the fold beside it rounded to alternate tones pixel by pixel -- a dither
  // that read as grit on the one part of the cloth that moves most.
  for (let pass = 0; pass < 2; pass++) {
    const was = plan.slice();
    for (let py = 0; py < p.h; py++) {
      for (let px = 0; px < p.w; px++) {
        const n = py * p.w + px, me = was[n];
        if (me < 0 || me > 4) continue;
        const votes = [0, 0, 0, 0, 0];
        let same = false, any = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const x = px + dx, y = py + dy;
          if (x < 0 || y < 0 || x >= p.w || y >= p.h) continue;
          const o = was[y * p.w + x];
          if (o < 0 || o > 4) continue;
          any = true;
          if (o === me) same = true;
          votes[o]++;
        }
        if (any && !same) plan[n] = votes.indexOf(Math.max(...votes));
      }
    }
  }
  // De-dash, twice: a gold pixel set off from BOTH its neighbours across the cloth, whose
  // same-tone group (8-connected, so a diagonal fold line counts as one) is one or two pixels,
  // takes a neighbour's tone. The despeckle above keeps a two-pixel dash, because each half
  // shares its tone with the other: frames 2 and 3 kept five and nine such pixels where the
  // folds, the flare and the edge's darkening cross -- brown dashes and a pale nick beside
  // the lit ridge, grit at 4x. A fold runs down the cloth, so it is never that short.
  for (let pass = 0; pass < 2; pass++) {
    const was = plan.slice();
    for (let py = 1; py < p.h - 1; py++) {
      for (let px = 1; px < p.w - 1; px++) {
        const n = py * p.w + px, me = was[n];
        if (me < 0 || me > 4) continue;
        const l = was[n - 1], r = was[n + 1];
        if (l < 0 || l > 4 || r < 0 || r > 4 || l === me || r === me) continue;
        const group = [n];
        for (let g = 0; g < group.length && group.length < 3; g++) {
          const q = group[g], qx = q % p.w, qy = (q - qx) / p.w;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const x = qx + dx, y = qy + dy, m = y * p.w + x;
              if (x < 0 || y < 0 || x >= p.w || y >= p.h || was[m] !== me || group.includes(m)) continue;
              group.push(m);
            }
          }
        }
        if (group.length <= 2) plan[n] = l === r ? l : (Math.abs(l - me) <= Math.abs(r - me) ? l : r);
      }
    }
  }
  // A one-column tooth below the castle -- gold with air left, right and below -- is the
  // speck the TAIL's two-column teeth were drawn to avoid; in frame 3 the lift squeezed one
  // out of them anyway (a lone gold pixel between two notches). It goes. The point's own tip
  // (the column of the TAIL's deepest tooth) is the one tooth that is meant to end in a pixel.
  {
    const was = plan.slice();
    for (let py = Y0 + CS + CASTLE.length; py < p.h - 1; py++) {
      for (let px = 1; px < p.w - 1; px++) {
        const n = py * p.w + px;
        if (was[n] < 0 || was[n - 1] >= 0 || was[n + 1] >= 0 || was[n + p.w] >= 0) continue;
        if (Math.abs(at[3 * n] * CW - 7.5) < 1) continue;
        plan[n] = -1;
      }
    }
  }
  for (let n = 0; n < plan.length; n++) {
    const v = plan[n];
    if (v >= 0) p.set(n % p.w, Math.floor(n / p.w), v === CHARGE ? EMBLEM : v === GATE ? DOOR : GOLD[v]);
  }
}

function paintBanner(p, v, f) {
  p.ascii(TOP, PAL, 0, 1);
  // The staff: its lit column in the wood's highlight (see the header), body, shade.
  for (let y = 9; y < 43; y++) { p.set(4, y, WOOD[0]); p.set(5, y, WOOD[2]); p.set(6, y, WOOD[3]); }
  paintCloth(p, f);
  // The rings again, over the cloth's corners: they hold it, so they are in front.
  for (const x of [9, 23]) { p.set(x, 5, GOLD[1]); p.set(x, 6, GOLD[1]); p.set(x, 7, GOLD[2]); p.set(x, 8, GOLD[3]); }
  p.ascii(PLINTH, PAL, 0, 43);
  p.outline(INK);
}

export const ELEMENTS = {
  BANNER: {
    name: 'BANNER', box: [32, 48], anchor: 'stand', frames: 4, variants: 1,
    // Four frames a cycle at the old flag's rate, round(sin(2t)): about 0.8 s a frame, a slow
    // draught rather than a gale.
    fps: (4 * 2) / (2 * Math.PI),
    notes: ['A GOLD CLOTH ON A CROSSBAR, A WOOD STAFF', 'IN A STONE PLINTH, A BLACK CASTLE, A TORN',
      'POINT. 4 FRAMES: THE CLOTH SWINGS AND EASES.'],
    paint(p, v, f) { paintBanner(p, v, f); },
  },
};

/** One banner, anywhere along the ledge clear of its ends. */
export function scene(r, wArt) {
  const W = Math.floor(wArt);
  const [bw] = ELEMENTS.BANNER.box;
  return [{ key: 'BANNER', variant: 0, x: fit(Math.round(8 + r() * Math.max(0, W - bw - 16)), bw, W) }];
}
