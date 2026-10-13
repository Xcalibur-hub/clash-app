# Phase 11 Step 7 — Backend Security & Integration Certification

**Baseline:** `bc4d54c` (Step 6R: all 106 migrations committed and hash-verified on `clash-staging`).
**Worktree:** `C:/p117` on `feat/phase-11-backend-security-7`; local harness `C:/p117local`.
**Target:** `clash-staging` / `zrutlrhhvfcsmssjiijl` — **read-only** only in this step.
**Evidence:** `docs/evidence/phase-11-7/`.

## Verdict

**CONDITIONAL PASS — no confirmed P0/P1 vulnerability remains in the repository.** All security
suites that can run locally pass, the app matches the deployed schema, and the migration set is
certified. Staging **stays QUARANTINED**: hosted RLS/pgTAP execution, hosted read-only configuration
inventory and cron reactivation each still require their own authorization.

---

## 1. Required answers

| # | Question | Answer |
|---|---|---|
| 1 | Confirmed vulnerabilities? | **None open.** P1-3, P1-4 and P1-5 were re-audited end-to-end. P1-3 and P1-4 are already fixed in the migration set and now **pass their security suites**; P1-5 is **not vulnerable** (guards verified). Two non-security defects were confirmed and are recorded below. |
| 2 | Fixed and tested offline? | P1-3 (`critical_authorization_hardening`) and P1-4 (`h3_reputation_history_privacy`) were already fixed in-repo; both fixes are now **executed and green** (suites 087 / 088). Step 7 adds **no** schema change — adding none was the correct outcome. |
| 3 | Require product approval? | The lesson **preview/entitlement UX** (which lessons preview before purchase) and the **settlement trigger policy** (may any signed-in user settle any closed Clash?) are deliberate product choices documented in §2. No semantics were changed silently. |
| 4 | Did all pgTAP/RLS suites pass? | **77/89 files fully passed (3283 assertions).** The four security suites 085/087/088/089 **all PASS**. Two files have one environment-dependent assertion each; ten dblink concurrency suites could not run (dblink needs superuser). Nothing failed for an application-security reason. |
| 5 | Does the app match the deployed backend? | **Yes for every check executed.** typecheck, 539 unit + 24 editorial tests, Expo Doctor 18/18, Android bundle export, integration-static (106 migrations / 89 suites), Go vet/tests all pass against the 106-migration schema. Web export is unsupported (native-only `react-native-maps`). |
| 6 | Still requires hosted authorization? | Hosted read-only `verify-complete`; hosted RLS/pgTAP execution; hosted staging isolation re-check; cron reactivation; quarantine lift. |
| 7 | Can quarantine be lifted? | **Not yet.** Repository certification is complete, but hosted security validation and cron policy were not re-executed under authorization. |

## 2. Security findings

### P1-3 — Course lesson privacy → FIXED & VERIFIED (was a real leak)

`public.course_lessons.body_text` / `media_object_id` were previously readable by any client through
table-wide SELECT. `20261011053717_critical_authorization_hardening.sql` revokes table-wide and
column SELECT from `public`/`anon`/`authenticated`, re-grants only safe metadata columns
(`id, course_id, title, description, position, content_type, preview_allowed, access_type, status,
created_at, updated_at`), and fails closed on unexpected inherited privileges. Content is served only
through the entitlement-aware `course_lesson_card` / `course_lesson_media_target` RPCs.

Verified in the local DB by **`087_critical_authorization.sql` (PASS, 24 assertions)**: guest and even
entitled clients cannot read `body_text`/`media_object_id` directly or with `select *`; previews and
free lessons still return bodies; expired/revoked subscriptions lose content; catalogue counts and
navigation are preserved. **No regression to legitimate previews.**

### P1-4 — Reputation history privacy → APPLIED & VERIFIED

`20261011074540_h3_reputation_history_privacy.sql` (ledger order **103**, applied by the Step 6R
resume and hash-matched) removes the permissive `reputation events are readable by everyone` policy,
adds a **restrictive** owner gate `reputation history owner boundary`, revokes table-wide client
SELECT, grants only approved columns to `authenticated`, and blocks client INSERT so rewards cannot
be forged.

Verified by **`088_h3_reputation_privacy.sql` (PASS, 171 assertions)**: RLS enabled, no table- or
column-level bypass for `anon`/`authenticated`, no unapproved column grants, permissive policy gone
and restrictive gate present, client INSERT denied, `service_role` retained, and cross-user history
reads return 0 rows.

