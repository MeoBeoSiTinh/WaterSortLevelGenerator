"use strict";

const assert = require("assert");
const {
  SolverMode,
  makeInitialHiddenState,
  legalHiddenPour,
  applyHiddenPour,
  enumerateMoves,
  solveWaterSort,
  stateKey,
} = require("./watersort-exhaustive-solver");

function testAlreadySolved() {
  const result = solveWaterSort([[0, 0], [1, 1], []], 2, { mode: SolverMode.Optimal, runFastFirst: false });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.isOptimal, true);
  assert.strictEqual(result.shortestStepCount, 0);
}

function testHiddenContiguousRevealInitialAndAfterPop() {
  const state = makeInitialHiddenState([[2, 1, 1], [], []]);
  const firstPour = legalHiddenPour(state, 0, 1, 3);
  assert.deepStrictEqual(firstPour, { color: 1, amount: 2 });

  const next = applyHiddenPour(state, 0, 1, 3);
  const secondPour = legalHiddenPour(next, 0, 2, 3);
  assert.deepStrictEqual(secondPour, { color: 2, amount: 1 });
}

function testPartialPourDoesNotRevealCoveredGroup() {
  const state = makeInitialHiddenState([[2, 1, 1, 1], [1, 1], []]);
  const firstPour = legalHiddenPour(state, 0, 1, 4);
  assert.deepStrictEqual(firstPour, { color: 1, amount: 2 });

  const next = applyHiddenPour(state, 0, 1, 4);
  const remainingVisibleRed = legalHiddenPour(next, 0, 2, 4);
  assert.deepStrictEqual(remainingVisibleRed, { color: 1, amount: 1 });

  const illegalHiddenGreen = legalHiddenPour(next, 0, 1, 4);
  assert.strictEqual(illegalHiddenGreen, null);
}

function testHiddenColorsAreNotInteractableBeforeReveal() {
  const state = makeInitialHiddenState([[2, 1], [2], []]);
  assert.strictEqual(legalHiddenPour(state, 0, 1, 2), null);
}

function testCanonicalStateIncludesRevealMask() {
  const options = { canonicalizeBottleSymmetry: true, canonicalizeColorSymmetry: false };
  const a = { colors: [[0, 1], []], unlockedMasks: Uint32Array.from([0b10, 0]) };
  const b = { colors: [[0, 1], []], unlockedMasks: Uint32Array.from([0b11, 0]) };
  assert.notStrictEqual(stateKey(a, options), stateKey(b, options));
}

function testEquivalentEmptyDestinationsArePruned() {
  const state = makeInitialHiddenState([[0, 1], [], []]);
  const moves = enumerateMoves(state, 2, { skipSymmetricEmptyMoves: true, skipCompletedSource: true }, null);
  assert.strictEqual(moves.length, 1);
}

function testKnownShortestSmallPuzzle() {
  const result = solveWaterSort([[0, 1], [1, 0], [], []], 2, {
    mode: SolverMode.Optimal,
    runFastFirst: false,
    maxDepth: 8,
    maxStates: 1000,
  });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.isOptimal, true);
  assert.strictEqual(result.shortestStepCount, 3);
}

function testMultipleSolutions() {
  const result = solveWaterSort([[0, 1], [1, 0], [], []], 2, {
    mode: SolverMode.MultipleSolutions,
    runFastFirst: false,
    maxDepth: 8,
    maxStates: 1000,
    maxSolutions: 3,
    maxExtraMoves: 1,
  });
  assert.strictEqual(result.success, true);
  assert.ok(result.solutions.length >= 1);
  assert.ok(result.solutions.length <= 3);
  assert.ok(result.solutions.every(solution => solution.stepCount <= result.shortestStepCount + 1));
}

const tests = [
  testAlreadySolved,
  testHiddenContiguousRevealInitialAndAfterPop,
  testPartialPourDoesNotRevealCoveredGroup,
  testHiddenColorsAreNotInteractableBeforeReveal,
  testCanonicalStateIncludesRevealMask,
  testEquivalentEmptyDestinationsArePruned,
  testKnownShortestSmallPuzzle,
  testMultipleSolutions,
];

for (const test of tests) {
  test();
}

console.log(`watersort solver tests ok (${tests.length})`);
