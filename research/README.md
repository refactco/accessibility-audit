# Research

The research questions of `PLAN.md` section 9. One document for each question.

| File | Question | Status |
|---|---|---|
| `Q1-methods.md` | Which method can test each criterion? | Done on 2026-10-13 |
| `Q2-rule-engines.md` | Is axe-core sufficient? | Done on 2026-10-13 |
| `Q3-other-products.md` | What to copy from other products? | Done on 2026-10-13 |

## Files of question 1

- `Q1-methods-table.md` is generated. Do not edit it by hand.
- `q1_table.py` makes the table from `criteria/criteria.json`, `tests/seeded-faults/faults.json`, and the axe-core baseline in `tests/seeded-faults/build/baseline-axe.json`.

```
python3 -I research/q1_table.py criteria/criteria.json tests/seeded-faults/faults.json research/Q1-methods-table.md tests/seeded-faults/build/baseline-axe.json
```

## Files of question 2

- `Q2-coverage-tables.md` is generated. Do not edit it by hand.
- `q2_matrix.py` makes the tables from `criteria/criteria.json` and from the files in `sources/`.
- `sources/w3c-act-implementations.json` is the parsed W3C ACT implementation reports, fetched on 2026-10-13.
- `sources/*.rules.json` are the rule maps of IBM Equal Access, QualWeb, Alfa, and HTML_CodeSniffer, extracted from their public repositories on 2026-10-13. Each file records the commit, the date, and the method.

To regenerate the tables:

```
python3 -I research/q2_matrix.py criteria/criteria.json research/sources research/Q2-coverage-tables.md
```

To update a source, extract it again with the same shape, and record the new commit and date in the file.
