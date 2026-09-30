// The game's words: the grand callout at each of the tower's seven heights a lap
// (game/milestones.js; it was each multiplier step of a combo until the player moved them),
// its prestige badge from the second lap on, and the small text that floats off the Duke
// (BOUNCE, TWICE, THRICE!, CHASE n, the +score of a banked chain).
//
// WHAT THIS REPLACED. The callout was the step's name in the game's 5x7 font at scale 2 --
// 8 x 8 px blocks, 56 px tall, popping to scale 3 for its first 0.14 s -- in the zone's
// shout ink: the same plain letters for SWIFT at 50 floors as for GLORY at 350, and in a
// different colour in every zone, so the word said nothing about how hot the chain was. The
// floaters were the same font at 4 and 8 backing pixels per font pixel, BOUNCE in the zone's
// accent and the big ones white: the chunkiest thing on screen, four to eight times coarser
// than the Duke they floated off, and the same colour whether the chain was two floors or
// three hundred.
//
// THE CALLOUTS are lettered at art resolution, one art pixel per backing pixel, like the
// zone titles (zonetitles.js), from the same font as a skeleton: one painter per word in
// calloutpaint/, each its own treatment and each heavier, hotter and brighter than the one
// before -- SWIFT clean and fast, CHARGE blued steel, SOARING glowing, RAMPAGE on fire,
// CRUSADE the tricolour in gilt under the Vytis's shield, THUNDER struck by lightning, GLORY
// radiant. Their colours are the combo trail's (sparks.js): each word is lettered in the
// colour of the combo step that bears its name (calloutpaint/kit.js STEP_BANDS), taken from
// the ramps its trail sheds, so the word and the stars falling behind him are one colour
// language -- from when each word was that step's, before they marked the tower. Each makes a
// short entrance in whole pixels -- a slide, a slam, a rise, a flash, a pop -- from
// pre-painted frames, never a smooth scale.
//
// THE FLOATERS are still the game's font -- they are read in a glance at speed, and a word
// read in a glance should be the alphabet the rest of the HUD uses -- but at 2 backing pixels
// per font pixel (3 for the big ones), with a two-pixel keyline, a pop of one size for their
// first moment, and coloured by the COMBO STEP they were thrown at, in that step's colour
// (calloutpaint/kit.js STEP_BANDS): plain steel with no chain, then a colour of its own at
// every step, the colour its trail and the callout named for it are, and past the GLORY
// row (400 floors of chain and up) each letter a different colour of the rainbow, walking.
//
// COST. Painting a callout is tens of milliseconds of per-pixel work, so, like the zone
// titles, they are painted ahead, a piece per frame: the layout, then each frame in one or
// two pieces, then onto its canvas in the next. A floater ink -- every glyph at three sizes
// -- is one piece. All of it is driven from the renderer's floater pass (warmComboText),
// which runs in every frame the renderer draws, the TITLE SCREEN's attract run included:
// the seventeen inks from its second frame, then the callouts' seventy-odd pieces, then the
// next two laps' badges (thirty pieces, under a millisecond each), one a frame, so no frame
// carries a piece of two and all of it is done about 120 frames (three quarters of a second
// at 160 Hz; the words by 90) after the title screen first appears -- before a player has
// started a run. The
// callouts were first warmed from the HUD, which is drawn only in play, so their pieces
// (up to 16 ms headless each) fell in the first seventy frames of the first run of every
// session while the title screen that came before sat idle. Were a run started sooner, the
// pieces simply carry on in its first frames: the first callout is needed 330 floors up, half
// a minute of the fastest climb. After the words come the badges, a handful of pieces each.
// The heaviest piece measured 15 to
// 21 ms headless the first time its code ran, under 8 once warm (tools/test-callouts.mjs).
// Anything asked for before it is ready is built on the spot and COUNTED (calloutStats), and
// that test requires the count to stay zero through a whole combo run.

