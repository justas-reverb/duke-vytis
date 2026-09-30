// The replays' looks: the REPLAYS screen, the overlay over a replay being watched, the
// prompt on the scoreboard, the ghost of a raced run and the race's readout.
//
// In the game's painted style, from the kits that already make it: the replays screen and
// the overlay in the Duke's own regal skin (menuskin.js -- panels in a gold bead, crimson
// enamel under the selected row, keycaps, the font inked and keylined), and the scoreboard's
// prompt as keycaps in the same lettering, on the board's own key panel (drawBoardReplay).
// Every word over a moving game stands on an opaque plate: the overlay's and the readout's
// are panels, and the scoreboard's words sit on the key panel the board already draws.
//
// The ghost is the Duke's own drawing re-inked in a cool ice-blue ramp by the brightness of
// each pixel -- his silhouette, armour and all, in a tone no zone, companion or effect in the
// game uses -- drawn at REPLAY_GHOST_ALPHA behind everything but the scenery (the race draws
// it before the HUD, which the renderer draws under the characters), so it can never lie
// over the HUD, the Duke, a companion or a word. It is placed exactly as drawSprite places
// the sprite (sprites.js placeCell, for a pose with no squash): tools/test-replayui.mjs holds
// the two placements to each other, pose by pose, both facings and every quarter turn.
//
// COST. Everything is painted once into a canvas and blitted, as the menu is. The screen's
// pieces are on the title screen's warm-up list (screens.js, replayWarmList below); the
// ghost's atlas, 2 x the sprite sheet, is painted a pose a frame while the replays screen or
// a scoreboard offering a race is up (warmGhost), and whatever is missing when a race draws
// it is painted then and counted (ghostStats().late).

import { PX, VW, VH, REPLAY_GHOST_ALPHA } from '../game/constants.js';
import { textWidth } from './font.js';
import { mText, mLine, mPanel, mSelect, mPointer, mCap, mBar, mGem, OR, NIGHT } from './menuskin.js';
import { BOARD_KEYS, BOARD_KEYS_GAP, KEYS_ROWS } from './gameoverskin.js';
import { mHints, hintsWidth, fillView } from './menuskin.js';
import {
  FRAMES, FRAMES_LEFT, NAMES, SPR_W, SPR_H, BODY_W, BODY_H, FOOT_DROP, FRONT_FRAMES, IDLE_CYCLE, RUN_CYCLE, placeCell } from './sprites.js';

// --- the ghost ---------------------------------------------------------------------------

/**
 * The ghost's ramp, darkest first: deep navy to a pale ice, a cool blue no zone's backdrop,
 * ledge or effect is drawn in. Each pixel of the Duke takes the tone of its brightness, so
 * his outline stays his outline and his armour still reads as armour, all in one hue.
 */
export const GHOST_RAMP = ['#07152b', '#123a66', '#1f5f99', '#3a8cc8', '#72bfe8', '#b8ecff'];
/** Where each tone starts, by the pixel's luminance 0..1. */
const GHOST_STEPS = [0.1, 0.22, 0.38, 0.55, 0.72];
/** The ink the ghost's name is lettered in on the readout: its own light tone. */
export const GHOST_INK = '#8fd6ff';
/** Poses he stands in: their cells stop at the boots' row, as sprites.js's atlas does. */
const GROUND = new Set([...IDLE_CYCLE, ...RUN_CYCLE, 'land']);
const POSE_AT = new Map(NAMES.map((n, i) => [n, i]));

const toneCache = new Map();
function ghostTone(col) {
  let t = toneCache.get(col);
  if (t !== undefined) return t;
  const h = String(col).replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) || 0, g = parseInt(h.slice(2, 4), 16) || 0, b = parseInt(h.slice(4, 6), 16) || 0;
  const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  let k = 0;
  while (k < GHOST_STEPS.length && L >= GHOST_STEPS[k]) k++;
  t = GHOST_RAMP[k];
  toneCache.set(col, t);
  return t;
}

