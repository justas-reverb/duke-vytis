// SWAMP: moss hanging from gnarled boughs over a dark, misty bog, after the board's "hanging
// moss drips and run-off streaks over a dark bog. Dank, misty, and foreboding."
//
//   FAR   the bog, near-black teal and opaque, a mist glowing in it, and a fringe of small
//         hazy moss curtains far off on their boughs
//   MID   the lit moss: curtains in the middle distance, each a row of tapering tongues
//         with bright ridges, hanging from a dark bough; and will-o'-wisps in the bog
//   NEAR  a few big curtains, the longest tongues, darker than MID and lit only along
//         their crowns and ridges, each on a bough of its own
//
// REDRAWN, 2026-09-28, when the user found the swamp's background ugly. It passed every
// number below and still looked it, and in a real frame why was plain: a screen of free-floating
// green tongues striped column by column, crossed by hundreds of one-pixel lines -- the
// run-off, the drips and the strands -- so the whole zone read as smeared, scratched
// glass. Four things changed. The run-off and the drips are gone (the board's streaks were
// a few soft lines under a canopy; a tile repeated up the tower made them a rain of
// scratches). Each curtain hangs from a BOUGH now, a dark, gnarled branch along the tilted
// line it hung from, running on past the moss at both ends -- dark and never level, so it
// cannot be read as a ledge -- where the moss used to fray into darkness from nothing.
// The stripes inside each tongue (its per-column strand shade) are a third of what they
// were, so a tongue is a shaded clump, not a fringe. And the bog has a few WILL-O'-WISPS
// (MID), dim green glows no brighter than the moss's own highlight, in the open bog only.
//
// The board hangs all its moss from the top of the picture and lets it fade into the
// dark below. A tile repeats up the tower, so moss hung from the tile's top edge would
// meet the faded bottom of the tile above: a hard line of moss every 128 units. Here
// each curtain hangs from its own height, its top frayed away into the dark -- moss
// hanging off branches too high and too dark to see -- and the curtains are staggered,
// so the screen is draped at every height and no two start on the same line. Across, they
// overlap in a ring round the tile, of all different widths, so it is draped at every x
// too. They used to stand apart, clear of the tile's side edges, which left a lane of bare
// bog the height of the screen at every tile edge, MID's and NEAR's in the same place,
// and the moss between the lanes a grid of columns repeated every 128 units (hangers and
// ringTile say how and why).
//
// ONE SCREEN WIDE, LAID LIKE BRICKS. Every layer here is painted 960 x 256 -- 480 view
// units across, the whole screen -- where every other zone's is 256 x 256, 128 units,
// which the screen shows 3.75 times across and twice down. With the lanes and the
// diagonals gone, that grid was what was left: every curtain hung again at the same
// height 128 units to its right, three or four copies side by side, and a careful eye
// found the stamp. Measured on the backdrop pixels between the ledges of real frames, the
// picture matched itself 512 screen pixels to the right, and 512 down, at a correlation
// of 1.00, against 0.06 at most at any other distance; laid as below, 0.01 and -0.01,
// and the one match left is the bond's own, 960 across and 512 down. A layer scrolls
// only up and down, never across, so a tile as wide as the screen shows each of its
// columns once. Wide and stacked square, though, the moss hung straight above its own
// twin every 128 units, two copies one over the other in every frame, which the eye
// finds as easily as two side by side. So each row of tiles is laid half a tile along
// from the row above, as bricks are: a curtain's nearest twin is 240 units across and 128
// up -- the other half of the shaft -- or 256 straight up, just under the screen's
// height. The tiles are painted on that lattice (ringTile), and backdrop.js lays them so
// from what each painter returns, { period, shift }. Everything else is as it was -- a
// curtain is the same size, 256 pixels of width hold as many of them -- only dealt across
// 960 pixels, so each of the 26 curtains in MID and 15 in NEAR hangs at a height of its
// own.
//
// NEAR IS LAID ITS OWN WAY. With one bond for all three layers, the bond's match was not
// one curtain's but the WHOLE picture's: a shift that lays each layer onto itself lays
// the stack onto itself too, whatever the parallax has done to them, so in every frame a
// quarter of the shaft -- every curtain, the mist, the run-off -- was an exact copy of
// another quarter, 960 screen pixels across and 512 down (a correlation of 1.00). NEAR's
// rows go 420 pixels along instead of 480 (see near below), so its twin falls 120 screen
// pixels away from MID's and FAR's and each copy of one layer hangs over or under
// something else: the best the backdrop matches itself anywhere is 0.5-0.7 (NEAR's own
// twin, over another MID and mist), and MID's and FAR's about 0.25, under another NEAR. The
// bare stretches are as they were (down any 128 units, at most 27 units with no MID, 22
// with no NEAR, 7 with neither; none down the whole screen). NEAR's nearest twin is now
// 210 units across and 128 up. MID keeps half the tile, the furthest a twin can be put,
// because its lit curtains are what the eye follows; FAR keeps it because its mist's
// cells must meet whole across the bond (wrapNoise2).
//
// WHY IT WAS REPAINTED. The first version was dull, and measurably so: the backdrop alone
// at game size had its darkest twentieth at luma 33 and its median at 43, where the
// board's SWAMP panel has them at 10 and 32 -- nothing on screen was dark. (This one: 7
// and 28.) Three causes:
//   - FAR was an 80% murk over the zone's olive sky, and the sky's fifth lifted every
//     dark in the zone to a grey olive. FAR is opaque now: the crossfade no longer needs
//     to see the sky through it (the whole next zone is composited and faded, see
//     backdrop.js), and the board's bog is a teal all but black, not olive.
//   - Moss and bog were one yellow olive, so value was the only thing that told them
//     apart, and the moss spent all of it on four close mid tones. The board's moss is a
//     warm yellow-green lit against a COOL near-black; the hue split does half the work.
//   - The moss was shaded per column, so a curtain was a fringe of stripes with no
//     volume. Each tongue is now a spike lit from the upper left -- a bright ridge down
//     its left side, its right side in shadow -- and a tongue in front casts a black
//     crease on the one behind it, which is where the board gets its contrast: lit
//     spikes against the black between them.
// The mist, two flat tones in blotches, read as camouflage; it is a soft glow now, four
// tones of green-grey over the bog, and the thickest of them (luma 50) is darker than the
// body of the lit moss. That order is the board's -- lit moss in a dark, misty bog -- and
// the repaint first had it the wrong way round: its mist topped out at a grey teal of
// luma 59, over a sixth of FAR, while the moss bodies sat at 32 to 52, so the brightest
// thing on screen was the fog and the moss hung in it as dark tassels. Two pixels in a
// hundred of the backdrop passed luma 60, fewer than in the dull version (sixteen) or on
// the board (thirteen); with the light put back in the moss, seven to ten did, and with
// the lanes between the curtains closed (see hangers), eight to ten.
//
// Behind the play: everything here is under the ledges. The brightest moss, MID's ridge
// highlight at luma 82, stays at or below the ledges' mossy tops (80-106 across a ledge,
// its stones brighter) and well below the reeds (#6f8c3a, luma 122), and it is a scatter
// of spike ridges, never a line: at most seven pixels in a thousand of the whole backdrop
// pass 80, all of them those ridges, and nothing passes 83 -- the beads of water were
// once luma 132, the brightest pixels on screen and brighter than the ledges they hang
// behind, and are kept under 80 now. No lit shape here is horizontal:
// tongues and streaks are vertical, every curtain hangs from a tilted line, its lit crown
// wanders up and down by column, and the mist has no edges.

