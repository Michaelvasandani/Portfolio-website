# Ticket 04 acceptance evidence — owner access and operational shell

Date: 2026-08-12
Ticket status: **open — application behavior verified locally; live provider and persistent-store evidence pending ticket 02**

No GitHub App, persistent Neon auth store, preview environment, or production environment was available in this implementation session. No claim of live Michael login, provider callback enforcement, deployed cache behavior, or durable audit retention is made. The application deliberately refuses ephemeral preview/production auth and returns generic unavailable/not-found responses until a persistent `OwnerAccessStore` is injected.

## Acceptance coverage verified locally

- [`src/control/auth/service.test.ts`](../src/control/auth/service.test.ts) covers configured immutable numeric-ID authorization, denial and redacted audit of a different valid GitHub user, one-time/mismatched/expired OAuth state, forged callbacks, opaque and expiring sessions, CSRF/origin enforcement, and logout revocation.
- [`src/control/auth/github.test.ts`](../src/control/auth/github.test.ts) proves server-side code exchange and identity lookup return only a numeric ID and fail closed without exposing provider detail.
- [`src/control/auth/runtime.test.ts`](../src/control/auth/runtime.test.ts) proves absent configuration fails closed and preview/production cannot use the in-memory test double.
- [`src/control/http.test.ts`](../src/control/http.test.ts) covers generic unavailable responses, secure cookie headers, token-free redirects, CSRF-protected logout, private API concealment, and unknown-section concealment.
- [`src/control/security.test.ts`](../src/control/security.test.ts) covers secure cookie contracts, non-cacheable generic responses, field-name redaction, and high-confidence credential-value redaction.
- [`src/control/operations.test.ts`](../src/control/operations.test.ts) fixes the eleven-surface inventory, including served-version state, and requires every unconnected surface to say `unavailable` with no fabricated record or success.
- [`tests/browser/control.spec.ts`](../tests/browser/control.spec.ts) inspects the built Next.js application: owner entry is non-indexed and secret-free; unauthenticated page/API requests return `404`, `no-store`, and no shell/diagnostic text; OAuth start sets a five-minute secure HTTP-only state cookie.
- [`src/control/leak-scan.test.ts`](../src/control/leak-scan.test.ts) and [`scripts/verify-owner-access.ts`](../scripts/verify-owner-access.ts) provide the public artifact leak corpus and executable build scan.
- [`docs/control-plane/owner-access.md`](../docs/control-plane/owner-access.md) records the authorization matrix, server-only boundary, route inventory, cookie/session policy, truthful initial states, and rotation behavior.

## Local command evidence

```text
pnpm exec vitest run src/control
8 files passed; 46 tests passed

pnpm typecheck
passed

pnpm lint
passed

pnpm build (with test-only auth and provider sentinel values)
passed; /control and /control/[section] reported Dynamic

pnpm verify:owner-access (against that build)
passed: 15 static browser bundle files, 96 emitted public artifacts,
4 public files, and 8 configured literals absent

pnpm exec playwright test tests/browser/control.spec.ts --project=chromium
3 passed

pnpm verify
passed: lint; typecheck; schema; 226 tests; migration rollback check;
dynamic production build; 51 browser tests across Chromium, Firefox, and WebKit
```

The final full repository verification and three-browser results are recorded in the ticket commit handoff after this evidence file is created.

## Live acceptance package still required

- Ticket 02 completion and Michael's signed provisioning evidence.
- A persistent transactional `OwnerAccessStore` adapter backed by the provisioned environment-specific Neon database, with durable one-time OAuth state, sessions, revocation, and audits.
- Successful real login for Michael's configured numeric ID plus denied real login for another valid account, with redacted durable audit evidence.
- Provider/deployment evidence for callback allowlisting, wrong-origin and replay denial, credential/session rotation, old-session denial, and environment separation.
- Preview and production header/cache captures, deployed public-bundle/emitted-asset/provider-native scans, and log/error-response inspection using a private leak corpus.
- An authenticated route walk showing every operational shell surface and its truthful state against the deployed persistent store.

OPS-002 forbids closing the ticket without those pinned-environment artifacts. Code completion and local test doubles are therefore not represented as production acceptance.
