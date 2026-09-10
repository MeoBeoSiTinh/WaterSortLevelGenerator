<!-- bmad:context -->
<!-- Verified 2026-08-27 against an unversioned workspace; no Git HEAD exists. Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## WaterSort

Unity 6000.3.10f1 project using URP 2D. BMAD configuration lives in `_bmad/`; generated planning and implementation artifacts belong in `_bmad-output/`.

## Policy

- Limit discovery to files required by the current task. Never enumerate or read `Library/`, `Logs/`, `Temp/`, `obj/`, `.idea/`, or `UserSettings/` unless the task explicitly requires them.
- Never scan `_bmad-output/` wholesale. Read only the current artifact explicitly referenced by the user or active BMAD workflow, and only the sections needed for the task.
- For a simple localized feature or function, use one lean cycle: inspect relevant files → implement the smallest coherent change → run focused verification → summarize concisely.
- When starting a new game or prototype, deliver a playable slice that can be tried in Unity or locally; if that cannot be verified, state the exact reason and the closest manual play-test path.
- Do not create PRDs, architecture documents, epics, stories, sprint plans, research tasks, or extra agents for simple changes unless explicitly requested or required by demonstrated risk or scope.
- Use only necessary tools. Prefer narrow `rg`/`rg --files` searches and targeted file reads; do not browse the web or load external context when repository evidence is sufficient.
- Apply linked rule files only when the task matches their trigger, and follow the smallest set of instructions, reads, edits, and verification steps that preserves code quality.
- For Unity UI creation, UI edits, prefab edits, or Figma/image-to-UI work, read `agent-rules/unity-ui.md` first.
- For game-wide state, win/lose, pause, restart, quit, level transition, scene transition, or manager structure work, read `agent-rules/game-flow.md` first.
- For Unity animation, tweening, particle/VFX, shader, material, or MMF feedback work, read `agent-rules/unity-animation-fx.md` first.
- For creating, editing, validating, or generating Water Sort level JSON, read `agent-rules/watersort-level-generation.md` first.
- For portable Level Lab packaging, localhost playtesting, or colleague generation without Unity, read `agent-rules/watersort-level-lab.md` first.
- Keep communication token-efficient: do not repeat the request, plans, unchanged context, code, or large tool outputs.
- Never trade correctness for brevity. Run the narrowest relevant test or compilation check available and state clearly what could not be verified.
- Do not introduce speculative abstractions, unrelated refactoring, or cleanup outside the requested scope.

## Where things are

- Game source and authored assets: `Assets/Project/`; organize by type folder and feature/function subfolders.
- Package dependencies: `Packages/manifest.json`
- Project configuration: `ProjectSettings/`; read only settings relevant to the task.
- Unity version: `ProjectSettings/ProjectVersion.txt`
- Portable Unity UI rules: `agent-rules/unity-ui.md`
- Portable Unity game flow rules: `agent-rules/game-flow.md`
- Portable Unity animation, FX, shader, tween, and MMF rules: `agent-rules/unity-animation-fx.md`
- Water Sort level generation rules: `agent-rules/watersort-level-generation.md`
- Water Sort Level Lab (portable generate + localhost WebGL playtest): `agent-rules/watersort-level-lab.md`

## Conventions that differ from defaults

- Put new authored Unity files under `Assets/Project/` instead of loose top-level `Assets/` folders.
- Use this folder structure under `Assets/Project/`:
  - `Script/Core/` for manager and shared infrastructure scripts.
  - `Script/Gameplay/` for gameplay logic scripts.
  - `Script/UI/` for UI and canvas scripts.
  - `ScriptableObject/Script/` for ScriptableObject definition scripts.
  - `ScriptableObject/Data/` for ScriptableObject asset data.
  - `Prefab/UI/` for UI prefabs.
  - `Prefab/Gameplay/` for gameplay prefabs.
- Prefer ScriptableObject configuration assets over hard-coded data for flexible authored content such as levels, attributes, colors, tuning values, and similar feature data; store ScriptableObject data assets under `Assets/Project/ScriptableObject/Data/`, not as mutable runtime state.
- Keep a `GameManager` for game-level flow/state; detailed game flow and manager rules live in `agent-rules/game-flow.md`.
- Keep gameplay mechanic code independent from UI; detailed Unity UI rules live in `agent-rules/unity-ui.md`.

<!-- /bmad:context -->

## Local Gameplay Feature Rules

- For interactive gameplay mechanics involving selection, validation, moving/transferring state, concurrency locks, undo, or animated action sequences, read `agent-rules/unity-gameplay-features.md` first.
- Treat `Assets/WaterSortPuzzleColorGame/` as a legacy reference implementation only. Reuse proven concepts selectively; keep newly authored files under `Assets/Project/`.
- `agent-rules/watersort-level-generation.md` is the local source of truth for Water Sort level generation, authoring, validation, and solvability rules.
- `agent-rules/watersort-level-lab.md` is the source of truth for the portable Level Lab used by colleagues without Unity.

### Water Sort Production Paths