/** The same rows sprites.js's atlas keeps: a standing pose stops at his boots. */
const rowsOf = (name) => (GROUND.has(name) ? SPR_H - Math.round((FOOT_DROP[name] || 0) * PX) : SPR_H);

const atlases = [null, null];          // [right, left]: canvases, painted a cell at a time
const painted = [new Set(), new Set()];
const gstats = { cells: 0, late: 0, ms: 0 };
const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);

function atlasFor(flip) {
  const k = flip ? 1 : 0;
  if (!atlases[k]) {
    const c = document.createElement('canvas');
    c.width = (NAMES.length * SPR_W) | 0;
    c.height = SPR_H | 0;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    atlases[k] = { c, g };
  }
  return atlases[k];
}

/** Paint one pose's cell of one facing into the ghost atlas, as fillRect runs of tone. */
function paintCell(flip, name) {
  const k = flip ? 1 : 0;
  if (painted[k].has(name)) return false;
  const t0 = now();
  const { g } = atlasFor(flip);
  const grid = (flip ? FRAMES_LEFT : FRAMES)[name];
  const i = POSE_AT.get(name);
  const rows = rowsOf(name);
  for (let y = 0; y < rows; y++) {
    const row = grid[y];
    let x = 0;
    while (x < SPR_W) {
      const col = row[x];
      if (!col) { x++; continue; }
      const tone = ghostTone(col);
      let run = 1;
      while (x + run < SPR_W && row[x + run] && ghostTone(row[x + run]) === tone) run++;
      g.fillStyle = tone;
      g.fillRect(i * SPR_W + x, y, run, 1);
      x += run;
    }
  }
  painted[k].add(name);
  gstats.cells++;
  gstats.ms += now() - t0;
  return true;
}

/** Every cell the ghost can be drawn in, in the order a race first needs them. */
const WARM_ORDER = (() => {
  const first = [...IDLE_CYCLE, ...RUN_CYCLE, 'land', 'jump', 'fall', 'jumpFast', 'fallFast', 'tuck'];
  const names = [...new Set([...first.filter((n) => POSE_AT.has(n)), ...NAMES])];
  return names.flatMap((n) => [[false, n], [true, n]]);
})();

/** Paint up to `n` of the ghost's cells not yet painted; false once every one is. */
export function warmGhost(n = 1) {
  if (typeof document === 'undefined' || !document.createElement) return false;
  let done = 0;
  for (const [flip, name] of WARM_ORDER) {
    if (done >= n) return true;
    if (paintCell(flip, name)) done++;
  }
  return false;
}

export function ghostStats() { return { ...gstats, total: WARM_ORDER.length }; }

/**
 * The ghost in pose `frame`, facing `facing`, its feet at world (x, y), at `alpha` of
 * REPLAY_GHOST_ALPHA. Call it in the renderer's world transform; it flips y itself, as
 * drawPlayer does, and snaps to the art grid as the sprite is snapped. A tuck is spun by
 * `spin` quarter turns, as the renderer spins his.
 *
 * Placed BY sprites.js placeCell, at no squash -- the function that places the sprite. It was
 * a second copy of placeCell's arithmetic, and the copy went stale the day the tuck began
 * turning about the ball of him (SPIN_PIVOT): 12 of 320 cases, every quarter turn of the roll,
 * drew the ghost a ball's width off where the Duke is drawn. tools/test-replayui.mjs still
 * records this drawImage and drawSprite's for every pose, both facings and every quarter
 * turn, and requires them equal.
 */
export function drawGhost(ctx, frame, x, y, facing, alpha = 1, spin = 0) {
  const i = POSE_AT.get(frame);
  if (i === undefined || !(alpha > 0)) return;
  let flip = facing < 0;
  if (FRONT_FRAMES.has(frame)) flip = false;
  if (!painted[flip ? 1 : 0].has(frame)) { paintCell(flip, frame); gstats.late++; }
  const img = atlasFor(flip).c;
  const snap = (v) => Math.round(v * PX) / PX;
  const cx = snap(x), by0 = snap(-y);
  const was = ctx.globalAlpha;
  ctx.globalAlpha = was * REPLAY_GHOST_ALPHA * Math.min(1, alpha);
  ctx.save();
  ctx.scale(1, -1);
  placeCell(ctx, img, i * SPR_W, frame, cx, by0, spin, 0, flip);
  ctx.restore();
  ctx.globalAlpha = was;
}

