// The ORIGINAL furniture painters: one per zone, rectangles in WORLD units.
//
// This was src/render/decor.js, the whole of the platform furniture, until the furniture
// became sprites (decor.js now, with one module per zone in this folder). It is kept, as
// bgpaint/legacy.js keeps the old background tiles, for one job: every element's
// PLACEHOLDER. Until a zone's elements are redrawn at one art pixel per screen pixel, each
// zone module's paintCanvas() calls these painters, scaled by PX into the element's box and
// fed a scripted random stream so exactly one element comes out -- so the game looks as it
// did while the art is redrawn one zone at a time. The whole-scene painters (DECOR,
// decorFor) are kept too, so a tool can draw TODAY's scene beside the new one.
//
// What these painters drew, as they drew it: every one is handed an RNG seeded from the
// platform's own floor number, so a given ledge always carries the same furniture and
// nothing flickers as it scrolls. World Y increases upward here, so drawing at `y + h`
// puts things ON TOP of the ledge.
//
// One world unit is PX = 4 screen pixels, so all of this is four times chunkier than the
// sprites and tiles it sits on. That is the reason it is being replaced, not a defect in
// the painters: do not "fix" anything here, it is the reference.

import { PX, PLAT_THICK } from '../../game/constants.js';

const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + (
    (cl(((n >> 16) & 255) * k) << 16) |
    (cl(((n >> 8) & 255) * k) << 8) |
    cl((n & 255) * k)
  ).toString(16).padStart(6, '0');
};

// --- the crypt -------------------------------------------------------------
//
// Skeletons, bones and irons on the DUNGEON ledges, and the reason the band's
// platforms are tombs.
//
// The art is authored as ASCII and compiled once at load into horizontal runs, so a
// whole seated skeleton costs 36 fillRects rather than about 150 and the shapes stay
// editable as text rather than as coordinates.
//
// Bone is the hard part and it is a contrast problem, not a drawing one. Bone #e8dcbf
// against the platform's LIT top is 1.67:1 -- genuinely invisible. Against the platform
// body it is 3.2:1 and against the near backdrop 10:1. So bone is allowed on the dark
// face of a ledge and against the wall, and nowhere near the bright top row, which is
// the one row a player tracks at speed.

const BONE = {
  H: '#e8dcbf',   // bone, lit
  M: '#c9b98f',   // bone, body
  L: '#8a7d5c',   // bone, shadow
  K: '#221c26',   // socket / cage interior
  I: '#8e93a6',   // iron, lit   (reads against the dark backdrop; #5a5a68 does not)
  i: '#4a4e5e',   // iron, shadow
};

// rows are written top-down; dy is measured up from the bottom row, because
// world Y increases upward here.
function compile(rows) {
  const h = rows.length;
  const out = [];
  for (let ry = 0; ry < h; ry++) {
    const s = rows[ry], dy = h - 1 - ry;
    let x = 0;
    while (x < s.length) {
      const c = s[x];
      if (c === '.') { x++; continue; }
      let n = 1;
      while (x + n < s.length && s[x + n] === c) n++;
      out.push([x, dy, n, BONE[c]]);
      x += n;
    }
  }
  out.sort((a, b) => (a[3] < b[3] ? -1 : a[3] > b[3] ? 1 : 0));
  return out;
}

function blit(ctx, runs, x, y) {
  let cur = null;
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    if (r[3] !== cur) { cur = r[3]; ctx.fillStyle = cur; }
    ctx.fillRect(x + r[0], y + r[1], r[2], 1);
  }
}

// A bare skull. Five rows is the minimum that keeps a jaw notch, and the jaw
// notch is what separates a skull from a die.
const SKULL = compile([
  '.HHH.',
  'HHHHH',
  'MKMKM',
  '.MKM.',
  '.LL..',
]);

// Two femurs crossed. This slot used to be a skull sitting on a femur, which is
// a fine object but reads as the same blob as STACK from ten feet away -- a
// shaft of them turned into wallpaper, which is the one thing this must not do.
// A saltire shares no silhouette with anything else here.
const CROSS = compile([
  'HH.....HH',
  '.MM...MM.',
  '..MM.MM..',
  '...MMM...',
  '..MM.MM..',
  '.LL...LL.',
  'LL.....LL',
]);

