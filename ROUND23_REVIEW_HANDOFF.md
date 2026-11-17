# CLASH Round 23 — review handoff

**Scope:** the two admission defects the Round 22 independent acceptance left open —
C22-H1 (executable SQL outside the wrapper transaction) and C22-M1 (unapproved and
contradictory completion evidence). The C21-01/02/03 corrections and every RC01–RC11
control are preserved and still execute. No approved SQL body was modified, no
deployment, no database, no credentials, no infrastructure change.

| | |
|---|---|
| Branch | `arena/6a50cae6-clash-app` (isolated; nothing else touched) |
| Base | Round 22 code `e830b8c792e085e4266829a24e0db15807a0bd27` (handoff `333442b`) |
| Code SHA | **`8af1b0973bb9282425d2bfa31392efb23dadef4a`** |
| Windows CI | run [44084734192](https://github.com/Xcalibur-hub/clash-app/actions/runs/44084734192) — **17/17 steps success, windows-2022 / powershell.exe 5.1.20348.5773** |
| Adapter | `clash-native-adapter 5.5.0` (was 5.4.0) |
| Native cases | **161/161** (was 159), zero problems in the adapter receipt |
| Offline assertions | **529/529 in 29 sections** (was 519) — 528 identified + the count tripwire |
| Package | 111 manifest entries, 112 generated artifacts, 241 checksummed files — **unchanged** |

**Status: green locally and on the Windows runner. Nothing here is accepted, and no
deployment readiness is claimed.** This is a submission for independent review.

---

## 1. C22-H1 — the wrapper envelope, not only the body

**The defect (as demonstrated).** Round 22 compared three things: the text between
`begin;` and the ledger insert, the ledger tail, and the declared byte length. A
statement inserted *before* `begin;` was inside none of those windows, so
`select 1;\n` prepended to an otherwise correct wrapper passed the shared planner —
and the whole Node suite — once the wrapper digest, the manifest and the checksums
were rebound.

**The correction.** `Get-ClashWrapperEnvelopeProblem` (adapter, used by the one
planner `Test-ClashPackageIntegrity` that the runner, `check-manifest.ps1`,
`run-tests.ps1` and the CI step all consume) now validates the artifact structurally
before any content is compared:

1. exactly one **statement-level** `begin;` line and exactly one **statement-level**
   `commit;` line (a second transaction control anywhere is refused);
2. `commit;` must be the **last non-blank line** — anything after it is refused;
3. exactly one ledger `insert into supabase_migrations.schema_migrations …`, and it
   must sit between `begin;` and `commit;`;
4. every line before `begin;` must be **blank or a `--` comment**: a statement, a
   `;`, a block of anything executable is refused with the line number and text.

Rules 1–3 sit on top of the existing body-digest and exact-ledger-tail comparisons,
so the approved body, the exact ledger identity and the envelope are now one
conjunction. Nothing in the rule depends on the hashes: rebinding them cannot make
extra executable content acceptable.

**How it is verified on the shipped runtime** — case
`wrapperEnvelopeRejectsContentOutsideTheTransaction`, four controls, each with every
digest coherently rebound (wrapper digest, manifest entry, all 241 checksums):

| control | input | required verdict |
|---|---|---|
| `executable-prefix` | `select 1;` as the first line (the exact C22-H1 reproduction) | refused — *"executable content before its begin;"* |
| `statement-after-commit` | `select 2;` after `commit;` | refused — *"executable content after its commit;"* |
| `second-begin` | a second `begin;` line inside the body | refused — *"2 statement-level begin; line(s)"* |
| `comment-prefix` | `-- reviewed…` before the header | **accepted** (a comment is not executable) |
| pristine copy | untouched | **accepted** |

The two accepting controls are the point: the rule rejects *executability outside the
transaction*, not unfamiliar bytes.

**Node now agrees.** `tests/verify-package.mjs` implements the same rule
(`wrapperEnvelopeProblems`), asserts it over all 111 committed wrappers, and carries
five controls: executable prefix rejected, comment prefix accepted, statement after
`commit;` rejected, second `begin;` rejected, comment inside the header accepted.
That is exactly the class of copy `prefix-suite-control.py` built — it now fails the
suite as well as the planner.

## 2. C22-M1 — a closed receipt inventory and a semantic success contract

**The defect (as demonstrated).** The Round 22 chain proved *ordering*: one GENESIS,
every link real, phases monotone. A perfect graph can still hold receipts nobody
approved, and can hold receipts that contradict the completion. Five invalid runs
were accepted by the real producer **and** the real consumer.

**The correction — two passes inside `Test-ClashDeploymentEvidence`** (so they run in
the producer `Publish-ClashCompletion` and the consumer `Test-ClashRunCompletion`):

1. **`Test-ClashReceiptInventory` — closed set.** The declared set is derived from the
   runner's *whole* vocabulary (`Get-ClashReceiptVocabulary`: every phase receipt
   **including its failure receipts**, `01-gates/*`, `STOP.json`,
   `99-runner-exception.json`) plus the names derived from the approved manifest
   (`03-migrations/<NNN>-<version>.json`, `<NNN>-<version>-applied.json`,
   `-digest-detail.json`, `-missing.json`, `-failed.json`, the `.sql` snapshot, …).
   Every `*.json` under the run (recursively) must be in that set. Two specific
   refusals: a receipt **nested inside `03-migrations/`** (a per-migration receipt
   belongs directly there and must name an approved migration), and any undeclared
   path at all.
