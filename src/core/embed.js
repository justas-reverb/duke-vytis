// What changes when the game is a page inside somebody else's page.
//
// itch.io runs an HTML game in an iframe, served from its own domain under a subpath.
// Three things that just work in a tab or in the desktop shell work differently there,
// and each fails quietly unless the page says something:
//
//   Keyboard focus. The keys go to whichever frame has focus, and on arrival that is
//   itch's page, not the game -- so the first Space scrolls itch's page and the game
//   looks dead. Clicking the game gives it focus; until then a banner says so. (It is
//   HTML over the canvas, in index.html, because the screens draw nothing about the
//   page they are in.)
//
//   Storage. localStorage in a third-party frame can be refused outright -- Safari's
//   tracking prevention, a browser set to block third-party cookies, some privacy modes
//   -- and the property access itself throws. stats.js and settings.js already catch
//   that and carry on with defaults; what was missing was telling the player that the
//   record they are building will be gone when the page closes.
//
//   Fullscreen. An iframe may only go fullscreen if its parent allows it, and when it
//   does not, requestFullscreen rejects its promise -- an "Uncaught (in promise)" on
//   every press of F. itch.io's own fullscreen button (outside the frame) is the way
//   there, so F does nothing rather than fail.
//
// The desktop shell has none of these problems and none of this shows there.

/** Whether localStorage really keeps anything. Never throws. */
export function storageWorks(get = () => globalThis.localStorage) {
  try {
    const s = get();
    if (!s) return false;
    const k = '__vytis_probe__';
    s.setItem(k, '1');
    const ok = s.getItem(k) === '1';
    s.removeItem(k);
    return ok;
  } catch (e) {
    return false;
  }
}

/**
 * Whether the game's F key can do anything. The shell always can; a page can when its
 * frame allows fullscreen, which is what `fullscreenEnabled` reports (false in an
 * iframe without allowfullscreen). Leaving fullscreen is always allowed.
 */
export function fullscreenAllowed(win = globalThis.window, doc = globalThis.document) {
  if (win && win.gameShell) return true;
  if (!doc) return false;
  if (doc.fullscreenElement || doc.webkitFullscreenElement) return true;
  const enabled = doc.fullscreenEnabled !== undefined ? doc.fullscreenEnabled : doc.webkitFullscreenEnabled;
  return enabled !== false;
}

/**
 * Keep the two banners in index.html true: #focus-hint while the page does not have the
 * keyboard, #saves-off while storage is refused and no run is on.
 *
 * @param opts.inRun     () => boolean, a run is being played (no banners over a climb)
 * @param opts.usingPad  () => boolean, the player is on a pad, which needs no focus
 */
export function watchEmbed({ inRun = () => false, usingPad = () => false,
  win = globalThis.window, doc = globalThis.document, storageOk = storageWorks() } = {}) {
  const el = (id) => (doc && typeof doc.getElementById === 'function' ? doc.getElementById(id) : null);
  const hint = el('focus-hint');
  const saves = el('saves-off');
  const shell = !!(win && win.gameShell);

  const update = () => {
    const focused = doc && typeof doc.hasFocus === 'function' ? doc.hasFocus() : true;
    if (hint) hint.hidden = shell || focused || usingPad();
    if (saves) saves.hidden = storageOk || inRun();
  };
  if (win && win.addEventListener) {
    win.addEventListener('focus', update);
    win.addEventListener('blur', update);
  }
  // Focus can also move without either event reaching this frame (a click on the page
  // around it, in some browsers), and the run starting or ending moves the saves banner;
  // twice a second is cheap and is soon enough for both.
  const timer = setInterval(update, 500);
  update();
  return { storageOk, update, stop: () => clearInterval(timer) };
}
