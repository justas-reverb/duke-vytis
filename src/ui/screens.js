// Menu, game-over and the stats screens.
//
// The stats screen is four pages, navigated with left/right. Everything shown is read
// from the persisted record or derived from it in stats.js -- nothing is counted here,
// so the screen cannot disagree with the save file.

import { drawText, drawTextShadow, drawTextOutline, textWidth } from '../render/font.js';
import { drawSprite, RUN_CYCLE } from '../render/sprites.js';
import { drawEmblem, EMB_WW, EMB_WH } from '../render/emblem.js';
import {
  mText, mLine, mTitle, mPrompt, mKeyLine, keyLineSpan, mPanel, mPlate, mSelect, mPointer, mBar, mColumn,
  mGem, mSparkle, mRule, mCompose, shine, shineIndex, breath, warm, warmMenu, menuWarmList, OR,
} from '../render/menuskin.js';
import { PX, VW, VH, SW, SH, FIRST_THEME_FLOORS, FLOORS_PER_THEME, HUD_OUT, SKIP_PROMPT_AT, DIFFICULTIES } from '../game/constants.js';
import { THEMES } from '../game/themes.js';
import { COMBO_TIERS, airJumpWords } from '../game/flavour.js';
import { derived } from '../game/stats.js';
import { ACHIEVEMENTS, progress } from '../game/achievements.js';
import { optionsFor, isFullscreen, DEFAULTS, PLATFORM_WORDS, GRAVITY_WORDS } from '../game/settings.js';
import {
  boardSkinFor, fallSkinFor, boardLine, boardFade, drawBoardPanel, drawBoardTitle, PANELS, STAT_AT,
  IMPACT_WORDS, BOARD_INKS, BOARD_PROMPT, BOARD_KEYS, BOARD_KEYS_GAP, KEYS_ROWS,
} from '../render/gameoverskin.js';
import { replayWarmList } from '../render/replayskin.js';
import { IMPACT_FADE } from '../game/constants.js';
import { newCanvas, touchCanvas } from '../render/canvases.js';
import { mHints, mPromptOn, menuWarmNow, fillView } from '../render/menuskin.js';

export const PAGES = ['RECORDS', 'AVERAGES', 'THE TOWER', 'AWARDS'];

const INK = '#ffffff';
const DIM = '#8a8fa8';
const GOLD = '#ffe23d';
// Vibrant accents. Numbers and key-caps get these; the words around them stay dim, so
// the eye lands on the thing that actually varies.
const KEYCAP = '#ff9f45';
const VALUE = '#5ce1ff';
const VALUE2 = '#7dff8a';
const BG = '#0e0a16';
const PANEL = '#1a1428';
const LINE = '#2e2444';

export function fmtTime(s) {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h) return h + 'H ' + String(m).padStart(2, '0') + 'M';
  if (m) return m + 'M ' + String(sec).padStart(2, '0') + 'S';
  return sec + 'S';
}

export function fmtNum(n) {
  n = Math.round(n);
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 100000) return Math.round(n / 1000) + 'K';
  return String(n);
}

function panel(ctx, x, y, w, h, title, accent) {
  ctx.fillStyle = PANEL;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = LINE;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h);
  if (title) {
    ctx.fillStyle = BG;
    ctx.fillRect(x + 5, y - 1, textWidth(title) + 6, 3);
    drawText(ctx, title, x + 8, y - 4, accent || GOLD, 1, 'left');
  }
}

/**
 * Draw a line of [key, words] pairs with the key-caps highlighted.
 * Returns the width drawn, so callers can centre it.
 */
function keyLine(ctx, pairs, x, y, align = 'center', gap = 10) {
  let total = 0;
  for (const [k, label] of pairs) total += textWidth(k) + 3 + textWidth(label) + gap;
  total -= gap;
  let px = align === 'center' ? Math.round(x - total / 2) : Math.round(x);
  for (const [k, label] of pairs) {
    // Key-cap: a filled block, the way a key looks on a keyboard.
    const kw = textWidth(k);
    ctx.fillStyle = '#2a2138';
    ctx.fillRect(px - 2, y - 2, kw + 4, 11);
    ctx.fillStyle = KEYCAP;
    ctx.fillRect(px - 2, y + 8, kw + 4, 1);
    drawText(ctx, k, px, y, KEYCAP, 1, 'left');
    px += kw + 5;
    drawText(ctx, label, px, y, DIM, 1, 'left');
    px += textWidth(label) + gap;
  }
  return total;
}

function row(ctx, label, value, x, y, w, vcol = INK) {
  drawText(ctx, label, x, y, DIM, 1, 'left');
  drawText(ctx, value, x + w, y, vcol, 1, 'right');
}

// ---------------------------------------------------------------------------
// The header.
//
// The title is TWO words with the Duke's shield struck between them, so it cannot be
// one centred string any more -- each half is measured and placed against the emblem's
// own width. Everything below derives from headerBox(), which is the single place that
// knows how wide any of it is; the frame is then sized to the widest line rather than
// to a number somebody typed and hoped was big enough.
export const WORD_L = 'DUKE';
export const WORD_R = 'VYTIS';
export const SUBTITLE = 'AND THE QUEST FOR NEW LANDS';
export const TITLE_SCALE = 4;
export const SUB_SCALE = 2;
export const EMB_AIR = 14;   // clear world units either side of the shield
export const BOX_PAD = 18;   // from the widest line to the frame
export const GLOW_RINGS = 9; // how far the halo reaches outside the frame
export const BOB = 3;        // how far the words drift up and down inside it

/**
 * Every number the header is drawn from, in one place.
 *
 * Exported because tools/test-emblem.mjs asserts against it. "The shield does not cover
 * a letter" and "the glow is not off the edge of the screen" are arithmetic, and
 * arithmetic is checkable -- but only if the check reads the SAME numbers the renderer
 * draws from rather than a second copy of them that can drift.
 *
 * Spans are the static layout. The words and the emblem bob by +/-BOB inside the frame,
 * which does not move.
 */
export function headerBox() {
  const lw = textWidth(WORD_L, TITLE_SCALE);
  const rw = textWidth(WORD_R, TITLE_SCALE);
  const titleW = lw + EMB_AIR + EMB_WW + EMB_AIR + rw;
  const subW = textWidth(SUBTITLE, SUB_SCALE);
  const w = Math.max(titleW, subW) + BOX_PAD * 2;
  const titleTop = 30;
  const titleH = 7 * TITLE_SCALE;
  const subTop = titleTop + titleH + 10;
  const subH = 7 * SUB_SCALE;
  const top = titleTop - 14;
  const left = Math.round(VW / 2 - titleW / 2);
  const embCx = left + lw + EMB_AIR + EMB_WW / 2;
  const embCy = titleTop + titleH / 2;
  return {
    x: Math.round((VW - w) / 2), y: top, w, h: (subTop + subH + 12) - top,
    lw, rw, titleW, subW, titleTop, titleH, subTop, subH, left,
    wordL: { x0: left, x1: left + lw },
    wordR: { x0: left + titleW - rw, x1: left + titleW },
    emblem: {
      cx: embCx, cy: embCy,
      x0: embCx - EMB_WW / 2, x1: embCx + EMB_WW / 2,
      y0: embCy - EMB_WH / 2, y1: embCy + EMB_WH / 2,
    },
    sub: { x0: (VW - subW) / 2, x1: (VW + subW) / 2, y0: subTop, y1: subTop + subH },
  };
}

/** A 1px rectangle outline. Drawn as four bars that do not overlap at the corners, so
 *  a translucent colour blends once per pixel instead of twice. */
function frameRect(ctx, x, y, w, h, colour) {
  ctx.fillStyle = colour;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y + 1, 1, h - 2);
  ctx.fillRect(x + w - 1, y + 1, 1, h - 2);
}

/**
 * The glowing frame around the header.
 *
 * The halo is concentric 1px RINGS, never stacked translucent rectangles. N overlapping
 * alpha draws compose to 1 - prod(1 - a), not to the sum, so a stack of soft rects goes
 * opaque in the middle and the falloff nobody asked for eats the art behind it. Rings
 * touch and do not overlap, so each pixel is blended exactly once and the ramp is the
 * one written here.
 */
function glowFrame(ctx, b, t) {
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.7);
  const RINGS = GLOW_RINGS;
  for (let k = RINGS; k >= 1; k--) {
    const f = 1 - (k - 1) / RINGS;
    const a = Math.round((0.07 + 0.43 * f * f) * (0.58 + 0.42 * pulse) * 255);
    frameRect(ctx, b.x - k, b.y - k, b.w + k * 2, b.h + k * 2,
      '#ffd24a' + a.toString(16).padStart(2, '0'));
  }
  // Interior, dark enough that the title reads over the live demo behind the menu.
  ctx.fillStyle = '#0b0718e0';
  ctx.fillRect(b.x, b.y, b.w, b.h);
  // Frame proper: keyline, gold band, keyline.
  frameRect(ctx, b.x, b.y, b.w, b.h, '#140f1e');
  frameRect(ctx, b.x + 1, b.y + 1, b.w - 2, b.h - 2, '#f0c040');
  frameRect(ctx, b.x + 2, b.y + 2, b.w - 4, b.h - 4, '#8a6a1e');
  frameRect(ctx, b.x + 3, b.y + 3, b.w - 6, b.h - 6, '#140f1e');

  // Corner studs, so the frame reads as a made object rather than a CSS border.
  for (const [cx, cy] of [[b.x, b.y], [b.x + b.w - 5, b.y],
    [b.x, b.y + b.h - 5], [b.x + b.w - 5, b.y + b.h - 5]]) {
    ctx.fillStyle = '#140f1e';
    ctx.fillRect(cx, cy, 5, 5);
    ctx.fillStyle = '#f0c040';
    ctx.fillRect(cx + 1, cy + 1, 3, 3);
    ctx.fillStyle = '#ffe97a';
    ctx.fillRect(cx + 1, cy + 1, 1, 1);
  }
}

/**
 * The title in the Duke's skin (menuskin.js mTitle): a crimson plaque in a gold moulding
 * with a breathing halo, DUKE and VYTIS lettered in polished gold either side of the arms,
 * the subtitle in argent. The box, the words' places and the bob are headerBox()'s, as they
 * were; what was glowFrame()'s nine translucent rings, a 1px gold keyline round a dark wash
 * and the font at scale 4 in a brown outline is painted once and drawn in a few blits.
 */
function drawTitle(ctx, t, bob) {
  mTitle(ctx, headerBox(), t, bob, { left: WORD_L, right: WORD_R, sub: SUBTITLE });
}

function hbar(ctx, x, y, w, h, frac, fill, back = '#00000066') {
  ctx.fillStyle = back;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, Math.max(frac > 0 ? 1 : 0, Math.round(w * Math.min(1, Math.max(0, frac)))), h);
}

// ---------------------------------------------------------------------------
// The title screen's rows, and the plaque the key hints stand on. R REPLAYS joined the row of
// keys that open a screen, where it fits: that row was the narrowest (147 units drawn against
// the first row's 217), and with it the row is 218, the first row's width to a unit, so the
// plaque round the rows keeps its size and the other two rows keep their places.
const MENU_KEYS = [
  [[['ARROWS', 'MOVE'], ['SPACE', 'JUMP'], ['HOLD', 'TO CHAIN']], 226, 10],
  [[['S', 'STATS'], ['H', 'HELP'], ['O', 'OPTIONS'], ['R', 'REPLAYS']], 240, 12],
  [[['F', 'FULLSCREEN'], ['P', 'PAUSE'], ['M', 'MUTE']], 254, 12],
];
/**
 * The plaque under the key hints [view units]: from three units over the first row's keycaps
 * to under the last's. It is there because the attract run puts a companion's call box --
 * two lines of text in a frame -- at the bottom of the screen, right under these rows, and
 * over the plain letters the two sets of words read as one (the before pictures of this
 * change show THE LONGBOW's call printed through STATS, HELP and GRAPHICS).
 */
