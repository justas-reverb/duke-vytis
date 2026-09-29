// The scoreboard's per-zone skin: the game over screen in the style of the zone the run
// ended in.
//
// WHAT THIS REPLACED. The board was the same in every zone: the whole scene washed 82%
// black, GAME OVER in flat red, two slate-grey panels and plain text -- and every line that
// was not on a panel (the verdict, the records, the awards, the prompts) printed straight
// over the scene, where the Duke's body, or him frozen mid-tumble when SPACE cut the fall
// short, showed through the wash behind the words.
//
// WHAT IT IS NOW. The frame is the zone's, the words are the Duke's:
//
//   * GAME OVER is lettered by the zone's title painter (titlepaint/), the one that letters
//     the zone's name as the climb enters it: cumulus in STORM, bone in ABYSS, gilt at the
//     ZENITH, stone with a skull in the O in the DUNGEON, the citadel's arms in its O.
//   * the panels are the HUD's gauge frames (hudskin.js paintFrame, dressed by the zone's
//     spec in hudpaint.js) round bigger boxes: bark and leaves, cloud, vertebrae, crystal,
//     riveted brick, each on the lettering's dark plate. The title's plaque wears the
//     finial the combo meter wears (the grave cross, the skull, the crown, the gilt orb).
//   * every word is in the menus' fine lettering (menuskin.js): the font glyph for glyph at
//     four backing pixels a font pixel, shaded in argent and gold on a two-pixel keyline --
//     the labels quiet, the numbers bright, the headings, the verdict and a record in gold,
//     the awards in the green the stats screen gives them; SPACE TO CLIMB AGAIN lettered and
//     keyed as the title screen's PRESS SPACE TO CLIMB is, and the keys as keycaps. They were
//     the HUD's zone inks on its thick keyline, the same letterforms at the same size, and
//     beside the menus the board read as the one screen still in the old flat blocks: every
//     label as loud as every number, the prompt a slab of white letters, eleven rows nine
//     units apart in one bright yellow ("the stats should use a nicer font", 2026-09-29).
//     The lettering is the Duke's in every zone, as the menus' is over every zone the attract
//     run climbs; the zone is in the frame, its dressing and GAME OVER.
//
// NOTHING COVERS THE WORDS. Every word sits on a panel whose well is OPAQUE, drawn above the
// scene: whatever lies behind -- the body where it fell, the pieces, the blood, a companion
// frozen at the moment of the catch, a burst still settling, him mid-air after a skip --
// can only show between the panels, never behind a letter or its keyline. The body's place
// is known, but where it is depends on the arena, the zoom, the fall and whether SPACE cut
// it short (the camera then holds him anywhere between 18% and 82% of the view), so the
// guarantee is made by the drawing order rather than by steering the layout round him.
// tools/test-gameover.mjs proves it pixel by pixel.
//
// THE FALL'S WORDS are lettered the same way: SPACE TO SKIP, then SPLAT or OOF, the verdict,
// the floor and SPACE, drawn over the scene on their own keylines (screens.js drawFallWords)
// -- under the characters, as they were, a splat's pieces flew across them. SPLAT and OOF are
// LETTERED at scale 3, as PAUSED is, SPLAT in the rising floor's red (menuskin.js ROUGE) and
// OOF in gold. The impact's words fade in WHOLE (boardFade): each word is put together once,
// letters on their keyline, and that one picture fades in from nothing. They used to fade
// only the letters, over a keyline drawn whole from the first frame, so they came up as
// black stencils over the impact's white flash and then reddened -- one more thing popping
// in at the death.
//
// PAINTED AHEAD, NEVER IN THE FALL. A zone's board is 60 to 100 ms of painting in Chromium.
// It used to be painted while he fell, a piece a frame -- measured in the Browser pane, the
// pieces cost 1.5 ms a frame at the median and 22 to 46 ms at worst, a panel or a word of
// the title, at 160 Hz where a frame is 6.25 ms -- so the fall, the one stretch of the game
// the player only watches, dropped frames; and SPACE in its first frames left the rest to
// the board's first frame, a 100 ms stall. Now:
//
//   * every painter is a generator that yields between rows (slices.js), and warmBoards,
//     called once a frame by main.js, runs them within a budget: BOARD_WARM_MS a frame in a
//     run, BOARD_IDLE_MS on the menus (constants.js), each stopped BOARD_SLICE_MS short of it,
//     since a painter hands the frame back only at its next check. In a run it paints the
//     board of the zone he is in, then the next zone's, from the zone's first frame; on the
//     menus the zone a fresh run enters after BASEMENT. In the fall and on the board it
//     paints nothing.
//   * BASEMENT's board is painted at load, whole: every run starts there, and it is the
//     board any death falls back on, so there always is one (below). A board is its title
//     words and its panels; the lettering is the menus', the same in every zone, painted
//     once at load with it (warmBoardLettering) -- where every zone's board used to paint
//     thirteen glyph atlases of its own.
//   * a death takes the board of the zone it happened in if that is all painted, and
//     otherwise the last zone's that was -- the one he climbed out of seconds before, or
//     BASEMENT's -- for the whole death, the fall's words and the board alike (deathBoard).
//     Finishing the zone's own in the fall instead would be painting in the fall, and a
//     frame of that is exactly what this is for; a board in the previous zone's style is a
//     finished board he saw a moment ago. The next zone's board is painted ahead while he
//     climbs the current one -- with the painters stopped at 0.3 ms a frame a board took
//     190 to 290 frames in the Browser pane (Chromium), 350 to 450 the first time a session
//     ran a zone's painters: one to three seconds at 160 Hz, three to eight at 60
//     -- and a zone is 100 or 200 floors, so in play only a zone passed through in a few
//     seconds falls back (boardStats().fallbacks counts them; tools/test-boardwarm.mjs
//     forces it by climbing a zone every second and a half).
//   * a board is about 7 MB of canvas (boardMemory()); twelve would be 84. Kept: BASEMENT's,
//     the zone's, the next zone's and the last finished one, at most five on the menus.

