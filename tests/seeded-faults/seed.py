"""Seed the known faults into copies of the base site.

Usage:
  python3 -I tests/seeded-faults/seed.py check                 verify that each fault applies to the base site
  python3 -I tests/seeded-faults/seed.py build [out_dir]       build out_dir/base and out_dir/<fault id> for each fault
  python3 -I tests/seeded-faults/seed.py list                  print the faults by criterion
  python3 -I tests/seeded-faults/seed.py combine <name> <ids> [--out out_dir] [--truth file] [--dry]
                                                               build out_dir/<name> with several faults at once, for the cycle test;
                                                               <ids> is a comma list of fault ids or "all"; the truth goes to the file,
                                                               not into the site; --dry only reports which faults apply

The default out_dir is tests/seeded-faults/build, which Git ignores. Each built
variant gets a fault.json with the fault and the line of each edit, so that a
test of the skill can compare the reported source with the real origin.
"""
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FAULTS = os.path.join(HERE, "faults.json")
PAGES = ["index.html", "articles.html", "storage.html", "products.html", "order.html", "order-review.html",
         "order-done.html", "help.html", "account.html", "sitemap.html", "privacy.html", "search.html"]


def load():
    with open(FAULTS, encoding="utf-8") as f:
        return json.load(f)


def apply_edit(root, edit, dry_run):
    """Apply one edit under root. Return (ok, message, line)."""
    path = os.path.join(root, edit["file"])
    if "content" in edit:
        if not dry_run:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                f.write(edit["content"])
        return True, "new file", 1
    if not os.path.exists(path):
        return False, "file not found: " + edit["file"], None
    with open(path, encoding="utf-8") as f:
        text = f.read()
    if "append" in edit:
        if not dry_run:
            with open(path, "a", encoding="utf-8") as f:
                f.write(edit["append"])
        return True, "append", text.count("\n") + 1
    count = text.count(edit["find"])
    if count != 1:
        return False, f"find string occurs {count} times in {edit['file']}: {edit['find'][:60]!r}", None
    pos = text.index(edit["find"])
    line = text[:pos].count("\n") + 1
    if not dry_run:
        with open(path, "w", encoding="utf-8") as f:
            f.write(text.replace(edit["find"], edit["replace"], 1))
    return True, "replace", line


def check(data):
    site = os.path.join(HERE, data["site"])
    problems = 0
    ids = set()
    criteria = set()
    for fault in data["faults"]:
        if fault["id"] in ids:
            print("ERROR duplicate id", fault["id"]); problems += 1
        ids.add(fault["id"])
        for key in ("id", "criterion", "title", "edits", "page", "element", "expected", "decider", "origin", "solution"):
            if key not in fault:
                print("ERROR", fault["id"], "has no", key); problems += 1
        if fault.get("expected") not in data["expected_values"]:
            print("ERROR", fault["id"], "expected value", fault.get("expected")); problems += 1
        if fault.get("decider") not in data["deciders"]:
            print("ERROR", fault["id"], "decider", fault.get("decider")); problems += 1
        if fault.get("page") not in PAGES:
            print("ERROR", fault["id"], "page", fault.get("page")); problems += 1
        criteria.add(fault["criterion"])
        for edit in fault["edits"]:
            ok, message, _ = apply_edit(site, edit, dry_run=True)
            if not ok:
                print("ERROR", fault["id"], message); problems += 1
    crit_file = os.path.join(HERE, "..", "..", "criteria", "criteria.json")
    if os.path.exists(crit_file):
        with open(crit_file, encoding="utf-8") as f:
            known = {e["id"] for e in json.load(f)["criteria"]}
        unknown = criteria - known
        if unknown:
            print("ERROR unknown criteria", sorted(unknown)); problems += 1
        missing = sorted(known - criteria, key=lambda x: [int(p) for p in x.split(".")])
        print(f"{len(data['faults'])} faults for {len(criteria)} of {len(known)} criteria. No fault for: {', '.join(missing)}")
    print("check:", "OK" if problems == 0 else f"{problems} problems")
    return problems == 0


