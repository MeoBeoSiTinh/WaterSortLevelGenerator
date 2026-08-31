# Unity Animation, FX, Shader, Tween, And MMF Agent Rules

Use these rules for Unity animation, tweening, particle/VFX, materials, shaders, and More Mountains Feedbacks (MMF).

## Boundaries And Workflow

- Keep gameplay mechanics independent from presentation effects; gameplay raises events or exposes state, while animation/FX/UI listeners react without deciding game outcomes.
- For a simple effect, use one lean cycle: read the exact prefab, material, shader, and caller → make the smallest visible change → play-test it → profile only when the effect is repeated, expensive, or reported slow.
- Do not introduce DOTween, MMF, VFX Graph, custom shaders, or new render features for a simple effect when built-in animation, Particle System, or a small script is sufficient.
- When built-in tools and installed packages cannot meet the requirement, AI may install a free animation/FX package from Unity Package Manager or a trusted Git source if its license is clear and it has no dependency conflict; report the package and reason. Require user approval for Asset Store, paid, or unclear-license packages.
- Keep each editable feature effect as a prefab and place scripts, prefabs, materials, shaders, and assets under `Assets/Project/{Scripts|Prefab|Asset|ScriptableObject}/<FeatureOrFunction>/`.

## Animation And Tweening

- Use Animator for reusable stateful or continuously looping animation; use tweening or a small event-driven script for short, one-shot presentation motion.
- Do not create tweens every frame or from polling loops; create, restart, or update them only on a state/event change.
- Keep a tween/sequence reference when it can be restarted or interrupted; kill it in `OnDisable`/`OnDestroy` or link it to the target lifecycle before reuse or destruction.
- If DOTween recycling is enabled, clear retained references on kill and do not reuse a cached tween reference until its lifecycle is known; recycling trades safety complexity for lower GC.
- Use Animator culling for off-screen objects when their animation does not affect gameplay; do not cull objects whose transforms, IK, or events must keep updating off-screen.
- Prefer one reusable controller/prefab over many near-identical Animator Controllers, clips, or ad-hoc per-instance animation scripts.

## Mechanic Animation Sequences

- For multi-stage gameplay motion, use one authoritative sequence/coordinator with explicit phases instead of a chain of unrelated tween callbacks. Focused animation components may implement stages, but completion and cancellation return to the coordinator.
- Build an immutable action context before playback containing the participants, original poses, target anchors, pivot/direction, amount, and presentation parameters. Do not depend on mutable cross-component fields changing at the right callback.
- Separate anticipation, main action, and recovery/settle stages. Resolve pivot, direction, screen-edge avoidance, and sorting order before the first stage starts.
- Interpolate presentation state such as shader fill, stream position, scale correction, and rotation from one normalized sequence value or compatible authored curves so visuals cannot drift apart.
- Gameplay commits at one explicit phase; tween updates only visualize progress. If the design commits before the animation ends, block conflicting actions and define rollback/cancellation behavior.
- Keep references to every independently running tween or group them in a sequence. On completion, cancellation, disable, restart, and scene transition, restore pose/collider/input, render order, audio, temporary effects, and locks exactly once.
- Allow skip or speed-up through the sequence owner. Await a guaranteed completion/cancellation signal instead of polling an unbounded boolean flag.
- Pool short-lived streams, trails, and repeated effects, and fully reset their enabled state, points, colors/material values, and owner when released.
- Put motion durations, offsets, transfer-size timing, easing, and fill/rotation curves in serialized feature settings or ScriptableObjects; validate curve domains and collection indices.
- Apply the transaction, concurrency, and verification rules in `unity-gameplay-features.md` whenever animation presents an authoritative mechanic action.

## Particles And FX

- Use the built-in Particle System for small, conventional effects; consider VFX Graph, GPU instancing, or particle jobs only after a profiler shows particle CPU/GPU cost warrants it.
- Pool frequently spawned effects; stop, reset, and return them to the pool instead of instantiate/destroying each event.
- Set a bounded particle count, lifetime, emission rate, and effect duration; disable or return off-screen/inactive effects when they have no gameplay value.
- Minimize transparent overdraw, texture size, material variants, and simultaneous particle systems; prefer one simpler layered effect when it gives the same readable feedback.
- Keep custom particle behaviour off the main thread only when profiling proves the need; prefer the Particle System Job System with Burst over repeated `GetParticles`/`SetParticles` calls for large workloads.

## Shaders, Materials, And URP

- Prefer existing URP Lit/Unlit or Shader Graph for simple visual changes; add a custom shader only when its visual requirement cannot be expressed cleanly otherwise.
- Compute only what is visible and necessary; reduce per-pixel texture samples, branches, transparency layers, and expensive effects before optimizing CPU code around them.
- Keep shader variants few and reuse materials where the visual result permits; avoid keyword proliferation and per-renderer material duplication.
- Keep custom mesh shaders compatible with SRP Batcher where practical; do not use `MaterialPropertyBlock` merely for convenience when batching is important.
- Enable depth, opaque texture, post-processing, shadows, and extra lights only when a scene or shader demonstrably needs them; profile before changing global URP settings.

## MMF

- Use MMF as a reusable presentation response to an event, not as the owner of game mechanics, progression, win/lose logic, or persistent state.
- Reuse configured MMF prefabs/players for recurring feedback and prevent overlapping playback unless stacking is intentional and visually required.
- Use MMF `PerformanceMode` in performance-sensitive builds or heavy feedback setups when losing Inspector progress refresh is acceptable.
- If MMF is absent, describe the equivalent built-in/tween fallback instead of silently adding the dependency.

## Verification

- For an animation/FX/shader change, verify the exact trigger, interruption/disable path, scene transition or pooling path when relevant, and visible result in Unity.
- Use Unity Profiler, Frame Debugger, or a target-device capture only for a reported or suspected bottleneck; report the measured constraint and unverified paths concisely.
