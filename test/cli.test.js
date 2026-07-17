import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cli = new URL('../bin/github-actions-gate.js', import.meta.url);
const run = (args, options = {}) => spawnSync(process.execPath, [cli.pathname, ...args], {
  encoding: 'utf8',
  ...options
});

test('file and stdin input emit deterministic JSON and correct exit codes', () => {
  const pass = run(['evaluate', '--input', 'fixtures/pass.json', '--json']);
  assert.equal(pass.status, 0);
  assert.equal(JSON.parse(pass.stdout).verdict, 'PASS');

  const input = readFileSync('fixtures/fail.json', 'utf8');
  const fail = run(['evaluate', '--input', '-', '--json'], { input });
  assert.equal(fail.status, 1);
  assert.equal(JSON.parse(fail.stdout).verdict, 'FAIL');
});

test('--output creates a JSON report', () => {
  const output = join(mkdtempSync(join(tmpdir(), 'gate-')), 'nested', 'report.json');
  const result = run(['evaluate', '--input', 'fixtures/pass.json', '--output', output, '--quiet']);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(JSON.parse(readFileSync(output, 'utf8')).summary.total, 4);
});

test('invalid JSON, schema, usage, and conflicting flags exit 2', () => {
  for (const result of [
    run(['evaluate', '--input', '-'], { input: '{' }),
    run(['evaluate', '--input', '-'], { input: '{}' }),
    run(['evaluate', '--input', 'fixtures/pass.json', '--json', '--quiet']),
    run(['evaluate', '--unknown'])
  ]) assert.equal(result.status, 2);
});

test('help and version exit 0', () => {
  assert.match(execFileSync(process.execPath, [cli.pathname, '--help'], { encoding: 'utf8' }), /Usage:/);
  assert.equal(execFileSync(process.execPath, [cli.pathname, '--version'], { encoding: 'utf8' }).trim(), '0.1.0');
});