### P1-5 — Settlement RPC authorization → NOT VULNERABLE

`settle_clash(text)` / `settle_challenge(text)` are `SECURITY DEFINER`, owned by `postgres`, with
`set search_path = ''`. Reviewed definition (`clash_draw.sql`):

- `select … for update of c` locks the clash row → concurrent settlements serialize (no double award).
- Already-`settled` clashes return the stored verdict; the `verdicts` insert uses `on conflict … do nothing`.
- `closes_at > now()` raises → an early or unearned settlement is impossible.
- The result is computed **only from `judgements`** (juror ballots). There is no caller-supplied
  score, winner or amount, so even an authenticated caller cannot manipulate a result.
- Rewards go to jurors, never to the caller; amounts are fixed constants.

Grant matrix (measured): `anon` denied everywhere; `authenticated` may call `settle_clash`,
`settle_challenge`, `start_clash`, `resolve_arena_challenge`; **`settle_arena_room` (GROUP) and
`run_maintenance` are service-role only**. `087` (PASS) further proves a forged direct helper call is
denied and that a background settlement with no interactive identity succeeds, retries idempotently,
and creates no duplicate notifications.

**Product decision to document (no silent change):** `settle_clash`/`settle_challenge` are callable by
any authenticated user for any *closed* clash. This is treated as intended "settle on close" behaviour
— it is idempotent and awards nothing to the caller. If product wants ownership gating or a rate
limit, that is a new decision (register `P3-1`).

## 3. Full database security matrix (local, 106 migrations)

Full detail: `docs/evidence/phase-11-7/security-matrix-local.json`.

| Area | Result |
|---|---|
| `public` tables with RLS **disabled** | **0** |
| Tables with `anon` SELECT | 25 (all read-only public/reference data) |
| Tables with any `anon` write | **0** |
| Tables with client INSERT/UPDATE/DELETE | 3, all RLS-scoped to the owner (`comment_upvotes`, `comments`, `takes`) |
| `SECURITY DEFINER` functions | 413, **0 without `search_path=''`** |
| Definer functions executable by `anon` | 116 (public read RPCs that self-authorize; no escalation found) |
| Storage buckets | exactly 2 — `public-media` public, `private-media` private |
| `storage.objects` policies | 5 (public read, own-namespace insert, own read/update/delete) |
| Creator subscription entitlements | enforced in the lesson card/media RPCs (087 PASS) |
| Advertiser attribution / commission | definer-only, no client write path; static checks PASS |
| Blocks, mutes, moderation authorization | ownership predicates + RLS (061/062 suites PASS) |
| Reputation, voting, reaction, settlement abuse | 088/087 PASS; reward writes are definer/service-role only |
| Service-role-only operations | `settle_arena_room`, `run_maintenance`, editorial/queue sweeps — confirmed service-role only |

## 4. pgTAP / RLS suite execution (disposable local Supabase)

Full detail: `docs/evidence/phase-11-7/pgtap-local-summary.json`.

The local CLI applies migration files verbatim, and **three committed migrations carry a UTF-8 BOM**
(`ef bb bf`) that PostgreSQL rejects (`42601`) — so `supabase db reset` cannot succeed from a fresh
clone (see `P2-1`). To run the suite honestly, the harness applied the **reviewed, BOM-stripped
compatibility artifacts** (the exact bytes migrated to hosted in Step 6R) into a disposable project:
106 migrations applied, ledger = 106 rows, buckets = 2.

| Result | Value |
|---|---|
| Files | **89** |
| Assertions | **3283** |
| Files fully passed | **77** |
| Security suites | **085 PASS · 087 PASS · 088 PASS · 089 PASS** |
| Assertion failures | 2 (both environment-dependent, below) |
| Not run | 10 dblink concurrency suites (below) |

**Assertion failures (not application defects).**

1. `001_media_storage.sql` #23 "cannot delete storage objects via direct SQL" — *wanted an exception*.
   The local pinned `storage-api:v1.26.5` does not install the `protect_delete` trigger that newer
   storage releases add, so the direct DELETE was filtered by RLS (0 rows) instead of raising. The
   application policy still blocks the delete. **Environment/version parity → `P2-2`.**
