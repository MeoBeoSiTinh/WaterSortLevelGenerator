# Level Generator V2 Implementation Report

## Phase 0 - Baseline and Safety

Files changed: generated `Assets/Project/Data/WaterSort/Resources/WaterSort/watersort-levels-003.json` and `Assets/Project/Data/WaterSort/Resources/WaterSortSolutions/watersort-solutions-003.json` with deterministic seed `123456`.

Behavior changed: no runtime or generator source behavior changed. A new baseline pack was added rather than overwriting existing packs `001` or `002`.

Tests added: none.

Tests executed:
- `node --check Assets/Project/Editor/WaterSort/LevelGeneration/Tools/generate-watersort-exhaustive-100.js`
- `node --check Assets/Project/Editor/WaterSort/LevelGeneration/Tools/watersort-exhaustive-solver.js`
- `node --check Assets/Project/Editor/WaterSort/LevelGeneration/Tools/solve-watersort-solutions.js`
- `node Assets/Project/Editor/WaterSort/LevelGeneration/Tools/generate-watersort-exhaustive-100.js 3 123456`
- `node Assets/Project/Editor/WaterSort/LevelGeneration/Tools/solve-watersort-solutions.js --levelFrom=1 --levelTo=100 --write=false --progress=false --mode=fast --maxStates=300000 --maxDepth=120`
- Focused inline JSON/replay spot-check for pack `003`.

Validation results:
- Baseline pack `003`: 100 levels and 100 solution entries.
- Generator stats: 19 full hidden, 27 hybrid hidden, 28 locked, 15 mega, 2-3 ad bottles per level, capacity distribution 3/4/5, max 33 bottles.
- Focused pack `003` spot-check found 0 duplicate grid positions, 0 out-of-grid bottles, 0 illegal capacities, 0 hidden/hybrid mode conflicts, 0 ad-bottle solution moves, and 0 basic stored-solution replay failures.
- Existing solver command is not an independent pack validator. In fast solve mode it reported invalid counts across packs: `001` = 22, `002` = 20, `003` = 19. The audit shows at least one cause is solver support drift: `watersort-exhaustive-solver.js` rejects non-mega boards above 30 bottles while the current spec/config allow up to 40.

Known limitations:
- The focused spot-check is not yet the canonical V2 validator and does not fully enforce hidden/locked replay semantics.
- Existing packs `001` and `002` were already modified before this phase and were not overwritten.
- Unity compilation was not run.

Next recommended phase: implement EPIC 1 story 1.1 through 1.4 before refactoring generator behavior.

## Phase 1 - Project Instructions

Files changed: `AGENTS.md`, `_bmad-output/project-context.md`, `_bmad-output/planning-artifacts/watersort-level-generator-v2-epics.md`, and this report.

Behavior changed: no runtime or generator source behavior changed.

Tests added: none.

Tests executed:
- Pending after file edits: `git diff --check`.

Validation results:
- Project instructions now identify the active production generator under `Assets/Project/Editor/WaterSort/LevelGeneration/Tools/`, mark `generate-watersort-100.js` as legacy/experimental, and capture capacity, grid, mode, ad-bottle, solution replay, and validation constraints.
- Project context was created because `_bmad-output/project-context.md` did not exist.
- BMAD epics/stories were created because no planning artifacts existed.

Known limitations:
- Portable package docs under `Assets/Project/Editor/WaterSort/LevelGeneration/` still refer to `Assets/LevelGenerator/...` paths for imported package use. The active project path is `Assets/Project/...`.

Next recommended phase: canonical board model and exact replay API.

## Mega Generator V2

