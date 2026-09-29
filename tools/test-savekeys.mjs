// The save keys' rename (src/game/savekeys.js): the game's saves moved from the prefix the
// project carried as a working title to its own name, found by their shape, not by the old
// prefix. Any earlier prefix will do for the test, so this one is invented: 'oldname'.
//
//   A. adoptEarlierSaves on a store: every save of this game's under the earlier prefix --
//      settings, stats, the replay index and texts, the developer's mute -- moves under
//      'dukevytis.' with its value untouched, and is gone from the old name; the replay index
//      moves after every replay it lists; another app's keys, even ones ending in the same
//      names, are left alone; a second call moves nothing; with saves of its own already it
//      moves nothing; a key already under the new name is never overwritten; a store that
//      throws, or has nothing of ours, moves nothing and does not throw.
//   B. main.js booted over the fake page with saves under the earlier prefix: the records and
//      settings a player had are what the game loads.
//
//   node tools/test-savekeys.mjs              the checks (a couple of seconds)
//   node tools/test-savekeys.mjs --mutant=N   patches a copy of src/ and must FAIL
//   node tools/test-savekeys.mjs --mutants    every mutant in turn, one process each

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installPage, bootMain } from './fakepage.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const argv = process.argv.slice(2);
const MUTANT = (argv.find((a) => a.startsWith('--mutant=')) || '').slice(9);

// ---- mutants: [file under src/, from, to], the check that catches each beside it -----------
const MUTANTS = {
  // caught by A and B (nothing is ever adopted: a player's records are gone)
  'adopt-never': [['src/game/savekeys.js', '    if (!store || typeof store.key !== \'function\') return 0;', '    return 0;']],
  // caught by A (another app's keys taken for the game's)
  'adopt-anyone': [['src/game/savekeys.js', '      if (!ours) continue;\n', '']],
  // caught by A (the old keys left behind: the saves held twice)
  'adopt-keeps-old': [['src/game/savekeys.js', '        store.removeItem(k);\n        moved++;', '        moved++;']],
  // caught by A (a key already under the new name overwritten)
  'adopt-overwrites': [['src/game/savekeys.js', '        if (store.getItem(to) === null) store.setItem(to, store.getItem(k));', '        store.setItem(to, store.getItem(k));']],
  // caught by A (the index moved before the replays it lists)
  'adopt-index-first': [['src/game/savekeys.js', '      keys.sort((a, b) => last(a) - last(b));\n', '      keys.sort((a, b) => last(b) - last(a));\n']],
  // caught by A (it moves again when the game already has saves of its own)
  'adopt-again': [['src/game/savekeys.js', "    for (const n of ['settings.v2', 'stats.v1', 'replays.v1']) if (store.getItem(key(n)) !== null) return 0;\n", '']],
  // caught by A (the page's store read outside the try: a page with storage refused cannot boot)
  'adopt-blocked-throws': [['src/game/savekeys.js', "export function adoptEarlierSaves(store) {\n  try {\n    if (store === undefined) store = globalThis.localStorage;\n", "export function adoptEarlierSaves(store = globalThis.localStorage) {\n  try {\n"]],
  // caught by B (main.js never asks: the game boots on nothing)
  'boot-not-adopted': [['src/main.js', 'adoptEarlierSaves();\n', '']],
};

