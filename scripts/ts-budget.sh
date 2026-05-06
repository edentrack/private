#!/usr/bin/env bash
# ts-budget.sh — local mirror of the CI typecheck gates.
#
# Prints the current TS error count, critical-path count, and whether
# we're within the budget set in .github/workflows/ci.yml. Run this
# before pushing to catch a violation early.
#
# Usage: bash scripts/ts-budget.sh

set -u

# Read the budget from the CI workflow so this script and CI never drift.
BUDGET=$(grep -E "^\s*TS_BUDGET:" .github/workflows/ci.yml | head -1 | sed -E "s/.*'([0-9]+)'.*/\1/")
BUDGET=${BUDGET:-200}

LOG=$(mktemp)
npx tsc --noEmit -p tsconfig.app.json > "$LOG" 2>&1
COUNT=$(grep -cE "^src/.*: error TS" "$LOG" || true)

CRITICAL_RE='^src/(utils/(pdfGenerator|reportGenerator|creditworthinessPDF)\.ts|components/(expenses|sales|payroll)/)'
CRIT=$(grep -E "$CRITICAL_RE" "$LOG" | grep -c "error TS" || true)

echo "================================================================"
echo "  TypeScript error budget"
echo "================================================================"
echo "  Total errors:     $COUNT  (budget: $BUDGET)"
echo "  Critical-path:    $CRIT   (budget: 0)"
echo

STATUS=0
if [ "$COUNT" -gt "$BUDGET" ]; then
  echo "  ❌ Total exceeds budget by $((COUNT - BUDGET))."
  STATUS=1
else
  echo "  ✓ Total within budget (headroom $((BUDGET - COUNT)))."
fi

if [ "$CRIT" -gt 0 ]; then
  echo "  ❌ Critical-path has $CRIT error(s) — must be zero."
  echo
  echo "  Critical-path failures:"
  grep -E "$CRITICAL_RE" "$LOG" | grep "error TS" | head -10 | sed 's/^/    /'
  STATUS=1
else
  echo "  ✓ Critical-path is clean."
fi

rm -f "$LOG"
exit "$STATUS"
