# Deferred Work

## Deferred findings (fingerprint-dedupe review)

- Exhaustion test still uses a magic Easy seed + low retry budget rather than an injected duplicate fixture stream (acceptable for now; rename clarifies intent).
- `maxDuplicateAttempts` still gates quality retries as well as duplicate retries (counter stats are now duplicate-only; loop naming is pre-existing).

## Deferred findings (color-locked-bottle review)

- Generator may silently drop color-locks when replay fails after selection (falls back to count-lock/none) instead of hard-rejecting the candidate.
- UI shows required unlock count, not remaining progress toward unlock.
- Mixed per-bottle capacities make `capacity * N` stock checks approximate (uses the locked bottle's capacity).

## Queued after fingerprint-dedupe

- ~~**color-locked-bottle mode**~~ — implemented; see `spec-color-locked-bottle.md`
