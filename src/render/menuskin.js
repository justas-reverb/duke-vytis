// The title screen's skin, and the skin of every screen reached from it: the Duke's own.
//
// WHAT THIS REPLACED. Everything in play had been painted in code at one art pixel per
// backing pixel -- the zone titles lettered in each zone's material, the HUD skinned per
// zone, the milestone callouts bevelled and glowing -- and the menu was the last screen still
// drawn the old way: the 5x7 font blown up in flat colour inside a two-unit black outline,
// four backing pixels to a "pixel", in 1px frames round flat dark panels. PRESS SPACE TO
// CLIMB was plain white text blinking on and off; the key hints were orange letters on a
// flat block with an orange underline; the selected row of GRAPHICS was a lighter rectangle.
// And every word but the title's floated straight over the attract run, so whatever the demo
// drew behind a word showed round it -- a companion's call box at the bottom of the screen
// printed its own two lines THROUGH the key hints.
//
// WHAT IT IS NOW. The menu is the Duke's, not a zone's: the attract run behind it climbs
// through a dozen zones and the menu has to hold over every one, so it takes no zone's
// material but the Vytis emblem's own tinctures -- gules, or and argent: the crimson of the
// field, the gold of the rim and the silver-white of the rider (shieldart.js's palette,
// opened out to ramps below). Painted plates with a bevelled gold frame, lettering at art
// resolution cut the way the callouts and the zone titles are cut:
//
//   * the big words (the title, the subtitle, PRESS SPACE TO CLIMB, the screens' headings)
//     are LETTERED -- the font as a skeleton, strokes grown round it and bevelled, polished
//     metal banded by height (titlepaint/util.js layoutWord, calloutpaint/kit.js bevelBody),
//     placed on the font's own grid so each lands where the same line in the font did;
//   * the small words (rows, labels, key hints, numbers) are the font itself, glyph for
//     glyph, inked and keylined by the kit's glyphInk -- the floaters' painter -- so they are
//     read at a glance and every word on screen is still one alphabet;
//   * keys are drawn as keycaps: a face, side walls and a front skirt, the legend cut in.
//
// Premium is restraint plus one moment of shine. What is not highlighted is quiet silver
// on dark; what is highlighted -- the title and its halo, PRESS SPACE TO CLIMB, the selected
// row, the active tab, the records -- is gold with a crisp bevel, and ONE thing at a time
// catches the light: a glint sweeps the prompt, or the title, or a sparkle sits on a record,
// on one shared clock (shine()), never two at once. Nothing blinks: the prompt breathes.
//
// NOTHING COVERS THE WORDS. The menu is drawn after the attract run (main.js), so nothing of
// the demo can be drawn over a word. What this adds is that nothing of it shows ROUND one
// either: every word sits on an opaque bed -- a lettered word on its outline and two pixels
// of night, a glyph on its keyline -- and every word over the demo on a painted plate whose
// field is opaque: the title's, the prompt's, the records' and key hints' plaque under it,
// the sound notice's tab, the guide's panel and its plaque under the stones and keys. A
// keyline alone covers a letter and nothing between two lines, and the demo's companion
// calls come up from the bottom of the screen in lines of their own. tools/test-menu.mjs
// proves it by drawing the same menu over the real demo and over a flat magenta screen and
// finding every pixel of every word, and of its bed, identical; every letter over the demo
// on a plate; and every word's pixels, in the finished frame, what that word put down.
//
// COST. Every plate, word and keycap is painted once, into a canvas, and drawn with one
// drawImage (a line of small text with one per character, as drawText was). The title
// screen's lower plaque, with its records and nine key hints, is drawn once more into a
// composite of its own (mCompose), so a quiet title-screen frame is 13 blits. The main
// menu's pieces are painted when this module loads, the other screens' one piece per
// title-screen frame after that (warmMenu), so opening OPTIONS or STATISTICS paints
// nothing; a piece asked for before it is painted is painted on the spot and counted
// (menuStats().late) -- the records' composite is, once, on the first title frame after a
// new best, since it holds the save file's numbers.
//
// NOT ONLY THE MENUS. Since 2026-09-29 this lettering is also the scoreboard's and the fall's
// words' (gameoverskin.js, screens.js drawGameOver and drawFallWords), the herald's lines'
// (hud.js) and the companions' calls' (Renderer.drawCompanionCalls): one alphabet from the
// title screen to the board. What those draw -- in play, in the fall, on the board, where no
// piece may be painted or first drawn from -- is painted at load (gameoverskin.js
// warmBoardLettering, through menuWarmNow), and every canvas here is brought up as it is
// painted (canvasOf).

import { PX, VW } from '../game/constants.js';
import { GLYPHS, CELL, textWidth, tracking } from './font.js';
import { Pix, pixToCanvas, mix } from './decorpaint/util.js';
import { layoutWord, dropShadow, halo, distOut, rgba } from './titlepaint/util.js';
import { glyphInk, bevelBody, lifted, glow } from './calloutpaint/kit.js';
import { emblemCanvas, EMB_WW, EMB_WH } from './emblem.js';
import { touchCanvas } from './canvases.js';

// --- the tinctures -----------------------------------------------------------------------
//
// Seven tones each, 0 the outline's ink up to 6 the highlight, as the kit's ramp7. Each is
// the emblem's own colours (shieldart.js PAL) opened out: its gold rim (#8b5d26 .. #e3b76c)
// carried up to the polished metal the callouts and the ZENITH title letter in, its field's
// reds (#300907 .. #7b130e) up to an enamel crimson, and its rider's warm silver (#39352f ..
// #e7dbd1) up to a white that stays warm -- the trail's WHITE is a cool blue-white and next
// to the emblem it read as another metal.

/** The near-black every keyline and bed is made of: the HUD plate's own. */
export const NIGHT = '#05030a';
export const OR = ['#2a1406', '#5a3310', '#8e5c1c', '#c28a32', '#e6b650', '#ffdc84', '#fff6d6'];
export const ARGENT = ['#1c1a17', '#3d3832', '#6e645a', '#9c9087', '#c4b8ae', '#e7dbd1', '#fbf7f2'];
export const GULES = ['#1c0506', '#3a0a0a', '#5e1210', '#8a1a14', '#b4281e', '#d8483a', '#f08a70'];
/**
 * The rising floor's red (hudpaint.js DANGER, #ff4d64 at tone 4), opened out the same way:
 * SPLAT is lettered in it, as CLIMB! is printed in it -- the one colour the player has
 * learned means the fire. The crimson above is the arms' field, a heraldic red darker than
 * the fire's, and says the Duke, not the danger.
 */
export const ROUGE = ['#1e0308', '#4c0915', '#8e1427', '#c9273d', '#ff4d64', '#ff8898', '#ffd0d8'];

/** The plates' fields: a crimson velvet for the title, a warm near-black for the rest. */
const VELVET = '#2c070b';
const VELVET_LINE = '#380b10';
const FIELD = '#140c13';
const FIELD_SHADOW = '#0a0609';
const SELECT_FIELD = '#4a0e0e';

/**
 * The small lettering's inks, by role: [deep, body, light, highlight], the face mostly the
 * light tone. Quiet roles for what is not highlighted, gold and text for what is. A role
 * that is a '#rrggbb' colour is a data colour kept from the old screens (a zone's accent,
 * the awards' green, a good or bad frame rate): players have learned those.
 */
const INKS = {
  label: [ARGENT[1], ARGENT[2], '#a39789', '#cbbfb4'],
  text: [ARGENT[2], ARGENT[4], ARGENT[5], ARGENT[6]],
  gold: [OR[1], OR[3], OR[5], OR[6]],
  crimson: [GULES[1], GULES[3], GULES[5], '#ffc2a8'],
  hint: [ARGENT[0], ARGENT[1], '#6a6158', '#857a70'],
  off: ['#100e0c', '#2a2622', '#3f3a35', '#4f4943'],
};
const dataInk = (c) => [mix(c, NIGHT, 0.55), mix(c, NIGHT, 0.2), c, mix(c, '#ffffff', 0.5)];

// --- the build ---------------------------------------------------------------------------

const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);
const cache = new Map();
const stats = { builds: 0, late: 0, pieces: [] };
let warming = false;

/** A painted piece, built the first time it is asked for; a build outside a warm-up is late. */
function asset(key, build) {
  const a = cache.get(key);
  if (a) return a;
  const t0 = now();
  const b = build();
  cache.set(key, b);
  stats.builds++;
  if (!warming) stats.late++;
  stats.pieces.push([key, now() - t0]);
  return b;
}

function canvasOf(p) {
  const c = document.createElement('canvas');
  // Whole numbers: a canvas size that is a heap double slows every headless frame after it.
  c.width = p.w | 0;
  c.height = p.h | 0;
  const g = c.getContext('2d');
  // A fresh canvas smooths by default; nothing here is ever scaled, and it must not blur.
  g.imageSmoothingEnabled = false;
  pixToCanvas(p, g);
  // Brought up now, in the painter's own time (canvases.js touchCanvas): a canvas is rastered
  // the first time it is drawn FROM. The menus were the only screens this lettering was on,
  // and a piece first drawn in a menu frame cost that frame nothing anyone felt; since the
  // scoreboard, the fall's words, the herald's lines and the companions' calls letter in it
  // too, a piece first drawn from in the fall or in play would be exactly the stall
  // tools/test-smooth.mjs forbids there.
  touchCanvas(c);
  return c;
}

// --- the probe, for tools/test-menu.mjs ---------------------------------------------------

