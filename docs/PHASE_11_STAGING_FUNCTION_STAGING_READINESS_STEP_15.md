# Phase 11 Step 15 — Authenticated Edge Function Staging Readiness

**Baseline:** `419aa44` (Step 14). **Target:** `clash-staging` / `zrutlrhhvfcsmssjiijl`.
**Evidence:** `docs/evidence/phase-11-15/`.
**Mode:** readiness + tooling. No user, fixture, upload, Auth change, function deploy or database write.

## Verdict

**Readiness confirmed and the immediately-runnable half is GREEN: 26/26 hosted probes pass, 9/9 offline
tests pass.** The authenticated half is **fully specified and tooled**, and correctly **refuses to run**
until hosted fixtures are separately authorized.

**Staging remains QUARANTINED; `clash-maintenance` remains inactive.**

---

## 1. Step 14 review (evidence ↔ report)

Reviewed `419aa44`: `deployment-evidence.json`, `independent-verification.json`, `step14-summary.json`,
`database-unchanged-verification.json`.

| Reported | Evidence | Match |
|---|---|---|
| 4 functions deployed | inventory lists exactly the four | ✅ |
| `verify_jwt=true` for each | `verify_jwt: true` ×4, version 1 | ✅ |
| 4 × 401 negative-auth | smoke `401, 401, 401, 401` | ✅ |
| Nothing else changed | ledger 106, cron `active=false` + quiescent, 0 users, 0 objects | ✅ |
| Result | `DEPLOYED AND VERIFIED` | ✅ |

**No discrepancies.** The deployed inventory in the evidence is exactly the inventory reported, and the
report's database/cron claims are backed by the attached read-only verification.

## 2. Audited contracts of the four deployed functions

| | `vault-media-access` | `course-lesson-media-access` | `creator-ai` | `digital-creator` |
|---|---|---|---|---|
| Method | POST (+OPTIONS) | POST (+OPTIONS) | POST (+OPTIONS) | POST (+OPTIONS) |
| Body | `{dropId}` ≤64 | `{lessonId}` ≤64 | `{conversationId,message}` | `{messageId,…}` |
| Auth | platform `verify_jwt=true` **and** `auth.getUser()` | same | same | same |
| Entitlement decided by | `vault_drop_media_target` RPC | `course_lesson_media_target` RPC | `creator_ai_begin_turn` RPC | `start_digital_creator_session` RPC |
| Service role used for | signed URL (120 s) | signed URL (120 s) | recording the reply | provider call + provenance |
| Denial contract | 403 with no Storage call | 403 | 403/404/429 by SQLSTATE | 403/404/409 by SQLSTATE |
| CORS | `*`, POST/OPTIONS, JSON | same | same | same |
| Optional provider key | none | none | `CREATOR_AI_API_KEY` | `DIGITAL_CREATOR_API_KEY` |

All four are **thin transports**: the caller is resolved server-side from the verified JWT and every
authorization decision is made in Postgres — so "authenticated readiness" is really about proving the
*RPC* decisions through the function.

## 3. Immediately runnable suite — PASS 26/26

`node scripts/staging-function-e2e.mjs --suite no-fixture` → **26 requests, 26 passed, 0 failed.**

| Probe (×4 functions) | Result |
|---|---|
| POST with no `Authorization` | **401** |
| POST with a malformed bearer token | **401** |
| POST with a well-formed JWT signed with a wrong secret | **401** |
| POST with an expired JWT | **401** |
| GET without auth | **401** |
| OPTIONS preflight | **200** with `access-control-allow-origin: *` |
| Response body sanitization | bodies are 58–79 bytes, **no** token, env name, stack frame or source path |
| `arena-editorial` (not deployed) | **404** |
| `arena-gifs` (not deployed) | **404** |

Every probe is refused at the gateway before any function code runs, so this suite has **no hosted
side effects** (verified by the absence of users/objects and by the fact that all requests are
rejected). The two 404s independently confirm that only the four authorized functions exist.

## 4. Authenticated test plan (fixture-gated)

11 entries covering all seven required areas. All are refused today: the harness reports
`NEEDS_FIXTURE_AUTHORIZATION` and exits without sending an authenticated request.

