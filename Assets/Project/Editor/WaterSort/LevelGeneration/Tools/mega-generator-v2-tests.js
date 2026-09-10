"use strict";

const assert = require("assert");
const {
  buildMegaLevelV2,
  evaluateMegaCandidate,
  evaluateMegaDensityMetrics,
  rebalanceMegaDensity,
  replayMegaSolutionExact,
  templatePenalty,
} = require("./mega-generator-v2");

const config = {
  defaultBottleCapacity: 4,
  maxBottleCount: 40,
};

const band = {
  name: "Main",
  minMegaBottleCapacity: 12,
  maxMegaBottleCapacity: 20,
  capacityWeights: [{ value: 4, weight: 1 }],
  minShortestStepCount: 28,
  maxShortestStepCount: 100,
  megaCandidateAttemptCount: 64,
  minMegaActiveBottleCount: 18,
  maxMegaActiveBottleCount: 34,
  minMegaBlockerColorCount: 8,
  maxMegaBlockerColorCount: 12,
  minMegaNormalHelperCount: 1,
  maxMegaNormalHelperCount: 2,
  maxMegaTargetGroupSize: 2,
  minMegaBuriedTargetRatio: 1,
  minMegaDeepBuriedTargetRatio: 0.5,
  minMegaUniqueTopColorCount: 5,
  maxMegaTopColorShare: 0.2,
  minMegaUniqueBottlePatternRatio: 1,
  minMegaMovesBeforeFirstFill: 3,
  minMegaCrossBottleBlockerMoves: 4,
  minMegaNonMegaMoveRatio: 0.4,
  maxMegaConsecutiveFillMoves: 3,
  megaSolverMaxStates: 90000,
  megaSolverMaxDepth: 180,
  minMegaActiveFillRatio: 0.5,
  targetMegaActiveFillRatio: 0.9,
  maxMegaActiveFreeRatio: 0.15,
  maxMegaSparseBottleRatio: 0.1,
  maxMegaSingleLayerBottleCount: 0,
  megaFreeCapacityConcentrationRatio: 0.65,
};

function candidateFromLevel(level) {
  return {
    board: level.board.map(bottle => bottle.slice()),
    capacities: level.board.map((_, index) => index === level.megaBottleIndex ? level.megaCapacity : level.capacity),
    megaBottleIndex: level.megaBottleIndex,
    megaCapacity: level.megaCapacity,
    targetColor: level.megaTargetColor,
  };
}

function withAds(candidate) {
  return {
    ...candidate,
    board: candidate.board.concat([[], [], []]),
    capacities: candidate.capacities.concat([candidate.capacity || 4, candidate.capacity || 4, candidate.capacity || 4]),
  };
}

function testGeneratedMegaStructureAndReplay() {
  const level = buildMegaLevelV2(config, band, 41, 123456, 13);
  const candidate = candidateFromLevel(level);
  const moves = level.solutionMoveLists[0];
  const metrics = evaluateMegaCandidate(candidate, moves, level.metrics.solverVisitedStates);
  const targetLayerCount = level.board.reduce((sum, bottle) => sum + bottle.filter(color => color === level.megaTargetColor).length, 0);
  const filledNormalPatterns = level.board
    .filter((bottle, index) => index !== level.megaBottleIndex && bottle.length > 0)
    .map(bottle => bottle.join(","));

  assert.ok(level.megaCapacity >= 12 && level.megaCapacity <= 20);
  assert.strictEqual(targetLayerCount, level.megaCapacity);
  assert.ok(!level.board.some((bottle, index) =>
    index !== level.megaBottleIndex
    && bottle.length === level.capacity
    && bottle.every(color => color === level.megaTargetColor)));
  assert.strictEqual(new Set(filledNormalPatterns).size, filledNormalPatterns.length);
  assert.ok(metrics.buriedTargetRatio >= band.minMegaBuriedTargetRatio);
  assert.ok(metrics.deepBuriedTargetRatio >= band.minMegaDeepBuriedTargetRatio);
  assert.ok(metrics.uniqueVisibleTopColors >= band.minMegaUniqueTopColorCount);
  assert.ok(metrics.maxTopColorShare <= band.maxMegaTopColorShare);
  assert.ok(metrics.movesBeforeFirstMegaPour >= band.minMegaMovesBeforeFirstFill);
  assert.ok(metrics.crossBottleBlockerMoves >= band.minMegaCrossBottleBlockerMoves);
  assert.ok(metrics.nonMegaMoveRatio >= band.minMegaNonMegaMoveRatio);
  assert.ok(metrics.maxConsecutiveMegaPours <= band.maxMegaConsecutiveFillMoves);
  assert.ok(metrics.activeFillRatio >= band.minMegaActiveFillRatio);
  assert.ok(metrics.activeFreeRatio <= band.maxMegaActiveFreeRatio);
  assert.ok(metrics.sparseBottleRatio <= band.maxMegaSparseBottleRatio);
  assert.strictEqual(metrics.singleLayerBottleCount, 0);
  assert.strictEqual(replayMegaSolutionExact(candidate, moves).success, true);
}

