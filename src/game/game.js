// Simulation driver: owns the world, the camera, the scoring and the run record.
// Contains no drawing. The renderer reads this; it never writes to it.

import { Tower, squeezeCue } from './generator.js';
import { CourseTower } from './course.js';
import { Player, wallComboBoost } from './player.js';
import { ComboTracker } from './combo.js';
import { HeightMilestones } from './milestones.js';
import { Particles } from '../render/particles.js';
import { stepFor, STEPS, FIXED } from '../render/sparks.js';
import { themeIndexFor, bandFor, THEMES, CYCLE_FLOORS } from './themes.js';

/**
 * The only shaft widths the screen can draw exactly.
 *
 * One art pixel must be one screen pixel, so the world scale k = zoom * PX must be a
 * whole number. At PX = 4 that means zoom in quarters -- 2, 1.75, 1.5, 1.25, 1 -- and
 * each of those admits exactly one shaft width that fills the view edge to edge. Five
 * steps from the starting box to the full arena.
 *
 * Every one of these also puts the view's left edge on a whole pixel (960, 720, 480,
 * 240, 0 at k = 8, 7, 6, 5, 4), so the world is placed exactly as well as scaled.
 * Exported for the replay's simulation fingerprint (replay.js), which hashes the widths.
 */
export const ARENA_STEPS = [2, 1.75, 1.5, 1.25, 1].map((zoom) => ({
  zoom,
  half: (VW / zoom - 2 * WALL_W) / 2,
}));
import {
  COMBO_TIERS, TAUNTS, DEATH_LINES, IDLE_LINES, SQUEEZE_CLOSING, SQUEEZE_OPENING, ASCENT_LINES, pickLine,
} from './flavour.js';
import { BLANK_RUN } from './stats.js';
import { randomSeed, Rng, mix32 } from '../core/rng.js';
import { Companions } from './companions.js';
// The SIZES of the drawn pieces he comes apart into, and where each one is on him. Not
// drawing: a piece's size decides where it can rest and when it touches the floor, so
// the simulation has to know it. sprites.js builds no canvas at load for this reason.
import { SPLAT_BITS, FALL_POSE, posePoint, halfHeight, halfWidth } from '../render/sprites.js';

import { COMPANION_LINES } from './compdialogue.js';
import {
  VW, VH, WALL_W, CX, PLAYER_H, FLOOR_H, CAM_ANCHOR, CAM_LERP, CAM_LOOKAHEAD,
  RISE_START_FLOOR, RISE_BASE, RISE_PER_FLOOR, RISE_MAX, RISE_LEAD, RISE_LEAD_MIN,
  RISE_LEAD_FADE, RISE_CATCHUP, IDLE_GRACE, IDLE_RISE_MULT, IDLE_RAMP, FLOORS_PER_THEME, DIFFICULTIES,
  VX_MAX_HOT, ARENA_HALF_MIN, ARENA_HALF_MAX, ARENA_OPEN_RATE, GRAVITY,
  TRIPLE_COMBO_FLOORS, FLOOR_GRAB, ASCENT_BOUNCE, ASCENT_SPEED, ASCENT_LAPS,
  PIT_BASE, PIT_PER_FLOOR, PIT_MAX, SPLAT_FLOOR, IMPACT_HOLD, IMPACT_HOLD_DAZED,
  CLIMB_WINDOW, CLIMB_MIN_SPAN,
  FALL_TERMINAL, FALL_GRAVITY, DANGER_RELEASE, STREAK_LET_GO, CLIMB_READ, CLIMB_CLEAR,
  FALL_CAM_AT, FALL_CAM_RATE,
  GIB_GRAVITY, GIB_BOUNCE, GIB_FRICTION, GIB_SPIN, GIB_REST, GIB_MAX_STRIKES,
  GIB_APEX_MIN, GIB_APEX_MAX, GIB_GAP, GIB_SPREAD,
  BLOOD_POOL_MIN, BLOOD_POOL_MAX, BLOOD_MARKS_MAX, SPATTER_MIN, SPATTER_MAX,
  FALL_WALL_BOUNCE, FALL_WALL_MIN, PLAYER_W, FALL_LET_GO,
  SLOWMO_SCALE, SLOWMO_EASE, PX, RISE_LATE_FROM, RISE_LATE_TO, RISE_LATE_MAX, FLOOR_POINTS,
  COMBO_GROUND_GRACE, ZOOM_EASE, ZOOM_SNAP, CALLOUT_LIFE, COMBO_STEP_BURST,
} from './constants.js';

export const STATE = {
  MENU: 'menu',
  PLAYING: 'playing',
  PAUSED: 'paused',     // frozen mid-run, nothing lost
  FALLING: 'falling',   // lost, but still on the way down
  DEAD: 'dead',         // scoreboard
  STATS: 'stats',
  HELP: 'help',
  OPTIONS: 'options',
  TUTORIAL: 'tutorial',   // the opening guide, over a live attract-mode game
};

export class Game {
  constructor(input) {
    this.input = input;
    this.particles = new Particles();
    this.combo = new ComboTracker(COMBO_TIERS);
    this.player = new Player();
    this.companions = new Companions(COMPANION_LINES);
    this.banners = [];
    this.floaters = [];
    this.shake = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.flash = 0;
    this.themeBlend = 0;
    this.slowmo = 0;
    this.timeScale = 1;
    this.deathLine = '';
    // The grand callout. One at a time, and rare by design -- seven to a lap of the tower,
    // at the heights in milestones.js -- so it lands instead of becoming wallpaper.
    this.heights = new HeightMilestones();
    this.shout = null;
    this.shoutT = 0;
    this.shoutX = 0;       // the floor within the lap it marks, for the sfx
    this.shoutLap = 0;     // the lap it was shouted on: from 2 it carries the prestige badge
    this.waiting = [];     // callouts and zone titles waiting for the screen; see showNext
    this.lastTier = -1;
    this.onDeath = null;
    // Attract mode. The demo is the game a player gets -- the real tower and the real fire,
    // at the settings newRun is given (autoplay.js startDemo: the game's defaults) -- and
    // `demo` changes only what the title screen cannot show: no height callouts (it draws
    // no HUD) and, in the renderer, no shake or flash and a dissolve at a zone change. The
    // menu restarts it if it ever loses, so a corpse is never left on the title screen.
    this.demo = false;
    this.newRun(randomSeed());
    this.state = STATE.MENU;
  }

  /**
   * A new run on `seed`. `course` (course.js) makes it a race on a ghost's own tower: its
   * floors are served from the ghost's run instead of generated, and the shaft is kept at
   * least as wide as the ghost's was (the arena update below). Without one -- every run but
   * a race -- the tower is generated exactly as it always was.
   *
   * `speed` is the run's JUMP SPEED (settings.js JUMP_SPEEDS): how fast his physics clock runs,
   * fixed for the run -- the player's setting for a run, for a race the ghost's or the player's
   * as the player answered before it (main.js startRun), the header's for a replay, the
   * game's default for the attract demo, 1 for anything that does not say. Third, after the course, so
   * a call with no speed is a 100% run.
   *
   * `platforms` is the run's PLATFORMS (settings.js PLATFORM_WIDTHS): its ledges' widths as a
   * multiple of the tower's own. 1, MEDIUM, when it is not said -- the tower every seeded test
   * and pin was taken on -- though a player's run defaults to SMALL (main.js passes the
   * setting). A race's course carries its ghost's, and a CourseTower goes by that.
   *
   * `difficulty` is the run's DIFFICULTY, an index into constants.js DIFFICULTIES: how fast the
   * fire rises and how close it follows. 0, EASY -- the fire as it always was -- when it is not
   * said; a player's run takes the setting (MEDIUM by default), a race its ghost's or the
   * player's, as the player answered before it.
   *
   * `gravity` is the run's GRAVITY (settings.js GRAVITIES): how heavy HE is, as a multiple of
   * GRAVITY (Player.gravity; player.js gravityOf). 1, NORMAL -- the game as tuned, to the bit --
   * when it is not said, which is also a player's default; a player's run takes the setting, a
   * race its ghost's or the player's (as for DIFFICULTY), a replay its header's, the attract
   * demo 1. Last, so every call written
   * before it (tests and tools pass the others by position) is a run at NORMAL.
   */
  newRun(seed = randomSeed(), course = null, speed = 1, platforms = 1, difficulty = 0, gravity = 1) {
    this.seed = seed >>> 0;
    // Drop a jump press still waiting from the run that ended. The buffer is counted down only
    // in PLAYING steps, so it would stay frozen there: since a press waits for the landing, a
    // tap in the last 0.12 s before the fire took him jumped on this run's first step when it
    // was started with Enter or the pad's Start (Input.dropStaleJump). A fresh press -- the
    // SPACE that starts the run -- is kept. The bot's and a replay's inputs have nothing to
    // drop (the bot never leaves a press waiting; see BOT.md) and do not offer it.
    if (this.input && typeof this.input.dropStaleJump === 'function') this.input.dropStaleJump();
    // The run's COSMETIC randomness, seeded from the run like the tower is. The shake, the
    // particles, the debris of the fall and the companions' bob drew from Math.random,
    // and the herald's lines from pickLine's default, Math.random too -- so the same seed
    // and the same keys gave the same climb with different sparks and different words,
    // and a replay could not look like the run it replays. Two streams: `fx`, which the
    // particle setting changes the draw count of (a LOW pool sheds fewer trail pieces),
    // and `lineRng`, drawn only at simulated events, so the lines stay the lines whatever
    // the particle setting. Neither feeds a simulated value: the simulation's own
    // randomness is the tower's Rng and the death's rngFloat, both from the seed.
    this.fx = new Rng(mix32(this.seed ^ 0x5eed0f1c));
    this.lineRng = new Rng(mix32(this.seed ^ 0x11a3e5d7));
    this.particles.rng = this.fx;
    const width = Number.isFinite(platforms) && platforms > 0 ? platforms : 1;
    // The attract demo's tower is a player's: the real generator, never the flow ramp it had
    // until 2026-09-29 (Tower's `flow`), so the title screen shows the game a run gets.
    this.tower = course ? new CourseTower(this.seed, course) : new Tower(this.seed, false, width);
    this.tower.ensure(24);
    this.player.reset();
    this.player.rate = Number.isFinite(speed) && speed > 0 ? speed : 1;
    this.player.gravity = Number.isFinite(gravity) && gravity > 0 ? gravity : 1;
    this.combo.reset();
    this.particles.clear();
    this.companions.reset();
    this.banners.length = 0;
    this.floaters.length = 0;
    this.run = BLANK_RUN();
    this.run.jumpSpeed = this.player.rate;
    this.ascent = 0;       // laps of the tower beaten, to ASCENT_LAPS: see ascend()
    this.run.platforms = this.tower.widthScale;
    this.difficulty = DIFFICULTIES[difficulty] ? difficulty : 0;
    this.run.difficulty = this.difficulty;
    this.run.gravity = this.player.gravity;
    this.arenaStep = 0;
    this.arenaEase = ARENA_STEPS[0].half;
    this.arenaHalf = ARENA_STEPS[0].half;
    this.openness = 0;
    this.zoom = ARENA_STEPS[0].zoom;
    this.zoomView = this.zoom;     // what the renderer scales by; see the arena update
    this.arenaHalfView = this.arenaHalf;   // ...and where it draws the walls
    this.viewH = VH / this.zoom;
    this.camY = -this.viewH * CAM_ANCHOR;
    // The death's own state -- set in die(), read by the fall -- starts every run level, so
    // a Game that has died before begins a run exactly like a fresh one. A replay plays on a
    // fresh Game and the replay suite compares the two value by value: fallPace, carried
    // over from the last death, was the first field it found different, and the fall's
    // camera speed was left `undefined`, which a snapshot copy does not keep as a field.
    this.fallIntensity = 0;
    this.fallPace = 0;
    this.crustDepth = 0;
    this.camStep = 0;
    this.camV = null;
    this.pcamY = this.camY;
    this.riseY = -1e9;
    this.riseActive = false;
    this.score = 0;
    this.themeIndex = 0;
    this.themeBlend = 0;
    this.shake = 0;
    this.flash = 0;
    this.slowmo = 0;
    this.timeScale = 1;
    this.idleFor = 0;
    this.lastTaunt = -Infinity;   // sim seconds; see scoreCombo
    this.lastTier = -1;
    this.squeezeSaid = -1;   // the last squeeze cue announced; see squeezeCue()
    this.climbLog = [];      // (seconds, best floor) samples for the climb rate
    this.elapsed = 0;
    this.airStreak = 0;
    this.trailT = 0;
    this.heights.reset();
    this.shout = null;
    this.shoutT = 0;
    this.shoutX = 0;
    this.shoutLap = 0;
    this.waiting.length = 0;
    // The first floors a race serves were laid out in the ghost's opening shaft, which is
    // this one; a course from a file that says otherwise still gets walls round them.
    if (course) this.widenForCourse();
    this.state = STATE.PLAYING;
  }

