# Water Sort Level Generation Rules

Use these rules when creating, editing, validating, or generating Water Sort level JSON.

## Data Location

- Store level packs as JSON under `Assets/Project/Data/WaterSort/Resources/WaterSort/`.
- Store solution packs as JSON under the sibling folder `Assets/Project/Data/WaterSort/Resources/WaterSortSolutions/`.
- Store manually editable generation tuning in the `WaterSortGenerationConfig` ScriptableObject asset at `Assets/Project/Data/WaterSort/Generation/WaterSortGenerationConfig.asset`.
- Keep each level JSON pack at 100 levels or fewer.
- When a level pack would exceed 100 levels, create the next numbered file, for example `watersort-levels-002.json`.
- Keep solution pack numbering aligned with level pack numbering, for example `watersort-solutions-001.json` for `watersort-levels-001.json`.
- Keep color values out of level JSON. Level JSON stores color indexes only; actual colors come from `WaterSortColorPalette` ScriptableObject.

## JSON Shape

- Use this top-level shape:

```json
{
  "packName": "Water Sort Levels 001",
  "levels": []
}
```

- Each level must have `displayName` and `bottles`.
- Each bottle must have `capacity` and `colorsBottomToTop`.
- Each bottle `capacity` must be `4` or `5`.
- `colorsBottomToTop` is ordered from bottom layer to top layer.
- Color indexes must refer to entries in `WaterSortColorPalette`.

## Solution JSON Shape

- Use this top-level shape:

```json
{
  "packName": "Water Sort Solutions 001",
  "levelSolutions": []
}
```

- Each `levelSolutions` entry must have `levelNumber` and `solutionData`.
- `levelNumber` is 1-based and refers to the global loaded level order after level JSON files are sorted by file name.
- `solutionData.solutionCount` is the total number of discovered shortest solution paths for the level.
- `solutionData.shortestStepCount` is the step count of each stored shortest solution path.
- `solutionData.storedSolutionCount` must equal the number of entries in `solutionData.solutions`.
- `solutionData.storesAllSolutions` is `true` only when every counted shortest solution path is stored in `solutions`.
- `solutionData.selectionPolicy` should describe how stored examples were selected, for example `shortest_non_loop_empty_priority`.
- Each solution must have `stepCount` and `moves`.
- `stepCount` must equal the number of entries in `moves`.
- Each move stores 1-based bottle indexes as `fromBottle` and `toBottle`.

## Layout Rules

- Do not require fully empty starting bottles.
- Colors may be distributed across every bottle.
- However, fully no-empty starts should be limited. Prefer at least 1 empty bottle in most generated levels, with 2-3 empty bottles for easier/classic reference-style layouts.
- Keep enough free capacity somewhere in the layout for the puzzle to be playable under the current pour rules.
- Do not overfill a bottle. The number of entries in `colorsBottomToTop` must be less than or equal to `capacity`.
- Avoid starting a level already solved unless it is intentionally a tutorial/check level.
- A solved bottle is full and contains only one color. Empty bottles are also considered complete by win detection.
- A color may have more than one solved target bottle. This means the same color index may appear more than one bottle's worth and can complete multiple mono-full bottles with the same color.
- Increasing bottle count should not automatically increase distinct color count. Prefer adding duplicate target bottles for existing colors when a level needs more bottles.
- A level may contain up to 30 bottles if UI/layout supports it. When approaching this limit, keep the number of distinct colors stable and increase repeated color layers instead.
- The current runtime target is `classic_sort`: uniform bottle capacity 4 or 5, top-color matching pours, and mono-full win detection.
- Reference modes such as `short_sort`, `tall_sort`, `collector_sort`, `mixed_sort`, `locked`, `hidden_cells`, `covered_stack`, `wildcard_bottle`, `special_shape`, and `tube_config` are design references only until runtime support is explicitly added.

## Reference-Derived Level Logic

These rules summarize the portable behavior from `Resources/Ref` so generation can still produce similar levels if that folder is later removed.

- Reference data uses `watersort-level/v2` with `cells`; `0` means an empty cell and positive numbers are colors. Runtime JSON must strip empty cells and store only color indexes in `colorsBottomToTop`.
- Most production content is classic sorting: 33,270 classic levels out of the normalized reference set. Treat classic as the default generation target.
- Classic layouts are usually capacity 4, with 2 empty helper bottles (`8` empty slots) or 3 empty helper bottles (`12` empty slots).
- NutSort-style classic levels commonly use `colors + 3` bottles: examples include 9 colors/12 bottles, 11 colors/14 bottles, and 12 colors/15 bottles.
- LogicColor/GetColor-style classic levels commonly use `colors + 2` bottles: examples include 9 colors/11 bottles, 10 colors/12 bottles, and 12 colors/14 bottles.
- ASMR-style classic levels often use many more visual containers than playable colors, usually 8 colors with about 20-27 bottles, 2-5 empty bottles, and several partially filled bottles. Use this pattern only when the UI/layout can handle many bottles cleanly.
- A practical classic generator should alternate between these helper-space patterns:
  - Standard: `colorCount + 2` bottles, 8 free slots.
  - Easier: `colorCount + 3` bottles, 12 free slots.
  - Wide/easy visual variant: extra partial helper bottles, 16+ free slots, only when screen layout remains readable.
