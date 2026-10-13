# Phase 11 Step 12 — Automated Staging Deployment Preparation

**Baseline:** `cbe805c`. **Worktree:** `C:/p117` (`feat/phase-11-backend-security-7`).
**Target:** `clash-staging` / `zrutlrhhvfcsmssjiijl` (Tokyo, `ap-northeast-1`).
**Mode:** **PREPARATION ONLY.** Nothing was deployed; no hosted setting, secret, function, cron job,
fixture or quarantine state was changed.

## Verdict

All six Edge Functions are **deployment-ready**; four of them need **no operator secret**. An automated,
fail-closed deployment workflow now exists (dry-run by default). The only outstanding prerequisite is a
**staging-scoped access token** held by the operator; the workflow pauses and prints exactly how to
provide it.

**Staging remains QUARANTINED.** Edge Functions are currently **0 deployed** of **6 expected**.

---

## Part A — Six-function readiness matrix

All six follow the same reviewed pattern: the function is only a *transport*, and **Postgres decides**
authorization from the verified JWT. Each re-resolves the caller server-side, none trusts a body
identifier, and none returns upstream diagnostics.

| | `vault-media-access` | `course-lesson-media-access` | `creator-ai` | `digital-creator` | `arena-editorial` | `arena-gifs` |
|---|---|---|---|---|---|---|
| Body | `{dropId}` | `{lessonId}` | `{conversationId,message}` | `{messageId,…}` | worker tick | `{path,query,pos}` |
| Operator secrets | **none** | **none** | `CREATOR_AI_API_KEY`, `CREATOR_AI_BASE_URL`, `CREATOR_AI_MODEL` (optional) | `DIGITAL_CREATOR_API_KEY`, `DIGITAL_CREATOR_BASE_URL` (optional) | **`ARENA_EDITORIAL_RUN_SECRET`** (required, ≥32 chars) + `ARENA_AI_*` (optional) | `TENOR_API_KEY` (optional) |
| Platform-injected | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | same | same | same | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | same as first |
| Client init | anon client **as caller** (JWT kept) + separate service client | same | same | same | **service only**, via `fetch` to PostgREST RPCs | anon `…/auth/v1/user` verify + service RPC |
| JWT verification | platform `verify_jwt=true` **and** in-code `auth.getUser()` → 401 | same | same | same | **platform `verify_jwt=false` by design**; `x-editorial-secret` compared in code | platform `verify_jwt=true` **and** `/auth/v1/user` → 401 |
| Internal authorization | `vault_drop_media_target` decides; no row ⇒ 403 | `course_lesson_media_target` decides | `creator_ai_begin_turn` enforces entitlement/blocks/ownership/rate limits | `start_digital_creator_session` decides who may open a session | RPC error codes mapped (`42501/P0001/P0006/22023/40001`) | `claim_arena_gif_request` budget ⇒ 429/403 |
| Service-role dependency | signing only (`createSignedUrl`, 120 s) | signing only (120 s) | records the reply via `creator_ai_finish_turn` | provider call + provenance write | all RPC calls; `p_auto` publication | GIF budget RPC only |
| CORS | `*`, `authorization, x-client-info, apikey, content-type`, POST/OPTIONS | same | same | same | JSON, `Cache-Control: no-store`, POST only | JSON, `Cache-Control: no-store`, POST only |
| External API | none | none | AI provider (optional) | avatar/voice provider (optional) | AI provider + RSS/JSON sources (optional) | `tenor.googleapis.com` (fixed host, `redirect:'error'`) |
| Runtime | Deno `Deno.serve`, `esm.sh/@supabase/supabase-js@2` | same | same | same | same | same |
| Expected responses | 200 signed URL; 400; 401; 403; 405; 500 | same shape | 200; 400/401/403/404/405/409/429/500/502 | 200; 400/401/403/404/405/409/429/500 | 200 stats; 401; 405; 503 | 200; 400; 401; 405; 429; 502; 503 |
| **Readiness** | ✅ no secret needed | ✅ no secret needed | ✅ AI degrades to "not configured" | ✅ degrades to "not connected" | ✅ needs the run secret to operate | ✅ 503 until `TENOR_API_KEY` is set |