const KEY_PLATE = { y: 219, h: 49, pad: 10 };
/**
 * The key plaque's left and right [view units]: `pad` round where the three rows are DRAWN
 * (menuskin.js keyLineSpan), not round the width keyLine centres them by, which is six units
 * short -- a plaque sized by it held the rows two units right of its middle, 1 unit of field
 * right of TO CHAIN against 5.5 left of ARROWS.
 */
function keyPlateX() {
  const spans = MENU_KEYS.map(([p, , g]) => keyLineSpan(p, VW / 2, 'center', g));
  return [Math.min(...spans.map((s) => s[0])) - KEY_PLATE.pad, Math.max(...spans.map((s) => s[1])) + KEY_PLATE.pad];
}
/**
 * The records' plaque [view units]: the key hints' plaque grown up under the prompt's and out
 * to the records' width, so BEST FLOOR, BEST SCORE and AWARDS stand on it too. Its top edge
 * (185) lies under the prompt's plaque, which is drawn after it and so sits on it -- one
 * made thing, the hero's bar mounted on the panel -- and it is two units narrower each side
 * than the prompt's (90 to 390 against 88 to 392), so the bar stands proud of it.
 *
 * The records floated over the demo on their own keylines at first, and a keyline covers a
 * letter and nothing between the lines: the attract run's companion calls stack up from the
 * bottom of the screen, and a long call or a handover of two reaches row 192, where its own
 * words would print between BEST FLOOR and AWARDS as the key hints' once printed through
 * STATS and HELP. A badge under each record was tried first; three small framed labels read
 * as stickers stuck on the demo.
 */
const RECORDS_PLATE = { x: 90, y: 185, w: 300, h: 83 };
function lowerPlate(records) {
  if (records) return RECORDS_PLATE;
  const [x0, x1] = keyPlateX();
  return { x: x0, y: KEY_PLATE.y, w: x1 - x0, h: KEY_PLATE.h };
}
/**
 * Where the sound notice sits [view row; 154]. It was at 184, straight under the prompt with
 * no gap, and the rows under it are the records' at 196; the prompt's plaque (menuskin.js
 * PROMPT_PLATE) now runs to 191 and the records' plaque holds the rows under it, so the
 * notice sits just over the prompt, on a tab across the plaque's top rail (SOUND_TAB: three
 * units above the text, one under it and onto the rail). It is the one element of the title
 * screen that moved further than a few units, and it is only ever shown in a browser before
 * its first key.
 */
const SOUND_Y = 154;
/** The notice's words, in the phrases a narrow place breaks it at. */
const SOUND_WORDS = ['CLICK OR PRESS A KEY', 'TO ENABLE SOUND'];
/**
 * The notice once a pad has been used. A browser lets a page start sound only from a click, a
 * key or a touch, and a gamepad's buttons are none of those (Chromium, Safari): a player on a
 * pad alone pressed A at "PRESS A KEY", heard nothing, and was in a run with the notice gone.
 * Nothing the page can do lets the pad start it, so this says what will.
 */
const SOUND_PAD_WORDS = ['A PAD CANNOT START SOUND:', 'CLICK OR PRESS A KEY'];
/** The notice on a phone, which has no key to press: its first tap starts the sound. */
const SOUND_TOUCH_WORDS = ['TAP THE SCREEN', 'TO ENABLE SOUND'];
/** The tab: 4 units over the first line and under the last, 8 either side of the widest. */
const SOUND_TAB = { dy: -4, h: 15, pad: 8 };
const SOUND_LEAD = 9;   // [view units] from one line's top to the next's: 7 of letter, 2 of gap
/**
 * Where main.js puts the notice on every screen but the title, by game state, each clear of
 * what that screen draws [view units]: `y` the first line's top, centred on one line -- or,
 * with `w`, broken into lines of at most `w` on a plate whose left edge is `x` (or centred
 * without one). It stays up on all of them until there is sound: on the title alone, a pad
 * player's first press started the run and took the notice with it, in silence.
 *
 * In the run and the fall, two lines at the top, between FLOOR and SCORE: on one line its ends
 * reached x 95 and 386, and a six-digit score (from x 381, rows 14 down) ran into it; on two
 * they are 158 and 323, clear of a nine-digit one (from 339).
 * The pause, the stats (between their panels, at most row 239, and the key hints at 260) and
 * the help (between its panel, to 232, and PRESS ANY KEY at 250) have a free band for one line.
 * The options and the scoreboard have none a whole line wide: the options' goes left of its
 * title and over the fullscreen line (27), the board's left of its head plate (from x 135) and
 * over its panels (from row 60). A state not listed -- a screen added later -- gets none, rather
 * than a notice where it has not been looked at.
 */
export const SOUND_PLACES = {
  tutorial: { y: 5, w: 150 },
  playing: { y: 5, w: 150 },
  falling: { y: 5, w: 150 },
  paused: { y: 236 },
  stats: { y: 245 },
  help: { y: 238 },
  options: { x: 8, y: 5, w: 150 },
  dead: { x: 36, y: 12, w: 72 },
};

/**
 * The notice's lines at most `w` wide (any width when `w` is not given): whole if it fits, else
 * a phrase a line, and a phrase too wide broken between words.
 */
