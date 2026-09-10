"use strict";

const SolverMode = Object.freeze({
  Fast: "Fast",
  Optimal: "Optimal",
  MultipleSolutions: "MultipleSolutions",
});

const BOTTLE_BITS = 40n;
const COLOR_BITS = 5n;
const LENGTH_SHIFT = 25n;
const UNLOCK_SHIFT = 30n;
const BOTTLE_MASK = (1n << BOTTLE_BITS) - 1n;

class MinHeap {
  constructor() {
    this.items = [];
  }

  get length() {
    return this.items.length;
  }

  push(item) {
    const items = this.items;
    items.push(item);
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (items[parent].priority <= item.priority) break;
      items[index] = items[parent];
      index = parent;
    }
    items[index] = item;
  }

  pop() {
    const items = this.items;
    if (items.length === 0) return null;
    const root = items[0];
    const last = items.pop();
    if (items.length > 0) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= items.length) break;
        let child = left;
        if (right < items.length && items[right].priority < items[left].priority) child = right;
        if (items[child].priority >= last.priority) break;
        items[index] = items[child];
        index = child;
      }
      items[index] = last;
    }
    return root;
  }
}

function normalizeMode(mode) {
  if (mode === SolverMode.Fast || mode === "fast") return SolverMode.Fast;
  if (mode === SolverMode.MultipleSolutions || mode === "multiple" || mode === "Multiple") return SolverMode.MultipleSolutions;
  return SolverMode.Optimal;
}

function normalizeOptions(options = {}) {
  return {
    mode: normalizeMode(options.mode),
    maxDepth: Number.isInteger(options.maxDepth) ? options.maxDepth : 120,
    maxStates: Number.isInteger(options.maxStates) ? options.maxStates : 200000,
    maxExpandedStates: Number.isInteger(options.maxExpandedStates) ? options.maxExpandedStates : (Number.isInteger(options.maxStates) ? options.maxStates : 200000),
    maxSearchTimeMs: Number.isInteger(options.maxSearchTimeMs) ? options.maxSearchTimeMs : 0,
    maxSolutions: Number.isInteger(options.maxSolutions) ? options.maxSolutions : (Number.isInteger(options.sampleLimit) ? options.sampleLimit : 3),
    sampleLimit: Number.isInteger(options.sampleLimit) ? options.sampleLimit : 3,
    manySolutionThreshold: Number.isInteger(options.manySolutionThreshold) ? options.manySolutionThreshold : 10,
    maxExtraMoves: Number.isInteger(options.maxExtraMoves) ? options.maxExtraMoves : 0,
    fastWeight: typeof options.fastWeight === "number" && options.fastWeight > 1 ? options.fastWeight : 1.4,
    memoryAStarStateThreshold: Number.isInteger(options.memoryAStarStateThreshold) ? options.memoryAStarStateThreshold : 120000,
    skipCompletedSource: options.skipCompletedSource !== false,
    skipSymmetricEmptyMoves: options.skipSymmetricEmptyMoves !== false,
    canonicalizeBottleSymmetry: options.canonicalizeBottleSymmetry !== false,
    canonicalizeColorSymmetry: options.canonicalizeColorSymmetry === true,
    useLowerBoundPruning: options.useLowerBoundPruning === true,
    useIdaStar: options.useIdaStar === true,
    proveOptimalAfterFast: options.proveOptimalAfterFast === true,
    initialUpperBound: Number.isInteger(options.initialUpperBound) ? options.initialUpperBound : Infinity,
    initialSolutions: Array.isArray(options.initialSolutions) ? options.initialSolutions : [],
    selectionPolicy: options.selectionPolicy || "hybrid_water_sort_solver",
  };
}

function validateInputBoard(board, capacity) {
  if (!Array.isArray(board)) throw new Error("WaterSort solver input board must be an array of bottles.");
  if (!Number.isInteger(capacity) || capacity <= 0 || capacity > 5) throw new Error(`Unsupported bottle capacity: ${capacity}`);
  if (board.length <= 0 || board.length > 30) throw new Error(`Unsupported bottle count: ${board.length}`);
  const counts = new Map();
  for (let i = 0; i < board.length; i++) {
    const bottle = board[i];
    if (!Array.isArray(bottle)) throw new Error(`Bottle ${i + 1} must be an array.`);
    if (bottle.length > capacity) throw new Error(`Bottle ${i + 1} exceeds capacity ${capacity}.`);
    for (let j = 0; j < bottle.length; j++) {
      const color = bottle[j];
      if (!Number.isInteger(color) || color < 0 || color > 31) throw new Error(`Invalid color ${color} at bottle ${i + 1}, layer ${j + 1}.`);
      counts.set(color, (counts.get(color) || 0) + 1);
    }
  }
  for (const [color, count] of counts) {
    if (count % capacity !== 0) throw new Error(`Color ${color} appears ${count} times, not divisible by capacity ${capacity}.`);
  }
}

