// Does it fill the screen? On every screen, not just the one it was built on.
//
// The canvas is displayed at some multiple of the backing store (VW*PX by VH*PX). For
// a long time that multiple was always a WHOLE number, which is pixel-exact on the two
// resolutions this was developed against and wasteful to the point of broken on most
// others -- at 1600x900 the game ran in 36% of the display, letterboxed on all four
// sides, because 1.67x rounds down to 1x.
//
// Every number below is arithmetic over a viewport size, so every screen anybody is
// likely to own can be checked here rather than found out about later.

import { installDom } from './headless.mjs';

installDom();

const { scaleFor } = await import('../src/render/renderer.js');
const { SW, SH } = await import('../src/game/constants.js');
const { SCALE_MODES, DEFAULTS } = await import('../src/game/settings.js');

let bad = 0;
const fail = (m) => { console.log('  FAIL ' + m); bad++; };

// Real displays, plus the window sizes the desktop shell allows.
//
// There is no per-screen expectation of "crisp" or "full" any more. Which one a given
// display gets depends on PX, so a table of them is a table of today's answers -- at
// PX=2 5120x2880 was an exact 5x and at PX=4 it is 2.67 and fills instead. The
// invariant that does not move is the disjunction: AUTO gives you a whole multiple OR
// it gives you the whole screen, always one of the two, never neither.
const SCREENS = [
  ['4K            3840x2160', 3840, 2160],
  ['5K            5120x2880', 5120, 2880],
  ['1440p         2560x1440', 2560, 1440],
  ['1080p         1920x1080', 1920, 1080],
  ['900p          1600x900', 1600, 900],
  ['768p          1366x768', 1366, 768],
  ['720p          1280x720', 1280, 720],
  ['ultrawide     3440x1440', 3440, 1440],
  ['ultrawide     2560x1080', 2560, 1080],
  ['laptop        1512x982', 1512, 982],
  ['min window    640x360', 640, 360],
  ['small window  800x600', 800, 600],
];

console.log('  screen                    auto      of screen   integer   fill');
for (const [name, w, h] of SCREENS) {
  const a = scaleFor(w, h, 'auto');
  const i = scaleFor(w, h, 'integer');
  const f = scaleFor(w, h, 'fill');

  // Nothing may ever be drawn larger than the window. Anything bigger is not a border,
  // it is the edges of the play area hanging off the screen where they cannot be seen.
  for (const [mode, s] of [['auto', a], ['integer', i], ['fill', f]]) {
    if (SW * s > w + 0.5 || SH * s > h + 0.5) {
      fail(`${name} in ${mode}: ${(SW * s).toFixed(0)}x${(SH * s).toFixed(0)} does not fit ${w}x${h}`);
    }
    if (!(s > 0)) fail(`${name} in ${mode}: scale ${s}`);
  }

  // FILL must actually fill one axis, or it is not doing the one thing it is for.
  const filled = Math.max((SW * f) / w, (SH * f) / h);
  if (filled < 0.999) fail(`${name} in fill: touches neither edge (${(filled * 100).toFixed(1)}%)`);

  // INTEGER must be whole wherever there is room to be.
  if (Math.min(w / SW, h / SH) >= 1 && !Number.isInteger(i)) {
    fail(`${name} in integer: ${i} is not a whole multiple`);
  }

  // AUTO must be one of the two, never something in between.
  if (a !== i && a !== f) fail(`${name} in auto: ${a} is neither the integer ${i} nor the fill ${f}`);

  const covered = Math.max((SW * a) / w, (SH * a) / h);
  const isCrisp = Number.isInteger(a);
  // THE INVARIANT: pixel-exact, or the whole screen. Never neither.
  if (!isCrisp && covered < 0.999) {
    fail(`${name}: ${a.toFixed(3)}x is neither a whole multiple nor full-screen (${(covered * 100).toFixed(1)}%)`);
  }

  console.log(`  ${name.padEnd(24)}  ${a.toFixed(2).padStart(5)}x   ` +
    `${String(Math.round(covered * 100)).padStart(4)}%       ` +
    `${i.toFixed(2).padStart(5)}x   ${f.toFixed(2).padStart(5)}x   ${isCrisp ? 'crisp' : 'filled'}`);
}

