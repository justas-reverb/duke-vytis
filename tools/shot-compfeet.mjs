// WHERE A COMPANION'S BOOTS END, blown up until you can count the rows.
//
//   node tools/shot-compfeet.mjs --art                    the bottom rows of every standing pose, x8
//   node tools/shot-compfeet.mjs --ledge --id=pilgrim     those poses standing on a ledge, x8
//   node tools/shot-compfeet.mjs --ledge --raw            ...anchored on the cell bottom, as it was
//   --id=<name> --zone=DOWNTOWN --zoom=1 --facing=both --mag=8 --out=<dir> --tag=<word>
//
// The six of them are IMPORTED art and the importer bottom-aligns each cell on its lowest
// ink. For five of them that lowest ink is a boot and the cell bottom is the sole. For the
// pilgrim it is the TIP OF HIS STAFF, which he plants a pixel below his own feet in three
// of his six standing drawings -- so hung from the cell bottom he stood on the staff and
// his boots hovered over every ledge he ever waited on.
//
// No rule of thumb finds that tip: it is one pixel wide in idle0 and land and five in
// idle1, and a real boot toe is two (archer idle1, maiden land, the pilgrim's own run1).
// Counting ink cannot tell a 5 px staff foot from a 2 px toe. A person can, and this is
// what they look at to do it -- COMP_BOOT_ROW in src/render/compsprites.js is written
// from these crops, and tools/test-companions.mjs holds the anchor to it.
//
// --art is the measurement: art pixels, one cell each, no ledge, over magenta.
// --ledge is the proof: the real blit at a real world scale over a real deck, cropped to
// the feet. DOWNTOWN's deck is flat and pale, which is why a gap under a sole shows on it
// and never showed on the grassy ledges the companions were first seen on.
//
// --raw stands the figure the drop's own height higher, which puts the cell bottom back
// on the ledge -- exactly what the renderer did before the drop existed. That is the
// BEFORE picture, and it stays in the tool so both can be taken the same way, through the
// same blit, rather than one of them through code that no longer exists.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installDom, HeadlessCanvas, encodePNG } from './headless.mjs';

installDom();

const { PX, VW, WALL_W, ARENA_HALF_MIN, ARENA_HALF_MAX } = await import('../src/game/constants.js');
const { COMPANION_IDS, COMP_POSE_NAMES, COMP_GROUND_POSES, COMP_BOOT_ROW, compArt,
        compSize, canvasFor, compFootDrop, drawCompanion } = await import('../src/render/compsprites.js');
const { platArt, CAP_W, TILE_W, CELL_H, HEAD } = await import('../src/render/platsprites.js');
const { drawText } = await import('../src/render/font.js');

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return dflt;
  const eq = hit.indexOf('=');
  return eq < 0 ? true : hit.slice(eq + 1);
};

const MAG = Number(flag('mag', 8));
const ZONE = String(flag('zone', 'DOWNTOWN'));
const TAG = String(flag('tag', flag('raw', false) ? 'before' : 'after'));
const OUT = String(flag('out', path.join(os.tmpdir(), 'compfeet')));
const RAW = !!flag('raw', false);
const IDS = flag('id', false) ? [String(flag('id'))] : COMPANION_IDS;
const POSES = COMP_POSE_NAMES.filter((p) => COMP_GROUND_POSES.has(p));

fs.mkdirSync(OUT, { recursive: true });

// Nearest-neighbour copy of a rectangle of one canvas into another, magnified. Pixel art
// is only ever magnified by a whole number here; anything else would soften the edge that
// is the thing being looked at.
function blit(dst, src, sx, sy, sw, sh, dx, dy, mag) {
  const dd = dst.data, sd = src.data;
  for (let y = 0; y < sh * mag; y++) {
    const yy = sy + Math.floor(y / mag);
    for (let x = 0; x < sw * mag; x++) {
      const xx = sx + Math.floor(x / mag);
      const d = ((dy + y) * dst.width + dx + x) * 4;
      if (dy + y < 0 || dy + y >= dst.height || dx + x < 0 || dx + x >= dst.width) continue;
      if (xx < 0 || yy < 0 || xx >= src.width || yy >= src.height) {
        dd[d] = 24; dd[d + 1] = 24; dd[d + 2] = 28; dd[d + 3] = 255;
        continue;
      }
      const s = (yy * src.width + xx) * 4;
      dd[d] = sd[s];
      dd[d + 1] = sd[s + 1];
      dd[d + 2] = sd[s + 2];
      dd[d + 3] = sd[s + 3];
    }
  }
}

