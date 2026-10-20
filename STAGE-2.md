# Stage 2: Engine

The work of stage 2, from `PLAN.md` section 11: the crawler with the sample, the tester with the rule engine and the page tests, the grouper, the locator, the solution writer, and the reporter. Done when one command audits each pilot site. The report must list all pages and all 55 criteria, with the results that the rules of section 7.2 give.

Started on 2026-10-13. Second step on 2026-10-14: the workers, the sample, the states, the processes, and the full audit of refact.co.

## The command

```
node src/cli.ts audit <url or config.json> [--out <folder>] [--only <url,url>] [--max-pages <n>] [--widths <w,w,w>] [--sample-limit <n>] [--concurrency <n>] [--quiet]
```

The engine is TypeScript on Node 24, which runs the files with no build step. Playwright with Chromium is the browser. axe-core 4.14.0 runs by script injection with the WCAG tags and `target-size` on. The results folder has the files of `PLAN.md` section 8.1, and each file is validated against its schema in `formats/` before it is written.

| Module | File | Status |
|---|---|---|
| Settings | `src/config.ts` | Done. A bare address gets the defaults of the plan |
| Crawler | `src/crawl.ts` | Done for the sitemap, the links, the hreflang links, the WordPress REST API, robots.txt, the rate limit, the permitted domains, the skip patterns, the address groups, the parameters, the templates, and the canonical link. Not done: the login form, the languages list, the routes from the source code |
| Workers | `src/audit.ts` | Done. `budgets.concurrency` workers take pages from one frontier. The rate limiter is shared, so the load on the site does not change |
| Sample | `src/audit.ts` | Done. The required part: the pages of the settings, the example page of each template, the pages of the processes, the common pages by their path, and the first page of a template with no example. Then the pages with a technology that the template does not have yet, and the random share, up to `--sample-limit`. A random page with other template-test results than its example page goes into the report |
| Renderer | `src/browser.ts` | Done. One context for each width, with the storage state of the login role. Blocks navigations and non-GET requests after the load, as the protected mode says |
| States | `src/own/states.ts` | Done. Candidates: a menu button, a control with aria-expanded, a tab, a details element, and a control with aria-haspopup, up to `max_states_per_page`. Each state gets its own render, then the rule engine, the page tests, and a focus pass. Only the outcomes that the first render did not give count. A state that another page of the same template gave is not repeated. The cookie banner open is a state with the non-interference tests, once for each template |
| Processes | `src/process.ts` | Done. The steps use an action grammar: `click`, `fill ... with ...`, `select ... in ...`, `check`, `press`, `read`. Each step is a state of its page with the rule engine, the page tests, and a focus pass. The form error tests (3.3.1, 3.3.3) and the redundant entry test (3.3.7) run here. A process runs only where its environment matches, and data entry needs `tests_that_send_data`. A process with an account needs the secret of the role |
| Rule engine | `src/axe.ts` | Done. Violations become failed outcomes, incomplete results become review questions. The own target test decides the targets that axe-core could not |
| Contrast measurement | `src/own/contrast.ts` | Done. For the contrast questions that axe-core cannot decide, the engine hides the text, screenshots its box, and reads the colors under it. A text that passes on all colors gives no question. A text whose main color fails, with less than a quarter of the background that passes, is an occurrence. The rest stays a question with the numbers. A text under another element, for example an open menu, is skipped in that state |
| Own page tests | `src/own/page.ts`, `src/own/images.ts` | Done for 27 criteria. The images-of-text test, since 2026-10-16: the visible images in the content, outside the header, the navigation, and the footer, at least 120 by 24 px, whose three main colors cover 85 percent of the pixels, become a review question with a screenshot. A lazy image loads before the measurement. The fix of the same day: the screenshot of a question showed the whole viewport for every selector that starts with "body" |
| Own layout tests | `src/own/layout.ts` | Done. Reflow at 320 px, zoom at 200%, text spacing |
| Own focus tests | `src/own/focus.ts` | Done. One Tab pass forward and one backward. Focus visible by a comparison of the computed styles. Focus not obscured by a grid of nine points. Change of context on focus. Keyboard trap. In a dialog: the focus must stay inside, and Esc or a Close control must close it |
| Listener test | `src/own/listeners.ts` | Done |
| Operation tests | `src/own/operate.ts` | Done. A button that opens a dialog is not a status message, and the dialog is closed after the test |
| Site tests | `src/own/site.ts` | Done. The pages of one list with pagination share the title of the list by design, so they give no question |
| Results | `src/results.ts` | Done. The unit results, the roll-up of section 7.2, the coverage, and the result of each process |
| Grouper and comparer | `src/issues.ts` | Done for the fingerprints, the issues, the questions, and the statuses new, open, reopened, and resolved. The replaced link and the versions come in stage 3 |
| Reporter | `src/report.ts`, `src/write.ts`, `src/overview.ts` | Done. The report has the processes, the states, the sample reason of each page, and the templates with different results. Since 2026-10-15 it opens with the accessibility overview: for level A and for level AA, the share of the tested units with no failure, with the failed and the unknown units apart, the criteria met, failed, unknown, with no content, and not tested, the pages with no failure, the open issues by severity, and the history of the runs. The same numbers are in `summary.json`, in the history line of each run, and on the review page with bars and a chart. It is a tool measure, not a conformance claim |
| Locator and solution writer | | Not started. The issues have the origin "unknown" and a general solution. Stage 4 builds the skill |

