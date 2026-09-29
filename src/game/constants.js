// The numbers the whole game agrees on.
//
// Resolution is the one to read first, and it is explained at PX below rather than here,
// because it used to be explained in four places that then disagreed with each other:
// this header, renderer.js, index.html and play.bat all described a 480x270 backing
// store upscaled 8x at 4K, which stopped being true the day PX became 2 and again at 4.
//
// A number here that the simulation's step reads is part of every saved replay: the replay
// fingerprint (src/game/replay.js) hashes it, and a build with it changed refuses the replays
// made before. A number only the renderer, the HUD or a screen reads must be listed in
// replay.js DRAWN_ONLY, or a tweak to a fade or a trail's alpha would refuse them too, with
// nothing a replay plays changed -- which is what every render number merged in here did
// until the fingerprint was made to read only the step's. tools/test-replay.mjs 4a reads who
// imports what and fails on a number in the wrong place, or in no place.

export const VW = 480;
export const VH = 270;

// --- render resolution ------------------------------------------------------
//
// PX is how many SCREEN pixels there are per world unit. Everything above and in every
// other file is a WORLD unit: the physics, the reachability proof, the generator, the
// bot's tuning and the nine hundred towers that were searched to pick the demo seeds
// all speak in these. None of that may move.
//
// What moves is how finely the world is drawn. At PX=1 the backing store is 480x270 and
// a character is 16x28 actual pixels, which is the 8-bit look -- not because 480x270 is
// low (a SNES was 256x224 and a Mega Drive 320x224, both smaller) but because there are
// so few pixels ON each thing. At PX=4 the backing store is 1920x1080, every sprite gets
// four times the pixels to be drawn with, and the game occupies exactly the same screen
// space as before.
//
// 1920x1080 still upscales by whole numbers where it matters: 2x to 3840x2160 and 1x to
// 1920x1080, so the integer-blit property that makes 4K cheap survives.
export const PX = 4;
export const SW = VW * PX;
export const SH = VH * PX;

export const WALL_W = 16;

// The arena is no longer a fixed box. A run starts in a cramped shaft and the walls
// move outward as the player builds speed and combos, with the camera zooming out to
// match so the arena always fills the screen width.
//
// ARENA_HALF_MIN is chosen so the starting zoom is exactly 2.0: (2*104 + 2*16) = 240,
// and 480/240 = 2. Integer zoom at both ends of the range keeps the pixel grid clean
// where the game spends most of its time.
export const CX = VW / 2;
export const ARENA_HALF_MIN = 104;      // 208 px wide  -> zoom 2.0
export const ARENA_HALF_MAX = 224;      // 448 px wide  -> zoom 1.0
export const ARENA_OPEN_RATE = 0.55;    // how fast the walls chase their target

// Absolute outer limits. Nothing may ever be generated outside these.
export const PLAY_L = CX - ARENA_HALF_MAX;
export const PLAY_R = CX + ARENA_HALF_MAX;

export function arenaBounds(half) {
  return { l: CX - half, r: CX + half };
}

export const FLOOR_H = 30;
export const PLAT_THICK = 7;

export const PLAYER_W = 16;
export const PLAYER_H = 22;

// --- painting ahead ---------------------------------------------------------
//
// The scoreboard in the style of the zone a run ends in (render/gameoverskin.js) is 60 to
// 100 ms of painting per zone in Chromium. It was painted a piece a frame WHILE HE FELL --
// up to 22-46 ms a piece, at 160 Hz where a frame is 6.25 ms -- so the fall dropped frames.
// It is painted ahead now, in slices that stop at a deadline (render/slices.js), and never in
// the fall or on the board: these are the budgets.
//
// A painter only stops at its next check, so a frame's warm-up ends one slice PAST its
// deadline. The deadline was the budget itself, and so half the frames that painted went
// over the budget that was stated: 0.57 ms at p99 against 0.5, and the test let it be 0.5
// and a whole 0.5 ms slice more. The deadline is the budget less BOARD_SLICE_MS now, the
// room for that last slice, so a frame's warm-up ends inside its budget.
export const BOARD_WARM_MS = 0.5;  // ms of a frame the painting ahead may take in a run (and
                                   // paused): the zone's board, then the next zone's. 8% of
                                   // the 6.25 ms frame at 160 Hz. typical 0.5
export const BOARD_IDLE_MS = 2;    // ms of a frame on the menus, which draw at 60 Hz
                                   // (main.js applyRenderCap): 12% of their 16.7 ms frame.
                                   // typical 2
export const BOARD_SLICE_MS = 0.2; // ms kept back from each budget for the slice that ends past
                                   // the deadline. A slice is 0.003 ms at the median and 0.04
                                   // at p99.9, the longest 0.15 to 0.34 headless (the fastest
                                   // of three; tools/test-boardwarm.mjs). typical 0.2
// The impact's words (SPLAT or OOF, the verdict, the floor, SPACE) fade in over this, each
// word whole, keyline and letters together (ui/screens.js drawFallWords). It was a literal
// there; the fade then was the letters' alone, over a keyline up from the first frame.
export const IMPACT_FADE = 0.35;   // seconds from nothing to the word fully up. typical 0.35

// --- motion -----------------------------------------------------------------
//
// Tuned for reaction, not float. Gravity and the jump impulses were scaled together by
// k and sqrt(k) respectively, which leaves every jump HEIGHT exactly where it was --
// a standing jump still clears two floors, a full-speed one still clears nine -- while
// cutting the time spent in the air by about a third. Hang time is what made it feel
// slow; height was never the problem.
//
//   before: min jump 0.86 s aloft, max jump 1.74 s
//   after:  min jump 0.55 s aloft, max jump 1.13 s
export const GRAVITY = 1680;

export const VX_MAX_COLD = 190;   // top speed with no momentum built
export const VX_MAX_HOT  = 430;   // top speed at full momentum
export const ACCEL_GROUND = 1400; // snappier turns; a slow turn is a slow game
export const ACCEL_AIR    = 760;
export const FRICTION     = 1600;
export const TERMINAL     = 1400; // scaled with gravity, or falls feel weightless

