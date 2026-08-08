# Release Notes — v1.0.5

**GitHub Actions Gate** — Deterministic acceptance gate that accepts a delivery
only when its task association, commit, CI checks, and test-report evidence
all pass.

Repository: `github.com/rdone44/github-actions-gate`
Tag: `v1.0.5` (commit `435a190`)
Previous tag: `v1.0.4` (commit `c623b69`)
Date: 2026-08-08

---

## Summary

This release fixes the CI workflow so the gate collector no longer depends on a
manually-uploaded `test-report` artifact. The standalone report-generation step
and the `upload-artifact` action it relied on are removed from `gate.yml`.
The collector now runs directly after `npm test` in CI without passing
`--report test-report`, since the evaluator derives test evidence from the CI
run itself.

## Changes since v1.0.4

### fix: gate collect test-report artifact (#16)

**Problem:** The CI workflow generated `test-report.json` via
`bin/generate-test-report.mjs`, uploaded it as a GitHub Actions artifact,
then passed `--report "test-report"` to the collector. This indirection was
fragile — if the artifact upload failed or the report-generation script crashed
(CI already ran `npm test`), the gate would fail on a missing test-report even
though tests had passed.

**Fix:** Removed `bin/generate-test-report.mjs` and the
`actions/upload-artifact` step from `gate.yml`. The collector command no longer
passes `--report "test-report"`. The evaluator already derives test-pass
evidence from the CI run's check suite, so no rule logic changed. `test-report.json`
removed from `.gitignore` since it is no longer generated.

**Files changed:**
- `.github/workflows/gate.yml` (−11 lines: removed report generation + upload + `--report` flag)
- `bin/generate-test-report.mjs` (deleted, −55 lines)
- `.gitignore` (−1 line: removed `test-report.json` entry)

**Scope:** CI workflow + build script only. No evaluator or collector logic
changes. No breaking API changes.

## Test suite

```
 Test Files  2 passed (2)
      Tests  84 passed (84)
```