import { PX, SW, VW, BOARD_WARM_MS, BOARD_IDLE_MS, BOARD_SLICE_MS, FIRST_THEME_FLOORS } from '../game/constants.js';
import { THEMES, themeIndexFor } from '../game/themes.js';
import { STATE } from '../game/game.js';
import { GLYPHS, textWidth } from './font.js';
import { pixToCanvas } from './decorpaint/util.js';
import { HUD_ZONES, hudRng, puffs, band, plate, corners, star, chips } from './hudpaint.js';
import { paintFrameSteps, Plan, paintingFor, releaseOwned } from './hudskin.js';
import { takeCanvas, touchCanvas, newCanvas } from './canvases.js';
import { TITLE_PAINTERS } from './titlepaint/index.js';
import { layoutSteps } from './titlepaint/util.js';
import { overdue, drain, steps, runUntil } from './slices.js';
import { mText, mPromptSpec, menuWarmNow, warm } from './menuskin.js';

/**
 * The words lettered bigger than the rest: the impact's word at scale 3 and the board's
 * prompt at 2. screens.js prints these constants, so the words and the pieces painted for
 * them at load (warmBoardLettering) cannot drift apart.
 */
export const IMPACT_WORDS = { splat: 'SPLAT', dazed: 'OOF' };
export const CLIMB_AGAIN = 'SPACE TO CLIMB AGAIN';

/**
 * The inks the board's words take (menuskin.js roles): the labels quiet argent, the numbers
 * bright argent, the headings, the verdict and a record gold, and an award the green the
 * stats screen's awards are. In the zone's HUD inks every label had been as loud as every
 * number -- CITADEL's whole board one yellow.
 */
export const BOARD_INKS = { label: 'label', value: 'text', head: 'gold', award: '#7dff5a' };

/** The two words of the title, lettered one by one: the painters lay out a single word. */
export const TITLE_WORDS = ['GAME', 'OVER'];
/** Clear space between them [art px; 40 is a little over half a letter]. */
const WORD_GAP = 40;
/**
 * The canvas each title word is painted into, the same in every zone [art px]. The words are
 * 290-332 px wide and 109-141 tall depending on the zone's lettering, and a canvas cannot
 * change size without a new backing: at one size for all, a zone's board reuses the canvases
 * a board let go of (canvases.js), where at its own it made two new ones in play for every
 * zone. A word draws from its own w x h at the top left. tools/test-smooth.mjs fails if a
 * zone's word outgrows it. [art px; 332 x 141 is the largest, ZENITH's width, STORM's height]
 */
export const WORD_BOX = { w: 344, h: 152 };

/**
 * The panels, as inside boxes in VIEW units (480 x 270), and whether a panel wears the zone's
 * finial. THIS RUN and ALL TIME are the same size and share one painting. `head` is the
 * plaque GAME OVER and the verdict sit on, `stat` the two columns of numbers, `news` the
 * records and awards (left out when there are none), `keys` the prompts.
 *
 * Re-laid for the menus' lettering (2026-09-29). Its keyline is two pixels where the HUD's
 * was four, so the well shows between the lines, and eleven rows nine units apart read as a
 * block of type: they are ten apart now, the stat panels six units deeper (screens.js
 * BOARD_ROW). The key panel holds SPACE TO CLIMB AGAIN lettered with its keycap standing two
 * units out of the line, as the title screen's prompt, and a row of keys under it: eight
 * units deeper. The room is the news panel's: it held the records and up to three awards on
 * four lines, and holds them on two -- the three longest award names (thirteen letters) fit
 * one line of its sixty letters. A panel's painting -- rim, plate and dressing -- reaches 19
 * px past its box on every side in every zone (measured), and what is left between one
 * panel's painting and the next's is two pixels, where the old layout's news and key panels
 * overlapped by two.
 */
export const PANELS = {
  head: { x: 138, y: 10, w: 204, h: 42, crest: true },
  stat: { w: 176, h: 122 },
  news: { x: 58, y: 194, w: 364, h: 25 },
  keys: { x: 92, y: 229, w: 296, h: 35 },
};
export const STAT_AT = [{ x: 51, y: 62 }, { x: 253, y: 62 }];

/**
 * Where the key panel's two rows stand, from its inside top [view units]: the prompt's font
 * box (its keycap reaches two units above and below it) and the row of keys under it.
 */
export const KEYS_ROWS = { prompt: 4, hints: 24 };
/**
 * The row of keys under the prompt, as keycaps with their words (menuskin.js mHints), and the
 * gap between them [view units; 12]. The replays' own two (replayskin.js drawBoardReplay)
 * stand either side of it on the same row. It was 'S STATS    ESC MENU' in the number ink.
 */