// --- key hints ---------------------------------------------------------------------------

/**
 * A line of [key, words, role] hints laid out as menuskin's mKeyLine lays its pairs -- a
 * keycap, five units, the words -- but CENTRED on what it draws (from the first cap's edge
 * to the last word's end; mKeyLine centres on a width six units short of that), and with a
 * role per pair, so an action that cannot be taken is lettered 'off'. Returns [left, right].
 */
export function hintSpan(pairs, gap) {
  let w = 0;
  pairs.forEach(([k, label], j) => { w += textWidth(k) + 5 + textWidth(label) + (j ? gap : 0); });
  return w + 2;
}
export function drawHints(ctx, pairs, x, y, gap = 8, align = 'center') {
  const E = hintSpan(pairs, gap);
  let px = (align === 'center' ? Math.round(x - E / 2) : Math.round(x)) + 2;
  const left = px - 2;
  pairs.forEach(([k, label, role = 'label'], j) => {
    if (j) px += gap;
    mCap(ctx, k, px, y);
    px += textWidth(k) + 5;
    mText(ctx, role, label, px, y, 'left');
    px += textWidth(label);
  });
  return [left, px];
}

// --- the overlay over a replay being watched ---------------------------------------------

/**
 * The overlay's plate [view units]: top centre, between FLOOR on the left and SCORE on the
 * right, over nothing the HUD draws -- its top row is free from x 84 (a five-digit floor
 * ends at 81) to where the score starts, down to the callouts at 84 -- and ending above SPLAT
 * (row 38, scale 3), which the fall letters there. A score of nine digits reaches past 360,
 * so the plate moves left of it; one of ten would push it onto FLOOR, so the plate drops
 * under the top row instead, to rows 40-72 -- clear there of SPEED, MAX and the score's
 * BEST line while he climbs, and the score is only drawn while he climbs (overlayAt).
 */
export const OVERLAY = { x: 120, y: 2, w: 240, h: 32 };
/** Where the HUD's score, right-aligned at PLAY_R - 3 at scale 2, ends; where FLOOR's
 *  number, five digits at most, ends [view units]. */
const SCORE_RIGHT = 461, FLOOR_END = 84;
export function overlayAt(scoreW = 0) {
  const x = Math.floor(SCORE_RIGHT - scoreW - 4 - OVERLAY.w);
  if (x >= OVERLAY.x) return { x: OVERLAY.x, y: OVERLAY.y };
  if (x >= FLOOR_END) return { x, y: OVERLAY.y };
  return { x: OVERLAY.x, y: 40 };
}
/** The plate that offers the whole run, and the one at a replay's end [view units]: under
 *  the fall's verdict (to row 75) and over FLOOR N (row 240). */
export const OFFER = { x: 86, y: 100, w: 308, h: 40 };

const mmss = (s) => {
  s = Math.max(0, Math.floor(s + 1e-6));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};
export { mmss };

const SPEED_WORD = (v) => v + 'X';

/**
 * st: { paused, speed, time, length, phase ('play' | 'fall' | 'seek' | 'end'),
 *       pad, from ('board' | 'list') }
 */
