// What the game sounds like as it is played: every event of a run, handed to the audio.
//
// The simulation has no audio in it and gets none here. This wraps a Game from outside --
// its handleEvents, to hear what the player did, and its step, to hear what changed --
// and installs the hooks it already calls (onAnnounce, onImpact, ...). It was a block in
// main.js that compared five run counters before and after handleEvents, and three things
// fell through it: every change made OUTSIDE handleEvents -- a chain banked by standing
// still (Game.step closes it before handleEvents runs, so the combo count had already
// moved when the "before" was taken: the commonest way a chain ends was silent), the
// CLIMB! warning, the scoreboard -- and every event that is not a counter: how far a
// landing fell, how hard the combo drove a wall bounce, a companion starting to speak.
// Here the player's own events are read as they come (the list handleEvents is about to
// drain), and everything else is diffed from one step to the next.
//
// A module rather than main.js so a test can drive a real Game through it
// (tools/test-sfx.mjs): main.js cannot be loaded without a page. The menus' sounds stay
// in main.js, which owns the keys.

import { STATE } from '../game/game.js';
import { callFade } from '../game/companions.js';
import { COMPANION_KEY } from './compsprites.js';
import { landWeight } from './sfx.js';
import { MULT_STEP } from '../game/combo.js';

/**
 * Wire `game` to `audio`. `scoreboard()` says what the finished run earned, for the
 * scoreboard's sounds: `{ records, unlocked }`, counts (main.js knows them; the game does
 * not).
 */
