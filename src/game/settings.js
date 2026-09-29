// Persisted graphics settings.
//
// SCALING is the one that decides whether this looks like a game or like a postage
// stamp, and the default used to assume the display it was developed on.
//
// The backing store is 1920x1080 (it was 960x540 until PX went to 4). INTEGER scaling
// picks the largest whole multiple that fits, which is the only way a game pixel stays
// an exact square block. On the two resolutions this was built against that costs
// nothing -- 4K is exactly 2x and 1080p exactly 1x. On anything else it is brutal. The
// table was measured at the old 960x540 store; at today's store 1440p and 3440x1440 get
// 1x (56% and 42% of the display) and 900p and 768p are below 1:1 altogether:
//
//   2560x1440   2.67x available -> 2x used   1920x1080 of a 1440p screen, bars all round
//   1600x900    1.67x            -> 1x       960x540. A quarter of the screen.
//   1366x768    1.42x            -> 1x       the same, on a smaller display
//   3440x1440   2.67x            -> 2x       bars on an ultrawide, on all four sides
//
// So AUTO is the default now: integer when the whole multiple is close to what the
// screen could give, and a fractional fill when it is not. The threshold is in
// renderer.js. INTEGER and FILL both remain, forced, for anyone who wants one or the
// other everywhere.

import { key } from './savekeys.js';

// v2 exists to move anyone whose saved blob still says `integer` onto `auto` -- that
// value was the old DEFAULT rather than a choice, and leaving it would mean the fix
// reached new players and nobody else. Everything else carries across untouched, and a
// v2 blob is never rewritten again, so a deliberate INTEGER stays INTEGER.
const KEY = key('settings.v2');
const KEY_V1 = key('settings.v1');

export const SCALE_MODES = ['auto', 'integer', 'fill'];
export const PARTICLE_LEVELS = ['low', 'medium', 'high'];
// How the companions move: ledge to ledge (the default), or the old rail, kept so the two
// can be compared in play. The same list as MOVEMENTS in companions.js, written out here
// so this module stays free of game imports.
export const COMPANION_MOVES = ['hop', 'glide'];

export const PARTICLE_BUDGET = { low: 220, medium: 520, high: 900 };
export const STREAK_BUDGET = { low: 0, medium: 55, high: 110 };

// JUMP SPEED: how fast the Duke's own physics clock runs against the world's, as a multiple
// [x; 1 is the game as tuned, 1.2 the default, 1.4 the most offered]. At s his whole step --
// gravity, the jump, running, the air, the walls, momentum -- advances s times as far each
// step, so he flies the same arcs through space, the same heights and the same reaches, in
// 1/s of the time: every tower stays reachable and the generator and the reach proof are
// untouched. The fire, the companions and the music keep the world's clock, and the windows
// for a player's hands (the jump buffer, coyote time, the combo's ground grace) stay in real
// seconds. It is a SIMULATION setting: fixed for a run when it starts (Game.newRun), written
// into the replay's header and played back at it (replaycodec.js stores it in 5% steps, so
// every value here must be a multiple of 0.05 from 1). Lives here rather than in
// constants.js because no module of the step reads the list -- the step reads the run's own
// value -- and a replay's fingerprint should not change when a menu offers one more speed.
export const JUMP_SPEEDS = [1, 1.1, 1.2, 1.3, 1.4];
// Why not faster: his step is s times as long, and a wall or a ledge met inside a longer step
// is met at another instant of it. Up to 140% he flies the same jumps within tools/test-feel's
// tolerances (a flat-out jump off three walls within 1.5 units of 100%'s path, its apexes
// within 0.98 of the 1.0 allowed); at 150% the apexes drift 1.09 and coyote time takes jumps
// 60 steps after the ledge instead of 20, at 160% the path is 6.4 units off. Faster than 140%
// needs his step cut into pieces at high rates first.

