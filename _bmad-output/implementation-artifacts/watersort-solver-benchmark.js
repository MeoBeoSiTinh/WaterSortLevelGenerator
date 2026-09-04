"use strict";

const { SolverMode, solveWaterSort } = require("./watersort-exhaustive-solver");

const cases = [
  {
    name: "small-known-shortest",
    capacity: 2,
    board: [[0, 1], [1, 0], [], []],
    options: { mode: SolverMode.Optimal, runFastFirst: false, maxDepth: 8, maxStates: 1000 },
  },
  {
    name: "hidden-heavy-reveal",
    capacity: 4,
    board: [[2, 1, 1, 1], [3, 2, 2, 1], [3, 3, 2, 0], [0, 0, 3, 0], [], []],
    options: { mode: SolverMode.Fast, maxDepth: 30, maxStates: 50000 },
  },
  {
    name: "symmetry-heavy",
    capacity: 4,
    board: [[0, 1, 2, 3], [3, 2, 1, 0], [0, 1, 2, 3], [3, 2, 1, 0], [], [], []],
    options: { mode: SolverMode.Fast, maxDepth: 50, maxStates: 80000 },
  },
];

const rows = [];
for (const item of cases) {
  const started = Date.now();
  const result = solveWaterSort(item.board, item.capacity, item.options);
  rows.push({
    name: item.name,
    status: result.status,
    success: result.success,
    optimal: result.isOptimal,
    moves: result.shortestStepCount,
    visited: result.visitedStates,
    expanded: result.expandedStates,
    maxFrontier: result.maxFrontier,
    elapsedMs: Date.now() - started,
  });
}

console.table(rows);
