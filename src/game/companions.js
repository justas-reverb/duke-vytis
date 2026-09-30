// Companions: blessed climbers who wait at milestone floors, climb alongside you for a
// few hundred floors while shouting encouragement, then lose their grip and fall.
//
// THEY HOP FROM A PLATFORM TO A PLATFORM, AND NOTHING ELSE MOVES THEM UP.
//
// Seven designs came before this one and each failed in a way worth keeping, because the
// next person will think of them in the same order:
//
//   1. A FIXED PARABOLA BETWEEN TWO PLATFORMS, with clamps holding the result on screen.
//      The arc was 0.32 s whatever the distance, so when the tower had moved further than
//      that it did not reach and a clamp dragged it the rest of the way. A clamp on a
//      position is a teleport, and that is what it looked like.
//   2. A REAL BOT PLAYING A REAL CHARACTER, with its clock as the only cheat. Honest to
//      the frame -- nothing teleported, and the run cycle and landing crouch appeared for
//      the first time -- and unusable, because two independent jumpers in a nine-floor
//      view cannot hold a relative position: they crossed him a hundred times a minute
//      and were off screen a third of the time.
//   3. Steering that bot harder. Every lever made one number better and another worse,
//      one for one, over a fourteen-point sweep.
//   4. Committing to a side, and jumping when he jumps. The commitment held; 86
//      crossings a minute.
//   5. SOLVED ARCS TO CHOSEN PLATFORMS, at the Duke's own gravity. Zero rescues and every
//      arc arrived, but 74 crossings a minute and 49% of frames off screen.
//   6. THE RAIL. Their height was an eased function of HIS -- the platform surface at
//      round((his y + station) / FLOOR_H) -- with a bounce parabola added on top. 4.9
//      crossings a minute and 0.4% off screen, and it looked wrong in three ways those
//      numbers could not see:
//        - Jumping from nothing. The rail slid continuously between floors, so a hop
//          began and ended wherever the rail happened to be: 0% of hops touched a
//          platform at either end. They only stood on a surface when the rail was at rest.
//        - Teleporting across the screen. A lead/trail switch moved the rail's target
//          4.4 floors and an ease of 24 a second covered it in 0.04 s; sideways, a lane
//          re-chosen every hop was eased to at 7 a second, peaking at 2569 world units a
//          second -- six times the Duke's top speed.
//        - Poses that disagreed with the motion: the pose read a vertical speed that
//          included the rail's, so 9% of frames showed `jump` on the way down or `fall`
//          on the way up, and the run cycle was unreachable although they slid sideways
//          all the time.
//      It survives as the GLIDE option (stepGlide), so the two can be compared in play.
//   7. STEPPING STONES, aimed at where he would be on AVERAGE. Every hop ledge to ledge,
//      speed caps a person could run at, poses from the state -- and on the tower a
//      player climbs, 23% of frames off screen and 53 crossings a minute (the rail: 0.6%
//      and 5.9). Traced frame by frame, the cause was the aim, not the hopping: past the
//      top of his arc the prediction carried on at his average climb, eleven floors a
//      second, so a leader hopped to where a steady climber would be -- while he topped
//      out, dropped a floor or two onto a ledge and stood there. He climbs in a
//      staircase, a rise of fifteen floors in half a second and then a pause, and the
//      view follows the staircase; they followed the straight line through it, which is
//      eight floors from the staircase at either end of every step.
//
// 8. THIS ONE: STEPPING STONES, AIMED AT WHERE HE WILL LAND.
//
//    Everything 7 promised still holds, and is still asserted: they are always either
//    STANDING (or walking) on a real platform, y equal to its surface, or FLYING a
//    parabola solved at takeoff from a point on one platform to a point on another, the
//    position a closed form of the time since takeoff -- nothing clamps it, nothing
//    re-aims it. Sideways speed is capped at a little over the Duke's own; a hop the cap
//    cannot make is not made. A role switch is done by moving. The pose comes from the
//    state. What changed is where they aim, and when:
//
//    - HIS FUTURE IS HIS PHYSICS UNTIL HE LANDS (hisLanding): his own arc flown forward
//      against the real ledges to the first one he comes down on, and flat after that.
//      Exact once he is falling (100% of predictions 0.1 s out, 94% at 0.2-0.4 s); what
//      it cannot know is an air jump he has not spent yet. His average climb after the
//      landing was tried as well and put every leader back over the top of the view.
//    - EVERY CANDIDATE LEDGE IS JUDGED AT ITS OWN ARRIVAL TIME. 7 picked a floor for a
//      0.15 s flight and then stretched the flight to 0.3 s when the ledge was far
//      sideways -- and arrived where he had been, not where he was. Now each floor is
//      scored by how far it lands from station when THAT hop would land, plus a charge
//      for every second of flight past the preferred one (tPenalty), plus a charge for any
//      part of the arc that would leave the view as the camera will be (the camera flown
//      forward along the same prediction, camPath). Charged against what standing still
//      would cost, never absolutely: charged absolutely, a companion already far out of
//      view finds every hop worse than staying put, and stood on one ledge while the
//      rising floor went past and the tower was pruned from under it -- 6564 frames
//      stranded on one seed before the charge was made relative.
//    - WHILE HE CAN STILL AIR-JUMP, THEY DECIDE OFTEN: the shortest hop. His arc is good
//      until he spends one, and a long hop planned on it lands under him.
//    - THEY FOLLOW HIM DOWN, when they have to and when it is safe. A leader goes down
//      only if it would otherwise be over the top of the view when he lands, and only by
//      a hop that is over before he lands -- he jumps again within hundredths of a second,
//      and a leader still coming down then is one he flies straight past. A trailer goes
//      down only if he would otherwise come down past it, and only to under where he will
//      land. A hop down may step off either end of the ledge they stand on (a hop that
//      starts over the ledges below would land on them), and never ends in the rising
//      floor's path.
//    - THEY JOIN WHEN HE REACHES THEM, not when his last-touched floor does. He flies
//      past a waiting companion in one jump and touches a floor ten above it; joining then
//      started every climb from under the bottom of the view.
//    - THE RISING FLOOR IS FLOWN PAST HIS LANDING (risePath). Its catch-up was read from
//      the best floor he had already reached, so a trailer hopping down while he fell onto
//      a NEW best floor was judged against a line his landing was about to move: on 7 of
//      14 human-tower runs a trailer landed in the rising floor (1-25 frames a run; the
//      test's own seed was one of the clean ones). With the line right, the 0.4 s it had
//      to stay clear after landing was padding over that error, and costing crossings; it
//      is 0.15 s now (riseHold).
//
//    Measured on the human tower over three seeds, 150,000 frames each, restarting on
//    death: 23.1% off screen and 52.6 crossings a minute before, 4.4% and 15.7 after. On
//    the attract tower (two seeds, 60,000): 13.1% and 26.1 before, 2.5% and 10.4 after.
//    With the rising floor flown past his landing, over fourteen human-tower runs from
//    eight starting seeds: 4.3% and 16.8, against 4.5% and 16.5 on the same runs before
//    it, and no frame in the rising floor; eight attract runs, 2.4% and 10.6 both ways.
//    (The per-knob numbers in TUNE below were measured before that change.)
//    Every design direction tried on the way, with what it measured, is in
//    docs/COMPANIONS.md -- including the ones measured and taken out again: a station
//    defined as a band of the view (a trade along one line, never a gain), one long hop
//    that shadows his arc once he has no air jump left (worse on the human tower on both
//    counts), a rescue hop after 0.3 s out of view (it changed no decision: the long
//    absences were already gone), and allowing in advance for an air jump he has not
//    spent (the same trade as moving the leader up: crossings bought with time off
//    screen).

import { COMPANION_IDS, COMPANION_NAMES } from '../render/compsprites.js';
import { FLOOR_H, GRAVITY, PLAYER_W, WALL_RESTITUTION, RISE_CATCHUP,
         CAM_ANCHOR, CAM_LERP, CAM_LOOKAHEAD, ASCENT_BOUNCE } from './constants.js';
