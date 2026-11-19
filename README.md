# CLASH — Phase 3H Minimal Handoff for Supabase Pooler Validator Repair

This repository contains the minimal, isolated handoff package for Arena.ai to independently repair the Supabase pooler hostname validator defect identified during Phase 3G certification.

---

## 1. Defect Summary

During Phase 3G independent review and Windows execution-policy testing, a material functional defect was confirmed in the Supabase connection adapter:

- **File**: `preparation/phase3f/package/supabase/cloud/tools/lib/clash-native.ps1` (around line 3758–3765)
- **Problem**: The hostname regex allowlist for Supabase poolers restricts the AWS region token to two segments or incorrectly bounds valid region names:
  ```powershell
  # Current pattern in clash-native.ps1:
  $pooler = '\Aaws-[0-9]+-[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)+-[0-9]+\.pooler\.supabase\.com\z'
  # (or prior pattern: ^aws-[0-9]+-[a-z0-9]+-[a-z0-9]+\.pooler\.supabase\.com$)
  ```
  Real Supabase pooler hostnames follow the AWS convention `aws-[INDEX]-[REGION].pooler.supabase.com` where regions have three segments (e.g., `ap-south-1`, `ap-southeast-1`, `us-east-1`, `eu-central-1`).
- **Observed Behavior**:
  | Hostname | Observed Result |
  |---|---|
  | `aws-0-ap-south-1.pooler.supabase.com` | Rejected: host not permitted |
  | `aws-0-ap-southeast-1.pooler.supabase.com` | Rejected: host not permitted |
  | `aws-0-ap-south.pooler.supabase.com` | Accepted as pooler |
- **Impact**: Fails closed; valid pooler hostnames are rejected before reaching port or policy validation, blocking session pooler connections.
- **Additional Policy Detail**: In `Resolve-ExecutionPolicy`, when connecting to a pooler host, the adapter enforces that `ConfirmedPoolerHost` matches `PgHost`. The test harness `test-execution-policy.ps1` omitted `ConfirmedPoolerHost` on several negative cases, causing them to hit host rejection before their intended checks (leading to cascading failures).

---

## 2. Expected Behavior & Fix Objectives

1. **Permit Valid AWS Regions**:
   Allow standard AWS region identifiers (e.g., `aws-[0-9]+-[a-z0-9-]+-[0-9]+\.pooler\.supabase\.com` or properly validated multi-segment regional patterns) while preventing arbitrary non-Supabase hosts or subdomain injection.
2. **Preserve Security Controls**:
   - TLS `verify-full` is mandatory.
   - Valid CA certificate file is mandatory.
   - Username must match `postgres.<project-ref>`.
   - Port must be 5432 (transaction pooling on port 6543 must remain strictly refused).
   - Host must match the confirmed project host / pooler host.
   - Redirecting environment variables (`PGHOSTADDR`, `PGSERVICE`, `PGOPTIONS`) must remain strictly refused.
3. **Pass Policy Test Suite**:
   All 19 policy test cases in `preparation/phase3g/test-execution-policy.ps1` must pass cleanly (19 PASS, 0 FAIL, exit code 0).

---

## 3. Offline Test Execution

Run the standalone PowerShell test suite (no database, no credentials, no network access required):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File preparation/phase3g/test-execution-policy.ps1
```

### Baseline Status (Pre-fix)
- **Exit Code**: 1
- **Passed**: 10
- **Failed**: 9
- **Total**: 19

---

## 4. Repository Contents & Relative Path Layout

Relative paths are preserved so `test-execution-policy.ps1` automatically discovers the adapter and fixtures without parameters:

```
clash-phase3h-handoff/
├── README.md                                                     # This handoff brief
├── PHASE3G_CERTIFICATION_REPORT.md                              # Full Phase 3G certification and material defect report
├── preparation/
│   ├── phase3f/
│   │   └── package/
│   │       └── supabase/
│   │           └── cloud/
│   │               └── tools/
│   │                   └── lib/
│   │                       └── clash-native.ps1                 # Supabase PowerShell connection adapter (target for repair)
│   └── phase3g/
│       ├── test-execution-policy.ps1                            # Standalone offline policy test suite
│       ├── material-defect-review.md                            # Independent reviewer material defect confirmation
│       ├── independent-package-review.md                        # Independent package offline integrity review
│       ├── independent-app-review.md                            # Independent application offline isolation review
│       ├── package-verification-review-result.json              # Package verification review summary
│       ├── policy-tests.json                                    # Baseline policy test receipt (10 PASS / 9 FAIL)
│       ├── policy-tests.log                                     # Baseline policy test execution log
│       └── policy-fixtures/
│           └── synthetic-ca.txt                                 # Synthetic CA certificate fixture for offline test
```

---

## 5. Security Boundaries

- **Zero Credentials**: No real credentials, API keys, passwords, or production endpoints are included.
- **Offline Only**: Do not attempt database connections or migrations against real environments.
- **Pure Resolver Scope**: The test harness tests pure PowerShell parsing and policy resolution logic without spawning native `psql` processes.