  /** How hard the live combo drives a wall bounce, 0..1. See wallComboBoost. */
  get wallBoost() { return wallComboBoost(this.combo.active ? this.combo.floors : 0); }

  /**
   * The run's JUMP SPEED, as it was set in newRun. Not the player's clock itself any more:
   * the ASCENSION quickens that (ascend), and the scoreboard's THIS RUN and a replay's header
   * say what the run was started at.
   */
  get jumpSpeed() { return this.run ? this.run.jumpSpeed : this.player.rate; }

  /** The run's PLATFORMS: the tower's width factor, set in newRun (a race's, its ghost's). */
  get platforms() { return this.tower.widthScale; }

  /** The run's GRAVITY, set in newRun: his (Player.gravity), which nothing changes mid-run. */
  get gravity() { return this.player.gravity; }

  get theme() { return THEMES[this.themeIndex]; }
  // The zone that actually comes next, asked of the schedule at the first floor past this
  // band. It used to be THEMES[themeIndex + 1], which is only true of the first cycle:
  // from floor 2300 each cycle is a fresh shuffle, so 34 of the 47 boundaries up to floor
  // 9200 named the wrong zone, and ZENITH, clamped, named itself, so 2300 had no fade at
  // all. While only the sky faded that barely showed; once the backdrop faded whole
  // layers it crossfaded into one zone and then snapped to another. Clamped at 0 because
  // the floor can be set below the ground from outside the climb -- tools/shot-death.mjs
  // writes run.maxFloor from --floor, any number (its own dazed default is 160) -- and
  // bandFor's own clamp would then name the zone on screen as the next one.
  get nextTheme() {
    const f = Math.max(0, this.run.maxFloor);
    const { into, len } = bandFor(f);
    return THEMES[themeIndexFor(f - into + len)];
  }

  /** A line from `list`, drawn from the run's own line stream (see newRun). */
  line(list) { return pickLine(list, () => this.lineRng.next()); }

  banner(text, colour, big = false, life = 1.5) {
    this.banners.push({ text, colour, big, life, maxLife: life });
    if (this.banners.length > 4) this.banners.shift();
  }

  floater(text, x, y, colour, scale = 1) {
    this.floaters.push({ text, x, y, vy: 34, life: 1.1, maxLife: 1.1, colour, scale });
    if (this.floaters.length > 24) this.floaters.shift();
  }

  addShake(mag) { this.shake = Math.min(7, Math.max(this.shake, mag)); }

  /**
   * The one piece of text the game shouts, and it only shouts it at a milestone.
   *
   * There used to be five sources of callout -- height crossings, hitting top speed,
   * held-jump chains, three wall bounces in a row, and the combo payoff -- firing
   * constantly and competing for the same line of screen through a rank system. Two of
   * them never worked at all: the height callouts compared against an uninitialised
   * `lastAnnouncedFloor`, so `floor > undefined` was always false and not one of the
   * eight ever fired; and `shoutT` was never decremented anywhere, so the first callout
   * of a run stayed on screen until the player died.
   *
   * A milestone is rare enough that it needs no rank. It is the thing worth interrupting
   * for -- with one exception, the zone titles, which it takes turns with (showNext).
   *
   * `m` is a height callout (milestones.js): { k, x, name, lap, floor }. It was the combo's
   * step, keyed by the chain's floor count 50 to 350; the payoff below is the one each word
   * had there, now by its place k (1 SWIFT to 7 GLORY, the old 50k floors): a flash of 0.8,
   * a shake of 5 then 6, seventy confetti thrown harder the higher the word.
   */
  announceMilestone(m) {
    if (!m) return;
    this.shout = m.name;
    this.shoutX = m.x;
    this.shoutLap = m.lap;
    this.shoutT = CALLOUT_LIFE;
    this.flash = 0.8;
    this.addShake(Math.min(6, 2.5 + 2.5 * m.k));
    const p = this.player;
    this.particles.burst(p.x, p.y + 14, 70,
      [this.theme.accent, this.theme.particle, '#ffffff'], 1.0 + (5 / 6) * m.k);
    // The lap goes along for the sound: from 2 the word carries its prestige badge.
    if (this.onAnnounce) this.onAnnounce(m.name, m.x, m.lap);
  }

  /**
   * A combo step: the chain's floor count reached step `s` (s * MULT_STEP floors, x1.5 at
   * the first). It used to be the callout -- word, flash, a shake of 5 to 6 -- and the
   * callouts are the tower's now. What a step keeps is a smaller payoff: a burst in the
   * colours the trail turns to at this step (sparks.js STEPS), so the stars falling out of
   * him and the burst change together, and a sound -- not through onComboStep, which
   * render/gamesounds.js sets to do nothing, but the hop ladder's step mark it plays for the
   * landing that crossed the step (sfxHop's `step`), so the step is one sound, not two. The
   * meter ticks over by itself. No word, no flash, no shake: a chain crosses a step every
   * few seconds, and a screen that flashed and shook on each would have nothing left for the
   * seven that matter.
   */
  comboStep(s) {
    const p = this.player;
    const row = STEPS[stepFor(this.combo.floors)];
    const cols = row.ramps.map((n) => (FIXED[n] ? FIXED[n][2] : this.theme.particle));
    this.particles.burst(p.x, p.y + 14, COMBO_STEP_BURST, [...cols, '#ffffff'], 1.1);
    if (this.onComboStep) this.onComboStep(this.combo.x, s);
  }

  /** Whether a height callout is on screen: fading counts, until its last frame. */
  get calloutOnScreen() { return !!this.shout && this.shoutT > 0; }

  /** Whether a zone's lettered title is on screen: a zone banner still alive in the stack. */
  get titleOnScreen() {
    for (const b of this.banners) if (b.zone !== undefined) return true;
    return false;
  }

  /**
   * A height callout or a zone title wants the screen: `{ callout }` or `{ zone }`.
   *
   * They take turns. GLORY is at the top of the lap by definition, which is exactly where the
   * next lap's first zone arrives -- the same step -- and RAMPAGE stands ten floors past the
   * zone change at 1300, a second behind it at speed: two words of that size lettered at once
   * over the top of the screen, a title's rays through a callout's glow, and neither read.
   * Before this, the callouts were the combo's, and a chain simply happened to cross a zone
   * now and then; the test only proved the two did not overlap in PIXELS (callouts above,
   * titles in the stack below), not that the eye could take both. Whichever arrives second
   * WAITS until the first has gone -- the callout's last fade step, the title's -- and then
   * comes in whole. Neither is ever dropped: a word or a zone name missed is a milestone of
   * the run the player never got. When one landing crosses both, the lower floor arrives
   * first (step): ABYSS at 1300 before RAMPAGE at 1310, and GLORY, on the lap's top floor
   * itself, before the next lap's first title.
   *
   * What waits is the text and its fanfare. The zone itself changes at the boundary -- the
   * backdrop, the HUD's skin, the music -- under the arrival's flash, which stays at the
   * boundary for that reason: it is what hides the skin switching (hudskin.js).
   */
  arrive(item) {
    this.waiting.push(item);
    this.showNext();
  }

  /** Put the first waiting callout or title on screen, if nothing of either kind is there. */
  showNext() {
    while (this.waiting.length && !this.calloutOnScreen && !this.titleOnScreen) {
      const it = this.waiting.shift();
      if (it.callout) this.announceMilestone(it.callout);
      else this.zoneTitle(it.zone);
    }
  }

  /**
   * THE ASCENSION: the run's best floor has reached the top of a lap -- he has beaten ZENITH
   * -- so his every jump goes ASCENT_BOUNCE times as high and his clock runs ASCENT_SPEED
   * times as fast, again for the second lap; ASCENT_LAPS count (constants.js). His speed
   * changes in the step it happens, in the air or not: the boost is felt at once. The
   * herald says so under GLORY and the next lap's title; the HUD keeps it at the top.
   */
  ascend() {
    const level = Math.min(ASCENT_LAPS, Math.floor(this.run.maxFloor / CYCLE_FLOORS));
    if (level <= this.ascent) return;
    this.ascent = level;
    const p = this.player;
    p.bounce = Math.sqrt(ASCENT_BOUNCE ** level);
    p.rate = this.run.jumpSpeed * ASCENT_SPEED ** level;
    // Pushed under-first: the stack draws the newest at its top.
    const [head, tail] = ASCENT_LINES[level - 1];
    this.banner(tail, '#ffe9a0', false, 3.2);
    this.banner(head, '#ffffff', false, 3.2);
  }

  /** A zone's title: its name at the top of the banner stack, a shake and a burst. */
  zoneTitle(zi) {
    const th = THEMES[zi];
    const p = this.player;
    this.addShake(5);
    this.banner(th.name, th.accent, true, 2.2);
    // Marked with the zone, so the HUD letters it in the zone's own material
    // (render/zonetitles.js) instead of printing the name in the plain font.
    this.banners[this.banners.length - 1].zone = zi;
    this.particles.burst(p.x, p.y + 12, 60,
      [th.accent, th.particle, th.platTop, '#ffffff'], 1.4);
  }

