# v1.1.0 Roadmap — GitHub Actions Gate

**Date:** 2026-08-11
**CEO:** @ceo4425_bot
**Current version:** v1.0.7 (tagged, 91 tests passing)
**Target:** v1.1.0

---

## Current State Assessment

### What works (v1.0.7 baseline)
- ✅ Five-rule deterministic evaluator (task-associated, commit-exists, ci-passes, test-report-exists, pr-merged)
- ✅ `evaluate` subcommand — offline JSON evaluation
- ✅ `collect` subcommand — live GitHub API evidence collection
- ✅ `watch` subcommand — polling loop with `--interval` and `--pass-once`
- ✅ 91 vitest tests, all passing
- ✅ Docker packaging, action.yml
- ✅ deploy-gate.yml workflow — gate as deployment blocker
- ✅ Weekly cron watchdog covering all 10 fixtures

### Known gaps (from README Limitations section)
- ❌ **No published releases** — tags exist locally but no GitHub Release or Docker image pushed to registry
- ❌ **No npm publish** — consumers must clone from source
- ❌ **No PR-level gating** — deploy-gate runs on push to main (post-merge), not on PR (pre-merge). The gate catches a bad merge but only *after* it's already merged.
- ❌ **action.yml only supports evaluate** — the reusable Action wraps `evaluate`, not `collect` or `watch`. Consumers using `uses: rdone44/gate@v1.0.7` can only do offline evaluation, not live collection.
- ❌ **No configurable rules** — five fixed rules, no way to add/extend for different project needs

---

## v1.1.0 — Three Key Features

### Feature 1: PR-level gate workflow (`pr-gate.yml`)
**Problem:** The current deploy-gate runs *after* merge (on push to main). A bad PR is already merged by the time the gate catches it.

**Solution:** Add `pr-gate.yml` that triggers on `pull_request` to main/master, runs `collect` against the PR head SHA, and posts a failing commit status if the gate FAILs — *before* the PR is mergeable.

**Deliverables:**
- `.github/workflows/pr-gate.yml` — triggers on `pull_request` to main
- Runs `node bin/gate.mjs collect --owner ... --repo ... --sha $PR_HEAD_SHA --task $PR_NUMBER --pr $PR_NUMBER --report test-report --json --output gate-result.json`
- Posts commit status (`success`/`failure`) to the PR head SHA
- Is documented in README with usage example
- Does not break existing deploy-gate or gate.yml workflows

**Why it matters:** This is the core product value prop — "gate PRs before they merge." Without it, the project is a post-merge audit tool, not a gate.

---

### Feature 2: Publish as a real GitHub Action (tag v1.1.0 + GitHub Release)
**Problem:** Tags exist in git but there's no GitHub Release. Users can't `uses: rdone44/gate@v1.1` with confidence. The action.yml only wraps `evaluate` (offline), not `collect`.

**Solution:**
- Update `action.yml` to support a `mode` input (`evaluate` or `collect`) with sensible defaults
- Tag `v1.1.0` and `v1` major-version tag
- Create GitHub Release via `gh release create`
- Document in README how to use as a reusable Action in both evaluate and collect modes

**Deliverables:**
- Updated `action.yml` with `mode`, `owner`, `repo`, `sha`, `task` inputs for collect mode
- Git tag `v1.1.0` pushed to origin
- Git tag `v1` updated to point at v1.1.0
- GitHub Release created with release notes
- README section: "Use as a reusable GitHub Action" with both modes documented

**Why it matters:** Zero-friction adoption. A maintainer should be able to add `uses: rdone44/gate@v1` to their workflow in 30 seconds.

---

### Feature 3: Configurable rules via `.gate-config.json`
**Problem:** All five rules are hardcoded. A project that doesn't use test-report artifacts, or doesn't use PRs (trunk-based), can't use the gate at all. This limits adoption.

**Solution:** Support a `.gate-config.json` file (or `--config` flag) that lets users:
- Disable specific rules: `{"rules": {"test-report-exists": false, "pr-merged": false}}`
- Override default values (e.g., `testReport.exists` default when no artifact collection)
- Keep the five-rule core immutable, but allow per-project enablement toggles

**Deliverables:**
- `src/config.mjs` — reads and validates `.gate-config.json`
- `evaluate` accepts optional config that disables selected rules (a disabled rule returns PASS with message "disabled by config")
- `--config <path>` CLI flag on both `evaluate` and `collect`
- 10+ new tests covering config scenarios
- Config documented in README and PRODUCT_SPEC

**Why it matters:** The #1 barrier to adoption for any gate tool is inflexibility. A configurable-rules layer makes the gate usable for trunk-based projects, monorepo subdirs, and projects without test-report artifacts — without breaking backward compatibility (no config = all five rules, same as today).

---

## Kaban Tasks (execution order)

### Phase 1: PR-level gate workflow
- [ ] T1: Create `.github/workflows/pr-gate.yml` — PR trigger, collect, status post
- [ ] T2: Test pr-gate workflow syntax (actionlint or manual review)
- [ ] T3: Document PR gating in README + add fixture/example

### Phase 2: Publish as GitHub Action
- [ ] T4: Update action.yml — add `mode` input, collect-mode inputs
- [ ] T5: Test action.yml works with both modes locally (Docker)
- [ ] T6: Tag v1.1.0 + v1, create GitHub Release
- [ ] T7: Update README — "Use as reusable Action" section, both modes

### Phase 3: Configurable rules
- [ ] T8: Implement `src/config.mjs` — read + validate .gate-config.json
- [ ] T9: Wire config into evaluator (disabled rules → PASS with message)
- [ ] T10: Add `--config <path>` flag to evaluate/collect CLI
- [ ] T11: Write tests for config (10+ scenarios)
- [ ] T12: Document config in README + PRODUCT_SPEC

### Phase 4: Release
- [ ] T13: Full test suite passes (npx vitest run, target 100+ tests)
- [ ] T14: Bump package.json to 1.1.0, write RELEASE_NOTES_v1.1.0.md
- [ ] T15: Tag v1.1.0, push, create GitHub Release

---

## Daily Standup Format (every 9:00)

```
## 📋 CEO Daily Report — {date}

### Completed yesterday
- ...

### Blocked / Risks
- ...

### Next steps (today)
- ...
```
