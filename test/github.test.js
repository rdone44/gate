import test from 'node:test';
import assert from 'node:assert/strict';
import { collectGitHubInput } from '../lib/github.js';

const sha = 'a'.repeat(40);

function fakeFetch(routes) {
  return async (url, options) => {
    const path = new URL(url).pathname + new URL(url).search;
    const response = routes[path];
    assert.equal(options.headers.authorization, 'Bearer secret');
    if (!response) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: response.headers
    });
  };
}

const baseRoutes = {
  [`/repos/acme/widget/commits/${sha}`]: {
    body: { sha, commit: { message: 'Ship gate\n\nTask-ID: TASK-42' } }
  },
  [`/repos/acme/widget/commits/${sha}/check-runs?per_page=100`]: {
    body: { total_count: 1, check_runs: [{ name: 'test', status: 'completed', conclusion: 'success' }] }
  },
  '/repos/acme/widget/actions/artifacts?name=tests&per_page=100': {
    body: { total_count: 1, artifacts: [{ name: 'tests', expired: false, workflow_run: { head_sha: sha } }] }
  }
};

test('collects successful GitHub evidence into canonical input', async () => {
  const input = await collectGitHubInput({
    repo: 'acme/widget', task: 'TASK-42', sha, report: 'tests', token: 'secret', fetchImpl: fakeFetch(baseRoutes)
  });
  assert.deepEqual(input, {
    schemaVersion: 1,
    task: { id: 'TASK-42' },
    change: { commitSha: sha, associatedTaskIds: ['TASK-42'] },
    ci: { checks: [{ name: 'test', status: 'completed', conclusion: 'success' }] },
    testReport: { path: 'github-artifact:tests', exists: true }
  });
});

test('rejects GitHub permission failures as operational errors', async () => {
  const routes = { ...baseRoutes, [`/repos/acme/widget/commits/${sha}`]: { status: 403, body: { message: 'Resource not accessible by integration' } } };
  await assert.rejects(
    collectGitHubInput({ repo: 'acme/widget', task: 'TASK-42', sha, token: 'secret', fetchImpl: fakeFetch(routes) }),
    /GitHub API 403/
  );
});

test('missing checks and report remain explicit failing evidence', async () => {
  const routes = {
    ...baseRoutes,
    [`/repos/acme/widget/commits/${sha}/check-runs?per_page=100`]: { body: { total_count: 0, check_runs: [] } },
    '/repos/acme/widget/actions/artifacts?name=missing&per_page=100': { body: { total_count: 0, artifacts: [] } }
  };
  const input = await collectGitHubInput({
    repo: 'acme/widget', task: 'TASK-42', sha, report: 'missing', token: 'secret', fetchImpl: fakeFetch(routes)
  });
  assert.deepEqual(input.ci.checks, []);
  assert.deepEqual(input.testReport, { path: 'github-artifact:missing', exists: false });
});
