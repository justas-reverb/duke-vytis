// The three stages of the climb, and which zones belong to each.
//
// The music used to be one climb track for the whole tower. It is three now, one per
// stage, and this table is the ONE place that says which zone plays which. It is keyed
// by the zone's NAME, never its index: past floor 2300 every cycle of zones is a fresh
// shuffle (themes.js), so "zones 0 to 4" only means BELOW in the first cycle, and a map
// by index would play the cellar march in the heavens from the second cycle on.
//
// DOWNTOWN is BELOW on purpose. It is the town at night at the foot of the castle, the
// last of the earth before the climb reaches stone -- the user's call, "it fits better
// there". (It was called VILLAGE then; the user renamed it DOWNTOWN on 2026-09-23.)

import { THEMES, themeIndexFor, bandFor } from './themes.js';

export const STAGES = [
  {
    name: 'BELOW',
    track: 'below',
    zones: ['BASEMENT', 'DUNGEON', 'FOREST', 'SWAMP', 'DOWNTOWN'],
  },
  {
    name: 'THE WORLD ABOVE',
    track: 'above',
    zones: ['CITADEL', 'STORM', 'ABYSS'],
  },
  {
    name: 'THE HEAVENS',
    track: 'heavens',
    zones: ['NEBULA', 'COSMOS', 'STARFIELD', 'ZENITH'],
  },
];

const BY_ZONE = new Map();
for (const s of STAGES) for (const z of s.zones) BY_ZONE.set(z, s);

/**
 * The stage a zone belongs to. A zone missing from the table falls back to the first
 * stage rather than throwing mid-run; tools/test-music.mjs fails the build instead if
 * any zone in THEMES is not listed here exactly once.
 */
export function stageForZone(name) {
  return BY_ZONE.get(name) || STAGES[0];
}

/** The stage the zone at `floor` belongs to. */
export function stageAt(floor) {
  return stageForZone(THEMES[themeIndexFor(Math.max(0, floor))].name);
}

/**
 * The floor at which the run entered the stage it is in at `floor`: walk back zone by
 * zone while the zones still belong to the same stage. In the first cycle that is 0, 900
 * or 1500; in a shuffled cycle two zones of one stage can fall next to each other, and
 * even across a cycle boundary, so it has to be asked of the schedule, not worked out.
 *
 * The music's key ladder counts zones from here, so a stage always opens in its theme's
 * home key however high the tower has been climbed (see Audio.followClimb).
 */
export function stageEntry(floor) {
  const f = Math.max(0, Math.floor(floor));
  const stage = stageAt(f);
  let start = f - bandFor(f).into;
  while (start > 0 && stageAt(start - 1) === stage) {
    start = (start - 1) - bandFor(start - 1).into;
  }
  return start;
}

/**
 * Everything the music needs at once: the stage, its track, where the run entered it,
 * the zone the floor is in (its first floor, which names it uniquely however the cycles
 * shuffle), and that zone's place in the stage's run of zones -- 0 for the zone the stage
 * was entered by. The music changes key once per zone of a stage (Audio.followClimb), and
 * a run picked up mid-stage starts on the rung its place has reached.
 */
export function stageVisit(floor) {
  const f = Math.max(0, Math.floor(floor));
  const stage = stageAt(f);
  const zone = f - bandFor(f).into;
  let entry = zone, place = 0;
  while (entry > 0 && stageAt(entry - 1) === stage) {
    entry = (entry - 1) - bandFor(entry - 1).into;
    place++;
  }
  return { stage, track: stage.track, entry, zone, place };
}
