#!/usr/bin/env python3
"""Build criteria/criteria.json from the hand-authored base data and two downloaded sources.

Usage (from the project root):
    python3 -I criteria/build.py criteria/criteria.base.json criteria/sources/axe/rule-descriptions.md \
        criteria/sources/act/testcases.json criteria/criteria.json

The sources are untrusted downloads. This script only parses them as text and JSON.
"""
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import date
from html import unescape
from pathlib import Path

PRINCIPLES = {"1": "perceivable", "2": "operable", "3": "understandable", "4": "robust"}
GUIDELINES = {
    "1.1": "Text Alternatives", "1.2": "Time-based Media", "1.3": "Adaptable", "1.4": "Distinguishable",
    "2.1": "Keyboard Accessible", "2.2": "Enough Time", "2.3": "Seizures and Physical Reactions",
    "2.4": "Navigable", "2.5": "Input Modalities",
    "3.1": "Readable", "3.2": "Predictable", "3.3": "Input Assistance",
    "4.1": "Compatible",
}
UNDERSTANDING = "https://www.w3.org/WAI/WCAG22/Understanding/{slug}.html"
WCAG_TAG = re.compile(r"^wcag(\d)(\d)(\d+)$")
LINK = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")

SECTION_CATEGORY = {
    "WCAG 2.0 Level A & AA Rules": "wcag",
    "WCAG 2.1 Level A & AA Rules": "wcag",
    "WCAG 2.2 Level A & AA Rules": "wcag",
    "Best Practices Rules": "best-practice",
    "WCAG 2.x level AAA rules": "aaa",
    "Experimental Rules": "experimental",
    "Deprecated Rules": "deprecated",
}


def parse_axe(path: Path):
    """Return a list of axe rules with their WCAG criteria, from rule-descriptions.md."""
    rules = []
    category = None
    header = None
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line.startswith("## "):
            category = SECTION_CATEGORY.get(line[3:].strip())
            header = None
            continue
        if category is None or not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if header is None:
            header = [c.lower() for c in cells]
            continue
        if set("".join(cells)) <= set(":- "):
            continue  # the separator row
        row = dict(zip(header, cells))
        m = LINK.match(row.get("rule id", ""))
        if not m:
            continue
        tags = [t.strip() for t in row.get("tags", "").split(",") if t.strip()]
        criteria = []
        for t in tags:
            mt = WCAG_TAG.match(t)
            if mt:
                criteria.append(f"{mt.group(1)}.{mt.group(2)}.{int(mt.group(3))}")
        act_ids = [a for a, _ in LINK.findall(row.get("act rules", ""))]
        rules.append({
            "id": m.group(1),
            "url": m.group(2),
            "description": unescape(row.get("description", "")),
            "impact": row.get("impact", "") or None,
            "category": category,
            "issue_type": row.get("issue type", "") or None,
            "tags": tags,
            "criteria": criteria,
            "act_rules": act_ids,
            "experimental": "experimental" in tags or category == "experimental",
            "best_practice": "best-practice" in tags,
        })
    return rules


def parse_act(path: Path):
    """Return a dict of ACT rules with their criteria mapping, from testcases.json."""
    data = json.loads(path.read_text(encoding="utf-8"))
    rules = {}
    for tc in data["testcases"]:
        r = rules.setdefault(tc["ruleId"], {
            "id": tc["ruleId"], "name": tc["ruleName"], "page": tc["rulePage"],
            "approved": False, "criteria": {}, "test_cases": Counter(),
        })
        if tc.get("approved"):
            r["approved"] = True
        r["test_cases"][tc["expected"]] += 1
        for key, val in (tc.get("ruleAccessibilityRequirements") or {}).items():
            prefix, _, crit = key.partition(":")
            if not prefix.startswith("wcag2"):
                continue
            if "secondary" in val:
                relation = "secondary"
            elif val.get("forConformance"):
                relation = "conformance"
            else:
                relation = "primary"
            r["criteria"][crit] = {"relation": relation, "version": prefix.replace("wcag2", "2.")}
    for r in rules.values():
        r["test_cases"] = dict(r["test_cases"])
    return data, rules


