# Release Notes — v1.0.8

**GitHub Actions Gate** — Deterministic acceptance gate that accepts a delivery
only when all five rules pass with collector evidence.

## Changes (since v1.0.7)

- **fix(deploy-gate): trigger on gate `workflow_run` completed instead of push** (`824de58`, PR #4)
- **feat(gate): post github-actions-gate commit status to PR head** (`4d267b7`, PR #3)
- **fix(collector): exclude current run's check-runs via GITHUB_RUN_ID** (`02b71b1`)

## Detail

### Race condition fix (primary)

The deploy-gate workflow previously triggered on `push` to main, which raced
with the gate workflow: deploy-gate could collect check-runs before the gate
workflow had registered its own check-run, producing a false "missing-CI"
failure. The trigger now fires on `workflow_run` (gate workflow completed),
ensuring the gate's check-run is always present when deploy-gate collects.

### Commit status to PR head

The gate workflow now posts a `github-actions-gate` commit status
(success/failure) to the PR head SHA, visible in the GitHub UI as a status
check — complementing the existing check-run output.

### Collector self-exclusion

The collector now filters out the current run's own check-runs using
`GITHUB_RUN_ID`, preventing a run from counting its own in-progress
check-run as evidence of a passing CI signal.

## Verification

- `test/evaluator.test.mjs:606-617` — push-to-main fixture: pr-merged FAIL
  (no pr field), other four rules PASS, overall verdict FAIL.
- `deploy-gate.yml` trigger block confirms `workflow_run` with
  `types: [completed]`.
- Tag `v1.0.8` pushed at HEAD.