- Full mixed bottles are the norm. Avoid too many already-grouped full bottles; average top runs in the reference are usually close to 1.0-1.15 for classic maps.
- Partial bottles are valid and useful, especially when supporting starts with no fully empty bottles. They should preserve equivalent helper capacity through free slots, not remove helper space entirely.
- If distributing colors across every bottle, ensure total free slots are still comparable to the intended helper pattern. A no-empty layout with 8 free slots should usually spread those slots across 2-4 partial bottles.
- Limit no-empty layouts to a minority of generated levels, around 10-20% unless the designer explicitly raises the config value.
- To increase visible bottle count without adding unsupported mechanics, allow duplicate color targets: choose fewer distinct colors than solved target bottles, then assign some colors to multiple final bottles.
- Duplicate color targets are valid only if the total count for that color is an exact multiple of the bottle capacity.
- A single color may exceed 12 layers when needed. This is valid when the color's total layer count equals `capacity * targetBottleCountForThatColor`.
- Avoid treating `12` as a hard maximum layer count per color. It is only a common reference-scale value, not a rule.
- When duplicate target colors are used, avoid putting too many same-color top groups near the start; otherwise the level becomes visually noisy and often has excessive equivalent solutions.
- Early tutorial maps can use split groups and partially filled bottles to demonstrate pouring without presenting a full board immediately.
- Do not copy reference-only metadata such as `uid`, `orig_id`, `source_mode`, `extra.pos`, `gid`, palette names, or source game names into runtime level JSON.
- Do not depend on the reference folder or original source file names. Preserve the behavior through generator parameters and rule choices instead.

## Reference-Derived Progression

- The strongest observed progression pattern is not endless linear difficulty growth. Games ramp color count early, then hold a long plateau with small variations.
- Recommended classic progression:
  - Levels 1-20: tutorial ramp. Use 3-7 colors, 5-10 bottles, capacity 4, 2-3 helper bottles or equivalent partial free space.
  - Levels 21-50: introduce 7-9 colors. Keep 2 helper bottles for normal flow or 3 helper bottles for easier relief.
  - Levels 51-100: stabilize around 9 colors. Use 11-12 bottles, capacity 4, 8-12 free slots.
  - Levels 101-500: main plateau. Use 9-11 colors most often, occasionally 12 colors. Use `colorCount + 2` or `colorCount + 3` bottles.
  - Levels 501+: repeat plateau with controlled variation instead of constantly increasing colors. Rotate 9-color relief levels, 10-11-color standard levels, and 12-color harder levels.
- Suggested long-run classic distribution after level 100:
  - 9 colors: 25-35%.
  - 10 colors: 25-35%.
  - 11 colors: 20-30%.
  - 12 colors: 10-20%.
- Suggested helper-space distribution after level 100:
  - 8 free slots / about 2 helper bottles: 55-70%.
  - 12 free slots / about 3 helper bottles: 25-40%.
  - 16+ free slots / wide easy variant: 0-10%.
- Insert easier relief levels periodically. A useful cadence is one easier layout every 5-10 levels, especially after several 11-12 color maps.
- Avoid sudden jumps that combine more colors, fewer free slots, capacity changes, and special mechanics in the same level.
- Capacity 5 should be treated as variety, not baseline difficulty. Use it sparingly unless the game UI and solver have been tuned for longer stacks.
- Short/tall variants from the reference imply possible future modes:
  - `short_sort`: capacity 3, usually 6-11 colors, 1-2 empty bottles.
  - `tall_sort`: capacity 6-8, usually 3-6 colors, 1-3 empty bottles.
  - `collector_sort`: large collector containers with capacity 16-20 plus normal containers.
  - `mixed_sort`: many containers, special shapes, sometimes no empty bottle.
- These future modes should not be emitted by the current generator unless the runtime bottle capacity, win condition, and UI layout rules are updated first.

## Standalone Generation Recipe

These rules must be sufficient even when no `Ref/` folder exists in the project.

