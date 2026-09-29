// Entry point: wires the loop, input, simulation, renderer and persistence together
// and owns the screen state machine.

import { Loop, STEP } from './core/loop.js';
import { Input } from './core/input.js';
import { Gamepad } from './core/gamepad.js';
import { watchEmbed, fullscreenAllowed } from './core/embed.js';
import { Game, STATE } from './game/game.js';
import { AutoInput, AutoPlayer, startDemo } from './game/autoplay.js';
import { Renderer, lowLatencyWorks } from './render/renderer.js';
import { Audio, SAMPLE_NAMES } from './render/audio.js';
import { wireGameAudio } from './render/gamesounds.js';
import { drawHud, drawPerf } from './ui/hud.js';
import { drawMenu, drawGameOver, drawStats, drawHelp, drawFalling, drawFallWords, drawOptions, drawPaused, drawQuit, PAGES, drawTutorial, TUTORIAL_PAGES } from './ui/screens.js';
import { drawSoundNotice, SOUND_PLACES } from './ui/screens.js';
import { ATTRACT_IDLE, ATTRACT_FADE, drawAttractPrompt } from './ui/screens.js';
import { menuTargets, warmTouch } from './ui/screens.js';
import * as Settings from './game/settings.js';
import { PARTICLE_BUDGET } from './game/settings.js';
import * as Stats from './game/stats.js';
import { check as checkAwards } from './game/achievements.js';
import { PX, VW, VH } from './game/constants.js';
import { warmAtlases } from './render/font.js';
import { prepaint, warmAhead } from './render/prepaint.js';
import { warmMenu, watchCaps } from './render/menuskin.js';
import { warmComboTextAll } from './render/callouts.js';
import { THEMES } from './game/themes.js';
import { ReplayUI } from './ui/replays.js';
import { TouchControls, touchWanted } from './ui/touch.js';
import { adoptEarlierSaves } from './game/savekeys.js';
import { simFingerprint } from './game/replay.js';

const canvas = document.getElementById('screen');
const input = new Input(window);
// Saves made under the keys' earlier prefix move under the game's own name before anything
// reads one (game/savekeys.js): a player's records, awards, replays and settings come through.
adoptEarlierSaves();
// The screen's context is made with LOW LATENCY as saved, so the canvas the page boots with is
// the one it plays on; turning the option over later swaps in a new one (Renderer.setLowLatency).
const renderer = new Renderer(canvas, { lowLatency: Settings.load().lowLatency });
const audio = new Audio();
const game = new Game(input);

// Attract mode. A real Game instance with a real simulation behind the menu, driven by
// a bot. It runs until the bot dies, and the death plays out before the next tower.
// It is the game a player gets -- the real tower, the real fire -- at the game's DEFAULT
// settings, never the ones saved on this machine (autoplay.js startDemo).
const demoInput = new AutoInput();
const demoGame = new Game(demoInput);
const demoBot = new AutoPlayer(demoInput);
startDemo(demoGame);
let demoAge = 0;
let demoDead = 0;   // seconds since the bot lost, so the death can play out
// Whether the demo was on screen in the last step: it is started again when it comes back
// into view (update). Started with the page, it is on screen from the first frame.
let demoWasOn = true;
// Seconds with no key, button or click on the title screen, for the attract view
// (screens.js ATTRACT_IDLE): the menu fades out and the demo fills the screen.
let idleT = 0;
/** The attract view's fade: 0 with the menu up, 1 with it gone. */
const attractK = () => Math.max(0, Math.min(1, (idleT - ATTRACT_IDLE) / ATTRACT_FADE));

function restartDemo() {
  // A picked tower, not a rolled one (DEMO_SEEDS), and a bot with nothing left over from
  // the last: its flight, its watchdog, its facing.
  startDemo(demoGame);
  demoBot.reset();
  demoAge = 0;
  demoDead = 0;
}

// How long the demo holds on a death before starting the next tower. Long enough for the
// fall, the impact and the pieces coming to rest -- the death is some of the best work in
// the game and attract mode used to cut it the instant the bot stopped being alive.
const DEMO_LINGER = 4.0;

function stepDemo(dt) {
  demoAge += dt;

  // IT RUNS UNTIL THE BOT DIES. No timer.
  //
  // There was a two-minute cap here, to stop one tower playing for the whole session so
  // the seed rotation would be seen. That reasoning was backwards: the zones change as
  // you climb, so a long run is what SHOWS the tower, and a run cut at two minutes never
  // gets past the early ones. The rising floor is live and the bot is mortal, so the run
  // ends on its own -- which is the ending worth watching anyway.
  if (demoGame.state === STATE.PLAYING || demoGame.state === STATE.FALLING) {
    demoBot.step(demoGame, dt);
    demoGame.step(dt);
    demoDead = 0;
    return;
  }

  // Dead. Keep stepping so the body falls, bounces and settles, then start again.
  demoDead += dt;
  demoGame.step(dt);
  if (demoDead >= DEMO_LINGER) restartDemo();
}

let all = Stats.load();
let settings = Settings.load();
let optSel = 0;
let optFrom = STATE.MENU;

// Played by touch -- the Android build, or a phone's browser (ui/touch.js touchWanted). A phone's
// defaults go into the save the first time (Settings.phoneDefaults: FRAME CAP 60).
const touchUI = touchWanted();
if (touchUI) Settings.phoneDefaults(settings);
// The options' rows on this screen (Settings.optionsFor): TOUCH KEYS on a phone, LOW LATENCY
// where the hint can work. `optSel` indexes this list, never OPTIONS itself.
const LOW_LATENCY_WORKS = lowLatencyWorks();
const optList = () => Settings.optionsFor({ touch: touchUI, lowLatency: LOW_LATENCY_WORKS });

