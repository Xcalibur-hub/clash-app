---
name: clash-handoff
description: Use when finishing, pausing, or taking over substantive CLASH work, and whenever another agent may continue the task. Enforces git-state inspection, scoped knowledge retrieval, evidence grading, and a concise HANDOFF.md entry so DeepSeek Harness, Codex, and Claude Code can switch without rediscovering prior work.
whenToUse: At the start of taking over an existing task, and at the end of any substantive task before reporting completion.
---

# CLASH Handoff

A short, repeatable procedure for transferring work between agents in this
repository. It prevents the two expensive failures: re-discovering what another
agent already built, and reporting a result as finished when it is not.

Work from the repository root (the directory containing `.git`).

---

## Taking over a task

### 1. Inspect Git state

```powershell
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git status --short
git diff --cached --stat
```

Record branch and short SHA. Expect a dirty tree — it is intentional. Never
run `git reset`, `git clean`, `git checkout --`, `git restore`, or `git stash`.
If the index already holds staged changes you did not create, stop and report it
rather than clearing it.

### 2. Read the routed documents

1. `AGENTS.md` — shared rules.
2. `docs/ai/INDEX.md` — pick the 2–3 documents your task needs.
3. `docs/ai/HANDOFF.md` — the most recent entry only.
4. `docs/ai/SAFETY.md` — always, before touching Auth, DB, gateway, fixtures,
   release scope, or Git history.

Do not read the whole `docs/ai/` folder. Do not bulk-read `docs/evidence/`.

### 3. Verify the summary against reality

The handoff is a claim, not a fact. Before trusting "implemented" or "passing":

- Open the cited source file and confirm the symbol exists.
- Check whether the cited test file is actually wired into `npm test`.
- Check whether the claim is about HEAD or about uncommitted work
  (`git diff`, `git log -1`).

If reality disagrees with the document, trust reality and correct the document
as part of your work.

### 4. Confirm authorization

Read the task you were given. Confirm it explicitly covers anything from
`SAFETY.md` §9. If it does not, stop and ask before acting — do not infer
permission from past runs or prior approvals.

---

## Finishing a task

### 5. Run the evidence you can afford

Choose checks by what the task actually changed. See
`docs/ai/TEST_MATRIX.md`. Prefer static and offline checks; never start a
database, service, or device run to strengthen a report unless authorized.

### 6. Grade every result honestly

Use exactly these classes:

| Class | Meaning |
|---|---|
| **PASS** | Executed, observed, artefact named |
| **PARTIAL** | Executed, incomplete coverage — say what was not covered |
| **BLOCKED** | Cannot be executed now; say why |
| **NOT TESTED** | Not attempted |

Never promote a class in the summary. Automated green ≠ native acceptance.
Mocked ≠ integrated.

### 7. Update `docs/ai/HANDOFF.md`

Prepend one entry directly under the intro, newest first. Keep it under ~30
lines. All seven fields are required — an entry missing "Approval required" or
"Next safe action" is not a handoff.

```markdown
## YYYY-MM-DD — <task title>

**Task / Agent:** <one sentence> — <runtime, model>
**Git baseline:** `<branch>` @ `<short sha>`; tree dirty/clean; index empty/N files

**Changed files:** <exact paths>

**Verified status:**
- <thing> → PASS (`<log/artefact>`)
- <thing> → PARTIAL (<what was not covered>)
- <thing> → BLOCKED (<reason>)

**Tests / evidence:** <commands run + artefact names> — or `none run`

**Unfinished:** <what remains, or `none`>

**Approval required:** <what a human must authorize next, or `none`>

**Next safe action:** <the single next step that needs no new authorization>
```

Then **delete** the oldest entry once the log exceeds ~10 entries; move retired
entries to `docs/ai/handoff/archive/YYYY-MM.md` rather than losing them. The log
is a transfer mechanism, not a project history — do not restate what
`CURRENT_STATE.md`, `IMPLEMENTED.md`, or `docs/evidence/` already record.

### 8. Update `CURRENT_STATE.md` only if the verified baseline changed

Update it when branch/HEAD meaningfully moved, a risk was closed or opened, or
fixture state changed. Otherwise leave it alone.

### 9. Keep the change set tight

- Touch only files your task needs.
- Do not reformat, re-sort, or "clean up" unrelated files.
- Do not commit, push, tag, or deploy unless the task explicitly says so.
- Leave the working tree otherwise exactly as you found it, minus your own
  intentional additions.

### 9a. Keep the prompt cache warm

If you edit `AGENTS.md` or `CLAUDE.md`, do it at the **start** of a session, not
mid-task — the instruction baseline is re-rendered on change and the reusable
prompt prefix ends there. Do not switch provider or model mid-task. See
`docs/ai/CACHING.md`.

### 10. Report back

Final message: what changed, what was proven, what remains, what needs approval.
Name the files. Name the evidence. Do not restate the whole repository.
