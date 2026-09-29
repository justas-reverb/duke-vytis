// The end of a run: the game over screen in the style of the zone the run ended in, every
// word of it and of the fall before it legible, painted ahead, and never covered by what the
// death left behind.
//
//   node tools/test-gameover.mjs
//
// WHAT IT HOLDS IT TO (src/ui/screens.js drawGameOver and drawFallWords, src/render/
// gameoverskin.js; the deaths are staged and drawn by tools/shot-gameover.mjs, the way
// src/main.js draws each state)
//
//   1. EVERY ZONE   every name in THEMES has a HUD skin and a title painter of its own (the
//                   board falls back to BASEMENT's skin silently), and once painted its board
//                   has every piece -- the two title words and the four panels -- none of them
//                   empty and none the same picture as another zone's (compared pixel for
//                   pixel across all twelve), and each panel's well is opaque over its whole
//                   inside box.
//   2. NOTHING OVER THE WORDS
//                   every combination of: the twelve zones; a splat and a dazed fall (below
//                   floor 200 the daze is natural, above it forced -- the layout must hold for
//                   any body); facing right and left; the narrow start arena (zoom 2, the body
//                   twice the size) and the open one; a board with a first run's records and
//                   three awards and a board with none. Plus SPACE cutting the fall short at
//                   0.1, 0.6 and 1.5 s -- the board comes up with him frozen mid-tumble low in
//                   the view, and the fall's debris wherever it was -- deaths against either
//                   wall, and the fall itself: mid-fall with SPACE TO SKIP up, and the impact
//                   hold 0.05 to 1 s after the landing, when a splat's pieces fly across the
//                   top of the screen. Each is drawn twice, seeded and with the clock pinned:
//                   as the game draws it, and with the Duke, his pieces, the blood, the
//                   companions, their calls, the floaters and every particle left out; the
//                   pixels that differ are where any of them shows. The WORDS are read off the
//                   board's own drawImage calls: every pixel the menus' lettering puts down (a
//                   glyph's letter or keyline, a keycap, a lettered line and its bed, the
//                   prompt, its glow and glint) or a title word does. Not one differing pixel
//                   may fall on a word that is up, in any frame (a word still fading in is
//                   see-through by design, and held to fading whole in 4). To prove the measure bites, the same frames are drawn
//                   once more with the body and the rest drawn OVER the words, and that must
//                   put pixels on them (a third of the deaths, for time). And every word of the BOARD must lie inside the opaque
//                   well of a panel -- the guarantee itself, checked apart from any staging.
//                   And every word must end the frame exactly as it was lettered: only other
//                   lettering may be drawn over a word's letters or keyline, never a later
//                   panel, its dressing or an overlay -- which neither check above can see.
//                   And nothing on the board or in the fall is lettered in the old font:
//                   not one glyph drawn from font.js's flat atlases (drawText) in any frame.
//   3. LEGIBLE      in every zone, in the frame as drawn: each line of the menus' glyphs --
//                   its letters (the font's blocks where they were drawn) against the
//                   brightest tenth of their keyline, WCAG contrast of the letters' median
//                   4.5:1 or better and of their darkest pixel 3:1 -- the board's lines and the
//                   impact's (the verdict, the floor, measured once faded in); each LETTERED
//                   word (SPLAT or OOF, SPACE TO CLIMB AGAIN) the same against its bed; each
//                   keycap's legend against its face, 3:1; the title's letters (its opaque
//                   pixels brighter than its outline and shadow, luminance 0.03) against the
//                   median of the plaque behind them across the word's box, 3:1 (large text).
//   4. FADES IN WHOLE
//                   the impact's words (SPLAT or OOF, the verdict, FLOOR N, SPACE) in the first
//                   frame of the impact and through the fade, in three zones, a splat and a
//                   daze: each word is drawn as ONE picture at the fade's alpha -- every pixel
//                   of it the scene and the finished word mixed at that alpha, to a unit --
//                   never its letters or keyline at an alpha of their own; and in the first
//                   frame no word moves the scene more than its alpha allows. They used to
//                   come up as black stencils: the keyline whole from the first frame. And
//                   SPACE TO SKIP, drawn at its fade's alpha a piece at a time: every piece at
//                   one alpha, no two overlapping, every pixel the scene and the piece mixed.
//
// That the board is painted AHEAD -- never in the fall, never on its first frame -- is
// tools/test-boardwarm.mjs. The deaths staged here paint their zone's board first
// (shot-gameover.mjs stageDeath), as the game has by the time a run ends there.
//
// Everything is seeded, so a failure reproduces.

