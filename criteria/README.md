# The criteria file

`criteria.json` is the list of the 55 WCAG 2.2 criteria at levels A and AA, with the method and the test of each. The engine, the skill, and the report read this file. Stage 1 of `PLAN.md` makes it. Research question 1 confirms each row with tests.

## The files

| File | What it is | Who edits it |
|---|---|---|
| `criteria.base.json` | The hand-authored data: method, tests, checks, flags, and notes for each criterion. The source is `PLAN.md` Appendix A and `REVIEW-1.md` section 6 | A person |
| `sources/axe/rule-descriptions.md` | The rule list of axe-core, downloaded from the release tag in `sources/axe/VERSION` | Nobody. Download a new version |
| `sources/act/testcases.json` | The W3C ACT test cases, with the rule of each case and the criteria that the rule maps to | Nobody. Download a new version |
| `build.py` | Merges the base data with the two sources | A person |
| `criteria.json` | The result. Do not edit it by hand | The build |

## How to build

From the project root:

```
npm run build-criteria
```

The build prints the counts and the gaps. The counts must be 55 criteria, 31 A and 24 AA, and 3 auto, 41 auto+review, and 11 person.

## How to update a source

1. axe-core: write the new version into `sources/axe/VERSION`. Download `doc/rule-descriptions.md` from the GitHub tag `v<version>` into `sources/axe/`.
2. ACT: download `https://www.w3.org/WAI/content-assets/wcag-act-rules/testcases.json` into `sources/act/`.
3. Run the build. Compare the gaps with the last build. A change in the gaps is an input for research question 2.

The sources are downloads. Keep scripts out of the `sources` folders, and run Python with `-I`.

## The fields of one criterion

| Field | Meaning |
|---|---|
| `id`, `name`, `level`, `principle`, `guideline`, `since` | The criterion in WCAG 2.2. `since` is the WCAG version in which the criterion appeared: 2.0, 2.1, or 2.2 |
| `understanding` | The W3C Understanding page |
| `method` | `auto`, `auto+review`, or `person`. See `PLAN.md` section 7.1 |
| `test_groups` | Where the automatic test or the finder runs: `page`, `template`, `site`, or `process`. See `PLAN.md` section 5.3 |
| `automatic_test`, `review_or_person_check` | The test and the check, from `PLAN.md` Appendix A |
| `conditions` | For the three `auto` criteria: the conditions under which a script decides |
| `non_interference` | True for 1.4.2, 2.1.2, 2.2.2, and 2.3.1. See `PLAN.md` section 7.5 |
| `finder_reliable` | True when the engine can give the result "No content found" |
| `context_dependent` | True when the question fingerprint includes the context: 1.1.1, 2.4.2, 2.4.4, and 2.4.6 |
| `person_task` | The task of a person at each audit, or null |
| `affects` | A first assessment of the groups of people that the criterion protects most |
| `axe_rules` | The axe-core rules with a tag for this criterion. `category` is `wcag`, `best-practice`, `aaa`, `experimental`, or `deprecated`. `issue_type` says if the rule fails or only flags for review |
| `act_rules` | The ACT rules that map to this criterion. `approved` is the W3C status. `relation` is `conformance` when a failed outcome means "not satisfied", or `secondary` when the rule is only related |
| `axe_gap`, `act_gap` | True when no axe-core WCAG rule, or no ACT conformance rule, exists for the criterion |

The `coverage` block at the end of the file lists the criteria with and without a rule in each source.
