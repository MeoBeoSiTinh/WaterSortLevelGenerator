"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { applyHiddenPour, isSolvedState, makeInitialHiddenState } = require("./watersort-exhaustive-solver");
const { coreGameplayFingerprint } = require("./watersort-core-fingerprint");

const root = process.cwd();
const generator = path.join(root, "Assets/Project/Editor/WaterSort/LevelGeneration/Tools/generate-watersort-exhaustive-100.js");
const validator = path.join(root, "Assets/Project/Editor/WaterSort/LevelGeneration/Tools/validate-pack.js");
const levelDir = path.join(root, "Assets/Project/Data/WaterSort/Resources/WaterSort");
const solutionDir = path.join(root, "Assets/Project/Data/WaterSort/Resources/WaterSortSolutions");
const configPath = path.join(root, "Assets/Project/Data/WaterSort/Generation/WaterSortGenerationConfig.asset");

function testUnitySerializedProfileFieldOrder() {
  const { readConfig } = require(generator);
  const authoredText = fs.readFileSync(configPath, "utf8");
  const nameFirst = authoredText.replace(/^  - profileId: ([^\r\n]+)\r?\n    name: ([^\r\n]+)/gm,
    "  - name: $2\n    profileId: $1");
  const idFirst = nameFirst.replace(/^  - name: ([^\r\n]+)\r?\n    profileId: ([^\r\n]+)/gm,
    "  - profileId: $2\n    name: $1");
  const temporary = path.join(os.tmpdir(), `watersort-profile-order-${process.pid}.asset`);
  try {
    fs.writeFileSync(temporary, nameFirst);
    const legacy = readConfig(temporary);
    fs.writeFileSync(temporary, idFirst);
    const unitySerialized = readConfig(temporary);
    assert.deepStrictEqual(unitySerialized, legacy, "Unity field reordering must preserve every authored setting");
    assert.deepStrictEqual(unitySerialized.profiles.map(profile => profile.profileId), ["Easy", "Normal", "Hard", "VeryHard", "Special"]);
    for (const profile of unitySerialized.profiles) {
      assert.ok(profile.capacityWeights.length > 0, `${profile.name}: must read authored capacity weights`);
    }
    assert.strictEqual(fs.readFileSync(configPath, "utf8"), authoredText, "Parsing must not mutate config");
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary);
  }
}