import { M, stageDeath, boardData, makeRenderer, drawFrame } from './shot-gameover.mjs';

const GS = await import('../src/render/gameoverskin.js');
const MS = await import('../src/render/menuskin.js');
const { HUD_ZONES } = await import('../src/render/hudpaint.js');
const { TITLE_PAINTERS } = await import('../src/render/titlepaint/index.js');
const { GLYPHS, GW, GH, CELL } = await import('../src/render/font.js');

const { PX, SW, SH, THEMES, STATE } = M;
let fails = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) fails++; return cond; };
const t0 = Date.now();

const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (d, i) => 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const pct = (arr, p) => { const s = Float64Array.from(arr).sort(); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const PANEL_KEYS = Object.keys(GS.PANELS);

// --- 1. every zone has its style ----------------------------------------------------------
const PIECES = [...GS.TITLE_WORDS.map((w) => 'word' + w), ...PANEL_KEYS];
const canvasOf = (p) => (p && p.c ? p.c : p);
function fingerprint(cv) {
  let h = 2166136261, n = 0;
  const d = cv.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    n++;
    h = Math.imul(h ^ d[i] ^ (d[i + 1] << 8) ^ (d[i + 2] << 16) ^ ((i >> 2) << 3), 16777619);
  }
  return { h: h >>> 0, n };
}
{
  const missing = THEMES.filter((t) => !Object.prototype.hasOwnProperty.call(HUD_ZONES, t.name) ||
    !TITLE_PAINTERS[t.name]).map((t) => t.name);
  ok(!missing.length, `every zone has a HUD skin and a title painter (${THEMES.length} zones` +
    (missing.length ? `; missing: ${missing.join(', ')}` : '') + ')');
  const seen = new Map();
  const empty = [], dup = [], leaky = [];
  for (const th of THEMES) {
    const s = GS.warmBoardNow(th);
    if (s.spec !== HUD_ZONES[th.name]) empty.push(`${th.name} wears another zone's skin`);
    for (const k of PIECES) {
      const cv = canvasOf(s.parts[k]);
      const f = cv && cv.data ? fingerprint(cv) : { n: 0 };
      if (!f.n) { empty.push(`${th.name}.${k}`); continue; }
      const key = `${k}:${f.h}:${f.n}`;
      if (seen.has(key)) dup.push(`${th.name}.${k} = ${seen.get(key)}.${k}`);
      else seen.set(key, th.name);
    }
    for (const k of PANEL_KEYS) {
      const f = s.parts[k], p = GS.PANELS[k];
      let clear = 0;
      const d = f.c.data, cw = f.c.width;
      for (let y = 0; y < p.h * PX; y++) {
        for (let x = 0; x < p.w * PX; x++) if (d[((f.oy + y) * cw + f.ox + x) * 4 + 3] !== 255) clear++;
      }
      if (clear) leaky.push(`${th.name}.${k} ${clear} px`);
    }
  }
  ok(!empty.length, `every zone's board has all ${PIECES.length} pieces, none empty` + (empty.length ? `: ${empty.slice(0, 6).join(', ')}` : ''));
  ok(!dup.length, 'no piece of one zone\'s board is the same picture as another zone\'s' + (dup.length ? `: ${dup.slice(0, 6).join(', ')}` : ''));
  ok(!leaky.length, `every panel's well is opaque over its whole inside box (${THEMES.length * PANEL_KEYS.length} panels)` +
    (leaky.length ? `: ${leaky.slice(0, 6).join(', ')}` : ''));
}