// Jump impulse scales with how fast you are already moving. This is the whole game:
// standing still gets you two floors, a full-speed run gets you nine.
export const JUMP_V0_MIN = 465;
export const JUMP_V0_MAX = 899;
export const JUMP_MOMENTUM_BONUS = 46;
export const JUMP_CUT = 0.45;     // releasing jump early trims upward velocity

// Air jumps are a reward, not a default. They unlock only while the speed meter is
// pinned at maximum, which makes them something you earn inside a fast run rather than
// a get-out-of-jail button available from a standing start.
export const AIR_JUMPS = 1;       // the double jump, and only that
export const AIR_JUMPS_TRIPLE = 2;
export const TRIPLE_COMBO_FLOORS = 250;   // a combo this long earns the third jump
export const AIR_JUMP_SCALE = 0.82;
export const AIR_JUMP_UNLOCK = 0.98;
// ASCENSION. Beating ZENITH -- reaching the top of a lap of the tower, CYCLE_FLOORS, where
// GLORY is called -- makes every jump he makes a tenth higher and his clock a tenth quicker,
// and beating it again does both again: x1.1 at floor 2300, x1.21 at 4600, where it stops
// (ASCENT_LAPS). It was x2 height and x1.25 clock a lap ("if we beat zenith he should get a
// 2x bounce and speed boost", 2026-09-28), and on the title screen that read as a bug: "the
// bot in the background seems to be going at supersonic and not bound by the rules of the
// game ... can we have a 1.10x speed increase instead of literally doubling it?" (2026-09-29).
// Measured on the attract demo of the day, its climb went from about 1,100 floors a minute
// below 2300 to 2,800 past it -- 24,000 floors in ten minutes -- as every jump cleared twice
// the floors at a quicker clock and the air jumps it no longer needed fell from 108 a minute
// to 29. At a tenth a lap the boost is felt and the game is still the game. The bounce
// multiplies the jump's impulse by the root of ASCENT_BOUNCE, so it is the HEIGHT that goes
// x1.1; the speed multiplies his clock, JUMP SPEED's Player.rate, so everything he does is
// that much quicker and the camera, the companions and the trail follow it as they follow
// JUMP SPEED. The tower's reach proof is untouched -- it is made for the weakest jump there
// is, and a stronger one reaches more. All three are in the replay's fingerprint, so a
// replay recorded before the change is refused as a run and still raced as a ghost.
export const ASCENT_BOUNCE = 1.1;   // jump HEIGHT per lap beaten [x; typical 1.1; the impulse goes by its root]
export const ASCENT_SPEED = 1.1;    // his clock per lap beaten [x JUMP SPEED; typical 1.1]
export const ASCENT_LAPS = 2;       // laps that count [levels; 2: x1.21 of both from floor 4600]

// The attract demo's zone change: drawn, never simulated (replay.js DRAWN_ONLY lists it).
// The demo holds its zone to the arrival and then dissolves into the next over
// DEMO_DISSOLVE (Renderer.zoneFade).
export const DEMO_DISSOLVE = 1.2;   // [s; the bot climbs about twenty floors in it]

// Holding jump re-jumps the instant you touch down. Chaining these keeps a combo alive
// through landings that would otherwise break it, and the small bonus rewards the
// player for committing to the hold rather than tapping.
export const INSTAJUMP_BONUS = 1.06;

export const MOM_UP = 0.34;       // momentum gained per second at full tilt
export const MOM_DOWN = 0.70;
export const MOM_RUN_THRESHOLD = 0.45;   // fraction of the CURRENT cap that counts as running

export const WALL_BOUNCE_MIN = 80;
export const WALL_RESTITUTION = 0.94;       // airborne: a real bounce, keeps the combo
export const WALL_RESTITUTION_GROUND = 0.70; // grounded: a kick-off, not a splat
export const WALL_BOUNCE_LIFT = 45;

// --- the combo drives the walls -------------------------------------------------
//
// A wall bounce used to be the same bounce at every point in a run: 94% of the speed
// back and 45 units/s of lift, whether you were on your first hop or four hundred
// floors into a chain. So the thing the game most wants you to do -- keep the chain
// going and ping-pong the shaft -- paid nothing extra for having been kept going, and
// a bounce always LOST speed, so ping-ponging could only ever hold speed, never build
// it.
//
// Now the live combo drives it. `wallComboBoost` (player.js) turns combo floors into a
// 0..1 boost, on a square-root ramp so a modest chain already feels it -- 10 floors is
// 0.18, 50 floors (x1.5) is 0.41, 150 floors is 0.71 -- reaching full at
// WALL_COMBO_FULL. With no combo the boost is exactly zero and every number below
// drops out, so ordinary play bounces exactly as it always did.
export const WALL_COMBO_FULL = 300;   // combo floors for full boost; six multiplier steps, x4.0
// Restitution added at full boost: 0.94 -> 1.20, so a bounce deep in a chain GAINS a
// fifth of the speed it arrived with. It crosses 1.0 -- the point where a bounce stops
// costing speed -- at about 16 combo floors.
export const WALL_COMBO_KICK = 0.26;
// Extra upward kick at full boost, world units/s, on top of WALL_BOUNCE_LIFT, for a wall
// hit at VX_MAX_HOT or faster; a slower hit earns the same fraction of it as its speed is
// of VX_MAX_HOT (see wallBounceOut). 300 on its own is 27 units of rise, nearly a floor;
// a standing jump is 465.
export const WALL_COMBO_LIFT = 300;
// The caps that keep it reasonable. Sideways: 1.3 x VX_MAX_HOT, 559 units/s -- a
// full-width shaft crossed in under 0.8 s. Upward: the combo lift never takes vy past
// the best plain jump, so a bounce can top up a jump but never out-jump one. Both apply
// only to the COMBO part of the bounce; the plain 0.94 / +45 is never cut, which is
// what keeps a no-combo bounce byte-for-byte what it was.
export const WALL_VX_MAX = VX_MAX_HOT * 1.3;
export const WALL_LIFT_CAP = JUMP_V0_MAX;
// Overdrive: the extra speed has to SURVIVE or it is not speed. Player.step bleeds any
// |vx| above the current cap at FRICTION, 1600 units/s^2, in the air as well, which
// erased a 100 units/s overspeed in about 60 ms -- before the player could see it. A
// combo bounce that leaves faster than the cap instead lifts the cap by the excess,
// and that allowance shrinks at this rate, units/s per second. At full momentum the
// biggest allowance there can be (559 - 430 = 129) runs out in 1.2 s, about one
// crossing of the full shaft; a single full-combo bounce at top speed (516, so 86 over)
// holds 20+ over the old top speed for 0.6 s and is back at the cap in 0.8 s, against
// 0.04 s with no allowance (tools/test-physics.mjs). Carry it across and bounce again
// and it compounds up to WALL_VX_MAX; stop bouncing and it is gone in about a second.
// It lifts the cap on the ground too, so a landing does not erase it before the
// instajump. jumpImpulse still caps speed at VX_MAX_HOT, so overspeed buys distance,
// never extra jump height.
export const OVERDRIVE_DECAY = 110;