2. **`Test-ClashReceiptSemantics` — success contract.** Every receipt that is not
   owned by a dedicated validator must carry the status its type allows
   (`BASELINE` for the baseline, `FINALIZING` for the intent, `COMPLETE` for the
   marker, `PASS` for everything else); anything else — `FAIL`, `STOP`, `EXCEPTION`,
   `UNKNOWN`, a non-string — is refused. On top of that, two receipts get their own
   schema:
   - **applied receipts**: one must exist for every approved migration and say
     `status = PASS`, `outcome = COMMITTED`, and the approved `version`;
   - **`06-claim-release-ownership.json`**: must exist, say `PASS`, report
     `returnedRows >= 1`, and list *this run's* id in `returned` and
     `expectedRunId`.

**One guard per rule (a deliberate design constraint).** The generic status rule does
**not** restate the status of receipts a dedicated validator already owns (baseline,
integrity, the three report contracts, claim release, applied, ownership). Two guards
on one field make a mutation control unable to isolate either of them — which is
exactly what the Round 23 CI found when the `rc02-phase-status` control could no
longer accept its own mutant. Every rule now has exactly one owner, and the mutant is
meaningful again.

## 3. The five independently accepted invalid cases — resolution matrix

Every row was reproduced with the audit's own method: a **valid graph** (links
rebuilt after the mutation), the **actual** semantic validator, the **actual**
producer and the **actual** consumer, against the genuine approved manifest. All five
are now refused by the producer *and*, where a marker was published, by the consumer.
Case `completionRejectsUnapprovedAndContradictoryEvidence` runs all five with a
positive control (the untouched writer-built run must still be accepted).

| # | audit case (accepted before) | how it is built here | verdict now | refusing rule |
|---|---|---|---|---|
| 1 | nested `03-migrations/extra/999-unapproved.json`, ordinal 999, coherently linked | inserted after approved receipt 001, chain re-linked | **refused** | inventory: *nested inside 03-migrations* |
| 2 | `04-unexpected.json` (PASS), coherently linked | added after postflight, chain re-linked | **refused** | inventory: *not a receipt this protocol declares* |
| 3 | `04-supplement.json` declaring FAIL | added after postflight, chain re-linked | **refused** | inventory (undeclared path) and the status rule |
| 4 | existing applied receipt changed to FAIL, successors rebound | `002-…-applied.json` status → FAIL, chain re-linked | **refused** | applied-receipt schema: *did not commit cannot support a completed deployment* |
| 5 | claim-ownership evidence changed to FAIL / zero rows, successors rebound | status → STOP, `returnedRows` → 0, chain re-linked | **refused** | ownership schema: status not PASS, and `returnedRows` below 1 |

For each attack the case also requires that, if the producer had accepted, the
consumer refuses — so a divergence between producer and consumer is itself a failure.

## 4. What was preserved

