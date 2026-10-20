"""Build the list of ACT test cases for the rule fixtures.

Usage: python3 -I tests/seeded-faults/act/build_cases.py criteria/sources/act/testcases.json criteria/criteria.json tests/seeded-faults/act/cases.json

Each case keeps its rule, its expected outcome, its address, and the WCAG
criteria of the rule with the relation conformance or secondary. The flag
in_scope is true when a criterion with the conformance relation is one of
the 55 criteria of WCAG 2.2 A and AA.
"""
import json
import re
import sys


def main(testcases_path, criteria_path, out_path):
    with open(testcases_path, encoding="utf-8") as f:
        tc = json.load(f)
    with open(criteria_path, encoding="utf-8") as f:
        scope = {e["id"] for e in json.load(f)["criteria"]}
    cases = []
    for case in tc["testcases"]:
        crit = {}
        for key, val in (case.get("ruleAccessibilityRequirements") or {}).items():
            m = re.match(r"^wcag(\d\d):(\d+\.\d+\.\d+)$", key)
            if m:
                crit[m.group(2)] = "conformance" if val.get("forConformance") else "secondary"
        cases.append({
            "rule_id": case["ruleId"],
            "rule_name": case["ruleName"],
            "approved": bool(case.get("approved")),
            "case_id": case["testcaseId"],
            "title": case["testcaseTitle"],
            "expected": case["expected"],
            "url": case["url"],
            "path": case["relativePath"],
            "criteria": crit,
            "in_scope": any(rel == "conformance" and c in scope for c, rel in crit.items()),
        })
    out = {
        "source": tc.get("website"),
        "license": tc.get("license"),
        "count": len(cases),
        "in_scope": sum(1 for c in cases if c["in_scope"]),
        "approved_in_scope": sum(1 for c in cases if c["in_scope"] and c["approved"]),
        "cases": cases,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1)
    print(f"{out['count']} cases, {out['in_scope']} in scope, {out['approved_in_scope']} in scope and approved")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