// --- platform generation ----------------------------------------------------
// Platforms are sized RELATIVE TO THE ROOM, not in absolute pixels. A 208 px starting
// shaft with 130 px ledges was a stack of near-wall-to-wall slabs with no room to fall
// between them; a small room should have small platforms, and both grow together.
export const PLAT_W_MIN    = 32;      // never narrower than this, whatever the room
export const PLAT_FRAC_MIN = 0.17;    // fraction of the shaft, cramped start
export const PLAT_FRAC_MAX = 0.25;    // fraction of the shaft, fully open
export const PLAT_W_JITTER = 0.30;    // +/- this fraction of the computed width
export const NARROW_RATE   = 0.15;    // gentle extra narrowing by floor 800
// ...and it used to stop there. On a 2300-floor tower that leaves two thirds of the
// climb at a fixed width. A second, much gentler squeeze carries on to floor 2300 so
// the tower keeps closing in. Deliberately additive: every floor below 800 is exactly
// as wide as it was, so nothing about the early game moves.
export const NARROW_LATE   = 0.09;    // further narrowing, floor 800 -> 2300
export const NARROW_LATE_AT = 800;
export const NARROW_LATE_TO = 2300;
// ...and past that, the tower breathes. From floor 2100 -- the start of the last zone of
// the first cycle -- every platform's width is multiplied by a factor that eases from 1
// down to a trough and back up again, over and over, through every later cycle, for as
// long as the run lasts:
//
//   factor(n) = 1 - SQUEEZE_DEPTH * (1 - cos(2 pi (n - SQUEEZE_FROM) / SQUEEZE_PERIOD)) / 2
//
// Before this the width simply stopped changing at 2300, so the only thing the second
// and every later cycle did differently was re-skin itself. A fixed width is a fixed
// difficulty, and a run that has already survived it once has nothing left to prove.
//
// It oscillates with FLOOR NUMBER, not with time. Platforms that changed size while you
// looked at them would break the reachability proof -- it is a proof about the tower as
// generated, one floor against the one below -- and a ledge shrinking out from under a
// man standing on it would be indefensible. Tied to the floor it is deterministic, the
// same for a given seed every time, and every floor it produces is checked by exactly the
// same clamp and the same assert as every floor below it.
//
// Nothing below SQUEEZE_FROM moves: tools/test-squeeze.mjs holds a hash of floors
// 1..2099 for fixed seeds and fails if a single platform there changes.
export const SQUEEZE_FROM   = 2100;    // floor; first floor the squeeze applies to
// Floors from one crest to the next. A squeeze has to be a stretch you FEEL rather than a
// whole zone (200 floors): at floor 2100 the rising floor is climbing about seven floors
// a second, so a 150-floor period is twenty-odd seconds from crest to crest, and the
// tightest part -- factor under 0.5 -- is about 56 floors, some eight seconds of it.
// Deliberately not a divisor of the 200-floor zone, so the troughs drift across the
// zones instead of always landing at the same point in each one.
export const SQUEEZE_PERIOD = 150;     // floors; typical 120-180
// How far the factor falls at the trough, as a fraction of the width. The unsqueezed
// width in a fully open shaft past 2100 is 60-112 units, mean 85; at 0.72 the trough
// mean is about 24 -- right on SQUEEZE_W_MIN -- so roughly half the trough floors sit at
// the minimum and the rest are only a few units wider. That is the "almost unfair" the
// brief asked for: every one of them is a proven landing, and very few of them are a
// comfortable one.
export const SQUEEZE_DEPTH  = 0.72;    // fraction, 0..1; typical 0.65-0.78
// The squeeze's own floor on width. PLAT_W_MIN (32) would stop the trough long before it
// bit, so inside the squeeze the minimum eases from PLAT_W_MIN at a crest down to this at
// a trough. His collision box is PLAYER_W = 16 wide and reach.js rejects anything under
// PLAYER_W + 4 = 20 as a coin flip rather than a landing; 24 leaves four units above that
// line. The DRAWN Duke is far wider than his box -- over forty units with the shield --
// so a 24-unit ledge already looks like a perch he is balancing on, which is the point.
export const SQUEEZE_W_MIN  = 24;      // world units; never below PLAYER_W + 4 = 20
// When the herald announces a squeeze closing or opening, as a fraction of a period
// after the crest or trough. A cosine is flat at its turning points, so a cue ON the
// crest would announce ledges that have not visibly changed yet; 0.1 is fifteen floors
// on, where they have. It also keeps the first cue off floor 2100 itself, where the
// zone's own name is being announced. Both ends of the range are OPEN: at 0 the first
// cue lands on floor 2100 with the zone name, and at 0.5 each cue falls on the NEXT
// turning point, so "closing" is said at a trough and "opening" at a crest.
export const SQUEEZE_CUE_LAG = 0.1;   // fraction of SQUEEZE_PERIOD, over 0 and under 0.5; typical 0.1

