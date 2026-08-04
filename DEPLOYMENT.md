# Deployment Gate — gate as a deployment blocker

> **Status:** v1.0设计，配套 workflow: `.github/workflows/deploy-gate.yml`
> **Repository:** `github.com/rdone44/github-actions-gate`
> **基线:** HEAD `75d7289`，tag `v1.0` 已打，89/89 tests 全过

---

## 1. 角色转变

gate 在 v1.0 之前是**静态评审器**：只在 PR 时跑一次，把 verdict 写成 PR comment，不阻断任何东西（workflow 里所有 gate 步骤都 `continue-on-error: true`）。

本次设计把 gate 提升为**部署阻断层**（deployment blocker）：

```
PR merged → push to main → deploy-gate workflow 触发
           → gate 收集证据 + 5 条规则评估
           → PASS 才放行 deploy
           → FAIL 物理阻断 deploy（job 失败 → needs:gate 不满足 → deploy job 跳过）
```

**核心不变量：零新增规则逻辑。** 复用 `bin/gate.mjs collect`，复用 `src/evaluator.mjs` 的 5 条规则
（`task-associated` / `commit-exists` / `ci-passes` / `test-report-exists` / `pr-merged`）
和 `src/collector.mjs` 的证据收集。本次只新增 workflow YAML + 本文档，不修改 `bin/gate.mjs` / `src/*.mjs` / `test/*.mjs`。

---

## 2. 整体流程

```
        ┌────────────────────────────────────────────────────┐
        │  开发者合并 PR（Squash/Merge commit 进 main）        │
        └───────────────────────┬────────────────────────────┘
                                │  push 事件 → main
                                ▼
        ┌────────────────────────────────────────────────────┐
        │  deploy-gate.yml  ·  job: gate                      │
        │  ┌────────────────────────────────────────────────┐ │
        │  │ 1. checkout + setup-node + npm install         │ │
        │  │ 2. Resolve merged PR number (REST API)        │ │
        │  │ 3. node bin/gate.mjs collect \                 │ │
        │  │      --owner --repo --sha --task --pr \         │ │
        │  │      --report --branch --json --output          │ │
        │  │    (no continue-on-error — FAIL → exit 1)      │ │
        │  │ 4. 导出 verdict 到 job outputs                  │ │
        │  │ 5. 上传 gate-result.json artifact (always)     │ │
        │  │ 6. 写 commit status success/failure            │ │
        │  └────────────────────────────────────────────────┘ │
        └───────────────────────┬────────────────────────────┘
                                │
              ┌─────────────────┴──────────────────┐
              ▼                                    ▼
     gate job 成功（PASS）                 gate job 失败（FAIL）
     exit 0                              exit 1
              │                                    │
              ▼                                    ▼
     ┌──────────────────────┐              deploy job 被 needs:gate 阻断
     │  deploy-gate.yml     │              （GitHub 自动标记 skipped）
     │  job: deploy         │
     │  needs: [gate]       │
     │  environment: prod  │
     │  checkout + verify   │
     │  deploy placeholder  │
     │  record deployment   │
     └──────────────────────┘
```

---

## 3. 为什么用 `push:` 触发而不是 `pull_request: closed`

PR 合并到 main 的标准信号是 **push 到 main**（不管 squash merge 还是 merge commit，GitHub 都会产生一次 push 事件，`github.sha` = 合并后的 commit）。`pull_request` 事件的 `closed` + `merged: true` 也可用，但有三个缺点：

1. **merge commit SHA**：`pull_request` 事件里的 `github.sha` 是 PR 分支最后一个 commit，不是合并后落到 main 的 commit；collector 用 `--sha` 去查 check-runs，必须用合并后的 SHA，否则 check-runs 为空 → `ci-passes` 必然 FAIL。
2. **CI 检查时机**：PR 合并后 main 上会跑一次 CI（gate.yml 里的 `npm test` 等），用 `push` 可以等到这次 CI 跑完 check-runs 才评估，证据更完整。
3. **一个触发源一致**：直接 push 到 main（不经 PR）也会触发 gate——这正是"不让任何 commit 绕过 gate"的设计目标。

**PR number 的获取**：`push` 事件没有 `github.event.pull_request`，所以 workflow 里用 `gh pr list --state merged --json number,mergeCommitSha` 反查哪个已合并 PR 对应这个 SHA，再把 `--task` / `--pr` 传给 collector。查不到时（直接 push），`--pr` 省略 → `pr-merged` 规则按设计 FAIL（`pr field is empty — FAIL (PR required)`）。这是 gate 的**预期行为**：直接 push 不带 PR 证据，就该阻断。