// The default: 1.2 once the user had played it ("jump speed 120 seems nice lets keep that as a
// default", 2026-09-28); 1.4 the same evening, when the user found the Duke too slow on the new
// defaults of the day -- SMALL ledges and a MEDIUM fire, which cost a flat-out climber 2% of his
// average speed and 9% of his floors a minute, his physics unchanged to the bit -- "I WANT HIM TO
// HAVE MORE SPEED PLEASE"; and 1.2 again on 2026-09-29, with NORMAL ledges and a lighter NORMAL
// gravity: "default settings for the game is 120% jump speed normal platforms and normal gravity".
// Each move carries the saved default with it, once, and SPEED_V in the saved settings marks it
// made: 2 moved a saved 1.2 to 1.4, 3 moves a 1.4 saved since then back to 1.2 (the user's own
// was one). A 1.4 in a save from before the first move was a choice, and stays; so does a speed
// chosen from the menu after the move.
const SPEED_V = 3;

// PLATFORMS: how wide the tower's ledges are, as a multiple of the widths it was tuned with
// [x; 1 is the tower as it was until 2026-09-28]. Two since 2026-09-29, NORMAL 0.875 (the
// default) and WIDE 1.175. The user first asked for three, SMALL 0.75 (the default), MEDIUM 1
// and WIDE 1.35 -- "lets have smaller platforms on default and make selecting small, medium and
// wide platforms" -- then "normal platform length should be somewhere between the normal and
// low length of the platform. lets remove the small platforms and only keep wide and normal.
// wide will be somewhere between the current normal and wide": NORMAL halfway from MEDIUM to
// SMALL, WIDE halfway from MEDIUM to the old WIDE. Every ledge's width is multiplied by it, its
// minimum too (32 at 1, 28 at NORMAL, 37 at WIDE -- the squeeze's floor, 24, still four units
// over the Duke's 16 + 4 a landing needs); the gaps are the reach proof's and do not change, so
// every tower stays climbable. A SIMULATION setting like JUMP SPEED: fixed for a run when it
// starts (Game.newRun), written into the replay's header as the value itself and played back at
// it (replaycodec.js platformsCode), and here rather than in constants.js for the same reason:
// the step reads the run's value, never this list. A race is on its GHOST's width (main.js).
export const PLATFORM_WIDTHS = [0.875, 1.175];
// Every width a run has been climbed on -- the menu's two, and the three it offered before --
// with a word for each: a replay keeps the width it was climbed on (replaycodec.js reads any of
// these), and a race on an old ghost's tower is on its old width. SMALL, MEDIUM and X-WIDE are
// the old widths' names, never the menu's; X-WIDE so the old WIDE is not taken for the new.
export const PLATFORMS_KNOWN = [0.75, 0.875, 1, 1.175, 1.35];
// A width saved by an older build, moved to the menu's that took its place (settings.js load):
// SMALL and MEDIUM to NORMAL, the old WIDE to WIDE.
const PLATFORMS_WAS = { 0.75: 0.875, 1: 0.875, 1.35: 1.175 };

// DIFFICULTY: an index into constants.js DIFFICULTIES -- 0 EASY (the fire as it was until
// 2026-09-28), 1 MEDIUM, the default since, 2 HARD. Measured at the other defaults (SMALL,
// 120%), the median best floor in 180 s, EASY / MEDIUM / HARD: a stop-dead weak bot 190 / 140
// / 84, a held-jump bot 120 / 67 / 30, the attract bot 814 / 481 / 423 (the bot as it was: rebuilt
// on 2026-09-29, the fire catches it at none of the three and it climbs about 4,160). A
// simulation setting like the two above, carried in the replay's header; a race is at its
// ghost's or the player's, as the player answers before it.
export const DIFFICULTY_LEVELS = [0, 1, 2];
export const PLATFORM_WORDS = { 0.75: 'SMALL', 0.875: 'NORMAL', 1: 'MEDIUM', 1.175: 'WIDE', 1.35: 'X-WIDE' };

