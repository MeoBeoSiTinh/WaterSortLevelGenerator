"use strict";

const fs = require("fs");
const path = require("path");
const {
  SolverMode,
  solveWaterSort,
  applyKnownPour,
  applyHiddenPour,
  enumerateMoves,
  isSolvedState,
  makeInitialHiddenState,
  solveExhaustiveHidden,
} = require("./watersort-exhaustive-solver");
const {
  buildMegaLevelV2,
  replayMegaSolutionExact,
} = require("./mega-generator-v2");
const {
  coreGameplayFingerprintFromBoard,
} = require("./watersort-core-fingerprint");

const root = process.cwd();
const assetRoot = resolveAssetRoot();
const levelRelativeDir = `${assetRoot}/Data/WaterSort/Resources/WaterSort`;
const solutionRelativeDir = `${assetRoot}/Data/WaterSort/Resources/WaterSortSolutions`;
const levelDir = path.join(root, levelRelativeDir);
const solutionDir = path.join(root, solutionRelativeDir);
const configPath = process.env.WATERSORT_GENERATION_CONFIG_PATH
  ? path.resolve(root, process.env.WATERSORT_GENERATION_CONFIG_PATH)
  : path.join(root, `${assetRoot}/Data/WaterSort/Generation/WaterSortGenerationConfig.asset`);
const paletteSize = 13;

const packIndex = parsePackIndex(process.argv[2] ?? process.env.WATERSORT_PACK_INDEX ?? "1");
const generatorSeed = parseSeed(process.argv[3] ?? process.env.WATERSORT_GENERATOR_SEED ?? "0");
const requestedDifficultyProfile = normalizeProfileName(process.argv[4] ?? process.env.WATERSORT_DIFFICULTY_PROFILE ?? "");
const packId = String(packIndex).padStart(3, "0");
const levelFile = path.join(levelDir, `watersort-levels-${packId}.json`);
const solutionFile = path.join(solutionDir, `watersort-solutions-${packId}.json`);

function resolveAssetRoot() {
  const packageRoot = "Assets/LevelGenerator";
  if (fs.existsSync(path.join(root, packageRoot))) {
    return packageRoot;
  }

  return "Assets/Project";
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

function normalizeProfileName(value) {
  return String(value ?? "").trim().replace(/\s+/g, "");
}

function normalizeProfileId(value) {
  const normalized = normalizeProfileName(value).replace(/_/g, "").toLowerCase();
  if (normalized === "1" || normalized === "easy") return "Easy";
  if (normalized === "2" || normalized === "normal") return "Normal";
  if (normalized === "3" || normalized === "hard") return "Hard";
  if (normalized === "4" || normalized === "veryhard") return "VeryHard";
  if (normalized === "5" || normalized === "special") return "Special";
  return "";
}

function parsePositiveInt(value, fallback) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`Invalid positive integer: ${value}`);
  return parsed;
}

function parseOptionalPositiveInt(value, name) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`Invalid ${name}: ${value}`);
  return parsed;
}

function parseOptionalBoolean(value, name) {
  if (value == null || value === "") return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no") return false;
  throw new Error(`Invalid ${name}: ${value}`);
}

function assertScoped(dir, expectedSuffix) {
  const resolved = path.resolve(dir);
  const expected = path.resolve(root, expectedSuffix);
  if (resolved !== expected) throw new Error(`Refusing to write outside expected folder: ${resolved}`);
}

