// Open the Duke's eyes on the one front drawing that has a sword in it.
//
// The sheet has exactly one pose where he faces the viewer AND holds his blade: art 9,
// standing square on, shield up, sword held low at his side. It is the pose the idle
// wants and it is drawn with his eyes CROSSED OUT, because on the artist's sheet it was
// the death frame.
//
// Everything else about it is right, and a character standing still with no weapon in his
// hand is a worse problem than two repaired pixels. So the crosses are erased and a pair of
// open eyes is drawn where they were.
//
// FOUND, NOT TYPED. The crosses are located by looking for dark pixels ENCLOSED BY SKIN
// in the face band -- nothing else in that region satisfies that -- so a re-import that
// moves the face by a pixel still gets repaired. tools/test-sprites.mjs asserts that
// exactly two clusters are found and that they end up dark-on-skin rather than crossed.

/** Skin. The face is the only large run of these in the head band. */
const SKIN = new Set(['A', 'B']);

/**
 * The TRULY dark keys -- the cores of the crosses.
 *
 * Not every key darker than skin. The first version included the browns and golds
 * (C, E, H) and swept up the brow shading, the nose and the moustache line with them:
 * two "eye" clusters twenty-six and eighteen pixels across, spanning nine rows. Wiping
 * those would have erased most of his face.
 */
const DARK = new Set(['F', 'I', 'K', 'M']);

// The band the face occupies. Below it is beard, above it is crown, and both are made
// of the same dark keys as the crosses -- which is why this is bounded rather than run
// over the whole cell.
const BAND_TOP = 20;
const BAND_BOTTOM = 32;

/** How far a dark pixel may sit from skin on BOTH sides and still count as enclosed. */
const REACH = 4;

/**
 * The two eye clusters in one frame, as {x0, y0, x1, y1}.
 *
 * A pixel qualifies when it is dark and there is skin within REACH to its left AND to
 * its right on the same row. The beard fails that (skin on one side only, cheek), the
 * crown fails it (no skin above the brow line), and the crosses pass.
 */
export function findEyes(frame, sprW) {
  const hits = [];
  for (let y = BAND_TOP; y <= BAND_BOTTOM; y++) {
    const row = frame[y];
    if (!row) continue;
    for (let x = 1; x < sprW - 1; x++) {
      if (!DARK.has(row[x])) continue;
      let left = false, right = false;
      for (let d = 1; d <= REACH; d++) if (SKIN.has(row[x - d])) { left = true; break; }
      for (let d = 1; d <= REACH; d++) if (SKIN.has(row[x + d])) { right = true; break; }
      if (left && right) hits.push([x, y]);
    }
  }
  if (!hits.length) return [];

  // Cluster by proximity. The two eyes are several pixels apart and each cross is a
  // contiguous blob, so a simple flood over neighbours separates them.
  const seen = new Set();
  const key = (x, y) => x + ',' + y;
  const set = new Set(hits.map(([x, y]) => key(x, y)));
  const out = [];
  for (const [sx, sy] of hits) {
    if (seen.has(key(sx, sy))) continue;
    const stack = [[sx, sy]];
    seen.add(key(sx, sy));
    let x0 = sx, y0 = sy, x1 = sx, y1 = sy, n = 0;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      n++;
      if (cx < x0) x0 = cx; if (cx > x1) x1 = cx;
      if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const k = key(cx + dx, cy + dy);
          if (!set.has(k) || seen.has(k)) continue;
          seen.add(k);
          stack.push([cx + dx, cy + dy]);
        }
      }
    }
    // Two pixels is enough to be an eye. The floor was three, and it silently dropped
    // the REPAIRED right pupil: the cheek beside it is beard rather than skin on its
    // lower row, so only one of its two rows counts as enclosed.
    if (n >= 2) out.push({ x0, y0, x1, y1, n });
  }
  out.sort((a, b) => a.x0 - b.x0);
  return out;
}

/**
 * Erase the crosses and draw open eyes in their place. Returns a new frame array.
 *
 * The eye drawn is a two-by-two pupil with a lit pixel above it, which is the shape the
 * sheet's own front drawing uses -- copied in form rather than in pixels, because the
 * two heads are different widths and a transplanted patch overhangs the narrower face.
 */
export function openEyes(frames, sprW, artIndex) {
  const frame = frames[artIndex];
  if (!frame) return frames.slice();
  const eyes = findEyes(frame, sprW);
  if (eyes.length !== 2) return frames.slice();

  const rows = frame.map((r) => [...r]);
  for (const e of eyes) {
    // Wipe the cross back to skin, one pixel proud of it on every side so no stray
    // corner of the X survives against the cheek.
    for (let y = e.y0 - 1; y <= e.y1 + 1; y++) {
      for (let x = e.x0 - 1; x <= e.x1 + 1; x++) {
        if (y < 0 || y >= rows.length || x < 0 || x >= sprW) continue;
        rows[y][x] = 'B';
      }
    }
    // Then an open eye at the middle of where it was.
    const cx = Math.round((e.x0 + e.x1) / 2);
    const cy = Math.round((e.y0 + e.y1) / 2);
    for (let y = cy; y <= cy + 1; y++) {
      for (let x = cx; x <= cx + 1; x++) {
        if (y < 0 || y >= rows.length || x < 0 || x >= sprW) continue;
        rows[y][x] = 'I';
      }
    }
    // A lit lid above, which is what stops two dots reading as nostrils.
    for (let x = cx; x <= cx + 1; x++) {
      if (cy - 1 >= 0 && x < sprW) rows[cy - 1][x] = 'A';
    }
  }

  const out = frames.slice();
  out[artIndex] = rows.map((r) => r.join(''));
  return out;
}
