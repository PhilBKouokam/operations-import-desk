#!/usr/bin/env bash
set -euo pipefail
: "${MONGOD_BIN:?Set MONGOD_BIN to a real MongoDB 8.0.15 executable}"
: "${KEYCLOAK_HOME:?Set KEYCLOAK_HOME to a Keycloak 26.4.0 distribution}"
run_dir=$(mktemp -d /tmp/odi-m2-integration.XXXXXX)
mongo_pid=''
keycloak_pid=''
cleanup() {
  if [[ -n "$keycloak_pid" ]]; then kill "$keycloak_pid" 2>/dev/null || true; fi
  if [[ -n "$mongo_pid" ]]; then kill "$mongo_pid" 2>/dev/null || true; fi
  wait 2>/dev/null || true
  echo "Real-service diagnostic logs: $run_dir"
}
trap cleanup EXIT
mkdir -p "$run_dir/mongo" "$KEYCLOAK_HOME/data/import"
cp infra/keycloak/realm.json "$KEYCLOAK_HOME/data/import/operations-import-desk-realm.json"
"$MONGOD_BIN" --dbpath "$run_dir/mongo" --bind_ip 127.0.0.1 --port 27018 --nounixsocket > "$run_dir/mongo.log" 2>&1 &
mongo_pid=$!
"$KEYCLOAK_HOME/bin/kc.sh" start-dev --http-host=127.0.0.1 --http-port=8081 --db-url="jdbc:h2:file:$run_dir/keycloak;NON_KEYWORDS=VALUE" --import-realm > "$run_dir/keycloak.log" 2>&1 &
keycloak_pid=$!
ready=0
for ((i=0;i<60;i++)); do
  if curl -fsS --max-time 1 http://127.0.0.1:8081/realms/operations-import-desk/.well-known/openid-configuration -o /dev/null 2>/dev/null; then ready=1; break; fi
  if ! kill -0 "$keycloak_pid" 2>/dev/null || ! kill -0 "$mongo_pid" 2>/dev/null; then echo 'Real service startup failed; inspect logs.'; exit 1; fi
  sleep 1
done
if [[ "$ready" != 1 ]]; then echo 'Keycloak readiness timeout'; exit 1; fi
M2_MONGO_URI=mongodb://127.0.0.1:27018 M2_OIDC_ISSUER=http://127.0.0.1:8081/realms/operations-import-desk npm run "${REAL_SERVICE_SUITE:-test:integration}"
