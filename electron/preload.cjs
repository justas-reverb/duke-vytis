// The one thing the game is allowed to know about the shell.
//
// CommonJS, and .cjs rather than .js, because package.json declares "type": "module"
// and a sandboxed preload is not an ES module.
//
// Two of the game's controls cannot work inside an application window the way they do
// in a tab. F asks for HTML fullscreen, which inside an already-fullscreen window is a
// no-op that still leaves settings.isFullscreen() reporting false -- so the menu would
// read FULLSCREEN: OFF while filling the screen. And Escape calls window.close(), which
// Chromium refuses for a window no script opened.
//
// isFullscreen() is a plain getter over a CACHED flag, never a synchronous IPC call:
// drawOptions() asks every frame, and sendSync blocks the renderer thread, which in a
// game means blocking the frame.

const { contextBridge, ipcRenderer } = require('electron');

let fullscreen = false;
ipcRenderer.on('shell:fullscreen', (_e, value) => { fullscreen = !!value; });

contextBridge.exposeInMainWorld('gameShell', {
  isFullscreen: () => fullscreen,
  toggleFullscreen: () => ipcRenderer.send('shell:toggle-fullscreen'),
  quit: () => ipcRenderer.send('shell:quit'),
});

// A replay file out and in (src/ui/replayfiles.js): the system's save and open dialogs,
// shown by the main process (electron/replayfiles.js). Two functions and nothing else --
// each takes plain strings, answers a plain object, and cannot name a path: the player
// picks the file in the dialog, and the page only ever sees the file's name and its text.
contextBridge.exposeInMainWorld('replayFiles', {
  save: (name, text) => ipcRenderer.invoke('replay:save', String(name), String(text)),
  open: () => ipcRenderer.invoke('replay:open'),
});
