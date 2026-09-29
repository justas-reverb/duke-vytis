// The game's words: the height callouts, their prestige badge, and the floaters.
//
//   node tools/test-callouts.mjs
//
// WHAT IT HOLDS THEM TO (src/render/callouts.js, the painters in src/render/calloutpaint/,
// the word drawn by the shout block of src/ui/hud.js, the badge by Renderer.draw after the
// characters, the floaters by Renderer.drawFloaters)
//
// The seven callouts were the combo's -- one per multiplier step, 50 to 350 floors of a chain
// -- until the player moved them onto the tower: seven heights to a lap of the zones
// (game/milestones.js, tested in tools/test-milestones.mjs), and from the second lap a badge
// beside the word, x2, x3 ... This suite used to drive them with a flawless chain from the
// ground; it drives them by height now.
//
//   1. EVERY WORD    every callout in MILESTONES (game/milestones.js) has a painter of its
//                    own, and nothing else does. A word without one falls back to the plain
//                    font, silently -- it would only ever look like the old shout.
//   2. AHEAD         the title screen first: the renderer's floater pass alone, no HUD, as
//                    the attract run draws it, must finish the whole warm-up -- every ink,
//                    all seven callouts and the second lap's badge -- within TITLE_FRAMES
//                    frames, so a run started from it paints nothing. Then a real run: the
//                    attract bot from the ground, its chain made unbreakable (as
//                    tools/shot-trail.mjs forces one) so it climbs fast, the rising floor held
//                    off, through a whole lap to the second lap's SWIFT -- from a COLD start,
//                    the worst case. The HUD, the floater pass and the badge are drawn every
//                    fourth step (60 frames a second against the 240 Hz simulation, the fewest
//                    frames the warm-up gets). Every callout fires once, in order, at its
//                    height (or when the zone title in front of it has gone); each is a canvas
//                    before it fires, the badge too; and nothing is painted in the frame that
//                    needed it (calloutStats: calloutLate, inkLate, badgeLate). A settled
//                    callout and a settled badge cost ONE drawImage each and no painting, and
//                    nothing any of them paints touches its canvas's edge.
//   3. LEGIBLE       each settled callout over every zone's backdrop (the sky and its three
//                    layers, drawn by the game's Backdrop, at four camera heights across the
//                    zone), at the place the HUD draws it. The letters are the callout's
//                    opaque pixels brighter than its outline and shadow (relative luminance
//                    0.03, as test-zonetitles picks them), read in the frame itself; WCAG's
//                    contrast ratio of their mean against the backdrop's median across their
//                    box must be LETTER_FLOOR or better; and the letters proper (the
//                    painter's own mask, not its flames, streaks, rays or bolts, which are
//                    light and carry no keyline by design) must hold EDGE_FLOOR against the
//                    brightest tenth of the two pixels round them -- the keyline, or
//                    whatever shows through it. The same letters given the
//                    backdrop's own tones must fail, to prove the measure reads the callout.
//                    The badge's gold digits the same way, beside THUNDER, x12.
//                    Every step's floater ink too, over every zone, letters against the
//                    brightest tenth of their keyline ring (EDGE_FLOOR), and with the
//                    keyline stripped out the same measure must fail.
//   4. STEP COLOUR   the floaters are coloured by the combo step they are thrown at: a wall
//                    bounce, a double and a triple jump and a held-jump CHASE fired through
//                    the game's own event handler, and a chain banked through scoreCombo, at
//                    a chain on every step from none to past GLORY, each floater carries
//                    stepFor(its chain), and drawn through Renderer.drawFloaters its letters
//                    are that step's ink. Every step's letters differ from every other's by
//                    at least STEP_DE in CIELAB (the mean letter colour), so the chain's heat
//                    reads from the text alone.
//   5. PLACE         a callout and a zone title are never on screen in the same frame of the
//                    run (they take turns: Game.showNext), and even so no callout pixel, badge
//                    included, reaches the highest pixel of any zone title. The word is drawn
//                    in the HUD pass, under the characters, so it can never hide the Duke, and
//                    the time its footprint overlaps him, over his real positions in the run
//                    of 2, is no longer than the old shout's -- the plain-font word at scale 3
//                    then 2, rising from row 96 to 84 -- at each firing, on average and at
//                    worst. The BADGE is drawn over everything: renderer.js calls it after the
//                    Duke, the companions, their calls and the floaters (read off the source),
//                    and in a real frame with the Duke, a floater and a burst of confetti laid
//                    over it every one of its pixels shows; no HUD ink and no companion call
//                    box lies in its footprint; and with CRUSADE or THUNDER, the longest words,
//                    at any lap up to 99 every frame of it stays inside the shaft at every rest
//                    zoom and above the banner stack. How long it covers the Duke is printed.
//   6. BY LAP        lap 1 draws no badge; lap 2 draws the x2 canvas, lap 3 the x3, lap 12 the
//                    x12; and once the fire has him it fades out with the HUD over HUD_OUT.
//   7. NO PIXELS     placing and drawing every word's badge reads nothing off a canvas's
//                    pixels: only the headless canvas has a `data` array, and the first
//                    placement once read it and threw in a browser (see the section).
//
// Everything is seeded (Math.random for the run), so a failure reproduces.

import { installDom, HeadlessCanvas } from './headless.mjs';

installDom();

const fs = await import('node:fs');
const { mulberry32 } = await import('../src/core/rng.js');
const { Game, STATE } = await import('../src/game/game.js');
const { AutoInput, AutoPlayer, DEMO_SEEDS } = await import('../src/game/autoplay.js');
const { STEP } = await import('../src/core/loop.js');
const C = await import('../src/game/constants.js');
const { drawHud } = await import('../src/ui/hud.js');
const Stats = await import('../src/game/stats.js');
const CO = await import('../src/render/callouts.js');
const { CALLOUT_PAINTERS } = await import('../src/render/calloutpaint/index.js');
const { STEP_BANDS } = await import('../src/render/calloutpaint/kit.js');
const { MILESTONES, calloutFloor } = await import('../src/game/milestones.js');
const { stepFor } = await import('../src/render/sparks.js');
const { THEMES, themeIndexFor, CYCLE_FLOORS } = await import('../src/game/themes.js');
const { Renderer } = await import('../src/render/renderer.js');
const { textWidth, GLYPHS } = await import('../src/render/font.js');

const PX = C.PX, SW = C.SW, SH = C.SH, VW = C.VW;

let fails = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) fails++; return cond; };

/** The measured floors. [WCAG ratio] Letters' mean against the backdrop's median. */
const LETTER_FLOOR = 3;
/** Letters' median against the brightest tenth of the two pixels round them. [WCAG ratio] */
const EDGE_FLOOR = 4.5;
/** The least CIELAB distance between two steps' mean floater letter colours. [dE; ~32 today] */
const STEP_DE = 25;
/** Lighter than this is letter, darker is outline and shadow. [relative luminance] */
const INK_MIN = 0.03;

