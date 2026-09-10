# Water Sort Level Generation Rules

Use this rule whenever creating, editing, validating, or regenerating Water Sort level JSON, solution JSON, or generation tuning.

## Source of Truth

- Runtime level JSON lives in `Assets/LevelGenerator/Data/WaterSort/Resources/WaterSort/`.
- Runtime solution JSON lives in `Assets/LevelGenerator/Data/WaterSort/Resources/WaterSortSolutions/`.
- Generation tuning comes from `Assets/LevelGenerator/Data/WaterSort/Generation/WaterSortGenerationConfig.asset`.
- Config schema is documented in this file and serialized in `Assets/LevelGenerator/Data/WaterSort/Generation/WaterSortGenerationConfig.asset`.
- The package generator entry point is `Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Tools/generate-watersort-exhaustive-100.js`.
- Mega Bottle generation uses `Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Tools/mega-generator-v2.js`; the old template-style Mega builder is legacy-only and must not be silently used when Mega V2 quality checks fail.
- The portable single-level editor tool is `Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/WaterSortLevelDataDesignerWindow.cs`.
- One level JSON pack should contain at most 100 levels. Add the next numbered pack when a pack exceeds that.

Do not depend on legacy sample data or legacy generator output.

## Single-Level Editing Tool

Use `Tools > Water Sort > Level Data Designer` in Unity when editing one chosen level in a JSON pack.

The tool is standalone Editor code intended to be included in the generation package. It must not depend on gameplay, UI, runtime loader, or runtime ScriptableObject C# types.

The editor tool should support:

- changing bottle state between Normal, Locked, and Ads,
- showing each bottle on the configured grid,
- moving bottles by grid cell while preserving unique positions,
- adding, duplicating, and deleting bottles with their state,
- editing bottle capacity, lock threshold, layer colors, and layer order,
- validating duplicate grid cells, out-of-grid positions, capacity overflow, invalid color indexes, and ad bottle rules.

When a level is edited manually, reset or regenerate the matching solution entry because old moves may no longer replay legally.

## Config Model

Generation is config-driven.

- `levelsPerPack` controls how many levels are generated for the pack.
- Difficulty stages are ordered by array position and use `levelCount`, not absolute level ranges.
- The sum of all enabled stage `levelCount` values must equal `levelsPerPack`.
- Supported stages are Tutorial, Ramp, and Main.
- Bottle capacity is configurable per stage through `bottleCapacityWeights`.
- Bottle capacity must be between 2 and 5.
- Helper/empty bottle capacity is controlled separately through `helperCapacityWeights`.
- Layout grid size comes from config and is currently expected to be 8x5.
- Top-level `maxBottleCount` is currently allowed up to 40.
- Per-stage `maxTargetBottleCount` is currently allowed up to 40.
- Shape selection comes from `gridShapeWeights`, with `minBottleCount` and `maxBottleCount` used before weight selection.

Each stage can control:

- color count via `colorWeights`
- helper bottle capacity via `helperCapacityWeights`
- bottle capacity via `bottleCapacityWeights`
- grid shape via `gridShapeWeights`
- full hidden-stack availability and chance
- hybrid hidden-stack availability and chance
- locked-bottle availability and chance
- mega-bottle availability, chance, and min/max mega capacity
- Mega V2 candidate attempts, active bottle count, blocker color count, normal helper count, target group size, buried/deep buried target ratios, top-color diversity/share, cross-bottle move requirements, consecutive fill cap, and solver search limits
- target bottle count, step count, solution count, and difficulty-score constraints

## Level JSON Schema

Each generated level should include layout and mode data in the level itself:

```json
{
  "id": 1,
  "displayName": "Level 1",
  "layoutGrid": {
    "columns": 8,
      "rows": 5,
    "shape": "circle"
  },
  "modeOptions": {
    "hiddenStack": false,
    "hybridHiddenStack": true,
    "lockedBottles": false
  },
  "bottles": [
    {
      "capacity": 4,
      "colorsBottomToTop": [0, 1, 0, 2],
      "gridPosition": { "x": 3, "y": 4 },
      "hiddenLayerIndexes": [1],
      "isLocked": false,
      "unlockCompletedBottleCount": 0,
      "isAdBottle": false,
      "isMegaBottle": false,
      "targetColor": 0
    }
  ]
}
```