export const BOARD_KEYS = [['S', 'STATS'], ['ESC', 'MENU']];
export const BOARD_KEYS_GAP = 12;
/**
 * SPACE TO CLIMB AGAIN as the title screen's PRESS SPACE TO CLIMB is made (menuskin.js
 * mPromptOn): TO CLIMB AGAIN lettered in gold, SPACE the key itself, a glow breathing under
 * it cut to the key panel's well. It was the HUD's number ink at scale 2, blinking.
 */
export const BOARD_PROMPT = (() => {
  const K = PANELS.keys;
  const lx = Math.round(K.x + K.w / 2 - textWidth(CLIMB_AGAIN, 2) / 2);
  return mPromptSpec(CLIMB_AGAIN, [0, 5], 'SPACE',
    [K.x - lx, -KEYS_ROWS.prompt, K.x + K.w - lx, K.h - KEYS_ROWS.prompt]);
})();

/**
 * The rim's thickness per side [art px]. The combo meter's are 4-6; round a box 700 px wide
 * that was a thin line in the zone's colour, a picture frame whose material did not read
 * (9-10 px was still one), so the panels' are thicker, heavier underneath as the gauges'.
 */
const RIM = { t: 13, b: 15, l: 13, r: 13 };
/** Room round a panel's rim for what the dressing hangs off it [art px]; 40 over a crest. */
const ROOM = 16;
function geometry(p) {
  return { iw: p.w * PX, ih: p.h * PX, ml: ROOM, mr: ROOM, mt: p.crest ? 40 : ROOM, mb: ROOM, rim: RIM };
}

// --- the panels' dressing ----------------------------------------------------------------
//
// The zone's HUD dressing is made for a gauge: ornaments at the ends of a 296-px bar, a
// finial over a 28-px meter. Round a panel ten times the size it left three long rails bare
// -- STORM's a plain cream picture frame, not cloud -- so each zone dresses a panel's long
// rails and corners with the same pieces, spaced for the length: straps and plates, drips,
// leaves, moss, cloud, knuckles, shards, stars, gilt. Positions come from the zone's own
// seeded stream (hudRng), so a panel is the same every time it is painted.
//
// The ones that pass over the whole panel or lay hundreds of puffs are generators that
// yield once their slice is spent (slices.js), as everything else the board paints is.

const bar = (g) => ({ ...g, kind: 'bar' });
/** Every `step` px along a rail of length `len`, starting `from` in: [a, ...]. */
function along(len, from, step, r) {
  const out = [];
  for (let a = from; a < len - from / 2; a += typeof step === 'number' ? step : r.int(step[0], step[1])) out.push(a);
  return out;
}
/** A gilt or bone boss: a disc shaded from its silhouette, lit upper left. */
function boss(P, g, x, y, rad, mat) {
  P.disc(x, y, rad, mat, 3);
  P.shadeBlob(x - rad - 1, y - rad - 1, x + rad + 1, y + rad + 1, mat, 3);
  P.set(x - 1, y - 1, mat, 5);
}
/** A faceted crystal shard, NEBULA's: a prism pointing along (dx, dy), its left face lit. */
function shard(P, x0, y0, dx, dy, hw, h) {
  for (let k = 0; k < h; k++) {
    const w = k < h - hw ? hw : Math.max(0, hw - (k - (h - hw)) - 1);
    for (let j = -w; j <= w; j++) {
      const t = j < -1 ? 4 : j === -1 ? 5 : j < w - 1 ? 3 : 2;
      P.set(x0 + dx * k + (dx ? 0 : j), y0 + dy * k + (dy ? 0 : j), 'rim', t);
    }
  }
}

/**
 * One puff of cloud or foliage, shaded as hudpaint's puffs() shades each of its own: one base
 * tone, a lit cap on its upper left, a crease two tones down along its underside.
 */
function puff(P, mat, cx, cy, rad, base) {
  const lim = rad * rad + 0.8 * rad;
  for (let dy = -rad; dy <= rad; dy++) {
    for (let dx = -rad; dx <= rad; dx++) {
      if (dx * dx + dy * dy > lim) continue;
      let t = base;
      if (dy < 0 && dx <= 0 && dy + dx <= -rad * 0.6) t = base + 1;
      if (dy >= rad - 0.5) t = base - 2;
      P.set(cx + dx, cy + dy, mat, t);
    }
  }
}