### `arena-editorial` — the intentional exception (audited)

Platform JWT verification is disabled **on purpose**: the worker is not called by a user client, so
there is no user JWT to verify. Authentication is a shared secret instead:

- `authorized(provided, expected)` returns false when `expected` is missing, **shorter than 32
  characters**, absent from the request, or a different length; the comparison is a constant-time XOR
  accumulator with no early exit.
- Header `x-editorial-secret`; expected value from `ARENA_EDITORIAL_RUN_SECRET`. Missing/short secret ⇒
  every request 401s. The function also 503s without `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`.
- Even if the secret leaked, the worker can only drive the reviewed RPCs, cannot act as a user, and its
  publication path is bounded (mode, `maxAgeHours`, category allowlist, prompt/draft validators,
  forced human review for sensitive topics).
- **No authentication was weakened for deployment**: the workflow never passes `--no-verify-jwt`, and
  the JWT-exempt set is hard-checked to be exactly `['arena-editorial']`.

## Part B — Expo authentication findings

| Question | Finding |
|---|---|
| Configured URL scheme | Per-variant in `app.config.ts`: **`clash-staging`** for staging (dev `clash-dev`, prod `clash`); package `com.clash.v2.staging`; slug `clash-staging` |
| Email OTP: codes or magic links | **Numeric code.** `services/authService.ts`: `signInWithOtp({ email, options:{ shouldCreateUser:true } })` then `verifyOtp({ email, token, type:'email' })`; `app/auth.tsx` has explicit `'email' → 'code'` steps and the user types the code |
| OAuth redirects implemented? | **No.** No `signInWithOAuth`, `emailRedirectTo`, `makeRedirectUri` or `Linking.createURL` anywhere in `app/`, `services/` or `store/` |
| Correct staging callback URL | **None required today.** `services/supabaseClient.ts` keeps `detectSessionInUrl` **off** and documents deep-link auth as a later concern, so the app never consumes a redirect |
| Should `http://localhost:3000` remain a permitted dev URL? | **Yes, harmless.** It is only the GoTrue *Site URL* used inside email templates. Since the app verifies a typed code it is not load-bearing; replace it with a real staging URL only when deep links exist |
| Precise Auth settings required for staging | **None are required to ship the OTP flow.** Keep signups enabled and the email provider active (already the Supabase default). The redirect allowlist may stay empty until deep-link auth exists. **No hosted Auth change is proposed and none was made.** |

## Part C — Automated deployment tooling

Three new files (no secrets, no keys, reviewed and offline-tested):

| File | Role |
|---|---|
| `scripts/staging-functions.manifest.mjs` | single source of truth: project ref, per-function `verifyJwt`, required/optional secret **names**, external providers, degradation behaviour |
| `scripts/staging-functions-deploy.mjs` | the deployment workflow (dry-run by default; `--execute` to act) |
| `scripts/staging-functions-verify.mjs` | read-only verification + negative-auth smoke (`--smoke-only` needs no token) |

### How the workflow satisfies each requirement

| # | Requirement | Implementation |
|---|---|---|
| 1 | Validate the intended project ref | `assertProjectIdentity()` refuses unless `PROJECT_REF === 'zrutlrhhvfcsmssjiijl'`; the ref is passed to the CLI as `--project-ref` on every call |
| 2 | Verify commit and clean inputs | `assertCleanInputs()` refuses a dirty tree, captures `git rev-parse HEAD`/branch, and requires all six `index.ts` files to exist |
| 3 | Check secrets by presence only | `checkSecretNames()` runs `supabase secrets list -o json` and compares **names**; values are never requested, read or printed |
| 4 | Validate all six functions | manifest ↔ `supabase/config.toml` `verify_jwt` cross-check for every function, plus the JWT-exempt set assertion |
| 5 | Deploy only explicitly approved functions | `--only a,b` is mandatory; any name not in the manifest is refused |
| 6 | Preserve JWT settings | JWT policy comes **only** from `supabase/config.toml`; **`--no-verify-jwt` is never passed**, globally or per function; the exemption set is hard-checked |
| 7 | Verify deployed names/versions/config | `fetchDeployed()` re-reads `functions list -o json` and refuses on any missing function, unexpected function, or `verify_jwt` mismatch |
| 8 | Negative-auth smoke tests | unauthenticated `POST {}` to each function must return **401** (gateway for JWT-enforced; its own missing-secret check for `arena-editorial`) |
| 9 | Sanitized evidence | writes `deploy-evidence.json` (mode 0600) containing only refs, commit, function names, observed versions/JWT, statuses, timings — **no secret of any kind** |
| 10 | Stop immediately | any failure path exits non-zero with `result: "STOPPED"` and the exact reason; nothing is retried automatically |