function cloneBoard(board) {
  const out = new Array(board.length);
  for (let i = 0; i < board.length; i++) out[i] = board[i].slice();
  return out;
}

function makeInitialHiddenState(board) {
  const colors = cloneBoard(board);
  const unlockedMasks = new Uint32Array(board.length);
  for (let i = 0; i < board.length; i++) {
    unlockedMasks[i] = topRevealMask(board[i]);
  }
  return { colors, unlockedMasks };
}

function topRevealMask(colors) {
  const length = colors.length;
  if (length === 0) return 0;
  const topColor = colors[length - 1];
  let mask = 0;
  for (let i = length - 1; i >= 0; i--) {
    if (colors[i] !== topColor) break;
    mask |= 1 << i;
  }
  return mask;
}

function revealMaskAfterRemoval(previousMask, colors) {
  if (colors.length === 0) return 0;
  return (previousMask & ((1 << colors.length) - 1)) | topRevealMask(colors);
}

function packBottle(colors, unlockedMask) {
  let code = BigInt(colors.length) << LENGTH_SHIFT;
  code |= BigInt(unlockedMask & 31) << UNLOCK_SHIFT;
  for (let i = 0; i < colors.length; i++) code |= BigInt(colors[i] & 31) << (COLOR_BITS * BigInt(i));
  return code;
}

function stateKey(state, options) {
  const n = state.colors.length;
  const codes = new Array(n);
  for (let i = 0; i < n; i++) codes[i] = packBottle(state.colors[i], state.unlockedMasks[i]);
  if (options.canonicalizeBottleSymmetry || options.canonicalizeColorSymmetry) {
    codes.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }
  if (options.canonicalizeColorSymmetry) {
    return colorCanonicalKeyFromBottleCodes(codes);
  }

  let key = 0n;
  for (let i = 0; i < n; i++) key = (key << BOTTLE_BITS) | (codes[i] & BOTTLE_MASK);
  return key;
}

function colorCanonicalKeyFromBottleCodes(codes) {
  const colorMap = new Int16Array(32);
  colorMap.fill(-1);
  let nextColor = 0;
  let key = 0n;
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    const length = Number((code >> LENGTH_SHIFT) & 31n);
    const unlocked = Number((code >> UNLOCK_SHIFT) & 31n);
    let remapped = BigInt(length) << LENGTH_SHIFT;
    remapped |= BigInt(unlocked) << UNLOCK_SHIFT;
    for (let layer = 0; layer < length; layer++) {
      const color = Number((code >> (COLOR_BITS * BigInt(layer))) & 31n);
      if (colorMap[color] < 0) colorMap[color] = nextColor++;
      remapped |= BigInt(colorMap[color]) << (COLOR_BITS * BigInt(layer));
    }
    key = (key << BOTTLE_BITS) | (remapped & BOTTLE_MASK);
  }
  return key;
}

function isSolvedBottle(bottle, capacity) {
  if (bottle.length === 0) return true;
  if (bottle.length !== capacity) return false;
  const color = bottle[0];
  for (let i = 1; i < bottle.length; i++) if (bottle[i] !== color) return false;
  return true;
}

function isSolvedState(state, capacity) {
  for (let i = 0; i < state.colors.length; i++) if (!isSolvedBottle(state.colors[i], capacity)) return false;
  return true;
}

function isCompletedFullBottle(state, bottleIndex, capacity) {
  const bottle = state.colors[bottleIndex];
  return bottle.length === capacity && isSolvedBottle(bottle, capacity);
}

function isVisibleCompleteBottle(state, bottleIndex, capacity) {
  if (!isCompletedFullBottle(state, bottleIndex, capacity)) return false;
  const bottle = state.colors[bottleIndex];
  return (state.unlockedMasks[bottleIndex] & ((1 << bottle.length) - 1)) === ((1 << bottle.length) - 1);
}