// --- camera / death ---------------------------------------------------------
// The camera is locked to the character and follows in BOTH directions. Death is no
// longer "fell off the bottom of the view" -- it is the rising floor catching you, which
// is a threat you can see coming and outrun.
export const CAM_ANCHOR = 0.42;       // player sits this far up the screen
export const CAM_LERP = 14.0;
export const CAM_LOOKAHEAD = 0.10;    // drift the view toward where you are heading

export const RISE_START_FLOOR = 1;   // the moment you leave the ground
export const RISE_BASE = 11;
export const RISE_PER_FLOOR = 0.34;
export const RISE_MAX = 165;
// The rising floor reached RISE_MAX at floor 453 and never went faster, so the game
// stopped getting harder a fifth of the way up the new tower. Past that it now keeps
// accelerating on a much shallower slope -- about a tenth of the first one -- up to
// RISE_LATE_MAX at the top of the cycle. Below floor 453 the speed is untouched.
export const RISE_LATE_FROM = 453;    // where RISE_BASE + floor * RISE_PER_FLOOR tops out
export const RISE_LATE_TO = 2300;
export const RISE_LATE_MAX = 226;
// How far the rising floor may trail behind your best. This SHRINKS as you climb: the
// tower gets less forgiving about how far you are allowed to fall, so a mistake at
// floor 900 costs you where the same mistake at floor 20 would not.
export const RISE_LEAD = 340;        // floors 0-ish, eleven floors of slack
export const RISE_LEAD_MIN = 62;     // deep in, barely two floors -- a fall is a death
export const RISE_LEAD_FADE = 450;   // and it closes this fast
// How fast the floor may CLOSE that gap when you sprint ahead of it.
//
// The gap used to be enforced by assignment -- riseY = bestY - lead, every tick -- which
// teleports the killline up to 270 px in a single frame when a full-speed jump lands
// nine floors higher. Everything else on screen is interpolated, the draw has a
// 40 px-below-the-view cutoff, and the result was a red band snapping in and out of the
// bottom of the screen at random. It eases now. Faster than anyone climbs, so the
// threat still converges; slow enough to be a movement rather than a jump cut.
export const RISE_CATCHUP = 720;

// Standing still is not neutral. Idle long enough and the floor comes up faster, so
// the tower punishes dithering rather than merely ignoring it.
export const IDLE_GRACE = 0.7;       // seconds before the floor starts hurrying
export const IDLE_RISE_MULT = 3.2;   // how much faster it climbs at full idle
export const IDLE_RAMP = 2.0;        // seconds from grace to full multiplier
// The downward yank when the floor catches you. Without it the fall begins from a
// standstill and the first half-second looks like he simply let go.
export const FLOOR_GRAB = 240;
// (DEMO_RISE_SCALE, 0.55, slowed the fire under the attract demo until 2026-09-29, "because the
// real curve outruns any climber within minutes". It stopped being true of the bot: rebuilt to
// fly the real game, it outran MEDIUM's fire on every one of 200 towers for ten minutes, so the
// demo climbs ahead of a player's fire at the default DIFFICULTY, and the constant is gone.)
// DIFFICULTY (settings.js, the OPTIONS row; Game.newRun): how hard the fire presses. `rise`
// multiplies its speed [x; the speed above, idle urgency included] and `lead` how far it may
// trail the best floor [x; RISE_LEAD .. RISE_LEAD_MIN]. EASY is the fire as it was until
// 2026-09-28, both 1, an identity; the user: "can we also make the falloff floor rise faster
// because it is way too slow and allows way too much leeway this should be easy mode. lets make
// a medium and a hard mode which we can change in the settings". A run keeps its difficulty
// and a replay's header carries it (replaycodec.js, by its place in this list: never reorder,
// only add at the end). Indexed from settings.js by the same place.
export const DIFFICULTIES = [
  { name: 'EASY', rise: 1, lead: 1 },
  { name: 'MEDIUM', rise: 1.35, lead: 0.7 },
  { name: 'HARD', rise: 1.75, lead: 0.5 },
];

// --- the long way down --------------------------------------------------------
// Losing is not a cut to a scoreboard. You fall the length of the shaft, screaming,
// and land badly. How badly depends on how far you had climbed.
export const PIT_BASE = 900;        // px of fall, minimum
export const PIT_PER_FLOOR = 2.6;   // plus this much per floor reached
export const PIT_MAX = 2600;        // capped, or floor 900 would be a 30-second fall
// --- the splatter -------------------------------------------------------------
// He comes apart into the DRAWN pieces: the connected pieces of the two parts drawings
// plus his crown, one body's worth -- two arms, where the drawing has four (src/render/
// sprites.js SPLAT_BITS counts them). The count moves with the art -- eleven on one import
// of this sheet, ten on the next, which cut his arms into three pieces instead of four --
// so nothing here states it. It used to be a constant
// here, kept equal to the art by hand, and it was not -- it said nine while the sheet
// drew ten, so his sword never came off him.
//
// The ten were one arm short because the fourth arm is drawn still hanging off the
// torso's shoulder, so the torso flew with an arm on it while the other three came off.
// sprites.js cuts it off along the cheapest line the drawing offers (cutLimbs), which
// makes it eleven again; these two numbers are how that reads the art. Then it cuts the
// torso's own right pauldron off as a PLATE, the last two numbers (twelve pieces): left on,
// the tabard lay wearing a steel shoulder, and that still read as the arm that had not come
// off (the user, 2026-09-28, of the build with the arm already cut free).
export const CUT_OUTLINE_V = 64;    // tone value (0-255) under which a pixel is outline ink,
                                    // 1 to cut through (lit ink costs up to 9). In this
                                    // sheet's parts the darkest inks run 0-62 and the next
                                    // tone up is 82: it sits in that gap
