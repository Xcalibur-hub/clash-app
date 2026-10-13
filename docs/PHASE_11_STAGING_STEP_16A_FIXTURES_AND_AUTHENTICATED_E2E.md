# Phase 11 Step 16A — Controlled Fixture and Authenticated E2E Implementation

**Baseline:** `fa6350a` (Step 15 review). **Target:** `clash-staging` / `zrutlrhhvfcsmssjiijl`.
**Mode:** implementation only. **No hosted writes were performed. Nothing was created, uploaded, altered or deployed.**

## Verdict

The Step 15 finding is correct and is now fixed: the eleven authenticated cases were a
**declaration** (`AUTHENTICATED_PLAN` + an always-`STOPPED` branch); they are now
**executable assertions** with fixtures, gated behind three separate authorizations.

**Hosted staging was not touched.** Staging remains **QUARANTINED**; `clash-maintenance` remains **inactive**.

## 1. What Step 15 actually did, and what changed

| | Step 15 (`fa6350a`) | Step 16A |
|---|---|---|
| The 11 cases | an array describing intent | `CHECKS` in `scripts/staging-function-e2e-authenticated.mjs`, 11 wired assertions |
| `--suite authenticated` | always `STOPPED` for any input | **runs** when every gate passes; otherwise stops naming the exact missing gates |
| Fixtures | described in prose | `scripts/staging-fixtures.mjs`: 14 enumerated, idempotent, prefix-scoped writes |
| Cleanup | described in prose | 13 prefix-scoped, ordered, re-runnable `DELETE`s, separable from evidence |
| Failure-path proof | none | 16 new offline tests over mocked HTTP and a mocked SQL runner |

Proof the wiring is real (not another declaration): the offline tests assert
`CHECK_ORDER === AUTHENTICATED_PLAN.map(p => p.id)`, that all eleven pass against a faithful
mock, and that each of six sabotage cases turns its own check red.

## 2. Contracts inspected (nothing invented)

| Source | What was taken from it |
|---|---|
| `20260928000000_vault_foundation.sql` | `creator_vaults`, `vault_drops` (incl. `vault_drops_window`: `expires_at = published_at + 7 days`), `vault_subscriptions` (+ `current_period_end > started_at`), `can_access_vault_drop`, `vault_drop_media_target` |
| `20260926150000_media_storage.sql` | `media_objects` columns, the `bucket`/`visibility` pairing check, `media_kind ∈ {image,video}` |
| `20261004170000_vault_commerce.sql` | `creator_courses`, `course_lessons`, `can_access_course_lesson`, `course_lesson_media_target` |
| `20261005110000_creator_ai.sql` | `creator_ai_profiles/conversations/messages`, `creator_ai_viewer_can_access` (the `FREE` branch, the `enabled` gate) |
| `20261005110100_creator_ai_rpcs.sql` | `creator_ai_begin_turn(text,text)` and its SQLSTATEs |
| `20261005120000_digital_creator.sql` | `digital_creator_sessions`, the voice/consent CHECK |
| `20261005120100_digital_creator_rpcs.sql` | `start_digital_creator_session(text,text)`, the `p_viewer = p_creator_id` refusal, the VOICE/AVATAR connection guards |
| `20260926130000_auth_profile_trigger.sql` | `handle_new_user`: `profiles.id = 'u_' \|\| auth-uid` — what makes fixture ids deterministic |
| `supabase/functions/*/index.ts` | the exact response bodies and statuses asserted below |

**Response contracts asserted** (from the deployed sources, not guessed):

| Function | Asserted success | Asserted refusal |
|---|---|---|
| `vault-media-access` | 200 `{url,bucket:'private-media',mediaKind:'image',expiresIn:120}` | 403 `{error:'forbidden'}`, 400 `{error:'bad_request'}` |
| `course-lesson-media-access` | 200, same shape, **no `body_text`** | 403, 400 |
| `creator-ai` | 200 `{status:'unconfigured',message:'AI provider not configured'}` | 400 (oversize message) |
| `digital-creator` | 200 `{status:'unconfigured',mode:'VOICE'}` | 409 `{status:'error',error:'session_rejected'}` for the disconnected AVATAR |

## 3. The exact proposed hosted writes

14 statements, each `on conflict do nothing` / `where not exists`, or a prefix-scoped
`UPDATE` (`buildFixtureSql`). **No bytes are uploaded**: a signed URL is minted from
`media_objects` metadata, so the Storage contract is exercised without adding an object.
Authorising a real object as well would be one extra write.