// HIS gravity and terminal speed, the run's GRAVITY setting: their forecasts of his flight fall
// by his, and their own hops by the world's GRAVITY.
import { gravityOf, terminalOf } from './player.js';

/**
 * How much more the Duke does than the man their limits were tuned against: his clock (JUMP
 * SPEED's Player.rate, which the ascension quickens too) makes all his motion that much
 * faster, and once he has beaten ZENITH (Game.ascend) his jumps' speed goes by the root of the
 * height they gain and his reach in floors by the height. The companions' limits -- vertical
 * and sideways speed, floors in a hop, the glide's rail -- are scaled by the same.
 *
 * Their caps were tuned at 100%, "a little over the Duke's 430" sideways, and fixed in world
 * units: at a faster clock he simply outclimbed them. On the human tower, off screen and
 * crossings a minute: 4.3% and 19 at 100%, 5.4% and 54 at 120%, 9.9% and 80 at 140% -- the
 * default since 2026-09-28 -- and 19.1% and 94 at 160%. And the last of them, who never
 * slips, was left behind at the ascension (18.8% off screen on the attract tower). At 100%
 * below floor 2300 every factor is 1.
 */
//
// And their RHYTHM goes on his clock too (`pace`): a hop's flight, its longest stretch, the
// stand after it and the ceiling on his climb rate they read, each divided by it. At 140% their
// pace was already at its fastest -- a 0.1 s hop and the shortest stand, in the world's
// seconds -- so faster caps alone took the crossings at 140% from 80 a minute to 53 and left
// them off screen 8.9% of the time: he out-climbed their rhythm, not only their speed.
const NO_BOOST = Object.freeze({ v: 1, vx: 1, floors: 1, pace: 1 });
export function boostOf(game) {
  const p = game && game.player;
  const rate = Math.max(1, (p && p.rate) || 1);
  const level = (game && game.ascent) || 0;
  const height = level ? ASCENT_BOUNCE ** level : 1;
  if (rate === 1 && height === 1) return NO_BOOST;
  return { v: Math.sqrt(height) * rate, vx: rate, floors: height, pace: rate };
}
/** His clock, for their rhythm: 1 at 100% and below. */
const paceOf = (player) => Math.max(1, (player && player.rate) || 1);

export const FIRST_FLOOR = 350;     // the first one is waiting here
export const SPACING = 350;         // and every this many floors after
export const CLIMB_FOR = 320;       // floors they stay with you, well short of the next
// Six of them, and no seventh. The sixth joins at floor 2100 -- exactly as the last
// zone opens -- and never lets go, so from there on you are climbing with somebody
// until the tower takes you. It is the only one of the six you keep, which is the
// whole point of getting that far.
export const COUNT = 6;
export const SPEAK_EVERY = 6.5;     // seconds between remarks

// HOW THEY MOVE: 'hop', ledge to ledge (design 8, the default), or 'glide', the rail of
// design 6, kept so the two can be compared in play. The OPTIONS screen sets it through
// Companions.movement; everything but the movement itself -- waiting, joining, the side
// they are on, slipping, what they say -- is shared.
export const MOVEMENTS = ['hop', 'glide'];

// WHERE THEY RIDE, and how hard they are allowed to cheat to stay there.
//
// SWEPT, NOT CHOSEN -- the same rule the bot's own judgement numbers are held to. Every
// one of these was picked by hand first and every hand-picked set was wrong somewhere.
// tools/tune-companions.mjs walks a grid and prints what each costs.
//
// They are one mutable object rather than separate consts so a sweep can poke them
// without rewriting the module.
export const TUNE = {
  // THEY PICK A SIDE AND KEEP IT.
  //
  // With a single station above him they crossed from ahead of him to behind him ONE
  // HUNDRED TIMES A MINUTE. Every frame of that was physical -- the no-teleport check
  // passed throughout -- but a character flipping sides more than once a second is one
  // nobody can follow: it looks like teleporting from ahead of him to behind him and back. The timer is jittered by index so two never swap together.
  //
  // THE TWO STATIONS, measured on the human tower (three seeds) with where he will land
  // as the aim. The view reaches about 3.1 floors over his feet while he rises -- the
  // camera trails him -- and 3.8 under them, and he rises through a floor in the time a
  // hop takes, so the leader has the narrower band. Leader 1.7 (design 7's 2.4 less its
  // -0.7 aim): 2.5% off screen and 21.5 crossings a minute; 2.0: 4.4% and 15.7. Trailer
  // 3.1 (design 7's, with the aim): 7.3% and 14.6; 2.4: 4.4% and 15.7.
  lead: 2.0,              // floors ABOVE where he will be, while leading
  trail: 2.4,             // floors BELOW, while trailing
  roleTime: 13,           // seconds before they change their mind
  roleJitter: 5,

  // HIS CLIMB RATE, smoothed. It no longer aims anything -- his future is his physics now
  // (hisLanding) -- but it still sets the pace: how long a hop is, how heavy its gravity,
  // how long they stand, how fast they may launch. Slow on purpose: the bot climbs in
  // 1.2 s bursts, and this wants his average, not where he is in the burst.
  rateEase: 0.8,          // 1/s
  // Clamped BEFORE smoothing. A derivative fed by a run restart is unbounded, and one
  // spike poisons a slow filter for seconds -- seeded at zero it once read a hundred and
  // seven floors a second and aimed the opening hops sixty floors above the tower.
  rateCap: 800,           // world units a second; the bot's flat-out average is ~500

  // WHEN THEY HOP AT ALL.
  //
  // Within holdBand of station they stand: a companion hopping every time he climbs one
  // floor is a companion that never stops twitching. Ahead of station while he is
  // climbing faster than waitRate, they WAIT for him to come past rather than hop down
  // through him -- which is how leading turns into trailing without anything moving.
  holdBand: 1.0,          // floors. Typical 0.8-1.5
  waitRate: 45,           // world units a second of climb; 45 is 1.5 floors a second

  // THE HOP. Every one is a real parabola from a platform point to a platform point,
  // solved from its flight time T and a gravity g.
  //
  // THE FLIGHT SCALES WITH HIS SPEED, from hopSlow when he is standing about to hopFast
  // when he climbs at fastRate -- and is hopFast whenever he is rising with an air jump
  // still to spend, because his arc is only good until he spends it. At his walking
  // pace a 0.3 s hop at his own gravity reads as a hop; at a thousand floors a minute a
  // 0.1 s one reads as sprinting, which is what it is. Without the air-jump rule: 7.7%
  // off screen on the human tower against 4.4%, and 4.9% against 2.5% on the attract one.
  hopSlow: 0.30,          // s, standing pace
  hopFast: 0.10,          // s, at fastRate, or while he can still air-jump
  fastRate: 500,          // world units a second of his climb; the bot averages ~500
  hopMax: 0.45,           // s, the longest a flight may be stretched to make a hop legal
  // What a second of flight past the preferred one costs, in world units of distance from
  // station: a far ledge that takes long to reach is a ledge he has left by then. On the
  // human tower, off screen and crossings a minute: 0 -- 7.9% and 20.0; 150 -- 5.1% and
  // 15.3; 225 -- 4.4% and 15.7; 300 -- 3.9% and 17.4; 350 -- 3.8% and 21.9; 450 -- 3.6%
  // and 32.1. Past 300 the crossings climb steeply, so it sits well back from that edge
  // at the price of half a point of view.
  tPenalty: 225,          // world units a second. Typical 150-300
  // GRAVITY IS THE SPEED HACK, from gSlow to gFast with his speed, and up to gMax when a
  // hop needs it. 1 is the Duke's own. A heavier g makes the same height in less time.
  gSlow: 1.0,             // x GRAVITY
  gFast: 6.0,             // x GRAVITY
  gMin: 0.8,              // x GRAVITY: floatier than this reads as drifting
  gMax: 10,               // x GRAVITY
  // THE APEX. Going up they top out a little over the ledge and come DOWN onto it, the
  // way a jump to a ledge looks; never a whole floor over it, or the fall onto it would
  // pass down through the next platform up, which nobody can do. Going down, they hop a
  // little first and step off the end.
  clearMin: 4,            // world units over the higher end of the arc
  clearMax: 26,           // world units; under FLOOR_H, see above
  // THE SPEED LIMITS -- what "nothing teleports" means as numbers. Sideways, a little over
  // the Duke's 430, on foot or in the air. Vertically, launch and landing speed, scaled
  // with his pace -- vyBase standing about, plus vyPerRate per unit of his climb rate,
  // plus vyPerFloor for every floor they are behind -- up to vyMax. At a thousand floors
  // a minute they need over two thousand, measured three ways: capped at 1600 one fell
  // 290 floors behind in forty thousand frames and never came back; at 2000 the cap bit
  // on most hops; 2200 against 2000 took crossings from 47 a minute to 25. At a human
  // pace the fastest launch measured 1582, a trailing companion sprinting past him.
  vxMax: 540,             // world units a second
  vyBase: 1200,           // world units a second
  vyPerRate: 1.6,
  vyPerFloor: 80,         // world units a second more for each floor they are behind
  vyMax: 2200,            // world units a second; the rail peaked at 1792
  maxUp: 12,              // floors in one hop
  maxDown: 4,             // floors in one hop down
  edge: 5,                // world units a landing keeps inside a platform's ends
  laneGap: 22,            // world units: stand out of his column when level with him

  // IN VIEW, AND ON THEIR SIDE OF HIM.
  viewMargin: 8,          // world units a landing keeps inside the view's edges
  wView: 1.0,             // station error a world unit of flight out of view costs
  sideMargin: 0.8,        // floors kept clear of him on their own side, going down
  // Following him down (see plan()). A leader's hop down must be over this long before he
  // lands; any hop down must leave its ledge clear of the rising floor for riseHold after
  // landing. Not following him down at all: 6.5% off screen and 16.8 crossings a minute,
  // against 4.4% and 15.7.
  //
  // riseHold was 0.4 s while risePath() read only the best floor he had ALREADY reached.
  // That line was wrong exactly when it mattered -- he falls onto a new best floor, the
  // catch-up comes up behind him -- and the long hold was padding over the error that still
  // let trailers land in the rising floor on three of four human-tower seeds. With the line
  // flown past his landing, 0.4 s held trailers over him (four seeds: 21.1 crossings a
  // minute against 16.5); 0.25 s gave 18.1, 0.15 s 16.5 and 0.08 s 16.4, every one with no
  // frame under the rising floor. 0.15 keeps a margin over the shortest.
  readyT: 0.03,           // s
  riseHold: 0.15,         // s
  // How far past the end of the ledge they leave a hop down may land. Without the step
  // off the end: 5.2% and 17.8.
  escapePad: 12,          // world units
  // They join as his feet come this close under their ledge -- or when his floor reaches
  // theirs, as ever. Joining by his floor alone: 5.4% off screen against 4.4%, and 4.3%
  // against 2.5% on the attract tower.
  joinReach: 0.5,         // floors

  // How long they stand after landing before the next hop, from dwellSlow to dwellFast
  // with his pace -- and dwellFast whenever he is rising, because then he is not waiting
  // for anyone. The crouch shows for landHold, or for the whole dwell when that is
  // shorter: a tenth of a second at a walking pace, a frame or two at a sprint.
  dwellSlow: 0.14,        // s
  dwellFast: 0.02,        // s
  landHold: 0.10,         // s

  // ON FOOT. They walk to the ledge before a hop the sideways cap cannot make, to the end
  // before hopping down, and out of his way when standing level with him.
  walkMax: 110,           // world units a second: a brisk walk. Typical 80-140
  walkAccel: 700,         // world units a second squared
  runStride: 8,           // world units walked per frame of the run cycle
};