export const LIMB_MATCH = 0.25;     // a cut is an ARM only if the ink it takes is within
                                    // this fraction of the loose arms' median (1511 px here):
                                    // the whole arm comes to +4.5%, a cut at its elbow -44%,
                                    // the next best cut once it is off (the torso's own
                                    // right pauldron, 378 px) -75%
export const PLATE_MIN = 0.12;      // a PLATE cut takes at least this share of the loose
                                    // arms' median ink, and under 1 - LIMB_MATCH of it (an
                                    // arm is bigger). The pauldron is 0.25 (378 px); a speck
                                    // of trim is a few px, under 0.01. Typical 0.1-0.2
export const PLATE_STEEL = 0.5;     // and at least this share of its lit (non-outline) ink is
                                    // steel, so it is armour and not a strip of tabard.
                                    // The pauldron's is mostly steel; the tabard's none
//
// The pieces are LIGHT now, and springy. At 900 and 0.42 they hit, hopped once and lay
// still inside a second, which read as heavy lumps dropped rather than a body thrown
// apart. Lower gravity keeps them in the air long enough to be seen tumbling; more
// bounce gives each one four or five strikes, and each strike is a splash of blood.
export const GIB_GRAVITY = 500;     // units/s^2; 900 before. A piece thrown 40 up hangs 0.8 s
export const GIB_BOUNCE = 0.6;      // fraction of the strike speed it leaves the floor with; 0.42 before
export const GIB_FRICTION = 0.72;   // horizontal travel and spin kept from one hop to the next
export const GIB_SPIN = 9;          // radians/s, the fastest a piece tumbles out of the burst
// A strike slower than this is its LAST: the piece lands and stays. Planned, not
// detected -- the number of hops each piece takes is decided when he bursts, so the
// landing can be steered to arrive exactly where and how it was planned to. 30 units/s
// is a hop about one unit high: past the point where another bounce reads as anything.
export const GIB_REST = 30;         // units/s
export const GIB_MAX_STRIKES = 7;   // and never more hops than this, however hard he hit
// How high the burst throws each piece, measured from the floor, before severity scales
// it (x0.85 on the shallowest splat up to x1.15 on the deepest). He is 53 units tall; at
// the closest zoom the view shows 78 above the floor, and a piece thrown past that
// leaves the screen at the top.
export const GIB_APEX_MIN = 22;     // world units
export const GIB_APEX_MAX = 46;     // world units
// Where they end up. Every piece is given a resting place on the floor at the moment he
// bursts -- side by side, lying down, none on top of another -- and steered onto it. These
// set the clear floor between two neighbours: at least GIB_GAP, plus up to GIB_SPREAD
// more, and the spread widens with severity, so a deeper fall scatters him wider.
export const GIB_GAP = 1.5;         // world units, the least clear floor between two pieces
export const GIB_SPREAD = 12;       // world units, the most extra, at severity 0.6

// --- blood --------------------------------------------------------------------
// How far he fell decides how much of him ends up on the floor. SEVERITY is the fall
// depth mapped onto 0..1 between PIT_BASE and PIT_MAX, so a splat just past floor 200
// (a fall of about 1420) is 0.3 and anything past floor 654 is 1.
//
// It had to be the DEPTH. Blood used to scale with strike speed only, and terminal
// velocity caps strike speed within the first few hundred units of the fall, so a
// 2600-unit plunge landed exactly as wet as a 1420-unit one.
export const BLOOD_POOL_MIN = 12;   // world units, final half-width of the pool at severity 0
export const BLOOD_POOL_MAX = 46;   // ...at severity 1. His body is 63 wide
export const BLOOD_POOL_T = 1.5;    // seconds for the pool to spread to that width
export const BLOOD_MARKS_MAX = 3;   // stains per strike at severity 1; one at severity 0
export const SPATTER_MIN = 8;       // droplets thrown onto the floor at severity 0...
export const SPATTER_MAX = 44;      // ...and at severity 1

export const SPLAT_FLOOR = 200;     // at or above this, you splatter. below it, dazed.
// Seconds on the ground before the scoreboard. 2.4 would cut the lighter, bouncier pieces
// off mid-air: across 48 staged deaths they settle 1.6 s after the impact at the median
// and 2.1 s at the latest (test-death.mjs measures it every run and fails past 2.7). 3.2
// leaves a still moment of everything lying where it landed before the board comes up.
export const IMPACT_HOLD = 3.2;
// ...but only a splat has pieces to wait for. The hold went from 2.4 to 3.2 s so every
// limb is down before the scoreboard, and a DAZED landing below SPLAT_FLOOR has nothing
// bouncing: it keeps the old hold, or he lies there 0.8 s longer for no reason.
export const IMPACT_HOLD_DAZED = 2.4;

// --- the stats -------------------------------------------------------------------
// TOP SPEED is floors climbed a minute, over the best CLIMB_WINDOW seconds of a run and
// never measured over less than CLIMB_MIN_SPAN. See Game.trackClimb.
export const CLIMB_WINDOW = 10;     // seconds; typical 10
export const CLIMB_MIN_SPAN = 5;    // seconds; below this one big jump reads as a sprint
export const FALL_TERMINAL = 1150;  // faster than gameplay terminal; this is a plummet
export const FALL_GRAVITY = 1.15;   // gentler than gameplay: more hang time to scream in
export const FALL_WALL_BOUNCE = 0.82;  // the ragdoll keeps its collisions all the way down
export const FALL_WALL_MIN = 55;       // floor on the rebound, so it never goes limp OR runs away
// What the screen lets go of when the floor has him. Everything a player was watching as
// the fire closed in used to switch off in the frame it caught him -- the red band, the
// vignette, half the speed lines -- and the band had only switched ON one to six frames
// before (the floor is crossed in the last instant; see Game.danger): a red bar that
// flashed up and vanished. They let go over these instead. See Game.danger, Game.intensity.
export const DANGER_RELEASE = 1.0;  // seconds for `danger` to climb back to clear; the band
                                    // is gone 0.3 of it in, the vignette 0.5. typical 1
