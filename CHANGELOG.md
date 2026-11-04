# Changes

The version is the same for the package `@refact/a11y` and for the plugin `accessibility-audit`. A machine gets a new copy of the plugin only when this version changes.

## 1.3.1, 2026-11-04

Fixes from the third full audit of the large WordPress multisite, with 1.3.0, on 2026-11-03. The audit compared the site with results of 1.1.1. It marked 10 issues "fixed", but their elements still failed.

The statuses:

- When several issue IDs of an older version give one new ID, each old ID is resolved with the reason "rule changed". Before, only the first old ID got "rule changed", and the others got "fixed". This happens when an element had a new random name on each page, for example the select of a slider. The new issue takes the origin, the source, the specific solution, and the decision from the old IDs that have them.
- Some tests run on the sample pages only, for example the listener test. An issue of such a test is "not checked" when its page is not in the sample. Before, the engine decided by the criterion. axe-core tests 4.1.2 on each page. So an issue of the listener test on a page out of the sample was resolved, but the test did not run there.
- A refresh corrects the statuses that 1.3.0 gave for these two reasons. A false "fixed" becomes "rule changed", and a false "resolved" on a page out of the sample becomes "not checked". The run and the date of a resolution stay. The next audit corrects a false "fixed" too. After the upgrade, run `refact-a11y refresh` once on a results folder of 1.3.0.

The page loads:

- A short fault of the network can stop a load, for example `net::ERR_NETWORK_CHANGED` when the network of the audit machine changes. Then the load gets one more try after 5 seconds. The log names the error. Before, only a load that ran into the time limit got a second try, and the page was "did not load".

The counts:

- The states with the cookie banner open and the states of the dry submit have their own counts, `coverage.banner_states_tested` and `coverage.form_states_tested`. They are not in `states_planned`. The report gives them after the state phase, with the total. Before, `states_tested` was larger than `states_planned`, and nothing told why.

The tests: a new test file, `statuses`, in `npm test`. Each check of a fix fails on 1.3.0.

## 1.3.0, 2026-11-03

Fixes from the second full audit of the large WordPress multisite, with 1.2.0, on 2026-11-02. The sitemaps filled the time budget, so the audit opened no address that only links give. Of the 198 planned states, 161 did not count, and the log gave no reason.

The crawl order and the budgets:

- After the settings pages, one address of each four comes from the links, while the sitemaps and the API have addresses. Before, the links came only after all the addresses of the sitemaps and the API, and a large sitemap kept them out of the audit.
- When the page time ends, a quick check with no browser sends one request to each address that is left. It stops at 90% of the time budget. It records the redirects off the site, the redirects to skipped addresses, the broken links, and the files, with their reasons. The pages stay "not tested", with their status.
- An address that the audit did not open, and that the quick check did not check, counts in the new `coverage.pages_not_opened`, not in `pages_found`. The report gives the count by source: the settings, the sitemaps and the API, and the links.
- `max_pages` counts the opened pages only. Before, the addresses that the time budget left counted too, and an audit that the time budget stopped also reported the page limit.
- An address that the audit did not open, and that differs from an opened page only by the trailing slash, has no record.
- An address group chooses its addresses from all the sitemaps and the API before the crawl, by its new `order`. `sample`, the default, takes the same addresses in each audit, spread over the whole list. `newest` takes the addresses with the last date of change. `first` takes them in the order of the sources, as before. Before, a group kept the first addresses of the sitemap, and a sitemap of Yoast lists the oldest posts first. The report names the choice. On a site that has an address group, the new default chooses other pages one time.

The results and the IDs:

- The identity of an element leaves out the random parts of an id or a name, for example `slider-4823019576` or `heading-1-1-qtw3vXnaPK`. The site makes these parts new on each render. Now the issue ID stays, the answer of a question stays, and a state finds its control again in a new render. An issue of an older version whose ID changes for this reason moves to its new ID with its status, origin, source, solution, and decision. The old ID is resolved with the reason "rule changed", not "fixed".
- A page that loaded at the first width and not at a later width stays tested, with the new `widths_not_loaded`. Before, it was tested and "did not load" at the same time.
- An address from a sitemap or an API that is not a page of the site names its source in the new `found_in`. The list of broken links shows it.
- `page-not-linked` gives one question for each section of the site, for example `/news/`. The question names what the crawl did not open in the section and why, with the rule of robots.txt.

The loading and the detection:

