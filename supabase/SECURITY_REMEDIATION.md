# Phase 0.5 security remediation

Supabase/PostgreSQL remains authoritative. Existing data is preserved; no database reset is used.

## Group 1: public profile access

Migration `20261008110000_profile_read_security.sql` replaces broad profile SELECT
grants with the explicit public identity columns. It also removes any pre-existing
column SELECT grants before applying that whitelist. `get_my_profile()` derives the
caller from `auth.uid()` and returns public fields plus that caller's balance;
account linkage and authority fields are absent. Existing editable-column grants
and RLS ownership checks remain intact.

Public profile, search and hydration consumers use the shared explicit projection.
Identity lookup uses `my_profile_id()` rather than querying the auth linkage field.
Public profile cards do not receive balances; the existing domain mapper defaults
that unavailable field to zero, while own-profile hydration receives the real balance.

Executed verification:

- Typecheck passed.
- Unit suite: 409 tests passed, no failures or skipped tests.
- Expo Doctor: 18/18 checks passed.
- Database suite: 61 files / 2,443 assertions passed, including 17 new profile checks.
- `node scripts/security-remediation-check.cjs`: real local Auth/PostgREST checks
  passed for public projections, anonymous internal-field denial, caller isolation,
  denied privilege escalation, and preserved profile editing. Disposable accounts
  were cleaned up.

This is a group completion checkpoint, not completion of Phase 0.5. Remaining work:
relationship helpers and effective RPC grants; removed/publication/visibility reads;
account-switch cache isolation; private authorized typing; Crew grant remediation;
verified Crowd migration-ledger reconciliation; honest counts and presence labels.
No physical-device verification or production-readiness claim is made.
