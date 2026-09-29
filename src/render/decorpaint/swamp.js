// SWAMP: reeds along the ledge, and now and then a cattail -- the bog pushing up through
// the planks.
//
// Redrawn at one art pixel per screen pixel from the artist's sheet: a REED CLUMP is a fan
// of olive blades out of a knot of mud, a CATTAIL one stalk with a brown head. Both have to
// stand in front of the backdrop repainted in fef540f -- a teal-black bog (luma 28) hung
// with lit green moss that tops out at luma 82 -- and in front of the ledge's own mossy top
// (80-106), which is olive. So the reeds are told apart from all of it three ways at once:
//
//   - HUE. The moss is green (#325a2a, 110 degrees; its lit ridges #3c652e, 105); the blades
//     are the board's khaki olive, yellower by some thirty-five degrees (#75833a is 72), and
//     their lit edges go toward pale straw rather than to a lighter green. A reed the moss's
//     colour would be moss.
//   - VALUE. A front blade's body is luma 118 (4.0:1 against the bog) and its lit edge 152
//     (6.2:1), over a backdrop whose brightest pixel is 82 -- where the old one-unit reeds
//     were 122 flat. The back blades are a step down, body 100, still above any moss.
//   - OUTLINE. A near-black one-pixel outline, darker than the bog, round the whole clump --
//     the same dark 1-px outline the Duke and the companions have.
//
// Inside a clump, where one blade crosses another, the line between them is a dark olive
// rather than that near-black. Drawn first with a black outline round every blade, a clump
// was two parts outline to one part blade and read as a hand of dark fingers; the softer
// inner line keeps the blades apart and lets them be the colour of the thing.
//
// Lit from the upper left like everything else on screen: a blade's left edge is its lit
// tone (its top edge, once it arches flatter than 50 degrees), the rest of its width the
// body and, on the sturdiest, a shadow edge; its lowest fifth is a step darker, in the
// clump's own shade; and the blades at the back of a clump a step darker than those in
// front.
//
// Nothing here touches the landing line. A clump stands on the walking surface: its lowest
// row is the one just above the ledge's lit top row, and what sits there is a knot of dark
// mud, never anything brighter than the moss on the ledge's own top.
//
// The two frames of the REED CLUMP are its sway, and the WHOLE clump sways: every blade
// turns about its root, a few degrees at the foot and more toward the tip, one frame to the
// left of upright and the other to the right, so the middle of a tall blade moves a pixel or
// two between frames and its tip three or four. (Drawn first, only the tips bent, a pixel or
// two on t-squared of the length: the clump stood still while its tips twitched.) The mud
// and the roots do not move. Played at 1.25 frames a second it rocks in the wind, and
// neighbouring clumps start at different phases.
//
// What each field means, and the rules for paint() and scene(), are in index.js.

import { Pix, fit } from './util.js';

/** Share of ledges (22+ units wide) that carry anything here. */
export const CHANCE = 0.55;

// The outline round a whole plant: darker than the darkest bog (#020a06 is the gap between
// moss tongues, #0f231d the bog itself), so a blade in front of either still has an edge.
const OUT = '#0a0e05';
// The line between two blades where one crosses another.
const INNER = '#252d0e';

// Olive ramps, darkest to lightest, shifting from green-olive in the shadow to straw at the
// tip -- hue-shifted rather than one colour greyed. The back blades are a step down.
const FRONT = { dark: '#4b5722', body: '#75833a', lit: '#97a650', hi: '#b2b66a' };
const BACK = { dark: '#3d471d', body: '#62702f', lit: '#7d8c42', hi: '#959c5a' };
// The mud the clump grows from, and the odd pebble in it.
const MUD = { dark: '#1a150a', body: '#2c2513', lit: '#453a20', stone: '#5e5440', glint: '#857a62' };
// The cattail's head: velvet brown, warm, lit down its left side.
const HEAD = { L: '#d09a62', H: '#a87040', M: '#85522c', D: '#5a341c', S: '#d9c9a0', s: '#a8966c' };

