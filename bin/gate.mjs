#!/usr/bin/env node
// bin/gate.mjs — GitHub Actions Gate CLI (SPEC §11)
import { readFileSync } from "node:fs";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { evaluate, validateInput, InputError } from "../src/evaluator.mjs";
import { formatJson, formatSummary } from "../src/report.mjs";
import { buildEvaluationDocument, CollectorError } from "../src/collector.mjs";
import { loadConfigFile } from "../src/config.mjs";
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
    `       ${PROG} collect --owner <o> --repo <r> --sha <40-hex> [--task <id>] [--report <name>] [--branch <name>] [--pr <number>] [--output <path>] [--json] [--quiet]`,
    `       ${PROG} watch --owner <o> --repo <r> --sha <40-hex> [--interval <sec>] [--pass-once] [--task <id>] [--report <name>] [--branch <name>] [--pr <number>] [--json] [--quiet]`,
    `       All commands accept [--config <path>] to load rule configuration.`,
    `       ${PROG} --help`,
    `       ${PROG} --version`,
    "",
    "Evaluate a GitHub Actions delivery against four deterministic release-gate rules.",
    "",
    "Commands:",
    "  evaluate                  Read one JSON evaluation document and emit a verdict.",
    "  collect                   Fetch evidence from GitHub REST API, then evaluate.",
    "",
    "Options (evaluate):",
    "  --input <path>            Read UTF-8 JSON from a file.",
    "  --input -                 Read UTF-8 JSON from standard input.",
    "  --output <path>           Write the machine-readable JSON report to a file.",
    "  --json                    Write the JSON report to standard output.",
    "  --quiet                   Suppress standard output; errors still use stderr.",
    "  --help                    Print this help and exit 0.",
    "  --version                 Print the package version and exit 0.",
    "",
    "Options (collect):",
    "  --owner <o>               GitHub org/user slug (required).",
    "  --repo <r>                GitHub repo slug (required).",
    "  --sha <40-hex>            Commit SHA, exactly 40 hex, not all-zero (required).",
    "  --task <id>               Task ID for rule 1 association (optional).",
    "  --report <name>           Artifact name or glob for test-report-exists (optional).",
    "  --branch <name>           Branch name, informational (optional).",
    "  --pr <number>             PR number to fetch merged state from pulls API (optional).",
    "  --output <path>           Same as evaluate --output.",
    "  --json                    Same as evaluate --json.",
    "  --quiet                   Same as evaluate --quiet.",
    "",
    "  --config <path>           Load rule config from a JSON file (optional, all modes).",
    "",
    "Options (watch):",
    "  All collect flags plus:",
    "  --interval <seconds>      Poll interval in seconds (default 60, min 10).",
    "  --pass-once               Exit immediately after first PASS (default: run until Ctrl+C).",
    "",
    "Environment:",
    "  GITHUB_TOKEN               Required for collect; sent only to api.github.com.",
    "",
    "--json and --quiet are mutually exclusive. Exit codes: 0 PASS, 1 rule failure, 2 usage/input/collector error.",
  ]
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
  const opts = {
    input: undefined,
    output: undefined,
    json: false,
    quiet: false,
    owner: undefined,
    repo: undefined,
    sha: undefined,
    task: undefined,
    report: undefined,
    branch: undefined,
    pr: undefined,
    interval: undefined,
    passOnce: false,
    config: undefined,
  };
  let i = 0;

  while (i < argv.length) {
    const a = argv[i];
    switch (a) {
      case "evaluate":
        if (command !== null) dieUsage(`unexpected second command '${a}'`);
        command = "evaluate";
        break;
      case "collect":
        if (command !== null) dieUsage(`unexpected second command '${a}'`);
        command = "collect";
        break;
      case "watch":
        if (command !== null) dieUsage(`unexpected second command '${a}'`);
        command = "watch";
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
      case "--owner": {
        if (opts.owner !== undefined) dieUsage("--owner given more than once");
        const v = argv[i + 1];
        if (v === undefined) dieUsage("--owner requires a value");
        opts.owner = v;
        i += 1;
        break;
      }
      case "--repo": {
        if (opts.repo !== undefined) dieUsage("--repo given more than once");
        const v = argv[i + 1];
        if (v === undefined) dieUsage("--repo requires a value");
        opts.repo = v;
        i += 1;
        break;
      }
      case "--sha": {
        if (opts.sha !== undefined) dieUsage("--sha given more than once");
        const v = argv[i + 1];
        if (v === undefined) dieUsage("--sha requires a value");
        opts.sha = v;
        i += 1;
        break;
      }
      case "--task": {
        if (opts.task !== undefined) dieUsage("--task given more than once");
        const v = argv[i + 1];
        if (v === undefined) dieUsage("--task requires a value");
        opts.task = v;
        i += 1;
        break;
      }
      case "--report": {
        if (opts.report !== undefined) dieUsage("--report given more than once");
        const v = argv[i + 1];
        if (v === undefined) dieUsage("--report requires a value");
        opts.report = v;
        i += 1;
        break;
      }
      case "--branch": {
        if (opts.branch !== undefined) dieUsage("--branch given more than once");
        const v = argv[i + 1];
        if (v === undefined) dieUsage("--branch requires a value");
        opts.branch = v;
        i += 1;
        break;
      }
      case "--pr": {
        if (opts.pr !== undefined) dieUsage("--pr given more than once");
        const v = argv[i + 1];
        if (v === undefined) dieUsage("--pr requires a value");
        opts.pr = v;
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
      case "--interval": {
        if (opts.interval !== undefined) dieUsage("--interval given more than once");
        const v = argv[i + 1];
        if (v === undefined) dieUsage("--interval requires a value");
        const n = Number(v);
        if (!Number.isInteger(n) || n < 10) dieUsage("--interval must be an integer >= 10");
        opts.interval = n;
        i += 1;
        break;
      }
      case "--pass-once":
        if (opts.passOnce) dieUsage("--pass-once given more than once");
        opts.passOnce = true;
        break;
      case "--config": {
        if (opts.config !== undefined) dieUsage("--config given more than once");
        const v = argv[i + 1];
        if (v === undefined) dieUsage("--config requires a value");
        opts.config = v;
        i += 1;
        break;
      }
      default:
        dieUsage(`unknown option '${a}'`);
    }
    i += 1;
  }

  // Validate per-command required flags.
  if (command === "evaluate") {
    if (opts.input === undefined) dieUsage("missing required --input");
    if (opts.json && opts.quiet) dieUsage("--json and --quiet are mutually exclusive");
    return { command, ...opts };
  }

  if (command === "collect") {
    if (opts.owner === undefined) dieUsage("missing required --owner");
    if (opts.repo === undefined) dieUsage("missing required --repo");
    if (opts.sha === undefined) dieUsage("missing required --sha");
    if (opts.json && opts.quiet) dieUsage("--json and --quiet are mutually exclusive");
    return { command, ...opts };
  }

  if (command === "watch") {
    if (opts.owner === undefined) dieUsage("missing required --owner");
    if (opts.repo === undefined) dieUsage("missing required --repo");
    if (opts.sha === undefined) dieUsage("missing required --sha");
    if (opts.json && opts.quiet) dieUsage("--json and --quiet are mutually exclusive");
    if (opts.interval === undefined) opts.interval = 60;
    return { command, ...opts };
  }

  dieUsage("missing 'evaluate', 'collect', or 'watch' command");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }
  if (args.version) {
    process.stdout.write(`${version()}\n`);
    process.exit(0);
  }

  // Load config if --config flag was provided.
  let gateConfig = null;
  if (args.config) {
    try {
      gateConfig = loadConfigFile(args.config);
    } catch (e) {
      process.stderr.write(`${PROG}: config error: ${e.message}\n`);
      process.exit(2);
    }
  }

  // Dispatch by command.
  let input;
  if (args.command === "evaluate") {
    const raw = readInput(args.input);
    try {
      input = JSON.parse(raw);
    } catch (e) {
      process.stderr.write(`${PROG}: invalid JSON: ${e.message}\n`);
      process.exit(2);
    }
  } else if (args.command === "watch") {
    // watch — poll collect+evaluate on interval until PASS (if --pass-once) or Ctrl+C.
    const { owner, repo, sha, task, report, branch, pr, interval, passOnce, json, quiet } = args;
    let lastVerdict = null;
    let poll = 0;

    if (!quiet) {
      const ts = () => new Date().toISOString();
      process.stderr.write(`[${ts()}] watch start — ${owner}/${repo} sha=${sha} interval=${interval}s${passOnce ? " pass-once" : ""}\n`);
    }

    while (true) {
      poll++;
      let input, result;
      try {
        input = await buildEvaluationDocument(owner, repo, sha, {
          taskId: task,
          report: report,
          branch: branch,
          prNumber: pr ? parseInt(pr, 10) : null,
        });
      } catch (e) {
        if (e instanceof CollectorError) {
          process.stderr.write(`${PROG}: ${collectorMessage(e)}\n`);
        } else {
          process.stderr.write(`${PROG}: ${e.message}\n`);
        }
        process.stderr.write(`[poll ${poll}] collect failed — retrying in ${interval}s\n`);
        await sleep(interval * 1000);
        continue;
      }

      try {
        result = evaluate(input, gateConfig);
      } catch (e) {
        if (e instanceof InputError || e.name === "InputError") {
          process.stderr.write(`${PROG}: schema violation: ${e.message}\n`);
        } else {
          process.stderr.write(`${PROG}: ${e.message}\n`);
        }
        await sleep(interval * 1000);
        continue;
      }

      const jsonText = formatJson(result);

      if (!quiet) {
        if (json) {
          process.stdout.write(jsonText + "\n");
        } else {
          const ts = new Date().toISOString();
          process.stdout.write(`[${ts}] poll ${poll}: ${formatSummary(result)}\n`);
        }
      }

      const changed = lastVerdict !== result.verdict;
      lastVerdict = result.verdict;

      if (result.verdict === "PASS" && passOnce && changed) {
        process.exit(0);
      }

      await sleep(interval * 1000);
    }
  } else {
    // collect — fetch from GitHub API.
    try {
      input = await buildEvaluationDocument(args.owner, args.repo, args.sha, {
        taskId: args.task,
        report: args.report,
        branch: args.branch,
        prNumber: args.pr ? parseInt(args.pr, 10) : null,
      });
    } catch (e) {
      if (e instanceof CollectorError) {
        process.stderr.write(`${PROG}: ${collectorMessage(e)}\n`);
        process.exit(2);
      }
      process.stderr.write(`${PROG}: ${e.message}\n`);
      process.exit(2);
    }
  }

  let result;
  try {
    result = evaluate(input, gateConfig);
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

// SPEC §16.6 — map CollectorError kind to human message (no token leakage).
function collectorMessage(e) {
  switch (e.kind) {
    case "AUTH_MISSING":
      return "GITHUB_TOKEN is not set";
    case "AUTH_FAILED":
      return "authentication failed";
    case "RATE_LIMITED":
      return `rate limited; retry at ${e.retryAt || "unknown"}`;
    case "COMMIT_NOT_FOUND":
      return e.message; // already templated in collector
    case "SERVER_ERROR":
      return `GitHub API server error: ${e.status}`;
    case "PAGINATION_INCOMPLETE":
      return `pagination incomplete`;
    case "AMBIGUOUS_EVIDENCE":
      return e.message;
    default:
      return e.message;
  }
}

await main();

function sleep(ms) { return new Promise((r) => { setTimeout(r, ms); }); }
