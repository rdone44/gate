#!/usr/bin/env node
// bin/gate.mjs — GitHub Actions Gate CLI
import { readFileSync } from "node:fs";
import { evaluateEvaluation } from "../src/evaluator.mjs";
import { formatJson, formatReport } from "../src/report.mjs";

const args = process.argv.slice(2);
const jsonFlag = args.includes("--json");
const fileArgs = args.filter((a) => !a.startsWith("--"));

if (fileArgs.length === 0) {
  process.stderr.write("Usage: gate <evaluation.json> [--json]\n");
  process.exit(2);
}

const path = fileArgs[0];
let raw;
try {
  raw = readFileSync(path, "utf8");
} catch {
  process.stderr.write(`Error: cannot read file: ${path}\n`);
  process.exit(2);
}

let input;
try {
  input = JSON.parse(raw);
} catch (e) {
  process.stderr.write(`Error: invalid JSON: ${e.message}\n`);
  process.exit(2);
}

let result;
try {
  result = evaluateEvaluation(input);
} catch (e) {
  process.stderr.write(`Error: ${e.message}\n`);
  process.exit(2);
}

if (jsonFlag) {
  process.stdout.write(formatJson(result) + "\n");
} else {
  process.stdout.write(formatReport(result) + "\n");
}

process.exit(result.verdict === "accepted" ? 0 : 1);
