// STARFIELD: sharp white stars on deep green-black, from the backgrounds board.
//
// The board draws it as COSMOS's sky in green, so it is COSMOS's painter (starSky, in
// cosmos.js) with a green palette. But the first version was COSMOS with the colour
// swapped and two faint clusters added, and in play the clusters could not be found:
// take the hue away and the two zones were the same picture, one after the other. So the
// two skies are now built differently, not just tinted:
//
//   COSMOS     deep space -- soft dust clouds and SPARSE points
//   STARFIELD  a FIELD of stars -- no clouds at all, a dense fine field of dim points on
//              FAR, and loose star clusters on MID that read as groups
//
// The sky is taken toward the board's green-black by an even veil over FAR rather than by
// dust clouds. Clouds were the other half of the problem: over this zone's last twelve
// floors the sky crossfades three quarters of the way to ZENITH's light steel blue, and
// dark cloud shapes stood out on that as black camouflage however faint they were made.
// An even veil only darkens the crossfade; it draws no shapes on it.
//
// The theme's colours are teal rather than green (bgFar #113344, bgNear #225566), and its
// particle and text are a saturated emerald. The stars are the board's white leaning
// toward that emerald, so nothing on the layer is saturated; the theme's accent is orange
// and is left for the play.

import { mix } from './util.js';
import { starSky } from './cosmos.js';

const WHITE = '#f4fff8';
const DUST = '#010f0b';

export default starSky((th) => {
  const mint = mix(WHITE, th.particle, 0.3);
  return {
    veil: { colour: DUST, alpha: 0.3 },
    haze: [],
    far: [mix(th.bgNear, mint, 0.15), mix(th.bgNear, mint, 0.28), mix(th.bgNear, mint, 0.4)],
    mid: [mix(th.bgNear, mint, 0.65), mix(th.bgNear, mint, 0.85), mint],
    cluster: [mix(th.bgNear, mint, 0.35), mix(th.bgNear, mint, 0.5), mix(th.bgNear, mint, 0.65)],
    glint: mix(th.bgNear, mint, 0.35),
    sparkle: [WHITE, mint, mix(th.bgNear, mint, 0.6), mix(th.bgNear, mint, 0.3)],
    halo: mix(th.bgNear, mint, 0.45),
    small: [mix(mint, WHITE, 0.5), mix(th.bgNear, mint, 0.45)],
  };
}, {
  hazeCells: 3, farStars: 230, midStars: 22, midGlint: 0.35,
  clusters: 5, clusterStars: 13, sparkles: 3, nearStars: 6,
});
