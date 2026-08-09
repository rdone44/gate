#!/usr/bin/env bash
set -uo pipefail
cd /root/github-actions-gate

REPORT=""
# 1. npm test
if ! npm test >/tmp/gate-test.log 2>&1; then
  REPORT+="❌ npm test 失败\n$(tail -50 /tmp/gate-test.log)\n"
fi

# 2. pass fixture (expect exit 0)
node bin/gate.mjs evaluate --input fixtures/pass.json >/tmp/gate-pass.log 2>&1
PE=$?
if [ "$PE" != "0" ]; then
  REPORT+="❌ pass.json 退出码=$PE (应为0)\n$(cat /tmp/gate-pass.log)\n"
fi

# 3. fail fixture (expect exit 1)
node bin/gate.mjs evaluate --input fixtures/fail.json >/tmp/gate-fail.log 2>&1
FE=$?
if [ "$FE" != "1" ]; then
  REPORT+="❌ fail.json 退出码=$FE (应为1)\n$(cat /tmp/gate-fail.log)\n"
fi

# 4. pr-merged-fail fixture (expect exit 1，PR state=open，pr-merged 规则失败)
node bin/gate.mjs evaluate --input fixtures/pr-merged-fail.json >/tmp/gate-prmergedfail.log 2>&1
PF=$?
if [ "$PF" != "1" ]; then
  REPORT+="❌ pr-merged-fail.json 退出码=$PF (应为1)\n$(cat /tmp/gate-prmergedfail.log)\n"
fi

# 5. real-pr12 fixture (expect exit 0，5/5 规则全通过)
node bin/gate.mjs evaluate --input fixtures/real-pr12.json >/tmp/gate-realpr12.log 2>&1
RP=$?
if [ "$RP" != "0" ]; then
  REPORT+="❌ real-pr12.json 退出码=$RP (应为0)\n$(cat /tmp/gate-realpr12.log)\n"
fi

if [ -n "$REPORT" ]; then
  echo "🔴 github-actions-gate 周巡检告警 ($(date '+%Y-%m-%d %H:%M'))"
  echo ""
  echo -e "$REPORT"
  exit 1
fi

# 成功：静默，不输出任何内容
