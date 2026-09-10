"use strict";

const fs = require("fs");
const path = require("path");
const {
  applyHiddenPour,
  isSolvedState,
  makeInitialHiddenState,
  solveExhaustiveHidden,
} = require("./watersort-exhaustive-solver");

const root = process.cwd();
const assetRoot = resolveAssetRoot();
const levelRelativeDir = `${assetRoot}/Data/WaterSort/Resources/WaterSort`;
const solutionRelativeDir = `${assetRoot}/Data/WaterSort/Resources/WaterSortSolutions`;
const levelDir = path.join(root, levelRelativeDir);
const solutionDir = path.join(root, solutionRelativeDir);
const configPath = path.join(root, `${assetRoot}/Data/WaterSort/Generation/WaterSortGenerationConfig.asset`);
const paletteSize = 13;

const packIndex = parsePackIndex(process.argv[2] ?? process.env.WATERSORT_PACK_INDEX ?? "1");
const generatorSeed = parseSeed(process.argv[3] ?? process.env.WATERSORT_GENERATOR_SEED ?? "0");
const packId = String(packIndex).padStart(3, "0");
const levelFile = path.join(levelDir, `watersort-levels-${packId}.json`);
const solutionFile = path.join(solutionDir, `watersort-solutions-${packId}.json`);

function resolveAssetRoot() {
  // Production defaults to Assets/Project. A package/test root must be explicit.
  return String(process.env.WATERSORT_ASSET_ROOT || "Assets/Project").replace(/[\\/]+$/, "");
}

function parsePackIndex(value) {
  const pack = Number(value);
  if (!Number.isInteger(pack) || pack < 1 || pack > 999) {
    throw new Error(`Invalid Water Sort pack index: ${value}`);
  }
  return pack;
}

function parseSeed(value) {
  const seed = Number(value);
  if (!Number.isInteger(seed) || seed < 0) {
    throw new Error(`Invalid Water Sort generator seed: ${value}`);
  }
  return seed >>> 0;
}

function assertScoped(dir, expectedSuffix) {
  const resolved = path.resolve(dir);
  const expected = path.resolve(root, expectedSuffix);
  if (resolved !== expected) throw new Error(`Refusing to write outside expected folder: ${resolved}`);
}

