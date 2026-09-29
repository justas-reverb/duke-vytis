// The attract demo must never fail, never stall and never look broken.
//
// It plays the real game behind the title screen -- the real tower, the real fire, at the
// game's default settings (autoplay.js startDemo) -- so anything that goes wrong there is on
// screen the moment someone opens the game. Each demo seed, and a few towers it was not
// picked on, is played for MINUTES as the menu plays it and held to what the demo promises
// (docs/BOT.md, "Is it done?"), measured by tools/measure-demo.mjs:
//
//   it passes floor 2300, ZENITH, where the ascension comes, and dies nowhere in the window;
//   it never falls more than three floors below its best (a landing missed badly);
//   it never goes two seconds without a new best floor while alive (a stall);
//   it is never wholly out of the camera's view;
//   and, across the runs, it climbs, works the walls and spends its air jumps at no less
//   than the rates below -- regression guards set under what was measured, not aims.
//
// The demo stays mortal (the fire is live); a run that dies inside the window fails here
// because the demo seeds are picked for surviving it and the others have never died in it.
//
// The tower must also keep producing zones forever, never the same one twice running.
//
//   node tools/test-autoplay.mjs [minutes=3.5] [fresh towers=3]

import { measureDemo } from './measure-demo.mjs';
import { DEMO_SEEDS, demoSettings } from '../src/game/autoplay.js';
import { THEMES, themeIndexFor, bandFor, CYCLE_FLOORS } from '../src/game/themes.js';
import { FLOORS_PER_THEME, FIRST_THEME_FLOORS } from '../src/game/constants.js';

globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.window = { addEventListener() {} };

const MINUTES = Number(process.argv[2] || 3.5);
const FRESH = Number(process.argv[3] || 3);

// Measured on the five demo seeds and 200 fresh towers at the defaults the demo ships with
// (140%, NORMAL ledges 0.875, MEDIUM, gravity 0.9), 2026-09-29: 1,500 floors a minute to floor
// 2300 (the slowest tower 1,418), 98 wall bounces and 120 air jumps a minute over ten minutes.
// These sit well under that, so a tower that is merely unlucky does not fail the suite.
const GUARDS = [
  ['climbs', (a) => a.perMinPre, 1200, 'floors a minute to floor 2300'],
  ['uses the walls', (a) => a.bouncesPerMin, 70, 'wall bounces a minute'],
  ['uses its air jumps', (a) => a.airPerMin, 70, 'air jumps a minute'],
];

let bad = 0;
const s = demoSettings();
console.log(`\n  the attract demo at JUMP SPEED ${s.jumpSpeed}, PLATFORMS ${s.platforms}, DIFFICULTY ${s.difficulty}, GRAVITY ${s.gravity}:`
  + ` ${DEMO_SEEDS.length} demo seeds and ${FRESH} other towers, ${MINUTES} simulated minutes each\n`);
const seeds = [...DEMO_SEEDS, ...Array.from({ length: FRESH }, (_, i) => (0x51ed270b * (i + 1)) >>> 0)];
const runs = [];
for (const seed of seeds) {
  const a = measureDemo(seed, {}, { minutes: MINUTES });
  runs.push(a);
  const faults = [];
  if (a.died) faults.push(`died at floor ${a.floor} after ${a.seconds.toFixed(0)} s`);
  if (a.floor < CYCLE_FLOORS) faults.push(`never reached floor ${CYCLE_FLOORS}`);
  if (a.misses) faults.push(`${a.misses} landing(s) missed by more than 3 floors (worst ${a.worst.toFixed(1)})`);
  if (a.stalls) faults.push(`${a.stalls} stall(s) of 2 s or more (longest ${a.longestGap.toFixed(2)} s)`);
  if (a.gone) faults.push(`${a.gone} step(s) wholly out of the view`);
  if (faults.length) bad++;
  console.log(`  ${faults.length ? 'FAIL' : 'ok  '} ${String(seed).padStart(10)}${DEMO_SEEDS.includes(seed) ? ' demo' : '     '}`
    + `  floor ${String(a.floor).padStart(5)}  2300 at ${a.at2300 === null ? '  -' : a.at2300.toFixed(0).padStart(3)} s`
    + `  ${String(Math.round(a.perMinPre)).padStart(4)}/min  ${a.bouncesPerMin.toFixed(0).padStart(3)} bounces/min  ${a.airPerMin.toFixed(0).padStart(3)} air/min`
    + `  gap ${a.longestGap.toFixed(2)} s  out ${a.out}` + (faults.length ? `   ${faults.join('; ')}` : ''));
}
console.log('');
for (const [label, get, want, unit] of GUARDS) {
  const mean = runs.reduce((x, a) => x + get(a), 0) / runs.length;
  const ok = mean >= want;
  if (!ok) bad++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(18)} ${mean.toFixed(1).padStart(7)}  (want >= ${want} ${unit})`);
}

// The tower must keep producing bands forever, never repeating back to back.
//
// Stepped by ZONE, not by a fixed number of floors. Zones are no longer uniform -- the
// opening one is 100 floors and the rest are 200 -- so walking in 100s samples most
// zones twice and reports every one of those as a repeat. That is the test being wrong
// about the schedule, not the tower repeating itself.
let repeats = 0;
let prev = -1;
let checked = 0;
for (let zone = 0; zone < 2000; zone++) {
  const cycle = Math.floor(zone / THEMES.length);
  const b = zone % THEMES.length;
  const floor = cycle * CYCLE_FLOORS + (b === 0 ? 0 : FIRST_THEME_FLOORS + (b - 1) * FLOORS_PER_THEME);
  const i = themeIndexFor(floor);
  // Every sample must land on the zone it was aimed at, or the walk has drifted and the
  // repeat count below means nothing.
  const got = bandFor(floor);
  if (got.band !== b || got.into !== 0) {
    console.log(`  FAIL zone ${zone} (floor ${floor}) -> band ${got.band} into ${got.into}, wanted band ${b} into 0`);
    bad++; break;
  }
  if (i === prev) repeats++;
  if (i < 0 || i >= THEMES.length) { console.log(`  FAIL zone ${zone} -> theme ${i}`); bad++; break; }
  prev = i;
  checked++;
}
if (repeats) { console.log(`  FAIL ${repeats} back-to-back theme repeats in 2000 bands`); bad++; }
console.log(`  ${checked} zones checked (${CYCLE_FLOORS}-floor cycle), ${repeats} consecutive repeats`);

console.log(bad === 0 ? '\n  RESULT: PASS - the demo never fails, never stalls and the tower never ends.'
                      : `\n  RESULT: FAIL - ${bad} problems.`);
process.exit(bad ? 1 : 0);