let probe = null;
/** Start (true) or stop recording what the menu draws; returns the record. */
export function menuProbe(on) { probe = on ? [] : null; return probe; }
function report(kind, s, x0, y0, x1, y1, extra = null) { if (probe) probe.push({ kind, s, b: [x0, y0, x1, y1], ...extra }); }

// --- the keycaps on screen, for the touch controls (ui/touch.js) ---------------------------

let capWatch = null;
/** A keycap fainter than this is not on offer [alpha 0..1; 0.1]: the title's menu fading out. */
const CAP_SEEN = 0.1;
/**
 * From now on, collect into `set` the legend of every keycap drawn (null stops). main.js watches
 * each frame's drawing with it, and a phone gets those keys as buttons. A composite's keycaps are
 * counted each time it is blitted, as the probe counts them, and none while one is being built:
 * a piece painted ahead of its screen is not on the screen.
 */
export function watchCaps(set) { capWatch = set; }

/** Build counts: every piece is painted once, and none late once the warm-up has run. */
export function menuStats() {
  return { builds: stats.builds, late: stats.late, pieces: stats.pieces.slice(), cached: cache.size,
    pending: pending.length };
}
export function resetMenuStats() { stats.late = 0; }

// --- composites ------------------------------------------------------------------------
//
// The title screen's lower plaque holds the records and three rows of key hints: nine
// keycaps and some ninety characters of small text, each character a drawImage from its ink --
// about a hundred blits a frame for a picture that changes only when a run sets a record.
// It is drawn once, through the same calls, into a canvas of its own, and blitted whole.

const families = new Map();      // family -> the key of the composite it holds now
/**
 * Draw `draw(g)` -- ordinary menu calls, in view units -- once into a canvas covering the view
 * box (x, y, w, h), and blit that. `key` names what is in it; a new key in the same `family`
 * lets the old one go (the records composite, when a run sets a new best). What `draw`
 * reports to the probe is recorded with it and reported again each time it is blitted, so
 * the tools see every word and keycap where the screen draws them.
 */
export function mCompose(ctx, family, key, x, y, w, h, draw) {
  const full = `compose:${family}:${key}`;
  const was = families.get(family);
  if (was && was !== full) cache.delete(was);
  families.set(family, full);
  const a = asset(full, () => {
    const W = Math.round(w * PX), H = Math.round(h * PX);
    const c = document.createElement('canvas');
    c.width = W | 0;
    c.height = H | 0;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.setTransform(PX, 0, 0, PX, -Math.round(x * PX), -Math.round(y * PX));
    const outer = probe, rec = [], watch = capWatch;
    probe = rec;
    capWatch = null;
    try { draw(g); } finally { probe = outer; capWatch = watch; }
    touchCanvas(c);
    return { c, W, H, rec };
  });
  ctx.drawImage(a.c, 0, 0, a.W, a.H, Math.round(x * PX) / PX, Math.round(y * PX) / PX, a.W / PX, a.H / PX);
  if (probe) for (const e of a.rec) probe.push(e);
  if (capWatch && ctx.globalAlpha > CAP_SEEN) for (const e of a.rec) if (e.kind === 'keycap') capWatch.add(e.s);
}

// --- the shine clock ---------------------------------------------------------------------
//
// One cycle of SHINE_CYCLE seconds: the prompt's glint crosses it early in every cycle, and
// later in the cycle either the title's glint (even cycles) or a sparkle on a record (odd).
// Never two at once, so each is a moment, not a shimmer.

/** Seconds in one cycle of shine [s; 4.5]. */
const SHINE_CYCLE = 4.5;
/** [start, length] within the cycle of each moment [s]. */
const SHINE = { prompt: [0.35, 0.7], title: [2.4, 1.1], record: [2.5, 0.5] };

/** How far through its moment `what` is at clock t, 0..1, or -1 when it is not shining. */
export function shine(what, t) {
  const n = Math.floor(t / SHINE_CYCLE), u = t - n * SHINE_CYCLE;
  if (what === 'title' && n % 2) return -1;
  if (what === 'record' && !(n % 2)) return -1;
  const [a, len] = SHINE[what];
  return u >= a && u < a + len ? (u - a) / len : -1;
}
/** Which record the sparkle sits on this cycle (the cycles it shines in, counted). */
export const shineIndex = (t) => Math.floor(Math.floor(t / SHINE_CYCLE) / 2);

/** A slow breath, 0..1, eased at both ends: [period s]. */
export function breath(t, period) {
  return 0.5 - 0.5 * Math.cos((t / period) * Math.PI * 2);
}

/**
 * A glint: a slanted band of `img` (the same art with its metal a few tones up) drawn over
 * the art at art-pixel (X, Y), in strips of rows so the band leans like a reflection. The
 * band's left edge sits at screen art column `bx - (row - by) * SLANT`. Rows that hold
 * nothing of the art are skipped by the caller's `rows` ranges.
 *
 * The core is `band` wide, and a sheen GLINT_SHEEN times as wide round it is the same art at
 * GLINT_SHEEN_A first. A bare 22-pixel band crossing the prompt in 0.7 s was there in a strip
 * of frames and gone at a glance: a narrow hard stripe reads as a flicker. The sheen is the
 * same colours as the art, only lighter, so the alpha lands on gold, never on grey.
 */
const SLANT = 0.55;
const STRIP = 4;
/** The sheen round a glint's core: its width as a multiple of the core's, and its alpha. */
const GLINT_SHEEN = 2.6, GLINT_SHEEN_A = 0.45;
function glintBand(ctx, img, X, Y, w, h, bx, by, band, rows = [[0, h]]) {
  const was = ctx.globalAlpha;
  const wide = band * GLINT_SHEEN;
  for (const [left0, width, a] of [[bx - (wide - band) / 2, wide, GLINT_SHEEN_A], [bx, band, 1]]) {
    ctx.globalAlpha = was * a;
    for (const [r0, r1] of rows) {
      for (let y = r0; y < r1; y += STRIP) {
        const sh = Math.min(STRIP, r1 - y);
        const left = left0 - (Y + y + sh / 2 - by) * SLANT - X;
        const x0 = Math.max(0, Math.round(left)), x1 = Math.min(w, Math.round(left + width));
        if (x1 <= x0) continue;
        ctx.drawImage(img, x0, y, x1 - x0, sh, (X + x0) / PX, (Y + y) / PX, (x1 - x0) / PX, sh / PX);
      }
    }
  }
  ctx.globalAlpha = was;
}

// --- the small lettering -----------------------------------------------------------------

/** Every glyph the font has, space aside: the menus print ':', '/', '%', '(' and more. */
const CHARS = Object.keys(GLYPHS).filter((c) => c !== ' ').join('');
const CI = new Map([...CHARS].map((c, i) => [c, i]));
/** The keyline round a glyph [art px; 2 -- neighbours' keylines meet in the font's gap]. */
const KEY = 2;
const G1 = PX;                       // art px per font px at scale 1
const CW = 5 * G1 + 2 * KEY, CHH = 7 * G1 + 2 * KEY;

function inkCanvas(role) {
  return asset('ink:' + role, () => {
    const r = INKS[role] || dataInk(role);
    return canvasOf(glyphInk([r, r, r], { chars: CHARS, sizes: [G1], key: KEY }));
  });
}

/**
 * Text in one of the menu's inks, laid out exactly as font.js drawText lays out scale 1 --
 * the same advance and rounding -- so every line lands where it was. One drawImage per
 * character. `alpha` fades the letters only if `under` names the ink drawn whole beneath
 * them (a breathing line: its keyline never changes, so nothing behind shows through).
 */
export function mText(ctx, role, str, x, y, align = 'left', alpha = 1, under = null) {
  str = String(str).toUpperCase();
  const w = textWidth(str, 1);
  const px = align === 'center' ? Math.round(x - w / 2) : align === 'right' ? Math.round(x - w) : Math.round(x);
  const top = Math.round(y);
  const U = 1 / PX;
  const was = ctx.globalAlpha;
  for (const [role2, a] of under ? [[under, 1], [role, alpha]] : [[role, alpha]]) {
    const img = inkCanvas(role2);
    ctx.globalAlpha = was * a;
    for (let i = 0; i < str.length; i++) {
      const k = CI.get(str[i]);
      if (k === undefined) continue;
      ctx.drawImage(img, k * CW, 0, CW, CHH, px + i * CELL - KEY * U, top - KEY * U, CW * U, CHH * U);
    }
  }
  ctx.globalAlpha = was;
  report('text', str, px - KEY * U, top - KEY * U, px + w + KEY * U, top + 7 + KEY * U, { scale: 1 });
  return w;
}

// --- lettered lines ----------------------------------------------------------------------

/** Polished metal by height, as the GLORY callout and the ZENITH title shade their gold:
 *  pale where it catches the sky, a dark horizon across the middle, a reflection under it. */
function metal(ty, x, y) {
  const bands = [[0.14, 6], [0.4, 5], [0.49, 4], [0.55, 2], [0.8, 4], [2, 3]];
  for (let k = 0; k < bands.length; k++) {
    const [lim, t] = bands[k];
    if (ty < lim) {
      const next = bands[k + 1];
      if (next && lim - ty < 0.012 && ((x + y) & 1)) return next[1];
      return t;
    }
  }
  return 3;
}
/** Enamel: a flat colour, a tone up in its top band. */
const enamel = (ty) => (ty < 0.3 ? 5 : 4);

