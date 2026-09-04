const fs = require("fs");
const path = require("path");
const { solveExhaustiveHidden, toSolutionData } = require("./watersort-exhaustive-solver");

const root = process.cwd();
const levelDir = path.join(root, "Assets/Project/Data/WaterSort/Resources/WaterSort");
const solutionDir = path.join(root, "Assets/Project/Data/WaterSort/Resources/WaterSortSolutions");
const configPath = path.join(root, "Assets/Project/Data/WaterSort/Generation/WaterSortGenerationConfig.asset");

function assertScoped(dir, expectedSuffix) {
  const resolved = path.resolve(dir);
  const expected = path.resolve(root, expectedSuffix);
  if (resolved !== expected) {
    throw new Error(`Refusing to write outside expected folder: ${resolved}`);
  }
}

assertScoped(levelDir, "Assets/Project/Data/WaterSort/Resources/WaterSort");
assertScoped(solutionDir, "Assets/Project/Data/WaterSort/Resources/WaterSortSolutions");

function readConfig() {
  const text = fs.readFileSync(configPath, "utf8");
  const top = (name, fallback) => {
    const m = text.match(new RegExp(`^  ${name}:\\s*(.+)$`, "m"));
    if (!m) return fallback;
    const v = m[1].trim();
    if (v === "1") return true;
    if (v === "0") return false;
    const n = Number(v);
    return Number.isFinite(n) ? n : v;
  };

  const bands = [];
  const parts = text.split(/\n  - name: /).slice(1);
  for (const part of parts) {
    const name = part.split(/\r?\n/, 1)[0].trim();
    const get = (key, fallback) => {
      const m = part.match(new RegExp(`^    ${key}:\\s*(.+)$`, "m"));
      return m ? Number(m[1].trim()) : fallback;
    };
    const parseWeights = (sectionName, valueName) => {
      const section = part.match(new RegExp(`^    ${sectionName}:\\r?\\n([\\s\\S]*?)(?=^    \\w|\\z)`, "m"));
      if (!section) return [];
      const rows = [];
      const rx = new RegExp(`^    - ${valueName}:\\s*(\\d+)\\r?\\n      weight:\\s*(\\d+)`, "gm");
      let m;
      while ((m = rx.exec(section[1])) !== null) {
        rows.push({ value: Number(m[1]), weight: Number(m[2]) });
      }
      return rows;
    };
    const levelFrom = get("levelFrom", 1);
    const levelTo = get("levelTo", levelFrom);
    bands.push({
      name,
      levelCount: get("levelCount", Math.max(1, levelTo - levelFrom + 1)),
      capacityWeights: parseWeights("bottleCapacityWeights", "capacity"),
      minTargetBottleCount: get("minTargetBottleCount", 1),
      maxTargetBottleCount: get("maxTargetBottleCount", 1),
      minShortestStepCount: get("minShortestStepCount", 1),
      maxShortestStepCount: get("maxShortestStepCount", 1),
      maxSolutionCount: get("maxSolutionCount", 1000),
      colorWeights: parseWeights("colorWeights", "colorCount"),
      helperWeights: parseWeights("helperCapacityWeights", "helperCapacity"),
    });
  }

  return {
    levelsPerPack: top("levelsPerPack", 100),
    solutionExampleLimitWhenMany: top("solutionExampleLimitWhenMany", 3),
    manySolutionThreshold: top("manySolutionThreshold", 10),
    defaultBottleCapacity: top("defaultBottleCapacity", 4),
    noEmptyStartingBottleChance: top("noEmptyStartingBottleChance", 0.15),
    preferredMinEmptyBottleCount: top("preferredMinEmptyBottleCount", 1),
    preferredMaxEmptyBottleCount: top("preferredMaxEmptyBottleCount", 3),
    maxDuplicateBottleTargetsPerColor: top("maxDuplicateBottleTargetsPerColor", 6),
    maxBottleCount: top("maxBottleCount", 30),
    diverseOpeningSolutionChance: top("diverseOpeningSolutionChance", 0.35),
    diverseOpeningMoveWindow: top("diverseOpeningMoveWindow", 4),
    diverseOpeningMinDistinctSourceBottles: top("diverseOpeningMinDistinctSourceBottles", 3),
    diverseOpeningMinStoredSolutions: top("diverseOpeningMinStoredSolutions", 2),
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

function int(r, min, max) {
  return min + Math.floor(r() * (max - min + 1));
}

function weighted(r, rows, fallback) {
  const total = rows.reduce((sum, x) => sum + Math.max(0, x.weight), 0);
  if (total <= 0) return fallback;
  let roll = r() * total;
  for (const row of rows) {
    roll -= Math.max(0, row.weight);
    if (roll <= 0) return row.value;
  }
  return rows[rows.length - 1].value;
}

function bandFor(config, levelNumber) {
  let end = 0;
  for (const band of config.bands) {
    end += Math.max(1, band.levelCount);
    if (levelNumber <= end) return band;
  }
  return config.bands[config.bands.length - 1];
}

function capacityFor(config, band, random) {
  return Math.max(2, Math.min(5, weighted(random, band.capacityWeights, config.defaultBottleCapacity)));
}

function validateBandLevelCount(config) {
  const total = config.bands.reduce((sum, band) => sum + Math.max(1, band.levelCount), 0);
  if (total !== config.levelsPerPack) {
    throw new Error(`difficultyBands levelCount total (${total}) must equal levelsPerPack (${config.levelsPerPack})`);
  }
}

function readEnvInt(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) ? value : fallback;
}

function readExhaustiveSolverOptions(config) {
  return {
    enabled: process.env.WATERSORT_SOLVE_EXHAUSTIVE === "1",
    maxDepth: readEnvInt("WATERSORT_SOLVER_MAX_DEPTH", 120),
    maxStates: readEnvInt("WATERSORT_SOLVER_MAX_STATES", 200000),
    sampleLimit: config.solutionExampleLimitWhenMany,
    manySolutionThreshold: config.manySolutionThreshold,
    selectionPolicy: "exhaustive_bfs_hidden_stack_shortest_non_loop",
    skipCompletedSource: process.env.WATERSORT_SOLVER_SKIP_COMPLETED_SOURCE === "1",
    skipSymmetricEmptyMoves: process.env.WATERSORT_SOLVER_SKIP_SYMMETRIC_EMPTY_MOVES === "1",
    canonicalizeBottleSymmetry: process.env.WATERSORT_SOLVER_CANONICALIZE_SYMMETRY === "1",
    canonicalizeColorSymmetry: process.env.WATERSORT_SOLVER_CANONICALIZE_COLORS === "1",
    useLowerBoundPruning: process.env.WATERSORT_SOLVER_USE_LOWER_BOUND === "1",
  };
}

function cloneState(state) {
  return state.map(b => b.slice());
}

function key(state) {
  return state.map(b => b.join(".")).join("|");
}

function isSolved(state, cap) {
  return state.every(b => b.length === 0 || (b.length === cap && b.every(c => c === b[0])));
}

function isFullMonoBottle(bottle, cap) {
  return bottle.length === cap && bottle.every(c => c === bottle[0]);
}

function topGroup(bottle) {
  if (bottle.length === 0) return null;
  const color = bottle[bottle.length - 1];
  let count = 1;
  for (let i = bottle.length - 2; i >= 0 && bottle[i] === color; i--) count++;
  return { color, count };
}

function legalPour(state, from, to, cap) {
  if (from === to) return null;
  const src = state[from];
  const dst = state[to];
  if (src.length === 0 || dst.length >= cap) return null;
  const group = topGroup(src);
  if (dst.length > 0 && dst[dst.length - 1] !== group.color) return null;
  const amount = Math.min(group.count, cap - dst.length);
  if (amount <= 0) return null;
  return { color: group.color, amount };
}

function makeHiddenState(state) {
  return {
    colors: cloneState(state),
    unlocked: state.map(b => b.map((_, i) => i === b.length - 1)),
  };
}

function isSolvedHidden(hidden, cap) {
  return isSolved(hidden.colors, cap);
}

function legalHiddenPour(hidden, from, to, cap) {
  if (from === to) return null;
  const src = hidden.colors[from];
  const dst = hidden.colors[to];
  if (src.length === 0 || dst.length >= cap) return null;
  if (!hidden.unlocked[from][src.length - 1]) return null;
  const color = src[src.length - 1];
  if (dst.length > 0 && dst[dst.length - 1] !== color) return null;
  let amount = 0;
  for (let i = src.length - 1; i >= 0; i--) {
    if (!hidden.unlocked[from][i] || src[i] !== color) break;
    amount++;
  }
  amount = Math.min(amount, cap - dst.length);
  return amount > 0 ? { color, amount } : null;
}

function applyHiddenPour(hidden, move, cap) {
  const pour = legalHiddenPour(hidden, move.from, move.to, cap);
  if (!pour) return false;
  const src = hidden.colors[move.from];
  const dst = hidden.colors[move.to];
  const srcUnlocked = hidden.unlocked[move.from];
  const dstUnlocked = hidden.unlocked[move.to];
  for (let i = 0; i < pour.amount; i++) {
    dst.push(src.pop());
    dstUnlocked.push(true);
    srcUnlocked.pop();
  }
  if (src.length > 0) {
    srcUnlocked[src.length - 1] = true;
  }
  return true;
}

function applyPour(state, move, cap) {
  const pour = legalPour(state, move.from, move.to, cap);
  if (!pour) return false;
  const src = state[move.from];
  const dst = state[move.to];
  for (let i = 0; i < pour.amount; i++) dst.push(src.pop());
  return true;
}

function inverseCandidates(state, cap) {
  const out = [];
  for (let from = 0; from < state.length; from++) {
    const src = state[from];
    if (src.length === 0) continue;
    const group = topGroup(src);
    for (let to = 0; to < state.length; to++) {
      if (from === to || state[to].length >= cap) continue;
      const free = cap - state[to].length;
      const maxAmount = Math.min(1, group.count, free);
      for (let amount = 1; amount <= maxAmount; amount++) {
        const targetTop = state[to].length ? state[to][state[to].length - 1] : -1;
        let score = targetTop !== -1 && targetTop !== group.color ? 4 : 1;
        if (state[to].length === 0) score -= 0.2;
        out.push({ from, to, amount, color: group.color, score });
      }
    }
  }
  return out;
}

function applyInverse(state, move) {
  const src = state[move.from];
  const dst = state[move.to];
  if (src.length < move.amount) return false;
  for (let i = 0; i < move.amount; i++) {
    const c = src.pop();
    if (c !== move.color) return false;
    dst.push(c);
  }
  return true;
}

function validateSolution(start, solution, cap) {
  const hidden = makeHiddenState(start);
  for (const move of solution) {
    if (!applyHiddenPour(hidden, move, cap)) return false;
  }
  return isSolvedHidden(hidden, cap);
}

function bottleRepeatScore(bottle, cap) {
  const positionsByColor = new Map();
  for (let i = 0; i < bottle.length; i++) {
    const color = bottle[i];
    if (!positionsByColor.has(color)) positionsByColor.set(color, []);
    positionsByColor.get(color).push(i);
  }

  let score = 0;
  let hasCapacityRepeat = false;
  let tripleCount = 0;
  for (const positions of positionsByColor.values()) {
    if (positions.length >= cap) {
      hasCapacityRepeat = true;
      score += 100000;
      continue;
    }

    if (positions.length === 1) continue;

    let adjacentPairs = 0;
    for (let i = 1; i < positions.length; i++) {
      if (positions[i] === positions[i - 1] + 1) adjacentPairs++;
    }

    if (positions.length === 2) {
      score += adjacentPairs === 0 ? 10 : 30;
    } else if (positions.length === 3) {
      tripleCount++;
      score += 100 + adjacentPairs * 25;
    } else {
      score += 500 + adjacentPairs * 50;
    }
  }

  return { score, hasCapacityRepeat, tripleCount };
}

function layoutRepeatScore(state, cap) {
  let score = 0;
  let hasCapacityRepeat = false;
  let tripleCount = 0;
  for (const bottle of state) {
    const metrics = bottleRepeatScore(bottle, cap);
    score += metrics.score;
    hasCapacityRepeat ||= metrics.hasCapacityRepeat;
    tripleCount += metrics.tripleCount;
  }
  return { score, hasCapacityRepeat, tripleCount };
}

function rebalanceLayoutColors(state, r) {
  const lengths = state.map(b => b.length);
  const counts = new Map();
  for (const bottle of state) {
    for (const color of bottle) {
      counts.set(color, (counts.get(color) || 0) + 1);
    }
  }

  const result = lengths.map(() => []);
  for (let bottleIndex = 0; bottleIndex < result.length; bottleIndex++) {
    const targetLength = lengths[bottleIndex];
    for (let slot = 0; slot < targetLength; slot++) {
      const bottle = result[bottleIndex];
      const previous = bottle.length > 0 ? bottle[bottle.length - 1] : null;
      const options = Array.from(counts.entries())
        .filter(([, count]) => count > 0)
        .map(([color, count]) => {
          let penalty = 0;
          if (bottle.includes(color)) penalty += 1000;
          if (previous === color) penalty += 200;
          penalty -= count;
          penalty += r() * 0.01;
          return { color, penalty };
        })
        .sort((a, b) => a.penalty - b.penalty);

      const picked = options[0].color;
      bottle.push(picked);
      counts.set(picked, counts.get(picked) - 1);
    }
  }

  return result;
}

function buildVariant(start, base, cap, r) {
  const remaining = base.map((m, i) => ({ ...m, id: i }));
  const hidden = makeHiddenState(start);
  const out = [];
  while (remaining.length) {
    const legal = [];
    for (let i = 0; i < remaining.length; i++) {
      if (legalHiddenPour(hidden, remaining[i].from, remaining[i].to, cap)) legal.push(i);
    }
    if (!legal.length) return null;
    const pick = legal[int(r, 0, legal.length - 1)];
    const move = remaining.splice(pick, 1)[0];
    if (!applyHiddenPour(hidden, move, cap)) return null;
    out.push({ from: move.from, to: move.to });
  }
  return isSolvedHidden(hidden, cap) ? out : null;
}

function makeLevel(levelNumber, config) {
  const band = bandFor(config, levelNumber);
  const failures = {};
  let best = null;
  const fail = reason => {
    failures[reason] = (failures[reason] || 0) + 1;
  };
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = rng(0xC0FFEE ^ (levelNumber * 10007) ^ attempt);
    const cap = capacityFor(config, band, r);
    let colorCount = weighted(r, band.colorWeights, 9);
    const desiredSteps = int(r, band.minShortestStepCount, band.maxShortestStepCount);
    if (desiredSteps < band.minTargetBottleCount) {
      fail("steps_below_min_target");
      continue;
    }
    const helperCapacity = weighted(r, band.helperWeights, 8);
    const helperBottles = Math.max(1, Math.ceil(helperCapacity / cap));
    const targetMax = Math.max(
      band.minTargetBottleCount,
      Math.min(band.maxTargetBottleCount, config.maxBottleCount - helperBottles, desiredSteps));
    let targetBottleCount = int(r, band.minTargetBottleCount, targetMax);
    colorCount = Math.min(colorCount, targetBottleCount);

    const ownership = Array(colorCount).fill(1);
    for (let extra = targetBottleCount - colorCount; extra > 0; extra--) {
      const candidates = ownership.map((v, i) => ({ v, i })).filter(x => x.v < config.maxDuplicateBottleTargetsPerColor);
      const picked = candidates.length ? candidates[int(r, 0, candidates.length - 1)].i : ownership.indexOf(Math.min(...ownership));
      ownership[picked]++;
    }

    const state = [];
    for (let color = 0; color < colorCount; color++) {
      for (let i = 0; i < ownership[color]; i++) state.push(Array(cap).fill(color));
    }
    for (let i = 0; i < helperBottles; i++) state.push([]);

    const seen = new Set([key(state)]);
    const undo = [];
    let current = cloneState(state);

    for (let step = 0; step < desiredSteps; step++) {
      let candidates = inverseCandidates(current, cap)
        .filter(m => {
          const tmp = cloneState(current);
          applyInverse(tmp, m);
          if (seen.has(key(tmp))) return false;
          return true;
        });
      const fullMonoSources = candidates.filter(m => isFullMonoBottle(current[m.from], cap));
      if (fullMonoSources.length) {
        candidates = fullMonoSources;
        const nonMatchingTargets = candidates.filter(m => {
          const dst = current[m.to];
          return dst.length === 0 || dst[dst.length - 1] !== m.color;
        });
        if (nonMatchingTargets.length) {
          candidates = nonMatchingTargets;
        }
      }
      if (undo.length) {
        const last = undo[undo.length - 1];
        candidates = candidates.filter(m => !(m.from === last.from && m.to === last.to));
      }
      if (!candidates.length) break;
      const total = candidates.reduce((sum, m) => sum + m.score, 0);
      let roll = r() * total;
      let picked = candidates[candidates.length - 1];
      for (const c of candidates) {
        roll -= c.score;
        if (roll <= 0) {
          picked = c;
          break;
        }
      }
      applyInverse(current, picked);
      seen.add(key(current));
      undo.push({ from: picked.to, to: picked.from });
    }

    if (undo.length !== desiredSteps) {
      fail("short_scramble");
      continue;
    }
    current = rebalanceLayoutColors(current, r);
    const solution = undo.slice().reverse();
    const repeatMetrics = layoutRepeatScore(current, cap);
    if (repeatMetrics.hasCapacityRepeat) {
      fail("capacity_repeat");
      continue;
    }
    if (isSolved(current, cap)) {
      fail("solved_start");
      continue;
    }
    if (!hasAnyOpeningMove(current, cap)) {
      fail("no_opening_move");
      continue;
    }

    const result = {
      level: {
        displayName: `Level ${levelNumber}`,
        bottles: current.map(b => ({ capacity: cap, colorsBottomToTop: b })),
      },
      solutionData: {
        solutionCount: 0,
        shortestStepCount: 0,
        storedSolutionCount: 0,
        storesAllSolutions: false,
        selectionPolicy: config.selectionPolicy,
        solutions: [],
      },
      summary: { levelNumber, band: band.name, cap, bottles: current.length, colorCount, targetBottleCount, plannedSteps: solution.length, repeatScore: repeatMetrics.score, triples: repeatMetrics.tripleCount },
    };

    if (best == null || result.summary.repeatScore < best.summary.repeatScore) {
      best = result;
    }

    if (repeatMetrics.score <= Math.max(40, current.length * 8)) {
      return result;
    }
  }
  if (best != null) {
    return best;
  }
  throw new Error(`Failed to generate level ${levelNumber}: ${JSON.stringify(failures)}`);
}

