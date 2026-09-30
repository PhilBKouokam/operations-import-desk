# Operational troubleshooting

Use synthetic data in the local demo. In a real environment, start with read-only observation and the team's incident procedure. Never clear Redis, edit lease timestamps, reset attempts or modify result documents to make an import look healthy. Fault injection exists only inside disposable integration harnesses.

## Identify the same work

Copy importId from the Details URL or accepted response `import.id`. Capture the request's timestamp, method/path, HTTP status and `X-Request-Id` (also safe error `error.requestId`) from browser Network. Do not copy Authorization headers, tokens or CSV contents into an issue.

Worker stdout is allowlisted JSON: `event`, time, importId, run, attempt and optional safe code/duration. Search the worker log for the exact ID, for example `rg --fixed-strings 'YOUR-IMPORT-UUID' /path/to/worker.log`. Current API does not persist requestId-to-importId mappings or emit request access logs; requestId alone cannot retrieve an import. Record both IDs when available. API requests before acceptance have no importId. This observability limitation remains a senior-review item.

Native launcher prints its diagnostic directory (api.log, worker.log, mongo.log, redis.log, keycloak.log). API `/health/live` proves process response; `/health/ready` tests Mongo only. Worker loopback `http://127.0.0.1:3001/health/ready` tests Mongo/Redis connectivity, not progress of a specific import. A failed status fetch is not evidence of a queue outage.

| Symptom | Check | Recovery and verification |
|---|---|---|
| PENDING | Read Details state/run/attempt/nextAttemptAt; inspect worker process and `dispatch_deferred`/`scan_dependency_unavailable`. Confirm worker and dependencies are running. | Restore unavailable process/service. Reservation may defer redispatch up to 30 seconds, plus scan cadence and workload. Follow the same importId; do not upload changed bytes or force due timestamps. Attempt stays zero until claim. |
| PROCESSING / suspected expired lease | Last confirmed state is not proof of active computation. Compare worker logs and process availability; public DTO deliberately hides lease internals. | Restart failed worker after dependency checks. Actual 60-second lease expiry plus recovery scan/backoff permits a new claim within remaining budget. Verify a new attempt/event on the same ID and one complete result. Do not manually release a lease. |
| Redis unavailable | Worker readiness, `dispatch_deferred`, `transport_worker_unavailable`; API may still accept with Mongo healthy. | Restore Redis using normal service management. Keep Mongo data unchanged. Existing PENDING work redispatches; PROCESSING work either publishes or recovers after expiry. Queue contents are not authoritative. |
| Mongo unavailable | API 503/failed readiness, worker `scan_dependency_unavailable` or `failure_record_unavailable`. | Restore Mongo and indexes with normal operations; restart startup-failed API if necessary. A lost upload response is recovered by identical bytes. After uncertain publication, refetch: either all terminal results exist or lease recovery continues. Do not “repair” half a result; publication is atomic. |
| Worker unavailable | API may work, imports stay PENDING, no new claim events. | Restart the worker with original config. Stable notification IDs prevent repeated fresh jobs for one pending run. Confirm same ID reaches terminal without another upload. |
| Retry exhausted | FAILED, safe failure code, run/attempt, server canRetry. | Fix dependency first. Authorized owner/operator uses Retry only for eligible run 1. Run 2 is the final run; no manual DB reset or third run. Business-invalid rows require a corrected new file, not infrastructure retry. |
| OIDC/login/config failure | Exact browser origin/callback, issuer discovery, API audience `odi-api`, role-client mapping, clock, provider availability. | Use 127.0.0.1 consistently. Native launcher issuer is port 8081; standalone `.env.example` uses 8080. Vite config requires rebuild. Restore provider/config; do not disable issuer/audience/type validation or enable password grants. 403 may mean no mapped role; foreign ID 404 is intentional. |

## Repeat recovery drills safely

From a clean checkout with dedicated native binaries installed:

```sh
source /tmp/odi-runtime/env.sh
M3_TEST_PATTERN='A08 Redis unavailable|A09 actual SIGKILL' \
REAL_SERVICE_SUITE=test:m3 bash scripts/test-real-services.sh
```

The harness creates its own storage/ports, stops only child services it created and records A08/A09 import IDs on successful verification. It deliberately interrupts Redis and SIGKILLs a worker; A09 waits the real production lease duration. Compare the printed ID, attempt and final state, not just a process restarting. Recorded M5 IDs/results are in the evidence directory. These drills do not mutate a running demo's database. Other tests that directly adjust fixture timestamps remain explicitly test-only.

For broader verification use `REAL_SERVICE_SUITE=test:m3:recovery bash scripts/test-real-services.sh`; it additionally covers reservation crash, racing/stale workers, lost acknowledgement, budgets, Redis data loss, Mongo death and uncertain publication. The full `test:m3` includes ten minutes with no consumers. Do not run destructive test commands against production-like data. Return to Details after a normal operational repair and verify same ID, bounded attempts, complete counts and protected download.
