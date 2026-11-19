# CLASH — Phase 3H Arena independent pooler-validator repair

**Verdict:** repair complete in patch form; **not certified**. All 26 replayed policy cases pass. The provided PowerShell suite could not be executed in this sandbox (no Windows PowerShell 5.1 / PowerShell Core runtime), so Codex must rerun it on Windows before certification.

## Scope and provenance

- Read-only clone of `origin/handoff/phase3h-arena-20261119` at `4651d9dce3b0b7fcf48434fc238253f85d92d88b`, into `/tmp/clash-phase3h`.
- Current protected branch `arena/2c5d7318-clash-app` at `2467af2` was **not** changed; only an untracked artifact directory was added in the workspace. No commit, push, merge, Supabase connection, credential, migration or deployment.
- The handoff branch contains only the adapter, the 19-case policy test, CA fixture and Phase 3G reports. It does **not** contain the 119-migration package; preservation/integrity of those files was therefore not in scope and was not claimed.

## Defect and fix

Phase 3G reported that the pooler allowlist accepted only two region segments. In this branch's adapter the pattern had already been widened, but it was still expressed as an ambiguous quantifier and the supplied tests still omitted the mandatory confirmation argument, so the 19-case suite failed at host/confirmation gates.

Patched `clash-native.ps1` (inside `Resolve-ExecutionPolicy`):

```powershell
$pooler = '\Aaws-[0-9]+-(?:[a-z][a-z0-9]*-){2,4}[0-9]+\.pooler\.supabase\.com\z'
```

This explicitly requires an AWS numeric cluster index, **2–4 ASCII region word segments**, a numeric partition, and the fixed `.pooler.supabase.com` zone, with case-sensitive absolute anchors. It accepts `ap-south-1`, `ap-southeast-1`, `us-east-1`, `eu-central-1`, `us-gov-east-1`; it refuses `aws-0-ap-south` (no numeric partition), one-word regions, uppercase hosts, trailing LF, foreign zones and subdomain suffixes.

Patched `test-execution-policy.ps1`:

- Added `ConfirmedPoolerHost = $pooler` to the default `Refuses` argument map and to both positive pooler calls — the product requires exact confirmation, so tests must supply it.
- Added seven cases: multi-segment region accepted, missing/mismatched confirmation refused, two-segment region refused, lookalike zone refused, uppercase refused, trailing LF refused.

Port 5432 remains the only pooler port; 6543 and all other ports are refused with the existing explicit transaction-mode message. No TLS, CA, credential, project/user or environment guard was relaxed.

## Files and hashes

| File | Bytes | SHA-256 (raw) | SHA-256 (LF-normalised) |
|---|---:|---|---|
| Adapter, original | 267836 | `fef4a1c3d3d91c7c7869f9437fbad216893b3479e35fbca346b575ca329643e3` | `f8cc4d54e7a7549ad544f868e6782ccd9f50cc819a4ec2f3c03b7aad77464ccd` |
| Adapter, patched | 268050 | `9b1e31f4feeb31b8e735aca81c676f89ff3688f6d28b5ad9b16f2b28eab8fac8` | `c3c336a1449e710198a3150b81bb450e251c1072b3be841741e6d8d3266a479a` |
| Test script, original | 4556 | `6cdeb53423efd2c6cb6f368a6ece32bf733348a18b6d5428999e589538bd3662` | `d1d217b291b72bc34654865f9d24c48416ce809e5b68a4a54915a6c5c9c7b71e` |
| Test script, patched | 5822 | `6c71969748c4f14a7cc0944b4e42012f69d1c9d94f9ba000143e5857691b8a63` | `b5812e12e611ae4fdd8a53d4e76225cf9469f9b67e38462814816f5ce95d5a18` |
| Unified patch | 5432 | `59bc664d83e056a36025be3e9ff648e0a1a77fde36b10e04826c31cb37ea732b` | same |

`git apply --check` against a pristine clone of the handoff branch: **PASS**. CRLF line endings preserved. Patch: `PHASE3H_ARENA_REPAIR.patch`.

## Test results

| Run | Result |
|---|---|
| Phase 3G baseline receipt in branch (`policy-tests.json`, adapter SHA `0a54dfbf…`) | 6 PASS / 13 FAIL / 19, exit 1 — cascading host-rejection failures; not a valid result for this branch's adapter, whose SHA is `f8cc4d54…` (LF) |
| Provided 19-case suite on Windows 5.1 after patch | **NOT EXECUTED** — no PowerShell runtime in sandbox; GitHub release assets for a scratch PowerShell install are network-blocked |
| Semantic replay of the patched cases (`PHASE3H_POLICY_REPLAY.mjs`) | **26 PASS / 0 FAIL / 26**, exit 0 |

The replay extracts the actual pooler/ref regex literals from the patched adapter, mirrors `Resolve-ExecutionPolicy`'s branch order and returns mode/port/env/digest, and executes every case defined in the patched test script. It is a **semantic replay, not a PowerShell execution**. Full per-case output: `PHASE3H_TEST_RESULTS.json`.

## Security review

Preserved and exercised:

- `\A`/`\z`, `-cmatch`/`-cne`: case-sensitive, absolute host and project-ref validation; trailing LF and uppercase lookalikes refused.
- Exact `postgres.<20-char-ref>` pooler user; exact `ConfirmedPoolerHost` equal to `PgHost` (now explicitly tested as missing and mismatched).
- Pooler port 5432 only; 6543 and arbitrary ports refused before any other branch.
- `PGSSLMODE=verify-full` forced over a prior `disable`; mandatory CA file; credential required via `PGPASSWORD`/`PGPASSFILE`.
- `PGHOSTADDR`, `PGSERVICE`, `PGOPTIONS` redirection refused.
- Direct host must be the exact `db.<ref>.supabase.co`.

Residual / not certified:

1. **Runtime gap (material for certification):** Windows PowerShell 5.1 rerun of `test-execution-policy.ps1` is required. The replay does not prove PS parsing, splatting or `-cmatch` behaviour on the target runtime.
2. **Stale seal:** the Phase 3G receipt's adapter SHA does not match either the original or patched adapter in this branch. Codex must regenerate the policy receipt; no resealing or certification is claimed here.
3. **Inherited digest semantics:** this adapter records `Get-NormalizedSha256` for the CA, not a raw file-byte digest. Left unchanged because the supplied tests pin that contract; flag separately if the stricter file-digest rule is required.
4. **119-migration integrity:** out of scope in this minimal branch; no claim about originals, wrappers or checksums.

## Concise handoff for Codex

Apply `PHASE3H_ARENA_REPAIR.patch` to `handoff/phase3h-arena-20261119` (verified clean), then on Windows run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File preparation/phase3g/test-execution-policy.ps1 -OutFile preparation/phase3h/policy-tests-after-repair.json
```

Expect exit 0 and 26 PASS / 0 FAIL / 26. Confirm the receipt's `adapterSha256` equals `c3c336a1449e710198a3150b81bb450e251c1072b3be841741e6d8d3266a479a` (LF-normalised). Then perform your independent delta review and clean-source/certification steps. No database permission is needed for this handoff.
