# AI Context: Water Sort Level Data Generation

Use this file when an AI assistant imports this package into a different Unity project and needs to create new Water Sort level data.

## Goal

Create new Water Sort level JSON and matching solution JSON that the runtime can load through Unity `Resources`.

## Read These Files First

1. `Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Docs/watersort-level-generation.md`
2. `Assets/LevelGenerator/ScriptableObject/Script/WaterSort/WaterSortGenerationConfig.cs`
3. `Assets/LevelGenerator/ScriptableObject/Script/WaterSort/WaterSortColorPalette.cs`
4. `Assets/LevelGenerator/Data/WaterSort/Generation/WaterSortGenerationConfig.asset`
5. `Assets/LevelGenerator/Data/WaterSort/Resources/WaterSortColorPalette.asset`
6. `Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/README.md`

## Output Paths

- Level packs: `Assets/LevelGenerator/Data/WaterSort/Resources/WaterSort/watersort-levels-###.json`
- Solution packs: `Assets/LevelGenerator/Data/WaterSort/Resources/WaterSortSolutions/watersort-solutions-###.json`

Use one pack file for up to 100 levels. Use the next numbered pack when adding more generated data.

## Preferred Generation Path

Run the bundled generator from the Unity project root:

```bash
node Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Tools/generate-watersort-exhaustive-100.js 1
```

Replace `1` with the pack number to create. The generator reads `WaterSortGenerationConfig.asset`, writes level and solution JSON, and validates generated solutions before writing. Mega levels use `Tools/mega-generator-v2.js`, which generates multiple deterministic candidates, solves them with a bounded target-directed Mega solver, exact-replays the accepted representative solution, and rejects repetitive template-style candidates.

To avoid overwriting existing data, choose the next pack number by checking existing files in `Assets/LevelGenerator/Data/WaterSort/Resources/WaterSort`.

This package includes data ScriptableObject definitions for Inspector editing. It intentionally does not include gameplay, UI, or runtime loader scripts. Treat imported `.asset` files as YAML text when editing generation settings.

## Unity Editor Level Designer

The package includes a standalone Editor tool at:

`Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/WaterSortLevelDataDesignerWindow.cs`

Open it in Unity from `Tools > Water Sort > Level Data Designer`.

Use this tool when a human or AI-assisted workflow needs to edit one selected level instead of regenerating a whole pack. The tool can load a level pack, show bottle positions on the 8x5 grid, add/delete/duplicate bottles, move bottles between grid cells, switch bottle state between Normal/Locked/Ads, edit capacities and lock thresholds, and edit/reorder/add/remove color layers.

When a level is saved through the tool, treat its previous stored solution as stale. Re-run the solver only for manually edited/stale levels:

```bash
node Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Tools/solve-watersort-solutions.js
```

Do not run `solve-watersort-solutions.js` as the default verification step after normal generation. It recomputes solutions with a general solver and can be much slower than replay validation for large generated packs. After normal generation, use `validate-pack.js` on the generated level/solution pair.

If you edit JSON manually, apply the same behavior: reset or regenerate the matching solution entry after changing bottles, bottle states, grid positions, capacities, colors, hidden layers, or mode options.

## Manual AI Authoring Rules

If generating JSON manually instead of running the tool:

- Follow the schema in `watersort-level-generation.md`.
- Keep color indexes within the palette count.
- Do not use a color index as an empty marker. Empty bottles use `colorsBottomToTop: []`.
- Each generated level must include 2 or 3 extra empty ad helper bottles with `isAdBottle: true`.
- Ad helper bottles are reserved for future IAA/rewarded helper flows and should not be referenced by stored solution moves.
- `colorsBottomToTop` is ordered from bottom layer to top layer.
- Keep default bottle `capacity` between 2 and 5. Mega bottles are the exception and must use `capacity 12-20`.
- Bottle capacity must come from the active stage's `bottleCapacityWeights`; do not clamp tutorial or low-step levels down to 2 or 3 when config requests 4.
- Do not exceed 40 bottles or the 8x5 physical grid.
- Every `gridPosition` must be unique inside a level.
- Do not enable both `hiddenStack` and `hybridHiddenStack` in one level.
- Every stored solution must replay legally under the same mode options.

