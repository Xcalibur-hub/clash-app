# Phase 11 Step 16A.2 — Final Fixture Corrections

**Baseline:** `8a8bff4`. **Mode:** corrections only. **No hosted writes, cron changes or quarantine lift.**

## 1. Clean-prefix ownership now comes from the prefix-derived EMAILS

**The flaw:** the pre-create gate counted rows by the ids this toolkit derives with
`md5(prefix:…)`. But the Auth Admin API assigns its **own** UIDs, so a previous run's accounts —
and everything cascaded from them — were invisible to that count. A dirty prefix could have been
read as clean and written into.

**The correction:** a dedicated ownership probe resolves the prefix from its two deterministic
emails, then checks every related row against the ids that **actually exist**:

* `auth.users` by email → any account found is reported with its **resolved** UID
* `public.profiles` by `handle like '<prefix>!_%' escape '!'` → must belong to a resolved account
* every run-derived row id across the eight fixture tables
* an account is required to have its trigger-created profile row; anything else is a contradiction

`validateOwnership` refuses, before any mutation: accounts already present (`prefix is not clean
(accounts already exist: a:<uid>)`), duplicate/ambiguous rows, unattributable profiles or rows,
unexpected emails, non-UUID ids, and unrecognised probe output. A test demonstrates the regression
directly: the API-assigned UID is absent from the old count query while the ownership probe finds it.

**Scoping:** the refusal applies to `create` only. A `teardown` legitimately runs while rows exist, so
it *reports* `ownership_before` and continues — asserted by a test.

## 2. Account provisioning is a hosted mutation, and partial state is reported

`provisionAccounts` and the SQL fallback now return, on any failure:

`uids` (what exists) · `created_accounts` (tag, uid, email) · `preexisting_accounts` · `attempted` ·
`partial` · `mutation` · `cleanup_required` · `cleanup_scope`.

The runner surfaces all of it and never discards it:

| Outcome | Reported |
|---|---|
| First account created, second fails | `partial_provision: true`, `hosted_mutations.auth_admin_users_created: 1`, `cleanup_required: true`, `cleanup_scope: 'accounts_only'`, `cleanup_available: true`, evidence preserved, and **no fixture row written** |
| Both created, sign-in probe fails | `created_accounts` ×2, `hosted_mutations.auth_admin_users_created: 2`, `partial_state: true`, `reason_code: 'SIGNIN_PROBE_FAILED'` |
| Success | `hosted_mutations: { auth_admin_users_created, fixture_rows_inserted }` |
| Teardown | `hosted_mutations: { auth_admin_users_deleted, rows_deleted }` |

Because cleanup resolves accounts by email, a teardown can finish an *accounts-only* partial state.

## 3. Tests

**67 offline tests, all passing** — fixtures **30** (was 22), authenticated 9, harness 9, deploy 19.
New: API-assigned-UID detection (the regression proof), seven ambiguity/unattributable cases, the
create-refuses-dirty-prefix case that only email resolution can see, half-finished provisioning
(ids preserved + cleanup scope), sign-in-failure partial state, mutation accounting on success and
teardown, and teardown continuing while the prefix is dirty. The read-only `status` action now also
reports ownership.

Known limits unchanged: the `notifications >= 1` prediction, the signing-only media claim, and
`OPS-1`. **Stopping here for review.**