2. `066_arena_interest_preferences.sql` #20 "returning users migrated without forced onboarding" —
   the assertion requires a `arena_interest_preferences` row for a non-fixture user, but
   `20261008134000` backfills `select id,true from auth.users` at *migration time* and a fresh DB has
   zero users then, so the assertion is vacuous locally. **Test precondition → `P3-2`.**

**Not run (10 files):** `053, 055, 057, 059, 067, 071, 073, 076, 078, 080`. Each opens independent TCP
sessions through `dblink`; `dblink` is not a trusted extension and the local `postgres` role is
deliberately non-superuser, so `create extension dblink` fails and the concurrency sessions cannot be
established. These are contention suites, not RLS/policy suites. **`P2-3`.**


## 5. Application / backend contract validation

Full detail: `docs/evidence/phase-11-7/app-contract-summary.json`. Each check reports independently.

| Check | Result | Detail |
|---|---|---|
| `tsc --noEmit` (app) | **PASS** | exit 0, no diagnostics |
| `typecheck:editorial` (edge fns) | **PASS** | exit 0 |
| lint | **NOT RUN** | no lint script/config exists in the repo |
| Expo Doctor | **PASS** | 18/18 |
| `expo export --platform android` | **PASS** | Hermes bundle 9.76 MB + metadata |
| `expo export --platform web` | **FAIL** | `react-native-maps` imports native-only RN internals; web is not a supported target for this native app |
| `test:unit` (app logic) | **PASS** | 539 / 539 |
| `test:editorial` | **PASS** | 24 / 24 |
| `integration-static-check.cjs` | **PASS** | 9 / 9 (106 migrations, 89 suites) |
| `reputation-privacy-check.cjs` | **PASS** | 19 pass |
| `clash-visibility-check.cjs` | **PASS** | 26 pass |
| `staging-isolation-check.cjs` | **PASS** | 16 pass |
| `go vet ./...` | **PASS** | hosted-staging |
| `go test ./...` | **PASS** | includes the 6 new `verify-complete` tests |
| Arena / Vault / World / Auth / Notifications / Profiles RPC + type parity | **PASS** | covered by typecheck + 539 unit tests + integration-static against the 106-migration schema |
| Auth/token config vs local stack | **PASS** | local GoTrue issued tokens; app config uses `EXPO_PUBLIC_SUPABASE_URL` (no secrets in bundle) |
| Storage access (buckets/policies/RPCs) | **PASS** | 001/087 suites + live bundle checks (bucket contract verified) |
| Realtime publication/subscription vs running stack | **NOT RUN** | no client subscription harness was executed; local DB only |
| Missing backend functionality | none found | every RPC referenced by the app resolves in the 106-migration schema |

## 6. Post-deployment verification tooling (new)

`tools/hosted-staging/verify_complete.go` adds a read-only **`verify-complete`** mode, kept strictly
separate from the 43-migration recovery `investigate` mode. It requires and verifies:

1. exactly **106** ledger rows; names, versions, order and statement hashes against the frozen artifacts;
2. expected migrated objects (106/103/H3/H2/H1 final state);
3. managed `pgcrypto` 1.3 prerequisite and required available extensions;
4. exact storage bucket inventory (`public-media` public, `private-media` private);
5. no unexpected schemas / configuration drift and a healthy managed inventory (managed + publication);
6. exactly one `clash-maintenance` job, **inactive**.

It exits **0** only when the complete expected state is verified and writes
`verify-complete.json` evidence. Offline verification (register `P2-4` removed this gap):

| Offline check | Result |
|---|---|
| `gofmt` (changed files) | clean |
| `go vet ./...` | PASS |
| `go test ./...` | PASS (6 new tests incl. happy path, short ledger, missing objects, active cron, stale manifest, cross-mode authorization) |

Hosted use is **NOT RUN** and needs separate authorization:
`hosted-staging --mode verify-complete --authorize verify-complete:zrutlrhhvfcsmssjiijl --config <nonsecret config>`.


## 7. Consolidated issue register (P0 / P1 / P2 / P3)

