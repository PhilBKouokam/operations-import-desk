# Public-release inspection

Source of truth: completed M5 commit `d0d601812c49645b746b341dbb2549166710ee1e`. Public release is a clean snapshot; original M5 history/bundles remain separate and unchanged. This avoids publishing obsolete workspace-specific paths from historical Git objects. Historical test outcomes are preserved; path substitutions and trailing-whitespace cleanup are presentation normalization, not new test runs.

## Findings and corrections

- Inspected all 154 blobs reachable in original M1–M5 Git history, tracked files, fixture configuration, dependency URLs, documentation and screenshots. Scanned for private keys, JWTs, GitHub/AWS token patterns, credential-bearing URLs and local paths. No real private key/access token/admin password or private company/client data was identified.
- A credential-URL match is the deliberate `https://user:pass@identity.example/realm` negative config-validation fixture. It is not a real account. Literal `SECRET` values are DTO-leak negative-test sentinels.
- Realm/test accounts use reserved `example.invalid` email addresses and `Local-demo-only-123!`. These intentionally public local fixtures remain unchanged to preserve verified behavior; `infra/keycloak/README.md` labels their limits. `.env.example` has an empty admin password. No actual `.env` is tracked.
- Replaced the workspace-specific absolute prefix in seven historical evidence/log files with `/tmp/odi-workspace`. Localhost endpoints and documented disposable `/tmp` runtime paths remain because they are required setup/test instructions, not private sources.
- Expanded `.gitignore` for `.env.*` while retaining `.env.example`, private key formats, local databases, OS artifacts and raw recordings. Build output, node_modules, browser traces and temporary recording files are excluded. Curated test evidence and reviewed screenshots are intentional artifacts.
- All 200 external package-lock resolutions use public npm registry URLs; four local workspace references require only repository source. No private package/source dependency was identified.
- Screenshot inspection shows synthetic filenames, row data, statuses and public app chrome; no token, identity-admin page, private correspondence or unrelated desktop data.
- Recording uses a preauthenticated local synthetic session; cookies/tokens remain in process memory. No browser authentication trace or storage-state file is published. Only safe import IDs/state/attempt observations are recorded.
- Independent demonstration/public-source caveats, first-professional-role positioning, AI disclosure and all engineering limitations remain visible. Docker is OPEN / UNPASSED. No unsupported production/scalability claim was added.
- Application source, package manifests/lock, realm and API contracts are unchanged from M5. Presentation scripts/cards/captions are separate from the three-screen application. A real child worker is paused/resumed; no Mongo state is manually changed.

This is a scoped inspection, not a guarantee that automated pattern checks detect every possible secret. The final release includes only reviewed files. The new Git history contains the inspected snapshot rather than old workspace paths.

## Publishing/rendering status

Repository creation cannot be performed with the currently exposed GitHub operations. Website clone succeeded, but unchanged `npm ci` failed on missing/inconsistent `@emnapi` lock entries; changing that dependency state is outside this presentation task. No website mutation was published. The selected fallback is GitHub-rendered Markdown, published with the repository using the minimal commands in `publish.md`.

Public GitHub/Markdown/video URLs remain pending. Local Markdown links and page previews are checked separately; actual GitHub README/Mermaid rendering cannot be marked verified before publication. No hosted CI or public application deployment is claimed. The draft to Ivan is not sent.

## Verification performed for this release

- Byte-compared 33 application/configuration/contract files with M5; all identical. SHA-256 manifest: `unchanged-source.json`.
- Checked nine representative private/generated paths against `.gitignore`; all ignored. Both `.env.example` files and the intended final MP4 remain includable.
- Checked every repository-local Markdown link; no missing targets. Original 891-word M5 article body remains verbatim; only project/video/script navigation and recording context were appended.
- Rendered README/article locally with a Markdown renderer in real Chromium. README image loaded; article had no horizontal overflow at 390 px. Rendered all six Mermaid nodes and their labels. These are local previews, not claims about an unpublished GitHub page.
- Both official WebCreek source URLs returned HTTP 200. Official GitHub CLI create/auth documentation returned HTTP 200 and confirmed the listed publishing flags.
- Final real-service recording harness exited 0. Recorded import `aa9063ce-b6f2-439c-9cfd-8557ced1a413` was PENDING/attempt 0 during the real child-worker pause and COMPLETED/attempt 1 after resume. No resubmission or Mongo state editing occurred. Source: `recording-evidence.json`.
- Exported a 275-second H.264 silent MP4. Captions occupy a separate bottom band; the application footage is not edited to fabricate states. The ending hold is trimmed to the intended duration. Frame review includes rejected-row explanations, pending history, completed result and closing limits. FFprobe metadata is in `video-verification.json`.
- Presentation fixes only: first take's post-close Playwright `saveAs` failed after capture; resolved using the known finalized file path and reran the capture successfully. Explicit scrolling made row explanations visible. Caption font sizing was corrected after frame review. No application behavior changed.

Actual public repository/article/video URLs, anonymous GitHub rendering and hosted CI remain UNVERIFIED until the manual publish command succeeds. Website files were never pushed. No outreach was sent.
