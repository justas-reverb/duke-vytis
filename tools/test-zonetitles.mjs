// The zone titles: every zone lettered, painted ahead of its arrival, announced once, and
// legible over its own backdrop.
//
//   node tools/test-zonetitles.mjs
//
// WHAT IT HOLDS THEM TO (src/render/zonetitles.js, the painters in src/render/titlepaint/)
//
//   1. EVERY ZONE  every name in THEMES has a painter of its own in TITLE_PAINTERS (a zone
//                  without one falls back to the plain font banner, silently).
//   2. AHEAD       a real climb: the attract bot from the ground to floor 2640, which is
//                  every zone of the first cycle and then DUNGEON, CITADEL and BASEMENT
//                  of the second -- all twelve arrivals, BASEMENT's included, and two
//                  zones met a second time. The HUD is drawn every fourth step, 60 frames a
//                  second against the 240 Hz simulation: the slowest display the game
//                  runs on, and so the fewest HUD frames a title has to be painted in (the
//                  warm-up is a piece per HUD FRAME, not per second). At every arrival the
//                  arriving zone's title must already be finished, and over the whole climb
//                  none may be built in the frame that needed it (titleLateBuilds): that
//                  is a hitch of tens of milliseconds in the frame that already carries the
//                  arrival's flash, shake and burst, and nothing on screen shows it -- only
//                  this count does. The margin, the fewest HUD frames any title was ready
//                  before its arrival, is printed.
//                  Once built, every title is a canvas of its painter's frames, none of
//                  them empty, and a settled title costs the frame ONE drawImage of it and
//                  no painting at all.
//   3. ONCE        in the same climb, each arrival puts up exactly one zone banner, in the
//                  step the zone changes, naming that zone and marked with its index so the
//                  HUD letters it (zoneTitleRows > 0); no zone banner fires without an
//                  arrival.
//   4. LEGIBLE     each settled title over its own zone's backdrop -- the sky and its three
//                  parallax layers, drawn by the game's Backdrop -- at the place the HUD
//                  draws it, at four camera heights over the thirty floors it is up for
//                  after the zone's first arrival (for BASEMENT, floor 2600 of the second
//                  cycle): the 2.2 s it shows, at the bot's 14 floors a second. The letters
//                  are the title's opaque pixels brighter than its outline and shadow
//                  (relative luminance 0.03, about sRGB 48); the backdrop is taken across
//                  the letters' bounding box. The measure is WCAG's contrast ratio between
//                  the letters' mean luminance and the backdrop's median, and the floor is
//                  2.5:1. It is MEASURED, not WCAG's 3:1: the weakest title today is
//                  BASEMENT's cellar brick over the cellar's own brick at 2.7:1 (it reads,
//                  on the black-brown outline and shadow round every letter, and the user
//                  has seen it), and every other is 3.9:1 or better. The same letters given
//                  the tones of the backdrop behind them measure 1.4:1 at worst -- the check
//                  is run on exactly that as well, to prove it bites. And because the
//                  letters are picked by being brighter than the outline, at least half of
//                  every title's solid pixels must be letter (BASEMENT, the most outlined,
//                  is 69%): repainted in the cellar's own violets, BASEMENT's bricks all
//                  fell under 0.03, and the ratio was taken from its pale dust alone --
//                  5.7:1 for a word nobody could read.
//                  The title canvas only says WHICH pixels are letters; their brightness is
//                  read in the frame itself, the HUD drawn over the backdrop with the banner
//                  up, as the game draws it. The first version read the letters' tones off
//                  the title's own canvas, which is a picture of the title, not of what
//                  reaches the screen: with drawZoneTitle drawing every title at a fifth of
//                  its alpha -- twelve titles nobody could read -- it still passed.
//
// Everything is seeded (Math.random per climb), so a failure reproduces.

import { installDom, HeadlessCanvas } from './headless.mjs';

installDom();

const { mulberry32 } = await import('../src/core/rng.js');
const { Game, STATE } = await import('../src/game/game.js');
const { AutoInput, AutoPlayer, DEMO_SEEDS, startDemo } = await import('../src/game/autoplay.js');
const { STEP } = await import('../src/core/loop.js');
const C = await import('../src/game/constants.js');
const { drawHud } = await import('../src/ui/hud.js');
const Stats = await import('../src/game/stats.js');
const ZT = await import('../src/render/zonetitles.js');
const { TITLE_PAINTERS } = await import('../src/render/titlepaint/index.js');
const { THEMES, themeIndexFor } = await import('../src/game/themes.js');

