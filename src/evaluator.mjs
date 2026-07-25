// src/evaluator.mjs
// Pure evaluator for the GitHub Actions Gate.
// Input:  { task, commit, run, testReport }
// Output: { verdict, rules }

export function evaluateEvaluation(input) {
  if (!input || typeof input !== "object") {
    throw new Error("evaluation must be an object");
  }
  const { task, commit, run, testReport } = input;

  const rules = [];

  // Rule 1: task_associated
  {
    const passed = Boolean(task && task.id && task.title);
    rules.push({
      id: "task_associated",
      name: "任务关联",
      passed,
      reason: passed
        ? `task ${task.id} — ${task.title}`
        : "task missing id or title",
    });
  }

  // Rule 2: commit_exists
  {
    const sha = commit && commit.sha;
    const passed =
      typeof sha === "string" && /^[0-9a-f]{7,40}$/.test(sha);
    rules.push({
      id: "commit_exists",
      name: "提交存在",
      passed,
      reason: passed ? `commit ${sha}` : "commit sha invalid or missing",
    });
  }

  // Rule 3: ci_passed
  {
    const passed = Boolean(run && run.status === "success");
    rules.push({
      id: "ci_passed",
      name: "CI通过",
      passed,
      reason: passed
        ? "run status = success"
        : `run status = ${run ? run.status : "missing"}`,
    });
  }

  // Rule 4: test_report_present
  {
    const s = testReport && testReport.summary;
    const passed =
      Boolean(s) && typeof s.total === "number" && s.total > 0 && s.failed === 0;
    rules.push({
      id: "test_report_present",
      name: "测试报告存在",
      passed,
      reason: passed
        ? `${s.total} tests, ${s.passed ?? 0} passed, 0 failed`
        : "test report missing or no tests or has failures",
    });
  }

  const verdict = rules.every((r) => r.passed) ? "accepted" : "rejected";

  return { verdict, rules };
}

export const RULE_IDS = [
  "task_associated",
  "commit_exists",
  "ci_passed",
  "test_report_present",
];
