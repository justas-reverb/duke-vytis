// Where replays are kept: the last run, the ten best, and any the player pins.
//
// localStorage today, as the settings (dukevytis.settings.v2) and the stats
// (dukevytis.stats.v1) are, under the same scheme (savekeys.js): an index at
// `dukevytis.replays.v1` and each replay's text at `dukevytis.replay.v1.<id>`. The storage itself is a four-method
// backend -- get, set, remove, keys -- so the desktop shell or a phone can hand in files
// instead (setReplayBackend in replay.js) without anything here changing.
//
// What is kept, decided after every save:
//   - the LAST run the player finished, whatever it scored;
//   - the REPLAY_BEST_KEPT best of the player's own runs, ranked by score; a tie on score
//     goes to the higher floor, then to the faster run (fewer seconds), then to the one
//     that got there first -- so a later run that only equals a best does not push it
//     out. Floors count only as that tie-break: the game's own best list (stats.js) is
//     by score, and so is this one;
//   - everything pinned, own or imported. An imported replay is someone else's run: it
//     never counts among the player's bests and is kept only while pinned.
// Within REPLAY_STORE_BUDGET characters: over it, the lowest-ranked bests go first, then
// the last run. Pinned replays and the best run are never evicted for room.
//
// NEVER LOSE THE BEST RUN TO A QUOTA ERROR. A save writes the new text first and the
// index after, and deletes nothing it is replacing until both writes have succeeded. A
// quota error on either write evicts one more candidate -- never the best run, never a
// pinned one -- and tries again; when nothing is left to evict, the new replay is not
// kept and every replay that was there before still is: the candidates it let go for room
// are written back (see save). A crash between the two writes leaves a text the index does
// not know; the next list() adopts it (its id says whose it is) or drops it if it does not
// decode.
//
// And never keep a text that will not load: a save decodes what it is about to write
// first. The recorder once wrote files the decoder refused (a held arrow key on the
// options screen; see Recorder.interlude), and a store that trusts the encoder would have
// kept the player's best run as a text nothing could read -- and, being the best, never
// let it go. The check costs about as long as an import (2-3 ms for a ten-minute run).

import { REPLAY_STORE_BUDGET, REPLAY_BEST_KEPT } from './constants.js';
import { fpText } from './replaycodec.js';
import { key } from './savekeys.js';

export const INDEX_KEY = key('replays.v1');
export const TEXT_PREFIX = key('replay.v1.');
const ID = /^[oi][0-9a-z]{1,12}$/;

export function localBackend(ls) {
  return {
    get: (k) => ls.getItem(k),
    set: (k, v) => ls.setItem(k, v),
    remove: (k) => ls.removeItem(k),
    keys: () => { const out = []; for (let i = 0; i < ls.length; i++) out.push(ls.key(i)); return out; },
  };
}

/** In memory, with an optional quota in characters (keys and values), for tests. */
export function memoryBackend(limit = Infinity) {
  const m = new Map();
  let used = 0;
  return {
    get: (k) => (m.has(k) ? m.get(k) : null),
    set: (k, v) => {
      v = String(v);
      const before = m.has(k) ? k.length + m.get(k).length : 0;
      if (used - before + k.length + v.length > limit) {
        const e = new Error('quota exceeded');
        e.name = 'QuotaExceededError';
        throw e;
      }
      used += k.length + v.length - before;
      m.set(k, v);
    },
    remove: (k) => { if (m.has(k)) { used -= k.length + m.get(k).length; m.delete(k); } },
    keys: () => [...m.keys()],
    get used() { return used; },
    map: m,
  };
}

export function defaultBackend() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.getItem === 'function') {
      void localStorage.length;   // a blocked store throws here, not later
      return localBackend(localStorage);
    }
  } catch (e) { /* private window, blocked storage: fall through */ }
  return memoryBackend();
}

/**
 * The SIM_VERSION from which runs score on the scale they do now (combo.js scoreFor). A run
 * recorded before it scored as the cube of its longest chain -- hundreds of millions for a
 * good one -- and ranked on score against the new scale it would keep every new run out of
 * the bests for good, and as the best run it could never be evicted. Its version is the
 * first number of the fingerprint every entry keeps; an entry with none is older still.
 */
