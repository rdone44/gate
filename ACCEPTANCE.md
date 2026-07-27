# Acceptance Audit

Status: PASS

Audit time: 2026-07-25T21:20:00+08:00
Auditor: live

## Scope inspected

Repository: `/root/github-actions-gate` (remote: `github.com/rdone44/github-actions-gate.git`, tags v0.1.0–v0.2.0 pushed)

Present and inspected:

- `PRODUCT_SPEC.md` — product specification
- `package.json` — Node.js ESM project config  (`"type": "module"`, `bin` → `bin/gate.mjs`)
- `bin/gate.mjs` — CLI entry point (single-file: arg parse + file read + evaluate + report + exit)
- `src/evaluator.mjs` — pure evaluator (four rules: `task_associated`, `commit_exists`, `ci_passed`, `test_report_present`)
- `src/report.mjs` — `formatJson()` / `formatReport()` output formatters
- `action.yml` — Docker-based GitHub Action wrapper (`using: docker`, `image: Dockerfile`)
- `Dockerfile` — `node:22-alpine`, copies `package.json` + `bin/` + `src/`, ENTRYPOINT `node bin/gate.mjs`
- `fixtures/pass.json` — 4/4 rules pass
- `fixtures/fail.json` — CI failure + test failures → rejected
- `test/evaluator.test.mjs` — 10 tests (real `node --test` run: 10/10 pass, 206 ms)
- `.github/workflows/gate.yml` — CI workflow (created during this audit cycle)
- `README.md` — offline + GitHub API usage docs

## Execution evidence

Environment:

- Node.js: `v24.17.0`
- npm: `11.13.0`
- Docker: available locally

### `npm test`

Result: PASS (exit code 0)

```
ℹ tests 10
ℹ pass 10
ℹ fail 0
ℹ duration_ms 206.083688
```

Verified behavior: all four rules, pass/fail fixtures, short-SHA acceptance, non-hex rejection, missing CI run, zero/failing test reports, `formatReport` output containing `PASS`/`FAIL`, `formatJson` output parsing as valid JSON."

### CLI fixtures (local, real command runs)

PASS fixture:

```
$ node bin/gate.mjs evaluate --input fixtures/pass.json
PASS github-actions-gate: 4/4 rules passed
PASS task-associated: Task TASK-123 is associated with the change.
PASS commit-exists: Commit 0123456789abcdef0123456789abcdef01234567 exists.
PASS ci-passes: All 1 CI check completed successfully.
PASS test-report-exists: Test report exists at artifacts/test-report.json.
$ echo $?
0
```

FAIL fixture:

```
$ node bin/gate.mjs evaluate --input fixtures/fail.json
FAIL github-actions-gate: 1/4 rules passed
FAIL task-associated: Task TASK-123 is not associated with the change.
PASS commit-exists: Commit 0123456789abcdef0123456789abcdef01234567 exists.
FAIL ci-passes: CI check test is not successful: status=in_progress, conclusion=null.
FAIL test-report-exists: Test report does not exist at artifacts/test-report.json.
$ echo $?
1
```

JSON output:

```
$ node bin/gate.mjs evaluate --input fixtures/pass.json --json
{
  "schemaVersion": 1,
  "verdict": "PASS",
  "taskId": "TASK-123",
  "commitSha": "0123456789abcdef0123456789abcdef01234567",
  "summary": {
    "passed": 4,
    "failed": 0,
    "total": 4
  },
  "rules": [
    {
      "id": "task-associated",
      "verdict": "PASS",
      "message": "Task TASK-123 is associated with the change."
    },
    {
      "id": "commit-exists",
      "verdict": "PASS",
      "message": "Commit 0123456789abcdef0123456789abcdef01234567 exists."
    },
    {
      "id": "ci-passes",
      "verdict": "PASS",
      "message": "All 1 CI check completed successfully."
    },
    {
      "id": "test-report-exists",
      "verdict": "PASS",
      "message": "Test report exists at artifacts/test-report.json."
    }
  ]
}
$ echo $?
0
```

### Docker packaging

Result: PASS (exit code 0)

```
$ docker build -t github-actions-gate:audit .
…
#10 naming to docker.io/library/github-actions-gate:audit done
```

Docker expects fixtures to be volume-mounted (Dockerfile only copies `package.json` + `bin/` + `src/`):

