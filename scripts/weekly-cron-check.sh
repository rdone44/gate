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

# 6. pr-merged-closed-not-merged fixture (expect exit 1, PR closed not merged)
node bin/gate.mjs evaluate --input fixtures/pr-merged-closed-not-merged.json >/tmp/gate-prclosed.log 2>&1
PC=$?
if [ "$PC" != "1" ]; then
  REPORT+="❌ pr-merged-closed-not-merged.json 退出码=$PC (应为1)\n$(cat /tmp/gate-prclosed.log)\n"
fi

# 7. pr-merged-empty fixture (expect exit 1, pr field empty)
node bin/gate.mjs evaluate --input fixtures/pr-merged-empty.json >/tmp/gate-prempty.log 2>&1
PEM=$?
if [ "$PEM" != "1" ]; then
  REPORT+="❌ pr-merged-empty.json 退出码=$PEM (应为1)\n$(cat /tmp/gate-prempty.log)\n"
fi

# 8. title-whitespace-only-fail fixture (expect exit 2, schema violation)
node bin/gate.mjs evaluate --input fixtures/title-whitespace-only-fail.json >/tmp/gate-titlews.log 2>&1
TW=$?
if [ "$TW" != "2" ]; then
  REPORT+="❌ title-whitespace-only-fail.json 退出码=$TW (应为2)\n$(cat /tmp/gate-titlews.log)\n"
fi

# 9. schema-violation-empty-task-id fixture (expect exit 2, schema violation)
node bin/gate.mjs evaluate --input fixtures/schema-violation-empty-task-id.json >/tmp/gate-schema.log 2>&1
SV=$?
if [ "$SV" != "2" ]; then
  REPORT+="❌ schema-violation-empty-task-id.json 退出码=$SV (应为2)\n$(cat /tmp/gate-schema.log)\n"
fi

if [ -n "$REPORT" ]; then
  echo "🔴 github-actions-gate 周巡检告警 ($(date '+%Y-%m-%d %H:%M'))"
  echo ""
  echo -e "$REPORT"
  exit 1
fi

# 成功：静默，不输出任何内容
