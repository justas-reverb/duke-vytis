// The scoreboard is painted ahead, a sliver of a frame at a time, and never while he falls.
//
//   node tools/test-boardwarm.mjs
//
// WHAT IT HOLDS IT TO (src/render/gameoverskin.js warmBoards and deathBoard, the painters it
// slices through src/render/slices.js, called by src/main.js once a frame)
//
// The board in the style of the zone a run ends in is tens of milliseconds of painting. It
// was painted while he fell, a piece a frame -- up to 22-46 ms in Chromium at 160 Hz,
// where a frame is 6.25 ms -- and SPACE in the fall's first frames left the rest to the
// board's first frame. The user asked for the fall to be smooth. So:
//
//   1. NOTHING IN THE FALL  over many deaths staged the way the game runs them -- the zone
//                    entered by climbing into it (its arrival fired by the simulation), a
//                    death in every zone, from the very frame of the zone's arrival to
//                    seconds after it, the fall played out or cut short by SPACE one to three
//                    frames in, at 160 Hz and at 60, in sessions that begin cold (only
//                    BASEMENT's board painted, as after loading) and sessions that sat on the
//                    menu first -- not one frame of FALLING or DEAD paints anything: warmBoards
//                    returns before it so much as reads the clock, nothing anywhere in the
//                    frame's drawing reads it from the board's code (slices.js,
//                    gameoverskin.js: a slice run under a deadline reads it at every check,
//                    even one that only walks pixels and puts nothing on a canvas), no board
//                    piece is finished, and nothing is drawn into any canvas but the screen
//                    and the impact's words (which are put together from the lettering
//                    painted at load, one drawImage a letter), and no canvas is made -- a
//                    piece of the menus' lettering the board or the fall asked for that the
//                    load had not painted would be one. The main loop is emulated as
//                    src/main.js runs it: the 240 Hz simulation, then the frame's drawing for
//                    its state (the fall's words, the board), then warmBoards.
//   2. A FULL BOARD  every death is drawn in a board that is all painted: the zone's own if
//                    it was finished, else the last finished zone's (counted: fallbacks).
//                    Every character the words ask for has a glyph (boardStats().missing).
//   3. THE BUDGET    in the deaths above, the warm-up's time per frame, measured round the
//                    call, the collector's pauses inside it taken out (they are the whole
//                    process's garbage, reported apart): at p99 of the frames that painted, at
//                    most BOARD_WARM_MS in play and BOARD_IDLE_MS on the menus -- the budget
//                    itself, not the budget and a slice more: the painters are stopped
//                    BOARD_SLICE_MS short of it for the slice that ends past the deadline.
//                    (p99.9 in play came to 0.44-0.49 ms against the 0.5, too near the noise
//                    of a shared machine to hold; it is reported.) Reported: max, p99 and p99.9 per
//                    frame in play, on the menus and in the fall, the frames over the budget
//                    and the collector's pauses, the painted boards' memory, and how long
//                    after a zone's arrival its board was finished.
//   4. ONE SLICE PAST THE DEADLINE, AND EVERY SLICE SMALL
//                    every zone's board painted with the deadline already past at each check,
//                    so each warmBoards call resumes the painters for exactly one slice: the
//                    board takes the same number of calls in three paintings (so the deadline
//                    stops them every time), is pixel for pixel the board painted in one go,
//                    and the slices -- each timed as the fastest of the three -- fit the room
//                    kept for them: p99.9 within BOARD_SLICE_MS, none over SLICE_MAX. That,
//                    with the deadline, is what bounds every frame; 3 checks the frames as
//                    they came.
//
// Headless timings: the painters are plain JavaScript and run as fast here as in a browser;
// the canvas calls are this canvas's (headless-canvas-fidelity), slower per pixel. Timings
// on this machine move with whatever else it runs; the structural checks (1, 2, 4's counts
// and pixels) do not.

import { PerformanceObserver } from 'node:perf_hooks';
import { installDom, HeadlessCanvas } from './headless.mjs';

installDom();
{
  const mem = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) },
  });
}