| # | Table | Rows | Why |
|---|---|---|---|
| 1–2 | `auth.users` | 2 | account A (owner/creator) and B (outsider) |
| 3–4 | `public.profiles` (UPDATE) | 2 | ownership marker on the trigger-created rows |
| 5 | `public.media_objects` | 1 | `private-media`, `ready`, path `p11f_x…/drop-1.jpg` (metadata only) |
| 6 | `public.creator_vaults` | 1 | A's vault |
| 7 | `public.vault_drops` | 1 | subscriber-only, published, inside the 7-day window |
| 8 | `public.vault_subscriptions` | 1 | B, status `active`, window already lapsed → expired entitlement |
| 9 | `public.creator_courses` | 1 | `subscriber`, published |
| 10 | `public.course_lessons` | 1 | entitled lesson, `body_text` = the H2 probe string |
| 11 | `public.course_lessons` | 1 | draft lesson (second denial flavour) |
| 12 | `public.creator_ai_profiles` | 1 | enabled, `FREE`, VOICE flags on, AVATAR deliberately disconnected |
| 13 | `public.creator_ai_conversations` | 1 | creator A ↔ fan B |
| 14 | `public.creator_ai_messages` | 1 | one seeded `user` row (RLS control) |

**Caused by the run itself** (also covered by teardown): `creator_ai_messages` (+1 per
`creator-ai` call), `digital_creator_sessions` (+1, immediately `ENDED` by the function),
`rate_limit_events` (+1 per throttled action).

**Maximum fixture counts** — checked *before* any write; exceeding one aborts:

```json
{ "auth_users": 2, "profiles": 2, "creator_vaults": 1, "vault_drops": 1, "media_objects": 1,
  "vault_subscriptions": 1, "creator_courses": 1, "course_lessons": 2, "creator_ai_profiles": 1,
  "creator_ai_conversations": 1, "creator_ai_messages": 1, "digital_creator_sessions": 1 }
```

## 4. Cleanup plan

* **Bounded**: every `DELETE` is addressed by `md5(prefix:…)`-derived ids, so it cannot reach
  pre-existing data. `assertScoped` re-checks every emitted statement and refuses any unscoped
  or unbounded write (including a bare `delete from t`).
* **Ordered**: children before parents, ending with `auth.users` (whose cascade is the backstop).
* **Idempotent**: re-running is a no-op; the same statements can be re-issued safely.
* **Available after a partial failure**: teardown needs only the prefix, not the manifest. A
  failure never triggers automatic cleanup — the run stops, reports `failed_statement_index`,
  `cleanup_available: true`, `evidence_preserved: true`, and leaves the decision to a
  separately authorized `--action teardown`.
* **Evidence preserved by default**; `--purge-evidence` is only accepted alongside a teardown
  and can only remove the three fixed filenames in `EVIDENCE_FILES`.

## 5. Authorization model — three separate grants

| Grant | Env var | Value | Enables |
|---|---|---|---|
| Create fixtures | `STAGING_FIXTURES_CREATE_AUTHORIZATION` | `fixture-create:zrutlrhhvfcsmssjiijl` | the 14 writes |
| Execute the suite | `STAGING_FIXTURES_EXECUTE_AUTHORIZATION` | `fixture-execute:zrutlrhhvfcsmssjiijl` | the 11 hosted assertions |
| Cleanup | `STAGING_FIXTURES_CLEANUP_AUTHORIZATION` | `fixture-cleanup:zrutlrhhvfcsmssjiijl` | the 13 deletes |

Each action checks **only** its own token: the create token cannot run a teardown and vice
versa (asserted offline). An action with no token **does not open a connection at all**.
Further gates on every action: `STAGING_SUPABASE_URL` must equal
`https://zrutlrhhvfcsmssjiijl.supabase.co`, `STAGING_FIXTURE_PREFIX` must match
`^p11f_[a-z0-9]{8}$`, and (for a real connection) `STAGING_DB_TARGET=zrutlrhhvfcsmssjiijl`
plus the pinned CA.



## 6. Fail-closed evidence (executed, not asserted by hand)

