// DUNGEON: the crypt.
//
// Skeletons, bones and irons on the ledges, and the reason the band's platforms are tombs.
//
// Drawn at one art pixel per screen pixel from the environment board
// (assets/decor-reference.webp): the Duke's 1-px dark outline, bone and iron and stone each
// in a ramp of four or five tones lit from the upper left. The old pieces were the same
// ideas four times coarser (legacy.js), and what they learned still holds here: a skull
// needs the dark gap above its jaw or it is an egg with holes in it, a hand needs an empty
// column beside every finger or it is a mitten, and a rib cage only reads as part of a
// figure -- bars on a post are a ladder. The cage here is an egg of bone cut by slits that
// curve down toward the flanks, opened at the bottom by the arch under the breastbone (ribs
// drawn as lines came out as straight bars at this size, even drawn as brackets), and a
// crossbones is a saltire so it shares no silhouette with anything else on the ledge.
//
// Bone is the hard part, and it is a contrast problem, not a drawing one. On the old
// platform (#aaaaaa, its lip near white) bone was 1.67:1 against the lit top and simply
// vanished into it. The crypt's drawn tile is darker violet stone, and bone's lit tone is
// 3.2:1 against its lit top row now -- but it never touches that row at all: every piece
// ends in its own dark outline one row above the surface, on top of the tile's own dark top
// edge, so the landing line runs on unbroken beside and under it. Against the backdrop the
// lit bone is 7.7:1 to 11.8:1 and its body tone 5.3:1 at the worst. The contact shadow each
// standing piece still casts (`shadow`, drawn by decor.js in the ledge's stone colour) is
// now two rows deep and only as wide as what touches the floor: it darkens the lit bevel
// under a skull the way a skull on a step would, and leaves the rest of the lip lit.
//
// Iron, as the old chain found, is nearly invisible here (#5a5a68 was barely 2:1), so what
// shows of it is its lit faces -- 3.9:1 at the worst against the brightest backdrop -- and
// its dark tones stay inside. The stone the ossuary and the torch stand on is the ledge's
// violet pulled toward the backdrop's slate, a step lighter than either.
//
// What each field means, and the rules for paint() and scene(), are in index.js.

import { Pix, rgba } from './util.js';

/** Share of ledges (22+ units wide) that carry anything here. */
export const CHANCE = 0.42;   // graves want to feel like the default state here

// A piece's shadow into the lip, [dx from the box's left, width, depth] in art pixels:
// under what touches the floor, two rows deep -- the lit bevel of the tile's top.
const contact = (dx, w) => [dx, w, 2];

// --- the palette ------------------------------------------------------------------------

const INK = '#140c1c';          // the outline, as the Duke's and the companions'

// Bone, lit from the upper left. The ramp leans warm-yellow in the light and toward the
// crypt's own violet in the dark, rather than going grey.
const BONE = {
  W: '#f7f0da',   // the glint on a dome
  H: '#e6d8b3',   // lit
  M: '#c8b389',   // body
  L: '#977e62',   // turned away
  D: '#5f4650',   // a crease, the far side of a bone behind another
  K: '#1e1320',   // a socket, the hollow of a cage
};

// --- the skull ---------------------------------------------------------------------------

// Facing us. Sixteen wide and eighteen tall, in from every edge of the 20 x 20 box so the
// outline has room: an eighteen-wide first try had its sockets stretched into goggles.
// The jaw is a separate row of teeth below a dark gap: without the gap a skull at this
// size is a pale egg with two holes in it.
const SKULL_FRONT = [
  '....HHHHHHHM....',
  '..HHWWWHHHHHMM..',
  '.HWWWWHHHHHHHMM.',
  'HWWWHHHHHHHHHHML',
  'HWWHHHHHHHHHHHML',
  'HHHHHHHHHHHHHMML',
  'HHDKKKDHMDKKKDML',
  'HDKKKKKHMKKKKKDL',
  'MDKKKKKHMKKKKKDL',
  'MDKKKKKMMKKKKKDL',
  'MMDKKKDMMDKKKDLL',
  '.MHHHHMKKMMMMLL.',
  '..MMMMDKKDMMLL..',
  '...LWDHDHDHDL...',
  '...LHDHDHDMDL...',
  '....DKKKKKKD....',
  '....LHDMDMDL....',
  '.....LLLLLL.....',
];

// Turned a quarter to our right: the back of the cranium bulges to the left, the near
// socket is whole and the far one is a sliver on the edge, and the jaw's hinge drops from
// just under an ear hole. The ear hole and the sliver are what say "turned"; without them
// it is a lopsided front view.
const SKULL_TURNED = [
  '...HHHHHHHHM.....',
  '.HHWWWWHHHHHMM...',
  'HWWWWWHHHHHHHMM..',
  'HWWWHHHHHHHHHHMM.',
  'HWWHHHHHHHHHHHHM.',
  'HWHHHHHHHHHHHHHMM',
  'HHHHHHHDKKKDHDKDL',
  'MHHHHHDKKKKKHKKKL',
  'MHHHHHDKKKKKMKKKL',
  'MMHHHHMDKKKDMDKDL',
  'LMMMHHHHHHHMKKML.',
  '.LMMMMMMMMMDKKDL.',
  '..LLMMMMMMMMMMML.',
  '...LDMMLWDHDHDHL.',
  '....LMMDHDHDHDML.',
  '....LMDKKKKKKKD..',
  '.....LMMDMDMDML..',
  '......LLLLLLLL...',
];

function paintSkull(p, variant) {
  if (variant === 1) p.ascii(SKULL_TURNED, BONE, 1, 1);
  else p.ascii(SKULL_FRONT, BONE, 2, 1);
  p.outline(INK);
}

// --- long bones, as solids --------------------------------------------------------------
//
// A long bone is a shaft and its knuckles, and at an angle no ASCII of it stays clean: the
// stair-steps of a diagonal have to be shaded as a cylinder, not as a staircase. So they
// are built from capsules and discs, and every pixel is shaded by the normal of the
// primitive it lies deepest in -- the side of a shaft that faces the upper left is lit
// whatever angle the shaft is at, and a knuckle is lit on its upper-left shoulder.

// Toward the light, y down: from the upper left, a little more from above than from the
// side, so a shaft running exactly corner to corner still has a lit side and a dark one.
const LIGHT = [-0.6, -0.8];

/** Every pixel within r of the segment a-b. */
const cap = (ax, ay, bx, by, r) => ({ ax, ay, bx, by, r });
/** Every pixel within r of (x, y). */
const ball = (x, y, r) => ({ ax: x, ay: y, bx: x, by: y, r });

