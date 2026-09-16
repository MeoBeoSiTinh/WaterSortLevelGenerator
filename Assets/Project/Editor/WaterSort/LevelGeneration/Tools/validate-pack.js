"use strict";

const fs = require("fs");
const { applyHiddenPour, isSolvedState, makeInitialHiddenState } = require("./watersort-exhaustive-solver");
const { replayMegaSolutionExact } = require("./mega-generator-v2");
const { coreGameplayFingerprint } = require("./watersort-core-fingerprint");

const levelPath = process.argv[2];
const solutionPath = process.argv[3];

if (!levelPath || !solutionPath) {
  console.error("Usage: node validate-pack.js <levelPack> <solutionPack>");
  process.exit(2);
}

const levelPack = JSON.parse(fs.readFileSync(levelPath, "utf8"));
const solutionPack = JSON.parse(fs.readFileSync(solutionPath, "utf8"));
const errors = [];

function add(levelIndex, message) {
  errors.push(`Level ${levelIndex + 1}: ${message}`);
}

function replayNormal(level, moves) {
  const board = level.bottles.map(bottle => (bottle.colorsBottomToTop || []).slice());
  const capacity = level.bottles.find(bottle => !bottle.isAdBottle && !bottle.isMegaBottle)?.capacity || 4;
  let state = makeInitialHiddenState(board);
  const locked = level.bottles.map((bottle) => {
    const countLocked = level.modeOptions?.lockedBottles && bottle.isLocked === true;
    const colorLocked = level.modeOptions?.colorLockedBottles && bottle.isColorLocked === true;
    return Boolean(countLocked || colorLocked);
  });
  const lockKinds = level.bottles.map((bottle) => {
    if (level.modeOptions?.colorLockedBottles && bottle.isColorLocked === true) {
      return {
        type: "color",
        color: Number(bottle.unlockRequiredColor),
        threshold: Math.max(1, bottle.unlockCompletedColorBottleCount || 1),
      };
    }
    if (level.modeOptions?.lockedBottles && bottle.isLocked === true) {
      return {
        type: "count",
        threshold: Math.max(1, bottle.unlockCompletedBottleCount || 1),
      };
    }
    return null;
  });
  const adIndexes = new Set(level.bottles.map((bottle, index) => bottle.isAdBottle ? index : -1).filter(index => index >= 0));

  for (const move of moves) {
    const from = move.fromBottle - 1;
    const to = move.toBottle - 1;
    if (adIndexes.has(from) || adIndexes.has(to)) return "uses ad bottle";
    if (from < 0 || to < 0 || from >= board.length || to >= board.length || from === to) return "bad move index";
    let unlockedAny;
    do {
      unlockedAny = false;
      for (let i = 0; i < locked.length; i++) {
        if (!locked[i] || lockKinds[i] == null) continue;
        const shouldUnlock = lockKinds[i].type === "color"
          ? countCompletedFullBottlesOfColor(state, level.bottles, locked, lockKinds[i].color) >= lockKinds[i].threshold
          : countCompletedFullBottles(state, level.bottles, locked) >= lockKinds[i].threshold;
        if (!shouldUnlock) continue;
        locked[i] = false;
        unlockedAny = true;
      }
    } while (unlockedAny);
    if (locked[from] || locked[to]) return "uses locked bottle";
    state = applyHiddenPour(state, from, to, capacity);
    if (state == null) return "illegal pour";
  }

  return isSolvedState(state, capacity) ? null : "not solved";
}

function countCompletedFullBottles(state, bottles, locked) {
  let count = 0;
  for (let i = 0; i < state.colors.length; i++) {
    if (locked[i] || bottles[i]?.isAdBottle || bottles[i]?.isMegaBottle) continue;
    const bottle = state.colors[i];
    const capacity = bottles[i]?.capacity || 4;
    if (bottle.length === capacity && bottle.every(color => color === bottle[0])) count++;
  }
  return count;
}

function countCompletedFullBottlesOfColor(state, bottles, locked, colorIndex) {
  let count = 0;
  for (let i = 0; i < state.colors.length; i++) {
    if (locked[i] || bottles[i]?.isAdBottle || bottles[i]?.isMegaBottle) continue;
    const bottle = state.colors[i];
    const capacity = bottles[i]?.capacity || 4;
    if (bottle.length === capacity && bottle[0] === colorIndex && bottle.every(color => color === colorIndex)) count++;
  }
  return count;
}

function countColorLayers(level, colorIndex, excludedIndexes = new Set()) {
  let layers = 0;
  for (let index = 0; index < (level.bottles || []).length; index++) {
    const bottle = level.bottles[index];
    if (bottle?.isAdBottle || excludedIndexes.has(index)) continue;
    for (const color of bottle.colorsBottomToTop || []) {
      if (color === colorIndex) layers += 1;
    }
  }
  return layers;
}

