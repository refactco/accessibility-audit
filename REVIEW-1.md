# Review of PLAN.md draft 1

Review 1, 2026-10-12. Reviewer: Claude (Fable 5.1). Status of the plan: not approved.

This review uses Simplified Technical English. Code, file names, and the names of WCAG criteria stay in their usual form.

## 1. How this review was made

The review has three parts.

1. A check of section 7 and Appendix A. The sources: the WCAG 2.2 Recommendation of 2024, the Understanding documents of all 55 criteria, the ACT rules, and the axe-core rule list.
2. A check of sections 2, 4.5, 5, 6, 7.2, 8, 10, and 12. The sources: the WCAG 2.2 conformance requirements, WCAG-EM 1.0 and 2.0, the ACT Rules Format, EARL, and the W3C pages on evaluation.
3. A review of the full plan for consistency, gaps, and realism.

Parts 1 and 2 ran as independent checks. Each check got only the plan and the sources, not the intent of the author. I confirmed the findings that change the plan most with a second read of the source. Appendix C of this review lists the sources.

## 2. Verdict

The structure of the plan is correct, and the plan is honest about the limits of automatic tests. The 55 criteria are complete, and their names and levels are correct. The two-layer form, the results as files, and the recurrent audit are sound. The W3C sources support the decision that only a person can give "passed".

But the plan is not ready for approval. It has 16 problems that we must correct before approval, 19 improvements that I recommend, and 12 notes. The most important problems are these:

- The plan says that 15 criteria are fully automatic. The sources support only 3. The other 12 need a review of ordinary cases, not only of unusual cases.
- Two results are not honest. "Not applicable" is a pass in WCAG, and "Failed" can come from an issue that only needs review.
- The results are for the whole site. WCAG conformance is for each page and each complete process, and the plan never audits a process on production.
- Some tests operate the live site, and the design rules do not control them.
- The status rules have holes. Issues from a review can never resolve, a reviewer cannot reject a false issue, and a rule update looks like a fix.
- The plan does not name the four non-interference criteria, and it does not define page states.
- One factual error: the five-second condition of 2.2.2 does not apply to content that updates automatically.

Sections 3 to 5 give all findings. Section 6 gives the checks of Appendix A. Section 7 lists what the checks confirmed as correct. Section 8 lists what we could not verify.

## 3. Must fix

Each finding gives the location, the problem, and the change.

**F1. The five-second condition of 2.2.2 is wrong for content that updates.**

Appendix A says: "Finds content that moves or updates for more than 5 seconds". WCAG 2.2 has two parts in this criterion. The five seconds apply only to information that moves, blinks, or scrolls.

Content that updates automatically, for example a news ticker or a stock price, has no five-second condition. The Understanding document says: "there is no five second exception for auto-updating".

Change: split the test into two tests. Flag content that moves for more than five seconds. Flag all content that updates automatically, with no time limit. The review confirms that a control can pause, stop, or hide it, or that it is essential.

**F2. The result "Not applicable" is a hidden "passed".**

Section 7.2 lets the engine give "Not applicable" when it finds no content of a type. The Understanding document on conformance says: "if there is no content to which a success criterion applies, the success criterion is satisfied". Thus "Not applicable" from the engine is a pass.

For a video element or a lang attribute, the finder is reliable. For 2.2.1, 2.3.1, 2.5.1, 2.5.4, and 3.3.7, the finder is not reliable. The same applies to media in iframes. Then the result is a false "passed", which decision 6 of section 1 forbids.

Change: rename the engine result to "No content found". Keep "Not applicable" for a person, with the name and the date. Give it to the site only when it is true on each page.

**F3. The result "Failed" can come from an issue that only needs review.**

Section 7.2 says: "Failed: the engine found one or more issues". Section 8.5 says that an issue is "fail" or "needs review". The ACT rules map only a failed outcome to "not satisfied".

A possible problem from the AI review must not fail a criterion. The plan also does not say what an accepted issue does to the result of its criterion.

Change: "Failed" needs at least one issue with the certainty "fail" and a status of new, open, reopened, or accepted. An issue with the certainty "needs review" gives "Needs review". An accepted issue keeps the criterion at "Failed", and the report shows the count of accepted issues. A dismissed issue does not count. See F8.

