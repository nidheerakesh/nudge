#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
W=/home/nidhi/Projects/nudge/node_modules/.bin/wrangler
U=http://localhost:8811
rm -rf .wrangler/state
$W d1 execute nudge-v3 --local -c wrangler.v3.toml --file migrations/v3/0001_init.sql >/dev/null
$W dev -c wrangler.v3.toml --local --port 8811 >/tmp/nudge-v3-dev.log 2>&1 &
PID=$!
JA=$(mktemp); JB=$(mktemp)
trap 'kill $PID 2>/dev/null || true; pkill -P $PID 2>/dev/null || true; rm -f $JA $JB' EXIT
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

r=$(req $JA POST /api/auth/signup '{"email":"a@x.io","password":"password1","name":"A"}')
chk "signup A" "$r" '.user.email=="a@x.io"'
r=$(req $JA POST /api/auth/signup '{"email":"a@x.io","password":"password1"}')
chk "signup A again 409" "$r" '.error=="exists"'
c=$(code $JA POST /api/auth/signup '{"email":"a@x.io","password":"password1"}')
[ "$c" = 409 ] && echo "PASS 409 status" || { echo "FAIL 409 status $c"; FAILS=1; }
r=$(req $JA GET /api/me)
chk "me" "$r" '.user.email=="a@x.io"'
c=$(curl -s -o /dev/null -w '%{http_code}' -b $JA -X POST -H 'content-type: application/json' -d '{"title":"x"}' $U/api/tasks)
[ "$c" = 403 ] && echo "PASS no origin 403" || { echo "FAIL no origin $c"; FAILS=1; }

r=$(req $JA POST /api/courses '{"name":"Math"}'); CID=$(echo "$r" | jq .rows[0].id)
chk "post course" "$r" '.rows[0].name=="Math"'
r=$(req $JA POST /api/topics "[{\"course_id\":$CID,\"title\":\"T1\"},{\"course_id\":$CID,\"title\":\"T2\"}]")
chk "post topics" "$r" '.rows|length==2'
r=$(req $JA POST /api/tasks "{\"title\":\"Do it\",\"course_id\":$CID}"); TID=$(echo "$r" | jq .rows[0].id)
chk "post task" "$r" '.rows[0].title=="Do it"'
r=$(req $JA GET /api/all)
chk "A all" "$r" '(.courses|length==1) and (.topics|length==2) and (.tasks|length==1)'

r=$(req $JB POST /api/auth/signup '{"email":"b@x.io","password":"password2"}')
chk "signup B" "$r" '.user.email=="b@x.io"'
r=$(req $JB GET /api/all)
chk "B sees none" "$r" '(.courses|length==0) and (.topics|length==0) and (.tasks|length==0)'
c=$(code $JB PATCH /api/tasks/$TID '{"title":"hack"}')
[ "$c" = 404 ] && echo "PASS B patch 404" || { echo "FAIL B patch $c"; FAILS=1; }
c=$(code $JB DELETE /api/tasks/$TID)
[ "$c" = 404 ] && echo "PASS B delete 404" || { echo "FAIL B delete $c"; FAILS=1; }
c=$(code $JB POST /api/tasks "{\"title\":\"x\",\"course_id\":$CID}")
[ "$c" = 400 ] && echo "PASS B ref 400" || { echo "FAIL B ref $c"; FAILS=1; }
r=$(req $JB POST /api/tasks "{\"title\":\"x\",\"course_id\":$CID}")
chk "B ref error" "$r" '.error=="ref"'

r=$(req $JA DELETE /api/courses/$CID)
chk "delete course" "$r" '.ok==1'
r=$(req $JA GET /api/all)
chk "cascade topics" "$r" '(.courses|length==0) and (.topics|length==0) and (.tasks[0].course_id==null)'

r=$(req $JA POST /api/auth/logout)
chk "logout" "$r" '.ok==1'
c=$(code $JA GET /api/me)
[ "$c" = 401 ] && echo "PASS me 401" || { echo "FAIL me after logout $c"; FAILS=1; }
c=$(code $JA POST /api/auth/login '{"email":"a@x.io","password":"wrongpass1"}')
[ "$c" = 401 ] && echo "PASS login wrong 401" || { echo "FAIL login wrong $c"; FAILS=1; }
r=$(req $JA POST /api/auth/login '{"email":"a@x.io","password":"password1"}')
chk "login right" "$r" '.user.email=="a@x.io"'

r=$(req $JA PUT /api/prefs '{"day_start":"07:30","focus_mins":50}')
chk "put prefs" "$r" '.ok==1'
r=$(req $JA GET /api/all)
chk "prefs readback" "$r" '.prefs.day_start=="07:30" and .prefs.focus_mins=="50"'
r=$(req $JA PUT /api/timer '{"data":{"title":"x","mins":25}}')
chk "put timer" "$r" '.ok==1'
r=$(req $JA GET /api/timer)
chk "get timer" "$r" '.data.mins==25'
h=$(curl -s -D - -o /dev/null -b $JA $U/api/export | tr -d '\r')
echo "$h" | grep -qi '^content-disposition: attachment' && echo "PASS export header" || { echo "FAIL export header"; FAILS=1; }

[ $FAILS = 0 ] || exit 1
echo "ALL PASS"