const STYLES = {
  gold: { ramp: OR, face: metal },
  argent: { ramp: ARGENT, face: metal },
  crimson: { ramp: GULES, face: enamel },
  danger: { ramp: ROUGE, face: enamel },
};
/** Room round a lettered line for its bed and shadow [art px]. */
const LPAD = 8;
/**
 * A lettered stroke's half-width as a share of the node spacing [0.56; 4.5 px at scale 2,
 * 9 at scale 4]. At K/2 - 0.5 a stroke was a pixel narrower than the font's own block, and
 * the scale-2 headings (STATISTICS, GRAPHICS) came out thin and spidery beside what they
 * replaced; the zone titles run 0.5 to 0.64.
 */
const STROKE = 0.56;

/**
 * A line lettered at art resolution on the font's grid (K = one font pixel), bevelled and
 * coloured in a style, on a bed: its outline, two pixels of opaque night, and a shadow down
 * and to the right. `glint` is the same letters three tones up and nothing else, for the
 * band a glint draws over them.
 */
function paintLine(str, scale, style, withGlow = null) {
  const K = scale * PX;
  const plan = layoutWord(str, { K, R: K * STROKE, advance: (CELL * scale + tracking(scale)) * PX,
    pad: [LPAD, LPAD, LPAD, LPAD], reach: 3 });
  const S = STYLES[style];
  const P = bevelBody(plan, { bevel: scale >= 4 ? 3 : 2, faceTone: S.face, edge: [6, 5, 4, 2, 1] });
  const ramps = { 1: S.ramp, 2: S.ramp, 3: S.ramp };
  const edges = { 1: S.ramp[0], 2: S.ramp[0], 3: S.ramp[0] };
  const p = P.toPix(ramps, edges);
  bed(p);
  const g = lifted(P, 3).toPix(ramps, null);
  return { c: canvasOf(p), glint: canvasOf(g), w: p.w, h: p.h, ax: LPAD, ay: LPAD, plan, withGlow };
}

/** What every lettered word stands on: two pixels of opaque night, then a soft shadow. */
function bed(p) {
  halo(p, NIGHT, 2, 1);
  dropShadow(p, NIGHT, [[2, 2, 0.6], [3, 3, 0.4], [4, 4, 0.22]]);
}

const lineKey = (str, scale, style) => `line:${style}:${scale}:${str}`;
function lineArt(str, scale, style) {
  return asset(lineKey(str, scale, style), () => paintLine(str, scale, style));
}

/**
 * A lettered line at the font's scale `scale`, placed as drawText would place the same line:
 * `align` against x, its font box's top on y. Positions are rounded to whole ART pixels, not
 * view units, so a bob moves it a pixel at a time. Returns the art-pixel top-left it drew at.
 */
export function mLine(ctx, style, str, x, y, scale = 2, align = 'left') {
  str = String(str).toUpperCase();
  const a = lineArt(str, scale, style);
  const w = textWidth(str, scale);
  const lx = align === 'center' ? Math.round(x - w / 2) : align === 'right' ? Math.round(x - w) : Math.round(x);
  const X = Math.round(lx * PX) - a.ax, Y = Math.round(y * PX) - a.ay;
  ctx.drawImage(a.c, 0, 0, a.w, a.h, X / PX, Y / PX, a.w / PX, a.h / PX);
  report('line', str, lx - 0.75, Math.round(y * PX) / PX - 0.75, lx + w + 0.75, Math.round(y * PX) / PX + 7 * scale + 0.75, { scale });
  return { X, Y, a };
}

// --- plates ------------------------------------------------------------------------------
//
// A plate is a silhouette (rectangles with chamfered corners, unioned -- a panel's title sits
// on a tab raised off its top rail), a frame made of a PROFILE -- one entry per pixel of depth
// in from the edge -- and an opaque field inside it. A profile entry is a flat colour, or
// [ramp, lit tone, shaded tone, facing]: facing 1 is an outer slope, lit on the plate's top
// and left rails and shaded on its bottom and right, facing -1 an inner slope, the other way
// round. Outer slopes, a crest, then inner slopes is a raised moulding lit from the upper left.

const PROFILES = {
  // The title's frame, sixteen pixels: a gold moulding rising from a dark outer edge to a
  // bright ridge and falling away inside it, a dark reveal, a crimson bead, night. The first
  // cut was eleven pixels of mostly pale gold, and at 1x it read as a thin yellow line round
  // a very large plate -- a picture frame, not a made thing.
  title: [NIGHT, [OR, 3, 1, 1], [OR, 4, 2, 1], [OR, 5, 2, 1], [OR, 6, 3, 1], [OR, 5, 3, 1], [OR, 4, 4, 1],
    [OR, 3, 5, -1], [OR, 2, 4, -1], [OR, 1, 3, -1], '#1a0a06', [GULES, 4, 2, 1], [GULES, 5, 2, 1],
    [GULES, 3, 1, -1], '#12040a'],
  // A panel's: a gold bead lit on its outer slope, shaded inside, a reveal. Two view units, so
  // the bevel is still a bevel at 1x.
  panel: [NIGHT, [OR, 3, 1, 1], [OR, 5, 2, 1], [OR, 4, 3, 1], [OR, 2, 4, -1], [OR, 1, 3, -1], '#0a0508'],
  // The lower plaque under the title screen's keys: the panel's bead with a crimson line in it.
  lower: [NIGHT, [OR, 3, 1, 1], [OR, 5, 2, 1], [OR, 6, 3, 1], [OR, 3, 4, -1], [OR, 2, 3, -1], '#1a0a06',
    [GULES, 4, 2, 1], [GULES, 3, 1, -1], '#0c0408'],
  // A selected row and an active tab: a gold rim round crimson enamel.
  select: [NIGHT, [OR, 4, 2, 1], [OR, 6, 3, 1], [OR, 3, 5, -1], [OR, 1, 3, -1]],
  // A badge under one line of small text: the panel's bead at its thinnest, one view unit.
  badge: [NIGHT, [OR, 4, 2, 1], [OR, 2, 4, -1], '#0a0508'],
};

/**
 * Paint a plate W x H art px. `rects` is its silhouette ([x, y, w, h, chamfer], unioned);
 * `style` names its profile and field.
 */
function paintPlate(W, H, style, rects) {
  const n = W * H;
  const mask = new Uint8Array(n);
  for (const [rx, ry, rw, rh, c] of rects) {
    for (let y = ry; y < ry + rh; y++) {
      for (let x = rx; x < rx + rw; x++) {
        const u = x - rx, v = y - ry, iu = rw - 1 - u, iv = rh - 1 - v;
        if (u + v < c || iu + v < c || u + iv < c || iu + iv < c) continue;
        mask[y * W + x] = 1;
      }
    }
  }
  // Distance to the outside, straight up, down, left and right.
  const up = new Int16Array(n), dn = new Int16Array(n), lf = new Int16Array(n), rt = new Int16Array(n);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!mask[i]) continue;
    up[i] = y > 0 && mask[i - W] ? up[i - W] + 1 : 0;
    lf[i] = x > 0 && mask[i - 1] ? lf[i - 1] + 1 : 0;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x;
    if (!mask[i]) continue;
    dn[i] = y < H - 1 && mask[i + W] ? dn[i + W] + 1 : 0;
    rt[i] = x < W - 1 && mask[i + 1] ? rt[i + 1] + 1 : 0;
  }
  const prof = PROFILES[style];
  const D = prof.length;
  const p = new Pix(W, H), gl = new Pix(W, H);
  const pd = p.data, gd = gl.data;
  // Colours resolved once, written straight into the buffers: a big panel is a million
  // pixels, and a colour looked up per pixel was most of its paint time.
  const put = (buf, i, c) => { const o = i * 4; buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; buf[o + 3] = 255; };
  const rows = prof.map((e) => (typeof e === 'string' ? { flat: rgba(e) }
    : { lit: rgba(e[0][e[1]]), shade: rgba(e[0][e[2]]), litG: rgba(e[0][Math.min(6, e[1] + 2)]),
      shadeG: rgba(e[0][Math.min(6, e[2] + 2)]), out: e[3] > 0 }));
  const fields = new Map();
  let glints = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!mask[i]) continue;
    const a = Math.min(up[i], lf[i]), b = Math.min(dn[i], rt[i]);
    const d = Math.min(a, b);
    if (d < D) {
      const e = rows[d];
      if (e.flat) { put(pd, i, e.flat); continue; }
      const lit = (a <= b) === e.out;
      put(pd, i, lit ? e.lit : e.shade);
      put(gd, i, lit ? e.litG : e.shadeG);
      glints++;
      continue;
    }
    const col = fieldOf(style, x, y, d - D, up[i] - D, lf[i] - D, dn[i] - D);
    let c = fields.get(col);
    if (!c) fields.set(col, (c = rgba(col)));
    put(pd, i, c);
    // A selected row's glint crosses its enamel as well as its rim: on the rim alone it was
    // a few specks along two one-pixel lines, and nobody saw the row catch the light. The
    // lighter enamel is the same crimson toward its lit tone, so the sheen stays red.
    if (style === 'select') {
      const k = 'g' + col;
      let g = fields.get(k);
      if (!g) fields.set(k, (g = rgba(mix(col, GULES[5], 0.45))));
      put(gd, i, g);
    }
  }
  return { p, gl: glints ? gl : null, mask };
}

/** The field inside a frame, `d` px in from it (`u`, `l` from its top and left inner edges). */
function fieldOf(style, x, y, d, u, l, dd) {
  if (style === 'select') {
    // Raised enamel, deep: its top row catching the light, its foot in shadow. The first cut
    // was a bright red slab (#8a1a14 on) -- the loudest thing on the screen, louder than the
    // gold words standing on it.
    return u === 0 ? GULES[3] : dd <= 1 ? GULES[1] : u < 3 ? GULES[2] : SELECT_FIELD;
  }
  // Recessed: the frame casts two pixels of shadow on the field under its top and left rails.
  const shadow = u < 2 || l < 2;
  if (style === 'title') {
    if (shadow) return '#1c0407';
    // A crimson velvet with a faint lozenge in it, the brocade of a herald's hanging.
    return ((x + y) % 24 === 0 || (x - y + 2400) % 24 === 0) ? VELVET_LINE : VELVET;
  }
  return shadow ? FIELD_SHADOW : FIELD;
}

