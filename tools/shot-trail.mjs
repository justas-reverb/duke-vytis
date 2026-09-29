// The combo trail, looked at: real frames with a chain of any length, and the sprites alone.
//
//   node tools/shot-trail.mjs --combo=160 --demo --sec=12      a frame, a 160-floor chain
//   node tools/shot-trail.mjs --combo=360 --floor=2250 --sec=3  the same, high in ZENITH
//   node tools/shot-trail.mjs --combo=20,160,360 ...           one column per chain length
//   node tools/shot-trail.mjs ... --frames=4 --every=0.1       a strip of frames (rows)
//   node tools/shot-trail.mjs ... --follow --box=480x360 --scale=2   close on the Duke
//   node tools/shot-trail.mjs ... --measure                    what the trail changed
//   node tools/shot-trail.mjs ... --particles=low              at another particle setting
//   node tools/shot-trail.mjs --sheet [--mag=8]                every sprite, every ramp
//
// WHY IT EXISTS. A chain long enough to show the upper steps of the trail takes minutes of
// play to build, and tools/shot.mjs can only show whatever chain the bot happens to have.
// Here --combo=N sets the chain to N floors LEAD seconds before the shot and keeps it alive
// from then on (every landing counts, standing still does not end it), so any step of the
// trail can be put in front of the camera in any zone. The bot keeps playing throughout, so
// he is moving the way he really moves. Several lengths run as separate games in the one
// process, each from the same start, so the columns differ only in the chain.
//
// It runs unchanged against an older tree (copy it into that tree's tools/): --combo only
// uses the combo tracker, and the sprite and measuring parts are skipped where the tree has
// no sparks.js. That is how the BEFORE frames were made.
//
// --measure renders each frame again, identically but for the trail (its pieces taken out
// of the pool for one draw), and counts the pixels that differ: all of them, those in the
// box around the Duke, and those on the surface row and the six under it of every ledge in
// view -- which must be zero, because the trail is drawn behind the ledges. The two rows
// above the surface are listed too: the trail may show there, past the tile's edge, as it
// goes behind a ledge. It also times the frame with and without the trail (headless, so
// an upper bound; the difference is noise-level at a few hundred pieces).
//
// Math.random is seeded afresh for every game, so two runs of the same arguments draw the
// same trail; shake is off, so a BEFORE and an AFTER frame have the camera in one place.

import fs from 'node:fs';
import path from 'node:path';
import { installDom, HeadlessCanvas, encodePNG, upscale } from './headless.mjs';

installDom();

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return dflt;
  const eq = hit.indexOf('=');
  return eq < 0 ? true : hit.slice(eq + 1);
};

// A seeded Math.random (mulberry32), installed before anything is imported.
const RNG0 = (Number(flag('rng', 1234)) >>> 0) || 1;
let rs = RNG0;
Math.random = () => {
  rs = (rs + 0x6d2b79f5) >>> 0;
  let t = rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const OUT = String(flag('out', 'trail.png'));
const { SW, SH, PX } = await import('../src/game/constants.js');

let sparks = null;
try { sparks = await import('../src/render/sparks.js'); } catch { sparks = null; }

// --- the sheet: every shape, frame and ramp -------------------------------------------
if (flag('sheet', false)) {
  if (!sparks) { console.log('  this tree has no sparks.js'); process.exit(1); }
  const { THEMES } = await import('../src/game/themes.js');
  const MAG = Number(flag('mag', 8));
  const p = sparks.paintAtlas();
  const C = sparks.CELL;
  const NS = sparks.SHAPES.length;
  const nr = p.h / (C * NS);
  // Grounds: magenta for the holes, then four real skies from dark to pale.
  const grounds = ['#ff00ff', THEMES[0].sky[1], THEMES[2].sky[0], THEMES[5].sky[0], THEMES[11].sky[1]];
  const gw = C * 4 + 2;
  const cv = new HeadlessCanvas(grounds.length * gw, nr * NS * C);
  const g = cv.getContext('2d');
  grounds.forEach((col, k) => {
    g.fillStyle = col;
    g.fillRect(k * gw, 0, gw - 2, cv.height);
  });
  let runs = 0;
  const cd = cv.data;
  const same = (i, j) => p.data[i] === p.data[j] && p.data[i + 1] === p.data[j + 1]
    && p.data[i + 2] === p.data[j + 2] && p.data[i + 3] === p.data[j + 3];
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const i = (y * p.w + x) * 4;
      if (!p.data[i + 3]) continue;
      if (x === 0 || !same(i, i - 4)) runs++;          // one fillRect per run, as pixToCanvas
      for (let k = 0; k < grounds.length; k++) {
        const o = (y * cv.width + k * gw + x) * 4;
        cd[o] = p.data[i]; cd[o + 1] = p.data[i + 1]; cd[o + 2] = p.data[i + 2];
        cd[o + 3] = 255;
      }
    }
  }
  fs.writeFileSync(OUT, encodePNG(upscale(cv, MAG)));
  // Build time of the real thing, canvas and all: cold, then warm (the JIT has seen it).
  sparks.resetSparks();
  let t0 = performance.now();
  sparks.warmSparks();
  const cold = performance.now() - t0;
  sparks.resetSparks();
  t0 = performance.now();
  sparks.warmSparks();
  const warm = performance.now() - t0;
  console.log(`  ${path.resolve(OUT)}  ${cv.width * MAG}x${cv.height * MAG}  ${nr} ramps x ${NS} shapes x 4 frames`);
  console.log(`  atlas ${p.w}x${p.h} px, ${runs} fillRect runs, built in ${cold.toFixed(2)} ms cold, ${warm.toFixed(2)} ms warm`);
  process.exit(0);
}

