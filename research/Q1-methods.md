# Research question 1: which method can test each criterion?

Draft of 2026-10-13. Section 9 of `PLAN.md` asks which method can test each of the 55 criteria: a script alone, a script with a review, or a person. The plan gives 3, 41, and 11. This document tests that split against the evidence of stage 1.

## 1. Short answer

The split holds. No criterion changes its method.

| Method | Criteria | Meaning |
|---|---|---|
| auto | 3 | The engine decides alone, under the conditions of section 3 |
| auto+review | 41 | The engine finds and measures. The AI or a person decides the rest |
| person | 11 | The engine finds the content. A person tests it |

Three facts sharpen the split.

- A definite rule exists for 17 criteria in axe-core, and an approved ACT rule for 18. For the other criteria, the result rests on the own tests of the engine, on the AI, and on a person.
- Of the 25 seeded faults that the engine must decide alone, axe-core finds 14. The own tests must find the other 11: focus visible, focus not obscured, keyboard reach, a change on focus, a wrong language, a placeholder contrast, and a state that does not change.
- For 25 criteria, the engine cannot find all the content that the criterion applies to. Section 5 lists them. The audit must show this limit in the report.

## 2. Method

The method of each criterion comes from `criteria/criteria.json`. The file came from the review of the plan against the Understanding documents of WCAG 2.2, in `REVIEW-1.md`. This document tests each row with three sources of evidence.

1. The approved ACT rules of the criterion, from the W3C test cases.
2. The rules of five engines, from research question 2.
3. The seeded faults of `tests/seeded-faults/`, with the axe-core baseline. The faults show what the engine must find. The baseline shows what axe-core alone finds.

The script `research/q1_table.py` makes `research/Q1-methods-table.md`. The table has one row for each criterion. Each row gives the method, the test groups, and the own test of the engine. It also gives who decides the rest, the ACT rules, the axe-core rules, and the seeded faults with the baseline result.

## 3. The three automatic criteria

A criterion is `auto` only when a script can decide a failure with no judgment. The three criteria have conditions, from the criteria file.

| Criterion | The script decides only | Evidence |
|---|---|---|
| 2.4.7 Focus Visible | With real Tab events, the control scrolled into view, a comparison of the full viewport, and animation ignored. A new issue needs the same result in two renders | The ACT rule "Element in sequential focus order has visible focus" has 10 cases. No open engine is consistent with it. The seeded fault F42 removes the outline |
| 2.4.11 Focus Not Obscured (Minimum) | "Entirely hidden", in the initial positions of the fixed elements. Content that the user opened and can close does not count | No ACT rule. The seeded faults F43 and F44 use a sticky header and a fixed banner |
| 3.2.1 On Focus | A change of page, window, or focus. Content that changes the meaning goes to the review. A menu that opens is not a change of context | No ACT rule. The seeded fault F54 moves to another page on focus |

Stage 2 must prove the three tests on these cases before the engine reports them with the certainty "fail".

## 4. Who decides the rest

For the 41 `auto+review` criteria, the criteria file says who decides after the engine.

| Decides | Criteria | Count |
|---|---|---|
| The AI, and a person confirms the sample | 1.1.1, 1.3.1, 1.3.2, 1.3.3, 1.3.5, 1.4.1, 1.4.3, 1.4.11, 2.4.2, 2.4.4, 2.4.6, 2.5.3, 3.1.2, 3.2.4, 3.3.1, 3.3.2, 3.3.3, 4.1.3 | 18 |
| A person | The other 23 `auto+review` criteria, and the 11 `person` criteria | 34 |

The AI decides questions about text and images in their context: a text alternative, a heading, a link text, an error message, a status message, an instruction. A person decides questions about operation and about exceptions: a keyboard trap, a time limit, a gesture, a drag, an orientation lock, a process with more than one step.

When a definite rule fires, the engine decides alone, also for an `auto+review` criterion. Of the 70 seeded faults, 25 have the decider "engine", 18 "ai", and 27 "person".

## 5. Where the engine cannot find all the content

For 25 criteria, the criteria file marks the finder as not reliable. The reason differs by group.

| Group | Criteria | Why the engine can miss content |
|---|---|---|
| Media | 1.2.1, 1.2.2, 1.2.3, 1.2.4, 1.2.5 | A player that the engine does not know |
| Language and text | 1.3.3, 1.4.1, 1.4.5, 3.1.2, 3.2.4, 4.1.3 | A sensory instruction, a text in another language, or a status message is a matter of language |
| Scripts and libraries | 1.4.2, 2.1.4, 2.2.2, 2.3.1, 2.5.1, 2.5.2, 2.5.4, 2.5.7 | A gesture, a motion, a drag, or an animation can live in a library that the engine cannot read |
| Server and process | 2.2.1, 3.3.4, 3.3.7 | A time limit or a process step can live on the server |
| Structure | 1.4.11, 2.4.1, 3.2.6 | An icon, a repeated block, or a help link has no fixed code |

The consequence is in the plan already. The result of a unit is "no content found" when the engine finds nothing, not "passed". The report says that the engine can miss content for these criteria. The person checks of the plan sample these criteria on purpose.

## 6. What stage 2 must prove

The evidence shows the tests that carry the most weight and have no engine behind them.

- The focus tests of 2.4.7 and 2.4.11, on the 10 ACT cases and the faults F42, F43, and F44.
- The listener test for 2.1.1, 2.1.4, 2.5.2, 2.5.4, and 2.5.7. It reads the event listeners of the page through the browser protocol. The faults F25, F28, F46, F48, and F49 test it.
- The language test for 3.1.1 and 3.1.2. It compares the declared language with the text. The faults F52 and F53 test it. axe-core does not find a wrong language.
- The target size measurement for 2.5.8. axe-core reports the fault F50 as incomplete, not as a violation.
- The form tests for 3.2.2, 3.3.1, 3.3.3, and 4.1.3. They send data only where the settings permit it.
- The site-level comparisons for 2.4.5, 3.2.3, 3.2.4, and 3.2.6. They need the pages of a set and their templates.
- The vision model for 1.4.5, on the fault F18.

## 7. Consequences for the plan and the criteria file

None for the methods. The counts in section 7.1 of the plan stay 3, 41, and 11. The criteria file stays as it is. The table of this document becomes the test list of stage 2.

## 8. Sources

- `criteria/criteria.json`, built on 2026-10-13. `REVIEW-1.md`, the review of the plan against the Understanding documents of WCAG 2.2.
- `research/Q2-coverage-tables.md` and `research/sources/`, 2026-10-13.
- `tests/seeded-faults/faults.json` and `tests/seeded-faults/baseline-axe.md`, 2026-10-13.