/** How deep (x, y) is in a primitive, 0 on its axis to 1 at its skin, and the normal there. */
function depth(pr, x, y) {
  const dx = pr.bx - pr.ax, dy = pr.by - pr.ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((x - pr.ax) * dx + (y - pr.ay) * dy) / l2)) : 0;
  const ox = x - (pr.ax + t * dx), oy = y - (pr.ay + t * dy);
  const d = Math.hypot(ox, oy);
  if (d > pr.r) return null;
  return { k: d / pr.r, nx: d ? ox / d : 0, ny: d ? oy / d : 0 };
}

/**
 * A new layer w x h with the union of `prims` in it, shaded from `ramp` ([glint, lit,
 * body, shade], glint may be null): the lit quarter of a cross-section lit, the far third
 * shaded, the rest body. `light` is the direction the light comes from, y down.
 */
function solid(w, h, prims, ramp, light = LIGHT) {
  const q = new Pix(w, h);
  // Only the primitives' own bounds are visited: a skeleton is a dozen of these layers, and
  // the whole box times every primitive of each was most of the zone's build time.
  const x0 = Math.max(0, Math.floor(Math.min(...prims.map((pr) => Math.min(pr.ax, pr.bx) - pr.r))));
  const x1 = Math.min(w - 1, Math.ceil(Math.max(...prims.map((pr) => Math.max(pr.ax, pr.bx) + pr.r))));
  const y0 = Math.max(0, Math.floor(Math.min(...prims.map((pr) => Math.min(pr.ay, pr.by) - pr.r))));
  const y1 = Math.min(h - 1, Math.ceil(Math.max(...prims.map((pr) => Math.max(pr.ay, pr.by) + pr.r))));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let best = null;
      for (const pr of prims) {
        const d = depth(pr, x, y);
        if (d && (!best || d.k < best.k)) best = d;
      }
      if (!best) continue;
      const s = best.k * (best.nx * light[0] + best.ny * light[1]);
      q.set(x, y, s > 0.62 && ramp[0] ? ramp[0] : s > 0.18 ? ramp[1] : s > -0.3 ? ramp[2] : ramp[3]);
    }
  }
  return q;
}

const luma = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

/**
 * Put layer `q` over `p`, with a `rim` round it wherever what is already there shows
 * beside it: one part in front of another is told apart by that line, not by colour. A
 * rim only ever darkens -- the hollow of a chest behind a rib stays the hollow.
 */
function over(p, q, rim) {
  const { w, h } = p, a = q.data, d = p.data;
  if (rim) {
    const hit = [];
    const lim = luma(rgba(rim));
    const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3] > 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (a[i + 3] || !d[i + 3]) continue;
        if (!(on(x + 1, y) || on(x - 1, y) || on(x, y + 1) || on(x, y - 1))) continue;
        if (luma([d[i], d[i + 1], d[i + 2]]) > lim) hit.push(x, y);
      }
    }
    for (let i = 0; i < hit.length; i += 2) p.set(hit[i], hit[i + 1], rim);
  }
  // Every layer here is opaque, so putting one over is a copy of its drawn pixels.
  for (let i = 0; i < a.length; i += 4) if (a[i + 3]) d.set(a.subarray(i, i + 4), i);
}

/**
 * A long bone from (x0, y0) to (x1, y1): a shaft `r` thick and, at each end, the pair of
 * knuckles every drawn bone has, each `k` round, set `s` either side of the shaft. Set
 * further apart than they are round, so the end of the bone has a notch in it: two lobes
 * run together read as a triangle, not a knuckle.
 */
function longBone(x0, y0, x1, y1, { r = 1.3, k = 2, s = 1.7 } = {}) {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
  const vx = -uy, vy = ux;
  const prims = [cap(x0, y0, x1, y1, r)];
  for (const [ex, ey, o] of [[x0, y0, -1], [x1, y1, 1]]) {
    const cx = ex + o * ux * 0.5, cy = ey + o * uy * 0.5;
    prims.push(ball(cx + vx * s, cy + vy * s, k), ball(cx - vx * s, cy - vy * s, k));
  }
  return prims;
}

const BONE_RAMP = [BONE.W, BONE.H, BONE.M, BONE.L];
const SHAFT_RAMP = [null, BONE.H, BONE.M, BONE.L];

// --- the reaching hand -------------------------------------------------------------------

// Stone for the rubble a hand comes up through, the course skulls are stacked on, the stub
// of wall a skeleton leans on and the block a torch is fixed to: the ledge's own violet-
// grey pulled toward the backdrop's slate, a step lighter than either so a block's lit top
// shows against the wall behind it.
const STONE = {
  a: '#8d8aa0',   // lit top
  b: '#66637b',   // face
  c: '#48445c',   // underside
  d: '#2c2a3c',   // the joint between two
};

// Four fingers two pixels wide with an empty column beside each -- the outline fills it,
// and without it the hand is a mitten -- a thumb out to the side, the palm narrowing to
// the knobbly wrist, and the two forearm bones going down into the rubble. Each finger is
// three bones, so it carries two creases; the spread is in the index leaning out to the
// left and the little finger to the right, as the board's hand fans.
const FINGERS = [
  { x: 9, tip: 3, joints: [5, 7], lean: -1, until: 6 },    // index
  { x: 12, tip: 1, joints: [3, 6] },                       // middle, the longest
  { x: 15, tip: 2, joints: [4, 7] },                       // ring
  { x: 18, tip: 5, joints: [7], lean: 1, until: 8 },       // little
];
// Row 10 is the knuckles' crease; below it the metacarpals with a dark seam between each
// (four bones, not a paddle), the thumb joining low, the carpals as a row of knobs, and
// the two forearm bones.
const HAND = [
  '............................',
  '............................',
  '............................',
  '............................',
  '............................',
  '............................',
  '............................',
  '....WM......................',
  '....HM......................',
  '.....LD.....................',
  '......HM.LD.LD.LD.LD........',
  '.......HMDMKHMKHMKML........',
  '........HMMKHMKMMKLL........',
  '..........HMDHMDHML.........',
  '...........MLHMLML..........',
  '..........HMMLHML...........',
  '...........HM.ML............',
  '...........HM.ML............',
  '...........HM.LL............',
  '...........LM.LL............',
];
const RUBBLE = [
  '.........abbc.abbc..........',
  '.....abbc.bccdbccd.abbc.....',
  '...abbcdabbcdabbcdbccdabc...',
  '..bcccdcccdccccdccccdcccc...',
];