const DRESS = {
  // Iron straps across every rail and bigger iron plates over the corners.
  BASEMENT: {
    // The gauge's joints every 12 px across a 3-px rail are bricks end on; across a 13-px
    // rail they were square tiles, a tan ruler. Here the rim is laid as the cellar's brick:
    // courses six rows deep in running bond, a mortar row under each and a joint every 14,
    // each brick lit along its top row and a tone off its neighbours.
    own: true,
    *fn(P, g, r) {
      for (let y = g.top; y <= g.bottom; y++) {
        if (overdue()) yield;
        const row = y - g.top, course = Math.floor(row / 6);
        for (let x = g.left; x <= g.right; x++) {
          if (P.mat(x, y) !== g.rim) continue;
          const u = x - g.left + (course % 2) * 7;
          const brick = Math.floor(u / 14);
          if (row % 6 === 5 || u % 14 === 0) { P.add(x, y, -2); continue; }
          if (row % 6 === 0) P.add(x, y, 1);
          if (((brick * 7 + course * 3) % 5) === 0) P.add(x, y, -1);
        }
      }
      yield* chips(P, g, r, 120, -1);
      for (const a of along(g.iw, 70, 150, r)) band(P, bar(g), a, 8, 'iron');
      for (const a of along(g.ih, 60, 120, r)) band(P, g, a, 8, 'iron');
      for (const [x, y] of corners(g)) plate(P, x, y, 19, 'iron');
    },
  },
  // The crypt's drips hanging all along the underside.
  DUNGEON(P, g, r) {
    for (const a of along(g.iw, 18, [26, 48], r)) {
      const x = g.ix + a, y = g.bottom + 1, len = r.int(2, 5);
      for (let j = 0; j < len; j++) {
        P.set(x, y + j, 'drip', j === 0 ? 4 : 3);
        if (j < len - 1) P.set(x + 1, y + j, 'drip', 2);
      }
    }
  },
  // Leaf clusters over the corners and sprigs hanging from the underside.
  *FOREST(P, g, r) {
    for (const [x, y] of corners(g)) {
      if (overdue()) yield;
      puffs(P, 'leaf', x + (x < g.ix ? 6 : -6), y + (y < g.iy ? 2 : -2), 14, 10, 3, r);
    }
    for (const a of along(g.iw, 110, [130, 190], r)) {
      if (overdue()) yield;
      puffs(P, 'leaf', g.ix + a, g.bottom + 3, 11, 4, 3, r, -1);
    }
    for (const a of along(g.iw, 170, [190, 260], r)) {
      if (overdue()) yield;
      puffs(P, 'leaf', g.ix + a, g.top + 2, 10, 4, 3, r);
    }
  },
  // Moss over the upper corners and strands hanging all along the underside.
  SWAMP(P, g, r) {
    for (const a of along(g.iw, 16, [24, 44], r)) {
      const x = g.ix + a, len = r.int(3, 7);
      for (let j = 0; j < len; j++) P.set(x + (j > 3 ? 1 : 0), g.bottom + j, 'moss', j < 2 ? 3 : 2);
    }
    puffs(P, 'moss', g.left + 6, g.top + 3, 10, 5, 2, r);
    puffs(P, 'moss', g.right - 6, g.top + 3, 10, 5, 2, r);
  },
  // Riveted iron bands across the timber at both ends and along it.
  *DOWNTOWN(P, g, r) {
    band(P, bar(g), -g.T.l + 1, 8, 'iron');
    band(P, bar(g), g.iw + g.T.r - 9, 8, 'iron');
    for (const a of along(g.iw, 170, 190, r)) {
      // Each band runs down the panel's whole height: 4,000 pixels round the stat panel.
      if (overdue()) yield;
      band(P, bar(g), a, 8, 'iron');
    }
  },
  // Gilt bosses along the long rails, bigger ones over the corners.
  CITADEL(P, g, r) {
    for (const a of along(g.iw, 88, 176, r)) {
      boss(P, g, g.ix + a, g.top + (g.T.t >> 1), 3, 'gold');
      boss(P, g, g.ix + a, g.bottom - (g.T.b >> 1), 3, 'gold');
    }
    for (const [x, y] of corners(g)) boss(P, g, x + (x < g.ix ? 4 : -4), y + (y < g.iy ? 4 : -4), 6, 'gold');
  },
  // Cloud: puffs along every rail, bigger banks over the corners, flat-bottomed below.
  STORM: {
    // A bank of cloud all round, not a rail with bumps: the first two passes put puffs on
    // the gauge's straight rim and it read as a bumpy white picture frame, then as a row of
    // pearls. Here every rail is a chain of overlapping round puffs along its middle, the
    // top rail crowned with smaller bumps (the cumulus's cauliflower top) and the bottom one
    // left flat, as a cloud's base is. Puffs are laid bottom first so each crease shows
    // over the puff below it (pixel-art-in-code: foliage).
    own: true,
    *fn(P, g, r) {
      const list = [];
      const midT = g.top + (g.T.t >> 1), midB = g.bottom - (g.T.b >> 1);
      const midL = g.left + (g.T.l >> 1), midR = g.right - (g.T.r >> 1);
      for (const a of along(g.iw + 20, 0, [9, 13], r)) {
        list.push([g.ix - 10 + a, midT, r.int(7, 8), 4]);
        if (r.chance(0.7)) list.push([g.ix - 10 + a + r.int(-3, 3), g.top - r.int(1, 2), r.int(4, 5), 4]);
        list.push([g.ix - 10 + a, midB + 1, r.int(6, 7), 3]);
      }
      for (const a of along(g.ih, 0, [9, 13], r)) {
        list.push([midL, g.iy + a, r.int(7, 8), 4]);
        list.push([midR, g.iy + a, r.int(7, 8), 3]);
      }
      for (const [x, y] of corners(g)) list.push([x + (x < g.ix ? 6 : -6), y + (y < g.iy ? 5 : -5), 10, y < g.iy ? 4 : 3]);
      list.sort((a, b) => b[1] - a[1]);
      for (let k = 0; k < list.length; k++) {
        if ((k & 7) === 0 && overdue()) yield;
        const [x, y, rad, base] = list[k];
        puff(P, 'rim', x, y, rad, base);
      }
    },
  },
  // The head of a long bone at each corner: two knuckles and the notch between them.
  *ABYSS(P, g) {
    for (const [x, y] of corners(g)) {
      const sx = x < g.ix ? 1 : -1, sy = y < g.iy ? 1 : -1;
      P.disc(x + sx * 2, y + sy * 7, 5, 'rim', 3);
      P.disc(x + sx * 7, y + sy * 2, 5, 'rim', 3);
    }
    yield* P.shadeBlobSteps(0, 0, P.w - 1, P.h - 1, 'rim', 3, g.ring);
  },
  // Shards standing off the top rail and hanging off the bottom, pointing out at the ends.
  NEBULA(P, g, r) {
    for (const a of along(g.iw, 60, [110, 170], r)) shard(P, g.ix + a, g.top, 0, -1, r.int(2, 3), r.int(6, 9));
    for (const a of along(g.iw, 90, [130, 190], r)) shard(P, g.ix + a, g.bottom, 0, 1, 2, r.int(5, 8));
    shard(P, g.left, g.iy + 14, -1, 0, 4, 9);
    shard(P, g.right, g.iy + 14, 1, 0, 4, 9);
  },
  // Stars along the long rails, bigger ones over the corners.
  COSMOS(P, g, r) {
    for (const a of along(g.iw, 80, [120, 180], r)) star(P, g.ix + a, g.top + (g.T.t >> 1), 3, 'star');
    for (const a of along(g.iw, 140, [150, 220], r)) star(P, g.ix + a, g.bottom - (g.T.b >> 1), 3, 'star');
    for (const [x, y] of corners(g)) star(P, x + (x < g.ix ? 3 : -3), y + (y < g.iy ? 3 : -3), 7, 'star');
  },
  // Jade blocks capping the corners, as the bar's ends are capped.
  *STARFIELD(P, g) {
    for (const [x, y] of corners(g)) P.rect(x - 7, y - 7, 15, 15, 'rim', 3);
    yield* P.shadeBlobSteps(0, 0, P.w - 1, P.h - 1, 'rim', 3, g.ring);
  },
  // A gilt knob over each corner and a glint of sun on the upper right one.
  *ZENITH(P, g) {
    for (const [x, y] of corners(g)) {
      P.disc(x, y, 7, 'rim', 3);
      P.disc(x + (x < g.ix ? -7 : 7), y + (y < g.iy ? -7 : 7), 2, 'rim', 3);
    }
    yield* P.shadeBlobSteps(0, 0, P.w - 1, P.h - 1, 'rim', 3, g.ring);
    star(P, g.right + 2, g.top - 1, 4, 'glint');
  },
};

