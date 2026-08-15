# 07 — Expose the Portfolio agent's verified status

**What to build:** Replace the terse Publication note with a public Publication status strip that demonstrates the autonomous pipeline and expands into a concise architecture explanation without crossing the Portfolio's private trust boundary.

**Blocked by:** 02 — Open the living technical dossier.

**Status:** resolved

- [x] The status strip states that the Portfolio is verified by its agent and shows the latest successful update, approved résumé and GitHub source status, publication-check result, and public manifest hash.
- [x] The strip's states distinguish verified, stale-but-still-valid, and unavailable optional status without claiming a successful update that did not occur.
- [x] A keyboard-operable inline disclosure explains résumé and GitHub sources, evidence processing, publication checks, and validated deployment in that order.
- [x] The explanation remains concise, static, and understandable without exposing implementation-only jargon as the primary description.
- [x] Public output contains no private source content, snapshot or evidence identifiers, prompts, diagnostics, logs, credentials, internal service URLs, admin actions, or operational controls.
- [x] The independent public leak scan and manifest completeness checks cover every new public status field.
- [x] The status strip remains readable without scripting, under reduced motion, in forced colors, at 200% zoom, and across the supported viewport matrix.
- [x] Existing public last-updated and manifest-integrity behavior remains available to quality and production checks.

## Answer

Replaced the terse publication note with a public status strip carrying truthful verified, stale-but-valid, and unavailable states. It exposes the latest successful update, résumé/GitHub source status, publication-check result, and manifest hash, plus a native keyboard-operable disclosure explaining the public pipeline without private operational details.

## Evidence

- Focused dossier publication and renderer tests: 16 passed.
- Lint and typecheck passed.
- Existing browser coverage continues to assert public verification text, manifest integrity, accessibility, no-script rendering, forced colors, reduced motion, responsive reflow, and 200% zoom behavior.
