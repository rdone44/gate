#!/usr/bin/env node
// bin/gate.mjs — GitHub Actions Gate CLI (SPEC §11)
import { readFileSync } from "node:fs";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { evaluate, validateInput, InputError } from "../src/evaluator.mjs";
import { formatJson, formatSummary } from "../src/report.mjs";
import { readFileSync as _r } from "node:fs";

const PROG = "github-actions-gate";

function version() {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  } catch {
    pkg = { version: "0.0.0" };
  }
  return pkg.version;
}

function printHelp() {
  const out = [
    `Usage: ${PROG} evaluate --input <path|-> [--output <path>] [--json] [--quiet]`,
    `       ${PROG} --help`,
    `       ${PROG} --version`,
    "",
    "Evaluate a GitHub Actions delivery against four deterministic release-gate rules.",
    "",
    "Commands:",
    "  evaluate                  Read one JSON evaluation document and emit a verdict.",
    "",
    "Options:",
    "  --input <path>            Read UTF-8 JSON from a file.",
    "  --input -                 Read UTF-8 JSON from standard input.",
    "  --output <path>           Write the machine-readable JSON report to a file.",
    "  --json                    Write the JSON report to standard output.",
    "  --quiet                   Suppress standard output; errors still use stderr.",
    "  --help                    Print this help and exit 0.",
    "  --version                 Print the package version and exit 0.",
    "",
    "--json and --quiet are mutually exclusive. Exit codes: 0 PASS, 1 rule failure, 2 usage/input error.",
  ];
  process.stdout.write(out.join("\n") + "\n");
}

function dieUsage(message) {
  process.stderr.write(`${PROG}: ${message}\n`);
  process.stderr.write(`Try '${PROG} --help'.\n`);
  process.exit(2);
}

function readInput(path) {
  if (path === "-") {
    try {
      return readFileSync(0, "utf8");
    } catch (e) {
      process.stderr.write(`${PROG}: cannot read standard input: ${e.message}\n`);
      process.exit(2);
    }
  }
  try {
    return readFileSync(path, "utf8");
  } catch (e) {
    process.stderr.write(`${PROG}: cannot read file: ${path}\n`);
    process.exit(2);
  }
}

function parseArgs(argv) {
  // --help / --version short-circuit.
  if (argv.length >= 1 && argv[0] === "--help") return { help: true };
  if (argv.length >= 1 && argv[0] === "--version") return { version: true };

  let command = null;
  const opts = { input: undefined, output: undefined, json: false, quiet: false };
  let i = 0;

  while (i < argv.length) {
    const a = argv[i];
    switch (a) {
      case "evaluate":
        if (command !== null) dieUsage("unexpected second command 'evaluate'");
        command = "evaluate";
        break;
      case "--input": {
        if (opts.input !== undefined) dieUsage("--input given more than once");
        const v = argv[i + 1];
        if (v === undefined) dieUsage("--input requires a value");
        opts.input = v;
        i += 1;
        break;
      }
      case "--output": {
        if (opts.output !== undefined) dieUsage("--output given more than once");
        const v = argv[i + 1];
        if (v === undefined) dieUsage("--output requires a value");
        opts.output = v;
        i += 1;
        break;
      }
      case "--json":
        if (opts.json) dieUsage("--json given more than once");
        opts.json = true;
        break;
      case "--quiet":
        if (opts.quiet) dieUsage("--quiet given more than once");
        opts.quiet = true;
        break;
      default:
        dieUsage(`unknown option '${a}'`);
    }
    i += 1;
  }

  if (command !== "evaluate") dieUsage("missing 'evaluate' command");
  if (opts.input === undefined) dieUsage("missing required --input");
  if (opts.json && opts.quiet) dieUsage("--json and --quiet are mutually exclusive");
  return { command: "evaluate", ...opts };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }
  if (args.version) {
    process.stdout.write(`${version()}\n`);
    process.exit(0);
  }

  const raw = readInput(args.input);
  let input;
  try {
    input = JSON.parse(raw);
  } catch (e) {
    process.stderr.write(`${PROG}: invalid JSON: ${e.message}\n`);
    process.exit(2);
  }

  let result;
  try {
    result = evaluate(input);
  } catch (e) {
    if (e instanceof InputError || e.name === "InputError") {
      process.stderr.write(`${PROG}: schema violation: ${e.message}\n`);
      process.exit(2);
    }
    process.stderr.write(`${PROG}: ${e.message}\n`);
    process.exit(2);
  }

  const jsonText = formatJson(result);

  if (args.output) {
    try {
      mkdirSync(dirname(args.output), { recursive: true });
      writeFileSync(args.output, jsonText + "\n", "utf8");
    } catch (e) {
      process.stderr.write(`${PROG}: cannot write output file: ${e.message}\n`);
      process.exit(2);
    }
  }

  if (!args.quiet) {
    if (args.json) {
      process.stdout.write(jsonText + "\n");
    } else {
      process.stdout.write(formatSummary(result) + "\n");
    }
  }

  process.exit(result.verdict === "PASS" ? 0 : 1);
}

main();
