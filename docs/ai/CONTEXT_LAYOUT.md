# CONTEXT_LAYOUT — How Each Agent Finds These Files

What each installed runtime actually reads, how it was determined, and what
remains unproven. **Do not assume parity between agents.**

Determined on 2026-11-05 on this machine by inspecting installed packages and
live behavior — not from vendor documentation.

---

## 1. Summary

| Runtime | Reads `AGENTS.md` | Reads `CLAUDE.md` | Finds `.agents/skills/` | Status |
|---|---|---|---|---|
| **DeepSeek Harness 0.2.1-rc.5** (desktop) | **PASS** — observed live | **PASS** — observed live | **PASS** — observed live | Fully connected |
| **Codex** (VS Code ext 26.930.61225, CLI 0.160.1) | PARTIAL — handling present, not exercised | NOT VERIFIED | NOT VERIFIED | Needs one confirmation run |
| **Claude Code** (VS Code ext 1.0.58) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | `claude` CLI not installed |

---

## 2. DeepSeek Harness — verified

**Instruction discovery.** The installed `@deepseek-ai/dsh-agent-instructions`
plugin loads, at the first request:

1. `$DSH_HOME/AGENTS.md` (i.e. `~/.dsh/AGENTS.md` — absent here)
2. `~/.agents/AGENTS.md` (absent here)
3. Every candidate from the project root down to the working directory:
   `AGENTS.md`, then `CLAUDE.md`, then `AGENTS.local.md` / `CLAUDE.local.md`.
   Project root = nearest ancestor containing `.git`.

Content identical after trimming is deduplicated — a `CLAUDE.md` that merely
copied `AGENTS.md` would not be rendered twice. **Our `AGENTS.md` and
`CLAUDE.md` differ deliberately**, so both load; `CLAUDE.md` adds only the
Claude-specific pointers.

A 65,536-byte default budget caps the whole rendered baseline. Our files are far
under it.

**Observed evidence:** both `AGENTS.md` and `CLAUDE.md` were injected into this
very session as workspace instructions, immediately after creation, with no
restart.

**Skill discovery.** `@deepseek-ai/dsh-skill-filesystem` scans, in rank order:

| Rank | Path |
|---|---|
| 100 | `<projectRoot>/.dsh/skills` |
| 200 | `<projectRoot>/.agents/skills` ← **we use this** |
| 300 | `customSkillDirs` |
| 400 | `~/.dsh/skills` |
| 500 | `~/.agents/skills` |

It needs `SKILL.md` with YAML frontmatter containing `name` (kebab-case) and
`description`. Discovery is **one level deep**: `<root>/<name>/SKILL.md` or
`<root>/<name>.md`; nested trees are ignored.

**Observed evidence:** `clash-handoff` appeared in this session's skill catalog
within seconds of the file being written — no restart, no configuration change.

**Refresh behavior:** no file watcher for instructions; changes surface on the
next successful `read`/`write`/`edit`, or on session resume. Skills are watched
and invalidate immediately.

---

## 3. Codex — PARTIAL

**Instruction discovery.** Codex's official contract is `AGENTS.md`, discovered
from the project root down through subdirectories, plus `$CODEX_HOME/AGENTS.md`.

Evidence collected here:

- The installed Codex CLI binary (`codex-cli 0.160.1`, bundled inside the VS
  Code extension at
  `%USERPROFILE%\.vscode\extensions\openai.chatgpt-26.930.61225-win32-x64\bin\windows-x86_64\codex.exe`)
  contains 73 `AGENTS.md` references and 2 `CLAUDE.md` references.
- `%USERPROFILE%\.codex\AGENTS.md` exists but is **empty** (0 bytes) — a global
  file that currently contributes nothing.
- `%USERPROFILE%\.codex\config.toml` already marks this project trusted:
  `[projects.'<repo_root>'] trust_level = "trusted"`.
- There is **no** `.codex/` directory in the repository.

**Not proven:** no Codex session was run, so actual pickup of the new root
`AGENTS.md` is unconfirmed. It is highly likely given the trust setting and the
standard contract, but "likely" is not "verified".

**Skills:** unconfirmed whether Codex 0.160.1 discovers `.agents/skills`. Its
global skills live under `%USERPROFILE%\.codex\skills`. Treat project skill
discovery as NOT VERIFIED.

**Global configuration was not modified.** `~/.codex/config.toml` and
`~/.codex/rules/default.rules` are untouched.

---

## 4. Claude Code — NOT VERIFIED

**What is installed.** Only the VS Code extension
`anthropic.claude-code-1.0.58`. Its own README states:

> **IMPORTANT**: This plugin requires Claude Code to be installed separately.

A scan of `extension.js` (332,210 bytes, bundled/minified) found **zero**
occurrences of `CLAUDE.md`, `AGENTS.md`, `.claude/skills`, or `.claude/settings.json`
— it is an IDE bridge (diffs, selection context, tab awareness), not the agent
runtime. The actual agent logic lives in the separately installed CLI, which is
**not present on PATH** (`claude` resolves to nothing; no `%USERPROFILE%\.claude\local`,
no npm-global `claude`).

