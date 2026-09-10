# Train WaterSort Level Project Context

Unity 6000.3.10f1 Water Sort project. Runtime authored source lives under `Assets/Project/`; Unity cache and generated editor folders such as `Library/`, `Logs/`, `Temp/`, `obj/`, `.idea/`, and `UserSettings/` should not be scanned for normal generator work.

Water Sort generated levels are loaded from `Assets/Project/Data/WaterSort/Resources/WaterSort/`. Matching solution packs are loaded from `Assets/Project/Data/WaterSort/Resources/WaterSortSolutions/`. Generation tuning is stored in `Assets/Project/Data/WaterSort/Generation/WaterSortGenerationConfig.asset`, with the Unity schema in `Assets/Project/ScriptableObject/Script/WaterSort/WaterSortGenerationConfig.cs`.

The active generator entry point is `Assets/Project/Editor/WaterSort/LevelGeneration/Tools/generate-watersort-exhaustive-100.js`. It is currently a monolithic modular/exhaustive generator that reads the Unity YAML config, solves small reusable modules, composes larger levels, adds mode metadata, writes level and solution JSON, and performs internal replay checks. `_bmad-output/implementation-artifacts/generate-watersort-exhaustive-100.js` is an implementation artifact copy. `generate-watersort-100.js` is legacy/experimental.

Current runtime loading and gameplay rules are centered in `Assets/Project/Script/Gameplay/WaterSort/WaterSortJsonCatalog.cs`, `Assets/Project/Script/Gameplay/WaterSort/WaterSortBottleState.cs`, and `Assets/Project/Script/Core/WaterSort/WaterSortGameManager.cs`. Runtime play supports normal, full hidden stack, hybrid hidden stack, locked bottles, mega bottles, and ad bottle flags in the JSON schema.

Level Generator V2 should be built incrementally. Start with a canonical board model, one move-legality/apply-move path, exact replay from level JSON, an independent pack validator, and regression tests. Only then extract the current modular generator into reusable modules and introduce new global scramble, difficulty, diversity, and Mega V2 generation strategies.

Hard constraints: normal capacity 2-5, mega capacity 12-20, layout grid 8x5, at most 40 bottles, unique grid cells, mutually exclusive full hidden and hybrid hidden modes, 2 or 3 empty ad bottles per generated level, and stored solutions must never use ad bottles. Do not claim global shortestness unless an exhaustive solver actually proves it for that level.