//
// THE PRESTIGE BADGE. The callouts were the combo's steps until the player asked for them to
// be the tower's milestones (game/milestones.js): seven to a lap of the zones, and from the
// second lap on the word carries a badge, x2, x3 ... for a Duke who has not died. The badge
// is lettered in the same kit (calloutpaint/badge.js), painted ahead one piece a frame like
// the words -- the second lap's while the first is climbed -- and drawn by the RENDERER after
// the characters, the companions' calls and the floaters (drawCalloutBadge), where the word
// is drawn by the HUD under them: the badge is the one thing on screen a player earned by
// staying alive a whole lap, so nothing is allowed to cover it, and it is small enough that
// covering a piece of the Duke now and then is the lesser cost. It stands beside the word,
// clear of everything the word paints, and comes in once the word has made its entrance.

import { PX, VW, CALLOUT_LIFE, BADGE_AFTER, BADGE_GAP, HUD_OUT } from '../game/constants.js';
import { MILESTONES } from '../game/milestones.js';
import { pixToCanvas } from './decorpaint/util.js';
import { STEP_BANDS, rampOf, glyphInk } from './calloutpaint/kit.js';
import { CALLOUT_PAINTERS } from './calloutpaint/index.js';
import * as BADGE from './calloutpaint/badge.js';
import { newCanvas, touchCanvas } from './canvases.js';

// --- the callouts ---------------------------------------------------------------------

/**
 * The view row the callout's letters start on: four units over the old shout's settled row
 * (84), so the word sits where players have learned to look, clear of the banner stack
 * (BANNER_TOP 150 in hud.js, where a zone title arriving in the same moment lands) and of the
 * HUD's corners. Four units higher because the lettered words, shadow and glow included,
 * reach a little further down than the old plain ones did, toward where the Duke rides:
 * at 84 every one of the seven overlapped him for longer than the old shout
 * (tools/test-callouts.mjs, 5). [view units; 80 = backing row 320]
 */
export const CALLOUT_TOP = 80;
/**
 * The exit: over the last FADE seconds, three steps of alpha, 0.75, 0.45, 0.2 -- the old
 * shout's own fade (alpha = life / 0.4, a ramp) in whole steps, a little under it at every
 * step. The banners' steps (1, 0.7, 0.4 over 0.35 s) held the word on screen longer than the
 * old shout: nearly a tenth of a second more over the Duke whenever he was under it as it
 * went. [s; 0.4]
 */
const FADE = 0.4;

/** The callout's alpha with `life` seconds of it left. */
export function calloutAlpha(life) {
  const a = life / FADE;
  return a >= 1 ? 1 : a > 2 / 3 ? 0.75 : a > 1 / 3 ? 0.45 : 0.2;
}
const callouts = new Map();       // name -> entry
const badges = new Map();         // lap -> entry, see warmBadges
let job = null;                    // the piece of work in hand: { key, art, next, pending, gen, frames, store }
const stats = { calloutLate: 0, inkLate: 0, badgeLate: 0, pieces: [], inkMs: [], badgePieces: [] };

const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);

function canvasOf(p) {
  // Whole numbers and smoothing off (canvases.js): nothing here is scaled on its way to the
  // screen, but a fresh canvas smooths by default and it must not be the one buffer in the
  // chain that could blur.
  const { c, g } = newCanvas(p.w, p.h);
  pixToCanvas(p, g);
  // Painted on the title screen and first shown in a run, when the climb reaches a milestone:
  // brought up now, in the warm-up's own frame, not in the frame the word comes up in.
  touchCanvas(c);
  return c;
}

function startJob(name) {
  const art = CALLOUT_PAINTERS[name].paint(name);
  return { key: name, art, next: 0, pending: null, gen: null, frames: [], store: (e) => callouts.set(name, e) };
}

function startBadge(lap) {
  return { key: 'x' + lap, lap, art: BADGE.paint(lap), next: 0, pending: null, gen: null, frames: [],
    store: (e) => badges.set(lap, e) };
}

/**
 * One piece of a callout's or a badge's build: its layout, a pass of a frame, or a frame
 * onto a canvas. Returns true when that was the last piece.
 */