/**
 * Put a part drawn in its own Pix `q` onto `p`, with a line of `INNER` wherever its edge
 * falls on something already drawn -- the crease between it and what it is in front of.
 * Its edge against empty space is left for the outline round the whole plant.
 */
function layer(p, q) {
  const { w, h } = q, qd = q.data, pd = p.data;
  const ink = (x, y) => x >= 0 && y >= 0 && x < w && y < h && qd[(y * w + x) * 4 + 3] >= 128;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (qd[i + 3] || pd[i + 3] < 128) continue;
      if (ink(x + 1, y) || ink(x - 1, y) || ink(x, y + 1) || ink(x, y - 1)) p.set(x, y, INNER);
    }
  }
  p.stamp(q);
}

/**
 * One blade into its own Pix, laid over the blades already drawn (see layer).
 *
 * A blade is an ARC, not a column: it leaves its root at `a0` degrees from the vertical
 * (negative leans left) and turns steadily to `a1` by its tip, `L` px along its length --
 * walked in quarter-pixel steps from the root, keeping each pixel it enters. So the outer
 * blades lean out from the mud at once and go on bending until they arch over, the board's
 * fountain, and a blade that turns past the horizontal simply keeps going. (Drawn first as
 * rows walked from the root up, leaning by t-squared, every blade was a near-vertical stem
 * for its lower half that kinked outward only near the top: a clump of them read as a
 * bundle of sticks, and the outer blades as crooked fingers.) Where the walk turns a corner
 * that one diagonal step would have made, the elbow pixel is dropped, so the one-pixel tips
 * are clean pixel lines without the doubled steps that make a line look chewed.
 *
 * And a blade is a LEAF, not a ribbon. The second drawing made every blade two pixels wide
 * for three quarters of its length and one above it -- the same strap at seven angles --
 * and the board answered with blades of different widths. Now each has its own width `W`,
 * 2 px or 3 for the sturdiest at the front, and a leaf's outline: a little narrower at the
 * root, full width from `pk` of its length to TAPER, then narrowing to a one-pixel point.
 * (Narrowing all the way from `pk` left the top third of every 2-px blade a one-pixel line
 * in its outline, and the clump read as a bundle of sticks again.) Across it, from the
 * light: the walked pixel is the lit edge (the left edge while the blade is steeper than 50
 * degrees, the top edge once it lies flatter), then the body, and on a 3-px blade a shadow
 * edge on the far side. The far pixels are laid first and the lit edge last, so where the
 * walk steps sideways the lighter tone wins and the shadow survives only along the true far
 * edge. Along it: the lowest part is a step darker, in the clump's own shade, so the roots
 * sink into the mud and the knot does not glow on the landing line; and the lit edge of a
 * sturdy front blade pales toward straw through the middle of its length, where the board's
 * blades catch the light, rather than at the tip, where a pale pixel on a one-pixel point
 * read as a match head.
 *
 * `bend` above 1 saves the turn for the top of the blade (the angle goes as t to that
 * power): straight up out of the mud, then curving over -- the spear, and the fountain's
 * outer blades drooping at their tips.
 *
 * `snap` breaks a blade: from `snap[0]` px along it, it runs at `snap[1]` degrees instead,
 * hanging -- a dead reed, a step duller than the living ones, and two pixels wide down to
 * its broken end (at one pixel, the tapered width of a blade's top, it was a thin stick).
 */
