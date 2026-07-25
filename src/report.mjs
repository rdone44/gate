// src/report.mjs
import { evaluateEvaluation } from "./evaluator.mjs";

export function formatJson(result) {
  return JSON.stringify(
    {
      verdict: result.verdict,
      timestamp: new Date().toISOString(),
      rules: result.rules,
    },
    null,
    2
  );
}

export function formatReport(result) {
  const lines = [];
  lines.push("GitHub Actions Gate — 验收结果");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  for (const r of result.rules) {
    lines.push(
      `  ${r.passed ? "✓" : "✗"} ${r.name} (${r.id}): ${r.reason}`
    );
  }
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push(
    `结论: ${result.verdict === "accepted" ? "✓ 通过" : "✗ 拒绝"}`
  );
  return lines.join("\n");
}