function topUnlockedGroup(state, bottleIndex) {
  const bottle = state.colors[bottleIndex];
  const length = bottle.length;
  if (length === 0) return null;
  const topIndex = length - 1;
  if ((state.unlockedMasks[bottleIndex] & (1 << topIndex)) === 0) return null;
  const color = bottle[topIndex];
  let amount = 0;
  for (let i = topIndex; i >= 0; i--) {
    if ((state.unlockedMasks[bottleIndex] & (1 << i)) === 0 || bottle[i] !== color) break;
    amount++;
  }
  return amount > 0 ? { color, amount } : null;
}

function legalHiddenPour(state, from, to, capacity) {
  if (from === to) return null;
  const source = state.colors[from];
  const target = state.colors[to];
  if (source.length === 0 || target.length >= capacity) return null;
  const group = topUnlockedGroup(state, from);
  if (group == null) return null;
  if (target.length > 0 && target[target.length - 1] !== group.color) return null;
  const amount = Math.min(group.amount, capacity - target.length);
  return amount > 0 ? { color: group.color, amount } : null;
}

function applyKnownPour(state, from, to, capacity, pour) {
  const colors = state.colors.slice();
  const unlockedMasks = new Uint32Array(state.unlockedMasks);
  const source = colors[from].slice();
  const target = colors[to].slice();
  const targetStartLength = target.length;

  for (let i = 0; i < pour.amount; i++) target.push(source.pop());
  colors[from] = source;
  colors[to] = target;

  unlockedMasks[from] = revealMaskAfterRemoval(state.unlockedMasks[from], source);
  unlockedMasks[to] = (state.unlockedMasks[to] | (((1 << pour.amount) - 1) << targetStartLength)) & 31;
  return { colors, unlockedMasks };
}

function applyHiddenPour(state, from, to, capacity) {
  const pour = legalHiddenPour(state, from, to, capacity);
  if (pour == null) return null;
  return applyKnownPour(state, from, to, capacity, pour);
}

function estimateRemainingMoves(state, capacity) {
  let unresolvedNonEmpty = 0;
  for (let i = 0; i < state.colors.length; i++) {
    const bottle = state.colors[i];
    if (bottle.length > 0 && !isSolvedBottle(bottle, capacity)) unresolvedNonEmpty++;
  }
  return Math.ceil(unresolvedNonEmpty / 2);
}

function countColorBlocks(state) {
  let blocks = 0;
  const seenColors = new Uint8Array(32);
  let colorCount = 0;
  for (let i = 0; i < state.colors.length; i++) {
    const bottle = state.colors[i];
    let previous = -1;
    for (let j = 0; j < bottle.length; j++) {
      const color = bottle[j];
      if (seenColors[color] === 0) {
        seenColors[color] = 1;
        colorCount++;
      }
      if (color !== previous) {
        blocks++;
        previous = color;
      }
    }
  }
  return { blocks, colorCount };
}

function admissibleHeuristic(state, capacity) {
  return estimateRemainingMoves(state, capacity);
}

function fastHeuristic(state, capacity) {
  const blockData = countColorBlocks(state);
  let mixed = 0;
  let partial = 0;
  for (let i = 0; i < state.colors.length; i++) {
    const bottle = state.colors[i];
    if (bottle.length > 0 && !isSolvedBottle(bottle, capacity)) mixed++;
    if (bottle.length > 0 && bottle.length < capacity) partial++;
  }
  return Math.max(0, blockData.blocks - blockData.colorCount) + mixed * 0.75 + partial * 0.2;
}

function moveKey(move) {
  return `${move.fromBottle}>${move.toBottle}`;
}

function movesSignature(moves) {
  let out = "";
  for (let i = 0; i < moves.length; i++) {
    if (i > 0) out += ",";
    out += moveKey(moves[i]);
  }
  return out;
}

function isWholeMonoSourceMove(state, from, amount, color) {
  const source = state.colors[from];
  if (source.length !== amount) return false;
  for (let i = 0; i < source.length; i++) if (source[i] !== color) return false;
  return true;
}

function countHiddenSlots(state, bottleIndex) {
  const bottle = state.colors[bottleIndex];
  const mask = state.unlockedMasks[bottleIndex];
  let hidden = 0;
  for (let i = 0; i < bottle.length; i++) if ((mask & (1 << i)) === 0) hidden++;
  return hidden;
}

function moveRevealsHiddenGroup(state, from, amount) {
  const source = state.colors[from];
  if (source.length <= amount) return false;
  const oldMask = state.unlockedMasks[from];
  const newSource = source.slice(0, source.length - amount);
  const newMask = revealMaskAfterRemoval(oldMask, newSource);
  return (newMask & ~oldMask) !== 0;
}

