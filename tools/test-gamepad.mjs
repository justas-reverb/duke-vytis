// The gamepad: that a pad lands in the Input exactly as keys do, that the menus get the
// same key codes the keyboard sends, and that main.js wires both the way it says.
//
// Why each part is here:
//   - A resting stick is never at zero. Without a deadzone the Duke creeps; without
//     hysteresis a stick held near the threshold chatters on and off every frame.
//   - The jump buffer is refilled on a key's PRESS, never while it is held. Writing the
//     pad's A every frame it is down would refill it every frame: one press, many jumps.
//   - The keyboard must come out byte for byte as it did before the pad existed. The
//     trace it is compared with (KEYBOARD_TRACE) was recorded from input.js as it stood
//     at 62bb95e, before any of this, with `--golden=<that file>`.
//   - main.js is booted for real (tools/fakepage.mjs) to prove the one hook it has: Start
//     pauses a run and confirms on a menu, nothing else from the pad reaches a run, a pad
//     pulled out mid-run pauses it, and every screen -- the title, the guide, the options,
//     the stats, the help, the pause, the fall, the game over and the quit -- can be
//     reached and left with the pad alone.
//   - One controller can reach the page as two pads (Steam Input); it must play as one.
//
// Every assertion here was run against a broken copy of the code it guards and failed
// there (the mutants are listed in the commit that added this file).

import { pathToFileURL } from 'node:url';
import { Input, JUMP_BUFFER } from '../src/core/input.js';
import { Gamepad, BTN } from '../src/core/gamepad.js';
import { Loop } from '../src/core/loop.js';
import { makePad, press, release, tilt, key, installPage, bootMain, frame } from './fakepage.mjs';

// The feel, as LITERALS rather than read back from gamepad.js: a check that takes its
// expected value from the module passes whatever the module is changed to. Changing
// one of these is a decision to make here, on purpose.
const STICK_ENGAGE = 0.5;     // fraction of full deflection
const STICK_RELEASE = 0.3;
const REPEAT_DELAY = 0.4;     // seconds
const REPEAT_RATE = 0.1;

let bad = 0;
const fail = (m) => { console.log('  FAIL ' + m); bad++; };
const ok = (m) => console.log('  ok   ' + m);
const check = (cond, m, detail = '') => (cond ? ok(m) : fail(m + (detail ? `  (${detail})` : '')));

// --- the keyboard, recorded before the pad existed -----------------------------------
//
// d/u = keydown/keyup, r = a repeated keydown, s N = N steps of 1/240 s (the pad, when
// there is one, polled before each), j = consumeJump(), b = blur. After every op the
// trace records axis, jumpHeld and the jump buffer in 0.1 ms; after a keydown, whether
// the browser's default was prevented; after j, what it returned.
const SCRIPT = [
  'd ArrowRight', 's 1', 'd Space', 's 1', 'j', 's 3', 'd ArrowLeft', 's 1', 'u ArrowRight', 's 1',
  'r Space', 's 1', 'u Space', 's 1', 'j', 'd KeyW', 'd KeyZ', 'u KeyW', 's 1', 'j', 'b', 's 1',
  'd KeyD', 'd KeyA', 's 1', 'u KeyA', 's 30', 'j', 'd ArrowUp', 's 10', 'j', 'u ArrowUp',
  'u KeyD', 's 1', 'd Enter', 'd KeyM', 'd Escape', 's 1', 'u Enter', 'j',
];

// withPad: false, 'idle' (connected, never touched) or 'driving' (touched, then put down:
// it stays the pad that drives, and runs its every-frame writes into the Input).
function keyboardTrace(InputClass, withPad) {
  const target = new EventTarget();
  const input = new InputClass(target);
  let gp = null;
  if (withPad) {
    // Its stick resting where a worn one rests.
    const pad = makePad(0);
    tilt(pad, 0.22, -0.18);
    gp = new Gamepad(input, { nav: { getGamepads: () => [pad] }, target });
    if (withPad === 'driving') {
      press(pad, BTN.RT); gp.poll(1 / 240);    // RT: a touch that maps to nothing
      release(pad, BTN.RT); gp.poll(1 / 240);
      input.lastDevice = 'keys';
    }
  }
  const out = [];
  const state = () => `${input.axis},${input.jumpHeld ? 1 : 0},${Math.round(input.jumpBuffer * 1e4)}`;
  for (const op of SCRIPT) {
    const [k, arg] = op.split(' ');
    if (k === 'd' || k === 'r') {
      const e = key(target, 'keydown', arg, { repeat: k === 'r' });
      out.push(`${state()}${e.defaultPrevented ? 'p' : ''}`);
    } else if (k === 'u') { key(target, 'keyup', arg); out.push(state()); }
    else if (k === 's') {
      for (let i = 0; i < Number(arg); i++) { if (gp) gp.poll(1 / 240); input.step(1 / 240); }
      out.push(state());
    } else if (k === 'j') out.push(input.consumeJump() ? 'J1' : 'J0');
    else if (k === 'b') { target.dispatchEvent(new Event('blur')); out.push(state()); }
  }
  return out.join(' ');
}

