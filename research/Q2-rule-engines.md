# Research question 2: is axe-core sufficient?

Draft of 2026-10-13. Section 9 of `PLAN.md` asks: is axe-core sufficient, or does the engine need a second rule engine or its own rules? The input is the coverage block of `criteria/criteria.json`: axe-core 4.14.0 has a WCAG rule for 21 of the 55 criteria.

## 1. Short answer

Yes. axe-core is sufficient as the rule engine of version 1, with three settings that section 7 gives. The reasons:

- No open engine adds a criterion that the own tests in the plan do not cover. The four other engines together add definite rules for 11 criteria on paper. Most of these rules test one narrow technique, for example the position of a label or the value of a `dir` attribute. Section 5 gives the list.
- axe-core and Alfa are the most correct open engines on the shared ACT tests, with 26 and 27 of the 37 approved rules. A second engine adds two to five correct rules and about 60 duplicate rules with different names and different meanings.
- The 27 criteria with no definite rule in any engine need interaction, a comparison across pages, a judgment about content, or a review of media. A rule engine cannot give these. The test groups in section 5.3 of the plan give them.

The second result of this research is a test corpus. The 1,213 ACT test cases are public pages with a known expected outcome. They become a part of the seeded faults of stage 1, see section 8.

## 2. Method

The question has two parts. Which criteria can a rule engine test with no person? And how correct are the rules? The data comes from four sources.

1. `criteria/criteria.json`, which maps the rules of axe-core 4.14.0 to the criteria. The map comes from the WCAG tags of each rule, see `criteria/README.md`.
2. The W3C ACT implementation reports, fetched on 2026-10-13 and parsed into `research/sources/w3c-act-implementations.json`. The W3C builds these pages from the test results that each vendor sends. For each ACT rule, the report says if the implementation is consistent with all test cases, or partially consistent. The axe-core report uses a canary build with the experimental rules on.
3. The rule files of four open engines, parsed into `research/sources/*.rules.json`. The files give the criteria of each rule and the outcomes that the rule can produce. Agents did the extraction with scripts, from the public repositories, with no execution of the code.
4. The npm registry on 2026-10-13, for the versions, the licenses, the dates, and the integration packages.

Two words have a fixed meaning in this document. A **definite rule** can report a failure with no person. A **review rule** reports a possible failure, a warning, or a notice that a person or the AI must check. Each engine names these differently, and section 5 gives the mapping. The count of criteria is always a count of the 55 criteria of WCAG 2.2, levels A and AA.

The script `research/q2_matrix.py` makes the tables in `research/Q2-coverage-tables.md` from the source files. This document reads the numbers from those tables.

The method has four limits.

- The maps come from the metadata of the rules, not from tests of the rules. A rule that names a criterion can test a small part of it.
- The ACT data is what each vendor reported, on a version that the vendor chose. The axe-core report is for version 4.10.2.
- The meaning of a definite rule differs between the engines. The mapping in section 5 is a judgment.
- The ACT rules cover 30 of the 55 criteria. For the other 25, no shared test exists.

## 3. The engines

| Engine | Maker | License | Version and date | Runs | Use with Playwright |
|---|---|---|---|---|---|
| axe-core | Deque Systems | MPL-2.0 | 4.14.0, 2026-10-12 | In the page | Script injection. `@axe-core/playwright` 4.13.0 is one version behind |
| Alfa | Siteimprove | MIT | 0.119.0, 2026-07-22 | In Node, on a snapshot of the page | `@siteimprove/alfa-playwright` 0.84.2 |
| QualWeb | LASIGE, University of Lisbon | ISC | core 0.9.5, 2026-08-01, and act-rules 0.8.6, 2026-09-26 | In its own Puppeteer browser | No package. The core starts its own browser and crawler |
| IBM Equal Access | IBM | Apache-2.0 | 4.0.34, 2026-09-08 | In the page | Script injection of the engine. The `accessibility-checker` package bundles Puppeteer |
| HTML_CodeSniffer | Squiz | BSD-3-Clause | 2.5.1, 2026-10-08 | In the page | Script injection. `pa11y` 10.0.0 wraps it |

Lighthouse 13.5.0 and pa11y 10.0.0 add no rules of their own. Lighthouse runs axe-core. pa11y runs axe-core and HTML_CodeSniffer. Accessibility Insights runs axe-core.

