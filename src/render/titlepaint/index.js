// Each zone's title painter: the zone's name, lettered in the zone's own material.
//
// One module per zone, as bgpaint/, decorpaint/ and wallpaint/ have, so each can be redrawn
// on its own. A module exports paint(word, theme), which lays the word out (util.js
// layoutWord) and returns:
//
//   plan     the layout: plan.w x plan.h is every frame's size in art pixels, plan.top the
//            row the letters' ink starts on, plan.inkH its height, plan.cuts where each
//            letter's slice of the frame begins and ends (the slices tile the width)
//   frames   one FUNCTION per frame, each returning a Pix of plan.w x plan.h, called in
//            order, one per warm step (zonetitles.js), so no single frame of play has to
//            paint the lot. A heavy one may be a generator that yields between its passes
//            and returns the Pix: each pass is then a step of its own. frames[0] is the
//            finished word; the rest are the painter's own.
//   seq      the entrance, per letter: [[frame, seconds, dy], ...] shown in turn before
//            the letter settles on frame 0, each dy art px lower (negative: higher; whole
//            pixels, so the letter stays on the grid). Empty for a word simply there.
//   stagger  seconds between one letter starting its entrance and the next
//   over     optional [[frame, from, to], ...]: a whole frame laid OVER the word while the
//            banner's age is in [from, to) -- a flash of lightning, a star lighting up
//   sweep    optional { frame, from, dur, band }: a vertical band `band` px wide of `frame`
//            crossing the word left to right over `dur` seconds from age `from` -- a glint
//
// Every frame is drawn one art pixel to one backing-store pixel, so a painter has no scale
// to get wrong: a pixel is a pixel, as in decorpaint/.

import * as basement from './basement.js';
import * as dungeon from './dungeon.js';
import * as forest from './forest.js';
import * as swamp from './swamp.js';
import * as downtown from './downtown.js';
import * as citadel from './citadel.js';
import * as storm from './storm.js';
import * as abyss from './abyss.js';
import * as nebula from './nebula.js';
import * as cosmos from './cosmos.js';
import * as starfield from './starfield.js';
import * as zenith from './zenith.js';

export const TITLE_PAINTERS = {
  BASEMENT: basement,
  DUNGEON: dungeon,
  FOREST: forest,
  SWAMP: swamp,
  DOWNTOWN: downtown,
  CITADEL: citadel,
  STORM: storm,
  ABYSS: abyss,
  NEBULA: nebula,
  COSMOS: cosmos,
  STARFIELD: starfield,
  ZENITH: zenith,
};
