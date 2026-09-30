// JUMP SPEED and LOW LATENCY: the two options a player tries by feel, held to what they promise.
// (docs/GAMEPLAY.md "JUMP SPEED", docs/ARCHITECTURE.md "LOW LATENCY".)
//
// JUMP SPEED s runs the Duke's own physics clock s times as fast (Player.step's `h`):
//   1. THE SAME ARCS, IN 1/s OF THE TIME. A standing jump, a flat-out jump with its wall
//      bounces, a combo-driven wall bounce set up in mid-air and a walk off a ledge, each
//      scripted by his STATE (where he is, which way he is going), never by the clock, flown
//      at 100% and at every other speed the menu offers: every point of each faster path within
//      ARC_TOL of the 100% path (both ways), each apex within APEX_TOL, the same events in the
//      same order (takeoff, bounces, landing) with the bounces' speeds within 1%, and each flight
//      over in 1/s of the steps (within two). A run-up from rest fills the momentum meter in
//      1/s of the time over the same distance run.
//   2. THE WINDOWS FOR A PLAYER'S HANDS STAY IN SECONDS: coyote time (the latest jump after
//      walking off a ledge that still takes, in steps of the world's clock), the combo's
//      ground grace (steps from landing to the chain's end) and the jump buffer (the dt the
//      game hands the input to count it down) are the same at every speed.
//   3. WHAT FOLLOWS HIS CLOCK: the camera's lag behind him at each height of a jump (it frames
//      him in space as at 100%), the companions' forecast of his landing (in the world's
//      seconds), the fall taking over his REAL speed at the catch, the combo trail's pieces per
//      second of his clock, and the afterimage's measure of his speed (in his units).
//   4. THE REACH PROOF: the weakest jump there is -- standing, no momentum, steering flat out
//      -- covers the same ground one floor up at every speed, more than the generator allows
//      a gap (reach.js MAX_EDGE_GAP) plus his width, and a standing jump still clears two floors.
//   5. A REPLAY at 120%: a bot run recorded, exported, imported, stored and listed at 120%,
//      compatible, and played back identically every step it climbed -- and the same file
//      played at 100% is NOT that run, so it is the header's speed that plays it. A file
//      carrying a speed this build does not offer is refused, with a sentence.
// LOW LATENCY:
//   6. The screen's context made with { desynchronized: true } when ON and without it when
//      OFF; ON, every frame drawn into a back buffer and put on the screen whole by present()
//      (a desynchronized canvas can be shown half drawn: the menu blinked out, 2026-09-29), OFF
//      drawn on the screen itself, present() doing nothing; and when
//      OFF (getContext records its options), and turning it over puts a NEW canvas where the
//      old one stood -- same id, the renderer drawing into it -- with the hint or without.
// main.js booted for real (fakepage.mjs), JUMP SPEED 130%, LOW LATENCY and GRAVITY HIGH saved:
//   7. The screen boots with the hint; the attract demo runs at the game's defaults
//      (settings.js DEFAULTS: JUMP SPEED, PLATFORMS, DIFFICULTY, GRAVITY -- autoplay.js
//      startDemo), whatever is saved, on the real tower under the real fire; the OPTIONS rows change
//      both from the keyboard (LOW LATENCY at once, onto a new canvas); a run then starts at
//      the new speed and its recording says so; a race runs at the racer's speed. The run is on
//      the saved PLATFORMS (NORMAL, the default) and a race on its ghost's (1); the run at the
//      saved GRAVITY (HIGH) and a race at its ghost's (1).
// PLATFORMS (settings.js PLATFORM_WIDTHS), the width of every ledge:
//   8. The menu offers NORMAL 0.875 and WIDE 1.175, NORMAL by default (the user's, 2026-09-29),
//      and a width an older build saved loads as the one of its name (SMALL and MEDIUM as NORMAL,
//      the old WIDE as WIDE). A width of 1 is the tower with no width said, floor for floor;
//      NORMAL and WIDE are it scaled, their median ledge 0.875 and 1.175 of its, each at its own
//      minimum in the opening shaft and every floor reachable. A replay at NORMAL records,
//      exports, imports and plays back identically, and read at 1 is not that run; 1 writes the
//      header byte it always did; every width a run has been climbed on has a code of its own and
//      reads back as itself (a file on the old SMALL still reads); a width no build offered is
//      refused. A race on a NORMAL ghost's course is NORMAL, on through the course's top, and its
//      file says so.
// DIFFICULTY (constants.js DIFFICULTIES), the fire:
//   9. EASY is the fire with no difficulty said, to the bit; MEDIUM and HARD rise 1.35 and 1.75
//      times as fast and trail 0.7 and 0.5 as far. A replay at HARD records, exports, imports
//      and plays back identically, and read as EASY is not that run; EASY writes the flags byte
//      it always did; a difficulty this build does not offer is refused. In 7, the run is at the
//      saved DIFFICULTY (MEDIUM, the default) and a race at its ghost's (EASY).
// THE DEFAULT'S MOVES (settings.js SPEED_V): to 140% on 2026-09-28, when the user asked for
// more speed, and back to 120% on 2026-09-29, when the user set the defaults to 120% jump
// speed with NORMAL ledges and NORMAL gravity:
//  10. The menu offers 100% to 140% and defaults to 120%; a 140% saved since the first move --
//      that move's default -- is moved back to 120% once and saved so; a 140% chosen after that
//      stays, and so does one saved before the first move (a choice then); any other saved
//      speed stays; settings never saved start at 120%.
// GRAVITY (settings.js GRAVITIES), how heavy he is, 2026-09-29: the user asked for gravity as
// an option; then for a lighter NORMAL, between the old one and LOW, and a gentler HIGH, since
// the first was too rough:
//  11. The menu offers LOW 0.8, NORMAL 0.9 and HIGH 1.1, NORMAL by default, the row right after
//      DIFFICULTY; a gravity an older build saved loads as the one of its name (1 as NORMAL, 1.2
//      as HIGH), one never offered as NORMAL. A run that says none is at 1 (CLASSIC), to the bit
//      (a bot run step for step), and 1 is the game as tuned (his gravity and fall's cap are
//      GRAVITY and TERMINAL, a standing jump flown step for step as those numbers say). Every
//      offered gravity scales a standing jump's height by 1/g within 1% (and its time up with
//      it); his fall's cap goes with the root of g. The weakest jump still clears the
//      generator's gap plus his width one floor up at every gravity and speed. What forecasts his
//      flight falls by his gravity: the attract bot lands where it planned as often at every
//      offered gravity as at 1, and the companions' forecast of his landing and of his speed are
//      his. A replay at HIGH records, exports, imports, is stored, listed and plays back
//      identically, and read at NORMAL is not that run; a gravity but 1 is format 3 (a race's, 4)
//      with its code in a byte of its own -- NORMAL's too -- 1 writes the layout every replay had
//      before, and that old layout reads as 1; every gravity a run has been climbed at reads
//      back as itself; one no build offered is refused, and so is a bit it does not know. The
//      stats' run history keeps it; the scoreboard names every gravity but NORMAL -- the old
//      ones a race on an old ghost can be at too -- in sixteen letters.
//
// Every check was seen to fail on a broken build:
//   node tools/test-feel.mjs                  the checks, about 10 s
//   node tools/test-feel.mjs --mutant=NAME    against a copy of src/ with MUTANTS[NAME]; must FAIL
//   node tools/test-feel.mjs --mutants        every mutant in turn, one process each

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { installPage, bootMain, frame, key } from './fakepage.mjs';
import { HeadlessCanvas } from './headless.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const argv = process.argv.slice(2);
const MUTANT = (argv.find((a) => a.startsWith('--mutant=')) || '').slice('--mutant='.length) || null;