**F4. The "Auto" method is over-claimed for 12 of 15 criteria.**

Section 7.1 defines "Auto" as: a script decides, with no person. The sources support this only for 2.4.7, 2.4.11, and 3.2.1, and only with conditions.

For the other 12 rows, one of two things is true. The criterion has exceptions that need judgment in ordinary cases, or the automatic test finds only a part of the failures. Section 6 of this review gives the row of each criterion. Three rows also contradict the definition inside the plan: 1.4.2, 1.4.3, and 1.4.10 have a person check in their last column.

Change: move the 12 rows to "Auto + review", and set the counts in section 7.1 to 3, 41, and 11. Also use the ACT outcome model for each tested element: "passed", "failed", "inapplicable", and "cantTell". A "cantTell" outcome makes a review question.

The result of a criterion then comes from the outcomes and from the state of the review, not from the method. Record for each outcome the mode, which is automatic, semi-automatic, or manual, and who gave it.

**F5. The result table has a hole.**

Section 7.2 gives no result for this case: the method is "Auto + review", the script found nothing, and all review answers found no problem. The result cannot be "No issue found", because the method is not "Auto". It cannot be "Passed", because no person gave it. It cannot be "Needs review", because the review is complete.

A second hole: "No issue found" needs a test on all pages, but four "Auto" criteria run only on the example page of each template.

Change: permit "No issue found" when all tests of the criterion ran in their test group, and the review is complete. Show the count of answers that only the AI gave. Define "all pages" for each test group, and show in the report which definition applies.

**F6. Some tests operate the live site.**

Design rule 6 in section 4.5 limits only the tests that send data. But Appendix A has tests that operate the page.

Test 2.1.4 presses each character key. Tests 2.5.2 and 4.1.2 operate controls. Test 3.2.2 changes the value of each field. On a live shop, such a test can press "Add to cart", "Delete", or "Log out".

Change: define "read only" as a list of permitted actions: navigate, Tab, hover, focus, Esc, and open menus and dialogs. Forbid text entry, form submission, character keys, and drag on production. Run the interaction tests only on the example page of each template.

On production, block all network requests that are not GET during these tests. Keep a list of control names that the tests must not operate, for example "delete", "pay", "send", and "log out". Add this risk to section 12.

**F7. Issues from a review or a person check can never resolve.**

Section 6.1 says that only the engine can set the status "Resolved", after the same test on the same page. But the engine cannot test again if a caption is correct, or if an alt text describes its image. An issue from an AI answer or from a person check thus stays "Open" after the fix.

Change: define "Resolved" for each certainty. For an engine issue, the same test passed on all pages that had the issue. For a review issue, the item changed, and the new answer found no problem. For a person check, a person recorded a new answer, with the name and the date. The issue file records which check gave the status, and its mode.

**F8. A reviewer cannot reject a false issue.**

The status list includes "Accepted" for a known risk. It has no status for an issue that is not a real problem, for example a rule error or a decorative text with low contrast. A reviewer must not use "Accepted" for this, because an accepted issue is still a failure. The plan also does not say what happens when an accepted issue disappears, returns, or changes.

Change: add the status "Dismissed", with a reason, a name, and a date. The engine keeps the fingerprint and does not report it again until the element changes. A dismissed issue does not count in the result of its criterion, and it counts in the false issue rate. The report lists the dismissed issues separately. Say that an accepted issue that disappears becomes "Resolved", and that an accepted issue that changes needs a new decision.

**F9. A rule update looks like a fix.**

An update of axe-core, or of our own tests, can change a rule, its ID, or its result. Then the next audit reports false "resolved" and "new" issues, and the ID stability number drops with no change on the site.

Change: record the version of the engine and of each rule engine in each run and in each issue. Pin the versions. When a version changes, mark the audit as a new baseline. For an issue that disappears in a baseline audit, report "rule changed" in place of "resolved".

**F10. The results are for the whole site, but WCAG conformance is for each page.**

Section 7.2 gives one result for each criterion for the site. WCAG 2.2 says that a web page satisfies a criterion. Conformance is for full pages only. Each responsive variation of a page is a part of the page.

WCAG-EM says that a conformance claim for a full website cannot come from a sample of pages. The plan stores no result for a page, a state, a width, or a process. Thus the site result cannot be derived.

