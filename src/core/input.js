// Keyboard with jump buffering and coyote time.
//
// At 160 Hz a player's keypress lands inside a 6 ms window. Without buffering, a jump
// pressed a few milliseconds before touching down is silently eaten, and the game feels
// like it is ignoring you. Both values are in seconds and deliberately generous.

export const JUMP_BUFFER = 0.12;
export const COYOTE = 0.09;

// The Pad* names are not keys any keyboard sends: they are what gamepad.js presses (see
// padDown), so a pad is one more key in the same lists rather than a second input path.
const LEFT  = ['ArrowLeft', 'KeyA', 'PadLeft'];
const RIGHT = ['ArrowRight', 'KeyD', 'PadRight'];
const JUMP  = ['Space', 'ArrowUp', 'KeyW', 'KeyZ', 'PadA'];

export class Input {
  constructor(target = window) {
    this.down = new Set();
    this.jumpBuffer = 0;
    // Whether the press in the buffer has already been through a PLAYING step (step() below)
    // -- i.e. it belongs to a run that was on when it was made. See dropStaleJump.
    this.jumpWaited = false;
    this.jumpHeld = false;
    this.anyKeyAt = 0;
    this._pressedThisFrame = new Set();
    // 'keys' or 'pad', whichever was touched last, for screens that want to show the
    // right button names. gamepad.js sets 'pad'; nothing in the simulation reads it.
    this.lastDevice = 'keys';

    target.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.lastDevice = 'keys';
      this.down.add(e.code);
      this._pressedThisFrame.add(e.code);
      this.anyKeyAt = performance.now();
      if (JUMP.includes(e.code)) {
        this.jumpBuffer = JUMP_BUFFER;
        this.jumpWaited = false;
        this.jumpHeld = true;
      }
      // Space and arrows scroll the page; the game owns them. ArrowDown too, which only
      // the menus use: inside itch.io's iframe an unhandled one scrolls the page AROUND
      // the game every time the options cursor moves.
      if (JUMP.includes(e.code) || LEFT.includes(e.code) || RIGHT.includes(e.code)
          || e.code === 'ArrowDown') {
        e.preventDefault();
      }
    });

    target.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      if (JUMP.includes(e.code)) this.jumpHeld = false;
    });

    target.addEventListener('blur', () => { this.down.clear(); this.jumpHeld = false; });
  }

  get axis() {
    let a = 0;
    for (const k of LEFT)  if (this.down.has(k)) { a -= 1; break; }
    for (const k of RIGHT) if (this.down.has(k)) { a += 1; break; }
    return a;
  }

  consumeJump() {
    if (this.jumpBuffer > 0) { this.jumpBuffer = 0; return true; }
    return false;
  }

  /**
   * A gamepad control going down, named like a key: 'PadLeft', 'PadRight', 'PadA'.
   *
   * This is the keydown handler's own work, so a pad lands in exactly the state a key
   * leaves -- the same `down` set behind `axis`, the same jump buffer refilled on a press
   * -- and whatever reads the input, a replay recording included, cannot tell the two
   * apart. gamepad.js calls it every frame a direction is held (so a blur that cleared
   * `down` does not strand a held stick), hence the early return: a control already
   * down is not pressed again, as `e.repeat` keeps a held key from being. The jump is
   * only ever sent on the button's press, so a held A never refills the buffer.
   */
  padDown(code) {
    if (this.down.has(code)) return;
    this.down.add(code);
    this._pressedThisFrame.add(code);
    if (JUMP.includes(code)) {
      this.jumpBuffer = JUMP_BUFFER;
      this.jumpWaited = false;
      this.jumpHeld = true;
    }
  }

  /** The matching release; the keyup handler's work. */
  padUp(code) {
    if (!this.down.delete(code)) return;
    if (JUMP.includes(code)) this.jumpHeld = false;
  }

  pressed(code) { return this._pressedThisFrame.has(code); }

  step(dt) {
    if (this.jumpBuffer > 0) this.jumpWaited = true;
    if (this.jumpBuffer > 0) this.jumpBuffer -= dt;
  }

  /**
   * A new run is starting (Game.newRun): drop a press that was made during the LAST run and
   * is still waiting in the buffer. Only this step counts the buffer down, and only PLAYING
   * steps call it, so a press left waiting when the run ended -- the fire took him, or he
   * quit from the pause -- would sit frozen through the fall, the scoreboard and the menu and
   * make him jump on the next run's first step.
   *
   * That could not happen while Player.step took a press every step: a press in the air with
   * nothing to spend was taken and dropped in the step after it came. Since a press waits for
   * the landing (2026-09-28), one made in the last 0.12 s before the fire took him carried
   * into the next run started with Enter, the pad's Start or from the menu -- measured: a tap
   * 1, 5 or 20 steps before the catch jumped on the next run's first step every time, the
   * build before never. A press made AFTER the last PLAYING step (the SPACE that starts the
   * run from the scoreboard, a jump key on the pause screen) has not waited and is kept, as
   * it always was: SPACE on the scoreboard still starts the run with a jump.
   */
  dropStaleJump() {
    if (this.jumpWaited) this.jumpBuffer = 0;
  }

  endFrame() { this._pressedThisFrame.clear(); }
}
