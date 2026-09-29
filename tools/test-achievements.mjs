import { ACHIEVEMENTS } from '../src/game/achievements.js';
import { BLANK_ALL, derived } from '../src/game/stats.js';
import { GLYPHS } from '../src/render/font.js';

const ALLOWED = new Set(Object.keys(derived(BLANK_ALL())));
const zero = derived(BLANK_ALL());

let bad = 0;
const ids = new Set();
for (const a of ACHIEVEMENTS) {
  if (ids.has(a.id)) { console.log('  DUPLICATE ID   ' + a.id); bad++; }
  ids.add(a.id);
  if (!/^[a-z0-9_]+$/.test(a.id)) { console.log('  BAD ID FORMAT  ' + a.id); bad++; }
  if (!ALLOWED.has(a.stat)) { console.log('  UNKNOWN STAT   ' + a.id + ' -> ' + a.stat); bad++; }
  if (a.name.length > 18) { console.log('  NAME TOO LONG  ' + a.name + ' (' + a.name.length + ')'); bad++; }
  if (a.desc.length > 30) { console.log('  DESC TOO LONG  ' + a.desc + ' (' + a.desc.length + ')'); bad++; }
  if (a.op !== '>=') { console.log('  BAD OP         ' + a.id + ' ' + a.op); bad++; }
  if (!(a.value > 0)) { console.log('  BAD VALUE      ' + a.id + ' ' + a.value); bad++; }
  for (const ch of a.name + a.desc) if (!GLYPHS[ch]) { console.log('  NO GLYPH       ' + a.id + ' ' + JSON.stringify(ch)); bad++; }
  // The real trap: an achievement already satisfied by a brand new save file.
  if (typeof zero[a.stat] === 'number' && zero[a.stat] >= a.value) {
    console.log('  FREE UNLOCK    ' + a.id + ' (' + a.stat + ' starts at ' + zero[a.stat] + ' >= ' + a.value + ')');
    bad++;
  }
}
// --- they have to FIT the awards page -------------------------------------
//
// statsAwards draws the name left-aligned from x+9 and the description right-aligned at
// x+206, in a column 216 wide. Nothing stopped the two from meeting, and five of the
// twenty-eight overlapped -- by up to nineteen pixels, which at this font is three
// characters of one word sitting on top of another.
{
  const COL = 206;          // from x+9 to x+206, the space the pair must share
  const GAP = 12;           // two characters of clear air, or they read as one string
  const W = (str) => str.length * 6;
  for (const a of ACHIEVEMENTS) {
    const used = 9 + W(a.name) + W(a.desc);
    if (used > COL - GAP) {
      console.log(`  AWARDS PAGE OVERLAP  "${a.name}" + "${a.desc}" leaves ` +
        `${COL - used}px between them, want ${GAP}`);
      bad++;
    }
  }
}

// --- the stats are on the tower's real schedule ---------------------------------
//
// TOWER PROGRESS drew twelve zones of 100 floors each, 0 to 1100, so a best of 1200 showed
// ZENITH complete, nine hundred floors short of it. The zones are 100 and then 200 each.
// And COMBOS BY TIER added one mark per RUN, whatever its combo count.
{
  const S = await import('../src/game/stats.js');
  const all = S.BLANK_ALL();
  const run = S.BLANK_RUN();
  run.maxFloor = 1250; run.topClimb = 400; run.topSpeed = 470;
  run.comboHist[0] = 5; run.comboHist[2] = 3;
  S.commit(all, run, 2);
  const want = [100, 300, 500, 700, 900, 1100, 1250, 0, 0, 0, 0, 0];
  if (all.themeBest.join() !== want.join()) {
    console.log(`  ZONE PROGRESS  themeBest ${all.themeBest.join()} for a best of 1250, want ${want.join()}`);
    bad++;
  }
  if (all.comboHist[0] !== 5 || all.comboHist[2] !== 3) {
    console.log(`  COMBOS BY TIER  counted ${all.comboHist.join()} for a run of 5 + 3 combos`);
    bad++;
  }
  if (all.topClimb !== 400 || all.topSpeed !== 470) {
    console.log(`  TOP SPEED  topClimb ${all.topClimb}, topSpeed ${all.topSpeed}: both must be kept`);
    bad++;
  }
}

// --- a save from before the score's new scale is re-scored as it loads ------------------
//
// Scores used to run to hundreds of millions (combo.js scoreFor). A save of those, kept as it
// was, would hold a HIGH SCORE no new run could beat and a best-runs table no new run could
// enter. stats.js load() re-scores it once: each kept run as if its longest chain carried the
// run's tricks, the records from those, the lifetime total scaled with them, awards kept.
{
  const S = await import('../src/game/stats.js');
  const { chainScore } = await import('../src/game/combo.js');
  const { FLOOR_POINTS } = await import('../src/game/constants.js');
  const runA = { at: 1, floor: 1966, score: 148724860, combo: 1686, seconds: 180, bounces: 250, air: 70, speed: 1 };
  const runB = { at: 2, floor: 1161, score: 50297423, combo: 900, seconds: 120, bounces: 100, air: 40, speed: 1 };
  const old = {
    version: 1, totalRuns: 3, bestScore: 148724860, bestCombo: 1686, bestComboFlair: 320, bestComboScore: 148000000,
    totalScore: 199500000, recent: [{ ...runB }, { ...runA }], best: [{ ...runA }, { ...runB }], achievements: { first_coin: 5 },
  };
  const held = new Map([['dukevytis.stats.v1', JSON.stringify(old)]]);
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, writable: true,
    value: { getItem: (k) => (held.has(k) ? held.get(k) : null), setItem: (k, v) => held.set(k, String(v)), removeItem: (k) => held.delete(k) },
  });
  const problems = [];
  try {
    const all = S.load();
    const want = (e) => e.floor * FLOOR_POINTS + chainScore(e.combo, e.bounces + e.air);
    if (all.version !== S.STATS_VERSION) problems.push(`version ${all.version}, not ${S.STATS_VERSION}`);
    if (all.bestScore !== want(runA)) problems.push(`HIGH SCORE ${all.bestScore}, want ${want(runA)}`);
    if (!(all.bestScore < 1e7)) problems.push(`HIGH SCORE ${all.bestScore} is not a normal number`);
    if (all.best.map((e) => e.score).join() !== [want(runA), want(runB)].join()) problems.push(`best runs ${all.best.map((e) => e.score)}`);
    if (all.recent.map((e) => e.score).join() !== [want(runB), want(runA)].join()) problems.push(`recent runs ${all.recent.map((e) => e.score)}`);
    if (all.bestComboScore !== chainScore(1686, 320)) problems.push(`BEST COMBO SCORE ${all.bestComboScore}, want ${chainScore(1686, 320)}`);
    const total = Math.round(old.totalScore * ((want(runA) + want(runB)) / (runA.score + runB.score)));
    if (all.totalScore !== total) problems.push(`POINTS SCORED ${all.totalScore}, want ${total}`);
    if (!all.achievements.first_coin) problems.push('an award earned before was lost');
    // Saved on the new version, it is read back as it is, not re-scored again.
    S.save(all);
    const again = S.load();
    if (again.bestScore !== all.bestScore || again.totalScore !== all.totalScore || again.best[0].score !== all.best[0].score) {
      problems.push('a save of the new version was re-scored again');
    }
  } finally {
    if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete globalThis.localStorage;
  }
  if (problems.length) { console.log('  RESCORE  ' + problems.join('; ')); bad++; }
}

console.log('\n  ' + ACHIEVEMENTS.length + ' achievements, ' + bad + ' problems');
process.exit(bad ? 1 : 0);
