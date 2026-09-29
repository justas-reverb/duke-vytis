// The desktop shell's half of a replay file: the system's save and open dialogs, and the one
// file the player chose in them, read or written. The page asks through the two functions the
// preload exposes (window.replayFiles.save / open); it never names a path and never gets one
// back, only the file's name to show.
//
// The page is not trusted here any more than a file is: a request must come from the game's
// own window, the text must be a string no longer than any replay (REPLAY_MAX_TEXT), and the
// name is cut to a plain file name with the replay extension. A file picked to open is
// measured before it is read, so a 2 GB video chosen by mistake is refused, not loaded. What
// the file holds goes back to the page as text, where importReplay decides what it is.

import { REPLAY_MAX_TEXT } from '../src/game/constants.js';

export const EXT = 'dvreplay';
const FILTERS = [{ name: 'Duke Vytis replay', extensions: [EXT] }, { name: 'All files', extensions: ['*'] }];

/** A name the page offered, made a safe file name ending in .dvreplay. */
export function safeName(name) {
  let n = String(name == null ? '' : name).replace(/[\\/:*?"<>|\x00-\x1f]/g, '').replace(/^\.+/, '').trim();
  n = n.slice(0, 120);
  if (!n) n = 'replay';
  if (!n.toLowerCase().endsWith('.' + EXT)) n += '.' + EXT;
  return n;
}

/**
 * Register the two handlers. `deps`: { ipcMain, dialog, fs (fs/promises), path, app,
 * getWindow() }, so a test can hand in fakes.
 */
export function registerReplayFiles({ ipcMain, dialog, fs, path, app, getWindow }) {
  const ours = (e) => {
    const w = getWindow();
    return !!(w && !w.isDestroyed() && e && e.sender === w.webContents);
  };

  ipcMain.handle('replay:save', async (e, name, text) => {
    if (!ours(e)) return { ok: false, error: 'refused' };
    if (typeof text !== 'string' || !text.length || text.length > REPLAY_MAX_TEXT) {
      return { ok: false, error: 'that is not a replay to save' };
    }
    const file = safeName(name);
    let dir = '';
    try { dir = app.getPath('documents'); } catch (err) { dir = ''; }
    try {
      const r = await dialog.showSaveDialog(getWindow(), {
        title: 'Export replay', defaultPath: dir ? path.join(dir, file) : file, filters: FILTERS,
      });
      if (!r || r.canceled || !r.filePath) return { ok: false, canceled: true };
      await fs.writeFile(r.filePath, text, 'utf8');
      return { ok: true, name: path.basename(r.filePath) };
    } catch (err) {
      return { ok: false, error: 'the file could not be written' };
    }
  });

  ipcMain.handle('replay:open', async (e) => {
    if (!ours(e)) return { ok: false, error: 'refused' };
    try {
      const r = await dialog.showOpenDialog(getWindow(), {
        title: 'Import replay', properties: ['openFile'], filters: FILTERS,
      });
      if (!r || r.canceled || !r.filePaths || !r.filePaths.length) return { ok: false, canceled: true };
      const p = r.filePaths[0];
      const st = await fs.stat(p);
      if (!st.isFile()) return { ok: false, error: 'that is not a file' };
      if (st.size > REPLAY_MAX_TEXT) return { ok: false, error: 'the file is too big to be a replay' };
      const text = await fs.readFile(p, 'utf8');
      return { ok: true, text, name: path.basename(p) };
    } catch (err) {
      return { ok: false, error: 'the file could not be read' };
    }
  });
}