### Credential handling (minimum setup, then pause for the operator)

- The workflow **does not** assume a CLI login. It requires the token in the **environment only**
  (`SUPABASE_ACCESS_TOKEN`); it is never written to a file, passed as an argument, or logged.
- Without it, `--execute` exits **2** and prints: `set SUPABASE_ACCESS_TOKEN in this shell only (never
  in a file, argv or log); the CLI reads it from the environment`.
- Operator setup (one time): create a **staging-scoped** personal access token, then in the deployment
  shell only: `$env:SUPABASE_ACCESS_TOKEN = '<paste>'` (PowerShell) — never commit it, never paste it
  into a transcript or issue.
- Offline validation performed: `node --check` passes on all three files; a plan run correctly
  **refused** with `refusing: working tree is not clean (3 path(s))`, proving the input guard fires.


## Part D — Secrets and cost classification

| Dependency | Class | Needed for deploy? | Notes |
|---|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | **Automatically provided by Supabase** | no | injected per function at runtime; **must never** be set as function secrets |
| *(none)* — `vault-media-access`, `course-lesson-media-access` | **Required for basic functionality, zero secrets** | n/a | private Vault/lesson media playback works immediately after deploy |
| `ARENA_EDITORIAL_RUN_SECRET` | **Required for that function to operate** (not to deploy) | no | operator-generated random string ≥32 chars; without it every worker call 401s (fail-closed) |
| `CREATOR_AI_API_KEY` / `CREATOR_AI_BASE_URL` / `CREATOR_AI_MODEL` | **Required only for the optional AI feature** | no | absent ⇒ "AI provider not configured"; nothing is fabricated |
| `DIGITAL_CREATOR_API_KEY` / `DIGITAL_CREATOR_BASE_URL` | **Required only for the optional AI feature** | no | absent ⇒ "not connected"; rooms stay text-only |
| `ARENA_AI_API_KEY` / `ARENA_AI_MODEL` / `ARENA_AI_BASE_URL` (editorial) | **Required only for the optional AI feature** | no | absent ⇒ drafts are deferred, not invented |
| per-source keys named by `arena_editorial_sources.secret_name` | **Optional**; some sources need their own key | no | looked up dynamically by name at ingest time |
| `TENOR_API_KEY` | **External provider (free tier)** — needs a provider account, no purchase | no | absent ⇒ 503 `not_configured`; client flag `EXPO_PUBLIC_ARENA_GIFS_ENABLED=false` keeps the feature off |
| AI / avatar-voice providers | **External paid provider if used** | no | only ever called from the function runtime; **no service was purchased or subscribed to** |

**The application operates fully without any optional AI provider**: Creator AI and Digital Creator
degrade to explicit "not configured"/"not connected" answers, editorial generation defers to human
review, and GIFs stay feature-flagged off. Core reading, Arena, Clash, Vault, World, notifications and
**private media playback** all work with zero operator secrets.

## Part E — Deployment rollback

A function deployment is additive and versioned; **no database rollback is involved**.