// What the fire takes with it. The fall is him alone in the shaft: from the catch the tower
// on screen burns away (render/burn.js) and the tower under the fire is never drawn, the
// speed lines are retired, and every spark, mote and floater the climb left in the air runs
// out its own fade -- all of it inside FALL_CLEAR, none of it in one frame (the row "What
// flashed as he fell into the fire" in GAMEPLAY.md). They used to ride the whole plunge: the
// ledges above him, then the tower BELOW the fire scrolling up past him to the pit, the
// companions, the combo trail, and the speed lines turned into the plummet's -- thin orange
// rain across the shaft. tools/test-fallclear.mjs holds all of it to the window.
export const BURN_T = 0.3;          // seconds for the ledges on screen, their furniture and the
                                    // companions on them to char, glow at the edges and
                                    // dissolve. Over by the time the camera has come about
                                    // half a screen down, so all but the top row of ledges
                                    // are seen through to the end; at 0.4 the last ledge had
                                    // left the top of the screen before it finished. typical 0.3
export const FALL_LET_GO = 0.3;     // seconds: the longest anything the climb left in the air
                                    // (sparks, dust, confetti, floaters) lives on after the
                                    // catch. typical 0.3
export const STREAK_LET_GO = 0.15;  // seconds for the speed lines' intensity to fall to none;
                                    // each line the pool retires then shrinks into its head
                                    // over the pool's own 0.2 s (streaks.js). typical 0.15
export const FALL_CLEAR = 0.35;     // seconds from the catch after which nothing of the climb
                                    // may be drawn: the last of the three above, the streaks'
                                    // shrink included. typical 0.35
// How the camera follows the plunge. It was a lerp toward him at 9 per second with a hard
// clamp keeping him above 18% of the view: at terminal velocity the lerp lagged by 0.47 of
// a view, so the clamp caught him about half a second in -- he slid down the screen at
// 800 px/s and stopped dead on that line inside two frames, while the world jumped from 22
// to 29 px a frame. Now a critically damped spring on his position, fed his own speed and
// acceleration, so the camera's speed never jumps: it carries on from the climb's at the
// catch, settles him on FALL_CAM_AT at full speed, and after the impact runs on a little and
// comes to rest with him on CAM_ANCHOR. See Game.stepFalling.
export const FALL_CAM_AT = 0.2;     // fraction of the view up from its bottom that he rides at
                                    // through the plunge. typical 0.2
export const FALL_CAM_RATE = 8;     // 1/s at zoom 1 (scaled with the zoom, so the motion is
                                    // the same on screen at any): the spring's rate. After the
                                    // impact it carries on past him by a quarter of a view (he
                                    // rises to 0.47 of it) and eases back 0.05 onto
                                    // CAM_ANCHOR; that run-on is what FALL_CAM_AT is set
                                    // against. typical 8
export const FALL_CAM_BLEND = 0.12; // seconds over which the fall's camera eases onto the
                                    // interpolated one (Renderer.cameraY). typical 0.12
export const CLIMB_READ = 0.25;     // seconds: CLIMB! comes up only while the floor is at
                                    // least this far off at the rate it is closing -- a
                                    // reaction time. See Game.climbWarning. typical 0.25
export const CLIMB_CLEAR = 0.35;    // danger (0..1 of the lead) at which a CLIMB! that is up
                                    // goes; it comes up under 0.3, so a danger hovering at
                                    // the line cannot flick it. typical 0.35
export const HUD_OUT = 0.35;        // seconds for the HUD to fade out once the fire has him,
                                    // in three steps like a banner's. typical 0.35
export const SKIP_PROMPT_AT = 0.5;  // seconds into the fall before SPACE TO SKIP comes up:
                                    // after a companion's call has faded (0.45) from the
                                    // same spot. typical 0.5

// --- combo ------------------------------------------------------------------
// Slow motion on a big combo. Eased rather than switched -- see Game.step. 0.35 with no
// ramp read as a dropped frame rather than as emphasis.
export const SLOWMO_SCALE = 0.55;
export const SLOWMO_EASE = 26;      // per second; about 80 ms in and the same out

export const COMBO_MIN_GAIN = 2;      // floors cleared in one hop to START a combo
// The score. A floor climbed past the run's best is worth FLOOR_POINTS as it is climbed; a
// chain, when it is banked, pays CHAIN_FLOOR_POINTS for each of its floors and TRICK_POINTS
// for each trick in it (an air jump, a wall bounce, a held-jump chain), all of it times the
// chain's step multiplier (combo.js: x1.5 at 50 floors, x2 at 100 ...). A trick ADDS: it
// used to multiply the whole chain, and the score ran to hundreds of millions -- see
// ComboTracker.scoreFor. A 400-floor chain with a trick every five floors pays 30,000.
export const FLOOR_POINTS = 10;        // points per floor past the run's best; typical 10, the genre's
export const CHAIN_FLOOR_POINTS = 10;  // points per floor of a banked chain, before its step
                                       // multiplier; typical 10, so a chain's floor is worth
                                       // what a climbed one is, times the step
export const TRICK_POINTS = 25;        // points per trick in a banked chain, before its step
                                       // multiplier; typical 20-30. A trick comes every five
                                       // floors or so (957 in the bot's 5089-floor chain), so
                                       // at 25 the tricks add about half again
// How long you may stand on a platform before the chain is considered over. Long enough
// to land and jump again at any reasonable rhythm, far too short to loiter. This is the
// break the combo system did not have: before it, a chain at full momentum could only be
// ended by falling.
export const COMBO_GROUND_GRACE = 0.40;
// What a combo step (every MULT_STEP floors of a chain, x1.5, x2 ...) still does now that it
// no longer shouts a word: a burst of this many particles out of the Duke in the colours the
// trail changes to at that step, and a sound -- the hop ladder's step mark on the landing
// that crossed it (render/gamesounds.js), not Game.onComboStep, which gamesounds.js sets to
// do nothing so the step is not heard twice (this named onComboStep as the sound). No flash
// and no shake -- those belong to the height callouts. [particles; typical 28, 40% of a
// callout's 70]
export const COMBO_STEP_BURST = 28;