// THE RAIL, design 6, exactly as it shipped, for the GLIDE option. Its numbers were swept
// for that design and are left alone; see the history at the top for what it costs.
export const GLIDE = {
  station: 2.4,           // floors above him while leading
  trail: 2.0,             // floors below him while trailing
  railEase: 24,           // 1/s: how hard the rail tracks the platform at station
  railMax: 1500,          // world units a second: the ceiling an ease does not have
  laneEase: 7,            // 1/s: how fast they walk to their lane
  hopWhenAbove: 14,       // rail units a second below which they just stand
  hopFromRate: 0.10,      // seconds: converts rail speed into hop height
  hopLow: 14,             // world units
  hopHigh: 26,            // world units
  landHold: 0.10,         // s the landing crouch shows
  hopG: 1,                // x GRAVITY
  dwell: 0.12,            // s on the platform before the next bounce
  sideStep: 46,           // world units beside him
};

export const BUBBLE_TIME = 4.2;
/** A call fades in over CALL_IN and out over its last CALL_OUT. [seconds; 0.25, 0.45] */
const CALL_IN = 0.25, CALL_OUT = 0.45;
/**
 * How visible a call is, 0..1, from its timer: in and out on the same curve, so it never
 * blinks off mid-sentence. A call said for longer than BUBBLE_TIME (a greeting's 4.5 s)
 * waits unseen until it is down to BUBBLE_TIME. Here, beside the timer, because both the
 * renderer and freeze() need the same answer.
 */
export function callFade(bubbleT) {
  return Math.min(1, bubbleT / CALL_OUT, (BUBBLE_TIME - bubbleT) / CALL_IN);
}

export const STATE = { WAITING: 'waiting', CLIMBING: 'climbing', SLIPPING: 'slipping', GONE: 'gone' };

/** Which companion belongs to a milestone, cycling if the tower runs long enough. */
export function idForMilestone(index) {
  return COMPANION_IDS[index % COMPANION_IDS.length];
}

const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));

/**
 * The stretch of a platform they may stand or land on: `edge` in from each end, but never
 * less than two units either side of the middle, so a ledge narrower than two insets --
 * and past floor 2100 ledges get narrow -- still has somewhere to stand instead of none.
 */
function footing(P) {
  const e = Math.min(TUNE.edge, Math.max(0, (P.w - 4) / 2));
  return [P.x + e, P.x + P.w - e];
}

export class Companion {
  // `rng` is the run's cosmetic stream (Game.fx), for the bob's phase, which was
  // Math.random: the one unseeded number in a companion. Optional, for tools that make one.
  constructor(index, lines, rng = null) {
    this.index = index;
    this.id = idForMilestone(index);
    this.name = COMPANION_NAMES[this.id];
    this.lines = lines || { greet: 'WELL MET!', cheer: ['ONWARD!'], farewell: 'I FALL!' };
    this.joinFloor = FIRST_FLOOR + index * SPACING;
    // The last one never slips.
    this.last = index === COUNT - 1;
    this.slipFloor = this.last ? Infinity : this.joinFloor + CLIMB_FOR;

    this.state = STATE.WAITING;
    this.floor = this.joinFloor;
    this.x = 0;
    this.y = this.joinFloor * FLOOR_H;
    // Previous-step position, for render interpolation, the same as the player's.
    this.px = this.x;
    this.py = this.y;
    this.facing = 1;
    this.vx = 0;
    this.vy = 0;
    this.spin = 0;

    // STANDING: `on` is the floor whose platform is under their feet, null in the air.
    this.on = null;
    this.walkV = 0;                 // along the platform, world units a second
    this.walkTo = null;             // where they are walking to, or null to stand
    this.stride = 0;                // world units walked: drives the run cycle
    this.dwell = 0;
    this.landT = 0;

    // FLYING: the arc, fixed at takeoff. Position is a closed form of hopT.
    this.flight = 0;                // T, 0 when standing
    this.hopT = 0;
    this.x0 = 0; this.y0 = 0; this.x1 = 0; this.y1 = 0;
    this.vx0 = 0; this.vy0 = 0; this.g = GRAVITY;
    this.toFloor = 0;

    // GLIDING (design 6): the rail and the bounce riding it. Unused while hopping.
    this.movement = 'hop';
    this.rail = null;
    this.lastRail = 0;
    this.railV = 0;
    this.bounce = 0;
    this.laneX = 0;

    // His climb rate, smoothed. The last height is null until the first climbing frame.
    this.lastHisY = null;
    this.hisV = 0;
    this.lastHisVy = null;
    this.heJumped = false;

    this.stranded = 0;              // frames with no platform under them; must stay zero
    this.lead = true;               // which side of him, held for a stretch
    this.roleT = TUNE.roleTime + (index % 3) * 2;
    this.bubble = null;
    this.bubbleT = 0;
    this.speakT = 2.0;
    this.cheerIdx = 0;
    this.bob = (rng ? rng.next() : Math.random()) * 6;
  }