const PX = C.PX, SW = C.SW;

let fails = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) fails++; return cond; };

// --- 1. every zone has a painter ------------------------------------------------------
// Asked of the registry only: nothing is painted before the climb, or the climb would find
// titles already built and could not see one built late.
{
  const missing = THEMES.filter((t) => !TITLE_PAINTERS[t.name] || typeof TITLE_PAINTERS[t.name].paint !== 'function');
  const extra = Object.keys(TITLE_PAINTERS).filter((n) => !THEMES.some((t) => t.name === n));
  ok(!missing.length && !extra.length,
    `every zone has a title painter of its own (${THEMES.length} zones` +
    (missing.length ? `; missing: ${missing.map((t) => t.name).join(', ')}` : '') +
    (extra.length ? `; painters for no zone: ${extra.join(', ')}` : '') + ')');
}

// --- 2 and 3. a real climb ----------------------------------------------------------------

/** Everything wrong with the zone banners a climb fired, given its arrivals. */
function bannerProblems(arrivals, banners) {
  const p = [];
  for (const a of arrivals) {
    const mine = banners.filter((b) => b.step === a.step);
    if (mine.length !== 1) p.push(`${a.name} at floor ${a.floor}: ${mine.length} zone banners in its step`);
    else if (mine[0].zone !== a.zone || mine[0].text !== a.name) p.push(`${a.name} at floor ${a.floor}: the banner says ${mine[0].text} (zone ${mine[0].zone})`);
    else if (!(mine[0].rows > 0)) p.push(`${a.name}: the HUD would print its banner as plain text (zoneTitleRows 0)`);
  }
  for (const b of banners) {
    if (!arrivals.some((a) => a.step === b.step)) p.push(`a zone banner for ${b.text} with no arrival (step ${b.step})`);
  }
  return p;
}

// The floor the climb must reach. BASEMENT's second-cycle band starts at 2600, and the climb
// goes on 40 floors past it -- about three seconds at the bot's pace -- so its title's whole
// 2.2 s is drawn by the HUD too. Stopping at 2601 ended the climb in the step BASEMENT
// arrived, before any frame had drawn it, and a late build of it went uncounted.
const TO = 2640;
const FRAME = 4;            // simulation steps per HUD frame: 60 Hz against 240 Hz
let run = null;
const deaths = [];
for (let si = 0; si < DEMO_SEEDS.length && !run; si++) {
  // A fresh run from the ground each try. Titles are never freed, so a second try has to
  // start with none built or it could not see a late one.
  ZT.resetZoneTitles();
  Math.random = mulberry32(99 + si);
  // A 1 x 1 canvas: every line of the HUD runs, and almost no pixel is filled, so the whole
  // climb costs about a second and a half. No Renderer here, so no canvas is resized under
  // the context (the stale-context trap in headless-canvas-fidelity).
  const ctx = new HeadlessCanvas(1, 1).getContext('2d');
  const input = new AutoInput();
  const game = new Game(input);
  const bot = new AutoPlayer(input);
  // The attract run, as the menu starts it (autoplay.js startDemo): a player's tower and fire
  // at the game's default settings since 2026-09-29, where the bot climbs about 25 floors a
  // second, the fastest the zones go by anywhere; a player's game warms titles the same way.
  // (It was the flow tower at 100% until then, about 14 floors a second, under a slowed fire.)
  startDemo(game, DEMO_SEEDS[si]);
  const all = Stats.BLANK_ALL();
  const arrivals = [], banners = [];
  let frames = 0, zoneFrame = 0, last = game.themeIndex;
  // The HUD frame of this zone's stay at which the next zone's title was finished, if it
  // was painted during this stay; -2 if it was already built (a zone met a second time).
  let readyAt = -1;
  let prevBanners = [];
  for (let i = 0; i < 240 * 400 && game.state === STATE.PLAYING && game.run.maxFloor < TO; i++) {
    bot.step(game, STEP);
    game.step(STEP);
    // The arrival first: nothing this harness does may touch the titles before it has asked
    // whether the arriving one is ready. (Asking the banner's rows here built it, late, and
    // the question then always answered yes.)
    if (game.themeIndex !== last) {
      const name = game.theme.name;
      const st = ZT.titleStats(name);
      arrivals.push({ step: i, zone: game.themeIndex, name, floor: game.run.maxFloor,
        ready: !!(st && st.done), frames: zoneFrame, margin: readyAt < 0 ? readyAt : zoneFrame - readyAt });
      last = game.themeIndex;
      zoneFrame = 0;
      const nx = ZT.titleStats(game.nextTheme.name);
      readyAt = nx && nx.done ? -2 : -1;
    }
    for (const b of game.banners) {
      if (b.zone !== undefined && !prevBanners.includes(b)) banners.push({ step: i, zone: b.zone, text: b.text, b });
    }
    prevBanners = game.banners.slice();
    if (i % FRAME === FRAME - 1) {
      ctx.setTransform(PX, 0, 0, PX, 0, 0);
      drawHud(ctx, game, all, i * STEP);
      frames++;
      zoneFrame++;
      if (readyAt === -1) {
        const nx = ZT.titleStats(game.nextTheme.name);
        if (nx && nx.done) readyAt = zoneFrame;
      }
    }
  }
  const late = ZT.titleLateBuilds();
  // Whether the HUD letters each banner, asked once the climb is over and counted: asking
  // builds the title if it is missing.
  for (const r of banners) { r.rows = ZT.zoneTitleRows(r.b); r.maxLife = r.b.maxLife; delete r.b; }
  if (game.run.maxFloor >= TO) run = { seed: si, arrivals, banners, frames, secs: frames / 60, late };
  else deaths.push(`demo tower ${si} ended at floor ${game.run.maxFloor} (${game.state})`);
}