/**
 * A jewel set in gold over a corner of the title's moulding: a gold bezel shaded from its
 * silhouette and lit upper left, a crimson cabochon in it with a highlight, night round all.
 * The first cut put plain gold bosses six pixels across there; at 1x they were specks.
 */
function jewel(p, cx, cy, r, stone = r - 3) {
  const lim = r * r + 0.8 * r, lim2 = (r + 1) * (r + 1) + 0.8 * (r + 1), limS = stone * stone + 0.8 * stone;
  for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) {
    const q = x * x + y * y;
    if (q > lim2) continue;
    if (q > lim) { p.set(cx + x, cy + y, NIGHT); continue; }
    const l = (x / r) * -0.6 + (y / r) * -0.8;
    if (q <= limS) {
      // The stone: dome-lit, darkest low right, a rim of shadow where it meets the bezel.
      const ls = (x / stone) * -0.6 + (y / stone) * -0.8;
      const t = q > limS - 2 * stone ? 1 : ls > 0.5 ? 5 : ls > 0.1 ? 4 : ls > -0.4 ? 3 : 2;
      p.set(cx + x, cy + y, GULES[t]);
      continue;
    }
    const t = l > 0.55 ? 6 : l > 0.2 ? 5 : l > -0.2 ? 4 : l > -0.55 ? 3 : 2;
    p.set(cx + x, cy + y, OR[t]);
  }
  const hx = cx - Math.round(stone * 0.4), hy = cy - Math.round(stone * 0.45);
  p.set(hx, hy, '#ffffff');
  p.set(hx + 1, hy, GULES[6]);
  p.set(hx, hy + 1, GULES[6]);
}

/** Styles a glint crosses; the rest keep no glint canvas. */
const GLINTS = new Set(['title', 'select']);

/** A plate asset: its canvas, its glint canvas (frame only, metal up two tones), its size. */
function plateArt(key, W, H, style, rects, extra = null) {
  return asset(key, () => {
    const { p, gl } = paintPlate(W | 0, H | 0, style, rects || [[0, 0, W | 0, H | 0, 3]]);
    if (extra) extra(p, gl);
    return { c: canvasOf(p), glint: gl && GLINTS.has(style) ? canvasOf(gl) : null, w: W | 0, h: H | 0 };
  });
}

function drawArt(ctx, a, x, y) {
  ctx.drawImage(a.c, 0, 0, a.w, a.h, x, y, a.w / PX, a.h / PX);
}

// --- the title -----------------------------------------------------------------------------

/** How far the title's halo reaches out from the plate [art px; 36, the old nine rings]. */
const HALO = 36;

function titlePlate(b) {
  const W = b.w * PX, H = b.h * PX;
  return plateArt(`plate:title:${W}x${H}`, W, H, 'title', [[0, 0, W, H, 4]], (p, gl) => {
    // A jewel over each corner of the moulding, and one in the middle of the top and bottom
    // rails: the frame reads as a made thing, as the old corner studs meant it to.
    const J = 10;
    for (const [x, y] of [[J, J], [W - 1 - J, J], [J, H - 1 - J], [W - 1 - J, H - 1 - J]]) {
      jewel(p, x, y, J - 1);
      jewel(gl, x, y, J - 1);
    }
    for (const y of [7, H - 8]) {
      jewel(p, W >> 1, y, 6, 3);
      jewel(gl, W >> 1, y, 6, 3);
    }
  });
}

/**
 * The halo round the title plate: stepped, dithered rings of deep gold (a pale glow thinned
 * over a coloured sky lands on grey), from the plate's own silhouette out HALO px. Cut into
 * four strips round the plate, so no frame blends a plate's worth of transparent pixels.
 */
function titleHalo(b) {
  const W = b.w * PX, H = b.h * PX;
  return asset(`halo:title:${W}x${H}`, () => {
    const TW = W + 2 * HALO, TH = H + 2 * HALO;
    const p = new Pix(TW, TH);
    // The plate's silhouette, to measure from.
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = x, v = y, iu = W - 1 - x, iv = H - 1 - y;
      if (u + v < 4 || iu + v < 4 || u + iv < 4 || iu + iv < 4) continue;
      p.data[((y + HALO) * TW + x + HALO) * 4 + 3] = 255;
    }
    const d = distOut(p, 1.414, 128);
    // Deep, saturated golds, strongest against the frame and falling off fast: the first cut's
    // paler gold at 0.5 over a dark sky came out a muddy brown band round the plate.
    const cols = ['#ffb42e', '#f7a024', '#ec8a1a', '#de7414', '#cc5e10', '#b44a0c'].map(rgba);
    const alphas = [0.58, 0.38, 0.24, 0.14, 0.08, 0.04];
    const q = new Pix(TW, TH);
    for (let i = 0; i < TW * TH; i++) {
      if (!d[i]) continue;
      const x = i % TW, y = (i / TW) | 0;
      const r = d[i] + (((x + y) & 1) ? 0.9 : -0.9);
      const k = Math.floor((r - 0.5) / (HALO / 6));
      if (k < 0 || k >= alphas.length) continue;
      const c = cols[k];
      q.data[i * 4] = c[0]; q.data[i * 4 + 1] = c[1]; q.data[i * 4 + 2] = c[2];
      q.data[i * 4 + 3] = Math.round(255 * alphas[k]);
    }
    const cut = (x, y, w, h) => {
      const s = new Pix(w, h);
      for (let j = 0; j < h; j++) s.data.set(q.data.subarray(((y + j) * TW + x) * 4, ((y + j) * TW + x + w) * 4), j * w * 4);
      return { c: canvasOf(s), x, y, w, h };
    };
    return [cut(0, 0, TW, HALO), cut(0, TH - HALO, TW, HALO), cut(0, HALO, HALO, H), cut(TW - HALO, HALO, HALO, H)];
  });
}

/**
 * The title: the halo breathing round a crimson plaque in a gold moulding; DUKE and VYTIS in
 * polished gold either side of the arms, the subtitle in argent; all three bobbing a pixel at
 * a time inside a frame that does not move. Every number is headerBox()'s.
 */
export function mTitle(ctx, b, t, bob, words) {
  const halos = titleHalo(b);
  const was = ctx.globalAlpha;
  // The old halo breathed with the same period (sin(1.7t)) between 0.58 and 1 of itself.
  ctx.globalAlpha = was * (0.58 + 0.42 * breath(t, (Math.PI * 2) / 1.7));
  const X0 = b.x * PX - HALO, Y0 = b.y * PX - HALO;
  for (const h of halos) ctx.drawImage(h.c, 0, 0, h.w, h.h, (X0 + h.x) / PX, (Y0 + h.y) / PX, h.w / PX, h.h / PX);
  ctx.globalAlpha = was;
  const plate = titlePlate(b);
  drawArt(ctx, plate, b.x, b.y);
  report('plate', 'title', b.x, b.y, b.x + b.w, b.y + b.h, { chamfer: 4 });

  const L = mLine(ctx, 'gold', words.left, b.wordL.x0, b.titleTop + bob, 4, 'left');
  const R = mLine(ctx, 'gold', words.right, b.wordR.x1, b.titleTop + bob, 4, 'right');
  // The arms, placed in whole ART pixels so they bob with the words; drawEmblem would round
  // them to whole view units and they would jump four pixels at a time beside the letters.
  const ex = Math.round((b.emblem.cx - EMB_WW / 2) * PX), ey = Math.round((b.emblem.cy + bob - EMB_WH / 2) * PX);
  ctx.drawImage(emblemCanvas(), ex / PX, ey / PX, EMB_WW, EMB_WH);
  report('emblem', 'emblem', ex / PX, ey / PX, ex / PX + EMB_WW, ey / PX + EMB_WH);
  mLine(ctx, 'argent', words.sub, VW / 2, b.subTop + bob, 2, 'center');

  const u = shine('title', t);
  if (u >= 0) {
    // One band crossing the whole plaque, rails and words alike, left to right.
    const BAND = 30;
    const px0 = b.x * PX, py0 = b.y * PX;
    const span = plate.w + BAND + plate.h * SLANT;
    const bx = px0 - BAND + u * span, by = py0;
    const rail = 22;
    glintBand(ctx, plate.glint, px0, py0, plate.w, plate.h, bx, by, BAND, [[0, rail], [plate.h - rail, plate.h]]);
    for (const w of [L, R]) glintBand(ctx, w.a.glint, w.X, w.Y, w.a.w, w.a.h, bx, by, BAND);
  }
}

// --- PRESS SPACE TO CLIMB ------------------------------------------------------------------
//
// The hero of the screen. PRESS and TO CLIMB lettered in polished gold on the font's grid,
// SPACE drawn as the key itself -- a wide argent keycap, its legend cut into the face in
// crimson -- standing where the word stood. A deep amber glow round the whole line breathes
// (the old prompt blinked on and off, and for a fifth of every cycle there was no prompt at
// all); a glint crosses it once a cycle. One canvas for the line, one for its glow.

export const PROMPT = 'PRESS SPACE TO CLIMB';
/** Which characters of the prompt the keycap stands in for. */
const KEY_AT = [6, 11];
/** The keycap, in art px round its word's font box: how far it reaches out each side, above
 *  and below [art px; 12 = 3 view units, 8 = 2]. */
