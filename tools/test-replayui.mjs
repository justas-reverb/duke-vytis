// The replays as a player meets them (src/ui/replays.js, src/render/replayskin.js,
// src/ui/replayfiles.js, electron/replayfiles.js), through the REAL main.js booted over
// tools/fakepage.mjs -- keys as keydown events on the window, a pad as a fake
// navigator.getGamepads, frames driven by hand -- so what is tested is the wiring, not a
// copy of it. The engine underneath (src/game/replay.js) has its own suite, test-replay.
//
// What it holds the replays to, in the order a player meets them:
//
//   A. The attract demo behind the title is never recorded: minutes of it, a death and the
//      next tower, and the store is empty and the demo's input no recorder.
//   B. A real run -- the attract bot's decisions pressed as KEYS -- is recorded from its first
//      step and kept when the fire takes him: in the store as the last run and the best,
//      its floor, score and ending the run's own, kept in the frame after the catch (not in
//      the catch's step), and the recorder held copies of the live game (main.js's sound
//      hooks on it and all: render/gamesounds.js wraps game.step, which the copy must know).
//   C. The instant replay (R on the scoreboard) starts at the run's FIRST step (it opened ten
//      seconds before the catch until the user asked for the beginning, 2026-09-28); a seek to
//      ten seconds before the catch lands by restoring a copy, not by simulating the run, and
//      it reproduces the run FRAME FOR FRAME: the Duke's position at every step equal to the
//      live run's at the same step, through the impact; so is the ghost track at every
//      sample. It stops at the run's end, the board's. Back and forward 5 s land exactly 1200 steps
//      away and go on matching; 2x, 4x and 1/2x step 2, 4 and 1/2 a frame and still match;
//      a pause stops it. The run's sounds play at the steps they played in the run; a seek
//      plays none and stops what was sounding; leaving stops every effect and the music the
//      replay started and puts the board's music back.
//   D. Leaving shows the board EXACTLY as it was: the live game, the save file, the records
//      and awards, the store, the renderer's clock and streaks, and the frame's every pixel.
//      Watching commits nothing (the stats, the awards, the records, the store).
//   E. The scoreboard's prompt stands on the key panel drawGameOver draws (where screens.js
//      boardKeysBox says it is), clear of the row it flanks.
//   F. A race (G on the scoreboard, R on the replays screen) asks first: the options the run
//      was played at beside the player's, SAME or DIFFERS; ESC goes back, Y races at the run's
//      own, N at the player's (K), and a pad's X is N on the scoreboard too (I). It is a new
//      run on the replay's seed, recorded and kept like any run, with the ghost drawn where the ghost track puts
//      it at the race's clock -- within half a quantum of where the original run was at every
//      sample -- and its readout the floors between them. The ghost is placed exactly as
//      drawSprite places the Duke: every pose, both facings, every quarter turn. The race is
//      on the ghost run's own tower (its floors the ghost's), found by surveying the replay a
//      slice a frame on the seek's budget with the race starting in the frame after the last
//      slice; the race's own instant replay draws the ghost where the race drew it. (Racers
//      who climb differently, the shaft and the race's file: tools/test-racetower.mjs.)
//   G. The REPLAYS screen lists the last run, the best, a pinned one and imports, each row
//      its tag, floor, score and whether this build plays it -- GHOST ONLY for a replay from
//      another build, which still races, on its seed, the readout saying the ledges may
//      differ. Pin, unpin, delete behind a confirm, watch, race.
//   H. Export then import gives back the same bytes (the desktop bridge and the web's
//      download, picker, drop and paste); every hostile import -- garbage, a truncated file,
//      a wrong checksum, 5 MB of text, a file too big to read, a file that cannot be read, a
//      shell that throws -- shows its refusal on screen and nothing throws. A save refused
//      by the storage says NOT SAVED on the board and play goes on.
//   I. The keyboard alone and the pad alone each reach every action, the rows picked by presses.
//   J. The desktop bridge exposes exactly two functions and the shell's handlers refuse a
//      window that is not the game's, a name with a path in it, and a file too big. The web's
//      picker is not asked for without a key press in hand, and says so.
//   K. A file dropped over a run a menu hides is ignored; a first race behind the guide still
//      races; a file picker that never answers holds nothing; the scoreboard's music comes back
//      after a replay watched from the list over it. (And in C: no HUD skin painted in a
//      replay's frame, from a clip that begins in a zone the run let go of.)
//
//   node tools/test-replayui.mjs                    the checks (about 30 s)
//   node tools/test-replayui.mjs --shots=DIR        and the review PNGs, at 1x, into DIR
//   node tools/test-replayui.mjs --mutant=NAME      patches a copy of src/ and must FAIL
//   node tools/test-replayui.mjs --mutants          every mutant in turn, one process each
//
// Every check was seen to fail against a broken copy of the code (MUTANTS below, the check
// that catches each written beside it).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import Module from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makePad, press, release, key, installPage, bootMain } from './fakepage.mjs';
import { encodePNG, HeadlessCanvas } from './headless.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const argv = process.argv.slice(2);
const MUTANT = (argv.find((a) => a.startsWith('--mutant=')) || '').slice(9);
const SHOTS = (argv.find((a) => a.startsWith('--shots=')) || '').slice(8);

// ---- mutants: [file under src/ or electron/, from, to] ------------------------------------
const MUTANTS = {
  // caught by B (no recording: nothing kept)
  'no-recording': [['src/ui/replays.js', 'this.rec = Replay.startRecording(this.game, { ghost: this.race ? race.replay : null });', 'this.rec = null;']],
  // caught by B (recorded, never kept)
  'no-save': [['src/ui/replays.js', 'try { r = Replay.saveRun(replay); }', 'try { r = { ok: true, kept: true }; }']],
  // caught by B (kept in the catch's own step)
  'save-in-catch-step': [['src/ui/replays.js', 'this.rec.sealed || this.game.state === STATE.MENU)) this.endDue = true;',
    'this.rec.sealed || this.game.state === STATE.MENU)) this.endRun();']],
  // caught by B and C (gamesounds wraps game.step: the recorder keeps no copies of the live game)
  'snapshot-knows-hooks-only': [['src/game/snapshot.js', "        if (typeof own === 'function') { c[k] = own; continue; }\n",
    "        if (typeof own === 'function' && HOOK.test(k)) { c[k] = own; continue; }\n"]],
  // caught by C (two replay steps a frame at 1x)
  'double-step': [['src/ui/replays.js', '    let n = 1;\n', '    let n = 2;\n']],
  // caught by C (a seek lands short of its target)
  'seek-short': [['src/ui/replays.js', 'const step = Math.max(0, Math.round(Math.max(0, seconds) / STEP));',
    'const step = Math.max(0, Math.round(Math.max(0, seconds) / STEP) - 7);']],
  // caught by C (a seek is heard)
  'seek-heard': [['src/ui/replays.js', '      this.silent = true;\n      let done = false;', '      this.silent = false;\n      let done = false;']],
  // caught by C (leaving leaves the replay's effects sounding)
  'leave-keeps-sounds': [['src/ui/replays.js', '    if (w.userPaused) A.resumeCtx();\n    this.stopEffects();\n', '    if (w.userPaused) A.resumeCtx();\n']],
  // caught by D (the renderer's clock and streaks are not put back)
  'board-not-restored': [['src/ui/replays.js', '    if (R && w.keep) { R.t = w.keep.t; R.streaks = w.keep.streaks; }\n', '']],
  // caught by D (the live game goes on stepping under the replay)
  'live-steps-under': [['src/main.js', '    demoWasOn = false;\n    idleT = 0;\n    return;\n', '    demoWasOn = false;\n    idleT = 0;\n']],
  // caught by D (the playback commits the stats through the live game's hook)
  'watch-commits': [['src/ui/replays.js', '  wire(g) {\n', '  wire(g) {\n    g.onDeath = this.game.onDeath;\n']],
  // caught by E (the prompt placed for a board with no news panel on one that has it)
  'board-box-wrong': [['src/ui/screens.js', 'return { x: K.x, y: K.y - (news ? 0 : BOARD_CLOSE >> 1), w: K.w, h: K.h };',
    'return { x: K.x, y: K.y - (news ? BOARD_CLOSE >> 1 : 0), w: K.w, h: K.h };']],
  // caught by E (the replays' keys crowding the row of keys they flank, a unit off it)
  'board-keys-crowd': [['src/render/replayskin.js', 'export const BOARD_GAP = 14;', 'export const BOARD_GAP = 3;']],
  // caught by F (a race on a fresh seed)
  'race-wrong-seed': [['src/main.js', 'game.newRun(race ? race.seed : undefined, race ? race.course || null : null, jumpSpeed, platforms, difficulty, gravity);', 'game.newRun(undefined, race ? race.course || null : null, jumpSpeed, platforms, difficulty, gravity);']],
  // The race's tower (2026-09-28), each with the check that catches it:
  // caught by F (main.js starts the race on the seed alone: the survey's course never reaches the game)
  'race-without-course': [['src/main.js', 'game.newRun(race ? race.seed : undefined, race ? race.course || null : null, jumpSpeed, platforms, difficulty, gravity);', 'game.newRun(race ? race.seed : undefined, null, jumpSpeed, platforms, difficulty, gravity);']],
  // caught by F (the survey run in one frame: the whole re-simulation a stall on the board)
  'survey-in-one-frame': [['src/ui/replays.js', '    if (this.prep) this.runPrep(REPLAY_SEEK_BUDGET);\n', '    if (this.prep) this.runPrep(Infinity);\n']],
  // caught by F (the race started in the frame of the survey's last slice)
  'race-in-survey-frame': [['src/ui/replays.js', '    if (p.survey.done) { this.startRace(p.replay, p.survey.course, p.match); return; }\n    p.survey.run(budget);\n',
    '    if (p.survey.done) { this.startRace(p.replay, p.survey.course, p.match); return; }\n    if (p.survey.run(budget)) this.startRace(p.replay, p.survey.course, p.match);\n']],
  // caught by F (a playable replay raced GHOST ONLY, the survey skipped)
  'race-never-surveyed': [['src/ui/replays.js', '    if (!a.compatible) { this.startRace(a.replay, null, match); return; }', '    { this.startRace(a.replay, null, match); return; }']],
  // The race's question (2026-09-29), each with the check that catches it:
  // caught by F (G races at once, never asking)
  'race-no-question': [['src/ui/replays.js', '    this.ask = { replay: r.replay, compatible: r.compatible, state: this.game.state, mode: this.mode };\n',
    '    this.ask = { replay: r.replay, compatible: r.compatible, state: this.game.state, mode: this.mode };\n    this.confirmRace(true);\n']],
  // caught by F (the question lists none of the options)
  'ask-lists-nothing': [['src/render/replayskin.js', '  info.rows.forEach((r, i) => {', '  [].forEach((r, i) => {']],
  // caught by F (ESC on the question races all the same)
  'ask-escape-races': [['src/ui/replays.js', "    if (code === 'Escape' || code === 'Backspace') { this.ask = null; this.audio.sfxMenu('back'); return true; }",
    "    if (code === 'Escape' || code === 'Backspace') { this.confirmRace(true); return true; }"]],
  // caught by F (SAME OPTIONS races at the player's JUMP SPEED)
  'same-ignored': [['src/main.js', 'const theirs = !!h && race.match === true, mine', 'const theirs = false, mine']],
  // caught by K (MY OPTIONS races at the run's DIFFICULTY and GRAVITY)
  'mine-ignored': [['src/main.js', 'mine = !h || race.match === false;', 'mine = !h;']],
  // caught by K (MY OPTIONS races at the run's GRAVITY)
  'mine-gravity-ignored': [['src/main.js', 'const gravity = mine ? settings.gravity : h.gravity || 1;', 'const gravity = h ? h.gravity || 1 : settings.gravity;']],
  // caught by F (SAME OPTIONS races at the player's GRAVITY)
  'same-gravity-ignored': [['src/main.js', 'const gravity = mine ? settings.gravity : h.gravity || 1;', 'const gravity = h && race.match !== true ? h.gravity || 1 : settings.gravity;']],
  // caught by F (the question does not ask about GRAVITY)
  'ask-no-gravity': [['src/ui/replays.js', ", ['difficulty', 0], ['gravity', 1]];", ", ['difficulty', 0]];"]],
  // caught by I (a pad's X on the scoreboard's question opens the help: the race never starts)
  'ask-pad-x-lost': [['src/main.js', 'else if (replays.active || replays.asking) {', 'else if (replays.active) {']],
  // caught by F (a race's replay watched without its ghost)
  'watch-without-ghost': [['src/ui/replays.js', '      race: replay.race && replay.race.ghost && replay.race.ghost.ghost.n\n', '      race: false\n']],
  // caught by G (a GHOST ONLY race's readout does not say its ledges may differ)
  'ledges-note-hidden': [['src/render/replayskin.js', "  if (ghostOnly) mText(ctx, 'label', LEDGES_NOTE,", "  if (false) mText(ctx, 'label', LEDGES_NOTE,"]],
  // caught by F (every race's readout says the ledges may differ)
  'ledges-note-always': [['src/ui/replays.js', 'drawRaceReadout(ctx, this.race.lead(g.player.y, this.raceTime(1)), this.race.ghostOnly);', 'drawRaceReadout(ctx, this.race.lead(g.player.y, this.raceTime(1)), true);']],
  // caught by F (the ghost a step ahead of its track)
  'ghost-early': [['src/ui/replays.js', '    let t = this.rec ? this.rec.time : 0;\n    if (g.state === STATE.PLAYING) t += (alpha - 1) * STEP;',
    '    let t = this.rec ? this.rec.time : 0;\n    if (g.state === STATE.PLAYING) t += alpha * STEP;']],
  // caught by F (a race's replay draws its ghost a step ahead of where the race drew it)
  'watch-ghost-early': [['src/ui/replays.js', '    let t = this.w.pb.k * STEP;\n    if (g.state === STATE.PLAYING) t += (alpha - 1) * STEP;',
    '    let t = this.w.pb.k * STEP;\n    if (g.state === STATE.PLAYING) t += alpha * STEP;']],
  // caught by F (the ghost drawn an art pixel off the Duke's placement). It patched the ghost's
  // own copy of the placement until the merge of 2026-09-28 made the ghost call placeCell, and
  // then no longer applied -- the placement check had no mutant; this one moves the call.
  'ghost-misplaced': [['src/render/replayskin.js', 'placeCell(ctx, img, i * SPR_W, frame, cx, by0, spin, 0, flip);',
    'placeCell(ctx, img, i * SPR_W, frame, cx, by0 + 1 / PX, spin, 0, flip);']],
  // caught by F (the ghost's tuck not turned by the quarter turn the Duke's is)
  'ghost-unspun': [['src/render/replayskin.js', 'placeCell(ctx, img, i * SPR_W, frame, cx, by0, spin, 0, flip);',
    'placeCell(ctx, img, i * SPR_W, frame, cx, by0, 0, 0, flip);']],
  // caught by G (the screen says the opposite of the store)
  'playable-inverted': [['src/render/replayskin.js', "e.playable ? 'PLAYABLE' : 'GHOST ONLY'", "e.playable ? 'GHOST ONLY' : 'PLAYABLE'"]],
  // caught by G (a delete with no confirm)
  'delete-no-confirm': [['src/ui/replays.js', "if (e) { L.confirm = { e, kind: 'delete' }; A.sfxMenu('select'); }", 'if (e) { Replay.deleteReplay(e.id); this.refreshList(); }']],
  // caught by H (the exported file loses its last character)
  'export-truncated': [['src/ui/replays.js', 'this.files.save(fileNameFor(e), text)', 'this.files.save(fileNameFor(e), text.slice(0, -1))']],
  // caught by H (a refusal that is not shown)
  'refusal-hidden': [['src/ui/replays.js', "if (!r || !r.ok) { this.say('bad', 'NOT IMPORTED: ' + ((r && r.error) || 'this is not a replay')); return false; }",
    'if (!r || !r.ok) return false;']],
  // caught by H (a file too big to be a replay is read anyway)
  'reads-huge-file': [['src/ui/replayfiles.js', "if (typeof file.size === 'number' && file.size > REPLAY_MAX_TEXT) return { ok: false, error: TOO_BIG };", '']],
  // caught by H (a dropped file is followed by the browser)
  'drop-navigates': [['src/ui/replays.js', "    if (e && e.preventDefault) e.preventDefault();\n    // Not in a run", '    // Not in a run']],
  // caught by I (the pad cannot reach the REPLAYS screen or the instant replay)
  'pad-no-rb': [['src/main.js', "    else if (code === 'PadRB') code = 'KeyR';\n", '']],
  // caught by I (the list's rows cannot be picked from the keys or the D-pad)
  'list-no-down': [['src/ui/replays.js', "else if (code === 'ArrowDown' || code === 'KeyS') { if (n) {", "else if (code === 'NoSuchKey') { if (n) {"]],
  // caught by I (R on the title does nothing)
  'menu-no-r': [['src/ui/replays.js', "if (state === STATE.MENU && code === 'KeyR') { this.openList(); return true; }", '']],
  // caught by G (the cursor blips again on every replay it moves over)
  'list-cursor-blips': [['src/ui/replays.js', "    else if (code === 'ArrowDown' || code === 'KeyS') { if (n) { L.sel = (L.sel + 1) % n; this.scrollTo(); } }",
    "    else if (code === 'ArrowDown' || code === 'KeyS') { if (n) { L.sel = (L.sel + 1) % n; this.scrollTo(); A.sfxMenu('move'); } }"]],
  // caught by A (the demo's towers recorded and kept)
  'demo-recorded': [['src/main.js', '  startDemo(demoGame);\n  demoBot.reset();',
    '  startDemo(demoGame);\n  replays.game = demoGame; replays.beginRun(); replays.game = game;\n  demoBot.reset();']],
  // caught by the check that the replays' screens paint nothing late (a keycap left off the warm-up)
  'warm-list-short': [['src/render/replayskin.js', "'R', 'P', 'DEL', 'E', 'I'];", "'R', 'P', 'E', 'I'];"]],
  // caught by the overlay's check against a long score (the plate over its first digits)
  'overlay-ignores-score': [['src/render/replayskin.js', 'const O = { ...OVERLAY, ...overlayAt(st.scoreW || 0) };', 'const O = { ...OVERLAY };']],
  // caught by J (a third function through the bridge)
  'bridge-leaks': [['electron/preload.cjs', "  open: () => ipcRenderer.invoke('replay:open'),\n", "  open: () => ipcRenderer.invoke('replay:open'),\n  read: (p) => ipcRenderer.invoke('replay:read', p),\n"]],
  // caught by J (the shell answers any window)
  'shell-any-window': [['electron/replayfiles.js', 'return !!(w && !w.isDestroyed() && e && e.sender === w.webContents);', 'return true;']],
  // The verifier's (2026-09-28), each with the check that catches it:
  // caught by C (a seek lands and the first frame paints the HUD's skin for that zone whole)
  'hud-unwarmed': [['src/ui/replays.js', '    if (!this.warmHud(w.pb.game, until)) return false;\n', '']],
  // caught by C (the HUD drawn in a frame while the seek is on, in whatever zone it has reached)
  // and by G's seek into zones the session has not drawn (their scene painted in a seek's frame).
  // It removed the HUD from the seek's frames until the second verifier stopped drawing the
  // scene in them at all; now it draws both again.
  'hud-in-seek': [['src/ui/replays.js', '    if (w.seek) {\n      ctx.setTransform(PX, 0, 0, PX, 0, 0);\n      drawReplayOverlay(ctx, this.overlayState());\n      return;\n    }\n', '']],
  // caught by C (the next zone's skin left to the HUD's own warm-up, which waits WARM_AFTER frames)
  'hud-no-ahead': [['src/ui/replays.js', "    else if (this.mode === 'watch' && this.w) this.warmHudAhead();\n", '']],
  // caught by C (a seek ends with the next zone's skin unpainted: a crossing just after it paints it)
  'hud-next-late': [['src/ui/replays.js', '    return !n.pending.length;\n  }', '    return true;\n  }']],
  // caught by K (a file dropped on the options screen over a run opens the REPLAYS screen)
  'drop-over-run': [['src/ui/replays.js', 'if (inRun(this.game.state) || runOn || this.mode', 'if (inRun(this.game.state) || this.mode']],
  // caught by K (the guide before a first race starts a plain run after it)
  'race-lost-in-guide': [['src/main.js', 'const race = tutRace; tutRace = null; startRun(race);', 'tutRace = null; startRun();']],
  // caught by K (a browser's picker that never answers locks the replays screen)
  'web-picker-holds': [['src/ui/replays.js', "const hold = this.files.kind === 'desktop';", 'const hold = true;']],
  // caught by K (leaving a replay watched from the list over the scoreboard plays the title's theme there)
  'leave-menu-music': [['src/ui/replays.js', '    A.crossTo(w.track);\n', "    A.crossTo(w.from === 'board' ? 'gameover' : 'menu');\n"]],
  // caught by F (the ghost drawn on through the racer's fall, after the tower has burnt away)
  'ghost-in-fall': [['src/ui/replays.js', '    const out = burn < 0 ? 1 : 1 - burn;\n    if (out <= 0) return;\n', '    const out = 1;\n']],
  // caught by J (a picker asked for from a pad, which no browser opens, is asked for anyway)
  'picker-without-press': [['src/ui/replayfiles.js', '      if (ua && ua.isActive === false) return Promise.resolve({ ok: false, error: NO_PICKER });\n', '']],
  // The second verifier's (2026-09-28):
  // caught by G (a seek into a zone the session has not drawn ends with its scene unpainted:
  // the first frames it plays paint the backdrop, walls, ledges, streaks and title)
  'scene-unwarmed': [['src/ui/replays.js', '    if (!this.warmScene(w.pb.game, until)) return false;\n', '']],
  // caught by G (the same, the ledges alone painted -- which C's check reads -- and the rest not)
  'scene-half-warmed': [['src/ui/replays.js', '      for (const p of pieces) {\n', '      for (const p of pieces.slice(2, 3)) {\n']],
  // caught by C (a seek paints the zone after the one the run ended in, which it never reaches)
  'next-zone-always': [['src/ui/replays.js', '    if (res && THEMES[res.zone] && THEMES[res.zone].name === g.theme.name) return null;\n', '']],
  // caught by G (the list opens on the row that was at the top last time, not at the top)
  'list-opens-on-old-row': [['src/ui/replays.js', '    L.entries = [];\n    L.sel = 0; L.scroll = 0;', '    L.sel = 0; L.scroll = 0;']],
  // caught by G (a pad in a browser is told BACK imports, which a browser cannot do from a pad)
  'pad-web-footer': [['src/render/replayskin.js', "st.pad && !st.web ? 'BACK IMPORTS", "st.pad ? 'BACK IMPORTS"]],
  // caught by G (the list cuts a run's time to the second where the scoreboard rounds it)
  'list-time-cut': [['src/ui/replays.js', 'time: mmss(Math.round(e.seconds))', 'time: mmss(e.seconds)']],
  // caught by C (the instant replay's HUD reads the best the run itself set)
  'replay-best-now': [['src/ui/replays.js', "    if (!all || !w || w.bestBefore === null || g.state !== STATE.PLAYING) return all;\n", '    return all;\n']],
};