// ---- mutants: [file under src/, from, to] -----------------------------------------------
// The comment on each names the check that caught it when this was written.
const MUTANTS = {
  // 1: every flight takes as many steps as at 100%
  'no-his-clock': [['game/player.js', 'const h = dt * this.rate;', 'const h = dt;']],
  // 1: the apexes are 10-30% higher, the arcs far apart
  'gravity-on-world-clock': [['game/player.js', 'this.vy -= gravityOf(this) * h;', 'this.vy -= gravityOf(this) * dt;']],
  // 1: the run-up's momentum fills on the world's clock
  'momentum-on-world-clock': [['game/player.js', 'this.momentum = Math.min(1, this.momentum + MOM_UP * k * h);', 'this.momentum = Math.min(1, this.momentum + MOM_UP * k * dt);']],
  // 2: the latest coyote jump comes steps sooner at a higher speed
  'coyote-on-his-clock': [['game/player.js', 'if (this.coyote > 0) this.coyote -= dt;', 'if (this.coyote > 0) this.coyote -= dt * this.rate;']],
  // 2: the combo ends steps sooner at a higher speed
  'grace-on-his-clock': [['game/game.js', 'const ended = this.combo.onGrounded(dt, COMBO_GROUND_GRACE);', 'const ended = this.combo.onGrounded(dt * this.player.rate, COMBO_GROUND_GRACE);']],
  // 3: the camera's lag behind him grows with the speed
  'camera-on-world-clock': [['game/game.js', 'Math.min(1, CAM_LERP * dt * p.rate)', 'Math.min(1, CAM_LERP * dt)']],
  // 3: the forecast of his landing is in his seconds, not the world's
  'forecast-in-his-seconds': [['game/companions.js', 'return { t: t / k, y: P.y, x };', 'return { t, y: P.y, x };']],
  // 3: the fall starts at his clock's speed, slower than he was moving
  'fall-in-his-units': [['game/game.js', '    this.player.vy *= this.player.rate;\n', '']],
  // 3: the fire's grab in his units, as it was: a man caught standing at 130% yanked at 312
  'grab-in-his-units': [['game/game.js', 'p.vy = Math.min(p.vy, -FLOOR_GRAB / p.rate);', 'p.vy = Math.min(p.vy, -FLOOR_GRAB);']],
  // 3: the trail sheds per second of the world's clock
  'trail-on-world-clock': [['render/particles.js', 'this.shedAcc += rate * dt * k;', 'this.shedAcc += rate * dt;']],
  // 3: the afterimage measures his speed on the world's clock
  'afterimage-on-world-clock': [['render/renderer.js', 'ai.record(this.t * rate,', 'ai.record(this.t,']],
  // 5: the playback at 120% is not the run
  'playback-at-100': [['game/replay.js', 'g.newRun(h.seed, this.replay.race ? this.replay.race.course : null, h.jumpSpeed, h.platforms, h.difficulty, h.gravity);', 'g.newRun(h.seed, this.replay.race ? this.replay.race.course : null, 1, h.platforms, h.difficulty, h.gravity);']],
  // 5: the file forgets the speed on the way in
  'decoder-drops-speed': [['game/replaycodec.js', 'header.jumpSpeed = speed;', 'header.jumpSpeed = 1;']],
  // 5: the file forgets it on the way out
  'encoder-drops-speed': [['game/replaycodec.js', 'w.u8((h.demo ? 1 : 0) | (sc << 1) | (dc << 5));', 'w.u8((h.demo ? 1 : 0) | (dc << 5));']],
  // 5: the store's list says 100% for it
  'list-drops-speed': [['game/replaystore.js', 'fp: fpText(h), speed: h.jumpSpeed || 1,', 'fp: fpText(h),']],
  // 6: ON, the frame drawn straight onto the screen's desynchronized canvas again
  'no-back-buffer': [['render/renderer.js', '    this.ctx = on ? this.backBuffer() : ctx;', '    this.ctx = ctx;']],
  // 6: ON, the back buffer never put on the screen
  'no-present': [['render/renderer.js', '    s.drawImage(this.back, 0, 0);', '']],
  // 6 and 7: never the hint
  'never-low-latency': [['render/renderer.js', "lowLatency ? { alpha: false, desynchronized: true } : { alpha: false }", '{ alpha: false }']],
  // 6 and 7: the option changes nothing until the next launch
  'no-canvas-swap': [['render/renderer.js', '    if (on === this.lowLatency) return;\n', '    if (on === this.lowLatency || true) return;\n']],
  // 7: the demo at the player's speed
  'demo-at-setting': [['game/autoplay.js', "import { DEFAULTS } from './settings.js';", "import { DEFAULTS, load } from './settings.js';"],
    ['game/autoplay.js', 'jumpSpeed: DEFAULTS.jumpSpeed, platforms: DEFAULTS.platforms,', 'jumpSpeed: load().jumpSpeed, platforms: DEFAULTS.platforms,']],
  // 7: the demo on the ramp it had until 2026-09-29, not a player's tower
  'demo-on-flow-tower': [['game/game.js', 'new CourseTower(this.seed, course) : new Tower(this.seed, false, width);', 'new CourseTower(this.seed, course) : new Tower(this.seed, !!this.demo, width);']],
  // 7: the demo under a fire of its own, slower than its difficulty's
  'demo-slow-fire': [['game/game.js', '    return base * DIFFICULTIES[this.difficulty || 0].rise * this.idleUrgency();', '    if (this.demo) return base * 0.55 * this.idleUrgency();\n    return base * DIFFICULTIES[this.difficulty || 0].rise * this.idleUrgency();']],
  // 7: a run at 100% whatever the setting
  'run-ignores-setting': [['main.js', 'game.newRun(race ? race.seed : undefined, race ? race.course || null : null, jumpSpeed, platforms, difficulty, gravity);', 'game.newRun(race ? race.seed : undefined, race ? race.course || null : null, 1, platforms, difficulty, gravity);']],
  // 7: a race at the ghost's speed
  'race-at-ghost-speed': [['main.js', 'const jumpSpeed = theirs ? h.jumpSpeed || 1 : settings.jumpSpeed;', 'const jumpSpeed = h ? h.jumpSpeed || 1 : settings.jumpSpeed;']],
  // 7: a run on MEDIUM whatever the setting
  'run-ignores-platforms': [['main.js', 'game.newRun(race ? race.seed : undefined, race ? race.course || null : null, jumpSpeed, platforms, difficulty, gravity);', 'game.newRun(race ? race.seed : undefined, race ? race.course || null : null, jumpSpeed, 1, difficulty, gravity);']],
  // 7: a race on the racer's own PLATFORMS, not its ghost's
  'race-at-own-platforms': [['main.js', 'const platforms = h ? h.platforms || 1 : settings.platforms;', 'const platforms = settings.platforms;']],
  // 8: every size is MEDIUM's widths
  'generator-ignores-width': [['game/generator.js', 'const w = base * shape * f * (1 - SQUEEZE_DEPTH * sq);', 'const w = base * shape * (1 - SQUEEZE_DEPTH * sq);']],
  // 8: SMALL stops at MEDIUM's minimum
  'minimum-ignores-width': [['game/generator.js', 'const least = PLAT_W_MIN * f;', 'const least = PLAT_W_MIN;']],
  // 8: the file forgets the width on the way in
  'decoder-drops-platforms': [['game/replaycodec.js', 'header.platforms = plat;', 'header.platforms = 1;']],
  // 8: ...and on the way out
  'encoder-drops-platforms': [['game/replaycodec.js', 'w.u8(Math.max(0, MOVES.indexOf(h.companions)) | ((pc & 0x3f) << 2));', 'w.u8(Math.max(0, MOVES.indexOf(h.companions)));']],
  // 8: the playback on MEDIUM
  'playback-on-medium': [['game/replay.js', 'g.newRun(h.seed, this.replay.race ? this.replay.race.course : null, h.jumpSpeed, h.platforms, h.difficulty, h.gravity);', 'g.newRun(h.seed, this.replay.race ? this.replay.race.course : null, h.jumpSpeed, 1, h.difficulty, h.gravity);']],
  // 8: a course forgets its ghost's width
  'course-drops-width': [['game/race.js', 'flow: !!t.flow, widthScale: t.widthScale || 1,', 'flow: !!t.flow,']],
  // 9: the fire rises at EASY's pace whatever the difficulty
  'rise-ignores-difficulty': [['game/game.js', 'return base * DIFFICULTIES[this.difficulty || 0].rise * this.idleUrgency();', 'return base * this.idleUrgency();']],
  // 9: ...and trails as far
  'lead-ignores-difficulty': [['game/game.js', ' * DIFFICULTIES[this.difficulty || 0].lead;', ';']],
  // 9: the file forgets the difficulty on the way in
  'decoder-drops-difficulty': [['game/replaycodec.js', 'header.difficulty = diff;', 'header.difficulty = 0;']],
  // 9: ...and on the way out
  'encoder-drops-difficulty': [['game/replaycodec.js', 'w.u8((h.demo ? 1 : 0) | (sc << 1) | (dc << 5));', 'w.u8((h.demo ? 1 : 0) | (sc << 1));']],
  // 9: the playback at EASY
  'playback-at-easy': [['game/replay.js', 'g.newRun(h.seed, this.replay.race ? this.replay.race.course : null, h.jumpSpeed, h.platforms, h.difficulty, h.gravity);', 'g.newRun(h.seed, this.replay.race ? this.replay.race.course : null, h.jumpSpeed, h.platforms, 0, h.gravity);']],
  // 7: a run at EASY whatever the setting
  'run-ignores-difficulty': [['main.js', 'game.newRun(race ? race.seed : undefined, race ? race.course || null : null, jumpSpeed, platforms, difficulty, gravity);', 'game.newRun(race ? race.seed : undefined, race ? race.course || null : null, jumpSpeed, platforms, 0, gravity);']],
  // 10: a 140% saved since the first move left where it was
  'lower-not-moved': [['game/settings.js', '      if (parsed.speedV >= 2 && out.jumpSpeed === 1.4) out.jumpSpeed = DEFAULTS.jumpSpeed;\n', '']],
  // 10: the move made at every load, so a 140% chosen after it cannot stay
  'lower-every-load': [['game/settings.js', '    if (!(parsed.speedV >= SPEED_V)) {', '    if (true) {']],
  // 10: a 140% saved before the first move -- a choice -- moved too
  'lower-too-far': [['game/settings.js', 'if (parsed.speedV >= 2 && out.jumpSpeed === 1.4)', 'if (out.jumpSpeed === 1.4)']],
  // 7: a race at the racer's own difficulty, not its ghost's
  'race-at-own-difficulty': [['main.js', 'const difficulty = mine ? settings.difficulty : h.difficulty || 0;', 'const difficulty = settings.difficulty;']],
  // 7: a run at NORMAL whatever the GRAVITY setting
  'run-ignores-gravity': [['main.js', 'game.newRun(race ? race.seed : undefined, race ? race.course || null : null, jumpSpeed, platforms, difficulty, gravity);', 'game.newRun(race ? race.seed : undefined, race ? race.course || null : null, jumpSpeed, platforms, difficulty);']],
  // 7: a race at the racer's own gravity, not its ghost's
  'race-at-own-gravity': [['main.js', 'const gravity = mine ? settings.gravity : h.gravity || 1;', 'const gravity = settings.gravity;']],
  // 7: the demo at the player's gravity
  'demo-at-setting-gravity': [['game/autoplay.js', "import { DEFAULTS } from './settings.js';", "import { DEFAULTS, load } from './settings.js';"],
    ['game/autoplay.js', 'difficulty: DEFAULTS.difficulty, gravity: DEFAULTS.gravity, ...over,', 'difficulty: DEFAULTS.difficulty, gravity: load().gravity, ...over,']],
  // 11: a saved gravity the menu does not offer is kept
  'settings-keep-any-gravity': [['game/settings.js', '    if (!GRAVITIES.includes(out.gravity)) out.gravity = DEFAULTS.gravity;\n', '']],
  // 11: HIGH one step heavier than the weakest jump allows
  'high-too-heavy': [['game/settings.js', 'export const GRAVITIES = [0.8, 0.9, 1.1];', 'export const GRAVITIES = [0.8, 0.9, 1.25];']],
  // 11: a gravity an older build saved loads as the default, not the one of its name
  'gravity-not-migrated': [['game/settings.js', '    if (GRAVITY_WAS[out.gravity] !== undefined) out.gravity = GRAVITY_WAS[out.gravity];\n', '']],
  // 11: a file climbed at a gravity the menu no longer offers is refused
  'old-gravity-refused': [['game/replaycodec.js', 'const g = GRAVITIES_KNOWN.find(', 'const g = [0.8, 0.9, 1.1].find(']],
  // 8: a width an older build saved loads as the default, not the one of its name
  'platforms-not-migrated': [['game/settings.js', '    if (PLATFORMS_WAS[out.platforms] !== undefined) out.platforms = PLATFORMS_WAS[out.platforms];\n', '']],
  // 8: a file climbed on a width the menu no longer offers is refused
  'old-width-refused': [['game/replaycodec.js', 'const w = PLATFORMS_KNOWN.find(', 'const w = [0.875, 1.175].find(']],
  // 11: the setting reaches newRun and goes no further
  'newrun-drops-gravity': [['game/game.js', 'this.player.gravity = Number.isFinite(gravity) && gravity > 0 ? gravity : 1;', 'this.player.gravity = 1;']],
  // 11: he falls by the world's gravity whatever the setting
  'gravity-not-his': [['game/player.js', 'this.vy -= gravityOf(this) * h;', 'this.vy -= GRAVITY * h;']],
  // 11: his fall's cap left at TERMINAL
  'terminal-not-scaled': [['game/player.js', 'const fall = terminalOf(this);', 'const fall = TERMINAL;']],
  // 11: the bot plans on the world's gravity
  'bot-on-world-gravity': [['game/autoplay.js', "import { wallBounceOut, gravityOf, terminalOf } from './player.js';", "import { wallBounceOut, terminalOf } from './player.js';\nimport { GRAVITY } from './constants.js';\nconst gravityOf = () => GRAVITY;"]],
  // 11: the companions' forecast of his landing on the world's gravity
  'landing-forecast-world-gravity': [['game/companions.js', 'const G = gravityOf(player), fall = terminalOf(player);', 'const G = GRAVITY, fall = terminalOf(player);']],
  // 11: ...and their forecast of his arc
  'predictor-world-gravity': [['game/companions.js', 'const y = player.y, vy = player.vy, G = gravityOf(player);', 'const y = player.y, vy = player.vy, G = GRAVITY;']],
  // 11: the recording forgets the gravity
  'recorder-drops-gravity': [['game/replay.js', 'difficulty: game.difficulty || 0, gravity: game.gravity || 1,', 'difficulty: game.difficulty || 0, gravity: 1,']],
  // 11: the playback at NORMAL
  'playback-at-normal': [['game/replay.js', 'g.newRun(h.seed, this.replay.race ? this.replay.race.course : null, h.jumpSpeed, h.platforms, h.difficulty, h.gravity);', 'g.newRun(h.seed, this.replay.race ? this.replay.race.course : null, h.jumpSpeed, h.platforms, h.difficulty);']],
  // 11: the file forgets the gravity on the way out
  'encoder-drops-gravity': [['game/replaycodec.js', 'const more = gc & 0x1f;', 'const more = 0;']],
  // 11: ...and on the way in
  'decoder-drops-gravity': [['game/replaycodec.js', 'header.gravity = grav;', 'header.gravity = 1;']],
  // 11: a gravity this build does not offer is played
  'unoffered-gravity-played': [['game/replaycodec.js', "if (grav === null) throw new Error('the replay was climbed at a gravity this version does not have');", 'if (grav === null) header.gravity = 1;']],
  // 11: a bit of a later build's setting is ignored
  'later-bits-ignored': [['game/replaycodec.js', "if (more >> 5) throw new Error('this replay needs a newer version of the game');", 'void more;']],
  // 11: the store's list says NORMAL for it
  'store-drops-gravity': [['game/replaystore.js', '    gravity: h.gravity || 1,\n', '']],
  // 11: the stats' run history forgets it
  'stats-drop-gravity': [['game/stats.js', '    grav: run.gravity || 1,\n', '']],
  // 11: the scoreboard does not name it
  'label-ignores-gravity': [['ui/screens.js', 'const heavy = gv !== DEFAULTS.gravity ? GRAVITY_WORDS[gv] || null : null;', 'const heavy = null;']],
};

if (argv.includes('--mutants')) {
  let bad = 0;
  for (const name of Object.keys(MUTANTS)) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--mutant=' + name], { encoding: 'utf8' });
    const out = (r.stdout || '') + (r.stderr || '');
    const didNot = /DID NOT APPLY/.test(out);
    const fails = (out.match(/^ {2}FAIL .*/gm) || []).map((l) => l.trim().slice(5, 90));
    const caught = r.status === 1 && !didNot;
    if (!caught) bad++;
    console.log(`  ${caught ? 'caught' : 'MISSED'} ${name.padEnd(26)} ${didNot ? 'DID NOT APPLY' : fails.length + ' checks failed: ' + (fails[0] || '(exit ' + r.status + ')')}`);
  }
  console.log(bad ? `\n  ${bad} mutant(s) not caught` : `\n  every mutant caught (${Object.keys(MUTANTS).length})`);
  process.exit(bad ? 1 : 0);
}

let SRC = path.join(REPO, 'src');
if (MUTANT) {
  const patches = MUTANTS[MUTANT];
  if (!patches) { console.log(`no mutant ${MUTANT}`); process.exit(2); }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'feel-mut-'));
  fs.cpSync(SRC, path.join(tmp, 'src'), { recursive: true });
  for (const [file, from, to] of patches) {
    const f = path.join(tmp, 'src', file);
    // LF, whatever the checkout wrote: git on this machine checks the sources out with CRLF.
    const text = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
    if (!text.includes(from)) { console.log(`  DID NOT APPLY: ${MUTANT} (${file})`); process.exit(2); }
    fs.writeFileSync(f, text.replace(from, to));
  }
  SRC = path.join(tmp, 'src');
  console.log(`  mutant ${MUTANT}: src/ copied to ${tmp} and patched`);
}
const mod = (p) => import(pathToFileURL(path.join(SRC, p)).href);

let pass = 0, failed = 0;
function check(cond, label, detail = '') {
  if (cond) { pass++; console.log('  ok   ' + label); } else { failed++; console.log('  FAIL ' + label + (detail ? '   ' + detail : '')); }
  return cond;
}
const note = (s) => console.log('       ' + s);