/** A canvas the board being painted owns, from the pool (hudskin.js paintingFor). */
function freshCanvas(w, h, board) {
  const made = takeCanvas(w, h);
  board.owned.push(made.c);
  return made;
}

/**
 * A panel: the zone's gauge frame round the box, its well OPAQUE -- the zone's own well
 * colour, which on the HUD is a translucent dimming -- so nothing behind can show through a
 * word. The rim is dressed by the zone's HUD dressing (the combo meter's, which is the one
 * of its two made for a frame with four rails) and then by the panel's own (DRESS), or by
 * the panel's alone where the gauge's texture does not scale up (BASEMENT's tiles, STORM's
 * bumps). The meter's finial stands over its top rim: a panel with a crest keeps it --
 * taken from the meter's dressing even where the rim is the panel's own -- and one without
 * has everything over its top rim taken off again.
 */
function* paintPanel(name, spec, p) {
  const dress = spec.frame;
  const d = DRESS[name];
  const fn = d && (d.fn || d);
  const mine = !!(d && d.own);
  const own = {
    ...spec,
    wellA: 1,
    *frame(P, g) {
      if (dress && !mine) yield* steps(dress(P, g));
      if (!p.crest) {
        for (let y = 0; y < g.top; y++) {
          if (overdue()) yield;
          for (let x = 0; x < P.w; x++) P.clear(x, y);
        }
      } else if (dress && mine) {
        const Q = new Plan(P.w, P.h, spec.mats);
        yield* steps(dress(Q, g));
        for (let y = 0; y < g.top; y++) {
          if (overdue()) yield;
          for (let i = y * P.w, e = i + P.w; i < e; i++) if (Q.m[i]) { P.m[i] = Q.m[i]; P.t[i] = Q.t[i]; }
        }
      }
      if (fn) yield* steps(fn(P, g, hudRng(name, 'board', `${g.iw}x${g.ih}`)));
    },
  };
  return yield* paintFrameSteps(own, 'meter', geometry(p));
}

/**
 * A word of the title in the zone's material, as its title painter letters the zone's name:
 * only the finished frame (frames[0]); the entrance frames are the arrival banner's. Kept
 * with it: where the ink starts and ends, and which pixels are the letters' strokes (for the
 * test's legibility measure, which must read the letters and not their shadow). Laid out,
 * painted and put on its canvas a few rows at a time.
 */
function* paintWord(theme, word, b) {
  const painter = TITLE_PAINTERS[theme.name];
  const plan = yield* layoutSteps(word, painter.METRICS);
  const art = painter.paint(word, theme, plan);
  if (overdue()) yield;
  const pix = yield* steps(art.frames[0]());
  // In the top left of a WORD_BOX canvas (see WORD_BOX); the stroke mask is laid out at the
  // canvas's width, so a pixel of it is found where the canvas's own pixel is.
  const W = WORD_BOX.w, H = WORD_BOX.h;
  const { c, g } = freshCanvas(W, H, b);
  for (let y = 0; y < Math.min(plan.h, H); y++) {
    if (overdue()) yield;
    pixToCanvas(pix, g, 0, 0, y, y + 1);
  }
  touchCanvas(c);
  const stroke = new Uint8Array(W * H);
  for (let y = 0; y < Math.min(plan.h, H); y++) {
    if (overdue()) yield;
    for (let x = 0; x < Math.min(plan.w, W); x++) stroke[y * W + x] = plan.d[y * plan.w + x] <= plan.R ? 1 : 0;
  }
  const L = plan.letters;
  return { c, w: plan.w, h: plan.h, top: plan.top, inkH: plan.inkH, x0: L[0].x0, x1: L[L.length - 1].x1, stroke };
}

