// STORM: a lightning rod crackling at its tip -- the storm hitting the tower.
//
// From the board: a plain iron rod standing upright, flat-topped and thick -- about a
// fifth as wide as it is tall -- and from its top a crown of purple lightning: jagged
// arcs thrown out in every direction, up and out, drooping at the sides and running down
// beside the rod, nearly as wide as the rod is tall. The board stands the rod in a mound
// of dark rubble; the ledges here are cloud (tools/platpaint/storm.mjs), and rubble on
// a cloud is a thing that fell out of the sky. So the rod goes INTO the cloud: its foot is
// wrapped in three small puffs of the ledge's own creams, lit the same way, so it reads as
// planted in the bank it stands on.
//
// THE BOX IS WIDER THAN THE SHEET'S. The sheet gave 24 x 60, for today's rod with a
// four-pixel spark. The board's crown spreads about as far to each side as the rod is
// tall: in 24 pixels it could only be a vertical brush over a stub of a rod, which is not
// the drawing. 40 x 60 holds an arc of seventeen pixels either side over a rod of
// thirty-five.
//
// LIGHTNING, NOT TWIGS. A first version drew each arc as three or four long straight
// segments with a Y fork at the tip, and at zoom 1 the crown read as a bare tree -- an
// antler, a dandelion on a stick. What says LIGHTNING is the zigzag: every arc here is
// short legs of two to four pixels, each turning hard against the last, so the line is
// all corners; forks leave from the middle of an arc at a sharp angle, never from its
// end; and each arc fades to violet over its last leg instead of stopping on a white
// point, which is the knob that made a twig of it.
//
// AGAINST THE SKY. The zone's sky is purple-grey cumulus (about #413052 to #74688e), so
// purple lightning on it has to be carried by value, not hue: a white core, 5:1 on the
// sky's lightest clouds and 12:1 on its darkest, inside two steps of violet glow -- a
// strong one against the core, a faint one outside it -- because the board's arcs are
// light in a haze, not lines. Deep, saturated violet: thin alpha of a pale colour over
// this sky lands on grey.
//
// THE ROD is pale iron, six wide with a dark outline, a highlight a pixel in from its lit
// left side, and a flat top whose face catches the sky; in the flash frame its top and lit
// side take the arc's violet. Six, not four: at four it was a stick, and with the crown on
// top a stick is a flower stalk.
//
// THE FRAMES. A spark, a crackle, then the flash -- the full crown -- at 3.3 frames a
// second, each instance at its own phase. Every frame is its own set of arcs, not the
// flash with pieces taken away, so it flickers rather than grows.
//
// No shadow into the lip: the rod's foot is in the cloud puffs, and the puffs sit on the
// landing line in the ledge's own colours, a tone darker than the line so it still shows.
//
// What each field means, and the rules for paint() and scene(), are in index.js.

import { fit } from './util.js';

/** Share of ledges (22+ units wide) that carry anything here. */
export const CHANCE = 0.22;

const IRON = { top: '#e8e2f6', hi: '#d3cde6', lit: '#a19bb9', mid: '#716b8c', lo: '#4a4462', flash: '#e8dcff' };
const INK = '#1a1326';
// The ledge's creams (tools/platpaint/storm.mjs, CLOUD), all but its top: the landing
// line's #fcf9ef stays the palest thing on the ledge.
const CLOUD = ['#f1e7dd', '#e2dad4', '#d5c9c0', '#cdc1b5'];
// core: the flash's white; dim: the lesser frames' core; fade: an arc's last leg;
// glow: the strong halo against the core; haze: the faint one outside it.
const BOLT = { core: '#ffffff', dim: '#f3e8ff', fade: '#c99cff', glow: '#b061ff', haze: '#7d2fe0' };

const W = 40, H = 60;
const RX = 17;                  // the rod's left column; it is six wide
const TIP = 25;                 // the top face's row
const O = [19, 24];             // the tip: arcs are drawn from here, x right, y DOWN

