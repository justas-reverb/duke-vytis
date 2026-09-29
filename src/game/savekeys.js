// Where the game keeps what it saves: localStorage keys under ONE prefix -- the settings, the
// stats, the replay store's index and texts, the developer's mute.
//
// The keys carried the project's working title until 2026-09-29, when the game went public
// under its own name. A save made before then is found by its SHAPE, not by that prefix -- the
// old name is written nowhere in the game -- and moved under this one, once, at load
// (adoptEarlierSaves, which main.js calls before anything reads a key). A player's records,
// awards, replays and settings come through the rename; nothing else on the page is touched.

export const PREFIX = 'dukevytis';

/** The key a save is kept under: key('settings.v2') is 'dukevytis.settings.v2'. */
export const key = (name) => `${PREFIX}.${name}`;

// Every name a prefix is followed by, and how an earlier prefix is known for this game's: its
// settings blob holds fields no other game's would all hold (settings.js DEFAULTS), or its
// stats blob this game's records (stats.js).
const NAMES = /^([a-z][a-z0-9_-]*)\.(settings\.v[12]|stats\.v1|replays\.v1|replay\.v1\..+|devmute)$/;
const SETTINGS_FIELDS = ['jumpSpeed', 'guideSeen', 'companions', 'particles', 'scaleMode', 'music'];
const STATS_FIELDS = ['totalRuns', 'bestFloor', 'bestScore', 'bestCombo'];

/** Whether `p.<name>` holds a JSON object with at least `need` of `fields`. */
function shaped(store, name, fields, need) {
  try {
    const v = JSON.parse(store.getItem(name));
    return !!v && typeof v === 'object' && fields.filter((f) => f in v).length >= need;
  } catch (e) { return false; }
}

/**
 * Move the saves of an earlier prefix under PREFIX. Returns how many keys moved; 0 when this
 * prefix already has saves of its own (a later load), when there is nothing of this game's
 * under another prefix, and when the store is blocked or throws. A key already under PREFIX is
 * never overwritten. Each key is written under its new name and then removed from its old one,
 * so a store near its quota is never asked to hold the saves twice; the replay store's index
 * goes last, after every replay it lists.
 *
 * The page's store is looked up INSIDE the try: where a browser refuses storage (a game in
 * another site's frame), merely reading `localStorage` throws, and as a default parameter that
 * read ran before the try and stopped the game from booting (tools/test-web.mjs caught it).
 */
export function adoptEarlierSaves(store) {
  try {
    if (store === undefined) store = globalThis.localStorage;
    if (!store || typeof store.key !== 'function') return 0;
    for (const n of ['settings.v2', 'stats.v1', 'replays.v1']) if (store.getItem(key(n)) !== null) return 0;
    const byPrefix = new Map();
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      const m = k && NAMES.exec(k);
      if (!m || m[1] === PREFIX) continue;
      if (!byPrefix.has(m[1])) byPrefix.set(m[1], []);
      byPrefix.get(m[1]).push(k);
    }
    for (const [p, keys] of byPrefix) {
      const ours = shaped(store, `${p}.settings.v2`, SETTINGS_FIELDS, 3)
        || shaped(store, `${p}.settings.v1`, SETTINGS_FIELDS, 3)
        || shaped(store, `${p}.stats.v1`, STATS_FIELDS, 3);
      if (!ours) continue;
      const last = (k) => (k.endsWith('.replays.v1') ? 1 : 0);
      keys.sort((a, b) => last(a) - last(b));
      let moved = 0;
      for (const k of keys) {
        const to = PREFIX + k.slice(p.length);
        if (store.getItem(to) === null) store.setItem(to, store.getItem(k));
        store.removeItem(k);
        moved++;
      }
      return moved;
    }
  } catch (e) { /* a blocked or full store: the game starts fresh, as it would have */ }
  return 0;
}