Change: store the result of each criterion for each page, state, and width. Build the result of a process and of the site as a roll-up: failed when one unit fails, no issue found when all units pass, with the coverage. The report can then also list the pages with no known failure.

**F11. Complete processes are never audited on production.**

WCAG 2.2 says that all pages of a complete process must conform, for example a purchase or a registration. WCAG-EM says that the sample must include all pages and views of a complete process. The plan has no definition of a process, and rule 6 forbids tests that send data on production. Thus a checkout, a registration, a login, and a search are never audited on a live site.

Change: add processes to the settings, as a list of steps with their pages. Test the processes on staging, or on production with explicit permission and test accounts. Report each process that was not tested. Give a result for each process.

**F12. Page states are not defined.**

Section 2 puts the states of a page in the scope. But the plan does not say how the engine finds a state. It does not say how many states it tests on a page. It does not say how a fingerprint identifies a state. WCAG-EM uses "web pages and web page states" in each step. The example issue has an empty state field.

Change: define a state as a list of actions from the initial page, for example "open the main menu". Let the engine find states from menus, dialogs, tabs, accordions, and form errors. Set a limit of states for each page. Put the state and the width into the fingerprint and the issue file.

**F13. The four non-interference criteria are absent.**

WCAG 2.2 has four non-interference criteria: 1.4.2, 2.1.2, 2.2.2, and 2.3.1. Section 5.2.5 says that they apply to all content on a page. This includes content that the site does not rely on, for example a cookie banner, a chat widget, an advertisement, or a video player.

A failure of these four can block the full page. The plan never names this requirement. It also lets a person accept an issue from a third party.

Change: test the four criteria on each page and each state, with the cookie banner open. Mark their issues as "not excludable", with the severity "critical". An accepted issue of these four stays in the main list of the report.

**F14. The status rules do not cover four common cases.**

Section 6.1 does not say what happens in these four cases.

- A page no longer exists, so its issue stays "Not checked" at each audit.
- A fix removes an issue from 400 of 412 pages.
- The example page of a template changes, so the template tests run on a different page.
- A short check tests some pages of an issue, but not all.

Change: add the status "Page removed" for a page that gives 404 or 410, or that is absent from three audits. Say that an issue stays "Open" until all its pages pass, and that the report shows the change of the reach. Pin the example page of each template in the settings, or resolve template issues at the level of the template. Say that a short check can only resolve an issue when it tested all pages of the issue. Also define "Not checked" as "its pages were not tested in this audit", not only as "did not load".

**F15. A change of markup breaks the fingerprint.**

The fingerprint uses the rule, the element, and the template. A rename of a class, a refactor, or a new alt text that is still wrong changes the element and thus the fingerprint. The old issue becomes "Resolved" and a new issue appears. This inflates the resolved count and corrupts the ID stability number and the solution success rate.

Change: add a second match for an issue that disappears, by rule, template, page, and position in the structure. When the second match finds a new issue, link the two with "Replaced", and keep the first-seen date. For a content item, use the attachment ID or a hash of the source, not the position of the image.

**F16. No cost model for a daily audit.**

The page tests need 7 to 10 renders of each page: the rule engine at three widths, reflow, zoom, text spacing, and the states. A site with 5,000 pages needs about 40,000 renders. At 3 to 5 seconds for each render, that is 30 to 55 hours in one browser, and 4 to 7 hours with eight browsers.

The template tests add Tab passes and hover and focus tests for each control. WCAG-EM has sample rules because a full evaluation is frequently not feasible. Section 11 puts "audits that test only changed pages" after version 1.

Change: state the concurrency, the time budget, the maximum of pages, and the maximum of states in the settings. In version 1, skip the expensive tests on a page with the same content hash and the same style hash, and keep its last results. Give the default schedule as a daily short check and a weekly or monthly full audit.

## 4. Recommended changes

**S1. One answer for each item is wrong for four criteria.**

Section 7.3 says that one answer applies to all pages with the item. For 1.1.1, the correct alt text of an image depends on its context. The Understanding document gives the same image with different alt texts.

For 2.4.4, the link purpose comes from the link text and its context. For 2.4.6, a heading describes the content after it. For 2.4.2, a title describes its page. For these criteria, the fingerprint of the question must include the context.

