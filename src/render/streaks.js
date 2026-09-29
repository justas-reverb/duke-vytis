// The speed streaks: the lines that pour up the screen when the Duke is moving fast.
//
// WHAT WAS WRONG, THREE TIMES. They were screen-space bars in VIEW units -- 4 or 8 backing
// pixels wide, four times chunkier than the art round them, spread evenly in short even
// lengths -- and at a distance they read as RAIN. The first redraw (6136a05) made them one
// art pixel wide with a white glint on top and kept the rest, and a flat-out frame was then
// FINE rain. The second (b963047) made them long comets and gathered them into two bands
// down the sides, so the middle three fifths of the screen stayed empty at every speed;
// tinted them from each zone's speed ramp, which in most zones is the backdrop's own hue
// a few steps lighter (cyan on DUNGEON's blue stone, green on the SWAMP's green); and ran
// them up at 800-3600 px/s, a near one only 1.3 times faster flat out than fast and 1.8
// times faster than quick. The player's verdict on that: they should speed up much more
// as the run gets faster, cover the middle as they used to, and stand out from the
// background.
//
// WHAT THEY ARE NOW.
//
//   - SPEED THAT CLIMBS. A near streak rises at V_A e^(V_K I) px/s for intensity I: about
//     1,300 px/s when the run is quick (I 0.4), 2,900 fast (0.7, full SPEED meter and no
//     chain) and 6,500 flat out (1.0): each step 2.2 times the last, flat out five times
//     quick. Far ones run at a quarter to three quarters of that. Length is the same
//     speed seen through a shutter: 120 px plus what
//     the line travels in 0.09 s, so a near one is about 230 px quick, 380 fast and 650
//     flat out. Judged in motion, at the game's frame interval (strips of consecutive
//     160 Hz frames, 2026-09-23): a line moves a fortieth to a fifteenth of its own
//     length a frame (a sixth at most at 60 Hz), so it reads as one line running up
//     rather than a dash that jumps.
//   - THE WHOLE WIDTH. They spawn across the full width, crowded toward the sides (the
//     inset from the nearer edge is r^1.6 of the half width: a quarter of them in the
//     outer tenth each side, a sixth in the middle quarter of the screen). Nearer the
//     edge they also run a little longer and brighter, so the frame still reads as
//     rushing past at its rim. What keeps a full screen of thin lines from being rain is
//     that they rise, fast, at many speeds at once; in a still frame the long parallax
//     and the head at the top end do what they can.
//   - A TONE PER ZONE, IN THE ZONE'S OWN COLOURS. Each zone has its own streak colours
//     below, chosen against that zone's backdrop measured in real frames (median and 95th
//     percentile luminance and the mean hue behind the play) and against its ledges.
//     Light over dark in every zone, and each line carries a one-pixel dark rim either side,
//     as everything drawn here meets the backdrop with a dark outline -- it is the rim, and
//     the step in lightness, that set a line off the backdrop, so the hue can be the
//     zone's: mauve in the violet cellar, steel-ice on the dungeon's blue stone, firefly
//     green in the forest, will-o'-wisp in the swamp, neon pink over the city, pale sky
//     round the citadel, lightning white-violet in the storm. They were, until 2026-09-28,
//     a hue FAR from each backdrop's -- amber, torch orange, orange, gold, lantern orange,
//     gold, yellow in the first seven zones -- which stood out, and stood out the same
//     orange everywhere: "lets make the zooming through eye candy change color so it
//     better matches the background and effects it staying orange the whole time messes
//     with the visuals". The rim is what carries ZENITH's streaks across its pale light
//     shafts, and STORM's across its clouds.
//   - QUIETER THAN A LEDGE. They run BEHIND the ledges now (see below), so a line can
//     never lie across a lit top row, and no streak pixel is brighter than that zone's
//     ledges' own brightest pixels (their 98th percentile luma: 121 of 255 in DUNGEON,
//     127 in BASEMENT, 135 in FOREST). In those dim-ledged zones that cap is why the
//     streaks are saturated oranges rather than pale ones: at that luma only a saturated
//     colour still stands off the backdrop.
//
// UNDER THE LEDGES, THE HUD AND THE CHARACTERS. renderer.js draws them after the walls
// and before the ledges, the HUD, the companions and the Duke. Drawn last, as the bars
// were, they crossed his face and the HUD's numbers. Drawn over the ledges, as the version
// before this was, each line was a notch cut through the lit row a player tracks -- and
// across the whole width, with colours bright enough to stand off the backdrop, those
// notches would have been brighter than the lit row itself in FOREST and SWAMP (luma 100).
//
// SCREEN SPACE, STILL, AND WHY. They are about how fast the screen feels. In world space
// they would shrink exactly when the zoom pulls back, which is when the run is fastest.
// So positions, lengths and speeds are in backing pixels and ignore the zoom. Only the
// GRAIN follows it: one streak pixel is one backing pixel -- the Duke's art pixel at zoom
// 1 -- and two at zoom 2 and 1.75, where his art pixel is two (or nearly). A streak keeps
// the grain it was born with.
//
// COST. Every streak shape is painted once per zone into one small atlas canvas (all
// lengths, both widths, three tones, and the edge-bloom strips), and a frame draws each
// streak with ONE drawImage from it, at its own size or an exact double -- never
// resampled, so no row of a head is ever dropped or doubled. The bloom is four more,
// stretched only along the axis it does not vary on.