// The aspect ratio is never touched: one scale for both axes, so the tower cannot end
// up stretched on an ultrawide.
for (const [, w, h] of SCREENS) {
  for (const mode of SCALE_MODES) {
    const s = scaleFor(w, h, mode);
    if (!((SW * s) / (SH * s) - SW / SH < 1e-9)) fail(`aspect ratio drifted at ${w}x${h} in ${mode}`);
  }
}

// A garbage viewport must not produce a garbage scale. This runs during a resize, and a
// zero-height window is something a real window manager will hand you mid-animation.
for (const [w, h] of [[0, 0], [100, 0], [0, 100], [-5, -5], [NaN, NaN]]) {
  const s = scaleFor(w, h, 'auto');
  if (!(s > 0) || !Number.isFinite(s)) fail(`viewport ${w}x${h} gave a scale of ${s}`);
}

if (DEFAULTS.scaleMode !== 'auto') fail(`the default scale mode is '${DEFAULTS.scaleMode}', not 'auto'`);
if (!SCALE_MODES.includes('auto')) fail('auto is not one of the offered modes');

// The two resolutions the game was built against must stay pixel-exact, because the
// whole point of integer scaling is that it costs nothing there.
//
// Asserted as "is a whole number", not as "is 4" and "is 2". Those were the right
// answers at PX=2 and they are 2 and 1 at PX=4 -- a test pinned to the literal would
// have gone red on a change that PRESERVES the property it exists to protect, and
// anyone reading the failure would have drawn the opposite conclusion.
for (const [name, w, h] of [['4K', 3840, 2160], ['1080p', 1920, 1080]]) {
  const s = scaleFor(w, h, 'auto');
  if (!Number.isInteger(s)) fail(`${name} is no longer pixel-exact: ${s.toFixed(3)}x`);
  else console.log(`  ok   ${name} is pixel-exact at ${s}x`);
}


// --- the world scale must be a whole number of screen pixels -------------------
//
// The renderer scales the world by k = zoom * PX. When k is fractional EVERY sprite in
// the game is resampled on its way to the screen -- not obviously broken, just softly
// wrong, everywhere, all the time. It was fractional across 96.7% of the arena's range
// and nothing caught it, because every test asked about the ART (SPR_W === BODY_W * PX)
// and none asked about the TRANSFORM that draws it.
{
  const C = await import('../src/game/constants.js');
  let frac = 0, badLeft = 0, tooNarrow = 0;
  const seen = new Set();
  for (let ah = C.ARENA_HALF_MIN; ah <= C.ARENA_HALF_MAX; ah += 0.25) {
    const zExact = C.VW / (2 * ah + 2 * C.WALL_W);
    const z = Math.max(1, Math.min(2, Math.floor(zExact * C.PX) / C.PX));
    const k = z * C.PX;
    if (Math.abs(k - Math.round(k)) > 1e-9) frac++;
    seen.add(k);
    const viewLeft = C.CX - (C.VW / z) / 2;
    if (Math.abs(viewLeft * k - Math.round(viewLeft * k)) > 1e-6) badLeft++;
    if (C.VW / z < 2 * ah + 2 * C.WALL_W - 1e-9) tooNarrow++;
  }
  if (frac) fail('world scale is fractional at ' + frac + ' arena widths');
  else console.log('  ok   world scale whole at every arena width (k = ' + [...seen].sort((a, b) => b - a).join(', ') + ')');
  if (badLeft) fail('horizontal placement is fractional at ' + badLeft + ' arena widths');
  else console.log('  ok   horizontal placement lands on whole pixels at every zoom');
  if (tooNarrow) fail('the view is narrower than the shaft at ' + tooNarrow + ' arena widths');
  else console.log('  ok   the shaft still fits the view at every quantised zoom');
}