**S2. No workflow for the person.**

The plan says that the report shows the name and the date of a person check. But it does not say how a person records an answer or a "Passed". Add a command, or a step of the skill, that writes the answer into the question file. Define the field `person_answer` as an object with `value`, `by`, `date`, and `note`.

**S3. Missing fields in the data formats.**

The issue file does not point to the review question that made it. The question file does not point to its issue. The AI answer has no model name, no date, and no version of the prompt. Without them, you cannot explain why an answer changed between two audits. The issue file also lacks fields for the environment, the run, and the engine versions. It lacks the state, the mode of the outcome, and the reason of a dismissal.

**S4. The source can differ from the live site.**

The skill finds the source file in the repository. But the live site can run an older build, a different branch, or templates from the WordPress database. Record the commit that the skill used. If the live site gives a build ID, record it too. Show a warning in the issue when the two do not agree.

**S5. Confidence is not a measurement.**

Section 7.3 sends only the answers with low confidence to a person. An AI model does not report its confidence accurately. Add a random sample of the answers with high confidence, for example one in ten. Measure the "AI answer accuracy" number on this sample. A wrong "no problem" from the AI is the main path to a missed issue. Thus the report must show how many answers only the AI gave.

**S6. The cost of the AI review.**

The first audit of a site with thousands of images needs thousands of vision calls. Add a limit for each audit in the settings. Keep the answers by content hash. Do the questions with the largest reach first.

**S7. The crawler lacks some cases.**

Section 5.2 does not mention cookie banners, routes with a hash, pages in more than one language, the error page, or robots.txt. It does not mention the end of a session, two-factor login, user roles, facets, search results, or a rule for canonical addresses. A cookie banner covers each page and changes the test results. Add a setting for the selector of the banner, and test the page in both states one time. Say that the crawler reads robots.txt and records what it skipped.

**S8. Secrets and personal data in Git.**

The issue files hold HTML and screenshots of pages, and some pages are behind a login. Add a rule that removes personal data and tokens from the HTML examples. Keep the screenshots of pages behind a login out of Git. Name the secret store for the login, for example an environment variable and a Playwright storage state file.

**S9. The engine can find listeners in the browser.**

For 2.5.4, 2.5.7, 2.1.4, and 2.2.1, the plan searches the source code with the skill. The engine can also ask the browser for the event listeners on each page. This finds motion listeners, drag handlers, and keyboard shortcuts with no source code, and also in third-party scripts. Add this test to the engine, and let research question 7 compare the two methods.

**S10. Section 7.4 lists only four person tasks.**

Appendix A has 12 "Person" rows. Section 7.4 omits the person tasks of eight criteria. These are 1.2.1, 2.2.1, 2.3.1, and 2.5.1. The others are 2.5.4, 2.5.7, 3.3.4, and 3.3.7. List all person tasks, or point to Appendix A.

**S11. Seven rows of Appendix A lack a threshold, an exception, or a scope.**

Section 6 gives the details. In short, four rows lack a threshold or an exception. 1.4.3 lacks the 3:1 limit for large text and five exceptions. 1.4.10 lacks the 256 px condition for horizontal content. 1.4.5 needs the definition of an image of text. 3.3.4 lacks forms that change or delete user data.

Three rows use the wrong term or measure. 3.3.8 uses "memory test" for "cognitive function test". 3.2.6 compares positions, but the criterion compares the serialized order in the same page variation. 2.2.1 has an automatic failure for meta refresh, so its method is "Auto + review".

**S12. "Passed" has no scope and no end.**

A person gives "Passed" with a name and a date, but the plan does not say for which pages and states. A new page, a new state, or new content makes the result old. WCAG-EM keeps the audited pages and states with the result. Give "Passed" a scope of page and state, and void it when the page changes.

**S13. The sample has only one of five parts.**

WCAG-EM selects a structured sample from five parts: common pages, essential functionality, types of pages, the technologies that the site relies on, and other relevant pages. The plan groups pages by template, which is part three. Always include the home page, contact, help, legal pages, login, and the accessibility statement. Include each page with a unique technology, for example a PDF, a player, a map, an iframe, or a canvas. Say how the engine detects "a unique component" before the template tests.

