# Arena Groups — visual integration candidate

Baseline: `76bf0bf0d3c54e8ec92311dcd878dd2ef8711bae` (`preview/arena-live-ui`). Approved contract read from `design/arena-hybrid-integration-plan-20261016`, commit `958e0d6e1944b6720672b9509233fab50cd0e66e`.

## Contracts retained

- Arena embeds `GroupDiscovery`; existing `/arena/crews` uses the same UI with Popular/Rising/New server sorting and cursor pagination.
- `/arena/crews/create` retains its validation, creation RPC and slug destination. `/arena/crews/[slug]` retains the canonical Crew identity, permission-aware membership/following and public member profile routes.
- Joined means actual membership. Followed groups are listed separately. One competitive Crew per account remains server-enforced; pending requests, invite-only membership and membership in another Crew have disabled join actions.
- Profile membership mutations use the existing RPCs; non-owner members can confirm leaving through the existing leave operation. Owner transfer/leave is not invented.
- Counts, specialties, descriptions, images and Crew records are exclusively parsed server values. No online counts or fabricated activity.
- Requests are cancelled on blur/filter/account changes; viewer-keyed snapshots immediately hide prior-account data. Profile loads/mutations/member paging reject stale generation/identity responses.

## Capability boundaries

The reviewed Crew API has no Crew-scoped discussion feed, pins, or live canonical-duel association. Those sections are omitted, not populated with mocks or mislabeled global content. Invitation RPCs exist, but no new recipient picker or invitation-management route is invented. Existing invitation/notification handling is unchanged.

## Validation — 16 October 2026

- `npm.cmd run test:unit`: 500 passed, zero failed/skipped.
- `node --test components/arena/groups/GroupDiscovery.test.cjs`: 8 passed. Controlled rendering/transport of the actual component: guest gating, Joined/Following distinction, stale account/filter results, pagination, error/retry, blur and server cursor/sort.
- `node --experimental-strip-types --test utils/arenaCrews.test.ts utils/arenaCrewIdentity.test.ts`: 15 passed (subset of the full suite), including single-membership and restricted join-state contracts.
- Expo Doctor 1.20.4: 18/18 checks passed.
- Full TypeScript: FAIL, exit 2, existing `components/arena/TakeFeedItem.tsx:587` font weight `"750"`. That file is unchanged from the baseline and outside Groups ownership. No Groups diagnostics were reported. An initial worktree-relative PostHog import error was resolved by linking existing installed node_modules into the worktree; no dependencies were installed or changed.
- Initial sandbox/PowerShell execution failures were handled with approved filesystem access and `npm.cmd`; no system execution policy was changed.
- `git diff --check`: passed.
- No lint script is configured. Android/device, backend/RLS and visual screenshot review were not performed in this implementation session. Mocked component tests do not establish native behavior or database security.

No database, native project, theme global, main Arena composition, Live duel or World files were modified. No merge/deployment. Further integration requires correction of the baseline TypeScript issue by its owner and real device review.
