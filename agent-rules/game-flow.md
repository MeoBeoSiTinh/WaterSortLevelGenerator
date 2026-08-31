# Unity Game Flow Agent Rules

Use these rules for game-wide state, level flow, pause/restart/quit, win/lose handling, and small manager decisions.

## Game Manager

- Every game should have a `GameManager` for game-level state and flow such as play, pause, resume, win, lose, restart, quit, level transition, and scene transition.
- Keep `GameManager` out of UI rendering and mechanic rules. It coordinates state changes and broadcasts events; UI and gameplay systems respond through clear methods/events.
- Keep runtime managers on separate GameObjects unless the project has an explicit composite root/prefab pattern that says otherwise.
- Put game-flow managers under `Assets/Project/Core/Game/` unless the project already has a stronger convention.
- Small managers can live inside or beside `GameManager` when they are short and tightly tied to game flow.
- Do not create a separate `InputManager` for simple click/tap/button input; keep simple input handling near the relevant gameplay or UI script.

## Split When Needed

- Split `LevelFlowController` out of `GameManager` when level loading, restart, next level, or scene transition logic grows beyond simple state changes.
- Split `SaveManager`, `AudioManager`, or `SceneTransitionManager` only when the feature needs real persistent state, audio policy, or reusable scene transition behavior.
- Avoid manager classes that only wrap one or two trivial calls; prefer direct references/events until separation reduces real complexity.

## Boundaries

- Gameplay controllers own mechanic rules, validation, state transitions inside the current level, and win/fail detection for that mechanic.
- `GameManager` owns the game-level response to win/fail events, such as changing state, restarting, advancing level, or asking UI to show screens through events.
- `UIManager` owns presentation, screen/popup lifecycle, UI prefab spawning, and transition display; it must not decide gameplay rules.

## Feature Action Integration

- A gameplay feature coordinator owns its local action transaction, participant locks, mechanic commit, derived-state recomputation, and local completion detection. `GameManager` observes the result and decides game-level responses.
- Track active feature actions at level scope when undo, boosters, pause, restart, save, win/lose resolution, or scene changes must wait for or cancel them.
- Do not declare win/lose from partially presented or partially committed state. Settle or cancel relevant actions, verify authoritative state, then publish the result once.
- Restart, level unload, and scene transition must invoke feature cancellation/cleanup before discarding global active-action tracking or pooled presentation resources.
- Use typed feature events or a narrow event channel for committed, settled, canceled, and completed outcomes. Subscribe and unsubscribe symmetrically; avoid a growing static event bag with ambiguous ownership.
- Apply `unity-gameplay-features.md` for the internal structure of selection, validation, transfer/move, undo, and animated mechanic actions.