if (argv.includes('--mutants')) {
  const self = fileURLToPath(import.meta.url);
  const missed = [];
  for (const name of Object.keys(MUTANTS)) {
    const r = spawnSync(process.execPath, [self, `--mutant=${name}`], { encoding: 'utf8' });
    const last = (r.stdout || '').trim().split('\n').slice(-2).join(' | ');
    const caught = r.status === 1;
    console.log(`  ${caught ? 'caught ' : 'MISSED '} ${name.padEnd(28)} ${r.status === 3 ? 'DID NOT APPLY' : last.slice(0, 150)}`);
    if (!caught) missed.push(name);
  }
  console.log(missed.length ? `\n  ${missed.length} mutant(s) not caught: ${missed.join(', ')}` : `\n  all ${Object.keys(MUTANTS).length} mutants caught`);
  process.exit(missed.length ? 1 : 0);
}

let ROOT = REPO;
let tmp = null;
if (MUTANT) {
  const m = MUTANTS[MUTANT];
  if (!m) { console.log(`unknown mutant '${MUTANT}'; one of: ${Object.keys(MUTANTS).join(', ')}`); process.exit(2); }
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dvrui-'));
  for (const d of ['src', 'electron']) fs.cpSync(path.join(REPO, d), path.join(tmp, d), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'package.json'), fs.readFileSync(path.join(REPO, 'package.json')));
  for (const [file, from, to] of m) {
    const p = path.join(tmp, file);
    const t = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
    const n = t.split(from).length - 1;
    if (n !== 1) { console.log(`  MUTANT ${MUTANT} DID NOT APPLY (${n} matches in ${file}): ${from.slice(0, 70)}`); process.exit(3); }
    fs.writeFileSync(p, t.replace(from, to));
  }
  ROOT = tmp;
  console.log(`  MUTANT ${MUTANT}: this run must FAIL`);
}
const cleanup = () => { if (tmp) try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* left */ } };

let bad = 0;
const T0 = performance.now();
function fail(m) {
  console.log('  FAIL ' + m);
  bad++;
  if (MUTANT) { console.log(`  (mutant ${MUTANT} caught)`); cleanup(); process.exit(1); }
}
const ok = (c, m) => { if (!c) fail(m); return !!c; };
const note = (m) => console.log('  ok   ' + m);
process.on('unhandledRejection', (e) => fail('an unhandled rejection: ' + (e && e.message)));
process.on('uncaughtException', (e) => { fail('an uncaught exception: ' + (e && e.stack)); cleanup(); process.exit(1); });

// ---- the page ------------------------------------------------------------------------------
const page = installPage({ seed: 11 });
// At JUMP SPEED 120%, said rather than taken from the default: C's run is staged at it -- its one
// change of zone (into DUNGEON at floor 100) comes after the play-through at 1, 2, 4, 1 and 1/2x,
// so the replay plays on into it. At 140%, the default since 2026-09-28, the bot passes floor 100
// before that and ends at 291, short of FOREST: nothing left to play into. speedV 2 so the move of
// a saved 120% to the new default (settings.js SPEED_V) leaves it.
localStorage.setItem('dukevytis.settings.v2', JSON.stringify({ guideSeen: true, particles: 'high', companions: 'hop', music: true, jumpSpeed: 1.2, speedV: 2 }));
const u = (p) => pathToFileURL(path.join(ROOT, p)).href;
const V = await bootMain(u('src/main.js'));
const Replay = await import(u('src/game/replay.js'));
const Codec = await import(u('src/game/replaycodec.js'));
const { STATE } = await import(u('src/game/game.js'));
const C = await import(u('src/game/constants.js'));
const { AutoInput, AutoPlayer } = await import(u('src/game/autoplay.js'));
const Skin = await import(u('src/render/replayskin.js'));
const Sprites = await import(u('src/render/sprites.js'));
const Menu = await import(u('src/render/menuskin.js'));
const Board = await import(u('src/render/gameoverskin.js'));
const Screens = await import(u('src/ui/screens.js'));
const Files = await import(u('src/ui/replayfiles.js'));
const HudSkin = await import(u('src/render/hudskin.js'));
const Walls = await import(u('src/render/walls.js'));
const Titles = await import(u('src/render/zonetitles.js'));
const Streaks = await import(u('src/render/streaks.js'));
const Plat = await import(u('src/render/platsprites.js'));
const Decor = await import(u('src/render/decor.js'));
const ReplaysMod = await import(u('src/ui/replays.js'));
const RaceMod = await import(u('src/game/race.js'));
const { THEMES, themeIndexFor } = await import(u('src/game/themes.js'));
const Font = await import(u('src/render/font.js'));
const { BTN } = await import(u('src/core/gamepad.js'));
const STEP = V.STEP;
const R = V.replays;
const win = page.win;
const A = V.audio;

// ---- the ears: every sound the runs and the replays ask for, tagged with the step -----------
const EFFECTS = Object.getOwnPropertyNames(Object.getPrototypeOf(A))
  .filter((n) => (/^sfx./.test(n) && !['sfxMenu', 'sfxPause', 'sfxResume'].includes(n)) || n === 'lament' || n === 'stopScream');
const heard = [];          // [method, tag]
const music = [];          // [method, arg]
const stopped = [];        // effect names stopped
let tag = () => 'ui';
for (const n of EFFECTS) {
  const f = A[n];
  // No audio context here, so nothing sounds: an effect is marked sounding in `live` the way
  // Audio.sfx marks one, which is what the replay's "stop what is sounding" reads.
  A[n] = function (...a) { heard.push([n, tag()]); if (/^sfx/.test(n) && A.live) A.live[n] = [{ end: Infinity }]; return f.apply(this, a); };
}
for (const n of ['stopMusic', 'startClimb', 'crossTo', 'suspend', 'resumeCtx']) {
  const f = A[n];
  A[n] = function (...a) { music.push([n, a[0]]); return f.apply(this, a); };
}
{
  const f = A.stopEffect;
  A.stopEffect = function (name, ...a) { stopped.push(name); if (A.live) delete A.live[name]; return f.call(this, name, ...a); };
}

