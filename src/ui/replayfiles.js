// Getting a replay file out of the game and one in: a .dvreplay is exportReplay's text as
// it is (replay.js FILE_EXTENSION), so a file, a download and a paste are the same thing.
//
// Two shells, one shape: save(name, text) and open(), each a Promise of { ok, name, text,
// canceled, error }, never a rejection.
//
//   The desktop build asks the shell (electron/preload.cjs exposes window.replayFiles with
//   exactly these two functions; electron/replayfiles.js shows the system's save and open
//   dialogs and reads and writes the one file the player chose). Nothing else of Node
//   reaches the page, and the page never names a path.
//
//   A browser downloads a Blob and opens a file picker. Dropping a file on the window and
//   pasting the text are the replays screen's (src/ui/replays.js), for both shells.
//
// What comes IN is untrusted: whatever a file holds is handed to importReplay, which refuses
// what it cannot read with a sentence. Here a file is only refused unread when it is bigger
// than any replay can be (REPLAY_MAX_TEXT), so a 2 GB video dropped on the window is never
// read into memory.

import { REPLAY_MAX_TEXT } from '../game/constants.js';
import { FILE_EXTENSION } from '../game/replay.js';

export const TOO_BIG = 'the file is too big to be a replay';
/** Why a browser's file picker did not open: see webFiles' open. */
export const NO_PICKER = 'a browser opens files only from the keyboard or mouse';

/** A file name for a replay: floor, score and the date, safe on every file system. */
export function fileNameFor(entry) {
  const d = new Date(entry && entry.date);
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = Number.isFinite(d.getTime())
    ? `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`
    : 'undated';
  const floor = entry && Number.isFinite(entry.floor) ? entry.floor : 0;
  return `duke-vytis-floor-${floor}-${stamp}${FILE_EXTENSION}`;
}

/** Read a File (a picker's or a drop's) as text, refusing one too big to be a replay. */
export async function readFileText(file) {
  try {
    if (!file) return { ok: false, error: 'no file' };
    if (typeof file.size === 'number' && file.size > REPLAY_MAX_TEXT) return { ok: false, error: TOO_BIG };
    const text = typeof file.text === 'function' ? await file.text()
      : await new Response(file).text();
    return { ok: true, text: String(text), name: String(file.name || '') };
  } catch (e) {
    return { ok: false, error: 'the file could not be read' };
  }
}

/** The desktop shell's bridge, wrapped so a shell that throws or answers oddly is a refusal. */
function shellFiles(bridge) {
  const call = async (fn) => {
    try {
      const r = await fn();
      if (!r || typeof r !== 'object') return { ok: false, error: 'the shell did not answer' };
      return {
        ok: !!r.ok, canceled: !!r.canceled,
        name: typeof r.name === 'string' ? r.name : '',
        text: typeof r.text === 'string' ? r.text : undefined,
        error: typeof r.error === 'string' ? r.error : r.ok ? null : r.canceled ? null : 'the file could not be used',
      };
    } catch (e) {
      return { ok: false, error: 'the file could not be used' };
    }
  };
  return {
    kind: 'desktop',
    save: (name, text) => call(() => bridge.save(name, text)),
    open: () => call(() => bridge.open()),
  };
}

/** A browser's: a download for save, a file picker for open. */
function webFiles(win, doc) {
  return {
    kind: 'web',
    async save(name, text) {
      try {
        const blob = new Blob([text], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = doc.createElement('a');
        a.href = url;
        a.download = name;
        a.style.display = 'none';
        (doc.body || doc.documentElement).appendChild(a);
        a.click();
        a.remove();
        // Revoked a moment later: some browsers start the download after click() returns.
        win.setTimeout(() => URL.revokeObjectURL(url), 2000);
        return { ok: true, name };
      } catch (e) {
        return { ok: false, error: 'the browser would not download the file' };
      }
    },
    open() {
      // A browser shows its file picker only inside a key press or a click (user
      // activation). A gamepad's button is neither: asked from one, the picker does not open
      // and nothing ever answers, so a pad-only player pressing BACK on the replays screen
      // got no picker and no word why. Where the browser says whether a press is in hand
      // (navigator.userActivation), the refusal is said at once instead.
      const nav = (win && win.navigator) || globalThis.navigator;
      const ua = nav && nav.userActivation;
      if (ua && ua.isActive === false) return Promise.resolve({ ok: false, error: NO_PICKER });
      return new Promise((resolve) => {
        let input;
        try {
          input = doc.createElement('input');
          input.type = 'file';
          input.accept = FILE_EXTENSION + ',text/plain';
          input.style.display = 'none';
          (doc.body || doc.documentElement).appendChild(input);
        } catch (e) {
          resolve({ ok: false, error: 'the browser would not open a file picker' });
          return;
        }
        const done = (r) => { try { input.remove(); } catch (e) { /* gone already */ } resolve(r); };
        input.addEventListener('change', async () => {
          const f = input.files && input.files[0];
          done(f ? await readFileText(f) : { ok: false, canceled: true });
        });
        // A picker closed without a choice fires 'cancel' where the browser supports it; where
        // it does not, nothing fires and the promise simply never settles -- the screen does
        // not wait on it.
        input.addEventListener('cancel', () => done({ ok: false, canceled: true }));
        try { input.click(); } catch (e) { done({ ok: false, error: 'the browser would not open a file picker' }); }
      });
    },
  };
}

/** The files for this page: the desktop shell's when it has one, else the browser's. */
export function replayFiles(win = globalThis.window, doc = globalThis.document) {
  const b = win && win.replayFiles;
  if (b && typeof b.save === 'function' && typeof b.open === 'function') return shellFiles(b);
  return webFiles(win, doc);
}
