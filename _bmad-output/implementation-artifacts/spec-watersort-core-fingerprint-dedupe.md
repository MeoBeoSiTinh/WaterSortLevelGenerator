---
title: 'Water Sort core gameplay fingerprint dedupe'
type: 'bugfix'
created: '2026-09-09'
status: 'done'
baseline_commit: '7cd9c02089370610015e2bd4dab1c1e0c127ee21'
context:
  - '{project-root}/agent-rules/watersort-level-generation.md'
  - '{project-root}/Assets/Project/Editor/WaterSort/LevelGeneration/Tools/generate-watersort-exhaustive-100.js'
  - '{project-root}/Assets/Project/Editor/WaterSort/LevelGeneration/Tools/validate-pack.js'
  - '{project-root}/Assets/Project/Editor/WaterSort/LevelGeneration/Tools/generator-profile-tests.js'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pack generation can accept gameplay-identical levels that differ only by Ad bottle count/position, grid layout, bottle order, or renamed colors.

**Approach:** Add a canonical core gameplay fingerprint (Ads excluded), reject duplicates at pack accept time with deterministic retries, and keep diversity scoring based on structural gameplay only.

## Boundaries & Constraints

**Always:**
- Fingerprint includes: normal capacity/content, normal empty helpers, modeOptions, hiddenLayerIndexes, lock + unlock threshold, Mega + targetColor, other gameplay-affecting bottle fields.
- Fingerprint ignores: Ad bottles, id/displayName, gridPosition, layout/cosmetic metadata, generation metadata.
- Canonicalize before fingerprint: strip Ads → normalize color IDs by first structural occurrence → normalize bottle order when order is not gameplay-significant → preserve bottle-specific gameplay metadata.
- Before accept: validate → fingerprint → pack Set/Map duplicate check.
- Duplicate → reject + deterministic attempt-seed retry; do not accept if retries exhausted; report failure clearly.
- Stats: `DuplicateCandidatesRejected`, `DuplicateRetryCount`; optional debug `Level X rejected: duplicate of Level Y`.
- Prefer checking core puzzle before Ads; if Ads already exist, exclude them from fingerprint without large refactor.
- Keep generation deterministic for identical config/seed.

**Ask First:**
- Changing Mega/Locked/Hidden serialization shape beyond fingerprint needs.
- Regenerating committed runtime pack JSON as part of this fix.

**Never:**
- Treat Ad count/position, color rename, grid layout, or bottle permutation as diversity/uniqueness.
- Parallel replay validators; reuse canonical validation path.
- Hand-edit generated JSON to hide duplicates.
- Broad refactors outside generator fingerprint/diversity/accept + focused tests.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Same core, 2 vs 3 Ads | Identical non-Ad bottles/modes | Same fingerprint | Reject later as duplicate |
| Different Ad positions | Same core, Ads moved | Same fingerprint | Reject later as duplicate |
| Different grid positions | Same core, grid changed | Same fingerprint | Reject later as duplicate |
| Renamed colors | Same structure, remapped IDs | Same fingerprint | Reject later as duplicate |
| Reordered bottles | Same bottles, permuted order | Same fingerprint | Reject later as duplicate |
| Different normal helper count | Extra/missing empty normal helper | Different fingerprint | Accept both if otherwise valid |
| Different contents / hidden / lock / Mega | Gameplay fields differ | Different fingerprint | Accept both if otherwise valid |
| Pack duplicate | Candidate matches accepted fingerprint | Reject + retry with deterministic sub-seed | If attempts exhausted: fail generation, do not accept |
| Deterministic rerun | Same config/seed/pack | Same accepted levels + same duplicate stats | N/A |

## Code Map

- Production generator: `Assets/Project/Editor/WaterSort/LevelGeneration/Tools/generate-watersort-exhaustive-100.js` — accept loop ~1828–2054; Ads via `addAdHelperBottles` (~782); difficulty via `evaluateNormalDifficulty` (~1398); seeds via `seedFor`/`rng`.
- Canonical pack validation: `.../Tools/validate-pack.js`.
- Focused tests: `.../Tools/generator-profile-tests.js` (+ new fingerprint tests colocated or small sibling module if needed).
- Rules: `agent-rules/watersort-level-generation.md`.

## Design Notes / Pseudo-code

```text
acceptedFingerprints = Map<fingerprint, levelId>
for each levelNumber:
  for attempt in 0..maxAttempts:
    build candidate with seedFor(levelNumber, attemptSalt, ...)
    validate candidate (existing exact/canonical path)
    fp = coreGameplayFingerprint(candidate) // strips Ads; color+order canonicalize
    if acceptedFingerprints.has(fp):
      DuplicateCandidatesRejected++
      DuplicateRetryCount++
      maybe log "Level X rejected: duplicate of Level Y"
      continue
    accept; register fp; break
  else:
    fail pack generation clearly
```

Diversity/difficulty must not gain score from Ad count/position, color rename, grid, or bottle permutation.

## Tasks

- [x] Add/fix `coreGameplayFingerprint` + canonicalize helpers in production generator modules (smallest coherent place; export for tests).
- [x] Wire pack-level fingerprint Set/Map into level accept loop with deterministic retry/fail.
- [x] Ensure diversity/difficulty ignores Ad/layout/rename/permutation-only differences.
- [x] Add focused fingerprint + pack-dedupe + determinism tests.
- [x] Run `node --check` on changed JS, focused Water Sort tests, one deterministic generation dry-run for duplicate stats, `git diff --check`.

</frozen-after-approval>

## Spec Change Log

| Date | Change | Why |
|------|--------|-----|
| 2026-09-09 | Initial draft | User request: fix duplicate core puzzles accepted as distinct levels |
| 2026-09-11 | Implementation complete; tighten exhaustion test | Core fingerprint already shipped; fix stale exhaustion expectation after difficulty baseline change |

## Suggested Review Order

**Fingerprint core**

- Canonical core fingerprint (strip Ads, remap colors, sort bottles)
  [`watersort-core-fingerprint.js:123`](../../Assets/Project/Editor/WaterSort/LevelGeneration/Tools/watersort-core-fingerprint.js#L123)

- Bottle canonicalize loop used before hashing
  [`watersort-core-fingerprint.js:81`](../../Assets/Project/Editor/WaterSort/LevelGeneration/Tools/watersort-core-fingerprint.js#L81)

**Pack accept + stats**

- Duplicate reject only increments duplicate retry counters
  [`generate-watersort-exhaustive-100.js:3223`](../../Assets/Project/Editor/WaterSort/LevelGeneration/Tools/generate-watersort-exhaustive-100.js#L3223)

- Fingerprint computed before accept into pack Map
  [`generate-watersort-exhaustive-100.js:3207`](../../Assets/Project/Editor/WaterSort/LevelGeneration/Tools/generate-watersort-exhaustive-100.js#L3207)

**Validation + rules**

- Pack validator rejects duplicate cores
  [`validate-pack.js:172`](../../Assets/Project/Editor/WaterSort/LevelGeneration/Tools/validate-pack.js#L172)

- Agent rules document fingerprint invariants
  [`watersort-level-generation.md:321`](../../agent-rules/watersort-level-generation.md#L321)

**Tests**

- Deterministic uniqueness + duplicate stats
  [`generator-profile-tests.js:327`](../../Assets/Project/Editor/WaterSort/LevelGeneration/Tools/generator-profile-tests.js#L327)

- Retry-budget exhaustion asserts pure duplicate failure
  [`generator-profile-tests.js:348`](../../Assets/Project/Editor/WaterSort/LevelGeneration/Tools/generator-profile-tests.js#L348)