const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lumOf = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const lum = (d, i) => lumOf(d[i], d[i + 1], d[i + 2]);
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const pct = (arr, q) => { const s = Float64Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
function lab(r, g, b) {
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// --- 1. every callout has a painter ------------------------------------------------------
// Asked of the registry only: nothing is painted before the run, or the run could not see a
// late build.
{
  const names = MILESTONES.map((m) => m.name);
  const missing = names.filter((n) => !CALLOUT_PAINTERS[n] || typeof CALLOUT_PAINTERS[n].paint !== 'function');
  const extra = Object.keys(CALLOUT_PAINTERS).filter((n) => !names.includes(n));
  ok(!missing.length && !extra.length, `every callout has a painter of its own (${names.join(', ')})` +
    (missing.length ? `; missing: ${missing.join(', ')}` : '') + (extra.length ? `; painters for no callout: ${extra.join(', ')}` : ''));
}

// --- 2. a real run, a lap and a bit --------------------------------------------------------

/** The old shout's box at `age`, in backing px [x0, y0, x1, y1): hud.js before the lettering. */
function oldShoutBox(name, age) {
  const scale = age < 0.14 ? 3 : 2;
  const y = 96 - Math.round(Math.min(12, age * 30));
  const w = textWidth(name, scale);
  const x0 = Math.round(VW / 2 - w / 2);
  return [(x0 - 2) * PX, (y - 2) * PX, (x0 + w + 2) * PX, (y + 7 * scale + 2) * PX];
}
const oldAlpha = (life) => Math.min(1, life / 0.4);
const newAlpha = (life) => CO.calloutAlpha(life);

const FRAME = 4;            // simulation steps per HUD frame: 60 Hz against 240 Hz
const LIFE = C.CALLOUT_LIFE;
/**
 * Frames of the title screen by which the whole warm-up must be done. [frames; 115 today:
 * one idle, 17 inks, 71 pieces of the seven callouts, 13 of the second lap's badge, 13 of the
 * third's, one a frame; 140 is 0.875 s at 160 Hz]
 */
const TITLE_FRAMES = 140;

// The title screen: the attract run, drawn by the renderer with no HUD at all. The whole
// warm-up is driven from its floater pass, so it must finish here.
{
  CO.resetCallouts();
  const ctx = new HeadlessCanvas(1, 1).getContext('2d');
  const menu = { zoom: 1, camY: 0, floaters: [] };
  let ready = -1, words = -1, x2 = -1;
  for (let f = 1; f <= 1000 && ready < 0; f++) {
    Renderer.prototype.drawFloaters.call({ cam: menu.camY }, ctx, menu);
    if (words < 0 && MILESTONES.every((m) => CO.calloutReady(m.name))) words = f;
    if (x2 < 0 && CO.badgeReady(2)) x2 = f;
    if (words > 0 && x2 > 0 && CO.badgeReady(3)) ready = f;
  }
  const st = CO.calloutStats();
  ok(ready > 0 && ready <= TITLE_FRAMES && st.calloutLate === 0 && st.inkLate === 0 && st.badgeLate === 0,
    `the title screen alone, no HUD drawn, warms every ink (${st.inks}), all seven callouts (by frame ${words}) ` +
    `and the badges of laps 2 and 3 (x2 by frame ${x2}) in ${ready < 0 ? 'more than 1000' : `${ready} frames (${(ready / 160).toFixed(2)} s at 160 Hz)`}, ` +
    `at most ${TITLE_FRAMES}, so a run started from it paints nothing`);
}

let run = null;
{
  // From cold: a run begun before the title screen had its frames.
  CO.resetCallouts();
  Math.random = mulberry32(4242);
  // A 1 x 1 canvas: every line of the HUD and the floater pass runs and almost nothing is
  // filled. No Renderer is constructed on it, so nothing resizes it under its context.
  const ctx = new HeadlessCanvas(1, 1).getContext('2d');
  const input = new AutoInput();
  const game = new Game(input);
  const bot = new AutoPlayer(input);
  // A demo seed's tower, with the callouts on: attract mode shouts none (the title screen
  // draws no HUD). Since 2026-09-29 `demo` builds no tower of its own and slows no floor --
  // the demo plays the real tower -- so this is a player's tower at newRun's defaults.
  game.demo = true;
  game.newRun(DEMO_SEEDS[0]);
  game.demo = false;
  // The chain that does not break (shot-trail.mjs's forceCombo, from the ground): it keeps
  // the bot at full speed, a hard, fast climb.
  const c = game.combo;
  const land = c.onLand.bind(c);
  c.onLand = (gain) => land(Math.max(gain, 2));
  c.onGrounded = () => null;
  const all = Stats.BLANK_ALL();
  const fired = [];
  const readyAt = {};
  const dukes = [];            // the Duke's box per HUD frame, backing px
  let frames = 0, lastShoutT = 0, together = 0, n = 0, badgeDrawn = 0;
  const crossed = [];
  const until = calloutFloor(MILESTONES.length);   // the second lap's SWIFT
  for (let i = 0; i < 240 * 400 && game.state === STATE.PLAYING; i++) {
    game.riseY = Math.min(game.riseY, game.player.y - 300);   // the floor never catches this run
    bot.step(game, STEP);
    game.step(STEP);
    while (game.run.maxFloor >= calloutFloor(n)) crossed[n++] = { step: i, floor: game.run.maxFloor, title: game.titleOnScreen };
    if (game.shout && game.shoutT > lastShoutT + 1e-9) {
      // A callout fired in this step: is its callout a canvas already, and its badge?
      fired.push({ name: game.shout, lap: game.shoutLap, step: i, frame: frames, floor: game.run.maxFloor,
        ready: CO.calloutReady(game.shout), badge: game.shoutLap < 2 || CO.badgeReady(game.shoutLap) });
    }
    lastShoutT = game.shoutT;
    if (i % FRAME === FRAME - 1) {
      ctx.setTransform(PX, 0, 0, PX, 0, 0);
      drawHud(ctx, game, all, i * STEP);
      // drawFloaters reads the renderer's interpolated camera (this.cam) since the fall's
      // camera was interpolated (87ae59d); a stand-in with the game's own camera is what the
      // renderer holds between steps. It was called on null, and threw at the first frame.
      Renderer.prototype.drawFloaters.call({ cam: game.camY }, ctx, game);
      if (CO.drawCalloutBadge(ctx, game)) badgeDrawn++;
      frames++;
      if (game.calloutOnScreen && game.titleOnScreen) together++;
      for (const m of MILESTONES) if (readyAt[m.name] === undefined && CO.calloutReady(m.name)) readyAt[m.name] = frames;
      if (readyAt.x2 === undefined && CO.badgeReady(2)) readyAt.x2 = frames;
      const z = game.zoomView || game.zoom, p = game.player;
      const k = z * PX, viewLeft = C.CX - C.VW / z / 2;
      const sx = (p.x - viewLeft) * k, sy = SH - (p.y - game.camY) * k;
      // His drawn figure, not the atlas cell (252 x 212 art px, with room for the sword's
      // swing): about 26 x 36 world units standing on his feet.
      dukes.push([sx - 13 * k, sy - 36 * k, sx + 13 * k, sy]);
    }
    if (game.run.maxFloor >= until && fired.length > MILESTONES.length && fired[fired.length - 1].step < i - 240 * 2) break;
  }
  run = { fired, crossed, readyAt, frames, dukes, together, badgeDrawn, stats: CO.calloutStats(), floor: game.run.maxFloor };
}
{
  const { fired, crossed, readyAt, stats } = run;
  const want = [...MILESTONES.map((m) => `${m.name}x1`), `${MILESTONES[0].name}x2`];
  const names = fired.map((f) => `${f.name}x${f.lap}`);
  ok(names.join() === want.join(), `a hard climb from the ground fired every callout once, in order, and the second lap's ` +
    `first with its badge, by floor ${run.floor}: ` + fired.map((f) => `${f.name}x${f.lap} at floor ${f.floor}`).join(', ') +
    (names.join() !== want.join() ? `; wanted ${want.join(', ')}` : ''));
  // At its height: fired in the step its floor was crossed, or later only because a zone
  // title was up then (Game.showNext) -- RAMPAGE stands ten floors past a zone change, SWIFT
  // thirty, and at this pace both can meet the title still on screen.
  const lateOnes = fired.map((f, i) => [f, crossed[i]]).filter(([f, c]) => c && f.step !== c.step);
  const late = lateOnes.map(([f, c]) => `${f.name}x${f.lap} ${((f.step - c.step) * STEP).toFixed(2)} s after floor ${c.floor}`);
  const wrong = fired.filter((f, i) => !crossed[i] || f.step < crossed[i].step || crossed[i].floor < calloutFloor(i));
  ok(!wrong.length && lateOnes.every(([, c]) => c.title),
    `each fired on the landing that reached its height, ${MILESTONES.map((m) => m.x).join(', ')} and ${calloutFloor(MILESTONES.length)} -- ` +
    `late only for a zone title in front of it (${late.join('; ') || 'none'})`);
  const unready = fired.filter((f) => !f.ready || !f.badge);
  const margins = fired.map((f) => f.frame - (readyAt[f.name] ?? Infinity));
  ok(!unready.length, `every callout was a canvas before it fired, and the second lap's badge before its first` +
    (unready.length ? `; not: ${unready.map((f) => `${f.name}x${f.lap}`).join(', ')}` : '') +
    ` (the tightest ${Math.min(...margins)} HUD frames ahead; all seven ready by frame ${Math.max(...MILESTONES.map((m) => readyAt[m.name]))}, x2 by ${readyAt.x2})`);
  ok(stats.calloutLate === 0 && stats.inkLate === 0 && stats.badgeLate === 0 && run.badgeDrawn > 0,
    `nothing painted in the frame that needed it over ${run.frames} HUD frames ` +
    `(late callouts ${stats.calloutLate}, late floater inks ${stats.inkLate}, late badges ${stats.badgeLate}; ` +
    `${stats.inks} inks warmed; the badge drawn in ${run.badgeDrawn} frames)`);
  const heavy = Math.max(...stats.pieces), inkMax = Math.max(...stats.inkMs), bMax = Math.max(...stats.badgePieces);
  console.log(`       warm-up: ${stats.pieces.length} callout pieces, the heaviest ${heavy.toFixed(1)} ms headless; ` +
    `${stats.inkMs.length} inks, the heaviest ${inkMax.toFixed(1)} ms; ${stats.badgePieces.length} badge pieces ` +
    `(${stats.badges.map((b) => 'x' + b).join(', ')}), the heaviest ${bMax.toFixed(1)} ms`);

  // Settled, a callout is one drawImage of its canvas, and so is its badge.
  const tiny = new HeadlessCanvas(1, 1).getContext('2d');
  const bad = [];
  const settledAge = (e) => {
    const seqT = e.seq.reduce((s, q) => s + q[1], 0);
    let age = seqT + 0.01;
    for (const [, , t1] of e.over) if (t1 < LIFE - 0.4) age = Math.max(age, t1 + 0.01);
    if (e.sweep) age = Math.max(age, e.sweep.from + e.sweep.dur + 0.01);
    return age;
  };
  const count = (e, draw) => {
    let blits = 0, other = 0;
    const di = tiny.drawImage, fr = tiny.fillRect;
    tiny.drawImage = function (img) { if (e.frames.some((f) => f.c === img)) blits++; else other++; };
    tiny.fillRect = function () { other++; };
    draw();
    tiny.drawImage = di; tiny.fillRect = fr;
    return [blits, other];
  };
  for (const m of MILESTONES) {
    const e = CO.calloutEntry(m.name);
    const age = settledAge(e);
    const [blits, other] = count(e, () => CO.drawCallout(tiny, m.name, age, LIFE - age));
    if (blits !== 1 || other) bad.push(`${m.name} settled costs ${blits} blits and ${other} other calls`);
    const b = CO.badgeEntry(2);
    const bAge = CO.badgeAt(m.name, 2).after + settledAge(b);
    const view = { shout: m.name, shoutLap: 2, shoutT: LIFE - bAge, state: 'playing' };
    const [bb, bo] = count(b, () => CO.drawCalloutBadge(tiny, view));
    if (bb !== 1 || bo) bad.push(`${m.name}'s badge settled costs ${bb} blits and ${bo} other calls`);
  }
  ok(!bad.length, `a settled callout is drawn with one drawImage, and its badge with one more` + (bad.length ? `: ${bad.join('; ')}` : ''));

  // Nothing painted into a frame's outermost row or column: whatever reaches its canvas's
  // edge is cut flat there. THUNDER's bolts ran up to the top row (every one starting on the
  // same ruled line) and out through the left edge, and RAMPAGE's tallest flame's halo
  // touched the top row.
  const cut = [];
  const edges = (label, e) => e.frames.forEach((F, k) => {
    let n = 0;
    const d = F.c.data;
    for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) {
      if ((x === 0 || y === 0 || x === F.w - 1 || y === F.h - 1) && d[(y * F.w + x) * 4 + 3]) n++;
    }
    if (n) cut.push(`${label} frame ${k}: ${n} px`);
  });
  for (const m of MILESTONES) edges(m.name, CO.calloutEntry(m.name));
  for (const L of [2, 12, 99]) edges('x' + L, CO.badge(L));
  ok(!cut.length, `no callout or badge frame (x2, x12, x99) is cut by its canvas: nothing on its edge rows or columns` + (cut.length ? `; ${cut.join(', ')}` : ''));
}

// --- 3. legible over every zone ---------------------------------------------------------------
const { Backdrop } = await import('../src/render/backdrop.js');
const ARRIVE = {};
for (let f = 1; f < 2 * CYCLE_FLOORS; f++) {
  const n = THEMES[themeIndexFor(f)].name;
  if (themeIndexFor(f) !== themeIndexFor(f - 1) && !(n in ARRIVE)) ARRIVE[n] = f;
}
ARRIVE[THEMES[0].name] = 0;

/** Where a settled callout's frame 0 lands, in backing px. */
function settledAt(name) {
  const e = CO.calloutEntry(name), F = e.frames[0];
  return { e, F, X0: Math.round(VW / 2 * PX) - F.ax, Y0: CO.CALLOUT_TOP * PX - F.ay };
}

/** The ring of pixels within `r` of a set of pixels, not in it: [index]. */
function ringOf(set, r) {
  const ring = new Set();
  for (const k of set) {
    const x = k % SW, y = (k / SW) | 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const X = x + dx, Y = y + dy;
      if (X < 0 || Y < 0 || X >= SW || Y >= SH) continue;
      const j = Y * SW + X;
      if (!set.has(j)) ring.add(j);
    }
  }
  return [...ring];
}

