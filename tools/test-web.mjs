// The web package for itch.io: that it loads from a SUBPATH, holds what the page needs
// and nothing else, zips to something an unzipper reads back byte for byte, and that the
// game survives what an iframe on someone else's domain does to it.
//
// itch.io serves an HTML game from a path of its own domain inside an iframe. So:
//   - Every URL must be relative. The package is built into a temp folder, served from
//     /duke/ by a server that answers nothing else, and walked (build-web.mjs): every
//     import and every asset the code names must come back 200 from under /duke/.
//   - The walk is a pattern match, and a pattern can miss an import. So the PACKAGED
//     main.js is also booted through node's own module loader: a module missing from the
//     package fails that import, whatever the walk thought.
//   - Every place that loads something by URL (fetch, Image.src, import(), url(), ...)
//     is listed and must be a relative literal or one of the REVIEWED computed sites
//     below; a new one fails here until someone has looked at it.
//   - In the frame: storage may be refused (the game must run and say saves are off),
//     keyboard focus starts outside it (the game must say so, and take it on a click),
//     and fullscreen may be forbidden (F must not produce a rejected promise). Proved on
//     the booted package, with localStorage throwing on every access.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ROOT, PREFIX, SAMPLE_EXTS, buildAndProve, readZip, zipDir, runtimeAssets } from './build-web.mjs';
import { installPage, bootMain, frame, key, makePad, press, release } from './fakepage.mjs';

let bad = 0;
const fail = (m) => { console.log('  FAIL ' + m); bad++; };
const ok = (m) => console.log('  ok   ' + m);
const check = (cond, m, detail = '') => (cond ? ok(m) : fail(m + (detail ? `  (${detail})` : '')));

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'duke-web-'));
const OUT = path.join(TMP, 'web');
const ZIP = path.join(TMP, 'duke-vytis-web.zip');

// --- build it, serve it from a subpath, walk it -----------------------------------------
const r = await buildAndProve(OUT, ZIP);
check(r.walk.problems.length === 0, `served from ${PREFIX}, every import and asset is 200 and nothing is asked for outside it`,
  r.walk.problems.slice(0, 6).join(' | '));
const names = r.walk.modules.map((u) => u.slice(u.indexOf(PREFIX) + PREFIX.length));
check(['src/main.js', 'src/core/input.js', 'src/core/gamepad.js', 'src/core/embed.js', 'src/game/game.js']
  .every((m) => names.includes(m)) && names.length >= 100,
  `the walk reaches the whole game (${names.length} modules), not just the page`, `${names.length} modules`);

// --- what is in it --------------------------------------------------------------------
const files = r.files;
const topDirs = new Set(files.map((f) => f.split('/')[0]));
const wanted = new Set(await runtimeAssets());
const strayAssets = files.filter((f) => f.startsWith('assets/') && !wanted.has(f));
check(files.includes('index.html') && [...topDirs].every((d) => ['index.html', 'src', 'assets'].includes(d)),
  'the package is index.html, src/ and assets/ -- no electron/, tools/, docs/ or node_modules', [...topDirs].join(' '));
check(strayAssets.length === 0, 'assets/ holds only what the game loads, none of the source sheets', strayAssets.slice(0, 4).join(' '));
const srcCount = fs.readdirSync(path.join(ROOT, 'src'), { recursive: true })
  .filter((f) => fs.statSync(path.join(ROOT, 'src', String(f))).isFile()).length;
check(files.filter((f) => f.startsWith('src/')).length === srcCount, 'all of src/ is shipped, so a walk that missed a module cannot drop it');

// --- the zip ----------------------------------------------------------------------
let entries = [];
let zipErr = '';
try { entries = readZip(ZIP); } catch (e) { zipErr = e.message; }
const same = !zipErr && entries.length === files.length && entries.every((e) => {
  const p = path.join(OUT, e.name);
  return fs.existsSync(p) && Buffer.compare(fs.readFileSync(p), e.data) === 0;
});
check(same, 'the zip reads back with every CRC right and every file byte for byte what was built', zipErr);
check(entries.some((e) => e.name === 'index.html') && entries.every((e) => !e.name.startsWith('/') && !e.name.includes('\\')),
  'index.html is at the zip root and every name is a relative forward-slash path');