// ---- driving it: frames, keys, the pad, and the attract bot's decisions as input -------------
let frames = 0;
function steps(n, each = null) {
  for (let i = 0; i < n; i++) {
    if (frames++ % 4 === 0) V.loop.onFrame(4 * STEP);
    if (each) each();
    V.update(STEP);
  }
}
const frameOnce = () => steps(4);
/** Frames with no steps in them: a seek goes on, and nothing plays after it. Returns them. */
function seekFrames() { let k = 0; for (; R.w && R.w.seek && k < 500; k++) V.loop.onFrame(0); return k; }
/** Frames with no steps in them while a race is prepared (its tower surveyed). Returns them. */
function raceFrames() { let k = 0; for (; R.prep && k < 1000; k++) V.loop.onFrame(0); return k; }
const held = new Set();
function hold(code, on) {
  if (on && !held.has(code)) { key(win, 'keydown', code); held.add(code); }
  if (!on && held.has(code)) { key(win, 'keyup', code); held.delete(code); }
}
const letGo = () => { for (const c of [...held]) hold(c, false); };
/** A key pressed and let go, with no step after it (a run's first step is then its own). */
function press1(code) { key(win, 'keydown', code); key(win, 'keyup', code); }
/** ...and a frame after it. */
function tap(code) { press1(code); frameOnce(); }

const pad = makePad(0);
function padTap(btn) { page.pads = [pad]; press(pad, btn); frameOnce(); release(pad, btn); frameOnce(); }

/** The attract bot's decisions, pressed as keys (or pad buttons) on the real input. */
function botDriver(usePad = false) {
  const shadow = new AutoInput();
  const bot = new AutoPlayer(shadow);
  return () => {
    const g = V.game;
    if (g.state !== STATE.PLAYING) return;
    bot.step(g, STEP);
    if (usePad) {
      page.pads = [pad];
      (shadow.wantAxis < 0 ? press : release)(pad, BTN.LEFT);
      (shadow.wantAxis > 0 ? press : release)(pad, BTN.RIGHT);
      if (shadow.wantJump) { release(pad, BTN.A); V.loop.onFrame(0); press(pad, BTN.A); shadow.wantJump = false; }
      else if (!shadow.jumpHeld) release(pad, BTN.A);
      V.loop.onFrame(0);
      return;
    }
    hold('ArrowLeft', shadow.wantAxis < 0);
    hold('ArrowRight', shadow.wantAxis > 0);
    if (shadow.wantJump) { hold('Space', false); hold('Space', true); shadow.wantJump = false; }
    else if (!shadow.jumpHeld) hold('Space', false);
  };
}

/**
 * A run from its first step to the scoreboard: the bot for `botFor` seconds, then nothing
 * (the fire comes). Logs the Duke at every step, PLAYING and FALLING, and tags the run's
 * sounds with the step they were made in; keeps every floor its tower generated.
 */
/** Every floor `g`'s tower has generated since the last look, by floor number. */
function takeFloors(g, floors) {
  for (let n = floors.length; n <= g.tower.highest; n++) {
    const p = g.tower.floors.get(n);
    floors.push(p ? { x: p.x, w: p.w, kind: p.kind } : null);
  }
}
function playRun({ botFor = 25, usePad = false, max = 240 * 240 } = {}) {
  const drive = botDriver(usePad);
  const log = [];
  const floors = [null];
  takeFloors(V.game, floors);
  let s = 0, catchStep = -1, savedAt = -1;
  tag = () => s;
  const each = () => {
    if (V.game.state === STATE.PLAYING && s < botFor * 240) drive();
    else if (V.game.state === STATE.PLAYING) { letGo(); if (usePad) { for (const b of [BTN.LEFT, BTN.RIGHT, BTN.A]) release(pad, b); } }
  };
  while ((V.game.state === STATE.PLAYING || V.game.state === STATE.FALLING) && s < max) {
    const was = V.game.state;
    steps(1, each);
    const p = V.game.player;
    log.push([p.x, p.y, V.game.run.maxFloor]);
    if (was === STATE.PLAYING) takeFloors(V.game, floors);
    if (was === STATE.PLAYING && V.game.state === STATE.FALLING) catchStep = s;
    if (savedAt < 0 && R.recDone && R.lastReplay) savedAt = s;
    s++;
  }
  letGo();
  tag = () => 'ui';
  return { log, catchStep, savedAt, steps: s, floors };
}

// ---- pixels ---------------------------------------------------------------------------------
const canvas = V.renderer.canvas;
let seeded = 1;
function seedRandom() {
  let s = 0x2545f491;
  Math.random = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  seeded++;
}
/** A frame as main.js draws it, with the UI clock held (forcedDt 0). */
function render(alpha = 1) { V.renderFrame(alpha, 0); }
const hash = () => crypto.createHash('sha1').update(canvas.data).digest('hex');
function shot(name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.writeFileSync(path.join(SHOTS, name + '.png'), encodePNG(canvas));
  console.log('       shot ' + path.join(SHOTS, name + '.png'));
}
const storeText = () => JSON.stringify([...page.storage.entries()].filter(([k]) => k.startsWith('dukevytis.replay')).sort());
const statsText = () => String(localStorage.getItem('dukevytis.stats.v1')) + JSON.stringify(V.stats());

// =============================================================================================
// A. The attract demo is never recorded.
// =============================================================================================
{
  steps(240 * 8);
  // Its death and the next tower (restartDemo) too: the bot is made to lose now.
  if (V.demoGame.state === STATE.PLAYING) V.demoGame.die();
  steps(240 * 12);
  ok(V.game.state === STATE.MENU, 'A. the title screen is not up');
  ok(storeText() === '[]', `A. the attract demo left replays in the store: ${storeText().slice(0, 80)}`);
  ok(!(V.demoGame.input instanceof Replay.Recorder), 'A. the attract demo is being recorded');
  note(`A. ${20} s of the attract demo, a death and the next tower: nothing recorded, nothing kept`);
}

// =============================================================================================
// B. A real run, recorded and kept.
// =============================================================================================
// On a seed of its own: the run's seed is the page's next Math.random, which everything drawn
// before it moves (the attract demo, the menus), so it is set here -- a tower the bot climbs
// for its 25 s at the default settings. Left to what came before, a change to the defaults
// (PLATFORMS and GRAVITY, 2026-09-29) put it on a seed the bot fell off at floor 25.
seedRandom();
// A's twenty seconds on the title put up its idle view (main.js, ATTRACT_IDLE): the first key
// only brings the menu back, and a SPACE then starts the run.
press1('ArrowDown');
press1('Space');
ok(V.game.state === STATE.PLAYING, 'B. SPACE on the title did not start a run');
ok(V.game.input instanceof Replay.Recorder, 'B. the run is not being recorded');
const run1 = playRun({ botFor: 25 });
const game = V.game;
{
  ok(game.state === STATE.DEAD, `B. the run did not reach the scoreboard (${game.state})`);
  const list = Replay.listReplays();
  const last = list.find((e) => e.last);
  ok(!!last && list.length === 1, `B. the run was not kept (${list.length} replays)`);
  if (last) {
    ok(last.floor === game.run.maxFloor && last.score === game.run.score && last.ended === 'fire' && last.rank === 1 && last.playable,
      `B. the kept run is not this one: ${JSON.stringify(last)} against floor ${game.run.maxFloor} score ${game.run.score}`);
  }
  ok(run1.catchStep >= 0 && run1.savedAt > run1.catchStep, `B. kept at step ${run1.savedAt}, the fire took him at ${run1.catchStep}: it must be after the catch's step`);
  ok(R.lastReplay && R.lastReplay.keyframes.length > 0, 'B. the recorder kept no copies of the live game (its hooks broke the copy)');
  ok(R.saved === true, 'B. the scoreboard would say NOT SAVED');
  note(`B. a run of ${(run1.catchStep / 240).toFixed(1)} s to floor ${game.run.maxFloor}, kept ${run1.savedAt - run1.catchStep} step(s) after the catch in ${R.lastSaveMs.toFixed(2)} ms, ${R.lastReplay.keyframes.length} copies of the live game`);
}

// =============================================================================================
// E. The scoreboard's prompt, on the key panel.
// =============================================================================================
{
  const skin = Board.boardSkinFor(game);
  const keysCanvas = skin.parts.keys && skin.parts.keys.c;
  const board = V.board();
  const seen = [];
  // Every keycap and glyph of the menus' lettering drawn, where it was drawn [view units].
  const lettering = new Set();
  for (const [key] of Menu.menuStats().pieces) {
    if (!key.startsWith('ink:') && !key.startsWith('cap:')) continue;
    const a = Menu.menuPiece(key);
    lettering.add(a && a.c ? a.c : a);
  }
  const drawn = [];
  // Drawn into the canvas the renderer draws a frame in: under LOW LATENCY (on by default) a
  // back buffer the finished frame is put on the screen from in one blit (Renderer.present),
  // without it the screen's own. Counted on the screen's alone, with the hint on, the row was
  // never drawn at all -- the merge of the two, 2026-09-29.
  const target = V.renderer.ctx.canvas;
  const proto = Object.getPrototypeOf(canvas.getContext('2d'));
  const di = proto.drawImage;
  proto.drawImage = function (img, ...a) {
    if (img === keysCanvas) seen.push(a);
    if (this.canvas === target && lettering.has(img) && a.length >= 8) drawn.push([a[4], a[5], a[6], a[7]]);
    return di.call(this, img, ...a);
  };
  seedRandom();
  render();
  proto.drawImage = di;
  const box = Screens.boardKeysBox(board.records, board.unlocked);
  const f = skin.parts.keys;
  const drawnY = seen.length ? seen[0][5] + f.oy / C.PX : NaN;
  ok(seen.length === 1 && Math.abs(drawnY - box.y) < 1e-9, `E. the key panel is drawn at ${drawnY}, boardKeysBox says ${box.y}`);
  // The key panel's row of keys as DRAWN -- every keycap and glyph on the panel's second row,
  // in groups a gap of more than a letter apart: [R] REPLAY, [S] STATS, [ESC] MENU, [G] RACE
  // BEST. The two in the middle are drawGameOver's row; the replays' flank it.
  const hy = box.y + Board.KEYS_ROWS.hints;
  const onRow = drawn.filter(([x, y, w, h]) => y <= hy && y + h >= hy + 7 && x >= box.x - 8 && x + w <= box.x + box.w + 8)
    .sort((p, q) => p[0] - q[0]);
  const groups = [];
  for (const [x, , w] of onRow) {
    const g = groups[groups.length - 1];
    if (g && x - g[1] <= 7) g[1] = Math.max(g[1], x + w); else groups.push([x, x + w]);
  }
  const mid = box.x + box.w / 2;
  const middle = groups.length === 4 ? [groups[1][0], groups[2][1]] : null;
  ok(middle && Math.abs((middle[0] + middle[1]) / 2 - mid) <= 1.5,
    `E. the key panel's row is drawn as four keys, its own two centred: ${groups.map(([a, b]) => `${a.toFixed(1)}..${b.toFixed(1)}`).join(', ')} ` +
    `(the panel's middle ${mid})`);
  // The replays' keys for the keyboard and the pad, kept and not: inside the panel's well,
  // clear of the row as it is drawn.
  const [rowL, rowR] = middle || [mid, mid];
  let left = Infinity, right = -Infinity, clear = Infinity;
  for (const pad of [false, true]) {
    for (const saved of [true, false]) {
      for (const w of Skin.boardReplayLayout(box, { replay: true, race: true, saved, pad })) {
        left = Math.min(left, w.x); right = Math.max(right, w.x + w.w);
        clear = Math.min(clear, w.x + w.w <= mid ? rowL - (w.x + w.w) : w.x - rowR);
      }
    }
  }
  // And the pair this board drew, where the layout says: the outer groups.
  const outer = groups.length === 4 ? [groups[0], groups[3]] : [];
  const laid = Skin.boardReplayLayout(box, { replay: true, race: true, saved: R.saved, pad: false });
  const agree = outer.length === 2 && laid.length === 2 && laid.every((w, i) => Math.abs(w.x - outer[i][0]) <= 0.75 && Math.abs(w.x + w.w - outer[i][1]) <= 0.75);
  ok(left >= box.x + 4 && right <= box.x + box.w - 4 && clear >= 10 && agree,
    `E. the prompt runs off the key panel or into its row: ${left}..${right} in ${box.x}..${box.x + box.w}, ${clear} units from the row` +
    (agree ? '' : `; the layout says ${laid.map((w) => `${w.x}..${w.x + w.w}`).join(', ')}, drawn ${outer.map(([a, b]) => `${a}..${b}`).join(', ')}`));
  shot('board-r-replay');
  note(`E. R REPLAY and G RACE BEST on the scoreboard's key panel (${left.toFixed(1)}..${right.toFixed(1)} inside ${box.x}..${box.x + box.w})`);
}

// =============================================================================================
// C. The instant replay, and D. the board as it was after it.
// =============================================================================================
const boardBefore = (() => {
  const g = game;
  const s = {
    state: g.state, p: [g.player.x, g.player.y, g.player.vx, g.player.vy], impactT: g.impactT, deathT: g.deathT,
    parts: g.particles.n, camY: g.camY, shake: g.shake, rt: V.renderer.t, streaks: JSON.stringify(V.renderer.streaks),
    stats: statsText(), board: JSON.stringify(V.board()), store: storeText(), gibs: JSON.stringify(g.gibs),
  };
  seedRandom();
  render();
  s.hash = hash();
  // Rendering moves the streak pool on; put it back so the board is compared from here.
  V.renderer.streaks = JSON.parse(s.streaks);
  V.renderer.t = s.rt;
  return s;
})();