// GRAVITY: how heavy the Duke is, as a multiple of constants.js GRAVITY [x; 1 is the game as
// it was tuned]. LOW 0.8, NORMAL 0.9 (the default) and HIGH 1.1 since 2026-09-29. The user
// first asked for the row -- "allow for changing gravity options in the settings too" -- and it
// came as LOW 0.8, NORMAL 1 and HIGH 1.2; then, the same day, "i want the new normal to be
// somewhere in the middle between the current normal and the low option. high wlll be made as
// something inbetween normal and hard as its too rough": NORMAL halfway from 1 to LOW, HIGH
// halfway from 1 to the old HIGH. His jump impulses stay as they are, so at g every jump rises
// 1/g as high -- a standing jump 71.3 units at 1, 79.3 at NORMAL, 89.4 at LOW, 64.7 at HIGH --
// and stays up 1/g as long; his fall's cap goes with the root of g (player.js terminalOf). The
// generator's gaps are the reach proof's at 1 (reach.js MAX_EDGE_GAP, 41), and the weakest jump
// there is -- standing, no momentum, steering flat out -- must still cover that gap plus his
// width (57) one floor up: it covers 80.9 at 1, 69.0 at HIGH, 59.3 at 1.2, the heaviest that
// holds, and 55.0 at 1.25 (tools/test-feel.mjs 11). Lighter only reaches more.
// A SIMULATION setting like the three above: fixed for a run when it starts (Game.newRun),
// carried in the replay's header (replaycodec.js gravityCode) and played back at it; a race at
// its GHOST's or the player's, as the player answers before it (ui/replays.js raceOptions,
// main.js startRun). Here and not in constants.js for JUMP SPEED's reason: the step reads the
// run's value, never this list, and the replay fingerprint stays put. A run that does not say
// (Game.newRun, every test's pin) is at 1, the game as tuned.
export const GRAVITIES = [0.8, 0.9, 1.1];
// Every gravity a run has been climbed at, and a word for each: 1 as CLASSIC (the game as tuned,
// the NORMAL until 2026-09-29, and every replay's before the row came) and 1.2 as HEAVY (the old
// HIGH), for the replays climbed at them and the races on those (replaycodec.js reads any of
// these) -- their own words, so an old 1 is never shown as the NORMAL it no longer is.
export const GRAVITIES_KNOWN = [0.8, 0.9, 1, 1.1, 1.2];
export const GRAVITY_WORDS = { 0.8: 'LOW', 0.9: 'NORMAL', 1: 'CLASSIC', 1.1: 'HIGH', 1.2: 'HEAVY' };
// A gravity saved by an older build, moved to the one of its name now (settings.js load).
const GRAVITY_WAS = { 1: 0.9, 1.2: 1.1 };

export const DEFAULTS = {
  scaleMode: 'auto',
  scanlines: true,
  particles: 'high',
  streaks: true,
  shake: true,
  trails: true,
  showFps: false,
  music: true,
  // Not an option the player sets -- a latch the first run trips. It lives here rather
  // than in the stats blob deliberately: Stats.reset() wipes that whole record, which
  // would silently re-trigger the guide for anyone who cleared their stats.
  guideSeen: false,
  // 0 means "every frame the display offers", which is the point of the 160 Hz work.
  // The other values exist for anyone who would rather their machine stayed quiet.
  fpsCap: 0,
  companions: 'hop',
  // See JUMP_SPEEDS and SPEED_V: 1.2, the user's (2026-09-29; 1.4 for a day before it). The
  // simulation's own default, a run whose speed is not said (Game.newRun), stays 1.
  jumpSpeed: 1.2,
  speedV: SPEED_V,
  // See PLATFORM_WIDTHS: NORMAL, the user's choice (SMALL, 0.75, until 2026-09-29).
  platforms: 0.875,
  // See DIFFICULTY_LEVELS: MEDIUM. EASY is the fire the user found "way too slow".
  difficulty: 1,
  // See GRAVITIES: NORMAL, the user's choice (1, the game as tuned, until 2026-09-29).
  gravity: 0.9,
  // The screen canvas's `desynchronized` hint: Chromium's low-latency path, up to a frame
  // less between a key and the screen. On by default, the user's word: "no input lag"
  // (2026-09-28). It was off because an OFFSCREEN window missed a vsync in nine frames with it;
  // a visible window the size of the panel missed one in nine with it or without (the
  // chromium-frame-timing skill), so that was the rig, not the hint. OFF if it stutters.
  lowLatency: true,
  // See TOUCH_KEY_SIZES: how big a phone's on-screen keys are, a fraction of the first cut's.
  touchKeys: 0.8,
};

