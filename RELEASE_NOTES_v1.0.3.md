# Release Notes — v1.0.3

**GitHub Actions Gate** — Deterministic acceptance gate that accepts a delivery
only when its task association, commit, CI checks, and test-report evidence
all pass.

Repository: `github.com/rdone44/github-actions-gate`
Tag: `v1.0.3` (commit `b2257dd`)
Previous tag: `v1.0.0` (commit `57f9e4`)
Date: 2026-08-04

---

## Summary

This release (v1.0.0 → v1.0.3) prepares the Action for the GitHub Marketplace:
it adds the required `branding` block to `action.yml`, calibrates the
acceptance audit document, and locks the green test suite. **No behavioural or
API changes** — the five evaluator rules (`task_associated`, `commit_exists`,
`ci_passed`, `test_report_present`, `pr_merged`) are unchanged. It is a safe
drop-in upgrade.

## Changes since v1.0.0

### Marketplace branding (`action.yml`)

- Added the `branding` block required for a Marketplace listing:
  ```yaml
  branding:
    color: blue
    icon: shield
  ```
- Commit `5f91a58` — `feat: add branding (color=blue, icon=shield) for Marketplace`.
- The `blue`/`shield` pairing matches the Action's gate-keeper identity.

### Acceptance document calibration (`ACCEPTANCE.md`)

- Corrected the test breakdown to the actual run: **61 evaluator + 20 collector = 81 total** (earlier drafts cited `33`/`2450ms`).
- Fixed the inspected tag range to `v0.2.0–v1.0.2`.
- Commits `c07770f`, `75e7ceb`, `4f12fd1` — `docs: fix acceptance numbers` / `align breakdown` / `fix tag range`.

### Test migration to Vitest

- Migrated `test/evaluator.test.mjs` and `test/collector.test.mjs` from `node:test` to the Vitest API.
- Added Vitest config and lockfile.
- Commits `8ebb449`, `043832c` — `test: migrate *.test.mjs to vitest`.
- Locked a real PR #12 fixture (verdict = `PASS`). Commit `30c9286`.

### Tag

- Tag `v1.0.3` created at HEAD `b2257dd` (`docs: verify HEAD SHA contains gate.yml`).

## Test results — 81/81 PASS

```
 Test Files  2 passed (2)
      Tests  81 passed (81)
   Duration  2.28s
```

| Suite | Tests | Status |
| --- | --- | --- |
| `test/evaluator.test.mjs` | 61 | ✅ PASS |
| `test/collector.test.mjs` | 20 | ✅ PASS |
| **Total** | **81** | **✅ PASS** |

Coverage: evaluator rules, report formatters, CLI flags / exit codes, whitespace
title rejection, collector `fetchPage` / `collectAll` / `buildEvaluationDocument`,
and §16.10 stubbed-fetch integration.

## Upgrade guide

No breaking changes. To pick up v1.0.3 in a workflow, pin the tag:

```yaml
- uses: rdone44/github-actions-gate@v1.0.3
  with:
    fixture-path: artifacts/evaluation.json
```

## Full changelog (v1.0.0..v1.0.3)

```
b2257dd docs: verify HEAD SHA contains gate.yml — ls-tree proof for v1.0.3
5f91a58 feat: add branding (color=blue, icon=shield) for Marketplace
4f12fd1 docs: fix ACCEPTANCE.md tag range v0.2.0→v1.0.2
75e7ceb docs: align acceptance test breakdown 61/20
c07770f docs: fix acceptance numbers 81/81 (33→61 evaluator+20 collector, 2450ms)
043832c test: migrate evaluator.test.mjs to vitest, add vitest config + lockfile
8ebb449 test: migrate collector.test.mjs from node:test to vitest API
30c9286 test: lock real PR #12 fixture — verdict=PASS (91/91)
```