import { mulberry32 } from '../../core/rng.js';
import { dither, rgba } from './forest.js';

// The board's colours, measured off its SWAMP panel and set a step apart. The theme's own
// greens (bgFar #667744, bgNear #445533) are the olive of the old flat backdrop and would
// bring the dullness back, so the painter does not use them.
const BOG = {
  deep: '#040f0b',    // run-off in the dark
  base: '#0f231d',    // the bog: the board's darks are #020e06 to #0f1c1c, its median #15261a
  lift: '#132a22',
  mist1: '#172f25',
  mist2: '#1c3529',
  // The mist at its thickest, luma 50: the board's misty band is #223624, its
  // brightest tenth #304631. A green-grey, under the lit moss (see MOSS).
  mist3: '#223c2d',
};
// Moss tones per layer, darkest first: the gap between tongues, shadow, body, lit, and
// the ridge highlight. FAR's are hazed toward the mist and barely leave the bog. MID is
// the lit moss, the board's yellow-green: body 62, lit 73, highlight 82, all above the
// thickest mist (50). NEAR is darker than MID, body 41 and highlight 76: it hangs right
// behind the ledges, and when it was the brightest layer, as on the board, its crowns
// (luma 97) were as bright as the ledges' mossy tops (80-106) and the ledges went under.
// It went too far the other way once, silhouettes with a body of 32 under the mist, and
// the zone lost its light; the rule is moss lighter than the mist it hangs in, and
// nothing as bright as a ledge. Lit MID behind a darker NEAR is also what gives the three
// layers their depth.
const MOSS = {
  far: ['#0f231d', '#142b21', '#1c3928', '#24462e', '#2c4f33'],
  mid: ['#05120d', '#163420', '#284e26', '#325a2a', '#3c652e'],
  near: ['#020a06', '#0a1d13', '#153520', '#27532a', '#345e2c'],
};
// The boughs the moss hangs from: dark wet bark, a shade under the mist (luma 50) so they
// stand out of it as silhouettes, with a faintly lighter top where the wet catches the mist
// (luma ~30) -- a dark shape, never a lit line. Per layer: FAR's hazed into the bog, NEAR's
// the darkest. [underside, body, top]
const BOUGH = {
  far: ['#0b1a15', '#10221b', '#16291f'],
  mid: ['#050c09', '#0a1510', '#15231b'],
  near: ['#020604', '#060e0a', '#101a14'],
};
// A will-o'-wisp: a core at the moss highlight's brightness (luma 82, under the ledges'
// mossy tops at 80-106, and under the 83 nothing here passes), a ring of dim glow round
// it. [halo, glow, core]
const WISP = ['#15271d', '#24422f', '#386244'];

/** Brightness v to a tone, 0 (the gap) to 4 (the highlight). */
const CUTS = [0.18, 0.4, 0.56, 0.86];
const toneOf = (v) => (v > CUTS[3] ? 4 : v > CUTS[2] ? 3 : v > CUTS[1] ? 2 : v > CUTS[0] ? 1 : 0);