function enumerateMoves(state, capacity, options, previousMove) {
  const moves = [];
  const seenDestinations = new Set();
  const bottleCount = state.colors.length;
  for (let from = 0; from < bottleCount; from++) {
    if (options.skipCompletedSource && isVisibleCompleteBottle(state, from, capacity)) continue;
    const group = topUnlockedGroup(state, from);
    if (group == null) continue;
    const source = state.colors[from];
    for (let to = 0; to < bottleCount; to++) {
      if (from === to) continue;
      const target = state.colors[to];
      if (target.length >= capacity) continue;
      if (target.length > 0 && target[target.length - 1] !== group.color) continue;
      const pour = { color: group.color, amount: Math.min(group.amount, capacity - target.length) };
      if (pour.amount <= 0) continue;
      if (previousMove && previousMove.fromBottle === to + 1 && previousMove.toBottle === from + 1) continue;

      if (options.skipSymmetricEmptyMoves && target.length === 0 && isWholeMonoSourceMove(state, from, pour.amount, pour.color)) continue;

      const targetCode = packBottle(target, state.unlockedMasks[to]);
      const destinationSignature = (BigInt(pour.color & 31) << BOTTLE_BITS) | targetCode;
      if (seenDestinations.has(destinationSignature)) continue;
      seenDestinations.add(destinationSignature);

      const sourceWillEmpty = source.length === pour.amount;
      const completesTarget = target.length + pour.amount === capacity;
      const exposes = source.length > pour.amount ? source[source.length - pour.amount - 1] : -1;
      const revealsHiddenGroup = moveRevealsHiddenGroup(state, from, pour.amount);
      moves.push({
        from,
        to,
        amount: pour.amount,
        color: pour.color,
        sourceWillEmpty,
        completesTarget,
        joinsSameColor: target.length > 0,
        exposesUsefulColor: exposes === pour.color,
        revealsHiddenGroup,
        hiddenSlotsBefore: countHiddenSlots(state, from),
        score: 0,
      });
    }
  }

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    move.score =
      (move.completesTarget ? -100 : 0) +
      (move.joinsSameColor ? -40 : 20) +
      (move.revealsHiddenGroup ? -30 : 0) +
      (move.exposesUsefulColor ? -12 : 0) +
      (move.sourceWillEmpty ? -8 : 0) -
      move.amount;
  }
  moves.sort((a, b) => a.score - b.score || a.from - b.from || a.to - b.to);
  return moves;
}

function reconstructSolution(nodes, nodeIndex) {
  const moves = [];
  let current = nodeIndex;
  while (current > 0) {
    const node = nodes[current];
    moves.push({ fromBottle: node.move.from + 1, toBottle: node.move.to + 1 });
    current = node.parent;
  }
  moves.reverse();
  return { stepCount: moves.length, moves };
}

function baseResult(status, options, startedAt, bestSolutions, isOptimal, visitedStates, expandedStates, maxFrontier) {
  const elapsedMs = Date.now() - startedAt;
  const solutions = bestSolutions.slice(0, Math.max(1, options.maxSolutions));
  const bestLength = solutions.length > 0 ? solutions[0].stepCount : 0;
  return {
    status,
    success: solutions.length > 0,
    isOptimal,
    exhausted: isOptimal,
    elapsedMs,
    visitedStates,
    expandedStates,
    maxFrontier,
    solutionCount: solutions.length,
    shortestStepCount: bestLength,
    storedSolutionCount: solutions.length,
    storesAllSolutions: isOptimal &&
      options.mode === SolverMode.MultipleSolutions &&
      solutions.length < options.maxSolutions &&
      solutions.length < options.manySolutionThreshold,
    selectionPolicy: options.selectionPolicy,
    solutions,
    solverKnowledgeMode: "full_internal_hidden_colors",
    containsUnknownInformation: false,
    requiresReplan: false,
  };
}

function shouldStopByLimits(options, startedAt, expandedStates, visitedStates) {
  if (options.maxSearchTimeMs > 0 && Date.now() - startedAt >= options.maxSearchTimeMs) return true;
  return expandedStates >= options.maxExpandedStates || visitedStates >= options.maxStates;
}