// --- frames of the game ---------------------------------------------------------------
const SEC = Number(flag('sec', 8));
const SCALE = Number(flag('scale', 1));
const FRAMES = Number(flag('frames', 1));
const EVERY = Number(flag('every', 0.35));
const DEMO = !!flag('demo', false);
const SEED = Number(flag('seed', 0)) || null;
const COMBOS = String(flag('combo', '0')).split(',').map((v) => Number(v) || 0);
const LEAD = Number(flag('lead', 2.5));
const FOLLOW = !!flag('follow', false);
const [BW, BH] = String(flag('box', '480x360')).split('x').map(Number);
const CROP = flag('crop', null);
const MEASURE = !!flag('measure', false);
const NOHUD = !!flag('nohud', false);
// --floor=40,450,2250 with --combo=20,110,360 is one column per PAIR: a zone and a chain.
const FLOORS = String(flag('floor', '0')).split(',').map((v) => Math.max(0, Math.floor(Number(v) || 0)));
const PARTS = String(flag('particles', 'high'));

const C = await import('../src/game/constants.js');
const { Game, STATE } = await import('../src/game/game.js');
const { AutoInput, AutoPlayer, DEMO_SEEDS } = await import('../src/game/autoplay.js');
const { Renderer } = await import('../src/render/renderer.js');
const { STEP } = await import('../src/core/loop.js');
const { drawHud } = await import('../src/ui/hud.js');
const Stats = await import('../src/game/stats.js');
const { PARTICLE_BUDGET } = await import('../src/game/settings.js');
const TW = sparks ? sparks.TWINKLE : -1;

