// In-game HUD.
//
// Everything is drawn in 480x270 view units -- on the 1920x1080 backing store, not in a
// 480x270 buffer as it once was -- with the 5x7 font, so at 4K each glyph is 40x56
// screen pixels, readable from a sofa without any of it being a DOM overlay that would
// need its own scaling rules.
//
// It is drawn in the ZONE'S skin (render/hudskin.js, the zones in render/hudpaint.js):
// the speed bar and the combo meter framed in the zone's material, every word and number
// in the zone's inks inside a keyline that holds it off that zone's backdrop. It used to
// be flat bars and flat text, the same in every zone. The skin changes on the zone's
// arrival; every element is where it always was.

import { drawText, drawTextOutline, textWidth } from '../render/font.js';
import { VW, VH, PLAY_L, PLAY_R, CALLOUT_LIFE, ASCENT_BOUNCE, ASCENT_SPEED } from '../game/constants.js';
import { THREAT_HZ } from '../render/renderer.js';
import { hudSkinFor, skinText, skinGauge, METER } from '../render/hudskin.js';
import { drawZoneTitle, zoneTitleRows, warmZoneTitles } from '../render/zonetitles.js';
import { mText } from '../render/menuskin.js';
import { drawCallout } from '../render/callouts.js';
import { airJumpWords, ascentWords } from '../game/flavour.js';

const pad = (n, w) => String(n).padStart(w, ' ');

// The combo meter on the left edge, clear of the HUD stack above it (FLOOR, SPEED, the
// MAX flag and the held-jump chain all finish by y=66) and of its own labels below.
//
// There was a second gauge, FALL ROOM, down the right edge on the same span -- the rising
// floor's distance as a bar filling from the bottom. The user asked for it to go, and it
// is gone completely: the floor itself is on screen whenever it is close enough to matter,
// and the danger band, the vignette and CLIMB! still say when it is urgent. (Before the
// bar there was a 'FLOOR IN 11.3' readout: a DISTANCE that read as seconds, and that sat
// pinned on the lead the rise trails you by, never counting down. Do not bring a number
// back either.) The right edge below the score is left empty on purpose: it gives that
// column of the shaft back to the Duke and the ledges, and the floaters that were clamped
// 20 units off it to clear the bar now run to the edge (renderer.js drawFloaters).
const GAUGE_TOP = 78;
const GAUGE_H = METER.h;                           // 104
const GAUGE_LABEL_Y = GAUGE_TOP + GAUGE_H + 4;     // 186
// Centre-screen text sits in two bands of its own. The grand callout's letters stand
// from CALLOUT_TOP (y=80, render/callouts.js) to about y=99, and what rises over them
// reaches higher: CRUSADE's shield to about y=65, THUNDER's lightning 66, GLORY's rays 73
// and RAMPAGE's fire 74 (every frame a settled word shows, measured 2026-09-28; y=84..104
// was the old printed shout's band). The banner stack starts at BANNER_TOP. Both are
// centred, while the meter hugs the left edge, so they cannot meet horizontally. Its
// LABELS sit at GAUGE_LABEL_Y = 186, below the banner stack's first line -- fine, because
// they are at the edge too.
const BANNER_TOP = 150;
// The herald's lines -- the nudge when he stands still (THE TOWER AWAITS THEE), the taunt at
// a big combo, the squeeze's warnings -- stack from TEXT_TOP, or under the zone titles when
// both are up. In the stack at BANNER_TOP they were printed across his shins: the camera
// holds his feet 42% up the screen (CAM_ANCHOR), about row 157, and the first line ran
// 150-157, so in bot play at the player's defaults he covered it 22% of the time -- and at
// the start of a run, standing on the ground waiting to begin, every time. The HUD is drawn
// under the characters, so the nudge came up behind his shield and boots (the user asked for
// the Duke never to hide the encouragement at the start of a run, 2026-09-28).
// Measured over the same runs, his drawn box (+-26 across and 51 up: the widest and tallest
// of his live poses) covers a centred band at 170-180 0.11% of the time and nothing from 180
// down. 178 is under his feet and clear of the companions' calls, which stand up from row
// 260 (to 210 at most, two of them in a handover).
const TEXT_TOP = 178;
/**
 * The ink of a herald's line, from the colour the game gave it (Game.banner): the Duke's
 * argent for white -- the taunts, a squeeze letting go, the ascension's first line -- and his
 * gold for anything else, the zone's accent on the nudge and a closing squeeze and the
 * ascension's pale gold. The menus' tinctures, as the scoreboard's: twelve accents would be
 * twelve more inks painted at load for one short line. Both are painted at load
 * (gameoverskin.js warmBoardLettering). A big line (only a zone's name is one, and that is
 * lettered by its own painter) keeps the old outline.
 */
