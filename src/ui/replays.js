// The replays, as the player meets them: every run recorded and kept, the instant replay
// from the scoreboard, the REPLAYS screen off the title, the race against a ghost, and a
// replay file in and out. The engine is src/game/replay.js (its API is at its top); this is
// the wiring and the screens' logic, so main.js holds only the calls into it.
//
// RECORDING. Every real run is recorded from the step it starts (beginRun, straight after
// game.newRun) to its end, and kept with saveRun -- the store keeps the last run, the ten
// best and whatever is pinned. The end is decided here, once, in one place (afterStep): the
// step the fire takes him (the recorder seals itself in it; the save waits for the next
// animation frame, so the catch's own frame pays nothing -- 1-3 ms headless for a run of a
// minute or two, measured by tools/test-replayui.mjs), a run left for the title from the
// pause, a new run started over one still recorded (main.js startRun), and the window
// closing mid-run (pagehide). A quit run is kept too, as the last run -- it
// was played; it ends 'quit' and ranks by the score it had. A race is a real run and is
// recorded like any other, its replay carrying the ghost it raced and the tower it was run
// on (the ghost run's own, surveyed before it starts: raceId). The attract demo behind the
// menus is never recorded: nothing here ever sees demoGame. A storage error never interrupts play: a save that fails is
// caught, and the scoreboard says NOT SAVED where it would offer the race.
//
// WATCHING. A replay plays on a Game of its own (createPlayback), drawn by the same
// renderer, HUD and fall as the live one, under a small overlay (replayskin.js). The live
// game is FROZEN while a replay screen is up -- main.js does not step it -- and the
// renderer's clock and speed-streak pool, the only state a replay's frames change that the
// scoreboard's frame reads, are put back on the way out, so leaving shows the board exactly
// as it was. Sounds and music are the run's own: the playback's Game is wired to the audio
// by render/gamesounds.js exactly as main.js wires the live one, through a proxy that goes
// quiet while a seek simulates; a seek stops what was sounding and puts the right music on
// where it lands; leaving stops every effect and the music the replay started and puts back
// the screen's own track. The playback's Game has no onDeath, so watching commits no stats,
// awards or records, and it touches the store only to read.
//
// Everything is reachable from the keyboard alone and from a pad alone (main.js turns the
// pad's buttons into the key codes this reads; padCode says what they are here), and the
// hints say which key or button, following the device last touched (Input.lastDevice).

import * as Replay from '../game/replay.js';
import { Race, CourseSurvey } from '../game/race.js';
import { STATE } from '../game/game.js';
import { STEP } from '../core/loop.js';
import {
  PX, VW, REPLAY_SKIP, REPLAY_SPEEDS, REPLAY_SEEK_BUDGET,
  REPLAY_NOTE_LIFE, REPLAY_MAX_TEXT, BOARD_SLICE_MS,
} from '../game/constants.js';
import { THEMES } from '../game/themes.js';
import { textWidth } from '../render/font.js';
import { PARTICLE_BUDGET, OPTIONS, DEFAULTS, PLATFORM_WORDS, GRAVITY_WORDS } from '../game/settings.js';
import { wireGameAudio } from '../render/gamesounds.js';
import { boardSkinFor } from '../render/gameoverskin.js';
import { hudSkinFor, warmHudSkin } from '../render/hudskin.js';
import { LAYERS } from '../render/backdrop.js';
import { wallStrip, wallStats } from '../render/walls.js';
import { warmStreaks } from '../render/streaks.js';
import { platArt } from '../render/platsprites.js';
import { titleStats, warmTitleUntil } from '../render/zonetitles.js';
import { TITLE_PAINTERS } from '../render/titlepaint/index.js';
import { menuStats } from '../render/menuskin.js';
import {
  drawReplayOverlay, drawReplayList, drawBoardReplay, drawGhost, drawRaceReadout, drawRaceAsk, warmGhost, mmss, LIST,
} from '../render/replayskin.js';
import { drawHud } from './hud.js';
import { drawFalling, drawFallWords, boardKeysBox } from './screens.js';
import { replayFiles, readFileText, fileNameFor, TOO_BIG } from './replayfiles.js';

const ONE = REPLAY_SPEEDS.indexOf(1);
const inRun = (s) => s === STATE.PLAYING || s === STATE.PAUSED || s === STATE.FALLING;
const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
/** The longest note a line of the screen holds [characters]; longer ones end in '...'. */
const NOTE_MAX = Math.floor((VW - 36) / 6);
const clip = (s) => (s.length > NOTE_MAX ? s.slice(0, NOTE_MAX - 3) + '...' : s);

/**
 * A row of the REPLAYS screen: a listReplays() entry with its zone's name and its time -- the
 * time rounded to the second, as the scoreboard rounds it (screens.js fmtTime). Cut to the
 * second, the run the board called 25S was 0:24 here.
 */
export function listRow(e) {
  return { ...e, zoneName: (THEMES[e.zone] && THEMES[e.zone].name) || '-', time: mmss(Math.round(e.seconds)) };
}

/**
 * The options a race can be run at, as [the OPTIONS row's key, the value a replay's header
 * means by leaving it out]: every setting that changes how a run PLAYS. A header from before a
 * setting existed was played at what every run had then (main.js startRun reads it the same
 * way): 100%, MEDIUM ledges, the fire as it was, EASY, and NORMAL gravity. The cosmetic ones a header carries --
 * the companions' movement, the particles -- change nothing in a race and are not asked about.
 * PLATFORMS is `fixed`: a race is on its run's tower, whose ledges are the run's either way.
 */
export const RACE_OPTIONS = [['jumpSpeed', 1], ['platforms', 1, true], ['difficulty', 0], ['gravity', 1]];

/**
 * The race's question's rows (replayskin.js drawRaceAsk): each option as the replay was played
 * at it (`h`, its header) and as the player has it now (`s`, the settings), in the words the
 * OPTIONS screen shows -- and a width or a gravity the menu no longer offers by its own name
 * (settings.js PLATFORM_WORDS, GRAVITY_WORDS: an old run's 1 is CLASSIC, not the NORMAL that is
 * 0.9 now) -- [{ key, label, run, yours, same, fixed }]. `same` by those words: what the player
 * sees is what is compared, and no two values share a word.
 */
