// The seven grand callouts, and the heights they are shouted at.
//
// WHAT THIS REPLACED. The callouts were the COMBO's: one per multiplier step, every 50
// floors of an unbroken chain, SWIFT at 50 up to GLORY at 350 (combo.js MILESTONES). So a
// player who never held a chain past 50 never heard one, a player who did heard all seven
// in the first five hundred floors of the tower and then nothing for the rest of the run,
// however high it went -- and the word said nothing about where he was. The player asked
// for them spread over the whole tower instead, as its big milestones: the seven words
// spaced evenly up one full lap of the zones, GLORY at the very top of ZENITH, and on every
// lap after the first the same seven again with a prestige badge beside the word, x2 on
// the second lap, x3 on the third, for a Duke who has not died yet.
//
// So they are keyed to the RUN'S HEIGHT -- the highest floor reached, which only rises --
// and each fires once per lap: falling back through one never fires it again, and the
// same word comes back only on the next lap, CYCLE_FLOORS higher. The combo keeps its
// meter, its x1.5 step every MULT_STEP floors, its multiplier and its coloured numbers
// (combo.js); it simply no longer shouts a word.
//
// Nothing here is a literal floor count. The lap is CYCLE_FLOORS (themes.js: the opening
// zone plus eleven full ones), and the seven stand at k/7 of it, rounded to CALLOUT_ROUND.

import { CYCLE_FLOORS } from './themes.js';
import { CALLOUT_ROUND } from './constants.js';

/**
 * The words, in the order the climb meets them. They were chosen as a combo ladder -- each
 * heavier, hotter and brighter than the one before -- and that order still reads as a
 * climb: SWIFT low in the tower, GLORY at its top. Each has its own painter
 * (render/calloutpaint/).
 */
export const CALLOUT_WORDS = ['SWIFT', 'CHARGE', 'SOARING', 'RAMPAGE', 'CRUSADE', 'THUNDER', 'GLORY'];
const N = CALLOUT_WORDS.length;

/**
 * The floor, within one lap, that the k-th word (1-based) stands at: k/N of the lap,
 * rounded to the nearest CALLOUT_ROUND so the numbers are ones a player can remember --
 * 330, 660, 990, 1310, 1640, 1970, 2300 for the 2300-floor lap. The last is pinned to the
 * lap's own top rather than rounded, because GLORY is promised at the top of ZENITH and a
 * lap that was not a multiple of CALLOUT_ROUND would round it off the top.
 */
export function lapFloor(k) {
  if (k >= N) return CYCLE_FLOORS;
  return Math.round((k * CYCLE_FLOORS) / N / CALLOUT_ROUND) * CALLOUT_ROUND;
}

/**
 * One row per word: `k` its place (1 = SWIFT), `x` the floor within a lap it fires at, and
 * `name`. `x` keeps the name the combo table used for its floor count, because audio.js
 * picks the fanfare and names the sample files from MILESTONES[i].x (see combo.js, which
 * re-exports this table for it): milestoneIndex(x) gives 0 (SWIFT) to 6 (GLORY), and the
 * files are milestone330 ... milestone2300. This said "the ranks come out 0 3 5 6 7 8 9 as
 * before": that was milestoneRank, a logarithmic rank of the combo's floor count, which
 * the effects' rewrite (2353eb4) had already replaced with the index before this table
 * moved here.
 */
export const MILESTONES = CALLOUT_WORDS.map((name, i) => ({ k: i + 1, x: lapFloor(i + 1), name }));

/**
 * The absolute floor of callout number `n`, counted from the ground over every lap: n = 0
 * is lap 1's SWIFT, n = N lap 2's SWIFT. Lap L (1-based) fires the same seven at
 * (L - 1) * CYCLE_FLOORS + x.
 */
export function calloutFloor(n) {
  return Math.floor(n / N) * CYCLE_FLOORS + MILESTONES[n % N].x;
}

/**
 * Which callouts a climb crosses. `n` is the next one due, counted from the ground (see
 * calloutFloor), so the lap and the word are both read off it and nothing can fire twice:
 * it only ever moves up.
 */
export class HeightMilestones {
  constructor() { this.reset(); }

  reset() { this.n = 0; }

  /** The lap the next callout belongs to, 1-based: 1 until GLORY has fired, then 2... */
  get lap() { return Math.floor(this.n / N) + 1; }

  /** The next callout due: { k, x, name, lap, floor }. */
  get next() { return this.entry(this.n); }

  entry(n) {
    const m = MILESTONES[n % N];
    return { k: m.k, x: m.x, name: m.name, lap: Math.floor(n / N) + 1, floor: calloutFloor(n) };
  }

  /**
   * The run's best floor rose from `was` to `now`. Returns the callout that rise crossed,
   * or null.
   *
   * Callouts at or below `was` are passed SILENTLY first. In play `was` is the previous best
   * and they have all fired already; but a tool that stands the Duke on floor 2625 writes the
   * best floor directly, and the first landing above it would otherwise fire all seven of the
   * first lap at once (or GLORY, taking the highest) over a frame that was meant to show
   * something else -- the staged-scene trap the companions' greetings fell into.
   *
   * A rise that crosses more than one (the callouts are over three hundred floors apart and a
   * hop at full tilt gains a dozen or so -- the attract bot's reached 2312 from under 2300 --
   * so only a tool can) returns the highest, as the combo's did.
   */
  climb(was, now) {
    while (calloutFloor(this.n) <= was) this.n++;
    let hit = null;
    while (calloutFloor(this.n) <= now) hit = this.entry(this.n++);
    return hit;
  }
}