// The clock the warm-up reads, counted: in the fall it must not be read at all. Counted
// round warmBoards (nowCalls), and over the whole of a fall's frame, drawing and all, where
// the read comes from the board's own code (boardReads): a slice resumed anywhere in the
// fall -- when the death's board is chosen, say -- reads it at its first check, whatever
// else it does or does not do. Only the fall's frames pay for the stack.
const realNow = performance.now.bind(performance);
let nowCalls = 0, boardReads = 0, watchFall = false;
performance.now = () => {
  nowCalls++;
  if (watchFall && /slices\.js|gameoverskin\.js/.test(new Error().stack)) boardReads++;
  return realNow();
};

// The collector's pauses, on the same clock. A pause that lands inside the warm-up's call is
// the whole process's garbage being collected -- the simulation's, the tools' -- not a slice
// that ran long; the budget is held on the warm-up's own time, and the pauses are reported.
const gcs = [];
new PerformanceObserver((list) => { for (const e of list.getEntries()) gcs.push([e.startTime, e.startTime + e.duration]); })
  .observe({ entryTypes: ['gc'] });

// Every canvas call that lands anywhere but the screen, and every canvas made.
const screen = new HeadlessCanvas(1, 1);
const tiny = screen.getContext('2d');
const off = { fill: 0, stray: 0, made: [] };
{
  const P = Object.getPrototypeOf(tiny);
  const fr = P.fillRect, di = P.drawImage;
  P.fillRect = function (...a) { if (this.canvas !== screen) off.fill++; return fr.apply(this, a); };
  P.drawImage = function (...a) { if (this.canvas !== screen && !this.canvas.boardWord) off.stray++; return di.apply(this, a); };
  const ce = document.createElement;
  document.createElement = (tag) => { const c = ce(tag); if (tag === 'canvas') off.made.push(c); return c; };
}

const G = await import('../src/game/game.js');
const C = await import('../src/game/constants.js');
const { THEMES } = await import('../src/game/themes.js');
const { AutoInput } = await import('../src/game/autoplay.js');
const { STEP } = await import('../src/core/loop.js');
const { mulberry32 } = await import('../src/core/rng.js');
const Stats = await import('../src/game/stats.js');
const S = await import('../src/ui/screens.js');
const GS = await import('../src/render/gameoverskin.js');
const { STATE } = G;

let fails = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) fails++; return cond; };
const t0 = Date.now();
const pct = (arr, p) => { const s = Float64Array.from(arr).sort(); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };

/**
 * The longest a painter may run between two of its checks [ms], a guard against a pass
 * painted without one. warmBoards stops resuming the painters at its deadline, and a painter
 * yields at its next check -- after a row of a pass over the pixels, a blit of an atlas, a
 * few puffs of a cloud -- so a frame's warm-up ends at most one slice past the deadline; the
 * deadline is BOARD_SLICE_MS short of the budget, which almost every slice fits (held at
 * p99.9 below). Measured headless (each slice the fastest of three paintings): 2 us at the
 * median, 0.03 ms at p99, 0.07 at p99.9, 0.15 to 0.34 ms the longest, on this machine with
 * other work running; 0.5 leaves room for that load, and a piece painted without a check --
 * a panel was tens of milliseconds -- fails it many times over.
 */
const SLICE_MAX = 0.5;

const zoneFloor = (i) => (i === 0 ? 0 : C.FIRST_THEME_FLOORS + (i - 1) * C.FLOORS_PER_THEME);
const ALL = Stats.BLANK_ALL();

/** Put him on a ledge a few floors into zone z, as a climb would; the step fires the arrival. */
function enterZone(g, z) {
  const F = zoneFloor(z) + 3;
  if (z > 0 && g.openness < 1) {
    g.openness = 1;
    g.arenaEase = g.arenaHalf = g.arenaHalfView = C.ARENA_HALF_MAX;
    g.arenaStep = 4;
    g.zoom = g.zoomView = 1;
    g.viewH = C.VH;
    g.tower.setBounds(C.PLAY_L, C.PLAY_R);
    g.player.setBounds(C.PLAY_L, C.PLAY_R);
  }
  g.tower.ensure(F + 14);
  const pl = g.tower.get(F);
  const p = g.player;
  p.x = p.px = pl.x + pl.w / 2;
  p.y = p.py = pl.y;
  p.vx = 0; p.vy = 0;
  p.floor = F;
  g.run.maxFloor = Math.max(g.run.maxFloor, F);
  g.camY = p.y - g.viewH * C.CAM_ANCHOR;
  g.riseY = p.y - 300;
}

