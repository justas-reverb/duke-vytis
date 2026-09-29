// The loop, and the render governor.
//
// The governor exists because the title screen was drawing a live attract-mode game 160
// times a second forever, and kept doing it with the window in the background -- the
// blur handler only ever paused an actual RUN. A machine left sitting on the menu was
// being asked to render a whole game for nobody.
//
// The invariant that matters is that capping the DRAW rate never touches the
// SIMULATION. Physics runs at a fixed STEP and must advance in real time whatever the
// governor is doing, or a capped menu would run the bot in slow motion.

import { Loop, STEP } from '../src/core/loop.js';

let bad = 0;
const fail = (m) => { console.log('  FAIL ' + m); bad++; };
const ok = (m) => console.log('  ok   ' + m);

// The Loop wants requestAnimationFrame to exist; we drive _tick by hand instead.
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.performance = globalThis.performance || { now: () => 0 };

function run(cap, seconds, hz) {
  let steps = 0, renders = 0;
  const loop = new Loop({ update: () => steps++, render: () => renders++ });
  loop.running = true;
  loop.setRenderCap(cap);
  const frames = Math.round(seconds * hz);
  let t = 0;
  for (let i = 0; i < frames; i++) {
    t += 1000 / hz;
    loop._tick(t);
  }
  return { steps, renders, seconds };
}

// --- the simulation is never capped -----------------------------------------
const expectedSteps = (s) => Math.round(s / STEP);
for (const cap of [0, 60, 10, 4]) {
  const r = run(cap, 2, 160);
  const drift = Math.abs(r.steps - expectedSteps(2));
  if (drift > 3) {
    fail(`cap ${cap}: simulation ran ${r.steps} steps, expected ~${expectedSteps(2)}`);
  }
}
ok(`the simulation runs at ${Math.round(1 / STEP)} Hz whatever the render cap is`);

// --- the cap actually caps ---------------------------------------------------
const uncapped = run(0, 2, 160);
if (uncapped.renders < 300) fail(`uncapped drew only ${uncapped.renders} frames in 2s at 160 Hz`);
ok(`uncapped draws every frame (${uncapped.renders} in 2 s at 160 Hz)`);

for (const [cap, tol] of [[60, 8], [10, 3], [4, 2]]) {
  const r = run(cap, 2, 160);
  const want = cap * 2;
  if (Math.abs(r.renders - want) > tol) {
    fail(`cap ${cap}: drew ${r.renders} frames in 2 s, expected about ${want}`);
  }
}
ok('capping at 60, 10 and 4 fps draws about that many frames a second');

// --- the saving is the point -------------------------------------------------
const menu = run(60, 2, 160);
const saved = 1 - menu.renders / uncapped.renders;
if (saved < 0.5) fail(`a 60 fps menu cap only saves ${(saved * 100).toFixed(0)}% of draws`);
ok(`a 60 fps menu cap skips ${(saved * 100).toFixed(0)}% of draws on a 160 Hz display`);

const idle = run(5, 2, 160);
ok(`an unfocused window at 5 fps skips ${((1 - idle.renders / uncapped.renders) * 100).toFixed(0)}% of draws`);

// --- a cap change must not stall the next frame ------------------------------
{
  let renders = 0;
  const loop = new Loop({ update: () => {}, render: () => renders++ });
  loop.running = true;
  loop.setRenderCap(4);
  let t = 0;
  for (let i = 0; i < 40; i++) { t += 1000 / 160; loop._tick(t); }
  const before = renders;
  loop.setRenderCap(0);                       // back to a live run
  t += 1000 / 160; loop._tick(t);
  if (renders !== before + 1) fail('uncapping should draw the very next frame');
  ok('uncapping draws immediately rather than waiting out the old interval');
}

console.log('\n  ' + (bad === 0
  ? 'RESULT: PASS - drawing is capped, simulation is not.'
  : `RESULT: FAIL - ${bad} problem(s).`));
process.exit(bad ? 1 : 0);