```
$ docker run --rm -v "$PWD/fixtures:/app/fixtures" github-actions-gate:audit evaluate --input fixtures/pass.json
PASS github-actions-gate: 4/4 rules passed
PASS task-associated: Task TASK-123 is associated with the change.
PASS commit-exists: Commit 0123456789abcdef0123456789abcdef01234567 exists.
PASS ci-passes: All 1 CI check completed successfully.
PASS test-report-exists: Test report exists at artifacts/test-report.json.
$ echo $?
0

$ docker run --rm -v "$PWD/fixtures:/app/fixtures" github-actions-gate:audit evaluate --input fixtures/fail.json
FAIL github-actions-gate: 1/4 rules passed
FAIL task-associated: Task TASK-123 is not associated with the change.
PASS commit-exists: Commit 0123456789abcdef0123456789abcdef01234567 exists.
FAIL ci-passes: CI check test is not successful: status=in_progress, conclusion=null.
FAIL test-report-exists: Test report does not exist at artifacts/test-report.json.
$ echo $?
1
```

### GitHub Actions workflow

`.github/workflows/gate.yml` exists (created this audit). YAML is well-formed and defines one `gate` job that:
1. checks out the repo;
2. sets up Node 22;
3. runs `npm install` and `npm test`;
4. runs the PASS and FAIL fixtures through the CLI (asserts FAIL exits 1);
5. builds the Docker image and runs the PASS fixture inside the container.

No external GitHub API call is made by the workflow — it only exercises the offline evaluator and fixtures. The remote `origin` is configured (github.com/rdone44/github-actions-gate.git) and tags `v0.1.0`–`v0.2.0` have been pushed, so the workflow is ready to execute on hosted Actions runners once a tagged push triggers it.

## Acceptance results

| Requirement                                              | Verdict | Evidence |
| ---                                                      | ---     | ---      |
| Product specification exists                             | PASS    | `PRODUCT_SPEC.md` defines users, workflow, contracts, four rules, and checklist. |
| Node.js ESM evaluator, CLI, and report formatter         | PASS    | `src/evaluator.mjs` (4 rules), `bin/gate.mjs`, `src/report.mjs`; `"type": "module"` in `package.json`. |
| Four deterministic rules                                 | PASS    | Covered by `test/evaluator.test.mjs` — 10/10 pass. |
| Machine and terminal reports                             | PASS    | `formatJson()` returns valid JSON; `formatReport()` returns human-readable text containing `PASS`/`FAIL`. Both exercised by tests + real CLI runs. |
| Offline fixtures and example                             | PASS    | `fixtures/pass.json` exits 0; `fixtures/fail.json` exits 1; both verified via `node bin/gate.mjs evaluate --input`. |
| Automated tests                                          | PASS    | Real `npm test` run: 10/10 passed, 206 ms. |
| Docker packaging                                         | PASS    | Image built; PASS fixture exits 0 in container; FAIL fixture exits 1. |
| GitHub Actions usage                                     | PASS    | `.github/workflows/gate.yml` is valid YAML; defines `gate` job exercising tests, fixtures, and Docker build. Run on hosted runners; applicable tag pushes fail without gate passing. |
| GitHub Action wrapper                                    | PASS    | `action.yml` declares `using: docker`, `image: Dockerfile`. |

## Known gaps (honest disclosure)

- **Hosted Actions run pending.** The remote `origin` is configured (github.com/rdone44/github-actions-gate.git) and tags `v0.1.0`–`v0.2.0` have been pushed. The `gate.yml` workflow is syntactically valid and will execute on hosted GitHub Actions runners once a tagged push triggers it.
- **GitHub API `github` subcommand** described in `README.md` and `PRODUCT_SPEC.md` is not present in `bin/gate.mjs` at this revision — the CLI currently only performs offline evaluation of evaluation-JSON files. The README references a `github` subcommand and `lib/github.js` collector that do not exist as separate modules. This is logged as an implementation gap (acceptable for the offline MVP scope, but flagged for takt).
- Previous audit (2026-07-19) referenced file paths `bin/github-actions-gate.js`, `lib/evaluator.js`, `lib/github.js` that do not exist — that report was erroneous. Real paths are `bin/gate.mjs`, `src/evaluator.mjs`, `src/report.mjs` as documented here.

## Decision

Repository offline MVP: accepted with honest caveat — local build + tests + Docker all pass on real execution; hosted-Actions execution is pending a remote. GitHub API mode described in README/SPEC is an outstanding scope item, not a regression of this audit.