const CAP_X = 12, CAP_UP = 8, CAP_DN = 8;
/** The legend's node spacing [art px; 6 -- three quarters of the words' 8]. */
const LEGEND_K = 6;
/**
 * The glow's rings [art px each] and alphas: GLORY's deep golds. Three rings to 0.55 made a
 * breath you could find in a strip of frames and not at a glance at the screen; a fourth ring
 * and a stronger first one fill the field's air round the letters as it swells.
 */
const GLOW_COLS = ['#ffb030', '#f09a1c', '#d8780e', '#b0500a'];
const GLOW_A = [0.66, 0.44, 0.26, 0.12];
const GLOW_STEP = 3;
/** The breath: its period [s; 2.6] and the glow's alpha at its bottom [0.3]. */
const BREATH = 2.6, BREATH_LOW = 0.3;
/**
 * The prompt's plaque, in view units from the line's font box (its left and top): fourteen
 * units out each side, six above, six under, its ends cut at a long bevel. The first cut
 * floated the line over the demo on its own two-pixel bed, and in a real frame the bot's
 * trail and a landing's shockwave ring passed between PRESS's letters, in the gaps the bed
 * does not fill: the one line that must read in half a second was the one with the demo
 * running through it. Seven above and seven under: at six the keycap all but touched the
 * rims.
 */
export const PROMPT_PLATE = { dx: -14, dy: -7, w: 304, h: 28, chamfer: 16, style: 'lower' };

/**
 * The walls of a keycap [art px]: its top, its sides and its front skirt, for the hero's key
 * (72 px tall) and a key hint's (44). A real key seen from a little above and in front shows
 * a thin top wall, two side walls and a deep front skirt round a smaller face, the walls
 * meeting at mitred corners; that trapezoid of walls is what says "key".
 */
const CAP_BIG = { top: 3, side: 6, skirt: 13, chamfer: 4 };
const CAP_SMALL = { top: 2, side: 3, skirt: 6, chamfer: 2 };

/**
 * A keycap `w` x `h` art px into `p` at (x0, y0), in argent, and a contact shadow on its last
 * row. Returns the face's box, for the legend.
 *
 * The first cut was a rectangle with a lit top row and a dark skirt under a flat face -- a
 * pale LABEL with SPACE printed on it, at 1x and at 3x. Each pixel now belongs to the wall
 * whose width it is the smallest share of, which mitres the corners from the outline in to
 * the face: the top wall catches the light, the left is lit, the right and the skirt turn
 * away from it. The face is dished -- its rear lip a tone into shadow, its front edge rolling
 * over into the skirt as the brightest line on the key -- because a flat face over walls read
 * as a box lid, not a key you press.
 */
function keycap(p, x0, y0, w, h, lift = 0) {
  const { top: WT, side: WS, skirt: WB, chamfer: c } = h > 50 ? CAP_BIG : CAP_SMALL;
  const T = (k) => ARGENT[Math.max(0, Math.min(6, k + lift))];
  const H = h - 1;                                   // the last row is the contact shadow
  const inSil = (x, y) => {
    const u = x - x0, v = y - y0, iu = x0 + w - 1 - x, iv = y0 + H - 1 - y;
    return u >= 0 && v >= 0 && iu >= 0 && iv >= 0 && u + v >= c && iu + v >= c && u + iv >= c && iu + iv >= c;
  };
  const fx0 = x0 + 1 + WS, fx1 = x0 + w - 2 - WS, fy0 = y0 + 1 + WT, fy1 = y0 + H - 2 - WB;
  for (let x = x0 + c + 1; x < x0 + w - 1 - c; x++) p.set(x, y0 + H, NIGHT, 0.55);
  for (let y = y0; y < y0 + H; y++) for (let x = x0; x < x0 + w; x++) {
    if (!inSil(x, y)) continue;
    if (!inSil(x - 1, y) || !inSil(x + 1, y) || !inSil(x, y - 1) || !inSil(x, y + 1)) { p.set(x, y, NIGHT); continue; }
    const sl = (x - x0 - 1 + 0.5) / WS, sr = (x0 + w - 2 - x + 0.5) / WS;
    const st = (y - y0 - 1 + 0.5) / WT, sb = (y0 + H - 2 - y + 0.5) / WB;
    const s = Math.min(sl, sr, st, sb);
    let k;
    if (s >= 1) {
      // The face, dished: the rear lip in shadow, the front edge rolled over into the light.
      if (y === fy1) k = 6;
      else if (y === fy0 || x === fx0) k = 4;
      else k = 5;
    } else if (s === st) k = y === y0 + 1 ? 5 : 6;             // the top wall, facing the sky
    else if (s === sl) k = x === x0 + 1 ? 4 : 5;               // the left wall, lit
    else if (s === sr) k = x === x0 + w - 2 ? 2 : 3;           // the right wall, shaded
    else k = y >= y0 + H - 2 - Math.floor(WB * 0.4) ? 2 : 3;   // the skirt, darker to its foot
    p.set(x, y, T(k));
  }
  return { x: fx0, y: fy0, w: fx1 - fx0 + 1, h: fy1 - fy0 + 1 };
}

/**
 * A legend inlaid in a keycap's face in crimson enamel: every font pixel of `str` as a block
 * of `g` px, a tone deeper along each stroke's upper-left edge (the wall of the cut in
 * shadow) and a tone lighter along its lower-right.
 *
 * The first cut also lit the face pixel under every stroke's foot in white, as a cut's lower
 * edge catches the light; at the font's scale that was a white fringe under every bar of
 * every letter, and the small keys' legends read as red letters with white specks.
 */
function engrave(p, str, cx, cy, g) {
  const w = textWidth(str, 1) * g, h = 7 * g;
  const x0 = Math.round(cx - w / 2), y0 = Math.round(cy - h / 2);
  const on = new Set();
  [...str].forEach((ch, i) => {
    const rows = GLYPHS[ch];
    if (!rows) return;
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
      if (rows[r][c] !== '#') continue;
      for (let v = 0; v < g; v++) for (let u = 0; u < g; u++) on.add((x0 + (i * 6 + c) * g + u) + ',' + (y0 + r * g + v));
    }
  });
  const is = (x, y) => on.has(x + ',' + y);
  for (const k of on) {
    const [x, y] = k.split(',').map(Number);
    const tl = !is(x, y - 1) || !is(x - 1, y), br = !is(x, y + 1) || !is(x + 1, y);
    p.set(x, y, tl ? GULES[2] : br ? GULES[4] : GULES[3]);
  }
}

/** A lettered legend (for the hero's SPACE), strokes K px apart, inlaid in crimson. */
function engraveLettered(p, str, cx, cy, K, mask = null) {
  const plan = layoutWord(str, { K, R: K / 2, advance: (CELL + 1) * K, pad: [0, 0, 0, 0], reach: 2 });
  const x0 = Math.round(cx - plan.w / 2), y0 = Math.round(cy - plan.inkH / 2);
  const { w, h, d, R } = plan;
  const inS = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[y * w + x] <= R;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inS(x, y)) continue;
    const tl = !inS(x, y - 1) || !inS(x - 1, y), br = !inS(x, y + 1) || !inS(x + 1, y);
    p.set(x0 + x, y0 + y, tl ? GULES[2] : br ? GULES[4] : GULES[3]);
    if (mask) mask[(y0 + y) * p.w + x0 + x] = 1;
  }
}

/**
 * What a prompt is: its line, which of its characters the keycap stands in for, the key's
 * legend, and the field its glow may light -- [x0, y0, x1, y1] in art px from the line's font
 * box's top left, the inside of whatever plate it stands on. The title screen's is below;
 * the scoreboard's SPACE TO CLIMB AGAIN is another (gameoverskin.js BOARD_PROMPT), on the
 * board's key panel, and is the same make so that the two screens that ask for SPACE ask alike.
 */
function promptSpec(key, text, keyAt, legend, field) {
  return { key, text, keyAt, legend, field };
}
const TITLE_PROMPT = (() => {
  const rim = PROFILES[PROMPT_PLATE.style].length;
  const fx0 = PROMPT_PLATE.dx * PX + rim, fy0 = PROMPT_PLATE.dy * PX + rim;
  return promptSpec('prompt', PROMPT, KEY_AT, 'SPACE',
    [fx0, fy0, fx0 + PROMPT_PLATE.w * PX - 2 * rim, fy0 + PROMPT_PLATE.h * PX - 2 * rim]);
})();
/**
 * A prompt for another screen: `text` at scale 2 with the keycap over characters `keyAt`
 * ([from, to)) bearing `legend`, its glow cut to `field` (view units from the line's font box).
 */
export function mPromptSpec(text, keyAt, legend, field) {
  return promptSpec('prompt:' + text, text, keyAt, legend, field.map((v) => Math.round(v * PX)));
}

