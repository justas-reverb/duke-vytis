// Tower generator.
//
// Every floor gets exactly one platform. Randomness lives in x position, width and
// the pattern currently in play -- never in whether the floor is climbable. Each
// candidate x is clamped through reach.js before it is committed, and then asserted.
// The assert is not decoration: it is the thing that turns "probably fine" into a
// property the test suite can check across millions of floors.

import { Rng } from '../core/rng.js';
import {
  PLAY_L, PLAY_R, FLOOR_H, PLAT_W_MIN, PLAT_W_JITTER,
  NARROW_RATE, NARROW_LATE, NARROW_LATE_AT, NARROW_LATE_TO, ARENA_HALF_MIN, ARENA_HALF_MAX, CX,
  PLAT_FRAC_MIN, PLAT_FRAC_MAX,
  SQUEEZE_FROM, SQUEEZE_PERIOD, SQUEEZE_DEPTH, SQUEEZE_W_MIN, SQUEEZE_CUE_LAG,
} from './constants.js';
import { clampReachable, isReachable, MAX_EDGE_GAP } from './reach.js';
import { bandFor } from './themes.js';

// Exported for a race's course (course.js), which carries the generator's state at the end
// of the ghost's run -- its pattern as an index into this list -- so the tower can go on
// from there when the racer climbs past the ghost's last floor. A new pattern goes on the
// END, so a course names the pattern it named before.
export const PATTERNS = ['zigzag', 'drift', 'cluster', 'scatter', 'stair',
  'chimney', 'slalom', 'gauntlet', 'terrace', 'switchback', 'leapfrog'];

/**
 * A human tower's patterns, each its own SHAPE of climb: how often it is picked (`weight`,
 * against the sum of those open), how many floors it runs (`len`, inclusive), how wide its
 * ledges are against the floor's width (`w`, a range of multipliers on widthFor's base; the
 * +/- PLAT_W_JITTER every ledge used to get is 0.70-1.30), and the floor it is first picked
 * from (`from`).
 *
 * The user asked for more variety in how the ledges are laid out, which had become far too
 * predictable (2026-09-28). The tower had five patterns, picked evenly, 4-11 floors
 * each, every ledge within 30% of one width and set about its own width beside the last.
 * Measured over 1,782 floors of three bot runs (floors 100-700), the eye's best guess of the
 * next step -- the last step again, or the last step reversed -- was out by 0.38 of a step,
 * and half of all turns were a plain zigzag. The six added change the SHAPE of a stretch, not
 * only its numbers: a chimney of narrow ledges straight up; a slalom's S-curve across the
 * shaft; a gauntlet of narrow ledges wandering; terraces, broad ledges a long leap apart; a
 * switchback's runs of three; a leapfrog's long hop and short one. And a pattern never
 * follows itself (nextPattern). How it measured after: docs/TOWER.md.
 *
 * They arrive as the tower is climbed, not from the first floor: the opening zone is the five
 * it always had, and the new shapes come in at the second zone (100), the third (300) and
 * the fourth (500). Everywhere at once, a slalom or a chimney in the opening shaft -- 208
 * wide, its ledges already at PLAT_W_MIN -- put down anyone who stopped: a racer standing
 * still 200 steps of every 480 reached floor 26 on the median of five seeds, where the old
 * tower let him reach 218, and the bot itself fell at floor 10 on one of them.
 *
 * Kept here beside PATTERNS, not in constants.js, because it is keyed by their names. The
 * replay fingerprint's probe runs this generator, so a change here refuses old replays by
 * itself. The flow tower (attract mode's until 2026-09-29) uses none of it (nextPattern,
 * widthFor).
 */