if (ok(!!run, `the attract bot climbed to floor ${TO}` + (deaths.length ? ` (${deaths.join('; ')})` : ''))) {
  const { arrivals, banners } = run;
  const seen = new Set(arrivals.map((a) => a.name));
  ok(seen.size === THEMES.length,
    `the climb arrived in all ${THEMES.length} zones: ${arrivals.length} arrivals over ${run.secs.toFixed(0)} s of HUD frames at 60 Hz` +
    (seen.size < THEMES.length ? `; never: ${THEMES.filter((t) => !seen.has(t.name)).map((t) => t.name).join(', ')}` : ''));
  const unready = arrivals.filter((a) => !a.ready);
  const margins = arrivals.filter((a) => a.margin >= 0);
  const tight = margins.reduce((m, a) => (a.margin < m.margin ? a : m), { margin: Infinity, name: '-' });
  const shortest = arrivals.reduce((m, a) => (a.frames < m.frames ? a : m), { frames: Infinity });
  ok(!unready.length,
    `every title was finished before its zone arrived` +
    (unready.length ? `; not: ${unready.map((a) => `${a.name} at ${a.floor}`).join(', ')}` : '') +
    (margins.length ? ` (of the ${margins.length} painted during the stay before, the tightest was ${tight.name}'s, ready ${tight.margin} HUD frames ahead;` : ' (none was painted ahead;') +
    ` the shortest stay in a zone was ${shortest.frames} frames)`);
  ok(run.late === 0, `no title built in the frame that needed it over the climb (late builds: ${run.late})`);

  const bp = bannerProblems(arrivals, banners);
  ok(!bp.length, `one zone banner per arrival, in its step, lettered by the HUD (${banners.length} banners, ${arrivals.length} arrivals)` +
    (bp.length ? `: ${bp.slice(0, 4).join('; ')}` : ''));
  // The check itself, against banner logs built to fail it.
  const a0 = arrivals[0];
  const good = { step: a0.step, zone: a0.zone, text: a0.name, rows: 20 };
  const broken = [
    ['twice', [good, { ...good }]],
    ['none', []],
    ['wrong zone', [{ ...good, zone: (a0.zone + 1) % THEMES.length }]],
    ['plain text', [{ ...good, rows: 0 }]],
    ['stray', [good, { ...good, step: a0.step + 7 }]],
  ];
  const missed = broken.filter(([, log]) => !bannerProblems([a0], log).length).map(([n]) => n);
  ok(!missed.length, `the banner check fails logs built to fail it` + (missed.length ? `; it passed: ${missed.join(', ')}` : ''));
}