function runGenerator(profile, seed, count, pack, dryRun = true, extraEnv = {}) {
  const env = {
    ...process.env,
    WATERSORT_GENERATOR_DRY_RUN: dryRun ? "1" : "0",
    WATERSORT_LEVELS_PER_PACK: String(count),
    // Pin production retry default so ambient shell env cannot shrink uniqueness tests.
    WATERSORT_DUPLICATE_RETRY_ATTEMPTS: "48",
    ...extraEnv,
  };
  const output = execFileSync(process.execPath, [generator, String(pack), String(seed), profile], {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(output.slice(output.indexOf("{")));
}

function expectGeneratorFailure(profile, seed, count, pack, pattern, extraEnv = {}) {
  try {
    runGenerator(profile, seed, count, pack, true, extraEnv);
    assert.fail("generator unexpectedly succeeded");
  } catch (error) {
    assert.match(String(error.stdout || error.stderr || error.message), pattern);
  }
}

function packPaths(pack) {
  const id = String(pack).padStart(3, "0");
  return {
    levels: path.join(levelDir, `watersort-levels-${id}.json`),
    solutions: path.join(solutionDir, `watersort-solutions-${id}.json`),
  };
}

function cleanup(pack) {
  const files = packPaths(pack);
  for (const file of [files.levels, files.solutions]) {
    if (fs.existsSync(file)) fs.rmSync(file);
  }
}

function replay(level, moves) {
  const adIndexes = new Set(level.bottles.map((bottle, index) => bottle.isAdBottle ? index : -1).filter(index => index >= 0));
  const board = level.bottles.map(bottle => (bottle.colorsBottomToTop || []).slice());
  const capacity = level.bottles.find(bottle => !bottle.isAdBottle && !bottle.isMegaBottle)?.capacity || 4;
  let state = makeInitialHiddenState(board);
  for (const move of moves) {
    assert.ok(!adIndexes.has(move.fromBottle - 1), "SafeSolution uses ad source");
    assert.ok(!adIndexes.has(move.toBottle - 1), "SafeSolution uses ad target");
    state = applyHiddenPour(state, move.fromBottle - 1, move.toBottle - 1, capacity);
    assert.ok(state, "SafeSolution contains illegal pour");
  }
  assert.ok(isSolvedState(state, capacity), "SafeSolution does not reach win");
}

function bottleCounts(level) {
  const coreBottles = level.bottles.filter(bottle => !bottle.isAdBottle);
  const adBottles = level.bottles.filter(bottle => bottle.isAdBottle);
  const capacity = coreBottles.find(bottle => !bottle.isMegaBottle)?.capacity || 4;
  return {
    core: coreBottles.length,
    ads: adBottles.length,
    normalHelpers: coreBottles.filter(bottle => !bottle.isMegaBottle && (bottle.colorsBottomToTop || []).length === 0).length,
    embeddedWorkspace: coreBottles.filter(bottle => {
      const contentLength = (bottle.colorsBottomToTop || []).length;
      return !bottle.isMegaBottle && contentLength > 0 && contentLength < capacity;
    }).length,
  };
}

function assertUniqueInBoundsLayout(level) {
  const seen = new Set();
  for (const bottle of level.bottles) {
    const position = bottle.gridPosition;
    assert.ok(position.x >= 0 && position.x < 8);
    assert.ok(position.y >= 0 && position.y < 5);
    const key = `${position.x},${position.y}`;
    assert.ok(!seen.has(key), "duplicate grid position");
    seen.add(key);
  }
}

function assertCompactLayoutMetrics(metrics) {
  assert.ok(metrics, "missing layout metrics");
  assert.strictEqual(metrics.connectedGroupCount, 1);
  assert.strictEqual(metrics.isolatedBottleCount, 0);
  assert.strictEqual(metrics.emptyRowGapCount, 0);
  assert.strictEqual(metrics.internalHorizontalGapCount, 0);
  assert.ok(metrics.centerOffset <= 0.5);
  assert.ok(metrics.rowBalanceScore >= 0.75);
  assert.ok(metrics.layoutScore > 50);
}

function assertAdsGrouped(level) {
  const ads = level.bottles.filter(bottle => bottle.isAdBottle).map(bottle => bottle.gridPosition);
  assert.ok(ads.length >= 2 && ads.length <= 3);
  const xs = ads.map(position => position.x);
  const ys = ads.map(position => position.y);
  const area = (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1);
  assert.ok(area <= ads.length + 1, "Ads are not compactly grouped");
}

function splitProfileBlocks(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let current = [];
  let inProfiles = false;
  for (const line of lines) {
    if (!inProfiles) {
      if (line === "  difficultyProfiles:") inProfiles = true;
      continue;
    }
    if (/^  [A-Za-z_]\w*:/.test(line)) break;
    if (/^  - (?:name|profileId): /.test(line)) {
      if (current.length > 0) blocks.push(current.join("\n"));
      current = [line];
      continue;
    }
    if (current.length > 0) current.push(line);
  }
  if (current.length > 0) blocks.push(current.join("\n"));
  return blocks;
}

function value(block, key) {
  return block.match(new RegExp(`^(?:  - |    )${key}:\\s*(.+)$`, "m"))?.[1]?.trim();
}

function writeTempConfigWithProfilePatch(profileName, replacements, suffix) {
  const text = fs.readFileSync(configPath, "utf8");
  const blocks = splitProfileBlocks(text);
  const block = blocks.find(candidate => candidate.match(/^(?:  - |    )name:\s*(.+)$/m)?.[1]?.trim() === profileName);
  assert.ok(block, `missing ${profileName} profile`);
  let patchedBlock = block;
  for (const [key, value] of Object.entries(replacements)) {
    patchedBlock = patchedBlock.replace(new RegExp(`^    ${key}:\\s*.+$`, "m"), `    ${key}: ${value}`);
  }
  const tempConfig = path.join(root, `Assets/Project/Data/WaterSort/Generation/WaterSortGenerationConfig.${suffix}.asset`);
  fs.writeFileSync(tempConfig, text.replace(block, patchedBlock), "utf8");
  return tempConfig;
}

function testConfigProfilesAndPreservedTuning() {
  const text = fs.readFileSync(configPath, "utf8");
  assert.match(text, /^  schemaVersion: 3$/m);
  const profiles = splitProfileBlocks(text).map(block => ({
    name: block.match(/^(?:  - |    )name:\s*(.+)$/m)[1].trim(),
    profileId: Number(value(block, "profileId") ?? block.match(/^  - profileId:\s*(.+)$/m)?.[1]?.trim()),
    minTargetBottleCount: Number(value(block, "minTargetBottleCount")),
    maxTargetBottleCount: Number(value(block, "maxTargetBottleCount")),
    minShortestStepCount: Number(value(block, "minShortestStepCount")),
    maxShortestStepCount: Number(value(block, "maxShortestStepCount")),
    allowSpecialNearWin: Number(value(block, "allowSpecialNearWin")),
    block,
  }));
  assert.deepStrictEqual(profiles.map(profile => profile.name), ["Easy", "Normal", "Hard", "VeryHard", "Special"]);
  assert.deepStrictEqual(profiles.map(profile => profile.profileId), [1, 2, 3, 4, 5]);
  assert.strictEqual(new Set(profiles.map(profile => profile.profileId)).size, 5);
  assert.strictEqual(profiles.find(profile => profile.name === "Easy").maxShortestStepCount, 5);
  assert.strictEqual(profiles.find(profile => profile.name === "Normal").minShortestStepCount, 18);
  assert.strictEqual(profiles.find(profile => profile.name === "Hard").maxShortestStepCount, 100);
  assert.ok(profiles.find(profile => profile.name === "VeryHard").minShortestStepCount > profiles.find(profile => profile.name === "Hard").minShortestStepCount);
  assert.strictEqual(profiles.find(profile => profile.name === "Special").allowSpecialNearWin, 1);
}

function testApprovedDifficultyBaselineLocked() {
  const { readConfig, profileQualityRejection } = require(generator);
  const config = readConfig();
  assert.strictEqual(config.preferredMinEmptyBottleCount, 0, "global empties floor");
  assert.strictEqual(config.preferredMaxEmptyBottleCount, 1, "global empties ceiling");

  const floors = {
    Easy: { maxHelpers: 1, minPartial: 1, maxSafe: 0.75, minDead: 0.05, minTrap: 0.1, nearWin: false },
    Normal: { maxHelpers: 1, minPartial: 2, maxSafe: 0.55, minDead: 0.15, minTrap: 0.2, nearWin: false },
    Hard: { maxHelpers: 1, minPartial: 2, maxSafe: 0.55, minDead: 0.15, minTrap: 0.2, nearWin: false },
    VeryHard: { maxHelpers: 1, minPartial: 2, maxSafe: 0.4, minDead: 0.25, minTrap: 0.3, nearWin: false },
    Special: { maxHelpers: 1, minPartial: 2, maxSafe: 0.45, minDead: 0.2, minTrap: 0.25, nearWin: true, minNearWinScore: 0.55 },
  };

  for (const profile of config.profiles) {
    const expected = floors[profile.profileId];
    assert.ok(expected, `unexpected profile ${profile.profileId}`);
    assert.ok(profile.maxNormalHelperCount <= expected.maxHelpers, `${profile.profileId}: helpers softened`);
    assert.ok(profile.minPartialBottleCount >= expected.minPartial, `${profile.profileId}: partial floor softened`);
    assert.ok(profile.maxSafeMoveRatio <= expected.maxSafe + 1e-9, `${profile.profileId}: safe-move softened`);
    assert.ok(profile.minDeadEndPotential >= expected.minDead - 1e-9, `${profile.profileId}: dead-end softened`);
    assert.ok(profile.minTrapLikelihood >= expected.minTrap - 1e-9, `${profile.profileId}: trap softened`);
    assert.strictEqual(!!profile.allowSpecialNearWin, expected.nearWin, `${profile.profileId}: NearWin flag`);
    if (expected.minNearWinScore != null) {
      assert.ok(profile.nearWin.minNearWinScore >= expected.minNearWinScore - 1e-9, "Special NearWin score softened");
    }
  }

  const hard = config.profiles.find(profile => profile.profileId === "Hard");
  assert.strictEqual(
    profileQualityRejection(hard, {
      normalHelperCount: 0,
      embeddedWorkspaceBottleCount: 2,
      activeFillRatio: 0.9,
      startingFreeRatio: 0.1,
      safeMoveRatio: 0.9,
      deadEndPotential: 0.4,
      trapLikelihood: 0.4,
      branchingFactor: 2,
      legalOpeningMoves: 4,
      criticalDecisionCount: 2,
    }),
    "safe_move_ratio_too_high",
    "quality gate must still reject overly safe Hard boards");
}

function testThreeProfileConfigMigratesForGeneration() {
  const fullText = fs.readFileSync(configPath, "utf8");
  const blocks = splitProfileBlocks(fullText);
  const threeProfileText = fullText
    .replace(/^  schemaVersion: 3$/m, "  schemaVersion: 2")
    .replace(blocks.slice(3).join("\n"), "")
    .trimEnd() + "\n";
  const tempConfig = path.join(root, "Assets/Project/Data/WaterSort/Generation/WaterSortGenerationConfig.profile-test.asset");
  try {
    fs.writeFileSync(tempConfig, threeProfileText, "utf8");
    const result = runGenerator("VeryHard", 123456, 2, 991, true, {
      WATERSORT_GENERATION_CONFIG_PATH: tempConfig,
    });
    assert.deepStrictEqual(Object.keys(result.stats.byBand), ["VeryHard"]);
    assert.strictEqual(result.stats.byBand.VeryHard.count, 2);
    const easy = blocks[0];
    const normal = blocks[1];
    const hard = blocks[2];
    assert.match(easy, /maxShortestStepCount: 5/);
    assert.match(normal, /minShortestStepCount: 18/);
    assert.match(hard, /maxShortestStepCount: 100/);
  } finally {
    if (fs.existsSync(tempConfig)) fs.rmSync(tempConfig);
  }
}

function testExplicitProfilesAndLevelNumberIndependence() {
  for (const profile of ["Easy", "Normal", "Hard", "VeryHard", "Special"]) {
    const result = runGenerator(profile, 123456, 5, 991, true);
    assert.strictEqual(Object.keys(result.stats.byBand).length, 1);
    assert.strictEqual(result.stats.byBand[profile].count, 5);
    assert.ok(result.stats.minStep >= (profile === "Easy" ? 1 : 18));
  }
}

function testDeterministicProfileSeed() {
  cleanup(992);
  try {
    runGenerator("Hard", 456789, 3, 992, false);
    const first = packPaths(992);
    const firstLevels = fs.readFileSync(first.levels, "utf8");
    const firstSolutions = fs.readFileSync(first.solutions, "utf8");
    runGenerator("Hard", 456789, 3, 992, false);
    assert.strictEqual(fs.readFileSync(first.levels, "utf8"), firstLevels);
    assert.strictEqual(fs.readFileSync(first.solutions, "utf8"), firstSolutions);
  } finally {
    cleanup(992);
  }
}

function testNearWinSpecialInvariants() {
  cleanup(993);
  try {
    runGenerator("Special", 123456, 2, 993, false);
    const files = packPaths(993);
    execFileSync(process.execPath, [validator, files.levels, files.solutions], { cwd: root, stdio: "pipe" });
    const levels = JSON.parse(fs.readFileSync(files.levels, "utf8")).levels;
    const solutions = JSON.parse(fs.readFileSync(files.solutions, "utf8")).levelSolutions;
    for (let i = 0; i < levels.length; i++) {
      const solutionData = solutions[i].solutionData;
      assert.strictEqual(solutionData.difficulty, "Special");
      assert.strictEqual(solutionData.specialOptions.type, "NearWin");
      assert.ok(solutionData.specialOptions.criticalDecisionState);
      assert.ok(solutionData.specialOptions.trapMove);
      assert.ok(solutionData.specialOptions.nearWinMetrics.nearWinScore >= 0.55);
      assert.ok(solutionData.specialOptions.supportedRescueTypes.length >= 1);
      replay(levels[i], solutionData.solutions[0].moves);
    }
  } finally {
    cleanup(993);
  }
}

function testPackCoreFingerprintsAreUniqueAndDeterministic() {
  cleanup(994);
  try {
    const first = runGenerator("Easy", 424242, 5, 994, true);
    assert.ok(Number.isInteger(first.stats.duplicateCandidatesRejected));
    assert.ok(Number.isInteger(first.stats.duplicateRetryCount));
    assert.ok(first.stats.duplicateCandidatesRejected > 0);
    assert.ok(first.stats.duplicateRetryCount > 0);
    const second = runGenerator("Easy", 424242, 5, 994, true);
    assert.deepStrictEqual(second.stats, first.stats);

    runGenerator("Easy", 424242, 5, 994, false);
    const files = packPaths(994);
    const levels = JSON.parse(fs.readFileSync(files.levels, "utf8")).levels;
    const fingerprints = levels.map((level) => coreGameplayFingerprint(level));
    assert.strictEqual(new Set(fingerprints).size, fingerprints.length);
  } finally {
    cleanup(994);
  }
}

function testGenerationFailsWhenCorePuzzleSpaceIsExhausted() {
  // Retry-budget exhaustion under duplicates (not proof of global Easy puzzle-space size).
  // Require pure duplicate fail message: no "(last rejection: ...)" quality clause before duplicate.
  expectGeneratorFailure(
    "Easy",
    424242,
    12,
    994,
    /Error: Unable to generate unique core gameplay \/ acceptable Special quality for level \d+ after 2 attempts \(last duplicate of Level \d+\)/,
    { WATERSORT_DUPLICATE_RETRY_ATTEMPTS: "2" });
}

function testValidatorRejectsDuplicateCoreGameplay() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "watersort-duplicate-validator-"));
  const levelPath = path.join(tempDir, "levels.json");
  const solutionPath = path.join(tempDir, "solutions.json");
  const solutionData = {
    solutionCount: 1,
    shortestStepCount: 1,
    storedSolutionCount: 1,
    storesAllSolutions: false,
    solutions: [{ stepCount: 1, moves: [{ fromBottle: 2, toBottle: 1 }] }],
  };
  try {
    fs.writeFileSync(levelPath, JSON.stringify({
      levels: [
        {
          id: 1,
          displayName: "A",
          layoutGrid: { columns: 8, rows: 5, shape: "circle" },
          modeOptions: {},
          bottles: [
            { capacity: 4, colorsBottomToTop: [0, 0, 0], gridPosition: { x: 0, y: 0 } },
            { capacity: 4, colorsBottomToTop: [0], gridPosition: { x: 1, y: 0 } },
            { capacity: 4, colorsBottomToTop: [], isAdBottle: true, gridPosition: { x: 2, y: 0 } },
            { capacity: 4, colorsBottomToTop: [], isAdBottle: true, gridPosition: { x: 3, y: 0 } },
          ],
        },
        {
          id: 2,
          displayName: "B",
          layoutGrid: { columns: 8, rows: 5, shape: "diamond" },
          modeOptions: {},
          bottles: [
            { capacity: 4, colorsBottomToTop: [7, 7, 7], gridPosition: { x: 4, y: 2 } },
            { capacity: 4, colorsBottomToTop: [7], gridPosition: { x: 5, y: 2 } },
            { capacity: 4, colorsBottomToTop: [], isAdBottle: true, gridPosition: { x: 6, y: 2 } },
            { capacity: 4, colorsBottomToTop: [], isAdBottle: true, gridPosition: { x: 7, y: 2 } },
            { capacity: 4, colorsBottomToTop: [], isAdBottle: true, gridPosition: { x: 0, y: 4 } },
          ],
        },
      ],
    }, null, 2), "utf8");
    fs.writeFileSync(solutionPath, JSON.stringify({
      levelSolutions: [
        { levelNumber: 1, solutionData },
        { levelNumber: 2, solutionData },
      ],
    }, null, 2), "utf8");
    try {
      execFileSync(process.execPath, [validator, levelPath, solutionPath], { cwd: root, encoding: "utf8" });
      assert.fail("validator accepted duplicate core gameplay");
    } catch (error) {
      assert.match(String(error.stdout || error.stderr || error.message), /duplicate core gameplay/);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function testOneFieldOverrideDerivesCompatibleParameters() {
  const result = runGenerator("Special", 123456, 1, 981, true, {
    WATERSORT_GENERATION_OVERRIDES: JSON.stringify({ coreBottleCount: 6 }),
  });
  assert.strictEqual(result.generationDiagnostics.resolved.difficulty, "Special");
  assert.strictEqual(result.generationDiagnostics.resolved.coreBottleCount, "6-6");
  assert.deepStrictEqual(result.generationDiagnostics.fixedByUser, ["coreBottleCount"]);
  assert.ok(result.generationDiagnostics.autoAdjusted.includes("colorCount"));
  assert.ok(result.generationDiagnostics.autoAdjusted.includes("normalHelperCount"));
  assert.strictEqual(result.stats.byBand.Special.count, 1);
  assert.strictEqual(result.stats.byBand.Special.minBottles - result.stats.byBand.Special.minAdBottles, 6);
}

function testMultipleOverridesRemainHardConstraints() {
  const result = runGenerator("Normal", 123456, 1, 982, true, {
    WATERSORT_GENERATION_OVERRIDES: JSON.stringify({
      coreBottleCount: 7,
      bottleCapacity: 4,
      normalHelperCount: 1,
    }),
  });
  const diagnostics = result.generationDiagnostics;
  assert.strictEqual(diagnostics.resolved.coreBottleCount, "7-7");
  assert.deepStrictEqual(diagnostics.resolved.bottleCapacity, [4]);
  assert.strictEqual(diagnostics.resolved.normalHelperCount, "1-1");
  assert.ok(diagnostics.fixedByUser.includes("coreBottleCount"));
  assert.ok(diagnostics.fixedByUser.includes("bottleCapacity"));
  assert.ok(diagnostics.fixedByUser.includes("normalHelperCount"));
  assert.strictEqual(result.stats.byBand.Normal.minBottles - result.stats.byBand.Normal.minAdBottles, 7);
}

function testColorOverridePreservesHardDifficultyIdentity() {
  const result = runGenerator("Hard", 123456, 1, 983, true, {
    WATERSORT_GENERATION_OVERRIDES: JSON.stringify({ colorCount: 8 }),
  });
  assert.strictEqual(result.generationDiagnostics.resolved.difficulty, "Hard");
  assert.deepStrictEqual(result.generationDiagnostics.resolved.colorCount, [8]);
  assert.ok(result.generationDiagnostics.fixedByUser.includes("colorCount"));
  assert.strictEqual(result.stats.byBand.Hard.count, 1);
  assert.ok(result.stats.byBand.Hard.minStep >= 16);
}

function testCapacityOverrideSolvesMatchingModules() {
  const result = runGenerator("VeryHard", 123456, 1, 984, true, {
    WATERSORT_GENERATION_OVERRIDES: JSON.stringify({ bottleCapacity: 5 }),
  });
  assert.deepStrictEqual(result.generationDiagnostics.resolved.bottleCapacity, [5]);
  assert.ok(result.generationDiagnostics.fixedByUser.includes("bottleCapacity"));
  assert.strictEqual(result.stats.byCapacity["5"], 1);
}

function testInvalidHardOverrideReportsConstraintFailure() {
  expectGeneratorFailure(
    "VeryHard",
    123456,
    1,
    985,
    /GenerationConstraintFailure: requested coreBottleCount/,
    {
      WATERSORT_GENERATION_OVERRIDES: JSON.stringify({ coreBottleCount: 2 }),
    });
}

function testExplicitNearWinOverrideReportsInfeasibleWhenTrapCannotBeBuilt() {
  expectGeneratorFailure(
    "Special",
    123456,
    1,
    986,
    /GenerationConstraintFailure: requested NearWin could not be constructed/,
    {
      WATERSORT_GENERATION_OVERRIDES: JSON.stringify({ coreBottleCount: 5, bottleCapacity: 2, nearWin: true }),
    });
}

function testSpecialNearWinCustomBottleCountPreservesNearWinRules() {
  const result = runGenerator("Special", 123456, 1, 988, true, {
    WATERSORT_GENERATION_OVERRIDES: JSON.stringify({ coreBottleCount: 17, nearWin: true }),
  });
  assert.strictEqual(result.generationDiagnostics.resolved.coreBottleCount, "17-17");
  assert.strictEqual(result.generationDiagnostics.resolved.nearWin, true);
  assert.ok(result.generationDiagnostics.fixedByUser.includes("coreBottleCount"));
  assert.ok(result.generationDiagnostics.fixedByUser.includes("nearWin"));
  assert.strictEqual(result.stats.byBand.Special.nearWin, 1);
  assert.strictEqual(result.stats.byBand.Special.minBottles - result.stats.byBand.Special.minAdBottles, 17);
}

function testSpecialNearWinTenBottleUsesCoreCountAndPressureMetrics() {
  cleanup(989);
  try {
    const env = {
      WATERSORT_GENERATION_OVERRIDES: JSON.stringify({ bottleCount: 10 }),
    };
    const result = runGenerator("Special", 123456, 1, 989, false, env);
    assert.strictEqual(result.generationDiagnostics.resolved.coreBottleCount, "10-10");
    assert.strictEqual(result.generationDiagnostics.resolved.nearWin, true);
    assert.strictEqual(result.stats.byBand.Special.minBottles - result.stats.byBand.Special.minAdBottles, 10);

    const files = packPaths(989);
    execFileSync(process.execPath, [validator, files.levels, files.solutions], { cwd: root, stdio: "pipe" });
    const level = JSON.parse(fs.readFileSync(files.levels, "utf8")).levels[0];
    const solutionData = JSON.parse(fs.readFileSync(files.solutions, "utf8")).levelSolutions[0].solutionData;
    const counts = bottleCounts(level);
    assert.strictEqual(counts.core, 10);
    assert.ok(counts.ads >= 2 && counts.ads <= 3);
    assert.ok(counts.normalHelpers <= 1);
    assert.ok(counts.embeddedWorkspace >= 2);
    assert.strictEqual(solutionData.specialOptions.type, "NearWin");
    assert.ok(solutionData.shortestStepCount >= result.generationDiagnostics.resolved.solutionTarget.split("-").map(Number)[0]);
    assert.ok(solutionData.difficultyMetrics.difficultyScore >= 0.25);
    assert.ok(solutionData.difficultyMetrics.branchingFactor >= 0.05);
    assert.ok(solutionData.difficultyMetrics.falseProgressScore >= 0);
    assert.ok(solutionData.difficultyMetrics.trapLikelihood >= 0.1);
    assert.ok(counts.normalHelpers <= 1);
    assert.ok(counts.embeddedWorkspace >= 1);
    assert.ok(solutionData.specialOptions.nearWinMetrics.nearWinScore >= 0.55);
    assert.strictEqual(solutionData.difficultyMetrics.normalHelperCount, counts.normalHelpers);
    assert.strictEqual(solutionData.difficultyMetrics.embeddedWorkspaceBottleCount, counts.embeddedWorkspace);
    assert.strictEqual(solutionData.difficultyMetrics.coreBottleCountExcludingAds, 10);
    assert.strictEqual(solutionData.specialOptions.nearWinMetrics.coreBottleCountExcludingAds, 10);
    assert.ok("branchingFactor" in solutionData.specialOptions.nearWinMetrics);
    assert.ok("safeMoveRatio" in solutionData.specialOptions.nearWinMetrics);
    assert.ok("criticalDecisionCount" in solutionData.specialOptions.nearWinMetrics);
    assert.ok("falseProgressScore" in solutionData.specialOptions.nearWinMetrics);
    assert.ok("trapLikelihood" in solutionData.specialOptions.nearWinMetrics);
    assert.ok("recoveryPenalty" in solutionData.specialOptions.nearWinMetrics);
    replay(level, solutionData.solutions[0].moves);
  } finally {
    cleanup(989);
  }
}

function testCompactLayoutRulesAndReplayRemainValid() {
  cleanup(990);
  try {
    runGenerator("Hard", 222222, 3, 990, false);
    const files = packPaths(990);
    execFileSync(process.execPath, [validator, files.levels, files.solutions], { cwd: root, stdio: "pipe" });
    const levels = JSON.parse(fs.readFileSync(files.levels, "utf8")).levels;
    const solutions = JSON.parse(fs.readFileSync(files.solutions, "utf8")).levelSolutions;
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      const solutionData = solutions[i].solutionData;
      if (level.modeOptions?.megaBottle || level.bottles.some(bottle => bottle.isMegaBottle)) continue;
      assertUniqueInBoundsLayout(level);
      assertCompactLayoutMetrics(solutionData.layoutMetrics);
      assertAdsGrouped(level);
      replay(level, solutionData.solutions[0].moves);
    }
  } finally {
    cleanup(990);
  }
}

function testSameSeedProducesSameLayout() {
  cleanup(978);
  try {
    runGenerator("Hard", 333333, 2, 978, false);
    const first = JSON.parse(fs.readFileSync(packPaths(978).levels, "utf8")).levels
      .map(level => level.bottles.map(bottle => bottle.gridPosition));
    runGenerator("Hard", 333333, 2, 978, false);
    const second = JSON.parse(fs.readFileSync(packPaths(978).levels, "utf8")).levels
      .map(level => level.bottles.map(bottle => bottle.gridPosition));
    assert.deepStrictEqual(second, first);
  } finally {
    cleanup(978);
  }
}

function testMegaLayoutKeepsMegaCentralWhenPresent() {
  cleanup(977);
  const tempConfig = writeTempConfigWithProfilePatch("Hard", {
    allowMegaBottleMode: 1,
    megaBottleChance: 1,
  }, "mega-layout-test");
  try {
    const result = runGenerator("Hard", 444444, 1, 977, false, {
      WATERSORT_GENERATION_CONFIG_PATH: tempConfig,
    });
    assert.strictEqual(result.stats.megaBottle, 1);
    const files = packPaths(977);
    execFileSync(process.execPath, [validator, files.levels, files.solutions], { cwd: root, stdio: "pipe" });
    const levels = JSON.parse(fs.readFileSync(files.levels, "utf8")).levels;
    const solutions = JSON.parse(fs.readFileSync(files.solutions, "utf8")).levelSolutions;
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      if (!level.modeOptions.megaBottle) continue;
      const mega = level.bottles.find(bottle => bottle.isMegaBottle);
      assert.ok(mega, "missing Mega bottle");
      assert.ok(Math.hypot(mega.gridPosition.x - 3.5, mega.gridPosition.y - 2) <= 1);
      assertUniqueInBoundsLayout(level);
      assertCompactLayoutMetrics(solutions[i].solutionData.layoutMetrics);
    }
  } finally {
    cleanup(977);
    if (fs.existsSync(tempConfig)) fs.rmSync(tempConfig);
  }
}