const dur = Replay.durationOf(R.lastReplay);
const liveFall = run1.log;       // log[i] = the Duke after step i+1 of the run, fall included
let mism = 0, compared = 0, firstBad = null;
function comparePb() {
  const pb = R.w && R.w.pb;
  if (!pb) return;
  const i = pb.stepIndex - 1;
  if (i < 0 || i >= liveFall.length) return;
  compared++;
  const p = pb.game.player;
  if (p.x !== liveFall[i][0] || p.y !== liveFall[i][1]) { mism++; if (!firstBad) firstBad = `step ${i + 1}: ${p.x},${p.y} against ${liveFall[i]}`; }
}
let hudLate0 = 0, midSeekDrawn = false;
{
  tag = () => (R.w ? R.w.pb.stepIndex : 'ui');
  const heardAt = heard.length;
  // The HUD's skins are painted ahead for one game (render/hudskin.js): the zone on screen and
  // the next, the others let go at each change of zone. A run that dies a few seconds into a
  // zone has let go of the one its instant replay begins in -- measured through main.js, a run
  // that died 15 s into FOREST: its replay began in DUNGEON, and the first frames painted 40
  // pieces (DUNGEON's skin, then FOREST's again), ~100 ms headless. Put the skins where such a
  // run leaves them: on a zone that is neither this death's nor BASEMENT's (always kept).
  const away = THEMES.find((t) => t.name !== game.theme.name && t.name !== THEMES[0].name && t !== game.nextTheme);
  HudSkin.hudSkinFor({ theme: away, nextTheme: away });
  hudLate0 = HudSkin.hudSkinStats().lateBuilds;
  press1('KeyR');
  ok(R.mode === 'watch' && R.w && R.w.from === 'board', 'C. R on the scoreboard did not open the instant replay');
  ok(R.w && !R.w.seek && R.w.pb.stepIndex === 0 && R.w.phase === 'play' && R.w.pb.game.run.maxFloor === 0,
    `C. the instant replay does not start at the run's beginning: step ${R.w && R.w.pb.stepIndex}, floor ${R.w && R.w.pb.game.run.maxFloor}${R.w && R.w.seek ? ', seeking' : ''}`);
  ok(music.some(([n, a]) => n === 'startClimb' && a === 0), 'C. the climb\'s music was not put on at the run\'s first floor');
  // Then as a player skips to the end: ten seconds before the catch, in 5 s presses or at once.
  const BACK = 10;
  const tk = performance.now();
  R.seekTo(Math.max(0, dur - BACK));
  const keyMs = performance.now() - tk;
  // A frame drawn while the seek is still on, once it has got into the clip's own zone -- not
  // at the copy it restored, which is in BASEMENT here, whose skin is always kept. The zone's
  // skin is being painted then, on the seek's budget, over several frames.
  let pre = 0;
  while (R.w.seek && R.w.pb.game.theme.name === THEMES[0].name && pre < 500) { V.loop.onFrame(0); pre++; }
  midSeekDrawn = !!R.w.seek && R.w.pb.game.theme.name !== THEMES[0].name;
  seedRandom();
  render();
  const seekMore = pre + seekFrames();
  const want = Math.round((dur - BACK) / STEP);
  const pb = R.w.pb;
  ok(pb.stepIndex === want, `C. the seek landed at step ${pb.stepIndex}, not ${want} (${BACK} s before the catch)`);
  const work0 = pb.work;
  ok(pb.work <= C.REPLAY_KEYFRAME_EVERY, `C. the instant replay simulated ${pb.work} steps to start: it did not restore a copy of the live game`);
  ok(heard.length === heardAt, `C. the seek into the instant replay was heard: ${JSON.stringify(heard.slice(heardAt, heardAt + 4))}`);
  ok(music.some(([n, a]) => n === 'startClimb' && a === pb.game.run.maxFloor), 'C. the climb\'s music was not put on where the replay starts');
  // The HUD's BEST line reads the best as it stood when the run began -- none, before this
  // first run -- as the run's own HUD did; the stats hold this run's score now.
  ok(pb.game.state === STATE.PLAYING && R.hudStats(pb.game).bestScore === 0 && V.stats().bestScore > 0,
    `C. the instant replay's HUD reads a best of ${R.hudStats(pb.game).bestScore} while he climbs, where the run's read none (the stats say ${V.stats().bestScore} now)`);
  comparePb();
  // 1x, frame for frame, to the impact and its hold.
  const playFrom = pb.stepIndex;
  let n = 0;
  while (R.w && R.w.phase !== 'end' && n < 240 * 30) {
    steps(1); comparePb(); n++;
    if (n === 240 && SHOTS) { seedRandom(); render(); shot('overlay-playing'); }
    // A replay's frames run the renderer's clock and its speed streaks on, and the board's
    // frame reads both (D). This test draws with the UI clock held (forcedDt 0), so the
    // clock is moved here as a frame would move it, and a frame is drawn now and then.
    if (n % 480 === 0) { V.renderer.t += 0.5; seedRandom(); render(); }
  }
  ok(R.w && R.w.phase === 'end' && R.w.paused, `C. the instant replay did not stop at the run's end (${R.w && R.w.phase})`);
  const g = pb.game;
  ok(g.impacted && g.state === STATE.DEAD && pb.done, `C. it stopped before the run did: ${g.state}, impacted ${g.impacted}`);
  // In the fall, as in the run's: the stats after the catch committed the run.
  ok(R.hudStats(g) === V.stats(), 'C. the instant replay\'s fall reads other stats than the run\'s fall did');
  ok(pb.stepIndex - playFrom === n, `C. ${pb.stepIndex - playFrom} replay steps in ${n} loop steps at 1x`);
  // The ghost track agrees with the replay at every sample it passed.
  let gbad = 0;
  const G = R.lastReplay.ghost, q = R.lastReplay.header.ghostQ;
  for (let i = Math.ceil(playFrom / 8); i * 8 <= Math.min(pb.stepIndex, run1.catchStep); i++) {
    const L = liveFall[i * 8 - 1];
    if (L && (Math.round(L[0] * q) !== G.x[i] || Math.round(L[1] * q) !== G.y[i])) gbad++;
  }
  ok(gbad === 0, `C. ${gbad} ghost samples disagree with the run`);
  // The run's sounds at the run's steps (from half a second in: a restored game hears its
  // first CLIMB! or chain as new).
  const W0 = playFrom + 120, W1 = run1.catchStep;
  const liveAll = heard.slice(0, heardAt).filter(([, t]) => typeof t === 'number' && t >= W0 && t < W1).map(([m, t]) => m + '@' + t);
  const rep = heard.slice(heardAt).filter(([, t]) => typeof t === 'number' && t >= W0 && t < W1).map(([m, t]) => m + '@' + t);
  ok(liveAll.length > 0 && JSON.stringify(liveAll) === JSON.stringify(rep),
    `C. the replay's sounds are not the run's: ${liveAll.length} in the run, ${rep.length} in the replay; first difference ${liveAll.find((x, i) => x !== rep[i]) || rep[liveAll.length]}`);
  const lament = heard.slice(heardAt).filter(([m]) => m === 'lament').length;
  ok(lament === 1, `C. the catch's lament played ${lament} times in the replay`);
  if (SHOTS) { seedRandom(); render(); shot('overlay-offer'); }
  note(`C. the instant replay: from the run's first step; a seek to ${BACK} s before the catch restored in ${work0} steps (${keyMs.toFixed(1)} ms in the seek's frame on a ${C.REPLAY_SEEK_BUDGET} ms budget, ${seekMore} more frame(s)), ${n} steps at 1x to the run's end, every step where the run was, ${liveAll.length} sounds at the run's own steps`);

  // Back 5 s: 1200 steps, silent, and still the run.
  const at = pb.stepIndex, h0 = heard.length, s0 = stopped.length;
  A.live.sfxScream = [{ end: Infinity }];
  press1('ArrowLeft');
  seekFrames();
  ok(R.w.pb.stepIndex === at - C.REPLAY_SKIP / STEP, `C. back ${C.REPLAY_SKIP} s landed at ${R.w.pb.stepIndex}, not ${at - C.REPLAY_SKIP / STEP}`);
  ok(heard.length === h0, `C. the seek back was heard: ${JSON.stringify(heard.slice(h0, h0 + 3))}`);
  ok(stopped.slice(s0).includes('sfxScream'), 'C. the seek did not stop what was sounding');
  ok(!R.w.paused && R.w.phase === 'play', 'C. a seek from the end did not play on');
  comparePb();
  steps(240, comparePb);
  // Forward 5 s.
  const at2 = R.w.pb.stepIndex, h1 = heard.length;
  press1('ArrowRight');
  seekFrames();
  ok(R.w.pb.stepIndex === at2 + C.REPLAY_SKIP / STEP || (R.w.pb.done && R.w.pb.stepIndex < at2 + C.REPLAY_SKIP / STEP),
    `C. forward ${C.REPLAY_SKIP} s landed at ${R.w.pb.stepIndex}, not ${at2 + C.REPLAY_SKIP / STEP}`);
  ok(heard.length === h1, 'C. the seek forward was heard');
  comparePb();
  for (let k = 0; R.w.phase !== 'end' && k < 240 * 10; k++) { steps(1); comparePb(); }
  ok(R.w.phase === 'end', `C. the instant replay did not come to its end again (${R.w.phase})`);
  // The whole run again: from the start, then 2x, 4x, 1/2x, a pause.
  press1('Space');
  seekFrames();
  ok(R.w.pb.stepIndex === 0 && R.w.phase === 'play', 'C. SPACE at the end did not play the whole run from the start');
  steps(240 * 2, comparePb);
  const sp = [];
  for (const [k, per] of [['ArrowUp', 2], ['ArrowUp', 4], ['ArrowDown', 2], ['ArrowDown', 1], ['ArrowDown', 0.5]]) {
    tap(k);
    const i0 = R.w.pb.stepIndex;
    steps(240, comparePb);
    const got = (R.w.pb.stepIndex - i0) / 240;
    sp.push(got);
    ok(Math.abs(got - per) < 0.01, `C. at ${per}x the replay stepped ${got} times a loop step`);
    if (per === 4 && SHOTS) { seedRandom(); render(); shot('overlay-4x'); }
  }
  tap('Digit2');
  tap('Space');
  const i1 = R.w.pb.stepIndex;
  steps(240);
  ok(R.w.paused && R.w.pb.stepIndex === i1, 'C. a paused replay went on');
  ok(music.slice(-3).some(([m]) => m === 'suspend'), 'C. a pause did not pause the sound');
  if (SHOTS) { seedRandom(); render(); shot('overlay-paused'); }
  ok(mism === 0, `C. the replay left the run ${mism} times in ${compared} steps compared (first ${firstBad})`);
  note(`C. ${compared} steps compared through the instant replay, back and forward ${C.REPLAY_SKIP} s, the whole run at 1, 2, 4, 1 and 1/2x (${sp.join(', ')} a step) and a pause: every one where the run was; the seeks silent`);

  // On at 1x into the next zone by play, a frame drawn every 4 steps (60 Hz): the seek to the
  // start made BASEMENT's skin the one drawn and let go of the next zone's, and the HUD's own
  // warm-up waits WARM_AFTER frames in a zone before it paints ahead -- which a replay that
  // lands shortly before a change of zone does not have. Then no piece of any HUD skin was
  // painted in a frame through all of C: the instant replay's start in a zone the run had let
  // go of, the frame drawn mid-seek, the seeks, the whole run.
  tap('Digit2');
  tap('Space');
  // ...played into from well inside the zone before it: the run's own first change of zone, from
  // its log (the zone follows the best floor), less four seconds -- 240 frames at 60 Hz, past the
  // HUD's WARM_AFTER. The checks above leave the replay about 11.5 s into the run, and which side
  // of that the change falls depends on the tower's seed.
  const liveCross = run1.log.findIndex((r) => themeIndexFor(r[2]) !== themeIndexFor(run1.log[0][2]));
  if (liveCross > 0 && R.w.pb.stepIndex > liveCross - 240 * 2) {
    R.seekTo(Math.max(0, liveCross - 240 * 4) * STEP);
    seekFrames();
    comparePb();
  }
  const z0 = R.w.pb.game.theme.name;
  let crossed = false, crossStep = -1;
  for (let k = 0; k < 240 * 20 && !crossed; k += 4) {
    steps(4);
    comparePb();
    seedRandom();
    render();
    crossed = R.w.pb.game.theme.name !== z0;
    if (crossed) crossStep = R.w.pb.stepIndex;
  }
  for (let k = 0; k < 8; k++) { steps(4); render(); }
  let hudLate = HudSkin.hudSkinStats().lateBuilds - hudLate0;
  // A seek that lands a dozen steps before that change of zone, the next zone's skin let go
  // (as the instant replay above would have found it had its run died a few seconds into the
  // zone after): 3 frames to the crossing, so the next zone's skin must be ready when the seek
  // ends -- a piece a frame from the landing leaves most of it to paint in the crossing's frame.
  HudSkin.hudSkinFor({ theme: away, nextTheme: away });
  const lateSeek0 = HudSkin.hudSkinStats().lateBuilds;
  // The rest of those two zones' scene painted already (warmScene), so this seek waits on the
  // HUD alone: with scene still to paint, the seek's extra frames finished the next skin anyway
  // and hid a seek that ended with it unpainted (the hud-next-late mutant went uncaught).
  R.warmScene({ theme: THEMES[THEMES.findIndex((t) => t.name === z0)], themeIndex: THEMES.findIndex((t) => t.name === z0),
    nextTheme: R.w.pb.game.theme, banners: [] }, Infinity);
  R.seekTo(Math.max(0, crossStep - 16) * STEP);
  seekFrames();
  const landedIn = R.w.pb.game.theme.name;
  let crossedAgain = false;
  for (let k = 0; k < 16; k++) { steps(4); comparePb(); render(); crossedAgain = crossedAgain || R.w.pb.game.theme.name !== landedIn; }
  hudLate += HudSkin.hudSkinStats().lateBuilds - lateSeek0;
  ok(crossed && crossedAgain && midSeekDrawn && hudLate === 0,
    `C. the replay painted ${hudLate} pieces of the HUD's skins inside its frames (a frame drawn mid-seek in the clip's zone: ${midSeekDrawn}; into the next zone by play: ${crossed}; again from a seek just short of it: ${crossedAgain})`);
  ok(mism === 0, `C. the replay left the run ${mism} times after the seek to just before a change of zone (first ${firstBad})`);
  note(`C. the HUD's skins: none painted in a replay's frame -- the clip began in a zone the run had let go of, a frame was drawn mid-seek, and the replay played on from ${z0} into ${R.w.pb.game.theme.name}`);
  // No seek painted the scene of the zone after the one the run ended in: its replay never gets
  // there. The one it ended in was painted ahead, by the seek that landed before it.
  const beyond = game.nextTheme;
  ok(beyond && beyond !== game.theme && !R.platWarm.has(beyond.name) && R.platWarm.has(game.theme.name),
    `C. the seeks painted ahead ${[...R.platWarm].join(', ')}: ${beyond && beyond.name}, after the run's last zone, its replay never reaches`);
  tap('Space');

  // Leave: everything the replay started stops, and the board's music comes back.
  A.live.sfxLand = [{ end: Infinity }];
  A.live.sfxJump = [{ end: Infinity }];
  const s1 = stopped.length, m1 = music.length;
  press1('Escape');
  ok(R.mode === null && game.state === STATE.DEAD, 'C. ESC did not leave the replay for the scoreboard');
  ok(Object.keys(A.live).length === 0 && ['sfxLand', 'sfxJump'].every((n) => stopped.slice(s1).includes(n)),
    `C. leaving left effects sounding: ${Object.keys(A.live).join(', ')}`);
  const after = music.slice(m1).map(([m, a]) => m + (a ? ':' + a : ''));
  ok(after.includes('stopMusic') && after[after.length - 1] === 'crossTo:gameover' && after.includes('resumeCtx'),
    `C. leaving did not stop the replay's music and put the board's back: ${after.join(' ')}`);
  tag = () => 'ui';
}
{
  const g = game;
  const s = {
    state: g.state, p: [g.player.x, g.player.y, g.player.vx, g.player.vy], impactT: g.impactT, deathT: g.deathT,
    parts: g.particles.n, camY: g.camY, shake: g.shake, rt: V.renderer.t, streaks: JSON.stringify(V.renderer.streaks),
    stats: statsText(), board: JSON.stringify(V.board()), store: storeText(), gibs: JSON.stringify(g.gibs),
  };
  const diff = Object.keys(s).filter((k) => JSON.stringify(s[k]) !== JSON.stringify(boardBefore[k]));
  ok(diff.length === 0, `D. the board is not as it was after the replay: ${diff.map((k) => k + ' ' + String(boardBefore[k]).slice(0, 40) + ' -> ' + String(s[k]).slice(0, 40)).join('; ')}`);
  seedRandom();
  render();
  ok(hash() === boardBefore.hash, 'D. the board\'s frame is not the frame it was');
  frameOnce();
  note('D. back on the scoreboard: the live game, the save file, the records and awards, the store, the renderer\'s clock and streaks and every pixel as they were; watching committed nothing');
}

