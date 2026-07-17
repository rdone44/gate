#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { evaluate, normalizeInput } from '../lib/evaluator.js';

const usage = `Usage:
  github-actions-gate evaluate --input <path|-> [--output <path>] [--json] [--quiet]
  github-actions-gate --help
  github-actions-gate --version`;

function parse(args) {
  if (args.length === 1 && args[0] === '--help') return { special: usage };
  if (args.length === 1 && args[0] === '--version') return { special: '0.1.0' };
  if (args.shift() !== 'evaluate') throw new Error('Expected evaluate command');
  const result = { json: false, quiet: false };
  const seen = new Set();
  while (args.length) {
    const flag = args.shift();
    if (!['--input', '--output', '--json', '--quiet'].includes(flag)) throw new Error(`Unknown flag: ${flag}`);
    if (seen.has(flag)) throw new Error(`Duplicate flag: ${flag}`);
    seen.add(flag);
    if (flag === '--json') result.json = true;
    else if (flag === '--quiet') result.quiet = true;
    else {
      if (!args.length || args[0].startsWith('--')) throw new Error(`Missing value for ${flag}`);
      result[flag.slice(2)] = args.shift();
    }
  }
  if (!result.input) throw new Error('--input is required');
  if (result.json && result.quiet) throw new Error('--json and --quiet are mutually exclusive');
  return result;
}

function human(report) {
  return [
    `${report.verdict} github-actions-gate: ${report.summary.passed}/4 rules passed`,
    ...report.rules.map(item => `${item.verdict} ${item.id}: ${item.message}`)
  ].join('\n');
}

try {
  const options = parse(process.argv.slice(2));
  if (options.special) {
    console.log(options.special);
    process.exit(0);
  }
  const raw = options.input === '-' ? await new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  }) : await readFile(options.input, 'utf8');
  const report = evaluate(normalizeInput(JSON.parse(raw)));
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) {
    await mkdir(dirname(options.output), { recursive: true });
    await writeFile(options.output, json, 'utf8');
  }
  if (!options.quiet) process.stdout.write(options.json ? json : `${human(report)}\n`);
  process.exit(report.verdict === 'PASS' ? 0 : 1);
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(2);
}
