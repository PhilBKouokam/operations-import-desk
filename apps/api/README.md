# Identity and durable API

M2 implements the NestJS HTTP boundary, Keycloak access-token verification, bounded CSV upload, MongoDB persistence, deduplication and owner-scoped reads. M3 adds the separate processing worker and protected result/retry endpoints.

Build at repository root with `npm run build`. Configure `.env` from `.env.example`, start the local dependencies and run `npm run start:api`. The API binds loopback. It fails startup if configuration, required indexes or OIDC discovery is unavailable/mismatched. Do not publish the development identity realm or use real data.

## Routes

- GET `/health/live` and `/health/ready`: liveness and MongoDB readiness.
- GET `/v1/me`: verified subject and mapped role (the contract's intentional own-identity response).
- POST `/v1/imports`: operator-only multipart upload with exactly one `file` part, CSV filename and supported CSV MIME type. Raw bytes <=256 KiB; complete multipart envelope <=272 KiB, including chunked requests. Upload must finish within 10 seconds. Structural validation precedes persistence. Business validation is deferred to M3.
- GET `/v1/imports?limit=20&cursor=...`: stable descending timestamp/id pagination, owner-scoped; limit 1–50.
- GET `/v1/imports/:id`: explicit detail projection; nonexistent and foreign IDs both return 404.

M3 also implements `GET /v1/imports/:id/errors`, `GET /v1/imports/:id/download?kind=accepted|errors` and `POST /v1/imports/:id/retry` with the exact `{expectedRun:1}` JSON envelope. These preserve owner scoping; only operators can retry, once. Error responses contain only a safe code/message and generated request ID. Import responses never serialize the MongoDB document or JWT directly. The API does not return input bytes, hashes, owner identity, lease tokens, dispatch timestamps or internal exceptions. `/v1/me` deliberately returns only the caller's subject/role.

## OIDC contract

The local Keycloak realm uses Authorization Code + mandatory PKCE S256 for public clients. Password grants are disabled. API accepts RS256 access tokens with exact issuer, API audience, exp/iat/sub claims and Keycloak's signed `typ: Bearer` payload claim. ID tokens are rejected. Roles map solely from `resource_access.odi-api.roles`; operator takes precedence if both roles exist. Unknown roles deny access. Token signatures use configured-issuer discovery/JWKS, never token-supplied URLs.

The browser login UI, in-memory browser token lifecycle and nonce validation via a maintained browser client library belong to M4. M2 security tests obtain real tokens through a test-only HTTP driver for Keycloak's code/PKCE flow; they do not implement a product login screen.

## Persistence

MongoDB unique owner/issuer/schema/hash index arbitrates concurrent uploads. An atomic pipeline upsert creates the entire bounded document using database time, or leaves an existing document unchanged. SHA-256 covers exact bytes. Duplicate uploads return the existing ID; a lost HTTP response is recoverable by the identical-byte resubmission. Majority+journal acknowledgement is requested. Integration evidence uses standalone MongoDB, not replica-set failover.

Queue processing is isolated in `apps/worker`. The Mongo-owned dispatcher executes the approved `nextDispatchAt` reservation; API acceptance does not require Redis.

## Real integration tests

The suite refuses to run without explicit real-service endpoints; it never substitutes a mock database or token issuer.

```sh
M2_MONGO_URI=mongodb://127.0.0.1:27018 \
M2_OIDC_ISSUER=http://127.0.0.1:8081/realms/operations-import-desk \
npm run test:integration
```

Use a dedicated development MongoDB: the suite clears ONLY `odi_m2_integration.imports`. Keycloak must import `infra/keycloak/realm.json`. All users/passwords in that file are synthetic, local-only fixtures. Test clients `odi-short` and `odi-wrong-audience` exist to exercise expiry/audience rejection.

Without Docker, `scripts/test-real-services.sh` can run official preinstalled MongoDB 8.0.15 and Keycloak 26.4.0 distributions together with the tests. Set `MONGOD_BIN` and `KEYCLOAK_HOME` to their absolute paths. It starts loopback services, uses a fresh temporary database, imports synthetic realm data, runs integration tests and stops its child services. It does not download software. Do not point KEYCLOAK_HOME at a real/shared identity installation: the helper places the test realm in its import directory.

M1-Docker remains OPEN / UNPASSED at M5 because Docker is unavailable. See `docs/setup.md` for the remaining verification gate.