| Probe | Result |
|---|---|
| `--suite authenticated`, no env | `STOPPED`, **exit 1**, all five missing gates named, **zero HTTP** |
| mock run with a missing gate (7 variants) | `stopped: true`, `results: []`, fetch call count **0** |
| `fixtures --action create`, no env | `REFUSING: STAGING_FIXTURE_PREFIX…`, exit 2 |
| create with prefix+URL but no token | `REFUSING: …CREATE_AUTHORIZATION…`, exit 1, **no connection** |
| teardown holding only the create token | `REFUSING: …CLEANUP_AUTHORIZATION…`, exit 1 |
| wrong project URL | `REFUSING: STAGING_SUPABASE_URL must be …`, exit 2 |
| unexpected DB state (`auth_users=3`) | `REFUSING: unexpected database state`, before any write |
| mid-setup failure (statement 4 of 14) | `executed: 3`, no `DELETE` issued, evidence kept |

## 7. Tests: 44 offline, all green

| Suite | Tests | Result |
|---|---|---|
| `scripts/staging-function-e2e.test.mjs` | 9 | 9/9 |
| `scripts/staging-function-e2e-authenticated.test.mjs` (new) | 6 | 6/6 |
| `scripts/staging-fixtures.test.mjs` (new) | 10 | 10/10 |
| `scripts/staging-functions-deploy.test.mjs` | 19 | 19/19 |

Three real defects were found by these tests and fixed: a `ctx.fetchImpl` reference error that
made every function call fail, an `assertScoped` ordering bug that mis-labelled an unbounded
delete, and a **circular-import deadlock** (the harness dynamically imported a module that
imported back into the harness — Node exits 13 on an unsettled top-level await). The host
definition now lives in a leaf module, `scripts/staging-host.mjs`.

## 8. Risks and limits

| Risk | Assessment |
|---|---|
| No object bytes uploaded | The signing contract is proven; rendering/decoding is not. Object-bytes behaviour was already covered by the local storage tests. |
| Fixture password from the environment | Never in argv or in the SQL text (`\getenv`); live for the duration of a run; rotate after teardown. |
| `psql` must exist locally | The runner fails closed if it does not; the reviewed Go executor remains the alternative path. |
| `digital-creator` VOICE → 200 `unconfigured` | Depends on the fixture flags **and** `DIGITAL_CREATOR_API_KEY` being absent. If a provider key is added the assertion changes — deliberately, since it asserts the honest branch. |
| Assertions track deployed code | A function redeploy requires re-running the suite; the sources reviewed are the current `HEAD`. |
| Rate limits | `creator_ai_begin_turn` is throttled (20/h, 60/day); repeat runs are bounded by the counts ceiling and by `assert_rate_limit`'s own refusal. |
| Hosted Auth configuration (`OPS-1`) | Still open from Step 11 — password sign-in works only if email sign-in is enabled. **The main practical risk to the fixture run.** |
| Staging state | Unchanged: QUARANTINED, 0 users, 0 objects, ledger 106, cron inactive. |

## 9. Not done, by instruction

No hosted user, row, object, Auth setting, secret, function deploy or cron change. No
authenticated request was sent anywhere. Quarantine intact; production untouched.

## 10. The authorized run, when you grant it

```powershell
$env:STAGING_FIXTURES_CREATE_AUTHORIZATION   = 'fixture-create:zrutlrhhvfcsmssjiijl'
$env:STAGING_FIXTURES_EXECUTE_AUTHORIZATION  = 'fixture-execute:zrutlrhhvfcsmssjiijl'
$env:STAGING_FIXTURES_CLEANUP_AUTHORIZATION  = 'fixture-cleanup:zrutlrhhvfcsmssjiijl'
$env:STAGING_SUPABASE_URL   = 'https://zrutlrhhvfcsmssjiijl.supabase.co'
$env:STAGING_DB_TARGET      = 'zrutlrhhvfcsmssjiijl'   # plus STAGING_DB_CA_PATH, STAGING_FIXTURE_PASSWORD
$env:STAGING_FIXTURE_PREFIX = 'p11f_<8 chars>'
$env:STAGING_ANON_KEY       = '<public anon key>'      # public, but never committed
# 1 create   2 run   3 clean up   4 verify empty
node scripts/staging-fixtures.mjs --action create --evidence-dir .expo/fixtures/run1
node scripts/staging-function-e2e.mjs --suite authenticated --manifest <manifest.json> --evidence-dir .expo/e2e/run1
node scripts/staging-fixtures.mjs --action teardown --evidence-dir .expo/fixtures/run1
node scripts/staging-fixtures.mjs --action status  --evidence-dir .expo/fixtures/run1   # expect ABSENT
```

**Stopping here for review and separate authorization.**