function fill(cv, r, g, b) {
  const d = cv.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  }
}

/** The horizontal span of the last `rows` rows of a pose's art, padded. */
function bottomSpan(id, pose, rows, pad) {
  const a = compArt(id);
  const f = a.FRAMES[COMP_POSE_NAMES.indexOf(pose)];
  let min = a.SPR_W, max = -1;
  for (let y = a.SPR_H - rows; y < a.SPR_H; y++) {
    const r = f[y] || '';
    for (let x = 0; x < r.length; x++) {
      if (r[x] && r[x] !== '.') { if (x < min) min = x; if (x > max) max = x; }
    }
  }
  if (max < 0) return { x0: 0, x1: a.SPR_W - 1 };
  return { x0: Math.max(0, min - pad), x1: Math.min(a.SPR_W - 1, max + pad) };
}

// ---------------------------------------------------------------- art mode

if (flag('art', false)) {
  const ROWS = 8;                      // art rows shown, counting up from the cell bottom
  const LABEL = 11;                    // a caption band over each pose
  const GUT = 46;                      // room for the row numbers down the left
  for (const id of IDS) {
    const a = compArt(id);
    const spans = POSES.map((p) => bottomSpan(id, p, ROWS, 3));
    const wide = Math.max(...spans.map((s) => s.x1 - s.x0 + 1));
    const W = GUT + wide * MAG + 8;
    const H = POSES.length * (ROWS * MAG + LABEL) + 14;
    const out = new HeadlessCanvas(W, H);
    fill(out, 18, 18, 22);
    const g = out.getContext('2d');
    drawText(g, `${id}  ${a.SPR_W}x${a.SPR_H}  bottom ${ROWS} rows  x${MAG}`, 4, 4, '#ffffff', 1);

    // Each pose gets its own little canvas at art scale, over magenta, so a transparent
    // pixel under a sole is not mistaken for a dark one.
    POSES.forEach((pose, i) => {
      const s = spans[i];
      const cell = new HeadlessCanvas(a.SPR_W, a.SPR_H);
      fill(cell, 255, 0, 255);
      cell.getContext('2d').drawImage(canvasFor(id, pose), 0, 0);
      const top = 14 + i * (ROWS * MAG + LABEL);
      const boot = (COMP_BOOT_ROW[id] || {})[pose];
      drawText(g, `${pose}  cols ${s.x0}-${s.x1}` + (boot === undefined ? '' : `  boot row ${boot}`),
        GUT, top + 2, '#ffe9d6', 1);
      blit(out, cell, s.x0, a.SPR_H - ROWS, s.x1 - s.x0 + 1, ROWS, GUT, top + LABEL, MAG);
      for (let r = 0; r < ROWS; r++) {
        const row = a.SPR_H - ROWS + r;
        const y = top + LABEL + r * MAG + Math.floor((MAG - 7) / 2);
        drawText(g, String(row), GUT - 6, y, boot === row ? '#7dff5a' : '#8f9cb5', 1, 'right');
      }
    });
    const f = path.join(OUT, `art-${id}-${TAG}.png`);
    fs.writeFileSync(f, encodePNG(out));
    console.log('wrote ' + f);
  }
}

// -------------------------------------------------------------- ledge mode

