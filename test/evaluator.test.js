import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, normalizeInput } from '../lib/evaluator.js';

const valid = {
  schemaVersion: 1,
  task: { id: 'TASK-123' },
  change: {
    commitSha: '0123456789abcdef0123456789abcdef01234567',
    associatedTaskIds: ['TASK-123']
  },
  ci: { checks: [{ name: 'test', status: 'completed', conclusion: 'success' }] },
  testReport: { path: 'artifacts/test-report.json', exists: true }
};

const run = (patch = {}) => evaluate(normalizeInput({
  ...valid,
  ...patch,
  task: { ...valid.task, ...patch.task },
  change: { ...valid.change, ...patch.change },
  ci: { ...valid.ci, ...patch.ci },
  testReport: { ...valid.testReport, ...patch.testReport }
}));

test('all four rules pass for complete evidence', () => {
  const report = run();
  assert.equal(report.verdict, 'PASS');
  assert.deepEqual(report.rules.map(({ id, verdict }) => [id, verdict]), [
    ['task-associated', 'PASS'],
    ['commit-exists', 'PASS'],
    ['ci-passes', 'PASS'],
    ['test-report-exists', 'PASS']
  ]);
});

test('task association requires an exact case-sensitive match', () => {
  for (const ids of [[], ['TASK'], ['task-123']]) {
    assert.equal(run({ change: { associatedTaskIds: ids } }).rules[0].verdict, 'FAIL');
  }
});

test('all-zero commit fails and malformed commit is rejected', () => {
  assert.equal(run({ change: { commitSha: '0'.repeat(40) } }).rules[1].verdict, 'FAIL');
  assert.throws(() => run({ change: { commitSha: 'abc' } }), /commitSha/);
});

test('CI requires at least one completed successful check', () => {
  assert.equal(run({ ci: { checks: [] } }).rules[2].verdict, 'FAIL');
  for (const conclusion of ['pending', 'skipped', 'cancelled', 'neutral', 'failure']) {
    const check = conclusion === 'pending'
      ? { name: 'test', status: 'in_progress', conclusion: 'pending' }
      : { name: 'test', status: 'completed', conclusion };
    assert.equal(run({ ci: { checks: [check] } }).rules[2].verdict, 'FAIL');
  }
});

test('test report requires true evidence and a non-empty path', () => {
  assert.equal(run({ testReport: { exists: false } }).rules[3].verdict, 'FAIL');
  assert.throws(() => run({ testReport: { path: ' ' } }), /testReport.path/);
});

test('a failed rule makes the overall verdict fail without short-circuiting', () => {
  const report = run({ change: { associatedTaskIds: [] }, ci: { checks: [] } });
  assert.equal(report.verdict, 'FAIL');
  assert.equal(report.rules.length, 4);
  assert.deepEqual(report.summary, { passed: 2, failed: 2, total: 4 });
});
