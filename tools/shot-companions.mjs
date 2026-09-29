// The six companions: every pose each, and all of them standing beside the Duke.
//
//   node tools/shot-companions.mjs
//   node tools/shot-companions.mjs --scale=3
//   node tools/shot-companions.mjs --play      them IN PLAY: one crop per pose chosen
//
// TWO THINGS THIS HAS TO SHOW, and the old one showed neither.
//
// First, every pose BY NAME. They have ten each and for a long time only three of them
// could ever appear, which nobody noticed because no view put the ten side by side.
//
// Second, their sizes RELATIVE TO EACH OTHER AND TO HIM. They are six people drawn on six
// sheets at six scales, imported by matching their standing heights, and the failure mode
// is silent: scale by the tallest frame instead and the halfling comes out exactly as tall
// as the shield-maiden. The Duke stands in the same strip because he has to trump them,
// and a number in a file does not tell you whether he does.
//
// Laid out at the ART size. An earlier version used the WORLD size -- a quarter of it --
// and drew every companion four times too small into a row four times too short, so the
// sheet overlapped its own labels for a week.

import fs from 'node:fs';
import { installDom, HeadlessCanvas, encodePNG } from './headless.mjs';

installDom();

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return dflt;
  const eq = hit.indexOf('=');
  return eq < 0 ? true : hit.slice(eq + 1);
};
const Z = Number(flag('scale', 2));

// --play: REAL FRAMES OF THEM IN PLAY, one crop per pose the renderer chose, labelled
// with the state it chose it from. The sheet below proves the drawings exist; this proves
// the game picks the right one. For a long time only three of ten could ever appear and
// nothing showed it, because nothing looked at them in play.
if (flag('play', false)) {
  const { Game, STATE } = await import('../src/game/game.js');
  const { AutoInput, AutoPlayer } = await import('../src/game/autoplay.js');
  const { Renderer } = await import('../src/render/renderer.js');
  const { STEP } = await import('../src/core/loop.js');
  const { SW, SH, PX, CX, VW, FLOOR_H } = await import('../src/game/constants.js');
  const { drawText } = await import('../src/render/font.js');
  const canvas = new HeadlessCanvas(SW, SH);
  const input = new AutoInput();
  const game = new Game(input);
  const bot = new AutoPlayer(input);
  game.demo = true;
  game.newRun(0x2f6f1b21 + 7919);
  const renderer = new Renderer(canvas);
  renderer.applySettings({ scaleMode: 'integer', scanlines: false, particles: 'low',
    streaks: false, shake: false, trails: false, showFps: false, music: false });
  const WANT = ['idle', 'run', 'jump', 'fall', 'land'], PER = 3, BW = 300, BH = 300, LAB = 40;
  const got = {}, shots = [];
  let t = 0, lastPick = -1;
  for (let i = 0; i < 400000 && shots.length < WANT.length * PER && game.state === STATE.PLAYING; i++) {
    bot.step(game, STEP); game.step(STEP); t += STEP;
    const c = game.companions.active.find((k) => k.state === 'climbing');
    if (!c || t - lastPick < 0.4) continue;
    // Only frames where they can be SEEN. The crop is clamped to the screen, so a
    // companion off the edge came out as an empty square of tower labelled with a pose
    // -- two cells in fifteen, the first time this was looked at.
    if (c.y < game.camY || c.y > game.camY + game.viewH - 34) continue;
    renderer.t = t;
    const pose = renderer.companionPose(c);
    const cat = pose.replace(/[0-9]$/, '');
    if (!WANT.includes(cat) || (got[cat] || 0) >= PER) continue;
    got[cat] = (got[cat] || 0) + 1;
    lastPick = t;
    renderer.draw(game, 1, 0);
    const z = game.zoomView || game.zoom, k = PX * z, left = CX - (VW / z) / 2;
    const state = c.airborne ? `AIR VY ${c.vy.toFixed(0)}`
      : (Math.abs(c.walkV) > 12 ? `WALK ${c.walkV.toFixed(0)}` : (c.landT > 0 ? 'LANDED' : 'STAND'));
    shots.push({ data: Uint8ClampedArray.from(canvas.data), pose, state,
      sx: Math.round((c.x - left) * k), sy: Math.round(SH - (c.y - game.camY) * k) - 60,
      gap: ((c.y - game.player.y) / FLOOR_H).toFixed(1) });
  }
  shots.sort((a, b) => WANT.indexOf(a.pose.replace(/[0-9]$/, '')) - WANT.indexOf(b.pose.replace(/[0-9]$/, '')));
  const sheet = new HeadlessCanvas(PER * (BW + 6), WANT.length * (BH + LAB + 6));
  const g = sheet.getContext('2d');
  g.fillStyle = '#101018';
  g.fillRect(0, 0, sheet.width, sheet.height);
  const row = {}, shd = sheet.data;
  for (const s of shots) {
    const cat = s.pose.replace(/[0-9]$/, '');
    const col = (row[cat] = (row[cat] ?? -1) + 1);
    const ox = col * (BW + 6), oy = WANT.indexOf(cat) * (BH + LAB + 6);
    const x0 = Math.max(0, Math.min(SW - BW, s.sx - BW / 2)), y0 = Math.max(0, Math.min(SH - BH, s.sy - BH / 2));
    for (let y = 0; y < BH; y++) {
      for (let x = 0; x < BW; x++) {
        const si = ((y0 + y) * SW + x0 + x) * 4, di = ((oy + y) * sheet.width + ox + x) * 4;
        shd[di] = s.data[si]; shd[di + 1] = s.data[si + 1];
        shd[di + 2] = s.data[si + 2]; shd[di + 3] = 255;
      }
    }
    drawText(g, `${s.pose}  ${s.state}`, ox + 4, oy + BH + 4, '#ffe23d', 2);
    drawText(g, `GAP ${s.gap} FLOORS`, ox + 4, oy + BH + 22, '#8a8fa8', 2);
  }
  fs.writeFileSync('companions-play.png', encodePNG(sheet));
  console.log(`  companions-play.png  ${sheet.width}x${sheet.height}  ` +
    WANT.map((w) => `${w} ${got[w] || 0}`).join(', '));
  process.exit(0);
}

