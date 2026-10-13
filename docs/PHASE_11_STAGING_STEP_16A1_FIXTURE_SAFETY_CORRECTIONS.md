# Phase 11 Step 16A.1 — Fixture Safety Corrections

**Baseline:** `8ec6679` (Step 16A). **Target:** `clash-staging` / `zrutlrhhvfcsmssjiijl`.
**Mode:** corrections only. **No hosted writes, users, uploads, Auth changes, deploys or cron changes.**

## Verdict

All nine findings are addressed. Six of them were **real defects in the Step 16A code, not just
documentation gaps** — including one that would have failed a hosted run *mid-way* (after the
accounts already existed) and one that had a genuine **fail-open** primary safety gate.

**Staging remains QUARANTINED; `clash-maintenance` remains inactive; nothing was created.**

| # | Finding | Outcome |
|---|---|---|
| 1 | Credentials not separated | **Fixed** — two distinct secrets, enforced, never logged |
| 2 | Count parsing could fail open | **Fixed** — strict parse; a defect that made **all** writes gate on unreadable state |
| 3 | Teardown incomplete | **Fixed** — trigger- and RPC-written rows now covered; still id-scoped |
| 4 | `auth.users` insert cannot sign in | **Fixed** — Auth Admin API is now the default; SQL fallback adds `auth.identities`; sign-in is probed before any write |
| 5 | Signed-URL claim overstated | **Fixed** — claim limited to URL signing, stated in code and evidence |
| 6 | SQL not verified against schema | **Fixed** — one constraint **violation** found and corrected; a conformance test now checks every value |
| 7 | No regression tests | **Added** — 16 new offline tests, one per corrected condition |
| 8 | Credential/URL exposure in evidence | **Fixed** — central redactor applied to every console and evidence path |
| 9 | Revised inventory, cleanup, readiness | This document |

## 1. Defects found in the Step 16A code (and their corrections)

| ID | Defect | Impact had it run | Correction |
|---|---|---|---|
| D1 | `avatar_provider = 'fixture-not-connected'` — the column is `check (avatar_provider ~ '^[a-z0-9_]{1,40}$')` | The 12th fixture write would have **failed after both accounts existed**, leaving a partial setup | `'fixture_not_connected'`; a conformance test now asserts the slug pattern |
| D2 | `parseCounts` returned `{}` on malformed output and `validateCounts` read missing keys as `0` | The pre-flight would have read **unreadable state as "everything is zero"** and written into it | Strict `{ ok, counts \| reason }`; malformed, NaN, negative, extra, short and empty all refuse |
| D3 | Teardown omitted `notifications` | Our own subscription insert fires `notify_vault_subscription` → a row left behind | `notifications` added (recipient/actor = our two new profiles) and asserted in the post-create inventory |
| D4 | `insert into auth.users` with no `auth.identities` row, and no sign-in check | Password sign-in would fail, and nothing would notice until the suite ran | Admin API by default; SQL fallback writes both rows; a **sign-in probe runs before any fixture write** |
| D5 | One `STAGING_FIXTURE_PASSWORD` served as both the DB password and the test-user password, and `psql` was given **no** password at all | The runner could not have authenticated (psql would have blocked on an interactive prompt) | `STAGING_DB_PASSWORD` → `PGPASSWORD`; `STAGING_FIXTURE_USER_PASSWORD` → `\getenv`; equality is **refused** |
| D6 | Profile ids were derived from a uid that a real Auth API assigns | Teardown could not address the rows it had created | Accounts are *resolved* (by email, or from the API) before teardown |
| D7 | `parseResolved` called an undefined helper | A crash on the teardown path | Inlined derivation; the function is now unit-tested |
| D8 | No redaction on any output path | A signed URL, JWT or PAT in a detail string would have been **persisted into evidence** | One central `redactForEvidence` (leaf module) used by every writer, asserted by tests |

## 2. Credentials, separated and never echoed

| Purpose | Variable | How it is used |
|---|---|---|
| Database connection | `STAGING_DB_PASSWORD` | Only ever as the child process's `PGPASSWORD`. Never in argv, never in SQL, never printed |
| Fixture accounts | `STAGING_FIXTURE_USER_PASSWORD` | Only inside SQL as `:'fixture_user_password'`, injected by psql `\getenv` |
| Auth Admin API | `STAGING_SERVICE_ROLE_KEY` | Bearer header over TLS only; 404-on-delete tolerated |
| TLS trust | `STAGING_DB_CA_PATH` | `PGSSLROOTCERT` with `PGSSLMODE=verify-full` |

