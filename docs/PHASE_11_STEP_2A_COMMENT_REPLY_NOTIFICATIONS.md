# Phase 11 Step 2A — Comment & reply notifications

**Status:** implemented (additive SQL + pgTAP)  
**Branch:** `feat/phase-11-comment-reply-notifications`  
**Migration:** `supabase/migrations/20261011120000_comment_reply_notifications.sql`  
**Tests:** `supabase/tests/084_comment_reply_notifications.sql`

## Implementation notes

- Writers live in an `AFTER INSERT` trigger on `public.comments` (`comments_notify_arena` → `notify_arena_comment`), so they run only after a successful insert and roll back with failed `create_comment` transactions.
- Payload matches the existing Activity tab: `kind` ∈ {`comment`,`reply`}, `entity_type = take`, `entity_id = take_id` (opens `/take/{id}`). No comment text is stored.
- Deterministic ids (`comment_<commentId>`, `reply_<commentId>`) with `ON CONFLICT DO NOTHING` prevent duplicates.
- `arena_comment_notify` is not executable by `anon` / `authenticated`; clients still cannot `INSERT` into `notifications`.
- Authorization for commenting (blocks, parents, rate limits, media) remains in existing BEFORE triggers / `create_comment` — unchanged.

## Recipient matrix

| Action | Recipient | Kind | Skipped when |
| --- | --- | --- | --- |
| Top-level comment on Take | Take owner | `comment` | Actor is Take owner; either-direction block |
| Nested reply | Parent comment author | `reply` | Actor is parent author; either-direction block |
| Nested reply | Take owner (if ≠ parent) | `comment` | Actor is Take owner; either-direction block; same person as parent (already got `reply`) |

Convention for “distinct Take owner on a reply” mirrors Vault community replies (notify thread owner + parent when distinct).

## UI

No UI redesign. Existing `NotificationRow` copy and `notifications.tsx` routing already handle `comment` / `reply`.

## Validation (local, no DB reset)

| Command | Result |
| --- | --- |
| Applied migration via `docker exec … psql` (additive) | OK |
| `npx supabase test db supabase/tests/084_comment_reply_notifications.sql` | **PASS** — 25 tests |
| `npx supabase test db supabase/tests/023_comment_media.sql` | **PASS** — 30 tests (regression) |
| `npm run typecheck` | pass |
| `npm run test:unit` | **464** pass |
| `npx expo-doctor` | 18/18 |

**Limitations:** Full `supabase test db` suite was not re-run here; Phase 11 audit noted concurrency files failing on local role credentials — that is infrastructure, not this change. Migration must still be applied to each environment through the normal migration path before production use.
