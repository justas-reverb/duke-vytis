// Each milestone callout's painter: the word for one of the tower's seven heights a lap
// (game/milestones.js), lettered at art resolution in its own treatment and in the colours
// of the combo step that bears its name (kit.js STEP_BANDS). Each was the word for that
// multiplier step until the callouts moved to the tower's heights; the colours stayed with
// the steps, so SWIFT is still the trail's cyan.
//
// One module per word, as titlepaint/ has one per zone, so each can be redrawn on its own.
// A module exports paint(word), which returns:
//
//   frames   one FUNCTION per frame, called in order, one per warm step (callouts.js), each
//            returning { pix, ax, ay }: a Pix, and the pixel in it that is the word's anchor
//            (the middle of its letters, the top row of their ink). A heavy frame may be a
//            generator that yields between its passes and returns that. Frames may differ in
//            size: a pop frame painted bigger is simply a bigger Pix. frames[0] is the word
//            settled; the rest are the painter's own.
//   seq      the entrance: [[frame, seconds, dx, dy], ...] shown in turn before the word
//            settles on frame 0, each offset dx, dy art px (whole pixels, so it stays on the
//            grid). This is the slam, the slide, the rise -- never a scale.
//   over     optional [[frame, from, to], ...]: a frame laid OVER the word while the callout's
//            age is in [from, to) -- a flash of lightning
//   loop     optional [[frame, seconds], ...]: once settled, the frames shown in turn, over
//            and over, in place of frame 0 -- a flicker of flame
//   sweep    optional { frame, from, dur, band }: a band `band` px wide of `frame` crossing
//            the word left to right over `dur` seconds from age `from` -- a glint
//
// The seven are one ladder: each is heavier, hotter and brighter than the one before, from
// SWIFT's thin cyan italic to GLORY's radiant gold, so how high he has climbed can be read
// from the word's look as well as from its name.

import * as swift from './swift.js';
import * as charge from './charge.js';
import * as soaring from './soaring.js';
import * as rampage from './rampage.js';
import * as crusade from './crusade.js';
import * as thunder from './thunder.js';
import * as glory from './glory.js';

export const CALLOUT_PAINTERS = {
  SWIFT: swift,
  CHARGE: charge,
  SOARING: soaring,
  RAMPAGE: rampage,
  CRUSADE: crusade,
  THUNDER: thunder,
  GLORY: glory,
};
