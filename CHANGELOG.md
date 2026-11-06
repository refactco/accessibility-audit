# Changes

The version is the same for the package `@refact/a11y` and for the plugin `accessibility-audit`. A machine gets a new copy of the plugin only when this version changes.

## 1.3.5, 2026-11-06

Fixes from the seventh full audit of the large WordPress multisite, with 1.3.4, on 2026-11-06. Also fixes from its first review cycle, with 200 questions. All the fixes of 1.3.4 worked. One new issue was false.

The tests:

- The focus test reads the focus inside a frame. When the focus goes into a frame, the page sees only the frame element, and the style of that element does not change. So the test reads the control that has the focus in the document of the frame, also in a frame of another origin. It compares the styles of that control with and without the focus. Before, an embedded form whose fields show a clear outline gave a false issue "No visible focus". Sometimes the document of the frame has the focus, for example in a lazy frame that is still loading. Then the test waits for the load and presses Tab once more. When the test cannot read the frame, it asks a question. When the frame has no control, its document takes the focus and shows no change, and the issue stays. The detection of `focus-not-visible` is now 1.3.5: a frame issue of an older engine that goes away is "rule changed".
- The item of an element leaves out the fragment of its `src`. The script of an embed can add a fragment with the times of the load, for example `#{"os":487.3}`. So the question of the frame had a new ID in each run. One time, the items of the elements whose `src` has a fragment change. A fragment that does not change, for example `#page=2`, gives the old item again, so its question and its issue continue.

The results from run to run:

- A question whose items are all in a state records `evidence.in_state`. The states run on the sample pages only. So such a question is "not checked" when its page is tested but not in the sample, and it keeps its answers. When it has no answer, its page joins the sample of the next audit. Before, the question went when its page left the sample. Run one refresh with 1.3.5 before the next audit, so that the questions of the last run record their state.
- The questions and the issues of `visual-order-differs` group by the kind of element: the tag and the classes. Before, the item had the first words of the text of the element. So a template that reverses the order of its columns gave one question for each page. On the large site, 2,332 questions came from 17 kinds of element, and all 385 answers were "no issue". A refresh moves the old questions into the new ones. When the answers of the old questions of a group agree, the answer continues. When they differ, the group waits for a new answer. An issue moves to the ID of its kind with its status, its origin, and its solution, and the old ID is "rule changed". The detection of `visual-order-differs` is now 1.3.5. One time, the counts of the questions and of the AI answers go down.

The cycle:

- `refact-a11y tasks <step> --retry` lists only the items of the last batch files of the step that still wait. Before, a second call listed the next items by reach, and an item that an agent left was there only by chance. `cycle.md` tells the main agent to use it.
- The report counts all the first AI answers and names the unsure ones, for example "The AI answered 587 questions (4 of them unsure)". Before, the count left out the unsure answers, but the count of the verifier kept them. So the verifier seemed to check more answers than the AI gave.
- The prompts of `cycle.md` name the folder of the skill (`<skill>`) and the command of the engine in the project (`<command>`). Before, an agent in a site project did not know where the skill files were.
- The agents save their files in `runs/tasks/work/` of the results folder. Before, the prompts named no folder, and an agent saved screenshots in a new folder at the root of a site repository.
- The locate step confirms an issue of the own tests on the live page before it writes a fix. When the page does not show the fault, the solution starts with "No change is needed" and gives the command of the decision. Before, the false frame issue got a code fix with a "certain" source.
- `page-not-linked` says which ways count: a link from another page, an HTML sitemap page, and the site search. The XML sitemap does not count. 2.4.5 needs two ways, so a page that only the site search finds is an issue. Before, the question asked for "a second way", and the two AI passes did not agree on 7 of 24 questions: one pass counted the site search as enough, and the other as one way of two. The text of the question changes. Its ID and its answers stay.
- `player-found`: the AI cannot hear the media. It answers "issue" when an alternative is missing, and "unsure" when the decision needs the sound, for example for captions that a service makes automatically. A person decides those. Before, the two passes did not agree on 8 of 20 questions.

