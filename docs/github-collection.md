# GitHub evidence collection

Ticket 06 implements the local collection and ingestion contract. Live collection remains unavailable until ticket 02 provisions the private endpoint, signing secret, Neon database, notification provider, and environment-scoped identities. The endpoint deliberately returns `503 {"status":"unavailable"}` while no durable `GitHubIngestionStore` adapter is connected.

## Workflow and privilege boundary

`.github/workflows/collect-github-evidence.yml` runs at 09:17 UTC daily and through `workflow_dispatch`. Its top-level `permissions: {}` grants no repository permission to the built-in token. The workflow fetches this public repository anonymously at the triggering SHA, then uses `secrets.GITHUB_TOKEN` only for public GraphQL and REST metadata. It does not accept a PAT or fine-grained token.

Scheduled runs select the protected `production` Actions environment. Manual dispatch requires an explicit `development`, `preview`, or `production` environment choice. The receiver URL and signing secret must exist only as environment-scoped secrets; repository-level copies are prohibited. Environment protection and secret availability therefore remain provider acceptance checks rather than assumed repository state.

The workflow uses:

- GraphQL for owner identity, current profile pin order, and the public repository graph;
- REST for preferred README, topics, languages, releases, default-branch commits, and recursive source structure;
- ETag/`If-None-Match` conditional requests, with public representations restored through the Actions cache service;
- three bounded attempts for retryable GitHub and receiver failures;
- HMAC-SHA-256 over the exact canonical request body for delivery.

The cache contains only public ETags and public API response bodies. It contains no GitHub token, ingestion secret, authorization header, or private endpoint. The workflow action is pinned to the immutable `actions/cache` v5.0.5 commit.

## Normalized snapshot

The immutable `contentHash` binds schema version-independent normalized identity, owner, pin order, every repository field, collection completeness, and every fetch outcome. Thus a new collection attempt has a new content identity when its outcome, attempt count, status, or observation time differs. A separate `evidenceHash` excludes operational fetch outcomes so conditional `304` reuse can prove the normalized source evidence is unchanged; `renderedContentHash` covers only publication-relevant normalized evidence.

Source and rendered hashes have distinct semantics. Source normalization changes only line endings and terminal-newline form. Rendered normalization removes non-rendered HTML comments and presentation-only trailing whitespace. Consequently, a source-only README comment change changes the evidence and immutable content hashes without changing its rendered-content hash.

Mechanical commits—dependency bumps, merge commits, bot-authored commits, ordinary `chore` commits, and formatting/lint/Prettier-only commits—do not establish meaningful activity.

README, topics, languages, default-branch activity, and default-branch source structure are required when applicable; activity, structure, and README are inapplicable for a repository without a default branch. Releases are optional because a repository may validly have none and ambiguous release-endpoint availability must not invent releases. Any failed required outcome marks the collection `partial`; neither the workflow builder nor receiver can install it. An optional release failure remains explicit and content-bound. A truncated Git tree is a failed required outcome and is never represented as complete evidence.

## Receiver contract

The public route is `POST /api/ingestion/github`. Before installing anything, the receiver verifies:

1. an `application/json` media type, declared and streamed one-megabyte byte limits, and a five-second whole-body read timeout;
2. the HMAC signature using constant-time comparison;
3. envelope schema version 1 and the complete strict nested snapshot shape, including HTTPS sources, document hashes, pin consistency, and one outcome per endpoint;
4. the exact configured repository and workflow ref;
5. a five-minute replay window;
6. the canonical payload hash;
7. all three centralized snapshot hash projections and the content-addressed ID;
8. complete required evidence with no partial collection;
9. the transactional delivery identity in the durable store.

`GitHubIngestionStore.installVerifiedDelivery` is the atomic durable-store seam. A managed adapter must record delivery identity, collection attempt, audit, immutable snapshot insert, and latest-freshness pointer in one transaction. A new delivery carrying an existing exact content hash returns a successful duplicate no-op. Reusing a delivery identity, including with changed content, is rejected and audited. Signed failures and required-evidence partials leave the latest snapshot unchanged.

The checked-in in-memory adapter is a test double only and is never selected by the server runtime. Preview and production must remain unavailable until the managed adapter is injected.

## Freshness and notification policy

A snapshot is eligible for a new promotion through exactly 48 hours after collection. An older snapshot remains servable only as part of the Last valid portfolio. Collection failure never clears or replaces it.

The missed-schedule reconciler treats the absence of any collection attempt for more than 30 hours as a missed daily run. It requests one idempotent notification outbox intent per UTC day. Routine success, duplicate delivery, and ambiguous optional external availability remain private diagnostics and do not notify. Live notification and transactional-outbox evidence depend on tickets 02 and 04.

## Managed-adapter acceptance checklist

Do not close ticket 06 until the deployed acceptance package includes:

- scheduled and manual Actions run URLs for the controlled fixture repositories;
- the run's effective token-permission export showing `{}` plus proof of public metadata access;
- exact deployed normalized snapshot, semantic hash, and rendered-content hash;
- durable-store duplicate, replay, signature, identity, schema, size, and hash rejection records;
- a two-run conditional-request report showing `304` reuse, stable evidence/rendered hashes, and outcome-bound immutable content hashes;
- a failed collection and a missed schedule showing prior-snapshot preservation and the exact notification policy;
- an older-than-48-hours promotion denial while the Last valid portfolio remains served.

No local test result substitutes for those managed-service artifacts.
