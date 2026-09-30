# Architecture decision records

## ADR 001 — Bounded single-document storage

Status: accepted for v1.1. Files are <=256 KiB/1,000 rows; results plus document must fit the 4 MiB application ceiling. Store input, lifecycle, counts and full result in one Mongo document. One conditional update can publish a complete terminal result without multi-document transaction coordination. This simplifies retry/fencing correctness and prevents partial downloads.

Cost: document growth, repeated result reads, limited input size and no retention workflow. The cap is intentional, not evidence that Mongo is right for unlimited files. Ask seniors when object storage, separate results and transaction/outbox patterns would become preferable. Changing storage requires new atomicity and recovery tests.

## ADR 002 — Mongo-owned processing state, Redis transport

Status: accepted for v1.1. Accepted work must survive queue loss and duplicate delivery. Mongo owns due times, `nextDispatchAt`, attempts, runs, leases and publication. Redis/BullMQ carries only ID/run. Atomic 30-second pre-enqueue reservations plus stable IDs bound dispatch and queued notifications; queue state never determines business completion. Three attempts/run, at most two runs.

Cost: scanning introduces latency; queue and durable state can temporarily disagree. A crash after reservation delays work until due, rather than losing it. No outbox collection is introduced for this bounded tool. At larger scale ask whether a transactional outbox or team-standard dispatcher reduces complexity, and measure scanning/index behavior on realistic data before choosing.

## ADR 003 — OIDC and owner-scoped authorization

Status: accepted for v1.1. Delegate sign-in to Keycloak; public SPA Code+PKCE, no secret or token persistence. API validates access-token signature/issuer/audience/type/expiry and maps only configured API client roles. Every import read, retry and download is owner-scoped by issuer+subject. Operators write; viewers read own data. Foreign IDs look absent.

Cost: provider/configuration availability is a dependency; local fixture accounts are unsuitable publicly. Browser refresh uses provider session, not stored tokens. This model has no teams, sharing or admin override. Ask seniors to review token policy, issuer deployment routing, session/logout requirements and required deployment controls before real users/data.
