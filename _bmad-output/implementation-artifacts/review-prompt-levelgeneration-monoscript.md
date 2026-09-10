# Adversarial Review Prompt (no prior context)

## Intent
WaterSort LevelGeneration `.unitypackage` previously shipped `WaterSortGenerationConfig.asset` and `WaterSortColorPalette.asset` without MonoScript (`.cs`) definitions, causing Missing Script on import. Fix adds the ScriptableObject scripts to the package, updates docs, and rebuilds the package.

## Changed files
1. `_bmad-output/implementation-artifacts/create-watersort-level-generation-package.js`
2. `Assets/Project/Editor/WaterSort/LevelGeneration/README.md`
3. `Assets/Project/Editor/WaterSort/LevelGeneration/AI_CONTEXT.md`
4. `_bmad-output/unity-packages/WaterSortLevelGeneration.unitypackage` (rebuilt)

## Added to package assetPaths
- `Assets/Project/ScriptableObject/Script/WaterSort/WaterSortGenerationConfig.cs`
- `Assets/Project/ScriptableObject/Script/WaterSort/WaterSortColorPalette.cs`

## Already included data assets
- `Assets/Project/Data/WaterSort/Generation/WaterSortGenerationConfig.asset`
- `Assets/Project/Data/WaterSort/Resources/WaterSortColorPalette.asset`

## Verified package contents include
- both `.cs` MonoScripts
- both `.asset` data files
- docs + Node generator tools (10 assets total)

## Instructions for reviewer
Run `bmad-review` with **adversarial** lens only on the files above.
Return findings as a Markdown list — descriptions only, no severity/priority/ranking, no JSON.
Adversarial lens requires at least ten concrete findings grounded in the files.
Paste findings back into the original session.
