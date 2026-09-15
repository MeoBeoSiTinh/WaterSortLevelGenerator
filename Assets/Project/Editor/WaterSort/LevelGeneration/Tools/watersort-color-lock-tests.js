"use strict";

const assert = require("assert");
const {
  replaySolutionWithLocks,
  countBoardColorLayers,
} = require("./generate-watersort-exhaustive-100");
const { coreGameplayFingerprint } = require("./watersort-core-fingerprint");

function testPourBlockedUntilColorUnlock() {
  const board = [
    [1, 1, 1, 1],
    [0, 0, 0],
    [0],
    [],
  ];
  const capacity = 4;
  const colorLocks = [{ index: 0, unlockRequiredColor: 0, unlockCompletedColorBottleCount: 1 }];
  assert.strictEqual(
    replaySolutionWithLocks(board, capacity, [{ fromBottle: 1, toBottle: 4 }], [], colorLocks),
    false,
    "cannot pour from color-locked bottle before unlock");
}

function testColorUnlockThenSolved() {
  const board = [
    [1, 1, 1, 1],
    [0, 0, 0],
    [0],
    [],
  ];
  const capacity = 4;
  const colorLocks = [{ index: 0, unlockRequiredColor: 0, unlockCompletedColorBottleCount: 1 }];
  assert.strictEqual(
    replaySolutionWithLocks(board, capacity, [{ fromBottle: 3, toBottle: 2 }], [], colorLocks),
    true,
    "completing required color unlocks and board can be solved");
}

function testWrongColorDoesNotUnlockSource() {
  const board = [
    [2, 2, 2, 2],
    [1, 1, 1],
    [1],
    [],
  ];
  const capacity = 4;
  const colorLocks = [{ index: 0, unlockRequiredColor: 0, unlockCompletedColorBottleCount: 1 }];
  assert.strictEqual(
    replaySolutionWithLocks(board, capacity, [
      { fromBottle: 3, toBottle: 2 },
      { fromBottle: 1, toBottle: 4 },
    ], [], colorLocks),
    false,
    "wrong completed color must not unlock");
}

function testCountAndColorLocksCoexist() {
  const board = [
    [3, 3, 3, 3],
    [2, 2, 2, 2],
    [0, 0, 0],
    [0],
    [],
  ];
  const capacity = 4;
  const countLocks = [{ index: 0, unlockCompletedBottleCount: 1 }];
  const colorLocks = [{ index: 1, unlockRequiredColor: 0, unlockCompletedColorBottleCount: 1 }];
  assert.strictEqual(
    replaySolutionWithLocks(board, capacity, [{ fromBottle: 4, toBottle: 3 }], countLocks, colorLocks),
    true);
}

function testFingerprintIncludesColorLock() {
  const a = coreGameplayFingerprint({
    modeOptions: { colorLockedBottles: true },
    bottles: [{
      capacity: 4,
      colorsBottomToTop: [0, 1],
      isColorLocked: true,
      unlockRequiredColor: 0,
      unlockCompletedColorBottleCount: 2,
    }],
  });
  const b = coreGameplayFingerprint({
    modeOptions: { colorLockedBottles: true },
    bottles: [{
      capacity: 4,
      colorsBottomToTop: [0, 1],
      isColorLocked: true,
      unlockRequiredColor: 0,
      unlockCompletedColorBottleCount: 1,
    }],
  });
  assert.notStrictEqual(a, b);
}

function testColorStockHelper() {
  const board = [[0, 0, 1], [0, 0, 0], []];
  assert.strictEqual(countBoardColorLayers(board, 0), 5);
  assert.strictEqual(countBoardColorLayers(board, 1), 1);
}

const tests = [
  testPourBlockedUntilColorUnlock,
  testColorUnlockThenSolved,
  testWrongColorDoesNotUnlockSource,
  testCountAndColorLocksCoexist,
  testFingerprintIncludesColorLock,
  testColorStockHelper,
];
for (const test of tests) test();
console.log(`color-lock tests ok (${tests.length})`);
