// Per-theme colour ramps for the speed streaks that pour down the screen as the
// player accelerates. Index 0 is calm, index 4 is blazing.
//
// Drafted by the local Qwen model; validated for monotonic brightness and saturation
// by tools/test-platstyles.mjs.

export const SPEED_RAMPS = [ {theme:"BASEMENT",ramp:["#1a1810","#7a4422","#cc7744","#e8a866","#ffe2bb"]}, {theme:"DUNGEON",ramp:["#0e1218","#1a3a4a","#3a7a8a","#6ab8c8","#c0e4e8"]}, {theme:"FOREST",ramp:["#0a1a0a","#2a6a2a","#4aaa4a","#7ae87a","#c8ffc8"]}, {theme:"SWAMP",ramp:["#141810","#3a6a2a","#66a844","#99d870","#ccf8a0"]}, {theme:"DOWNTOWN",ramp:["#1a1410","#8a4422","#e87733","#ffa055","#ffe8cc"]}, {theme:"CITADEL",ramp:["#14102a","#4a20c0","#8844ff","#bb88ff","#e8c0ff"]}, {theme:"STORM",ramp:["#151830","#3388ee","#66baff","#99ddff","#d8e8ff"]}, {theme:"ABYSS",ramp:["#08081a","#1a4a9a","#3388ff","#66b8ff","#b0e0ff"]}, {theme:"NEBULA",ramp:["#1a0a2a","#6a2aaa","#9944ee","#cc77ff","#f0c0ff"]}, {theme:"COSMOS",ramp:["#0d0f24","#3a3a99","#7755ff","#aa88ff","#e0c0ff"]}, {theme:"STARFIELD",ramp:["#0a0c14","#3a4a6a","#6688b8","#99bbdd","#d0ddf0"]}, {theme:"ZENITH",ramp:["#15151f","#4a44cc","#9977ff","#cc99ff","#ffffff"]} ];

const BY_THEME = new Map(SPEED_RAMPS.map((r) => [r.theme, r.ramp]));
export function rampFor(themeName) {
  return BY_THEME.get(themeName) || SPEED_RAMPS[0].ramp;
}