## Simplifications of this version

- The focus visible test compares the computed styles of the control with and without the focus. The plan asks for a comparison of screenshots. The style comparison misses a focus style that is present but invisible, for example the same color as the background.
- The states run at the smallest and the largest width only, and the focus pass in a state has 50 Tab presses.
- The engine does not operate the content of an iframe. A form in an iframe, for example a HubSpot form, is a check for a person.
- One criterion gives "not tested": 1.2.4, because no live media test exists. Since 2026-10-16 the image-of-text test (1.4.5) finds the images in the content whose pixels look like text on a flat ground. The AI decides from the screenshot.
- The login works with a storage state file only. The login form method is not built.
- The orphan page test (2.4.5) sees the links of the crawled pages only. The list pages beyond an address group limit are not crawled, so their posts look orphan. The question says so, and it is one question for the site.
- The language detector works with stop words of seven languages. It needs eight words, three hits, and twice the hits of the second language.

## Measurements

| Measurement | Value | Where |
|---|---|---|
| The base site of the seeded faults | 0 issues and 5 review questions for the AI, which all have the truth "no issue": the audio with its transcript link, the drag list with its buttons, the order form with its review step, the login form, and a Read more link in a card with a heading. No check for a person since 2026-10-14. 13 pages, 4 states, 2 processes | `tests/seeded-faults/detect.mjs` |
| Detection rate | 74 of 74 faults found as expected on 2026-10-16, with the AI as the decider of 44: engine 30 of 30, AI 44 of 44. The correct base site gives 0 issues and 6 questions for the AI. Before the images-of-text test: 72 of 74 |
| refact.co, full audit, production settings, 2026-10-14 | 701 pages found (583 from the sitemap, the rest from the links and the WordPress API), 677 tested, 24 did not load, 78 in the sample, 283 states, 0 of 1 processes (the contact process runs on staging). 3,775 renders in 3,597 seconds with 4 workers: 5.3 seconds for each page, about 21 seconds for each page and worker | `node src/cli.ts audit pilots/refact.co.config.json` |
| refact.co, the findings | As the run wrote them: 328 issues and 548 questions. With the grouper of the same evening, applied to the stored outcomes: 54 issues and 214 questions. The one-page issues went from 230 to 13 | `node tools/regroup.mjs <results folder>` |
| Flake rate, before the fixes of the evening | Two audits of the same 15 pages: 40 issues in both and 10 in one audit only, 20% of the union. 74 questions in both and 12 in one only, 14%. The differences came from the states that the workers chose, and from the layout before the fonts loaded | `tools/regroup.mjs <folder> --ids <file>` on two runs |
| Flake rate, after the fixes | Two audits of the same 15 pages, 110 states each: 35 issues in both and 0 in one audit only. 84 questions in both and 3 in one only, 3.4%. The three are timing checks: two autoplay audio checks and one single-key shortcut check. The states now run in a fixed order after the pages, and the tests wait for the fonts | same |

| The second pilot, a large WordPress news site, first audit, production settings, 2026-10-14 | 8 workers, a budget of 120 minutes, read-only. 7,995 pages found, 2,754 tested, 5,212 not tested for the budget, 29 did not load, 83 in the sample. 13,810 renders in 7,225 seconds: 1.9 renders each second, at the rate limit of 2. A full audit of the site needs about 6 hours at this rate limit. 0 states: the state phase came after the budget. 0 of 5 processes: four run on staging only, and the account secret is not set | `node src/cli.ts audit pilots/the second pilot.config.json --concurrency 8 --time-budget 120` |
| The second pilot, the findings | As the run wrote them: 202 issues and 1,863 questions. With the grouper of the same night, applied to the stored outcomes: 137 issues and 333 questions | `tools/regroup.mjs` |

