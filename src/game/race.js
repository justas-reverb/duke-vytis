// Racing a ghost: the tower the race is run on, where the ghost of a recorded run is, and how
// far ahead of it you are.
//
// A race is a real run on the replay's seed with that run's Duke drawn from its ghost track
// (replay.js ghostAt) -- no second simulation while it races, so a ghost races whether or not
// this build can play its replay.
//
// THE TOWER IS THE GHOST RUN'S OWN. It used to be only "the same seed", on the promise that a
// seed is a tower. It is not: a floor is laid out at the width the shaft has when it is
// generated, and the shaft opens with the player's own climb, so a racer who opened it at
// another moment than the ghost did got ledges of another width and place -- the ghost stood
// on ledges his tower did not have (course.js has the measurements). So when this build plays
// the replay, the race is run on the ghost's tower itself: CourseSurvey re-simulates the
// replay headlessly and keeps every floor its run generated, with the arena it was laid out
// in, and the game serves them (Game.newRun(seed, course, speed)). A replay this build cannot play
// (GHOST ONLY: another build's fingerprint, or one whose survey disagreed with its own
// checksums) is still raced on its seed, as before, and the readout says the ledges may
// differ. The floors' HEIGHTS always agree, and that is what the race is counted in.
//
// The survey is simulation work -- ~0.7 M steps a second headless with no particles, so
// ~40 ms for a 90 s run and ~0.2 s for a ten-minute bot run -- and it is run on a budget a frame,
// before the race starts (ui/replays.js), never in one frame.
//
// Nothing here draws. The race's time is the live run's recorded climb (Recorder.time, slow
// motion NOT applied), as ghostAt asks; game.elapsed would drift from the ghost at every big
// combo's slow motion. Only the survey's budget reads the clock, and it is not simulation.

import { ghostAt, durationOf, createPlayback } from './replay.js';
import { ARENA_STEPS } from './game.js';
import { PATTERNS } from './generator.js';
import { makeCourse, COURSE_KINDS } from './course.js';
import { FLOOR_H, CX, PLAY_R, PLAYER_W } from './constants.js';
import { IDLE_CYCLE, RUN_CYCLE } from '../render/sprites.js';