  say(text, time = BUBBLE_TIME) {
    this.bubble = text;
    this.bubbleT = time;
  }

  /** Called once when the player first reaches the milestone. */
  join(game) {
    if (this.state !== STATE.WAITING) return;
    this.state = STATE.CLIMBING;
    this.say(this.lines.greet, 5.0);
    this.speakT = SPEAK_EVERY;
    // They set off from the platform they were waiting on, standing exactly where they
    // stood; the first thing they do is plan a hop from it. No pop, and no ease onto a
    // station -- the rail left unseeded crossed six hundred world units on this frame.
    this.on = this.joinFloor;
    this.flight = 0;
    this.dwell = 0;
    this.walkV = 0;
    this.walkTo = null;
    this.lastHisY = null;
    // The rail too, for the GLIDE option: it STARTS where they stand.
    this.rail = this.y;
    this.lastRail = this.y;
    this.railV = 0;
    this.bounce = 0;
    this.laneX = this.x;
  }

  step(dt, game) {
    if (this.state === STATE.GONE) return;
    this.px = this.x;
    this.py = this.y;

    if (this.bubbleT > 0) {
      this.bubbleT -= dt;
      if (this.bubbleT <= 0) this.bubble = null;
    }
    this.bob += dt;

    const tower = game.tower;
    const player = game.player;

    if (this.state === STATE.WAITING) {
      const plat = tower.peek(this.floor);
      if (plat) { this.x = plat.x + plat.w / 2; this.y = plat.y; }
      // Pinned to the platform: nothing to interpolate, including on the first frame,
      // when x jumps from 0 to the middle of the ledge.
      this.px = this.x;
      this.py = this.y;
      // Announce themselves a little before you arrive, so you see them waiting.
      if (!this.bubble && player.floor >= this.joinFloor - 10) {
        this.say(this.lines.greet, 4.5);
      }
      // THEY JOIN WHEN HE REACHES THEM. His floor is the last one he TOUCHED, and he
      // flies past a waiting companion and lands ten floors on; joining only then set
      // every companion off from under the bottom of the view.
      if (player.floor >= this.joinFloor || player.y >= this.y - FLOOR_H * TUNE.joinReach) {
        this.join(game);
      }
      return;
    }

    if (this.state === STATE.SLIPPING) {
      this.vy -= 1500 * dt;
      this.y += this.vy * dt;
      this.spin += dt * 9;
      // Retired once well below the kill line; nothing can see them any more.
      if (this.y < game.riseY - 600) this.state = STATE.GONE;
      return;
    }

    // --- climbing -------------------------------------------------------------
    this.speakT -= dt;
    if (this.speakT <= 0 && !this.bubble) {
      const cheers = this.lines.cheer;
      this.say(cheers[this.cheerIdx % cheers.length]);
      this.cheerIdx++;
      this.speakT = SPEAK_EVERY;
    }

    // Which side of him they are on, held for a stretch rather than re-decided per frame.
    this.roleT -= dt;
    if (this.roleT <= 0) {
      this.lead = !this.lead;
      this.roleT = TUNE.roleTime + (this.index % 3) * (TUNE.roleJitter / 2);
    }

    const movement = (game.companions && game.companions.movement) || 'hop';
    if (movement !== this.movement) this.switchMovement(movement, game);
    if (this.movement === 'glide') { this.stepGlide(dt, game); return; }

    this.track(dt, player);

    if (this.flight > 0) this.fly(dt, player);
    else this.stand(dt, game);

    this.floor = this.on !== null ? this.on : Math.round(this.y / FLOOR_H);

    // They lose their grip standing on a ledge, not in the middle of a leap -- the same
    // floor as ever, checked when their feet are on something to lose a grip on.
    if (this.on !== null && this.floor >= this.slipFloor) this.slip(game);
  }

  slip(game) {
    this.state = STATE.SLIPPING;
    this.vy = 80;
    this.say(this.lines.farewell, 4.0);
    if (game.onCompanionSlip) game.onCompanionSlip(this);
  }

  /**
   * The OPTIONS toggle, changed mid-climb. Nothing jumps: the rail starts where they are,
   * and a companion left between floors by the rail comes down onto a ledge with a solved
   * arc, the only hop of the HOP movement that does not start on a ledge.
   *
   * TO HOP, ONLY BY A LEGAL ARC, OR NOT YET. The first version tried the ledge under them
   * and, when no arc inside the caps reached it, set them standing on it anyway -- and the
   * next stand() put their feet on its surface and inside its ends in one step: up to 315
   * world units sideways and 29 down, measured over 374 switches on the human tower. The
   * rail's lane can be most of a shaft away from the ledge a floor down. The test switched
   * twice, and neither switch found that case. Now they keep gliding, a frame at a time,
   * until a legal arc exists: over 70 hand-overs in the test the longest wait was 25
   * steps, a tenth of a second, and every step within the hops' caps.
   */
  switchMovement(to, game) {
    if (to === 'hop') {
      if (this.handOver(game)) this.movement = 'hop';
      return;
    }
    this.movement = to;
    if (to === 'glide') {
      this.rail = this.y;
      this.lastRail = this.y;
      this.railV = 0;
      this.bounce = 0;
      this.laneX = this.x;
      this.flight = 0;
      // A beat before the first bounce and the first new lane, so the switch itself is
      // not also the moment they set off sideways.
      this.dwell = GLIDE.dwell;
      this.on = null;
      this.walkV = 0;
      this.walkTo = null;
      return;
    }
  }

  /**
   * From the rail onto a ledge, for the switch to HOP: standing on one already (within
   * half a unit), or a solved arc to one within every cap a hop is held to -- sideways,
   * vertical, apex, not down through a platform, not into the rising floor. The ledge
   * under them first, then the ones around it. False, and nothing moved, if there is none
   * this frame.
   */
  handOver(game) {
    const tower = game.tower, FH = FLOOR_H;
    const f0 = Math.max(1, Math.floor(this.y / FH + 0.02));
    const riseAt = risePath(game, hisLanding(game.player, tower));
    const B = boostOf(game);
    const vyCap = TUNE.vyMax * B.v;
    let best = null;
    for (const f of [f0, f0 - 1, f0 + 1, f0 - 2, f0 - 3]) {
      const P = f >= 1 ? tower.peek(f) : null;
      if (!P) continue;
      const [lo, hi] = footing(P);
      if (lo > hi) continue;
      const x1 = clamp(this.x, lo, hi), dx = x1 - this.x, H = P.y - this.y;
      if (Math.abs(H) < 0.5 && Math.abs(dx) < 0.5) {
        best = { stand: true, f, x1, y1: P.y };
        break;
      }
      for (let T = Math.max(0.1 / B.pace, Math.abs(dx) / (TUNE.vxMax * B.vx)); T <= TUNE.hopMax + 1e-9; T += 0.02 / B.pace) {
        const arc = solveArc(H, T, GRAVITY, GRAVITY * TUNE.gMin, GRAVITY * TUNE.gMax);
        if (!arc) continue;
        if (Math.abs(arc.vy0) > vyCap || Math.abs(arc.vy0 - arc.g * T) > vyCap) continue;
        if (H < 0 && !this.clearDown(tower, f0, f, T, arc.g, arc.vy0, dx / T)) continue;
        if (P.y < riseAt(T + TUNE.riseHold) + FH) continue;
        best = { f, x1, y1: P.y, T, g: arc.g };
        break;
      }
      if (best) break;
    }
    if (!best) return false;
    this.flight = 0;
    this.walkV = 0;
    this.walkTo = null;
    this.lastHisY = null;
    this.dwell = 0;
    if (best.stand) {
      this.on = best.f;
      this.y = best.y1;
      this.x = best.x1;
    } else {
      this.launch(best, game.player);
    }
    return true;
  }