  riseRate() {
    // Two ramps. The first is untouched, so every floor below 453 rises exactly as fast
    // as it always did; the second is about a tenth as steep and carries on to the top
    // of the cycle, so a 2300-floor tower does not spend its last 1850 floors at a
    // difficulty that stopped climbing.
    const mf = this.run.maxFloor;
    const late = mf <= RISE_LATE_FROM ? 0
      : (RISE_LATE_MAX - RISE_MAX)
        * Math.min(1, (mf - RISE_LATE_FROM) / (RISE_LATE_TO - RISE_LATE_FROM));
    const base = Math.min(RISE_MAX, RISE_BASE + mf * RISE_PER_FLOOR) + late;
    // DIFFICULTY: EASY's 1 is the curve above, untouched. The attract demo's fire is a run's
    // at its DIFFICULTY (the game's default, autoplay.js startDemo): it ran at 0.55 of EASY's
    // (DEMO_RISE_SCALE) until 2026-09-29, when the demo became the game a player gets.
    return base * DIFFICULTIES[this.difficulty || 0].rise * this.idleUrgency();
  }

  /**
   * Dithering costs you. Past the grace period the floor accelerates toward the player,
   * so stopping to think is a decision with a price rather than a free pause.
   */
  idleUrgency() {
    const over = Math.max(0, (this.idleFor || 0) - IDLE_GRACE);
    return 1 + (IDLE_RISE_MULT - 1) * Math.min(1, over / IDLE_RAMP);
  }

  /**
   * How far the floor may trail the best floor reached. Closes in as you climb. `mf` is
   * for asking about a best floor he has not reached yet: the companions fly the line
   * forward past his next landing (risePath in companions.js).
   */
  riseLead(mf = this.run.maxFloor) {
    const k = Math.min(1, mf / RISE_LEAD_FADE);
    // DIFFICULTY: MEDIUM and HARD let the fire trail closer; EASY's 1 is the lead as it was.
    return (RISE_LEAD + (RISE_LEAD_MIN - RISE_LEAD) * k) * DIFFICULTIES[this.difficulty || 0].lead;
  }

  /**
   * In a race on a ghost's tower, step the arena up to what the floors served so far need
   * (CourseTower.shaftFor), with everything the arena update sets from it. Only ever wider.
   */
  widenForCourse() {
    const need = this.tower.shaftFor(this.run.maxFloor);
    if (need <= this.arenaStep) return;
    this.arenaStep = need;
    this.arenaHalf = ARENA_STEPS[need].half;
    this.zoom = ARENA_STEPS[need].zoom;
    this.viewH = VH / this.zoom;
    this.tower.setBounds(CX - this.arenaHalf, CX + this.arenaHalf);
    this.player.setBounds(CX - this.arenaHalf, CX + this.arenaHalf);
  }