const J = PLAT_W_JITTER;
const SHAPES = {
  zigzag:     { weight: 2, len: [4, 8], w: [1 - J, 1 + J], from: 0 },
  drift:      { weight: 3, len: [4, 10], w: [1 - J, 1 + J], from: 0 },
  cluster:    { weight: 2, len: [3, 7], w: [1 - J, 1 + J], from: 0 },
  scatter:    { weight: 2, len: [4, 9], w: [1 - J, 1 + J], from: 0 },
  stair:      { weight: 2, len: [4, 9], w: [1 - J, 1 + J], from: 0 },
  slalom:     { weight: 2, len: [8, 16], w: [0.8, 1.2], from: 100 },
  terrace:    { weight: 2, len: [4, 8], w: [1.5, 2.0], from: 100 },
  switchback: { weight: 2, len: [6, 12], w: [1 - J, 1 + J], from: 100 },
  leapfrog:   { weight: 2, len: [6, 10], w: [0.75, 1.25], from: 300 },
  chimney:    { weight: 2, len: [4, 7], w: [0.45, 0.65], from: 300 },
  gauntlet:   { weight: 2, len: [5, 9], w: [0.4, 0.6], from: 500 },
};
// The patterns that steer their own way across the shaft, which generate()'s one-side
// breaker leaves alone: a chimney is MEANT to go straight up, and a slalom comes back to the
// middle every four floors by itself. Broken into, they were a floor or two of a chimney or a
// slalom and then the breaker's stair -- measured, the forced stair was the commonest pattern.
const STEERED = new Set(['chimney', 'slalom']);
// What the breaker crosses the shaft BY: the patterns that go one way, open at the height.
// It was always a stair, and the forced stair came to 31% of the tower above floor 100 --
// the commonest shape in it, measured with tools/shot-layout.mjs.
const CROSSINGS = ['stair', 'terrace', 'leapfrog'];

// The slalom's wave: where each floor of an eight-floor period puts a ledge's middle, as a
// share of SLALOM_REACH either side of the shaft's. Literals, not Math.sin: below the squeeze
// the generator is + - * / and rounding, which every JavaScript engine computes to the same
// bit (replay.js, the fingerprint's probe), and a transcendental call here would let a phone
// and a desktop build different towers from one seed. The zeros come every four floors, so a
// slalom never sits four ledges on one side and trips the one-side breaker in generate().
const WAVE = [0, 0.7, 1, 0.7, 0, -0.7, -1, -0.7];
const SLALOM_REACH = 0.3;   // share of the shaft's width the wave swings either side; typical 0.25-0.35

/**
 * How far into a squeeze floor n is: 0 at a crest, 1 at the bottom of a trough, easing
 * between them on a cosine so neither end arrives as a step. Exactly 0 for every floor
 * below SQUEEZE_FROM, which is what keeps the first 2099 floors of every tower
 * byte-for-byte what they were. See SQUEEZE_* in constants.js for why it is keyed to the
 * floor number and not to time.
 *
 * Exported because the game announces the squeeze from the same curve the generator
 * builds it with -- one curve, so the banner cannot disagree with the ledges.
 */
export function squeezeAt(n) {
  if (n < SQUEEZE_FROM) return 0;
  return (1 - Math.cos((2 * Math.PI * (n - SQUEEZE_FROM)) / SQUEEZE_PERIOD)) / 2;
}

/** The multiplier on a platform's width at floor n: 1 at a crest, 1 - DEPTH at a trough. */
export function squeezeFactor(n) {
  return 1 - SQUEEZE_DEPTH * squeezeAt(n);
}

/**
 * Which squeeze announcement is due at floor n, as a count that only ever goes up: -1
 * before the first, then 0, 1, 2, ... EVEN numbers are "it starts to close", ODD ones
 * "it starts to open". The caller remembers the last one it said and speaks when this
 * passes it, so a jump that clears several cue floors at once says only the newest.
 *
 * Each cue sits SQUEEZE_CUE_LAG past its turning point rather than on it. A cosine is
 * flat at both ends, so AT the crest the ledges have not yet visibly changed and the
 * herald would be announcing nothing; fifteen floors on they have. It also keeps the first
 * one off floor 2100 itself, where the zone's own name is being announced.
 */
export function squeezeCue(n) {
  // In whole floors, not fractions of a period: 1.1 - 1 is 0.10000000000000009 in
  // floating point and some other period's remainder comes out a hair under 0.1, which
  // would move a cue by a floor depending on which period it fell in.
  const k = Math.floor(n) - SQUEEZE_FROM;              // floors since the first crest
  const lag = Math.round(SQUEEZE_PERIOD * SQUEEZE_CUE_LAG);
  if (k < lag) return -1;
  const c = Math.floor(k / SQUEEZE_PERIOD);
  const r = k - c * SQUEEZE_PERIOD;                     // floors into this period
  if (r >= SQUEEZE_PERIOD / 2 + lag) return 2 * c + 1;  // past the trough: opening
  if (r >= lag) return 2 * c;                           // past the crest: closing
  return 2 * c - 1;                                     // still the last opening
}

