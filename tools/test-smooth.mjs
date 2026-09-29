// Nothing is made or brought up in a frame that matters: in a run, in the fall and on the
// scoreboard, no canvas is created and none is drawn from for the first time, nothing is
// painted in the fall, and what is painted ahead in a run keeps its budget, slice by slice.
//
//   node tools/test-smooth.mjs                 the suite
//   node tools/test-smooth.mjs --mutate=NAME   the same, against a copy of src/ broken on purpose
//   node tools/test-smooth.mjs --mutants       every mutation in turn (one process at a time);
//                                              each must fail the check it names
//
// WHY IT EXISTS. The user asked for the fall to be smooth and the game to feel premium. The
// game paints its art ahead into canvases -- every zone's backdrop, walls, streaks, furniture,
// ledges, the companions, the zone titles, the HUD's skins, the scoreboards, the burn -- and
// in Chromium a canvas has two first times that cost a frame whatever the JavaScript did: its
// backing is allocated when it is first drawn into, and what was painted into it is rastered
// when it is first drawn FROM. Measured in an offscreen Electron window at 160 Hz, the frames
// of the climb over 8 ms were all painting ahead done in a frame of play -- a zone title a
// piece a frame, a backdrop layer a frame, a zone's furniture at once -- and the fall's first
// frame brought up the burn and a new layer for the HUD. src/render/prepaint.js now paints the
// scenery at load, the title screen paints every title, and in a run only the next zone's
// skin and scoreboard are painted, in slices under a budget, into canvases the zones behind
// let go of (src/render/canvases.js). This holds it there.
//
// WHAT IT RUNS. The real src/main.js, booted on a fake page (tools/fakepage.mjs) and driven a
// frame at a time through its own Loop at 60 Hz -- the slowest display, where a budget buys
// the least -- with the planning bot at the player's controls and the fire held off until a
// death is wanted. The screen, and the fall's own full-screen layers, are drawn without their
// pixels (every call is still made and counted; only the rasterising is skipped), so a
// session of two minutes of play runs in about a minute:
//
//   WARM   the title screen until everything it paints ahead is done (it says how long), then
//          a run through five zones, the fire, the fall played out and the board; SPACE, and a
//          second run through two zones, a fall cut short by SPACE, the board;
//   COLD   the titles forgotten, the title screen left at once, and a run through two zones:
//          the titles are painted in the run (the title screen had no time), under their own
//          budget; and a fall.
//
// WHAT IT HOLDS IT TO.
//   1. NOTHING MADE IN PLAY  in WARM, from the run's first frame to the end, in PLAYING,
//                    PAUSED, FALLING and DEAD: not one canvas created, not one canvas drawn
//                    from for the first time (a canvas is "seen" from the page's first frame,
//                    boot included, so a canvas brought up at load or on the title screen is
//                    not a first). Where each one came from is printed.
//   2. NOTHING IN THE FALL   in every fall and on every board of both sessions: no canvas made,
//                    none first drawn from, nothing drawn into any canvas but the screen, the
//                    fall's own layers (the burn's, the HUD's exit, the backdrop's fade buffer)
//                    and the impact's faded words (gameoverskin.js fadeLayer, as
//                    test-boardwarm allows), no blend used for the first time in the session
//                    (a first 'destination-out' or 'source-atop' is the GPU compiling the
//                    burn's programs in the frame of the catch), and no painter's step:
//                    the scoreboards', the titles', the skins', the callouts', the menus' and
//                    the pool's counters all stand still.
//   3. THE BUDGETS           every call that painted ahead, less any collector's pause inside
//                    it, at p99 within its budget: a skin in a run SKIN_WARM_MS, a title in a
//                    run TITLE_WARM_MS (COLD) and on the title screen TITLE_IDLE_MS, a
//                    scoreboard BOARD_WARM_MS and BOARD_IDLE_MS. p99.9 and the worst are
//                    printed; the worst is the collector or another process as often as not.
//   4. EVERY SLICE SMALL     every zone's skin and title painted with the clock already past
//                    its deadline at each check, so each call resumes its painter for exactly
//                    one slice: the same number of slices in three paintings, the same pixels
//                    as painted whole, and the slices (each the fastest of three) within
//                    BOARD_SLICE_MS at p99.9, none over SLICE_MAX. With 3, that bounds every
//                    frame.
//   5. ONE WORD BOX          every zone's GAME and OVER fit gameoverskin.js WORD_BOX, the one
//                    size their canvases are, so a board reuses a board's.
//   6. CLEAN REUSE           every zone's skin and board painted into canvases another zone's
//                    let go of is pixel for pixel its painting into fresh canvases.
//   7. READY AT LOAD         before the first frame, the pieces a run wants at once and no painter
//                    can slice -- the Duke's two atlases and every floater ink -- are canvases
//                    already, and brought up. Checks 1 and 2 cannot see these: WARM starts
//                    after the title screen's demo has drawn him and thrown floaters, and COLD
//                    after WARM. Left to their first use they landed in a run started within
//                    a second or two of the title screen: a 69 ms frame at its start, another
//                    at his first turn, and seventeen 12 ms frames for the inks (measured in an
//                    offscreen Electron window at 160 Hz, the verifier of the change, 2026-09-28).
//   Reported: what the load's prepaint took and holds, the pool's spares, how long the title
//   screen took to paint ahead.
//
// MUTATIONS (--mutate=NAME), each a copy of src/ with one line changed; each must FAIL the check
// in brackets:
//   nopool      canvases.js never hands back a released canvas          [1]
//   notouch     canvases.js touchCanvas draws nothing                   [1]
//   noprepaint  prepaint.js does not paint the backdrops at load        [1]
//   hudexit     prepaint.js does not make the HUD's exit layer          [2]
//   fadepool    gameoverskin.js makes no fade layers at load            [2]
//   burnwarm    prepaint.js does not bring the burn up                  [2]
//   fallgate    hudskin.js paints the next skin in the fall too         [2]
//   titlegate   zonetitles.js paints the next title in the fall too     [2]
//   skinpiece   hudskin.js paints a whole piece of a skin a frame       [3]
//   titlepiece  zonetitles.js paints a whole title in one frame of a run [3]
//   idleburst   zonetitles.js takes 40 ms of a title-screen frame       [3]
//   coarse      the title painters' rows go on the canvas a frame at a time [4]
//   dirty       canvases.js hands a released canvas on without clearing it [6]
//   nosprites   prepaint.js does not build the Duke's atlases           [7]
//   noinks      the load paints no floater ink: not prepaint.js, and not    [7]
//               main.js's warm-up of the callouts either (warmComboTextAll, which paints
//               them too since 2026-09-29, so taking prepaint's alone changed nothing)
//   noletters   gameoverskin.js does not paint the board's lettering at load (the menus'
//               lettering the board, the fall's words, the herald and the calls draw) [2]
//   nobringup   menuskin.js paints its pieces without bringing them up, so the board draws
//               from canvases no frame has drawn from                      [2]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PerformanceObserver } from 'node:perf_hooks';
import { installPage, bootMain, key } from './fakepage.mjs';
import { HeadlessCanvas } from './headless.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const MUTATE = (argv.find((a) => a.startsWith('--mutate=')) || '').slice(9) || null;