// The page first: the render modules build their atlases at load, and main.js is booted last
// on this same page. What main.js will find saved: JUMP SPEED 130%, LOW LATENCY on, the guide
// seen (so SPACE climbs instead of opening it).
const page = installPage({ storage: 'memory', seed: 7 });
page.storage.set('dukevytis.settings.v2', JSON.stringify({ jumpSpeed: 1.3, lowLatency: true, guideSeen: true, music: false }));
// Every 2D context made, with the options it was asked for.
const ctxLog = [];
const realGetContext = HeadlessCanvas.prototype.getContext;
HeadlessCanvas.prototype.getContext = function (kind, opts) {
  ctxLog.push({ canvas: this, opts: opts ? { ...opts } : null });
  return realGetContext.call(this, kind, opts);
};
const optsOf = (canvas) => { const e = ctxLog.find((x) => x.canvas === canvas); return e ? e.opts : undefined; };

const C = await mod('game/constants.js');
const { Player } = await mod('game/player.js');
const { Game, STATE } = await mod('game/game.js');
const { hisLanding } = await mod('game/companions.js');
const { MAX_EDGE_GAP, ABSOLUTE_REACH } = await mod('game/reach.js');
const { JUMP_SPEEDS, OPTIONS } = await mod('game/settings.js');
const { COYOTE, JUMP_BUFFER } = await mod('core/input.js');
const { STEP } = await mod('core/loop.js');
const t0 = Date.now();

const SPEEDS = JUMP_SPEEDS.filter((s) => s !== 1);
check(JUMP_SPEEDS[0] === 1 && SPEEDS.length >= 1 && SPEEDS.every((s) => s > 1),
  `JUMP SPEED offers 100% and faster: ${JUMP_SPEEDS.map((s) => Math.round(s * 100) + '%').join(' ')}`);

// ---- a world of known ledges -----------------------------------------------------------
function flatTower(extra = []) {
  const floors = new Map([[0, { x: 0, w: C.VW, y: 0 }]]);
  for (const [n, x, w] of extra) floors.set(n, { x, w, y: n * C.FLOOR_H });
  return { floors, get: (n) => floors.get(n) || null };
}

/** Fly a player at `rate` from `setup`, `script` setting the input from his state each step. */
function fly(rate, tower, setup, script, done, max = 240 * 12) {
  const p = new Player();
  p.rate = rate;
  setup(p);
  const inp = { axis: 0, jumpHeld: false, press: false, consumeJump() { const t = this.press; this.press = false; return t; } };
  const path = [{ x: p.x, y: p.y }];
  const events = [];
  let k = 0;
  for (; k < max; k++) {
    script(p, inp, k);
    p.step(STEP, inp, tower);
    path.push({ x: p.x, y: p.y });
    for (const e of p.drainEvents()) events.push({ ...e, k });
    if (done(p, events, k)) break;
  }
  return { path, events, steps: k + 1, p };
}

function segDist(px, py, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
  let t = L > 0 ? ((px - a.x) * dx + (py - a.y) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(a.x + dx * t - px, a.y + dy * t - py);
}
/** The farthest any point of one path lies from the other, both ways [world units]. */
function pathGap(A, B) {
  const one = (P, Q) => {
    let worst = 0;
    for (const q of Q) {
      let d = Infinity;
      for (let i = 1; i < P.length; i++) d = Math.min(d, segDist(q.x, q.y, P[i - 1], P[i]));
      worst = Math.max(worst, d);
    }
    return worst;
  };
  return Math.max(one(A, B), one(B, A));
}
/** Each airborne stretch's highest point. */
function apexes(path, events) {
  const out = [];
  let from = 0;
  const cuts = events.filter((e) => e.type === 'land').map((e) => e.k + 1);
  for (const to of [...cuts, path.length - 1]) {
    let top = -Infinity;
    for (let i = from; i <= to; i++) top = Math.max(top, path[i].y);
    if (to > from) out.push(top);
    from = to;
  }
  return out;
}

// ---- 1. the same arcs, in 1/s of the time -----------------------------------------------
console.log('\n  1. the same arcs in space, in 1/s of the time');
// How far apart the paths may lie [world units; a unit is 4 screen pixels at zoom 1]. Not 0:
// a step of his is s times as long, and a wall or a ledge met INSIDE a step is met at another
// instant of it at each speed. Measured when this was written: 0.3 for a plain jump, and at
// worst 2.7 for the flat-out jump at 130%, whose three wall bounces each re-anchor the arc --
// against 5.6 units covered in one of his steps there. A mutant that puts gravity on the
// world's clock is off by 90 units at the apex, one that drops his clock by none in space
// and 30% in steps: the steps are checked to within two.
const ARC_TOL = 3;
const APEX_TOL = 1.0;
const landed = (p, ev) => ev.some((e) => e.type === 'land');
const SCENES = [
  {
    name: 'a standing jump, held',
    tower: flatTower(),
    setup: () => {},
    script: (p, inp, k) => { inp.jumpHeld = true; if (k === 0) inp.press = true; },
    done: landed,
  },
  {
    name: 'a flat-out jump off the wall and back',
    tower: flatTower(),
    setup: (p) => { p.momentum = 1; p.vx = C.VX_MAX_HOT; },
    script: (p, inp, k) => { inp.jumpHeld = true; if (k === 0) inp.press = true; inp.axis = p.vx >= 0 ? 1 : -1; },
    done: landed,
  },
  {
    name: 'a combo-driven wall bounce in mid-air, overdrive and all',
    tower: flatTower(),
    setup: (p) => { p.grounded = false; p.x = p.hi - 60; p.y = 40; p.vx = 400; p.vy = 300; p.momentum = 0.5; p.comboBoost = 0.7; },
    script: (p, inp) => { inp.axis = p.vx > 0 ? 1 : 0; },
    done: landed,
  },
  {
    name: 'a walk off a ledge, down to the ground',
    tower: flatTower([[4, 200, 60]]),
    setup: (p) => { p.x = 250; p.y = 120; p.floor = 4; },
    script: (p, inp) => { inp.axis = 1; },
    done: (p, ev) => ev.some((e) => e.type === 'land' && e.floor === 0),
  },
];
for (const sc of SCENES) {
  const base = fly(1, sc.tower, sc.setup, sc.script, sc.done);
  const kinds0 = base.events.map((e) => e.type).join(' ');
  const top0 = apexes(base.path, base.events);
  for (const s of SPEEDS) {
    const r = fly(s, sc.tower, sc.setup, sc.script, sc.done);
    const gap = pathGap(base.path, r.path);
    const top = apexes(r.path, r.events);
    const dTop = Math.max(...top0.map((v, i) => Math.abs(v - (top[i] ?? -1e9))));
    const kinds = r.events.map((e) => e.type).join(' ');
    const want = base.steps / s;
    const b0 = base.events.filter((e) => e.type === 'wallbounce'), b1 = r.events.filter((e) => e.type === 'wallbounce');
    const bounceOk = b0.length === b1.length && b0.every((e, i) => Math.abs(e.out - b1[i].out) <= 0.01 * e.out);
    check(gap <= ARC_TOL && dTop <= APEX_TOL && kinds === kinds0 && bounceOk && Math.abs(r.steps - want) <= 2,
      `${sc.name} at ${Math.round(s * 100)}%: the path within ${gap.toFixed(2)} units of 100%'s, apexes within ${dTop.toFixed(2)}, `
      + `${r.steps} steps for 100%'s ${base.steps} (1/s: ${want.toFixed(1)})`,
      `events [${kinds}] vs [${kinds0}], bounces ${b1.map((e) => e.out.toFixed(1))} vs ${b0.map((e) => e.out.toFixed(1))}, apexes ${top.map((v) => v.toFixed(1))} vs ${top0.map((v) => v.toFixed(1))}`);
  }
}
{
  // The run-up: back and forth across the starting shaft from rest until the meter is full.
  const run = (s) => fly(s, flatTower(), () => {}, (p, inp) => {
    if (!inp.dir) inp.dir = 1;
    if (p.x > p.hi - 24) inp.dir = -1;
    if (p.x < p.lo + 24) inp.dir = 1;
    inp.axis = inp.dir;
  }, (p) => p.momentum >= 0.99, 240 * 30);
  const b = run(1);
  for (const s of SPEEDS) {
    const r = run(s);
    // Within 2% in steps: the run turns at the walls a dozen times, each kick-off met inside a
    // step (1.1% at 120% when written); the momentum mutant is 20-30% off.
    const dd = Math.abs(r.p.distanceRun - b.p.distanceRun) / b.p.distanceRun;
    check(Math.abs(r.steps - b.steps / s) <= 0.02 * b.steps / s && dd < 0.01,
      `a run-up from rest fills the meter at ${Math.round(s * 100)}% in ${r.steps} steps (100%: ${b.steps}, 1/s ${(b.steps / s).toFixed(0)}) over the same `
      + `${r.p.distanceRun.toFixed(0)} units run (100%: ${b.p.distanceRun.toFixed(0)})`);
  }
}

// ---- 2. the windows for the hands, in seconds -------------------------------------------
console.log('\n  2. the windows for a player\'s hands, in the world\'s seconds');
{
  // Coyote time: walked off a ledge with no momentum (so no air jump), a press d steps later.
  const tower = flatTower([[4, 200, 60]]);
  const lastCoyote = (s) => {
    let last = -1;
    for (let d = 0; d <= 60; d++) {
      let left = -1;
      const r = fly(s, tower, (p) => { p.x = 250; p.y = 120; p.floor = 4; }, (p, inp, k) => {
        inp.axis = 1;
        if (left < 0 && !p.grounded && k > 0) left = k;
        if (left >= 0 && k === left + d) inp.press = true;
      }, (p, ev, k) => left >= 0 && k > left + d + 2, 240 * 3);
      if (r.events.some((e) => e.type === 'jump')) last = d;
    }
    return last;
  };
  const c1 = lastCoyote(1);
  check(Math.abs(c1 - COYOTE / STEP) <= 2, `at 100% a jump still takes ${c1} steps after he leaves the ledge (COYOTE ${COYOTE} s = ${(COYOTE / STEP).toFixed(1)} steps)`);
  for (const s of SPEEDS) {
    const c = lastCoyote(s);
    check(c === c1, `coyote time at ${Math.round(s * 100)}%: the last jump that takes is ${c} steps after he leaves the ledge, as at 100% (${c1})`);
  }
}
const quiet = () => ({ axis: 0, jumpHeld: false, press: false, dts: [],
  consumeJump() { const t = this.press; this.press = false; return t; }, pressed() { return false; },
  step(dt) { this.dts.push(dt); }, endFrame() {} });
{
  // The combo's ground grace: a chain live, standing on the ground, steps until it ends.
  const graceSteps = (s) => {
    const inp = quiet();
    const g = new Game(inp);
    g.newRun(0x2f6f1b21, null, s);
    g.combo.active = true;
    g.combo.floors = 10;
    let n = 0;
    while (g.combo.active && n < 2400) { g.step(STEP); n++; }
    return { n, dts: inp.dts };
  };
  const g1 = graceSteps(1);
  check(Math.abs(g1.n - C.COMBO_GROUND_GRACE / STEP) <= 1, `at 100% a chain standing still ends after ${g1.n} steps (COMBO_GROUND_GRACE ${C.COMBO_GROUND_GRACE} s)`);
  for (const s of SPEEDS) {
    const r = graceSteps(s);
    check(r.n === g1.n, `the combo's ground grace at ${Math.round(s * 100)}%: ${r.n} steps, as at 100%`);
    check(r.dts.every((d) => d === STEP), `the jump buffer (${JUMP_BUFFER} s) counts down on the world's clock at ${Math.round(s * 100)}%: the input is stepped by ${r.dts[0]}`);
  }
}

// ---- 3. what follows his clock -----------------------------------------------------------
console.log('\n  3. what follows his clock');
{
  // The camera's lag behind him at each height of a standing jump's rise.
  const lagCurve = (s) => {
    const inp = quiet();
    inp.press = true;
    inp.jumpHeld = true;
    const g = new Game(inp);
    g.newRun(0x2f6f1b21, null, s);
    const pts = [];
    for (let k = 0; k < 240 * 2; k++) {
      g.step(STEP);
      const p = g.player;
      if (p.vy <= 0 && k > 2) break;
      pts.push({ y: p.y, lag: p.y - g.camY });
    }
    return pts;
  };
  const at = (pts, y) => {
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].y >= y && pts[i - 1].y <= y) {
        const u = (y - pts[i - 1].y) / Math.max(1e-9, pts[i].y - pts[i - 1].y);
        return pts[i - 1].lag + (pts[i].lag - pts[i - 1].lag) * u;
      }
    }
    return null;
  };
  const b = lagCurve(1);
  const top = b[b.length - 1].y;
  for (const s of SPEEDS) {
    const r = lagCurve(s);
    let worst = 0;
    for (let y = 5; y < top - 5; y += 2) { const u = at(b, y), v = at(r, y); if (u !== null && v !== null) worst = Math.max(worst, Math.abs(u - v)); }
    check(worst <= 1.0, `the camera frames him at ${Math.round(s * 100)}% as at 100%: its lag behind him within ${worst.toFixed(2)} units at every height of the jump`);
  }
}
{
  // The companions' forecast of his landing, made at the top of a standing jump.
  for (const s of JUMP_SPEEDS) {
    const tower = flatTower();
    let said = null, apexK = -1;
    const r = fly(s, tower, () => {}, (p, inp, k) => {
      inp.jumpHeld = true;
      if (k === 0) inp.press = true;
      if (said === null && k > 0 && p.vy <= 0 && !p.grounded) { said = hisLanding(p, tower).t; apexK = k; }
    }, landed);
    const real = (r.steps - apexK) * STEP;
    check(said !== null && Math.abs(said - real) <= 2 * STEP,
      `the companions' forecast of his landing at ${Math.round(s * 100)}%: ${said && said.toFixed(4)} s, and he lands in ${real.toFixed(4)} s of the world's clock`);
  }
}
{
  // The catch hands the fall his real speed.
  for (const s of SPEEDS) {
    const g = new Game(quiet());
    g.newRun(0x2f6f1b21, null, s);
    const p = g.player;
    p.grounded = false;
    p.y = p.py = 200;
    p.vy = -600;
    const real = -600 * s;
    g.die();
    check(Math.abs(p.vy - real) < 1e-9, `the fall takes over his real speed at ${Math.round(s * 100)}%: ${p.vy.toFixed(1)} units/s of the world's clock where he was falling at ${real.toFixed(1)}`);
  }
}
{
  // The fire's own catch (Game.caughtByFloor, the only way a run dies): a man caught standing,
  // rising, or falling slower than the grab is yanked under at FLOOR_GRAB in the world's units
  // at every speed, as the fall is the world's theatre. The grab was applied in HIS units before
  // die() converted them, so at 130% he went under at 312 units/s where 100% goes at 240.
  // (Verifier, 2026-09-28: the check above calls die() with a fast fall, where the grab does
  // not bind, and did not see it.)
  const caught = (s, vyHis) => {
    const g = new Game(quiet());
    g.newRun(0x2f6f1b21, null, s);
    const p = g.player;
    p.grounded = vyHis === 0;
    p.y = p.py = 200;
    p.vy = vyHis;
    g.riseActive = true;
    g.riseY = 200;
    g.caughtByFloor();
    return g.state === STATE.FALLING ? p.vy : NaN;
  };
  for (const s of SPEEDS) {
    const got = [0, 150, -100].map((v) => caught(s, v));
    const fast = caught(s, -600);
    check(got.every((v) => Math.abs(v + C.FLOOR_GRAB) < 1e-9) && Math.abs(fast + 600 * s) < 1e-9,
      `the fire's catch at ${Math.round(s * 100)}% yanks him under at the world's FLOOR_GRAB: ${got.map((v) => v.toFixed(1)).join(', ')} units/s caught standing, rising and falling slowly (100%: -${C.FLOOR_GRAB}), ${fast.toFixed(1)} falling fast`);
  }
}
{
  // The combo trail: pieces shed over the same stretch of his path.
  const shed = (s) => {
    const g = new Game(quiet());
    g.newRun(0x2f6f1b21, null, 1);
    const parts = g.particles;
    let n = 0;
    const orig = parts.shedOne;
    parts.shedOne = function (...a) { n++; return orig.apply(this, a); };
    const p = { grounded: false, vx: 200, vy: 50, momentum: 1, x: 240, y: 100, rate: s };
    for (let k = 0; k < 240; k++) parts.comboTrail(STEP, p, 12, 0);
    return n;
  };
  const n1 = shed(1);
  for (const s of SPEEDS) {
    const n = shed(s);
    check(n1 > 10 && Math.abs(n - n1 * s) <= 2, `the combo trail at ${Math.round(s * 100)}% sheds ${n} pieces in a second where 100% sheds ${n1}: as many along his path`);
  }
}
{
  // The afterimage's measure of his speed: flat out along the ground, drawn at 160 Hz.
  const R = await mod('render/renderer.js');
  const aiSpeed = (s) => {
    const canvas = new HeadlessCanvas(C.SW, C.SH);
    const r = new R.Renderer(canvas);
    r.applySettings({ scaleMode: 'integer', scanlines: false, particles: 'high', streaks: false, shake: false, trails: true, showFps: false, music: false });
    r.backdrop = { draw() {} };
    const inp = quiet();
    inp.axis = 1;
    const g = new Game(inp);
    g.newRun(0x2f6f1b21, null, s);
    g.openness = 1; g.arenaEase = C.ARENA_HALF_MAX; g.arenaHalfView = C.ARENA_HALF_MAX; g.zoom = g.zoomView = 1;
    g.viewH = C.VH; g.tower.setBounds(C.PLAY_L, C.PLAY_R); g.player.setBounds(C.PLAY_L, C.PLAY_R);
    const p = g.player;
    p.momentum = 1; p.vx = C.VX_MAX_HOT; p.x = p.px = C.PLAY_L + 40;
    g.camY = p.y - g.viewH * C.CAM_ANCHOR;
    let acc = 0;
    for (let f = 0; f < 32; f++) {
      acc += 1 / 160;
      while (acc >= STEP) { g.step(STEP); acc -= STEP; }
      r.draw(g, acc / STEP, 1 / 160);
    }
    return r.afterimage.speed;
  };
  const v1 = aiSpeed(1);
  for (const s of SPEEDS) {
    const v = aiSpeed(s);
    check(v1 > 300 && Math.abs(v - v1) <= 0.03 * v1, `the afterimage reads his speed at ${Math.round(s * 100)}% in his units: ${v.toFixed(0)} units/s where 100% reads ${v1.toFixed(0)}`);
  }
}