{
  const canvas = new HeadlessCanvas(SW, SH);
  const g = canvas.getContext('2d');
  const backdrop = new Backdrop();
  // The letters of each settled callout: its opaque pixels lighter than its outline.
  const letters = {};
  for (const m of MILESTONES) {
    const { F, X0, Y0 } = settledAt(m.name);
    const set = new Set(), d = F.c.data;
    let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
    for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) {
      const s = (y * F.w + x) * 4;
      if (d[s + 3] < 255 || lumOf(d[s], d[s + 1], d[s + 2]) < INK_MIN) continue;
      const X = X0 + x, Y = Y0 + y;
      set.add(Y * SW + X);
      x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y);
    }
    // For the edge, the letters proper -- the painter's own mask, without the flames,
    // streaks, rays and bolts, which are light and carry no keyline by design.
    const own = new Set();
    for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) {
      if (F.letters ? F.letters[y * F.w + x] : d[(y * F.w + x) * 4 + 3] === 255) own.add((Y0 + y) * SW + X0 + x);
    }
    letters[m.name] = { set, own, box: [x0, y0, x1, y1], ring: ringOf(own, 2) };
  }
  const rows = [];
  let ghostWorst = 0;
  const inkRows = [];
  const bands = STEP_BANDS.length;
  for (const th of THEMES) {
    const zi = THEMES.indexOf(th);
    const res = {};
    for (const floor of [2, 30, 60, 90].map((k) => ARRIVE[th.name] + k)) {
      const camY = floor * C.FLOOR_H - C.VH * C.CAM_ANCHOR;
      g.setTransform(PX, 0, 0, PX, 0, 0);
      backdrop.draw(g, camY, zi, th, th, 0);
      const px = canvas.data, bare = px.slice();
      for (const m of MILESTONES) {
        px.set(bare);
        const { e } = settledAt(m.name);
        g.setTransform(PX, 0, 0, PX, 0, 0);
        const seqT = e.seq.reduce((s, q) => s + q[1], 0);
        let age = Math.max(seqT + 0.01, e.sweep ? e.sweep.from + e.sweep.dur + 0.01 : 0);
        for (const [, , t1] of e.over) if (t1 < 1) age = Math.max(age, t1 + 0.01);
        CO.drawCallout(g, m.name, age, LIFE - age);
        const L = letters[m.name];
        let sum = 0, ghost = 0;
        const body = [];
        for (const k of L.set) { sum += lum(px, k * 4); ghost += lum(bare, k * 4); }
        for (const k of L.own) body.push(lum(px, k * 4));
        const bg = [];
        for (let y = L.box[1]; y <= L.box[3]; y += 2) for (let x = L.box[0]; x <= L.box[2]; x += 2) bg.push(lum(bare, (y * SW + x) * 4));
        const med = pct(bg, 0.5);
        const ratio = contrast(sum / L.set.size, med);
        const edge = contrast(pct(body, 0.5), pct(L.ring.map((k) => lum(px, k * 4)), 0.9));
        ghostWorst = Math.max(ghostWorst, contrast(ghost / L.set.size, med));
        const r = res[m.name] || (res[m.name] = { ratio: Infinity, edge: Infinity });
        r.ratio = Math.min(r.ratio, ratio); r.edge = Math.min(r.edge, edge);
      }
      // The floater inks at this height: each step's BOUNCE, keyline and all, over the
      // backdrop at the callout's own row, and once more with the keyline taken away.
      if (floor === ARRIVE[th.name] + 30) {
        for (let s = 0; s < bands; s++) {
          px.set(bare);
          g.setTransform(PX, 0, 0, PX, 0, 0);
          CO.drawComboText(g, 'BOUNCE', s, VW / 2, 90, 2, 0);
          const w = CO.comboTextWidth('BOUNCE', 2);
          const X0 = Math.round(VW / 2 * PX - w / 2) + 2, Y0 = 90 * PX;
          const set = new Set();
          for (let y = Y0; y < Y0 + 14; y++) for (let x = X0; x < X0 + w - 4; x++) {
            // The letter pixels: where the font has a pixel of BOUNCE, two by two.
            const i = x - X0, ci = Math.floor(i / 12), cx = Math.floor((i % 12) / 2), ry = Math.floor((y - Y0) / 2);
            if (cx < 5 && GLYPHS['BOUNCE'[ci]][ry][cx] === '#') set.add(y * SW + x);
          }
          const body = [...set].map((k) => lum(px, k * 4));
          const ring = ringOf(set, 2);
          const edge = contrast(pct(body, 0.5), pct(ring.map((k) => lum(px, k * 4)), 0.9));
          // Stripped: the same letter pixels pasted on the bare backdrop, no keyline.
          const bareEdge = contrast(pct(body, 0.5), pct(ring.map((k) => lum(bare, k * 4)), 0.9));
          inkRows.push({ zone: th.name, step: s, edge });
          if (bareEdge < EDGE_FLOOR) inkRows[inkRows.length - 1].bareFails = true;
        }
      }
    }
    for (const [n, r] of Object.entries(res)) rows.push({ zone: th.name, name: n, ...r });
  }
  const worstR = rows.reduce((m, r) => (r.ratio < m.ratio ? r : m));
  const worstE = rows.reduce((m, r) => (r.edge < m.edge ? r : m));
  const lowR = rows.filter((r) => !(r.ratio >= LETTER_FLOOR));
  const lowE = rows.filter((r) => !(r.edge >= EDGE_FLOOR));
  ok(!lowR.length, `every callout's letters stand ${LETTER_FLOOR}:1 off every zone's backdrop, at four heights each ` +
    `(weakest ${worstR.name} over ${worstR.zone} ${worstR.ratio.toFixed(1)}:1)` +
    (lowR.length ? `; ${lowR.length} do not: ${lowR.slice(0, 5).map((r) => `${r.name}/${r.zone} ${r.ratio.toFixed(1)}`).join(', ')}` : ''));
  ok(!lowE.length, `and ${EDGE_FLOOR}:1 off the brightest tenth of the two pixels round them ` +
    `(weakest ${worstE.name} over ${worstE.zone} ${worstE.edge.toFixed(1)}:1)` +
    (lowE.length ? `; ${lowE.length} do not: ${lowE.slice(0, 5).map((r) => `${r.name}/${r.zone} ${r.edge.toFixed(1)}`).join(', ')}` : ''));
  ok(ghostWorst < LETTER_FLOOR, `the measure fails the same letters in their backdrop's own tones (at most ${ghostWorst.toFixed(2)}:1)`);
  const lowI = inkRows.filter((r) => !(r.edge >= EDGE_FLOOR));
  const wi = inkRows.reduce((m, r) => (r.edge < m.edge ? r : m));
  ok(!lowI.length, `every step's floater ink holds ${EDGE_FLOOR}:1 off its keyline ring in every zone ` +
    `(${inkRows.length} inks; weakest step ${wi.step} in ${wi.zone} ${wi.edge.toFixed(1)}:1)` +
    (lowI.length ? `; ${lowI.slice(0, 5).map((r) => `step ${r.step}/${r.zone} ${r.edge.toFixed(1)}`).join(', ')}` : ''));
  const bareFail = inkRows.filter((r) => r.bareFails).length;
  ok(bareFail > 0, `and without the keyline the same measure fails ${bareFail} of them (it reads the keyline)`);
}

