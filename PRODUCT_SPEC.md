# Product Specification: github-actions-gate

## 1. Product summary

`github-actions-gate` is a deterministic Node.js ESM command-line gate that decides whether a GitHub Actions delivery satisfies four required conditions before it may be accepted.

The product reads one JSON evaluation document, applies four explicit rules without probabilistic judgment, prints a human-readable result to the terminal, and emits a machine-readable JSON report.

## 2. Target users

Primary user: a technical founder, engineering lead, or release owner who delegates implementation work and needs objective evidence that a GitHub task was completed rather than merely claimed complete.

Secondary user: a CI workflow author who needs a small, scriptable acceptance gate with stable exit codes and JSON output.

The user is expected to understand Git commits, GitHub Actions checks, task identifiers, and test reports. No graphical interface is required.

## 3. Single workflow

The product supports exactly one workflow:

1. A caller supplies an evaluation JSON document from a local file or standard input.
2. The CLI validates the document shape.
3. The CLI evaluates the four deterministic rules in the fixed order defined below.
4. The CLI creates one JSON report containing the overall verdict and every rule result.
5. The CLI prints a concise terminal summary unless quiet mode is enabled.
6. The CLI optionally writes the JSON report to a file.
7. The process exits with a stable exit code.

Offline mode uses caller-provided JSON only. GitHub mode may collect the same input fields from the GitHub API using `GITHUB_TOKEN`, but it must feed the collected data into the identical evaluator. There is no separate policy engine for GitHub mode.

## 4. Non-goals

The MVP does not:

- infer whether code quality is good;
- review source code or use an LLM;
- create, edit, assign, or close tasks;
- create commits, branches, pull requests, or workflow runs;
- repair failed CI or tests;
- support configurable policies or user-defined rules;
- provide a web UI, server, database, queue, or long-running daemon;
- replace GitHub branch protection;
- evaluate deployment health, security posture, coverage percentage, or revenue;
- accept ambiguous free-form text as evidence;
- treat missing evidence as success.

## 5. Runtime and implementation constraints

- Runtime: supported Node.js LTS.
- Module system: native ESM (`"type": "module"`).
- CLI entry point: `bin/github-actions-gate.js`.
- Evaluator: deterministic and side-effect free after input normalization.
- Output encoding: UTF-8 JSON.
- Network access: forbidden in offline mode; optional in GitHub mode.
- Dependencies: prefer Node.js standard library. A dependency is allowed only when the platform cannot provide the required behavior directly.

## 6. JSON input contract

### 6.1 Canonical input

```json
{
  "schemaVersion": 1,
  "task": {
    "id": "TASK-123",
    "title": "Add deterministic release gate"
  },
  "change": {
    "commitSha": "0123456789abcdef0123456789abcdef01234567",
    "associatedTaskIds": ["TASK-123"]
  },
  "ci": {
    "checks": [
      {
        "name": "test",
        "status": "completed",
        "conclusion": "success"
      }
    ]
  },
  "testReport": {
    "format": "json",
    "path": "artifacts/test-report.json",
    "exists": true
  },
  "metadata": {
    "repository": "owner/repository",
    "pullRequest": 42
  }
}
```

### 6.2 Required fields

| JSON path | Type | Constraint |
| --- | --- | --- |
| `schemaVersion` | integer | Must equal `1`. |
| `task.id` | string | Non-empty after trimming. |
| `change.commitSha` | string | Exactly 40 hexadecimal characters. |
| `change.associatedTaskIds` | array of strings | May be empty; duplicate values are ignored for evaluation. |
| `ci.checks` | array of objects | Each item requires non-empty `name`, `status`, and `conclusion`. |
| `testReport.path` | string | Non-empty after trimming. |
| `testReport.exists` | boolean | Must be explicitly present. |

`task.title`, `testReport.format`, and `metadata` are optional and do not change the verdict.

Unknown fields are allowed and ignored. Invalid JSON or an invalid required field is an input error, not a failed gate evaluation.

## 7. Four deterministic rules

The evaluator always returns all four rule results. It must not stop after the first failure.

### Rule 1: `task-associated`

PASS when `task.id`, compared as an exact case-sensitive string, appears in `change.associatedTaskIds`.

FAIL otherwise, including when the array is empty.

No task association may be inferred from commit messages, branch names, pull-request text, titles, or partial string matches.

### Rule 2: `commit-exists`

