// src/evaluator.mjs
// Pure evaluator for the GitHub Actions Gate.
// Input:  canonical evaluation document (SPEC §6).
// Output: { schemaVersion, verdict, taskId, commitSha, summary, rules }
// v1.1.0: accepts optional config { rules: { "rule-id": false } } to disable rules.

import { isRuleEnabled, defaultConfig } from "./config.mjs";

const ALL_ZERO_SHA = "0".repeat(40);
const HEX40 = /^[0-9a-f]{40}$/;

class InputError extends Error {
  constructor(message) {
    super(message);
    this.name = "InputError";
    this.isInputError = true;
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function assertInput(condition, message) {
  if (!condition) throw new InputError(message);
}

// SPEC §6 schema validation. Invalid input is an input error, not a gate failure.
export function validateInput(input) {
  assertInput(input && typeof input === "object" && !Array.isArray(input), "input must be a JSON object");

  assertInput(Number.isInteger(input.schemaVersion), "schemaVersion must be an integer");
  assertInput(input.schemaVersion === 1, "schemaVersion must equal 1");

  const task = input.task;
  assertInput(task && typeof task === "object", "task must be an object");
  assertInput(isNonEmptyString(task.id), "task.id must be a non-empty string");
  // task.title is optional (SPEC §6) but if present must be a non-empty-after-trim string.
  if (task.title !== undefined) {
    assertInput(typeof task.title === "string" && task.title.trim().length > 0, "task.title must be a non-empty string when provided");
  }

  const change = input.change;
  assertInput(change && typeof change === "object", "change must be an object");
  assertInput(typeof change.commitSha === "string" && HEX40.test(change.commitSha), "change.commitSha must be exactly 40 hexadecimal characters");
  assertInput(change.commitSha !== ALL_ZERO_SHA, "change.commitSha must not be the all-zero SHA");
  assertInput(Array.isArray(change.associatedTaskIds), "change.associatedTaskIds must be an array");
  assertInput(change.associatedTaskIds.every((id) => typeof id === "string"), "change.associatedTaskIds items must be strings");

  const ci = input.ci;
  assertInput(ci && typeof ci === "object", "ci must be an object");
  assertInput(Array.isArray(ci.checks), "ci.checks must be an array");
  for (const [i, check] of ci.checks.entries()) {
    assertInput(check && typeof check === "object", `ci.checks[${i}] must be an object`);
    assertInput(isNonEmptyString(check.name), `ci.checks[${i}].name must be a non-empty string`);
    assertInput(isNonEmptyString(check.status), `ci.checks[${i}].status must be a non-empty string`);
    assertInput(isNonEmptyString(check.conclusion), `ci.checks[${i}].conclusion must be a non-empty string`);
  }

  const testReport = input.testReport;
  assertInput(testReport && typeof testReport === "object", "testReport must be an object");
  assertInput(isNonEmptyString(testReport.path), "testReport.path must be a non-empty string");
  assertInput(typeof testReport.exists === "boolean", "testReport.exists must be a boolean");

  // SPEC v0.3.1 — optional pr field from collector §16 product.
  // If present, must be an object with a non-empty string `state`.
  if (input.pr !== undefined && input.pr !== null) {
    assertInput(typeof input.pr === "object" && !Array.isArray(input.pr), "pr must be an object or null");
    if (input.pr !== null) {
      assertInput(isNonEmptyString(input.pr.state), "pr.state must be a non-empty string");
    }
  }
}

// SPEC §7 — always returns all five rule results, never short-circuits.
// v1.1.0: accepts optional config { rules: { "rule-id": false } } to disable rules.
// A disabled rule always returns PASS with message "disabled by config".
// The overall verdict only considers non-disabled rules.
export function evaluate(input, config = null) {
  validateInput(input);

  const cfg = config || defaultConfig();
  const taskId = input.task.id;
  const commitSha = input.change.commitSha;
  const associatedTaskIds = input.change.associatedTaskIds;
  const checks = input.ci.checks;
  const testReport = input.testReport;

  const rules = [];

  // Rule 1: task-associated — exact case-sensitive membership of task.id in associatedTaskIds.
  {
    if (!isRuleEnabled(cfg, "task-associated")) {
      rules.push({ id: "task-associated", verdict: "PASS", message: "task-associated disabled by config." });
    } else {
      const passed = associatedTaskIds.includes(taskId);
      rules.push({
        id: "task-associated",
        verdict: passed ? "PASS" : "FAIL",
        message: passed
          ? `Task ${taskId} is associated with the change.`
          : `Task ${taskId} is not associated with the change.`,
      });
    }
  }

  // Rule 2: commit-exists — validated as 40-hex non-zero at schema time; here it always PASSes.
  // (A malformed or all-zero SHA is already rejected as an input error by validateInput.)
  {
    if (!isRuleEnabled(cfg, "commit-exists")) {
      rules.push({ id: "commit-exists", verdict: "PASS", message: "commit-exists disabled by config." });
    } else {
      rules.push({
        id: "commit-exists",
        verdict: "PASS",
        message: `Commit ${commitSha} exists.`,
      });
    }
  }

  // Rule 3: ci-passes — at least one check, every check completed+success.
  {
    if (!isRuleEnabled(cfg, "ci-passes")) {
      rules.push({ id: "ci-passes", verdict: "PASS", message: "ci-passes disabled by config." });
    } else {
      let passed = checks.length > 0;
      let message;
      if (passed) {
        passed = checks.every((c) => c.status === "completed" && c.conclusion === "success");
        if (passed) {
          message = `All ${checks.length} CI check${checks.length === 1 ? "" : "s"} completed successfully.`;
        } else {
          const firstBad = checks.find((c) => !(c.status === "completed" && c.conclusion === "success"));
          message = `CI check ${firstBad.name} is not successful: status=${firstBad.status}, conclusion=${firstBad.conclusion}.`;
        }
      } else {
        message = "No CI checks were provided.";
      }
      rules.push({
        id: "ci-passes",
        verdict: passed ? "PASS" : "FAIL",
        message,
      });
    }
  }

  // Rule 4: test-report-exists — boolean authoritative in v0.1.x.
  {
    if (!isRuleEnabled(cfg, "test-report-exists")) {
      rules.push({ id: "test-report-exists", verdict: "PASS", message: "test-report-exists disabled by config." });
    } else {
      const passed = testReport.exists === true && isNonEmptyString(testReport.path);
      rules.push({
        id: "test-report-exists",
        verdict: passed ? "PASS" : "FAIL",
        message: passed
          ? `Test report exists at ${testReport.path}.`
          : `Test report does not exist at ${testReport.path}.`,
      });
    }
  }

  // Rule 5: pr_merged (SPEC v0.4.0) — FAIL if pr is absent/null (no evidence).
  // PASS only if pr.state === "merged". Any other state also FAILs.
  {
    if (!isRuleEnabled(cfg, "pr-merged")) {
      rules.push({ id: "pr-merged", verdict: "PASS", message: "pr-merged disabled by config." });
    } else {
      const pr = input.pr;
      let passed;
      let message;
      if (pr === undefined || pr === null) {
        passed = false;
        message = "No PR evidence; pr field is empty — FAIL (PR required).";
      } else {
        passed = pr.state === "merged";
        message = passed
          ? `PR state is merged.`
          : `PR state is ${pr.state}, not merged.`;
      }
      rules.push({
        id: "pr-merged",
        verdict: passed ? "PASS" : "FAIL",
        message,
      });
    }
  }

  // Overall verdict: PASS only if all enabled rules pass.
  // Disabled rules always PASS and don't affect the verdict.
  const enabledRules = rules.filter((r) => {
    const ruleId = r.id;
    return isRuleEnabled(cfg, ruleId);
  });
  const passedCount = enabledRules.filter((r) => r.verdict === "PASS").length;
  const verdict = passedCount === enabledRules.length ? "PASS" : "FAIL";

  return {
    schemaVersion: 1,
    verdict,
    taskId,
    commitSha,
    summary: {
      passed: passedCount,
      failed: rules.length - passedCount,
      total: rules.length,
    },
    rules,
  };
}

export { InputError };
