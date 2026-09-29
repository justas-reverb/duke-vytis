// Everything the game paints ahead, painted before it is wanted: at load, behind LOADING DUKE
// VYTIS, what a whole game will ever draw of it; on the title screen, a frame's spare time at
// a time, what is left; and in a run only what has to follow the climb -- the next zone's HUD
// skin, title and scoreboard -- sliced under a budget, into canvases the zones behind let go.
//
// WHY. Measured in an offscreen Electron window at 160 Hz (the shipped runtime, presenting,
// GPU on), over a bot's climb through five zones and a death: the frames over 8 ms in play
// were the painting ahead, every one -- a zone's title painted a piece a frame (6 to 13 ms a
// piece in every zone), a backdrop layer a frame (up to 21 ms, SWAMP's; 20 to 34 ms with the
// frame's own work), a zone's furniture in one frame (FOREST's 13 ms), a wall strip (7 ms),
// the next skin a piece a frame (2-3 ms on the frame's own), the companions' poses the frame
// each was first drawn -- and in the fall, the burn's first use (see Renderer.warmBurnLayer)
// and a new layer for the HUD to fade out as. The scenery caches here were never let go of
// anyway -- every zone's layers, strips, atlases and sprites stayed once painted -- so
// painting them all at load holds what a long session held already, only from the start:
// about 50 MB of canvas, and 250-300 ms of the load in Chromium.
//
// What stays in play: the HUD skin (hudskin.js hudSkinFor, SKIN_WARM_MS a frame), the next
// zone's title if the title screen did not get to it (zonetitles.js, TITLE_WARM_MS) and the
// scoreboards (gameoverskin.js warmBoards, BOARD_WARM_MS), each a generator resumed under a
// deadline, painting into canvases from the pool (canvases.js) that the load primed with
// SKIN_SPARES skins' and BOARD_SPARES boards' worth, and that every zone let go of refills.
// Nothing at all is painted in the fall or on the scoreboard.

import { THEMES } from '../game/themes.js';
import { warmDecor } from './decor.js';
import { wallStrip } from './walls.js';
import { streakAtlas } from './streaks.js';
import { platArt } from './platsprites.js';
import { canvasFor, COMPANION_IDS, COMP_POSE_NAMES } from './compsprites.js';
import { riseArt } from './risefloor.js';
import { warmSparks } from './sparks.js';
import { spriteAtlas } from './sprites.js';
import { warmInks } from './callouts.js';
import { warmLedgeShadows } from './renderer.js';
import { warmHudSkin, warmMasks } from './hudskin.js';
import { HUD_ZONES } from './hudpaint.js';
import { warmBoards, warmBoardNow, warmBoardMasks, warmFadeLayers } from './gameoverskin.js';
import { warmTitlesIdle } from './zonetitles.js';
import { warmHudExit } from '../ui/screens.js';
import { reserveCanvases, touchNew, poolStats } from './canvases.js';

/**
 * Spare HUD skins' worth of canvases made at load [skins; 2]: the zone ahead's is painted in
 * play while BASEMENT's and the current one's are kept, so the first two zones of a session's
 * first run have none let go of to reuse. [~6.3 MB each]
 */
const SKIN_SPARES = 2;
/**
 * Spare scoreboards' worth [boards; 3]: the title screen paints DUNGEON's from the pool, and in
 * a run the current zone's, the next zone's and the last finished one are kept beside
 * BASEMENT's. [~7.3 MB each]
 */
const BOARD_SPARES = 3;

const stats = { ms: 0, touched: 0, poolBytes: 0, madeBytes: 0, parts: {} };

/** Every canvas an owner holds, as sizes. */
function sizesOf(owned) {
  const n = new Map();
  for (const c of owned) { const k = c.width + 'x' + c.height; n.set(k, (n.get(k) || 0) + 1); }
  return n;
}
function reserveLike(owned, copies) {
  for (const [k, n] of sizesOf(owned)) {
    const [w, h] = k.split('x').map(Number);
    reserveCanvases(w, h, n * copies);
  }
}

/**
 * Paint every zone's scenery now and bring every canvas up (canvases.js touchNew), prime the
 * pool, and make the fall's layers. Called once by main.js at load, after the Renderer.
 */
export function prepaint(renderer) {
  const t0 = performance.now();
  let t = t0;
  const lap = (k) => { const n = performance.now(); stats.parts[k] = +(n - t).toFixed(1); t = n; };
  for (let i = 0; i < THEMES.length; i++) renderer.backdrop.layers(i, THEMES[i]);
  lap('backdrops');
  for (let i = 0; i < THEMES.length; i++) warmDecor(i, THEMES[i]);
  lap('furniture');
  for (const th of THEMES) { wallStrip(th); streakAtlas(th); platArt(th.name); }
  warmLedgeShadows(THEMES.map((th) => th.name));
  lap('walls, streaks, ledges');
  for (const id of COMPANION_IDS) for (const pose of COMP_POSE_NAMES) canvasFor(id, pose);
  riseArt();
  warmSparks();
  renderer.backdrop.fadeCtx();
  renderer.scanlineLayer();
  lap('companions, rise, trail, layers');
  // The Duke's two atlases (5040 x 212 each, both facings) and the floaters' inks: pieces that
  // cannot be sliced, 30-80 ms an atlas and 7-10 ms an ink in Chromium, wanted by the first
  // frames of any run. Left to be built on first use they were: on the title screen, two 75 ms
  // frames when the demo first drew him each way and seventeen 12 ms ones for the inks; and in a
  // run started within a second or two of the title screen, the same in the run's first frames
  // (a 69 ms frame at its start, another at his first turn), in the frames that matter.
  spriteAtlas(false);
  spriteAtlas(true);
  warmInks();
  lap('the Duke, the floaters');
  // Every zone's glyph masks, for the skins and the boards painted in play.
  warmMasks(Object.values(HUD_ZONES));
  warmBoardMasks();
  // The fall's own canvases: the HUD's exit layer, the impact's faded words, the burn.
  warmHudExit();
  warmFadeLayers();
  renderer.warmBurnLayer();
  lap('masks, fall layers, burn');
  touchNew();
  lap('touch');
  // The pool, in BASEMENT's sizes: every zone's skin and board has the same canvases (the
  // title words are WORD_BOX in every zone), so spares of BASEMENT's are spares of any.
  reserveLike(warmHudSkin('BASEMENT').owned, SKIN_SPARES);
  reserveLike(warmBoardNow(THEMES[0]).owned, BOARD_SPARES);
  lap('pool');
  const p = poolStats();
  stats.ms = performance.now() - t0;
  stats.touched = p.touched;
  stats.poolBytes = p.bytes;
  // Every canvas made through canvases.js by the end of the load, the spares included: what
  // the pre-painting holds from the start (a canvas is four bytes a pixel).
  stats.madeBytes = p.madeBytes;
  return stats;
}

/** What the load's prepaint took [ms], each part of it, what it touched, and the pool's bytes. */
export function prepaintStats() { return { ...stats, parts: { ...stats.parts } }; }

/**
 * Paint ahead for a frame, after it is drawn: the scoreboards (warmBoards: in a run and on the
 * title screen, under their own budgets) and, on the title screen, every zone's title
 * (warmTitlesIdle). Nothing in the fall or on the scoreboard. Called once a frame by main.js.
 */
export function warmAhead(game) {
  warmBoards(game);
  warmTitlesIdle(game);
}
