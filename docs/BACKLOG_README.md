# Phase 1 backlog — import instructions

## Files

| File | Purpose |
|---|---|
| `phase1_backlog.csv` | 132 tickets covering every Phase 1 module |
| `import_backlog.py` | Creates the issues, labels, milestones and project fields |

## Before you run it

GitHub Projects has **no CSV import in the web UI**. The script uses the GitHub CLI instead.

```bash
# 1. Install the GitHub CLI, then authenticate
gh auth login

# 2. Grant the project scope — the default token does not include it
gh auth refresh -s project

# 3. Confirm the project number (visible in the project URL)
gh project list --owner <your-username>
```

The project must already have the custom fields **Requirement**, **Estimate**, **Module** and **Category**. The script exits with a clear message if any are missing.

## Running it

Always dry-run first:

```bash
python3 import_backlog.py --owner omer9618 --repo lms --project 1 --dry-run
```

Then import a small batch to confirm the fields populate correctly:

```bash
python3 import_backlog.py --owner omer9618 --repo lms --project 1 --limit 5
```

Check those five items on the board. If Requirement, Estimate, Module and Category are set, run the rest:

```bash
python3 import_backlog.py --owner omer9618 --repo lms --project 1
```

It takes roughly ten minutes for 132 items — there is a deliberate pause between calls to stay inside GitHub's secondary rate limits.

**The script is not idempotent.** Running it twice creates duplicate issues. If a run fails partway, delete what was created before retrying, or use `--limit` and edit the CSV to skip completed rows.

## What it creates

- **8 labels** — Feature, Bug, Tech Debt, Blocked-Client, Phase-2, month-1, month-2, month-3
- **3 milestones** — M1 Content Platform, M2 Purchase Loop, M3 Feature Complete
- **132 issues**, each with a body containing the requirement reference, estimate, module and a *Done when* checklist
- Each issue added to the project with Requirement, Estimate, Module and Category populated

Everything lands in **Backlog**. Nothing is moved to Ready automatically — that is a decision for your planning session.

## The ten client questions

Ten tickets are tagged **Blocked-Client** with a zero estimate. They are not development work; they are the unanswered questions that block real tickets. They appear in your Blocked view and should be reviewed weekly.

Nothing that depends on them should move to Ready until they are closed.

## Editing before import

The CSV is the source of truth and is meant to be edited. Useful adjustments:

- **Owner** — add a column and assign, or leave assignment to the board
- **Estimate** — revise anything that looks wrong to you; you know your own pace
- **Split or merge** — any ticket over about 12 hours is probably two tickets
- **Delete** — remove anything you consider out of scope, but check it is not referenced by the FSD first

Column meanings:

| Column | Notes |
|---|---|
| Title | Issue title |
| Module | Must match a Module option on the project exactly |
| Category | Must match a Category option exactly |
| Estimate | Hours, integer |
| Milestone | M1, M2 or M3 |
| Requirement | FSD or SRS reference |
| DoneWhen | Semicolon-separated; each becomes a checklist item |
