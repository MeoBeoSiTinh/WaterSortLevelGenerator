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
- Treat `Assets/WaterSortPuzzleColorGame/` as the current legacy reference implementation. Reuse its proven staged-action concepts selectively; keep newly authored files in the `Assets/Project/` convention defined above.
- Water Sort level layouts must be authored as JSON files under `Assets/Project/Data/WaterSort/Resources/WaterSort/`. Keep one JSON file for up to 100 levels; add another numbered JSON file when a pack would exceed 100 levels.
- Water Sort level JSON may distribute colors across every bottle; do not require fully empty starting bottles. Keep enough free capacity somewhere in the layout if the level should be playable under the pour rules.
- Water Sort solution JSON lives in `Assets/Project/Data/WaterSort/Resources/WaterSortSolutions/`, a sibling folder beside the level JSON folder, and stores exact shortest-solution count plus stored per-solution step counts/moves.
- Water Sort solution counts should count optimized shortest non-loop paths; for levels with 10 or more shortest solutions, store only 3 representative examples unless requested otherwise.
- When generating Water Sort levels, do not depend on any `Ref/` folder being present. Use the standalone generation recipe in `agent-rules/watersort-level-generation.md`: 100 levels per pack, early 3/5/7-color tutorials, main 9-12-color progression, helper capacity variants, seeded generation, and decreasing difficulty-score trend.
- Water Sort generation difficulty and ramp tuning should come from the `WaterSortGenerationConfig` ScriptableObject at `Assets/Project/Data/WaterSort/Generation/WaterSortGenerationConfig.asset`, so designers can adjust it in the Unity Inspector.
- For detailed Water Sort level authoring, generation, validation, and solvability guardrails, read `agent-rules/watersort-level-generation.md`.
- Water Sort colors remain editable through `WaterSortColorPalette` ScriptableObject assets under `Assets/Project/Data/WaterSort/Resources/`.

## Local Folder Structure Override

- Author new project files under `Assets/Project/`.
- Runtime scripts go under `Assets/Project/Script/`:
  - `Core/` for manager and shared infrastructure scripts.
  - `Gameplay/` for gameplay logic scripts.
  - `UI/` for UI and canvas scripts.
- ScriptableObject script definitions go under `Assets/Project/ScriptableObject/`:
  - `Script/` for ScriptableObject definition scripts.
- Water Sort palette assets are an exception and live under `Assets/Project/Data/WaterSort/Resources/` so runtime loading works without scene setup.
- Prefabs go under `Assets/Project/Prefab/`:
  - `UI/` for UI prefabs.
  - `Gameplay/` for gameplay prefabs.