// --- the frame loop, as src/main.js runs it -------------------------------------------------
const rec = {
  play: [], menu: [], fall: [],      // warm-up ms per frame
  inFall: 0, fallFrames: 0, deadFirst: 0,
  badFall: [], deaths: [], fallbacks: 0, memMax: 0, perBoard: 0, readyAfter: [],
};
function frame(W, hz, skipNow = false) {
  const g = W.game;
  if (skipNow) g.skipFall();
  // The fire is held off until the death is wanted: he stands on a ledge, and the staging
  // decides when it takes him.
  if (g.state === STATE.PLAYING && g.riseActive) g.riseY = Math.min(g.riseY, g.player.y - 300);
  W.acc += 1 / hz;
  while (W.acc >= STEP) { g.step(STEP); W.acc -= STEP; }
  W.uiT += 1 / hz;
  const st = g.state;
  const first = st === STATE.DEAD && W.prevState !== STATE.DEAD;
  W.prevState = st;
  const f0 = off.fill, s0 = off.stray, m0 = off.made.length;
  const done0 = GS.boardStats().done.join();
  const slices0 = GS.boardStats().slices;
  watchFall = st === STATE.FALLING || st === STATE.DEAD;
  boardReads = 0;
  if (st === STATE.FALLING) {
    S.drawFalling(tiny, g, W.uiT, null);
    S.drawFallWords(tiny, g, W.uiT);
  } else if (st === STATE.DEAD) {
    S.drawGameOver(tiny, g, ALL, [], [], W.uiT);
  }
  nowCalls = 0;
  const a = realNow();
  GS.warmBoards(g);
  const win = [a, realNow()];
  watchFall = false;
  if (st === STATE.PLAYING || st === STATE.PAUSED) rec.play.push(win);
  else if (st === STATE.FALLING || st === STATE.DEAD) {
    rec.fall.push(win);
    rec.fallFrames++;
    if (first) rec.deadFirst++;
    const bs = GS.boardStats();
    const madeHere = off.made.slice(m0);
    const why = [];
    if (nowCalls) why.push(`warmBoards read the clock ${nowCalls} times`);
    if (boardReads) why.push(`the board's code read the clock ${boardReads} times in the frame`);
    if (bs.slices !== slices0) why.push('a slice ran');
    if (bs.done.join() !== done0) why.push('a board was finished');
    if (off.fill !== f0) why.push(`${off.fill - f0} fillRect off the screen`);
    if (off.stray !== s0) why.push(`${off.stray - s0} drawImage into a canvas that is not a word`);
    if (madeHere.some((c) => !c.boardWord)) why.push('a canvas made that is not a word');
    if (why.length) rec.badFall.push(`${THEMES[g.themeIndex].name} ${st}${first ? ' (first)' : ''}: ${why.join(', ')}`);
  } else rec.menu.push(win);
  if (g.state === STATE.PLAYING) {
    const cur = g.theme.name;
    if (W.zone !== cur) { W.zone = cur; W.zoneAt = W.uiT; W.zoneReady = null; }
    if (W.zoneReady === null && GS.boardStats().done.includes(cur)) {
      W.zoneReady = W.uiT - W.zoneAt;
      rec.readyAfter.push(W.zoneReady);
    }
  }
}

/** Frames of one state for `sec` seconds, at `hz`. */
function run(W, hz, sec) {
  const n = Math.max(1, Math.round(sec * hz));
  for (let i = 0; i < n; i++) frame(W, hz);
}

