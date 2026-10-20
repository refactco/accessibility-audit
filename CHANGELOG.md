# Changes

The version is the same for the package `@refact/a11y` and for the plugin `accessibility-audit`. A machine gets a new copy of the plugin only when this version changes.

## 1.0.3, 2026-10-20

The first public version.

- The MIT license, and the notices for the work of others in `NOTICE.md`.
- A README for people outside the company: the requirements, the install from GitHub, the first audit step by step, what leaves the machine, the limits, and the tests.
- The type check is on, with `npm run typecheck`, and `npm test` runs the type check, the formats, and the seeded site in a browser. A GitHub Actions job runs the tests on each change.
- The settings and the notes of a client site are removed, and the public repository starts from a clean history. The private history stays in a separate repository of the company.

## 1.0.2, 2026-10-19

- The review page is a report in plain words, with the structure of a decision page: the first screen states the claim, for example "16 accessibility issues remain open, down from 105", a lede with who the issues affect and whether the site conforms, three decisive values, and the chart of the runs. Then the five issues to fix first, each with what a person meets on the page, who it affects, and the fix. Then the coverage and the criteria, all open issues with the source and the fix, the questions that the two reviews could not settle, and the method and the limits. The reviewer tools are folded away.
- Plain words for each rule and each criterion, in `src/own/plain.ts`.
- A review that found no change to make shows as a decision for a person, not as a fix, and the locate reference says how to write it.

## 1.0.1, 2026-10-19

- The review page has a new design, for a report that a client reads: a masthead with the site and the run, four summary tiles for the two levels, the open issues, and the unresolved questions, the criteria of each level in a table, and the chart of the runs with both scales named and each run's values on the points. The issues come first, with a severity mark, the origin, the source, and the solution. The two opinions of a question stand side by side. Long words wrap on a phone, and the page prints without the reviewer tools.
- 2026-10-16: the scheduled job and its two templates are removed, by decision. A person starts the cycle in a session. The job can come back later.

## 1.0.0, 2026-10-16

The first release: all seven stages of the plan are done, and the seven checks of "done when" are met.

- The test for images of text (1.4.5), the last criterion with no test: the engine finds the images in the content whose pixels look like text on a flat ground, and raises a review question with a screenshot. The two AI passes decide, with the rules of the skill: a logo, a brand name, a chart, or text inside a photo is not an issue.
- The screenshots of the questions show the element again: every selector that started with "body" got a screenshot of the whole viewport before.
- The accessibility overview in the summary, the report, the history, and the review page: for level A and for level AA, the share of the tested units with no failure, the criteria met, failed, and unknown, the pages with no failure, the open issues by severity, and the history of the runs. A tool measure, not a conformance claim.
- A refresh opens an issue that the run had closed when an answer finds it again, and the measurements are not part of the item hash.
- The commands that take the settings file find `accessibility-audit/config.json` by themselves, so `a11y review` works in the repository of a site.
- The scheduled job ran three times on refact.co with no help, and a person installed the auditor on a second site with the README alone and completed the cycle.
- The detection of the seeded faults is 74 of 74, and the correct site gives no issue.

## 0.9.0, 2026-10-15

The first version that does the whole job with no person.

- The engine: the crawler with the sample, the workers, the states, the processes, axe-core with the own tests of 26 criteria, the pixel contrast measurement, the layout, focus, listener, and site tests, the grouper, the comparer with eight statuses, the history, and the report.
- The skill: the answers to the review questions with facts, the verifier as a second independent agent, the origin and the source file of each issue, the specific solution, the handoff `fixes.json` for the fixing agent, and the cycle that runs all of it in one session with agents.
- The package builds to `dist/` on install, and the repository is a plugin marketplace.
- The weekly job for a Mac with launchd, and a template for GitHub Actions.
- The measurements on the seeded site: detection 72 of 74, location 29 of 29, two AI passes agree on 53 of 53 and on 27 of 27, solutions 42 of 42.

## Before 0.9.0

The plan, the criteria file, the formats, the pilot settings, the seeded faults, and the three research questions, from 2026-10-12 to 2026-10-13. The boards `STAGE-*.md` hold the details.