function paintHand(p) {
  const g = HAND.map((s) => s.split(''));
  for (const f of FINGERS) {
    for (let y = f.tip; y < 10; y++) {
      const x = f.x + (f.lean && y < f.until ? f.lean : 0);
      const [a, b] = y === f.tip ? ['W', 'M'] : f.joints.includes(y) ? ['L', 'D'] : ['H', 'M'];
      g[y][x] = a;
      g[y][x + 1] = b;
    }
  }
  p.ascii(g.map((r) => r.join('')), BONE);
  p.ascii(RUBBLE, STONE, 0, 19);
  p.outline(INK);
}

// --- the slumped skeleton -----------------------------------------------------------------
//
// Redrawn from the user's second board (assets/decor-fixes-reference.webp), which answered
// the brief in tools/decor-fix-sheet.mjs. The first drawing here was a big-headed figure --
// the standalone skull, sixteen by eighteen, over 40% of the seated height -- crouched with
// its knees drawn up beside a post, and the same body again with its legs out: capsules that
// kept one thickness from end to end, with a round disc at every joint. The board's two men
// are proportioned like people, the skull about a quarter of the seated height, and they
// are two different deaths, not one body folded twice. So:
//   - the skull is near the board's proportion -- 15 rows of 50, a little over it so the
//     face still reads at 1x -- and each pose has its own: the jaw hanging open, facing us;
//     fallen onto the chest, turned down;
//   - a long bone TAPERS, thigh thicker than shin, arm bones thinner than any leg bone, so a
//     limb says which limb it is even at one pixel wide;
//   - the rib cage keeps the construction that finally stopped it reading as a LADDER (twice
//     it did, drawn as lines): an egg of bone cut by slits that droop toward the flanks, an
//     arch under the breastbone, the spine seen through it. The board's cage is drawn the
//     same way, only with more ribs than fit in twelve rows;
//   - the lower back is a stack of vertebrae, not another long bone.

/** Fingers or toes: one-pixel bones fanned from a point. */
const digits = (x, y, tips, r = 0.6) => tips.map(([tx, ty]) => cap(x, y, tx, ty, r));

/**
 * A long bone that tapers from r0 at (x0, y0) to r1 at (x1, y1), as three capsules each a
 * step thinner than the last, with a knob k0 / k1 at either end (0 for none). Stepped
 * capsules rather than a true cone, so the depth() the femurs, the hand and the wrist are
 * built with needs no taper of its own.
 */
function limb(x0, y0, x1, y1, r0, r1, k0 = 0, k1 = 0) {
  const prims = [];
  const at = (t) => [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
  for (let i = 0; i < 3; i++) prims.push(cap(...at(i / 3), ...at((i + 1) / 3), r0 + ((r1 - r0) * (i + 0.5)) / 3));
  if (k0) prims.push(ball(x0, y0, k0));
  if (k1) prims.push(ball(x1, y1, k1));
  return prims;
}

/**
 * The small of the back from (x0, y0) to (x1, y1): a stack of vertebrae two pixels apart,
 * each a knob lit on its upper left, so it reads as a spine and not as one more long bone.
 */
function spine(x0, y0, x1, y1) {
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 2));
  const at = (i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n];
  return Array.from({ length: n + 1 }, (_, i) => ball(...at(i), 1.15));
}

/**
 * The rib cage, front on, as its own layer: an egg of bone hw[r] either side of the
 * breastbone on row y0 + r, cut by dark slits that droop two steps toward the flanks, and
 * opened at the bottom by the arch under the breastbone, with the spine showing through it.
 *
 * The slits carry the drawing. Ribs drawn as lines -- bars, then brackets -- came out as
 * straight bars at this size: their drop at the flank was a pixel or two, and the arms
 * hanging beside the cage hid even that, so the chest read as a grille on a post. A slit
 * cut into a bone-coloured egg keeps its curve because nothing covers it, the egg gives the
 * cage its outline, and the arch is the one shape a chest has that a ladder does not.
 *
 * `lean` shifts each row that many pixels left per row above the bottom, for a chest that
 * has fallen sideways; the slits stay level and move with their rows.
 */
function ribCage(w, h, { cx, y0, hw, slits, arch, lean = 0 }) {
  const q = new Pix(w, h);
  const n = hw.length;
  const mid = (y) => cx - Math.round(lean * (y0 + n - 1 - y));
  const inCage = (x, y) => y >= y0 && y < y0 + n && Math.abs(x - mid(y)) <= hw[y - y0];
  const gap = (x, y) => {
    const d = Math.abs(x - mid(y));
    if (y >= arch && d <= y - arch) return x !== mid(y);
    if (d < 2) return false;
    const drop = d <= 3 ? 0 : d <= 5 ? 1 : 2;
    return slits.some((b) => y === b + drop);
  };
  const bone = (x, y) => inCage(x, y) && !gap(x, y);
  for (let y = y0; y < y0 + n; y++) {
    const m = mid(y);
    for (let x = m - hw[y - y0]; x <= m + hw[y - y0]; x++) {
      let c = BONE.K;
      if (bone(x, y)) {
        const top = !bone(x, y - 1);
        if (x === m) c = y >= arch ? BONE.L : y === y0 ? BONE.W : BONE.H;
        else if (x < m) c = top ? BONE.H : BONE.M;
        else c = top ? BONE.M : BONE.L;
      }
      q.set(x, y, c);
    }
  }
  return q;
}

/** A layer from ASCII, drawn at (x, y). */
function art(w, h, rows, x, y) {
  const q = new Pix(w, h);
  q.ascii(rows, BONE, x, y);
  return q;
}

// The figure's light: more from the side than LIGHT. The board's legs run down to the right
// at 50-60 degrees, and under LIGHT a shin at that angle faces the light with neither side,
// so every shin came out one flat body tone -- a pale band with no edge. From here the side
// facing down-left is lit and the one facing up-right shaded, so each shin is lit on the
// left like every other bone; upright and level bones are still lit on the left and on top.
// Only the figure uses it: the femurs, the hand and the wrist keep LIGHT.
const SIDE_LIGHT = [-0.9, -0.44];

/**
 * A figure from a list of parts, back to front, each cut from what is behind it by the
 * crease tone -- or, for the skull, by the full outline: it is the one thing that has to
 * read at a glance. A part is a list of primitives (or { prims, ramp }), { cage },
 * { art: [rows, x, y] }, { skull: [rows, x, y] }, or { hollow: [cx, cy, rx, ry] }, the dark
 * of the belly behind the spine. `rim: false` lays a part on without cutting it out.
 */
