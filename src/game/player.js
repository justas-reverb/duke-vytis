// Player physics.
//
// Three things the brief asked for live in here and they interact, so they are all
// in one place rather than scattered:
//   1. "the more you run the higher your speed"  -> momentum raises the speed cap
//   2. "and the higher your jump height"         -> jump impulse scales with speed
//   3. "combos when you double and triple jump and bounce from side to side"
//      -> air jumps and wall bounces both report into the combo tracker
//
// Collision with platforms is one-way (you pass up through them, you land on top).
// That is not only faithful to the genre, it removes the entire class of "stuck under
// a ledge" failures that would otherwise threaten the climbability guarantee.

import {
  GRAVITY, VX_MAX_COLD, VX_MAX_HOT, ACCEL_GROUND, ACCEL_AIR, FRICTION,
  JUMP_V0_MIN, JUMP_V0_MAX, JUMP_MOMENTUM_BONUS, JUMP_CUT,
  AIR_JUMPS, AIR_JUMPS_TRIPLE, AIR_JUMP_SCALE, AIR_JUMP_UNLOCK, INSTAJUMP_BONUS,
  MOM_UP, MOM_DOWN, MOM_RUN_THRESHOLD,
  WALL_BOUNCE_MIN, WALL_RESTITUTION, WALL_RESTITUTION_GROUND, WALL_BOUNCE_LIFT,
  WALL_COMBO_FULL, WALL_COMBO_KICK, WALL_COMBO_LIFT, WALL_VX_MAX, WALL_LIFT_CAP,
  OVERDRIVE_DECAY,
  CX, ARENA_HALF_MIN, PLAYER_W, PLAYER_H, FLOOR_H, TERMINAL,
} from './constants.js';
import { COYOTE } from '../core/input.js';

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * How hard the live combo drives a wall bounce, 0..1, from its length in floors.
 *
 * A square root, so the first fifty floors of a chain already buy 0.41 of it rather
 * than a sixth: the point is that a player keeping a chain alive FEELS the walls
 * answer, and a linear ramp would leave the whole early chain feeling like nothing
 * changed. Exactly 0 with no combo, which is what keeps ordinary play untouched.
 */
export function wallComboBoost(comboFloors) {
  if (!(comboFloors > 0)) return 0;
  return Math.sqrt(Math.min(1, comboFloors / WALL_COMBO_FULL));
}

/**
 * The airborne wall bounce, as one pure function of what arrives and how hard the combo
 * is driving it. Player.bounceOffWall uses it, and so does the attract bot's forward
 * model in autoplay.js -- which is the reason it is a function at all. The bot flies
 * every candidate stick position through the wall physics to choose one, and a copy of
 * the bounce inside the bot that disagreed with the real one would have it planning
 * bounces the game does not perform.
 *
 *   speed    |vx| arriving at the wall, world units/s
 *   vy       vertical velocity arriving, world units/s, up is positive
 *   boost    wallComboBoost of the live combo, 0..1
 *   vxMax    the cap the player has earned, to measure the overspeed against
 *
 * Returns the speed leaving the wall (a magnitude; the caller supplies the direction),
 * the new vy, and `overdrive` -- how far that speed sits above vxMax, which the caller
 * keeps as an allowance so the bleed in Player.step does not eat it.
 *
 * Both caps bind only the COMBO part. The plain bounce, speed x 0.94 and vy + 45, is
 * never cut by them, so boost 0 reproduces the old bounce exactly, to the bit.
 */
