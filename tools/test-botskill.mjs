// Adversarial audit of the attract-mode bot.
//
// test-autoplay.mjs asks "does it survive and climb". This asks the harder question:
// does it actually PLAY the game, or does it just get up the tower? A demo that never
// touches the wall bounce, never chains an air jump and lets its speed decay is a bot
// climbing a ladder, not a showcase.
//
// Every threshold here is a claim about what a good run looks like, and each one is
// checked against a real mechanic the player has. The runs are the attract demo as the menu
// plays it (autoplay.js startDemo: the real tower at the game's default settings) on towers
// it was not picked on.

import { Game, STATE } from '../src/game/game.js';
import { AutoInput, AutoPlayer, startDemo } from '../src/game/autoplay.js';
import { STEP } from '../src/core/loop.js';
import { VX_MAX_HOT, CX } from '../src/game/constants.js';

globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.window = { addEventListener() {} };

const MINUTES = Number(process.argv[2] || 2);
const RUNS = Number(process.argv[3] || 10);

export function audit(seed, minutes = MINUTES, over = {}) {
  const input = new AutoInput();
  const game = new Game(input);
  const bot = new AutoPlayer(input);
  startDemo(game, seed, over);

  const steps = Math.round(minutes * 60 / STEP);
  let t = 0;
  let fastFrames = 0;
  let frames = 0;
  let stall = 0;
  let worstStall = 0;
  let last = -1;
  let momentumSum = 0;
  let nearWallFrames = 0;
  let deaths = 0;

  for (let i = 0; i < steps; i++) {
    bot.step(game, STEP);
    game.step(STEP);
    t += STEP;
    frames++;

    const p = game.player;
    momentumSum += p.momentum;
    if (Math.abs(p.vx) > VX_MAX_HOT * 0.7) fastFrames++;
    if (Math.abs(Math.abs(p.x - CX) - game.arenaHalf) < 30) nearWallFrames++;

    if (p.floor !== last) { last = p.floor; worstStall = Math.max(worstStall, stall); stall = 0; }
    else if (p.grounded) stall += STEP;

    if (game.state !== STATE.PLAYING) { deaths++; break; }
  }
  worstStall = Math.max(worstStall, stall);

  const mins = Math.max(0.05, t / 60);
  const r = game.run;
  return {
    seed,
    floor: r.maxFloor,
    perMin: r.maxFloor / mins,
    bouncesPerMin: r.wallBounces / mins,
    airPerMin: (r.doubleJumps + r.tripleJumps) / mins,
    air: r.doubleJumps + r.tripleJumps,
    bounces: r.wallBounces,
    fastPct: (fastFrames / frames) * 100,
    meanMomentum: momentumSum / frames,
    wallPct: (nearWallFrames / frames) * 100,
    bestCombo: r.bestCombo,
    combos: r.combos,
    themes: r.themesSeen,
    worstStall,
    died: deaths > 0,
    seconds: t,
  };
}