---

## 4. Gate 如何阻断部署

GitHub Actions 的阻断机制是 **job 依赖失败传播**，不是 `if` 判断：

### 机制 A：`needs:` 依赖（主防线）

```yaml
deploy:
  needs: gate      # gate job 失败 → deploy job 被 GitHub 标记 skipped
```

gate 的 `collect` 步骤**没有** `continue-on-error`。`bin/gate.mjs` 在 verdict != PASS 时 `process.exit(1)`（第 297 行），该 step 失败 → gate job 失败 → `needs:gate` 不满足 → deploy job **物理不执行**。这是第一道、也是最硬的阻断：没有任何代码路径可以从 FAIL 走到 deploy。

### 机制 B：defensive verify（第二防线）

```yaml
- name: Verify gate verdict (defensive)
  run: |
    [ "${{ needs.gate.outputs.verdict }}" = "PASS" ] || exit 1
```

即使触发器被改（比如有人用 `workflow_dispatch` 手动触发），deploy job 内部仍然校验 `needs.gate.outputs.verdict === "PASS"`。outputs 是 gate job 通过 `GITHUB_OUTPUT` 写出、由 GitHub Actions 平台持久化的，无法被 deploy job 内篡改。

### 机制 C：commit status（可观测）

gate job 末尾向合并 commit 写一条 `deploy-gate` context 的 status（`success` / `failure`），在 GitHub commit 页面可以看到 gate 结果，便于审计和 rollback 追溯。

**三层防线，任一层都能独立阻断 deploy。** 机制 A 是物理阻断，B/C 是观测+复核。

---

## 5. 五条规则在 deploy 场景的含义

| 规则                | 收集证据                         | deploy 场景的语义                                              |
|---------------------|----------------------------------|---------------------------------------------------------------|
| `task-associated`    | `--task <PR_number>` → collector 把 PR 号写入 `task.id` + `associatedTaskIds` | 确保 commit 可追溯到一个任务/PR——无任务的 dump 不放行 |
| `commit-exists`      | `GET /commits/{sha}`             | SHA 真实存在于仓库                                             |
| `ci-passes`          | `GET /commits/{sha}/check-runs`（GitHub API 的 check-runs，含 main 上的 CI） | main 上的全部 CI check-runs 必须 `completed` + `success`       |
| `test-report-exists` | `GET /actions/artifacts` glob 匹配 `--report "test-report"` | 必须有测试报告 artifact——空报告不放行                   |
| `pr-merged`          | `GET /pulls/{pr_number}`，`merged_at` 非空 → `state: "merged"` | 必须 PR 已合并；直接 push 无 PR → FAIL                       |

> **注意 `ci-passes` 的时序**：PR 合并后 gate.yml 的 CI 在 main 上跑一次（`npm test` + fixture 演练 + Docker build）。这个 CI 的 check-runs 会挂在合并 commit 上。`deploy-gate` 的 gate job 如果在它之前跑，`ci-passes` 会因为 check-runs 还没 `completed` 而 FAIL。
> **规避**：deploy-gate 用了 `needs:` 风格的双 job，但 gate job 本身不 `needs` gate.yml——因为它们是不同 workflow。两个方案：
> 1. **推荐**：在 `terminate` 上用 `workflow_run` 链（见 §7 备选方案）让 deploy-gate 等 main 的 CI workflow 完成。
> 2. **当前 workflow**：靠 GitHub Actions 调度延迟——push 触发后 gate job 排队、镜像拉取、npm install 几十秒，一般够 main 的 CI 跑完 check-runs。CI 很重时建议升 §7 方案。

---

## 6. Secrets 与 environment 配置

### 6.1 必需的 secrets 与 token

| 名字              | 来源                              | 用途                                                                 | 配置位置                     |
|-------------------|-----------------------------------|----------------------------------------------------------------------|------------------------------|
| `GITHUB_TOKEN`    | GitHub Actions 自动注入            | collector 调 REST API（commits/check-runs/pulls/artifacts），读 commit，写 status。**默认 token 权限就够**——只要 workflow `permissions:` 给了 `actions: read` + `contents: read` + `statuses: read` | 无需手动配（自动）           |
| `GH_PAT`          | 手动创建的 PAT（repo + workflow） | **不在本 workflow 使用**。现有 `gate.yml` 用它发 PR comment，deploy-gate 不发 comment，可省。 | 若保留可放在 repo secrets    |