export function wallBounceOut(speed, vy, boost, vxMax) {
  const plain = speed * WALL_RESTITUTION;
  const driven = speed * (WALL_RESTITUTION + boost * WALL_COMBO_KICK);
  const out = Math.max(plain, Math.min(driven, WALL_VX_MAX));
  const vyPlain = vy + WALL_BOUNCE_LIFT;
  // The combo lift is paid in proportion to how hard he HIT the wall. It was paid in
  // full on any contact over WALL_BOUNCE_MIN, and at full boost that made the wall a
  // brake: flicking the stick into it at 80 units/s bought 345 units/s of lift per tap
  // and cut a two-second fall from 2155 units to 734, never gaining height but never
  // falling either. A bounce is supposed to be the reward for arriving FAST, so a tap
  // earns a fifth of the kick and a flat-out hit earns all of it.
  const vyDriven = vyPlain + boost * WALL_COMBO_LIFT * Math.min(1, speed / VX_MAX_HOT);
  const vyOut = Math.max(vyPlain, Math.min(vyDriven, WALL_LIFT_CAP));
  // No allowance without a boost. A plain bounce can arrive over the cap too (it is
  // bleeding off a previous combo bounce's allowance, say) and must not renew it.
  const overdrive = boost > 0 ? Math.max(0, out - vxMax) : 0;
  return { speed: out, vy: vyOut, overdrive };
}

/** The overdrive allowance after `dt` seconds. Linear, so its lifetime is bounded. */
export function decayOverdrive(od, dt) {
  return od > 0 ? Math.max(0, od - OVERDRIVE_DECAY * dt) : 0;
}

/**
 * HIS gravity [world units/s^2; 1680 as tuned]: GRAVITY times the run's GRAVITY setting
 * (settings.js GRAVITIES, Player.gravity), which Player.step falls by and everything that
 * forecasts his flight must fall by too -- the attract bot's jump model (autoplay.js) and the
 * companions' forecast of his landing (companions.js hisLanding, predictor). One function, so
 * a forecast cannot fall by another rule than he does. The world's own falls -- a companion's
 * hop, the death's plunge, the pieces -- keep GRAVITY. At a setting of 1 this is GRAVITY to the
 * bit (x * 1 is x), so the game as tuned is unchanged.
 */
export function gravityOf(p) { return GRAVITY * (p.gravity || 1); }

/**
 * HIS terminal speed [world units/s; 1400 as tuned]: TERMINAL times the ROOT of the setting.
 * constants.js says TERMINAL is "scaled with gravity, or falls feel weightless", and it was
 * scaled so when GRAVITY went from 700 to 1680 (x2.4): 900 to 1400, the root of 2.4 -- the
 * factor the jump impulses took -- which keeps a fall's shape in space: from rest he reaches
 * the cap after the same drop (TERMINAL^2 / 2 GRAVITY, 583 units) at every gravity, and a fall
 * of any height takes 1/root(g) of the time. Left at 1400, HIGH gravity would pin a fall at
 * its cap after 486 units -- the floaty long fall the comment warns of -- and LOW after 729.
 * 1400 to the bit at 1 (Math.sqrt(1) is 1).
 */
export function terminalOf(p) { return TERMINAL * Math.sqrt(p.gravity || 1); }

export class Player {
  constructor() { this.reset(); }

