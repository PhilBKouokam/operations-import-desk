# Recording package — 4:35 walkthrough

Use [exact spoken script](presentation/spoken-script.md), [90-second version](presentation/short-script.md), and the screen sequence below. All scenes use synthetic local data. A captioned, silent browser recording is produced separately; it is not Phillip-Bryan's recorded voice. Add your own voice-over or follow this sequence in a fresh screen recording.

## Preparation

For the simplest recording on your own computer, import the finished silent MP4 into your video editor and record your own voice using the spoken script. No local app setup is needed for that. The native app instructions below require the documented Linux environment.

Run the documented native setup, then `bash scripts/demo-native.sh`. Open `http://127.0.0.1:5173` at 1280×900 or larger and sign in as operator-a before recording. Close unrelated windows/notifications. Keep browser Network, tokens, `.env` and identity admin pages off screen. Use only `samples/valid.csv` and `samples/invalid-rows.csv`.

For the automatic capture, `source /tmp/odi-runtime/env.sh`, install the Playwright Chromium and FFmpeg runtimes (`npx playwright install chromium ffmpeg`), then run `bash scripts/presentation/record-demo.sh`. A compatible existing Chromium can be selected with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. This script starts its own disposable six-process native topology. It is presentation tooling, not a new application feature.

## Exact screen/click sequence

| Time | Screen and actions | What must be visible |
|---|---|---|
| 0:00–0:30 | Intro card; read opening paragraph. | Name, junior positioning, independent demonstration, synthetic data. |
| 0:30–1:05 | Architecture card or repository architecture document. | React → NestJS; Keycloak/OIDC; Mongo business state; Redis/BullMQ transport; bounded worker. |
| 1:05–1:55 | Submit → Choose file → `valid.csv` → Submit import → View import details. After completion click Download accepted CSV. Click ← Import History → `valid.csv`, then refresh. | Schema/limits, real saved response, actual state and counts. Pending may pass too quickly to see; never fabricate it. Same result after return/refresh. |
| 1:55–2:35 | Submit → choose `invalid-rows.csv` → Submit import → View import details. Scroll to Rows to correct; show date/duplicate explanations, then Download error CSV. | Completed with errors; one accepted, three rejected; actionable record explanations. |
| 2:35–2:47 | Reliability title card. Pause only your disposable worker process with `kill -STOP WORKER_PID`; the automatic harness knows the exact child PID. | Explicit statement: real local worker pause; no status mock or DB edit. |
| 2:47–3:21 | Submit another valid file with SHP IDs changed to REC IDs (`recovery.csv`). Open Details, leave for History, return to `recovery.csv`. | Waiting for processing, attempt 0, same import. New bytes avoid returning a previous completed duplicate. |
| 3:21–3:55 | Resume exact worker with `kill -CONT WORKER_PID`. Wait for real completion without resubmission. | Same import, attempt 1, three accepted. Do not infer cause from the UI; narrator knows the injected pause. |
| 3:55–4:35 | Closing card and senior-review questions. | AI disclosure, learning areas, Docker OPEN/UNPASSED, no hosted CI or public-app deployment claim. |

Do not guess the PID or pause shared services. If you cannot identify your own disposable worker cleanly, omit the live pause and show the already-recorded M5 A08/A09 output, clearly calling it prior integration evidence. Never edit Mongo state for this recording.

## Recording/export

The automatic capture records real browser activity and tests that the paused import is PENDING/attempt 0 and later COMPLETED/attempt 1 with the same ID. It does not demonstrate SIGKILL, lease expiry or stale-worker rejection on video; those remain separate integration evidence. Intro/architecture/closing cards are explanatory slides, not application screens. There are still exactly three application screens.

The exported MP4 is silent with readable captions. The spoken script is 565 words, intended for your own voice at a natural pace with pauses. Use the MP4 as a visual track, or record your screen following the sequence. Do not label generated captions as a voice recording. The backup script is a separate 90-second take, not a speed-up of the long video.
