// The height callouts, their laps, their turns with the zone titles, and the combo meter.
//
//   node tools/test-milestones.mjs
//
// The seven callouts (SWIFT to GLORY) were the COMBO's -- one per multiplier step, at 50 to
// 350 floors of a chain -- and this suite tested that. The player moved them onto the tower:
// the run's big milestones, spread over a whole lap of the zones with GLORY at the top of
// ZENITH, and on every lap after the first the same seven with a prestige badge, x2, x3.
// What it holds them to now:
//
//   1. THE TABLE     seven words at k/7 of a lap, rounded to CALLOUT_ROUND, GLORY exactly at
//                    the top of the lap -- derived from CYCLE_FLOORS, never written out.
//   2. THE TRACKER   climbing floor by floor through three laps fires 21, in order, each at
//                    its floor, with its lap; a staged start (a tool writing the best floor)
//                    fires nothing it skipped.
//   3. IN THE GAME   a scripted climb through Game.step: every callout at its floor once per
//                    lap and never again after falling back through it; every zone title
//                    shown, none dropped; a callout and a zone title NEVER on screen in the
//                    same step, whichever came second waiting for the first (GLORY first at
//                    the lap's top, the next lap's first title after it); at a fast human
//                    pace and at a pace no human climbs. Attract mode shouts nothing.
//   4. THE METER     the combo's own ladder: x in half steps, the meter emptying at each step
//                    and never pinning, however long the chain; and drawn, the multiplier
//                    line under the count never lands on the FLOORS label, however low the
//                    meter and however long the number.

import { installDom } from './headless.mjs';

installDom();

const { MILESTONES, CALLOUT_WORDS, HeightMilestones, calloutFloor, lapFloor } = await import('../src/game/milestones.js');
const { CYCLE_FLOORS, themeIndexFor } = await import('../src/game/themes.js');
const C = await import('../src/game/constants.js');
const { ComboTracker, MULT_STEP } = await import('../src/game/combo.js');
const { COMBO_TIERS } = await import('../src/game/flavour.js');
const { Game } = await import('../src/game/game.js');
const { AutoInput } = await import('../src/game/autoplay.js');
const { STEP } = await import('../src/core/loop.js');
const fs = await import('node:fs');

let bad = 0;
const check = (cond, msg) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) bad++; return cond; };
const N = CALLOUT_WORDS.length;

// --- 1. the table ------------------------------------------------------------------------
{
  const want = [...Array(N)].map((_, i) => (i === N - 1 ? CYCLE_FLOORS
    : Math.round(((i + 1) * CYCLE_FLOORS) / N / C.CALLOUT_ROUND) * C.CALLOUT_ROUND));
  const xs = MILESTONES.map((m) => m.x);
  check(xs.join() === want.join() && xs.every((x, i) => i === 0 || x > xs[i - 1]),
    `seven heights at k/${N} of the ${CYCLE_FLOORS}-floor lap, rounded to ${C.CALLOUT_ROUND}, ascending: ${xs.join(', ')}`);
  check(xs[N - 1] === CYCLE_FLOORS && lapFloor(N) === CYCLE_FLOORS,
    `GLORY is exactly the top of the lap, ${CYCLE_FLOORS}, where the next lap's first zone begins`);
  check(xs.every((x) => x % C.CALLOUT_ROUND === 0), `every one a multiple of ${C.CALLOUT_ROUND}`);
  check(MILESTONES.map((m) => m.name).join() === 'SWIFT,CHARGE,SOARING,RAMPAGE,CRUSADE,THUNDER,GLORY'
    && MILESTONES.every((m, i) => m.k === i + 1), 'in the order SWIFT to GLORY, k 1 to 7');
  // Derived, not written out: the lap's length appears nowhere in the table's module.
  const src = fs.readFileSync(new URL('../src/game/milestones.js', import.meta.url), 'utf8');
  const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).join('\n');
  check(!new RegExp(`\\b${CYCLE_FLOORS}\\b`).test(code), `no literal ${CYCLE_FLOORS} in milestones.js outside its comments`);
  const tierNames = new Set(COMBO_TIERS.map((t) => t.name));
  check(MILESTONES.every((m) => !tierNames.has(m.name)), 'no callout word is also a combo tier name');
}