import { SW, SH, PX } from '../game/constants.js';
import { newCanvas } from './canvases.js';

// --- the colours -----------------------------------------------------------------------

/**
 * Per zone: the tail colour of a far streak and of a near one (tones in between are
 * mixed from the two), the head, and the dark rim with its alpha. Measured against the
 * zone's backdrop behind the play (8-bit luma of its median / 95th percentile, and its
 * mean hue) and its ledges (luma of their brightest pixels, the 98th percentile), in
 * frames from floors 40-2250 at zoom 1:
 *
 *   zone       backdrop  hue  ledge  near tail            contrast vs median / p95
 *   BASEMENT    38 / 48  258   127   mauve     L119 h325   3.2:1 / 2.8   (far 2.5)
 *   DUNGEON     34 / 52  227   121   steel-ice L117 h193   3.8:1 / 3.0   (far 2.7)
 *   FOREST      42 / 68  120   135   firefly   L132 h 70   4.3:1 / 2.9   (far 3.1)
 *   SWAMP       30 / 71  147   183   wisp      L169 h140   8.1:1 / 4.5   (far 5.4)
 *   DOWNTOWN    36 / 54  253   240   neon pink L153 h300   5.2:1 / 4.0   (far 3.3)
 *   CITADEL     49 / 71  223   232   pale sky  L173 h211   6.0:1 / 4.3   (far 3.9)
 *   STORM       64 /101  269   249   lightning L181 h253   4.9:1 / 2.7   (far 2.9)
 *   ABYSS       18 / 24  261   203   lilac     L147 h290   5.8:1 / 5.5   (far 3.5)
 *   NEBULA      17 / 56  272   246   pink      L154 h316   6.3:1 / 3.9   (far 3.9)
 *   COSMOS      21 / 28  215   203   lavender  L154 h255   6.2:1 / 5.8   (far 3.7)
 *   STARFIELD   31 / 40  178   203   mint      L169 h159   8.2:1 / 7.3   (far 5.0)
 *   ZENITH      49 / 92  222   232   gold      L169 h 42   5.8:1 / 3.0   (far 3.9)
 *
 * (Contrast is WCAG's, from linear luminance against a grey of the backdrop's luma; every
 * tail and head is at or under the ledge column but ABYSS's head, a few points over as it
 * always was.) BASEMENT, DUNGEON and FOREST are the tightest -- brick, stone and moss
 * ledges whose brightest pixels are only luma 121-135 -- so their tones are the darkest,
 * and it is the rim that sets each line in a darker channel of its own there. ZENITH keeps
 * its gold: it is the zone's own light, the colour of its shafts. (Before these, the zones'
 * speedramps.js ramps tinted them the backdrops' own hues a few steps lighter, too close
 * to read; then the far hues above. These sit between: the zone's hue family, lighter, rimmed.)
 */