function applySettings() {
  renderer.applySettings(settings);
  // Both games: the menu's demo shows them too, and a comparison should hold everywhere.
  game.companions.movement = settings.companions;
  demoGame.companions.movement = settings.companions;
  game.particles.setBudget(PARTICLE_BUDGET[settings.particles]);
  audio.setMusic(settings.music);
  // Music switched back on in the options opened from the scoreboard restarts the lament
  // from its top: land it at its stab, as it was (a no-op once it has landed). Only once he
  // HAS landed: O opens the options from anywhere, the fall included, and there any
  // setting changed struck the stab with him frozen in mid-air; the impact lands it then.
  if (audio.track === 'gameover' && (game.impacted || optFrom === STATE.DEAD)) audio.landLament();
  showPerf = settings.showFps;
  applyRenderCap();
  Settings.save(settings);
}
let records = [];
let unlocked = [];
let statsPage = 0;
let statsFrom = STATE.MENU;
let tutPage = 0;
let tutFrom = STATE.MENU;
let tutThenStart = false;
// The race the guide stands in front of, started when it closes. A first-time player's first
// run can be a race -- a replay a friend sent, imported and raced from the REPLAYS screen --
// and the guide used to start a plain run after it, on a random tower with no ghost.
let tutRace = null;
let awardsResetArmed = false;
let showPerf = false;
let quitting = false;
let quitBlocked = false;
let lastRender = performance.now();
let uiT = 0;

game.onDeath = (run, tierIndex) => {
  records = Stats.commit(all, run, tierIndex);
  unlocked = checkAwards(all);
  if (unlocked.length) Stats.save(all);
};

// --- audio hooks -----------------------------------------------------------
// Every sound a run makes, and the music's part in the climb and the death, is wired in
// render/gamesounds.js, from outside the simulation: the physics path has no audio in it.
// The scoreboard's sounds need what the run earned, which is settled here, in onDeath.
wireGameAudio(game, audio, { scoreboard: () => ({ records: records.length, unlocked: unlocked.length }) });

// --- replays ---------------------------------------------------------------
// Every run recorded and kept, the instant replay, the REPLAYS screen, the race against a
// ghost and replay files: ui/replays.js. main.js calls into it at the start of a run, after
// each step, for keys and pad buttons, and to draw; the attract demo never reaches it.
const replays = new ReplayUI({
  game, renderer, audio, input,
  stats: () => all,
  board: () => ({ records, unlocked }),
  settings: () => settings,
  startRun: (race) => startRun(race),
});
// The simulation's fingerprint, worked out once now (~20 ms) rather than in the frame the
// first run ends in, which is when the first replay is saved.
simFingerprint();

/** A new run; a race against a ghost when `race` ({ replay, seed, course }) is given. */
function startRun(race = null) {
  // First time anyone actually sets off, show the guide first and start the run when
  // they finish it. At the menu it was an obstacle between the player and the game --
  // the first thing they saw was a wall of text they had not asked for. Here they have
  // already decided to climb, so it reads as the briefing before the climb.
  if (!settings.guideSeen) { tutRace = race; openTutorial(STATE.MENU, true); return; }
  audio.init();
  audio.resetKeys();
  audio.resume();
  audio.resumeCtx();
  records = [];
  unlocked = [];
  // A run still being recorded -- left from the pause's stats page with SPACE -- is kept as
  // it ended before the new one replaces it. A race is run on the replay's own seed, and on
  // the ghost run's own tower when there is a course (ui/replays.js surveyed it): the seed
  // alone is not the tower, since each floor is laid out in the shaft its run had opened.
  replays.endRun();
  // At the player's options; a race at the ones the player chose when asked before it
  // (replays.js askKey, 2026-09-29): `race.match` true is the run's own JUMP SPEED, DIFFICULTY
  // and GRAVITY, the race on equal terms, false the player's. A race's PLATFORMS are its
  // GHOST's whichever: on the ghost's own tower its course says so anyway, and raced on the
  // seed alone (GHOST ONLY) its ledges are at least the width its run had. A race begun without
  // the question (`match` unset) is as races always were: the player's JUMP SPEED, the ghost's
  // DIFFICULTY and GRAVITY -- the same fire it climbed ahead of, the same weight it climbed
  // with. The attract demo never comes through here: it runs at the game's defaults
  // (autoplay.js startDemo).
  const h = race && race.replay ? race.replay.header : null;
  const theirs = !!h && race.match === true, mine = !h || race.match === false;
  const jumpSpeed = theirs ? h.jumpSpeed || 1 : settings.jumpSpeed;
  const platforms = h ? h.platforms || 1 : settings.platforms;
  const difficulty = mine ? settings.difficulty : h.difficulty || 0;
  const gravity = mine ? settings.gravity : h.gravity || 1;
  game.newRun(race ? race.seed : undefined, race ? race.course || null : null, jumpSpeed, platforms, difficulty, gravity);
  replays.beginRun(race);
  audio.stopMusic();
  audio.startClimb(game.run.maxFloor);
  audio.sfxMenu('select');
}

/**
 * Escape on the menu quits.
 *
 * window.close() only works on a window script opened -- which is exactly what
 * play.bat produces, because Chrome's --app mode treats it as one. In an ordinary tab
 * the browser refuses, so there is a visible fallback rather than a key that silently
 * does nothing.
 */
function quitGame() {
  audio.stopMusic();
  quitting = true;
  // In the desktop build the shell closes the application and nothing below runs.
  if (Settings.quitApp()) return;
  try { window.close() } catch (e) { /* refused */ }
  // If the window is still here a moment later, the browser blocked it.
  setTimeout(() => { if (!window.closed) quitBlocked = true; }, 250);
}

// Pause is the ONLY thing that silences the music; everything else crossfades.
// The pause's jingle goes first: suspend() lets it ring out before it stops the clock.
// It used to go after, onto a clock already stopped, and came out at the resume instead.
function pauseGame() {
  if (!game.pause()) return;
  audio.sfxPause();
  audio.suspend();
}

