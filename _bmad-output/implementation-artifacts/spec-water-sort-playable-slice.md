---
title: 'Water Sort playable slice'
type: 'feature'
created: '2026-08-31'
status: 'done'
context:
  - '{project-root}/agent-rules/unity-ui.md'
  - '{project-root}/agent-rules/game-flow.md'
  - '{project-root}/agent-rules/unity-gameplay-features.md'
---

<frozen-after-approval reason="human-owned intent - do not modify unless human renegotiates">

## Intent

**Problem:** The project needs a playable Water Sort game that works immediately from Unity Play mode.

**Approach:** Add a compact runtime-created UI, gameplay manager, editable ScriptableObject palette/level/catalog data, and default starter levels.

## Boundaries & Constraints

**Always:** Bottles have per-level capacities of 4 or 5. A pour can only start from a non-empty bottle and can only target an empty bottle or a bottle whose top color matches the poured color. Undo and restart must operate on the current level. Any listed level can be selected directly.

**Ask First:** Replacing this code-built prototype with authored prefabs, animations, persistence, ads/IAP, or external art.

**Never:** Put new authored files outside `Assets/Project/`; use hard-coded level state as the only editable source; require manual scene setup before the first Play test.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid pour | Source top color matches target top color or target is empty | Top contiguous color group moves up to target capacity; undo becomes available | N/A |
| Invalid color | Target has a different top color | No state mutation; selection clears; message explains rule | Reject move |
| Empty/full | Source is empty or target is full | No state mutation; message explains boundary | Reject move |
| Complete level | Every non-empty bottle is full and one color | Win message shown; undo blocked; player can restart or pick level | N/A |

</frozen-after-approval>

## Code Map

- `Assets/Project/ScriptableObject/Script/WaterSort/` -- editable data definitions.
- `Assets/Project/Script/Gameplay/WaterSort/` -- bottle state and undo record.
- `Assets/Project/Script/Core/WaterSort/` -- runtime bootstrap and game manager.
- `Assets/Project/Script/UI/WaterSort/` -- compact generated UGUI screen.
- `Assets/Project/Script/Editor/WaterSort/` -- default ScriptableObject asset creation.

## Tasks & Acceptance

**Execution:**
- [x] Add ScriptableObject data types for palette, level, and catalog.
- [x] Add core rules for selection, pour validation, move commit, undo, restart, and win detection.
- [x] Add simple level-select, board, undo, restart UI.
- [x] Add editor-created default data assets so Play mode works without manual setup.

**Acceptance Criteria:**
- Given `SampleScene` is opened, when Play is pressed after scripts compile, then a playable Water Sort screen appears.
- Given an invalid pour is attempted, when the target top color differs, then no colors move and the UI shows a message.
- Given a valid move has committed, when Undo is clicked, then the moved colors return to their source bottle.
- Given any level button is clicked, when the level loads, then its ScriptableObject bottle capacities and colors are used.

## Verification

**Commands:**
- `dotnet build` or Unity compile -- expected: no C# compile errors.

**Manual checks:**
- Open `Assets/Scenes/SampleScene.unity`, press Play, try valid/invalid pours, Undo, Restart, and level buttons.