// The badge's gold digits, beside THUNDER at lap 12, over every zone at four heights: the same
// two measures as the words', and the same digits in the backdrop's own tones must fail.
{
  const canvas = new HeadlessCanvas(SW, SH);
  const g = canvas.getContext('2d');
  const backdrop = new Backdrop();
  const b = CO.badge(12), F = b.frames[0];
  const at = CO.badgeAt('THUNDER', 12);
  const bAge = at.after + b.sweep.from + b.sweep.dur + 0.01;
  const X0 = at.X - F.ax, Y0 = at.Y - F.ay;
  const digits = new Set();
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) {
    if (!F.letters[y * F.w + x]) continue;
    const X = X0 + x, Y = Y0 + y;
    digits.add(Y * SW + X);
    x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y);
  }
  const ring = ringOf(digits, 2);
  let worstR = { r: Infinity }, worstE = { r: Infinity }, ghost = 0;
  for (const th of THEMES) {
    const zi = THEMES.indexOf(th);
    for (const floor of [2, 30, 60, 90].map((k) => ARRIVE[th.name] + k)) {
      const camY = floor * C.FLOOR_H - C.VH * C.CAM_ANCHOR;
      g.setTransform(PX, 0, 0, PX, 0, 0);
      backdrop.draw(g, camY, zi, th, th, 0);
      const px = canvas.data, bare = px.slice();
      g.setTransform(PX, 0, 0, PX, 0, 0);
      CO.drawCalloutBadge(g, { shout: 'THUNDER', shoutLap: 12, shoutT: LIFE - bAge, state: 'playing' });
      let sum = 0, gsum = 0;
      const body = [];
      for (const k of digits) { const l = lum(px, k * 4); sum += l; body.push(l); gsum += lum(bare, k * 4); }
      const bg = [];
      for (let y = y0; y <= y1; y += 2) for (let x = x0; x <= x1; x += 2) bg.push(lum(bare, (y * SW + x) * 4));
      const med = pct(bg, 0.5);
      const r = contrast(sum / digits.size, med);
      const e = contrast(pct(body, 0.5), pct(ring.map((k) => lum(px, k * 4)), 0.9));
      ghost = Math.max(ghost, contrast(gsum / digits.size, med));
      if (r < worstR.r) worstR = { r, zone: th.name };
      if (e < worstE.r) worstE = { r: e, zone: th.name };
    }
  }
  ok(worstR.r >= LETTER_FLOOR && worstE.r >= EDGE_FLOOR && ghost < LETTER_FLOOR,
    `the badge's gold digits stand ${worstR.r.toFixed(1)}:1 off the backdrop at worst (${worstR.zone}) and ` +
    `${worstE.r.toFixed(1)}:1 off the enamel round them (${worstE.zone}), where the same digits in the backdrop's own tones ` +
    `reach ${ghost.toFixed(2)}:1`);
}