  /** His smoothed climb rate, and whether he just jumped. */
  track(dt, player) {
    // A launch from the ground, or an air jump: his vertical speed goes UP in one step,
    // which gravity alone can never do.
    this.heJumped = this.lastHisVy !== null && player.vy > this.lastHisVy + 100;
    this.lastHisVy = player.vy;
    if (this.lastHisY === null || dt <= 0) {
      this.lastHisY = player.y;
      return;
    }
    const raw = (player.y - this.lastHisY) / dt;
    this.lastHisY = player.y;
    const cap = TUNE.rateCap * paceOf(player);
    this.hisV += (clamp(raw, -cap, cap) - this.hisV) * Math.min(1, dt * TUNE.rateEase);
  }

  /**
   * His height `t` seconds from now: his physics until he lands, and where he lands after
   * that. The function carries his vertical speed (`.vy`) for the camera's lookahead, and
   * the landing itself (`.land`, { t, y }).
   *
   * IN THE AIR HE IS BALLISTIC, and that part is exact until he steers onto a different
   * ledge or spends an air jump. Measured against where he really landed, on the human
   * tower: once he is falling, the right ledge on 100% of predictions made 0.1 s out and
   * 94% of those made 0.2-0.4 s out; rising with an air jump still to spend and more than
   * 0.4 s out, 47% -- which is why they hop short while he can still spend one.
   *
   * Design 7 predicted his arc only while he rose faster than his average climb, and his
   * average from there -- right for the bot on the attract ramp, which never stops, and
   * eight floors wrong at the top of every step of the staircase he climbs on the tower
   * a player plays. His average added after the landing measured worse again: 15.3% off
   * screen and 48 crossings a minute, against 14.4% and 37 for flat.
   *
   * An earlier predictor modelled the bot's own air-jump timing and was near perfect
   * against the bot and five floors wrong against a player. A human spends an air jump
   * when he likes: predict the physics, not the player.
   */
  predictor(player, tower) {
    const L = hisLanding(player, tower);
    // His gravity (the run's GRAVITY), as he falls by in Player.step.
    const y = player.y, vy = player.vy, G = gravityOf(player);
    // `t` is the world's seconds; his arc runs on his own clock, k times as fast (JUMP SPEED).
    // .vy stays in his units, as the camera's lookahead reads his vy.
    const k = player.rate || 1;
    const f = (t) => { const u = t * k; return t < L.t ? y + vy * u - 0.5 * G * u * u : L.y; };
    f.vy = (t) => (t < L.t ? vy - G * (t * k) : 0);
    f.land = L;
    return f;
  }

  /**
   * In the air: the arc, as a closed form of the time since takeoff.
   *
   * Written from the takeoff point every frame rather than integrated, so the position
   * IS the parabola -- no drift, no clamp, and at touchdown exactly the landing point on
   * the platform it was solved for.
   */
  fly(dt, player) {
    this.hopT += dt;
    if (this.hopT >= this.flight) {
      this.x = this.x1;
      this.y = this.y1;
      this.vx = 0;
      this.vy = 0;
      this.flight = 0;
      this.on = this.toFloor;
      const d = this.dwellFor(player);
      this.dwell = d;
      this.landT = Math.min(TUNE.landHold, d);
      this.walkV = 0;
      this.walkTo = null;
      this.face(player);
      return;
    }
    const t = this.hopT;
    this.x = this.x0 + this.vx0 * t;
    this.y = this.y0 + this.vy0 * t - 0.5 * this.g * t * t;
    this.vx = this.vx0;
    this.vy = this.vy0 - this.g * t;
  }

  /** How far along the scale from his standing pace to his flat-out one he is, 0-1. */
  pace() {
    return clamp(this.hisV / TUNE.fastRate, 0, 1);
  }

  /** How long they stand after landing: shorter the faster he climbs. */
  dwellFor(player) {
    const k = paceOf(player);
    if (!player.grounded && player.vy > 0) return TUNE.dwellFast / k;
    return (TUNE.dwellSlow + (TUNE.dwellFast - TUNE.dwellSlow) * this.pace()) / k;
  }

  /** Face the way they are going, or him when they are not going anywhere. */
  face(player) {
    // At or over 20, not over: a hop sideways at exactly 20 world units a second faced
    // him instead of the way it went, on 60 frames of one attract run.
    if (Math.abs(this.vx) >= 20) this.facing = Math.sign(this.vx);
    else if (Math.abs(player.x - this.x) > 4) this.facing = Math.sign(player.x - this.x);
  }

  /** On a platform: stand, walk, or leave it. */
  stand(dt, game) {
    const player = game.player;
    const plat = game.tower.peek(this.on);
    if (!plat) {
      // The platform under them was pruned. The rising floor prunes 200 units and eight
      // floors below itself, so this means they fell half a screen below the kill line,
      // which nothing in the design lets happen. Counted, so the test can say so; they
      // still plan their way back from where they stand.
      this.stranded++;
    } else {
      // Feet on the surface, and inside its ends -- a platform can be narrower now than
      // when they landed on it, and then it pushes them in rather than leaving them on air.
      this.y = plat.y;
      const [lo, hi] = footing(plat);
      if (lo <= hi) this.x = clamp(this.x, lo, hi);
    }

    this.landT = Math.max(0, this.landT - dt);
    this.dwell -= dt;
    // HE JUMPED: think again now. His arc has just changed and the prediction with it.
    if (this.heJumped) this.dwell = 0;

    if (this.dwell <= 0) {
      const plan = this.plan(game, plat);
      if (plan && plan.hop) { this.launch(plan, player); return; }
      this.walkTo = plan ? plan.walkTo : null;
      // Re-plan in a moment rather than every frame: nothing it depends on changes
      // faster than that, and a stand decision made 240 times a second flickers.
      this.dwell = 0.04;
    }

    // Walking, if there is somewhere to walk to. Not while crouched from a landing.
    let want = 0;
    if (this.walkTo !== null && this.landT <= 0 && plat) {
      const d = this.walkTo - this.x;
      if (Math.abs(d) < 0.5) this.walkTo = null;
      else want = Math.sign(d) * Math.min(TUNE.walkMax, Math.abs(d) * 6);
    }
    const acc = TUNE.walkAccel * dt;
    this.walkV += clamp(want - this.walkV, -acc, acc);
    if (plat) {
      const [lo, hi] = footing(plat);
      const nx = lo <= hi ? clamp(this.x + this.walkV * dt, lo, hi) : this.x;
      if (nx === this.x) this.walkV = 0;
      this.stride += Math.abs(nx - this.x);
      this.x = nx;
    }
    this.vx = this.walkV;
    this.vy = 0;
    if (Math.abs(this.walkV) > 5) this.facing = Math.sign(this.walkV);
    else this.face(player);
  }

  launch(plan, player) {
    this.x0 = this.x;
    this.y0 = this.y;
    this.x1 = plan.x1;
    this.y1 = plan.y1;
    this.flight = plan.T;
    this.g = plan.g;
    this.vx0 = (plan.x1 - this.x) / plan.T;
    this.vy0 = (plan.y1 - this.y) / plan.T + 0.5 * plan.g * plan.T;
    this.toFloor = plan.f;
    this.hopT = 0;
    this.landT = 0;
    this.on = null;
    this.walkV = 0;
    this.walkTo = null;
    this.vx = this.vx0;
    this.vy = this.vy0;
    this.face(player);
  }

