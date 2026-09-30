// World renderer.
//
// Resolution lives in ONE place: the PX block in src/game/constants.js. The backing
// store is 1920x1080 and integer-scales 2x to 3840x2160 and 1x to 1920x1080.

//
// On top of that outer scale there is an INNER zoom, because the shaft starts narrow
// and opens out as the run builds. It runs 2.0 down to 1.0 in STEPS (ARENA_STEPS in
// game.js: 2, 1.75, 1.5, 1.25, 1), chosen so the world scale zoom x PX is a whole 8, 7,
// 6, 5 or 4 at rest and the WORLD grid is never resampled while you are looking at it.
// It was continuous once, and was fractional across 96.7% of the arena's range. The VIEW
// glides between steps (game.zoomView, ZOOM_EASE) so a step reads as a zoom rather than
// a cut; the glide is the one moment the world grid is uneven, on purpose.
//
// That is the world grid, not the art. The imported art is drawn at PX pixels per world
// unit, so one art pixel is `zoom` backing-store pixels: whole at 2 and 1, uneven at
// 1.75, 1.5 and 1.25, where the Duke, the companions and the platform tiles are
// resampled at rest, glide or no glide.

import { Backdrop } from './backdrop.js';
import { drawSprite, drawGhost, warmGhosts, warmSplat, bitCanvas, pieceBox, RUN_CYCLE, IDLE_CYCLE,
         SPLAT_BITS, SPLAT_INKS, FALL_POSE, BODY_W, BODY_H, SPR_W, SPR_H, FRONT_FRAMES,
         CROWN_GEMS, FOOT_DROP, FRAMES as SPRITE_FRAMES } from './sprites.js';
import { textWidth } from './font.js';
import { mText, mPanel } from './menuskin.js';

// ONE pulse rate for everything red.
//
// There used to be four, all near the bottom of the screen and none of them related:
// the kill line's underglow at sin(t*9), the danger band at sin(t*12), the HUD's FALL ROOM
// gauge at sin(t*14) and the CLIMB warning at sin(t*16). Four incommensurate frequencies
// beating against each other is why the threat read as flickering at random rather than as
// one thing pulsing. They share a rate now, so they blink together and look deliberate:
// the rising floor's crest, the danger band and CLIMB! (the gauge has since been removed).
// The speed afterimage: flat silhouettes of him on the path he just took (afterimage.js
// keeps the path, drawGhost in sprites.js draws a copy, the tunables are GHOST_* in
// constants.js).
import { Afterimage } from './afterimage.js';
import { GHOST_ALPHA, GHOST_FROM, GHOST_FULL, GHOST_MOMENTUM_FROM, GHOST_MOMENTUM_FULL }
  from '../game/constants.js';

// A white trail over a dark backdrop, a black one over a light backdrop. Decided from
// the near parallax layer, which is what is actually behind the player, and memoised
// because it only changes when the theme does. Every shipped theme is dark, so this is
// really insurance against a future bright one rather than something you can see today.
const ghostTones = new Map();
function ghostTone(theme) {
  let t = ghostTones.get(theme.name);
  if (t === undefined) {
    const h = String(theme.bgNear || '#000000').replace('#', '');
    const r = parseInt(h.slice(0, 2), 16) || 0;
    const g = parseInt(h.slice(2, 4), 16) || 0;
    const b = parseInt(h.slice(4, 6), 16) || 0;
    t = (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
    ghostTones.set(theme.name, t);
  }
  return t;
}

export const THREAT_HZ = 9;
import { drawStreaks } from './streaks.js';
import { drawDecor, preloadDecor } from './decor.js';
import { drawCompanion } from './compsprites.js';
import { drawSparks } from './sparks.js';
import { drawComboText, comboTextWidth, floaterPx, warmComboText, drawCalloutBadge } from './callouts.js';
import { drawRise, warmRise, RISE_DEPTH } from './risefloor.js';
import { drawShaftWalls } from './walls.js';
import { platArt, CAP_W, TILE_W, CELL_H, HEAD } from './platsprites.js';
import { ZONES as PLAT_ROWS } from './platart.js';
import { drawGround, warmGround } from './ground.js';
import { callFade, TUNE as COMP_TUNE } from '../game/companions.js';
import { warmBurn, drawBurnMasks, drawBurnColumns } from './burn.js';
import { newCanvas, touchCanvas } from './canvases.js';
import { decorReach } from './decor.js';
import { compArt } from './compsprites.js';
import { STEP } from '../core/loop.js';

/** Their run cycle. Three drawings, like the player's. */
const COMP_RUN = ['run0', 'run1', 'run2'];
/** A companion's top, in world units: its feet plus its drawing's height (compSize, without
 *  the object compSize makes each call -- this runs for each of them every frame). */
const compTop = (c) => c.y + compArt(c.id).SPR_H / PX;
import { VW, VH, SW, SH, PX, PLAY_L, PLAY_R, FLOOR_H, PLAT_THICK, PLAYER_H, CX,
  BLOOD_POOL_T, BURN_T, FALL_CAM_BLEND } from '../game/constants.js';
import { STREAK_BUDGET } from '../game/settings.js';
import { THEMES } from '../game/themes.js';
import { DEMO_DISSOLVE } from '../game/constants.js';

/**
 * How much of the available scale AUTO will give up to keep the pixel grid exact.
 *
 * At 0.85 the integer multiple is taken whenever it is within 15% of what the display
 * could give -- so a resolution that is a clean multiple, or nearly one, stays crisp,
 * and one that is badly off uses the whole screen instead. Raising it toward 1 means
 * fewer screens get bars and more get a soft image; lowering it, the reverse.
 *
 *   3840x2160   2.00 available, 2 whole   ratio 1.00   crisp
 *   1920x1080   1.00,           1         1.00         crisp
 *   2048x1152   1.07,           1         0.94         crisp, 6% of bar
 *   2560x1440   1.33,           1         0.75         filled
 *   1600x900    0.83 -- smaller than the store, so scaled down whatever the mode
 *
 * Against the 1920x1080 store. The table was first written at 960x540, where 4K had
 * 4.00 available.
 */
const CRISP_ENOUGH = 0.85;

/**
 * Snap a world coordinate to the BACKING-STORE PIXEL grid.
 *
 * Positions used to be Math.round()ed, which snaps to whole WORLD units -- PX screen
 * pixels. At PX=2 that was a two-pixel quantum and barely visible. At PX=4 it is four,
 * and a camera easing toward a new target moves the character in four-pixel steps: he
 * visibly pops up and down while the daze camera settles after a fall. Snapping to 1/PX
 * keeps the art on the pixel grid, which is the point, without the jumps.
 */
const snap = (v) => Math.round(v * PX) / PX;

/**
 * The run is lost: on the way down, or on the scoreboard. The death's scene -- the pit, the
 * body as it lies, the pieces and the blood -- is drawn in both. It used to be drawn only
 * while FALLING, so the frame the scoreboard came up the pit floor and every piece vanished
 * and the Duke stood there whole again in a live pose, hanging where the floor had been.
 * The board's old near-black wash hid it; the board drawn in each zone's style shows the
 * zone behind it, and him with it.
 */
const dying = (game) => game.state === 'falling' || game.state === 'dead';

// Dark pool, body, wet middle, lit skin -- in drawing order, darkest first.
const BLOOD_TONES = ['#4a0818', '#6a0c20', '#7e1028', '#a4183a'];
const POOL_TONES = [[1, 1, 0], [0.84, 0.85, 1], [0.6, 0.6, 2], [0.24, 0.4, 3]];
const MARK_TONES = [[1, 1, 0], [0.72, 0.7, 2], [0.38, 0.34, 3]];

/**
 * Every rectangle of blood on the pit floor after a splat, in world units, on the art
 * grid. drawSplatter paints exactly these, and test-death.mjs measures their area, so
 * "more blood from higher up" is checked against what is drawn rather than against a
 * number that is supposed to drive it.
 *
 * Blood lies ON the floor, and the floor's surface is the rows ABOVE the contact line,
 * receding away from the viewer (see drawPit). So every stain is half an ellipse standing
 * on the contact line: widest at the front edge, narrowing as it recedes up the screen --
 * the same shape the contact shadow has, and for the same reason.
 *
 *   the pool     under the impact, spreading over BLOOD_POOL_T to a width set by the
 *                severity of the fall
 *   the marks    one set per strike of every piece, sized by how hard it hit and how far
 *                he fell (Game.bleed)
 *   the spatter  droplets thrown out past the pool, each appearing when it lands
 */
export function bloodStains(game) {
  const out = [];
  if (!game || !game.impacted || !game.splat) return out;
  const y = game.pitY;
  const u = 1 / PX;
  const stain = (x, hw, depth, tones, rowH) => {
    const rows = Math.max(1, Math.round((depth * PX) / rowH));
    for (let r = 0; r < rows; r++) {
      const k = Math.sqrt(Math.max(0, 1 - ((r + 0.5) / rows) ** 2));
      for (const [f, reach, tone] of tones) {
        if (r >= rows * reach) continue;
        const l = snap(x - hw * k * f), rt = snap(x + hw * k * f);
        if (rt > l) out.push({ x: l, y: y + r * rowH * u, w: rt - l, h: rowH * u, c: BLOOD_TONES[tone] });
      }
    }
  };
  const pool = game.bloodPool;
  if (pool) {
    // Eased out: it gushes, then creeps.
    const t = Math.min(1, (game.impactT || 0) / BLOOD_POOL_T);
    const hw = pool.w * (1 - (1 - t) * (1 - t));
    if (hw > u) stain(pool.x, hw, Math.min(10, 0.5 + hw * 0.22), POOL_TONES, 1);
  }
  // Two art pixels to a row: there are a hundred-odd of these on a deep fall, and one-
  // pixel rows cost thousands of rectangles a frame for a stair step nobody can see.
  for (const b of (game.blood || [])) stain(b.x, b.w, b.d, MARK_TONES, 2);
  for (const d of (game.spatter || [])) {
    if ((game.impactT || 0) < d.t) continue;
    out.push({ x: snap(d.x), y: y + snap(d.h), w: d.s * u, h: d.s * u,
      c: BLOOD_TONES[d.s > 1 ? 0 : 2] });
  }
  return out;
}

/**
 * The scale the canvas is displayed at, given a viewport and a mode.
 *
 * Pulled out of fit() so tools/test-scaling.mjs can check every resolution anybody is
 * likely to have without a browser or a canvas. It is pure arithmetic, and arithmetic
 * that decides whether the game fills the screen or sits in the middle of it is worth
 * a test rather than a look on one display.
 */
export function scaleFor(w, h, mode = 'auto', sw = SW) {
  const raw = Math.min(w / sw, h / SH);
  if (!(raw > 0)) return 1;
  // Smaller than the backing store. Whatever the mode says, upscaling here would push
  // the canvas outside the window and CROP the play area rather than letterbox it --
  // the old Math.max(1, ...) did exactly that at the 640x360 minimum window size.
  if (raw < 1) return raw;
  if (mode === 'fill') return raw;
  if (mode === 'integer') return Math.floor(raw);
  const whole = Math.floor(raw);
  return whole / raw >= CRISP_ENOUGH ? whole : raw;
}

// Near-black, very slightly warm so it does not read as a hole punched in the screen.
const OUTLINE = '#0b0810';

// `cool` biases the blue channel. Omitted it is 1 and the result is byte-identical to
// what this returned before. It was added for the tomb material -- stone carved into
// shadow goes cooler as well as darker -- which went with the rest of the procedural
// platforms (below); no caller passes it now.
const shade = (hex, k, cool = 1) => {
  const n = parseInt(hex.slice(1), 16);
  const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + (
    (cl(((n >> 16) & 255) * k) << 16) |
    (cl(((n >> 8) & 255) * k) << 8) |
    cl((n & 255) * k * cool)
  ).toString(16).padStart(6, '0');
};

// ---------------------------------------------------------------------------
// Platform materials were painted here: one painter per style name in platstyles.js, so
// each band's floors were made of something that belonged to that band rather than the
// same grey slab recoloured twelve times. A ledge in the DUNGEON was a TABLE TOMB -- the
// band already drew a panelled body with a projecting, brightly lit top slab, exactly
// the silhouette of a fifteenth-century chest tomb seen from the side, where a ledger
// stone lies IN a floor and shows a one-pixel edge. Those painters are gone (see below)
// and the platforms are drawn art. `hash` is what is left of them, and nothing calls it.
const hash = (a, b) => {
  let s = ((a * 73856093) ^ (b * 19349663)) >>> 0;
  s ^= s >>> 13; s = (s * 1274126177) >>> 0;
  return (s >>> 8) / 16777216;
};

// THE THIRTEEN MATERIALS AND NINE CAPS USED TO LIVE HERE.
//
// A platform was drawn procedurally: a material function striping brick or plank or
// crystal into a rect, a cap function stippling studs along its top edge, and four
// colours per zone doing the rest. Two hundred and fifty lines of it, and a zone was a
// choice of one material and one cap.
//
// It was the right answer for exactly as long as the only platform art in the project
// was art the renderer could compute. The art is drawn now -- see src/render/platart.js,
// three pieces per zone -- so all of it is gone rather than kept switched off. What the
// materials and caps were MEANT to represent is written down in the artist's reference,
// which is where intent belongs.


// --- the shadow under a ledge ---------------------------------------------------------
//
// A ledge darkens the wall just under what it DRAWS, so it sits in front of the backdrop
// whatever the zone's palette does. It is shaped from the tile art itself: in every
// column of the left cap, the tile and the right cap, the transparent pixels just below
// the drawn body, in LEDGE_SHADOW's steps, fading down.
//
// WHAT WAS WRONG. It was one 30% black bar, 3 world units (12 art px) deep, laid under
// every ledge at PLAT_THICK below the surface -- the physics thickness, 28 px -- and 2
// units to the right. That fits only a tile drawn solid all the way to row 40. DOWNTOWN's
// gallery ends at a median 16 px and hangs posts to 25, so the bar floated 3 px under the
// post tips, loose, as a second dark beam; DUNGEON's stone ends at 16 and the bar hung 12
// px below it; under STORM's cloud (24) and more faintly ABYSS (23 on the median) it was
// a detached bar too. And shifted right, it stuck 8 px out past every ledge's right end
// and stopped 8 px short of its left, where no light in the zone could put it. Shaped per
// column and cast straight down, it cannot come loose from anything the tile draws, it
// follows a cloud's scallops and a crypt stone's ragged edge, and it ends where the ledge
// ends.
//
// DOWNTOWN casts none. Its gallery hangs short posts under the beam: shaped from the
// silhouette, the shadow drew a dark stub under every post (a longer post) and a band
// along the beam between them (a second beam), and the user asked for the shadows under
// that ledge to go. The beam's own ink underside is its contact edge.
//
// Built once per zone into three canvases the size of the art's pieces plus the shadow's
// depth, and drawn with the same source cuts as the tiles, so a part tile's shadow is
// cut exactly where the tile is. It reads the zone's rows for WHETHER a pixel is drawn
// ('.' or not) and never for its colour, so it needs no palette: each zone's keys mean
// that zone's colours only (`pal` in platart.js), and platsprites.js is what reads them.
/** [rows below the drawn body, alpha]: two rows at 0.3, then fading out. [art px] */
const LEDGE_SHADOW = [[1, 0.3], [2, 0.3], [3, 0.18], [4, 0.18], [5, 0.08], [6, 0.08]];
const LEDGE_SHADOW_H = LEDGE_SHADOW.length;
const LEDGE_SHADOW_OFF = new Set(['DOWNTOWN']);
const ledgeShadows = new Map();

function shadowPiece(rows, w) {
  const { c, g } = newCanvas(w, CELL_H + LEDGE_SHADOW_H);
  const solid = (x, y) => y >= HEAD && y < CELL_H && rows[y] && rows[y][x] && rows[y][x] !== '.';
  for (let y = HEAD + 1; y < CELL_H + LEDGE_SHADOW_H; y++) {
    let x = 0;
    while (x < w) {
      // How far below the nearest drawn pixel above this one, in this column.
      const at = (xx) => {
        if (solid(xx, y)) return 0;
        for (const [d, a] of LEDGE_SHADOW) if (solid(xx, y - d)) return a;
        return 0;
      };
      const a = at(x);
      if (!a) { x++; continue; }
      let n = 1;
      while (x + n < w && at(x + n) === a) n++;
      g.fillStyle = '#000000' + Math.round(a * 255).toString(16).padStart(2, '0');
      g.fillRect(x, y, n, 1);
      x += n;
    }
  }
  return c;
}

/**
 * Every zone's shadow pieces, now. They were built the first time a zone's ledges were drawn,
 * which at a zone change is the frame of the change; the load-time prepaint (prepaint.js)
 * builds them all instead.
 */
export function warmLedgeShadows(names) {
  for (const name of names) ledgeShadow(name);
}

/** The three shadow pieces for a zone, by theme name, or null where it casts none. */
function ledgeShadow(name) {
  if (ledgeShadows.has(name)) return ledgeShadows.get(name);
  const z = PLAT_ROWS[name] || PLAT_ROWS[Object.keys(PLAT_ROWS)[0]];
  const s = LEDGE_SHADOW_OFF.has(name) ? null : {
    left: shadowPiece(z.left, CAP_W), tile: shadowPiece(z.tile, TILE_W), right: shadowPiece(z.right, CAP_W),
  };
  ledgeShadows.set(name, s);
  return s;
}

/**
 * The screen's 2D context, with Chromium's low-latency hint (`desynchronized`) or without.
 *
 * Without, by default. It was on from the first build with no reason written down. A
 * desynchronized canvas is Chromium's low-latency path: on Windows it presents through a swap
 * chain of its own, and in a trace of the game in an offscreen Electron window at 160 Hz that
 * Present held the GPU process's main thread about 5.5 ms of every 6.25 ms frame -- one frame
 * in nine missed its vsync in play (the pacing of an empty page did the same), and in the fall,
 * where the burn rasters a second full-screen canvas each frame, every other frame took 19-38
 * ms. Without it the same climb and deaths drew every frame on time, the fall's included (the
 * numbers are in 9c478d3). What it gives up: at most one frame between a key and the screen,
 * 6 ms at 160 Hz. The OPTIONS row LOW LATENCY puts it back for a player to try; what it did in
 * a visible window on this machine is in docs/ARCHITECTURE.md.
 */
/**
 * Whether the hint can be used here at all. Not in Android's WebView -- the Android build
 * (android/): there a desynchronized canvas is never put on the screen. On the emulator the game
 * booted, ran at 52 fps and drew every frame into the canvas, and the screen stayed black; with
 * the hint off the same frame showed at once (2026-09-29). The WebView names itself with "; wv)"
 * in its user agent; Chrome for Android, which the hint was made for, does not.
 */
export function lowLatencyWorks(ua = typeof navigator !== 'undefined' && navigator ? navigator.userAgent : '') {
  return !/; wv\)/.test(String(ua || ''));
}

