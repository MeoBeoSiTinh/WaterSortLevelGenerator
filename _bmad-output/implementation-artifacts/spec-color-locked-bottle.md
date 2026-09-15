---
title: 'Water Sort color-locked-bottle mode'
type: 'feature'
created: '2026-09-11'
status: 'done'
baseline_commit: '7cd9c02089370610015e2bd4dab1c1e0c127ee21'
context:
  - '{project-root}/agent-rules/watersort-level-generation.md'
  - '{project-root}/agent-rules/unity-gameplay-features.md'
  - '{project-root}/agent-rules/unity-ui.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Locked bottles unlock from any completed full mono bottles. Design needs a second lock type that unlocks only after N completed full mono bottles of one required color, with clear UI and generator/solver support.

**Approach:** Add `colorLockedBottles` alongside existing count-locks: per-bottle required color + count, shared pour-block while locked, color-specific unlock counting, UI badge (count tinted with required color), and generator/config/fingerprint/validation coverage. Both modes may appear on the same level.

## Boundaries & Constraints

**Always:**
- Schema: `modeOptions.colorLockedBottles`; bottle fields `isColorLocked`, `unlockRequiredColor` (palette index), `unlockCompletedColorBottleCount` (≥1).
- One lock type per bottle: never both count-lock (`isLocked` + `unlockCompletedBottleCount`) and color-lock on the same bottle.
- Count-lock and color-lock may coexist on the same level (`lockedBottles` and `colorLockedBottles` both true).
- While locked, color-locked bottles cannot be source or target (same gate as count-locks); contents are unavailable to pour logic / stored-solution replay.
- Unlock when count of completed full mono bottles of `unlockRequiredColor` ≥ `unlockCompletedColorBottleCount`. “Completed” matches existing `IsFullMonoComplete` (full, single color, not locked).
- Levels with color-locks must contain enough layers of each required color to form the unlock counts (capacity × N for that color across non-Ad bottles).
- Canonical JS validator/replay and C# runtime must agree on unlock + legality. Generator must reuse that path (no parallel replay rules).
- Fingerprint includes `colorLockedBottles`, `isColorLocked`, `unlockRequiredColor`, `unlockCompletedColorBottleCount`.
- Config mirrors locked-bottle style: `allowColorLockedBottleMode`, chance, min/max bottle counts, min/max color-unlock counts; profile-driven; do not silently soften other difficulty floors.
- UI: while color-locked, show required count as a number placed in front of the bottle, colored with the required palette color (e.g. need 2 orange → “2” in orange). Count-lock UI may keep existing LOCK treatment.

**Ask First:**
- Regenerating committed runtime pack JSON as part of this feature.
- Changing Special/NearWin/Mega to force-enable color-locks (default: follow profile flags; Mega/NearWin may keep locks off like today unless config says otherwise).
- Allowing both lock types on one bottle.

**Never:**
- Treat Ad bottles as completed unlock progress or as required color sources for unlock feasibility.
- Require Ad bottles in stored solutions.
- Soften approved difficulty floors to raise generation success.
- Hand-edit generated packs to fake color-lock correctness.
- Parallel pour/unlock engines that diverge from canonical validation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Color unlock | 2 full mono bottles of color C; bottle needs C×2 | Bottle unlocks; pourable | N/A |
| Wrong color progress | 2 full mono of other colors only | Stays locked | Reject pours involving it |
| Mixed locks on level | One count-lock + one color-lock | Each uses its own predicate | N/A |
| Insufficient color stock | Level needs C×2 but &lt; 2×capacity layers of C | Reject at generate/validate | Clear validation error |
| Coexistence on one bottle | Both `isLocked` and `isColorLocked` | Invalid | Reject validate / refuse generate |
| Stored solution | Moves while still color-locked | Illegal | Fail replay |
| Undo | Unlock then undo pour that enabled unlock | Relock if predicate fails again | Restore lock bits |

</frozen-after-approval>

## Code Map

- `Assets/Project/Script/Gameplay/WaterSort/WaterSortJsonCatalog.cs` — mode + bottle DTOs
- `Assets/Project/Script/Gameplay/WaterSort/WaterSortBottleState.cs` — lock state / full-mono complete
- `Assets/Project/Script/Core/WaterSort/WaterSortGameManager.cs` — LoadLevel, pour guards, RefreshBottleLocks, undo
- `Assets/Project/Script/UI/WaterSort/WaterSortGameView.cs` — LockedLabel / Refresh lock visuals + palette colors
- `Assets/Project/ScriptableObject/Script/WaterSort/WaterSortGenerationConfig.cs` + `.asset` — profile fields
- `Assets/Project/Editor/WaterSort/LevelGeneration/Tools/generate-watersort-exhaustive-100.js` — chooseLockedBottles / replaySolutionWithLocks / emit
- `Assets/Project/Editor/WaterSort/LevelGeneration/Tools/validate-pack.js` — exact replay unlock
- `Assets/Project/Editor/WaterSort/LevelGeneration/Tools/watersort-core-fingerprint.js` (+ tests)
- `Assets/Project/Editor/WaterSort/LevelGeneration/WaterSortLevelDataDesignerWindow.cs` — authoring
- `agent-rules/watersort-level-generation.md` — schema/mode rules