  /**
   * The next hop, or a decision to stand, or to walk first.
   *
   * THE STATION is `lead` floors over where he will be, or `trail` under it, from
   * predictor() -- never into the rising floor. Within holdBand of it at the end of one
   * preferred flight they stand. Otherwise every floor in that direction is a candidate,
   * each flown at the first legal flight time from the preferred one up, and each scored
   * at ITS OWN arrival: its distance from station then, a charge per second of flight
   * past the preferred one, and a charge for any part of it outside the view as the
   * camera will be, over what standing still would leave outside. The best is taken if
   * it beats standing. Legal means: a gravity inside gMin-gMax tops the arc out
   * clearMin-clearMax over its higher end, launch and landing speeds inside the cap for
   * his pace, sideways speed inside vxMax, and -- going down -- not passing down through
   * a platform on the way, and the rules for following him down in the header.
   *
   * A search that scored every candidate by its tracking error over the WHOLE flight was
   * built for design 7 and measured worse -- 115 crossings a minute against 32 -- and one
   * built again for this design, scoring the whole flight against the view and his side
   * of it, measured 14.7% off screen and 24.6 crossings a minute against 12.5% and 19.8
   * for arrival alone: given the freedom, both chose long arcs that fit a prediction
   * nobody could make.
   */
  plan(game, plat) {
    const player = game.player;
    const tower = game.tower;
    const his = this.predictor(player, tower);
    const L = his.land;
    const cam = camPath(game, his);
    const vh = game.viewH, FH = FLOOR_H;
    // A leader leads by less over a lighter Duke: the same impulse carries him 1/g as high
    // (player.js gravityOf), the camera trails him further on the way up, and the view over
    // his feet shrinks by as much. At NORMAL's 0.9 (2026-09-29) two floors put the leader's
    // head over the top edge in its hops while he rose -- 8.6% of the attract demo's frames off
    // screen, all of them that -- and 1.8 (2 x g) gives 6.6%. Never more than TUNE.lead: at 1
    // and heavier it is the lead it was tuned at.
    const offset = (this.lead ? TUNE.lead * Math.min(1, player.gravity || 1) : -TUNE.trail) * FH;
    // Never aim into the rising floor, whatever station says. The station reads its steady
    // climb only; the catch-up (risePath) is for where they must not land, below. Read
    // into the station as well, or made a reason to leave a ledge early, it held every
    // trailer high whenever he landed on a new best floor: about two points more time
    // off screen, for no frame saved (5.8% against 3.9%, measured with tPenalty 300).
    const riseAt = risePath(game, L);
    const rise0 = game.riseActive ? game.riseY : -Infinity;
    const riseV = game.riseActive && game.riseRate ? game.riseRate() : 0;
    const stationAt = (t) => Math.max(his(t) + offset, rise0 + riseV * t + FH * 0.5);

    const k = this.pace();
    const clock = paceOf(player);
    let tPref = (TUNE.hopSlow + (TUNE.hopFast - TUNE.hopSlow) * k) / clock;
    // While he can still air-jump, decide often: his arc is only good until he does.
    if (!player.grounded && player.airJumps > 0 && player.vy > 0) tPref = TUNE.hopFast / clock;
    const G = GRAVITY;
    const gP = G * (TUNE.gSlow + (TUNE.gFast - TUNE.gSlow) * k);
    const gLo = G * TUNE.gMin, gHi = G * TUNE.gMax;
    const from = this.on !== null ? this.on : Math.round(this.y / FH);
    const dw = this.dwellFor(player) * 0.5;

    // Stand, wait, or go?
    const target = stationAt(tPref + dw);
    // The vertical cap rises with his pace and with every floor there is to make up --
    // which is what lets a companion he has just flown past at the join catch him at all.
    const B = boostOf(game);
    const vyCap = Math.min(TUNE.vyMax * B.v, TUNE.vyBase * B.v + TUNE.vyPerRate * Math.max(0, this.hisV)
      + TUNE.vyPerFloor * Math.max(0, target - this.y) / FH);
    const maxUp = Math.round(TUNE.maxUp * B.floors), vxMax = TUNE.vxMax * B.vx;
    if (Math.abs(target - this.y) < TUNE.holdBand * FH) return this.stepAside(player, plat);
    const want = clamp(Math.round(target / FH), Math.max(0, from - TUNE.maxDown), from + maxUp);
    if (want === from) return this.stepAside(player, plat);
    const dir = Math.sign(want - from);
    // Ahead of station while he climbs: he will come past. Wait for him -- unless he is
    // falling, when "ahead" is where he is about to leave them.
    const falling = player.vy <= 0 && !player.grounded;
    if (dir < 0 && !falling && this.hisV > TUNE.waitRate) return this.stepAside(player, plat);
    // GOING DOWN ONLY WHEN IT IS NEEDED. Off station is not enough: he is about to land and
    // jump again, and whoever hops down then is hopping the wrong way. A leader goes down
    // when it would otherwise be over the top of the view as he lands; a trailer when he
    // would otherwise come down past it. (Without: 4.9% off screen against 4.4%.)
    if (dir < 0) {
      if (this.lead) {
        if (this.y <= cam(L.t) + vh - 34 - TUNE.viewMargin) return this.stepAside(player, plat);
      } else if (this.y < L.y - TUNE.sideMargin * FH) {
        return this.stepAside(player, plat);
      }
    }
    // ...and when it is safe: over before he lands, for a leader, and clear above where he
    // lands; under where he lands, for a trailer. (And, like every landing, clear of the
    // rising floor -- below.)
    const downOk = (T, Py) => {
      if (this.lead) return T + TUNE.readyT <= L.t && Py >= L.y + TUNE.sideMargin * FH;
      return Py <= Math.min(L.y, his(T)) - TUNE.sideMargin * FH;
    };

    let best = null, walk = null;
    const fLo = Math.max(0, from - TUNE.maxDown), fHi = from + maxUp;
    for (let f = from + dir; f >= fLo && f <= fHi; f += dir) {
      const P = tower.peek(f);
      if (!P) continue;
      const [lo, hi] = footing(P);
      if (lo > hi) continue;
      const H = P.y - this.y;
      // Where on it to land. Straight across first; going DOWN, also just past either end
      // of the ledge they stand on, because a hop down that starts over the ledges below
      // would land on them -- stepping off the end sideways is how anyone gets down.
      // (Without it: 5.2% off and 17.8 a minute, against 4.4% and 15.7.)
      const xs = [clamp(this.x, lo, hi)];
      if (dir < 0 && plat) {
        const l = plat.x - TUNE.escapePad, r = plat.x + plat.w + TUNE.escapePad;
        if (l >= lo) xs.push(Math.min(hi, l));
        if (r <= hi) xs.push(Math.max(lo, r));
      }
      let found = null;
      for (const x1 of xs) {
        const dx = x1 - this.x;
        for (let T = Math.max(tPref, Math.abs(dx) / vxMax); T <= TUNE.hopMax + 1e-9; T += 0.02 / clock) {
          const arc = solveArc(H, T, gP, gLo, gHi);
          if (!arc) continue;
          const vyEnd = arc.vy0 - arc.g * T;
          if (Math.abs(arc.vy0) > vyCap || Math.abs(vyEnd) > vyCap) continue;
          if (dir < 0 && !this.clearDown(tower, from, f, T, arc.g, arc.vy0, dx / T)) continue;
          if (dir < 0 && !downOk(T, P.y)) continue;
          // Every landing clear of the rising floor, catch-up and all: going down, for
          // riseHold after it; going up, as it lands -- a trailer hopped up onto a ledge
          // the catch-up covered two hundredths of a second later.
          if (dir < 0 ? P.y < riseAt(T + TUNE.riseHold) + FH : P.y < riseAt(T) + FH * 0.5) continue;
          if (!found || T < found.T) found = { hop: true, f, x1, y1: P.y, T, g: arc.g };
          break;
        }
      }
      if (!found) {
        const dx = xs[0] - this.x;
        if (!walk && plat && Math.abs(dx) > vxMax * TUNE.hopMax) {
          walk = { hop: false, walkTo: clamp(xs[0], ...footing(plat)) };
        }
        continue;
      }
      found.err = Math.abs(P.y - stationAt(found.T + dw)) + TUNE.tPenalty * (found.T - tPref)
        + TUNE.wView * this.outOfView(found, cam, vh);
      if (!best || found.err < best.err) best = found;
    }
    if (best && best.err < Math.abs(this.y - stationAt(tPref + dw))) return best;
    if (best) return this.stepAside(player, plat);
    if (walk) return walk;
    // Going down, the usual blocker is their own ledge: walk to its nearer end.
    if (dir < 0 && plat) {
      const [lo, hi] = footing(plat);
      return { hop: false, walkTo: this.x - lo < hi - this.x ? lo : hi };
    }
    return null;
  }

