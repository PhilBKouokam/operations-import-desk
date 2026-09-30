# 90-second backup

Approximately 190 words; read naturally with brief pauses. Use these four shots:

- 0:00–0:15: Submit, with name/independent-demo introduction.
- 0:15–0:40: Valid file → Details → completed counts/download controls.
- 0:40–1:05: Invalid file's row explanations; cut to the clearly labelled paused-worker clip and its recovery. Say this is a recorded local example.
- 1:05–1:30: Architecture card and closing questions/limits.

## Exact spoken script

Hi, I’m Phillip-Bryan, a junior full-stack developer pursuing my first professional engineering role. This is an independent learning project inspired by WebCreek’s public posting, not a representation of their systems.

Operations Import Desk helps an operations coordinator submit shipment CSVs and recover clear results after interruptions. Here, I submit a valid file, open Details, and download the accepted rows. A second sample finishes with actionable rejected-row explanations. Business-data errors become results rather than triggering infrastructure retries.

React calls a NestJS API, with Keycloak and OIDC for sign-in. MongoDB owns accepted work, attempts and results; Redis and BullMQ carry notifications.

In this recorded local example, I paused the real worker, submitted a file, and returned to its durable pending state. Resuming the worker completed the same import without another upload. This shows consumer-pause recovery; separate tests cover worker death and stale leases.

These tools were learning areas, not prior professional experience. Codex assisted the work. Docker startup remains unverified. I’d value senior feedback on the lease model, authorization boundaries, and where I overengineered. My goal was a small feature another engineer could understand and maintain.