// --- 2. the tracker ------------------------------------------------------------------------
{
  const h = new HeightMilestones();
  const fired = [];
  const top = 3 * CYCLE_FLOORS + 50;
  for (let f = 1; f <= top; f++) {
    const m = h.climb(f - 1, f);
    if (m) fired.push({ ...m, at: f });
  }
  const want = [];
  for (let L = 1; L <= 3; L++) for (const m of MILESTONES) want.push(`${m.name}@${(L - 1) * CYCLE_FLOORS + m.x}x${L}`);
  const got = fired.map((m) => `${m.name}@${m.at}x${m.lap}`);
  check(got.join() === want.join(), `a climb floor by floor through three laps fires ${fired.length}: ` +
    `${got.slice(0, 2).join(', ')} ... ${got.slice(6, 9).join(', ')} ... ${got[got.length - 1]}` +
    (got.join() !== want.join() ? `; wanted ${want.join(', ')}` : ''));
  check(fired.every((m) => m.floor === m.at), 'each reports the floor it stands on');
  // A staged start: a tool stands him on floor 2625 by writing the best floor.
  const s = new HeightMilestones();
  const first = s.climb(2625, 2627);
  const next = s.climb(2627, 2631);
  check(first === null && next && next.name === 'SWIFT' && next.lap === 2,
    `a start staged at 2625 fires nothing it skipped, and then lap 2's SWIFT at ${calloutFloor(N)}`);
  const two = new HeightMilestones().climb(0, calloutFloor(1));
  check(two && two.name === MILESTONES[1].name, 'a rise across two at once (only a tool can) reports the higher');
}

// --- 3. in the game --------------------------------------------------------------------------

/**
 * Climb a real Game through its own step(), the Duke's floor scripted: `rate` floors a second
 * from the ground to `to`, with an optional fall from `fallAt` back to `fallTo` on the way.
 * The player's own physics is switched off (it is the heights being tested, not the jumping),
 * the rising floor is held off, and he is kept moving so no idle banner crowds the stack.
 */
function climb({ rate, to, fallAt = 0, fallTo = 0, demo = false }) {
  const game = new Game(new AutoInput());
  game.demo = demo;
  game.newRun(0x2f6f1b21);
  const p = game.player;
  p.step = () => {};
  const log = { callouts: [], titles: [], zones: [], overlap: 0, crossed: [], steps: 0 };
  const seen = new Set();
  let f = 0, fell = false, lastT = 0, n = 0, zone = game.themeIndex, held = 0;
  // Then held at the top for 3 s, so whatever is still waiting its turn gets it.
  for (let i = 0; held < 3; i++) {
    if (f < to) f = Math.min(to, f + rate * STEP); else held += STEP;
    if (fallAt && !fell && f >= fallAt) { f = fallTo; fell = true; }
    const floor = Math.floor(f);
    p.floor = floor; p.y = p.py = floor * C.FLOOR_H; p.vx = 120; p.grounded = false;
    game.riseY = -1e9;
    game.step(STEP);
    const t = (i + 1) * STEP;
    while (game.run.maxFloor >= calloutFloor(n)) log.crossed[n++] = t;
    if (game.shout && game.shoutT > lastT + 1e-9) {
      log.callouts.push({ name: game.shout, lap: game.shoutLap, x: game.shoutX, t });
    }
    lastT = game.shoutT;
    if (game.themeIndex !== zone) { zone = game.themeIndex; log.zones.push({ zone, t }); }
    for (const b of game.banners) {
      if (b.zone !== undefined && !seen.has(b)) { seen.add(b); log.titles.push({ zone: b.zone, t }); }
    }
    if (game.calloutOnScreen && game.titleOnScreen) log.overlap++;
    log.steps++;
  }
  return log;
}

const LAPS = 3;
const expected = [];
for (let L = 1; L <= LAPS; L++) for (const m of MILESTONES) expected.push({ name: m.name, lap: L, x: m.x, floor: (L - 1) * CYCLE_FLOORS + m.x });
const lapTops = [...Array(LAPS)].map((_, L) => (L + 1) * CYCLE_FLOORS);