  step(dt) {
    // A real pause: the simulation does not advance at all, and neither do the
    // cosmetic timers, so nothing drifts while you are away from the keyboard.
    if (this.state === STATE.PAUSED) {
      this.input.endFrame();
      return;
    }

    // THE RENDER ZOOM GLIDES; THE LOGIC ZOOM STEPS.
    //
    // `zoom` has to step. A fractional world scale resamples every sprite on its way to
    // the screen -- softly wrong, everywhere, all the time -- and test-scaling.mjs exists
    // because that shipped once, fractional across 96.7% of the arena's range. But
    // stepping it INSTANTLY snaps the whole view by 12.5% four times a run, which is what the
    // zoom-out reported as not smooth was: not a slow transition, no transition at all.
    //
    // UP HERE, not in the arena update, because the arena update only runs while PLAYING.
    // Left there, a glide interrupted by a death froze mid-transition and stayed there:
    // the entire death animation then rendered at a world scale of 7.03, every pixel of
    // it resampled, for as long as the body lay on the floor.
    this.zoomView += (this.zoom - this.zoomView) * Math.min(1, ZOOM_EASE * dt);
    if (Math.abs(this.zoomView - this.zoom) < ZOOM_SNAP) this.zoomView = this.zoom;

    // THE WALLS GLIDE WITH IT.
    //
    // arenaHalf is GAMEPLAY -- it is where platforms may be committed and where the
    // player bounces -- so it steps with the zoom and must. But it is also what the walls
    // are DRAWN at, and a stepped wall inside a gliding view is the whole zoom-out
    // reading as a jolt: the view widens smoothly while the shaft it contains snaps
    // outward in one frame. Rendering gets its own eased copy; nothing about the
    // simulation reads it.
    this.arenaHalfView += (this.arenaHalf - this.arenaHalfView) * Math.min(1, ZOOM_EASE * dt);
    if (Math.abs(this.arenaHalfView - this.arenaHalf) < 0.05) this.arenaHalfView = this.arenaHalf;
    if (this.state === STATE.FALLING) {
      this.stepFalling(dt);
      this.particles.step(dt);
      this.decayFx(dt);
      this.input.endFrame();
      return;
    }
    if (this.state !== STATE.PLAYING) {
      this.particles.step(dt);
      this.decayFx(dt);
      this.input.endFrame();
      return;
    }

    // Brief hit-stop after a big combo. Applied to simulated time, not to the frame
    // rate, so it reads as slow motion instead of a stutter.
    // Slow motion, EASED. This used to be `dt *= 0.35` the instant a big combo landed
    // and back to full speed 200 ms later -- a hard three-times time change with no ramp
    // at either end. On a 160 Hz display, where everything else is smooth, an abrupt
    // discontinuity in the rate of time does not read as drama; it reads as the game
    // stuttering. And because the same block fires the white taunt banner, the text and
    // the hitch arrive together, so the text gets the blame.
    //
    // Eased in and out over about 80 ms, and a gentler floor: 0.55 is still obviously
    // slow motion without feeling like a dropped frame.
    if (this.slowmo > 0) this.slowmo -= dt;
    const tsTarget = this.slowmo > 0 ? SLOWMO_SCALE : 1;
    this.timeScale += (tsTarget - this.timeScale) * Math.min(1, dt * SLOWMO_EASE);
    if (Math.abs(this.timeScale - 1) < 0.004) this.timeScale = 1;
    dt *= this.timeScale;

    this.elapsed += dt;
    this.run.seconds = this.elapsed;

    this.input.step(dt);
    // The third air jump is a reward for a combo this run has actually sustained.
    this.player.tripleUnlocked = this.combo.floors >= TRIPLE_COMBO_FLOORS;
    // ...and so is the drive behind a wall bounce, which grows with the chain. Read from
    // the LIVE combo, and zero when none is running, so without a chain the walls
    // bounce exactly as they always did. The attract bot reads the same getter.
    this.player.comboBoost = this.wallBoost;

    this.player.step(dt, this.input, this.tower);

    // A combo ends when you STOP. Standing on a platform runs a clock; jumping again
    // before it expires keeps the chain, loitering ends it. Without this a chain at full
    // momentum could not be broken by anything except falling, so the multiplier sat on
    // screen climbing while the player stood still.
    //
    // AFTER player.step, not before: `grounded` is decided in there, and reading it
    // first tests last frame's answer. On the world's clock at any JUMP SPEED: the grace is
    // the time a player's hands get to jump again, like the jump buffer and coyote time.
    if (this.player.grounded) {
      const ended = this.combo.onGrounded(dt, COMBO_GROUND_GRACE);
      if (ended) this.scoreCombo(ended);
    } else {
      this.combo.onAirborne();
    }

    // The best chain is tracked LIVE, not only when one closes.
    //
    // run.bestCombo was written in scoreCombo(), which only runs when a combo ENDS. A
    // chain now survives as long as you keep moving and climbing, so a strong run can
    // hold ONE chain for over a thousand floors and close it never -- and the run's
    // "best combo" stayed at whatever small chain happened to break early. The audit
    // read 92 floors on runs whose real best chain was 1120.
    if (this.combo.active && this.combo.floors > this.run.bestCombo) {
      this.run.bestCombo = this.combo.floors;
    }
    this.combo.step(dt);
    this.handleEvents();

    const p = this.player;

    // --- idling -------------------------------------------------------------
    // Counted before the camera block, because riseRate() reads it.
    if (Math.abs(p.vx) < 8 && p.grounded) {
      this.idleFor += dt;
      if (this.idleFor > 3.2) {
        this.banner(this.line(IDLE_LINES), this.theme.accent, false, 1.6);
        this.idleFor = 0;
      }
    } else {
      this.idleFor = 0;
    }

    // --- run record ---------------------------------------------------------
    this.run.floor = p.floor;
    let called = null;     // a height callout this step crossed; it arrives with the zone, below
    if (p.floor > this.run.maxFloor) {
      const was = this.run.maxFloor;
      this.score += (p.floor - this.run.maxFloor) * FLOOR_POINTS;
      this.run.maxFloor = p.floor;
      this.ascend();
      // The height callouts, off the best floor, which only rises: falling back and
      // climbing past one again cannot fire it twice. Not in attract mode: the title screen
      // draws no HUD, so a demo callout was a white flash and a shake with no word behind it
      // (the menu draws the bot's game bare) -- the combo's did that whenever the bot held a
      // chain past 50. The count still advances, so nothing is owed if the demo is watched.
      const m = this.heights.climb(was, p.floor);
      if (m && !this.demo) called = m;
    }
    this.run.score = this.score;
    this.run.distance = p.distanceRun;
    this.run.airTime = p.airTime;

    const spd = Math.abs(p.vx);
    if (spd > this.run.topSpeed) this.run.topSpeed = spd;
    this.trackClimb();

    if (!p.grounded) {
      this.airStreak += dt;
      if (this.airStreak > this.run.longestAir) this.run.longestAir = this.airStreak;
    } else {
      this.airStreak = 0;
    }

    // --- theme band ---------------------------------------------------------
    const ti = themeIndexFor(this.run.maxFloor);
    // Zones are not all the same length, so the blend below asks the schedule how long THIS
    // one is rather than dividing by a single constant -- with a short opening zone a
    // modulo puts every boundary after the first in the wrong place.
    const { into, len } = bandFor(this.run.maxFloor);
    if (ti !== this.themeIndex) {
      this.themeIndex = ti;
      this.run.themesSeen = Math.max(this.run.themesSeen, ti + 1);
      // One landing can cross a zone's first floor and a callout's floor together: a hop
      // from 1299 to 1315 crosses ABYSS at 1300 and RAMPAGE at 1310. They arrive in the order
      // of their HEIGHTS, the first shown and the second waiting its turn (arrive). The callout
      // used to go first in every such landing, because the best floor is raised above this
      // block: RAMPAGE was shouted over a backdrop already changed, and ABYSS's name came
      // 1.6 s after its flash -- or the other way round when the hop happened to land on 1300
      // to 1309 first, so the order depended on how long the hop was. GLORY stands on the
      // zone's first floor itself, the top of the lap, and goes first, as it always did (its
      // flash of 0.8 is raised to the boundary's 1 just below).
      if (called && called.floor <= this.run.maxFloor - into) { this.arrive({ callout: called }); called = null; }
      // The flash stays with the boundary, where the skin and the backdrop change under it;
      // the title, its shake and its burst may wait for a callout to go (arrive).
      this.flash = 1;
      this.arrive({ zone: ti });
    }
    if (called) this.arrive({ callout: called });
    // Fade the next band in over the last 12 floors, so the change is anticipated
    // rather than a jump cut.
    this.themeBlend = into >= len - 12 ? ((into - (len - 12)) / 12) * 0.75 : 0;

    // --- the squeeze --------------------------------------------------------
    // Past floor 2100 the ledges narrow and widen on a long cycle. Said once as each
    // squeeze starts to close and once as it starts to let go -- a warning and a relief,
    // on the small banner, and nothing else: the ledges themselves are the real signal.
    // Keyed to the best floor, which only rises, so a fall back through a cue never
    // repeats it. Asked of the tower first: a flow tower does not breathe, and announcing a
    // squeeze its ledges never make would be a lie. (The attract demo climbed one until
    // 2026-09-29; its tower breathes now, and the title screen draws no banner either way.)
    const cue = this.tower.squeezes ? squeezeCue(this.run.maxFloor) : -1;
    if (cue > this.squeezeSaid) {
      this.squeezeSaid = cue;
      const closing = cue % 2 === 0;
      this.banner(this.line(closing ? SQUEEZE_CLOSING : SQUEEZE_OPENING),
        closing ? this.theme.accent : '#ffffff', false, 1.8);
    }

    // --- the trail ----------------------------------------------------------
    // Keyed to the LIVE chain, not only to speed. It was a square speck every 22 ms in the
    // zone's colour while momentum was over 0.35, so a 300-floor combo looked exactly like
    // one fast jump. The chain now decides how much falls out of him and what it looks
    // like (sparks.js); with no chain running it is still the speed trail.
    this.particles.comboTrail(dt, p, this.combo.active ? this.combo.floors : 0, this.themeIndex);

    // --- the shaft opens up -------------------------------------------------
    // Three inputs, so there is never a deadlock: climbing alone will open it. That
    // matters because you cannot build the speed meter in a shaft that has not opened
    // yet, and tying the walls to speed alone would lock a slow player in a box.
    // Ratcheted, never shrinks -- platforms committed inside a narrow shaft have to
    // stay legal, and a wall closing on the player would be indefensible.
    const floorProg = Math.min(1, this.run.maxFloor / 60);
    // The LIVE chain counts toward opening the shaft, not just banked ones.
    //
    // run.comboFloors only accumulates when a combo closes, and chains now survive as
    // long as you keep climbing -- so a run holding one enormous chain contributed
    // NOTHING here and the shaft stayed shut. Exactly backwards: sustaining a chain is
    // the strongest evidence there is that the player has earned more room.
    const comboProg = Math.min(1,
      (this.run.comboFloors + (this.combo.active ? this.combo.floors : 0)) / 140);
    const openTarget = Math.min(1, 0.45 * floorProg + 0.20 * comboProg + 0.35 * p.momentum);
    if (openTarget > this.openness) this.openness = openTarget;

    // The shaft widens in STEPS, and the steps are chosen by the zoom, not the other
    // way round.
    //
    // This was the wrong way round for an hour and it showed. Quantising the zoom while
    // the arena kept easing continuously meant the two disagreed on every frame: the
    // view snapped to one of five widths and held, while the walls slid smoothly inside
    // it. What that looks like is walls that refuse to zoom out and then judder -- which
    // is exactly what was reported.
    //
    // They cannot be allowed to disagree. The shaft must exactly fill a view whose scale
    // has to be a whole number of pixels, so the shaft's width is not free: it is one of
    // the five widths that a whole-numbered zoom can show. `openness` still rises
    // smoothly and still decides WHEN to widen; it just no longer decides by how much.
    //
    // Ratcheted, never shrinks. Platforms committed inside a narrow shaft have to stay
    // legal, and a wall closing on the player would be indefensible.
    const wantHalf = ARENA_HALF_MIN + (ARENA_HALF_MAX - ARENA_HALF_MIN) * this.openness;
    // The EASE still exists -- it just no longer decides the width, only when to step.
    //
    // Dropping it entirely (which the first version of this did) made the shaft snap to
    // full width the instant `openness` allowed it, where before it crept there over
    // several seconds. The tower opened much earlier than it used to, platforms spread
    // out sooner, and the bot's climb rate, air-jump rate, top-speed share and best
    // chain all fell below their thresholds at once. Those four numbers are how this
    // codebase notices that the GAME changed, not just the rendering.
    if (wantHalf > this.arenaEase) {
      this.arenaEase += (wantHalf - this.arenaEase) * Math.min(1, ARENA_OPEN_RATE * dt);
    }
    // Step to the NEAREST width, not the last one passed.
    //
    // Taking the last step crossed makes the shaft narrower than the ease everywhere
    // between steps -- on average half a step, and the steps are large. Measured against
    // the continuous arena that cost the bot a hundred floors a minute and a third of
    // its air jumps. Rounding to whichever step is closer halves the error and cannot
    // run ahead of the ease by more than half a step.
    while (this.arenaStep + 1 < ARENA_STEPS.length
           && this.arenaEase >= (ARENA_STEPS[this.arenaStep].half
                                 + ARENA_STEPS[this.arenaStep + 1].half) / 2) {
      this.arenaStep++;
    }
    // A race on the ghost's own tower: the shaft is the wider of the racer's and the ghost's
    // (course.js has why), still stepped and still ratcheted -- this only ever raises it.
    // Normal runs have no course and never come in here.
    if (this.tower.course) {
      const need = this.tower.shaftFor(this.run.maxFloor);
      if (need > this.arenaStep) this.arenaStep = need;
    }
    this.arenaHalf = ARENA_STEPS[this.arenaStep].half;
    this.zoom = ARENA_STEPS[this.arenaStep].zoom;
    this.viewH = VH / this.zoom;


    const lo = CX - this.arenaHalf;
    const hi = CX + this.arenaHalf;
    this.tower.setBounds(lo, hi);
    p.setBounds(lo, hi);

    // --- camera -------------------------------------------------------------
    // Locked to the character, in BOTH directions. Falling is no longer fatal in
    // itself: the view comes down with you, and the rising floor below is the only
    // thing that can end a run. A missed jump becomes a setback you can see and
    // recover from instead of an instant loss.
    // The lookahead has to be CLAMPED. Unclamped it is p.vy * 0.10, and vy reaches
    // terminal at 1400 px/s, so it swings the camera by up to 140 px against a viewport
    // only 135 px tall -- more than a full screen of travel driven by nothing but how
    // fast you happen to be moving vertically. Falling, that drove the view down hard
    // enough to push the player and the kill line off the TOP of the screen, and on
    // every ordinary jump it swung the view across the kill line's draw cutoff and back,
    // which is most of why the red zone appeared to blink in and out at random.
    const look = Math.max(-this.viewH * 0.12,
      Math.min(this.viewH * 0.12, p.vy * CAM_LOOKAHEAD));
    const targetY = p.y + look - this.viewH * CAM_ANCHOR;
    const camWas = this.camY;
    // On HIS clock (p.rate, JUMP SPEED): a follower on the world's lags a man moving s times
    // as fast s times as far, and at 1.3 a launch carried him that much nearer the top edge.
    // At his rate the camera frames him in space exactly as at 1 (companions.js camPath flies
    // the same camera forward and reads the same rate).
    this.camY += (targetY - this.camY) * Math.min(1, CAM_LERP * dt * p.rate);
    // How far the view moved this step, so the fall's camera carries on at the same speed
    // rather than starting from its own (see stepFalling).
    this.camStep = this.camY - camWas;

    // --- the rising floor ---------------------------------------------------
    if (!this.riseActive && this.run.maxFloor >= RISE_START_FLOOR) {
      this.riseActive = true;
      this.riseY = this.camY - this.viewH * 0.3;
    }
    if (this.riseActive) {
      this.riseY += this.riseRate() * dt;
      // Sprinting ahead buys slack but never removes the threat: it closes to a fixed
      // maximum distance behind the highest floor reached.
      const bestY = this.run.maxFloor * FLOOR_H;
      const lead = this.riseLead();
      // Ease toward the maximum trail, never assign to it. See RISE_CATCHUP.
      const target = bestY - lead;
      if (this.riseY < target) {
        this.riseY = Math.min(target, this.riseY + RISE_CATCHUP * dt);
      }
    }

    this.tower.ensure(Math.floor((this.camY + this.viewH) / FLOOR_H) + 6);
    // The floors just served may be ones the ghost's run laid out in a wider shaft than this
    // step's: widen now, not at the next step, so no served ledge is outside the walls at the
    // end of any step (floors served between steps -- a bot's or the renderer's look ahead --
    // are covered by the arena update above, before anything can reach them).
    if (this.tower.course) this.widenForCourse();
    // Prune against the rising floor, never the camera: everything above the rise can
    // still be landed on after a fall. Before the rise arms, nothing is unreachable
    // yet, so nothing is dropped.
    if (this.riseActive) {
      this.tower.prune(Math.floor((Math.min(this.camY, this.riseY) - 200) / FLOOR_H));
    }

    // --- death --------------------------------------------------------------
    // Proper contact: the instant the line reaches the soles of his feet, it has him.
    // The old test waited until the body was 35% submerged, which meant the red band
    // visibly swallowed his legs for a moment first and the whole thing read as the
    // collision being late and approximate.
    if (this.riseActive && p.y <= this.riseY) this.caughtByFloor();

    // CLIMB!, latched: see climbWarning.
    if (this.state === STATE.PLAYING) {
      const d = this.danger;
      if (!this.riseActive || d >= CLIMB_CLEAR) this.climbOn = false;
      else if (!this.climbOn && d < 0.3 && this.floorETA() > CLIMB_READ) this.climbOn = true;
    }

    // Not in the step that killed him: die() has just stood them still (Companions.freeze),
    // and one more step here moved them on again, a step from where they are drawn.
    if (this.state === STATE.PLAYING) this.companions.step(dt, this);

    this.particles.step(dt);
    this.decayFx(dt);
    // A callout or title that was waiting comes in the step the one before it has gone.
    if (this.state === STATE.PLAYING) this.showNext();
    this.input.endFrame();
  }

