# Water Sort — Gameplay Modes, Rules, Create, Solve

Use this guide when explaining, implementing, authoring, generating, or validating Water Sort levels. Generation schema details live in `Docs/watersort-level-generation.md`. Portable Lab workflow lives in `(Level Lab: see Tools/LevelLab when present)`.

## 1. Core pour rules

- A legal pour moves the **top contiguous same-color group** from a source bottle into a target bottle.
- Target must be empty **or** its top visible color must match the poured color.
- Target must have enough free capacity for the whole poured group (partial pours are not allowed).
- Empty bottles use `colorsBottomToTop: []` (never a sentinel color index).
- Layers are stored **bottom → top** (`colorsBottomToTop[0]` is the bottom).

### Win conditions

| Mode | Win when |
|---|---|
| Classic / Hidden / Hybrid / Locked / Color-locked | Every non-empty normal bottle is **full** and **mono-color** |
| Mega | Every mega bottle is **full of its `targetColor`** (other bottles need not be sorted) |

Ad bottles are optional assistance and never required for a win path stored in solutions.

## 2. Bottle roles

| Role | Meaning |
|---|---|
| Normal | Standard playable bottle, capacity 2–5 |
| Locked (count) | Starts locked; unlocks after N **any-color** completed full mono bottles |
| Color-locked | Starts locked; unlocks after N completed full mono bottles of **`unlockRequiredColor`** |
| Mega | One-way sink: never a source; accepts only `targetColor`; capacity 12–20 |
| Ad | Empty helper reserved for ads/rewards; **never** used in stored solutions; does **not** count toward unlock progress |

One bottle must not be both count-locked and color-locked. Count-locks and color-locks may appear on different bottles in the same level.

## 3. Gameplay modes (`modeOptions`)

Modes can combine when rules allow (e.g. hybrid + color-lock). Full hidden and hybrid hidden are mutually exclusive.

### Classic (no special mode flags)

Standard Water Sort sorting on the 8×5 grid.

### Full hidden stack — `hiddenStack: true`

Lower layers are hidden until layers above are poured away. Color order does not change; only visibility does. Solutions must remain legal under reveal rules.

### Hybrid hidden stack — `hybridHiddenStack: true`

Only selected non-top layers listed in `hiddenLayerIndexes` start hidden. Do not hide the starting top layer. Do not hide every lower layer (that is full hidden-stack). Mutually exclusive with `hiddenStack`.

### Count-locked bottles — `lockedBottles: true`

Bottles with `isLocked: true` and `unlockCompletedBottleCount` (typically 1–3). While locked they cannot be source or target. Unlock when the board has enough completed full mono bottles (any color). Ad/Mega bottles do not count as unlock progress.

### Color-locked bottles — `colorLockedBottles: true`

Bottles with `isColorLocked: true`, `unlockRequiredColor`, and `unlockCompletedColorBottleCount` (prefer span **1–3**). Unlock only after that many completed full mono bottles of the required color. UI shows the required count overlaid on the bottle in the required color (large, outlined). Generation may reduce distinct colors so thresholds 2–3 are reachable.

### Mega bottle — `megaBottle: true`

One central mega bottle with starter target-color layer(s). Player must uncover and pour only `targetColor` into it. Blocker colors and helpers create rearrange pressure. Mega never pours out.

### Ads helpers

Every generated level includes **2 or 3** empty `isAdBottle: true` bottles. They are not part of the core puzzle, not in stored solutions, and not unlock counters.

### Special / NearWin

Special profile may build near-win boards with trap/false-progress pressure. NearWin metadata lives under solution `specialOptions`. Ads may rescue; stored SafeSolution paths remain assist-free when required by NearWin rules.

## 4. How to create levels

### A. Production generator (preferred)

Project root:

```bash
node Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Tools/generate-watersort-exhaustive-100.js <packNumber> [seed] [Easy|Normal|Hard|VeryHard|Special]
```

Config: `Assets/LevelGenerator/Data/WaterSort/Generation/WaterSortGenerationConfig.asset` (YAML).

Outputs:

- `Assets/LevelGenerator/Data/WaterSort/Resources/WaterSort/watersort-levels-###.json`
- `Assets/LevelGenerator/Data/WaterSort/Resources/WaterSortSolutions/watersort-solutions-###.json`

In a portable Level Lab folder:

```bash
node Tools/LevelLab/generate.js
node Tools/LevelLab/generate.js --profile Hard --seed 12345
```

Rules of thumb:

- Do not overwrite packs unless explicitly asked.
- Do not hand-edit generated JSON to hide generator bugs — fix generator/config and regenerate.
- Keep the approved difficulty baseline; do not silently soften helper/partial/safe-move/dead-end/trap gates.
- Honor color-lock, count-lock, hidden, Mega, Ad, fingerprint-dedupe, and trivial 3+1 split bans.

### B. Unity Level Data Designer

Menu: **Tools → Water Sort → Level Data Designer**.

Edit one level in a pack (grid, bottles, modes, colors, locks, Mega). Saving resets the matching stored solution — re-solve that level afterward.

### C. Unity generation package (other projects)

Import `WaterSortLevelGeneration.unitypackage` (built via `Tools/create-watersort-level-generation-package.js`). Paths become `Assets/LevelGenerator/...`. Read package `AI_CONTEXT.md` first.

### D. Manual JSON

Allowed when requested. Must follow schema in `watersort-level-generation.md`, invalidate/regenerate the matching solution, then `validate-pack.js`.

## 5. How to solve and validate

### What a “solution” is

- Stored moves are **1-based bottle indexes**: `{ "fromBottle": 1, "toBottle": 3 }`.
- Map `level.id` ↔ `solution.levelNumber` inside a pack (not global file order).
- Exact replay under the level’s `modeOptions` is the authority — not a second parallel rule engine.
- Only claim global shortestness when the solver proved it; otherwise store representative known paths.

### After generation (routine)

```bash
node Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Tools/validate-pack.js <levels.json> <solutions.json>
```

Lab `generate.js` already runs this before publishing.

### After manual designer/JSON edits (stale solution)

```bash
node Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Tools/solve-watersort-solutions.js
```

Then validate the pack. Do **not** use the general solver as routine post-generation validation (slow and unnecessary when the generator already emitted replay-valid paths).

### Focused tests

```bash
node --check Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Tools/generate-watersort-exhaustive-100.js
node Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Tools/watersort-color-lock-tests.js
node Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Tools/watersort-core-fingerprint-tests.js
node Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Tools/mega-generator-v2-tests.js
node Assets/LevelGenerator/Editor/WaterSort/LevelGeneration/Tools/generator-profile-tests.js
```

## 6. Quick mode checklist for authors

- [ ] Grid 8×5, unique in-bounds `gridPosition`, ≤40 bottles
- [ ] Normal capacity 2–5; Mega 12–20
- [ ] 2–3 empty Ads; Ads absent from solution moves
- [ ] Not both `hiddenStack` and `hybridHiddenStack`
- [ ] No bottle with both count-lock and color-lock
- [ ] Color-lock stock: free layers of required color ≥ capacity × unlock count
- [ ] Mega: enough target layers, never source, only receives `targetColor`
- [ ] Stored solution exact-replays under all mode transitions (unlock/reveal)
- [ ] No trivial non-intro `(capacity-1)+1` color split
