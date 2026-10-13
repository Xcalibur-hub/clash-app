# Minimal Management-API authorization request (Phase 11 Step 10, OPS-1/OPS-2)

**Status: NOT AUTHORIZED — this file is the request only.** No credential was obtained, no
Management API call was attempted, and no hosted configuration was read or changed.

Hosted Auth, Realtime runtime, Edge Function deployment and hosting-plan isolation cannot be read
through the approved read-only database mechanism (`verify-complete`). Closing `OPS-1`, `OPS-2` and
`OPS-10` needs one of the following, explicitly granted.

## Option 1 (preferred): read-only Management API token

Grant, for the staging project only:

| Item | Value requested |
|---|---|
| Scope | **read-only** (no `write`, no `secrets:write`, no `functions:deploy`) |
| Project | `zrutlrhhvfcsmssjiijl` (`clash-staging`) only |
| Duration | single session, revocable immediately after |
| Storage of the token | Windows Credential Manager entry `CLASH/staging/zrutlrhhvfcsmssjiijl/management` — never a file, URL, argument, transcript or environment echo |
| Endpoints to be read | `GET /v1/projects/{ref}/config/auth`, `.../config/auth/providers`, `.../functions` (list + version + `verify_jwt`), `.../config/realtime`, `.../postgrest`, `.../config/storage`, `.../api-keys?reveal=false`, project metadata (region, tier, organization) |
| Never requested | secret values, service-role keys, JWT secret, SMTP credentials, provider API keys, any write or deploy endpoint |

## Option 2: operator-supplied Dashboard evidence

A screenshot or exported page (values redacted) covering:
Auth → URL Configuration (Site URL, Redirect URLs), Auth → Providers/Email status,
Auth → Settings (signup enabled, anonymous sign-ins, JWT expiry),
Edge Functions list (names, versions, `verify_jwt`), Realtime → publication/settings,
Project Settings → General (region, plan) and API (exposed schemas, max rows).

## What each item closes

| Item | Endpoint / page | Closes |
|---|---|---|
| Auth settings, signup, email provider, redirect allowlist | `config/auth` | OPS-1 |
| Deployed Edge Functions, versions, JWT enforcement | `functions` | OPS-2 |
| PostgREST exposed schemas and service status | `postgrest` + `api-keys` | Part A #2 |
| Realtime settings and publication config | `config/realtime` | Part A #3 |
| Staging vs production project separation | project + organization metadata | OPS-10 |
| Server-side secret presence (names/status only) | `functions` secrets (names + `updated_at`, never values) | Part A #7 |

## Explicitly out of scope

Cron reactivation, hosted SQL writes, fixture/account creation, Edge Function deployment, hosted
configuration modification, quarantine lift and production deployment are **not** requested here.