  handleEvents() {
    const p = this.player;
    for (const ev of p.drainEvents()) {
      switch (ev.type) {
        case 'jump':
          this.run.jumps++;
          this.particles.landing(p.x, p.y, 0.25 + ev.power * 0.4, this.theme.particle);
          if (ev.insta) {
            this.run.instaJumps++;
            if (ev.chain > this.run.bestInstaChain) this.run.bestInstaChain = ev.chain;
            // Every third landing in a held chain pays into the combo multiplier. Not
            // every one: holding jump is already its own reward through the momentum
            // you keep, and paying per landing would make the multiplier runaway.
            if (ev.chain >= 3 && ev.chain % 3 === 0) {
              this.combo.onInstaChain();
              this.floater('CHASE ' + ev.chain, p.x, p.y + 22, stepFor(this.combo.floors), 1);
            }
          }
          break;

        case 'wallkick':
          this.run.wallKicks++;
          this.particles.wallBounce(ev.dir > 0 ? p.x - 8 : p.x + 8, p.y + 6,
            ev.dir, ev.speed * 0.6, this.theme.particle);
          break;

        case 'airjump':
          this.run.jumps++;
          if (ev.air === 1) this.run.doubleJumps++; else this.run.tripleJumps++;
          this.combo.onAirJump(ev.air);
          this.particles.airJump(p.x, p.y + 11, ev.air,
            ev.air === 1 ? this.theme.accent : '#ffffff');
          // Every floater is coloured by the combo step it is thrown at (the trail's colours,
          // render/callouts.js), where it was the zone's accent or white whatever the chain.
          this.floater(ev.air === 1 ? 'TWICE' : 'THRICE!', p.x, p.y + 26,
            stepFor(this.combo.floors), ev.air === 1 ? 1 : 2);
          this.addShake(ev.air === 1 ? 1.5 : 3);
          break;

        case 'wallbounce': {
          this.run.wallBounces++;
          this.combo.onWallBounce();
          // The walls move, so the spark has to be spawned at the live wall.
          const wx = ev.dir > 0 ? CX - this.arenaHalf : CX + this.arenaHalf;
          // The feedback grows with the combo drive, so a chain-driven bounce LOOKS
          // like the harder bounce it is: the spark spray is thrown with up to 45% more
          // speed (which also buys a few more sparks -- wallBounce counts them off the
          // speed), the shake gains at most one unit, and past half boost the floater
          // gains an exclamation mark. Only the floater gets loud, and only near the
          // top: from 0.85 -- about 220 combo floors, where a bounce returns 116% --
          // it is white and double size. The spray and shake stay small on purpose,
          // because deep in a long run every bounce is a full-boost bounce, fifty a
          // minute, and a screen that shakes hard on every one of them has nothing
          // left to shake with. Boost 0 is the old feedback exactly.
          const b = ev.boost || 0;
          this.particles.wallBounce(wx, p.y + 11, ev.dir, ev.speed * (1 + 0.45 * b),
            this.theme.accent);
          this.addShake(1 + Math.min(3, ev.speed / 110) + b);
          if (ev.speed > 200) {
            const step = stepFor(this.combo.floors);
            if (b >= 0.85) this.floater('BOUNCE!', p.x, p.y + 24, step, 2);
            else this.floater(b >= 0.5 ? 'BOUNCE!' : 'BOUNCE', p.x, p.y + 24, step, 1);
          }
          break;
        }

        case 'land': {
          const gain = ev.floor - ev.prevFloor;
          this.particles.landing(p.x, p.y,
            Math.min(1, Math.abs(p.vy) / 500 + gain / 12), this.theme.platTop);
          this.addShake(Math.min(3, gain * 0.35));
          const plat = this.tower.get(ev.floor);
          if (plat && plat.kind === 'checkpoint') {
            // Once per checkpoint per run: a player stood on one landing on it again was
            // counted every time. handleEvents runs before maxFloor is raised below.
            if (ev.floor > this.run.maxFloor) this.run.checkpoints++;
            this.particles.burst(p.x, p.y + 8, 26, [this.theme.accent, '#ffffff'], 0.9);
          }
          if (gain >= 2) this.run.perfectHops++;
          const result = this.combo.onLand(gain);
          // A step pays out mid-chain, which nothing used to do: every reaction in this
          // game hung off the combo BREAK, so the payoff always arrived after the moment it
          // was celebrating. It shouted the step's word here until the words became the
          // tower's (milestones.js); what is left is comboStep's burst, and the hop's step
          // mark that gamesounds.js plays for this landing.
          if (this.combo.stepped) this.comboStep(this.combo.stepped);
          if (result) this.scoreCombo(result);
          break;
        }
      }
    }
  }

  /**
   * Throw him apart. One body per drawn piece, each with its own velocity and spin.
   *
   * They used to be placed: nine fixed offsets, seeded off the run so at least they did
   * not shimmer. Placed pieces are a diagram of a death rather than a death -- the same
   * arrangement every time, nothing settling, nothing reacting to the speed he arrived
   * at. These are simulated.
   *
   * And then they were simulated with nothing in charge of where they ended, which was
   * its own kind of wrong. All nine started in one clump six to sixteen units above the
   * floor rather than from his body; they came to rest standing upright on top of each
   * other; and each one's resting height ignored which way up it had landed, so a leg
   * that came down on its side hung in the air by half its length or sank into the floor
   * by as much, then snapped to a quarter turn when it stopped.
   *
   * Now every piece bursts from where that part of him WAS -- his head high, his legs
   * low, his arms at his sides, all turned with whatever quarter turn the tumble was on
   * -- and has its resting place mapped out on the floor before it has moved at all: a
   * spot of its own, side by side with the others, lying down. Its bounces are then
   * steered onto that spot and its spin onto that orientation, so it arrives already
   * lying the way it will stay. Nothing snaps. Everything is seeded off the run.
   */
  burstGibs(p, dt) {
    const sev = this.severity || 0;
    const q0 = ((Math.floor(this.tumble) % 4) + 4) % 4;
    const flip = p.facing < 0;
    const lo = CX - this.arenaHalf, hi = CX + this.arenaHalf;
    this.gibs = SPLAT_BITS.map((bit, i) => {
      const at = posePoint(FALL_POSE, bit.anchor.ax, bit.anchor.ay, flip, q0);
      const rot = (q0 * Math.PI) / 2;
      // Never nearer a wall than its widest possible turn reaches, so no spin can put
      // it through one -- and a target and a start both inside that band mean the
      // straight line between them never touches a wall either.
      const reach = Math.hypot(bit.w, bit.h) / 2 + 0.25;
      const x = Math.max(lo + reach, Math.min(hi - reach, p.x + at.x));
      const y = Math.max(this.pitY + halfHeight(bit.w, bit.h, rot) + 0.5, p.y + at.y);
      return {
        // Mirrored with him when he faced left -- except the shield. Lying on its own on
        // the floor it is an object, not his left arm, and the arms of the Grand Duchy
        // drawn backwards are not the arms of the Grand Duchy (see FRONT_FRAMES).
        i, role: bit.role, w: bit.w, h: bit.h, flip: flip && bit.role !== 'shield', reach,
        x, y, px: x, py: y, rot, prot: rot,
        vx: 0, vy: 0, vrot: 0, rest: false, restT: -1,
        seg: 0, K: 0, rotAt: [], tx: x, tq: 0, trot: rot,
      };
    });
    this.planLandings(p.x, sev);
    for (const g of this.gibs) this.planGib(g, sev, dt);

    // MORE BLOOD THE FURTHER HE FELL. A pool under the impact that spreads (the
    // renderer grows it over BLOOD_POOL_T), and droplets thrown out past it, landing a
    // moment later the further they went. Both sized by severity, both seeded.
    this.blood = [];
    this.bloodPool = { x: p.x, w: BLOOD_POOL_MIN + (BLOOD_POOL_MAX - BLOOD_POOL_MIN) * sev };
    this.spatter = [];
    const drops = Math.round(SPATTER_MIN + (SPATTER_MAX - SPATTER_MIN) * sev);
    for (let k = 0; k < drops; k++) {
      const side = k % 2 ? 1 : -1;
      const dist = 4 + (0.2 + this.rngFloat() * 1.5) * this.bloodPool.w;
      this.spatter.push({
        x: Math.max(lo + 1, Math.min(hi - 1, p.x + side * dist)),
        h: this.rngFloat() * 16,               // how far back up the floor's surface
        s: this.rngFloat() < 0.3 ? 2 : 1,      // art pixels
        t: 0.04 + dist / 170,                  // flying out at 170 units/s
      });
    }
  }

  /**
   * Where each piece will LIE, decided at the burst.
   *
   * Side by side across the floor, each in a slot as wide as its longest side (it will
   * lie down), with a seeded gap between neighbours that widens with severity -- then
   * the whole row centred on the impact and clamped between the walls. Ordered by where
   * the pieces start, give or take a few units, so the left-hand pieces go left and the
   * paths do not cross more than a real burst's would.
   *
   * If the floor is too narrow for all of them to lie flat -- it is not, on any arena
   * this game has, but a future sheet could draw bigger pieces -- the row is squeezed
   * evenly and they overlap as little as possible rather than some of them landing in
   * the wall.
   */
  planLandings(cx, sev) {
    const lo = CX - this.arenaHalf, hi = CX + this.arenaHalf;
    const order = this.gibs
      .map((g) => ({ g, k: g.x + (this.rngFloat() - 0.5) * 10 }))
      .sort((a, b) => a.k - b.k)
      .map((o) => o.g);
    const n = order.length;
    if (!n) return;
    const L = order.map((g) => Math.max(g.w, g.h));
    const sumL = L.reduce((t, v) => t + v, 0);
    const edgeL = order[0].reach - L[0] / 2;
    const edgeR = order[n - 1].reach - L[n - 1] / 2;
    const room = hi - lo - edgeL - edgeR;
    let gaps = order.slice(1).map(() => GIB_GAP + this.rngFloat() * GIB_SPREAD * (0.4 + sev));
    let sumG = gaps.reduce((t, v) => t + v, 0);
    if (sumL + sumG > room && sumG > 0) {
      const k = Math.max(0, (room - sumL) / sumG);
      gaps = gaps.map((v) => v * k);
      sumG *= k;
    }
    const span = sumL + sumG;
    const squeeze = span > room ? room / span : 1;
    const left = squeeze < 1
      ? lo + edgeL
      : Math.max(lo + edgeL, Math.min(hi - edgeR - span, cx - span / 2));
    let at = left;
    order.forEach((g, i) => {
      g.tx = Math.max(lo + g.reach, Math.min(hi - g.reach, at + (L[i] / 2) * squeeze));
      at += (L[i] + (gaps[i] || 0)) * squeeze;
      // Lying down: its longer side along the floor. Which of the two ways up is a coin.
      const lying = g.w >= g.h ? 0 : 1;
      g.tq = (lying + (this.rngFloat() < 0.5 ? 0 : 2)) % 4;
    });
  }

  /**
   * One hop, exactly as stepGibs will integrate it: vertical speed, height and turn, with
   * the floor lifting a piece that turns into it on the way up. Returns true on a strike.
   *
   * Shared by the step and the planner so that what is predicted is what happens -- a
   * prediction with its own arithmetic is off by a step on every hop, and the error is
   * how far off its spot a piece comes to rest.
   */
  gibHop(s, dt) {
    s.vy -= GIB_GRAVITY * dt;
    s.y += s.vy * dt;
    s.rot += s.vrot * dt;
    const hh = halfHeight(s.w, s.h, s.rot);
    if (s.y - hh > this.pitY) return false;
    if (s.vy <= 0) return true;
    s.y = this.pitY + hh;
    return false;
  }