// Every title built, frame by frame, and cheap to draw once built. Only titles the climb
// finished are asked for, and zoneTitle() on a finished title builds nothing.
const tiny = new HeadlessCanvas(1, 1).getContext('2d');
const settledAge = (e, maxLife) => {
  let s = (e.cuts.length - 2) * e.stagger + e.seqT;
  for (const [, , t1] of e.over) s = Math.max(s, t1);
  if (e.sweep) s = Math.max(s, e.sweep.from + e.sweep.dur);
  return Math.min(maxLife - 0.36, s + 0.01);   // before the stepped fade of the last 0.35 s
};
// The banner's life, as the game gave it (game.js fires zone banners with 2.2 s).
const MAXLIFE = run && run.banners.length ? run.banners[0].maxLife : 2.2;
{
  const bad = [];
  for (const th of THEMES) {
    const st = ZT.titleStats(th.name);
    if (!st || !st.done) { bad.push(`${th.name} never finished`); continue; }
    const e = ZT.zoneTitle(th);
    const nF = st.frames;
    if (e.canvas.width !== e.w || e.canvas.height !== e.h * nF) bad.push(`${th.name} canvas ${e.canvas.width}x${e.canvas.height}, want ${e.w}x${e.h * nF}`);
    const d = e.canvas.data;
    for (let f = 0; f < nF; f++) {
      let n = 0;
      for (let i = f * e.w * e.h * 4 + 3; i < (f + 1) * e.w * e.h * 4; i += 4) if (d[i]) n++;
      if (!n) bad.push(`${th.name} frame ${f} is empty`);
    }
    // A settled title in the frame: count what the HUD does to draw it. (The row it is
    // drawn at does not matter to the count; 150 is the HUD's banner row.)
    let blits = 0, other = 0;
    const di = tiny.drawImage, fr = tiny.fillRect;
    tiny.drawImage = function (img) { if (img === e.canvas) blits++; else other++; };
    tiny.fillRect = function () { other++; };
    ZT.drawZoneTitle(tiny, { zone: THEMES.indexOf(th), life: MAXLIFE - settledAge(e, MAXLIFE), maxLife: MAXLIFE }, C.VW / 2, 150);
    tiny.drawImage = di; tiny.fillRect = fr;
    if (blits !== 1 || other) bad.push(`${th.name} settled costs ${blits} blits of its canvas and ${other} other calls`);
  }
  ok(!bad.length, `all ${THEMES.length} titles built, every frame painted, a settled one drawn with one drawImage` +
    (bad.length ? `: ${bad.slice(0, 5).join('; ')}` : ''));
}

// --- 4. legible over the zone's own backdrop ----------------------------------------------
// The BACKDROP: the zone's sky and its three parallax layers, drawn by the game's own
// Backdrop at the camera the game settles at on each floor, zoom 1. Not the ledges, the
// walls or the fire: a ledge passes behind a title for a moment (CITADEL's pale stone
// under CITADEL's pale letters, at floor 914), while the backdrop is behind it for the
// whole 2.2 s, and in every zone.
const { Backdrop } = await import('../src/render/backdrop.js');

const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (d, i) => 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const median = (arr) => Float64Array.from(arr).sort()[arr.length >> 1];

/** The outline and drop shadow are darker than this; the letters are not. [relative luminance] */
const INK_MIN = 0.03;
/** The floor: letters' mean against the backdrop's median behind them. [WCAG ratio; 2.5] */
const FLOOR = 2.5;
/**
 * The least share of a title's solid pixels that are letter rather than outline or shadow.
 * [0..1; 0.5 -- BASEMENT, the most outlined, is 0.69, the dot and line titles all letter]
 */
const LETTERS_MIN = 0.5;

// The first floor each zone arrives on (BASEMENT's is 2600, in the second cycle).
const ARRIVE = {};
for (let f = 1; f < 2 * 2300; f++) {
  const n = THEMES[themeIndexFor(f)].name;
  if (themeIndexFor(f) !== themeIndexFor(f - 1) && !(n in ARRIVE)) ARRIVE[n] = f;
}

/**
 * A settled title's legibility over a backdrop frame: { ratio, ghost, share }. `bare` is the
 * backdrop alone and `shown` the same frame with the HUD drawn over it; the title's canvas
 * picks the letter pixels, and their luminance is read from `shown` -- what reached the
 * screen. ghost is the same measure with every letter pixel given the luminance of the
 * backdrop behind it -- the title repainted in its backdrop's own tones.
 */