export class Tower {
  /**
   * `flow` generates a tower shaped for a climber that never stops moving: attract mode.
   *
   * The normal generator answers "is every floor reachable from the one below it", which
   * is the right question for a human taking one or two floors at a time. The attract
   * bot takes NINE TO SIXTEEN floors at a time, and across that many floors a platform
   * can be anywhere in the shaft, so its target is effectively randomly placed and it
   * spends the whole run correcting. That correction is what reads as the character
   * braking into a wall and turning round instead of flowing.
   *
   * The geometry very nearly supports something better. A climber at the 430 px/s top
   * speed covers about 45 px of shaft per floor climbed, and the reach cap allows
   * consecutive floors to differ by 41 px -- 92% of it. So a ramp at the maximum legal
   * slope is almost exactly the path a flat-out climber already flies. Flow mode simply
   * generates that ramp: a steady diagonal that reverses when it reaches a wall,
   * with wider ledges for tolerance.
   *
   * It is a legal tower by exactly the same rules -- same clamp, same reachability
   * assert, same suite -- so this is not a cheat mode, it is a tower that happens to
   * suit the way the bot moves. Human play never sees it.
   *
   * Nor, since 2026-09-29, does the title screen: the user asked for it to show the real game
   * in full, so the demo climbs a player's tower (game.js newRun) with a bot
   * rebuilt to survive it. A flow tower is built now only by the replay fingerprint's probe
   * (replay.js), and that is why it stays: its first 1,800 floors are in every replay's
   * fingerprint, so changing or removing it would refuse every replay and race file already
   * saved, and a race course's file carries its bit (course.js).
   */
  /**
   * `widthScale` is the run's PLATFORMS (settings.js PLATFORM_WIDTHS): every ledge's width, and
   * its minimum, times it. 1, the default, is the tower as it always was, floor for floor: the
   * factor multiplies and draws nothing, so a tower at 1 is byte for byte the tower before it.
   */
  constructor(seed, flow = false, widthScale = 1) {
    this.rng = new Rng(seed);
    this.seed = seed;
    this.flow = flow;
    this.widthScale = widthScale;
    this.flowDir = this.rng.chance(0.5) ? 1 : -1;
    this.flowRun = 0;
    this.floors = new Map();          // floorNumber -> platform
    this.highest = 0;
    this.violations = 0;              // must stay 0 forever
    this.pruneMisses = 0;             // asked for a floor that was thrown away

    this.pattern = 'drift';
    this.patternLeft = 0;
    this.dir = this.rng.chance(0.5) ? 1 : -1;
    // How many consecutive floors have sat on the same side of the shaft. A long run
    // of these is what makes a section impossible to combo: with every platform on one
    // side there is no straight to run down, so the meter never fills, so the jumps
    // never clear the two floors a combo needs.
    this.sideRun = 0;
    this.lastHalf = 0;

    // Live arena bounds. The walls only ever move OUTWARD during a run, so a platform
    // that was legal when it was generated stays legal forever. If they could close in,
    // already-committed floors could end up outside the shaft.
    this.lo = CX - ARENA_HALF_MIN;
    this.hi = CX + ARENA_HALF_MIN;

    // Floor 0 is the ground: spans the starting arena, always there, never scored.
    const ground = { n: 0, x: this.lo, w: this.hi - this.lo, y: 0, kind: 'ground' };
    this.floors.set(0, ground);
    this.last = ground;
  }

  /** Widen the shaft. Outward only -- see the constructor. */
  setBounds(lo, hi) {
    if (lo < this.lo) this.lo = Math.max(PLAY_L, lo);
    if (hi > this.hi) this.hi = Math.min(PLAY_R, hi);
    const g = this.floors.get(0);
    if (g) { g.x = this.lo; g.w = this.hi - this.lo; }   // the ground grows with it
  }

  get span() { return this.hi - this.lo; }