// --- the mutations --------------------------------------------------------------------------
const MUTANTS = {
  nopool: [1, 'render/canvases.js', '  const list = free.get(keyOf(w, h));', '  const list = null;'],
  notouch: [1, 'render/canvases.js', '  sinkG.drawImage(c, 0, 0, 1, 1, 0, 0, 1, 1);', '  // mutated: no touch'],
  noprepaint: [1, 'render/prepaint.js', '  for (let i = 0; i < THEMES.length; i++) renderer.backdrop.layers(i, THEMES[i]);', '  // mutated: no backdrops'],
  hudexit: [2, 'render/prepaint.js', '  warmHudExit();', '  // mutated: no exit layer'],
  fadepool: [2, 'render/gameoverskin.js', 'const FADE_LAYERS = 5;', 'const FADE_LAYERS = 0;'],
  burnwarm: [2, 'render/prepaint.js', '  renderer.warmBurnLayer();', '  // mutated: no burn'],
  fallgate: [2, 'render/hudskin.js', "  if (framesIn >= WARM_AFTER && (st === 'playing' || st === 'paused')) {", '  if (framesIn >= WARM_AFTER) {'],
  titlegate: [2, 'render/zonetitles.js', "  if (game.state !== 'playing' && game.state !== 'paused') return;", '  // mutated: no gate'],
  skinpiece: [3, 'render/hudskin.js', '      const r = paintingFor(ahead, () => runUntil(ahead.run, t0 + SKIN_WARM_MS - BOARD_SLICE_MS));',
    '      const r = { done: !stepSkin(ahead) || !ahead.pending.length };'],
  titlepiece: [3, 'render/zonetitles.js', '  paintUntil(e, t0 + TITLE_WARM_MS - BOARD_SLICE_MS);', '  paintUntil(e, Infinity);'],
  idleburst: [3, 'render/zonetitles.js', 'export const TITLE_IDLE_MS = 2.5;', 'export const TITLE_IDLE_MS = 40;'],
  dirty: [6, 'render/canvases.js', '    g.clearRect(0, 0, w, h);\n    stats.reused++;', '    stats.reused++;'],
  coarse: [4, 'render/zonetitles.js', '      if (overdue()) yield;\n      pixToCanvas(pix, g, 0, f * h, y, y + 1);',
    '      if (y === 0) pixToCanvas(pix, g, 0, f * h);'],
  nosprites: [7, 'render/prepaint.js', '  spriteAtlas(false);\n  spriteAtlas(true);', '  // mutated: no atlases'],
  noinks: [7, 'render/prepaint.js', '  warmInks();', '  // mutated: no inks',
    [['main.js', 'warmComboTextAll(demoGame);', '// mutated: no inks at load either']]],
  noletters: [2, 'render/gameoverskin.js', 'export function warmBoardLettering() { menuWarmNow(LETTERING); }',
    'export function warmBoardLettering() {}'],
  nobringup: [2, 'render/menuskin.js', '  touchCanvas(c);\n  return c;\n}', '  return c;\n}'],
};

