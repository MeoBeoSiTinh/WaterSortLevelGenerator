"use strict";

const fs = require("fs");
const path = require("path");
const { SolverMode, solveExhaustiveHidden, toSolutionData } = require("./watersort-exhaustive-solver");

const root = process.cwd();
const levelDir = path.join(root, "Assets/Project/Data/WaterSort/Resources/WaterSort");
const solutionDir = path.join(root, "Assets/Project/Data/WaterSort/Resources/WaterSortSolutions");

function readArg(name, fallback) {
  const prefix = `--${name}=`;
  const arg = process.argv.find(v => v.startsWith(prefix));
  if (arg == null) return fallback;
  const raw = arg.slice(prefix.length);
  const value = Number(raw);
  return Number.isFinite(value) ? value : raw;
}

function readBoolArg(name, fallback) {
  const value = readArg(name, fallback ? 1 : 0);
  if (typeof value === "number") return value !== 0;
  return !["false", "0", "no"].includes(String(value).toLowerCase());
}

function assertScoped(dir, expectedSuffix) {
  const resolved = path.resolve(dir);
  const expected = path.resolve(root, expectedSuffix);
  if (resolved !== expected) {
    throw new Error(`Refusing to access outside expected folder: ${resolved}`);
  }
}

function readLevelPacks() {
  const files = fs.readdirSync(levelDir)
    .filter(file => /^watersort-levels-\d{3}\.json$/.test(file))
    .sort();

  if (files.length === 0) {
    throw new Error(`No level packs found in ${levelDir}`);
  }

  return files.map(file => ({
    file,
    pack: JSON.parse(fs.readFileSync(path.join(levelDir, file), "utf8")),
  }));
}

function outputFileFor(levelFile) {
  return levelFile.replace(/^watersort-levels-/, "watersort-solutions-");
}

function blankSolutionData(selectionPolicy) {
  return {
    solutionCount: 0,
    shortestStepCount: 0,
    storedSolutionCount: 0,
    storesAllSolutions: false,
    selectionPolicy,
    solutions: [],
  };
}

function failedSolutionData(selectionPolicy, reason) {
  return {
    ...blankSolutionData(selectionPolicy),
    failureReason: reason,
  };
}

function readExistingOrBlankSolutionPack(levelFile, levelCount, packName, selectionPolicy) {
  const outFile = path.join(solutionDir, outputFileFor(levelFile));
  if (fs.existsSync(outFile)) {
    const existing = JSON.parse(fs.readFileSync(outFile, "utf8"));
    if (Array.isArray(existing.levelSolutions)) {
      const byLevel = new Map(existing.levelSolutions.map(entry => [entry.levelNumber, entry.solutionData]));
      return {
        packName: existing.packName || packName.replace("Levels", "Solutions"),
        levelSolutions: Array.from({ length: levelCount }, (_, i) => ({
          levelNumber: i + 1,
          solutionData: byLevel.get(i + 1) || blankSolutionData(selectionPolicy),
        })),
      };
    }
  }

  return {
    packName: packName.replace("Levels", "Solutions"),
    levelSolutions: Array.from({ length: levelCount }, (_, i) => ({
      levelNumber: i + 1,
      solutionData: blankSolutionData(selectionPolicy),
    })),
  };
}