// ---- 4. the reach proof ------------------------------------------------------------------
console.log('\n  4. the reach proof holds at every speed');
{
  const wide = flatTower();
  const reach = (s) => {
    const r = fly(s, wide, (p) => { p.setBounds(C.PLAY_L, C.PLAY_R); p.x = C.PLAY_L + 20; }, (p, inp, k) => {
      inp.jumpHeld = true; inp.axis = 1; if (k === 0) inp.press = true;
    }, landed);
    let top = 0, at = null;
    for (let i = 1; i < r.path.length; i++) {
      const a = r.path[i - 1], b = r.path[i];
      top = Math.max(top, b.y);
      if (at === null && top > C.FLOOR_H && a.y >= C.FLOOR_H && b.y < C.FLOOR_H) at = a.x + (b.x - a.x) * (a.y - C.FLOOR_H) / (a.y - b.y);
    }
    return { top, dx: at - (C.PLAY_L + 20) };
  };
  const b = reach(1);
  note(`the weakest jump at 100%: ${b.dx.toFixed(1)} units across one floor up (the proof's ABSOLUTE_REACH ${ABSOLUTE_REACH.toFixed(1)}, `
    + `the generator's MAX_EDGE_GAP ${MAX_EDGE_GAP}), up ${b.top.toFixed(1)} units`);
  for (const s of JUMP_SPEEDS) {
    const r = reach(s);
    check(Math.abs(r.dx - b.dx) <= 1 && r.dx >= MAX_EDGE_GAP + C.PLAYER_W && r.top >= 2 * C.FLOOR_H,
      `the weakest jump at ${Math.round(s * 100)}% reaches ${r.dx.toFixed(1)} units across one floor up (100%: ${b.dx.toFixed(1)}; the generator allows a gap of ${MAX_EDGE_GAP} `
      + `plus his ${C.PLAYER_W}) and rises ${r.top.toFixed(1)} (two floors: ${2 * C.FLOOR_H})`);
  }
}

// ---- 5. a replay at 120% -----------------------------------------------------------------
console.log('\n  5. a replay recorded at 120%');
{
  const Replay = await mod('game/replay.js');
  const Codec = await mod('game/replaycodec.js');
  const { AutoInput, AutoPlayer } = await mod('game/autoplay.js');
  const SPEED = 1.2;
  const digest = (g) => {
    const p = g.player;
    return [p.x, p.y, p.vx, p.vy, p.momentum, g.camY, g.riseY, g.score, g.run.maxFloor, g.particles.shedCursor];
  };
  const input = new AutoInput();
  const game = new Game(input);
  const bot = new AutoPlayer(input);
  game.newRun(0x51ed270b, null, SPEED);
  const rec = Replay.startRecording(game);
  const log = [];
  for (let n = 0; n < 240 * 90 && game.state === STATE.PLAYING; n++) {
    bot.step(game, STEP);
    game.step(STEP);
    log.push(digest(game));
  }
  const rep = rec.finish();
  note(`the bot at ${SPEED * 100}%: ${log.length} steps, floor ${rep.result.floor}, ${rep.result.ended}`);
  check(rep.header.jumpSpeed === SPEED, `the recording's header says ${rep.header.jumpSpeed}`);

  const text = Replay.exportReplay(rep);
  const back = Replay.importReplay(text);
  check(back.ok && back.compatible && back.replay.header.jumpSpeed === SPEED,
    `exported and imported: ok ${back.ok}, compatible ${back.compatible}, at ${back.ok && back.replay.header.jumpSpeed}`, back.error || '');

  const play = (replay) => {
    const made = Replay.createPlayback(replay);
    if (!made.ok) return { ok: false, error: made.error };
    const pb = made.playback;
    let first = -1;
    for (let i = 0; i < log.length; i++) {
      if (pb.game.state !== STATE.PLAYING) { first = i; break; }
      pb.step();
      const d = digest(pb.game);
      if (first < 0 && d.some((v, j) => v !== log[i][j])) first = i;
    }
    while (pb.step()) { /* to the end: the checksums */ }
    return { ok: true, first, desync: pb.desync, speed: pb.game.jumpSpeed };
  };
  const same = back.ok ? play(back.replay) : { ok: false };
  check(same.ok && same.first < 0 && !same.desync && same.speed === SPEED,
    `played back at ${same.speed}: every one of ${log.length} steps the run's own (player, camera, fire, score, trail), no desync`,
    `first difference at step ${same.first}, desync ${JSON.stringify(same.desync)} ${same.error || ''}`);
  const at100 = back.ok ? play({ ...back.replay, header: { ...back.replay.header, jumpSpeed: 1 } }) : { ok: false };
  // (Not at once: standing still, nothing he does depends on his clock.)
  check(at100.ok && at100.first >= 0,
    `the same file played at 100% is not the run (it differs at step ${at100.first}, as he first moves): the header's speed is what plays it`);

  // The store keeps it and the list shows it.
  const mem = new Map();
  Replay.setReplayBackend({ get: (k) => (mem.has(k) ? mem.get(k) : null), set: (k, v) => { mem.set(k, v); }, remove: (k) => { mem.delete(k); }, keys: () => [...mem.keys()] });
  const saved = Replay.saveRun(back.ok ? back.replay : rep);
  const row = saved.ok ? Replay.listReplays().find((e) => e.id === saved.id) : null;
  const loaded = saved.ok ? Replay.loadReplay(saved.id) : { ok: false };
  check(saved.ok && saved.kept && row && row.speed === SPEED && row.playable && loaded.ok && loaded.replay.header.jumpSpeed === SPEED,
    `stored, listed at ${row && Math.round(row.speed * 100)}% and playable, loaded back at ${loaded.ok && loaded.replay.header.jumpSpeed}`, saved.error || '');

  // A 100% run writes the flags byte it always did; a speed this build does not offer is refused.
  const bytes = Codec.encodeBinary(rep);
  const gl = bytes[4];
  let i = 5 + gl;
  while (bytes[i] & 0x80) i++;              // simVersion, a varint
  const flagsAt = i + 1 + 12;                // then constHash, probeHash and seed, 4 bytes each
  check(bytes[flagsAt] >> 1 === Codec.speedCode(SPEED) && Codec.speedCode(1) === 0,
    `the speed rides in the header's flags byte (code ${bytes[flagsAt] >> 1} for ${SPEED * 100}%, 0 for 100%, which is every replay kept before it)`);
  const bad = Uint8Array.from(bytes);
  bad[flagsAt] = (bad[flagsAt] & 1) | (7 << 1);        // 135%: not offered
  const crc = Codec.crc32(bad, bad.length - 4);
  new DataView(bad.buffer).setUint32(bad.length - 4, crc, true);
  const refused = Replay.importReplay(Codec.PREFIX + Buffer.from(bad).toString('base64').replace(/=+$/, ''));
  check(!refused.ok && /jump speed/.test(refused.error || ''), `a file at a speed this build does not offer is refused: "${refused.error}"`);
}