// --- the words, as the board draws them ---------------------------------------------------
// Which canvas is what: every piece of the menus' lettering (menuskin.js, read off its own
// record of what it painted), each title word and each panel of the zone on screen.
// drawImage calls from the lettering and the title words ARE the words.
function sources(skin) {
  const m = new Map();
  for (const [key] of MS.menuStats().pieces) {
    const a = MS.menuPiece(key);
    if (!a) continue;
    if (key.startsWith('ink:')) m.set(a, { kind: 'glyph', role: key.slice(4) });
    else if (key.startsWith('cap:')) m.set(a.c, { kind: 'cap', label: key.slice(4) });
    else if (key.startsWith('line:')) { m.set(a.c, { kind: 'line', key, a }); m.set(a.glint, { kind: 'glint' }); }
    else if (key === 'prompt' || key.startsWith('prompt:')) {
      m.set(a.c, { kind: 'prompt', key, a });
      m.set(a.glow, { kind: 'glow' });
      m.set(a.glint, { kind: 'glint' });
    }
  }
  for (const w of GS.TITLE_WORDS) m.set(skin.parts['word' + w].c, { kind: 'title', word: skin.parts['word' + w] });
  for (const k of PANEL_KEYS) m.set(skin.parts[k].c, { kind: 'panel', key: k, f: skin.parts[k] });
  return m;
}
/** A font.js atlas (drawText's): the whole character set, one flat colour, GH rows tall. */
const oldFont = (img) => img && img.height === GH && img.width === Object.keys(GLYPHS).length * CELL;
/**
 * Draw a frame while recording every word and panel it puts down, in backing pixels. A word
 * fading in is drawn whole from a picture of it (gameoverskin.js fadeLayer, marked with
 * `boardWord`): recorded as kind 'fade', with the alpha it was drawn at. And every glyph drawn
 * from the old font's atlases.
 */
function record(r, game, data, uiT, opts) {
  const src = sources(GS.boardSkinFor(game));
  const words = [], panels = [];
  let old = 0;
  const di = r.ctx.drawImage;
  r.ctx.drawImage = function (img, ...a) {
    const s = src.get(img) || (img.boardWord ? { kind: 'fade', ...img.boardWord } : null);
    if (s && a.length >= 8) {
      const [sx, sy, , , dx, dy, dw, dh] = a;
      const rec = { ...s, img, sx, sy, x: Math.round(dx * PX), y: Math.round(dy * PX), w: Math.round(dw * PX), h: Math.round(dh * PX),
        alpha: this.globalAlpha };
      (s.kind === 'panel' ? panels : words).push(rec);
    }
    if (oldFont(img)) old++;
    return di.call(this, img, ...a);
  };
  try {
    return { px: drawFrame(r, game, data, uiT, opts), words, panels, old };
  } finally {
    r.ctx.drawImage = di;
  }
}
/** Every pixel a word puts down (its letters, its keyline, a title's opaque pixels). */
function wordMask(words) {
  const m = new Uint8Array(SW * SH);
  for (const w of words) {
    const d = w.img.data, iw = w.img.width;
    for (let j = 0; j < w.h; j++) {
      const y = w.y + j;
      if (y < 0 || y >= SH) continue;
      for (let i = 0; i < w.w; i++) {
        const x = w.x + i;
        if (x < 0 || x >= SW) continue;
        if (d[((w.sy + j) * iw + w.sx + i) * 4 + 3]) m[y * SW + x] = 1;
      }
    }
  }
  return m;
}
/**
 * Word pixels that something drawn AFTER the word changed: the finished frame does not show
 * what the last word drawn there put down. Lettering may lie over lettering -- the prompt's
 * glint over its letters, a keycap beside its words -- and nothing else may: not the death,
 * not a panel drawn later (its rim, its plate, a shard or a sprig its dressing hangs off it),
 * not an overlay.
 *
 * The with/without diff above sees only what the hide option leaves out, and the in-well
 * check only where the words are, not what is drawn on them afterwards: with the news panel
 * moved up 12 units, its rim lay over the last row of the numbers and both passed (this
 * failed it, 420,678 px). It sees any later draw, whatever it is.
 *
 * A title's glow and shadow, the prompt's breathing glow, and a word still fading in, are
 * blended with what was behind them and have no colour of their own to find again: those
 * pixels are left unchecked unless a later word lays its own over them. A title is checked on
 * its letters' strokes.
 */
