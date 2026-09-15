# Water Sort Level Generation Package

Portable Unity package for Water Sort **level data generation**: config assets, documentation, Node.js generator/validator tools, and a standalone Editor Level Data Designer.

This package does **not** include gameplay, UI, or runtime catalog loaders. Import into a project that already has (or will add) a Water Sort runtime that loads the same JSON schema via `Resources`.

## Requirements

- Node.js 22+ on PATH as `node`
- Keep imported paths under `Assets/LevelGenerator/...` (or update generator root detection)
- Unity Editor for the Level Data Designer menu only (generation itself is Node)

## Build this `.unitypackage` (project owners)

From the Unity project root:

```bash
node Tools/create-watersort-level-generation-package.js
```

Output: `_bmad-output/unity-packages/WaterSortLevelGeneration.unitypackage`

## Documentation map (read in this order)

| Doc | Purpose |
|---|---|
| `Docs/watersort-gameplay-modes.md` | **Modes, pour rules, win conditions, how to create, how to solve/validate** |
| `Docs/watersort-level-generation.md` | Authoritative generation/schema/quality/fingerprint rules |
| `AI_CONTEXT.md` | Short AI onboarding for imported packages |
| This `README.md` | Package contents and commands |

## Included

### Data & schema

- `Assets/LevelGenerator/ScriptableObject/Script/WaterSort/WaterSortGenerationConfig.cs`
- `Assets/LevelGenerator/ScriptableObject/Script/WaterSort/WaterSortColorPalette.cs`
- `Assets/LevelGenerator/Data/WaterSort/Generation/WaterSortGenerationConfig.asset`
- `Assets/LevelGenerator/Data/WaterSort/Resources/WaterSortColorPalette.asset`

### Docs

- `Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/README.md`
- `Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/AI_CONTEXT.md`
- `Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Docs/watersort-gameplay-modes.md`
- `Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Docs/watersort-level-generation.md`

### Editor

- `Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/WaterSortLevelDataDesignerWindow.cs` — **Tools → Water Sort → Level Data Designer**

### Tools (Node)

- `generate-watersort-exhaustive-100.js` — production generator entry
- `mega-generator-v2.js` / `mega-generator-v2-tests.js`
- `watersort-exhaustive-solver.js`
- `watersort-core-fingerprint.js` / `watersort-core-fingerprint-tests.js`
- `watersort-color-lock-tests.js`
- `generator-profile-tests.js`
- `validate-pack.js` — exact replay validation (routine)
- `solve-watersort-solutions.js` — re-solve stale/manual levels only

## Gameplay modes (summary)

Full detail: `Docs/watersort-gameplay-modes.md`.

- **Classic** pour: top contiguous same-color group; target empty or matching top; enough capacity.
- **Hidden stack** / **Hybrid hidden**: visibility only; mutually exclusive.
- **Count-lock**: unlock after N completed mono bottles (any color).
- **Color-lock**: unlock after N completed mono bottles of a required color (prefer thresholds 1–3).
- **Mega**: one-way target bottle (capacity 12–20); win when mega is full of `targetColor`.
- **Ads**: 2–3 empty optional helpers; never in stored solutions; never unlock progress.
- One bottle must not combine count-lock and color-lock.

## Usage

1. Import the package into the target Unity project.
2. Ask an AI assistant to read `AI_CONTEXT.md` then `Docs/watersort-gameplay-modes.md` and `Docs/watersort-level-generation.md`.
3. Tune `WaterSortGenerationConfig.asset` as YAML if needed (keep Unity headers).
4. From the Unity project root:

```bash
node Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Tools/generate-watersort-exhaustive-100.js 1
```

Optional: `[seed] [Easy|Normal|Hard|VeryHard|Special]`.

5. Levels → `Assets/LevelGenerator/Data/WaterSort/Resources/WaterSort/`
6. Solutions → `Assets/LevelGenerator/Data/WaterSort/Resources/WaterSortSolutions/`

Validate:

```bash
node Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Tools/validate-pack.js Assets/LevelGenerator/Data/WaterSort/Resources/WaterSort/watersort-levels-001.json Assets/LevelGenerator/Data/WaterSort/Resources/WaterSortSolutions/watersort-solutions-001.json
```

Focused tests:

```bash
node Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Tools/watersort-color-lock-tests.js
node Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Tools/watersort-core-fingerprint-tests.js
node Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Tools/mega-generator-v2-tests.js
node Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Tools/generator-profile-tests.js
```

Do **not** use `solve-watersort-solutions.js` as routine post-generation validation. Use it after Level Designer / manual edits that reset solutions.

## Level Data Designer

Open **Tools → Water Sort → Level Data Designer**.

Supports grid placement, bottle CRUD, Normal / Locked / Color-locked / Ads / Mega states, capacities, unlock thresholds, layers, and basic validation. Saving a level resets its stored solution — re-solve and validate afterward.

## Mega Bottle Mode

Mega levels use Mega Generator V2. Rules are summarized in `Docs/watersort-gameplay-modes.md` and detailed in `Docs/watersort-level-generation.md` (Mega scramble section). Do not silently fall back to legacy Mega templates when V2 quality checks fail.

## Portable Level Lab (full project only)

Colleagues without Unity use the packaged Level Lab from the main Water Sort project (`Tools/LevelLab/`, share `Builds/LevelLab/`). This generation `.unitypackage` alone is not the Lab player bundle.