const C = await import('../src/render/compsprites.js');
const S = await import('../src/render/sprites.js');
const { drawText, textWidth } = await import('../src/render/font.js');
const { PX } = await import('../src/game/constants.js');

const BG = '#15101f', PANEL = '#1e1830';
const GOLD = '#ffe23d', DIM = '#8a8fa8', WHITE = '#e8e4f0';

/** The standing height of a pose in art pixels: what the eye actually compares. */
function inkHeight(canvasLike) {
  const { w, h, data } = canvasLike;
  let top = -1, bot = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) { if (top < 0) top = y; bot = y; break; }
    }
  }
  return bot - top + 1;
}
const inkOf = (cv) => {
  const g = cv.getContext('2d');
  return inkHeight({ w: cv.width, h: cv.height, data: g.getImageData(0, 0, cv.width, cv.height).data });
};

const ids = C.COMPANION_IDS;
const poses = C.COMP_POSE_NAMES;

// --- the scale strip: him and all six, feet on one line -------------------------
const dukeCv = (() => {
  const grid = S.FRAMES.idle0;
  const c = document.createElement('canvas');
  c.width = S.SPR_W; c.height = S.SPR_H;
  const g = c.getContext('2d');
  for (let y = 0; y < S.SPR_H; y++) {
    let x = 0;
    while (x < S.SPR_W) {
      const col = grid[y][x];
      if (!col) { x++; continue; }
      let run = 1;
      while (x + run < S.SPR_W && grid[y][x + run] === col) run++;
      g.fillStyle = col; g.fillRect(x, y, run, 1);
      x += run;
    }
  }
  return c;
})();

const strip = [{ id: 'DUKE VYTIS', cv: dukeCv, w: S.SPR_W, h: S.SPR_H }]
  .concat(ids.map((id) => {
    const cv = C.canvasFor(id, 'idle0');
    return { id: C.COMPANION_NAMES[id], cv, w: cv.width, h: cv.height };
  }));
strip.forEach((s) => { s.ink = inkOf(s.cv); });

const PAD = 10, LABEL = 22;
/** A caption's width in the art units this layout uses, at the scale it is drawn. */
const capW = (str) => Math.ceil(textWidth(str, Z) / Z);
// A slot is as wide as the WIDER of the figure and its caption. Sized by the figure
// alone, the captions ran into each other and the strip read as one long word.
const stripH = Math.max(...strip.map((s) => s.h));
strip.forEach((s) => {
  const sub = `${s.ink} PX${s.id.startsWith('DUKE') ? '' : `  ${Math.round((s.ink / strip[0].ink) * 100)}% OF HIM`}`;
  s.sub = sub;
  // Measured at the scale the caption is DRAWN at, then back into the art units this
  // layout is in. It used to ask textWidth for the width at scale 1 while `text()` draws
  // at scale Z, and a pixel font grows faster than its scale -- the tracking between
  // glyphs is added on top -- so at the default Z of 2 every caption came out about a
  // sixth wider than the slot it was given. Left-aligned inside PAD, that ran the last
  // words of one caption into the first of the next: "73% OF HIM129 PX".
  s.slot = Math.max(s.w, capW(s.id), capW(sub)) + PAD * 2;
});
const stripW = strip.reduce((t, s) => t + s.slot, 0);