/**
 * The side margins a viewport wants [view units a side, whole]: as many as it is wider than
 * 16:9, rounded up so the canvas reaches both edges, and none on a 16:9 or narrower screen.
 * A phone held sideways is about 20:9 -- the Pixel 10's 2424 x 1080 wants 60 a side.
 */
export const WING_MAX = 200;     // a side [view units]: 32:9 is 240, capped where a margin is all wall
export function wingsFor(w, h) {
  if (!(w > 0 && h > 0)) return 0;
  return Math.max(0, Math.min(WING_MAX, Math.ceil(((w / h) * VH - VW) / 2 - 0.25)));
}
/** How much of the frame's edge a margin is filled from [view units]: wall at every zoom, clear of the HUD. */
export const WING_STRIP = 12;

/**
 * A PHONE'S screen is FILLED by the game, not by wall (the renderer's `cover`, main.js: when the
 * page is played by touch). The wings above were the first answer to a 20:9 screen, and on a
 * phone they were most of it: 60 units of mirrored wall a side on the Pixel 10, 105 on an iPhone
 * in Safari, beside the frame's own walls -- "the side walls are unproportionally large to the
 * main game ... most of the space should be filled by the game not by the side walls"
 * (2026-09-29). So on a phone the WORLD is drawn bigger, by f = the screen's width over the
 * frame's, so the frame's width spans the screen's and its top and bottom are cut; the HUD and
 * every menu are drawn at their own size in the middle, the whole of them on screen. Three
 * stages map the frame's backing pixels onto the wider canvas (setCover): the world's (f about
 * the middle), the screen's (f across, the height as it is: bands along the edges) and the UI's
 * (the frame as it is, in the middle). A screen wider than COVER_MAX [w/h; 2.4] is filled to
 * that shape, with the page's dark either side: past it the cut would take a quarter of the
 * shaft's height. The world's scale is then no whole number of pixels -- f is 1.2625 on the Pixel
 * 10 -- and some of its pixels are a device pixel wider than others, which at a phone's 400-plus
 * pixels to the inch nobody sees; the UI keeps whole ones.
 */
export const COVER_MAX = 2.4;

/**
 * A phone's speed streaks: half as many as the setting gives, at 60% (the renderer's `cover`).
 * The user, 2026-09-29: "make the zooming through eye candy less apparent on phones" -- and they
 * are most of the drawing at the moment a phone was slowest, a climb at full speed ("fps lag
 * especially when we jump up and the screen scrolls").
 */
export const PHONE_STREAKS = { share: 0.5, strength: 0.6 };

