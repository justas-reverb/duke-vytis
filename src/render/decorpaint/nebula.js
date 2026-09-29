// NEBULA: one or two glowing crystal clusters growing up from the ledge, of different
// heights -- nebula gas made solid.
//
// The board draws a cluster, not a stick: a six-sided prism with a faceted point, cyan
// where the light catches its upper left and deepening through blue-violet to magenta at
// its foot, with smaller shards splaying OUT from its foot at a good angle -- the left one
// violet, the right one magenta -- and dark rubble round the base. Three variants are three
// different clusters: a short one, a medium one, and the board's tall one.
//
// THE BOX is 24 wide, not the sheet's first 16. What makes it a cluster rather than one
// spike is the side shards leaning well out from the main one's foot, and in 16 pixels the
// main prism left them three pixels of lean: they stood upright beside it, and in a real
// frame the tall crystal with a small shard low on each side was a ROCKET with two fins.
// With 24 they splay at twenty degrees and more, as the board's do.
//
// What each field means, and the rules for paint() and scene(), are in index.js.

import { Pix } from './util.js';
import { rubble } from './abyss.js';

/** Share of ledges (22+ units wide) that carry anything here. */
export const CHANCE = 0.34;

const W = 24, H = 48;

// Three faces of a prism seen from the side, each a ramp from its tip (0) to its foot (3):
// the lit face at the left, the face toward us, the shadowed face at the right. The hue
// turns as it goes -- cyan at the top of the lit face, violet through the body, magenta at
// the foot -- which is the board's whole palette in one crystal. The cyan is kept to the
// lit face's upper half and the front face is violet from the top: the first drafts had
// a blue front face and a cyan lit face most of the way down, and the cluster read as
// blue ice, where the board's is violet with cyan catching the light.
const VIOLET = [
  ['#a6f4ff', '#5cbcff', '#7272ec', '#9656de'],
  ['#7262e8', '#7c48d6', '#9a3ac8', '#c23ec8'],
  ['#40289a', '#582698', '#7626a4', '#9c2eb2'],
];
const VIOLET_EDGE = '#e2fbff'; // the lit edges between faces
// A shard leaning out to the right catches the nebula's magenta rather than the cyan, as
// the board's right-hand shard does: the same three faces a step round the colour wheel.
const PINK = [
  ['#ffb8f6', '#ec82f2', '#c45ce4', '#a446d4'],
  ['#d06cee', '#a84ede', '#8c3ac8', '#b038c6'],
  ['#74289e', '#842aa4', '#9c2cae', '#be3ac8'],
];
const PINK_EDGE = '#ffe6fb';
const OUT = '#12071f';       // outline: darker than the darkest of the nebula sky
const SPARK = '#ffffff';
const STAGGER = [-4, 0, 3];   // rows each face's ramp is shifted by: lit, front, dark

// The rubble at the foot, dark and a little violet, so it belongs to the nebula's purple
// rather than to the abyss's blue it shares a drawing with. It is also what the cluster
// stands on in place of a `shadow` cast into the lip: that shadow is platTop at half
// strength, #446680, within a shade of this tile's own top row, so it would not show.
const RUBBLE = {
  o: '#0d0518',
  d: '#1a0f2c',
  r: '#271a40',
  q: '#382656',
  p: '#56407a',
};

/**
 * One shard as its own Pix, outlined: `cx` its middle at the foot, `bottom` the foot's row,
 * `hw` its half width (it is 2hw + 1 wide), `h` its height, `tip` the rows its point takes,
 * `lean` how many pixels the tip stands off to the side of the foot, `pink` for the
 * magenta faces.
 *
 * The body is three vertical faces: lit to the left of a ridge a third of the way in, the
 * front face from there to a second edge past the middle, the dark face beyond it. The
 * point is a pyramid of the same three facets, their edges running from the two ridges at
 * the shoulder up to the apex -- the faceted point of the board's crystal. It is short,
 * about one and a half times the half width: a long, gently curving point read as a
 * bullet's nose, and with the fins below it, a rocket's.
 */
function shard(w, hh, { cx, bottom, hw, h, tip, lean, pink }, glow) {
  const q = new Pix(w, hh);
  const FACE = pink ? PINK : VIOLET, EDGE = pink ? PINK_EDGE : VIOLET_EDGE;
  const top = bottom - h + 1;
  for (let y = top; y <= bottom; y++) {
    const axis = cx + (lean * (bottom - y)) / (h - 1);   // the middle on this row
    const fromTop = y - top;
    const inTip = fromTop < tip;
    const k = inTip ? (fromTop + 1) / (tip + 1) : 1;      // how far the point has opened
    const l = Math.round(axis - hw * k), r = Math.round(axis + hw * k);
    const ridgeL = Math.round(axis - (hw / 3) * k), ridgeR = Math.round(axis + (hw / 2) * k);
    const band = inTip ? 0 : (face) => Math.max(0, Math.min(3, Math.floor((4 * (fromTop + STAGGER[face])) / h)));
    for (let x = l; x <= r; x++) {
      const face = x < ridgeL ? 0 : x > ridgeR ? 2 : 1;
      let c;
      if (inTip) {
        // The point: the lit facet, the front facet catching the light a step less, the
        // dark facet; the two edges between them light lines up to the apex.
        c = x === ridgeL || (x === ridgeR && fromTop < tip - 1) ? EDGE : face === 0 ? FACE[0][0] : face === 1 ? FACE[0][1] : FACE[1][0];
      } else {
        const b = band(face);
        // Each face steps down its ramp a few rows apart from the next -- the lit face
        // later, the dark face sooner -- so the steps run diagonally across the prism
        // rather than as stripes straight across it. The second frame lifts one step of
        // the front face: the shimmer.
        c = FACE[face][Math.max(0, b - (glow && face === 1 && b === glow.band ? 1 : 0))];
        // The lit ridge runs down from the point, fading into the body in the lower half.
        if (x === ridgeL) c = b < 2 ? EDGE : FACE[0][Math.max(0, b - 1)];
        // The shoulder where the point meets the prism catches the light across the front.
        else if (fromTop === tip && face === 1) c = FACE[0][1];
      }
      q.set(x, y, c);
    }
  }
  q.outline(OUT);
  return q;
}

