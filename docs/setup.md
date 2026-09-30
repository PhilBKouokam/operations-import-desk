# Reproducible setup

## Checkout and prerequisites

Clone the supplied Git bundle (`git clone /absolute/path/operations-import-desk-m5.bundle operations-import-desk`) or extract the source ZIP and enter its directory. No `.env`, installed dependencies or runtime database files are included. The bundle includes commit history; the ZIP is source only.

Native provisioning targets Ubuntu 22.04/24.04-compatible x86_64 Linux with OpenSSL 3. Install Git, curl, tar/gzip, make, GCC, pkg-config, Java 17 and Node 24/npm 11.9.0 using your normal OS/runtime tooling. macOS, Windows and ARM binaries are not covered by this installer. Allow loopback ports 27018, 6380, 8081, 3000, 3001, 5173; do not run suites simultaneously. Test-only M3 uses 27019/6381; measurement uses 27021/6382. Check for existing listeners before starting; do not terminate unrelated services.

```sh
npm ci --ignore-scripts
npm run check
npm run build:web
npm run docs:check
bash scripts/install-native-services.sh /tmp/odi-runtime
source /tmp/odi-runtime/env.sh
bash scripts/demo-native.sh
```

Installer requires a new directory, fetches fixed official Mongo/Keycloak/Redis releases, checks gzip validity, compiles Redis and records SHA-256 download fingerprints. It does not verify independent publisher signatures. If a proxy returns HTML, stop and inspect the failed download; do not execute it. Runtime distributions are disposable and should not be shared with a real identity installation. The harness copies the local fixture realm into Keycloak's import directory.

The demo uses the tested browser harness service topology; it waits instead of running tests. Environment is injected by the launcher (no `.env` needed). UI uses port 8081 issuer; the imported SPA redirect is exactly `http://127.0.0.1:5173/callback`. Use `127.0.0.1`, not `localhost`. API also validates that exact issuer/audience. The launcher prints diagnostic directory paths; stopping it ends child services. Data remains in that private temporary directory for diagnosis, but the next launch uses new storage. Delete only your own disposable run directory when finished. Do not rely on this launcher for durable production storage.

Accounts: operator-a, operator-b, viewer; password `Local-demo-only-123!`. The no-role account and short/wrong-audience clients exist for negative security tests. Manual demo starts empty: an operator submits samples. Automated browser tests create controlled viewer-owned fixtures directly in their disposable DB; there is no public seed route.

## Repeat verification

```sh
source /tmp/odi-runtime/env.sh
bash scripts/test-real-services.sh
REAL_SERVICE_SUITE=test:m3:recovery bash scripts/test-real-services.sh
# Full reliability suite adds a real ten-minute no-consumer dispatch observation:
REAL_SERVICE_SUITE=test:m3 bash scripts/test-real-services.sh
npx playwright install --with-deps chromium
bash scripts/test-browser-services.sh
npm run measure
```

The API suite uses real Keycloak Code/PKCE tokens and MongoDB; M3 launches real MongoDB/Redis; browser suite starts all six native processes. Tests use fixed dedicated DB names, disposable storage and internal fault injection. Never redirect them to shared services. Default Node tests build first. Browser harness builds backend and production web assets. Measurements overwrite their explicit report file; set `MEASURE_OUTPUT=/absolute/path/new.json` to retain prior observations.

If normal Playwright browser download is blocked, use a compatible preinstalled Chromium via `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. This environment used Chromium 153.0.8010.0 after the normal CDN download failed; that exception is recorded in M4 evidence. CI uses the standard Playwright installer, whose hosted execution remains unverified. See evidence for native visibility and assistive-technology limits.

## Docker status and future verification gate

M1-Docker remains OPEN / UNPASSED. Docker is absent here. Existing `compose.yaml` launches dependencies only, with host-loopback ports and named volumes; it is not a verified six-service deployment. No Dockerfile or full-app container workflow is being claimed.

In a Docker-capable environment first copy `.env.example` to `.env`, supply a local Keycloak admin password, run `npm run infra:config` and `npm run infra:up`, then run host API/worker/UI per their READMEs. `npm run infra:down` retains volumes. Closing the user's full Docker gate additionally requires containerizing UI/API/worker, correct browser/container OIDC issuer routing, seeded data, and a real critical workflow with recorded evidence. Do not close it just because `docker compose config` parses. Any binding/issuer adjustment must preserve M2 token rules and pass existing security tests.

## CI

`.github/workflows/verify.yml` specifies Node/Java, clean npm install, typecheck/build/unit/OpenAPI check, official native dependencies, real API/security, full M3 (including A20), and browser workflow. Read-only repository permission; 35-minute timeout. No deployment or outreach step. Local equivalent execution is recorded separately from hosted CI, which has not been run. Review action version pinning and download provenance under the team's supply-chain policy before production use.