// --- the height callouts ----------------------------------------------------------
// The seven words stand at k/7 of a lap of the zones, rounded to the nearest multiple of
// this, so a player sees floors he can remember: 330, 660, 990, 1310, 1640, 1970 and GLORY
// at the lap's top (src/game/milestones.js). [floors; typical 10]
export const CALLOUT_ROUND = 10;
// Seconds a callout is on screen, entrance and fade included. It was a literal 1.6 in
// game.js and hud.js; the arbitration with the zone titles waits on it. [s; typical 1.6]
export const CALLOUT_LIFE = 1.6;
// The prestige badge beside the word from the second lap on (render/calloutpaint/badge.js).
// It comes in once the word has made its own entrance, this long after, so the two
// entrances do not happen on top of each other. [s; typical 0.06]
export const BADGE_AFTER = 0.06;
// Clear space between the word's rightmost painted pixel (its glow, rays and shields
// included) and the badge's plate. [art px, one per backing pixel; typical 10]
export const BADGE_GAP = 10;
// Zones. The opening one is half length so a run gets moving before the first change;
// every zone after it runs the full 200. With twelve themes that makes the last zone
// start at 2100 and the tower loop at 2300.
export const FLOORS_PER_THEME = 200;
export const FIRST_THEME_FLOORS = 100;

// --- the render zoom's glide ----------------------------------------------------
//
// The arena's zoom steps between whole world scales so sprites are never resampled at
// rest (see tools/test-scaling.mjs). The RENDERER eases to each step rather than
// snapping to it, because an instant 12.5% change of the whole view reads as a glitch.
//
// ZOOM_SNAP is a hundredth of a screen pixel at PX 4, so the glide ends exactly on the
// quantised value rather than approaching it forever.
export const ZOOM_EASE = 6.0;          // per second, exponential
export const ZOOM_SNAP = 0.0025;

// --- replays (src/game/replay.js) ------------------------------------------------
//
// A replay is the seed and the input the simulation saw, step by step; the numbers below
// shape the file and the store, not the play. None of them is part of the simulation
// fingerprint (replay.js skips the REPLAY_ prefix), and the ones a file depends on are
// written into its header, so changing one here never breaks a replay already saved.
//
// SIM_VERSION is the exception, and it is not a tunable: it is part of the fingerprint.
// Bump it when a CODE change alters the simulation without changing any number in this
// file -- a new rule in player.js, a reordered step. A changed constant, and most code
// changes, move the fingerprint by themselves (the constants are hashed, and a probe run
// through the real simulation is hashed with them); this is the manual override for the
// change the probe does not reach. typical: 1, only ever goes up
//
// 2 (2026-09-28): a jump press made in the air with no air jump to spend is left in the
// jump buffer and fires on landing, where it used to be taken and thrown away in the air
// (Player.step). The probe's climber taps for one step at a time and the next step
// overwrites its tap, so it never sees the difference; the number does it instead, and
// every replay saved before is refused cleanly ("a different version of the game") rather
// than played with presses that now land differently. Their ghosts still race.
//
// 3 (2026-09-28): the score's scale. A chain's tricks used to multiply its payout, which
// grew as the cube of the chain; they add now (ComboTracker.scoreFor, FLOOR_POINTS above).
// The new numbers move the fingerprint by themselves; the bump is here because the replay
// store ranks a run by the scale it was scored on and reads that from this number
// (replaystore.js SCORE_SCALE_SINCE), so a run of hundreds of millions from before cannot
// hold every place among the player's bests.
//
// 4 (2026-09-28): the companions on his clock. At a JUMP SPEED over 100% their speed caps
// and their rhythm -- a hop's flight, the stand after it, the climb rate they read -- scale
// with his rate now (companions.js boostOf, paceOf), where they kept the world's; at 100%
// nothing changes. The probe climbs at 100%, so it cannot see it, and a replay recorded at
// 120% would have played back into a different companion, and so a different tower, from
// the first join on.
export const SIM_VERSION = 4;
// A 32-bit hash of the simulated state every this many steps, so playback names the first
// second that disagrees. steps; 240 = once a simulated second at the 240 Hz step
export const REPLAY_CHECK_EVERY = 240;
// The ghost track samples the Duke every this many steps. steps; 8 = 30 Hz, typical 6-12
export const REPLAY_GHOST_EVERY = 8;
// ...and stores his position in steps of 1/this world unit. quanta per world unit; 8 =
// half an art pixel (an art pixel is 1/PX = 0.25 units), typical 4-8
export const REPLAY_GHOST_Q = 8;
// Playback copies the whole game every this many steps, so seeking back is a restore and
// at most this many steps simulated forward. steps; 2400 = 10 simulated seconds, typical
// 1200-4800. A copy is ~80 KB (mostly the particle pool), so a 10-minute run holds ~5 MB
export const REPLAY_KEYFRAME_EVERY = 2400;
// Copies of the LIVE game the recorder keeps, at the same interval, so the instant replay
// after a death starts from one instead of simulating the run from floor 0. count; 3
// covers at least the last 20 s ((count - 1) intervals) and up to 30, typical 2-4
export const REPLAY_LIVE_KEYFRAMES = 3;
// Steps spent on a menu mid-run (OPTIONS, STATS) still step the particles and the shake.
// After this many, everything they touch has settled (the longest particle lives 1.6 s,
// a banner 2.2 s, the zoom glide about 2 s), so more change nothing and are not stored.
// steps; 2400 = 10 s, typical 1200-2400
export const REPLAY_COSMETIC_CAP = 2400;
// Characters of browser storage the replay store may use, all replays together. Browsers
// give an origin about 5 MB of localStorage, which is 2.5 M characters where it is
// counted as UTF-16 (Safari), and the settings and stats share it. characters; typical
// 1.5 M (measured: a minute of human-like play is ~9 k, a ten-minute bot run 125 k)
export const REPLAY_STORE_BUDGET = 1500000;
// Best runs kept, by score. count; 10
export const REPLAY_BEST_KEPT = 10;
// Import limits: an untrusted file longer than these is refused before it is parsed, and
// a recording that reaches this many steps stops there (ending 'cut'), so the game never
// writes a file it would refuse. steps; 1,728,000 = two hours at 240 Hz
export const REPLAY_MAX_STEPS = 1728000;
// characters of replay text; typical file 5-150 k, so 4 M is far past any real run
export const REPLAY_MAX_TEXT = 4000000;
// A race's replay carries the tower it was run on, the ghost run's own (course.js), and a
// file may not claim more of it than the play that laid it out could have generated (the
// course's steps; replaycodec.js courseCap adds what a file may generate from outside): this
// many floors per step of it, plus REPLAY_COURSE_FLAT. floors per step; 0.25 -- the attract bot,
// the fastest climber here, generates about 0.13 since it was rebuilt (2026-09-29; 0.045
// before, 980 floors in 21,558 steps), typical 0.01-0.05 for a person
export const REPLAY_COURSE_RATE = 0.25;
// ...and the floors a tower holds before its run has climbed any: the 24 newRun lays down
// and the look-ahead above the view (the step's own six, the bot's sixteen). floors; 200,
// typical 30-50
export const REPLAY_COURSE_FLAT = 200;

