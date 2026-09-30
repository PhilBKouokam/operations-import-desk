# A19 bounded observations

Recorded September 30, 2026. Synthetic all-valid shipment CSVs; one run per scenario. Real MongoDB 8.0.15, Redis 7.4.6 and BullMQ 6.3.10, separate worker processes. All 18 imports completed on attempt 1 with exact expected row counts. No business-state or lease rule was changed.

Environment: Ubuntu 24.04.3 LTS, Linux 6.18.44 x86_64, Node 24.19.0. AMD EPYC 9V74; 9 logical CPUs visible, cgroup CPU quota 8 cores and memory limit 8 GiB. Shared execution host. Standalone Mongo with journal/majority acknowledgements; loopback network.

| Single import | Claim → publication | Acceptance → publication | Worker sampled RSS | Result BSON | Accepted CSV | Error CSV |
|---|---:|---:|---:|---:|---:|---:|
| 100 rows | 15 ms | 37 ms | 86.9 MiB | 17,773 B | 5,882 B | 133 B |
| 1000 rows | 63 ms | 71 ms | 107.8 MiB | 179,873 B | 59,982 B | 133 B |

Eight concurrent durable imports × 1,000 rows, queued together after creation:

| Consumers | Dispatch → observed completion | Create → observed completion | Per-process sampled RSS |
|---|---:|---:|---|
| 1 | 342.62 ms | 562.9 ms | 117.9 MiB |
| 2 | 230.25 ms | 398.61 ms | 112.9 MiB, 111.4 MiB |

The two-process batch completed sooner in this observation, with more combined worker memory. Individual work did not uniformly become faster. There are no repetitions, percentiles, cold-start comparison, saturation/load/failover study or enterprise capacity inference. Scenario order and warm shared services affect comparison.

Claim/publication timestamps come from Mongo database time. Acceptance excludes CSV structural parsing, which the harness performs before `store.create`. A single immediate production `dispatchScan` excludes the normal five-second scheduling wait. Workers start before timing. HTTP, OIDC and UI timing are excluded. RSS is sampled every 10 ms (plus final sample), includes process baseline, can miss short spikes, and excludes Mongo/Redis/Keycloak. Error CSV is header-only for these valid files. Raw report records input/full-document sizes and import IDs too.

Run `source /tmp/odi-runtime/env.sh` then `npm run measure`. Harness owns disposable ports 27021/6382 and storage. It uses the production parser, store, dispatcher, consumer and publication code. Never run it against shared services. Source: [raw JSON](test-output/m5-measurements.json).