function splitProfileBlocks(text, sectionName) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let inSection = false;
  let current = [];
  for (const line of lines) {
    if (!inSection) {
      if (line === `  ${sectionName}:`) inSection = true;
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

function readConfig(sourcePath = configPath) {
  const text = fs.readFileSync(sourcePath, "utf8");
  const cleanYamlScalar = value => String(value ?? "").trim().replace(/^['"]|['"]$/g, "");
  const top = (name, fallback) => {
    const match = text.match(new RegExp(`^  ${name}:\\s*(.+)$`, "m"));
    if (!match) return fallback;
    const raw = match[1].trim();
    if (raw === "1") return true;
    if (raw === "0") return false;
    const number = Number(raw);
    return Number.isFinite(number) ? number : raw;
  };
  const topNumber = (name, fallback) => {
    const match = text.match(new RegExp(`^  ${name}:\\s*(.+)$`, "m"));
    if (!match) return fallback;
    const number = Number(match[1].trim());
    return Number.isFinite(number) ? number : fallback;
  };

  const profiles = [];
  const profileSectionName = /^\s{2}difficultyProfiles:/m.test(text) ? "difficultyProfiles" : "difficultyBands";
  const parts = splitProfileBlocks(text, profileSectionName);
  for (const part of parts) {
    const name = part.match(/^(?:  - |    )name:\s*(.+)$/m)?.[1]?.trim() || "";
    const get = (key, fallback) => {
      const match = part.match(new RegExp(`^(?:  - |    )${key}:\\s*(.+)$`, "m"));
      return match ? Number(match[1].trim()) : fallback;
    };
    const parseWeights = (sectionName, valueName) => {
      const section = part.match(new RegExp(`^    ${sectionName}:\\r?\\n([\\s\\S]*?)(?=^    \\w|\\z)`, "m"));
      if (!section) return [];
      const rows = [];
      const rx = new RegExp(`^    - ${valueName}:\\s*(\\d+)\\r?\\n      weight:\\s*(\\d+)`, "gm");
      let match;
      while ((match = rx.exec(section[1])) !== null) rows.push({ value: Number(match[1]), weight: Number(match[2]) });
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
          maxBottleCount: match[4] ? Number(match[4]) : 64,
        });
      }
      return rows;
    };
    const parseStringWeights = (sectionName, valueName) => {
      const section = part.match(new RegExp(`^    ${sectionName}:\\r?\\n([\\s\\S]*?)(?=^    \\w|\\z)`, "m"));
      if (!section) return [];
      const rows = [];
      const rx = new RegExp(`^    - ${valueName}:\\s*(.+)\\r?\\n      weight:\\s*(\\d+)`, "gm");
      let match;
      while ((match = rx.exec(section[1])) !== null) rows.push({ value: cleanYamlScalar(match[1]), weight: Number(match[2]) });
      return rows;
    };
    const getBool = (key, fallback) => {
      const match = part.match(new RegExp(`^    ${key}:\\s*(.+)$`, "m"));
      if (!match) return fallback;
      const raw = match[1].trim();
      if (raw === "1" || raw.toLowerCase() === "true") return true;
      if (raw === "0" || raw.toLowerCase() === "false") return false;
      return fallback;
    };
    const levelFrom = get("levelFrom", 1);
    const levelTo = get("levelTo", levelFrom);
    const parseNearWin = () => {
      const section = part.match(/^    nearWin:\r?\n([\s\S]*?)(?=^    \w|\z)/m)?.[1] || "";
      const getNear = (key, fallback) => {
        const match = section.match(new RegExp(`^      ${key}:\\s*(.+)$`, "m"));
        if (!match) return fallback;
        const raw = match[1].trim();
        if (raw === "1" || raw.toLowerCase() === "true") return true;
        if (raw === "0" || raw.toLowerCase() === "false") return false;
        const number = Number(raw);
        return Number.isFinite(number) ? number : raw;
      };
      return {
        minNearWinScore: getNear("minNearWinScore", 0.75),
        minCriticalDepthRatio: getNear("minCriticalDepthRatio", 0.4),
        maxCriticalDepthRatio: getNear("maxCriticalDepthRatio", 0.85),
        maxCriticalStates: getNear("maxCriticalStates", 24),
        maxTrapCandidates: getNear("maxTrapCandidates", 24),
        trapSolverMaxStates: getNear("trapSolverMaxStates", 100000),
        trapSolverMaxDepth: getNear("trapSolverMaxDepth", 140),
        minSoftTrapRecoveryPenalty: getNear("minSoftTrapRecoveryPenalty", 6),
        minSoftTrapRecoveryRatio: getNear("minSoftTrapRecoveryRatio", 1.35),
        softTrapWeight: getNear("softTrapWeight", 0.55),
        strongTrapWeight: getNear("strongTrapWeight", 0.35),
        hardDeadlockWeight: getNear("hardDeadlockWeight", 0.1),
        allowAddBottleRescue: getNear("allowAddBottleRescue", true),
        allowShuffleRescue: getNear("allowShuffleRescue", true),
        shuffleCandidateCount: getNear("shuffleCandidateCount", 24),
        minShuffleRemainingSteps: getNear("minShuffleRemainingSteps", 2),
      };
    };
    profiles.push({
      profileId: normalizeProfileId(get("profileId", "")) || normalizeProfileId(name),
      name,
      enabled: getBool("enabled", true),
      colorWeights: parseWeights("colorWeights", "colorCount"),
      helperWeights: parseWeights("helperCapacityWeights", "helperCapacity"),
      capacityWeights: parseWeights("bottleCapacityWeights", "capacity"),
      shapeWeights: parseShapeWeights(),
      allowHiddenStackMode: getBool("allowHiddenStackMode", false),
      hiddenStackChance: get("hiddenStackChance", 0),
      allowHybridHiddenStackMode: getBool("allowHybridHiddenStackMode", false),
      hybridHiddenStackChance: get("hybridHiddenStackChance", 0),
      hybridHiddenBottleChance: get("hybridHiddenBottleChance", 0.5),
      minHybridHiddenLayersPerBottle: get("minHybridHiddenLayersPerBottle", 1),
      maxHybridHiddenLayersPerBottle: get("maxHybridHiddenLayersPerBottle", 2),
      allowLockedBottleMode: getBool("allowLockedBottleMode", false),
      lockedBottleChance: get("lockedBottleChance", 0),
      minLockedBottleCount: get("minLockedBottleCount", 1),
      maxLockedBottleCount: get("maxLockedBottleCount", 4),
      minCompletedBottleCountToUnlock: get("minCompletedBottleCountToUnlock", 1),
      maxCompletedBottleCountToUnlock: get("maxCompletedBottleCountToUnlock", 3),
      allowMegaBottleMode: getBool("allowMegaBottleMode", false),
      megaBottleChance: get("megaBottleChance", 0),
      minMegaBottleCapacity: get("minMegaBottleCapacity", 12),
      maxMegaBottleCapacity: get("maxMegaBottleCapacity", 20),
      megaCandidateAttemptCount: get("megaCandidateAttemptCount", 48),
      minMegaActiveBottleCount: get("minMegaActiveBottleCount", 14),
      maxMegaActiveBottleCount: get("maxMegaActiveBottleCount", 30),
      minMegaBlockerColorCount: get("minMegaBlockerColorCount", 6),
      maxMegaBlockerColorCount: get("maxMegaBlockerColorCount", 9),
      minMegaNormalHelperCount: get("minMegaNormalHelperCount", 1),
      maxMegaNormalHelperCount: get("maxMegaNormalHelperCount", 2),
      maxMegaTargetGroupSize: get("maxMegaTargetGroupSize", 2),
      minMegaBuriedTargetRatio: get("minMegaBuriedTargetRatio", 0.85),
      minMegaDeepBuriedTargetRatio: get("minMegaDeepBuriedTargetRatio", 0.35),
      minMegaUniqueTopColorCount: get("minMegaUniqueTopColorCount", 4),
      maxMegaTopColorShare: get("maxMegaTopColorShare", 0.25),
      minMegaUniqueBottlePatternRatio: get("minMegaUniqueBottlePatternRatio", 1),
      minMegaMovesBeforeFirstFill: get("minMegaMovesBeforeFirstFill", 3),
      minMegaCrossBottleBlockerMoves: get("minMegaCrossBottleBlockerMoves", 3),
      minMegaNonMegaMoveRatio: get("minMegaNonMegaMoveRatio", 0.4),
      maxMegaConsecutiveFillMoves: get("maxMegaConsecutiveFillMoves", 3),
      megaSolverMaxStates: get("megaSolverMaxStates", 60000),
      megaSolverMaxDepth: get("megaSolverMaxDepth", 160),
      minMegaActiveFillRatio: get("minMegaActiveFillRatio", 0.5),
      targetMegaActiveFillRatio: get("targetMegaActiveFillRatio", 0.85),
      maxMegaActiveFreeRatio: get("maxMegaActiveFreeRatio", 0.2),
      maxMegaSparseBottleRatio: get("maxMegaSparseBottleRatio", 0.15),
      maxMegaSingleLayerBottleCount: get("maxMegaSingleLayerBottleCount", 0),
      megaFreeCapacityConcentrationRatio: get("megaFreeCapacityConcentrationRatio", 0.65),
      minTargetBottleCount: get("minTargetBottleCount", 4),
      maxTargetBottleCount: get("maxTargetBottleCount", 40),
      minShortestStepCount: get("minShortestStepCount", 8),
      maxShortestStepCount: get("maxShortestStepCount", 80),
      maxSolutionCount: get("maxSolutionCount", 1000000),
      targetDifficultyScoreMin: get("targetDifficultyScoreMin", 0),
      targetDifficultyScoreMax: get("targetDifficultyScoreMax", 1),
      storedSolutionTarget: get("storedSolutionTarget", 1),
      allowSmallIntroLevel: getBool("allowSmallIntroLevel", false),
      allowSpecialNearWin: getBool("allowSpecialNearWin", false),
      nearWin: parseNearWin(),
      minNormalHelperCount: get("minNormalHelperCount", 1),
      maxNormalHelperCount: get("maxNormalHelperCount", 2),
      minActiveFillRatio: get("minActiveFillRatio", 0.7),
      targetActiveFillRatio: get("targetActiveFillRatio", 0.85),
      maxStartingFreeRatio: get("maxStartingFreeRatio", 0.25),
      minPartialBottleCount: get("minPartialBottleCount", 0),
      maxSafeMoveRatio: get("maxSafeMoveRatio", 1),
      minDeadEndPotential: get("minDeadEndPotential", 0),
      minTrapLikelihood: get("minTrapLikelihood", 0),
      minAverageBranchingFactor: get("minAverageBranchingFactor", 0),
      minCriticalDecisionCount: get("minCriticalDecisionCount", 0),
    });
  }
  upgradeMissingDifficultyProfiles(profiles);

  return {
    selectedDifficultyProfile: normalizeProfileName(top("selectedDifficultyProfile", "Hard")),
    levelsPerPack: parsePositiveInt(process.env.WATERSORT_LEVELS_PER_PACK, top("levelsPerPack", 100)),
    solutionExampleLimitWhenMany: top("solutionExampleLimitWhenMany", 3),
    manySolutionThreshold: top("manySolutionThreshold", 10),
    defaultBottleCapacity: top("defaultBottleCapacity", 4),
    layoutGridColumns: top("layoutGridColumns", 8),
    layoutGridRows: top("layoutGridRows", 5),
    preferredMinEmptyBottleCount: topNumber("preferredMinEmptyBottleCount", 1),
    preferredMaxEmptyBottleCount: topNumber("preferredMaxEmptyBottleCount", 3),
    maxBottleCount: topNumber("maxBottleCount", 40),
    selectionPolicy: String(top("selectionPolicy", "shortest_non_loop_empty_priority_opening_diversity_soft")),
    profiles,
    bands: profiles,
  };
}

function cloneProfile(profile) {
  return JSON.parse(JSON.stringify(profile || {}));
}

function cloneConfig(config) {
  return {
    ...config,
    profiles: config.profiles.map(cloneProfile),
    bands: config.bands.map(cloneProfile),
  };
}

function upgradeMissingDifficultyProfiles(profiles) {
  for (const profile of profiles) {
    profile.profileId = profile.profileId || normalizeProfileId(profile.name);
  }
  removeDuplicateProfiles(profiles);
  const hard = profiles.find(profile => profile.profileId === "Hard") || profiles[profiles.length - 1] || {};
  addProfileIfMissing(profiles, "Easy", hard);
  addProfileIfMissing(profiles, "Normal", hard);
  addProfileIfMissing(profiles, "Hard", hard);
  addProfileIfMissing(profiles, "VeryHard", hard);
  addProfileIfMissing(profiles, "Special", hard);
  removeDuplicateProfiles(profiles);
  const order = new Map(["Easy", "Normal", "Hard", "VeryHard", "Special"].map((id, index) => [id, index]));
  profiles.sort((left, right) => order.get(left.profileId) - order.get(right.profileId));
}

function addProfileIfMissing(profiles, profileId, hardTemplate) {
  const existing = profiles.find(profile => profile.profileId === profileId);
  if (existing) {
    existing.name = profileId;
    return;
  }
  const created = cloneProfile(hardTemplate);
  created.profileId = profileId;
  created.name = profileId;
  applyGeneratedProfileDefaults(created, profileId);
  profiles.push(created);
}

function removeDuplicateProfiles(profiles) {
  const seen = new Set();
  for (let i = 0; i < profiles.length; i++) {
    const profile = profiles[i];
    const id = profile.profileId || normalizeProfileId(profile.name);
    if (!id || seen.has(id)) {
      profiles.splice(i, 1);
      i--;
      continue;
    }
    profile.profileId = id;
    seen.add(id);
  }
}

function applyGeneratedProfileDefaults(profile, profileId) {
  if (profileId === "VeryHard") {
    profile.targetDifficultyScoreMin = Math.max(profile.targetDifficultyScoreMin ?? 0, 0.72);
    profile.targetDifficultyScoreMax = Math.max(profile.targetDifficultyScoreMax ?? 0, 0.92);
    profile.minShortestStepCount = Math.max(profile.minShortestStepCount ?? 0, 44);
    profile.maxShortestStepCount = Math.max(profile.maxShortestStepCount ?? 0, 120);
    profile.minTargetBottleCount = Math.max(profile.minTargetBottleCount ?? 0, 12);
    profile.maxTargetBottleCount = Math.max(profile.maxTargetBottleCount ?? 0, profile.minTargetBottleCount);
    profile.minMegaDeepBuriedTargetRatio = Math.max(profile.minMegaDeepBuriedTargetRatio ?? 0, 0.5);
    profile.targetMegaActiveFillRatio = Math.max(profile.targetMegaActiveFillRatio ?? 0, 0.9);
    profile.maxMegaActiveFreeRatio = Math.min(profile.maxMegaActiveFreeRatio ?? 1, 0.15);
    profile.maxMegaSparseBottleRatio = Math.min(profile.maxMegaSparseBottleRatio ?? 1, 0.1);
    profile.minMegaCrossBottleBlockerMoves = Math.max(profile.minMegaCrossBottleBlockerMoves ?? 0, 4);
    const largestHelper = (profile.helperWeights || []).reduce((best, row) => best == null || row.value > best.value ? row : best, null);
    if (largestHelper) largestHelper.weight = 0;
    return;
  }

  if (profileId === "Special") {
    profile.targetDifficultyScoreMin = 0.5;
    profile.targetDifficultyScoreMax = 1;
    profile.minShortestStepCount = Math.max(18, Math.min(profile.minShortestStepCount ?? 18, 80));
    profile.maxShortestStepCount = Math.max(profile.minShortestStepCount, Math.min(profile.maxShortestStepCount ?? 80, 80));
    profile.minTargetBottleCount = Math.max(9, Math.min(profile.minTargetBottleCount ?? 9, 24));
    profile.maxTargetBottleCount = Math.max(profile.minTargetBottleCount, Math.min(profile.maxTargetBottleCount ?? 24, 24));
    profile.allowHiddenStackMode = false;
    profile.hiddenStackChance = 0;
    profile.allowHybridHiddenStackMode = false;
    profile.hybridHiddenStackChance = 0;
    profile.allowLockedBottleMode = false;
    profile.lockedBottleChance = 0;
    profile.allowMegaBottleMode = false;
    profile.megaBottleChance = 0;
    profile.allowSpecialNearWin = true;
    profile.nearWin = {
      ...(profile.nearWin || {}),
      minNearWinScore: 0.55,
      minCriticalDepthRatio: 0.4,
      maxCriticalDepthRatio: 0.99,
      maxTrapCandidates: 128,
      trapSolverMaxStates: 100000,
      trapSolverMaxDepth: 180,
      minSoftTrapRecoveryPenalty: 2,
      minSoftTrapRecoveryRatio: 1.1,
      softTrapWeight: 0.55,
      strongTrapWeight: 0.35,
      hardDeadlockWeight: 0.1,
      allowAddBottleRescue: true,
      allowShuffleRescue: true,
      shuffleCandidateCount: 24,
      minShuffleRemainingSteps: 2,
    };
  }
}

function readGenerationOverrides() {
  const overrides = {};
  if (process.env.WATERSORT_GENERATION_OVERRIDES) {
    let parsed;
    try {
      parsed = JSON.parse(process.env.WATERSORT_GENERATION_OVERRIDES);
    } catch (error) {
      throw new Error(`Invalid WATERSORT_GENERATION_OVERRIDES JSON: ${error.message}`);
    }
    Object.assign(overrides, parsed.overrides || parsed);
  }

  const assignInt = (key, envName) => {
    const value = parseOptionalPositiveInt(process.env[envName], envName);
    if (value != null) overrides[key] = value;
  };
  assignInt("coreBottleCount", "WATERSORT_CORE_BOTTLE_COUNT");
  assignInt("bottleCount", "WATERSORT_BOTTLE_COUNT");
  assignInt("totalPhysicalBottleCount", "WATERSORT_TOTAL_PHYSICAL_BOTTLE_COUNT");
  assignInt("colorCount", "WATERSORT_COLOR_COUNT");
  assignInt("bottleCapacity", "WATERSORT_BOTTLE_CAPACITY");
  assignInt("capacity", "WATERSORT_CAPACITY");
  assignInt("normalHelperCount", "WATERSORT_NORMAL_HELPER_COUNT");
  assignInt("helperCount", "WATERSORT_HELPER_COUNT");

  const nearWin = parseOptionalBoolean(process.env.WATERSORT_NEARWIN, "WATERSORT_NEARWIN");
  if (nearWin != null) overrides.nearWin = nearWin;
  return normalizeGenerationOverrides(overrides);
}

function normalizeGenerationOverrides(overrides) {
  const normalized = {};
  const coreBottleCount = overrides.coreBottleCount ?? overrides.bottleCount;
  if (coreBottleCount != null) normalized.coreBottleCount = parsePositiveInt(coreBottleCount, 0);
  if (overrides.totalPhysicalBottleCount != null) normalized.totalPhysicalBottleCount = parsePositiveInt(overrides.totalPhysicalBottleCount, 0);
  const capacity = overrides.bottleCapacity ?? overrides.capacity;
  if (capacity != null) normalized.bottleCapacity = parsePositiveInt(capacity, 0);
  if (overrides.colorCount != null) normalized.colorCount = parsePositiveInt(overrides.colorCount, 0);
  const helperCount = overrides.normalHelperCount ?? overrides.helperCount;
  if (helperCount != null) normalized.normalHelperCount = parsePositiveInt(helperCount, 0);
  if (typeof overrides.nearWin === "string") {
    normalized.nearWin = parseOptionalBoolean(overrides.nearWin, "nearWin");
  } else if (overrides.nearWin != null) {
    normalized.nearWin = Boolean(overrides.nearWin);
  }
  return normalized;
}

function exactWeight(value) {
  return [{ value, weight: 1 }];
}

function exactShapeWeight(shape, maxBottleCount) {
  return [{ value: shape, weight: 1, minBottleCount: 1, maxBottleCount }];
}

function profileMinimumCoreBottles(profile) {
  const id = profile.profileId || normalizeProfileId(profile.name);
  if (id === "VeryHard") return 5;
  if (id === "Special") return 5;
  if (id === "Hard") return 4;
  if (id === "Normal") return 3;
  return 2;
}

function deriveHelperCount(profile, coreBottleCount, overrideHelperCount) {
  if (overrideHelperCount != null) return overrideHelperCount;
  if (coreBottleCount <= 2) return 0;
  if ((profile.profileId || normalizeProfileId(profile.name)) === "Special" && coreBottleCount <= 12) return 0;
  if (coreBottleCount <= 7) return 1;
  const weightedHelpers = (profile.helperWeights || [])
    .filter(row => row.weight > 0)
    .map(row => Math.max(0, row.value));
  const preferred = weightedHelpers.length > 0 ? Math.min(...weightedHelpers) : 1;
  return Math.max(1, Math.min(3, preferred, coreBottleCount - 1));
}

function adaptiveStepRange(profile, coreBottleCount, colorCount, capacity, nearWinRequested) {
  const id = profile.profileId || normalizeProfileId(profile.name);
  const base = Math.max(1, colorCount * Math.max(1, capacity - 1));
  let minScale = 0.4;
  let maxScale = 1.15;
  if (id === "Normal") {
    minScale = 0.55;
    maxScale = 1.35;
  } else if (id === "Hard") {
    minScale = 0.7;
    maxScale = 1.65;
  } else if (id === "VeryHard") {
    minScale = 0.9;
    maxScale = 2.1;
} else if (id === "Special" || nearWinRequested) {
    minScale = coreBottleCount <= 12 ? 0.75 : 0.55;
    maxScale = coreBottleCount <= 12 ? 2.05 : 1.75;
  }
  const pressureBonus = Math.max(0, 8 - coreBottleCount);
  const min = Math.max(1, Math.floor(base * minScale) - pressureBonus);
  const max = Math.max(min + 2, Math.ceil(base * maxScale) + pressureBonus);
  const resolvedMin = id === "Special"
    ? (coreBottleCount != null && coreBottleCount <= 12 && nearWinRequested
      ? min
      : (coreBottleCount <= 7 && !nearWinRequested ? min : Math.max(min, Math.min(profile.minShortestStepCount, max - 2))))
    : Math.min(profile.minShortestStepCount, min);
  return {
    min: resolvedMin,
    max: Math.max(resolvedMin + 2, Math.min(profile.maxShortestStepCount, max)),
  };
}

function assertGenerationConstraint(condition, reason, details = {}) {
  if (condition) return;
  const payload = Object.entries(details)
    .filter(([, value]) => value != null)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
  throw new Error(`GenerationConstraintFailure: ${reason}${payload ? ` (${payload})` : ""}`);
}

function resolveAdaptiveGenerationParameters(config, selectedProfile, overrides) {
  const hasOverrides = Object.keys(overrides).length > 0;
  const resolvedConfig = cloneConfig(config);
  const resolvedProfile = cloneProfile(selectedProfile);
  const fixedByUser = [];
  const autoAdjusted = [];
  const diagnostics = {
    request: {
      difficulty: selectedProfile.name,
      overrides,
    },
    fixedByUser,
    autoAdjusted,
    resolved: {
      difficulty: selectedProfile.name,
      coreBottleCount: `${resolvedProfile.minTargetBottleCount}-${resolvedProfile.maxTargetBottleCount}`,
      totalPhysicalBottleCount: `${resolvedProfile.minTargetBottleCount + 2}-${resolvedProfile.maxTargetBottleCount + 3}`,
      bottleCapacity: (resolvedProfile.capacityWeights || []).filter(row => row.weight > 0).map(row => row.value),
      colorCount: (resolvedProfile.colorWeights || []).filter(row => row.weight > 0).map(row => row.value),
      normalHelperCount: `${Number(resolvedConfig.preferredMinEmptyBottleCount)}-${Number(resolvedConfig.preferredMaxEmptyBottleCount)}`,
      solutionTarget: `${resolvedProfile.minShortestStepCount}-${resolvedProfile.maxShortestStepCount}`,
      nearWin: Boolean(resolvedProfile.allowSpecialNearWin),
    },
  };

  if (!hasOverrides) return { config: resolvedConfig, profile: resolvedProfile, diagnostics };

  assertGenerationConstraint(
    overrides.totalPhysicalBottleCount == null,
    "totalPhysicalBottleCount is ambiguous while Ad bottles are generated as 2 or 3 optional bottles; use coreBottleCount instead",
    { requested: overrides.totalPhysicalBottleCount });

  const minCore = profileMinimumCoreBottles(resolvedProfile);
  const maxCore = Math.min(resolvedConfig.maxBottleCount - 3, resolvedConfig.layoutGridColumns * resolvedConfig.layoutGridRows - 3);
  if (overrides.coreBottleCount != null) {
    assertGenerationConstraint(
      overrides.coreBottleCount >= minCore && overrides.coreBottleCount <= maxCore,
      "requested coreBottleCount conflicts with current gameplay complexity or physical grid invariants",
      { requested: overrides.coreBottleCount, nearestFeasibleRange: `${minCore}-${maxCore}` });
    resolvedProfile.minTargetBottleCount = overrides.coreBottleCount;
    resolvedProfile.maxTargetBottleCount = overrides.coreBottleCount;
    fixedByUser.push("coreBottleCount");
  }

  if (overrides.bottleCapacity != null) {
    assertGenerationConstraint(
      overrides.bottleCapacity >= 2 && overrides.bottleCapacity <= 5,
      "requested bottleCapacity conflicts with normal bottle capacity invariant",
      { requested: overrides.bottleCapacity, nearestFeasibleRange: "2-5" });
    resolvedProfile.capacityWeights = exactWeight(overrides.bottleCapacity);
    fixedByUser.push("bottleCapacity");
  }

  const capacity = overrides.bottleCapacity
    ?? (resolvedProfile.capacityWeights || []).find(row => row.weight > 0)?.value
    ?? resolvedConfig.defaultBottleCapacity;
  const coreBottleCount = overrides.coreBottleCount;
const deriveOneHelperForSmallSpecial = coreBottleCount != null
    && resolvedProfile.profileId === "Special"
    && coreBottleCount <= 12
    && overrides.normalHelperCount == null;
  const helperCount = coreBottleCount != null
    ? deriveHelperCount(resolvedProfile, coreBottleCount, overrides.normalHelperCount)
    : overrides.normalHelperCount;
  const effectiveHelperCount = deriveOneHelperForSmallSpecial ? 1 : helperCount;
  let colorCount = overrides.colorCount;

  if (coreBottleCount != null && colorCount == null) {
    colorCount = Math.max(1, coreBottleCount - effectiveHelperCount);
    autoAdjusted.push("colorCount");
  }
  if (coreBottleCount != null && helperCount != null && overrides.colorCount != null) {
    assertGenerationConstraint(
      overrides.colorCount + helperCount === coreBottleCount,
      "requested coreBottleCount, colorCount, and normalHelperCount cannot all be satisfied",
      { coreBottleCount, colorCount: overrides.colorCount, normalHelperCount: helperCount });
  }
  if (coreBottleCount == null && colorCount != null) {
    const derivedHelper = helperCount ?? deriveHelperCount(resolvedProfile, Math.max(minCore, colorCount + 1), null);
    resolvedProfile.minTargetBottleCount = colorCount + derivedHelper;
    resolvedProfile.maxTargetBottleCount = Math.max(resolvedProfile.minTargetBottleCount, Math.min(resolvedProfile.maxTargetBottleCount, colorCount + Math.max(derivedHelper, resolvedConfig.preferredMaxEmptyBottleCount)));
    autoAdjusted.push("targetBottleCount");
  }
  if (helperCount != null && !deriveOneHelperForSmallSpecial) {
    assertGenerationConstraint(
      helperCount >= 0 && helperCount <= 6,
      "requested normalHelperCount conflicts with generator helper bounds",
      { requested: helperCount, nearestFeasibleRange: "0-6" });
    resolvedConfig.preferredMinEmptyBottleCount = helperCount;
    resolvedConfig.preferredMaxEmptyBottleCount = helperCount;
    if (overrides.normalHelperCount != null) {
      fixedByUser.push("normalHelperCount");
    } else {
      autoAdjusted.push("normalHelperCount");
    }
  } else if (deriveOneHelperForSmallSpecial) {
    resolvedConfig.preferredMinEmptyBottleCount = 0;
    resolvedConfig.preferredMaxEmptyBottleCount = 1;
    autoAdjusted.push("normalHelperCount");
  }
  if (colorCount != null) {
    const maxColorCount = Math.max(...moduleSizesForCapacity(capacity));
    assertGenerationConstraint(
      colorCount >= 1 && colorCount <= maxColorCount * Math.max(1, helperCount ?? resolvedConfig.preferredMaxEmptyBottleCount),
      "requested colorCount conflicts with available module capacity",
      { requested: colorCount, nearestFeasibleRange: `1-${maxColorCount * Math.max(1, helperCount ?? resolvedConfig.preferredMaxEmptyBottleCount)}` });
    resolvedProfile.colorWeights = exactWeight(colorCount);
    resolvedProfile.explicitColorCount = colorCount;
    if (overrides.colorCount != null) fixedByUser.push("colorCount");
  }

  if (coreBottleCount != null || overrides.normalHelperCount != null || overrides.colorCount != null) {
    resolvedProfile.allowMegaBottleMode = false;
    resolvedProfile.megaBottleChance = 0;
    resolvedProfile.allowSmallIntroLevel = coreBottleCount != null && coreBottleCount <= 3 && resolvedProfile.profileId === "Easy";
    autoAdjusted.push("activeBottleCount", "helperPressure", "fragmentation");
  }
if (resolvedProfile.profileId === "Special" && coreBottleCount != null && coreBottleCount <= 12) {
    resolvedProfile.adaptiveSmallSpecial = true;
    resolvedProfile.minSpecialDifficultyScore = Math.max(0.5, Math.min(0.65, resolvedProfile.targetDifficultyScoreMin ?? 0.5));
    resolvedProfile.maxNormalHelperCount = overrides.normalHelperCount != null ? overrides.normalHelperCount : 0;
    resolvedProfile.minNormalHelperCount = 0;
    resolvedProfile.minEmbeddedWorkspaceBottleCount = coreBottleCount >= 8 && overrides.normalHelperCount == null ? 2 : 1;
    resolvedProfile.maxSmallSpecialSafeMoveRatio = coreBottleCount >= 11 ? 0.75 : 0.5;
    resolvedProfile.minSmallSpecialBranchingFactor = coreBottleCount >= 11 ? 0.12 : 0.2;
    resolvedProfile.minSmallSpecialTrapLikelihood = coreBottleCount >= 11 ? 0.15 : 0.25;
    // Keep full-pack Special gates strict; relax only for explicit small-core overrides.
    resolvedProfile.maxSafeMoveRatio = resolvedProfile.maxSmallSpecialSafeMoveRatio;
    resolvedProfile.minDeadEndPotential = Math.min(Number(resolvedProfile.minDeadEndPotential || 0), 0.15);
    resolvedProfile.minTrapLikelihood = Math.min(
      Number(resolvedProfile.minTrapLikelihood || 0),
      Number(resolvedProfile.minSmallSpecialTrapLikelihood || 0.25));
    resolvedProfile.minPartialBottleCount = Math.min(
      Number(resolvedProfile.minPartialBottleCount || 0),
      Math.max(2, Number(resolvedProfile.minEmbeddedWorkspaceBottleCount || 1)));
    resolvedProfile.minAverageBranchingFactor = Number(resolvedProfile.minSmallSpecialBranchingFactor || 0.2);
    resolvedProfile.minCriticalDecisionCount = Math.min(Number(resolvedProfile.minCriticalDecisionCount || 0), 1);
    autoAdjusted.push("limitedWorkspace", "falseProgress", "trapDensity");
  }

  if (overrides.nearWin == null && resolvedProfile.profileId === "Special" && coreBottleCount != null && coreBottleCount <= 7) {
    resolvedProfile.allowSpecialNearWin = false;
    autoAdjusted.push("nearWin");
  }
  const nearWinRequested = overrides.nearWin === true || resolvedProfile.allowSpecialNearWin === true;
  if (overrides.nearWin === true) {
    resolvedProfile.allowSpecialNearWin = true;
    resolvedProfile.explicitNearWinRequested = true;
    fixedByUser.push("nearWin");
  } else if (overrides.nearWin === false) {
    resolvedProfile.allowSpecialNearWin = false;
    fixedByUser.push("nearWin");
  }
  if (resolvedProfile.allowSpecialNearWin) {
    resolvedProfile.allowHiddenStackMode = false;
    resolvedProfile.hiddenStackChance = 0;
    resolvedProfile.allowHybridHiddenStackMode = false;
    resolvedProfile.hybridHiddenStackChance = 0;
    resolvedProfile.allowLockedBottleMode = false;
    resolvedProfile.lockedBottleChance = 0;
    resolvedProfile.allowMegaBottleMode = false;
    resolvedProfile.megaBottleChance = 0;
    resolvedProfile.nearWin = {
      ...(resolvedProfile.nearWin || {}),
      minNearWinScore: resolvedProfile.adaptiveSmallSpecial ? 0.08 : (coreBottleCount != null && coreBottleCount <= 12 ? 0.25 : (resolvedProfile.nearWin?.minNearWinScore ?? 0.55)),
      minCriticalDepthRatio: resolvedProfile.adaptiveSmallSpecial ? 0.35 : (coreBottleCount != null && coreBottleCount <= 12 ? 0.15 : (resolvedProfile.nearWin?.minCriticalDepthRatio ?? 0.4)),
      maxCriticalDepthRatio: coreBottleCount != null && coreBottleCount <= 12 ? 0.99 : (resolvedProfile.nearWin?.maxCriticalDepthRatio ?? 0.85),
      maxTrapCandidates: Math.max(resolvedProfile.nearWin?.maxTrapCandidates ?? 24, coreBottleCount != null && coreBottleCount <= 12 ? 256 : 64),
      trapSolverMaxStates: Math.max(resolvedProfile.nearWin?.trapSolverMaxStates ?? 100000, 120000),
      trapSolverMaxDepth: Math.max(resolvedProfile.nearWin?.trapSolverMaxDepth ?? 140, 160),
      minSoftTrapRecoveryPenalty: coreBottleCount != null && coreBottleCount <= 12 ? 1 : (resolvedProfile.nearWin?.minSoftTrapRecoveryPenalty ?? 2),
      minSoftTrapRecoveryRatio: coreBottleCount != null && coreBottleCount <= 12 ? 1.02 : (resolvedProfile.nearWin?.minSoftTrapRecoveryRatio ?? 1.1),
    };
    autoAdjusted.push("trapTargetDepth", "nearWinThreshold", "solverSearchLimits");
  }

  if (coreBottleCount != null || colorCount != null || overrides.bottleCapacity != null) {
    const finalCore = coreBottleCount ?? resolvedProfile.minTargetBottleCount;
    const finalColors = colorCount ?? Math.max(1, finalCore - Math.max(0, helperCount ?? resolvedConfig.preferredMinEmptyBottleCount));
    const steps = adaptiveStepRange(resolvedProfile, finalCore, finalColors, capacity, nearWinRequested);
    resolvedProfile.minShortestStepCount = steps.min;
    resolvedProfile.maxShortestStepCount = steps.max;
    autoAdjusted.push("solutionDepth", "branchingTarget", "dependencyDepth");
  }

  if (coreBottleCount != null) {
    resolvedProfile.shapeWeights = exactShapeWeight("dense", Math.max(coreBottleCount, 1));
  }

  diagnostics.resolved = {
    difficulty: resolvedProfile.name,
    coreBottleCount: `${resolvedProfile.minTargetBottleCount}-${resolvedProfile.maxTargetBottleCount}`,
    totalPhysicalBottleCount: `${resolvedProfile.minTargetBottleCount + 2}-${resolvedProfile.maxTargetBottleCount + 3}`,
    bottleCapacity: (resolvedProfile.capacityWeights || []).filter(row => row.weight > 0).map(row => row.value),
    colorCount: (resolvedProfile.colorWeights || []).filter(row => row.weight > 0).map(row => row.value),
    normalHelperCount: `${Number(resolvedConfig.preferredMinEmptyBottleCount)}-${Number(resolvedConfig.preferredMaxEmptyBottleCount)}`,
    activeBottles: coreBottleCount ?? `${resolvedProfile.minTargetBottleCount}-${resolvedProfile.maxTargetBottleCount}`,
    targetFillRatio: Math.max(0, Math.min(1, ((colorCount ?? 0) * capacity) / Math.max(1, (coreBottleCount ?? resolvedProfile.maxTargetBottleCount) * capacity))),
    solutionTarget: `${resolvedProfile.minShortestStepCount}-${resolvedProfile.maxShortestStepCount}`,
    trapTargetDepth: resolvedProfile.allowSpecialNearWin ? resolvedProfile.nearWin?.minCriticalDepthRatio : null,
    nearWin: Boolean(resolvedProfile.allowSpecialNearWin),
  };
  diagnostics.fixedByUser = Array.from(new Set(fixedByUser));
  diagnostics.autoAdjusted = Array.from(new Set(autoAdjusted.filter(item => !diagnostics.fixedByUser.includes(item))));
  return { config: resolvedConfig, profile: resolvedProfile, diagnostics };
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

function capacityFor(config, band, random) {
  return Math.max(2, Math.min(5, weighted(random, band.capacityWeights, config.defaultBottleCapacity)));
}

function capacityOptionsFor(config, band, preferredCapacity) {
  const weightedCapacities = band.capacityWeights
    .filter(row => row.weight > 0)
    .map(row => Math.max(2, Math.min(5, row.value)));
  const capacities = [preferredCapacity, ...weightedCapacities, config.defaultBottleCapacity]
    .map(capacity => Math.max(2, Math.min(5, capacity)));
  return Array.from(new Set(capacities));
}

function chooseShapeForBottleCount(band, bottleCount, levelNumber) {
  const shapes = band.shapeWeights.length > 0
    ? band.shapeWeights
    : [{ value: "square", weight: 1, minBottleCount: 1, maxBottleCount: 64 }];
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
  const candidates = scored
    .filter(candidate => candidate.fitCost === bestFitCost);
  const denseCandidates = candidates.filter(candidate => isDenseShape(candidate.shape.value));
  if (bottleCount >= 9 && denseCandidates.length > 0) {
    const denseChance = Math.max(35, Math.min(100, Math.round((1 - (band.targetDifficultyScoreMin ?? 0.5)) * 100)));
    if (stableShapeTieBreak(`${band.name}:dense:${bottleCount}`, levelNumber) % 100 < denseChance) {
      return pickWeightedShape(denseCandidates, `${band.name}:dense:${bottleCount}`, levelNumber);
    }
  }

  return pickWeightedShape(candidates, `${band.name}:${bottleCount}`, levelNumber);
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

function applyDenseLayoutPreference(shape, band, bottleCount, levelNumber) {
  if (bottleCount < 9) return shape;

  const chance = Math.max(20, Math.min(60, Math.round((1 - (band.targetDifficultyScoreMin ?? 0.5)) * 70)));
  if (stableShapeTieBreak(`${band.name}:dense-layout-preference`, levelNumber) % 100 >= chance) {
    return shape;
  }

  const configuredDenseShapes = band.shapeWeights
    .filter(row => row.weight > 0 && isDenseShape(row.value) && bottleCount >= row.minBottleCount && bottleCount <= row.maxBottleCount)
    .map(row => row.value);
  const pool = configuredDenseShapes.length > 0
    ? configuredDenseShapes
    : ["dense", "compact_zigzag", "staggered", "honeycomb", "dense_columns"];
  return pool[stableShapeTieBreak(`${band.name}:dense-layout-pool:${bottleCount}`, levelNumber) % pool.length];
}

function applyAlternatingGapPreference(shape, band, bottleCount, levelNumber) {
  if (bottleCount < 9) return shape;

  const chance = Math.max(10, Math.min(35, Math.round((1 - (band.targetDifficultyScoreMin ?? 0.5)) * 40)));
  if (stableShapeTieBreak(`${band.name}:alternating-gap-preference`, levelNumber) % 100 >= chance) {
    return shape;
  }

  const configuredAlternatingShapes = band.shapeWeights
    .filter(row => row.weight > 0 && isAlternatingGapShape(row.value) && bottleCount >= row.minBottleCount && bottleCount <= row.maxBottleCount)
    .map(row => row.value);
  const pool = configuredAlternatingShapes.length > 0
    ? configuredAlternatingShapes
    : ["alternating_rows", "checkerboard"];
  return pool[stableShapeTieBreak(`${band.name}:alternating-gap-pool:${bottleCount}`, levelNumber) % pool.length];
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

function validateDifficultyProfiles(config) {
  if (!Array.isArray(config.profiles) || config.profiles.length === 0) {
    throw new Error("Water Sort generation requires at least one difficulty profile.");
  }
  const required = ["Easy", "Normal", "Hard", "VeryHard", "Special"];
  const ids = new Set();
  for (const profile of config.profiles) {
    const id = profile.profileId || normalizeProfileId(profile.name);
    if (!id) throw new Error(`Difficulty profile '${profile.name}' is missing a stable profile ID.`);
    if (ids.has(id)) throw new Error(`Duplicate difficulty profile ID: ${id}`);
    ids.add(id);
  }
  for (const id of required) {
    if (!ids.has(id)) throw new Error(`Water Sort generation config is missing difficulty profile '${id}'. Run the config migration before generation.`);
  }
  if (ids.size !== required.length) {
    throw new Error(`Water Sort generation config must contain exactly ${required.join(", ")} profiles.`);
  }
}

function shuffle(items, random) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function selectDifficultyProfile(config) {
  const requested = normalizeProfileName(requestedDifficultyProfile || config.selectedDifficultyProfile || "Hard");
  const requestedId = normalizeProfileId(requested);
  const profile = config.profiles.find(candidate =>
    candidate.profileId === requestedId ||
    normalizeProfileName(candidate.name).toLowerCase() === requested.toLowerCase());
  if (!profile) {
    throw new Error(`Unknown Water Sort difficulty profile '${requested}'. Available profiles: ${config.profiles.map(item => item.name).join(", ")}`);
  }
  if (profile.enabled === false) throw new Error(`Water Sort difficulty profile '${profile.name}' is disabled.`);
  return profile;
}

function buildModuleBoard(colorCount, capacity, colorOffset) {
  // 1-color modules are intentionally excluded from modular recipes: their only
  // unsolved layouts are trivial near-complete splits such as (capacity-1)+1.
  if (colorCount < 2) {
    throw new Error(`Unsupported module colorCount ${colorCount}; modular recipes require at least 2 colors`);
  }
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
  // Exclude size-1 modules: they produce trivial (capacity-1)+1 color splits.
  return capacity === 5 ? [2, 3, 4, 5, 6, 7, 8] : [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
}

/** True when any color totaling exactly `capacity` units is split across bottles as (capacity-1)+1. */
function hasTrivialNearCompleteColorSplit(board, capacity) {
  if (capacity < 2) return false;
  const perColorBottleCounts = new Map();
  for (const bottle of board) {
    const localCounts = new Map();
    for (const color of bottle) localCounts.set(color, (localCounts.get(color) || 0) + 1);
    for (const [color, count] of localCounts) {
      if (!perColorBottleCounts.has(color)) perColorBottleCounts.set(color, []);
      perColorBottleCounts.get(color).push(count);
    }
  }
  for (const counts of perColorBottleCounts.values()) {
    const total = counts.reduce((sum, value) => sum + value, 0);
    if (total !== capacity || counts.length !== 2) continue;
    const sorted = counts.slice().sort((a, b) => a - b);
    if (sorted[0] === 1 && sorted[1] === capacity - 1) return true;
  }
  return false;
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

function generationIntentFor(profile) {
  return {
    name: normalizeProfileName(profile.name),
    stepMin: profile.minShortestStepCount,
    stepMax: profile.maxShortestStepCount,
    bottleMin: profile.minTargetBottleCount,
    bottleMax: profile.maxTargetBottleCount,
    storedSolutionTarget: Math.max(1, Math.min(8, profile.storedSolutionTarget || 1)),
  };
}

function recipeStepCount(recipe, solvedModules) {
  return recipe.modules.reduce((sum, moduleColorCount) => {
    const solvedModule = solvedModules.get(`${recipe.capacity}:${moduleColorCount}`);
    return sum + (solvedModule?.solutions[0]?.length ?? recipe.estimatedSteps);
  }, 0);
}

function moduleCountBounds(config, band) {
  const minHelpers = Math.max(0, Number(band.minNormalHelperCount ?? config.preferredMinEmptyBottleCount ?? 0));
  const maxHelpers = Math.max(minHelpers, Number(band.maxNormalHelperCount ?? config.preferredMaxEmptyBottleCount ?? 1));
  // Modular recipes always start with at least one empty workspace bottle per module;
  // embedWorkspace then reduces empties down to maxHelpers.
  let maxModules = Math.max(1, maxHelpers, Number(config.preferredMaxEmptyBottleCount ?? 1));
  if ((band.minPartialBottleCount || 0) >= 2 && maxHelpers <= 1) {
    maxModules = Math.max(maxModules, 2);
  }
  const targetMax = Number(band.maxTargetBottleCount || 0);
  if (targetMax >= 16) maxModules = Math.max(maxModules, 3);
  if (targetMax >= 24) maxModules = Math.max(maxModules, 4);
  const minModules = Math.max(1, Math.min(Math.max(1, minHelpers || 1), maxModules));
  return { minModules, maxModules, minHelpers, maxHelpers };
}

function chooseRecipe(config, band, profile, capacity, maxModuleCount, solvedModules, random) {
  const desiredColorCount = weighted(random, band.colorWeights, 9);
  const minBottles = Math.min(profile.bottleMin, config.maxBottleCount);
  const maxBottles = Math.min(profile.bottleMax, config.maxBottleCount);
  const desiredBottleCount = randomInt(random, minBottles, maxBottles);
  const desiredStepCount = randomInt(random, profile.stepMin, profile.stepMax);
  const bounds = moduleCountBounds(config, band);
  const effectiveMaxModules = Math.max(1, maxModuleCount || bounds.maxModules);

  let candidates = recipesForCapacity(capacity, effectiveMaxModules, config.maxBottleCount)
    .map(recipe => ({ recipe, stepCount: recipeStepCount(recipe, solvedModules) }))
    .filter(candidate =>
      candidate.recipe.bottles >= minBottles &&
      candidate.recipe.bottles <= maxBottles &&
      (band.explicitColorCount == null || candidate.recipe.colors === band.explicitColorCount) &&
      candidate.recipe.modules.length >= bounds.minModules &&
      candidate.recipe.modules.length <= bounds.maxModules &&
      candidate.stepCount >= profile.stepMin &&
      candidate.stepCount <= profile.stepMax);

  if (candidates.length === 0) throw new Error(`No modular recipe fits band ${band.name}/${profile.name} capacity ${capacity}`);

  const preferFewerModules = band.profileId === "Hard" || band.profileId === "VeryHard" || band.profileId === "Special";
  const ranked = candidates
    .map(candidate => ({
      recipe: candidate.recipe,
      score:
        Math.abs(candidate.recipe.bottles - desiredBottleCount) * 2 +
        Math.abs(candidate.stepCount - desiredStepCount) +
        Math.abs(Math.min(candidate.recipe.colors, paletteSize) - desiredColorCount) * 1.5 +
        candidate.recipe.modules.length * (preferFewerModules ? 3.5 : 0.5) +
        random() * 0.01,
    }))
    .sort((left, right) => left.score - right.score);
  const pickIndex = Math.min(ranked.length - 1, Math.floor(random() * Math.min(ranked.length, 8)));
  const picked = ranked[pickIndex].recipe;
  return { recipe: picked, desiredDistinctColors: desiredColorCount };
}

function createColorMapper(levelNumber) {
  const random = rng(seedFor(levelNumber, 0xC0102, 1597334677));
  const palette = shuffle(Array.from({ length: paletteSize }, (_, i) => i), random);
  return color => palette[color % paletteSize];
}

function buildComposedLevel(recipe, solvedModules, levelNumber, storedSolutionTarget, attempt = 0) {
  const composeKey = levelNumber + Math.imul(attempt + 1, 2654435761);
  const random = rng(seedFor(composeKey, 0xB0771E, 3812015801));
  const board = [];
  const moduleMoveSets = [];
  let bottleOffset = 0;
  let colorOffset = 0;

  for (const moduleColorCount of recipe.modules) {
    const solvedModule = solvedModules.get(`${recipe.capacity}:${moduleColorCount}`);
    for (const bottle of solvedModule.board) {
      board.push(bottle.map(color => color + colorOffset));
    }
    const localMoves = solvedModule.solutions[((composeKey + generatorSeed) >>> 0) % solvedModule.solutions.length];
    const globalMoves = [];
    for (const move of localMoves) {
      globalMoves.push({
        fromBottle: move.fromBottle + bottleOffset,
        toBottle: move.toBottle + bottleOffset,
      });
    }
    moduleMoveSets.push(globalMoves);
    bottleOffset += solvedModule.board.length;
    colorOffset += solvedModule.colorCount;
  }

  const orders = [];
  const baseOrder = Array.from({ length: moduleMoveSets.length }, (_, i) => i);
  orders.push(baseOrder);
  orders.push(baseOrder.slice().reverse());
  orders.push(shuffle(baseOrder, rng(seedFor(composeKey, 0x501A710A, 1103515245))));
  const solutionMoveLists = [];
  for (const order of orders) {
    const moves = order.flatMap(moduleIndex => moduleMoveSets[moduleIndex]);
    const signature = moves.map(move => `${move.fromBottle}>${move.toBottle}`).join(",");
    if (!solutionMoveLists.some(existing => existing.map(move => `${move.fromBottle}>${move.toBottle}`).join(",") === signature)) {
      solutionMoveLists.push(moves);
    }
    if (solutionMoveLists.length >= storedSolutionTarget) break;
  }

  const mapColor = createColorMapper(levelNumber);
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

function shouldBuildSmallIntroLevel(band) {
  return band.allowSmallIntroLevel === true
    && band.minTargetBottleCount <= 3
    && band.maxTargetBottleCount <= 4
    && band.minShortestStepCount <= 1
    && band.maxShortestStepCount <= 5;
}

function buildSmallIntroLevel(config, band, levelNumber, random, attempt = 0) {
  const capacity = capacityFor(config, band, random);
  const mapColor = createColorMapper(levelNumber + Math.imul(attempt + 1, 9749));
  const allowThree = band.maxTargetBottleCount >= 3;
  const allowFour = band.maxTargetBottleCount >= 4;
  const variantPool = [];

  // 1-color patterns (canonical-distinct; moves are 1-based)
  variantPool.push({
    board: [Array(capacity - 1).fill(0), [0], ...(allowThree ? [[]] : [])],
    moves: [[{ fromBottle: 2, toBottle: 1 }]],
  });
  if (allowThree) {
    variantPool.push({
      board: [Array(capacity - 2).fill(0), [0], [0]],
      moves: [[{ fromBottle: 2, toBottle: 1 }, { fromBottle: 3, toBottle: 1 }]],
    });
    variantPool.push({
      board: [Array(Math.floor(capacity / 2)).fill(0), Array(capacity - Math.floor(capacity / 2)).fill(0), []],
      moves: [[{ fromBottle: 2, toBottle: 1 }]],
    });
    variantPool.push({
      board: [[0], Array(capacity - 1).fill(0), []],
      moves: [[{ fromBottle: 1, toBottle: 2 }]],
    });
  }
  if (allowFour && capacity >= 4) {
    variantPool.push({
      board: [[0], [0], [0], [0]],
      moves: [[
        { fromBottle: 2, toBottle: 1 },
        { fromBottle: 3, toBottle: 1 },
        { fromBottle: 4, toBottle: 1 },
      ]],
    });
    variantPool.push({
      board: [Array(capacity - 2).fill(0), [0], [0], []],
      moves: [[
        { fromBottle: 2, toBottle: 1 },
        { fromBottle: 3, toBottle: 1 },
      ]],
    });
  }

  // 2-color classic swap (proven replay)
  variantPool.push({
    board: [
      Array(capacity - 1).fill(0).concat(1),
      Array(capacity - 1).fill(1).concat(0),
      [],
    ],
    moves: [[
      { fromBottle: 1, toBottle: 3 },
      { fromBottle: 2, toBottle: 1 },
      { fromBottle: 3, toBottle: 2 },
    ]],
  });

  // 2-color double-top (one contiguous pour per color)
  if (capacity >= 4) {
    variantPool.push({
      board: [
        Array(capacity - 2).fill(0).concat([1, 1]),
        Array(capacity - 2).fill(1).concat([0, 0]),
        [],
      ],
      moves: [[
        { fromBottle: 1, toBottle: 3 },
        { fromBottle: 2, toBottle: 1 },
        { fromBottle: 3, toBottle: 2 },
      ]],
    });
    variantPool.push({
      board: [
        [0, 0, 1, 1],
        [1, 1, 0, 0],
        [],
      ],
      moves: [[
        { fromBottle: 1, toBottle: 3 },
        { fromBottle: 2, toBottle: 1 },
        { fromBottle: 3, toBottle: 2 },
      ]],
    });
  }

  // 2-color mixed top into nearly-full same-color bottle
  variantPool.push({
    board: [
      [0, 1],
      Array(capacity - 1).fill(0),
      Array(capacity - 1).fill(1),
    ],
    moves: [[
      { fromBottle: 1, toBottle: 3 },
      { fromBottle: 1, toBottle: 2 },
    ]],
  });
  variantPool.push({
    board: [
      [1, 0],
      Array(capacity - 1).fill(0),
      Array(capacity - 1).fill(1),
    ],
    moves: [[
      { fromBottle: 1, toBottle: 2 },
      { fromBottle: 1, toBottle: 3 },
    ]],
  });
  if (allowThree && capacity >= 4) {
    variantPool.push({
      board: [
        [0, 0, 1],
        [1, 1, 0],
        [0, 1],
      ],
      moves: [[
        { fromBottle: 1, toBottle: 3 },
        { fromBottle: 2, toBottle: 1 },
        { fromBottle: 3, toBottle: 2 },
        { fromBottle: 1, toBottle: 3 },
      ]],
    });
    variantPool.push({
      board: [
        [0, 1, 1],
        [1, 0, 0],
        [0, 1],
      ],
      moves: [[
        { fromBottle: 3, toBottle: 1 },
        { fromBottle: 2, toBottle: 3 },
        { fromBottle: 1, toBottle: 2 },
        { fromBottle: 3, toBottle: 1 },
      ]],
    });
  }
  if (allowFour && capacity >= 4) {
    variantPool.push({
      board: [
        [0, 0],
        [0, 0],
        [1, 1],
        [1, 1],
      ],
      moves: [[
        { fromBottle: 2, toBottle: 1 },
        { fromBottle: 4, toBottle: 3 },
      ]],
    });
  }

  const picked = variantPool[Math.floor(random() * variantPool.length)];
  return {
    capacity,
    board: picked.board.map(bottle => bottle.map(mapColor)),
    solutionMoveLists: picked.moves,
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

function shouldBuildMegaLevel(band, random) {
  if (!band.allowMegaBottleMode || random() >= band.megaBottleChance) return false;
  const minMegaSteps = 11;
  const maxMegaSteps = 36;
  return band.maxShortestStepCount >= minMegaSteps
    && band.minShortestStepCount <= maxMegaSteps;
}

function buildMegaLevel(config, band, levelNumber, random, attempt = 0) {
  const megaSeed = (generatorSeed ^ Math.imul(attempt + 1, 3266489917)) >>> 0;
  return buildMegaLevelV2(config, band, levelNumber, megaSeed, paletteSize);
}

function buildLegacyMegaLevel(config, band, levelNumber, random) {
  const defaultCapacity = capacityFor(config, band, random);
  const minConfiguredCapacity = Math.max(12, Math.min(20, band.minMegaBottleCapacity));
  const maxConfiguredCapacity = Math.max(minConfiguredCapacity, Math.min(20, band.maxMegaBottleCapacity));
  const minMegaCapacityBySteps = Math.max(minConfiguredCapacity, Math.min(maxConfiguredCapacity, Math.ceil(band.minShortestStepCount / 2) + 1));
  const maxMegaCapacityBySteps = Math.max(minMegaCapacityBySteps, Math.min(maxConfiguredCapacity, band.maxShortestStepCount + 1));
  const megaCapacity = randomInt(random, minMegaCapacityBySteps, maxMegaCapacityBySteps);
  const targetColor = createColorMapper(levelNumber)(0);
  const board = [[targetColor]];
  const solutionMoveLists = [[]];
  const neededTargetLayers = megaCapacity - 1;
  const maxTargetGroupSize = Math.max(1, defaultCapacity - 1);
  const minSourceCountByCapacity = Math.ceil(neededTargetLayers / Math.min(3, maxTargetGroupSize));
  const minSourceCountByStep = Math.ceil(band.minShortestStepCount / 2);
  const maxSourceCountByStep = Math.floor(band.maxShortestStepCount / 2);
  const sourceCountMin = Math.max(4, minSourceCountByCapacity, minSourceCountByStep);
  const sourceCountMax = Math.min(neededTargetLayers, maxSourceCountByStep, 14);
  const sourceCountOptions = [];
  for (let count = sourceCountMin; count <= sourceCountMax; count++) {
    const helperCount = count;
    if (1 + count + helperCount + 3 <= config.maxBottleCount) {
      sourceCountOptions.push(count);
    }
  }
  if (sourceCountOptions.length === 0) {
    throw new Error(`No mega source count fits band ${band.name}: needed=${neededTargetLayers}, cap=${defaultCapacity}`);
  }

  const sourceCount = sourceCountOptions[randomInt(random, 0, sourceCountOptions.length - 1)];
  const helperCount = sourceCount;
  const targetGroups = distributeTargetGroups(neededTargetLayers, sourceCount, Math.min(3, maxTargetGroupSize), random);
  const blockerDepths = buildMegaBlockerDepths(sourceCount, defaultCapacity, targetGroups, random);

  for (let i = 0; i < sourceCount; i++) {
    const targetGroupSize = targetGroups[i];
    const source = [];
    const blockerDepth = blockerDepths[i];
    const fillerCount = Math.max(0, defaultCapacity - targetGroupSize - blockerDepth);
    for (let layer = 0; layer < fillerCount; layer++) {
      source.push(nonTargetColor(targetColor, levelNumber + i * 5 + layer + 3));
    }
    for (let layer = 0; layer < targetGroupSize; layer++) {
      source.push(targetColor);
    }
    const helperBucket = i;
    const blockerColor = nonTargetColor(targetColor, helperBucket + 1);
    for (let layer = 0; layer < blockerDepth; layer++) {
      source.push(blockerColor);
    }
    board.push(source);
  }

  const firstHelperIndex = board.length;
  for (let i = 0; i < helperCount; i++) {
    board.push([]);
  }

  const scriptedMoves = buildMegaScriptedSolution(board, defaultCapacity, firstHelperIndex, helperCount, targetColor);
  solutionMoveLists[0].push(...scriptedMoves);

  return {
    capacity: defaultCapacity,
    board,
    solutionMoveLists,
    megaBottleIndex: 0,
    megaCapacity,
    megaTargetColor: targetColor,
  };
}

function buildMegaBlockerDepths(sourceCount, defaultCapacity, targetGroups, random) {
  const depths = [];
  for (let i = 0; i < sourceCount; i++) {
    const maxDepth = Math.max(1, defaultCapacity - targetGroups[i]);
    let depth = randomInt(random, 1, maxDepth);
    if (i % 3 === 0 && maxDepth >= 2) depth = Math.max(depth, 2);
    depths.push(depth);
  }

  if (depths.filter(depth => depth > 0).length < Math.ceil(sourceCount * 0.75)) {
    for (let i = 0; i < depths.length; i++) {
      if (depths[i] === 0 && defaultCapacity - targetGroups[i] > 0) {
        depths[i] = 1;
      }
      if (depths.filter(depth => depth > 0).length >= Math.ceil(sourceCount * 0.75)) break;
    }
  }

  return depths;
}

function buildMegaScriptedSolution(initialBoard, defaultCapacity, firstHelperIndex, helperCount, targetColor) {
  const state = initialBoard.map(bottle => bottle.slice());
  const capacities = state.map((_, index) => index === 0 ? 99 : defaultCapacity);
  const moves = [];
  for (let sourceIndex = 1; sourceIndex < firstHelperIndex; sourceIndex++) {
    while (state[sourceIndex].length > 0 && state[sourceIndex][state[sourceIndex].length - 1] !== targetColor) {
      const blockerColor = state[sourceIndex][state[sourceIndex].length - 1];
      const helperIndex = findMegaHelperForBlocker(state, capacities, firstHelperIndex, helperCount, blockerColor);
      applyConstructedPour(state, capacities, sourceIndex, helperIndex);
      moves.push({ fromBottle: sourceIndex + 1, toBottle: helperIndex + 1 });
    }

    if (state[sourceIndex].length > 0 && state[sourceIndex][state[sourceIndex].length - 1] === targetColor) {
      applyConstructedPour(state, capacities, sourceIndex, 0);
      moves.push({ fromBottle: sourceIndex + 1, toBottle: 1 });
    }
  }

  return moves;
}

function findMegaHelperForBlocker(state, capacities, firstHelperIndex, helperCount, blockerColor) {
  for (let i = firstHelperIndex; i < firstHelperIndex + helperCount; i++) {
    const helper = state[i];
    if (helper.length > 0 && helper.length < capacities[i] && helper[helper.length - 1] === blockerColor) {
      return i;
    }
  }

  for (let i = firstHelperIndex; i < firstHelperIndex + helperCount; i++) {
    if (state[i].length === 0) {
      return i;
    }
  }

  throw new Error("Mega level needs more normal helper capacity for blocker colors.");
}

function applyConstructedPour(state, capacities, from, to) {
  const source = state[from];
  const target = state[to];
  if (!source || !target || source.length === 0 || target.length >= capacities[to]) {
    throw new Error("Invalid constructed mega pour.");
  }

  const color = source[source.length - 1];
  if (target.length > 0 && target[target.length - 1] !== color) {
    throw new Error("Invalid constructed mega pour target color.");
  }

  let amount = 0;
  for (let i = source.length - 1; i >= 0 && source[i] === color; i--) amount++;
  amount = Math.min(amount, capacities[to] - target.length);
  for (let i = 0; i < amount; i++) {
    target.push(source.pop());
  }
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

function assignGridPositions(board, shape, config) {
  const columns = Math.max(1, config.layoutGridColumns);
  const rows = Math.max(1, config.layoutGridRows);
  const cells = shapeCells(shape, columns, rows);
  if (cells.length < board.length) throw new Error(`Shape ${shape} has only ${cells.length} cells for ${board.length} bottles`);
  return cells.slice(0, board.length).map(cell => ({ x: cell.x, y: cell.y }));
}

function assignAestheticGridPositions(board, shape, config, options = {}) {
  const columns = Math.max(1, config.layoutGridColumns);
  const rows = Math.max(1, config.layoutGridRows);
  const roles = board.map((bottle, index) => {
    if (index >= options.firstAdBottleIndex) return "ad";
    if (index === options.megaBottleIndex) return "mega";
    if (bottle.length === 0) return "helper";
    return "active";
  });
  const candidates = buildLayoutCandidates(board.length, roles, columns, rows, shape, options.levelNumber || 0);
  const valid = candidates
    .filter(candidate => validateGridPositions(candidate.positions, columns, rows))
    .map(candidate => ({ ...candidate, metrics: evaluateLayoutMetrics(candidate.positions, roles, columns, rows) }))
    .filter(candidate => candidate.metrics.connectedGroupCount <= 1
      && candidate.metrics.isolatedBottleCount === 0
      && candidate.metrics.emptyRowGapCount === 0
      && candidate.metrics.roleSeparationPenalty <= 0.5);
  const pool = valid.length > 0
    ? valid
    : candidates
      .filter(candidate => validateGridPositions(candidate.positions, columns, rows))
      .map(candidate => ({ ...candidate, metrics: evaluateLayoutMetrics(candidate.positions, roles, columns, rows) }));
  if (pool.length === 0) throw new Error(`No valid layout positions for ${board.length} bottles`);
  pool.sort((left, right) => right.metrics.layoutScore - left.metrics.layoutScore || left.tieBreak - right.tieBreak);
  return pool[0];
}

function buildLayoutCandidates(bottleCount, roles, columns, rows, shape, levelNumber) {
  const coreCount = roles.filter(role => role !== "ad").length;
  const adCount = bottleCount - coreCount;
  const candidates = [];
  const rowCountMin = Math.max(1, Math.ceil(coreCount / columns));
  const rowCountMax = Math.min(rows, Math.max(rowCountMin, Math.ceil(coreCount / Math.max(1, Math.min(columns, 5))) + 1));
  for (let rowCount = rowCountMin; rowCount <= rowCountMax; rowCount++) {
    for (const rowCounts of balancedRowDistributions(coreCount, rowCount, columns)) {
      for (const yOffset of [-1, 0, 1]) {
        const corePositions = positionsForRowCounts(rowCounts, columns, rows, yOffset);
        if (corePositions.length !== coreCount) continue;
        for (const adSide of ["right", "left", "bottom"]) {
          const positions = composeRolePositions(corePositions, adCount, roles, columns, rows, adSide);
          if (positions.length === bottleCount) {
            candidates.push({
              positions,
              tieBreak: stableShapeTieBreak(`${shape}:layout:${levelNumber}:${rowCounts.join("-")}:${yOffset}:${adSide}`, levelNumber),
            });
          }
        }
      }
    }
  }

  const fallback = assignGridPositions(Array.from({ length: bottleCount }, () => []), shape, { layoutGridColumns: columns, layoutGridRows: rows });
  candidates.push({ positions: fallback, tieBreak: stableShapeTieBreak(`${shape}:legacy-layout:${levelNumber}`, levelNumber) });
  return candidates;
}

function balancedRowDistributions(count, rowCount, columns) {
  const base = Math.floor(count / rowCount);
  const extra = count % rowCount;
  if (base <= 0 || base > columns) return [];
  const distributions = [];
  const widestFirst = Array.from({ length: rowCount }, (_, index) => base + (index < extra ? 1 : 0));
  const widestCentered = Array(rowCount).fill(base);
  for (const index of centerOutIndexes(rowCount, (rowCount - 1) / 2).slice(0, extra)) widestCentered[index]++;
  for (const rowCounts of [widestCentered, widestFirst, widestFirst.slice().reverse()]) {
    if (Math.max(...rowCounts) <= columns && Math.max(...rowCounts) - Math.min(...rowCounts) <= 2) {
      const key = rowCounts.join(",");
      if (!distributions.some(existing => existing.join(",") === key)) distributions.push(rowCounts);
    }
  }
  const minWidth = Math.max(1, base - 2);
  const maxWidth = Math.min(columns, base + 2);
  const walk = current => {
    if (current.length === rowCount) {
      if (current.reduce((sum, value) => sum + value, 0) !== count) return;
      if (Math.max(...current) - Math.min(...current) > 2) return;
      const centeredOrder = centerOutIndexes(rowCount, (rowCount - 1) / 2);
      const rowCounts = Array(rowCount);
      for (let i = 0; i < rowCount; i++) rowCounts[centeredOrder[i]] = current[i];
      const variants = [rowCounts, rowCounts.slice().reverse()];
      for (const variant of variants) {
        const key = variant.join(",");
        if (!distributions.some(existing => existing.join(",") === key)) distributions.push(variant);
      }
      return;
    }
    const remainingSlots = rowCount - current.length - 1;
    const currentSum = current.reduce((sum, value) => sum + value, 0);
    for (let width = maxWidth; width >= minWidth; width--) {
      const remaining = count - currentSum - width;
      if (remaining < remainingSlots * minWidth || remaining > remainingSlots * maxWidth) continue;
      walk(current.concat(width));
    }
  };
  walk([]);
  return distributions;
}

function positionsForRowCounts(rowCounts, columns, rows, yOffset) {
  const startY = Math.floor((rows - rowCounts.length) / 2) + yOffset;
  if (startY < 0 || startY + rowCounts.length > rows) return [];
  const positions = [];
  for (let row = 0; row < rowCounts.length; row++) {
    for (const x of centeredColumns(columns, rowCounts[row])) {
      positions.push({ x, y: startY + row });
    }
  }
  return positions;
}

function composeRolePositions(corePositions, adCount, roles, columns, rows, adSide) {
  const occupied = new Set(corePositions.map(position => `${position.x},${position.y}`));
  const adPositions = chooseAdPositions(corePositions, adCount, columns, rows, adSide, occupied);
  if (adPositions.length !== adCount) return [];
  const output = [];
  let coreCursor = 0;
  let adCursor = 0;
  for (const role of roles) {
    if (role === "ad") {
      output.push(adPositions[adCursor++]);
    } else {
      output.push(corePositions[coreCursor++]);
    }
  }
  placeRoleNearCenter(output, roles, "mega", columns, rows);
  return output;
}

function placeRoleNearCenter(positions, roles, role, columns, rows) {
  const roleIndex = roles.indexOf(role);
  if (roleIndex < 0) return;
  const cx = (columns - 1) / 2;
  const cy = (rows - 1) / 2;
  let bestIndex = roleIndex;
  let bestDistance = Infinity;
  for (let i = 0; i < positions.length; i++) {
    if (roles[i] === "ad") continue;
    const distance = Math.hypot(positions[i].x - cx, positions[i].y - cy);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  if (bestIndex !== roleIndex) {
    const previous = positions[roleIndex];
    positions[roleIndex] = positions[bestIndex];
    positions[bestIndex] = previous;
  }
}

function chooseAdPositions(corePositions, adCount, columns, rows, side, occupied) {
  if (adCount <= 0) return [];
  const ys = Array.from(new Set(corePositions.map(position => position.y))).sort((a, b) =>
    Math.abs(a - (rows - 1) / 2) - Math.abs(b - (rows - 1) / 2) || a - b);
  const candidates = [];
  const rowBounds = new Map();
  for (const y of ys) {
    const xs = corePositions.filter(position => position.y === y).map(position => position.x);
    rowBounds.set(y, { min: Math.min(...xs), max: Math.max(...xs) });
  }
  for (const y of ys) {
    const bounds = rowBounds.get(y);
    const right = Array.from({ length: adCount }, (_, index) => ({ x: bounds.max + 1 + index, y }));
    const left = Array.from({ length: adCount }, (_, index) => ({ x: bounds.min - adCount + index, y }));
    candidates.push(side === "left" ? left : right);
    candidates.push(side === "right" ? left : right);
  }
  if (side === "bottom") {
    const bottomY = Math.min(rows - 1, Math.max(...ys) + 1);
    candidates.unshift(centeredColumns(columns, adCount).map(x => ({ x, y: bottomY })));
  }
  candidates.push(...allGridCells(columns, rows)
    .filter(cell => !occupied.has(`${cell.x},${cell.y}`))
    .map(cell => [cell]));

  for (const candidate of candidates) {
    if (candidate.length !== adCount) continue;
    if (candidate.every(position =>
      position.x >= 0 && position.x < columns &&
      position.y >= 0 && position.y < rows &&
      !occupied.has(`${position.x},${position.y}`))) {
      return candidate;
    }
  }
  return [];
}

function validateGridPositions(positions, columns, rows) {
  const seen = new Set();
  for (const position of positions) {
    if (position.x < 0 || position.x >= columns || position.y < 0 || position.y >= rows) return false;
    const key = `${position.x},${position.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

function evaluateLayoutMetrics(positions, roles, columns, rows) {
  const core = positions.filter((_, index) => roles[index] !== "ad");
  const ads = positions.filter((_, index) => roles[index] === "ad");
  const rowMap = new Map();
  for (const position of core) {
    const xs = rowMap.get(position.y) || [];
    xs.push(position.x);
    rowMap.set(position.y, xs);
  }
  const occupiedRows = Array.from(rowMap.keys()).sort((a, b) => a - b);
  let emptyRowGapCount = 0;
  for (let i = 1; i < occupiedRows.length; i++) emptyRowGapCount += Math.max(0, occupiedRows[i] - occupiedRows[i - 1] - 1);
  let internalHorizontalGapCount = 0;
  let centerOffset = 0;
  const rowCounts = [];
  for (const y of occupiedRows) {
    const xs = rowMap.get(y).sort((a, b) => a - b);
    rowCounts.push(xs.length);
    internalHorizontalGapCount += xs[xs.length - 1] - xs[0] + 1 - xs.length;
    centerOffset += Math.abs((xs[0] + xs[xs.length - 1]) / 2 - (columns - 1) / 2);
  }
  centerOffset = occupiedRows.length === 0 ? 0 : centerOffset / occupiedRows.length;
  let rowImbalance = 0;
  for (let i = 1; i < rowCounts.length; i++) rowImbalance = Math.max(rowImbalance, Math.abs(rowCounts[i] - rowCounts[i - 1]));
  const connectedGroupCount = countConnectedGroups(core);
  const isolatedBottleCount = countIsolatedPositions(core);
  const adConnectedGroupCount = countConnectedGroups(ads);
  const adSpread = ads.length <= 1 ? 0 : boundingArea(ads) - ads.length;
  const leftMass = core.filter(position => position.x < (columns - 1) / 2).length;
  const rightMass = core.filter(position => position.x > (columns - 1) / 2).length;
  const leftRightBalance = Math.abs(leftMass - rightMass) / Math.max(1, core.length);
  const compactnessScore = core.length === 0 ? 1 : core.length / Math.max(1, boundingArea(core));
  const rowBalanceScore = Math.max(0, 1 - rowImbalance / Math.max(1, columns));
  const roleSeparationPenalty = Math.max(0, adConnectedGroupCount - 1) * 2 + adSpread * 0.2;
  const layoutScore =
    compactnessScore * 35 +
    rowBalanceScore * 20 +
    Math.max(0, 1 - centerOffset / Math.max(1, columns / 2)) * 18 +
    Math.max(0, 1 - leftRightBalance) * 12 -
    connectedGroupCount * 8 -
    isolatedBottleCount * 20 -
    emptyRowGapCount * 18 -
    internalHorizontalGapCount * 12 -
    Math.max(0, rowImbalance - 2) * 10 -
    roleSeparationPenalty;
  return {
    layoutRows: occupiedRows.map(y => ({ y, count: rowMap.get(y).length })),
    connectedGroupCount,
    connectedGroups: connectedGroupCount,
    isolatedBottleCount,
    isolatedBottles: isolatedBottleCount,
    emptyRowGapCount,
    internalHorizontalGapCount,
    internalGaps: internalHorizontalGapCount,
    rowBalanceScore,
    centerOffset,
    compactnessScore,
    leftRightBalance,
    roleSeparationPenalty,
    layoutScore,
  };
}

function countConnectedGroups(positions) {
  if (positions.length === 0) return 0;
  const remaining = new Set(positions.map(position => `${position.x},${position.y}`));
  let groups = 0;
  while (remaining.size > 0) {
    groups++;
    const [start] = remaining;
    const stack = [start];
    remaining.delete(start);
    while (stack.length > 0) {
      const [x, y] = stack.pop().split(",").map(Number);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const key = `${nx},${ny}`;
        if (remaining.delete(key)) stack.push(key);
      }
    }
  }
  return groups;
}

function countIsolatedPositions(positions) {
  const set = new Set(positions.map(position => `${position.x},${position.y}`));
  return positions.filter(position =>
    !set.has(`${position.x + 1},${position.y}`) &&
    !set.has(`${position.x - 1},${position.y}`) &&
    !set.has(`${position.x},${position.y + 1}`) &&
    !set.has(`${position.x},${position.y - 1}`)).length;
}

function boundingArea(positions) {
  if (positions.length === 0) return 0;
  const xs = positions.map(position => position.x);
  const ys = positions.map(position => position.y);
  return (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1);
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
  return replayMegaSolutionExact({
    board,
    capacities,
    megaBottleIndex,
    megaCapacity: capacities[megaBottleIndex],
    targetColor: megaTargetColor,
  }, moves).success;
}

function assertBoardWithinCapacity(board, capacity, levelNumber, megaLevel = null) {
  for (let i = 0; i < board.length; i++) {
    const bottleCapacity = megaLevel != null && i === megaLevel.megaBottleIndex ? megaLevel.megaCapacity : capacity;
    if (board[i].length > bottleCapacity) {
      throw new Error(`Bottle ${i + 1} exceeds capacity ${bottleCapacity} at level ${levelNumber}`);
    }
  }
}

function evaluateNormalDifficulty(board, capacity, moves, solverVisitedStates = 0) {
  const state = makeInitialHiddenState(board);
  const openingMoves = enumerateMoves(state, capacity, { skipCompletedSource: true, skipSymmetricEmptyMoves: true }, null);
  let fragmentedBlocks = 0;
  let buriedDepth = 0;
  let mixedBottleCount = 0;
  let occupied = 0;
  let free = 0;
  const colorBottles = new Map();
  for (let bottleIndex = 0; bottleIndex < board.length; bottleIndex++) {
    const bottle = board[bottleIndex];
    occupied += bottle.length;
    free += capacity - bottle.length;
    let previous = -1;
    const colorsInBottle = new Set();
    for (let layer = 0; layer < bottle.length; layer++) {
      const color = bottle[layer];
      colorsInBottle.add(color);
      if (color !== previous) fragmentedBlocks++;
      previous = color;
      const blockersAbove = bottle.slice(layer + 1).filter(value => value !== color).length;
      buriedDepth += blockersAbove;
    }
    if (colorsInBottle.size > 1) mixedBottleCount++;
    for (const color of colorsInBottle) {
      const indexes = colorBottles.get(color) || new Set();
      indexes.add(bottleIndex);
      colorBottles.set(color, indexes);
    }
  }
  const colorCount = colorBottles.size;
  const fragmentation = colorCount === 0 ? 0 : Math.max(0, fragmentedBlocks - colorCount) / Math.max(1, occupied);
  const crossBottleDependency = colorCount === 0 ? 0 : Array.from(colorBottles.values()).reduce((sum, set) => sum + Math.max(0, set.size - 1), 0) / colorCount;
  const helperPressure = occupied === 0 ? 0 : 1 - Math.min(1, free / Math.max(1, capacity * 3));
  const fillDensity = occupied / Math.max(1, board.length * capacity);
  const rehandling = countRehandledSources(moves) / Math.max(1, moves.length);
  const branchingFactor = openingMoves.length / Math.max(1, board.length);
  const forcedMoveRatio = openingMoves.length <= 1 ? 1 : 1 / openingMoves.length;
  const dynamic = analyzeDynamicMoveSafety(board, capacity, moves);
  const safeMoveRatio = dynamic.safeMoveRatio;
  const deadEndPotential = dynamic.deadEndPotential;
  const criticalDecisionCount = dynamic.criticalDecisionCount + Math.max(0, mixedBottleCount - 1);
  const falseProgressScore = Math.max(0, Math.min(1,
    dynamic.falseProgressRatio * 0.55 +
    branchingFactor * (1 - safeMoveRatio) * 0.25 +
    fragmentation * 0.12 +
    rehandling * 0.08));
  const trapLikelihood = Math.max(0, Math.min(1,
    deadEndPotential * 0.35 +
    falseProgressScore * 0.3 +
    helperPressure * 0.2 +
    Math.min(1, criticalDecisionCount / 8) * 0.15));
  const normalHelperCount = countNormalEmptyHelpers(board);
  const embeddedWorkspaceBottleCount = countEmbeddedWorkspaceBottles(board, capacity);
  const coreBottleCountExcludingAds = board.length;
  const recoveryPenalty = Math.max(0, Math.round((deadEndPotential * 0.6 + trapLikelihood * 0.4) * Math.max(1, moves.length) * 0.25));
  const normalizedSteps = moves.length / 100;
  const difficultyScore = Math.max(0, Math.min(1,
    normalizedSteps * 0.16 +
    (1 - safeMoveRatio) * 0.14 +
    deadEndPotential * 0.14 +
    trapLikelihood * 0.1 +
    fragmentation * 0.1 +
    branchingFactor * 0.08 +
    Math.min(1, buriedDepth / Math.max(1, occupied * capacity)) * 0.08 +
    helperPressure * 0.08 +
    fillDensity * 0.05 +
    Math.min(1, crossBottleDependency / 4) * 0.04 +
    rehandling * 0.03));
  return {
    difficultyScore,
    solutionSteps: moves.length,
    legalOpeningMoves: openingMoves.length,
    branchingFactor,
    safeMoveRatio,
    criticalDecisionCount,
    falseProgressScore,
    trapLikelihood,
    recoveryPenalty,
    normalHelperCount,
    embeddedWorkspaceBottleCount,
    coreBottleCountExcludingAds,
    forcedMoveRatio,
    fragmentation,
    buriedDepth,
    helperPressure,
    freeCapacity: free,
    fillDensity,
    activeFillRatio: fillDensity,
    startingFreeRatio: free / Math.max(1, board.length * capacity),
    partialBottleCount: embeddedWorkspaceBottleCount,
    rehandling,
    crossBottleDependency,
    temporaryDisorder: fragmentation + rehandling,
    deadEndPotential,
    specialModePressure: 0,
    solverVisitedStates,
    remainingMixedBottleCount: mixedBottleCount,
    safeOpeningMoves: dynamic.safeOpeningMoves,
    deadEndOpeningMoves: dynamic.deadEndOpeningMoves,
    falseProgressOpeningMoves: dynamic.falseProgressOpeningMoves,
    classifiedOpeningMoves: dynamic.classifiedOpeningMoves,
    safetySampleCheckpoints: dynamic.checkpoints,
  };
}

/**
 * Classify legal moves at solution checkpoints using the known path + bounded re-solve.
 * safe = on known path or re-solves without large remaining-step inflation
 * dead-end = no continuation, or bounded solver fails
 * false-progress = still solvable but clearly longer than the known remaining path
 */
function analyzeDynamicMoveSafety(board, capacity, solutionMoves) {
  const empty = {
    safeMoveRatio: 1,
    deadEndPotential: 0,
    falseProgressRatio: 0,
    criticalDecisionCount: 0,
    safeOpeningMoves: 0,
    deadEndOpeningMoves: 0,
    falseProgressOpeningMoves: 0,
    classifiedOpeningMoves: 0,
    checkpoints: 0,
  };
  if (!Array.isArray(solutionMoves) || solutionMoves.length === 0) return empty;

  const checkpointSet = new Set([0]);
  if (solutionMoves.length >= 4) {
    checkpointSet.add(Math.floor(solutionMoves.length * 0.25));
    checkpointSet.add(Math.floor(solutionMoves.length * 0.5));
    checkpointSet.add(Math.floor(solutionMoves.length * 0.75));
  } else if (solutionMoves.length >= 2) {
    checkpointSet.add(Math.floor(solutionMoves.length / 2));
  }
  const checkpoints = Array.from(checkpointSet).sort((a, b) => a - b);

  let safeTotal = 0;
  let deadTotal = 0;
  let falseProgressTotal = 0;
  let classifiedTotal = 0;
  let criticalDecisionCount = 0;
  let openingSafe = 0;
  let openingDead = 0;
  let openingFalse = 0;
  let openingClassified = 0;

  for (const depth of checkpoints) {
    const state = stateAfterMoves(board, capacity, solutionMoves.slice(0, depth));
    if (state == null || isSolvedState(state, capacity)) continue;
    const previous = depth > 0 ? solutionMoves[depth - 1] : null;
    const legalMoves = enumerateMoves(state, capacity, { skipCompletedSource: true, skipSymmetricEmptyMoves: true }, previous);
    if (legalMoves.length === 0) continue;
    criticalDecisionCount += Math.max(0, legalMoves.length - 1);

    const knownNext = solutionMoves[depth] || null;
    const remaining = Math.max(0, solutionMoves.length - depth);
    const moveBudget = Math.min(legalMoves.length, depth === 0 ? 20 : 12);
    // Prefer sampling diverse sources, keep known next move first when present.
    const ordered = legalMoves.slice();
    if (knownNext) {
      ordered.sort((left, right) => {
        const leftMatch = left.from === knownNext.fromBottle - 1 && left.to === knownNext.toBottle - 1 ? 0 : 1;
        const rightMatch = right.from === knownNext.fromBottle - 1 && right.to === knownNext.toBottle - 1 ? 0 : 1;
        return leftMatch - rightMatch || left.from - right.from || left.to - right.to;
      });
    }

    for (let index = 0; index < moveBudget; index++) {
      const move = ordered[index];
      const classification = classifyMoveSafety(state, capacity, move, knownNext, remaining);
      classifiedTotal++;
      if (depth === 0) openingClassified++;
      if (classification === "safe") {
        safeTotal++;
        if (depth === 0) openingSafe++;
      } else if (classification === "dead") {
        deadTotal++;
        if (depth === 0) openingDead++;
      } else if (classification === "falseProgress") {
        falseProgressTotal++;
        if (depth === 0) openingFalse++;
      }
    }
  }

  if (classifiedTotal === 0) return empty;
  return {
    safeMoveRatio: safeTotal / classifiedTotal,
    deadEndPotential: deadTotal / classifiedTotal,
    falseProgressRatio: falseProgressTotal / classifiedTotal,
    criticalDecisionCount,
    safeOpeningMoves: openingSafe,
    deadEndOpeningMoves: openingDead,
    falseProgressOpeningMoves: openingFalse,
    classifiedOpeningMoves: openingClassified,
    checkpoints: checkpoints.length,
  };
}

function classifyMoveSafety(state, capacity, move, knownNext, remainingSteps) {
  if (knownNext && move.from === knownNext.fromBottle - 1 && move.to === knownNext.toBottle - 1) {
    return "safe";
  }
  const next = applyKnownPour(state, move.from, move.to, capacity, move);
  if (next == null) return "dead";
  if (isSolvedState(next, capacity)) return "safe";
  const continuations = enumerateMoves(next, capacity, { skipCompletedSource: true, skipSymmetricEmptyMoves: true }, {
    fromBottle: move.from + 1,
    toBottle: move.to + 1,
  });
  if (continuations.length === 0) return "dead";

  const maxDepth = Math.max(8, Math.min(48, remainingSteps + 10));
  const maxStates = Math.max(1500, Math.min(12000, 2500 + remainingSteps * 120));
  const solved = solveWaterSort(next.colors, capacity, {
    mode: SolverMode.Fast,
    maxDepth,
    maxStates,
    maxSolutions: 1,
    sampleLimit: 1,
    skipCompletedSource: true,
    skipSymmetricEmptyMoves: true,
    canonicalizeBottleSymmetry: true,
    canonicalizeColorSymmetry: false,
    selectionPolicy: "difficulty_metric_move_safety",
  });
  if (!solved.success) return "dead";
  if (solved.shortestStepCount <= remainingSteps) return "safe";
  if (solved.shortestStepCount >= Math.max(remainingSteps + 3, Math.ceil(remainingSteps * 1.3) + 1)) return "falseProgress";
  return "neutral";
}

function countRehandledSources(moves) {
  const seen = new Set();
  let rehandled = 0;
  for (const move of moves) {
    if (seen.has(move.fromBottle)) rehandled++;
    seen.add(move.fromBottle);
  }
  return rehandled;
}

function stateAfterMoves(board, capacity, moves) {
  let state = makeInitialHiddenState(board);
  for (const move of moves) {
    state = applyHiddenPour(state, move.fromBottle - 1, move.toBottle - 1, capacity);
    if (state == null) return null;
  }
  return state;
}

function solveClassicBoard(board, capacity, profile, options = {}) {
  return solveWaterSort(board, capacity, {
    mode: options.mode || SolverMode.Fast,
    maxDepth: options.maxDepth || profile.nearWin?.trapSolverMaxDepth || profile.maxShortestStepCount || 120,
    maxStates: options.maxStates || profile.nearWin?.trapSolverMaxStates || profile.maxSolutionCount || 100000,
    maxSolutions: options.maxSolutions || 1,
    sampleLimit: options.maxSolutions || 1,
    skipCompletedSource: true,
    skipSymmetricEmptyMoves: true,
    canonicalizeBottleSymmetry: true,
    canonicalizeColorSymmetry: false,
    selectionPolicy: options.selectionPolicy || "profile_canonical_solver",
    runFastFirst: options.runFastFirst,
  });
}

function buildSpecialNearWinLevel(config, profile, levelNumber, random, solvedModules, duplicateAttempt = 0) {
  const intent = generationIntentFor(profile);
  const bounds = moduleCountBounds(config, profile);
  const maxModuleCount = bounds.maxModules;
  const preferredCapacity = capacityFor(config, profile, random);
  const failures = [];
  for (const candidateCapacity of capacityOptionsFor(config, profile, preferredCapacity)) {
    const recipeAttempts = Math.max(24, Math.min(96, Number(profile.nearWin?.maxTrapCandidates) || 24));
    for (let attempt = 0; attempt < recipeAttempts; attempt++) {
      const attemptLevelNumber = levelNumber + attempt + Math.imul(duplicateAttempt, 4099);
      const attemptRandom = rng(seedFor(attemptLevelNumber, 0x5EC1A1, 374761393));
      try {
        const picked = chooseRecipe(config, profile, intent, candidateCapacity, maxModuleCount, solvedModules, attemptRandom);
        const composed = buildComposedLevel(picked.recipe, solvedModules, attemptLevelNumber, intent.storedSolutionTarget, duplicateAttempt);
        const pressureBoard = applyProfileWorkspacePressure(composed.board, candidateCapacity, attemptRandom, profile);
        const safe = solveClassicBoard(pressureBoard, candidateCapacity, profile, {
          mode: SolverMode.Fast,
          maxDepth: profile.maxShortestStepCount,
          maxStates: profile.maxSolutionCount,
          selectionPolicy: "nearwin_base_safe_solution",
        });
        if (!safe.success || safe.solutions.length === 0) {
          failures.push("base_unsolved");
          continue;
        }
        const trap = findNearWinTrap(pressureBoard, candidateCapacity, safe.solutions[0].moves, profile, attemptLevelNumber, attemptRandom);
        if (trap == null) {
          failures.push("no_trap");
          continue;
        }
        if (countNormalEmptyHelpers(pressureBoard) > Number(profile.maxNormalHelperCount ?? 1)) {
          failures.push("too_many_helpers_after_nearwin");
          continue;
        }
        return {
          capacity: candidateCapacity,
          board: pressureBoard,
          solutionMoveLists: [safe.solutions[0].moves],
          special: {
            type: "NearWin",
            trap,
            safeSolution: safe.solutions[0],
            safeSolver: {
              status: safe.status,
              visitedStates: safe.visitedStates,
              isOptimal: safe.isOptimal,
            },
          },
        };
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }
  }
  throw new Error(`NearWin failed for level ${levelNumber}: ${failures.slice(-8).join("; ")}`);
}

function findNearWinTrap(board, capacity, safeMoves, profile, levelNumber, random) {
  const options = profile.nearWin;
  const minDepth = Math.max(1, Math.floor(safeMoves.length * options.minCriticalDepthRatio));
  const maxDepth = Math.max(minDepth, Math.floor(safeMoves.length * options.maxCriticalDepthRatio));
  const candidates = [];
  const debugFailures = { badState: 0, noPlausibility: 0, lowNearWinScore: 0, unclassified: 0, noRescue: 0, maxNearWinScore: 0, maxPlausibility: 0, maxLegalMoves: 0 };
  for (let depth = minDepth; depth <= maxDepth && candidates.length < options.maxTrapCandidates; depth++) {
    const state = stateAfterMoves(board, capacity, safeMoves.slice(0, depth));
    if (state == null || isSolvedState(state, capacity)) {
      debugFailures.badState++;
      continue;
    }
    const legalMoves = enumerateMoves(state, capacity, { skipCompletedSource: true, skipSymmetricEmptyMoves: true }, depth > 0 ? safeMoves[depth - 1] : null);
    const safeNext = safeMoves[depth];
    for (const move of legalMoves) {
      const externalMove = { fromBottle: move.from + 1, toBottle: move.to + 1 };
      if (safeNext && externalMove.fromBottle === safeNext.fromBottle && externalMove.toBottle === safeNext.toBottle) continue;
      const plausibility = scorePlausibleBadMove(state, capacity, move);
      debugFailures.maxPlausibility = Math.max(debugFailures.maxPlausibility, plausibility);
      debugFailures.maxLegalMoves = Math.max(debugFailures.maxLegalMoves, legalMoves.length);
      if (plausibility <= 0) {
        debugFailures.noPlausibility++;
        continue;
      }
      const trapState = applyKnownPour(state, move.from, move.to, capacity, move);
      const nearWinMetrics = evaluateNearWinState(trapState, capacity);
      debugFailures.maxNearWinScore = Math.max(debugFailures.maxNearWinScore, nearWinMetrics.nearWinScore);
      if (nearWinMetrics.nearWinScore < options.minNearWinScore) {
        debugFailures.lowNearWinScore++;
        continue;
      }
      const safeRemainingSteps = safeMoves.length - depth;
      const continuationMoves = enumerateMoves(trapState, capacity, { skipCompletedSource: true, skipSymmetricEmptyMoves: true }, externalMove);
      let trapResult = { status: "hard_deadlock", success: false, visitedStates: 1 };
      let classification = classifyHardDeadlock(continuationMoves, trapState, capacity, options);
      if (!classification.accepted) {
        trapResult = solveClassicBoard(trapState.colors, capacity, profile, {
          mode: SolverMode.Fast,
          maxDepth: options.trapSolverMaxDepth,
          maxStates: options.trapSolverMaxStates,
          selectionPolicy: "nearwin_trap_classification",
        });
        classification = classifyTrap(trapResult, safeRemainingSteps, options);
        if (!classification.accepted && !trapResult.success) {
          trapResult = solveClassicBoard(trapState.colors, capacity, profile, {
            mode: SolverMode.Optimal,
            maxDepth: options.trapSolverMaxDepth,
            maxStates: options.trapSolverMaxStates,
            selectionPolicy: "nearwin_trap_strong_proof",
            runFastFirst: false,
          });
          classification = classifyTrap(trapResult, safeRemainingSteps, options);
        }
      }
      if (!classification.accepted && (profile.adaptiveSmallSpecial || profile.profileId === "Special") && plausibility >= 0.35 && legalMoves.length >= 2) {
        const trapRemainingSteps = trapResult.success ? trapResult.shortestStepCount : null;
        const recoveryPenalty = trapRemainingSteps == null ? null : Math.max(0, trapRemainingSteps - safeRemainingSteps);
        classification = {
          accepted: true,
          trapType: trapResult.success ? "FalseProgress" : "DeadEndProximity",
          trapRemainingSteps,
          recoveryPenalty,
          recoveryRatio: trapRemainingSteps == null ? null : trapRemainingSteps / Math.max(1, safeRemainingSteps),
          score: 8 + plausibility * 18 + Math.min(12, legalMoves.length * 2),
        };
      }
      if (!classification.accepted) {
        debugFailures.unclassified++;
        continue;
      }
      const rescues = validateNearWinRescues(trapState.colors, capacity, profile, levelNumber, random, options);
      if (rescues.supportedRescueTypes.length === 0 && !profile.adaptiveSmallSpecial && profile.profileId !== "Special") {
        debugFailures.noRescue++;
        continue;
      }
      const trapDepthRatio = safeMoves.length === 0 ? 0 : depth / safeMoves.length;
      const safeMoveRatio = legalMoves.length <= 1 ? 1 : 1 / legalMoves.length;
      const score =
        nearWinMetrics.nearWinScore * 100 +
        plausibility * 20 +
        trapDepthRatio * 18 +
        classification.score +
        rescues.score -
        (trapDepthRatio < options.minCriticalDepthRatio ? 40 : 0);
      candidates.push({
        criticalDecisionState: { safeMoveIndex: depth, depthRatio: trapDepthRatio },
        trapMove: externalMove,
        trapType: classification.trapType,
        safeRemainingSteps,
        trapRemainingSteps: classification.trapRemainingSteps,
        recoveryPenalty: classification.recoveryPenalty,
        recoveryRatio: classification.recoveryRatio,
        solverStatus: trapResult.status,
        solverVisitedStates: trapResult.visitedStates,
        branchingFactor: legalMoves.length / Math.max(1, state.colors.length),
        safeMoveRatio,
        criticalDecisionCount: legalMoves.length,
        falseProgressScore: plausibility,
        trapLikelihood: Math.max(0, Math.min(1, nearWinMetrics.nearWinScore * 0.6 + plausibility * 0.4)),
        ...nearWinMetrics,
        ...rescues,
        criticalMovePlausibility: plausibility,
        nearWinQualityScore: score,
      });
    }
  }
  if (candidates.length === 0 && process.env.WATERSORT_DEBUG_NEARWIN === "1") {
    console.error(`NearWin debug level ${levelNumber}: depths=${minDepth}-${maxDepth}, safeMoves=${safeMoves.length}, failures=${JSON.stringify(debugFailures)}`);
  }
  candidates.sort((left, right) => right.nearWinQualityScore - left.nearWinQualityScore
    || left.criticalDecisionState.safeMoveIndex - right.criticalDecisionState.safeMoveIndex
    || left.trapMove.fromBottle - right.trapMove.fromBottle
    || left.trapMove.toBottle - right.trapMove.toBottle);
  return candidates[0] || null;
}

function scorePlausibleBadMove(state, capacity, move) {
  const source = state.colors[move.from];
  const target = state.colors[move.to];
  let score = 0;
  if (target.length > 0 && target[target.length - 1] === move.color) score += 0.35;
  if (target.length + move.amount === capacity) score += 0.25;
  if (source.length === move.amount) score += 0.2;
  if (move.amount > 1) score += 0.15;
  if (target.length === 0 && source.length > move.amount) score += 0.05;
  return Math.min(1, score);
}

function evaluateNearWinState(state, capacity) {
  let completed = 0;
  let completedColors = 0;
  let organizedLayers = 0;
  let totalLayers = 0;
  let mixed = 0;
  const unresolvedColors = new Set();
  for (const bottle of state.colors) {
    totalLayers += bottle.length;
    if (bottle.length === 0) continue;
    const colors = new Set(bottle);
    if (bottle.length === capacity && colors.size === 1) {
      completed++;
      completedColors++;
      organizedLayers += bottle.length;
      continue;
    }
    if (colors.size > 1) mixed++;
    for (let i = 0; i < bottle.length; i++) {
      if (i === 0 || bottle[i] === bottle[i - 1]) organizedLayers++;
      unresolvedColors.add(bottle[i]);
    }
  }
  const bottleCount = Math.max(1, state.colors.filter(bottle => bottle.length > 0).length);
  const completedBottleRatio = completed / bottleCount;
  const completedColorRatio = completedColors / Math.max(1, completedColors + unresolvedColors.size);
  const organizedLayerRatio = totalLayers === 0 ? 1 : organizedLayers / totalLayers;
  const remainingMixedBottleCount = mixed;
  const remainingFragmentedColorCount = unresolvedColors.size;
  const remainingUnresolvedLayers = totalLayers - organizedLayers;
  const normalHelperCount = countNormalEmptyHelpers(state.colors);
  const embeddedWorkspaceBottleCount = countEmbeddedWorkspaceBottles(state.colors, capacity);
  const coreBottleCountExcludingAds = state.colors.length;
  const nearWinScore = Math.max(0, Math.min(1,
    completedBottleRatio * 0.38 +
    completedColorRatio * 0.22 +
    organizedLayerRatio * 0.28 +
    (1 - Math.min(1, remainingMixedBottleCount / bottleCount)) * 0.12));
  return {
    completedBottleRatio,
    completedColorRatio,
    organizedLayerRatio,
    remainingMixedBottleCount,
    remainingFragmentedColorCount,
    remainingUnresolvedLayers,
    normalHelperCount,
    embeddedWorkspaceBottleCount,
    coreBottleCountExcludingAds,
    nearWinScore,
  };
}

function classifyHardDeadlock(continuationMoves, state, capacity, options) {
  if (continuationMoves.length > 0 || isSolvedState(state, capacity)) return { accepted: false };
  return {
    accepted: true,
    trapType: "HardDeadlock",
    trapRemainingSteps: null,
    recoveryPenalty: null,
    recoveryRatio: null,
    score: options.hardDeadlockWeight * 30,
  };
}

function classifyTrap(result, safeRemainingSteps, options) {
  if (result.success) {
    const trapRemainingSteps = result.shortestStepCount;
    const recoveryPenalty = trapRemainingSteps - safeRemainingSteps;
    const recoveryRatio = trapRemainingSteps / Math.max(1, safeRemainingSteps);
    if (recoveryPenalty >= options.minSoftTrapRecoveryPenalty || recoveryRatio >= options.minSoftTrapRecoveryRatio) {
      return {
        accepted: true,
        trapType: "Soft",
        trapRemainingSteps,
        recoveryPenalty,
        recoveryRatio,
        score: options.softTrapWeight * Math.max(10, recoveryPenalty * 3 + recoveryRatio * 8),
      };
    }
    return { accepted: false };
  }
  if (result.status === "unsolved_exhausted") {
    return {
      accepted: true,
      trapType: "Strong",
      trapRemainingSteps: null,
      recoveryPenalty: null,
      recoveryRatio: null,
      score: options.strongTrapWeight * 45,
    };
  }
  return { accepted: false };
}

function validateNearWinRescues(trapBoard, capacity, profile, levelNumber, random, options) {
  const supportedRescueTypes = [];
  let preferredRescueType = "";
  let score = 0;
  let addBottleSolution = null;
  let shuffleSolution = null;
  if (options.allowAddBottleRescue && trapBoard.length < 30) {
    const addBottle = solveClassicBoard(trapBoard.concat([[]]), capacity, profile, {
      mode: SolverMode.Fast,
      maxDepth: options.trapSolverMaxDepth,
      maxStates: options.trapSolverMaxStates,
      selectionPolicy: "nearwin_optional_add_bottle_rescue",
    });
    if (addBottle.success) {
      supportedRescueTypes.push("AddBottle");
      preferredRescueType = "AddBottle";
      addBottleSolution = addBottle.solutions[0];
      score += 18;
    }
  }
  if (options.allowShuffleRescue) {
    for (let attempt = 0; attempt < options.shuffleCandidateCount; attempt++) {
      const shuffleRandom = rng(seedFor(levelNumber + attempt, 0x5A4FF1E, 668265263));
      const shuffled = deterministicShuffleBoard(trapBoard, shuffleRandom);
      const solved = solveClassicBoard(shuffled, capacity, profile, {
        mode: SolverMode.Fast,
        maxDepth: options.trapSolverMaxDepth,
        maxStates: options.trapSolverMaxStates,
        selectionPolicy: "nearwin_optional_shuffle_rescue",
      });
      if (solved.success && solved.shortestStepCount >= options.minShuffleRemainingSteps) {
        supportedRescueTypes.push("ShuffleColor");
        if (!preferredRescueType) preferredRescueType = "ShuffleColor";
        shuffleSolution = { board: shuffled, solution: solved.solutions[0] };
        score += 14;
        break;
      }
    }
  }
  return {
    supportedRescueTypes,
    preferredRescueType,
    rescueSolutions: {
      addBottle: addBottleSolution,
      shuffleColor: shuffleSolution,
    },
    score,
  };
}

function deterministicShuffleBoard(board, random) {
  const slots = [];
  const colors = [];
  for (let bottleIndex = 0; bottleIndex < board.length; bottleIndex++) {
    for (let layer = 0; layer < board[bottleIndex].length; layer++) {
      slots.push({ bottleIndex, layer });
      colors.push(board[bottleIndex][layer]);
    }
  }
  const shuffledColors = shuffle(colors, random);
  const out = board.map(bottle => bottle.slice());
  for (let i = 0; i < slots.length; i++) {
    out[slots[i].bottleIndex][slots[i].layer] = shuffledColors[i];
  }
  return out;
}

function countNormalEmptyHelpers(board) {
  return board.filter(bottle => bottle.length === 0).length;
}

function countEmbeddedWorkspaceBottles(board, capacity) {
  return board.filter(bottle => bottle.length > 0 && bottle.length < capacity).length;
}

function embedWorkspaceIntoActiveBottles(board, capacity, random, maxNormalEmptyHelpers = 0) {
  const out = board.map(bottle => bottle.slice());
  let emptyIndexes = out.map((bottle, index) => bottle.length === 0 ? index : -1).filter(index => index >= 0);
  while (emptyIndexes.length > maxNormalEmptyHelpers) {
    const target = emptyIndexes[Math.floor(random() * emptyIndexes.length)];
    const donors = out
      .map((bottle, index) => ({ bottle, index }))
      .filter(candidate => candidate.bottle.length >= Math.max(2, capacity - 1) && candidate.bottle.length < capacity + 1);
    if (donors.length === 0) break;
    donors.sort((left, right) => {
      const leftMixed = new Set(left.bottle).size;
      const rightMixed = new Set(right.bottle).size;
      return rightMixed - leftMixed || right.bottle.length - left.bottle.length || left.index - right.index;
    });
    let applied = false;
    const donorPool = donors.slice(0, Math.min(4, donors.length));
    for (let donorPick = 0; donorPick < donorPool.length && !applied; donorPick++) {
      const donor = donorPool[(donorPick + Math.floor(random() * donorPool.length)) % donorPool.length].index;
      const maxMove = Math.min(2, out[donor].length - 1, capacity - out[target].length);
      if (maxMove <= 0) continue;
      const moveCandidates = random() < 0.5 ? [1, 2] : [2, 1];
      for (const wanted of moveCandidates) {
        const movedLayerCount = Math.min(wanted, maxMove);
        if (movedLayerCount <= 0) continue;
        const trial = out.map(bottle => bottle.slice());
        for (let i = 0; i < movedLayerCount; i++) trial[target].push(trial[donor].pop());
        if (hasTrivialNearCompleteColorSplit(trial, capacity)) continue;
        for (let i = 0; i < movedLayerCount; i++) out[target].push(out[donor].pop());
        applied = true;
        break;
      }
    }
    if (!applied) break;
    emptyIndexes = out.map((bottle, index) => bottle.length === 0 ? index : -1).filter(index => index >= 0);
  }
  return out;
}

function applyProfileWorkspacePressure(board, capacity, random, band) {
  let maxHelpers = Math.max(0, Number(band.maxNormalHelperCount ?? 2));
  const minPartial = Number(band.minPartialBottleCount || 0);
  const wantsPartial = minPartial > 0
    || maxHelpers <= 1
    || band.profileId === "Special"
    || band.adaptiveSmallSpecial;
  if (!wantsPartial) return board;
  if (minPartial > 0 && countEmbeddedWorkspaceBottles(board, capacity) < minPartial) {
    // Convert at least one empty into a partial fill so free capacity sits inside active bottles.
    maxHelpers = Math.min(maxHelpers, Math.max(0, countNormalEmptyHelpers(board) - 1));
  }
  return embedWorkspaceIntoActiveBottles(board, capacity, random, maxHelpers);
}

function applySmallSpecialWorkspacePressure(board, capacity, random, maxNormalEmptyHelpers = 0) {
  return embedWorkspaceIntoActiveBottles(board, capacity, random, maxNormalEmptyHelpers);
}

function meetsBranchingGate(band, metrics) {
  const min = Number(band.minAverageBranchingFactor ?? 0);
  if (min <= 0) return true;
  if (min > 1) return metrics.legalOpeningMoves >= min;
  return metrics.branchingFactor >= min;
}

function profileQualityRejection(band, metrics, options = {}) {
  if (shouldBuildSmallIntroLevel(band)) return null;
  const nearWinLevel = options.nearWinLevel === true;

  const maxHelpers = band.maxNormalHelperCount;
  const minHelpers = band.minNormalHelperCount;
  if (maxHelpers != null && metrics.normalHelperCount > maxHelpers) return "too_many_normal_helpers";
  if (minHelpers != null && metrics.normalHelperCount < minHelpers) return "too_few_normal_helpers";

  if ((band.minPartialBottleCount || 0) > 0 && metrics.embeddedWorkspaceBottleCount < band.minPartialBottleCount) {
    return "insufficient_partial_bottles";
  }
  if ((band.minActiveFillRatio || 0) > 0 && metrics.activeFillRatio + 1e-9 < band.minActiveFillRatio) {
    return "active_fill_too_low";
  }
  if ((band.maxStartingFreeRatio || 1) < 1 && metrics.startingFreeRatio - 1e-9 > band.maxStartingFreeRatio) {
    return "starting_free_too_high";
  }
  // NearWin already encodes trap/false-progress pressure via specialOptions; enforce composition only.
  const maxSafe = nearWinLevel ? 1 : Number(band.maxSafeMoveRatio ?? 1);
  const minDead = nearWinLevel ? 0 : Number(band.minDeadEndPotential || 0);
  const minTrap = nearWinLevel ? 0 : Number(band.minTrapLikelihood || 0);
  if (maxSafe < 1 && metrics.safeMoveRatio - 1e-9 > maxSafe) return "safe_move_ratio_too_high";
  if (minDead > 0 && metrics.deadEndPotential + 1e-9 < minDead) return "dead_end_too_low";
  if (minTrap > 0 && metrics.trapLikelihood + 1e-9 < minTrap) return "trap_likelihood_too_low";
  if (!nearWinLevel && !meetsBranchingGate(band, metrics)) return "branching_too_low";
  if (!nearWinLevel && (band.minCriticalDecisionCount || 0) > 0 && metrics.criticalDecisionCount < band.minCriticalDecisionCount) {
    return "critical_decisions_too_low";
  }
  return null;
}

function maybeScrambleForCrossBottleDependency(board, capacity, band, random, profile, storedSolutionTarget) {
  const id = band.profileId || normalizeProfileId(band.name);
  if (id === "Easy") return null;
  if (random() > 0.55) return null;
  const scrambled = deterministicShuffleBoard(board, random);
  if (hasTrivialNearCompleteColorSplit(scrambled, capacity)) return null;
  const solved = solveClassicBoard(scrambled, capacity, band, {
    mode: SolverMode.Fast,
    maxDepth: band.maxShortestStepCount,
    maxStates: band.maxSolutionCount,
    maxSolutions: Math.max(1, storedSolutionTarget || 1),
    selectionPolicy: "cross_bottle_scramble_resolve",
  });
  if (!solved.success || solved.solutions.length === 0) return null;
  const steps = solved.solutions[0].moves.length;
  if (steps < band.minShortestStepCount || steps > band.maxShortestStepCount) return null;
  return {
    board: scrambled,
    solutionMoveLists: solved.solutions.map(solution => solution.moves),
  };
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

  let config = readConfig();
  validateDifficultyProfiles(config);
  let selectedProfile = selectDifficultyProfile(config);
  const adaptiveResolution = resolveAdaptiveGenerationParameters(config, selectedProfile, readGenerationOverrides());
  config = adaptiveResolution.config;
  selectedProfile = adaptiveResolution.profile;
  const dryRun = process.env.WATERSORT_GENERATOR_DRY_RUN === "1";
  const solvedModules = new Map();
  const capacities = Array.from(new Set(
    config.profiles.concat([selectedProfile])
      .flatMap(profile => profile.capacityWeights.length ? profile.capacityWeights.filter(row => row.weight > 0).map(row => row.value) : [config.defaultBottleCapacity])
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
  const stats = { levels: 0, hiddenStack: 0, hybridHiddenStack: 0, lockedBottles: 0, megaBottle: 0, minAdBottles: Infinity, maxAdBottles: 0, byCapacity: {}, byBand: {}, megaV2: { minMovesBeforeFirstMegaPour: Infinity, maxTopColorShare: 0, minBuriedTargetRatio: Infinity, minCrossBottleBlockerMoves: Infinity, maxConsecutiveMegaPours: 0, maxTemplatePenalty: 0, maxSolverVisitedStates: 0, minActiveBottles: Infinity, maxActiveBottles: 0, minNormalHelpers: Infinity, maxNormalHelpers: 0, minAverageActiveFill: Infinity, maxAverageActiveFill: 0, minActiveFillRatio: Infinity, maxActiveFreeRatio: 0, maxSparseBottleRatio: 0, maxSingleLayerBottleCount: 0 }, layout: { minScore: Infinity, maxScore: 0, maxConnectedGroups: 0, maxIsolatedBottles: 0, maxInternalGaps: 0, maxCenterOffset: 0 }, minStep: Infinity, maxStep: 0, minBottles: Infinity, maxBottles: 0, minEmpty: Infinity, maxEmpty: 0, maxVisitedStates: 0, duplicateCandidatesRejected: 0, duplicateRetryCount: 0 };
  const acceptedFingerprints = new Map();
  const debugDuplicates = process.env.WATERSORT_DEBUG_DUPLICATES === "1";
  const maxDuplicateAttempts = Math.max(1, parsePositiveInt(process.env.WATERSORT_DUPLICATE_RETRY_ATTEMPTS, 48));

  for (let localLevelNumber = 1; localLevelNumber <= config.levelsPerPack; localLevelNumber++) {
    const levelNumber = levelOffset + localLevelNumber;
    const band = selectedProfile;
    const profile = generationIntentFor(band);
    const bounds = moduleCountBounds(config, band);
    const maxModuleCount = bounds.maxModules;
    let levelAccepted = false;
    let lastDuplicateOf = null;
    let lastRejectionReason = null;

    for (let attempt = 0; attempt < maxDuplicateAttempts; attempt++) {
    const attemptSeed = seedFor(levelNumber, stableShapeTieBreak(`profile:${band.name}:attempt:${attempt}`, levelNumber), 2246822519 ^ Math.imul(attempt + 1, 374761393));
    const random = rng(attemptSeed);
    const preferredCapacity = capacityFor(config, band, random);
    let capacity = preferredCapacity;
    let board;
    let solutionMoveLists;
    let megaLevel = null;

    let specialLevel = null;

    if (band.allowSpecialNearWin) {
      try {
        specialLevel = buildSpecialNearWinLevel(config, band, levelNumber, random, solvedModules, attempt);
      } catch (error) {
        if (band.explicitNearWinRequested) {
          throw new Error(`GenerationConstraintFailure: requested NearWin could not be constructed under current constraints (${error.message})`);
        }
        lastRejectionReason = error instanceof Error ? error.message : String(error);
        stats.duplicateRetryCount++;
        if (process.env.WATERSORT_DEBUG_SPECIAL_QUALITY === "1") {
          console.error(`Level ${levelNumber} NearWin attempt ${attempt + 1} failed: ${lastRejectionReason}`);
        }
        continue;
      }
      capacity = specialLevel.capacity;
      board = specialLevel.board;
      solutionMoveLists = specialLevel.solutionMoveLists;
    } else if (shouldBuildMegaLevel(band, random)) {
      megaLevel = buildMegaLevel(config, band, levelNumber, random, attempt);
      capacity = megaLevel.capacity;
      board = megaLevel.board;
      solutionMoveLists = megaLevel.solutionMoveLists;
    } else if (shouldBuildSmallIntroLevel(band)) {
      const introLevel = buildSmallIntroLevel(config, band, levelNumber, random, attempt);
      capacity = introLevel.capacity;
      board = introLevel.board;
      solutionMoveLists = introLevel.solutionMoveLists;
    } else {
      let recipe;
      let desiredDistinctColors;
      const recipeFailures = [];
      for (const candidateCapacity of capacityOptionsFor(config, band, preferredCapacity)) {
        try {
          const picked = chooseRecipe(config, band, profile, candidateCapacity, maxModuleCount, solvedModules, random);
          capacity = candidateCapacity;
          recipe = picked.recipe;
          desiredDistinctColors = picked.desiredDistinctColors;
          break;
        } catch (error) {
          recipeFailures.push(`${candidateCapacity}: ${error.message}`);
        }
      }
      if (recipe == null) throw new Error(`No modular recipe fits level ${levelNumber}: ${recipeFailures.join("; ")}`);
      const composedLevel = buildComposedLevel(recipe, solvedModules, levelNumber, profile.storedSolutionTarget, attempt);
      board = composedLevel.board;
      solutionMoveLists = composedLevel.solutionMoveLists;
    }
    if (megaLevel == null && specialLevel == null && !shouldBuildSmallIntroLevel(band)) {
      const beforeHelpers = countNormalEmptyHelpers(board);
      const beforePartial = countEmbeddedWorkspaceBottles(board, capacity);
      board = applyProfileWorkspacePressure(board, capacity, random, band);
      const changed = beforeHelpers !== countNormalEmptyHelpers(board)
        || beforePartial !== countEmbeddedWorkspaceBottles(board, capacity);
      if (changed) {
        const solved = solveClassicBoard(board, capacity, band, {
          mode: SolverMode.Fast,
          maxDepth: band.maxShortestStepCount,
          maxStates: band.maxSolutionCount,
          maxSolutions: profile.storedSolutionTarget,
          selectionPolicy: "profile_embedded_workspace",
        });
        if (!solved.success || solved.solutions.length === 0) {
          lastRejectionReason = "embedded_workspace_unsolved";
          stats.duplicateRetryCount++;
          continue;
        }
        solutionMoveLists = solved.solutions.map(solution => solution.moves);
      }
      const scrambled = maybeScrambleForCrossBottleDependency(board, capacity, band, random, band, profile.storedSolutionTarget);
      if (scrambled != null) {
        board = scrambled.board;
        solutionMoveLists = scrambled.solutionMoveLists;
      }
    }
    const adHelpers = addAdHelperBottles(board, random);
    const shape = applyAlternatingGapPreference(
      applyDenseLayoutPreference(chooseShapeForBottleCount(band, board.length, levelNumber), band, board.length, levelNumber),
      band,
      board.length,
      levelNumber);
    const hybridHiddenStack = megaLevel == null && band.allowHybridHiddenStackMode && random() < band.hybridHiddenStackChance;
    const hiddenStack = megaLevel == null && !hybridHiddenStack && band.allowHiddenStackMode && random() < band.hiddenStackChance;
    const hybridHiddenLayers = hybridHiddenStack ? buildHybridHiddenLayers(board, band, random) : board.map(() => []);
    const layout = assignAestheticGridPositions(board, shape, config, {
      firstAdBottleIndex: adHelpers.firstAdBottleIndex,
      megaBottleIndex: megaLevel != null ? megaLevel.megaBottleIndex : -1,
      levelNumber,
    });
    const gridPositions = layout.positions;
    let lockedBottles = megaLevel == null ? chooseLockedBottles(board, capacity, solutionMoveLists[0], band, random) : [];
    let validSolutionMoveLists = megaLevel == null
      ? solutionMoveLists.filter(candidateMoves => replaySolutionWithLocks(board, capacity, candidateMoves, lockedBottles))
      : solutionMoveLists.filter(candidateMoves => replayMegaSolution(
        board,
        board.map((_, index) => index === megaLevel.megaBottleIndex ? megaLevel.megaCapacity : capacity),
        megaLevel.megaBottleIndex,
        megaLevel.megaTargetColor,
        candidateMoves));
    if (megaLevel == null && lockedBottles.length > 0 && validSolutionMoveLists.length === 0) {
      lockedBottles = [];
      validSolutionMoveLists = solutionMoveLists;
    }
    if (validSolutionMoveLists.length === 0) {
      throw new Error(`No valid solution after mode constraints at level ${levelNumber}`);
    }
    const lockedByBottle = new Map(lockedBottles.map(lockedBottle => [lockedBottle.index, lockedBottle.unlockCompletedBottleCount]));
    const moves = validSolutionMoveLists[0];
    if (board.length > config.maxBottleCount) throw new Error(`Bad bottle count at level ${levelNumber}: ${board.length}`);
    assertBoardWithinCapacity(board, capacity, levelNumber, megaLevel);
    if (moves.length < band.minShortestStepCount || moves.length > band.maxShortestStepCount) {
      lastRejectionReason = `bad_step_count_${moves.length}`;
      stats.duplicateRetryCount++;
      continue;
    }
    if (megaLevel == null && hasCapacityRepeat(board, capacity)) throw new Error(`Capacity repeat at level ${levelNumber}`);
    const coreBoardForQuality = board.slice(0, adHelpers.firstAdBottleIndex);
    if (
      megaLevel == null
      && !shouldBuildSmallIntroLevel(band)
      && hasTrivialNearCompleteColorSplit(coreBoardForQuality, capacity)
    ) {
      lastRejectionReason = "trivial_capacity_minus_one_color_split";
      stats.duplicateRetryCount++;
      if (process.env.WATERSORT_DEBUG_SPECIAL_QUALITY === "1") {
        console.error(`Level ${levelNumber} rejected: trivial_capacity_minus_one_color_split`);
      }
      continue;
    }
    for (const candidateMoves of validSolutionMoveLists) {
      if (megaLevel != null) {
        if (!replayMegaSolution(
          board,
          board.map((_, index) => index === megaLevel.megaBottleIndex ? megaLevel.megaCapacity : capacity),
          megaLevel.megaBottleIndex,
          megaLevel.megaTargetColor,
          candidateMoves)) throw new Error(`Invalid mega solution at level ${levelNumber}`);
      } else {
        if (!replaySolution(board, capacity, candidateMoves)) throw new Error(`Invalid constructed solution at level ${levelNumber}`);
        if (!replaySolutionWithLocks(board, capacity, candidateMoves, lockedBottles)) throw new Error(`Invalid locked solution at level ${levelNumber}`);
      }
    }

    const stepCount = moves.length;
    const difficultyMetrics = megaLevel == null ? evaluateNormalDifficulty(board.slice(0, adHelpers.firstAdBottleIndex), capacity, moves) : null;
    if (difficultyMetrics) {
      const qualityReason = profileQualityRejection(band, difficultyMetrics, { nearWinLevel: specialLevel != null });
      if (qualityReason) {
        lastRejectionReason = qualityReason;
        stats.duplicateRetryCount++;
        if (process.env.WATERSORT_DEBUG_SPECIAL_QUALITY === "1") {
          console.error(`Level ${levelNumber} rejected: ${qualityReason} ${JSON.stringify(difficultyMetrics)}`);
        }
        continue;
      }
    }
    if (band.adaptiveSmallSpecial && difficultyMetrics && specialLevel == null) {
      const rejectSmallSpecial = reason => {
        lastRejectionReason = reason;
        if (process.env.WATERSORT_DEBUG_SPECIAL_QUALITY === "1") {
          console.error(`Level ${levelNumber} rejected: ${reason} ${JSON.stringify(difficultyMetrics)}`);
        }
        return true;
      };
      if (difficultyMetrics.difficultyScore < (band.minSpecialDifficultyScore ?? 0.5) && rejectSmallSpecial("difficulty_too_low")) continue;
      if (difficultyMetrics.safeMoveRatio > (band.maxSmallSpecialSafeMoveRatio ?? 1) && rejectSmallSpecial("safe_move_ratio_too_high")) continue;
      if (difficultyMetrics.branchingFactor < (band.minSmallSpecialBranchingFactor ?? 0) && rejectSmallSpecial("branching_too_low")) continue;
      if (difficultyMetrics.trapLikelihood < (band.minSmallSpecialTrapLikelihood ?? 0) && rejectSmallSpecial("trap_likelihood_too_low")) continue;
    }

    const fingerprint = coreGameplayFingerprintFromBoard({
      board,
      capacity,
      firstAdBottleIndex: adHelpers.firstAdBottleIndex,
      modeOptions: {
        hiddenStack,
        hybridHiddenStack,
        lockedBottles: lockedBottles.length > 0,
        megaBottle: megaLevel != null,
      },
      hybridHiddenLayers,
      lockedByBottle,
      megaBottleIndex: megaLevel != null ? megaLevel.megaBottleIndex : -1,
      megaCapacity: megaLevel != null ? megaLevel.megaCapacity : null,
      megaTargetColor: megaLevel != null ? megaLevel.megaTargetColor : null,
    });
    if (acceptedFingerprints.has(fingerprint)) {
      stats.duplicateCandidatesRejected++;
      stats.duplicateRetryCount++;
      lastDuplicateOf = acceptedFingerprints.get(fingerprint);
      if (debugDuplicates) {
        console.error(`Level ${levelNumber} rejected: duplicate of Level ${lastDuplicateOf} (attempt ${attempt + 1}/${maxDuplicateAttempts})`);
      }
      continue;
    }
    const modeSuffix = `${specialLevel != null ? "nearwin" : megaLevel != null ? "mega" : hiddenStack ? "hidden" : hybridHiddenStack ? "hybrid_hidden" : "normal"}${lockedBottles.length > 0 ? "_locked" : ""}`;
    const solutionData = {
      solutionCount: validSolutionMoveLists.length,
      shortestStepCount: stepCount,
      storedSolutionCount: validSolutionMoveLists.length,
      storesAllSolutions: false,
      difficulty: band.name,
      selectionPolicy: megaLevel != null
        ? `${config.selectionPolicy}_${modeSuffix}_mega_v2_target_directed_solver_exact_replay_not_global_shortest`
        : `${config.selectionPolicy}_${modeSuffix}_profile_${band.name}_modular_constructed_validated_from_exhaustive_pruned_canonical_modules_not_global_shortest`,
      solutions: validSolutionMoveLists.map(candidateMoves => ({ stepCount: candidateMoves.length, moves: candidateMoves })),
    };
    if (difficultyMetrics) {
      solutionData.difficultyMetrics = difficultyMetrics;
    }
    solutionData.layoutMetrics = layout.metrics;
    if (megaLevel?.metrics) {
      solutionData.megaMetrics = megaLevel.metrics;
    }
    if (specialLevel?.special) {
      solutionData.specialOptions = {
        type: "NearWin",
        trapType: specialLevel.special.trap.trapType,
        supportedRescueTypes: specialLevel.special.trap.supportedRescueTypes,
        preferredRescueType: specialLevel.special.trap.preferredRescueType,
        criticalDecisionState: specialLevel.special.trap.criticalDecisionState,
        trapMove: specialLevel.special.trap.trapMove,
        safeSolutionStepCount: specialLevel.special.safeSolution.stepCount,
        nearWinMetrics: {
          minNearWinScore: band.nearWin.minNearWinScore,
          completedBottleRatio: specialLevel.special.trap.completedBottleRatio,
          completedColorRatio: specialLevel.special.trap.completedColorRatio,
          organizedLayerRatio: specialLevel.special.trap.organizedLayerRatio,
          remainingMixedBottleCount: specialLevel.special.trap.remainingMixedBottleCount,
          remainingFragmentedColorCount: specialLevel.special.trap.remainingFragmentedColorCount,
          remainingUnresolvedLayers: specialLevel.special.trap.remainingUnresolvedLayers,
          branchingFactor: specialLevel.special.trap.branchingFactor,
          safeMoveRatio: specialLevel.special.trap.safeMoveRatio,
          criticalDecisionCount: specialLevel.special.trap.criticalDecisionCount,
          falseProgressScore: specialLevel.special.trap.falseProgressScore,
          trapLikelihood: specialLevel.special.trap.trapLikelihood,
          recoveryPenalty: specialLevel.special.trap.recoveryPenalty,
          normalHelperCount: specialLevel.special.trap.normalHelperCount,
          embeddedWorkspaceBottleCount: specialLevel.special.trap.embeddedWorkspaceBottleCount,
          coreBottleCountExcludingAds: specialLevel.special.trap.coreBottleCountExcludingAds,
          nearWinScore: specialLevel.special.trap.nearWinScore,
        },
        recovery: {
          safeRemainingSteps: specialLevel.special.trap.safeRemainingSteps,
          trapRemainingSteps: specialLevel.special.trap.trapRemainingSteps,
          recoveryPenalty: specialLevel.special.trap.recoveryPenalty,
          recoveryRatio: specialLevel.special.trap.recoveryRatio,
          solverStatus: specialLevel.special.trap.solverStatus,
        },
      };
      solutionData.optionalRescueSolutions = specialLevel.special.trap.rescueSolutions;
    }
    levelPack.levels.push({
      id: levelNumber,
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
        if (index >= adHelpers.firstAdBottleIndex) {
          bottle.isAdBottle = true;
        }
        if (isMegaBottle) {
          bottle.isMegaBottle = true;
          bottle.targetColor = megaLevel.megaTargetColor;
        }
        if (hybridHiddenLayers[index].length > 0) {
          bottle.hiddenLayerIndexes = hybridHiddenLayers[index];
        }
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
    if (megaLevel?.metrics) {
      stats.megaV2.minMovesBeforeFirstMegaPour = Math.min(stats.megaV2.minMovesBeforeFirstMegaPour, megaLevel.metrics.movesBeforeFirstMegaPour);
      stats.megaV2.maxTopColorShare = Math.max(stats.megaV2.maxTopColorShare, megaLevel.metrics.maxTopColorShare);
      stats.megaV2.minBuriedTargetRatio = Math.min(stats.megaV2.minBuriedTargetRatio, megaLevel.metrics.buriedTargetRatio);
      stats.megaV2.minCrossBottleBlockerMoves = Math.min(stats.megaV2.minCrossBottleBlockerMoves, megaLevel.metrics.crossBottleBlockerMoves);
      stats.megaV2.maxConsecutiveMegaPours = Math.max(stats.megaV2.maxConsecutiveMegaPours, megaLevel.metrics.maxConsecutiveMegaPours);
      stats.megaV2.maxTemplatePenalty = Math.max(stats.megaV2.maxTemplatePenalty, megaLevel.metrics.templatePenalty);
      stats.megaV2.maxSolverVisitedStates = Math.max(stats.megaV2.maxSolverVisitedStates, megaLevel.metrics.solverVisitedStates);
      stats.megaV2.minActiveBottles = Math.min(stats.megaV2.minActiveBottles, megaLevel.metrics.activeBottleCount);
      stats.megaV2.maxActiveBottles = Math.max(stats.megaV2.maxActiveBottles, megaLevel.metrics.activeBottleCount);
      stats.megaV2.minNormalHelpers = Math.min(stats.megaV2.minNormalHelpers, megaLevel.metrics.normalHelperCount);
      stats.megaV2.maxNormalHelpers = Math.max(stats.megaV2.maxNormalHelpers, megaLevel.metrics.normalHelperCount);
      stats.megaV2.minAverageActiveFill = Math.min(stats.megaV2.minAverageActiveFill, megaLevel.metrics.averageActiveFill);
      stats.megaV2.maxAverageActiveFill = Math.max(stats.megaV2.maxAverageActiveFill, megaLevel.metrics.averageActiveFill);
      stats.megaV2.minActiveFillRatio = Math.min(stats.megaV2.minActiveFillRatio, megaLevel.metrics.activeFillRatio);
      stats.megaV2.maxActiveFreeRatio = Math.max(stats.megaV2.maxActiveFreeRatio, megaLevel.metrics.activeFreeRatio);
      stats.megaV2.maxSparseBottleRatio = Math.max(stats.megaV2.maxSparseBottleRatio, megaLevel.metrics.sparseBottleRatio);
      stats.megaV2.maxSingleLayerBottleCount = Math.max(stats.megaV2.maxSingleLayerBottleCount, megaLevel.metrics.singleLayerBottleCount);
    }
    stats.byCapacity[capacity] = (stats.byCapacity[capacity] || 0) + 1;
    stats.minAdBottles = Math.min(stats.minAdBottles, adHelpers.adBottleCount);
    stats.maxAdBottles = Math.max(stats.maxAdBottles, adHelpers.adBottleCount);
    stats.minStep = Math.min(stats.minStep, stepCount);
    stats.maxStep = Math.max(stats.maxStep, stepCount);
    stats.minBottles = Math.min(stats.minBottles, board.length);
    stats.maxBottles = Math.max(stats.maxBottles, board.length);
    const emptyCount = board.filter(bottle => bottle.length === 0).length;
    stats.minEmpty = Math.min(stats.minEmpty, emptyCount);
    stats.maxEmpty = Math.max(stats.maxEmpty, emptyCount);
    stats.layout.minScore = Math.min(stats.layout.minScore, layout.metrics.layoutScore);
    stats.layout.maxScore = Math.max(stats.layout.maxScore, layout.metrics.layoutScore);
    stats.layout.maxConnectedGroups = Math.max(stats.layout.maxConnectedGroups, layout.metrics.connectedGroupCount);
    stats.layout.maxIsolatedBottles = Math.max(stats.layout.maxIsolatedBottles, layout.metrics.isolatedBottleCount);
    stats.layout.maxInternalGaps = Math.max(stats.layout.maxInternalGaps, layout.metrics.internalHorizontalGapCount);
    stats.layout.maxCenterOffset = Math.max(stats.layout.maxCenterOffset, layout.metrics.centerOffset);
    const bandStats = stats.byBand[band.name] ??= { count: 0, megaBottle: 0, nearWin: 0, minDifficultyScore: Infinity, maxDifficultyScore: 0, minStep: Infinity, maxStep: 0, minBottles: Infinity, maxBottles: 0, minEmpty: Infinity, maxEmpty: 0, minAdBottles: Infinity, maxAdBottles: 0 };
    bandStats.count++;
    if (specialLevel != null) bandStats.nearWin++;
    if (difficultyMetrics) {
      bandStats.minDifficultyScore = Math.min(bandStats.minDifficultyScore, difficultyMetrics.difficultyScore);
      bandStats.maxDifficultyScore = Math.max(bandStats.maxDifficultyScore, difficultyMetrics.difficultyScore);
    }
    bandStats.minStep = Math.min(bandStats.minStep, stepCount);
    bandStats.maxStep = Math.max(bandStats.maxStep, stepCount);
    bandStats.minBottles = Math.min(bandStats.minBottles, board.length);
    bandStats.maxBottles = Math.max(bandStats.maxBottles, board.length);
    bandStats.minEmpty = Math.min(bandStats.minEmpty, emptyCount);
    bandStats.maxEmpty = Math.max(bandStats.maxEmpty, emptyCount);
    bandStats.minAdBottles = Math.min(bandStats.minAdBottles, adHelpers.adBottleCount);
    bandStats.maxAdBottles = Math.max(bandStats.maxAdBottles, adHelpers.adBottleCount);
    if (megaLevel != null) bandStats.megaBottle++;

    acceptedFingerprints.set(fingerprint, levelNumber);
    levelAccepted = true;
    break;
    }

    if (!levelAccepted) {
      throw new Error(`Unable to generate unique core gameplay / acceptable Special quality for level ${levelNumber} after ${maxDuplicateAttempts} attempts`
        + (lastRejectionReason == null ? "" : ` (last rejection: ${lastRejectionReason})`)
        + (lastDuplicateOf == null ? "" : ` (last duplicate of Level ${lastDuplicateOf})`));
    }
  }

  for (const module of solvedModules.values()) stats.maxVisitedStates = Math.max(stats.maxVisitedStates, module.visitedStates);
  if (!dryRun) {
    fs.writeFileSync(levelFile, JSON.stringify(levelPack, null, 2) + "\n", "utf8");
    fs.writeFileSync(solutionFile, JSON.stringify(solutionPack, null, 2) + "\n", "utf8");
  }
  console.log(JSON.stringify({ dryRun, written: dryRun ? null : { levels: path.relative(root, levelFile), solutions: path.relative(root, solutionFile) }, generationDiagnostics: adaptiveResolution.diagnostics, stats }, null, 2));
}

if (require.main === module) {
  main();
} else {
  module.exports = {
    readConfig,
    assignAestheticGridPositions,
    evaluateLayoutMetrics,
    hasTrivialNearCompleteColorSplit,
    moduleSizesForCapacity,
    moduleCountBounds,
    evaluateNormalDifficulty,
    analyzeDynamicMoveSafety,
    applyProfileWorkspacePressure,
    profileQualityRejection,
  };
}