const WORDS = { platforms: PLATFORM_WORDS, gravity: GRAVITY_WORDS };
export function raceOptions(h, s) {
  return RACE_OPTIONS.map(([key, before, fixed = false]) => {
    const o = OPTIONS.find((r) => r.key === key);
    const say = (v) => (WORDS[key] && WORDS[key][String(v)]) || (o.show && o.show[String(v)])
      || (key === 'jumpSpeed' ? Math.round(v * 100) + '%' : String(v));
    const hv = h && h[key] !== undefined && h[key] !== null ? h[key] : before;
    const sv = s && s[key] !== undefined ? s[key] : DEFAULTS[key];
    const run = say(hv), yours = say(sv);
    return { key, label: o.label, run, yours, same: run === yours, fixed };
  });
}

export class ReplayUI {
  /**
   * deps: game, renderer, audio, input (for lastDevice), stats() (the save file, read only),
   * board() -> { records, unlocked } of the run on the scoreboard, settings() -> settings,
   * startRun(race) (main.js's: a new run, a race when given { replay, seed, course }), files (for
   * tests; else the page's own), win (where the drop and paste events arrive).
   */
  constructor(deps) {
    this.d = deps;
    this.game = deps.game;
    this.audio = deps.audio;
    this.files = deps.files || replayFiles();
    this.mode = null;            // null, 'watch' or 'list'
    this.rec = null;             // the live run's recorder
    this.recDone = true;
    this.endDue = false;         // the run is over; kept at the next animation frame
    this.lastReplay = null;      // the run just ended, in memory, for the instant replay
    this.saved = null;           // true kept, false could not be kept, null nothing to keep
    this.saveResult = null;
    this.bestId = null;          // the best run's id, for the board's race
    this.race = null;            // the ghost being raced this run
    this.ask = null;             // the race's question, up: { replay, compatible, state, mode } (raceId, askKey)
    this.prep = null;            // a race being prepared: its tower surveyed (confirmRace, runPrep)
    this.lastPrep = null;        // ...the last one's survey, for its cost (tests)
    this.w = null;               // the replay being watched
    this.list = { entries: [], sel: 0, scroll: 0, note: null, noteT: 0, confirm: null };
    this.busy = false;           // a file dialog is open
    this.ghostWarm = false;      // every cell of the ghost's atlas is painted
    this.silent = false;
    this.lastSaveMs = 0;
    this.platWarm = new Set();   // zones whose ledge art a seek has made sure of (warmScene)
    this.bestBefore = 0;         // the best score when the run being recorded began (hudStats)
    // The playback's sounds, through this: quiet while a seek simulates.
    const self = this;
    this.quietAudio = new Proxy(this.audio, {
      get(t, k) {
        const v = t[k];
        if (typeof v !== 'function') return v;
        return (...a) => (self.silent ? undefined : v.apply(t, a));
      },
    });
    const win = deps.win || (typeof window !== 'undefined' ? window : null);
    if (win && win.addEventListener) {
      // The window closing mid-run: keep what was played.
      win.addEventListener('pagehide', () => this.endRun());
      win.addEventListener('beforeunload', () => this.endRun());
      // A dropped file is read, never followed: without this a browser NAVIGATES to a file
      // dropped on the page, and the run and the page are gone.
      win.addEventListener('dragover', (e) => { if (e && e.preventDefault) e.preventDefault(); });
      win.addEventListener('drop', (e) => this.onDrop(e));
      win.addEventListener('paste', (e) => this.onPaste(e));
    }
  }

  get active() { return this.mode !== null; }
  get watching() { return this.mode === 'watch'; }
  get pad() { return !!(this.d.input && this.d.input.lastDevice === 'pad'); }
  /** The race's question is up -- on the scoreboard too, where no replay screen is (main.js's pad). */
  get asking() { return this.ask !== null; }

  // --- recording -------------------------------------------------------------------------

  /**
   * Straight after game.newRun(): record it, and race `race` ({ replay, course }) if given --
   * on the ghost's own tower when there is a course, on its seed alone (GHOST ONLY) when not.
   */
  beginRun(race = null) {
    this.race = race && race.replay ? new Race(race.replay, { ghostOnly: !race.course, course: race.course || null }) : null;
    this.ask = null;
    this.prep = null;
    this.lastReplay = null;
    this.saved = null;
    this.saveResult = null;
    this.bestId = null;
    this.endDue = false;
    // What the HUD's BEST line read while this run was climbing: the run commits its score to
    // the stats when the fire takes him, and its instant replay drew BEST <its own final
    // score> from its first frame -- a first run, which showed no BEST line at all, and a
    // record run, which showed BEST <the old one> and then RECORD as it passed it (hudStats).
    const all = this.d.stats ? this.d.stats() : null;
    this.bestBefore = all && all.bestScore > 0 ? all.bestScore : 0;
    try {
      this.rec = Replay.startRecording(this.game, { ghost: this.race ? race.replay : null });
      this.recDone = false;
    } catch (e) {
      this.rec = null;
      this.recDone = true;
    }
  }

  /** After every live step: the run is over when the recorder sealed or the title is up. */
  afterStep() {
    if (this.rec && !this.recDone && (this.rec.sealed || this.game.state === STATE.MENU)) this.endDue = true;
  }

  /** Finish the recording and keep it. Idempotent; never throws. */
  endRun() {
    const rec = this.rec;
    if (!rec || this.recDone) return;
    this.recDone = true;
    this.endDue = false;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    let replay = null;
    try { replay = rec.finish(); } catch (e) { replay = null; }
    if (!replay || replay.invalid) { this.lastReplay = null; this.saved = null; return; }
    this.lastReplay = replay;
    let r;
    try { r = Replay.saveRun(replay); } catch (e) { r = { ok: false, kept: false, error: String(e && e.message) }; }
    this.saveResult = r;
    this.saved = !!(r && r.ok && r.kept);
    this.refreshBest();
    if (typeof performance !== 'undefined') this.lastSaveMs = performance.now() - t0;
  }

  refreshBest() {
    try {
      const best = Replay.listReplays().find((e) => e.origin === 'own' && e.rank === 1);
      this.bestId = best ? best.id : null;
    } catch (e) {
      this.bestId = null;
    }
  }

  // --- keys --------------------------------------------------------------------------------

