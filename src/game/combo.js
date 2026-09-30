// Combo tracking.
//
// The brief asked for combos from double and triple jumps and from bouncing between the
// walls. So a combo is not only about floors cleared -- air jumps and wall bounces feed it
// too. Two separate quantities:
//
//   floors  -- how far up the chain carried you. Drives the score quadratically,
//              the way the classic tower climbers do, so a 20-floor chain is worth far more than
//              two 10-floor chains.
//   flair   -- double jumps, triple jumps and wall bounces performed during the
//              chain. Drives a multiplier. Styling it up pays, but it cannot carry
//              a combo on its own.
//
// A combo survives only while each landing gains at least COMBO_MIN_GAIN floors.
// Touching down on the next floor up breaks it. That is the tension.

import { COMBO_MIN_GAIN, CHAIN_FLOOR_POINTS, TRICK_POINTS } from './constants.js';

/**
 * Floors per multiplier step, and what each step is worth. 50 floors = x1.5.
 *
 * The multiplier steps every MULT_STEP floors of an unbroken chain, and the meter on the
 * left fills toward the next step. That ladder is the COMBO's own, and nothing else keys
 * off it any more.
 *
 * It used to be the callout ladder too: every step shouted a word, SWIFT at 50 floors up to
 * GLORY at 350 (the table was here, MILESTONES). The player asked for the seven words to be
 * the TOWER's milestones instead, spread over a whole lap of the zones, so they moved to
 * milestones.js and are keyed to the run's height. A step now pays out without a word: its
 * burst (Game.comboStep), the hop ladder's step mark (render/gamesounds.js), the meter
 * ticking over, the trail changing colour.
 */
export const MULT_STEP = 50;
export const MULT_PER_STEP = 0.5;

/**
 * What a chain of `floors` floors and `flair` tricks pays when it is banked. The rule, and
 * why, is at ComboTracker.scoreFor; it is out here for the stats, which re-score the runs a
 * save from before the rule kept (stats.js load).
 */
export function chainScore(floors, flair) {
  const mult = 1 + MULT_PER_STEP * Math.floor(floors / MULT_STEP);
  return Math.round((floors * CHAIN_FLOOR_POINTS + flair * TRICK_POINTS) * mult);
}

// Re-exported ONLY for audio.js, which imports MILESTONES from here to rank the fanfare
// and name the sample files (the sound pass owns that file and moves its import). Nothing
// in this module reads the height table: the chain's meter and multiplier are the step
// ladder above.
export { MILESTONES } from './milestones.js';

export class ComboTracker {
  // `tiers` is required. It used to default to a copy of the ladder kept in this file,
  // which quietly became a SECOND source of truth: flavour.js was rewritten into a
  // heraldic register and this copy still said NICE, GOOD, GREAT, SUPER. A default that
  // can silently disagree with the real thing is worse than no default.
  constructor(tiers) {
    this.tiers = tiers.slice().sort((a, b) => a.min - b.min);
    this.reset();
  }

  reset() {
    this.active = false;
    this.floors = 0;
    this.flair = 0;
    this.doubles = 0;
    this.triples = 0;
    this.bounces = 0;
    this.chains = 0;
    this.hops = 0;
    this.best = 0;
    this.lastResult = null;
    this.timer = 0;        // drives the on-screen banner decay
    this.stepped = 0;      // the multiplier step the most recent landing reached, if it reached one
    this.peakX = 0;        // highest multiplier reached this chain
    this.groundT = 0;      // seconds stood still since landing; ends the chain
  }

  /**
   * The multiplier the HUD shows: x1, then half a step more for every MULT_STEP floors
   * the chain has climbed.
   *
   * Deliberately the same ladder the meter fills toward and the step payoff fires on
   * (nextStep, stepped), so the number on screen and the moment it ticks over agree. The
   * old on-screen multiplier was `1 + flair * 0.25`, a decimal style bonus that multiplies
   * the final payout -- that still exists and still pays, it is just no longer shown
   * competing with this one.
   */
  get x() { return 1 + MULT_PER_STEP * Math.floor(this.floors / MULT_STEP); }

  /** What the counter shows: floors climbed without breaking the chain. */
  get count() { return this.floors; }

  /**
   * The next multiplier step above the chain's floor count: { x, mult } -- `x` the floor
   * count it arrives at, a multiple of MULT_STEP, and `mult` the multiplier it brings.
   *
   * There is always one. This read the callout table and returned null past its last row,
   * GLORY at 350, and the meter then pinned full and pulsed for the rest of the chain -- while
   * the multiplier went on stepping every 50 floors (x5 at 400, x5.5 at 450) with nothing on
   * the meter to say one was coming. The chain is uncapped, so the ladder is.
   */
  nextStep() {
    const s = Math.floor(this.floors / MULT_STEP) + 1;
    return { x: s * MULT_STEP, mult: 1 + s * MULT_PER_STEP };
  }

  /**
   * How full the meter is, 0..1, as progress from the last multiplier step to the next.
   *
   * It RISES and never drains. There is no combo timer in this game -- combos end by
   * landing short, not by running out of clock -- so a bar that emptied over time would
   * be drawing a mechanic that does not exist. It empties as each step is claimed and fills
   * again toward the next, for as long as the chain lasts (see nextStep): past 350 floors it
   * used to pin full, which drew a meter with nothing left to fill toward on a chain that was
   * still earning a step every 50 floors.
   */
  meterFrac() {
    if (!this.active) return 0;
    return (this.floors % MULT_STEP) / MULT_STEP;
  }