/**
 * TOUCH KEYS, a phone's on-screen keys' size [fraction of the first cut's; 0.8 by default]. The
 * first cut's were the user's "should be smaller and adjustable in the settings" (2026-09-29,
 * on a Pixel 10): four fifths of them by default, three fifths to thirteen tenths to choose.
 */
export const TOUCH_KEY_SIZES = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3];

export function load() {
  try {
    let raw = localStorage.getItem(KEY);
    let migrating = false;
    if (!raw) {
      raw = localStorage.getItem(KEY_V1);
      if (!raw) return { ...DEFAULTS };
      migrating = true;
    }
    const parsed = JSON.parse(raw);
    if (migrating && parsed.scaleMode === 'integer') parsed.scaleMode = 'auto';
    const out = { ...DEFAULTS, ...parsed };
    // A value written by an older build, or hand-edited, must not put the renderer
    // into a state it has no branch for.
    if (!SCALE_MODES.includes(out.scaleMode)) out.scaleMode = DEFAULTS.scaleMode;
    if (![0, 60, 120, 144].includes(out.fpsCap)) out.fpsCap = DEFAULTS.fpsCap;
    if (!PARTICLE_LEVELS.includes(out.particles)) out.particles = DEFAULTS.particles;
    if (!COMPANION_MOVES.includes(out.companions)) out.companions = DEFAULTS.companions;
    // Exactly one of the offered values: a speed the menu does not list is a speed no replay
    // file can carry (replaycodec.js) and no test has flown.
    if (!JUMP_SPEEDS.includes(out.jumpSpeed)) out.jumpSpeed = DEFAULTS.jumpSpeed;
    // The default's moves, once (SPEED_V above): a 1.4 saved since the move to it, back to 1.2.
    // A save from before that kept its speed then (its 1.2 was that day's default, and is
    // today's) and keeps it now.
    if (!(parsed.speedV >= SPEED_V)) {
      if (parsed.speedV >= 2 && out.jumpSpeed === 1.4) out.jumpSpeed = DEFAULTS.jumpSpeed;
      out.speedV = SPEED_V;
      save(out);
    }
    // A width or a gravity an older build offered, to the one of its name now (PLATFORMS_WAS,
    // GRAVITY_WAS): a player who chose WIDE or HIGH keeps WIDE or HIGH.
    if (PLATFORMS_WAS[out.platforms] !== undefined) out.platforms = PLATFORMS_WAS[out.platforms];
    if (GRAVITY_WAS[out.gravity] !== undefined) out.gravity = GRAVITY_WAS[out.gravity];
    if (!PLATFORM_WIDTHS.includes(out.platforms)) out.platforms = DEFAULTS.platforms;
    if (!DIFFICULTY_LEVELS.includes(out.difficulty)) out.difficulty = DEFAULTS.difficulty;
    if (!GRAVITIES.includes(out.gravity)) out.gravity = DEFAULTS.gravity;
    if (!TOUCH_KEY_SIZES.includes(out.touchKeys)) out.touchKeys = DEFAULTS.touchKeys;
    for (const k of ['scanlines', 'streaks', 'shake', 'trails', 'showFps', 'music', 'guideSeen', 'lowLatency']) {
      out[k] = !!out[k];
    }
    if (migrating) save(out);
    return out;
  } catch (e) {
    console.warn('settings load failed, using defaults:', e);
    return { ...DEFAULTS };
  }
}

/** Latch the first-run guide as seen. Separate from cycle() because it is not a row. */
export function markGuideSeen(settings) {
  settings.guideSeen = true;
  save(settings);
  return settings;
}

export function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); return true; }
  catch (e) { console.warn('settings save failed:', e); return false; }
}

