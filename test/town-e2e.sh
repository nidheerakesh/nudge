#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
W=node_modules/.bin/wrangler
P=$(mktemp -d)
PORT=8814
$W d1 execute nudge-v3 --local --persist-to $P -c wrangler.v3.toml --file migrations/v3/0001_init.sql >/dev/null
$W d1 execute nudge-v3 --local --persist-to $P -c wrangler.v3.toml --file migrations/v3/0002_town.sql >/dev/null
$W dev -c wrangler.v3.toml --local --persist-to $P --port $PORT >$P/dev.log 2>&1 &
trap 'kill %1 2>/dev/null || true; fuser -k $PORT/tcp >/dev/null 2>&1 || true' EXIT
for i in $(seq 60); do curl -s localhost:$PORT/api/me >/dev/null 2>&1 && break; sleep 1; done
BASE=http://localhost:$PORT node --no-warnings test/town-e2e.mjs
