# Beta Storage Admission Remediation (F2 Storage Closure — 2026-11-11)

> [!IMPORTANT]
> **Status: FIXED IN TESTED DISPOSABLE CANDIDATES — NOT DEPLOYED.**
> F1 (`take` identity), **F2 (`57` deferred RPC signatures, `6` participant write fences, AND Storage upload/signed-upload/UPSERT/overwrite admission)**, and F3 (`start_clash` retirement) are now fixed and verified in isolated disposable environments. F4 remains **PARTIAL**: fixtures are excluded from raw/RPC reads, while public visibility of historical expired Takes remains an unresolved product decision and was preserved untouched. No production, staging, or accepted (`clash-live-b4-20261101`) changes were deployed.

---

## 1. Effective Storage Permission Audit (Every Applicable Path)

Inspected baseline catalog (`storage.objects` triggers/policies/indexes in `.expo/beta-security-remediation-20261111/schema-clone-input.sql` and read-only accepted DB `clash-live-b4-20261101-db`), `supabase/migrations/20260926150000_media_storage.sql`, `supabase/seeds/00_storage_bootstrap.sql`, `services/mediaService.ts`, Edge functions (`vault-media-access`, `course-lesson-media-access`, `arena-assist-media-access`), and `public.ecr.aws/supabase/storage-api:v1.79.36` server internals.