| refact.co, second full audit, 2026-10-14, with the measurements | 696 pages, 321 states, 73 minutes. 116 questions, from 217: the contrast measurement decided most of the 37 kinds of contrast questions, and the pagination rule removed the 74 title questions. 69 issues: 58 open, 5 new, 5 resolved, 1 page removed. The engine's measurement found one AI answer wrong: the AI had called a light text on a dark background an issue at 2.2:1, and the pixels give 6:1 | the history of the results folder in the refact repository |

| refact.co, third full audit, 2026-10-14, after the churn fixes | 696 pages, 330 states, 73 minutes. 110 questions. 69 issues: 62 open, 0 new, 0 resolved, 1 not checked, 1 page removed from before. The same IDs as the second run | the history of the results folder |
| refact.co, fourth full audit, 2026-10-14, the start of the autonomous cycle | 696 pages, 311 states, 72 minutes. 113 questions, 64 of them new: the former checks for a person are review questions now, with the facts of the engine. 62 open issues, the same IDs as the third run. After the cycle: 70 open issues, 7 of them new and 1 reopened, all with an origin and a specific solution | the history of the results folder, `STAGE-4.md`, `STAGE-6.md` |

The second run showed two sources of churn between runs, both fixed the same day. The target test counted the links under an open menu panel as targets of that state. And an issue from a state or a template test counted as resolved when its page was not in the random sample of the run. Now the target test skips a covered element, and such an issue is "not checked" until its page is in the sample again.

The 24 pages of refact.co that did not load are redirects and one 403. They load alone. The run had two other audits next to it on the machine, so the loads ran into the 45 second limit. The log now gives the reason of each failed load.

**The largest issues on refact.co.** The sticky header hides the focused control on a backward Tab, on 78 pages. An open menu panel stays open when the focus leaves it, and hides the control behind it, on 47 pages. The gray labels with `text-black/50` and `text-black/40` fail the contrast on all 677 pages. A canvas acts as a control with no role and no name on 65 pages. The pagination dots are 2 px targets on 520 pages. 19 links have an accessible name that does not contain their visible text.

**The largest groups of questions on refact.co.**

- 62 titles that two or more pages share, mostly list pages with pagination.
- 37 contrast cases that axe-core could not decide.
- 17 videos to check for captions.
- 12 generic link texts.
- One question for the 112 pages that no crawled page links to.

**What the audit of the large WordPress site forced.** The rate limit of 2 loads each second is the floor of the speed, not the CPU. The fixes of the same night:

- The states got no time. The pages now stop at 85% of the budget, and the states and the processes get the rest.
- The subscribe popup opens 10 seconds after the load. The first page of each browser context now waits up to 12 seconds for the banner and closes it. The banner state waits the same time.
- A drag candidate needs a draggable element or a move handler, because a dragstart handler alone blocks the drag of an image. 1,211 drag questions became 3.
- A generic link text gives one question for each text and kind of container. 319 "Read more" questions became 3.
- The key test subtracts the background mutations of advertisements and sliders.
- The cover of a hidden focused control keeps its name without the hash of a block id.
- A load that ran into the time limit gets one more try.

**The largest issues on the large WordPress site.** The footer titles, the frequency labels, and the category links fail the contrast on all 2,754 tested pages. Their colors are #767676, #999999, and #8f7dea on #f4f2fa. The slider arrows and the slider list are divs with click and drag handlers, with no role and no keyboard access, on 62 pages. 19 kinds of controls show no focus indicator. Placeholders fail the contrast on 2,746 pages. The pagination of the brief lists uses links with role button and no focus style.

**The grouping rules that the full audit forced.** A style rule groups by the kind of element, with no page and no state. A contrast issue groups by its color pair. A hidden focused control groups by its cover: the landmark that covers it, or the open panel of a state. The orphan pages give one question for the site. The language questions went from 224 to 1 with the fuller English stop word list and the wider margin.

## Next

1. The three timing checks of the flake test: the autoplay audio check and the single-key shortcut check need a second look before they count.
2. Audit the large WordPress site again with the fixes, with the full budget of 10 hours.
3. The rest of stage 3: the versions, the short check, the history, and the scheduled job. The check "two audits give the same IDs".
4. The AI answers of stage 6 make the 214 questions useful. The skill of stage 4 gives the origin and the source file.
5. Done on 2026-10-16: the image-of-text test (1.4.5) raises a review question with a screenshot.
