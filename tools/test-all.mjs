// Run every suite in tools/.
//
//   node tools/test-all.mjs          every suite but the slow one
//   node tools/test-all.mjs --slow   all of them, including the optimality sweep
//
// The suites are DISCOVERED, not listed. A list here would be one more place that has
// to be remembered when a suite is added, and the one thing worse than no test is a
// test nobody runs -- which is exactly what happened to test-perf, left out of the
// README's loop by a `\n` that was a literal backslash-n. To add a suite, name it
// tools/test-<name>.mjs and exit non-zero on failure; that is the whole registration.
// No counts in this comment either: the ones that were here said seventeen and
// eighteen long after there were twenty-one.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const slow = process.argv.includes('--slow');

// The optimality sweep searches parameter space and takes minutes on its own, so it
// runs only when asked for. The rest are no longer the one-second suites they were:
// test-companions alone runs a 100,000-step GLIDE climb on top of its own, and the fast
// run was last timed whole at 438 s, 28 suites, on 2026-09-23; more than a dozen suites
// have been added since (twelve in the round of 2026-09-24 alone), several of them near a
// minute each (docs/TESTING.md). This said about four minutes. The runner prints its own
// total rather than this comment promising one.
const SLOW = new Set(['test-optimal.mjs']);

const suites = fs.readdirSync(HERE)
  .filter((f) => /^test-.*\.mjs$/.test(f) && f !== 'test-all.mjs')
  .sort();

let failed = 0, ran = 0, skipped = 0;
const t0 = Date.now();

for (const file of suites) {
  if (SLOW.has(file) && !slow) { skipped++; continue; }
  const name = file.replace(/^test-|\.mjs$/g, '');
  const r = spawnSync(process.execPath, [path.join(HERE, file)], { encoding: 'utf8' });
  ran++;
  if (r.status === 0) {
    // One line each when they pass: a wall of output nobody reads is how a failure
    // gets scrolled past.
    const last = (r.stdout || '').trim().split('\n').filter((l) => l.trim()).pop() || '';
    console.log(`  ok    ${name.padEnd(14)} ${last.trim().slice(0, 74)}`);
  } else {
    failed++;
    console.log(`\n  FAIL  ${name}`);
    console.log((r.stdout || '').split('\n').map((l) => '        ' + l).join('\n'));
    if (r.stderr) console.log((r.stderr).split('\n').map((l) => '        ' + l).join('\n'));
  }
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n  ${ran - failed}/${ran} suites passed in ${secs}s` +
  (skipped ? `  (${skipped} slow skipped -- run with --slow)` : ''));
process.exit(failed ? 1 : 0);
