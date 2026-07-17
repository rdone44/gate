const requiredObject = (value, path) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value;
};

const requiredString = (value, path) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${path} must be a non-empty string`);
  return value.trim();
};

export function normalizeInput(input) {
  requiredObject(input, 'input');
  if (input.schemaVersion !== 1) throw new Error('schemaVersion must equal 1');
  const task = requiredObject(input.task, 'task');
  const change = requiredObject(input.change, 'change');
  const ci = requiredObject(input.ci, 'ci');
  const testReport = requiredObject(input.testReport, 'testReport');
  const taskId = requiredString(task.id, 'task.id');
  const commitSha = requiredString(change.commitSha, 'change.commitSha');
  if (!/^[0-9a-fA-F]{40}$/.test(commitSha)) throw new Error('change.commitSha must be 40 hexadecimal characters');
  if (!Array.isArray(change.associatedTaskIds) || change.associatedTaskIds.some(id => typeof id !== 'string')) {
    throw new Error('change.associatedTaskIds must be an array of strings');
  }
  if (!Array.isArray(ci.checks)) throw new Error('ci.checks must be an array');
  const checks = ci.checks.map((check, index) => {
    requiredObject(check, `ci.checks[${index}]`);
    return {
      name: requiredString(check.name, `ci.checks[${index}].name`),
      status: requiredString(check.status, `ci.checks[${index}].status`),
      conclusion: requiredString(check.conclusion, `ci.checks[${index}].conclusion`)
    };
  });
  const reportPath = requiredString(testReport.path, 'testReport.path');
  if (typeof testReport.exists !== 'boolean') throw new Error('testReport.exists must be a boolean');
  return {
    taskId,
    commitSha,
    associatedTaskIds: [...new Set(change.associatedTaskIds)],
    checks,
    reportPath,
    reportExists: testReport.exists
  };
}

const rule = (id, passed, message) => ({ id, verdict: passed ? 'PASS' : 'FAIL', message });

export function evaluate(input) {
  const associated = input.associatedTaskIds.includes(input.taskId);
  const commitExists = input.commitSha !== '0'.repeat(40);
  const ciPasses = input.checks.length > 0 && input.checks.every(check => check.status === 'completed' && check.conclusion === 'success');
  const reportExists = input.reportExists === true;
  const badCheck = input.checks.find(check => check.status !== 'completed' || check.conclusion !== 'success');
  const rules = [
    rule('task-associated', associated, `Task ${input.taskId} is ${associated ? '' : 'not '}associated with the change.`),
    rule('commit-exists', commitExists, commitExists ? `Commit ${input.commitSha} exists.` : `Commit ${input.commitSha} does not exist.`),
    rule('ci-passes', ciPasses, ciPasses
      ? `All ${input.checks.length} CI checks completed successfully.`
      : badCheck
        ? `CI check ${badCheck.name} is not successful: status=${badCheck.status}, conclusion=${badCheck.conclusion}.`
        : 'No CI checks were provided.'),
    rule('test-report-exists', reportExists, `Test report ${reportExists ? 'exists' : 'does not exist'} at ${input.reportPath}.`)
  ];
  const passed = rules.filter(item => item.verdict === 'PASS').length;
  return {
    schemaVersion: 1,
    verdict: passed === 4 ? 'PASS' : 'FAIL',
    taskId: input.taskId,
    commitSha: input.commitSha,
    summary: { passed, failed: 4 - passed, total: 4 },
    rules
  };
}
