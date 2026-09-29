// Zone titles: a zone's name, lettered in the zone's own material, shown as the climb
// crosses into it.
//
// WHAT THIS REPLACED. Entering a zone put up its name as a banner in the game's 5x7 font at
// scale 2 -- 8 x 8 px blocks with a black keyline, in the zone's accent colour -- the same
// letters for every zone, the one piece of the arrival that did not belong to where you had
// arrived. Now each zone letters its own name (titlepaint/<zone>.js): leaves on a frame of
// branches in the forest, cumulus in the storm, polished gold at the zenith, and so on,
// shaped from the same font's letterforms so it still reads as the game's alphabet.
//
// RESOLUTION. The HUD draws in 480 x 270 view units on the 1920 x 1080 store, four backing
// pixels to a unit. A title is painted at ART resolution -- one art pixel per backing pixel,
// the Duke's scale -- so it is drawn at a quarter of its pixel size, from a whole backing
// pixel: its pixels land one to one on the store, never resampled.
//
// COST. Painting a title is tens of milliseconds of per-pixel work -- 13 to 46 ms in
// Chromium, measured in an offscreen window -- far too much for the frame the zone changes
// in, which already carries the flash, a shake and a burst of particles. So every zone's
// title is painted AHEAD: on the title screen, all twelve in turn under TITLE_IDLE_MS of each
// frame (warmTitlesIdle, called by main.js), and in a run, the next zone's if it is still
// missing, under TITLE_WARM_MS of each HUD frame once the zone before has been on screen a
// while. It used to be painted a PIECE per HUD frame in a run only -- the layout, then each
// of its frames in one frame and onto its canvas in the next -- and a piece was 6 to 13 ms in
// Chromium, on top of the frame's own work, every zone: the biggest regular hitch of the
// climb. The painters yield between rows once overdue() (slices.js), so a frame now spends
// its budget and at most one row more. By the time the climb gets there it is a canvas, and a
// frame of the title costs a few drawImage calls: one when it has settled, one per letter (or
// run of letters on the same frame) while it makes its entrance.
//
// PLACE AND TIMING are the old banner's: the top of the centre stack, 2.2 s, and the same
// stepped fade out over the last 0.35 s. What changed is the height: the letters are 81 art
// px tall where the old ones were 56, so the stack moves down by the title's own height
// rather than the old 20 units, or the next banner would land on its lower half.

import { PX, BOARD_SLICE_MS } from '../game/constants.js';
import { THEMES } from '../game/themes.js';
import { pixToCanvas } from './decorpaint/util.js';
import { TITLE_PAINTERS } from './titlepaint/index.js';
import { layoutSteps } from './titlepaint/util.js';
import { overdue, drain, steps, runUntil } from './slices.js';
import { newCanvas, touchCanvas } from './canvases.js';

/**
 * HUD frames a zone is on screen before the next zone's title starts painting in a run,
 * TITLE_WARM_MS of each HUD frame, if the title screen has not painted it already. After the backdrop's warm-up (WARM_AFTER 120, a layer a frame) and the
 * walls' (150), so they do not start in the same frame; a title takes 5 to 15 pieces.
 * [frames; 170 is about 1.1 s at 160 Hz, 2.8 s at 60]
 */
const WARM_AFTER = 170;
/**
 * What painting the next zone's title may take of a HUD frame in a run [ms; 0.5], the same as
 * the scoreboard's BOARD_WARM_MS; resumed under a deadline BOARD_SLICE_MS short of it, since a
 * painter hands the frame back only at its next check.
 */
export const TITLE_WARM_MS = 0.5;
/**
 * What painting titles may take of a title-screen frame [ms; 2.5]: the menus draw at 60 Hz, so
 * a drawn frame has 16 ms, and with the scoreboard's BOARD_IDLE_MS and the attract run's own
 * drawing it still ends inside one 160 Hz period. All twelve titles are about 300 ms of
 * painting in Chromium, so they are done a few seconds after the title screen comes up.
 */