function soundLines(pad, w = Infinity) {
  const words = pad === 'touch' ? SOUND_TOUCH_WORDS : pad ? SOUND_PAD_WORDS : SOUND_WORDS;
  const whole = words.join(' ');
  if (textWidth(whole) <= w) return [whole];
  const lines = [];
  for (const phrase of words) {
    let line = '';
    for (const word of phrase.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && textWidth(next) > w) { lines.push(line); line = word; } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

/** The notice's plate for its lines: width and height [view units]. */
const soundPlate = (lines) => ({
  w: Math.max(...lines.map((s) => textWidth(s))) + 2 * SOUND_TAB.pad,
  h: SOUND_TAB.h + (lines.length - 1) * SOUND_LEAD,
});

/**
 * The sound notice on its tab at `at` (see SOUND_PLACES; on the title, one line at SOUND_Y);
 * `pad` true for the pad's wording, 'touch' for a phone's. Each line is centred on the plate.
 */
export function drawSoundNotice(ctx, t, pad, at = { y: SOUND_Y }) {
  const lines = soundLines(pad, at.w);
  const p = soundPlate(lines);
  const x = at.x !== undefined ? at.x : Math.round(VW / 2 - p.w / 2);
  const cx = at.x !== undefined ? x + p.w / 2 : VW / 2;
  mPlate(ctx, 'panel', x, at.y + SOUND_TAB.dy, p.w, p.h);
  lines.forEach((s, i) => mText(ctx, 'gold', s, cx, at.y + i * SOUND_LEAD, 'center', breath(t, 1.3), 'label'));
}
/** The title screen's background with no demo behind it (under HELP), and the options' and
 *  stats' own: the old flat dark, warmed a step toward the plates' plum. */
const MENU_BG = '#0d080e';

/**
 * The title screen. `soundBlocked`: false, or the notice's wording (true for the keys', 'pad',
 * 'touch'). `touch`: null on a desktop; on a phone { pressed }, the key of the button a finger is
 * on now (ui/touch.js pressedCode), and the key hints become buttons (TOUCH_BUTTONS, below).
 */
export function drawMenu(ctx, all, t, frameT, liveBackdrop = false, soundBlocked = false, touch = null) {
  // The other screens' pieces, one a frame while this one is up (menuskin.js).
  warmMenu();
  if (!liveBackdrop) {
    ctx.fillStyle = MENU_BG;
    fillView(ctx);
    // Drifting starfield, for the case where there is no demo running behind: stars of one
    // and two ART pixels now, where they were four-pixel squares, the only coarse thing
    // left on the screen.
    const U = 1 / PX;
    for (let i = 0; i < 70; i++) {
      const sx = (i * 97) % VW;
      const sy = ((i * 53) + t * (8 + (i % 5) * 6)) % VH;
      ctx.fillStyle = i % 7 === 0 ? OR[5] : i % 3 === 0 ? '#9c9087' : '#4a443d';
      const s = i % 7 === 0 || i % 5 === 0 ? 2 * U : U;
      ctx.fillRect(sx, Math.round(sy * PX) / PX, s, s);
    }
  }

  // The words and the arms bob a whole ART pixel at a time -- they are lettered at art
  // resolution now -- where they used to jump a whole view unit, four pixels.
  const bob = Math.round(Math.sin(t * 2.2) * BOB * PX) / PX;
  drawTitle(ctx, t, bob);

  // With a live demo behind, the real character is already on screen doing this for
  // real -- a second one running on the spot would just be confusing.
  if (!liveBackdrop) {
    // Drive it off RUN_CYCLE rather than a hard-coded list -- its length is the sheet's
    // now and a literal four would have silently dropped two of them.
    const frame = RUN_CYCLE[Math.floor(t * 11) % RUN_CYCLE.length];
    drawSprite(ctx, frame, VW / 2, 142, Math.floor(t * 0.5) % 2 === 1, 0, 0);
    mPlate(ctx, 'panel', VW / 2 - 40, 142, 80, 4);
  }

  // The plaque the records and the key hints stand on, under the prompt's, which is drawn
  // over its top edge and so sits on it (lowerPlate). Plaque, records and keys are one
  // composite (menuskin.js mCompose): a hundred glyph and keycap blits drawn once and kept
  // until a run sets a new best.
  const has = all.totalRuns > 0;
  const recs = touch ? drawTouchLower(ctx, all, t, touch.pressed) : drawLower(ctx, all);

  // Always there, breathing: it used to blink off for a fifth of every cycle, so a player
  // glancing at the screen could see no prompt at all. On a phone, the button in its place.
  if (touch) drawClimb(ctx, t, touch.pressed === 'Space');
  else mPrompt(ctx, VW / 2, 170, t);

  // Browsers refuse to make a sound until the page has had a real click or keypress,
  // and there is no way to ask nicely. Say so, rather than letting the player conclude
  // the game has no music -- it disappears the instant sound comes up. It breathes from
  // silver to gold rather than blinking between two oranges, on a tab mounted on the
  // prompt's top rail (SOUND_Y), as a panel's title sits on its rail. `soundBlocked` is
  // 'pad' once a pad has been used, for the pad's wording.
  if (soundBlocked) {
    const kind = soundBlocked === 'pad' ? true : soundBlocked === 'touch' ? 'touch' : false;
    drawSoundNotice(ctx, t, kind, touch ? { y: TOUCH_SOUND_Y } : undefined);
  }

  // The records' moment of shine: a sparkle on one of them, in the cycles the title's
  // glint sits out (menuskin.js shine).
  const u = shine('record', t);
  if (has && u >= 0) {
    const [label, value, cx] = recs[shineIndex(t) % 2];
    mSparkle(ctx, statLeft(label, value, cx) + textWidth(label) + 5, 196, u);
  }
  void frameT;
}

/** The lower plaque with the records and the key hints on it, as one composite; returns the records. */
function drawLower(ctx, all) {
  const { has, recs, pr, awards } = titleRecords(all);
  const low = lowerPlate(has);
  // Two families: the keys alone (a first run, painted ahead) and the records, which a new
  // best replaces.
  mCompose(ctx, has ? 'records' : 'keys', recs.map((r) => r[1]).concat(awards).join(':'), low.x, low.y, low.w, low.h, (g) => {
    mPlate(g, 'lower', low.x, low.y, low.w, low.h);
    drawRecords(g, recs, pr, awards);
    for (const [pairs, y, gap] of MENU_KEYS) mKeyLine(g, pairs, VW / 2, y, 'center', gap);
  });
  return recs;
}
// ---------------------------------------------------------------------------
// THE TITLE SCREEN ON A PHONE (drawMenu's `touch`). A phone has no keys to name, so what the key
// hints said becomes things to tap: TAP TO CLIMB where PRESS SPACE TO CLIMB stands, and a button
// for each screen a key opens, on the plaque where the hints stood -- the user, 2026-09-29, "can
// we rebuild a nice menu screen for the mobile version so its easier to use?". What a finger hits
// is what is drawn (menuTargets), in the same view units.

/**
 * TAP TO CLIMB [view units]: about the prompt's width, where it stood, a thumb tall. The view is
 * about 411 CSS px tall on a phone held sideways, 1.5 px a unit, so 34 units is about 52 px:
 * Android's 48 dp touch target, and a little.
 */
const CLIMB = { w: 236, h: 34, y: 150 };
export const CLIMB_WORDS = 'TAP TO CLIMB';
/** The row of buttons [view units]: its top and height, a word's pad each side, the gap between. */
const TOUCH_ROW = { y: 226, h: 30, pad: 10, gap: 8 };
/**
 * Each button's word and the key it presses: the title's own keys (O S R H), OPTIONS first --
 * it holds TOUCH KEYS, the size of the keys in a run. At scale 2 and 10 a side the row is 410
 * units wide, the title box's own width, so the screen's top and bottom line up.
 */
const TOUCH_BUTTONS = [['OPTIONS', 'KeyO'], ['STATS', 'KeyS'], ['REPLAYS', 'KeyR'], ['HELP', 'KeyH']];
/** How far past its plate a finger still presses a button [view units; half the row's gap]. */
const TOUCH_SLOP = 4;
/** The sound notice on the phone's title [view row]: over TAP TO CLIMB, where it cannot cover it. */
const TOUCH_SOUND_Y = 132;

let touchRow = null;
/** The four buttons laid out, [{ word, code, x, y, w, h }]: each its word and TOUCH_ROW.pad a side, the row centred. */
function touchButtons() {
  if (touchRow) return touchRow;
  const ws = TOUCH_BUTTONS.map(([word]) => textWidth(word, 2) + 2 * TOUCH_ROW.pad);
  let x = Math.round((VW - ws.reduce((a, b) => a + b, 0) - TOUCH_ROW.gap * (ws.length - 1)) / 2);
  touchRow = TOUCH_BUTTONS.map(([word, code], i) => {
    const b = { word, code, x, y: TOUCH_ROW.y, w: ws[i], h: TOUCH_ROW.h };
    x += ws[i] + TOUCH_ROW.gap;
    return b;
  });
  return touchRow;
}
const climbBox = () => ({ x: Math.round(VW / 2 - CLIMB.w / 2), y: CLIMB.y, w: CLIMB.w, h: CLIMB.h });

/**
 * The phone's plaque [view units]: under the records and the buttons, its top rail under TAP TO
 * CLIMB's foot, as the desktop's lies under the prompt's -- or round the buttons alone before a
 * first run, when there are no records.
 */
function touchPlate(records) {
  const row = touchButtons(), last = row[row.length - 1];
  const x0 = row[0].x - 8, x1 = last.x + last.w + 8;
  const y0 = records ? CLIMB.y + CLIMB.h - 6 : TOUCH_ROW.y - 10;
  return { x: x0, y: y0, w: x1 - x0, h: TOUCH_ROW.y + TOUCH_ROW.h + 10 - y0 };
}

let touchTargets = null;
/**
 * What a finger can tap on the phone's title screen, [{ x, y, w, h, code }] in view units: TAP TO
 * CLIMB (SPACE) and the four buttons, each grown by TOUCH_SLOP so a thumb a little off still
 * presses it -- never into a neighbour's, which is two slops away.
 */
export function menuTargets() {
  if (touchTargets) return touchTargets;
  const s = TOUCH_SLOP, grow = (b, code) => ({ x: b.x - s, y: b.y - s, w: b.w + 2 * s, h: b.h + 2 * s, code });
  touchTargets = [grow(climbBox(), 'Space'), ...touchButtons().map((b) => grow(b, b.code))];
  return touchTargets;
}

/**
 * TAP TO CLIMB: crimson enamel in a gold rim, its glint crossing on the prompt's clock -- a
 * menu's selected row made big, the one thing on the screen to press. Under a finger it sinks
 * into a dark plate, the words a unit lower.
 */
function drawClimb(ctx, t, pressed) {
  const c = climbBox();
  const ty = c.y + Math.round((c.h - 14) / 2);
  if (pressed) mPlate(ctx, 'lower', c.x, c.y, c.w, c.h);
  else mSelect(ctx, c.x, c.y, c.w, c.h, t);
  mLine(ctx, 'gold', CLIMB_WORDS, VW / 2, ty + (pressed ? 1 : 0), 2, 'center');
}

/** A button of the row: a plate and its word in silver; under a finger, the selected row's crimson and gold. */
function touchButton(ctx, b, on, t) {
  if (on) mSelect(ctx, b.x, b.y, b.w, b.h, t);
  else mPlate(ctx, 'panel', b.x, b.y, b.w, b.h);
  mLine(ctx, on ? 'gold' : 'argent', b.word, b.x + b.w / 2, b.y + Math.round((b.h - 14) / 2), 2, 'center');
}

/** The phone's plaque with the records and the buttons on it, as one composite, and the pressed one over it; returns the records. */
function drawTouchLower(ctx, all, t, pressed) {
  const { has, recs, pr, awards } = titleRecords(all);
  const low = touchPlate(has);
  mCompose(ctx, has ? 'touch-records' : 'touch-keys', recs.map((r) => r[1]).concat(awards).join(':'), low.x, low.y, low.w, low.h, (g) => {
    mPlate(g, 'lower', low.x, low.y, low.w, low.h);
    drawRecords(g, recs, pr, awards);
    for (const b of touchButtons()) touchButton(g, b, false, 0);
  });
  for (const b of touchButtons()) if (b.code === pressed) touchButton(ctx, b, true, t);
  return recs;
}

/**
 * The phone title's pieces, painted now (main.js, at load, on a phone): its first frame draws
 * them, and a run can start a second in.
 */
export function warmTouch() {
  const list = [
    warm.select(CLIMB.w, CLIMB.h), warm.plate('lower', CLIMB.w, CLIMB.h), warm.line(CLIMB_WORDS, 2, 'gold'),
    ...touchButtons().flatMap((b) => [warm.plate('panel', b.w, b.h), warm.select(b.w, b.h),
      warm.line(b.word, 2, 'argent'), warm.line(b.word, 2, 'gold')]),
    ...[true, false].map((r) => warm.plate('lower', touchPlate(r).w, touchPlate(r).h)),
    warm.draw((g) => drawTouchLower(g, { totalRuns: 0 }, 0, null)),
    warm.line(ATTRACT_TAP, 2, 'gold'), warm.line('HOW TO CLIMB', 2, 'gold'),
    warm.plate('panel', soundPlate(soundLines('touch')).w, soundPlate(soundLines('touch')).h),
    warm.plate('panel', textWidth(HELP_BACK_TOUCH) + 16, 15),
  ];
  menuWarmNow(list);
}

/** The records on a title plaque, the desktop's or the phone's: the two, then the awards under them. */
function drawRecords(g, recs, pr, awards) {
  for (const [label, value, cx] of recs) statLine(g, label, value, 'gold', cx, 196);
  if (pr) statLine(g, 'AWARDS', awards, VALUE2, VW / 2, 210);
}

/** The title's records, for the desktop's plaque and the phone's alike. */
function titleRecords(all) {
  const has = all.totalRuns > 0;
  // Two on the top line, well apart, and the awards on their own beneath. All three
  // centred on one line ran together into an unreadable strip.
  const recs = has ? [['BEST FLOOR', String(all.bestFloor), VW / 2 - 96], ['BEST SCORE', fmtNum(all.bestScore), VW / 2 + 96]] : [];
  const pr = has ? progress(all) : null;
  return { has, recs, pr, awards: pr ? pr.got + '/' + pr.total : '' };
}

/** Where a record's line starts: its label and value centred on cx, five units apart. */
const statLeft = (label, value, cx) => Math.round(cx - (textWidth(label) + 5 + textWidth(value)) / 2);
/** A record: the label quiet, the number in `role`. The number is what you came to read. */
function statLine(ctx, label, value, role, cx, y) {
  const left = statLeft(label, value, cx);
  mText(ctx, 'label', label, left, y, 'left');
  mText(ctx, role, value, left + textWidth(label) + 5, y, 'left');
}

// ---------------------------------------------------------------------------
// Colours kept from the old screens because they MEAN something a player has learned: green
// for good (full screen on, a frame rate that keeps up), orange for "do something about it".
const GOOD = '#7dff5a';
const WARN = '#ff8844';

/**
 * The options' row pitch [view units; 12]. It was 15 for eleven rows; JUMP SPEED and LOW
 * LATENCY made thirteen, and at 15 the two measured lines under the panel ran into the key
 * hints and off the bottom of the screen. At 13 they fitted with two units to spare over the
 * hints; at 12 the page keeps the room it had under them, and a selected row's plate (11 tall,
 * from 2 over its letters) clears the letters above and below it by three units.
 */
// 11 since DIFFICULTY made fifteen rows (2026-09-28): at 12 the measured lines ran into the
// key hints. The selected row's bar is 10 tall, so a row still clears the next.
// 10 since GRAVITY made sixteen (2026-09-29): at 11 the second measured line lay across the key
// hints. The selected row's plate (11 tall, from 2 over its letters) still clears the keylines of
// the rows above and below it by half a unit, and the panel ends where it did at eleven rows.
export const OPTION_ROW = 10;
/** Where the OPTIONS panel ends [view units]: four under the last row's letters, as ever. */
export function optionsPanelEnd(rows = optionsFor()) { return 50 + OPTION_ROW * (rows.length - 1) + 11; }

/**
 * The options screen. `rows`: the rows this screen shows (settings.js optionsFor -- a phone's has
 * TOUCH KEYS first and no LOW LATENCY); `sel` indexes them. `touch`: a phone, which has no F key
 * and is always full screen, so the fullscreen line goes and the hint names no keyboard keys.
 */
export function drawOptions(ctx, settings, sel, t, loop, rows = optionsFor(), touch = false) {
  ctx.fillStyle = MENU_BG;
  fillView(ctx);
  mLine(ctx, 'gold', 'OPTIONS', VW / 2, 8, 2, 'center');

  // The line that actually answers "why is it a tiny screen".
  const fs = isFullscreen();
  if (!touch) {
    mText(ctx, fs ? GOOD : WARN, fs ? 'FULLSCREEN: ON' : 'FULLSCREEN: OFF  <- PRESS F FOR A FULL 4K SCREEN',
      VW / 2, 28, 'center');
  }

  // Tall enough for every row: the panel grew with the COMPANIONS row, whose eleventh line sat
  // on the old panel's bottom edge, and the lines under it moved down. It is measured from its
  // last row now: sized from the row count at 15 apart, at 13 apart it ended on the last row's
  // letters. The lines under it keep their old distances from its end.
  const panelEnd = optionsPanelEnd(rows);
  mPanel(ctx, 40, 42, 400, panelEnd - 42);
  let y = 50;
  rows.forEach((o, i) => {
    const on = i === sel;
    // The selected row: crimson enamel in a gold rim where it was a lighter rectangle, the
    // pointer nudging, the label in gold. The rest stay quiet so the one row means something.
    if (on) {
      mSelect(ctx, 44, y - 2, 392, 11, t);
      mPointer(ctx, 50, y, t);
    }
    mText(ctx, on ? 'gold' : 'label', o.label, 50 + 2 * 6, y, 'left');
    // Action rows have no value to show; they show what pressing SPACE would do.
    if (o.action) {
      mText(ctx, on ? 'gold' : 'label', on ? 'SPACE' : '-', 430, y, 'right');
    } else {
      const v = settings[o.key];
      mText(ctx, on ? 'text' : 'label', o.show[String(v)] ?? String(v), 430, y, 'right');
    }
    y += OPTION_ROW;
  });

  // The hint for the selected row gets its own line. Drawing it beside the value made
  // the two collide on every row long enough to be worth reading.
  const note = rows[sel] && rows[sel].note;
  if (note) mText(ctx, 'label', note, VW / 2, panelEnd + 6, 'center');

  // The two measured lines 13 and 25 under the note's line (+6): with fourteen rows the panel
  // ends at 217, and at the old 16 and 28 the second line ended two units over the key hints.
  if (loop) {
    const hz = Math.round(loop.fps);
    const good = hz >= 100;
    mText(ctx, good ? GOOD : WARN, 'MEASURED ' + hz + ' FPS   ' + loop.cpuMs.toFixed(2) + ' MS/FRAME   SCALE x' +
      (Math.round((window.VYTIS_SCALE || 0) * 100) / 100) + '   BUFFER ' + SW + 'x' + SH,
      VW / 2, panelEnd + 19, 'center');
    // Not on a phone: its screen is the one it has, and in a phone's browser, where LOW LATENCY
    // makes seventeen rows, this line ran into the hint under it.
    if (!touch) {
      mText(ctx, 'label', 'YOUR SCREEN: ' + window.innerWidth + 'x' + window.innerHeight +
        (window.screen ? '   DISPLAY ' + window.screen.width + 'x' + window.screen.height : ''),
        VW / 2, panelEnd + 31, 'center');
    }
  }

  mText(ctx, 'hint', touch ? 'UP/DOWN PICK    LEFT/RIGHT CHANGE    ESC BACK'
    : 'UP/DOWN PICK    LEFT/RIGHT CHANGE    F FULLSCREEN    ESC BACK', VW / 2, VH - 10, 'center');
}

// ---------------------------------------------------------------------------
/**
 * Shown after Escape on the menu. If the browser allowed the close this is on screen
 * for a single frame; if it refused, it explains why rather than leaving a dead key.
 */
/** The farewell's panel and the refusal's [view units], each round its lines. */
const QUIT_PANEL = { x: 106, y: 119, w: 268, h: 30 };
const BLOCKED_PANEL = { x: 56, y: 84, w: 368, h: 94 };
/**
 * THE ATTRACT VIEW (main.js): after ATTRACT_IDLE seconds with no key, button or click on the
 * title screen, the menu and its wash fade out over ATTRACT_FADE seconds and the attract demo
 * is the whole screen -- the game played, nothing over it but this prompt -- until any input
 * brings the menu back. The user, 2026-09-29: "make the menu items disappear and allow for the
 * bot to be fully viewed if we are idle for 10 seconds on the screen. have a prompt to continue
 * playing flashing while thats going on."
 */
export const ATTRACT_IDLE = 10;      // s of no input on the title screen
export const ATTRACT_FADE = 0.6;     // s the menu takes to fade out
export const ATTRACT_PROMPT = 'PRESS ANY KEY TO CONTINUE';
/** The same on a phone, which has no key to press. */
export const ATTRACT_TAP = 'TAP TO CONTINUE';
/** The prompt's flash [Hz], and how far it dims between flashes [0..1 of its alpha]. */
const ATTRACT_FLASH = 1.2, ATTRACT_DIM = 0.2;
/** Where it stands [view units]: the prompt's baseline, over the bottom of the view. */
const ATTRACT_Y = VH - 38;
/**
 * The attract view's prompt, `k` the view's fade (0..1). It flashes -- the one thing on the
 * title screen that does, because the user asked for it -- as a soft square wave, most of each
 * cycle up and the rest dimmed to ATTRACT_DIM, never gone: a glance always finds it. On a plate,
 * as every word over the moving game stands (the menu's rule).
 */
export function drawAttractPrompt(ctx, t, k, touch = false) {
  const words = touch ? ATTRACT_TAP : ATTRACT_PROMPT;
  // The line's own width at scale 2, as mLine measures it: the letters' spacing grows with the
  // scale, so twice the scale-1 width was 48 units short and the letters ran off both ends.
  const w = textWidth(words, 2) + 28;
  const x = Math.round(VW / 2 - w / 2);
  const wave = 0.5 + 0.5 * Math.tanh(4 * Math.cos(2 * Math.PI * ATTRACT_FLASH * t) + 1);
  const was = ctx.globalAlpha;
  ctx.globalAlpha = was * k * (ATTRACT_DIM + (1 - ATTRACT_DIM) * wave);
  mPanel(ctx, x, ATTRACT_Y - 7, w, 28);
  mLine(ctx, 'gold', words, VW / 2, ATTRACT_Y, 2, 'center');
  ctx.globalAlpha = was;
}

export function drawQuit(ctx, blocked, t) {
  ctx.fillStyle = '#05030ae0';
  fillView(ctx);
  // Each on a panel: under the wash the title screen and the attract run still move at an
  // eighth of their strength, and the refusal's last line lay right across the washed prompt.
  if (!blocked) {
    mPanel(ctx, QUIT_PANEL.x, QUIT_PANEL.y, QUIT_PANEL.w, QUIT_PANEL.h);
    mLine(ctx, 'gold', 'FAREWELL, CLIMBER', VW / 2, VH / 2 - 8, 2, 'center');
    return;
  }
  mPanel(ctx, BLOCKED_PANEL.x, BLOCKED_PANEL.y, BLOCKED_PANEL.w, BLOCKED_PANEL.h);
  mLine(ctx, 'crimson', 'CANNOT CLOSE THIS TAB', VW / 2, 92, 2, 'center');
  mText(ctx, 'label', 'THE BROWSER ONLY LETS A PAGE CLOSE A WINDOW IT OPENED.', VW / 2, 122, 'center');
  mText(ctx, 'label', 'LAUNCH WITH PLAY.BAT AND ESCAPE WILL QUIT PROPERLY.', VW / 2, 134, 'center');
  // Breathing from silver to white rather than blinking off.
  mText(ctx, 'text', 'CLOSE THE TAB, OR PRESS ANY KEY TO CARRY ON', VW / 2, 164, 'center', breath(t, 1.6), 'label');
}

// ---------------------------------------------------------------------------
/** Frozen mid-run. The run is intact; nothing here restarts anything. */
export function drawPaused(ctx, game, t) {
  ctx.fillStyle = '#05030ad0';
  fillView(ctx);

  // A whole art pixel at a time, as the title bobs.
  const bob = Math.round(Math.sin(t * 2) * 2 * PX) / PX;
  mLine(ctx, 'gold', 'PAUSED', VW / 2, 58 + bob, 3, 'center');

  mPanel(ctx, 140, 100, 200, 62, 'THIS RUN');
  const r = game.run;
  const line = (label, value, y, role) => {
    mText(ctx, 'label', label, 150, y, 'left');
    mText(ctx, role, value, 330, y, 'right');
  };
  line('FLOOR', String(r.maxFloor), 110, 'gold');
  line('SCORE', String(r.score), 122, 'gold');
  line('BEST COMBO', r.bestCombo + ' FLOORS', 134, VALUE2);
  line('TIME', fmtTime(r.seconds), 146, 'label');

  mKeyLine(ctx, [['ESC', 'RESUME'], ['S', 'STATS'], ['Q', 'QUIT TO MENU']], VW / 2, 186, 'center', 12);
  mText(ctx, 'label', 'THE TOWER WAITS', VW / 2, 212, 'center', breath(t, 1.6), 'hint');
}

// ---------------------------------------------------------------------------
/**
 * The help's heading and lines stand on one panel [view units], over the washed title screen
 * they are drawn over. It holds the heading too: the lines start at 34 and the heading ends at
 * 30, so a panel under the lines alone had its top rail touching the first row, MOVE on the
 * gold -- the one cramped box among the screens.
 */
const HELP_PANEL = { x: 30, y: 8, w: 420, h: 225 };
/** The help's way back on a phone, where a tap anywhere is it (main.js touchTargets). */
const HELP_BACK_TOUCH = 'TAP TO GO BACK';

/** The help. `touch`: a phone's -- its controls are the buttons on the screen, not keys. */
export function drawHelp(ctx, t, touch = false) {
  ctx.fillStyle = '#000000cc';
  fillView(ctx);
  mPanel(ctx, HELP_PANEL.x, HELP_PANEL.y, HELP_PANEL.w, HELP_PANEL.h);
  mLine(ctx, 'gold', 'HOW TO CLIMB', VW / 2, 16, 2, 'center');

  const lines = [
    ['MOVE', touch ? 'THE ARROWS, BOTTOM LEFT' : 'LEFT / RIGHT  OR  A / D'],
    ['JUMP', touch ? 'SPACE, BOTTOM RIGHT' : 'SPACE, UP, W OR Z'],
    ['HOLD JUMP', 'RE-JUMPS THE MOMENT YOU LAND.'],
    ['', 'CHAIN THEM TO KEEP A COMBO ALIVE.'],
    ['', ''],
    ['SPEED', 'KEEP RUNNING. THE METER FILLS.'],
    ['', 'A FULL METER JUMPS FOUR TIMES HIGHER'],
    ['', 'AND OPENS THE WALLS OUT.'],
    ['', ''],
    ['AIR JUMPS', 'ONLY WITH THE METER AT MAX.'],
    ['', 'TAP JUMP AGAIN IN THE AIR. TWICE IN A 250 COMBO.'],
    ['WALL BOUNCE', 'HIT A SIDE WALL WHILE AIRBORNE.'],
    ['', ''],
    ['COMBO', 'LAND TWO OR MORE FLOORS UP AND'],
    ['', 'KEEP DOING IT. STAND STILL AND IT ENDS.'],
    ['', 'EVERY 50 FLOORS RAISES THE MULTIPLIER.'],
    ['STYLE', 'AIR JUMPS, BOUNCES AND HELD CHAINS'],
    ['', 'MULTIPLY WHAT A COMBO PAYS.'],
    ['', ''],
    ['THE FLOOR', 'RISES FROM BELOW AND SPEEDS UP.'],
    ['', 'FALLING IS SURVIVABLE. THIS IS NOT.'],
    ['THEMES', 'FLOOR 100, THEN EVERY 200, IT ALL CHANGES.'],
  ];
  let y = 34;
  for (const [k, v] of lines) {
    if (k) mText(ctx, 'gold', k, 40, y, 'left');
    if (v) mText(ctx, 'text', v, 148, y, 'left');
    y += k || v ? 10 : 4;
  }
  // On a plaque of its own: it sits where the title screen's key hints are, under the wash,
  // and on them it read as one line run into another (FULLSPRESS ANY KEY).
  const back = touch ? HELP_BACK_TOUCH : 'PRESS ANY KEY';
  const pw = textWidth(back) + 16;
  mPlate(ctx, 'panel', Math.round(VW / 2 - pw / 2), VH - 20, pw, 15);
  mText(ctx, 'text', back, VW / 2, VH - 16, 'center', breath(t, 1.6), 'label');
}

export { keyLine };

// ---------------------------------------------------------------------------
/**
 * Shown while the character is still on his way down, under the characters: only the HUD
 * leaving. Deliberately almost empty: the fall is the thing to look at, and the scoreboard
 * would give away that it is over before the landing has happened.
 *
 * `hud(g, view)` draws the in-game HUD for `view` onto `g` (main.js passes drawHud with
 * the save file); given it, the HUD leaves by fading out rather than in one frame.
 */
export function drawFalling(ctx, game, t, hud) {
  // Nothing is painted here. The board he is falling toward used to be painted now, a piece
  // a frame -- up to 22-46 ms a piece in Chromium, in the fall, at 160 Hz where a frame is
  // 6.25 ms. It is painted ahead, while he climbs (gameoverskin.js warmBoards).
  if (hud) drawHudExit(ctx, game, hud);
}

/**
 * The fall's words -- SPACE TO SKIP on the way down; SPLAT or OOF, the verdict, the floor
 * and SPACE once he has landed -- drawn OVER the scene (main.js draws them after the world,
 * where the HUD is drawn under it).
 *
 * They were drawn with the HUD, under the characters, and a splat's pieces fly up past
 * them: in the start arena, 0.2 s after the impact, the sword arm and a leg lay across
 * SPLAT's T and the verdict's last word (3,952 pixels of him inside the words, measured by
 * tools/test-gameover.mjs), and the red burst's drops across all of it. Over the scene,
 * each word on its own keyline -- in the menus' fine lettering (gameoverskin.js boardLine,
 * menuskin.js), SPLAT or OOF lettered at scale 3, SPACE a keycap -- nothing of the death can
 * lie on a letter or its keyline once it is up. They were the HUD's zone inks on its thick
 * keyline, SPLAT three chunky blocks tall, and read as the one screen after the menus still
 * in the old lettering.
 *
 * The impact's words fade in over IMPACT_FADE, each WHOLE -- letters and keyline as one
 * picture, from nothing (gameoverskin.js boardFade). They faded only the letters, over a
 * keyline drawn whole from the first frame, and so came up as black stencils over the
 * impact's white flash (SPLAT, the verdict, FLOOR N and SPACE, all dark silhouettes) and only
 * then turned red and gold: a pop at the death, the kind a whole round was spent removing
 * ("What flashed as he fell into the fire", docs/GAMEPLAY.md). While a word fades the scene
 * shows through it, as through anything fading in; once it is up it is opaque, keyline and all.
 *
 * Neither prompt blinks: SPACE TO SKIP fades in over SKIP_FADE and stays, as the impact's
 * SPACE does with the rest, the key itself saying what to press -- the menus' rule, nothing
 * blinks. They blinked on clocks that started when they did (on the screen's own clock each
 * had come up wherever its blink happened to be, for a frame, then gone for 0.4 s).
 *
 * And SPACE TO SKIP waits SKIP_PROMPT_AT before it comes up. In the frame the fire took
 * him it appeared bottom centre -- where a companion's call box sits, and the call runs
 * out its fade over the next 0.45 s (Companions.freeze), so for that long the box was
 * drawn over the prompt and then half through it, two lines of text on top of each
 * other -- one more thing popping in at the catch. It comes up once the call has gone.
 */
export function drawFallWords(ctx, game, t) {
  // The skin is the board the death is drawn in, all of it painted before he fell
  // (gameoverskin.js deathBoard), and the lettering is painted at load: nothing is painted
  // here, in any frame of the fall.
  if (!game.impacted) {
    const s = (game.deathT || 0) - SKIP_PROMPT_AT;
    if (s >= 0) mHints(ctx, [['SPACE', 'TO SKIP']], VW / 2, FALL_KEY_Y, 10, 'center', Math.min(1, s / SKIP_FADE));
    return;
  }
  const skin = fallSkinFor(game);
  const k = Math.min(1, game.impactT / IMPACT_FADE);
  const floor = String(game.run.maxFloor);
  boardFade(ctx, skin, 'impact', IMPACT_Y - 2, (g) => mLine(g, game.splat ? 'danger' : 'gold',
    game.splat ? IMPACT_WORDS.splat : IMPACT_WORDS.dazed, VW / 2, IMPACT_Y, 3, 'center'), k);
  boardFade(ctx, skin, 'verdict', VERDICT_Y - 1, (g) => boardLine(g, BOARD_INKS.head, game.deathLine, VW / 2, VERDICT_Y, 'center'), k);
  boardFade(ctx, skin, 'floor', FALL_FLOOR_Y - 1, (g) => boardPair(g, 'FLOOR', floor, BOARD_INKS.head, VW / 2, FALL_FLOOR_Y), k);
  boardFade(ctx, skin, 'space', FALL_KEY_Y - 3, (g) => mHints(g, [['SPACE', '']], VW / 2, FALL_KEY_Y), k);
}
/** Where the fall's words stand [view units]: SPLAT or OOF, the verdict, FLOOR N, and SPACE. */
const IMPACT_Y = 38, VERDICT_Y = 66, FALL_FLOOR_Y = VH - 30, FALL_KEY_Y = VH - 18;
/** How long SPACE TO SKIP takes to come up, whole [s; 0.2]. */
const SKIP_FADE = 0.2;
/**
 * A label and its value on one line centred on cx, five units apart: the label quiet, the
 * value in `role` -- the title screen's records' layout (statLine), with a fade.
 */
function boardPair(ctx, label, value, role, cx, y, alpha = 1) {
  const left = Math.round(cx - (textWidth(label) + 5 + textWidth(value)) / 2);
  boardLine(ctx, BOARD_INKS.label, label, left, y, 'left', alpha);
  boardLine(ctx, role, value, left + textWidth(label) + 5, y, 'left', alpha);
}

/**
 * The HUD on its way out: the one the player was looking at when the fire took him,
 * fading over HUD_OUT in the banners' own three steps (1, 0.7, 0.4).
 *
 * It used to switch off in the frame he was caught -- score, speed, the chain's meter,
 * a banner or a callout half read -- in the same frame as everything else the catch
 * changes, so it read as the screen glitching rather than the run ending. It fades as a
 * whole: drawn once per death into a layer and composited, because the HUD sets its own
 * alpha per element and its outlined text is nine overlapping stamps, which a lowered
 * alpha on the screen would show through each other. The layer holds what the HUD
 * showed before the death (Game.hudHeld: the score before the chain was banked, the
 * chain's meter, CLIMB!), so nothing in it changes as it goes. Drawn at the store's own
 * size through the view transform, so its pixels land 1:1.
 */
let hudLayer = null, hudLayerFor = null;
/**
 * Make the layer the HUD fades out as, now, and bring it up off the screen: it was made in
 * the first frame of the first fall of a session, and given a new backing in the first frame
 * of every fall after (setting a canvas's size does that), in the frame the fire takes him.
 * For the load-time prepaint.
 */
export function warmHudExit() {
  if (hudLayer) return hudLayer;
  const { c, g } = newCanvas(SW, SH);
  hudLayer = c;
  // Tagged, so the tools know it for the fall's own layer (tools/test-smooth.mjs).
  hudLayer.layer = 'hudExit';
  g.fillStyle = '#000';
  g.fillRect(0, 0, 1, 1);
  touchCanvas(hudLayer);
  g.clearRect(0, 0, SW, SH);
  return hudLayer;
}
function drawHudExit(ctx, game, hud) {
  const held = game.hudHeld;
  const k = 1 - (game.deathT || 0) / HUD_OUT;
  if (!held || k <= 0) return;
  if (hudLayerFor !== held) {
    hudLayerFor = held;
    warmHudExit();
    // Cleared by hand, once per death, and its state put back: setting its size would clear
    // it too, and give it a new backing in the frame of the catch.
    const g = hudLayer.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, SW, SH);
    g.imageSmoothingEnabled = false;
    g.setTransform(SW / VW, 0, 0, SH / VH, 0, 0);
    hud(g, Object.create(game, {
      score: { value: held.score },
      combo: { value: held.combo },
      climbWarning: { value: held.climbWarning },
    }));
  }
  ctx.globalAlpha = k > 0.66 ? 1 : k > 0.33 ? 0.7 : 0.4;
  ctx.drawImage(hudLayer, 0, 0, VW, VH);
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
/**
 * How much of the zone's own dark lies over the scene behind the board: its HUD well
 * colour at this alpha [0..1; 0.62]. Enough that the panels stand clear of a busy backdrop,
 * little enough that the zone -- its sky, its walls, its colour -- is still what the board
 * stands in. The old board washed every zone 82% black. No word depends on it: every word
 * is on an opaque panel.
 */
const BOARD_VEIL = 0.62;
/**
 * Rows of the stat panels and the news panel, top to top [view units; 10]. Nine in the HUD's
 * lettering, whose four-pixel keyline filled the gap between two rows; the menus' two-pixel
 * keyline leaves the panel's well between them, and eleven rows nine apart in it read as a
 * block of type. The menus' own panels run eleven and twelve.
 */
const BOARD_ROW = 10;
/**
 * Where a stat panel's heading, the gold rule under it and its first row stand, from its
 * inside top [view units]. The heading three units over the first row, as the rows are, read
 * as one more row; the rule is the menus' (menuskin.js mRule, the STATISTICS tabs' rule).
 */
const STAT_HEAD = 2, STAT_RULE = 10, STAT_FIRST = 12;
/**
 * How far the board closes up when there is no news panel: the plaque and the numbers come
 * down this far and the prompt up half of it, splitting the news panel's room between the
 * margins and the gap [view units; 16 -- the news panel is two lines, 25 deep: about 16 units
 * of air over the plaque's finial, 14 between the numbers and the prompt, 10 under it].
 */
const BOARD_CLOSE = 16;
/** From the plaque's top to the title's ink [view units; 7, room for the light round it]. */
const TITLE_IN = 7;

/**
 * Where drawGameOver puts the key panel's inside box for this board [view units]: the
 * replays' prompt (ui/replays.js) stands on its second row. The rule is drawGameOver's -- the
 * panel comes up BOARD_CLOSE / 2 when there is no news panel -- written beside it, and
 * tools/test-replayui.mjs holds the two together by where the panel is actually drawn.
 */
export function boardKeysBox(records, unlocked) {
  const news = (records && records.length) || (unlocked && unlocked.length);
  const K = PANELS.keys;
  return { x: K.x, y: K.y - (news ? 0 : BOARD_CLOSE >> 1), w: K.w, h: K.h };
}

/**
 * The settings a run was played at, where they differ from a player's defaults, for the
 * scoreboard's THIS RUN title line (drawGameOver).
 *
 * A run at another JUMP SPEED says so on its own panel's title line, across from THIS RUN:
 * its records went into the same tables as every other run's (Stats.commit), so the board is
 * where a player sees which runs were faster. And a run on other PLATFORMS than a player's
 * default (SMALL) says which, the same way: 'MEDIUM PLATFORMS', or with a speed too, 'JUMP
 * 120% WIDE' -- one line, sixteen letters at most, clear of THIS RUN. A game that does not say
 * (a fake in a test) says nothing. All against the DEFAULTS a player starts with, so a run at
 * the defaults says nothing. And the DIFFICULTY, the same way. One setting away from the
 * defaults is said in full ('JUMP SPEED 100%', 'MEDIUM PLATFORMS', 'HARD MODE'); two or
 * three, short ('100% WIDE HARD'). '' when every one is the default.
 *
 * And the GRAVITY (2026-09-29), by its word (settings.js GRAVITY_WORDS: the menu's, and CLASSIC
 * or HEAVY for an old ghost's weight, which a race can be at; an old width likewise by its old
 * name, PLATFORM_WORDS): in full alone ('LOW GRAVITY', 'HIGH GRAVITY'), short with others ('100%
 * LOW-G'). The sixteen letters still hold, which a
 * fourth setting cannot do in the short words of three: MEDIUM platforms and a gravity with a
 * third setting come to 17 or 18 ('MEDIUM EASY HIGH-G'), so the gravity goes shorter there
 * ('MEDIUM EASY HI-G'); and all four away from the defaults come to 19 however short, so there
 * the platforms are left out and a '+' says a setting is ('100% EASY HI-G +'): the ledges are
 * the one setting the run showed the whole way up.
 */
export function runSettingsLabel(game) {
  const sp = game.jumpSpeed || 1;
  const pw = game.platforms;
  const word = PLATFORM_WORDS[pw] && pw !== DEFAULTS.platforms ? PLATFORM_WORDS[pw] : null;
  const pct = Math.round(sp * 100) + '%';
  const odd = sp !== DEFAULTS.jumpSpeed;
  const dl = game.difficulty;
  const mode = DIFFICULTIES[dl] && dl !== DEFAULTS.difficulty ? DIFFICULTIES[dl].name : null;
  const gv = game.gravity;
  const heavy = gv !== DEFAULTS.gravity ? GRAVITY_WORDS[gv] || null : null;
  const parts = [odd ? pct : null, word, mode, heavy ? heavy + '-G' : null].filter(Boolean);
  if (parts.length < 2) {
    return odd ? 'JUMP SPEED ' + pct : word ? word + ' PLATFORMS' : mode ? mode + ' MODE'
      : heavy ? heavy + ' GRAVITY' : '';
  }
  const short = heavy ? heavy.slice(0, 2) + '-G' : null;
  const fits = [parts, [odd ? pct : null, word, mode, short], [odd ? pct : null, mode, short, '+']]
    .map((p) => p.filter(Boolean).join(' '));
  return fits.find((s) => s.length <= 16) || fits[fits.length - 1];
}

/**
 * The records and the awards a run set, as the news panel's lines: [role, line], at most two.
 * A first run sets eight records at once and the joined list was three times the width of the
 * screen: two, then a count. The awards named on one line where each had a line of its own --
 * up to three, AWARD UNLOCKED - and a name apiece -- so the panel is two lines deep and the
 * board has the room the menus' lettering wants (gameoverskin.js PANELS): the three longest
 * names in the game take 55 of its 60 letters. More than fit are counted, as the records are.
 */
function boardNews(records, unlocked) {
  const news = [];
  if (records && records.length) {
    const shown = records.slice(0, 2).join(', ')
      + (records.length > 2 ? '  +' + (records.length - 2) + ' MORE' : '');
    news.push([BOARD_INKS.head, 'NEW RECORD: ' + shown]);
  }
  if (unlocked && unlocked.length) {
    const room = PANELS.news.w - 12;
    const head = unlocked.length > 1 ? 'NEW AWARDS: ' : 'NEW AWARD: ';
    for (let n = Math.min(3, unlocked.length); n >= 1; n--) {
      const more = unlocked.length - n;
      const line = head + unlocked.slice(0, n).map((a) => a.name).join(', ') + (more ? '  +' + more + ' MORE' : '');
      if (n === 1 || textWidth(line) <= room) { news.push([BOARD_INKS.award, line]); break; }
    }
  }
  return news;
}

/**
 * The scoreboard, in the style of the zone the run ended in (see gameoverskin.js): GAME OVER
 * in the zone's title material on a plaque crowned with its finial, the verdict under it,
 * THIS RUN and ALL TIME, the records and awards, and the prompts -- each on a panel of the
 * zone's HUD frame whose well is opaque, lettered in the menus' fine lettering, over the scene
 * under a veil of the zone's own dark. Every word is on a panel, so nothing behind the
 * board -- the body, its pieces, the blood, a companion, a particle -- can show behind one.
 *
 * Nothing on it blinks, as nothing on the menus does: the prompt's glow breathes and a glint
 * crosses it (the title screen's clock, menuskin.js shine), and a new record is gold. The
 * prompt blinked off for four tenths of every 1.6 s, and the record line flipped between two
 * golds 1.3 times a second.
 */
export function drawGameOver(ctx, game, all, records, unlocked, t) {
  const skin = boardSkinFor(game);
  const hex2 = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  ctx.fillStyle = skin.spec.well + hex2(BOARD_VEIL);
  fillView(ctx);

  // The panel is left out when the run set nothing, and the board closes up round the gap it
  // leaves, rather than showing a hole between the numbers and the prompt.
  const news = boardNews(records, unlocked);
  const down = news.length ? 0 : BOARD_CLOSE, up = news.length ? 0 : BOARD_CLOSE >> 1;

  const r = game.run;
  const H = PANELS.head;
  drawBoardPanel(ctx, skin, 'head', H.x, H.y + down);
  // The title's ink starts TITLE_IN down the plaque: the zone's lettering throws light past
  // its letters (ZENITH's sunburst 25 px over them, DOWNTOWN's window glow), and nearer the
  // top it reached out over the plaque's rim.
  const titleH = drawBoardTitle(ctx, skin, H.x + H.w / 2, H.y + down + TITLE_IN);
  boardLine(ctx, BOARD_INKS.head, game.deathLine, H.x + H.w / 2, H.y + down + TITLE_IN + Math.ceil(titleH) + 4, 'center');

  // The headline numbers in gold, as the pause screen's THIS RUN has them; the rest in argent.
  const G = BOARD_INKS.head;
  const rows = [
    ['FLOOR', String(r.maxFloor), G],
    ['SCORE', String(r.score), G],
    ['BEST COMBO', r.bestCombo + ' FLOORS'],
    ['COMBOS', String(r.combos)],
    ['AIR JUMPS', (r.doubleJumps + r.tripleJumps) + ''],
    ['WALL BOUNCES', String(r.wallBounces)],
    ['HELD JUMPS', String(r.instaJumps)],
    ['LONGEST CHAIN', String(r.bestInstaChain)],
    ['TOP SPEED', Math.round(r.topClimb || 0) + ' FLOORS/MIN'],
    ['TIME', fmtTime(r.seconds)],
    ['THEMES SEEN', r.themesSeen + '/' + THEMES.length],
  ];
  const d = derived(all);
  const arows = [
    ['BEST FLOOR', String(all.bestFloor), G],
    ['BEST SCORE', fmtNum(all.bestScore), G],
    ['BEST COMBO', all.bestCombo + ' FLOORS'],
    ['TOTAL RUNS', String(all.totalRuns)],
    ['TOTAL FLOORS', fmtNum(all.totalFloors)],
    ['AVG FLOOR', d.avgFloor.toFixed(1)],
    ['FLOORS / MIN', d.floorsPerMinute.toFixed(1)],
    ['TIME PLAYED', fmtTime(all.totalPlaySeconds)],
    ['AWARDS', progress(all).got + '/' + progress(all).total],
  ];
  const S = PANELS.stat;
  [['THIS RUN', rows], ['ALL TIME', arows]].forEach(([title, list], i) => {
    const { x } = STAT_AT[i], y = STAT_AT[i].y + down;
    drawBoardPanel(ctx, skin, 'stat', x, y);
    boardLine(ctx, BOARD_INKS.head, title, x + 8, y + STAT_HEAD, 'left');
    mRule(ctx, x + 6, y + STAT_RULE, S.w - 12);
    const label = runSettingsLabel(game);
    if (i === 0 && label) boardLine(ctx, BOARD_INKS.label, label, x + S.w - 8, y + STAT_HEAD, 'right');
    list.forEach(([k, v, role], j) => {
      const ry = y + STAT_FIRST + j * BOARD_ROW;
      boardLine(ctx, BOARD_INKS.label, k, x + 8, ry, 'left');
      boardLine(ctx, role || BOARD_INKS.value, v, x + S.w - 8, ry, 'right');
    });
  });

  if (news.length) {
    const N = PANELS.news;
    drawBoardPanel(ctx, skin, 'news', N.x, N.y);
    const top = N.y + Math.round((N.h - ((news.length - 1) * BOARD_ROW + 7)) / 2);
    news.forEach(([role, line], j) => boardLine(ctx, role, line, N.x + N.w / 2, top + j * BOARD_ROW, 'center'));
  }

  // SPACE TO CLIMB AGAIN as the title screen asks for SPACE, and the keys under it.
  const K = PANELS.keys, ky = K.y - up;
  drawBoardPanel(ctx, skin, 'keys', K.x, ky);
  mPromptOn(ctx, BOARD_PROMPT, K.x + K.w / 2, ky + KEYS_ROWS.prompt, t);
  mHints(ctx, BOARD_KEYS, K.x + K.w / 2, ky + KEYS_ROWS.hints, BOARD_KEYS_GAP);
}

// ---------------------------------------------------------------------------
/** A label and its value on one row, the value right-aligned: row() in the menu's inks. */
function mRow(ctx, label, value, x, y, w, role = 'text') {
  mText(ctx, 'label', label, x, y, 'left');
  mText(ctx, role, value, x + w, y, 'right');
}

export function drawStats(ctx, all, page, t, resetArmed = false) {
  ctx.fillStyle = MENU_BG;
  fillView(ctx);
  const d = derived(all);

  mLine(ctx, 'gold', 'STATISTICS', VW / 2, 6, 2, 'center');

  // Tabs: the active one a crimson tab in a gold rim, open at its foot onto the rule it
  // stands on, its name in gold; the others quiet.
  let tx = 24;
  PAGES.forEach((name, i) => {
    const on = i === page;
    const w = textWidth(name) + 10;
    if (on) mSelect(ctx, tx, 24, w, 12, t, true);
    mText(ctx, on ? 'gold' : 'label', name, tx + 5, 27, 'left');
    tx += w + 6;
  });
  mRule(ctx, 20, 36, VW - 40);

  if (page === 0) statsRecords(ctx, all, d);
  else if (page === 1) statsAverages(ctx, all, d, t);
  else if (page === 2) statsTower(ctx, all, d);
  else statsAwards(ctx, all, t);

  mText(ctx, 'hint', 'LEFT / RIGHT  PAGE     R RESET ALL     SPACE PLAY     ESC BACK', VW / 2, VH - 10, 'center');

  // The confirm. Deliberately a modal over the board rather than an inline toggle: this
  // is the one control in the game that destroys something the player earned.
  if (resetArmed) {
    ctx.fillStyle = '#05030ad8';
    fillView(ctx);
    mPanel(ctx, 56, 78, 368, 114, 'RESET EVERYTHING', 'crimson');
    mText(ctx, 'text', 'THIS CLEARS ALL ' + ACHIEVEMENTS.length + ' AWARDS, EVERY LIFETIME', VW / 2, 100, 'center');
    mText(ctx, 'text', 'TOTAL, YOUR RECENT RUNS AND YOUR TOP TEN.', VW / 2, 111, 'center');
    mText(ctx, WARN, 'THE SAME AS A FRESH INSTALL.', VW / 2, 128, 'center');
    mText(ctx, 'crimson', 'THIS CANNOT BE UNDONE.', VW / 2, 146, 'center');
    mKeyLine(ctx, [['R', 'CONFIRM'], ['ESC', 'CANCEL']], VW / 2, 170);
  }
}

function statsRecords(ctx, all, d) {
  mPanel(ctx, 20, 50, 210, 186, 'PERSONAL BESTS');
  let y = 60;
  const rows = [
    ['HIGHEST FLOOR', String(all.bestFloor)],
    ['HIGH SCORE', String(all.bestScore)],
    ['LONGEST COMBO', all.bestCombo + ' FLOORS'],
    ['BEST COMBO SCORE', String(all.bestComboScore)],
    ['MOST STYLE IN ONE', String(all.bestComboFlair)],
    ['TOP SPEED', Math.round(all.topClimb || 0) + ' FLOORS/MIN'],
    ['LONGEST RUN', fmtTime(all.longestRunSeconds)],
    ['LONGEST HANG TIME', all.longestAir.toFixed(2) + 'S'],
    ['LONGEST JUMP CHAIN', String(all.bestInstaChain)],
    ['DEEPEST THEME', THEMES[Math.max(0, all.themesSeen - 1)].name],
    ['CHECKPOINTS HIT', String(all.checkpoints)],
  ];
  // The records are the page's highlight: gold. The totals beside them are argent.
  for (const [k, v] of rows) { mRow(ctx, k, v, 28, y, 194, 'gold'); y += 11; }

  mPanel(ctx, 250, 50, 210, 186, 'LIFETIME TOTALS');
  y = 60;
  const t2 = [
    ['RUNS PLAYED', String(all.totalRuns)],
    ['FLOORS CLIMBED', fmtNum(all.totalFloors)],
    ['POINTS SCORED', fmtNum(all.totalScore)],
    ['JUMPS', fmtNum(all.totalJumps)],
    ['DOUBLE JUMPS', fmtNum(all.totalDoubleJumps)],
    ['TRIPLE JUMPS', fmtNum(all.totalTripleJumps)],
    ['WALL BOUNCES', fmtNum(all.totalWallBounces)],
    ['HELD JUMPS', fmtNum(all.totalInstaJumps)],
    ['COMBOS LANDED', fmtNum(all.totalCombos)],
    ['DISTANCE RUN', fmtNum(d.metresRun) + ' M'],
    ['TIME PLAYED', fmtTime(all.totalPlaySeconds)],
  ];
  for (const [k, v] of t2) { mRow(ctx, k, v, 258, y, 194); y += 12; }
}

function statsAverages(ctx, all, d, t) {
  mPanel(ctx, 20, 50, 210, 110, 'PER RUN');
  let y = 60;
  const rows = [
    ['AVERAGE FLOOR', d.avgFloor.toFixed(1)],
    ['AVERAGE SCORE', fmtNum(d.avgScore)],
    ['AVERAGE LENGTH', fmtTime(d.avgSeconds)],
    ['FLOORS PER MINUTE', d.floorsPerMinute.toFixed(1)],
    ['COMBOS PER RUN', d.comboRate.toFixed(1)],
    ['TIME IN THE AIR', d.airPercent.toFixed(1) + '%'],
    ['JUMPS PER FLOOR', all.totalFloors ? (all.totalJumps / all.totalFloors).toFixed(2) : '0.00'],
  ];
  for (const [k, v] of rows) { mRow(ctx, k, v, 28, y, 194); y += 12; }

  mPanel(ctx, 250, 50, 210, 110, 'STYLE MIX');
  y = 60;
  const air = all.totalDoubleJumps + all.totalTripleJumps;
  const tot = Math.max(1, air + all.totalWallBounces);
  for (const [k, v, c] of STYLE_MIX(all)) {
    mText(ctx, 'label', k, 258, y, 'left');
    mText(ctx, c, fmtNum(v), 452, y, 'right');
    mBar(ctx, 258, y + 9, 194, 4, v / tot, c);
    y += 20;
  }
  mText(ctx, 'label', 'AIR MOVES ' + ((air / tot) * 100).toFixed(0) + '%  /  BOUNCES ' +
    ((all.totalWallBounces / tot) * 100).toFixed(0) + '%', 258, y + 2, 'left');

  // Three units deeper than the old 1px box: the counts under the columns end on its last
  // row, and on a bevelled frame two units thick they sat on the gold.
  mPanel(ctx, 20, 176, 440, 63, 'COMBOS BY TIER');
  const maxH = Math.max(1, ...all.comboHist);
  const bw = 40;
  COMBO_TIERS.forEach((tier, i) => {
    const x = 28 + i * (bw + 3);
    const v = all.comboHist[i] || 0;
    const hot = v === maxH && v > 0;
    // The tier most combos end in is the highlight: its column gold, its name in gold.
    mColumn(ctx, x, 190, bw, 28, v / maxH, hot ? TIER_HOT : TIER_COOL);
    mText(ctx, hot ? 'gold' : 'label', tier.name.slice(0, 6), x + bw / 2, 221, 'center');
    if (v > 0) mText(ctx, 'text', String(v), x + bw / 2, 229, 'center');
  });
  void t;
}
/** The style mix's rows and the colours each has had since the page was made. */
const STYLE_MIX = (all) => [
  ['DOUBLE JUMPS', all.totalDoubleJumps, '#7fdcff'],
  ['TRIPLE JUMPS', all.totalTripleJumps, '#ffffff'],
  ['WALL BOUNCES', all.totalWallBounces, '#ff8844'],
];
const TIER_HOT = OR[4], TIER_COOL = '#4f7fd8';

function statsTower(ctx, all, d) {
  mPanel(ctx, 20, 50, 210, 186, 'TOWER PROGRESS');
  let y = 60;
  // The zones are NOT a hundred floors each. The first is 100 and every one after it is
  // 200, so the twelfth opens at 2100 -- this page drew 0, 100, 200 ... 1100 and 100 floors
  // a bar, which put ZENITH at 100% for a best of 1200, nine hundred floors short of it.
  // Read straight from the best floor against the real schedule, so it cannot disagree
  // with DEEPEST THEME on the next page.
  THEMES.forEach((th, i) => {
    const lo = i === 0 ? 0 : FIRST_THEME_FLOORS + (i - 1) * FLOORS_PER_THEME;
    const len = i === 0 ? FIRST_THEME_FLOORS : FLOORS_PER_THEME;
    const got = Math.max(0, Math.min(len, all.bestFloor - lo));
    const pct = Math.floor((got * 100) / len);
    const reached = i === 0 ? all.bestFloor > 0 : all.bestFloor >= lo;
    mText(ctx, reached ? 'label' : 'off', String(lo).padStart(4, ' '), 26, y, 'left');
    mText(ctx, reached ? th.accent : 'off', th.name, 52, y, 'left');
    // 44 wide, not 56: at 56 the bar ran under the '100%' printed right of it.
    mBar(ctx, 150, y + 1, 44, 5, got / len, reached ? th.platTop : UNREACHED);
    mText(ctx, reached ? 'text' : 'off', pct + '%', 222, y, 'right');
    y += 14;
  });

  mPanel(ctx, 250, 50, 210, 92, 'BEST RUNS');
  mText(ctx, 'hint', '#   FLOOR    SCORE  COMBO   TIME', 258, 58, 'left');
  let by = 68;
  if (!all.best.length) mText(ctx, 'label', 'NO RUNS YET', 355, 90, 'center');
  all.best.slice(0, 6).forEach((e, i) => {
    // The best run of all is the highlight: gold. The rest argent.
    const c = i === 0 ? 'gold' : 'text';
    mText(ctx, 'label', String(i + 1), 258, by, 'left');
    mText(ctx, c, String(e.floor), 300, by, 'right');
    mText(ctx, c, fmtNum(e.score), 356, by, 'right');
    mText(ctx, c, String(e.combo), 398, by, 'right');
    mText(ctx, 'label', fmtTime(e.seconds), 452, by, 'right');
    by += 11;
  });

  mPanel(ctx, 250, 156, 210, 80, 'RECENT');
  mText(ctx, 'hint', 'FLOOR    SCORE  BOUNCE   AIR', 258, 164, 'left');
  let ry = 174;
  all.recent.slice(0, 5).forEach((e) => {
    mText(ctx, 'text', String(e.floor), 290, ry, 'right');
    mText(ctx, 'text', fmtNum(e.score), 348, ry, 'right');
    mText(ctx, 'label', String(e.bounces), 398, ry, 'right');
    mText(ctx, 'label', String(e.air), 440, ry, 'right');
    ry += 11;
  });
  if (!all.recent.length) mText(ctx, 'label', 'NO RUNS YET', 355, 196, 'center');
  void d;
}
/** A zone's bar before it is reached: the old dark slate. */
const UNREACHED = '#2a2a3a';

// --- the opening guide ------------------------------------------------------
//
// Shown once on a first run, and replayable from OPTIONS afterwards.
//
// It is drawn OVER the live attract-mode game rather than over a static illustration,
// which is the whole reason it is worth having: the bot behind the panel is genuinely
// playing, at seventy-odd air jumps and fifty wall bounces a minute, so every page can
// point at a mechanic and have the player watch it happen a second later. Each page can
// also read a live gauge off that same game, so the speed page's meter is really the
// bot's meter moving.
export const TUTORIAL_PAGES = [
  {
    title: 'THE CLIMB',
    lines: [
      'GET AS HIGH AS YOU CAN BEFORE THE FLOOR TAKES YOU.',
      '',
      'EVERY PLATFORM IS REACHABLE FROM THE ONE BELOW IT.',
      'THE TOWER IS RANDOM, BUT IT IS NEVER UNFAIR.',
    ],
    keys: [['ARROWS', 'MOVE'], ['SPACE', 'JUMP'], ['HOLD', 'RE-JUMP ON LANDING']],
  },
  {
    title: 'SPEED IS HEIGHT',
    lines: [
      'THE LONGER YOU RUN, THE FASTER YOU GO -- AND THE',
      'HIGHER YOU JUMP. THIS IS THE WHOLE GAME.',
      '',
      'A STANDING JUMP CLEARS TWO FLOORS.',
      'A FLAT-OUT JUMP CLEARS NINE.',
    ],
    gauge: (g) => ({ label: 'SPEED', frac: g.player.momentum, hot: g.player.momentum > 0.985 }),
  },
  {
    title: 'USE THE WALLS',
    lines: [
      'HITTING A WALL ON THE GROUND COSTS YOU 30% OF YOUR',
      'SPEED. BOUNCING OFF A WALL IN MID-AIR COSTS 6%',
      'AND GIVES YOU A LIFT -- AND DEEP IN A COMBO IT',
      'GAINS YOU SPEED AND THROWS YOU UPWARD.',
      '',
      'SO DO NOT TURN. GO AT THE WALL.',
    ],
  },
  {
    title: 'THE DOUBLE JUMP',
    lines: [
      'JUMP AGAIN IN MID-AIR. IT IS NOT FREE -- YOU ONLY',
      'HAVE IT WHILE YOUR SPEED METER IS FULL.',
      '',
      'SPEND IT ON THE WAY UP, NOT AT THE TOP.',
    ],
    keys: [['SPACE', 'AGAIN IN THE AIR']],
    gauge: (g) => ({
      label: g.player.momentum > 0.985 ? airJumpWords(g.player) : 'SPEED',
      frac: g.player.momentum,
      hot: g.player.momentum > 0.985,
    }),
  },
  {
    title: 'COMBOS',
    lines: [
      'CLEAR TWO OR MORE FLOORS IN ONE HOP TO START A',
      'COMBO. KEEP DOING IT TO KEEP IT ALIVE -- STAND',
      'STILL OR HOP A SINGLE FLOOR AND IT IS OVER.',
      '',
      'EVERY 50 FLOORS OF COMBO RAISES THE MULTIPLIER',
      'ON THE LEFT, AND THE TOWER SHOUTS ABOUT IT.',
    ],
    gauge: (g) => ({
      label: g.combo.active ? 'COMBO  ' + g.combo.floors : 'COMBO',
      frac: g.combo.meterFrac(),
      hot: g.combo.x > 1,
    }),
  },
  {
    title: 'THE FLOOR IS COMING',
    lines: [
      'IT RISES THE WHOLE TIME, AND FASTER IF YOU STAND',
      'STILL. WHEN THE SCREEN FLASHES RED, CLIMB.',
      '',
      'THE HIGHER YOU GET, THE LESS ROOM IT LEAVES YOU',
      'TO FALL. GOOD LUCK.',
    ],
    // No gauge. This page had a live copy of the FALL ROOM bar and told the player to
    // watch "the bar on the right"; that bar has been taken out of the HUD, and the
    // warnings that are left -- the red band, the vignette, CLIMB! -- are what it names.
  },
];

export function drawTutorial(ctx, page, demo, t) {
  const n = TUTORIAL_PAGES.length;
  const pg = TUTORIAL_PAGES[Math.max(0, Math.min(n - 1, page))];
  const last = page >= n - 1;

  // One frame for every page, and a title tab cut to each page's title. The tab was cut once
  // for the longest title, so THE CLIMB sat in a plaque with half its length empty; the six
  // tabs are small, and painted ahead with the rest of the guide.
  mPanel(ctx, 34, 40, 412, 176, pg.title, 'gold', 'panel');

  let y = 62;
  for (const line of pg.lines) {
    if (line) mText(ctx, 'text', line, 48, y, 'left');
    y += 11;
  }

  // A gauge fed by the bot that is playing behind this panel.
  if (pg.gauge && demo) {
    const g = pg.gauge(demo);
    mText(ctx, g.hot ? 'text' : 'label', g.label, 48, 168, 'left');
    mBar(ctx, 48, 178, 200, 6, g.frac, g.hot ? GAUGE_HOT : OR[4]);
    mText(ctx, 'hint', 'LIVE -- THAT IS THE BOT BEHIND THIS PANEL', 48, 190, 'left');
  }

  if (pg.keys) mKeyLine(ctx, pg.keys, VW / 2, 200);

  // The stones and the keys under the panel stand on a plaque of their own: they are over
  // the attract run, at the bottom of the screen where its companions' calls come up.
  const tp = tutPlate(last);
  mPlate(ctx, 'lower', tp.x, tp.y, tp.w, tp.h);

  // Stones, so the length of the thing is obvious before you start paging through it: the
  // page you are on a cut gold stone, the others dark.
  const dotW = 8;
  let dx = VW / 2 - (n * dotW) / 2;
  for (let i = 0; i < n; i++) {
    mGem(ctx, dx + 2, 224, 4, 4, i === page);
    dx += dotW;
  }

  if (last) {
    mKeyLine(ctx, [['SPACE', 'START CLIMBING']], VW / 2, 238);
    // Breathing between two quiet tones, where it flicked between them.
    mText(ctx, 'label', TUT_REPLAY, VW / 2, 252, 'center', breath(t, 1.6), 'hint');
  } else {
    mKeyLine(ctx, [['RIGHT', 'NEXT'], ['LEFT', 'BACK'], ['ESC', 'SKIP']], VW / 2, 240);
  }
}
/**
 * The guide's lower plaque [view units]: from three units under the panel to under the keys,
 * or under the last page's replay line, and as wide as that line with twelve units each side,
 * on every page, so paging to the last only makes it taller.
 */
const TUT_REPLAY = 'YOU CAN REPLAY THIS FROM OPTIONS (O)';
function tutPlate(last) {
  const w = textWidth(TUT_REPLAY) + 24;
  return { x: Math.round(VW / 2 - w / 2), y: 219, w, h: last ? 45 : 35 };
}
/** The guide's gauge when the meter is pinned: the old flash to white, in argent. */
const GAUGE_HOT = '#fbf7f2';
/** The awards' colour, which every screen that shows an award has used. */
const AWARD = '#7dff5a';

function statsAwards(ctx, all, t) {
  const pr = progress(all);
  // The title's tab is cut for the widest count there can be, so an award unlocked between
  // two visits does not paint a new panel in the frame the page opens.
  mPanel(ctx, 20, 50, 440, 186, 'AWARDS  ' + pr.got + ' / ' + pr.total, 'gold', 'panel',
    textWidth('AWARDS  ' + pr.total + ' / ' + pr.total));
  mBar(ctx, 28, 58, 424, 4, pr.pct / 100, OR[4]);

  const cols = 2, rowH = 12;
  ACHIEVEMENTS.forEach((a, i) => {
    const col = i % cols;
    const r = Math.floor(i / cols);
    const x = 28 + col * 216;
    const y = 70 + r * rowH;
    const got = !!all.achievements[a.id];
    const fresh = got && Date.now() - all.achievements[a.id] < 8000;
    // A fresh award breathes from green to white; it used to flash at five a second.
    mGem(ctx, x, y + 1, 5, 5, got, got ? AWARD : null);
    if (fresh) mText(ctx, 'text', a.name, x + 9, y, 'left', breath(t, 0.8), AWARD);
    else mText(ctx, got ? AWARD : 'off', a.name, x + 9, y, 'left');
    mText(ctx, got ? AWARD : 'hint', got ? 'DONE' : a.desc, x + 206, y, 'right');
  });
}

// --- painting the menus ahead ----------------------------------------------------------------
//
// Every piece the screens above draw, in the sizes they draw it, for menuskin.js to paint:
// the title screen's at load, the rest one a frame while the title screen is up -- the guide
// first (a new player's first SPACE opens it), then the pause screen (a run can be started a
// second in), then GRAPHICS, STATISTICS, the help and the quit. tools/test-menu.mjs draws
// every screen after the warm-up and fails on any piece painted in the frame that drew it,
// which is what keeps this list honest when a screen changes.
{
  const b = headerBox();
  const keyCaps = (lines) => lines.flatMap(([pairs]) => pairs.map(([k]) => warm.cap(k)));
  const ink = (...roles) => roles.map((r) => warm.ink(r));
  const first = [
    warm.title(b), warm.line(WORD_L, 4, 'gold'), warm.line(WORD_R, 4, 'gold'), warm.line(SUBTITLE, 2, 'argent'),
    warm.line(ATTRACT_PROMPT, 2, 'gold'),
    warm.prompt(), ...ink('label', 'gold', VALUE2), ...keyCaps(MENU_KEYS),
    // The key hints' composite for a first run; the records' is painted on the title screen's
    // first frame, since it holds the save file's numbers.
    warm.draw((g) => drawLower(g, { totalRuns: 0 })),
    ...[true, false].map((r) => warm.plate('lower', lowerPlate(r).w, lowerPlate(r).h)),
    warm.spark(), warm.plate('panel', 80, 4),
    // The sound notice's plates, both wordings, on the title and in every place main.js puts it:
    // here, not with the rest, since it is up from the first frame and a run can start a second in.
    ...[true, false].flatMap((pad) => [{ y: SOUND_Y }, ...Object.values(SOUND_PLACES)].map((at) => {
      const p = soundPlate(soundLines(pad, at.w));
      return warm.plate('panel', p.w, p.h);
    })),
  ];
  const tutKeys = [...TUTORIAL_PAGES.flatMap((p) => p.keys || []), ['SPACE'], ['RIGHT'], ['LEFT'], ['ESC']];
  const rest = [
    // The guide.
    ...TUTORIAL_PAGES.map((pg) => warm.panel(412, 176, pg.title)), ...ink('text', 'hint'),
    ...[false, true].map((l) => warm.plate('lower', tutPlate(l).w, tutPlate(l).h)),
    warm.gauge(200, 6, OR[4]), warm.gauge(200, 6, GAUGE_HOT), warm.gem(true), warm.gem(false),
    ...tutKeys.map(([k]) => warm.cap(k)),
    // The pause.
    warm.line('PAUSED', 3, 'gold'), warm.panel(200, 62, 'THIS RUN'), warm.cap('S'), warm.cap('Q'),
    // OPTIONS.
    warm.line('OPTIONS', 2, 'gold'), ...ink(GOOD, WARN), warm.panel(400, optionsPanelEnd() - 42),
    warm.select(392, 11),
    // STATISTICS.
    warm.line('STATISTICS', 2, 'gold'), ...PAGES.map((p) => warm.select(textWidth(p) + 10, 12, true)),
    warm.panel(210, 186, 'PERSONAL BESTS'), warm.panel(210, 186, 'LIFETIME TOTALS'),
    warm.panel(210, 110, 'PER RUN'), warm.panel(210, 110, 'STYLE MIX'), warm.panel(440, 63, 'COMBOS BY TIER'),
    warm.panel(210, 186, 'TOWER PROGRESS'), warm.panel(210, 92, 'BEST RUNS'), warm.panel(210, 80, 'RECENT'),
    warm.panel(440, 186, 'AWARDS', 'gold', 'panel',
      textWidth('AWARDS  ' + ACHIEVEMENTS.length + ' / ' + ACHIEVEMENTS.length)),
    ...ink('off', AWARD, ...STYLE_MIX({}).map((m) => m[2]), ...THEMES.map((th) => th.accent)),
    ...STYLE_MIX({}).map((m) => warm.gauge(194, 4, m[2])),
    warm.gauge(40, 28, TIER_HOT, true), warm.gauge(40, 28, TIER_COOL, true),
    ...THEMES.map((th) => warm.gauge(44, 5, th.platTop)), warm.gauge(44, 5, UNREACHED),
    warm.gauge(424, 4, OR[4]), warm.gem(true, AWARD),
    warm.panel(368, 114, 'RESET EVERYTHING', 'crimson'), ...ink('crimson'), warm.cap('R'),
    // The help, and the quit.
    warm.line('HOW TO CLIMB', 2, 'gold'), warm.panel(HELP_PANEL.w, HELP_PANEL.h),
    warm.plate('panel', textWidth('PRESS ANY KEY') + 16, 15),
    warm.line('FAREWELL, CLIMBER', 2, 'gold'), warm.line('CANNOT CLOSE THIS TAB', 2, 'crimson'),
    warm.panel(QUIT_PANEL.w, QUIT_PANEL.h), warm.panel(BLOCKED_PANEL.w, BLOCKED_PANEL.h),
    // The replays screen and the overlay over a replay (render/replayskin.js).
    ...replayWarmList(warm),
  ];
  menuWarmList(first, rest);
}
