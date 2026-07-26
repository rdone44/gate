import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  buildEvaluationDocument,
  CollectorError,
  collectAll,
} from "../src/collector.mjs";
import { evaluate } from "../src/evaluator.mjs";

const BIN_PATH = fileURLToPath(new URL("../bin/gate.mjs", import.meta.url));

const runGate = (args, env = {}) => {
  try {
    const stdout = execFileSync(process.execPath, [BIN_PATH, ...args], {
      encoding: "utf8",
      maxBuffer: 1 << 20,
      env: { ...process.env, ...env },
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (e) {
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", exitCode: e.status ?? -1 };
  }
};

const VALID_SHA = "0123456789abcdef0123456789abcdef01234567";

// ---------- §16.3 — buildEvaluationDocument with injected stubs ----------

function makeApi({ commitBody = {}, checkRuns = [], artifacts = [], token = "tok" } = {}) {
  const calls = [];
  const fetchPage = async (path) => {
    calls.push({ fetchPage: path });
    if (path === `/repos/owner/repo/commits/${VALID_SHA}`) {
      if (commitBody === null) return { status: 404, headers: new Map(), body: null };
      return { status: 200, headers: new Map(), body: commitBody };
    }
    if (path === `/repos/owner/repo/commits/${VALID_SHA}/check-runs`) {
      if (checkRuns === null) return { status: 404, headers: new Map(), body: null };
      return {
        status: 200,
        headers: new Map([["link", ""]]),
        body: { check_runs: checkRuns, total: checkRuns.length },
      };
    }
    if (path === `/repos/owner/repo/actions/artifacts`) {
      if (artifacts === null) return { status: 404, headers: new Map(), body: null };
      return {
        status: 200,
        headers: new Map([["link", ""]]),
        body: { artifacts, total_count: artifacts.length },
      };
    }
    return { status: 404, headers: new Map(), body: null };
  };
  const collectAll = async (path) => {
    calls.push({ collectAll: path });
    const page = await fetchPage(path);
    if (page.body === null) return [];
    if (path === `/repos/owner/repo/commits/${VALID_SHA}/check-runs`) return page.body.check_runs ?? [];
    if (path === `/repos/owner/repo/actions/artifacts`) return page.body.artifacts ?? [];
    return [];
  };
  return { fetchPage, collectAll, token, calls };
}

test("§16 collect: full PASS pipeline via stubs", async () => {
  const api = makeApi({
    commitBody: { sha: VALID_SHA },
    checkRuns: [{ name: "test", status: "completed", conclusion: "success" }],
    artifacts: [{ name: "test-report", expired: false, archive_download_url: "https://x/y/test-report.zip" }],
  });
  const doc = await buildEvaluationDocument("owner", "repo", VALID_SHA, {
    taskId: "TASK-1",
    report: "test-report",
    branch: "main",
  }, api);

  assert.equal(doc.schemaVersion, 1);
  assert.equal(doc.task.id, "TASK-1");
  assert.equal(doc.change.commitSha, VALID_SHA);
  assert.deepEqual(doc.change.associatedTaskIds, ["TASK-1"]);
  assert.equal(doc.ci.checks.length, 1);
  assert.equal(doc.ci.checks[0].name, "test");
  assert.equal(doc.testReport.exists, true);
  assert.equal(doc.metadata.repository, "owner/repo");
  assert.equal(doc.metadata.branch, "main");

  // Evaluator should PASS on this doc.
  const r = evaluate(doc);
  assert.equal(r.verdict, "PASS");
});

test("§16 collect: missing --task → task.id='<none>', rule 1 FAILs", async () => {
  const api = makeApi({
    commitBody: { sha: VALID_SHA },
    checkRuns: [{ name: "test", status: "completed", conclusion: "success" }],
    artifacts: [{ name: "test-report", expired: false, archive_download_url: "https://x/y/test-report.zip" }],
  });
  const doc = await buildEvaluationDocument("owner", "repo", VALID_SHA, {
    report: "test-report",
  }, api);

  assert.equal(doc.task.id, "<none>");
  assert.deepEqual(doc.change.associatedTaskIds, []);
  const r = evaluate(doc);
  const rule = r.rules.find((x) => x.id === "task-associated");
  assert.equal(rule.verdict, "FAIL");
});

test("§16 collect: null conclusion → string 'null' → rule 3 FAILs (not input err)", async () => {
  const api = makeApi({
    commitBody: { sha: VALID_SHA },
    checkRuns: [{ name: "test", status: "completed", conclusion: null }],
  });
  const doc = await buildEvaluationDocument("owner", "repo", VALID_SHA, { taskId: "T1" }, api);
  assert.equal(doc.ci.checks[0].conclusion, "null");
  const r = evaluate(doc);
  const rule = r.rules.find((x) => x.id === "ci-passes");
  assert.equal(rule.verdict, "FAIL");
});

test("§16 collect: no --report → testReport.exists=false", async () => {
  const api = makeApi({
    commitBody: { sha: VALID_SHA },
    checkRuns: [{ name: "test", status: "completed", conclusion: "success" }],
    artifacts: [{ name: "other", expired: false }],
  });
  const doc = await buildEvaluationDocument("owner", "repo", VALID_SHA, { taskId: "T1" }, api);
  assert.equal(doc.testReport.exists, false);
  assert.equal(doc.testReport.path, "artifacts/");
});

test("§16 collect: glob pattern matches artifact name", async () => {
  const api = makeApi({
    commitBody: { sha: VALID_SHA },
    checkRuns: [{ name: "test", status: "completed", conclusion: "success" }],
    artifacts: [{ name: "test-report-2024.zip", expired: false, archive_download_url: "https://x/y/test-report-2024.zip" }],
  });
  const doc = await buildEvaluationDocument("owner", "repo", VALID_SHA, {
    taskId: "T1",
    report: "test-report-*",
  }, api);
  assert.equal(doc.testReport.exists, true);
  assert.equal(doc.testReport.path, "artifacts/test-report-2024.zip");
});

test("§16 collect: commit 404 → CollectorError COMMIT_NOT_FOUND", async () => {
  const api = makeApi({ commitBody: null });
  await assert.rejects(
    () => buildEvaluationDocument("owner", "repo", VALID_SHA, {}, api),
    (e) => e instanceof CollectorError && e.kind === "COMMIT_NOT_FOUND"
  );
});

test("§16 collect: no GITHUB_TOKEN → CollectorError AUTH_MISSING", async () => {
  const api = makeApi({ token: "" });
  await assert.rejects(
    () => buildEvaluationDocument("owner", "repo", VALID_SHA, {}, api),
    (e) => e instanceof CollectorError && e.kind === "AUTH_MISSING"
  );
});

test("§16 collect: invalid sha → CollectorError AMBIGUOUS_EVIDENCE", async () => {
  const api = makeApi();
  await assert.rejects(
    () => buildEvaluationDocument("owner", "repo", "short", {}, api),
    (e) => e instanceof CollectorError && e.kind === "AMBIGUOUS_EVIDENCE"
  );
});

test("§16 collect: 401 → CollectorError AUTH_FAILED", async () => {
  const api = makeApi();
  api.fetchPage = async () => ({ status: 401, headers: new Map(), body: null });
  await assert.rejects(
    () => buildEvaluationDocument("owner", "repo", VALID_SHA, {}, api),
    (e) => e instanceof CollectorError && e.kind === "AUTH_FAILED"
  );
});

test("§16 collect: 403 + X-RateLimit-Remaining:0 → RATE_LIMITED", async () => {
  const api = makeApi();
  const headers = new Map([["x-ratelimit-remaining", "0"], ["x-ratelimit-reset", "1700000000"]]);
  api.fetchPage = async () => ({ status: 403, headers, body: null });
  await assert.rejects(
    () => buildEvaluationDocument("owner", "repo", VALID_SHA, {}, api),
    (e) => e instanceof CollectorError && e.kind === "RATE_LIMITED" && e.retryAt !== null
  );
});

test("§16 collect: 5xx → CollectorError SERVER_ERROR", async () => {
  const api = makeApi();
  api.fetchPage = async () => ({ status: 503, headers: new Map(), body: null });
  await assert.rejects(
    () => buildEvaluationDocument("owner", "repo", VALID_SHA, {}, api),
    (e) => e instanceof CollectorError && e.kind === "SERVER_ERROR" && e.status === 503
  );
});

test("§16 collect: 404 on check-runs → empty array (not error)", async () => {
  const api = makeApi({
    commitBody: { sha: VALID_SHA },
    checkRuns: null,
  });
  const doc = await buildEvaluationDocument("owner", "repo", VALID_SHA, { taskId: "T1" }, api);
  assert.equal(doc.ci.checks.length, 0);
  const r = evaluate(doc);
  assert.equal(r.rules.find((x) => x.id === "ci-passes").verdict, "FAIL");
});

// ---------- §16.8 — CLI collect usage errors ----------

test("CLI: collect without GITHUB_TOKEN exits 2", () => {
  const { exitCode, stderr } = runGate(
    ["collect", "--owner", "o", "--repo", "r", "--sha", VALID_SHA],
    { GITHUB_TOKEN: "" }
  );
  assert.equal(exitCode, 2);
  assert.match(stderr, /GITHUB_TOKEN is not set/);
});

test("CLI: collect missing --owner exits 2", () => {
  const { exitCode } = runGate(
    ["collect", "--repo", "r", "--sha", VALID_SHA],
    { GITHUB_TOKEN: "x" }
  );
  assert.equal(exitCode, 2);
});

test("CLI: collect missing --repo exits 2", () => {
  const { exitCode } = runGate(
    ["collect", "--owner", "o", "--sha", VALID_SHA],
    { GITHUB_TOKEN: "x" }
  );
  assert.equal(exitCode, 2);
});

test("CLI: collect missing --sha exits 2", () => {
  const { exitCode } = runGate(
    ["collect", "--owner", "o", "--repo", "r"],
    { GITHUB_TOKEN: "x" }
  );
  assert.equal(exitCode, 2);
});

test("CLI: --help now mentions collect command", () => {
  const { stdout, exitCode } = runGate(["--help"]);
  assert.equal(exitCode, 0);
  assert.match(stdout, /collect/);
  assert.match(stdout, /--owner/);
  assert.match(stdout, /--sha/);
});

test("CLI: missing both evaluate and collect command exits 2", () => {
  const file = new URL("../fixtures/pass.json", import.meta.url).pathname;
  const { exitCode } = runGate(["--input", file]);
  assert.equal(exitCode, 2);
});