| control | result on the Round 23 SHA |
|---|---|
| C21-01 writer/verifier hash round-trip | PASS (case `writerReceiptStreamRoundTripsThroughProducerAndConsumer`) |
| C21-02 chain: unrelated predecessor, interior GENESIS, duplicate GENESIS, missing applied receipt | PASS (case `receiptChainRejectsBrokenAndExemptedLinks`) |
| C21-03 wrapper body / ledger tail fidelity | PASS (cases `wrapperBodyIsTheApprovedBodyExactly`, `packageFidelityBindsEveryWrapperToItsOriginal`) |
| RC01–RC11 (typed certification, semantic completion, package identity, failed git capture, report contradiction, containment, seal closure, snapshot race, suite certification, sealed byte lengths, object representation) | PASS — all 161 cases, zero problems in the adapter receipt |
| six mutation controls (`rc01`×2, `rc02`, `rc03`, `rc05`, `rc06`) | PASS — every mutant is accepted only after its check is dropped |
| assertion inventory (528 ids) and the count tripwire | PASS — 529/529 |
| 111 approved bodies, 112 generated artifacts, 241 checksums | **byte-identical to the reviewed package** |

## 5. Residual risks (new in this round)

1. **The vocabulary is closed and manual.** A new receipt name in the runner must be
   added to `Get-ClashReceiptVocabulary` or a real run will be refused (loudly, never
   silently). Same for the stage list in `Get-ClashReceiptPhaseRank` (Round 22).
2. **A receipt type that is "owned elsewhere" must be named there.** The generic
   status rule deliberately skips the seven types above. A new receipt type with a
   status but no dedicated validator falls to the generic rule (safe), but if it is
   added to the owned list without a real validator it would be unchecked.
3. **The ownership receipt is now required.** Runs produced before this round (no
   `06-claim-release-ownership.json`) are refused. That is intentional, and it is a
   behavioural change for anyone verifying an older evidence directory.
4. **Comments are still allowed outside the transaction.** The rule is about
   executability: a `--` line before `begin;` can mislead a human reader but cannot
   execute. Block comments (`/* */`) before `begin;` are refused (only `--` and blank
   lines are permitted), which is stricter than PostgreSQL requires.
5. **`03-migrations/` must stay flat.** Any nested directory under it is refused, so a
   future runner layout change is a breaking change to this contract.
6. Unchanged: no signatures (a writer controlling every artifact can still produce a
   self-consistent run); duplicate JSON keys collapse under `ConvertFrom-Json`; the
   chain assumes the runner's phase order; `deploy.ps1` has still never been executed
   against a live database in this round.

## 6. NOT ASSESSED

- Live database execution of any kind: `psql`, Supabase CLI, DNS, TLS, IPv4/IPv6,
  connection policy, hosted RLS, hosted Storage, migration application to a project.
- Whether a *hosted* schema matches the approved bodies (offline comparison only).
- Rollback/restore behaviour on a real failure.
- Durability (power loss), concurrency beyond the two probed races, and any hosted
  platform behaviour.
- Authenticity: hashes are not signatures.

## 7. What an independent reviewer should attack next

1. Put the executable text where the envelope does not look: inside a dollar-quoted
   body (`do $$ begin … end $$;`) that is *not* the approved body, or a `begin;`
   token inside a string literal in the header region.
2. Try `03-migrations/extra/001-20260101000001.json` — a nested receipt whose *leaf*
   looks approved — and confirm the inventory, not the leaf name, decides.
3. Remove `status` from a receipt entirely (rather than setting it to FAIL) and check
   whether any consumer path treats "no status" as success.
4. Add a junction/symlink to a receipt outside the run and confirm both the seal walk
   and the inventory walk resolve it the way the containment rule intends.
5. Re-run the five-case matrix with a **locally rebuilt** manifest whose versions
   differ from the committed one, and confirm the derived inventory follows the
   approved inventory and never the run.

## 8. Non-claims

This round does not claim that the release is deployable, that the migrations are
correct against a live database, that the evidence format is complete for every
future runner change, or that a green Windows run is an independent acceptance. It
claims that the two named admission defects now have a total, single-owner rule in
both the planner and the Node validator, that the five demonstrated invalid runs are
refused by the producer and the consumer, and that every previously passing control
still executes and passes.
