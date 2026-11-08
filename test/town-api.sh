#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
W=/home/nidhi/Projects/nudge/node_modules/.bin/wrangler
U=http://localhost:8812
rm -rf .wrangler/state
$W d1 execute nudge-v3 --local -c wrangler.v3.toml --file migrations/v3/0001_init.sql >/dev/null
$W d1 execute nudge-v3 --local -c wrangler.v3.toml --file migrations/v3/0002_town.sql >/dev/null
$W dev -c wrangler.v3.toml --local --port 8812 >/tmp/nudge-town-dev.log 2>&1 &
PID=$!
JA=$(mktemp); JB=$(mktemp)
trap 'kill $PID 2>/dev/null || true; fuser -k 8812/tcp >/dev/null 2>&1 || true; rm -f $JA $JB' EXIT
for i in $(seq 60); do
  curl -s $U/api/me >/dev/null 2>&1 && break
  sleep 1
done
FAILS=0
chk() { # name, json, jq expr
  if echo "$2" | jq -e "$3" >/dev/null 2>&1; then echo "PASS $1"; else echo "FAIL $1: $2"; FAILS=1; fi
}
req() { # jar method path [body]
  local jar=$1 m=$2 p=$3 b=${4-}
  if [ -n "$b" ]; then
    curl -s -c $jar -b $jar -X $m -H "Origin: $U" -H 'content-type: application/json' -d "$b" "$U$p"
  else
    curl -s -c $jar -b $jar -X $m -H "Origin: $U" -H 'content-type: application/json' "$U$p"
  fi
}
code() { curl -s -o /dev/null -w '%{http_code}' -c $1 -b $1 -X $2 -H "Origin: $U" -H 'content-type: application/json' ${4:+-d "$4"} "$U$3"; }
want() { [ "$2" = "$3" ] && echo "PASS $1" || { echo "FAIL $1: got $2 want $3"; FAILS=1; }; }

req $JA POST /api/auth/signup '{"email":"a@x.io","password":"password1","name":"A"}' >/dev/null
req $JB POST /api/auth/signup '{"email":"b@x.io","password":"password2","name":"B"}' >/dev/null

r=$(req $JA POST /api/town/join)
chk "A join" "$r" '.joined==true or .plot!=null'
r=$(req $JA POST /api/town/join)
chk "A join twice" "$r" '.plot!=null'
r=$(req $JB POST /api/town/join)
chk "B join" "$r" '.plot!=null'
r=$(req $JA GET /api/town/me)
chk "A me" "$r" '.joined==true and .balance==0'

want "A buy no coins" "$(code $JA POST /api/town/buy '{"item":"outfit:hoodie"}')" 400
want "A equip unowned" "$(code $JA PUT /api/town/avatar '{"outfit":"outfit:hoodie"}')" 403
want "A items out of bounds" "$(code $JA PUT /api/town/house/items '{"items":[{"item_id":"furn:desk","x":99,"y":0}]}')" 400
want "A items dup" "$(code $JA PUT /api/town/house/items '{"items":[{"item_id":"furn:desk","x":1,"y":1},{"item_id":"furn:bed","x":1,"y":1}]}')" 400
want "A items ok" "$(code $JA PUT /api/town/house/items '{"items":[{"item_id":"furn:desk","x":1,"y":1}]}')" 200

# earn coins: an open session with 100 verified minutes, then end it
r=$(req $JA POST /api/sessions '{"start_at":"2026-01-05T10:00:00Z"}'); SID=$(echo "$r" | jq .rows[0].id)
$W d1 execute nudge-v3 --local -c wrangler.v3.toml --command "INSERT INTO session_active(session_id,user_id,started,last_ping,verified_secs,last_ok) VALUES($SID,1,0,0,6000,0)" >/dev/null
r=$(req $JA PATCH /api/sessions/$SID '{"end_kind":"done"}')
chk "session patch ok" "$r" '.row.end_kind=="done"'
r=$(req $JA GET /api/town/me)
chk "A earned coins" "$r" '.balance==100'
r=$(req $JA POST /api/town/buy '{"item":"outfit:hoodie"}')
chk "A buy ok" "$r" ".balance==0"
r=$(req $JA GET /api/town/me)
chk "A owns hoodie" "$r" '.wardrobe|index("outfit:hoodie")!=null'
want "A equip owned" "$(code $JA PUT /api/town/avatar '{"outfit":"outfit:hoodie"}')" 200

r=$(req $JB GET /api/town/me)
chk "B wardrobe empty" "$r" '(.wardrobe|length==0) and .balance==0'
want "B equip A item" "$(code $JB PUT /api/town/avatar '{"outfit":"outfit:hoodie"}')" 403
want "B ws no upgrade" "$(code $JB GET /api/town/ws?district=0)" 426

r=$(req $JB GET '/api/town/plots?district=0')
chk "plots no email" "$r" 'tostring|contains("@")|not'

if [ $FAILS = 0 ]; then echo "ALL PASS"; else echo "SOME FAILED"; exit 1; fi