function stepJob(j) {
  if (j.pending) {
    const f = j.pending;
    // Which pixels are letter, for the tools that measure legibility: of the settled frame only.
    const letters = j.next === 0 ? f.letters || null : null;
    j.frames.push({ c: canvasOf(f.pix), w: f.pix.w, h: f.pix.h, ax: f.ax, ay: f.ay, letters, half: f.half || 0,
      ...extentOf(f.pix, f.ay, letters, j.next === 0) });
    j.pending = null;
    j.next++;
    if (j.next >= j.art.frames.length) {
      j.store({ name: j.key, frames: j.frames, seq: j.art.seq || [],
        over: j.art.over || [], sweep: j.art.sweep || null, loop: j.art.loop || null });
      return true;
    }
  } else if (j.gen) {
    const r = j.gen.next();
    if (r.done) { j.pending = r.value; j.gen = null; }
  } else {
    const r = j.art.frames[j.next]();
    if (r && typeof r.next === 'function') j.gen = r;
    else j.pending = r;
  }
  return false;
}

/**
 * Paint the callouts ahead, a piece per call, in the order the climb meets them. Called by
 * warmComboText once the floater inks are done, so once per frame the renderer draws, title
 * screen included. Does nothing once all seven are canvases.
 */
export function warmCallouts(lap = 1) {
  // After the floater inks, so no frame carries a piece of each.
  if (inks.size < INK_ORDER.length) return;
  if (!job) {
    const m = MILESTONES.find((q) => CALLOUT_PAINTERS[q.name] && !callouts.has(q.name));
    if (!m) { warmBadges(lap); return; }
    const t0 = now();
    job = startJob(m.name);
    stats.pieces.push(now() - t0);
    return;
  }
  const t0 = now();
  const was = job;
  if (stepJob(job)) job = null;
  (was.lap ? stats.badgePieces : stats.pieces).push(now() - t0);
}

/**
 * The laps whose badges should be canvases while lap `lap` is being climbed (the lap of the
 * next callout due): its own, from the second on, and the next -- so the first showing of
 * each lap's badge, SWIFT's, paints nothing. The second lap's is painted during the first,
 * on the title screen in fact, since the attract run is on lap 1.
 */
const badgeLaps = (lap) => [Math.max(2, lap), Math.max(2, lap) + 1];

/**
 * Paint the badges ahead, a piece per call, once the seven words are done. Badges more than a
 * lap behind are let go: the last one shown can still be fading when the lap turns over.
 */
function warmBadges(lap) {
  const want = badgeLaps(lap);
  for (const k of badges.keys()) if (k < want[0] - 1) badges.delete(k);
  const L = want.find((k) => !badges.has(k));
  if (L === undefined) return;
  const t0 = now();
  job = startBadge(L);
  stats.badgePieces.push(now() - t0);
}

/** A callout, finished; built on the spot if the warm-up has not got to it, and counted. */
export function callout(name) {
  let e = callouts.get(name);
  if (e) return e;
  if (!CALLOUT_PAINTERS[name]) return null;
  stats.calloutLate++;
  const j = job && job.key === name ? job : startJob(name);
  if (j === job) job = null;
  while (!stepJob(j));
  return callouts.get(name);
}

/** A lap's badge, finished; built on the spot if the warm-up has not got to it, and counted. */
export function badge(lap) {
  let e = badges.get(lap);
  if (e) return e;
  stats.badgeLate++;
  const j = job && job.lap === lap ? job : startBadge(lap);
  if (j === job) job = null;
  while (!stepJob(j));
  return badges.get(lap);
}

/** Whether a lap's badge is ready to draw without painting anything. For the tools. */
export const badgeReady = (lap) => badges.has(lap);

/**
 * Where a word's badge stands, from what the word paints: the rightmost pixel of anything it
 * draws once it has settled (frame 0 and the frames it loops, flashes or sweeps -- GLORY's
 * rays, CRUSADE's shield, THUNDER's bolts), and the middle of its letters, both relative to
 * its anchor, in art px. Measured once per word.
 */