/** The options menu is a flat list; this is its schema. */
export const OPTIONS = [
  // First: the two rows that change how the game PLAYS and how it answers the keys. The user
  // looked for both and could not find them -- "i cant find the jump speed or the low
  // latency" -- ninth and twelfth of thirteen on a screen then titled GRAPHICS. JUMP SPEED says
  // when it applies because a run keeps the speed it started with: a run's replay plays back
  // at one speed.
  { key: 'jumpSpeed', label: 'JUMP SPEED', values: JUMP_SPEEDS,
    show: Object.fromEntries(JUMP_SPEEDS.map((v) => [String(v), Math.round(v * 100) + '%'])),
    note: 'THE SAME JUMPS, FASTER. FROM YOUR NEXT CLIMB' },
  { key: 'platforms', label: 'PLATFORMS', values: PLATFORM_WIDTHS,
    show: Object.fromEntries(PLATFORM_WIDTHS.map((v) => [String(v), PLATFORM_WORDS[v]])),
    note: 'HOW WIDE THE LEDGES ARE. FROM YOUR NEXT CLIMB' },
  { key: 'difficulty', label: 'DIFFICULTY', values: DIFFICULTY_LEVELS,
    show: { 0: 'EASY', 1: 'MEDIUM', 2: 'HARD' },
    note: 'HOW FAST THE FIRE RISES AND HOW CLOSE IT FOLLOWS. FROM YOUR NEXT CLIMB' },
  { key: 'gravity', label: 'GRAVITY', values: GRAVITIES,
    show: Object.fromEntries(GRAVITIES.map((v) => [String(v), GRAVITY_WORDS[v]])),
    note: 'HOW HEAVY HE IS: LOW JUMPS HIGHER, HIGH LOWER. FROM YOUR NEXT CLIMB' },
  { key: 'lowLatency', label: 'LOW LATENCY', values: [true, false],
    show: { true: 'ON', false: 'OFF' }, note: 'UP TO A FRAME LESS INPUT DELAY. OFF IF IT STUTTERS' },
  { key: 'scaleMode', label: 'SCALING', values: SCALE_MODES,
    show: { auto: 'AUTO', integer: 'INTEGER (CRISP)', fill: 'FILL SCREEN (SOFT)' },
    note: 'AUTO IS CRISP WHERE IT CAN BE AND FULL WHERE IT CANNOT' },
  { key: 'particles', label: 'PARTICLES', values: PARTICLE_LEVELS,
    show: { low: 'LOW', medium: 'MEDIUM', high: 'HIGH' },
    note: 'LOWER THIS IF FRAMES DROP' },
  { key: 'streaks', label: 'SPEED STREAKS', values: [true, false],
    show: { true: 'ON', false: 'OFF' }, note: 'THE LINES THAT RUSH UP THE SCREEN' },
  { key: 'trails', label: 'AFTERIMAGES', values: [true, false],
    show: { true: 'ON', false: 'OFF' }, note: 'GHOSTS BEHIND YOU AT SPEED' },
  { key: 'scanlines', label: 'SCANLINES', values: [true, false],
    show: { true: 'ON', false: 'OFF' }, note: 'CRT LOOK' },
  { key: 'shake', label: 'SCREEN SHAKE', values: [true, false],
    show: { true: 'ON', false: 'OFF' }, note: '' },
  { key: 'music', label: 'MUSIC', values: [true, false],
    show: { true: 'ON', false: 'OFF' }, note: 'M MUTES EVERYTHING' },
  { key: 'showFps', label: 'FPS COUNTER', values: [true, false],
    show: { true: 'ON', false: 'OFF' }, note: 'CHECK YOU ARE GETTING 160' },
  { key: 'companions', label: 'COMPANIONS', values: COMPANION_MOVES,
    show: { hop: 'HOP', glide: 'GLIDE' }, note: 'HOP LEDGE TO LEDGE, OR GLIDE ON THE OLD RAIL' },
  { key: 'fpsCap', label: 'FRAME CAP', values: [0, 60, 120, 144],
    show: { 0: 'UNCAPPED', 60: '60 FPS', 120: '120 FPS', 144: '144 FPS' },
    note: 'MENUS ALWAYS CAP THEMSELVES AT 60' },
  // An ACTION row, not a value row. `cycle()` only rotates `values`, and returns without
  // touching the saved settings for a row that has none, so anything with an `action`
  // must be intercepted by the key handler before it reaches cycle -- otherwise
  // selecting it would do nothing at all.
  { key: 'replayGuide', action: 'guide', label: 'HOW TO PLAY', values: null,
    show: null, note: 'REPLAY THE OPENING GUIDE' },
  // Only on a phone, and first there (optionsFor): the size of the keys on its screen. Last in
  // this list so every other row keeps its index on a desktop, where the tools find rows by it.
  { key: 'touchKeys', label: 'TOUCH KEYS', values: TOUCH_KEY_SIZES, touch: true,
    show: Object.fromEntries(TOUCH_KEY_SIZES.map((v) => [String(v), Math.round(v * 100) + '%'])),
    note: 'HOW BIG THE KEYS ON THE SCREEN ARE' },
];

