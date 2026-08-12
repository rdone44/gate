# Release Notes — v1.1.0

**PR-level Gate Workflow**

## What's New

- **pr-gate.yml** — pre-merge PR gating workflow. Runs on `pull_request` events, evaluates the gate in `collect` mode against the PR's head SHA, and blocks merge if any rule fails.
- **action.yml** now supports a `pr` input for `pr-merged` rule resolution in `collect` mode.
- README updated with a PR Gate section and example workflow.

## Breaking Changes

None. Fully backward-compatible with v1.0.x configurations.

## Bug Fixes

- (v1.0.8) Fixed race condition where `deploy-gate.yml` triggered on `push` before the gate workflow finished. Now triggers on `workflow_run completed` instead.

## Recommended Usage

```yaml
# In your repo's .github/workflows/pr-gate.yml
name: PR Gate
on:
  pull_request:
    types: [opened, synchronize, reopened]
jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: rdone44/gate@v1.1.0
        with:
          mode: collect
          owner: ${{ github.repository_owner }}
          repo: ${{ github.event.repository.name }}
          sha: ${{ github.event.pull_request.head.sha }}
          pr: ${{ github.event.pull_request.number }}
```

Or use the floating major tag:
```yaml
      - uses: rdone44/gate@v1
```

## Full Changelog

- `2c4c2e6` feat(workflow): add pr-gate.yml — pre-merge PR gating (#T1,T2)
- `642e997` docs: T3 — README PR Gate section with example workflow
- `891b1d1` Merge pull request #5 from rdone44/feat/pr-gate-workflow