function figure(w, h, parts) {
  const fig = new Pix(w, h);
  for (const part of parts) {
    const rim = part.rim === false ? null : BONE.D;
    if (part.cage) over(fig, ribCage(w, h, part.cage), rim);
    else if (part.skull) over(fig, art(w, h, ...part.skull), INK);
    else if (part.art) over(fig, art(w, h, ...part.art), rim);
    else if (part.hollow) {
      const q = new Pix(w, h);
      q.ellipse(...part.hollow, BONE.K);
      over(fig, q);
    } else over(fig, solid(w, h, part.prims || part, part.ramp || BONE_RAMP, SIDE_LIGHT), rim);
  }
  return fig;
}

/**
 * Squared rubble x0..x1, y0..y1, in blocks bw x bh counting the dark joint on their right
 * and under them, each course set half a block along from the one above: the board's wall
 * stub, in the ledge-violet stone the ossuary and the torch stand on. From row `dim` down
 * every tone is a step darker. The step's lowest course began with lit tops like the rest:
 * a row of lit block tops 30 px long, five rows over the ledge's dark top edge and brighter
 * than its lit lip (luma 141 to 120) -- a second landing line. Dimmed, the lip is the
 * brightest thing near the floor.
 */
function rubble(p, x0, x1, y0, y1, bw, bh, dim = Infinity) {
  for (let y = y0; y <= y1; y++) {
    const ci = Math.floor((y - y0) / bh), j = (y - y0) % bh;
    const off = ci % 2 ? Math.floor(bw / 2) : 0;
    for (let x = x0; x <= x1; x++) {
      const i = (x - x0 + off) % bw;
      let c;
      if (i === bw - 1 || j === bh - 1) c = 'd';
      else if (i === 0 && j === 0) c = 'b';
      else if (i === bw - 2 && j === bh - 2) c = 'd';
      else if (j === 0 || i === 0) c = 'a';
      else if (i === bw - 2 || j === bh - 2) c = 'c';
      else c = 'b';
      if (y >= dim) c = { a: 'b', b: 'c', c: 'd', d: 'd' }[c];
      p.set(x, y, STONE[c]);
    }
  }
}

// The board's skull at the figure's size: thirteen wide, a dome over two round sockets with
// a lit bridge between them, the nose, and the jaw hanging open -- a row of teeth, two rows
// of the dark of the mouth, a row of teeth on the jaw, with the jaw's sides running up to
// the cheeks so it hangs from them rather than floating. One row of mouth read as a
// moustache under a closed skull. The nose sits over a tooth, not over a gap.
const SKULL_GAPE = [
  '....HHHHM....',
  '..HWWWHHHMM..',
  '.HWWHHHHHHML.',
  'HWWHHHHHHHHML',
  'HWHHHHHHHHMML',
  'HHDKKDHDKKDML',
  'HDKKKKHKKKKDL',
  'MDKKKKMKKKKDL',
  'MMDKKDMDKKDLL',
  '.MHHMDKDMMML.',
  '..LWDHWHDHL..',
  '..LKKKKKKKL..',
  '..LDKKKKKDL..',
  '..LHDHDHDHL..',
  '...LMMMMML...',
];

// Fallen onto the shoulder, as the board draws it: the dome up and to the left, the face
// tipped about 40 degrees and looking down and to the right, into its own chest. The socket
// to the upper right is the big clear one and the one low on the left the smaller; the
// nose sits low between them and the teeth run up the lower right edge to the jaw, which
// rests on the collarbone. Drawn the other way round -- the big socket low on the left, the
// other a three-pixel notch on the rim -- the skull looked out to the LEFT with one eye, and
// with the propping arm straight under it the whole figure read as crawling. Relit from the
// upper left after turning (turned with it, the light left the top of the dome in shade).
// The jaw is shut, as on the board: open and turned, it was a tangle of one-pixel diagonal
// stripes of teeth and dark.
const SKULL_DROP = [
  '....HHHHM....',
  '..HWWWHHHHM..',
  '.HWWWHHHHHHM.',
  'HWWWHHHHHHHML',
  'HWWHHHHHHHMML',
  'HWHHHHHHDDDML',
  'HHHHHHHDKKKDL',
  'HHHHHHMKKKKHL',
  'MHHHHHMDKKDHL',
  'MHMDDMMMMMHML',
  'LMDKKDMDKMHDL',
  '.LDKKDMMDHDHL',
  '..LLLMMHDHDL.',
  '.....LLLMLL..',
];

// The pelvis from the front, as a basin: two wings flaring up and out, lit on their crests,
// the sacrum between them carrying the spine down into it, the dark opening under the
// sacrum, and the pubic bone closing the ring at the bottom. In the body tone throughout it
// was lost among the thighs in front of it. Drawn next as a V of two thin wings, open at the
// top, the last vertebra hung in the gap as a pale knob between the thighs: at 4x in a real
// frame it was the one thing in the lap that caught the eye, and it did not read as a hip.
const PELVIS = [
  '.HWH.....HHM.',
  'HWHHDMHMDHHML',
  'HHMMMDHDMMMML',
  '.MMLDKKKDLML.',
  '..LMDKKKDML..',
  '...LMMDMML...',
];

// A hand flat on the floor, seen from above and in front: the wrist, the knuckles, three
// fingers splayed down to the floor and the thumb out to the side, each with an empty
// column beside it for the dark to fill. As capsules fanned from one point the fingers ran
// together over three rows, and with the gaps closed and the contact row dark the hand was
// a HOOF at the foot of a straight arm -- one more reason the figure read as on all fours.
const HAND_FLAT = [
  '..HML...',
  '.HMMMD..',
  'H.H.M.L.',
  'H.H..M.L',
  'D..D..D.',
];

