# Investigation: Water Sort Level Modes Prompt

## Hand-off Brief

1. **What happened.** User requested a concise prompt summarizing current Water Sort level logic and modes for initializing another project.
2. **Where the case stands.** Concluded; runtime schema, manager logic, generation config, and sample JSON packs were inspected.
3. **What's needed next.** Use the final prompt in another Unity project and adapt namespace/folder names only.

## Case Info

| Field | Value |
| --- | --- |
| Ticket | N/A |
| Date opened | 2026-09-07 |
| Status | Concluded |
| System | Unity 6000.3.10f1 project, Windows workspace |
| Evidence sources | `Assets/Project/Script/**/WaterSort/*.cs`, `agent-rules/watersort-level-generation.md`, Water Sort JSON asset folders |

## Problem Statement

User asked: "tom tat logic level va cac che do hien tai thanh prompt de khoi tao o project khac"

## Evidence Inventory

| Source | Status | Notes |
| --- | --- | --- |
| Runtime schema | Available | `WaterSortJsonCatalog.cs` |
| Gameplay manager/state | Available | `WaterSortGameManager.cs`, `WaterSortBottleState.cs`, `WaterSortMoveRecord.cs` |
| Generation rules | Available | `agent-rules/watersort-level-generation.md` |
| Runtime level data | Available | 2 level packs and 2 solution packs observed |

## Investigation Backlog

| # | Path to Explore | Priority | Status | Notes |
| - | --- | --- | --- | --- |
| 1 | Read focused runtime source | High | Done | Runtime schema, manager, state, UI, bootstrap, config, and sample JSON checked |

## Confirmed Findings

### Finding 1: Level data is JSON-driven and loaded through Unity Resources

**Evidence:** `WaterSortBootstrap.cs`, `WaterSortJsonCatalog.cs`, sample level and solution packs.

**Detail:** Runtime loads levels from `Resources/WaterSort`, solutions from `Resources/WaterSortSolutions`, and palette from `Resources/WaterSortColorPalette`.

### Finding 2: Current modes are per-level flags

**Evidence:** `WaterSortJsonModeOptions`, `WaterSortGameManager.LoadLevel`.

**Detail:** `hiddenStack`, `hybridHiddenStack`, and `lockedBottles` are stored in each level and applied when constructing bottle state.

### Finding 3: Gameplay is classic Water Sort with undo and mode-aware visibility/locks

**Evidence:** `WaterSortGameManager.TryMove`, `WaterSortBottleState`, `WaterSortMoveRecord`.

**Detail:** Moves pour a contiguous visible top-color group into an empty or matching-color target. Undo restores colors, hidden-layer snapshots, and bottle-lock snapshots.

## Conclusion

**Confidence:** High

The mental model is sufficient for the user's requested prompt.