// --- 4. the floaters take the combo step's colour ---------------------------------------------
{
  // A chain on every step: none, a chain short of SWIFT, then ten floors into each step.
  const floorsFor = (s) => (s === 0 ? 0 : s === 1 ? 20 : (s - 1) * 50 + 10);
  const steps = STEP_BANDS.length;
  const badStep = [];
  for (let s = 0; s < steps; s++) if (stepFor(floorsFor(s)) !== s) badStep.push(`${floorsFor(s)} floors is step ${stepFor(floorsFor(s))}, not ${s}`);
  Math.random = mulberry32(9);
  const game = new Game(new AutoInput());
  game.newRun(7);
  const p = game.player;
  const wrong = [];
  let fired = 0;
  const events = [
    ['a wall bounce', () => p.emit('wallbounce', { dir: 1, speed: 300, boost: 0 })],
    ['a big wall bounce', () => p.emit('wallbounce', { dir: 1, speed: 300, boost: 0.9 })],
    ['a double jump', () => p.emit('airjump', { air: 1 })],
    ['a triple jump', () => p.emit('airjump', { air: 2 })],
    ['a held-jump chase', () => p.emit('jump', { insta: true, chain: 3, power: 1 })],
  ];
  for (let s = 0; s < steps; s++) {
    const F = floorsFor(s);
    for (const [what, fire] of events) {
      game.combo.softReset();
      if (F) { game.combo.active = true; game.combo.floors = F; }
      game.floaters.length = 0;
      fire();
      game.handleEvents();
      const f = game.floaters[game.floaters.length - 1];
      fired++;
      if (!f || f.colour !== s) wrong.push(`${what} on a ${F}-floor chain: ${f ? `colour ${f.colour}` : 'no floater'}, want step ${s}`);
    }
    // A chain banked: its payout in the colour of the step the chain reached.
    game.floaters.length = 0;
    const banked = Math.max(F, 3);
    game.scoreCombo({ floors: banked, flair: 0, doubles: 0, triples: 0, bounces: 0, chains: 0, hops: 1,
      peakX: 1, tier: null, score: 1234 });
    const f = game.floaters[game.floaters.length - 1];
    fired++;
    if (!f || f.colour !== stepFor(banked)) wrong.push(`a banked ${banked}-floor chain: ${f ? `colour ${f.colour}` : 'no floater'}, want step ${stepFor(banked)}`);
  }
  ok(!badStep.length && !wrong.length, `every floater carries the step of its chain (${fired} floaters, steps 0 to ${steps - 1})` +
    (badStep.length ? `; ${badStep.join(', ')}` : '') + (wrong.length ? `; ${wrong.length} wrong: ${wrong.slice(0, 4).join('; ')}` : ''));

  // Drawn through the renderer's own floater pass, one BOUNCE per step on black: its letters
  // must be exactly the colours of that step's ink, and each step's must differ from every
  // other's.
  const cv = new HeadlessCanvas(SW, SH);
  const g = cv.getContext('2d');
  const viewLeft = C.CX - C.VW / 2 / game.zoom;
  const means = [];
  const notInk = [];
  for (let s = 0; s < steps; s++) {
    cv.data.fill(0);
    g.setTransform(PX, 0, 0, PX, 0, 0);
    game.floaters = [{ text: 'BOUNCE', x: viewLeft + VW / 2 / game.zoom, y: game.camY + (C.VH - 100) / game.zoom,
      vy: 0, life: 0.8, maxLife: 1.1, colour: s, scale: 1 }];
    Renderer.prototype.drawFloaters.call({ cam: game.camY }, g, game);
    // The ink it should be: every colour its letters can take, from the ink itself.
    const keys = s === steps - 1 ? [...Array(6)].map((_, i) => CO.inkKey(s, i, 0.3)) : [CO.inkKey(s)];
    const palette = new Set();
    for (const k of keys) {
      const ink = CO.paintInk(k);
      for (let i = 0; i < ink.w * 18; i++) if (ink.data[i * 4 + 3]) palette.add((ink.data[i * 4] << 16) | (ink.data[i * 4 + 1] << 8) | ink.data[i * 4 + 2]);
    }
    const w = CO.comboTextWidth('BOUNCE', 2);
    const X0 = Math.round(VW / 2 * PX - w / 2) + 2, Y0 = 100 * PX;
    const L = [0, 0, 0];
    let n = 0, foreign = 0;
    for (let y = Y0; y < Y0 + 14; y++) for (let x = X0; x < X0 + w - 4; x++) {
      const i = x - X0, ci = Math.floor(i / 12), cx = Math.floor((i % 12) / 2), ry = Math.floor((y - Y0) / 2);
      if (cx >= 5 || GLYPHS['BOUNCE'[ci]][ry][cx] !== '#') continue;
      const d = cv.data, k = (y * SW + x) * 4;
      if (!palette.has((d[k] << 16) | (d[k + 1] << 8) | d[k + 2])) foreign++;
      const l = lab(d[k], d[k + 1], d[k + 2]);
      for (let q = 0; q < 3; q++) L[q] += l[q];
      n++;
    }
    if (!n || foreign) notInk.push(`step ${s}: ${n ? `${foreign} of ${n} letter pixels not in its ink` : 'nothing drawn'}`);
    means.push(L.map((v) => v / Math.max(1, n)));
  }
  ok(!notInk.length, `drawn by Renderer.drawFloaters, every step's BOUNCE is in that step's ink` + (notInk.length ? `: ${notInk.join('; ')}` : ''));
  let near = { d: Infinity };
  for (let a = 0; a < steps - 1; a++) for (let b = a + 1; b < steps - 1; b++) {
    const d = dE(means[a], means[b]);
    if (d < near.d) near = { d, a, b };
  }
  ok(near.d >= STEP_DE, `every step from none to GLORY is a colour of its own: the nearest two, steps ${near.a} and ${near.b}, ` +
    `are ${near.d.toFixed(1)} apart in CIELAB (at least ${STEP_DE})`);

  // Smaller: a floater's drawn height, keyline and all, in backing px, settled and in its pop.
  // The old ones were drawTextOutline at 4 and 8 backing px per font pixel with a keyline of
  // one and two view units: 7 x 4 + 2 x 4 = 36 and 7 x 8 + 2 x 8 = 72 px.
  const tall = (scale, life) => {
    cv.data.fill(0);
    g.setTransform(PX, 0, 0, PX, 0, 0);
    game.floaters = [{ text: 'BOUNCE!', x: viewLeft + VW / 2 / game.zoom, y: game.camY + (C.VH - 100) / game.zoom,
      vy: 0, life, maxLife: 1.1, colour: 2, scale }];
    Renderer.prototype.drawFloaters.call({ cam: game.camY }, g, game);
    let y0 = SH, y1 = -1;
    const d = cv.data;
    for (let y = 0; y < SH; y++) {
      for (let x = 0; x < SW; x++) if (d[(y * SW + x) * 4 + 3]) { y0 = Math.min(y0, y); y1 = y; break; }
    }
    return y1 - y0 + 1;
  };
  const hs = { small: tall(1, 0.8), big: tall(2, 0.8), smallPop: tall(1, 1.09), bigPop: tall(2, 1.09) };
  // 2 backing px per font pixel for the normal ones (18 with the keyline), 3 for the big ones
  // (25), one size up in the pop.
  ok(hs.small <= 18 && hs.big <= 25 && hs.smallPop <= 25 && hs.bigPop <= 32 && hs.small < hs.big,
    `the floaters are small: BOUNCE ${hs.small} px tall and a big one ${hs.big} (${hs.smallPop} and ${hs.bigPop} in their pop), ` +
    `where the old ones were 36 and 72`);
}