function capture(combo, FLOOR) {
  rs = RNG0;
  const canvas = new HeadlessCanvas(SW, SH);
  const input = new AutoInput();
  const game = new Game(input);
  const bot = new AutoPlayer(input);
  game.demo = DEMO;
  game.newRun(SEED || (DEMO ? DEMO_SEEDS[0] : 0x2f6f1b21));
  game.particles.setBudget(PARTICLE_BUDGET[PARTS] ?? 0);

  if (FLOOR > 0) {
    // As tools/shot.mjs --floor: the full shaft, the tower walked up to floor N, him on it.
    game.openness = 1;
    game.arenaEase = C.ARENA_HALF_MAX;
    game.arenaHalfView = C.ARENA_HALF_MAX;
    game.zoom = game.zoomView = 1;
    game.viewH = C.VH / game.zoom;
    game.tower.setBounds(C.PLAY_L, C.PLAY_R);
    game.player.setBounds(C.PLAY_L, C.PLAY_R);
    game.tower.ensure(FLOOR + 40);
    const pl = game.tower.get(FLOOR);
    const p = game.player;
    p.x = p.px = pl.x + pl.w / 2;
    p.y = p.py = pl.y;
    p.floor = FLOOR;
    p.momentum = 1;
    game.run.maxFloor = FLOOR;
    game.camY = p.y - game.viewH * C.CAM_ANCHOR;
  }

  const renderer = new Renderer(canvas);
  renderer.applySettings({
    scaleMode: 'integer', scanlines: false, particles: PARTS,
    streaks: true, shake: false, trails: true, showFps: false, music: false,
  });

  // A chain that does not break: every landing gains at least the minimum, and standing
  // still does not end it. Milestones still fire as the floors cross them.
  let forced = false;
  // --combo=-1 is the opposite: no chain at all, the plain speed trail.
  const forceCombo = () => {
    const c = game.combo;
    forced = true;
    if (combo < 0) { c.softReset(); c.onLand = () => null; return; }
    const land = c.onLand.bind(c);
    c.onLand = (gain) => land(Math.max(gain, 2));
    c.onGrounded = () => null;
    c.active = true;
    c.floors = combo;
    c.hops = Math.max(c.hops, 1);
  };

  const all = Stats.BLANK_ALL();
  const shots = [];
  const ctx = canvas.getContext('2d');
  const snapshot = () => Uint8ClampedArray.from(canvas.data);
  let t = 0;
  let nextShot = SEC;
  const steps = Math.ceil((SEC + (FRAMES - 1) * EVERY) / STEP) + 2;

  for (let i = 0; i < steps && shots.length < FRAMES; i++) {
    if (combo && !forced && t >= SEC - LEAD) forceCombo();
    bot.step(game, STEP);
    game.step(STEP);
    t += STEP;
    if (t < nextShot) continue;

    const t0 = performance.now();
    renderer.draw(game, 1, STEP);
    const drawMs = performance.now() - t0;
    const pp = game.player;
    const z = game.zoomView || game.zoom;
    const viewLeft = 240 - (480 / z) / 2;
    const cx = Math.round((pp.x - viewLeft) * z * PX);
    const feet = Math.round(SH - (pp.y - game.camY) * z * PX);
    const info = {
      t, floor: game.run.maxFloor, combo: game.combo.active ? game.combo.floors : 0,
      zone: game.theme.name, zoom: z, alive: game.particles.twinkles ?? 0,
      draws: sparks ? sparks.sparkStats.draws : 0, drawMs,
      cx, cy: feet - Math.round(14 * z * PX),
    };

    if (MEASURE && sparks) {
      // Same state, drawn with and without the trail. dt 0, so nothing else moves. Each
      // is drawn five times over and timed, for what the trail itself costs a frame.
      const P = game.particles;
      const saved = [];
      for (let k = 0; k < (P.slots || P.max); k++) if (P.alive[k] && P.kind[k] === TW) saved.push(k);   // slots: the ring and the trail's own
      renderer.draw(game, 1, 0);
      const withT = snapshot();
      // The trail's own cost: drawSparks alone, under the frame's world transform, 20 times
      // (onto the finished frame; it is redrawn clean just below).
      renderer.setWorldTransform(ctx, game);
      const view = { l: 240 - 240 / z, r: 240 + 240 / z, b: game.camY, t: game.camY + game.viewH };
      const a0 = performance.now();
      for (let r = 0; r < 20; r++) sparks.drawSparks(ctx, P, view);
      info.trailMs = (performance.now() - a0) / 20;
      for (const k of saved) P.alive[k] = 0;
      renderer.draw(game, 1, 0);
      const without = snapshot();
      for (const k of saved) P.alive[k] = 1;
      renderer.draw(game, 1, 0);
      // The Duke's box: his sprite cell, 252 x 212 art px, feet at the bottom, centred.
      const bx0 = cx - Math.round(126 * z), bx1 = cx + Math.round(126 * z);
      const by0 = feet - Math.round(212 * z), by1 = feet;
      // The lit top rows of every ledge in view: the surface and the 6 rows under it.
      const rows = [];
      const k = z * PX;
      for (let f = Math.max(0, pp.floor - 12); f < pp.floor + 14; f++) {
        const pl = game.tower.get(f);
        if (!pl) continue;
        const sy = Math.round(SH - (pl.y - game.camY) * k);
        rows.push([Math.round((pl.x - viewLeft) * k), Math.round((pl.x + pl.w - viewLeft) * k), sy]);
      }
      // Counted by row relative to the surface, from two above it to six below: a changed
      // pixel ABOVE the surface is the trail seen past the tile's edge, not on it.
      let n = 0, inBox = 0, onLedge = 0;
      const byRow = new Map();
      for (let y = 0; y < SH; y++) {
        for (let x = 0; x < SW; x++) {
          const o = (y * SW + x) * 4;
          if (withT[o] === without[o] && withT[o + 1] === without[o + 1] && withT[o + 2] === without[o + 2]) continue;
          n++;
          if (x >= bx0 && x < bx1 && y >= by0 && y < by1) inBox++;
          for (const r of rows) {
            if (x < r[0] || x >= r[1] || y < r[2] - 2 || y > r[2] + 6) continue;
            if (y >= r[2]) onLedge++;
            byRow.set(y - r[2], (byRow.get(y - r[2]) || 0) + 1);
            break;
          }
        }
      }
      const hist = [...byRow].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d >= 0 ? '+' : ''}${d}:${c}`).join(' ');
      Object.assign(info, { px: n, inBox, boxArea: (bx1 - bx0) * (by1 - by0), onLedge, hist });
    }

    ctx.setTransform(PX, 0, 0, PX, 0, 0);
    if (game.state === STATE.PLAYING && !NOHUD) drawHud(ctx, game, all, t);
    info.data = snapshot();
    shots.push(info);
    nextShot += EVERY;
    if (game.state !== STATE.PLAYING) break;
  }
  return shots;
}

const N = Math.max(COMBOS.length, FLOORS.length);
const cols = Array.from({ length: N }, (_, i) =>
  capture(COMBOS[Math.min(i, COMBOS.length - 1)], FLOORS[Math.min(i, FLOORS.length - 1)]));
if (!cols.every((s) => s.length)) { console.log('  nothing rendered -- a run ended before the requested time'); process.exit(1); }

let cw = SW, ch = SH, box = null;
if (CROP && CROP !== true) {
  const [x, y, w, h] = String(CROP).split(',').map(Number);
  box = { x, y, w, h };
} else if (FOLLOW) box = { x: 0, y: 0, w: BW, h: BH };
if (box) { cw = box.w; ch = box.h; }
const GAP = cols.length > 1 ? 4 : 0;
const rowsN = Math.max(...cols.map((s) => s.length));
const sheet = new HeadlessCanvas(cols.length * (cw + GAP) - GAP, rowsN * ch);
const shd = sheet.data;
cols.forEach((shots, ci) => shots.forEach((s, i) => {
  const ox = !box ? 0 : FOLLOW ? Math.max(0, Math.min(SW - box.w, s.cx - (box.w >> 1))) : box.x;
  const oy = !box ? 0 : FOLLOW ? Math.max(0, Math.min(SH - box.h, s.cy - (box.h >> 1))) : box.y;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const sx = ox + x, sy = oy + y;
      if (sx < 0 || sx >= SW || sy < 0 || sy >= SH) continue;
      const si = (sy * SW + sx) * 4, di = ((i * ch + y) * sheet.width + ci * (cw + GAP) + x) * 4;
      shd[di] = s.data[si]; shd[di + 1] = s.data[si + 1];
      shd[di + 2] = s.data[si + 2]; shd[di + 3] = s.data[si + 3];
    }
  }
}));
fs.writeFileSync(OUT, encodePNG(SCALE > 1 ? upscale(sheet, SCALE) : sheet));
console.log(`  ${path.resolve(OUT)}  ${sheet.width * SCALE}x${sheet.height * SCALE}`);
cols.forEach((shots, ci) => {
  for (const s of shots) {
    const m = s.px !== undefined
      ? `  trail px ${s.px}, in his box ${s.inBox} (${(100 * s.inBox / s.boxArea).toFixed(2)}%),` +
        ` on ledge tops ${s.onLedge}${s.hist ? ` (rows from the surface ${s.hist})` : ''},` +
        ` trail draw ${s.trailMs.toFixed(2)} ms`
      : '';
    console.log(`  [${ci}] t=${s.t.toFixed(2)} ${s.zone} floor ${s.floor} zoom ${s.zoom} chain ${s.combo}` +
      `  pieces ${s.alive} drawImage ${s.draws} frame ${s.drawMs.toFixed(1)} ms${m}`);
  }
});