function solvePack(levelFile, pack, options) {
  const solutionPack = readExistingOrBlankSolutionPack(
    levelFile,
    pack.levels.length,
    pack.packName,
    options.selectionPolicy,
  );

  const stats = {
    file: levelFile,
    levels: pack.levels.length,
    solved: 0,
    stateLimit: 0,
    depthLimit: 0,
    unsolvedExhausted: 0,
    invalid: 0,
    maxVisitedStates: 0,
    maxShortestStepCount: 0,
  };

  const levelFrom = Math.max(1, options.levelFrom);
  const levelTo = Math.min(pack.levels.length, options.levelTo);

  for (let index = levelFrom - 1; index <= levelTo - 1; index++) {
    const level = pack.levels[index];
    const capacity = level.bottles[0]?.capacity ?? 4;
    const board = level.bottles.map(bottle => bottle.colorsBottomToTop.slice());
    if (options.progress) {
      console.error(`Solving ${levelFile} level ${index + 1}/${pack.levels.length}`);
    }
    let result;
    try {
      result = solveExhaustiveHidden(board, capacity, options);
    } catch (error) {
      stats.invalid++;
      solutionPack.levelSolutions[index] = {
        levelNumber: index + 1,
        solutionData: failedSolutionData(options.selectionPolicy, error instanceof Error ? error.message : String(error)),
      };
      continue;
    }

    if (result.status === "solved") stats.solved++;
    else if (result.status === "state_limit" || result.status === "limit") stats.stateLimit++;
    else if (result.status === "depth_limit") stats.depthLimit++;
    else if (result.status === "unsolved_exhausted") stats.unsolvedExhausted++;

    stats.maxVisitedStates = Math.max(stats.maxVisitedStates, result.visitedStates);
    stats.maxShortestStepCount = Math.max(stats.maxShortestStepCount, result.shortestStepCount);

    solutionPack.levelSolutions[index] = {
      levelNumber: index + 1,
      solutionData: toSolutionData(result),
    };
  }

  return { solutionPack, stats };
}

function main() {
  assertScoped(levelDir, "Assets/Project/Data/WaterSort/Resources/WaterSort");
  assertScoped(solutionDir, "Assets/Project/Data/WaterSort/Resources/WaterSortSolutions");

  const options = {
    mode: readArg("mode", SolverMode.Optimal),
    maxDepth: readArg("maxDepth", 120),
    maxStates: readArg("maxStates", 200000),
    maxExpandedStates: readArg("maxExpandedStates", readArg("maxStates", 200000)),
    maxSearchTimeMs: readArg("maxSearchTimeMs", 0),
    sampleLimit: readArg("sampleLimit", 3),
    maxSolutions: readArg("maxSolutions", readArg("sampleLimit", 3)),
    maxExtraMoves: readArg("maxExtraMoves", 0),
    fastWeight: readArg("fastWeight", 1.4),
    manySolutionThreshold: readArg("manySolutionThreshold", 10),
    levelFrom: readArg("levelFrom", 1),
    levelTo: readArg("levelTo", Number.MAX_SAFE_INTEGER),
    progress: readBoolArg("progress", true),
    write: readBoolArg("write", true),
    skipCompletedSource: readBoolArg("skipCompletedSource", true),
    skipSymmetricEmptyMoves: readBoolArg("skipSymmetricEmptyMoves", true),
    canonicalizeBottleSymmetry: readBoolArg("canonicalizeBottleSymmetry", true),
    canonicalizeColorSymmetry: readBoolArg("canonicalizeColorSymmetry", false),
    useLowerBoundPruning: readBoolArg("useLowerBoundPruning", false),
    useIdaStar: readBoolArg("useIdaStar", false),
    runFastFirst: readBoolArg("runFastFirst", true),
    proveOptimalAfterFast: readBoolArg("proveOptimalAfterFast", true),
    selectionPolicy: readArg("selectionPolicy", "exhaustive_bfs_hidden_stack_shortest_non_loop"),
  };

  if (String(options.mode).toLowerCase() === "fast" && options.selectionPolicy === "exhaustive_bfs_hidden_stack_shortest_non_loop") {
    options.selectionPolicy = "fast_weighted_astar_hidden_stack_replay_validated_not_global_shortest";
  }

  fs.mkdirSync(solutionDir, { recursive: true });

  const summaries = [];
  for (const { file, pack } of readLevelPacks()) {
    const { solutionPack, stats } = solvePack(file, pack, options);
    if (options.write) {
      fs.writeFileSync(
        path.join(solutionDir, outputFileFor(file)),
        JSON.stringify(solutionPack, null, 2) + "\n",
        "utf8",
      );
    }
    summaries.push(stats);
  }

  console.log(JSON.stringify({ options, summaries }, null, 2));
}

main();
