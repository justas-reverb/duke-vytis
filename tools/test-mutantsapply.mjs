// Every mutant still has something to mutate.
//
// A suite's MUTANTS patch a copy of src/ by exact text: [file, from, to], `from` found once.
// When a later change edits that line, the mutant stops applying -- and nothing says so until
// someone runs that suite's --mutants: then "DID NOT APPLY", or in a suite that does not look,
// a mutant that "passes" having changed nothing. Twice on 2026-09-28 a commit extended the
// newRun lines in main.js and replay.js and left five mutants in three suites patching lines
// that were gone, found only when their mutation runs came round. This reads every suite's
// table (without running it) and fails on any patch whose `from` is not in its file exactly
// once, so the commit that edits a line learns at once which mutants it stranded.
//
// The shapes read: { name: [[file, from, to], ...] }, { name: [file, from, to] } and
// test-smooth's { name: [pass, file, from, to] }, test-menu's list of objects,
// const MUTS = [{ name, file, from, to, check }] -- two of whose patches were found stranded
// only by a --mutations run (the GRAPHICS screen had become OPTIONS) -- and test-afterimage's
// list of rows, const MUTANTS = [[name, check, file, from, to, run], ...], one of whose
// patches a new call repeating its argument text made ambiguous (found by the full suite, the
// aura's rim, 2026-09-28). Rows with no file and text in those places (test-steady patches
// the engine's instance, not its source) have nothing to strand. A table built from
// variables at run time (test-tapjump's, which wraps a line it names OLD) is listed as not
// read, not failed.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
let bad = 0, total = 0, suites = 0;
const unread = [];
for (const f of fs.readdirSync(HERE).filter((x) => /^test-.*\.mjs$/.test(x) && x !== 'test-mutantsapply.mjs').sort()) {
  const text = fs.readFileSync(path.join(HERE, f), 'utf8').replace(/\r\n/g, '\n');
  let M;
  const at = text.indexOf('const MUTANTS = {'), list = text.indexOf('const MUTS = [');
  const rows = text.indexOf('const MUTANTS = [');
  if (at >= 0) {
    const end = text.indexOf('\n};', at);
    try { M = new Function('return (' + text.slice(at + 'const MUTANTS = '.length, end + 2) + ');')(); }
    catch (e) { unread.push(`${f} (${e.message})`); continue; }
  } else if (rows >= 0) {
    const end = text.indexOf('\n];', rows);
    try {
      // The rows' last element is a function; it is made, never called, so what it names
      // need not exist here.
      const L = new Function('return (' + text.slice(rows + 'const MUTANTS = '.length, end + 2) + ');')();
      const text3 = L.filter((r) => Array.isArray(r) && typeof r[2] === 'string' && /\.js$/.test(r[2]) && typeof r[3] === 'string');
      if (!text3.length) continue;
      M = Object.fromEntries(text3.map((r) => [r[0], [r[2], r[3], r[4]]]));
    } catch (e) { unread.push(`${f} (${e.message})`); continue; }
  } else if (list >= 0) {
    const end = text.indexOf('\n  ];', list);
    try {
      const L = new Function('return (' + text.slice(list + 'const MUTS = '.length, end + 4) + ');')();
      M = Object.fromEntries(L.map((m) => [m.name, [m.file, m.from, m.to]]));
    } catch (e) { unread.push(`${f} (${e.message})`); continue; }
  } else continue;
  suites++;
  for (const [name, raw] of Object.entries(M)) {
    const list = typeof raw[0] === 'string' ? [raw] : typeof raw[0] === 'number' ? [raw.slice(1, 4), ...(raw[4] || [])] : raw;
    for (const p of list) {
      const [file, from] = p;
      const src = [path.join(REPO, file), path.join(REPO, 'src', file)].find((c) => fs.existsSync(c));
      total++;
      if (!src) { console.log(`  FAIL ${f} ${name}: no file ${file}`); bad++; continue; }
      const n = fs.readFileSync(src, 'utf8').replace(/\r\n/g, '\n').split(from).length - 1;
      if (n !== 1) { console.log(`  FAIL ${f} ${name}: its text is in ${file} ${n} times, not once: ${JSON.stringify(from.slice(0, 100))}`); bad++; }
    }
  }
}
if (unread.length) console.log(`  (not read: ${unread.join('; ')})`);
console.log(`  ${total} patches of ${suites} suites' mutants: ${bad ? bad + ' stranded' : 'every one still applies'}`);
process.exit(bad ? 1 : 0);
