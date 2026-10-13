# Phase 11 Step 6K evidence (sanitized)

Controlled migrate attempt. **Quarantine — 43/106 completed.** No passwords, SQL bodies, or connection strings.

| File | Purpose |
|---|---|
| `preflight-outcome.json` / `preflight.json` / `preflight-gates-summary.json` | Fresh preflight PASS |
| `preflight-process-result.json` | Process wrapper (exit 0) |
| `migrate-outcome.json` / `migrate-process-result.json` | Migrate stop (exit 1, completed_items=43) |
| `deployment-result.json` | Quarantine summary |
| `cron-safety-gate.json` | Pre-deploy cron assessment |
| `endpoint-verification.json` | Network / identity prechecks |
| `offline-verification.json` | Hashes / go test / binary |

Private operator configs, CA PEM, and binary remain under `.expo/6k-private/` (not committed).
