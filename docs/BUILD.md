# Build and run

How to run the game, what each npm script does, the web package for itch.io, how the
Electron shell serves it without a server, what gets packaged, the launch flags, and why
the installed copy is not the build you just made.
Read this when you are starting the game, packaging it, or wondering why an exe does not
show your change.
See also: [ARCHITECTURE.md](ARCHITECTURE.md) (the code the shell wraps) ·
[TESTING.md](TESTING.md) (the suites and the headless tools) · STATUS.md ·
[../README.md](../README.md).

## Run it

```bash
npm start                 # the desktop shell, fullscreen, unpackaged
npm run dist              # dist/Duke Vytis <version> portable.exe + setup.exe (package.json's version)
npm run dist:dir          # the same build, unpacked into dist/win-unpacked only
node tools/serve.mjs      # the browser build, then http://127.0.0.1:8173/
npm run web               # dist/web/ and dist/duke-vytis-web.zip, for itch.io
```

Both `dist` scripts bake the app icon first. Every script in `package.json`:

| Script | What it runs |
|---|---|
| `npm start` | `electron .` -- the shell over the source tree, no packaging |
| `npm run dist` | `make-icon.mjs`, then `electron-builder --win`: a portable exe and an NSIS installer |
| `npm run dist:dir` | `make-icon.mjs`, then the same build unpacked, no installers |
| `npm run serve` | `node tools/serve.mjs` -- the browser build on 127.0.0.1:8173 (`PORT` overrides it) |
| `npm run web` | `node tools/build-web.mjs` -- the itch.io zip; see [The web package](#the-web-package-for-itchio) |
| `npm run icon` | `node tools/make-icon.mjs` -- writes `build/icon.ico` for the exe and `assets/icon.png` for the window; see [ART-PIPELINE.md](ART-PIPELINE.md) |
| `npm run music` | `node tools/compose-music.mjs` -- rebuilds `tracks.js`; see [AUDIO.md](AUDIO.md) |
| `npm test`, `npm run test:all`, `npm run test:deep` | the suites; see [TESTING.md](TESTING.md) |

## The browser build

In a browser it has to be *served* -- ES modules are blocked over `file://`, and the page
says so if you try: `index.html` replaces its loading line with an explanation rather than
sitting on a black screen. `node tools/serve.mjs` (or `npm run serve`) serves it on
127.0.0.1 only.

`play.bat` launches Chrome (or Edge, when there is no Chrome) in `--app` mode against the
dev server. It predates the desktop build and is kept because it is the fastest way to
see a source change without packaging anything.

## The same page on GitHub Pages: how an iPhone plays

An iPhone cannot install an APK or an exe, and the App Store is out of reach for a test, so
the public repository serves the game itself: GitHub Pages, deployed from its `main` branch,
the root folder, at **https://justas-reverb.github.io/duke-vytis/** (switched on 2026-09-29 at
the user's word). Nothing is built for it -- the repository's root IS a page: `index.html`
imports `src/` by relative paths, which work from the `/duke-vytis/` subpath as they do from
itch.io's (the walk above proves that for the package; the repository holds the same files).
`.nojekyll` at the root keeps Pages from running the files through Jekyll, which skips
underscore names and chokes on anything in the docs that looks like a Liquid tag. A phone's
browser reports a coarse pointer, so the touch keys come up (`touchWanted`) and the game fills
the screen (`renderer.js COVER_MAX`); held upright the page says TURN YOUR PHONE SIDEWAYS
(`#rotate`), since a browser cannot be held to landscape. `index.html`'s
head carries a web app manifest (`manifest.webmanifest`) and Apple's home-screen tags, so the
page saved to a home screen opens as an app of its own, full screen and without the browser's
bars; the desktop build and the Android app ignore them, but both package the files so the
links never 404 (`package.json`'s files, `build-web.mjs PAGE_FILES`). Every export pushed to
`main` redeploys it within a minute or two (the Pages build is GitHub's own, on a public
repository free of Actions minutes).

## The web package for itch.io

`npm run web` (`tools/build-web.mjs`) writes `dist/web/` and `dist/duke-vytis-web.zip`:
`index.html` at the zip root, all of `src/`, and from `assets/` only what the game loads --
the tiles and sprites `bgart.js` and `decorart.js` list, and the samples in `assets/sfx/`
under the names `audio.js` fetches (`SAMPLE_NAMES`, `.ogg` or `.wav`), not the 8.5 MB of
source sheets. `assets/sfx/` is the user's own and gitignored, and the zip is public, so
the build prints which samples went in. The zip is written by the tool itself (deflate
from node's zlib, a fixed timestamp, sorted entries), so the same tree zips to the same
bytes. Its size moves with `src/`: 125 files and about 825 KB zipped when the package was
merged (18da3e6); 138 files, 3,110 KB unpacked and 965 KB zipped at af26c27 with no
samples in the tree, after the menu skin, the replay engine and the burn arrived
(`test-web` prints the current figures on every run).

The build then serves `dist/web` from `/duke/`, answering only paths spelled exactly as
the files are (itch's servers are case-sensitive and this machine's disk is not), walks
every import and asset from `index.html`, and
fails if anything is not 200 from under that subpath -- which is how itch.io serves it,
from a folder of its own domain inside an iframe. `tools/test-web.mjs` does the same on
every `npm test`, and also boots the packaged `main.js` with storage refused, the
keyboard elsewhere and fullscreen forbidden, as a third-party frame can have them. What
the page does about each is in `src/core/embed.js`, with two banners in `index.html`:
storage refused, the game plays on with defaults and says SAVES ARE OFF along the bottom
on every screen but a climb; arriving without the keyboard, CLICK THE GAME TO PLAY sits at
the top until a click hands the canvas the keyboard (not shown to a player on a pad, whose
input needs no focus); fullscreen forbidden, `F` asks for nothing rather than leave a
rejected promise. A frame whose permissions leave out the gamepad makes every
`getGamepads()` throw, so `gamepad.js` asks once and leaves it alone. None of this shows
in the desktop shell. The same zip will also do for any other host that serves static
files, as long as the page is opened at a URL ending in `/` or `/index.html`.

Upload it on itch.io as an HTML project, marked to be played in the browser. The settings
below are advice, reasoned from how the game behaves -- itch.io's form changes, so match
them by what they do rather than by where they sit:

- **Embed in the page, 960 x 540.** 16:9 like the game, and it fits itch's page column.
  It is half the 1920x1080 backing store, so on a display at 100% scaling the embedded
  view is a 2:1 downscale and loses single-pixel detail (exact on a 200% display). The
  game is meant to be seen fullscreen:
- **Fullscreen button: on.** It is the way to fullscreen from inside the frame. The
  game's own `F` does nothing there unless itch's frame allows it (`fullscreenAllowed`).
- **Start on a click, not on page load.** The click is the gesture browsers want before
  they play sound, visitors who only read the page do not download the game or run its
  attract mode, and the game still asks for a second click if the keyboard went
  elsewhere (the banner at the top).
- **Mobile friendly: off** until there are touch controls. Scrollbars and
  SharedArrayBuffer: off; it needs neither.

## The desktop build

`electron/` is the whole of it. The game does not know it is there: `src/` is unchanged
browser code, and the seams are two optional bridges, `window.gameShell` that
`settings.js` uses and `window.replayFiles` that `ui/replayfiles.js` uses (below), each
only if it exists.

**It does not start a server.** The obvious way to ship a browser game as an app is to
run the dev server inside the process and point the window at localhost -- which works,
and which also means a packaged game opens a listening socket, gambles on a port, and
trips whatever firewall prompt Windows feels like showing. Instead
[`electron/main.js`](../electron/main.js) registers a privileged `vytis://` scheme:
`standard` makes it resolve like http, `secure` puts the page in a secure context and
`supportFetchAPI` keeps the optional sample loader working. ES modules and `fetch` both
work, with no socket. That is how the desktop build sidesteps the `file://` block above.

Files are served through `fs.readFile` rather than handed to `net.fetch` as a file URL,
because in a packaged build every path is inside `app.asar` -- fs sees through the
archive and a file URL does not.

The window opens fullscreen with no menu bar, holds a single-instance lock (a second
launch focuses the first rather than competing for the same save), and has Chromium's
background throttling switched off, so an alt-tabbed game runs at the rates the render
governor chooses ([ARCHITECTURE.md](ARCHITECTURE.md#drawing-is-governed)) rather than
the ones Chromium would. The governor caps an unfocused window's run, except a run being
played on a pad: a pad keeps working in a window without the keyboard, so a run resumed
with Start while the window sits on another monitor would otherwise have been a slide
show (`applyRenderCap` in `main.js`).

**Two of the game's controls could not work unchanged.** `F` asks for HTML fullscreen,
which inside an already-fullscreen window is a no-op that still leaves
`document.fullscreenElement` null -- so the menu would have read FULLSCREEN: OFF while
filling a 4K display. And `Esc` calls `window.close()`, which Chromium refuses for a
window no script opened. Both now go through the preload bridge when it is present and
fall back to the standard API when it is not. `isFullscreen()` reads a CACHED flag the
main process pushes, never a synchronous IPC call: `drawOptions()` asks every frame, and
`sendSync` blocks the renderer, which in a game means blocking the frame.

**Replay files go through the system's own dialogs.** A replay is exported as a
`.dvreplay` file (the text `exportReplay` makes, ASCII) and imported from one, on the
REPLAYS screen. In a browser that is a download (a Blob) and a file picker; in the desktop
build a download has nowhere sensible to go, so the preload exposes a second bridge,
`window.replayFiles`, with exactly two functions -- `save(name, text)` and `open()`, each a
promise of a plain `{ ok, name, text, canceled, error }` -- and nothing else of Node or
Electron reaches the page (`contextIsolation`, `sandbox` and no `nodeIntegration` stay as
they are). They are `ipcRenderer.invoke` calls to two handlers in
[`electron/replayfiles.js`](../electron/replayfiles.js), registered by `main.js`: `replay:save`
shows the save dialog (starting in Documents, the name cut to a plain file name ending
`.dvreplay`) and writes the text to the file the player chose; `replay:open` shows the open
dialog, measures the chosen file first and refuses one bigger than any replay can be
(`REPLAY_MAX_TEXT`), then hands its text back. The page never names a path and only gets a
file's name back to show. Both handlers answer only the game's own window, and refuse a
text that is not a string or is longer than a replay can be. What a file holds is untrusted
either way: the page gives it to `importReplay`, which refuses what it cannot read with a
sentence the screen shows. Dropping a file on the window and pasting the text (Ctrl+V)
import too, in both builds, without either bridge. `tools/test-replayui.mjs` loads the
preload with a fake `electron` and drives the handlers with fake dialogs; nothing here has
been run inside a packaged build yet (`npx electron electron/smoke.js` does not open a
dialog).

## Launch flags, and starting silent

| | |
|---|---|
| `?mute` on the URL | opens the page muted, in the browser build or the shell |
| `--mute` on the exe, or `npm start -- --mute` | loads the page with `?mute` |
| `localStorage` key `dukevytis.devmute` = `'1'` | also starts muted -- and is STICKY |
| `M` in game | mutes for the session only |
| `--smoke` on the exe | boots the build offscreen, proves it drew, exits with a status |
| `F12` | opens devtools in the desktop shell |

The `dukevytis.devmute` key exists because some embedders drop the query string on
navigation -- and it therefore outlives the launch that set it. The game never sets it
itself. If a build is silent for no visible reason, run
`localStorage.removeItem('dukevytis.devmute')` in the page's console.

**The public repository** is a copy, not this one: `node tools/export-public.mjs <dir>` (kept in
the private working copy only) writes a commit's tracked files (`git archive`, never the working folder) into a checkout of it, less the
working notes (`CLAUDE.md`, `.claude/`, `docs/STATUS.md`, `HANDOFF.md`, the local-model batch
scripts) and the pictures whose origin is not recorded (`Companions/`, the `*-reference.webp`
boards). It writes nothing if any file names the classic climber that inspired the game, or the
author's machine or accounts, or if a Markdown link reaches a file that is not published (a link
into a private one is written as its words). `--check` runs the checks alone. The installers go on
the public repository's Releases page, not into its files.

**Every save is a `dukevytis.` key** (`src/game/savekeys.js`): the settings, the stats, the
replay store's index and texts, and that mute. They carried the project's working title until
2026-09-29; a save made before then is moved under the game's own name at the first load after,
found by its shape rather than by the old prefix (`tools/test-savekeys.mjs`).

`F12` is the one key the shell keeps for itself. The shell removes the application menu,
so `Alt` opens nothing and `Ctrl+R` cannot reload a run out from under the player, but
it keeps that one way into devtools, because a packaged game with no console is very hard
to diagnose a report against.

## Proving it works: `--smoke`

`"Duke Vytis.exe" --smoke` boots the real packaged build with the window rendering
offscreen and audio muted at the Chromium level, lets the menu's live demo run for six
seconds, and fails if the page did not load, the boot overlay is still up, the bridge is
not exposed, anything logged a console error, or no frame was painted. It lists every file
that 404ed, writes the last frame to a PNG (`smoke.png` unless given another name) and
exits with a status. "It builds" and "it runs" are different claims: a perfectly
valid exe will open a black window if one module 404ed behind a custom scheme, and the
only honest way to tell is to start it and look. The unpackaged equivalent,
`npx electron electron/smoke.js smoke.png`, is with the other headless tools in
[TESTING.md](TESTING.md).

## The installer, `dist/`, and the shortcut

`npm run dist` writes two things to `dist/`: `Duke Vytis <version> portable.exe`, one file you
can move and double-click, and `Duke Vytis <version> setup.exe`, a per-user installer that
asks for a directory and creates the Desktop and Start-menu shortcuts (`/S` runs it
silently).

The **Duke Vytis** shortcut on the Desktop and in the Start Menu does not run either of
those, and it is not `play.bat` either: it runs the INSTALLED copy in
`%LOCALAPPDATA%\Programs\Duke Vytis`, which changes only when `setup.exe` is re-run --
`npm run dist` on its own does not touch it.

**Rebuild before judging an exe.** `dist/` and the installed copy only change when
`npm run dist` is run and `setup.exe` re-run with the game closed; the shortcut launches
the INSTALLED copy. Which build is installed is recorded in STATUS.md. The
files themselves say when they were made: on 2026-09-28 the `app.asar` in `dist/win-unpacked`
was dated 2026-09-24 01:24 and the installed copy's 01:26, both 2,973,096 bytes. The
branch's reflog puts that between the callouts' merge at the tower's heights (03163e0,
01:21) and the new lament's (b948c72, 01:30): after the narrower packing below, the sound
effects and the gamepad, and before the lament, the menu skin, the replay engine, the
burned fall, the speed trail and the steady music. So the installed game is behind
af26c27 until the next `npm run dist` and install.

## What the desktop build packs

`build.files` in `package.json` takes `index.html`, `electron/`, `src/`, and from
`assets/` only what the game can load at runtime (14ac461): `assets/icon.png` (the window
icon), `assets/sfx/*.{ogg,wav}` (the sample overrides, in the two formats `loadSamples`
tries, fetched on the first key or click), and the artist's drop-ins
`assets/backgrounds/**/*.png` and `assets/decor/**/*.png`, which `bgart.js` and
`decorart.js` list once an importer has taken them (both lists are empty today, so every
tile and sprite is painted in code). Everything else it draws comes from modules in
`src/render/`.

It used to take the whole of `assets/`: the asar was 39 files and 445 KB when the shell
was built and had grown to 75 files and 10.5 MB by 48589d1, the growth nearly all source
material the importers turn into code and the game never reads -- three versions of the
Duke's sheet, the shield source, the old platform sheet, the user's backgrounds board and
environment sheets, 8.5 MB of it. The build of 2026-09-24 01:24, made with the
narrower list, has a 2,973,096-byte `app.asar`. Narrow it further at your peril: without
the two drop-in folders the artist's tiles and sprites would 404 in the packaged build the
day they arrive. The web package makes the same cut (`runtimeAssets` in
`tools/build-web.mjs`). Everything else in the exe is Chromium: the portable exe of that
build is 100,926,306 bytes and the installer 101,199,262.

## The Android build: an APK for testing on a phone

```bash
node tools/build-apk.mjs        # dist/Duke Vytis <version>.apk, about 1.2 MB, debug-signed
node tools/android-smoke.mjs    # installs it on a headless emulator and plays it by touch
```

It is the web build (`buildWeb`, the same files as the itch.io zip) in a WebView: `android/`
holds the manifest and ONE Java class, `MainActivity`. The WebView serves the game from
`https://appassets.androidplatform.net/` out of the APK's `assets/www/` -- ES modules will not
load from `file://` -- and answers every other address with a 404, so the game never touches
the network. It loads the page with `?touch`, which puts up the on-screen keys
(`src/ui/touch.js`, in [ARCHITECTURE.md](ARCHITECTURE.md) *Input*), gives the page the same
`window.gameShell` the desktop's preload gives it (quit, fullscreen), turns the phone's Back
into Escape, and on leaving the app sends the page `app:background` (a run pauses, the sound
stops) and on return `app:foreground`. Held sideways, fullscreen, the screen kept on, and
edge to edge: the window runs under the camera's cut-out (`LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS`,
`SHORT_EDGES` before Android 11) -- padded round it, it left a black band down the camera's
side -- the game's wings fill the width past 16:9 ([ARCHITECTURE.md](ARCHITECTURE.md) *It has
to fill a screen*), and the on-screen keys keep clear of the camera's hole, which the Activity
hands the page (`gameShell.cutouts()`, and an `app:cutouts` event when the phone turns over;
`viewport-fit=cover` in `index.html` for a browser's insets). From the first moment the app shows
a loading screen of its own over the page -- the game's shield and a spinner (`makeLoading`) --
until the page has drawn its first frames and calls `gameShell.ready()`, and the page holds its
music until then: the app used to come up to a long black screen with the music already going.
Package `lt.dukevytis.tower`, Android 7 (API 24) and up.

**Built with the SDK's own tools, no Gradle**: aapt2 (the manifest and the launcher icon, made
from `assets/icon.png` as the desktop icon is), javac against the platform's `android.jar`, d8,
zipalign, apksigner. The app is one class with no library to resolve, and Gradle's Android
plugin wanted a few hundred megabytes fetched before its first build. `build-apk.mjs` finds the
SDK (`ANDROID_HOME`, else the usual folders) and a JDK 17+ (`JAVA_HOME`, else the usual
folders), and before it calls the APK built it verifies the signature, reads the manifest back
(`aapt2 dump badging`), and compares every file of the web build with the APK's copy, byte for
byte. It is signed with the SDK's DEBUG key (`~/.android/debug.keystore`, the public password
every debug build uses): a test build to sideload, not one for a store.

