"use strict";

/**
 * Playband layout system (canonical visual placement).
 *
 * Fixed neighbor pitch (independent of family):
 *   COL_PITCH — center-to-center between adjacent columns
 *   ROW_PITCH — center-to-center between vertically adjacent seats
 * Families only choose which lattice seats are occupied; they never stretch
 * sparse columns to fill the board (that caused huge empty gaps).
 *
 * Cluster is centered (and uniformly scaled down only if needed to fit).
 */

const SYSTEM_ID = "asmrPlayband";
const VERSION = 1;
const FAMILIES = Object.freeze([
  "columns",
  "honeycomb",
  "diamond",
  "wings",
  "valley",
  "pillar",
  "stagger",
  "zigzag",
  "doubleV",
  "frame",
]);
const LEGACY_FAMILY_ALIASES = Object.freeze({
  megaOrbit: "frame",
  packed: "columns",
  honeycomb: "honeycomb",
  wings: "wings",
  columns: "columns",
  alt: "stagger",
  chevron: "doubleV",
  hourglass: "doubleV",
});
const MAX_COLUMNS = 7;
/** Max bottles stacked in one column (visual rows). */
const MAX_ROWS = 5;
/**
 * Max vertical silhouette span in row-pitch units (topmost seat → bottommost).
 * Prevents diamond/stagger offsets from making the board look ~8 rows tall.
 */
const MAX_SPAN_ROWS = 5;
/** Hard cap: 7 cols × 5 rows. */
const MAX_BOTTLES = MAX_COLUMNS * MAX_ROWS;
const MARGIN = 0.05;

/** Fixed lattice pitches (normalized play-band units). */
const COL_PITCH = 0.095;
const ROW_PITCH = 0.132;
const HALF_ROW = ROW_PITCH * 0.5;

function clampPlay(value) {
  return Math.min(1 - MARGIN, Math.max(MARGIN, value));
}

function inferRole(bottle) {
  if (!bottle || typeof bottle !== "object") return "active";
  if (bottle.isMegaBottle) return "mega";
  if (bottle.isAdBottle) return "ad";
  if (bottle.isLocked) return "locked";
  if (bottle.isColorLocked) return "colorLocked";
  const colors = bottle.colorsBottomToTop;
  if (Array.isArray(colors) && colors.length === 0) return "helper";
  return "active";
}

