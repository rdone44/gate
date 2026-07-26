import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
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

// ---------- SPEC §6 — schema validation ----------

test("validateInput rejects non-object", () => {
  assert.throws(() => validateInput(null), InputError);
  assert.throws(() => validateInput("x"), InputError);
  assert.throws(() => validateInput([]), InputError);
});

test("validateInput rejects wrong schemaVersion", () => {
  const doc = basePass();
  doc.schemaVersion = 2;
  assert.throws(() => validateInput(doc), InputError);
});

test("validateInput rejects empty task.id", () => {
  const doc = basePass();
  doc.task.id = "  ";
  assert.throws(() => validateInput(doc), InputError);
});

test("validateInput rejects short commitSha", () => {
  const doc = basePass();
  doc.change.commitSha = "0123456789abcdef"; // 16 chars
  assert.throws(() => validateInput(doc), InputError);
});

test("validateInput rejects all-zero commitSha", () => {
  const doc = basePass();
  doc.change.commitSha = "0".repeat(40);
  assert.throws(() => validateInput(doc), InputError);
});

test("validateInput rejects commitSha with non-hex chars", () => {
  const doc = basePass();
  doc.change.commitSha = "zz23456789abcdef0123456789abcdef01234567";
  assert.throws(() => validateInput(doc), InputError);
});

test("validateInput rejects non-array associatedTaskIds", () => {
  const doc = basePass();
  doc.change.associatedTaskIds = "TASK-123";
  assert.throws(() => validateInput(doc), InputError);
});

test("validateInput rejects empty testReport.path", () => {
  const doc = basePass();
  doc.testReport.path = "";
  assert.throws(() => validateInput(doc), InputError);
});

test("validateInput rejects missing testReport.exists boolean", () => {
  const doc = basePass();
  doc.testReport.exists = "true";
  assert.throws(() => validateInput(doc), InputError);
});

test("validateInput rejects check item missing non-empty name", () => {
  const doc = basePass();
  doc.ci.checks[0].name = "";
  assert.throws(() => validateInput(doc), InputError);
});

test("valid pass fixture passes schema validation", () => {
  assert.doesNotThrow(() => validateInput(basePass()));
});

// ---------- SPEC §7 — Rule 1: task-associated ----------

test("Rule 1 PASS: exact id match", () => {
  const r = evaluate(basePass());
  const rule = r.rules.find((x) => x.id === "task-associated");
  assert.equal(rule.verdict, "PASS");
  assert.equal(r.verdict, "PASS");
});

test("Rule 1 FAIL: different id", () => {
  const doc = basePass();
  doc.change.associatedTaskIds = ["OTHER-001"];
  const r = evaluate(doc);
  const rule = r.rules.find((x) => x.id === "task-associated");
  assert.equal(rule.verdict, "FAIL");
  assert.equal(r.verdict, "FAIL");
});

test("Rule 1 FAIL: empty associatedTaskIds", () => {
  const doc = basePass();
  doc.change.associatedTaskIds = [];
  const r = evaluate(doc);
  const rule = r.rules.find((x) => x.id === "task-associated");
  assert.equal(rule.verdict, "FAIL");
});

test("Rule 1 FAIL: case-sensitive mismatch", () => {
  const doc = basePass();
  doc.task.id = "task-123";
  const r = evaluate(doc);
  const rule = r.rules.find((x) => x.id === "task-associated");
  assert.equal(rule.verdict, "FAIL");
});

test("Rule 1 PASS: duplicate ids ignored (id still found)", () => {
  const doc = basePass();
  doc.change.associatedTaskIds = ["TASK-123", "TASK-123"];
  const r = evaluate(doc);
  const rule = r.rules.find((x) => x.id === "task-associated");
  assert.equal(rule.verdict, "PASS");
});

// ---------- SPEC §7 — Rule 2: commit-exists ----------

test("Rule 2 PASS: valid 40-hex non-zero SHA", () => {
  const r = evaluate(basePass());
  const rule = r.rules.find((x) => x.id === "commit-exists");
  assert.equal(rule.verdict, "PASS");
});

test("Rule 2: all-zero SHA rejected as schema error, not FAIL", () => {
  const doc = basePass();
  doc.change.commitSha = "0".repeat(40);
  assert.throws(() => evaluate(doc), InputError);
});

test("Rule 2: short SHA rejected as schema error", () => {
  const doc = basePass();
  doc.change.commitSha = "a1b2c3d";
  assert.throws(() => evaluate(doc), InputError);
});