const ghostRun = R.lastReplay;
// =============================================================================================
// F. The ghost is placed as the Duke is; racing the best.
// =============================================================================================
let raceRun;
{
  const bestSeed = ghostRun.header.seed;
  // The scoreboard up for three quarters of a second, as a player sees it before pressing G:
  // it paints the ghost's atlas a cell a frame, so the race paints none of it in its frames.
  for (let i = 0; i < 45; i++) { seedRandom(); render(); }
  const late0 = Skin.ghostStats().late;
  // G: first the question (2026-09-29) -- the options the run was played at beside the
  // player's own, and whether to race at the run's. The player's JUMP SPEED, DIFFICULTY and
  // GRAVITY are put off the run's for it (140%, HARD and LOW against its 120%, MEDIUM and
  // NORMAL), so those three rows differ; ESC goes back to the board, and Y then races at the
  // run's own.
  const S = R.d.settings(), keepS = { jumpSpeed: S.jumpSpeed, difficulty: S.difficulty, gravity: S.gravity };
  S.jumpSpeed = 1.4;
  S.difficulty = 2;
  S.gravity = 0.8;
  const H = ghostRun.header;
  press1('KeyG');
  const asked = R.asking && !R.prep && game.state === STATE.DEAD;
  const askProbe = Menu.menuProbe(true);
  seedRandom();
  render();
  Menu.menuProbe(false);
  if (SHOTS) shot('race-question');
  const askSaid = askProbe.filter((e) => e.kind === 'text').map((e) => e.s);
  const askRow = (k) => (asked ? R.askInfo().rows.find((r) => r.key === k) : null) || {};
  ok(asked && askSaid.includes(Skin.RACE_TITLES.board) && askSaid.includes(Skin.ASK_WORDS.ask)
    && ['JUMP SPEED', 'PLATFORMS', 'DIFFICULTY', 'GRAVITY', '120%', '140%', 'MEDIUM', 'HARD', 'NORMAL', 'LOW', 'SAME', 'DIFFERS',
      'SAME OPTIONS', 'MY OPTIONS'].every((w) => askSaid.includes(w))
    && askRow('jumpSpeed').same === false && askRow('platforms').same === true && askRow('difficulty').same === false
    && askRow('gravity').same === false,
  `F. G on the scoreboard did not ask first, the run's options beside the player's: ${askSaid.join(' | ')}`);
  press1('Escape');
  ok(!R.asking && !R.prep && game.state === STATE.DEAD && R.mode === null, 'F. ESC on the race\'s question did not go back to the board');
  press1('KeyG');
  press1('KeyY');
  // Then the ghost's own tower, surveyed from its replay a slice a frame on the seek's budget
  // (race.js); the race starts in the frame after the last slice, which does none of it.
  const prep = R.lastPrep;
  ok(!!R.prep && !!prep && game.state === STATE.DEAD, 'F. Y on the race\'s question did not prepare the race (a survey of the ghost\'s tower)');
  // Each frame hands the survey the seek's budget (test-racetower holds the survey to it).
  const budgets = [];
  const run0 = RaceMod.CourseSurvey.prototype.run;
  RaceMod.CourseSurvey.prototype.run = function (b) { budgets.push(b); return run0.call(this, b); };
  const prepMs = [];
  while (game.state === STATE.DEAD && prepMs.length < 1000) {
    const a = performance.now();
    V.loop.onFrame(0);
    prepMs.push(performance.now() - a);
    if (game.state === STATE.DEAD) { seedRandom(); render(); }
  }
  RaceMod.CourseSurvey.prototype.run = run0;
  const slices = prep ? prep.frames : 0;
  ok(game.state === STATE.PLAYING && game.seed === bestSeed, `F. G on the scoreboard did not race the best run on its seed (${game.seed} against ${bestSeed})`);
  ok(game.jumpSpeed === H.jumpSpeed && game.difficulty === H.difficulty && game.platforms === H.platforms && game.gravity === (H.gravity || 1),
    `F. SAME OPTIONS did not race at the run's: JUMP SPEED ${game.jumpSpeed} for ${H.jumpSpeed}, DIFFICULTY ${game.difficulty} for ${H.difficulty}, PLATFORMS ${game.platforms} for ${H.platforms}, GRAVITY ${game.gravity} for ${H.gravity}`);
  Object.assign(S, keepS);
  ok(R.race && game.input instanceof Replay.Recorder, 'F. the race is not raced, or not recorded');
  ok(!!prep && !!prep.course && game.tower.course === prep.course && !R.race.ghostOnly,
    `F. the race is not on the ghost's own tower (${prep && prep.error})`);
  ok(slices >= 1 && budgets.length === slices && budgets.every((b) => b === C.REPLAY_SEEK_BUDGET) && prep.worstMs <= C.REPLAY_SEEK_BUDGET + 4 && prepMs.length === slices + 1,
    `F. the survey ran in ${slices} slice(s) given budgets of ${[...new Set(budgets)].join(', ')} ms, the longest ${prep && prep.worstMs.toFixed(1)} ms on a ${C.REPLAY_SEEK_BUDGET} ms budget, over ${prepMs.length} frames: it must run on the seek's budget, and the race start in a frame of its own`);
  const raceFloors = [null];
  takeFloors(game, raceFloors);
  const ghostDrawn = new Map();
  // The same bot on the same tower, starting a moment late: a few floors behind the ghost
  // while the ghost climbs, and past it once the ghost's run has ended (its bot let go at 25 s
  // and the fire took it), with the ghost standing on its last floor below.
  let gbad = 0, gcount = 0, worst = 0, ahead = null, behind = null;
  let full = 0, leadBad = 0;
  const check = (whole) => {
    if (game.state !== STATE.PLAYING) return;
    const k = R.rec.steps;
    R.lastGhost = null;
    if (whole) {
      seedRandom();
      // The first whole frame's words: a race on the ghost's own tower says nothing of ledges.
      const probe = full === 0 ? Menu.menuProbe(true) : null;
      render(1);
      if (probe) {
        Menu.menuProbe(false);
        const said = probe.filter((e) => e.kind === 'text').map((e) => e.s);
        ok(said.includes('GHOST') && !said.includes(Skin.LEDGES_NOTE), `F. the race's readout: ${said.join(' | ')}`);
      }
      full++;
      ok(!!R.lastGhost, 'F. main.js drew no ghost in a race frame');
    }
    else R.drawRaceGhost(V.renderer.ctx, 1);
    const gh = R.lastGhost;
    if (!gh) return;
    ghostDrawn.set(k, [gh.x, gh.y, gh.pose]);
    if (!gh.done && k % 8 === 0 && k > 0 && k - 1 < run1.catchStep) {
      const L = run1.log[k - 1];
      const d = Math.max(Math.abs(gh.x - L[0]), Math.abs(gh.y - L[1]));
      worst = Math.max(worst, d);
      gcount++;
      if (d > 0.5 / C.REPLAY_GHOST_Q + 1e-9) gbad++;
    }
    const lead = R.race.lead(game.player.y, R.raceTime(1));
    // The readout is the floors between the two of them, from where the ghost is drawn.
    if (lead !== Math.round((game.player.y - gh.y) / C.FLOOR_H)) leadBad++;
    // The review's two frames: the ghost on screen and at least two floors above, then below.
    const seen = gh.y > game.camY + 20 && gh.y < game.camY + game.viewH - 50;
    if (lead <= -2 && behind === null && seen) {
      behind = lead;
      if (SHOTS) { seedRandom(); render(1); shot('race-ghost-ahead'); }
    }
    if (lead >= 2 && ahead === null && seen) {
      ahead = lead;
      if (SHOTS) { seedRandom(); render(1); shot('race-ghost-behind'); }
    }
  };
  let s = 0;
  const drive = botDriver();
  while (game.state === STATE.PLAYING && s < 240 * 120) {
    const was = game.state;
    steps(1, () => { if (s >= 240 && s < 240 * 70) drive(); else letGo(); });
    if (was === STATE.PLAYING) takeFloors(game, raceFloors);
    const k = R.rec.steps;
    if (k % 8 === 0) check(k % 960 === 0);
    s++;
  }
  letGo();
  // The racer's fall: the ghost goes out with the tower's burn (BURN_T), as everything of the
  // climb does by FALL_CLEAR; drawn in the burn's first moments, never after it.
  let inBurn = 0, afterBurn = 0;
  while (game.state === STATE.FALLING) {
    steps(1);
    if (game.state !== STATE.FALLING) break;
    R.lastGhost = null;
    R.drawRaceGhost(V.renderer.ctx, 1);
    if (R.lastGhost && game.deathT < C.BURN_T - STEP) inBurn++;
    if (R.lastGhost && game.deathT > C.BURN_T) afterBurn++;
  }
  frameOnce();
  ok(inBurn > 0 && afterBurn === 0, `F. in the racer's fall the ghost was drawn in ${inBurn} steps of the burn and ${afterBurn} after it`);
  ok(gcount > 20 && gbad === 0 && full > 3, `F. the ghost left its track at ${gbad} of ${gcount} samples (worst ${worst.toFixed(4)} units)`);
  ok(leadBad === 0, `F. the readout is not the floors between the racer and the ghost at ${leadBad} frames`);
  ok(behind !== null && ahead !== null, `F. the race never had the ghost on screen both ahead of the racer and behind him (${behind}, ${ahead})`);
  const kept = Replay.listReplays().filter((e) => e.origin === 'own');
  ok(kept.length === 2 && kept.some((e) => e.last && e.seed === bestSeed), `F. the race was not kept as a run of its own (${kept.length} own replays)`);
  raceRun = R.lastReplay;
  const raceSaveMs = R.lastSaveMs, raceLen = Replay.durationOf(raceRun);
  note(`F. the race: on the best run's seed, the ghost where the run was at ${gcount} samples (worst ${worst.toFixed(4)} units, half a quantum is ${0.5 / C.REPLAY_GHOST_Q}), readout from ${behind} to ${ahead === null ? 'never ahead' : '+' + ahead}; the race kept as a run (${raceLen.toFixed(0)} s, saved in ${raceSaveMs.toFixed(2)} ms)`);
  const gs = Skin.ghostStats();
  ok(gs.late === late0, `F. the race painted ${gs.late - late0} cells of the ghost's atlas in its own frames`);
  note(`F. the ghost's atlas: ${gs.cells} of ${gs.total} cells painted a cell a frame on the scoreboard, ${(gs.ms / Math.max(1, gs.cells)).toFixed(2)} ms a cell headless, none in a frame of the race`);
  // The tower the race was run on is the ghost run's own (tools/test-racetower.mjs holds it to
  // that for racers who climb differently; this is main.js handing the course over).
  {
    const upTo = Math.min(raceFloors.length, run1.floors.length) - 1;
    let bad = 0, first = -1;
    for (let n = 1; n <= upTo; n++) {
      const a = raceFloors[n], b = run1.floors[n];
      if (!a || !b || a.x !== b.x || a.w !== b.w || a.kind !== b.kind) { bad++; if (first < 0) first = n; }
    }
    ok(upTo > 100 && bad === 0, `F. ${bad} of the ${upTo} floors of the race are not the ghost run's (the first ${first})`);
    const start = prepMs[prepMs.length - 1];
    note(`F. the race's tower is the ghost run's: surveyed in ${prep.ms.toFixed(1)} ms over ${slices} frames (the longest slice ${prep.worstMs.toFixed(1)} ms, the longest frame's onFrame ${Math.max(...prepMs.slice(0, -1)).toFixed(1)} ms), the race started in the frame after (${start.toFixed(1)} ms); all ${upTo} floors the race and the ghost's run share are the ghost's`);
  }
  // The race's own replay races its ghost again: its instant replay (R on the board) draws the
  // ghost where the race drew it, step for step (the file carries the ghost's track).
  {
    tap('KeyR');
    ok(R.mode === 'watch' && !!R.w.race, 'F. the race\'s instant replay has no ghost to draw');
    seekFrames();
    // At the race's start, where the ghost is still climbing (its run ended ~27 s in; in its
    // last ten seconds it only stands on its floor, and a clock a step out there draws the
    // same frame). The instant replay opens there now; the seek to 0 is kept, a no-op.
    R.seekTo(0);
    seekFrames();
    let wn = 0, wbad = 0, wfirst = null;
    for (let i = 0; R.w && R.w.phase === 'play' && i < 240 * 12; i++) {
      steps(1);
      const pb = R.w && R.w.pb;
      if (!pb || pb.game.state !== STATE.PLAYING || pb.k % 8) continue;
      const want = ghostDrawn.get(pb.k);
      if (!want) continue;
      R.lastGhost = null;
      seedRandom();
      render(1);
      const gh = R.lastGhost;
      wn++;
      if (!gh || gh.x !== want[0] || gh.y !== want[1] || gh.pose !== want[2]) { wbad++; if (!wfirst) wfirst = `step ${pb.k}: ${gh && [gh.x, gh.y, gh.pose]} against ${want}`; }
    }
    ok(wn > 20 && wbad === 0, `F. the race's instant replay drew its ghost off where the race drew it at ${wbad} of ${wn} steps (${wfirst})`);
    tap('Escape');
    ok(R.mode === null && game.state === STATE.DEAD, 'F. ESC from the race\'s instant replay did not go back to the board');
    note(`F. the race's instant replay draws the ghost it raced where the race drew it, at all ${wn} steps compared`);
  }
}
{
  // Record the two draws' matrices and arguments with a context that only keeps count.
  function recCtx() {
    const calls = [];
    let m = [1, 0, 0, 1, 0, 0];
    const stack = [];
    const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
    return {
      calls, globalAlpha: 1,
      save() { stack.push(m); }, restore() { m = stack.pop(); },
      scale(x, y) { m = mul(m, [x, 0, 0, y, 0, 0]); }, translate(x, y) { m = mul(m, [1, 0, 0, 1, x, y]); },
      rotate(a) { const c = Math.cos(a), s = Math.sin(a); m = mul(m, [c, s, -s, c, 0, 0]); },
      drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) {
        const pt = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]].map((v) => Math.round(v * 1e6) / 1e6);
        calls.push({ w: img.width, src: [sx, sy, sw, sh], corners: [pt(dx, dy), pt(dx + dw, dy + dh), pt(dx + dw, dy)] });
      },
    };
  }
  let pbad = 0, cases = 0;
  const snap = (v) => Math.round(v * C.PX) / C.PX;
  for (const name of Sprites.NAMES) {
    for (const facing of [1, -1]) {
      for (const spin of [0, 1, 2, 3]) {
        for (const [x, y] of [[123.3, 456.7], [240.125, 30]]) {
          const a = recCtx(), b = recCtx();
          a.save(); a.scale(1, -1); Sprites.drawSprite(a, name, snap(x), snap(-y), facing < 0, spin, 0); a.restore();
          Skin.drawGhost(b, name, x, y, facing, 1, spin);
          cases++;
          const ca = a.calls[0], cb = b.calls[0];
          if (!ca || !cb || JSON.stringify(ca.src) !== JSON.stringify(cb.src) || ca.w !== cb.w || JSON.stringify(ca.corners) !== JSON.stringify(cb.corners)) {
            if (!pbad) console.log('       first misplaced ghost:', name, facing, spin, JSON.stringify(ca), JSON.stringify(cb));
            pbad++;
          }
        }
      }
    }
  }
  ok(pbad === 0, `F. the ghost is drawn off the Duke's placement in ${pbad} of ${cases} cases`);
  note(`F. the ghost placed exactly as drawSprite places the Duke: ${cases} cases (every pose, both facings, four quarter turns, two positions)`);
}