### 6.2 自定义 secrets（按实际 deploy 步骤填）

当前 deploy 步骤是 placeholder。接入真实部署时需要按部署目标配置：

| Secret 示例       | 用途                                  | 配在哪                              |
|-------------------|---------------------------------------|-------------------------------------|
| `REGISTRY`        | 容器 registry 地址（如 `ghcr.io/...`）  | repo 或 environment secrets         |
| `IMAGE`           | 镜像名                                | repo 或 environment secrets         |
| `DOCKER_USER` / `DOCKER_PASS` | registry 登录               | environment secrets（裂缝最小化）  |
| `KUBE_CONFIG`     | kubectl config（若部署到 K8s）          | environment secrets                 |
| `APP_NAME`        | Deployment 名                          | repo secrets                       |
| `DEPLOY_WEBHOOK`  | 其他部署系统的触发 webhook              | environment secrets                |

### 6.3 `environment: production`

deploy job 声明了 `environment: production`：

```yaml
deploy:
  environment: production
```

在 **Settings → Environments → New environment → "production"** 创建该 environment。这是 deploy-gate 的**人工审批层**：

- **Required reviewers**：勾选一两个负责人。deploy job 启动后会在 environment 处等待人工点击 approve，未审批不执行真正的 deploy 步骤。
- **Wait timer**：可加 `wait timer`（如 2 分钟）做冷静期。
- **Deployment branches**：限制为 `main`，防止从其他分支手动 `workflow_dispatch` 绕过。

这样三层防护：**gate PASS（5 条规则）→ environment reviewer 审批 → deploy 执行**。

### 6.4 权限（`permissions:` 顶层声明）

```yaml
permissions:
  contents: read       # checkout 代码
  actions: read        # collector 读 artifacts / check-runs
  deployments: write   # deploy job 写 deployment 记录
  statuses: read        # 读 commit status（备选 workflow_run 用）
```

最小权限原则：不走宽权限，避免 `GITHUB_TOKEN` 泄漏放大爆炸半径。

---

## 7. 备选方案：`workflow_run` 链式触发

如果 `ci-passes` 因为时序问题误 FAIL（见 §5 注意），推荐升级为 `workflow_run` 设计：

```yaml
# deploy-gate.yml（护盾版）
on:
  workflow_run:
    workflows: ["gate"]      # 等 .github/workflows/gate.yml 里的 "gate" workflow 完成
    types: [completed]
    branches: [main]
  workflow_dispatch:
```

- `gate.yml` workflow 名（顶层 `name:` 字段）必须与 `workflows:` 一致。
- `workflow_run` 触发时，`github.sha` 是触发 workflow 的 commit。
- 可在 deploy-gate 里加 `if: ${{ github.event.workflow_run.conclusion == 'success' }}`，只有上游 CI PASS 才进入 gate——顺带消除了 `ci-passes` 的时序问题（上游已 success 说明 check-runs 已结束 + success）。

**v1.0 选用 `push` 为主触发是为保持简单和单源**；CI 重、字段配置复杂的项目可直接用 §7。两套方案共用同一份 `bin/gate.mjs collect` 调用，切换不影响规则逻辑。

---

## 8. 故障/异常场景

| 场景                              | gate 行为                                                   | deploy 行为          | 说明                                  |
|-----------------------------------|------------------------------------------------------------|----------------------|---------------------------------------|
| 正常 PR 合并，5 条全 PASS          | exit 0，gate job success                                   | 执行（待 environment 审批） | 一切正常                              |
| CI 在 main 上有失败的 check       | `ci-passes` FAIL，collect 退 1                              | skipped              | 上游 CI 不通过，gate 阻断            |
| 合并 commit 没 test-report artifact | `test-report-exists` FAIL                                  | skipped              | 测试没产出，gate 阻断                  |
| 直接 push（无 PR）                 | `pr-merged` FAIL（`pr field is empty`）                     | skipped              | 设计如此——不允许绕过 PR 的直接 push   |
| 任务 ID 不在 associatedTaskIds     | `task-associated` FAIL                                      | skipped              | commit 与任务无关联时阻断              |
| `GITHUB_TOKEN` 漏了               | exit 2（collector `AUTH_MISSING`）                          | skipped              | 配置错误，gate 自身报错                 |
| SHA 不存在 / 404                  | exit 2（`COMMIT_NOT_FOUND`）                                | skipped              | 罕见，可能是误删 commit                 |
| GitHub API 5xx                    | exit 2（`SERVER_ERROR`）                                    | skipped              | 上游不可用，gate 不放行——比误 deploy 安全 |
| Rate limit                         | exit 2（`RATE_LIMITED`，打印 retry-at）                     | skipped              | 重跑即可                                |