/** The poses he is drawn in only while he stands on a ledge (Renderer's pose choice). */
const STANDING = new Set([...IDLE_CYCLE, ...RUN_CYCLE, 'land']);

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** The arena step whose shaft ends at `hi` (a tower's right wall; the shaft is centred). */
function stepAt(hi) {
  let s = 0;
  while (s + 1 < ARENA_STEPS.length && Math.min(PLAY_R, CX + ARENA_STEPS[s + 1].half) <= hi + 1e-9) s++;
  return s;
}

/**
 * The ghost's tower, found by playing its replay: `new CourseSurvey(replay)`, then
 * `run(budgetMs)` once a frame until it returns true; then `course` is the course (course.js),
 * or null with `error` saying why (a replay this build cannot play, or one whose run did not
 * play back as recorded -- its checksums disagreed -- and so whose tower is not known).
 *
 * The floors are taken as the run generates them (it prunes them behind it), and each one's
 * arena step is logged by the tower itself in the moment it lays the floor out: within one
 * step a floor may be generated before the arena update (the Duke's own collision, the
 * companions' look ahead) or after it (the look ahead above the view), and only the tower
 * knows which shaft it used.
 */
export class CourseSurvey {
  constructor(replay) {
    this.replay = replay;
    this.course = null;
    this.error = null;
    this.done = false;
    this.ms = 0;          // spent in run(), all frames together
    this.frames = 0;      // run() calls
    this.worstMs = 0;     // the longest run() call
    // With no particles: the pool is cosmetic -- nothing simulated reads it, and a playback
    // may run on any budget with the same climb (replay.js) -- and it is most of a step's cost:
    // a ten-minute replay surveyed in 0.18 s instead of 0.45 s, measured, the checksums agreeing.
    const r = createPlayback(replay, { particleBudget: 0 });
    if (!r.ok) { this.fail(r.error); return; }
    const pb = this.pb = r.playback;
    // Nothing seeks this playback: its copies of the game every ten seconds would be work
    // (and memory) for nothing.
    pb.keyframesOk = false;
    const t = pb.game.tower;
    this.x = []; this.w = []; this.kind = []; this.step = [];
    this.reach = [];
    this.bestBefore = pb.game.run.maxFloor;
    // newRun generated the first floors before the survey could watch, in the opening shaft.
    for (let n = 1; n <= t.highest; n++) this.step[n] = stepAt(t.hi);
    const log = this.step;
    const base = Object.getPrototypeOf(t);
    const watched = Object.create(base);
    watched.generate = function generate(n) {
      const p = base.generate.call(this, n);
      log[n] = stepAt(this.hi);
      return p;
    };
    Object.setPrototypeOf(t, watched);
    this.got = 0;
    this.take();
  }

  fail(why) {
    this.error = String(why || 'the run could not be played');
    this.course = null;
    this.done = true;
  }

  /** The floors generated since the last look, and the arena the ghost stands in. */
  take() {
    const g = this.pb.game, t = g.tower;
    for (let n = this.got + 1; n <= t.highest; n++) {
      const p = t.floors.get(n);
      if (!p) { this.fail('its tower lost a floor'); return; }
      this.x[n] = p.x; this.w[n] = p.w; this.kind[n] = COURSE_KINDS.indexOf(p.kind);
      this.got = n;
    }
    // The arena's steps against the ghost's best floor, as course.js shaftFor reads them: the
    // lowest best floor at which the ghost first stood in step i + 1 or wider. A step that came
    // in on the step its best floor did holds from that floor. One that came in later -- the
    // ease crosses its midpoint in the air, as most do -- holds from the floor above: the ghost
    // first stood on this one in the old arena. Kept as the best floor alone, every race
    // opened each step one floor early, a few steps before the ghost had, and a racer who
    // climbed exactly as the ghost did parted from it (test-racetower 4: at 1.8 s on 777).
    const best = g.run.maxFloor;
    while (this.reach.length < g.arenaStep) this.reach.push(best > this.bestBefore ? best : best + 1);
    this.bestBefore = best;
  }

  /** Survey on for up to `budgetMs` [ms]; true once it is done (see course and error). */
  run(budgetMs = Infinity) {
    if (this.done) return true;
    const pb = this.pb, steps = this.replay.steps;
    const t0 = now();
    // The clock every 128 game steps of work, as a seek reads it (Playback.seekStep): one
    // playback step can replay a whole menu visit.
    let mark = pb.work, out = false;
    while (pb.k < steps) {
      if (!pb.step()) break;
      this.take();
      if (this.done) break;
      if (pb.desync) { this.fail('its run did not play back as it was recorded'); break; }
      if (pb.work - mark >= 128) {
        mark = pb.work;
        if (now() - t0 >= budgetMs) { out = true; break; }
      }
    }
    if (!out && !this.done) this.finish();
    const dt = now() - t0;
    this.ms += dt;
    this.frames++;
    if (dt > this.worstMs) this.worstMs = dt;
    return this.done;
  }

  finish() {
    const pb = this.pb, t = pb.game.tower;
    if (pb.desync || pb.k !== this.replay.steps) { this.fail('its run did not play back as it was recorded'); return; }
    // A race's replay was run on a course of its own, and its racer may not have climbed to
    // the top of it: the floors it was never served are still its tower -- they are the ones
    // its generator's state, the course's end state, comes after -- so they go on, laid out
    // in the arena their own course says, and the next racer gets them rather than a tower
    // regenerated from a state that belongs to the course's last floor, not to the racer's.
    const inner = t.course || null;
    const top = inner && inner.top > this.got ? inner.top : this.got;
    const x = new Float64Array(top + 1), w = new Float64Array(top + 1), kind = new Uint8Array(top + 1);
    const open = [];
    for (let n = 1; n <= top; n++) {
      let s = 0;
      if (n <= this.got) {
        x[n] = this.x[n]; w[n] = this.w[n];
        if (this.kind[n] < 0) { this.fail('its tower has a floor of an unknown kind'); return; }
        kind[n] = this.kind[n];
        s = this.step[n];
      } else {
        x[n] = inner.x[n]; w[n] = inner.w[n]; kind[n] = inner.kind[n];
      }
      // A floor its own course served was laid out in THAT course's arena, and the race's shaft
      // came up to it in the step that served it (Game.widenForCourse, after the look ahead) --
      // not always before the moment the tower logged it: take the wider of the two, or the
      // course says a ledge stands in a shaft narrower than itself (and a file of it would be
      // refused, rightly: the decoder holds every floor to its shaft).
      if (inner && n <= inner.top) {
        let k = 0;
        while (k < inner.open.length && inner.open[k] <= n) k++;
        if (k > s) s = k;
      }
      while (open.length < s) open.push(n);
    }
    this.course = makeCourse({
      top, x, w, kind, open, reach: this.reach,
      // The play these floors were laid out in: this run's, and the course it was served's when
      // that one comes along above it (course.js; a file's course is bounded by it).
      steps: Math.max(this.replay.steps, inner ? inner.steps : 0),
      gen: {
        rng: t.rng.a >>> 0, pattern: PATTERNS.indexOf(t.pattern), patternLeft: t.patternLeft,
        dir: t.dir, sideRun: t.sideRun, lastHalf: t.lastHalf, flowDir: t.flowDir, flowRun: t.flowRun,
        selfAlternating: !!t.selfAlternating, flow: !!t.flow, widthScale: t.widthScale || 1,
      },
    });
    this.done = true;
    // The playback and its game are done with: let them go.
    this.pb = null;
    this.x = this.w = this.kind = this.step = null;
  }
}

/**
 * When the ghost's run ends -- the fire took it -- it does not fall with the fire and it does
 * not vanish: it STANDS AT ITS LAST FLOOR, the highest it landed on, where it last stood
 * there, breathing in the idle cycle. Two reasons. The track holds no fall (the recorder
 * stops sampling in the step the fire takes him), so a falling ghost would be a fall made
 * up here; and a ghost that dropped off the bottom of the screen a second after its death
 * would leave the racer nothing to race, where one standing on its best floor is the mark
 * to beat for the rest of the run -- climb past it and you have won. It goes out where the
 * fire caught it over GHOST_OUT seconds and comes back up on its floor over GHOST_IN, so it
 * never jumps across the screen.
 */
export const GHOST_OUT = 0.35;   // s
export const GHOST_IN = 0.35;    // s

export class Race {
  /**
   * `replay`: the run raced (a replay, or what replay.js ghostOf keeps of one). `ghostOnly`:
   * the race is on the seed alone, not on the ghost's own tower, and its ledges may differ.
   * `course`: the ghost's own tower when the race is on it (course.js), whose last ledge the
   * ghost stands on after its run.
   */
  constructor(replay, { ghostOnly = false, course = null } = {}) {
    this.replay = replay;
    this.ghostOnly = !!ghostOnly;
    this.seed = replay.header.seed >>> 0;
    this.duration = durationOf(replay);
    const g = replay.ghost, q = replay.header.ghostQ;
    const n = g.n;
    // The floor it ended on is the run's own count (run.maxFloor at the catch).
    this.finalFloor = replay.result ? replay.result.floor | 0 : 0;
    // Where it last stood on that floor: the last sample STANDING there (a pose he is drawn in
    // only on a ledge, his feet at its height); failing one -- a climber holding jump stands one
    // step in 240, and the 30 Hz track may never catch him on his last floor -- the last whose
    // feet are within a few units above the floor's ledge, or the one nearest above it.
    const top = this.finalFloor * FLOOR_H * q;
    let stood = -1, standAt = -1, near = -1, nearD = Infinity;
    for (let i = 0; i < n; i++) {
      const d = g.y[i] - top;
      if (d === 0 && STANDING.has(g.names[g.pose[i] & 0x7f])) stood = i;
      if (d >= 0 && d <= 4 * q) standAt = i;
      if (d >= 0 && d < nearD) { nearD = d; near = i; }
    }
    if (stood >= 0) standAt = stood;
    else if (standAt < 0) standAt = near >= 0 ? near : n - 1;
    let x = g.x[standAt] / q;
    // On the ghost's own tower (a course) its last ledge is known: his feet go on it. The
    // samples above were all it had, and those a few units above the ledge are as often him
    // in the air beside it -- measured, the ghost stood on nothing after its run in 4 of 16
    // runs (the bot on seeds 21 and 31337, a cautious and a scripted climber), for the rest of
    // every race that outlived it (the verifier of the race's tower, 2026-09-28). GHOST ONLY,
    // the racer's ledge may be elsewhere anyway; the readout says so.
    const f = this.finalFloor;
    if (course && f >= 1 && f <= course.top) {
      const hw = PLAYER_W / 2;
      x = Math.max(course.x[f] + hw, Math.min(course.x[f] + course.w[f] - hw, x));
    }
    this.stand = {
      x,
      y: this.finalFloor * FLOOR_H,
      facing: g.pose[standAt] & 0x80 ? -1 : 1,
    };
  }

  /**
   * Where to draw the ghost at race time t [s]: { x, y, facing, pose, alpha, done }. x and y
   * in world units, y up, his feet; alpha a share of REPLAY_GHOST_ALPHA for the hand-over to
   * its last floor; null when there is nothing to draw.
   */
  ghost(t) {
    const d = this.duration;
    if (t < d) {
      const s = ghostAt(this.replay, Math.max(0, t));
      return s && { ...s, alpha: 1, done: false };
    }
    const u = t - d;
    if (u < GHOST_OUT) {
      const s = ghostAt(this.replay, d);
      return s && { ...s, alpha: 1 - u / GHOST_OUT, done: true };
    }
    const k = Math.min(1, (u - GHOST_OUT) / GHOST_IN);
    const pose = IDLE_CYCLE[Math.floor(t * 0.9) % IDLE_CYCLE.length];
    return { x: this.stand.x, y: this.stand.y, facing: this.stand.facing, pose, alpha: k, done: true };
  }

  /**
   * How many floors the racer, his feet at world height `y`, is above the ghost at race time
   * t: + ahead, - behind. Where each of them IS, not the best floor each has landed on: the
   * track holds no landings, only the Duke at 30 Hz, and a climber holding jump stands on a
   * ledge for one step in 240 -- counted from the standing poses the track caught, the first
   * cut had the ghost on floor 0 while the racer beside it stood on 19, and counted from the
   * troughs in its height (where a fall turns into a rise), every air jump was a landing, up to
   * 14 floors too high. The height is exact at every sample; the readout shows it rounded.
   */
  lead(y, t) {
    const gh = this.ghost(t);
    return gh ? Math.round((y - gh.y) / FLOOR_H) : 0;
  }
}