const golden = process.argv.find((a) => a.startsWith('--golden='));
if (golden) {
  const mod = await import(pathToFileURL(golden.slice(9)).href);
  console.log(keyboardTrace(mod.Input, false));
  process.exit(0);
}

const KEYBOARD_TRACE = '1,0,0p 1,0,0 1,1,1200p 1,1,1158 J1 1,1,0 0,1,0p 0,1,0 -1,1,0 -1,1,0 '
  + '-1,1,0 -1,1,0 -1,0,0 -1,0,0 J0 -1,1,1200p -1,1,1200p -1,0,1200 -1,0,1158 J1 0,0,0 0,0,0 '
  + '1,0,0p 0,0,0p 0,0,0 1,0,0 1,0,0 J0 1,1,1200p 1,1,783 J1 1,0,0 0,0,0 0,0,0 0,0,0 0,0,0 '
  + '0,0,0 0,0,0 0,0,0 J0';

// --- a rig: one Input, one Gamepad, fake pads ------------------------------------------
function rig(pads = []) {
  const target = new EventTarget();
  const input = new Input(target);
  const keys = [];
  const r = { target, input, keys, pads, lost: 0 };
  r.gp = new Gamepad(input, {
    onKey: (c) => keys.push(c), onLost: () => { r.lost++; },
    nav: { getGamepads: () => r.pads }, target,
  });
  r.poll = (dt = 1 / 60) => { r.gp.poll(dt); input.step(dt); };
  return r;
}

// --- the stick: deadzone and hysteresis ----------------------------------------------
{
  const pad = makePad(0);
  const r = rig([pad]);
  const drift = [0.2, -0.25, 0.29, -0.29, 0.31, -0.31, 0.49, -0.49, 0.1, 0];
  let moved = 0;
  for (const x of drift) { tilt(pad, x, 0.3); r.poll(); if (r.input.axis !== 0) moved++; }
  check(moved === 0, `a resting or half-pushed stick (|x| under ${STICK_ENGAGE}) never moves him`, `${moved} of ${drift.length} polls moved`);

  tilt(pad, STICK_ENGAGE); r.poll();
  const engaged = r.input.axis;
  tilt(pad, 0.4); r.poll();
  const held40 = r.input.axis;
  tilt(pad, STICK_RELEASE + 0.01); r.poll();
  const heldRel = r.input.axis;
  tilt(pad, STICK_RELEASE - 0.01); r.poll();
  const let_go = r.input.axis;
  check(engaged === 1 && held40 === 1 && heldRel === 1 && let_go === 0,
    `engages at ${STICK_ENGAGE}, holds down to ${STICK_RELEASE}, lets go under it`,
    `${engaged} ${held40} ${heldRel} ${let_go}`);

  // A thumb resting right on the threshold: 0.45/0.55 alternating must switch on ONCE,
  // then 0.25/0.35 must switch off once -- not flicker with every frame.
  let changes = 0; let last = r.input.axis;
  const wobble = [];
  for (let i = 0; i < 20; i++) wobble.push(i % 2 ? 0.45 : 0.55);
  for (let i = 0; i < 20; i++) wobble.push(i % 2 ? 0.35 : 0.25);
  for (const x of wobble) {
    tilt(pad, x); r.poll();
    if (r.input.axis !== last) { changes++; last = r.input.axis; }
  }
  check(changes === 2, 'a stick wobbling across a threshold switches once each way, no chatter', `${changes} changes`);

  tilt(pad, -0.8); r.poll();
  check(r.input.axis === -1, 'pushed left is -1, the same axis ArrowLeft gives');
  tilt(pad, 0, 0.9); r.poll();
  check(r.input.axis === 0, 'straight down on the stick does not steer');
}

// --- the D-pad ------------------------------------------------------------------------
{
  const pad = makePad(0);
  const r = rig([pad]);
  const seen = [];
  press(pad, BTN.LEFT); r.poll(); seen.push(r.input.axis);
  release(pad, BTN.LEFT); r.poll(); seen.push(r.input.axis);
  press(pad, BTN.RIGHT); r.poll(); seen.push(r.input.axis);
  press(pad, BTN.LEFT); r.poll(); seen.push(r.input.axis);
  release(pad, BTN.LEFT); release(pad, BTN.RIGHT);
  press(pad, BTN.UP); press(pad, BTN.DOWN); r.poll(); seen.push(r.input.axis);
  check(seen.join() === '-1,0,1,0,0', 'D-pad left -1, released 0, right 1, both 0, up/down 0', seen.join());

  release(pad, BTN.UP); release(pad, BTN.DOWN);
  tilt(pad, -1); press(pad, BTN.RIGHT); r.poll();
  check(r.input.axis === 1, 'the D-pad wins over the stick while it is pressed', `axis ${r.input.axis}`);
}

