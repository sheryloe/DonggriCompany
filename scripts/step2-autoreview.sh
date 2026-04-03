#!/usr/bin/env bash

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_DIR="$ROOT_DIR/reports"
LOG_DIR="$REPORT_DIR/.logs"
REPORT_PATH="$REPORT_DIR/step2-review.md"

mkdir -p "$REPORT_DIR" "$LOG_DIR"

TYPECHECK_LOG="$LOG_DIR/typecheck.log"
LINT_LOG="$LOG_DIR/lint.log"
TEST_LOG="$LOG_DIR/test.log"

timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

typecheck_status=0
lint_status=0
test_status=0

if corepack pnpm -C "$ROOT_DIR" -r --if-present run typecheck >"$TYPECHECK_LOG" 2>&1; then
  typecheck_status=0
else
  typecheck_status=$?
fi

if corepack pnpm -C "$ROOT_DIR" -r --if-present run lint >"$LINT_LOG" 2>&1; then
  lint_status=0
else
  lint_status=$?
fi

if TMPDIR=/tmp corepack pnpm -C "$ROOT_DIR" -r --if-present run test >"$TEST_LOG" 2>&1; then
  test_status=0
else
  test_status=$?
fi

overall_status=0
if [[ "$typecheck_status" -ne 0 || "$lint_status" -ne 0 || "$test_status" -ne 0 ]]; then
  overall_status=1
fi

p1_findings=()
p2_findings=()
p3_findings=()

if grep -Eq "error TS[0-9]+" "$TYPECHECK_LOG"; then
  p1_findings+=("Typecheck contains TypeScript errors.")
fi

if grep -Eq "error TS[0-9]+" "$LINT_LOG"; then
  p1_findings+=("Lint contains TypeScript errors.")
fi

if grep -q "Could not locate the bindings file" "$TEST_LOG"; then
  p1_findings+=("Environment blocker: better-sqlite3 native binding is missing, DB-backed tests cannot run.")
fi

if grep -Eq "not ok [0-9]+" "$TEST_LOG"; then
  failing_tests="$(grep -E "not ok [0-9]+" "$TEST_LOG" | wc -l | tr -d '[:space:]')"
  p2_findings+=("Test suite reports ${failing_tests} failing TAP tests.")
fi

if [[ "${#p1_findings[@]}" -eq 0 && "${#p2_findings[@]}" -eq 0 ]]; then
  p3_findings+=("No critical findings detected by automated checks.")
fi

{
  echo "# Step-2 Auto Review Report"
  echo
  echo "- Generated at (UTC): ${timestamp}"
  echo "- Repo root: ${ROOT_DIR}"
  echo
  echo "## Command Results"
  echo "- \`pnpm -r --if-present run typecheck\`: ${typecheck_status}"
  echo "- \`pnpm -r --if-present run lint\`: ${lint_status}"
  echo "- \`pnpm -r --if-present run test\` (TMPDIR=/tmp): ${test_status}"
  echo
  echo "## Findings (Severity Order)"
  echo
  echo "### P1"
  if [[ "${#p1_findings[@]}" -eq 0 ]]; then
    echo "- none"
  else
    for finding in "${p1_findings[@]}"; do
      echo "- ${finding}"
    done
  fi
  echo
  echo "### P2"
  if [[ "${#p2_findings[@]}" -eq 0 ]]; then
    echo "- none"
  else
    for finding in "${p2_findings[@]}"; do
      echo "- ${finding}"
    done
    echo
    echo "Failed TAP entries:"
    grep -E "not ok [0-9]+" "$TEST_LOG" | sed -n '1,15p' | sed 's/^/- /'
  fi
  echo
  echo "### P3"
  if [[ "${#p3_findings[@]}" -eq 0 ]]; then
    echo "- none"
  else
    for finding in "${p3_findings[@]}"; do
      echo "- ${finding}"
    done
  fi
  echo
  echo "## Logs"
  echo "- [typecheck](${TYPECHECK_LOG})"
  echo "- [lint](${LINT_LOG})"
  echo "- [test](${TEST_LOG})"
} >"$REPORT_PATH"

echo "[step2:review] report written to ${REPORT_PATH}"
exit "$overall_status"