function wordPlace(e) {
  if (e.place) return e.place;
  const shown = new Set([0]);
  for (const q of e.loop || []) shown.add(q[0]);
  for (const q of e.over) shown.add(q[0]);
  if (e.sweep) shown.add(e.sweep.frame);
  let right = 0;
  for (const k of shown) right = Math.max(right, e.frames[k].xr - e.frames[k].ax);
  const F = e.frames[0];
  const seqT = e.seq.reduce((s, q) => s + q[1], 0);
  e.place = { right, mid: Math.round((F.ly0 + F.ly1) / 2) - F.ay, seqT };
  return e.place;
}

/**
 * What wordPlace needs of one frame, read off its Pix while the build still has it: `xr` the
 * rightmost column holding any paint, and for the settled frame (`rows`) `ly0`..`ly1` the
 * first and last rows at or below the anchor row with a letter pixel -- the letters' rows from
 * the word's top down: CRUSADE's mask includes the shield standing over the word, and the
 * middle of the two stood its badge half a word high.
 *
 * wordPlace read these off the frame's CANVAS (`F.c.data`) at the badge's first showing. Only
 * the headless canvas has a `data` array; a browser's canvas has none, so in the game the
 * first badge of the second lap threw a TypeError in the renderer every frame the callout was
 * up: no badge ever drew, and the vignette and flash after it in that frame were skipped.
 * Every test passed, because every test runs on the headless canvas.
 */
function extentOf(p, ay, letters, rows) {
  const d = p.data, w = p.w, h = p.h;
  let xr = -1;
  for (let x = w - 1; x >= 0 && xr < 0; x--) {
    for (let y = 0; y < h; y++) if (d[(y * w + x) * 4 + 3]) { xr = x; break; }
  }
  if (!rows) return { xr };
  let ly0 = h, ly1 = -1;
  for (let y = ay; y < h; y++) for (let x = 0; x < w; x++) {
    const on = letters ? letters[y * w + x] : d[(y * w + x) * 4 + 3] === 255;
    if (on) { if (y < ly0) ly0 = y; ly1 = y; break; }
  }
  return { xr, ly0, ly1 };
}

/** Whether a callout is ready to draw without painting anything. For the tools. */
export const calloutReady = (name) => callouts.has(name);

/**
 * Draw the milestone callout `name`, `age` seconds into its `life`-second showing, centred
 * on view column `cx`, its letters' top on CALLOUT_TOP, in the HUD's transform (PX backing
 * pixels per unit, whole-pixel shake). Returns false when the word has no painter, and the
 * caller then prints it as text.
 */
export function drawCallout(ctx, name, age, life, cx = VW / 2) {
  const e = callout(name);
  if (!e) return false;
  // Whole backing pixels, so every painted pixel lands on exactly one store pixel.
  drawEntry(ctx, e, age, Math.round(cx * PX), CALLOUT_TOP * PX, calloutAlpha(life));
  return true;
}

/**
 * Draw the prestige badge of the callout on screen, if it has one: from the second lap of the
 * tower on (game.shoutLap), beside the word, in the renderer's screen-space pass AFTER the
 * characters, their calls and the floaters, in the same transform as the HUD (PX backing
 * pixels per unit, whole-pixel shake), so it moves with the word and nothing is drawn over it.
 *
 * It comes in BADGE_AFTER seconds after the word's own entrance and leaves with the word, in
 * the same stepped fade. Once the fire has him the HUD leaves as a layer fading over HUD_OUT
 * (screens.js drawHudExit) and the game holds the callout's clock still (Game.decayFx), so
 * the badge fades with that layer from the frame he died in; it used to be that anything drawn
 * outside the HUD simply stayed, or cut out in one frame. Returns whether it drew.
 */