// =============================================================================================
// G. The REPLAYS screen.   H. Export, import, and hostile files.
// =============================================================================================
let saved = null;
const fake = {
  kind: 'desktop', opens: [],
  save: async (name, text) => { saved = { name, text }; return { ok: true, name }; },
  open: async () => fake.opens.shift() || { ok: false, canceled: true },
};
R.files = fake;
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };
function listWords() {
  const probe = Menu.menuProbe(true);
  render();
  Menu.menuProbe(false);
  return probe.filter((e) => e.kind === 'text' || e.kind === 'line');
}
{
  tap('Escape');
  ok(game.state === STATE.MENU, 'G. ESC on the scoreboard did not go to the title');
  if (SHOTS) { seedRandom(); render(); shot('menu-r-replays'); }
  // Painted ahead: once the title screen's warm-up has run, the replays' screens paint nothing.
  Menu.warmMenu(10000);
  Menu.resetMenuStats();
  tap('KeyR');
  ok(R.mode === 'list', 'G. R on the title did not open the REPLAYS screen');
  const L = R.list;
  ok(L.entries.length === 2, `G. the screen lists ${L.entries.length} replays, not the two runs`);
  // It opens at the top, whatever row was at the top the last time it was open: staged as a new
  // best leaves it -- the row that was first is second now.
  {
    const rows = L.entries.slice();
    tap('Escape');
    L.entries = [rows[1]];
    L.sel = 0;
    tap('KeyR');
    ok(R.mode === 'list' && L.sel === 0 && L.entries.length === 2, `G. the REPLAYS screen opened on row ${L.sel}, not at the top`);
  }
  // The cursor moves over the replays in silence: the user asked for the sound a row made as the
  // cursor passed over it to go (2026-09-29). Down and up again, on the two rows.
  {
    const A = R.audio, made = [];
    const was = A.sfxMenu;
    A.sfxMenu = (kind) => { made.push(kind); return was.call(A, kind); };
    tap('ArrowDown');
    const moved = L.sel === 1;
    tap('ArrowUp');
    A.sfxMenu = was;
    ok(moved && L.sel === 0 && !made.length,
      `G. the cursor over the replays: down to row 1 ${moved}, up to row 0 ${L.sel === 0}, and it made ${made.length ? made.join(' ') : 'no sound'} (it must make none)`);
  }
  // A pad in a browser is not told that BACK imports: a browser opens its file picker only for a
  // key or a click. On the desktop it is.
  {
    const footer = (pad, web) => {
      const probe = Menu.menuProbe(true);
      canvas.getContext('2d').setTransform(C.PX, 0, 0, C.PX, 0, 0);
      Skin.drawReplayList(canvas.getContext('2d'), { entries: [], sel: 0, scroll: 0, note: null, confirm: null, pad, web }, 0);
      Menu.menuProbe(false);
      return probe.filter((e) => e.kind === 'text').map((e) => e.s).join(' | ');
    };
    const webPad = footer(true, true), deskPad = footer(true, false);
    ok(!/BACK IMPORTS/.test(webPad) && /FROM THE KEYBOARD/.test(webPad) && /BACK IMPORTS/.test(deskPad),
      `G. the list's import line for a pad: in a browser "${webPad.split(' | ').pop()}", on the desktop "${deskPad.split(' | ').pop()}"`);
  }
  // A run's time on the list is the scoreboard's, rounded to the second (screens.js fmtTime).
  {
    const bad = [0.4, 24.5, 24.6, 59.5, 119.9].filter((s) => {
      const t = ReplaysMod.listRow({ seconds: s, zone: 1 }).time.split(':');
      const b = Screens.fmtTime(s).match(/^(?:(\d+)M )?(\d+)S$/);
      return !b || +t[0] * 60 + +t[1] !== (+(b[1] || 0)) * 60 + +b[2];
    });
    ok(bad.length === 0, `G. the list's time is not the scoreboard's for runs of ${bad.join(', ')} s`);
  }
  // A replay from another build: this run's, its fingerprint changed and its checksum redone.
  const other = Replay.importReplay(Replay.exportReplay(ghostRun)).replay;
  other.header.constHash = (other.header.constHash ^ 0x5a5a) >>> 0;
  const otherText = Codec.encodeText(other);
  const pasteEvt = (text) => { const e = new Event('paste', { cancelable: true }); e.clipboardData = { getData: () => text }; win.dispatchEvent(e); return e; };
  pasteEvt(otherText);
  ok(L.note && L.note.kind === 'good' && /GHOST ONLY/.test(L.note.text), `G. pasting a replay from another build: ${JSON.stringify(L.note)}`);
  // One of this build's, exported and imported back through the shell.
  const i0 = L.entries.findIndex((e) => e.origin === 'own' && e.rank === 1);
  L.sel = i0;
  tap('KeyE');
  await flush();
  ok(saved && saved.text === Replay.exportReplay(Replay.loadReplay(L.entries[i0].id).replay) && /\.dvreplay$/.test(saved.name),
    `H. E did not export the selected replay's text as a .dvreplay (${saved && saved.name})`);
  fake.opens.push({ ok: true, text: saved.text, name: saved.name });
  tap('KeyI');
  await flush();
  const imp = L.entries.find((e) => e.origin === 'imported' && e.playable);
  ok(!!imp, 'H. I did not import the exported file');
  if (imp) {
    const back = Replay.exportReplay(Replay.loadReplay(imp.id).replay);
    ok(back === saved.text, 'H. export then import did not give back the same bytes');
  }
  L.note = { kind: 'bad', text: 'A NOTE OF A WIDTH NO WARM-UP COULD KNOW' };
  listWords();
  L.note = null;
  // A pin on a run that is neither last nor best? Both own runs are; pin the best.
  L.sel = L.entries.findIndex((e) => e.origin === 'own' && !e.last);
  const pinId = L.entries[L.sel].id;
  tap('KeyP');
  ok(L.entries.find((e) => e.id === pinId).pinned, 'G. P did not pin the replay');
  // The list, as drawn: every row's tag and PLAYABLE / GHOST ONLY where the store says.
  const words = listWords();
  if (SHOTS) shot('replays-screen');
  let wrong = 0;
  L.entries.forEach((e, r) => {
    const y = Skin.LIST.top + r * Skin.LIST.row;
    const row = words.filter((w) => Math.abs(w.b[1] + 0.5 - y) < 0.01).map((w) => w.s);
    const want = e.playable ? 'PLAYABLE' : 'GHOST ONLY';
    if (!row.includes(want) || !row.includes(Skin.tagOf(e)) || !row.includes(String(e.floor))) { wrong++; console.log('       row', r, JSON.stringify(row), 'wants', want, Skin.tagOf(e)); }
  });
  const kinds = new Set(L.entries.map((e) => (e.origin === 'imported' ? (e.playable ? 'imported' : 'ghost-only') : e.last ? 'last' : 'best')));
  ok(wrong === 0 && L.entries.length === 4 && ['imported', 'ghost-only', 'last', 'best'].every((k) => kinds.has(k))
    && L.entries.some((e) => e.pinned && e.origin === 'own'),
  `G. the screen does not list the last run, the best (pinned), an import and a GHOST ONLY import as the store has them (${wrong} rows wrong, kinds ${[...kinds]})`);
  note(`G. the REPLAYS screen: ${L.entries.map((e) => Skin.tagOf(e) + (e.pinned ? '*' : '') + (e.playable ? '' : ' (GHOST ONLY)')).join(', ')}`);

  // Hostile imports, each refused on screen, nothing thrown.
  const hostile = [
    ['garbage', () => pasteEvt('hello, this is not a replay')],
    ['truncated', () => pasteEvt(saved.text.slice(0, Math.floor(saved.text.length / 2)))],
    ['a flipped character', () => pasteEvt(saved.text.slice(0, 40) + (saved.text[40] === 'A' ? 'B' : 'A') + saved.text.slice(41))],
    ['5 MB of text', () => pasteEvt('DVR1:' + 'A'.repeat(5e6))],
    ['an empty clipboard', () => pasteEvt('')],
    ['a shell refusal', async () => { fake.opens.push({ ok: false, error: 'the file could not be read' }); tap('KeyI'); await flush(); }],
    ['a shell that throws', async () => { const o = fake.open; fake.open = async () => { throw new Error('boom'); }; tap('KeyI'); await flush(); fake.open = o; }],
  ];
  let reads = 0;
  const bigFile = { name: 'huge.dvreplay', size: 3e9, text: async () => { reads++; return 'x'; } };
  const badFile = { name: 'bad.dvreplay', size: 10, text: async () => { throw new Error('unreadable'); } };
  const dropEvt = (dt) => { const e = new Event('drop', { cancelable: true }); e.dataTransfer = dt; win.dispatchEvent(e); return e; };
  hostile.push(['a 3 GB file dropped', async () => { dropEvt({ files: [bigFile], getData: () => '' }); await flush(); }]);
  hostile.push(['a file that cannot be read', async () => { dropEvt({ files: [badFile], getData: () => '' }); await flush(); }]);
  let refusals = 0;
  const before = L.entries.length;
  for (const [what, fn] of hostile) {
    L.note = null;
    let threw = null;
    try { await fn(); } catch (e) { threw = e.message; }
    await flush();
    const shown = L.note && L.note.kind === 'bad' && /^NOT IMPORTED/.test(L.note.text);
    if (!threw && shown) refusals++;
    else console.log(`       ${what}: ${threw ? 'threw ' + threw : 'refusal not shown: ' + JSON.stringify(L.note)}`);
    if (what === 'garbage' && SHOTS && shown) { listWords(); shot('import-refused'); }
  }
  ok(refusals === hostile.length, `H. ${hostile.length - refusals} hostile imports were not refused on screen`);
  ok(reads === 0, 'H. a file too big to be a replay was read');
  ok(L.entries.length === before, 'H. a hostile import was kept');
  // A good file dropped on the window: read and kept; the drop not followed.
  const goodFile = { name: 'x.dvreplay', size: saved.text.length, text: async () => saved.text };
  const de = dropEvt({ files: [goodFile], getData: () => '' });
  await flush();
  ok(de.defaultPrevented, 'H. a dropped file was left to the browser, which would open it in place of the game');
  ok(L.entries.length === before + 1 && L.note && L.note.kind === 'good', `H. a dropped replay file was not imported: ${JSON.stringify(L.note)}`);
  note(`H. export then import the same ${saved.text.length} characters; ${refusals} hostile imports refused on screen, nothing thrown, the 3 GB file never read; a dropped file imported`);

  // Delete behind a confirm.
  const n0 = L.entries.length;
  L.sel = L.entries.findIndex((e) => e.origin === 'imported' && e.playable);
  tap('Delete');
  ok(!!L.confirm && L.entries.length === n0, 'G. DELETE did not ask first');
  tap('Escape');
  ok(!L.confirm && L.entries.length === n0 && R.mode === 'list', 'G. ESC at the confirm did not keep the replay');
  tap('Delete');
  tap('Enter');
  ok(L.entries.length === n0 - 1, 'G. confirming did not delete the replay');
  // Watch one from the list and come back; race the GHOST ONLY one.
  const stats0 = statsText(), store0 = storeText();
  L.sel = L.entries.findIndex((e) => e.playable);
  tap('Space');
  ok(R.mode === 'watch' && R.w.from === 'list', 'G. SPACE did not watch the replay');
  steps(240 * 3);
  tap('Escape');
  ok(R.mode === 'list', 'G. ESC from a replay did not come back to the list');
  ok(statsText() === stats0 && storeText() === store0, 'D. watching from the list changed the save file or the store');
  // The longest replay kept, from the list at 4x through its zones: each change of zone finds
  // the next zone's HUD skin painted, a piece a frame from the moment the zone before it came
  // up. A frame is drawn only every 8th here, so the HUD's own warm-up (after WARM_AFTER drawn
  // frames in a zone) never gets there and only the replay's own can keep up.
  {
    const iLong = L.entries.reduce((b, e, k) => (e.playable && (b < 0 || e.floor > L.entries[b].floor) ? k : b), -1);
    L.sel = iLong;
    tap('Space');
    tap('Digit4');
    const late0 = HudSkin.hudSkinStats().lateBuilds;
    const zones = new Set();
    for (let k = 0; R.w && R.w.phase === 'play' && k < 240 * 40; k += 4) {
      steps(4);
      zones.add(R.w.pb.game.theme.name);
      if (k % 32 === 0) render();
    }
    const late = HudSkin.hudSkinStats().lateBuilds - late0;
    ok(zones.size >= 3 && late === 0, `G. the longest replay at 4x painted ${late} pieces of the HUD's skins in its frames, through ${[...zones].join(', ')}`);
    tap('Escape');
    ok(R.mode === 'list', 'G. ESC from the 4x replay did not come back to the list');
    note(`G. the longest replay from the list at 4x, through ${[...zones].join(', ')}: no piece of a HUD skin painted in its frames`);
  }
  // A seek into a zone this session has not drawn -- a friend's replay, or your best from an
  // earlier session: the zone's scene (backdrop layers and ledge furniture, walls, ledges, speed
  // streaks, and its title, its banner being up) is painted before the seek ends, a piece at a
  // time, and none of it in a frame -- not in the seek's, which show the frame before it, and
  // not in the ones it then plays. Measured before: the landing frame painted the backdrop whole
  // (+80 ms headless) and the first played frame built the title whole (+64 ms).
  {
    const iLong = L.entries.reduce((b, e, k) => (e.playable && (b < 0 || e.floor > L.entries[b].floor) ? k : b), -1);
    L.sel = iLong;
    tap('Space');
    const pb = R.w.pb;
    let arrive = -1;
    const z0 = pb.game.themeIndex;
    for (let k = 0; k < 240 * 120 && arrive < 0 && pb.step(); k++) if (pb.game.themeIndex !== z0) arrive = pb.stepIndex;
    // Every zone's scene as a fresh session has it (the HUD's skins are C's and the 4x run's).
    Walls.resetWalls(); Titles.resetZoneTitles(); Streaks.resetStreakCache(); Plat.resetPlatCache(); Decor.resetDecorCache();
    V.renderer.backdrop.cache.clear();
    R.platWarm.clear();
    const late0 = Titles.titleLateBuilds();
    const PAINTERS = /render[\\/](backdrop|walls|streaks|platsprites|zonetitles|decor)\.js|[\\/](bgpaint|wallpaint|titlepaint|decorpaint|platpaint)[\\/]/;
    const made = { seek: 0, play: 0 };
    let phase = null;
    const ce = document.createElement;
    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = 40;
    document.createElement = function (...a) { if (phase && PAINTERS.test(new Error().stack)) made[phase]++; return ce.apply(this, a); };
    R.seekTo((arrive + 90) * STEP);
    let sf = 0;
    // The frame whose onFrame ends the seek draws the landed scene: that one counts as played.
    while (R.w.seek && sf < 2000) { V.loop.onFrame(0); phase = R.w.seek ? 'seek' : 'play'; render(); phase = null; sf++; }
    const g = R.w.pb.game;
    const banner = g.banners.some((b) => b.zone === g.themeIndex);
    phase = 'play';
    for (let k = 0; k < 60; k++) { steps(4); render(); }
    phase = null;
    document.createElement = ce;
    Error.stackTraceLimit = limit;
    const late = Titles.titleLateBuilds() - late0;
    ok(arrive > 0 && banner && sf > 1 && made.seek === 0 && made.play === 0 && late === 0,
      `G. a seek into ${g.theme.name}, which the session had not drawn: ${made.seek} canvas(es) of its scene made in the seek's ${sf} frames, ${made.play} in the 60 it then played, ${late} title(s) built late (its banner up: ${banner})`);
    note(`G. a seek into ${g.theme.name}, a zone the session had not drawn: its scene painted in the seek's ${sf} frames, none of it in a frame drawn`);
    tap('Escape');
  }
  L.sel = L.entries.findIndex((e) => !e.playable);
  tap('Space');
  ok(R.mode === 'list' && L.note && L.note.kind === 'bad', 'G. a GHOST ONLY replay was played');
  tap('KeyR');
  ok(R.asking && R.askInfo().ghostOnly && R.askInfo().from === 'list', 'G. R on a GHOST ONLY replay did not ask first, saying it is GHOST ONLY');
  tap('KeyY');
  ok(game.state === STATE.PLAYING && R.race && game.seed === other.header.seed, 'G. R did not race the GHOST ONLY replay');
  // This build cannot play it, so its tower cannot be surveyed: the race is on the seed alone,
  // at once, and its readout says the ledges may differ.
  ok(R.race && R.race.ghostOnly && !game.tower.course, 'G. the GHOST ONLY replay was raced as if its tower were known');
  steps(240 * 2);
  {
    const probe = Menu.menuProbe(true);
    seedRandom();
    render();
    Menu.menuProbe(false);
    const said = probe.filter((e) => e.kind === 'text').map((e) => e.s);
    ok(said.includes(Skin.LEDGES_NOTE) && said.includes('GHOST'), `G. the GHOST ONLY race's readout does not say the ledges may differ: ${said.join(' | ')}`);
    if (SHOTS) shot('race-ghost-only');
  }
  note('G. delete asks first; a replay watched from the list and back; a GHOST ONLY one refuses to play and races');
  tap('Escape'); tap('KeyQ');
  steps(8);
  ok(game.state === STATE.MENU && R.recDone && R.lastReplay && R.lastReplay.result.ended === 'quit',
    'B. a run left from the pause was not kept as a quit');
}