export const SCORE_SCALE_SINCE = 3;
const scaleOf = (e) => (Number.parseInt(e.fp, 10) >= SCORE_SCALE_SINCE ? 1 : 0);

/**
 * Best first: runs on the current score scale before those from before it, then score,
 * then floor, then fewer seconds, then the earlier run.
 */
export function rankOrder(a, b) {
  return (scaleOf(b) - scaleOf(a)) || (b.score - a.score) || (b.floor - a.floor) || (a.seconds - b.seconds)
    || (a.date - b.date) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const FP = /^\d{1,7}\.[0-9a-f]{8}\.[0-9a-f]{8}$/;

function cleanEntry(e) {
  if (!e || typeof e !== 'object' || typeof e.id !== 'string' || !ID.test(e.id)) return null;
  const out = {
    id: e.id,
    origin: e.id[0] === 'o' ? 'own' : 'imported',
    pinned: e.pinned === true,
    score: num(e.score, 0, Number.MAX_SAFE_INTEGER),
    floor: num(e.floor, 0, 1e7),
    seconds: num(e.seconds, 0, 1e7),
    zone: num(e.zone, 0, 255),
    date: num(e.date, 0, 8.64e15),
    ended: e.ended === 'quit' || e.ended === 'cut' ? e.ended : 'fire',
    seed: num(e.seed, 0, 4294967295),
    chars: num(e.chars, 0, 1e9),
    // The simulation fingerprint it was recorded under, so a list can say which replays
    // this build plays without decoding every one.
    fp: typeof e.fp === 'string' && FP.test(e.fp) ? e.fp : '',
    // The run's JUMP SPEED, for the list to show; an entry written before the setting has
    // none and was climbed at 1.
    speed: num(e.speed, 1, 8) ?? 1,
    // ...and its GRAVITY, the same way: none is NORMAL, the weight every run before it had.
    gravity: num(e.gravity, 0.05, 8) ?? 1,
  };
  for (const k of ['score', 'floor', 'seconds', 'zone', 'date', 'seed', 'chars']) if (out[k] === null) return null;
  return out;
}

function entryFor(id, replay, chars, pinned) {
  const r = replay.result, h = replay.header;
  return {
    id, origin: id[0] === 'o' ? 'own' : 'imported', pinned: !!pinned,
    score: r.score, floor: r.floor, seconds: r.seconds, zone: r.zone, date: h.date,
    ended: r.ended, seed: h.seed, chars, fp: fpText(h), speed: h.jumpSpeed || 1,
    gravity: h.gravity || 1,
  };
}

export class ReplayStore {
  constructor(backend, { encode, decode, budget = REPLAY_STORE_BUDGET, bestKept = REPLAY_BEST_KEPT } = {}) {
    this.b = backend;
    this.encode = encode;
    this.decode = decode;
    this.budget = budget;
    this.bestKept = bestKept;
  }

  // ---- the index --------------------------------------------------------------------
  readIndex() {
    let ix = null;
    try {
      const raw = this.b.get(INDEX_KEY);
      if (raw && raw.length < 1e6) {
        const p = JSON.parse(raw);
        if (p && typeof p === 'object' && Array.isArray(p.entries) && p.entries.length <= 1000) {
          const entries = [];
          const seen = new Set();
          for (const e of p.entries) {
            const c = cleanEntry(e);
            if (c && !seen.has(c.id)) { seen.add(c.id); entries.push(c); }
          }
          ix = {
            next: num(p.next, 0, 1e12) || 0,
            last: typeof p.last === 'string' && seen.has(p.last) ? p.last : null,
            entries,
          };
        }
      }
    } catch (e) { ix = null; }
    return ix || { next: 0, last: null, entries: [] };
  }

  writeIndex(ix) {
    this.b.set(INDEX_KEY, JSON.stringify({ v: 1, next: ix.next, last: ix.last, entries: ix.entries }));
  }

  /**
   * The index, squared with what is actually stored: entries whose text is gone are
   * dropped, and texts the index does not know (a crash between a save's two writes) are
   * adopted if they decode and deleted if not.
   */
  reconcile() {
    const ix = this.readIndex();
    let keys;
    try { keys = this.b.keys(); } catch (e) { return ix; }
    const present = new Set(keys.filter((k) => k.startsWith(TEXT_PREFIX)).map((k) => k.slice(TEXT_PREFIX.length)));
    let changed = false;
    const known = new Set();
    ix.entries = ix.entries.filter((e) => {
      if (present.has(e.id)) { known.add(e.id); return true; }
      changed = true;
      return false;
    });
    for (const id of present) {
      if (known.has(id)) continue;
      changed = true;
      let text = null;
      try { text = this.b.get(TEXT_PREFIX + id); } catch (e) { text = null; }
      const d = ID.test(id) && text ? this.decode(text) : null;
      if (d && d.ok) {
        ix.entries.push(entryFor(id, d.replay, text.length, id[0] === 'i'));
        const n = parseInt(id.slice(1), 36);
        if (n + 1 > ix.next) ix.next = n + 1;
      } else {
        try { this.b.remove(TEXT_PREFIX + id); } catch (e) { /* nothing to do */ }
      }
    }
    if (ix.last && !ix.entries.some((e) => e.id === ix.last)) { ix.last = null; changed = true; }
    if (changed) { try { this.writeIndex(ix); } catch (e) { /* read-only is still readable */ } }
    return ix;
  }

  /**
   * Which entries to keep, and in what order to let the rest go if room is short:
   * `keep` in the order they would be evicted (first = first to go), and `protect`, which
   * nothing evicts.
   */
  plan(ix) {
    const own = ix.entries.filter((e) => e.origin === 'own').sort(rankOrder);
    const best = own.slice(0, this.bestKept);
    const protect = new Set(ix.entries.filter((e) => e.pinned).map((e) => e.id));
    if (best.length) protect.add(best[0].id);
    const byId = new Map(ix.entries.map((e) => [e.id, e]));
    const evictable = [];
    for (let i = best.length - 1; i >= 1; i--) if (!protect.has(best[i].id) && best[i].id !== ix.last) evictable.push(best[i].id);
    if (ix.last && !protect.has(ix.last)) evictable.push(ix.last);
    const keep = new Set([...protect, ...best.map((e) => e.id)]);
    if (ix.last) keep.add(ix.last);
    // The budget: evict in order until what is kept fits.
    let total = 0;
    for (const id of keep) total += byId.get(id).chars;
    for (const id of evictable) {
      if (total <= this.budget) break;
      if (!keep.has(id)) continue;
      keep.delete(id);
      total -= byId.get(id).chars;
    }
    return { keep, protect, evictable: evictable.filter((id) => keep.has(id)), rank: best.map((e) => e.id) };
  }

  // ---- the operations the UI calls --------------------------------------------------
  list() {
    const ix = this.reconcile();
    const { rank } = this.plan(ix);
    const pos = new Map(rank.map((id, i) => [id, i + 1]));
    const out = ix.entries.map((e) => ({ ...e, last: e.id === ix.last, rank: pos.get(e.id) || 0 }));
    out.sort((a, b) => (a.rank && b.rank ? a.rank - b.rank : a.rank ? -1 : b.rank ? 1 : (b.last - a.last) || (b.date - a.date)));
    return out;
  }

  load(id) {
    if (typeof id !== 'string' || !ID.test(id)) return { ok: false, error: 'no such replay' };
    let text = null;
    try { text = this.b.get(TEXT_PREFIX + id); } catch (e) { text = null; }
    if (!text) { this.reconcile(); return { ok: false, error: 'no such replay' }; }
    return this.decode(text);
  }

  /** Save a replay: 'own' for a run the player just played, 'imported' (kept pinned) for one pasted in. */
  save(replay, origin) {
    let text;
    try { text = this.encode(replay); } catch (e) { return { ok: false, kept: false, error: e.message }; }
    const back = this.decode(text);
    if (!back || !back.ok) {
      return { ok: false, kept: false, error: 'not kept: it would not load back (' + (back && back.error) + ')' };
    }
    const ix = this.reconcile();
    const id = (origin === 'own' ? 'o' : 'i') + ix.next.toString(36);
    const entry = entryFor(id, replay, text.length, origin !== 'own');
    const before = new Set(ix.entries.map((e) => e.id));
    const bestBefore = this.plan(ix).rank[0] || null;

    const next = { next: ix.next + 1, last: origin === 'own' ? id : ix.last, entries: [...ix.entries, entry] };
    const p = this.plan(next);
    if (!p.keep.has(id)) {
      return { ok: true, id: null, kept: false, rank: 0, error: 'not kept: the storage for replays is full' };
    }
    // Candidates a quota error may take, first to go first. Never the best run as it
    // stands before this save, never a pinned one, never the new one.
    const spare = p.evictable.filter((x) => x !== id && x !== bestBefore);
    const drop = (x) => { try { this.b.remove(TEXT_PREFIX + x); } catch (e) { /* gone is gone */ } };
    // A candidate let go for room is held here until the save is known to succeed, and
    // written back if it does not. It used to be deleted on the spot: a run too big for
    // the quota took every candidate with it one at a time and was then refused anyway:
    // every replay but the best and the pinned ones gone, nothing new kept (measured: 8 of
    // 10 for a low run that did not fit, 7 of 10 for a new best). Written back into the
    // room they left, with the new text removed first, they fit again.
    const held = [];
    const letGo = (x) => {
      let t = null;
      try { t = this.b.get(TEXT_PREFIX + x); } catch (e) { t = null; }
      if (typeof t === 'string') held.push([x, t]);
      drop(x);
    };
    const putBack = () => {
      for (const [x, t] of held) { try { this.b.set(TEXT_PREFIX + x, t); } catch (e) { /* nothing more to do */ } }
    };

    // 1. The new text.
    for (;;) {
      try { this.b.set(TEXT_PREFIX + id, text); break; }
      catch (e) {
        const x = spare.shift();
        if (!x) { putBack(); return { ok: false, id: null, kept: false, rank: 0, error: 'not kept: the browser storage is full' }; }
        p.keep.delete(x);
        letGo(x);
      }
    }
    // 2. The index, without what the plan lets go.
    next.entries = next.entries.filter((e) => p.keep.has(e.id));
    if (next.last && !p.keep.has(next.last)) next.last = null;
    for (;;) {
      try { this.writeIndex(next); break; }
      catch (e) {
        const x = spare.shift();
        if (!x) {
          // The old index is still the one stored; with the new text gone and the
          // candidates back, the store is as it was before this save.
          drop(id);
          putBack();
          return { ok: false, id: null, kept: false, rank: 0, error: 'not kept: the browser storage is full' };
        }
        p.keep.delete(x);
        next.entries = next.entries.filter((en) => en.id !== x);
        if (next.last === x) next.last = null;
        letGo(x);
      }
    }
    // 3. Only now, the texts it replaced.
    for (const x of before) if (!p.keep.has(x)) drop(x);
    const rank = this.plan(next).rank.indexOf(id) + 1;
    return { ok: true, id, kept: true, rank };
  }

  /** Pin or unpin. Unpinning a replay that is neither the last run nor a best deletes it. */
  pin(id, pinned) {
    const ix = this.reconcile();
    const e = ix.entries.find((x) => x.id === id);
    if (!e) return false;
    e.pinned = !!pinned;
    const p = this.plan(ix);
    const gone = ix.entries.filter((x) => !p.keep.has(x.id)).map((x) => x.id);
    ix.entries = ix.entries.filter((x) => p.keep.has(x.id));
    try { this.writeIndex(ix); } catch (err) { return false; }
    for (const x of gone) { try { this.b.remove(TEXT_PREFIX + x); } catch (err) { /* ignore */ } }
    return true;
  }

  remove(id) {
    const ix = this.reconcile();
    if (!ix.entries.some((x) => x.id === id)) return false;
    ix.entries = ix.entries.filter((x) => x.id !== id);
    if (ix.last === id) ix.last = null;
    try { this.writeIndex(ix); } catch (e) { return false; }
    try { this.b.remove(TEXT_PREFIX + id); } catch (e) { /* the index no longer names it */ }
    return true;
  }
}