// ---------- SPEC §7 — Rule 3: ci-passes ----------

test("Rule 3 PASS: one check completed+success", () => {
  const r = evaluate(basePass());
  const rule = r.rules.find((x) => x.id === "ci-passes");
  assert.equal(rule.verdict, "PASS");
});

test("Rule 3 PASS: multiple checks all completed+success", () => {
  const doc = basePass();
  doc.ci.checks.push({ name: "lint", status: "completed", conclusion: "success" });
  const r = evaluate(doc);
  const rule = r.rules.find((x) => x.id === "ci-passes");
  assert.equal(rule.verdict, "PASS");
  assert.match(rule.message, /2 CI checks/);
});

test("Rule 3 FAIL: empty checks", () => {
  const doc = basePass();
  doc.ci.checks = [];
  const r = evaluate(doc);
  const rule = r.rules.find((x) => x.id === "ci-passes");
  assert.equal(rule.verdict, "FAIL");
});

test("Rule 3 FAIL: pending status", () => {
  const doc = basePass();
  doc.ci.checks[0].status = "in_progress";
  const r = evaluate(doc);
  const rule = r.rules.find((x) => x.id === "ci-passes");
  assert.equal(rule.verdict, "FAIL");
});

test("Rule 3 FAIL: cancelled conclusion", () => {
  const doc = basePass();
  doc.ci.checks[0].conclusion = "cancelled";
  const r = evaluate(doc);
  const rule = r.rules.find((x) => x.id === "ci-passes");
  assert.equal(rule.verdict, "FAIL");
});

test("Rule 3 FAIL: failure conclusion", () => {
  const doc = basePass();
  doc.ci.checks[0].conclusion = "failure";
  const r = evaluate(doc);
  const rule = r.rules.find((x) => x.id === "ci-passes");
  assert.equal(rule.verdict, "FAIL");
});

// ---------- SPEC §7 — Rule 4: test-report-exists ----------

test("Rule 4 PASS: exists=true and non-empty path", () => {
  const r = evaluate(basePass());
  const rule = r.rules.find((x) => x.id === "test-report-exists");
  assert.equal(rule.verdict, "PASS");
});

test("Rule 4 FAIL: exists=false", () => {
  const doc = basePass();
  doc.testReport.exists = false;
  const r = evaluate(doc);
  const rule = r.rules.find((x) => x.id === "test-report-exists");
  assert.equal(rule.verdict, "FAIL");
  assert.equal(r.verdict, "FAIL");
});

test("Rule 4 FAIL: path empty", () => {
  const doc = basePass();
  const r = evaluate(doc);
  doc.testReport.exists = true;
  doc.testReport.path = "  ";
  // path is empty → schema violation per SPEC §6.2
  assert.throws(() => evaluate(doc), InputError);
});

// ---------- SPEC §7 — always evaluates all four rules ----------

test("all four rules present in order even on failure", () => {
  const r = evaluate(baseFail());
  assert.equal(r.rules.length, 4);
  assert.equal(r.rules.map((x) => x.id).join(","), "task-associated,commit-exists,ci-passes,test-report-exists");
  assert.equal(r.verdict, "FAIL");
  const passCount = r.rules.filter((x) => x.verdict === "PASS").length;
  assert.equal(passCount, 1); // only commit-exists
});

test("summary counts correct on FAIL (1 pass / 3 fail)", () => {
  const r = evaluate(baseFail());
  assert.equal(r.summary.passed, 1);
  assert.equal(r.summary.failed, 3);
  assert.equal(r.summary.total, 4);
});

test("summary counts correct on PASS (4 / 0)", () => {
  const r = evaluate(basePass());
  assert.equal(r.summary.passed, 4);
  assert.equal(r.summary.failed, 0);
  assert.equal(r.summary.total, 4);
});

test("verdict PASS only when all four pass", () => {
  assert.equal(evaluate(basePass()).verdict, "PASS");
  const doc = basePass();
  doc.testReport.exists = false;
  assert.equal(evaluate(doc).verdict, "FAIL");
});

// ---------- SPEC §9 — JSON output contract ----------

