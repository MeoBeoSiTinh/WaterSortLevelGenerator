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
const levelDir = path.join(root, "Assets/Project/Data/WaterSort/Resources/WaterSort");
const solutionDir = path.join(root, "Assets/Project/Data/WaterSort/Resources/WaterSortSolutions");
const configPath = path.join(root, "Assets/Project/Data/WaterSort/Generation/WaterSortGenerationConfig.asset");
const paletteSize = 13;

const packIndex = parsePackIndex(process.argv[2] ?? process.env.WATERSORT_PACK_INDEX ?? "1");
const packId = String(packIndex).padStart(3, "0");
const levelFile = path.join(levelDir, `watersort-levels-${packId}.json`);
const solutionFile = path.join(solutionDir, `watersort-solutions-${packId}.json`);

function parsePackIndex(value) {
  const pack = Number(value);
  if (!Number.isInteger(pack) || pack < 1 || pack > 999) {
    throw new Error(`Invalid Water Sort pack index: ${value}`);
  }
  return pack;
}

function assertScoped(dir, expectedSuffix) {
  const resolved = path.resolve(dir);
  const expected = path.resolve(root, expectedSuffix);
  if (resolved !== expected) throw new Error(`Refusing to write outside expected folder: ${resolved}`);
}

function readConfig() {
  const text = fs.readFileSync(configPath, "utf8");
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

  const bands = [];
  const parts = text.split(/\n  - name: /).slice(1);
  for (const part of parts) {
    const name = part.split(/\r?\n/, 1)[0].trim();
    const get = (key, fallback) => {
      const match = part.match(new RegExp(`^    ${key}:\\s*(.+)$`, "m"));
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
    bands.push({
      name,
      levelCount: get("levelCount", Math.max(1, levelTo - levelFrom + 1)),
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
      minTargetBottleCount: get("minTargetBottleCount", 4),
      maxTargetBottleCount: get("maxTargetBottleCount", 50),
      minShortestStepCount: get("minShortestStepCount", 8),
      maxShortestStepCount: get("maxShortestStepCount", 80),
      maxSolutionCount: get("maxSolutionCount", 1000000),
    });
  }

  return {
    levelsPerPack: top("levelsPerPack", 100),
    solutionExampleLimitWhenMany: top("solutionExampleLimitWhenMany", 3),
    manySolutionThreshold: top("manySolutionThreshold", 10),
    defaultBottleCapacity: top("defaultBottleCapacity", 4),
    layoutGridColumns: top("layoutGridColumns", 8),
    layoutGridRows: top("layoutGridRows", 8),
    preferredMinEmptyBottleCount: top("preferredMinEmptyBottleCount", 1),
    preferredMaxEmptyBottleCount: top("preferredMaxEmptyBottleCount", 3),
    maxBottleCount: top("maxBottleCount", 50),
    selectionPolicy: String(top("selectionPolicy", "shortest_non_loop_empty_priority_opening_diversity_soft")),
    bands,
  };
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
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
    const denseChance = String(band.name || "").toLowerCase() === "main" ? 100 : 70;
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
  const bandName = String(band.name || "").toLowerCase();
  if (bandName === "tutorial" || bottleCount < 9) return shape;

  const chance = bandName === "main" ? 55 : 35;
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
  const bandName = String(band.name || "").toLowerCase();
  if (bandName === "tutorial" || bottleCount < 9) return shape;

  const chance = bandName === "main" ? 18 : 30;
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
  let hash = levelNumber * 2166136261;
  for (let i = 0; i < shape.length; i++) {
    hash ^= shape.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function validateBandLevelCount(config) {
  const total = config.bands.reduce((sum, band) => sum + Math.max(1, band.levelCount), 0);
  if (total !== config.levelsPerPack) {
    throw new Error(`difficultyBands levelCount total (${total}) must equal levelsPerPack (${config.levelsPerPack})`);
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

function bandFor(config, levelNumber) {
  let end = 0;
  for (const band of config.bands) {
    end += Math.max(1, band.levelCount);
    if (levelNumber <= end) return band;
  }
  return config.bands[config.bands.length - 1];
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

function reliefProfileFor(band, levelNumber) {
  const lowerName = band.name.toLowerCase();
  if (lowerName !== "main") {
    return {
      name: "normal",
      stepMin: band.minShortestStepCount,
      stepMax: band.maxShortestStepCount,
      bottleMin: band.minTargetBottleCount,
      bottleMax: band.maxTargetBottleCount,
      storedSolutionTarget: 1,
    };
  }

  const span = Math.max(0, band.maxShortestStepCount - band.minShortestStepCount);
  const phase = levelNumber % 5;
  if (phase === 0) {
    return {
      name: "relief",
      stepMin: band.minShortestStepCount,
      stepMax: band.minShortestStepCount + Math.floor(span * 0.35),
      bottleMin: band.minTargetBottleCount,
      bottleMax: band.maxTargetBottleCount,
      storedSolutionTarget: 3,
    };
  }

  if (phase === 3) {
    return {
      name: "medium",
      stepMin: band.minShortestStepCount + Math.floor(span * 0.2),
      stepMax: band.minShortestStepCount + Math.floor(span * 0.65),
      bottleMin: band.minTargetBottleCount,
      bottleMax: band.maxTargetBottleCount,
      storedSolutionTarget: 2,
    };
  }

  return {
    name: "hard",
    stepMin: band.minShortestStepCount + Math.floor(span * 0.45),
    stepMax: band.maxShortestStepCount,
    bottleMin: band.minTargetBottleCount,
    bottleMax: band.maxTargetBottleCount,
    storedSolutionTarget: 1,
  };
}

function recipeStepCount(recipe, solvedModules) {
  return recipe.modules.reduce((sum, moduleColorCount) => {
    const solvedModule = solvedModules.get(`${recipe.capacity}:${moduleColorCount}`);
    return sum + (solvedModule?.solutions[0]?.length ?? recipe.estimatedSteps);
  }, 0);
}

function chooseRecipe(config, band, profile, capacity, maxModuleCount, solvedModules, random) {
  const desiredColorCount = weighted(random, band.colorWeights, 9);
  const minBottles = Math.min(profile.bottleMin, config.maxBottleCount);
  const maxBottles = Math.min(profile.bottleMax, config.maxBottleCount);
  const desiredBottleCount = randomInt(random, minBottles, maxBottles);
  const desiredStepCount = randomInt(random, profile.stepMin, profile.stepMax);

  let candidates = recipesForCapacity(capacity, maxModuleCount, config.maxBottleCount)
    .map(recipe => ({ recipe, stepCount: recipeStepCount(recipe, solvedModules) }))
    .filter(candidate =>
      candidate.recipe.bottles >= minBottles &&
      candidate.recipe.bottles <= maxBottles &&
      candidate.recipe.modules.length >= config.preferredMinEmptyBottleCount &&
      candidate.recipe.modules.length <= config.preferredMaxEmptyBottleCount &&
      candidate.stepCount >= profile.stepMin &&
      candidate.stepCount <= profile.stepMax);

  if (candidates.length === 0) throw new Error(`No modular recipe fits band ${band.name}/${profile.name} capacity ${capacity}`);

  const picked = candidates
    .map(candidate => ({
      recipe: candidate.recipe,
      score: Math.abs(candidate.recipe.bottles - desiredBottleCount) * 2 + Math.abs(candidate.stepCount - desiredStepCount) + Math.abs(Math.min(candidate.recipe.colors, paletteSize) - desiredColorCount) * 1.5 + random() * 0.01,
    }))
    .sort((left, right) => left.score - right.score)[0].recipe;
  return { recipe: picked, desiredDistinctColors: desiredColorCount };
}

function createColorMapper(levelNumber) {
  const random = rng(0xC0102 ^ Math.imul(levelNumber, 1597334677));
  const palette = shuffle(Array.from({ length: paletteSize }, (_, i) => i), random);
  return color => palette[color % paletteSize];
}

function buildComposedLevel(recipe, solvedModules, levelNumber, storedSolutionTarget) {
  const random = rng(0xB0771E ^ Math.imul(levelNumber, 3812015801));
  const board = [];
  const moduleMoveSets = [];
  let bottleOffset = 0;
  let colorOffset = 0;

  for (const moduleColorCount of recipe.modules) {
    const solvedModule = solvedModules.get(`${recipe.capacity}:${moduleColorCount}`);
    for (const bottle of solvedModule.board) {
      board.push(bottle.map(color => color + colorOffset));
    }
    const localMoves = solvedModule.solutions[levelNumber % solvedModule.solutions.length];
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
  orders.push(shuffle(baseOrder, rng(0x501A710A ^ Math.imul(levelNumber, 1103515245))));
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

function removeOldJsonPacks() {
  for (const [dir, rx] of [[levelDir, /^watersort-levels-\d{3}\.json$/], [solutionDir, /^watersort-solutions-\d{3}\.json$/]]) {
    for (const file of fs.readdirSync(dir)) if (rx.test(file)) fs.rmSync(path.join(dir, file));
  }
}

function main() {
  assertScoped(levelDir, "Assets/Project/Data/WaterSort/Resources/WaterSort");
  assertScoped(solutionDir, "Assets/Project/Data/WaterSort/Resources/WaterSortSolutions");
  fs.mkdirSync(levelDir, { recursive: true });
  fs.mkdirSync(solutionDir, { recursive: true });

  const config = readConfig();
  validateBandLevelCount(config);
  const dryRun = process.env.WATERSORT_GENERATOR_DRY_RUN === "1";
  const solvedModules = new Map();
  const capacities = Array.from(new Set(
    config.bands
      .flatMap(band => band.capacityWeights.length ? band.capacityWeights.filter(row => row.weight > 0).map(row => row.value) : [config.defaultBottleCapacity])
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
  const stats = { levels: 0, hiddenStack: 0, hybridHiddenStack: 0, lockedBottles: 0, byBand: {}, minStep: Infinity, maxStep: 0, minBottles: Infinity, maxBottles: 0, minEmpty: Infinity, maxEmpty: 0, maxVisitedStates: 0 };

  for (let localLevelNumber = 1; localLevelNumber <= config.levelsPerPack; localLevelNumber++) {
    const levelNumber = levelOffset + localLevelNumber;
    const band = bandFor(config, localLevelNumber);
    const random = rng(0x1EAF0000 ^ Math.imul(levelNumber, 2246822519));
    const profile = reliefProfileFor(band, levelNumber);
    const maxModuleCount = Math.max(config.preferredMinEmptyBottleCount, config.preferredMaxEmptyBottleCount);
    const preferredCapacity = capacityFor(config, band, random);
    let capacity = preferredCapacity;
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
    const { board, solutionMoveLists } = buildComposedLevel(recipe, solvedModules, levelNumber, profile.storedSolutionTarget);
    const shape = applyAlternatingGapPreference(
      applyDenseLayoutPreference(chooseShapeForBottleCount(band, board.length, levelNumber), band, board.length, levelNumber),
      band,
      board.length,
      levelNumber);
    const hybridHiddenStack = band.allowHybridHiddenStackMode && random() < band.hybridHiddenStackChance;
    const hiddenStack = !hybridHiddenStack && band.allowHiddenStackMode && random() < band.hiddenStackChance;
    const hybridHiddenLayers = hybridHiddenStack ? buildHybridHiddenLayers(board, band, random) : board.map(() => []);
    const gridPositions = assignGridPositions(board, shape, config);
    let lockedBottles = chooseLockedBottles(board, capacity, solutionMoveLists[0], band, random);
    let validSolutionMoveLists = solutionMoveLists.filter(candidateMoves => replaySolutionWithLocks(board, capacity, candidateMoves, lockedBottles));
    if (lockedBottles.length > 0 && validSolutionMoveLists.length === 0) {
      lockedBottles = [];
      validSolutionMoveLists = solutionMoveLists;
    }
    const lockedByBottle = new Map(lockedBottles.map(lockedBottle => [lockedBottle.index, lockedBottle.unlockCompletedBottleCount]));
    const moves = validSolutionMoveLists[0];
    if (board.length > config.maxBottleCount) throw new Error(`Bad bottle count at level ${levelNumber}: ${board.length}`);
    if (moves.length < band.minShortestStepCount || moves.length > band.maxShortestStepCount) throw new Error(`Bad step count at level ${levelNumber}: ${moves.length} for band ${band.name}`);
    if (hasCapacityRepeat(board, capacity)) throw new Error(`Capacity repeat at level ${levelNumber}`);
    for (const candidateMoves of validSolutionMoveLists) {
      if (!replaySolution(board, capacity, candidateMoves)) throw new Error(`Invalid constructed solution at level ${levelNumber}`);
      if (!replaySolutionWithLocks(board, capacity, candidateMoves, lockedBottles)) throw new Error(`Invalid locked solution at level ${levelNumber}`);
    }

    const stepCount = moves.length;
    const modeSuffix = `${hiddenStack ? "hidden" : hybridHiddenStack ? "hybrid_hidden" : "normal"}${lockedBottles.length > 0 ? "_locked" : ""}`;
    const solutionData = {
      solutionCount: validSolutionMoveLists.length,
      shortestStepCount: stepCount,
      storedSolutionCount: validSolutionMoveLists.length,
      storesAllSolutions: false,
      selectionPolicy: `${config.selectionPolicy}_${modeSuffix}_modular_constructed_validated_from_exhaustive_pruned_canonical_modules_not_global_shortest`,
      solutions: validSolutionMoveLists.map(candidateMoves => ({ stepCount: candidateMoves.length, moves: candidateMoves })),
    };
    levelPack.levels.push({
      displayName: `Level ${levelNumber}`,
      layoutGrid: { columns: config.layoutGridColumns, rows: config.layoutGridRows, shape },
      modeOptions: { hiddenStack, hybridHiddenStack, lockedBottles: lockedBottles.length > 0 },
      bottles: board.map((colorsBottomToTop, index) => {
        const bottle = { capacity, colorsBottomToTop, gridPosition: gridPositions[index] };
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
    stats.minStep = Math.min(stats.minStep, stepCount);
    stats.maxStep = Math.max(stats.maxStep, stepCount);
    stats.minBottles = Math.min(stats.minBottles, board.length);
    stats.maxBottles = Math.max(stats.maxBottles, board.length);
    const emptyCount = board.filter(bottle => bottle.length === 0).length;
    stats.minEmpty = Math.min(stats.minEmpty, emptyCount);
    stats.maxEmpty = Math.max(stats.maxEmpty, emptyCount);
    const bandStats = stats.byBand[band.name] ??= { count: 0, relief: 0, medium: 0, hard: 0, normal: 0, minStep: Infinity, maxStep: 0, minBottles: Infinity, maxBottles: 0, minEmpty: Infinity, maxEmpty: 0 };
    bandStats.count++;
    bandStats[profile.name]++;
    bandStats.minStep = Math.min(bandStats.minStep, stepCount);
    bandStats.maxStep = Math.max(bandStats.maxStep, stepCount);
    bandStats.minBottles = Math.min(bandStats.minBottles, board.length);
    bandStats.maxBottles = Math.max(bandStats.maxBottles, board.length);
    bandStats.minEmpty = Math.min(bandStats.minEmpty, emptyCount);
    bandStats.maxEmpty = Math.max(bandStats.maxEmpty, emptyCount);
  }

  for (const module of solvedModules.values()) stats.maxVisitedStates = Math.max(stats.maxVisitedStates, module.visitedStates);
  if (!dryRun) {
    fs.writeFileSync(levelFile, JSON.stringify(levelPack, null, 2) + "\n", "utf8");
    fs.writeFileSync(solutionFile, JSON.stringify(solutionPack, null, 2) + "\n", "utf8");
  }
  console.log(JSON.stringify({ dryRun, written: dryRun ? null : { levels: path.relative(root, levelFile), solutions: path.relative(root, solutionFile) }, stats }, null, 2));
}

main();