function overdrawn(px, words) {
  const want = new Int32Array(SW * SH).fill(-1);
  for (const w of words) {
    const d = w.img.data, iw = w.img.width;
    const stroke = w.kind === 'title' ? w.word.stroke : null;
    for (let j = 0; j < w.h; j++) {
      const y = w.y + j;
      if (y < 0 || y >= SH) continue;
      for (let i = 0; i < w.w; i++) {
        const x = w.x + i;
        if (x < 0 || x >= SW) continue;
        const s = (w.sy + j) * iw + w.sx + i, A = d[s * 4 + 3];
        if (!A) continue;
        const p = y * SW + x;
        if (A < 255 || w.alpha < 1 || (stroke && !stroke[s])) { want[p] = -2; continue; }
        want[p] = (d[s * 4] << 16) | (d[s * 4 + 1] << 8) | d[s * 4 + 2];
      }
    }
  }
  let n = 0, checked = 0;
  for (let p = 0, i = 0; p < SW * SH; p++, i += 4) {
    if (want[p] < 0) continue;
    checked++;
    if (((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]) !== want[p]) n++;
  }
  return { n, checked };
}
/** Word pixels that are NOT inside the opaque well of any panel drawn in the frame. */
function offPanel(words, panels) {
  const wells = panels.map((p) => {
    const P = GS.PANELS[p.key];
    return [p.x + p.f.ox, p.y + p.f.oy, p.x + p.f.ox + P.w * PX, p.y + p.f.oy + P.h * PX];
  });
  const mask = wordMask(words);
  let n = 0;
  for (let p = 0; p < SW * SH; p++) {
    if (!mask[p]) continue;
    const x = p % SW, y = (p / SW) | 0;
    if (!wells.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1)) n++;
  }
  return n;
}

