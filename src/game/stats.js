// Persistent statistics.
//
// Two tiers: a `run` object that is thrown away every death, and an `all` object that
// is merged into localStorage after each run. Everything the stats screen shows is
// either stored here or derived from it -- no counter is computed in the renderer,
// so what is displayed and what is saved cannot drift apart.

import { FIRST_THEME_FLOORS, FLOORS_PER_THEME, FLOOR_POINTS } from './constants.js';
import { chainScore } from './combo.js';
import { key } from './savekeys.js';

const KEY = key('stats.v1');

export const BLANK_RUN = () => ({
  floor: 0, maxFloor: 0, score: 0,
  jumps: 0, doubleJumps: 0, tripleJumps: 0, wallBounces: 0, wallKicks: 0,
  instaJumps: 0, bestInstaChain: 0,
  combos: 0, bestCombo: 0, bestComboScore: 0, bestComboFlair: 0, comboFloors: 0,
  distance: 0, airTime: 0, seconds: 0, topSpeed: 0, topClimb: 0,
  comboHist: new Array(10).fill(0),
  themesSeen: 1, checkpoints: 0, perfectHops: 0, longestAir: 0,
  // The run's JUMP SPEED (Game.newRun). Runs at every speed share the records; the history
  // entries below keep it, so a table can say which were faster.
  jumpSpeed: 1,
  // ...and its PLATFORMS, the same way: which were on narrower ledges; and its DIFFICULTY.
  platforms: 1,
  difficulty: 0,
  // ...and its GRAVITY: which were climbed lighter or heavier.
  gravity: 1,
});

// 2 (2026-09-28): the score's new scale (combo.js scoreFor). A save of version 1 is
// re-scored as it loads (rescore, below).
export const STATS_VERSION = 2;

export const BLANK_ALL = () => ({
  version: STATS_VERSION,
  totalRuns: 0,
  bestFloor: 0, bestScore: 0, bestCombo: 0, bestComboScore: 0, bestComboFlair: 0,
  totalFloors: 0, totalScore: 0, totalJumps: 0, totalDoubleJumps: 0,
  totalTripleJumps: 0, totalWallBounces: 0, totalCombos: 0, totalComboFloors: 0,
  totalDistance: 0, totalAirTime: 0, totalPlaySeconds: 0,
  totalInstaJumps: 0, bestInstaChain: 0,
  topSpeed: 0, topClimb: 0, themesSeen: 1, longestRunSeconds: 0, longestAir: 0,
  deaths: 0, checkpoints: 0,
  comboHist: new Array(10).fill(0),     // buckets by tier index
  themeBest: new Array(12).fill(0),     // best floor reached inside each zone (100, then 200 each)
  recent: [],                           // last 10 runs, newest first
  best: [],                             // top 10 runs by score
  achievements: {},                     // id -> unlock timestamp
  firstPlayed: 0, lastPlayed: 0,
});

export function load() {
  const blank = BLANK_ALL();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank;
    const parsed = JSON.parse(raw);
    // Merge rather than replace: a save written by an older build is missing keys,
    // and a missing counter must read 0, not undefined, or every derived average
    // downstream turns into NaN.
    const out = { ...blank, ...parsed };
    out.comboHist = Array.isArray(parsed.comboHist) ? parsed.comboHist.slice(0, 10) : blank.comboHist;
    while (out.comboHist.length < 10) out.comboHist.push(0);
    out.themeBest = Array.isArray(parsed.themeBest) ? parsed.themeBest.slice(0, 12) : blank.themeBest;
    while (out.themeBest.length < 12) out.themeBest.push(0);
    out.recent = Array.isArray(parsed.recent) ? parsed.recent : [];
    out.best = Array.isArray(parsed.best) ? parsed.best : [];
    out.achievements = parsed.achievements && typeof parsed.achievements === 'object' ? parsed.achievements : {};
    if (!(parsed.version >= 2)) rescore(out);
    return out;
  } catch (e) {
    // A corrupt or quota-blocked store must not stop the game being playable.
    console.warn('stats load failed, starting fresh:', e);
    return blank;
  }
}

/**
 * A save from before the score's new scale (combo.js scoreFor), brought onto it. Its
 * scores were in the hundreds of millions, and kept as they were the HIGH SCORE could never
 * be beaten again, the HUD's BEST line would read 300000000 over every run, and the best
 * runs table would hold ten runs no new one could enter.
 *
 * A run's score cannot be worked out again exactly: it was the floors plus every chain the
 * run banked, and a save keeps only each run's floor, its longest chain, and its air jumps
 * and wall bounces. So each kept run is scored as if its longest chain carried every trick
 * of the run -- which most of a long run's score was: the menu's bot holds one chain from
 * start to death. The records follow from those runs: the HIGH SCORE is the best of them,
 * the BEST COMBO SCORE is the longest chain with the most tricks, and the lifetime total is
 * scaled by how much the kept runs shrank. Awards already earned are kept.
 */
export function rescore(all) {
  const estimate = (e) => (e.floor || 0) * FLOOR_POINTS + chainScore(e.combo || 0, (e.bounces || 0) + (e.air || 0));
  const seen = new Map();
  for (const e of [...all.recent, ...all.best]) {
    if (!e || typeof e !== 'object') continue;
    const key = e.at + ':' + e.floor;
    if (!seen.has(key)) seen.set(key, { was: Number(e.score) || 0, now: estimate(e) });
    e.score = seen.get(key).now;
  }
  all.best.sort((a, b) => b.score - a.score);
  let was = 0, now = 0;
  for (const s of seen.values()) { was += s.was; now += s.now; }
  all.bestScore = Math.max(0, ...[...seen.values()].map((s) => s.now));
  all.bestComboScore = all.bestCombo ? chainScore(all.bestCombo, all.bestComboFlair || 0) : 0;
  all.totalScore = was > 0 ? Math.round(all.totalScore * (now / was)) : 0;
  all.version = STATS_VERSION;
  return all;
}