// A save the storage refuses: said quietly on the board, and play goes on.
{
  // A quota on the replays' keys: what they hold now and a hundred characters more, so the
  // new replay cannot fit and whatever the store lets go for it can be put back. (Counted
  // over the replays' keys alone: the run's stats are saved at the catch, and a quota over
  // everything let them grow past it, which no browser would -- a first cut of this check
  // then failed the put-back, not the store.)
  const set = localStorage.setItem;
  const mine = (k) => String(k).startsWith('dukevytis.replay');
  const total = () => { let n = 0; for (const [k, v] of page.storage) if (mine(k)) n += k.length + v.length; return n; };
  const limit = total() + 100;
  localStorage.setItem = (k, v) => {
    v = String(v);
    if (!mine(k)) return set(k, v);
    const was = page.storage.has(k) ? k.length + page.storage.get(k).length : 0;
    if (total() - was + k.length + v.length > limit) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
    return set(k, v);
  };
  const keep = storeText();
  press1('Space');
  // A run longer than every replay the store may let go for it: a race's replay carries the
  // ghost it raced and the tower it was run on, and the last run here is one -- letting it go
  // made room for a run of three seconds, and the save the storage was to refuse went through.
  const r = playRun({ botFor: 25 });
  localStorage.setItem = set;
  ok(game.state === STATE.DEAD && R.saved === false && R.lastReplay, `H. a save the storage refused: saved ${R.saved}, the run ${game.state}`);
  {
    const a = new Map(JSON.parse(keep)), b = new Map(JSON.parse(storeText()));
    const lost = [...a.keys()].filter((k) => !b.has(k)), changed = [...a.keys()].filter((k) => b.has(k) && a.get(k) !== b.get(k));
    ok(!lost.length && !changed.length && b.size === a.size, `H. a save the storage refused changed the store: lost ${lost.join(', ')}; changed ${changed.join(', ')}; ${a.size} -> ${b.size} keys`
      + (changed.includes('dukevytis.replays.v1') ? ` (index ${a.get('dukevytis.replays.v1').slice(0, 300)} -> ${b.get('dukevytis.replays.v1').slice(0, 300)})` : ''));
  }
  note(`H. the storage refusing the save: the run played to the board (${r.steps} steps) and the board says NOT SAVED; the instant replay still plays from memory`);
  tap('KeyR');
  ok(R.mode === 'watch', 'H. the instant replay of a run that was not kept did not play');
  tap('Escape');
  tap('Escape');
}

// =============================================================================================
// K. Found by the verifier (2026-09-28): a file dropped over a run that a menu hides; the
//    guide in front of a first race; a browser's file picker that never answers; the music
//    after a replay watched from the list over the scoreboard.
// =============================================================================================
{
  const L = R.list;
  const good = saved.text;
  const dropFile = () => {
    const e = new Event('drop', { cancelable: true });
    e.dataTransfer = { files: [{ name: 'k.dvreplay', size: good.length, text: async () => good }], getData: () => '' };
    win.dispatchEvent(e);
  };
  ok(game.state === STATE.MENU && R.mode === null, 'K. not on the title');

  // A drop on the options screen opened mid-climb (O), and on the pause's stats pages: the run
  // is still on under them. It used to open the REPLAYS screen over the live run.
  press1('Space');
  steps(240);
  const n0 = Replay.listReplays().length;
  tap('KeyO');
  const onOptions = game.state === STATE.OPTIONS;
  dropFile(); await flush();
  const overOptions = R.mode;
  tap('Escape');
  tap('KeyP'); tap('KeyS');
  const onStats = game.state === STATE.STATS;
  dropFile(); await flush();
  const overStats = R.mode;
  ok(onOptions && onStats && overOptions === null && overStats === null && Replay.listReplays().length === n0,
    `K. a file dropped over a run under the options (${overOptions}) or the pause's stats (${overStats}) opened the REPLAYS screen`);
  tap('Escape'); tap('KeyQ');
  steps(8);
  ok(game.state === STATE.MENU, 'K. the run was not left for the title');

  // A first race, with the guide never seen: the guide, then the race -- on the replay's seed,
  // its ghost up.
  const S = R.d.settings();
  S.guideSeen = false;
  // ...and at the player's own options (N on the race's question), put off the run's: its
  // JUMP SPEED and DIFFICULTY the player's, its PLATFORMS the run's all the same (its tower).
  const keepK = { jumpSpeed: S.jumpSpeed, difficulty: S.difficulty, platforms: S.platforms, gravity: S.gravity };
  S.jumpSpeed = 1.4;
  S.difficulty = 2;
  S.platforms = 1.175;
  S.gravity = 1.1;
  tap('KeyR');
  L.sel = L.entries.findIndex((e) => e.origin === 'own');
  const want = L.entries[L.sel];
  const wantH = Replay.loadReplay(want.id).replay.header;
  tap('KeyR');
  const askedK = R.asking;
  tap('KeyN');
  raceFrames();
  const inGuide = game.state === STATE.TUTORIAL;
  tap('Escape');
  ok(inGuide && game.state === STATE.PLAYING && !!R.race && game.seed === want.seed && S.guideSeen,
    `K. a first race behind the guide: guide ${inGuide}, then ${game.state}, race ${!!R.race}, seed ${game.seed} for ${want.seed}`);
  ok(askedK && game.jumpSpeed === 1.4 && game.difficulty === 2 && game.gravity === 1.1 && game.platforms === (wantH.platforms || 1),
    `K. MY OPTIONS did not race at the player's JUMP SPEED, DIFFICULTY and GRAVITY on the run's PLATFORMS: ${game.jumpSpeed}, ${game.difficulty}, ${game.gravity}, ${game.platforms} (the run's ${wantH.platforms}; asked ${askedK})`);
  Object.assign(S, keepK);
  tap('Escape'); tap('KeyQ');
  steps(8);

  // A browser's picker that never answers (closed where there is no 'cancel' event, or never
  // opened, asked for from a pad): the screen goes on answering its keys.
  const keepFiles = R.files;
  R.files = { kind: 'web', save: async () => ({ ok: true }), open: () => new Promise(() => {}) };
  tap('KeyR');
  tap('KeyI');
  const s0 = L.sel;
  tap('ArrowDown');
  ok(R.mode === 'list' && !R.busy && L.sel !== s0, `K. a file picker that never answered held the REPLAYS screen (busy ${R.busy}, row ${s0} -> ${L.sel})`);
  tap('Escape');
  R.files = keepFiles;

  // The list opened over the scoreboard by a drop: a replay watched from it, and back on the
  // scoreboard the board's music, not the title's.
  press1('Space');
  playRun({ botFor: 3 });
  ok(game.state === STATE.DEAD, 'K. the short run did not reach the scoreboard');
  dropFile(); await flush();
  ok(R.mode === 'list', 'K. a file dropped on the scoreboard did not open the REPLAYS screen');
  L.sel = L.entries.findIndex((e) => e.playable);
  tap('Space');
  steps(240);
  const m0 = music.length;
  tap('Escape');
  const back = music.slice(m0).map(([m, a]) => m + (a ? ':' + a : ''));
  ok(R.mode === 'list' && back[back.length - 1] === 'crossTo:gameover', `K. leaving a replay watched over the scoreboard put on ${back[back.length - 1]}`);
  tap('Escape');
  ok(R.mode === null && game.state === STATE.DEAD, 'K. ESC from the list did not go back to the scoreboard');
  tap('Escape');
  note('K. a drop over a run under the options or the stats is ignored; a first race runs after the guide on its seed; a picker that never answers holds nothing; the board\'s music after a replay watched over it');
}

// =============================================================================================
// I. The keyboard alone and the pad alone each reach every action.
// =============================================================================================
/**
 * The walk, the same for both devices: every action the replays offer, from the title and
 * back to it, with nothing but presses of `dev` -- the rows picked with up and down too, not
 * set by the test. A walk that loses its way stops there, and what it did not reach is the
 * finding.
 */