- Production generator entry point: `Assets/Project/Editor/WaterSort/LevelGeneration/Tools/generate-watersort-exhaustive-100.js`.
- Treat modules used by the production entry point as production code. Keep the entry point thin; substantial generator, solver, rule, validation, or evaluation logic belongs in its appropriate module.
- `_bmad-output/implementation-artifacts/generate-watersort-exhaustive-100.js` is an implementation artifact copy, not production source.
- `generate-watersort-100.js` is legacy/experimental and must not be used as a source of truth unless explicitly requested.
- Runtime level JSON: `Assets/Project/Data/WaterSort/Resources/WaterSort/`.
- Runtime solution JSON: `Assets/Project/Data/WaterSort/Resources/WaterSortSolutions/`.
- Generation config: `Assets/Project/Data/WaterSort/Generation/WaterSortGenerationConfig.asset`.
- Water Sort palette assets live under `Assets/Project/Data/WaterSort/Resources/`.
- Portable Level Lab tooling: `Tools/LevelLab/` (server, generate wrapper, package, docs, tests).
- Packaged share output: `Builds/LevelLab/` after `node Tools/LevelLab/package.js Builds/WebGL Builds/LevelLab`.
- Owner WebGL player for Lab: `Builds/WebGL/` (must include `level-lab-build.json`).

### Level Lab

- Colleagues without Unity generate and playtest using the packaged Level Lab; follow `agent-rules/watersort-level-lab.md` and `Tools/LevelLab/AGENTS.md`.
- Lab generation must call the production generator/validator; do not invent a parallel engine.
- Config is editable as YAML in the Lab folder; palette/gameplay changes still need a new WebGL player from the project owner.
- Lab mode loads packs over localhost (`levelLab=1`); normal builds keep Resources loading.
- WebGL Lab play UI may show side inspection panels (metrics + stored solution steps). Non-WebGL builds must not require those panels.
### Generator Invariants

- Generation is config-driven. `levelsPerPack` controls requested level count; one JSON pack may contain at most 100 levels.
- Generated normal bottle capacity must be 2-5. Mega bottle capacity must be 12-20.
- Generated layouts use the configured 8x5 grid, at most 40 physical bottles, and unique in-bounds `gridPosition` values.
- Full hidden-stack and hybrid hidden-stack are mutually exclusive.
- Locked bottles cannot be source or target while locked.
- Mega bottles cannot be sources and accept only `targetColor`.
- Generate exactly 2 or 3 empty Ad bottles when required by the generation rules. Ad bottles must never be required by generated/stored solutions or difficulty evaluation.
- Generation must be deterministic for identical generator version, config, pack index, level number, and explicit seed. Candidate retries must derive deterministic sub-seeds; do not use wall-clock or unseeded randomness.
- Reject non-intro boards where any color totaling exactly one bottle capacity is split across bottles as `(capacity-1)+1` (for capacity 4: the trivial 3+1 pour-complete pattern). Modular recipes must not use 1-color modules for this reason.

### Canonical Validation

- The canonical Water Sort rule engine and exact level/solution validator are authoritative for move legality, mode behavior, unlock/reveal transitions, and completion.
- Generator code, editor tooling, tests, and pack validation must reuse the canonical validation path instead of introducing parallel replay implementations for Normal, Hidden, Hybrid, Locked, or Mega modes.
- Every stored solution must replay successfully against the exact level JSON, including `modeOptions`, per-bottle capacity, hidden layer indexes, lock thresholds, Mega rules, and Ad-bottle restrictions.
- Only describe a solution or solution count as globally shortest when the solver actually proves global shortestness.
- When global shortestness is not proven, store representative/known solution metadata and do not claim uniqueness or exact shortest counts.
- Stored `difficultyMetrics.safeMoveRatio` / `deadEndPotential` / `trapLikelihood` must come from classifying real legal moves along the known solution (bounded re-solve), not from crude proxies such as `1 / openingMoveCount`. Regenerate or refresh metrics after changing the evaluator.

### Generated Data

- Generated JSON is output, not the primary place to fix generator defects. Fix the generator, rule engine, validator, or config and regenerate rather than hand-editing output to satisfy tests.
- Manual authored level edits are allowed when explicitly requested; gameplay-affecting edits must invalidate or regenerate the matching stored solution.
- Do not depend on a `Ref/` folder being present.

### Mega Generation

- Mega levels must contain meaningful target-depth, blocker-color, top-color, and bottle-pattern diversity according to the active generation rules/config.
- Do not use one repeated blocker color or a repeated `source -> helper -> mega` sequence as the primary Mega construction strategy.
- Do not silently fall back to a simplistic legacy Mega template when a candidate fails quality requirements.

### Verification

For generator behavior changes, run the narrowest relevant checks:

- `node --check` for changed JavaScript files.
- Water Sort automated tests relevant to the change.
- Exact pack validation/replay for affected/generated packs.
- Deterministic generation using an explicit seed when generation behavior changes.
- `git diff --check` when Git is available.
- Do not claim Unity compilation passed unless Unity compilation was actually run.

Keep verification commands concrete in the implementation summary and report anything that could not be verified.
