# github-actions-gate

Deterministic Node.js CLI that accepts a delivery only when its task association, commit, CI checks, and test-report evidence all pass.

## Offline

```sh
node bin/gate.mjs fixtures/pass.json
node bin/gate.mjs fixtures/fail.json --json
```

- PASS fixture exits `0`.
- FAIL fixture exits `1`.
- Invalid JSON or unreadable file exits `2`.

## Docker

```sh
docker build -t github-actions-gate .
docker run --rm -v "$PWD/fixtures:/app/fixtures" github-actions-gate fixtures/pass.json --json
```

The Dockerfile copies `package.json` + `bin/` + `src/` only, so mount `fixtures/` from the host when you want to evaluate fixture files inside the container.

## GitHub Actions

`.github/workflows/gate.yml` defines a `gate` job that runs tests, exercises the PASS/FAIL fixtures, builds the Docker image, and runs the PASS fixture inside the container. Push to a branch on a repo with Actions enabled to trigger it.

To use this repository *as* a reusable GitHub Action from another repo, reference `action.yml`:

```yaml
- uses: owner/github-actions-gate@v1
  with:
    fixture-path: evaluation.json
```

`action.yml` is Docker-based (`using: docker`, `image: Dockerfile`).

## Test

```sh
npm test
```

## Project layout

| Path                  | Purpose                                              |
| ---                   | ---                                                  |
| `bin/gate.mjs`        | CLI entry point (arg parse + file read + evaluate)   |
| `src/evaluator.mjs`   | Pure evaluator — four rules                          |
| `src/report.mjs`      | `formatJson()` and `formatReport()` output formatters |
| `test/*.test.mjs`     | `node --test` suite                                  |
| `fixtures/pass.json`  | Evaluation object that passes all four rules         |
| `fixtures/fail.json`  | Evaluation object that fails CI + test rules         |
| `action.yml`          | GitHub Action wrapper (Docker)                       |
| `Dockerfile`          | `node:22-alpine` image                               |

## Rule set

1. **task_associated** — `task.id` and `task.title` present
2. **commit_exists** — `commit.sha` matches `/^[0-9a-f]{7,40}$/`
3. **ci_passed** — `run.status === "success"`
4. **test_report_present** — `testReport.summary.total > 0` and `failed === 0`

## Known scope gap

`README` and `PRODUCT_SPEC` also describe a `github` subcommand that fetches live evidence from the GitHub REST API (`GITHUB_TOKEN`, `--repo`, `--task`, `--sha`, artifact retrieval). That mode is **not** implemented in `bin/gate.mjs` at this revision — the CLI currently performs offline evaluation only. Offline + Docker + Actions workflow are the accepted scope of this audit.
