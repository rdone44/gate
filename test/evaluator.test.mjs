// test/evaluator.test.mjs
// 33 vitest cases: evaluator rules, report formatters, CLI flags/exit codes,
// whitespace title rejection. Faithful to ACCEPTANCE.md as the coverage blueprint:
// five rules (task_associated/commit_exists/ci_passed/test_report_present/pr_merged),
// pass/fail fixtures, short-SHA rejection, non-hex rejection, missing-CI,
// zero/failing test reports, formatReport output containing PASS/FAIL,
// formatJson output parsing as JSON, CLI flags/exit codes, whitespace title rejection.

import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluate, validateInput, InputError } from "../src/evaluator.mjs";
import { formatJson, formatSummary, buildReport } from "../src/report.mjs";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const passFixture = read("../fixtures/pass.json");
const failFixture = read("../fixtures/fail.json");

const BIN_PATH = fileURLToPath(new URL("../bin/gate.mjs", import.meta.url));
const runGate = (args, stdin) => {
  try {
    const stdout = execFileSync(process.execPath, [BIN_PATH, ...args], {
      input: stdin,
      encoding: "utf8",
      maxBuffer: 1 << 20,
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (e) {
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", exitCode: e.status ?? -1 };
  }
};

const basePass = () => JSON.parse(JSON.stringify(passFixture));
const baseFail = () => JSON.parse(JSON.stringify(failFixture));
const passFile = fileURLToPath(new URL("../fixtures/pass.json", import.meta.url));
const failFile = fileURLToPath(new URL("../fixtures/fail.json", import.meta.url));

// ---------- SPEC §6 — schema validation (1) ----------
describe("schema validation", () => {
  it("rejects non-object input (null/string/array)", () => {
    expect(() => validateInput(null)).toThrow(InputError);
    expect(() => validateInput("x")).toThrow(InputError);
    expect(() => validateInput([])).toThrow(InputError);
  });

  it("rejects wrong schemaVersion", () => {
    const doc = basePass();
    doc.schemaVersion = 2;
    expect(() => validateInput(doc)).toThrow(InputError);
  });

  it("rejects empty task.id", () => {
    const doc = basePass();
    doc.task.id = "  ";
    expect(() => validateInput(doc)).toThrow(InputError);
  });

  it("rejects short commitSha (16 chars)", () => {
    const doc = basePass();
    doc.change.commitSha = "0123456789abcdef";
    expect(() => validateInput(doc)).toThrow(InputError);
  });

  it("rejects all-zero commitSha", () => {
    const doc = basePass();
    doc.change.commitSha = "0".repeat(40);
    expect(() => validateInput(doc)).toThrow(InputError);
  });

  it("rejects commitSha with non-hex chars", () => {
    const doc = basePass();
    doc.change.commitSha = "zz23456789abcdef0123456789abcdef01234567";
    expect(() => validateInput(doc)).toThrow(InputError);
  });

  it("rejects non-array associatedTaskIds", () => {
    const doc = basePass();
    doc.change.associatedTaskIds = "TASK-123";
    expect(() => validateInput(doc)).toThrow(InputError);
  });

  it("accepts the pass fixture", () => {
    expect(() => validateInput(basePass())).not.toThrow();
  });
});

// ---------- SPEC §7 — always evaluates all five rules (2) ----------
describe("evaluation structure", () => {
  it("all five rules present in order even on failure (2 pass / 3 fail)", () => {
    const r = evaluate(baseFail());
    expect(r.rules.length).toBe(5);
    expect(r.rules.map((x) => x.id).join(",")).toBe(
      "task-associated,commit-exists,ci-passes,test-report-exists,pr-merged"
    );
    expect(r.verdict).toBe("FAIL");
    const passCount = r.rules.filter((x) => x.verdict === "PASS").length;
    expect(passCount).toBe(2);
  });

  it("summary counts correct on FAIL (2 pass / 3 fail)", () => {
    const r = evaluate(baseFail());
    expect(r.summary.passed).toBe(2);
    expect(r.summary.failed).toBe(3);
    expect(r.summary.total).toBe(5);
  });

  it("summary counts correct on PASS (5 / 0)", () => {
    const r = evaluate(basePass());
    expect(r.summary.passed).toBe(5);
    expect(r.summary.failed).toBe(0);
    expect(r.summary.total).toBe(5);
  });

  it("verdict PASS only when all five pass", () => {
    expect(evaluate(basePass()).verdict).toBe("PASS");
    const doc = basePass();
    doc.testReport.exists = false;
    expect(evaluate(doc).verdict).toBe("FAIL");
  });
});

// ---------- SPEC §7 — Rule 1: task-associated (3) ----------
describe("Rule 1: task-associated", () => {
  it("PASS on exact id match", () => {
    const r = evaluate(basePass());
    const rule = r.rules.find((x) => x.id === "task-associated");
    expect(rule.verdict).toBe("PASS");
    expect(r.verdict).toBe("PASS");
  });

  it("FAIL on different id", () => {
    const doc = basePass();
    doc.change.associatedTaskIds = ["OTHER-001"];
    const r = evaluate(doc);
    const rule = r.rules.find((x) => x.id === "task-associated");
    expect(rule.verdict).toBe("FAIL");
    expect(r.verdict).toBe("FAIL");
  });

  it("FAIL on empty associatedTaskIds", () => {
    const doc = basePass();
    doc.change.associatedTaskIds = [];
    const r = evaluate(doc);
    const rule = r.rules.find((x) => x.id === "task-associated");
    expect(rule.verdict).toBe("FAIL");
  });

  it("FAIL on case-sensitive mismatch", () => {
    const doc = basePass();
    doc.task.id = "task-123";
    const r = evaluate(doc);
    const rule = r.rules.find((x) => x.id === "task-associated");
    expect(rule.verdict).toBe("FAIL");
  });

  it("PASS with duplicate ids (id still found)", () => {
    const doc = basePass();
    doc.change.associatedTaskIds = ["TASK-123", "TASK-123"];
    const r = evaluate(doc);
    const rule = r.rules.find((x) => x.id === "task-associated");
    expect(rule.verdict).toBe("PASS");
  });

  it("rejects whitespace-only task title", () => {
    const doc = basePass();
    doc.task.title = "   ";
    expect(() => validateInput(doc)).toThrow(InputError);
  });
});

// ---------- SPEC §7 — Rule 2: commit-exists (4) ----------
describe("Rule 2: commit-exists", () => {
  it("PASS on valid 40-hex non-zero SHA", () => {
    const r = evaluate(basePass());
    const rule = r.rules.find((x) => x.id === "commit-exists");
    expect(rule.verdict).toBe("PASS");
  });

  it("all-zero SHA rejected as schema error, not FAIL", () => {
    const doc = basePass();
    doc.change.commitSha = "0".repeat(40);
    expect(() => evaluate(doc)).toThrow(InputError);
  });

  it("short SHA rejected as schema error", () => {
    const doc = basePass();
    doc.change.commitSha = "a1b2c3d";
    expect(() => evaluate(doc)).toThrow(InputError);
  });
});

// ---------- SPEC §7 — Rule 3: ci-passes (5) ----------
describe("Rule 3: ci-passes", () => {
  it("PASS on one check completed+success", () => {
    const r = evaluate(basePass());
    const rule = r.rules.find((x) => x.id === "ci-passes");
    expect(rule.verdict).toBe("PASS");
  });

  it("PASS on multiple checks all completed+success", () => {
    const doc = basePass();
    doc.ci.checks.push({ name: "lint", status: "completed", conclusion: "success" });
    const r = evaluate(doc);
    const rule = r.rules.find((x) => x.id === "ci-passes");
    expect(rule.verdict).toBe("PASS");
    expect(rule.message).toMatch(/2 CI checks/);
  });

  it("FAIL on empty checks (missing CI)", () => {
    const doc = basePass();
    doc.ci.checks = [];
    const r = evaluate(doc);
    const rule = r.rules.find((x) => x.id === "ci-passes");
    expect(rule.verdict).toBe("FAIL");
  });

  it("FAIL on pending status", () => {
    const doc = basePass();
    doc.ci.checks[0].status = "in_progress";
    const r = evaluate(doc);
    const rule = r.rules.find((x) => x.id === "ci-passes");
    expect(rule.verdict).toBe("FAIL");
  });

  it("FAIL on failure conclusion", () => {
    const doc = basePass();
    doc.ci.checks[0].conclusion = "failure";
    const r = evaluate(doc);
    const rule = r.rules.find((x) => x.id === "ci-passes");
    expect(rule.verdict).toBe("FAIL");
  });
});

// ---------- SPEC §7 — Rule 4: test-report-exists (6) ----------
describe("Rule 4: test-report-exists", () => {
  it("PASS on exists=true with non-empty path", () => {
    const r = evaluate(basePass());
    const rule = r.rules.find((x) => x.id === "test-report-exists");
    expect(rule.verdict).toBe("PASS");
  });

  it("FAIL on exists=false", () => {
    const doc = basePass();
    doc.testReport.exists = false;
    const r = evaluate(doc);
    const rule = r.rules.find((x) => x.id === "test-report-exists");
    expect(rule.verdict).toBe("FAIL");
    expect(r.verdict).toBe("FAIL");
  });

  it("FAIL on zero/empty test report path (schema violation)", () => {
    const doc = basePass();
    doc.testReport.exists = true;
    doc.testReport.path = "  ";
    expect(() => evaluate(doc)).toThrow(InputError);
  });
});

// ---------- SPEC v0.3.1 — Rule 5: pr-merged (7) ----------
describe("Rule 5: pr-merged", () => {
  it("PASS on pr.state = merged", () => {
    const doc = basePass();
    doc.pr = { state: "merged" };
    const r = evaluate(doc);
    const rule = r.rules.find((x) => x.id === "pr-merged");
    expect(rule.verdict).toBe("PASS");
    expect(r.verdict).toBe("PASS");
  });

  it("FAIL on pr.state = open", () => {
    const doc = basePass();
    doc.pr = { state: "open" };
    const r = evaluate(doc);
    const rule = r.rules.find((x) => x.id === "pr-merged");
    expect(rule.verdict).toBe("FAIL");
    expect(rule.message).toMatch(/open/);
    expect(r.verdict).toBe("FAIL");
  });

  it("FAIL when pr field absent (no evidence)", () => {
    const doc = basePass();
    delete doc.pr;
    const r = evaluate(doc);
    const rule = r.rules.find((x) => x.id === "pr-merged");
    expect(rule.verdict).toBe("FAIL");
    expect(r.verdict).toBe("FAIL");
  });

  it("FAIL when pr field is null (no evidence)", () => {
    const doc = basePass();
    doc.pr = null;
    const r = evaluate(doc);
    const rule = r.rules.find((x) => x.id === "pr-merged");
    expect(rule.verdict).toBe("FAIL");
    expect(r.verdict).toBe("FAIL");
  });

  it("FAIL on pr.state = closed (not merged)", () => {
    const doc = basePass();
    doc.pr = { state: "closed" };
    const r = evaluate(doc);
    const rule = r.rules.find((x) => x.id === "pr-merged");
    expect(rule.verdict).toBe("FAIL");
    expect(rule.message).toMatch(/closed/);
  });

  it("rejects pr with non-string state as input error", () => {
    const doc = basePass();
    doc.pr = { state: 42 };
    expect(() => evaluate(doc)).toThrow(InputError);
  });
});

// ---------- SPEC §9/§10 — report formatters (8) ----------
describe("report formatters", () => {
  it("formatJson output is valid JSON matching documented schema", () => {
    const r = evaluate(basePass());
    const parsed = JSON.parse(formatJson(r));
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.verdict).toBe("PASS");
    expect(parsed.taskId).toBe("TASK-123");
    expect(parsed.commitSha).toBe("0123456789abcdef0123456789abcdef01234567");
    expect(parsed.summary.passed).toBe(5);
    expect(parsed.summary.failed).toBe(0);
    expect(parsed.summary.total).toBe(5);
    expect(Array.isArray(parsed.rules)).toBe(true);
    expect(parsed.rules[0].id).toBe("task-associated");
    expect(parsed.rules[0].verdict).toBe("PASS");
    expect(parsed.rules[0].message).toBeTruthy();
    // deterministic: same input → same output
    expect(formatJson(r)).toBe(formatJson(evaluate(basePass())));
  });

  it("formatJson output has no timestamps or random ids", () => {
    const r = evaluate(basePass());
    const text = formatJson(r);
    expect(text).not.toContain("timestamp");
    expect(text).not.toContain("id_");
    expect(text).not.toContain("uuid");
  });

  it("formatJson FAIL example matches SPEC §10 structure", () => {
    const r = evaluate(baseFail());
    const parsed = JSON.parse(formatJson(r));
    expect(parsed.verdict).toBe("FAIL");
    expect(parsed.summary.passed).toBe(2);
    expect(parsed.summary.failed).toBe(3);
    expect(parsed.summary.total).toBe(5);
    expect(parsed.rules[0].id).toBe("task-associated");
    expect(parsed.rules[0].verdict).toBe("FAIL");
    expect(parsed.rules[1].id).toBe("commit-exists");
    expect(parsed.rules[1].verdict).toBe("PASS");
    expect(parsed.rules[2].id).toBe("ci-passes");
    expect(parsed.rules[2].verdict).toBe("FAIL");
    expect(parsed.rules[2].message).toMatch(/status=in_progress/);
    expect(parsed.rules[3].id).toBe("test-report-exists");
    expect(parsed.rules[3].verdict).toBe("FAIL");
    expect(parsed.rules[4].id).toBe("pr-merged");
    expect(parsed.rules[4].verdict).toBe("PASS");
  });

  it("formatSummary prints PASS/FAIL head line and per-rule lines", () => {
    const r = evaluate(basePass());
    const out = formatSummary(r);
    const lines = out.split("\n");
    expect(lines[0]).toMatch(/^PASS github-actions-gate: 5\/5 rules passed/);
    expect(lines.length).toBeGreaterThanOrEqual(6);
    expect(lines[1]).toMatch(/^PASS task-associated:/);
    expect(lines[2]).toMatch(/^PASS commit-exists:/);
    expect(lines[3]).toMatch(/^PASS ci-passes:/);
    expect(lines[4]).toMatch(/^PASS test-report-exists:/);
    expect(lines[5]).toMatch(/^PASS pr-merged:/);
  });

  it("formatSummary FAIL example matches documented output", () => {
    const r = evaluate(baseFail());
    const out = formatSummary(r);
    const lines = out.split("\n");
    expect(lines[0]).toMatch(/^FAIL github-actions-gate: 2\/5 rules passed/);
    expect(lines[1]).toMatch(/^FAIL task-associated:/);
    expect(lines[2]).toMatch(/^PASS commit-exists:/);
    expect(lines[3]).toMatch(/^FAIL ci-passes:/);
    expect(lines[4]).toMatch(/^FAIL test-report-exists:/);
    expect(lines[5]).toMatch(/^PASS pr-merged:/);
  });

  it("buildReport returns a fresh object with no mutable shared state", () => {
    const r = evaluate(basePass());
    const a = buildReport(r);
    const b = buildReport(r);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

// ---------- SPEC §11 — CLI flags / exit codes (9) ----------
describe("CLI flags and exit codes", () => {
  it("evaluate --input <file> exits 0 on PASS", () => {
    const { stdout, exitCode } = runGate(["evaluate", "--input", passFile]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/^PASS github-actions-gate/);
  });

  it("evaluate --input <file> exits 1 on FAIL", () => {
    const { stdout, exitCode } = runGate(["evaluate", "--input", failFile]);
    expect(exitCode).toBe(1);
    expect(stdout).toMatch(/^FAIL github-actions-gate/);
  });

  it("evaluate --input - reads stdin", () => {
    const { stdout, exitCode } = runGate(
      ["evaluate", "--input", "-"],
      JSON.stringify(passFixture)
    );
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/^PASS github-actions-gate/);
  });

  it("--json emits valid JSON to stdout on PASS", () => {
    const { stdout, exitCode } = runGate(["evaluate", "--input", passFile, "--json"]);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.verdict).toBe("PASS");
  });

  it("--json with FAIL exits 1 and emits JSON", () => {
    const { stdout, exitCode } = runGate(["evaluate", "--input", failFile, "--json"]);
    expect(exitCode).toBe(1);
    const parsed = JSON.parse(stdout);
    expect(parsed.verdict).toBe("FAIL");
  });

  it("--quiet suppresses stdout, preserves exit code", () => {
    const { stdout, exitCode } = runGate(["evaluate", "--input", passFile, "--quiet"]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
  });

  it("--output writes JSON report file", () => {
    const dir = mkdtempSync(join(tmpdir(), "gate-test-"));
    const outPath = join(dir, "nested", "report.json");
    const { exitCode } = runGate([
      "evaluate", "--input", passFile, "--output", outPath, "--quiet",
    ]);
    expect(exitCode).toBe(0);
    const written = JSON.parse(readFileSync(outPath, "utf8"));
    expect(written.verdict).toBe("PASS");
    expect(written.schemaVersion).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("--help exits 0 and mentions key flags", () => {
    const { stdout, exitCode } = runGate(["--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/Usage:/);
    expect(stdout).toMatch(/--input/);
    expect(stdout).toMatch(/--json/);
    expect(stdout).toMatch(/--quiet/);
  });

  it("--version exits 0 and prints package version", () => {
    const { stdout, exitCode } = runGate(["--version"]);
    expect(exitCode).toBe(0);
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(stdout.trim()).toBe(pkg.version);
  });

  it("unknown flag exits 2", () => {
    const { exitCode, stderr } = runGate(["evaluate", "--input", passFile, "--bogus"]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/unknown option|--input/);
  });

  it("missing evaluate command exits 2", () => {
    const { exitCode } = runGate(["--input", passFile]);
    expect(exitCode).toBe(2);
  });

  it("missing --input exits 2", () => {
    const { exitCode } = runGate(["evaluate"]);
    expect(exitCode).toBe(2);
  });

  it("--json + --quiet mutually exclusive → exit 2", () => {
    const { exitCode } = runGate([
      "evaluate", "--input", passFile, "--json", "--quiet",
    ]);
    expect(exitCode).toBe(2);
  });

  it("invalid JSON on stdin exits 2", () => {
    const { exitCode, stderr } = runGate(
      ["evaluate", "--input", "-"],
      "{ not json }"
    );
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/invalid JSON/);
  });

  it("schema violation exits 2", () => {
    const doc = basePass();
    doc.change.commitSha = "short";
    const { exitCode, stderr } = runGate(
      ["evaluate", "--input", "-"],
      JSON.stringify(doc)
    );
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/schema violation/);
  });

  it("all-zero SHA exits 2 (schema error, not FAIL)", () => {
    const doc = basePass();
    doc.change.commitSha = "0".repeat(40);
    const { exitCode } = runGate(
      ["evaluate", "--input", "-"],
      JSON.stringify(doc)
    );
    expect(exitCode).toBe(2);
  });

  it("pr-merged-pass fixture exits 0 and --json shows pr-merged rule PASS", () => {
    const file = fileURLToPath(new URL("../fixtures/pr-merged-pass.json", import.meta.url));
    const { stdout, exitCode } = runGate(["evaluate", "--input", file, "--json"]);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.verdict).toBe("PASS");
    expect(parsed.summary.total).toBe(5);
    const rule = parsed.rules.find((x) => x.id === "pr-merged");
    expect(rule).toBeTruthy();
    expect(rule.verdict).toBe("PASS");
    expect(rule.message).toMatch(/merged/);
  });

  it("pr-merged-fail fixture exits 1 and --json shows pr-merged FAIL (open)", () => {
    const file = fileURLToPath(new URL("../fixtures/pr-merged-fail.json", import.meta.url));
    const { stdout, exitCode } = runGate(["evaluate", "--input", file, "--json"]);
    expect(exitCode).toBe(1);
    const parsed = JSON.parse(stdout);
    expect(parsed.verdict).toBe("FAIL");
    const rule = parsed.rules.find((x) => x.id === "pr-merged");
    expect(rule).toBeTruthy();
    expect(rule.verdict).toBe("FAIL");
    expect(rule.message).toMatch(/open/);
  });

  it("pr-merged-empty fixture exits 1 (no pr field → FAIL empty)", () => {
    const file = fileURLToPath(new URL("../fixtures/pr-merged-empty.json", import.meta.url));
    const { stdout, exitCode } = runGate(["evaluate", "--input", file, "--json"]);
    expect(exitCode).toBe(1);
    const parsed = JSON.parse(stdout);
    expect(parsed.verdict).toBe("FAIL");
    const rule = parsed.rules.find((x) => x.id === "pr-merged");
    expect(rule.verdict).toBe("FAIL");
    expect(rule.message).toMatch(/empty/);
  });

describe("watch-mode CLI flag validation", () => {
  it("--interval below 10 exits 2", () => {
    const { exitCode, stderr } = runGate([
      "watch", "--owner", "o", "--repo", "r", "--sha", "3113c8e9ec9f228233f9ee981f2c69d78637df23",
      "--interval", "5",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--interval/);
  });

  it("--help shows watch subcommand", () => {
    const { stdout, exitCode } = runGate(["--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/watch\s+--owner/);
    expect(stdout).toMatch(/--interval\s+<sec>/);
    expect(stdout).toMatch(/--pass-once/);
  });

  it("missing --owner for watch exits 2", () => {
    const { exitCode, stderr } = runGate([
      "watch", "--repo", "r", "--sha", "3113c8e9ec9f228233f9ee981f2c69d78637df23",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/missing required --owner/);
  });

  it("invalid --interval value (non-int) exits 2", () => {
    const { exitCode, stderr } = runGate([
      "watch", "--owner", "o", "--repo", "r", "--sha", "3113c8e9ec9f228233f9ee981f2c69d78637df23",
      "--interval", "abc",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--interval/);
  });

  it("watch without sha exits 2", () => {
    const { exitCode, stderr } = runGate([
      "watch", "--owner", "o", "--repo", "r",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/missing required --sha/);
  });
});

  it("real PR #12 fixture evaluates to verdict=PASS", () => {
    const doc = read("../fixtures/real-pr12.json");
    const r = evaluate(doc);
    expect(r.verdict).toBe("PASS");
    expect(r.summary.passed).toBe(5);
    expect(r.summary.failed).toBe(0);
    expect(r.summary.total).toBe(5);
    expect(r.taskId).toBe("DEPLOY-GATE");
    expect(r.commitSha).toBe("0483a111e78a1e0d1ebc8dbd7e13c798de87ff30");
  });
});
