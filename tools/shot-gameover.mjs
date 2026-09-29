// Screenshot the game over screen as a player sees it, for a death anywhere.
//
//   node tools/shot-gameover.mjs                         a splat in the open arena, STORM
//   node tools/shot-gameover.mjs --zone=ABYSS            die in that zone (a floor inside its
//                                                        first-cycle band, unless --floor)
//   node tools/shot-gameover.mjs --floor=1700            die having reached that floor; the
//                                                        zone is the floor's own
//   node tools/shot-gameover.mjs --dazed                 the survivable fall (below floor 200
//                                                        it is the natural one; above it the
//                                                        outcome is FORCED, to see the layout)
//   node tools/shot-gameover.mjs --left                  facing left
//   node tools/shot-gameover.mjs --start                 the narrow start arena (zoom 2)
//                                                        instead of the open one (zoom 1)
//   node tools/shot-gameover.mjs --x=0.1                 where across the shaft he dies, 0..1
//   node tools/shot-gameover.mjs --plain                 no records, no awards on the board
//   node tools/shot-gameover.mjs --skip=0.6              SPACE pressed 0.6 s into the fall:
//                                                        the board comes up with him mid-air
//   node tools/shot-gameover.mjs --impact=0.2            the hold after the impact instead, 0.2 s
//                                                        in (SPLAT or OOF, the verdict, SPACE)
//   node tools/shot-gameover.mjs --fall=0.6              mid-fall, 0.6 s after the catch
//   node tools/shot-gameover.mjs --grid                  every zone, one death each, on one
//                                                        sheet (half size), plus each frame
//   node tools/shot-gameover.mjs --speed=1.2             a run at JUMP SPEED 120%: the board says so
//   node tools/shot-gameover.mjs --out=a.png --scale=2
//
// tools/shot-death.mjs stops at the impact: nothing rendered the screen the death ENDS on,
// which is where a player spends the seconds after every run. This drives the same staged
// death to the scoreboard and draws the frame the way src/main.js does in each state -- the
// world with the HUD handed in under the characters, then drawGameOver over it in view units
// -- so what comes out is the screen, not a mock of it.
//
// The staging is exported for tools/test-gameover.mjs, which renders every combination and
// measures what this only shows.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installDom, HeadlessCanvas, encodePNG, upscale } from './headless.mjs';

installDom();
// Stats.commit saves the record; a store that keeps it in memory, so the staged run's
// records never reach a real save file and the save does not warn on every frame.
{
  const mem = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) },
  });
}

const M = {
  ...(await import('../src/game/game.js')),
  ...(await import('../src/game/constants.js')),
  ...(await import('../src/game/themes.js')),
  Stats: await import('../src/game/stats.js'),
  ...(await import('../src/game/achievements.js')),
  ...(await import('../src/core/rng.js')),
  AutoInput: (await import('../src/game/autoplay.js')).AutoInput,
  Renderer: (await import('../src/render/renderer.js')).Renderer,
  STEP: (await import('../src/core/loop.js')).STEP,
  drawHud: (await import('../src/ui/hud.js')).drawHud,
  screens: await import('../src/ui/screens.js'),
  board: await import('../src/render/gameoverskin.js'),
};
export { M };

/** The first floor of a zone's band in the first cycle (BASEMENT 0, DUNGEON 100, ...). */
export function zoneFloor(i) {
  return i === 0 ? 0 : M.FIRST_THEME_FLOORS + (i - 1) * M.FLOORS_PER_THEME;
}

/**
 * Stage a death and run it to the scoreboard.
 *
 *   zone    zone index; default the floor's own
 *   floor   run.maxFloor at death; default a floor inside the zone's band, past SPLAT_FLOOR
 *           for a splat and under it for a daze where the band allows
 *   dazed   the outcome; forced when it does not match the floor
 *   left    facing left
 *   open    the fully open arena (zoom 1), as any death past floor ~200 is; else the start
 *           arena (zoom 2) at the foot of the tower
 *   x       where across the shaft he dies, 0 (left wall) to 1 (right); default the middle
 *   skip    seconds into the fall at which SPACE cuts to the board; null: the fall plays out
 *   impact  stop this many seconds after the impact, in the hold before the board
 *   fall    stop this many seconds into the fall (SPACE TO SKIP is up from 0.5 s)
 *   seed    Math.random's seed for the whole staging (shake, particles)
 */
