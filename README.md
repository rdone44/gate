# github-actions-gate

Deterministic Node.js CLI that accepts a delivery only when its task association, commit, CI checks, and test-report evidence all pass.

## Quick start

```sh
npm install
npm test
node bin/gate.mjs fixtures/pass.json      # PASS → exit 0
node bin/gate.mjs fixtures/fail.json      # FAIL → exit 1
node bin/gate.mjs fixtures/fail.json --json
```

Exit codes:

- PASS fixture exits `0`.
- FAIL fixture exits `1`.
- Invalid JSON or unreadable file exits `2`.

## Rule set

Four rules, each must pass for a delivery to be accepted:

1. **task_associated** — `task.id` and `task.title` present
2. **commit_exists** — `commit.sha` matches `/^[0-9a-f]{7,40}$/`
3. **ci_passed** — `run.status === "success"`
4. **test_report_present** — `testReport.summary.total > 0` and `failed === 0`

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

`action.yml` is Docker-based (`using: docker`, `image: Dockerfile`). Evaluation JSON is passed as the first argument to `bin/gate.mjs`.

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
| `src/evaluator.mjs`   | Pure evaluator — four rules                          |
| `src/report.mjs`      | `formatJson()` and `formatReport()` output formatters |
| `test/*.test.mjs`     | `node --test` suite (87 tests: 31 evaluator + 56 collector) |
| `fixtures/pass.json`  | Evaluation object that passes all four rules         |
| `fixtures/fail.json`  | Evaluation object that fails CI + test rules         |
| `action.yml`          | GitHub Action wrapper (Docker)                       |
| `Dockerfile`          | `node:22-alpine` image                               |
| `.github/workflows/gate.yml` | CI workflow — test + fixture + Docker           |

## License

MIT