/** A four-point glint: a white heart with a pale cross, the shimmer's catch of light. */
function glint(p, x, y) {
  p.set(x, y, SPARK);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.set(x + dx, y + dy, VIOLET[0][0]);
}

// Each cluster as its shards, main shard first, and where its two glints fall: one per
// frame, on the main shard's lit face, so the light seems to move across the crystal.
// `band` is the step of the front face that brightens in the second frame. The side
// shards splay out from the main one's foot and are drawn in front of it, as the board's
// are: behind it they were slivers.
const CLUSTERS = [
  {   // short: a squat prism, a magenta shard splayed out at its right, a stub at its left
    shards: [
      { cx: 11, bottom: 46, hw: 3, h: 18, tip: 5, lean: -1 },
      { cx: 15, bottom: 46, hw: 2, h: 13, tip: 4, lean: 6, pink: true },
      { cx: 8, bottom: 46, hw: 1, h: 7, tip: 3, lean: -3 },
    ],
    glints: [[9, 40], [12, 34]], band: 2,
  },
  {   // medium: the main prism, a violet shard splayed out at the left, magenta at the right
    shards: [
      { cx: 12, bottom: 46, hw: 3, h: 25, tip: 5, lean: 0 },
      { cx: 8, bottom: 46, hw: 2, h: 16, tip: 4, lean: -6 },
      { cx: 16, bottom: 46, hw: 2, h: 11, tip: 4, lean: 5, pink: true },
    ],
    glints: [[10, 36], [13, 28]], band: 1,
  },
  {   // tall: the board's -- a long prism with a shard splayed out at each side, and a
      // small one at its foot in front
    shards: [
      { cx: 12, bottom: 46, hw: 4, h: 33, tip: 6, lean: 0 },
      { cx: 8, bottom: 46, hw: 2, h: 20, tip: 4, lean: -6 },
      { cx: 16, bottom: 46, hw: 2, h: 16, tip: 4, lean: 6, pink: true },
      { cx: 13, bottom: 46, hw: 1, h: 7, tip: 3, lean: 2 },
    ],
    glints: [[9, 31], [13, 22]], band: 1,
  },
];

export const ELEMENTS = {
  CRYSTAL_SHARD: {
    name: 'CRYSTAL SHARD', box: [W, H], anchor: 'stand', frames: 2, variants: 3,
    fps: (2 * 2.5) / (2 * Math.PI),
    notes: ['A CLUSTER OF FACETED CRYSTALS ON RUBBLE:', 'CYAN AT THE LIT TIP, VIOLET BODY, MAGENTA',
      'FOOT; SIDE SHARDS SPLAY OUT. 2 FRAMES OF GLINT.'],
    paint(p, v, f) {
      const c = CLUSTERS[v];
      c.shards.forEach((s, i) => p.stamp(shard(W, H, s, i === 0 && f === 1 ? { band: c.band } : null)));
      glint(p, ...c.glints[f]);
      p.stamp(rubble(W, H, 12, 47, 10, 3, RUBBLE, `shard${v}`));
    },
  },
};

/**
 * DECOR.shards' draws, placed on the art pixel: the same random draws, the same places
 * give or take the rounding to a whole world unit. Except that a second cluster the draws
 * put on top of the first -- the old one-unit sticks could share a spot, two clusters
 * twenty-four pixels wide cannot -- is moved to stand beside it, or left out if there is
 * no room on either side.
 */
export function scene(r, wArt) {
  const out = [];
  const right = Math.floor(wArt) - W;
  const n = 1 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const cx = Math.round(12 + r() * Math.max(4, wArt - 24));
    const variant = Math.floor(r() * 3);
    let x = Math.max(0, Math.min(right, cx - 8));
    const prev = out[0];
    if (prev && Math.abs(x - prev.x) < W) {
      x = x >= prev.x && prev.x + W <= right ? prev.x + W : prev.x - W >= 0 ? prev.x - W : prev.x + W <= right ? prev.x + W : -1;
      if (x < 0) continue;
    }
    out.push({ key: 'CRYSTAL_SHARD', variant, x });
  }
  return out;
}