function solveBestFirst(board, capacity, inputOptions) {
  const options = normalizeOptions(inputOptions);
  const startedAt = Date.now();
  validateInputBoard(board, capacity);
  const initial = makeInitialHiddenState(board);
  if (isSolvedState(initial, capacity)) {
    return baseResult("solved", options, startedAt, [{ stepCount: 0, moves: [] }], true, 1, 0, 1);
  }

  const fastMode = options.mode === SolverMode.Fast;
  const multipleMode = options.mode === SolverMode.MultipleSolutions;
  const open = new MinHeap();
  const nodes = [{ state: initial, g: 0, parent: -1, move: null, previousMove: null }];
  const bestG = new Map();
  const initialKey = stateKey(initial, options);
  bestG.set(initialKey, 0);
  open.push({ priority: 0, nodeIndex: 0 });

  let visitedStates = 1;
  let expandedStates = 0;
  let maxFrontier = 1;
  let bestLength = options.initialUpperBound;
  const bestSolutions = options.initialSolutions.slice(0, Math.max(0, options.maxSolutions));
  const bestSignatures = new Set();
  for (let i = 0; i < bestSolutions.length; i++) bestSignatures.add(movesSignature(bestSolutions[i].moves));

  while (open.length > 0) {
    if (shouldStopByLimits(options, startedAt, expandedStates, visitedStates)) {
      return baseResult("limit", options, startedAt, bestSolutions, false, visitedStates, expandedStates, maxFrontier);
    }

    const queued = open.pop();
    const node = nodes[queued.nodeIndex];
    const nodeKey = stateKey(node.state, options);
    const nodeBestG = bestG.get(nodeKey);
    if (nodeBestG !== undefined && node.g > nodeBestG) continue;
    const h = fastMode ? fastHeuristic(node.state, capacity) : admissibleHeuristic(node.state, capacity);
    if (!fastMode && node.g + h > bestLength + options.maxExtraMoves) continue;
    expandedStates++;

    const moves = enumerateMoves(node.state, capacity, options, node.previousMove);
    for (let i = 0; i < moves.length; i++) {
      const move = moves[i];
      const nextG = node.g + 1;
      if (nextG > options.maxDepth || nextG > bestLength + options.maxExtraMoves) continue;

      const next = applyKnownPour(node.state, move.from, move.to, capacity, move);
      const nextH = fastMode ? fastHeuristic(next, capacity) : admissibleHeuristic(next, capacity);
      if (!fastMode && nextG + nextH > options.maxDepth) continue;
      if (!fastMode && nextG + nextH > bestLength + options.maxExtraMoves) continue;

      const key = stateKey(next, options);
      const knownG = bestG.get(key);
      if (knownG !== undefined && nextG > knownG) continue;
      if (knownG === undefined || nextG < knownG) {
        bestG.set(key, nextG);
        visitedStates++;
      } else if (!multipleMode) {
        continue;
      }

      const childIndex = nodes.length;
      nodes.push({ state: next, g: nextG, parent: queued.nodeIndex, move, previousMove: { fromBottle: move.from + 1, toBottle: move.to + 1 } });

      if (isSolvedState(next, capacity)) {
        const solution = reconstructSolution(nodes, childIndex);
        const signature = movesSignature(solution.moves);
        if (!bestSignatures.has(signature)) {
          bestSignatures.add(signature);
          if (solution.stepCount < bestLength) {
            bestLength = solution.stepCount;
            bestSolutions.length = 0;
          }
          if (solution.stepCount <= bestLength + options.maxExtraMoves) bestSolutions.push(solution);
          bestSolutions.sort((a, b) => a.stepCount - b.stepCount || diversityRank(b.moves, bestSolutions[0]?.moves) - diversityRank(a.moves, bestSolutions[0]?.moves));
        }
        if (fastMode) return baseResult("solved", options, startedAt, bestSolutions, false, visitedStates, expandedStates, maxFrontier);
        continue;
      }

      const f = fastMode ? nextG + options.fastWeight * nextH : nextG + nextH;
      const priority = f * 1000 + nextH * 10 + move.score * 0.001;
      open.push({ priority, nodeIndex: childIndex });
      if (open.length > maxFrontier) maxFrontier = open.length;
    }
  }

  return baseResult(bestSolutions.length > 0 ? "solved" : "unsolved_exhausted", options, startedAt, bestSolutions, !fastMode, visitedStates, expandedStates, maxFrontier);
}

