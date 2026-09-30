# Processing and recovery (M3)

Run `npm run build`, then `npm run start:worker` with the root `.env` configured. Run the API separately with `npm run start:api`. Redis 7.4.6, MongoDB 8.0.15 and the M2 identity configuration are required. The internal readiness listener is loopback port 3001, `/health/ready`; it checks MongoDB and Redis without exposing details. No HTTP fault-injection controls exist.

## State ownership

MongoDB is the only business-state authority. `state.ts` owns conditional writes, database-time schedules, attempts and leases. `transport.ts` carries `{importId,run}` notifications through BullMQ 6.3.10/ioredis 5.10.0. `processor.ts` validates stored input and publishes through the same fenced transitions. Each worker process consumes one job at a time and runs a non-overlapping scan loop.

Every five seconds, scan expired leases and reserve up to 100 due PENDING imports. Reservation atomically advances `nextDispatchAt` by 30 seconds before enqueueing. Enqueue has a two-second deadline and no offline buffering. Notification IDs are stable per import/run; completed/failed transport jobs are removed immediately. A crash, duplicate, missing job or Redis reset cannot delete Mongo intent. Queue metadata is never read to decide business status.

A Mongo claim increments one attempt and issues a random 60-second lease. Validation yields every 100 rows, with a 30-second deadline. Every publication and processing-failure write requires the current run/token and an unexpired database-time lease. No heartbeat is needed for these deliberately bounded files. Recovery handles abandoned claims using the same three-attempt budget. Transient retries wait two then four seconds; scheduling adds scan delay. The single manual retry creates run 2, never run 3.

Counts and all result rows publish together in one Mongo update. A BSON size check includes input, results and a conservative metadata reserve below the four-MiB application ceiling. Business-invalid rows complete with errors; they never consume another attempt. Explicit dependency/deadline failures are retryable; parser/internal/size errors fail safely without automatic retry. Logs use an explicit field allowlist, never exception serialization or raw rows.

## Real-service tests

These require actual executables and Keycloak. Missing services fail the suite; there is no mock fallback. The test harness starts isolated native dependencies, sends SIGKILL, flushes its private Redis, and uses a test-only Mongo failpoint. Never point this harness at a shared service. The ten-minute no-consumer test intentionally makes the full suite take several minutes beyond ten minutes.

```sh
MONGOD_BIN=/absolute/path/to/mongod \
KEYCLOAK_HOME=/absolute/path/to/keycloak-26.4.0 \
REDIS_SERVER_BIN=/absolute/path/to/redis-server \
REAL_SERVICE_SUITE=test:m3 bash scripts/test-real-services.sh
```

The harness uses disposable `/tmp` storage and loopback ports 27018, 27019, 6381 and 8081. Native tests do not verify Docker Compose startup. M1-Docker remains open.

## Operational handoff notes for the implemented layer

- PENDING during Redis outage: restore Redis; keep Mongo data. The next eligible scan sends a new notification. Do not reset attempts or delete imports.
- PROCESSING after worker loss: restart a worker and allow the 60-second lease plus retry/scan delay. Do not manually publish results from an expired worker.
- Mongo unavailable: restore Mongo first. An uncertain result acknowledgement may already have committed; read durable state before taking action. Redelivery safely observes terminal state.
- FAILED: inspect safe failure code and bounded timeline. An operator may retry an eligible first-run failure once. Fix business data by uploading changed bytes instead.
- Result downloads: owner-scoped API only; every CSV cell is quoted and formula-active prefixes are neutralized at export. Raw stored values remain unchanged.

These notes cover the processing layer. See `docs/runbook.md`, `docs/evidence.md` and `docs/measurements.md` for M5 handoff, verification limits and bounded observations; no enterprise capacity claim is made.