function hashSeed(value) {
  let x = (Number(value) || 0) >>> 0;
  x = (x ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

const PREFERRED_WAVE_FAMILIES = Object.freeze(["stagger", "zigzag"]);

function eligibleFamilies(bottles) {
  const hasMega = bottles.some((bottle) => bottle && bottle.isMegaBottle);
  if (hasMega) return ["frame"];

  const n = bottles.length;
  const locks = bottles.filter((bottle) => bottle && (bottle.isLocked || bottle.isColorLocked)).length;
  const pool = [];

  // Prefer stagger/zigzag first so pack rotation and weighted picks hit them more often.
  if (n >= 24) {
    pool.push("stagger", "zigzag", "stagger", "zigzag", "doubleV", "honeycomb", "pillar", "columns", "diamond");
  } else if (n >= 18) {
    pool.push("stagger", "zigzag", "stagger", "zigzag", "doubleV", "honeycomb", "diamond", "wings", "valley", "pillar", "columns");
  } else if (n >= 12) {
    pool.push("stagger", "zigzag", "stagger", "zigzag", "doubleV", "diamond", "wings", "valley", "columns", "honeycomb");
  } else {
    pool.push("stagger", "zigzag", "columns", "diamond", "wings");
  }
  if (locks >= 2) {
    pool.push("wings", "pillar", "valley", "doubleV", "stagger", "zigzag");
  }

  // Deduplicate while preserving first-seen order (stagger/zigzag stay early).
  return [...new Set(pool)];
}

function weightedFamilyPool(pool) {
  const out = [];
  for (const family of pool) {
    const weight = PREFERRED_WAVE_FAMILIES.includes(family) ? 3 : family === "doubleV" ? 2 : 1;
    for (let i = 0; i < weight; i++) out.push(family);
  }
  return out;
}

function pickFamily(bottles, explicitFamily, seed = 0) {
  if (explicitFamily) {
    if (FAMILIES.includes(explicitFamily)) return explicitFamily;
    if (Object.prototype.hasOwnProperty.call(LEGACY_FAMILY_ALIASES, explicitFamily)) {
      return LEGACY_FAMILY_ALIASES[explicitFamily];
    }
  }

  const pool = eligibleFamilies(bottles);
  if (pool.length === 1) return pool[0];

  const weighted = weightedFamilyPool(pool);
  const idx = hashSeed(seed + bottles.length * 17) % weighted.length;
  return weighted[idx];
}

/**
 * Assign playband families across a whole pack with soft anti-repeat:
 * - never reuse the same family on consecutive levels when alternatives exist
 * - bias toward stagger/zigzag (~half of non-mega levels)
 * - keep other families from dominating
 */
function assignFamiliesForPack(levels) {
  if (!Array.isArray(levels)) throw new Error("assignFamiliesForPack: levels array required");

  const diversifiable = FAMILIES.filter((family) => family !== "frame");
  const nonMegaCount = levels.reduce((sum, level) => {
    const bottles = level.bottles || [];
    return sum + (bottles.some((bottle) => bottle && bottle.isMegaBottle) ? 0 : 1);
  }, 0);
  const preferredTarget = Math.max(2, Math.ceil(nonMegaCount * 0.55));
  const maxPerFamily = Math.max(2, Math.ceil(levels.length / Math.max(1, diversifiable.length)) + 1);
  const maxPreferred = Math.max(maxPerFamily + 2, Math.ceil(nonMegaCount * 0.4));
  const counts = Object.fromEntries(FAMILIES.map((family) => [family, 0]));
  let previous = null;

  const preferredUsed = () =>
    PREFERRED_WAVE_FAMILIES.reduce((sum, family) => sum + (counts[family] || 0), 0);

  for (const level of levels) {
    const bottles = level.bottles || [];
    const pool = eligibleFamilies(bottles);
    let family = pool[0];

    if (pool.length > 1) {
      const needPreferred = preferredUsed() < preferredTarget;
      const ranked = pool.slice().sort((left, right) => {
        const leftRepeat = left === previous ? 1 : 0;
        const rightRepeat = right === previous ? 1 : 0;
        if (leftRepeat !== rightRepeat) return leftRepeat - rightRepeat;

        const leftPreferred = PREFERRED_WAVE_FAMILIES.includes(left) ? 1 : 0;
        const rightPreferred = PREFERRED_WAVE_FAMILIES.includes(right) ? 1 : 0;
        if (needPreferred && leftPreferred !== rightPreferred) {
          return rightPreferred - leftPreferred;
        }

        const leftCap = leftPreferred ? maxPreferred : maxPerFamily;
        const rightCap = rightPreferred ? maxPreferred : maxPerFamily;
        const leftOver = counts[left] >= leftCap ? 1 : 0;
        const rightOver = counts[right] >= rightCap ? 1 : 0;
        if (leftOver !== rightOver) return leftOver - rightOver;

        // Balance stagger vs zigzag when both eligible.
        if (leftPreferred && rightPreferred && counts[left] !== counts[right]) {
          return counts[left] - counts[right];
        }

        if (counts[left] !== counts[right]) return counts[left] - counts[right];
        return hashSeed((Number(level.id) || 0) + left.length * 13)
          - hashSeed((Number(level.id) || 0) + right.length * 13);
      });
      family = ranked[0];
    }

    applyPlaybandLayout(level, { family, seed: Number(level.id) || 0 });
    counts[family] = (counts[family] || 0) + 1;
    previous = family;
  }

  return counts;
}

function slot(nx, ny, role = "active") {
  return { nx: clampPlay(nx), ny: clampPlay(ny), role };
}

function chooseColumnCountFixed(n) {
  if (n <= 0) return 1;
  if (n === 1) return 1;
  // Must be wide enough so no column exceeds MAX_ROWS.
  const minCols = Math.min(MAX_COLUMNS, Math.max(1, Math.ceil(n / MAX_ROWS)));
  let preferred = 3;
  if (n >= 16) preferred = MAX_COLUMNS;
  else if (n >= 10) preferred = 5;
  else if (n >= 5) preferred = 3;
  else preferred = Math.min(n, 3);
  let cols = Math.max(minCols, Math.min(MAX_COLUMNS, preferred));
  if (cols % 2 === 0 && cols < MAX_COLUMNS) cols += 1; // prefer odd for mirror center
  cols = Math.max(minCols, Math.min(MAX_COLUMNS, cols));
  return cols;
}

/**
 * Mirror-symmetric counts with every column ≤ MAX_ROWS.
 * Requires colCount >= ceil(n / MAX_ROWS).
 */
function distributeSymmetricColumnCounts(n, colCount) {
  const counts = Array.from({ length: colCount }, () => 0);
  if (colCount <= 0 || n <= 0) return counts;
  if (n > colCount * MAX_ROWS) {
    throw new Error(`Cannot place ${n} bottles in ${colCount} cols with max ${MAX_ROWS} rows`);
  }
  if (colCount === 1) {
    counts[0] = n;
    return counts;
  }

  const base = Math.floor(n / colCount);
  if (base > MAX_ROWS) {
    throw new Error(`base height ${base} exceeds MAX_ROWS=${MAX_ROWS}`);
  }
  for (let i = 0; i < colCount; i++) counts[i] = base;
  let rem = n - base * colCount;
  const mid = Math.floor(colCount / 2);
  const pairCount = Math.floor(colCount / 2);

  // Odd remainder must sit on the center column.
  if (colCount % 2 === 1 && rem % 2 === 1) {
    if (counts[mid] >= MAX_ROWS) {
      throw new Error("no room on center for odd remainder");
    }
    counts[mid] += 1;
    rem -= 1;
  }

  // Even extras: +1 to mirror pairs, inside → outside, wrapping until rem=0.
  let guard = 0;
  let dist = 1;
  while (rem >= 2 && guard++ < 512) {
    let L;
    let R;
    if (colCount % 2 === 1) {
      L = mid - dist;
      R = mid + dist;
    } else {
      L = pairCount - dist;
      R = colCount - 1 - L;
    }
    if (L < 0 || R >= colCount || L >= R) {
      dist = 1;
      // If all pairs are full, dump onto center by +2 when possible.
      if (colCount % 2 === 1 && counts[mid] + 2 <= MAX_ROWS) {
        counts[mid] += 2;
        rem -= 2;
        continue;
      }
      break;
    }
    if (counts[L] < MAX_ROWS && counts[R] < MAX_ROWS) {
      counts[L] += 1;
      counts[R] += 1;
      rem -= 2;
    }
    dist += 1;
    if (dist > pairCount) dist = 1;
  }

  if (rem !== 0) {
    throw new Error(`distributeSymmetricColumnCounts leftover ${rem} for n=${n} cols=${colCount}`);
  }
  for (let i = 0; i < colCount; i++) {
    if (counts[i] > MAX_ROWS) {
      throw new Error(`column ${i} count ${counts[i]} exceeds MAX_ROWS=${MAX_ROWS}`);
    }
  }
  return counts;
}

/**
 * Keep column start offsets from pushing the silhouette past MAX_SPAN_ROWS.
 * Never changes per-column bottle counts — only compresses startRows.
 */
function clampStartRows(counts, startRows) {
  const starts = counts.map((n, c) => {
    if (!n) return 0;
    const raw = startRows && startRows[c] != null ? startRows[c] : 0;
    return Math.max(0, Math.min(raw, Math.max(0, MAX_SPAN_ROWS - n)));
  });

  for (let iter = 0; iter < 16; iter++) {
    let minTop = Infinity;
    let maxBot = -Infinity;
    let active = 0;
    let sum = 0;
    for (let c = 0; c < counts.length; c++) {
      if (!counts[c]) continue;
      active += 1;
      sum += starts[c];
      minTop = Math.min(minTop, starts[c]);
      maxBot = Math.max(maxBot, starts[c] + counts[c] - 1);
    }
    if (active === 0 || maxBot - minTop <= MAX_SPAN_ROWS - 1 + 1e-6) break;
    const mean = sum / active;
    for (let c = 0; c < starts.length; c++) {
      if (!counts[c]) {
        starts[c] = 0;
        continue;
      }
      starts[c] = mean + (starts[c] - mean) * 0.5;
      starts[c] = Math.max(0, Math.min(starts[c], MAX_SPAN_ROWS - counts[c]));
    }
  }

  let minS = Infinity;
  for (let c = 0; c < counts.length; c++) {
    if (!counts[c]) continue;
    minS = Math.min(minS, starts[c]);
  }
  if (!Number.isFinite(minS)) minS = 0;
  return starts.map((value, c) => (counts[c] ? value - minS : 0));
}

function measureSeatSpan(seats) {
  if (!seats.length) return 0;
  let minR = Infinity;
  let maxR = -Infinity;
  for (const seat of seats) {
    minR = Math.min(minR, seat.row);
    maxR = Math.max(maxR, seat.row);
  }
  return maxR - minR;
}

/**
 * Build raw lattice seats then center + uniform-fit.
 * @param {number} cols
 * @param {number[]} counts bottles per column (mirror-symmetric)
 * @param {{ staggerOdd?: boolean, startRows?: number[], halfRowCenter?: boolean }} [options]
 *   startRows[c] — row offset for top of column stack (silhouette only)
 */
function latticeFromCounts(cols, counts, options = {}) {
  const {
    staggerOdd = false,
    startRows = null,
    halfRowCenter = false,
    megaAtCenter = false,
  } = options;

  const mid = (cols - 1) / 2;
  const fittedStarts = clampStartRows(counts, startRows || counts.map(() => 0));
  // Half-row stagger is free only when the column still fits MAX_SPAN_ROWS.
  const allowOddStagger = staggerOdd && counts.every((n) => !n || n < MAX_SPAN_ROWS);
  const seats = []; // { col, row (float), role }

  for (let c = 0; c < cols; c++) {
    const n = counts[c] || 0;
    if (n <= 0) continue;
    const start = fittedStarts[c] || 0;
    let stagger = 0;
    if (allowOddStagger && c % 2 === 1) stagger = 0.5;
    if (halfRowCenter && Math.abs(c - mid) < 0.01) stagger = 0.5;

    for (let r = 0; r < n; r++) {
      const row = start + r + stagger;
      const isMega = megaAtCenter && Math.abs(c - mid) < 0.01 && r === Math.floor((n - 1) / 2);
      seats.push({ col: c, row, role: isMega ? "mega" : "active" });
    }
  }

  if (measureSeatSpan(seats) > MAX_SPAN_ROWS - 1 + 0.51) {
    // Drop odd-column half stagger if span still too tall.
    for (const seat of seats) {
      if (allowOddStagger && seat.col % 2 === 1) seat.row -= 0.5;
    }
  }

  return seatsToCenteredSlots(seats, cols);
}

function seatsToCenteredSlots(seats, cols) {
  if (seats.length === 0) return [];

  // Local lattice coordinates (not yet normalized to play-band).
  const raw = seats.map((seat) => ({
    x: (seat.col - (cols - 1) / 2) * COL_PITCH,
    y: -seat.row * ROW_PITCH, // row 0 at top of local stack space
    role: seat.role || "active",
  }));

  // Shift so top row (max y) and geometry are easier to center.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of raw) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;

  let placed = raw.map((p) => ({
    nx: 0.5 + (p.x - cx),
    ny: 0.5 + (p.y - cy),
    role: p.role,
  }));

  // Uniform scale if cluster exceeds play-band (keeps neighbor pitch ratio fixed).
  minX = Infinity;
  maxX = -Infinity;
  minY = Infinity;
  maxY = -Infinity;
  for (const p of placed) {
    minX = Math.min(minX, p.nx);
    maxX = Math.max(maxX, p.nx);
    minY = Math.min(minY, p.ny);
    maxY = Math.max(maxY, p.ny);
  }
  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);
  const avail = 1 - 2 * MARGIN;
  const scale = Math.min(1, avail / spanX, avail / spanY);
  if (scale < 0.999) {
    placed = placed.map((p) => ({
      nx: 0.5 + (p.nx - 0.5) * scale,
      ny: 0.5 + (p.ny - 0.5) * scale,
      role: p.role,
    }));
  }

  return placed.map((p) => slot(p.nx, p.ny, p.role));
}

function mirrorStartRows(cols, leftStarts) {
  // leftStarts length = ceil(cols/2) covering left..center
  const startRows = Array.from({ length: cols }, () => 0);
  const mid = Math.floor(cols / 2);
  for (let i = 0; i <= mid; i++) {
    const v = leftStarts[i] != null ? leftStarts[i] : 0;
    startRows[i] = v;
    startRows[cols - 1 - i] = v;
  }
  return startRows;
}

function ovalSlots(totalCount) {
  const cols = chooseColumnCountFixed(totalCount);
  const counts = distributeSymmetricColumnCounts(totalCount, cols);
  // Center-align stacks: pad start so each column's midpoint shares same row center.
  const maxCount = Math.max(...counts, 1);
  const startRows = counts.map((n) => (maxCount - n) * 0.5);
  return latticeFromCounts(cols, counts, { startRows });
}

function honeycombSlots(totalCount) {
  const cols = chooseColumnCountFixed(Math.max(totalCount, 14));
  const counts = distributeSymmetricColumnCounts(totalCount, cols);
  const mid = (cols - 1) / 2;
  // Mild diamond start only — keep total span ≤ MAX_SPAN_ROWS.
  const startRows = counts.map((n, c) => Math.min(0.5, Math.abs(c - mid) * 0.25));
  return latticeFromCounts(cols, counts, { startRows, staggerOdd: true });
}

function diamondSlots(totalCount) {
  const cols = chooseColumnCountFixed(totalCount);
  const counts = distributeSymmetricColumnCounts(totalCount, cols);
  const mid = (cols - 1) / 2;
  // Was |c-mid| (up to 3) → ~8-row silhouette; cap amplitude at 1.
  const startRows = counts.map((n, c) => Math.min(1, Math.abs(c - mid) * 0.5));
  return latticeFromCounts(cols, counts, { startRows, staggerOdd: true });
}

function wingsSlots(totalCount) {
  const cols = chooseColumnCountFixed(totalCount);
  const centerIdx = Math.floor(cols / 2);
  let connectorBudget = totalCount >= 18 ? 2 : totalCount >= 12 ? 1 : 0;
  let nonCenter = totalCount - connectorBudget;
  if (nonCenter % 2 === 1) {
    connectorBudget += 1;
    nonCenter -= 1;
  }
  connectorBudget = Math.min(connectorBudget, MAX_ROWS);
  const sideCounts = distributeSymmetricColumnCounts(nonCenter, cols - 1);
  const counts = Array.from({ length: cols }, () => 0);
  let s = 0;
  for (let c = 0; c < cols; c++) {
    if (c === centerIdx) counts[c] = connectorBudget;
    else counts[c] = sideCounts[s++] || 0;
  }
  let sum = counts.reduce((a, b) => a + b, 0);
  while (sum < totalCount && counts[centerIdx] < MAX_ROWS) {
    counts[centerIdx] += 1;
    sum += 1;
  }
  while (sum > totalCount && counts[centerIdx] > 0) {
    counts[centerIdx] -= 1;
    sum -= 1;
  }

  const maxSide = Math.max(...counts.filter((_, i) => i !== centerIdx), 1);
  const startRows = counts.map((n, c) => {
    if (c === centerIdx) return 0.5;
    return (maxSide - n) * 0.5;
  });
  return latticeFromCounts(cols, counts, { startRows });
}

function valleySlots(totalCount) {
  const cols = chooseColumnCountFixed(totalCount);
  const counts = distributeSymmetricColumnCounts(totalCount, cols);
  const mid = (cols - 1) / 2;
  // Twin peaks with shallow center dip — amplitude ≤ 1 row.
  const startRows = counts.map((n, c) => {
    const dist = Math.abs(c - mid);
    if (dist < 0.01) return 1;
    if (dist <= 1.01) return 0;
    return Math.min(1, dist * 0.35);
  });
  return latticeFromCounts(cols, counts, { startRows, staggerOdd: true });
}

/** Alternating half-row column stagger (so le xen kẽ), no tall silhouette. */
function staggerSlots(totalCount) {
  const cols = chooseColumnCountFixed(totalCount);
  const counts = distributeSymmetricColumnCounts(totalCount, cols);
  const maxCount = Math.max(...counts, 1);
  const startRows = counts.map((n) => (maxCount - n) * 0.5);
  return latticeFromCounts(cols, counts, { startRows, staggerOdd: true });
}

/**
 * Mirror-safe zigzag: even columns high, odd columns one row lower
 * (pattern 0,1,0,1,0 on odd column counts).
 */
function zigzagSlots(totalCount) {
  const cols = chooseColumnCountFixed(totalCount);
  const counts = distributeSymmetricColumnCounts(totalCount, cols);
  const maxCount = Math.max(...counts, 1);
  const startRows = counts.map((n, c) => {
    const zig = c % 2; // 0 or 1 — mirror-safe on odd col counts
    return zig + (maxCount - n) * 0.5;
  });
  return latticeFromCounts(cols, counts, { startRows });
}

/**
 * Two interlocking Vs (∧ pointing up + ∨ pointing down) → X / hourglass seats.
 * Prefer diagonal arms when sparse; fall back to packed hourglass columns when dense.
 */
function doubleVPacked(totalCount, cols) {
  const counts = distributeSymmetricColumnCounts(totalCount, cols);
  const mid = (cols - 1) / 2;
  // Hourglass waist: center offset lower on band, outer / near-outer complementary.
  const startRows = counts.map((n, c) => {
    const d = Math.abs(c - mid);
    if (d < 0.01) return 1;
    if (d <= 1.01) return 0.5;
    if (d <= 2.01) return 0;
    return 0.5;
  });
  return latticeFromCounts(cols, counts, { startRows, staggerOdd: true });
}

function doubleVSlots(totalCount) {
  let cols = chooseColumnCountFixed(Math.max(totalCount, 12));
  if (cols % 2 === 0 && cols < MAX_COLUMNS) cols += 1;
  cols = Math.min(MAX_COLUMNS, Math.max(3, cols));
  if (totalCount > cols * MAX_ROWS) {
    throw new Error(`doubleV cannot place ${totalCount} in ${cols}×${MAX_ROWS}`);
  }

  // Near-full boards cannot leave an odd side hole — use packed hourglass.
  if (totalCount >= cols * MAX_ROWS - 3) {
    return doubleVPacked(totalCount, cols);
  }

  const mid = (cols - 1) / 2;
  const centerCol = Math.floor(mid);
  const candidates = [];
  for (let c = 0; c < cols; c++) {
    const d = Math.abs(c - mid);
    for (let r = 0; r < MAX_ROWS; r++) {
      const distDownV = Math.abs(r - d);
      const distUpV = Math.abs(r - ((MAX_ROWS - 1) - d));
      const onArm = Math.min(distDownV, distUpV);
      candidates.push({ col: c, row: r, priority: onArm + d * 0.01 });
    }
  }
  candidates.sort((a, b) => a.priority - b.priority || a.row - b.row || a.col - b.col);

  const taken = new Set();
  const seats = [];
  const key = (c, r) => `${c},${r}`;

  const tryTake = (c, r) => {
    const c2 = cols - 1 - c;
    if (c === c2) {
      if (taken.has(key(c, r))) return false;
      if (seats.length + 1 > totalCount) return false;
      taken.add(key(c, r));
      seats.push({ col: c, row: r, role: "active" });
      return true;
    }
    if (taken.has(key(c, r)) || taken.has(key(c2, r))) return false;
    if (seats.length + 2 > totalCount) return false;
    taken.add(key(c, r));
    taken.add(key(c2, r));
    seats.push({ col: c, row: r, role: "active" });
    seats.push({ col: c2, row: r, role: "active" });
    return true;
  };

  // Keep side seats even: when remaining is odd, take a center seat first.
  while (seats.length < totalCount) {
    const remaining = totalCount - seats.length;
    let added = false;
    if (remaining % 2 === 1) {
      for (const cand of candidates) {
        if (cand.col !== centerCol) continue;
        if (tryTake(cand.col, cand.row)) {
          added = true;
          break;
        }
      }
    }
    if (!added) {
      for (const cand of candidates) {
        if (cand.col > mid) continue;
        if (remaining === 1 && cand.col !== centerCol) continue;
        if (tryTake(cand.col, cand.row)) {
          added = true;
          break;
        }
      }
    }
    if (!added) return doubleVPacked(totalCount, cols);
  }

  return seatsToCenteredSlots(seats, cols);
}

function pillarSlots(totalCount) {
  const cols = chooseColumnCountFixed(totalCount);
  const centerIdx = Math.floor(cols / 2);
  if (cols % 2 === 0) return ovalSlots(totalCount);

  // Center may be denser, but never taller than MAX_ROWS.
  let centerN = Math.min(MAX_ROWS, Math.max(2, Math.round(totalCount * 0.22)));
  if ((totalCount - centerN) % 2 === 1) {
    if (centerN < MAX_ROWS) centerN += 1;
    else centerN -= 1;
  }
  centerN = Math.min(centerN, MAX_ROWS, totalCount - (cols - 1));
  const sideN = totalCount - centerN;
  const sideCounts = distributeSymmetricColumnCounts(sideN, cols - 1);
  const counts = Array.from({ length: cols }, () => 0);
  let s = 0;
  for (let c = 0; c < cols; c++) {
    if (c === centerIdx) counts[c] = centerN;
    else counts[c] = sideCounts[s++] || 0;
  }
  const startRows = counts.map((n) => (centerN - n) * 0.5);
  return latticeFromCounts(cols, counts, { startRows });
}

function frameSlots(totalCount, hasMega) {
  if (hasMega) return frameSlotsWithMega(totalCount);

  const cols = chooseColumnCountFixed(totalCount);
  const centerIdx = Math.floor(cols / 2);
  const counts = distributeSymmetricColumnCounts(totalCount, cols);
  // Keep center lighter (void-ish): move extras to outer pairs when possible.
  if (cols >= 5 && counts[centerIdx] > 2) {
    let spill = counts[centerIdx] - 2;
    counts[centerIdx] = 2;
    const pairCount = Math.floor(cols / 2);
    let guard = 0;
    while (spill >= 2 && guard++ < 64) {
      let moved = false;
      for (let i = 0; i < pairCount && spill >= 2; i++) {
        if (counts[i] >= MAX_ROWS || counts[cols - 1 - i] >= MAX_ROWS) continue;
        counts[i] += 1;
        counts[cols - 1 - i] += 1;
        spill -= 2;
        moved = true;
      }
      if (!moved) break;
    }
    while (spill > 0 && counts[centerIdx] < MAX_ROWS) {
      counts[centerIdx] += 1;
      spill -= 1;
    }
  }

  const maxCount = Math.max(...counts, 1);
  const startRows = counts.map((n, c) => {
    if (c === centerIdx) {
      // Split feeling: push center seats toward extremes by starting lower if 2.
      return n <= 2 ? maxCount * 0.25 : (maxCount - n) * 0.5;
    }
    return (maxCount - n) * 0.5;
  });
  return latticeFromCounts(cols, counts, { startRows });
}

function frameSlotsWithMega(totalCount) {
  const satellites = Math.max(0, totalCount - 1);
  if (satellites === 0) {
    return [slot(0.5, 0.5, "mega")];
  }

  let cols = satellites >= 14 ? 7 : satellites >= 8 ? 5 : 3;
  cols = Math.min(cols, MAX_COLUMNS);
  if (cols % 2 === 0) cols -= 1;
  cols = Math.max(3, cols);
  const centerIdx = Math.floor(cols / 2);

  let sideN = satellites;
  let centerExtras = 0;
  if (sideN % 2 === 1) {
    centerExtras = 1;
    sideN -= 1;
  }
  const sideCounts = distributeSymmetricColumnCounts(sideN, cols - 1);
  const counts = Array.from({ length: cols }, () => 0);
  let s = 0;
  for (let c = 0; c < cols; c++) {
    if (c === centerIdx) counts[c] = 1 + centerExtras;
    else counts[c] = sideCounts[s++] || 0;
  }

  const maxSide = Math.max(...counts.filter((_, i) => i !== centerIdx), 1);
  const startRows = counts.map((n, c) => {
    if (c === centerIdx) return (maxSide - n) * 0.5;
    return (maxSide - n) * 0.5;
  });

  // Place mega as middle seat of center column.
  const seats = [];
  const mid = (cols - 1) / 2;
  for (let c = 0; c < cols; c++) {
    const n = counts[c];
    const start = startRows[c] || 0;
    for (let r = 0; r < n; r++) {
      const isMega = c === centerIdx && r === Math.floor((n - 1) / 2);
      seats.push({ col: c, row: start + r, role: isMega ? "mega" : "active" });
    }
  }
  return seatsToCenteredSlots(seats, cols);
}

function buildFamilySlots(family, totalCount, hasMega) {
  if (totalCount > MAX_BOTTLES) {
    throw new Error(`bottle count ${totalCount} exceeds MAX_BOTTLES=${MAX_BOTTLES} (max ${MAX_COLUMNS}×${MAX_ROWS})`);
  }
  if (hasMega || family === "frame") {
    if (hasMega) return frameSlotsWithMega(totalCount);
    return frameSlots(totalCount, false);
  }
  switch (family) {
    case "honeycomb":
      return honeycombSlots(totalCount);
    case "diamond":
      return diamondSlots(totalCount);
    case "wings":
      return wingsSlots(totalCount);
    case "valley":
      return valleySlots(totalCount);
    case "pillar":
      return pillarSlots(totalCount);
    case "stagger":
      return staggerSlots(totalCount);
    case "zigzag":
      return zigzagSlots(totalCount);
    case "doubleV":
      return doubleVSlots(totalCount);
    case "columns":
    default:
      return ovalSlots(totalCount);
  }
}

function countColumns(slots) {
  const xs = [];
  for (const entry of slots) {
    const hit = xs.find((x) => Math.abs(x - entry.nx) < 0.02);
    if (hit === undefined) xs.push(entry.nx);
  }
  return xs.length;
}

/** Median adjacent-column nx delta (for boardLayout + runtime). */
function measureColPitch(slots) {
  const cols = groupSlotsByColumn(slots)
    .map((col) => col[0].nx)
    .sort((a, b) => a - b);
  if (cols.length < 2) return COL_PITCH;
  const gaps = [];
  for (let i = 1; i < cols.length; i++) gaps.push(cols[i] - cols[i - 1]);
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] || COL_PITCH;
}

