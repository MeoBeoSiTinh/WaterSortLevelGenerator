# AI Context: Water Sort Level Data Generation

Use this file when an AI assistant imports this package into a different Unity project and needs to create or fix Water Sort level data.

## Goal

Create level JSON + matching solution JSON that a Water Sort runtime can load through Unity `Resources`, following exact pour/mode rules.

## Read these files first

1. `Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Docs/watersort-gameplay-modes.md` — modes, rules, create, solve
2. `Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Docs/watersort-level-generation.md` — schema + generation constraints
3. `Assets/LevelGenerator/Data/WaterSort/Generation/WaterSortGenerationConfig.asset`
4. `Assets/LevelGenerator/ScriptableObject/Script/WaterSort/WaterSortGenerationConfig.cs` (schema)
5. `Assets/LevelGenerator/Data/WaterSort/Resources/WaterSortColorPalette.asset`
6. `Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/README.md`

## Output paths

- Levels: `Assets/LevelGenerator/Data/WaterSort/Resources/WaterSort/watersort-levels-###.json`
- Solutions: `Assets/LevelGenerator/Data/WaterSort/Resources/WaterSortSolutions/watersort-solutions-###.json`

Max 100 levels per pack. Prefer the next free pack number. Map `level.id` ↔ `solution.levelNumber` inside the pack.

## Preferred generation path

```bash
node Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Tools/generate-watersort-exhaustive-100.js <packNumber> [seed] [profile]
```

Entry point stays thin; Mega uses `mega-generator-v2.js`. Do not use legacy `_bmad-output` generators or `generate-watersort-100.js`.

Honor profile composition/difficulty gates (helpers, partials, safe-move / dead-end / trap). Prefer partial fills over many empty normal helpers. Ads stay separate. Do not silently soften the approved difficulty baseline. Do not claim global shortestness unless proven.

## Modes the generator/runtime must honor

See `Docs/watersort-gameplay-modes.md` for full detail.

- Classic pour + classic/Mega win rules
- Full hidden vs hybrid hidden (exclusive)
- Count-lock and color-lock (one lock type per bottle; both types allowed on one level)
- Color-lock unlock counts preferably span 1–3; fewer colors per level is OK
- Mega one-way target bottle
- 2–3 empty Ad bottles excluded from solutions and unlock progress
- Core fingerprint dedupe within a pack

## Unity Level Data Designer

`WaterSortLevelDataDesignerWindow.cs` → **Tools → Water Sort → Level Data Designer**.

After manual edits, stored solutions are stale. Re-solve only those levels:

```bash
node Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Tools/solve-watersort-solutions.js
```

Then:

```bash
node Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Tools/validate-pack.js <levels.json> <solutions.json>
```

Do not run the general solver as routine validation after normal generation.

## Manual JSON authoring

If writing JSON by hand: follow both Docs files; keep palette indexes valid; reset/regenerate matching solutions; validate with `validate-pack.js`.

## Verification checklist

- `node --check` on changed JS
- Relevant unit tests (`watersort-color-lock-tests.js`, fingerprint, Mega V2, profile tests)
- `validate-pack.js` on affected packs
- Deterministic seed when generation behavior changed
- Do not claim Unity compilation passed unless it was run
