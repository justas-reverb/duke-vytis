// Companion speech, in Shakespearean early-modern English.
//
// Written by the local Qwen model. The voices are genuinely distinct and funny -- the
// delver bellows, the ranger is terse, the halfling thinks about lunch -- and that is
// the thing it is actually good at. It respected the schema exactly.
//
// It overran the 28-character limit it was given on eleven lines, and used commas after
// being told not to. Both of those turned out to be my over-caution rather than its
// mistake: the longest line is 30 characters, which the speech banner draws 179 units
// wide at text scale 1, inside the 298 it wraps at on a 480-unit screen, and the comma
// has a glyph. Nothing needed editing. The real limit is enforced by
// tools/test-companions.mjs against what the banner can actually fit.

const RAW = [
  { id:"pilgrim", greet:"HARK, YE CLIMBER OF HEIGHT.", cheer:["STEEP IS THY SACRED ASCENT.", "SOUL DO RISE UPWARD, PRAYEE.", "ACTIONS DO LEAD TO HEAVEN.", "NAY, PUSH FORTH WITH FAITH.", "THE STONES DO REMEMBER THEE.", "EVERY RISE DOTH BLESS THEE."], farewell:"FALLOTH I BACK, BLESS THEE." },
  { id:"archer", greet:"LO, THE BOW SINGS THY COMING.", cheer:["THE WIND HOLDS THY HAND.", "LOOSE THY BOW TOWARD HEAVEN.", "NIMBLE THY FEET MUST TREAD.", "GRASP THY STRING, PRITHEE.", "A RIVAL TO THE CLOUDS!", "PERCHANCE WE TOUCH THE SUN."], farewell:"MY STRING A BREAKETH, I FRET." },
  { id:"delver", greet:"WE HEW THE PATH! COME ALONG!", cheer:["SWING THE AXE, STRIKE TRUE!", "DEEP IN STONE WE DO DWELL.", "HA! THE ROCKS DO YIELD TO US!", "GIVE THY STOUT STAFF A SHAKE.", "WE CLIMB AS WILDE BEASTS.", "UP WE HOIST, BY THUNDER!"], farewell:"MINE ARMS A FAINT, DOWN I GO!" },
  { id:"ranger", greet:"TREAD LIGHT. THE CROWN AWAITS!", cheer:["KEEP SILENT. THE SPIRE CALLS.", "NO WORDS LOSE THE WAY.", "I GUARD THY BACK, O KIN.", "THE HORIZON BENDS TO US.", "STAND FAST. THE SUMMIT NEARS!", "MY QUEST A ENDETH. FAREWELL."], farewell:"FALLOTH I TO DUST, ADIEU." },
  { id:"halfling", greet:"HALLO! I BRING PASTRIES!", cheer:["FEAST AWAITS THEE, MY KIN!", "UP FOR LENTIL PIE, PRITHEE!", "MY BELLY SINGS AT THY CLIMB!", "MORE CANDY FOR THEE, O HERO!", "THOU HAST FAST! EAT AND CLIMB!", "DO FEAST, AND DRINK, AND GO!"], farewell:"DOWN I PLOD FOR SUGAR, AYE!" },
  { id:"maiden", greet:"I BASH THE SKY, O LITTLE ONE!", cheer:["FOLLOW THY IRON MAIDEN!", "MY SHIELD CLEAVES THE DRAFT.", "THE WALL SHALL BOW TO US!", "UPON THY SHOULDERS I STAND!", "LET THE GODS SEE US FIGHT!", "VICTORY OR DEATH! PUSH HARD!"], farewell:"MY SHIELD A DROPS! WOE ON ME!" }
];

export const COMPANION_LINES = Object.fromEntries(RAW.map((c) => [c.id, c]));
export const COMPANION_ORDER = RAW.map((c) => c.id);