/**
 * The tile every layer here is painted into: TW pixels across and T down (see LAID LIKE
 * BRICKS at the top: TW is 960, T 256), wrapping with a period of TW - 1 across and T - 1 down,
 * its last column and last row copies of its first. One fillRect per run of a colour
 * along a row, as forest.js's pixTile, which is square, flushes.
 *
 * Not wrapped at T, as the other zones are, because of what tools/test-backgrounds.mjs
 * can and cannot tell apart. It finds a seam by comparing the tile's first column with
 * its last, and in a moss curtain two NEIGHBOURING columns already differ by more than it
 * allows: strands change shade every pixel or two and the top frays at a different height
 * in every column (a median of 12 and 19 of 255 in MID and NEAR, measured, against a
 * limit of 12). So a curtain wrapped honestly across x = 255 failed the test, and the
 * curtains were kept off the side edges instead -- which left a channel of bare bog the
 * full height of every tile at its edges, 32 art pixels wide in MID and 22 in NEAR, at
 * nearly the same place, and repeated every 128 units across the screen: lanes of empty
 * bog ruling the screen into a lattice. Painted with a period of T - 1 and the first
 * column repeated as the last, the edges match exactly, a curtain crosses the edge like
 * any other column, and on screen one column in every 256 showed twice, which in moss is
 * not visible -- laid wide, not even that (see S below). Rows the same, so a curtain can
 * hang from any height.
 *
 * `X` is the period down and `XW` across, T - 1 and TW - 1 unless the layer asks for
 * the whole tile. FAR asks for T and TW (see far below): the 4 x 4 ordered dither its mist
 * is shaded with repeats every 4 pixels, which divides 256 and 960 and not 255 or 959, so
 * at 255 the dither's phase jumped at the tile's edges, and at a corner of the tile where
 * the mist was shading from one tone to the next it came out as a little hash mark, the
 * same at every tile corner across the screen.
 *
 * `S` is the bond (see LAID LIKE BRICKS at the top): the row of tiles below this one is
 * laid S pixels along, so a point that falls below the tile's last row belongs S pixels
 * back in its top rows, and the last row, the copy of the first, is the first row as the
 * next row of tiles shows it, S along. The backdrop repeats a tile laid this way every
 * XW pixels, not TW (each painter returns XW as its `period`), so the copy of the first
 * column is never shown: shown, it would make the screen's period a pixel longer than the
 * lattice the tile is painted on, and where the bond carries a row of tiles across the
 * tile's edge the rows would meet a pixel out of step.
 */
function ringTile(T, TW, X = T - 1, XW = TW - 1, S = 0) {
  const buf = new Uint8Array(TW * T);
  // Where any point of the layer lands in the tile: which row of tiles it is in, back
  // along by S for each, then across.
  const at = (x, y) => {
    const fy = Math.floor(y), ky = Math.floor(fy / X);
    const wx = (((Math.floor(x) - ky * S) % XW) + XW) % XW;
    return (fy - ky * X) * TW + wx;
  };
  return {
    buf,
    T,
    TW,
    X,
    XW,
    S,
    at,
    set(x, y, c) { buf[at(x, y)] = c; },
    flush(g, pal) {
      if (XW < TW) for (let y = 0; y < X; y++) buf[y * TW + XW] = buf[y * TW];
      if (X < T) for (let x = 0; x < TW; x++) buf[X * TW + x] = buf[at(x, X)];
      for (let y = 0; y < T; y++) {
        const row = y * TW;
        let x = 0;
        while (x < TW) {
          const c = buf[row + x];
          let e = x + 1;
          while (e < TW && buf[row + e] === c) e++;
          if (c) { g.fillStyle = pal[c]; g.fillRect(x, y, e - x, 1); }
          x = e;
        }
      }
    },
  };
}

/**
 * wrapNoise from util.js for a tile that is not square: value noise on a lattice of cx by
 * cy cells, wrapping at W across and H down, read at whole pixels 0 <= x < W, 0 <= y < H.
 * With cx = cy, W = H and no S it draws the same numbers in the same order and returns
 * the same values as wrapNoise. With S, the next row of tiles down is S pixels along (see
 * ringTile), so the cells past the last row are the first row's, S along -- which needs S
 * to be a whole number of cells: cx even for a bond of half the tile.
 *
 * A pixel's cell and its weight across depend on x alone, and down on y alone, so they are
 * worked out once per column and once per row rather than per pixel. Per pixel, as
 * wrapNoise does it, FAR's mist took 14-19 ms of the layer's 24-30 ms at 960 wide
 * (measured headless), and the next zone is painted ahead one layer a frame, so that
 * frame is what a player would feel.
 */
function wrapNoise2(r, cx, cy, W, H, S = 0) {
  const L = [];
  for (let i = 0; i < cx * cy; i++) L.push(r());
  const sm = (t) => t * t * (3 - 2 * t);
  const axis = (n, size, cells) => {
    const c0 = new Int32Array(n), c1 = new Int32Array(n), w = new Float64Array(n);
    for (let v = 0; v < n; v++) {
      const f = (v / size) * cells;
      const i = Math.floor(f);
      c0[v] = ((i % cells) + cells) % cells;
      c1[v] = (((i + 1) % cells) + cells) % cells;
      w[v] = sm(f - i);
    }
    return { c0, c1, w };
  };
  const ax = axis(W, W, cx), ay = axis(H, H, cy);
  const sc = Math.round((S * cx) / W);
  const back = (i) => (((i - sc) % cx) + cx) % cx;
  const b0 = ax.c0.map(back), b1 = ax.c1.map(back);
  return (x, y) => {
    const i0 = ax.c0[x], i1 = ax.c1[x], tx = ax.w[x];
    const j0 = ay.c0[y] * cx, j1 = ay.c1[y] * cx, ty = ay.w[y];
    const a = L[j0 + i0] + (L[j0 + i1] - L[j0 + i0]) * tx;
    // In the last row of cells the row below is the next row of tiles' first, sc along.
    const k0 = j1 ? i0 : b0[x], k1 = j1 ? i1 : b1[x];
    const b = L[j1 + k0] + (L[j1 + k1] - L[j1 + k0]) * tx;
    return a + (b - a) * ty;
  };
}