// ---- 6. LOW LATENCY: the hint, and a new canvas to carry it ------------------------------
console.log('\n  6. LOW LATENCY');
{
  const R = await mod('render/renderer.js');
  const off = new HeadlessCanvas(1, 1);
  const r = new R.Renderer(off);
  const o0 = optsOf(off);
  check(o0 && o0.alpha === false && !o0.desynchronized, `OFF: the screen's context is made with ${JSON.stringify(o0)}`);
  const on = new HeadlessCanvas(1, 1);
  new R.Renderer(on, { lowLatency: true });
  const o1 = optsOf(on);
  check(o1 && o1.alpha === false && o1.desynchronized === true, `ON: the screen's context is made with ${JSON.stringify(o1)}`);

  off.id = 'screen';
  const swaps = [];
  off.parentNode = { replaceChild: (n, o) => swaps.push([n, o]) };
  const base = { scaleMode: 'integer', scanlines: false, particles: 'high', streaks: false, shake: false, trails: true, showFps: false, music: false };
  r.applySettings({ ...base, lowLatency: true });
  const c2 = r.canvas, o2 = optsOf(c2);
  check(c2 !== off && c2.id === 'screen' && swaps.length === 1 && swaps[0][0] === c2 && swaps[0][1] === off
    && r.screenCtx === c2.getContext('2d') && o2 && o2.desynchronized === true && c2.width === C.SW && c2.height === C.SH,
  `turned ON: a new ${c2.width}x${c2.height} canvas stands where the old one was (id ${c2.id}), its context made with ${JSON.stringify(o2)}`);
  // A frame drawn into the back buffer is not on the screen until present() puts it there whole.
  const px = (cv, x, y) => { const i = (y * cv.width + x) * 4; return [cv.data[i], cv.data[i + 1], cv.data[i + 2]].join(','); };
  r.ctx.setTransform(1, 0, 0, 1, 0, 0);
  r.ctx.fillStyle = '#ff0000';
  r.ctx.fillRect(0, 0, C.SW, C.SH);
  const mid = px(c2, 960, 540);
  r.present();
  const after = px(c2, 960, 540);
  check(r.ctx !== r.screenCtx && r.ctx.canvas === r.back && mid !== '255,0,0' && after === '255,0,0',
    `...and the renderer draws into a back buffer: a frame drawn there shows ${mid} on the screen until present() puts it there whole (${after})`);
  c2.parentNode = { replaceChild: (n, o) => swaps.push([n, o]) };
  r.applySettings({ ...base, lowLatency: false });
  const c3 = r.canvas, o3 = optsOf(c3);
  check(c3 !== c2 && swaps.length === 2 && o3 && !o3.desynchronized && r.ctx === c3.getContext('2d') && r.ctx === r.screenCtx,
    `turned OFF again: another new canvas, its context made with ${JSON.stringify(o3)}, and the renderer draws on it directly`);
  const n = ctxLog.length;
  r.applySettings({ ...base, lowLatency: false });
  check(r.canvas === c3 && ctxLog.length === n, 'left as it is, nothing is made again');
}

// ---- 7. main.js, booted ------------------------------------------------------------------
console.log('\n  7. main.js, booted with JUMP SPEED 130%, LOW LATENCY and GRAVITY HIGH saved');
{
  // The page's canvas carries its id, as index.html's does, so a swap can be seen to keep it.
  const screen = page.els.get('screen');
  screen.id = 'screen';
  // GRAVITY saved at the heaviest the menu offers, for the run to climb at (a race at its ghost's).
  const { GRAVITIES } = await mod('game/settings.js');
  const HEAVY = GRAVITIES[GRAVITIES.length - 1];
  page.storage.set('dukevytis.settings.v2', JSON.stringify({ ...JSON.parse(page.storage.get('dukevytis.settings.v2')), gravity: HEAVY }));
  const V = await bootMain(pathToFileURL(path.join(SRC, 'main.js')).href);
  const o = optsOf(screen);
  check(V.renderer.canvas === screen && o && o.desynchronized === true, `the page's own canvas is the screen, its context made with ${JSON.stringify(o)}`);
  for (let i = 0; i < 60; i++) frame(V);
  // The demo is the game a new player gets: the defaults, whatever this machine has saved.
  const { DEFAULTS } = await mod('game/settings.js');
  const DG = V.demoGame;
  check(DG.jumpSpeed === DEFAULTS.jumpSpeed && DG.player.rate === DEFAULTS.jumpSpeed,
    `the attract demo runs at the default ${DG.jumpSpeed * 100}% (DEFAULTS ${DEFAULTS.jumpSpeed * 100}%), not the saved 130%`);
  check(DG.gravity === DEFAULTS.gravity && DG.player.gravity === DEFAULTS.gravity,
    `...and at the default gravity (${DG.gravity}; DEFAULTS ${DEFAULTS.gravity}) with ${HEAVY} saved`);
  check(DG.platforms === DEFAULTS.platforms && DG.difficulty === DEFAULTS.difficulty,
    `...on the default PLATFORMS (${DG.platforms}) at the default DIFFICULTY (${DG.difficulty})`);
  // ...on a player's tower, under a player's fire at that difficulty: not the flow ramp and the
  // fire at 0.55 it had until 2026-09-29. The same Game's rise asked as a player's run.
  const demoRise = DG.riseRate();
  DG.demo = false;
  const runRise = DG.riseRate();
  DG.demo = true;
  check(!DG.tower.flow && DG.tower.squeezes && demoRise === runRise,
    `...on the real tower (flow ${DG.tower.flow}, squeezes ${DG.tower.squeezes}) under the real fire (${demoRise.toFixed(1)} units/s, a run's ${runRise.toFixed(1)})`);

  const tap = (code) => { key(page.win, 'keydown', code); frame(V); key(page.win, 'keyup', code); frame(V); };
  const rowOf = (k) => OPTIONS.findIndex((x) => x.key === k);
  tap('KeyO');
  check(V.game.state === STATE.OPTIONS, `O opens the options (${V.game.state})`);
  for (let i = 0; i < rowOf('lowLatency'); i++) tap('ArrowDown');
  tap('ArrowRight');
  const c = V.renderer.canvas, oc = optsOf(c);
  check(c !== screen && c.id === 'screen' && oc && !oc.desynchronized && V.renderer.lowLatency === false,
    `LOW LATENCY turned OFF from the keyboard: a new canvas at once, its context made with ${JSON.stringify(oc)}`);
  for (let i = 0; i < rowOf('lowLatency') - rowOf('jumpSpeed'); i++) tap('ArrowUp');
  tap('ArrowLeft');
  tap('Escape');
  const saved = JSON.parse(page.storage.get('dukevytis.settings.v2'));
  check(saved.jumpSpeed === 1.2 && saved.lowLatency === false, `both saved: JUMP SPEED ${saved.jumpSpeed}, LOW LATENCY ${saved.lowLatency}`);
  check(V.game.state === STATE.MENU && V.demoGame.jumpSpeed === DEFAULTS.jumpSpeed, `back on the title with 120% saved, the demo still at the default ${V.demoGame.jumpSpeed * 100}%`);
  // ...and the NEXT demo, started after the setting changed: let this one die and linger out.
  V.demoGame.state = STATE.DEAD;
  for (let i = 0; i < 60 * 5; i++) frame(V);
  check(V.demoGame.state === STATE.PLAYING && V.demoGame.jumpSpeed === DEFAULTS.jumpSpeed && V.demoGame.gravity === DEFAULTS.gravity,
    `the next demo, started with 120% saved, runs at ${V.demoGame.jumpSpeed * 100}% and gravity ${V.demoGame.gravity}: the defaults, not the settings (${V.demoGame.state})`);

  tap('Space');
  const rec = V.replays.rec;
  check(V.game.state === STATE.PLAYING && V.game.jumpSpeed === 1.2 && rec && rec.header.jumpSpeed === 1.2,
    `SPACE climbs at ${V.game.jumpSpeed * 100}%, and the recording's header says ${rec && rec.header.jumpSpeed}`);
  // PLATFORMS was never saved here, so it is the default: NORMAL, 0.875 (the user's, 2026-09-29).
  // DIFFICULTY too: MEDIUM.
  check(V.game.platforms === 0.875 && V.game.tower.widthScale === 0.875 && rec && rec.header.platforms === 0.875,
    `...on the default PLATFORMS, ${V.game.platforms} (the tower's ${V.game.tower.widthScale}), and the header says ${rec && rec.header.platforms}`);
  check(V.game.difficulty === 1 && rec && rec.header.difficulty === 1,
    `...at the default DIFFICULTY, ${V.game.difficulty}, and the header says ${rec && rec.header.difficulty}`);
  check(V.game.gravity === HEAVY && V.game.player.gravity === HEAVY && rec && rec.header.gravity === HEAVY,
    `...at the saved GRAVITY, ${V.game.gravity}, and the header says ${rec && rec.header.gravity}`);

  // A race, against a ghost recorded at 100%: the racer runs at his own 120%.
  const Replay = await mod('game/replay.js');
  const { AutoInput, AutoPlayer } = await mod('game/autoplay.js');
  const gi = new AutoInput();
  const gg = new Game(gi);
  const gb = new AutoPlayer(gi);
  gg.newRun(0x2f6f1b21);
  const grec = Replay.startRecording(gg);
  for (let n = 0; n < 240 * 5 && gg.state === STATE.PLAYING; n++) { gb.step(gg, STEP); gg.step(STEP); }
  const ghost = grec.finish();
  V.replays.d.startRun({ replay: ghost, seed: ghost.header.seed >>> 0 });
  check(V.game.jumpSpeed === 1.2 && ghost.header.jumpSpeed === 1 && V.replays.rec && V.replays.rec.header.jumpSpeed === 1.2,
    `a race against a ${ghost.header.jumpSpeed * 100}% ghost runs at the racer's ${V.game.jumpSpeed * 100}%, and is recorded so`);
  check(ghost.header.platforms === 1 && V.game.platforms === 1 && V.replays.rec && V.replays.rec.header.platforms === 1,
    `...and on its ghost's platforms, 1 (${ghost.header.platforms}), not the racer's NORMAL: ${V.game.platforms}, recorded ${V.replays.rec && V.replays.rec.header.platforms}`);
  check(ghost.header.difficulty === 0 && V.game.difficulty === 0 && V.replays.rec && V.replays.rec.header.difficulty === 0,
    `...and at its ghost's EASY (${ghost.header.difficulty}), not the racer's MEDIUM: ${V.game.difficulty}, recorded ${V.replays.rec && V.replays.rec.header.difficulty}`);
  check(ghost.header.gravity === 1 && V.game.gravity === 1 && V.replays.rec && V.replays.rec.header.gravity === 1,
    `...and at its ghost's gravity, 1 (${ghost.header.gravity}), not the racer's ${HEAVY}: ${V.game.gravity}, recorded ${V.replays.rec && V.replays.rec.header.gravity}`);
}