function promptArt(spec = TITLE_PROMPT) {
  return asset(spec.key, () => {
    const scale = 2, K = scale * PX;
    const adv = (CELL * scale + tracking(scale)) * PX;
    const [k0, k1] = spec.keyAt;
    const words = [...spec.text].map((ch, i) => (i >= k0 && i < k1 ? ' ' : ch)).join('');
    const PAD = LPAD + GLOW_STEP * GLOW_A.length + 2;
    const plan = layoutWord(words, { K, R: K * STROKE, advance: adv, pad: [PAD, PAD, PAD, PAD], reach: 3 });
    const S = STYLES.gold;
    const P = bevelBody(plan, { bevel: 2, faceTone: S.face, edge: [6, 5, 4, 2, 1] });
    const ramps = { 1: S.ramp, 2: S.ramp, 3: S.ramp }, edges = { 1: S.ramp[0], 2: S.ramp[0], 3: S.ramp[0] };
    const p = P.toPix(ramps, edges);
    const gl = lifted(P, 3).toPix(ramps, null);
    // The key, over the slot its word had.
    const kx0 = PAD + k0 * adv - CAP_X, kx1 = PAD + (k1 - 1) * adv + 5 * K + CAP_X;
    const ky0 = PAD - CAP_UP, kh = 7 * K + CAP_UP + CAP_DN;
    const f = keycap(p, kx0, ky0, kx1 - kx0, kh);
    const legend = new Uint8Array(p.w * p.h);
    engraveLettered(p, spec.legend, f.x + f.w / 2, f.y + f.h / 2, LEGEND_K, legend);
    const fg = keycap(gl, kx0, ky0, kx1 - kx0, kh, 1);
    engraveLettered(gl, spec.legend, fg.x + fg.w / 2, fg.y + fg.h / 2, LEGEND_K);
    bed(p);
    // The glow: rings round the letters, the key and their bed, then everything but the rings
    // taken out again, so it can be drawn under them at any strength -- and cut to the
    // plaque's field, so it lights the field and never the frame round it.
    const q = new Pix(p.w, p.h);
    q.data.set(p.data);
    glow(q, GLOW_COLS, GLOW_A, GLOW_STEP);
    const [fx0, fy0, fx1, fy1] = spec.field.map((v) => v + PAD);
    for (let i = 0; i < p.w * p.h; i++) {
      const x = i % p.w, y = (i / p.w) | 0;
      if (p.data[i * 4 + 3] || x < fx0 || x >= fx1 || y < fy0 || y >= fy1) q.data[i * 4 + 3] = 0;
    }
    // Which pixels are LETTER (the gold strokes) and which are the key's legend, kept for the
    // tools that measure how the prompt reads (tools/test-menu.mjs), as the callouts keep theirs.
    return { c: canvasOf(p), glint: canvasOf(gl), glow: canvasOf(q), w: p.w, h: p.h, ax: PAD, ay: PAD,
      key: [kx0 - PAD, ky0 - PAD, kx1 - PAD, ky0 + kh - PAD], letters: P.mat, legend };
  });
}

/** A painted piece by its key ('prompt', 'plate:...'), for the tools; null if not painted. */
export const menuPiece = (key) => cache.get(key) || null;

function promptPlate() {
  const { w, h, chamfer, style } = PROMPT_PLATE;
  const W = w * PX, H = h * PX;
  return plateArt(`plate:${style}:${W}x${H}:c${chamfer}`, W, H, style, [[0, 0, W, H, chamfer]]);
}

/** PRESS SPACE TO CLIMB, centred on x with its font box's top on y (170 on the title screen). */
export function mPrompt(ctx, x, y, t) {
  const a = promptArt();
  const w = textWidth(PROMPT, 2);
  const lx = Math.round(x - w / 2);
  const pl = promptPlate();
  drawArt(ctx, pl, lx + PROMPT_PLATE.dx, y + PROMPT_PLATE.dy);
  report('plate', 'prompt', lx + PROMPT_PLATE.dx, y + PROMPT_PLATE.dy,
    lx + PROMPT_PLATE.dx + PROMPT_PLATE.w, y + PROMPT_PLATE.dy + PROMPT_PLATE.h, { chamfer: PROMPT_PLATE.chamfer });
  promptLine(ctx, TITLE_PROMPT, a, lx, y, t);
}

/**
 * A prompt of another screen's (mPromptSpec) on whatever plate that screen stands it on,
 * centred on x with its font box's top on y: the glow breathing under it, the line, and the
 * glint on the shared clock (shine('prompt')), as the title screen's.
 */
export function mPromptOn(ctx, spec, x, y, t) {
  const a = promptArt(spec);
  const lx = Math.round(x - textWidth(spec.text, 2) / 2);
  promptLine(ctx, spec, a, lx, y, t);
}

function promptLine(ctx, spec, a, lx, y, t) {
  const w = textWidth(spec.text, 2);
  const X = lx * PX - a.ax, Y = Math.round(y * PX) - a.ay;
  const was = ctx.globalAlpha;
  ctx.globalAlpha = was * (BREATH_LOW + (1 - BREATH_LOW) * breath(t, BREATH));
  ctx.drawImage(a.glow, 0, 0, a.w, a.h, X / PX, Y / PX, a.w / PX, a.h / PX);
  ctx.globalAlpha = was;
  ctx.drawImage(a.c, 0, 0, a.w, a.h, X / PX, Y / PX, a.w / PX, a.h / PX);
  const u = shine('prompt', t);
  if (u >= 0) {
    const BAND = 22;
    const span = a.w + BAND + a.h * SLANT;
    glintBand(ctx, a.glint, X, Y, a.w, a.h, X - BAND + u * span, Y, BAND);
  }
  report('line', spec.text, lx - 0.75, y - 0.75, lx + w + 0.75, y + 14.75, { scale: 2 });
  const k = a.key;
  report('keycap', spec.legend, lx + k[0] / PX, y + k[1] / PX, lx + k[2] / PX, y + k[3] / PX);
}

// --- keycaps and key hints ---------------------------------------------------------------

/**
 * A key hint's keycap: the key's name cut into an argent cap exactly where the old block
 * stood -- two units round the name, eleven tall -- its legend the font at scale 1 three
 * art pixels up from the text row, so the face has room under it before the skirt.
 */
function capArt(label) {
  return asset('cap:' + label, () => {
    const kw = textWidth(label, 1);
    const W = (kw + 4) * PX, H = 11 * PX;
    const p = new Pix(W, H);
    const f = keycap(p, 0, 0, W, H);
    engrave(p, label, f.x + f.w / 2, f.y + f.h / 2, G1);
    return { c: canvasOf(p), w: W, h: H };
  });
}

/**
 * A keycap with its legend, its name's font box's left at x and top at y (as keyLine).
 * `alpha` fades the whole key, walls and legend as one picture.
 */
export function mCap(ctx, label, x, y, alpha = 1) {
  const a = capArt(label);
  const was = ctx.globalAlpha;
  ctx.globalAlpha = was * alpha;
  ctx.drawImage(a.c, 0, 0, a.w, a.h, x - 2, y - 2, a.w / PX, a.h / PX);
  ctx.globalAlpha = was;
  report('keycap', label, x - 2, y - 2, x - 2 + a.w / PX, y - 2 + a.h / PX);
  if (capWatch && was * alpha > CAP_SEEN) capWatch.add(label);
}

/**
 * A line of [key, words] pairs laid out exactly as screens.js keyLine lays them out -- the
 * same widths and gaps -- with each key a keycap and the words in the quiet ink. Returns the
 * width drawn.
 */
export function mKeyLine(ctx, pairs, x, y, align = 'center', gap = 10) {
  let total = 0;
  for (const [k, label] of pairs) total += textWidth(k) + 3 + textWidth(label) + gap;
  total -= gap;
  let px = align === 'center' ? Math.round(x - total / 2) : Math.round(x);
  for (const [k, label] of pairs) {
    const kw = textWidth(k);
    mCap(ctx, k, px, y);
    report('text', k, px - 0.5, y - 0.5, px + kw + 0.5, y + 7.5, { scale: 1 });
    px += kw + 5;
    mText(ctx, 'label', label, px, y, 'left');
    px += textWidth(label) + gap;
  }
  return total;
}
/**
 * A row of key hints, [key, words, role] each -- a keycap and its words in `role` ('label' if
 * none), or words alone for a pair with no key -- `gap` apart, laid out as mKeyLine lays its
 * pairs (the cap two units round its name, the words five on from it) but centred on what it
 * DRAWS, from the first cap's edge to the last word's end (keyLineSpan says why). `alpha`
 * fades the row whole: no two of its pieces overlap, so each drawn at the alpha is the row
 * drawn at it. Returns [left, right] in view units.
 */
export function mHints(ctx, pairs, x, y, gap = 10, align = 'center', alpha = 1) {
  const W = hintsWidth(pairs, gap);
  let px = align === 'center' ? Math.round(x - W / 2) : align === 'right' ? Math.round(x - W) : Math.round(x);
  const left = px;
  pairs.forEach(([k, label, role = 'label'], j) => {
    if (j) px += gap;
    if (k) {
      mCap(ctx, k, px + 2, y, alpha);
      px += textWidth(k) + (label ? 7 : 4);
    }
    if (label) {
      mText(ctx, role, label, px, y, 'left', alpha);
      px += textWidth(label);
    }
  });
  return [left, px];
}
/** How wide mHints draws `pairs` [view units]. */
export function hintsWidth(pairs, gap = 10) {
  let w = 0;
  pairs.forEach(([k, label], j) => {
    if (j) w += gap;
    if (k) w += textWidth(k) + (label ? 7 : 4);
    if (label) w += textWidth(label);
  });
  return w;
}

/**
 * Where mKeyLine's ink runs, [left, right] in view units: from the first keycap's left edge
 * to the end of the last label -- for sizing and centring a plate round it.
 *
 * It measures the drawing, not the width the line is centred by. keyLine has always centred
 * on a width that counts three units between a key and its words and then stepped five (the
 * cap's two and three of air), so a line of three pairs is drawn six units wider than it is
 * centred for, two units right of centre. The first cut of the title screen's key plaque was
 * sized and centred by that width: on a first run the plaque's field showed 5.5 units of air
 * left of ARROWS and 1 right of TO CHAIN, the N all but on the gold. The lines keep the
 * places they have always had; the plaque follows them.
 */