function resumeGame() {
  if (!game.resume()) return;
  audio.resumeCtx();
  audio.sfxResume();
}

/**
 * Open the guide over a live attract-mode game.
 *
 * `from` is remembered because the guide is reachable from two places -- automatically
 * on a first run, and from OPTIONS afterwards -- and dumping an OPTIONS visitor on the
 * menu when they escape out would lose their place. HELP has this bug today: it returns
 * to MENU unconditionally.
 */
function openTutorial(from, thenStart = false) {
  tutFrom = from;
  tutThenStart = thenStart;
  tutPage = 0;
  game.state = STATE.TUTORIAL;
  audio.sfxMenu('select');
}

function closeTutorial() {
  // Latch it as seen on the way out, whether it was read or skipped. Skipping is an
  // answer; being asked again every launch is not.
  if (!settings.guideSeen) { Settings.markGuideSeen(settings); }
  if (tutThenStart) { tutThenStart = false; const race = tutRace; tutRace = null; startRun(race); return; }
  if (tutFrom === STATE.OPTIONS) { game.state = STATE.OPTIONS; }
  else { toMenu(); }
  audio.sfxMenu('back');
}

function toMenu() {
  game.state = STATE.MENU;
  audio.resumeCtx();
  audio.stopMusic();
  audio.resetKeys();
  audio.crossTo('menu');
}

/**
 * Start audio at the first opportunity, and start the RIGHT track.
 *
 * A browser will not create an AudioContext outside a user gesture, so toMenu() at load
 * time silently does nothing -- which is why the menu music never played. This runs on
 * the first key or click and starts whatever track the current screen calls for.
 */
// The samples to look for are SAMPLE_NAMES in audio.js, built from the milestone table
// that fires them. They used to be a list written out here, and it went on naming the
// hop-count callouts (milestone5 to milestone100) after the game had moved to asking for
// milestone50 to milestone350, so five of its files could never play and the files the
// game did ask for were never loaded.
let samplesRequested = false;

function ensureAudio() {
  if (!audio.init()) return false;
  audio.resume();
  // Fired once, on the first gesture, because the context has to exist to decode into.
  // Deliberately not awaited: a missing assets folder must not delay the first sound.
  if (!samplesRequested) {
    samplesRequested = true;
    audio.loadSamples(SAMPLE_NAMES).then((n) => {
      if (n) console.info(`[audio] ${n} sample(s) loaded from assets/sfx/`);
    });
  }
  startTrackForState();
  return true;
}

/**
 * What the sound notice says, or false for none. It is up while the page has not yet been let
 * make a sound at all (audio.blocked): true for "click or press a key", and 'pad' once a pad
 * has been used, whose presses a browser does not count -- the pad player is told so.
 *
 * And it goes the moment the page has had a click or a key the browser counts (a user
 * activation), not when the context's state says so. The state catches up a task later: 17 to
 * 24 ms after SPACE on the title in Chromium (measured under Chrome's autoplay gate), when
 * SPACE had already started the run or the guide -- so for those frames the notice came up in
 * the run's place at the top, and vanished: a plate flashed at every keyboard player's first
 * climb. The activation is exactly what the notice asks for, and ensureAudio has asked by then.
 */
function soundNotice() {
  if (!audio.blocked || activated()) return false;
  if (touchUI && input.lastDevice !== 'pad') return 'touch';
  return input.lastDevice === 'pad' ? 'pad' : true;
}

/** Whether the page has had a user activation, where the browser says (not every one does). */
function activated() {
  try { return !!(navigator.userActivation && navigator.userActivation.hasBeenActive); } catch (e) { return false; }
}

/** Put the right track on for whatever screen we are looking at. */
function startTrackForState() {
  // Guarded on whether anything is actually SCHEDULED, not on whether a name was once
  // assigned. `track` is a label; `voices` is the thing making noise. Testing the label
  // meant that any state where a track had been named but never started -- music
  // switched off, a context that refused to resume -- blocked every later retry.
  if (!audio.ctx || !audio.musicOn || audio.voices) return;
  // Mid-climb, the theme and key of the stage the run has reached, not the first one.
  if (game.state === STATE.PLAYING || game.state === STATE.PAUSED) audio.startClimb(game.run.maxFloor);
  else if (game.state === STATE.DEAD || game.state === STATE.FALLING) {
    audio.crossTo('gameover');
    // Sound that comes up after he has landed starts the lament at its stab, not in a fall
    // that is already over (Audio.landLament; with the lament not yet started, the stab is
    // its first note).
    if (game.state === STATE.DEAD || game.impacted) audio.landLament();
  } else audio.crossTo('menu');
}

// Every kind of first contact counts as the gesture, because the browser will not make
// a sound until one of them happens and the player should never have to guess which. A touch's
// is its END: Chromium lets a page make a sound from a finger's pointerup and touchend, not from
// its pointerdown, so on a phone the first tap asked too early and the sound waited for the next.
for (const ev of ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'keyup', 'pointerup', 'touchend']) {
  window.addEventListener(ev, ensureAudio, { passive: true });
}

// Regaining focus is a fine moment to try again -- and on Windows it is the common one,
// because the launcher's own console window can hold the foreground while the game is
// already up.
window.addEventListener('focus', ensureAudio);
document.addEventListener('visibilitychange', () => { if (!document.hidden) ensureAudio(); });
let windowFocused = true;

/**
 * Take keyboard focus, or the first key press goes nowhere.
 *
 * This is the actual reason the music needed a click. Everything hangs off a `keydown`
 * listener on `window`, and a freshly loaded document does not always hold focus -- in
 * an embedded frame, a restored tab, or a window opened by a shortcut, the key event is
 * delivered somewhere else entirely, so ensureAudio never runs and the AudioContext is
 * never unblocked. Clicking gave the document focus AND counted as the gesture, which
 * is why clicking looked like the thing that fixed it.
 */
