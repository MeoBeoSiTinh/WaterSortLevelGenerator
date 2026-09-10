"use strict";

const assert = require("assert");
const {
  coreGameplayFingerprint,
  coreGameplayFingerprintFromBoard,
} = require("./watersort-core-fingerprint");

function bottle(capacity, colors, extras = {}) {
  return {
    capacity,
    colorsBottomToTop: colors,
    gridPosition: extras.gridPosition || { x: 0, y: 0 },
    ...extras,
  };
}

function level(bottles, modeOptions = {}) {
  return {
    id: 1,
    displayName: "Level 1",
    layoutGrid: { columns: 8, rows: 5, shape: "circle" },
    generationMetadata: { ignored: true },
    modeOptions,
    bottles,
  };
}

function fingerprint(bottles, modeOptions = {}) {
  return coreGameplayFingerprint(level(bottles, modeOptions));
}

function testAdCountIsIgnored() {
  const core = [
    bottle(4, [1, 2, 1, 2]),
    bottle(4, [2, 1, 2, 1]),
    bottle(4, []),
  ];
  const twoAds = fingerprint(core.concat([bottle(4, [], { isAdBottle: true }), bottle(4, [], { isAdBottle: true })]));
  const threeAds = fingerprint(core.concat([
    bottle(4, [], { isAdBottle: true }),
    bottle(4, [], { isAdBottle: true }),
    bottle(4, [], { isAdBottle: true }),
  ]));
  assert.strictEqual(twoAds, threeAds);
}

function testAdAndGridPositionsAreIgnored() {
  const first = fingerprint([
    bottle(4, [1, 2], { gridPosition: { x: 0, y: 0 } }),
    bottle(4, [], { gridPosition: { x: 1, y: 0 } }),
    bottle(4, [], { isAdBottle: true, gridPosition: { x: 2, y: 0 } }),
  ]);
  const second = fingerprint([
    bottle(4, [], { isAdBottle: true, gridPosition: { x: 7, y: 4 } }),
    bottle(4, [], { gridPosition: { x: 5, y: 3 } }),
    bottle(4, [1, 2], { gridPosition: { x: 3, y: 2 } }),
  ]);
  assert.strictEqual(first, second);
}

function testColorRenamingAndBottleReorderingAreIgnored() {
  const first = fingerprint([
    bottle(4, [1, 2, 1]),
    bottle(4, [2, 3]),
    bottle(4, [3, 1]),
    bottle(4, []),
  ]);
  const renamedAndReordered = fingerprint([
    bottle(4, []),
    bottle(4, [12, 9]),
    bottle(4, [9, 10, 9]),
    bottle(4, [10, 12]),
  ]);
  assert.strictEqual(first, renamedAndReordered);
}

function testNormalHelperCountMatters() {
  assert.notStrictEqual(
    fingerprint([bottle(4, [1, 2]), bottle(4, [])]),
    fingerprint([bottle(4, [1, 2]), bottle(4, []), bottle(4, [])]));
}

function testContentsMatter() {
  assert.notStrictEqual(
    fingerprint([bottle(4, [1, 2]), bottle(4, [])]),
    fingerprint([bottle(4, [1, 1]), bottle(4, [])]));
}

function testHiddenLockAndMegaDataMatter() {
  assert.notStrictEqual(
    fingerprint([bottle(4, [1, 2, 3], { hiddenLayerIndexes: [0] })], { hybridHiddenStack: true }),
    fingerprint([bottle(4, [1, 2, 3], { hiddenLayerIndexes: [1] })], { hybridHiddenStack: true }));

  assert.notStrictEqual(
    fingerprint([bottle(4, [1, 2], { isLocked: true, unlockCompletedBottleCount: 1 })], { lockedBottles: true }),
    fingerprint([bottle(4, [1, 2], { isLocked: true, unlockCompletedBottleCount: 2 })], { lockedBottles: true }));

  assert.notStrictEqual(
    fingerprint([bottle(12, [1], { isMegaBottle: true, targetColor: 1 }), bottle(4, [2, 1])], { megaBottle: true }),
    fingerprint([bottle(12, [1], { isMegaBottle: true, targetColor: 1 }), bottle(4, [1, 2])], { megaBottle: true }));
}

function testBoardFingerprintMatchesLevelFingerprint() {
  const board = [[5, 6], [], [], []];
  const fromBoard = coreGameplayFingerprintFromBoard({
    board,
    capacity: 4,
    firstAdBottleIndex: 2,
    modeOptions: {},
  });
  const fromLevel = fingerprint([
    bottle(4, [5, 6]),
    bottle(4, []),
    bottle(4, [], { isAdBottle: true }),
    bottle(4, [], { isAdBottle: true }),
  ]);
  assert.strictEqual(fromBoard, fromLevel);
}

const tests = [
  testAdCountIsIgnored,
  testAdAndGridPositionsAreIgnored,
  testColorRenamingAndBottleReorderingAreIgnored,
  testNormalHelperCountMatters,
  testContentsMatter,
  testHiddenLockAndMegaDataMatter,
  testBoardFingerprintMatchesLevelFingerprint,
];

for (const test of tests) test();

console.log(`core gameplay fingerprint tests ok (${tests.length})`);