export const TITLE_IDLE_MS = 2.5;
/**
 * How far short of TITLE_IDLE_MS a title-screen frame stops resuming the painters [ms; 1]:
 * the room for the slice that ends past the deadline. Wider than a run's BOARD_SLICE_MS
 * because every title painter runs for the first time on the title screen, cold: with the
 * run's 0.2 ms of room, title-screen calls ran up to a millisecond past their deadline
 * (tools/test-smooth.mjs), where the same slices run warm were all under 0.3 ms. The title
 * screen has the time to leave that room.
 */
const IDLE_ROOM = 1;
/** The exit: the old banners' stepped fade, over this many seconds at the end [s, 0.35]. */
const FADE = 0.35;
/** Clear space under the letters before the next banner in the stack [art px, ~12]. */
const BELOW = 12;

const titles = new Map();      // zone name -> entry, see start()
let shown = null;
let shownFor = 0;
let lateBuilds = 0;

/** A zone's title, not yet painted: build() fills it in. */
function start(theme) {
  const e = {
    name: theme.name, theme, canvas: null, g: null, w: 0, h: 0, next: 0, done: false,
    top: 0, inkH: 0, cuts: null, seq: [], stagger: 0, over: [], sweep: null, seqT: 0,
    ms: [], runs: 0, gen: null,
  };
  e.gen = build(e);
  return e;
}

/**
 * Paint a zone's title, as a generator that yields between rows once its slice is spent: the
 * layout (titlepaint/util.js layoutSteps, the same plan the painter's own default lays out),
 * then every frame painted and put on the canvas a row at a time, then the canvas touched so
 * its first draw in the arrival's frame has nothing left to bring up (canvases.js).
 */
function* build(e) {
  const painter = TITLE_PAINTERS[e.name];
  const plan = yield* layoutSteps(e.name, painter.METRICS);
  const art = painter.paint(e.name, e.theme, plan);
  const w = plan.w | 0, h = plan.h | 0;
  // The canvas in a slice of its own: making it is its whole backing.
  if (overdue()) yield;
  // Titles are kept for the game, so the canvas is the zone's own (not the pool's).
  const { c, g } = newCanvas(w, h * art.frames.length);
  Object.assign(e, {
    canvas: c, g, w, h, top: plan.top, inkH: plan.inkH, cuts: plan.cuts,
    seq: art.seq || [], stagger: art.stagger || 0, over: art.over || [], sweep: art.sweep || null,
    seqT: (art.seq || []).reduce((s, q) => s + q[1], 0),
  });
  for (let f = 0; f < art.frames.length; f++) {
    if (overdue()) yield;
    const pix = yield* steps(art.frames[f]());
    for (let y = 0; y < pix.h; y++) {
      if (overdue()) yield;
      pixToCanvas(pix, g, 0, f * h, y, y + 1);
      e.runs += runsOf(pix, y);
    }
    e.next = f + 1;
  }
  touchCanvas(c);
  e.done = true;
}

/**
 * Paint one zone's title until `until` (a performance.now() time), starting it if it has not
 * been; true once it is finished. For a replay's seek (ui/replays.js), which lands in zones the
 * run never showed and paints their scenery on its own budget before it draws a frame:
 * warmZoneTitles paints only the NEXT zone and only in a live run -- asked from a seek it paints
 * nothing -- and zoneTitle paints whole, which in a replay's frame is a title built late. The
 * seek used the first and fell through to the second, two late builds per seek into an unseen
 * zone, once the titles began to be painted in slices.
 */
export function warmTitleUntil(theme, until) {
  if (!theme || !TITLE_PAINTERS[theme.name]) return true;
  let e = titles.get(theme.name);
  if (e && e.done) return true;
  if (!e) titles.set(theme.name, e = start(theme));
  paintUntil(e, until);
  return e.done;
}

