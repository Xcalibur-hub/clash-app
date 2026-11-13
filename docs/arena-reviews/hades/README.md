# CLASH — Arena Review Artifacts (HADES)

Verification artifacts for the CLASH settlement engine, published so downstream
review tooling can retrieve them without manual transfer.

| | |
|---|---|
| Repository | `Xcalibur-hub/clash-app` |
| Baseline commit | `36dccade5f5b7a7ae62c77f966d3b519d34723ee` |
| Baseline branch | `experiment/arena-agent-fable-20261111` |
| Package branch | `arena/hades-artifacts-20261113` |
| Engine | PostgreSQL 16.2 |

> **Publication scope.** This package is a *technical reproducibility kit*. It
> contains a candidate patch, a reconstructed test harness, and fixture
> documentation. Detailed review findings, their severity, exploitability and
> remediation are held in a **separate private record** and are intentionally not
> part of this public tree.

---

## 1. Contents

```
hades/
├── README.md                     this file
├── fixtures/
│   ├── README.md                 substitutions and limitations (read this)
│   ├── install-stubs.sh          installs postgis/pgcrypto stubs
│   └── overlay/
│       └── world_missions-fixture.patch   2-line, documented, reversible
└── reconstructed/
    ├── README.md                 what "reconstructed" means
    ├── loader.mjs                loads the 119 baseline migrations
    ├── harness.mjs               fixtures + identity impersonation
    ├── run-all.mjs               runs every suite, writes results.json
    ├── results.json              latest machine-readable run
    ├── tests/
    │   ├── 01-cancelled-settlement.mjs
    │   ├── 02-fighter-rewards.mjs
    │   ├── 03-concurrent-settlement.mjs
    │   └── 04-lock-order.mjs
    └── logs/                     captured output of each suite

patches/
└── fighter_rewards.patch         candidate patch (byte-identical to source)
```

## 2. The patch

`patches/fighter_rewards.patch` — **candidate** status, not merged, not part of the
baseline. 14 files.

```
sha256 4b34c459a242a91ac7961dc50b73ae0756e06d3fc4d2097508f7c77a1c471acc
size   57,431 bytes
```

It applies cleanly to the baseline:

```bash
git checkout 36dccade5f5b7a7ae62c77f966d3b519d34723ee
git apply --check docs/arena-reviews/patches/fighter_rewards.patch && echo OK
```

Policy it implements, for debaters only:

| Outcome | Reputation | Coins |
|---|---|---|
| Win | +40 | 0 |
| Loss | +15 | 0 |
| Draw | +15 each | 0 |
| Cancelled | 0 | 0 |

Juror rewards are unchanged by the patch. This was verified by an independent
reference calculator and by comparing the two schemas directly — see
`reconstructed/logs/02-fighter-rewards-*.log`.

## 3. Reproducing

Prerequisites: Node.js ≥ 18, and a **disposable** PostgreSQL you are willing to
destroy. Do not point this at a shared or accepted database.

```bash
# 1. Node dependency
npm install

# 2. Install the fixture extension stubs (server must be stopped)
sh docs/arena-reviews/hades/fixtures/install-stubs.sh "$(pg_config --sharedir)"

# 3. Build two working copies of the migrations (not redistributed here):
#    baseline, and baseline + candidate patch, each with the 2-line overlay.
#    See fixtures/README.md §3.

# 4. Run everything
cd docs/arena-reviews/hades/reconstructed
HADES_MIG=/path/to/mig-baseline \
HADES_MIG_PATCHED=/path/to/mig-patched \
node run-all.mjs
```

Unless `--migrations` / `--patched` (or `HADES_MIG` / `HADES_MIG_PATCHED`) is given,
the runner exits with code `2` rather than guessing.

Individual suites:

```bash
node tests/01-cancelled-settlement.mjs --schema=baseline
node tests/02-fighter-rewards.mjs --schema=baseline
node tests/03-concurrent-settlement.mjs
node tests/04-lock-order.mjs
node tests/05-verify-hardening.mjs
```

## 4. Test coverage

Eight suites across two schemas (baseline 119 migrations; patched 121).
Latest run: **8/8 suites passed** (`reconstructed/results.json`).

| Suite | What it establishes |
|---|---|
| 01 cancelled-settlement | Zero-ballot settlement cancels, writes no verdict, and pays nobody; repeat settlement adds no award. |
| 02 fighter-rewards | Patch pays +40/+15/+15 per policy, 0 coins, jurors unchanged. Ledger compared against an independent reference calculator, both schemas. |
| 03 concurrent-settlement | 2, 3, 4, 5 and 8 concurrent settlers on one clash, simultaneous and staggered. Exactly one verdict, exact totals, no duplicate `(actor,kind)` pair, no lost update. |
| 04 lock-order | Static call-aware analysis plus forced contention: every function that locks both `clashes` and `arena_rooms` does so in the same order; no deadlock (`40P01`) is reachable. |

Full captured output is in `reconstructed/logs/`.

## 5. Scope and limitations

Read `fixtures/README.md` before relying on any result.

- **Substituted:** `postgis` and `pgcrypto` are **stubs** — no spatial semantics, no
  cryptographic randomness. One migration carries a documented 2-line overlay.
- **Absent:** the Storage service, the Realtime server, `pg_cron`, and pgTAP. Realtime
  `send()` is a no-op, so delivery and retry are **not** tested.
- **Not tested:** World/geography code, Storage bucket policies, Realtime semantics,
  cron scheduling, the repository's own pgTAP suite, and any client UI.
- The harness sets `request.jwt.claims` itself. **JWT signature verification is the
  gateway's responsibility and is not exercised here.**

## 6. What "reconstructed" means

The original review harness and its logs were lost to a sandbox reset and were never
committed. The `reconstructed/` tree was written fresh for this package: it recreates
the tests for the four prioritised areas and runs them again from scratch.

- It is **not** a copy of the lost harness, and it is not presented as one.
- Every result in `logs/` was produced by the scripts in this package, on
  PostgreSQL 16.2, during preparation of this package.
- No historical log, result or manifest is reproduced or claimed.

## 7. Provenance

| Artifact | Origin |
|---|---|
| `patches/fighter_rewards.patch` | produced in an earlier phase; byte-identical, checksum above |
| `reconstructed/**` | authored for this package; no upstream origin |
| `fixtures/**` | authored for this package |

The upstream repository is **unmodified** by this package; only new files are added
under `docs/arena-reviews/`. No migration, schema, application source or existing
branch is touched.