- A page has 45 seconds for its document, then `crawl.load_wait_seconds` (20 by default) for its load event. When the load event does not come, for example because of slow images, the engine tests the page as it is. The report names the page. Before, the page did not load after two waits of 45 seconds. The dry submit and the processes load pages in the same way.
- The contrast check of the letters of a transparent image of text runs right after the load, before the other tests. Before, it ran some seconds later, and a slideshow had hidden or moved the image by then. The check runs again after the other tests, for the images that a later slide shows. It does not measure an image two times.
- The engine finds the controls of the states before the focus pass and the operate tests change the page. In the new render of a state, it finds the control by its identity, then by its tag and its name.
- A dialog that is open before the click of a state, for example a search box with `role="dialog"`, is not the dialog of that state. Before, each click counted as a state that opened that dialog, and the focus test asked if the focus leaves it.

The log:

- The state phase logs each state that does not count, with the reason: the page did not open, the control is not found, the click failed, no change, an error, the time budget, or a stop. `summary.json` gives `states_planned` and `states_not_applied`, and the report gives the counts.
- After the seed, the log gives the count from each source: the settings, the sitemaps, each WordPress API, the choice of each address group, and what the rules left.

The install:

- The README gives the upgrade steps for npm 12. Under `allow-git=root`, an install of a new tag over an old one stops with `EALLOWGIT`. Remove the package first, then install the new tag.

The tests: two new test files, `budget` and `identity`, in `npm test`. Each check of an item fails on 1.2.0.

## 1.2.0, 2026-11-02

Fixes from a full audit of a large WordPress multisite with many subsites, on 2026-11-01. A third of the time of that audit went to addresses that are not pages of the site. A person had to remove 1,327 page records by hand.

The scope of the crawl:

- `crawl.permitted_domains` names exact hosts. Before, a name also permitted each subdomain, and the audit tested 1,135 pages of other sites on subdomains. `*.example.com` permits the subdomains on request. The `www` host of the site and the bare host are the same site, with the scheme of `site.url`.
- A pattern in `skip`, `templates`, `sets`, or `address_groups` can start with a host, for example `blog.example.com/**`. A path pattern for the templates and the sets matches on the site host only.
- The results name a page of another host by its whole address, so that the same path on two hosts never merges. The pages of the site host keep their paths.
- After each first load, the engine reads the final address. A page that redirects to another site, to a skipped path, or to a file is not tested. Its record gives the reason, and the target in `redirects_to`. A redirect to a page that the audit tests already does not give a second record.
- An error page is tested once, as a template: the error page of the settings, or else the first broken link. The other 4xx addresses are broken links, with the pages that link to them (`linked_from`). The report lists them, with a hint when the address looks like an email address or a web address with no scheme.
- A bot challenge (for example `cf-mitigated: challenge`) or a rate limit gives "blocked", not a tested page.
- These addresses do not count in the pages found or in the coverage. The summary counts them in `coverage.pages_out_of_scope`, and the report lists them.

The discovery of the pages:

- The sitemaps are read to four levels, for example the index of a multisite, then the index of a subsite, then its post sitemap. Before, one level.
- For a WordPress multisite on one host, the crawl also reads the WordPress API of each subsite whose sitemap it finds. `site.cms.api_url` can be a list.
- robots.txt follows RFC 9309. `*` matches across slashes, and a final `$` ends the address. The longest rule decides, and `Allow` wins a tie. A group that names the crawler replaces the group of `*`. robots.txt of another permitted host is read on the first visit to it.
- The frontier gives the pages of the settings first, then the sitemap and API pages, then the links. The sitemap and the link addresses come in turn by section, so a budget that ends early tests some pages of each section.

A stop and a resume:

- Ctrl+C or SIGTERM stops an audit: the open pages finish, then the engine writes the results from the pages tested so far. The addresses that it did not open get the reason "stopped". A second Ctrl+C quits at once.
- Each finished page goes to `runs/<run>/pages.partial.jsonl`. `a11y audit --resume` continues the last run that a stop or a crash ended, with the same run ID, and does not open the finished pages again.

The results pipeline:

- `a11y refresh` counts the pages again. Before, it kept the counts of the audit after a person removed page records.
- A refresh keeps an answer while one item of its question is the same. The question file keeps the short hashes of its items in `item_hashes`. Before, an answer went when the page of the example of its question went.
- `a11y tasks review` keeps to `budgets.max_questions_per_audit`, less the AI answers since the audit, and `a11y tasks locate` to `budgets.max_issues_for_skill`. `--limit <n>` replaces the budget. The output gives `waiting` and `budget`.