  /** Steps to the next strike from (y, vy) turning at vrot, and the speed it strikes at. */
  gibFlight(g, y, vy, rot, vrot, dt) {
    const s = { w: g.w, h: g.h, y, vy, rot, vrot };
    let n = 0;
    while (n < 4000) {
      n++;
      if (this.gibHop(s, dt)) break;
    }
    return { n, hit: -s.vy };
  }

  /** The spin that turns a piece from `rot` to exactly `target` over one hop, and that
   *  hop's length. The two depend on each other -- a turning piece's lowest point moves
   *  -- so it is solved by iterating; it settles in two or three passes. */
  gibSolveHop(g, y, vy, rot, target, dt) {
    let f = this.gibFlight(g, y, vy, rot, 0, dt);
    for (let it = 0; it < 6; it++) {
      const vrot = (target - rot) / (f.n * dt);
      const f2 = this.gibFlight(g, y, vy, rot, vrot, dt);
      if (f2.n === f.n) { f = f2; break; }
      f = f2;
    }
    return { n: f.n, hit: f.hit, vrot: (target - rot) / (f.n * dt) };
  }

  /**
   * How a piece will get to its spot: how hard it is thrown up, how many times it
   * strikes the floor, and how many quarter turns it makes on each hop.
   *
   * The LAST strike is decided here, not detected: the first one predicted slower than
   * GIB_REST. Detected, the rest depended on the orientation it happened to land in, and
   * a piece that came down on its end could bounce once more than planned and land
   * anywhere.
   *
   * The turns obey two rules. Every strike after the first lands it LYING DOWN, so every
   * hop after the first turns it a whole number of half turns -- end over end, the way a
   * thrown limb does -- and its lowest point is the same height at each end of the hop.
   * And the half turns are capped by how fast it is rising: the half-height of a piece
   * turning up off its side grows faster than a slow hop can lift it, so the last low
   * hops do not turn at all. The first hop, long and high, takes up whatever turning is
   * needed to make the final orientation come out as planned.
   */
  planGib(g, sev, dt) {
    const hh0 = halfHeight(g.w, g.h, g.rot);
    const apex = this.pitY + hh0
      + (GIB_APEX_MIN + this.rngFloat() * (GIB_APEX_MAX - GIB_APEX_MIN)) * (0.85 + 0.3 * sev);
    g.vy = Math.max(30, Math.sqrt(Math.max(0, 2 * GIB_GRAVITY * (apex - g.y))));

    const lieRot = (g.tq * Math.PI) / 2;
    const lieHH = Math.min(g.w, g.h) / 2;
    const hops = [];
    let f = this.gibFlight(g, g.y, g.vy, lieRot, 0, dt);
    hops.push({ v: g.vy, n: f.n });
    while (f.hit >= GIB_REST && hops.length < GIB_MAX_STRIKES) {
      const v = f.hit * GIB_BOUNCE;
      f = this.gibFlight(g, this.pitY + lieHH, v, lieRot, 0, dt);
      hops.push({ v, n: f.n });
    }
    g.K = hops.length;

    const spin = (this.rngFloat() < 0.5 ? -1 : 1) * GIB_SPIN * (0.5 + 0.5 * this.rngFloat());
    const turns = new Array(g.K).fill(0);
    let w = spin;
    const longHalf = Math.max(g.w, g.h) / 2;
    for (let j = 1; j < g.K; j++) {
      w *= GIB_FRICTION;
      const T = hops[j].n * dt;
      const rate = Math.min(Math.abs(w), (0.7 * hops[j].v) / longHalf);
      turns[j] = Math.sign(w) * 2 * Math.round((rate * T) / Math.PI);
    }
    const q0 = Math.round(g.rot / (Math.PI / 2));
    const later = turns.reduce((t, v) => t + v, 0);
    const r = (((g.tq - q0 - later) % 4) + 4) % 4;
    const natural = (spin * hops[0].n * dt) / (Math.PI / 2);
    turns[0] = Math.round((natural - r) / 4) * 4 + r;

    g.rotAt = [];
    let acc = g.rot;
    for (const m of turns) { acc += (m * Math.PI) / 2; g.rotAt.push(acc); }
    g.trot = acc;
    g.seg = 0;
    this.steerGib(g, dt);
  }

  /**
   * Aim a piece at its spot for the rest of its bounces, at the start of each hop.
   *
   * Spin: exactly the planned turn for THIS hop, so it strikes on a quarter turn.
   * Across: the remaining distance spread over every remaining hop, each one covering
   * GIB_FRICTION of the one before -- so it travels fast out of the burst, slower on each
   * bounce, and has almost nothing left to cover on the last little hop. Re-aimed at every
   * strike, so whatever the prediction missed by is taken out on the next hop rather
   * than left for the landing.
   */
  steerGib(g, dt) {
    const hop = this.gibSolveHop(g, g.y, g.vy, g.rot, g.rotAt[g.seg], dt);
    g.vrot = hop.vrot;
    let wsum = hop.n, w = 1, hit = hop.hit, rot = g.rotAt[g.seg];
    for (let j = g.seg + 1; j < g.K; j++) {
      const next = this.gibSolveHop(g, this.pitY + halfHeight(g.w, g.h, rot),
        hit * GIB_BOUNCE, rot, g.rotAt[j], dt);
      w *= GIB_FRICTION;
      wsum += next.n * w;
      hit = next.hit;
      rot = g.rotAt[j];
    }
    g.vx = (g.tx - g.x) / (wsum * dt);
  }

  /** A deterministic 0..1. The death has to look the same twice on the same seed. */
  rngFloat() {
    this.gibSeed = ((this.gibSeed || ((this.seed | 0) ^ 0x6d2b79f5)) * 1664525 + 1013904223) >>> 0;
    return this.gibSeed / 4294967296;
  }

  /**
   * Bounce the pieces until they settle, marking the floor wherever one lands.
   *
   * Each strike leaves blood, wider the harder it hit and the further he fell.
   */
  stepGibs(dt) {
    if (!this.gibs || !this.gibs.length) return;
    const lo = CX - this.arenaHalf;
    const hi = CX + this.arenaHalf;
    for (const g of this.gibs) {
      // The interpolation source, every tick, resting or not -- the same reason the
      // player's is synced on the pit floor: a stale prev is a piece that buzzes.
      g.px = g.x; g.py = g.y; g.prot = g.rot;
      if (g.rest) continue;
      const struck = this.gibHop(g, dt);
      g.x += g.vx * dt;

      // The shaft walls are solid for body parts too. Nothing planned ever reaches one --
      // see `reach` -- so this is the net under the plan, not part of it.
      const hw = halfWidth(g.w, g.h, g.rot);
      if (g.x - hw < lo) { g.x = lo + hw; g.vx = Math.abs(g.vx) * GIB_FRICTION; }
      else if (g.x + hw > hi) { g.x = hi - hw; g.vx = -Math.abs(g.vx) * GIB_FRICTION; }

      if (!struck) continue;
      const hit = Math.abs(g.vy);
      g.seg++;
      this.bleed(g, hit);
      if (g.seg >= g.K) {
        // Down for good. It is already on its planned quarter turn -- the spin was aimed
        // at it for the whole of this hop -- so setting the exact value moves nothing
        // on screen; it only removes the rounding.
        g.rot = g.trot;
        g.y = this.pitY + halfHeight(g.w, g.h, g.rot);
        g.vx = 0; g.vy = 0; g.vrot = 0;
        g.rest = true;
        g.restT = this.impactT;
        g.px = g.x; g.py = g.y; g.prot = g.rot;
      } else {
        g.y = this.pitY + halfHeight(g.w, g.h, g.rot);
        g.vy = hit * GIB_BOUNCE;
        this.steerGib(g, dt);
      }
    }
  }

  /**
   * The stain a strike leaves. Wider and deeper the harder it lands, and each strike is
   * remembered -- so a piece that bounces four times paints four times. The further he
   * fell, the more marks per strike and the bigger each one: severity is what makes a
   * death from floor 900 look different from one at floor 200, because strike speed
   * alone cannot.
   */
  bleed(g, hit) {
    const sev = this.severity || 0;
    const marks = 1 + Math.round(sev * (BLOOD_MARKS_MAX - 1));
    const size = 0.7 + 0.8 * sev;
    for (let k = 0; k < marks; k++) {
      const off = k ? (this.rngFloat() - 0.5) * Math.max(g.w, g.h) * 1.3 : 0;
      const small = k ? 0.55 : 1;
      this.blood.push({
        x: g.x + off,
        w: (3 + Math.min(14, hit * 0.07)) * size * small,       // half-width, world units
        d: (0.5 + Math.min(2, hit * 0.008)) * size * small,       // depth up the surface
      });
    }
  }

  /**
   * The fastest this run has CLIMBED, in floors a minute, over any CLIMB_WINDOW seconds.
   *
   * TOP SPEED on the stats screens was the fastest he ever ran sideways, in world units a
   * second labelled PX/S -- a number about running, in a unit that was not pixels, in a
   * game about going UP. What a player means by their speed up a tower is floors a
   * minute. A window rather than an instant, because one nine-floor jump in half a second
   * is 1080 a minute for that half second and says nothing about the run; and never less
   * than CLIMB_MIN_SPAN of it, so the first seconds cannot spike. The sideways figure is
   * still tracked, because two awards are keyed to it.
   */
  trackClimb() {
    const log = this.climbLog || (this.climbLog = []);
    const t = this.elapsed;
    const last = log[log.length - 1];
    if (!last || t - last.t >= 0.25) log.push({ t, f: this.run.maxFloor });
    while (log.length > 2 && t - log[1].t >= CLIMB_WINDOW) log.shift();
    const first = log[0];
    const span = Math.max(CLIMB_MIN_SPAN, t - first.t);
    const rate = ((this.run.maxFloor - first.f) / span) * 60;
    if (rate > this.run.topClimb) this.run.topClimb = rate;
  }