// A corpse seated against the back of the niche, head lolled onto its chest,
// legs stretched out along the ledge. The cage interior is dark and only three
// ribs show; four evenly spaced ones read as rungs, which is what the first two
// attempts at this looked like.
const SLUMP = compile([
  '....HHH.......',
  '...HHHHH......',
  '...MKMKM......',
  '....MKM.......',
  '....LL........',
  '..LLM.........',
  '..LMMMMM.L....',
  '..LKKKKM.L....',
  '..LMMMMMM.L...',
  '..LKKKKM..L...',
  '..LMMMM...L...',
  '..LLLLMMM.LL..',
  '........MMMMLL',
]);

// An ossuary course: a femur laid end-on with two skulls set into it, which is
// literally how the Paris catacombs are stacked. The wide-ledge variant.
//
// This slot held a standalone ribcage for three rounds and it never worked --
// bars on a post read as a ladder, and bowing the outline turned it into a bun.
// A ribcage only reads at this size as part of a figure, so it lives in SLUMP.
const STACK = compile([
  '.HHH.....HHH...',
  'HHHHH...HHHHH..',
  'MKMKM...MKMKM..',
  '.MKM.....MKM...',
  '.LL......LL....',
  'HH...........HH',
  'MMMMMMMMMMMMMMM',
  'LL...........LL',
]);

// A hand coming out of the stone. Every digit gets an empty column beside it,
// or the whole thing reads as a mitten.
const HAND = compile([
  '..H.H..',
  '..M.M.H',
  'H.M.M.M',
  'HMMMMMM',
  '.MMMMM.',
  '..LLL..',
]);

// Manacled wrist hanging from the UNDERSIDE. Six rows is the whole budget: the
// clear gap between ledges is FLOOR_H - PLAT_THICK = 23 and the player is 28,
// so he is already squeezing. Iron down to the cuff, bone below it -- the mass
// has to be bone, because hanging in the open bone sits at 10:1 against the
// backdrop where iron is barely 2:1.
const CHAIN = compile([
  '..II..',
  '..II..',
  'iIIIIi',
  '.MMMM.',
  '.MMMM.',
  '.M.M.M',
]);

// The shadow a thing casts into the lit lip it stands on. Bone is 232 luma and
// the lip (shade(platTop, 1.45) = #f7f7f7) is 247, so without this they merge --
// but painting this row near-black punches a hole in the landing line, which is
// the one row a player tracks at speed. Stone-coloured shadow instead: separates
// bone at ~4.8:1 and still obviously reads as the top of a platform.
function ground(ctx, x, y, w, th) {
  ctx.fillStyle = shade(th.platTop, 0.5);
  ctx.fillRect(x - 1, y - 1, w + 1, 1);
}

function vSkull(ctx, x, y, th) { ground(ctx, x, y, 5, th); blit(ctx, SKULL, x, y); }
function vCross(ctx, x, y, th) { ground(ctx, x, y, 9, th); blit(ctx, CROSS, x, y); }
function vSlump(ctx, x, y, th) { ground(ctx, x, y, 14, th); blit(ctx, SLUMP, x, y); }
function vStack(ctx, x, y, th) { ground(ctx, x, y, 15, th); blit(ctx, STACK, x, y); }
function vHand(ctx, x, y, th) { ground(ctx, x, y, 7, th); blit(ctx, HAND, x, y); }
function vChain(ctx, x, y) { blit(ctx, CHAIN, x, y - 13); }

// The existing DECOR.torches, unchanged, so the band's light does not change
// character. It is now one entry in the crypt rather than the whole of it.
function vTorch(ctx, x, y, th, t) {
  ctx.fillStyle = shade(th.platEdge, 1.5);
  ctx.fillRect(x, y, 1, 7);
  const flick = (Math.sin(t * 9 + x) + 1) * 0.5;
  ctx.fillStyle = flick > 0.5 ? '#ffcc44' : '#ff7722';
  ctx.fillRect(x - 1, y + 7, 3, 2);
  ctx.fillStyle = '#fff0b0';
  ctx.fillRect(x, y + 8, 1, 2);
}