const SLUMPS = [
  // The board's left one: sitting up on the foot of a stub of wall, its back to the stone
  // and the skull against the top of it, facing us with the jaw hanging open. The arms hang
  // down beside the chest, the near hand's fingers over the edge of the step, the far hand
  // on its knee; the legs run down off the step to the floor, bent a little at the knee,
  // feet splayed. The board draws the step low and the feet in front of it; on a ledge that
  // has one floor row, the step goes down to the floor, and the pelvis sits ON it -- the
  // old rule holds: a pelvis off the floor with nothing under it is a crouch.
  // The near arm hangs over the face of the stone, whose edge the chest covers: run down an
  // edge, as it was once, an arm read as a pale edge of the wall. The stone that showed
  // between that arm and the chest, in one- and two-pixel islands, was speckle; paintSlump
  // closes such gaps with the dark of the hollow, as the board's shadowed wall is there.
  {
    stone: [[2, 16, 11, 35, 7, 5], [1, 30, 36, 50, 9, 5, 46]],
    parts: [
      { hollow: [21, 29, 4, 3] },
      [...limb(25, 35, 33, 38.5, 1.6, 1.3), ball(33.5, 38.5, 2.0)],
      [...limb(34, 39.5, 40, 46.5, 1.3, 1.0), ball(40.3, 47, 1.2)],
      digits(40.5, 47, [[43, 50.2], [45, 50.2], [47, 49.4]], 0.65),
      spine(21, 26.5, 21, 30.5),
      { art: [PELVIS, 15, 30] },
      [...limb(18.5, 35, 26, 39, 1.7, 1.4), ball(26.5, 39.5, 2.1)],
      [...limb(27, 40.5, 32, 47, 1.35, 1.05), ball(32.3, 47.3, 1.2)],
      digits(32.5, 47.5, [[35, 50.2], [37, 50.2], [39, 49.4]], 0.65),
      { cage: { cx: 21, y0: 17, hw: [3, 5, 6, 7, 7, 7, 7, 6, 6, 5, 4, 3], slits: [19, 22, 25], arch: 25 } },
      [...limb(28.5, 19, 30.5, 27, 1.0, 0.8, 0, 1.2)],
      [...limb(30.5, 27.5, 33.5, 35, 0.8, 0.7)],
      [cap(33.6, 35.4, 34.3, 36.8, 0.95), cap(33.8, 37.2, 33.4, 39.6, 0.55), cap(35, 37.2, 35.6, 39.6, 0.55)],
      [cap(21, 17, 14, 18.2, 0.8), cap(21, 17, 28, 18.2, 0.8), ball(13.5, 18.8, 1.4), ball(28.5, 18.8, 1.4)],
      [...limb(13.5, 19, 12, 27, 1.0, 0.8, 0, 1.2)],
      [...limb(12, 27.5, 13, 35, 0.8, 0.7)],
      [cap(12.8, 35.5, 13.2, 37.3, 1.0), cap(12.2, 37.6, 11.2, 40.5, 0.55), cap(13.3, 38, 13.2, 41, 0.55), cap(14.3, 37.6, 15.2, 40.3, 0.55)],
      { skull: [SKULL_GAPE, 15, 1] },
      { art: [['DMD'], 20, 16], rim: false },
    ],
  },
  // The board's right one: slid down onto the floor with no wall behind it, the head fallen
  // onto the chest, the chest leaning over onto the arm that props it -- straight down to a
  // hand flat on the floor -- and the legs out to the right: the near knee up, the far leg
  // long behind it with the knee a little raised. They cross once, mid-shin over mid-thigh,
  // well clear of both knees and feet; crossed near a knee and a foot they were one knot.
  // Neither lies flat (a straight bone along the floor is a lit line over the landing line,
  // brighter than it). The far arm hangs down the flank to the near knee.
  // The chest is taller than the skull, as on the board -- fifteen rows of cage to the
  // skull's fourteen -- and leans onto the propping arm, so the far shoulder stands level
  // with the middle of the skull and the near one under its jaw. The first drawing from this
  // board had a thirteen-row cage low down and the skull above both shoulders: the proportion
  // of the old big-headed figure again, and at 1x a head held UP on a straight front leg with
  // the legs trailing behind -- a skeleton crawling, not one slumped. With the pelvis on the
  // floor the figure cannot be as tall as the board's (drawn in 3/4, it sits back and up from
  // its feet), so the arm is a little shorter and the lean does the rest.
  {
    stone: [],
    parts: [
      [...limb(29.5, 48, 44.5, 42.5, 1.6, 1.3), ball(44.8, 42.5, 1.9)],
      [...limb(45.2, 43.2, 50.5, 47.8, 1.25, 1.0), ball(50.7, 48, 1.1)],
      digits(50.8, 48.2, [[52.5, 50.2], [54, 49.5]], 0.65),
      { hollow: [25.5, 41.5, 3.5, 2.5] },
      spine(25.5, 39.5, 26, 44.5),
      { art: [PELVIS, 20, 45] },
      {
        cage: { cx: 25, y0: 24, hw: [2, 4, 5, 6, 7, 7, 7, 7, 7, 7, 6, 6, 5, 4, 3], slits: [26, 29, 32, 35], arch: 35, lean: 0.4 },
      },
      [...limb(26, 21.5, 30.5, 30, 1.0, 0.8, 0, 1.2)],
      [...limb(30.5, 30.5, 33, 38, 0.8, 0.7)],
      [...limb(23, 48, 35, 39.5, 1.7, 1.4), ball(35.4, 39.3, 2.0)],
      [...limb(35.6, 40.2, 39.5, 47.3, 1.35, 1.05), ball(39.6, 47.6, 1.2)],
      digits(39.7, 47.8, [[42, 50.2], [44, 50.2], [45.5, 49.2]], 0.65),
      [cap(19, 24, 11.5, 27.3, 0.8), cap(19, 24, 26, 21.7, 0.8), ball(11.5, 27.5, 1.4), ball(26, 21.5, 1.4)],
      [...limb(11.5, 27.5, 10.5, 37, 1.0, 0.8, 0, 1.2)],
      [...limb(10.5, 37.5, 10, 46, 0.8, 0.7)],
      { art: [HAND_FLAT, 6, 46] },
      { skull: [SKULL_DROP, 6, 15] },
    ],
  },
];

/**
 * The stone, then the figure over it in one piece, cut from the stone by the full outline.
 * Two things are done to the figure first. Any gap in it three pixels wide or less --
 * between an arm and the chest, between fingers -- is filled with the hollow's dark, so
 * what shows through is shadow, not a speck of whatever is behind. And its last row, where
 * it meets the floor, is the crease tone: bone is the lightest thing in the crypt, and a
 * pale row lying right on the ledge would draw a second line over the one the player
 * tracks. This is the dark contact row the board asks for; decor.js's shadow is under it.
 */