// --- the render zoom glides, and still settles exactly on a whole scale ----------
//
// The two requirements pull against each other and both matter. A fractional world scale
// resamples every sprite, so the zoom must be quantised AT REST. Stepping straight to the
// next value snaps the whole view by 12.5%, which is what the zoom-out reported as not
// smooth was -- there was no transition at all, only a jump.
//
// So this asserts the shape of the compromise rather than either half of it: no visible
// jump on any frame, exact at rest, and the fractional stretch confined to the glide.
{
  const { Game, STATE: GS } = await import('../src/game/game.js');
  const { AutoInput, AutoPlayer } = await import('../src/game/autoplay.js');
  const { STEP } = await import('../src/core/loop.js');
  const C2 = await import('../src/game/constants.js');

  const input = new AutoInput();
  const game = new Game(input);
  const bot = new AutoPlayer(input);
  game.demo = true;
  game.newRun(0x2f6f1b21);

  let n = 0, worstJump = 0, frac = 0, prev = game.zoomView;
  while (n < 40000 && game.state === GS.PLAYING) {
    bot.step(game, STEP);
    game.step(STEP);
    n++;
    worstJump = Math.max(worstJump, Math.abs(game.zoomView - prev));
    prev = game.zoomView;
    const k = game.zoomView * C2.PX;
    if (Math.abs(k - Math.round(k)) > 1e-9) frac++;
  }
  const fracPc = (frac / n) * 100;
  // A step is 0.25 of zoom. Anything approaching that is a snap, not a glide.
  if (worstJump > 0.05) {
    fail(`the zoom jumps by ${worstJump.toFixed(3)} in one frame -- that is a snap`);
  } else if (fracPc > 10) {
    fail(`the world scale is fractional on ${fracPc.toFixed(1)}% of frames -- the glide is too slow`);
  } else if (game.zoomView !== game.zoom) {
    fail(`the glide never settled: view ${game.zoomView} against ${game.zoom}`);
  } else {
    console.log(`  ok   zoom glides (worst frame ${worstJump.toFixed(4)}), ` +
      `fractional on ${fracPc.toFixed(2)}% of ${n} frames, settles exact`);
  }
}


// --- a pause is a freeze ---------------------------------------------------------
//
// The simulation stops when paused, but p.x and p.px stop APART -- a step stores the
// previous position and then moves -- and the render alpha is the live accumulator, so it
// keeps sweeping between two frozen positions. The player vibrates behind the pause panel.
//
// Tested the way the death was: draw the same state twice at the two extremes of alpha
// and diff the buffers. Anything that moves with alpha shows up as a pixel difference.
{
  const { Game, STATE: GS } = await import('../src/game/game.js');
  const { AutoInput, AutoPlayer } = await import('../src/game/autoplay.js');
  const { Renderer } = await import('../src/render/renderer.js');
  const { STEP } = await import('../src/core/loop.js');
  const { HeadlessCanvas } = await import('./headless.mjs');
  const C3 = await import('../src/game/constants.js');

  const input = new AutoInput();
  const game = new Game(input);
  const bot = new AutoPlayer(input);
  game.newRun(0x2f6f1b21);
  // Somewhere mid-stride, so the two stored positions are genuinely different.
  for (let i = 0; i < 4000; i++) { bot.step(game, STEP); game.step(STEP); }
  const moving = Math.abs(game.player.x - game.player.px) + Math.abs(game.player.y - game.player.py);
  game.state = GS.PAUSED;

  const shot = (alpha) => {
    const canvas = new HeadlessCanvas(C3.SW, C3.SH);
    const r = new Renderer(canvas);
    r.applySettings({ scaleMode: 'integer', scanlines: false, particles: 'off',
      streaks: false, shake: false, trails: false, showFps: false, music: false });
    r.draw(game, alpha, 0.016);
    return canvas.getContext('2d').getImageData(0, 0, C3.SW, C3.SH).data;
  };
  const a = shot(0), b = shot(1);
  let diff = 0;
  for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1]) diff++;

  if (moving < 0.01) {
    fail('the pause test froze a player who was not moving -- it proves nothing');
  } else if (diff) {
    fail(`paused, alpha 0 and alpha 1 differ in ${diff} pixels -- the scene still moves`);
  } else {
    console.log(`  ok   paused frame identical at alpha 0 and alpha 1 ` +
      `(player was mid-stride, ${moving.toFixed(2)} units of travel stored)`);
  }
}


console.log(`\n  ${bad} problems`);
process.exit(bad ? 1 : 0);