export function keyLineSpan(pairs, x, align = 'center', gap = 10) {
  let total = 0;
  for (const [k, label] of pairs) total += textWidth(k) + 3 + textWidth(label) + gap;
  total -= gap;
  const left = align === 'center' ? Math.round(x - total / 2) : Math.round(x);
  let px = left;
  for (const [k, label] of pairs) px += textWidth(k) + 5 + textWidth(label) + gap;
  return [left - 2, px - gap];
}

// --- panels ------------------------------------------------------------------------------

/**
 * A panel's frame as a nine-slice: one small plate painted with the full profile, drawn as
 * four corners, four edges stretched from a single column or row (a one-pixel line
 * stretched along itself is the same line, whatever the length), and the field filled flat.
 * The panels are up to 440 x 186 view units -- 1.3 million pixels each, and fourteen of them
 * whole were 60 MB of canvas and up to 50 ms a paint -- and nothing in them but the frame
 * varies. [E: art px from the edge to where the field is flat -- the profile and its shadow]
 */
function panelSlice(style) {
  return asset('slice:' + style, () => {
    const E = PROFILES[style].length + 3, S = 2 * E + 1;
    const { p } = paintPlate(S, S, style, [[0, 0, S, S, 3]]);
    return { c: canvasOf(p), E, S, field: style === 'title' ? VELVET : FIELD };
  });
}
function drawSlice(ctx, a, x, y, W, H) {
  const { c, E, S } = a, U = 1 / PX;
  const X = x, Y = y, mw = W - 2 * E, mh = H - 2 * E;
  const blit = (sx, sy, sw, sh, dx, dy, dw, dh) => ctx.drawImage(c, sx, sy, sw, sh, X + dx * U, Y + dy * U, dw * U, dh * U);
  blit(0, 0, E, E, 0, 0, E, E);
  blit(S - E, 0, E, E, W - E, 0, E, E);
  blit(0, S - E, E, E, 0, H - E, E, E);
  blit(S - E, S - E, E, E, W - E, H - E, E, E);
  blit(E, 0, 1, E, E, 0, mw, E);
  blit(E, S - E, 1, E, E, H - E, mw, E);
  blit(0, E, E, 1, 0, E, E, mh);
  blit(S - E, E, E, 1, W - E, E, E, mh);
  ctx.fillStyle = a.field;
  ctx.fillRect(X + E * U, Y + E * U, mw * U, mh * U);
}

/**
 * A panel: the old panel's box (x, y, w, h in view units), a quiet gold frame round an opaque
 * field. With a title, the title sits on a small plaque of the same make mounted across the
 * top rail where the old notch was, in gold, or in `role`'s ink. `tabW` sizes the plaque for
 * a longer title than this one [view units], so a panel whose title changes (a count, a page)
 * keeps one canvas.
 */
export function mPanel(ctx, x, y, w, h, title = '', role = 'gold', style = 'panel', tabW = 0) {
  const W = Math.round(w * PX), H = Math.round(h * PX);
  drawSlice(ctx, panelSlice(style), x, y, W, H);
  report('plate', title || style, x, y, x + w, y + h, { chamfer: 3 });
  if (!title) return;
  // The plaque: five units left of the title (the old notch began three left of it), four
  // above and below, five past its end -- at two and three the title's keyline lay on the
  // plaque's own frame.
  const tw = Math.max(textWidth(title), tabW);
  const a = plateArt(`plate:${style}:${(tw + 10) * PX}x${15 * PX}:0`, (tw + 10) * PX, 15 * PX, style);
  drawArt(ctx, a, x + 3, y - 8);
  report('plate', 'tab:' + title, x + 3, y - 8, x + 3 + tw + 10, y + 7, { chamfer: 3 });
  mText(ctx, role, title, x + 8, y - 4, 'left');
}

/** A plate of a style at a view box, no title (the title screen's lower plaque). */
export function mPlate(ctx, style, x, y, w, h) {
  const W = Math.round(w * PX), H = Math.round(h * PX);
  const a = plateArt(`plate:${style}:${W}x${H}:0`, W, H, style, [[0, 0, W, H, 3]]);
  drawArt(ctx, a, x, y);
  report('plate', style, x, y, x + W / PX, y + H / PX, { chamfer: 3 });
  return a;
}

/**
 * The highlight under a selected row or an active tab: crimson enamel in a gold rim, a
 * glint crossing it once a cycle. `open` leaves its foot open, for a tab standing on a rule.
 */
export function mSelect(ctx, x, y, w, h, t, open = false) {
  const W = Math.round(w * PX), H = Math.round(h * PX);
  const a = selectArt(W, H, open);
  ctx.drawImage(a.c, 0, 0, a.w, H, x, y, a.w / PX, H / PX);
  report('plate', 'select', x, y, x + w, y + h, { chamfer: 3 });
  const u = shine('prompt', t);
  if (u >= 0 && a.glint) {
    const BAND = 18;
    const X = Math.round(x * PX), Y = Math.round(y * PX);
    const span = a.w + BAND + H * SLANT;
    glintBand(ctx, a.glint, X, Y, a.w, H, X - BAND + u * span, Y, BAND);
  }
}
/** Rows painted under an open tab's foot and not drawn [art px; 8, more than the rim's 5]. */
const OPEN_FOOT = 8;
/**
 * A selection plate W x H art px. An open one (a stats tab) is painted OPEN_FOOT rows taller
 * and drawn cut at H, so its side rails and enamel run straight off its foot onto the rule.
 * The first cut asked for the open foot by giving the silhouette rows past the canvas, but the
 * frame is measured inside the canvas, and its last row counted as an edge: every tab was
 * closed along the bottom by a full rim, a button sitting on the rule, while the comments said
 * it was open onto it.
 */
function selectArt(W, H, open) {
  const PH = open ? H + OPEN_FOOT : H;
  return plateArt(`plate:select:${W}x${H}:${open ? 1 : 0}`, W, PH, 'select', [[0, 0, W, PH, 3]]);
}

/** The pointer of a selected row: the font's '>' in gold, nudging a pixel out and back. */
export function mPointer(ctx, x, y, t) {
  const nudge = Math.round(1 + Math.sin(t * 3.2)) / PX;
  mText(ctx, 'gold', '>', x + nudge, y, 'left');
}

// --- gauges ------------------------------------------------------------------------------

/**
 * A gauge: a dark well with a keyline, filled from the left (or the bottom) with a tube of
 * `colour` lit from the upper left, and a bright leading pixel where the fill stops. The
 * fill is painted whole once and drawn cut to the fraction.
 */
function gaugeArt(w, h, colour, vertical) {
  const W = Math.round(w * PX), H = Math.round(h * PX);
  return asset(`gauge:${W}x${H}:${colour}:${vertical ? 1 : 0}`, () => {
    const well = new Pix(W, H), fill = new Pix(W, H);
    const lit = mix(colour, '#ffffff', 0.45);
    // The HUD's tube (hudskin.js paintFill), in this colour: across the tube a lit edge, a
    // highlight band, the body, a shadow and a deepest edge. The first cut was the colour flat
    // with a dark last seventh, and the widest column, COMBOS BY TIER's hot one, read as a
    // gold box with its side face showing rather than a lit bar.
    const ramp = [NIGHT, mix(colour, NIGHT, 0.62), mix(colour, NIGHT, 0.35), colour,
      mix(colour, '#ffffff', 0.18), mix(colour, '#ffffff', 0.4)];
    // Across a narrow tube the bands are shares of it, as the HUD's; across a wide one (COMBOS
    // BY TIER's columns, 158 px) shares made eight-to-forty-pixel stripes -- a fluted block --
    // so there the lit edge, highlight and shadow keep the widths they have on a narrow tube
    // and the body takes the rest.
    const across = (a, n) => (n <= 40
      ? ((u) => (u < 0.05 ? 3 : u < 0.2 ? 5 : u < 0.45 ? 4 : u < 0.75 ? 3 : u < 0.95 ? 2 : 1))((a + 0.5) / n)
      : a < 2 ? 3 : a < 6 ? 5 : a < 11 ? 4 : a < n - 8 ? 3 : a < n - 2 ? 2 : 1);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      well.set(x, y, edge ? NIGHT : y === 1 ? '#070409' : '#1a1118');
      if (edge) continue;
      const a = vertical ? x : y, n = vertical ? W : H;
      fill.set(x, y, ramp[across(a - 1, n - 2)]);
    }
    return { well: canvasOf(well), fill: canvasOf(fill), W, H, lit };
  });
}

/** A horizontal gauge at view (x, y), w x h units, filled to frac. */
export function mBar(ctx, x, y, w, h, frac, colour) {
  const a = gaugeArt(w, h, colour, false);
  ctx.drawImage(a.well, 0, 0, a.W, a.H, x, y, a.W / PX, a.H / PX);
  const f = Math.max(0, Math.min(1, frac));
  const fw = f > 0 ? Math.max(3, Math.round((a.W - 2) * f)) : 0;
  if (fw) {
    ctx.drawImage(a.fill, 1, 0, fw, a.H, x + 1 / PX, y, fw / PX, a.H / PX);
    ctx.fillStyle = a.lit;
    ctx.fillRect(x + fw / PX, y + 1 / PX, 1 / PX, (a.H - 2) / PX);
  }
  report('gauge', colour, x, y, x + w, y + h);
}