  /**
   * A key, from main.js's onKey before its own handling. True when it was this module's.
   * While a replay screen is up every key is, but mute and fullscreen.
   */
  onKey(code, state) {
    // The race's question is up (raceId): its keys, and nothing else gets through.
    if (this.ask) return this.askKey(code);
    if (this.mode === 'watch') return this.watchKey(code);
    if (this.mode === 'list') return this.listKey(code);
    if (state === STATE.MENU && code === 'KeyR') { this.openList(); return true; }
    if (state === STATE.DEAD && code === 'KeyR' && this.lastReplay) return this.openInstant();
    if (state === STATE.DEAD && code === 'KeyG' && this.bestId && !this.busy) return this.raceId(this.bestId);
    return false;
  }

  /** What a pad's own buttons mean on a replay screen (main.js maps the rest). */
  padCode(code) {
    // The race's question: A (Space) races at the run's options, X at the player's own, B
    // (Escape) goes back. A pad's A and B arrive as Space and Escape (gamepad.js PRESSES).
    if (this.ask) return code === 'PadX' ? 'KeyN' : code.startsWith('Pad') ? null : code;
    if (this.mode === 'watch') {
      return code === 'PadLB' ? 'ArrowLeft' : code === 'PadRB' ? 'ArrowRight' : code.startsWith('Pad') ? null : code;
    }
    if (this.mode === 'list') {
      if (this.list.confirm) return code === 'Space' || code === 'Enter' ? 'Enter' : code.startsWith('Pad') ? 'Escape' : code;
      return { PadX: 'KeyR', PadY: 'KeyP', PadLB: 'Delete', PadRB: 'KeyE' }[code] || (code.startsWith('Pad') ? null : code);
    }
    return code;
  }

  // --- watching ----------------------------------------------------------------------------

  /**
   * R on the scoreboard: the run just played, from its first step. It used to open ten seconds
   * before the catch and stop at the impact, offering the whole run after; the user: "make sure
   * when were replaying it starts at the beginning". The seeks still go anywhere in it, and a
   * seek near the end is a restore of the recorder's copies, not a re-run of the climb.
   */
  openInstant() {
    if (!this.lastReplay) return false;
    const b = this.d.board ? this.d.board() : null;
    return this.startWatch(this.lastReplay, {
      from: 'board',
      counts: { records: b && b.records ? b.records.length : 0, unlocked: b && b.unlocked ? b.unlocked.length : 0 },
    });
  }

  startWatch(replay, { from, counts = { records: 0, unlocked: 0 } }) {
    const s = this.d.settings ? this.d.settings() : null;
    const budget = s && PARTICLE_BUDGET[s.particles];
    const r = Replay.createPlayback(replay, { particleBudget: budget, onGame: (g) => this.wire(g) });
    if (!r.ok) { this.say('bad', 'CANNOT PLAY IT: ' + String(r.error || '')); return from === 'list'; }
    // The scoreboard's own frame, to be put back as it was (see the header).
    const R = this.d.renderer;
    const keep = R ? { t: R.t, streaks: R.streaks.map((x) => ({ ...x })) } : null;
    const A = this.audio;
    // The track to put back on the way out: the one this screen was playing. It was the
    // title's whenever the replay was watched from the list, but the list also opens over
    // the scoreboard (a file dropped on it), and back there the menu's theme played on the
    // board.
    const track = A.pendingTrack || A.track || (this.game.state === STATE.DEAD ? 'gameover' : 'menu');
    this.stopEffects();
    A.stopMusic();
    A.resetKeys();
    this.w = {
      pb: r.playback, replay, from, counts, keep, speed: ONE, paused: false, userPaused: false,
      acc: 0, phase: 'play', seek: null, track, scoreW: 0,
      // The best the HUD read while this run climbed, when it is known: the run just played.
      bestBefore: replay === this.lastReplay ? this.bestBefore : null,
      // A race's replay: the ghost it raced, drawn beside it again (render).
      race: replay.race && replay.race.ghost && replay.race.ghost.ghost.n
        ? new Race(replay.race.ghost, { ghostOnly: !replay.race.course, course: replay.race.course }) : null,
    };
    this.mode = 'watch';
    this.syncMusic();
    A.sfxMenu('select');
    return true;
  }

  /** Hang the run's sounds on a playback's Game, as main.js hangs them on the live one. */
  wire(g) {
    wireGameAudio(g, this.quietAudio, { scoreboard: () => (this.w ? this.w.counts : { records: 0, unlocked: 0 }) });
  }

  /** Stop every effect sounding. */
  stopEffects() {
    const A = this.audio;
    for (const n of Object.keys(A.live || {})) A.stopEffect(n, 0.08);
  }

  /** The music a replay's game calls for where it stands: the stage's climb, or the lament. */
  syncMusic() {
    const w = this.w, A = this.audio;
    if (!w) return;
    const g = w.pb.game;
    A.stopMusic();
    A.resetKeys();
    if (g.state === STATE.PLAYING) A.startClimb(g.run.maxFloor);
    else A.crossTo('gameover');
  }

  seekTo(seconds) {
    const w = this.w;
    const step = Math.max(0, Math.round(Math.max(0, seconds) / STEP));
    w.seek = { step };
    w.acc = 0;
    // A seek is silent: what was sounding stops, and nothing it simulates makes a sound.
    this.stopEffects();
    this.runSeek(REPLAY_SEEK_BUDGET);
  }

  runSeek(budget) {
    const w = this.w;
    if (!w || !w.seek) return true;
    const until = clock() + budget;
    if (!w.seek.landed) {
      this.silent = true;
      let done = false;
      try { done = w.pb.seekStep(w.seek.step, budget); } finally { this.silent = false; }
      if (!done) return false;
      w.seek.landed = true;
    }
    // A seek is not over until the HUD can be drawn where it landed without painting, and the
    // scene too (warmScene).
    if (!this.warmHud(w.pb.game, until)) return false;
    if (!this.warmScene(w.pb.game, until)) return false;
    w.seek = null;
    this.syncMusic();
    return true;
  }