// ---- 8. PLATFORMS: the width of every ledge -----------------------------------------------
console.log('\n  8. PLATFORMS: NORMAL and WIDE');
{
  const { Tower } = await mod('game/generator.js');
  const { isReachable } = await mod('game/reach.js');
  const S = await mod('game/settings.js');
  const { PLATFORM_WIDTHS } = S;
  const { CourseTower, makeCourse } = await mod('game/course.js');
  const { CourseSurvey } = await mod('game/race.js');
  const Replay = await mod('game/replay.js');
  const Codec = await mod('game/replaycodec.js');
  const { AutoInput, AutoPlayer } = await mod('game/autoplay.js');
  const SEED = 0x51ed270b, TOP = C.SQUEEZE_FROM - 1;

  // The menu: NORMAL and WIDE, NORMAL by default -- the user's (2026-09-29), halfway from the old
  // MEDIUM (1) to SMALL (0.75) and from MEDIUM to the old WIDE (1.35): pinned, as the spec they
  // are. And a width an older build saved loads as the one of its name now.
  const prow = S.OPTIONS.find((o) => o.key === 'platforms');
  check(PLATFORM_WIDTHS.join(',') === '0.875,1.175' && S.DEFAULTS.platforms === 0.875 && prow.values === PLATFORM_WIDTHS
    && PLATFORM_WIDTHS.map((w) => prow.show[String(w)]).join(' ') === 'NORMAL WIDE',
  `the menu offers ${PLATFORM_WIDTHS.map((w) => `${prow.show[String(w)]} (${w})`).join(', ')}; ${S.PLATFORM_WORDS[S.DEFAULTS.platforms]} by default`);
  const PKEY = 'dukevytis.settings.v2';
  const was = [0.75, 1, 1.35, 1.175, 0.5, undefined].map((w) => { page.storage.set(PKEY, JSON.stringify({ speedV: 2, platforms: w })); return S.load().platforms; });
  check(was.join(',') === '0.875,0.875,1.175,1.175,0.875,0.875',
    `saved by an older build, SMALL and MEDIUM load as ${was[0]} and ${was[1]} (NORMAL), the old WIDE as ${was[2]} (WIDE); WIDE saved stays ${was[3]}; a width never offered, or none, as ${was[4]} and ${was[5]}`);

  // The towers, in the open shaft and in the opening one: the menu's widths, and 1, the tower
  // with no width said, which every width is measured against.
  const tower = (f, open) => { const tw = f === null ? new Tower(SEED) : new Tower(SEED, false, f); if (open) tw.setBounds(C.PLAY_L, C.PLAY_R); tw.ensure(open ? TOP : 24); return tw; };
  const WIDTHS = [1, ...PLATFORM_WIDTHS];
  const plain = tower(null, true), open = {}, shut = {};
  for (const f of WIDTHS) { open[f] = tower(f, true); shut[f] = tower(f, false); }
  let same = 0;
  for (let n = 1; n <= TOP; n++) {
    const a = plain.floors.get(n), b = open[1].floors.get(n);
    if (a.x === b.x && a.w === b.w && a.kind === b.kind) same++;
  }
  check(same === TOP, `a width of 1 is the tower with no width said: ${same} of ${TOP} floors the same`);
  const median = (tw) => {
    const ws = [];
    for (let n = 100; n <= TOP; n++) { const p = tw.floors.get(n); if (p.kind === 'normal') ws.push(p.w); }
    ws.sort((a, b) => a - b);
    return ws[ws.length >> 1];
  };
  const m = median(open[1]), ratio = PLATFORM_WIDTHS.map((f) => median(open[f]) / m);
  check(PLATFORM_WIDTHS.every((f, j) => Math.abs(ratio[j] - f) < 0.1 * f),
    `the median ledge: ${PLATFORM_WIDTHS.map((f, j) => `${S.PLATFORM_WORDS[f]} ${ratio[j].toFixed(3)}`).join(', ')} of the width-1 tower's ${m}`);
  for (const f of WIDTHS) {
    const least = Math.max(C.SQUEEZE_W_MIN, Math.floor(C.PLAT_W_MIN * f));
    let narrow = Infinity, bad = 0;
    for (const tw of [open[f], shut[f]]) {
      for (let n = 1; n <= tw.highest; n++) {
        const p = tw.floors.get(n);
        if (!isReachable(tw.floors.get(n - 1), p)) bad++;
        if (tw === shut[f]) narrow = Math.min(narrow, p.w);
      }
    }
    check(bad === 0 && narrow === least && least >= C.PLAYER_W + 4,
      `${f}: every floor reachable (${bad} not), and in the opening shaft its narrowest ledge is its own minimum, ${narrow} (want ${least}, a landing needs ${C.PLAYER_W + 4})`);
  }

  // A replay at NORMAL, the default -- a width between two of the file's 5% steps, read back by
  // looking it up (replaycodec.js platformsCode).
  const W = 0.875;
  const digest = (g) => { const p = g.player; return [p.x, p.y, p.vx, p.vy, g.camY, g.riseY, g.score, g.run.maxFloor]; };
  const input = new AutoInput();
  const game = new Game(input);
  const bot = new AutoPlayer(input);
  game.newRun(SEED, null, 1, W);
  const rec = Replay.startRecording(game);
  const log = [];
  for (let n = 0; n < 240 * 60 && game.state === STATE.PLAYING; n++) { bot.step(game, STEP); game.step(STEP); log.push(digest(game)); }
  const rep = rec.finish();
  const back = Replay.importReplay(Replay.exportReplay(rep));
  check(rep.header.platforms === W && back.ok && back.compatible && back.replay.header.platforms === W,
    `recorded at ${rep.header.platforms}, exported and imported at ${back.ok && back.replay.header.platforms}`, back.error || '');
  const play = (replay) => {
    const made = Replay.createPlayback(replay);
    if (!made.ok) return { ok: false, error: made.error };
    const pb = made.playback;
    let first = -1;
    for (let i = 0; i < log.length; i++) {
      if (pb.game.state !== STATE.PLAYING) { first = i; break; }
      pb.step();
      const d = digest(pb.game);
      if (first < 0 && d.some((v, j) => v !== log[i][j])) first = i;
    }
    while (pb.step()) { /* to the end: the checksums */ }
    return { ok: true, first, desync: pb.desync, width: pb.game.platforms };
  };
  const again = back.ok ? play(back.replay) : { ok: false };
  check(again.ok && again.first < 0 && !again.desync && again.width === W,
    `played back on ${again.width}: all ${log.length} steps the run's own, no desync`, `first difference at ${again.first} ${JSON.stringify(again.desync)} ${again.error || ''}`);
  const asMedium = back.ok ? play({ ...back.replay, header: { ...back.replay.header, platforms: 1 } }) : { ok: false };
  check(asMedium.ok && asMedium.first >= 0, `the same file played at a width of 1 is not the run (it parts at step ${asMedium.first}): the header's width is what plays it`);
  // The byte: the companions' movement in bits 0-1, the width's code over them.
  const bytes = Codec.encodeBinary(rep);
  let i = 5 + bytes[4];
  while (bytes[i] & 0x80) i++;                  // simVersion, a varint
  const moveAt = i + 1 + 12 + 1;                // constHash, probeHash, seed; then flags
  const mediumBytes = Codec.encodeBinary({ ...rep, header: { ...rep.header, platforms: 1 } });
  check(Codec.platformsOf(bytes[moveAt] >> 2) === W && (mediumBytes[moveAt] >> 2) === 0 && (mediumBytes[moveAt] & 3) === Codec.MOVES.indexOf(rep.header.companions),
    `the width rides over the companions in their byte (code ${(bytes[moveAt] >> 2) - 64} for NORMAL); a width of 1 writes the byte it always did (${mediumBytes[moveAt]})`);
  // Every width a run has been climbed on -- the menu's and the three it offered before -- has a
  // code of its own and reads back as itself: a file on the old SMALL still reads, on its width.
  const pcodes = S.PLATFORMS_KNOWN.map((w) => Codec.platformsCode(w));
  const oldSmall = Replay.importReplay(Codec.encodeText({ ...rep, header: { ...rep.header, platforms: 0.75 } }));
  check(new Set(pcodes).size === pcodes.length && S.PLATFORMS_KNOWN.every((w, j) => Codec.platformsOf(pcodes[j] & 0x3f) === w)
    && oldSmall.ok && oldSmall.replay.header.platforms === 0.75,
  `every width a run has been climbed on reads back as itself (${S.PLATFORMS_KNOWN.map((w, j) => `${S.PLATFORM_WORDS[w]} ${w}: ${pcodes[j]}`).join(', ')}); a file on the old SMALL reads on ${oldSmall.ok && oldSmall.replay.header.platforms}`, oldSmall.error || '');
  const bad = Uint8Array.from(bytes);
  bad[moveAt] = (bad[moveAt] & 3) | (12 << 2);   // 1.6: no build offered it
  new DataView(bad.buffer).setUint32(bad.length - 4, Codec.crc32(bad, bad.length - 4), true);
  const refused = Replay.importReplay(Codec.PREFIX + Buffer.from(bad).toString('base64').replace(/=+$/, ''));
  check(!refused.ok && /platforms/.test(refused.error || ''), `a file on platforms no build offered is refused: "${refused.error}"`);

  // A race on a NORMAL ghost's course: NORMAL, on through its top, and in its file.
  const survey = new CourseSurvey(rep);
  survey.run();
  const course = survey.course;
  check(!!course && course.gen.widthScale === W, `the survey of a NORMAL run keeps its width: ${course && course.gen.widthScale}`);
  if (course) {
    const ri = new AutoInput();
    const rg = new Game(ri);
    const rb = new AutoPlayer(ri);
    rg.newRun(SEED, course, 1, 1);               // the racer's own width 1, which a course overrides
    const rrec = Replay.startRecording(rg, { ghost: rep });
    for (let n = 0; n < 240 * 20 && rg.state === STATE.PLAYING; n++) { rb.step(rg, STEP); rg.step(STEP); }
    const race = rrec.finish();
    const rback = Replay.importReplay(Replay.exportReplay(race));
    check(rg.platforms === W && race.header.platforms === W && rback.ok && rback.replay.race && rback.replay.race.course
      && rback.replay.race.course.gen.widthScale === W,
      `the race is on its ghost's ${rg.platforms}, recorded so (${race.header.platforms}), its file's course at ${rback.ok && rback.replay.race && rback.replay.race.course.gen.widthScale}`, rback.error || '');
    // Past the top: the course's width, against the same course said to be at 1.
    const past = (c) => { const tw = new CourseTower(SEED, c); tw.setBounds(C.PLAY_L, C.PLAY_R); tw.ensure(c.top + 400); const ws = []; for (let n = c.top + 1; n <= c.top + 400; n++) { const p = tw.floors.get(n); if (p.kind === 'normal') ws.push(p.w); } ws.sort((a, b) => a - b); return ws[ws.length >> 1]; };
    const pm = past(makeCourse({ ...course, gen: { ...course.gen, widthScale: 1 } })), ps = past(course);
    check(Math.abs(ps / pm - W) < 0.08, `past its top the course goes on at its width: the median ledge ${ps} against ${pm} for the same course at 1 (${(ps / pm).toFixed(3)})`);
  }
}

// ---- 9. DIFFICULTY: the fire ---------------------------------------------------------------
console.log('\n  9. DIFFICULTY: EASY, MEDIUM and HARD');
{
  const Replay = await mod('game/replay.js');
  const Codec = await mod('game/replaycodec.js');
  const { AutoInput, AutoPlayer } = await mod('game/autoplay.js');
  const D = C.DIFFICULTIES;
  // The fire at given heights, for a game at each difficulty and one that does not say.
  const fire = (d) => {
    const g = new Game(new AutoInput());
    if (d === null) g.newRun(0x51ed270b); else g.newRun(0x51ed270b, null, 1, 1, d);
    return [0, 50, 200, 453, 900, 2000].map((mf) => { g.run.maxFloor = mf; return [g.riseRate(), g.riseLead(mf), g.difficulty]; });
  };
  const none = fire(null), easy = fire(0), med = fire(1), hard = fire(2);
  check(JSON.stringify(none) === JSON.stringify(easy) && none.every((x) => x[2] === 0),
    `a run that does not say is at EASY, its fire to the bit: ${none.map((x) => x[0].toFixed(1) + '/' + x[1].toFixed(1)).join(' ')}`);
  const ratios = (a) => a.map((x, i) => [x[0] / easy[i][0], x[1] / easy[i][1]]);
  const near = (r, want) => r.every(([rr, ll]) => Math.abs(rr - want.rise) < 1e-9 && Math.abs(ll - want.lead) < 1e-9);
  check(near(ratios(med), D[1]) && near(ratios(hard), D[2]),
    `MEDIUM's fire rises x${D[1].rise} and trails x${D[1].lead}, HARD's x${D[2].rise} and x${D[2].lead}, at every height`);

  // A replay at HARD.
  const digest = (g) => { const p = g.player; return [p.x, p.y, p.vx, p.vy, g.camY, g.riseY, g.score, g.run.maxFloor]; };
  const input = new AutoInput();
  const game = new Game(input);
  const bot = new AutoPlayer(input);
  game.newRun(0x2f6f1b21, null, 1, 1, 2);
  const rec = Replay.startRecording(game);
  const log = [];
  for (let n = 0; n < 240 * 60 && game.state === STATE.PLAYING; n++) { bot.step(game, STEP); game.step(STEP); log.push(digest(game)); }
  const rep = rec.finish();
  const back = Replay.importReplay(Replay.exportReplay(rep));
  check(rep.header.difficulty === 2 && back.ok && back.compatible && back.replay.header.difficulty === 2,
    `recorded at ${rep.header.difficulty}, exported and imported at ${back.ok && back.replay.header.difficulty}`, back.error || '');
  const play = (replay) => {
    const made = Replay.createPlayback(replay);
    if (!made.ok) return { ok: false, error: made.error };
    const pb = made.playback;
    let first = -1;
    for (let i = 0; i < log.length; i++) {
      if (pb.game.state !== STATE.PLAYING) { first = i; break; }
      pb.step();
      const d = digest(pb.game);
      if (first < 0 && d.some((v, j) => v !== log[i][j])) first = i;
    }
    while (pb.step()) { /* to the end: the checksums */ }
    return { ok: true, first, desync: pb.desync, diff: pb.game.difficulty };
  };
  const again = back.ok ? play(back.replay) : { ok: false };
  check(again.ok && again.first < 0 && !again.desync && again.diff === 2,
    `played back at ${again.diff}: all ${log.length} steps the run's own, no desync`, `first difference at ${again.first} ${JSON.stringify(again.desync)} ${again.error || ''}`);
  const asEasy = back.ok ? play({ ...back.replay, header: { ...back.replay.header, difficulty: 0 } }) : { ok: false };
  check(asEasy.ok && asEasy.first >= 0, `the same file played at EASY is not the run (it parts at step ${asEasy.first}): the header's difficulty is what plays it`);
  const bytes = Codec.encodeBinary(rep);
  let i = 5 + bytes[4];
  while (bytes[i] & 0x80) i++;
  const flagsAt = i + 1 + 12;
  const easyBytes = Codec.encodeBinary({ ...rep, header: { ...rep.header, difficulty: 0 } });
  check((bytes[flagsAt] >> 5) === 2 && (easyBytes[flagsAt] >> 5) === 0 && (easyBytes[flagsAt] & 31) === (bytes[flagsAt] & 31),
    `the difficulty rides in bits 5-7 of the flags byte (${bytes[flagsAt] >> 5} for HARD); EASY writes the byte it always did (${easyBytes[flagsAt]})`);
  const bad = Uint8Array.from(bytes);
  bad[flagsAt] = (bad[flagsAt] & 31) | (7 << 5);
  new DataView(bad.buffer).setUint32(bad.length - 4, Codec.crc32(bad, bad.length - 4), true);
  const refused = Replay.importReplay(Codec.PREFIX + Buffer.from(bad).toString('base64').replace(/=+$/, ''));
  check(!refused.ok && /difficulty/.test(refused.error || ''), `a file at a difficulty this build does not offer is refused: "${refused.error}"`);
}