  tierFor(floors) {
    let t = null;
    for (const x of this.tiers) if (floors >= x.min) t = x;
    return t;
  }

  // Score model: points for the chain's floors and for its tricks, each a fixed amount,
  // all of it times the step multiplier the meter shows (x1.5 at 50 floors, x2 at 100 ...).
  // A long chain is worth more than two short ones because the multiplier grows with it:
  // the payout grows as the SQUARE of the chain, as the genre's classics' does.
  //
  // It used to be floors x 60 x the step multiplier x (1 + 0.25 a trick). That last factor
  // was on nothing the player could see and had no top, and a long chain is long in all
  // three at once -- its floors, its multiplier (which grows with them) and its tricks (a
  // bounce or an air jump every five floors or so) -- so a chain paid as the CUBE of its
  // length. A chain held at full momentum lasts as long as the player keeps climbing, and
  // one of 2000 floors banked hundreds of millions; the menu's bot, 3,777,933,653 for 5089.
  // The user, of their own runs, asked for scores of a reasonable size rather than hundreds
  // of millions. A trick ADDS now, and a floor of a chain is worth what a floor climbed is
  // (CHAIN_FLOOR_POINTS, TRICK_POINTS):
  //     10 floors, no tricks, x1         ->        100
  //    125 floors, 25 tricks, x2         ->      3,750
  //    400 floors, 80 tricks, x5         ->     30,000
  //   2000 floors, 400 tricks, x21       ->    630,000
  // so the old awards read true again: SCORE KING at 25,000 is a run with a chain of about
  // 400 floors in it.
  scoreFor(floors, flair) {
    return chainScore(floors, flair);
  }

  /**
   * How many floors the next hop must clear to keep this combo alive.
   *
   * A flat two. The same gain that opens a chain keeps it.
   *
   * It used to ESCALATE, to seven by the end, on the reasoning that at full momentum
   * nothing short of falling could break a chain. That is true and the fix was in the
   * wrong place: it meant a long chain was ended by clearing a merely respectable gap,
   * which is not failing to chain -- it is chaining slightly less well.
   *
   * A chain ends two ways now, and both are things the player DID: standing still (see
   * Game.step) or landing without really climbing. At full momentum neither happens by
   * accident, so a good run holds one chain for hundreds of floors and the multiplier
   * keeps climbing. That is the intent -- it is banked when you finally stop.
   */
  requiredGain() {
    return COMBO_MIN_GAIN;
  }

  onAirJump(which) {
    if (which === 1) this.doubles++; else this.triples++;
    this.flair++;
  }

  /**
   * Time spent standing on a platform. Ends the chain once it runs past the grace.
   *
   * This is the break the game was missing. Combos used to end only by landing short,
   * so at full momentum a chain could not be broken by anything except falling -- you
   * could stand on a platform indefinitely with the multiplier still climbing on screen.
   * A combo is a thing you are DOING; the moment you stop, it is over.
   */
  onGrounded(dt, grace) {
    if (!this.active) return null;
    this.groundT += dt;
    if (this.groundT < grace) return null;
    return this.close();
  }

  /** Left the ground, so the clock stops. */
  onAirborne() {
    this.groundT = 0;
  }

  onWallBounce() {
    this.bounces++;
    this.flair++;
  }

  /** A sustained hold-to-jump chain. Counted separately so the stats can show it. */
  onInstaChain() {
    this.chains++;
    this.flair++;
  }

  // Returns a result object when a combo ENDS (so the game can score and announce it),
  // otherwise null.
  onLand(gain) {
    this.stepped = 0;
    if (gain >= (this.active ? this.requiredGain() : COMBO_MIN_GAIN)) {
      const was = this.floors;
      this.active = true;
      this.floors += gain;
      this.hops++;
      if (this.floors > this.best) this.best = this.floors;
      if (this.x > this.peakX) this.peakX = this.x;
      // Keyed on FLOORS, so a landing could in principle clear two steps at once. It
      // cannot -- a hop gains a dozen floors or so and the steps are fifty apart -- but this
      // reports the HIGHEST step reached rather than the first, so it stays correct if
      // either number ever moves. It used to walk the callout table and stopped at its
      // last row (350); the ladder has no last row.
      const s = Math.floor(this.floors / MULT_STEP);
      if (s > Math.floor(was / MULT_STEP)) this.stepped = s;
      return null;
    }
    return this.close();
  }

  close() {
    if (!this.active || this.floors < COMBO_MIN_GAIN) { this.softReset(); return null; }
    const res = {
      floors: this.floors,
      flair: this.flair,
      doubles: this.doubles,
      triples: this.triples,
      bounces: this.bounces,
      chains: this.chains,
      hops: this.hops,
      peakX: this.peakX,
      tier: this.tierFor(this.floors),
      score: this.scoreFor(this.floors, this.flair),
    };
    this.lastResult = res;
    this.timer = 1.6;
    this.softReset();
    return res;
  }

  softReset() {
    this.active = false;
    this.floors = 0;
    this.flair = 0;
    this.doubles = 0;
    this.triples = 0;
    this.bounces = 0;
    this.chains = 0;
    this.hops = 0;
    this.stepped = 0;
    this.peakX = 0;
  }

  step(dt) { if (this.timer > 0) this.timer -= dt; }
}
