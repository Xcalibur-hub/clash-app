# SAFETY — Boundaries, Authorization and Fixtures

**This document overrides every other file in `docs/ai/` and `AGENTS.md` when
they conflict.** It describes standing constraints. It does not grant anything.

---

## 1. The core rule: authorization is per-task, never standing

- A historical approval authorizes **exactly the run it described**, bounded by
  its execution manifest, counts, actors and expiry. See
  [`../evidence/ui-completion/ACTIVE_ARENA_AUTHORIZATION_CHECKPOINT.md`](../evidence/ui-completion/ACTIVE_ARENA_AUTHORIZATION_CHECKPOINT.md).
- The November 5 A50 run's approval (manifest
  `76ac802a…e012`, one execution ID) is **spent**. It does not authorize a
  retry, a second duel, another gateway start, further Auth recovery, or
  settlement of the leftover fixture.
- **Never** treat "we did this last time", a prior chat message, or an existing
  decision record as permission to repeat it. Ask the owner again.
- If a task's authorization and a goal conflict, **stop**. Do not widen scope.

## 2. Auth and credentials

Forbidden without an explicit, freshly-approved task that names the operation:

- Loading, printing, copying, or transmitting credentials, tokens, OTPs, or
  protected environment values.
- Auth recovery: magic links, OTP exchange, password reset, account creation on
  the test phone, app-data clearing, rebuild/reinstall.
- Extracting tokens from another process, logs, or the database; forging JWTs.
- Rotating or minting credential generations; extending credential lifetimes.
- Using `service_role` or any admin authority beyond what the task authorizes.
- Committing any `.env*` file, secret, or private evidence artifact.

Allowed in normal work: reading `.env.example` (public template only), and
using ordinary authenticated sessions the owner already holds.

## 3. Database

Forbidden unless the current task explicitly authorizes the exact operation:

- Writes to Supabase/Postgres of any kind: DDL, migrations, grants, RLS policy
  changes, cron scheduling, seed/backfill, data repair.
- Creating, settling, mutating, or cleaning up Arena fixtures (Takes, challenges,
  Clashes, Rooms, topics, messages, ballots, verdicts).
- Directly invoking privileged `SECURITY DEFINER` internals (for example the
  canonical duel factory). Application RPCs are the only legitimate entry.
- Assigning winners, verdicts, statuses, or deadlines by hand.
- Manual edits to user or credential records, Auth sessions, or ledgers.

Reading the repository's `supabase/migrations/` and `supabase/tests/` is always
fine. Reading a **running** database is only fine when the task allows it.

## 4. Backend, gateway and services

- Do not start, stop, replace, or reconfigure the local Supabase stack, the
  project gateway, Metro, or the dev router unless the task authorizes that
  specific action and names the process/port.
- Do not change backend behavior to make a test pass.
- Do not weaken permissions, RLS, guards, or rate limits to unblock execution.

## 5. Production and environments

- **No production access at all**: no production database, Auth, storage,
  Edge Functions, analytics, or dashboards.
- No deployment, EAS build upload, store submission, or `git push` to a
  production branch.
- Keep environments isolated: local development never points at production
  (see [`.env.example`](../../.env.example) and
  [`../../docs/LOCAL_DEVICE_SUPABASE.md`](../LOCAL_DEVICE_SUPABASE.md) if
  present).
- `config/release-targets.json` and `utils/releaseScope.ts` gate what a build
  may expose. They are **client policy, never an authorization boundary** —
  server-side checks remain authoritative.

## 6. Fixtures

- A fixture inherits the authorization of the run that created it, no more.
- **Preserve** existing fixtures. The settled DRAW fixture
  (Take `take_6fb7c0e28d7677bc` / Clash `cl_35eb151dd7c85fa8` / Room
  `ar_f8c0aa6960f7b878`) is accepted evidence — never modify, settle, or delete
  it.
- The November 5 partial, unsettled duel
  (Room `ar_e61d3b7de415e484`, Clash `cl_f9da274aff2bc232`) is **preserved as
  partial evidence**. Its disposition — accept, expire, or any follow-up — needs
  a separate owner decision. Do not retry it, settle it late, or "repair" it.
- A stopped or failed run is left as-is. No second attempt to make it look
  complete. No clock, deadline, or phase manipulation to revive a missed window.

## 7. Repository integrity

- Do not run `git reset`, `git clean`, `git checkout --`, `git restore`, or
  `git stash`. The dirty working tree is intentional.
- Do not commit, tag, push, or open PRs unless the task says so. Note that
  `.cursor/rules/always-commit.mdc` and `auto-push.mdc` exist for Cursor and do
  **not** apply to other agents.
- Do not delete or rewrite prior evidence under `docs/evidence/`.
- Do not modify `.clinerules`, `.kilo/`, `.cursor/`, global Codex/Claude
  configuration, or provider/API settings without owner approval.

## 8. Evidence integrity

- Never fabricate IDs, screenshots, timestamps, test results, or device output.
- Never present a stale screenshot or XML hierarchy as current evidence.
- Never promote a `PARTIAL` or `BLOCKED` result to `PASS` in a summary.
- Preserve failures and their receipts; they are part of the record.

## 9. Escalate instead of improvising

Stop and ask the human owner when an action would:

1. write to a database, or change schema/security;
2. touch credentials, Auth, or account state;
3. start, stop, or replace a service or gateway;
4. create, settle, or dispose of a fixture;
5. commit, push, or deploy;
6. change global tooling or another agent's configuration;
7. exceed the counts, actors, or time window of an approved run.

State what you want to do, why it is needed, and what it would affect.