Bottle rules:

- `capacity` is per bottle and must be 2, 3, 4, or 5.
- Generated bottle capacity must come from the active stage's `bottleCapacityWeights`, clamped only to the supported 2-5 range.
- Tutorial or low-step generation must not force capacity down to 2 or 3 when config requests capacity 4.
- `colorsBottomToTop` must not exceed `capacity`.
- `gridPosition` is required for authored/generated layout and must be unique inside the level.
- `hiddenLayerIndexes` is used only by hybrid hidden-stack levels.
- `isLocked` and `unlockCompletedBottleCount` are used only by locked-bottle levels.
- `isAdBottle` marks an empty optional helper bottle reserved for future interstitial/rewarded ad flows.
- Each generated level should include 2 or 3 empty `isAdBottle: true` bottles.
- Ad bottles must start empty with `colorsBottomToTop: []` and should not be referenced by stored solution moves.
- `isMegaBottle` marks the one-way target bottle in mega mode.
- A mega bottle must have `capacity 12-20`, `targetColor` set to the required fill color, and at least one starting target-color layer in `colorsBottomToTop` so the player can read the required color.
- A mega bottle can only receive pours and cannot be used as a source.
- A mega bottle only accepts its `targetColor`.
- Mega-bottle levels complete when the mega bottle is full of `targetColor`, even if default bottles are not complete.
- Mega-bottle levels must place enough matching `targetColor` layers across default bottles to fill the mega bottle completely.
- Mega target-color layers should not all start on top of their source bottles. Generated mega levels should bury target groups under blocker colors and provide normal helper bottles so the player must rearrange blockers before filling the mega bottle.
- A default source bottle may contain more than one target-color layer, but it should not be a mono target-color bottle.
- Total bottles must not exceed top-level `maxBottleCount`.
- In an 8x5 grid, generated bottle count must never exceed 40 physical grid cells even if config limits are raised later.

Mode rules:

- `modeOptions.hiddenStack` means normal full hidden-stack mode: lower layers are hidden and reveal as top layers are removed.
- `modeOptions.hybridHiddenStack` means only selected non-top layers are hidden; visible layers remain visible.
- Full hidden-stack and hybrid hidden-stack are mutually exclusive in generated data.
- If a generator roll would enable both hidden modes, hybrid should take precedence and full hidden-stack should be disabled.
- `modeOptions.lockedBottles` means 1 to 4 bottles may start locked.
- Locked bottles can be unlocked only after the player has enough completed full single-color bottles.
- `modeOptions.megaBottle` means the level contains a mega bottle and uses mega completion rules.
- Mega-bottle generation is controlled per difficulty band by `allowMegaBottleMode`, `megaBottleChance`, `minMegaBottleCapacity`, and `maxMegaBottleCapacity`, matching the same config style as hidden-stack and hybrid hidden-stack modes.

## Gameplay Rules Assumed by Generation

Generate for classic Water Sort rules:

- A move pours the top contiguous same-color group.
- The target must be empty or have the same top visible color.
- The target must have enough remaining capacity for the poured group.
- A level is won when every non-empty bottle is full and contains only one color.
- In mega-bottle mode, the level is won when every mega bottle is full of its target color.
- Locked bottles cannot be used as source or target until unlocked.
- Mega bottles cannot be used as source and can receive only their target color.
- Hidden layers must not change the actual color order. They only change what is visible to the player.
- Solutions must be valid under the exact mode options stored in the level data.

## Grid and Shape Rules

The board is a grid, currently 8x5.