test("formatJson output matches documented schema", () => {
  const r = evaluate(basePass());
  const parsed = JSON.parse(formatJson(r));
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.verdict, "PASS");
  assert.equal(parsed.taskId, "TASK-123");
  assert.equal(parsed.commitSha, "0123456789abcdef0123456789abcdef01234567");
  assert.equal(parsed.summary.passed, 4);
  assert.equal(parsed.summary.failed, 0);
  assert.equal(parsed.summary.total, 4);
  assert.ok(Array.isArray(parsed.rules));
  assert.equal(parsed.rules[0].id, "task-associated");
  assert.equal(parsed.rules[0].verdict, "PASS");
  assert.ok(parsed.rules[0].message);
  // deterministic: same input → same output
  assert.equal(formatJson(r), formatJson(evaluate(basePass())));
});

test("JSON output has no timestamps or random ids", () => {
  const r = evaluate(basePass());
  const text = formatJson(r);
  assert.ok(!text.includes("timestamp") && !text.includes("id_") && !text.includes("uuid"));
});

test("JSON output FAIL example matches SPEC §10 structure", () => {
  const r = evaluate(baseFail());
  const parsed = JSON.parse(formatJson(r));
  assert.equal(parsed.verdict, "FAIL");
  assert.equal(parsed.summary.passed, 1);
  assert.equal(parsed.summary.failed, 3);
  assert.equal(parsed.summary.total, 4);
  assert.equal(parsed.rules[0].id, "task-associated");
  assert.equal(parsed.rules[0].verdict, "FAIL");
  assert.equal(parsed.rules[1].id, "commit-exists");
  assert.equal(parsed.rules[1].verdict, "PASS");
  assert.equal(parsed.rules[2].id, "ci-passes");
  assert.equal(parsed.rules[2].verdict, "FAIL");
  assert.match(parsed.rules[2].message, /status=in_progress/);
  assert.equal(parsed.rules[3].id, "test-report-exists");
  assert.equal(parsed.rules[3].verdict, "FAIL");
});

// ---------- SPEC §10 — terminal summary ----------

test("formatSummary prints PASS/FAIL head line and per-rule lines", () => {
  const r = evaluate(basePass());
  const out = formatSummary(r);
  const lines = out.split("\n");
  assert.match(lines[0], /^PASS github-actions-gate: 4\/4 rules passed/);
  assert.ok(lines.length >= 5);
  assert.match(lines[1], /^PASS task-associated:/);
  assert.match(lines[2], /^PASS commit-exists:/);
  assert.match(lines[3], /^PASS ci-passes:/);
  assert.match(lines[4], /^PASS test-report-exists:/);
});

test("formatSummary FAIL example matches documented output", () => {
  const r = evaluate(baseFail());
  const out = formatSummary(r);
  const lines = out.split("\n");
  assert.match(lines[0], /^FAIL github-actions-gate: 1\/4 rules passed/);
  assert.match(lines[1], /^FAIL task-associated:/);
  assert.match(lines[2], /^PASS commit-exists:/);
  assert.match(lines[3], /^FAIL ci-passes:/);
  assert.match(lines[4], /^FAIL test-report-exists:/);
});

// buildReport has no mutable shared state
test("buildReport returns fresh object", () => {
  const r = evaluate(basePass());
  const a = buildReport(r);
  const b = buildReport(r);
  assert.notEqual(a, b);
  assert.deepEqual(a, b);
});

// ---------- SPEC §11 — CLI ----------

test("CLI: --input <file> evaluates and exits 0 on PASS", () => {
  const file = new URL("../fixtures/pass.json", import.meta.url).pathname;
  const { stdout, exitCode } = runGate(["evaluate", "--input", file]);
  assert.equal(exitCode, 0);
  assert.match(stdout, /^PASS github-actions-gate/);
});

test("CLI: --input <file> exits 1 on FAIL", () => {
  const file = new URL("../fixtures/fail.json", import.meta.url).pathname;
  const { stdout, exitCode } = runGate(["evaluate", "--input", file]);
  assert.equal(exitCode, 1);
  assert.match(stdout, /^FAIL github-actions-gate/);
});

test("CLI: --input - reads stdin", () => {
  const { stdout, exitCode } = runGate(["evaluate", "--input", "-"], JSON.stringify(passFixture));
  assert.equal(exitCode, 0);
  assert.match(stdout, /^PASS github-actions-gate/);
});

test("CLI: --json emits valid JSON to stdout", () => {
  const file = new URL("../fixtures/pass.json", import.meta.url).pathname;
  const { stdout, exitCode } = runGate(["evaluate", "--input", file, "--json"]);
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.verdict, "PASS");
});