// --- the jump: one refill per press, held while held -----------------------------------
{
  const pad = makePad(0);
  const r = rig([pad]);
  press(pad, BTN.A); r.gp.poll(1 / 60);
  const full = r.input.jumpBuffer === JUMP_BUFFER && r.input.jumpHeld;
  const first = r.input.consumeJump();
  let again = 0;
  for (let i = 0; i < 30; i++) { r.poll(); if (r.input.consumeJump()) again++; }
  check(full && first && again === 0, 'A fills the jump buffer once on the press; 30 frames held give no second jump',
    `filled ${full}, first ${first}, again ${again}`);
  check(r.input.jumpHeld, 'jumpHeld is true while A is held');
  release(pad, BTN.A); r.poll();
  check(!r.input.jumpHeld, 'jumpHeld goes false when A is released');

  // The refill must not happen while held even when nobody consumes it: the buffer
  // drains, and a held A must not top it back up.
  press(pad, BTN.A); r.gp.poll(1 / 60);
  r.input.step(0.1);
  r.gp.poll(1 / 60);
  const drained = Math.abs(r.input.jumpBuffer - (JUMP_BUFFER - 0.1)) < 1e-9;
  check(drained, 'a held A does not top the draining buffer back up', `buffer ${r.input.jumpBuffer.toFixed(4)}`);

  // Count refills over press-hold-release twice.
  release(pad, BTN.A); r.poll(); r.poll();
  let refills = 0;
  for (let n = 0; n < 2; n++) {
    press(pad, BTN.A);
    for (let i = 0; i < 10; i++) { r.gp.poll(1 / 60); if (r.input.jumpBuffer === JUMP_BUFFER) refills++; r.input.step(1 / 60); }
    release(pad, BTN.A);
    for (let i = 0; i < 5; i++) r.poll();
  }
  check(refills === 2, 'two presses, held ten frames each, refill the buffer exactly twice', `${refills} refills`);
}

// --- menu codes and their repeat ------------------------------------------------------
{
  const pad = makePad(0);
  const r = rig([pad]);
  const pressOnce = (btn, frames = 20) => {
    press(pad, btn); for (let i = 0; i < frames; i++) r.poll(); release(pad, btn); r.poll();
  };
  pressOnce(BTN.A); pressOnce(BTN.B); pressOnce(BTN.START); pressOnce(BTN.BACK);
  pressOnce(BTN.X); pressOnce(BTN.Y); pressOnce(BTN.LB); pressOnce(BTN.RB); pressOnce(BTN.RT);
  check(r.keys.join() === 'Space,Escape,PadStart,KeyO,PadX,PadY,PadLB,PadRB',
    'A, B, Start, Back, X, Y, LB, RB send Space, Escape, PadStart, KeyO, PadX, PadY, PadLB, PadRB once each, however long held; RT nothing',
    r.keys.join());

  r.keys.length = 0;
  press(pad, BTN.UP); r.poll(); release(pad, BTN.UP); r.poll();
  press(pad, BTN.DOWN); r.poll(); release(pad, BTN.DOWN); r.poll();
  press(pad, BTN.LEFT); r.poll(); release(pad, BTN.LEFT); r.poll();
  press(pad, BTN.RIGHT); r.poll(); release(pad, BTN.RIGHT); r.poll();
  check(r.keys.join() === 'ArrowUp,ArrowDown,ArrowLeft,ArrowRight', 'the D-pad sends the arrow keys', r.keys.join());

  r.keys.length = 0;
  const flick = (x, y) => { tilt(pad, x, y); r.poll(); tilt(pad, 0, 0); r.poll(); };
  flick(0, -0.9); flick(0, 0.9); flick(-0.9, 0); flick(0.9, 0);
  flick(0.7, 0.6);          // a thumb going right, a little low: right only
  flick(0.2, 0.35);         // resting drift: nothing
  check(r.keys.join() === 'ArrowUp,ArrowDown,ArrowLeft,ArrowRight,ArrowRight',
    'stick flicks send one arrow each, the stronger direction only, drift nothing', r.keys.join());

  // A thumb hovering at the threshold for a third of a second (under the repeat delay)
  // is one press, not one per wobble.
  r.keys.length = 0;
  for (let i = 0; i < 20; i++) { tilt(pad, 0, i % 2 ? 0.45 : 0.55); r.gp.poll(1 / 60); }
  tilt(pad, 0, 0); r.poll();
  check(r.keys.join() === 'ArrowDown', 'a stick wobbling on the threshold presses the menu once', r.keys.join());

  // Held: once on the press, again after REPEAT_DELAY, then every REPEAT_RATE.
  const times = [];
  const dt = 1 / 144;
  let t = 0;
  r.keys.length = 0;
  press(pad, BTN.DOWN);
  for (let i = 0; i <= 144; i++) {
    const before = r.keys.length;
    r.gp.poll(i === 0 ? dt : dt); t = i * dt;
    if (r.keys.length > before) times.push(t);
  }
  release(pad, BTN.DOWN); r.poll();
  const gaps = times.slice(2).map((x, i) => x - times[i + 1]);
  const expected = 2 + Math.floor((1 - REPEAT_DELAY) / REPEAT_RATE + 1e-9);
  const firstOk = times[0] === 0;
  const delayOk = times[1] >= REPEAT_DELAY - 1e-9 && times[1] <= REPEAT_DELAY + dt + 1e-9;
  const rateOk = gaps.length > 0 && gaps.every((g) => g >= REPEAT_RATE - dt - 1e-9 && g <= REPEAT_RATE + dt + 1e-9);
  check(firstOk && delayOk && rateOk && Math.abs(times.length - expected) <= 1,
    `a held direction repeats: at once, after ${REPEAT_DELAY} s, then every ${REPEAT_RATE} s (${times.length} in 1 s)`,
    `times ${times.map((x) => x.toFixed(3)).join(' ')}`);

  // A frame that took a quarter of a second must not fire a burst of catch-up presses.
  r.keys.length = 0;
  press(pad, BTN.DOWN); r.gp.poll(1 / 60);
  for (let i = 0; i < 30; i++) r.gp.poll(1 / 60);
  const beforeStall = r.keys.length;
  r.gp.poll(0.25);
  const burst = r.keys.length - beforeStall;
  release(pad, BTN.DOWN); r.poll();
  check(burst <= 1, 'a stalled frame fires at most one repeat, not a burst', `${burst} in one frame`);

  // The stick repeats the same way.
  r.keys.length = 0;
  tilt(pad, 0, 0.9);
  for (let i = 0; i <= 33; i++) r.gp.poll(1 / 60);   // 0.55 s: the press, 0.4, 0.5
  tilt(pad, 0, 0); r.poll();
  check(r.keys.length === 3, 'a held stick repeats like the D-pad', `${r.keys.length} in 0.55 s`);
}