export function drawCalloutBadge(ctx, game, cx = VW / 2) {
  const lap = game.shoutLap | 0;
  if (lap < 2 || !game.shout || !(game.shoutT > 0)) return false;
  let fade = 1;
  if (game.state === 'falling') {
    const k = 1 - (game.deathT || 0) / HUD_OUT;
    if (k <= 0) return false;
    fade = k > 0.66 ? 1 : k > 0.33 ? 0.7 : 0.4;
  } else if (game.state !== 'playing' && game.state !== 'paused') return false;
  const word = callouts.get(game.shout) || (CALLOUT_PAINTERS[game.shout] ? callout(game.shout) : null);
  // A word with no painter is the plain-font fallback, which has no place for a badge.
  if (!word) return false;
  const at = badgePlace(word, lap, cx);
  const age = CALLOUT_LIFE - game.shoutT - at.after;
  if (age < 0) return false;
  drawEntry(ctx, at.b, age, at.X, at.Y, calloutAlpha(game.shoutT) * fade);
  return true;
}

/**
 * Where lap `lap`'s badge stands beside the word entry `word`: its plaque's centre (X, Y) in
 * backing px -- the plaque's left edge BADGE_GAP clear of the rightmost pixel the word paints
 * once settled, its centre on the letters' middle row -- and the age of the callout it comes
 * in at. The one place this is decided: the drawing and the tools both ask it.
 */
function badgePlace(word, lap, cx) {
  const at = wordPlace(word);
  const b = badge(lap);
  return { b, X: Math.round(cx * PX) + at.right + 1 + BADGE_GAP + b.frames[0].half,
    Y: CALLOUT_TOP * PX + at.mid, right: at.right, after: at.seqT + BADGE_AFTER };
}

/** Where a lap's badge is drawn beside word `name`: see badgePlace. For the tools. */
export function badgeAt(name, lap, cx = VW / 2) {
  const { X, Y, right, after } = badgePlace(callout(name), lap, cx);
  return { X, Y, right, after };
}

/**
 * Draw a painted entry -- a word or a badge -- `age` seconds into its showing, its anchor on
 * backing pixel (X, Y), at `alpha`: the entrance frame by frame, then settled (frame 0, or
 * its loop), with any frame laid over it and any glint sweeping across.
 */
function drawEntry(ctx, e, age, X, Y, alpha) {
  let f = -1, dx = 0, dy = 0, acc = 0;
  for (const q of e.seq) {
    if (age < acc + q[1]) { f = q[0]; dx = q[2] || 0; dy = q[3] || 0; break; }
    acc += q[1];
  }
  // Settled: frame 0, or a loop of frames (a flicker) from the end of the entrance on.
  if (f < 0) {
    f = 0;
    if (e.loop) {
      const T = e.loop.reduce((s, q) => s + q[1], 0);
      let u = (age - acc) % T;
      for (const q of e.loop) { if (u < q[1]) { f = q[0]; break; } u -= q[1]; }
    }
  }
  const was = ctx.globalAlpha;
  ctx.globalAlpha = was * alpha;
  const blit = (k, ox = 0, oy = 0, sx = 0, sw = -1) => {
    const F = e.frames[k];
    const w = sw < 0 ? F.w : sw;
    if (w <= 0) return;
    ctx.drawImage(F.c, sx, 0, w, F.h, (X - F.ax + ox + sx) / PX, (Y - F.ay + oy) / PX, w / PX, F.h / PX);
  };
  blit(f, dx, dy);
  for (const [k, t0, t1] of e.over) if (age >= t0 && age < t1) blit(k);
  const s = e.sweep;
  if (s && age >= s.from && age < s.from + s.dur) {
    const F = e.frames[s.frame];
    const x = Math.round(-s.band + (F.w + s.band) * (age - s.from) / s.dur);
    const x0 = Math.max(0, x), x1 = Math.min(F.w, x + s.band);
    blit(s.frame, 0, 0, x0, x1 - x0);
  }
  ctx.globalAlpha = was;
  return true;
}

// --- the floaters' inks ----------------------------------------------------------------