function grabFocus() {
  try {
    const c = renderer.canvas || document.getElementById('screen');
    if (c) { c.tabIndex = 0; c.focus({ preventScroll: true }); }
    window.focus();
  } catch (e) { /* focus is best-effort; the on-screen hint covers the rest */ }
}
grabFocus();
window.addEventListener('load', grabFocus);
// And on every click: inside itch.io's iframe the page arrives WITHOUT focus, and the
// click that is meant to hand it over should land it on the canvas, not somewhere the
// keys might still miss.
window.addEventListener('pointerdown', grabFocus);
// A click or a touch is input too: it wakes the attract view and starts the idle count again.
window.addEventListener('pointerdown', () => { idleT = 0; });

/**
 * Self-healing safety net.
 *
 * `resume()` is asynchronous and can be refused, so a gesture is not a guarantee that
 * the context came up -- and a track "started" against a suspended context plays to
 * nobody and would never restart itself. Once a second, if sound is genuinely running
 * and nothing is playing, put the right track on.
 */
setInterval(() => {
  if (audio.running && !audio.track) startTrackForState();
}, 1000);

// --- keys ------------------------------------------------------------------
// A named function rather than the listener itself, so the gamepad can press the same
// keys (see `pad` below) and the menus stay written once.
function onKey(code) {
  ensureAudio();

  // Any key wakes the title screen's attract view, and does nothing else: a SPACE pressed to
  // bring the menu back must not also start a run. Every key starts the idle count again.
  const woke = attractK() > 0;
  idleT = 0;
  if (woke) { audio.sfxMenu('move'); return; }

  if (quitting) { quitting = false; quitBlocked = false; if (code === 'Escape') return; }

  // The replays' keys: every key but mute and fullscreen while a replay screen is up; R on
  // the title and the scoreboard, G on the scoreboard, otherwise.
  if (replays.onKey(code, game.state)) return;

  if (code === 'KeyM') {
    audio.setMuted(!audio.muted);
    return;
  }
  // F is fullscreen, which is the single thing that makes this fill a 4K display.
  // The FPS overlay moved into the graphics menu.
  // Inside a frame that does not allow it (see embed.js) the request would only reject.
  if (code === 'KeyF' || code === 'F11') { if (fullscreenAllowed()) Settings.toggleFullscreen(); return; }
  if (code === 'KeyO') {
    if (game.state === STATE.OPTIONS) { game.state = optFrom; audio.sfxMenu('back'); }
    else { optFrom = game.state; optSel = 0; game.state = STATE.OPTIONS; audio.sfxMenu('select'); }
    return;
  }

  switch (game.state) {
    case STATE.OPTIONS: {
      const rows = optList();
      const n = rows.length;
      if (code === 'ArrowUp' || code === 'KeyW') { optSel = (optSel + n - 1) % n; audio.sfxMenu('move'); }
      else if (code === 'ArrowDown' || code === 'KeyS') { optSel = (optSel + 1) % n; audio.sfxMenu('move'); }
      else if (code === 'ArrowLeft' || code === 'KeyA') {
        Settings.cycle(settings, rows[optSel].key, -1); applySettings(); audio.sfxMenu('move');
      } else if (code === 'ArrowRight' || code === 'KeyD' || code === 'Space' || code === 'Enter') {
        // Action rows run something instead of holding a value, so they are intercepted
        // here: cycle() leaves a row with no `values` alone, and would do nothing.
        const act = Settings.actionFor(rows[optSel].key);
        if (act === 'guide') { openTutorial(STATE.OPTIONS); }
        else { Settings.cycle(settings, rows[optSel].key, 1); applySettings(); audio.sfxMenu('move'); }
      } else if (code === 'Escape') { game.state = optFrom; audio.sfxMenu('back'); }
      break;
    }

    case STATE.TUTORIAL: {
      // Unlike HELP, which dismisses on any key at all, this one tests the code --
      // otherwise the arrow keys meant to page through it would close it instead.
      const n = TUTORIAL_PAGES.length;
      if (code === 'ArrowRight' || code === 'KeyD') {
        if (tutPage < n - 1) { tutPage++; audio.sfxMenu('move'); }
      } else if (code === 'ArrowLeft' || code === 'KeyA') {
        if (tutPage > 0) { tutPage--; audio.sfxMenu('move'); }
      } else if (code === 'Space' || code === 'Enter') {
        // SPACE only confirms on the last page, so it cannot be mashed past.
        if (tutPage < n - 1) { tutPage++; audio.sfxMenu('move'); }
        else { closeTutorial(); }
      } else if (code === 'Escape') {
        closeTutorial();
      }
      break;
    }

    case STATE.MENU:
      if (code === 'Escape') { quitGame(); }
      else if (code === 'Space' || code === 'Enter') { startRun(); }
      else if (code === 'KeyS') { statsFrom = STATE.MENU; statsPage = 0; game.state = STATE.STATS; audio.sfxMenu('select'); }
      else if (code === 'KeyH') {
        // Opening the instructions yourself counts. Being shown the guide immediately
        // afterwards would be telling someone what they just went and looked up.
        if (!settings.guideSeen) Settings.markGuideSeen(settings);
        game.state = STATE.HELP;
        audio.sfxMenu('select');
      }
      break;

    case STATE.PLAYING:
      // Escape pauses. It used to throw the run away and go to the menu, which is a
      // brutal thing to do to someone who only wanted to answer the door.
      if (code === 'Escape' || code === 'KeyP') { pauseGame(); }
      break;

    case STATE.PAUSED:
      if (code === 'Escape' || code === 'KeyP' || code === 'Space' || code === 'Enter') {
        resumeGame();
      } else if (code === 'KeyQ') { game.state = STATE.PLAYING; toMenu(); audio.sfxMenu('back'); }
      // Held, like every effect while paused (Audio.sfx): nothing may queue onto the
      // stopped clock and burst out at the resume.
      else if (code === 'KeyS') { statsFrom = STATE.PAUSED; statsPage = 0; game.state = STATE.STATS; audio.sfxMenu('select'); }
      break;

    case STATE.FALLING:
      // Space cuts the theatre short. Escape leaves entirely.
      if (code === 'Space' || code === 'Enter') { game.skipFall(); audio.stopScream(); }
      else if (code === 'Escape') { game.skipFall(); audio.stopScream(); toMenu(); }
      break;

    case STATE.DEAD:
      if (code === 'Space' || code === 'Enter') { startRun(); }
      else if (code === 'KeyS') { statsFrom = STATE.DEAD; statsPage = 0; game.state = STATE.STATS; audio.sfxMenu('select'); }
      else if (code === 'Escape') { toMenu(); audio.sfxMenu('back'); }
      break;

    case STATE.STATS:
      if (awardsResetArmed) {
        // Armed: only R confirms, anything else backs out. Nothing that destroys
        // earned progress should be one keypress away.
        if (code === 'KeyR') {
          // A full wipe. The first version cleared the awards and the stats that gate
          // them, and kept the run history -- which meant the screen you were looking
          // at when you pressed it still had numbers on it, so it read as not having
          // worked. Reset means reset.
          all = Stats.reset();
          records = [];
          unlocked = [];
          awardsResetArmed = false;
          audio.sfxMenu('erase');
        } else { awardsResetArmed = false; audio.sfxMenu('back'); }
        break;
      }
      if (code === 'KeyR') { awardsResetArmed = true; audio.sfxMenu('select'); break; }
      if (code === 'ArrowLeft' || code === 'KeyA') { statsPage = (statsPage + PAGES.length - 1) % PAGES.length; audio.sfxMenu('move'); }
      else if (code === 'ArrowRight' || code === 'KeyD') { statsPage = (statsPage + 1) % PAGES.length; audio.sfxMenu('move'); }
      else if (code === 'Space' || code === 'Enter') { startRun(); }
      else if (code === 'Escape' || code === 'KeyS') { game.state = statsFrom; audio.sfxMenu('back'); }
      break;

    case STATE.HELP:
      game.state = STATE.MENU;
      audio.sfxMenu('back');
      break;
  }
}
window.addEventListener('keydown', (e) => onKey(e.code));