// The crypt's pieces by name, each alone, shadow and all.
export const CRYPT_PIECES = {
  slump: vSlump, skull: vSkull, cross: vCross, stack: vStack, hand: vHand, chain: vChain, torch: vTorch,
};

// The same pieces as bare art -- the compiled runs, no shadow, drawn with blit() at the
// bottom-left corner -- for the placeholders in dungeon.js. The shadow into the lip is
// not part of a sprite: it lies below the surface, outside the element's box, so the
// runtime draws it (decor.js) from the element's `shadow` field.
export const CRYPT_ART = { slump: SLUMP, skull: SKULL, cross: CROSS, stack: STACK, hand: HAND, chain: CHAIN };
export { blit };

// Weights, not a uniform pick. The seated figure is the one that carries the
// band, so it gets the biggest share; the bare skull is the filler that has to
// stay common enough to feel like the default state of the place. Third column
// is the object's width, used to keep it inside its slot.
const TABLE = [
  [0.22, vSlump, 14],
  [0.20, vSkull, 5],
  [0.18, vHand, 7],
  [0.16, vCross, 9],
  [0.14, vStack, 15],
  [0.10, vChain, 6],
];

function cryptScene(ctx, x, y, w, th, r, t) {
  const n = w >= 70 ? 3 : w >= 46 ? 2 : 1;
  const span = (w - 8) / n;
  const used = [];
  let right = x;
  for (let i = 0; i < n; i++) {
    // Nothing twice on one ledge, and nothing wider than its slot. Two identical
    // hands on one platform is the moment a shaft of these becomes wallpaper.
    let pick = null;
    for (let k = 0; k < 6 && !pick; k++) {
      let p = r(), c = TABLE[TABLE.length - 1];
      for (const row of TABLE) { if (p < row[0]) { c = row; break; } p -= row[0]; }
      if (c[2] <= span + 1 && used.indexOf(c) < 0) pick = c;
    }
    if (!pick) continue;
    used.push(pick);
    const cx = Math.round(x + 4 + span * i + r() * Math.max(1, span - pick[2]));
    pick[1](ctx, cx, y, th, t);
    if (cx + pick[2] > right) right = cx + pick[2];
  }
  // The torch SHARES the band rather than being replaced by it: it is the only
  // light and the only motion down here, and every shipped crypt tileset has a
  // flame in it. Far end, and only if a skeleton has not already taken the space.
  if (right < x + w - 8 && r() < 0.45) vTorch(ctx, Math.round(x + w - 5), y, th, t);
}