const heraldInk = (colour) => (String(colour).toLowerCase() === '#ffffff' ? 'text' : 'gold');

export function drawHud(ctx, game, all, t) {
  const skin = hudSkinFor(game);
  const run = game.run;

  // --- floor (top left) -----------------------------------------------------
  skinText(ctx, skin, 'ink', 'FLOOR', PLAY_L + 3, 5, 1, 'left');
  // y=14, not 13. The label above ends on row 11 and the value is drawn at scale 2 with
  // a two-unit keyline, so at 13 that keyline reached row 11 and ate the bottom bar of
  // the label's last letter -- SCORE read as SCORF and FLOOR as FLOOB.
  skinText(ctx, skin, 'num', String(run.maxFloor), PLAY_L + 3, 14, 2, 'left');

  // --- score (top right) ----------------------------------------------------
  skinText(ctx, skin, 'ink', 'SCORE', PLAY_R - 3, 5, 1, 'right');
  skinText(ctx, skin, 'num', String(game.score), PLAY_R - 3, 14, 2, 'right');
  if (all && all.bestScore > 0) {
    const beating = game.score > all.bestScore;
    skinText(ctx, skin, beating ? 'gold' : 'ink',
      (beating ? 'RECORD ' : 'BEST ') + (beating ? game.score : all.bestScore), PLAY_R - 3, 30, 1, 'right');
  }

  // --- the ascension (top centre) --------------------------------------------
  // Once he has beaten ZENITH, what it gave him, for the rest of the run (Game.ascend).
  if (game.ascent > 0) {
    skinText(ctx, skin, 'gold', ascentWords(game.ascent, ASCENT_BOUNCE, ASCENT_SPEED), VW / 2, 5, 1, 'center');
  }

  // --- momentum -------------------------------------------------------------
  // The brief asked that running raise both speed and jump height, so the meter that
  // drives both has to be visible or the player cannot tell why a jump went further.
  // Pinned, it and its words flash between the zone's hot fill and a paler one, where
  // they used to flash white.
  const p = game.player;
  const full = p.momentum > 0.985;
  const flame = full ? (Math.sin(t * 18) * 0.5 + 0.5) : 0;
  // The bar before its label: the bar's dark plate reaches up to the label's keyline, and
  // drawn after it, its near-black outer pixel ruled a line through the label's plate.
  skinGauge(ctx, skin, 'bar', PLAY_L + 3, 41, p.momentum, full && flame > 0.5);
  skinText(ctx, skin, 'ink', 'SPEED', PLAY_L + 3, 32, 1, 'left');
  if (full) {
    const tone = flame > 0.5 ? 'flash' : 'hot';
    skinText(ctx, skin, tone, 'MAX', PLAY_L + 81, 40, 1, 'left');
    // Air jumps only exist while the meter is pinned, so the player needs to be told
    // the moment they become available rather than discovering it by accident -- and
    // which: the double, or the triple a 250-floor combo earns (flavour.js airJumpWords).
    skinText(ctx, skin, tone, airJumpWords(p), PLAY_L + 3, 50, 1, 'left');
  }

  // Held-jump chain. Only shown once it is long enough to be deliberate.
  if (p.instaChain > 2 && p.grounded === false) {
    skinText(ctx, skin, 'chain', 'CHAIN x' + p.instaChain, PLAY_L + 3, full ? 59 : 50, 1, 'left');
  }

  // --- combo meter, on the left edge ----------------------------------------
  //
  // The counter is FLOORS CLIMBED in the chain, and the multiplier beside it steps every
  // fifty of them: x1.5 at 50, x2 at 100, and so on.
  //
  // It used to show `hops` -- landings -- as both counter and multiplier, on the
  // reasoning that floors lurch by two to nine per landing while hops rises by exactly
  // one. That is true and it was the wrong call: a player is watching how far up the
  // chain has carried them, not how many times they have touched down, and a counter
  // that lurches is a counter that is measuring something real.
  //
  // The counter RIDES the top of the fill, so it climbs the side of the screen as the
  // chain grows. The bar is progress to the next multiplier step and resets as each is
  // claimed, rather than draining on a timer -- combos end by stopping or by landing
  // nowhere, and a bar that emptied by itself would draw a mechanic that does not exist.
  //
  // It reads the combo's own step ladder (ComboTracker.nextStep), not the callout table:
  // the callouts are the tower's heights now (milestones.js). The ladder has no top, so past
  // 350 floors the bar goes on filling toward x5 at 400 and so on, where it used to pin full
  // and pulse for the rest of the chain.
  const c = game.combo;
  if (c.active && c.floors > 0) {
    const frac = c.meterFrac();
    const next = c.nextStep();
    const hot = frac > 0.8;
    const pulse = Math.sin(t * 12) * 0.5 + 0.5;
    skinGauge(ctx, skin, 'meter', PLAY_L + 3, GAUGE_TOP, frac, hot && pulse > 0.5);

    // Floors at the surface of the fill, rising with it. Clamped so a long chain at an
    // empty meter cannot drop the number onto the label underneath -- the number AND the
    // multiplier line under it. The clamp was one height for both sizes of number, and under
    // a number at scale 2 (100 floors and up) the multiplier sits 16 units down, not 9: at a
    // nearly empty meter its line ended three units inside the FLOORS label, "x11.5" printed
    // across "FLOORS". It happened for the first few floors after each step of a chain of 100
    // to 349 floors, and when the meter stopped pinning full past 350 (nextStep), on every
    // step of every long chain. Scale 2 stops four units higher, so the line ends one unit
    // clear of the label's keyline, the spacing the column keeps elsewhere.
    const fillTop = GAUGE_TOP + GAUGE_H - Math.round(GAUGE_H * frac);
    const big = c.floors >= 100 ? 2 : 1;
    const y = Math.min(GAUGE_TOP + GAUGE_H - (big === 2 ? 22 : 18), Math.max(GAUGE_TOP - 3, fillTop - 3));
    skinText(ctx, skin, 'num', String(c.floors), PLAY_L + 13, y, big, 'left');

    // The multiplier only appears once it is worth something. 'x1' on a fresh chain is
    // noise: it says nothing and it is on screen for most of every combo.
    if (c.x > 1) {
      skinText(ctx, skin, 'gold', 'x' + c.x, PLAY_L + 13, y + (big === 2 ? 16 : 9), 1, 'left');
    }

    skinText(ctx, skin, 'gold', 'FLOORS', PLAY_L + 3, GAUGE_LABEL_Y, 1, 'left');
    skinText(ctx, skin, 'ink', 'x' + next.mult + ' AT ' + next.x, PLAY_L + 3, GAUGE_LABEL_Y + 9, 1, 'left');
  }

  // --- the grand callout ----------------------------------------------------
  //
  // The only text the game shouts. It used to have five sources competing over this one
  // line -- height crossings, top speed, held-jump chains, wall-bounce runs and the
  // combo payoff -- arbitrated by a rank system. Then it fired on a combo step and nothing
  // else. Now it marks the TOWER: seven heights to a lap of the zones (game/milestones.js),
  // taking turns with the zone titles (Game.showNext), and from the second lap on with a
  // prestige badge beside the word -- drawn by the renderer over the characters, not here
  // (render/callouts.js drawCalloutBadge), so neither the Duke nor anything else covers it.
  //
  // It is lettered now, not printed: each word painted at art resolution in its own
  // treatment and in the combo trail's colours for its step (render/callouts.js), painted
  // ahead on the title screen by the renderer's floater pass, so none is built in the frame
  // it fires. The text below is only the fallback for a word with no painter.
  const lettered = game.shout && game.shoutT > 0
    && drawCallout(ctx, game.shout, CALLOUT_LIFE - game.shoutT, game.shoutT);
  if (game.shout && game.shoutT > 0 && !lettered) {
    const life = game.shoutT;
    const age = CALLOUT_LIFE - life;
    const pop = age < 0.14 ? 4 : 3;
    const a = Math.min(1, life / 0.4);
    const y = 96 - Math.round(Math.min(12, age * 30));
    // No multiplier chip. It used to print 'x50' above the word -- and the combo meter
    // on the left edge has been showing exactly that number, continuously, for the whole
    // chain. Two copies of the same figure on screen at once is not emphasis, it is
    // clutter, and it cost the callout twenty-two rows of height it did not need. The
    // word is the new information; the number is already there.
    // One pass in the zone's shout ink: it used to be white, then the accent laid over it
    // at half strength -- two full outlined copies of the word to tint it.
    ctx.globalAlpha = a;
    skinText(ctx, skin, 'shout', game.shout, VW / 2, y, pop - 1, 'center');
    ctx.globalAlpha = 1;
  }

  // --- banners (centre stack) ----------------------------------------------
  // Moved down from y=84, where the theme name announcing a new area landed on top of
  // the grand callout -- then the combo's, printed at y=82..104, and firing on exactly the
  // kind of run that crosses a theme boundary. (The callouts are the tower's heights now,
  // lettered from y=80, and take turns with the zone titles: Game.showNext.)
  //
  // A zone's name is not text any more: it is lettered in the zone's own material, painted
  // ahead while the zone before it is on screen (render/zonetitles.js), and takes its own
  // height in the stack. Anything else, and a zone without a painter, is text as before.
  // Titles go down first and the text over them: a title's glow and rays reach past its
  // letters, and drawn in stack order they crossed the line of text above it.
  // The zones' banners stack from BANNER_TOP, the herald's lines from TEXT_TOP (above).
  warmZoneTitles(game);
  const zoneAt = new Map();
  let by = BANNER_TOP;
  for (let i = game.banners.length - 1; i >= 0; i--) {
    const b = game.banners[i];
    if (b.zone === undefined) continue;
    zoneAt.set(b, by);
    by += drawZoneTitle(ctx, b, VW / 2, by) || (b.big ? 20 : 11);
  }
  let ty = Math.max(TEXT_TOP, by);
  for (let i = game.banners.length - 1; i >= 0; i--) {
    const b = game.banners[i];
    const zone = b.zone !== undefined;
    // A zone's painted title is drawn; one with no painter is its name, as text, in its place.
    if (zone && zoneTitleRows(b)) continue;
    const y = zone ? zoneAt.get(b) : ty;
    if (!zone) ty += b.big ? 20 : 11;
    const a = Math.min(1, b.life / 0.35);
    const fade = a > 0.66 ? 1 : a > 0.33 ? 0.7 : 0.4;
    if (!zone && !b.big) {
      // The herald speaks in the menus' fine lettering (menuskin.js mText), in the Duke's own
      // tinctures: argent for what was white, gold for what was a colour -- the zone's accent,
      // the ascension's pale gold. It was the font blown up flat in that colour inside a black
      // outline stamped eight times: the old lettering, under the Duke, in every zone. Each
      // glyph is one picture, its keyline with it, and no two overlap, so the stepped fade out
      // fades the line whole, where the eight outline stamps showed through one another.
      mText(ctx, heraldInk(b.colour), b.text, VW / 2, y, 'center', fade);
      continue;
    }
    ctx.globalAlpha = fade;
    drawTextOutline(ctx, b.text, VW / 2, y, b.colour, '#000000', b.big ? 2 : 1, 'center');
    ctx.globalAlpha = 1;
  }

  // --- danger warning -------------------------------------------------------
  // Only while there is time to read it and climb; see Game.climbWarning.
  if (game.climbWarning) {
    const blink = Math.sin(t * THREAT_HZ) > 0;
    if (blink) skinText(ctx, skin, 'danger', 'CLIMB!', VW / 2, VH - 32, 2, 'center');
  }
}

export function drawPerf(ctx, loop, game) {
  const lines = [
    pad(Math.round(loop.fps), 4) + ' FPS',
    loop.cpuMs.toFixed(2) + ' MS CPU',
    pad(game.particles.n, 4) + ' PARTS',
    pad(game.tower.floors.size, 4) + ' PLATS',
    'SEED ' + game.seed,
  ];
  let y = VH - 8 - lines.length * 8;
  ctx.fillStyle = '#000000aa';
  const w = Math.max(...lines.map((l) => textWidth(l))) + 6;
  ctx.fillRect(VW - w - 4, y - 3, w + 4, lines.length * 8 + 5);
  for (const l of lines) {
    drawText(ctx, l, VW - 6, y, '#8cff8c', 1, 'right');
    y += 8;
  }
}