// ---- 10. the default's moves ---------------------------------------------------------------
console.log('\n  10. JUMP SPEED: 120% by default, a 140% saved since the move to it moved back once');
{
  const S = await mod('game/settings.js');
  const KEY = 'dukevytis.settings.v2';
  const loadWith = (saved) => {
    if (saved === null) page.storage.remove ? page.storage.remove(KEY) : page.storage.delete(KEY);
    else page.storage.set(KEY, JSON.stringify(saved));
    return S.load();
  };
  check(S.JUMP_SPEEDS.join(',') === '1,1.1,1.2,1.3,1.4' && S.DEFAULTS.jumpSpeed === 1.2,
    `the menu offers ${S.JUMP_SPEEDS.map((v) => Math.round(v * 100) + '%').join(' ')}, ${Math.round(S.DEFAULTS.jumpSpeed * 100)}% by default`);
  // A save the first move marked (speedV 2) holds 140% as that move, or that day's default, left it.
  const moved = loadWith({ jumpSpeed: 1.4, speedV: 2, guideSeen: true });
  const kept = JSON.parse(page.storage.get(KEY));
  check(moved.jumpSpeed === 1.2 && kept.jumpSpeed === 1.2 && kept.speedV >= 3 && kept.guideSeen === true,
    `a 140% saved since the move to it loads as ${Math.round(moved.jumpSpeed * 100)}% and is saved so (${Math.round(kept.jumpSpeed * 100)}%, marked ${kept.speedV}), the rest of the save kept`);
  const again = loadWith({ jumpSpeed: 1.4, speedV: kept.speedV });
  check(again.jumpSpeed === 1.4, `once: a 140% chosen after the move loads as ${Math.round(again.jumpSpeed * 100)}%`);
  const chosen = loadWith({ jumpSpeed: 1.4 });
  check(chosen.jumpSpeed === 1.4, `a 140% saved before the first move, a choice then, stays ${Math.round(chosen.jumpSpeed * 100)}%`);
  const oldDefault = loadWith({ jumpSpeed: 1.2 });
  check(oldDefault.jumpSpeed === 1.2, `a 120% saved before the first move stays ${Math.round(oldDefault.jumpSpeed * 100)}%`);
  const other = loadWith({ jumpSpeed: 1.1, speedV: 2 });
  check(other.jumpSpeed === 1.1, `a saved 110% stays ${Math.round(other.jumpSpeed * 100)}%`);
  const fresh = loadWith(null);
  check(fresh.jumpSpeed === 1.2, `settings never saved start at ${Math.round(fresh.jumpSpeed * 100)}%`);
}