  widthFor(n) {
    // Proportional to the room. At the 208 px start that is a 31 px ledge -- about two
    // player-widths, deliberately tiny -- and at the full 448 px shaft it is 112 px.
    // The room and the platforms open out together, which is what makes the early
    // game read as cramped rather than as a staircase of slabs.
    const open = Math.max(0, Math.min(1,
      (this.span - ARENA_HALF_MIN * 2) / (ARENA_HALF_MAX * 2 - ARENA_HALF_MIN * 2)));
    const frac = PLAT_FRAC_MIN + (PLAT_FRAC_MAX - PLAT_FRAC_MIN) * open;
    // A gentle extra squeeze with height so a wide late shaft is not a free ride.
    // Two squeezes, additive. The first is unchanged, so nothing below floor 800 moves;
    // the second keeps closing the shaft the rest of the way up the cycle.
    const late = NARROW_LATE
      * Math.max(0, Math.min(1, (n - NARROW_LATE_AT) / (NARROW_LATE_TO - NARROW_LATE_AT)));
    const squeeze = 1 - NARROW_RATE * Math.min(1, n / 800) - late;
    const base = this.span * frac * squeeze;
    // Past SQUEEZE_FROM the tower breathes: the width is multiplied by a factor that
    // eases down to a trough and back up, over and over (constants.js has the why).
    // Human towers only -- a flow tower never breathes; see squeezes.
    //
    // The floor on width eases with it. PLAT_W_MIN would stop a trough at 32 long before
    // it bit, so at the bottom of a squeeze the minimum is SQUEEZE_W_MIN instead, and at
    // a crest it is PLAT_W_MIN exactly as before. Below SQUEEZE_FROM `sq` is 0, both of
    // these are identities, and the RNG is drawn in the same order -- so no floor under
    // 2100 differs by a single unit.
    const sq = this.squeezeFor(n);
    // A flow tower draws its jitter exactly as it always has; a human tower's ledge is as
    // wide as its pattern's shape says (SHAPES), narrow in a chimney, broad on a terrace.
    const shape = this.flow ? 1 + this.rng.float(-PLAT_W_JITTER, PLAT_W_JITTER)
      : this.rng.float(SHAPES[this.pattern].w[0], SHAPES[this.pattern].w[1]);
    // PLATFORMS: the width and its minimum times the run's factor (1 at MEDIUM, an identity);
    // SQUEEZE_W_MIN stays the floor under every size, 24 against the 20 a landing needs.
    const f = this.widthScale;
    const w = base * shape * f * (1 - SQUEEZE_DEPTH * sq);
    const least = PLAT_W_MIN * f;
    // Floored, so a trough actually reaches SQUEEZE_W_MIN rather than stopping one unit
    // short of it everywhere except the single floor where the cosine is exactly -1.
    const minW = Math.max(SQUEEZE_W_MIN,
      Math.floor(least - (least - SQUEEZE_W_MIN) * sq));
    const cap = Math.max(PLAT_W_MIN, Math.floor(this.span * 0.45));
    // A flow tower gets more forgiving ledges (it was the attract bot's). A wider landing is
    // a landing the bot does not have to steer for, and every pixel of steering it skips is
    // speed it keeps.
    const scale = this.flow ? 1.6 : 1;
    return Math.min(cap, Math.max(minW, Math.round(w * scale)));
  }

  /**
   * Whether this tower breathes at all. The generator's width decisions and the game's
   * banner both ask here, so the ledges and the herald cannot disagree about it.
   *
   * Human towers do; flow towers do not. The squeeze was asked for as a difficulty for
   * the PLAYER, and the flow tower is not the player's tower anyway -- it is already a
   * different shape, a ramp at the steepest legal slope with ledges 1.6x wide, built so
   * the demo of the time ran flawlessly. Squeezing it was tried first and measured: the
   * attract bot of the time reached floor 2100 at about 138 s, and where five of six towers
   * used to carry it through the three-minute window (test-autoplay: mean floor 2694, one
   * death), all six then died in a trough 7-34 s after 2100 (mean 2350, six deaths).
   * Exempt, a flow tower is byte-for-byte the tower it was before the squeeze existed, all
   * the way up, and test-squeeze holds a hash that says so. The squeeze reached the title
   * screen another way on 2026-09-29: the demo left the flow tower for a player's, squeeze
   * and all.
   */
  get squeezes() {
    return !this.flow;
  }

