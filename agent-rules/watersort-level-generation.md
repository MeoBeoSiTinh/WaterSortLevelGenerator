# Water Sort Level Generation Rules

Use this rule whenever creating, editing, validating, or regenerating Water Sort level JSON, solution JSON, or generation tuning.

## Source of Truth

- Runtime level JSON lives in `Assets/Project/Data/WaterSort/Resources/WaterSort/`.
- Runtime solution JSON lives in `Assets/Project/Data/WaterSort/Resources/WaterSortSolutions/`.
- Generation tuning comes from `Assets/Project/Data/WaterSort/Generation/WaterSortGenerationConfig.asset`.
- Config schema is defined by `Assets/Project/ScriptableObject/Script/WaterSort/WaterSortGenerationConfig.cs`.
- The current generator implementation is `_bmad-output/implementation-artifacts/generate-watersort-exhaustive-100.js`.
- One level JSON pack should contain at most 100 levels. Add the next numbered pack when a pack exceeds that.

Do not depend on legacy sample data or legacy generator output.

## Config Model

Generation is config-driven.

- `levelsPerPack` controls how many levels are generated for the pack.
- Difficulty stages are ordered by array position and use `levelCount`, not absolute level ranges.
- The sum of all enabled stage `levelCount` values must equal `levelsPerPack`.
- Supported stages are Tutorial, Ramp, and Main.
- Bottle capacity is configurable per stage through `bottleCapacityWeights`.
- Bottle capacity must be between 2 and 5.
- Helper/empty bottle capacity is controlled separately through `helperCapacityWeights`.
- Layout grid size comes from config and is currently expected to be 8x8.
- Top-level `maxBottleCount` is currently allowed up to 50.
- Per-stage `maxTargetBottleCount` is currently allowed up to 50.
- Shape selection comes from `gridShapeWeights`, with `minBottleCount` and `maxBottleCount` used before weight selection.

Each stage can control:

- color count via `colorWeights`
- helper bottle capacity via `helperCapacityWeights`
- bottle capacity via `bottleCapacityWeights`
- grid shape via `gridShapeWeights`
- full hidden-stack availability and chance
- hybrid hidden-stack availability and chance
- locked-bottle availability and chance
- target bottle count, step count, solution count, and difficulty-score constraints

## Level JSON Schema

Each generated level should include layout and mode data in the level itself:

```json
{
  "id": 1,
  "displayName": "Level 1",
  "layoutGrid": {
    "columns": 8,
    "rows": 8,
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
      "unlockCompletedBottleCount": 0
    }
  ]
}
```

Bottle rules:

- `capacity` is per bottle and must be 2, 3, 4, or 5.
- `colorsBottomToTop` must not exceed `capacity`.
- `gridPosition` is required for authored/generated layout and must be unique inside the level.
- `hiddenLayerIndexes` is used only by hybrid hidden-stack levels.
- `isLocked` and `unlockCompletedBottleCount` are used only by locked-bottle levels.
- Total bottles must not exceed top-level `maxBottleCount`.
- In an 8x8 grid, generated bottle count must never exceed 64 physical grid cells even if config limits are raised later.

Mode rules:

- `modeOptions.hiddenStack` means normal full hidden-stack mode: lower layers are hidden and reveal as top layers are removed.
- `modeOptions.hybridHiddenStack` means only selected non-top layers are hidden; visible layers remain visible.
- Full hidden-stack and hybrid hidden-stack are mutually exclusive in generated data.
- If a generator roll would enable both hidden modes, hybrid should take precedence and full hidden-stack should be disabled.
- `modeOptions.lockedBottles` means 1 to 4 bottles may start locked.
- Locked bottles can be unlocked only after the player has enough completed full single-color bottles.

## Gameplay Rules Assumed by Generation

Generate for classic Water Sort rules:

- A move pours the top contiguous same-color group.
- The target must be empty or have the same top visible color.
- The target must have enough remaining capacity for the poured group.
- A level is won when every non-empty bottle is full and contains only one color.
- Locked bottles cannot be used as source or target until unlocked.
- Hidden layers must not change the actual color order. They only change what is visible to the player.
- Solutions must be valid under the exact mode options stored in the level data.

## Grid and Shape Rules

The board is a grid, currently 8x8.

- Every bottle must have one unique grid cell.
- The visual layout must use `gridPosition`; do not rely on array index for placement.
- Shape selection must first filter shapes by `minBottleCount` and `maxBottleCount`.
- Weights should only be applied among shapes that fit the current bottle count.
- Shape cell order should prefer middle-aligned cells first, then expand outward.
- Open shapes must not start from a corner when the level uses only part of the shape.
- Horizontal line shapes (`-`, `horizontal`, `line`) must be centered vertically and horizontally for the current bottle count.
- Dense shapes should minimize empty cells inside the occupied middle area instead of spreading bottles thinly across the full 8x8 grid.
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

- they produce deterministic 8x8 candidate cells,
- they can report practical `minBottleCount` and `maxBottleCount`,
- they preserve unique grid positions,
- they remain readable for the expected bottle counts.

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
- bottle count does not exceed the configured maximum, currently 50,
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
- changed JavaScript generator files pass `node --check`.
- changed authored text/code files pass `git diff --check` when available.

If Unity compilation cannot be run in the current environment, state the exact reason and the closest manual Unity check path.
