# Water Sort Level Generator V2 Epics

## EPIC 1 - Rule Engine and Validation

Create the canonical board model, unified move legality, exact mode-aware replay, independent pack validator, regression fixtures, and config/spec consistency checks. This epic protects current generated data before generator behavior is refactored.

Stories:
- 1.1 Canonical board model for normal, hidden, hybrid hidden, locked, mega, and ad bottles.
- 1.2 Unified `getLegalPour` and `applyMove` rules with per-bottle capacity and mode state.
- 1.3 `replayLevelSolution(level, solution)` derived only from level JSON and solution JSON.
- 1.4 Independent `validate-pack` CLI with structural checks, mode checks, ad-bottle checks, and replay checks.
- 1.5 Regression tests for valid/invalid fixtures and deterministic baseline packs.
- 1.6 Config/spec audit that rejects 8x8 grids, >40 bottles, normal capacity outside 2-5, and mega capacity outside 12-20.

## EPIC 2 - Generator Architecture

Move the current monolithic modular generator into `Tools/WaterSortGenerator/` one subsystem at a time while preserving deterministic output where possible.

Stories:
- 2.1 Extract config reader and seedable RNG.
- 2.2 Extract shape/layout selection and grid assignment.
- 2.3 Extract mode selection and mode metadata application.
- 2.4 Extract `ModularSafeGenerator` as the guaranteed-solvable fallback.
- 2.5 Add generation CLI that validates candidates independently before writing packs.
- 2.6 Add benchmark CLI for deterministic seed performance tracking.

## EPIC 3 - Level Quality

Improve candidate selection after validation is trustworthy.

Stories:
- 3.1 Difficulty metrics with shortest/known steps, branching, fragmentation, buried depth, helper pressure, lock pressure, hidden information, mega dependency, visited states, and dead-end indicators.
- 3.2 Stage-configurable normalized difficulty scoring.
- 3.3 Structural fingerprinting and duplicate/similarity rejection across generated packs.
- 3.4 Global scramble generator from certified solved states with solve/replay verification.
- 3.5 Mega Generator V2 with central mega placement, buried target layers, blocker rearrangement, helper dependency, and exact mega replay.

## EPIC 4 - Unity Tooling

Improve designer access after backend generation and validation are stable.

Stories:
- 4.1 Generator window under `Tools > Water Sort` with pack index, seed, level count, generate, validate, and benchmark actions.
- 4.2 Generation summary with mode counts, step ranges, bottle ranges, duplicates, and invalid counts.
- 4.3 Single-level edit flow that marks or regenerates stale stored solutions after gameplay-affecting edits.
- 4.4 Optional level preview and solution replay preview for designer inspection.