for (const [rate, what] of [[12, 'a fast human climb, 12 floors a second'], [40, 'a climb no human makes, 40 floors a second']]) {
  // Through three laps, falling from 700 back to 590 on the way: through CHARGE (660) and
  // SWIFT's lap-1 floor is far below, so a re-fire on the way back up would show here.
  const log = climb({ rate, to: LAPS * CYCLE_FLOORS + 40, fallAt: 700, fallTo: 590 });
  console.log(`  -- ${what}: ${log.steps} steps, ${log.callouts.length} callouts, ${log.titles.length} zone titles`);
  const got = log.callouts.map((c) => `${c.name}x${c.lap}`).join();
  check(got === expected.map((e) => `${e.name}x${e.lap}`).join(),
    `every callout once per lap, in order, laps 1 to ${LAPS} (falling from 700 back to 590 fired nothing again)` +
    (got === expected.map((e) => `${e.name}x${e.lap}`).join() ? '' : `; got ${got}`));
  const offFloor = log.callouts.filter((c, i) => expected[i] && c.x !== expected[i].x);
  check(!offFloor.length && log.crossed.length >= expected.length,
    `each one's floor is its height in the lap (${[...new Set(log.callouts.map((c) => c.x))].join(', ')})`);
  // Shown when its floor was crossed -- or, if a zone title was up then, when the title went.
  const waited = [];
  const early = [];
  log.callouts.forEach((c, i) => {
    const d = c.t - log.crossed[i];
    if (d < -1e-9) early.push(c.name);
    if (d > 1e-6) waited.push(`${c.name}x${c.lap} ${d.toFixed(2)} s`);
  });
  check(!early.length, `none shown before the Duke reached its floor`);
  check(log.titles.length === log.zones.length && log.titles.every((ti, i) => ti.zone === log.zones[i].zone && ti.t >= log.zones[i].t - 1e-9),
    `every zone crossed shows its title, in order, none dropped (${log.titles.length} of ${log.zones.length})`);
  check(log.overlap === 0, `a callout and a zone title are never on screen in the same step (${log.overlap} steps)`);
  // GLORY at each lap's top goes first, the next lap's first title the moment it has gone.
  const gloryFirst = lapTops.every((top, L) => {
    const gi = L * N + N - 1;
    const g = log.callouts[gi];
    const title = log.titles.find((ti) => ti.t >= log.crossed[gi] - 1e-9);
    return g && Math.abs(g.t - log.crossed[gi]) < 1e-6 && title && Math.abs(title.t - (g.t + C.CALLOUT_LIFE)) < 2 * STEP;
  });
  check(gloryFirst, `at each lap's top GLORY comes in at once and the next lap's first title ${C.CALLOUT_LIFE} s later, as it goes`);
  const titleWaits = log.titles.map((ti, i) => ti.t - log.zones[i].t).map((d, i) => [d, log.zones[i]]).filter(([d]) => d > 1e-6);
  console.log(`       callouts that waited for a title: ${waited.join(', ') || 'none'}`);
  console.log(`       titles that waited for a callout: ${titleWaits.map(([d, z]) => `zone ${z.zone} ${d.toFixed(2)} s`).join(', ') || 'none'}`);
}

{
  // ONE landing across a zone's first floor and a callout's floor. A hop of a dozen floors or
  // more is common at speed, and RAMPAGE stands ten floors past a zone's start in every lap:
  // a landing from 1299 to 1315 crosses ABYSS at 1300 and RAMPAGE at 1310 in the same step.
  // They must come in the order of their heights -- the title, then the word -- as they do when
  // the hop lands on 1300..1309 first. The callout used to go first in every such landing
  // (the best floor is raised before the zone is looked at), so the order depended on the hop.
  // GLORY on the lap's top floor itself still goes first: a landing from 2295 to 2310.
  const jump = (from, to) => {
    const game = new Game(new AutoInput());
    game.newRun(0x2f6f1b21);
    const p = game.player;
    p.step = () => {};
    const at = (floor) => {
      p.floor = floor; p.y = p.py = floor * C.FLOOR_H; p.vx = 120; p.grounded = false;
      game.riseY = -1e9;
      game.step(STEP);
    };
    // Up to `from` at a walk, then 4 s still so everything shown on the way has gone.
    for (let f = 0; f < from; f += 0.05) at(Math.floor(f));
    for (let k = 0; k < 4 / STEP; k++) at(from);
    const seen = [];
    let both = 0;
    const zone = themeIndexFor(to);
    for (let k = 0; k < 6 / STEP; k++) {
      at(to);
      const title = game.banners.some((b) => b.zone === zone);
      const word = game.calloutOnScreen ? game.shout : null;
      if (title && !seen.includes('title')) seen.push('title');
      if (word && !seen.includes(word)) seen.push(word);
      if (title && word) both++;
    }
    return { seen, both };
  };
  const r = jump(1299, 1315);
  check(r.seen.join() === 'title,RAMPAGE' && r.both === 0,
    `one landing from 1299 to 1315 shows ABYSS's title first and RAMPAGE when it has gone, never both (${r.seen.join(' then ')})`);
  const g = jump(CYCLE_FLOORS - 5, CYCLE_FLOORS + 10);
  check(g.seen.join() === 'GLORY,title' && g.both === 0,
    `one landing from ${CYCLE_FLOORS - 5} to ${CYCLE_FLOORS + 10} shows GLORY first and the next lap's first title after it (${g.seen.join(' then ')})`);
}