Mega bottle rules:

- Use `modeOptions.megaBottle: true` when a level contains a mega bottle.
- Generation is controlled by the current band config: `allowMegaBottleMode`, `megaBottleChance`, `minMegaBottleCapacity`, `maxMegaBottleCapacity`, Mega V2 candidate attempts, blocker color counts, normal helper counts, target group size, buried/deep buried target ratios, top-color diversity/share, non-Mega move requirements, consecutive fill cap, and solver search limits.
- Use exactly one main mega bottle unless explicitly requested otherwise.
- The mega bottle has `isMegaBottle: true`, `capacity 12-20`, and `targetColor` set.
- The mega bottle starts with at least one visible layer of `targetColor` in `colorsBottomToTop`.
- The mega bottle can only receive pours and cannot pour out.
- The mega bottle only accepts `targetColor`.
- The level completes when the mega bottle is full of `targetColor`.
- Default bottles must contain enough extra `targetColor` layers to fill the mega bottle.
- Target-color layers should be distributed inside default bottles, often below blocker colors, rather than all being exposed on top.
- Add normal empty helper bottles for mega levels; ads bottles are still reserved and must not be used in stored solution moves.
- A default bottle may contain multiple target-color layers, but avoid mono target-color source bottles.
- Include blocker-only bottles and balanced blocker colors so the board does not become a repeated source/helper template.
- Reject or heavily penalize repeated `source -> helper`, `same source -> mega` solution motifs.
- Do not mark the mega bottle as an ads bottle or locked bottle.
- A manually edited level must keep `layoutGrid.columns = 8` and `layoutGrid.rows = 5` unless the runtime layout is also changed.
- Use `isLocked: true` only for locked bottles, use `isAdBottle: true` only for empty ad helper bottles, and avoid combining locked and ad states on one bottle.


## Mega Bottle Scramble Rules

Mega-bottle levels should resemble a scattered board around a central target, not a repeated list of one-step source bottles. Required authoring/generation rules:

- Use one central mega bottle with capacity 12-20.
- Keep one visible starter layer in the mega bottle to show the required target color.
- Distribute required target-color layers across many default bottles at mixed depths.
- Do not place all required target-color layers on top. Generated mega levels should bury every target group below at least one blocker group unless explicitly creating an introductory mega level.
- Allow some default bottles to contain multiple target-color layers in one contiguous group. Avoid making a default bottle contain only the target color.
- Add normal empty helper bottles for blocker management. Ads bottles are extra IAA helpers and must not be used by stored solution moves.
- Use several blocker colors, not one repeated blocker color for the whole board.
- Stored solution moves should include helper moves before mega-fill moves, proving that blockers must be rearranged before the mega bottle can be filled.
- Verify by replaying the generated moves under normal pour rules: a move pours the full top contiguous same-color group, the mega bottle can only receive target color, and the mega bottle can never be a source.

## Verification

After normal generation, validate the generated level/solution pair with replay validation:

```bash
node Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Tools/validate-pack.js Assets/LevelGenerator/Data/WaterSort/Resources/WaterSort/watersort-levels-001.json Assets/LevelGenerator/Data/WaterSort/Resources/WaterSortSolutions/watersort-solutions-001.json
```

Use the solver only when a stored solution is stale or missing after manual edits:

```bash
node Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Tools/solve-watersort-solutions.js
```

After changing Mega generation:

```bash
node Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Tools/mega-generator-v2-tests.js
node Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Tools/validate-pack.js <levelPack> <solutionPack>
```

Also parse the JSON files and confirm level count, capacities, grid positions, hidden layer indexes, locked bottle rules, and solution replay validity.