// The arcs, as polylines from the tip, in art px (y up is negative), every leg two to four
// pixels and turning hard against the one before. The last leg of each is drawn in `fade`.
// Frame 0 a spark, 1 a crackle, 2 the flash. A fork starts on a vertex in the MIDDLE of
// its parent and goes off at a sharp angle; its core is `dim` even in the flash.
const ARCS = [
  // The spark: three short arcs, all to one side of straight down. With a flicker down
  // the left as well, two of them lined up across the tip and the spark was an X.
  [
    [[0, 0], [-2, -2], [-1, -4], [-4, -6], [-3, -8]],
    [[1, 0], [2, -3], [4, -4], [4, -7], [6, -9]],
    [[1, 0], [4, 0], [5, -2], [7, -1], [8, 2]],
  ],
  // The crackle: five, none where the spark's were.
  [
    [[0, 0], [1, -3], [-1, -5], [0, -8], [-2, -10], [-1, -13]],
    [[0, 0], [-3, -1], [-4, -4], [-7, -5], [-8, -8], [-11, -9], [-12, -12]],
    [[1, 0], [4, -2], [6, -1], [8, -4], [11, -3], [13, -5]],
    [[0, 0], [-3, 1], [-5, 0], [-7, 3], [-10, 3], [-11, 6]],
    [[4, 2], [6, 4], [6, 7], [9, 9]],
    { fork: [[8, -4], [8, -7]] },
  ],
  // The flash, after the board: seven arcs at wide angles -- up, up-left, up-right, out
  // to each side drooping at the ends, and down beside the rod on both sides.
  [
    [[0, 0], [-2, -3], [0, -5], [-1, -8], [2, -11], [1, -14], [3, -16], [2, -20]],
    [[0, 0], [-3, -2], [-4, -5], [-7, -6], [-8, -10], [-11, -11], [-12, -15], [-14, -17]],
    [[1, 0], [4, -2], [5, -5], [8, -6], [9, -9], [12, -11], [13, -14], [15, -16]],
    [[0, 0], [-3, 0], [-5, -2], [-8, -1], [-10, -3], [-13, -1], [-15, 1], [-16, 4]],
    [[1, 0], [4, -1], [6, 1], [9, -1], [11, 1], [14, 0], [16, 3], [17, 6]],
    [[-3, 2], [-5, 4], [-6, 7], [-9, 9], [-10, 12], [-12, 14]],
    [[4, 2], [6, 5], [7, 8], [10, 10], [11, 13], [13, 15]],
    { fork: [[-1, -8], [2, -9], [3, -11]] },
    { fork: [[-8, -10], [-11, -9]] },
  ],
];

// The cloud round the foot: [cx, cy, r], back to front, the middle one biggest and the
// two behind it overlapping it, so the three are one clump.
const PUFFS = [[13, 57, 4.2], [26.5, 57.5, 3.8], [19.5, 55.5, 5.2]];