**Consequence.** Nothing about Claude Code's file discovery can be verified on
this machine right now. Its documented behavior is that it reads `CLAUDE.md`,
and newer versions can additionally read `AGENTS.md` — but **that is not
verified here**, so `CLAUDE.md` exists as the guaranteed path.

`~/.claude/` currently contains only `ide/` lock files: no `settings.json`, no
`skills/`, no custom configuration to preserve or conflict with.

⚠️ **`~/.claude.json` is absent.** On a fresh CLI start, Claude Code may create
this file and run its first-run flow. That is user-level state, not repository
state, and is outside this task's authority to configure.

---

## 5. Deliberate design choices

1. **`AGENTS.md` is the single source of rules.** It is short by design and
   routes to `docs/ai/`.
2. **`CLAUDE.md` is a pointer, not a copy.** Duplicating rules across files is
   what causes agents to disagree.
3. **`docs/ai/` is loaded on demand, never injected wholesale.** Only the two
   root instruction files are auto-injected; the knowledge base costs zero
   tokens until an agent chooses to read it.
4. **The skill lives at `.agents/skills/`** because that is a real scanned root
   for the Harness and a conventional cross-tool location — not because every
   agent was confirmed to read it.
5. **No MCP servers, hooks, or memory capture were added.** See
   [`MEMORY_EVALUATION.md`](MEMORY_EVALUATION.md).

## 6. What to do to reach full PASS

| Runtime | Action | Verify by |
|---|---|---|
| Codex | Open this repo in a Codex session and ask it to state its rules | It should quote `AGENTS.md` §2/§5 |
| Codex | Ask whether `clash-handoff` is in its skill catalog | If absent, use `AGENTS.md` §4 manually — no adapter needed yet |
| Claude Code | Install the Claude Code CLI, then run it in this repo | It should load `CLAUDE.md`, which points at `AGENTS.md` |

Statuses here are superseded by whatever a later agent actually observes.
Record new findings in `HANDOFF.md`, and update this table.

---

## 7. Phase 2 re-verification (2026-11-05)

**Harness — still PASS.** `AGENTS.md` and `CLAUDE.md` were injected into the
Phase 2 session again, and `clash-handoff` remained in the skill catalog. No
configuration change was needed. Re-confirmed without touching settings.

**Codex — configuration inspected only, unchanged.**

- `~/.codex/config.toml` still trusts this project
  (`[projects.'<repo_root>'] trust_level = "trusted"`).
- `~/.codex/AGENTS.md` is still 0 bytes, so it contributes nothing and cannot
  shadow the project file.
- No `.codex/` directory exists in the repo; nothing to conflict.
- Live pickup remains **NOT TESTED** — no Codex session was run.

**Exact verification prompt for Codex.** Paste this into a Codex session opened
at `<REPO_ROOT>`. It is read-only and asks for quoted evidence
rather than a summary:

```text
Do not modify any files. Answer in three lines:
1. Quote the exact heading of section 2 in the root AGENTS.md.
2. List the three Git commands AGENTS.md requires before changing files.
3. Report whether a skill named "clash-handoff" appears in your skill catalog
   (yes/no). If no, say whether .agents/skills/clash-handoff/SKILL.md is readable.
```

Interpretation: a correct answer proves `AGENTS.md` discovery (PASS). Line 3 =
yes proves project skill discovery (PASS); "no" plus readable file means
`AGENTS.md` §4 is the fallback and no adapter is needed yet.

**Claude Code — still BLOCKED.** `claude` is not on PATH and none of the
standard install locations exist (`~/.local/bin/claude.exe`,
`%APPDATA%\npm\claude.cmd`, `%LOCALAPPDATA%\Programs\claude\`). `~/.claude/`
contains only `ide/` lock files; `~/.claude.json` is still absent. The VS Code
extension alone cannot run the agent.

**Official installation (Windows), for the owner to run — not run here:**

```powershell
# Recommended (official installer script):
irm https://claude.ai/install.ps1 | iex

# or, via WinGet:
winget install Anthropic.ClaudeCode
```

`npm install -g @anthropic-ai/claude-code` is **deprecated** by Anthropic — do
not use it. Source: the [official Claude Code README](https://github.com/anthropics/claude-code).

After installing, restart the terminal so `claude` enters PATH, then run
`claude` from the repository root and paste:

```text
Do not modify any files. Which instruction files did you load, and what do they
tell you to read next? Answer in two sentences.
```

Expect `CLAUDE.md` (pointing to `AGENTS.md` and `docs/ai/SAFETY.md`). If it
quotes `AGENTS.md` directly, that version also reads `AGENTS.md` — better still.
A first run may create `~/.claude.json`; that is user-level state, not repo state.

**Not verified:** Codex project-skill discovery; any Claude Code behaviour at all.