export function drawReplayOverlay(ctx, st) {
  const O = { ...OVERLAY, ...overlayAt(st.scoreW || 0) };
  mPanel(ctx, O.x, O.y, O.w, O.h);
  const state = st.phase === 'seek' ? 'SEEKING' : st.paused ? 'PAUSED'
    : st.phase === 'fall' ? 'THE FALL' : 'PLAYING';
  const lx = O.x + 7;
  mText(ctx, 'gold', 'REPLAY', lx, O.y + 4, 'left');
  const w0 = textWidth('REPLAY') + 6;
  mText(ctx, st.paused ? 'crimson' : 'text', state, lx + w0, O.y + 4, 'left');
  const time = mmss(Math.min(st.time, st.length)) + ' / ' + mmss(st.length);
  const tw = mText(ctx, 'text', time, O.x + O.w - 7, O.y + 4, 'right');
  mText(ctx, st.speed === 1 ? 'label' : 'gold', SPEED_WORD(st.speed), O.x + O.w - 7 - tw - 6, O.y + 4, 'right');
  mBar(ctx, lx, O.y + 13, O.w - 14, 3, st.length > 0 ? Math.min(1, st.time / st.length) : 0, OR[4]);
  drawHints(ctx, overlayHints(st), O.x + O.w / 2, O.y + 20, 6);

  if (st.phase === 'end') {
    const F = OFFER;
    mPanel(ctx, F.x, F.y, F.w, F.h, 'END OF THE RUN');
    mText(ctx, 'text', 'THE WHOLE CLIMB, FROM THE FIRST STEP TO THE FALL.', VW / 2, F.y + 9, 'center');
    const back = st.from === 'board' ? 'BACK TO THE BOARD' : 'BACK TO REPLAYS';
    const go = 'WATCH IT AGAIN';
    drawHints(ctx, st.pad ? [['A', go, 'gold'], ['B', back]] : [['SPACE', go, 'gold'], ['ESC', back]], VW / 2, F.y + 24, 12);
  }
}

/**
 * The overlay's own hints. At the end SPACE is the plate's (the whole run again), so the top
 * row does not also call it PLAY.
 */
export function overlayHints(st) {
  const play = st.paused ? 'PLAY' : 'PAUSE';
  const end = st.phase === 'end';
  const hints = st.pad
    ? [['A', play], ['LB RB', '5S'], ['UP DN', 'SPEED'], ['B', 'LEAVE']]
    : [['SPACE', play], ['< >', '5S'], ['^ V', 'SPEED'], ['ESC', 'LEAVE']];
  return end ? hints.slice(1) : hints;
}

// --- the REPLAYS screen ------------------------------------------------------------------

/** The list's panel and rows [view units]. */
export const LIST = { x: 12, y: 30, w: 456, h: 180, top: 48, row: 12, rows: 13 };
/**
 * Columns: x of each, and how it is aligned [view units]. Room for a nine-digit score (53
 * units) between a five-digit floor and the time: at first the score stood five units off
 * the floor, and a floor of 765 and a score of 14443200 read as one number.
 *
 * SPEED is the run's JUMP SPEED (settings.js), 100% for every replay from before it: a race
 * against a 130% ghost at 100% is another race, so the list says so. It took its room from
 * the gaps: every column's widest value -- LAST #10, a date, a five-digit floor, a nine-digit
 * score, a two-hour time, 130%, STARFIELD, GHOST ONLY and the pin's gem -- at least five units
 * (a character) from the next. A first try that squeezed only the numbers left a nine-digit
 * score three units off a two-hour time, and they read as one number.
 */
