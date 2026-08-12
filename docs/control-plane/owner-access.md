# Owner access and private-shell contract

Status: application behavior implemented; live provider acceptance pending

## Authorization matrix

| Request or identity | Required result | Audit / disclosure behavior |
| --- | --- | --- |
| Configured immutable numeric GitHub ID, valid one-time state | Create a 15-minute opaque session | Record an allowed login with a one-way actor fingerprint; never record the raw numeric ID or OAuth token |
| Different valid GitHub user | Deny | Record a denied login with a one-way actor fingerprint; return only the generic owner-access failure |
| Replayed, expired, missing, or mismatched OAuth state | Deny | Consume state once, audit the generic state failure, and create no session |
| Missing/forged code or failed GitHub identity lookup | Deny | Audit a generic callback failure; never include the provider response or token in the response |
| Missing, expired, revoked, or forged session | Concealed `404` | No shell content, record identifier, or private diagnostic is returned |
| Missing/cross-origin/forged CSRF proof | Concealed `404` | Mutation and logout do not run |
| Authorized same-origin mutation | Permit only the named operation | Recheck the store-backed session and CSRF digest at the mutation boundary |

The session, CSRF proof, and OAuth browser binding use `Secure`, `HttpOnly`, `__Host-` cookies. Session and state values are random and only keyed digests enter the store. Rotating `OWNER_SESSION_SECRET` makes every prior state and session digest unreachable. The operational rotation checklist requires rotating that value whenever GitHub OAuth material is rotated and verifying that an old cookie is denied.

## Server-only and persistence boundary

`src/control/access.server.ts`, `src/control/http.server.ts`, and the runtime adapter import `server-only`. GitHub code exchange and `GET /user` run inside the provider adapter, which returns only the numeric identity. Page, API, and operational-repository access recheck authorization at the server data boundary.

Development and test may use the explicitly ephemeral `InMemoryOwnerAccessStore`. Preview and production refuse to start owner access without an injected persistent `OwnerAccessStore`; they do not fall back to memory. Ticket 02 has not provisioned Neon or the GitHub Apps, so the production adapter and live OAuth evidence remain pending. Until connected, login returns a generic unavailable response and every private surface fails closed.

## Route inventory

| Surface | Route | Initial truthful state |
| --- | --- | --- |
| Owner entry | `/owner-access` | Public, non-indexed authentication entry only |
| Overview | `/control` | Eleven nonfunctional state summaries; no success inferred |
| Upload | `/control/upload` | Unavailable until managed persistence/upload work is connected |
| Publication runs | `/control/publication-runs` | Unavailable |
| Deployments | `/control/deployments` | Unavailable |
| Checks | `/control/checks` | Unavailable |
| Served version | `/control/served-version` | Unavailable; no served deployment is inferred |
| Circuit breaker | `/control/breaker` | Unavailable |
| Restore/retry | `/control/restore-retry` | Unavailable; no action is fabricated |
| Source freshness | `/control/source-freshness` | Unavailable |
| Raw deletion | `/control/raw-deletion` | Unavailable |
| Outbox | `/control/outbox` | Unavailable |
| Notifications | `/control/notifications` | Unavailable |
| Minimal private DTO | `/api/control/status/[section]` | Same authorized state, redacted and non-cacheable |

All private paths send `Cache-Control: private, no-store, max-age=0`, `X-Robots-Tag: noindex, nofollow, noarchive`, and `X-Content-Type-Options: nosniff`. Missing or malformed session cookies are rejected in `proxy.ts` before page streaming; layouts, data access, mutations, and route handlers still perform authoritative checks.

## Verification

Build with a credential corpus in the server environment, then run:

```bash
pnpm verify:owner-access
pnpm exec vitest run src/control
pnpm exec playwright test tests/browser/control.spec.ts
```

The leak scan checks static browser bundles, checked-in public assets, and emitted public HTML/RSC/cache artifacts. It rejects supplied credential/owner literals, known credential patterns, privileged field names, and private control endpoints. Repeat it against the actual deployment output and attach provider-native scan results before acceptance.