The W3C reports also list commercial tools: SortSite, Total Validator, UsableNet AQA, Webmate, and axe DevTools Pro. This document does not evaluate them. Their code is closed, and the product runs on our own machines. A paid engine stays an option after version 1.

## 4. Correctness, from the W3C ACT reports

The ACT rules are the shared tests of the accessibility tool vendors. The W3C publishes 37 approved rules and 50 proposed rules, with 1,213 test cases in total. An implementation is consistent with a rule when it gives the expected outcome for each test case of the rule.

| Implementation | Type | Approved rules consistent | Approved rules partially consistent |
|---|---|---|---|
| Alfa 0.118.0, fully automated | Open | 27 | 2 |
| axe-core 4.10.2, canary | Open | 26 | 1 |
| QualWeb 3.0.0 | Open | 23 | 10 |
| IBM Equal Access 3.1.42 | Open | 21 | 3 |
| @accesslint/core 0.21.0 | Open | 5 | 29 |
| SortSite 6.55 | Commercial | 33 | 1 |
| Total Validator 17.4.0, with browser | Commercial | 33 | 1 |
| Webmate Accessibility Workbench | Commercial | 33 | 1 |
| UsableNet AQA auto 1.0.2 | Commercial | 32 | 0 |
| axe DevTools Pro 4.37.1, semi-automated | Commercial | 29 | 1 |
| Alfa 0.118.0, semi-automated with a person | Open | 29 | 0 |
| UsableNet AQA semi-auto 1.0.2 | Commercial | 35 | 1 |

Among the open engines, Alfa and axe-core are the most consistent, and they are close. The commercial tools reach 32 or 33 rules. A tool with a person in the loop reaches 35.

axe-core is not consistent with 11 approved rules. They fall into five groups.

| Group | ACT rules | Criteria | What covers it in the plan |
|---|---|---|---|
| Judgment about content | Page title is descriptive, image accessible name is descriptive, HTML images contain no text, element in focus order has visible focus | 2.4.2, 1.1.1, 1.4.5, 2.4.7 | The AI review for the first three. The own focus test of the engine for 2.4.7 |
| Text spacing in style attributes | Letter spacing, word spacing, and line height in style attributes are wide enough | 1.4.12 | Alfa has the first two. QualWeb has all three in partial form. axe-core has none |
| Accessible names and ARIA states | Summary element has a non-empty accessible name. Element with role attribute has required states and properties | 4.1.2 for the first. The second maps to the ARIA specification, not to a criterion | Alfa has both. The axe-core rule `aria-required-attr` is partially consistent with the second |
| Orientation | Orientation of the page is not restricted with CSS transforms | 1.3.4 | Alfa has it. axe-core has `css-orientation-lock` as an experimental rule, off by default |
| Iframes | Iframe with interactive elements is not excluded from the tab order | 2.1.1 | No open engine has it. The own keyboard test of the engine reaches the controls in iframes |

Alfa, in fully automated mode, is not consistent with 10 approved rules. Four of them are the same judgment rules. Two are the minimum and the enhanced contrast rules, because Alfa asks a person about backgrounds and images. Two more are about the focus order of scrollable content and of aria-hidden content. The last two are the line height in style attributes, and iframes in the tab order. axe-core is consistent with the contrast rules and with the two focus-order rules.

The union of axe-core and Alfa is consistent with 31 of the 37 approved rules. The six that both miss need judgment or interaction, except the line-height rule and the iframe rule.

## 5. Criteria coverage of each engine

Each engine names its outcomes differently. This mapping decides what counts as a definite rule.

| Engine | Definite rule | Review rule | Not counted |
|---|---|---|---|
| axe-core | A rule in the WCAG A or AA sections with the issue type "failure" | A rule with the issue type "needs review" only | Best practices, experimental rules, deprecated rules |
| IBM Equal Access | A rule in the WCAG 2.2 ruleset that can return VIOLATION | A rule that returns only POTENTIAL_VIOLATION, MANUAL, or RECOMMENDATION | Rules in no active ruleset |
| QualWeb | An ACT rule, or a "Failure of" technique rule, that can return "failed" | A rule that returns only "warning", and the other technique rules | Rules with no criterion in the metadata |
| Alfa | A stable rule that asks no question | A stable rule that can ask a question, which gives "cantTell" with no person | Experimental and deprecated rules |
| HTML_CodeSniffer | A sniff in the WCAG2AA standard with an ERROR message | A sniff with WARNING or NOTICE messages only | Sniffs outside the WCAG2AA standard |