const TONES = {
  BASEMENT:  { far: '#8e4c74', near: '#a85a88', head: '#ae6290', rim: '#140a14', rimA: 0.5 },
  DUNGEON:   { far: '#3c6c7c', near: '#4c8494', head: '#50869a', rim: '#0a0a14', rimA: 0.5 },
  FOREST:    { far: '#6c7c2c', near: '#849434', head: '#869636', rim: '#08120a', rimA: 0.55 },
  SWAMP:     { far: '#5ca078', near: '#7cc494', head: '#90c8a0', rim: '#040c08', rimA: 0.55 },
  DOWNTOWN:  { far: '#9c5c9c', near: '#c878c8', head: '#f0b0f0', rim: '#120c1c', rimA: 0.5 },
  CITADEL:   { far: '#6c90bc', near: '#8cb4e0', head: '#d0e4ff', rim: '#10142a', rimA: 0.6 },
  STORM:     { far: '#8c7cc8', near: '#b8a8f0', head: '#f0e8ff', rim: '#1c1028', rimA: 0.75 },
  ABYSS:     { far: '#9050a8', near: '#c070d0', head: '#f0b8f8', rim: '#06040e', rimA: 0.5 },
  NEBULA:    { far: '#a05890', near: '#d078b8', head: '#f8c0e8', rim: '#0c0418', rimA: 0.5 },
  COSMOS:    { far: '#7860c0', near: '#a088e8', head: '#d0c0f8', rim: '#000818', rimA: 0.5 },
  STARFIELD: { far: '#4c9c84', near: '#6cc8a8', head: '#a0e0c8', rim: '#001010', rimA: 0.5 },
  ZENITH:    { far: '#a88838', near: '#d0a848', head: '#f8e8a8', rim: '#101428', rimA: 0.8 },
};
export const STREAK_TONES = TONES;

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => {
  const A = hex(a), B = hex(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
};

// --- the shapes ------------------------------------------------------------------------

/**
 * Tail lengths a streak can have, in streak pixels: 24 to 913 in steps of a fourth of an
 * octave (x1.19). A streak picks the nearest when it spawns and keeps it, so nothing is
 * ever drawn stretched. The longest used to be 457; flat out a near line is 600-800 now.
 */
const LENGTHS = Array.from({ length: 22 }, (_, k) => Math.round(24 * 2 ** (k / 4)));
const NL = LENGTHS.length;
const LN_MIN = Math.log(LENGTHS[0]);
const LN_STEP = Math.log(2) / 4;

/** A streak's box is 4 px across: a rim, the core in column 1 (and 2 on a near one), a rim. */
const BOX_W = 4;
const SLOT_W = BOX_W + 1;

/** Three tones, dimmest first: 0 is the far colour, 2 the near one. */
const NTONES = 3;

/** How many steps the tail fades in. Six bands of alpha, each a run of whole rows. */
const FADE_STEPS = 6;

// The atlas: for each width (thin, near) and tone, the lengths packed two to a column
// (the k-th shortest over the k-th longest), then the four bloom strips.
const COLS_PER_SET = (NL + 1) >> 1;
const SETS = 2 * NTONES;
const COL_H = LENGTHS[0] + 2 + LENGTHS[NL - 1];
const BLOOM_X = SETS * COLS_PER_SET * SLOT_W;

// The edge bloom at full tilt, as stepped bands of the zone's head and near colours:
// [width in backing px, alpha 0..1, which colour], outermost first. It was a hard 8-px bar
// along the top and bottom and a 12-px one down each side, solid, in the palest colour.
const BLOOM_SIDE = [[2, 0.46, 'head'], [3, 0.28, 'head'], [5, 0.17, 'near'], [8, 0.09, 'near'], [10, 0.045, 'near']];
const BLOOM_END = [[2, 0.36, 'head'], [3, 0.2, 'near'], [6, 0.08, 'near']];
// The sizes are forced to small integers (| 0), and that is not tidiness. A width summed
// from a table that also holds fractions is a heap double in V8 (332.0), and a canvas
// sized with one made the HEADLESS canvas slow for the rest of the process --
// tools/test-perf.mjs's RENDER went from 49 to 63 ms a frame even with the streaks off.
// A browser converts a canvas size to an integer itself.
const bandsW = (b) => b.reduce((s, [w]) => s + w, 0) | 0;
const SIDE_W = bandsW(BLOOM_SIDE);
const END_H = bandsW(BLOOM_END);
const ATLAS_W = (BLOOM_X + 2 * (SIDE_W + 1) + 4) | 0;
const ATLAS_H = Math.max(COL_H, END_H * 2 + 4) | 0;

/** Where the sprite for (near, tone, length index) sits in the atlas: [x, y]. */
function slot(near, tone, li) {
  const set = (near ? NTONES : 0) + tone;
  const col = li < COLS_PER_SET ? li : NL - 1 - li;
  const y = li < COLS_PER_SET ? 0 : LENGTHS[col] + 2;
  return [(set * COLS_PER_SET + col) * SLOT_W, y];
}

/**
 * One streak, as a plan of runs: [x, y, w, h, colour, alpha] in box coordinates.
 * Thin: a 1-px line in column 1, rimmed in columns 0 and 2. Near: columns 1 (lit) and 2
 * (a step toward the rim, lit from the upper left like everything here) for the head and
 * the first 45% of the tail, rimmed in 0 and 3; then column 1 alone, rimmed in 0 and 2,
 * so it tapers on its shaded side. A rim pixel caps the head, so the line has an outline
 * all the way round its leading end.
 */
function plan(L, near, tone, st) {
  const t = tone / (NTONES - 1);
  const lit = mix(st.far, st.near, t);
  const deep = mix(lit, st.rim, 0.22);
  // The head in the zone's head colour on the two brighter tones, half-way to it on the
  // dimmest. Its lit column is opaque, and no brighter than the zone's brightest ledge
  // pixels.
  const head = tone ? st.head : mix(st.near, st.head, 0.5);
  const rim = st.rim, rA = st.rimA;
  // Runs are merged as they are laid: every column is laid top to bottom, so a pixel that
  // continues the column's last run (same colour, same alpha, next row) just lengthens it.
  // Collecting pixels and sorting them per column afterwards cost three times as long.
  const runs = [];
  const open = [null, null, null, null];
  const put = (x, y, h, c, a) => {
    const r = open[x];
    if (r && r[4] === c && r[5] === a && r[1] + r[3] === y) { r[3] += h; return; }
    open[x] = [x, y, 1, h, c, a];
    runs.push(open[x]);
  };
  let r0;
  if (near) {
    put(1, 0, 1, rim, rA);                    // the cap over the tip
    put(0, 1, 1, rim, rA); put(2, 1, 1, rim, rA);
    put(1, 1, 4, head, 1);                    // the head, one pixel at its tip, then two
    put(2, 2, 3, head, 0.85);
    put(0, 2, 3, rim, rA); put(3, 2, 3, rim, rA);
    r0 = 5;
  } else {
    put(1, 0, 1, rim, rA);
    put(1, 1, 2, head, 1);
    put(0, 1, 2, rim, rA); put(2, 1, 2, rim, rA);
    r0 = 3;
  }
  // The tail: alpha falls as (1 - f)^0.4 along it, quantised to FADE_STEPS bands, so it is
  // at 5/6 or more for its first half and steps down through the second; the rim fades with
  // it, so the end of a line is never a dark stub. The version before ran (1 - f)^0.7 from
  // a head alpha of 0.55-0.85 under a global 0.75-1, so on average a line was drawn at
  // about half strength, which thinned its colour back toward the backdrop.
  const step = 1 / FADE_STEPS;
  for (let y = r0; y < L; y++) {
    const f = (y - r0) / (L - r0);
    const q = Math.round(((1 - f) ** 0.4) / step) * step;
    if (q <= 0) break;
    put(0, y, 1, rim, rA * q);
    put(1, y, 1, lit, q);
    if (near && f < 0.45) { put(2, y, 1, deep, q); put(3, y, 1, rim, rA * q); }
    else put(2, y, 1, rim, rA * q);
  }
  return runs;
}

const styles = new Map();
function fill(g, x, y, w, h, colour, a) {
  const key = colour + a.toFixed(3);
  let s = styles.get(key);
  if (!s) {
    const [r, gg, b] = hex(colour);
    s = `rgba(${r},${gg},${b},${a.toFixed(3)})`;
    styles.set(key, s);
  }
  g.fillStyle = s;
  g.fillRect(x, y, w, h);
}

/** One zone's atlas, painted with one fillRect per run. */
function build(theme) {
  const st = TONES[theme.name] || TONES.BASEMENT;
  // Smoothing off, as on every offscreen canvas here (canvases.js): a fresh canvas smooths by
  // default, and the headless canvas never does, so no shot would show it if it mattered.
  const { c, g } = newCanvas(ATLAS_W, ATLAS_H);
  let runs = 0;
  for (const near of [false, true]) {
    for (let tone = 0; tone < NTONES; tone++) {
      for (let li = 0; li < NL; li++) {
        const [ox, oy] = slot(near, tone, li);
        for (const [x, y, w, h, col, a] of plan(LENGTHS[li], near, tone, st)) {
          fill(g, ox + x, oy + y, w, h, col, a);
          runs++;
        }
      }
    }
  }
  // Bloom strips: the left edge as one row, the right as its mirror, the top as one
  // column and the bottom as its mirror. Each is stretched along the edge when drawn,
  // which is exact: it does not vary in that direction.
  let x = 0;
  for (const [w, a, k] of BLOOM_SIDE) {
    fill(g, BLOOM_X + x, 0, w, 1, st[k], a);
    fill(g, BLOOM_X + SIDE_W + 1 + (SIDE_W - x - w), 0, w, 1, st[k], a);
    x += w;
    runs += 2;
  }
  let y = 0;
  const ex = BLOOM_X + 2 * (SIDE_W + 1);
  for (const [h, a, k] of BLOOM_END) {
    fill(g, ex, y, 1, h, st[k], a);
    fill(g, ex + 2, END_H - y - h, 1, h, st[k], a);
    y += h;
    runs += 2;
  }
  return { canvas: c, runs };
}

/**
 * Every zone's atlas, painted once and kept, as the walls' strips and the backdrop's layers
 * are. One is 392 x 939 (1.5 MB), so all twelve are 18 MB.
 *
 * The version before kept only the last three painted, to save memory -- and so painted
 * BASEMENT again at the start of every run after a long one. There is one renderer for the
 * title screen's attract run and for the game; the attract bot is flat out and passes four
 * zones in about forty seconds, which evicted BASEMENT, and the first frame of the player's
 * run then repainted it (about 4 ms headless, 2,900 fillRects). Nothing warms BASEMENT ahead
 * of a run, and the first frame of a run is one that must not paint (docs/ARCHITECTURE.md).
 */
const atlases = new Map();
export const buildStats = { zones: 0, runs: 0, ms: 0 };

function atlasFor(theme) {
  let a = atlases.get(theme.name);
  if (!a) {
    const t0 = performance.now();
    a = build(theme);
    buildStats.ms += performance.now() - t0;
    buildStats.zones++;
    buildStats.runs += a.runs;
    atlases.set(theme.name, a);
  }
  return a.canvas;
}

/**
 * Paint a zone's streaks now, if they are not painted yet. drawStreaks calls it for the
 * NEXT zone once the current one has been on screen for WARM_AFTER frames, so its atlas
 * exists minutes before the change (the backdrop warms its layers and decor.js its sprites
 * the same way). Returns whether it painted.
 */
export function warmStreaks(theme) {
  if (!theme || atlases.has(theme.name)) return false;
  atlasFor(theme);
  return true;
}

export function resetStreakCache() { atlases.clear(); }

/**
 * Frames the zone must have been on screen before the next one is painted: 240, a second
 * and a half at 160 Hz. Not the first frame of a zone -- that is the frame of the change,
 * with the backdrop's crossfade in it -- and not the backdrop's own 120, whose frames it
 * spends painting the next zone's layers and furniture one per frame (backdrop.js warm).
 */
const WARM_AFTER = 240;
let shown = null;
let shownFor = 0;

// --- the motion ------------------------------------------------------------------------

/**
 * How fast a NEAR streak rises, in backing px/s, at intensity I: V_A x e^(V_K x I).
 * 580 when the first streaks appear (I 0.1), 1,300 quick (0.4), 2,900 fast (0.7),
 * 6,500 flat out (1.0). It was (0.35 + I) x 2,680: 2,010 quick, 2,810 fast, 3,620 flat
 * out, so the step that should feel biggest, from fast to flat out, was the smallest.
 */
const V_A = 445, V_K = 2.68;
/** A far streak's speed as a share of a near one's (depth 0 .. 1 runs FAR_SHARE .. 1). */
const FAR_SHARE = 0.25;
/** Length = (LEN_BASE + LEN_SHUTTER x near speed) x depth and position factors, in px:
 * the base keeps the slowest from being dashes, the shutter (seconds) makes the fast
 * ones long in proportion to their speed, as motion blur is. */
const LEN_BASE = 120, LEN_SHUTTER = 0.09;
/** Share of streaks that are near (2 px wide, brighter, faster, longer). */
const NEAR_SHARE = 0.33;
/** How hard the lines crowd toward the sides: inset from the nearer edge is
 * (half the width) x r^BAND_POW for a uniform r -- 24% of them in the outer tenth of
 * each half, 16% in the middle quarter of the screen (where an even spread puts 25%). */
const BAND_POW = 1.6;
/**
 * Lines per unit of STREAK_BUDGET: one, as there was one bar. The budget (medium 55, high
 * 110) still means none, half or full, and full intensity draws that many lines, each one
 * drawImage.
 */
const LINES_PER_UNIT = 1;

/**
 * How the pool follows the intensity without a line ever appearing or vanishing mid-screen.
 *
 * It used to be cut to length and topped up at random heights: every line the intensity no
 * longer paid for vanished where it stood, and every new one popped into existence at a
 * random height, whole. Driven by a player's own rhythm -- momentum built and bled at the
 * game's rates, a combo that adds up to 0.45 and drops it in one frame when it breaks -- that
 * was about 510 lines a minute vanishing on screen and 460 popping in, some eight a second
 * of each. The bars did the same; with the lines long, opaque and across the middle now,
 * each one is a flicker in plain view.
 *
 * Now a new line ENTERS from below the screen, somewhere in the TOPUP_BAND px under it so a
 * burst of them arrives spread out rather than as a front, and a line the intensity no longer
 * pays for SHRINKS into its head over SHRINK_S seconds while it goes on rising -- burning
 * out by shrinking, as the combo trail's pieces do (sparks.js), since a fading alpha greys
 * a colour back toward the sky. Lines still below the screen are simply dropped, and of the
 * rest the ones nearest the top go first. Only a cold pool (a screenshot tool's single
 * frame, the setting switched on at speed) is filled at random heights, as the steady flow
 * would have it. Measured over the same minute: 0 vanishing, 0 popping in; a combo break
 * (110 lines down to 53) is finished in 0.2 s, and a jump from quick to flat out has 106 of
 * its 110 lines on screen within 0.2 s.
 */
const TOPUP_BAND = SH / 2;
const SHRINK_S = 0.2;

const nearSpeed = (intensity) => V_A * Math.exp(V_K * intensity);

/** Where a line starts: at a random height (below < 0), or up to `below` px under the screen. */
function spawn(s, intensity, below, grain) {
  const d = Math.random();                  // depth: 0 far .. 1 near
  s.near = d > 1 - NEAR_SHARE;
  s.sp = FAR_SHARE + (1 - FAR_SHARE) * d;
  // Distance in from the nearer side edge, in backing px, anywhere up to the middle of
  // the screen, densest at the edge.
  const t = Math.random() ** BAND_POW;
  const inset = t * (SW / 2);
  s.g = grain;
  const bw = BOX_W * grain;
  s.x = Math.round(Math.random() < 0.5 ? inset - grain : SW - bw - inset + grain);
  // Length from the speed a near line has at this intensity, then depth (far ones half
  // as long), a little chance, and how far out it is (the rim of the screen blurs most).
  const len = (LEN_BASE + LEN_SHUTTER * nearSpeed(intensity))
    * (0.5 + 0.5 * d) * (0.85 + 0.3 * Math.random()) * (1.15 - 0.3 * t) / grain;
  const li = Math.round((Math.log(len) - LN_MIN) / LN_STEP);
  s.li = li < 0 ? 0 : li >= NL ? NL - 1 : li;
  s.tone = Math.min(NTONES - 1, Math.floor(Math.random() * 1.3 + intensity * 1.6 + (s.near ? 0.4 : 0) + (t < 0.25 ? 0.3 : 0)));
  [s.sx, s.sy] = slot(s.near, s.tone, s.li);
  s.y = below < 0 ? Math.random() * SH : SH + Math.random() * below;
  s.out = false;   // not shrinking out
  s.cut = 0;       // rows left while it does
}

/**
 * Take `n` lines off the pool without one vanishing on screen: those still below the screen
 * go at once, then the ones nearest the top are set shrinking.
 */
function retire(list, n) {
  const live = list.filter((s) => !s.out);
  for (const s of live) {
    if (n <= 0) return;
    if (s.y >= SH) { s.out = true; s.cut = 0; n--; }
  }
  live.sort((a, b) => (a.y + LENGTHS[a.li] * a.g) - (b.y + LENGTHS[b.li] * b.g));
  for (const s of live) {
    if (n <= 0) return;
    if (s.out) continue;
    s.out = true;
    s.cut = LENGTHS[s.li];
    n--;
  }
}

/**
 * Advance and draw the streaks.
 *
 * @param ctx        the frame, in its screen-space transform (PX per view unit, plus shake)
 * @param list       the renderer's persistent array of streaks
 * @param intensity  0..1, game.intensity
 * @param dt         seconds since the last frame
 * @param theme      the zone on screen
 * @param budget     the setting's streak budget (STREAK_BUDGET by particle setting); full
 *                   intensity draws LINES_PER_UNIT lines per unit of it
 * @param nextTheme  the zone after it, painted ahead of time
 * @param zoom       the arena's zoom step (game.zoom), which sets the grain
 * @param pace       the intensity the lines RISE at, 0..1; the intensity itself unless the
 *                   two part. They part in the death (Game.fallPace): the pool is retired
 *                   there, and lines that slowed as they went would be one more thing
 *                   changing at once -- they keep the pace the climb gave them and thin out.
 */
export function drawStreaks(ctx, list, intensity, dt, theme, budget, nextTheme, zoom = 1,
  pace = intensity) {
  const grain = zoom >= 1.75 ? 2 : 1;
  const atlas = atlasFor(theme);
  if (theme.name !== shown) { shown = theme.name; shownFor = 0; }
  if (++shownFor > WARM_AFTER && nextTheme && nextTheme !== theme) warmStreaks(nextTheme);

  // The setting's budget is a hard cap on the lines drawn, shrinking ones included; a lower
  // setting cuts the pool at once, as switching the streaks off always has. A setting that
  // names no budget (particles off) is no streaks rather than NaN, and no bloom either.
  const cap = Math.floor((budget || 0) * LINES_PER_UNIT);
  if (list.length > cap) list.length = cap;
  if (!cap) return;
  // intensity^2 x the budget, as before: a trickle when quick, all of it flat out. See
  // TOPUP_BAND for how the pool gets there without a line popping in or out.
  const want = Math.floor(intensity * intensity * cap);
  let live = 0;
  for (const s of list) if (!s.out) live++;
  if (live < want) {
    const cold = !list.length && want > 2;
    while (live < want && list.length < cap) {
      const s = {};
      spawn(s, intensity, cold ? -1 : TOPUP_BAND, grain);
      list.push(s);
      live++;
    }
  } else if (live > want) retire(list, live - want);
  if (!list.length) return;

  // Opaque: each shape carries its own fade, and the colours were chosen to contrast at
  // full strength. The old global alpha of 0.75-1 thinned the colour toward the backdrop.
  const v = nearSpeed(pace);
  const inv = 1 / PX;
  ctx.globalAlpha = 1;
  let kept = 0;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    s.y -= s.sp * v * dt;
    let n = LENGTHS[s.li];
    if (s.out) {
      // Shrinking into its head: gone once no whole row is left or it has left the top.
      s.cut -= n * dt / SHRINK_S;
      n = Math.ceil(s.cut);
      if (n < 1 || s.y + n * s.g < 0) continue;
    } else if (s.y + n * s.g < 0) {
      spawn(s, intensity, 120, grain);
      n = LENGTHS[s.li];
    }
    list[kept++] = s;
    const k2 = s.g * inv;
    // Whole backing pixels through the PX transform, at one or two per streak pixel -- a
    // whole multiple, so nearest-neighbour doubling is exact. A shrinking line draws the
    // top n rows of its shape: its head and what is left of its tail.
    ctx.drawImage(atlas, s.sx, s.sy, BOX_W, n,
      s.x * inv, Math.round(s.y) * inv, BOX_W * k2, n * k2);
  }
  list.length = kept;

  // At full tilt the edges of the screen bloom, in stepped bands like every light here.
  if (intensity > 0.75) {
    const VWu = SW / PX, VHu = SH / PX;
    const ex = BLOOM_X + 2 * (SIDE_W + 1);
    ctx.globalAlpha = (intensity - 0.75) / 0.25;
    ctx.drawImage(atlas, BLOOM_X, 0, SIDE_W, 1, 0, 0, SIDE_W / PX, VHu);
    ctx.drawImage(atlas, BLOOM_X + SIDE_W + 1, 0, SIDE_W, 1, VWu - SIDE_W / PX, 0, SIDE_W / PX, VHu);
    ctx.drawImage(atlas, ex, 0, 1, END_H, 0, 0, VWu, END_H / PX);
    ctx.drawImage(atlas, ex + 2, 0, 1, END_H, 0, VHu - END_H / PX, VWu, END_H / PX);
    ctx.globalAlpha = 1;
  }
}

/** For tools: the painted lengths, the near speed at an intensity, and a zone's atlas. */
export const STREAK_LENGTHS = LENGTHS;
export const streakSpeed = nearSpeed;
export function streakAtlas(theme) { return atlasFor(theme); }