  /**
   * How squeezed floor n is in THIS tower, 0 (crest) to 1 (trough); 0 everywhere in a
   * tower that does not breathe. Every width decision that follows the squeeze asks here.
   */
  squeezeFor(n) {
    return this.squeezes ? squeezeAt(n) : 0;
  }

  /** The pattern for floor n on, and how many floors it runs. */
  nextPattern(n) {
    if (this.flow) {
      // A flow tower is the ramp proposeX lays whatever the pattern is, and these are its three
      // draws exactly as they always were: a flow tower -- its first 1,800 floors in every
      // replay's fingerprint, and under the DEMO_SEEDS picked on one until 2026-09-29 -- is
      // floor for floor what it was before SHAPES.
      this.pattern = this.rng.pick(PATTERNS);
      this.patternLeft = this.rng.int(4, 11);
      if (this.rng.chance(0.5)) this.dir = -this.dir;
      return;
    }
    // By weight, among those open at this height, and never the pattern that has just run:
    // two zigzags back to back are one long zigzag, and a stretch should read as a change.
    const open = (p) => p !== this.pattern && SHAPES[p].from <= n;
    let total = 0;
    for (const p of PATTERNS) if (open(p)) total += SHAPES[p].weight;
    let r = this.rng.float(0, total);
    let next = null;
    for (const p of PATTERNS) {
      if (!open(p)) continue;
      next = p;
      r -= SHAPES[p].weight;
      if (r < 0) break;
    }
    this.pattern = next;
    this.patternLeft = this.rng.int(SHAPES[next].len[0], SHAPES[next].len[1]);
    if (this.rng.chance(0.5)) this.dir = -this.dir;
  }

  // Candidate x BEFORE the reach clamp.
  //
  // Expressed as a signed SEPARATION between the previous platform's facing edge and
  // the new platform's near edge: positive is a gap to jump, negative is an overlap.
  // The first version of this asked for absolute positions, and every zigzag asked for
  // the far wall -- which is always out of reach, so every one of them clamped to
  // exactly the ceiling. 27% of the whole tower sat at one identical gap. Asking for a
  // separation the generator can actually honour makes the clamp the exception again.
  proposeX(n, w, prev) {
    const overlap = Math.min(prev.w, w);
    const R = MAX_EDGE_GAP;
    let sep;
    this.selfAlternating = false;

    if (this.flow) {
      // A steady diagonal at close to the maximum legal slope, reversing at the walls.
      // Deliberately not exactly at the cap: sitting on the clamp makes every floor
      // identical, and the clamp is supposed to be the exception.
      this.selfAlternating = true;
      const step = R * this.rng.float(0.82, 0.98);
      const want = this.flowDir > 0 ? prev.x + prev.w + step : prev.x - w - step;
      if (want < this.lo + 2 || want + w > this.hi - 2) {
        this.flowDir = -this.flowDir;
        this.flowRun = 0;
        return this.flowDir > 0 ? prev.x + prev.w + step : prev.x - w - step;
      }
      this.flowRun++;
      return want;
    }

    switch (this.pattern) {
      case 'zigzag':
        // Alternating sides at near-maximum separation. This is the pattern that
        // produces wall-bounce chains, so it deliberately sits at the far end.
        sep = this.rng.float(R * 0.5, R);
        this.dir = -this.dir;
        this.selfAlternating = true;   // manages its own direction; see generate()
        break;
      case 'stair':
        // A steady march one way: a speed ramp.
        sep = this.rng.float(R * 0.2, R * 0.8);
        break;
      case 'cluster':
        // Heavy overlap. Somewhere to breathe and rebuild momentum.
        sep = -this.rng.float(overlap * 0.3, overlap * 0.85);
        break;
      case 'scatter':
        return this.rng.float(this.lo, this.hi - w);
      case 'chimney': {
        // Straight up: each ledge over the last, a fifth of the way back toward the middle
        // so a chimney drifts off a wall rather than climbing it, and a little off true
        // either way. Its ledges are narrow (SHAPES): a climb of held jumps, or of care.
        this.selfAlternating = true;
        const mid = prev.x + prev.w / 2;
        return mid + (CX - mid) * 0.2 + this.rng.float(-0.08, 0.08) * prev.w - w / 2;
      }
      case 'slalom':
        // An S-curve across the shaft: the ledges' middles on WAVE, eight floors a swing
        // from one side to the other and back. Its phase is the floors left in the pattern,
        // so slaloms start at different points of the swing and need no state a race's
        // course does not already carry; the reach clamp takes what a step cannot make.
        this.selfAlternating = true;
        return CX + this.span * SLALOM_REACH * WAVE[this.patternLeft % WAVE.length] - w / 2;
      case 'gauntlet':
        // Narrow ledges (SHAPES) wandering: each a short hop or a small overlap from the
        // last, turning or not on a coin. Nothing to run down; a stretch of care.
        sep = this.rng.float(-overlap * 0.3, R * 0.6);
        if (this.rng.chance(0.5)) this.dir = -this.dir;
        break;
      case 'terrace':
        // Broad ledges (SHAPES) a long leap apart, one way: somewhere to run, and a jump at
        // the end of every run.
        sep = this.rng.float(R * 0.55, R);
        break;
      case 'switchback':
        // Three floors one way, then three back: a Z up the shaft.
        if (this.patternLeft % 3 === 2) this.dir = -this.dir;
        sep = this.rng.float(R * 0.25, R * 0.75);
        break;
      case 'leapfrog':
        // A long hop, then a short one that lands back over the last ledge's edge, and on:
        // one way, in a rhythm.
        sep = this.patternLeft % 2 === 0 ? this.rng.float(R * 0.7, R) : -this.rng.float(overlap * 0.2, overlap * 0.6);
        break;
      case 'drift':
      default:
        sep = this.rng.float(-overlap * 0.5, R * 0.5);
        break;
    }

    return this.dir > 0 ? prev.x + prev.w + sep : prev.x - w - sep;
  }