**Putting it on a phone**: copy the APK to the phone and open it (Android asks once to allow
installs from the app that opened it -- the Files app, a browser), or `adb install -r` it with
USB debugging on. A newer build installs over the last; the saves stay.

**What is not there yet**: replay files -- export and import on the REPLAYS screen are the
browser's download and file picker, which a WebView without a download handler and a file
chooser does nothing with (the replays themselves, the instant replay and the races work);
and a phone's own frame rate, which nobody has measured: the emulator draws in software. A
phone draws at 60 by default (`Settings.phoneDefaults`), paced on whole display frames.

## Where the bodies are buried

| | |
|---|---|
| **An APK whose game Android could not find** | The first `build-apk` handed aapt2 the game's files with `-A assets`, and on Windows aapt2 stored every path with a BACKSLASH -- `assets/www\index.html` -- which Android's asset manager never finds: the WebView would have shown a blank page on every phone, from an APK that installed, launched and verified. The build's own check (every file of the web build, looked up in the finished APK by its `/` name) failed on all 147. aapt2 now links only the manifest and resources, and the code and the game are added by `zipWith` under `/` names, aapt2's own entries copied byte for byte. Check a package by reading it back the way its consumer will, not by the tool's exit code. |
| **`npm run dist` while the game is running** | Produces a 298 KB `setup.exe` instead of a full one (about 101 MB since the packing was narrowed; 109 MB before): NSIS cannot replace files the installed app holds open. It throws a stack trace, and `npm run dist \| tail` reports **exit 0**, because a pipeline's exit code is the last command's. Close the app first, and check the artefact SIZE rather than the exit code. |
| **A proof that passed on a case-insensitive disk** | The web package is proved by serving it from `/duke/` and walking every import, but the first prover's server read files off this machine's disk, which answers `Main.js` for `main.js`. itch.io's servers are case-sensitive, so an import spelled in another case than its file would have passed here and 404ed there. The prover now answers only paths spelled exactly as the files are listed (f7097ea), and `test-web` builds a package with such an import and requires the proof to fail. A check run on this machine inherits its disk's forgiveness; make the server as strict as the host. |
| **A public zip that shipped the user's own folder** | `assets/sfx/` is the user's and gitignored, and the first `build-web` copied every audio file in it into a zip meant for a public page -- whatever was lying there, under any name. The game only ever fetches `SAMPLE_NAMES` in `.ogg` or `.wav`, so that is all it ships now, and the build prints which samples went in (f7097ea). `test-web` plants a sample under a name the game never asks for, one in a format the loader never tries, a README and a source sheet, and requires all four left out. Ship what the code asks for, read from the code, never a folder. |