export const DECOR = {
  none() {},

  crypt(ctx, x, y, w, th, r, t) { cryptScene(ctx, x, y, w, th, r, t); },

  // A basement, seen from inside the shaft. Cobwebs hang from the UNDERSIDE of the
  // ledge rather than sitting on top of it, which is both what actually happens in a
  // cellar and visually distinct from every other band, where things grow upward.
  //
  // Replaces the stack of little boxes that used to be here. Crates on a ledge in a
  // vertical shaft never made sense -- nobody stacked them there.
  cobwebs(ctx, x, y, w, th, r) {
    const n = w > 60 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const cx = Math.round(x + 4 + r() * Math.max(1, w - 8));
      const d = 5 + Math.floor(r() * 7);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#c8c4d8';
      // Two slack threads and the rungs between them.
      ctx.fillRect(cx, y - d, 1, d);
      ctx.fillRect(cx + 4, y - d + 2, 1, d - 2);
      for (let k = 2; k < d; k += 3) {
        ctx.fillRect(cx, y - k, 5 - Math.floor(k / 4), 1);
      }
      ctx.globalAlpha = 0.85;
      ctx.fillRect(cx + 1, y - d, 2, 1);
      ctx.globalAlpha = 1;
    }
    // The occasional drip mark on the lip.
    if (r() < 0.3) dripMark(ctx, Math.round(x + 3 + r() * (w - 6)), y, th);
  },

  torches(ctx, x, y, w, th, r, t) {
    const n = w > 40 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const cx = Math.round(x + 4 + r() * Math.max(1, w - 8));
      ctx.fillStyle = shade(th.platEdge, 1.5);
      ctx.fillRect(cx, y, 1, 7);
      const flick = (Math.sin(t * 9 + cx) + 1) * 0.5;
      ctx.fillStyle = flick > 0.5 ? '#ffcc44' : '#ff7722';
      ctx.fillRect(cx - 1, y + 7, 3, 2);
      ctx.fillStyle = '#fff0b0';
      ctx.fillRect(cx, y + 8, 1, 2);
    }
  },

  // The forest. Trunks rising out of the planks with a layered canopy on top.
  //
  // Deliberately tall and high-contrast: the forest BACKDROP is already a wall of green
  // trunks, so a small green sprout on a ledge disappears into it. A dark trunk and a
  // pale rim on the canopy are what separate the thing standing on the platform from
  // the scenery behind it.
  trees(ctx, x, y, w, th, r) {
    const n = w > 84 ? 3 : w > 48 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const cx = Math.round(x + 4 + r() * Math.max(1, w - 10));
      const h = 13 + Math.floor(r() * 12);
      ctx.fillStyle = '#231204';
      ctx.fillRect(cx - 1, y, 4, h);
      ctx.fillStyle = '#6b4520';
      ctx.fillRect(cx, y, 2, h);

      // Three stacked tiers, widest at the bottom.
      const base = 11 + Math.floor(r() * 5);
      for (let k = 0; k < 3; k++) {
        const cw = base - k * 3;
        const cy = y + h - 2 + k * 4;
        ctx.fillStyle = '#0d3a14';
        ctx.fillRect(cx - (cw >> 1) + 1, cy, cw, 5);
        ctx.fillStyle = k === 2 ? '#3fb247' : '#1f7a28';
        ctx.fillRect(cx - (cw >> 1) + 2, cy + 1, cw - 2, 3);
      }
      ctx.fillStyle = '#7de87a';
      ctx.fillRect(cx - 1, y + h + 10, 3, 1);
    }
    // Undergrowth along the lip.
    for (let i = x + 2; i < x + w - 2; i += 5) {
      if (r() > 0.5) continue;
      tuft(ctx, Math.round(i), y);
    }
  },

  reeds(ctx, x, y, w, th, r) {
    for (let i = x + 2; i < x + w - 2; i += 4) {
      if (r() > 0.5) continue;
      const h = 4 + Math.floor(r() * 6);
      ctx.fillStyle = '#6f8c3a';
      ctx.fillRect(Math.round(i), y, 1, h);
      ctx.fillStyle = '#9dbb55';
      ctx.fillRect(Math.round(i), y + h, 1, 1);
    }
    if (r() < 0.5 && w > 30) {
      const cx = Math.round(x + 4 + r() * (w - 8));
      ctx.fillStyle = '#e8d8c0';
      ctx.fillRect(cx, y, 1, 2);
      ctx.fillStyle = '#c4526b';
      ctx.fillRect(cx - 1, y + 2, 3, 2);
    }
  },

  lanterns(ctx, x, y, w, th, r, t) {
    const cx = Math.round(x + 3 + r() * Math.max(1, w - 6));
    ctx.fillStyle = shade(th.platEdge, 1.5);
    ctx.fillRect(cx, y, 1, 8);
    ctx.fillRect(cx, y + 8, 4, 1);
    const glow = (Math.sin(t * 3 + cx) + 1) * 0.5;
    ctx.fillStyle = glow > 0.5 ? '#ffe9a0' : '#ffcc55';
    ctx.fillRect(cx + 3, y + 5, 3, 3);
    if (w > 40) fence(ctx, Math.round(x + w - 8), y, th);
  },

  banners(ctx, x, y, w, th, r, t) {
    const cx = Math.round(x + 4 + r() * Math.max(1, w - 8));
    ctx.fillStyle = shade(th.platTop, 1.2);
    ctx.fillRect(cx, y, 1, 11);
    const sway = Math.round(Math.sin(t * 2 + cx));
    ctx.fillStyle = th.accent;
    ctx.fillRect(cx + 1 + sway, y + 4, 5, 7);
    ctx.fillStyle = shade(th.accent, 0.6);
    ctx.fillRect(cx + 1 + sway, y + 9, 5, 2);
  },

  rods(ctx, x, y, w, th, r, t) {
    const cx = Math.round(x + 4 + r() * Math.max(1, w - 8));
    ctx.fillStyle = shade(th.platTop, 1.1);
    ctx.fillRect(cx, y, 1, 10);
    if ((Math.sin(t * 7 + cx) + 1) * 0.5 > 0.82) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 1, y + 10, 3, 1);
      ctx.fillRect(cx, y + 11, 1, 3);
      ctx.fillRect(cx - 2, y + 12, 1, 2);
    }
  },

  bones(ctx, x, y, w, th, r) {
    const cx = Math.round(x + 3 + r() * Math.max(1, w - 8));
    ctx.fillStyle = '#d8d0bc';
    if (r() < 0.5) {
      ctx.fillRect(cx, y, 4, 4);
      ctx.fillStyle = '#2a2230';
      ctx.fillRect(cx + 1, y + 2, 1, 1);
      ctx.fillRect(cx + 3, y + 2, 1, 1);
    } else {
      ctx.fillRect(cx, y + 1, 6, 1);
      ctx.fillRect(cx - 1, y, 1, 3);
      ctx.fillRect(cx + 6, y, 1, 3);
    }
  },

  shards(ctx, x, y, w, th, r, t) {
    const n = 1 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const cx = Math.round(x + 3 + r() * Math.max(1, w - 6));
      const h = 5 + Math.floor(r() * 7);
      ctx.fillStyle = shade(th.accent, 0.8 + 0.4 * Math.sin(t * 2.5 + cx));
      ctx.fillRect(cx, y, 2, h);
      ctx.fillStyle = shade(th.platTop, 1.2);
      ctx.fillRect(cx, y + h, 2, 1);
    }
  },

  // Distinct from COSMOS: a tight constellation pinned above the ledge rather than a
  // single drifting orb, so the two star bands do not look like the same place twice.
  constellation(ctx, x, y, w, th, r, t) {
    const cx = Math.round(x + 4 + r() * Math.max(1, w - 8));
    const pts = [[0, 10], [4, 14], [-3, 16], [1, 19]];
    ctx.strokeStyle = shade(th.accent, 0.8);
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    pts.forEach(([dx, dy], i) => {
      const px = cx + dx;
      const py = y + dy;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    // lineWidth is never set in this file, so it inherits 1 -- a world unit, four to
    // eight screen pixels, as thick as the stars it joins. It is meant to be a thread.
    ctx.lineWidth = 1 / PX;
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.globalAlpha = 1;
    pts.forEach(([dx, dy], i) => {
      const tw = (Math.sin(t * 3 + i * 1.7 + cx) + 1) * 0.5;
      ctx.fillStyle = tw > 0.5 ? '#ffffff' : shade(th.accent, 1.1);
      ctx.fillRect(cx + dx, y + dy, 1, 1);
    });
  },

  orbs(ctx, x, y, w, th, r, t) {
    const cx = Math.round(x + 4 + r() * Math.max(1, w - 8));
    const bob = Math.round(Math.sin(t * 1.8 + cx) * 2);
    ctx.fillStyle = shade(th.accent, 1.1);
    ctx.fillRect(cx, y + 8 + bob, 3, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx + 1, y + 9 + bob, 1, 1);
    ctx.globalAlpha = 0.35;
    ctx.fillRect(cx - 1, y + 9 + bob, 1, 1);
    ctx.fillRect(cx + 3, y + 9 + bob, 1, 1);
    ctx.globalAlpha = 1;
  },

  beams(ctx, x, y, w, th, r, t) {
    const cx = Math.round(x + 4 + r() * Math.max(1, w - 8));
    ctx.globalAlpha = 0.28 + 0.16 * Math.sin(t * 2 + cx);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx, y, 3, 22);
    ctx.globalAlpha = 0.6;
    ctx.fillRect(cx + 1, y, 1, 14);
    ctx.globalAlpha = 1;
  },
};