// --- 5. where it stands -----------------------------------------------------------------------
{
  const { zoneTitle } = await import('../src/render/zonetitles.js');
  ok(run.together === 0, `a callout and a zone title never shared a frame of the run (${run.together} of ${run.frames} HUD frames)`);

  // Every pixel any callout draws, at any moment of its showing: the lowest row.
  const boxOf = new Map();
  const frameBox = (F) => {
    let b = boxOf.get(F);
    if (b) return b;
    let x0 = F.w, y0 = F.h, x1 = -1, y1 = -1, low = -1, lo = F.w, hi = -1, top = F.h;
    const d = F.c.data;
    for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) {
      const a = d[(y * F.w + x) * 4 + 3];
      if (a) { low = Math.max(low, y); top = Math.min(top, y); lo = Math.min(lo, x); hi = Math.max(hi, x); }
      if (a < 128) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    b = { box: [x0, y0, x1 + 1, y1 + 1], low, all: [lo, top, hi + 1, low + 1] };
    boxOf.set(F, b);
    return b;
  };
  /** The drawImage calls of one callout, or of its badge, at `age`: [{ F, sx, sw, X, Y }] in backing px. */
  const callsAt = (name, age, lap = 0) => {
    const e = lap ? CO.badge(lap) : CO.calloutEntry(name);
    const tiny = new HeadlessCanvas(1, 1).getContext('2d');
    const out = [];
    tiny.drawImage = (img, sx, sy, sw, sh, dx, dy) => {
      // An image that is not this entry's (a wrong lap's badge) is measured all the same, so
      // the checks below see it rather than this scan falling over.
      const F = e.frames.find((f) => f.c === img) || { c: img, w: img.width, h: img.height, ax: 0, ay: 0, half: 0 };
      out.push({ F, sx, sw, X: Math.round(dx * PX) - sx, Y: Math.round(dy * PX) });
    };
    tiny.setTransform(PX, 0, 0, PX, 0, 0);
    if (lap) CO.drawCalloutBadge(tiny, { shout: name, shoutLap: lap, shoutT: LIFE - age, state: 'playing' });
    else CO.drawCallout(tiny, name, age, LIFE - age);
    return out;
  };
  const AGES = [...Array(Math.round(LIFE * 60))].map((_, k) => k / 60);
  let lowest = -1, lowName = '';
  const foot = {}, badgeFoot = {};
  // Every pixel the badge paints at any moment, for the longest words and laps 2..99.
  let bx0 = SW, by0 = SH, bx1 = -1, by1 = -1;
  for (const m of MILESTONES) {
    const span = (lap) => AGES.map((age) => {
      let bx = null;
      for (const c of callsAt(m.name, age, lap)) {
        const b = frameBox(c.F);
        if (c.Y + b.low > lowest) { lowest = c.Y + b.low; lowName = `${m.name}${lap ? ' x' + lap : ''} at ${age.toFixed(2)} s`; }
        if (lap) {
          bx0 = Math.min(bx0, c.X + Math.max(b.all[0], c.sx)); bx1 = Math.max(bx1, c.X + Math.min(b.all[2], c.sx + c.sw));
          by0 = Math.min(by0, c.Y + b.all[1]); by1 = Math.max(by1, c.Y + b.all[3]);
        }
        const x0 = Math.max(b.box[0], c.sx), x1 = Math.min(b.box[2], c.sx + c.sw);
        if (x1 <= x0) continue;
        const r = [c.X + x0, c.Y + b.box[1], c.X + x1, c.Y + b.box[3]];
        bx = bx ? [Math.min(bx[0], r[0]), Math.min(bx[1], r[1]), Math.max(bx[2], r[2]), Math.max(bx[3], r[3])] : r;
      }
      return bx;
    });
    foot[m.name] = span(0);
    badgeFoot[m.name] = span(12);
    for (const L of [2, 9, 10, 99]) span(L);
  }
  // Every zone title's highest pixel, where the HUD puts it: the top of the banner stack.
  let highest = SH, highName = '';
  for (const th of THEMES) {
    const e = zoneTitle(th);
    if (!e) continue;
    let rise = 0;
    for (const q of e.seq) rise = Math.min(rise, q[2] || 0);
    const d = e.canvas.data;
    for (let y = 0; y < e.canvas.height; y++) {
      const fy = y % e.h;
      let any = false;
      for (let x = 0; x < e.w && !any; x++) if (d[(y * e.w + x) * 4 + 3]) any = true;
      if (!any) continue;
      const Y = Math.round(150 * PX) - e.top + fy + rise;
      if (Y < highest) { highest = Y; highName = th.name; }
    }
  }
  ok(lowest < highest, `and were they ever together, no callout or badge pixel reaches a zone title: the lowest is on row ${lowest} ` +
    `(${lowName}), the highest title pixel on row ${highest} (${highName}), ${highest - lowest - 1} rows clear`);

  // Beside the word, on its line: the plaque's centre within a few rows of the same height for
  // all seven (their letters are 55 to 65 rows tall from the same top row), and its left edge
  // BADGE_GAP clear of the rightmost pixel the word paints. CRUSADE's shield above the word
  // once stood its badge half a word high.
  {
    // Read off the draw calls at every age the settled badge is up: its plaque's centre and
    // left edge from the frame drawn, against the rightmost column the word paints then.
    const ys = [];
    let tight = Infinity, tightName = '';
    const settledFrames = [0, 4].map((k) => CO.badge(2).frames[k]);
    for (const m of MILESTONES) {
      let y = null;
      for (const age of AGES) {
        const s = callsAt(m.name, age, 2).find((c) => settledFrames.includes(c.F) && c.sx === 0);
        if (!s) continue;
        const left = s.X + s.F.ax - s.F.half;
        if (y === null) y = s.Y + s.F.ay;
        let right = -1;
        for (const c of callsAt(m.name, age)) right = Math.max(right, c.X + Math.min(frameBox(c.F).all[2], c.sx + c.sw));
        if (left - right < tight) { tight = left - right; tightName = m.name; }
      }
      ys.push(y ?? -1e9);
    }
    ok(Math.max(...ys) - Math.min(...ys) <= 6 && tight >= C.BADGE_GAP,
      `each badge stands on its word's line (centres on rows ${Math.min(...ys)}..${Math.max(...ys)}), its plaque at least ` +
      `${C.BADGE_GAP} px clear of anything the word paints while it is up (the closest ${tight} px, ${tightName})`);
  }

  // Inside the shaft at every rest zoom (the walls stand WALL_W x zoom view units in from each
  // side, the most at zoom 2), and inside the screen: every word, laps 2 to 99, every frame.
  const zooms = [2, 1.75, 1.5, 1.25, 1];
  const inner = (z) => [C.WALL_W * z * PX, (VW - C.WALL_W * z) * PX];
  const outside = zooms.filter((z) => bx0 < inner(z)[0] || bx1 > inner(z)[1]);
  ok(!outside.length && by0 >= 0 && by1 <= highest,
    `the badge, beside any word at any lap to 99 (x12 and CRUSADE or THUNDER the widest), stays inside the shaft at every rest zoom: ` +
    `columns ${bx0}..${bx1 - 1}, the walls' inner edges at zoom 2 on ${inner(2)[0]} and ${inner(2)[1]}; rows ${by0}..${by1 - 1}` +
    (outside.length ? `; outside at zoom ${outside.join(', ')}` : ''));

  // The Duke: overlap time, new against old, from every HUD frame of the run as a firing.
  const inter = (a, b) => a && a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const worse = [];
  // The worst firing is one extreme of a sample the bot draws, and the bot was rebuilt on
  // 2026-09-29 (autoplay.js, round five): it climbs the real tower twice as fast, higher on the
  // screen more often. Over its runs on the five demo seeds the new word's mean stays well
  // under the old shout's (0.042-0.055 s against 0.072-0.089 for SWIFT) while SWIFT's worst came
  // out 0.01-0.04 s over the old's on four of them (0.53/0.52, 0.53/0.50, 0.72/0.69, 0.55/0.51)
  // -- the layout unchanged, the sample new. So the worst is held to within three frames of the
  // old's at 60 Hz and the mean, strictly, to under it.
  const WORST_SLACK = 3;
  const lines = [], blines = [];
  for (const m of MILESTONES) {
    let sumN = 0, sumO = 0, maxN = 0, maxO = 0, n = 0, sumB = 0, maxB = 0;
    for (let s = 0; s + AGES.length <= run.dukes.length; s += 3) {
      let cn = 0, co = 0, cb = 0;
      AGES.forEach((age, k) => {
        const duke = run.dukes[s + k];
        if (inter(foot[m.name][k], duke)) cn += newAlpha(LIFE - age);
        if (inter(oldShoutBox(m.name, age), duke)) co += oldAlpha(LIFE - age);
        if (inter(badgeFoot[m.name][k], duke)) cb += newAlpha(LIFE - age);
      });
      sumN += cn; sumO += co; sumB += cb; maxN = Math.max(maxN, cn); maxO = Math.max(maxO, co); maxB = Math.max(maxB, cb); n++;
    }
    const mn = sumN / n / 60, mo = sumO / n / 60;
    lines.push(`${m.name} ${mn.toFixed(3)}/${mo.toFixed(3)} s mean, ${(maxN / 60).toFixed(2)}/${(maxO / 60).toFixed(2)} s worst`);
    blines.push(`${m.name} ${(sumB / n / 60).toFixed(3)} s mean, ${(maxB / 60).toFixed(2)} s worst`);
    if (mn > mo + 1e-9 || maxN > maxO + WORST_SLACK) worse.push(m.name);
  }
  ok(!worse.length, `no word overlaps the Duke longer than the old shout (the worst within 3 frames), new/old per firing over ${run.dukes.length} ` +
    `HUD frames of his real positions: ${lines.join('; ')}` + (worse.length ? `; longer: ${worse.join(', ')}` : ''));
  console.log(`       the badge (x12) is drawn over him, per firing, over the same positions: ${blines.join('; ')}`);

  // Nothing covers the badge. First the draw order, read off the renderer: the badge after the
  // Duke, the companions, their calls and the floaters. (A frame diff alone cannot tell "drawn
  // last" from "never covered in the frames looked at", so both.)
  const src = fs.readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('  draw(game, alpha, dt, hud) {'));
  const at = (s) => body.indexOf(s);
  const order = ['hud();', 'this.drawCompanions(', 'this.drawPlayer(', 'game.particles.draw(', 'this.drawCompanionCalls(',
    'this.drawFloaters(', 'drawCalloutBadge(ctx, game)'].map(at);
  ok(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])),
    'renderer.js draws the badge after the HUD, the companions, the Duke, the particles, the companions\' calls and the floaters');

  // Then a real frame: the Duke stood under the badge, a floater thrown across it and a burst
  // of confetti round him, THUNDER x12 settled; every opaque pixel of the badge must show.
  const canvas = new HeadlessCanvas(SW, SH);
  const renderer = new Renderer(canvas);
  renderer.applySettings({ scaleMode: 'integer', scanlines: false, particles: 'high', streaks: false, shake: false,
    trails: false, showFps: false, music: false });
  const ctx = canvas.getContext('2d');   // after the Renderer: its constructor sizes the canvas
  Math.random = mulberry32(99);
  const game = new Game(new AutoInput());
  game.newRun(0x2f6f1b21);
  const b = CO.badge(12), F = b.frames[0];
  const pos = CO.badgeAt('THUNDER', 12);
  const bAge = pos.after + b.sweep.from + b.sweep.dur + 0.02;
  game.shout = 'THUNDER'; game.shoutLap = 12; game.shoutT = LIFE - bAge;
  const z = game.zoom, k = z * PX, viewLeft = C.CX - VW / z / 2;
  const p = game.player;
  p.x = p.px = viewLeft + pos.X / k;
  p.y = p.py = game.camY + (SH - pos.Y - 18 * k) / k;
  game.floaters = [{ text: 'BOUNCE!', x: p.x, y: p.y + 10, vy: 0, life: 0.8, maxLife: 1.1, colour: 5, scale: 2 }];
  game.particles.burst(p.x, p.y + 18, 70, ['#ffffff', '#ff0000'], 0.3);
  game.flash = 0;
  const all = Stats.BLANK_ALL();
  renderer.t = 3;
  renderer.draw(game, 1, 0, () => drawHud(ctx, game, all, 3));
  const withBadge = canvas.data.slice();
  let shown = 0, hidden = 0;
  const X0 = pos.X - F.ax, Y0 = pos.Y - F.ay, fd = F.c.data;
  for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) {
    const s = (y * F.w + x) * 4;
    if (fd[s + 3] !== 255) continue;
    const t = ((Y0 + y) * SW + X0 + x) * 4;
    if (withBadge[t] === fd[s] && withBadge[t + 1] === fd[s + 1] && withBadge[t + 2] === fd[s + 2]) shown++;
    else hidden++;
  }
  // And that the scene really does put him, the floater and the confetti there: the same frame
  // without the badge (lap 1), against the same again without them too. The pixels of the
  // badge's box that differ between those two are theirs.
  game.shoutLap = 1;
  renderer.draw(game, 1, 0, () => drawHud(ctx, game, all, 3));
  const withThem = canvas.data.slice();
  const keep = { player: renderer.drawPlayer, floaters: renderer.drawFloaters, parts: game.particles.draw };
  renderer.drawPlayer = () => {}; renderer.drawFloaters = () => {}; game.particles.draw = () => {};
  renderer.draw(game, 1, 0, () => drawHud(ctx, game, all, 3));
  renderer.drawPlayer = keep.player; renderer.drawFloaters = keep.floaters; game.particles.draw = keep.parts;
  let covering = 0;
  const cd = canvas.data;
  for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) {
    if (fd[(y * F.w + x) * 4 + 3] !== 255) continue;
    const t = ((Y0 + y) * SW + X0 + x) * 4;
    if (withThem[t] !== cd[t] || withThem[t + 1] !== cd[t + 1] || withThem[t + 2] !== cd[t + 2]) covering++;
  }
  ok(hidden === 0 && covering > 500,
    `in a real frame with the Duke, a floater and 70 confetti over its box (${covering} of its pixels would be theirs), ` +
    `all ${shown} opaque pixels of the badge show (${hidden} covered)`);

  // No HUD ink and no companion's call box in its footprint: the HUD with everything on it,
  // and two companions talking at once in three lines each, on a clear canvas.
  const hudCv = new HeadlessCanvas(SW, SH);
  const hg = hudCv.getContext('2d');
  const hot = new Game(new AutoInput());
  hot.newRun(3);
  hot.player.momentum = 1; hot.player.instaChain = 4; hot.player.grounded = false;
  hot.combo.active = true; hot.combo.floors = 1337; hot.score = 987654321; hot.run.maxFloor = 9999;
  hot.climbOn = true; hot.riseActive = true;
  hot.banners = [{ text: 'A WORD OF CHEER', colour: '#ffffff', big: false, life: 1, maxLife: 1.5 },
    { text: 'ANOTHER ONE', colour: '#ffffff', big: true, life: 1, maxLife: 1.5 }];
  const rich = Stats.BLANK_ALL(); rich.bestScore = 123456789;
  hg.setTransform(PX, 0, 0, PX, 0, 0);
  drawHud(hg, hot, rich, 0);
  hot.companions.active = [0, 1].map((i) => ({ bubble: 'ONWARD DUKE THE TOWER IS OURS AND THE SKY WILL BE OURS BEFORE THE NIGHT IS OUT FOR ALL OF LITHUANIA', bubbleT: 2, name: 'COMPANION ' + i }));
  Renderer.prototype.drawCompanionCalls.call(null, hg, hot);
  let inFoot = 0, ink = 0;
  const hd = hudCv.data;
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    if (!hd[(y * SW + x) * 4 + 3]) continue;
    ink++;
    if (x >= bx0 && x < bx1 && y >= by0 && y < by1) inFoot++;
  }
  ok(ink > 20000 && inFoot === 0, `none of the HUD's ink at its fullest, nor two companions' calls, lies in the badge's footprint ` +
    `(${inFoot} of ${ink} px)`);
}