/**
 * A death: a run from the ground through zones 0..Z, `dwell` seconds in each of the two
 * before Z (a frame in the ones before those: only the last two decide what is painted when
 * he reaches Z), then the fire takes him `d` seconds after Z's arrival; the fall plays out,
 * or SPACE cuts it `skip` frames in; then a moment of the board.
 */
function death(W, hz, Z, dwell, d, skip) {
  const g = W.game;
  g.newRun(0x51ce + rec.deaths.length * 7919);
  W.prevState = g.state;
  for (let z = 0; z <= Z; z++) {
    if (z > 0) enterZone(g, z);
    run(W, hz, z < Z && z >= Z - 2 ? dwell : 0);
  }
  if (d > 0) run(W, hz, d - 1 / hz);
  // The catch, in the next frame's simulation: the fire at his feet.
  g.riseY = g.player.y;
  g.caughtByFloor();
  const zone = g.theme.name;
  const fallbacks0 = GS.boardStats().fallbacks;
  frame(W, hz);                                   // the first frame of the fall
  for (let k = 1; g.state === STATE.FALLING; k++) frame(W, hz, skip !== null && k === skip);
  run(W, hz, 0.3);                                // the board
  const board = GS.boardSkinFor(g);
  const fell = GS.boardStats().fallbacks > fallbacks0;
  if (fell) rec.fallbacks++;
  // Every piece a board has: its title's words and its panels. (A literal count here went
  // stale the day the board's thirteen glyph atlases gave way to the menus' lettering.)
  const full = board.done && Object.keys(board.parts).length === GS.TITLE_WORDS.length + Object.keys(GS.PANELS).length;
  rec.deaths.push({ zone, hz, Z, d, skip, board: board.name, full, fell });
  rec.memMax = Math.max(rec.memMax, GS.boardMemory().total);
  const per = GS.boardMemory().per;
  for (const v of Object.values(per)) rec.perBoard = Math.max(rec.perBoard, v);
}

// --- 1-3: the deaths --------------------------------------------------------------------------
const DEATHS = [[0, null], [-1, 1], [0.1, 2], [0.5, 3], [2, null]];   // -1: one frame after the arrival
for (const hz of [160, 60]) {
  for (const cold of [true, false]) {
    Math.random = mulberry32(hz * 10 + (cold ? 1 : 2));
    // A warm session lets go of BASEMENT's board as well, so the menu paints two boards and
    // its budget is measured over a few hundred frames rather than the one board's hundred,
    // where a single slow frame was p99 and p99.9 at once.
    GS.forgetBoards(!cold);
    const W = { game: new G.Game(new AutoInput()), acc: 0, uiT: 0, prevState: null, zone: null };
    W.game.state = STATE.MENU;
    // A cold session starts a run on the menu's first frame (the menus draw at 60 Hz); a
    // warm one sat on the menu a while.
    run(W, 60, cold ? 1 / 60 : 4);
    for (let Z = 0; Z < THEMES.length; Z++) {
      // The cold session climbs briskly -- a second and a half a zone, so the zone's board is
      // often still being painted when he gets there -- the warm one at a walk.
      const dwell = cold ? 1.5 : 5;
      for (const [d0, skip] of cold ? DEATHS : DEATHS.filter((_, i) => i % 2 === 0)) {
        const d = d0 < 0 ? 1 / hz : d0;
        death(W, hz, Z, dwell, d, skip);
        await new Promise((r) => setImmediate(r));   // the collector's reports come in
      }
    }
  }
}
await new Promise((r) => setTimeout(r, 20));

/** Each frame's time in the warm-up, raw and less the collector's pauses inside it [ms]. */
function times(wins) {
  gcs.sort((x, y) => x[0] - y[0]);
  const raw = [], own = [], gc = [];
  let j = 0;
  for (const [a, b] of wins) {
    while (j < gcs.length && gcs[j][1] <= a) j++;
    let t = 0;
    for (let k = j; k < gcs.length && gcs[k][0] < b; k++) t += Math.min(b, gcs[k][1]) - Math.max(a, gcs[k][0]);
    raw.push(b - a);
    own.push(b - a - t);
    gc.push(t);
  }
  return { raw, own, gc };
}