function validateColorLockRules(level, index) {
  const colorLockedIndexes = new Set();
  for (let i = 0; i < (level.bottles || []).length; i++) {
    const bottle = level.bottles[i];
    if (level.modeOptions?.colorLockedBottles && bottle.isColorLocked === true) colorLockedIndexes.add(i);
  }

  for (let i = 0; i < (level.bottles || []).length; i++) {
    const bottle = level.bottles[i];
    const countLocked = level.modeOptions?.lockedBottles && bottle.isLocked === true;
    const colorLocked = level.modeOptions?.colorLockedBottles && bottle.isColorLocked === true;
    if (countLocked && colorLocked) {
      add(index, `bottle ${i} has both count-lock and color-lock`);
      continue;
    }
    if (!colorLocked) continue;
    const required = Number(bottle.unlockRequiredColor);
    const need = Math.max(1, bottle.unlockCompletedColorBottleCount || 1);
    const capacity = bottle.isMegaBottle ? bottle.capacity : Math.max(2, Math.min(5, bottle.capacity || 4));
    const freeLayers = countColorLayers(level, required, colorLockedIndexes);
    if (freeLayers < capacity * need) {
      add(index, `color-lock bottle ${i} lacks enough free color ${required} layers for unlock x${need}`);
    }
  }
}

function validateLevel(level, solutionEntry, index) {
  const playband = level.boardLayout?.system === "asmrPlayband";
  if (playband) {
    if (![
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
      "megaOrbit",
      "packed",
      "alt",
      "chevron",
      "hourglass",
    ].includes(level.boardLayout.family)) {
      add(index, `boardLayout.family invalid: ${level.boardLayout.family}`);
    }
    if (level.layoutGrid) add(index, "playband level must not include layoutGrid");
  } else if (!level.boardLayout || level.boardLayout.system !== "asmrPlayband") {
    // Legacy packs only: keep old grid checks until migrated.
    if (!level.layoutGrid || level.layoutGrid.columns !== 8 || level.layoutGrid.rows !== 5) {
      add(index, "legacy layoutGrid must be 8x5 (or migrate to boardLayout asmrPlayband)");
    }
  }
  if (!Array.isArray(level.bottles)) {
    add(index, "bottles must be an array");
    return;
  }
  if (level.bottles.length > 35) add(index, "more than 35 bottles");
  if (level.modeOptions?.hiddenStack && level.modeOptions?.hybridHiddenStack) add(index, "hidden and hybrid hidden both enabled");

  const grid = new Set();
  const playbandKeys = new Set();
  let adCount = 0;
  let megaCount = 0;
  for (let bottleIndex = 0; bottleIndex < level.bottles.length; bottleIndex++) {
    const bottle = level.bottles[bottleIndex];
    const capacity = bottle.capacity || 4;
    if (bottle.isMegaBottle) {
      megaCount++;
      if (capacity < 12 || capacity > 20) add(index, `mega bottle ${bottleIndex + 1} capacity out of range`);
      if (!Number.isInteger(bottle.targetColor)) add(index, `mega bottle ${bottleIndex + 1} missing targetColor`);
    } else if (capacity < 2 || capacity > 5) {
      add(index, `bottle ${bottleIndex + 1} capacity out of range`);
    }
    const colors = bottle.colorsBottomToTop || [];
    if (colors.length > capacity) add(index, `bottle ${bottleIndex + 1} over capacity`);
    if (bottle.isAdBottle) {
      adCount++;
      if (colors.length !== 0) add(index, `ad bottle ${bottleIndex + 1} is not empty`);
    }
    if (playband) {
      const pos = bottle.layoutPosition;
      if (!pos || typeof pos.nx !== "number" || typeof pos.ny !== "number"
        || pos.nx < 0 || pos.nx > 1 || pos.ny < 0 || pos.ny > 1) {
        add(index, `bottle ${bottleIndex + 1} layoutPosition out of range`);
      } else {
        const key = `${pos.nx.toFixed(3)},${pos.ny.toFixed(3)}`;
        if (playbandKeys.has(key)) add(index, `duplicate layoutPosition ${key}`);
        playbandKeys.add(key);
      }
      if (bottle.gridPosition) add(index, `bottle ${bottleIndex + 1} must not include gridPosition on playband levels`);
    } else {
      const pos = bottle.gridPosition;
      if (!pos || pos.x < 0 || pos.x >= 8 || pos.y < 0 || pos.y >= 5) {
        add(index, `bottle ${bottleIndex + 1} gridPosition out of range`);
      } else {
        const key = `${pos.x},${pos.y}`;
        if (grid.has(key)) add(index, `duplicate gridPosition ${key}`);
        grid.add(key);
      }
    }
    if (Array.isArray(bottle.hiddenLayerIndexes)) {
      for (const hiddenIndex of bottle.hiddenLayerIndexes) {
        if (!Number.isInteger(hiddenIndex) || hiddenIndex < 0 || hiddenIndex >= colors.length - 1) {
          add(index, `invalid hybrid hidden index on bottle ${bottleIndex + 1}`);
        }
      }
    }
  }

  if (adCount < 2 || adCount > 3) add(index, `expected 2 or 3 ad bottles, found ${adCount}`);
  if (level.modeOptions?.megaBottle && megaCount !== 1) add(index, `expected one mega bottle, found ${megaCount}`);
  validateColorLockRules(level, index);

  const solutions = solutionEntry?.solutionData?.solutions || [];
  if (solutions.length === 0) {
    add(index, "missing stored solution");
    return;
  }

  for (let solutionIndex = 0; solutionIndex < solutions.length; solutionIndex++) {
    const moves = solutions[solutionIndex].moves || [];
    const replayError = level.modeOptions?.megaBottle
      ? replayMega(level, moves)
      : replayNormal(level, moves);
    if (replayError) add(index, `solution ${solutionIndex + 1} ${replayError}`);
  }

  if (solutionEntry?.solutionData?.difficulty === "Special") {
    validateSpecialNearWin(level, solutionEntry.solutionData, index);
  }
}