/** Bresenham, calling back each pixel: the arcs need their pixels, not just paint. */
function linePts(x0, y0, x1, y1, cb) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    cb(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function paintRod(p, v, f) {
  const flash = f === 2;
  // The rod: six columns, lit side to shade, the highlight a pixel in from the lit edge so
  // the edge itself reads as the cylinder turning away.
  const cols = [IRON.lit, IRON.hi, IRON.lit, IRON.mid, IRON.mid, IRON.lo];
  for (let y = TIP + 1; y < H; y++) cols.forEach((c, i) => p.set(RX + i, y, c));
  // The flat top, its face catching the sky, and a collar just under it.
  p.hline(RX + 1, RX + 4, TIP, IRON.top);
  p.set(RX, TIP + 1, IRON.hi); p.hline(RX + 1, RX + 3, TIP + 1, IRON.top); p.set(RX + 4, TIP + 1, IRON.lit);
  p.set(RX + 5, TIP + 1, IRON.mid);
  for (let i = 0; i < 6; i++) p.set(RX + i, TIP + 3, i < 2 ? IRON.mid : IRON.lo);
  if (flash) {
    // The arc's light on the top and down the lit side.
    p.hline(RX + 1, RX + 4, TIP, IRON.flash); p.hline(RX + 1, RX + 3, TIP + 1, IRON.flash);
    for (let y = TIP + 1; y < TIP + 9; y++) p.set(RX + 1, y, IRON.flash);
  }
  p.outline(INK);

  // The arcs' pixels: core, then the last leg of each as fade.
  const core = new Map();           // y * W + x -> colour
  const put = (x, y, c) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const k = y * W + x, was = core.get(k);
    // White wins over dim wins over fade, wherever two arcs cross.
    if (!was || was === BOLT.fade || (was === BOLT.dim && c === BOLT.core)) core.set(k, c);
  };
  for (const a of ARCS[f]) {
    const fork = !Array.isArray(a);
    const pts = fork ? a.fork : a;
    const body = fork || !flash ? BOLT.dim : BOLT.core;
    for (let i = 1; i < pts.length; i++) {
      const last = i === pts.length - 1;
      let first = true;
      linePts(O[0] + pts[i - 1][0], O[1] + pts[i - 1][1], O[0] + pts[i][0], O[1] + pts[i][1], (x, y) => {
        // A leg's first pixel is its parent's corner: keep it the body's colour.
        put(x, y, last && !first ? BOLT.fade : body);
        first = false;
      });
    }
  }
  // The discharge itself, a hot point on the tip; a bigger one in the flash.
  put(O[0], O[1], BOLT.core); put(O[0] + 1, O[1], BOLT.core);
  if (flash) { put(O[0], O[1] - 1, BOLT.core); put(O[0] + 1, O[1] - 1, BOLT.core); }

  // Two rings of glow round the core, only over empty air: the rod stays iron.
  const n4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const inner = new Set();
  for (const k of core.keys()) {
    const x = k % W, y = (k - x) / W;
    for (const [dx, dy] of n4) {
      const nx = x + dx, ny = y + dy, nk = ny * W + nx;
      if (p.inside(nx, ny) && !core.has(nk) && p.alpha(nx, ny) === 0) inner.add(nk);
    }
  }
  for (const k of inner) {
    const x = k % W, y = (k - x) / W;
    for (const [dx, dy] of n4) {
      const nx = x + dx, ny = y + dy, nk = ny * W + nx;
      if (p.inside(nx, ny) && !core.has(nk) && !inner.has(nk) && p.alpha(nx, ny) === 0) {
        p.set(nx, ny, BOLT.haze, flash ? 0.3 : 0.22);
      }
    }
  }
  for (const k of inner) p.set(k % W, Math.floor(k / W), BOLT.glow, flash ? 0.7 : 0.6);
  for (const [k, c] of core) p.set(k % W, Math.floor(k / W), c);

  // The cloud the rod stands in, over its foot: each pixel takes the NEAREST puff over it,
  // lit from the upper left like the ledge's own, and a pixel of a puff behind that lies
  // just outside a nearer one's upper edge is two tones darker -- the crease that makes the
  // three one clump. Drawn apart, as three discs just touching, they were three balls.
  for (let y = 46; y < H; y++) {
    for (let x = 4; x < W - 4; x++) {
      const px = x + 0.5, py = y + 0.5;
      let front = -1;
      PUFFS.forEach(([cx, cy, r], i) => { if (Math.hypot(px - cx, py - cy) <= r) front = i; });
      if (front < 0) continue;
      const [cx, cy, r] = PUFFS[front];
      const l = -((px - cx) * 0.5 + (py - cy) * 0.86) / r;
      let t = l > 0.45 ? 0 : l > 0.05 ? 1 : l > -0.35 ? 2 : 3;
      for (let j = front + 1; j < PUFFS.length; j++) {
        const [qx, qy, qr] = PUFFS[j];
        const d = Math.hypot(px - qx, py - qy);
        if (d > qr && d <= qr + 1.2 && py - qy < -qr * 0.2) { t = Math.min(3, t + 2); break; }
      }
      p.set(x, y, CLOUD[t]);
    }
  }
}

export const ELEMENTS = {
  LIGHTNING_ROD: {
    name: 'LIGHTNING ROD', box: [W, H], anchor: 'stand', frames: 3, variants: 1,
    // Today's rod sparks on a sin(7t) cycle, 0.9 s: three frames a cycle.
    fps: (3 * 7) / (2 * Math.PI),
    notes: ['AN IRON ROD PLANTED IN THE CLOUD. 3 FRAMES:', 'SPARK, CRACKLE, FLASH - A CROWN OF PURPLE',
      'ARCS FROM THE TIP, NEARLY AS WIDE AS IT IS TALL.'],
    paint(p, v, f) { paintRod(p, v, f); },
  },
};

/** One rod, anywhere along the ledge clear of its ends. */
export function scene(r, wArt) {
  const w = Math.floor(wArt);
  return [{ key: 'LIGHTNING_ROD', variant: 0, x: fit(Math.round(8 + r() * Math.max(0, w - W - 16)), W, w) }];
}
