// ABYSS: a skull, or one long bone, lying on the ledge -- the abyss has claimed climbers
// before. An occasional shock rather than wallpaper, which is why the chance is the
// lowest of any zone.
//
// What each field means, and the rules for paint() and scene(), are in index.js.

import { Pix, rng } from './util.js';

/** Share of ledges (22+ units wide) that carry anything here. */
export const CHANCE = 0.20;   // an occasional shock, not wallpaper

// The bone is the LEDGE's own bone. This zone's platform is a spine, drawn in a warm white
// that shades through grey into violet (platart.js, ABYSS), so a skull in any other white
// would look like it came from another game. The ramp is the tile's, lit from the upper
// left, with its darkest violet for the outline.
const BONE = {
  o: '#100e1c',   // outline: the tile's own darkest
  H: '#f1e7dd',   // lit
  L: '#d5c9c0',
  M: '#aaa49d',
  S: '#827088',   // shadow turns violet, as the spine's does
  D: '#5f4673',
  K: '#1d1428',   // socket and nose: not the outline, a hollow
};

// The rubble each one lies on, as the board draws it: a low heap of dark blue-grey stones.
// It does the job the stone-coloured `shadow` does in the crypt -- something dark between
// the bone and the ledge, so the bone never rests on the spine's own bone-white -- and it
// does it better here than that shadow could: the shadow is platTop at half strength,
// #664480, which is LIGHTER than this tile's dark top edge, so it would have drawn a pale
// scar into the lip rather than a shadow. Hence no `shadow` field on either element. The
// heap is cooler and bluer than the violet spine, so it does not read as part of the
// ledge, and its lit stone tops are what separate it from a backdrop that is nearly black.
const RUBBLE = {
  o: '#0b0814',   // outline
  d: '#17152a',   // the cracks between stones
  r: '#23213f',   // stone
  q: '#302e55',   // stone, the lit face
  p: '#4a4878',   // the lit top of the heap
};

// A long bone's shaft is two pixels thick, too thin to have a body between its lit top
// and its shadowed underside, so it is toned a step up the ramp: white on top, bone below.
const LIGHTER = { H: BONE.H, L: BONE.H, M: BONE.L, S: BONE.M, D: BONE.S };

/**
 * Tone a shape by its own edges, lit from the upper left: a pixel with nothing above it is
 * lit, one with nothing above or to its left is the highlight, nothing below is shadow and
 * nothing below or to its right the deep shadow. On a shape two or three pixels thick that
 * is the whole of a pixel artist's shading -- a lit top, a body, a shadowed underside --
 * and it follows any silhouette, so the silhouette is the only thing that needs drawing.
 * `inside(x, y)` says what is in the shape; everything in [0, w) x [0, h) is visited.
 */
export function shadeShape(p, inside, ramp) {
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (!inside(x, y)) continue;
      const up = inside(x, y - 1), lf = inside(x - 1, y), dn = inside(x, y + 1), rt = inside(x + 1, y);
      let c = ramp.M;
      if (!up && !lf) c = ramp.H;
      else if (!up) c = ramp.L;
      else if (!dn && !rt) c = ramp.D;
      else if (!dn) c = ramp.S;
      else if (!lf) c = ramp.L;
      else if (!rt) c = ramp.S;
      p.set(x, y, c);
    }
  }
}

/**
 * A low heap of stones, `bottom` its last row, spanning cx - halfW .. cx + halfW and `rise`
 * rows high at its crown. Each pixel belongs to its nearest stone (a jittered grid of them,
 * wider than tall, as stones lie), every stone is lit along its top and cracked along its
 * underside, and the stones on the skyline get the lit top. Seeded: the same heap for the
 * same key, every build -- and built once per key, since every frame of a variant stands
 * on the same heap. Returned as its own Pix, outlined, for the caller to stamp.
 */