function validateSpecialNearWin(level, solutionData, index) {
  const special = solutionData.specialOptions;
  if (!special || special.type !== "NearWin") {
    add(index, "Special level missing NearWin metadata");
    return;
  }
  if (!special.criticalDecisionState || !Number.isInteger(special.criticalDecisionState.safeMoveIndex)) {
    add(index, "NearWin missing critical decision state");
  }
  if (!special.trapMove || !Number.isInteger(special.trapMove.fromBottle) || !Number.isInteger(special.trapMove.toBottle)) {
    add(index, "NearWin missing trap move");
  }
  const minNearWinScore = special.nearWinMetrics?.minNearWinScore ?? 0.75;
  if ((special.nearWinMetrics?.nearWinScore ?? 0) < minNearWinScore) add(index, "NearWin score below configured threshold");
  if (!Array.isArray(special.supportedRescueTypes) || special.supportedRescueTypes.length === 0) {
    add(index, "NearWin missing optional rescue type");
  }
}

function replayMega(level, moves) {
  const megaBottleIndex = level.bottles.findIndex(bottle => bottle.isMegaBottle);
  const megaBottle = level.bottles[megaBottleIndex];
  const candidate = {
    board: level.bottles.map(bottle => (bottle.colorsBottomToTop || []).slice()),
    capacities: level.bottles.map(bottle => bottle.isMegaBottle ? bottle.capacity : Math.max(2, Math.min(5, bottle.capacity || 4))),
    megaBottleIndex,
    megaCapacity: megaBottle?.capacity,
    targetColor: megaBottle?.targetColor,
  };
  const adIndexes = new Set(level.bottles.map((bottle, index) => bottle.isAdBottle ? index : -1).filter(index => index >= 0));
  if (moves.some(move => adIndexes.has(move.fromBottle - 1) || adIndexes.has(move.toBottle - 1))) return "uses ad bottle";
  const replay = replayMegaSolutionExact(candidate, moves);
  return replay.success ? null : replay.reason;
}

if (!Array.isArray(levelPack.levels)) errors.push("Pack: levels must be an array");
if (!Array.isArray(solutionPack.levelSolutions)) errors.push("Pack: levelSolutions must be an array");

const levels = levelPack.levels || [];
const solutions = solutionPack.levelSolutions || [];
if (levels.length !== solutions.length) errors.push(`Pack: level count ${levels.length} does not match solution count ${solutions.length}`);

const acceptedFingerprints = new Map();
for (let i = 0; i < levels.length; i++) {
  validateLevel(levels[i], solutions[i], i);
  const fingerprint = coreGameplayFingerprint(levels[i]);
  if (acceptedFingerprints.has(fingerprint)) {
    add(i, `duplicate core gameplay of Level ${acceptedFingerprints.get(fingerprint)}`);
  } else {
    acceptedFingerprints.set(fingerprint, i + 1);
  }
}

const summary = {
  levels: levels.length,
  solutions: solutions.length,
  invalid: errors.length,
  errors: errors.slice(0, 50),
};

console.log(JSON.stringify(summary, null, 2));
if (errors.length > 0) process.exit(1);
