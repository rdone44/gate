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

Suite: `node --test test/*.test.mjs` — 87 tests, all passing.

## Project layout

| Path                  | Purpose                                              |
| ---                   | ---                                                  |
| `bin/gate.mjs`        | CLI entry point (arg parse + file read + evaluate)   |
| `src/evaluator.mjs`   | Pure evaluator — five rules                          |
| `src/report.mjs`      | `formatJson()` and `formatReport()` output formatters |
| `test/*.test.mjs`     | `node --test` suite (87 tests: 31 evaluator + 56 collector) |
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