const deaths = rec.deaths;
ok(rec.badFall.length === 0, `nothing painted in any frame of the fall or the board: ${rec.fallFrames} frames of ` +
  `${deaths.length} deaths, ${rec.deadFirst} of them the board's first` +
  (rec.badFall.length ? `; ${rec.badFall.length} frames did: ${rec.badFall.slice(0, 4).join('; ')}` : ''));
const zonesDied = new Set(deaths.map((x) => x.zone));
ok(zonesDied.size === THEMES.length, `deaths in every zone (${zonesDied.size} of ${THEMES.length}), ` +
  `${deaths.filter((x) => x.skip !== null).length} cut short by SPACE 1 to 3 frames in, ` +
  `${deaths.filter((x) => x.d <= 1 / 60 + 1e-9).length} in the frame of the zone's arrival or the next`);
const partial = deaths.filter((x) => !x.full);
ok(partial.length === 0, `every death drawn in a board that is all painted (${deaths.length - rec.fallbacks} its zone's own, ` +
  `${rec.fallbacks} the last finished zone's)` + (partial.length ? `: ${partial.slice(0, 4).map((x) => x.zone).join(', ')}` : ''));
ok(GS.boardStats().missing === 0, `every character the fall's words and the board ask for has a glyph ` +
  `(${GS.boardStats().missing} missing)`);

const play = times(rec.play), menu = times(rec.menu), fall = times(rec.fall);
const max = (a) => a.reduce((m, v) => Math.max(m, v), 0);
// Frames that painted anything (the rest found every board it wanted finished).
const busy = play.own.filter((v, i) => play.raw[i] > 0.05);
const busyMenu = menu.own.filter((v, i) => menu.raw[i] > 0.05);
// The budget as stated: it used to be held at p99 to the budget AND a whole SLICE_MAX more,
// while the constant said 0.5 ms -- and p99 was 0.57.
const capPlay = C.BOARD_WARM_MS, capMenu = C.BOARD_IDLE_MS;
ok(pct(busy, 0.99) <= capPlay && pct(busyMenu, 0.99) <= capMenu,
  `the warm-up keeps its budget in the deaths above: of the ${busy.length} play frames that painted, p99 ` +
  `${pct(busy, 0.99).toFixed(3)} ms and p99.9 ${pct(busy, 0.999).toFixed(3)} (budget ${capPlay}); of the ${busyMenu.length} ` +
  `menu frames, p99 ${pct(busyMenu, 0.99).toFixed(3)} (budget ${capMenu}) -- ` +
  `the collector's pauses aside`);
const gcHit = play.gc.filter((v) => v > 0);
console.log(`         warm-up per frame in play (headless): max ${max(play.raw).toFixed(3)} ms, p99 ${pct(play.raw, 0.99).toFixed(3)}; ` +
  `of the frames that painted, p99 ${pct(busy, 0.99).toFixed(3)}, p99.9 ${pct(busy, 0.999).toFixed(3)}, max ${max(busy).toFixed(3)} ` +
  `less the collector (${busy.filter((v) => v > capPlay).length} over ${capPlay}; ${gcHit.length} frames had a pause ` +
  `inside, worst ${max(play.gc).toFixed(2)} ms)`);
console.log(`         on the menus: max ${max(menu.raw).toFixed(3)} ms, p99 ${pct(menu.raw, 0.99).toFixed(3)}; ` +
  `in the fall and on the board: max ${max(fall.raw).toFixed(4)} ms, p99 ${pct(fall.raw, 0.99).toFixed(4)} (a state check)`);
console.log(`         a zone's board finished ${pct(rec.readyAfter, 0.5).toFixed(2)} s after its arrival at the median, ` +
  `${Math.max(...rec.readyAfter).toFixed(2)} s at worst (0 when it was painted ahead in the zone before)`);
console.log(`         painted boards: ${(rec.perBoard / 1e6).toFixed(1)} MB the largest, ${(rec.memMax / 1e6).toFixed(1)} MB ` +
  `held at most (all twelve would be about ${(rec.perBoard * 12 / 1e6).toFixed(0)} MB)`);

