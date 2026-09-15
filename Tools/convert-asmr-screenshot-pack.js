"use strict";

/**
 * One-shot: convert ASMR Water Sort Ref levels (matched to screenshot L1–L10)
 * into runtime watersort-levels / solutions pack 007.
 */

const fs = require("fs");
const path = require("path");

const root = process.cwd();
const refRoot = path.join(root, "Assets/Project/Data/WaterSort/Resources/Ref/levels");
const levelOut = path.join(root, "Assets/Project/Data/WaterSort/Resources/WaterSort/watersort-levels-007.json");
const solutionOut = path.join(root, "Assets/Project/Data/WaterSort/Resources/WaterSortSolutions/watersort-solutions-007.json");

const { SolverMode, solveExhaustiveHidden, toSolutionData } = require(
  path.join(root, "Assets/Project/Editor/WaterSort/LevelGeneration/Tools/watersort-exhaustive-solver.js"),
);

function loadRef(relFile) {
  return JSON.parse(fs.readFileSync(path.join(refRoot, relFile), "utf8"));
}

function findLevel(pack, origId) {
  const level = pack.levels.find((entry) => entry.orig_id === origId);
  if (!level) throw new Error(`Missing orig_id ${origId} in pack`);
  return level;
}

function cellsToColors(cells) {
  return (cells || []).filter((color) => color !== 0 && color != null);
}

function remapColors(bottles) {
  const used = new Set();
  for (const bottle of bottles) {
    for (const color of bottle.colorsBottomToTop) used.add(color);
    if (Number.isInteger(bottle.targetColor)) used.add(bottle.targetColor);
    if (Number.isInteger(bottle.unlockRequiredColor)) used.add(bottle.unlockRequiredColor);
  }
  const sorted = [...used].sort((a, b) => a - b);
  const map = new Map(sorted.map((color, index) => [color, index]));
  for (const bottle of bottles) {
    bottle.colorsBottomToTop = bottle.colorsBottomToTop.map((color) => map.get(color));
    if (Number.isInteger(bottle.targetColor)) bottle.targetColor = map.get(bottle.targetColor);
    if (Number.isInteger(bottle.unlockRequiredColor)) {
      bottle.unlockRequiredColor = map.get(bottle.unlockRequiredColor);
    }
  }
  return map;
}

