// Per-theme platform materials, so a band's floors match its sky -- as the procedural
// platforms drew them. NOTHING IN THE GAME READS THIS NOW. The painters that used
// `style` and `cap` went when the platforms became drawn art (src/render/platart.js),
// and the last reader, the renderer's per-zone `glow`, went in 0796987. What still
// imports it is tools/shot-platforms.mjs, which prints each zone's style and cap and
// swatches its `trim`, and tools/test-platstyles.mjs, which still gates the table --
// the glow rule included, for an effect that no longer exists.
//
// Drafted by the local Qwen model against a closed vocabulary (12 style names, 8 cap
// names, numeric ranges with the units spelled out -- the lesson from the achievements
// job, where unlabelled numbers came back orders of magnitude wrong). Validated by
// tools/test-platstyles.mjs.

export const PLAT_STYLES = [
{ theme:"BASEMENT", style:"stone", cap:"stud", glow:0, edge:2, speckle:0.2, trim:"#a89060" },
{ theme:"DUNGEON", style:"tomb", cap:"tomblid", glow:0, edge:2, speckle:0.1, trim:"#7d6f5a" },
{ theme:"FOREST", style:"plank", cap:"notch", glow:0, edge:2, speckle:0.25, trim:"#8f7a42" },
{ theme:"SWAMP", style:"slab", cap:"rivet", glow:0, edge:2, speckle:0.3, trim:"#6b8a5e" },
{ theme:"DOWNTOWN", style:"metal", cap:"spike", glow:0, edge:2, speckle:0.1, trim:"#b0b8c0" },
{ theme:"CITADEL", style:"rune", cap:"glow", glow:0, edge:2, speckle:0.15, trim:"#9a7dbb" },
{ theme:"STORM", style:"cloud", cap:"bevel", glow:1, edge:2, speckle:0.1, trim:"#d0d8e0" },
{ theme:"ABYSS", style:"bone", cap:"dash", glow:2, edge:3, speckle:0.25, trim:"#d9d0c4" },
{ theme:"NEBULA", style:"crystal", cap:"glow", glow:2, edge:2, speckle:0.35, trim:"#a060d0" },
{ theme:"COSMOS", style:"star", cap:"none", glow:1, edge:2, speckle:0.0, trim:"#f0e6d2" },
{ theme:"STARFIELD", style:"ice", cap:"stud", glow:2, edge:2, speckle:0.1, trim:"#a8d8ea" },
{ theme:"ZENITH", style:"energy", cap:"dash", glow:2, edge:3, speckle:0.0, trim:"#ffe082" }
];

const BY_THEME = new Map(PLAT_STYLES.map((p) => [p.theme, p]));
export function styleFor(themeName) {
  return BY_THEME.get(themeName) || PLAT_STYLES[0];
}