/**
 * Every piece of a zone's board, in the order they are painted: [key, () => generator]. The
 * title's two words and the panels; the words on them are the menus' lettering, painted once
 * for every zone (warmBoardLettering).
 */
function piecesFor(b) {
  const { spec, theme } = b;
  const out = [];
  for (const w of TITLE_WORDS) out.push([`word${w}`, () => paintWord(theme, w, b)]);
  for (const k of Object.keys(PANELS)) out.push([k, () => paintPanel(theme.name, spec, PANELS[k])]);
  return out;
}

/** A zone's board, painted from start to end: the parts appear as each piece finishes. */
function* paintBoard(b) {
  for (const [key, make] of piecesFor(b)) {
    if (overdue()) yield;
    b.parts[key] = yield* make();
  }
  b.done = true;
}

// --- which boards are kept, and painted when ------------------------------------------------

const boards = new Map();   // zone name -> { name, theme, spec, parts, gen, done }
let lastDone = 'BASEMENT';  // the last zone whose board was all painted while he was in it
let latch = { run: null, board: null };
const stats = { slices: 0, fallbacks: 0, missing: 0, layers: 0 };
let kept = '';              // the zones the cache was last trimmed to, so it is trimmed on a change

function boardOf(theme) {
  let b = boards.get(theme.name);
  if (!b) {
    b = { name: theme.name, theme, spec: HUD_ZONES[theme.name] || HUD_ZONES.BASEMENT, parts: {}, gen: null, done: false, owned: [] };
    boards.set(theme.name, b);
  }
  return b;
}

/** The zone a fresh run climbs into after BASEMENT. */
const FIRST_NEXT = THEMES[themeIndexFor(FIRST_THEME_FLOORS)];

/**
 * Paint ahead for a frame: called once a frame by main.js, after the frame is drawn. In a
 * run (and paused) it spends up to BOARD_WARM_MS on the board of the zone he is in, then the
 * next zone's, and lets go of every board but those, BASEMENT's and the last finished one;
 * on the menus up to BOARD_IDLE_MS on the zone a fresh run climbs into after BASEMENT. In the
 * fall and on the board, nothing at all: not a slice, not a check of the cache.
 */
export function warmBoards(game) {
  const st = game.state;
  if (st === STATE.FALLING || st === STATE.DEAD) return;
  const t0 = performance.now();
  const inRun = st === STATE.PLAYING || st === STATE.PAUSED;
  let want;
  if (inRun) {
    const cur = boardOf(game.theme), next = boardOf(game.nextTheme);
    if (cur.done) lastDone = cur.name;
    want = [cur, next];
    const keep = `${cur.name} ${next.name} ${lastDone}`;
    if (keep !== kept) {
      kept = keep;
      // Every canvas a board let go of had goes back to the pool, for the next zone's board.
      for (const [k, x] of [...boards]) {
        if (k !== 'BASEMENT' && k !== lastDone && k !== cur.name && k !== next.name) { releaseOwned(x); boards.delete(k); }
      }
    }
    // A new run: the last death's board and its faded words are let go.
    if (latch.run && latch.run !== game.run) {
      for (const c of layers.values()) layerPool.push(c);
      layers.clear();
      latch = { run: null, board: null };
    }
  } else {
    want = [boardOf(THEMES[0]), boardOf(FIRST_NEXT)];
  }
  // Stopped short of the budget by the room its last slice needs: a painter yields at its
  // next check after the deadline, so a deadline AT the budget ended every busy frame past
  // it (0.57 ms at p99 against 0.5).
  const until = t0 + (inRun ? BOARD_WARM_MS : BOARD_IDLE_MS) - BOARD_SLICE_MS;
  let worked = false;
  for (const b of want) {
    if (b.done) continue;
    // runUntil always resumes the painter once; past the deadline, not even that.
    if (performance.now() >= until) break;
    if (!b.gen) b.gen = paintBoard(b);
    worked = true;
    if (paintingFor(b, () => runUntil(b.gen, until)).done) b.gen = null;
  }
  if (worked) {
    stats.slices++;
    const log = inRun ? warmLog.play : warmLog.idle;
    log.push(t0, performance.now());
    if (log.length > 8192) log.splice(0, 4096);
  }
  if (inRun && want[0].done) lastDone = want[0].name;
}

/**
 * When each call that painted began and ended, in a run and on the menus, as performance.now()
 * times in turn [t0, t1, ...], the last few thousand: for the tools (tools/test-smooth.mjs).
 */
const warmLog = { play: [], idle: [] };
export function boardWarmTimes() { return { play: warmLog.play.slice(), idle: warmLog.idle.slice() }; }

/** Paint whatever a zone's board still lacks, now. For load time and the tools. */
export function warmBoardNow(theme) {
  const b = boardOf(theme);
  if (!b.done) {
    paintingFor(b, () => drain(b.gen || paintBoard(b)));
    b.gen = null;
  }
  return b;
}

