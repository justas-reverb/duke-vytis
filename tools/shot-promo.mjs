// The README's key art, staged: the whole cast on one screen of the tower, in a scene laid
// out by hand from the game's own pieces, and drawn by the game's own renderer.
//
//   node tools/shot-promo.mjs                          docs/images/climb.png
//   node tools/shot-promo.mjs --out=x.png --zone=FOREST  the same scene in another zone
//   node tools/shot-promo.mjs --hud                    with the HUD over it
//   node tools/shot-promo.mjs --logo=stack,182,160,2   the name laid out and placed another way
//
// Nothing here is painted. The ledges are the zone's own ledge tiles and furniture, the
// shaft its walls and backdrop, the fire the rising floor, the stars the combo trail --
// every one drawn by the code that draws it in play. What is staged is only WHERE: a tower
// that no seed generates (every floor's ledge is placed by the SCENE below), all six
// companions at once (in play they come one at a time, a hundred floors apart), each in a
// pose chosen for them, and the Duke caught at a chosen instant of a real jump. His leap is
// flown, not placed: launched from his ledge at a jump's speed and stepped at the
// simulation's rate under his own GRAVITY, so the dust he kicks off, the trail of stars
// that falls out of him and the afterimage on him are what that jump sheds in play.
//
// The one liberty is the poses. The renderer picks a pose from the state (companionPose,
// frameFor); here the scene names it. Every pose named is one the game draws.

import fs from 'node:fs';
import path from 'node:path';
import { installDom, HeadlessCanvas, encodePNG } from './headless.mjs';

installDom();

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return dflt;
  const eq = hit.indexOf('=');
  return eq < 0 ? true : hit.slice(eq + 1);
};

const { Game, STATE } = await import('../src/game/game.js');
const { Renderer } = await import('../src/render/renderer.js');
const { STEP } = await import('../src/core/loop.js');
const C = await import('../src/game/constants.js');
const { THEMES } = await import('../src/game/themes.js');
const { drawHud } = await import('../src/ui/hud.js');
const Stats = await import('../src/game/stats.js');
const { mLine } = await import('../src/render/menuskin.js');
const { emblemCanvas, EMB_WW, EMB_WH } = await import('../src/render/emblem.js');
const { textWidth } = await import('../src/render/font.js');
const { WORD_L, WORD_R } = await import('../src/ui/screens.js');

// --- the scene ----------------------------------------------------------------------------
//
// World units, y up, measured from the view's bottom-left corner. At zoom 1 the view is
// 480 x 270 and the shaft runs from x 16 to 464 (the walls are 16 wide). A ledge stands on
// its floor, `k` floors above the scene's first, FLOOR_H = 30 apart as in every tower. Its
// furniture is the zone's own, as the floor numbered `seed` would carry it: decor.js draws
// each ledge's furniture from a stream seeded by its floor number, so a number picks an
// arrangement, and which numbers carry anything, and where along the ledge, depends on the
// zone and the width. In CITADEL it is a banner; seed 1 carries none.
const SCENE = {
  zone: 'CITADEL',
  zoom: 1,                // 1 or 2, the game's two whole-pixel zooms (the shaft's widest and narrowest)
  floor: 1000,            // the floor number of ledge k = 0, for the HUD
  base: 34,               // ledge k = 0's height [world units above the view's bottom]
  fire: 24,               // the rising floor's line [world units above the view's bottom]
  // [k, left x, width, seed, kind] -- kind 'normal' (the default), 'wide' or 'checkpoint'
  ledges: [
    [0, 30, 196, 1, 'wide'],
    [1, 280, 120, 5],
    [2, 20, 100, 169],
    [3, 364, 94, 61],
    [4, 400, 64, 1],
    [5, 50, 120, 1],
    [6, 300, 150, 21],
    [7, 120, 120, 77],
  ],
  // The Duke's leap: off ledge `from` at x, at (vx, vy) [units/s; a full-speed jump leaves at
  // up to 945 up and 430 across], drawn `t` seconds later. `chain` is the live combo's
  // floors, which colours the trail (sparks.js STEPS: 250-299 is CRUSADE, the tricolour of
  // Lithuania; 350-399 GLORY; 400 on BEYOND).
  // `burst`: his landing on that ledge took the chain into a new step of STEPS, and threw that
  // step's confetti (Game.comboStep) as he left.
  duke: { from: 0, x: 100, vx: 400, vy: 700, t: 0.33, pose: 'jump', facing: 1, chain: 370, burst: true },
  // Each companion: on ledge `k` at x (their feet on its top), or in the air at (x, y).
  // `land`, for one on a ledge, puts the dust of a landing that long ago [s] at their feet.
  // `inFire`: drawn before the rising floor, so its flames and crust cover what of them is
  // under its line -- the renderer draws every companion after it, over the fire.
  companions: [
    { id: 'halfling', pose: 'slip', x: 244, y: 21, facing: 1, inFire: true },
    { id: 'delver', pose: 'land', k: 1, x: 322, facing: -1, land: 0.1 },
    { id: 'archer', pose: 'run1', k: 2, x: 66, facing: 1 },
    { id: 'maiden', pose: 'jump', x: 318, y: 134, facing: -1 },
    { id: 'pilgrim', pose: 'idle0', k: 5, x: 100, facing: 1 },
    { id: 'ranger', pose: 'idle0', k: 6, x: 385, facing: -1 },
  ],
  // The name and the arms (drawLogo), in view units from the top left: the title's own line,
  // DUKE, the shield, VYTIS, its words at `scale` (the title screen's are 4) and `wordsY` below
  // the shield's top -- raised from the middle, where VYTIS would sit on the top ledge.
  logo: { layout: 'line', x: 22, y: 3, scale: 2, wordsY: 3 },
};