const heaps = new Map();
export function rubble(w, h, cx, bottom, halfW, rise, pal, key) {
  const id = [w, h, cx, bottom, halfW, rise, key, ...Object.values(pal)].join('|');
  let q = heaps.get(id);
  if (q) return q;
  const r = rng('RUBBLE', key);
  const top = new Int16Array(w).fill(h);     // each column's first row of heap; h = none
  for (let x = cx - halfW; x <= cx + halfW; x++) {
    const t = (x - cx) / (halfW + 0.5);
    const y = bottom - Math.round(rise * Math.sqrt(Math.max(0, 1 - t * t)) + (r.next() < 0.3 ? 1 : 0)) + 1;
    if (x >= 0 && x < w) top[x] = y;
  }
  const inHeap = (x, y) => x >= 0 && x < w && y >= top[x] && y <= bottom;
  const seeds = [];
  for (let sy = bottom - rise - 1; sy <= bottom + 1; sy += 2) {
    for (let sx = cx - halfW - 2; sx <= cx + halfW + 2; sx += 4) {
      seeds.push([sx + r.int(-1, 1) + ((sy & 2) ? 2 : 0), sy + r.float(-0.4, 0.4), r.next() < 0.5]);
    }
  }
  // Which stone every heap pixel belongs to, worked out once.
  const stone = new Int16Array(w * h).fill(-1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inHeap(x, y)) continue;
      let best = 0, bd = Infinity;
      for (let i = 0; i < seeds.length; i++) {
        const d = (x - seeds[i][0]) ** 2 + 3 * (y - seeds[i][1]) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      stone[y * w + x] = best;
    }
  }
  const at = (x, y) => (inHeap(x, y) ? stone[y * w + x] : -1);
  // The heap as palette keys first, so the clean-up below compares letters, not colours.
  const key2 = new Array(w * h).fill(null);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const st = at(x, y);
      if (st < 0) continue;
      const up = at(x, y - 1), dn = at(x, y + 1);
      let c = seeds[st][2] ? 'r' : 'q';
      if (up < 0) c = x <= seeds[st][0] ? 'p' : 'q';
      else if (up !== st) c = 'q';
      if (dn >= 0 && dn !== st && up >= 0) c = 'd';
      key2[y * w + x] = c;
    }
  }
  // No lone pixels: one that shares its colour with none of its four neighbours is noise
  // at this size, not a stone, so it takes the colour most of its neighbours have.
  const k = (x, y) => (inHeap(x, y) ? key2[y * w + x] : null);
  const fixes = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const me = k(x, y);
      if (!me) continue;
      const around = [k(x + 1, y), k(x - 1, y), k(x, y + 1), k(x, y - 1)].filter(Boolean);
      if (!around.length || around.includes(me)) continue;
      const count = {};
      for (const c of around) count[c] = (count[c] || 0) + 1;
      fixes.push([y * w + x, Object.keys(count).sort((a2, b2) => count[b2] - count[a2])[0]]);
    }
  }
  for (const [i, c] of fixes) key2[i] = c;
  q = new Pix(w, h);
  key2.forEach((c, i) => { if (c) q.set(i % w, Math.floor(i / w), pal[c]); });
  q.outline(pal.o);
  heaps.set(id, q);
  return q;
}

// A skull turned a little to the right, as the board has it, drawn pixel by pixel: the
// dome lit at the upper left and shadowed down the right into the spine's violet, two
// round hollow sockets with a lit bridge of bone between them, a notch of a nose leaning
// the way the face turns, and a row of teeth with the gaps between them showing, which is
// what makes it a skull and not a pale egg with holes in it. The first draft shaded a
// silhouette and cut the sockets into it with the bone between them left in the body's
// grey: at 16x the two sockets and the grey between them were one dark band, a visor.
// o outline, H highlight, L lit, M body, S shadow, D deep shadow, K hollow.
const SKULL = [
  '................',
  '................',
  '.....oooooo.....',
  '....oHHHLLLoo...',
  '...oHHHLLLLMMo..',
  '...oHHLLLLLMMSo.',
  '...oHLLLLLLMMSo.',
  '...oLKKKLLKKMSo.',
  '...oLKKKLLKKSSo.',
  '...oMLKLLLKMSDo.',
  '....oMLLKKLMSDo.',
  '....oSMMKLMSDo..',
  '.....oLKLKLKo...',
  '.....oLKLKLo....',
  '......ooooo.....',
  '................',
];