// --- the replays' screens (src/ui/replays.js) --------------------------------------
//
// How the replays are WATCHED and RACED. Nothing in the simulation reads these, and the
// REPLAY_ prefix keeps them out of the simulation fingerprint (replay.js skips it), so a
// change here never refuses a replay.
//
// One press of back or forward moves the replay this far. seconds; 5
export const REPLAY_SKIP = 5;
// The speeds a replay steps through, slowest first; 1 must be one of them. multiples of
// real time; typical [0.5, 1, 2, 4]
export const REPLAY_SPEEDS = [0.5, 1, 2, 4];
// The most a seek may simulate in one frame before it carries on in the next. ms; 6 --
// under a 160 Hz frame (6.25 ms), typical 4-8. A seek into a long replay whose copies are
// far apart simulates up to ten seconds of play per copy it skips.
export const REPLAY_SEEK_BUDGET = 6;
// The ghost of the run being raced is drawn at this opacity, behind everything but the
// scenery. 0..1; 0.55, typical 0.45-0.65: under 0.4 it is lost over a busy zone, over 0.7
// it is read as a second player
export const REPLAY_GHOST_ALPHA = 0.55;
// How long a note on the replays screen stays up (imported, exported, refused). seconds;
// 5, typical 3-6
export const REPLAY_NOTE_LIFE = 5;

// --- the speed afterimage (render/afterimage.js) ---------------------------------------
//
// Flat silhouettes of the Duke laid down on the path he actually took, each in the pose,
// facing, squash and quarter turn he was drawn in there. The look is the old trail's --
// four copies, one tone, the same alphas and the same fade -- but no copy is more than
// GHOST_GAP of path from the one before, so the chain stays on him: 8 units behind him at
// most, where the old one hung 28 under him on every launch.
//
// GHOST_GAP was chosen by measuring every 160 Hz frame of a launch, a run, a wall bounce,
// a roll and a fall at zoom 1 (each copy's silhouette rasterised on its own). It was first
// chosen while the tuck still turned about its cell's centre, 12.4 units above the ball of
// him, so that the ball hopped 17.5 units at every quarter turn: at 3 and 4 units a copy
// the farthest copy came clear of him in a roll or a wall bounce, and even at 2 the copies
// from before a turn covered 2% of him and hung a ball's width off him. The tuck turns
// about the ball now (SPIN_PIVOT in sprites.js), and over 6 s of the bot, a drop and runs
// both ways (1,175 frames with a trail) every gap from 2 to 4 keeps the chain whole: the
// nearest copy covers at least 45% of him (a pose change) and 89% typically at 2 -- 80% at
// 4 -- and the farthest at least 31% at 2, 22% at 3, 13% at 4. The trail reaches 8 units
// past his outline (median) at 2, 12 at 3, 16 at 4, where the old line along -v reached
// 33 on a launch and 15 on a run. 2 keeps it on top of him, which is what was asked.
export const GHOST_N = 4;              // copies behind him; typical 4
export const GHOST_DT = 0.009;         // s of his path between copies, as the old trail; 0.006-0.012
export const GHOST_GAP = 2;            // world units of path at most between copies; 2-3. His
                                       // outline is 25 (the tuck) to 50 units across. Binds
                                       // above 222 units/s (GHOST_GAP / GHOST_DT)
// Alpha of each copy, nearest him first. They overlap almost entirely and COMPOSITE, so
// they are much fainter than they look on paper: all four stack to about 19%.
export const GHOST_ALPHA = [0.079, 0.061, 0.043, 0.025];
// The trail comes up with his speed along his path between these, in world units/s (a
// run tops out at 430, a launch leaves at up to 990) ...
export const GHOST_FROM = 78;
export const GHOST_FULL = 356;
// ... and with his momentum (0..1) between these. Neither switches it; both scale alpha.
export const GHOST_MOMENTUM_FROM = 0.45;
export const GHOST_MOMENTUM_FULL = 0.65;
// Drawn states kept, one a rendered frame. 36 ms of path at 880 Hz; a ring, reused.
export const GHOST_HISTORY = 32;
// A frame whose position is further from the last than his speed could carry him, times
// this, plus GHOST_JUMP_SLACK world units, is a teleport (a new run, a staged floor), and
// the path starts again there rather than draw a copy across the jump.
export const GHOST_JUMP_K = 1.5;
export const GHOST_JUMP_SLACK = 2;       // world units; typical 2 (8 px at zoom 1)