// --- gamepad ---------------------------------------------------------------
// In a run the pad drives the Input itself (gamepad.js) and only Start gets through
// here, as Escape, to pause. Everywhere else its D-pad, stick flicks and buttons arrive
// as the key codes onKey already handles. Start is Enter outside a run: Escape on the
// title screen quits, and Start is the button a player presses to BEGIN. Y is S, the
// stats (not in the options, where S moves the cursor); X is H, the help, except in the
// pause, where it is Q, the way back to the title.
const pad = new Gamepad(input, {
  onKey(code) {
    const inRun = game.state === STATE.PLAYING || game.state === STATE.PAUSED;
    if (code === 'PadStart') code = inRun ? 'Escape' : 'Enter';
    else if (game.state === STATE.PLAYING) return;
    // On a replay screen the replays say what each button is (ReplayUI.padCode), and while the
    // race's question is up, on the scoreboard too (X there is MY OPTIONS, not the help).
    // Elsewhere RB is R (the REPLAYS screen on the title, the instant replay on the scoreboard)
    // and LB is G (the race against the best run, on the scoreboard).
    else if (replays.active || replays.asking) { code = replays.padCode(code); if (!code) return; }
    else if (code === 'PadRB') code = 'KeyR';
    else if (code === 'PadLB') code = 'KeyG';
    else if (code === 'PadY') { if (game.state === STATE.OPTIONS) return; code = 'KeyS'; }
    else if (code === 'PadX') code = game.state === STATE.PAUSED ? 'KeyQ' : 'KeyH';
    onKey(code);
  },
  // Unplugged mid-run: pause, exactly as losing focus does.
  onLost() { if (game.state === STATE.PLAYING) pauseGame(); },
  // Any press asks for the sound, as any key does. The desktop build needs no gesture, so
  // there that alone starts it; a browser does not count a pad press as one, the context
  // stays suspended, and the notice (soundNotice) tells the player what will start it.
  onTouch: ensureAudio,
});

// Losing focus mid-run would otherwise leave the player running into a wall while
// the floor keeps rising.
// Losing focus mid-run pauses properly rather than leaving the player running into a
// wall while the floor rises.
window.addEventListener('blur', () => {
  if (game.state === STATE.PLAYING) pauseGame();
  windowFocused = false;
  applyRenderCap();
});
window.addEventListener('focus', () => { windowFocused = true; applyRenderCap(); });
document.addEventListener('visibilitychange', applyRenderCap);

/**
 * Decide how often it is worth DRAWING. The simulation is never capped.
 *
 * Three cases, and the middle one is the one that mattered. A live run gets every frame
 * the display will give it, because that is the whole point of the fixed-timestep loop.
 * But the menu, the stats pages and the guide all sit over a live attract-mode game that
 * was being drawn 160 times a second, indefinitely, while nobody was playing -- and it
 * kept doing that with the window in the background, because the blur handler only
 * paused an actual RUN. A machine left on the title screen was being asked to render a
 * full game forever for no reason at all.
 */