const ZIP2 = path.join(TMP, 'again.zip');
zipDir(OUT, ZIP2);
check(Buffer.compare(fs.readFileSync(ZIP), fs.readFileSync(ZIP2)) === 0, 'zipping the same tree twice gives the same bytes');

// A second opinion on the format from an unzipper that is not ours. Windows ships
// bsdtar, which reads zips; elsewhere unzip does.
const tarExe = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : null;
let listed = null;
if (tarExe && fs.existsSync(tarExe)) {
  const t = spawnSync(tarExe, ['-tf', ZIP], { encoding: 'utf8' });
  if (t.status === 0) listed = t.stdout.split(/\r?\n/).filter(Boolean);
} else {
  const u = spawnSync('unzip', ['-Z1', ZIP], { encoding: 'utf8' });
  if (u.status === 0) listed = u.stdout.split(/\r?\n/).filter(Boolean);
}
if (listed) {
  check(listed.slice().sort().join() === entries.map((e) => e.name).sort().join(),
    `an independent unzipper (${tarExe ? 'bsdtar' : 'unzip'}) lists the same ${listed.length} files`);
} else {
  ok('(no independent unzipper on this machine; skipped the second opinion)');
}

// --- every place that loads by URL -------------------------------------------------
//
// Computed URLs no pattern can prove relative, each looked at by a person:
const REVIEWED = {
  // base defaults to 'assets/sfx/', and main.js calls loadSamples(SAMPLE_NAMES) with no base
  'src/render/audio.js fetch': 'fetch(`${base}${name}.${ext}`)',
  // path comes from DECOR_FILES / BG_FILES, whose every entry the walk fetched above
  'src/render/decor.js src': 'im.src = path',
  'src/render/backdrop.js src': 'im.src = path',
};
const LOADERS = [
  ['fetch', /\bfetch\(\s*([^)]*)\)/g],
  ['src', /\.src\s*=\s*([^;\n]+)/g],
  ['import', /\bimport\(\s*([^)]*)\)/g],
  ['url', /\burl\(\s*([^)]*)\)/g],
  ['audio', /\bnew Audio\(\s*([^)\s][^)]*)\)/g],
  ['other', /\b(XMLHttpRequest|new Worker|importScripts|sendBeacon|new WebSocket|new EventSource|window\.open)\b()/g],
];
const sites = [];
for (const f of files.filter((x) => /\.(m?js|html)$/.test(x))) {
  const lines = fs.readFileSync(path.join(OUT, f), 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line)) return;
    for (const [kind, re] of LOADERS) {
      for (const m of line.matchAll(re)) {
        const arg = (m[1] || '').trim();
        const lit = /^(['"`])([^'"`$]*)\1$/.exec(arg);
        let verdict;
        if (kind === 'other') verdict = 'unexpected loader';
        else if (lit) verdict = /^(\/|[a-z]+:)/i.test(lit[2]) && !/^(data|blob):/.test(lit[2]) ? 'ABSOLUTE' : 'relative';
        else verdict = REVIEWED[`${f} ${kind}`] && line.includes(REVIEWED[`${f} ${kind}`]) ? 'reviewed' : 'UNREVIEWED';
        sites.push({ at: `${f}:${i + 1}`, kind, arg: arg.slice(0, 60), verdict });
      }
    }
  });
}
const badSites = sites.filter((s) => !['relative', 'reviewed'].includes(s.verdict));
check(badSites.length === 0 && sites.length >= 4,
  `every place that loads by URL is a relative literal or a reviewed computed site (${sites.length} found)`,
  badSites.map((s) => `${s.at} ${s.kind}(${s.arg}) ${s.verdict}`).join(' | '));
if (process.argv.includes('--sites')) for (const s of sites) console.log(`       ${s.verdict.padEnd(9)} ${s.kind.padEnd(6)} ${s.at}  ${s.arg}`);
const mainSrc = fs.readFileSync(path.join(OUT, 'src/main.js'), 'utf8');
const audioSrc = fs.readFileSync(path.join(OUT, 'src/render/audio.js'), 'utf8');
check(/loadSamples\(\s*names\s*,\s*base\s*=\s*'assets\/sfx\/'\s*\)/.test(audioSrc) && /loadSamples\(SAMPLE_NAMES\)/.test(mainSrc),
  "the samples' base is the relative 'assets/sfx/' and main.js does not pass another");