  generate(n) {
    const prev = this.floors.get(n - 1) || this.last;

    if (this.patternLeft <= 0) this.nextPattern(n);
    this.patternLeft--;

    // Break a one-sided run before it becomes a wall of ledges. Forcing the direction
    // does not break reachability -- clampReachable still caps each step, so this just
    // makes the tower cross the shaft at the fastest legal rate instead of hugging.
    if (this.sideRun >= 4 && !STEERED.has(this.pattern)) {
      this.dir = this.lastHalf > 0 ? -1 : 1;
      // A flow tower crosses by a stair and draws nothing here, as it always has.
      if (this.flow) this.pattern = 'stair';
      else {
        const open = CROSSINGS.filter((p) => SHAPES[p].from <= n);
        this.pattern = this.rng.pick(open);
      }
      this.selfAlternating = false;
      this.patternLeft = Math.max(this.patternLeft, 3);
    }

    let w, x, kind = 'normal';

    // Every theme boundary gets a wide landing. It reads as an achievement, and it
    // guarantees a sane starting point for the zone it opens -- 200 floors, or 100 for
    // the first -- regardless of what the pattern was doing when it got there. Asked of
    // the schedule, not a modulo:
    // the opening zone is a different length and a modulo misplaces every later boundary.
    if (bandFor(n).into === 0) {
      w = Math.min(260, Math.floor(this.span * 0.72));
      x = Math.round(CX - w / 2);
      kind = 'checkpoint';
      this.patternLeft = 0;
    } else {
      w = this.widthFor(n);
      x = Math.round(this.proposeX(n, w, prev));
      // Occasional wide platform so a long narrow stretch never becomes a grind.
      //
      // Inside a squeeze the bonus shrinks by the same factor as the ledges do. A flat
      // +55 on a 24-unit trough ledge is a 79-unit slab, more than three times its
      // neighbours, arriving one floor in seventeen -- two or three of those in every
      // trough would be the trough switched off. Scaled, a wide ledge in a trough is
      // about +15: still visibly the kindest ledge in sight, still somewhere to gather
      // yourself, but not a way out of the squeeze. The CHANCE is left alone, so the
      // rhythm of relief is the same everywhere and only its size changes; and at a
      // crest, and on every floor below SQUEEZE_FROM, the factor is 1 and this is the
      // flat +55 it always was.
      if (this.rng.chance(0.06)) {
        const bonus = Math.round(55 * this.widthScale * (1 - SQUEEZE_DEPTH * this.squeezeFor(n)));
        w = Math.min(w + bonus, Math.floor(this.span * 0.66));
        kind = 'wide';
      }
    }

    // Clamp, then round, then clamp again to INTEGER walls. The shaft edges are
    // fractional because the arena lerps open, so rounding after the clamp could push
    // a platform a fraction of a pixel back outside the wall it was just clamped to.
    const iLo = Math.ceil(this.lo);
    const iHi = Math.floor(this.hi);
    x = Math.round(clampReachable(x, w, prev, this.lo, this.hi));
    x = Math.max(iLo, Math.min(iHi - w, x));

    // Turn around at the walls. A 'stair' or 'drift' run holding one direction walks
    // into a wall after four or five floors and then every remaining platform in the
    // pattern clamps flush against it -- dozens of identical ledges stacked up one edge
    // of the screen, which looks like a bug even though it is perfectly climbable.
    //
    // Skipped for zigzag, which flips direction itself every floor: flipping again here
    // cancelled that out and turned the one pattern that is supposed to cross the shaft
    // into the worst offender, 33 floors against the same wall.
    if (!this.selfAlternating
        && ((this.dir > 0 && x + w >= PLAY_R - 1) || (this.dir < 0 && x <= PLAY_L + 1))) {
      this.dir = -this.dir;
    }

    const plat = { n, x, w, y: n * FLOOR_H, kind };

    if (!isReachable(prev, plat)) {
      // Should be unreachable code. If the clamp ever fails, fall back to sitting
      // directly above the previous platform, which is trivially climbable.
      this.violations++;
      plat.x = Math.max(this.lo, Math.min(this.hi - w, prev.x + (prev.w - w) / 2));
    }

    // Track which half of the shaft this floor landed in. The dead band around the
    // centre stops a platform that straddles the middle from counting as either side.
    const c = plat.x + plat.w / 2;
    const band = this.span * 0.08;
    const half = c < CX - band ? -1 : (c > CX + band ? 1 : 0);
    if (half !== 0 && half === this.lastHalf) this.sideRun++;
    else { this.sideRun = half !== 0 ? 1 : 0; this.lastHalf = half; }

    this.floors.set(n, plat);
    this.last = plat;
    if (n > this.highest) this.highest = n;
    return plat;
  }

