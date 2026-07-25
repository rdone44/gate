import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateEvaluation } from "../src/evaluator.mjs";
import { formatJson, formatReport } from "../src/report.mjs";

const pass = JSON.parse(readFileSync(new URL("../fixtures/pass.json", import.meta.url), "utf8"));
const fail = JSON.parse(readFileSync(new URL("../fixtures/fail.json", import.meta.url), "utf8"));

test("pass fixture is accepted", () => {
  const r = evaluateEvaluation(pass);
  assert.equal(r.verdict, "accepted");
  assert.equal(r.rules.length, 4);
  for (const rule of r.rules) assert.ok(rule.passed, `${rule.id} should pass`);
});

test("fail fixture is rejected", () => {
  const r = evaluateEvaluation(fail);
  assert.equal(r.verdict, "rejected");
  // CI status is "failure" → rejected
  const ciRule = r.rules.find((x) => x.id === "ci_passed");
  assert.equal(ciRule.passed, false);
});

test("task_associated: missing task", () => {
  const r = evaluateEvaluation({ ...pass, task: null });
  const rule = r.rules.find((x) => x.id === "task_associated");
  assert.equal(rule.passed, false);
  assert.equal(r.verdict, "rejected");
});

test("commit_exists: short sha also matches", () => {
  const r = evaluateEvaluation({ ...pass, commit: { sha: "1234567" } });
  const rule = r.rules.find((x) => x.id === "commit_exists");
  assert.equal(rule.passed, true);
});

test("commit_exists: non-hex sha rejected", () => {
  const r = evaluateEvaluation({ ...pass, commit: { sha: "xyz1234" } });
  const rule = r.rules.find((x) => x.id === "commit_exists");
  assert.equal(rule.passed, false);
});

test("ci_passed: missing run rejected", () => {
  const r = evaluateEvaluation({ ...pass, run: undefined });
  const rule = r.rules.find((x) => x.id === "ci_passed");
  assert.equal(rule.passed, false);
});

test("test_report_present: zero tests rejected", () => {
  const r = evaluateEvaluation({
    ...pass,
    testReport: { summary: { total: 0, passed: 0, failed: 0 } },
  });
  const rule = r.rules.find((x) => x.id === "test_report_present");
  assert.equal(rule.passed, false);
});

test("test_report_present: failures rejected", () => {
  const r = evaluateEvaluation({
    ...pass,
    testReport: { summary: { total: 5, passed: 3, failed: 2 } },
  });
  const rule = r.rules.find((x) => x.id === "test_report_present");
  assert.equal(rule.passed, false);
});

test("formatReport returns string with 结论", () => {
  const r = evaluateEvaluation(pass);
  const s = formatReport(r);
  assert.ok(typeof s === "string");
  assert.ok(s.includes("结论"));
});

test("formatJson output parses as JSON", () => {
  const r = evaluateEvaluation(pass);
  const s = formatJson(r);
  const parsed = JSON.parse(s);
  assert.equal(parsed.verdict, "accepted");
  assert.ok(Array.isArray(parsed.rules));
  assert.ok(typeof parsed.timestamp === "string");
});
