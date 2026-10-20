# Stage 1: Foundations

The work of stage 1, from `PLAN.md` section 11. Done when the criteria file and the formats are complete, and the processes of the pilot sites are in their settings. Stage 1 is complete as of 2026-10-13. The next stage is stage 2, the engine.

| Work | Status | Where |
|---|---|---|
| The criteria file with all 55 criteria and the WCAG version of each | Done, first build on 2026-10-13. Research question 1 confirms each row | `criteria/criteria.json`, built from `criteria/criteria.base.json` |
| The formats of the issue, the question, the page results, and the summary | Done, with examples that validate | `formats/*.schema.json`, `formats/examples/` |
| The settings format | Done | `formats/config.schema.json` |
| The history format | Done | `formats/history.schema.json` |
| The pilot sites: facts from the public pages and from the code, with proposed settings for production and staging | Done on 2026-10-13, with items to confirm | `pilots/README.md`, `pilots/*.config.json` |
| The processes and the test accounts of the pilot sites | Done on 2026-10-13, with your answers. The reader account of the second pilot does not exist yet. The engine marks the account process as "not tested" until its storage state file exists. See "Decisions" and "Before the first audit" in `pilots/README.md` | `pilots/*.config.json` |
| The seeded faults | Done on 2026-10-13. A correct site of 12 pages, 70 seeded faults for 51 criteria with the expected result of each, and the 1,213 ACT cases as rule fixtures. The axe-core baseline finds 14 of the 70 faults, and nothing on the base site | `tests/seeded-faults/`, `tests/seeded-faults/baseline-axe.md` |
| Research question 1: which method can test each criterion | Done on 2026-10-13. The split 3, 41, and 11 holds. The table lists the evidence of each criterion and the tests that stage 2 must prove | `research/Q1-methods.md`, `research/Q1-methods-table.md` |
| Research question 2: is axe-core sufficient | Done on 2026-10-13. Answer: yes, as the only rule engine of version 1, with `target-size` on. No open engine adds a criterion that the own tests do not cover. 27 criteria have no definite rule in any engine | `research/Q2-rule-engines.md`, `research/Q2-coverage-tables.md`, `research/q2_matrix.py`, `research/sources/` |
| Research question 3: what to copy from other products | Done on 2026-10-13. Nine items to copy from 17 products and two monitoring programs. The plan has most of them. Three small changes: the form of the review questions, a note field on dismissals, and the EU page list in the sample | `research/Q3-other-products.md` |

## Commands

```
npm run build-criteria      rebuild criteria/criteria.json from the base data and the sources
npm run validate-formats    validate the schemas, the examples, and the pilot settings
npm run seed-check          verify that each seeded fault applies to the base site
npm run seed-build          build the base site and one variant for each fault into tests/seeded-faults/build
npm run baseline-axe        run axe-core on the variants and write tests/seeded-faults/baseline-axe.md
```

## Facts from the first build

- axe-core 4.14.0 has 105 rules. 64 are in its WCAG A and AA sections. They cover 21 of the 55 criteria. `target-size` is off by default. `css-orientation-lock` is experimental, and experimental rules are off by default.
- The W3C ACT file has 1,213 test cases for 87 rules. 37 rules are approved. The rules map to 30 of the 55 criteria with a conformance relation. No rule maps to a criterion that is new in WCAG 2.2.