/**
 * The rows the options screen shows: TOUCH KEYS only where there are touch keys, and first there
 * (it is what a phone's player looks for); LOW LATENCY only where the hint can be used at all --
 * not in Android's WebView, where the renderer never turns it on (renderer.js lowLatencyWorks) and
 * the row would be a switch that does nothing. The rest in OPTIONS' order. One list per kind of
 * screen, made once: the screen asks for it every frame.
 */
export function optionsFor({ touch = false, lowLatency = true } = {}) {
  const k = (touch ? 't' : '') + (lowLatency ? 'l' : '');
  let rows = shownRows.get(k);
  if (!rows) {
    const kept = OPTIONS.filter((o) => (!o.touch || touch) && (o.key !== 'lowLatency' || lowLatency));
    rows = [...kept.filter((o) => o.touch), ...kept.filter((o) => !o.touch)];
    shownRows.set(k, rows);
  }
  return rows;
}
const shownRows = new Map();

/**
 * A phone's defaults, once, when the page is first played by touch (main.js): FRAME CAP 60. A
 * phone's panel refreshes 120 times a second and more, 8 ms a frame, and a frame the phone does
 * not finish in time stays on screen twice as long -- the unevenness the user saw on a Pixel 10
 * as "steadily choppy" (2026-09-29). At 60, drawn every second refresh exactly (core/loop.js),
 * every frame has twice the time and is shown as long as the last. Marked done in the save
 * (TOUCH_V), so a player who then chooses UNCAPPED or 120 keeps it.
 */
export function phoneDefaults(settings) {
  if (settings.touchV >= TOUCH_V) return settings;
  settings.fpsCap = 60;
  settings.touchV = TOUCH_V;
  save(settings);
  return settings;
}
const TOUCH_V = 1;

/** Rows that run something instead of holding a value. */
export function actionFor(key) {
  const opt = OPTIONS.find((o) => o.key === key);
  return opt && opt.action ? opt.action : null;
}

export function cycle(settings, key, dir = 1) {
  const opt = OPTIONS.find((o) => o.key === key);
  if (!opt || !opt.values) return settings;   // action rows hold no value to cycle
  const i = opt.values.findIndex((v) => v === settings[key]);
  const n = opt.values.length;
  settings[key] = opt.values[((i + dir) % n + n) % n];
  save(settings);
  return settings;
}

// --- fullscreen -------------------------------------------------------------
// This is the single thing that matters for "why is it a tiny screen". A windowed tab
// loses 100-200 px of height to browser chrome, which at 4K drops the integer scale
// from 2 to 1 -- the game in about a quarter of the screen with bars on all four sides,
// or in AUTO a soft fractional fill. (It was "8 to 7" on the old 480x270 store.)
//
// The desktop shell, when there is one. In a browser there is no such object and every
// path below is the standard API exactly as it was.
//
// It exists because inside an application window the browser answer is wrong rather
// than merely different: the window is already fullscreen, so requestFullscreen is a
// no-op, and document.fullscreenElement is still null -- which would have the menu
// reporting FULLSCREEN: OFF while filling a 4K display.
const shell = () => (typeof window !== 'undefined' ? window.gameShell : null);

export function isFullscreen() {
  const s = shell();
  if (s) return s.isFullscreen();
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

export function toggleFullscreen() {
  const s = shell();
  if (s) { s.toggleFullscreen(); return true; }
  try {
    if (isFullscreen()) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      const el = document.documentElement;
      (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    }
    return true;
  } catch (e) {
    console.warn('fullscreen unavailable:', e);
    return false;
  }
}

/**
 * Ask the shell to close the application. True if it took the request.
 *
 * A browser tab has nothing to ask, and window.close() there is refused for any window
 * a script did not open -- which is why quitGame has a visible fallback for the case
 * where nothing happens.
 */
export function quitApp() {
  const s = shell();
  if (!s) return false;
  s.quit();
  return true;
}