async function walk(dev) {
  const reached = new Set();
  const hit = (name, c) => { if (c) reached.add(name); return c; };
  const L = R.list;
  /** Press down until the selected row is one `pred` wants; false if no row is. */
  const pick = (pred) => {
    for (let i = 0; i <= L.entries.length; i++) {
      if (L.entries[L.sel] && pred(L.entries[L.sel])) return true;
      dev.press('down');
    }
    return false;
  };
  try {
    hit('title', game.state === STATE.MENU);
    dev.press('open');
    hit('replays', R.mode === 'list');
    ok(V.input.lastDevice === dev.device, `I. the ${dev.name} was not taken as the device`);
    const s0 = L.sel;
    dev.press('down');
    hit('select', L.sel !== s0);
    const e = L.entries[L.sel];
    dev.press('pin');
    hit('pin', L.entries.find((x) => x.id === e.id).pinned !== e.pinned);
    dev.press('pin');
    saved = null;
    dev.press('export');
    await flush();
    hit('export', !!saved);
    fake.opens.push({ ok: true, text: saved ? saved.text : '' });
    const n0 = L.entries.length;
    dev.press('import');
    await flush();
    hit('import', L.entries.length === n0 + 1);
    pick((x) => x.origin === 'imported' && x.playable && x.pinned);
    dev.press('delete');
    hit('delete-ask', !!L.confirm);
    dev.press('confirm');
    hit('delete', L.entries.length === n0);
    pick((x) => x.playable);
    dev.press('watch');
    hit('watch', R.mode === 'watch');
    frameOnce();
    const i0 = R.w.pb.stepIndex + C.REPLAY_SKIP / STEP;
    dev.press('forward');
    while (R.w.seek) frameOnce();
    hit('forward', R.w.pb.stepIndex >= i0);
    const i1 = R.w.pb.stepIndex;
    dev.press('back');
    while (R.w.seek) frameOnce();
    hit('back', R.w.pb.stepIndex < i1);
    dev.press('faster');
    hit('faster', C.REPLAY_SPEEDS[R.w.speed] > 1);
    dev.press('slower'); dev.press('slower');
    hit('slower', C.REPLAY_SPEEDS[R.w.speed] < 1);
    dev.press('pause');
    hit('pause', R.w.paused);
    if (SHOTS && dev.device === 'pad') { seedRandom(); render(); shot('overlay-paused-pad'); }
    dev.press('pause');
    hit('play', !R.w.paused);
    dev.press('leave');
    hit('leave', R.mode === 'list');
    pick((x) => x.origin === 'own' && x.rank === 1);
    dev.press('race');
    hit('race-ask', R.asking);
    dev.press('same');
    raceFrames();
    hit('race', game.state === STATE.PLAYING && !!R.race);
    const r = playRun({ botFor: 6, usePad: dev.device === 'pad' });
    hit('run-kept', game.state === STATE.DEAD && R.saved === true && r.catchStep > 0);
    dev.press('instant');
    // At the run's start: the press ran a frame or two (4 steps each) since it opened.
    hit('instant', R.mode === 'watch' && R.w.from === 'board' && R.w.pb.stepIndex <= 8);
    while (R.w && R.w.seek) frameOnce();
    let n = 0;
    while (R.w.phase !== 'end' && n++ < 240 * 60) steps(1);
    dev.press('whole');
    hit('whole-run', R.w && R.w.phase === 'play' && R.w.pb.stepIndex <= 8);
    dev.press('leave');
    hit('board', R.mode === null && game.state === STATE.DEAD);
    dev.press('raceBest');
    hit('race-best-ask', R.asking && game.state === STATE.DEAD);
    dev.press('mine');
    raceFrames();
    hit('race-best', game.state === STATE.PLAYING && !!R.race);
    dev.press('pauseRun');
    dev.press('quitRun');
    steps(8);
    hit('quit-kept', game.state === STATE.MENU && R.lastReplay && R.lastReplay.result.ended === 'quit');
    dev.press('open');
    dev.press('leave');
    hit('to-title', R.mode === null && game.state === STATE.MENU);
  } catch (err) { console.log(`       the ${dev.name} walk stopped: ${err.message}`); }
  return reached;
}
{
  const WANT = ['title', 'replays', 'select', 'pin', 'export', 'import', 'delete-ask', 'delete', 'watch', 'forward', 'back',
    'faster', 'slower', 'pause', 'play', 'leave', 'race-ask', 'race', 'run-kept', 'instant', 'whole-run', 'board', 'race-best-ask', 'race-best',
    'quit-kept', 'to-title'];
  const KEYS = {
    open: 'KeyR', down: 'ArrowDown', pin: 'KeyP', export: 'KeyE', import: 'KeyI', delete: 'Delete', confirm: 'Enter',
    watch: 'Space', forward: 'ArrowRight', back: 'ArrowLeft', faster: 'ArrowUp', slower: 'ArrowDown', pause: 'Space',
    leave: 'Escape', race: 'KeyR', instant: 'KeyR', whole: 'Space', raceBest: 'KeyG', pauseRun: 'Escape', quitRun: 'KeyQ',
    same: 'KeyY', mine: 'KeyN',
  };
  const PAD = {
    open: BTN.RB, down: BTN.DOWN, pin: BTN.Y, export: BTN.RB, import: BTN.BACK, delete: BTN.LB, confirm: BTN.A,
    watch: BTN.A, forward: BTN.RB, back: BTN.LB, faster: BTN.UP, slower: BTN.DOWN, pause: BTN.A,
    leave: BTN.B, race: BTN.X, instant: BTN.RB, whole: BTN.A, raceBest: BTN.LB, pauseRun: BTN.START, quitRun: BTN.X,
    same: BTN.A, mine: BTN.X,
  };
  const keyboard = { name: 'keyboard', device: 'keys', press: (a) => { page.pads = []; tap(KEYS[a]); } };
  const gamepad = { name: 'pad', device: 'pad', press: (a) => padTap(PAD[a]) };
  const byKeys = await walk(keyboard);
  const byPad = await walk(gamepad);
  for (const [dev, reached] of [['keyboard', byKeys], ['pad', byPad]]) {
    const missed = WANT.filter((w) => !reached.has(w));
    ok(missed.length === 0, `I. the ${dev} alone did not reach: ${missed.join(', ')}`);
  }
  // Every action the screens offer is named in their hints, for both devices.
  const keysL = Skin.listHints({ playable: true, pinned: false }, false).map((h) => h[1]);
  const padL = Skin.listHints({ playable: true, pinned: false }, true).map((h) => h[1]);
  const keysO = Skin.overlayHints({ paused: false, pad: false }).map((h) => h[1]);
  const padO = Skin.overlayHints({ paused: false, pad: true }).map((h) => h[1]);
  const askH = (same, pad) => Skin.askHints({ rows: [{ same }] }, pad).map((h) => h[1]);
  ok(['WATCH', 'RACE', 'PIN', 'DELETE', 'EXPORT', 'BACK'].every((w) => keysL.includes(w) && padL.includes(w)) && keysL.includes('IMPORT')
    && ['PAUSE', '5S', 'SPEED', 'LEAVE'].every((w) => keysO.includes(w) && padO.includes(w))
    && [false, true].every((pad) => ['SAME OPTIONS', 'MY OPTIONS', 'BACK'].every((w) => askH(false, pad).includes(w))
      && ['RACE', 'BACK'].every((w) => askH(true, pad).includes(w))),
  'I. a hint is missing from the replays screen, the overlay or the race\'s question');
  note(`I. the keyboard alone and the pad alone each reached all ${WANT.length} actions: ${WANT.join(', ')}`);
  V.input.lastDevice = 'keys';
  page.pads = [];
}

// =============================================================================================
// Nothing covers the overlay's words: every letter over the moving replay on a plate.
// =============================================================================================
{
  tap('KeyR');
  const L = R.list;
  // The list for both devices, with its confirm up, painted nothing late either.
  for (const pad of [false, true]) {
    V.input.lastDevice = pad ? 'pad' : 'keys';
    render();
    L.confirm = { e: L.entries[0], kind: 'delete' };
    render();
    L.confirm = null;
    // The race's question, over the list: a row the player's settings differ in, and none.
    const S = R.d.settings(), js = S.jumpSpeed;
    for (const speed of [js, js === 1 ? 1.1 : 1]) {
      S.jumpSpeed = speed;
      R.ask = { replay: Replay.loadReplay(L.entries[0].id).replay, compatible: true, state: game.state, mode: R.mode };
      render();
      R.ask = null;
    }
    S.jumpSpeed = js;
  }
  V.input.lastDevice = 'keys';
  L.sel = L.entries.findIndex((x) => x.playable);
  tap('Space');
  steps(240);
  const probe = Menu.menuProbe(true);
  render();
  Menu.menuProbe(false);
  const plates = probe.filter((e) => e.kind === 'plate');
  const words = probe.filter((e) => e.kind === 'text' || e.kind === 'line' || e.kind === 'keycap');
  const inside = (w) => plates.some((p) => w.b[0] >= p.b[0] && w.b[1] >= p.b[1] && w.b[2] <= p.b[2] && w.b[3] <= p.b[3]);
  const off = words.filter((w) => !inside(w));
  const lateMenu = Menu.menuStats().late;
  for (const pad of [false, true]) {
    V.input.lastDevice = pad ? 'pad' : 'keys';
    R.w.phase = 'end';
    render();
    R.w.phase = 'play';
    L.confirm = null;
  }
  V.input.lastDevice = 'keys';
  ok(Menu.menuStats().late === 0, `the replays' screens painted ${Menu.menuStats().late} pieces late (not on the title screen's warm-up list)`);
  void lateMenu;
  ok(words.length > 10 && off.length === 0, `the overlay has ${off.length} of ${words.length} words off its plate: ${off.map((w) => w.s).slice(0, 4).join(', ')}`);
  const O = Skin.OVERLAY;
  ok(O.y + O.h < 36 && O.x >= 100 && O.x + O.w <= 365, 'the overlay reaches past the HUD\'s free top row');
  // A score of nine and ten digits: the plate stands clear of it and of FLOOR.
  const pg = R.w.pb.game, keepScore = pg.score;
  let clash = [];
  for (const score of [987654321, 9876543210]) {
    pg.score = score;
    const pr = Menu.menuProbe(true);
    render();
    Menu.menuProbe(false);
    const plate = pr.filter((e) => e.kind === 'plate' && e.b[2] - e.b[0] === Skin.OVERLAY.w)[0];
    // The HUD's words and gauges round the top, keylines included, as hud.js lays them out:
    // the score and its RECORD line, FLOOR with a five-digit floor, SPEED, its bar and MAX,
    // AIR JUMP READY and the chain.
    const score0 = 461 - Font.textWidth(String(score), 2) - 2;
    const rec0 = 461 - Font.textWidth('RECORD ' + score, 1) - 1;
    const boxes = [[score0, 3, 464, 29], [rec0, 28, 464, 39], [17, 3, 84, 30], [17, 30, 50, 41], [17, 39, 118, 48], [17, 48, 106, 68]];
    const hit = (b, [x0, y0, x1, y1]) => b[0] < x1 && b[2] > x0 && b[1] < y1 && b[3] > y0;
    const hits = plate ? boxes.filter((bx) => hit(plate.b, bx)) : [];
    if (!plate || hits.length) clash.push(`${score}: plate ${plate && plate.b.join(',')} over ${JSON.stringify(hits)}`);
  }
  pg.score = keepScore;
  ok(!clash.length, `the overlay covers the HUD's score or floor: ${clash.join('; ')}`);
  note(`the overlay's ${words.length} words all on its plate, in the top row the HUD leaves free (${O.x}..${O.x + O.w}, ${O.y}..${O.y + O.h}), moving left of a score of nine or ten digits`);
  tap('Escape'); tap('Escape');
}

// =============================================================================================
// J. The desktop bridge: two functions; the shell's handlers.
// =============================================================================================
{
  const exposed = {};
  const invoked = [];
  const fakeElectron = {
    contextBridge: { exposeInMainWorld: (k, v) => { exposed[k] = v; } },
    ipcRenderer: { on() {}, send() {}, invoke: (...a) => { invoked.push(a); return Promise.resolve({ ok: true }); } },
  };
  const load = Module._load;
  Module._load = function (req, ...rest) { return req === 'electron' ? fakeElectron : load.call(this, req, ...rest); };
  const require = Module.createRequire(import.meta.url);
  try { require(path.join(ROOT, 'electron', 'preload.cjs')); } finally { Module._load = load; }
  const rf = exposed.replayFiles;
  ok(rf && Object.keys(rf).sort().join() === 'open,save' && Object.keys(exposed.gameShell || {}).sort().join() === 'isFullscreen,quit,toggleFullscreen',
    `J. the bridge exposes ${JSON.stringify(Object.fromEntries(Object.entries(exposed).map(([k, v]) => [k, Object.keys(v)])))}`);
  if (rf) { await rf.save('a.dvreplay', 'DVR1:x'); await rf.open(); }
  ok(invoked.length === 2 && invoked[0][0] === 'replay:save' && invoked[1][0] === 'replay:open', 'J. the bridge does not ask the shell by the two channels');

  const Shell = await import(u('electron/replayfiles.js'));
  const handlers = {};
  const written = [];
  const win2 = { isDestroyed: () => false, webContents: {} };
  let dialogAns = { canceled: false, filePath: 'C:/x/out.dvreplay', filePaths: ['C:/x/in.dvreplay'] };
  let size = 100;
  Shell.registerReplayFiles({
    ipcMain: { handle: (ch, f) => { handlers[ch] = f; } },
    dialog: { showSaveDialog: async (w, o) => ({ ...dialogAns, opts: o }), showOpenDialog: async () => dialogAns },
    fs: { writeFile: async (p, t) => { written.push([p, t]); }, stat: async () => ({ isFile: () => true, size }), readFile: async () => 'DVR1:abc' },
    path, app: { getPath: () => 'C:/docs' }, getWindow: () => win2,
  });
  const me = { sender: win2.webContents };
  const r1 = await handlers['replay:save'](me, '../../evil\\name', 'DVR1:abc');
  const r2 = await handlers['replay:save']({ sender: {} }, 'a', 'DVR1:abc');
  const r3 = await handlers['replay:save'](me, 'a', 'x'.repeat(C.REPLAY_MAX_TEXT + 1));
  const r4 = await handlers['replay:open'](me);
  size = C.REPLAY_MAX_TEXT + 1;
  const r5 = await handlers['replay:open'](me);
  dialogAns = { canceled: true };
  const r6 = await handlers['replay:open'](me);
  ok(r1.ok && written.length >= 1 && written[0][1] === 'DVR1:abc' && Shell.safeName('../../evil\\name') === 'evilname.dvreplay',
    `J. the shell did not write the chosen file (${JSON.stringify(r1)}, ${Shell.safeName('../../evil\\name')})`);
  ok(!r2.ok && !r3.ok && written.length === 1, 'J. the shell answered another window, or wrote a text too long to be a replay');
  ok(r4.ok && r4.text === 'DVR1:abc' && r4.name === 'in.dvreplay' && !r5.ok && /too big/.test(r5.error) && r6.canceled,
    `J. the shell's open: ${JSON.stringify([r4, r5, r6])}`);
  // The web's own: a download and a picker, over a fake document.
  const made = [];
  const doc = {
    body: { appendChild(e) { made.push(e); } },
    createElement: (t) => {
      const el = { tag: t, style: {}, remove() {}, click() { el.clicked = true; if (t === 'input') setImmediate(() => { el.files = [{ size: 5, name: 'f.dvreplay', text: async () => 'DVR1:q' }]; el.fire('change'); }); },
        listeners: {}, addEventListener(ev, f) { el.listeners[ev] = f; }, fire(ev) { el.listeners[ev] && el.listeners[ev](); } };
      return el;
    },
  };
  const web = Files.replayFiles({ setTimeout: (f) => f() }, doc);
  const w1 = await web.save('r.dvreplay', 'DVR1:zz');
  const a = made.find((e) => e.tag === 'a');
  const w2 = await web.open();
  ok(web.kind === 'web' && w1.ok && a && a.clicked && a.download === 'r.dvreplay' && w2.ok && w2.text === 'DVR1:q',
    `J. the web's download and picker: ${JSON.stringify([w1, w2])}`);
  // No key press or click in hand (a pad's button): no browser opens its picker then, so none
  // is asked for, and the refusal says why at once. With one in hand, the picker opens.
  const made0 = made.length;
  const noPress = await Files.replayFiles({ setTimeout: (f) => f(), navigator: { userActivation: { isActive: false } } }, doc).open();
  const madeNo = made.length - made0;
  const withPress = await Files.replayFiles({ setTimeout: (f) => f(), navigator: { userActivation: { isActive: true } } }, doc).open();
  ok(!noPress.ok && noPress.error === Files.NO_PICKER && madeNo === 0 && withPress.ok,
    `J. the web's picker with no key press in hand: ${JSON.stringify(noPress)}, ${madeNo} element(s) made; with one: ${JSON.stringify(withPress)}`);
  note('J. the preload exposes replayFiles.save and .open and nothing else; the shell writes only the chosen file, refuses another window, a long text and a big file; the web downloads and picks');
}

console.log(`\n  ${bad ? bad + ' FAILED' : 'all passed'} (${((performance.now() - T0) / 1000).toFixed(1)} s)`);
cleanup();
process.exit(bad ? 1 : 0);