// ---- 11. GRAVITY: how heavy he is -----------------------------------------------------------
console.log('\n  11. GRAVITY: LOW, NORMAL and HIGH');
{
  const S = await mod('game/settings.js');
  const Replay = await mod('game/replay.js');
  const Codec = await mod('game/replaycodec.js');
  const Stats = await mod('game/stats.js');
  const { gravityOf, terminalOf } = await mod('game/player.js');
  const { Companion } = await mod('game/companions.js');
  const { runSettingsLabel } = await mod('ui/screens.js');
  const { AutoInput, AutoPlayer } = await mod('game/autoplay.js');
  const G = S.GRAVITIES, LOW = G[0], NORMAL = G[1], HIGH = G[G.length - 1];
  const word = (g) => S.GRAVITY_WORDS[g];
  const at = (g) => `${word(g) || g} (${g})`;

  // The menu, and what a save may say.
  const row = S.OPTIONS.findIndex((o) => o.key === 'gravity');
  // Pinned, as the spec they are: the user's (2026-09-29), NORMAL halfway from 1 to LOW and HIGH
  // halfway from 1 to the old HIGH, 1.2.
  check(G.join(',') === '0.8,0.9,1.1' && S.DEFAULTS.gravity === 0.9 && G.map(word).join(' ') === 'LOW NORMAL HIGH'
    && row === S.OPTIONS.findIndex((o) => o.key === 'difficulty') + 1 && S.OPTIONS[row].values === G,
  `the menu offers ${G.map((g) => at(g)).join(', ')} on the row after DIFFICULTY; NORMAL by default`);
  const KEY = 'dukevytis.settings.v2';
  const loaded = [HIGH, 1, 1.2, 1.05, undefined].map((g) => { page.storage.set(KEY, JSON.stringify({ speedV: 2, gravity: g })); return S.load().gravity; });
  check(loaded.join(',') === '1.1,0.9,1.1,0.9,0.9',
    `a saved ${HIGH} loads as ${loaded[0]}; saved by an older build, its NORMAL (1) as ${loaded[1]} and its HIGH (1.2) as ${loaded[2]}; a 1.05, never offered, as ${loaded[3]}; none, as ${loaded[4]}`);

  // A run that says no gravity is at 1 (CLASSIC), to the bit: the attract bot's run on a player
  // tower, not saying, against the same run said at 1 -- and at HIGH it is not that run.
  const botLog = (g) => {
    const input = new AutoInput();
    const game = new Game(input);
    const bot = new AutoPlayer(input);
    if (g === undefined) game.newRun(0x51ed270b, null, 1.4, 0.875, 1); else game.newRun(0x51ed270b, null, 1.4, 0.875, 1, g);
    const log = [];
    for (let n = 0; n < 240 * 45 && game.state === STATE.PLAYING; n++) {
      bot.step(game, STEP);
      game.step(STEP);
      const p = game.player;
      log.push([p.x, p.y, p.vx, p.vy, p.momentum, game.camY, game.riseY, game.score, game.run.maxFloor]);
    }
    return { log, game };
  };
  const partAt = (a, b) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) if (!a[i] || !b[i] || a[i].some((v, j) => !Object.is(v, b[i][j]))) return i;
    return -1;
  };
  const unsaid = botLog(undefined), said = botLog(1), heavy = botLog(HIGH);
  const apart = partAt(unsaid.log, heavy.log);
  check(partAt(unsaid.log, said.log) < 0 && unsaid.game.gravity === 1 && unsaid.game.run.gravity === 1 && apart >= 0,
    `a run that does not say is at 1, to the bit: all ${unsaid.log.length} steps of a bot's run to floor ${unsaid.game.run.maxFloor} as at 1 said; at ${HIGH} it parts at step ${apart}`);
  // ...and 1 is the game as tuned: his gravity and his fall's cap are GRAVITY and TERMINAL
  // themselves, and a standing jump is flown, step by step, exactly as those numbers fly it.
  const std = fly(1, flatTower(), (p) => { p.gravity = 1; }, (p, inp, k) => { inp.jumpHeld = true; if (k === 0) inp.press = true; }, landed);
  let vy = (C.JUMP_V0_MIN + 0 * (C.JUMP_V0_MAX - C.JUMP_V0_MIN) + 0 * C.JUMP_MOMENTUM_BONUS) * 1 * C.INSTAJUMP_BONUS, y = 0, off = -1, k = 0;
  for (; k < std.steps; k++) {
    vy -= C.GRAVITY * STEP;
    if (vy < -C.TERMINAL) vy = -C.TERMINAL;
    y += vy * STEP;
    if (vy <= 0 && y <= 0) { y = 0; break; }
    if (off < 0 && std.path[k + 1].y !== y) off = k;
  }
  const np = new Player();
  check(gravityOf(np) === C.GRAVITY && terminalOf(np) === C.TERMINAL && off < 0 && k + 1 === std.steps && std.path[std.steps].y === 0,
    `...and the game as tuned: his gravity ${gravityOf(np)} and his fall's cap ${terminalOf(np)} (GRAVITY ${C.GRAVITY}, TERMINAL ${C.TERMINAL}), a standing jump every one of its ${std.steps} steps where those numbers put it`,
    `first off at step ${off}, landed at ${k + 1} against ${std.steps}`);

  // Every offered gravity: the same impulse, so a jump rises 1/g as high and stays up 1/g as long.
  const standing = (g) => {
    const r = fly(1, flatTower(), (p) => { p.gravity = g; }, (p, inp, kk) => { inp.jumpHeld = true; if (kk === 0) inp.press = true; }, landed);
    return { top: Math.max(...r.path.map((q) => q.y)), steps: r.steps };
  };
  const s1 = standing(1);
  for (const g of G) {
    const s = standing(g);
    check(Math.abs((s.top / s1.top) * g - 1) <= 0.01 && Math.abs((s.steps / s1.steps) * g - 1) <= 0.02,
      `${at(g)}: a standing jump rises ${s.top.toFixed(1)} units where 1 rises ${s1.top.toFixed(1)} -- x${(s.top / s1.top).toFixed(4)}, 1/g ${(1 / g).toFixed(4)} -- `
      + `and is up ${s.steps} steps to 1's ${s1.steps} (x${(s.steps / s1.steps).toFixed(3)})`);
  }
  // His fall's cap goes with the root of g (player.js terminalOf), so a long fall from rest caps
  // at TERMINAL x root(g), and it does after the same drop at every gravity.
  const ground = { floors: new Map([[0, { x: -1e7, w: 2e7, y: 0 }]]), get(n) { return this.floors.get(n) || null; } };
  const fall = (g) => {
    const vys = [];
    const r = fly(1, ground, (p) => { p.gravity = g; p.grounded = false; p.y = p.py = 3000; }, (p) => { vys.push({ vy: p.vy, y: p.y }); }, landed);
    const cap = Math.min(...vys.map((v) => v.vy));
    const first = vys.find((v) => v.vy === cap);
    return { cap, drop: 3000 - first.y, steps: r.steps };
  };
  const f1 = fall(1);
  const falls = G.map((g) => ({ g, ...fall(g) }));
  check(falls.every((f) => Math.abs(f.cap + C.TERMINAL * Math.sqrt(f.g)) < 1e-9 && Math.abs(f.drop - f1.drop) <= 8),
    `a long fall caps at ${falls.map((f) => (-f.cap).toFixed(1)).join(', ')} units/s (TERMINAL x root g), after a drop of ${falls.map((f) => f.drop.toFixed(1)).join(', ')} units`);

  // THE REACH PROOF, as section 4 flies it, at every gravity and every speed: the generator's
  // gaps are laid for 1, and the weakest jump must still cover one plus his width one floor up.
  const reachAt = (g, s) => {
    const r = fly(s, flatTower(), (p) => { p.gravity = g; p.setBounds(C.PLAY_L, C.PLAY_R); p.x = C.PLAY_L + 20; }, (p, inp, kk) => {
      inp.jumpHeld = true; inp.axis = 1; if (kk === 0) inp.press = true;
    }, landed);
    let top = 0, cross = null;
    for (let i = 1; i < r.path.length; i++) {
      const a = r.path[i - 1], b = r.path[i];
      top = Math.max(top, b.y);
      if (cross === null && top > C.FLOOR_H && a.y >= C.FLOOR_H && b.y < C.FLOOR_H) cross = a.x + (b.x - a.x) * (a.y - C.FLOOR_H) / (a.y - b.y);
    }
    return cross === null ? -1 : cross - (C.PLAY_L + 20);
  };
  const need = MAX_EDGE_GAP + C.PLAYER_W;
  for (const g of G) {
    const dx = JUMP_SPEEDS.map((s) => reachAt(g, s));
    check(dx.every((d) => d >= need),
      `${at(g)}: the weakest jump reaches ${dx.map((d) => d.toFixed(1)).join(', ')} units across one floor up at ${JUMP_SPEEDS.map((s) => Math.round(s * 100) + '%').join(', ')} (the generator's gap ${MAX_EDGE_GAP} plus his ${C.PLAYER_W}: ${need})`);
  }
  // HIGH is the user's, not the heaviest the tower allows: that is 1.2, the old HIGH, and a 5%
  // step more falls short.
  const heaviest = reachAt(1.2, 1), over = reachAt(1.25, 1);
  check(heaviest >= need && over < need,
    `HIGH at ${HIGH} is lighter than the tower allows: the heaviest that holds is 1.2 (reaching ${heaviest.toFixed(1)}), and 1.25 reaches ${over.toFixed(1)}, short of ${need}`);

  // What forecasts his flight falls by his gravity. The attract bot: it lands where it planned
  // as often at every offered gravity as at 1 (a bot planning on the world's gravity at 1.2
  // landed short on half its jumps and was caught in seconds).
  const plansMade = (g) => {
    let plans = 0, hits = 0;
    for (const seed of [0x51ed270b, 0x2f6f1b21, 12345]) {
      const input = new AutoInput();
      const game = new Game(input);
      const bot = new AutoPlayer(input);
      game.newRun(seed, null, 1, 1, 0, g);
      let planned = null, jumps = 0;
      for (let n = 0; n < 240 * 30 && game.state === STATE.PLAYING; n++) {
        bot.step(game, STEP);
        const from = game.player.floor, plan = bot.plan;
        game.step(STEP);
        const up = game.run.jumps - game.run.doubleJumps - game.run.tripleJumps;   // from the ground
        if (up > jumps) { jumps = up; planned = plan && plan.k ? from + plan.k : null; }
        if (planned !== null && game.player.grounded) { plans++; if (game.player.floor >= planned) hits++; planned = null; }
      }
    }
    return { plans, hits, rate: hits / Math.max(1, plans) };
  };
  const b1 = plansMade(1), bs = G.map((g) => plansMade(g));
  check(b1.plans > 50 && bs.every((b) => b.plans > 50 && b.rate >= b1.rate - 0.1),
    `the attract bot lands where it planned on ${bs.map((b, j) => `${(100 * b.rate).toFixed(0)}% of its jumps at ${word(G[j])}`).join(', ')}, and ${(100 * b1.rate).toFixed(0)}% at 1 (${bs.map((b) => b.plans).join(', ')}, ${b1.plans} jumps)`);
  // The companions: their forecast of his landing, and of his speed on the way down.
  for (const g of G) {
    const tower = flatTower();
    let said2 = null, his = null, apexK = -1;
    const vys = [];
    const r = fly(1, tower, (p) => { p.gravity = g; }, (p, inp, kk) => {
      inp.jumpHeld = true;
      if (kk === 0) inp.press = true;
      if (said2 === null && kk > 0 && p.vy <= 0 && !p.grounded) { said2 = hisLanding(p, tower).t; his = Companion.prototype.predictor.call(null, p, tower); apexK = kk; }
      if (said2 !== null) vys.push(p.vy);
    }, landed);
    const real = (r.steps - apexK) * STEP;
    let worst = 0;
    for (let n = 0; n < vys.length && (n + 2) * STEP < his.land.t; n++) worst = Math.max(worst, Math.abs(his.vy(n * STEP) - vys[n]));
    check(said2 !== null && Math.abs(said2 - real) <= 2 * STEP && worst < 1e-6,
      `${at(g)}: the companions' forecast of his landing ${said2 && said2.toFixed(4)} s, and he lands in ${real.toFixed(4)} s; their forecast of his speed on the way down within ${worst.toExponential(1)} units/s`);
  }

  // A replay at HIGH, on every other setting away from the defaults too: 120%, WIDE and HARD.
  const digest = (g) => { const p = g.player; return [p.x, p.y, p.vx, p.vy, g.camY, g.riseY, g.score, g.run.maxFloor]; };
  const input = new AutoInput();
  const game = new Game(input);
  const bot = new AutoPlayer(input);
  game.newRun(0x2f6f1b21, null, 1.2, 1.175, 2, HIGH);
  const rec = Replay.startRecording(game);
  const log = [];
  for (let n = 0; n < 240 * 60 && game.state === STATE.PLAYING; n++) { bot.step(game, STEP); game.step(STEP); log.push(digest(game)); }
  const rep = rec.finish();
  const back = Replay.importReplay(Replay.exportReplay(rep));
  const bh = back.ok ? back.replay.header : {};
  check(rep.header.gravity === HIGH && back.ok && back.compatible && bh.gravity === HIGH && bh.jumpSpeed === 1.2 && bh.platforms === 1.175 && bh.difficulty === 2
    && back.replay.format === Codec.FORMAT && game.run.gravity === HIGH,
  `recorded at ${rep.header.gravity}, exported and imported at ${bh.gravity}, with 120%, WIDE and HARD beside it (${bh.jumpSpeed}, ${bh.platforms}, ${bh.difficulty})`, back.error || '');
  const play = (replay) => {
    const made = Replay.createPlayback(replay);
    if (!made.ok) return { ok: false, error: made.error };
    const pb = made.playback;
    let first = -1;
    for (let i = 0; i < log.length; i++) {
      // Over before the run was is a difference too -- but not a later one than the first seen.
      if (pb.game.state !== STATE.PLAYING) { if (first < 0) first = i; break; }
      pb.step();
      const d = digest(pb.game);
      if (first < 0 && d.some((v, j) => v !== log[i][j])) first = i;
    }
    while (pb.step()) { /* to the end: the checksums */ }
    return { ok: true, first, desync: pb.desync, grav: pb.game.gravity };
  };
  const again = back.ok ? play(back.replay) : { ok: false };
  check(again.ok && again.first < 0 && !again.desync && again.grav === HIGH,
    `played back at ${again.grav}: all ${log.length} steps the run's own, no desync`, `first difference at ${again.first} ${JSON.stringify(again.desync)} ${again.error || ''}`);
  const asNormal = back.ok ? play({ ...back.replay, header: { ...back.replay.header, gravity: NORMAL } }) : { ok: false };
  check(asNormal.ok && asNormal.first >= 0, `the same file played at NORMAL is not the run (it parts at step ${asNormal.first}): the header's gravity is what plays it`);
  // Stored and listed.
  const mem = new Map();
  Replay.setReplayBackend({ get: (kk) => (mem.has(kk) ? mem.get(kk) : null), set: (kk, v) => { mem.set(kk, v); }, remove: (kk) => { mem.delete(kk); }, keys: () => [...mem.keys()] });
  const saved = Replay.saveRun(back.ok ? back.replay : rep);
  const listed = saved.ok ? Replay.listReplays().find((e) => e.id === saved.id) : null;
  const fromStore = saved.ok ? Replay.loadReplay(saved.id) : { ok: false };
  check(saved.ok && saved.kept && listed && listed.gravity === HIGH && listed.playable && fromStore.ok && fromStore.replay.header.gravity === HIGH,
    `stored, listed at ${listed && listed.gravity} and playable, loaded back at ${fromStore.ok && fromStore.replay.header.gravity}`, saved.error || '');

  // The bytes. HIGH is format 3, its code in a byte of its own after the companions' -- and so is
  // NORMAL, 0.9; a gravity of 1 writes the layout every replay had before -- which is HIGH's bytes
  // without that byte -- and that layout reads as 1.
  const bytes = Codec.encodeBinary(rep);
  let i = 5 + bytes[4];
  while (bytes[i] & 0x80) i++;                 // simVersion, a varint
  const moreAt = i + 1 + 12 + 2;               // constHash, probeHash, seed; flags, companions
  const reseal = (b) => { new DataView(b.buffer).setUint32(b.length - 4, Codec.crc32(b, b.length - 4), true); return b; };
  const text = (b) => Codec.PREFIX + Buffer.from(b).toString('base64').replace(/=+$/, '');
  const old = reseal(Uint8Array.from([...bytes.slice(0, moreAt), ...bytes.slice(moreAt + 1)]));
  old[3] = Codec.FORMAT;
  reseal(old);
  const classic = Codec.encodeBinary({ ...rep, header: { ...rep.header, gravity: 1 } });
  const normalBytes = Codec.encodeBinary({ ...rep, header: { ...rep.header, gravity: NORMAL } });
  const oldBack = Replay.importReplay(text(old));
  const oh = oldBack.ok ? oldBack.replay.header : {};
  check(bytes[3] === Codec.FORMAT + Codec.FORMAT_MORE && Codec.gravityFor(bytes[moreAt]) === HIGH
    && normalBytes[3] === Codec.FORMAT + Codec.FORMAT_MORE && Codec.gravityFor(normalBytes[moreAt]) === NORMAL
    && classic.length === old.length && classic.every((v, j) => v === old[j])
    && oldBack.ok && oh.gravity === 1 && oh.jumpSpeed === 1.2 && oh.platforms === 1.175 && oh.difficulty === 2,
  `HIGH is written as format ${bytes[3]} with its code (${bytes[moreAt] & 15}) in a byte of its own, NORMAL as format ${normalBytes[3]}; 1 writes format ${classic[3]}, the layout every replay had before, `
    + `and a file in it reads as ${at(oh.gravity)} with the rest of its header as it was`, oldBack.error || '');
  const lowBack = Replay.importReplay(Codec.encodeText({ ...rep, header: { ...rep.header, gravity: LOW } }));
  const gcodes = S.GRAVITIES_KNOWN.map((g) => Codec.gravityCode(g));
  check(lowBack.ok && lowBack.replay.header.gravity === LOW && new Set(gcodes).size === gcodes.length
    && S.GRAVITIES_KNOWN.every((g, j) => Codec.gravityFor(gcodes[j] & 0x1f) === g),
  `LOW's code is negative (${Codec.gravityCode(LOW)}) and reads back as ${lowBack.ok && lowBack.replay.header.gravity}; every gravity a run has been climbed at reads back as itself (${S.GRAVITIES_KNOWN.map((g, j) => `${word(g)} ${g}: ${gcodes[j]}`).join(', ')})`, lowBack.error || '');
  const refusal = (edit) => { const b = Uint8Array.from(bytes); edit(b); return Replay.importReplay(text(reseal(b))); };
  const unoffered = refusal((b) => { b[moreAt] = 6; });             // 1.3: no build offered it
  const later = refusal((b) => { b[moreAt] |= 0x20; });             // a bit a later build's setting would set
  const empty = refusal((b) => { b[moreAt] = 0; });                 // NORMAL in the byte: not a file this game writes
  check(!unoffered.ok && /gravity/.test(unoffered.error || '') && !later.ok && /newer version/.test(later.error || '') && !empty.ok,
    `refused: a gravity this build does not offer ("${unoffered.error}"), a bit it does not know ("${later.error}"), a byte that says nothing ("${empty.error}")`);
  // A race at HIGH is format 4, and reads back as a race.
  const ri = new AutoInput();
  const rg = new Game(ri);
  const rb = new AutoPlayer(ri);
  rg.newRun(0x2f6f1b21, null, 1, 1, 0, HIGH);
  const rrec = Replay.startRecording(rg, { ghost: rep });
  for (let n = 0; n < 240 * 10 && rg.state === STATE.PLAYING; n++) { rb.step(rg, STEP); rg.step(STEP); }
  const race = rrec.finish();
  const raceText = Replay.exportReplay(race);
  const raceBack = Replay.importReplay(raceText);
  check(Codec.encodeBinary(race)[3] === Codec.FORMAT_RACE + Codec.FORMAT_MORE && raceBack.ok && raceBack.replay.format === Codec.FORMAT_RACE
    && raceBack.replay.race && raceBack.replay.race.ghost && raceBack.replay.header.gravity === HIGH && Replay.exportReplay(raceBack.replay) === raceText,
  `a race at HIGH is written as format ${Codec.encodeBinary(race)[3]}, reads back as a race with its ghost at ${raceBack.ok && raceBack.replay.header.gravity}, and writes the same text again`, raceBack.error || '');

  // The stats' run history keeps it, as it keeps `plat` and `diff`.
  const all = Stats.BLANK_ALL();
  Stats.commit(all, { ...Stats.BLANK_RUN(), maxFloor: 12, gravity: HIGH }, 0);
  check(Stats.BLANK_RUN().gravity === 1 && all.recent[0].grav === HIGH, `the stats' run history keeps a run's gravity (grav ${all.recent[0].grav}; a blank run's ${Stats.BLANK_RUN().gravity})`);

  // The scoreboard's THIS RUN line names it, in full alone and short with others, in sixteen letters:
  // every gravity and width a run can be at -- the menu's, and the old ones a race on an old ghost's
  // tower is at (CLASSIC and HEAVY, SMALL, MEDIUM and X-WIDE).
  const D = S.DEFAULTS;
  const label = (sp, pl, df, gv) => runSettingsLabel({ jumpSpeed: sp, platforms: pl, difficulty: df, gravity: gv });
  const every = [];
  for (const sp of S.JUMP_SPEEDS) for (const pl of S.PLATFORMS_KNOWN) for (const df of S.DIFFICULTY_LEVELS) for (const gv of S.GRAVITIES_KNOWN) every.push({ gv, s: label(sp, pl, df, gv) });
  const longest = every.reduce((a, b) => (b.s.length > a.s.length ? b : a));
  const named = every.every(({ gv, s }) => gv === D.gravity ? !/GRAVITY|-G/.test(s) : s.includes(word(gv).slice(0, 2)) && /GRAVITY|-G/.test(s));
  check(label(D.jumpSpeed, D.platforms, D.difficulty, D.gravity) === '' && label(D.jumpSpeed, D.platforms, D.difficulty, LOW) === 'LOW GRAVITY'
    && label(D.jumpSpeed, D.platforms, D.difficulty, HIGH) === 'HIGH GRAVITY' && label(D.jumpSpeed, D.platforms, D.difficulty, 1) === 'CLASSIC GRAVITY'
    && label(1, D.platforms, D.difficulty, LOW) === '100% LOW-G' && label(1, 1, 0, D.gravity) === '100% MEDIUM EASY' && named && longest.s.length <= 16,
  `the scoreboard says '${label(D.jumpSpeed, D.platforms, D.difficulty, HIGH)}' alone, '${label(1, D.platforms, D.difficulty, LOW)}' with a speed, `
    + `'${label(1, 1, 0, 1.2)}' with all four; every one of ${every.length} combinations names a gravity away from NORMAL, the longest '${longest.s}' (${longest.s.length} letters)`);
}

console.log(`\n  ${pass} passed, ${failed} failed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failed ? 1 : 0);
