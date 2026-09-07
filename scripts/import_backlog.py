#!/usr/bin/env python3
"""
Import phase1_backlog.csv into GitHub Issues and a GitHub Project (v2).

Prerequisites
-------------
1. GitHub CLI installed and authenticated:
       gh auth login
       gh auth refresh -s project        # project scope is required
2. The project already exists with these custom fields:
       Requirement (text), Estimate (number), Module (single select),
       Category (single select), Status (single select)
3. The repository exists and is linked to the project.

Usage
-----
    python3 import_backlog.py --owner omer9618 --repo lms --project 1
    python3 import_backlog.py --owner omer9618 --repo lms --project 1 --dry-run

Start with --dry-run. It prints what would be created without touching anything.
"""

import argparse
import csv
import json
import os
import subprocess
import sys
import tempfile
import time

MILESTONES = {
    "M1": ("M1 Content Platform", "Teacher authors a course, admin approves, student views a lesson."),
    "M2": ("M2 Purchase Loop", "Student finds a course, pays, is verified, gains access. Quizzes work."),
    "M3": ("M3 Feature Complete", "Financial layer, administration, progress, hardening and handover."),
}

LABEL_COLOURS = {
    "Feature": "1D76DB",
    "Bug": "D73A4A",
    "Tech Debt": "FBCA04",
    "Blocked-Client": "B60205",
    "Phase-2": "5319E7",
    "month-1": "C2E0C6",
    "month-2": "C2E0C6",
    "month-3": "C2E0C6",
}

MILESTONE_LABEL = {"M1": "month-1", "M2": "month-2", "M3": "month-3"}


def run(cmd, check=True, capture=True):
    """Run a command, returning stdout. Uses shell on Windows for compatibility."""
    if isinstance(cmd, list):
        result = subprocess.run(cmd, capture_output=capture, text=True)
    else:
        result = subprocess.run(cmd, shell=True, capture_output=capture, text=True)
    if check and result.returncode != 0:
        sys.stderr.write(f"\nCommand failed: {cmd}\n{result.stderr}\n")
        sys.exit(1)
    return result.stdout.strip() if capture else ""


def ensure_gh():
    if run(["gh", "--version"], check=False) == "":
        sys.exit("GitHub CLI not found. Install it and run: gh auth login")


def ensure_labels(owner, repo, dry):
    print("\n== Labels ==")
    existing = json.loads(run(["gh", "label", "list", "--repo", f"{owner}/{repo}", "--limit", "200", "--json", "name"]))
    have = {l["name"] for l in existing}
    for name, colour in LABEL_COLOURS.items():
        if name in have:
            print(f"  exists  {name}")
            continue
        if dry:
            print(f"  CREATE  {name}")
            continue
        run(["gh", "label", "create", name, "--repo", f"{owner}/{repo}", "--color", colour], check=False)
        print(f"  created {name}")


def ensure_milestones(owner, repo, dry):
    print("\n== Milestones ==")
    raw = json.loads(
        run(["gh", "api", f"repos/{owner}/{repo}/milestones?state=all"])
    )
    existing = [{"title": m["title"], "number": m["number"]} for m in raw]
    have = {m["title"]: m["number"] for m in existing}
    numbers = {}
    for key, (title, desc) in MILESTONES.items():
        if title in have:
            numbers[key] = have[title]
            print(f"  exists  {title}")
            continue
        if dry:
            print(f"  CREATE  {title}")
            numbers[key] = None
            continue
        out = run(
            ["gh", "api", f"repos/{owner}/{repo}/milestones",
             "-f", f"title={title}", "-f", f"description={desc}"]
        )
        numbers[key] = json.loads(out)["number"]
        print(f"  created {title}")
    return numbers


def project_metadata(owner, project_number):
    """Return project id plus field ids and single-select option ids."""
    print("\n== Project fields ==")
    proj = json.loads(run(["gh", "project", "view", str(project_number), "--owner", owner, "--format", "json"]))
    project_id = proj["id"]

    fields = json.loads(
        run(["gh", "project", "field-list", str(project_number), "--owner", owner, "--format", "json", "--limit", "60"])
    )["fields"]

    meta = {"project_id": project_id, "fields": {}}
    for f in fields:
        entry = {"id": f["id"], "type": f.get("type", ""), "options": {}}
        for opt in f.get("options", []) or []:
            entry["options"][opt["name"]] = opt["id"]
        meta["fields"][f["name"]] = entry
        print(f"  {f['name']:16} {f.get('type','')}")

    for required in ("Requirement", "Estimate", "Module", "Category"):
        if required not in meta["fields"]:
            sys.exit(
                f"\nField '{required}' not found on the project. "
                "Create it before running this script."
            )
    return meta