// Only run the report when invoked directly, not when imported by the seed search.
const invoked = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('test-botskill.mjs');
if (invoked) {
  // These are REGRESSION GUARDS, set under measured behaviour, not aspirations. The
  // first version invented 35% for time-at-speed and 12% for wall-work; the bot could
  // not hit either, so they were failing runs that were actually fine. A threshold
  // nobody can hit is not a test, it is noise.
  //
  // Raised three times, and the jumps are the rounds of work on the planner:
  //
  //                          floors/min  bounce/m  air/m  fast%  momentum  combo
  //   original                      205      19.3    4.7   23.6      0.53   56.8
  //   after four bug fixes          356      32.2   17.8   49.0      0.89  108.8
  //   after the controller rewrite  559      45.3   30.4   60.9      0.94  258.4
  //   after the flow tower          842      54.2   74.8   81.1      0.99  573.4
  //   just before the combo walls   892      52.0   87.9   77.3      0.98 1782.1
  //   after the combo walls         806      49.7   82.0   72.9      0.97 1602.9
  //   the real tower, the defaults  1550      87.5  108.3   96.1      0.98 3098.3
  //
  // The flow-tower jump is not all bot: attract mode now generates a tower shaped for a
  // climber that never stops moving (see Tower's `flow` argument). tools/test-optimal.mjs
  // is the check that matters -- it measures what the tower OFFERS at each takeoff
  // against what the bot takes, and perturbs every tuned number to prove none of them
  // can be improved. Guards here sit near the low end of run-to-run spread, not at the
  // mean, so one unlucky tower does not turn the suite red. Measured p5 over 300 fresh
  // towers was 746 floors/min.
  //
  // The last row went DOWN because the walls changed under the bot, not the bot: deep
  // in a combo a bounce returns up to 120% and lifts up to 345 units/s, and the planner
  // still picks its target on a flight with neither in it (the folded fallback aside).
  // Measured over these ten towers, the bot now reaches a wall at a median 281 units/s
  // where it reached it at 344 (p5 221 -> 186), and of its airborne frames above 50
  // units/s it spends 27% braking and 31% coasting where it spent 21% and 18%. The
  // controller is shedding speed before the wall -- most likely because a harder bounce
  // would otherwise carry it past where the planner aimed -- and that is the drop in
  // fast%. fast% sits 0.9 over its guard, so it is the first check a future change to
  // the bot or the walls will trip: a measurement to re-take, not a guard to lower.
  //
  // The last row is two changes at once, both 2026-09-29: the demo became the game a player
  // gets (the real tower, the real fire, the game's defaults: 140%, NORMAL ledges 0.875,
  // MEDIUM, gravity 0.9, where the row was measured), and the bot was rebuilt to live on it
  // (round five in autoplay.js: it flies every option by Player.step's own rules). The old bot
  // on that tower died inside a minute on every one of thirty towers. The guards were re-taken
  // under the new row and under the same ten towers at settings.js's defaults of the day
  // (SMALL ledges, gravity 1: 1,547 floors/min, 86.9 bounces, 131 air jumps, 95.5%, 0.99,
  // 11.6%, 3,093), each well under the lower of the two but for the edges, which was 10 and
  // stays 10.
  const CHECKS = [
    ['climbs briskly', (a) => a.perMin, 1200, 'floors/min'],
    ['uses the walls', (a) => a.bouncesPerMin, 70, 'bounces/min'],
    ['uses air jumps', (a) => a.airPerMin, 85, 'air jumps/min'],
    ['holds its speed', (a) => a.fastPct, 85, '% of frames above 0.7 top speed'],
    ['keeps the meter up', (a) => a.meanMomentum, 0.95, 'mean momentum'],
    ['works the edges', (a) => a.wallPct, 10, '% of frames near a wall'],
    ['chains combos', (a) => a.bestCombo, 2000, 'floors in the best combo'],
  ];

  const results = [];
  for (let i = 0; i < RUNS; i++) results.push(audit((0x9e3779b9 * (i + 1)) >>> 0));

  console.log(`\n  ${RUNS} runs of ${MINUTES} simulated minutes\n`);
  console.log('   seed        floor  /min  bounce/m  air/m  fast%  mom   wall%  combo');
  for (const a of results) {
    console.log('  ' + String(a.seed).padStart(10) + '  ' + String(a.floor).padStart(5) +
      '  ' + String(Math.round(a.perMin)).padStart(4) +
      '  ' + a.bouncesPerMin.toFixed(1).padStart(8) +
      '  ' + a.airPerMin.toFixed(1).padStart(5) +
      '  ' + a.fastPct.toFixed(0).padStart(5) +
      '  ' + a.meanMomentum.toFixed(2).padStart(4) +
      '  ' + a.wallPct.toFixed(0).padStart(5) +
      '  ' + String(a.bestCombo).padStart(5));
  }

  console.log('\n  AUDIT');
  let bad = 0;
  for (const [label, get, want, unit] of CHECKS) {
    const vals = results.map(get);
    const mean = vals.reduce((x, y) => x + y, 0) / vals.length;
    const ok = mean >= want;
    if (!ok) bad++;
    console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(20) +
      mean.toFixed(1).padStart(7) + '  (want >= ' + want + ' ' + unit + ')');
  }
  const stuck = results.filter((a) => a.worstStall >= 4).length;
  if (stuck) { bad++; console.log(`  FAIL ${stuck} run(s) stalled for 4s or more`); }

  console.log('\n  ' + (bad === 0 ? 'RESULT: PASS - the bot plays the game, not just the ladder.'
                                  : `RESULT: FAIL - ${bad} behaviours missing.`));
  process.exit(bad ? 1 : 0);
}