## Tasks & Acceptance

**Execution:**
- [x] `WaterSortJsonCatalog.cs` + `WaterSortBottleState.cs` + `WaterSortGameManager.cs` — schema/state/load; color-specific completed count; RefreshBottleLocks for both lock types; pour/undo — runtime authority
- [x] `WaterSortGameView.cs` — show color-lock badge as tinted count in front of bottle; keep count-lock UX — player-facing condition
- [x] `validate-pack.js` + generator replay helpers — color-aware unlock + legality; reject insufficient color stock / dual lock on one bottle — canonical validation
- [x] `generate-watersort-exhaustive-100.js` + `WaterSortGenerationConfig.cs` + `.asset` — choose/emit color-locks; ensure enough required color; profile flags — production generation
- [x] `watersort-core-fingerprint.js` (+ tests) — include new mode/bottle fields — pack uniqueness
- [x] `WaterSortLevelDataDesignerWindow.cs` + `agent-rules/watersort-level-generation.md` — authoring + rules docs — keep tools/docs aligned
- [x] Focused JS tests covering I/O matrix unlock/stock/coexistence/replay cases — prevent rule drift

**Acceptance Criteria:**
- Given a color-locked bottle needing color C × N, when N full mono C bottles exist, then it unlocks and becomes pourable.
- Given fewer than N full mono C bottles, when the player tries to use that bottle, then pours are rejected and it stays locked.
- Given a level with both count-lock and color-lock bottles, when progress meets only one predicate, then only that bottle unlocks.
- Given generated/validated color-lock levels, when solutions replay, then every move is legal under color-lock rules and unlock timing.
- Given a color-locked bottle in UI, when still locked, then the required count appears in front of the bottle tinted with the required palette color.

## Spec Change Log

## Design Notes

Unlock predicates stay separate; shared `IsLocked` (or equivalent) blocks pours:

```text
completedAny = count IsFullMonoComplete
completedOf(C) = count IsFullMonoComplete && topColor==C
countLock unlocks when completedAny >= threshold
colorLock unlocks when completedOf(requiredColor) >= colorThreshold
one bottle → exactly one of {countLock, colorLock, none}
```

UI badge: numeric string of `unlockCompletedColorBottleCount` with `color = palette[unlockRequiredColor]`, anchored in front of the bottle (not the generic `"LOCK"` label).

## Verification

**Commands:**
- `node --check` on every changed JS file — syntax OK
- Focused fingerprint + new color-lock / validate-pack / generator tests — pass
- `git diff --check` — no whitespace errors

**Manual checks (if no CLI):**
- Play one authored/generated color-lock level in Unity: badge color/count, unlock after N matching completed bottles, pour blocked before unlock. Note if Unity compile was not run.

## Suggested Review Order

**Runtime unlock**

- Color-specific completed count + cascade unlock loop
  [`WaterSortGameManager.cs:283`](../../Assets/Project/Script/Core/WaterSort/WaterSortGameManager.cs#L283)

- Bottle color-lock state fields
  [`WaterSortBottleState.cs:11`](../../Assets/Project/Script/Gameplay/WaterSort/WaterSortBottleState.cs#L11)

**UI**

- Tinted unlock count badge in front of bottle
  [`WaterSortGameView.cs:592`](../../Assets/Project/Script/UI/WaterSort/WaterSortGameView.cs#L592)

**Canonical replay / generation**

- Combined lock replay with cascade unlock
  [`generate-watersort-exhaustive-100.js:2249`](../../Assets/Project/Editor/WaterSort/LevelGeneration/Tools/generate-watersort-exhaustive-100.js#L2249)

- Color-lock selection + free-layer stock
  [`generate-watersort-exhaustive-100.js:2188`](../../Assets/Project/Editor/WaterSort/LevelGeneration/Tools/generate-watersort-exhaustive-100.js#L2188)

- Pack validation stock + dual-lock reject
  [`validate-pack.js:96`](../../Assets/Project/Editor/WaterSort/LevelGeneration/Tools/validate-pack.js#L96)

**Tests / rules**

- Focused color-lock cases
  [`watersort-color-lock-tests.js:1`](../../Assets/Project/Editor/WaterSort/LevelGeneration/Tools/watersort-color-lock-tests.js#L1)

- Generation rules
  [`watersort-level-generation.md:272`](../../agent-rules/watersort-level-generation.md#L272)