| Path / Vector | Root Cause Before Remediation | New Boundary Enforced |
|---|---|---|
| **Direct authenticated `POST /object/:bucket/:path`** | Legacy `INSERT` policy `"media upload into own namespace"` checked only `name ~~ (my_profile_id() \|\| '/%')`: ignored `public.media_objects`, left `owner`/`owner_id` unvalidated, and treated `_` in `u_...` profile IDs as a SQL `LIKE` single-character wildcard. | Dropped legacy `INSERT` policy. New `"admitted media upload only"` policy + `BEFORE INSERT` trigger [`guard_beta_storage_upload()`](../../../supabase/migrations/20261111130000_beta_storage_admission.sql#L12-L91) require exact `bucket_id`, matching `visibility`, exact `storage_path`, `owner = auth.uid()`, `(owner_id IS NULL OR owner_id = auth.uid()::text)`, `status = 'uploading'`, `deleted_at IS NULL`, `created_at > clock_timestamp() - interval '24 hours'`. |
| **Storage `UPDATE`, `PUT`, `x-upsert: true`, `move`, `copy`** | Legacy `UPDATE` policy `"own media objects are updatable"` allowed `owner = auth.uid()` updates with no `bucket_id`, `name`, or `status` lock, enabling overwrites and moves after upload completion or deletion. | Dropped `"own media objects are updatable"`. `BEFORE UPDATE` branch of `beta_storage_upload_admission` rejects `tg_op = 'UPDATE'` with SQLSTATE `42501` for `anon`, `authenticated`, and signed-upload `service_role` contexts. `POST /object/copy` hits `INSERT` admission and fails without an active `'uploading'` row. |
| **Signed upload URLs (`upload/sign`) & signed TUS** | `storage-api:v1.79.36` executes `PUT /object/upload/sign/...` and signed TUS writes via `.asSuperUser()` (`role = 'service_role'`, `BYPASSRLS = true`) while setting `storage.operation` to `'storage.object.upload_signed'` / `'storage.tus.upload.*_signed'`. RLS alone would allow stale/replayed or upserted writes if `media_objects` later moved to `'ready'`, `'failed'`, `'deleted'`, or `>24h` while the HMAC token remained valid. | `guard_beta_storage_upload()` inspects `storage.operation` alongside `role` and enforces identical admission (`status = 'uploading'`, `deleted_at IS NULL`, `<24h`, owner/bucket/path match, `tg_op = 'UPDATE'` denied) on signed `service_role` uploads despite `BYPASSRLS = true`. Issuance (`POST /object/upload/sign/...`) also runs `storage.can_insert_object` under `authenticated` RLS + trigger, refusing minting for unadmitted, completed, or `x-upsert: true` existing objects. |
| **Existing authorized upload completion** | `create_media_upload` remains deferred behind `assert_release_admission('media')` (`F2`), while previously authorized `'uploading'` rows (`<24h`, non-deleted) must still upload bytes and call `complete_media_upload` / `fail_media_upload`. | Valid `'uploading'` rows pass both direct `POST`, signed upload `PUT`, TUS `POST`+`PATCH`, and subsequent `complete_media_upload`. |
| **Sidecar paths / legacy poster uploads** | `services/mediaService.ts:149-159` (`uploadVideoPoster`, already gated by `create_media_upload` deferral) uploaded `<owner>/<id>/<id>_poster.jpg` with `upsert: true` after completion without its own `media_objects` row. | Unadmitted sidecar paths (`_poster.jpg`) and post-completion overwrites are rejected cleanly. Existing historical poster objects remain readable and owner-deletable. Future video-poster re-enablement will require its own `media_objects` admission row. |
| **Cross-owner, cross-bucket, deleted, expired records** | `_` wildcard collision, spoofed `owner`/`owner_id`, mismatched `bucket_id` vs `visibility`, `'failed'`/`'deleted'` statuses, `deleted_at IS NOT NULL`, and expired `uploading` rows (`>24h`) lacked complete enforcement on `storage.objects`. | All rejected with `42501`. RLS uses `public.my_profile_id()` (avoiding restricted `profiles.auth_user_id` column SELECT under `authenticated`); `SECURITY DEFINER` trigger joins `public.profiles` safely on `p.auth_user_id = v_actor_uid` and locks `m` `FOR SHARE`. |
| **Private reads, public reads, owner delete, `service_role`** | Needed to remain intact across existing direct/Edge flows (`vault-media-access`, `course-lesson-media-access`, `arena-assist-media-access`). | Preserved `"media objects are publicly readable"`, `"own media objects are readable"`, `"own media objects are deletable"`, signed read URLs (`POST /object/sign/...`), and non-signed `service_role` writers (`upload-vault-fixture-media.mjs`, admin seed/housekeeping). |

### Ownership & Privilege Prerequisites Found

1. **Managed Supabase table ownership (`storage.objects`):** On both `clash-live-b4-20261101-db` and `supabase_db_clash-6f5-meet-cancel`, `storage.objects` has `relowner = supabase_storage_admin`, `postgres` has `rolsuper = false` without `supabase_storage_admin` membership, and `supabase_admin` has `rolsuper = true`. Running `DROP POLICY` / `CREATE TRIGGER` on `storage.objects` as unprivileged `postgres` fails loudly rather than silently succeeding; deployment must run as `supabase_admin` (or superuser).
2. **Column ACL constraint:** `authenticated` cannot `SELECT public.profiles.auth_user_id` (`060_profile_read_security.sql`), so client `INSERT` RLS delegates profile lookup to `public.my_profile_id()`.

---

## 2. Candidate Changes & Exact Artifacts

| Artifact | Purpose | SHA-256 |
|---|---|---|
| [`supabase/migrations/20261111130000_beta_storage_admission.sql`](../../../supabase/migrations/20261111130000_beta_storage_admission.sql) | Transactional F2 Storage trigger `guard_beta_storage_upload()` (`FOR SHARE OF m`), `"admitted media upload only"` policy, drops legacy `INSERT`/`UPDATE` policies | `a8453f05fe45bd9ce6c0f46400647c43ff094edaeb92c9f1c7cdeb2d711617d4` |
| [`supabase/seeds/00_storage_bootstrap.sql`](../../../supabase/seeds/00_storage_bootstrap.sql) | Keeps local `supabase:reset` bucket/policy seed synchronized with hardened admission policy | `08067e9f7ad70da9e4346d7f445d418ee85c1ab40f813ab39b785ce9110e8e73` |
| [`supabase/tests/beta_storage_admission.pgtap.sql`](../../../supabase/tests/beta_storage_admission.pgtap.sql) | `33`-assertion pgTAP regression suite for direct, upsert, cross-owner, `_` wildcard, expiry, signed-upload/TUS bypass, delete/replay, and `service_role` | `be648ae096fbcd9ec13cb949b12bb707ca6a548a22629e9c8222591218f8319e` |
| [`scripts/beta-security-remediation.test.cjs`](../../../scripts/beta-security-remediation.test.cjs) | Updated forward-migration inventory and Storage boundary / bootstrap assertions | `09d23eee3257a266f4dfa552cf275730e5f6ac6e4d41b1c91d4bb515d84486ed` |
| [`scripts/beta-security-audit.test.cjs`](../../../scripts/beta-security-audit.test.cjs) | Updated static migration contract assertions to include `20261111130000_beta_storage_admission.sql` | `64e925b96a93ae8162c7edab5e4240f5b3c8d56f2e89118a8b2b2c170a478655` |

Prerequisite / sibling migration chain verified in exact order:
- `supabase/migrations/20261028120000_meet_cancel_search.sql` (`cf2de9c73e3ea2aba0bd779c3a1a8b4aeaf6de6e5dec1f3feeadb48d6fc61cf0`)
- `supabase/migrations/20261028210000_meet_new_admission_gate.sql` (`3366665f47779b22efa5562464726bea4d7397d5a3d21b49427739a62672ec40`)
- `supabase/migrations/20261111120000_beta_take_identity.sql` (`50fa500f84fb40eaca0af7274c29c4abd3189ca7ea0403e746c7c803acbc36ad`)
- `supabase/migrations/20261111120100_beta_deferred_admission.sql` (`45b43de767e86a7b1697f4a69751c421a661f7e6b5501932bbc54527b0cbecd2`)
- `supabase/migrations/20261111120130_beta_admission_write_fences.sql` (`d4ebca1d73022708352f94a181448ee7fcd116eab6817de2c4d1ef6b5d7a2da2`)
- `supabase/migrations/20261111120200_beta_legacy_visibility.sql` (`2ba4cf9d18e94e47c6ca686d3053f5b80420c9e7f47631d57f14935467dd6ccc`)

---

## 3. Separate Test & Verification Results

### A. Disposable PostgreSQL + Catalog Verification (`public.ecr.aws/supabase/postgres:17.11.0.004`, `system_identifier = 7706820486069211172`)

- **Clean clone + sequential migration application:** **PASS** — applied all 7 migrations + `00_storage_bootstrap.sql` as `supabase_admin` (superuser; `postgres` remained `rolsuper = false` and `storage.objects` owned by `supabase_storage_admin`).
- **Pre-prerequisite rollback negative check:** Attempting `20261111130000` before `20261111120000..120200` as `postgres` aborted at the top prerequisite guard (`ERROR: Beta prerequisites missing before Storage admission guard`) and rolled back atomically with zero partial function/policy changes. (Running `DROP POLICY` on `storage.objects` as `postgres` once prerequisites exist was separately identified as blocked by `relowner = supabase_storage_admin` and requires `supabase_admin` deployment privilege.)
- **Catalog / ACL parity vs `candidate-catalog-after.json`:** `488` public functions (`487` from prior candidate + added `guard_beta_storage_upload()` with `anon = false, authenticated = false, service_role = false`); `486/487` matched byte-for-byte in definition and ACLs (`world_fuzz_location` differed only by `extensions.geography` schema-qualification formatting in `pg_get_functiondef`), `storage.objects` has exactly `4` policies (`admitted media upload only`, `media objects are publicly readable`, `own media objects are deletable`, `own media objects are readable`) and `3` triggers (`beta_storage_upload_admission`, `protect_objects_delete`, `update_objects_updated_at`).
- **Strict pgTAP / SQL Suites (`14/14` files, `601/601` assertions — PASS):**
  - `beta_storage_admission.pgtap.sql`: `33/33`
  - `beta_security_remediation.pgtap.sql`: `45/45`
  - `beta_deferred_admission.pgtap.sql`: `141/141`
  - `056_arena_challenge_lifecycle.sql`: `82/82`
  - `062_arena_content_visibility.sql`: `20/20`
  - `064_arena_discovery_states.sql`: `15/15`
  - `065_arena_interest_catalogue.sql`: `9/9`
  - `066_arena_interest_preferences.sql`: `20/20`
  - `068_arena_interest_ranking.sql`: `16/16`
  - `069_arena_challenge_inbox.sql`: `39/39`
  - `082_explore_security_contract.sql`: `61/61`
  - `meet_new_admission_gate.pgtap.sql`: `50/50`
  - `meet_new_admission_roles.pgtap.sql`: `55/55`
  - `091_private_assist_media_target.sql`: `15/15`
- **Legacy pre-deferral SQL creation suites (expected F2/F3 behavior preserved — PARTIAL by design):**
  - `001_media_storage.sql`: `23/25` passed; assertions `10–11` (`create_media_upload`) failed as expected with `42501: New media admission is deferred for the text-debate beta`.
  - `011_vault_creator.sql`: `36` passed, `44` failed (`23` explicit `assert_release_admission` deferrals hit on Vault creation).
  - `023_comment_media.sql`: `12` passed, `18` failed (`8` explicit F2/F3 comment media / `start_clash` retirement errors).

### B. Genuine Storage HTTP Runtime Tests (`public.ecr.aws/supabase/storage-api:v1.79.36` — `39/39` PASS)

Executed live HTTP requests against disposable `storage-api:v1.79.36` (`127.0.0.1:55726`) backed by disposable PostgreSQL (`55725`):
- **Direct `POST` negatives (`10/10` -> HTTP `400` / payload `403 AccessDenied`):** `anon`, unadmitted own-namespace, `_poster.jpg` sidecar, `uXf4a01` vs `u_f4a01` `LIKE` wildcard collision, cross-owner active upload, cross-bucket/visibility mismatch, `failed`, `deleted`, `deleted_at IS NOT NULL`, `>24h` stale `uploading`.
- **Legitimate direct upload + completion (`2/2`):** Active `'uploading'` `POST` -> `200`, `complete_media_upload` -> `'ready'`.
- **Overwrite / `PUT` / `x-upsert` / `move` / `copy` negatives (`6/6`):** `PUT` completed (`400`/`403`), `POST` `x-upsert: true` completed (`400`/`403`), `POST` `x-upsert: true` while row still `'uploading'` (`400`/`403 new row violates row-level security policy`), `POST /object/move` (`400`/`404 NoSuchKey` via removed `UPDATE` policy), `POST /object/copy` (`400`/`403`).
- **Signed upload URLs (`8/8`):** `POST /object/upload/sign` denied on unadmitted/completed/existing-with-`x-upsert: true`; issued `200` on active `'uploading'` -> `PUT /object/upload/sign?...` succeeded `200`; duplicate `x-upsert` denied (`409 KeyAlreadyExists`); pre-issued valid HMAC upload tokens marked `'ready'` or `'deleted'` before `PUT` were **blocked `403 AccessDenied`** by `guard_beta_storage_upload()` despite `asSuperUser()` / `BYPASSRLS = true`.
- **TUS resumable uploads (`4/4`):** Unadmitted `POST /upload/resumable` -> `403`; active `'uploading'` `POST` (`201`) -> `PATCH` (`204`); post-`ready` replay `POST` with `x-upsert: true` -> `403`.
- **HTTP concurrent race (`1/1`):** Parallel `POST` + `POST x-upsert: true` on same active path yielded `[200, 400]` and exactly `1` row in `storage.objects`.
- **Reads, deletions, and trusted `service_role` (`6/6`):** Public read `200` (exact 68-byte PNG), private authenticated read isolated (`anon: 400`, `bob: 400`, `alice: 200`), private signed read URL (`bob: 400`, `alice: 200` -> fetch `200`), owner `DELETE` (`bob: 400`, `alice: 200`), post-delete upload replay denied (`400`), trusted `service_role` `POST /object/public-media/devfx/service-role-smoke.png` -> `200`.

### C. Concurrent PostgreSQL Multi-Session Lock Races (`3/3` PASS)

Each race verified genuine blocking via `pg_stat_activity` + `pg_blocking_pids`:
1. `race-delete-before-auth-insert`: `delete_media` blocked `authenticated` `INSERT INTO storage.objects`; after commit `guard_beta_storage_upload()` re-evaluated via EPQ and raised `42501` (`media_status = deleted`, `storage_count = 0`).
2. `race-delete-before-signed-upload`: `delete_media` blocked `service_role` (`storage.object.upload_signed`) `INSERT`; after commit trigger raised `42501` (`media_status = deleted`, `storage_count = 0`).
3. `race-inflight-insert-blocks-delete`: `INSERT INTO storage.objects` holding `FOR SHARE OF m` genuinely blocked concurrent `delete_media` (`FOR NO KEY UPDATE`) until `INSERT` committed.

### D. Repository & Automated Baselines (After Final Edits — PASS)

- `npm run typecheck` (`tsc --noEmit`): **PASS** (exit `0`)
- `npm test`: **PASS (`1,542/1,542`: `835` unit / `202` suites + `642` script checks + `65` release-scope; `0` failed, `0` skipped)**
- `npm run test:duel`: **PASS (`29/29`)**
- `npm run test:duel:render`: **PASS (`22/22` component render + `28/28` community result; mocked/bridged renders, not native geometry)**
- `npm run test:arena-navigation`: **PASS (`11/11`; hook bridge, not device verification)**
- `npm run test:arena-acceptance`: **PASS (`206/206`)**
- `node scripts/eas-archive-check.cjs`: **PASS (`eas-cli 24.8.0`, `723` files, unchanged `inventorySha256 = 9e04ddf401830f68372235748dfc3374f1bb9f1fa275d2bfad4d623cb062a86f`)**

### E. Deliberately NOT TESTED in This Task

- Live Supabase Edge Runtime invocation of `vault-media-access`, `course-lesson-media-access`, and `arena-assist-media-access` (**NOT TESTED** as Deno containers; code audited and underlying `service_role` `POST /object/sign/...` + `GET` Storage flow verified `200` on `storage-api:v1.79.36`).
- Staging/production database migration execution (**NOT AUTHORIZED / NOT EXECUTED**).

---

## 4. Preservation Verification

- **Accepted isolated DB (`clash-live-b4-20261101-db`, `7703813712308420644`):** Verified read-only post-run: `takes=9`, `arena_challenges=9`, `clashes=9`, `arena_rooms=9`, `judgements=7`, `verdicts=3`, `media_objects=0`, `storage.objects=0`; original 5 `storage.objects` policies and 2 triggers untouched.
- **Preserved Codex disposable container (`clash-beta-security-20261111`):** Left untouched (`Up`).
- **Ephemeral F2 Storage containers/network (`clash-f2-storage-*`):** Torn down cleanly (`0` remaining containers/networks/ports; ephemeral env credential scratch removed).
- **Git index:** Clean (`git diff --cached --name-only` empty; all pre-existing dirty files preserved).