**S14. No random sample.**

WCAG-EM adds a random sample of 10% of the structured sample. New findings in the random sample show that the structured sample was not representative. The template groups are a heuristic. Run the template tests on a random 10% of the pages too, and split a template when the results disagree.

**S15. The template tests have no width.**

WCAG 2.2 says that each variation of a page for a screen size must conform. The mobile menu is a different component from the desktop navigation. Run the keyboard, focus, hover, and state tests at each width, or at the breakpoints of the site.

**S16. The baseline is not recorded.**

WCAG-EM records the browsers and assistive technologies of the evaluation and the technologies that the site relies on. WCAG 5.2.4 needs accessibility-supported use of technologies. The plan tests with Chromium and no assistive technology, and it records neither. Record the browser, its version, the assistive technologies of the person checks, and the technologies of the site in the settings and the report.

**S17. Two kinds of third party.**

WCAG 5.4 permits a statement of partial conformance only for content outside the control of the author, with a list of the parts. A plugin, a chosen player, or a widget is under the control of the site. Split the origin "third party" into "controlled" and "uncontrolled". List the uncontrolled parts of each page, so that a person can write the statement.

**S18. Live pages are not stable.**

Design rule 1 says that the results are the same at each audit, and section 10 has a repeat test on the same build. But live pages change between two loads: advertisements, A/B tests, rotation, personalization, and consent. The zoom, spacing, contrast on images, and focus tests are heuristics. Add a rule for unstable results, for example two runs before a new issue, and measure a flake rate on the pilot sites.

**S19. The product tests need more than the ACT cases.**

The W3C file has 1,213 ACT test cases with the expected outcome of each. They test the rules only, and axe-core already passes them for 26 rules. They do not test the crawler, the grouper, the fingerprints, the widths, the states, the AI answers, or the solutions.

Add two public sets. The W3C "Before and After Demonstration" has five pages in a bad and a good version, with annotations. The GOV.UK "Accessibility tool audit" has 142 barriers on single pages. Both are old, from 2012 and 2018, and they cover WCAG 2.0. Also publish an ACT implementation report in EARL, so that W3C can list the engine.

## 5. Notes

**N1.** Section 5.3 says that the page tests run "at each width". But the reflow test runs at one width, and the zoom test is one render. Correct the wording.

**N2.** Section 5.5 says that the engine finds some origins with the CMS API. Section 4.2 has no module for this work. Add it to the grouper, or name a locator module.

**N3.** Section 2 says that a PDF is not tested. Say that the report lists each PDF as a page with the result "Not tested". In WCAG, a resource at its own address is a web page.

**N4.** Section 11, stage 2, says "done when the report lists all 55 criteria with correct results". This is not measurable. Say "with the results that the rules of section 7.2 give".

**N5.** Section 8.2 lacks some settings. Add the standard and the level, the languages of the site, and the cookie banner. Add the login method, the CMS type, the processes, and the sets of pages. Also add the list of controls that tests must not operate, and the limits of the AI review.

**N6.** The skill works on each new issue. A first audit with 2,000 issues needs a limit and an order, by reach and severity. Add the limit to the settings.

**N7.** Section 6 of this review has 12 more notes on single criteria. Examples: the caption tracks of 1.2.2, the landmarks of 1.3.1, and the conditions of 2.4.7 and 2.4.11.

**N8.** Design rule 4 says that an automatic test cannot give "passed", and section 6.1 says that "Resolved" means that the test passed. Both are correct at different levels. A rule outcome can have the value "passed". A criterion is satisfied only after further testing. Say so in section 7.2.

**N9.** The browser has no zoom function in Playwright. Say how the engine emulates 200% zoom, and from which base width. One method is half the viewport width with a device scale factor of 2. Give the zoom, reflow, and text spacing issues the certainty "needs review", with a screenshot.

**N10.** The site tests of 3.2.3, 3.2.4, 3.2.6, and 2.4.5 apply to a "set of web pages". A set has a common purpose and the same author. A site can have more than one set, for example a shop and a blog. Permit sets in the settings.

**N11.** W3C has an EARL format in JSON-LD for ACT results, with the test subject, the assertion, the test, and the outcome. Our issue format is custom. Keep it, but add an export to EARL after version 1. Section 12 lacks the risks: actions on production, the consent state, unstable results, a non-interference failure hidden by "Accepted", a grouping miss, and an old "Passed".