The detection:

- A new review question for 2.4.4, `same-name-different-target`: links with the same name and different destinations in the same paragraph, list item, table cell, or with no such context (ACT rule fd3a94). The AI decides, because the heading before a link can name its destination.
- The contrast measure of a text that axe-core could not decide compares two screenshots, with and without the text. A text that paints no pixel is hidden and gives no question. The run keeps it as "passed", with the reason. Before, any element on top of the text hid it, also the transparent layer of a stretched card link. So a light text on such a card gave no outcome.
- A new review question for 1.4.3, `image-text-contrast`: the contrast of the letters in a transparent image of text, for example a title in a PNG over a photo. The engine takes a screenshot with the image and one without it. The pixels that change are the letters, and the second screenshot gives the color under each letter. The measure uses the inside of the strokes, so the smooth edges do not count, and it measures each text color of the image. A slideshow can change the ground between the screenshots, so the measure runs only when the screenshots with the image before and after are the same. The AI decides, because a logo needs no contrast. An opaque image is not measured: its letters cannot be told from its ground.
- The target size test measures a control that a clip hides, for example a skip link with `clip-path: inset(50%)`, only with the focus on it. Before, the hidden skip link of that site failed on 981 pages.
- The listener test ignores the listeners of analytics scripts and the containers of known libraries (Swiper, Google Programmable Search, jQuery UI). A `keydown` listener alone does not make a pointer control. These gave 22 of the 108 issues of that site, and none needed a change.

The install:

- The command is `refact-a11y`. The old name `a11y` still works in a project that has the package. Never run `npx a11y`: an unrelated package on the npm registry has that name, and npx can run it from its cache even with `--no`. The README and the skill use `pnpm exec refact-a11y` or `./node_modules/.bin/refact-a11y`.
- The README gives the steps for npm 12, which installs no git dependency by default: `allow-git=root` in `.npmrc`, and the approval of the build script for the git source.
- New tests: `tests/scope.mjs`, `tests/discovery.mjs`, `tests/stop.mjs`, `tests/refresh.mjs`, `tests/rules.mjs`, and `tests/docs.mjs`. `npm test` runs them.

## 1.1.1, 2026-11-01

Fixes from the first dry submit on a real site, a large WordPress news site, on 2026-10-28.

- A form that sends to its own page, for example a Gravity Forms form, is the same form on each page. Before, the engine tested the footer form of that site on 47 pages. The names of the hidden fields now tell two forms with the same visible fields apart.
- The engine skips a form in a fixed bar or panel that is outside the screen, for example a closed slide-up bar. It also skips a form that a new render does not show yet, for example in a popup that opens 10 seconds after the load. The coverage names that form. Such forms show only after an action or a delay. Before, their buttons did not respond, and the coverage said "not tested" for 11 pages of that site.
- The audit records the version of the package as the engine version. Before, it recorded 0.1.0. The first audit after this update is a baseline audit: an issue that disappears in it gets "resolved, rule changed", not "fixed".
- A criterion that the processes test, for example 3.3.1 on staging, shows the process steps in its coverage (`coverage.process_units`). Before, it showed "no issue found" with 0 tested units.
- `tests/summary.mjs` tests the engine version and the coverage of the process steps. `npm test` runs it.

## 1.1.0, 2026-10-26

The dry submit: form errors are tested on production, and no data leaves the browser. See `FORMS.md`.

- The engine clicks the submit button of each form on the sample pages, first empty, then with incorrect values, each time in its own render. It tests the errors that the page shows: the form tests of the processes (3.3.1, 3.3.3), a new test for errors that a screen reader does not announce (4.1.3, `error-not-announced`), and the tests of a state on the error state.
- A guard blocks each request that can carry the data: each request that is not GET, each page, frame, fetch, XHR, and beacon, each script that is not a `.js` file, each request to another host, and each address with a typed value. Service workers are off, and a WebSocket cannot send. A test proves it for eleven ways to send a form, with a control run that shows each way reaches the server when there is no guard.
- A form that tried to send and showed no error checks on the server only. The coverage lists it, and its page does not count as tested for 3.3.1 and 3.3.3.
- The setting `interaction.dry_submit`, `true` by default on each environment. The summary gives `coverage.forms_tested`.
- The form tests accept a message that asks for a value, like "Enter your name", as the suggestion for an empty field (3.3.3). This applies to the processes too.
- `FORMS.md`: the plan for the form tests, with the safe staging for the real submissions and the test account for the sign-in.

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