/**
 * The board a death is drawn in, chosen once per death (per run) and kept for all of it:
 * the zone's own if it is all painted, else the last finished zone's, else BASEMENT's --
 * never one painted now. See "PAINTED AHEAD" above.
 */
function deathBoard(game) {
  if (latch.run !== game.run || !latch.board) {
    const own = boards.get(game.theme.name);
    let b = own && own.done ? own : null;
    if (!b) {
      const last = boards.get(lastDone);
      b = last && last.done ? last : boards.get('BASEMENT');
      if (b) stats.fallbacks++;
    }
    for (const c of layers.values()) layerPool.push(c);
    layers.clear();
    latch = { run: game.run, board: b || { name: 'none', spec: HUD_ZONES.BASEMENT, parts: {}, done: false } };
  }
  return latch.board;
}

/** The board to draw for a game that has ended: see deathBoard. Never paints. */
export function boardSkinFor(game) { return deathBoard(game); }
/** The skin the fall's words are lettered from (screens.js drawFallWords): the same board. */
export function fallSkinFor(game) { return deathBoard(game); }

/**
 * slices: frames in which warmBoards painted anything; fallbacks: deaths drawn in another
 * zone's board; missing: characters asked for that the font has no glyph for; layers: words
 * put together for a fade; zones: the boards kept, and which of them are finished.
 */
export function boardStats() {
  return { ...stats, zones: [...boards.keys()], done: [...boards.values()].filter((b) => b.done).map((b) => b.name), lastDone };
}
export function resetBoardStats() { stats.slices = 0; stats.fallbacks = 0; stats.missing = 0; stats.layers = 0; }

/**
 * For the tools: let go of every board but BASEMENT's, as the game stands after loading --
 * so a test can stage a session from its start. BASEMENT's is kept, as in the game, unless
 * `all` (to paint it again in slices; warmBoardNow puts it back).
 */
export function forgetBoards(all = false) {
  for (const [k, b] of [...boards]) if (all || k !== 'BASEMENT') { releaseOwned(b); boards.delete(k); }
  lastDone = 'BASEMENT';
  latch = { run: null, board: null };
  kept = '';
}

/** What the painted boards hold, in bytes of canvas (4 per pixel) and masks, per zone. */
export function boardMemory() {
  const per = {};
  let total = 0;
  for (const [name, b] of boards) {
    let n = 0;
    for (const p of Object.values(b.parts)) {
      const c = p && p.c ? p.c : p;
      if (c && c.width) n += c.width * c.height * 4;
      if (p && p.stroke) n += p.stroke.length;
    }
    per[name] = n;
    total += n;
  }
  return { per, total };
}

// BASEMENT's board is painted at load, whole: every run starts there, and it is the board
// every death can fall back on (deathBoard), so one is always there without painting in a
// frame. A death in the first seconds of the first run of a session would otherwise have
// none: the fire can take him 1.6 s after the run starts, and a player can start it on the
// first frame of the menu.
if (typeof document !== 'undefined' && document.createElement) warmBoardNow(THEMES[0]);

// --- the lettering, painted at load --------------------------------------------------------

/**
 * Every piece of the menus' lettering the fall's words and the board draw -- and the herald's
 * lines and the companions' calls, which letter in the same inks -- painted and brought up at
 * load (menuskin.js menuWarmNow): nothing may be painted in the fall or on the board, nor any
 * canvas drawn from for the first time there or in play (tools/test-smooth.mjs,
 * tools/test-boardwarm.mjs), and a run can start on the title screen's first frame, before
 * the menus' own warm-up has painted a piece of theirs. What the title screen already paints
 * at load is asked again at no cost. About 60 ms headless, in place of the thirteen glyph
 * atlases BASEMENT's board painted at load.
 */
const LETTERING = [
  warm.ink('label'), warm.ink('text'), warm.ink('gold'), warm.ink(BOARD_INKS.award),
  ...['SPACE', 'S', 'ESC', 'R', 'G', 'RB', 'LB'].map((k) => warm.cap(k)),
  warm.line(IMPACT_WORDS.splat, 3, 'danger'), warm.line(IMPACT_WORDS.dazed, 3, 'gold'),
  warm.promptOn(BOARD_PROMPT), warm.slice('panel'),
];
export function warmBoardLettering() { menuWarmNow(LETTERING); }
/**
 * The same, by the name the load-time prepaint calls it (prepaint.js): until the board took
 * the menus' lettering (2026-09-29) this painted the glyph masks of every zone's board inks.
 */
export const warmBoardMasks = warmBoardLettering;
if (typeof document !== 'undefined' && document.createElement) warmBoardLettering();

// --- drawing -----------------------------------------------------------------------------

/**
 * A word faded in whole: its letters on their keyline, put together once into a canvas and
 * drawn as one picture at the fade's alpha. Kept for the death they belong to (released when
 * the next death is latched) and the canvases reused, so a death allocates none after the
 * first few; putting one together is the drawImage per character the word costs anyway.
 */
const layers = new Map();
const layerPool = [];
/**
 * The height of every fade layer [view units; 26]: the tallest word the fall fades in, SPLAT
 * lettered at scale 3 -- 21 units of letter, two of bed and shadow each side, and the
 * lettering's last row -- so any of them fits in any layer. A layer is a strip of the
 * screen's whole width, and a word is put into it where it stands on the screen (fadeLayer).
 * A layer used to be sized to its word, and setting a canvas's size gives it a new backing --
 * in the frame the impact's words came up. [1920 x 104 backing px; 0.8 MB each]
 */
