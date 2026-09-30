# Local-only identity fixtures

All accounts, email addresses and passwords in `realm.json` are intentionally synthetic test/demo fixtures. `example.invalid` is not a real mail destination. `Local-demo-only-123!` is a published fixture password, never a private credential and never suitable for a deployed identity provider.

The realm creates operator-a, operator-b, viewer and no-role accounts. Short-lifetime/wrong-audience clients exist for negative security tests. The SPA uses Code + PKCE; password grants remain disabled. There is no committed development admin password: `.env.example` leaves it empty, and Compose requires the developer to supply one locally.

Keep these fixtures and services loopback-only. Do not reuse credentials or expose this realm publicly. Docker Compose startup remains OPEN / UNPASSED.