/** Median same-column vertical neighbor gap. */
function measureRowPitch(slots) {
  const columns = groupSlotsByColumn(slots);
  const gaps = [];
  for (const col of columns) {
    const ys = col.map((e) => e.ny).sort((a, b) => b - a);
    for (let i = 1; i < ys.length; i++) {
      const d = Math.abs(ys[i - 1] - ys[i]);
      if (d > 0.02) gaps.push(d);
    }
  }
  if (gaps.length === 0) return ROW_PITCH;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] || ROW_PITCH;
}

function reserveIntegratedAdSlots(slots, adCount) {
  if (adCount <= 0) return [];
  const pool = slots.slice();
  const columns = groupSlotsByColumn(pool);
  columns.sort((a, b) => a[0].nx - b[0].nx);

  const chosen = [];
  const used = new Set();

  if (columns.length >= 2) {
    const left = columns[0].slice().sort((a, b) => a.ny - b.ny);
    const right = columns[columns.length - 1];
    // Prefer lower seats on outer columns.
    for (const leftSeat of left) {
      if (chosen.length >= adCount) break;
      if (leftSeat.role === "mega") continue;
      const mirror = right.find((entry) =>
        Math.abs(entry.ny - leftSeat.ny) < 0.02
        && entry.role !== "mega"
        && !used.has(keyOf(entry)));
      if (!mirror || used.has(keyOf(leftSeat))) continue;
      chosen.push({ ...leftSeat, role: "ad" });
      used.add(keyOf(leftSeat));
      if (chosen.length < adCount) {
        chosen.push({ ...mirror, role: "ad" });
        used.add(keyOf(mirror));
      }
    }
  }

  if (chosen.length < adCount) {
    const remaining = pool
      .filter((entry) => !used.has(keyOf(entry)) && entry.role !== "mega")
      .sort((a, b) => Math.abs(b.nx - 0.5) - Math.abs(a.nx - 0.5) || a.ny - b.ny);
    for (const entry of remaining) {
      if (chosen.length >= adCount) break;
      chosen.push({ ...entry, role: "ad" });
      used.add(keyOf(entry));
    }
  }

  return chosen.slice(0, adCount);
}