Table A of `research/Q2-coverage-tables.md` gives the result. The versions are the ones in the repositories on 2026-10-13. The IBM repository names version 3.0.0, and npm publishes 4.0.34 from the same code line.

| Engine | Rules | Criteria with a definite rule | Criteria with any rule | Criteria with a consistent approved ACT rule |
|---|---|---|---|---|
| axe-core 4.14.0 | 105 | 17 | 21 | 12 |
| IBM Equal Access 3.0.0 | 174 | 19 | 40 | 10 |
| QualWeb 0.8.6 | 102 | 20 | 29 | 11 |
| Alfa 0.119.0 | 104 | 16 | 24 | 12 |
| HTML_CodeSniffer 2.5.1 | 80 | 12 | 48 | no report |

The counts of "any rule" are high for IBM and HTML_CodeSniffer because of their notices. HTML_CodeSniffer has a notice for 48 criteria. A notice is a prompt for a manual check, with no evidence. It is the same as a review question of the plan, but with no screenshot and no element. HTML_CodeSniffer also had its last commit on 2022-08-15, and it targets WCAG 2.1.

Table D gives what each engine adds to axe-core, in criteria with a definite rule.

| Engines | Criteria with a definite rule | Added to axe-core alone |
|---|---|---|
| axe-core | 17 | - |
| axe-core + IBM | 22 | 1.3.2, 1.3.4, 2.4.1, 3.3.1, 3.3.2 |
| axe-core + QualWeb | 22 | 1.2.1, 1.3.4, 1.4.2, 2.4.7, 3.2.1 |
| axe-core + Alfa | 19 | 1.3.4, 1.4.10 |
| axe-core + HTML_CodeSniffer | 19 | 2.4.1, 3.2.2 |
| All five | 28 | 11 criteria |

The additions are smaller than the numbers show. I read the rules behind each added criterion.

| Added criterion | The rule behind it | Judgment |
|---|---|---|
| 1.3.4 Orientation | IBM `element_orientation_unlocked`, QualWeb ACT R7, Alfa `sia-r44`. All implement the approved ACT rule on CSS transforms | Real. axe-core has `css-orientation-lock` as an experimental rule, and it is not consistent with the ACT rule. The own orientation test in the plan covers the criterion |
| 1.4.2 Audio Control | QualWeb ACT R15 on autoplay | Real but partial. axe-core has `no-autoplay-audio` as a review rule. The own test in the plan covers the criterion |
| 2.4.1 Bypass Blocks | IBM `skip_main_exists`. HTML_CodeSniffer gives an error for an iframe with no title | Real but partial. axe-core has `bypass` as a review rule. The own test in the plan finds the skip link and the landmarks |
| 2.4.7 Focus Visible, 3.2.1 On Focus | QualWeb technique T24, a script that removes the focus | Narrow. The own tests in the plan test both criteria in full |
| 1.2.1 Audio-only and Video-only | QualWeb technique T8, a text alternative that is not an alternative | Narrow. It is a 1.1.1 test |
| 1.3.2 Meaningful Sequence | IBM `dir_attribute_valid` | Nominal. The value of one attribute |
| 3.3.1 Error Identification | IBM `error_message_exists`, a valid `aria-errormessage` reference | Narrow. The own form tests in the plan cover the criterion |
| 3.3.2 Labels or Instructions | IBM `input_label_before` and `input_label_after`, the position of a label | Narrow and opinionated. axe-core tests the existence of labels under 4.1.2 |
| 3.2.2 On Input | HTML_CodeSniffer, a form with no submit button | Nominal |
| 1.4.10 Reflow | Alfa `sia-r47`, a meta viewport that blocks zoom | Nominal. axe-core has the same rule under 1.4.4 |

Two rules deserve a note, because they are definite in axe-core on paper only. The rule `target-size` for 2.5.8 is off by default in axe-core 4.14.0. IBM and Alfa have the same test on by default. The rule `avoid-inline-spacing` for 1.4.12 exists. But the W3C report says that axe-core is not consistent with the three ACT rules on text spacing. Alfa is consistent with two of them.

## 6. The gaps that no engine covers

Table C of the coverage tables lists 27 criteria with no definite rule in any engine. They fall into five groups.