// --- a pad that goes away -------------------------------------------------------------
{
  const pad = makePad(0);
  const r = rig([pad]);
  press(pad, BTN.RIGHT); press(pad, BTN.A); r.poll();
  const before = r.input.axis === 1 && r.input.jumpHeld;
  r.pads = [];
  r.poll();
  check(before && r.lost === 1 && r.input.axis === 0 && !r.input.jumpHeld,
    'unplugged while driving: onLost fires once and it lets go of the axis and the jump',
    `lost ${r.lost}, axis ${r.input.axis}, held ${r.input.jumpHeld}`);

  const pad2 = makePad(0);
  const r2 = rig([pad2]);
  press(pad2, BTN.LEFT); r2.poll();
  const ev = new Event('gamepaddisconnected');
  ev.gamepad = { index: 0 };
  r2.target.dispatchEvent(ev);
  const atOnce = r2.lost;
  r2.pads = []; r2.poll(); r2.poll();
  check(atOnce === 1 && r2.lost === 1 && r2.input.axis === 0,
    'the disconnect event says so at once, and the poll that follows does not say it twice',
    `at once ${atOnce}, after ${r2.lost}`);

  const r3 = rig([makePad(0)]);
  r3.poll();
  r3.pads[0].connected = false;
  r3.poll();
  check(r3.lost === 0, 'a pad nobody touched can come and go without pausing anything', `lost ${r3.lost}`);
}

// --- two pads: the last one used drives ------------------------------------------------
{
  const p0 = makePad(0);
  const p1 = makePad(1);
  const r = rig([p0, p1]);
  // Pad 0 runs right holding A. Pad 1 takes over with its D-pad: pad 0's run and its held
  // jump are let go (pad 1 holds neither), so pad 1's own A then finds the jump key up and
  // jumps. Pad 0 takes the driving back with a press pad 1 is not making.
  press(p0, BTN.RIGHT); press(p0, BTN.A); r.poll(); r.input.consumeJump();
  const first = r.input.axis;
  press(p1, BTN.LEFT); r.poll();
  const afterSwitch = r.input.axis;
  const heldAfter = r.input.jumpHeld;
  press(p1, BTN.A); r.poll();
  const p1jumped = r.input.consumeJump();
  press(p0, BTN.UP); r.poll();
  const back = r.input.axis;
  check(first === 1 && afterSwitch === -1 && !heldAfter && p1jumped && back === 1 && r.gp.driver === 0,
    'the pad used last drives, and the one it took over from lets go of what it held',
    `${first} ${afterSwitch} held ${heldAfter} jumped ${p1jumped} ${back} driver ${r.gp.driver}`);
  check(r.keys.join() === 'ArrowRight,Space,ArrowLeft,Space,ArrowUp', 'only the driving pad speaks to the menus', r.keys.join());

  r.pads = [p0];      // pad 1 is not driving: no pause
  r.poll();
  const lostOther = r.lost;
  r.pads = [];        // pad 0 is
  r.poll();
  check(lostOther === 0 && r.lost === 1, 'unplugging the pad that is not driving pauses nothing; the driver does',
    `${lostOther} then ${r.lost}`);
}

