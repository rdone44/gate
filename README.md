# github-actions-gate

Deterministic Node.js CLI that accepts a delivery only when its task association, commit, CI checks, and test-report evidence all pass.

## Quick start

```sh
npm install
npm test
```

Three real examples using the bundled fixtures:

```sh
# 1) All five rules pass → exit 0
node bin/gate.mjs evaluate --input fixtures/pass.json
# PASS github-actions-gate: 5/5 rules passed
# PASS task-associated: Task TASK-123 is associated with the change.
# PASS commit-exists: Commit 0123456789abcdef0123456789abcdef01234567 exists.
# PASS ci-passes: All 1 CI check completed successfully.
# PASS test-report-exists: Test report exists at artifacts/test-report.json.
# PASS pr-merged: PR state is merged.
# (exit 0)

# 2) CI + test-report rules fail → exit 1
node bin/gate.mjs evaluate --input fixtures/fail.json
# FAIL github-actions-gate: 2/5 rules passed
# FAIL task-associated: Task TASK-123 is not associated with the change.
# PASS commit-exists: Commit 0123456789abcdef0123456789abcdef01234567 exists.
# FAIL ci-passes: CI check test is not successful: status=in_progress, conclusion=null.
# FAIL test-report-exists: Test report does not exist at artifacts/test-report.json.
# PASS pr-merged: PR state is merged.
# (exit 1)

# 3) Schema violation (empty task.id) → exit 2
node bin/gate.mjs evaluate --input fixtures/schema-violation-empty-task-id.json
# github-actions-gate: schema violation: task.id must be a non-empty string
# (exit 2)
```

Exit codes:

- `0` — all five rules passed; delivery accepted.
- `1` — one or more rules failed; delivery rejected.
- `2` — input is unreadable, not valid JSON, or violates the required schema.

## Rule set

Five rules, each must pass for a delivery to be accepted:

1. **task_associated** — `task.id` and `task.title` present
2. **commit_exists** — `commit.sha` matches `/^[0-9a-f]{7,40}$/`
3. **ci_passed** — `run.status === "success"`
4. **test_report_present** — `testReport.summary.total > 0` and `failed === 0`
5. **pr_merged** — `pullRequest.state === "merged"`

## Docker

```sh
docker build -t github-actions-gate .
docker run --rm -v "$PWD/fixtures:/app/fixtures" github-actions-gate fixtures/pass.json --json
```

The Dockerfile copies `package.json` + `bin/` + `src/` only, so mount `fixtures/` from the host when you want to evaluate fixture files inside the container.

## GitHub Actions CI

`.github/workflows/gate.yml` defines a `gate` job that runs on push/pull_request to `main`. It:

1. Installs deps (`npm install`)
2. Runs the test suite (`npm test`)
3. Exercises the PASS fixture (expects exit 0)
4. Exercises the FAIL fixture (expects exit 1)
5. Builds the Docker image
6. Runs the PASS fixture inside the container

CI status: passing on `main`.

## Reusable GitHub Action

To use this repository as a reusable Action from another repo, reference `action.yml`:

```yaml
- uses: rdone44/github-actions-gate@v0.1.0
  with:
    fixture-path: evaluation.json
```

`action.yml` is Docker-based (`using: docker`, `image: Dockerfile`). Evaluation JSON is passed via `evaluate --input <path>`.

## Collect (GitHub collector mode)

```sh
node bin/gate.mjs collect --owner rdone44 --repo github-actions-gate \
  --sha <40-hex> --task TASK-1 --report "test-report" --branch main --json
```

`collect` fetches evidence from the GitHub REST API (commit, check-runs, artifacts) and builds a canonical evaluation document, then runs the same evaluator as `evaluate`. Requires `GITHUB_TOKEN` env var. Output is machine JSON (`--json`) or human report.

Collector source: `src/collector.mjs` (SPEC §16). Integration tests in `test/collector.test.mjs` use stubbed fetch to exercise the full collect→evaluate pipeline end-to-end.

## Test

```sh
npm test
```

Suite: `npx vitest run` — 91 tests, all passing.

## Project layout