  /**
   * The HUD's skins for the zone a replay has landed in and the next one (if its run gets
   * there: nextZone), painted before a frame draws them, a piece at a time on the seek's
   * budget; the landed zone's is made the skin drawn. True once both are ready.
   *
   * The skins are painted ahead for ONE game (render/hudskin.js): the zone on screen and the
   * next, every other zone's let go at each change of zone, and a skin a frame asks for
   * unpainted is painted whole inside that frame. A replay is a second game in another place.
   * Measured through main.js (a run that died 15 s into FOREST, so its instant replay began
   * in DUNGEON, whose skin the run had let go): the replay's first frames painted 40 pieces,
   * DUNGEON's skin and then FOREST's again as the clip crossed back into it, about 100 ms
   * headless (43-58 ms a zone); a seek of 5 s into another zone painted 20. The next zone's
   * is painted here too, not left to a piece a frame: that clip crossed into FOREST 0.07 s
   * after it began, and with only the landed zone warmed 14 of FOREST's 20 pieces were still
   * to paint when it did. The seek's frames draw no HUD at all (render), and while it plays
   * the zone after is painted a piece a frame (frame), as the HUD does for a live run -- from
   * the landing on, where the HUD waits WARM_AFTER frames in a zone.
   */
  warmHud(g, until) {
    const here = g.theme && g.theme.name;
    if (!here) return true;
    const s = warmHudSkin(here, 0);
    while (s.pending.length && clock() < until) warmHudSkin(here, 1);
    if (s.pending.length) return false;
    // Drawn from now on: this lets go of the others, so the next zone's is painted after it.
    hudSkinFor(g);
    const nx = this.nextZone(g);
    if (!nx) return true;
    const n = warmHudSkin(nx.name, 0);
    while (n.pending.length && clock() < until) warmHudSkin(nx.name, 1);
    return !n.pending.length;
  }

  /** One piece of the next zone's HUD skin while a replay plays (see warmHud). */
  warmHudAhead() {
    const nx = this.nextZone(this.w.pb.game);
    if (nx && warmHudSkin(nx.name, 0).pending.length) warmHudSkin(nx.name, 1);
  }

  /**
   * The zone after the one `g` is in, if the replay's run climbs into it; null if it ends in
   * this one. A run's zones only follow one another up the tower, so a replay in the zone its
   * run ended in never reaches the next -- and an instant replay always lands in that zone or
   * the one before it: painting the next one ahead there was a zone's skins, backdrop, walls,
   * ledges and title painted for nothing, 9 more frames of SEEKING in tools/test-replayui.mjs's
   * run. (A zone met again a lap later reads as the end: that zone's own warm-up still runs.)
   */
  nextZone(g) {
    const nx = g.nextTheme;
    if (!nx || !g.theme || nx.name === g.theme.name) return null;
    const res = this.w && this.w.replay && this.w.replay.result;
    if (res && THEMES[res.zone] && THEMES[res.zone].name === g.theme.name) return null;
    return nx;
  }

  /**
   * The rest of what a zone is drawn with -- its backdrop's layers and ledge furniture, its
   * walls, its ledges, its speed streaks and its title -- painted for the zone a seek landed
   * in and the next (nextZone), on the seek's budget, before the seek ends. True once all of
   * it is.
   *
   * The live game never meets a zone cold: each of these is painted ahead while the zone
   * before it is on screen, a piece a frame from a few seconds in (backdrop.js, walls.js,
   * streaks.js, zonetitles.js WARM_AFTER). A seek jumps. Measured headless through main.js, a
   * replay watched from the list in a fresh session and sought forward 5 s at a time: the
   * frame that landed in FOREST painted its backdrop whole (+80 ms over the median frame; the
   * backdrop paints every missing layer of the zone on screen at once), and the first frame
   * it PLAYED built FOREST's title whole (+64 ms, zonetitles' late-build count 0 -> 1), its
   * banner being up -- a hitch in motion that the live run, with the same zones, never had
   * (0 late builds). The pieces are painted one after another while the budget lasts -- a
   * backdrop layer, a wall strip, a ledge atlas, a streak atlas, each one painter call that
   * cannot be sliced from outside, the title a piece of its own warm-up at a time -- so a seek
   * frame can run one piece past the budget. Nothing moves while it does: the seek's frames
   * show the frame before it under the overlay's SEEKING (render).
   *
   * The landed zone's title only when its banner is up (the only time a title is drawn), the
   * next zone's always: a seek that lands a moment before a change of zone leaves the HUD's
   * own warm-up (170 frames in the zone first) no time to paint it.
   */
  warmScene(g, until) {
    const R = this.d.renderer;
    if (!R || !R.backdrop || !g.theme) return true;
    const zones = [[g.theme, g.banners.some((b) => b.zone === g.themeIndex)]];
    const nx = this.nextZone(g);
    if (nx) zones.push([nx, true]);
    for (const [th, titled] of zones) {
      const ti = THEMES.indexOf(th);
      // Each: true when there is nothing left to paint; otherwise paints one piece, false.
      const pieces = [
        () => {
          if (ti < 0) return true;
          const e = R.backdrop.entry(ti, th);
          if (LAYERS.every(([k]) => e[k]) && e.decor) return true;
          R.backdrop.warm(ti, th);   // one layer, or the zone's ledge furniture once they are all in
          return false;
        },
        () => { if (wallStats(th.name)) return true; wallStrip(th); return false; },
        () => { if (this.platWarm.has(th.name)) return true; platArt(th.name); this.platWarm.add(th.name); return false; },
        () => !warmStreaks(th),
        () => {
          if (!titled || !TITLE_PAINTERS[th.name]) return true;
          const s = titleStats(th.name);
          if (s && s.done) return true;
          // A slice of it on the seek's own budget (zonetitles.js warmTitleUntil). It went
          // through the title's own warm-up, which since the titles were sliced paints only in
          // a live run -- asked from a seek it painted nothing, and the fallback, zoneTitle(),
          // painted it whole and counted it as built late.
          return warmTitleUntil(th, clock() + BOARD_SLICE_MS);
        },
      ];
      // A piece with nothing left costs no budget, so a warm scene ends the seek in the frame
      // it lands; one that paints is followed by a look at the clock.
      for (const p of pieces) {
        while (!p()) if (clock() >= until) return false;
      }
    }
    return true;
  }

  setPaused(p) {
    const w = this.w;
    if (!w || w.paused === p) return;
    w.paused = p;
    w.userPaused = p;
    if (p) this.audio.suspend(); else this.audio.resumeCtx();
  }