/** Resume a title's build until `until` (a performance.now() time); record what it took. */
function paintUntil(e, until) {
  const t0 = performance.now();
  if (runUntil(e.gen, until).done) e.gen = null;
  e.ms.push(performance.now() - t0);
}

/**
 * fillRect runs row `y` of a Pix costs to put on a canvas: the build cost in draw calls,
 * counted a row at a time with the row it counts (a pass over the whole frame at its end was
 * a slice of its own, up to a millisecond headless, with no check in it).
 */
function runsOf(p, y) {
  const d = p.data;
  let n = 0, prev = -1;
  for (let x = 0; x < p.w; x++) {
    const i = (y * p.w + x) * 4;
    if (!d[i + 3]) { prev = -1; continue; }
    const k = (d[i] << 24) ^ (d[i + 1] << 16) ^ (d[i + 2] << 8) ^ d[i + 3];
    if (k !== prev) n++;
    prev = k;
  }
  return n;
}

/**
 * A zone's finished title, or null if the zone has no painter. Built on the spot if the
 * warm-up has not finished it -- counted, because that is a hitch in the frame that asked.
 */
export function zoneTitle(theme) {
  if (!theme || !TITLE_PAINTERS[theme.name]) return null;
  let e = titles.get(theme.name);
  if (e && e.done) return e;
  lateBuilds++;
  if (!e) titles.set(theme.name, e = start(theme));
  const t0 = performance.now();
  drain(e.gen);
  e.gen = null;
  e.ms.push(performance.now() - t0);
  return e;
}

/**
 * Paint the next zone's title ahead, TITLE_WARM_MS of the call at most. Called once per HUD
 * frame; does nothing until the zone on screen has been there WARM_AFTER frames, nothing once
 * the next title is ready (the title screen has usually painted it already), and nothing
 * outside a run: the HUD is drawn once more as the fire takes him, into the layer it fades out
 * as (screens.js drawHudExit), and nothing may be painted in the fall.
 */
export function warmZoneTitles(game) {
  const th = game.theme, next = game.nextTheme;
  if (shown !== th.name) { shown = th.name; shownFor = 0; }
  if (++shownFor <= WARM_AFTER || !next || next === th || !TITLE_PAINTERS[next.name]) return;
  if (game.state !== 'playing' && game.state !== 'paused') return;
  let e = titles.get(next.name);
  if (e && e.done) return;
  const t0 = performance.now();
  if (!e) titles.set(next.name, e = start(next));
  paintUntil(e, t0 + TITLE_WARM_MS - BOARD_SLICE_MS);
  log(warmTimes, t0);
}

/**
 * On the title screen and the pages over it, paint every zone's title in turn, TITLE_IDLE_MS
 * of the frame at most -- in the order a climb meets them, from the zone after BASEMENT --
 * so a run paints none. Called once a frame by main.js; returns at once in a run, in the fall
 * and on the scoreboard, and once all are done.
 */
let idleDone = false;
export function warmTitlesIdle(game) {
  if (idleDone) return;
  const st = game.state;
  if (st === 'playing' || st === 'paused' || st === 'falling' || st === 'dead') return;
  const t0 = performance.now();
  const until = t0 + TITLE_IDLE_MS - IDLE_ROOM;
  try {
    for (let k = 0; k < THEMES.length; k++) {
      const th = THEMES[(k + 1) % THEMES.length];
      if (!TITLE_PAINTERS[th.name]) continue;
      let e = titles.get(th.name);
      if (e && e.done) continue;
      if (performance.now() >= until) return;
      if (!e) titles.set(th.name, e = start(th));
      paintUntil(e, until);
      if (!e.done) return;
    }
    idleDone = true;
  } finally {
    log(idleTimes, t0);
  }
}

/**
 * When each call painting titles began and ended, in a run and on the title screen, as
 * performance.now() times in turn [t0, t1, ...], the last few thousand: for the tools, which
 * hold them to TITLE_WARM_MS and TITLE_IDLE_MS (tools/test-smooth.mjs).
 */