function testAdaptiveOverridesAreDeterministicAndDoNotMutateConfig() {
  const before = fs.readFileSync(configPath, "utf8");
  const env = {
    WATERSORT_GENERATION_OVERRIDES: JSON.stringify({ coreBottleCount: 6 }),
  };
  const first = runGenerator("Special", 777777, 1, 987, true, env);
  const second = runGenerator("Special", 777777, 1, 987, true, env);
  const after = fs.readFileSync(configPath, "utf8");
  assert.deepStrictEqual(second.generationDiagnostics, first.generationDiagnostics);
  assert.deepStrictEqual(second.stats, first.stats);
  assert.strictEqual(after, before);
}

function testTrivialNearCompleteColorSplitRejected() {
  const {
    hasTrivialNearCompleteColorSplit,
    moduleSizesForCapacity,
  } = require(generator);
  assert.ok(!moduleSizesForCapacity(4).includes(1), "1-color modules must be excluded");
  assert.ok(!moduleSizesForCapacity(5).includes(1), "1-color modules must be excluded for capacity 5");
  assert.strictEqual(
    hasTrivialNearCompleteColorSplit([[0, 0, 0], [0], [1, 2, 3, 1]], 4),
    true,
    "capacity-1 + 1 split must be detected");
  assert.strictEqual(
    hasTrivialNearCompleteColorSplit([[0, 0], [0, 0], [1, 2, 3, 1]], 4),
    false,
    "2+2 split is not the rejected pattern");
  assert.strictEqual(
    hasTrivialNearCompleteColorSplit([[0, 1, 2, 0], [1, 2], [0, 1, 2, 3]], 4),
    false,
    "mixed multi-bottle colors without a pure 1+(capacity-1) partition must pass");
}