  leaveWatch() {
    const w = this.w;
    if (!w) return;
    const A = this.audio;
    if (w.userPaused) A.resumeCtx();
    this.stopEffects();
    A.stopMusic();
    A.resetKeys();
    A.crossTo(w.track);
    const R = this.d.renderer;
    if (R && w.keep) { R.t = w.keep.t; R.streaks = w.keep.streaks; }
    this.w = null;
    this.mode = w.from === 'list' ? 'list' : null;
    if (this.mode === 'list') this.refreshList();
    A.sfxMenu('back');
  }

  watchKey(code) {
    const w = this.w;
    if (code === 'KeyM' || code === 'KeyF' || code === 'F11') return false;
    if (code === 'Escape') { this.leaveWatch(); return true; }
    const end = w.phase === 'end';
    if (code === 'Space' || code === 'Enter') {
      if (end) {
        // From the end, the whole run again.
        w.phase = 'play';
        w.paused = false;
        w.speed = ONE;
        this.seekTo(0);
      } else if (!w.seek) this.setPaused(!w.paused);
      return true;
    }
    if (code === 'ArrowLeft' || code === 'KeyA' || code === 'ArrowRight' || code === 'KeyD') {
      const dir = code === 'ArrowLeft' || code === 'KeyA' ? -1 : 1;
      const from = w.seek ? w.seek.step * STEP : w.pb.time;
      if (end) { w.phase = 'play'; w.paused = false; }
      this.seekTo(from + dir * REPLAY_SKIP);
      return true;
    }
    if (code === 'ArrowUp' || code === 'KeyW') { w.speed = Math.min(REPLAY_SPEEDS.length - 1, w.speed + 1); return true; }
    if (code === 'ArrowDown' || code === 'KeyS') { w.speed = Math.max(0, w.speed - 1); return true; }
    const digit = /^Digit([1-9])$/.exec(code);
    if (digit && +digit[1] <= REPLAY_SPEEDS.length) { w.speed = +digit[1] - 1; return true; }
    return true;
  }

  /** One simulation step of the loop (1/240 s) while a replay screen is up. */
  update(dt) {
    const w = this.w;
    if (this.mode !== 'watch' || !w || w.seek || w.paused) return;
    let n = 1;
    const sp = REPLAY_SPEEDS[w.speed];
    if (sp !== 1) {
      w.acc += dt * sp;
      n = 0;
      while (w.acc >= STEP - 1e-9) { w.acc -= STEP; n++; }
    }
    const pb = w.pb;
    for (let i = 0; i < n; i++) {
      if (!pb.step() || pb.done) { this.stop('end'); return; }
    }
  }

  stop(phase) {
    const w = this.w;
    w.phase = phase;
    w.paused = true;
    w.acc = 0;
  }

  /** Once per animation frame, before its steps: a seek in progress goes on, on a budget. */
  frame(dt = 1 / 60) {
    if (this.endDue) this.endRun();
    if (this.prep) this.runPrep(REPLAY_SEEK_BUDGET);
    if (this.mode === 'watch' && this.w && this.w.seek) this.runSeek(REPLAY_SEEK_BUDGET);
    else if (this.mode === 'watch' && this.w) this.warmHudAhead();
    if (this.list.note && (this.list.noteT -= dt) <= 0 && !this.busy) this.list.note = null;
    // The ghost's atlas, a cell a frame on the title screen once the menu's own warm-up is
    // done (so the two never share a frame): a race is always started from a screen off the
    // title, and its first frames then paint none of the ghost. The replays screen and the
    // scoreboard warm it too, for a race begun before the title had the time.
    if (!this.ghostWarm && !this.mode && this.game.state === STATE.MENU && menuStats().pending === 0) {
      this.ghostWarm = !warmGhost(1);
    }
  }

  // --- the REPLAYS screen ------------------------------------------------------------------

  openList() {
    this.mode = 'list';
    const L = this.list;
    // At the top. refreshList keeps the row selected by its id, and the old rows were still
    // here: after a run that set a new best the list opened on the second row, the one that
    // was at the top the last time it was open.
    L.entries = [];
    L.sel = 0; L.scroll = 0; L.note = null; L.confirm = null;
    this.refreshList();
    this.audio.sfxMenu('select');
  }

  refreshList(selectId = null) {
    const L = this.list;
    const was = selectId || (L.entries[L.sel] && L.entries[L.sel].id);
    let rows = [];
    try { rows = Replay.listReplays(); } catch (e) { rows = []; }
    L.entries = rows.map(listRow);
    const i = was ? L.entries.findIndex((e) => e.id === was) : -1;
    L.sel = i >= 0 ? i : Math.min(L.sel, Math.max(0, L.entries.length - 1));
    this.scrollTo();
  }

  scrollTo() {
    const L = this.list, n = LIST.rows;
    if (L.sel < L.scroll) L.scroll = L.sel;
    if (L.sel >= L.scroll + n) L.scroll = L.sel - n + 1;
    L.scroll = Math.max(0, Math.min(L.scroll, Math.max(0, L.entries.length - n)));
  }

  say(kind, text) {
    this.list.note = { kind, text: clip(String(text).toUpperCase()) };
    this.list.noteT = REPLAY_NOTE_LIFE;
  }

  listKey(code) {
    const L = this.list, A = this.audio;
    if (code === 'KeyM' || code === 'KeyF' || code === 'F11') return false;
    const e = L.entries[L.sel] || null;
    if (L.confirm) {
      const c = L.confirm;
      L.confirm = null;
      if (code === 'Delete' || code === 'Backspace' || code === 'Enter' || code === 'Space' || code === 'NumpadEnter') {
        const ok = c.kind === 'unpin' ? Replay.pinReplay(c.e.id, false) : Replay.deleteReplay(c.e.id);
        this.refreshList();
        this.say(ok ? 'text' : 'bad', ok ? 'DELETED' : 'COULD NOT DELETE IT');
        A.sfxMenu('erase');
      } else A.sfxMenu('back');
      return true;
    }
    if ((this.busy || this.prep) && code !== 'Escape') return true;
    const n = L.entries.length;
    // The cursor moves over the replays in silence. It blipped on every row, and the user asked
    // for it gone (2026-09-29: "remove the sound from the replay that plays when you hover over
    // it"); watching one, deleting, pinning and leaving still sound.
    if (code === 'ArrowUp' || code === 'KeyW') { if (n) { L.sel = (L.sel + n - 1) % n; this.scrollTo(); } }
    else if (code === 'ArrowDown' || code === 'KeyS') { if (n) { L.sel = (L.sel + 1) % n; this.scrollTo(); } }
    else if (code === 'Escape') { this.mode = null; L.confirm = null; A.sfxMenu('back'); }
    else if (code === 'Space' || code === 'Enter') { if (e) this.watchId(e); }
    else if (code === 'KeyR') { if (e) this.raceId(e.id); }
    else if (code === 'KeyP') { if (e) this.togglePin(e); }
    else if (code === 'Delete' || code === 'Backspace') { if (e) { L.confirm = { e, kind: 'delete' }; A.sfxMenu('select'); } }
    else if (code === 'KeyE') { if (e) this.exportEntry(e); }
    else if (code === 'KeyI' || code === 'KeyO') this.importFile();
    return true;
  }

