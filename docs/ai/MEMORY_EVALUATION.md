# MEMORY_EVALUATION — Claude-Mem and Local Memory Tooling (Inspection Only)

**Status: NOTHING WAS INSTALLED, CONFIGURED, OR ENABLED.** No package was added,
no MCP server registered, no hook created, no installer script run, no account
created. This document is a recommendation for Phase 2.

Evaluated: **Claude-Mem v15.9.0** (npm, Apache-2.0, published 2026-11-02).
Sources: [npm package page](https://www.npmjs.com/package/claude-mem),
[`native-harness-integrations.md`](https://raw.githubusercontent.com/thedotmack/claude-mem/HEAD/docs/native-harness-integrations.md),
[`codex-provider.md`](https://github.com/thedotmack/claude-mem/blob/HEAD/docs/codex-provider.md).

---

## 1. What it does

Captures tool-use observations during agent sessions, summarizes them with a
separate "observer" model, stores them in local SQLite (+ FTS5 keyword search,
optionally a Chroma vector index), and re-injects relevant context at the start
of future sessions. Exposes progressive-disclosure search
(`mem_search` → `mem_timeline` → `mem_get_observations`).

## 2. Environment fit

| Requirement | This machine | Status |
|---|---|---|
| Node.js ≥ 20 | v22.11.0 | PASS |
| pnpm (for DSH plugin install) | 10.34.5 | PASS |
| `uv` (vector search) | present | PASS |
| `bun` (worker process manager, auto-installed if missing) | **absent** | Would need installation |
| `~/.dsh` home present | present | PASS |
| Existing claude-mem state | none (`~/.claude-mem` absent) | Clean install possible |

## 3. Answers to the six questions

### Windows compatibility — PARTIAL PASS

Windows is supported. The installer places
`%LOCALAPPDATA%\claude-mem\bin\claude-mem.exe` and adds it to the **user
PATH**; hooks do not require Git Bash. Requires a terminal restart afterward to
pick up PATH. **Risk:** `bun` is not installed and the worker depends on it. That
is a global tool installation — outside this phase's authority.

### DeepSeek Harness Desktop compatibility — DOCUMENTED, NOT YET TESTED HERE

Notable: Claude-Mem now ships a **native DSH integration**.

```text
npx claude-mem install --ide dsh --dsh-profile <profile>
```

It installs the bundled `@claude-mem/dsh` package via DSH's own
`plugin --profile <name> add --workspace-root`, injects checkout context on
`agent/created`, and provides `mem_search` / `mem_timeline` /
`mem_get_observations` / `mem_save` / `mem_context`.

Two caveats specific to this installation:

1. **Profile name mismatch.** The docs default to `web`; this machine's only
   profile directory is `desktop` (`~/.dsh/profiles/desktop`). The correct
   `--dsh-profile` value must be confirmed before any install — guessing would
   silently target the wrong workspace.
2. **It mutates the DSH profile's pnpm workspace** — a real configuration
   change with a real rollback cost. It also adds a managed transcript watch
   over `~/.dsh/sessions`, i.e. it reads this machine's full DSH session logs.

### Codex integration — PARTIAL

Claude-Mem's "Codex" support has **two different meanings** that are easy to
conflate:

- **Codex as observation *provider*** (well documented): uses `codex app-server`
  over stdio with your existing ChatGPT login from `~/.codex/auth.json`. That
  file **exists on this machine**. API-key login is rejected. No OpenAI API key
  needed, and claude-mem does not store the credential.
- **Codex as an agent *being captured*** (the thing we actually want): not
  covered by the reviewed docs. Codex uses no lifecycle hooks, so capture would
  depend on transcript watching. **NOT VERIFIED.**
- No project-local Codex skill discovery path was confirmed either
  (see [`CONTEXT_LAYOUT.md`](CONTEXT_LAYOUT.md) §3).

### Claude Code integration — FULLEST SUPPORT, BUT UNTESTABLE TODAY

Claude-Mem targets Claude Code first: lifecycle hooks (SessionStart,
UserPromptSubmit, PreToolUse, PostToolUse, Stop, SessionEnd), a `/plugin`
marketplace install, and the `mem-search` skill.

**But the `claude` CLI is not installed on this machine** (only the VS Code
bridge extension). So even the best-supported path cannot be exercised now.

### Local storage, indexing, cross-agent retrieval — MOSTLY PASS

- Storage: SQLite + FTS5 locally; observations, sessions, summaries.
- Retrieval: hybrid keyword + vector.
- Cross-agent: a single worker can serve multiple harnesses. There is a
  setting `CLAUDE_MEM_SESSION_START_INCLUDE_ALL_SOURCES` (default `false`) that
  must be set to `true` for one harness's startup context to include another
  harness's observations. **Without it, cross-agent memory is partially blind** —
  a key configuration detail, not a default.

### Model / API cost — REAL BUT SMALL

Every captured turn triggers a summarization call by an "observer" model.

- Documented options: claude-mem hosted observer (30-day trial, then paid),
  your own OpenRouter/Gemini key, your Anthropic plan, or the Codex subscription
  provider.
- Claude-Mem publishes an OpenRouter price table used to compute observer
  expense; example rates in their dataset: `deepseek/deepseek-v4-flash`
  ≈ $0.098 / $0.196 per MTok, `anthropic/claude-sonnet-5` ≈ $2 / $10 per MTok.
- **Implication:** running the observer on a cheap model, or on the existing
  ChatGPT/Codex subscription, keeps cost near zero. Running it on a frontier
  model per turn on a long session is the expensive path.
- The DSH plugin turns plugin-level ingestion/summarization **off** to keep a
  single writer — good for duplication control, but it means capture volume is
  governed only by the transcript watcher.

### Secret capture and privacy risk — THE DECIDING CONCERN

| Risk | Detail |
|---|---|
| Broad transcript capture | The DSH integration watches **all** of `~/.dsh/sessions`. This repository's sessions routinely contain DB identifiers, service names, ports, and would-be credential handling. |
| Summaries sent off-process | Observations are summarized by an external model. Sensitive content can leave the machine unless redacted. |
| Redaction is opt-in | Only `<private>`-tagged content and screenshot capture are noted as controls; screenshot retention is off by default, but text capture is on. |
| Hosted/cloud path | The default install path offers a hosted account and Cloud Sync. That is a data-egress decision, not a local-tooling decision. |
| PATH + worker | Adds an executable to user PATH and runs a persistent local HTTP worker. |

**Our rules make this material.** [`SAFETY.md`](SAFETY.md) §2 forbids loading or
transmitting credentials. An automatic capture system that ingests every
session transcript raises the probability of secrets and private evidence being
summarized by a third-party model — exactly the failure mode the CLASH rules
exist to prevent.

### Duplicate or conflicting memory hooks — MANAGEABLE IF INSTALLED CAUTIOUSLY

- Clean baseline: `~/.claude-mem` absent, no `~/.claude/settings.json`, no
  `~/.agents` — nothing to conflict with today.
- DSH plugin explicitly disables its own ingestion to avoid double-writing
  alongside the worker watcher.
- Real duplication risk is with **this repository's own system**: `docs/ai/`
  plus `HANDOFF.md` are curated, reviewed, and cost zero tokens when unused.
  Two overlapping memory systems that disagree are worse than one.

---

## 4. Recommendation

**Do not adopt Claude-Mem as the primary cross-agent memory for CLASH.**

Phase 1 already provides durable, reviewable, zero-cost memory: `docs/ai/`
plus the `HANDOFF.md` protocol. It is versioned, diffable, and every entry is
graded PASS/PARTIAL/BLOCKED/NOT TESTED. Claude-Mem's value is *involuntary
recall of things nobody wrote down* — a nice-to-have, not the bottleneck here.
The actual bottleneck is that the native Arena acceptance is blocked.

### If you still want it in Phase 2, adopt it in this order

1. **Local-only, no account.** Use `--provider` with your own key or the Codex
   subscription path; keep Cloud Sync **off**. Do not create a hosted account.
2. **Fix the capture scope first.** Point the transcript watch at this
   repository's sessions only — not all of `~/.dsh/sessions`. Add a redaction
   pass before anything reaches an observer model.
3. **Resolve the profile name.** Confirm the actual DSH profile to install into
   (`desktop` here, not the documented default `web`).
4. **Install `bun` deliberately** as a known, reversible global change — this
   needs your explicit approval since it modifies global tooling.
5. **Set `CLAUDE_MEM_SESSION_START_INCLUDE_ALL_SOURCES=true`** only after
   confirming which harnesses actually write observations, so cross-agent recall
   is real rather than assumed.
6. **Pilot with one agent** (Claude Code, once its CLI is installed — the
   best-supported path) for a bounded period. Compare retrieval quality and cost
   against simply reading `HANDOFF.md`.
7. **Only then** extend to Codex and DSH, after verifying Codex capture actually
   works — that is currently NOT VERIFIED.

### What would change this recommendation

If, after several weeks, the `HANDOFF.md` log proves insufficient — because
agents repeatedly re-discover the same facts despite it — then involuntary
capture earns its risk. That is an empirical test, not a prediction.

### Do not do

- Do not install it globally and enable capture for every project by default.
- Do not point it at `~/.dsh/sessions` wholesale while this repo handles
  fixtures and credentials.
- Do not enable Cloud Sync or a hosted account without a separate privacy decision.

---

## 5. Phase 2 recommendation — safest local-first design

**Adopt no memory package.** Use a design that needs no daemon, no hooks, no
global capture, and no external model.

### The proposal: `docs/ai/` is already the searchable memory

Every property a cross-agent memory system is bought for is already present,
because the store is plain Markdown in Git:

| Requirement | How it is met today |
|---|---|
| Searchable | `grep`/`rg` over `docs/ai/*.md` and `docs/evidence/` — no index to build |
| Selective retrieval | `INDEX.md` routes task type → 2–3 documents |
| Cross-agent | all three agents read the same files at the same path |
| Auditable | plain-text diffs in review; every claim cites a path |
| Reversible | ordinary Git history; no database to corrupt |
| Secret-safe | nothing is captured implicitly, so nothing leaks implicitly |
| Cost | zero when unused (never auto-injected) |

### If search must get faster — add a generated index, not a capture system

Only if plain `grep` becomes slow should Phase 3 add **one** generated file,
`docs/ai/SEARCH_INDEX.md`, produced by a small offline script that scans
`docs/ai/` + `docs/evidence/*/REPORT.md` headings and writes a link table. It is:

- **local-first** — no network, no model calls;
- **deterministic** — regenerate and diff; a stale index is visible in Git;
- **selective** — the agent still opens only what `INDEX.md`/the index points at;
- **free to ignore** — delete the file and nothing breaks.

### Explicit non-goals

- No automatic session capture.
- No hooks or background workers.
- No third-party summarizer receiving CLASH transcripts or evidence.
- No MCP server until a concrete retrieval gap justifies one.

### Decision rule

Revisit only when a concrete, repeatable failure appears: an agent re-derives a
fact that `HANDOFF.md` or `docs/ai/` already recorded, twice in the same week.
Record the instance; if it keeps happening, the fix is *better routing in
`INDEX.md`*, not a memory daemon.

**Status: recommendation only. Nothing was installed, enabled, or scheduled.**
