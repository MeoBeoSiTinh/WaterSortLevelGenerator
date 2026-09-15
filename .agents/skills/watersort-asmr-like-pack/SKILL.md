---
name: watersort-asmr-like-pack
description: >-
  Recreate ASMR Water Sort screenshot batches as similar solvable Water Sort
  level+solution JSON packs (modes, color count, bottle count). Use when the
  user attaches ASMR screenshots, asks for similar levels, screenshot-to-JSON,
  bags/frost/hidden mapping, or another ASMR-like pack after 007/008.
---

# Water Sort — ASMR-like Screenshot Packs

## Goal

From mobile **ASMR Water Sort** screenshots, produce a new pack of solvable levels that feel similar (≥ mode + color/bottle budget). Prefer copying visible color bars when reliable; otherwise let the production generator invent internals.

Do **not** invent a parallel engine. Always call the production generator/validator path.

## Required reads (first)

1. `agent-rules/watersort-gameplay-modes.md`
2. `agent-rules/watersort-level-generation.md`
3. `.agents/skills/watersort-generate-levels/SKILL.md` (pack numbering, ads, validation)
4. Existing tool: `Tools/generate-asmr-like-pack.js`

## Screenshot → mode mapping (project convention)

| Screenshot cue | JSON / generator mode |
|---|---|
| Paper **bags** on bottles | `lockedBottles` / `isLocked` (count-lock) |
| Icy / **frost** bottle with unlock number | `colorLockedBottles` / `isColorLocked` |
| Layers with **?** (top may be visible) | Prefer `hybridHiddenStack`; full-? boards may use `hiddenStack` |
| Large central flask (heart / lungs / peacock) | `megaBottle` |
| Play / Free empty tubes at edges | `isAdBottle` (optional assist; 2–3 per pack rules) |
| Top shelf bags in UI only | Usually **not** board locked bottles — confirm before forcing locked |

Never enable `hiddenStack` and `hybridHiddenStack` together. One bottle must not be both count-locked and color-locked.

## Quality bar (learned from playtest feedback)

1. Match **mode mix**, **~color count**, **~core bottle count** (non-ad). Exact bar copy is best when readable; generator fill is OK for `?` / bag interiors.
2. Do **not** add extra **normal empty helpers** beyond what mega needs (~2) or what the screenshot clearly shows.
3. Keep generator **ads = 2 or 3**. Do not hand-add more ads “for safety.”
4. **Mega:** match ref denseness — **0 normal empty helpers** (`min/maxMegaNormalHelperCount: 0`). Do not auto-add spare empty tubes; workspace comes from pouring exposed target into mega first. Still allow 2–3 ads only. Reject **near-mono** normals (3–4 identical layers of one color).
5. Color totals must remain capacity-legal and **solvable**; stored solutions must replay.
6. Prefer **next free pack** (`watersort-levels-###.json`). Do not overwrite unless user asks.
7. Soften difficulty gates **only** in the ASMR temp config inside `generate-asmr-like-pack.js`, never in production `WaterSortGenerationConfig.asset`.

Regenerate only mega slots into an existing pack:

```powershell
$env:WATERSORT_ASMR_PACK = "7"
$env:WATERSORT_ASMR_ONLY_LEVEL = "1"
$env:WATERSORT_ASMR_MERGE = "1"
node Tools/generate-asmr-like-pack.js
```

## Workflow

### 1. Ingest screenshots

- Copy attachments to `Tools/_asmr_shots/` (or `Tools/_asmr_shots/batchN/`).
- Name `level1.png` … `level10.png` in attachment order.
- Classify each: mega / classic / hidden / hybrid / locked / colorLocked (+ combinations).
- Estimate `core` (non-ad bottles) and distinct `colors` (~6–8 typical).
- **Sort pack level ids by ASMR in-game level number** (11→20), not attachment/file order.

Optional helpers (pixel sampling, imperfect):

- `Tools/detect-bottles.js`
- `Tools/sample-asmr-colors.js`
- `Tools/rebuild-screenshot-level1.js` (hand L1 mega example — avoid surplus empties/ads)

### 2. Prefer copy vs invent

| Board type | Approach |
|---|---|
| Fully visible classic / clear mega tubes | Prefer hand bars → solve/validate; else generator |
| Many `?` / bags / frost | Spec modes + counts → `generate-asmr-like-pack.js` |
| Mega | Generator mega with colorWeights budget; expect ~2 normal empties |

### 3. Extend / run ASMR pack tool

Edit `SPECS_BY_PACK` in `Tools/generate-asmr-like-pack.js` for the new pack number, e.g.:

```js
{ id: 1, profile: "Normal", core: 18, colors: 8, helpers: 0, modes: ["hybrid", "locked"], note: "ASMR12 hybrid+bags" }
```

`modes` tokens: `mega` | `hidden` | `hybrid` | `classic` | `locked` | `colorLocked`.

Run (PowerShell):

```powershell
$env:WATERSORT_ASMR_PACK = "8"
Remove-Item Env:WATERSORT_ASMR_ONLY_LEVEL -ErrorAction SilentlyContinue
node Tools/generate-asmr-like-pack.js
```

Smoke one level:

```powershell
$env:WATERSORT_ASMR_PACK = "8"
$env:WATERSORT_ASMR_ONLY_LEVEL = "3"
node Tools/generate-asmr-like-pack.js
```

Tool behavior (do not regress):

- Builds a **temp** YAML config; forces mode chances; sets colorWeights to exact count.
- Keeps `allowColorLockedBottleMode: 1` even when frost chance is 0 so composed boards use `desiredDistinctColors` (otherwise full `paletteSize=13`).
- Mega path uses profile `colorWeights` via production `buildMegaLevel` (not always 13).
- Does **not** set `WATERSORT_CORE_BOTTLE_COUNT` + color + helper env together (that disables mega / conflicts).
- Retries until mode flags match; validates with `validate-pack.js`.
- Writes Unity `.meta` for new JSON if missing (unique guids).

### 4. Outputs

- `Assets/Project/Data/WaterSort/Resources/WaterSort/watersort-levels-###.json`
- `Assets/Project/Data/WaterSort/Resources/WaterSortSolutions/watersort-solutions-###.json`

Confirm:

```bash
node Assets/Project/Editor/WaterSort/LevelGeneration/Tools/validate-pack.js <levels.json> <solutions.json>
```

Expect `invalid: 0`.

### 5. Report to user

Table: pack level id, screenshot cue, modes, core bottles, colors, empty normals, ads, steps. Note invent vs copy.

## Existing packs (reference)

| Pack | Source |
|---|---|
| 007 | First 10 ASMR shots (L1–10) |
| 008 | ASMR 11–20 (pack ids sorted by ASMR level number) |

## Related

- Full config-driven packs (no screenshots): `watersort-generate-levels`
- Portable Lab: `agent-rules/watersort-level-lab.md`