- Before generating levels, read `Assets/Project/Data/WaterSort/Generation/WaterSortGenerationConfig.asset` when it exists.
- Treat generation config asset values as designer-tunable inputs. Do not hard-code starting difficulty, difficulty growth, color mix, helper mix, step limits, or solution count limits when the config provides them.
- If the config asset is missing, use the fallback progression values in this section.
- Use 100-level packs. Name level packs by sequence (`watersort-levels-001.json`, `watersort-levels-002.json`) and keep the matching solution pack name aligned (`watersort-solutions-001.json`, `watersort-solutions-002.json`).
- Generate levels from a compact parameter set: `levelNumber`, `canonicalMode`, `distinctColorCount`, `targetBottleCount`, `maxBottleCount`, `freeSlotCount`, `emptyBottleCount`, `duplicateColorBottleChance`, `seed`, and `difficultyScore`.
- Treat `colorCount` as the number of playable color indexes used by the level.
- Treat `targetBottleCount` as the number of full mono bottles needed in the solved state. `targetBottleCount` may be greater than `distinctColorCount` when a color owns multiple solved bottles.
- Usually set `targetBottleCount` equal to `distinctColorCount` for compact levels. Increase `targetBottleCount` to create more bottles while reusing existing colors; do not increase `distinctColorCount` solely because the level needs more bottles.
- `maxBottleCount` may be as high as 30 for large classic maps. Runtime UI must be checked before emitting many 20-30 bottle levels.
- As `targetBottleCount` increases, the accepted shortest-solution step range should also increase. Do not reject large-bottle maps just because their optimal solution is longer than compact maps.
- For large maps, prefer longer but structured solutions over short noisy layouts with excessive equivalent moves.
- Use `freeSlotCount = 8` as the normal classic baseline, `freeSlotCount = 12` as an easier/helper baseline, and `freeSlotCount = 16+` only for wide/easy variants.
- `emptyBottleCount` should usually be 1-3. It may be 0 only when no-empty starting layouts are requested, but `freeSlotCount` must still leave enough playable space.
- Use bottle capacity 4 by default. Use capacity 5 for variety, larger color groups, or later/harder packs, but make final color counts match available capacities.
- Use deterministic seeded generation so a level can be regenerated from its seed during tooling/debugging.
- Difficulty score is a generation metric, not currently required in runtime JSON. Use it during generation/selection:
  - Around `0.90-1.00`: tutorial or very clean early levels.
  - Around `0.75-0.90`: early-to-mid levels.
  - Around `0.60-0.75`: normal main progression.
  - Around `0.45-0.60`: harder constrained levels.
  - Below `0.45`: use sparingly; reject if the solution feels brittle or unfun.
- Progression guide:
  - Levels 1-20: introduce 3, 5, and 7 colors; allow simple/high-score layouts.
  - Levels 21-100: transition into 7-9 colors; mix 2-helper and 3-helper layouts.
  - Levels 101+: mostly 9-12 colors, weighted toward 9-11 with periodic 12-color harder maps.
  - Later packs: keep 9-color relief levels, but rotate 10-12 colors and helper-space pressure.
- Suggested long-run color distribution after tutorials: about 30% 9-color, 30% 10-color, 25% 11-color, and 15% 12-color levels.
- Suggested helper mix after tutorials: about 60% 8-free-slot layouts, 35% 12-free-slot layouts, and 5% wider relief layouts.
- Suggested no-empty-start ratio: 10-20% of levels, not 100%.
- Suggested duplicate-target ratio: 35-55% of levels after the tutorial ramp. Use 2-3 target bottles for one color as the normal case, but allow more when creating large 20-30 bottle levels.
- For large-bottle levels, cap distinct colors first and distribute extra target bottles across existing colors. Example: 10 distinct colors can produce 18-24 target bottles by giving some colors 2-3 solved bottles each.
- Prefer generated levels where colors are distributed across all bottles when requested; do not force fully empty bottles, but still preserve enough free capacity for valid opening moves.
- Avoid generated starts with excessive obvious symmetric moves unless the level is intentionally easy.
- Reject levels that are already solved, have no valid opening move, require a very long search to solve, or have solution counts so high that the puzzle becomes trivial/noisy for its intended difficulty.
- Historical reference note: reference data may include compact metadata, source mode names, original IDs, positions, locked/hidden/tube metadata, and source-game-specific flags. Do not depend on those folders or formats; copy the generation behavior summarized above instead.

## Generation Config ScriptableObject Shape