/**
 * One curtain of moss, W wide from `left`, hung at `top`: a mass that hangs from a ragged,
 * sagging line tilted by `tilt` (pixels down per pixel across), and tongues hanging from
 * it, each tapering to a point. `tones` are five palette indices, darkest first (see
 * MOSS). Everything through P, so it wraps. Every solid pixel is marked in `cast`, for
 * the drop shadow onto the layer behind.
 *
 * The tilt is there because level, every curtain's top and the row of lit crowns under
 * it made a horizontal edge, however ragged. Tilted, they are the underside of a branch
 * that is not level, which is what moss hangs from.
 *
 * Each tongue is a spike with a depth of its own: in every column the front-most tongue
 * still hanging that low owns the pixel, so a long tongue behind shows below a short one
 * in front. Shading is per tongue -- lit from the upper left, a ridge highlight a third of
 * the way in from its left edge, dark down its right side -- and where a tongue in front
 * ends, the pixel to its right on the tongue behind is the gap tone: the crease.
 *
 * The top frays out. Each tongue swells upward a little over its own width (`o.rise`),
 * so the top is uneven, and in the top `o.fade` pixels every column's strand gives out
 * at its own height, the upper part of it in the translucent `o.veil`, which only darkens
 * what is behind, the lower part in dim moss. The moss brightens below that, by an amount
 * that wanders column to column (`o.crown`). Three versions got this wrong. One started
 * every column at full brightness right under a short fade: a bright dotted rim with
 * teeth under it. The next dissolved a flat top in near-black: a dark stippled lid on
 * every curtain. Both were a little shelf, which in a tower of ledges is the one shape a
 * background must not have. The third domed each tongue a lot and lit the domes, and
 * the curtains came out as heads of broccoli.
 *
 * `o.gain` (default 1) scales the light before it is cut into tones, so more of each
 * tongue lands in the lit tones: MID, which carries the zone's light, has 1.2.
 */