const FADE_ROWS = 26;
const FADE_W = SW, FADE_H = FADE_ROWS * PX;
/**
 * How many fade layers are made at load (warmFadeLayers): the impact's word, the verdict, the
 * floor and SPACE, and one to spare. A death that wanted more would make one in the fall;
 * tools/test-smooth.mjs counts it. [layers; 5]
 */
const FADE_LAYERS = 5;

/** Make the fade layers now, touched, while nobody plays. For the load-time prepaint. */
export function warmFadeLayers(n = FADE_LAYERS) {
  while (layerPool.length + layers.size < n) {
    const { c, g } = newCanvas(FADE_W, FADE_H);
    g.fillStyle = '#000';
    g.fillRect(0, 0, 1, 1);
    g.clearRect(0, 0, 1, 1);
    touchCanvas(c);
    layerPool.push(c);
  }
}
/**
 * The picture a word fades in from: `draw(g)` -- the word's own lettering calls, in view
 * units -- run once into a layer that is the strip of the screen from view row `top` down,
 * the word exactly where it stands on the screen. `id` names the word within its death.
 */
function fadeLayer(skin, id, top, draw) {
  // The board is part of the key: keyed on the word alone, the same word asked for from
  // another zone's board came back in the first zone's letters. In the game a death's
  // words all come from its one board (deathBoard), but a tool drawing two zones did not.
  const key = `${skin.name}|${id}`;
  let c = layers.get(key);
  if (c) return c;
  c = layerPool.pop() || newCanvas(FADE_W, FADE_H).c;
  // What it holds, for the tools (tools/test-gameover.mjs reads the words off it).
  c.boardWord = { id, top };
  const g = c.getContext('2d');
  // Cleared by hand, not by setting its size (which gives it a new backing), and its state
  // put back as a fresh canvas has it -- but smoothing off, as everywhere here.
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.imageSmoothingEnabled = false;
  g.globalAlpha = 1;
  g.clearRect(0, 0, FADE_W, FADE_H);
  g.setTransform(PX, 0, 0, PX, 0, -top * PX);
  draw(g);
  layers.set(key, c);
  stats.layers++;
  return c;
}

/**
 * One of the fall's words, drawn by `draw(ctx)` at `alpha`, WHOLE: below 1 from a picture of
 * the finished word (fadeLayer) at that alpha, so from nothing it comes up as itself; at 1
 * straight onto the screen by the same calls, so the fade ends on the word to the pixel.
 * Faded as two layers -- the keyline whole from the first frame, the letters over it -- the
 * impact's words came up as black stencils over its white flash. `top` is a whole view row at
 * or above the word's highest pixel, with the word inside FADE_ROWS under it.
 */
export function boardFade(ctx, skin, id, top, draw, alpha) {
  if (!(alpha > 0)) return;
  if (alpha >= 1) { draw(ctx); return; }
  const c = fadeLayer(skin, id, top, draw);
  const was = ctx.globalAlpha;
  ctx.globalAlpha = was * alpha;
  ctx.drawImage(c, 0, 0, FADE_W, FADE_H, 0, top, VW, FADE_ROWS);
  ctx.globalAlpha = was;
}

/**
 * A line of the board's words in the menus' fine lettering (menuskin.js mText): the font glyph
 * for glyph in one of its inks (`role`: 'label', 'text', 'gold' or a '#rrggbb' data colour),
 * laid out exactly as font.js drawText lays out scale 1, so a line measured with textWidth is
 * where it lands. A character the font has no glyph for would be a gap, and is counted
 * (boardStats().missing). Returns the width, in view units.
 */
export function boardLine(ctx, role, str, x, y, align = 'left', alpha = 1) {
  str = String(str).toUpperCase();
  for (const ch of str) if (ch !== ' ' && !GLYPHS[ch]) stats.missing++;
  return mText(ctx, role, str, x, y, align, alpha);
}

/** A panel with its inside box's top-left at view (x, y). */
export function drawBoardPanel(ctx, skin, key, x, y) {
  const f = skin.parts[key];
  if (!f) return;
  const U = 1 / PX;
  ctx.drawImage(f.c, 0, 0, f.c.width, f.c.height, x - f.ox * U, y - f.oy * U, f.c.width * U, f.c.height * U);
}

/**
 * GAME OVER, centred on view column `cx` with the letters' ink starting on view row `top`.
 * Placed in whole backing pixels, so every pixel of the painting lands on one of the store's.
 * Returns the ink's height in view units.
 */
export function drawBoardTitle(ctx, skin, cx, top) {
  const words = TITLE_WORDS.map((w) => skin.parts[`word${w}`]);
  if (words.some((w) => !w)) return 0;
  const inkW = words.reduce((s, w) => s + (w.x1 - w.x0), 0) + WORD_GAP * (words.length - 1);
  let X = Math.round(cx * PX - inkW / 2);
  const Y = Math.round(top * PX);
  for (const w of words) {
    ctx.drawImage(w.c, 0, 0, w.w, w.h, (X - w.x0) / PX, (Y - w.top) / PX, w.w / PX, w.h / PX);
    X += (w.x1 - w.x0) + WORD_GAP;
  }
  return words[0].inkH / PX;
}
