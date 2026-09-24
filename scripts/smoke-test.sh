#!/bin/sh
# End-to-end smoke test against a running stack: register -> create link ->
# redirect -> the click appears in analytics.
set -e
B=${1:-http://localhost:8080}
j() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }
echo "readiness: $(curl -s $B/health/readiness)"
EMAIL="smoke-$(date +%s)-$$@example.com"
TOKEN=$(curl -sf -X POST $B/api/auth/register -H 'Content-Type: application/json' -d "{\"name\":\"Smoke\",\"email\":\"$EMAIL\",\"password\":\"Smoke12345\"}" | j "d['token']")
echo "registered, token ${TOKEN%${TOKEN#????????????}}..."
LINK=$(curl -sf -X POST $B/api/links -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"originalUrl":"https://example.com/compose-smoke"}')
CODE=$(echo "$LINK" | j "d['link']['shortCode']"); ID=$(echo "$LINK" | j "d['link']['_id']")
echo "link $CODE ($ID)"
for i in 1 2 3; do curl -s -o /dev/null -w "redirect %{http_code} -> %{redirect_url}\n" $B/api/r/$CODE; done
echo "SPA route /$CODE -> $(curl -s -o /dev/null -w '%{http_code}' $B/$CODE)"
for i in $(seq 1 20); do
  N=$(curl -sf "$B/api/analytics/link/$ID" -H "Authorization: Bearer $TOKEN" | j "d['analytics']['totalClicks']")
  [ "$N" = "3" ] && break; sleep 1
done
echo "analytics totalClicks: $N (expected 3)"
[ "$N" = "3" ]