// Bottom band to top band, matched to the twelve themes.
export const DECOR_BY_THEME = [
  'cobwebs',  // BASEMENT
  'crypt',    // DUNGEON
  'trees',    // FOREST
  'reeds',    // SWAMP
  'lanterns', // DOWNTOWN
  'banners',  // CITADEL
  'rods',     // STORM
  'bones',    // ABYSS
  'shards',   // NEBULA
  'orbs',     // COSMOS
  'constellation', // STARFIELD
  'beams',    // ZENITH
];

// How often a ledge carries any of this -- CHANCE_BY_THEME -- moved with the scenes: each
// zone module exports its own CHANCE, and decorpaint/index.js collects them in theme order.

// The three smallest bits, lifted out of the painters above unchanged so a placeholder can
// draw one alone: a scripted random stream can isolate a whole tree or web, but not the
// drip without its web, the tuft without its tree or the fence without its lantern.
function dripMark(ctx, x, y, th) {
  ctx.fillStyle = shade(th.platEdge, 1.3);
  ctx.fillRect(x, y, 1, 1);
}

function tuft(ctx, x, y) {
  ctx.fillStyle = '#0d3a14';
  ctx.fillRect(x, y, 3, 3);
  ctx.fillStyle = '#3fb247';
  ctx.fillRect(x, y, 2, 2);
}