export const ELEMENTS = {
  SKULL: {
    name: 'SKULL', box: [16, 16], anchor: 'stand', frames: 1, variants: 1,
    notes: ['A CLIMBER WHO DID NOT MAKE IT, ON A LOW', 'HEAP OF DARK RUBBLE. RARE: A SHOCK, NOT',
      'WALLPAPER. THE LEDGE\'S OWN BONE COLOURS.'],
    paint(p) {
      // The heap first, low and wide, so it shows either side of the jaw that sits in it.
      p.stamp(rubble(16, 16, 8, 15, 6, 3, RUBBLE, 'skull'));
      p.ascii(SKULL, BONE);
    },
  },
  BONE: {
    name: 'BONE', box: [32, 12], anchor: 'stand', frames: 1, variants: 2,
    notes: ['A SINGLE LONG BONE, KNUCKLED AT BOTH ENDS,', 'LYING ACROSS A HEAP OF DARK RUBBLE.',
      '2 DIFFERENT LIES OF IT, NOT ONE FLIPPED.'],
    paint(p, v) {
      const b = BONES[v];
      p.stamp(rubble(32, 12, b.heap[0], 11, b.heap[1], b.heap[2], RUBBLE, `bone${v}`));
      const s = new Pix(32, 12);
      shadeShape(s, boneShape(b.from, b.to), LIGHTER);
      s.outline(BONE.o);
      p.stamp(s);
    },
  },
};

// One end of a long bone, the knuckle side on the left: two round knobs one above the
// other with a notch between them, and the shaft leaving from the middle rows. The pair
// of knobs is what says BONE rather than STICK.
const KNUCKLE = [
  '.##.',
  '####',
  '.###',
  '.###',
  '####',
  '.##.',
];

/**
 * A long bone as a mask: a knuckle at each end, their middles at [ax, ay] and [bx, by],
 * and between them a shaft two pixels thick that steps down (or up) evenly along its
 * length, flaring to three for its last two pixels into each knuckle, as a femur does.
 */
function boneShape([ax, ay], [bx, by]) {
  const on = new Set();
  const put = (x, y) => on.add(x + ',' + y);
  KNUCKLE.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === '#') { put(ax - 1 + i - 1, ay - 3 + j); put(bx + 1 - i + 1, by - 3 + j); }
  }));
  for (let x = ax + 2; x <= bx - 2; x++) {
    const y = Math.round(ay - 1 + ((by - ay) * (x - ax)) / (bx - ax));
    put(x, y); put(x, y + 1);
    if (x < ax + 4 || x > bx - 4) put(x, y + (x < ax + 4 ? -1 : 2));
  }
  return (x, y) => on.has(x + ',' + y);
}

// Two bones. The first lies as the board's does, down to the right across the middle of
// its heap. The second is the other way about: its far end propped on a stone heap at the
// right, its near end down on the ledge -- a different drawing, not the same bone flipped.
// heap: [centre x, half width, rise].
const BONES = [
  { from: [3, 5], to: [28, 8], heap: [15, 13, 4] },
  { from: [3, 8], to: [27, 4], heap: [24, 6, 6] },
];

/**
 * DECOR.bones' draws, placed on the art pixel: the same random draws, so a ledge carries
 * its skull or bone where it always did, give or take the rounding to a whole world unit.
 * The draw that chose between them chooses the bone's variant too.
 */
export function scene(r, wArt) {
  const cx = Math.round(12 + r() * Math.max(4, wArt - 32));
  const p = r();
  if (p < 0.5) return [{ key: 'SKULL', variant: 0, x: Math.min(cx, Math.floor(wArt) - 16) }];
  return [{ key: 'BONE', variant: Math.min(1, Math.floor((p - 0.5) * 4)), x: Math.max(0, Math.min(Math.floor(wArt) - 32, cx - 4)) }];
}