function diversityRank(moves, baseline) {
  if (!baseline || baseline.length === 0) return 0;
  const limit = Math.min(moves.length, baseline.length);
  let different = Math.abs(moves.length - baseline.length);
  for (let i = 0; i < limit; i++) {
    if (moves[i].fromBottle !== baseline[i].fromBottle || moves[i].toBottle !== baseline[i].toBottle) different++;
  }
  return different;
}

function solveIdaStar(board, capacity, inputOptions) {
  const options = normalizeOptions({ ...inputOptions, mode: SolverMode.Optimal });
  const startedAt = Date.now();
  validateInputBoard(board, capacity);
  const initial = makeInitialHiddenState(board);
  if (isSolvedState(initial, capacity)) return baseResult("solved", options, startedAt, [{ stepCount: 0, moves: [] }], true, 1, 0, 1);

  let bound = admissibleHeuristic(initial, capacity);
  let expandedStates = 0;
  let visitedStates = 1;
  let bestSolution = null;
  const path = [];
  const pathKeys = new Set([stateKey(initial, options)]);

  function search(state, g, previousMove) {
    const h = admissibleHeuristic(state, capacity);
    const f = g + h;
    if (f > bound) return f;
    if (isSolvedState(state, capacity)) {
      bestSolution = { stepCount: path.length, moves: path.slice() };
      return "FOUND";
    }
    if (shouldStopByLimits(options, startedAt, expandedStates, visitedStates)) return Infinity;
    expandedStates++;
    let min = Infinity;
    const moves = enumerateMoves(state, capacity, options, previousMove);
    for (let i = 0; i < moves.length; i++) {
      const move = moves[i];
      const next = applyKnownPour(state, move.from, move.to, capacity, move);
      const key = stateKey(next, options);
      if (pathKeys.has(key)) continue;
      visitedStates++;
      pathKeys.add(key);
      path.push({ fromBottle: move.from + 1, toBottle: move.to + 1 });
      const result = search(next, g + 1, { fromBottle: move.from + 1, toBottle: move.to + 1 });
      if (result === "FOUND") return "FOUND";
      if (result < min) min = result;
      path.pop();
      pathKeys.delete(key);
    }
    return min;
  }

  while (bound <= options.maxDepth) {
    const result = search(initial, 0, null);
    if (result === "FOUND") return baseResult("solved", options, startedAt, [bestSolution], true, visitedStates, expandedStates, 1);
    if (result === Infinity || shouldStopByLimits(options, startedAt, expandedStates, visitedStates)) {
      return baseResult("limit", options, startedAt, bestSolution ? [bestSolution] : [], false, visitedStates, expandedStates, 1);
    }
    bound = result;
  }
  return baseResult("depth_limit", options, startedAt, bestSolution ? [bestSolution] : [], false, visitedStates, expandedStates, 1);
}

function solveWaterSort(board, capacity, options = {}) {
  const normalized = normalizeOptions(options);
  validateInputBoard(board, capacity);
  if (normalized.mode === SolverMode.Fast) return solveBestFirst(board, capacity, normalized);

  let boundedOptions = normalized;
  if (options.runFastFirst !== false) {
    const fast = solveBestFirst(board, capacity, { ...normalized, mode: SolverMode.Fast });
    if (fast.success && !normalized.proveOptimalAfterFast && options.mode === SolverMode.Fast) return fast;
    if (fast.success) {
      boundedOptions = normalizeOptions({
        ...normalized,
        initialUpperBound: fast.shortestStepCount,
        initialSolutions: fast.solutions,
      });
    }
  }

  if (boundedOptions.useIdaStar) return solveIdaStar(board, capacity, boundedOptions);
  return solveBestFirst(board, capacity, boundedOptions);
}

function solveExhaustiveHidden(board, capacity, options = {}) {
  return solveWaterSort(board, capacity, { ...options, mode: options.mode || SolverMode.Optimal });
}

function toSolutionData(result) {
  return {
    solutionCount: result.solutionCount,
    shortestStepCount: result.shortestStepCount,
    storedSolutionCount: result.storedSolutionCount,
    storesAllSolutions: result.storesAllSolutions,
    selectionPolicy: result.selectionPolicy,
    solutions: result.solutions,
  };
}

module.exports = {
  SolverMode,
  solveWaterSort,
  solveExhaustiveHidden,
  toSolutionData,
  makeInitialHiddenState,
  legalHiddenPour,
  applyHiddenPour,
  isSolvedState,
  estimateRemainingMoves,
  admissibleHeuristic,
  fastHeuristic,
  enumerateMoves,
  stateKey,
};