| # | Area | Test | Fixtures required | Expected result |
|---|---|---|---|---|
| 1 | Valid JWT + caller identity | `auth.sign_in`, `auth.refresh` | one hosted test account | session issued; Postgres resolves the caller from the JWT; stale/rotated token rejected |
| 2 | Media access with entitlement | `vault.entitled_media` | account A + a private drop owned by A with a `private-media` object | 200 + signed URL, `expiresIn=120` |
| 3 | Unauthorized + cross-user denial | `vault.unauthorized_media`, `vault.cross_user_access` | account B; A's drop | 403 with no Storage call; a foreign id and a non-existent id must be **indistinguishable** (no existence oracle) |
| 4 | Course lesson entitlement | `lesson.entitled`, `lesson.denied` | a course, a `subscriber` lesson, an active subscription, plus an expired/revoked variant | entitled → signed URL; otherwise 403; `body_text` still not readable by table SELECT (H2) |
| 5 | Creator AI / Digital Creator with providers absent | `creator_ai.no_provider`, `digital_creator.no_provider` | a creator, a conversation, a digital profile, one authorized stored reply | explicit "provider not configured" / "not connected"; **never** a fabricated answer; no arbitrary text rendered |
| 6 | Input validation, error handling, sanitization | `input_validation`, `response_sanitization` | account A | wrong types / oversize ids / missing fields → 400, never 500; no tokens, env names, stack frames or storage paths in any body |
| 7 | RLS and tenant isolation | `rls_tenant_isolation` | two accounts, one private row each | A cannot observe B through any function response; direct table reads denied |

## 5. Minimum permissions needed for the fixture phase

**Two separate authorizations**, neither implied by this step:

1. **Hosted fixture authorization** (the only new hosted write scope):
   - create **two** `auth.users` accounts with deterministic, prefixed identities (e.g.
     `staging-e2e-a@…`, `staging-e2e-b@…`) and a documented teardown;
   - insert the minimum rows: one private-media object + `media_objects` row + a Vault drop for A;
     one course + `subscriber` lesson + an active (and one expired) `vault_subscriptions` row; one
     creator with a conversation and one stored reply;
   - upload at most two small test objects to `private-media` (and delete them afterwards).
   Required DB role: the same `postgres` role already used for the reviewed read-only checks; the
   writes are the fixtures themselves, not DDL.
2. **Harness credential inputs** (non-secret + owner-supplied):
   `STAGING_SUPABASE_URL` (must equal the staging URL), `STAGING_ANON_KEY` (a public client key), and
   either a test account's email+password or a short-lived access token — supplied through the
   environment or a Credential Manager entry, never in chat or the repository — plus the explicit
   gate `STAGING_FIXTURES_AUTHORIZATION=fixtures:zrutlrhhvfcsmssjiijl`.

No provider keys are required: areas 5 explicitly assert behaviour **without** them. If provider keys
are later added, they are optional-feature scope and need their own decision.

## 6. Tooling delivered

| File | Purpose |
|---|---|
| `scripts/staging-function-e2e.mjs` | reusable harness: host guard (staging only), `no-fixture` suite, 11-entry authenticated plan, fixture-authorization gate, sanitized evidence writer |
| `scripts/staging-function-e2e.test.mjs` | 9 offline tests: host guard, JWT crafting, rejection classification, leak detection, CORS, summarizer, plan completeness (areas 1–7), fixture gate |

Offline result: **9/9 pass**. The harness refuses any host other than `zrutlrhhvfcsmssjiijl.supabase.co`
and never creates a user, uploads media or writes to the database.

## 7. Remaining blockers

| Blocker | Type | Notes |
|---|---|---|
| Hosted test accounts + fixtures | **authorization** | required for all 11 authenticated tests; teardown documented |
| `STAGING_ANON_KEY` (public) + test-account credential | **inputs** | from the operator/Dashboard; never in chat or the repo |
| Hosted Auth configuration | **evidence** | `OPS-1` from Step 11 still open (redirect/Site URL, provider status) |
| `arena-editorial` run secret | authorization | needed before that function can be deployed/tested |
| `arena-gifs` decision | product | optional feature; `TENOR_API_KEY` |
| Cron reactivation, quarantine lift | authorization | separate steps |

## 8. Boundaries observed

Only unauthenticated, gateway-rejected HTTP probes were sent to staging (26 requests, **zero** accepted,
zero fixtures, zero uploads, zero database writes); the Management API was read for inventory only. No
hosted user created, no Auth setting changed, no function deployed, no secret created or read. Cron stays
inactive and staging stays QUARANTINED.

## Evidence index (`docs/evidence/phase-11-15/`)

| File | Content |
|---|---|
| `no-fixture-suite-evidence.json` | 26/26 probe results with statuses and sanitization detail |
| `authenticated-plan-evidence.json` | the 11-entry plan + prerequisites (`runnable: false`) |
| `step15-summary.json` | Step 14 review verdict, suite summary, offline test counts |

## Handoff

Branch `feat/phase-11-backend-security-7`. Draft PR:
`https://github.com/Xcalibur-hub/clash-app/pull/new/feat/phase-11-backend-security-7`.

**Recommended next step:** authorize the hosted fixture set in §5, then run
`node scripts/staging-function-e2e.mjs --suite authenticated` with the four environment inputs — all 11
tests are already implemented and will execute unchanged. Production is explicitly out of scope.

