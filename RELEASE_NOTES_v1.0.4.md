# Release Notes — v1.0.4

**GitHub Actions Gate** — Deterministic acceptance gate that accepts a delivery
only when its task association, commit, CI checks, and test-report evidence
all pass.

Repository: `github.com/rdone44/github-actions-gate`
Tag: `v1.0.4` (commit `7b7d0ce`)
Previous tag: `v1.0.3` (commit `b2257dd`)
Date: 2026-08-07

---

## Summary

This release adds automatic PR backfill to the collector. When a commit has no
explicit PR number in the delivery manifest, the collector now queries the
GitHub API endpoint `GET /repos/{owner}/{repo}/commits/{sha}/pulls` to find the
associated pull request and populate `prNumber` / `prUrl` automatically.

This removes the need for delivery authors to manually look up and include the
PR number when the commit SHA is already known — the gate resolves it for them.

## Changes since v1.0.3

### Auto-backfill PR via commits/{sha}/pulls (#15)

**Problem:** The collector required an explicit `prNumber` in the delivery
manifest. If omitted, evaluation would fail at the `pr_merged` rule even when
a perfectly good merged PR existed for the commit.

**Fix:** The collector now calls
`GET /repos/{owner}/{repo}/commits/{sha}/pulls` during the collection phase.
If the response contains at least one PR, it populates `prNumber` and `prUrl`
on the change record before evaluation runs. If the endpoint returns no PRs
or the API call fails (rate-limit, network, permissions), the collector
leaves the fields empty and evaluation proceeds as before — no regression.

**Scope:** `src/collector.mjs` (+33 / −6 lines), `test/collector.test.mjs`
(+72 lines, 23 new test cases). No evaluator changes. No breaking API changes.
84/84 tests green.

### Removed

- `.github/workflows/deploy-gate.yml` — the standalone deploy-gate workflow was
  replaced by the unified CI workflow in a previous release and is no longer
  referenced. Removed to keep the repo clean.

## Upgrade notes

Safe drop-in upgrade. No configuration changes required. If you previously
omitted `prNumber` and relied on the evaluation failure to flag missing PRs,
note that the gate will now auto-resolve the PR from the commit SHA via the
GitHub API (requires `GITHUB_TOKEN` with read access to pull requests).

## Test suite

```
 Test Files  2 passed (2)
      Tests  84 passed (84)
```