  scoreCombo(r, quiet = false) {
    this.score += r.score;
    this.run.score = this.score;
    this.run.combos++;
    this.run.comboFloors += r.floors;
    if (r.floors > this.run.bestCombo) this.run.bestCombo = r.floors;
    if (r.score > this.run.bestComboScore) this.run.bestComboScore = r.score;
    if (r.flair > this.run.bestComboFlair) this.run.bestComboFlair = r.flair;
    this.lastTier = r.tier ? COMBO_TIERS.indexOf(r.tier) : -1;
    if (this.lastTier >= 0 && this.lastTier < this.run.comboHist.length) this.run.comboHist[this.lastTier]++;

    // A chain the FLOOR ended is banked and nothing more. Everything below is the payoff for
    // a chain landed alive, and die() used to fire it too: in the frame the fire caught him
    // the screen flashed white (flash 0.7), a burst of up to 70 confetti in the zone's
    // colours went up out of him, and "+24000" rose off the top of the screen a third of a
    // second later with the camera plunging after him -- a celebration flashing up and
    // gone at the moment of a death, with a taunt banner queued that nothing ever drew.
    // The points are the same; the scoreboard shows them.
    if (quiet) return;
    const p = this.player;
    // No tier banner and no callout here any more. The chain marks itself while it is
    // happening, once per multiplier step -- every MULT_STEP (50) combo floors, see
    // comboStep -- and the meter has been showing the multiplier the whole time, so a
    // second round of text at the moment it ENDS was celebrating something the player had
    // already watched. What is left is the payout.
    // In the colours of the step the chain reached: the chain has closed, so the live step is
    // already back to none.
    this.floater('+' + r.score, p.x, p.y + 30, stepFor(r.floors), r.floors >= 12 ? 2 : 1);

    if (r.floors >= 8) {
      this.particles.burst(p.x, p.y + 14, Math.min(70, 14 + r.floors * 2),
        [this.theme.accent, this.theme.particle, '#ffffff'], 0.8 + r.floors / 30);
      this.addShake(Math.min(6, 1.5 + r.floors * 0.18));
    }
    if (r.floors >= 17) {
      this.slowmo = 0.2;
      this.flash = 0.7;
      // Four seconds of SIMULATED time between taunts. It was performance.now(), the wall
      // clock, inside the simulation: whether a taunt showed depended on how long the page
      // had been open and how fast the machine stepped, so a replay of the same keys could
      // show a banner the run never did.
      if (this.elapsed - this.lastTaunt > 4) {
        this.lastTaunt = this.elapsed;
        this.banner(this.line(TAUNTS), '#ffffff', false, 1.5);
      }
    }
  }

  /**
   * The floor has him. Snap to the exact contact point and yank him under, so the drop
   * starts from where the collision actually happened rather than from wherever he had
   * drifted to by the time the check fired.
   */
  caughtByFloor() {
    if (this.state !== STATE.PLAYING) return;
    const p = this.player;
    p.y = this.riseY;
    p.py = this.riseY;
    p.grounded = false;
    // The grab is the world's (the fall is theatre on the world's clock), and his vy is on his
    // own clock (JUMP SPEED, Player.rate) until die() hands it over: so the floor is FLOOR_GRAB /
    // rate here, which die() turns back into FLOOR_GRAB. As plain FLOOR_GRAB, a man caught
    // standing or rising at 130% was yanked under at 312 units/s where 100% yanks at 240, and
    // fell 8% further in the fall's first half second. At rate 1 this is FLOOR_GRAB to the bit.
    p.vy = Math.min(p.vy, -FLOOR_GRAB / p.rate);
    // die() first, then the splash: die() lets go of everything the climb left in the air,
    // and the red-and-white splash out of the fire is the death's own, which it must not.
    this.die();
    this.addShake(5);
    this.particles.burst(p.x, p.y + 4, 22, ['#ff2244', '#ff6688', '#ffffff'], 1.1);
  }

  die() {
    if (this.state !== STATE.PLAYING) return;
    // Where the danger cues and the speed lines stand at the moment of the loss, read
    // BEFORE the combo closes (a live chain is up to 0.45 of the intensity). The death lets
    // go of both from here rather than from nothing: see `danger` and `intensity`.
    this.dangerAtDeath = this.danger;
    this.fallIntensity = this.intensity;
    this.deathT = 0;
    // And what the HUD shows, for its fade-out (drawFalling): the score before the chain is
    // banked and the chain's meter as it stood, so neither jumps as the HUD goes.
    this.hudHeld = {
      score: this.score,
      combo: Object.assign(Object.create(Object.getPrototypeOf(this.combo)), this.combo),
      climbWarning: this.climbWarning,
    };
    const r = this.combo.close();
    if (r) this.scoreCombo(r, true);
    this.run.score = this.score;

    // The run is over and the record is settled here, at the moment of the loss. What
    // follows is theatre: the scoreboard does not appear until the fall has landed or
    // the player has skipped it.
    if (this.onDeath) this.onDeath(this.run, this.lastTier);

    this.state = STATE.FALLING;
    this.deathLine = this.line(DEATH_LINES);
    this.impacted = false;
    this.gibs = [];
    this.blood = [];
    this.bloodPool = null;
    this.spatter = [];
    this.impactT = 0;
    this.tumble = 0;
    // Each death is drawn from the run's seed alone, not from however many deaths this
    // Game object has already staged.
    this.gibSeed = 0;
    this.splat = this.run.maxFloor >= SPLAT_FLOOR;
    const depth = Math.min(PIT_MAX, PIT_BASE + this.run.maxFloor * PIT_PER_FLOOR);
    // On the ART grid. The floor's contact line is drawn at pitY and a resting piece's
    // lowest pixel is snapped to the grid; with pitY between two grid lines the two
    // disagree by up to half an art pixel -- a piece one screen pixel into, or off, the
    // floor at the closest zoom.
    this.pitY = Math.round((this.player.y - depth) * PX) / PX;
    this.fallFrom = this.player.y;
    this.severity = this.fallSeverity();
    // The fall is theatre on the world's clock (stepFalling), so his speed is handed over in
    // the world's units: at a JUMP SPEED over 1 he would otherwise slow by that factor in the
    // step the fire took him, under a camera that keeps its speed.
    this.player.vx *= this.player.rate;
    this.player.vy *= this.player.rate;
    this.player.vy = Math.min(this.player.vy, -FLOOR_GRAB);
    // Keep whatever sideways speed he died with, plus a nudge, so the fall has
    // something to bounce off the walls with rather than dropping straight down.
    this.player.vx = this.player.vx * 0.9 + (this.player.vx >= 0 ? 60 : -60);
    // Nothing steps the companions from here on, so they stand where they are -- and must
    // be drawn there, not between their last two positions (see Companions.freeze).
    this.companions.freeze();
    // The fall is him alone in the shaft. What the climb left in the air -- the combo
    // trail's sparks, dust, a zone's confetti -- runs out its own fade within FALL_LET_GO
    // rather than drifting on over the plunge for up to 1.6 s: each keeps how far through
    // its life it is and goes through the rest of it faster, so nothing blinks out. BOUNCE
    // and the other floaters keep their age (their pop is keyed on it) and have FALL_LET_GO
    // left, which their own stepped fade runs through. The ledges burn (render/burn.js);
    // the streaks let go through `intensity` (decayFx), at the pace they had (`fallPace`).
    this.particles.letGo(FALL_LET_GO);
    for (const f of this.floaters) {
      if (f.life > FALL_LET_GO) { f.maxLife -= f.life - FALL_LET_GO; f.life = FALL_LET_GO; }
    }
    this.fallPace = this.fallIntensity;
    // The renderer draws the fall's camera interpolated (Renderer.cameraY); it starts level,
    // and stepFalling's first step takes up the speed the climb's camera had (camStep).
    this.pcamY = this.camY;
    this.camV = null;
    // How deep the fire's crust reached down the view as it took him (to the view's bottom,
    // as it does in play). It ends no higher than that in the fall (Renderer.drawRisingFloor),
    // so a catch high on the screen cannot shorten it in one frame and uncover the shaft.
    this.crustDepth = this.riseY - this.camY + 8;
    this.addShake(3);
    if (this.onFallStart) this.onFallStart(this.splat);
  }

  /**
   * How bad the landing is, 0..1, from how far he fell: a fall of PIT_BASE is 0 and one
   * of PIT_MAX is 1. Everything that should be worse from higher up reads this -- not
   * the strike speed, which terminal velocity caps long before the bottom.
   */
  fallSeverity() {
    const d = (this.fallFrom || 0) - (this.pitY || 0);
    return Math.max(0, Math.min(1, (d - PIT_BASE) / (PIT_MAX - PIT_BASE)));
  }

  /** The plummet. No input except skip; the camera just keeps up. */
  stepFalling(dt) {
    const p = this.player;
    // Where the camera was a step ago, for the renderer to interpolate the plunge from.
    this.pcamY = this.camY;
    // His speed before this step, for the camera to be fed his acceleration.
    const vyWas = p.vy;

    if (!this.impacted) {
      p.vy -= GRAVITY * FALL_GRAVITY * dt;
      if (p.vy < -FALL_TERMINAL) p.vy = -FALL_TERMINAL;
      p.px = p.x;
      p.py = p.y;
      p.y += p.vy * dt;
      p.x += p.vx * dt;

      // The ragdoll keeps colliding. Bouncing him off the shaft walls on the way down
      // is both more readable -- you can see how fast he is going -- and much funnier
      // than a body sliding straight down the middle.
      const half = PLAYER_W / 2;
      const lo = CX - this.arenaHalf + half;
      const hi = CX + this.arenaHalf - half;
      // Damped, with a FLOOR rather than a bonus. Adding a constant after the damping
      // meant a slow ragdoll gained energy on every contact and would ping between the
      // walls faster and faster all the way down.
      if (p.x < lo) {
        p.x = lo;
        p.vx = Math.max(FALL_WALL_MIN, Math.abs(p.vx) * FALL_WALL_BOUNCE);
        this.onWallHit(p);
      } else if (p.x > hi) {
        p.x = hi;
        p.vx = -Math.max(FALL_WALL_MIN, Math.abs(p.vx) * FALL_WALL_BOUNCE);
        this.onWallHit(p);
      }
      this.tumble += dt * 7.5;

      // There was wind and debris rushing past here: a mote in the zone's particle colour
      // every 30 ms round him, all the way down -- specks drifting up past a man falling alone
      // down the shaft. The fall is him alone now; nothing is shed on the way.

      if (p.y <= this.pitY) {
        p.y = this.pitY;
        // He is at rest, so the INTERPOLATION SOURCE has to come to rest with him.
        //
        // The renderer draws p.px + (p.x - p.px) * alpha, where alpha is the leftover
        // of the fixed-step accumulator and is a different number on every displayed
        // frame. px/py are only refreshed in the branch above this one, so without
        // these two lines they stay frozen wherever he was a step before he landed --
        // up to FALL_TERMINAL/240 units away. The body then hovers that far off the pit
        // floor and buzzes up and down for the whole of IMPACT_HOLD, because the blend
        // weight keeps changing while the two endpoints do not.
        //
        // This is why snapping the sprite's position did not fix it: the position being
        // snapped was a blend between the floor and a point in mid-air.
        p.px = p.x;
        p.py = p.y;
        p.vy = 0;
        this.impacted = true;
        this.impactT = 0;
        if (this.splat) this.burstGibs(p, dt);
        const sev = this.severity || 0;
        this.addShake(this.splat ? 5.5 + 1.5 * sev : 4);
        this.flash = this.splat ? 0.8 : 0.3;
        // The red burst grows with the fall too: 50 drops at a fall of PIT_BASE, 150 at
        // PIT_MAX, thrown harder.
        this.particles.burst(p.x, p.y + 6, this.splat ? Math.round(50 + 100 * sev) : 26,
          this.splat ? ['#ff2244', '#ff6688', '#ffffff'] : ['#ffe23d', '#ffffff'],
          this.splat ? 1.05 + 0.6 * sev : 1.3);
        if (this.onImpact) this.onImpact(this.splat);
      }
    } else {
      // Belt and braces. The clamp above already syncs these once; keeping them synced
      // every tick means no future edit that moves a corpse -- a settle, a twitch, a
      // slide down a slope -- can quietly bring the hovering back.
      p.px = p.x;
      p.py = p.y;
      this.stepGibs(dt);
      this.impactT += dt;
      if (this.impactT >= (this.splat ? IMPACT_HOLD : IMPACT_HOLD_DAZED)) this.state = STATE.DEAD;
    }

    // THE CAMERA RIDES WITH HIM, AND ITS SPEED NEVER JUMPS.
    //
    // It was a lerp toward a point 55% up the view with a hard clamp keeping him between 18%
    // and 82%. At terminal velocity the lerp lags by 0.47 of a view, so the clamp was what
    // held him, and it took over about half a second in: he slid down the screen at 800 px/s
    // and stopped dead on the 18% line inside two frames while the world jumped from 22 to 29
    // px a frame -- a hitch in the middle of the plunge, in every death (measured at 160 Hz).
    //
    // Now a critically damped spring on where he should be, fed his own speed and
    // acceleration, so only the camera's ACCELERATION ever changes at once. It takes up the
    // speed the climb's camera had at the catch (camStep), eases him down onto FALL_CAM_AT as
    // he gathers speed, and holds him there at terminal velocity with no lag. At the impact
    // it stops being fed his speed, runs on past him by a quarter of a view and settles with
    // him on CAM_ANCHOR, as the camera in play frames a man standing. The rate scales with
    // the zoom, so the motion is the same on screen in a narrow shaft as in the open one.
    if (this.camV == null) this.camV = (this.camStep || 0) / dt;
    const w = FALL_CAM_RATE * VH / this.viewH;
    const at = this.impacted ? CAM_ANCHOR : FALL_CAM_AT;
    const lead = this.impacted ? 0 : p.vy;
    const pull = this.impacted ? 0 : (p.vy - vyWas) / dt;
    const acc = pull + w * w * (p.y - this.viewH * at - this.camY) + 2 * w * (lead - this.camV);
    this.camV += acc * dt;
    this.camY += this.camV * dt;

    // Belt and braces: he stays on screen whatever a future change feeds the spring. It
    // never engages in the deaths measured (he rides 0.2 to 0.55 of the view); if it did,
    // the camera takes his speed with it, so it cannot fight the spring on the next step.
    const lowest = p.y - this.viewH * 0.9;
    const highest = p.y - this.viewH * 0.1;
    if (this.camY < lowest || this.camY > highest) {
      this.camY = Math.max(lowest, Math.min(highest, this.camY));
      this.camV = this.impacted ? 0 : p.vy;
    }
  }

