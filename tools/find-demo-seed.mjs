// Search for the best towers for attract mode.
//
// The demo plays the real tower at the game's DEFAULT settings (autoplay.js startDemo), so a
// seed is picked for what the title screen will actually show. Survival first: a tower on
// which the bot does not pass floor 2300 (ZENITH, the ascension) is out, and so is one with
// anything that reads as a fault -- a landing missed by more than three floors, two seconds
// with no new best floor, a step with any of him outside the view. Of the rest the spectacle
// decides: how fast it climbs, how often it works the walls and spends the air jump, less
// what looks wrong (a twitch of his facing, a landing on the very edge of a ledge), with the
// first half minute counted twice. tools/measure-demo.mjs measures every tower, the same
// numbers it prints.
//
//   node tools/find-demo-seed.mjs [count=200] [minutes=10] [--from=0]
//        [--speed= --platforms= --difficulty= --gravity=]   measure at these, not DEFAULTS
//        [--json]                                           one JSON line per tower as well
//
// Seeds are the fresh-tower sequence measure-demo --count uses, so a range can be split over
// several processes (--from) and the JSON lines merged.

import { measureDemo } from './measure-demo.mjs';
import { demoSettings } from '../src/game/autoplay.js';
import { CYCLE_FLOORS } from '../src/game/themes.js';

const arg = (name, dflt) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : dflt;
};
const pos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const COUNT = Number(pos[0] || 200);
const MINUTES = Number(pos[1] || 10);
const FROM = Number(arg('from', 0));
const JSON_OUT = process.argv.includes('--json');
const over = {};
for (const [flag, key] of [['speed', 'jumpSpeed'], ['platforms', 'platforms'], ['difficulty', 'difficulty'], ['gravity', 'gravity']]) {
  const v = arg(flag, null);
  if (v !== null) over[key] = Number(v);
}

/**
 * What makes a tower a showcase, in one number; -1 for a tower that is out.
 *
 * Out: it did not pass ZENITH (floor 2300), or it shows a fault the demo is held to never
 * showing (tools/measure-demo.mjs): a miss of more than three floors, a stall of two seconds,
 * a step with any of him beyond the edge of the view.
 *
 * Then the run -- floors a minute, the pace of the climb, and the moves that make it the game
 * rather than a ladder: a wall bounce a minute worth 3 floors a minute and an air jump 2, less
 * 60 for each twitch of his facing and each landing on an edge a minute -- and, counted again,
 * its first half minute, which is most of what anyone sees of a title screen: 2 for each floor
 * climbed in it, 6 for each wall bounce, 4 for each air jump, less 40 for each twitch. Measured
 * when this was written, every one of 200 towers passed floor 4600 with none of the faults
 * but the view, and the run's numbers were within a few percent of each other; the opening is
 * what tells them apart.
 */
export function score(a) {
  if (a.floor < CYCLE_FLOORS || a.misses > 0 || a.stalls > 0 || a.gone > 0 || a.out > 0) return -1;
  const mins = Math.max(1 / 60, a.seconds / 60);
  const o = a.opening || { floor: 0, bounces: 0, air: 0, jitter: 0 };
  return a.perMin + 3 * a.bouncesPerMin + 2 * a.airPerMin
    - 60 * (a.jitter / mins) - 60 * (a.edges / mins)
    + 2 * o.floor + 6 * o.bounces + 4 * o.air - 40 * o.jitter
    + (a.died ? 0 : 200) + (a.floor >= 2 * CYCLE_FLOORS ? 100 : 0);
}

const invoked = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('find-demo-seed.mjs');
if (invoked) {
  const s = demoSettings(over);
  console.log(`\n  ${COUNT} towers from ${FROM}, ${MINUTES} min each, at JUMP SPEED ${s.jumpSpeed}, PLATFORMS ${s.platforms}, DIFFICULTY ${s.difficulty}, GRAVITY ${s.gravity}\n`);
  const results = [];
  for (let i = 0; i < COUNT; i++) {
    const seed = (0x9e3779b9 * (FROM + i + 1) + 0x7f4a7c15) >>> 0;
    const a = measureDemo(seed, over, { minutes: MINUTES });
    a.score = score(a);
    results.push(a);
    if (JSON_OUT) console.log('  ' + JSON.stringify(a));
    if ((i + 1) % 25 === 0) console.log(`  ...${i + 1}/${COUNT}`);
  }
  results.sort((x, y) => y.score - x.score);
  const out = results.filter((a) => a.score < 0).length;
  console.log(`\n  ${out} of ${COUNT} out (${results.filter((a) => a.floor < CYCLE_FLOORS).length} short of ${CYCLE_FLOORS}, ${results.filter((a) => a.died).length} died inside the window)\n`);
  console.log('  rank        seed  score  floor  died  f/min  bnc/m  air/m  twitch/m  edge/m  out');
  results.slice(0, 10).forEach((a, i) => {
    const mins = Math.max(1 / 60, a.seconds / 60);
    console.log('  ' + String(i + 1).padStart(4) + String(a.seed).padStart(12) + String(Math.round(a.score)).padStart(7)
      + String(a.floor).padStart(7) + (a.died ? '   yes' : '    no') + String(Math.round(a.perMin)).padStart(7)
      + a.bouncesPerMin.toFixed(1).padStart(7) + a.airPerMin.toFixed(1).padStart(7)
      + (a.jitter / mins).toFixed(2).padStart(10) + (a.edges / mins).toFixed(2).padStart(8) + String(a.out).padStart(5));
  });
  const median = results[Math.floor(results.length / 2)];
  console.log(`\n  The median tower scores ${Math.round(median.score)} (${Math.round(median.perMin)} floors/min).`);
  console.log(`  Paste into src/game/autoplay.js:  export const DEMO_SEEDS = ${JSON.stringify(results.slice(0, 5).map((a) => a.seed))};`);
}