const TAPER = 0.7;
// The box's bottom rows, just above the ledge's lit top row, where a blade takes only its
// darkest tone. The low tuft's outer blades leave the mud beyond its crown, and their lit
// edges put pixels of luma 152 three rows above the landing line, where the brightest thing
// in the mud is 85.
const FOOT = 4;
function blade(p, { x, L, a0, a1, bend = 1, W = 2, pk = 0.3, back = false, snap = null }) {
  const q = new Pix(p.w, p.h);
  const c = back ? BACK : FRONT;
  const ramp = [c.dark, c.body, c.lit, c.hi];
  const rad = Math.PI / 180, ds = 0.25;
  const path = [];
  let fx = x, fy = p.h - 2;
  for (let s = 0; s <= L; s += ds) {
    const t = s / L;
    const dead = !!snap && s >= snap[0];
    const ang = (dead ? snap[1] : a0 + (a1 - a0) * Math.pow(t, bend)) * rad;
    const px = Math.round(fx), py = Math.round(fy);
    const last = path[path.length - 1];
    if (!last || last.x !== px || last.y !== py) {
      path.push({ x: px, y: py, t, ang, dead });
      const n = path.length;
      if (n >= 3 && Math.abs(path[n - 3].x - px) === 1 && Math.abs(path[n - 3].y - py) === 1) path.splice(n - 2, 1);
    }
    fx += Math.sin(ang) * ds;
    fy -= Math.cos(ang) * ds;
  }
  const across = (pt) => {
    const { t } = pt;
    if (pt.dead) return t > 0.94 ? 1 : Math.min(W, 2);
    const swell = t < pk ? 0.7 + 0.3 * (t / pk) : t < TAPER ? 1 : 1 - (t - TAPER) / (1 - TAPER);
    return Math.max(1, Math.min(W, Math.round(W * swell + 0.15)));
  };
  const tone = (pt, k, n) => {
    let i = k === 0 ? 2 : k === n - 1 && n >= 3 ? 0 : 1;
    if (k === 0 && W >= 3 && !back && pt.t > 0.4 && pt.t < 0.8) i = 3;
    if (pt.t < 0.18 || pt.dead) i = Math.max(0, i - 1);
    return ramp[i];
  };
  for (let k = W - 1; k >= 0; k--) {
    for (const pt of path) {
      const n = across(pt);
      if (k >= n) continue;
      const steep = Math.abs(Math.cos(pt.ang)) > 0.64;
      const y = pt.y + (steep ? 0 : k);
      q.set(pt.x + (steep ? k : 0), y, y >= p.h - FOOT ? c.dark : tone(pt, k, n));
    }
  }
  layer(p, q);
}

/**
 * The knot of mud the blades come out of, laid over their roots so they vanish into it
 * rather than ending in a line: ASCII rows, bottom row on the box's bottom row, centred on
 * `cx`. The board's mud is a heap of small dark clods, each lit on its upper left, with
 * dark cracks between them; its top edge is lumpy, and its brightest pebble is still darker
 * than the moss on the ledge's top, so the one row that stands on the landing line is the
 * darkest of the clump and the knot reads as the reeds' contact shadow.
 */
function mud(p, cx, rows) {
  const q = new Pix(p.w, p.h);
  const w = rows[0].length;
  q.ascii(rows, MUD_PAL, cx - (w >> 1), p.h - rows.length);
  layer(p, q);
}
// k m u s: the crack, the clod, its lit upper left, a pebble.
const MUD_PAL = { k: MUD.dark, m: MUD.body, u: MUD.lit, s: MUD.stone };