  reset() {
    this.lo = CX - ARENA_HALF_MIN;
    this.hi = CX + ARENA_HALF_MIN;
    this.x = CX;
    this.y = 0;
    this.px = this.x;              // previous-step position, for render interpolation
    this.py = this.y;
    this.vx = 0;
    this.vy = 0;
    this.grounded = true;
    this.coyote = 0;
    this.airJumps = AIR_JUMPS;
    // The ASCENSION's bounce (Game.ascend): every jump's impulse, times this. 1 until he
    // beats ZENITH, then the root of ASCENT_BOUNCE per lap, so the HEIGHT doubles.
    this.bounce = 1;
    this.facing = 1;
    this.momentum = 0;
    this.floor = 0;                // floor currently standing on
    this.squash = 0;               // -1 squashed, +1 stretched; pure juice
    this.animT = 0;
    this.spinT = 0;                // mid-air somersault timer
    this.distanceRun = 0;
    this.airTime = 0;
    this.airUnlocked = false;      // were air jumps earned at takeoff?
    this.tripleUnlocked = false;   // set by the game from the live combo length
    this.comboBoost = 0;           // ditto: wallComboBoost of the live combo, 0..1
    this.overdrive = 0;            // units/s a combo bounce lifted the speed cap by
    this.airGranted = 0;
    this.instaChain = 0;           // consecutive hold-to-jump landings
    this.landT = 0;                // seconds since touchdown; drives the landing pose
    this.events = [];              // drained each step by the game
    // JUMP SPEED (settings.js JUMP_SPEEDS): seconds of HIS physics per second of the world's,
    // [x; typical 1]. Set by Game.newRun for the run, after this reset. See step().
    this.rate = 1;
    // GRAVITY (settings.js GRAVITIES): how heavy he is, as a multiple of GRAVITY [x; 1 as
    // tuned, LOW 0.8, HIGH above 1]. Set by Game.newRun for the run, after this reset. The
    // impulses do not change with it, so every jump rises 1/g as high and hangs 1/g as long
    // on the way up. See gravityOf and terminalOf.
    this.gravity = 1;
  }

  /** Called by the game as the shaft widens. Outward only. */
  setBounds(lo, hi) { this.lo = lo; this.hi = hi; }

  get vxMax() { return lerp(VX_MAX_COLD, VX_MAX_HOT, this.momentum); }
  get speedFrac() { return Math.min(1, Math.abs(this.vx) / VX_MAX_HOT); }

  // The whole difficulty curve in one expression.
  jumpImpulse() {
    return (JUMP_V0_MIN
         + this.speedFrac * (JUMP_V0_MAX - JUMP_V0_MIN)
         + this.momentum * JUMP_MOMENTUM_BONUS) * this.bounce;
  }

  emit(type, data) { this.events.push({ type, ...data }); }