  watchId(e) {
    if (!e.playable) { this.say('bad', 'MADE BY ANOTHER VERSION OF THE GAME: IT CAN ONLY BE RACED'); return; }
    const r = Replay.loadReplay(e.id);
    if (!r.ok) { this.say('bad', 'CANNOT LOAD IT: ' + r.error); this.refreshList(); return; }
    this.startWatch(r.replay, { from: 'list' });
  }

  raceId(id) {
    const r = Replay.loadReplay(id);
    if (!r.ok || !r.replay || !r.replay.ghost || !r.replay.ghost.n) {
      if (this.mode === 'list') this.say('bad', 'CANNOT RACE IT: ' + (r.error || 'it has no ghost'));
      return this.mode === 'list';
    }
    // First the question: the options the run was played at beside the player's own, and
    // whether to race it at the same ones ("make sure it lists all the options that replay
    // used and ask if you want to use the same options so it would match", 2026-09-29).
    // The answer comes back through askKey, and the race goes on from confirmRace.
    this.ask = { replay: r.replay, compatible: r.compatible, state: this.game.state, mode: this.mode };
    if (this.mode === 'list') this.list.confirm = null;
    this.audio.sfxMenu('select');
    return true;
  }

  /**
   * The race's question, answered: `match` true races at the run's own options (JUMP SPEED,
   * DIFFICULTY and GRAVITY as it was played), false at the player's. PLATFORMS are the run's
   * either way -- the race is on its tower, whose ledges are its own width (main.js startRun).
   */
  askKey(code) {
    if (code === 'KeyM' || code === 'KeyF' || code === 'F11') return false;
    if (code === 'KeyY' || code === 'Enter' || code === 'NumpadEnter' || code === 'Space') { this.confirmRace(true); return true; }
    if (code === 'KeyN') { this.confirmRace(false); return true; }
    if (code === 'Escape' || code === 'Backspace') { this.ask = null; this.audio.sfxMenu('back'); return true; }
    return true;
  }

  confirmRace(match) {
    const a = this.ask;
    this.ask = null;
    if (!a || this.game.state !== a.state || this.mode !== a.mode) return;
    // A replay this build plays is raced on the ghost run's own tower (race.js), which takes a
    // survey of the run: a slice a frame on the seek's budget (runPrep), and the race starts in
    // the frame after the last slice, which does none of it -- a 90 s run is ~40 ms of
    // simulation, a ten-minute bot run ~0.2 s, and in one frame either was a stall. One this
    // build cannot play is raced on its seed straight away, GHOST ONLY.
    if (!a.compatible) { this.startRace(a.replay, null, match); return; }
    this.prep = { replay: a.replay, survey: new CourseSurvey(a.replay), state: this.game.state, mode: this.mode, match };
    this.lastPrep = this.prep.survey;
    if (this.mode === 'list') { this.list.confirm = null; this.say('text', 'PREPARING THE RACE...'); }
  }

  /**
   * What the race's question shows: the run's result, and each option as the run had it
   * beside the player's own (raceOptions).
   */
  askInfo() {
    const a = this.ask, h = a.replay.header, res = a.replay.result || {};
    return {
      from: a.mode === 'list' ? 'list' : 'board', floor: res.floor, score: res.score, ghostOnly: !a.compatible,
      rows: raceOptions(h, this.d.settings ? this.d.settings() : {}),
    };
  }

  startRace(replay, course, match) {
    this.prep = null;
    this.mode = null;
    this.list.confirm = null;
    this.d.startRun({ replay, seed: replay.header.seed >>> 0, course, match });
  }

  /**
   * The race being prepared, in a frame: a slice of its survey, or -- the frame after the last
   * slice -- the race itself, on the ghost's tower (or on the seed, GHOST ONLY, if the survey
   * found the run does not play back as it was recorded). Dropped if the player has gone on
   * to something else: a new run, the title, a replay, the list left.
   */
  runPrep(budget) {
    const p = this.prep;
    if (this.game.state !== p.state || this.mode !== p.mode) { this.prep = null; return; }
    if (p.survey.done) { this.startRace(p.replay, p.survey.course, p.match); return; }
    p.survey.run(budget);
  }

  togglePin(e) {
    // Unpinning a replay that is neither the last run nor a best lets it go (the store's
    // rule), so that is asked like a delete.
    if (e.pinned && (e.origin === 'imported' || (!e.rank && !e.last))) {
      this.list.confirm = { e, kind: 'unpin' };
      this.audio.sfxMenu('select');
      return;
    }
    const ok = Replay.pinReplay(e.id, !e.pinned);
    this.refreshList(e.id);
    this.say(ok ? 'good' : 'bad', ok ? (e.pinned ? 'UNPINNED' : 'PINNED: IT IS KEPT UNTIL YOU UNPIN IT') : 'COULD NOT CHANGE THE PIN');
    this.audio.sfxMenu('move');
  }

  exportEntry(e) {
    const r = Replay.loadReplay(e.id);
    if (!r.ok) { this.say('bad', 'CANNOT EXPORT IT: ' + r.error); return; }
    let text;
    try { text = Replay.exportReplay(r.replay); } catch (err) { this.say('bad', 'CANNOT EXPORT IT: ' + err.message); return; }
    this.busy = true;
    this.say('text', 'EXPORTING...');
    return Promise.resolve(this.files.save(fileNameFor(e), text)).then((res) => {
      this.busy = false;
      if (res && res.ok) this.say('good', 'EXPORTED: ' + (res.name || fileNameFor(e)));
      else if (res && res.canceled) this.say('text', 'EXPORT CANCELLED');
      else this.say('bad', 'NOT EXPORTED: ' + ((res && res.error) || 'unknown error'));
    }, () => { this.busy = false; this.say('bad', 'NOT EXPORTED'); });
  }