// --- 4: every slice, one at a time ---------------------------------------------------------------
// A clock that moves three quarters of the deadline's window on every read: still short of it
// when warmBoards asks whether to resume at all, past it by a painter's first check, so every
// call resumes the painters for exactly ONE slice and hands the frame back. (A fixed 0.3 ms
// step stopped fitting when the deadline moved inside the budget: the window is 0.3 ms now,
// and warmBoards never resumed anything.) Painting each zone's board that way, every slice is timed on its own. Three times
// over, taking each slice's fastest: once is the slice plus whatever else the machine did in
// it (the collector, another process), and the first time is the code run cold.
{
  const hash = (d) => { let h = 2166136261; for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619); return h >>> 0; };
  const prints = (b) => Object.entries(b.parts).map(([k, p]) => {
    const c = p && p.c ? p.c : p;
    return `${k}:${c.width}x${c.height}:${hash(c.data)}` + (p.stroke ? ':' + hash(p.stroke) : '');
  }).join('|');
  const bad = [], uneven = [];
  let slices = 0, worst = { ms: 0 }, coldWorst = { ms: 0 };
  const all = [];
  const counting = performance.now;
  for (const th of THEMES) {
    const g = { state: STATE.PLAYING, theme: th, nextTheme: th, run: {} };
    const runs = [];
    let sliced = null;
    for (let rep = 0; rep < 3; rep++) {
      GS.forgetBoards(true);
      let fake = 0;
      const d = [];
      performance.now = () => (fake += 0.75 * (C.BOARD_WARM_MS - C.BOARD_SLICE_MS));
      try {
        while (!GS.boardStats().done.includes(th.name)) {
          const a = realNow();
          GS.warmBoards(g);
          d.push(realNow() - a);
        }
      } finally {
        performance.now = counting;
      }
      runs.push(d);
      if (!rep) sliced = prints(GS.warmBoardNow(th));
    }
    GS.forgetBoards(true);
    if (prints(GS.warmBoardNow(th)) !== sliced) bad.push(th.name);
    if (runs.some((r) => r.length !== runs[0].length)) { uneven.push(th.name); continue; }
    slices += runs[0].length;
    for (let i = 0; i < runs[0].length; i++) {
      const ms = Math.min(runs[0][i], runs[1][i], runs[2][i]);
      all.push(ms);
      if (ms > worst.ms) worst = { ms, zone: th.name, i };
      if (runs[0][i] > coldWorst.ms) coldWorst = { ms: runs[0][i], zone: th.name, i };
    }
  }
  GS.warmBoardNow(THEMES[0]);
  ok(!bad.length && !uneven.length, `every zone's board painted a slice a frame (${slices} slices, the same in each ` +
    `of three paintings) is pixel for pixel the board painted in one go` +
    (bad.length || uneven.length ? `: not in ${[...bad, ...uneven].join(', ')}` : ''));
  const over = all.filter((v) => v > C.BOARD_SLICE_MS).length;
  ok(worst.ms <= SLICE_MAX && pct(all, 0.999) <= C.BOARD_SLICE_MS, `past its deadline the warm-up resumes a painter ` +
    `for one slice, and the slices fit the ${C.BOARD_SLICE_MS} ms kept for the last one: p99.9 ` +
    `${pct(all, 0.999).toFixed(3)} ms, p99 ${pct(all, 0.99).toFixed(3)}, median ${pct(all, 0.5).toFixed(4)}; ${over} of ` +
    `${all.length} over it, none over ${SLICE_MAX} (the longest ${worst.ms.toFixed(3)} ms, ${worst.zone}, slice ` +
    `${worst.i}; each the fastest of three; run cold the longest was ${coldWorst.ms.toFixed(2)} ms, ${coldWorst.zone})`);
}

console.log(`\n  ${fails ? fails + ' FAILED' : 'the board: painted ahead in slices, never in the fall'}  ` +
  `(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fails ? 1 : 0);