function testMegaCannotBeSource() {
  const level = buildMegaLevelV2(config, band, 42, 123456, 13);
  const candidate = candidateFromLevel(level);
  assert.deepStrictEqual(
    replayMegaSolutionExact(candidate, [{ fromBottle: 1, toBottle: 2 }]),
    { success: false, reason: "mega_source" });
}

function testMegaRejectsBlockerColor() {
  const level = buildMegaLevelV2(config, band, 43, 123456, 13);
  const candidate = candidateFromLevel(level);
  const blockerSource = candidate.board.findIndex((bottle, index) =>
    index !== candidate.megaBottleIndex && bottle.length > 0 && bottle[bottle.length - 1] !== candidate.targetColor);
  assert.ok(blockerSource > 0);
  assert.strictEqual(
    replayMegaSolutionExact(candidate, [{ fromBottle: blockerSource + 1, toBottle: 1 }]).reason,
    "mega_color");
}

function testAdsAreNeverUsedAfterAppend() {
  const level = buildMegaLevelV2(config, band, 44, 123456, 13);
  const candidate = withAds(candidateFromLevel(level));
  const moves = level.solutionMoveLists[0];
  const adIndexes = new Set([candidate.board.length - 3, candidate.board.length - 2, candidate.board.length - 1]);
  assert.ok(moves.every(move => !adIndexes.has(move.fromBottle - 1) && !adIndexes.has(move.toBottle - 1)));
  assert.strictEqual(replayMegaSolutionExact(candidate, moves).success, true);
}

function testDeterminismAndSeedVariation() {
  const a = buildMegaLevelV2(config, band, 45, 123456, 13);
  const b = buildMegaLevelV2(config, band, 45, 123456, 13);
  const c = buildMegaLevelV2(config, band, 45, 654321, 13);
  assert.deepStrictEqual(a.board, b.board);
  assert.deepStrictEqual(a.solutionMoveLists, b.solutionMoveLists);
  assert.notStrictEqual(JSON.stringify(a.board), JSON.stringify(c.board));
}

function testTemplatePenalty() {
  const repetitive = [
    { fromBottle: 2, toBottle: 9 },
    { fromBottle: 2, toBottle: 1 },
    { fromBottle: 3, toBottle: 10 },
    { fromBottle: 3, toBottle: 1 },
    { fromBottle: 4, toBottle: 11 },
    { fromBottle: 4, toBottle: 1 },
  ];
  assert.ok(templatePenalty(repetitive) >= 3);
}

function countColors(board) {
  const counts = new Map();
  for (const bottle of board) {
    for (const color of bottle) counts.set(color, (counts.get(color) || 0) + 1);
  }
  return counts;
}

function testDensityMetricExcludesHelpersAndAds() {
  const candidate = {
    board: [[0], [1, 2, 3, 4], [2, 3, 4], [], []],
    capacities: [12, 4, 4, 4, 4],
    megaBottleIndex: 0,
    targetColor: 0,
    metadata: {
      normalHelperIndexes: [3],
      adBottleIndexes: [4],
    },
  };
  const metrics = evaluateMegaDensityMetrics(candidate);
  assert.strictEqual(metrics.activeBottleCount, 2);
  assert.strictEqual(metrics.normalHelperCount, 1);
  assert.strictEqual(metrics.activeFreeSlots, 1);
  assert.strictEqual(metrics.singleLayerBottleCount, 0);
}

function testDensityRebalancePreservesCountsAndCapacity() {
  const candidate = {
    board: [[0], [1, 2, 3, 4], [5], [6], [7, 8], []],
    capacities: [12, 4, 4, 4, 4, 4],
    megaBottleIndex: 0,
    targetColor: 0,
    metadata: {
      targetGroupSources: [1],
      blockerOnlyIndexes: [2, 3, 4],
      normalHelperIndexes: [5],
      targetGroups: [{ bottleIndex: 1, groupSize: 1, blockerDepth: 1 }],
    },
  };
  const beforeCounts = countColors(candidate.board);
  rebalanceMegaDensity(candidate, band, () => 0.5);
  const afterCounts = countColors(candidate.board);
  assert.deepStrictEqual(afterCounts, beforeCounts);
  assert.ok(candidate.board.every((bottle, index) => bottle.length <= candidate.capacities[index]));
  assert.strictEqual(afterCounts.get(candidate.targetColor), beforeCounts.get(candidate.targetColor));
}

const tests = [
  testGeneratedMegaStructureAndReplay,
  testMegaCannotBeSource,
  testMegaRejectsBlockerColor,
  testAdsAreNeverUsedAfterAppend,
  testDeterminismAndSeedVariation,
  testTemplatePenalty,
  testDensityMetricExcludesHelpersAndAds,
  testDensityRebalancePreservesCountsAndCapacity,
];

for (const test of tests) test();

console.log(`mega generator v2 tests ok (${tests.length})`);