function curtain(P, r, left, W, top, tilt, o, tones, cast) {
  const TW = P.TW;
  const half = W / 2;
  // The mass the tongues hang from, behind all of them.
  const parts = [{ x: 0, hw: half, L: o.base[0] + r() * (o.base[1] - o.base[0]), z: -1, lit: 0.8, rise: 0, base: true }];
  // As many tongues as the width holds, one every `o.pitch` pixels give or take: the
  // curtains' widths vary two and a half times now (see hangers), and a fixed count would
  // crowd the narrow ones and thin out the wide.
  const nt = Math.max(2, Math.round((W / o.pitch) * (0.85 + r() * 0.3)));
  for (let k = 0; k < nt; k++) {
    const hw = Math.min(half, o.hw[0] + r() * (o.hw[1] - o.hw[0]));
    // Kept inside the curtain's width: a tongue past the edge was cut off square.
    const x = Math.max(hw - half, Math.min(half - hw, (((k + 0.5 + (r() - 0.5) * 0.9) / nt) - 0.5) * W));
    // Lengths skewed short: many short tongues and a few long ones, as on the board.
    const q = r();
    parts.push({ x, hw, L: o.len[0] + Math.pow(q, 1.6) * (o.len[1] - o.len[0]), z: r(), lit: 0.85 + r() * 0.3, rise: r() * o.rise });
  }
  const sag = 3 + r() * 6;
  // The line the moss hangs from: a damped random walk, so it is ragged, not ruled. And a
  // second, slower walk for how far below it each column's lit crown begins.
  const rag = [], crown = [];
  let walk = 0, cw = r() * o.crown;
  for (let x = 0; x <= W; x++) {
    walk = walk * 0.85 + (r() - 0.5) * 4;
    rag.push(walk);
    cw = Math.max(0, Math.min(o.crown, cw + (r() - 0.5) * o.crown * 0.5));
    crown.push(cw);
  }
  // Per-column strand shade, smoothed once so strands are one to three wide.
  const raw = [];
  for (let x = 0; x <= W + 2; x++) raw.push(r() - 0.5);
  const strand = (x) => (raw[x] + raw[x + 1] + raw[x + 2]) / 3;
  // How far down each column's strand begins: the top frays into single threads that
  // give out at different heights, as moss does, rather than thinning in a dither.
  const fray = [];
  for (let x = 0; x < W; x++) fray.push(Math.floor(Math.pow(r(), 0.8) * o.fade * 0.85));

  // The bough: along the line the moss hangs from, without its rag (a branch is smoother
  // than the moss on it), thicker in the middle, running `o.bough.ext` past each end and
  // thinning out there. Drawn first, above the moss: tongues domed up over it cover it.
  if (o.bough) {
    const ext = o.bough.ext[0] + Math.floor(r() * (o.bough.ext[1] - o.bough.ext[0]));
    const thick = o.bough.thick[0] + r() * (o.bough.thick[1] - o.bough.thick[0]);
    let knot = 0;
    for (let x = -ext; x < W + ext; x++) {
      const uc = (x + 0.5 - half) / half;
      // Past the moss the branch runs on straight along its tilt, and thins to a twig.
      const inside = x >= 0 && x < W;
      const end = inside ? 1 : 1 - Math.min(1, (x < 0 ? -x : x - W + 1) / ext);
      knot = knot * 0.8 + (r() - 0.5) * 0.9;
      const th = Math.max(1, Math.round((thick * (0.55 + 0.45 * end) + knot) * (inside ? 1 : 0.5 + 0.5 * end)));
      const yb = top + Math.round(tilt * (x - half) + sag * Math.min(1, uc * uc)) - 1;
      for (let k = 0; k < th; k++) {
        const at = P.at(left + x, yb - k);
        P.buf[at] = k === 0 ? o.bough.idx[0] : k === th - 1 && th > 2 ? o.bough.idx[2] : o.bough.idx[1];
        cast[at] = 1;
      }
    }
  }
  let prev = new Map();   // the column to the left: y -> depth of the tongue that owns it
  for (let x = 0; x < W; x++) {
    const cur = new Map();
    const uc = (x + 0.5 - half) / half;
    const y0 = top + Math.round(tilt * (x - half) + sag * uc * uc + rag[x]);
    const spans = [];
    let deepest = 0, hump = 0;
    for (const t of parts) {
      const u = (x + 0.5 - half - t.x) / t.hw;
      if (Math.abs(u) >= 1) continue;
      const L = t.base ? t.L * Math.sqrt(1 - u * u) : t.L * Math.pow(1 - Math.abs(u), 1.15);
      if (L < 1) continue;
      const rise = t.rise * (1 - u * u);
      spans.push({ t, u, L, rise });
      deepest = Math.max(deepest, L);
      hump = Math.max(hump, rise);
    }
    if (!spans.length) { prev = cur; continue; }
    spans.sort((a, b) => b.t.z - a.t.z);
    hump = Math.round(hump);
    const px = left + x;
    const s0 = strand(x) * o.strand;
    // j counts down from the top of this column, which is the hang line raised by the
    // tallest dome over it; each tongue starts at its own dome and ends at its own tip.
    for (let j = 0; j < hump + deepest + o.fade; j++) {
      const py = y0 - hump + j;
      if (j < fray[x]) continue;
      // Where the pixel lands in the tile, for its shadow and its dither (see ringTile).
      const at = P.at(px, py), wy = (at / TW) | 0, wx = at - wy * TW;
      if (j < fray[x] + 3 && dither(wx, wy) >= (j - fray[x] + 1) / 4) continue;
      const s = spans.find((sp) => j >= hump - sp.rise && j < hump + sp.L + o.fade);
      if (!s) { if (j >= hump + o.fade) break; continue; }
      const { t, u } = s;
      cur.set(py, t.z);
      cast[at] = 1;
      // Across: lit from the left, a ridge a third of the way in, dark down the right.
      const across = t.base ? 0.7 : 0.74 - 0.3 * u + 0.2 * Math.max(0, 1 - Math.abs(u + 0.45) / 0.3);
      // Down: rising out of the frayed top below this column's crown, falling to the tip.
      const up = Math.min(1, Math.max(0, (j - o.fade * 0.35 - crown[x]) / (o.fade * 0.9)));
      const d = Math.max(0, j - hump - o.fade) / s.L;
      const down = 1 - 0.9 * Math.pow(Math.min(1, d), 1.2);
      const v = up * down * across * t.lit * (o.gain || 1) + s0 + (dither(wx, wy) - 0.5) * 0.12;
      let k = toneOf(v);
      // The crease: the tongue to the left is in front of this one.
      const left0 = prev.get(py);
      if (left0 !== undefined && left0 > t.z) k = 0;
      if (j < o.fade * 0.45) { P.buf[at] = o.veil; continue; }
      if (j < o.fade) k = Math.min(k, 2);
      P.buf[at] = tones[k];
    }
    prev = cur;
  }
}

/**
 * Will-o'-wisps: n dim glows in the open bog, each a core about 3 across with a ring of glow
 * and a wider, fainter halo, 11 across in all (at 4, a speck nobody saw), drawn only where the layer is empty, so a wisp is never on the
 * moss. `idx` is the halo, glow and core palette indices.
 */
function wisps(P, r, n, idx) {
  const X = P.X, XW = P.XW, TW = P.TW;
  for (let k = 0; k < n; k++) {
    const cx = 2 + Math.floor(r() * (XW - 4)), cy = Math.floor(r() * X);
    for (let dy = -5; dy <= 6; dy++) {
      for (let dx = -5; dx <= 6; dx++) {
        const d = Math.hypot(dx - 0.5, dy - 0.5);
        const at = P.at(cx + dx, cy + dy);
        const i = d < 1.7 ? idx[2] : d < 3.2 ? idx[1] : d < 5.4 ? idx[0] : 0;
        if (!i) continue;
        // Over empty bog only; the core may cover the glow of a wisp drawn before it.
        if (P.buf[at] && !(i === idx[2] && (P.buf[at] === idx[0] || P.buf[at] === idx[1]))) continue;
        P.buf[at] = i;
      }
    }
  }
}

