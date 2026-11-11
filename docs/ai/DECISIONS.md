# DECISIONS — Durable Architectural Choices and Why

Only decisions with a recorded reason. Where the rationale is inferred from
source rather than stated, it says **"Source implies"** — do not upgrade an
inference into a stated intent.

---

## D1 — Server-authoritative Arena; the client never decides outcomes

**Decision.** Clash verdicts, rewards, phases, and authorization are computed
server-side (RLS, column grants, `SECURITY DEFINER` RPCs, triggers). The client
renders state it is given.

**Why.** Stated in the Nov 5 checkpoint: application mutations use *"ordinary
actor JWTs"*, and *"SECURITY DEFINER internals remain server-owned application
behavior, not permission to act with service_role"*; *"the engine's actual
result is authoritative."*

**Source.** [`../evidence/ui-completion/ACTIVE_ARENA_AUTHORIZATION_CHECKPOINT.md`](../evidence/ui-completion/ACTIVE_ARENA_AUTHORIZATION_CHECKPOINT.md) §"Installed application contract", §"Minimum run".

**Consequence.** Client checks are UX affordances only. Any proposal to
"enforce on the client" or bypass an RPC with a table write contradicts this.

---

## D2 — The publishable Supabase key is public by design

**Decision.** Ship `EXPO_PUBLIC_SUPABASE_ANON_KEY` in the client bundle. RLS and
column grants are the boundary. A service-role key must never reach the bundle.

**Why.** Stated in [`.env.example`](../../.env.example): *"The publishable key is
safe to ship: Row Level Security and the column grants decide what it can
actually read or write"*; *"A service-role key is NOT public."*

---

## D3 — Crowd messages hydrate by ID, not by realtime payload

**Decision.** On a realtime event the client ignores the raw content and calls
`get_arena_crowd_messages(room, ids[])`, which re-authorizes and scopes rows.

**Why.** Stated: *"The client deliberately ignores raw event content and calls
`get_arena_crowd_messages`… read-only, authorizes Room membership/visibility and
scopes rows to that Room and requested IDs."*

**Source.** Checkpoint §"Installed application contract". Implementation:
`services/arenaCrowdService.ts`, `scripts/crowd-rpc.test.cjs`.

**Consequence.** A realtime event is a *signal*, not data. Any code that renders
`payload.new` directly for Crowd text breaks this contract.

---

## D4 — `utils/releaseScope.ts` is client policy, never an authorization boundary

**Decision.** Release capability gating (`allowed` / `conditional` / `deferred`)
lives on the client as a UX and packaging policy.

**Why.** Stated verbatim in
[`../../utils/releaseScope.ts`](../../utils/releaseScope.ts): *"First-release
text-debate beta. Client policy, never an authorization boundary."* and
*"Preservation describes intent, not authorization. Every operation still needs
server checks."*

---

## D5 — Local Supabase uses a shifted port range

**Decision.** The local stack binds `55321` (+ `55322`/`55323`/…), not the
documented default `54321`.

**Why.** Recorded in [`.env.example`](../../.env.example): *"Local stack →
http://127.0.0.1:55321 (see supabase/config.toml — NOT 54321)"*. Source:
`supabase/config.toml` (`project_id = "clash"`, `port = 55321`).

**Consequence.** Hardcoding `54321` silently points at nothing or the wrong stack.

---

## D6 — TypeScript strict with zero `any`, and small component files

**Decision.** `strict: true`, no `any`, components roughly ≤150 lines, one phase
at a time.

**Why.** Stated in [`.clinerules`](../../.clinerules) and the README stack table.

---

## D7 — Fixtures are single-use, preserved evidence

**Decision.** Each authorized run creates at most one bounded fixture, which is
preserved afterwards — including when it fails. Settled fixtures are never
re-touched; partial fixtures are left `OPEN` to expire rather than settled late.

**Why.** Stated: *"A stopped run may leave its one fixture to expire naturally
without settlement. Preserve partial state; no second start, second duel,
cleanup, clock edit or automatic repair."* And: *"Its missed phases cannot be
accepted retrospectively."*

**Source.** Checkpoint §"Order, evidence and failure handling"; A50 report §6, §8.

---

## D8 — Guarded writes fail closed

**Decision.** Execution proxies/gateways validate actor identity, argument
shape, Room/Clash scope, token expiry, and budgets; on any mismatch, failure, or
ambiguity they fence subsequent writes.

**Why.** Stated: *"Unsupported args, wrong actor/Room/Clash, expired token,
budget excess, failed response or ambiguity fails closed; subsequent writes are
fenced."*

**Source.** Checkpoint §"Separately justified gateway proposal".

---

## D9 — New Architecture is enabled

**Decision.** `newArchEnabled: true` in `app.json`.

**Why.** Repository configuration. **Source implies** the migration was taken
deliberately for Reanimated 4 / RN 0.81 alignment; no written rationale located.

---

## D10 — Shared cross-agent knowledge lives in `AGENTS.md` + `docs/ai/`

**Decision.** One short `AGENTS.md` at the root as the universal entry point;
depth lives in `docs/ai/`, loaded on demand via `INDEX.md`. `CLAUDE.md` only
points at the same sources and never forks the rules.

**Why.** DeepSeek Harness loads `AGENTS.md` **and** `CLAUDE.md` from the project
root and deduplicates byte-identical content; Codex discovers `AGENTS.md`;
Claude Code reads `CLAUDE.md`. A single source avoids three drifting rule sets —
the exact failure this workspace is meant to prevent.

**Source.** Installed `@deepseek-ai/dsh-agent-instructions` reference
(`instructionFileCandidates: ['AGENTS.md', 'CLAUDE.md']`), documented in
[`CONTEXT_LAYOUT.md`](CONTEXT_LAYOUT.md).

**Consequence.** Do not add substantive rules to `CLAUDE.md`. Change `AGENTS.md`.