  /**
   * How much further outside the view a hop would take them than standing still would
   * leave them, at worst, in world units -- the view as the camera will be (camPath).
   *
   * RELATIVE, deliberately. Charged as an absolute, a companion already far out of view
   * found every hop worse than staying put and stayed put: on one seed it stood on a
   * ledge for 6564 frames while the rising floor went past and the tower was pruned from
   * under it. (With this charge: 4.4% off screen against 5.3%, and 2.5% against 3.7% on
   * the attract tower.)
   */
  outOfView(hop, cam, vh) {
    const v0 = (hop.y1 - this.y) / hop.T + 0.5 * hop.g * hop.T;
    let worst = 0, still = 0;
    for (let t = 0; t <= hop.T; t += 1 / 60) {
      const y = this.y + v0 * t - 0.5 * hop.g * t * t, c = cam(t);
      worst = Math.max(worst, y - (c + vh - 34), c - y);
      still = Math.max(still, this.y - (c + vh - 34), c - this.y);
    }
    return Math.max(0, worst - still);
  }

  /** Standing: out of his way if he is level with them and in their column. */
  stepAside(player, plat) {
    if (!plat) return null;
    const [lo, hi] = footing(plat);
    if (lo > hi) return null;
    const level = Math.abs(player.y - this.y) < FLOOR_H * 1.5;
    if (!level || Math.abs(player.x - this.x) >= TUNE.laneGap) {
      return { hop: false, walkTo: this.walkTo };
    }
    const away = player.x > this.x ? -1 : 1;
    let to = clamp(player.x + away * TUNE.laneGap * 1.5, lo, hi);
    // No room that side: the other.
    if (Math.abs(to - player.x) < TUNE.laneGap) to = clamp(player.x - away * TUNE.laneGap * 1.5, lo, hi);
    return { hop: false, walkTo: to };
  }

  /**
   * A hop DOWN must not pass down through a platform on the way -- they would have
   * landed on it. Checked at every floor between takeoff and landing, including the
   * one they leave: by the time they come back down past it they must be off its end.
   */
  clearDown(tower, from, to, T, g, vy0, vx) {
    for (let k = from; k > to; k--) {
      const P = tower.peek(k);
      if (!P) continue;
      const drop = this.y - P.y;                 // how far below takeoff this floor is
      const disc = vy0 * vy0 + 2 * g * drop;
      if (disc < 0) continue;
      const t = (vy0 + Math.sqrt(disc)) / g;     // the DESCENDING crossing
      if (t >= T) continue;
      const x = this.x + vx * t;
      if (x >= P.x - 3 && x <= P.x + P.w + 3) return false;
    }
    return true;
  }

  /**
   * GLIDE: design 6, the rail, as it shipped -- for comparing against the hops in play,
   * from the OPTIONS screen. Their height is an eased function of HIS, snapped to the
   * platform lattice, with a bounce parabola riding on top; sideways they ease to a lane
   * beside him. It cannot cross him or leave the view, and none of its hops touch a
   * platform -- which is the trade the header describes. The one change: `vy` is the
   * bounce's own, not the rail's added in, so the pose follows the bounce you can see.
   */
  stepGlide(dt, game) {
    const G6 = GLIDE;
    const player = game.player;
    const tower = game.tower;
    const offset = (this.lead ? G6.station : -G6.trail) * FLOOR_H;
    const wantFloor = Math.max(1, Math.round((player.y + offset) / FLOOR_H));
    const plat = tower.peek(wantFloor);
    const railTarget = plat ? plat.y : wantFloor * FLOOR_H;
    if (this.rail === null) { this.rail = railTarget; this.lastRail = railTarget; }
    else {
      const step = (railTarget - this.rail) * Math.min(1, dt * G6.railEase);
      const cap = G6.railMax * boostOf(game).v * dt;
      this.rail += Math.max(-cap, Math.min(cap, step));
    }
    const railV = (this.rail - this.lastRail) / Math.max(1e-6, dt);
    this.lastRail = this.rail;
    this.railV += (railV - this.railV) * Math.min(1, dt * 4);

    const g = GRAVITY * G6.hopG;
    if (this.flight > 0) {
      this.hopT += dt;
      const t = Math.min(this.hopT, this.flight);
      this.bounce = Math.max(0, this.vy0 * t - 0.5 * g * t * t);
      this.vy = this.vy0 - g * t;
      if (this.hopT >= this.flight) {
        this.bounce = 0;
        this.flight = 0;
        this.landT = G6.landHold;
        this.dwell = G6.dwell;
      }
    } else {
      this.bounce = 0;
      this.vy = 0;
      this.landT = Math.max(0, this.landT - dt);
      this.dwell -= dt;
      // Standing still on a rail that is moving is the sliding this existed to prevent.
      if (this.dwell <= 0 && Math.abs(this.railV) > G6.hopWhenAbove) {
        const h = Math.max(G6.hopLow, Math.min(G6.hopHigh, Math.abs(this.railV) * G6.hopFromRate));
        this.vy0 = Math.sqrt(2 * g * h);
        this.flight = (2 * this.vy0) / g;
        this.hopT = 0;
        this.pickLane(game);
      }
    }
    this.y = this.rail + this.bounce;
    const nx = this.x + (this.laneX - this.x) * Math.min(1, dt * G6.laneEase);
    this.vx = (nx - this.x) / Math.max(1e-6, dt);
    this.x = nx;
    if (Math.abs(this.laneX - this.x) > 1) this.facing = Math.sign(this.laneX - this.x);
    this.walkV = 0;
    this.on = null;
    this.floor = Math.round(this.y / FLOOR_H);
    if (this.floor >= this.slipFloor) this.slip(game);
  }

  /** GLIDE: where to stand sideways, on the far side of the rail's platform from him. */
  pickLane(game) {
    const player = game.player;
    const floor = Math.max(1, Math.round(this.rail / FLOOR_H));
    const plat = game.tower.peek(floor);
    if (!plat) return;
    const cx = plat.x + plat.w / 2;
    const away = player.x > cx ? -1 : 1;
    const edge = Math.max(0, plat.w / 2 - 6);
    this.laneX = cx + away * Math.min(GLIDE.sideStep, edge);
  }

  get airborne() { return this.state === STATE.CLIMBING && this.flight > 0; }
}

/**
 * The rising floor's own path, seconds from now: its climb, and -- while it is further
 * than riseLead() under his best floor -- the catch-up of RISE_CATCHUP on top, up to that
 * line. Game.step() moves it exactly so, and this flies the same two lines forward. Its
 * climb alone was the first version, and a trailer landed on a ledge the catch-up reached
 * 0.02 s later: after every landing of his on a new best floor the line comes up at up to
 * 24 floors a second.
 *
 * THAT LANDING IS USUALLY STILL AHEAD. The best floor read here was the one he had
 * already reached, so a trailer hopping down while he fell toward a NEW best floor was
 * judged against the old line -- and the catch-up his landing set off covered its ledge
 * before or just after it touched down: 1-25 frames under the rising floor on 7 of 14
 * human-tower runs (none on the test's own seed). `L` is his predicted landing
 * (hisLanding); from L.t the line's target is his best floor as it will be then. The
 * three cases traced frame by frame were all that one: a trailer's hop down, planned
 * while he was still in the air.
 */
