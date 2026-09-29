// COSMOS: letters of glowing orbs -- each pixel of the font a small moon, lit, in a halo.
//
// The font's 5 x 7 grid, one orb to a lit pixel: a dot-matrix sign strung across deep
// space, which is the shape of the letters every player already reads. Each orb is the
// zone's own (decorpaint/cosmos.js): a sphere lit from the upper left, white where the light
// hits it, pale blue across its body, a deep blue rim turned away, and round it the decor's
// halo blue, in stepped rings. Lights take no dark outline -- the glow is what separates a
// light, an outline puts it out (the pixel-art-in-code rule) -- so nothing here is outlined;
// the rings do that work. One orb in each letter, picked by a fixed hash, is a little
// larger and amber, a planet among moons.
//
// AGAINST COSMOS. Deep navy space with stars (#001133 to #002244, luminance ~0.01): a bright
// orb is the brightest thing there is, and the halo is the saturated deep blue of the decor,
// not a thin pale one -- pale light at low alpha over blue goes grey.
//
// THE ENTRANCE: each letter's orbs light up -- dark, glowing, then lit -- one letter after
// another.

import { layoutWord, cellMap, Pix, rgba, hash2, overdue, drain } from './util.js';

// Dark to light: the rim turned away, the decor's RIM, RING, BODY_SHADE, BODY, BODY_LIT.
const ORB = ['#1b2a78', '#4f6ff0', '#8fb2ff', '#c8dcff', '#f4f8ff', '#ffffff'];
// The warm planet: amber to cream.
const WARM = ['#6a2f1c', '#c0662a', '#f0a050', '#ffd08a', '#fff0d0', '#ffffff'];
const HALO = [['#3d63ff', 0.55], ['#3d63ff', 0.3], ['#2a48d8', 0.14]];

export const METRICS = { K: 11, R: 5.5, gap: 12, pad: [18, 18, 18, 18], reach: 4 };

const LX = -0.5, LY = -0.62, LZ = 0.6;

function* orbs(plan, dim = 0) {
  const p = new Pix(plan.w, plan.h);
  const { list } = cellMap(plan);
  const K = plan.K;
  // One warm orb per letter, the same one every time the title is painted.
  const warm = new Set();
  plan.letters.forEach((L, li) => {
    const mine = list.map((q, i) => [q, i]).filter(([q]) => q.li === li);
    const pick = mine[Math.floor(hash2(li, 5, 81) * mine.length)];
    if (pick) warm.add(pick[1]);
  });
  for (let i = 0; i < list.length; i++) {
    if (overdue()) yield;
    const q = list[i];
    const big = warm.has(i);
    const r = big ? 5.2 : 4.6;
    const cx = q.x0 + (K - 1) / 2 + 0.5, cy = q.y0 + (K - 1) / 2 + 0.5;
    const ramp = big ? WARM : ORB;
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const nx = (x + 0.5 - cx) / r, ny = (y + 0.5 - cy) / r, q2 = nx * nx + ny * ny;
        if (q2 > 1) continue;
        const nz = Math.sqrt(1 - q2);
        const l = nx * LX + ny * LY + nz * LZ;
        let t = l > 0.9 ? 5 : l > 0.72 ? 4 : l > 0.45 ? 3 : l > 0.12 ? 2 : l > -0.25 ? 1 : 0;
        t = Math.max(0, t - dim);
        p.set(x, y, ramp[t]);
      }
    }
  }
  return p;
}

/** The halo, ring by ring, on empty pixels, by distance to the nearest orb pixel. */
function* glow(p, strength = 1) {
  const { w, h, data } = p;
  const src = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) src[i] = data[i * 4 + 3] ? 1 : 0;
  const cols = HALO.map(([c, a]) => [rgba(c), a * strength]);
  for (let y = 0; y < h; y++) {
    if (overdue()) yield;
    for (let x = 0; x < w; x++) {
      if ((x & 63) === 63 && overdue()) yield;
      if (src[y * w + x]) continue;
      let best = 99;
      for (let dy = -3; dy <= 3; dy++) {
        const Y = y + dy;
        if (Y < 0 || Y >= h) continue;
        for (let dx = -3; dx <= 3; dx++) {
          const X = x + dx;
          if (X >= 0 && X < w && src[Y * w + X]) best = Math.min(best, dx * dx + dy * dy);
        }
      }
      if (best > 9) continue;
      // Dithered by parity, so the rings interleave on a checker instead of ruling circles.
      const d = Math.sqrt(best) + (((x + y) & 1) ? 0.5 : -0.5);
      const k = d < 1.5 ? 0 : d < 2.5 ? 1 : 2;
      const [c, a] = cols[k];
      p.set(x, y, [c[0], c[1], c[2], 255], a);
    }
  }
  return p;
}

// `plan` may be handed in already laid out (util.js layoutSteps; see basement.js).
export function paint(word, theme, plan = layoutWord(word, METRICS)) {
  return {
    plan,
    frames: [
      // A generator, so the scoreboard can cut the glow's search into slices (it was 8 ms
      // of one step); the zone titles run it to its end in one step, with nothing to yield.
      function* orbit() { return yield* glow(yield* orbs(plan)); },
      // The entrance frames are generators too, and every step inside them sliced: they were
      // drained in one piece, and zonetitles.js paints them under a budget now.
      function* () { return yield* orbs(plan, 4); },
      function* () { return yield* glow(yield* orbs(plan, 2), 0.6); },
    ],
    seq: [[1, 0.05], [2, 0.05]],
    stagger: 0.05,
  };
}