// The three clumps, as blades back to front, and the mud they stand in. Each is a
// genuinely different stand, not a recolour -- the board's three: a full fountain; a
// windswept clump with a snapped reed; a low tuft with one tall spear. Every blade stays
// inside x 1..30 and y 1.. in both frames of the sway, so its outline is never cut off at
// the box's edge. (Each blade's walk was replayed in both frames to check its reach before
// it was drawn; guessing by eye ran the outer blades into the edge columns at almost every
// first try.)
//
// The box is 32 wide, where it was 24. The board draws its clumps about as wide as they are
// tall, and a fountain IS its splay: in 24 px a blade leaning 30 degrees on average can be
// at most 18 px long before it leaves the box, so the only fountain that fitted was a tall
// narrow vase of near-upright blades -- the spray of sticks again at 1x.
//
// The fountain and the tuft were laid out the way the board is read -- where each blade
// leaves the mud, where its tip ends, how far it turns on the way -- and the walk below
// solved for the a0, a1 and L that land it there. Guessing angles and lengths had drifted
// into shapes the board does not have: a spine up the middle with matched pairs of blades
// either side of it, and a spear standing straight up.
const CLUMPS = [
  {
    // A: the full fountain, as the board draws it -- a fan with no spine. Its tips spread
    // from x 2 to 28 and step down from the middle outward, the tallest leaning a little
    // right; each blade bends further out the further out it stands, and the lowest on
    // either side turns right over past the horizontal. Nearly as wide as it is tall, as on
    // the board: 26 px across the tips, 29 rows from the mud to the tallest. (The previous
    // drawing stood one straight sturdy blade up the middle, the tallest by four pixels and
    // carrying the clump's only long pale streak, with the others in mirrored pairs either
    // side of it and a tall pair leaning out to the edges: at 4x and in a real frame it was
    // a fish's backbone or an agave, a spine with ribs, and its three top points a trident.
    // Here two sturdy blades share the middle, leaning apart.)
    mud: [15, [
      '.......umkum.......',
      '....umkmusmkumk....',
      '..umkmmukmmkummkum.',
      'kkkkkkkkkkkkkkkkkkk',
    ]],
    blades: [
      { x: 13, L: 25, a0: -3, a1: -29, bend: 1.3, W: 2, back: true },
      { x: 16, L: 28, a0: 5, a1: 31, bend: 1.3, W: 2, back: true },
      { x: 17, L: 19, a0: 10, a1: 70, bend: 1.3, W: 2, back: true },
      { x: 12, L: 13, a0: -23, a1: -79, bend: 1.2, W: 2 },
      { x: 12, L: 20, a0: -9, a1: -53, bend: 1.3, W: 2 },
      { x: 16, L: 25, a0: 9, a1: 51, bend: 1.3, W: 2 },
      { x: 17, L: 13, a0: 22, a1: 88, bend: 1.2, W: 2 },
      { x: 14, L: 28, a0: -1, a1: -11, W: 3 },
      { x: 15, L: 31, a0: 1, a1: 13, W: 3 },
    ],
  },
  {
    // B: windswept -- everything leaning right and curling further right at the tips, the
    // tallest at the back, a short one upright on the left in the lee of the rest, and one
    // reed snapped half way up, its top hanging down to the mud on the right.
    mud: [15, [
      '......umkum...........',
      '....umkmusmkum...umk..',
      '..umkmmukmmkummkummkm.',
      'kkkkkkkkkkkkkkkkkkkkkk',
    ]],
    blades: [
      { x: 10, L: 34, a0: 4, a1: 56, W: 2, back: true },
      { x: 9, L: 29, a0: -4, a1: 40, W: 2, back: true },
      { x: 12, L: 24, a0: 34, a1: 44, W: 2, snap: [13, 162] },
      { x: 10, L: 30, a0: 6, a1: 58, W: 3 },
      { x: 9, L: 24, a0: -2, a1: 40, W: 2 },
      { x: 11, L: 15, a0: 12, a1: 58, W: 2 },
      { x: 8, L: 16, a0: -10, a1: 22, W: 2 },
    ],
  },
  {
    // C: a low tuft splayed out from the mud with air between its blades, and up out of the
    // middle of it one tall spear, widest a quarter of the way up, that rises straight and
    // bends right through its top half, its tip ending 7 to 11 px right of its root across
    // the sway -- the board's spear. (It stood upright before, turning only 15 degrees end to
    // end, and three pixels wide with a pale streak straight up it, it read as a pole or a
    // candle stuck in the tuft. Now it turns 40 degrees, nearly all of it high up: bend 2.)
    // The tuft's blades are the board's short fan, the inner front pair three pixels wide;
    // the outer ones are two, because a three-pixel blade that lies flatter than 50 degrees
    // moves its width from beside its walk to underneath it, and at the change it left a
    // lone shadow pixel hanging below the blade.
    mud: [16, [
      '......umkum......',
      '...umkmusmkumk...',
      '.umkmmukmmkummkm.',
      'kkkkkkkkkkkkkkkkk',
    ]],
    blades: [
      { x: 13, L: 14, a0: -7, a1: -17, W: 2, back: true },
      { x: 18, L: 13, a0: 12, a1: 24, W: 2, back: true },
      { x: 11, L: 10, a0: -31, a1: -59, W: 2 },
      { x: 12, L: 13, a0: -18, a1: -40, W: 3 },
      { x: 19, L: 11, a0: 26, a1: 50, W: 3 },
      { x: 20, L: 10, a0: 39, a1: 67, W: 2 },
      { x: 15, L: 38, a0: 1, a1: 41, bend: 2, W: 3, pk: 0.25 },
    ],
  },
];

