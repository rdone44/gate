import { spawnSync } from 'node:child_process';

for (const fixture of ['pass', 'fail']) {
  console.log(`=== ${fixture.toUpperCase()} fixture ===`);
  const result = spawnSync(process.execPath, ['bin/github-actions-gate.js', 'evaluate', '--input', `fixtures/${fixture}.json`], {
    encoding: 'utf8'
  });
  process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  console.log(`exit code: ${result.status}`);
}
