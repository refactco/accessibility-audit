"""Build the coverage tables for research question 2 from the source files.

Usage: python3 -I research/q2_matrix.py criteria/criteria.json research/sources research/Q2-coverage-tables.md

Inputs, all in the sources folder:
  w3c-act-implementations.json   the W3C ACT implementation reports, parsed
  ibm-equal-access.rules.json    the rules of IBM Equal Access with their criteria
  qualweb.rules.json             the rules of QualWeb with their criteria
  alfa.rules.json                the rules of Siteimprove Alfa with their criteria
  html-codesniffer.rules.json    the sniffs of HTML_CodeSniffer with their criteria

A "definite" rule can report a failure with no person. A "review" rule reports
a possible failure, a warning, or a notice that a person or the AI must check.
"""
import json
import os
import sys
from collections import defaultdict


def load(path):
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def engine_maps(sources):
    """Return {engine: {"definite": {crit: [rule ids]}, "review": {crit: [rule ids]}, "meta": {...}}}."""
    out = {}

    ibm = load(os.path.join(sources, "ibm-equal-access.rules.json"))
    if ibm:
        d, r = defaultdict(list), defaultdict(list)
        for rule in ibm["rules"]:
            if "WCAG_2_2" not in rule.get("ruleset_ids", []) and "WCAG_2_1" not in rule.get("ruleset_ids", []):
                continue
            outcomes = rule.get("outcomes") or []
            definite = "VIOLATION" in outcomes if outcomes else rule.get("level") == "VIOLATION"
            for c in rule.get("criteria", []):
                (d if definite else r)[c].append(rule["id"])
        out["IBM"] = {"definite": d, "review": r, "meta": {"version": ibm.get("version"), "rules": len(ibm["rules"]), "date": ibm.get("commit_date")}}

    qw = load(os.path.join(sources, "qualweb.rules.json"))
    if qw:
        d, r = defaultdict(list), defaultdict(list)
        for rule in qw["rules"]:
            definite = "failed" in (rule.get("outcomes") or [])
            # A technique rule tests one technique, not the criterion. Only a
            # "Failure of ..." technique (an F technique) is a definite failure.
            if rule.get("module") == "wcag-techniques" and not (rule.get("name") or "").startswith("Failure of"):
                definite = False
            for c in rule.get("criteria", []):
                (d if definite else r)[c].append(rule["id"])
        out["QualWeb"] = {"definite": d, "review": r, "meta": {"version": ", ".join(f"{k} {v}" for k, v in (qw.get("packages") or {}).items()), "rules": len(qw["rules"]), "date": qw.get("commit_date")}}

    alfa = load(os.path.join(sources, "alfa.rules.json"))
    if alfa:
        d, r = defaultdict(list), defaultdict(list)
        for rule in alfa["rules"]:
            # Only the rules in the stable export list count. Experimental and
            # deprecated rules are skipped.
            stability = rule.get("stability_by_export_list") or rule.get("stability") or "stable"
            if stability != "stable":
                continue
            definite = not rule.get("uses_oracle", False)
            for c in rule.get("criteria", []):
                (d if definite else r)[c].append(rule["id"])
        out["Alfa"] = {"definite": d, "review": r, "meta": {"version": alfa.get("version"), "rules": len(alfa["rules"]), "date": alfa.get("commit_date")}}

    hcs = load(os.path.join(sources, "html-codesniffer.rules.json"))
    if hcs:
        d, r = defaultdict(list), defaultdict(list)
        for sniff in hcs["sniffs"]:
            if not sniff.get("in_wcag2aa", True):
                continue
            m = sniff.get("messages") or {}
            c = sniff["criterion"]
            rid = os.path.basename(sniff.get("file", c))
            if m.get("ERROR", 0) > 0:
                d[c].append(rid)
            if m.get("WARNING", 0) + m.get("NOTICE", 0) > 0:
                r[c].append(rid)
        out["HTMLCS"] = {"definite": d, "review": r, "meta": {"version": hcs.get("version"), "rules": len(hcs["sniffs"]), "date": hcs.get("commit_date")}}

    return out


def axe_map(criteria):
    d, r = defaultdict(list), defaultdict(list)
    for entry in criteria["criteria"]:
        for rule in entry.get("axe_rules", []):
            if rule.get("category") != "wcag":
                continue
            # The issue type of axe-core is "failure", "needs review", or both.
            (d if "failure" in (rule.get("issue_type") or "") else r)[entry["id"]].append(rule["id"])
    return {"definite": d, "review": r}


def w3c_map(w3c):
    """{slug: {"consistent_criteria": set, "consistent_rules": set, "approved_consistent": n}}"""
    out = {}
    for impl in w3c["implementations"]:
        cons = [x for x in impl["rules"] if x.get("consistency") == "Consistent"]
        out[impl["slug"]] = {
            "approved_consistent": sum(1 for x in cons if x.get("type") == "WCAG 2 Rule"),
            "approved_partial": sum(1 for x in impl["rules"] if x.get("type") == "WCAG 2 Rule" and x.get("consistency") == "Partial"),
            "consistent_rules": {x.get("act_id") for x in cons},
            "consistent_criteria": {c for x in cons for c, rel in (x.get("criteria") or {}).items() if rel == "conformance"},
        }
    return out


