// src/report.mjs
// Terminal + JSON presentation for the GitHub Actions Gate (SPEC §9/§10).
// The machine-readable JSON report lives here so output is deterministic and
// byte-equivalent for the same normalized input when the same indent is used.

// Build the JSON report object per SPEC §9.
export function buildReport(result) {
  return {
    schemaVersion: result.schemaVersion,
    verdict: result.verdict,
    taskId: result.taskId,
    commitSha: result.commitSha,
    summary: {
      passed: result.summary.passed,
      failed: result.summary.failed,
      total: result.summary.total,
    },
    rules: result.rules.map((r) => ({
      id: r.id,
      verdict: r.verdict,
      message: r.message,
    })),
  };
}

// Deterministic JSON string (no timestamps, no random ids, stable key order).
export function formatJson(result, indent = 2) {
  return JSON.stringify(buildReport(result), null, indent);
}

// Human-readable terminal summary (SPEC §10).
export function formatSummary(result) {
  const lines = [];
  const head = result.verdict === "PASS" ? "PASS" : "FAIL";
  lines.push(`${head} github-actions-gate: ${result.summary.passed}/${result.summary.total} rules passed`);
  for (const r of result.rules) {
    lines.push(`${r.verdict} ${r.id}: ${r.message}`);
  }
  return lines.join("\n");
}