// --- 6. the badge, by lap -------------------------------------------------------------------
{
  const tiny = new HeadlessCanvas(1, 1).getContext('2d');
  const used = (lap, extra = {}) => {
    const hit = [];
    const di = tiny.drawImage;
    let alpha = 0;
    tiny.drawImage = function (img) { hit.push(img); alpha = tiny.globalAlpha; };
    const age = CO.badgeAt('GLORY', Math.max(2, lap)).after + 0.9;
    const drew = CO.drawCalloutBadge(tiny, { shout: 'GLORY', shoutLap: lap, shoutT: LIFE - age, state: 'playing', ...extra });
    tiny.drawImage = di;
    return { drew, hit, alpha };
  };
  const whose = (r) => [2, 3, 12].find((L) => CO.badge(L).frames.some((f) => r.hit.includes(f.c)));
  const l1 = used(1), l2 = used(2), l3 = used(3), l12 = used(12);
  ok(!l1.drew && !l1.hit.length && whose(l2) === 2 && whose(l3) === 3 && whose(l12) === 12,
    `lap 1 draws no badge; lap 2 draws x2's, lap 3 x3's, lap 12 x12's`);
  const d1 = used(2, { state: 'falling', deathT: 0.05 }), d2 = used(2, { state: 'falling', deathT: 0.2 }),
    d3 = used(2, { state: 'falling', deathT: 0.3 }), d4 = used(2, { state: 'falling', deathT: C.HUD_OUT + 0.01 }),
    dd = used(2, { state: 'dead' });
  ok(d1.alpha === 1 && d2.alpha === 0.7 && d3.alpha === 0.4 && !d4.drew && !dd.drew,
    `once the fire has him it fades with the HUD in its three steps (${d1.alpha}, ${d2.alpha}, ${d3.alpha}) and is gone after ${C.HUD_OUT} s, and on the scoreboard`);
}

