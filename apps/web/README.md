# Three-screen UI (M4)

React/TypeScript screens: Submit (`/submit`), Import History (`/imports`) and Import Details (`/imports/:id`). `/callback` only completes the provider redirect and restores a bounded same-origin return path. There is no application password form or fourth sign-in screen.

## Run locally

Use the root API/worker configuration and dependencies from prior milestones. Copy this directory's `.env.example` to `.env` if the public API/provider addresses differ from the loopback defaults. These Vite values are public configuration, never secrets.

```sh
npm ci --ignore-scripts
npm run build
npm run build:web
npm run start:api
# Separate terminal:
npm run start:worker
# Separate terminal:
npm run dev:web
```

Open `http://127.0.0.1:5173`. The approved Keycloak SPA client is `odi-web`, with the exact callback `http://127.0.0.1:5173/callback`. Use the existing local-only synthetic realm accounts. Browser test contexts isolate accounts; the harness seeds viewer-owned data directly into its disposable database. No seed/admin route was added.

`npm run preview -w @operations-import-desk/web` serves the built assets for local review. This is not a public deployment command or a production hosting claim. Docker Compose startup remains unverified (M1-Docker).

## Boundaries and state

- `auth.ts`: maintained `keycloak-js` adapter, Authorization Code + PKCE S256. The adapter handles state/nonce and holds access/refresh tokens in memory. Application sessionStorage contains only a validated return path. Reload uses the provider session to obtain fresh tokens; tokens are never persisted by the app.
- `api.ts`: access tokens in Authorization headers only; exact configured API origin, no cookies, redirect rejection, bounded request timeout, safe status/code mapping and protected blob downloads. No raw response body or exception is rendered.
- `contracts.ts`: public response fields only. No Mongo document, input bytes, owner identity, hash, lease token or dispatch metadata enters the view model.
- `Submit.tsx`, `History.tsx`, `Details.tsx`: one file per approved screen. The server confirms durable acceptance, duplicate status, ownership and retry eligibility. A retry updates the display by refetching; the client never invents a run or processing state.
- `useDetails.ts`: at most one status request in flight; three-second scheduling after a response; no hidden-document timer, no terminal polling, abort on unmount/hidden state. Network failures preserve the last confirmed document and display “Status unavailable; last updated …”. 403/404/session failures stop polling and clear the detail view.
- `components.tsx`: accessible shared links, safe error messages, text status labels and counts. Navigation changes focus to the page heading. Rejected CSV values use ordinary React text nodes.

Samples are frozen copies of the existing M1 CSVs. They are public demonstration files; actual result downloads always use protected API routes. History is cursor-paginated without search or filters. Row explanations are paginated through the existing errors endpoint.

## Browser tests

```sh
npx playwright install chromium
MONGOD_BIN=/absolute/path/to/mongod \
KEYCLOAK_HOME=/absolute/path/to/keycloak-26.4.0 \
REDIS_SERVER_BIN=/absolute/path/to/redis-server \
bash scripts/test-browser-services.sh
```

An already installed Chromium can be selected with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/absolute/path/to/chromium`. The harness starts real MongoDB, Redis, Keycloak, API, worker and the built web preview, using loopback ports 27018, 6380, 8081, 3000, 3001 and 5173. It requires the dedicated database `odi_m4_browser`; never substitute a shared database. Tests pause/resume the worker, create controlled database fixtures, interrupt browser networking and advance the browser clock for token refresh. No production fault-injection route is used.

Nine browser cases cover the workflow and authorization boundaries. Axe checks rendered desktop/mobile views against WCAG A/AA rule tags, with separate keyboard interactions. This is not a comprehensive assistive-technology certification. The available headless Chromium keeps background pages visible; hidden/visible polling is therefore tested using a controlled DOM visibility signal. Native tab/minimize behavior remains unverified in this environment. See `docs/milestone-4-evidence.txt` for exact observed results and limitations.

Official adapter reference: https://www.keycloak.org/securing-apps/javascript-adapter