* The two passwords **must differ**; reusing one is refused before any connection.
* Evidence records `presents`/`separated`/`custody` **booleans and labels only** — never a value.
* Verified live: with dummy secrets and no authorization, the CLI stopped with
  `REFUSING: …CREATE_AUTHORIZATION…`, `separated: true`, exit 1, and **neither secret appeared** in
  the output or the evidence file.
* No credentials at all → stop naming all three missing inputs. Same secret twice →
  `REFUSING: …must differ`. Both exit non-zero with no connection attempted.
* Recommendation for the real run: source the DB password from Credential Manager
  (`STAGING_DB_PASSWORD_CUSTODIAN=credential-manager`) and rotate both after teardown.


## 3. Revised exact-write inventory

**Accounts (2)** via the supported `POST /auth/v1/admin/users` — GoTrue writes `auth.users` and
`auth.identities` itself. Only if that path is unavailable does the SQL fallback run, writing
`auth.users` + `auth.identities` + the profile marker together.

**Fixture rows: 13 statements**, all `on conflict do nothing`.

| # | Table | Rows | Notes |
|---|---|---|---|
| 1–2 | `auth.users` + `auth.identities` (fallback only) | 2 + 2 | never both paths at once |
| 3–4 | `public.profiles` (UPDATE, marker handle) | 2 | set on the Admin API path too |
| 5 | `public.media_objects` | 1 | `private-media`, `ready`, **metadata only — no object bytes** |
| 6 | `public.creator_vaults` | 1 | |
| 7 | `public.vault_drops` | 1 | subscriber-only, published, `expires_at = published_at + 7 days` |
| 8 | `public.vault_subscriptions` | 1 | B, `active`, window lapsed (`'active', now() - interval '30 days'`) |
| 9 | `public.creator_courses` | 1 | `subscriber`, published |
| 10 | `public.course_lessons` | 1 | entitled, `body_text` = the H2 probe string |
| 11 | `public.course_lessons` | 1 | draft, position 2 |
| 12 | `public.creator_ai_profiles` | 1 | enabled, `FREE`, `avatar_provider='fixture_not_connected'`, voice on, avatar off |
| 13 | `public.creator_ai_conversations` | 1 | creator A ↔ fan B |
| 14 | `public.creator_ai_messages` | 1 | seeded `user` row |

**Written by triggers and RPCs during the run** (counted, and cleaned up):

| Source | Rows | Reason |
|---|---|---|
| `notify_vault_subscription` trigger (fires on our subscription insert) | ≥ 1 `notifications` | recipient = vault creator (A) |
| `notify_vault_drop_published` trigger | 0 at create time | covered anyway |
| `assert_rate_limit` inside the RPCs | ≤ 40 `rate_limit_events` | actor = caller |
| `start_digital_creator_session` | 1 `digital_creator_sessions` | asserted **0 before the suite runs** |
| `creator_ai_begin_turn` | +1 `creator_ai_messages` per call | inside our conversation |

**Maximum counts** — hard ceilings, and every column must read **0** before a create:

```json
{ "auth_users": 2, "identities": 2, "profiles": 2, "notifications": 4, "rate_limit_events": 40,
  "creator_vaults": 1, "vault_drops": 1, "media_objects": 1, "vault_subscriptions": 1,
  "creator_courses": 1, "course_lessons": 2, "creator_ai_profiles": 1, "creator_ai_conversations": 1,
  "creator_ai_messages": 1, "digital_creator_sessions": 1 }
```

The **"clean prefix" precondition is new in 16A.1** and is what makes cleanup provably safe: if any of
these rows already exist, the run cannot prove they belong to it, so it stops rather than deleting or
overwriting. Post-create verification then requires the *exact* predicted inventory.

## 4. Bounded cleanup plan

15 statements, children first, each addressed by a run-derived id:

```
notifications        where recipient_id in (A,B) or actor_id in (A,B)
rate_limit_events    where actor_id in (A,B)
digital_creator_sessions / creator_ai_profiles  where creator_id = A
creator_ai_messages  where conversation_id = '<prefix>_conv'
creator_ai_conversations where id = '<prefix>_conv'
course_lessons / creator_courses  where course_id / id = '<prefix>_course'
vault_subscriptions / vault_drops / creator_vaults / media_objects  where id = '<prefix>_…'
profiles             where id in (A,B)
auth.identities / auth.users        where user_id / id in (A,B)
```

* **Cannot touch unrelated data** — including rows that merely share a creator or actor id. The only
  creator/actor values used are the two brand-new profiles; a test asserts that *every* literal in
  *every* teardown statement is one of this run's ids, and `assertScoped` refuses any `DELETE`/`UPDATE`
  not addressed by one (e.g. `where creator_id is not null` is rejected outright).
* **Partial-setup safe**: accounts are resolved before teardown, so an account that never got created
  contributes no statements while the run-id rows are still removed.
* **Idempotent**: repeated without effect; the admin-API delete tolerates 404.
* **Never automatic**: a failure stops, keeps the manifest and evidence, and sets
  `cleanup_available: true`. Evidence is removed only by an explicit `--purge-evidence` on a teardown,
  and only for the three fixed filenames (never the manifest).


## 5. What the media test proves — and what it does not

`CLAIMS.media` (fixture module) and `SUITE_CLAIMS.media` (suite) both state the limit in code, and this
report repeats it:

> **URL SIGNING ONLY**: an entitled caller receives a correctly scoped, 120 s signed URL.
> It does **NOT** prove byte retrieval, because no object bytes are uploaded.

Consequences are explicit: a 200 carrying `bucket`, `mediaKind` and `expiresIn=120` is asserted, and a
`signing_failed` (500) would fail the check; but "the client can download and decode the bytes" remains
proven only by the earlier local Storage tests. A genuine 1-byte upload would need its own bounded
authorization (upload + delete, ≤ 1 KiB, one object) and is **not** implemented here.

## 6. Verification

**59 offline tests, all passing** (no network, no database):

| Suite | Tests | Result |
|---|---|---|
| `scripts/staging-fixtures.test.mjs` | 22 | 22/22 |
| `scripts/staging-function-e2e-authenticated.test.mjs` | 9 | 9/9 |
| `scripts/staging-function-e2e.test.mjs` | 9 | 9/9 |
| `scripts/staging-functions-deploy.test.mjs` | 19 | 19/19 |

Each corrected condition has its own test: credential separation and equality refusal; secret
non-exposure (values, PATs, JWTs, signed-URL tokens, emails, UUIDs) in the runner and across a whole
suite run; malformed/short/negative/extra/empty inventory; dirty prefix; over-ceiling; unreadable
inventory stopping before any write; the trigger-written notification being required; a partial failure
issuing no `DELETE`; teardown requiring the cleanup token; `auth.identities` being written; the Admin
API being used over TLS and verified by an actual sign-in; and every generated value matching its real
column constraint.

CLI gates verified live (exit codes and messages): no token → refuse before connecting; no credentials
→ refuse naming all three; equal secrets → refuse; no prefix → refuse; wrong project → refuse.

## 7. Remaining risks

| Risk | Assessment |
|---|---|
| The `notifications >= 1` expectation is a *prediction* read from `20260928030000_vault_notifications.sql` | Verified offline; if the hosted trigger behaves differently, `create` fails **closed** with a readable message and `cleanup_available: true` |
| A fresh prefix is now required per run | By design — a dirty prefix is refused. Choose `p11f_<8 chars>` per attempt |
| The Admin API needs the service-role key | Without it the SQL fallback runs (including `auth.identities`) and is still verified by the sign-in probe |
| `psql` must exist locally | The runner refuses to start without separated credentials, so this fails closed |
| Hosted email sign-in (`OPS-1`) | Still the main practical risk — the probe turns it from a mid-suite surprise into a pre-write refusal |
| Provider keys | The `digital-creator` VOICE assertion depends on `DIGITAL_CREATOR_API_KEY` being absent; adding one changes that assertion by design |

## 8. Not done, by instruction

No hosted account, row, object, Auth setting, secret, function deploy or cron change; no authenticated
request was sent; no object bytes uploaded. Quarantine intact; production untouched.

**Stopping here for review and separate authorization.**