The tests: a new test file, `frames-and-layout`, in `npm test`, with 23 checks. On 1.3.4, 17 of them fail, and 3 pass: a check of the setup, a check that a question at rest has no `in_state`, and the check of a frame that is still loading. The last 3 cannot run on 1.3.4, because it has no `--retry`. The time limit of the CI job is 45 minutes, not 30, because `npm test` takes about 25 minutes.

## 1.3.4, 2026-11-06

Fixes from the sixth full audit of the large WordPress multisite, with 1.3.3 and the full budget, on 2026-11-05. All the fixes of 1.3.3 worked. The site had two short outages during the run, and the engine tested the error pages of its proxy as pages of the site.

The page loads:

- A load that gives a status of 500 or more, with no bot challenge, gets one more load after 15 seconds. When the second load gives such a status too, the width did not load. At the first width, the page is "did not load". At a later width, the page is tested at its other widths only. The states get the same second load. Before, the engine tested the error page as a page of the site, for example the 502 page of a proxy during a short outage. On the large site, 4 such pages gave 8 false new issues and 4 false questions, and 1 question went.
- The status of a page is the status of the first width that loaded. Before, each width wrote over the status of the width before.

The results from run to run:

- An issue whose page did not load at the width of its example is "not checked". A question whose page did not load at a width stays, "not checked", with its answers. Before, when the page loaded at another width, the issue was "fixed", and the question went.
- The item of an image of text uses the address of the image after its load. A lazy image has no address before its load. So before, the images that had not loaded yet shared the item `image|` and one question: 280 images on 271 pages of the large site. Also, the item of an image changed with the timing of the load. Now each image has its own question. When the address of an image is a script, for example `photo.php?id=12`, the item keeps the query. The detection of `image-of-text` is now 1.3.4. One time, the shared question goes, and each of its images gets a new question with no answer. The other images keep their questions and their answers.
- An issue that continues an older ID takes the solution of the old ID. Now each time the old ID is in this solution, it becomes the new ID. Also, the command of a decision in a solution (`refact-a11y dismiss`, `accept`, or `locate`) names the issue of the solution. Before, the solution of a continued issue told a person to dismiss the old ID. A refresh corrects such a solution of 1.3.3. Other IDs in a solution, for example of a related issue, stay.
- An issue keeps `replaces` in the next runs: the old ID that it replaces or continues. Before, the next run cleared it, and the file did not tell the history of its ID. The counts use `replaces` only for a new issue, so they do not change.

The tests: a new test file, `short-faults`, in `npm test`. 14 of its 15 checks fail on 1.3.3. The other one is a check of the setup. `false-changes` has 5 new checks. 4 of them fail on 1.3.3, and one passes on both versions.

## 1.3.3, 2026-11-05

Fixes from the fifth full audit of the large WordPress multisite, with 1.3.2 and the full budget, on 2026-11-05. The site did not change, but some issues and questions came and went from run to run. Also, the report and `summary.json` gave different counts.

The tests:

- The focus test counts only the points of a control that are in the viewport. It reads a control that looks hidden a second time, when the control and the page do not move any more. Before, one read 25 ms after the key decided, and a point outside the viewport counted as covered. So a control gave an issue while the browser scrolled to it, or while a skip link moved in. The same page gave different issues in each run. The detection of `focus-entirely-hidden` is now 1.3.3: an issue of an older engine that goes away is "rule changed".
- The watch of the content that changes by itself leaves out the body and the elements that hold the main content. Before, a script that adds an element to the body gave a question on the body. The pages with such a question were different in each run. For an element that changes, the item of the question has no text, and the HTML has only the start tag. So the ID and the answer stay. The detection of `content-updates-by-itself` is now 1.3.3.

The results from run to run:

- The name of a state comes from the text of its control. When that text changes, for example the options of a list, the IDs of the issues in the state change. Now the new ID continues the old one when the same element fails in a state of the same page: it is open, with the origin, the source, the solution, and the decision of the old one. The old ID is resolved with the reason "rule changed". Before, the old ID was "fixed", and the new one was "new", with no origin. A refresh corrects such a pair of 1.3.2. After the upgrade, run `refact-a11y refresh` once on a results folder of 1.3.2.
- An example path of an older version can differ from the page by the trailing slash, for example `/about` for `/about/`. The comparison now accepts both forms. Before, such an issue stayed "not checked" in each run.
- The pages of earlier issues and questions that the crawl did not find get one request each, with no browser. A page that gives 404 or 410, or that redirects, is gone: its issues are "page removed", and its questions go. A page that still answers keeps its results "not checked", and the report names it. Before, such results stayed "not checked" with no end.
- Some questions come from tests that run on the sample only. The pages of such questions with no answer now open first and join the sample, with the reason "open question". The limit of the sample applies. The random part of the sample still changes in each run, so that the deep tests reach more of the site.
- An issue of axe-core needs the sample only in a state. axe-core runs on each tested page, also for a template criterion such as 2.1.1. Before, such an issue took a place in the sample.
- Two old questions can give one new ID, for example an image with `lazyloaded` and the same image with `ls-is-cached lazyloaded`. Then the question with an answer continues. The answer stays when the old hash differs only by a part that this version leaves out. Before, the first old ID that the search found continued, and the answer of another one went.
- A change of an ID matches only an issue that the run found. Before, an old issue sometimes matched another old issue.

The counts and the refresh:

- `summary.json`, `history.jsonl`, and the report count the issues with one function. Some new issues replace an issue that the run resolved as fixed. Such an issue counts as `replaced`, a new count. It does not count as new or as resolved. Before, the report counted the pair, and `summary.json` did not.
- A refresh with no new answer writes the same `summary.json`. Before, it moved `coverage.pages_out_of_scope` to the end.

The tests: a new test file, `false-changes`, in `npm test`. 17 of its 21 checks fail on 1.3.2. The other 4 are 3 checks of the setup and one check that passes on both versions.

## 1.3.2, 2026-11-05

Fixes from the fourth full audit of the large WordPress multisite, with 1.3.1 and a short time budget, on 2026-11-04. The run lost 17 AI answers, and a refresh changed many files with no new data.

The results from run to run:

- A question whose pages the run did not test stays in the results folder with its answers, and gets `"not_checked": true`. Before, the run deleted the file and the answers. Each short check (`refact-a11y check`) did this too: it deleted the questions of all the pages that it did not test. A question of a test that runs on the sample only also stays when its pages are not in the sample. The report counts these questions apart, and they are not tasks for the review.
- Some issues come from tests that run on the sample only. The pages of such issues that are open or "not checked" now open first and join the sample, with the reason "open issue". So each audit checks these issues. Before, such a page joined the random part of the sample only by chance.
- An issue of an own test that goes away is "fixed" when the engine that found it had the same detection of the rule. `src/own/versions.ts` gives the detection version of each own rule, now 1.3.0 for all. Before, each release of the engine made such an issue "rule changed".
- The identity of an element and the hash of a question leave out the classes that a lazy-load script sets, for example `lazyloaded` and `ls-is-cached`. Before, an answer went when the image came from the cache of the browser. One time, the IDs of the elements with these classes change. Their issues and questions move to the new IDs with their status, answers, and solution. The old issue IDs are "rule changed".

The refresh:

- A refresh keeps `replaces`. Before, it cleared it.
- A question keeps the example that its answer saw. Before, a refresh or an audit could move the example to another item of the group.
- A refresh writes the same report as the audit. The audit writes the parts that come from the crawl to `runs/<run>/report-data.json`. `pages.jsonl` keeps the title, the reason of the sample, the widths with no load event (`load_incomplete`), and the missing stylesheets (`styles_missing`). A refresh of a run of 1.3.1 or older does not have these parts.

The page loads:

- A page whose stylesheet request failed or gave an error status loads once more after 3 seconds. Before, the engine tested the page with no style, and it found faults that the site does not have. A stylesheet that is missing again is broken on the site. The report names the pages, and the next pages do not load again for it.

The report:

- The report gives the pages that a budget left after the quick check found them, by source and by section.
- The "Resolved" column counts the issues that this run resolved. Before, it also counted the resolutions of older runs.

The tests: a new test file, `across-runs`, in `npm test`. Each check of a fix fails on 1.3.1. An audit now adds such a page to the sample. So the test `statuses` checks the "not checked" rule of 1.3.1 with the status code.

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