function paintSlump(p, variant) {
  const pose = SLUMPS[variant] || SLUMPS[0];
  for (const s of pose.stone) rubble(p, ...s);
  const fig = figure(p.w, p.h, pose.parts);
  const on = (x, y) => fig.alpha(x, y) > 0;
  const gaps = [];
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (on(x, y)) continue;
      const across = (on(x - 1, y) || on(x - 2, y)) && (on(x + 1, y) || on(x + 2, y));
      const down = (on(x, y - 1) || on(x, y - 2)) && (on(x, y + 1) || on(x, y + 2));
      if (across || down) gaps.push(x, y);
    }
  }
  for (let i = 0; i < gaps.length; i += 2) fig.set(gaps[i], gaps[i + 1], BONE.K);
  for (let x = 0; x < p.w; x++) if (fig.alpha(x, p.h - 2)) fig.set(x, p.h - 2, BONE.D);
  over(p, fig, INK);
  p.outline(INK);
}

// --- the ossuary stack --------------------------------------------------------------------

// The skull again, fourteen square, for stacking: the same face -- sockets, nose, a row of
// teeth over a dark gap -- with the chin left off, since in a stack every jaw rests on
// something.
const SKULL_SMALL = [
  '....HHHHHM....',
  '..HHWWHHHHMM..',
  '.HWWWHHHHHHMM.',
  'HWWHHHHHHHHHML',
  'HWHHHHHHHHHMML',
  'HHDKKDHHDKKDML',
  'HDKKKKHMKKKKDL',
  'MDKKKKMMKKKKDL',
  'MMDKKDMMDKKDLL',
  '.MHHHMKKMMMLL.',
  '..MMMDKKDMLL..',
  '..LWDHDHDHDL..',
  '...DKKKKKKD...',
  '...LMDMDMDL...',
];

/**
 * A course of ashlar x0..x1, rows y0..y1: blocks with a lit top and a dark joint between
 * each, the joints of each course set off from the one above as a mason lays them.
 */
function ashlar(p, x0, x1, y0, courses) {
  let y = y0;
  courses.forEach(([h, widths], ci) => {
    let x = x0 - (ci % 2 ? Math.floor(widths[0] / 2) : 0);
    let k = 0;
    while (x <= x1) {
      const bw = widths[k++ % widths.length];
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < bw; i++) {
          const px = x + i;
          if (px < x0 || px > x1) continue;
          const c = i === bw - 1 ? 'd' : j === 0 ? 'a' : j === h - 1 ? 'c' : i === 0 ? 'a' : i === bw - 2 ? 'c' : 'b';
          p.set(px, y + j, STONE[c]);
        }
      }
      x += bw;
    }
    y += h;
  });
}

function paintOssuary(p) {
  const [w, h] = [60, 32];
  ashlar(p, 7, 52, 24, [[4, [9, 11, 8, 10, 9]], [3, [11, 9, 10, 12]]]);
  // Two skulls on the stone and one in the saddle between them, each cut from what is
  // behind it by the crease tone rather than run into it.
  const q = new Pix(w, h);
  q.ascii(SKULL_SMALL, BONE, 15, 10);
  q.ascii(SKULL_SMALL, BONE, 31, 10);
  const top = new Pix(w, h);
  top.ascii(SKULL_SMALL, BONE, 23, 1);
  over(q, top, BONE.D);
  over(p, q, INK);
  p.outline(INK);
}

// --- the manacled wrist -------------------------------------------------------------------

// Iron. The old note holds: iron is nearly invisible on this backdrop (#5a5a68 on it is
// barely 2:1), so what shows of it is its lit faces -- a pale top on every link and on the
// cuff's rim -- and the dark tones are kept for the insides.
const IRON = {
  g: '#d2d6e2',   // glint: a rivet head, the top of a link
  a: '#959bb1',   // a face turned up to the light
  b: '#65697f',   // body
  c: '#43465a',   // turned away
  d: '#1d1c2b',   // inside the cuff
};

// A chain is links in turn face on and edge on, and it only reads as one when the links
// that face us are whole rings: a closed top, a closed bottom and a hole between, which the
// outline fills dark. The first chain here was a three-pixel rod with one slot in it, open
// at the bottom, and at 1x it was a rod -- with the cuff under it, a hanging lamp.
const FACE_LINK = [
  '.gab.',
  'gabbc',
  'ab.bc',
  'ab.bc',
  'ab.cc',
  'bbccc',
  '.bcc.',
];
// Edge on, a link is a flat bar; it is drawn BEHIND the rings, so only its middle shows
// between them, the way one link passes through the next.
const EDGE_LINK = ['gab', 'abc', 'abc', 'abc', 'bcc', 'bcc', 'bcc'];

/**
 * The cuff: a short ring seen from above, as a top ellipse rx x ry about (cx, cy) and a
 * band `band` px deep hanging from its front edge. What makes it a ring and not something
 * else, each learnt by drawing the something else:
 *   - it is wider than tall, and its band CURVES: the front rim and the band's foot both
 *     follow the ellipse. Straight, as tall as wide, it was a helmet with a visor;
 *   - the opening is most of the ring's width, in a rim two pixels thick, with the back rim
 *     closing it at the top and the inside of the far wall a tone lighter than the hole
 *     under it. A slot two rows deep was a letterbox; an opening that ran into the top edge
 *     was an open bowl, a mushroom's cap;
 *   - about fourteen wide, not much over twice the bones in it, as on the board. At
 *     seventeen, with the band shallower than the opening, it was a dish;
 *   - its band is the body tone, not the dark one: iron's dark tone is 1.2:1 against the
 *     brightest backdrop, and a band in it left a rim floating over nothing.
 */
function cuff(p, cx, cy, rx, ry, band) {
  const inOuter = (x, y) => ((x - cx) / (rx + 0.4)) ** 2 + ((y - cy) / (ry + 0.4)) ** 2 <= 1;
  const inInner = (x, y) => ((x - cx) / (rx - 1.3)) ** 2 + ((y - cy - 0.2) / (ry - 0.6)) ** 2 <= 1;
  const front = (x) => cy + (ry + 0.4) * Math.sqrt(Math.max(0, 1 - ((x - cx) / (rx + 0.4)) ** 2));
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + band + 1); y++) {
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const u = (x - cx) / (rx + 0.4);
      if (Math.abs(u) > 1) continue;
      const f = front(x);
      let c = null;
      if (inInner(x, y)) c = inInner(x, y - 1) ? 'd' : 'c';
      else if (inOuter(x, y)) c = u < 0.45 ? 'a' : 'b';
      else if (y > f && y <= f + band) c = y > f + band - 1 || u > 0.55 ? 'c' : 'b';
      if (c) p.set(x, y, IRON[c]);
    }
  }
  // Studs along the middle of the band, following its curve, each a glint over its own
  // shadow; and one standing out at each side where the band turns away.
  for (const dx of [-4, 0, 4]) {
    const x = cx + dx, y = Math.round(front(x) + band / 2 - 0.5);
    p.set(x, y, IRON.g);
    p.set(x, y + 1, IRON.c);
  }
  for (const s of [-1, 1]) {
    const x = Math.round(cx + s * (rx + 1)), y = Math.round(cy + band / 2);
    p.set(x, y, s < 0 ? IRON.a : IRON.b);
    p.set(x, y + 1, IRON.c);
  }
}