function applyRenderCap() {
  // A replay being watched is drawn like a run: it is one.
  const playing = game.state === STATE.PLAYING || game.state === STATE.FALLING || replays.watching;
  if (typeof document !== 'undefined' && document.hidden) { loop.setRenderCap(4); return; }
  // Unless a pad is playing it: a pad still works in a window that has lost the keyboard
  // (a click on another monitor, on itch.io's page around the frame), so a run resumed
  // with Start there is being played, and at 10 fps it was a slide show.
  // Unfocused but in view -- a click on the other monitor, a notification -- it drew 5 fps on
  // the title screen and 10 in a replay: the attract run behind the menu went to a slide show
  // until the window had the focus back, which read as the menu glitching ("it starts to stutter
  // and flickers before returning to normal", 2026-09-29). Half the menus' rate, still smooth;
  // a window out of sight (document.hidden, above) still drops to 4.
  if (!windowFocused && !(playing && input.lastDevice === 'pad')) {
    loop.setRenderCap(30); return;
  }
  if (playing) { loop.setRenderCap(settings.fpsCap || 0); return; }
  loop.setRenderCap(60);
}

// --- loop ------------------------------------------------------------------
let capState = null;
function update(dt) {
  // States change from a dozen places; rather than remember to call applyRenderCap from
  // each of them, notice the change here. One comparison per frame.
  const cs = game.state + (replays.mode || '');
  if (cs !== capState) { capState = cs; applyRenderCap(); }
  // A replay screen is up: the live game is FROZEN under it, so leaving it finds the
  // scoreboard, or the title, exactly as it was; the attract demo goes on behind the list.
  if (replays.active) {
    replays.update(dt);
    demoWasOn = false;
    idleT = 0;
    return;
  }
  // The attract demo steps only while it is on screen -- the title and the guide draw it; the
  // options, the stats, the help and the replays' list are opaque screens, and it climbed on
  // behind them unseen -- and starts its tower again from the first floor each time it comes
  // back into view. The user, 2026-09-29: "make sure the bot restarts everytime from the very
  // start whenever we enter the main menu so he doesnt keep going when we dont see him".
  const demoOn = game.state === STATE.MENU || game.state === STATE.TUTORIAL;
  if (demoOn && !demoWasOn) restartDemo();
  demoWasOn = demoOn;
  if (demoOn) stepDemo(dt);
  // Idle on the title screen, the quit's question not up: the attract view comes at
  // ATTRACT_IDLE seconds (drawFrame).
  idleT = game.state === STATE.MENU && !quitting ? idleT + dt : 0;
  game.step(dt);
  // The run's recording ends here, the step after it did (the fire, or a quit).
  replays.afterStep();
}

/**
 * A frame: drawn (drawFrame), then put on the screen whole (Renderer.present -- under LOW
 * LATENCY it was drawn into a back buffer; without, present does nothing).
 */
function renderFrame(alpha, forcedDt) {
  // The keycaps this frame draws are the keys a phone's top row offers (ui/touch.js).
  if (touch) watchCaps(touch.beginCaps());
  drawFrame(alpha, forcedDt);
  if (touch) watchCaps(null);
  renderer.present();
}

function drawFrame(alpha, forcedDt) {
    const now = performance.now();
    const dt = forcedDt !== undefined ? forcedDt : Math.min(0.1, (now - lastRender) / 1000);
    lastRender = now;
    uiT += dt;

    // A replay screen draws the whole frame: the replay being watched, or the list.
    if (replays.active) {
      replays.render(renderer.ctx, alpha, dt, uiT);
      if (showPerf) drawPerf(renderer.ctx, loop, game);
      return;
    }

    // The beat tracks the run: faster as you climb harder, easing back when you calm
    // down, and dropping to the slow version of the same riff when you die.
    if (game.state === STATE.PLAYING) audio.setIntensity(game.intensity, dt);
    else if (game.state !== STATE.FALLING) audio.setIntensity(0, dt);

    const ctx = renderer.ctx;
    // Every screen below draws in WORLD units (the 480x270 layout everything was
    // designed against) and PX maps those onto the real backing store. Set explicitly
    // rather than inherited, because the branches that do not call renderer.draw would
    // otherwise be running on whatever transform the previous frame happened to leave.
    const ui = () => ctx.setTransform(PX, 0, 0, PX, 0, 0);

    if (game.state === STATE.MENU) {
      // The bot's game is the background. Dimmed, so the title stays readable.
      renderer.draw(demoGame, alpha, dt);
      ctx.setTransform(PX, 0, 0, PX, 0, 0);
      // The attract view: idle ATTRACT_IDLE seconds, the wash and the menu fade out and the
      // game is the whole screen, the prompt flashing over it (screens.js drawAttractPrompt).
      const k = attractK();
      if (k < 1) {
        ctx.globalAlpha = 1 - k;
        // Enough to keep the title readable, light enough that the bot is worth
        // watching -- which is the entire reason it is running.
        ctx.fillStyle = '#05030a9e';
        ctx.fillRect(0, 0, VW, VH);
        drawMenu(ctx, all, uiT, dt, true, soundNotice(), touchMenu());
        if (quitting) drawQuit(ctx, quitBlocked, uiT);
        ctx.globalAlpha = 1;
      }
      if (k > 0) drawAttractPrompt(ctx, uiT, k, touchUI);
    } else if (game.state === STATE.TUTORIAL) {
      // Same treatment as the menu: the guide is drawn over a game that is actually
      // being played, because every page points at something the bot is doing.
      renderer.draw(demoGame, alpha, dt);
      ctx.setTransform(PX, 0, 0, PX, 0, 0);
      ctx.fillStyle = '#05030ac4';
      ctx.fillRect(0, 0, VW, VH);
      drawTutorial(ctx, tutPage, demoGame, uiT);
    } else if (game.state === STATE.OPTIONS) {
      ui();
      window.VYTIS_SCALE = renderer.scale;
      drawOptions(ctx, settings, optSel, uiT, loop, optList(), touchUI);
    } else if (game.state === STATE.STATS) {
      ui();
      drawStats(ctx, all, statsPage, uiT, awardsResetArmed);
    } else if (game.state === STATE.HELP) {
      ui();
      drawMenu(ctx, all, uiT, dt, false, false, touchMenu());
      drawHelp(ctx, uiT, touchUI);
    } else {
      // Renderer.draw freezes itself when the game is paused -- alpha and dt both. See
      // the comment there; it is not the caller's job to remember.
      //
      // The HUD is handed to the renderer rather than drawn after it, so it lands BEHIND
      // the companions and the Duke. They ride high in the view and the HUD's left column
      // runs most of its height, so one was permanently printed over the other.
      //
      // When the fire has him the HUD fades out (drawFalling is handed it for that), and on
      // the scoreboard it stays gone: it used to come back there, faint under the board's
      // dark, FALL ROOM and all, after the whole fall without it.
      //
      // The fall's WORDS (SPLAT, the verdict, the prompts) are not the HUD: they go over the
      // world, as the scoreboard does. Under the characters, a splat's pieces flew across
      // them.
      renderer.draw(game, alpha, dt, () => {
        // A raced ghost goes in first, under the HUD and the characters (ui/replays.js).
        replays.drawRaceGhost(ctx, alpha);
        if (game.state === STATE.FALLING) drawFalling(ctx, game, uiT, (g, view) => { drawHud(g, view, all, uiT); replays.drawRaceHud(g); });
        else if (game.state !== STATE.DEAD) { drawHud(ctx, game, all, uiT); replays.drawRaceHud(ctx); }
      });
      ui();
      if (game.state === STATE.FALLING) drawFallWords(ctx, game, uiT);
      if (game.state === STATE.DEAD) drawGameOver(ctx, game, all, records, unlocked, uiT);
      // The replay's keys on the board's key panel (R REPLAY, G RACE BEST), after the board.
      if (game.state === STATE.DEAD) replays.drawBoard(ctx, records, unlocked);
      if (game.state === STATE.PAUSED) drawPaused(ctx, game, uiT);
    }

    // The sound notice, on every screen until there is sound, each in its own place (the
    // title draws its own). On the title alone, a pad player's first press started the run
    // and took the notice with it, in silence.
    const notice = soundNotice();
    if (notice && SOUND_PLACES[game.state]) {
      ui();
      drawSoundNotice(ctx, uiT, notice === 'pad', SOUND_PLACES[game.state]);
    }

    if (showPerf) drawPerf(ctx, loop, game);
    // What is painted ahead is not on the screen: its keycaps are no keys to offer.
    if (touch) watchCaps(null);
    warmAhead(game);    // the scoreboards and the titles, painted ahead under deadlines; never in the fall
}

