# Evidence summary and remaining gates

Evidence is split between pure/unit checks, real-service integration, and real-browser behavior. Native evidence is not Docker evidence; local execution is not a hosted CI run. Historical milestone reports remain unchanged for traceability.

| Acceptance | Evidence level | Outcome / boundary |
|---|---|---|
| A01–A03 | Real MongoDB/Redis/BullMQ | Happy, mixed and all-invalid rows; complete atomic counts/results |
| A04–A05 | Unit + real HTTP | CSV/input rules, multipart/oversize rejection before persistence |
| A06–A07 | Real MongoDB/Keycloak/API | Concurrent exact-byte deduplication, owner isolation and physically lost response recovery |
| A08–A14 | Real services / child-process interruption | Redis outage/data loss, death after claim/commit, stale fencing, bounded retries, Mongo failure/uncertain acknowledgement |
| A15–A16 | Real Keycloak/API + worker + browser | Token/role/ownership boundaries, safe public DTOs and CSV formulas; literal malicious values |
| A17 | Nine real Chromium cases | Three-screen workflow, role gates, reload, token refresh, offline snapshot, pagination, keyboard and scoped axe checks. Native visibility lifecycle, other browsers, physical devices and manual screen readers remain unverified |
| A18 | Partial | Native clean checkout and recovery drills verified as recorded in M5 report. Docker gate OPEN/UNPASSED; hosted CI not executed; independent second-engineer walkthrough not observed |
| A19 | Real MongoDB/Redis/BullMQ | 100/1,000 rows and eight-import one/two-process experiments; bounded observations only. See measurements |
| A20 | Real services | Reservation crash and redispatch, stable IDs and harmless duplicates. Prior M3 real ten-minute no-consumer observation: 120 rounds, 20 reservations, one waiting job, zero attempts, eventual completion. Not rerun for M5 |

See [M5 exact commands/results](milestone-5-evidence.txt), [measurements](measurements.md), [M3 evidence](milestone-3-evidence.txt), [M4 evidence](milestone-4-evidence.txt), and raw files in `test-output/`.

## Known limitations

- M1-Docker OPEN / UNPASSED. Existing dependency-only Compose is unverified; six-service container setup is not implemented/verified. Native launch is the supported demonstrated path.
- Hosted CI configured, not run. No public GitHub repository or deployed demo URL. Cloneable bundle and source ZIP are provided. A separate final-presentation capture now exists: [silent captioned video](presentation/walkthrough.mp4). M5 evidence below remains historical; GitHub publication is pending.
- Standalone Mongo/local single-node tests cannot establish replicated failover behavior, production durability under every failure, capacity, or multi-region guarantees. No public-host security review performed.
- Synthetic schema, bounded inputs/results and no retention/deletion/organization model. Not a real transportation-management system.
- API request IDs are returned but not persisted/correlated in request access logs; processing events correlate by importId. No metrics/alerts dashboard, distributed tracing, deployment automation or managed backup/restore gate.
- Action tags and service release versions are fixed but not immutable image/action digest pins. Installer records download checksums; it does not verify publisher signatures. Normal Playwright browser download failed in this environment; compatible real Chromium was supplied via an explicit path.
- Browser hidden-page gating has controlled DOM visibility evidence only. Automated accessibility results are limited to tested states, not comprehensive WCAG compliance.
- Public company sources inspire an independent exercise; no inference about private clients/systems. Applicant is seeking a first professional role; AI assistance is disclosed.

No known unresolved application correctness/security blocker emerged from the accepted M1–M4 tests. These limitations prevent a blanket production-ready or fully-passed A18 claim.