  /** Spark and shake when the falling body clips a wall. */
  onWallHit(p) {
    this.addShake(2.5);
    this.particles.wallBounce(p.x, p.y + 8, Math.sign(p.vx) || 1,
      Math.abs(p.vx), this.theme.accent);
    if (this.onFallWallHit) this.onFallWallHit(Math.abs(p.vx));
  }

  pause() {
    if (this.state !== STATE.PLAYING) return false;
    this.resumeState = STATE.PLAYING;
    this.state = STATE.PAUSED;
    return true;
  }

  resume() {
    if (this.state !== STATE.PAUSED) return false;
    this.state = this.resumeState || STATE.PLAYING;
    // The idle timer would otherwise count the whole pause and bring the floor up the
    // instant you come back.
    this.idleFor = 0;
    return true;
  }

  /** Space during the fall cuts straight to the scoreboard. */
  skipFall() {
    if (this.state !== STATE.FALLING) return false;
    this.state = STATE.DEAD;
    return true;
  }

  /** 0..1 through the drop, for the renderer's darkening and wind. */
  get fallProgress() {
    if (this.state !== STATE.FALLING || this.impacted) return 1;
    const total = Math.max(1, this.fallFrom - this.pitY);
    return Math.max(0, Math.min(1, (this.fallFrom - this.player.y) / total));
  }

  decayFx(dt) {
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 22);
      this.shakeX = (this.fx.next() - 0.5) * 2 * this.shake;
      this.shakeY = (this.fx.next() - 0.5) * 2 * this.shake;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 4.5);
    if (this.state === STATE.FALLING || this.state === STATE.DEAD) {
      this.deathT = (this.deathT || 0) + dt;
      // The speed lines let go: from where the climb left them to none over STREAK_LET_GO,
      // so the pool retires its lines one by one, each shrinking into its head as it rises
      // (streaks.js), none vanishing mid-screen, the last gone by FALL_CLEAR. They used to
      // become the plummet's, following how fast he fell -- which, flat out, filled the
      // shaft with a hundred thin orange lines all the way down: rain, over a fall that is
      // him alone. Before that they kept whatever the climb left them at, on the scoreboard
      // too, and lost a live chain's share in the frame he died. An easing toward zero
      // (it was, at 3 a second, in the first version of this) never gets there: the last
      // lines were still retiring 0.8 s into the fall.
      this.fallIntensity = (this.fallPace || 0) * Math.max(0, 1 - this.deathT / STREAK_LET_GO);
      this.companions.hush(dt);
    }
    // `shoutT` was assigned in three places and decremented in none, so the first
    // callout of a run never expired. It does now -- while the run is being played. Once
    // the fire has him it stands still: the HUD leaves as a layer drawn once from the frame
    // he died in (screens.js drawHudExit), word and all, and the prestige badge, drawn
    // live over the characters (callouts.js drawCalloutBadge), fades with that layer from
    // the same moment rather than running on through its own entrance and fade.
    if (this.shoutT > 0 && this.state === STATE.PLAYING) this.shoutT = Math.max(0, this.shoutT - dt);

    for (let i = this.banners.length - 1; i >= 0; i--) {
      this.banners[i].life -= dt;
      if (this.banners[i].life <= 0) this.banners.splice(i, 1);
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      f.y += f.vy * dt;
      f.vy -= 26 * dt;
      if (f.life <= 0) this.floaters.splice(i, 1);
    }
  }

  /**
   * Feet-to-killline headroom as a fraction of the room the game is giving you right
   * now. 1 = all the room there is, 0 = caught.
   *
   * This used to be normalised by VIEWPORT height, which made it useless for the same
   * reason the old 'FLOOR IN' readout was useless: the killline is pulled up to trail
   * your best floor by riseLead() -- clamped to it every tick then, eased up to it at
   * RISE_CATCHUP now -- which early on is 340 px against a viewport of about 115, so the
   * ratio saturated at 1 and sat there. The bar driven by it never
   * moved, the vignette almost never fired, and the one number three separate effects
   * were reading agreed with none of them.
   *
   * Against riseLead() it means something and it moves: standing on your best floor you
   * have all of it, and every floor you fall spends a visible share. It also tightens
   * by itself as you climb, because the lead shrinks from 340 px to 62 px -- so the same
   * two-floor slip reads as mild at floor 20 and nearly fatal at floor 900, which is
   * exactly what it is.
   */
  get danger() {
    if (!this.riseActive) return 1;
    // Once the run is over there is no danger to signal -- you already lost. riseY
    // freezes the moment die() is called while the ragdoll falls another 900 to 2600 px
    // past it, so this ratio pins at 0 and every effect reading it -- the screen band,
    // the vignette -- sat at full intensity for the whole death sequence. That is the
    // solid red that appears over the fall.
    //
    // But returning 1 the moment he died switched every one of them off in ONE frame, at
    // full strength, right as the fire had him -- and they had only just come on. The band
    // comes on at 0.3 of the lead, which he crosses in the last instant before contact: in
    // the attract bot's deaths at floors 150, 640 and 1200 it was up for 21 to 33 ms, one or
    // two frames, and standing still at floor 640 for 0.1 s. So a fall into the fire showed
    // a red bar across the bottom of the screen for a frame or two and then nothing: the
    // flash that was reported. It climbs back to clear over DANGER_RELEASE instead, from
    // wherever it stood when he died, so the band and the vignette peak as the fire takes
    // him and die away as he drops through it.
    if (this.state === STATE.FALLING || this.state === STATE.DEAD) {
      const d0 = this.dangerAtDeath === undefined ? 1 : this.dangerAtDeath;
      return Math.min(1, d0 + (1 - d0) * (this.deathT || 0) / DANGER_RELEASE);
    }
    const lead = Math.max(1, this.riseLead());
    return Math.max(0, Math.min(1, (this.player.y - this.riseY) / lead));
  }

  /**
   * Whether to shout CLIMB!: the floor close (danger under 0.3) AND far enough off in
   * TIME to be read and acted on -- CLIMB_READ seconds at the rate the gap is closing now,
   * the floor's rise plus his own fall.
   *
   * The distance test alone fires almost only in the instant before a death: 0.3 of the
   * lead is 19 units up the tower, and a man falling into the fire covers that in a frame
   * or two (every such episode in the attract bot's runs at floors 150-1200 ended in the
   * floor catching him, 21-33 ms later). The word came up in the red band and the HUD was
   * gone with it a frame later, one more thing that flashed as he died. Where the floor
   * creeps up on someone standing still low in the tower it still has a second or more.
   *
   * It is LATCHED (in step): the time test decides only whether it comes up, and once up
   * it stays until the floor is clear again (danger back to CLIMB_CLEAR, a little past
   * where it came up) or the run ends. Tested every frame as it first was, the time swung
   * with his own vertical speed, so hopping near the fire switched the word on at every
   * landing and off on every drop: in 400 s of a bot idling in bursts near the floor at
   * floor 60 it came back within 0.2 s of going seven times (never, on the distance test
   * alone), and 15 of its 34 showings were under 0.1 s -- CLIMB! flicking on and off, the
   * thing the time test was added to stop. Latched: no comebacks, and 5 showings under
   * 0.1 s of 24, each a landing in the danger and a jump straight back out of it.
   */
  get climbWarning() {
    const live = this.state === STATE.PLAYING || this.state === STATE.PAUSED;
    return live && this.riseActive && !!this.climbOn;
  }

  /** Seconds until the floor reaches his feet at the rate the gap is closing now: the
   * floor's rise plus his own fall. Infinity when the gap is opening. */
  floorETA() {
    // His vy is in units per second of HIS clock; the fire rises on the world's.
    const closing = this.riseRate() - Math.min(0, this.player.vy) * this.player.rate;
    return closing <= 0 ? Infinity : (this.player.y - this.riseY) / closing;
  }

  /**
   * 0..1 live intensity. Unlike `openness` this falls as well as rises, and it drives
   * the streaks and colour, never the geometry -- the arena must not yo-yo.
   */
  get intensity() {
    // In the death, the plummet's own (eased in decayFx, starting from the climb's).
    if (this.state === STATE.FALLING || this.state === STATE.DEAD) return this.fallIntensity || 0;
    const c = this.combo.active ? Math.min(1, this.combo.floors / 24) : 0;
    return Math.min(1, this.player.momentum * 0.7 + c * 0.45);
  }

  get speedFrac() { return Math.min(1, Math.abs(this.player.vx) / VX_MAX_HOT); }
}