// --- touch -------------------------------------------------------------------
// A phone -- the Android build (android/), or a phone's browser -- plays on on-screen keys
// (ui/touch.js): each button a keydown and keyup on this window, as a keyboard's, so nothing
// above knows the difference. On a desktop, with no `touch` in the address, none are made.
//
// Each screen has the fixed buttons its keys are for (touchKeys), no more: none on the title,
// whose own buttons are drawn on it (screens.js TOUCH_BUTTONS), and ^ v only where a cursor
// moves -- the user, 2026-09-29: "up and down arrows appear on the main menu when they do nothing
// there". What a screen draws to be tapped is `touchTargets`, in view units.
const TOUCH_KEYS = {
  run: ['left', 'right', 'jump', 'esc'],                    // a run, the guide
  watch: ['left', 'right', 'up', 'down', 'jump', 'esc'],    // a replay: seek, speed, pause, leave
  list: ['up', 'down', 'jump', 'esc'],                      // the replays' list
  options: ['up', 'down', 'left', 'right', 'jump', 'esc'],
  pages: ['left', 'right', 'esc'],                          // the statistics' pages
  confirm: ['jump', 'esc'],                                 // the pause, the fall, the board, the race's question
  back: ['esc'],                                            // the quit's question
  none: [],
};
function touchKeys() {
  if (replays.asking) return TOUCH_KEYS.confirm;
  if (replays.watching) return TOUCH_KEYS.watch;
  if (replays.active) return TOUCH_KEYS.list;
  switch (game.state) {
    case STATE.PLAYING: case STATE.TUTORIAL: return TOUCH_KEYS.run;
    case STATE.OPTIONS: return TOUCH_KEYS.options;
    case STATE.STATS: return TOUCH_KEYS.pages;
    case STATE.MENU: return quitting ? TOUCH_KEYS.back : TOUCH_KEYS.none;
    case STATE.HELP: return TOUCH_KEYS.none;              // a tap anywhere is the way back (below)
    default: return TOUCH_KEYS.confirm;                   // the pause, the fall, the scoreboard
  }
}
const NO_TARGETS = [];
// The help says TAP TO GO BACK: the whole page, the wings too, is ESC there.
const ANYWHERE = [{ x: -1e4, y: -1e4, w: 2e4, h: 2e4, code: 'Escape' }];
function touchTargets() {
  if (replays.active || replays.asking) return NO_TARGETS;
  // Not while the attract view is up, even fading: the tap that wakes it must not also press.
  if (game.state === STATE.MENU) return quitting || attractK() > 0 ? NO_TARGETS : menuTargets();
  if (game.state === STATE.HELP) return ANYWHERE;
  return NO_TARGETS;
}
const touch = touchUI ? new TouchControls({
  mode: () => (game.state === STATE.PLAYING && !replays.active ? 'run' : 'menu'),
  keys: touchKeys,
  size: () => settings.touchKeys,
  targets: touchTargets,
  toView: (x, y) => renderer.toView(x, y),
}) : null;
if (touch) warmTouch();
// What the title is told of the phone: the button a finger is on, to light it (screens.js drawMenu).
const touchState = { pressed: null };
function touchMenu() {
  if (!touch) return null;
  touchState.pressed = touch.pressedCode;
  return touchState;
}