const COLS = [
  ['RUN', 30, 'left'], ['DATE', 82, 'left'], ['FLOOR', 188, 'right'], ['SCORE', 248, 'right'],
  ['TIME', 288, 'right'], ['SPEED', 322, 'right'], ['ZONE', 328, 'left'], ['STATUS', 387, 'left'],
];
const MENU_BG = '#0d080e';
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** A replay's date as 'SEP 24 14:05', in the player's own time. */
export function dateWord(ms) {
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return '-';
  return MONTHS[d.getMonth()] + ' ' + String(d.getDate()).padStart(2, ' ') + ' '
    + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/**
 * What a row is: an import, a best by its rank, the last run (and its rank when it is one of
 * the best too), or a run kept only because it is pinned.
 */
export function tagOf(e) {
  if (e.origin === 'imported') return 'IMPORTED';
  if (e.last) return e.rank ? 'LAST #' + e.rank : 'LAST';
  if (e.rank) return 'BEST ' + e.rank;
  return e.pinned ? 'PINNED' : 'RUN';
}

/**
 * st: { entries: [listReplays() rows + { zoneName, time }], sel, scroll, note: { text, kind },
 *       confirm (an entry being deleted, or null), pad, web }
 */
export function drawReplayList(ctx, st, t) {
  ctx.fillStyle = MENU_BG;
  fillView(ctx);
  mLine(ctx, 'gold', 'REPLAYS', VW / 2, 8, 2, 'center');
  const L = LIST;
  mPanel(ctx, L.x, L.y, L.w, L.h);
  const hy = L.y + 6;
  for (const [name, x, align] of COLS) mText(ctx, 'hint', name, x, hy, align);
  const list = st.entries;
  if (!list.length) {
    mText(ctx, 'text', 'NO REPLAYS YET', VW / 2, L.y + 60, 'center');
    mText(ctx, 'label', 'EVERY RUN YOU CLIMB IS KEPT HERE: THE LAST ONE, YOUR TEN BEST', VW / 2, L.y + 76, 'center');
    mText(ctx, 'label', 'AND ANY YOU PIN. A FRIEND\'S REPLAY CAN BE IMPORTED.', VW / 2, L.y + 88, 'center');
  }
  const first = st.scroll || 0;
  for (let r = 0; r < L.rows && first + r < list.length; r++) {
    const e = list[first + r];
    const y = L.top + r * L.row;
    const on = first + r === st.sel;
    if (on) {
      mSelect(ctx, L.x + 4, y - 2, L.w - 8, 11, t);
      mPointer(ctx, L.x + 8, y, t);
    }
    const ink = on ? 'gold' : 'label';
    mText(ctx, on ? 'gold' : e.origin === 'imported' ? GHOST_INK : 'text', tagOf(e), COLS[0][1], y, 'left');
    mText(ctx, ink, dateWord(e.date), COLS[1][1], y, 'left');
    mText(ctx, on ? 'text' : 'label', String(e.floor), COLS[2][1], y, 'right');
    mText(ctx, on ? 'text' : 'label', String(e.score), COLS[3][1], y, 'right');
    mText(ctx, ink, e.time, COLS[4][1], y, 'right');
    mText(ctx, ink, Math.round((e.speed || 1) * 100) + '%', COLS[5][1], y, 'right');
    mText(ctx, ink, e.zoneName, COLS[6][1], y, 'left');
    mText(ctx, e.playable ? ink : 'crimson', e.playable ? 'PLAYABLE' : 'GHOST ONLY', COLS[7][1], y, 'left');
    if (e.pinned) mGem(ctx, L.x + L.w - 16, y - 1, 8, 9, true);
  }
  if (list.length > L.rows) {
    const more = [first > 0 ? 'MORE ABOVE' : '', first + L.rows < list.length ? 'MORE BELOW' : ''].filter(Boolean).join('  ');
    if (more) mText(ctx, 'hint', more, L.x + L.w - 8, L.y + L.h - 10, 'right');
  }

  // The note: what the last action did, or why it could not. A panel (a nine-slice) and not
  // a plate: a plate is painted for its size, and every note is a different width.
  if (st.note && st.note.text) {
    const w = Math.min(VW - 16, textWidth(st.note.text) + 20);
    mPanel(ctx, Math.round(VW / 2 - w / 2), 213, w, 14);
    mText(ctx, st.note.kind === 'bad' ? 'crimson' : st.note.kind === 'good' ? 'gold' : 'text', st.note.text, VW / 2, 216, 'center');
  }
  const e = list[st.sel] || null;
  drawHints(ctx, listHints(e, st.pad), VW / 2, 234, 8);
  // A browser opens its file picker only for a key press or a click (replayfiles.js): a pad
  // imports in the desktop build alone. In a browser this line told a pad's player that BACK
  // imports, and BACK then said that it could not.
  mText(ctx, 'hint', st.pad && !st.web ? 'BACK IMPORTS A .DVREPLAY FILE'
    : st.pad ? 'IMPORT FROM THE KEYBOARD: I, CTRL+V, OR DROP A .DVREPLAY FILE HERE'
    : 'IMPORT A .DVREPLAY FILE WITH I, BY DROPPING IT HERE, OR WITH CTRL+V', VW / 2, VH - 12, 'center');

  if (st.confirm) drawConfirm(ctx, st.confirm, st.pad);
  if (st.ask) drawRaceAsk(ctx, st.ask, st.pad);
}

/** The screen's key hints for the selected row `e` (null: an empty list). */
export function listHints(e, pad) {
  const has = !!e;
  const watch = has && e.playable ? 'label' : 'off';
  const act = has ? 'label' : 'off';
  const pin = has && e.pinned ? 'UNPIN' : 'PIN';
  return pad
    ? [['A', 'WATCH', watch], ['X', 'RACE', act], ['Y', pin, act], ['LB', 'DELETE', act], ['RB', 'EXPORT', act], ['B', 'BACK']]
    : [['SPACE', 'WATCH', watch], ['R', 'RACE', act], ['P', pin, act], ['DEL', 'DELETE', act], ['E', 'EXPORT', act],
      ['I', 'IMPORT'], ['ESC', 'BACK']];
}

/** The delete's confirm: a modal over the list, as the stats' reset is. */
const CONFIRM = { x: 76, y: 84, w: 328, h: 78 };
function drawConfirm(ctx, e, pad) {
  ctx.fillStyle = '#05030ad8';
  fillView(ctx);
  const C = CONFIRM;
  mPanel(ctx, C.x, C.y, C.w, C.h, 'DELETE THIS REPLAY', 'crimson');
  mText(ctx, 'text', tagOf(e) + '   FLOOR ' + e.floor + '   SCORE ' + e.score + '   ' + dateWord(e.date), VW / 2, C.y + 14, 'center');
  mText(ctx, 'crimson', 'IT CANNOT BE BROUGHT BACK.', VW / 2, C.y + 30, 'center');
  drawHints(ctx, pad ? [['A', 'DELETE', 'crimson'], ['B', 'KEEP IT']] : [['DEL', 'DELETE', 'crimson'], ['ESC', 'KEEP IT']],
    VW / 2, C.y + 52, 14);
}

// --- the race's question -----------------------------------------------------------------

/**
 * Before a race starts (ReplayUI.raceId): the options the run was played at beside the
 * player's own, and whether to race at the run's. The user, 2026-09-29: "when were trying to
 * race against a replay or race against best make sure it lists all the options that replay
 * used and ask if you want to use the same options so it would match". A modal over the list
 * or the scoreboard, as the delete's confirm is. A row per option that changes how a run plays
 * (replays.js raceOptions): the run's value, the player's, and SAME or DIFFERS. The ledges are
 * the run's either way -- a race is on its tower -- and a line says so when they differ. When
 * nothing differs there is nothing to choose: the panel says so and offers the race alone.
 * The panel's box [view units], centred up and down.
 */
export const RACE_ASK = { x: 84, w: 312, h: 138 };
export const RACE_TITLES = { list: 'RACE THIS RUN', board: 'RACE YOUR BEST RUN' };
/** The columns' centres, from the panel's left [view units]; the option's name starts at 14. */
const ASK_COL = { run: 130, yours: 196, same: 262 };
export const ASK_WORDS = {
  ask: "RACE AT THE RUN'S OPTIONS, SO IT MATCHES?",
  only: 'FOR THIS RACE ONLY. YOUR SETTINGS ARE KEPT',
  match: "YOUR OPTIONS MATCH THE RUN'S",
  ledges: "THE LEDGES ARE THE RUN'S EITHER WAY",
};

/** The question's key hints: the run's options, the player's own, back -- or race and back. */
export function askHints(info, pad) {
  if (info.rows.every((r) => r.same)) return pad ? [['A', 'RACE', 'gold'], ['B', 'BACK']] : [['SPACE', 'RACE', 'gold'], ['ESC', 'BACK']];
  return pad ? [['A', 'SAME OPTIONS', 'gold'], ['X', 'MY OPTIONS'], ['B', 'BACK']]
    : [['Y', 'SAME OPTIONS', 'gold'], ['N', 'MY OPTIONS'], ['ESC', 'BACK']];
}

/** info: ReplayUI.askInfo() -- { from ('list' | 'board'), floor, score, ghostOnly, rows }. */
export function drawRaceAsk(ctx, info, pad) {
  ctx.fillStyle = '#05030ad8';
  fillView(ctx);
  const A = RACE_ASK, x = A.x, y = Math.round((VH - A.h) / 2);
  mPanel(ctx, x, y, A.w, A.h, RACE_TITLES[info.from] || RACE_TITLES.list);
  const result = 'FLOOR ' + info.floor + '   SCORE ' + info.score + (info.ghostOnly ? '   GHOST ONLY' : '');
  mText(ctx, 'text', result, VW / 2, y + 12, 'center');
  mText(ctx, 'hint', 'THE RUN', x + ASK_COL.run, y + 28, 'center');
  mText(ctx, 'hint', 'YOURS', x + ASK_COL.yours, y + 28, 'center');
  info.rows.forEach((r, i) => {
    const ry = y + 40 + i * 11;
    mText(ctx, r.same ? 'label' : 'text', r.label, x + 14, ry, 'left');
    mText(ctx, r.same ? 'label' : 'gold', r.run, x + ASK_COL.run, ry, 'center');
    mText(ctx, r.same ? 'label' : 'text', r.yours, x + ASK_COL.yours, ry, 'center');
    mText(ctx, r.same ? 'hint' : 'crimson', r.same ? 'SAME' : 'DIFFERS', x + ASK_COL.same, ry, 'center');
  });
  const differs = info.rows.some((r) => !r.same);
  if (info.rows.some((r) => r.fixed && !r.same)) mText(ctx, 'hint', ASK_WORDS.ledges, VW / 2, y + 88, 'center');
  if (differs) {
    mText(ctx, 'gold', ASK_WORDS.ask, VW / 2, y + 102, 'center');
    mText(ctx, 'hint', ASK_WORDS.only, VW / 2, y + 113, 'center');
  } else {
    mText(ctx, 'text', ASK_WORDS.match, VW / 2, y + 106, 'center');
  }
  drawHints(ctx, askHints(info, pad), VW / 2, y + A.h - 14, 14);
}

// --- the scoreboard's prompt -------------------------------------------------------------

/**
 * On the scoreboard's key panel, the row of keys under SPACE TO CLIMB AGAIN -- [S] STATS
 * [ESC] MENU, centred (gameoverskin.js BOARD_KEYS) -- gets the replay's two keys either side
 * of it, keycaps and words as the row's own are: the instant replay on the left and the race
 * against the best run on the right (or, if the run could not be kept, a quiet NOT SAVED there
 * instead). `box` is the key panel's inside box (screens.js boardKeysBox); the keys sit on its
 * opaque well like the rest of the row. They were 'R REPLAY' and 'G RACE BEST' in the zone's
 * label ink, beside a row that is keycaps now.
 */
export const BOARD_GAP = 14;    // view units between a key's words and the next keycap: the row's own gap and two
/** The least field left between a word and the panel's frame [view units]. */
export const BOARD_MARGIN = 6;
/**
 * The two and where each starts [view units], for this board and device: { word, pair, x, w },
 * `pair` the [key, words, role] mHints draws, `word` the two as one string, `w` the drawn width.
 */
export function boardReplayLayout(box, { replay, race, saved, pad }) {
  const mid = box.x + box.w / 2;
  const rw = hintsWidth(BOARD_KEYS, BOARD_KEYS_GAP);
  // Where mHints draws the row: rounded as it rounds it.
  const r0 = Math.round(mid - rw / 2), r1 = r0 + rw;
  const out = [];
  const place = (pair, side) => {
    const w = hintsWidth([pair]);
    const room = side < 0 ? r0 - (box.x + BOARD_MARGIN) - w : box.x + box.w - BOARD_MARGIN - r1 - w;
    const gap = Math.min(BOARD_GAP, room);
    out.push({ word: pair.filter(Boolean).join(' '), pair, x: side < 0 ? r0 - gap - w : r1 + gap, w });
  };
  if (replay) place([pad ? 'RB' : 'R', 'REPLAY'], -1);
  const right = saved === false ? ['', 'NOT SAVED'] : race ? [pad ? 'LB' : 'G', 'RACE BEST'] : null;
  if (right) place(right, 1);
  return out;
}
export function drawBoardReplay(ctx, skin, box, opts) {
  for (const { pair, x } of boardReplayLayout(box, opts)) mHints(ctx, [pair], x, box.y + KEYS_ROWS.hints, 0, 'left');
}

// --- the race's readout ------------------------------------------------------------------

/** Top centre, between FLOOR and SCORE, over nothing the HUD draws [view units]. */
export const READOUT = { y: 2, h: 13, note: 9 };   // note: the second line's height (GHOST ONLY)
/**
 * Where the ghost is, in floors, from the racer's lead (+ he is ahead). The ghost is the
 * subject -- its name is lettered first, in its own tone -- so the words say where IT is:
 * GHOST 20 FLOORS AHEAD in crimson while it beats you, GHOST 4 FLOORS BEHIND in gold once
 * you beat it. The first cut said "GHOST 20 BEHIND" for a racer twenty floors behind, which
 * reads as the ghost being behind.
 */
export function readoutText(lead) {
  const n = Math.abs(lead), fl = n === 1 ? ' FLOOR ' : ' FLOORS ';
  return lead < 0 ? n + fl + 'AHEAD' : lead > 0 ? n + fl + 'BEHIND' : 'LEVEL';
}
/**
 * Under the readout when the race is on the seed alone (GHOST ONLY): a replay this build does
 * not play, so the ghost's own tower could not be surveyed (race.js), and the racer's ledges
 * are laid out by his own climb -- where the ghost stands there may be none.
 */
export const LEDGES_NOTE = 'LEDGES MAY DIFFER';
export function drawRaceReadout(ctx, lead, ghostOnly = false) {
  const word = readoutText(lead);
  const w1 = textWidth('GHOST') + 6 + textWidth(word);
  const w = Math.max(w1, ghostOnly ? textWidth(LEDGES_NOTE) : 0) + 16;
  const x = Math.round(VW / 2 - w / 2);
  const tx = x + 8 + Math.round((w - 16 - w1) / 2);
  mPanel(ctx, x, READOUT.y, w, READOUT.h + (ghostOnly ? READOUT.note : 0));
  mText(ctx, GHOST_INK, 'GHOST', tx, READOUT.y + 3, 'left');
  mText(ctx, lead > 0 ? 'gold' : lead < 0 ? 'crimson' : 'text', word, tx + textWidth('GHOST') + 6, READOUT.y + 3, 'left');
  if (ghostOnly) mText(ctx, 'label', LEDGES_NOTE, VW / 2, READOUT.y + 3 + READOUT.note, 'center');
}

// --- painted ahead -----------------------------------------------------------------------

/** The pieces the screens above draw, for the title screen's warm-up (screens.js). */
export function replayWarmList(warm) {
  const caps = ['SPACE', '< >', '^ V', 'ESC', 'A', 'B', 'X', 'Y', 'N', 'LB', 'RB', 'LB RB', 'UP DN', 'R', 'P', 'DEL', 'E', 'I'];
  return [
    warm.line('REPLAYS', 2, 'gold'), warm.panel(LIST.w, LIST.h), warm.select(LIST.w - 8, 11),
    warm.panel(OVERLAY.w, OVERLAY.h), warm.panel(OFFER.w, OFFER.h, 'THAT WAS THE END'),
    warm.panel(OFFER.w, OFFER.h, 'END OF THE RUN'), warm.panel(CONFIRM.w, CONFIRM.h, 'DELETE THIS REPLAY', 'crimson'),
    warm.panel(RACE_ASK.w, RACE_ASK.h, RACE_TITLES.list), warm.panel(RACE_ASK.w, RACE_ASK.h, RACE_TITLES.board),
    warm.gauge(OVERLAY.w - 14, 3, OR[4]), warm.ink(GHOST_INK), warm.ink('off'), warm.ink('crimson'), warm.gem(true),
    ...caps.map((k) => warm.cap(k)),
  ];
}

export { NIGHT };