/**
 * The sway, in degrees of turn from one frame to the other: `ROOT` at the foot of a blade,
 * `TIP` by its tip, the frames standing either side of upright. It moves the tip of a
 * 34-px blade three or four pixels between frames and its middle one or two, about as far
 * as the board's second frame leans; 5 and 12 moved the tips five and the clump hopped
 * rather than swayed. A snapped reed lies on the mud and takes only a fifth of it.
 */
const SWAY = { ROOT: 4, TIP: 9 };

export const ELEMENTS = {
  REED_CLUMP: {
    name: 'REED CLUMP', box: [32, 40], anchor: 'stand', frames: 2, variants: 3, fps: 1.25,
    notes: ['A FAN OF OLIVE LEAF BLADES OUT OF DARK MUD,', 'LIT ON THE LEFT. THE WHOLE CLUMP SWAYS.'],
    paint(p, v, f) {
      const clump = CLUMPS[v];
      const side = f ? 0.5 : -0.5;
      for (const b of clump.blades) {
        const give = side * (b.snap ? 0.2 : 1);
        blade(p, { ...b, a0: b.a0 + give * SWAY.ROOT, a1: b.a1 + give * SWAY.TIP });
      }
      mud(p, ...clump.mud);
      p.outline(OUT);
    },
  },
  CATTAIL: {
    name: 'CATTAIL', box: [12, 28], anchor: 'stand', frames: 1, variants: 1,
    notes: ['A BULRUSH: ONE REED WITH A BROWN', 'SAUSAGE HEAD. THE ONE ACCENT IN THE BOG.'],
    // One straight stalk with the brown sausage of a head near its top and the spike above
    // it, and two leaves springing from the root in an open V -- the board's bulrush. The
    // head is the warmest thing in the zone's furniture: velvet brown against the olive, so
    // it reads as a different plant rather than a taller reed.
    //
    // Drawn by hand, pixel by pixel: at twelve pixels wide there is no room for a curve to
    // choose its own steps. Leaves laid out by the reeds' blade rule hugged the stalk and
    // read as a zigzag down it; here each leaf leaves the root at once and climbs out in
    // clean one-and-two steps to a tip level with the foot of the head.
    paint(p) {
      p.ascii(CATTAIL, CATTAIL_PAL);
      p.outline(OUT);
    },
  },
};