PASS when `change.commitSha` is exactly 40 hexadecimal characters and is not the all-zero SHA `0000000000000000000000000000000000000000`.

FAIL when the SHA is all zero.

A malformed SHA is rejected earlier as an input error. In GitHub mode, collection must only populate this field after GitHub confirms that the commit exists in the requested repository.

### Rule 3: `ci-passes`

PASS when `ci.checks` contains at least one item and every item has both:

- `status` exactly equal to `completed`; and
- `conclusion` exactly equal to `success`.

FAIL when the array is empty or any check is queued, in progress, cancelled, skipped, neutral, timed out, action-required, stale, failed, or uses any value other than the two exact PASS values above.

### Rule 4: `test-report-exists`

PASS when `testReport.exists` is exactly `true` and `testReport.path` is non-empty after trimming.

FAIL otherwise.

The evaluator does not infer report existence from passing CI. In offline mode the boolean is authoritative caller-provided evidence. In GitHub mode the collector must set it only after finding the named artifact or report.

## 8. Overall verdict

`verdict` is `PASS` only when all four rules pass.

`verdict` is `FAIL` when one or more rules fail.

The CLI exits `0` for `PASS`, `1` for `FAIL`, and `2` for invalid usage, invalid JSON, schema violations, unavailable input, authentication failure, or GitHub API collection failure.

## 9. JSON output contract

```json
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
      "message": "All 1 CI checks completed successfully."
    },
    {
      "id": "test-report-exists",
      "verdict": "PASS",
      "message": "Test report exists at artifacts/test-report.json."
    }
  ]
}
```

Requirements:

- Rule order is always the order in section 7.
- `summary.total` is always `4`.
- `summary.passed + summary.failed` equals `4`.
- Output contains no timestamps, random identifiers, environment-specific absolute paths, or unstable API response fragments.
- Evaluating the same normalized input must produce byte-equivalent JSON when the same indentation option is used.

## 10. Failure report example

Given a change that is not associated with the task, has a pending CI check, and has no test report, the JSON report is:

```json
{
  "schemaVersion": 1,
  "verdict": "FAIL",
  "taskId": "TASK-123",
  "commitSha": "0123456789abcdef0123456789abcdef01234567",
  "summary": {
    "passed": 1,
    "failed": 3,
    "total": 4
  },
  "rules": [
    {
      "id": "task-associated",
      "verdict": "FAIL",
      "message": "Task TASK-123 is not associated with the change."
    },
    {
      "id": "commit-exists",
      "verdict": "PASS",
      "message": "Commit 0123456789abcdef0123456789abcdef01234567 exists."
    },
    {
      "id": "ci-passes",
      "verdict": "FAIL",
      "message": "CI check test is not successful: status=in_progress, conclusion=null."
    },
    {
      "id": "test-report-exists",
      "verdict": "FAIL",
      "message": "Test report does not exist at artifacts/test-report.json."
    }
  ]
}
```

Default terminal output for the same result:

```text
FAIL github-actions-gate: 1/4 rules passed
FAIL task-associated: Task TASK-123 is not associated with the change.
PASS commit-exists: Commit 0123456789abcdef0123456789abcdef01234567 exists.
FAIL ci-passes: CI check test is not successful: status=in_progress, conclusion=null.
FAIL test-report-exists: Test report does not exist at artifacts/test-report.json.
```

## 11. CLI contract

### 11.1 Commands

```text
github-actions-gate evaluate --input <path|-> [--output <path>] [--json] [--quiet]
github-actions-gate github --repo <owner/repo> --task <id> --sha <sha> [--report <artifact-name>] [--output <path>] [--json] [--quiet]
github-actions-gate --help
github-actions-gate --version
```

`evaluate` is the required offline command.

`github` is the optional network collector. It requires `GITHUB_TOKEN`, retrieves evidence for the named repository and SHA, constructs the canonical input, and invokes the same evaluator.

### 11.2 Options

- `--input <path>` reads UTF-8 JSON from a file.
- `--input -` reads UTF-8 JSON from standard input.
- `--output <path>` writes the machine-readable report, creating parent directories when necessary.
- `--json` writes the JSON report to standard output instead of the human summary.
- `--quiet` suppresses standard output; errors still use standard error.
- `--repo <owner/repo>` selects the GitHub repository in `github` mode.
- `--task <id>` sets the required task identifier in `github` mode.
- `--sha <sha>` selects the commit in `github` mode.
- `--report <artifact-name>` names the required test-report artifact in `github` mode.
- `--help` prints usage and exits `0`.
- `--version` prints the package version and exits `0`.