/** A vertical gauge at view (x, y), filled from the bottom to frac. */
export function mColumn(ctx, x, y, w, h, frac, colour) {
  const a = gaugeArt(w, h, colour, true);
  ctx.drawImage(a.well, 0, 0, a.W, a.H, x, y, a.W / PX, a.H / PX);
  const f = Math.max(0, Math.min(1, frac));
  const fh = f > 0 ? Math.max(3, Math.round((a.H - 2) * f)) : 0;
  if (fh) {
    const sy = a.H - 1 - fh;
    ctx.drawImage(a.fill, 0, sy, a.W, fh, x, y + sy / PX, a.W / PX, fh / PX);
    ctx.fillStyle = a.lit;
    ctx.fillRect(x + 1 / PX, y + (sy - 1) / PX, (a.W - 2) / PX, 1 / PX);
  }
  report('gauge', colour, x, y, x + w, y + h);
}

// --- small jewels: the guide's page dots, the awards' marks, a record's sparkle -------------

const GEM = {
  // A cut stone 16 px square: a lozenge, lit on its upper-left facets.
  on: ['.......00.......', '......0660......', '.....066550.....', '....06665550....', '...0666555440...',
    '..066655554440..', '.06665555444440.', '0666555544444330', '0555555444433330', '.05555444433330.',
    '..055444433330..', '...0444433330...', '....04433330....', '.....043330.....', '......0330......', '.......00.......'],
};
function gemArt(kind, ramp, size = 16) {
  return asset(`gem:${kind}:${ramp === OR ? 'or' : ramp === ARGENT ? 'argent' : ramp.join('')}:${size}`, () => {
    const p = new Pix(size, size);
    const rows = GEM.on;
    const k = 16 / size;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const ch = rows[Math.floor(y * k)][Math.floor(x * k)];
      if (ch === '.') continue;
      p.set(x, y, ch === '0' ? NIGHT : ramp[Number(ch)]);
    }
    return { c: canvasOf(p), w: size, h: size };
  });
}
/** A gem centred in the view box (x, y, w, h): gold when on, a dark argent stone when off. */
export function mGem(ctx, x, y, w, h, on, colour = null) {
  const ramp = colour ? [NIGHT, mix(colour, NIGHT, 0.6), mix(colour, NIGHT, 0.4), mix(colour, NIGHT, 0.2), colour,
    mix(colour, '#ffffff', 0.3), mix(colour, '#ffffff', 0.65)] : on ? OR : ['#000', '#000', '#000', '#2a2622', '#3a3530', '#4a443d', '#5c554d'];
  // The same cut stone on and off, the colour saying which: off at 12 px the guide's other
  // pages were specks beside the gold one.
  const a = gemArt('on', ramp, 16);
  const cx = Math.round((x + w / 2) * PX), cy = Math.round((y + h / 2) * PX);
  ctx.drawImage(a.c, 0, 0, a.w, a.h, (cx - a.w / 2) / PX, (cy - a.h / 2) / PX, a.w / PX, a.h / PX);
  report('gem', on ? 'on' : 'off', (cx - a.w / 2) / PX, (cy - a.h / 2) / PX, (cx + a.w / 2) / PX, (cy + a.h / 2) / PX);
}

/**
 * A four-point sparkle, GLORY's glint: rays `r` art px out along the axes, white at the heart,
 * pale gold, then gold at the tips, and the four pixels round the heart pale gold. Frames:
 * rays of 2, 4 and 6, and back.
 *
 * The first cut was 7 px across at its widest, on the corner of a 28-px number: at 1x a dot,
 * and in a strip of frames nobody could say which record had caught the light.
 */
const SPARK_R = [2, 4, 6];
const SPARK_BOX = 2 * SPARK_R[SPARK_R.length - 1] + 1;
function sparkArt(f) {
  return asset('spark:' + f, () => {
    const r = SPARK_R[f], c = SPARK_BOX >> 1;
    const p = new Pix(SPARK_BOX, SPARK_BOX);
    for (let d = -r; d <= r; d++) {
      const a = Math.abs(d);
      const col = a <= 1 ? '#ffffff' : a <= r / 2 ? OR[6] : OR[5];
      p.set(c + d, c, col);
      p.set(c, c + d, col);
    }
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.set(c + dx, c + dy, OR[6]);
    return { c: canvasOf(p), w: SPARK_BOX, h: SPARK_BOX };
  });
}
/** A sparkle on the upper-left corner of a text box at view (x, y), u 0..1 through it. */
export function mSparkle(ctx, x, y, u) {
  const f = u < 0.2 || u > 0.8 ? 0 : u < 0.35 || u > 0.65 ? 1 : 2;
  const a = sparkArt(f);
  const h = SPARK_BOX >> 1;
  const X = Math.round(x * PX) + 1 - h, Y = Math.round(y * PX) + 1 - h;
  ctx.drawImage(a.c, 0, 0, a.w, a.h, X / PX, Y / PX, a.w / PX, a.h / PX);
}

/** A rule across a screen: an engraved gold line, one view unit tall. */
export function mRule(ctx, x, y, w) {
  ctx.fillStyle = NIGHT; ctx.fillRect(x, y, w, 1 / PX);
  ctx.fillStyle = OR[2]; ctx.fillRect(x, y + 1 / PX, w, 1 / PX);
  ctx.fillStyle = OR[4]; ctx.fillRect(x, y + 2 / PX, w, 1 / PX);
  ctx.fillStyle = NIGHT; ctx.fillRect(x, y + 3 / PX, w, 1 / PX);
  report('rule', 'rule', x, y, x + w, y + 1);
}

// --- warming ahead -----------------------------------------------------------------------
//
// The title screen's own pieces are painted when this module loads (below), so its first
// frame paints nothing. Everything the other screens draw is painted after that one piece a
// frame while the title screen is up (warmMenu, called by drawMenu), in the order a player
// is likeliest to open them. The list is the screens' own calls, made with the sizes they
// draw at; screens.js hands them in (menuWarmList) because it is what knows the layout.

let pending = [];
let main = [];
/**
 * Register what to paint: `first`, now (the title screen's pieces), and `rest`, one a frame
 * from warmMenu. Each is a function that asks for a piece (and so builds it).
 */
export function menuWarmList(first, rest) {
  main = first;
  pending = rest.slice();
  if (typeof document === 'undefined' || !document.createElement) return;
  warming = true;
  try { for (const f of main) f(); } finally { warming = false; }
}

/**
 * Paint these pieces now (a list of warm.* functions), as a warm-up: for what is drawn in play,
 * in the fall or on the scoreboard in this lettering -- the board's words, the fall's, the
 * herald's lines, the companions' calls -- which gameoverskin.js paints at load, when a run
 * could start on the title screen's first frame and so before any of the menu's own warm-up.
 */
export function menuWarmNow(list) {
  if (typeof document === 'undefined' || !document.createElement) return;
  const was = warming;
  warming = true;
  try { for (const f of list) f(); } finally { warming = was; }
}

/** Paint the next piece another screen needs. Called once per title-screen frame. */
export function warmMenu(n = 1) {
  if (!pending.length) return;
  warming = true;
  try {
    for (let k = 0; k < n && pending.length; k++) {
      const before = stats.builds;
      // Skip what is already built, so one call paints one piece.
      while (pending.length && stats.builds === before) pending.shift()();
    }
  } finally { warming = false; }
}

/** The pieces a warm-up paints, as functions -- for screens.js's list. */
export const warm = {
  ink: (role) => () => inkCanvas(role),
  line: (str, scale, style) => () => lineArt(String(str).toUpperCase(), scale, style),
  cap: (label) => () => capArt(label),
  panel: (w, h, title = '', role = 'gold', style = 'panel', tabW = 0) => () => {
    const probeWas = probe; probe = null;
    try {
      // Built through the same call the screen makes, onto a scratch canvas: whatever of the
      // slice, the title's plaque and the title's ink is missing -- small pieces, a few ms.
      mPanel(scratch(), 0, 0, w, h, title, role, style, tabW);
    } finally { probe = probeWas; }
  },
  plate: (style, w, h) => () => {
    const W = Math.round(w * PX), H = Math.round(h * PX);
    plateArt(`plate:${style}:${W}x${H}:0`, W, H, style, [[0, 0, W, H, 3]]);
  },
  select: (w, h, open = false) => () => selectArt(Math.round(w * PX), Math.round(h * PX), open),
  gauge: (w, h, colour, vertical = false) => () => gaugeArt(w, h, colour, vertical),
  gem: (on, colour = null) => () => {
    const probeWas = probe; probe = null;
    try { mGem(scratch(), 0, 0, 4, 4, on, colour); } finally { probe = probeWas; }
  },
  /** Whatever `fn(ctx)` draws, drawn onto a scratch canvas: a composite, say. */
  draw: (fn) => () => {
    const probeWas = probe; probe = null;
    try { fn(scratch()); } finally { probe = probeWas; }
  },
  title: (b) => () => { titlePlate(b); titleHalo(b); },
  prompt: () => () => { promptArt(); promptPlate(); },
  /** Another screen's prompt (mPromptSpec), without the title screen's plaque. */
  promptOn: (spec) => () => promptArt(spec),
  /** A panel's frame, the nine-slice every mPanel of that style is drawn from. */
  slice: (style = 'panel') => () => panelSlice(style),
  spark: () => () => { for (let f = 0; f < SPARK_R.length; f++) sparkArt(f); },
};

let scratchCanvas = null;
function scratch() {
  if (!scratchCanvas) {
    scratchCanvas = document.createElement('canvas');
    scratchCanvas.width = 8;
    scratchCanvas.height = 8;
  }
  const g = scratchCanvas.getContext('2d');
  g.setTransform(PX, 0, 0, PX, 0, 0);
  return g;
}