const zoneName = String(flag('zone', SCENE.zone)).toUpperCase();
const zone = THEMES.findIndex((t) => t.name === zoneName);
if (zone < 0) {
  console.log(`no zone "${zoneName}": ${THEMES.map((t) => t.name).join(' ')}`);
  process.exit(1);
}
const theme = THEMES[zone];
const OUT = String(flag('out', 'docs/images/climb.png'));
if (flag('logo', null) !== null) {
  const [layout, x, y, scale, wordsY] = String(flag('logo')).split(',');
  SCENE.logo = { layout, x: Number(x), y: Number(y), scale: Number(scale || 2) };
  if (wordsY !== undefined) SCENE.logo.wordsY = Number(wordsY);
}
const HUD = !!flag('hud', false);
// For trying the scene another way.
const STREAKS = !!flag('streaks', false);
if (flag('chain', null) !== null) SCENE.duke.chain = Number(flag('chain'));

// --- the game, set to the scene ------------------------------------------------------------

const canvas = new HeadlessCanvas(C.SW, C.SH);
const game = new Game(null);
game.newRun(0x5eed1000);
game.state = STATE.PLAYING;
game.themeIndex = zone;
game.themeBlend = 0;

// The view at the scene's zoom, the walls where that zoom puts them, nothing gliding.
const z = SCENE.zoom;
game.zoom = game.zoomView = z;
game.viewH = C.VH / z;
game.arenaEase = game.arenaHalf = game.arenaHalfView = (C.VW / z - 2 * C.WALL_W) / 2;
game.openness = z === 1 ? 1 : 0;
const left = C.CX - C.VW / z / 2;          // the view's left edge in the world

const F0 = SCENE.floor;
game.camY = F0 * C.FLOOR_H - SCENE.base;
const X = (x) => left + x;
const Y = (y) => game.camY + y;
const at = (k) => (F0 + k) * C.FLOOR_H;   // the height of ledge k's top

// The tower: only the scene's ledges. `highest` above everything, so peek() never generates
// a floor of its own into a gap the scene left (it returns nothing for a floor not laid).
// A ledge's `n` feeds nothing but its furniture's stream (decor.js).
const tower = game.tower;
tower.floors.clear();
tower.highest = 1e9;
for (const [k, x, w, seed = 0, kind = 'normal'] of SCENE.ledges) {
  tower.floors.set(F0 + k, { n: seed, x: X(x), w, y: at(k), kind });
}

game.riseActive = true;
game.riseY = Y(SCENE.fire);
game.run.maxFloor = F0 + Math.max(...SCENE.ledges.map((l) => l[0]));
game.score = game.run.maxFloor * 10;

// The companions, all six. The renderer reads nothing of theirs but where they are, which
// way they face, and (for a tumble) how far round they are.
game.companions.active = SCENE.companions.map((s) => {
  const y = s.k === undefined ? Y(s.y) : at(s.k);
  return {
    id: s.id, name: '', x: X(s.x), y, px: X(s.x), py: y, facing: s.facing || 1,
    state: s.pose === 'tumble' ? 'slipping' : 'climbing', spin: s.spin || 0,
    pose: s.pose, airborne: s.k === undefined, vy: 0, landT: 0, walkV: 0, stride: 0,
    bubble: null, bubbleT: 0,
  };
});

const r = new Renderer(canvas);
r.applySettings({
  scaleMode: 'integer', scanlines: false, particles: 'high',
  streaks: STREAKS, shake: false, trails: true, showFps: false, music: false,
});
// The scene names each pose (see the header).
r.companionPose = (c) => c.pose;
// Whoever is in the fire goes in under it: drawn first, by the renderer's own companion drawing,
// then the rising floor over them, and left out of the drawing of the rest.
const inFire = game.companions.active.filter((c, i) => SCENE.companions[i].inFire);
game.companions.active = game.companions.active.filter((c, i) => !SCENE.companions[i].inFire);
const drawRise = r.drawRisingFloor.bind(r);
r.drawRisingFloor = (ctx, g2, view, th) => {
  const rest = g2.companions.active;
  g2.companions.active = inFire;
  r.drawCompanions(ctx, g2, 1);
  g2.companions.active = rest;
  drawRise(ctx, g2, view, th);
};
const frameFor = r.frameFor.bind(r);
r.frameFor = (p, g) => (p === game.player ? SCENE.duke.pose : frameFor(p, g));