`--json` and `--quiet` are mutually exclusive. Unknown flags, missing values, duplicate singleton flags, and extra positional arguments exit `2`.

### 11.3 Standard streams

- Human summaries go to standard output.
- JSON requested with `--json` goes to standard output.
- Usage and operational errors go to standard error.
- When `--output` is supplied, the JSON file is written regardless of human or JSON terminal mode.
- A gate failure is not printed as an operational error and therefore does not use standard error.

### 11.4 Exit codes

| Code | Meaning |
| --- | --- |
| `0` | All four deterministic rules pass, or help/version completed. |
| `1` | Valid input evaluated; one or more gate rules failed. |
| `2` | Usage, input, schema, authentication, filesystem, network, or GitHub API error. |

## 12. GitHub mode contract

GitHub mode must:

1. read the token only from `GITHUB_TOKEN`;
2. send the token only to `https://api.github.com`;
3. confirm the commit exists in the named repository;
4. collect check runs for the exact commit SHA;
5. derive task association only from explicit structured linkage supported by the implementation and documented in its README;
6. look for the exact named test-report artifact when `--report` is supplied;
7. convert API data into the canonical input contract;
8. call the same evaluator used by offline mode;
9. never print or persist the token;
10. exit `2` on incomplete pagination, rate limiting, authentication failure, or ambiguous evidence rather than returning a false PASS.

Offline acceptance must not require a GitHub token or network connection.

## 13. Acceptance checklist

### Product specification

- [ ] `PRODUCT_SPEC.md` exists and is non-empty.
- [ ] The specification defines one target user, one workflow, and explicit non-goals.
- [ ] The specification defines canonical JSON input and output.
- [ ] Exactly four deterministic rules are defined.
- [ ] A complete failure report example is included.
- [ ] CLI commands, options, streams, and exit codes are defined.

### Implementation

- [ ] `package.json` declares `"type": "module"`.
- [ ] The executable CLI is implemented in Node.js ESM.
- [ ] Offline evaluation uses no network access.
- [ ] The evaluator reports every rule even when earlier rules fail.
- [ ] The same normalized input produces deterministic output.
- [ ] Missing evidence fails closed.
- [ ] Invalid input exits `2` and never produces `PASS`.

### Rule tests

- [ ] `task-associated` passes on an exact task ID match.
- [ ] `task-associated` fails on absent, partial, or case-different matches.
- [ ] `commit-exists` passes on a non-zero 40-character hexadecimal SHA.
- [ ] `commit-exists` fails on the all-zero SHA.
- [ ] A malformed SHA is rejected as an input error.
- [ ] `ci-passes` passes only when at least one check exists and all checks are completed successfully.
- [ ] `ci-passes` fails on empty, pending, skipped, cancelled, neutral, or failed checks.
- [ ] `test-report-exists` passes only when `exists` is `true` and `path` is non-empty.
- [ ] `test-report-exists` fails when evidence is absent or false.
- [ ] Overall verdict passes only when all four rules pass.

### CLI tests

- [ ] `--input <fixture>` evaluates a local file.
- [ ] `--input -` evaluates standard input.
- [ ] `--json` emits valid JSON only.
- [ ] `--output` creates a report file containing the documented schema.
- [ ] PASS exits `0`.
- [ ] Rule failure exits `1`.
- [ ] Invalid JSON, schema, or CLI usage exits `2`.
- [ ] `--help` and `--version` exit `0`.
- [ ] Unknown and conflicting flags exit `2`.

### Demonstration and packaging

- [ ] `npm test` passes from a clean checkout.
- [ ] `npm run example:offline` runs without credentials or network access and demonstrates both PASS and FAIL fixtures.
- [ ] Example output matches the documented rule order and exit codes.
- [ ] A Dockerfile runs the same CLI without changing its contract.
- [ ] A GitHub Actions example invokes the CLI and preserves exit code `1` as a failed gate.
- [ ] README usage agrees with this specification.
- [ ] No secret, generated report, dependency directory, or local credential is committed.

## 14. Definition of done

The MVP is done only when the repository contains this specification, a minimal Node.js ESM implementation, fixtures, automated tests for every rule and exit code, an offline example, Docker packaging, and a GitHub Actions usage example; all documented verification commands pass from a clean checkout.