// --- one controller seen as two pads ---------------------------------------------------
//
// Steam Input presents a PlayStation pad as a virtual Xbox one, and a browser that also
// reads the real pad sees two, each reporting every press -- not always in the same poll.
// It has to play as one pad: one refill of the jump buffer per press of A, the jump held
// until A is let go (a handover that let go of it cut the jump to a hop), one menu key per
// press. Three schedules: the copy a poll late on everything; the copy a poll EARLY on the
// stick, which hands the driving across and back; and both in the same poll.
{
  const A = (p) => press(p, BTN.A);
  const upA = (p) => release(p, BTN.A);
  const right = (p) => tilt(p, 0.9, 0);
  const down = (p) => press(p, BTN.DOWN);
  const letGo = (p) => { tilt(p, 0, 0); release(p, BTN.DOWN); };
  const play = (schedule) => {
    const d0 = makePad(0);
    const d1 = makePad(1);
    const r = rig([d0, d1]);
    let refills = 0;
    const held = [];
    for (const poll of schedule) {
      for (const [who, act] of poll) act(who === 0 ? d0 : d1);
      r.gp.poll(1 / 60);
      if (r.input.jumpBuffer === JUMP_BUFFER) refills++;
      held.push(r.input.jumpHeld ? 1 : 0);
      r.input.step(1 / 60);
    }
    return `refills ${refills}, held ${held.join('')}, keys ${r.keys.join()}`;
  };
  const want = 'refills 1, held 111000, keys Space,ArrowRight,ArrowDown';
  const late = play([[[0, A]], [[0, right], [1, A]], [[0, down], [1, right]], [[0, upA], [1, down]],
    [[0, letGo], [1, upA]], [[1, letGo]]]);
  const early = play([[[0, A]], [[1, A], [1, right]], [[0, right], [0, down]], [[1, down], [0, upA]],
    [[1, upA], [0, letGo]], [[1, letGo]]]);
  const same = play([[[0, A], [1, A]], [[0, right], [1, right]], [[0, down], [1, down]], [[0, upA], [1, upA]],
    [[0, letGo], [1, letGo]], []]);
  check(late === want && early === want && same === want,
    'one controller seen as two pads plays as one: one jump held till A is let go, one menu key a press',
    `late: ${late}; early: ${early}; same poll: ${same}`);
}

// --- a blur empties the Input; a stick still held comes back -----------------------
{
  const pad = makePad(0);
  const r = rig([pad]);
  tilt(pad, 0.9); press(pad, BTN.A); r.poll(); r.input.consumeJump();
  r.target.dispatchEvent(new Event('blur'));
  const cleared = r.input.axis === 0 && !r.input.jumpHeld;
  r.poll();
  check(cleared && r.input.axis === 1 && r.input.jumpBuffer <= 0,
    'after a blur a held stick steers again on the next frame; a held A does not jump again',
    `cleared ${cleared}, axis ${r.input.axis}, buffer ${r.input.jumpBuffer.toFixed(3)}`);
}

// --- the keyboard is untouched -------------------------------------------------------
{
  const bare = keyboardTrace(Input, false);
  const idle = keyboardTrace(Input, 'idle');
  const driving = keyboardTrace(Input, 'driving');
  check(bare === KEYBOARD_TRACE, 'the keyboard behaves exactly as input.js did before the pad (62bb95e)',
    bare === KEYBOARD_TRACE ? '' : `got ${bare}`);
  check(idle === KEYBOARD_TRACE, '...and exactly so with an idle pad connected and polled every step',
    idle === KEYBOARD_TRACE ? '' : `got ${idle}`);
  check(driving === KEYBOARD_TRACE, '...and with a pad that was used and put down, still the one that drives',
    driving === KEYBOARD_TRACE ? '' : `got ${driving}`);

  const target = new EventTarget();
  new Input(target);
  const down = key(target, 'keydown', 'ArrowDown');
  const enter = key(target, 'keydown', 'Enter');
  check(down.defaultPrevented && !enter.defaultPrevented,
    "ArrowDown's default is prevented, so the options cursor does not scroll itch.io's page");
}