| Failure | Detection | Recovery |
|---|---|---|
| Deploy failed / partial deploy | non-zero exit; `evidence.result = "STOPPED"`; inventory check names the missing functions | re-run the same `--only` list (idempotent). Functions deploy independently and the app feature-detects each call, so a partial set is safe |
| Wrong JWT setting after deploy | step 7 inventory check (`verify_jwt` mismatch ⇒ refusal) | re-deploy that function with `supabase/config.toml` unchanged; if the CLI ignored the config, set the policy for that function only in the Dashboard. **Never** pass `--no-verify-jwt` to "fix" it |
| Missing secret found at runtime | smoke test returns 503/500 instead of 401 | add the secret, then re-run verification; secret changes need no redeploy |
| Unexpected HTTP responses | smoke test ≠ 401 for any function | stop, capture the status in evidence, investigate before anything else |
| Restore a previously verified version | needed after a bad deploy that still passed smoke | Supabase retains prior versions: re-deploy the last verified **repository commit** for that function only (`git checkout <commit> -- supabase/functions/<name>`, then `--only <name>`), then re-verify and record the commit in evidence |
| Roll back the whole set | worst case | disable the six functions; the client degrades exactly as described in Part D. No data is touched by any function deployment |

**Database safety:** these functions change no schema and call only reviewed RPCs whose authorization
lives in Postgres, so a bad function can fail a request but cannot corrupt data. Database rollback is
therefore **not** part of this procedure.


## Part F — Deployment order, prerequisites and authorization

**Recommended order (lowest risk first; each step independently verifiable):**

1. `vault-media-access` — no secret, highest functional value (private Vault media).
2. `course-lesson-media-access` — no secret.
3. `creator-ai` — verify it answers "not configured".
4. `digital-creator` — verify it answers "not connected".
5. `arena-editorial` — **after** `ARENA_EDITORIAL_RUN_SECRET` is stored; verify it 401s without the header.
6. `arena-gifs` — optional; leave undeployed, or deploy and expect 503 until `TENOR_API_KEY` exists.

**Outstanding prerequisites**

| # | Prerequisite | Owner | Blocks |
|---|---|---|---|
| P1 | Staging-scoped **access token** (`SUPABASE_ACCESS_TOKEN`) supplied in the operator shell | operator | every `--execute` run |
| P2 | `ARENA_EDITORIAL_RUN_SECRET` (≥32 chars) stored as a function secret | operator | step 5 operating |
| P3 | Optional: `TENOR_API_KEY` (+ re-enable the client flag) | operator | GIF feature |
| P4 | Optional: an AI provider key | operator | Creator AI / Digital Creator / editorial generation |
| P5 | Authorization for the deployment run itself | operator | execution |

## One-time deployment authorization request

> **Approve running the reviewed automated deployment against `clash-staging`
> (`zrutlrhhvfcsmssjiijl`) only, for exactly these functions, in this order:
> `vault-media-access`, `course-lesson-media-access`, `creator-ai`, `digital-creator`, and — only if
> `P2` is stored — `arena-editorial`. Execute `scripts/staging-functions-deploy.mjs --only <list>
> --execute` from the pinned commit, with a staging-scoped token supplied in the shell environment
> only. No hosted database write, no Auth change, no secret creation beyond
> `ARENA_EDITORIAL_RUN_SECRET` if approved, no cron change and no quarantine lift are included. Stop on
> any unexpected project identity, missing prerequisite, authorization failure, inventory mismatch or
> failed negative-authentication smoke test.**

Explicitly **not** requested: hosted SQL writes, Auth setting changes, cron reactivation, quarantine
lift, production deployment, or any paid provider subscription.

## Deliverables

- `docs/PHASE_11_STAGING_DEPLOYMENT_PREPARATION_STEP_12.md` (this report: Parts A–F).
- `scripts/staging-functions.manifest.mjs` — reviewed function/JWT/secret manifest.
- `scripts/staging-functions-deploy.mjs` — automated, fail-closed deployment workflow (dry-run default).
- `scripts/staging-functions-verify.mjs` — read-only inventory + negative-auth verification.

## Handoff

Branch `feat/phase-11-backend-security-7`. Draft PR:
`https://github.com/Xcalibur-hub/clash-app/pull/new/feat/phase-11-backend-security-7`.

**Nothing was deployed in this step.** Staging remains **QUARANTINED** and `clash-maintenance` remains
**inactive**. The next step is one explicitly approved automated deployment executed from the reviewed
commit with the operator-supplied token.