if (flag('ledge', false)) {
  // Every rest zoom: the whole world scales the arena quantises to, as test-sprites does.
  const kLo = Math.round(PX * VW / (2 * ARENA_HALF_MAX + 2 * WALL_W));
  const kHi = Math.round(PX * VW / (2 * ARENA_HALF_MIN + 2 * WALL_W));
  const zoomArg = flag('zoom', false);
  const ks = zoomArg ? [Math.round(Number(zoomArg) * PX)] : [];
  for (let k = kLo; !zoomArg && k <= kHi; k++) ks.push(k);
  const facings = flag('facing', 'right') === 'both' ? [false, true]
    : flag('facing', 'right') === 'left' ? [true] : [false];

  const art = platArt(ZONE);
  const u = 1 / PX;
  const LEDGE = 40;                    // world units; any whole ledge top will do
  // The window kept around the feet, in SCREEN pixels, so every zoom is shown at the
  // size it actually reaches the screen at rather than normalised back to art pixels: at
  // zoom 2 an art pixel is two of these and a one-pixel hover is two rows of sky.
  const CROPW = 48, CROPH = 13;        // 9 rows of air over the ledge, 4 of deck under it
  const LABEL = 11;

  for (const id of IDS) {
    const { w: CW, h: CH } = compSize(id);
    for (const flip of facings) {
      const cells = [];
      for (const pose of POSES) {
        for (const k of ks) {
          const W = Math.ceil((CW + 40) * k), H = Math.ceil((LEDGE + CH + 8) * k);
          const cv = new HeadlessCanvas(W, H);
          fill(cv, 255, 0, 255);
          const g = cv.getContext('2d');
          const tx = Math.round(W / 2), ty = Math.round(H - 8 * k);
          g.setTransform(k, 0, 0, -k, tx, ty);

          // The deck, laid out exactly as drawPlatforms lays it: the cell's standing
          // surface is HEAD art pixels down from its top row, so the top row sits that
          // far above the world y the ledge is at.
          g.save();
          g.scale(1, -1);
          const dy = -(LEDGE + HEAD * u);
          const half = (CW + 40) / 2;
          g.drawImage(art.left, 0, 0, CAP_W, CELL_H, -half, dy, CAP_W * u, CELL_H * u);
          for (let x = -half + CAP_W * u; x < half; x += TILE_W * u) {
            g.drawImage(art.tile, 0, 0, TILE_W, CELL_H, x, dy, TILE_W * u, CELL_H * u);
          }
          g.restore();

          // The y flip is the caller's, exactly as in renderer.drawCompanions: inside it
          // the blit's own downward y runs with the screen again. Forgetting it here drew
          // the man a cell-height off the top of the canvas and left a picture of an empty
          // deck that looked, for a moment, like a sprite that would not rasterise.
          // RAW lifts him back onto the cell bottom: the drop undone, not bypassed.
          g.save();
          g.scale(1, -1);
          drawCompanion(g, id, pose, 0, LEDGE + (RAW ? compFootDrop(id, pose) : 0), flip, null);
          g.restore();

          // Crop on the feet: the columns the drawing's own bottom rows occupy, which is
          // where a hovering sole shows, not the middle of the sprite.
          const span = bottomSpan(id, pose, 6, 0);
          const a = compArt(id);
          let mid = ((span.x0 + span.x1) / 2 + 0.5 - a.SPR_W / 2) * u;
          if (flip) mid = -mid;
          const sx = Math.round(tx + mid * k - CROPW / 2);
          const sy = Math.round(ty - LEDGE * k) - (CROPH - 4);
          cells.push({ k, pose, sx, sy, cv });
        }
      }
      const cols = ks.length;
      const W = 8 + cols * (CROPW * MAG + 8);
      const H = 14 + POSES.length * (CROPH * MAG + LABEL + 8);
      const out = new HeadlessCanvas(W, H);
      fill(out, 18, 18, 22);
      const g = out.getContext('2d');
      drawText(g, `${id} on a ${ZONE} deck, facing ${flip ? 'left' : 'right'}, x${MAG} ` +
        `-- ${RAW ? 'CELL BOTTOM on the ledge (before)' : 'BOOTS on the ledge (after)'}`,
        4, 4, '#ffffff', 1);
      cells.forEach((c, i) => {
        const r = Math.floor(i / cols), col = i % cols;
        const dx = 8 + col * (CROPW * MAG + 8);
        const dy = 14 + r * (CROPH * MAG + LABEL + 8);
        drawText(g, `${c.pose} zoom ${c.k / PX}`, dx, dy, '#ffe9d6', 1);
        blit(out, c.cv, c.sx, c.sy, CROPW, CROPH, dx, dy + LABEL, MAG);
      });
      const f = path.join(OUT, `ledge-${id}-${ZONE}-${flip ? 'left' : 'right'}-${TAG}.png`);
      fs.writeFileSync(f, encodePNG(out));
      console.log('wrote ' + f);
    }
  }
}