function keyOf(entry) {
  return `${entry.nx.toFixed(4)},${entry.ny.toFixed(4)}`;
}

function groupSlotsByColumn(slots, epsilon = 0.025) {
  const sorted = slots.slice().sort((a, b) => a.nx - b.nx || b.ny - a.ny);
  const columns = [];
  for (const entry of sorted) {
    const col = columns.find((group) => Math.abs(group[0].nx - entry.nx) <= epsilon);
    if (col) col.push(entry);
    else columns.push([entry]);
  }
  return columns;
}

function takeSlot(slots, preferredRole) {
  const exact = slots.findIndex((entry) => entry.role === preferredRole);
  if (exact >= 0) return slots.splice(exact, 1)[0];
  if (preferredRole === "locked" || preferredRole === "colorLocked") {
    let best = 0;
    for (let i = 1; i < slots.length; i++) {
      if (slots[i].ny > slots[best].ny) best = i;
    }
    return slots.splice(best, 1)[0];
  }
  if (preferredRole === "helper") {
    let best = 0;
    let bestScore = Infinity;
    for (let i = 0; i < slots.length; i++) {
      const score = Math.abs(slots[i].ny - 0.45) + Math.abs(slots[i].nx - 0.5) * 0.35;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return slots.splice(best, 1)[0];
  }
  if (preferredRole === "ad") {
    let best = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < slots.length; i++) {
      const score = Math.abs(slots[i].nx - 0.5) * 2 - slots[i].ny;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return slots.splice(best, 1)[0];
  }
  return slots.shift();
}

/**
 * @param {object} level
 * @param {{ family?: string, seed?: number }} [options]
 */
function applyPlaybandLayout(level, options = {}) {
  if (!level || !Array.isArray(level.bottles) || level.bottles.length === 0) {
    throw new Error("applyPlaybandLayout: level.bottles required");
  }

  const bottles = level.bottles;
  const roles = bottles.map(inferRole);
  const seed = options.seed != null ? options.seed : (Number(level.id) || 0);
  const family = pickFamily(bottles, options.family, seed);
  const adIndexes = bottles.map((_, index) => index).filter((index) => roles[index] === "ad");
  const hasMega = roles.includes("mega");

  const slots = buildFamilySlots(family, bottles.length, hasMega);
  if (slots.length !== bottles.length) {
    throw new Error(`family ${family} produced ${slots.length} slots for ${bottles.length} bottles`);
  }
  const colCount = countColumns(slots);
  if (colCount > MAX_COLUMNS) {
    throw new Error(`column count ${colCount} exceeds MAX_COLUMNS=${MAX_COLUMNS}`);
  }

  const adSeats = reserveIntegratedAdSlots(slots, adIndexes.length);
  const adKeys = new Set(adSeats.map(keyOf));
  const freeSlots = slots.filter((entry) => !adKeys.has(keyOf(entry)));
  const assigned = new Array(bottles.length);

  for (let a = 0; a < adIndexes.length; a++) {
    const index = adIndexes[a];
    const chosen = adSeats[a] || takeSlot(freeSlots, "ad");
    if (!chosen) throw new Error("No integrated ad slot left");
    assigned[index] = { role: "ad", nx: chosen.nx, ny: chosen.ny };
  }

  for (const role of ["mega", "locked", "colorLocked", "helper", "active"]) {
    for (let index = 0; index < bottles.length; index++) {
      if (roles[index] !== role) continue;
      const chosen = takeSlot(freeSlots, role);
      if (!chosen) throw new Error(`No slot left for role ${role}`);
      assigned[index] = { role, nx: chosen.nx, ny: chosen.ny };
    }
  }

  for (let index = 0; index < bottles.length; index++) {
    const place = assigned[index];
    if (!place) throw new Error(`Bottle ${index} missing placement`);
    bottles[index].layoutRole = place.role;
    bottles[index].layoutPosition = {
      nx: Number(place.nx.toFixed(4)),
      ny: Number(place.ny.toFixed(4)),
    };
  }

  const finalSlots = bottles.map((b) => ({
    nx: b.layoutPosition.nx,
    ny: b.layoutPosition.ny,
  }));

  level.boardLayout = {
    system: SYSTEM_ID,
    family,
    version: VERSION,
    maxColumns: MAX_COLUMNS,
    maxRows: MAX_ROWS,
    maxSpanRows: MAX_SPAN_ROWS,
    columnCount: colCount,
    colPitch: Number(measureColPitch(finalSlots).toFixed(4)),
    rowPitch: Number(measureRowPitch(finalSlots).toFixed(4)),
  };

  if (Object.prototype.hasOwnProperty.call(level, "layoutGrid")) delete level.layoutGrid;
  for (const bottle of bottles) {
    if (!bottle || typeof bottle !== "object") continue;
    if (Object.prototype.hasOwnProperty.call(bottle, "gridPosition")) delete bottle.gridPosition;
  }

  return level;
}

function validatePlaybandLevel(level) {
  const errors = [];
  if (!level?.boardLayout || level.boardLayout.system !== SYSTEM_ID) {
    errors.push("boardLayout.system must be asmrPlayband");
    return errors;
  }
  const family = level.boardLayout.family;
  if (!FAMILIES.includes(family) && !Object.prototype.hasOwnProperty.call(LEGACY_FAMILY_ALIASES, family)) {
    errors.push(`unknown family ${family}`);
  }
  const bottles = level.bottles || [];
  const seen = new Set();
  const xs = [];
  for (let i = 0; i < bottles.length; i++) {
    const pos = bottles[i]?.layoutPosition;
    if (!pos || typeof pos.nx !== "number" || typeof pos.ny !== "number") {
      errors.push(`bottle ${i + 1}: missing layoutPosition`);
      continue;
    }
    if (pos.nx < 0 || pos.nx > 1 || pos.ny < 0 || pos.ny > 1) {
      errors.push(`bottle ${i + 1}: layoutPosition out of [0,1]`);
    }
    const key = `${pos.nx.toFixed(3)},${pos.ny.toFixed(3)}`;
    if (seen.has(key)) errors.push(`bottle ${i + 1}: duplicate layoutPosition ${key}`);
    seen.add(key);
    if (!xs.some((x) => Math.abs(x - pos.nx) < 0.02)) xs.push(pos.nx);
  }
  if (xs.length > MAX_COLUMNS) {
    errors.push(`column count ${xs.length} exceeds max ${MAX_COLUMNS}`);
  }
  const columns = groupSlotsByColumn(bottles.map((b) => ({
    nx: b.layoutPosition.nx,
    ny: b.layoutPosition.ny,
  })));
  for (const col of columns) {
    if (col.length > MAX_ROWS) {
      errors.push(`column height ${col.length} exceeds maxRows ${MAX_ROWS}`);
    }
  }
  const pitch = level.boardLayout.rowPitch || ROW_PITCH;
  let minNy = Infinity;
  let maxNy = -Infinity;
  for (const bottle of bottles) {
    const ny = bottle.layoutPosition?.ny;
    if (typeof ny !== "number") continue;
    minNy = Math.min(minNy, ny);
    maxNy = Math.max(maxNy, ny);
  }
  if (Number.isFinite(minNy) && Number.isFinite(maxNy) && pitch > 1e-6) {
    const spanUnits = (maxNy - minNy) / pitch;
    // Allow tiny float + half-row stagger slack (≤ MAX_SPAN_ROWS - 1 + 0.6).
    if (spanUnits > MAX_SPAN_ROWS - 1 + 0.65) {
      errors.push(`silhouette span ${spanUnits.toFixed(2)} row-units exceeds maxSpanRows=${MAX_SPAN_ROWS}`);
    }
  }
  return errors;
}

function assertMirrorRows(level, label) {
  const bottles = level.bottles;
  for (const bottle of bottles) {
    const nx = bottle.layoutPosition.nx;
    const ny = bottle.layoutPosition.ny;
    if (Math.abs(nx - 0.5) <= 0.02) continue;
    const mirrored = bottles.some((other) =>
      Math.abs(other.layoutPosition.nx - (1 - nx)) < 0.03
      && Math.abs(other.layoutPosition.ny - ny) < 0.025);
    if (!mirrored) {
      throw new Error(`${label}: missing L/R mirror seat for (${nx}, ${ny})`);
    }
  }
}

function assertFixedPitch(level, label) {
  const slots = level.bottles.map((b) => ({
    nx: b.layoutPosition.nx,
    ny: b.layoutPosition.ny,
  }));
  const columns = groupSlotsByColumn(slots);
  // Same-column adjacent gaps should be nearly equal (allow half-row *1 or *2 for intentional skips).
  for (const col of columns) {
    const ys = col.map((e) => e.ny).sort((a, b) => b - a);
    for (let i = 1; i < ys.length; i++) {
      const d = ys[i - 1] - ys[i];
      const units = d / (level.boardLayout.rowPitch || ROW_PITCH);
      const nearest = Math.round(units * 2) / 2; // allow 0.5 steps
      if (Math.abs(units - nearest) > 0.2) {
        throw new Error(`${label}: non-lattice vertical gap ${d} (units=${units})`);
      }
    }
  }
}

function selfTest() {
  const baseBottles = (n) => {
    const bottles = Array.from({ length: n }, (_, i) => ({
      capacity: 4,
      colorsBottomToTop: i % 5 === 0 ? [] : [0, 1, 2, 3],
    }));
    if (n >= 4) {
      bottles[n - 1].isAdBottle = true;
      bottles[n - 1].colorsBottomToTop = [];
      bottles[n - 2].isAdBottle = true;
      bottles[n - 2].colorsBottomToTop = [];
    }
    return bottles;
  };

  for (const family of FAMILIES) {
    const bottles = family === "frame"
      ? [
        { isMegaBottle: true, capacity: 16, colorsBottomToTop: [] },
        ...baseBottles(14),
      ]
      : baseBottles(family === "pillar" ? 28 : 22);
    const level = { id: 100 + FAMILIES.indexOf(family), bottles: bottles.map((b) => ({ ...b })) };
    applyPlaybandLayout(level, { family });
    const errors = validatePlaybandLevel(level);
    if (errors.length) throw new Error(`${family}: ${errors.join("; ")}`);
    if (level.boardLayout.family !== family) {
      throw new Error(`${family}: stored family mismatch`);
    }
    assertMirrorRows(level, family);
    assertFixedPitch(level, family);

    const columns = groupSlotsByColumn(level.bottles.map((b) => ({
      nx: b.layoutPosition.nx,
      ny: b.layoutPosition.ny,
    })));
    for (const col of columns) {
      if (col.length > MAX_ROWS) {
        throw new Error(`${family}: column height ${col.length} exceeds MAX_ROWS=${MAX_ROWS}`);
      }
    }
    const allNy = level.bottles.map((b) => b.layoutPosition.ny);
    const spanUnits = (Math.max(...allNy) - Math.min(...allNy)) / (level.boardLayout.rowPitch || ROW_PITCH);
    if (spanUnits > MAX_SPAN_ROWS - 1 + 0.65) {
      throw new Error(`${family}: silhouette span ${spanUnits.toFixed(2)} exceeds MAX_SPAN_ROWS=${MAX_SPAN_ROWS}`);
    }
    const pitch = level.boardLayout.rowPitch || ROW_PITCH;
    for (const col of columns) {
      const ys = col.map((e) => e.ny).sort((a, b) => b - a);
      for (let i = 1; i < ys.length; i++) {
        if (ys[i - 1] - ys[i] > pitch * 2.6) {
          throw new Error(`${family}: oversized vertical gap in column`);
        }
      }
    }
  }

  const seen = new Set();
  for (let id = 1; id <= 30; id++) {
    const level = { id, bottles: baseBottles(20).map((b) => ({ ...b })) };
    applyPlaybandLayout(level);
    seen.add(level.boardLayout.family);
    assertMirrorRows(level, `auto-${id}`);
  }
  if (seen.size < 3) {
    throw new Error(`expected layout variety, got ${[...seen].join(",")}`);
  }

  for (let n = 1; n <= MAX_BOTTLES; n++) {
    const level = {
      id: n,
      bottles: Array.from({ length: n }, (_, i) => ({
        capacity: 4,
        colorsBottomToTop: i % 5 === 0 ? [] : [0, 1, 2, 3],
      })),
    };
    applyPlaybandLayout(level);
    const cols = groupSlotsByColumn(level.bottles.map((b) => b.layoutPosition));
    if (cols.length > MAX_COLUMNS) throw new Error(`n=${n} too many columns`);
    for (const col of cols) {
      if (col.length > MAX_ROWS) throw new Error(`n=${n} column taller than ${MAX_ROWS}`);
    }
    if (n >= 3) assertMirrorRows(level, `n=${n}`);
  }

  const packLevels = Array.from({ length: 14 }, (_, i) => ({
    id: i + 1,
    bottles: Array.from({ length: 16 + (i % 5) }, (_, j) => ({
      colorsBottomToTop: j % 6 === 0 ? [] : [0, 1, 2, 3],
      isAdBottle: j < 2,
    })),
  }));
  const mix = assignFamiliesForPack(packLevels);
  let consecutiveSame = 0;
  for (let i = 1; i < packLevels.length; i++) {
    if (packLevels[i].boardLayout.family === packLevels[i - 1].boardLayout.family) {
      consecutiveSame += 1;
    }
  }
  if (consecutiveSame > 2) {
    throw new Error(`pack family rotation too sticky (${consecutiveSame} consecutive repeats)`);
  }
  const waveUsed = (mix.stagger || 0) + (mix.zigzag || 0);
  if (waveUsed < Math.ceil(packLevels.length * 0.4)) {
    throw new Error(`expected more stagger/zigzag in pack, got ${JSON.stringify(mix)}`);
  }
  const nonPreferred = Object.entries(mix).filter(([family]) =>
    family !== "frame" && !PREFERRED_WAVE_FAMILIES.includes(family));
  const maxOther = nonPreferred.length ? Math.max(...nonPreferred.map(([, count]) => count)) : 0;
  if (maxOther > Math.ceil(packLevels.length / 3) + 2) {
    throw new Error(`non-wave family overused in pack: ${JSON.stringify(mix)}`);
  }

  console.log("asmr-playband-layout selfTest: ok");
}

module.exports = {
  SYSTEM_ID,
  VERSION,
  FAMILIES,
  MAX_COLUMNS,
  MAX_ROWS,
  MAX_SPAN_ROWS,
  MAX_BOTTLES,
  COL_PITCH,
  ROW_PITCH,
  applyPlaybandLayout,
  assignFamiliesForPack,
  validatePlaybandLevel,
  inferRole,
  pickFamily,
  eligibleFamilies,
  selfTest,
};

if (require.main === module) {
  selfTest();
}
