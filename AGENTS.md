# CLASH — Agent Entry Point

Shared instructions for every coding agent working in this repository
(DeepSeek Harness, OpenAI Codex, Claude Code, and any IDE assistant that reads
`AGENTS.md`).

This file is deliberately short. **Do not expand it into a knowledge base.**
It is the entry point; the knowledge lives in [`docs/ai/INDEX.md`](docs/ai/INDEX.md).

---

## 1. Start every session the same way

1. **Confirm the workspace.** Repository root is the directory containing
   `.git`. On this machine: `<REPO_ROOT>`. If the working
   directory is elsewhere (a worktree, a copy, `.expo/` scratch tree), say so
   before doing anything.
2. **Read the shared rules.** This file, then [`docs/ai/INDEX.md`](docs/ai/INDEX.md).
3. **Read the local rules that already exist and still apply:**
   [`.clinerules`](.clinerules) (phased execution, TypeScript, no `any`, files
   under ~150 lines) and the README/`CLASH_SPEC.md` constraints they reference.
4. **Inspect Git before touching files** — see §2.
5. **Load only the documents your task needs.** See the routing table in
   `docs/ai/INDEX.md`. Do not read the whole corpus "to be safe".

## 2. Inspect Git state before any change

Run, and keep the output in mind for your handoff:

```powershell
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git status --short
```

Rules:

- This checkout has a **large, intentionally dirty working tree**. Untracked and
  modified files are usually someone's in-progress work or prior evidence.
- **Never** run `git reset`, `git clean`, `git checkout --`, `git stash`, or
  `git restore` to "tidy up". Never assume dirt is garbage.
- Never commit, push, tag, or deploy unless the current task explicitly
  authorizes it. A past authorization is not standing permission.
- Never modify the Git index as a side effect of a documentation or inspection
  task.

## 3. Retrieve information in scope

- Route through [`docs/ai/INDEX.md`](docs/ai/INDEX.md); it maps task type to the
  two or three documents that matter.
- Prefer `grep`/targeted reads over bulk file dumps. Evidence directories
  (`docs/evidence/`) contain large reports and screenshots — read the summary
  table, not every line.
- **Inspect the actual implementation before trusting any summary**, including
  the summaries in `docs/ai/`. Documents describe intent and history; the code,
  the migrations, and the test output are ground truth.
- Cite the file path (and line range where useful) for every nontrivial claim.

## 4. Handoff protocol

Every substantive task ends by updating [`docs/ai/HANDOFF.md`](docs/ai/HANDOFF.md)
with one new entry at the top. Keep it short and factual:

| Field | Content |
|---|---|
| Task | One sentence |
| Agent | Which agent/runtime, and model if relevant |
| Git baseline | Branch + short HEAD SHA you started from |
| Changed files | Exact paths you created or modified |
| Verified results | Only what you actually ran, with PASS / PARTIAL / BLOCKED / NOT TESTED |
| Limitations | What you could not check, and why |
| Pending actions | Next concrete step, and who must approve it |
| Approval required | Anything a human must authorize before the next agent proceeds |

Do not leave a task "done" in prose while leaving the handoff empty. The next
agent may not see your session.

The repeatable version of this workflow lives in
[`.agents/skills/clash-handoff/SKILL.md`](.agents/skills/clash-handoff/SKILL.md).

## 5. Evidence before "PASS"

- A `PASS` must name the command or artifact that produced it (test log name,
  file path, device screenshot, exit code).
- Distinguish the result classes explicitly: **PASS**, **PARTIAL**, **BLOCKED**,
  **NOT TESTED**. Never silently upgrade one into another.
- Automated green tests never substitute for native/device acceptance, and
  mocked tests never substitute for real backend integration.
- If you did not run it, write `NOT TESTED`. Not "should work".
- Do not fabricate IDs, screenshots, timestamps, or results.

## 6. Boundaries that always apply

Full detail in [`docs/ai/SAFETY.md`](docs/ai/SAFETY.md). The short version:

- **No** production or shared-environment access; no production database reads
  or writes.
- **No** Auth recovery, credential loading, token extraction, or secret
  rotation unless the current task names the exact operation and the owner
  approves it.
- **No** Supabase/database writes, migrations, grants, RLS changes, cron jobs,
  or fixture creation/settlement unless explicitly authorized in this task.
- **No** gateway/backend replacement or restart outside an approved plan.
- **No** global tool installation or changes to global agent configuration.
- **Never** commit secrets. `.env*` and `.expo/` private evidence stay out of Git.
- Preserve unrelated work, prior evidence, and running services.

When a boundary and a goal conflict, stop and ask the human owner. Do not widen
the boundary yourself.

## 7. Repository conventions worth knowing

- TypeScript strict, **zero `any`**; `npm run typecheck` must stay at zero errors.
- Keep components modular (~150 lines per file); avoid monolithic screens.
- Work one phase at a time; do not start phase N+1 before phase N compiles.
- Server-side authorization is authoritative. Client checks, including
  `utils/releaseScope.ts`, are policy hints, **never** an authorization boundary.
- Run tests in the way [`docs/ai/TEST_MATRIX.md`](docs/ai/TEST_MATRIX.md)
  describes, and record which class of evidence a run produced.
