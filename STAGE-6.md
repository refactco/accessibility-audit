# Stage 6: Review

The work of stage 6, from `PLAN.md` section 11: the review questions, the AI answers, the random sample, the commands for a person, and the decisions. Done when you know the AI answer accuracy, and one answer closes all pages of its item.

Started on 2026-10-14, next to stage 2 and stage 3. The engine raised the review questions since stage 2. This stage adds the answers and their effect.

## The commands

```
a11y answer <Q-id> <issue | no issue | unsure | not applicable> --by <name or ai> [--reason] [--note] [--confidence] [--model] [--prompt-version] --out <folder>
a11y pass <criterion> --pages <path,path> | --templates <name,name> --by <name> [--note] --out <folder>
a11y not-applicable <criterion> --pages <path,path> | --templates <name,name> --by <name> [--note] --out <folder>
a11y accept <ISS-id> --by <name> --reason <text> [--note] --out <folder>
a11y dismiss <ISS-id> --by <name> --reason <text> [--note] --out <folder>
a11y refresh <config.json> --out <folder>    the results with the answers and the decisions of today, no crawl
a11y review <config.json> --out <folder>     the review page for a person, in the browser
node tests/review.mjs [--serve]        the review test on the seeded site
```

| Part | Where | Status |
|---|---|---|
| The evidence | `src/audit.ts` | Done. Each review question gets a screenshot of its element, or of the viewport for a page-level question, under `runs/<run>/screenshots/`. The question file points to it in `evidence.image` |
| The answers | `src/decide.ts` | Done. The AI answers issue, no issue, or unsure, with a confidence, a reason, the model, the prompt version, and the date. A person answers issue, no issue, or not applicable, with the name and the date. An answer stays until the item changes, by the item hash |
| The random sample | `src/decide.ts` | Done. One in ten AI answers, by the hash of the question ID, and all low confidence answers get `sample: true`. The report lists them for a person |
| The effect on the results | `src/results.ts`, `src/issues.ts` | Done. An outcome with the answer "no issue" or "not applicable" counts as nothing. An outcome with the answer "issue" becomes an issue: the certainty is "ai fail" for the AI alone, and "fail" for a person. The question points to the issue, and the issue to the question. A person's answer wins over the AI's |
| The decisions passed and not applicable | `src/decide.ts`, `decisions.jsonl`, `formats/decision.schema.json` | Done. A decision names a criterion and a scope of pages or templates, with the content hash of each page. It is void for a page whose content changed. A failed unit stays failed |
| Accepted and dismissed | `src/decide.ts` | Done. The issue keeps the status and the decision with the reason, the note, the name, and the date, across audits |
| The AI | `plugin/skills/a11y/` | Done as the skill of stage 4: the agent reads the evidence and records the answers with the command. The rules of each question family are in `references/review.md` |
| The report | `src/report.ts` | Done. The counts of the answers, the questions that wait for a person, the agreement of the AI and the person on the sample, and the last decisions |
| The review page | `src/review.ts`, `src/own/plain.ts` | Done, and made a report on 2026-10-19 after the user's review: the first screen states the claim in plain words, the lede, three decisive values, and the chart of the runs; then the five issues to fix first, in plain words, with who they affect and the fix; then the coverage and the criteria, all open issues with the source and the fix, the unsettled questions with the two reviews side by side, and the method and the limits. The page follows the principles of `design.md`: the reader's job first, an executive path and an audit path, one continuous canvas, no decoration. A review that found no change to make shows as a decision for a person, not as a fix. Before that, the page had three sections: the AI answers to confirm, the checks for a person, and the open issues. Each card has the question, what counts as an issue in plain words, the page, the state, the screenshot, and the facts the AI relied on. A person confirms the facts or marks one as wrong, with no knowledge of the rule. A click writes the answer at once. A button refreshes the report. Nothing leaves the machine. The page is optional since 2026-10-14: no person is necessary, and the page stays for a person who wants to look at the answers |
| The facts check | `src/decide.ts`, `formats/question.schema.json` | Done. An AI answer carries its facts, one each. A person's confirmation of the facts counts as agreement with the answer. A wrong fact sends the question back to the AI with the note, and the skill answers it again |
| What counts as an issue | `src/own/families.ts` | Done. One or two plain sentences for each question family, on the review page |
| The verifier | `src/decide.ts`, `plugin/skills/a11y/references/verify.md` | Done. A second, independent AI pass answers each question without the first answer: `a11y verify-tasks` exports the questions without it, and `a11y verify` records the answer and whether it agrees. Two equal answers decide. A disagreement, or an unsure answer, is unresolved: the question stays open, and the report counts it. No person is needed |
| The accuracy with no person | `tests/verify-eval.mjs`, `tests/seeded-faults/verification.md` | Measured on 2026-10-14 on 53 questions: 48 from 42 seeded faults, with the truth "issue", and 5 from the correct base site, with the truth "no issue". Two agents answered the first pass, and two other agents verified without the first answers. First pass 53 of 53 correct, verifier 53 of 53, agreement on 53, 0 unresolved. The test site is small and clean, so this is the ceiling, not the accuracy on a real site. On refact.co, with no person, on 2026-10-14: the verifier checked 104 AI answers and agreed on 97. The 7 unresolved questions are 4 disagreements and 3 with an unsure answer on one side. They are about cut text, a focus outline, two silent videos, and small text over an animated pattern. The agreement rate is 93 percent, and it is agreement, not accuracy: the site has no answer key |
| An answer after the audit of the same run | `src/issues.ts`, `tests/review.mjs` | Fixed on 2026-10-15. The first scheduled run showed it: the measured contrast of a text over an animated pattern changes with each run, so the item hash changed, the answer went, and the audit resolved the issue. The agents answered "issue" again, but the refresh kept the status of the run: resolved. Now a refresh opens an issue that the run had closed, and the measurements, the timing, and the cut sizes are not part of the item hash, so an answer stays while the markup is the same. The files from before keep their answers through a legacy hash. The review test checks the scenario |
| The verification across a refresh | `src/issues.ts`, `tests/review.mjs` | Fixed on 2026-10-14. The rebuild of the question files dropped the verification and the facts check, and a stored outcome kept the answer of its run. The first autonomous cycle found it: a refresh after the verifier pass lost all 104 verifications, and two unresolved questions became issues. Now the rebuild keeps them while the item is the same, and the refresh computes each answer again. A new issue of the same run that a changed answer no longer supports goes, with no resolution. The review test checks all three, and the verifications came back from the commands of the agents |

