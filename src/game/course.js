// A race's tower: the ghost's own tower, floor for floor, and the generator it ended with.
//
// A ghost race used to be a new run on the replay's SEED, on the promise that the seed is
// the tower. It is not. The shaft opens with the player's performance (Game's openness from
// floors, combo and momentum, stepped to a whole zoom and ratcheted), and each floor is laid
// out inside the shaft as it stands when that floor is generated (Tower.setBounds; generation
// is sequential). A racer who opens the shaft at another moment than the ghost did gets
// ledges of another width in another place: measured on three seeds with the attract bot as
// the ghost and the same bot pausing now and then as the racer, the towers parted between
// floors 25 and 50 -- all while the shaft was opening -- and 12 to 156 floors differed. The
// ghost then stood on ledges the racer's tower did not have (the replay screens' second
// verifier, review/replay-ui-verify-b/browser-race-1.png). The floors' HEIGHTS agreed; their
// positions and widths did not.
//
// So in a race the racer climbs THE GHOST RUN'S OWN TOWER. race.js re-simulates the ghost's
// run headlessly (CourseSurvey) and keeps every floor it generated -- place, width and kind
// -- with the arena step in force when each was generated and when the ghost first stood that
// high, and the generator as it stood at the end. That is a COURSE (makeCourse, below), and a
// CourseTower serves it: floor n of the race IS floor n of the ghost's run up to the last
// floor the ghost's run generated, and from there the tower goes on as any tower does, from
// the ghost's generator state at its end. (When the ghost was itself a race that did not climb
// to the top of its own course, the rest of that course is its tower too, and comes along:
// its generator's state is the state after THAT course's last floor.)
//
// The shaft: the wider of the racer's own and the ghost's (Game.step asks shaftFor). Never
// the ghost's alone, because the racer's own openness is how the game rewards his momentum,
// and a racer faster than the ghost would otherwise climb in the box a slower run left him;
// and never narrower than the ghost's, because every served floor was laid out inside the
// ghost's shaft as it stood then -- in a narrower one a served ledge would stand in the wall.
// Ratcheted, as every shaft is: a wall never closes on him and no committed floor leaves the
// shaft. Normal runs never build one of these, so their towers are byte for byte what they
// were (tools/test-racetower.mjs hashes seeded runs against pins taken before the race).
//
// A course is data, not state: frozen, and shared by every copy of the game rather than
// copied (snapshot.js shares frozen objects) -- a ten-minute bot run's course is about
// 10,000 floors, and the playback copies the game every ten seconds.

import { Tower, PATTERNS } from './generator.js';
import { FLOOR_H } from './constants.js';

/** A served floor's kind, by the index a course stores. 'ground' is floor 0's alone. */
export const COURSE_KINDS = ['normal', 'wide', 'checkpoint'];

/**
 * A course from its parts, frozen. `x`, `w` and `kind` are indexed by floor, 1..top (0 is the
 * ground, never served). `open[i]` is the first floor the ghost's run generated with the arena
 * at step i + 1 or wider, `reach[i]` the lowest best floor it first stood on with step i + 1 or
 * wider (race.js take: its best floor if the step came in on the step it got there, else the
 * floor above); each is
 * non-decreasing and at most ARENA_STEPS.length - 1 long (a step never reached is left out).
 * `gen` is the generator's state after its last floor: the Rng's word, the pattern (an index
 * into PATTERNS) and what is left of it, the direction, the one-side run, the half it last
 * landed in, the flow tower's direction and run, whether the last pattern turned itself, and
 * whether the tower was a flow tower (attract mode's).
 *
 * `steps` [240 Hz steps] is how long the play that laid the floors out ran: the ghost's run,
 * or -- when the ghost was itself a race that never climbed its whole course -- the longer of
 * that run and its own course's. A file's course may hold no more floors than play that long
 * could have generated (replaycodec.js courseCap). Bounded by the ghost's run alone, a race on
 * a race that ended early refused its own replay: the race A of a 90 s ghost dying at 8 s
 * carried the ghost's 980 floors, the race B on A's replay was surveyed that tower, and B's
 * file claimed 980 floors against 8 s of A's play (a cap of 694) -- "would not load back",
 * the run not kept (the verifier of the race's tower, 2026-09-28).
 */
export function makeCourse({ top, steps, x, w, kind, open, reach, gen }) {
  return Object.freeze({
    top,
    steps,
    x, w, kind,
    open: Object.freeze(open.slice()),
    reach: Object.freeze(reach.slice()),
    gen: Object.freeze({ ...gen }),
  });
}

export class CourseTower extends Tower {
  constructor(seed, course) {
    // At the ghost's own PLATFORMS: the floors past its top are its tower carried on. A course
    // from before the setting was laid out at 1 (replaycodec.js reads it so).
    super(seed, course.gen.flow, course.gen.widthScale || 1);
    this.course = course;
    // The generator as the ghost's run left it. Nothing here draws from it until the racer
    // climbs past course.top, and then floor top + 1 is generated from exactly the state the
    // ghost's tower would have generated it from -- in the racer's shaft, which is at least
    // as wide as the ghost's was (shaftFor). The constructor's own draws above (the two
    // directions) are overwritten with the rest.
    const g = course.gen;
    this.rng.a = g.rng;
    this.pattern = PATTERNS[g.pattern];
    this.patternLeft = g.patternLeft;
    this.dir = g.dir;
    this.sideRun = g.sideRun;
    this.lastHalf = g.lastHalf;
    this.flowDir = g.flowDir;
    this.flowRun = g.flowRun;
    this.selfAlternating = g.selfAlternating;
  }

  /** Floor n: the ghost's, up to the last one its run generated; past it, generated. */
  generate(n) {
    const c = this.course;
    if (n > c.top) return super.generate(n);
    const plat = { n, x: c.x[n], w: c.w[n], y: n * FLOOR_H, kind: COURSE_KINDS[c.kind[n]] };
    this.floors.set(n, plat);
    this.last = plat;
    if (n > this.highest) this.highest = n;
    return plat;
  }

  /**
   * The narrowest arena step (an index into ARENA_STEPS) the race may be at when its best
   * floor is `best`: as wide as the ghost's arena was when it generated the highest floor
   * served so far -- so no served ledge is outside the walls -- and as wide as it was when
   * the ghost first stood that high. Past the course's last floor the floors are the racer's
   * own and ask nothing; the ghost's last arena still holds from its thresholds.
   */
  shaftFor(best) {
    const c = this.course;
    const h = this.highest < c.top ? this.highest : c.top;
    let s = 0;
    while (s < c.open.length && c.open[s] <= h) s++;
    let r = 0;
    while (r < c.reach.length && c.reach[r] <= best) r++;
    return s > r ? s : r;
  }
}
