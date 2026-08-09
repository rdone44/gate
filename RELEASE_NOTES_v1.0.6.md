# Release Notes — v1.0.6

**GitHub Actions Gate** — Deterministic acceptance gate that accepts a delivery
only when all five rules pass with collector evidence.

Repository: `github.com/rdone44/github-actions-gate`
Tag: `v1.0.6` (commit `e103a1f`)
Previous tag: `v1.0.5` (commit `435a190`)
Date: 2026-08-09

---

## Summary

Adds a `watch` subcommand that wraps `collect` + `evaluate` in a polling loop,
enabling continuous gate monitoring without manual re-runs.

## Changes since v1.0.5

### feat: v1.0.6 --watch mode (#17)

- New `watch` subcommand: polls `collect` + `evaluate` at a fixed interval.
- `--interval <seconds>` (default 60, minimum 10).
- `--pass-once`: exits 0 on the first PASS verdict transition.
- Default: runs until Ctrl+C / SIGINT.
- All existing collect flags work (`--owner`/`--repo`/`--sha`/`--task`/`--report`/`--branch`/`--pr`).
- Fails gracefully on collector/evaluator errors — logs to stderr, retries next interval.
- No new dependencies.

## Test suite

```
 Test Files  2 passed (2)
      Tests  89 passed (89)
```

84 existing + 5 new watch-mode flag validation tests.