export function save(all) {
  try { localStorage.setItem(KEY, JSON.stringify(all)); return true; }
  catch (e) { console.warn('stats save failed:', e); return false; }
}

/**
 * Wipe the whole record: awards, lifetime totals, run history, everything.
 *
 * An awards-only reset was tried first and it is not worth having. Every award is gated
 * on a lifetime stat, so clearing just the unlock map lets `check()` re-stamp all of
 * them on the very next death -- the board clears and refills itself inside one run.
 * Clearing the gating stats as well fixes that but leaves the rest of the page covered
 * in numbers, which reads as the reset having failed. There is only one honest version.
 *
 * Returns a NEW blank record; the caller must reassign its own reference, or the next
 * commit() writes the stale in-memory copy straight back over the cleared storage.
 */
export function reset() {
  try { localStorage.removeItem(KEY); } catch (e) { /* nothing useful to do */ }
  return BLANK_ALL();
}

/** Fold a finished run into the all-time record. Returns the list of new records set. */
export function commit(all, run, tierIndex) {
  const records = [];
  const beat = (key, value, label) => {
    if (value > all[key]) { all[key] = value; records.push(label); return true; }
    return false;
  };

  all.totalRuns++;
  all.deaths++;
  beat('bestFloor', run.maxFloor, 'HIGHEST FLOOR');
  beat('bestScore', run.score, 'HIGH SCORE');
  beat('bestCombo', run.bestCombo, 'BEST COMBO');
  beat('bestComboScore', run.bestComboScore, 'BEST COMBO SCORE');
  beat('bestComboFlair', run.bestComboFlair, 'MOST STYLISH COMBO');
  beat('topClimb', run.topClimb || 0, 'TOP SPEED');
  // Still kept, silently: VELOCITY and MAX THRUST are awarded on the sideways speed.
  if (run.topSpeed > all.topSpeed) all.topSpeed = run.topSpeed;
  beat('longestRunSeconds', run.seconds, 'LONGEST RUN');
  beat('longestAir', run.longestAir, 'LONGEST HANG TIME');
  beat('bestInstaChain', run.bestInstaChain, 'LONGEST JUMP CHAIN');
  if (run.themesSeen > all.themesSeen) all.themesSeen = run.themesSeen;

  all.totalFloors += run.maxFloor;
  all.totalScore += run.score;
  all.totalJumps += run.jumps;
  all.totalDoubleJumps += run.doubleJumps;
  all.totalTripleJumps += run.tripleJumps;
  all.totalWallBounces += run.wallBounces;
  all.totalInstaJumps += run.instaJumps;
  all.totalCombos += run.combos;
  all.totalComboFloors += run.comboFloors;
  all.totalDistance += run.distance;
  all.totalAirTime += run.airTime;
  all.totalPlaySeconds += run.seconds;
  all.checkpoints += run.checkpoints;

  // Every combo of the run, by tier. It used to add ONE -- the tier of whichever combo
  // happened to close last -- so a run of forty combos put a single mark on the chart
  // titled COMBOS BY TIER.
  (run.comboHist || []).forEach((n, i) => { if (i < all.comboHist.length) all.comboHist[i] += n; });
  void tierIndex;

  // Per zone, on the real schedule: 100 floors, then 200 each. It was written on
  // uniform 100-floor bands, so a best of 1100 filled all twelve. The stats page now reads
  // bestFloor directly; this is kept correct because it is still saved.
  for (let i = 0; i < all.themeBest.length; i++) {
    const lo = i === 0 ? 0 : FIRST_THEME_FLOORS + (i - 1) * FLOORS_PER_THEME;
    const len = i === 0 ? FIRST_THEME_FLOORS : FLOORS_PER_THEME;
    if (run.maxFloor < lo) break;
    const cap = Math.min(run.maxFloor, lo + len);
    if (cap > all.themeBest[i]) all.themeBest[i] = cap;
  }

  const entry = {
    at: Date.now(), floor: run.maxFloor, score: run.score,
    combo: run.bestCombo, seconds: Math.round(run.seconds),
    bounces: run.wallBounces, air: run.doubleJumps + run.tripleJumps,
    speed: run.jumpSpeed || 1, plat: run.platforms || 1, diff: run.difficulty || 0,
    grav: run.gravity || 1,
  };
  all.recent.unshift(entry);
  all.recent = all.recent.slice(0, 10);
  all.best = [...all.best, entry].sort((a, b) => b.score - a.score).slice(0, 10);

  if (!all.firstPlayed) all.firstPlayed = entry.at;
  all.lastPlayed = entry.at;

  save(all);
  return records;
}

/** Values the achievement table and the stats screen read by name. */
export function derived(all) {
  const runs = Math.max(1, all.totalRuns);
  return {
    ...all,
    avgFloor: all.totalFloors / runs,
    avgScore: all.totalScore / runs,
    avgSeconds: all.totalPlaySeconds / runs,
    floorsPerMinute: all.totalPlaySeconds > 0 ? (all.totalFloors / all.totalPlaySeconds) * 60 : 0,
    airPercent: all.totalPlaySeconds > 0 ? (all.totalAirTime / all.totalPlaySeconds) * 100 : 0,
    comboRate: all.totalRuns > 0 ? all.totalCombos / runs : 0,
    metresRun: all.totalDistance / 30,   // one "floor height" as a unit of distance
  };
}