def build_body(row):
    done = [d.strip() for d in row["DoneWhen"].split(";") if d.strip()]
    lines = [
        f"**Requirement:** {row['Requirement']}",
        "",
        f"**Estimate:** {row['Estimate']} hours",
        "",
        f"**Module:** {row['Module']}",
        "",
        "**Done when:**",
    ]
    for d in done:
        lines.append(f"- [ ] {d}")
    if row["Category"] not in ("Blocked-Client", "Phase-2"):
        lines += [
            "- [ ] Reviewed and merged",
            "- [ ] Deployed to staging",
        ]
    else:
        lines.append("")
        lines.append("_No code change. This ticket closes when the client answers._")
    return "\n".join(lines)


def set_field(meta, item_id, field_name, value, dry):
    field = meta["fields"][field_name]
    pid = meta["project_id"]
    fid = field["id"]

    if field["options"]:
        opt_id = field["options"].get(value)
        if not opt_id:
            print(f"      ! no option '{value}' on {field_name}, skipped")
            return
        extra = ["--single-select-option-id", opt_id]
    elif field_name == "Estimate":
        extra = ["--number", str(value)]
    else:
        extra = ["--text", str(value)]

    if dry:
        return
    run(
        ["gh", "project", "item-edit", "--id", item_id, "--project-id", pid, "--field-id", fid] + extra,
        check=False,
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--owner", required=True, help="GitHub user or org that owns the project")
    ap.add_argument("--repo", required=True, help="Repository name")
    ap.add_argument("--project", required=True, help="Project number, e.g. 1")
    ap.add_argument("--csv", default="phase1_backlog.csv")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="Only import the first N rows")
    args = ap.parse_args()

    ensure_gh()
    dry = args.dry_run
    if dry:
        print("DRY RUN — nothing will be created.")

    rows = list(csv.DictReader(open(args.csv, encoding="utf-8")))
    if args.limit:
        rows = rows[: args.limit]

    total = sum(int(r["Estimate"]) for r in rows)
    print(f"\n{len(rows)} tickets, {total} estimated hours")

    ensure_labels(args.owner, args.repo, dry)
    milestones = ensure_milestones(args.owner, args.repo, dry)
    meta = None if dry else project_metadata(args.owner, args.project)

    print("\n== Issues ==")
    for i, row in enumerate(rows, 1):
        title = row["Title"]
        body = build_body(row)
        labels = [row["Category"], MILESTONE_LABEL[row["Milestone"]]]
        ms_title = MILESTONES[row["Milestone"]][0]

        print(f"  [{i:3}/{len(rows)}] {title[:64]}")

        if dry:
            continue

        body_file = os.path.join(tempfile.gettempdir(), "_issue_body.md")
        with open(body_file, "w", encoding="utf-8") as fh:
            fh.write(body)

        issue_cmd = ["gh", "issue", "create", "--repo", f"{args.owner}/{args.repo}",
                     "--title", title, "--body-file", body_file,
                     "--milestone", ms_title]
        for l in labels:
            issue_cmd += ["--label", l]
        url = run(issue_cmd)

        item_add_result = subprocess.run(
            ["gh", "project", "item-add", args.project, "--owner", args.owner,
             "--url", url, "--format", "json"],
            capture_output=True, text=True
        )
        if item_add_result.returncode == 0:
            item_id = json.loads(item_add_result.stdout.strip())["id"]
        else:
            # Item already exists (auto-add workflow), find its ID
            print(f"      (already on board, looking up item id...)")
            issue_number = url.rstrip("/").split("/")[-1]
            list_raw = run(
                ["gh", "project", "item-list", args.project, "--owner", args.owner,
                 "--format", "json", "--limit", "300"],
                check=False
            )
            item_id = None
            if list_raw:
                list_data = json.loads(list_raw)
                for item in list_data.get("items", []):
                    content = item.get("content", {})
                    if content and str(content.get("number")) == str(issue_number):
                        item_id = item["id"]
                        break
            if item_id is None:
                print(f"      ! could not find item id, skipping field updates")
                time.sleep(0.4)
                continue

        set_field(meta, item_id, "Requirement", row["Requirement"], dry)
        set_field(meta, item_id, "Estimate", row["Estimate"], dry)
        set_field(meta, item_id, "Module", row["Module"], dry)
        set_field(meta, item_id, "Category", row["Category"], dry)

        time.sleep(0.4)  # stay well inside secondary rate limits

    print("\nDone.")
    if not dry:
        print("All items land in Backlog. Move a first batch to Ready in your planning session.")


if __name__ == "__main__":
    main()