export function stageDeath(o = {}) {
  const dazed = !!o.dazed;
  let zone = o.zone;
  let floor = o.floor;
  if (floor === undefined) {
    const z = zone === undefined ? 6 : zone;
    const lo = zoneFloor(z), len = z === 0 ? M.FIRST_THEME_FLOORS : M.FLOORS_PER_THEME;
    floor = dazed ? Math.min(lo + len - 1, Math.max(lo + 40, M.SPLAT_FLOOR - 40))
      : Math.max(lo + 60, M.SPLAT_FLOOR + 20);
    if (!dazed && z === 0) floor = M.SPLAT_FLOOR + 20;
  }
  if (zone === undefined) zone = M.themeIndexFor(floor);
  Math.random = M.mulberry32(o.seed === undefined ? 0x5eed : o.seed);

  const game = new M.Game(new M.AutoInput());
  game.newRun(0x2f6f1b21, null, o.speed || 1);
  if (o.open) {
    // Open the shaft fully and put him on a ledge of the floor he reached, as tools/shot.mjs
    // --floor does: the tower is sequential, so it is walked up to that floor.
    game.openness = 1;
    game.arenaEase = game.arenaHalf = game.arenaHalfView = M.ARENA_HALF_MAX;
    game.arenaStep = 4;
    game.zoom = game.zoomView = 1;
    game.viewH = M.VH;
    game.tower.setBounds(M.PLAY_L, M.PLAY_R);
    game.player.setBounds(M.PLAY_L, M.PLAY_R);
    const at = Math.max(1, floor);
    game.tower.ensure(at + 12);
    const pl = game.tower.get(at);
    const p = game.player;
    p.x = p.px = pl.x + pl.w / 2;
    p.y = p.py = pl.y;
    p.floor = at;
    game.camY = p.y - game.viewH * M.CAM_ANCHOR;
  } else {
    // The start arena: a few steps standing on the ground, as tools/shot-death.mjs does.
    for (let i = 0; i < 260; i++) game.step(M.STEP);
  }
  game.run.maxFloor = floor;
  // The zone on screen is the floor's: set it before anything steps, or the first step
  // would fire that zone's arrival (a flash, a banner and a burst) over the death.
  game.themeIndex = zone;
  game.themeBlend = 0;
  const p = game.player;
  if (o.x !== undefined) {
    const half = game.arenaHalf - M.PLAYER_W / 2;
    p.x = p.px = M.CX - half + 2 * half * o.x;
  }
  p.facing = o.left ? -1 : 1;
  p.vx = 0;
  // The zone's board, painted now: the game paints it ahead while he climbs the zone
  // (gameoverskin.js warmBoards), and a death takes the last finished board if it is not
  // done -- a staged death climbed nothing, so it would be drawn in BASEMENT's.
  M.board.warmBoardNow(M.THEMES[zone]);
  game.die();
  // The outcome as asked, whatever the floor says.
  game.splat = !dazed;
  let guard = 0;
  if (o.skip !== undefined && o.skip !== null) {
    const n = Math.round(o.skip / M.STEP);
    for (let i = 0; i < n && game.state === M.STATE.FALLING; i++) game.step(M.STEP);
    game.skipFall();
  }
  if (o.fall !== undefined && o.fall !== null) {
    // Mid-fall: this long after the catch, still on the way down.
    const n = Math.round(o.fall / M.STEP);
    for (let i = 0; i < n && !game.impacted; i++) game.step(M.STEP);
    return { game, zone, floor, dazed };
  }
  if (o.impact !== undefined && o.impact !== null) {
    // The impact hold instead of the board: this long after he lands, still FALLING.
    while (game.state === M.STATE.FALLING && !(game.impacted && game.impactT >= o.impact) && guard++ < 40000) game.step(M.STEP);
    return { game, zone, floor, dazed };
  }
  while (game.state === M.STATE.FALLING && guard++ < 40000) game.step(M.STEP);
  // A beat on the board itself: particles still settling, the prompts' blink running.
  const hold = o.hold === undefined ? 0.5 : o.hold;
  for (let i = 0; i < Math.round(hold / M.STEP); i++) game.step(M.STEP);
  return { game, zone, floor, dazed };
}

/**
 * What the board is handed: the save file, the records the run set and the awards it
 * unlocked. `full` is the most the board ever has to hold -- a first run's whole list of
 * records (it sets every one) and three awards with the longest names -- over a save file
 * with numbers in every column; otherwise a save that this run beat nothing in.
 */