| Group | Criteria | What the plan does |
|---|---|---|
| Media | 1.2.2, 1.2.3, 1.2.4, 1.2.5 | A person. The engine finds the media and asks |
| Judgment about content | 1.3.3, 1.4.5, 2.4.6, 2.3.1, 2.5.1, 2.5.4, 2.5.7, 3.3.4, 3.3.7 | The AI review with evidence, and a person for the 2.x pointer criteria, 2.3.1, 3.3.4, and 3.3.7 |
| Interaction in a real browser | 1.4.13, 2.1.2, 2.1.4, 2.4.3, 2.4.11, 2.5.2, 3.3.3, 3.3.8, 4.1.3 | The own tests of the engine: keyboard, hover and focus, forms, status messages |
| Comparison across pages | 2.4.5, 3.2.3, 3.2.4, 3.2.6 | The own site-level tests, on the pages of a set |
| Layout measurement | 1.4.11 | The own contrast test of control borders and focus rings |

The other engines have review rules for most of these 27 criteria, but they are notices or potential violations. IBM has a potential violation for 2.4.11 and 2.5.7. HTML_CodeSniffer has a notice for 21 of them. No engine has a rule for 3.2.6, 3.3.7, and 3.3.8. These are the new criteria of WCAG 2.2 about help, redundant entry, and authentication.

Thus the gap is not a rule gap. The 27 criteria need a browser that does things, a comparison between pages, or a judgment. A rule engine reads one page at rest.

## 7. Decision

Version 1 uses axe-core as its only rule engine, with these settings.

1. Run the rules with the tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, and `wcag22aa`. Do not run the best practices, the experimental rules, or the AAA rules in the audit. The best practices can go into a separate list later.
2. Switch the rule `target-size` on. It is the only axe-core rule for 2.5.8, and it is off by default.
3. Keep the rules with "reviewOnFail" and the "needs review" results as review questions, with the certainty "needs review". The rules are `bypass`, `no-autoplay-audio`, `color-contrast` when the background is unknown, and the other "needs review" rules.
4. Load the axe-core script into the page with Playwright, from the pinned npm package. Do not use `@axe-core/playwright`, because it is one version behind, and because the engine must control the version for the baseline rule.

No second engine in version 1. The reasons are in sections 5 and 6. Two options stay open for after version 1, if the seeded faults show a gap.

- Alfa for the five approved ACT rules where axe-core is not consistent and Alfa is: letter spacing, word spacing, the summary element name, the required ARIA states, and the orientation lock. Alfa has an official Playwright package and the MIT license. The cost is a second result format and a second set of rule ids in the fingerprints.
- IBM Equal Access for `skip_main_exists` and `target_spacing_sufficient`. The cost is the same, and the own tests already cover the two criteria.

## 8. Consequences for the plan and the criteria file

- The plan stays as it is. Section 4 names axe-core first, and section 5.3 has the own test groups that cover the 27 gap criteria.
- The criteria file gets a note for 2.5.8, that the engine switches `target-size` on. The note for 1.4.12 records that `avoid-inline-spacing` is not consistent with the ACT rules, so the own text spacing test stays necessary.
- The seeded faults of stage 1 confirm the result. axe-core 4.14.0 finds 14 of the 70 seeded faults in `tests/seeded-faults/`, and nothing on the correct base site. Of the 25 faults that the engine must decide alone, axe-core finds 14. The other 11 need the own tests: focus visible, focus not obscured, keyboard reach, a change on focus, a wrong language, and a placeholder contrast. See `tests/seeded-faults/baseline-axe.md`.
- The seeded faults of stage 1 get the 1,213 ACT test cases as a corpus, with the expected outcome of each case. The engine must be consistent with the 26 approved rules that axe-core passes. The own tests must pass the cases of the rules that no engine covers: visible focus, iframes in the tab order, and the judgment rules through the AI review. The remaining seeded faults cover the 25 criteria that have no ACT rule.
- The research for question 1 can use Table B of the coverage tables as its start. For each criterion, it shows which engines have a rule, and which ACT rule exists.

## 9. Sources

- `criteria/criteria.json`, built on 2026-10-13 from axe-core 4.14.0 and the ACT test cases of the same day.
- W3C, ACT Rules implementations, https://www.w3.org/WAI/standards-guidelines/act/implementations/ and the page of each implementation, fetched on 2026-10-13.
- The rule files in the public repositories of IBM Equal Access, QualWeb, Siteimprove Alfa, and HTML_CodeSniffer. Each `research/sources/*.rules.json` records the commit and the date.
- The npm registry, 2026-10-13, for the versions, licenses, dates, and dependencies.