// --- 7. nothing reads a canvas's pixels --------------------------------------------------------
//
// The headless canvas keeps its pixels in a `data` array; a browser's canvas has no such
// field. The badge's placement once read the word's frames off their canvases (F.c.data): every
// suite here passed, and in the game the first badge of the second lap threw a TypeError in the
// renderer every frame it was up, so no badge ever drew (seen in Chromium: "Cannot read
// properties of undefined"). So: every stored frame's canvas answers `data` only to the
// headless canvas's own code, and throws for anyone else, as good as a browser's undefined --
// then each word's badge is placed and drawn from nothing cached, the first showing's path.
{
  const canvases = [];
  for (const m of MILESTONES) {
    const e = CO.calloutEntry(m.name);
    delete e.place;
    for (const f of e.frames) canvases.push(f.c);
  }
  for (const L of [2, 3, 12]) for (const f of CO.badge(L).frames) canvases.push(f.c);
  const readers = new Set();
  for (const c of canvases) {
    const v = c.data;
    Object.defineProperty(c, 'data', { configurable: true, get() {
      const caller = (new Error().stack || '').split('\n')[2] || '';
      if (/headless\.mjs/.test(caller)) return v;
      readers.add(caller.trim());
      throw new TypeError("Cannot read properties of undefined -- a browser's canvas has no data");
    } });
    c.__keep = v;
  }
  const cv = new HeadlessCanvas(SW, SH);
  const ctx = cv.getContext('2d');
  ctx.setTransform(PX, 0, 0, PX, 0, 0);
  const threw = [], drew = [];
  for (const m of MILESTONES) {
    for (const L of [2, 12]) {
      try {
        const age = CO.badgeAt(m.name, L).after + 0.5;
        if (CO.drawCalloutBadge(ctx, { shout: m.name, shoutLap: L, shoutT: LIFE - age, state: 'playing' })) drew.push(m.name);
      } catch (err) { threw.push(`${m.name} x${L}: ${err.message}`); }
    }
  }
  for (const c of canvases) {
    Object.defineProperty(c, 'data', { value: c.__keep, writable: true, configurable: true, enumerable: true });
    delete c.__keep;
  }
  ok(!threw.length && drew.length === 2 * MILESTONES.length,
    `every word's badge is placed and drawn without reading a pixel off a canvas, as a browser needs ` +
    `(${drew.length} of ${2 * MILESTONES.length} drawn)` + (threw.length ? `; threw: ${threw[0]} (read by ${[...readers][0]})` : ''));
}

console.log(fails ? `\n  ${fails} check(s) FAILED` : `\n  callouts: all seven lettered ahead, at their heights, legible, and badged from the second lap; the floaters take the chain's colour`);
process.exit(fails ? 1 : 0);