function titleContrast(e, X0, Y0, bare, shown) {
  const cd = e.canvas.data, cw = e.canvas.width;
  let sum = 0, ghost = 0, n = 0, opaque = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  for (let y = 0; y < e.h; y++) {
    for (let x = 0; x < e.w; x++) {
      const s = (y * cw + x) * 4;
      if (cd[s + 3] < 255) continue;
      opaque++;
      if (lum(cd, s) < INK_MIN) continue;
      const k = ((Y0 + y) * SW + X0 + x) * 4;
      sum += lum(shown, k);
      ghost += lum(bare, k);
      n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (!n) return { ratio: 1, ghost: 1, share: 0 };
  const bg = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) bg.push(lum(bare, ((Y0 + y) * SW + X0 + x) * 4));
  const med = median(bg);
  return { ratio: contrast(sum / n, med), ghost: contrast(ghost / n, med), share: n / opaque };
}

{
  const all = Stats.BLANK_ALL();
  // Its size set when it is made, and the context taken after: nothing resizes it later.
  const canvas = new HeadlessCanvas(C.SW, C.SH);
  const g = canvas.getContext('2d');
  const backdrop = new Backdrop();
  // A game only to hand the HUD, so the HUD says where it puts the title.
  const hudGame = new Game(new AutoInput());
  hudGame.newRun(1);
  const rows = [], shares = [];
  let ghostWorst = 0;
  for (const th of THEMES) {
    const zi = THEMES.indexOf(th);
    const e = ZT.zoneTitle(th);
    if (!e) { rows.push([th.name, -1]); continue; }       // no painter: failed in 1 already
    const age = settledAge(e, MAXLIFE);
    // Where the HUD puts the settled title: ask the HUD, on a canvas of one pixel, with the
    // banner up, rather than copying its layout here.
    let pos = null;
    const di = tiny.drawImage;
    tiny.drawImage = function (img, sx, sy, sw, sh, dx, dy) { if (img === e.canvas && sx === 0 && sy === 0) pos = [dx * PX, dy * PX]; };
    hudGame.themeIndex = zi;
    hudGame.banners = [{ text: th.name, colour: th.accent, big: true, life: MAXLIFE - age, maxLife: MAXLIFE, zone: zi }];
    tiny.setTransform(PX, 0, 0, PX, 0, 0);
    drawHud(tiny, hudGame, all, 0.2);
    tiny.drawImage = di;
    if (!pos) { rows.push([th.name, -1]); continue; }
    const [X0, Y0] = pos.map(Math.round);
    let worst = Infinity, share = 0;
    // Four camera heights over the thirty floors a title is up for. Between the first and
    // the last the far layer moves 86 of the 128 units it repeats in, the near one 245.
    for (const floor of [2, 10, 18, 26].map((k) => ARRIVE[th.name] + k)) {
      const camY = floor * C.FLOOR_H - C.VH * C.CAM_ANCHOR;
      g.setTransform(PX, 0, 0, PX, 0, 0);
      backdrop.draw(g, camY, zi, th, th, 0);
      const bare = canvas.data.slice();
      // Then the HUD over it, the banner still up, in the transform main.js draws it in.
      g.setTransform(PX, 0, 0, PX, 0, 0);
      drawHud(g, hudGame, all, 0.2);
      const m = titleContrast(e, X0, Y0, bare, canvas.data);
      worst = Math.min(worst, m.ratio);
      share = m.share;
      ghostWorst = Math.max(ghostWorst, m.ghost);
    }
    rows.push([th.name, worst]);
    shares.push([th.name, share]);
  }
  // Letters brighter than their outline, first: a title whose letters were as dark as its
  // outline would have almost none left to measure below -- only its brightest specks
  // (cellar brick repainted in the cellar's own violets measured 5.7:1 on its dust alone).
  const dim = shares.filter(([, s]) => !(s >= LETTERS_MIN));
  const sh = shares.map(([, s]) => s);
  ok(!dim.length, `every title's letters are brighter than its outline: ${Math.round(100 * Math.min(...sh))}-${Math.round(100 * Math.max(...sh))}% ` +
    `of its solid pixels, at least ${100 * LETTERS_MIN}%` + (dim.length ? `; not: ${dim.map(([n, s]) => `${n} ${Math.round(100 * s)}%`).join(', ')}` : ''));
  rows.sort((a, b) => a[1] - b[1]);
  const low = rows.filter(([, r]) => !(r >= FLOOR));
  ok(!low.length, `every title reads over its own backdrop at ${FLOOR}:1 or better: ` +
    rows.map(([n, r]) => `${n} ${r < 0 ? 'NOT DRAWN' : r.toFixed(1)}`).join(', '));
  ok(ghostWorst < FLOOR, `the measure fails a title in its backdrop's own tones (at most ${ghostWorst.toFixed(2)}:1 across the ${THEMES.length * 4} frames)`);
}

console.log(fails ? `\n  ${fails} check(s) FAILED` : `\n  zone titles: all ${THEMES.length} painted ahead, announced once, legible over their backdrops`);
process.exit(fails ? 1 : 0);
