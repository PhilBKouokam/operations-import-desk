#!/usr/bin/env bash
set -euo pipefail
: "${MONGOD_BIN:?Set the real MongoDB executable}"
: "${KEYCLOAK_HOME:?Set the Keycloak distribution directory}"
: "${REDIS_SERVER_BIN:?Set the real Redis executable}"
run_dir=$(mktemp -d /tmp/odi-m4.XXXXXX)
pids=()
cleanup(){
  for pid in "${pids[@]}"; do kill -CONT "$pid" 2>/dev/null || true; kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
  echo "Browser-service diagnostic logs: $run_dir"
}
trap cleanup EXIT
mkdir -p "$run_dir/mongo" "$KEYCLOAK_HOME/data/import"
cp infra/keycloak/realm.json "$KEYCLOAK_HOME/data/import/operations-import-desk-realm.json"
"$MONGOD_BIN" --dbpath "$run_dir/mongo" --bind_ip 127.0.0.1 --port 27018 --nounixsocket > "$run_dir/mongo.log" 2>&1 & pids+=("$!")
"$REDIS_SERVER_BIN" --bind 127.0.0.1 --port 6380 --save '' --appendonly no > "$run_dir/redis.log" 2>&1 & pids+=("$!")
"$KEYCLOAK_HOME/bin/kc.sh" start-dev --http-host=127.0.0.1 --http-port=8081 --db-url="jdbc:h2:file:$run_dir/keycloak;NON_KEYWORDS=VALUE" --import-realm > "$run_dir/keycloak.log" 2>&1 & pids+=("$!")
export MONGO_URI=mongodb://127.0.0.1:27018 MONGO_DATABASE=odi_m4_browser
export OIDC_ISSUER=http://127.0.0.1:8081/realms/operations-import-desk OIDC_AUDIENCE=odi-api OIDC_ROLE_CLIENT=odi-api UI_ORIGIN=http://127.0.0.1:5173 PORT=3000 REDIS_URL=redis://127.0.0.1:6380
export VITE_OIDC_URL=http://127.0.0.1:8081 VITE_API_ORIGIN=http://127.0.0.1:3000
for ((i=0;i<60;i++)); do
  if curl -fsS --max-time 1 "$OIDC_ISSUER/.well-known/openid-configuration" -o /dev/null 2>/dev/null; then break; fi
  if [[ "$i" == 59 ]]; then echo 'Keycloak readiness failed'; exit 1; fi
  sleep 1
done
npm run build
npm run build:web
node dist/apps/api/src/main.js > "$run_dir/api.log" 2>&1 & pids+=("$!")
node dist/apps/worker/src/main.js > "$run_dir/worker.log" 2>&1 & export M4_WORKER_PID=$!; pids+=("$M4_WORKER_PID")
npm run preview -w @operations-import-desk/web > "$run_dir/web.log" 2>&1 & pids+=("$!")
for ((i=0;i<30;i++)); do
  if curl -fsS --max-time 1 http://127.0.0.1:3000/health/ready -o /dev/null 2>/dev/null && curl -fsS --max-time 1 http://127.0.0.1:5173 -o /dev/null 2>/dev/null; then break; fi
  if [[ "$i" == 29 ]]; then echo 'Application readiness failed'; exit 1; fi
  sleep 1
done
if [[ "${ODI_LOCAL_DEMO:-0}" == 1 ]]; then
  echo 'Local synthetic demo: http://127.0.0.1:5173'
  echo 'Accounts: operator-a, operator-b, viewer. Password: Local-demo-only-123!'
  echo 'Accounts are seeded by Keycloak. Start with empty history; submit samples/valid.csv as operator-a.'
  echo 'Data is disposable. Stop with Ctrl-C. Never expose these services publicly.'
  wait
else
  npm run test:m4 -- "$@"
fi