def main(criteria_path, sources, out_path):
    criteria = load(criteria_path)
    rows = criteria["criteria"]
    ids = [e["id"] for e in rows]
    engines = engine_maps(sources)
    axe = axe_map(criteria)
    engines = {"axe-core": {"definite": axe["definite"], "review": axe["review"], "meta": {"version": criteria["sources"]["axe_core"]["version"], "rules": criteria["sources"]["axe_core"]["rules"], "date": None}}, **engines}
    w3c = load(os.path.join(sources, "w3c-act-implementations.json"))
    w3cm = w3c_map(w3c) if w3c else {}
    w3c_slug = {"axe-core": "axe-core", "Alfa": "alfa", "QualWeb": "qualweb", "IBM": "equal-access"}

    lines = []
    lines.append("# Coverage tables for research question 2\n")
    lines.append("Generated by `research/q2_matrix.py` from the files in `research/sources/` and from `criteria/criteria.json`. Do not edit by hand.\n")
    lines.append("A definite rule reports a failure with no person. A review rule reports a possible failure, a warning, or a notice. The counts are criteria of the 55 WCAG 2.2 A and AA criteria.\n")

    # Table A
    lines.append("## Table A: the engines\n")
    lines.append("| Engine | Version | Rules | Criteria with a definite rule | Criteria with any rule | Approved ACT rules consistent (W3C) | Criteria with a consistent ACT rule |")
    lines.append("|---|---|---|---|---|---|---|")
    for name, eng in engines.items():
        definite = {c for c in eng["definite"] if c in ids}
        anyc = definite | {c for c in eng["review"] if c in ids}
        slug = w3c_slug.get(name)
        w = w3cm.get(slug) if slug else None
        act_rules = f"{w['approved_consistent']} of 37 (+{w['approved_partial']} partial)" if w else "no report"
        act_crit = len({c for c in w["consistent_criteria"] if c in ids}) if w else "-"
        lines.append(f"| {name} | {eng['meta'].get('version') or '-'} | {eng['meta'].get('rules') or '-'} | {len(definite)} | {len(anyc)} | {act_rules} | {act_crit} |")
    lines.append("")

    # Table B: per criterion
    lines.append("## Table B: each criterion\n")
    lines.append("The cells give the number of definite rules, then the number of review rules, for example `3 / 1`. A dash means no rule. The ACT column lists the engines with a consistent implementation of an approved ACT rule for the criterion.\n")
    names = list(engines.keys())
    lines.append("| Criterion | Level | Method in the plan | " + " | ".join(names) + " | ACT consistent |")
    lines.append("|---|---|---|" + "---|" * len(names) + "---|")
    for e in rows:
        cid = e["id"]
        cells = []
        for n in names:
            d = len(engines[n]["definite"].get(cid, []))
            r = len(engines[n]["review"].get(cid, []))
            cells.append("-" if d + r == 0 else f"{d} / {r}")
        act = [n for n, slug in w3c_slug.items() if slug in w3cm and cid in w3cm[slug]["consistent_criteria"]]
        lines.append(f"| {cid} {e['name']} | {e['level']} | {e['method']} | " + " | ".join(cells) + f" | {', '.join(act) if act else '-'} |")
    lines.append("")

    # Table C: gaps
    lines.append("## Table C: criteria with no definite rule in any engine\n")
    gaps = [e for e in rows if not any(e["id"] in engines[n]["definite"] for n in names)]
    lines.append("| Criterion | Level | Method in the plan | Review rules in |")
    lines.append("|---|---|---|---|")
    for e in gaps:
        rev = [n for n in names if e["id"] in engines[n]["review"]]
        lines.append(f"| {e['id']} {e['name']} | {e['level']} | {e['method']} | {', '.join(rev) if rev else '-'} |")
    lines.append("")

    # Table D: unions
    lines.append("## Table D: combinations\n")
    lines.append("| Engines | Criteria with a definite rule | Added to axe-core alone |")
    lines.append("|---|---|---|")
    base = {c for c in engines["axe-core"]["definite"] if c in ids}
    combos = [["axe-core"]] + [["axe-core", n] for n in names if n != "axe-core"] + [names]
    for combo in combos:
        s = set()
        for n in combo:
            s |= {c for c in engines[n]["definite"] if c in ids}
        added = sorted(s - base, key=lambda x: [int(p) for p in x.split(".")])
        lines.append(f"| {' + '.join(combo)} | {len(s)} | {', '.join(added) if added else '-'} |")
    lines.append("")

    # Table E: ACT approved rules missing per open engine
    if w3c:
        lines.append("## Table E: approved ACT rules with no consistent implementation, for each open engine\n")
        approved = {}
        for impl in w3c["implementations"]:
            for r in impl["rules"]:
                if r.get("type") == "WCAG 2 Rule" and r.get("act_id"):
                    approved[r["act_id"]] = r["name"]
        lines.append(f"The W3C lists {len(approved)} approved rules that at least one implementation covers.\n")
        lines.append("| ACT rule | Criteria | " + " | ".join(w3c_slug.keys()) + " |")
        lines.append("|---|---|" + "---|" * len(w3c_slug))
        act_crit = {}
        for impl in w3c["implementations"]:
            for r in impl["rules"]:
                if r.get("act_id"):
                    act_crit[r["act_id"]] = r.get("criteria") or {}
        for act_id, name in sorted(approved.items(), key=lambda kv: kv[1]):
            crit = ", ".join(sorted(c for c, rel in act_crit.get(act_id, {}).items() if rel == "conformance" and c in ids))
            cells = ["yes" if act_id in w3cm.get(slug, {}).get("consistent_rules", set()) else "no" for slug in w3c_slug.values()]
            if all(c == "yes" for c in cells):
                continue
            lines.append(f"| {name} | {crit or '-'} | " + " | ".join(cells) + " |")
        lines.append("")

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print("written", out_path)
    for name, eng in engines.items():
        definite = {c for c in eng["definite"] if c in ids}
        anyc = definite | {c for c in eng["review"] if c in ids}
        print(f"{name:10} definite={len(definite):2} any={len(anyc):2}")
    print("gaps (no definite rule anywhere):", len(gaps))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