export function boardData(game, full) {
  const all = M.Stats.BLANK_ALL();
  if (full) {
    const records = M.Stats.commit(all, game.run, 0);
    Object.assign(all, {
      totalRuns: 1234, totalFloors: 987654, totalPlaySeconds: 3600 * 41 + 1234,
      bestScore: Math.max(all.bestScore, 2345678),
    });
    const names = ['HIGHEST FLOOR', 'HIGH SCORE', 'BEST COMBO', 'BEST COMBO SCORE', 'MOST STYLISH COMBO',
      'TOP SPEED', 'LONGEST RUN', 'LONGEST HANG TIME', 'LONGEST JUMP CHAIN'];
    for (const n of names) if (!records.includes(n)) records.push(n);
    const unlocked = [...M.ACHIEVEMENTS].sort((a, b) => b.name.length - a.name.length).slice(0, 3);
    for (const a of M.ACHIEVEMENTS.slice(0, 20)) all.achievements[a.id] = 1;
    return { all, records, unlocked };
  }
  all.totalRuns = 40; all.bestFloor = 99999; all.bestScore = 9999999; all.bestCombo = 999;
  all.totalFloors = 12345; all.totalPlaySeconds = 5000;
  M.Stats.commit(all, game.run, 0);
  return { all, records: [], unlocked: [] };
}

/** A renderer on its own canvas, the context taken AFTER the renderer sizes it. */
export function makeRenderer() {
  const canvas = new HeadlessCanvas(M.SW, M.SH);
  const renderer = new M.Renderer(canvas);
  renderer.applySettings({
    scaleMode: 'integer', scanlines: false, particles: 'high',
    streaks: true, shake: true, trails: true, showFps: false, music: false,
  });
  return { canvas, renderer, ctx: canvas.getContext('2d') };
}

/**
 * Draw one frame the way src/main.js renderFrame does in the death's states.
 *
 * opts.hide: leave out everything the board must not be covered by -- the Duke, his pieces
 * and blood, the companions and their calls, the floaters and every particle -- so the frame
 * drawn with them and the frame drawn without can be told apart pixel by pixel. The
 * renderer's clock and Math.random are pinned by the caller, so the two differ in nothing
 * else.
 *
 * opts.onTop: draw all of that AGAIN over the finished board, as if the board were under the
 * scene -- the frame a test must be able to tell from the real one, or its measure of
 * "nothing over the words" could not see a body over a word at all.
 *
 * opts.noWords: leave the fall's words out -- the scene they fade in over.
 */
export function drawFrame(r, game, data, uiT, opts = {}) {
  const { renderer, ctx } = r;
  const saved = [];
  if (opts.hide) {
    for (const k of ['drawPlayer', 'drawSplatter', 'drawContactShadow', 'drawCompanions',
      'drawCompanionCalls', 'drawFloaters']) {
      saved.push([renderer, k, renderer[k]]);
      renderer[k] = () => {};
    }
    const parts = game.particles;
    saved.push([parts, 'alive', parts.alive]);
    parts.alive = new parts.alive.constructor(parts.alive.length);
  }
  try {
    const S = M.screens;
    renderer.draw(game, 1, 0, () => {
      if (game.state === M.STATE.FALLING) S.drawFalling(ctx, game, uiT, (g, view) => M.drawHud(g, view, data.all, uiT));
      else if (game.state !== M.STATE.DEAD) M.drawHud(ctx, game, data.all, uiT);
    });
    ctx.setTransform(M.PX, 0, 0, M.PX, 0, 0);
    if (game.state === M.STATE.FALLING) {
      // The fall's words (SPACE TO SKIP; SPLAT or OOF, the verdict, the floor, SPACE) go over
      // the world, as main.js draws them. With opts.fallText, where each glyph lands is kept,
      // in backing pixels, with the atlas it came from, for the test's masks.
      const di = ctx.drawImage, log = opts.fallText;
      if (log) {
        ctx.drawImage = function (img, ...a) {
          if (a.length >= 8) log.push({ img, sx: a[0], sy: a[1], x: Math.round(a[4] * M.PX), y: Math.round(a[5] * M.PX), w: Math.round(a[6] * M.PX), h: Math.round(a[7] * M.PX) });
          return di.call(this, img, ...a);
        };
      }
      try { if (!opts.noWords) S.drawFallWords(ctx, game, uiT); } finally { ctx.drawImage = di; }
    }
    if (game.state === M.STATE.DEAD) S.drawGameOver(ctx, game, data.all, data.records, data.unlocked, uiT);
    if (opts.onTop) {
      const view = renderer.setWorldTransform(ctx, game);
      if (game.impacted && game.splat) renderer.drawSplatter(ctx, game, game.pitY, 1);
      renderer.drawCompanions(ctx, game, 1);
      renderer.drawPlayer(ctx, game, game.player.x, game.player.y);
      game.particles.draw(ctx, { l: view.viewLeft, r: view.viewRight, b: game.camY, t: game.camY + game.viewH });
      ctx.setTransform(M.PX, 0, 0, M.PX, 0, 0);
      renderer.drawCompanionCalls(ctx, game);
    }
  } finally {
    for (const [o, k, v] of saved) o[k] = v;
  }
  return Uint8ClampedArray.from(r.canvas.data);
}