  // Ensure everything up to floor n exists. Generation is strictly sequential
  // because each floor's legality depends on the one below it.
  ensure(n) {
    for (let i = this.highest + 1; i <= n; i++) this.generate(i);
  }

  /**
   * Render-only lookup. Returns null for a pruned floor WITHOUT recording a miss:
   * during the death fall the view legitimately passes through floors below the rising
   * line, which are gone on purpose. Collision must use get(), not this.
   */
  peek(n) {
    if (n < 0) return null;
    if (!this.floors.has(n)) {
      if (n <= this.highest) return null;
      this.ensure(n);
    }
    return this.floors.get(n);
  }

  get(n) {
    if (n < 0) return null;
    if (!this.floors.has(n)) {
      if (n <= this.highest) {
        // This floor was generated and then pruned, and generation is sequential so it
        // cannot be recreated. Returning nothing means the player falls through empty
        // space. Counted rather than thrown so the test suite can assert it never
        // happens, and so a live game degrades instead of crashing.
        this.pruneMisses++;
        return null;
      }
      this.ensure(n);
    }
    return this.floors.get(n);
  }

  // Drop platforms the player can provably never reach again.
  //
  // This used to prune below the CAMERA, which was safe only while the camera could
  // not descend. Now that it follows the player down, a fall would drop them into
  // floors that had already been thrown away -- no collision, no platforms, straight
  // through the world. The caller passes the rising floor instead, which is the real
  // point of no return.
  prune(belowFloor) {
    if (belowFloor < 8) return;
    const cut = belowFloor - 8;
    for (const k of this.floors.keys()) {
      if (k > 0 && k < cut) this.floors.delete(k);
    }
  }
}