| ID | Sev | Issue | Status | Owner / next |
|---|---|---|---|---|
| P1-3 | P1 | `course_lessons` body/media readable by clients | **FIXED** (`20261011053717`); verified by 087 PASS | closed offline |
| P1-4 | P1 | Reputation history readable by all | **FIXED** (`20261011074540`, order 103); verified by 088 PASS | closed offline |
| P1-5 | P1 | Settlement RPC authorization | **NOT VULNERABLE**; guards + grants verified; 087 PASS | product decision on trigger scope (`P3-1`) |
| P2-1 | P2 | **Local tooling:** 3 committed migrations carry a UTF-8 BOM (`ef bb bf`); `supabase db reset` / `supabase test db` fail from a fresh clone (`42601`). Hosted is unaffected because the artifact pipeline strips it | **CONFIRMED, open** | fix the local pipeline (see §7a); do **not** edit migration bytes (would break frozen hashes) |
| P2-2 | P2 | `001` #23 depends on the storage-api `protect_delete` trigger, absent in the locally pinned `storage-api:v1.26.5` | **CONFIRMED, env parity** | pin a newer storage-api in the local harness, or make the assertion version-aware |
| P2-3 | P2 | 10 dblink concurrency suites cannot run locally (dblink not trusted; local `postgres` non-superuser) | **CONFIRMED, env limitation** | provide a superuser/trusted-dblink test path or run these on hosted under authorization |
| P2-4 | P2 | No post-deployment verifier existed for the complete state | **FIXED** | `verify_complete.go` + 6 offline tests (this step) |
| P3-1 | P3 | Any authenticated user may settle any *closed* Clash (`settle_clash`/`settle_challenge`) | **ACCEPTED (documented)** | product: add ownership gating or rate limit if desired |
| P3-2 | P3 | `066` #20 is vacuous on a fresh DB (backfill needs pre-existing users) | **ACCEPTED (test precondition)** | optionally gate/seed for the migration-time-user case |
| P3-3 | P3 | 116 `SECURITY DEFINER` functions are `anon`-executable | **ACCEPTED by design** | periodic sampling to confirm each keeps self-authorization |
| P3-4 | P3 | Web export unsupported (native-only `react-native-maps`) | **ACCEPTED** | document web as unsupported; Android bundle verified |

**P0 register: empty.**

### 7a. Reviewable offline fix prepared for P2-1
No migration bytes were modified (that would invalidate the frozen manifest `5c39f97c…` and the
hosted hashes). The safe fix is tooling-only: run the pgTAP/RLS suite against the reviewed artifact
migrations, which this step performed via a disposable project directory built from the existing
reviewed generator. Recommended follow-up (not committed here to avoid unreviewed scope): have
`scripts/supabase-reset.mjs` materialise the BOM-stripped artifacts and point the CLI at that
directory, then document it in `supabase/config.toml`.

## 8. Consolidated release-readiness checklist

| Gate | State |
|---|---|
| 106 migrations committed on hosted | ✅ (Step 6R, hash-verified) |
| Repository security suites (085/087/088/089) | ✅ PASS |
| Full pgTAP/RLS local run | ⚠️ 77/89 files, 2 env-dependent assertions, 10 dblink suites not run |
| App typecheck / unit / editorial / integration-static | ✅ PASS |
| Expo Doctor | ✅ PASS (18/18) |
| Android bundle export | ✅ PASS |
| Go tooling vet + tests (incl. `verify-complete`) | ✅ PASS |
| Web export | ❌ unsupported (native-only module) |
| Hosted read-only `verify-complete` | ⛔ requires authorization |
| Hosted RLS/pgTAP execution | ⛔ requires authorization |
| Cron reactivation | ⛔ requires authorization |
| Quarantine lift | ⛔ not yet — hosted security validation outstanding |
| Production readiness | ⛔ **not claimed** |

## 9. Evidence index

- `docs/evidence/phase-11-7/pgtap-local-summary.json`
- `docs/evidence/phase-11-7/security-matrix-local.json`
- `docs/evidence/phase-11-7/app-contract-summary.json`
- `docs/evidence/phase-11-7/verify-complete-offline.json`
- `tools/hosted-staging/verify_complete.go`, `tools/hosted-staging/verify_complete_test.go`

## 10. Handoff / draft PR

- Branch `feat/phase-11-backend-security-7` (from `bc4d54c`): this report, the evidence set, and the
  new `verify-complete` mode with offline tests.
- **Recommended next authorization (single, read-only):** run `verify-complete` against
  `zrutlrhhvfcsmssjiijl` to certify the hosted complete state.
- **Then, separately:** hosted security/RLS validation (sterile-target writes), staging isolation
  re-check, and only then cron reactivation and quarantine lift.
- No hosted writes, no RLS change, no cron change, no fixtures and no deployment were performed.