function uniqueSolutions(solutions) {
  const out = [];
  for (const moves of solutions) {
    const sig = moves.map(m => `${m.from}>${m.to}`).join(",");
    if (!out.some(v => v.sig === sig)) out.push({ sig, moves });
  }
  return out;
}

function openingDiversityScore(moves, config) {
  return new Set(moves.slice(0, config.diverseOpeningMoveWindow).map(m => m.from)).size;
}

function hasAnyOpeningMove(state, cap) {
  const hidden = makeHiddenState(state);
  for (let from = 0; from < state.length; from++) {
    for (let to = 0; to < state.length; to++) {
      if (legalHiddenPour(hidden, from, to, cap)) return true;
    }
  }
  return false;
}

function removeOldPacks() {
  for (const [dir, rx] of [
    [levelDir, /^watersort-levels-\d{3}\.json$/],
    [solutionDir, /^watersort-solutions-\d{3}\.json$/],
  ]) {
    for (const file of fs.readdirSync(dir)) {
      if (rx.test(file)) fs.rmSync(path.join(dir, file));
    }
  }
}

function validatePacks(levelPack, solutionPack) {
  if (levelPack.levels.length !== 100) throw new Error("Expected 100 levels");
  if (solutionPack.levelSolutions.length !== 100) throw new Error("Expected 100 solution entries");
  for (let i = 0; i < 100; i++) {
    const level = levelPack.levels[i];
    const sol = solutionPack.levelSolutions[i].solutionData;
    if (solutionPack.levelSolutions[i].levelNumber !== i + 1) throw new Error(`Bad levelNumber ${i + 1}`);
    if (level.bottles.length > 30) throw new Error(`Level ${i + 1} exceeds bottle cap`);
    for (const b of level.bottles) {
      if (b.capacity < 2 || b.capacity > 5) throw new Error(`Bad capacity on level ${i + 1}`);
      if (b.colorsBottomToTop.length > b.capacity) throw new Error(`Overfilled bottle on level ${i + 1}`);
      if (b.colorsBottomToTop.some(c => !Number.isInteger(c) || c < 0)) throw new Error(`Bad color index on level ${i + 1}`);
      if (bottleRepeatScore(b.colorsBottomToTop, b.capacity).hasCapacityRepeat) throw new Error(`Capacity repeat on level ${i + 1}`);
    }
    if (sol.storedSolutionCount !== sol.solutions.length) throw new Error(`Bad stored count on level ${i + 1}`);
    for (const s of sol.solutions) {
      if (s.stepCount !== s.moves.length) throw new Error(`Bad step count on level ${i + 1}`);
      const cap = level.bottles[0].capacity;
      const moves = s.moves.map(m => ({ from: m.fromBottle - 1, to: m.toBottle - 1 }));
      if (!validateSolution(level.bottles.map(b => b.colorsBottomToTop), moves, cap)) {
        throw new Error(`Invalid solution path on level ${i + 1}`);
      }
    }
  }
}

