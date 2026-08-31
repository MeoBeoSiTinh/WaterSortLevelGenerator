# Unity Gameplay Feature Agent Rules

Use these rules for interactive gameplay mechanics such as selecting actors, validating a move, transferring state, moving objects, resolving an action, undoing it, and reporting completion.

These rules were distilled from the current Water Sort bottle-transfer implementation. Reuse its staged action flow and component boundaries, but do not copy project-specific constants, scene lookups, or lifecycle weaknesses into new features.

## Feature Slice Structure

- Build a gameplay feature as a vertical slice with explicit roles: state/data, rule validation, action coordination, presentation sequencing, and optional visual/audio effects.
- Keep authoritative runtime state in a mechanic model/component. Keep derived values such as top item, contiguous group count, capacity, sorted/completed state, and valid targets recomputable from that state.
- Put move legality and transfer amount calculation in the mechanic/rule layer. Input code may select source and target, but it must not duplicate the mechanic's rules.
- Use one feature coordinator as the public entry point for an action. It owns the action lifecycle and delegates focused work to movement, rotation, rendering, audio, and effect components.
- Prefer small capability components when they have distinct state or lifecycle, such as selection feedback, spatial planning, transfer visuals, render-order control, or animation playback. Do not split code into components that only forward trivial calls.
- Cache required sibling components in `Awake` and express mandatory composition with `RequireComponent` where appropriate. Avoid repeated `GetComponent` calls during an action.
- Use serialized references, prefab-owned anchors, or injected scene services for pivots and helper transforms. Do not use `GameObject.Find`, magic object names, or hidden scene dependencies in reusable features.

## Action Transaction

- Treat every mechanic action as a transaction with named phases: `Idle -> Selected -> Validated -> Reserved -> Presenting -> Committed -> Settled`, with a defined `Canceled` recovery path.
- Validate the entire action before mutating authoritative state: source/target identity, capacity, compatibility, current game state, locks, and any feature-specific restrictions.
- Calculate immutable action data once after validation, such as source, target, amount, item/color, start state, destination state, pivot, direction, and return position. Pass that action context through the sequence instead of rereading mutable fields from several components.
- Reserve or lock every participant before presentation begins. Reject, queue, or deliberately accelerate conflicting input; never allow two actions to silently mutate the same participant.
- Commit related source and target changes together at one documented phase. Presentation callbacks may display interpolated values, but the final mechanic result must not depend on a tween reaching an incidental callback without cancellation handling.
- Recompute derived state after commit, then evaluate local completion. Emit feature/game events only after the committed state is internally consistent.
- Record undo/history only for a successfully committed action. Store the minimal inverse data required to restore both participants, and define whether undo is blocked during an active action or cancels and rolls it back first.
- Settle in one completion/finalization path: restore colliders/input, locks, sorting order, temporary renderers/effects, audio, and active-action tracking. Make cleanup safe to call after completion, cancellation, disable, restart, or scene transition.

## Interaction And Concurrency

- Keep click/tap detection and selection state in an input/controller layer. Forward a validated intent or command to the mechanic coordinator.
- Cancel selection predictably when the player taps the selected object again, taps blocked UI, chooses an invalid target, pauses, or leaves the feature.
- Use an explicit busy/lock state rather than inferring activity from a tween or collider alone. A collider may be disabled for presentation, but it is not the authoritative action guard.
- Track active actions at feature or level scope when global operations such as undo, restart, boosters, save, or win resolution must wait for them.
- When allowing action acceleration, speed up the owned sequence through a single API and await its settlement. Do not spin indefinitely on a flag; support disable/cancel and guarantee task completion.

## Spatial Planning And Presentation Contract

- Resolve target position, pivot, side/direction, screen-edge avoidance, sorting needs, and original pose before starting motion.
- Derive spatial decisions from authored anchors and camera/world bounds rather than hard-coded screen coordinates. Keep thresholds and offsets serialized or in a feature configuration asset.
- Keep gameplay state independent from shader fill, line renderers, particles, sorting order, and audio. Presentation reads an immutable action context plus display state and reports completion/cancellation back to the coordinator.
- Use curves or configuration assets for relationships such as rotation-to-fill, scale compensation, duration-by-transfer-size, offsets, and easing. Validate array/curve domains before indexing or evaluating them.
- Pool temporary effects that can overlap or recur, such as trails, streams, projectiles, hit markers, and particles. Reset enabled state, positions, colors/material properties, and ownership before returning them.

## Reusable Action Sequence

For a transfer-style feature, prefer this order unless the mechanic requires a different commit point:

1. Capture input intent and resolve source/target.
2. Validate and build an immutable action context.
3. Reserve participants and cancel selection feedback.
4. Compute anchors, pivot, direction, render order, and presentation parameters.
5. Move into an anticipation/staging pose.
6. Play the main action while presenting interpolated state and transient effects.
7. Commit authoritative state once, then recompute derived state.
8. Return or settle the actors.
9. Release resources and locks, record undo, then emit completion events.

## Verification

- Test a valid action, each invalid-action reason, same-source/target selection, empty/full boundaries, maximum transferable amount, and completion caused by either participant.
- Test rapid repeated input, overlapping actions on the same target, speed-up/skip, pause, disable, restart, and scene transition during every major sequence phase.
- Verify authoritative state, derived state, visuals, input locks, pooled resources, sorting, audio, undo history, and active-action tracking all agree after completion and cancellation.
- For deterministic mechanic logic, prefer edit-mode/unit tests around validation, action-context calculation, commit, derived-state recomputation, and undo. Use play-mode tests for tween order, pivots, colliders, pooling, and visible settlement.