const warmTimes = [], idleTimes = [];
function log(list, t0) {
  list.push(t0, performance.now());
  if (list.length > 8192) list.splice(0, 4096);
}
export function titleWarmTimes() { return { play: warmTimes.slice(), idle: idleTimes.slice() }; }

/**
 * Draw a zone banner's title -- b.zone is the zone's index in THEMES -- with its top at view
 * row `top`, centred on view column `cx`, in the HUD's transform (PX backing pixels per
 * unit, whole-pixel shake). Returns the view rows it takes in the banner stack, or 0 if the
 * zone has no title (the caller then draws the name as text).
 */
export function drawZoneTitle(ctx, b, cx, top) {
  const e = zoneTitle(THEMES[b.zone]);
  if (!e) return 0;
  const age = b.maxLife - b.life;
  // In backing pixels: whole ones, so every source pixel lands on exactly one store pixel.
  const X0 = Math.round(cx * PX - e.w / 2);
  const Y0 = Math.round(top * PX) - e.top;
  const blit = (f, sx, sw, dy = 0) => {
    if (sw <= 0) return;
    ctx.drawImage(e.canvas, sx, f * e.h, sw, e.h, (X0 + sx) / PX, (Y0 + dy) / PX, sw / PX, e.h / PX);
  };

  const a = Math.min(1, b.life / FADE);
  const was = ctx.globalAlpha;
  ctx.globalAlpha = was * (a > 0.66 ? 1 : a > 0.33 ? 0.7 : 0.4);

  const n = e.cuts.length - 1;
  if (age >= (n - 1) * e.stagger + e.seqT) {
    blit(0, 0, e.w);
  } else {
    // The entrance: each letter's slice from the frame its own clock is on, raised or
    // dropped by the step's whole-pixel offset. Neighbours on the same frame and offset go
    // in one blit, since the slices tile the word.
    let runF = -1, runY = 0, runX = 0;
    for (let i = 0; i <= n; i++) {
      let f = -1, dy = 0;
      if (i < n) {
        const ti = age - i * e.stagger;
        if (ti >= 0) {
          f = 0;
          let acc = 0;
          for (const q of e.seq) {
            if (ti < acc + q[1]) { f = q[0]; dy = q[2] || 0; break; }
            acc += q[1];
          }
        }
      }
      if (i < n && f === runF && dy === runY) continue;
      if (runF >= 0) blit(runF, runX, e.cuts[i] - runX, runY);
      runF = f;
      runY = dy;
      runX = i < n ? e.cuts[i] : 0;
    }
  }
  for (const [f, t0, t1] of e.over) if (age >= t0 && age < t1) blit(f, 0, e.w);
  const sw = e.sweep;
  if (sw && age >= sw.from && age < sw.from + sw.dur) {
    const x = Math.round(-sw.band + (e.w + sw.band) * (age - sw.from) / sw.dur);
    const x0 = Math.max(0, x), x1 = Math.min(e.w, x + sw.band);
    blit(sw.frame, x0, x1 - x0);
  }
  ctx.globalAlpha = was;
  return zoneTitleRows(b);
}

/** The view rows a zone banner's title takes in the stack, or 0 if it has none. */
export function zoneTitleRows(b) {
  const e = zoneTitle(THEMES[b.zone]);
  return e ? Math.ceil((e.inkH + BELOW) / PX) : 0;
}

/** Build cost of a zone's title once built: ms per call that painted it, and fillRect runs. */
export function titleStats(name) {
  const e = titles.get(name);
  return e ? { ms: e.ms.slice(), runs: e.runs, frames: e.next, done: e.done, w: e.w, h: e.h } : null;
}

/** Titles built in the frame that needed them, rather than ahead. Zero in a warmed run. */
export function titleLateBuilds() { return lateBuilds; }

export function resetZoneTitles() { titles.clear(); shown = null; shownFor = 0; lateBuilds = 0; idleDone = false; }