/** Every glyph a floater can hold, in cell order. */
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+!-';
const CI = new Map([...CHARS].map((c, i) => [c, i]));
/** The keyline round every glyph: one pixel of the ink's dark hue, one of near-black. [px] */
const KEY = 2;
/** Backing pixels per font pixel: a floater's two sizes, and each one's pop. */
const SIZES = [2, 3, 4];
/** Walking colours past GLORY: the trail's rainbow (sparks.js RAINBOW), a letter each. */
const RAINBOW = ['RED', 'AMBER', 'GOLD', 'EMERALD', 'CYAN', 'AZURE', 'VIOLET', 'MAGENTA'];
/** Seconds a rainbow colour stays on a letter before the next walks in. [s; the trail's 0.07] */
const RAINBOW_BAND = 0.07;
/** The last STEPS row: past GLORY. */
const BEYOND = STEP_BANDS.length - 1;

const cellW = (g) => 5 * g + 2 * KEY;
const cellH = (g) => 7 * g + 2 * KEY;
const rowY = (() => { const r = {}; let y = 0; for (const g of SIZES) { r[g] = y; y += cellH(g); } r.h = y; return r; })();

const inks = new Map();            // key -> canvas
let inkWarmCalls = 0;

/** The ramps (deep, body, light, highlight) of an ink, top band to foot. */
function inkRamps(key) {
  if (key[0] === 'R') { const r = rampOf(key.slice(2)); return [r, r, r]; }
  return STEP_BANDS[Number(key.slice(2))].map(rampOf);
}

/**
 * Paint an ink: every glyph at every size, banded and lit, inside its keyline. The painter
 * is the kit's (glyphInk), which the menus letter their words with too.
 */
export function paintInk(key) {
  return glyphInk(inkRamps(key), { chars: CHARS, sizes: SIZES, key: KEY });
}

function buildInk(key) {
  const t0 = now();
  const c = canvasOf(paintInk(key));
  inks.set(key, c);
  stats.inkMs.push(now() - t0);
  return c;
}

/**
 * Every floater ink, now, for the load-time prepaint (prepaint.js). An ink is one piece that
 * cannot be cut -- 7 to 10 ms in Chromium, up to 40 cold -- and the first floater of any run
 * wants one, so the warm-up's one ink a frame from the title screen's second frame on put
 * seventeen such frames on the title screen's first second, each on top of the menu's own
 * pieces, and into the first frames of a run started that soon (measured in an offscreen
 * window at 160 Hz: 12.5 ms frames, one after another).
 */
export function warmInks() {
  for (const k of INK_ORDER) if (!inks.has(k)) buildInk(k);
}

/** Which ink a floater's letter `i` is drawn in at combo step `step`; `clock` walks the rainbow. */
export function inkKey(step, i = 0, clock = 0) {
  if (step >= BEYOND) return 'R:' + RAINBOW[(i + Math.floor(clock / RAINBOW_BAND)) % RAINBOW.length];
  return 'S:' + Math.max(0, step | 0);
}

/** Every ink, in the order the warm-up paints them: the steps from none up, then the rainbow. */
const INK_ORDER = [...STEP_BANDS.slice(0, BEYOND).map((_, s) => 'S:' + s), ...RAINBOW.map((n) => 'R:' + n)];

/**
 * The whole warm-up, one piece per call from the second call on: the next missing floater
 * ink, once all seventeen are done the next piece of a callout, and once all seven are done
 * the next piece of a badge for `game`'s lap and the one after (warmCallouts). Called every
 * frame the renderer draws floaters (renderer.js drawFloaters), title screen included -- the
 * attract run is on the first lap, so the second lap's badge is ready before a run begins.
 */
export function warmComboText(game = null) {
  // Not while a run's fall or its scoreboard is up: nothing is painted in the fall. (The title
  // screen's attract run dies too, and its fall is the menu's time, so it goes on painting.)
  if (game && !game.demo && (game.state === 'falling' || game.state === 'dead')) return;
  if (++inkWarmCalls < 2) return;
  for (const k of INK_ORDER) if (!inks.has(k)) { buildInk(k); return; }
  warmCallouts(game && game.heights ? game.heights.lap : 1);
}