function risePath(game, L) {
  if (!game.riseActive) return () => -Infinity;
  const rate = game.riseRate ? game.riseRate() : 0;
  const best0 = game.run ? game.run.maxFloor : -Infinity;
  const bestL = L ? Math.max(best0, Math.round(L.y / FLOOR_H)) : best0;
  const lineFor = (best) => (game.run && game.riseLead ? best * FLOOR_H - game.riseLead(best) : -Infinity);
  const target0 = lineFor(best0), targetL = lineFor(bestL);
  const tL = L ? L.t : Infinity;
  const h = 1 / 120, N = 180;               // 1.5 s, past the longest hop and its riseHold
  const tab = new Float64Array(N + 1);
  let y = game.riseY;
  tab[0] = y;
  for (let i = 1; i <= N; i++) {
    y += rate * h;
    const target = i * h >= tL ? targetL : target0;
    if (y < target) y = Math.min(target, y + RISE_CATCHUP * h);
    tab[i] = y;
  }
  // Rounded UP to the table: the line only ever rises, so the later sample is the safe one.
  return (t) => tab[Math.max(0, Math.min(N, Math.ceil(t / h - 1e-9)))];
}

/**
 * The camera's own path, flown forward along a prediction of him: the same ease and the
 * same clamped lookahead Game.step() applies, so "in view" is judged in the view as it
 * will be, not as it is. A function of seconds from now, tabulated once per plan.
 */
function camPath(game, his) {
  const vh = game.viewH, h = 1 / 120, N = 150;
  // The camera follows at his clock's rate (Game.step), JUMP SPEED times the world's.
  const k = (game.player && game.player.rate) || 1;
  const tab = new Float64Array(N + 1);
  let c = game.camY;
  tab[0] = c;
  for (let i = 1; i <= N; i++) {
    const t = i * h;
    const look = clamp(his.vy(t) * CAM_LOOKAHEAD, -vh * 0.12, vh * 0.12);
    c += (his(t) + look - vh * CAM_ANCHOR - c) * Math.min(1, CAM_LERP * h * k);
    tab[i] = c;
  }
  return (t) => tab[Math.max(0, Math.min(N, Math.round(t / h)))];
}

/**
 * Where he next lands, if he neither steers nor jumps again: his own physics flown
 * forward -- gravity, terminal speed, the walls, and the first ledge he comes down on,
 * by the same test Player.step() lands him with. { t: seconds from now, y: the ledge's
 * surface, x }. Standing, that is now and here. Only ledges that already exist are
 * looked at: generating the tower ahead of the game to answer a question would change
 * nothing today, and is not this function's to decide.
 */
export function hisLanding(player, tower) {
  if (player.grounded) return { t: 0, y: player.y, x: player.x };
  // Flown on HIS clock, and the time handed back on the world's: at a JUMP SPEED of k he
  // covers the arc in 1/k of the seconds, and every plan that reads `t` (the hop that must be
  // over before he lands, the fire's path past his landing) lives on the world's clock.
  const k = player.rate || 1;
  const h = 1 / 120, halfW = PLAYER_W / 2;
  let x = player.x, y = player.y, vx = player.vx, vy = player.vy;
  const lo = player.lo, hi = player.hi;
  // And by his GRAVITY: the run's setting, his fall's cap with it (player.js).
  const G = gravityOf(player), fall = terminalOf(player);
  for (let t = h; t <= 2.0; t += h) {
    const py = y;
    vy -= G * h;
    if (vy < -fall) vy = -fall;
    x += vx * h;
    y += vy * h;
    if (x - halfW < lo) { x = lo + halfW; vx = -vx * WALL_RESTITUTION; }
    else if (x + halfW > hi) { x = hi - halfW; vx = -vx * WALL_RESTITUTION; }
    if (vy <= 0) {
      for (let n = Math.floor(py / FLOOR_H); n >= Math.floor(y / FLOOR_H) - 1; n--) {
        const P = tower.floors.get(n);
        if (!P) continue;
        if (py >= P.y - 0.001 && y <= P.y && x + halfW > P.x && x - halfW < P.x + P.w) {
          return { t: t / k, y: P.y, x };
        }
      }
    }
  }
  return { t: 2.0 / k, y, x };
}

/**
 * The gravity for an arc that rises H in time T and tops out clearMin-clearMax over its
 * higher end, as close to gPref as those allow, within gLo-gHi. Null if no gravity can.
 *
 * With a = T/2 and b = H/T, launch speed is a*g + b and the landing speed is b - a*g.
 * "The apex is c over the higher end" is then a quadratic in g -- over the landing going
 * up, (a g - b)^2 = 2 g c; over the takeoff going down, (a g + b)^2 = 2 g c -- and the
 * clearance rises with g, so a band of clearances is a band of gravities.
 */
export function solveArc(H, T, gPref, gLo, gHi) {
  const a = T / 2, b = H / T;
  const s = H >= 0 ? -b : b;
  const gFor = (c) => {
    const B = 2 * (c - a * s);
    const disc = B * B - 4 * a * a * s * s;
    if (disc < 0) return NaN;
    return (B + Math.sqrt(disc)) / (2 * a * a);
  };
  const lo = Math.max(gLo, gFor(TUNE.clearMin));
  const hi = Math.min(gHi, gFor(TUNE.clearMax));
  if (!(lo <= hi)) return null;
  const g = clamp(gPref, lo, hi);
  const vy0 = b + a * g;
  // Up: must still be falling at touchdown. Down: must rise a little first.
  if (H >= 0 ? vy0 - g * T >= 0 : vy0 <= 0) return null;
  return { g, vy0 };
}

export class Companions {
  constructor(lineTable) {
    this.lines = lineTable || {};
    // 'hop' or 'glide' (see MOVEMENTS); main.js sets it from the OPTIONS screen.
    this.movement = 'hop';
    this.reset();
  }

  reset() {
    this.active = [];
    this.spawned = 0;
    this.met = 0;
  }

  step(dt, game) {
    // Spawn the next one a little before its floor, so it is standing there waiting
    // rather than materialising under your feet.
    const nextFloorNeeded = FIRST_FLOOR + this.spawned * SPACING;
    if (this.spawned < COUNT && game.run.maxFloor >= nextFloorNeeded - 40) {
      const c = new Companion(this.spawned, this.lines[idForMilestone(this.spawned)], game.fx);
      c.movement = this.movement;
      this.active.push(c);
      this.spawned++;
    }

    for (const c of this.active) {
      const was = c.state;
      c.step(dt, game);
      if (was === STATE.WAITING && c.state === STATE.CLIMBING) {
        this.met++;
        if (game.onCompanionJoin) game.onCompanionJoin(c);
      }
    }
    this.active = this.active.filter((c) => c.state !== STATE.GONE);
  }

  /**
   * He is dead: everyone stays where they stand, and what they were saying fades out.
   *
   * Nothing steps them through the fall or the scoreboard, and that froze two things half
   * way. A companion caught mid-hop kept a previous position one simulation step behind
   * its current one, and the renderer draws the blend of the two at each frame's own
   * interpolation weight -- so for the whole death it jumped between them, up to a hop's
   * step (nine world units) every frame. And a line of dialogue kept its timer, so the
   * call stayed on screen, frozen, over the fall and under the scoreboard. The ends of
   * the interpolation now meet, and a call fades out as it would at the end of its line.
   */
  freeze() {
    for (const c of this.active) {
      c.px = c.x;
      c.py = c.y;
      // Into its fade-out, from exactly as visible as it is now: a call still fading in,
      // or a greeting still waiting its turn (callFade 0), must not brighten as he dies.
      if (!c.bubble) continue;
      const f = callFade(c.bubbleT);
      if (f <= 0) { c.bubble = null; c.bubbleT = 0; continue; }
      c.bubbleT = Math.min(c.bubbleT, f * CALL_OUT);
    }
  }

  /** During the death: only the calls go on, running out their fade. */
  hush(dt) {
    for (const c of this.active) {
      if (!(c.bubbleT > 0)) continue;
      c.bubbleT -= dt;
      if (c.bubbleT <= 0) c.bubble = null;
    }
  }
}
