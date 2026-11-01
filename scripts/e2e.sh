#!/usr/bin/env bash
# End-to-end check of the Convex -> n8n -> Convex loop against a running deployment.
# Uses the Convex CLI with test identities (no Clerk sign-in), so it runs the same public
# mutations and access checks the app uses. Reads the deployment from .env.local.
#
#   bash scripts/e2e.sh
#
# Expects the n8n "request notification" workflow to be published and pointed at this deployment.
set -euo pipefail
cd "$(dirname "$0")/.."
CONVEX=./node_modules/.bin/convex
RUN_ID=$(date +%s)

as() { # as <name> <function> <json-args>
  local name=$1; shift
  local identity="{\"subject\":\"e2e_${name,,}\",\"issuer\":\"e2e\",\"name\":\"${name} E2E\",\"givenName\":\"${name}\",\"email\":\"${name,,}.e2e@example.com\"}"
  "$CONVEX" run --identity "$identity" "$@"
}
query() { "$CONVEX" run --inline-query "$1"; }

# Waits until the loan has the expected number of notification records written back by n8n.
wait_for_activity() { # wait_for_activity <loanId> <count>
  for _ in $(seq 1 30); do
    local count
    count=$(query "(await ctx.db.query('activity').withIndex('by_loan', q => q.eq('loanId', '$1')).collect()).length")
    [ "$count" -ge "$2" ] && return 0
    sleep 2
  done
  echo "Timed out waiting for activity on $1"; return 1
}

echo "1. Two test users sign in and one lists a tool"
as Alice users:store '{}' >/dev/null
as Bob users:store '{}' >/dev/null
TOOL=$(as Alice tools:create "{\"name\":\"E2E ladder $RUN_ID\",\"category\":\"other\",\"condition\":\"good\",\"description\":\"End-to-end test listing.\"}" | tr -d '"')
TODAY=$(date -u +%F)
TOMORROW=$(date -u -d tomorrow +%F 2>/dev/null || date -u -v+1d +%F)

echo "2. Bob requests it: Convex writes an outbox event and calls the n8n webhook"
LOAN=$(as Bob loans:request "{\"toolId\":\"$TOOL\",\"startDate\":\"$TODAY\",\"endDate\":\"$TOMORROW\"}" | tr -d '"')
wait_for_activity "$LOAN" 1
echo "   n8n verified the event, fetched the context and wrote back a notification"

echo "3. Alice approves: a second event, a second notification"
as Alice loans:approve "{\"loanId\":\"$LOAN\"}" >/dev/null
wait_for_activity "$LOAN" 2

echo "4. Result"
query "(await ctx.db.query('activity').withIndex('by_loan', q => q.eq('loanId', '$LOAN')).collect()).map(a => a.kind + ': ' + a.summary)"
query "(await ctx.db.query('outbox').filter(q => q.eq(q.field('loanId'), '$LOAN')).collect()).map(e => e.status + ' ' + e.state + ' after ' + e.attempts + ' attempt(s)')"