// Two rings and the link between them, the cuff hung on the second -- the ring's back rim
// covers that link's foot, so it hooks behind it -- and the two forearm bones side by side
// under it, touching, their wrist ends a pair of knobs like the end of any drawn bone.
function paintWrist(p) {
  const [w, h] = [24, 36];
  p.ascii(EDGE_LINK, IRON, 10, 5);
  p.ascii(FACE_LINK, IRON, 9, 0);
  p.ascii(FACE_LINK, IRON, 9, 9);
  const bones = new Pix(w, h);
  bones.stamp(solid(w, h, [cap(9.6, 23, 9.6, 30, 1.1), ball(9.2, 32, 2.1)], BONE_RAMP));
  over(bones, solid(w, h, [cap(12.4, 23, 12.4, 30, 1.1), ball(12.8, 32, 2.1)], BONE_RAMP), BONE.D);
  p.stamp(bones);
  cuff(p, 11, 18.2, 6.3, 2.7, 5);
  p.outline(INK);
}

// --- the wall torch -----------------------------------------------------------------------

const WOOD = [null, '#b47d48', '#86582f', '#583820'];   // lit, body, shade: a solid() ramp
const FLAME = {
  1: '#fff8d6',   // the core
  2: '#ffd75e',
  3: '#ff9b30',
  4: '#e2561d',   // the tongues' edges
};
const GLOW = '#ff9b30';

// A block of the crypt's ashlar standing on the ledge, for the bracket to be fixed to: the
// board's torch is on a wall, and a ledge in this shaft has no wall of its own.
const PILLAR = [
  'aaaaaa',
  'abbbbc',
  'abbbbc',
  'bccccc',
  'dddddd',
  'acdaac',
  'bcdabc',
  'bcdabc',
  'ccdbcc',
  'dddddd',
  'aaaaac',
  'abbbbc',
  'abbbbc',
  'bccccc',
  'dddddd',
  'acdaac',
  'bcdabc',
  'bcdabc',
  'ccdbcc',
  'dddddd',
  'aaaaac',
  'abbbbc',
  'bccccc',
];

// The bracket, over the pillar and the handle: a dark strap on the stone with two rivets,
// an arm out to a collar round the handle, and a brace under it. Darker than the stone it
// is fixed to, with a lit edge, or strap and stone are one grey.
const BRACKET = [
  '...gb...........',   // row 23
  '...bc...........',
  '...gc...........',
  '...bc....gabc...',
  '...bcaaaaabbc...',
  '...bcccccbccc...',
  '...bc...bc......',
  '...bc..bc.......',
  '...bc.bc........',
  '...bcbc.........',
  '...bcc..........',
  '...gc...........',
  '...cc...........',
];

// Four flickers: each row of a flame is [offset of its centre, width], top down, and the
// base (the last row) sits on the torch's head. Tall and straight, bent right, tall and
// bent left, low -- no two in a row alike, and the last leads back into the first.
const FLICKER = [
  [[0, 1], [0, 1], [0, 3], [0, 3], [0, 5], [0, 5], [0, 7], [0, 7], [0, 7], [0, 7], [0, 5], [0, 3]],
  [[2, 1], [2, 1], [1, 3], [1, 3], [1, 5], [0, 5], [0, 7], [0, 7], [0, 7], [0, 5], [0, 3]],
  [[-1, 1], [-1, 1], [-1, 1], [-1, 3], [0, 3], [0, 5], [0, 5], [0, 7], [0, 7], [0, 7], [0, 7], [0, 5], [0, 3]],
  [[1, 1], [0, 3], [0, 3], [0, 5], [0, 5], [0, 7], [0, 7], [0, 7], [0, 5], [0, 3]],
];

/**
 * A flame whose base row is `base`, centred on column cx: each pixel's tone by how far it
 * is in from the row's edge, the core only low down, and a faint halo round it all. No
 * outline -- a point of light drawn with a dark edge reads as a cut-out of one.
 */
function flame(p, cx, base, rows) {
  const top = base - rows.length + 1;
  const lit = [];
  rows.forEach(([o, w], i) => {
    const y = top + i, hw = (w - 1) / 2;
    const low = i >= rows.length * 0.45;
    for (let x = -hw; x <= hw; x++) {
      const inset = hw - Math.abs(x);
      lit.push([cx + o + x, y, low ? Math.max(1, 4 - inset) : Math.min(4, Math.max(2, 5 - inset))]);
    }
  });
  // The halo first, then the flame over it: every empty pixel beside the flame.
  const on = new Set(lit.map(([x, y]) => x + ',' + y));
  for (const [x, y] of lit) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (!on.has(nx + ',' + ny) && p.inside(nx, ny) && !p.alpha(nx, ny)) p.set(nx, ny, GLOW, 0.35);
    }
  }
  for (const [x, y, t] of lit) p.set(x, y, FLAME[t]);
}

function paintTorch(p, frame) {
  const [w, h] = [16, 44];
  p.ascii(PILLAR, STONE, 1, 20);
  // The handle leans out from the bracket, its foot hanging free below it.
  p.stamp(solid(w, h, [cap(10, 38, 11.5, 18, 1.3)], WOOD));
  p.ascii(BRACKET, IRON, 0, 23);
  // The head: an iron collar and the pitch-soaked wrapping the flame comes out of.
  p.ascii(['..dddd..', '.gaabbc.', '.abbbcc.'], IRON, 8, 15);
  p.outline(INK);
  // Centred a column left of the handle's top, so the widest row and its halo stay a pixel
  // in from the box's right edge rather than being cut flat by it.
  flame(p, 11, 14, FLICKER[frame]);
}

// --- crossed femurs ----------------------------------------------------------------------

