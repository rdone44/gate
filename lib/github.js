const api = 'https://api.github.com';

async function get(path, token, fetchImpl) {
  const response = await fetchImpl(`${api}${path}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28'
    }
  });
  if (!response.ok) {
    let detail = response.statusText;
    try { detail = (await response.json()).message || detail; } catch {}
    throw new Error(`GitHub API ${response.status}: ${detail}`);
  }
  if (response.headers.get('link')?.includes('rel="next"')) {
    throw new Error('GitHub API response requires unsupported pagination');
  }
  return response.json();
}

export async function collectGitHubInput({ repo, task, sha, report, token, fetchImpl = fetch }) {
  if (!token) throw new Error('GITHUB_TOKEN is required');
  if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) throw new Error('--repo must be owner/repo');
  if (!/^[0-9a-fA-F]{40}$/.test(sha)) throw new Error('--sha must be 40 hexadecimal characters');

  const prefix = `/repos/${repo}`;
  const commit = await get(`${prefix}/commits/${sha}`, token, fetchImpl);
  if (commit.sha.toLowerCase() !== sha.toLowerCase()) throw new Error('GitHub returned an ambiguous commit');
  const trailer = /^Task-ID:\s*(\S+)\s*$/gmi;
  const associatedTaskIds = [...commit.commit.message.matchAll(trailer)].map(match => match[1]);
  const checkData = await get(`${prefix}/commits/${sha}/check-runs?per_page=100`, token, fetchImpl);
  if (!Array.isArray(checkData.check_runs)) throw new Error('GitHub check-run data is missing');

  let reportExists = false;
  if (report) {
    const artifacts = await get(`${prefix}/actions/artifacts?name=${encodeURIComponent(report)}&per_page=100`, token, fetchImpl);
    if (!Array.isArray(artifacts.artifacts)) throw new Error('GitHub artifact data is missing');
    reportExists = artifacts.artifacts.some(artifact =>
      artifact.name === report && artifact.expired === false && artifact.workflow_run?.head_sha?.toLowerCase() === sha.toLowerCase()
    );
  }

  return {
    schemaVersion: 1,
    task: { id: task },
    change: { commitSha: commit.sha, associatedTaskIds },
    ci: {
      checks: checkData.check_runs.map(check => ({
        name: check.name,
        status: check.status,
        conclusion: check.conclusion ?? 'missing'
      }))
    },
    testReport: { path: report ? `github-artifact:${report}` : 'github-artifact:not-requested', exists: reportExists }
  };
}