const tests = [
  testUnitySerializedProfileFieldOrder,
  testTrivialNearCompleteColorSplitRejected,
  testConfigProfilesAndPreservedTuning,
  testApprovedDifficultyBaselineLocked,
  testThreeProfileConfigMigratesForGeneration,
  testExplicitProfilesAndLevelNumberIndependence,
  testDeterministicProfileSeed,
  testNearWinSpecialInvariants,
  testPackCoreFingerprintsAreUniqueAndDeterministic,
  testGenerationFailsWhenCorePuzzleSpaceIsExhausted,
  testValidatorRejectsDuplicateCoreGameplay,
  testOneFieldOverrideDerivesCompatibleParameters,
  testMultipleOverridesRemainHardConstraints,
  testColorOverridePreservesHardDifficultyIdentity,
  testCapacityOverrideSolvesMatchingModules,
  testInvalidHardOverrideReportsConstraintFailure,
  testExplicitNearWinOverrideReportsInfeasibleWhenTrapCannotBeBuilt,
  testSpecialNearWinCustomBottleCountPreservesNearWinRules,
  testSpecialNearWinTenBottleUsesCoreCountAndPressureMetrics,
  testCompactLayoutRulesAndReplayRemainValid,
  testSameSeedProducesSameLayout,
  testMegaLayoutKeepsMegaCentralWhenPresent,
  testAdaptiveOverridesAreDeterministicAndDoNotMutateConfig,
];
const filter = process.env.WATERSORT_PROFILE_TEST_FILTER;
const selectedTests = filter ? tests.filter(test => test.name.includes(filter)) : tests;
assert.ok(selectedTests.length > 0, `No generator profile tests match ${filter}`);
for (const test of selectedTests) test();
console.log(`generator profile tests ok (${selectedTests.length})`);