function assignGridPositions(entries) {
  const xs = entries.map((entry) => entry.x);
  const ys = entries.map((entry) => entry.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const used = new Set();
  const positions = [];

  for (const entry of entries) {
    let gx = maxX === minX ? 3 : Math.round(((entry.x - minX) / (maxX - minX)) * 7);
    let gy = maxY === minY ? 2 : Math.round(((maxY - entry.y) / (maxY - minY)) * 4);
    gx = Math.max(0, Math.min(7, gx));
    gy = Math.max(0, Math.min(4, gy));

    if (used.has(`${gx},${gy}`)) {
      let placed = false;
      for (let radius = 1; radius <= 8 && !placed; radius++) {
        for (let dy = -radius; dy <= radius && !placed; dy++) {
          for (let dx = -radius; dx <= radius && !placed; dx++) {
            const nx = gx + dx;
            const ny = gy + dy;
            if (nx < 0 || nx > 7 || ny < 0 || ny > 4) continue;
            const key = `${nx},${ny}`;
            if (used.has(key)) continue;
            gx = nx;
            gy = ny;
            placed = true;
          }
        }
      }
      if (!placed) {
        for (let y = 0; y < 5 && !placed; y++) {
          for (let x = 0; x < 8 && !placed; x++) {
            const key = `${x},${y}`;
            if (used.has(key)) continue;
            gx = x;
            gy = y;
            placed = true;
          }
        }
      }
      if (!placed) throw new Error("Unable to assign unique grid positions within 8x5");
    }

    used.add(`${gx},${gy}`);
    positions.push({ x: gx, y: gy });
  }

  return positions;
}

function freeGridSlot(occupied) {
  for (let y = 4; y >= 0; y--) {
    for (let x = 0; x < 8; x++) {
      const key = `${x},${y}`;
      if (!occupied.has(key)) return { x, y };
    }
  }
  throw new Error("No free grid slot");
}

function buildHybridHidden(colors) {
  if (colors.length < 2) return [];
  const hidden = [];
  for (let i = 0; i < colors.length - 1; i++) hidden.push(i);
  return hidden;
}

function convertClassic(refLevel, options = {}) {
  const {
    displayName,
    forceHiddenStack = false,
    forceHybridHidden = false,
    keepCoversAsLocks = true,
    forceLockIndexes = null,
  } = options;

  const entries = [];
  const bottles = [];

  for (const container of refLevel.containers) {
    const isSpecial = Boolean(container.extra && container.extra.shape);
    if (isSpecial) continue;

    const colors = cellsToColors(container.cells);
    const bottle = {
      capacity: Math.max(2, Math.min(5, container.capacity || refLevel.capacity || 4)),
      colorsBottomToTop: colors,
    };

    const cover = (container.extra && container.extra.obstacles || []).find((obs) => obs.kind === "cover");
    if (keepCoversAsLocks && (container.type === "covered" || cover)) {
      const count = Math.max(1, Math.min(3, cover?.count || 1));
      const coverColor = cover?.color || 0;
      if (coverColor > 0) {
        bottle.isColorLocked = true;
        bottle.unlockRequiredColor = coverColor;
        bottle.unlockCompletedColorBottleCount = count;
      } else {
        bottle.isLocked = true;
        bottle.unlockCompletedBottleCount = count;
      }
    }

    if (forceLockIndexes && forceLockIndexes.has(bottles.length)) {
      const lock = forceLockIndexes.get(bottles.length);
      bottle.isLocked = true;
      bottle.unlockCompletedBottleCount = lock;
      delete bottle.isColorLocked;
      delete bottle.unlockRequiredColor;
      delete bottle.unlockCompletedColorBottleCount;
    }

    bottles.push(bottle);
    entries.push({
      x: Number(container.extra?.pos?.x ?? 0),
      y: Number(container.extra?.pos?.y ?? 0),
    });
  }

  const positions = assignGridPositions(entries);
  for (let i = 0; i < bottles.length; i++) bottles[i].gridPosition = positions[i];

  ensureAdsAndHelpers(bottles);

  const hasCountLock = bottles.some((bottle) => bottle.isLocked);
  const hasColorLock = bottles.some((bottle) => bottle.isColorLocked);
  const hiddenStack = forceHiddenStack && !forceHybridHidden;
  const hybridHiddenStack = forceHybridHidden && !forceHiddenStack;

  if (hybridHiddenStack) {
    for (const bottle of bottles) {
      if (bottle.isAdBottle || bottle.colorsBottomToTop.length < 2) continue;
      bottle.hiddenLayerIndexes = buildHybridHidden(bottle.colorsBottomToTop);
    }
  }

  remapColors(bottles);

  return {
    id: options.id,
    displayName,
    layoutGrid: { columns: 8, rows: 5, shape: "circle" },
    modeOptions: {
      hiddenStack,
      hybridHiddenStack,
      lockedBottles: hasCountLock,
      colorLockedBottles: hasColorLock,
      megaBottle: false,
    },
    bottles,
    _source: refLevel.uid,
  };
}

function convertMega(refLevel, options = {}) {
  const special = refLevel.containers.find((container) => container.extra && container.extra.shape);
  if (!special) throw new Error(`No special shape in ${refLevel.uid}`);

  const rawTarget = cellsToColors(special.cells)[0];
  if (rawTarget == null) throw new Error(`Special bottle missing target color in ${refLevel.uid}`);

  let targetTotal = 0;
  for (const container of refLevel.containers) {
    for (const cell of container.cells || []) {
      if (cell === rawTarget) targetTotal += 1;
    }
  }

  const megaCapacity = Math.max(12, Math.min(20, targetTotal));
  if (targetTotal < 12 || targetTotal > 20) {
    throw new Error(`Mega target count ${targetTotal} out of range for ${refLevel.uid}`);
  }

  const bottles = [];
  const entries = [];
  const starter = cellsToColors(special.cells).slice(0, megaCapacity);

  bottles.push({
    capacity: megaCapacity,
    colorsBottomToTop: starter,
    isMegaBottle: true,
    targetColor: rawTarget,
  });
  entries.push({
    x: Number(special.extra.pos.x),
    y: Number(special.extra.pos.y),
  });

  for (const container of refLevel.containers) {
    if (container.extra && container.extra.shape) continue;
    bottles.push({
      capacity: Math.max(2, Math.min(5, container.capacity || refLevel.capacity || 4)),
      colorsBottomToTop: cellsToColors(container.cells),
    });
    entries.push({
      x: Number(container.extra?.pos?.x ?? 0),
      y: Number(container.extra?.pos?.y ?? 0),
    });
  }

  const positions = assignGridPositions(entries);
  for (let i = 0; i < bottles.length; i++) bottles[i].gridPosition = positions[i];

  // Prefer center-ish cell for mega.
  bottles[0].gridPosition = { x: 3, y: 2 };
  const occupied = new Set(bottles.slice(1).map((bottle) => `${bottle.gridPosition.x},${bottle.gridPosition.y}`));
  if (occupied.has("3,2")) {
    for (const bottle of bottles.slice(1)) {
      if (bottle.gridPosition.x === 3 && bottle.gridPosition.y === 2) {
        bottle.gridPosition = freeGridSlot(occupied);
        occupied.add(`${bottle.gridPosition.x},${bottle.gridPosition.y}`);
        break;
      }
    }
  }

  ensureAdsAndHelpers(bottles, { minNormalEmpty: 1 });
  remapColors(bottles);

  // Trim / pad target layers to mega capacity invariant: exactly megaCapacity target layers total.
  const mega = bottles[0];
  let totalTarget = 0;
  for (const bottle of bottles) {
    if (bottle.isAdBottle) continue;
    for (const color of bottle.colorsBottomToTop) {
      if (color === mega.targetColor) totalTarget += 1;
    }
  }
  if (totalTarget !== mega.capacity) {
    // Remove excess target layers from normal bottles first.
    while (totalTarget > mega.capacity) {
      let removed = false;
      for (let i = 1; i < bottles.length && totalTarget > mega.capacity; i++) {
        const bottle = bottles[i];
        if (bottle.isAdBottle || bottle.isMegaBottle) continue;
        const idx = bottle.colorsBottomToTop.lastIndexOf(mega.targetColor);
        if (idx < 0) continue;
        bottle.colorsBottomToTop.splice(idx, 1);
        totalTarget -= 1;
        removed = true;
      }
      if (!removed) break;
    }
    while (totalTarget < mega.capacity) {
      // Add missing target onto mega starter if space; else onto a normal bottle with free space.
      if (mega.colorsBottomToTop.length < mega.capacity) {
        mega.colorsBottomToTop.push(mega.targetColor);
        totalTarget += 1;
        continue;
      }
      const dest = bottles.find((bottle) =>
        !bottle.isAdBottle && !bottle.isMegaBottle && bottle.colorsBottomToTop.length < bottle.capacity);
      if (!dest) break;
      dest.colorsBottomToTop.push(mega.targetColor);
      totalTarget += 1;
    }
  }

  return {
    id: options.id,
    displayName: options.displayName,
    layoutGrid: { columns: 8, rows: 5, shape: "circle" },
    modeOptions: {
      hiddenStack: false,
      hybridHiddenStack: false,
      lockedBottles: false,
      colorLockedBottles: false,
      megaBottle: true,
    },
    bottles,
    _source: refLevel.uid,
  };
}

function ensureAdsAndHelpers(bottles, { minNormalEmpty = 0 } = {}) {
  const occupied = new Set(bottles.map((bottle) => `${bottle.gridPosition.x},${bottle.gridPosition.y}`));
  const empties = () => bottles.filter((bottle) => !bottle.isMegaBottle && bottle.colorsBottomToTop.length === 0);
  const normalEmpties = () => empties().filter((bottle) => !bottle.isAdBottle);
  const adEmpties = () => empties().filter((bottle) => bottle.isAdBottle);

  function addEmpty(asAd) {
    const pos = freeGridSlot(occupied);
    occupied.add(`${pos.x},${pos.y}`);
    const bottle = {
      capacity: 4,
      colorsBottomToTop: [],
      gridPosition: pos,
    };
    if (asAd) bottle.isAdBottle = true;
    bottles.push(bottle);
  }

  while (bottles.length < 40 && empties().length < 2 + minNormalEmpty) addEmpty(false);

  // Promote / demote so we end with 2 ads and >= minNormalEmpty normal empties.
  while (adEmpties().length < 2) {
    const candidate = normalEmpties().find((bottle) => !bottle.isLocked && !bottle.isColorLocked);
    if (candidate && normalEmpties().length > minNormalEmpty) {
      candidate.isAdBottle = true;
      continue;
    }
    addEmpty(true);
  }

  while (adEmpties().length > 2) {
    const extra = adEmpties()[0];
    delete extra.isAdBottle;
  }

  while (normalEmpties().length < minNormalEmpty) addEmpty(false);

  // Never leave locked+ad.
  for (const bottle of bottles) {
    if (!bottle.isAdBottle) continue;
    delete bottle.isLocked;
    delete bottle.unlockCompletedBottleCount;
    delete bottle.isColorLocked;
    delete bottle.unlockRequiredColor;
    delete bottle.unlockCompletedColorBottleCount;
    delete bottle.hiddenLayerIndexes;
    bottle.colorsBottomToTop = [];
  }

  if (bottles.length > 40) throw new Error("Bottle count exceeds 40");
}

function countCompleted(board, capacities, locked, ads, megas) {
  let count = 0;
  for (let i = 0; i < board.length; i++) {
    if (locked[i] || ads.has(i) || megas.has(i)) continue;
    const bottle = board[i];
    const capacity = capacities[i];
    if (bottle.length === capacity && bottle.every((color) => color === bottle[0])) count += 1;
  }
  return count;
}

function countCompletedColor(board, capacities, locked, ads, megas, color) {
  let count = 0;
  for (let i = 0; i < board.length; i++) {
    if (locked[i] || ads.has(i) || megas.has(i)) continue;
    const bottle = board[i];
    const capacity = capacities[i];
    if (bottle.length === capacity && bottle[0] === color && bottle.every((c) => c === color)) count += 1;
  }
  return count;
}

function replayWithLocks(level, moves) {
  const board = level.bottles.map((bottle) => (bottle.colorsBottomToTop || []).slice());
  const capacities = level.bottles.map((bottle) => {
    if (bottle.isMegaBottle) return bottle.capacity;
    return Math.max(2, Math.min(5, bottle.capacity || 4));
  });
  const ads = new Set(level.bottles.map((bottle, index) => (bottle.isAdBottle ? index : -1)).filter((i) => i >= 0));
  const megas = new Set(level.bottles.map((bottle, index) => (bottle.isMegaBottle ? index : -1)).filter((i) => i >= 0));
  const locked = level.bottles.map((bottle) => Boolean(
    (level.modeOptions?.lockedBottles && bottle.isLocked)
    || (level.modeOptions?.colorLockedBottles && bottle.isColorLocked),
  ));
  const lockMeta = level.bottles.map((bottle) => {
    if (level.modeOptions?.colorLockedBottles && bottle.isColorLocked) {
      return { type: "color", color: bottle.unlockRequiredColor, threshold: Math.max(1, bottle.unlockCompletedColorBottleCount || 1) };
    }
    if (level.modeOptions?.lockedBottles && bottle.isLocked) {
      return { type: "count", threshold: Math.max(1, bottle.unlockCompletedBottleCount || 1) };
    }
    return null;
  });

  const refreshLocks = () => {
    let changed;
    do {
      changed = false;
      for (let i = 0; i < locked.length; i++) {
        if (!locked[i] || !lockMeta[i]) continue;
        const ok = lockMeta[i].type === "color"
          ? countCompletedColor(board, capacities, locked, ads, megas, lockMeta[i].color) >= lockMeta[i].threshold
          : countCompleted(board, capacities, locked, ads, megas) >= lockMeta[i].threshold;
        if (!ok) continue;
        locked[i] = false;
        changed = true;
      }
    } while (changed);
  };

  for (const move of moves) {
    refreshLocks();
    const from = move.fromBottle - 1;
    const to = move.toBottle - 1;
    if (ads.has(from) || ads.has(to)) return "uses ad";
    if (locked[from] || locked[to]) return "uses locked";
    if (megas.has(from)) return "mega source";
    const source = board[from];
    const target = board[to];
    if (!source?.length) return "empty source";
    if (target.length >= capacities[to]) return "full target";
    const color = source[source.length - 1];
    if (megas.has(to) && color !== level.bottles[to].targetColor) return "mega color";
    if (target.length > 0 && target[target.length - 1] !== color) return "mismatch";
    let amount = 0;
    for (let i = source.length - 1; i >= 0 && source[i] === color; i--) amount += 1;
    amount = Math.min(amount, capacities[to] - target.length);
    if (amount <= 0) return "zero pour";
    for (let i = 0; i < amount; i++) target.push(source.pop());
  }

  if (level.modeOptions?.megaBottle) {
    const megaIndex = level.bottles.findIndex((bottle) => bottle.isMegaBottle);
    const mega = board[megaIndex];
    if (mega.length !== capacities[megaIndex] || !mega.every((c) => c === level.bottles[megaIndex].targetColor)) {
      return "mega not complete";
    }
    return null;
  }

  const capacity = capacities.find((value, index) => !ads.has(index) && !megas.has(index)) || 4;
  for (let i = 0; i < board.length; i++) {
    if (ads.has(i) || megas.has(i)) continue;
    const bottle = board[i];
    if (bottle.length === 0) continue;
    if (bottle.length !== capacity || !bottle.every((c) => c === bottle[0])) return "not solved";
  }
  return null;
}

function solveMegaLevel(level) {
  const megaIndex = level.bottles.findIndex((bottle) => bottle.isMegaBottle);
  const megaBottle = level.bottles[megaIndex];
  const targetColor = megaBottle.targetColor;
  const megaCapacity = megaBottle.capacity;
  const board = level.bottles.map((bottle) => (bottle.colorsBottomToTop || []).slice());
  const capacities = level.bottles.map((bottle) => (
    bottle.isMegaBottle ? bottle.capacity : Math.max(2, Math.min(5, bottle.capacity || 4))
  ));
  const moves = [];

  const isAd = (index) => Boolean(level.bottles[index].isAdBottle);

  while (board[megaIndex].length < megaCapacity) {
    let sourceIndex = board.findIndex((bottle, index) =>
      index !== megaIndex && !isAd(index) && bottle.length > 0 && bottle[bottle.length - 1] === targetColor);
    if (sourceIndex >= 0) {
      pour(board, capacities, sourceIndex, megaIndex);
      moves.push({ fromBottle: sourceIndex + 1, toBottle: megaIndex + 1 });
      continue;
    }

    sourceIndex = board.findIndex((bottle, index) =>
      index !== megaIndex && !isAd(index) && bottle.includes(targetColor));
    if (sourceIndex < 0) throw new Error("Mega target color unreachable");

    const blocker = board[sourceIndex][board[sourceIndex].length - 1];
    const helperIndex = board.findIndex((bottle, index) =>
      index !== megaIndex
      && index !== sourceIndex
      && !isAd(index)
      && bottle.length < capacities[index]
      && (bottle.length === 0 || bottle[bottle.length - 1] === blocker));
    if (helperIndex < 0) throw new Error("Mega needs helper");

    pour(board, capacities, sourceIndex, helperIndex);
    moves.push({ fromBottle: sourceIndex + 1, toBottle: helperIndex + 1 });
  }

  return {
    solutionCount: 1,
    shortestStepCount: moves.length,
    storedSolutionCount: 1,
    storesAllSolutions: true,
    selectionPolicy: "asmr_ref_mega_greedy_replay_validated",
    solutions: [{ stepCount: moves.length, moves }],
  };
}

function pour(board, capacities, from, to) {
  const source = board[from];
  const target = board[to];
  const color = source[source.length - 1];
  let amount = 0;
  for (let i = source.length - 1; i >= 0 && source[i] === color; i--) amount += 1;
  amount = Math.min(amount, capacities[to] - target.length);
  for (let i = 0; i < amount; i++) target.push(source.pop());
}

function stripAdsForSolve(level) {
  const keepIndexes = [];
  const board = [];
  const indexMap = [];
  for (let i = 0; i < level.bottles.length; i++) {
    const bottle = level.bottles[i];
    if (bottle.isAdBottle) continue;
    keepIndexes.push(i);
    board.push((bottle.colorsBottomToTop || []).slice());
    indexMap.push(i);
  }
  return { board, indexMap, capacity: level.bottles.find((b) => !b.isAdBottle && !b.isMegaBottle)?.capacity || 4 };
}

function remapMoves(moves, indexMap) {
  const reverse = new Map(indexMap.map((original, compact) => [compact, original]));
  return moves.map((move) => ({
    fromBottle: reverse.get(move.fromBottle - 1) + 1,
    toBottle: reverse.get(move.toBottle - 1) + 1,
  }));
}

function clearLocks(level) {
  for (const bottle of level.bottles) {
    delete bottle.isLocked;
    delete bottle.unlockCompletedBottleCount;
    delete bottle.isColorLocked;
    delete bottle.unlockRequiredColor;
    delete bottle.unlockCompletedColorBottleCount;
  }
  level.modeOptions.lockedBottles = false;
  level.modeOptions.colorLockedBottles = false;
}

function snapshotLocks(level) {
  return level.bottles.map((bottle) => ({
    isLocked: Boolean(bottle.isLocked),
    unlockCompletedBottleCount: bottle.unlockCompletedBottleCount || 0,
    isColorLocked: Boolean(bottle.isColorLocked),
    unlockRequiredColor: bottle.unlockRequiredColor,
    unlockCompletedColorBottleCount: bottle.unlockCompletedColorBottleCount || 0,
  }));
}

function restoreLocks(level, snapshot) {
  clearLocks(level);
  for (let i = 0; i < level.bottles.length; i++) {
    const lock = snapshot[i];
    const bottle = level.bottles[i];
    if (!lock) continue;
    if (lock.isColorLocked) {
      bottle.isColorLocked = true;
      bottle.unlockRequiredColor = lock.unlockRequiredColor;
      bottle.unlockCompletedColorBottleCount = lock.unlockCompletedColorBottleCount;
    } else if (lock.isLocked) {
      bottle.isLocked = true;
      bottle.unlockCompletedBottleCount = lock.unlockCompletedBottleCount;
    }
  }
  level.modeOptions.lockedBottles = level.bottles.some((bottle) => bottle.isLocked);
  level.modeOptions.colorLockedBottles = level.bottles.some((bottle) => bottle.isColorLocked);
}

function firstUseStep(moves, bottleIndex1Based) {
  for (let i = 0; i < moves.length; i++) {
    if (moves[i].fromBottle === bottleIndex1Based || moves[i].toBottle === bottleIndex1Based) return i;
  }
  return Infinity;
}

/**
 * Prefer original cover locks when they replay; otherwise attach count-locks
 * to bottles whose first solution use happens after enough mono completes.
 */
function attachCompatibleLocks(level, moves, desiredCountLocks = 0) {
  const original = snapshotLocks(level);
  if (replayWithLocks(level, moves) == null && (level.modeOptions.lockedBottles || level.modeOptions.colorLockedBottles)) {
    return "original";
  }

  // Try original locks with thresholds forced to 1.
  restoreLocks(level, original.map((lock) => {
    if (lock.isColorLocked) return { ...lock, unlockCompletedColorBottleCount: 1 };
    if (lock.isLocked) return { ...lock, unlockCompletedBottleCount: 1 };
    return lock;
  }));
  if (replayWithLocks(level, moves) == null && (level.modeOptions.lockedBottles || level.modeOptions.colorLockedBottles)) {
    return "threshold1";
  }

  clearLocks(level);
  if (desiredCountLocks <= 0) return "none";

  const candidates = level.bottles
    .map((bottle, index) => ({ index, bottle, firstUse: firstUseStep(moves, index + 1) }))
    .filter((entry) =>
      !entry.bottle.isAdBottle
      && !entry.bottle.isMegaBottle
      && entry.bottle.colorsBottomToTop.length > 0
      && Number.isFinite(entry.firstUse))
    .sort((a, b) => b.firstUse - a.firstUse);

  const chosen = [];
  for (const candidate of candidates) {
    if (chosen.length >= desiredCountLocks) break;
    // Threshold 1 is usually feasible once at least one bottle can complete before first use.
    candidate.bottle.isLocked = true;
    candidate.bottle.unlockCompletedBottleCount = 1;
    chosen.push(candidate.index);
    level.modeOptions.lockedBottles = true;
    if (replayWithLocks(level, moves) != null) {
      delete candidate.bottle.isLocked;
      delete candidate.bottle.unlockCompletedBottleCount;
      chosen.pop();
      level.modeOptions.lockedBottles = level.bottles.some((bottle) => bottle.isLocked);
    }
  }

  return chosen.length > 0 ? `synthesized:${chosen.length}` : "none";
}

function solveClassic(level, { desiredCountLocks = 0 } = {}) {
  const lockSnapshot = snapshotLocks(level);
  clearLocks(level);

  const { board, indexMap, capacity } = stripAdsForSolve(level);
  if (board.length > 30) throw new Error(`Solver bottle limit exceeded: ${board.length}`);

  const result = solveExhaustiveHidden(board, capacity, {
    mode: SolverMode.Fast,
    maxDepth: 160,
    maxStates: 400000,
    maxExpandedStates: 400000,
    maxSolutions: 5,
    sampleLimit: 5,
    runFastFirst: true,
    proveOptimalAfterFast: false,
    selectionPolicy: "asmr_ref_fast_hidden_solver",
  });

  if (!result.success || !result.solutions?.length) {
    restoreLocks(level, lockSnapshot);
    return {
      solutionCount: 0,
      shortestStepCount: 0,
      storedSolutionCount: 0,
      storesAllSolutions: false,
      selectionPolicy: "asmr_ref_fast_hidden_solver",
      solutions: [],
      failureReason: result.status || "unsolved",
    };
  }

  const remapped = result.solutions.map((solution) => ({
    stepCount: solution.moves.length,
    moves: remapMoves(solution.moves, indexMap),
  }));
  remapped.sort((a, b) => a.stepCount - b.stepCount);

  restoreLocks(level, lockSnapshot);
  const lockMode = attachCompatibleLocks(level, remapped[0].moves, desiredCountLocks);
  const valid = remapped.filter((solution) => replayWithLocks(level, solution.moves) == null);
  if (valid.length === 0) {
    clearLocks(level);
    return {
      solutionCount: remapped.length,
      shortestStepCount: remapped[0].stepCount,
      storedSolutionCount: Math.min(3, remapped.length),
      storesAllSolutions: false,
      selectionPolicy: "asmr_ref_fast_hidden_solver_no_compatible_locks",
      solutions: remapped.slice(0, 3),
      lockMode: "none",
    };
  }

  valid.sort((a, b) => a.stepCount - b.stepCount);
  return {
    solutionCount: valid.length,
    shortestStepCount: valid[0].stepCount,
    storedSolutionCount: Math.min(3, valid.length),
    storesAllSolutions: false,
    selectionPolicy: `asmr_ref_fast_hidden_solver_${lockMode}`,
    solutions: valid.slice(0, 3),
    lockMode,
  };
}

function main() {
  const red = loadRef("classic_sort/ASMRWaterSort/RED.json");
  const heartPack = loadRef("mixed_sort/ASMRWaterSort/RED1_1.json");
  const peacockPack = loadRef("mixed_sort/ASMRWaterSort/RED1-reset-1-1.json");

  const specs = [
    { id: 1, kind: "mega", ref: findLevel(heartPack, 1), displayName: "Level 1", note: "Mega heart (special_shape 638x538)" },
    { id: 2, kind: "classic", ref: findLevel(red, 8), displayName: "Level 2", opts: { forceHiddenStack: true, keepCoversAsLocks: false }, desiredCountLocks: 0, note: "Dense + full hidden (?)" },
    { id: 3, kind: "classic", ref: findLevel(red, 6), displayName: "Level 3", opts: { forceHybridHidden: true, keepCoversAsLocks: true }, desiredCountLocks: 3, note: "Hybrid hidden + bags/locks" },
    { id: 4, kind: "classic", ref: findLevel(red, 4), displayName: "Level 4", opts: { keepCoversAsLocks: false }, desiredCountLocks: 0, note: "Classic dense ASMR RED:4" },
    { id: 5, kind: "classic", ref: findLevel(red, 5), displayName: "Level 5", opts: { keepCoversAsLocks: true }, desiredCountLocks: 3, note: "Bags 1/2/3 via cover locks" },
    { id: 6, kind: "classic", ref: findLevel(red, 6), displayName: "Level 6", opts: { keepCoversAsLocks: true }, desiredCountLocks: 4, note: "Frost/bag locks from covers" },
    { id: 7, kind: "classic", ref: findLevel(red, 7), displayName: "Level 7", opts: { forceHybridHidden: true, keepCoversAsLocks: false }, desiredCountLocks: 0, note: "Hybrid hidden dense" },
    { id: 8, kind: "classic", ref: findLevel(red, 9), displayName: "Level 8", opts: { forceHiddenStack: true, keepCoversAsLocks: false }, desiredCountLocks: 0, note: "Full hidden stack dense" },
    { id: 9, kind: "classic", ref: findLevel(red, 10), displayName: "Level 9", opts: { forceHybridHidden: true, keepCoversAsLocks: true }, desiredCountLocks: 2, note: "Hybrid hidden + lock badges" },
    { id: 10, kind: "mega", ref: findLevel(peacockPack, 20), displayName: "Level 10", note: "Mega peacock-like (932x1350)" },
  ];

  const levels = [];
  const levelSolutions = [];

  for (const spec of specs) {
    console.error(`Building ${spec.displayName} from ${spec.ref.uid} (${spec.note})`);
    let level;
    if (spec.kind === "mega") {
      level = convertMega(spec.ref, { id: spec.id, displayName: spec.displayName });
    } else {
      level = convertClassic(spec.ref, { id: spec.id, displayName: spec.displayName, ...spec.opts });
    }

    // Drop internal source before write, keep for log.
    const source = level._source;
    delete level._source;

    let solutionData;
    if (level.modeOptions.megaBottle) {
      solutionData = solveMegaLevel(level);
      const err = replayWithLocks(level, solutionData.solutions[0].moves);
      if (err) throw new Error(`Mega replay failed L${spec.id}: ${err}`);
    } else {
      solutionData = solveClassic(level, { desiredCountLocks: spec.desiredCountLocks || 0 });
      if (!solutionData.solutions?.length) {
        throw new Error(`Unsolved L${spec.id} (${source}): ${solutionData.failureReason}`);
      }
      const err = replayWithLocks(level, solutionData.solutions[0].moves);
      if (err) throw new Error(`Classic replay failed L${spec.id}: ${err}`);
    }

    const lockedCount = level.bottles.filter((b) => b.isLocked || b.isColorLocked).length;
    console.error(`  bottles=${level.bottles.length} ads=${level.bottles.filter((b) => b.isAdBottle).length} locked=${lockedCount} steps=${solutionData.shortestStepCount} modes=${JSON.stringify(level.modeOptions)} lockMode=${solutionData.lockMode || "-"}`);
    levels.push(level);
    levelSolutions.push({
      levelNumber: spec.id,
      solutionData,
    });
  }

  const levelPack = {
    packName: "Water Sort Levels 007",
    levels,
  };
  const solutionPack = {
    packName: "Water Sort Solutions 007",
    levelSolutions,
  };

  fs.writeFileSync(levelOut, `${JSON.stringify(levelPack, null, 2)}\n`);
  fs.writeFileSync(solutionOut, `${JSON.stringify(solutionPack, null, 2)}\n`);

  for (const outPath of [levelOut, solutionOut]) {
    const metaPath = `${outPath}.meta`;
    if (!fs.existsSync(metaPath)) {
      const guid = require("crypto").randomBytes(16).toString("hex");
      fs.writeFileSync(metaPath, [
        "fileFormatVersion: 2",
        `guid: ${guid}`,
        "TextScriptImporter:",
        "  externalObjects: {}",
        "  userData: ",
        "  assetBundleName: ",
        "  assetBundleVariant: ",
        "",
      ].join("\n"));
    }
  }

  console.log(JSON.stringify({
    levelOut,
    solutionOut,
    levels: levels.map((level, index) => ({
      id: level.id,
      bottles: level.bottles.length,
      modes: level.modeOptions,
      steps: levelSolutions[index].solutionData.shortestStepCount,
      source: specs[index].ref.uid,
      note: specs[index].note,
    })),
  }, null, 2));
}

main();