// The build ships a sample only under a name and extension the loader tries, so the two
// lists of extensions must be one list: a loader that learned .mp3 would otherwise find
// every .mp3 missing from the zip.
const loaderExts = /async loadSamples[\s\S]*?for \(const ext of \[([^\]]*)\]\)/.exec(audioSrc);
const exts = loaderExts ? [...loaderExts[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).join() : '';
check(exts === SAMPLE_EXTS.join(), "the build ships samples in exactly the extensions audio.js's loader tries",
  `loader tries [${exts}], build ships [${SAMPLE_EXTS.join()}]`);

// --- the desktop shell's bridge, and nothing else of Electron's --------------------------
const electronish = [];
for (const f of files.filter((x) => x.endsWith('.js'))) {
  const t = fs.readFileSync(path.join(OUT, f), 'utf8');
  if (/\brequire\(|ipcRenderer|from\s+['"]electron['"]|\bprocess\.|__dirname/.test(t)) electronish.push(f);
  if (/gameShell/.test(t) && !['src/game/settings.js', 'src/core/embed.js', 'src/main.js'].includes(f)) electronish.push(f + ' (gameShell)');
}
check(electronish.length === 0, 'no Electron or node API in the page; the shell is reached only through the optional window.gameShell',
  electronish.join(' '));

// --- the assets path, on a fixture tree --------------------------------------------
//
// The real tree has no artist tiles, furniture sprites or samples yet, so the paths that
// ship them would otherwise never run. A copy of the page with one listed tile, one
// listed furniture sprite, one sample the game asks for, and what must stay out: a source
// sheet, a README, a sample in a format the loader never tries and one under a name it
// never asks for (assets/sfx/ is the user's own, gitignored, and the zip is public).
{
  const FX = path.join(TMP, 'fixture');
  fs.mkdirSync(path.join(FX, 'assets', 'sfx'), { recursive: true });
  fs.mkdirSync(path.join(FX, 'assets', 'backgrounds'), { recursive: true });
  fs.mkdirSync(path.join(FX, 'assets', 'decor'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(FX, 'index.html'));
  fs.cpSync(path.join(ROOT, 'src'), path.join(FX, 'src'), { recursive: true });
  fs.writeFileSync(path.join(FX, 'src/render/bgart.js'),
    "export const BG_TILE = 256;\nexport const BG_FILES = {\n  STARFIELD: {\n    far: 'assets/backgrounds/STARFIELD-far.png',\n  },\n};\n");
  fs.writeFileSync(path.join(FX, 'src/render/decorart.js'),
    "export const DECOR_FILES = {\n  VILLAGE: {\n    barrel: 'assets/decor/VILLAGE-barrel.png',\n  },\n};\n");
  fs.writeFileSync(path.join(FX, 'assets/backgrounds/STARFIELD-far.png'), Buffer.from('not really a png'));
  fs.writeFileSync(path.join(FX, 'assets/decor/VILLAGE-barrel.png'), Buffer.from('not really a png'));
  fs.writeFileSync(path.join(FX, 'assets/sfx/milestone.ogg'), Buffer.from('not really an ogg'));
  fs.writeFileSync(path.join(FX, 'assets/sfx/milestone.mp3'), Buffer.from('a format the loader never tries'));
  fs.writeFileSync(path.join(FX, 'assets/sfx/crowd-take2.wav'), Buffer.from('a name nothing asks for'));
  fs.writeFileSync(path.join(FX, 'assets/sfx/README.md'), 'notes');
  fs.writeFileSync(path.join(FX, 'assets/platform-sheet.png'), Buffer.from('a source sheet'));
  const fx = await buildAndProve(path.join(TMP, 'fxweb'), path.join(TMP, 'fx.zip'), FX);
  const served = new Set(fx.walk.fetched.filter((x) => x.status === 200).map((x) => x.url.slice(x.url.indexOf(PREFIX) + PREFIX.length)));
  check(fx.walk.problems.length === 0 && served.has('assets/backgrounds/STARFIELD-far.png')
      && served.has('assets/decor/VILLAGE-barrel.png') && served.has('assets/sfx/milestone.ogg'),
    'a listed tile, a listed furniture sprite and a sample are shipped and served 200 from under the subpath',
    fx.walk.problems.slice(0, 3).join(' | '));
  const kept = ['assets/platform-sheet.png', 'assets/sfx/README.md', 'assets/sfx/milestone.mp3', 'assets/sfx/crowd-take2.wav']
    .filter((f) => fx.files.includes(f));
  check(kept.length === 0,
    'left out: a source sheet, a README, a sample in a format the loader never tries and one under a name it never asks for',
    kept.join(' '));
}

// --- a path whose case differs from the file's --------------------------------------
//
// itch.io's servers are case-sensitive and this machine's disk is not, so the proof has to
// be: an import of './core/Input.js' for core/input.js loads here and 404s there.
{
  const CX = path.join(TMP, 'casefix');
  fs.mkdirSync(CX, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(CX, 'index.html'));
  fs.cpSync(path.join(ROOT, 'src'), path.join(CX, 'src'), { recursive: true });
  const m = path.join(CX, 'src', 'main.js');
  fs.writeFileSync(m, fs.readFileSync(m, 'utf8').replace("from './core/input.js'", "from './core/Input.js'"));
  const cx = await buildAndProve(path.join(TMP, 'caseweb'), path.join(TMP, 'case.zip'), CX);
  check(cx.walk.problems.some((p) => p.includes('/src/core/Input.js')),
    'an import spelled in another case than its file fails the proof, as it would 404 on itch.io',
    cx.walk.problems.slice(0, 2).join(' | ') || 'no problem reported');
}

// --- the booted package, in a frame that refuses storage and fullscreen ------------------
{
  const rejections = [];
  process.on('unhandledRejection', (e) => rejections.push(e));
  const warnings = [];
  const warn = console.warn;
  console.warn = (...a) => warnings.push(a.join(' '));

  const page = installPage({ storage: 'blocked', fullscreenEnabled: false, focused: false });
  let V = null;
  let bootErr = '';
  try { V = await bootMain(pathToFileURL(path.join(OUT, 'src', 'main.js')).href); } catch (e) { bootErr = e && e.stack ? e.stack : String(e); }
  console.warn = warn;
  check(V !== null, 'the PACKAGED main.js boots through node\'s own module loader, localStorage throwing on every access',
    bootErr.split('\n').slice(0, 2).join(' '));
  if (V) {
    const { STATE } = await import(pathToFileURL(path.join(OUT, 'src', 'game', 'game.js')).href);
    const { TUTORIAL_PAGES } = await import(pathToFileURL(path.join(OUT, 'src', 'ui', 'screens.js')).href);
    const g = V.game;
    const hint = page.els.get('focus-hint');
    const saves = page.els.get('saves-off');
    const tapKey = (code) => { key(page.win, 'keydown', code); frame(V); key(page.win, 'keyup', code); frame(V); };
    console.warn = (...a) => warnings.push(a.join(' '));

    check(V.embed.storageOk === false && !saves.hidden, 'storage refused: the title says SAVES ARE OFF',
      `storageOk ${V.embed.storageOk}, hidden ${saves.hidden}`);
    check(!hint.hidden, 'arriving without focus, the page says the game does not have the keyboard');

    const before = page.canvasFocus;
    page.win.dispatchEvent(new Event('pointerdown'));
    page.focused = true;
    page.win.dispatchEvent(new Event('focus'));
    check(page.canvasFocus > before && hint.hidden, 'a click hands the canvas the keyboard and the banner goes',
      `focus calls ${page.canvasFocus - before}, hidden ${hint.hidden}`);

    tapKey('KeyF');
    await new Promise((res) => setImmediate(res));
    check(page.fullscreenRequests === 0 && rejections.length === 0,
      'F inside a frame that forbids fullscreen asks for nothing and rejects nothing',
      `${page.fullscreenRequests} requests, ${rejections.length} rejections`);

    // A whole first run with no storage: the guide (which saves that it was seen), the
    // options (which save on every change), a run and its pause.
    tapKey('Space');
    for (let i = 0; i < TUTORIAL_PAGES.length; i++) tapKey('Space');
    const playing = g.state;
    V.embed.update();
    const hiddenInRun = saves.hidden;
    tapKey('Escape');
    V.embed.update();
    const shownPaused = !saves.hidden;
    tapKey('KeyO'); tapKey('ArrowRight'); tapKey('ArrowLeft'); tapKey('Escape');
    check(playing === STATE.PLAYING && g.state === STATE.PAUSED,
      'with storage refused a first run plays: the guide, the run, the pause and the options all work', `${playing}, ${g.state}`);
    check(hiddenInRun && shownPaused, 'the saves banner keeps out of a climb and comes back on the pause',
      `hidden in run ${hiddenInRun}, shown paused ${shownPaused}`);
    check(warnings.some((w) => /save failed/.test(w)), 'the refused saves are logged as warnings, not thrown',
      `${warnings.length} warnings`);

    // Not focused, but playing on a pad: nothing to click for.
    page.focused = false;
    page.win.dispatchEvent(new Event('blur'));
    const unfocusedShown = !hint.hidden;
    const pad = makePad(0);
    page.pads = [pad];
    press(pad, 4); frame(V); release(pad, 4); frame(V);   // LB: touches the pad, maps to nothing
    V.embed.update();
    check(unfocusedShown && hint.hidden, 'the focus banner shows on a blur, and not to a player on a pad',
      `shown ${unfocusedShown}, hidden on pad ${hint.hidden}`);

    // Escape on the title quits; with no shell it falls to window.close and must not throw.
    tapKey('KeyQ');
    const onTitle = g.state;
    let threw = '';
    try { tapKey('Escape'); } catch (e) { threw = e.message; }
    check(onTitle === STATE.MENU && !threw && page.closeCalls === 1,
      'Escape on the title with no desktop shell asks window.close and does not throw',
      `${onTitle}, close ${page.closeCalls}, ${threw}`);
    console.warn = warn;
  }
}

// --- the banners' rules, directly -------------------------------------------------
{
  const { storageWorks, fullscreenAllowed, watchEmbed } = await import('../src/core/embed.js');
  const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  const quota = { getItem: () => null, setItem: () => { throw new DOMException('full', 'QuotaExceededError'); }, removeItem: () => {} };
  const forgetful = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  check(storageWorks(mem) && !storageWorks(() => { throw new Error('denied'); }) && !storageWorks(() => quota)
    && !storageWorks(() => forgetful) && !storageWorks(() => undefined),
    'storage counts as working only if a value written can be read back');
  const doc = (o) => ({ fullscreenElement: null, ...o });
  check(fullscreenAllowed({ gameShell: {} }, doc({ fullscreenEnabled: false }))
    && !fullscreenAllowed({}, doc({ fullscreenEnabled: false }))
    && fullscreenAllowed({}, doc({ fullscreenEnabled: true }))
    && fullscreenAllowed({}, doc({ fullscreenEnabled: false, fullscreenElement: {} }))
    && !fullscreenAllowed({}, doc({ webkitFullscreenEnabled: false })),
    'fullscreen: the shell always, a frame only when allowed, leaving it always, old Safari by its prefix');
  const el = () => ({ hidden: true });
  const els = { 'focus-hint': el(), 'saves-off': el() };
  const w = { gameShell: {}, addEventListener() {} };
  const d = { getElementById: (id) => els[id], hasFocus: () => false };
  const e = watchEmbed({ win: w, doc: d, storageOk: true });
  e.stop();
  check(els['focus-hint'].hidden && els['saves-off'].hidden, 'the desktop shell never shows either banner');
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n  (package: ${r.files.length} files, ${(r.bytes / 1024).toFixed(0)} KB; zip ${(r.zipBytes / 1024).toFixed(0)} KB)`);
console.log('\n  ' + (bad === 0
  ? 'RESULT: PASS - the web package loads from a subpath and survives an iframe.'
  : `RESULT: FAIL - ${bad} problem(s).`));
process.exit(bad ? 1 : 0);