  importFile() {
    // Only the desktop's dialog holds the screen: the shell always answers. A browser's file
    // picker may never answer at all -- one closed where the browser has no 'cancel' event,
    // or one that never opened because the press came from a pad, which is not the key press
    // or click a browser opens a picker for -- and holding for it locked this screen (every
    // key but ESC ignored) and the scoreboard's G for the rest of the session.
    const hold = this.files.kind === 'desktop';
    if (hold) this.busy = true;
    const done = () => { if (hold) this.busy = false; };
    return Promise.resolve(this.files.open()).then((res) => {
      done();
      if (res && res.ok) this.importText(res.text);
      else if (res && res.canceled) this.say('text', 'IMPORT CANCELLED');
      else this.say('bad', 'NOT IMPORTED: ' + ((res && res.error) || 'unknown error'));
    }, () => { done(); this.say('bad', 'NOT IMPORTED'); });
  }

  /** Untrusted text in: kept (pinned) if it is a replay, a refusal on screen if not. */
  importText(text) {
    let r;
    try {
      r = typeof text === 'string' ? Replay.importReplay(text) : { ok: false, error: 'this is not a replay' };
    } catch (e) {
      r = { ok: false, error: 'this is not a replay' };
    }
    if (!r || !r.ok) { this.say('bad', 'NOT IMPORTED: ' + ((r && r.error) || 'this is not a replay')); return false; }
    let s;
    try { s = Replay.storeImported(r.replay); } catch (e) { s = { ok: false, error: e.message }; }
    if (!s || !s.ok || !s.kept) { this.say('bad', 'NOT KEPT: ' + ((s && s.error) || 'the storage is full')); return false; }
    this.refreshList(s.id);
    const res = r.replay.result;
    this.say('good', `IMPORTED: FLOOR ${res.floor}, SCORE ${res.score}` + (r.compatible ? '' : ' - GHOST ONLY'));
    this.audio.sfxMenu('select');
    return true;
  }

  onPaste(e) {
    if (this.mode !== 'list' || this.list.confirm || this.busy) return;
    let text = '';
    try { text = e && e.clipboardData ? e.clipboardData.getData('text/plain') || e.clipboardData.getData('text') : ''; } catch (err) { text = ''; }
    if (e && e.preventDefault) e.preventDefault();
    if (!text) { this.say('bad', 'NOT IMPORTED: THE CLIPBOARD HOLDS NO TEXT'); return; }
    if (text.length > REPLAY_MAX_TEXT) { this.say('bad', 'NOT IMPORTED: ' + TOO_BIG); return; }
    this.importText(text);
  }

  onDrop(e) {
    if (e && e.preventDefault) e.preventDefault();
    // Not in a run, and not over a replay being watched: a drop there is ignored. "In a run"
    // is the recording still open too, not only the run's own states: the options, the stats
    // pages and the guide open over a run in progress (O mid-climb, S from the pause), and a
    // drop there opened the REPLAYS screen over the live run -- a replay watched from it
    // stopped the climb's music, and the run went on to the title's theme.
    const runOn = !!(this.rec && !this.recDone);
    if (inRun(this.game.state) || runOn || this.mode === 'watch' || this.busy) return;
    const dt = e && e.dataTransfer;
    const file = dt && dt.files && dt.files[0];
    if (this.mode !== 'list') this.openList();
    if (file) {
      this.busy = true;
      return readFileText(file).then((res) => {
        this.busy = false;
        if (res.ok) this.importText(res.text); else this.say('bad', 'NOT IMPORTED: ' + res.error);
      });
    }
    let text = '';
    try { text = dt ? dt.getData('text/plain') || dt.getData('text') : ''; } catch (err) { text = ''; }
    if (text) this.importText(text); else this.say('bad', 'NOT IMPORTED: NOTHING TO READ IN WHAT WAS DROPPED');
    return undefined;
  }

  // --- the race ------------------------------------------------------------------------------

  /** The race's clock at the frame being drawn: the recorded climb, interpolated as he is. */
  raceTime(alpha) {
    const g = this.game;
    let t = this.rec ? this.rec.time : 0;
    if (g.state === STATE.PLAYING) t += (alpha - 1) * STEP;
    else if (g.state === STATE.FALLING) t += g.deathT || 0;
    return Math.max(0, t);
  }

  /** The ghost, in the HUD's slot (under the HUD and the characters). */
  drawRaceGhost(ctx, alpha) {
    const g = this.game;
    if (!this.race || !inRun(g.state)) return;
    this.drawGhostIn(ctx, g, this.race, this.raceTime(g.state === STATE.PAUSED ? 1 : alpha), alpha);
  }

  /**
   * The race's clock in a race's replay being watched, as raceTime is the live race's: the
   * replay's recorded climb (its PLAYING steps), interpolated as he is, and on through the fall.
   */
  watchRaceTime(g, alpha) {
    let t = this.w.pb.k * STEP;
    if (g.state === STATE.PLAYING) t += (alpha - 1) * STEP;
    else if (g.state === STATE.FALLING) t += g.deathT || 0;
    return Math.max(0, t);
  }

  /** `race`'s ghost at race time t, in `g`'s world (a live race, or a race's replay). */
  drawGhostIn(ctx, g, race, t, alpha) {
    const R = this.d.renderer;
    if (!R) return;
    const gh = race.ghost(t);
    if (!gh) return;
    // In his fall the ghost goes out with the rest of the climb, on the ledges' own burn
    // (Renderer.burnAt: the time since the catch over BURN_T, interpolated as the burn is
    // drawn): the fire burns the tower away as it takes him and he falls alone, and nothing of
    // the climb may be drawn after FALL_CLEAR (constants.js). It was drawn the whole way
    // down, climbing on over a tower that was no longer there, or standing on its last floor
    // with the floor burnt away under it as he fell past.
    const burn = R.burnAt ? R.burnAt(g, alpha) : -1;
    const out = burn < 0 ? 1 : 1 - burn;
    if (out <= 0) return;
    const shakeOn = !R.settings || R.settings.shake;
    const sx = shakeOn ? Math.round(g.shakeX) : 0, sy = shakeOn ? Math.round(g.shakeY) : 0;
    const z = g.zoomView || g.zoom;
    R.setWorldTransform(ctx, g);
    ctx.translate(sx / z, -sy / z);
    drawGhost(ctx, gh.pose, gh.x, gh.y, gh.facing, gh.alpha * out, gh.pose === 'tuck' ? Math.floor(R.t * 14) : 0);
    ctx.setTransform(PX, 0, 0, PX, sx * PX, sy * PX);
    this.lastGhost = gh;
  }