// A saltire, the rising bone in front. The one behind is cut by a rim of the crease tone
// where the front one crosses it, which is what makes it an X of two bones rather than
// one four-armed shape.
function paintFemurs(p) {
  const [w, h] = [36, 28];
  const knuckles = { r: 1.4, k: 2.2, s: 2.3 };
  p.stamp(solid(w, h, longBone(6, 7, 29, 22, knuckles), BONE_RAMP));
  over(p, solid(w, h, longBone(6, 22, 29, 7, knuckles), BONE_RAMP), BONE.D);
  p.outline(INK);
}

export const ELEMENTS = {
  SLUMPED_SKELETON: {
    name: 'SLUMPED SKELETON', box: [56, 52], anchor: 'stand', frames: 1, variants: 2, shadow: contact(1, 50),
    notes: ['ON THE FOOT OF A WALL STUB, JAW OPEN; OR', 'SLID DOWN, HEAD ON CHEST, PROPPED ON ONE ARM.',
      'RIBS ARE CURVED SLITS IN AN EGG OF BONE WITH', 'AN ARCH UNDER THE BREASTBONE - NEVER BARS.'],
    paint(p, v) { paintSlump(p, v); },
  },
  SKULL: {
    name: 'SKULL', box: [20, 20], anchor: 'stand', frames: 1, variants: 2, shadow: contact(4, 13),
    notes: ['THE COMMON FILLER. ONE FACING US,', 'ONE TURNED A QUARTER.'],
    paint(p, v) { paintSkull(p, v); },
  },
  CROSSED_FEMURS: {
    name: 'CROSSED FEMURS', box: [36, 28], anchor: 'stand', frames: 1, variants: 1, shadow: contact(3, 30),
    notes: ['A SALTIRE OF TWO THIGH BONES - SHARES NO', 'SILHOUETTE WITH ANY OTHER PIECE.'],
    paint(p) { paintFemurs(p); },
  },
  OSSUARY_STACK: {
    name: 'OSSUARY STACK', box: [60, 32], anchor: 'stand', frames: 1, variants: 1, shadow: contact(6, 48),
    notes: ['THREE SKULLS STACKED ON A COURSE OF STONE,', 'TWO AND ONE. WIDE LEDGES ONLY.'],
    paint(p) { paintOssuary(p); },
  },
  REACHING_HAND: {
    name: 'REACHING HAND', box: [28, 24], anchor: 'stand', frames: 1, variants: 1, shadow: contact(2, 24),
    notes: ['A HAND COMING UP OUT OF RUBBLE. A GAP', 'BESIDE EVERY FINGER OR IT READS AS A MITTEN.'],
    paint(p) { paintHand(p); },
  },
  MANACLED_WRIST: {
    name: 'MANACLED WRIST', box: [24, 36], anchor: 'hang', frames: 1, variants: 1,
    notes: ['IRON CHAIN TO A STUDDED CUFF, TWO BONES', 'BELOW IT. LINKS FACING US ARE WHOLE RINGS,',
      'THE CUFF A RING WIDER THAN TALL. IRON SHOWS', 'ONLY BY ITS LIT FACES ON THIS BACKDROP.'],
    paint(p) { paintWrist(p); },
  },
  WALL_TORCH: {
    name: 'WALL TORCH', box: [16, 44], anchor: 'stand', frames: 4, variants: 1, shadow: contact(0, 8),
    // Today's flame flickers as sin(9t): four frames a cycle is 4 * 9 / 2pi a second.
    fps: (4 * 9) / (2 * Math.PI),
    notes: ['THE ONLY LIGHT AND MOTION DOWN HERE.', 'IRON BRACKET, 4-FRAME FLAME (ORANGE TO', 'PALE YELLOW CORE). FAR END OF A LEDGE.'],
    paint(p, v, f) { paintTorch(p, f); },
  },
};

// Weights, not a uniform pick. The seated figure is the one that carries the band, so it
// gets the biggest share; the bare skull is the filler that has to stay common enough to
// feel like the default state of the place. A piece's width -- which keeps it inside its
// slot -- is its box, read from ELEMENTS rather than written here a second time.
const TABLE = [
  [0.22, 'SLUMPED_SKELETON'],
  [0.20, 'SKULL'],
  [0.18, 'REACHING_HAND'],
  [0.16, 'CROSSED_FEMURS'],
  [0.14, 'OSSUARY_STACK'],
  [0.10, 'MANACLED_WRIST'],
];

/**
 * The crypt scene, in art pixels: one to three pieces in slots across the ledge, then
 * perhaps a torch at the far end. The same random draws in the same order as the old
 * cryptScene, so every ledge carries what it did -- but placed on the art pixel now, not
 * rounded to a world unit: the pieces are drawn at art resolution, and a unit's rounding
 * put up to two pixels of drift into where a skull sat for nothing.
 */
export function scene(r, wArt) {
  const out = [];
  const n = wArt >= 280 ? 3 : wArt >= 184 ? 2 : 1;
  const span = (wArt - 32) / n;
  const used = [];
  let right = 0;
  for (let i = 0; i < n; i++) {
    // Nothing twice on one ledge, and nothing wider than its slot. Two identical hands on
    // one platform is the moment a shaft of these becomes wallpaper.
    let pick = null, variant = 0;
    for (let k = 0; k < 6 && !pick; k++) {
      let p = r(), c = TABLE[TABLE.length - 1];
      for (const row of TABLE) { if (p < row[0]) { c = row; break; } p -= row[0]; }
      const e = ELEMENTS[c[1]];
      if (e.box[0] <= span + 4 && used.indexOf(c) < 0) {
        pick = c;
        // Which variant rides on the same draw -- where in its weight it fell -- so a
        // second skull costs no extra random number and nothing after it moves.
        variant = Math.min(e.variants - 1, Math.floor((Math.max(0, p) / c[0]) * e.variants));
      }
    }
    if (!pick) continue;
    used.push(pick);
    const bw = ELEMENTS[pick[1]].box[0];
    const x = Math.round(16 + span * i + r() * Math.max(4, span - bw));
    out.push({ key: pick[1], variant, x });
    if (x + bw > right) right = x + bw;
  }
  // The torch SHARES the band rather than being replaced by it: it is the only light and
  // the only motion down here, and every shipped crypt tileset has a flame in it. Far end,
  // and only if a skeleton has not already taken the space: its box ends 8 px short of the
  // ledge's end, clear of the cap's broken corner, where the old post stood a unit in.
  if (right < wArt - 32 && r() < 0.45) out.push({ key: 'WALL_TORCH', variant: 0, x: Math.floor(wArt) - 24 });
  return out;
}