if (argv.includes('--mutants')) {
  const self = fileURLToPath(import.meta.url);
  const missed = [];
  for (const name of Object.keys(MUTANTS)) {
    const r = spawnSync(process.execPath, [self, `--mutant=${name}`], { encoding: 'utf8', timeout: 300000 });
    const last = (r.stdout || '').trim().split('\n').slice(-2).join(' | ');
    const caught = r.status === 1;
    console.log(`  ${caught ? 'caught ' : 'MISSED '} ${name.padEnd(22)} ${r.status === 3 ? 'DID NOT APPLY' : last.slice(0, 150)}`);
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
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dvsavekeys-'));
  fs.cpSync(path.join(REPO, 'src'), path.join(tmp, 'src'), { recursive: true });
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
function fail(m) {
  console.log('  FAIL ' + m);
  bad++;
  if (MUTANT) { console.log(`  (mutant ${MUTANT} caught)`); cleanup(); process.exit(1); }
}
const ok = (c, m) => { if (!c) fail(m); return !!c; };
const note = (m) => console.log('  ok   ' + m);
const u = (p) => pathToFileURL(path.join(ROOT, p)).href;

/** A localStorage as a browser's: getItem, setItem, removeItem, key, length -- and a log of sets. */
function store(entries = {}) {
  const m = new Map(Object.entries(entries));
  const sets = [];
  return {
    m, sets,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { sets.push(k); m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}
// A player's saves under the earlier prefix, and another app's beside them.
const SETTINGS = JSON.stringify({ scaleMode: 'auto', particles: 'low', music: false, guideSeen: true, companions: 'glide', jumpSpeed: 1.3, speedV: 3 });
const STATS = JSON.stringify({ totalRuns: 7, bestFloor: 321, bestScore: 4567, bestCombo: 40 });
const OURS = {
  'oldname.settings.v2': SETTINGS,
  'oldname.stats.v1': STATS,
  'oldname.replays.v1': '[{"id":"o1abc"}]',
  'oldname.replay.v1.o1abc': 'the replay text',
  'oldname.devmute': '1',
};
const THEIRS = {
  'other.settings.v2': JSON.stringify({ volume: 1, jumpSpeed: 2 }),
  'other.stats.v1': JSON.stringify({ played: 3 }),
  'foo': 'bar',
};

// =============================================================================================
// A. adoptEarlierSaves on a store.
// =============================================================================================
{
  const { adoptEarlierSaves, PREFIX } = await import(u('src/game/savekeys.js'));
  ok(PREFIX === 'dukevytis', `A. the prefix is '${PREFIX}'`);
  const s = store({ ...THEIRS, ...OURS });
  const moved = adoptEarlierSaves(s);
  const lost = Object.entries(OURS).filter(([k, v]) => s.getItem(k.replace(/^oldname\./, 'dukevytis.')) !== v).map(([k]) => k);
  const stayed = Object.keys(OURS).filter((k) => s.m.has(k));
  const touched = Object.entries(THEIRS).filter(([k, v]) => s.getItem(k) !== v).map(([k]) => k);
  const theirsTaken = [...s.m.keys()].filter((k) => /^dukevytis\./.test(k) && !Object.keys(OURS).some((o) => o.replace(/^oldname\./, 'dukevytis.') === k));
  ok(moved === 5 && !lost.length && !stayed.length, `A. moved ${moved} of 5; not under the new name as they were: ${lost.join(', ') || 'none'}; left under the old: ${stayed.join(', ') || 'none'}`);
  ok(!touched.length && !theirsTaken.length, `A. another app's keys: changed ${touched.join(', ') || 'none'}, taken ${theirsTaken.join(', ') || 'none'}`);
  const idx = s.sets.indexOf('dukevytis.replays.v1'), text = s.sets.indexOf('dukevytis.replay.v1.o1abc');
  ok(idx > text && text >= 0, `A. the replay index was written ${idx < text ? 'BEFORE' : 'after'} the replay it lists (sets: ${s.sets.join(' ')})`);
  const before = JSON.stringify([...s.m]);
  ok(adoptEarlierSaves(s) === 0 && JSON.stringify([...s.m]) === before, 'A. a second call moved something');
  // Saves of its own already: an earlier prefix's are left where they are.
  const own = store({ ...OURS, 'dukevytis.stats.v1': JSON.stringify({ totalRuns: 1, bestFloor: 2, bestScore: 3, bestCombo: 4 }) });
  ok(adoptEarlierSaves(own) === 0 && own.getItem('oldname.stats.v1') === STATS && own.getItem('dukevytis.stats.v1').includes('"bestFloor":2'),
    'A. with saves of its own, it moved an earlier prefix\'s over them');
  // A key already under the new name is never overwritten (a replay from a half-done move).
  const half = store({ ...OURS, 'dukevytis.replay.v1.o1abc': 'the newer text' });
  adoptEarlierSaves(half);
  ok(half.getItem('dukevytis.replay.v1.o1abc') === 'the newer text' && !half.m.has('oldname.replay.v1.o1abc'),
    `A. a replay already under the new name was overwritten (${half.getItem('dukevytis.replay.v1.o1abc')})`);
  // Nothing of ours, a store that throws, no store: nothing, and no throw.
  const none = store(THEIRS);
  let threw = null, thrown = 0;
  try {
    thrown = adoptEarlierSaves(none)
      + adoptEarlierSaves({ key() { throw new Error('denied'); }, getItem() { throw new Error('denied'); }, get length() { throw new Error('denied'); } })
      + adoptEarlierSaves(null);
  } catch (e) { threw = e; }
  ok(!threw && thrown === 0 && JSON.stringify([...none.m]) === JSON.stringify(Object.entries(THEIRS)),
    `A. with nothing of ours, a store that throws, or none: moved ${thrown}${threw ? ', threw ' + threw.message : ''}`);
  // The page's own store, where reading localStorage at all throws (a frame with storage refused).
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError: access is denied'); } });
  let blocked = null, got = -1;
  try { got = adoptEarlierSaves(); } catch (e) { blocked = e; }
  if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete globalThis.localStorage;
  ok(!blocked && got === 0, `A. with the page's storage refused, adoptEarlierSaves() ${blocked ? 'threw: ' + blocked.message : 'moved ' + got}`);
  note('A. an earlier prefix\'s saves move, by their shape, once, index last, never over newer ones; another app\'s stay; a broken store is left alone');
}

// =============================================================================================
// B. The game boots on a player's saves from before the rename.
// =============================================================================================
{
  const page = installPage({ seed: 7 });
  // No ?mute in the address (the fake page's default): the mute must come from the moved key.
  globalThis.location.search = '';
  for (const [k, v] of Object.entries({ ...OURS, ...THEIRS })) localStorage.setItem(k, v);
  const V = await bootMain(u('src/main.js'));
  const all = V.stats();
  const settings = JSON.parse(localStorage.getItem('dukevytis.settings.v2') || 'null');
  ok(all && all.bestFloor === 321 && all.totalRuns === 7, `B. the stats the game loaded: best floor ${all && all.bestFloor}, runs ${all && all.totalRuns} (the save: 321, 7)`);
  ok(settings && settings.jumpSpeed === 1.3 && settings.companions === 'glide' && !localStorage.getItem('oldname.settings.v2'),
    `B. the settings under the new name: ${JSON.stringify(settings).slice(0, 120)}`);
  ok(V.audio.muted === true, 'B. the developer\'s mute did not come through');
  note('B. booted on saves from before the rename: the records, the settings and the mute are the player\'s');
  void page;
}

cleanup();
if (bad) { console.log(`\n  ${bad} check(s) failed`); process.exit(1); }
console.log('\n  all passed');
process.exit(0);