## The checks of "done when"

| Check | Result | Where |
|---|---|---|
| One answer closes all pages of its item | Yes. The answer belongs to the fingerprint of the question, and the engine applies it to each outcome with that fingerprint on each page | `npm run review`, audit 2 and 3 |
| You know the AI answer accuracy | Yes, with no person. On the seeded faults, two independent AI passes agree on 53 of 53 questions and both are right on 53 of 53. On refact.co, the two passes agree on 97 of 104 questions, and 7 stay unresolved. The person confirmed 21 of 21 sample answers on 2026-10-14, but the person does not know the rules, so that number is agreement, not accuracy. The engine's measurement later found one of those AI answers wrong | `tests/seeded-faults/verification.md`, the report of the refact results folder |

The review test runs six audits on the seeded site and passes its 10 checks. The checks: a question with a screenshot. An AI answer that makes an issue with the certainty "ai fail". A person's answer that wins. The decisions passed and not applicable on their pages, and a dismissed issue that keeps its decision.

## Not built

- The AI answers with no agent: the engine has no API key and calls no model. The agent of the skill answers.
- An expert for the unresolved questions. The verifier is the second AI opinion since 2026-10-14. A disagreement stays unresolved, and no one looks at it yet. On two real sites, most disagreements are in one family: text cut at 200 percent zoom or with the text spacing. The rule of that family needs a sharper line between "cut" and "available in another way".
- The questions with the largest reach first, within the budget. The skill orders them. The engine does not cut the list yet.
- The item hash drops an answer when a fact of the item changes, for example the count of changes of a moving element. Then the AI answers again.