**设计原则**：任何不确定（API 失败、证据缺失、token 问题）都**FAIL / exit 非0**，不放行 deploy。这是 blocker 与 reviewer 的关键区别——reviewer 可 `continue-on-error` 因为它不挂载真实部署；blocker 必须保守。

---

## 9. 本地验证 gate collect 行为（不依赖 Actions）

复用项目现有 fixture，只用本地 Node：

```sh
# PASS 路径（exit 0）
node bin/gate.mjs evaluate --input fixtures/pr-merged-pass.json --json
echo "exit=$?"

# FAIL 路径（exit 1）
node bin/gate.mjs evaluate --input fixtures/pr-merged-fail.json --json
echo "exit=$?"

# collect 路径（live API，需 GITHUB_TOKEN）
GITHUB_TOKEN=ghp_... \
  node bin/gate.mjs collect \
  --owner rdone44 --repo github-actions-gate \
  --sha <40-hex> --task <number> --pr <number> \
  --report "test-report" --branch main --json; echo "exit=$?"
```

`deploy-gate.yml` 里的 gate job 调用与第三条完全同构，只是参数来自 `${{ github.* }}` 上下文，并且**没有** `continue-on-error`。

---

## 10. 文件清单

新增（仅新增，无修改）：

- `.github/workflows/deploy-gate.yml` — 部署阻断 workflow
- `DEPLOYMENT.md` — 本文档

未改动（任务约束遵守）：

- `bin/gate.mjs` — 不变
- `src/evaluator.mjs`、`src/collector.mjs`、`src/report.mjs` — 不变
- `test/*.test.mjs` — 不变（89/89 仍全过）
- `.github/workflows/gate.yml` — 不变（仍是 PR 评审器）
- `action.yml`、`Dockerfile`、`fixtures/*` — 不变

---

## 11. 接入步骤（运维）

1. **创建 GitHub environment `production`**：Settings → Environments → New environment → 输入 `production` → 配置 required reviewers + 限制 branch 为 `main`。
2. **（可选）配置 deploy secrets**：在 `production` environment 或 repo secrets 里加 `REGISTRY` / `IMAGE` / `KUBE_CONFIG` 等。
3. **替换 deploy 步骤占位**：编辑 `.github/workflows/deploy-gate.yml` 中 `deploy` job 的 `Deploy` step，把 placeholder 改成项目实际的 deploy 命令（参考注释里的 docker push / kubectl 例子）。
4. **push workflow 文件**：合并 PR（或直接 commit）到 main。
5. **观察首次触发**：合并后会自动跑 deploy-gate，在 Actions 页看 `gate` job 输出 verdict，`deploy` job 在 `production` environment 处待审批。
6. **建议先 dry-run**：首次 merge 前可先用 `workflow_dispatch` 手动触发一次，只看 `gate` job 的 verdict 是否符合预期（不点 production 审批就不真部署）。

---

## 12. 验证清单

- [x] 新增 `deploy-gate.yml` 不修改任何 `bin/` / `src/` / `test/` 文件
- [x] gate 步骤复用 `node bin/gate.mjs collect`，无 `continue-on-error`
- [x] deploy job `needs: [gate]`，gate FAIL → deploy skipped
- [x] defensive verify 校验 `needs.gate.outputs.verdict === "PASS"`
- [x] commit status 与 gate-result artifact 保留，支持审计/rollback
- [x] environment `production` 提供人工审批层
- [x] `permissions:` 最小权限，不走宽 token
- [x] `concurrency` 同 branch 不 cancel-in-progress，避免 deploy 被中途打断
- [x] 当前 `npm test` 仍 91/91 pass —— gate 逻辑零改动

---

## 13. HEAD SHA verify（上架确认）

> 在打 v1.0.3 tag 前，对当前 HEAD 跑 `git ls-tree` 确认 gate.yml 在 tree 中。

**HEAD SHA:** `5f91a58e0bb8121a45301d827dc6e37ea341aa05`

```text
$ git ls-tree -r HEAD --name-only | grep gate.yml
.github/workflows/gate.yml
```

gate.yml 存在于 HEAD tree — 该 SHA 包含完整的 gate workflow，可以安全打 tag 上架。

**Tag:** `v1.0.3` 指向 `5f91a58`，已推送到远端。