- Every bottle must have one unique grid cell.
- The visual layout must use `gridPosition`; do not rely on array index for placement.
- Shape selection must first filter shapes by `minBottleCount` and `maxBottleCount`.
- Weights should only be applied among shapes that fit the current bottle count.
- Shape cell order should prefer middle-aligned cells first, then expand outward.
- Open shapes must not start from a corner when the level uses only part of the shape.
- Horizontal line shapes (`-`, `horizontal`, `line`) must be centered vertically and horizontally for the current bottle count.
- Dense shapes should minimize empty cells inside the occupied middle area instead of spreading bottles thinly across the full 8x5 grid.
- Staggered/zigzag dense shapes should use adjacent rows or columns with alternating offsets, similar to a compact reference layout.
- Alternating-row shapes should intentionally leave checkerboard-style gaps: one row uses even columns and the adjacent row uses odd columns.
- Dense layout preference should override generic shape weighting for a meaningful share of Ramp/Main levels when dense candidates fit.
- Alternating-gap preference should also be applied explicitly so checkerboard-style layouts appear in generated packs, not only as passive config options.
- If a shape path has fewer cells than required, fill the remaining cells from nearby free grid cells while preserving uniqueness and readability.
- Do not select shapes blindly at random when they cannot fit the bottle count.
- YAML-quoted shape scalars such as `shape: '-'` must be normalized to the actual shape name `-` before generation.

Supported shape names:

- closed or compact: `circle`, `triangle`, `square`, `heart`, `diamond`, `spiral`, `plus`, `frame`
- open or directional: `arc`, `double_arc`, `x`, `y`, `v`, `u`, `w`, `l`, `s`, `zigzag`, `wave`, `-`, `horizontal`, `line`
- dense: `dense`, `compact`, `block`, `compact_zigzag`, `dense_zigzag`, `staggered`, `stagger`, `honeycomb`, `dense_columns`, `columns`
- alternating gaps: `checkerboard`, `alternating`, `alternating_rows`, `parity`

New shapes are allowed only if:

- they produce deterministic 8x5 candidate cells,
- they can report practical `minBottleCount` and `maxBottleCount`,
- they preserve unique grid positions,
- they remain readable for the expected bottle counts.


## Mega Bottle Scramble Rules

Mega-bottle levels should resemble a complex board around a central target, not a repeated list of one-step source bottles. Mega V2 is the production path for generated Mega levels. Required authoring/generation rules:

- Use one central mega bottle with capacity 12-20.
- Keep one visible starter layer in the mega bottle to show the required target color.
- The total target-color layer count across the mega bottle and normal bottles must exactly equal mega capacity.
- Distribute remaining target-color layers across many normal bottles at mixed depths.
- Target-containing normal bottles must never be mono targetColor.
- Target groups are usually size 1, may sometimes be size 2, and larger groups must be rare/config-driven.
- For standard/main Mega levels, at least 85% of target groups should be buried below one or more blockers, and at least 35% should be buried below two or more blockers when capacity permits.
- Hard Mega profiles should bury all target groups where possible and deeply bury at least 50%.
- Use a balanced blocker palette instead of one shared blocker color. Standard Mega should use roughly 6-9 non-target blocker colors; hard Mega should use roughly 8-12, limited by the active palette.
- Do not allow one visible top blocker color to dominate. Standard/Main max top-color share should stay at or below 0.25; hard Mega should stay at or below 0.20.
- Start with at least 4 distinct visible top colors, preferably more for Main levels.
- Reject exact duplicate `colorsBottomToTop` patterns between filled normal bottles.
- Avoid repeated permutations of the same small color set and repeated ordered adjacent color pairs across the board.
- Include blocker-only bottles so not every normal filled bottle contains targetColor.
- Use 1-3 normal empty helper bottles separately from 2-3 ad bottles. Ads bottles are extra IAA helpers and must not be used by stored solution moves.
- Stored solution moves should include meaningful moves between non-empty normal bottles before and between mega fills. Standard/Main Mega should target at least 3 moves before the first mega fill, at least 3 cross-bottle blocker moves, non-mega move ratio of at least 0.40, at least 3 distinct non-mega destination bottles, and no more than 3 consecutive mega-fill moves.
- Reject or heavily penalize repeated two-move motifs such as `source -> helper`, then the same `source -> mega`.
- Active Mega density is measured only across target-source and blocker-only normal bottles. Exclude the Mega bottle, empty normal helpers, and Ad bottles.
- Mega V2 should calculate active bottle count from required liquid and target fill ratio, then keep active bottles dense. Standard/Main profiles should keep active free ratio at or below about 0.20, sparse active bottles at or below about 0.15, and one-layer active bottles at 0 unless a profile explicitly relaxes it.
- Free capacity should be concentrated in intentional normal helpers or a small number of dense buffer/blocker bottles instead of spread as one empty slot across most active bottles.
- Generate multiple deterministic candidates per level seed, then run static validation, Mega solver, exact solution replay, difficulty/diversity evaluation, and best-candidate selection.
- If no candidate passes solver and quality checks, fail generation clearly. Do not silently fall back to the old template-style Mega builder.
- Verify by replaying generated moves under exact Mega rules: a move pours the full top contiguous same-color group, the mega bottle can only receive target color, and the mega bottle can never be a source.