{
  // Attract mode: the title screen draws no HUD, so a callout there would be a flash and a
  // shake with no word. The climb goes past three of them; none fires, the titles still do.
  const log = climb({ rate: 12, to: 1400, demo: true });
  check(log.callouts.length === 0 && log.titles.length === log.zones.length && log.zones.length > 3,
    `attract mode climbs past ${MILESTONES.filter((m) => m.x <= 1400).length} callout heights and shouts none ` +
    `(${log.callouts.length}); its ${log.titles.length} zone titles still come`);
}

// --- 4. the combo meter -----------------------------------------------------------------------
//
// x is the SCORE MULTIPLIER, 1 plus a half for every MULT_STEP floors of the chain, and the
// meter is progress to the next step: it climbs, empties as a step is claimed, and fills
// again. It used to stop at the last callout (350) and pin full; the ladder has no top.
{
  const c = new ComboTracker(COMBO_TIERS);
  check(c.x === 1 && c.meterFrac() === 0, 'x starts at 1 and the meter is empty before a chain');
  let lastFrac = -1, lastX = 1, resets = 0, wrong = 0, pinned = 0;
  while (c.floors < 12 * MULT_STEP) {
    c.onLand(9);
    if (c.x < lastX || c.x !== 1 + 0.5 * Math.floor(c.floors / MULT_STEP)) wrong++;
    lastX = c.x;
    const f = c.meterFrac();
    if (f < 0 || f >= 1) wrong++;
    if (f < lastFrac) { if (!c.stepped) wrong++; resets++; }
    if (f === 1) pinned++;
    lastFrac = f;
  }
  check(!wrong && resets === 12 && !pinned,
    `over ${c.floors} floors x steps a half every ${MULT_STEP} and the meter empties at each of the 12 steps, ` +
    `past 350 too, and never pins full (${wrong} wrong, ${resets} resets)`);
  const r = c.onLand(0);
  check(r && r.peakX === lastX && c.x === 1 && c.meterFrac() === 0,
    'breaking the chain reports the peak multiplier and empties x and the meter');
}

{
  // The meter as DRAWN. Past 350 it no longer pins full, so a long chain's count rides down to
  // the bottom of the meter after every step -- where, under a number at scale 2, its
  // multiplier line used to land three units inside the FLOORS label ("x11.5" across
  // "FLOORS"; it already did for chains of 100 to 107 floors). The HUD is drawn twice per chain,
  // once as is and once with the multiplier held at x1, which hides that line and nothing else;
  // the difference is the line, and its lowest row must be above the FLOORS label's keyline
  // (the label stands on view row 186, hud.js GAUGE_LABEL_Y, its keyline one unit over it).
  const { drawHud } = await import('../src/ui/hud.js');
  const { HeadlessCanvas } = await import('./headless.mjs');
  const game = new Game(new AutoInput());
  game.newRun(0x2f6f1b21);
  const top = (186 - 1) * C.PX;
  const into = [];
  let worst = -1;
  for (const n of [55, 99, 100, 105, 149, 409, 1050, 1057, 2203]) {
    const c = game.combo;
    c.active = true; c.floors = n;
    const draw = (view) => {
      const cv = new HeadlessCanvas(C.SW, C.SH);
      const ctx = cv.getContext('2d');
      ctx.setTransform(C.PX, 0, 0, C.PX, 0, 0);
      drawHud(ctx, view, null, 0.3);
      return cv.data;
    };
    const a = draw(game), b = draw(Object.create(game, { combo: { value: Object.create(c, { x: { value: 1 } }) } }));
    let lo = -1;
    for (let y = C.SH - 1; y >= 0 && lo < 0; y--) for (let x = 0; x < C.SW / 3; x++) {
      const i = (y * C.SW + x) * 4;
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) { lo = y; break; }
    }
    worst = Math.max(worst, lo);
    if (lo < 0 || lo >= top) into.push(`${n} floors (x${c.x}, meter ${c.meterFrac().toFixed(2)}): row ${lo}`);
  }
  check(!into.length, `under the count, the multiplier line stays clear of the FLOORS label at every chain length, ` +
    `past 350 too (lowest row ${worst}, the label's keyline from ${top})` + (into.length ? `; into it: ${into.join('; ')}` : ''));
}

console.log('\n  ' + (bad === 0
  ? 'RESULT: PASS - seven callouts a lap at their heights, taking turns with the zone titles.'
  : `RESULT: FAIL - ${bad} problem(s).`));
process.exit(bad ? 1 : 0);
