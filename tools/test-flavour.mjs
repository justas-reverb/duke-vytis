import {
  COMBO_TIERS, TAUNTS, DEATH_LINES, IDLE_LINES, SQUEEZE_CLOSING, SQUEEZE_OPENING,
} from '../src/game/flavour.js';
import { GLYPHS } from '../src/render/font.js';

let bad = 0;
const check = (label, list, maxLen) => {
  const seen = new Set();
  for (const s of list) {
    if (s.length > maxLen) { console.log(`  TOO LONG  ${label}: "${s}" (${s.length} > ${maxLen})`); bad++; }
    if (s !== s.toUpperCase()) { console.log(`  NOT UPPER ${label}: "${s}"`); bad++; }
    if (seen.has(s)) { console.log(`  DUPLICATE ${label}: "${s}"`); bad++; }
    seen.add(s);
    // Anything without a glyph renders as a hole in the HUD.
    for (const ch of s) if (!GLYPHS[ch]) { console.log(`  NO GLYPH  ${label}: "${s}" -> ${JSON.stringify(ch)}`); bad++; }
  }
  console.log(`  ${label.padEnd(12)} ${String(list.length).padStart(2)} lines, longest ${Math.max(...list.map(s => s.length))}/${maxLen}`);
};

check('taunts', TAUNTS, 22);
check('deathLines', DEATH_LINES, 28);
check('idleLines', IDLE_LINES, 24);
// Drawn through the same small banner as a taunt, so the same cap.
check('squeezeIn', SQUEEZE_CLOSING, 22);
check('squeezeOut', SQUEEZE_OPENING, 22);
// Seven, not eleven. The COMBOS BY TIER chart on the stats page slices each name to
// fit a forty-pixel bar, so anything longer is silently truncated: the first heraldic
// pass rendered PUISSANT as PUISSA and SOVEREIGN as SOVERE.
check('tierNames', COMBO_TIERS.map(t => t.name), 6);

// The defect the model actually shipped: a tier ranked above another one it reads as
// weaker, and thresholds too close together to ever be distinguishable in play.
let prev = -1;
for (const t of COMBO_TIERS) {
  if (t.min <= prev) { console.log(`  NOT ASCENDING tier ${t.name} min=${t.min} after ${prev}`); bad++; }
  prev = t.min;
}
for (let i = 1; i < COMBO_TIERS.length; i++) {
  const gap = COMBO_TIERS[i].min - COMBO_TIERS[i - 1].min;
  if (gap < 1 || (COMBO_TIERS[i].min > 20 && gap < 5)) {
    console.log(`  TIER GAP TOO TIGHT ${COMBO_TIERS[i - 1].name}->${COMBO_TIERS[i].name} (${gap})`); bad++;
  }
}

console.log(`\n  ${bad} problems`);
process.exit(bad ? 1 : 0);