export function wireGameAudio(game, audio, { scoreboard = () => ({ records: 0, unlocked: 0 }) } = {}) {
  const heard = {
    run: null,          // the run these were counted in; a new one resets them
    theme: 0,
    combos: 0,
    hops: 0,
    climb: false,
    scored: false,      // the scoreboard's sounds have been played for this run
    state: game.state,
    apex: 0,            // the top of the arc since he last stood on something
    lines: new WeakMap(),   // companion -> the line last heard, and whether it has shown
  };
  let milestoneNow = false;

  // The scoreboard's sounds belong to the scoreboard. The record and the award are queued
  // on the audio clock half a second and a second after it comes up, and the toll rings
  // for a second and a half: a player who went straight into the next run -- one key at
  // the scoreboard -- heard "a new record" and the award's sparkle over its first second,
  // and the toll over its first notes; one who went back to the title heard them over the
  // menu's. Leaving the scoreboard lets go of them, the ones not yet started included.
  const SCOREBOARD = ['gameover', 'record', 'unlock', 'impact'];
  const leaveScoreboard = () => { for (const n of SCOREBOARD) audio.stopEffect(n, 0.12); };

  function reset() {
    if (heard.run) leaveScoreboard();
    heard.run = game.run;
    heard.theme = game.themeIndex;
    heard.combos = game.run.combos;
    heard.hops = game.combo.active ? game.combo.hops : 0;
    heard.climb = false;
    heard.scored = false;
    heard.apex = game.player.y;
    heard.lines = new WeakMap();
  }

  // --- the hooks the game calls --------------------------------------------------------
  // The seven callouts are the tower's now, fired by height (src/game/milestones.js): x is
  // the floor within the lap, 330 to 2300, and the fanfare is chosen from it the same way.
  // The lap (x2, x3 ... a prestige badge on screen) does not change the sound yet.
  game.onAnnounce = (text, x) => { milestoneNow = true; audio.sfxMilestone(x); };
  // A combo's multiplier step (x1.5, x2 ...) no longer shouts a word, so it has no fanfare:
  // its sound is the hop ladder's step mark below, on the landing that crossed it. The hook
  // stays set so nothing else fills it with a second sound for the same landing.
  game.onComboStep = () => {};

  // A companion joining is heard by their call, and one falling away by the slip, both in
  // the key the music is in. They used to lift the whole piece into a key of their own
  // for as long as they were with you, -5 to +7 semitones, and drop it again when they
  // slipped: at random moments, mid-phrase -- half of all the key changes a run made.
  game.onCompanionJoin = () => audio.sfxJoin();
  game.onCompanionSlip = () => audio.sfxSlip();

  // The catch: the climb is cut DOWN into the lament on its own next beat (Audio.lament),
  // the fire roars, and the wail starts, falling toward the lament's key. That key is the
  // tonic the climb was sounding, held by the engine until the music stops -- so there is
  // no resetKeys() here. There was: the climb was stopped dead, the keys reset, and the
  // lament came in at the impact in E whatever key the tower had climbed into, a lurch
  // from G minor or D minor into E mid-phrase (see keyFromCut in audio.js). The effects
  // follow keyNow(), which is the climb's until the cut and the held key after it.
  game.onFallStart = () => {
    audio.lament();
    audio.sfxCatch();
    audio.sfxScream();
  };
  game.onFallWallHit = () => audio.sfxFallWall();
  game.onImpact = (splat) => {
    audio.stopScream();
    // The lament is already playing, from the catch, in the key it took from the climb and
    // holds (resetKeys() cannot move it: Audio.pinned). The live keys are cleared for the
    // next run. crossTo() only if the catch could not start it (no audio then), and never
    // while it is still waiting for its beat: a second crossTo would re-aim that cut.
    audio.resetKeys();
    if (audio.track !== 'gameover' && audio.pendingTrack !== 'gameover') audio.crossTo('gameover');
    // The lament's stab lands with the body: its fall is left wherever it has got to
    // (Audio.landLament). The landing chord used to be written into the fall at a fixed
    // 1.7 s while the fall takes 1.0 to 2.45 s, so it came 0.2 to 1.2 s off the splat.
    audio.landLament();
    audio.sfxImpact(splat, game.severity || 0);
  };

  // --- what the player did ---------------------------------------------------------------
  const origHandle = game.handleEvents.bind(game);
  game.handleEvents = function () {
    if (game.run !== heard.run) reset();
    const p = game.player;
    // Read before handleEvents drains them: the events carry what the counters cannot.
    const events = (p.events || []).slice();
    const hopsBefore = game.combo.active ? game.combo.hops : 0;
    const floorsBefore = game.combo.active ? game.combo.floors : 0;
    milestoneNow = false;
    // The music's part in a zone arriving: the stage's theme handed over when the zone
    // changes stage, or the key a step up the ladder within one, on the music's next bar
    // line, where the zone's chime rings too (see followClimb in audio.js). Driven off the
    // highest floor reached rather than the current one: standing on a boundary and
    // hopping down a floor and back would otherwise modulate the whole track, or swap the
    // theme, twice a second.
    //
    // BEFORE this step's sounds, and with the floor this step is about to record: the
    // game raises maxFloor only after handleEvents returns, so the key used to follow it a
    // step late, after every sound of the landing that earned it had been built in the old
    // key, and the zone's chime rang out a whole tone under the theme it was ringing over.
    // Effects are tuned to the key sounding when they sound (Audio.keyNow), so a sound of
    // this landing that rings before the zone's bar line is in the key still playing then.
    audio.followClimb(Math.max(game.run.maxFloor, p.floor || 0));
    origHandle();

    for (const ev of events) {
      switch (ev.type) {
        case 'jump': audio.sfxJump(ev.power || 0); break;
        case 'airjump': if (ev.air === 1) audio.sfxDouble(); else audio.sfxTriple(); break;
        case 'wallbounce': audio.sfxWall(ev.speed, ev.boost || 0); break;
        case 'wallkick': audio.sfxWallKick(); break;
        case 'land': audio.sfxLand(landWeight(heard.apex - p.y)); break;
      }
    }
    // The arc: its top is where the next landing is measured from.
    if (p.grounded) heard.apex = p.y;
    else heard.apex = Math.max(heard.apex, p.y);

    // The chain's hops. A hop that landed on a callout's floor is the fanfare's, not the
    // ladder's; one that crossed a multiplier step is the step's own mark at the top of the
    // ladder. That mark used to sound only past GLORY, when the combo's steps WERE the
    // callouts and every step below 350 floors had a fanfare; the callouts are the tower's
    // heights now, so every step gets the mark.
    const c = game.combo;
    if (c.active && c.hops > hopsBefore && !milestoneNow) {
      const stepped = Math.floor(c.floors / MULT_STEP) > Math.floor(floorsBefore / MULT_STEP);
      audio.sfxHop((c.floors % MULT_STEP) / MULT_STEP, c.hops === 1, stepped);
    }
  };

  // --- what changed ----------------------------------------------------------------------
  const origStep = game.step.bind(game);
  game.step = function (dt) {
    if (game.run !== heard.run) reset();
    origStep(dt);
    if (game.run !== heard.run) reset();
    const was = heard.state;
    const now = game.state;
    heard.state = now;
    // Back to the title (from the scoreboard, a fall cut short, or a quit): see SCOREBOARD.
    // A new run lets go of them in reset().
    if (now === STATE.MENU && was !== STATE.MENU) leaveScoreboard();

    if (now === STATE.PLAYING) {
      // A zone arriving. !==, not >: past floor 2300 each cycle is a reshuffle, so the next
      // zone's index can be LOWER. The chime is queued for the bar line the music put the
      // zone on (followClimb, earlier in this step), not rung at once.
      if (game.themeIndex !== heard.theme) audio.sfxTheme();
      // CLIMB!, as the word comes up (it is latched in Game.step, so this is once a scare).
      const climb = game.climbWarning;
      if (climb && !heard.climb) audio.sfxClimb();
      heard.climb = climb;
      // A chain banked, however it ended: landing short (in handleEvents) or standing
      // still (in step, before handleEvents). One the FLOOR ended is banked in the death,
      // quietly, and is not paid out in sound either.
      if (game.run.combos > heard.combos) audio.sfxComboEnd(game.combo.lastResult ? game.combo.lastResult.floors : 2);
      // A companion starting a line: the moment it becomes visible, which for a greeting
      // said early is a moment after it is said (callFade).
      for (const comp of game.companions.active) {
        if (!comp.bubble) continue;
        const h = heard.lines.get(comp);
        const fresh = !h || h.text !== comp.bubble || comp.bubbleT > h.t + 1e-6;
        const line = fresh ? { text: comp.bubble, shown: false } : h;
        if (!line.shown && callFade(comp.bubbleT) > 0) {
          line.shown = true;
          audio.sfxSpeak(COMPANION_KEY[comp.id] || 0, comp.bubble.split(/\s+/).length + 1);
        }
        line.t = comp.bubbleT;
        heard.lines.set(comp, line);
      }
    }
    heard.theme = game.themeIndex;
    heard.combos = game.run.combos;

    // The scoreboard, however it was reached: the fall landing out, or skipped. The lament
    // is already playing either way -- lament() ran at the catch (onFallStart), and a skip
    // does not stop it -- so the crossTo here is only a fallback for a death with no audio
    // at the catch (lament() does nothing without a context), as it is at the impact. It
    // used to say a skipped fall had not started the lament, which was true while the lament
    // came in at the impact.
    //
    // Once a run: the stats and the options open from the scoreboard and hand back to it,
    // and each return was a fresh arrival -- the toll, "a new record" and the award rang
    // again every time the player looked at the stats and came back.
    if (now === STATE.DEAD && was !== STATE.DEAD && !heard.scored) {
      heard.scored = true;
      audio.stopScream();
      if (audio.track !== 'gameover' && audio.pendingTrack !== 'gameover') { audio.resetKeys(); audio.crossTo('gameover'); }
      // A skipped fall never lands, so the scoreboard coming up is its landing: the stab
      // comes with it instead of the fall playing on under the scores. After a real landing
      // this does nothing (landLament lands once).
      audio.landLament();
      const s = scoreboard() || {};
      audio.sfxGameOver({ records: s.records || 0, unlocked: s.unlocked || 0 });
    }
  };

  return heard;
}