/**
 * A translucent shadow of the layer's curtains, `dx` right and `dy` down, onto whatever
 * shows through it -- so the layer behind darkens round each curtain and the two read as
 * two depths rather than one wall that swims. Only where this layer is empty, and across
 * the tile's edges like everything else.
 */
function dropShadow(P, cast, dx, dy, idx) {
  const TW = P.TW, X = P.X, XW = P.XW;
  for (let y = 0; y < X; y++) {
    // The row dy above, which for the top rows is in the row of tiles above, S along.
    const ky = Math.floor((y - dy) / X), sy = y - dy - ky * X, back = dx + ky * P.S;
    for (let x = 0; x < XW; x++) {
      const sx = ((x - back) % XW + XW) % XW;
      if (cast[sy * TW + sx] && !P.buf[y * TW + x]) P.buf[y * TW + x] = idx;
    }
  }
}

/**
 * Where each of n curtains hangs: its left edge, its width, the height it hangs from and
 * the tilt of the line it hangs from. X is the tile's period across and Y its period down
 * (see ringTile): 959 and 255 for MID and NEAR, since the tiles went one screen wide.
 *
 * A RING ROUND THE TILE: each curtain overlaps the next by `lap` pixels, the last one
 * overlapping the first across the tile's edge, so no stretch of the layer is bare bog
 * from top to bottom. They used to stand side by side, clear of the tile's side edges,
 * three or four of much the same width to a tile, and that was the lattice: a full-height
 * lane of empty bog at every tile edge, in MID and NEAR at nearly the same x, and between
 * the lanes the same few curtains, evenly spaced, repeated every 128 units -- a grid of
 * moss columns 3.75 times across the screen. The widest run of columns with no moss in
 * them was 32 art pixels in MID, 22 in NEAR and 15 in FAR; now no column of the screen
 * is without MID's moss or NEAR's from top to bottom. (Laid like bricks, a stretch of
 * one tile's height can be: a curtain hung low in one row of tiles drops its moss into
 * the next row, half a tile along. Down any 128 units, the widest run of screen columns
 * with no MID is 27 units, no NEAR 21, and neither 7, where every column had both.) The
 * widths are drawn from a wide range, a curtain up to two and a half times its
 * neighbour, and the spacing follows from the widths, so no two gaps between curtain
 * middles are alike. And the ring starts at a random x, so the tile's edge is nowhere in
 * particular, and MID's seven curtains and NEAR's four, as a 256-pixel tile held them,
 * kept their thinnest columns apart (no stretch wider than 2 columns has both under a
 * tenth). The backdrop's brightness, averaged down each column and across
 * the width of an old lane, varies less across the screen than it did (a standard
 * deviation of 3.2 luma to 2.9, over seven frames).
 *
 * The heights are the golden-ratio sequence down the tile, so no two are alike. Random
 * heights put three curtains of one layer on a line often enough to notice, and the tile
 * repeats that line across the whole screen: a row of moss, level, every 128 units.
 * Handed out left to right, as they were, they climb the tile in equal steps, 97 pixels up
 * for each curtain to the right -- a staircase, which tiled is a lattice of diagonals --
 * and round a ring the last curtain comes next to the first at whatever height the steps
 * leave it, 23 pixels away with six curtains. So they are dealt round the ring, and the
 * deal is kept only if (1) neighbours are at least a fifth of the tile apart, or two would
 * hang side by side from one long level line; (2) going round the ring, each step taken
 * the short way up or down, the heights come back to where they started rather than a
 * whole tile lower or higher (the ring's WINDING is 0); and (3) never more than two steps
 * in a row go the same way. A shuffle alone kept only (1), and that is not enough: a ring
 * that winds is a staircase however it is shuffled -- it has to fall a whole tile going
 * once round -- and tiled, a staircase is the lattice of diagonals again. NEAR's three
 * curtains could not help winding (three heights round a ring always do, whatever the
 * order: counted, all six deals); they stepped 60, 97 and 98 pixels down from left to
 * right, each curtain a third of a tile across from the last, and across the screen the
 * layer's big dark crowns ran in parallel diagonals, as regular as the columns they
 * replaced (moved a curtain across and 98 down, the layer matched itself at 0.45, where
 * the old staircase had matched at 0.53; dealt by these rules, nowhere better than 0.13).
 * MID's seven had been dealt to wind twice, six steps down to one up. So NEAR has four
 * curtains to a 256-pixel tile's width, the fewest that can go down and up again, and
 * the deal is searched until all three rules hold.
 *
 * The search was a fresh shuffle per try, which found a deal for seven curtains (14 in
 * 5040 keep the rules) and cannot for the 26 that hang across a screen-wide tile: a
 * shuffle of 26 keeps every neighbour a fifth apart about once in 120,000 (17 in two
 * million, counted), before the other two rules. It is now a walk: swap two curtains,
 * keep the swap unless it breaks more rules than it mends, where each close pair, each
 * whole turn of winding and each step past the second in a row counts against a deal, so
 * a deal nearer to the rules scores better and the walk goes downhill. It lands on a deal
 * that keeps all three in 932 tries for MID, 997 for NEAR and 1,495 for FAR, of the
 * 20,000 it is allowed. A height can be anything -- a frayed top across the tile's top
 * edge wraps like the rest (see ringTile) -- where it used to be held inside a band clear
 * of the top and bottom, and clamping to that band could put two curtains on one height.
 */