Files changed:
- `Assets/Project/Editor/WaterSort/LevelGeneration/Tools/mega-generator-v2.js`
- `Assets/Project/Editor/WaterSort/LevelGeneration/Tools/generate-watersort-exhaustive-100.js`
- `Assets/Project/Editor/WaterSort/LevelGeneration/Tools/mega-generator-v2-tests.js`
- `Assets/Project/Editor/WaterSort/LevelGeneration/Tools/validate-pack.js`
- `Assets/Project/ScriptableObject/Script/WaterSort/WaterSortGenerationConfig.cs`
- `Assets/Project/Data/WaterSort/Generation/WaterSortGenerationConfig.asset`
- `Assets/Project/Data/WaterSort/Resources/WaterSort/watersort-levels-004.json`
- `Assets/Project/Data/WaterSort/Resources/WaterSortSolutions/watersort-solutions-004.json`

Behavior changed:
- Production Mega generation now uses Mega Generator V2.
- The old Mega builder remains in the generator file as `buildLegacyMegaLevel` for comparison/debugging, but it is not the normal production path.
- Mega V2 builds multiple deterministic candidates per level seed, statically validates them, solves them with a bounded target-directed Mega solver, exact-replays the representative solution, scores quality/diversity metrics, and selects the best accepted candidate.
- Generator fallback defaults for grid rows, max bottle count, per-band target bottle count, and mega capacity now match the current spec: 8x5 grid, max 40 bottles, mega capacity 12-20.

Config fields added per difficulty band:
- `megaCandidateAttemptCount`
- `minMegaActiveBottleCount`
- `maxMegaActiveBottleCount`
- `minMegaBlockerColorCount`
- `maxMegaBlockerColorCount`
- `minMegaNormalHelperCount`
- `maxMegaNormalHelperCount`
- `maxMegaTargetGroupSize`
- `minMegaBuriedTargetRatio`
- `minMegaDeepBuriedTargetRatio`
- `minMegaUniqueTopColorCount`
- `maxMegaTopColorShare`
- `minMegaUniqueBottlePatternRatio`
- `minMegaMovesBeforeFirstFill`
- `minMegaCrossBottleBlockerMoves`
- `minMegaNonMegaMoveRatio`
- `maxMegaConsecutiveFillMoves`
- `megaSolverMaxStates`
- `megaSolverMaxDepth`

Generation algorithm:
- Uses one central Mega bottle containing 1-2 visible target-color starter layers.
- Distributes exactly the remaining target-color layers across many normal bottles.
- Keeps target sources non-mono and buried under mixed blocker depths.
- Uses a balanced non-target blocker palette rather than one shared blocker color.
- Adds blocker-only bottles as non-empty same-color destinations, plus 1-2 normal helpers and 2-3 ad bottles through the existing ad-helper path.
- Rejects duplicate filled normal bottle patterns, excessive top-color concentration, insufficient buried/deep target ratios, early first Mega fill, low non-Mega move ratio, low cross-bottle blocker moves, long Mega-fill streaks, and repeated two-move template motifs.

Solver approach:
- Bounded target-directed solver.
- It only moves blocker groups that cover target layers, prefers non-empty same-color blocker destinations to create cross-bottle dependencies, and fills Mega only with exposed target groups.
- It does not prove global shortestness and labels solution data accordingly.
- Every accepted candidate passes `replayMegaSolutionExact`.

Validation added:
- `mega-generator-v2-tests.js` covers capacity, exact target count, illegal Mega source, illegal blocker-to-Mega move, ad exclusion after append, non-mono target sources, duplicate pattern rejection through generated structure, buried/deep target ratios, top-color diversity/share, exact replay, determinism, seed variation, template penalty, cross-bottle blocker moves, and 8x5/40-bottle limits.
- `validate-pack.js` provides independent pack JSON/static/replay validation for level and solution packs.