// --- 2. nothing over the words ------------------------------------------------------------
// The frames below are drawn by tools/shot-gameover.mjs in main.js's order, so first: is it
// still main.js's order? The fall's words and the board must be drawn AFTER the world, not
// handed into it with the HUD (which renderer.draw puts under the characters).
{
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const at = src.indexOf('renderer.draw(game, alpha, dt, () => {');
  const end = at < 0 ? -1 : src.indexOf('});', at);
  const inside = at < 0 ? '' : src.slice(at, end);
  const after = end < 0 ? '' : src.slice(end, end + 600);
  ok(at >= 0 && !/drawGameOver|drawFallWords/.test(inside) && /drawFallWords\(/.test(after) && /drawGameOver\(/.test(after),
    `main.js draws the fall's words and the board after the world, not under the characters with the HUD`);
}
const r = makeRenderer();
const UI_T = 0.05;           // the prompt's glow near the bottom of its breath, no glint crossing
function frameOf(st, data, mode) {
  Math.random = M.mulberry32(7);
  r.renderer.t = 1;
  return record(r, st.game, data, UI_T, mode);
}

const combos = [];
for (let z = 0; z < THEMES.length; z++) {
  for (const dazed of [false, true]) {
    for (const left of [false, true]) {
      for (const open of [true, false]) combos.push({ zone: z, dazed, left, open });
    }
  }
}
for (const z of [0, 6, 7, 11]) {
  for (const skip of [0.1, 0.6, 1.5]) combos.push({ zone: z, open: true, skip, left: skip === 0.6 });
  for (const x of [0.04, 0.96]) combos.push({ zone: z, open: z !== 0, x, dazed: z === 0 });
}
// The fall and the impact hold, before the board: the words over the scene.
for (const z of [0, 1, 6, 7]) {
  for (const open of [true, false]) {
    for (const fall of [0.6, 0.9, 1.5]) combos.push({ zone: z, open, fall, dazed: z < 2, phase: 'fall' });
    for (const impact of [0.05, 0.2, 1.0]) {
      for (const dazed of [false, true]) combos.push({ zone: z, open, impact, dazed, phase: 'impact' });
    }
  }
}

let worst = 0, bitten = 0, bites = 0, off = 0, offFrames = 0, overPx = 0, overChecked = 0, oldGlyphs = 0;
const overFrames = [];
const rows = [];
for (const c of combos) {
  const st = stageDeath(c);
  for (const full of c.phase ? [false] : [true, false]) {
    const data = boardData(st.game, full);
    const a = frameOf(st, data, {});
    const b = frameOf(st, data, { hide: true });
    oldGlyphs += a.old;
    // The words that are UP: a word still fading in is see-through by design (the impact's,
    // over IMPACT_FADE) and is held to that in section 4 instead.
    const up = a.words.filter((w) => w.alpha >= 1);
    const mask = wordMask(up);
    let over = 0, visible = 0;
    for (let i = 0, p = 0; p < SW * SH; p++, i += 4) {
      if (a.px[i] === b.px[i] && a.px[i + 1] === b.px[i + 1] && a.px[i + 2] === b.px[i + 2]) continue;
      visible++;
      if (mask[p]) over++;
    }
    worst = Math.max(worst, over);
    const od = overdrawn(a.px, a.words);
    overPx += od.n;
    overChecked += od.checked;
    if (od.n) overFrames.push(`${THEMES[c.zone].name} ${c.phase || 'board'}${c.dazed ? ' dazed' : ''}${full ? ' full' : ''} ${od.n} px`);
    if (st.game.state === STATE.DEAD) {
      const n = offPanel(a.words, a.panels);
      off += n;
      if (n) offFrames++;
    }
    rows.push({ ...c, full, over, visible, words: a.words.length, state: st.game.state });
    // The bite, in every third death: the same frame with the body and the rest drawn OVER
    // the words.
    if ((full || c.phase) && combos.indexOf(c) % 3 === 0 && up.length) {
      const top = frameOf(st, data, { onTop: true });
      let hit = 0;
      for (let i = 0, p = 0; p < SW * SH; p++, i += 4) {
        if (mask[p] && (top.px[i] !== b.px[i] || top.px[i + 1] !== b.px[i + 1] || top.px[i + 2] !== b.px[i + 2])) hit++;
      }
      bites++;
      if (hit) bitten++;
    }
  }
}
ok(worst === 0, `no pixel of the Duke, his pieces, blood, companions or particles on any word or keyline, ` +
  `${rows.length} frames of ${combos.length} deaths; worst ${worst} px`);
ok(overPx === 0 && overChecked > 0, `every word ends the frame as it was lettered: nothing drawn after it -- a later panel, ` +
  `its dressing, an overlay -- changes a pixel of it (${overChecked} word pixels checked, ${overPx} changed` +
  (overFrames.length ? `: ${overFrames.slice(0, 4).join('; ')}` : '') + ')');
const boards = rows.filter((p) => p.state === STATE.DEAD);
ok(off === 0 && boards.length > 0, `every word of the board inside a panel's opaque well, in all ${boards.length} board frames ` +
  `(${off} px outside, in ${offFrames} frames)`);
ok(bitten > bites / 2, `the measure bites: drawn over the words, the body and the rest reach them in ${bitten} of ${bites} frames`);
ok(oldGlyphs === 0, `nothing on the board or in the fall lettered in the old font: ${oldGlyphs} glyphs drawn from font.js's ` +
  `flat atlases in ${rows.length} frames`);
const report = (label, list) => {
  if (!list.length) return;
  console.log(`         ${label.padEnd(15)} ${String(list.length).padStart(3)} frames: on the words ` +
    `${list.reduce((s, p) => s + p.over, 0)} px; death visible ${Math.min(...list.map((p) => p.visible))}-` +
    `${Math.max(...list.map((p) => p.visible))} px`);
};
report('board, open', boards.filter((p) => p.open && p.skip === undefined && p.x === undefined));
report('board, start', boards.filter((p) => !p.open && p.skip === undefined && p.x === undefined));
report('board, SPACE', boards.filter((p) => p.skip !== undefined));
report('board, walls', boards.filter((p) => p.x !== undefined));
report('mid-fall', rows.filter((p) => p.phase === 'fall'));
report('impact hold', rows.filter((p) => p.phase === 'impact'));

// --- 3. legible ----------------------------------------------------------------------------
/** The menus' ink atlases hold every glyph but the space, in font.js's order (menuskin.js CHARS). */
const MCHARS = Object.keys(GLYPHS).filter((c) => c !== ' ');
/**
 * Per line of the menus' glyphs: letters (the font's blocks) against their keyline, in a
 * frame. A cell is five font pixels of `b` and a keyline of `k` each side, read off the draw:
 * w = 5b + 2k, h = 7b + 2k.
 */
function glyphLines(px, words) {
  const lines = new Map();
  for (const w of words) {
    if (w.kind !== 'glyph' || w.alpha < 1) continue;
    const b = (w.h - w.w) / 2, k = (w.w - GW * b) / 2;
    const ch = MCHARS[Math.round(w.sx / w.w)];
    const key = `${w.role}@${w.y}`;
    if (!lines.has(key)) lines.set(key, { L: [], S: [] });
    const line = lines.get(key);
    const d = w.img.data, iw = w.img.width;
    for (let j = 0; j < w.h; j++) {
      for (let i = 0; i < w.w; i++) {
        const X = w.x + i, Y = w.y + j;
        if (X < 0 || Y < 0 || X >= SW || Y >= SH || !d[((w.sy + j) * iw + w.sx + i) * 4 + 3]) continue;
        const gx = Math.floor((i - k) / b), gy = Math.floor((j - k) / b);
        const on = gx >= 0 && gy >= 0 && gx < GW && gy < GH && GLYPHS[ch][gy][gx] === '#';
        (on ? line.L : line.S).push(lum(px, (Y * SW + X) * 4));
      }
    }
  }
  const out = [];
  for (const [k, line] of lines) {
    const s90 = pct(line.S, 0.9);
    out.push({ k, med: ratio(pct(line.L, 0.5), s90), dark: ratio(Math.min(...line.L), s90) });
  }
  return out;
}
/**
 * Each LETTERED word -- a line (SPLAT, OOF) or the prompt's words -- against its bed: its
 * letters (the painter's strokes) against the brightest tenth of what lies within two pixels
 * of them and is not letter, in the frame. Held by the letters' median, as tools/test-menu.mjs
 * holds the menus' lettered words: a bevelled stroke's shaded edge is dark by design (the
 * lower-right slope, a tone off the outline), where a glyph's darkest pixel is its face.
 * `dark` is its tenth percentile, reported.
 */
function letteredLines(px, words) {
  const out = [];
  for (const w of words) {
    if ((w.kind !== 'line' && w.kind !== 'prompt') || w.alpha < 1) continue;
    const a = w.a, W = a.w, H = a.h;
    const letter = new Uint8Array(W * H);
    if (w.kind === 'line') {
      const { d, R } = a.plan;
      for (let i = 0; i < W * H; i++) letter[i] = d[i] <= R ? 1 : 0;
    } else {
      for (let i = 0; i < W * H; i++) letter[i] = a.letters[i] ? 1 : 0;
    }
    const L = [], S = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const X = w.x + x, Y = w.y + y;
        if (X < 0 || Y < 0 || X >= SW || Y >= SH) continue;
        const i = y * W + x;
        if (letter[i]) { L.push(lum(px, (Y * SW + X) * 4)); continue; }
        let near = false;
        for (let v = -2; v <= 2 && !near; v++) for (let u = -2; u <= 2; u++) {
          const xx = x + u, yy = y + v;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H && letter[yy * W + xx]) { near = true; break; }
        }
        if (near) S.push(lum(px, (Y * SW + X) * 4));
      }
    }
    const s90 = pct(S, 0.9);
    out.push({ k: w.key.split(':').slice(-1)[0], med: ratio(pct(L, 0.5), s90), dark: ratio(pct(L, 0.1), s90), lettered: true });
  }
  return out;
}
/** Each keycap's legend (its crimson inlay) against its face (the pale argent round it). */
function capLegends(px, words) {
  const out = [];
  for (const w of words) {
    if (w.kind !== 'cap' || w.alpha < 1) continue;
    const d = w.img.data, iw = w.img.width;
    const G = [], F = [];
    for (let j = 0; j < w.h; j++) {
      for (let i = 0; i < w.w; i++) {
        const s = ((w.sy + j) * iw + w.sx + i) * 4;
        if (d[s + 3] !== 255) continue;
        const X = w.x + i, Y = w.y + j;
        if (X < 0 || Y < 0 || X >= SW || Y >= SH) continue;
        const red = d[s] > d[s + 1] + 50, pale = lum(d, s) > 0.45;
        if (red) G.push(lum(px, (Y * SW + X) * 4)); else if (pale) F.push(lum(px, (Y * SW + X) * 4));
      }
    }
    out.push({ k: w.label, med: ratio(pct(G, 0.5), pct(F, 0.5)) });
  }
  return out;
}
{
  const out = [];
  const bad = [];
  let caps = 0, lettered = 0;
  for (let z = 0; z < THEMES.length; z++) {
    const name = THEMES[z].name;
    const st = stageDeath({ zone: z, open: true });
    const { px, words } = frameOf(st, boardData(st.game, true), {});
    let titleL = [], titleB = [];
    for (const w of words) {
      if (w.kind !== 'title') continue;
      const W = w.word, cv = W.c, cd = cv.data;
      for (let y = w.y + W.top; y < w.y + W.top + W.inkH; y++) {
        for (let x = w.x + W.x0; x < w.x + W.x1; x++) {
          if (x < 0 || y < 0 || x >= SW || y >= SH) continue;
          const a = cd[((y - w.y) * cv.width + (x - w.x)) * 4 + 3];
          const L = lum(px, (y * SW + x) * 4);
          if (a && L > 0.03) titleL.push(L); else if (!a) titleB.push(L);
        }
      }
    }
    const board = [...glyphLines(px, words), ...letteredLines(px, words)];
    const legends = capLegends(px, words);
    const hold = [];
    for (const dazed of [false, true]) {
      const sh = stageDeath({ zone: z, open: true, dazed, impact: 0.5 });
      const f = frameOf(sh, boardData(sh.game, false), {});
      hold.push(...glyphLines(f.px, f.words), ...letteredLines(f.px, f.words));
      legends.push(...capLegends(f.px, f.words));
    }
    caps += legends.length;
    lettered += [...board, ...hold].filter((l) => l.lettered).length;
    const all = [...board, ...hold];
    for (const l of all) if (l.med < 4.5 || (!l.lettered && l.dark < 3)) bad.push(`${name} ${l.k} ${l.med.toFixed(1)}/${l.dark.toFixed(1)}`);
    for (const l of legends) if (l.med < 3) bad.push(`${name} key ${l.k} ${l.med.toFixed(1)}`);
    const tRatio = ratio(titleL.reduce((s, v) => s + v, 0) / Math.max(1, titleL.length), pct(titleB, 0.5));
    if (tRatio < 3) bad.push(`${name} GAME OVER ${tRatio.toFixed(1)}`);
    const weakest = (list) => list.reduce((m, l) => (l.med < m.med ? l : m), { med: Infinity, k: '' });
    const glyphs = (list) => list.filter((l) => !l.lettered);
    const wb = weakest(board), wh = weakest(hold), wk = weakest(legends), wl = weakest(all.filter((l) => l.lettered));
    out.push(`${name.padEnd(9)} board ${board.length} lines, weakest ${wb.med.toFixed(1)}:1 (${wb.k.split('@')[0]}), ` +
      `darkest ${Math.min(...glyphs(board).map((l) => l.dark)).toFixed(1)}:1; impact weakest ${wh.med.toFixed(1)}:1 ` +
      `(${wh.k.split('@')[0]}), darkest ${Math.min(...glyphs(hold).map((l) => l.dark)).toFixed(1)}:1; lettered weakest ` +
      `${wl.med.toFixed(1)}:1 (${wl.k}); keys ${wk.med.toFixed(1)}:1; GAME OVER ${tRatio.toFixed(1)}:1`);
  }
  for (const row of out) console.log(`         ${row}`);
  ok(!bad.length && caps > 0 && lettered > 0, `every line legible in every zone, on the board and in the impact hold (letters 4.5:1, ` +
    `darkest pixel 3:1, ${lettered} lettered words among them; ${caps} keycaps' legends 3:1; title 3:1)` +
    (bad.length ? `: ${bad.slice(0, 6).join('; ')}` : ''));
}