function hangers(r, X, Y, n, w, lap) {
  const ws = [], laps = [];
  for (let k = 0; k < n; k++) {
    ws.push(w[0] + r() * (w[1] - w[0]));
    laps.push(lap[0] + r() * (lap[1] - lap[0]));
  }
  // Stretch the widths so the ring closes: widths less overlaps come to the tile exactly.
  const sum = (a) => a.reduce((s, v) => s + v, 0);
  const f = (X + sum(laps)) / sum(ws);
  // The deal is shuffled from a stream of its own, seeded once from r, so however many
  // tries it takes, every draw after it is the same: the widths and tilts below do not
  // move when the rules or the curtain count are tuned and the search runs longer.
  // It was put here for a sharper reason. MID and FAR used to start from ONE seed
  // (backdrop.js keyed a layer by the length of its name, and 'far' and 'mid' are both
  // three letters), FAR 222 draws on, after its noise. Shuffled from r itself, six draws
  // a try, the longer search these rules need ran MID's stream on into the stretch FAR's
  // reads, in step with it, and the two layers hung their curtains in one order and at
  // the same tilts. The layers have their own streams now, so that cannot happen again;
  // the stream of its own stays for the first reason.
  const rd = mulberry32(Math.floor(r() * 4294967296));
  const shuffle = (a) => {
    for (let k = a.length - 1; k > 0; k--) {
      const j = Math.floor(rd() * (k + 1));
      [a[k], a[j]] = [a[j], a[k]];
    }
    return a;
  };
  const y0 = r();
  const hs = ws.map((_, k) => (y0 + k * 0.618034) % 1);
  // The step from one height to the next the short way round, -0.5 to 0.5 of the tile,
  // and how far a deal is from all three rules: 0 when it keeps them. Counted, not just
  // flagged, so that the walk below can tell a nearer deal from a further one.
  const step = (a, b) => { const d = b - a; return d - Math.round(d); };
  const fault = (d) => {
    const st = d.map((h, k) => step(h, d[(k + 1) % n]));
    const close = st.filter((s) => Math.abs(s) < 0.2).length;
    const winding = Math.round(st.reduce((s, v) => s + v, 0));
    let long = 0;
    for (let k = 0; k < n; k++) {
      const s = Math.sign(st[k]);
      if (s === Math.sign(st[(k + n - 1) % n]) && s === Math.sign(st[(k + n - 2) % n])) long++;
    }
    return 100 * close + 10 * Math.abs(winding) + long;
  };
  let deal = shuffle(hs.slice()), worst = fault(deal);
  for (let tries = 0; tries < 20000 && worst > 0; tries++) {
    const d = deal.slice();
    const a = Math.floor(rd() * n), b = Math.floor(rd() * n);
    [d[a], d[b]] = [d[b], d[a]];
    const e = fault(d);
    if (e <= worst) { worst = e; deal = d; }
  }
  let c = r() * X;
  const out = [];
  for (let k = 0; k < n; k++) {
    const left = Math.floor(c);
    const W = Math.ceil(c + ws[k] * f) - left;
    // Tilted one way or the other by a fifth to a half -- less on a wide curtain, whose
    // ends would otherwise hang sixty pixels apart.
    const most = Math.max(0.2, Math.min(0.5, 40 / W));
    const tilt = (r() < 0.5 ? -1 : 1) * (0.2 + r() * (most - 0.2));
    out.push({ left, W, top: Math.round(deal[k] * Y), tilt });
    c += ws[k] * f - laps[k];
  }
  return out;
}

/**
 * The bond a layer TW wide is laid with: a share `f` of the tile, half unless the layer
 * says otherwise, when it is wider than it is tall (see LAID LIKE BRICKS and NEAR IS
 * LAID ITS OWN WAY at the top), none for a square one. [share of TW; 0.5, NEAR 0.4375]
 */
const bond = (T, TW, f = 0.5) => (TW > T ? Math.round(TW * f) : 0);

/**
 * A layer of curtains on their boughs, and their shadow: MID and NEAR, TW wide. `lay.n` and
 * `lay.wisps` are per 256 pixels of width, as they were when that was the whole tile.
 * Returns how the backdrop is to lay it: a period of TW - 1 across, and the bond.
 */
function mossLayer(g, T, TW, r, moss, bough, o, lay) {
  const P = ringTile(T, TW, T - 1, TW - 1, bond(T, TW, lay.bond));
  const cast = new Uint8Array(TW * T);
  const across = TW / T;
  // 1-5 moss, 6 the drop shadow (and the frayed tops' veil), 7-9 the bough, 10-12 a wisp.
  const pal = [null, ...moss, rgba('#010604', lay.shadow), ...bough, ...WISP];
  const tones = [1, 2, 3, 4, 5];
  o.veil = 6;
  o.bough = { ...o.bough, idx: [7, 8, 9] };
  for (const h of hangers(r, P.XW, P.X, Math.round(lay.n * across), lay.w, lay.lap)) {
    curtain(P, r, h.left, h.W, h.top, h.tilt, o, tones, cast);
  }
  dropShadow(P, cast, lay.dx, lay.dy, 6);
  if (lay.wisps) wisps(P, r, Math.round(lay.wisps * across), [10, 11, 12]);
  P.flush(g, pal);
  return { period: P.XW, shift: P.S };
}