if (argv.includes('--mutants')) {
  // One process at a time, each its own copy of the game.
  let bad = 0;
  for (const [name, [check]] of Object.entries(MUTANTS)) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), `--mutate=${name}`], { encoding: 'utf8' });
    const out = (r.stdout || '') + (r.stderr || '');
    const failed = [...out.matchAll(/FAIL \[(\d)\]/g)].map((m) => Number(m[1]));
    const caught = r.status !== 0 && failed.includes(check);
    if (!caught) bad++;
    console.log(`  ${caught ? 'ok  ' : 'FAIL'} ${name}: ${caught ? `fails check ${check}` : `survived (exit ${r.status}, failed ${failed.join(',') || 'nothing'})`}` +
      (failed.length ? `  [failed: ${[...new Set(failed)].join(', ')}]` : ''));
  }
  console.log(`\n  ${bad ? bad + ' MUTANT(S) SURVIVED' : 'every mutant fails the check it names'}`);
  process.exit(bad ? 1 : 0);
}

/**
 * src/, or a copy of it with one line changed -- or more: a mutant's fifth element lists
 * further [file, from, to] patches, for a property two places hold. Returns the file URL of
 * its directory.
 */
function sourceTree() {
  const real = path.resolve(HERE, '..', 'src');
  if (!MUTATE) return pathToFileURL(real + path.sep).href;
  const m = MUTANTS[MUTATE];
  if (!m) { console.log(`no mutation ${MUTATE}`); process.exit(2); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-smooth-'));
  const copy = path.join(dir, 'src');
  fs.cpSync(real, copy, { recursive: true });
  for (const [file, from, to] of [[m[1], m[2], m[3]], ...(m[4] || [])]) {
    const f = path.join(copy, file);
    // The files are CRLF on a Windows checkout: match on LF, write back as found.
    const raw = fs.readFileSync(f, 'utf8');
    const crlf = raw.includes('\r\n');
    const text = raw.replace(/\r\n/g, '\n');
    const n = text.split(from).length - 1;
    if (n !== 1) { console.log(`mutation ${MUTATE}: the line occurs ${n} times in ${file}, not once -- the test is out of date`); process.exit(2); }
    let out = text.replace(from, to);
    if (crlf) out = out.replace(/\n/g, '\r\n');
    fs.writeFileSync(f, out);
    console.log(`  (mutated: ${MUTATE}, ${file})`);
  }
  return pathToFileURL(copy + path.sep).href;
}
const SRC = sourceTree();

let fails = 0;
const ok = (check, cond, msg) => { console.log(`  ${cond ? 'ok  ' : `FAIL [${check}]`} ${msg}`); if (!cond) fails++; return cond; };
const t0 = Date.now();
const pct = (arr, p) => { const s = Float64Array.from(arr).sort(); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };

// --- the page, and everything it does with canvases, from before the first module loads -----
const page = installPage({ seed: 20260928 });
let V = null;
// Off once the sessions are over: what 4 and 5 paint is the test's own doing.
let tracking = true;
const STATE = () => (V && tracking ? V.game.state : 'boot');
const HOT = new Set(['playing', 'paused', 'falling', 'dead']);
const FALL = new Set(['falling', 'dead']);
let session = 'boot';              // 'warm' or 'cold' once a run has started
const where = () => new Error().stack.split('\n').slice(3, 9).map((s) => s.trim().replace(/^at /, '')
  .replace(/\(?file:\/\/\/[^)]*\/(src|tools)\//, '$1/').replace(/\)$/, '')).filter((s) => !s.includes('test-smooth')).slice(0, 3).join(' < ');
const rec = { made: [], first: [], paint: [], ops: [], steps: [] };
const seenFrom = new WeakSet();
const opsSeen = new Set(['source-over']);
let screen = null;
// Every canvas made, and where, if it is made while a run or its fall is up.
{
  const ce = page.doc.createElement;
  page.doc.createElement = function (tag) {
    const c = ce.call(this, tag);
    if (tag === 'canvas') {
      const st = STATE();
      if (HOT.has(st)) rec.made.push({ session, st, c, at: where() });
    }
    return c;
  };
}
// Every draw: the first time a canvas is drawn from, any draw into a canvas that is not the
// screen or one of the frame's own layers, and the first time a blend is used. The screen and
// the full-screen layers are not rasterised (nothing here reads them back), which is most of
// what a headless frame costs.
const layerOf = (c) => c === screen || !!c.layer;
{
  const P = Object.getPrototypeOf(new HeadlessCanvas(1, 1).getContext('2d'));
  const wrap = (name, onDraw) => {
    const orig = P[name];
    P[name] = function (...a) {
      const st = STATE();
      const dst = this.canvas;
      onDraw(this, a, st);
      if (FALL.has(st) && dst !== screen && !dst.layer && !dst.boardWord) {
        rec.paint.push({ session, st, what: name, dst: `${dst.width}x${dst.height}`, at: where() });
      }
      if (name !== 'clearRect' && !opsSeen.has(this.globalCompositeOperation)) {
        opsSeen.add(this.globalCompositeOperation);
        if (FALL.has(st)) rec.ops.push({ session, st, op: this.globalCompositeOperation, at: where() });
      }
      if (layerOf(dst)) return undefined;
      return orig.apply(this, a);
    };
  };
  wrap('drawImage', (ctx, a, st) => {
    const img = a[0];
    if (img && typeof img.getContext === 'function' && !seenFrom.has(img)) {
      seenFrom.add(img);
      if (HOT.has(st)) rec.first.push({ session, st, src: `${img.width}x${img.height}`, at: where() });
    }
  });
  for (const m of ['fillRect', 'clearRect', 'fill', 'stroke']) wrap(m, () => {});
}

// The collector's pauses, to take out of the painters' time (as test-boardwarm does).
const gcs = [];
new PerformanceObserver((list) => { for (const e of list.getEntries()) gcs.push([e.startTime, e.startTime + e.duration]); })
  .observe({ entryTypes: ['gc'] });

V = await bootMain(SRC + 'main.js');
screen = V.renderer.canvas;
const imp = (p) => import(SRC + p);
const C = await imp('game/constants.js');
const { THEMES } = await imp('game/themes.js');
const { AutoInput, AutoPlayer } = await imp('game/autoplay.js');
const GS = await imp('render/gameoverskin.js');
const HS = await imp('render/hudskin.js');
const ZT = await imp('render/zonetitles.js');
const CO = await imp('render/callouts.js');
const MS = await imp('render/menuskin.js');
const CV = await imp('render/canvases.js');
const PP = await imp('render/prepaint.js');
const { TITLE_PAINTERS } = await imp('render/titlepaint/index.js');
const { layoutSteps } = await imp('render/titlepaint/util.js');
const { drain } = await imp('render/slices.js');
const game = V.game;
const loaded = PP.prepaintStats();

// --- 7. ready at load, before the first frame ----------------------------------------------------
// Asked for again now: whatever the load left out is built by the asking, which canvases.js
// counts (every canvas the painters make comes through it). Nothing may be, and what comes back
// must have been drawn from already (touched, so its first draw in a frame brings nothing up).
{
  const SP = await imp('render/sprites.js');
  const m0 = CV.poolStats().made;
  const atlases = [SP.spriteAtlas(false), SP.spriteAtlas(true)];
  const builtAtlases = CV.poolStats().made - m0;
  const m1 = CV.poolStats().made;
  CO.warmInks();
  const builtInks = CV.poolStats().made - m1;
  const inks = CO.calloutStats().inks;
  const cold = atlases.filter((c) => !seenFrom.has(c)).length;
  ok(7, builtAtlases === 0 && builtInks === 0 && cold === 0 && inks > 0,
    `ready at load: the Duke's two atlases and all ${inks} floater inks were painted and brought up before the first frame` +
    (builtAtlases || builtInks || cold ? ` -- not so: ${builtAtlases} atlases and ${builtInks} inks built only when asked for, ${cold} atlases never drawn from` : ''));
}

// --- the frame driver: main.js's own Loop, a frame at a time, on a fake clock ----------------
const HZ = 60;
V.loop.running = true;
V.loop.fallback = true;             // no requestAnimationFrame to re-arm
let T = 1000;
V.loop.prev = T;
const bot = { input: new AutoInput(), player: null, hold: false, catchNow: false };
{
  const upd = V.loop.update;
  V.loop.update = (dt) => {
    if (bot.player && game.state === 'playing') {
      if (bot.hold && game.riseActive) game.riseY = Math.min(game.riseY, game.player.y - 300);
      if (bot.catchNow) { bot.catchNow = false; game.riseY = game.player.y; game.caughtByFloor(); }
      else bot.player.step(game, dt);
    }
    upd(dt);
  };
}
/** What the painters have done so far: in the fall, none of it may move. */
function counters() {
  const b = GS.boardStats(), c = CO.calloutStats(), m = MS.menuStats(), h = HS.hudSkinStats(), p = CV.poolStats();
  const tw = ZT.titleWarmTimes(), bw = GS.boardWarmTimes();
  return [b.slices, b.done.length, c.pieces.length, c.badgePieces.length, c.inkMs.length, m.builds, h.lateBuilds,
    HS.skinWarmTimes().length, tw.play.length, tw.idle.length, bw.play.length, ZT.titleLateBuilds(), p.made, p.touched, p.reused].join(',');
}
const keyPress = (code) => { key(page.win, 'keydown', code); key(page.win, 'keyup', code); };
let framesRun = 0;
async function frame() {
  // Now and then back to the event loop: the collector's pauses are reported there, and they
  // are taken out of the painters' time below.
  if (++framesRun % 30 === 0) await new Promise((r) => setImmediate(r));
  T += 1000 / HZ;
  // Taken before every frame of a run, not only the fall's: the frame the fire takes him
  // starts in PLAYING, and its drawing -- the HUD drawn once more into the layer it fades out
  // as -- is already the fall's. A frame that ends in the fall stepped no painter.
  const before = HOT.has(STATE()) ? counters() : null;
  V.loop._tick(T);
  const st = STATE();
  if (before !== null && FALL.has(st)) {
    const after = counters();
    if (after !== before) rec.steps.push({ session, st, before, after });
  }
}
const run = async (sec) => { for (let i = 0, n = Math.round(sec * HZ); i < n; i++) await frame(); };

/**
 * A run from the title screen: SPACE (and ESCAPE past the guide a first run opens), then the
 * bot climbs through `zones` zone changes, `after` seconds more, and the fire takes him; the
 * fall plays out, or SPACE cuts it `skip` seconds in; `board` seconds of the scoreboard.
 */
async function aRun(seed, zones, after, skip, board) {
  keyPress('Space');
  // Ten seconds idle on the title puts its attract view up (main.js), and a key then only
  // brings the menu back: a second SPACE starts the run.
  if (STATE() === 'menu') { await frame(); keyPress('Space'); }
  for (let i = 0; i < 20 && STATE() !== 'playing'; i++) { if (STATE() === 'tutorial') keyPress('Escape'); await frame(); }
  if (STATE() !== 'playing') throw new Error(`no run started (state ${STATE()})`);
  game.demo = true; game.newRun(seed); game.demo = false;
  game.input = bot.input;
  bot.player = new AutoPlayer(bot.input);
  bot.hold = true;
  let last = game.theme.name, changes = 0, left = Infinity;
  for (let i = 0; i < HZ * 400 && left > 0; i++) {
    await frame();
    if (game.theme.name !== last) { last = game.theme.name; changes++; if (changes === zones) left = after * HZ; }
    left--;
    if (game.state !== 'playing') throw new Error(`the run ended on its own at floor ${game.run.maxFloor}`);
  }
  const floor = game.run.maxFloor;
  bot.catchNow = true;
  await frame();
  let k = 0;
  while (STATE() === 'falling' && k < HZ * 20) {
    await frame();
    if (skip !== null && ++k === Math.round(skip * HZ)) keyPress('Space');
  }
  await run(board);
  bot.player = null;
  return { floor, zone: last };
}

// --- WARM: the title screen paints ahead, then two runs -----------------------------------------
const menuStart = T;
const titlesDone = () => THEMES.every((th) => !TITLE_PAINTERS[th.name] || (ZT.titleStats(th.name) || {}).done);
const boardsDone = () => ['BASEMENT', THEMES[1].name].every((n) => GS.boardStats().done.includes(n));
while ((!titlesDone() || !boardsDone()) && T - menuStart < 60000) await frame();
const menuSec = (T - menuStart) / 1000;
await run(0.5);
session = 'warm';
const runs = [];
runs.push(await aRun(0x5eed, 5, 4, null, 2));
// From the board, SPACE is a new run; aRun presses it. The fire 1.2 s into its second zone:
// past the HUD skin's WARM_AFTER (30 frames, 0.5 s at 60 Hz) and before the next zone's skin is
// painted ahead (about 1.6 s more at SKIN_WARM_MS), so a skin painter that ignored the fall
// would be caught painting in it -- the fallgate mutant. It was 3.6 s, and when the budget went
// from 0.5 to 0.75 ms (2026-09-29) the skin was done before the fire at every death here and
// the mutant survived.
runs.push(await aRun(0x5eed + 101, 2, 1.2, 0.5, 1));

// --- COLD: the titles forgotten, the title screen left at once --------------------------------
ZT.resetZoneTitles();
keyPress('Escape');
await frame();
session = 'cold';
// Three zones, so the titles painted in the run are a few hundred calls; and the fire 3 s into
// the third: past the title's WARM_AFTER (2.8 s at 60 Hz) and before the next title is done,
// so a title painter that ignored the fall would be caught painting in it.
runs.push(await aRun(0x5eed + 202, 3, 3.0, null, 1));

tracking = false;
const pool = CV.poolStats();   // before 4 and 6 paint and reset for their own purposes

// --- 1 and 2 --------------------------------------------------------------------------------------
const byWhere = (list) => {
  const m = new Map();
  for (const r of list) {
    const what = r.c ? `${r.c.width}x${r.c.height}` : r.src || r.dst || r.op || '';
    const k = `${r.st}: ${what} ${r.at}`;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${v}x ${k}`).join('; ');
};
const warmMade = rec.made.filter((r) => r.session === 'warm');
const warmFirst = rec.first.filter((r) => r.session === 'warm');
ok(1, warmMade.length === 0, `WARM: no canvas made in a run, its falls or its boards -- ${runs.slice(0, 2).map((r) => `to floor ${r.floor} (${r.zone})`).join(', ')}` +
  (warmMade.length ? `; ${warmMade.length} made: ${byWhere(warmMade)}` : ''));
ok(1, warmFirst.length === 0, `WARM: no canvas drawn from for the first time in a run, its falls or its boards` +
  (warmFirst.length ? `; ${warmFirst.length}: ${byWhere(warmFirst)}` : ''));
const fallMade = rec.made.filter((r) => FALL.has(r.st)), fallFirst = rec.first.filter((r) => FALL.has(r.st));
ok(2, !fallMade.length && !fallFirst.length && !rec.paint.length && !rec.ops.length && !rec.steps.length,
  `nothing made, first drawn from, painted, first blended or stepped in the ${runs.length} falls and boards of both sessions` +
  (fallMade.length ? `; made ${fallMade.length}: ${byWhere(fallMade)}` : '') +
  (fallFirst.length ? `; first drawn from ${fallFirst.length}: ${byWhere(fallFirst)}` : '') +
  (rec.paint.length ? `; painted ${rec.paint.length}: ${byWhere(rec.paint)}` : '') +
  (rec.ops.length ? `; blends first used: ${byWhere(rec.ops)}` : '') +
  (rec.steps.length ? `; painters stepped in ${rec.steps.length} frames (${rec.steps[0].st}: ${rec.steps[0].before} -> ${rec.steps[0].after})` : ''));
const coldMade = rec.made.filter((r) => r.session === 'cold' && !FALL.has(r.st));
console.log(`         COLD: ${coldMade.length} canvases made in the run (the titles the title screen had no time for: ${byWhere(coldMade) || 'none'})`);

// --- 3. the budgets -------------------------------------------------------------------------------
await new Promise((r) => setTimeout(r, 30));   // the collector's reports come in
/** Each [t0, t1] window's length less the collector's pauses inside it [ms]. */
function own(pairs) {
  gcs.sort((x, y) => x[0] - y[0]);
  const out = [];
  let j = 0;
  for (let i = 0; i < pairs.length; i += 2) {
    const a = pairs[i], b = pairs[i + 1];
    while (j > 0 && gcs[j - 1][1] > a) j--;
    while (j < gcs.length && gcs[j][1] <= a) j++;
    let g = 0;
    for (let k = j; k < gcs.length && gcs[k][0] < b; k++) g += Math.min(b, gcs[k][1]) - Math.max(a, gcs[k][0]);
    out.push(b - a - g);
  }
  return out;
}
const tw = ZT.titleWarmTimes(), bw = GS.boardWarmTimes();
/**
 * The budgets, as LITERALS [ms]: read back from the modules, a budget raised there would be
 * the budget this holds it to (TESTING.md, "A test that read its answer from the code").
 * Changing one is a decision made here, on purpose. A frame at 160 Hz is 6.25 ms.
 */
// skin: 0.75 since 2026-09-29 (hudskin.js SKIN_WARM_MS says why: the rebuilt attract bot's
// climb outran a skin painted ahead at 0.5), decided here as well as there.
const BUDGET = { skin: 0.75, title: 0.5, titleIdle: 2.5, board: 0.5, boardIdle: 2 };
// The titles a run paints are the COLD session's: a run started within about two seconds of
// launch, before the title screen has painted them, so their painters run as code the engine
// has not optimised yet. At the 0.5 ms budget this check passed and failed by turns -- p99
// 0.49 to 0.58 ms -- whenever other processes shared the machine (npm test with a mutant
// sweep and an agent beside it, 2026-09-28). So it is held to the budget plus one slice of
// room (BOARD_SLICE_MS, what a painter may run past its deadline): 0.7 ms, a ninth of a
// 160 Hz frame. The failure it exists for is not near that: a title painted whole in one
// frame costs 13-46 ms, and the titlepiece mutant still fails it.
const TITLE_COLD = BUDGET.title + 0.2;
const budgets = [
  ['a skin in a run', own(HS.skinWarmTimes()), BUDGET.skin],
  ['a title in a run (COLD)', own(tw.play), TITLE_COLD],
  ['titles on the title screen', own(tw.idle), BUDGET.titleIdle],
  ['a scoreboard in a run', own(bw.play), BUDGET.board],
  ['a scoreboard on the menus', own(bw.idle), BUDGET.boardIdle, false],
];
const gcTotal = gcs.reduce((a, [s0, e]) => a + e - s0, 0);
for (const [what, t, cap, held = true] of budgets) {
  const line = `${what}: ${t.length} calls, p99 ${pct(t, 0.99).toFixed(3)} ms, p99.9 ${pct(t, 0.999).toFixed(3)}, ` +
    `worst ${t.length ? Math.max(...t).toFixed(3) : '-'}, ${t.filter((v) => v > cap).length} over (budget ${cap}; the collector's pauses aside)`;
  if (held) ok(3, t.length > 0 && pct(t, 0.99) <= cap, line);
  else console.log(`         ${line} -- held by test-boardwarm over more frames`);
}
console.log(`         the collector: ${gcs.length} pauses, ${gcTotal.toFixed(0)} ms in all, taken out of the calls they fell in`);

// --- 4. every slice small ---------------------------------------------------------------------------
/**
 * The longest a painter may run between two of its checks [ms], a guard against a pass
 * painted without one (test-boardwarm's SLICE_MAX): slices were 0.02-0.2 ms here, and a
 * title's frame put on its canvas whole is several milliseconds.
 */
const SLICE_MAX = 0.5;
{
  const realNow = performance.now.bind(performance);
  const hash = (d) => { let h = 2166136261; for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619); return h >>> 0; };
  // Each call is ONE slice: a clock that moves three quarters of the deadline's window on every
  // read is short of it when the call starts and past it at the painter's first check. Each
  // slice is kept as its window on the real clock, [start, end] in turn, so the collector's
  // pauses inside can be taken out: a pause is set off by allocation, and allocation repeats
  // with the painting, so the same slice took the same pause in all three paintings (the
  // fastest of three did not shed it -- 10 ms slices, all the collector, until it was).
  const sliced = (budget, paint) => {
    const d = [];
    let fake = 0;
    performance.now = () => (fake += 0.75 * (budget - C.BOARD_SLICE_MS));
    try {
      for (let k = 0; k < 100000 && paint(d); k++);
    } finally { performance.now = realNow; }
    return d;
  };
  const painted = [], bad = [];
  // A painter checked slice by slice has to have been painted in slices, not finished some
  // other way (built whole when asked for, or never started): at least this many. A title is
  // hundreds, a skin thousands. [slices; 20]
  const MIN_SLICES = 20;
  // Titles: the next zone's, painted by warmZoneTitles in a run, a slice a call -- the run's
  // budget and room, the tighter of the two paths.
  for (const th of THEMES) {
    if (!TITLE_PAINTERS[th.name]) continue;
    const runsOf = [];
    let print = null;
    for (let rep = 0; rep < 3; rep++) {
      ZT.resetZoneTitles();
      // Every other title finished first, whole, so the warm-up paints only this one.
      for (const o of THEMES) if (o !== th && TITLE_PAINTERS[o.name]) ZT.zoneTitle(o);
      const late = ZT.titleLateBuilds();
      const g = { theme: THEMES[(THEMES.indexOf(th) + THEMES.length - 1) % THEMES.length], nextTheme: th, state: 'playing' };
      runsOf.push(sliced(BUDGET.title, (d) => {
        const st = ZT.titleStats(th.name);
        if (st && st.done) return false;
        const n = st ? st.ms.length : 0;
        // Only the calls that painted: the first WARM_AFTER frames of a zone paint nothing.
        const a = realNow(); ZT.warmZoneTitles(g); const b = realNow();
        if ((ZT.titleStats(th.name) || { ms: [] }).ms.length !== n) d.push(a, b);
        return true;
      }));
      if (ZT.titleLateBuilds() !== late) bad.push(`${th.name}'s title was built late, not in slices`);
      if (!rep) { const e = ZT.zoneTitle(th); print = `${e.canvas.width}x${e.canvas.height}:${hash(e.canvas.data)}`; }
    }
    ZT.resetZoneTitles();
    const whole = ZT.zoneTitle(th);
    if (`${whole.canvas.width}x${whole.canvas.height}:${hash(whole.canvas.data)}` !== print) bad.push(`${th.name}'s title sliced is not the title painted whole`);
    painted.push([`${th.name} title`, runsOf]);
    await new Promise((r) => setImmediate(r));
  }
  // Skins: the next zone's, painted by hudSkinFor in a run, a slice a call.
  const skinPrint = (s) => Object.keys(s.parts).sort().map((k) => {
    const p = s.parts[k];
    const c = p && p.c ? p.c : p;
    return `${k}:${c.width}x${c.height}:${hash(c.data)}`;
  }).join('|');
  for (const th of THEMES.slice(1)) {
    const runsOf = [];
    let print = null;
    for (let rep = 0; rep < 3; rep++) {
      HS.resetHudSkins();
      const g = { theme: THEMES[0], nextTheme: th, state: 'playing' };
      runsOf.push(sliced(BUDGET.skin, (d) => {
        const s = HS.hudSkinStats();
        if (s.ahead === th.name && s.aheadDone) return false;
        // Only the calls that painted: the first WARM_AFTER frames of a zone paint nothing.
        const a = realNow(); HS.hudSkinFor(g); const b = realNow();
        if (HS.hudSkinStats().warmCalls !== s.warmCalls) d.push(a, b);
        return true;
      }));
      if (!rep) print = skinPrint(HS.warmHudSkin(th.name));
    }
    HS.resetHudSkins();
    if (skinPrint(HS.warmHudSkin(th.name)) !== print) bad.push(`${th.name}'s skin sliced is not the skin painted whole`);
    painted.push([`${th.name} skin`, runsOf]);
    await new Promise((r) => setImmediate(r));
  }
  HS.resetHudSkins();
  await new Promise((r) => setTimeout(r, 30));   // the collector's last reports
  const all = [];
  let worst = { ms: 0 }, gcShed = 0;
  for (const [name, runsOf] of painted) {
    if (runsOf.some((r) => r.length !== runsOf[0].length)) { bad.push(`${name}: ${runsOf.map((r) => r.length / 2).join('/')} slices`); continue; }
    if (runsOf[0].length / 2 < MIN_SLICES) { bad.push(`${name}: painted in ${runsOf[0].length / 2} slices`); continue; }
    const owns = runsOf.map((r) => { const o = own(r); for (let i = 0; i < o.length; i++) gcShed += r[2 * i + 1] - r[2 * i] - o[i]; return o; });
    for (let i = 0; i < owns[0].length; i++) {
      const ms = Math.min(owns[0][i], owns[1][i], owns[2][i]);
      all.push(ms);
      if (ms > worst.ms) worst = { ms, name, i };
    }
  }
  const over = all.filter((v) => v > C.BOARD_SLICE_MS).length;
  ok(4, !bad.length && worst.ms <= SLICE_MAX && pct(all, 0.999) <= C.BOARD_SLICE_MS,
    `every zone's title and skin, a slice a call: ${all.length} slices, the same in three paintings and the same pixels as painted whole; ` +
    `p99.9 ${pct(all, 0.999).toFixed(3)} ms, p99 ${pct(all, 0.99).toFixed(3)}, median ${pct(all, 0.5).toFixed(4)}; ${over} over ${C.BOARD_SLICE_MS}, ` +
    `the longest ${worst.ms.toFixed(3)} ms (${worst.name}, slice ${worst.i}; each the fastest of three, ${gcShed.toFixed(0)} ms of the collector's taken out; ` +
    `none may pass ${SLICE_MAX})` + (bad.length ? `: ${bad.slice(0, 4).join('; ')}` : ''));
}

// --- 5. one word box -----------------------------------------------------------------------------------
{
  const big = [];
  for (const th of THEMES) {
    for (const w of GS.TITLE_WORDS) {
      const plan = drain(layoutSteps(w, TITLE_PAINTERS[th.name].METRICS));
      if (plan.w > GS.WORD_BOX.w || plan.h > GS.WORD_BOX.h) big.push(`${th.name} ${w} ${plan.w}x${plan.h}`);
    }
  }
  ok(5, !big.length, `every zone's ${GS.TITLE_WORDS.join(' and ')} fit the ${GS.WORD_BOX.w}x${GS.WORD_BOX.h} word box` + (big.length ? `: not ${big.join(', ')}` : ''));
}

// --- 6. a reused canvas is a clean one ---------------------------------------------------------
// A skin or a board painted into canvases another zone's had is, pixel for pixel, the one
// painted into fresh canvases: takeCanvas clears what it hands on and puts back the state a
// fresh canvas has. Painted first into an empty pool, then into another zone's let go.
{
  const hash = (d) => { let h = 2166136261; for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619); return h >>> 0; };
  const print = (parts) => Object.keys(parts).sort().map((k) => {
    const p = parts[k];
    const c = p && p.c ? p.c : p;
    return `${k}:${c.width}x${c.height}:${hash(c.data)}`;
  }).join('|');
  const bad = [];
  let reusedAll = 0, n = 0;
  for (const th of THEMES.slice(1)) {
    const other = th === THEMES[1] ? THEMES[2] : THEMES[1];
    HS.resetHudSkins(); CV.resetCanvasPool();
    const fresh = print(HS.warmHudSkin(th.name).parts);
    HS.resetHudSkins(); CV.resetCanvasPool();
    HS.warmHudSkin(other.name);
    HS.resetHudSkins();
    let r0 = CV.poolStats().reused;
    const reused = print(HS.warmHudSkin(th.name).parts);
    reusedAll += CV.poolStats().reused - r0;
    n++;
    if (fresh !== reused) bad.push(`${th.name}'s skin`);
    GS.forgetBoards(false); CV.resetCanvasPool();
    const bf = print(GS.warmBoardNow(th).parts);
    GS.forgetBoards(false); CV.resetCanvasPool();
    GS.warmBoardNow(other);
    GS.forgetBoards(false);
    r0 = CV.poolStats().reused;
    const br = print(GS.warmBoardNow(th).parts);
    reusedAll += CV.poolStats().reused - r0;
    n++;
    if (bf !== br) bad.push(`${th.name}'s board`);
  }
  ok(6, !bad.length && reusedAll >= 10 * n, `every zone's skin and board painted into another zone's canvases is its painting into fresh ones, ` +
    `pixel for pixel (${n} paintings, ${reusedAll} canvases handed on)` + (bad.length ? `: not ${bad.join(', ')}` : ''));
}

console.log(`         load: the prepaint took ${loaded.ms.toFixed(0)} ms headless and brought up ${loaded.touched} canvases; ` +
  `the pool holds ${(loaded.poolBytes / 1e6).toFixed(1)} MB of spares; the title screen was done painting ahead after ${menuSec.toFixed(1)} s at ${HZ} Hz`);
console.log(`         the pool over both sessions: ${pool.made} canvases made in all (load included), ${pool.reused} handed on again, ` +
  `${pool.pooled} spare at the end (${(pool.bytes / 1e6).toFixed(1)} MB)`);
console.log(`\n  ${fails ? fails + ' FAILED' : 'smooth: nothing made or brought up in a run or its fall, and every painter in its budget'}  ` +
  `(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fails ? 1 : 0);