Tests executed:
- `node --check Assets/Project/Editor/WaterSort/LevelGeneration/Tools/mega-generator-v2.js`
- `node --check Assets/Project/Editor/WaterSort/LevelGeneration/Tools/mega-generator-v2-tests.js`
- `node --check Assets/Project/Editor/WaterSort/LevelGeneration/Tools/generate-watersort-exhaustive-100.js`
- `node --check Assets/Project/Editor/WaterSort/LevelGeneration/Tools/validate-pack.js`
- `node Assets/Project/Editor/WaterSort/LevelGeneration/Tools/mega-generator-v2-tests.js`
- `node _bmad-output/implementation-artifacts/watersort-solver-tests.js`
- `node Assets/Project/Editor/WaterSort/LevelGeneration/Tools/generate-watersort-exhaustive-100.js 4 123456`
- `node Assets/Project/Editor/WaterSort/LevelGeneration/Tools/validate-pack.js Assets/Project/Data/WaterSort/Resources/WaterSort/watersort-levels-004.json Assets/Project/Data/WaterSort/Resources/WaterSortSolutions/watersort-solutions-004.json`

Validation results:
- Pack `004`: 100 levels, 100 solution entries, 0 validator errors.
- Mega levels in pack `004`: 11.
- Mega capacity range in sampled pack: 15-20.
- Mega V2 generator stats: min moves before first Mega pour 3, max top color share 0.1875, min buried target ratio 1, min cross-bottle blocker moves 28, max consecutive Mega pours 3, max template penalty 1, max solver visited states 66.

Known limitations:
- Mega V2 solver is representative and target-directed; it does not prove global shortestness.
- `validate-pack.js` is intentionally focused and still reuses the existing normal hidden-stack replay path for non-Mega levels.
- Unity compilation was not run in this environment.

Next recommended phase:
- Extract the shared exact replay/rule-engine model so normal, hidden, hybrid, locked, mega, generator tests, and pack validation all use one canonical path.

## Rule and Package Update

Files changed:
- `agent-rules/watersort-level-generation.md`
- `Assets/Project/Editor/WaterSort/LevelGeneration/Docs/watersort-level-generation.md`
- `Assets/Project/Editor/WaterSort/LevelGeneration/README.md`
- `Assets/Project/Editor/WaterSort/LevelGeneration/AI_CONTEXT.md`
- `_bmad-output/implementation-artifacts/create-watersort-level-generation-package.js`
- `_bmad-output/unity-packages/WaterSortLevelGeneration.unitypackage`

Behavior changed:
- No runtime behavior changed.
- Project and package rules now document Mega Generator V2 as the production Mega path.
- Package README and AI context now include Mega V2 generation/validation commands.
- Package builder now includes `mega-generator-v2.js`, `mega-generator-v2-tests.js`, and `validate-pack.js`.

Tests executed:
- `node --check _bmad-output/implementation-artifacts/create-watersort-level-generation-package.js`
- `node --check Assets/Project/Editor/WaterSort/LevelGeneration/Tools/mega-generator-v2.js`
- `node --check Assets/Project/Editor/WaterSort/LevelGeneration/Tools/mega-generator-v2-tests.js`
- `node --check Assets/Project/Editor/WaterSort/LevelGeneration/Tools/validate-pack.js`
- `node --check Assets/Project/Editor/WaterSort/LevelGeneration/Tools/generate-watersort-exhaustive-100.js`
- `node _bmad-output/implementation-artifacts/create-watersort-level-generation-package.js`
- `node Assets/Project/Editor/WaterSort/LevelGeneration/Tools/mega-generator-v2-tests.js`
- `node Assets/Project/Editor/WaterSort/LevelGeneration/Tools/validate-pack.js Assets/Project/Data/WaterSort/Resources/WaterSort/watersort-levels-004.json Assets/Project/Data/WaterSort/Resources/WaterSortSolutions/watersort-solutions-004.json`
- `git diff --check`

Validation results:
- Rebuilt package: `_bmad-output/unity-packages/WaterSortLevelGeneration.unitypackage`
- Package contains 14 assets, including Mega V2, Mega V2 tests, and pack validator under `Assets/LevelGenerator/...`.
- Pack `004` remains valid: 100 levels, 100 solution entries, 0 errors.

Known limitations:
- A temporary extracted package inspection folder remains at `_bmad-output/package-check/` because recursive deletion commands were blocked by the command safety policy.
- Unity compilation was not run.