**N12.** Appendix B cites no source for the method. Add WCAG-EM 2.0, which is a W3C Group Note of 23 July 2026. Add WCAG-EM 1.0 at its dated address, the ACT Rules Format 1.1, and EARL.

## 6. The checks of Appendix A

The check confirmed all 55 numbers, names, and levels. The table lists only the rows with a finding. "Auto + review" in the column "New method" means: a script decides the usual cases, and a review decides the flagged cases.

| Criterion | The plan | The finding | New method | Source |
|---|---|---|---|---|
| 1.2.2 | Looks for a caption track | Captions can be in the video file itself. A missing track element is not a failure signal. The criterion applies only to synchronized media | Person, finder only | ACT rule f51b46 |
| 1.2.3, 1.2.5 | Looks for a description track | The visual information can also be in the audio itself. The finder gives candidates only | Person, finder only | ACT rule 1ea59c |
| 1.3.1 | Tests landmarks | The axe-core rules for landmarks, regions, and heading order are best practice. They have no WCAG tag. Do not report them under 1.3.1 | Auto + review | axe-core rule descriptions |
| 1.3.4 | Auto: portrait and landscape, finds a lock | The approved ACT rule covers only CSS that rotates content on the orientation media feature. The axe-core rule is experimental and off. The "essential" exception needs judgment | Auto + review | ACT rule b33eff |
| 1.3.5 | Auto: tests the autocomplete value | The ACT rule and axe-core only validate an attribute that is there. A field for the email of the user with no attribute fails, but a script cannot know that the field is about the user | Auto + review | Understanding 1.3.5 |
| 1.4.2 | Auto, with a person check in the last column | The criterion passes when a control can pause, stop, or change the volume of the audio. The ACT rule is proposed, and the control part needs judgment. The axe-core rule only flags for review | Auto + review | ACT rule 80f0bf |
| 1.4.3 | Auto: all text, pixels for text on images | The limits are 4.5:1, and 3:1 for large text, which is 18 point or 14 point bold. Exceptions: inactive controls, decoration, invisible text, text in a picture with other significant content, and logotypes. W3C says to take the colors from the code and the styles, not from the screen. Pixel samples fit background images, not the glyphs. Placeholder text and text on hover and focus are in the scope | Auto + review | Understanding 1.4.3, ACT rule afw4f7 |
| 1.4.4 | Auto: zoom to 200%, finds cut text and a zoom block | The zoom block has an approved ACT rule. The cut text has only a proposed rule with one semi-automatic implementation. Cut text passes when the full content is available on focus or after activation. Captions and images of text are exceptions | Auto + review | ACT rules b4f0c3 and 59br37 |
| 1.4.5 | A person confirms that the image is not a logo | The definition excludes text in a picture with other significant content, for example a photo or a screenshot. The exceptions are "customizable" and "essential", and logos are one example. An image of text next to the same text passes. The reviewer must decide the definition and the exception | Auto + review | Understanding 1.4.5 |
| 1.4.10 | Auto: 320 px, finds sideways scroll and cut content | The criterion has two conditions: 320 CSS px of width for vertical content, and 256 CSS px of height for horizontal content. The plan has only the first. The exception is for each part with two dimensions: maps, diagrams, video, data tables, and toolbars. Content that moves to a new position is not a loss | Auto + review | Understanding 1.4.10 |
| 1.4.12 | Auto: applies the values, finds cut or overlapped text | The approved ACT rules cover only inline styles with "!important". An ellipsis passes when the content is still available. Images of text and canvas are out of the scope | Auto + review | Understanding 1.4.12 |
| 2.1.2 | Auto: Tab and Shift+Tab, finds a trap | A trap passes when the page tells the user how to move the focus away. A dialog that holds the focus passes when the user knows how to leave it. The ACT rule says that the exit method needs interpretation | Auto + review | Understanding 2.1.2, ACT rule 80af7b |
| 2.1.4 | Presses each character key | The method is correct. The key presses on a live site can start actions. See F6 | Auto + review | ACT rule ffbc54 |
| 2.2.1 | Person | The approved ACT rule fails a meta refresh with a delay between 1 and 72,000 seconds. The axe-core rule is automatic. A reliable automatic failure exists. The session limits stay with a person | Auto + review | ACT rule bc659a |
| 2.2.2 | Finds content that moves or updates for more than 5 seconds | The five seconds apply only to information that moves, blinks, or scrolls. Content that updates automatically has no five-second condition. W3C: "there is no five second exception for auto-updating". Split the test | Auto + review | Understanding 2.2.2 |
| 2.4.1 | Auto: skip link and landmarks | The axe-core rule only flags for review. The ACT rule is a proposed composite, and all its parts are "partial" in automatic tools. A script cannot know which blocks repeat on many pages without judgment | Auto + review | ACT rule cf77f2 |
| 2.4.6 | Finds empty headings and empty labels | W3C: "This success criterion does not require headings or labels". Report empty headings and labels under 1.3.1, 4.1.2, or 3.3.2 | Auto + review | Understanding 2.4.6 |
| 2.4.7 | Auto: screenshot with and without focus | The method agrees with the approved ACT rule, but automatic implementations are "partial". Use real Tab events, scroll the control into view, compare the full viewport, and ignore animation | Auto, with conditions | ACT rule oj04fd |
| 2.4.11 | Auto: a fixed element hides the focused control | No ACT rule and no axe-core rule exist. Test only "not entirely hidden". Test the initial positions. Content that the user opened and can close without a move of the focus does not count | Auto, with conditions | Understanding 2.4.11 |
| 2.5.2 | A person confirms that you can cancel the action | The reviewer must confirm one of four options: no down-event, abort or undo, up reversal, or essential | Auto + review | WCAG 2.2, 2.5.2 |
| 2.5.3 | Auto: compares the visible label with the name | The ACT rule is proposed and limited to widgets with aria-label or aria-labelledby. The criterion includes images of text. Symbols are not labels | Auto + review | Understanding 2.5.3 |
| 2.5.8 | Auto: size and space | No ACT rule exists. The axe-core rule is off by default. The exceptions "equivalent" and "essential" need judgment. A slider is one target. Overlapped areas do not count | Auto + review | Understanding 2.5.8 |
| 3.1.1 | Auto: attribute and language of the text | The presence and the validity of the attribute have approved ACT rules. The match with the text has a proposed rule. The default language is the language that the page uses most, which is an estimate on short or mixed pages. Send a mismatch to review | Auto + review | ACT rule ucwvc8 |
| 3.2.1 | Auto: change of page or window | A change of context also includes a move of the focus and content that changes the meaning. A menu that opens or a tab control does not necessarily change the context. Send content changes to review | Auto, with conditions | WCAG 2.2 glossary |
| 3.2.3 | Compares the order of the navigation | The criterion says "same relative order". Permit insertions and removals. Flag only a change of order. The scope is a set of web pages | Auto + review | WCAG 2.2, 3.2.3 |
| 3.2.6 | Compares the position on all pages | The criterion says "same order relative to other page content". The order is the serialized order, in the same page variation, for example the same zoom and orientation. Compare for each width | Auto + review | WCAG 2.2, 3.2.6 |
| 3.3.4 | Finds forms for payment, orders, and legal data | The scope also includes forms that change or delete data of the user in a data store, and forms that send test answers | Person | WCAG 2.2, 3.3.4 |
| 3.3.8 | A method with no memory test | The term is "cognitive function test". The four exceptions are alternative, mechanism, object recognition, and personal content. A block of paste or of a password manager fails unless an alternative exists. A CAPTCHA with transcribed audio does not meet the alternative exception | Auto + review | Understanding 3.3.8 |
| 4.1.3 | Confirms that the text is a status message | A status message is a change of content that is not a change of context. A message that takes the focus is not a status message. The reviewer also confirms the type of the live region | Auto + review | WCAG 2.2 glossary |