export default {
  // Paint this zone's layers one screen wide (see LAID LIKE BRICKS at the top): backdrop.js
  // sizes the canvas and hands its width to each painter as TW.
  wide: true,

  far(g, T, th, r, i, TW = T) {
    // FAR wraps at the whole tile, 256, not 255 as MID and NEAR do: its mist's dither
    // repeats every 4 pixels, and at 255 it broke at the tile's edges into a hash mark at
    // every corner of the tile (see ringTile). FAR does not need the shorter period: its
    // tones sit so close together that its curtains cross the edges honestly and the
    // edges still meet (an edge difference of 1.9 left to right and 0.4 top to bottom,
    // against the test's 12; 1.5 and 0.8 one screen wide and laid like bricks).
    const P = ringTile(T, TW, T, TW, bond(T, TW));
    const X = P.X, XW = P.XW, across = TW / T;
    const pal = [null, BOG.deep, BOG.base, BOG.lift, BOG.mist1, BOG.mist2, BOG.mist3, ...MOSS.far, ...BOUGH.far];
    // The mist: soft patches, a little thicker once per tile -- the board's misty band,
    // made periodic and kept faint -- and shaded through four tones over the bog with a
    // dither only where two meet. Every pixel is set: FAR is the bog, and nothing shows
    // through it. The noise is read at the same rate both ways. Read at twice the rate
    // down, as the first version did so the drifts would lie wide and low, it put two
    // rows of drifts in every tile, and tiled across the screen those were stripes of
    // pale mist, level, the width of the tower. The darkest tone is kept for the
    // run-off: as dark patches in the mist it came out as ink blots.
    // Noise and band have the layer's periods, X down and XW across, and its bond; across a
    // wide tile the noise has as many cells again for each 256 pixels, rounded to an even
    // number so the half-tile bond is whole cells, and its drifts are the size they were
    // (18 and 52 across 960 for 5 and 14 across 256: 53 and 18 pixels, from 51 and 18).
    // The band runs level, so the bond cannot move it.
    const cells = (c) => (P.S ? 2 * Math.round((c * across) / 2) : Math.round(c * across));
    const n1 = wrapNoise2(r, cells(5), 5, XW, X, P.S);
    const n2 = wrapNoise2(r, cells(14), 14, XW, X, P.S);
    const phase = r();
    for (let y = 0; y < X; y++) {
      const band = Math.cos(2 * Math.PI * (y / X - phase)) * 0.06;
      for (let x = 0; x < XW; x++) {
        const m = n1(x, y) * 0.6 + n2(x, y) * 0.25 + band + (dither(x, y) - 0.5) * 0.035;
        P.buf[y * TW + x] = m < 0.44 ? 2 : m < 0.5 ? 3 : m < 0.56 ? 4 : m < 0.62 ? 5 : 6;
      }
    }
    // A fringe of small, hazy curtains far off, each on a thin bough.
    const o = { pitch: 5.8, hw: [3, 6], len: [10, 56], base: [3, 7], fade: 12, rise: 3, crown: 5, strand: 0.08, veil: 7,
      bough: { ext: [4, 10], thick: [1.5, 2.5], idx: [12, 13, 14] } };
    const cast = new Uint8Array(TW * T);
    for (const h of hangers(r, XW, X, Math.round(7 * across), [26, 52], [3, 8])) {
      curtain(P, r, h.left, h.W, h.top, h.tilt, o, [7, 8, 9, 10, 11], cast);
    }
    P.flush(g, pal);
    return { period: XW, shift: P.S };
  },

  // Closing the ring (see hangers) hangs half as much curtain again across each tile --
  // widths summing to the tile and its overlaps, where the old side-by-side curtains came
  // to about 200 of 256 -- and with the tongues as they were, the lit moss went up with
  // it: MID's moss from 11% of its tile to 17%, backdrop pixels over luma 60 from 8% to
  // 12%, and more of them round the ledges. So MID's tongues are sparser, narrower and a
  // little shorter than they were (one per 9.5 pixels rather than 6.7, 3-7 wide, 14-84
  // long), with more of the dark between them that the board has, and NEAR's a little
  // sparser. MID's moss is 14% of its tile, NEAR's 32% (29% before), and the backdrop
  // over 60 is 8-10% by frame (7-11% before, 13% on the board).
  mid(g, T, th, r, i, TW = T) {
    return mossLayer(g, T, TW, r, MOSS.mid, BOUGH.mid,
      { pitch: 9.5, hw: [3, 7], len: [14, 84], base: [4, 9], fade: 10, rise: 4, crown: 8, strand: 0.08, gain: 1.2,
        bough: { ext: [6, 16], thick: [2.5, 4] } },
      { n: 7, w: [24, 60], lap: [5, 11], shadow: 0.4, dx: 2, dy: 3, wisps: 2 });
  },

  // Laid 420 pixels along a row, not 480 (0.4375 of 960), so the stack has no twin as a
  // whole (see NEAR IS LAID ITS OWN WAY at the top). 60 art pixels off the others' bond,
  // about a NEAR curtain's width: 400 and 560 did as well and put NEAR's own twin nearer.
  near(g, T, th, r, i, TW = T) {
    return mossLayer(g, T, TW, r, MOSS.near, BOUGH.near,
      { pitch: 9, hw: [4, 12], len: [28, 160], base: [6, 12], fade: 14, rise: 6, crown: 12, strand: 0.08,
        bough: { ext: [10, 24], thick: [4, 6.5] } },
      { n: 4, w: [60, 124], lap: [6, 16], shadow: 0.45, dx: 3, dy: 4, bond: 0.4375 });
  },
};
