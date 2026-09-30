// Combo tiers and one-liners.
//
// Rewritten in a heraldic, archaic register. The first set was drafted by the local
// Qwen model and curated, and it was written for a generic bouncing man: POGO STICK
// SIMULATION, BOOTS DOING NUMBERS, KEEP IT GOING CHAMP. The character is now a crowned
// Lithuanian grand duke carrying his own coat of arms, and the milestone words had
// already drifted into a grander register than the taunts, so the two were fighting.
//
// Lengths are capped by tools/test-flavour.mjs -- 22 for a taunt, 28 for a death line,
// 24 for an idle nag -- because the banner is drawn in a 5x7 bitmap font
// across a 480-unit screen and anything longer runs off the edge.

// SIX characters is the hard cap, and it is a layout constraint rather than a stylistic
// one. The COMBOS BY TIER chart on the stats page gives each bar forty pixels on a
// forty-three pixel pitch, and the 5x7 font puts six characters in thirty-five -- which
// leaves eight pixels of air between one label and the next. Seven characters fit the
// bar but not the gap, and the row read as DOUGHTYVALIANTGALLANT. The first heraldic
// pass used PUISSANT and SOVEREIGN, which the chart silently sliced to PUISSA and
// SOVERE. test-flavour enforces six.
export const COMBO_TIERS = [
  { min: 2,  name: 'FAIR' },
  { min: 3,  name: 'WORTHY' },
  { min: 5,  name: 'BOLD' },
  { min: 8,  name: 'BRAVE' },
  { min: 12, name: 'NOBLE' },
  { min: 17, name: 'LORDLY' },
  { min: 23, name: 'REGAL' },
  { min: 30, name: 'AUGUST' },
  { min: 40, name: 'DIVINE' },
  { min: 55, name: 'ETERNE' },
];

// Encouragement. Second person and archaic -- he is being addressed by his own herald.
export const TAUNTS = [
  'THE WALL DOTH YIELD',
  'AIR IS THY VASSAL',
  'BORNE UPON NOTHING',
  'THE TOWER MARKS THEE',
  'STILL ALOFT MY LORD',
  'THE CHASE IS THINE',
  'THY BANNER RISES',
  'NO FLOOR HOLDS THEE',
  'THE STONE KNOWS THEE',
  'ASCEND AND ASCEND',
  'LEAP AS THE VYTIS',
  'THE HEIGHTS ATTEND',
  'WELL STRUCK YOUR GRACE',
  'SPURN THE EARTH',
  'RECKON NOT THE FALL',
  'SWIFT AND GAINING',
  'HIGHER BY THY LEAVE',
  'THE CROWN SITS WELL',
  'GRAVITY KEEPS NO LORD',
  'ONWARD GRAND DUKE',
];

export const DEATH_LINES = [
  'THE EARTH CLAIMS ITS DUE',
  'SO FALLS THE GRAND DUKE',
  'GRAVITY KEEPS NO VASSALS',
  'THE STONE WAS PATIENT',
  'THY CHASE IS ENDED',
  'DOWN AND DOWN AND DOWN',
  'THE TOWER KEEPS RECKONING',
  'A LONG DESCENT MY LORD',
  'THE GROUND MADE ITS CLAIM',
  'NO BANNER FLIES HERE',
  'THE DEPTHS SALUTE THEE',
  'THUS ENDS THE ASCENT',
  'THE FLOOR ANSWERED',
  'FALLEN BUT NOT FORGOTTEN',
  'THE CROWN ROLLS FREE',
];

export const IDLE_LINES = [
  'THE TOWER AWAITS THEE',
  'STILLNESS BEFITS NONE',
  'MOVE YOUR GRACE',
  'A STATUE OF THY MAKING',
  'THE STONE GROWS COLD',
  'DOST THOU SLEEP STANDING',
  'THE HEIGHTS GROW WEARY',
  'NO GROUND IS WON THUS',
  'THY BANNER HANGS LIMP',
  'THE CHASE AWAITS',
];

// The squeeze. Past floor 2100 the ledges narrow and widen again on a long cycle (see
// SQUEEZE_* in constants.js), and the herald says so once each way: as a squeeze begins
// to close, and as it begins to let go. Only one line each time -- it is a warning and a
// relief, not a running commentary -- through the same small banner the taunts use, so
// the same 22-character cap applies. "Strait is the way" is Matthew 7:14 in the King
// James, which is the register this whole climb is written in.
export const SQUEEZE_CLOSING = [
  'STRAIT IS THE WAY',
  'THE LEDGES DWINDLE',
  'THE TOWER NARROWS',
  'TREAD LIGHTLY MY LORD',
];

export const SQUEEZE_OPENING = [
  'THE STONE RELENTS',
  'THE LEDGES WIDEN',
  'THE WAY OPENS AGAIN',
  'ROOM TO STAND MY LORD',
];

/**
 * What the HUD says while the speed meter is pinned and the air jumps with it: the double
 * jump, or TRIPLE JUMP READY once the live combo has climbed TRIPLE_COMBO_FLOORS and the
 * third is banked with it at the next takeoff (Player.tripleUnlocked). It said AIR JUMP
 * READY either way, so the third jump -- the reward for a 250-floor chain -- was only ever
 * found by accident; the user asked for the double jump's text to give way to one that says
 * the triple is ready (2026-09-28). The tutorial's gauge says the same.
 */
export const AIR_JUMP_READY = 'AIR JUMP READY';
export const TRIPLE_JUMP_READY = 'TRIPLE JUMP READY';
export function airJumpWords(player) {
  return player.tripleUnlocked ? TRIPLE_JUMP_READY : AIR_JUMP_READY;
}

/**
 * The herald at the ASCENSION (Game.ascend), a pair per lap beaten: said, then what it
 * does. No numbers: they said BOUNCE X2 and X4, the constants' own, and went wrong the day
 * the constants moved to a tenth a lap (constants.js ASCENSION). The HUD's line says the
 * numbers (ascentWords), from the constants themselves, and tools/test-ascension.mjs holds
 * both: these free of any, that one to ASCENT_BOUNCE and ASCENT_SPEED.
 */
export const ASCENT_LINES = [
  ['THOU ART ASCENDED', 'HIGHER AND SWIFTER'],
  ['ASCENDED ONCE MORE', 'HIGHER STILL, SWIFTER'],
];

/**
 * The HUD's line for an ascended Duke (hud.js, top centre): his bounce and his clock, as
 * multiples, to two places -- 1.1 ** 2 is 1.2100000000000002 in floating point, and the HUD
 * says X1.21. '' before he has beaten ZENITH.
 */
export function ascentWords(level, bounce, speed) {
  if (!(level > 0)) return '';
  const two = (x) => Math.round(x * 100) / 100;
  return `BOUNCE X${two(bounce ** level)}  SPEED X${two(speed ** level)}`;
}

export function pickLine(list, rnd = Math.random) {
  return list[Math.floor(rnd() * list.length)];
}