// The cattail, top-down, 12 x 28. s/S the spent spike; L H M D the head, lit down its left
// side; g the stalk; a b c the leaves (lit edge, body, pale tip), lit on the left; k m u
// the mud it grows from.
const CATTAIL = [
  '............',
  '......s.....',
  '......S.....',
  '......s.....',
  '.....LHM....',
  '....LLHMD...',
  '....LHHMD...',
  '....HLHMD...',
  '....HHMMD...',
  '....HLHMD...',
  '....HHMDD...',
  '....HHMMD...',
  '....HMMDD...',
  '.c..HHMDD...',
  '.a...MMD..c.',
  '.ab...g...a.',
  '..a...g..ab.',
  '..ab..g..a..',
  '..ab..g.ab..',
  '...a..g.a...',
  '...ab.g.a...',
  '...ab.gab...',
  '....abgb....',
  '....abgb....',
  '.....agb....',
  '.....agb....',
  '....umgmm...',
  '...kkkkkkk..',
];
// k m u: the knot of mud at the root, as under a reed clump -- the dark contact shadow on
// the landing line. Without it the stalk's lit root stood straight on the ledge's top row,
// three bright pixels on the one row that must not carry anything brighter than itself.
const CATTAIL_PAL = { ...HEAD, g: FRONT.lit, a: FRONT.lit, b: FRONT.body, c: FRONT.hi, k: MUD.dark, m: MUD.body, u: MUD.lit };

/**
 * Reeds in clumps along the ledge, and on a wider ledge the odd cattail among them. The
 * rules from before the redraw -- a slot every 16 art px, half of them filled, a cattail on
 * half the ledges over 120 px -- placed on the art pixel rather than rounded to a unit.
 *
 * One change: the cattail takes a SLOT of its own, and a clump that was in it gives way.
 * Placed anywhere, as before, it landed in the middle of a clump more often than not, and
 * at 28 px it is shorter than the tallest blades: its head vanished into them and the one
 * accent in the bog read as another bit of reed. In a slot of its own, with 24-px clumps,
 * it had 16 px to the next clump's root on either side, and only the tips of that clump's
 * outermost blades reached to within a pixel of it.
 *
 * The clump is 32 px wide now, centred on its slot as before, and its widest blades reach
 * 12-14 px from the box's middle at the height of the cattail's head: from the slots either
 * side they came to within a pixel of the head on more than a quarter of the ledges that
 * carry one (779 of 2,724 seeded ledges). So those two clumps step 4 px further out -- the
 * same draws, nothing re-rolled -- and one that cannot, because the ledge's end has already
 * pinned it closer, gives way like the clump in the cattail's own slot. Measured on the
 * same ledges, no blade then comes within a pixel of the head.
 *
 * And a clump in the slot next to one of the same variant becomes one of the other two,
 * chosen by the rest of the same draw, so no draw is added and nothing after it shifts. With
 * three variants drawn freely a third of neighbouring pairs were the same drawing, and at 32
 * px two identical fountains or spears side by side read as one sprite stamped twice.
 */
export function scene(r, wArt) {
  const out = [];
  const slots = [];
  for (let i = 8; i < wArt - 8; i += 16) {
    slots.push(i);
    if (r() > 0.5) continue;
    const u = r() * 3;
    let variant = Math.floor(u);
    const prev = out[out.length - 1];
    if (prev && prev.slot === i - 16 && prev.variant === variant) variant = (variant + 1 + Math.floor((u % 1) * 2)) % 3;
    out.push({ key: 'REED_CLUMP', variant, x: fit(i - 16, 32, wArt), slot: i });
  }
  if (r() < 0.5 && wArt > 120) {
    const s = slots[Math.min(slots.length - 1, Math.floor(r() * slots.length))];
    const cat = fit(s - 6, 12, wArt);
    for (let k = out.length - 1; k >= 0; k--) {
      const it = out[k];
      if (Math.abs(it.slot - s) > 16) continue;
      if (it.slot !== s) it.x = fit(it.x + Math.sign(it.slot - s) * 4, 32, wArt);
      if (it.slot === s || Math.abs(it.x + 16 - (cat + 6)) < 20) out.splice(k, 1);
    }
    out.push({ key: 'CATTAIL', variant: 0, x: cat });
  }
  return out.map(({ key, variant, x }) => ({ key, variant, x }));
}