// The Android build going to the background and back (android/, MainActivity's onPause and
// onResume): the run pauses as a blur pauses it, and the sound goes with the app -- in a browser
// a hidden tab's music plays on, an app's must not. The pause's jingle is left out: nobody is
// there to hear it. Coming back the music returns unless a run is paused, where the pause
// screen's own resume brings it. Nothing sends these in a browser or the desktop build.
window.addEventListener('app:background', () => {
  if (game.state === STATE.PLAYING) game.pause();
  audio.suspend();
});
window.addEventListener('app:foreground', () => {
  if (game.state !== STATE.PAUSED) audio.resumeCtx();
});

const loop = new Loop({ update, render: renderFrame, onFrame: (dt) => { pad.poll(dt); if (touch) touch.frame(dt); replays.frame(dt); } });

// The focus and saves banners in index.html, for a game inside someone else's page.
const embed = watchEmbed({
  inRun: () => game.state === STATE.PLAYING || game.state === STATE.FALLING,
  usingPad: () => input.lastDevice === 'pad',
});

// Re-fit whenever the viewport changes, which includes entering and leaving
// fullscreen -- the resize event alone does not always fire for the latter.
document.addEventListener('fullscreenchange', () => renderer.fit());
document.addEventListener('webkitfullscreenchange', () => renderer.fit());

// Build the audio graph NOW rather than waiting for a gesture.
//
// This is what actually made the game silent until you clicked. Nothing created an
// AudioContext outside a gesture handler, so there was no context to resume and no
// track to start -- the first pointerdown or keydown did all of it at once, and
// whichever of those arrived first was the moment sound began.
//
// Creating it here is safe everywhere: a browser enforcing the autoplay gate simply
// hands back a context in the `suspended` state, which the gesture listeners above then
// resume. And the desktop launcher passes --autoplay-policy=no-user-gesture-required,
// so under the shortcut the context comes up running and the menu music plays on load,
// with no gesture at all.
// --- font warm-up -----------------------------------------------------------
//
// Every colour the game can draw text in, built once at load instead of the first time
// it appears. See warmAtlases: a lazily-built atlas is a canvas allocation and a full
// glyph rasterisation inside a frame, and the moments it fired were the worst possible
// ones -- crossing into a new theme, or a big combo throwing up a white taunt.
//
// The theme colours come from the table so adding a theme cannot be forgotten. The UI
// list is literal, and tools/test-font.mjs fails if anything is missing from it.
warmAtlases([
  ...THEMES.flatMap((t) => [t.text, t.accent, t.particle, t.platTop]),
  '#000000',
  '#00000066',
  '#00000077',
  '#000000aa',
  '#000000cc',
  '#000000d0',
  '#001824',
  '#05010a',
  '#05030ad0',
  '#05030ad8',
  '#05030ae0',
  '#080310',
  '#08324a',
  '#0b0810',
  '#0d0a16',
  '#0e0a16',
  '#12000a',
  '#1a1428',
  '#1b1226',
  '#220008',
  '#241c38',
  '#2a2138',
  '#2a2a3a',
  '#2e2038',
  '#2e2444',
  '#3a3f58',
  '#4a4f68',
  '#4f7fd8',
  '#5a5f78',
  '#5ce1ff',
  '#6a6f8a',
  '#7a80a0',
  '#7dff5a',
  '#7dff8a',
  '#7fdcff',
  '#8a6a3a',
  '#8a8fa8',
  '#8c1230',
  '#8cff8c',
  '#9aa0bb',
  '#b8365a',
  '#ff2244',
  '#ff3355',
  '#ff6688',
  '#ff8844',
  '#ff9f45',
  '#ffe23d',
  '#ffe9a0',
  '#fff8c0',
  '#ffffff',
]);

// Every zone's scenery painted and brought up now, behind LOADING DUKE VYTIS, and the pool the
// skins and scoreboards are painted into in a run primed: a run then makes no canvas and
// paints nothing bigger than a slice (render/prepaint.js).
prepaint(renderer);
// And what the title screen used to paint a piece a frame in its first two seconds -- every
// other screen's plaques and words (menuskin.js warmMenu) and the callouts' letters and the
// next laps' badges (callouts.js) -- whole pieces of up to 28 ms in a 60 fps screen's frame:
// a stutter at every launch (see warmComboTextAll).
warmMenu(Infinity);
warmComboTextAll(demoGame);

audio.init();

// Start silent when asked. The audio graph now comes up at load, so anything that
// opens this page makes noise immediately -- unwelcome when the page is being opened
// only to look at it. Applied before the first track starts, so nothing is ever heard.
//
// Two ways in. The query string is the obvious one; the localStorage key exists
// because some embedders drop the query on navigation, and a flag that survives a
// reload is the only kind that reliably holds. Neither is ever set by the game --
// run localStorage.removeItem('dukevytis.devmute') to restore sound.
try {
  const devMute = localStorage.getItem('dukevytis.devmute') === '1';
  if (devMute || /[?&]mute/.test(location.search)) audio.setMuted(true);
} catch (e) {
  if (/[?&]mute/.test(location.search)) audio.setMuted(true);
}

applySettings();
loop.start();
toMenu();


// Exposed for the browser console and for the smoke test in tools/.
// Exposed so the tooling can drive the simulation deterministically without relying
// on requestAnimationFrame, which some environments never fire.
window.VYTIS = {
  game, loop, renderer, audio, STEP, input, pad, touch, embed, replays, demoGame,
  stats: () => all,
  settings: () => settings,
  attractK,
  board: () => ({ records, unlocked }),
  resetStats: () => { all = Stats.reset(); },
  update, renderFrame,
  advance(seconds, dt = STEP) {
    const n = Math.round(seconds / dt);
    for (let i = 0; i < n; i++) update(dt);
    return n;
  },
};