  step(dt, input, tower) {
    this.px = this.x;
    this.py = this.y;

    // HIS CLOCK. `dt` is the world's step; `h` is his, JUMP SPEED times as long. Everything
    // that moves him through space runs on `h` -- gravity, the jump and its cut, running,
    // friction, the air, the walls, momentum, the overdrive's bleed -- so at a rate of 1.2 he
    // flies the same arcs as at 1 in 1/1.2 of the time: the same heights and reaches, to the
    // integrator's resolution -- a plain jump within 0.3 units, a flat-out one off three walls
    // within 2.7 at 1.3, as a wall met inside a longer step is met at another instant of it
    // (tools/test-feel.mjs) -- and every tower reachable as it was. So does what his body does along the way (the squash, the landing
    // pose, the tuck's timer, the run cycle): at a faster clock a run cycle on the world's
    // time would skate his feet. What stays on `dt`: coyote time, which is a window for a
    // player's hands, not physics, and the air-time stat, which is seconds on the clock.
    // At rate 1, h IS dt (x * 1 is x to the bit), so the game as it was is unchanged.
    const h = dt * this.rate;
    const axis = input.axis;

    // --- horizontal -----------------------------------------------------------
    const accel = this.grounded ? ACCEL_GROUND : ACCEL_AIR;
    if (axis !== 0) {
      this.vx += axis * accel * h;
      this.facing = axis;
    } else if (this.grounded) {
      const f = FRICTION * h;
      if (Math.abs(this.vx) <= f) this.vx = 0;
      else this.vx -= Math.sign(this.vx) * f;
    }
    // The cap is lifted by whatever overdrive a combo bounce left behind, so the speed
    // that bounce gave is kept rather than bled off at FRICTION in 60 ms. Zero without
    // a combo, where this is the old cap exactly.
    this.overdrive = decayOverdrive(this.overdrive, h);
    const cap = this.vxMax + this.overdrive;
    if (this.vx > cap) this.vx = Math.max(cap, this.vx - FRICTION * h);
    if (this.vx < -cap) this.vx = Math.min(-cap, this.vx + FRICTION * h);

    // --- momentum -------------------------------------------------------------
    // Built by sustained speed, bled off by dawdling. This is what makes a long
    // uninterrupted run feel different from a standing start on the same floor.
    //
    // The fraction is measured against the CURRENT cap, not the absolute top speed.
    // Measuring it against VX_MAX_HOT deadlocks the whole mechanic: a player with no
    // momentum is capped at VX_MAX_COLD, which is 0.45 of VX_MAX_HOT -- exactly the
    // threshold -- so the meter gained 0.004/s and never moved. You could not go fast
    // without momentum and could not earn momentum without going fast. Against the
    // current cap, running flat out always counts, whatever flat out currently means.
    //
    // The EARNED cap, vxMax, not the one overdrive lifts. Overdrive is a bonus on top of
    // flat out, not a new definition of it: measured against the lifted cap, a player
    // steering at 250 units/s just after a 559 units/s combo bounce would read as
    // running at 45% -- walking -- and the meter would stop charging as a reward for
    // the best bounce in the game. (For the attract bot the two are a wash, 805 against
    // 809 floors/min, so this is a choice about what a human feels, not a tuning.)
    // Identical to the old line whenever there is no overdrive.
    //
    // And clamped at 1, because the other half of "a bonus on top of flat out" is that
    // it charges AS flat out and no faster. Unclamped, the charge rate scales with
    // runFrac past 1, and overdrive is the only thing that ever puts |vx| over vxMax: a
    // 559 units/s bounce against an earned cap of 190 read as running at 294%, and the
    // meter charged at up to twice MOM_UP (0.69/s measured, filling from empty in 2.5 s
    // instead of 2.9) -- the combo quietly buying the meter as well as the speed. With
    // no combo |vx| does not get past vxMax after the cap above, so this changes nothing
    // there either: checked bit for bit against the old line over 288,000 steps.
    const earned = this.vxMax;
    const runFrac = earned > 0 ? Math.min(1, Math.abs(this.vx) / earned) : 0;
    if (runFrac > MOM_RUN_THRESHOLD && Math.abs(this.vx) > VX_MAX_COLD * 0.55) {
      const k = (runFrac - MOM_RUN_THRESHOLD) / (1 - MOM_RUN_THRESHOLD);
      this.momentum = Math.min(1, this.momentum + MOM_UP * k * h);
    } else if (this.grounded) {
      this.momentum = Math.max(0, this.momentum - MOM_DOWN * h);
    } else {
      this.momentum = Math.max(0, this.momentum - MOM_DOWN * 0.25 * h);
    }
    const sf = this.speedFrac;

    // --- jump -----------------------------------------------------------------
    // The world's clock, not his (see `h` above): a grace for the hands, the same 0.09 s at
    // every JUMP SPEED.
    if (this.coyote > 0) this.coyote -= dt;
    const onGround = this.grounded || this.coyote > 0;
    // Holding jump re-fires the instant the feet touch down. This is the instajump:
    // it costs you the deceleration frame you would otherwise spend on the ground, so a
    // held chain keeps momentum and keeps a combo alive across landings.
    const held = input.jumpHeld && onGround;
    // A buffered press is TAKEN only where it makes a jump happen: on the ground, in
    // coyote time, or as an air jump that is banked and unlocked right now. Anywhere else
    // it is left in the buffer, which goes on counting down on the world's clock
    // (Input.step), and it fires on the step after he lands if he lands inside the window.
    //
    // This called consumeJump() every step, unconditionally, and a press made in the air
    // with no air jump to spend was taken there and thrown away -- so the jump buffer
    // (JUMP_BUFFER, 0.12 s), which exists for exactly "a jump pressed a few milliseconds
    // before touching down", was emptied before he touched down, and a tap 4 to 100 ms
    // before a landing did nothing at every JUMP SPEED. Only a HELD key jumped on landing
    // (through `held`). To a player that reads as input lag: a well-timed tap is ignored.
    // tools/test-tapjump.mjs sweeps the tap's timing and puts the old call back as a mutant.
    //
    // A press made with an air jump available still takes it at once (that is the design:
    // the tap in the air IS the double jump), and a held key still chains as before.
    // The replay records a press at the step consumeJump() returned true -- the step the
    // simulation used it -- so a press held over from the air is recorded on the landing
    // step that took it, and plays back there (replay.js, "The press is recorded where...").
    const usable = onGround || (this.airJumps > 0 && this.airUnlocked);
    const wantJump = (usable && input.consumeJump()) || held;
    if (wantJump) {
      if (onGround) {
        const insta = held && this.grounded;
        this.vy = this.jumpImpulse() * (insta ? INSTAJUMP_BONUS : 1);
        if (insta) this.instaChain++; else this.instaChain = 0;
        this.grounded = false;
        this.coyote = 0;
        this.squash = 1;
        // Air jumps are earned, not given: the meter has to be pinned at takeoff.
        this.airUnlocked = this.momentum >= AIR_JUMP_UNLOCK;
        // One air jump normally. The third only exists inside a combo long enough to
        // have earned it, and is banked at takeoff like the first.
        this.airJumps = this.airUnlocked
          ? (this.tripleUnlocked ? AIR_JUMPS_TRIPLE : AIR_JUMPS)
          : 0;
        // Remember how many were banked, because the event numbering is relative to
        // what was granted -- not to the AIR_JUMPS constant, which is only the default.
        this.airGranted = this.airJumps;
        this.emit('jump', { air: 0, power: this.speedFrac, insta, chain: this.instaChain });
      } else if (this.airJumps > 0 && this.airUnlocked) {
        const n = (this.airGranted || AIR_JUMPS) - this.airJumps + 1;  // 1 = double, 2 = triple
        this.airJumps--;
        // Take the better of a fresh scaled impulse or what is left of the old one,
        // so a double jump at the apex never feels like a punishment.
        this.vy = Math.max(this.vy, 0) * 0.35 + this.jumpImpulse() * AIR_JUMP_SCALE;
        this.spinT = 0.42;
        this.squash = 1;
        this.emit('airjump', { air: n, power: this.speedFrac });
      }
    }
    // Variable jump height: let go early, go less far.
    if (!input.jumpHeld && this.vy > 0) this.vy -= this.vy * JUMP_CUT * h * 10;

    // --- gravity + integrate --------------------------------------------------
    // HIS gravity and terminal speed: the run's GRAVITY setting (gravityOf, terminalOf).
    this.vy -= gravityOf(this) * h;
    const fall = terminalOf(this);
    if (this.vy < -fall) this.vy = -fall;            // terminal, keeps tunnelling honest
    this.x += this.vx * h;
    this.y += this.vy * h;

    // Distance is space, so it is his; time in the air is the clock's.
    this.distanceRun += Math.abs(this.vx) * h;
    if (!this.grounded) this.airTime += dt;

    // --- walls ----------------------------------------------------------------
    const halfW = PLAYER_W / 2;
    if (this.x - halfW < this.lo) {
      this.x = this.lo + halfW;
      this.bounceOffWall(1);
    } else if (this.x + halfW > this.hi) {
      this.x = this.hi - halfW;
      this.bounceOffWall(-1);
    }

    // --- platforms (one-way, top surface only) --------------------------------
    const wasGrounded = this.grounded;
    this.grounded = false;
    if (this.vy <= 0) {
      // Only floors the feet actually crossed this step can be landed on. At 240 Hz
      // and 900 px/s terminal velocity that is at most 4 px of travel, so the window
      // is one or two floors -- but scanning the crossed range instead of assuming
      // one is what stops tunnelling if a frame ever runs long.
      const fromFloor = Math.floor(this.py / FLOOR_H);
      const toFloor = Math.floor(this.y / FLOOR_H);
      for (let n = fromFloor; n >= toFloor - 1; n--) {
        if (n < 0) break;
        const p = tower.get(n);
        if (!p) continue;
        const top = p.y;
        if (this.py >= top - 0.001 && this.y <= top) {
          if (this.x + halfW > p.x && this.x - halfW < p.x + p.w) {
            this.y = top;
            this.vy = 0;
            this.grounded = true;
            this.airJumps = this.momentum >= AIR_JUMP_UNLOCK
              ? (this.tripleUnlocked ? AIR_JUMPS_TRIPLE : AIR_JUMPS)
              : 0;
            this.airGranted = this.airJumps;
            this.spinT = 0;
            this.coyote = COYOTE;
            // Squash is the IMPACT of landing, so it belongs on the frame the feet
            // arrive and nowhere else. It was assigned unconditionally, and this block
            // runs every frame the player is resting on a platform -- so `squash` was
            // pinned at -1 for as long as anyone stood still, and drawSprite draws a
            // squashed character 22% wider and 26% shorter. He has been standing
            // permanently squatted since the first sprite sheet.
            if (!wasGrounded) { this.squash = -1; this.landT = 0.12; }
            // The chain ends here, not at the next jump.
            //
            // It used to reset only inside the jump branch, on a jump taken WITHOUT the
            // key held -- so releasing the key and simply walking, or missing and
            // falling, left the old count standing indefinitely and the HUD kept showing
            // a chain that had been over for twenty seconds. A hold-to-jump chain is
            // broken by either of the two things that actually break it: touching down
            // without the key still held, or landing without having gained a floor.
            //
            // The progress condition is what stops the chain being farmed on the spot.
            // Holding jump while pinned against a wall bounces you on one platform
            // forever, and the counter happily climbed to CHAIN x10 and beyond while the
            // player went nowhere -- which is also, embarrassingly, what test-physics
            // used to assert as correct.
            if (!wasGrounded && (!input.jumpHeld || n <= this.floor)) this.instaChain = 0;
            if (!wasGrounded) this.emit('land', { floor: n, prevFloor: this.floor });
            this.floor = n;
            break;
          }
        }
      }
    }
    if (wasGrounded && !this.grounded && this.vy <= 0) this.coyote = COYOTE;

    // --- cosmetic springs -----------------------------------------------------
    this.squash -= this.squash * Math.min(1, h * 12);
    if (this.landT > 0) this.landT = Math.max(0, this.landT - h);
    if (this.spinT > 0) this.spinT -= h;
    this.animT += h * (1 + sf * 2.5);
  }

  bounceOffWall(dir) {
    const speed = Math.abs(this.vx);
    if (speed >= WALL_BOUNCE_MIN && !this.grounded) {
      // The combo drives it: see wallBounceOut and the WALL_COMBO block in constants.
      // With no combo this is the old bounce exactly -- 94% back and 45 units/s of lift,
      // which helps chains and never hurts reach.
      const boost = this.comboBoost;
      const vyIn = this.vy;
      const r = wallBounceOut(speed, vyIn, boost, this.vxMax);
      this.vx = dir * r.speed;
      this.vy = r.vy;
      if (r.overdrive > this.overdrive) this.overdrive = r.overdrive;
      this.facing = dir;
      this.spinT = Math.max(this.spinT, 0.3);
      this.emit('wallbounce', { speed, dir, boost, out: r.speed, vyIn, vyOut: r.vy });
    } else if (speed >= 20) {
      // Grounded kick-off. Keeps enough speed that turning around at a wall costs a
      // fraction of a second rather than the whole meter.
      this.vx = dir * speed * WALL_RESTITUTION_GROUND;
      this.emit('wallkick', { speed, dir });
    } else {
      this.vx = 0;
    }
  }

  drainEvents() { const e = this.events; this.events = []; return e; }
}
