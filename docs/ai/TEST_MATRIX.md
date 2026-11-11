# TEST_MATRIX — How to Verify, and What Each Result Proves

**Before running anything that touches a database, service, or device, read
[`SAFETY.md`](SAFETY.md).** Most commands below are safe/offline. Some are not —
those are marked.

---

## 1. Evidence classes

Every result you report must carry one of these classes. They are **not
interchangeable**.

| Class | What it proves | What it does not prove |
|---|---|---|
| **Static** | Types, lint, archive closure, `git diff --check` | Any runtime behavior |
| **Unit (mocked/deterministic)** | Pure logic in `utils/` | Integration, realtime, device |
| **Lifecycle harness** | Component/state flows with controlled hooks | Real backend or native rendering |
| **Database (pgTAP)** | SQL contracts against a real Postgres | Client behavior, UI |
| **Backend/API integration** | Real RPC/HTTP against a running backend | What the phone actually shows |
| **Native/device** | Actual rendering, input, keyboard, realtime on hardware | Other devices, other OS versions, other locales |

A green automated suite never upgrades a `BLOCKED` native scenario to `PASS`.

---

## 2. Offline / safe commands

Run from the repository root. All of these are safe and require no device,
database, or network.

| Purpose | Command | Notes |
|---|---|---|
| Type check | `npm run typecheck` | Must stay at **zero errors**. `tsc --noEmit` |
| Unit suite (124 files) | `npm run test:unit` | `node --experimental-strip-types --test` |
| Full suite | `npm test` | unit + 24 lifecycle files + release-scope. Last recorded 1,216/1,216 |
| Duel payload/presentation | `npm run test:duel` | Fast, pure logic |
| Duel render smoke | `npm run test:duel:render` | Controlled rendering, no device |
| Navigation harness | `npm run test:arena-navigation` | Controlled hooks/services |
| Edge Function types | `npm run typecheck:editorial` | Separate strict program |
| EAS archive closure | `node scripts/eas-archive-check.cjs` | Offline file/dependency analysis |
| Duplicate/whitespace check | `git diff --check` | Cheap pre-commit hygiene |

### Running one test file

```powershell
node --experimental-strip-types --test utils/<name>.test.ts
node --test scripts/<name>.test.cjs
```

---

## 3. Database tests — NOT offline

| Purpose | Command | Risk |
|---|---|---|
| pgTAP suite (102 files) | `npm run supabase:test` | Requires a running local stack |
| Start local stack | `npm run supabase:start` | Starts containers — needs authorization |
| Seed dev data | `npm run supabase:seed:clash-dev` | **Writes data** |

`npm run supabase:reset` **destroys and recreates** the local database. Never run
it as a convenience. It is never an option while fixtures matter.

---

## 4. Backend integration checks — NOT offline

`scripts/*-check.cjs` and `scripts/*-e2e.cjs` variants (`arena-canonical-e2e`,
`arena-engagement-check`, `crew-*`, `meet-*`, `official-service-check`,
`crowd-service-check`, `settlement-history-check`, `arena-load-test.mjs`) talk to
a real backend. Many perform **writes**. Treat every one as requiring explicit
authorization before running. Read the script header before executing it.

---

## 5. Native / device evidence

The only class that can prove native acceptance. Established workflow:

1. Development client `com.clash.v2.dev` installed on the device, unlocked and in
   the foreground.
2. ADB ports reversed for Metro and the local API origin.
3. Screenshots + UIAutomator XML captured per step, correlated with device
   requests/events.

**Known pitfall, recorded in the A50 report:** UIAutomator sometimes returns a
*stale* screen hierarchy. Stale XML must be excluded from geometry/label
acceptance; verify tap coordinates against the contemporaneous screenshot.

Minimum scenario set for an interaction acceptance:

| Scenario | Must observe |
|---|---|
| Entry | Native control → exact canonical IDs in the URL/state |
| Admission | Server-side membership confirmed, not just a UI state |
| Content | Exact text/authors rendered, matched to DB rows |
| Input | Keyboard geometry, composer visibility, sent state |
| Remote delivery | A *second* actor's content actually arriving |
| Exit | Back returns cleanly; realtime channels disposed (count → 0) |
| Re-entry | Background/foreground reconnect still consistent |

Each must be recorded as PASS / PARTIAL / BLOCKED / NOT TESTED individually.

---

## 6. Recording results

In `HANDOFF.md`, write results as:

```
npm test → PASS 1216/1216 (2026-11-05, full-tests.log)
Native ballot → BLOCKED (no ballots cast; A50 report §5)
Light theme → NOT TESTED
```

Name the log or report file. A result with no artefact is not evidence.