Two more findings apply to the whole appendix.

- With these changes, the counts become: Auto 3, Auto + review 41, Person 11. The counts in section 7.1 must follow.
- axe-core has no rule for 2.4.11, 2.5.7, 3.2.6, 3.3.7, and 3.3.8. Its only WCAG 2.2 rule, target-size, is off by default. This is an input for research question 2.

## 7. Confirmed as correct

- All 55 criterion numbers, names, and levels. The counts 31 A and 24 AA, and 20, 20, 13, and 2 by principle. Criterion 4.1.1 is correctly absent.
- The method and the checks of 23 criteria are correct, as follows.
- Perceivable: 1.1.1, 1.3.2, 1.3.3, 1.4.1, 1.4.11, and 1.4.13.
- Operable: 2.1.1, 2.3.1, 2.4.2, 2.4.3, and 2.4.4.
- Operable, continued: 2.4.5, 2.5.1, 2.5.4, and 2.5.7.
- Understandable: 3.1.2, 3.2.2, 3.2.4, 3.3.1, 3.3.2, 3.3.3, and 3.3.7.
- Robust: 4.1.2.
- The "Person" method of 1.2.1, 1.2.2, 1.2.3, 1.2.4, and 1.2.5.
- The values 320 CSS px for reflow and 200% for zoom.
- No statement of conformance, and "Passed" only from a person. W3C says that no tool alone can determine if a site meets the standard. The ACT rules say that a passed rule does not mean that the criterion is satisfied.
- The certainty values "fail" and "needs review" map to the ACT outcomes "failed" and "cantTell".
- Cheap tests on all pages exceed the minimum of WCAG-EM, which recommends an evaluation of all pages when it is feasible.
- The coverage part of the report, which lists the pages found, tested, and not tested.
- An issue record with the address, the selector, the HTML, the values, and a screenshot. WCAG-EM asks for at least one example for each failed criterion.
- One issue for a shared component, with the count of its pages. WCAG-EM says that repeated components do not need a new evaluation at each occurrence.
- The fingerprints, the repeat test, and the ID stability number, with the gap in F15.
- The rate limit, the permitted domains, and the separate secret store.
- The W3C page on diverse abilities names five groups: auditory, cognitive and learning, physical, speech, and visual. The sixth group in section 3.1 is a split of the plan, and the plan says so.