// --- the pose grid --------------------------------------------------------------
const cellW = Math.max(...ids.map((id) => C.canvasFor(id, 'idle0').width)) + 6;
const cellH = Math.max(...ids.map((id) => C.canvasFor(id, 'idle0').height));
const NAMEW = 130;
const gridW = NAMEW + cellW * poses.length + PAD * 2;
const rowH = cellH + LABEL + 8;

const W = Math.max(stripW + PAD * 2, gridW);
const H = 48 + stripH + LABEL + 26 + 22 + rowH * ids.length + PAD;

const sheet = new HeadlessCanvas(W * Z, H * Z);
const g = sheet.getContext('2d');
g.fillStyle = BG;
g.fillRect(0, 0, sheet.width, sheet.height);

const blit = (cv, dx, dy) => {
  const px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  for (let y = 0; y < cv.height; y++) {
    let x = 0;
    while (x < cv.width) {
      const n = (y * cv.width + x) * 4;
      if (px[n + 3] <= 8) { x++; continue; }
      let run = 1;
      const same = () => {
        const m = (y * cv.width + x + run) * 4;
        return px[m + 3] > 8 && px[m] === px[n] && px[m + 1] === px[n + 1] && px[m + 2] === px[n + 2];
      };
      while (x + run < cv.width && same()) run++;
      g.fillStyle = `rgb(${px[n]},${px[n + 1]},${px[n + 2]})`;
      g.fillRect((dx + x) * Z, (dy + y) * Z, run * Z, Z);
      x += run;
    }
  }
};
const text = (s, x, y, col, sc = 1) => drawText(g, s, x * Z, y * Z, col, sc * Z, 'left');

text('THE COMPANIONS - EVERY POSE, AND HOW BIG THEY ARE NEXT TO HIM', 10, 8, GOLD, 2);
text('ART PIXELS. ONE ART PIXEL IS ONE SCREEN PIXEL, SO THESE ARE THE SIZES ON SCREEN.',
  10, 28, DIM, 1);

// scale strip, every figure standing on one baseline
let sx = PAD;
const baseY = 48 + stripH;
g.fillStyle = PANEL;
g.fillRect(0, 44 * Z, sheet.width, (stripH + LABEL + 8) * Z);
for (const s of strip) {
  blit(s.cv, sx + Math.floor((s.slot - s.w) / 2), baseY - s.h);
  text(s.id, sx + PAD, baseY + 4, s.id.startsWith('DUKE') ? GOLD : WHITE, 1);
  text(s.sub, sx + PAD, baseY + 14, DIM, 1);
  sx += s.slot;
}
g.fillStyle = '#4a4266';
g.fillRect(0, baseY * Z, sheet.width, Z);

// pose grid
let y = 48 + stripH + LABEL + 26;
text('EVERY POSE, BY NAME', PAD, y - 14, WHITE, 1);
poses.forEach((p, i) => text(p.toUpperCase(), NAMEW + i * cellW + 2, y - 4, DIM, 1));
y += 6;
ids.forEach((id, r) => {
  const ty = y + r * rowH;
  if (r % 2) { g.fillStyle = PANEL; g.fillRect(0, ty * Z, sheet.width, rowH * Z); }
  text(C.COMPANION_NAMES[id], PAD, ty + cellH / 2 - 8, GOLD, 1);
  const sz = C.compSize(id);
  text(`${sz.w}x${sz.h} WORLD`, PAD, ty + cellH / 2 + 2, DIM, 1);
  poses.forEach((p, i) => {
    const cv = C.canvasFor(id, p);
    const dx = NAMEW + i * cellW + Math.floor((cellW - cv.width) / 2);
    blit(cv, dx, ty + cellH - cv.height);
  });
  g.fillStyle = '#332b4d';
  g.fillRect(NAMEW * Z, (ty + cellH) * Z, (sheet.width / Z - NAMEW) * Z, Z);
});

fs.writeFileSync('companions.png', encodePNG(sheet));
console.log(`  companions.png  ${sheet.width}x${sheet.height}`);
console.log(`  duke idle0 ${strip[0].ink} px tall; companions ` +
  strip.slice(1).map((s) => `${s.id.split(' ').pop()} ${s.ink}`).join(', '));
console.log('  world sizes: ' + ids.map((id) => {
  const s = C.compSize(id); return `${id} ${s.w}x${s.h}`;
}).join('  '));