| Path                  | Purpose                                              |
| ---                   | ---                                                  |
| `bin/gate.mjs`        | CLI entry point (arg parse + file read + evaluate)   |
| `src/evaluator.mjs`   | Pure evaluator — five rules                          |
| `src/report.mjs`      | `formatJson()` and `formatReport()` output formatters |
| `test/*.test.mjs`     | `npx vitest run` suite (91 tests)                        |
| `fixtures/pass.json`  | Evaluation object that passes all five rules         |
| `fixtures/fail.json`  | Evaluation object that fails CI + test rules         |
| `action.yml`          | GitHub Action wrapper (Docker)                       |
| `Dockerfile`          | `node:22-alpine` image                               |
| `.github/workflows/gate.yml` | CI workflow — test + fixture + Docker           |

## Changelog

- **v0.5.3** — Collector CI smoke step verified end-to-end on a real PR; version bump for release-gate validation.
- **v0.5.2** — Added `example:offline` and `test:collect` npm scripts (SPEC §13/§16.8 acceptance).
- **v0.5.1** — Collector smoke step: passes `--task` and `--pr` from PR context to the smoke step; first real CI run with `GITHUB_TOKEN`.
- **v0.5.0** — Added `collect` subcommand (GitHub collector mode, SPEC §16) with integration tests.

## License

MIT

## Limitations

This project is a deterministic gate CLI, not a production deployment system. Known limitations:

- **No published releases.** Tags v1.0.3–v1.0.7 exist locally, but no GitHub Release or Docker image has been published to a registry. The Dockerfile builds locally only.
- **No artifact distribution.** There is no npm publish target, no OCI image push, and no GitHub Release attachment. Consumers must clone and build from source.
- **Fixture-only evaluation.** The `evaluate` subcommand operates on local JSON files only — it does not fetch live GitHub evidence. Use `collect` for live API-backed evaluation (requires `GITHUB_TOKEN`).
- **Single-repo collector.** The `collect` subcommand fetches from one GitHub repo at a time. No multi-repo or org-level aggregation.
- **No webhook/server mode.** The CLI is one-shot. There is no long-running process to auto-gate incoming PRs. The `watch` subcommand polls on an interval but is stateless.
- **Security boundary: read-only.** The gate never writes to GitHub (no status checks, no comments, no merges). It produces a verdict for an external system to act on.
- **No auth for `evaluate`.** The `evaluate` subcommand needs no credentials. `collect` requires a `GITHUB_TOKEN` with `repo:read` scope minimum.
- **Node.js 22+ only.** The Dockerfile pins `node:22-alpine`. Older Node versions are untested.

## Withdrawal notice

**Status: maintenance complete, active development stopped as of v1.0.7.**

This project is feature-complete for its original scope (deterministic five-rule delivery gate). No further functional development is planned. The repository stands as-is.

### Deliverables inventory

| Item | Value | Status |
|---|---|---|
| Git tag | `v1.0.7` (commit `c42aed5`) | Pushed to `origin/main` |
| Release | None | Not published via `gh release create` |
| Docker image | None | Built locally only; never pushed to a registry |
| npm package | None | Not published to npmjs.com |
| GitHub Action | `action.yml` (Docker-based) | Referenced via `rdone44/gate@v1.0.7` but not published as a marketplace Action |

### Installation

Clone and build from source — there is no distributed artifact:

```sh
git clone https://github.com/rdone44/gate.git
cd gate
npm install
npx vitest run                     # 91 tests, should pass
node bin/gate.mjs evaluate --input fixtures/pass.json
```

Docker (local build only):

```sh
docker build -t github-actions-gate .
docker run --rm -v "$PWD/fixtures:/app/fixtures" github-actions-gate fixtures/pass.json --json
```

### Security constraints

- The gate is **read-only** — it never mutates GitHub state.
- `collect` requires `GITHUB_TOKEN` with minimum `repo:read` scope. Do not grant write scopes.
- No secrets are stored or cached. The token is read from env and discarded after the CLI exits.
- The Dockerfile runs as root inside `node:22-alpine` — do not deploy to production without hardening (non-root user, resource limits).

### Scope boundary

This product gates delivery on five fixed rules. It is not a CI/CD orchestrator, not a release manager, not a deployment tool. Any extension beyond the five-rule gate is out of scope and will not be developed.