## 8. Not verified

- The claims about Siteimprove and Deque in section 7.3. They are not W3C sources.
- The axe-core descriptions come from the development branch, not from a release.
- The ACT rule pages are the latest drafts. They can differ in detail from the approved text. The split of approved and proposed rules comes from the list page.
- The Techniques and Failures pages, for example F83 and G133, were not opened. The review used them only as the Understanding documents cite them.
- The meaning of the W3C Report Tool labels comes from W3C mailing lists of 2014 and 2019. The tool itself is an application with no readable text.
- The archive date of the GOV.UK repository and the count of failed criteria in the W3C demonstration come from one fetch each.
- The render counts and the hours in F16 are estimates, not measurements.
- The third-party sources in Appendix B of the plan: the FTC order, the 2026 study, and the vendor pages.

## Appendix C: sources of this review

- WCAG 2.2, W3C Recommendation of 12 December 2024: https://www.w3.org/TR/WCAG22/
- Understanding WCAG 2.2, all criteria and conformance: https://www.w3.org/WAI/WCAG22/Understanding/
- WCAG-EM 2.0, W3C Group Note of 23 July 2026: https://www.w3.org/TR/WCAG-EM/
- WCAG-EM 1.0, W3C Working Group Note of 10 July 2014: https://www.w3.org/TR/2014/NOTE-WCAG-EM-20140710/
- ACT Rules Format 1.1: https://www.w3.org/TR/act-rules-format/
- ACT rules list: https://www.w3.org/WAI/standards-guidelines/act/rules/
- ACT test cases: https://www.w3.org/WAI/content-assets/wcag-act-rules/testcases.json
- ACT implementation reports in EARL: https://www.w3.org/WAI/standards-guidelines/act/report/earl
- EARL 1.0 Schema: https://www.w3.org/TR/EARL10-Schema/
- W3C, Selecting Web Accessibility Evaluation Tools: https://www.w3.org/WAI/test-evaluate/tools/selecting/
- W3C, Before and After Demonstration: https://www.w3.org/WAI/demos/bad/
- GOV.UK, Accessibility tool audit: https://alphagov.github.io/accessibility-tool-audit/
- axe-core, rule descriptions: https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md
- W3C, Diverse Abilities and Barriers: https://www.w3.org/WAI/people-use-web/abilities-barriers/
