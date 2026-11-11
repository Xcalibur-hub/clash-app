# docs/ai — Index

Compact navigation for the shared CLASH knowledge base. Read
[`../../AGENTS.md`](../../AGENTS.md) first; come here to choose what else to load.

**Rule:** load the 2–3 documents your task needs, not the whole folder.

---

## Which document do I need?

| If your task is… | Read | Then verify against |
|---|---|---|
| Understanding how the app is built | [`ARCHITECTURE.md`](ARCHITECTURE.md) | `app/`, `services/`, `supabase/migrations/` |
| Checking whether something already exists | [`IMPLEMENTED.md`](IMPLEMENTED.md) | The cited source file |
| Picking up where the last agent stopped | [`HANDOFF.md`](HANDOFF.md) → [`CURRENT_STATE.md`](CURRENT_STATE.md) | `git status`, latest `docs/evidence/` report |
| Asking "why is it like this?" | [`DECISIONS.md`](DECISIONS.md) | The cited doc/migration |
| Running or judging tests | [`TEST_MATRIX.md`](TEST_MATRIX.md) | `package.json` scripts |
| Choosing what to work on next | [`TASKS.md`](TASKS.md) | The owner's current instruction |
| Touching Auth, DB, gateway, fixtures, release scope | [`SAFETY.md`](SAFETY.md) — **required, not optional** | `docs/evidence/ui-completion/ACTIVE_ARENA_AUTHORIZATION_CHECKPOINT.md` |
| Arena / duel / live experience work | [`IMPLEMENTED.md`](IMPLEMENTED.md) + [`CURRENT_STATE.md`](CURRENT_STATE.md) | `docs/CANONICAL_ARENA_LIVE_3_1.md`, `docs/ARENA_LIVE_EXPERIENCE_V2.md` |
| Release / beta scoping | [`DECISIONS.md`](DECISIONS.md) (§release scope) | `utils/releaseScope.ts`, `config/release-targets.json` |
| Executing a full work handoff | [`.agents/skills/clash-handoff/SKILL.md`](../../.agents/skills/clash-handoff/SKILL.md) | — |
| Configuring an agent / wondering who reads what | [`CONTEXT_LAYOUT.md`](CONTEXT_LAYOUT.md) | The installed runtime's own docs |
| Considering a memory tool | [`MEMORY_EVALUATION.md`](MEMORY_EVALUATION.md) | — |
| Worried about token cost / cache misses | [`CACHING.md`](CACHING.md) | — |

**All tasks:** [`SAFETY.md`](SAFETY.md) applies. Its rules override everything
else in `docs/ai/`.

---

## The documents

| File | Owns | Typical size |
|---|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Stack, directories, services, data flow, testing infra | Medium |
| [`IMPLEMENTED.md`](IMPLEMENTED.md) | What exists, by verification level, with evidence paths | Medium |
| [`CURRENT_STATE.md`](CURRENT_STATE.md) | Latest verified snapshot: branch, HEAD, open risks | Short |
| [`DECISIONS.md`](DECISIONS.md) | Durable "why", with sources | Medium |
| [`TEST_MATRIX.md`](TEST_MATRIX.md) | Commands and evidence classes | Medium |
| [`TASKS.md`](TASKS.md) | Pending work + dependencies + approval gates | Short |
| [`HANDOFF.md`](HANDOFF.md) | Append-newest-first transfer log | Grows |
| [`SAFETY.md`](SAFETY.md) | Boundaries, authorization model, fixture rules | Medium |
| [`CONTEXT_LAYOUT.md`](CONTEXT_LAYOUT.md) | Which agent reads which file; per-runtime verification status | Medium |
| [`MEMORY_EVALUATION.md`](MEMORY_EVALUATION.md) | Claude-Mem feasibility and Phase 2 recommendation | Medium |
| [`CACHING.md`](CACHING.md) | Prompt-cache behaviour, measured statistics, token rules | Medium |

## Authoritative sources elsewhere (do not copy them)

These already exist and remain the source of truth. `docs/ai/` links to them
and never paraphrases them at length:

| Source | Covers |
|---|---|
| [`../../.clinerules`](../../.clinerules) | Execution discipline (phases, TypeScript, no `any`) |
| [`../../README.md`](../../README.md) | Product overview, stack table, local dev scripts |
| [`../../CLASH_SPEC.md`](../../CLASH_SPEC.md) | Product spec and visual design tokens |
| [`../../docs/`](../) (42 docs) | Per-feature and per-phase design/report notes |
| [`../../docs/evidence/`](../evidence/) (106 dirs) | Acceptance reports and device evidence |
| [`../../supabase/migrations/`](../../supabase/migrations/) | Real database contract (114 migrations) |
| [`../../supabase/tests/`](../../supabase/tests/) | pgTAP database tests (102 files) |
| [`../../package.json`](../../package.json) | Every runnable script |
| [`../../utils/releaseScope.ts`](../../utils/releaseScope.ts) | Client-side release policy |

## Maintaining this folder

- Keep entries short; link out to evidence instead of embedding logs.
- Update `CURRENT_STATE.md` and `HANDOFF.md` on every substantive task.
- Update `IMPLEMENTED.md` only when the *verification level* changes.
- Add to `DECISIONS.md` only for decisions an agent could otherwise undo.
- Never paste credentials, tokens, private IDs, or full test logs here.
- If a fact here conflicts with the code, the code wins — fix the document.