// --- his leap, flown -----------------------------------------------------------------------

const d = SCENE.duke;
const p = game.player;
p.x = p.px = X(d.x);
p.y = p.py = at(d.from);
p.vx = d.vx;
p.vy = d.vy;
p.grounded = false;
p.momentum = 1;
p.facing = d.facing;
p.spinT = 0;
p.landT = 0;
p.squash = 0;
p.floor = F0 + d.from;
game.combo.active = true;
game.combo.floors = d.chain;

const g = C.GRAVITY * (p.gravity || 1);
const steps = Math.round(d.t / STEP);
const all = Stats.BLANK_ALL();
const hud = HUD ? () => drawHud(r.ctx, game, all, 0) : undefined;
// The takeoff's dust, as Game.handleEvents throws it for a jump.
game.particles.landing(p.x, p.y, 0.25 + 0.4 * Math.min(1, Math.abs(d.vx) / C.VX_MAX_HOT), theme.particle);
if (d.burst) game.comboStep(0);
const landings = SCENE.companions.filter((s) => s.land !== undefined)
  .map((s) => ({ s, at: steps - Math.round(s.land / STEP) }));
for (let i = 1; i <= steps; i++) {
  p.px = p.x;
  p.py = p.y;
  p.x += p.vx * STEP;
  p.y += (p.vy - 0.5 * g * STEP) * STEP;
  p.vy -= g * STEP;
  for (const l of landings) {
    if (l.at === i) game.particles.landing(X(l.s.x), at(l.s.k), 0.7, theme.platTop);
  }
  game.particles.comboTrail(STEP, p, game.combo.floors, game.themeIndex);
  game.particles.step(STEP);
  // Drawn at 60 frames a second over the last tenth of a second, so the afterimage has the
  // path he was drawn along (it records only what is drawn: render/afterimage.js).
  if (i === steps || (i % 4 === 0 && steps - i < 0.1 / STEP)) {
    r.draw(game, 1, 4 * STEP, i === steps ? hud : undefined);
  }
}

// --- the name -----------------------------------------------------------------------------
//
// DUKE and VYTIS in the title's polished gold (menuskin.js mLine) and the arms between or
// beside them (emblem.js, the application's icon too), with no plaque: the words and the arms
// alone over the scene. The arms are drawn at their one size -- any other resamples them -- so
// the words' scale is what sizes the rest. Positions in view units from the top left.
function drawLogo(ctx, L) {
  const s = L.scale, th = 7 * s;
  const air = Math.round(3.5 * s);            // the title's 14 units either side of the arms at 4
  const lw = textWidth(WORD_L, s), rw = textWidth(WORD_R, s);
  const arms = (x, y) => ctx.drawImage(emblemCanvas(), Math.round(x * C.PX) / C.PX,
    Math.round(y * C.PX) / C.PX, EMB_WW, EMB_WH);
  if (L.layout === 'line') {
    const wy = L.y + (L.wordsY === undefined ? (EMB_WH - th) / 2 : L.wordsY);
    mLine(ctx, 'gold', WORD_L, L.x, wy, s, 'left');
    arms(L.x + lw + air, L.y);
    mLine(ctx, 'gold', WORD_R, L.x + lw + air + EMB_WW + air, wy, s, 'left');
  } else if (L.layout === 'stack') {
    const gap = s * 2, block = th * 2 + gap;
    const wy = L.y + (EMB_WH - block) / 2;
    arms(L.x, L.y);
    mLine(ctx, 'gold', WORD_L, L.x + EMB_WW + air, wy, s, 'left');
    mLine(ctx, 'gold', WORD_R, L.x + EMB_WW + air, wy + th + gap, s, 'left');
  } else if (L.layout === 'tower') {
    const w = Math.max(EMB_WW, lw, rw), cx = L.x + w / 2, gap = s * 2;
    arms(cx - EMB_WW / 2, L.y);
    mLine(ctx, 'gold', WORD_L, cx, L.y + EMB_WH + gap * 2, s, 'center');
    mLine(ctx, 'gold', WORD_R, cx, L.y + EMB_WH + gap * 2 + th + gap, s, 'center');
  } else if (L.layout === 'side') {
    const wy = L.y + (L.wordsY === undefined ? (EMB_WH - th) / 2 : L.wordsY);
    arms(L.x, L.y);
    mLine(ctx, 'gold', `${WORD_L} ${WORD_R}`, L.x + EMB_WW + air, wy, s, 'left');
  }
}
if (SCENE.logo) {
  r.ctx.setTransform(C.PX, 0, 0, C.PX, 0, 0);
  drawLogo(r.ctx, SCENE.logo);
}

fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
fs.writeFileSync(OUT, encodePNG(canvas));
console.log(`  ${path.resolve(OUT)}  ${theme.name}  ${C.SW}x${C.SH}`);
console.log(`  the Duke drawn at x ${(p.x - left).toFixed(1)}, y ${(p.y - game.camY).toFixed(1)} of the view, ` +
  `moving ${p.vx.toFixed(0)}, ${p.vy.toFixed(0)}`);
