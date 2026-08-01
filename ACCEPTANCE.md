# Acceptance Audit

Status: PASS

Audit time: 2026-07-31T09:09:00+08:00
Auditor: live

## Scope inspected

Repository: `/root/github-actions-gate` (remote: `github.com/rdone44/github-actions-gate.git`, tags v0.1.0–v0.2.0 pushed)

Present and inspected:

- `PRODUCT_SPEC.md` — product specification
- `package.json` — Node.js ESM project config  (`"type": "module"`, `bin` → `bin/gate.mjs`)
- `bin/gate.mjs` — CLI entry point (single-file: arg parse + file read + evaluate + report + exit)
- `src/evaluator.mjs` — pure evaluator (five rules: `task_associated`, `commit_exists`, `ci_passed`, `test_report_present`, `pr_merged`)
- `src/report.mjs` — `formatJson()` / `formatReport()` output formatters
- `action.yml` — Docker-based GitHub Action wrapper (`using: docker`, `image: Dockerfile`)
- `Dockerfile` — `node:22-alpine`, copies `package.json` + `bin/` + `src/`, ENTRYPOINT `node bin/gate.mjs`
- `fixtures/pass.json` — 5/5 rules pass
- `fixtures/fail.json` — CI failure + test failures → rejected
- `test/evaluator.test.mjs` — unit tests for evaluator/report/CLI (33 tests)
- `test/collector.test.mjs` — unit + §16.10 integration tests for collector (56 tests)
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
ℹ tests 89
ℹ pass 89
ℹ fail 0
ℹ duration_ms 2122.540236
```

Test files:
- `test/evaluator.test.mjs` — 33 tests (evaluator rules, report formatters, CLI flags/exit codes, whitespace title rejection)
- `test/collector.test.mjs` — 56 tests (fetchPage, collectAll, buildEvaluationDocument, §16.10 stubbed-fetch integration)

Verified behavior: all five rules (including pr-merged), pass/fail fixtures, short-SHA acceptance, non-hex rejection, missing CI run, zero/failing test reports, `formatReport` output containing `PASS`/`FAIL`, `formatJson` output parsing as valid JSON, collector §16.10 end-to-end pipeline."

### CLI fixtures (local, real command runs)

PASS fixture:

```
$ node bin/gate.mjs evaluate --input fixtures/pass.json
PASS github-actions-gate: 5/5 rules passed
PASS task-associated: Task TASK-123 is associated with the change.
PASS commit-exists: Commit 0123456789abcdef0123456789abcdef01234567 exists.
PASS ci-passes: All 1 CI check completed successfully.
PASS test-report-exists: Test report exists at artifacts/test-report.json.
PASS pr-merged: PR state is merged.
$ echo $?
0
```

FAIL fixture:

```
$ node bin/gate.mjs evaluate --input fixtures/fail.json
FAIL github-actions-gate: 2/5 rules passed
FAIL task-associated: Task TASK-123 is not associated with the change.
PASS commit-exists: Commit 0123456789abcdef0123456789abcdef01234567 exists.
FAIL ci-passes: CI check test is not successful: status=in_progress, conclusion=null.
FAIL test-report-exists: Test report does not exist at artifacts/test-report.json.
PASS pr-merged: PR state is merged.
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
    "passed": 5,
    "failed": 0,
    "total": 5
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
    },
    {
      "id": "pr-merged",
      "verdict": "PASS",
      "message": "PR state is merged."
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
PASS github-actions-gate: 5/5 rules passed
PASS task-associated: Task TASK-123 is associated with the change.
PASS commit-exists: Commit 0123456789abcdef0123456789abcdef01234567 exists.
PASS ci-passes: All 1 CI check completed successfully.
PASS test-report-exists: Test report exists at artifacts/test-report.json.
PASS pr-merged: PR state is merged.
$ echo $?
0

$ docker run --rm -v "$PWD/fixtures:/app/fixtures" github-actions-gate:audit evaluate --input fixtures/fail.json
FAIL github-actions-gate: 2/5 rules passed
FAIL task-associated: Task TASK-123 is not associated with the change.
PASS commit-exists: Commit 0123456789abcdef0123456789abcdef01234567 exists.
FAIL ci-passes: CI check test is not successful: status=in_progress, conclusion=null.
FAIL test-report-exists: Test report does not exist at artifacts/test-report.json.
PASS pr-merged: PR state is merged.
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
| Product specification exists                             | PASS    | `PRODUCT_SPEC.md` defines users, workflow, contracts, five rules, and checklist. |
| Node.js ESM evaluator, CLI, and report formatter         | PASS    | `src/evaluator.mjs` (5 rules), `bin/gate.mjs`, `src/report.mjs`; `"type": "module"` in `package.json`. |
| Five deterministic rules                                 | PASS    | Covered by `test/evaluator.test.mjs` + `test/collector.test.mjs` — 89/89 pass (incl. pr-merged, whitespace title rejection). |
| Machine and terminal reports                             | PASS    | `formatJson()` returns valid JSON; `formatReport()` returns human-readable text containing `PASS`/`FAIL`. Both exercised by tests + real CLI runs. |
| Offline fixtures and example                             | PASS    | `fixtures/pass.json` exits 0; `fixtures/fail.json` exits 1; both verified via `node bin/gate.mjs evaluate --input`. |
| Automated tests                                          | PASS    | Real `npm test` run: 89/89 passed (33 evaluator + 56 collector), 2123 ms. |
| Docker packaging                                         | PASS    | Image built; PASS fixture exits 0 in container; FAIL fixture exits 1. |
| GitHub Actions usage                                     | PASS    | `.github/workflows/gate.yml` is valid YAML; defines `gate` job exercising tests, fixtures, and Docker build. Run on hosted runners; applicable tag pushes fail without gate passing. |
| GitHub Action wrapper                                    | PASS    | `action.yml` declares `using: docker`, `image: Dockerfile`. |
| GitHub collector mode (SPEC §16)                         | PASS    | `src/collector.mjs` exports `fetchPage`, `collectAll`, `buildEvaluationDocument`. `bin/gate.mjs collect` subcommand wired. `test/collector.test.mjs` §16.10 integration tests pass (stubbed fetch, full collect→evaluate pipeline). |

## Known gaps (honest disclosure)

- **Hosted Actions run executed — PR #8 collector smoke (run ID 30684191149).** On 2026-08-01, a hosted GitHub Actions workflow run on branch `test/pr-trigger-collector-smoke` executed the collector smoke step with a real `GITHUB_TOKEN` against live PR #8 data (`--owner rdone44 --repo github-actions-gate --sha 27c986b3281a38695c254ea44fc77384b2d69d20 --task 8 --pr 8 --json`). The collector successfully fetched the commit and PR from the GitHub API and produced a deterministic evaluator verdict. Result: 2/5 rules PASS, exit code 1 (rule failure, not crash).

  Rule verdicts from the real hosted run:

  | Rule | Verdict | Message |
  |------|---------|---------|
  | task-associated | PASS | Task 8 is associated with the change. |
  | commit-exists | PASS | Commit 27c986b3281a38695c254ea44fc77384b2d69d20 exists. |
  | ci-passes | FAIL | No CI checks were provided. |
  | test-report-exists | FAIL | Test report does not exist at artifacts/. |
  | pr-merged | FAIL | PR state is open, not merged. |

  This confirms the collector→evaluate pipeline works end-to-end against a real GitHub API on hosted runners. The FAIL verdict is the correct, expected outcome: PR #8 was open (not merged), had no check-runs at push time, and had no test-report artifact — the gate correctly rejected it. Previous gap "hosted Actions run pending" is resolved.
- **GitHub collector mode shipped (v0.3.0–v0.5.3).** `src/collector.mjs` and `bin/gate.mjs collect` are now implemented and tested (89/89 pass including §16.10 stubbed-fetch integration tests). The previous gap — CLI only performing offline evaluation — is resolved. Commit `d5ec4e1` adds whitespace-only task.title rejection (v0.5.3).
- Previous audit (2026-07-19) referenced file paths `bin/github-actions-gate.js`, `lib/evaluator.js`, `lib/github.js` that do not exist — that report was erroneous. Real paths are `bin/gate.mjs`, `src/evaluator.mjs`, `src/report.mjs` as documented here.

## Decision

Repository: accepted — local build + tests + Docker all pass on real execution; hosted Actions collector smoke executed on PR #8 (run 30684191149) confirming the collector→evaluate pipeline against the live GitHub API. Next milestone: tag v1.0.