// --- lastDevice ---------------------------------------------------------------------
{
  const pad = makePad(0);
  const r = rig([pad]);
  const seen = [r.input.lastDevice];
  tilt(pad, 0.2); r.poll(); seen.push(r.input.lastDevice);         // drift: not a touch
  press(pad, BTN.X); r.poll(); seen.push(r.input.lastDevice);       // any button counts
  key(r.target, 'keydown', 'KeyM'); seen.push(r.input.lastDevice);
  r.poll(); seen.push(r.input.lastDevice);                           // X still held: no new touch
  tilt(pad, 0.8); r.poll(); seen.push(r.input.lastDevice);          // the stick engaging is one
  key(r.target, 'keydown', 'Space'); seen.push(r.input.lastDevice);
  check(seen.join() === 'keys,keys,pad,keys,keys,pad,keys',
    "lastDevice follows whichever was touched last, and a pad merely held does not claim it", seen.join());

  // A button past the standard seventeen (a DualSense's touchpad click), HELD on a second
  // pad: its press is a touch, holding it is not. Counted every frame, it re-claimed
  // lastDevice straight after a key, and pulled the driving from the pad in play.
  const p0 = makePad(0);
  const p1 = makePad(1);
  p1.buttons.push({ pressed: false, touched: false, value: 0 });
  const r2 = rig([p0, p1]);
  press(p0, BTN.RIGHT); r2.poll();
  p1.buttons[17] = { pressed: true, touched: true, value: 1 };
  r2.poll();
  const tookOver = r2.gp.driver === 1;
  press(p0, BTN.LEFT); release(p0, BTN.RIGHT); r2.poll(); r2.poll(); r2.poll();
  key(r2.target, 'keydown', 'KeyM');
  r2.poll();
  check(tookOver && r2.input.axis === -1 && r2.input.lastDevice === 'keys',
    'an extra button counts as a touch on its press only: held, it neither takes the driving back nor lastDevice',
    `took over ${tookOver}, axis ${r2.input.axis}, driver ${r2.gp.driver}, lastDevice ${r2.input.lastDevice}`);
}

// --- a browser that refuses the API ---------------------------------------------------
{
  const target = new EventTarget();
  const input = new Input(target);
  let calls = 0;
  const nav = { getGamepads() { calls++; throw new DOMException('disallowed by permissions policy', 'SecurityError'); } };
  const gp = new Gamepad(input, { nav, target });
  const warn = console.warn; console.warn = () => {};
  let threw = false;
  try { for (let i = 0; i < 10; i++) gp.poll(1 / 60); } catch (e) { threw = true; }
  console.warn = warn;
  const none = new Gamepad(new Input(new EventTarget()), { nav: {}, target: new EventTarget() });
  let threwNone = false;
  try { none.poll(1 / 60); } catch (e) { threwNone = true; }
  check(!threw && !threwNone && gp.blocked && calls === 1,
    'getGamepads throwing (a frame without the gamepad permission) or missing is survived, and asked once',
    `threw ${threw}/${threwNone}, calls ${calls}`);
}

// --- the Loop polls before it steps ---------------------------------------------------
{
  globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || (() => 0);
  const order = [];
  const loop = new Loop({
    update: () => order.push('step'), render: () => order.push('draw'),
    onFrame: (dt) => order.push(`poll ${Math.round(dt * 1000)}`),
  });
  loop.running = true;
  loop.prev = 0;
  loop._tick(1000 / 60);
  loop._tick(2000 / 60);
  check(order.join() === 'poll 17,step,step,step,step,draw,poll 17,step,step,step,step,draw',
    "the Loop polls the pad once per frame, BEFORE that frame's steps, with the frame's dt", order.join());
}