  /**
   * The race's readout, over the HUD's top row, between FLOOR and SCORE. main.js draws it
   * with the HUD, and into the HUD's exit layer at the catch too, so it fades out with the
   * rest of the HUD rather than vanishing in the frame the fire takes him.
   */
  drawRaceHud(ctx) {
    const g = this.game;
    if (!this.race || !inRun(g.state)) return;
    drawRaceReadout(ctx, this.race.lead(g.player.y, this.raceTime(1)), this.race.ghostOnly);
  }

  // --- the scoreboard ---------------------------------------------------------------------

  /** The replay's words on the scoreboard, after drawGameOver. */
  drawBoard(ctx, records, unlocked) {
    if (this.mode) return;
    const game = this.game;
    const box = boardKeysBox(records, unlocked);
    drawBoardReplay(ctx, boardSkinFor(game), box, {
      replay: !!this.lastReplay, race: !!this.bestId, saved: this.saved, pad: this.pad,
    });
    if (this.bestId) warmGhost(1);
    if (this.ask) { ctx.setTransform(PX, 0, 0, PX, 0, 0); drawRaceAsk(ctx, this.askInfo(), this.pad); }
  }

  // --- drawing -----------------------------------------------------------------------------

  /** A frame while a replay screen is up, in place of main.js's own. */
  render(ctx, alpha, dt, uiT) {
    if (this.mode === 'list') {
      ctx.setTransform(PX, 0, 0, PX, 0, 0);
      const L = this.list;
      drawReplayList(ctx, {
        entries: L.entries, sel: L.sel, scroll: L.scroll, note: L.note, confirm: L.confirm && L.confirm.e,
        ask: this.ask ? this.askInfo() : null,
        pad: this.pad, web: !this.files || this.files.kind !== 'desktop',
      }, uiT);
      warmGhost(1);
      return;
    }
    const w = this.w;
    // While a seek is on, the frame before it stays up under the overlay, which says SEEKING.
    // The game the seek holds is wherever it has got to, in any zone, and drawing it painted
    // what that zone is drawn with in the frame: the backdrop paints every missing layer of
    // the zone on screen at once -- the frame that landed in a zone the session had not seen
    // took +80 ms headless -- and the HUD's skin would be painted whole. warmHud and warmScene
    // paint those a piece at a time before the seek ends. (It drew the scene without its HUD.)
    if (w.seek) {
      ctx.setTransform(PX, 0, 0, PX, 0, 0);
      drawReplayOverlay(ctx, this.overlayState());
      return;
    }
    const g = w.pb.game, R = this.d.renderer, A = this.audio;
    const held = w.paused;
    const sp = REPLAY_SPEEDS[w.speed];
    const a = held ? 1 : sp < 1 ? Math.min(1, w.acc / STEP) : alpha;
    const d = held ? 0 : dt * sp;
    // The beat follows the replay's run as it followed the run (main.js renderFrame).
    if (g.state === STATE.PLAYING) A.setIntensity(g.intensity, dt);
    else if (g.state !== STATE.FALLING) A.setIntensity(0, dt);
    const all = this.hudStats(g);
    // A race's replay races its ghost again, drawn and read out as the race drew it: the file
    // carries the ghost's track (and the tower it was raced on), so this needs nothing else.
    const race = w.race;
    const readout = (c) => { if (race) drawRaceReadout(c, race.lead(g.player.y, this.watchRaceTime(g, 1)), race.ghostOnly); };
    R.draw(g, a, d, () => {
      if (race && g.state !== STATE.DEAD) this.drawGhostIn(ctx, g, race, this.watchRaceTime(g, a), a);
      if (g.state === STATE.FALLING) drawFalling(ctx, g, uiT, (gg, view) => { drawHud(gg, view, all, uiT); readout(gg); });
      else if (g.state !== STATE.DEAD) { drawHud(ctx, g, all, uiT); readout(ctx); }
    });
    ctx.setTransform(PX, 0, 0, PX, 0, 0);
    // The fall's words once he has landed (SPLAT or OOF, the verdict, the floor); not SPACE
    // TO SKIP on the way down, which is not what SPACE does here.
    if (g.state === STATE.FALLING && g.impacted) drawFallWords(ctx, g, uiT);
    drawReplayOverlay(ctx, this.overlayState());
  }

  /**
   * The stats the replay's HUD reads -- only its BEST line reads them. The instant replay's
   * climb reads the best as it stood when the run began (beginRun), as the run's own HUD did;
   * its fall, like the run's, reads them after the run was committed at the catch. A replay
   * from the list reads them as they are now: nothing records what they were.
   */
  hudStats(g) {
    const all = this.d.stats ? this.d.stats() : null;
    const w = this.w;
    if (!all || !w || w.bestBefore === null || g.state !== STATE.PLAYING) return all;
    return Object.create(all, { bestScore: { value: w.bestBefore } });
  }

  overlayState() {
    const w = this.w, g = w.pb.game;
    const phase = w.seek ? 'seek' : w.phase === 'end' ? w.phase
      : g.state === STATE.FALLING || g.state === STATE.DEAD ? 'fall' : 'play';
    return {
      paused: w.paused,
      speed: REPLAY_SPEEDS[w.speed], time: w.seek ? w.seek.step * STEP : w.pb.time,
      length: w.pb.duration, phase, pad: this.pad, from: w.from,
      // The HUD's score is drawn while he climbs; the plate keeps clear of a long one. While a
      // seek is on the plate stays where it was drawn, over the frame that stays up (render).
      scoreW: w.seek ? w.scoreW : (w.scoreW = g.state === STATE.PLAYING ? textWidth(String(g.score), 2) : 0),
    };
  }
}
