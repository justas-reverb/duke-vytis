// One evaluation worker for tools/tune-bot.mjs.
//
// TUNE is a live, mutable object rather than a set of module-load constants precisely so
// that one process can evaluate thousands of candidate configurations without paying
// Node's startup cost each time. The parent forks one of these per core and keeps them
// alive for the whole search.

import { TUNE } from '../src/game/autoplay.js';
import { audit } from './test-botskill.mjs';

const DEFAULTS = { ...TUNE };

process.on('message', (msg) => {
  if (msg.cmd === 'stop') process.exit(0);

  // Reset first: a worker evaluates many candidates and a key left over from the
  // previous one would silently contaminate this result.
  Object.assign(TUNE, DEFAULTS, msg.tune);

  const rows = msg.seeds.map((s) => audit(s, msg.minutes));
  const mean = (f) => rows.reduce((a, r) => a + f(r), 0) / rows.length;
  const sorted = rows.map((r) => r.perMin).sort((a, b) => a - b);

  process.send({
    id: msg.id,
    perMin: mean((r) => r.perMin),
    p10: sorted[Math.floor(0.1 * (sorted.length - 1))],
    median: sorted[Math.floor(0.5 * (sorted.length - 1))],
    bounces: mean((r) => r.bouncesPerMin),
    air: mean((r) => r.airPerMin),
    fast: mean((r) => r.fastPct),
    mom: mean((r) => r.meanMomentum),
    combo: mean((r) => r.bestCombo),
    stuck: rows.filter((r) => r.worstStall >= 4).length,
    dead: rows.filter((r) => r.perMin < 100).length,
  });
});

process.send({ id: 'ready' });