## Hidden-Stack Generation

Full hidden-stack:

- Applies to the whole level.
- Hidden lower layers reveal progressively through gameplay.
- Generated solutions must validate with hidden-stack visibility restrictions.

Hybrid hidden-stack:

- Applies to the whole level as an option, but only selected bottle layers are hidden.
- Hide only 1 or 2 layers per affected bottle unless config explicitly changes this.
- Hidden layers may include the bottom layer.
- Do not hide the top layer at start because it blocks basic move readability.
- Do not hide every lower layer in hybrid mode; that is full hidden-stack behavior.
- Generated solutions must validate with hybrid visibility restrictions.

## Locked-Bottle Generation

Locked-bottle mode is optional per stage.

- If enabled for a generated level, choose 1 to 4 locked bottles.
- Locked bottles should have `isLocked: true`.
- Each locked bottle must have `unlockCompletedBottleCount` set from the stage config range.
- A locked bottle unlocks when the number of completed full single-color bottles reaches its threshold.
- Do not lock every useful helper bottle in a way that prevents all legal opening moves.
- Solutions must replay with lock checks enabled.

## Level Quality Constraints

Generated levels should satisfy:

- no bottle exceeds capacity,
- every color count is compatible with the target capacities,
- no color starts fully completed in a bottle unless intentionally authored for a tutorial edge case,
- no bottle starts with the same color repeated to full capacity in non-tutorial generated levels,
- enough free capacity exists somewhere in the level for legal play,
- the level does not start solved,
- bottle count does not exceed the configured maximum, currently 40,
- bottle count fits inside the layout grid cell count,
- palette color indexes are valid for the active palette,
- generated `difficultyScore` should be inside the stage target range when possible.

Difficulty score is a selector/tuning metric. It is not a proof of solvability. Solvability comes from replaying generated solution moves under the stored mode options.

## Solution JSON Rules

Solution JSON belongs beside level JSON in `WaterSortSolutions`.

Each level solution should store:

- the matching level id,
- shortest known step count or generated representative step count,
- representative solution moves,
- whether all known shortest paths were stored,
- mode-aware validation metadata when available.

For levels with many equivalent shortest solutions, storing representative examples is acceptable. Do not claim uniqueness unless the solver actually enumerated and proved it.

Solutions must be replay-valid against:

- per-bottle capacity,
- actual color order,
- hidden-stack or hybrid visibility,
- locked-bottle state and unlock thresholds,
- normal pour legality.

## Required Validation After Generation or Rule-Relevant Edits

Run the narrowest available verification for the files touched:

- JSON parses cleanly.
- generated level count equals `levelsPerPack`.
- stage `levelCount` values sum to `levelsPerPack`.
- all capacities are between 2 and 5.
- total bottle count is at or below top-level `maxBottleCount`.
- total bottle count is at or below the physical grid cell count.
- all grid positions are inside the configured grid.
- no duplicate grid positions exist within a level.
- shape names are supported by runtime/generator.
- hidden-stack and hybrid hidden-stack are not both enabled in the same level.
- hybrid hidden layer indexes are valid and do not exceed bottle contents.
- locked-bottle counts and unlock thresholds are within config limits.
- every stored solution replays successfully under that level's mode options.
- Mega V2 tests pass: `node Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Tools/mega-generator-v2-tests.js`.
- Pack validation passes: `node Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Tools/validate-pack.js <levelPack> <solutionPack>`.
- Do not run `solve-watersort-solutions.js` as routine validation after generation. It recomputes solutions with a general solver and is intended for stale/missing solutions after manual level edits.
- changed JavaScript generator files pass `node --check`.
- changed authored text/code files pass `git diff --check` when available.

If Unity compilation cannot be run in the current environment, state the exact reason and the closest manual Unity check path.