function fence(ctx, fx, y, th) {
  ctx.fillStyle = shade(th.platBody, 1.3);
  ctx.fillRect(fx, y, 1, 5);
  ctx.fillRect(fx + 4, y, 1, 5);
  ctx.fillRect(fx, y + 3, 5, 1);
}

export const BITS = { dripMark, tuft, fence };

// --- placeholders ------------------------------------------------------------------
//
// How the zone modules draw one of the painters above into an element's box: a canvas
// the size of the box, in ART pixels, y down. inBox() gives the painter what it has always
// had -- world units, y UP, the ledge's walking surface at world y = 0 -- scaled by PX, so
// one old world unit is the 4 x 4 block of art pixels it always was on screen at zoom 1.
// Where the surface falls depends on the anchor: at the box's bottom edge for a thing that
// stands, PLAT_THICK units ABOVE the box for a thing that hangs (the box's top row is the
// ledge's underside), `lift` art pixels below it for a thing that floats. The painter's
// x = 0 lands `dx` art pixels in from the box's left edge -- a shift through the transform
// rather than through the painter, because the painters round x to whole world units.
//
// Anything a painter draws outside the box is cut off, as it would be from any sprite.

export function inBox(g, e, dx, draw) {
  const h = e.box[1];
  const surface = e.anchor === 'hang' ? -PLAT_THICK * PX : e.anchor === 'float' ? h + e.lift : h;
  g.save();
  g.translate(dx, surface);
  g.scale(PX, -PX);
  draw(g);
  g.restore();
}

/** A random stream that says what it is told, then 0.9 forever: one element, on demand. */
export function script(vals) {
  let i = 0;
  return () => (i < vals.length ? vals[i++] : 0.9);
}

/**
 * The time at which a painter animating as sin(omega * t + x) is a fraction `at` of the
 * way through frame f of `frames` -- so a placeholder frame is today's drawing at that
 * moment of its cycle, and the frames step through the cycle as the old painter swept it.
 */
export function tAt(omega, x, f, frames, at = 0.5) {
  return ((2 * Math.PI * (f + at)) / frames - x) / omega;
}

export function decorFor(themeIndex) {
  return DECOR[DECOR_BY_THEME[themeIndex] || 'none'] || DECOR.none;
}