def main(base_path, axe_path, act_path, out_path):
    base = json.loads(Path(base_path).read_text(encoding="utf-8"))
    axe_rules = parse_axe(Path(axe_path))
    act_data, act_rules = parse_act(Path(act_path))
    axe_version = (Path(axe_path).parent / "VERSION").read_text(encoding="utf-8").strip()

    axe_by_crit = defaultdict(list)
    for r in axe_rules:
        for c in r["criteria"]:
            axe_by_crit[c].append(r)
    act_by_crit = defaultdict(list)
    for r in act_rules.values():
        for c, rel in r["criteria"].items():
            act_by_crit[c].append((r, rel))

    criteria = []
    ids = set()
    for b in base["criteria"]:
        cid = b["id"]
        assert cid not in ids, f"duplicate {cid}"
        ids.add(cid)
        p, g, _ = cid.split(".")
        entry = {
            "id": cid,
            "name": b["name"],
            "level": b["level"],
            "principle": PRINCIPLES[p],
            "guideline": {"id": f"{p}.{g}", "name": GUIDELINES[f"{p}.{g}"]},
            "since": b["since"],
            "understanding": UNDERSTANDING.format(slug=b["slug"]),
            "method": b["method"],
            "test_groups": b["test_groups"],
            "automatic_test": b["automatic_test"],
            "review_or_person_check": b["review_or_person_check"],
            "conditions": b["conditions"],
            "non_interference": b["non_interference"],
            "finder_reliable": b["finder_reliable"],
            "context_dependent": b["context_dependent"],
            "person_task": b["person_task"],
            "affects": b["affects"],
            "notes": b["notes"],
            "axe_rules": [
                {
                    "id": r["id"], "category": r["category"], "issue_type": r["issue_type"],
                    "impact": r["impact"], "experimental": r["experimental"], "description": r["description"],
                }
                for r in sorted(axe_by_crit.get(cid, []), key=lambda r: r["id"])
            ],
            "act_rules": [
                {
                    "id": r["id"], "name": r["name"], "approved": r["approved"], "relation": rel["relation"],
                    "test_cases": r["test_cases"], "page": r["page"],
                }
                for r, rel in sorted(act_by_crit.get(cid, []), key=lambda x: (x[1]["relation"] != "conformance", x[0]["id"]))
            ],
        }
        entry["axe_gap"] = not any(r["category"] == "wcag" and not r["experimental"] for r in entry["axe_rules"])
        entry["act_gap"] = not any(r["relation"] == "conformance" for r in entry["act_rules"])
        criteria.append(entry)

    criteria.sort(key=lambda c: tuple(int(x) for x in c["id"].split(".")))
    out = {
        "schema": "criteria/1",
        "standard": base["standard"],
        "levels": base["levels"],
        "generated": date.today().isoformat(),
        "sources": {
            "base": Path(base_path).name,
            "axe_core": {"version": axe_version, "file": "sources/axe/rule-descriptions.md", "rules": len(axe_rules)},
            "act": {"file": "sources/act/testcases.json", "name": act_data["name"], "test_cases": act_data["count"], "rules": len(act_rules)},
        },
        "fields": base["fields"],
        "criteria": criteria,
    }
    out["coverage"] = {
        "note": "Which criteria have an automatic rule in each source. An input for research question 2.",
        "axe_core": {
            "criteria_with_wcag_rule": [c["id"] for c in criteria if not c["axe_gap"]],
            "criteria_without_wcag_rule": [c["id"] for c in criteria if c["axe_gap"]],
        },
        "act": {
            "criteria_with_conformance_rule": [c["id"] for c in criteria if not c["act_gap"]],
            "criteria_without_conformance_rule": [c["id"] for c in criteria if c["act_gap"]],
        },
    }
    Path(out_path).write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # Summary for the terminal
    n = len(criteria)
    by_level = Counter(c["level"] for c in criteria)
    by_principle = Counter(c["principle"] for c in criteria)
    by_method = Counter(c["method"] for c in criteria)
    by_since = Counter(c["since"] for c in criteria)
    print(f"criteria: {n}  levels: {dict(by_level)}  principles: {dict(by_principle)}")
    print(f"methods: {dict(by_method)}  since: {dict(by_since)}")
    print(f"axe-core {axe_version}: {len(axe_rules)} rules parsed; "
          f"{sum(1 for r in axe_rules if r['category'] == 'wcag')} in the WCAG A/AA sections")
    print(f"ACT: {len(act_rules)} rules, {sum(1 for r in act_rules.values() if r['approved'])} approved")
    print("no axe-core WCAG rule:", [c["id"] for c in criteria if c["axe_gap"]])
    print("no ACT conformance rule:", [c["id"] for c in criteria if c["act_gap"]])
    unmapped = [r["id"] for r in axe_rules if r["category"] == "wcag" and not r["criteria"]]
    print("axe WCAG rules with no criterion tag:", unmapped)
    outside = sorted({c for r in axe_rules for c in r["criteria"] if c not in ids})
    print("axe tags for criteria outside A/AA 2.2 scope:", outside)


if __name__ == "__main__":
    if len(sys.argv) != 5:
        sys.exit(__doc__)
    main(*sys.argv[1:])