// --- main.js, booted --------------------------------------------------------------
{
  // PAD_TEST_SEED picks another tower; a sweep of seeds 1-30 passed when this was written.
  const page = installPage({ storage: 'memory', seed: Number(process.env.PAD_TEST_SEED) || 1 });
  const t0 = Date.now();
  const V = await bootMain();
  const { STATE } = await import('../src/game/game.js');
  const { TUTORIAL_PAGES } = await import('../src/ui/screens.js');
  const bootMs = Date.now() - t0;
  const g = V.game;
  const pad = makePad(0);
  page.pads = [pad];
  const tap = (btn) => { press(pad, btn); frame(V); release(pad, btn); frame(V); };
  const run = (n) => { for (let i = 0; i < n; i++) frame(V); };
  // A jump pressed in mid-air is buffered for 0.12 s and then dropped, as it should be;
  // seed 19 put him in the air at the tap and read as "A does not jump". Land first.
  const land = () => { for (let i = 0; i < 240 && !g.player.grounded; i++) frame(V); };

  const s0 = g.state;
  tap(BTN.START);
  const s1 = g.state;
  check(s0 === STATE.MENU && s1 === STATE.TUTORIAL,
    'Start on the title confirms (the first run opens the guide), never Escape, which would quit',
    `${s0} -> ${s1}`);

  for (let i = 0; i < TUTORIAL_PAGES.length - 1; i++) tap(BTN.A);
  const stillGuide = g.state;
  tap(BTN.A);
  check(stillGuide === STATE.TUTORIAL && g.state === STATE.PLAYING,
    `A pages the guide as Space does: ${TUTORIAL_PAGES.length - 1} presses to its last page, one more to climb`,
    `${stillGuide} then ${g.state}`);

  // Kept SHORT from here to the pause. Once he leaves the ground the floor starts to
  // rise (RISE_START_FLOOR is 1), and a test that idles up there for seconds is testing
  // whether this particular tower lets him live: the first version of this block did,
  // and failed on some towers and not others. The page seeds Math.random as well, so
  // every boot climbs the same tower.
  run(30);
  const x0 = g.player.x;
  tilt(pad, 0.9); run(20); tilt(pad, 0); run(2);
  const moved = g.player.x - x0;
  land();
  const j0 = g.run.jumps;
  tap(BTN.A); run(20);
  const jumped = g.run.jumps - j0;
  tap(BTN.B); tap(BTN.BACK); tap(BTN.DOWN);
  const untouched = g.state;
  tap(BTN.START);
  const paused = g.state;
  check(moved > 0 && jumped === 1, 'in a run the stick moves him and A jumps him, through the Input',
    `moved ${moved.toFixed(1)}, jumps ${j0} -> ${j0 + jumped}`);
  check(untouched === STATE.PLAYING, 'B, Back and the D-pad do nothing to a run: only Start reaches the menus', untouched);

  tap(BTN.START);
  const resumed = g.state;
  tap(BTN.START);
  check(paused === STATE.PAUSED && resumed === STATE.PLAYING && g.state === STATE.PAUSED,
    'Start pauses a run and Start resumes it', `${paused} -> ${resumed} -> ${g.state}`);

  tap(BTN.A);
  check(g.state === STATE.PLAYING, 'A resumes from the pause, as Space does', g.state);

  // Pulled out mid-run: the event arrives before any poll.
  press(pad, BTN.RIGHT); frame(V);
  const ev = new Event('gamepaddisconnected');
  ev.gamepad = { index: 0 };
  page.pads = [];
  page.win.dispatchEvent(ev);
  check(g.state === STATE.PAUSED, 'a pad unplugged mid-run pauses it, as losing focus does', g.state);
  frame(V);
  check(V.input.axis === 0, '...and lets go of the direction it was holding', `axis ${V.input.axis}`);

  // The keyboard, in the same booted game, with an idle pad plugged back in: Q from the
  // pause to the title, Space for a fresh run on the ground, a jump, and the pause keys.
  page.pads = [makePad(0)];
  const tapKey = (code) => { key(page.win, 'keydown', code); frame(V); key(page.win, 'keyup', code); frame(V); };
  tapKey('KeyQ');
  const kMenu = g.state;
  tapKey('Space');
  const kRun = g.state;
  run(30);
  land();
  const kj = g.run.jumps;
  key(page.win, 'keydown', 'Space'); run(2); key(page.win, 'keyup', 'Space'); run(20);
  const kJumped = g.run.jumps - kj;
  tapKey('Escape');
  const kPaused = g.state;
  tapKey('Escape');
  const kResumed = g.state;
  tapKey('KeyP');
  check(kMenu === STATE.MENU && kRun === STATE.PLAYING && kJumped === 1 && kPaused === STATE.PAUSED
      && kResumed === STATE.PLAYING && g.state === STATE.PAUSED,
    'the keyboard still quits to the title, starts, jumps, pauses and resumes with a pad connected',
    `${kMenu}, ${kRun}, jumped ${kJumped}, ${kPaused}, ${kResumed}, ${g.state}`);
  check(V.input.lastDevice === 'keys', 'lastDevice reads keys after the keyboard', V.input.lastDevice);

  // The screens only a letter opens, from a pad alone: the stats (S) from the pause and the
  // title, the way from the pause back to the title (Q) and the help (H). Without X and Y
  // none of them could be reached, and a paused run could only be resumed.
  const pad2 = makePad(0);
  page.pads = [pad2];
  const tap2 = (btn) => { press(pad2, btn); frame(V); release(pad2, btn); frame(V); };
  const walk = [g.state];
  tap2(BTN.Y); walk.push(g.state);      // paused -> stats
  tap2(BTN.B); walk.push(g.state);      // -> paused
  tap2(BTN.X); walk.push(g.state);      // -> the title
  tap2(BTN.Y); walk.push(g.state);      // -> stats
  tap2(BTN.B); walk.push(g.state);      // -> the title
  tap2(BTN.X); walk.push(g.state);      // -> help
  tap2(BTN.B); walk.push(g.state);      // any button leaves it
  const want = [STATE.PAUSED, STATE.STATS, STATE.PAUSED, STATE.MENU, STATE.STATS, STATE.MENU,
    STATE.HELP, STATE.MENU];
  check(walk.join() === want.join(),
    'a pad alone reaches the stats from the pause and the title, the title from the pause (X) and the help (X)',
    walk.join(' '));

  // In the options S moves the cursor down, so Y must not become S there: the A after it
  // has to change the first row (the cursor starts on it), not the second.
  const Settings = await import('../src/game/settings.js');
  const [row0, row1] = [Settings.OPTIONS[0].key, Settings.OPTIONS[1].key];
  const set0 = Settings.load();
  tap2(BTN.BACK); tap2(BTN.Y); tap2(BTN.A);
  const set1 = Settings.load();
  tap2(BTN.B);
  check(set1[row0] !== set0[row0] && set1[row1] === set0[row1] && g.state === STATE.MENU,
    'Y in the options moves nothing: A after it still changes the first row',
    `${row0} ${set0[row0]} -> ${set1[row0]}, ${row1} ${set0[row1]} -> ${set1[row1]}, ${g.state}`);

  // The rest of the screens, from a pad alone: the guide from the options' last row (Up
  // wraps to it), a run, the death fall skipped with A, the game over, its stats and back,
  // a new run with Start, a fall left with B for the title, and B on the title, which is
  // Escape and so the quit (the browser refuses window.close and the notice shows until
  // any press). die() stands in for the rising floor: the screens are under test here,
  // not the dying.
  const rest = [g.state];
  const step2 = (btn) => { tap2(btn); rest.push(g.state); };
  step2(BTN.BACK); step2(BTN.UP); step2(BTN.A);           // options, last row, the guide
  step2(BTN.RIGHT); step2(BTN.LEFT); step2(BTN.B);          // a page on, back, out to the options
  step2(BTN.B); step2(BTN.A);                               // the title, a run
  g.die(); rest.push(g.state);
  step2(BTN.A); step2(BTN.Y); step2(BTN.RIGHT); step2(BTN.B);   // fall skipped, game over, stats, back
  step2(BTN.START);                                         // a new run
  g.die(); rest.push(g.state);
  step2(BTN.B);                                             // the fall left for the title
  const closes = page.closeCalls;
  step2(BTN.B); step2(BTN.DOWN);                            // quit asked, notice dismissed
  const wantRest = [STATE.MENU, STATE.OPTIONS, STATE.OPTIONS, STATE.TUTORIAL, STATE.TUTORIAL, STATE.TUTORIAL,
    STATE.OPTIONS, STATE.MENU, STATE.PLAYING, STATE.FALLING, STATE.DEAD, STATE.STATS, STATE.STATS, STATE.DEAD,
    STATE.PLAYING, STATE.FALLING, STATE.MENU, STATE.MENU, STATE.MENU];
  check(rest.join() === wantRest.join() && page.closeCalls === closes + 1,
    'a pad alone walks the guide from the options, the fall, the game over and its stats, a new run and the quit',
    `${rest.join(' ')}; close asked ${page.closeCalls - closes}`);

  // A tap shorter than one simulation step: pressed on one poll and released on the very
  // next, with no step between them (two frames of a display faster than 240 Hz). The
  // press refills the jump buffer as a keydown does, so the step after the release still
  // jumps, once; a pad that only held jumpHeld would lose the tap entirely.
  step2(BTN.A);
  run(30); land();
  const jq = g.run.jumps;
  press(pad2, BTN.A); V.loop.onFrame(1 / 480);
  release(pad2, BTN.A); V.loop.onFrame(1 / 480);
  run(20);
  check(g.state === STATE.PLAYING && g.run.jumps - jq === 1,
    'A pressed and released between two steps still jumps, exactly once', `${g.state}, jumps ${g.run.jumps - jq}`);

  // A pad keeps working when the window loses the keyboard (another monitor, itch's page
  // around the frame). The blur pauses the run as before; Start resumes it, and a run
  // played on the pad is drawn at full rate, not at the 10 fps an unfocused window gets.
  // The keyboard's own case is unchanged: a run resumed from keys while unfocused stays
  // capped.
  // A frame after each blur, as a browser would draw many before anyone presses Start:
  // update() notices a state change only on a step, and here it must see the pause.
  page.win.dispatchEvent(new Event('blur')); frame(V);
  const blurPaused = g.state;
  tap2(BTN.START);
  const padCap = V.loop.minFrame;
  const padState = g.state;
  page.win.dispatchEvent(new Event('blur')); frame(V);
  key(page.win, 'keydown', 'Escape'); frame(V); key(page.win, 'keyup', 'Escape'); frame(V);
  const keyCap = V.loop.minFrame;
  const keyState = g.state;
  page.win.dispatchEvent(new Event('focus'));
  check(blurPaused === STATE.PAUSED && padState === STATE.PLAYING && padCap === 0
      && keyState === STATE.PLAYING && Math.abs(keyCap - 1 / 30) < 1e-9,
    // 30 fps unfocused since 2026-09-29: 10 (5 on the menus) read as the game glitching in a
    // window left in view on another monitor (main.js applyRenderCap).
    'unfocused, a run resumed on the pad draws at full rate; one resumed from the keys stays at 30 fps',
    `${blurPaused}; pad ${padState} cap ${padCap}; keys ${keyState} cap ${keyCap}`);

  console.log(`  (main.js booted in ${bootMs} ms)`);
}

console.log('\n  ' + (bad === 0
  ? 'RESULT: PASS - a pad is keys to the Input and the menus; keyboard unchanged.'
  : `RESULT: FAIL - ${bad} problem(s).`));
process.exit(bad ? 1 : 0);