test("CLI: --json with FAIL exits 1 and emits JSON", () => {
  const file = new URL("../fixtures/fail.json", import.meta.url).pathname;
  const { stdout, exitCode } = runGate(["evaluate", "--input", file, "--json"]);
  assert.equal(exitCode, 1);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.verdict, "FAIL");
});

test("CLI: --quiet suppresses stdout, preserves exit code", () => {
  const file = new URL("../fixtures/pass.json", import.meta.url).pathname;
  const { stdout, exitCode } = runGate(["evaluate", "--input", file, "--quiet"]);
  assert.equal(exitCode, 0);
  assert.equal(stdout, "");
});

test("CLI: --output writes JSON report file", () => {
  const file = new URL("../fixtures/pass.json", import.meta.url).pathname;
  const dir = mkdtempSync(join(tmpdir(), "gate-test-"));
  const outPath = join(dir, "nested", "report.json");
  const { exitCode } = runGate(["evaluate", "--input", file, "--output", outPath, "--quiet"]);
  assert.equal(exitCode, 0);
  const written = JSON.parse(readFileSync(outPath, "utf8"));
  assert.equal(written.verdict, "PASS");
  assert.equal(written.schemaVersion, 1);
  rmSync(dir, { recursive: true, force: true });
});

test("CLI: --help exits 0", () => {
  const { stdout, exitCode } = runGate(["--help"]);
  assert.equal(exitCode, 0);
  assert.match(stdout, /Usage:/);
  assert.match(stdout, /--input/);
  assert.match(stdout, /--json/);
  assert.match(stdout, /--quiet/);
});

test("CLI: --version exits 0 and prints version", () => {
  const { stdout, exitCode } = runGate(["--version"]);
  assert.equal(exitCode, 0);
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(stdout.trim(), pkg.version);
});

test("CLI: unknown flag exits 2", () => {
  const file = new URL("../fixtures/pass.json", import.meta.url).pathname;
  const { exitCode, stderr } = runGate(["evaluate", "--input", file, "--bogus"]);
  assert.equal(exitCode, 2);
  assert.match(stderr, /unknown option|--input/);
});

test("CLI: missing evaluate command exits 2", () => {
  const file = new URL("../fixtures/pass.json", import.meta.url).pathname;
  const { exitCode } = runGate(["--input", file]);
  assert.equal(exitCode, 2);
});

test("CLI: missing --input exits 2", () => {
  const { exitCode } = runGate(["evaluate"]);
  assert.equal(exitCode, 2);
});

test("CLI: --json + --quiet exits 2", () => {
  const file = new URL("../fixtures/pass.json", import.meta.url).pathname;
  const { exitCode } = runGate(["evaluate", "--input", file, "--json", "--quiet"]);
  assert.equal(exitCode, 2);
});

test("CLI: unreadable file exits 2", () => {
  const { exitCode, stderr } = runGate(["evaluate", "--input", "/nonexistent/file.json"]);
  assert.equal(exitCode, 2);
  assert.match(stderr, /cannot read file/);
});

test("CLI: invalid JSON exits 2", () => {
  const { exitCode, stderr } = runGate(["evaluate", "--input", "-"], "{ not json }");
  assert.equal(exitCode, 2);
  assert.match(stderr, /invalid JSON/);
});

test("CLI: schema violation exits 2", () => {
  const doc = basePass();
  doc.change.commitSha = "short";
  const { exitCode, stderr } = runGate(["evaluate", "--input", "-"], JSON.stringify(doc));
  assert.equal(exitCode, 2);
  assert.match(stderr, /schema violation/);
});

test("CLI: all-zero SHA exits 2 (schema error, not FAIL)", () => {
  const doc = basePass();
  doc.change.commitSha = "0".repeat(40);
  const { exitCode } = runGate(["evaluate", "--input", "-"], JSON.stringify(doc));
  assert.equal(exitCode, 2);
});

test("CLI: missing value for --input exits 2", () => {
  const { exitCode } = runGate(["evaluate", "--input"]);
  assert.equal(exitCode, 2);
});

test("CLI: duplicate --input exits 2", () => {
  const file = new URL("../fixtures/pass.json", import.meta.url).pathname;
  const { exitCode } = runGate(["evaluate", "--input", file, "--input", file]);
  assert.equal(exitCode, 2);
});

test("CLI: extra positional argument after flags exits 2", () => {
  const file = new URL("../fixtures/pass.json", import.meta.url).pathname;
  const { exitCode } = runGate(["evaluate", "--input", file, "extra"]);
  assert.equal(exitCode, 2);
});