// --- 4. the impact's words fade in whole ---------------------------------------------------------
// Each word is ONE picture -- letters on their keyline -- drawn at the fade's alpha over the
// scene: every pixel of it in the frame is the scene and the finished word mixed at that
// alpha, nothing else. They used to fade the letters alone over a keyline drawn whole from
// the first frame, so each came up as a black stencil over the impact's white flash. The
// scene is the same frame drawn without the fall's words (shot-gameover.mjs noWords).
{
  const { IMPACT_FADE } = M;
  let layered = 0, split = 0, mixed = 0, off = 0, firstMax = 0, firstLim = 0, frames = 0;
  for (const z of [0, 6, 11]) {
    for (const dazed of [false, true]) {
      for (const impact of [0.001, 0.1, 0.2, 0.34]) {
        const st = stageDeath({ zone: z, open: z !== 0, dazed, impact });
        const g = st.game;
        const k = Math.min(1, g.impactT / IMPACT_FADE);
        const data = boardData(g, false);
        const a = frameOf(st, data, {});
        const b = frameOf(st, data, { noWords: true });
        frames++;
        let worst = 0;
        for (const w of a.words) {
          if (w.kind !== 'fade') {
            // A piece of lettering -- letters, keyline, key -- drawn at less than full: a fade
            // in layers.
            if (w.alpha < 1) split++;
            continue;
          }
          layered++;
          if (Math.abs(w.alpha - k) > 1e-9) off++;
          const d = w.img.data, iw = w.img.width;
          for (let j = 0; j < w.h; j++) {
            for (let i = 0; i < w.w; i++) {
              const s = ((w.sy + j) * iw + w.sx + i) * 4;
              if (!d[s + 3]) continue;
              const X = w.x + i, Y = w.y + j;
              if (X < 0 || Y < 0 || X >= SW || Y >= SH) continue;
              const p = (Y * SW + X) * 4;
              // Source-over at the pixel's own alpha times the fade's: a lettered word's bed and
              // shadow, and a keycap's contact shadow, are see-through in the picture itself.
              const A = (d[s + 3] / 255) * w.alpha;
              for (let c = 0; c < 3; c++) {
                const want = d[s + c] * A + b.px[p + c] * (1 - A);
                if (Math.abs(a.px[p + c] - want) > 1) mixed++;
              }
            }
          }
        }
        if (impact < 0.01) {
          // Every pixel any of the fall's words puts down, however it is drawn.
          const m = wordMask(a.words);
          for (let p = 0; p < SW * SH; p++) {
            if (!m[p]) continue;
            for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(a.px[p * 4 + c] - b.px[p * 4 + c]));
          }
          firstMax = Math.max(firstMax, worst);
          firstLim = Math.max(firstLim, Math.ceil(255 * k) + 1);
        }
      }
    }
  }
  ok(layered > 0 && split === 0 && off === 0 && mixed === 0,
    `the impact's words fade in whole: ${layered} words over ${frames} frames of the fade, each one picture drawn at the ` +
    `fade's alpha, every pixel the scene and the word mixed at it (${mixed} channels off); ${split} letters or ` +
    `keylines faded on their own` + (off ? `; ${off} at the wrong alpha` : ''));
  ok(firstMax <= firstLim, `from nothing: in the impact's first frame no word moves a pixel of the scene by more than ` +
    `its alpha allows (${firstMax} of 255 at most, ${firstLim} allowed) -- no dark stencil over the flash`);

  // SPACE TO SKIP fades in drawn straight onto the scene, a keycap and a glyph at a time: whole
  // only if every piece is at the one alpha and no two overlap, so none is drawn over another
  // at that alpha -- which is how the keyline-then-letters stencil was made.
  const { SKIP_PROMPT_AT } = M;
  let pieces = 0, alphas = 0, overlaps = 0, mix2 = 0, fadeFrames = 0;
  for (const z of [0, 7]) {
    for (const s of [0.02, 0.08, 0.15]) {
      const st = stageDeath({ zone: z, open: true, dazed: z === 0, fall: SKIP_PROMPT_AT + s });
      const data = boardData(st.game, false);
      const a = frameOf(st, data, {});
      const b = frameOf(st, data, { noWords: true });
      const fading = a.words.filter((w) => w.alpha < 1);
      if (!fading.length) continue;
      fadeFrames++;
      pieces += fading.length;
      alphas += new Set(fading.map((w) => w.alpha)).size - 1;
      const owner = new Int32Array(SW * SH).fill(-1);
      fading.forEach((w, n) => {
        const d = w.img.data, iw = w.img.width;
        for (let j = 0; j < w.h; j++) for (let i = 0; i < w.w; i++) {
          const s2 = ((w.sy + j) * iw + w.sx + i) * 4;
          if (!d[s2 + 3]) continue;
          const X = w.x + i, Y = w.y + j;
          if (X < 0 || Y < 0 || X >= SW || Y >= SH) continue;
          const p = Y * SW + X;
          if (owner[p] >= 0 && owner[p] !== n) overlaps++;
          owner[p] = n;
          const A = (d[s2 + 3] / 255) * w.alpha;
          for (let c = 0; c < 3; c++) {
            const want = d[s2 + c] * A + b.px[p * 4 + c] * (1 - A);
            if (Math.abs(a.px[p * 4 + c] - want) > 1) mix2++;
          }
        }
      });
    }
  }
  ok(fadeFrames > 0 && alphas === 0 && overlaps === 0 && mix2 === 0,
    `SPACE TO SKIP fades in whole: ${pieces} pieces over ${fadeFrames} frames of its fade, one alpha a frame, ` +
    `${overlaps} pixels where two pieces overlap, ${mix2} channels not the scene and the piece mixed at it`);
}

console.log(`\n  ${fails ? fails + ' FAILED' : 'game over: every zone styled, nothing on the words, all legible'}  ` +
  `(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fails ? 1 : 0);
