# If I Joined WebCreek as a Junior Full Stack Developer, Here’s How I’d Approach My First Production Feature.

This is an independent learning and hiring demonstration based only on public information about WebCreek and its job posting. It does not represent WebCreek’s systems, clients, requirements or production architecture. I’m pursuing my first professional software engineering role. NestJS, Redis, OIDC and queues were learned and demonstrated through this project; I am not claiming prior professional experience with them.

## Start with an operational problem

WebCreek’s [Houston React/NestJS posting](https://careers.webcreek.com/positions/junior-full-stack-developer-react-nestjs/) emphasizes backend data processing, security, troubleshooting and maintainability. Its [public logistics case study](https://www.webcreek.com/en/our-work/transforming-logistics-operations-with-a-custom-transportation-management-system/) describes operational data-input challenges. That suggested a believable exercise, not a known WebCreek requirement: an operator submits shipment CSVs and needs dependable results after interruptions.

I built Operations Import Desk: Submit, History and Details. It validates synthetic rows and produces accepted/error CSVs. It does not create real shipments. Before coding, I defined who could see each import, what “accepted” meant, which errors should become results, what identical resubmission should do, and how much work this small tool could safely accept.

The posting asks for professional experience I don’t yet have. This project is evidence of my approach and learning, not a substitute claim that I meet that requirement.

## The smallest useful architecture

React calls a NestJS API. MongoDB stores each bounded import and its results. A separate worker uses Redis/BullMQ notifications to discover work. Limits—256 KiB, 1,000 rows and a 4 MiB document ceiling—make one-document atomic result publication practical. Larger workloads could require another design.

Structural validation happens before persistence; row-level business errors become completed results. Even an all-invalid file finishes with explanations rather than repeatedly retrying bad data. Exact-byte hashing plus a unique owner/schema/hash index resolves concurrent duplicate submissions and lets an operator recover a lost HTTP response by submitting the same bytes.

## Mongo owns intent; Redis carries notifications

Losing Redis must not erase an accepted import. Mongo therefore owns status, due times, attempts and leases. A dispatcher atomically reserves a pending import’s next dispatch time before enqueueing. Stable per-import/run job IDs and a 30-second reservation bound repeated notifications while workers are absent.

A worker claims conditionally and receives a 60-second lease. Publication must match the current run, token, processing state and unexpired database-time lease. A resumed stale worker cannot overwrite newer results. Each run permits three attempts; one authorized manual retry creates run two, with no third run.

## Test the uncomfortable boundaries

Real MongoDB/Redis/BullMQ tests interrupted Redis, killed workers after claim and after result commit, removed queue data, raced claims and interrupted Mongo publication. Tests checked the durable outcome, not just whether a process restarted. A ten-minute no-consumer observation retained one waiting notification and zero processing attempts, then completed the same import after consumption resumed.

Real Keycloak tokens exercised issuer/audience/type checks, role enforcement and cross-user isolation. The browser suite followed uploads to completion, duplicate recovery, rejected-row explanations, refresh, protected downloads and keyboard navigation. These are local synthetic observations, not production guarantees.

## Security and honest status

The SPA uses Authorization Code + PKCE and memory-only tokens. The API enforces owner-scoped access; hiding a button is insufficient. Uploaded values render as text, and CSV exports neutralize spreadsheet formulas.

The UI says a file is saved only after API acceptance. It polls visible, unfinished imports and stops at terminal state. A failed request shows “Status unavailable; last updated …” while retaining the last confirmed snapshot. Elapsed time does not prove a queue outage.

## What needed correction

Design review exposed repeated dispatch while no workers consumed. The Mongo-owned reservation corrected that before implementation. A lost-acknowledgement test initially allowed too little time for BullMQ stalled-job detection; extending its observation window and requiring actual redelivery corrected the test without weakening business rules. Browser keyboard testing also needed explicit focus restoration before opening the native file picker.

Bounded measurements observed 15 ms and 63 ms from claim to publication for 100 and 1,000 valid rows. Those single runs exclude HTTP/login and scheduled dispatch waiting; they are not capacity promises. Docker remains **OPEN / UNPASSED**, hosted CI has not run, and no public deployment is claimed. Native setup and the clean-checkout evidence are documented separately.

Building CalorieBank across web, mobile and backend had already made me think about account boundaries, reliability, recovery and real-device behavior in my own product. This exercise let me carry those questions into unfamiliar tools while keeping the workflow small.

## What I’d Ask a Senior Engineer to Review

- Is this lease/fencing model appropriate, or is there a simpler team-standard pattern?
- Would a transactional outbox or another dispatch abstraction be preferable at larger scale?
- Are the OIDC and authorization boundaries placed correctly?
- Does single-document result storage remain sensible under real workloads?
- Which observability and deployment gates would you require before production?
- Which parts did I overengineer?

I would pair on those reviews before expanding scope. If evidence justified further work, I’d prioritize deployment verification, request-to-import log correlation and broader accessibility testing. The repository includes setup, API documentation, ADRs, a recovery runbook and explicit evidence limits so another engineer can challenge and maintain it.

OpenAI Codex assisted the design, code, tests, investigation and writing. I need to understand and explain that work; assistance is not proof of independent mastery. Learning from experienced engineers is a specific reason I’m interested in this opportunity.

---

[Project README](../README.md) · [Captioned walkthrough](presentation/walkthrough.mp4) · [Spoken script](presentation/spoken-script.md)

The walkthrough is a silent recording of the real local app with captions, intended for my own voice-over. It shows a controlled worker pause/resume; worker-death and lease-expiry claims refer to the separate integration evidence.