- `levelsPerPack` controls maximum levels per JSON pack.
- `solutionExampleLimitWhenMany` controls how many representative solutions are stored when a level has many shortest solutions.
- `manySolutionThreshold` controls when to store representative examples instead of every shortest solution.
- `defaultBottleCapacity`, `allowCapacityFive`, and `capacityFiveChance` control capacity selection.
- `allowNoEmptyStartingBottles` allows generated layouts to distribute colors across every bottle while retaining free capacity.
- `noEmptyStartingBottleChance` controls how often generation is allowed to start with no fully empty bottle. Keep this low when the user wants classic/reference-like levels.
- `preferredMinEmptyBottleCount` and `preferredMaxEmptyBottleCount` control the normal empty-bottle range.
- `duplicateColorBottleChance` controls how often a level can use more solved target bottles than distinct colors.
- `maxDuplicateBottleTargetsPerColor` caps how many final mono bottles can share one color for ordinary generation. Large-map generation may raise this cap as long as readability and solvability remain acceptable.
- `maxBottleCount` caps total bottles emitted by generation. Default project cap is 30.
- `minTargetBottleCount` and `maxTargetBottleCount` on each difficulty band control solved target bottle count independently from distinct color count.
- `minShortestStepCount` and `maxShortestStepCount` should scale with target bottle count. Larger 20-30 bottle levels may reasonably allow 55-80 optimized steps.
- Prefer explicit free-space tuning in generation tools. If a config still exposes `helperCapacityWeights`, interpret helper capacity as total free-slot budget or map it deterministically to free slots before generating.
- `selectionPolicy` should match the solution example selection policy stored in solution JSON.
- `difficultyBands` controls manual progression. Each band uses `levelFrom`, `levelTo`, `targetDifficultyScoreMin`, `targetDifficultyScoreMax`, `colorWeights`, `helperCapacityWeights`, `minShortestStepCount`, `maxShortestStepCount`, and `maxSolutionCount`.
- To make the game start easier or harder, edit the first band's target difficulty score, color weights, helper weights, and step limits.
- To make difficulty ramp faster or slower, edit band ranges and target score ranges rather than changing generator code.
- Treat weights as relative weights; they do not need to add to 100, but keeping them human-readable is preferred.

## Solvability Guardrails

- For compact ordinary levels, each playable color may appear exactly one full bottle's worth across the level.
- For increased-bottle levels, a playable color may appear multiple full bottles' worth. Each color count must still be divisible by the target bottle capacity.
- If all target bottles are capacity 4, each color should appear 4 times.
- If using capacity 5 as the intended target for a color, that color should appear 5 times.
- If one color has several target bottles, multiply its required count by target bottles owned by that color. For example, capacity 4 with 4 target bottles of the same color requires 16 layers of that color.
- Do not reject a level only because one color has more than 12 layers. Reject it only if the count is not divisible by the intended target capacity, the level becomes unreadable, or the solver cannot validate it.
- Mixed 4/5-capacity levels are allowed, but the color counts should match some available final bottle capacities.
- Leave at least one valid move available at the start unless the level is intentionally complete.
- When generating levels with a solver, store discovered shortest solution paths in the matching solution JSON file under `WaterSortSolutions`.
- If the full shortest-solution set is too large for practical Unity import, keep `solutionCount` as the exact total and store a representative subset in `solutions`.
- Count only optimized shortest paths that do not repeat a prior board state in the same path; do not count longer loop-style paths as correct solution count.
- Optimize solution step count first. `shortestStepCount` must be the minimum discovered solution length under the current pour rules.
- Reduce accepted solution noise by filtering out path variants that only loop, immediately undo a move, or repeat a board state.
- Prefer stored representative solutions that create empty bottles early, pour into empty bottles when useful, complete bottles, and avoid immediate reverse moves.
- If a level has 10 or more shortest solutions, store exactly 3 representative examples unless the user asks for a different sample size.
- If a level has fewer than 10 shortest solutions, store all shortest solutions and set `storesAllSolutions` to `true`.
- If solutions have not been generated yet, use `"solutionCount": 0`, `"shortestStepCount": 0`, `"storedSolutionCount": 0`, and an empty `solutions` array rather than placeholder moves.

## Checks

- Confirm the edited file remains valid JSON.
- Confirm all bottle capacities are 4 or 5.
- Confirm no bottle has more color entries than its capacity.
- Confirm color indexes are non-negative and within the palette size.
- Confirm total bottle count does not exceed 30 unless the UI/runtime limit has explicitly changed.
- Confirm duplicate-color totals are divisible by their intended solved bottle capacity, including colors with more than 12 layers.
- Confirm every solution `levelNumber` references an existing level.
- Confirm `storedSolutionCount` matches the number of stored solutions.
- Confirm `storesAllSolutions` is false when `storedSolutionCount` is less than `solutionCount`.
- Confirm every solution `stepCount` matches its move count.
- Confirm every solution move references existing bottle numbers.
- If generating levels, confirm the generation config asset is present or fallback values are intentional, and every `difficultyBands` range is ordered and non-overlapping.
- Run the narrowest available compile/check after changing scripts or generated data.