/**
 * The whole of warmComboText's work at once -- every floater ink, the seven callouts, the next
 * two laps' badges -- for the load (main.js), behind LOADING. Returns the calls it took.
 *
 * On the title screen it was painted a piece a frame, the pieces whole (a callout's frame 15 to
 * 21 ms cold, headless): measured in an offscreen Electron window at the title screen's 60 fps,
 * the first 2.3 s after the page came up had frames of 5 to 28 ms of the game's own work, one
 * or more new canvases a frame, where every frame after them was under 2 ms -- a stutter at
 * every launch, and with LOW LATENCY's hint a frame caught half drawn (the user still saw the
 * main menu stutter and flicker at times, 2026-09-29).
 */
export function warmComboTextAll(game = null, cap = 5000) {
  const lap = game && game.heights ? game.heights.lap : 1;
  const done = () => !job && inks.size >= INK_ORDER.length
    && MILESTONES.every((m) => !CALLOUT_PAINTERS[m.name] || callouts.has(m.name))
    && badgeLaps(lap).every((k) => badges.has(k));
  let i = 0;
  for (; i < cap && !done(); i++) warmComboText(game);
  return i;
}

function inkFor(key) {
  const c = inks.get(key);
  if (c) return c;
  stats.inkLate++;
  return buildInk(key);
}

/**
 * How long a floater is drawn one size up when it appears: its pop. [s; 0.06, about ten
 * frames at 160 Hz] Whole pixels -- the next size's own glyphs, not a scaled copy.
 */
export const FLOATER_POP = 0.06;

/**
 * A floater's size in backing pixels per font pixel at `age` seconds: 2, or 3 for a big one
 * (the old scale 2), one more during its pop. The old ones were 4 and 8.
 */
export function floaterPx(scale, age = 1) {
  return (scale >= 2 ? 3 : 2) + (age < FLOATER_POP ? 1 : 0);
}

/** The width of `text` at `g` backing px per font pixel, keyline included, in backing px. */
export function comboTextWidth(text, g) {
  return text.length ? (text.length * 6 - 1) * g + 2 * KEY : 0;
}

/**
 * Draw a floater's `text` centred on view column `cx` with its letters' top on view row
 * `top` (the old floater's anchor), at `g` backing px per font pixel, in the inks of combo
 * step `step`. `clock` walks the rainbow past GLORY. One drawImage a letter.
 */
export function drawComboText(ctx, text, step, cx, top, g, clock = 0) {
  const w = comboTextWidth(text, g);
  const X0 = Math.round(cx * PX - w / 2), Y0 = Math.round(top * PX) - KEY;
  const cw = cellW(g), ch = cellH(g), sy = rowY[g];
  for (let i = 0; i < text.length; i++) {
    const ci = CI.get(text[i]);
    if (ci === undefined) continue;
    const img = inkFor(inkKey(step, i, clock));
    ctx.drawImage(img, ci * cw, sy, cw, ch, (X0 + i * 6 * g) / PX, Y0 / PX, cw / PX, ch / PX);
  }
}

// --- for the tools ------------------------------------------------------------------------

/** Build counts and costs: late builds must stay 0 in play. */
export function calloutStats() {
  return { calloutLate: stats.calloutLate, inkLate: stats.inkLate, badgeLate: stats.badgeLate,
    pieces: stats.pieces.slice(), inkMs: stats.inkMs.slice(), badgePieces: stats.badgePieces.slice(),
    built: [...callouts.keys()], badges: [...badges.keys()], inks: inks.size };
}

/** A finished callout's frames, for the tools to measure: [{ c, w, h, ax, ay }]. */
export const calloutEntry = (name) => callouts.get(name) || null;

/** A finished badge's frames, for the tools: [{ c, w, h, ax, ay, half }]. */
export const badgeEntry = (lap) => badges.get(lap) || null;

export function resetCallouts() {
  callouts.clear(); badges.clear(); inks.clear(); job = null; inkWarmCalls = 0;
  stats.calloutLate = 0; stats.inkLate = 0; stats.badgeLate = 0;
  stats.pieces = []; stats.inkMs = []; stats.badgePieces = [];
}
