---
name: watersort-generate-levels
description: 'Generate Water Sort level + solution JSON packs from the current WaterSortGenerationConfig. Use when the user asks to create Water Sort levels, generate a level pack, run the exhaustive generator, produce watersort-levels/solutions JSON, or generate inside the portable Level Lab folder.'
---

# Water Sort Generate Levels

## Goal

Create new Water Sort level JSON and matching solution JSON only. Do not create gameplay, UI, or runtime scripts.

## Required Reads (before generate/edit)

### In the Unity project

1. `agent-rules/watersort-gameplay-modes.md`
2. `agent-rules/watersort-level-generation.md`
3. `Assets/Project/Data/WaterSort/Generation/WaterSortGenerationConfig.asset`
4. `Assets/Project/Data/WaterSort/Resources/WaterSortColorPalette.asset`

Optional: `Assets/Project/Editor/WaterSort/LevelGeneration/README.md`, `agent-rules/watersort-level-lab.md`

### In a packaged Level Lab folder

1. `AGENTS.md` (Lab root / `Tools/LevelLab/AGENTS.md`)
2. `agent-rules/watersort-gameplay-modes.md`
3. `agent-rules/watersort-level-generation.md`
4. `Assets/Project/Data/WaterSort/Generation/WaterSortGenerationConfig.asset`

## Output Paths

- Levels: `Assets/Project/Data/WaterSort/Resources/WaterSort/watersort-levels-###.json`
- Solutions: `Assets/Project/Data/WaterSort/Resources/WaterSortSolutions/watersort-solutions-###.json`
- Max 100 levels per pack.
- Lab receipts: `GenerationRuns/` when using `Tools/LevelLab/generate.js`

## Hard Rules

- Choose the **next** pack number. Do not overwrite an existing pack unless the user explicitly asks to replace/delete first.
- Difficulty comes from explicit profiles (Easy → Special), not level number.
- Profile composition/difficulty fields in config must be honored by the production generator (helpers, partial fills, safe-move / dead-end / trap targets). Prefer partial fills over many empty normal helpers.
- Keep the approved 2026-09-10 difficulty baseline. Do **not** loosen empties/helpers/partials/safe-move/dead-end/trap/NearWin thresholds unless the user explicitly asks. Fail/retry candidates instead of softening gates.
- `layoutGrid` must be **8x5**.
- Total bottles ≤ **40**; each bottle has a unique `gridPosition`.
- Bottle `capacity` comes from config/`bottleCapacityWeights`. Do **not** clamp down to 2 or 3 when config requests 4.
- Every generated level must include **2 or 3** empty ads bottles:
  - `isAdBottle: true`
  - `colorsBottomToTop: []`
- Stored solution moves must **never** use ads bottles. Ads never count as normal helpers.
- Do not use a seed workflow as user input unless reproducibility is requested; Lab `generate.js` records seed automatically.
- Color indexes must exist in the palette.
- `colorsBottomToTop` is bottom → mouth order.
- Never enable `hiddenStack` and `hybridHiddenStack` together.
- Solutions must replay validly under `modeOptions`, locked bottles, hidden layers, capacity, and pour rules.
- Config may be edited as YAML before generate; keep Unity YAML headers.
- Production entry only: `generate-watersort-exhaustive-100.js` under `Assets/Project/Editor/.../Tools/`. Do not run `_bmad-output` copies or `generate-watersort-100.js`.

## Workflow

### 1. Pick pack number

From project/Lab root, list existing packs under:

`Assets/Project/Data/WaterSort/Resources/WaterSort/watersort-levels-*.json`

Use the next free number (e.g. if `001` exists, use `2`). If none exist, use `1`.

### 2. Generate

**Preferred in Level Lab / portable folder:**

```bash
node Tools/LevelLab/generate.js
node Tools/LevelLab/generate.js --profile Easy --seed 12345
```

**In the Unity project (production entry):**

```bash
node Assets/Project/Editor/WaterSort/LevelGeneration/Tools/generate-watersort-exhaustive-100.js <packNumber>
```

### 3. Verify solutions

Lab wrapper already validates before publishing. Otherwise:

```bash
node Assets/Project/Editor/WaterSort/LevelGeneration/Tools/validate-pack.js <levels.json> <solutions.json>
```

Do not run `solve-watersort-solutions.js` as routine post-generation validation.

### 4. Spot-check required constraints

Confirm:

- levels count matches config `levelsPerPack`
- matching `levelSolutions` count
- `layoutGrid` 8x5
- max bottles ≤ 40
- unique grid positions
- capacity follows config (no illegal clamp)
- each level has 2–3 empty ads bottles
- no ads bottle indexes appear in stored solution moves

### 5. Playtest in Level Lab (when available)

```bash
node Tools/LevelLab/server.js
```

Reload pack list; open the pack; hard-refresh the player tab if the WebGL player was just replaced.

## Communication

Keep the final reply short:

- pack number used
- written level/solution paths
- level/solution counts
- pass/fail of verify + spot-checks
- localhost play path when Level Lab is running

Do not create PRDs, architecture docs, or unrelated code.

## Related

- Screenshot / ASMR-similar packs (bags→locked, frost→color-lock, `?`→hidden/hybrid): `.agents/skills/watersort-asmr-like-pack/SKILL.md`