function readConfig() {
  const text = fs.readFileSync(configPath, "utf8");
  const cleanYamlScalar = value => String(value ?? "").trim().replace(/^[\"']|[\"']$/g, "");
  const parseScalar = (raw, fallback) => {
    if (raw == null) return fallback;
    const value = String(raw).trim();
    if (value === "1" || value.toLowerCase() === "true") return true;
    if (value === "0" || value.toLowerCase() === "false") return false;
    const number = Number(value);
    return Number.isFinite(number) ? number : cleanYamlScalar(value);
  };
  const top = (name, fallback) => {
    const match = text.match(new RegExp(`^  ${name}:\\s*(.+)$`, "m"));
    return match ? parseScalar(match[1], fallback) : fallback;
  };

  const profileHeader = text.match(/^  difficultyProfiles:\s*$/m);
  if (!profileHeader) throw new Error(`Missing difficultyProfiles in ${configPath}`);
  let profileBlock = text.slice(profileHeader.index + profileHeader[0].length);
  const legacyBandOffset = profileBlock.search(/^  difficultyBands:\s*$/m);
  if (legacyBandOffset >= 0) profileBlock = profileBlock.slice(0, legacyBandOffset);

  const difficultyProfiles = [];
  const parts = profileBlock.split(/\n  - name:\s*/).slice(1);
  for (const part of parts) {
    const name = cleanYamlScalar(part.split(/\r?\n/, 1)[0]);
    const getRaw = key => {
      const match = part.match(new RegExp(`^    ${key}:\\s*(.+)$`, "m"));
      return match ? match[1] : null;
    };
    const get = (key, fallback) => parseScalar(getRaw(key), fallback);
    const getBool = (key, fallback) => Boolean(get(key, fallback));
    const parseWeights = (sectionName, valueName) => {
      const section = part.match(new RegExp(`^    ${sectionName}:\\r?\\n([\\s\\S]*?)(?=^    \\w|\\z)`, "m"));
      if (!section) return [];
      const rows = [];
      const rx = new RegExp(`^    - ${valueName}:\\s*(\\d+)\\r?\\n      weight:\\s*(\\d+)`, "gm");
      let match;
      while ((match = rx.exec(section[1])) !== null) {
        rows.push({ value: Number(match[1]), weight: Number(match[2]) });
      }
      return rows;
    };
    const parseShapeWeights = () => {
      const section = part.match(/^    gridShapeWeights:\r?\n([\s\S]*?)(?=^    \w|\z)/m);
      if (!section) return [];
      const rows = [];
      const rx = /^    - shape:\s*(.+)\r?\n      weight:\s*(\d+)(?:\r?\n      minBottleCount:\s*(\d+))?(?:\r?\n      maxBottleCount:\s*(\d+))?/gm;
      let match;
      while ((match = rx.exec(section[1])) !== null) {
        rows.push({
          value: cleanYamlScalar(match[1]),
          weight: Number(match[2]),
          minBottleCount: match[3] ? Number(match[3]) : 1,
          maxBottleCount: match[4] ? Number(match[4]) : 40,
        });
      }
      return rows;
    };
    const parseNearWin = () => {
      const section = part.match(/^    nearWin:\r?\n([\s\S]*?)(?=^    \w|\z)/m);
      const body = section?.[1] ?? "";
      const nested = (key, fallback) => {
        const match = body.match(new RegExp(`^      ${key}:\\s*(.+)$`, "m"));
        return match ? parseScalar(match[1], fallback) : fallback;
      };
      return {
        minNearWinScore: Number(nested("minNearWinScore", 0.75)),
        minCriticalDepthRatio: Number(nested("minCriticalDepthRatio", 0.4)),
        maxCriticalDepthRatio: Number(nested("maxCriticalDepthRatio", 0.85)),
        maxCriticalStates: Number(nested("maxCriticalStates", 24)),
        maxTrapCandidates: Number(nested("maxTrapCandidates", 24)),
        trapSolverMaxStates: Number(nested("trapSolverMaxStates", 100000)),
        trapSolverMaxDepth: Number(nested("trapSolverMaxDepth", 140)),
        minSoftTrapRecoveryPenalty: Number(nested("minSoftTrapRecoveryPenalty", 6)),
        minSoftTrapRecoveryRatio: Number(nested("minSoftTrapRecoveryRatio", 1.35)),
        softTrapWeight: Number(nested("softTrapWeight", 0.55)),
        strongTrapWeight: Number(nested("strongTrapWeight", 0.35)),
        hardDeadlockWeight: Number(nested("hardDeadlockWeight", 0.1)),
        allowAddBottleRescue: Boolean(nested("allowAddBottleRescue", true)),
        allowShuffleRescue: Boolean(nested("allowShuffleRescue", true)),
        shuffleCandidateCount: Number(nested("shuffleCandidateCount", 24)),
        minShuffleRemainingSteps: Number(nested("minShuffleRemainingSteps", 2)),
      };
    };

    const special = name.toLowerCase() === "special";
    difficultyProfiles.push({
      name,
      profileId: Number(get("profileId", 0)),
      enabled: getBool("enabled", true),
      targetDifficultyScoreMin: Number(get("targetDifficultyScoreMin", special ? 0.75 : 0.5)),
      targetDifficultyScoreMax: Number(get("targetDifficultyScoreMax", 1)),
      colorWeights: parseWeights("colorWeights", "colorCount"),
      helperWeights: parseWeights("helperCapacityWeights", "helperCapacity"),
      capacityWeights: parseWeights("bottleCapacityWeights", "capacity"),
      shapeWeights: parseShapeWeights(),
      allowHiddenStackMode: getBool("allowHiddenStackMode", false),
      hiddenStackChance: Number(get("hiddenStackChance", 0)),
      allowHybridHiddenStackMode: getBool("allowHybridHiddenStackMode", false),
      hybridHiddenStackChance: Number(get("hybridHiddenStackChance", 0)),
      hybridHiddenBottleChance: Number(get("hybridHiddenBottleChance", 0.5)),
      minHybridHiddenLayersPerBottle: Number(get("minHybridHiddenLayersPerBottle", 1)),
      maxHybridHiddenLayersPerBottle: Number(get("maxHybridHiddenLayersPerBottle", 2)),
      allowLockedBottleMode: getBool("allowLockedBottleMode", false),
      lockedBottleChance: Number(get("lockedBottleChance", 0)),
      minLockedBottleCount: Number(get("minLockedBottleCount", 1)),
      maxLockedBottleCount: Number(get("maxLockedBottleCount", 4)),
      minCompletedBottleCountToUnlock: Number(get("minCompletedBottleCountToUnlock", 1)),
      maxCompletedBottleCountToUnlock: Number(get("maxCompletedBottleCountToUnlock", 3)),
      allowMegaBottleMode: getBool("allowMegaBottleMode", false),
      megaBottleChance: Number(get("megaBottleChance", 0)),
      minMegaBottleCapacity: Number(get("minMegaBottleCapacity", 12)),
      maxMegaBottleCapacity: Number(get("maxMegaBottleCapacity", 20)),
      minTargetBottleCount: Number(get("minTargetBottleCount", 4)),
      maxTargetBottleCount: Number(get("maxTargetBottleCount", 40)),
      minShortestStepCount: Number(get("minShortestStepCount", 8)),
      maxShortestStepCount: Number(get("maxShortestStepCount", 80)),
      maxSolutionCount: Number(get("maxSolutionCount", 1000000)),
      storedSolutionTarget: Number(get("storedSolutionTarget", 1)),
      allowSmallIntroLevel: getBool("allowSmallIntroLevel", false),
      allowSpecialNearWin: getBool("allowSpecialNearWin", false),
      nearWin: parseNearWin(),

      // Generic adaptive fields are optional in the current schema. Defaults make
      // Special dense and decision-heavy even before the C# schema is upgraded.
      minNormalHelperCount: Number(get("minNormalHelperCount", special ? 0 : 1)),
      maxNormalHelperCount: Number(get("maxNormalHelperCount", special ? 1 : 3)),
      minActiveFillRatio: Number(get("minActiveFillRatio", special ? 0.7 : 0.5)),
      targetActiveFillRatio: Number(get("targetActiveFillRatio", special ? 0.8 : 0.75)),
      maxStartingFreeRatio: Number(get("maxStartingFreeRatio", special ? 0.3 : 0.5)),
      minPartialBottleCount: Number(get("minPartialBottleCount", special ? 3 : 0)),
      maxSafeMoveRatio: Number(get("maxSafeMoveRatio", special ? 0.55 : 1)),
      minAverageBranchingFactor: Number(get("minAverageBranchingFactor", special ? 2.2 : 0)),
      minCriticalDecisionCount: Number(get("minCriticalDecisionCount", special ? 1 : 0)),
      candidateAttemptCount: Number(get("candidateAttemptCount", special ? 6 : 1)),
    });
  }

  if (difficultyProfiles.length === 0) throw new Error(`No difficulty profiles found in ${configPath}`);

  return {
    selectedDifficultyProfile: String(top("selectedDifficultyProfile", "Hard")),
    levelsPerPack: Number(top("levelsPerPack", 100)),
    solutionExampleLimitWhenMany: Number(top("solutionExampleLimitWhenMany", 3)),
    manySolutionThreshold: Number(top("manySolutionThreshold", 10)),
    defaultBottleCapacity: Number(top("defaultBottleCapacity", 4)),
    layoutGridColumns: Number(top("layoutGridColumns", 8)),
    layoutGridRows: Number(top("layoutGridRows", 5)),
    preferredMinEmptyBottleCount: Number(top("preferredMinEmptyBottleCount", 1)),
    preferredMaxEmptyBottleCount: Number(top("preferredMaxEmptyBottleCount", 3)),
    maxBottleCount: Number(top("maxBottleCount", 40)),
    selectionPolicy: String(top("selectionPolicy", "shortest_non_loop_empty_priority_opening_diversity_soft")),
    difficultyProfiles,
  };
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function seedFor(levelNumber, salt, multiplier) {
  return (salt ^ Math.imul(levelNumber, multiplier) ^ Math.imul(generatorSeed, 2654435761)) >>> 0;
}

function randomInt(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

function weighted(random, rows, fallback) {
  const total = rows.reduce((sum, row) => sum + Math.max(0, row.weight), 0);
  if (total <= 0) return fallback;
  let roll = random() * total;
  for (const row of rows) {
    roll -= Math.max(0, row.weight);
    if (roll <= 0) return row.value;
  }
  return rows[rows.length - 1].value;
}

function capacityFor(config, profile, random) {
  return Math.max(2, Math.min(5, weighted(random, profile.capacityWeights, config.defaultBottleCapacity)));
}

function capacityOptionsFor(config, profile, preferredCapacity) {
  const weightedCapacities = profile.capacityWeights
    .filter(row => row.weight > 0)
    .map(row => Math.max(2, Math.min(5, row.value)));
  const capacities = [preferredCapacity, ...weightedCapacities, config.defaultBottleCapacity]
    .map(capacity => Math.max(2, Math.min(5, capacity)));
  return Array.from(new Set(capacities));
}

function chooseShapeForBottleCount(profile, bottleCount, levelNumber) {
  if (isSpecialProfile(profile)) return "compact";
  const shapes = profile.shapeWeights.length > 0
    ? profile.shapeWeights
    : [{ value: "square", weight: 1, minBottleCount: 1, maxBottleCount: 40 }];
  const scored = shapes
    .filter(shape => shape.weight > 0)
    .map(shape => ({
      shape,
      fitCost: bottleCount < shape.minBottleCount
        ? shape.minBottleCount - bottleCount
        : bottleCount > shape.maxBottleCount
          ? bottleCount - shape.maxBottleCount
          : 0,
    }));
  const bestFitCost = Math.min(...scored.map(candidate => candidate.fitCost));
  const candidates = scored.filter(candidate => candidate.fitCost === bestFitCost);
  const denseCandidates = candidates.filter(candidate => isDenseShape(candidate.shape.value));
  if (bottleCount >= 9 && denseCandidates.length > 0 && stableShapeTieBreak(`${profile.name}:dense:${bottleCount}`, levelNumber) % 100 < 70) {
    return pickWeightedShape(denseCandidates, `${profile.name}:dense:${bottleCount}`, levelNumber);
  }
  return pickWeightedShape(candidates, `${profile.name}:${bottleCount}`, levelNumber);
}

function isDenseShape(shape) {
  return ["dense", "compact", "block", "compact_zigzag", "dense_zigzag", "staggered", "stagger", "honeycomb", "dense_columns", "columns"]
    .includes(String(shape || "").toLowerCase());
}

function pickWeightedShape(candidates, key, levelNumber) {
  if (candidates.length === 0) return "square";
  const totalWeight = candidates.reduce((sum, candidate) => sum + Math.max(1, candidate.shape.weight), 0);
  let slot = stableShapeTieBreak(key, levelNumber) % totalWeight;
  for (const candidate of candidates) {
    slot -= Math.max(1, candidate.shape.weight);
    if (slot < 0) return candidate.shape.value;
  }
  return candidates[0].shape.value;
}

function applyDenseLayoutPreference(shape, profile, bottleCount, levelNumber) {
  if (isSpecialProfile(profile)) return "compact";
  if (bottleCount < 9) return shape;
  const chance = 45;
  if (stableShapeTieBreak(`${profile.name}:dense-layout-preference`, levelNumber) % 100 >= chance) return shape;
  const configuredDenseShapes = profile.shapeWeights
    .filter(row => row.weight > 0 && isDenseShape(row.value) && bottleCount >= row.minBottleCount && bottleCount <= row.maxBottleCount)
    .map(row => row.value);
  const pool = configuredDenseShapes.length > 0
    ? configuredDenseShapes
    : ["dense", "compact_zigzag", "staggered", "honeycomb", "dense_columns"];
  return pool[stableShapeTieBreak(`${profile.name}:dense-layout-pool:${bottleCount}`, levelNumber) % pool.length];
}

function applyAlternatingGapPreference(shape, profile, bottleCount, levelNumber) {
  // Special layouts should not create detached visual islands/checkerboard gaps.
  if (isSpecialProfile(profile) || bottleCount < 9) return shape;
  const chance = 18;
  if (stableShapeTieBreak(`${profile.name}:alternating-gap-preference`, levelNumber) % 100 >= chance) return shape;
  const configuredAlternatingShapes = profile.shapeWeights
    .filter(row => row.weight > 0 && isAlternatingGapShape(row.value) && bottleCount >= row.minBottleCount && bottleCount <= row.maxBottleCount)
    .map(row => row.value);
  const pool = configuredAlternatingShapes.length > 0 ? configuredAlternatingShapes : ["alternating_rows", "checkerboard"];
  return pool[stableShapeTieBreak(`${profile.name}:alternating-gap-pool:${bottleCount}`, levelNumber) % pool.length];
}

function isAlternatingGapShape(shape) {
  return ["checkerboard", "alternating", "alternating_rows", "parity"]
    .includes(String(shape || "").toLowerCase());
}

function stableShapeTieBreak(shape, levelNumber) {
  let hash = Math.imul((levelNumber ^ generatorSeed) >>> 0, 2166136261);
  for (let i = 0; i < shape.length; i++) {
    hash ^= shape.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function readOptionalInt(name) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") return null;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error(`Invalid ${name}: ${raw}`);
  return value;
}

function isSpecialProfile(profile) {
  return String(profile?.name || "").trim().toLowerCase() === "special";
}

function selectedProfileFor(config) {
  const requestedName = String(process.env.WATERSORT_DIFFICULTY || config.selectedDifficultyProfile || "Hard").trim();
  const profile = config.difficultyProfiles.find(candidate =>
    candidate.enabled && String(candidate.name).toLowerCase() === requestedName.toLowerCase());
  if (!profile) {
    const available = config.difficultyProfiles.filter(candidate => candidate.enabled).map(candidate => candidate.name).join(", ");
    throw new Error(`Difficulty profile not found: ${requestedName}. Available: ${available}`);
  }
  return profile;
}

function resolveGenerationRequest(config, profile, random) {
  const explicitCoreBottleCount = readOptionalInt("WATERSORT_CORE_BOTTLES");
  const minCore = Math.max(2, Math.min(config.maxBottleCount, profile.minTargetBottleCount));
  const maxCore = Math.max(minCore, Math.min(config.maxBottleCount, profile.maxTargetBottleCount));
  const coreBottleCount = explicitCoreBottleCount == null
    ? randomInt(random, minCore, maxCore)
    : Math.max(2, Math.min(config.maxBottleCount, explicitCoreBottleCount));
  if (explicitCoreBottleCount != null && coreBottleCount !== explicitCoreBottleCount) {
    throw new Error(`Requested core bottle count ${explicitCoreBottleCount} is outside supported range 2-${config.maxBottleCount}`);
  }
  return {
    difficulty: profile.name,
    coreBottleCount,
    explicitCoreBottleCount: explicitCoreBottleCount != null,
  };
}

function shuffle(items, random) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function constructionModuleTargetFor(profile, coreBottleCount) {
  if (!isSpecialProfile(profile)) return null;
  // Two temporary construction helpers at 10 bottles produce ~8 free slots,
  // which can be redistributed into many 3/4 bottles instead of empty helpers.
  return coreBottleCount <= 10 ? Math.min(2, Math.max(1, coreBottleCount - 2)) : 2;
}

function buildModuleBoard(colorCount, capacity, colorOffset) {
  const board = [];
  for (let bottleIndex = 0; bottleIndex < colorCount; bottleIndex++) {
    const bottle = [];
    for (let layer = 0; layer < capacity; layer++) bottle.push(colorOffset + ((bottleIndex + layer) % colorCount));
    board.push(bottle);
  }
  board.push([]);
  return board;
}

function moduleSizesForCapacity(capacity) {
  return capacity === 5 ? [2, 3, 4, 5, 6, 7, 8] : [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
}

function solveModule(colorCount, capacity, config) {
  const board = buildModuleBoard(colorCount, capacity, 0);
  const result = solveExhaustiveHidden(board, capacity, {
    maxDepth: 90,
    maxStates: 400000,
    sampleLimit: Math.max(1, Math.min(3, config.solutionExampleLimitWhenMany)),
    manySolutionThreshold: config.manySolutionThreshold,
    skipCompletedSource: true,
    skipSymmetricEmptyMoves: true,
    canonicalizeBottleSymmetry: false,
    canonicalizeColorSymmetry: false,
    useLowerBoundPruning: true,
    selectionPolicy: "module_exhaustive_bfs_pruned_hidden_stack_concrete_paths",
  });
  if (result.status !== "solved" || result.solutions.length === 0) {
    throw new Error(`Module ${colorCount}/${capacity} failed: ${result.status}, states=${result.visitedStates}`);
  }
  return {
    colorCount,
    capacity,
    board,
    shortestStepCount: result.shortestStepCount,
    solutionCount: result.solutionCount,
    visitedStates: result.visitedStates,
    solutions: result.solutions.map(solution => solution.moves),
  };
}

const recipeCache = new Map();

function allRecipesForCapacity(capacity, maxModuleCount, maxBottleCount) {
  const sizes = moduleSizesForCapacity(capacity);
  const recipes = [];
  const walk = modules => {
    if (modules.length > 0) {
      const colors = modules.reduce((sum, value) => sum + value, 0);
      const bottles = colors + modules.length;
      const estimatedSteps = modules.reduce((sum, value) => sum + (capacity - 1) * value + 1, 0);
      if (bottles <= maxBottleCount) recipes.push({ modules: modules.slice(), colors, bottles, estimatedSteps, capacity });
    }
    if (modules.length >= maxModuleCount) return;
    for (const size of sizes) walk(modules.concat(size));
  };
  walk([]);
  return recipes;
}

function recipesForCapacity(capacity, maxModuleCount, maxBottleCount) {
  const key = `${capacity}:${maxModuleCount}:${maxBottleCount}`;
  if (!recipeCache.has(key)) recipeCache.set(key, allRecipesForCapacity(capacity, maxModuleCount, maxBottleCount));
  return recipeCache.get(key);
}

function resolveSpecialComposition(profile, coreBottleCount, random) {
  const hardMax = coreBottleCount <= 10 ? 1 : Math.max(1, profile.maxNormalHelperCount);
  const minHelpers = Math.max(0, Math.min(hardMax, profile.minNormalHelperCount));
  const maxHelpers = Math.max(minHelpers, Math.min(hardMax, profile.maxNormalHelperCount));
  let normalHelperCount = minHelpers;
  if (maxHelpers > minHelpers) {
    // Small Special boards strongly prefer no dedicated empty helper.
    normalHelperCount = random() < 0.8 ? minHelpers : maxHelpers;
  }
  return {
    coreBottleCount,
    normalHelperCount,
    activeBottleCount: coreBottleCount - normalHelperCount,
  };
}

function recipeStepCount(recipe, solvedModules) {
  return recipe.modules.reduce((sum, moduleColorCount) => {
    const solvedModule = solvedModules.get(`${recipe.capacity}:${moduleColorCount}`);
    return sum + (solvedModule?.solutions[0]?.length ?? recipe.estimatedSteps);
  }, 0);
}

function chooseRecipe(config, profile, capacity, maxModuleCount, solvedModules, random, request) {
  const minBottles = request.explicitCoreBottleCount
    ? request.coreBottleCount
    : Math.max(2, Math.min(profile.minTargetBottleCount, config.maxBottleCount));
  const maxBottles = request.explicitCoreBottleCount
    ? request.coreBottleCount
    : Math.max(minBottles, Math.min(profile.maxTargetBottleCount, config.maxBottleCount));
  const desiredBottleCount = request.coreBottleCount;
  const rawDesiredColorCount = weighted(random, profile.colorWeights, Math.max(2, desiredBottleCount - 2));
  const moduleTarget = constructionModuleTargetFor(profile, desiredBottleCount);
  const desiredColorCount = isSpecialProfile(profile)
    ? Math.max(2, Math.min(desiredBottleCount - 1, moduleTarget == null ? rawDesiredColorCount : desiredBottleCount - moduleTarget))
    : rawDesiredColorCount;
  const desiredStepCount = randomInt(random, Math.max(1, profile.minShortestStepCount), Math.max(profile.minShortestStepCount, profile.maxShortestStepCount));

  let candidates = recipesForCapacity(capacity, maxModuleCount, config.maxBottleCount)
    .map(recipe => ({ recipe, stepCount: recipeStepCount(recipe, solvedModules) }))
    .filter(candidate =>
      candidate.recipe.bottles >= minBottles &&
      candidate.recipe.bottles <= maxBottles &&
      candidate.recipe.colors <= paletteSize &&
      (!isSpecialProfile(profile) || candidate.recipe.modules.length <= 2));

  if (!isSpecialProfile(profile)) {
    candidates = candidates.filter(candidate =>
      candidate.stepCount >= profile.minShortestStepCount &&
      candidate.stepCount <= profile.maxShortestStepCount);
  } else {
    // For Special, solution length is a soft selector. Decision complexity is evaluated later.
    candidates = candidates.filter(candidate => candidate.stepCount <= profile.maxShortestStepCount);
  }

  if (candidates.length === 0) {
    throw new Error(`No modular recipe fits ${profile.name} capacity ${capacity}, core=${request.coreBottleCount}`);
  }

  const picked = candidates
    .map(candidate => ({
      recipe: candidate.recipe,
      score:
        Math.abs(candidate.recipe.bottles - desiredBottleCount) * 20 +
        Math.abs(candidate.stepCount - desiredStepCount) * (isSpecialProfile(profile) ? 0.25 : 1) +
        Math.abs(Math.min(candidate.recipe.colors, paletteSize) - desiredColorCount) * 2 +
        (moduleTarget == null ? 0 : Math.abs(candidate.recipe.modules.length - moduleTarget) * 8) +
        random() * 0.01,
    }))
    .sort((left, right) => left.score - right.score)[0].recipe;
  return { recipe: picked, desiredDistinctColors: desiredColorCount };
}

function createColorMapper(levelNumber, attempt = 0) {
  const random = rng(seedFor(levelNumber + attempt * 4099, 0xC0102, 1597334677));
  const palette = shuffle(Array.from({ length: paletteSize }, (_, i) => i), random);
  return color => palette[color % paletteSize];
}

function buildComposedLevel(recipe, solvedModules, levelNumber, storedSolutionTarget, attempt = 0) {
  const random = rng(seedFor(levelNumber + attempt * 8191, 0xB0771E, 3812015801));
  const board = [];
  const moduleMoveSets = [];
  let bottleOffset = 0;
  let colorOffset = 0;

  for (const moduleColorCount of recipe.modules) {
    const solvedModule = solvedModules.get(`${recipe.capacity}:${moduleColorCount}`);
    if (!solvedModule) throw new Error(`Missing solved module ${recipe.capacity}:${moduleColorCount}`);
    for (const bottle of solvedModule.board) board.push(bottle.map(color => color + colorOffset));
    const localMoves = solvedModule.solutions[((levelNumber + generatorSeed + attempt) >>> 0) % solvedModule.solutions.length];
    const globalMoves = localMoves.map(move => ({
      fromBottle: move.fromBottle + bottleOffset,
      toBottle: move.toBottle + bottleOffset,
    }));
    moduleMoveSets.push(globalMoves);
    bottleOffset += solvedModule.board.length;
    colorOffset += solvedModule.colorCount;
  }

  const baseOrder = Array.from({ length: moduleMoveSets.length }, (_, i) => i);
  const orders = [
    baseOrder,
    baseOrder.slice().reverse(),
    shuffle(baseOrder, rng(seedFor(levelNumber + attempt * 12289, 0x501A710A, 1103515245))),
  ];
  const solutionMoveLists = [];
  for (const order of orders) {
    const moves = order.flatMap(moduleIndex => moduleMoveSets[moduleIndex]);
    const signature = moves.map(move => `${move.fromBottle}>${move.toBottle}`).join(",");
    if (!solutionMoveLists.some(existing => existing.map(move => `${move.fromBottle}>${move.toBottle}`).join(",") === signature)) {
      solutionMoveLists.push(moves);
    }
    if (solutionMoveLists.length >= storedSolutionTarget) break;
  }

  const mapColor = createColorMapper(levelNumber, attempt);
  const coloredBoard = board.map(bottle => bottle.map(mapColor));
  const oldToNew = shuffle(Array.from({ length: coloredBoard.length }, (_, i) => i), random);
  const permutedBoard = Array.from({ length: coloredBoard.length });
  for (let oldIndex = 0; oldIndex < coloredBoard.length; oldIndex++) permutedBoard[oldToNew[oldIndex]] = coloredBoard[oldIndex];
  const remappedSolutions = solutionMoveLists.map(moves => moves.map(move => ({
    fromBottle: oldToNew[move.fromBottle - 1] + 1,
    toBottle: oldToNew[move.toBottle - 1] + 1,
  })));
  return { board: permutedBoard, solutionMoveLists: remappedSolutions };
}

function shouldBuildSmallTutorial(profile) {
  return Boolean(profile.allowSmallIntroLevel)
    && profile.minTargetBottleCount <= 3
    && profile.maxTargetBottleCount <= 3
    && profile.minShortestStepCount <= 1
    && profile.maxShortestStepCount <= 5;
}

function buildSmallTutorialLevel(config, band, levelNumber, random) {
  const capacity = capacityFor(config, band, random);
  const colorCount = Math.max(1, Math.min(2, weighted(random, band.colorWeights, 1)));
  const mapColor = createColorMapper(levelNumber);

  if (colorCount === 1) {
    const bottleCount = randomInt(
      random,
      Math.max(2, band.minTargetBottleCount),
      Math.max(2, Math.min(3, band.maxTargetBottleCount)));
    const board = [Array(capacity - 1).fill(0), [0]];
    if (bottleCount === 3) board.push([]);
    return {
      capacity,
      board: board.map(bottle => bottle.map(mapColor)),
      solutionMoveLists: [[{ fromBottle: 2, toBottle: 1 }]],
    };
  }

  const board = [
    Array(capacity - 1).fill(0).concat(1),
    Array(capacity - 1).fill(1).concat(0),
    [],
  ];
  return {
    capacity,
    board: board.map(bottle => bottle.map(mapColor)),
    solutionMoveLists: [[
      { fromBottle: 1, toBottle: 3 },
      { fromBottle: 2, toBottle: 1 },
      { fromBottle: 3, toBottle: 2 },
    ]],
  };
}

function addAdHelperBottles(board, random) {
  const adBottleCount = randomInt(random, 2, 3);
  const firstAdBottleIndex = board.length;
  for (let i = 0; i < adBottleCount; i++) {
    board.push([]);
  }

  return { adBottleCount, firstAdBottleIndex };
}


function countEmptyBottles(board) {
  return board.reduce((count, bottle) => count + (bottle.length === 0 ? 1 : 0), 0);
}

function compositionStats(board, capacity) {
  let fullBottleCount = 0;
  let partialBottleCount = 0;
  let emptyBottleCount = 0;
  let totalLayers = 0;
  for (const bottle of board) {
    totalLayers += bottle.length;
    if (bottle.length === 0) emptyBottleCount++;
    else if (bottle.length >= capacity) fullBottleCount++;
    else partialBottleCount++;
  }
  const totalSlots = board.length * capacity;
  return {
    fullBottleCount,
    partialBottleCount,
    emptyBottleCount,
    embeddedFreeSlots: totalSlots - totalLayers - emptyBottleCount * capacity,
    totalFreeSlots: totalSlots - totalLayers,
    activeFillRatio: totalSlots <= 0 ? 0 : totalLayers / totalSlots,
  };
}

function densifySpecialBoard(board, capacity, targetEmptyHelperCount, random) {
  const result = board.map(bottle => bottle.slice());
  const emptyIndexes = shuffle(
    result.map((bottle, index) => ({ bottle, index })).filter(item => item.bottle.length === 0).map(item => item.index),
    random);
  if (emptyIndexes.length <= targetEmptyHelperCount) return result;

  const preserve = new Set(emptyIndexes.slice(0, targetEmptyHelperCount));
  const fillTargets = emptyIndexes.filter(index => !preserve.has(index));
  const usedDonors = new Set();

  for (const targetIndex of fillTargets) {
    const targetFill = Math.max(1, capacity - 1);
    while (result[targetIndex].length < targetFill) {
      let donors = result
        .map((bottle, index) => ({ bottle, index }))
        .filter(item =>
          item.index !== targetIndex &&
          !preserve.has(item.index) &&
          item.bottle.length >= Math.max(2, capacity - 1));
      if (donors.length === 0) return null;

      const unused = donors.filter(item => !usedDonors.has(item.index));
      if (unused.length > 0) donors = unused;
      donors = shuffle(donors, random);
      const donor = donors[0];
      const color = result[donor.index].pop();
      result[targetIndex].push(color);
      usedDonors.add(donor.index);
    }
  }

  return result;
}

function isCompletedBottleArray(bottle, capacity) {
  return bottle.length === capacity && bottle.every(color => color === bottle[0]);
}

function legalMovesForState(state, capacity) {
  const moves = [];
  for (let from = 0; from < state.colors.length; from++) {
    if (isCompletedBottleArray(state.colors[from], capacity)) continue;
    let usedEmptyDestination = false;
    for (let to = 0; to < state.colors.length; to++) {
      if (from === to) continue;
      const targetWasEmpty = state.colors[to].length === 0;
      if (targetWasEmpty && usedEmptyDestination) continue;
      const nextState = applyHiddenPour(state, from, to, capacity);
      if (nextState == null) continue;
      if (targetWasEmpty) usedEmptyDestination = true;
      moves.push({ fromBottle: from + 1, toBottle: to + 1, nextState });
    }
  }
  return moves;
}

function analyzeDecisionDifficulty(board, capacity, safeMoves, profile) {
  let state = makeInitialHiddenState(board);
  let totalBranching = 0;
  let maxBranchingFactor = 0;
  let criticalDecisionCount = 0;
  let safeRatioProxyTotal = 0;
  const criticalStates = [];

  for (let depth = 0; depth < safeMoves.length; depth++) {
    const legalMoves = legalMovesForState(state, capacity);
    const branching = legalMoves.length;
    totalBranching += branching;
    maxBranchingFactor = Math.max(maxBranchingFactor, branching);
    safeRatioProxyTotal += branching > 0 ? 1 / branching : 1;
    if (branching >= 3) {
      criticalDecisionCount++;
      criticalStates.push({ depth, state, legalMoves, safeMove: safeMoves[depth] });
    }
    const safeMove = safeMoves[depth];
    state = applyHiddenPour(state, safeMove.fromBottle - 1, safeMove.toBottle - 1, capacity);
    if (state == null) break;
  }

  const stepCount = Math.max(1, safeMoves.length);
  const averageBranchingFactor = totalBranching / stepCount;
  const safeMoveRatio = safeRatioProxyTotal / stepCount;
  return {
    averageBranchingFactor,
    maxBranchingFactor,
    safeMoveRatio,
    criticalDecisionCount,
    criticalStates,
    passesCoreDifficulty:
      averageBranchingFactor >= profile.minAverageBranchingFactor &&
      safeMoveRatio <= profile.maxSafeMoveRatio &&
      criticalDecisionCount >= profile.minCriticalDecisionCount,
  };
}

function bottleOrganizationScore(colors, capacity) {
  if (colors.length === 0) return 0;
  if (isCompletedBottleArray(colors, capacity)) return 1;
  let groups = 1;
  for (let i = 1; i < colors.length; i++) if (colors[i] !== colors[i - 1]) groups++;
  const monoRatio = 1 / groups;
  const fillRatio = colors.length / capacity;
  return Math.min(1, monoRatio * 0.65 + fillRatio * 0.35);
}

function boardOrganizationScore(colors, capacity) {
  if (colors.length === 0) return 0;
  return colors.reduce((sum, bottle) => sum + bottleOrganizationScore(bottle, capacity), 0) / colors.length;
}

function analyzeNearWinQuality(board, capacity, safeMoves, decision, profile) {
  if (!profile.allowSpecialNearWin || safeMoves.length === 0) {
    return { nearWinScore: 0, plausibleTrapMoveCount: 0, bestCriticalDepthRatio: 0 };
  }
  const minDepth = Math.floor(safeMoves.length * profile.nearWin.minCriticalDepthRatio);
  const maxDepth = Math.ceil(safeMoves.length * profile.nearWin.maxCriticalDepthRatio);
  let bestNearWinScore = 0;
  let bestCriticalDepthRatio = 0;
  let plausibleTrapMoveCount = 0;

  for (const critical of decision.criticalStates) {
    if (critical.depth < minDepth || critical.depth > maxDepth) continue;
    const safeSignature = `${critical.safeMove.fromBottle}>${critical.safeMove.toBottle}`;
    const currentOrganization = boardOrganizationScore(critical.state.colors, capacity);
    const depthRatio = critical.depth / Math.max(1, safeMoves.length);
    for (const move of critical.legalMoves) {
      if (`${move.fromBottle}>${move.toBottle}` === safeSignature) continue;
      const nextOrganization = boardOrganizationScore(move.nextState.colors, capacity);
      // A plausible false-progress move looks at least as organized while deviating
      // from the known safe continuation.
      if (nextOrganization + 0.02 >= currentOrganization) plausibleTrapMoveCount++;
      const nearScore = Math.min(1, depthRatio * 0.65 + nextOrganization * 0.35);
      if (nearScore > bestNearWinScore) {
        bestNearWinScore = nearScore;
        bestCriticalDepthRatio = depthRatio;
      }
    }
  }

  return {
    nearWinScore: bestNearWinScore,
    plausibleTrapMoveCount,
    bestCriticalDepthRatio,
  };
}

function solveFinalSpecialBoard(board, capacity, config, profile) {
  const maxStatesOverride = readOptionalInt("WATERSORT_SPECIAL_SOLVER_MAX_STATES");
  const maxDepthOverride = readOptionalInt("WATERSORT_SPECIAL_SOLVER_MAX_DEPTH");
  return solveExhaustiveHidden(board, capacity, {
    maxDepth: maxDepthOverride ?? Math.max(100, Math.min(220, profile.maxShortestStepCount + 80)),
    maxStates: maxStatesOverride ?? Math.max(100000, Math.min(300000, profile.nearWin.trapSolverMaxStates * 2)),
    sampleLimit: Math.max(1, Math.min(3, profile.storedSolutionTarget || config.solutionExampleLimitWhenMany)),
    manySolutionThreshold: config.manySolutionThreshold,
    skipCompletedSource: true,
    skipSymmetricEmptyMoves: true,
    canonicalizeBottleSymmetry: false,
    canonicalizeColorSymmetry: false,
    useLowerBoundPruning: true,
    selectionPolicy: "special_final_board_exhaustive_pruned",
  });
}

function analyzeBottleDuplicates(board) {
  const exactPatterns = new Map();
  const colorMultisets = new Map();

  for (const bottle of board) {
    if (!Array.isArray(bottle) || bottle.length === 0) continue;

    const exactKey = `${bottle.length}:${bottle.join(",")}`;
    const multisetKey = `${bottle.length}:${bottle.slice().sort((a, b) => a - b).join(",")}`;

    exactPatterns.set(exactKey, (exactPatterns.get(exactKey) || 0) + 1);
    colorMultisets.set(multisetKey, (colorMultisets.get(multisetKey) || 0) + 1);
  }

  const duplicateCount = counts => Array.from(counts.values())
    .reduce((sum, count) => sum + Math.max(0, count - 1), 0);

  return {
    exactDuplicatePairs: duplicateCount(exactPatterns),
    sameColorSetDuplicatePairs: duplicateCount(colorMultisets),
  };
}

function bottlePatternPenalty(board) {
  const duplicates = analyzeBottleDuplicates(board);
  return {
    ...duplicates,
    penalty:
      duplicates.exactDuplicatePairs * 100 +
      duplicates.sameColorSetDuplicatePairs * 15,
  };
}

function specialCandidateScore(candidate, profile) {
  const decision = candidate.difficulty;
  const nearWin = candidate.nearWin;
  const composition = candidate.composition;
  const desiredPartial = Math.max(profile.minPartialBottleCount, Math.floor(candidate.board.length * 0.55));
  return (
    decision.averageBranchingFactor * 12 +
    Math.min(8, decision.criticalDecisionCount) * 4 +
    Math.min(8, nearWin.plausibleTrapMoveCount) * 2.5 +
    nearWin.nearWinScore * 12 -
    candidate.duplicateMetrics.penalty -
    decision.safeMoveRatio * 10 -
    composition.emptyBottleCount * 10 -
    Math.abs(composition.partialBottleCount - desiredPartial) * 0.75 -
    Math.max(0, profile.minShortestStepCount - candidate.moves.length) * 0.15
  );
}

function generateSpecialCoreLevel(config, profile, request, levelNumber, solvedModules, preferredCapacity) {
  const attemptLimit = Math.max(1, readOptionalInt("WATERSORT_SPECIAL_CANDIDATE_ATTEMPTS") ?? profile.candidateAttemptCount ?? 6);
  const candidates = [];
  const failures = [];
  const capacityOptions = capacityOptionsFor(config, profile, preferredCapacity);

  for (const capacity of capacityOptions) {
    for (let attempt = 0; attempt < attemptLimit; attempt++) {
      const random = rng(seedFor(levelNumber + attempt * 32771, 0x5EEC1A1, 2246822519));
      try {
        const maxConstructionModuleCount = request.coreBottleCount <= 10 ? 2 : 3;
        const picked = chooseRecipe(config, profile, capacity, maxConstructionModuleCount, solvedModules, random, request);
        const composed = buildComposedLevel(picked.recipe, solvedModules, levelNumber, Math.max(1, profile.storedSolutionTarget), attempt);
        if (composed.board.length !== request.coreBottleCount) {
          throw new Error(`core mismatch ${composed.board.length} != ${request.coreBottleCount}`);
        }

        const resolved = resolveSpecialComposition(profile, request.coreBottleCount, random);
        const board = densifySpecialBoard(composed.board, capacity, resolved.normalHelperCount, random);
        if (board == null) throw new Error("could not redistribute temporary helper workspace");
        if (countEmptyBottles(board) > (request.coreBottleCount <= 10 ? 1 : profile.maxNormalHelperCount)) {
          throw new Error(`too many normal helpers after densify: ${countEmptyBottles(board)}`);
        }

        const solved = solveFinalSpecialBoard(board, capacity, config, profile);
        if (solved.status !== "solved" || solved.solutions.length === 0) {
          throw new Error(`final solver ${solved.status}, states=${solved.visitedStates}`);
        }
        const solutionMoveLists = solved.solutions
          .slice(0, Math.max(1, profile.storedSolutionTarget))
          .map(solution => solution.moves);
        const moves = solutionMoveLists[0];
        if (moves.length > profile.maxShortestStepCount) throw new Error(`solution too long: ${moves.length}`);

        const difficulty = analyzeDecisionDifficulty(board, capacity, moves, profile);
        const nearWin = analyzeNearWinQuality(board, capacity, moves, difficulty, profile);
        const composition = compositionStats(board, capacity);
        const duplicateMetrics = bottlePatternPenalty(board);
        const minNearWin = Math.max(0.65, profile.nearWin.minNearWinScore || 0);
        const accepted =
          difficulty.passesCoreDifficulty &&
          duplicateMetrics.exactDuplicatePairs === 0 &&
          duplicateMetrics.sameColorSetDuplicatePairs <= 1 &&
          composition.emptyBottleCount <= (request.coreBottleCount <= 10 ? 1 : profile.maxNormalHelperCount) &&
          composition.partialBottleCount >= Math.min(profile.minPartialBottleCount, board.length) &&
          (!profile.allowSpecialNearWin || (nearWin.nearWinScore >= minNearWin && nearWin.plausibleTrapMoveCount >= 1));

        const candidate = {
          capacity,
          board,
          solutionMoveLists,
          moves,
          difficulty,
          nearWin,
          composition,
          duplicateMetrics,
          accepted,
          recipe: picked.recipe,
        };
        candidate.qualityScore = specialCandidateScore(candidate, profile);
        candidates.push(candidate);
      } catch (error) {
        failures.push(`cap${capacity}/a${attempt}: ${error.message}`);
      }
    }
  }

  candidates.sort((a, b) => b.qualityScore - a.qualityScore);
  const accepted = candidates.find(candidate => candidate.accepted);
  if (!accepted) {
    const best = candidates[0];
    const bestSummary = best
      ? `best branch=${best.difficulty.averageBranchingFactor.toFixed(2)}, safe=${best.difficulty.safeMoveRatio.toFixed(2)}, critical=${best.difficulty.criticalDecisionCount}, nearWin=${best.nearWin.nearWinScore.toFixed(2)}, traps=${best.nearWin.plausibleTrapMoveCount}, empty=${best.composition.emptyBottleCount}, partial=${best.composition.partialBottleCount}, exactDup=${best.duplicateMetrics.exactDuplicatePairs}, colorSetDup=${best.duplicateMetrics.sameColorSetDuplicatePairs}`
      : "no solved candidates";
    throw new Error(`Special quality failure level ${levelNumber}: ${bestSummary}. ${failures.slice(0, 6).join("; ")}`);
  }
  return accepted;
}

function shouldBuildMegaLevel(band, random) {
  if (!band.allowMegaBottleMode || random() >= band.megaBottleChance) return false;
  if (String(band.name || "").toLowerCase() === "tutorial") return false;
  const minMegaSteps = 11;
  const maxMegaSteps = 36;
  return band.maxShortestStepCount >= minMegaSteps
    && band.minShortestStepCount <= maxMegaSteps;
}

function buildMegaLevel(config, band, levelNumber, random) {
  const defaultCapacity = capacityFor(config, band, random);
  const minConfiguredCapacity = Math.max(12, Math.min(40, band.minMegaBottleCapacity));
  const maxConfiguredCapacity = Math.max(minConfiguredCapacity, Math.min(40, band.maxMegaBottleCapacity));
  const minMegaCapacityBySteps = Math.max(minConfiguredCapacity, Math.min(maxConfiguredCapacity, band.minShortestStepCount + 1));
  const maxMegaCapacityBySteps = Math.max(minMegaCapacityBySteps, Math.min(maxConfiguredCapacity, band.maxShortestStepCount + 1));
  const megaCapacity = randomInt(random, minMegaCapacityBySteps, maxMegaCapacityBySteps);
  const targetColor = createColorMapper(levelNumber)(0);
  const blockerColor = nonTargetColor(targetColor, 1);
  const board = [[targetColor]];
  const solutionMoveLists = [[]];
  const neededTargetLayers = megaCapacity - 1;
  const maxTargetGroupSize = Math.max(1, defaultCapacity - 1);
  const minSourceCountByCapacity = Math.ceil(neededTargetLayers / maxTargetGroupSize);
  const minSourceCountByStep = Math.ceil(band.minShortestStepCount / 2);
  const maxSourceCountByStep = Math.floor(band.maxShortestStepCount / 2);
  const sourceCountMin = Math.max(minSourceCountByCapacity, minSourceCountByStep);
  const sourceCountMax = Math.min(neededTargetLayers, maxSourceCountByStep);
  const sourceCountOptions = [];
  for (let count = sourceCountMin; count <= sourceCountMax; count++) {
    const helperCount = Math.max(1, Math.ceil(count / defaultCapacity));
    if (1 + count + helperCount + 3 <= config.maxBottleCount) {
      sourceCountOptions.push(count);
    }
  }
  if (sourceCountOptions.length === 0) {
    throw new Error(`No mega source count fits band ${band.name}: needed=${neededTargetLayers}, cap=${defaultCapacity}`);
  }

  const sourceCount = sourceCountOptions[randomInt(random, 0, sourceCountOptions.length - 1)];
  const helperCount = Math.max(1, Math.ceil(sourceCount / defaultCapacity));
  const targetGroups = distributeTargetGroups(neededTargetLayers, sourceCount, maxTargetGroupSize, random);

  for (let i = 0; i < sourceCount; i++) {
    const targetGroupSize = targetGroups[i];
    const source = [];
    const fillerCount = Math.max(0, defaultCapacity - targetGroupSize - 1);
    for (let layer = 0; layer < fillerCount; layer++) {
      source.push(nonTargetColor(targetColor, i + layer + 1));
    }
    for (let layer = 0; layer < targetGroupSize; layer++) {
      source.push(targetColor);
    }
    source.push(blockerColor);
    board.push(source);
  }

  const firstHelperIndex = board.length;
  for (let i = 0; i < helperCount; i++) {
    board.push([]);
  }

  for (let i = 0; i < sourceCount; i++) {
    const helperIndex = firstHelperIndex + Math.floor(i / defaultCapacity);
    const sourceIndex = i + 2;
    solutionMoveLists[0].push({ fromBottle: sourceIndex, toBottle: helperIndex + 1 });
    solutionMoveLists[0].push({ fromBottle: sourceIndex, toBottle: 1 });
  }

  return {
    capacity: defaultCapacity,
    board,
    solutionMoveLists,
    megaBottleIndex: 0,
    megaCapacity,
    megaTargetColor: targetColor,
  };
}

function distributeTargetGroups(total, count, maxGroupSize, random) {
  const groups = Array(count).fill(1);
  let remaining = total - count;
  while (remaining > 0) {
    const candidates = groups
      .map((value, index) => ({ value, index }))
      .filter(entry => entry.value < maxGroupSize);
    if (candidates.length === 0) {
      throw new Error(`Cannot distribute ${total} target layers into ${count} sources.`);
    }
    const picked = candidates[randomInt(random, 0, candidates.length - 1)].index;
    groups[picked]++;
    remaining--;
  }
  return groups;
}

function nonTargetColor(targetColor, offset) {
  const color = (targetColor + offset) % paletteSize;
  return color === targetColor ? (color + 1) % paletteSize : color;
}

function allGridCells(columns, rows) {
  const cells = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) cells.push({ x, y });
  }
  return cells;
}

function pathCells(points) {
  const seen = new Set();
  const out = [];
  for (const point of points) {
    const key = `${point.x},${point.y}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(point);
    }
  }
  return out;
}

function centerFirstPathCells(points, cx, cy) {
  return pathCells(points).sort((a, b) =>
    Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy) ||
    Math.abs(a.y - cy) - Math.abs(b.y - cy) ||
    Math.abs(a.x - cx) - Math.abs(b.x - cx) ||
    a.y - b.y ||
    a.x - b.x);
}

function centerOutIndexes(count, center) {
  return Array.from({ length: count }, (_, index) => index)
    .sort((a, b) => Math.abs(a - center) - Math.abs(b - center) || a - b);
}

function centeredColumns(columns, width, offset = 0) {
  const clampedWidth = Math.max(1, Math.min(columns, width));
  const start = Math.max(0, Math.min(columns - clampedWidth, Math.floor((columns - clampedWidth) / 2) + offset));
  return Array.from({ length: clampedWidth }, (_, index) => start + index);
}

function denseRowCells(columns, rows, options = {}) {
  const cx = (columns - 1) / 2;
  const cy = (rows - 1) / 2;
  const rowOrder = centerOutIndexes(rows, cy);
  const rowWidth = options.rowWidth ?? columns;
  const alternatingWidth = options.alternatingWidth ?? rowWidth;
  const cells = [];

  for (const y of rowOrder) {
    const width = y % 2 === 0 ? rowWidth : alternatingWidth;
    const offset = options.staggered && y % 2 !== Math.round(cy) % 2 ? 1 : 0;
    const columnsInRow = centeredColumns(columns, width, offset);
    const orderedColumns = options.zigzag && cells.length % 2 === 1
      ? columnsInRow.slice().reverse()
      : columnsInRow;
    for (const x of orderedColumns) {
      cells.push({ x, y });
    }
  }

  return pathCells(cells).sort((a, b) =>
    Math.abs(a.y - cy) - Math.abs(b.y - cy) ||
    Math.abs(a.x - cx) - Math.abs(b.x - cx) ||
    a.y - b.y ||
    a.x - b.x);
}

function denseColumnCells(columns, rows) {
  const cx = (columns - 1) / 2;
  const cy = (rows - 1) / 2;
  const columnOrder = centerOutIndexes(columns, cx);
  const rowOrder = centerOutIndexes(rows, cy);
  const cells = [];

  for (const x of columnOrder) {
    const orderedRows = x % 2 === Math.round(cx) % 2 ? rowOrder : rowOrder.slice().reverse();
    for (const y of orderedRows) {
      cells.push({ x, y });
    }
  }

  return pathCells(cells);
}

function alternatingRowCells(columns, rows) {
  const cx = (columns - 1) / 2;
  const cy = (rows - 1) / 2;
  const rowOrder = centerOutIndexes(rows, cy);
  const columnOrder = centerOutIndexes(columns, cx);
  const cells = [];

  for (const y of rowOrder) {
    for (const x of columnOrder) {
      if ((x + y) % 2 === 0) {
        cells.push({ x, y });
      }
    }
  }

  return pathCells(cells);
}

function appendRemaining(primary, columns, rows) {
  const used = new Set(primary.map(cell => `${cell.x},${cell.y}`));
  const remaining = allGridCells(columns, rows)
    .filter(cell => !used.has(`${cell.x},${cell.y}`))
    .map(cell => ({
      ...cell,
      distance: Math.min(...primary.map(base => Math.abs(base.x - cell.x) + Math.abs(base.y - cell.y))),
    }))
    .sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x);
  return primary.concat(remaining.map(({ x, y }) => ({ x, y })));
}

function shapeCells(shape, columns, rows) {
  const cx = (columns - 1) / 2;
  const cy = (rows - 1) / 2;
  const cells = allGridCells(columns, rows);
  const name = String(shape || "square").toLowerCase();
  const withScore = score => cells.map(cell => ({ ...cell, score: score(cell) })).sort((a, b) => a.score - b.score || a.y - b.y || a.x - b.x);

  if (name === "circle") {
    return withScore(cell => Math.abs(Math.hypot(cell.x - cx, cell.y - cy) - 3));
  }
  if (name === "-" || name === "horizontal" || name === "line") {
    const primary = cells.filter(cell => cell.y === Math.round(cy));
    return appendRemaining(centerFirstPathCells(primary, cx, cy), columns, rows);
  }
  if (name === "arc") {
    return withScore(cell => {
      const dx = cell.x - cx;
      const dy = cell.y - (cy + 1.2);
      const anglePenalty = dy > 1 ? 4 : 0;
      return Math.abs(Math.hypot(dx, dy) - 3.2) + anglePenalty;
    });
  }
  if (name === "triangle") {
    return withScore(cell => {
      const rowWidth = 1 + cell.y;
      const left = Math.floor(cx - rowWidth / 2);
      const right = Math.ceil(cx + rowWidth / 2);
      return cell.x >= left && cell.x <= right ? cell.y * 0.01 : Math.abs(cell.x - cx) + 8;
    });
  }
  if (name === "heart") {
    return withScore(cell => {
      const x = (cell.x - cx) / 3.2;
      const y = (cy - cell.y) / 3.2;
      const value = Math.pow(x * x + y * y - 0.45, 3) - x * x * y * y * y;
      return value <= 0 ? value : value + 2;
    });
  }
  if (name === "diamond") {
    return withScore(cell => Math.abs(Math.abs(cell.x - cx) + Math.abs(cell.y - cy) - 3.2));
  }
  if (name === "dense" || name === "compact" || name === "block") {
    return withScore(cell =>
      Math.max(Math.abs(cell.x - cx), Math.abs(cell.y - cy)) +
      Math.hypot(cell.x - cx, cell.y - cy) * 0.01);
  }
  if (name === "compact_zigzag" || name === "dense_zigzag") {
    return appendRemaining(denseRowCells(columns, rows, { rowWidth: columns, alternatingWidth: columns, zigzag: true }), columns, rows);
  }
  if (name === "staggered" || name === "stagger") {
    return appendRemaining(denseRowCells(columns, rows, { rowWidth: columns - 1, alternatingWidth: columns - 2, staggered: true }), columns, rows);
  }
  if (name === "honeycomb") {
    return appendRemaining(denseRowCells(columns, rows, { rowWidth: columns - 2, alternatingWidth: columns - 1, staggered: true }), columns, rows);
  }
  if (name === "dense_columns" || name === "columns") {
    return appendRemaining(denseColumnCells(columns, rows), columns, rows);
  }
  if (name === "checkerboard" || name === "alternating" || name === "alternating_rows" || name === "parity") {
    return appendRemaining(alternatingRowCells(columns, rows), columns, rows);
  }
  if (name === "x") {
    return appendRemaining(centerFirstPathCells(cells.filter(cell => cell.x === cell.y || cell.x + cell.y === columns - 1), cx, cy), columns, rows);
  }
  if (name === "v") {
    return appendRemaining(centerFirstPathCells(cells.filter(cell => Math.abs(cell.x - cx) === Math.abs(cell.y - (rows - 1))), cx, cy), columns, rows);
  }
  if (name === "y") {
    const primary = cells.filter(cell =>
      (cell.y <= Math.floor(cy) && (cell.x === cell.y || cell.x + cell.y === columns - 1)) ||
      (cell.y > Math.floor(cy) && Math.abs(cell.x - cx) <= 0.5));
    return appendRemaining(centerFirstPathCells(primary, cx, cy), columns, rows);
  }
  if (name === "u") {
    const primary = cells.filter(cell =>
      (cell.x === 1 && cell.y < rows - 2) ||
      (cell.x === columns - 2 && cell.y < rows - 2) ||
      (cell.y === rows - 2 && cell.x > 1 && cell.x < columns - 2) ||
      (cell.y === rows - 1 && cell.x > 2 && cell.x < columns - 3));
    return appendRemaining(centerFirstPathCells(primary, cx, cy), columns, rows);
  }
  if (name === "w") {
    const primary = cells.filter(cell => {
      const segment = cell.x / Math.max(1, columns - 1);
      const expectedY = segment < 0.25
        ? segment * 4 * (rows - 1)
        : segment < 0.5
          ? (1 - (segment - 0.25) * 4) * (rows - 1)
          : segment < 0.75
            ? (segment - 0.5) * 4 * (rows - 1)
            : (1 - (segment - 0.75) * 4) * (rows - 1);
      return Math.abs(cell.y - expectedY) <= 0.6;
    });
    return appendRemaining(centerFirstPathCells(primary, cx, cy), columns, rows);
  }
  if (name === "l") {
    const primary = cells.filter(cell => cell.x === 1 || cell.y === rows - 2);
    return appendRemaining(centerFirstPathCells(primary, cx, cy), columns, rows);
  }
  if (name === "s") {
    const primary = cells.filter(cell =>
      (cell.y === 1 && cell.x > 1 && cell.x < columns - 1) ||
      (cell.y === Math.floor(cy) && cell.x > 1 && cell.x < columns - 1) ||
      (cell.y === rows - 2 && cell.x > 0 && cell.x < columns - 2) ||
      (cell.x === 1 && cell.y > 1 && cell.y < cy) ||
      (cell.x === columns - 2 && cell.y > cy && cell.y < rows - 2));
    return appendRemaining(centerFirstPathCells(primary, cx, cy), columns, rows);
  }
  if (name === "wave") {
    const primary = cells.filter(cell => {
      const expectedY = cy + Math.sin((cell.x / Math.max(1, columns - 1)) * Math.PI * 2) * 2;
      return Math.abs(cell.y - expectedY) <= 0.65;
    });
    return appendRemaining(centerFirstPathCells(primary, cx, cy), columns, rows);
  }
  if (name === "double_arc") {
    const primary = cells.filter(cell => {
      const dx = cell.x - cx;
      const upper = Math.abs(Math.hypot(dx, cell.y - 2.4) - 2.8) <= 0.55 && cell.y <= cy;
      const lower = Math.abs(Math.hypot(dx, cell.y - 5.2) - 2.8) <= 0.55 && cell.y >= cy;
      return upper || lower;
    });
    return appendRemaining(centerFirstPathCells(primary, cx, cy), columns, rows);
  }
  if (name === "frame") {
    return withScore(cell => Math.min(cell.x, cell.y, columns - 1 - cell.x, rows - 1 - cell.y));
  }
  if (name === "spiral") {
    const order = [];
    let left = 0;
    let right = columns - 1;
    let top = 0;
    let bottom = rows - 1;
    while (left <= right && top <= bottom) {
      for (let x = left; x <= right; x++) order.push({ x, y: top });
      for (let y = top + 1; y <= bottom; y++) order.push({ x: right, y });
      if (top < bottom) for (let x = right - 1; x >= left; x--) order.push({ x, y: bottom });
      if (left < right) for (let y = bottom - 1; y > top; y--) order.push({ x: left, y });
      left++;
      right--;
      top++;
      bottom--;
    }
    return order;
  }
  if (name === "zigzag") {
    const order = [];
    for (let y = 0; y < rows; y++) {
      for (let offset = 0; offset < columns; offset++) {
        order.push({ x: y % 2 === 0 ? offset : columns - 1 - offset, y });
      }
    }
    return order;
  }
  if (name === "plus") {
    return withScore(cell => Math.min(Math.abs(cell.x - cx), Math.abs(cell.y - cy)));
  }

  return withScore(cell => Math.max(Math.abs(cell.x - cx), Math.abs(cell.y - cy)));
}

function compactBalancedCells(count, columns, rows) {
  const rowCount = Math.max(1, Math.min(rows, Math.ceil(count / columns)));
  const base = Math.floor(count / rowCount);
  const extra = count % rowCount;
  const rowSizes = Array.from({ length: rowCount }, (_, i) => base + (i < extra ? 1 : 0));
  const startY = Math.max(0, Math.floor((rows - rowCount) / 2));
  const cells = [];
  for (let row = 0; row < rowCount; row++) {
    const width = rowSizes[row];
    const startX = Math.max(0, Math.floor((columns - width) / 2));
    for (let x = 0; x < width; x++) cells.push({ x: startX + x, y: startY + row });
  }
  return cells;
}

function layoutConnectedGroupCount(positions) {
  if (positions.length === 0) return 0;
  const unvisited = new Set(positions.map((_, i) => i));
  let groups = 0;
  while (unvisited.size > 0) {
    groups++;
    const first = unvisited.values().next().value;
    unvisited.delete(first);
    const queue = [first];
    while (queue.length > 0) {
      const index = queue.pop();
      const a = positions[index];
      for (const other of Array.from(unvisited)) {
        const b = positions[other];
        if (Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1) {
          unvisited.delete(other);
          queue.push(other);
        }
      }
    }
  }
  return groups;
}

function layoutNeedsCompactFallback(positions) {
  if (layoutConnectedGroupCount(positions) > 1) return true;
  const occupiedRows = Array.from(new Set(positions.map(position => position.y))).sort((a, b) => a - b);
  for (let i = 1; i < occupiedRows.length; i++) if (occupiedRows[i] - occupiedRows[i - 1] > 1) return true;
  return false;
}

function assignGridPositions(board, shape, config, forceCompact = false) {
  const columns = Math.max(1, config.layoutGridColumns);
  const rows = Math.max(1, config.layoutGridRows);
  if (board.length > columns * rows) throw new Error(`Grid ${columns}x${rows} cannot fit ${board.length} bottles`);
  if (forceCompact) return compactBalancedCells(board.length, columns, rows);
  const cells = shapeCells(shape, columns, rows);
  if (cells.length < board.length) throw new Error(`Shape ${shape} has only ${cells.length} cells for ${board.length} bottles`);
  const positions = cells.slice(0, board.length).map(cell => ({ x: cell.x, y: cell.y }));
  return layoutNeedsCompactFallback(positions) ? compactBalancedCells(board.length, columns, rows) : positions;
}

function placeMegaBottleAtCenter(gridPositions, megaBottleIndex, config) {
  const center = {
    x: Math.floor(Math.max(1, config.layoutGridColumns) / 2),
    y: Math.floor(Math.max(1, config.layoutGridRows) / 2),
  };
  const occupiedCenterIndex = gridPositions.findIndex((position, index) =>
    index !== megaBottleIndex && position.x === center.x && position.y === center.y);
  const previousMegaPosition = gridPositions[megaBottleIndex];
  gridPositions[megaBottleIndex] = center;
  if (occupiedCenterIndex >= 0) {
    gridPositions[occupiedCenterIndex] = previousMegaPosition;
  }
}

function countCompletedFullBottles(state, capacity, locked) {
  let count = 0;
  for (let i = 0; i < state.colors.length; i++) {
    if (!locked[i] && state.colors[i].length === capacity) {
      const color = state.colors[i][0];
      if (state.colors[i].every(value => value === color)) count++;
    }
  }
  return count;
}

function chooseLockedBottles(board, capacity, moves, band, random) {
  if (!band.allowLockedBottleMode || random() >= band.lockedBottleChance) return [];
  let state = makeInitialHiddenState(board);
  const completedBeforeTouch = Array(board.length).fill(-1);
  const locked = Array(board.length).fill(false);
  for (const move of moves) {
    const completed = countCompletedFullBottles(state, capacity, locked);
    const from = move.fromBottle - 1;
    const to = move.toBottle - 1;
    if (completedBeforeTouch[from] < 0) completedBeforeTouch[from] = completed;
    if (completedBeforeTouch[to] < 0) completedBeforeTouch[to] = completed;
    state = applyHiddenPour(state, from, to, capacity);
    if (state == null) return [];
  }

  const minThreshold = Math.max(1, band.minCompletedBottleCountToUnlock);
  const maxThreshold = Math.max(minThreshold, band.maxCompletedBottleCountToUnlock);
  const candidates = completedBeforeTouch
    .map((completed, index) => ({ index, completed }))
    .filter(candidate => candidate.completed >= minThreshold);
  if (candidates.length === 0) return [];

  const targetCount = Math.min(randomInt(random, Math.max(1, band.minLockedBottleCount), Math.max(1, band.maxLockedBottleCount)), candidates.length, 4);
  return shuffle(candidates, random).slice(0, targetCount).map(candidate => ({
    index: candidate.index,
    unlockCompletedBottleCount: randomInt(random, minThreshold, Math.min(maxThreshold, candidate.completed)),
  }));
}

function replaySolutionWithLocks(board, capacity, moves, lockedBottles) {
  let state = makeInitialHiddenState(board);
  const locked = Array(board.length).fill(false);
  const thresholds = new Map();
  for (const lockedBottle of lockedBottles) {
    locked[lockedBottle.index] = true;
    thresholds.set(lockedBottle.index, lockedBottle.unlockCompletedBottleCount);
  }
  for (const move of moves) {
    const completed = countCompletedFullBottles(state, capacity, locked);
    for (let i = 0; i < locked.length; i++) {
      if (locked[i] && completed >= thresholds.get(i)) locked[i] = false;
    }
    const from = move.fromBottle - 1;
    const to = move.toBottle - 1;
    if (locked[from] || locked[to]) return false;
    state = applyHiddenPour(state, from, to, capacity);
    if (state == null) return false;
  }
  return isSolvedState(state, capacity);
}

function chooseHybridHiddenLayerIndexes(bottle, band, random) {
  if (bottle.length < 2 || random() >= band.hybridHiddenBottleChance) return [];
  const eligibleIndexes = [];
  for (let i = 0; i < bottle.length - 1; i++) eligibleIndexes.push(i);
  if (eligibleIndexes.length === 0) return [];
  const minCount = Math.max(1, Math.min(2, band.minHybridHiddenLayersPerBottle));
  const maxCount = Math.max(minCount, Math.min(2, band.maxHybridHiddenLayersPerBottle, eligibleIndexes.length));
  const count = randomInt(random, minCount, maxCount);
  return shuffle(eligibleIndexes, random).slice(0, count).sort((a, b) => a - b);
}

function buildHybridHiddenLayers(board, band, random) {
  const hiddenLayers = board.map(bottle => chooseHybridHiddenLayerIndexes(bottle, band, random));
  if (hiddenLayers.some(layers => layers.length > 0)) return hiddenLayers;
  const candidates = board
    .map((bottle, index) => ({ bottle, index }))
    .filter(candidate => candidate.bottle.length >= 2);
  if (candidates.length === 0) return hiddenLayers;
  const candidate = candidates[randomInt(random, 0, candidates.length - 1)];
  hiddenLayers[candidate.index] = [MathfFallbackHiddenIndex(candidate.bottle.length, random)];
  return hiddenLayers;
}

function MathfFallbackHiddenIndex(length, random) {
  return randomInt(random, 0, Math.max(0, length - 2));
}

function hasCapacityRepeat(board, capacity) {
  return board.some(bottle => {
    const counts = new Map();
    for (const color of bottle) counts.set(color, (counts.get(color) || 0) + 1);
    return Array.from(counts.values()).some(count => count >= capacity);
  });
}

function replaySolution(board, capacity, moves) {
  let state = makeInitialHiddenState(board);
  for (const move of moves) {
    state = applyHiddenPour(state, move.fromBottle - 1, move.toBottle - 1, capacity);
    if (state == null) return false;
  }
  return isSolvedState(state, capacity);
}

function replayMegaSolution(board, capacities, megaBottleIndex, megaTargetColor, moves) {
  const state = board.map(bottle => bottle.slice());
  for (const move of moves) {
    const from = move.fromBottle - 1;
    const to = move.toBottle - 1;
    if (from === megaBottleIndex) return false;
    const source = state[from];
    const target = state[to];
    if (!source || !target || source.length === 0 || target.length >= capacities[to]) return false;
    const color = source[source.length - 1];
    if (to === megaBottleIndex && color !== megaTargetColor) return false;
    if (target.length > 0 && target[target.length - 1] !== color) return false;
    let amount = 0;
    for (let i = source.length - 1; i >= 0 && source[i] === color; i--) amount++;
    amount = Math.min(amount, capacities[to] - target.length);
    if (amount <= 0) return false;
    for (let i = 0; i < amount; i++) target.push(source.pop());
  }

  const mega = state[megaBottleIndex];
  return mega.length === capacities[megaBottleIndex] && mega.every(color => color === megaTargetColor);
}

function assertBoardWithinCapacity(board, capacity, levelNumber, megaLevel = null) {
  for (let i = 0; i < board.length; i++) {
    const bottleCapacity = megaLevel != null && i === megaLevel.megaBottleIndex ? megaLevel.megaCapacity : capacity;
    if (board[i].length > bottleCapacity) {
      throw new Error(`Bottle ${i + 1} exceeds capacity ${bottleCapacity} at level ${levelNumber}`);
    }
  }
}

function removeOldJsonPacks() {
  for (const [dir, rx] of [[levelDir, /^watersort-levels-\d{3}\.json$/], [solutionDir, /^watersort-solutions-\d{3}\.json$/]]) {
    for (const file of fs.readdirSync(dir)) if (rx.test(file)) fs.rmSync(path.join(dir, file));
  }
}

function main() {
  assertScoped(levelDir, levelRelativeDir);
  assertScoped(solutionDir, solutionRelativeDir);
  fs.mkdirSync(levelDir, { recursive: true });
  fs.mkdirSync(solutionDir, { recursive: true });

  const config = readConfig();
  const selectedProfile = selectedProfileFor(config);
  const dryRun = process.env.WATERSORT_GENERATOR_DRY_RUN === "1";
  const solvedModules = new Map();
  const capacities = Array.from(new Set(
    (selectedProfile.capacityWeights.length
      ? selectedProfile.capacityWeights.filter(row => row.weight > 0).map(row => row.value)
      : [config.defaultBottleCapacity])
      .map(capacity => Math.max(2, Math.min(5, capacity)))))
    .sort((a, b) => a - b);

  for (const capacity of capacities) {
    for (const colorCount of moduleSizesForCapacity(capacity)) {
      console.error(`Solving module ${colorCount} colors / cap ${capacity}`);
      solvedModules.set(`${capacity}:${colorCount}`, solveModule(colorCount, capacity, config));
    }
  }

  const levelOffset = (packIndex - 1) * config.levelsPerPack;
  const levelPack = { packName: `Water Sort Levels ${packId}`, levels: [] };
  const solutionPack = { packName: `Water Sort Solutions ${packId}`, levelSolutions: [] };
  const stats = {
    levels: 0,
    difficulty: selectedProfile.name,
    hiddenStack: 0,
    hybridHiddenStack: 0,
    lockedBottles: 0,
    megaBottle: 0,
    minAdBottles: Infinity,
    maxAdBottles: 0,
    byCapacity: {},
    minStep: Infinity,
    maxStep: 0,
    minCoreBottles: Infinity,
    maxCoreBottles: 0,
    minPhysicalBottles: Infinity,
    maxPhysicalBottles: 0,
    minNormalHelpers: Infinity,
    maxNormalHelpers: 0,
    minPartialBottles: Infinity,
    maxPartialBottles: 0,
    minBranching: Infinity,
    maxBranching: 0,
    minSafeMoveRatio: Infinity,
    maxSafeMoveRatio: 0,
    minCriticalDecisions: Infinity,
    maxCriticalDecisions: 0,
    minNearWinScore: Infinity,
    maxNearWinScore: 0,
    maxVisitedStates: 0,
  };

  for (let localLevelNumber = 1; localLevelNumber <= config.levelsPerPack; localLevelNumber++) {
    const levelNumber = levelOffset + localLevelNumber;
    const random = rng(seedFor(levelNumber, 0x1EAF0000, 2246822519));
    const request = resolveGenerationRequest(config, selectedProfile, random);
    const preferredCapacity = capacityFor(config, selectedProfile, random);
    let capacity = preferredCapacity;
    let board;
    let solutionMoveLists;
    let megaLevel = null;
    let specialMetrics = null;

    if (!isSpecialProfile(selectedProfile) && shouldBuildMegaLevel(selectedProfile, random)) {
      megaLevel = buildMegaLevel(config, selectedProfile, levelNumber, random);
      capacity = megaLevel.capacity;
      board = megaLevel.board;
      solutionMoveLists = megaLevel.solutionMoveLists;
    } else if (!isSpecialProfile(selectedProfile) && shouldBuildSmallTutorial(selectedProfile)) {
      const tutorialLevel = buildSmallTutorialLevel(config, selectedProfile, levelNumber, random);
      capacity = tutorialLevel.capacity;
      board = tutorialLevel.board;
      solutionMoveLists = tutorialLevel.solutionMoveLists;
    } else if (isSpecialProfile(selectedProfile)) {
      const generated = generateSpecialCoreLevel(config, selectedProfile, request, levelNumber, solvedModules, preferredCapacity);
      capacity = generated.capacity;
      board = generated.board;
      solutionMoveLists = generated.solutionMoveLists;
      specialMetrics = generated;
    } else {
      let recipe;
      const recipeFailures = [];
      const maxConstructionModuleCount = 3;
      for (const candidateCapacity of capacityOptionsFor(config, selectedProfile, preferredCapacity)) {
        try {
          const picked = chooseRecipe(config, selectedProfile, candidateCapacity, maxConstructionModuleCount, solvedModules, random, request);
          capacity = candidateCapacity;
          recipe = picked.recipe;
          break;
        } catch (error) {
          recipeFailures.push(`${candidateCapacity}: ${error.message}`);
        }
      }
      if (recipe == null) throw new Error(`No modular recipe fits level ${levelNumber}: ${recipeFailures.join("; ")}`);
      const composedLevel = buildComposedLevel(recipe, solvedModules, levelNumber, selectedProfile.storedSolutionTarget);
      board = composedLevel.board;
      solutionMoveLists = composedLevel.solutionMoveLists;
    }

    const coreBottleCount = board.length;
    if (request.explicitCoreBottleCount && coreBottleCount !== request.coreBottleCount) {
      throw new Error(`Expected ${request.coreBottleCount} core bottles, got ${coreBottleCount} at level ${levelNumber}`);
    }

    const coreComposition = compositionStats(board, capacity);
    const adHelpers = addAdHelperBottles(board, random);
    const shape = applyAlternatingGapPreference(
      applyDenseLayoutPreference(chooseShapeForBottleCount(selectedProfile, board.length, levelNumber), selectedProfile, board.length, levelNumber),
      selectedProfile,
      board.length,
      levelNumber);
    const hybridHiddenStack = megaLevel == null && selectedProfile.allowHybridHiddenStackMode && random() < selectedProfile.hybridHiddenStackChance;
    const hiddenStack = megaLevel == null && !hybridHiddenStack && selectedProfile.allowHiddenStackMode && random() < selectedProfile.hiddenStackChance;
    const hybridHiddenLayers = hybridHiddenStack ? buildHybridHiddenLayers(board, selectedProfile, random) : board.map(() => []);
    const gridPositions = assignGridPositions(board, shape, config, isSpecialProfile(selectedProfile));
    if (megaLevel != null) placeMegaBottleAtCenter(gridPositions, megaLevel.megaBottleIndex, config);

    let lockedBottles = megaLevel == null ? chooseLockedBottles(board, capacity, solutionMoveLists[0], selectedProfile, random) : [];
    let validSolutionMoveLists = megaLevel == null
      ? solutionMoveLists.filter(candidateMoves => replaySolutionWithLocks(board.slice(0, coreBottleCount), capacity, candidateMoves, lockedBottles))
      : solutionMoveLists.filter(candidateMoves => replayMegaSolution(
        board.slice(0, coreBottleCount),
        board.slice(0, coreBottleCount).map((_, index) => index === megaLevel.megaBottleIndex ? megaLevel.megaCapacity : capacity),
        megaLevel.megaBottleIndex,
        megaLevel.megaTargetColor,
        candidateMoves));

    if (megaLevel == null && lockedBottles.length > 0 && validSolutionMoveLists.length === 0) {
      lockedBottles = [];
      validSolutionMoveLists = solutionMoveLists;
    }
    if (validSolutionMoveLists.length === 0) throw new Error(`No valid solution after mode constraints at level ${levelNumber}`);

    const lockedByBottle = new Map(lockedBottles.map(lockedBottle => [lockedBottle.index, lockedBottle.unlockCompletedBottleCount]));
    const moves = validSolutionMoveLists[0];
    if (board.length > config.maxBottleCount) throw new Error(`Bad physical bottle count at level ${levelNumber}: ${board.length}`);
    assertBoardWithinCapacity(board, capacity, levelNumber, megaLevel);
    if (!isSpecialProfile(selectedProfile) && (moves.length < selectedProfile.minShortestStepCount || moves.length > selectedProfile.maxShortestStepCount)) {
      throw new Error(`Bad step count at level ${levelNumber}: ${moves.length} for ${selectedProfile.name}`);
    }
    if (isSpecialProfile(selectedProfile) && moves.length > selectedProfile.maxShortestStepCount) {
      throw new Error(`Special solution exceeds max step count at level ${levelNumber}: ${moves.length}`);
    }
    if (megaLevel == null && hasCapacityRepeat(board.slice(0, coreBottleCount), capacity)) {
      throw new Error(`Capacity repeat at level ${levelNumber}`);
    }

    const replayBoard = board.slice(0, coreBottleCount);
    for (const candidateMoves of validSolutionMoveLists) {
      if (megaLevel != null) {
        if (!replayMegaSolution(
          replayBoard,
          replayBoard.map((_, index) => index === megaLevel.megaBottleIndex ? megaLevel.megaCapacity : capacity),
          megaLevel.megaBottleIndex,
          megaLevel.megaTargetColor,
          candidateMoves)) throw new Error(`Invalid mega solution at level ${levelNumber}`);
      } else {
        if (!replaySolution(replayBoard, capacity, candidateMoves)) throw new Error(`Invalid constructed solution at level ${levelNumber}`);
        if (!replaySolutionWithLocks(replayBoard, capacity, candidateMoves, lockedBottles)) throw new Error(`Invalid locked solution at level ${levelNumber}`);
      }
    }

    const stepCount = moves.length;
    const modeSuffix = `${megaLevel != null ? "mega" : hiddenStack ? "hidden" : hybridHiddenStack ? "hybrid_hidden" : "normal"}${lockedBottles.length > 0 ? "_locked" : ""}`;
    const solutionData = {
      solutionCount: validSolutionMoveLists.length,
      shortestStepCount: stepCount,
      storedSolutionCount: validSolutionMoveLists.length,
      storesAllSolutions: false,
      selectionPolicy: `${config.selectionPolicy}_${selectedProfile.name.toLowerCase()}_${modeSuffix}_${isSpecialProfile(selectedProfile) ? "final_board_resolved" : "modular_constructed"}`,
      solutions: validSolutionMoveLists.map(candidateMoves => ({ stepCount: candidateMoves.length, moves: candidateMoves })),
    };

    levelPack.levels.push({
      displayName: `Level ${levelNumber}`,
      layoutGrid: { columns: config.layoutGridColumns, rows: config.layoutGridRows, shape },
      modeOptions: { hiddenStack, hybridHiddenStack, lockedBottles: lockedBottles.length > 0, megaBottle: megaLevel != null },
      bottles: board.map((colorsBottomToTop, index) => {
        const isMegaBottle = megaLevel != null && index === megaLevel.megaBottleIndex;
        const bottle = {
          capacity: isMegaBottle ? megaLevel.megaCapacity : capacity,
          colorsBottomToTop,
          gridPosition: gridPositions[index],
        };
        if (index >= adHelpers.firstAdBottleIndex) bottle.isAdBottle = true;
        if (isMegaBottle) {
          bottle.isMegaBottle = true;
          bottle.targetColor = megaLevel.megaTargetColor;
        }
        if (hybridHiddenLayers[index]?.length > 0) bottle.hiddenLayerIndexes = hybridHiddenLayers[index];
        if (lockedByBottle.has(index)) {
          bottle.isLocked = true;
          bottle.unlockCompletedBottleCount = lockedByBottle.get(index);
        }
        return bottle;
      }),
    });
    solutionPack.levelSolutions.push({ levelNumber, solutionData });

    stats.levels++;
    if (hiddenStack) stats.hiddenStack++;
    if (hybridHiddenStack) stats.hybridHiddenStack++;
    if (lockedBottles.length > 0) stats.lockedBottles++;
    if (megaLevel != null) stats.megaBottle++;
    stats.byCapacity[capacity] = (stats.byCapacity[capacity] || 0) + 1;
    stats.minAdBottles = Math.min(stats.minAdBottles, adHelpers.adBottleCount);
    stats.maxAdBottles = Math.max(stats.maxAdBottles, adHelpers.adBottleCount);
    stats.minStep = Math.min(stats.minStep, stepCount);
    stats.maxStep = Math.max(stats.maxStep, stepCount);
    stats.minCoreBottles = Math.min(stats.minCoreBottles, coreBottleCount);
    stats.maxCoreBottles = Math.max(stats.maxCoreBottles, coreBottleCount);
    stats.minPhysicalBottles = Math.min(stats.minPhysicalBottles, board.length);
    stats.maxPhysicalBottles = Math.max(stats.maxPhysicalBottles, board.length);
    stats.minNormalHelpers = Math.min(stats.minNormalHelpers, coreComposition.emptyBottleCount);
    stats.maxNormalHelpers = Math.max(stats.maxNormalHelpers, coreComposition.emptyBottleCount);
    stats.minPartialBottles = Math.min(stats.minPartialBottles, coreComposition.partialBottleCount);
    stats.maxPartialBottles = Math.max(stats.maxPartialBottles, coreComposition.partialBottleCount);
    if (specialMetrics != null) {
      stats.minBranching = Math.min(stats.minBranching, specialMetrics.difficulty.averageBranchingFactor);
      stats.maxBranching = Math.max(stats.maxBranching, specialMetrics.difficulty.averageBranchingFactor);
      stats.minSafeMoveRatio = Math.min(stats.minSafeMoveRatio, specialMetrics.difficulty.safeMoveRatio);
      stats.maxSafeMoveRatio = Math.max(stats.maxSafeMoveRatio, specialMetrics.difficulty.safeMoveRatio);
      stats.minCriticalDecisions = Math.min(stats.minCriticalDecisions, specialMetrics.difficulty.criticalDecisionCount);
      stats.maxCriticalDecisions = Math.max(stats.maxCriticalDecisions, specialMetrics.difficulty.criticalDecisionCount);
      stats.minNearWinScore = Math.min(stats.minNearWinScore, specialMetrics.nearWin.nearWinScore);
      stats.maxNearWinScore = Math.max(stats.maxNearWinScore, specialMetrics.nearWin.nearWinScore);
    }
  }

  for (const module of solvedModules.values()) stats.maxVisitedStates = Math.max(stats.maxVisitedStates, module.visitedStates);
  if (!dryRun) {
    fs.writeFileSync(levelFile, JSON.stringify(levelPack, null, 2) + "\n", "utf8");
    fs.writeFileSync(solutionFile, JSON.stringify(solutionPack, null, 2) + "\n", "utf8");
  }
  console.log(JSON.stringify({
    dryRun,
    request: {
      difficulty: selectedProfile.name,
      explicitCoreBottleCount: readOptionalInt("WATERSORT_CORE_BOTTLES"),
    },
    written: dryRun ? null : { levels: path.relative(root, levelFile), solutions: path.relative(root, solutionFile) },
    stats,
  }, null, 2));
}

