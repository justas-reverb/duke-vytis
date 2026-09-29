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

// --- a cap of whole display frames is paced by whole display frames --------------
// A phone's 120 Hz panel under the 60 fps cap, its callbacks jittering by up to 0.6 ms either
// way: every drawn frame must stay on screen exactly two display frames. The averaging governor
// drew them one, two or three apart as the jitter fell, a steady judder on the user's Pixel 10
// (2026-09-29). And a 160 Hz panel still averages 60, as it always did (2.67 frames: no whole
// number to pace by).
{
  const paced = (hz, cap, jitterMs, seconds = 2) => {
    const drawnAt = [];
    let frame = 0;
    const loop = new Loop({ update: () => {}, render: () => drawnAt.push(frame) });
    loop.running = true;
    loop.setRenderCap(cap);
    let t = 0, s = 7;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    for (frame = 0; frame < seconds * hz; frame++) {
      t = (frame + 1) * (1000 / hz) + (rnd() * 2 - 1) * jitterMs;
      loop._tick(t);
    }
    const gaps = drawnAt.slice(20).map((f, i, a) => (i ? f - a[i - 1] : null)).filter((g) => g !== null);
    return { drawn: drawnAt.length, gaps: [...new Set(gaps)].sort(), fps: drawnAt.length / seconds };
  };
  const phone = paced(120, 60, 0.6);
  if (phone.gaps.join() !== '2') fail(`a 60 cap on a jittery 120 Hz panel drew frames ${phone.gaps.join(' or ')} display frames apart (want always 2)`);
  const sixty = paced(60, 60, 0.6);
  if (sixty.gaps.join() !== '1') fail(`a 60 cap on a 60 Hz panel skipped frames: ${sixty.gaps.join(' or ')} apart`);
  const desk = paced(160, 60, 0.3);
  if (Math.abs(desk.fps - 60) > 3) fail(`a 60 cap on a 160 Hz panel drew ${desk.fps.toFixed(1)} fps, not about 60`);
  ok(`a 60 cap on 120 Hz draws every 2nd display frame even with jitter, on 60 Hz every frame, on 160 Hz ${desk.fps.toFixed(1)} fps on average`);

  // The display's rate is read off the frames (Loop.vsync), so it must survive what real frames
  // do: a first frame a quarter of a second late (a start after a stall), a late frame now and
  // then, and a phone's panel changing its rate under the game -- 120 Hz to 60 to save power,
  // and back. Each stretch is judged from its 20th frame on.
  const plan = (segs, cap) => {
    const drawnAt = [];
    let frame = 0, t = 250;                  // the first callback, 250 ms after the start
    const loop = new Loop({ update: () => {}, render: () => drawnAt.push(frame) });
    loop.running = true;
    loop.prev = 0;
    loop.setRenderCap(cap);
    let s = 11;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const out = [];
    for (const [hz, n] of segs) {
      const from = frame + 20, gaps = new Set();
      for (let i = 0; i < n; i++, frame++) {
        // One frame in 40 late by a whole display frame, as a busy phone drops one.
        t += (1000 / hz) * (frame % 40 === 17 ? 2 : 1) + (rnd() * 2 - 1) * 0.5;
        loop._tick(t);
      }
      const mine = drawnAt.filter((f) => f >= from);
      for (let i = 1; i < mine.length; i++) gaps.add(mine[i] - mine[i - 1]);
      out.push([...gaps].sort().join());
    }
    return out;
  };
  const [a, b, c] = plan([[120, 240], [60, 120], [120, 240]], 60);
  // A late frame is one callback that covers two display frames: the draw after it is one
  // CALLBACK later, and still on time.
  if (a !== '1,2' && a !== '2') fail(`after a late first frame, a 60 cap on 120 Hz drew ${a} callbacks apart (want 2, or 1 after a late one)`);
  if (b !== '1') fail(`a panel dropped to 60 Hz under a 60 cap drew ${b} callbacks apart (want every one)`);
  if (c !== '1,2' && c !== '2') fail(`a panel back at 120 Hz under a 60 cap drew ${c} callbacks apart (want 2, or 1 after a late one)`);
  ok(`the display's rate is read through a late first frame, dropped frames and a panel going 120 -> 60 -> 120 Hz (callbacks apart: ${a} / ${b} / ${c})`);
}

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