def build(data, out_dir):
    site = os.path.join(HERE, data["site"])
    if os.path.exists(out_dir):
        shutil.rmtree(out_dir)
    shutil.copytree(site, os.path.join(out_dir, "base"))
    base_sitemap = os.path.join(out_dir, "base", "sitemap.xml")
    with open(base_sitemap, encoding="utf-8") as f:
        xml = f.read().replace("http://127.0.0.1:8080/", "http://127.0.0.1:8080/base/")
    with open(base_sitemap, "w", encoding="utf-8") as f:
        f.write(xml)
    with open(os.path.join(out_dir, "base", "fault.json"), "w", encoding="utf-8") as f:
        json.dump({"id": "base", "expected": data["base_expected"]}, f, indent=1)
    rows = []
    for fault in data["faults"]:
        root = os.path.join(out_dir, fault["id"])
        shutil.copytree(site, root)
        applied = []
        for edit in fault["edits"]:
            ok, message, line = apply_edit(root, edit, dry_run=False)
            if not ok:
                raise SystemExit("ERROR " + fault["id"] + " " + message)
            applied.append({"file": edit["file"], "line": line, "kind": message})
        sitemap = os.path.join(root, "sitemap.xml")
        with open(sitemap, encoding="utf-8") as f:
            xml = f.read().replace("http://127.0.0.1:8080/", f"http://127.0.0.1:8080/{fault['id']}/")
        with open(sitemap, "w", encoding="utf-8") as f:
            f.write(xml)
        record = dict(fault)
        record["applied"] = applied
        with open(os.path.join(root, "fault.json"), "w", encoding="utf-8") as f:
            json.dump(record, f, indent=1)
        rows.append(f'<tr><td>{fault["id"]}</td><td>{fault["criterion"]}</td><td>{fault["title"]}</td>'
                    f'<td>{fault["expected"]}, {fault["decider"]}</td><td><a href="{fault["id"]}/{fault["page"]}">{fault["page"]}</a></td></tr>')
    with open(os.path.join(out_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Seeded faults</title></head><body>'
                '<h1>Seeded faults</h1><p><a href="base/index.html">The base site with no fault</a></p>'
                '<table><tr><th>Fault</th><th>Criterion</th><th>Title</th><th>Expected</th><th>Page</th></tr>'
                + "".join(rows) + "</table></body></html>")
    print(f"built base and {len(data['faults'])} variants in {out_dir}")


def combine(data, argv):
    """Build one site with several faults, for the cycle test. A fault whose edits do not apply on the current copy is skipped."""
    if len(argv) < 2:
        raise SystemExit("usage: combine <name> <ids> [--out out_dir] [--truth file] [--dry]")
    name, ids = argv[0], argv[1]
    out_dir = argv[argv.index("--out") + 1] if "--out" in argv else os.path.join(HERE, "build")
    truth_file = argv[argv.index("--truth") + 1] if "--truth" in argv else os.path.join(out_dir, name + ".truth.json")
    dry = "--dry" in argv
    wanted = [f["id"] for f in data["faults"]] if ids == "all" else ids.split(",")
    by_id = {f["id"]: f for f in data["faults"]}
    for i in wanted:
        if i not in by_id:
            raise SystemExit("unknown fault " + i)
    root = os.path.join(out_dir, name)
    work = root if not dry else os.path.join(out_dir, "." + name + "-dry")
    if os.path.exists(work):
        shutil.rmtree(work)
    shutil.copytree(os.path.join(HERE, data["site"]), work)
    applied_faults, skipped = [], []
    for i in wanted:
        fault = by_id[i]
        ok_all = all(apply_edit(work, e, dry_run=True)[0] for e in fault["edits"])
        if not ok_all:
            skipped.append((i, [apply_edit(work, e, dry_run=True)[1] for e in fault["edits"] if not apply_edit(work, e, dry_run=True)[0]][0]))
            continue
        applied = []
        for e in fault["edits"]:
            ok, message, line = apply_edit(work, e, dry_run=False)
            applied.append({"file": e["file"], "line": line, "kind": message})
        record = dict(fault)
        record["applied"] = applied
        applied_faults.append(record)
    sitemap = os.path.join(work, "sitemap.xml")
    with open(sitemap, encoding="utf-8") as f:
        xml = f.read().replace("http://127.0.0.1:8080/", f"http://127.0.0.1:8080/{name}/")
    with open(sitemap, "w", encoding="utf-8") as f:
        f.write(xml)
    for i, why in skipped:
        print(f"skipped {i}: {why}")
    if dry:
        shutil.rmtree(work)
        print(f"dry: {len(applied_faults)} faults apply, {len(skipped)} skipped")
        print(",".join(f["id"] for f in applied_faults))
        return
    with open(truth_file, "w", encoding="utf-8") as f:
        json.dump({"name": name, "faults": applied_faults, "skipped": [i for i, _ in skipped]}, f, indent=1)
    print(f"built {root} with {len(applied_faults)} faults, {len(skipped)} skipped; truth in {truth_file}")


def list_faults(data):
    by = {}
    for fault in data["faults"]:
        by.setdefault(fault["criterion"], []).append(fault)
    for crit in sorted(by, key=lambda x: [int(p) for p in x.split(".")]):
        for fault in by[crit]:
            print(f"{crit:7} {fault['id']:36} {fault['expected']:14} {fault['decider']:7} {fault['page']}")


def main(argv):
    data = load()
    command = argv[1] if len(argv) > 1 else "check"
    if command == "check":
        sys.exit(0 if check(data) else 1)
    if command == "build":
        if not check(data):
            sys.exit(1)
        build(data, argv[2] if len(argv) > 2 else os.path.join(HERE, "build"))
    elif command == "list":
        list_faults(data)
    elif command == "combine":
        combine(data, argv[2:])
    else:
        print(__doc__)


if __name__ == "__main__":
    main(sys.argv)