const config = readConfig();
validateBandLevelCount(config);
const exhaustiveSolver = readExhaustiveSolverOptions(config);
const levelPack = { packName: "Water Sort Levels 001", levels: [] };
const solutionPack = { packName: "Water Sort Solutions 001", levelSolutions: [] };
const summaries = [];

for (let levelNumber = 1; levelNumber <= config.levelsPerPack; levelNumber++) {
  const result = makeLevel(levelNumber, config);
  if (exhaustiveSolver.enabled) {
    const cap = result.level.bottles[0]?.capacity ?? config.defaultBottleCapacity;
    const board = result.level.bottles.map(bottle => bottle.colorsBottomToTop);
    const solved = solveExhaustiveHidden(board, cap, exhaustiveSolver);
    result.solutionData = toSolutionData(solved);
    result.summary.solverStatus = solved.status;
    result.summary.shortestStepCount = solved.shortestStepCount;
    result.summary.solutionCount = solved.solutionCount;
    result.summary.visitedStates = solved.visitedStates;
  }
  levelPack.levels.push(result.level);
  solutionPack.levelSolutions.push({ levelNumber, solutionData: result.solutionData });
  summaries.push(result.summary);
}

validatePacks(levelPack, solutionPack);
removeOldPacks();
fs.writeFileSync(path.join(levelDir, "watersort-levels-001.json"), JSON.stringify(levelPack, null, 2) + "\n", "utf8");
fs.writeFileSync(path.join(solutionDir, "watersort-solutions-001.json"), JSON.stringify(solutionPack, null, 2) + "\n", "utf8");

const byBand = {};
for (const s of summaries) {
  byBand[s.band] ??= { count: 0, minPlannedSteps: Infinity, maxPlannedSteps: 0, minBottles: Infinity, maxBottles: 0, maxTriples: 0 };
  const b = byBand[s.band];
  b.count++;
  b.minPlannedSteps = Math.min(b.minPlannedSteps, s.plannedSteps);
  b.maxPlannedSteps = Math.max(b.maxPlannedSteps, s.plannedSteps);
  b.minBottles = Math.min(b.minBottles, s.bottles);
  b.maxBottles = Math.max(b.maxBottles, s.bottles);
  b.maxTriples = Math.max(b.maxTriples, s.triples);
}

console.log(JSON.stringify({ writtenLevels: 100, exhaustiveSolver, byBand }, null, 2));
