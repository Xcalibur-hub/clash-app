# Arena Hall of Fame — publication contract (proposal)

Status: **Design only. Not deployed.** The current `app/arena/hall-of-fame.tsx` is an account-scoped settled-Clash preview, **not** a public ranking or permanent archive.

## Invariants

1. A successful `settle_clash` / `verdicts` record proves a verdict exists; it does **not** qualify the Clash for Hall of Fame.
2. Hall of Fame publication needs an explicit server-side eligibility decision and an auditable promotion action. The mobile app must never declare winners, grades, or rankings.
3. No runtime fixtures, removed/moderated content, deleted content, or content hidden by the canonical Arena visibility rules should be published or returned to viewers.
4. BLIND Clash identities must remain hidden until an authoritative server reveal. A snapshot must not bypass reveal state.
5. Define retention, creator opt-out, takedown, and jurisdiction/privacy policy before persisting text or media beyond the Arena's 24-hour lifecycle.
6. Never publish private ballots, profiles' internal IDs, reputation-ledger entries, raw viewer locations, or moderation details.
7. Public read surfaces must honor block/mute safety where relevant and use bounded pagination, stable ordering, and rate limits.

## Proposed server-owned model (not created)

- `hall_of_fame_entries`: opaque ID, Clash ID, status (candidate/published/revoked), publish time, editorial reason and version, authorized publisher, review metadata.
- `hall_of_fame_snapshots` only after a retention decision: content/media specifically approved for archiving and capable of takedown. No direct storage URL copied by client.
- One server-owned `list_hall_of_fame` RPC: published entries only, sanitized fields, deterministic cursor, explicit visibility and reveal gates.
- Revocation must hide entries immediately even if an archived copy remains for internal audit.
- Rankings, if introduced, must have documented scoring criteria and tie handling; the current UI's `ARCHIVE / 01` is an order label, not a rank.

## Implementation gates

1. Agree on permanent content retention/consent and whether winner selection is automated or curated.
2. Add additive local-only migration, RLS/grants and pgTAP tests for anonymous/authenticated access, blocked users, deleted/removed Takes, fixtures, Blind Clashes, revocation and duplicate publication.
3. Add typed service parser and client pagination/error states; remove the per-card `fetchClashViewForTake` fan-out.
4. Validate against local Supabase and Android development build. Keep hosted staging project quarantined; no hosted push without explicit authorization.

This contract intentionally does not backfill or publish old Clashes.