export function screenContext(canvas, lowLatency) {
  const ctx = canvas.getContext('2d', lowLatency ? { alpha: false, desynchronized: true } : { alpha: false });
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

export class Renderer {
  /**
   * `opts.lowLatency`: create the screen's context with the hint (see screenContext).
   * `opts.cover`: a phone's screen, filled by the game (COVER_MAX, setCover). A phone draws with
   * no back buffer at all -- no LOW LATENCY, no wings -- so nothing is copied a second time.
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    canvas.width = SW;
    canvas.height = SH;
    this.cover = !!opts.cover;
    this.stages = null;          // the three stages when the game fills a wider screen (setCover)
    this.stageM = null;          // the stage every setTransform on the screen is composed with now
    this.lowLatency = !!opts.lowLatency && lowLatencyWorks() && !this.cover;
    // The screen's own context; `ctx`, what every frame is drawn into, is it -- or, under LOW
    // LATENCY, a back buffer the frame is put on the screen from whole (backBuffer, present).
    this.screenCtx = screenContext(canvas, this.lowLatency);
    this.back = null;
    this.ctx = this.lowLatency ? this.backBuffer() : this.screenCtx;
    // Side margins [view units a side]; 0 on a 16:9 screen (wingsFor, setWings).
    this.wing = 0;
    this.edgeTint = 0;
    this.backdrop = new Backdrop();
    this.scale = 1;
    this.t = 0;
    this.scanlines = true;
    this.streaks = [];
    // Set by main.js from the persisted settings; defaults keep the renderer usable
    // standalone (the tooling constructs it without a settings object).
    this.settings = null;
    // Every afterimage silhouette atlas, up front. Building one inside a frame is a canvas
    // allocation plus a full rasterisation -- the same mistake the font made, and the
    // trail's trigger (crossing into high momentum) is exactly a moment that must not
    // hitch.
    warmGhosts();
    // The path he was drawn along, for the afterimage. One per renderer: the menu's demo
    // and the run share this renderer, and follow() starts the path again at each switch.
    this.afterimage = new Afterimage();
    warmSplat();
    warmGround();   // the start floor, the first thing every run draws
    // The death's burn: its masks, and the layer the burning tower is drawn into, made here
    // so the frame the fire takes him allocates nothing (see drawBurning). Like any fresh
    // canvas the layer would smooth what is drawn into it, at the fractional zooms.
    warmBurn();
    ({ c: this.burnLayer, g: this.burnCtx } = newCanvas(SW, SH));
    // Tagged, so the tools know it for the fall's own layer (tools/test-smooth.mjs).
    this.burnLayer.layer = 'burn';
    // The camera the frame is drawn from: game.camY, or in the fall its interpolation (see
    // cameraY). Every world-space draw below reads this, never game.camY.
    this.cam = 0;
    // Only the furniture PNGs decorart.js lists, as the backdrop does for its tiles.
    preloadDecor();
    this.fit();
    window.addEventListener('resize', () => this.fit());
  }

  /**
   * Size the canvas on screen.
   *
   * INTEGER: the largest whole multiple that fits. The only mode where a game pixel is
   * an exact square block. At 4K fullscreen that is exactly 2x edge to edge -- 3840/1920
   * and 2160/1080 -- and at 1080p exactly 1x. At 1440p it is 1x of an available 1.33x,
   * which leaves 320 px of bar down each side and 180 top and bottom. A screen smaller
   * than the store, 1600x900 or 1366x768, has no whole multiple at all: scaleFor scales
   * it down to fit, whatever the mode. (These were 4x, 3840/960, on the 960x540 store.)
   *
   * FILL: stretch to the viewport, preserving aspect. Fractional, so the pixel grid is
   * slightly uneven -- some game pixels land two screen pixels wide and their
   * neighbours three -- but there are no bars anywhere.
   *
   * AUTO (default): integer when the whole multiple is within CRISP_ENOUGH of what the
   * screen could actually give, fill when it is not. 4K and 1080p take the integer path
   * and are pixel-exact; 1440p and a 3440x1440 ultrawide take the fill path, 1600x900
   * and 1366x768 are scaled down, and all of them use the whole display. Which is the
   * right trade depends entirely on the screen, and that is precisely what a default
   * cannot know and this can measure.
   */
  fit() {
    const mode = this.settings ? this.settings.scaleMode : 'auto';
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (this.cover) this.setCover(w, h);
    else {
      const wing = wingsFor(w, h);
      if (wing !== this.wing) this.setWings(wing);
    }
    const sw = this.canvas.width;
    const s = scaleFor(w, h, mode, sw);
    this.scale = s;
    this.canvas.style.width = Math.round(sw * s) + 'px';
    this.canvas.style.height = Math.round(SH * s) + 'px';
    // Nearest-neighbour is right for integer scaling and wrong-but-preferable for a
    // fractional one; without it the browser would blur the whole image rather than
    // just making some rows a pixel taller than others.
    this.canvas.style.imageRendering = 'pixelated';
  }

  /**
   * A point on the page [CSS px: a finger's clientX and clientY] in view units -- 0 to VW across
   * the frame, below 0 and past VW in the wings. The canvas stands centred in the page
   * (index.html #wrap) at the CSS size fit() gave it, so the arithmetic needs no layout read; a
   * phone's title screen hit-tests its buttons with it (ui/touch.js).
   */
  toView(x, y) {
    const w = window.innerWidth, h = window.innerHeight;
    const cw = parseFloat(this.canvas.style.width) || w, ch = parseFloat(this.canvas.style.height) || h;
    const bx = (x - (w - cw) / 2) * (this.canvas.width / cw);
    const by = (y - (h - ch) / 2) * (this.canvas.height / ch);
    return [bx / PX - this.wing, by / PX];
  }

  applySettings(settings) {
    this.settings = settings;
    this.scanlines = settings.scanlines;
    this.setLowLatency(!!settings.lowLatency);
    this.fit();
  }

  /**
   * LOW LATENCY, at once. A canvas's context options are fixed when its context is made --
   * a second getContext hands back the first one, options ignored -- so the hint can only be
   * turned on or off with a NEW canvas: made here with the other's size, id and focus, its
   * context made with or without the hint, and put in the page where the old one stood.
   * Nothing else keeps the old one: main.js reads `renderer.ctx` and `renderer.canvas` every
   * time it draws or focuses, and every other surface the game paints is a canvas of its own.
   * The next frame draws into the new one; the frame between is the old one's last.
   */
  setLowLatency(on) {
    on = !!on && lowLatencyWorks() && !this.cover;
    if (on === this.lowLatency) return;
    const old = this.canvas;
    const doc = typeof document !== 'undefined' ? document : null;
    if (!doc || typeof doc.createElement !== 'function') return;
    const c = doc.createElement('canvas');
    c.width = old.width || SW;
    c.height = SH;
    if (old.id) c.id = old.id;
    if (old.className) c.className = old.className;
    if (old.tabIndex !== undefined) c.tabIndex = old.tabIndex;
    const hadFocus = doc.activeElement === old;
    const ctx = screenContext(c, on);
    // The frame on screen now, carried over: put in the page blank, the new canvas would show
    // black until the next frame is drawn into it -- a flash, on every turn of the option.
    try { ctx.drawImage(old, 0, 0); } catch (e) { /* nothing to carry: it is redrawn next frame */ }
    if (old.parentNode && typeof old.parentNode.replaceChild === 'function') old.parentNode.replaceChild(c, old);
    this.canvas = c;
    this.screenCtx = ctx;
    this.ctx = on ? this.backBuffer() : ctx;
    if (this.wing) this.ctx = this.backBuffer();
    this.lowLatency = on;
    this.fit();
    if (hadFocus && typeof c.focus === 'function') c.focus({ preventScroll: true });
  }

  /**
   * The canvas a frame is drawn into under LOW LATENCY, made once: the screen's size, opaque,
   * no smoothing.
   *
   * Without the hint the compositor shows only finished frames. With it, Chromium presents the
   * canvas on its own path, and a frame can reach the screen before it is finished: the title
   * screen draws the attract run, then the wash over it, then the menu, so a frame caught
   * between shows the run bright and bare -- the whole menu blinking out ("my whole menu starts
   * blinking", "it starts to stutter and flickers before returning to normal", 2026-09-28 and
   * 29). Drawn here and put on the screen in one blit (present), the screen only ever holds
   * finished frames: at worst the blit itself is caught, the top of one frame over the bottom
   * of the last. The price is that blit, a 1920 x 1080 copy a frame on the GPU.
   */
  backBuffer() {
    if (!this.back) {
      const { c, g } = newCanvas(SW, SH, { alpha: false });
      g.imageSmoothingEnabled = false;
      // Tagged, as the backdrop's fade is, so the tools know it for the frame itself and not a
      // canvas painted ahead (test-smooth's layerOf).
      c.layer = 'backBuffer';
      this.back = c;
      this.backCtx = g;
    }
    return this.backCtx;
  }

  /**
   * Put the finished frame on the screen: under LOW LATENCY, the back buffer in one blit; without
   * it, nothing -- the frame was drawn on the screen's own canvas. main.js calls it once a frame,
   * after everything is drawn.
   */
  present() {
    if (this.stages || !this.back || !(this.lowLatency || this.wing)) return;
    const s = this.screenCtx;
    s.setTransform(1, 0, 0, 1, this.wing * PX, 0);
    s.globalAlpha = 1;
    s.globalCompositeOperation = 'source-over';
    s.drawImage(this.back, 0, 0);
    if (this.wing) this.drawWings(s);
  }

  /**
   * The canvas for a phone's screen of w x h CSS px (COVER_MAX): as wide as the screen's shape,
   * to COVER_MAX, at the frame's height, and the three stages that fill it. `wing` is the UI's
   * offset in view units, as it was the wings' width: what a finger's page pixels are measured
   * from (toView). 16:9 or narrower -- a phone held upright -- is the frame as it is.
   */
  setCover(w, h) {
    const A = w > 0 && h > 0 ? Math.min(w / h, COVER_MAX) : SW / SH;
    // Even, so the UI's offset is a whole pixel; never narrower than the frame.
    const cw = Math.max(SW, 2 * Math.round((SH * A) / 2));
    if (cw === this.canvas.width && (this.stages || cw === SW)) return;
    this.canvas.width = cw;
    this.canvas.height = SH;
    // A canvas resized is a context reset: smoothing back on, which would blur every blit.
    this.screenCtx.imageSmoothingEnabled = false;
    this.ctx = this.screenCtx;
    const f = cw / SW, ox = (cw - SW) / 2;
    this.wing = ox / PX;
    this.stages = cw === SW ? null : {
      world: [f, 0, 0, f, 0, (SH / 2) * (1 - f)],
      screen: [f, 0, 0, 1, 0, 0],
      ui: [1, 0, 0, 1, ox, 0],
    };
    if (this.stages) this.installStages(this.screenCtx);
    this.stageM = this.stages ? this.stages.ui : null;
  }

  /**
   * Every setTransform on the screen composed with the stage in use (useStage): the drawing code
   * sets the frame's transforms as it always has, and the stage puts the frame where the phone's
   * screen wants it. Also on the context: its own setTransform, unstaged (`rawTransform`), and a
   * fill of the whole canvas (`fillWhole`, for canvases.js fillView: a wash over a menu covers
   * the screen, not the frame in its middle). Nothing in src/ reads a transform back.
   */
  installStages(ctx) {
    if (ctx.rawTransform) return;
    const set = Object.getPrototypeOf(ctx).setTransform;
    const R = this;
    ctx.setTransform = function (a, b, c, d, e, f) {
      const m = R.stageM;
      if (!m || arguments.length < 6) return set.apply(this, arguments);
      return set.call(this, m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d,
        m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]);
    };
    ctx.rawTransform = (a, b, c, d, e, f) => set.call(ctx, a, b, c, d, e, f);
    ctx.fillWhole = () => {
      ctx.save();
      set.call(ctx, 1, 0, 0, 1, 0, 0);
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
    };
  }

  /** The half-resolution buffer a phone's backdrop is drawn into (draw), made once: the frame's shape, opaque. */
  halfBackdrop() {
    if (!this.halfBg) {
      const { c, g } = newCanvas(SW / 2, SH / 2, { alpha: false });
      g.imageSmoothingEnabled = false;
      c.layer = 'halfBackdrop';
      this.halfBg = c;
      this.halfBgCtx = g;
    }
    return this.halfBgCtx;
  }

  /** The stage the next transforms are set in: 'world', 'screen' or 'ui' (setCover). Nothing on a desktop. */
  useStage(name) {
    if (this.stages) this.stageM = this.stages[name];
  }

  /**
   * Side margins on a screen wider than 16:9 (wingsFor). A phone held sideways is about 20:9,
   * and the game's 16:9 frame stood in the middle between two black bars ("the game doesnt
   * actually seem to go fully full screen on my google pixel 10", 2026-09-29). The frame is
   * drawn as ever, into the back buffer at 1920 x 1080 -- nothing the game draws or simulates
   * changes, and the shaft is as wide as ever -- and put in the middle of a canvas that much
   * wider (present). Here each margin is filled with the frame's own outermost WING_STRIP,
   * mirrored outward and again, so every seam joins a column to its own copy: in play that is
   * the tower's wall, going on, with whatever lies on it (the fire's glow, a flash, the pause's
   * dim); in a menu, the screen's own panel. The frame's dark edge (drawVignette) is drawn at
   * the canvas's edges instead of the frame's, or it would stripe the margins.
   */
  setWings(units) {
    this.wing = units;
    this.canvas.width = SW + 2 * units * PX;
    this.canvas.height = SH;
    // A canvas resized is a context reset: smoothing back on, which would blur every blit.
    this.screenCtx.imageSmoothingEnabled = false;
    this.ctx = this.lowLatency || units ? this.backBuffer() : this.screenCtx;
  }

  drawWings(s) {
    const F = this.wing * PX, S = WING_STRIP * PX;
    s.setTransform(1, 0, 0, 1, 0, 0);
    for (let k = 0, x = 0; x < F; k++, x += S) {
      // Left: tile k spans [F - (k+1)S, F - kS); even tiles mirrored, so the frame's first
      // column meets its own copy.
      if (k % 2 === 0) s.setTransform(-1, 0, 0, 1, F - k * S, 0);
      else s.setTransform(1, 0, 0, 1, F - (k + 1) * S, 0);
      s.drawImage(this.back, 0, 0, S, SH, 0, 0, S, SH);
      // Right: tile k spans [F + SW + kS, F + SW + (k+1)S), from the frame's last columns.
      if (k % 2 === 0) s.setTransform(-1, 0, 0, 1, F + SW + (k + 1) * S, 0);
      else s.setTransform(1, 0, 0, 1, F + SW + k * S, 0);
      s.drawImage(this.back, SW - S, 0, S, SH, 0, 0, S, SH);
    }
    if (this.edgeTint > 0) {
      s.setTransform(1, 0, 0, 1, 0, 0);
      s.globalAlpha = this.edgeTint;
      s.fillStyle = '#220008';
      s.fillRect(0, 0, 4 * PX, SH);
      s.fillRect(this.canvas.width - 4 * PX, 0, 4 * PX, SH);
      s.globalAlpha = 1;
    }
    this.edgeTint = 0;
  }

  /** World -> screen for the live zoom. The shaft always fills the screen width. */
  setWorldTransform(ctx, game) {
    // zoomView, not zoom: the logic zoom steps between whole world scales and the render
    // zoom eases to it, so the shaft opens smoothly and still lands pixel-exact. See the
    // arena update in game.js.
    const z = game.zoomView || game.zoom;
    const viewLeft = CX - (VW / z) / 2;
    // The view span stays in WORLD units -- the same span at any render resolution --
    // and PX is folded into the transform, so every world-space draw in this file is
    // untouched by the resolution change.
    const k = z * PX;
    // The camera translate is ROUNDED to a whole screen pixel.
    //
    // camY is an eased float, so camY * k lands between pixels on almost every frame.
    // Snapping a sprite's world position cannot survive that -- the snapped sprite is
    // then shifted by a fractional camera underneath it, which is why an earlier round
    // of pixel-snapping fixed nothing visible. Rounding here puts the whole world on the
    // grid at once, which is the only place it can be done once.
    //
    // -viewLeft * k needs no rounding: at every quantised zoom it is already whole
    // (960, 720, 480, 240, 0). It is rounded anyway so that a future zoom step which is
    // not cannot reintroduce this silently.
    const tx = Math.round(-viewLeft * k), ty = Math.round(SH + this.cam * k);
    if (this.stages && ctx.rawTransform) {
      // On a phone the world's stage, whichever stage is in use -- the race's ghost is drawn with
      // the HUD, in the UI's -- and its translation rounded again, to the screen's own pixels.
      const m = this.stages.world;
      ctx.rawTransform(k * m[0], 0, 0, -k * m[3], Math.round(m[0] * tx + m[4]), Math.round(m[3] * ty + m[5]));
    } else ctx.setTransform(k, 0, 0, -k, tx, ty);
    return { z, viewLeft, viewRight: viewLeft + VW / z };
  }

  viewSpan(game) {
    return { bottom: this.cam, top: this.cam + game.viewH };
  }

  /**
   * Where the camera is drawn from: the simulation's camY, and in the fall the camY
   * INTERPOLATED between its last two steps, like the Duke.
   *
   * The camera is not interpolated in play, and in the plunge that showed as judder: at a
   * 160 Hz display against the 240 Hz simulation the frames alternate one and two steps,
   * so the world moved 19 then 38 then 19 device pixels a frame at terminal velocity (zoom
   * 1; twice that at 2), every frame of the fall, against a Duke who is interpolated (a real
   * death at floor 420, every frame at 160 Hz). Interpolated, the steps are even: 28 or 29. It is eased in over FALL_CAM_BLEND from the catch, because switching it on in the
   * frame the fire takes him would move the view back by up to one step's travel at once.
   * The simulation keeps `pcamY` for it (Game.stepFalling). Play is untouched.
   */
  cameraY(game, alpha) {
    if (game.state !== 'falling' || game.pcamY === undefined) return game.camY;
    const t = (game.deathT || 0) - (1 - alpha) * STEP;
    const w = Math.max(0, Math.min(1, t / FALL_CAM_BLEND));
    return game.camY - w * (1 - alpha) * (game.camY - game.pcamY);
  }

  /**
   * How far the tower's burn is, 0..1, or -1 while he is alive: time since the fire took
   * him over BURN_T, interpolated like everything else drawn (deathT counts simulation
   * steps, so read raw it would advance one step on some frames and two on others).
   */
  burnAt(game, alpha) {
    if (game.state !== 'falling' && game.state !== 'dead') return -1;
    return Math.max(0, (game.deathT || 0) - (1 - alpha) * STEP) / BURN_T;
  }

  /**
   * Bring the burn up before anyone plays: draw something into the layer and burn it the way
   * a death does -- the char and the embers 'source-atop', the holes and a figure's columns
   * 'destination-out', at two world scales -- then draw the layer off the screen once and
   * clear it. Its backing, the masks' and the GPU's programs for those blends all exist
   * before the catch. A trace of the catch without this: the layer's first use and the burn's
   * blends were compiled in that frame, two tasks of 9-10 ms on the GPU process, and the
   * frame was 34 ms. For the load-time prepaint (prepaint.js).
   */
  warmBurnLayer() {
    const g = this.burnCtx;
    for (const k of [PX, 2 * PX]) {
      g.setTransform(k, 0, 0, -k, 0, SH);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      g.fillStyle = '#6b5a48';
      g.fillRect(0, 0, VW, FLOOR_H * 3);
      for (const h of [0.15, 0.5, 0.85]) drawBurnMasks(g, h, 0, 0, VW / 2, FLOOR_H * 3);
      drawBurnColumns(g, 0.5, 8, 16, FLOOR_H, FLOOR_H + 12, 4, 30);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    touchCanvas(this.burnLayer);
    g.clearRect(0, 0, SW, SH);
  }

  /**
   * Draw something that burns -- the ledges (`companions` false), or the companions --
   * through the burn layer.
   *
   * It is drawn as usual into the layer, which has the frame's world transform and shake;
   * burn.js lays the char, the embers and the holes over the world box [yLo, yHi]; the rows
   * that box covers are composited onto the frame. With no burn yet (h 0) that is the same
   * picture as drawing it straight onto the frame, so the catch itself shows no change. Only
   * those rows are cleared and copied: the layer is the whole screen, but a burn is a band
   * of it. A flag rather than a callback, so a frame of the burn allocates nothing.
   */
  drawBurning(ctx, game, view, h, sx, sy, yLo, yHi, companions, alpha, line) {
    const g = this.burnCtx;
    const z = view.z;
    const k = z * PX;
    // The device row of a world height, exactly as setWorldTransform plus the shake's
    // translate put it: the rounded camera, then the shake in whole view units.
    const ty = Math.round(SH + this.cam * k) + sy * PX;
    const r0 = Math.max(0, Math.floor(ty - yHi * k));
    const r1 = Math.min(SH, Math.ceil(ty - yLo * k));
    if (r1 <= r0) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, r0, SW, r1 - r0);
    this.setWorldTransform(g, game);
    g.translate(sx / z, -sy / z);
    if (companions) this.drawCompanions(g, game, alpha, game.riseY);
    else this.drawPlatforms(g, game, game.theme, line);
    drawBurnMasks(g, h, view.viewLeft - 10, yLo, view.viewRight + 10, yHi);
    // And each companion goes no later than the ledge under its feet, column by column: in
    // its own band of the noise alone, a quarter of them stood whole for 50 ms or so on a
    // ledge that had already burned away (burn.js drawBurnColumns). One frozen mid-hop has
    // no ledge under it and burns in its own pattern only.
    if (companions) {
      for (const c of game.companions.active) {
        const top = compTop(c);
        if (top < game.riseY) continue;
        const pl = game.tower.peek(Math.round(c.y / FLOOR_H));
        if (!pl || Math.abs(pl.y - c.y) > 0.5) continue;
        const hw = compArt(c.id).SPR_W / PX / 2 + 1;
        if (c.x + hw < pl.x || c.x - hw > pl.x + pl.w) continue;
        drawBurnColumns(g, h, c.x - hw, c.x + hw, c.y, top + 1, pl.x, pl.x + pl.w);
      }
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.burnLayer, 0, r0, SW, r1 - r0, 0, r0, SW, r1 - r0);
    ctx.restore();
  }

  /**
   * The line under which the tower is not drawn in the death: the fire's line less the
   * furthest anything on a ledge can reach up. Everything under it was behind the crust
   * when the fire took him -- the crust reaches the bottom of the view then, and in the
   * fall no less far (Game.crustDepth) -- so it goes without a frame showing it go; and
   * when the fall comes out of the crust's underside, that tower is not there. It burned.
   */
  fireLine(game) {
    return game.riseY - Math.max(HEAD / PX, decorReach().up) - 1;
  }

  /**
   * @param {Function} [hud]  drawn BETWEEN the world and the characters, so the HUD sits
   *   behind the companions and the Duke instead of over them. They ride high in the view
   *   and the HUD's left column runs most of its height, so one was constantly printed
   *   over the other. Passed in rather than imported because the HUD needs the save file,
   *   which the renderer has no business knowing about.
   */
  draw(game, alpha, dt, hud) {
    const ctx = this.ctx;

    // A PAUSE IS A FREEZE, AND THAT INCLUDES THE INTERPOLATION.
    //
    // game.step() returns immediately when paused, so p.x and p.px both stop -- but they
    // stop APART, because a step stores the previous position and then moves. Everything
    // below blends between them with alpha, and alpha is the live accumulator, so it goes
    // on sweeping 0..1 every frame against two positions that will never change again.
    // The player vibrates a few pixels behind the pause panel.
    //
    // Decided HERE rather than at the call site, because the renderer is the thing that
    // knows what alpha means, and a caller that forgets is a bug nobody can see in a
    // screenshot. dt goes with it, so the renderer's own clock stops and nothing in the
    // scene creeps while you are away from the keyboard.
    if (game.state === 'paused') { alpha = 1; dt = 0; }

    this.t += dt;

    const p = game.player;
    // Interpolate between the last two simulation states. At 160 Hz against a 240 Hz
    // simulation this is the difference between smooth motion and visible judder.
    const px = p.px + (p.x - p.px) * alpha;
    const py = p.py + (p.y - p.py) * alpha;
    const theme = game.theme;
    const intensity = game.intensity;
    this.cam = this.cameraY(game, alpha);
    // The tower's burn in the death (-1 while he is alive), and where it stops: see burnAt,
    // fireLine and drawBurning.
    const burn = this.burnAt(game, alpha);
    const line = burn < 0 ? -Infinity : this.fireLine(game);

    // The world's stage for everything but the HUD and the calls (a phone's; see setCover).
    this.useStage('world');
    ctx.setTransform(PX, 0, 0, PX, 0, 0);
    const zf = this.zoneFade(game, dt);
    if (this.stages) {
      // A phone draws the backdrop at HALF the frame's resolution and puts it up in one blit
      // (halfBackdrop): its tiles are painted at two backing pixels to the pixel, so at half the
      // resolution nothing is lost, and the sky and its three layers -- four screens of pixels
      // a frame, most of what a phone's GPU filled -- are a quarter of that plus the blit.
      const g = this.halfBackdrop();
      g.setTransform(PX / 2, 0, 0, PX / 2, 0, 0);
      this.backdrop.draw(g, this.cam * (game.zoomView || game.zoom), zf.index, zf.theme, zf.next, zf.blend);
      ctx.drawImage(this.halfBg, 0, 0, SW / 2, SH / 2, 0, 0, VW, VH);
    } else {
      this.backdrop.draw(ctx, this.cam * (game.zoomView || game.zoom), zf.index, zf.theme,
        zf.next, zf.blend);
    }

    const [sx, sy] = this.shakeOffset(game);
    const view = this.setWorldTransform(ctx, game);
    ctx.translate(sx / (game.zoomView || game.zoom), -sy / (game.zoomView || game.zoom));

    // The combo trail goes FIRST, behind the walls, the ledges and the Duke, so however
    // dense it gets it cannot cover him or the lit top rows a player tracks. See sparks.js.
    drawSparks(ctx, game.particles, { l: view.viewLeft, r: view.viewRight,
      b: this.cam, t: this.cam + game.viewH });
    this.drawWalls(ctx, game, view, zf);

    // The speed streaks go in HERE, in screen space: over the walls, under the ledges, the
    // HUD and the characters. Drawn last they crossed the Duke's face and the HUD's
    // numbers. Drawn over the ledges, where they were until the streaks spread across the
    // whole width again, every line cut a notch through the lit top rows a player tracks,
    // and a line bright enough to stand off the backdrop was brighter than the lit row
    // itself in the dim-ledged zones (luma 100 in FOREST and SWAMP). Behind the ledges no
    // line can cross one, however bright it has to be.
    ctx.setTransform(PX, 0, 0, PX, sx * PX, sy * PX);
    this.drawSpeedStreaks(ctx, intensity, dt, theme, game.nextTheme, game.zoom,
      burn < 0 ? intensity : (game.fallPace || 0));
    this.setWorldTransform(ctx, game);
    ctx.translate(sx / (game.zoomView || game.zoom), -sy / (game.zoomView || game.zoom));

    // In the death the ledges burn away over BURN_T and are then gone, and those under the
    // fire's line are not drawn at all (burn.js says why).
    if (burn < 0) this.drawPlatforms(ctx, game, theme);
    else if (burn < 1) {
      const r = decorReach();
      this.drawBurning(ctx, game, view, burn, sx, sy,
        Math.max(this.cam - 10, line - Math.max((CELL_H - HEAD) / PX + 2, r.down) - 1),
        this.cam + game.viewH + 10, false, alpha, line);
    }
    this.drawRisingFloor(ctx, game, view, theme);
    this.drawPit(ctx, game, view, alpha);

    // The HUD goes in HERE, under the characters. Everything above this line is scenery.
    if (hud) {
      this.useStage('ui');
      ctx.setTransform(PX, 0, 0, PX, sx * PX, sy * PX);
      hud();
      this.useStage('world');
      this.setWorldTransform(ctx, game);
      ctx.translate(sx / (game.zoomView || game.zoom), -sy / (game.zoomView || game.zoom));
    }

    // The companions burn with the ledges they stand on, in the same pattern and time.
    if (burn < 0) this.drawCompanions(ctx, game, alpha);
    else if (burn < 1 && game.companions && game.companions.active.length) {
      let lo = Infinity, hi = -Infinity;
      for (const c of game.companions.active) {
        if (c.y < lo) lo = c.y;
        const top = compTop(c);
        if (top > hi) hi = top;
      }
      this.drawBurning(ctx, game, view, burn, sx, sy, Math.max(this.cam - 10, lo - 12),
        Math.min(this.cam + game.viewH + 10, hi + 4), true, alpha, line);
    }
    this.drawPlayer(ctx, game, px, py);
    game.particles.draw(ctx, { l: view.viewLeft, r: view.viewRight,
      b: this.cam, t: this.cam + game.viewH });

    // Back to screen space for anything that must not scale with the zoom. PX belongs
    // here too, and the shake offset with it -- this one carries arguments, so a search
    // for the plain identity transform walks straight past it, and everything below
    // drew at half size in the top-left quarter of the screen.
    // On a phone (setCover) each in its stage: the calls stand on the screen's bottom edge and the
    // badge beside the HUD's callout, at the UI's size; a floater rides the world; the danger
    // band runs along the bottom of what is on screen.
    this.useStage('ui');
    ctx.setTransform(PX, 0, 0, PX, sx * PX, sy * PX);
    this.drawCompanionCalls(ctx, game);
    this.useStage('world');
    ctx.setTransform(PX, 0, 0, PX, sx * PX, sy * PX);
    this.drawFloaters(ctx, game);
    this.useStage('screen');
    ctx.setTransform(PX, 0, 0, PX, sx * PX, sy * PX);
    this.drawDangerBand(ctx, game);
    // The prestige badge beside a callout from the second lap on: the one piece of the
    // callout drawn out here rather than in the HUD, after the Duke, the companions, their
    // calls and the floaters, so none of them can cover it (callouts.js drawCalloutBadge).
    this.useStage('ui');
    ctx.setTransform(PX, 0, 0, PX, sx * PX, sy * PX);
    drawCalloutBadge(ctx, game);

    // The whole screen's: the fall's dark, the vignette, the flash, the scanlines.
    this.useStage('screen');
    ctx.setTransform(PX, 0, 0, PX, 0, 0);
    if (game.state === 'falling') this.drawFallOverlay(ctx, game);
    this.drawVignette(ctx, game);
    // Never on the attract demo: see zoneFade.
    if (game.flash > 0 && !game.demo) {
      // Capped well below full white. At 0.85 the theme-change flash blanks the screen
      // for a third of a second, which on a bright 4K panel is genuinely unpleasant.
      ctx.globalAlpha = Math.min(0.5, game.flash * 0.5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, VW, VH);
      ctx.globalAlpha = 1;
    }
    if (this.scanlines) this.drawScanlines(ctx);
    // What main.js draws next is the UI: the menus, the boards, the pause.
    this.useStage('ui');
    ctx.setTransform(PX, 0, 0, PX, 0, 0);
  }

  /**
   * The zone change as the backdrop and the walls show it: { theme, index, next, blend }.
   *
   * In play it is the game's own: the next zone fades in over the last twelve floors
   * (Game.themeBlend) and the switch completes under the arrival flash, with the zone's
   * title lettered over it. The attract demo behind the title screen draws no HUD, so it
   * had no title, and at its pace (a zone every ten seconds or so, ten floors or more a
   * landing) the blend did not fade: it jumped to about 0.6 of the next zone half a second
   * before the arrival, and then the whole screen flashed white under the menu -- "my whole
   * menu starts blinking" (2026-09-28). Measured headless, drawn as main.js draws the menu:
   * whole-frame luma +20 to +24 in one frame at every arrival, 28 of them in five minutes.
   *
   * So the demo gets neither. Its zone holds until the arrival and then dissolves into the
   * next over DEMO_DISSOLVE, eased; and its flash and shake are not drawn (draw()). A new
   * run -- the demo starting over -- starts on its own zone with nothing to dissolve.
   */
  zoneFade(game, dt) {
    if (!game.demo) {
      return { theme: game.theme, index: game.themeIndex, next: game.nextTheme, blend: game.themeBlend || 0 };
    }
    const f = this.demoFade;
    if (!f || f.run !== game.run) {
      this.demoFade = { run: game.run, shown: game.themeIndex, to: game.themeIndex, b: 0 };
    } else if (f.shown !== game.themeIndex) {
      // A second arrival inside a dissolve (the ascended demo crosses a hundred-floor band in
      // 1.4 s): the one under way lands on its own zone and the next starts from there -- only
      // two zones can be blended, and swapping the one coming in mid-way was a jump of both.
      if (f.to !== game.themeIndex) {
        if (f.b > 0 && f.to !== f.shown) f.shown = f.to;
        f.to = game.themeIndex;
        f.b = 0;
        if (f.shown === game.themeIndex) return { theme: game.theme, index: game.themeIndex, next: game.nextTheme, blend: 0 };
      }
      f.b += dt / DEMO_DISSOLVE;
      if (f.b < 1) {
        const e = f.b * f.b * (3 - 2 * f.b);
        return { theme: THEMES[f.shown], index: f.shown, next: game.theme, blend: e };
      }
      f.shown = game.themeIndex;
      f.b = 0;
    }
    return { theme: game.theme, index: game.themeIndex, next: game.nextTheme, blend: 0 };
  }

  /**
   * The screen shake as drawn, [x, y] in whole view units: none with the setting off, and
   * none on the attract demo -- its shakes are its zone arrivals and its death, and a jolt of
   * the whole background under a still menu reads as the menu glitching. The tools that line
   * one frame up with the next (test-fallclear) ask this, not game.shakeX, so they agree.
   */
  shakeOffset(game) {
    const on = (!this.settings || this.settings.shake) && !game.demo;
    return on ? [Math.round(game.shakeX), Math.round(game.shakeY)] : [0, 0];
  }

  /** @param zf  the zone change as it is shown (zoneFade) */
  drawWalls(ctx, game, view, zf) {
    const theme = zf.theme;
    const { bottom, top } = this.viewSpan(game);
    // The EASED half-width, not the stepped one. See the arena update in game.js: the
    // walls snapping outward inside a view that is still gliding is what made the zoom
    // out read as a jolt even after the zoom itself was smooth.
    const half = game.arenaHalfView || game.arenaHalf;
    const lo = CX - half;
    const hi = CX + half;
    // Each zone's own drawn wall, at one art pixel per backing pixel at zoom 1 (walls.js).
    // These were flat columns of the ledge colour with courses and an edge line stroked in
    // world units, four times chunkier than every drawn thing beside them.
    drawShaftWalls(ctx, game, view, theme, bottom, top, lo, hi, zf.next, zf.blend);

    const f0 = Math.max(0, Math.floor(bottom / FLOOR_H));
    const f1 = Math.ceil(top / FLOOR_H);
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = theme.accent;
    for (let n = f0; n <= f1; n++) {
      if (n % 10) continue;
      const y = n * FLOOR_H;
      ctx.fillRect(lo - 6, y, 4, 1);
      ctx.fillRect(hi + 2, y, 4, 1);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Ledges, laid out from drawn tiles: a left cap, as many tiles as the width needs, and
   * a right cap.
   *
   * WHAT THIS REPLACED. A platform used to be built here out of six bands -- a shadow, a
   * hard outline, a shadowed underside, a material painter striping brick or crystal into
   * the middle, a one-pixel trim and a lit lip -- with a cap function stippling studs
   * along the top and four colours per zone doing the rest. Thirteen materials, nine
   * caps, and a zone was a choice of one of each. It was the right answer for as long as
   * the only platform art in the project was art the renderer could compute.
   *
   * The art is drawn now, so the renderer's job is to put it on the screen unaltered.
   * One art pixel is one screen pixel; nothing is stretched, and the only arithmetic left
   * is how many whole tiles fit and how much of one is left over.
   */
  drawPlatforms(ctx, game, theme, below = -Infinity) {
    const { bottom, top } = this.viewSpan(game);
    const f0 = Math.max(0, Math.floor(bottom / FLOOR_H) - 1);
    const f1 = Math.ceil(top / FLOOR_H) + 1;
    const art = platArt(theme.name);
    const shadow = ledgeShadow(theme.name);
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 4);

    // Art pixels, in world units. The whole layout is done in art pixels and converted
    // once, because mixing the two is how a platform ends up four times too tall.
    const u = 1 / PX;
    const capW = CAP_W * u, tileW = TILE_W * u;
    const cellH = CELL_H * u, headH = HEAD * u;

    for (let n = f0; n <= f1; n++) {
      const pl = game.tower.peek(n);
      if (!pl || pl.y < below) continue;
      const y = pl.y;
      // Floor 0 is the ground, drawn whole by ground.js. It was this ledge tile stretched over a
      // flat world-unit slab of platEdge, which buried any decor under it; it now has none.
      if (pl.kind === 'ground') { drawGround(ctx, pl, bottom, game.arenaHalfView || game.arenaHalf); continue; }

      // The checkpoint pulse, and ONLY the checkpoint pulse. Every ledge in the six upper
      // zones used to get a translucent rectangle of the zone's accent round its body too
      // (platstyles' `glow`), made for the procedural slabs, where it lit a rectangle that
      // WAS the platform. Round drawn art it is a box that matches nothing, and in NEBULA,
      // whose accent is magenta, it read as a magenta outline round every ledge.
      if (pl.kind === 'checkpoint') {
        ctx.globalAlpha = 0.25 + pulse * 0.35;
        ctx.fillStyle = theme.accent;
        ctx.fillRect(pl.x - 3, y - PLAT_THICK - 3, pl.w + 6, PLAT_THICK + 6);
        ctx.globalAlpha = 1;
      }

      ctx.save();
      ctx.scale(1, -1);
      // In this flipped space the image's own downward y runs with the screen, so the
      // destination top is the NEGATED world height of the cell's top row.
      const dy = -(y + headH);
      const capFit = Math.min(capW, pl.w / 2);
      const midX = pl.x + capFit;
      const midW = pl.w - capFit * 2;
      // The ledge is laid out by `lay` and drawn twice with it: first its shadow (the
      // wall under what the tile draws, see LEDGE_SHADOW), then the art -- the same cuts
      // from pieces of the same widths, so the two cannot disagree. `h` is the source
      // pieces' height in art px, `dh` in world units.
      const lay = (set, h, dh) => {
        const put = (img, sx, sw, dx, dw) => {
          if (sw <= 0 || dw <= 0) return;
          ctx.drawImage(img, sx, 0, sw, h, dx, dy, dw, dh);
        };

        // Caps first, so a ledge narrower than two caps still reads as having two ends.
        put(set.left, 0, Math.round(capFit * PX), pl.x, capFit);
        put(set.right, CAP_W - Math.round(capFit * PX), Math.round(capFit * PX),
          pl.x + pl.w - capFit, capFit);

        // Then whole tiles across the middle, and a part tile for the remainder. The part
        // is cut from the LEFT of the tile, so the seam it makes is against the right cap
        // rather than in the middle of the run.
        let x = 0;
        while (x < midW) {
          const w = Math.min(tileW, midW - x);
          put(set.tile, 0, Math.round(w * PX), midX + x, w);
          x += tileW;
        }
      };
      if (shadow) lay(shadow, CELL_H + LEDGE_SHADOW_H, (CELL_H + LEDGE_SHADOW_H) * u);
      lay(art, CELL_H, cellH);
      ctx.restore();

      // Furniture on top, seeded from the floor number so it never flickers. One sprite
      // per element, on the art grid; which ledges carry any, and what, is decor.js's.
      drawDecor(ctx, pl, game.themeIndex, theme, this.t);

      if (pl.kind === 'checkpoint') {
        // On the trim row rather than the lip: a checkpoint has to read at a glance and
        // the accent needs a dark row under it, not the brightest one on the ledge.
        ctx.fillStyle = theme.accent;
        for (let x2 = pl.x + 2; x2 < pl.x + pl.w - 2; x2 += 8) ctx.fillRect(x2, y - 3, 4, 1);
      }
    }
  }

  drawRisingFloor(ctx, game, view, theme) {
    // Its art is built a piece a frame while he is still on the ground floor (the rise
    // arms at floor 1), so the floor's first appearance does not pay for it.
    if (!game.riseActive) { warmRise(); return; }
    const { bottom } = this.viewSpan(game);
    const y = game.riseY;
    // Fade out over the last 40 px rather than switching off at a threshold. A binary
    // cull here is what made the whole band pop in and out: the camera crosses this
    // line several times a second on ordinary jumps, so the zone was appearing and
    // vanishing between frames with nothing gradual about it.
    const cullFade = Math.max(0, Math.min(1, (y - (bottom - 40)) / 40));
    if (cullFade <= 0) return;
    // The fire and the crust are drawn by risefloor.js at the art's own scale; it used to
    // be a 4-unit red checker over a flat maroon box 80 units deep, a loading bar that
    // ended with the tower showing under it. While he is alive it reaches the bottom of
    // the view. Once it has him it ends RISE_DEPTH of the view down, because the death
    // falls through it -- and on the scoreboard, a thousand units under a line far above
    // the view, reaching the bottom would fill the screen with it. Never shorter than it was
    // as it took him (Game.crustDepth): caught higher up the screen than RISE_DEPTH of the
    // view, its end would come up from under the screen in that frame and uncover the shaft.
    // Its crest still beats at THREAT_HZ, with the danger band and the CLIMB! warning.
    const alive = game.state === 'playing' || game.state === 'paused';
    drawRise(ctx, {
      y, left: view.viewLeft, right: view.viewRight, bottom,
      depth: Math.max(RISE_DEPTH * game.viewH, alive ? y - bottom + 8 : (game.crustDepth || 0)),
      t: this.t, alpha: ctx.globalAlpha * cullFade,
      pulse: 0.5 + 0.5 * Math.sin(this.t * THREAT_HZ),
    });
  }

  frameFor(p, game) {
    if (game && dying(game)) {
      if (!game.impacted) return FALL_POSE;
      return game.splat ? 'splat' : 'dazed';
    }
    // A fast jump gets its own pose, so speed reads off the character and not just
    // off how far the jump carries.
    const fast = p.momentum > 0.6;
    if (!p.grounded) {
      if (p.spinT > 0) return 'tuck';
      if (p.vy > 30) return fast ? 'jumpFast' : 'jump';
      return fast ? 'fallFast' : 'fall';
    }
    // Just touched down hard: absorb it. `land` has existed since the first sprite sheet
    // and was never once selected.
    // A TIMER, not the squash value. Squash used to be re-assigned every frame the
    // player was grounded, so testing it meant the landing pose never ended.
    if (p.landT > 0) return 'land';
    if (Math.abs(p.vx) > 12) return RUN_CYCLE[Math.floor(p.animT * 9) % RUN_CYCLE.length];
    // Slow on purpose. At 1.5 changes a second an idle reads as a flicker; a man
    // standing still shifts his weight about once a second, not twice.
    return IDLE_CYCLE[Math.floor(this.t * 0.9) % IDLE_CYCLE.length];
  }

  drawPlayer(ctx, game, px, py) {
    const p = game.player;
    const theme = game.theme;
    const frame = this.frameFor(p, game);

    const dead = dying(game);

    if (dead) {
      // No afterimage in the death, and none carried over from it into the next run.
      this.afterimage.reset();
      // A splattered man is not drawn here at all. drawSplatter takes him apart and
      // scatters the pieces, and it runs earlier, with the pit -- blitting the intact
      // body afterwards is what used to paint him whole on top of his own remains.
      if (game.impacted && game.splat) return;
      // Tumbling in 90-degree steps: lossless for pixel art, and at this speed it
      // reads as helpless rather than as a rigid rotation.
      const spin = game.impacted ? 0 : Math.floor(game.tumble);
      ctx.save();
      ctx.scale(1, -1);
      drawSprite(ctx, frame, snap(px), snap(-py), p.facing < 0, spin, 0);
      ctx.restore();
      if (game.impacted && !game.splat) this.drawDazeStars(ctx, px, py);
      return;
    }

    // The speed trail: flat silhouettes of him on the path he just took, behind the sprite.
    //
    // Three trails came before this one. The first redrew the whole CHARACTER four world
    // units apart along x only: a row of little reflections, shoulder to shoulder on a
    // launch because most of his speed is vertical. The second was four flat silhouettes of
    // his CURRENT frame on a straight line back along -v, 9 ms a copy clamped at 7 units:
    // on a launch they hung 28 units under his boots, anchored on the cell's bottom rather
    // than his boots, in none of his squash or spin -- "trailing way behind him when it
    // should be on top of him". The third was a halo round his outline, placed by the
    // sprite's own code: on him, but not the look, and in the roll it broke -- the tuck
    // turned about its cell's centre, so the ball of him hopped 17.5 units every quarter
    // turn, and a halo drawn only where he is jumped with it and left nothing behind. The
    // tuck turns about the ball now (SPIN_PIVOT in sprites.js), so he rolls in place and
    // the copies from before a turn lie on him instead of a ball's width beside him.
    //
    // This is the second one's look, placed from afterimage.js's record of where he was
    // actually drawn and how: each copy in its own pose, facing, squash and quarter turn,
    // through the sprite's own placement (drawGhost), and never more than GHOST_GAP of path
    // a copy behind him, so the chain stays on him. See afterimage.js.
    const trails = !this.settings || this.settings.trails;
    // His clock (JUMP SPEED, Player.step): the tuck turns as many quarters through an arc at
    // every speed, and the afterimage keeps his time -- its copies GHOST_DT of HIS time apart,
    // its speeds in his units -- so the trail lies along the path as it does at 1. On the
    // world's clock it spread the copies by the speed and its teleport test (his speed times
    // the frame's time) came within 15% of calling every frame at 1.3 a jump.
    const rate = p.rate || 1;
    const spin = p.spinT > 0 ? Math.floor(this.t * 14 * rate) : 0;
    const ai = this.afterimage;
    if (!trails) ai.reset();
    else {
      ai.follow(game);
      // Recorded every frame, whether the trail shows or not, so it has a path to lie on
      // the moment it fades in.
      ai.record(this.t * rate, px, py, Math.hypot(p.vx, p.vy), frame, p.facing < 0, spin, p.squash);
      if (p.momentum > GHOST_MOMENTUM_FROM && ai.place() > 0) {
        // Nothing about it switches: an older one went from two copies to four at momentum
        // 0.8 and from nothing to full strength at 0.45, so it appeared and thickened in
        // visible steps. How fast he moves along his path and how hot he is only scale the
        // alpha.
        const fade = Math.min(1, (ai.speed - GHOST_FROM) / (GHOST_FULL - GHOST_FROM))
          * Math.min(1, (p.momentum - GHOST_MOMENTUM_FROM) / (GHOST_MOMENTUM_FULL - GHOST_MOMENTUM_FROM));
        if (fade > 0) {
          const light = ghostTone(theme);
          ctx.save();
          ctx.scale(1, -1);
          // Farthest copy first, so the nearest is drawn over it.
          for (let i = ai.count - 1; i >= 0; i--) {
            ctx.globalAlpha = GHOST_ALPHA[i] * fade;
            // Snapped like the sprite, so every copy is on his art-pixel grid.
            drawGhost(ctx, ai.cframe[i], snap(ai.cx[i]), snap(-ai.cy[i]), ai.cflip[i] === 1,
              ai.cspin[i], ai.csq[i], light);
          }
          ctx.restore();
          ctx.globalAlpha = 1;
        }
      }
    }

    ctx.save();
    ctx.scale(1, -1);
    drawSprite(ctx, frame, snap(px), snap(-py), p.facing < 0, spin, p.squash);
    ctx.restore();

    const under = game.tower.peek(p.floor);
    if (under && !p.grounded && py > under.y && py - under.y < 90) {
      const k = 1 - (py - under.y) / 90;
      ctx.globalAlpha = 0.28 * k;
      ctx.fillStyle = '#000000';
      // Width off the BODY, height and position in art pixels. It used to round to
      // whole world units while the sprite above it snapped to 1/PX, so the shadow
      // stair-stepped along underneath a smoothly moving character.
      const w = (0.2 + 0.26 * k) * BODY_W;
      ctx.fillRect(snap(px - w / 2), under.y, w, 2 / PX);
      ctx.globalAlpha = 1;
    }

    // The crown's stones catch the light one at a time. Drawn here rather than baked,
    // because a baked glint sits in the same place forever -- see CROWN_GEMS.
    //
    // Sized in ART PIXELS, not world units.
    //
    // This used to be fillRect(gx, gy, 1, 1) plus four neighbours at +/-1 -- a three
    // WORLD unit cross. At PX=2 on a 24-unit-wide character that was a small sparkle.
    // At PX=4 on a 14-unit-wide one it is a twelve-screen-pixel white block covering
    // his whole face, which is exactly what it drew. One art pixel is BODY_W / SPR_W
    // world units, which is 1/PX, and that is the unit a glint on a crown stone wants.
    if (!dead && !spin) {
      // THIS POSE'S crown, not idle0's. It was measured once off the standing frame and
      // used for all nineteen, which is why the glint was reported floating off his head:
      // running he is pitched forward, landing he is crouched, and the one pose the
      // measurement described is the one you spend the least time in.
      const front = FRONT_FRAMES.has(frame);
      const crown = CROWN_GEMS[frame] || CROWN_GEMS.idle0;
      const k = this.t * 2.2;
      const gem = crown.cols[Math.floor(k) % crown.cols.length];
      const u = BODY_W / SPR_W;          // one art pixel, in world units
      let ox = (gem + 0.5 - SPR_W / 2) * u;
      if (!front && p.facing < 0) ox = -ox;
      // From the CELL's bottom edge, which is FOOT_DROP below his feet -- the sprite is
      // lowered by that much so it stands on its boots and not on its shield's point.
      //
      // BELOW, and world y points up, so it is a subtraction. It was an addition, which
      // put the glint twice the drop ABOVE the stone it was aimed at: two art pixels over
      // the crown in every pose with a quarter-unit drop, and nobody could see it. Once
      // the idles were anchored on their boots, with drops of half and three quarters of
      // a unit, it was four and six pixels up -- off the crown and into the air above it.
      const cellBottom = py - (FOOT_DROP[frame] || 0);
      // Snapped to the ART grid rather than the world grid, so it sits on a pixel of
      // the crown instead of between four of them.
      const gx = Math.round((px + ox) / u) * u;
      const gy = Math.round((cellBottom + BODY_H - (crown.row + 0.5) * u) / u) * u;
      // Sharp in, slow out, so it reads as a catch of light rather than a blinking dot.
      const a = Math.pow(1 - (k % 1), 2);
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = a;
      ctx.fillRect(gx, gy, u, u);
      ctx.globalAlpha = a * 0.55;
      ctx.fillRect(gx - u, gy, u, u);
      ctx.fillRect(gx + u, gy, u, u);
      ctx.fillRect(gx, gy - u, u, u);
      ctx.fillRect(gx, gy + u, u, u);
      ctx.globalAlpha = 1;
    }

    // No marker above his head.
    //
    // There used to be a pulsing underline floating over his crown whenever air jumps
    // were armed. It read as a bar stuck to the character rather than as a readout, and
    // the HUD already prints AIR JUMP READY in words -- two signals for one fact, and
    // the worse of them was the one welded to the sprite.
  }

  /**
   * Stars orbiting a concussed head. Drawn as five-pixel crosses on an ellipse, so the
   * ring reads as going round the head rather than sitting flat behind it.
   */
  drawDazeStars(ctx, px, py) {
    // Sized and placed in ART pixels. A star drawn 5 world units across is twenty screen
    // pixels at PX=4 -- bigger than his head.
    const u = 1 / PX;
    const cx = snap(px);
    const cy = snap(py + BODY_H * 0.55);   // over a man lying down, not over a standing cap
    for (let i = 0; i < 6; i++) {
      const a = this.t * 3.2 + (i / 6) * Math.PI * 2;
      const x = snap(cx + Math.cos(a) * (BODY_W * 0.42));
      // `6.5 * u * PX * 0.35` was here, and `u * PX` is identically 1 -- a half-applied
      // art-pixel conversion that cancelled itself out and left a 10:1 ellipse, which is
      // a bar across his chest rather than a ring round his head. Both radii come off
      // the body box now, so the proportion is stated rather than arrived at.
      const y = snap(cy + Math.sin(a) * BODY_H * 0.16);
      // Stars on the far side of the orbit are dimmed, which sells the rotation.
      const front = Math.sin(a) > 0;
      ctx.globalAlpha = front ? 1 : 0.45;
      ctx.fillStyle = i % 2 ? '#ffe23d' : '#ffffff';
      ctx.fillRect(x - 2 * u, y, 5 * u, u);
      ctx.fillRect(x, y - 2 * u, u, 5 * u);
      ctx.fillRect(x - u, y - u, 3 * u, 3 * u);
      ctx.fillStyle = '#fff8c0';
      ctx.fillRect(x, y, u, u);
    }
    ctx.globalAlpha = 1;
  }

  /** The bottom of the shaft, and the dark closing in on the way down. */
  /**
   * The bottom of the shaft: a GROUND PLANE, not a line.
   *
   * It used to be one lit pixel over a flat band, and against these sprites that reads
   * wrong however precisely the body is anchored to it. The art is an illustration with
   * depth in it -- he lies at an angle, his shield is nearer the viewer than his boots,
   * the drawing has a floor of its own implied in it -- and a one-pixel horizontal rule
   * is a WALL EDGE seen straight on. The eye reconciles the two by deciding the figure is
   * hovering, which is exactly what was reported after the anchor itself was correct.
   *
   * So the top of it is a surface: a lit leading edge, then a few bands stepping darker
   * as it recedes, then the dark. Plus a contact shadow under whatever is lying on it,
   * which is the single thing that says "resting on" rather than "in front of".
   */
  drawPit(ctx, game, view, alpha = 1) {
    if (!dying(game)) return;
    const y = game.pitY;
    const l = view.viewLeft;
    const r = view.viewRight;
    const w = r - l;

    // BELOW the contact line is the front FACE of the floor -- a lit lip and then the
    // dark. Above it is the floor's SURFACE, receding away from you.
    ctx.fillStyle = '#080310';
    ctx.fillRect(l, y - 200, w, 200);
    ctx.fillStyle = '#3a2f4c';
    ctx.fillRect(l, y - 2, w, 2);

    // THE SURFACE GOES UP THE SCREEN, which is the whole correction. A floor tilting away
    // from the viewer occupies the rows ABOVE where it meets your feet, getting darker
    // with distance until it reaches the wall. Drawn downward, as it was, those bands are
    // the front of a step and the character is standing on the nose of it -- which is why
    // the anchor could be exactly right and he would still look like he was hovering.
    const SURFACE = [
      [3, '#463a5c'],     // nearest, catching the most light
      [4, '#3d3251'],
      [5, '#342a46'],
      [6, '#2c233b'],
      [8, '#241c31'],
    ];
    let base = y;
    for (const [h, col] of SURFACE) {
      ctx.fillStyle = col;
      ctx.fillRect(l, base, w, h);
      base += h;
    }

    // An intact body casts one shadow; a splattered one casts one per piece, in drawSplatter.
    if (game.impacted && !game.splat) this.drawContactShadow(ctx, game, y);
    if (game.impacted && game.splat) this.drawSplatter(ctx, game, y, alpha);
  }

  /**
   * The dark under a body lying on the floor.
   *
   * A soft stack of widening rows rather than a hard ellipse: at this scale a crisp edge
   * reads as a second object, and what is wanted is the absence of light.
   */
  drawContactShadow(ctx, game, y) {
    const p = game.player;
    const cx = p.x;
    // An intact body only: one lump. A splat's pieces each cast their own, in drawSplatter,
    // because a shadow the width of the whole scatter sat under the impact point long
    // after every piece had flown off it.
    const halfW = BODY_W * 0.52;
    // Cast ONTO the surface, so it lies in the rows above the contact line -- the same
    // rows the floor itself occupies. Widest where the body touches, narrowing as it
    // recedes, and fading out rather than ending.
    ctx.fillStyle = '#05020b';
    const rows = 7;
    for (let i = 0; i < rows; i++) {
      const t = i / (rows - 1);
      const hw = halfW * (1 - t * 0.5);
      ctx.globalAlpha = 0.55 * (1 - t) * (1 - t);
      ctx.fillRect(Math.round(cx - hw), y + i, Math.round(hw * 2), 1);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * What is left of him past floor 200.
   *
   * The drawing shows him flattened but intact, and "flattened but intact" is not what
   * falling two hundred floors does. The pieces are thrown here instead of drawn: the
   * blood (see bloodStains), then chunks of his own colours scattered round the impact,
   * then the drawn pieces themselves, each with its own contact shadow, wherever the
   * simulation has them.
   *
   * DETERMINISTIC, seeded off the run. A random scatter re-rolled every frame shimmers,
   * and this sits on screen for seconds while the score comes up.
   */
  drawSplatter(ctx, game, y, alpha = 1) {
    const cx = snap(game.player.x);
    const u = 1 / PX;
    const sev = game.severity || 0;

    // One deterministic stream for the dust. The PIECES are simulated in the game (see
    // Game.stepGibs) so they carry their own positions; this only has to draw them.
    let seed = ((game.seed | 0) ^ 0x9e3779b9) >>> 0;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    // The blood, one colour at a time: every stain's dark layer, then every mid, then
    // every lit one, so the wet highlights sit on top and fillStyle changes four times a
    // frame rather than once per row of every stain.
    const stains = bloodStains(game);
    for (const tone of BLOOD_TONES) {
      ctx.fillStyle = tone;
      for (const s of stains) if (s.c === tone) ctx.fillRect(s.x, s.y, s.w, s.h);
    }

    // Chunks: armour and cloth in his own colours, settling around the mess. More of them
    // the further he fell. Coloured by ROLE (SPLAT_INKS), never by palette letter.
    const chunks = Math.round(18 + 24 * sev);
    for (let i = 0; i < chunks; i++) {
      const side = i % 2 ? 1 : -1;
      const spread = 0.15 + rnd() * (0.8 + 0.5 * sev);
      const bx = snap(cx + side * BODY_W * spread);
      const by = snap(y + rnd() * u * 6);
      const w = Math.max(u, Math.round(2 + rnd() * 3) * u);
      const h = Math.max(u, Math.round(1 + rnd() * 2) * u);
      ctx.fillStyle = SPLAT_INKS[(i * 7 + (seed & 3)) % SPLAT_INKS.length];
      ctx.fillRect(bx, by, w, h);
    }

    // Then the pieces, wherever the simulation put them -- interpolated like everything
    // else that moves, so a piece in flight does not judder at a display rate that is not
    // the simulation's. At rest the two endpoints are equal and alpha does nothing.
    if (!game.gibs || !game.gibs.length) return;
    const boxes = game.gibs.map((g) => pieceBox(g.w, g.h,
      g.px + (g.x - g.px) * alpha, g.py + (g.y - g.py) * alpha,
      g.prot + (g.rot - g.prot) * alpha));

    // A contact shadow under each piece, darkening as it comes down onto the floor: the
    // one cue that says a piece is resting on the surface rather than in front of it.
    ctx.fillStyle = '#05020b';
    boxes.forEach((b) => {
      const k = 1 - (b.bottom - y) / 14;
      if (k <= 0) return;
      for (let i = 0; i < 4; i++) {
        const t = i / 3;
        const hw = (b.W / 2) * (0.95 - t * 0.35);
        ctx.globalAlpha = 0.5 * k * (1 - t) * (1 - t);
        ctx.fillRect(snap(b.left + b.W / 2 - hw), y + i * 2 * u, snap(hw * 2), 2 * u);
      }
    });
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.scale(1, -1);
    game.gibs.forEach((g, n) => {
      const bit = SPLAT_BITS[g.i];
      if (!bit) return;
      const b = boxes[n];
      // Quarter turns only. A limb at an arbitrary angle is a resampled limb, and the
      // whole character is drawn on the pixel grid.
      ctx.save();
      ctx.translate(b.left + b.W / 2, -(b.bottom + b.H / 2));
      if (b.q) ctx.rotate((b.q * Math.PI) / 2);
      if (g.flip) ctx.scale(-1, 1);
      ctx.drawImage(bitCanvas(bit), 0, 0, bit.sw, bit.sh, -g.w / 2, -g.h / 2, g.w, g.h);
      ctx.restore();
    });
    ctx.restore();
  }



  /**
   * Which pose a companion is in, from its own state.
   *
   * They had exactly ONE drawing each before this -- the same standing figure whether
   * waiting, sprinting, airborne or falling to their death -- so the only thing that
   * ever moved was the halo.
   */
  companionPose(c) {
    if (c.state === 'slipping') return c.spin > 0.4 ? 'tumble' : 'slip';
    if (c.state === 'waiting') return Math.floor(this.t * 0.8) % 2 ? 'idle1' : 'idle0';
    // Off their own arc: c.vy is the ARC's vertical velocity and nothing else, so it
    // turns from rising to falling at the apex you can see. Under the rail it included
    // the rail's own climb, and 9% of frames showed `jump` on the way down or `fall` on
    // the way up. The switch is at zero, not at +30 like the Duke's: their arcs are
    // short and snappy, and a 30 unit dead band was a visible share of every one.
    if (c.airborne) return c.vy > 0 ? 'jump' : 'fall';
    if (c.landT > 0) return 'land';
    // Walking along a platform: the run cycle, one frame per runStride walked, so the
    // feet keep pace with the ground at any speed. Unreachable for as long as they only
    // ever hopped.
    if (Math.abs(c.walkV) > 12) {
      return COMP_RUN[Math.floor(c.stride / COMP_TUNE.runStride) % COMP_RUN.length];
    }
    return Math.floor(this.t * 0.8) % 2 ? 'idle1' : 'idle0';
  }

  /**
   * The companions. Drawn behind the player so they never obscure the thing you are
   * actually controlling.
   */
  drawCompanions(ctx, game, alpha = 1, below = -Infinity) {
    if (!game.companions) return;
    for (const c of game.companions.active) {
      // In the death, one the fire's crust covers is not drawn: it burned with the tower.
      if (compTop(c) < below) continue;
      const pose = this.companionPose(c);
      // Interpolated between the last two simulation steps, and snapped to the backing
      // pixel, exactly as the Duke is. Drawn at the latest step and rounded to whole world
      // units, they moved in 4 ms jerks of four screen pixels against a Duke who glides --
      // and a hop covers up to nine world units a step, a visible judder beside him.
      const cx = c.px === undefined ? c.x : c.px + (c.x - c.px) * alpha;
      const cy = c.py === undefined ? c.y : c.py + (c.y - c.py) * alpha;
      const x = snap(cx);
      const y = snap(cy);

      // NO HALO.
      //
      // There was a pulsing gold rectangle behind each of them and a glow under their
      // feet, added when they had ONE drawing each: the halo was the only thing about a
      // companion that ever moved. They have ten drawings now and it had become a smear
      // of light around a character you could otherwise read, so it is gone.

      // The blit itself lives in compsprites beside the art, the way the Duke's lives in
      // sprites.js, because where a companion's FEET are is a fact about the drawing and
      // not about the renderer. Drawn from here, this loop hung every cell straight from
      // its bottom edge: whatever the importer found lowest went on the ledge, and for the
      // pilgrim that is the tip of his staff -- see COMP_BOOT_ROW. Tumbling is passed its
      // spin and gets no drop; standing is passed null. Sizes come from the art too: one
      // shared COMP_W/COMP_H once made the halfling and the shield-maiden the same height.
      ctx.save();
      ctx.scale(1, -1);
      drawCompanion(ctx, c.id, pose, x, y, c.facing < 0,
        c.state === 'slipping' ? c.spin : null);
      ctx.restore();
    }
  }

  /**
   * What a companion says: an ANNOUNCEMENT, fixed in the middle of the screen.
   *
   * It was a speech bubble over their head for a long time, and every version of it was
   * janky for the same unavoidable reason: the speaker is a figure travelling along a hop
   * arc while the camera scrolls underneath them, six or seven hops a second at full
   * speed. Anchoring to them moves the text twice per frame in two axes. Damping it,
   * anchoring to the hop's destination, adding a dead zone -- all of that helped and none
   * of it fixed the thing, which is that the text was tied to something that never stops
   * moving.
   *
   * So it is not tied to them at all. Fixed place, fixed size, fades in and out, and it
   * says who is talking instead of pointing at them. You read it without looking away
   * from what you are doing, which is the entire job.
   *
   * It is one of the menus' plates now (menuskin.js mPanel: the Duke's gold bead round an
   * opaque field), the name in gold and the words in argent in the menus' fine lettering. It
   * was a flat box with a pale one-unit line round it and the font blown up flat inside, the
   * old lettering at the bottom of every frame of play. The box is the size it was, sized to
   * the longest line as tools/test-companions.mjs holds the speech to, and the frame lies
   * inside it: the bead is under two units deep and the words stand three in.
   */
  drawCompanionCalls(ctx, game) {
    if (!game.companions) return;
    // Scale 1. It went to 2 when the text still had to be read while chasing a bubble
    // around the screen; standing still in a fixed place at the bottom it does not need
    // to be that size, and at 2 a long line was two thirds of the screen wide.
    const SC = 1;
    const LH = 9 * SC;
    const MAXW = Math.round(VW * 0.62);
    const PADX = 5, PADY = 3;

    // AT THE BOTTOM, because that is where there is room. Measured rather than guessed:
    // rendering the HUD on its own and scanning it for ink, it occupies 173 of the 270
    // virtual rows, and the only gaps wide enough for a two-line banner are rows 203 and
    // below. The nineteen free rows up at 58-76 fit one line of small text and nothing
    // else. Stacks UPWARD, so a second speaker during a handover pushes the first up
    // rather than off the screen.
    const BOTTOM = VH - 10;

    let y = BOTTOM;
    for (const c of game.companions.active) {
      if (!c.bubble) continue;

      const words = String(c.bubble).split(' ');
      const lines = [];
      let line = '';
      for (const w of words) {
        const next = line ? `${line} ${w}` : w;
        if (line && textWidth(next, SC) > MAXW) { lines.push(line); line = w; }
        else line = next;
      }
      if (line) lines.push(line);

      const name = c.name || '';
      const tw = Math.max(textWidth(name, 1), ...lines.map((l) => textWidth(l, SC)));
      const bw = tw + PADX * 2;
      const bh = PADY * 2 + 8 + lines.length * LH;
      const bx = Math.round((VW - bw) / 2);
      y -= bh;

      // In and out on the same curve, so it never blinks off mid-sentence.
      const fade = callFade(c.bubbleT);
      if (fade <= 0) continue;
      ctx.globalAlpha = fade;

      mPanel(ctx, bx, y, bw, bh);
      mText(ctx, 'gold', name, VW / 2, y + PADY, 'center');
      lines.forEach((l, i) => {
        mText(ctx, 'text', l, VW / 2, y + PADY + 9 + i * LH, 'center');
      });
      ctx.globalAlpha = 1;

      // Two of them only overlap during a handover, and then only for a few seconds.
      y -= 4;
    }
  }

  // Screen-space streaks pouring up the view as the run gets faster, painted and drawn by
  // streaks.js at one art pixel per backing pixel. Deliberately NOT in world space: they
  // are about how fast the screen feels, and world-space streaks would shrink exactly when
  // the zoom pulls back and the player is going fastest. They used to be bars one or two
  // VIEW units wide (4-8 px), four times chunkier than the art, and read as rain.
  // In the death `pace` is the intensity the climb left (Game.fallPace): the pool is being
  // retired, and the lines keep rising at the speed they had while they go.
  drawSpeedStreaks(ctx, intensity, dt, theme, nextTheme, zoom, pace = intensity) {
    const budget = this.settings
      ? (this.settings.streaks ? STREAK_BUDGET[this.settings.particles] : 0)
      : 110;
    const p = this.cover ? PHONE_STREAKS : null;
    drawStreaks(ctx, this.streaks, intensity, dt, theme, p ? budget * p.share : budget, nextTheme, zoom, pace,
      p ? p.strength : 1);
  }

  // The floaters -- BOUNCE, TWICE, THRICE!, CHASE n, the +score of a banked chain -- are the
  // game's font at 2 backing pixels per font pixel (3 for a big one, one more for a pop as
  // each appears), in the colours of the combo step each was thrown at (f.colour is that
  // step, callouts.js). They were drawTextOutline at 4 and 8, in the zone's accent or white:
  // the chunkiest thing on screen, and the same whatever the chain.
  drawFloaters(ctx, game) {
    // Given the game, so the warm-up knows which lap's prestige badge comes next.
    warmComboText(game);
    const z = game.zoom;
    const viewLeft = CX - (VW / z) / 2;
    for (const f of game.floaters) {
      const sy = VH - (f.y - this.cam) * z;
      if (sy < -20 || sy > VH + 20) continue;
      const age = f.maxLife - f.life;
      const g = floaterPx(f.scale, age), g0 = floaterPx(f.scale);
      // Clamped clear of the combo meter AND of the text that rides it. A floater is
      // centred on the player, so scoring against the left wall threw BOUNCE or +2400
      // across the meter -- the readout a player is tracking while doing the thing that
      // spawned the floater. The right edge had a gauge too, FALL ROOM, and was clamped
      // 20 units in to clear it; that gauge is gone, so the right side only keeps the
      // 3-unit margin the score keeps from the same edge.
      //
      // The first attempt only cleared the 7-unit gauge column and BOUNCE still landed
      // on the multiplier: the counter is drawn at PLAY_L + 13 and runs to about
      // PLAY_L + 60 at two-times scale with three digits. 52 clears it.
      // The width is measured at the size it is DRAWN, keyline and pop included: the old
      // clamp measured textWidth at scale 1 and multiplied, dropped the tracking term, and
      // let a BOUNCE forty screen pixels wider than it thought land on the multiplier.
      const half = comboTextWidth(f.text, g) / PX / 2;
      const lo = PLAY_L + 52 + half, hi = PLAY_R - 3 - half;
      const raw = (f.x - viewLeft) * z;
      const sx = lo > hi ? VW / 2 : Math.max(lo, Math.min(hi, raw));
      const a = Math.min(1, f.life / 0.4);
      ctx.globalAlpha = a > 0.66 ? 1 : a > 0.33 ? 0.7 : 0.4;
      // The pop grows about the word's middle, so it does not jump up and back.
      const top = sy - (7 * (g - g0)) / 2 / PX;
      drawComboText(ctx, f.text, typeof f.colour === 'number' ? f.colour : 0, sx, top, g, age);
      ctx.globalAlpha = 1;
    }
  }

  // Warning band at the bottom for when the rising floor is close but still below the
  // visible area.
  drawDangerBand(ctx, game) {
    if (!game.riseActive) return;
    // Retuned when `danger` stopped saturating. It used to be normalised by viewport
    // height, so it pinned at 1 and this band almost never fired; against riseLead() it
    // moves, and 0.45 of your remaining room would now flash on an ordinary two-floor
    // slip. 0.3 means you have spent seventy percent of the fall you are allowed.
    const d = game.danger;
    if (d > 0.30) return;
    const k = (0.30 - d) / 0.30;
    ctx.globalAlpha = k * 0.55 * (0.6 + 0.4 * Math.sin(this.t * THREAT_HZ));
    ctx.fillStyle = '#ff2244';
    ctx.fillRect(0, VH - 34, VW, 34);
    ctx.globalAlpha = 1;
  }

  // A closing darkness while the character plummets.
  //
  // There were wind lines here too, and they were the loudest thing in the death: 34 bars in
  // the zone's particle colour, one VIEW unit (four backing pixels) wide, 18 to 45 long,
  // switched on at 0.35 alpha in the frame the floor caught him -- over the fire and its
  // crust as much as over the shaft. Their x hopped 13 units sideways forty times a second
  // and their y ran DOWN the screen at 1400 units a second, 23 units a frame at 60 Hz, so a
  // bar never overlapped where it had been: every frame was a new scatter of dashes, rain
  // flickering on and off, falling the wrong way past a man falling down a shaft that
  // rushes UP past him. The speed streaks took over the plummet for a while, and are retired
  // at the catch now too: the fall is him alone in the shaft, its speed carried by the walls
  // and the backdrop rushing past (Game.intensity, STREAK_LET_GO).
  drawFallOverlay(ctx, game) {
    const k = game.fallProgress;
    const dark = game.impacted ? 0.35 : k * 0.45;
    if (dark > 0) {
      ctx.globalAlpha = dark;
      ctx.fillStyle = '#05010a';
      ctx.fillRect(0, 0, VW, VH);
      ctx.globalAlpha = 1;
    }
  }

  drawVignette(ctx, game) {
    const d = game.danger;
    if (d >= 0.5) return;
    const k = (0.5 - d) / 0.5;
    ctx.globalAlpha = k * 0.45;
    ctx.fillStyle = '#220008';
    ctx.fillRect(0, 0, VW, 4);
    ctx.fillRect(0, VH - 4, VW, 4);
    // With side margins the side bands belong at the canvas's edges, not the frame's (drawWings).
    if (this.wing && !this.stages) this.edgeTint = k * 0.45;
    else {
      ctx.fillRect(0, 0, 4, VH);
      ctx.fillRect(VW - 4, 0, 4, VH);
    }
    ctx.globalAlpha = 1;
  }

  // 90 full-width fillRects every frame, for an overlay that never changes. Cached.
  scanlineLayer() {
    if (this._scan) return this._scan;
    const { c, g } = newCanvas(SW, SH);
    g.fillStyle = 'rgba(0,0,0,0.06)';
    // Scanlines are a SCREEN-space effect: one dark line every three screen pixels,
    // not every three world units, or they would double in thickness with PX.
    for (let y = 0; y < SH; y += 3 * PX) g.fillRect(0, y, SW, PX);
    this._scan = c;
    return c;
  }

  drawScanlines(ctx) {
    // EXPLICIT destination size, in world units.
    //
    // This was `drawImage(layer, 0, 0)` -- the three-argument form, which draws an
    // image at its INTRINSIC size measured in the current transform's units. The
    // transform live here is setTransform(PX, 0, 0, PX, 0, 0), so a layer that is
    // SW x SH backing-store pixels was being drawn into SW x SH *units* = SW*PX x SH*PX
    // backing-store pixels, in a buffer only SW x SH big.
    //
    // Two things were wrong at once and they cancelled into something that merely
    // looked like a design choice: only the top-left quarter of the overlay was on
    // screen, and it was magnified PX times, so the lines came out 3*PX*PX apart and
    // PX*PX thick -- 12 apart and 4 thick, against the 6 and 2 the layer is built with.
    // The error grows as PX squared.
    //
    // The headless canvas cannot catch this: its drawImage clips the destination box
    // and then remaps the source across the clipped span, so it renders the intended
    // pattern from the broken call. It took reading the transform to find.
    ctx.drawImage(this.scanlineLayer(), 0, 0, VW, VH);
  }
}
