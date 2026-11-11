# CLAUDE.md — CLASH

This file exists only because Claude Code reads `CLAUDE.md` natively.
**The rules are not duplicated here — that is deliberate.** A second copy would
drift out of sync with the other agents.

## Read, in this order

1. [`AGENTS.md`](AGENTS.md) — the shared entry point for all coding agents.
   Session startup, Git inspection, evidence rules, boundaries.
2. [`docs/ai/INDEX.md`](docs/ai/INDEX.md) — choose only the documents your task
   needs.
3. [`docs/ai/SAFETY.md`](docs/ai/SAFETY.md) — **mandatory** before any work
   involving Auth, the database, the gateway, fixtures, release scope, or
   commits. Its rules override `AGENTS.md` where they conflict.

## Keep in mind

- Read [`.clinerules`](.clinerules) — it still applies.
- The working tree is intentionally dirty. Never `git reset`, `git clean`,
  `git checkout --`, or `git stash`.
- **Never** commit or push unless the current task explicitly authorizes it.
  Cursor's `always-commit` / `auto-push` rules do **not** apply to Claude Code.
- Distinguish PASS / PARTIAL / BLOCKED / NOT TESTED. Never say "should work".
- End substantive work by updating [`docs/ai/HANDOFF.md`](docs/ai/HANDOFF.md).

## Handoff skill

If you have access to skill loading, use
[`.agents/skills/clash-handoff/SKILL.md`](.agents/skills/clash-handoff/SKILL.md)
for the repeatable handoff procedure. Whether Claude Code discovers this path
automatically is **not verified** — see
[`docs/ai/CONTEXT_LAYOUT.md`](docs/ai/CONTEXT_LAYOUT.md). If it does not appear
in your skill catalog, follow `AGENTS.md` §4 instead; it carries the same rules.

## Maintaining this file

Add nothing substantive here. Change `AGENTS.md` or `docs/ai/` instead.
