// Achievements.
//
// Drafted by the local Qwen model against a fixed list of allowed stat names, then
// validated. It respected the schema perfectly -- 28 entries, every stat name spelled
// correctly, every id unique -- which is the thing it is genuinely good at. What it
// did not do was sanity-check the SEMANTICS, so the list is fixed up below.
//
// Four targets were set when the tower was a few hundred floors and a combo counted hops:
// HALFWAY at floor 60, SUMMIT SEEKER at 150, and COMBO PIONEER and COMBO LORD at 3- and
// 10-floor combos, which a single good jump earns. They now sit on the tower's own
// landmarks -- half the 2300-floor cycle, the ZENITH at 2100, the first multiplier step
// at 50 combo floors, and the 250 that earns the third air jump -- so the ladder climbs
// with the game. Ids are unchanged, so an award already won stays won.

import { derived } from './stats.js';

export const ACHIEVEMENTS = [
  { id:"first_steps", name:"FIRST STEPS", desc:"REACH FLOOR 10", stat:"bestFloor", op:">=", value:10 },
  { id:"air_time", name:"HOP TO IT", desc:"PERFORM 50 JUMPS", stat:"totalJumps", op:">=", value:50 },
  { id:"double_tap", name:"DOUBLE UP", desc:"LAND 10 DOUBLE JUMPS", stat:"totalDoubleJumps", op:">=", value:10 },
  { id:"start_line", name:"START LINE", desc:"TOTAL RUNS REACH 5", stat:"totalRuns", op:">=", value:5 },
  { id:"first_coin", name:"POCKET CHANGE", desc:"SCORE 1000", stat:"bestScore", op:">=", value:1000 },
  { id:"bounce_back", name:"BOUNCE BACK", desc:"5 WALL BOUNCES", stat:"totalWallBounces", op:">=", value:5 },
  { id:"first_view", name:"SECOND WIND", desc:"REACH THEME TWO", stat:"themesSeen", op:">=", value:2 },
  { id:"warm_up", name:"WARM UP", desc:"CLIMB 250 FLOORS", stat:"totalFloors", op:">=", value:250 },
  { id:"halfway", name:"HALFWAY", desc:"REACH FLOOR 1150", stat:"bestFloor", op:">=", value:1150 },
  { id:"combo_pioneer", name:"COMBO PIONEER", desc:"50 FLOOR COMBO", stat:"bestCombo", op:">=", value:50 },
  { id:"triple_threat", name:"TRIPLE THREAT", desc:"10 TRIPLE JUMPS", stat:"totalTripleJumps", op:">=", value:10 },
  { id:"velocity", name:"VELOCITY", desc:"HIT 200 SPEED", stat:"topSpeed", op:">=", value:200 },
  { id:"time_surf", name:"TIME SURFER", desc:"PLAY 300 SECONDS", stat:"totalPlaySeconds", op:">=", value:300 },
  { id:"pacer", name:"PACEMAKER", desc:"RUN 2000 M", stat:"totalDistance", op:">=", value:60000 },
  { id:"high_roll", name:"HIGH ROLLER", desc:"ACHIEVE 5000 SCORE", stat:"bestScore", op:">=", value:5000 },
  { id:"jump_mania", name:"JUMP MANIA", desc:"LAND 50 DOUBLE JUMPS", stat:"totalDoubleJumps", op:">=", value:50 },
  { id:"style_point", name:"STYLE POINT", desc:"8 STYLE IN A COMBO", stat:"bestComboFlair", op:">=", value:8 },
  { id:"speed_run", name:"SPEED RUN", desc:"SURVIVE 10 SECONDS", stat:"longestRunSeconds", op:">=", value:10 },
  { id:"centurion", name:"CENTURION", desc:"CLIMB TO FLOOR 100", stat:"bestFloor", op:">=", value:100 },
  { id:"frequency", name:"FREQUENCY", desc:"COMPLETE 25 RUNS", stat:"totalRuns", op:">=", value:25 },
  { id:"summit_seeker", name:"SUMMIT SEEKER", desc:"REACH THE ZENITH", stat:"bestFloor", op:">=", value:2100 },
  { id:"combo_lord", name:"COMBO LORD", desc:"250 FLOOR COMBO", stat:"bestCombo", op:">=", value:250 },
  { id:"max_thrust", name:"MAX THRUST", desc:"HIT MAXIMUM SPEED", stat:"topSpeed", op:">=", value:430 },
  { id:"triple_king", name:"TRIPLE KING", desc:"100 TRIPLE JUMPS", stat:"totalTripleJumps", op:">=", value:100 },
  { id:"score_king", name:"SCORE KING", desc:"ACHIEVE 25000 SCORE", stat:"bestScore", op:">=", value:25000 },
  { id:"old_timer", name:"OLD TIMER", desc:"PLAY FOR 3600 SECONDS", stat:"totalPlaySeconds", op:">=", value:3600 },
  { id:"endurance", name:"ENDURANCE", desc:"SURVIVE 45 SECONDS", stat:"longestRunSeconds", op:">=", value:45 },
  { id:"corner_case", name:"CORNER CASE", desc:"USE 75 WALL BOUNCES", stat:"totalWallBounces", op:">=", value:75 }
];

/** Returns ids newly unlocked by this state, and marks them in `all`. */
export function check(all) {
  const d = derived(all);
  const unlocked = [];
  for (const a of ACHIEVEMENTS) {
    if (all.achievements[a.id]) continue;
    const v = d[a.stat];
    if (typeof v === 'number' && v >= a.value) {
      all.achievements[a.id] = Date.now();
      unlocked.push(a);
    }
  }
  return unlocked;
}

export function progress(all) {
  const total = ACHIEVEMENTS.length;
  const got = ACHIEVEMENTS.filter((a) => all.achievements[a.id]).length;
  return { got, total, pct: total ? (got / total) * 100 : 0 };
}
