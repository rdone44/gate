# github-actions-gate

Deterministic Node.js CLI that accepts a delivery only when its task association, commit, CI checks, and test-report evidence all pass.

## Offline

```sh
node bin/github-actions-gate.js evaluate --input fixtures/pass.json
node bin/github-actions-gate.js evaluate --input fixtures/fail.json --json
```

## GitHub API

Set `GITHUB_TOKEN`, then provide the exact repository, task ID, and 40-character commit SHA:

```sh
GITHUB_TOKEN=... node bin/github-actions-gate.js github \
  --repo owner/repo --task TASK-42 --sha 0123456789abcdef0123456789abcdef01234567 \
  --report test-results --json
```

The token is sent only to `https://api.github.com`. Task association is derived only from exact commit-message trailers:

```text
Task-ID: TASK-42
```

`--report` names a GitHub Actions artifact. It counts only when it is unexpired and its workflow run has the requested SHA. Missing checks or artifacts produce a gate failure; authentication, permission, rate-limit, pagination, malformed, or ambiguous API responses exit `2`.

## Test

```sh
npm test
npm run example:offline
```