/** A frame at half size, each output pixel the mean of four: for sheets of many frames. */
export function half(data, w, h) {
  const W = w >> 1, H = h >> 1;
  const out = new HeadlessCanvas(W, H), od = out.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = (y * W + x) * 4;
      for (let c = 0; c < 4; c++) {
        const s = ((2 * y) * w + 2 * x) * 4 + c;
        od[d + c] = (data[s] + data[s + 4] + data[s + w * 4] + data[s + w * 4 + 4] + 2) >> 2;
      }
    }
  }
  return out;
}

// --- the command line ---------------------------------------------------------------------

const MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (MAIN) {
  const argv = process.argv.slice(2);
  const flag = (name, dflt) => {
    const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
    if (!hit) return dflt;
    const eq = hit.indexOf('=');
    return eq < 0 ? true : hit.slice(eq + 1);
  };
  const OUT = String(flag('out', 'gameover.png'));
  const SCALE = Number(flag('scale', 1));
  const zoneArg = flag('zone', undefined);
  const zoneOf = (v) => {
    if (v === undefined) return undefined;
    const i = M.THEMES.findIndex((t) => t.name === String(v).toUpperCase());
    if (i < 0) { console.log(`  no zone "${v}"`); process.exit(1); }
    return i;
  };
  const opts = {
    zone: zoneOf(zoneArg),
    floor: flag('floor', undefined) === undefined ? undefined : Number(flag('floor')),
    dazed: !!flag('dazed', false),
    left: !!flag('left', false),
    open: !flag('start', false),
    x: flag('x', undefined) === undefined ? undefined : Number(flag('x')),
    skip: flag('skip', undefined) === undefined ? undefined : Number(flag('skip')),
    impact: flag('impact', undefined) === undefined ? undefined : Number(flag('impact')),
    fall: flag('fall', undefined) === undefined ? undefined : Number(flag('fall')),
    hold: Number(flag('hold', 0.5)),
    speed: Number(flag('speed', 1)),
  };
  const full = !flag('plain', false);
  const uiT = Number(flag('t', 0.05));
  const r = makeRenderer();

  const one = (o) => {
    const st = stageDeath(o);
    const data = boardData(st.game, full);
    Math.random = M.mulberry32(7);
    r.renderer.t = 1;
    const px = drawFrame(r, st.game, data, uiT);
    console.log(`  ${M.THEMES[st.zone].name.padEnd(9)} floor ${st.floor}  ${st.dazed ? 'dazed' : 'splat'}` +
      `  ${o.left ? 'left ' : 'right'}  ${o.open ? 'open' : 'start'}  state ${st.game.state}` +
      `  zoom ${st.game.zoom}  impacted ${st.game.impacted}`);
    return px;
  };

  if (flag('grid', false)) {
    const cols = 4, rows = Math.ceil(M.THEMES.length / cols);
    const W = M.SW >> 1, H = M.SH >> 1;
    const sheet = new HeadlessCanvas(W * cols, H * rows);
    const base = OUT.replace(/\.png$/i, '');
    M.THEMES.forEach((t, i) => {
      const px = one({ ...opts, zone: i, floor: undefined });
      const cv = new HeadlessCanvas(M.SW, M.SH);
      cv.data.set(px);
      fs.writeFileSync(`${base}-${t.name.toLowerCase()}.png`, encodePNG(cv));
      const h = half(px, M.SW, M.SH);
      const ox = (i % cols) * W, oy = Math.floor(i / cols) * H;
      for (let y = 0; y < H; y++) sheet.data.set(h.data.subarray(y * W * 4, (y + 1) * W * 4), ((oy + y) * sheet.width + ox) * 4);
    });
    fs.writeFileSync(OUT, encodePNG(sheet));
    console.log(`  ${OUT}  ${sheet.width}x${sheet.height}  (and ${base}-<zone>.png at full size)`);
  } else {
    const px = one(opts);
    const cv = new HeadlessCanvas(M.SW, M.SH);
    cv.data.set(px);
    fs.writeFileSync(OUT, encodePNG(SCALE > 1 ? upscale(cv, SCALE) : cv));
    console.log(`  ${OUT}  ${cv.width * Math.max(1, SCALE)}x${cv.height * Math.max(1, SCALE)}`);
  }
}
