# Accessibility Audit: product and build plan

Draft 2, 2026-10-12. Approved on 2026-10-13, with the answers of section 13.

This plan uses Simplified Technical English. Code, file names, and the names of WCAG criteria stay in their usual form.

## Changes from draft 1

Draft 2 applies all 47 findings of `REVIEW-1.md` and four decisions of 2026-10-12. The largest changes are these:

- Honest method counts. Three criteria are automatic, 41 are automatic with a review, and 11 need a person. See section 7.1 and Appendix A.
- A result for each criterion on each page, in each state, at each width. The process result and the site result are roll-ups. See section 7.2.
- Protected tests on production, and complete processes on staging or with permission. See sections 4.5 and 5.6.
- Page states, the sample for the template tests, and the four non-interference criteria. See sections 5.2, 5.3, and 7.5.
- The statuses "Dismissed" and "Page removed", a definition of "Resolved" for each certainty, and a baseline audit after a change of versions. See section 6.1.
- A full audit each week as the default schedule, and a cost model. See sections 5.3 and 6.2.
- The AI answers first. A person confirms the answers with low confidence and a random sample of the other answers. See section 7.3.
- More fields in the issue file and the question file, and commands for the person. See section 8.

On 2026-10-13, you approved draft 2 and answered the open questions. Section 13 records the answers. Sections 1, 2, 5.1, 7.4, 10, 11, and 13 changed with them.

On 2026-10-26, `FORMS.md` added the dry submit: the engine submits forms on production with a guard that keeps the data in the browser. Sections 4.5, 5.2, and 12 changed with it.

## 1. Summary

**One-liner.**

Find what blocks people with disabilities on your website, where each problem comes from, and how to fix it.

**What the product is.**

The Accessibility Audit is an independent tool. Its command is `a11y`. It examines a full website in a real browser, when you ask for it. It lists each accessibility issue that it can detect. For each issue, it gives the location, the origin, and a recommended solution. A developer or a different AI agent uses this list to make the fixes.

**What the product is not.**

- It does not fix issues. It does not change the site, the code, or the content.
- It is not a part of Refact OS, and it has no dependency on Refact OS.
- It does not give a statement of conformance. Only a person can give the result "Passed".
- Version 1 is not a hosted service, and it has no database server.

**The form of the product.**

The product is one command-line program (the engine) and one skill for an AI agent that writes code. The two parts write their results as files into one folder.

**Decisions that you made.**

- The product is independent of Refact OS.
- The auditor finds, locates, and recommends. It does not fix.
- The scope is the whole website, not one page.
- The audit is automatic and recurrent. The default is one full audit each week.
- The scope is all 55 criteria of WCAG 2.2 at levels A and AA.
- A criterion that needs a person must not get the result "Passed" from an automatic test.
- A developer and a different AI agent must be able to use the results.
- On production, the engine presses keys and controls in a protected mode. It does not type text, and it does not submit forms there.
- The AI answers the review questions first. A person confirms the answers with low confidence and a random sample of the other answers.
- The product has two layers, an engine and a skill. The results are files in the project. Version 1 has no check of pull requests and no hosted service. Claude Code is the first agent. The build order is the order of section 11.
- The name of the product is "Accessibility Audit". The command is `a11y`, and the skill command is `/a11y`.
- The product is private to the company for now.
- Version 1 reports WCAG 2.2 AA only. A report for WCAG 2.1 AA stays after version 1.
- You do the person checks, each week or each month.
- The pilot sites are refact.co, a headless WordPress site, and a large WordPress news site of a client.

Section 13 records the answers to the open questions.

## 2. Scope

**In the scope of version 1**

- WordPress sites, headless sites, and each site that a browser can open.
- All pages of a site, at each width in the settings, and the states of a page. Section 5.2 defines a state.
- Complete processes, for example a checkout or a registration. They run on staging, or on production with permission. Section 5.6 defines a process.
- Pages behind a login, if you give the auditor a test account.
- All four principles and all 55 criteria of WCAG 2.2 at levels A and AA.
- Problems from each origin: code, design, content, media, configuration, and third parties.
- A recommended solution for each issue.
- A recurrent audit that shows which issues are new, open, and resolved.

**Not in the scope of version 1**

- Fixes of each type.
- A check of pull requests.
- A hosted service, a dashboard, and a database server.
- Level AAA.
- A report for WCAG 2.1 AA.
- Native mobile applications.
- A test of the content of PDF files and other documents. The report lists each document as a page with the result "Not tested".

## 3. The problem model

Each issue has three properties: the people that it blocks, its type, and its origin. The data of the auditor records all three.

### 3.1 The people

W3C names five groups. This plan shows a sixth group separately, because WCAG has criteria for it. A person can be in more than one group.

| Group | Typical barriers on a website |
|---|---|
| Visual | Images with no text alternative, controls with no name, low contrast, information by color only, a layout that breaks at zoom |
| Auditory | Video with no captions, audio with no transcript, a signal that is only a sound |
| Physical | Controls that need a mouse, small targets, drag actions, keyboard traps, focus that you cannot see, time limits |
| Speech | A service that needs voice, a phone number as the only contact method |
| Cognitive and learning | Complex text, navigation that changes between pages, unclear error messages, cognitive function tests at login, content that moves |
| Seizure and balance disorders | Flashes, animation, parallax |

Automatic tests do not help all groups equally. Thus the report must show the coverage for each group.

### 3.2 The type

The type of an issue is a principle and a criterion.

| Principle | Criteria at levels A and AA |
|---|---|
| Perceivable | 20 |
| Operable | 20 |
| Understandable | 13 |
| Robust | 2 |
| Total | 55 |

### 3.3 The origin

Not all problems come from the source code. The origin tells who can correct the problem and where.

| Origin | Examples | Where the fix is |
|---|---|---|
| Code | A button with no name, a menu that the keyboard cannot open | Repository |
| Design | Brand colors with low contrast, small targets, no focus style | A design decision first, then code |
| Content | Alt text, heading order in an article, link text such as "click here" | CMS database |
| Media and documents | Video with no captions, PDF with no tags | A new media file or document |
| Configuration | Menus, global styles, form labels in a plugin | CMS database |
| Third party, controlled | A plugin, a chosen video player, a map, a chat widget, a cookie banner | The configuration, an update, or a replacement of the part |
| Third party, uncontrolled | Advertisements, user comments, embedded content that the site does not select | No fix on the site. A person can list the part in a statement of partial conformance |

WCAG permits a statement of partial conformance only for uncontrolled content. Thus the report lists the uncontrolled parts of each page.

Four criteria apply to all content on a page, also to content of a third party. They are 1.4.2, 2.1.2, 2.2.2, and 2.3.1. Section 7.5 gives the rule.

WordPress adds one risk. Its Site Editor can save templates and styles in the database. Then the live page does not agree with the theme files in the repository.

## 4. The product

### 4.1 The parts

| Part | What it is | What it does | AI |
|---|---|---|---|
| Engine | A command-line program, installed as a Node package | Finds all pages and states. Tests each page in a real browser. Puts the results into issues. Compares them with the last audit. Writes a general solution for each issue | No |
| Skill | Instructions for an AI agent such as Claude Code, delivered as a plugin | Starts the engine in a project. Finds the origin and the source file of each new issue. Writes a specific solution. Answers the review questions. Records the answers of a person | Yes |
| Results folder | Files in the project that you audit | Holds the settings, the issues, the review questions, the page results, the report, and the history | No |

The reasons for two layers are these:

- A test must give the same result each time, on thousands of pages, at a low cost. Only a program can do that.
- A search in source code and a solution for that code need judgment. An AI agent does that well.
- The engine operates with no agent. Then you get the full list of issues with a general solution, but no source file.

### 4.2 The modules of the engine

| Module | Function |
|---|---|
| Crawler | Finds each page, puts the pages into groups by template, and selects the sample for the template tests |
| Tester | Opens each page in a browser, finds its states, and does the tests |
| Grouper | Puts all occurrences with one cause into one issue. Gives each issue a fingerprint |
| Comparer | Compares the new issues with the stored issues, finds replaced issues, and sets each status |
| Locator | Finds the origin of an issue with no AI. It compares the element with the content from the CMS API |
| Solution writer | Adds the general solution of the rule, with the measured values of the issue |
| Reporter | Writes the issue files, the page results, the summary, the history, and the report |

### 4.3 The steps of the skill

The skill runs all steps in one session, as the cycle, with no person. The engine lists the work of each step in batch files, and the skill starts one agent for each batch. A person's decisions, when there are any, win over the AI.

1. Read the settings. At the first audit, ask the setup questions and save the answers.
2. Start the engine.
3. Record the commit of the source code that the skill uses.
4. Answer each new review question, with evidence, facts, and a confidence. Stop at the limit in the settings.
5. Verify each answer with a second agent that never sees the first answer. Two equal answers decide. A disagreement stays unresolved, and the report counts it.
6. For each new issue, find the origin. Work in the order of reach and severity, up to the limit in the settings.
7. For each new code issue, find the source file and write a specific solution.
8. For each new content issue, find the CMS item and write a draft of the new content.
9. Refresh the results, write the handoff for the fixing agent, and show the summary of changes.

### 4.4 The technology

- TypeScript on Node.
- Playwright with Chromium as the browser.
- axe-core as the first rule engine. Research question 2 decides if a second engine is necessary.
- JSON files for data and Markdown for the report.

Playwright has no zoom function. The engine emulates 200% zoom with half the viewport width and a device scale factor of 2.

### 4.5 The design rules

1. **Scripts first.** A script does each test that a script can do. Thus the results are the same at each audit.
2. **AI one time for each item.** The AI works on each unique issue and each unique content item. It does not work on each page.
3. **No changes to the site.** The engine only reads the site. The skill writes only into the results folder.
4. **No false "Passed".** A rule can give the outcome "passed" for one element. A criterion gets the result "Passed" only from a person.
5. **Page content is data.** Text from a page is not an instruction for an agent.
6. **Protected on production.** On production, the engine operates a page only in the protected mode. The next paragraph defines the mode.
7. **Files, not services.** Each part reads and writes plain files.
8. **Each result has a scope.** A result belongs to a criterion on one page, in one state, at one width. The site result is a roll-up.

The protected mode has these rules:

- The engine can navigate, press keys, hover, focus, press Esc, and open menus, dialogs, tabs, and accordions.
- The engine can change the value of a select, a checkbox, or a radio button.
- The engine does not type text, submit a form, or drag. The exception is the dry submit of `FORMS.md`: the engine types a test value and submits a form, but a guard blocks each request that can carry the data.
- The engine does not operate a control whose name is on the deny-list in the settings. Examples: "delete", "pay", "send", and "log out".
- During each interaction, the browser blocks each network request that is not GET. It also blocks each navigation that the interaction starts. The engine records the blocked request or navigation as a fact.
- A complete process runs only on staging or local, or on production with permission in the settings and a test account.

## 5. One audit, step by step

### 5.1 How you start

1. Install the plugin one time. The engine and its browser install at the first audit.
2. Open the project in the AI agent. If you have no source code, open an empty folder.
3. Type the command with the address of the site, for example `/a11y https://www.example.com`.
4. At the first audit, answer the setup questions.
5. Read the results in the results folder.

You can also start the engine with no agent: `a11y audit https://www.example.com`. The Node package is `@refact/a11y`, because the public name `a11y` on npm is taken. The package is private. Section 7.4 gives the commands for a person.

### 5.2 How the engine finds pages and states

The crawler uses all these sources: the sitemap, the links on each page, the CMS API, and a list in the settings. The skill can add the routes from the source code.

- The crawler obeys a rate limit, stays on the permitted domains, and reads robots.txt. It records what it skipped.
- The crawler removes copies of the same page. It uses the canonical link and a rule for parameters in the settings.
- For address groups with no end, for example a calendar, facets, or search results, the settings give a limit. The report shows what the crawler did not test.
- A route with a hash in a single-page application is a page.
- Each language of the site is a page. The settings list the languages.
- The error page is a page.
- The settings give the selector of the cookie banner. The tester opens each page with the banner open, then with the banner closed.
- For pages behind a login, the settings give the method: a login form or a Playwright storage state file. Two-factor login needs a storage state file. The engine detects the end of the session and logs in again. The settings can give one account for each role.
- The crawler puts the pages into groups by template. It uses the address pattern, the CMS type, and the structure of the page. The settings pin the example page of each template. At the first audit, the engine proposes one.

**The sample for the template tests**

The template tests run on a sample. The sample has the five parts of WCAG-EM and a random part.

- The common pages: home, login, sitemap, contact, help, legal pages, search, the error page, and the accessibility statement. Also one page for each service of the site, and one document, for example a PDF. This is the list of WCAG-EM and of the EU monitoring decision 2018/1524, added on 2026-10-13.
- The pages of each complete process.
- One example page of each template.
- Each page with a unique technology or component. Examples: video, audio, an iframe, a canvas, a map, a widget with the role slider or application, and a link to a document.
- Other pages that the settings list.
- A random 10% of all pages. When a random page gives results that differ from its template, the engine splits the template and reports it.

**The states of a page**

A state is a list of actions from the first load of a page, for example "click the menu button". The engine finds states from menus, dialogs, tabs, accordions, and the cookie banner. It uses the ARIA attributes, the details element, and the roles. The settings give the maximum of states for each page. The default is 10. A form error state needs a submission. The dry submit of `FORMS.md` makes it on each environment, with a guard that keeps the data in the browser. The errors of the server and the success message need a process, where section 4.5 permits.

The fingerprint, the page result, and the issue file include the state.

### 5.3 Which tests run where

| Test group | Where it runs | Tests |
|---|---|---|
| Page tests | Each page. First with the cookie banner open, then with the banner closed | With the banner open: the non-interference tests. With the banner closed: the rule engine at each width, reflow, zoom at 200%, text spacing, target size, language, and page title |
| Template tests | The sample of section 5.2, at each width | Keyboard, focus, content on hover and focus, states, event listeners, form tests where permitted, screenshots for the AI review |
| Site tests | All pages together, for each set of pages | Consistent navigation, consistent names, consistent help, multiple ways, pages with the same title |
| Process tests | Each process in the settings, where permitted | The page tests and the template tests on each page and each state of the process |

The default widths are 390, 768, and 1280 px. The settings can change them. The reflow test runs at 320 CSS px of width and at 256 CSS px of height. The zoom test is one render.

A set of pages is a group with one purpose and one author, for example the shop or the blog. The settings can define sets. The default is one set for the whole site.

**The non-interference tests**

The four non-interference tests run on each page and each state, with the banner open. They are the tests of 1.4.2, 2.1.2, 2.2.2, and 2.3.1. The tests find audio that starts automatically, a keyboard trap in a Tab pass, content that moves or updates, and candidates for a flash measurement.

**The listener test**

On the template sample, a script that runs before the page records the event listeners of the page. The engine finds listeners for device motion, drag and pointer handlers, single character keys, and timers that redirect. These are candidates for 2.5.4, 2.5.7, 2.1.4, and 2.2.1.

**Unstable results**

A live page can change between two loads, for example with advertisements, A/B tests, or personalization. The zoom, text spacing, contrast on images, focus, and hover tests are heuristics. A new issue from these tests needs the same result in two renders. The pilot sites measure the flake rate.

**The cost model**

Each page needs 7 to 10 renders: the banner state, the rule engine at three widths, reflow, zoom, text spacing, and the states. A site with 5,000 pages needs about 40,000 renders. At 3 to 5 seconds for each render, that is 4 to 7 hours with eight browsers. These numbers are estimates. Research question 9 measures them.

Thus the default rhythm is one full audit each week, started by a person at this stage. The settings give the concurrency, the time budget, the maximum of pages, and the maximum of states for each page. When the audit reaches a budget, the report lists the pages that it did not test.

### 5.4 How results become issues

Each test gives an outcome for each element, as the ACT Rules Format does. The outcomes are passed, failed, inapplicable, and cantTell. A failed outcome becomes an occurrence. A cantTell outcome becomes a review question.

The engine records the mode of each outcome, which is automatic, semi-automatic, or manual. It also records who gave it, which is a rule, the AI, or a person.

An occurrence is one place where a problem shows. An issue is one problem with one cause.

- A code problem in a shared component is one issue, with a count of its pages.
- A content problem is one issue for each content item, for example one image in one post.
- Each issue has a fingerprint. The engine calculates it from the rule, the element, the template or content item, and the state.
- The fingerprint does not use the position on the page, the width, or the date. One element with one problem at three widths is one issue. Thus the same problem gets the same ID at each audit.
- For a content item, the fingerprint uses the attachment ID or a hash of the source, not the position of the item.

Each issue has a certainty:

- "fail": a rule or a person found the failure.
- "ai fail": the AI answered that the item fails, and no person confirmed it.
- "needs review": a possible problem with no answer.

When an issue disappears, the comparer looks for a new issue with the same rule, template, page, and position in the structure. When it finds one, it links the two with "replaced", and the new issue keeps the first-seen date.

### 5.5 Origin, location, and solution

- The engine gives each issue the page location: the address, the width, the state, the selector, the HTML, and a screenshot.
- The engine adds the general solution of the rule, with the measured values. Example: "The contrast is 3.1:1. The minimum is 4.5:1."
- The locator finds some origins with no AI. It compares the element with the content from the CMS API.
- The skill finds the remaining origins and the source file. It records its confidence and its method.
- The skill records the commit that it used. If the live site gives a build ID, the engine records it too. The issue shows a warning when the two do not agree.
- The skill writes a specific solution: the steps, an example, and the expected result.

The solution agrees with the origin.

| Origin | Content of the solution |
|---|---|
| Code | The code change, with an example |
| Design | Values that pass the test |
| Content | The change in the CMS, with a draft of the text and the edit link |
| Media and documents | The file that someone must make |
| Configuration | The setting to change, and where it is |
| Third party, controlled | The options: update, replace, configure, or tell the vendor |
| Third party, uncontrolled | The part to list in a statement of partial conformance, and the option to remove it |

### 5.6 Complete processes

A complete process is a sequence of pages and states that a user must complete for one task. Examples: a purchase, a registration, a login, and a search. WCAG 2.2 says that all pages of a process must conform.

The settings list each process with a name, its steps, the environment where it can run, and the test account. A step is a page and an action. The engine runs the steps in a browser. It does the page tests and the template tests on each page and each state of the process. It gives a result for each process. The report lists each process that the audit did not test, with the reason.

## 6. The recurrent audit

The loop has three steps. The auditor does steps 1 and 3.

1. The auditor does an audit and writes the list.
2. A developer or a different agent reads the list and makes fixes.
3. The auditor does the next audit and compares the two lists.

The auditor does not wait between audits. Each audit is a separate run. The issue files connect the runs.

### 6.1 The status of an issue

| At the new audit | Status |
|---|---|
| The issue is in the stored list and in the new results | Open |
| The issue is only in the new results | New |
| The issue is only in the stored list, and the audit tested all its pages | Resolved |
| The issue is only in the stored list, and the audit did not test all its pages | Not checked |
| A resolved issue is in the new results again | Reopened |
| All pages of the issue give 404 or 410, or are absent from three audits | Page removed |
| A person marked the issue as a known risk | Accepted |
| A person marked the issue as not a real problem | Dismissed |

"Resolved" depends on the certainty of the issue:

- An issue with the certainty "fail" from a rule: the same test passed on all pages that had the issue.
- An issue with the certainty "ai fail": the item changed, and the new answer found no problem.
- An issue from a person check, or with the certainty "needs review": a person recorded a new answer, with the name and the date.

The issue file records which check gave the status, and its mode. The rules below complete the table.

- A fix that removes an issue from some pages does not resolve it. The issue stays "Open", and the report shows the change of the reach.
- A short check resolves an issue only when it tested all pages of the issue.
- "Not checked" means that the audit did not test the pages of the issue. The causes: a short check, a disabled test, a page limit, a removed permission, or a page that did not load.
- The settings pin the example page of each template. An issue from a template test resolves at the level of the template.
- An accepted issue is still a failure. The result of its criterion stays "Failed", and the report shows the count of accepted issues. An accepted issue that disappears becomes "Resolved". An accepted issue that changes needs a new decision.
- A dismissed issue has a reason, an optional note, a name, and a date. The engine keeps its fingerprint and does not report it again until the element changes. It does not count in the result of its criterion. It counts in the false issue rate. The report lists the dismissed issues separately.
- A replaced issue keeps its link to the old issue. The report does not count the pair as one resolved issue and one new issue.

**Versions and baseline audits**

Each run and each issue records the version of the engine and the version of each rule engine. The versions are pinned. When a version changes, the audit is a baseline audit. An issue that disappears in a baseline audit becomes "Resolved" with the reason "rule changed". The report counts these issues separately, not as fixes.

### 6.2 What starts an audit

- **A person.** You ask a session for the cycle, or you type the command.
- **A short check.** After a fix, you can test only the pages with open issues.

A scheduled job was built and proved on 2026-10-15: three runs on a Mac, with no help. On 2026-10-16 the user removed it, because it is not needed at this stage. It can come back later, as a job on a Mac or in GitHub Actions.

In a recurrent audit, the skill works only on new issues. Old issues keep their origin, their location, and their solution.

### 6.3 What each audit reports

- The summary of changes: the counts of new, open, resolved, reopened, not checked, and dismissed issues. The resolved count excludes the issues with the reason "rule changed".
- The coverage: the pages found, tested, and not tested, the states, the processes, and the tests that did not run.
- The result of each of the 55 criteria for the site and for each process, with the coverage of each result.
- The result of each criterion on each page, in the page results file.
- The count of answers that only the AI gave, for each criterion.
- The baseline flag, when the versions changed.
- The accessibility overview, for level A and for level AA. The share of the tested units with no failure, with the failed and the unknown units apart. The criteria met, failed, unknown, with no content, and not tested. The pages with no failure. The open issues by severity. A history line for each run, in the summary, the report, and the review page. It is a tool measure, not a conformance claim: WCAG has no score, and an unknown unit is not a pass. The score is the level AA share, shown with its definition.

## 7. WCAG coverage

The report lists all 55 criteria at each audit. Appendix A gives the method and the test of each criterion.

### 7.1 The three methods

| Method | Meaning | Criteria |
|---|---|---|
| Auto | A script decides each case that the test covers. The result is the same at each audit. Appendix A gives the conditions | 3 |
| Auto + review | A script decides the usual cases and flags the others. The AI review, then a person, decides the flagged cases | 41 |
| Person | No reliable automatic test is available. The auditor finds the candidates and writes the steps of the check | 11 |

The three "Auto" criteria are 2.4.7, 2.4.11, and 3.2.1. These numbers are an assessment against the WCAG 2.2 sources. Research question 1 must confirm each row with tests.

### 7.2 The result of a criterion

The results have three levels. A rule gives an outcome for one element. The outcomes give a result for one unit, which is a criterion on one page, in one state, at one width. The unit results give a roll-up for each process and for the site.

A rule outcome "passed" does not satisfy a criterion. It only means that this rule found no failure. The ACT rules say so.

| Result of a unit | When the auditor gives it |
|---|---|
| Failed | One or more issues have the certainty "fail" or "ai fail", and the status New, Open, Reopened, or Accepted |
| Needs review | No issue is "Failed". One or more review questions have no answer, or one or more issues have the certainty "needs review" |
| Needs a person | The method is "Person", and no person recorded a result. The report gives the candidates and the steps of the check |
| No issue found | All tests of the criterion ran on this unit and found nothing, and the review is complete |
| No content found | The finder of the engine found no content of this type. This is not "Not applicable" |
| Not tested | The test did not run on this unit, or it is not built |
| Passed | A person gave it for this unit, with the name and the date |
| Not applicable | A person gave it for this unit, with the name and the date |

The report shows the count of AI-only answers next to each "No issue found". For a "Person" criterion with no candidates, the result stays "Needs a person", and the report says that the finder found nothing.

**The roll-up**

The result of a process, and of the site, comes from its units in this order: Failed, Needs review, Needs a person, No issue found, No content found, Not tested, Passed, Not applicable. The first result in this order that one unit has is the result of the whole. The result is "Not tested" only when the test ran on no unit. Each result comes with its coverage: the count of tested units out of all units.

"All units" depends on the test group. For a page test, it is each page at each width. For a template test, it is the sample of section 5.2. For a site test, it is each set of pages. The report names the definition that applies to each criterion.

**The scope of "Passed" and "Not applicable"**

A person gives "Passed" and "Not applicable" for a scope: a list of pages or templates, with their states. The result of a page is void when the page changes. The result of the site is void when a new page or a new state appears in the scope. Then the unit goes back to the result that the tests give.

### 7.3 Review questions

A review question is a narrow question about one item, for example "Does the text alternative describe the image?".

- Each question has the same two answers for the AI and for the person: "This is an issue" or "This is not an issue", with a reason. The AI can also answer "unsure", which sends the question to a person. A person can also answer "not applicable". Added on 2026-10-13, from research question 3.
- The AI answers first. It attaches its evidence, the facts it relied on, a confidence, the model name, the date, and the version of the prompt.
- A second, independent AI pass verifies each answer. The verifier does not see the first answer. Two equal answers decide the question. A disagreement, or an unsure answer, leaves the question unresolved, and the report counts the unresolved questions. No person is needed. Changed on 2026-10-14: the product runs with no person in the loop. The random sample for a person stays as an option in the settings, with the share 0 by default when the verifier runs.
- The audit measures the AI answer accuracy on the seeded faults, where the answer is known: a fault gives "issue", and the correct site gives "no issue". The engine's measurements, for example the contrast from the pixels, decide where they can, so that the AI answers fewer questions.
- An answer belongs to the fingerprint of a component or a content item. Thus one answer applies to all pages with that item.
- For 1.1.1, 2.4.2, 2.4.4, and 2.4.6, the correct answer depends on the context. For these criteria, the fingerprint of the question includes the context.
- An answer stays valid until the item changes. The engine keeps the answers by content hash.
- The settings give a maximum of questions for each audit. The questions with the largest reach come first.
- The skill can also answer some questions from the source code, for example a question about a session time limit.

A wrong "no problem" from the AI is the main path to a missed issue. Thus the report shows how many answers only the AI gave.

Established tools use the same classes of checks. Research question 3 confirmed this on 2026-10-13 from the official documentation. Siteimprove reviews each potential issue with a guided flow of questions for each occurrence, and the user can reuse an answer for identical occurrences. Accessibility Insights marks each instance as Pass or Fail.

### 7.4 What stays with a person

The 11 "Person" criteria need these checks:

- 1.2.1 to 1.2.5: make sure that transcripts, captions, and audio descriptions are there and are correct.
- 2.2.1: test the time limits of sessions.
- 2.3.1: measure the flash rate of animation and video with a special tool.
- 2.5.1, 2.5.4, and 2.5.7: make sure that an alternative with one pointer, with no motion, and with no drag is there.
- 3.3.4 and 3.3.7: test the forms for legal, financial, and user data, and the processes with more than one step.

A person also does these tasks:

- A test of the primary tasks with a screen reader, one time for each template.
- The confirmation of AI answers with low confidence, and of the random sample.
- The decisions "Passed", "Not applicable", "Accepted", and "Dismissed".

Changed on 2026-10-14: the product needs no person for these checks. The engine and the AI do them where they can, with evidence.

- The engine detects time limits, autoplay, and drag operations, and tries the same function with the keyboard.
- The AI checks that transcripts and captions exist, and reads them.
- The AI inspects a process for a review step.

What neither can decide is "unresolved" in the report, with the evidence. A person can still answer, on the review page or with the commands below, and a person's answer wins. A formal conformance claim stays a decision of the company, outside the product.

A person records a decision with a command, or the skill asks and writes it. Each record has the name, the date, and a note. The commands are these:

```
a11y answer Q-19c2e4d0 no --by "Name" --note "The alt text is a file name."
a11y pass 1.4.3 --pages "template:post" --by "Name"
a11y not-applicable 1.2.4 --by "Name"
a11y accept ISS-7f3a9c21 --by "Name" --note "Fix planned for Q1."
a11y dismiss ISS-7f3a9c21 --by "Name" --note "Decorative text."
a11y check                  the short check of the pages with open issues
```

### 7.5 The non-interference criteria

WCAG 2.2 has four non-interference criteria: 1.4.2, 2.1.2, 2.2.2, and 2.3.1. They apply to all content on a page, also to content that the site does not rely on. Examples: a cookie banner, a chat widget, an advertisement, and a video player. A failure of these four can block the full page.

Their issues have the flag "non-interference" and the severity "critical". The origin does not exclude them. An accepted issue of these four stays in the main list of the report.

## 8. The results folder and the data formats

### 8.1 The folder

```
accessibility-audit/
  config.json      the settings of the audit
  summary.json     the result of each criterion for the site and each process, the counts, and the coverage
  pages.jsonl      one line for each page: its template, its states, and the result of each criterion at each width
  report.md        the full report for people
  history.jsonl    one line for each audit, with the versions and the counts
  issues/          one JSON file for each issue
  questions/       one JSON file for each review question and person check
  runs/            raw data, outcomes for each element, and screenshots of each audit, not in Git
```

The names are not final. Git keeps the history of the files.

### 8.2 The settings

The settings file holds these groups of values.

| Group | Values |
|---|---|
| Site | The address. The type of environment: production, staging, or local. The standard and the level, which is WCAG 2.2 AA. The languages. The sets of pages. The CMS type and the address of the CMS API. The source of the build ID |
| Crawl | The widths. The page limits and the pages to skip. The address groups with a limit. The rule for parameters. The rate limit and the permitted domains. The selector of the cookie banner. The example page of each template. The other pages for the sample, and the share of the random sample |
| Interaction | The deny-list of control names. The tests that can send data. The processes, with their steps and environments. The maximum of states for each page |
| Login | The method and the roles. The name of the secret, for example an environment variable or the path of a storage state file. The secret itself never goes into this file |
| Budgets | The concurrency. The time budget. The maximum of pages. The maximum of review questions for each audit. The maximum of issues for the skill |
| Baseline | The assistive technologies of the person checks. The engine records the browser, its version, and the technologies of the site in each run |
| Schedule | The interval, for the documentation. The scheduler is outside the product |

### 8.3 An issue file

```json
{
  "schema": "issue/2",
  "id": "ISS-7f3a9c21",
  "status": "open",
  "status_by": { "who": "engine", "mode": "automatic", "date": "2026-10-12", "run": "2026-10-12T02:00Z" },
  "certainty": "fail",
  "non_interference": false,
  "rule": { "id": "button-name", "engine": "axe-core", "engine_version": "4.11.0" },
  "wcag": { "criterion": "4.1.2", "level": "A", "principle": "robust" },
  "affects": ["visual", "physical"],
  "severity": "critical",
  "summary": "The menu button has no accessible name.",
  "reach": { "pages": 412, "occurrences": 824, "templates": ["post", "page", "archive"], "widths": [390, 768, 1280] },
  "first_seen": "2026-10-01",
  "last_seen": "2026-10-12",
  "environment": "production",
  "question": null,
  "replaces": null,
  "origin": "code",
  "source": [
    { "file": "src/components/Header.tsx", "line": 42, "confidence": "probable", "method": "text search", "commit": "a1b2c3d" }
  ],
  "source_warning": null,
  "examples": [
    {
      "url": "/pricing",
      "width": 390,
      "state": [],
      "selector": "header button.nav-toggle",
      "html": "<button class=\"nav-toggle\"><svg aria-hidden=\"true\"></svg></button>",
      "facts": { "role": "button", "name": "" },
      "screenshot": "runs/2026-10-12/ISS-7f3a9c21.png"
    }
  ],
  "solution": {
    "type": "specific",
    "summary": "Give the menu button an accessible name.",
    "steps": [
      "Open src/components/Header.tsx at line 42.",
      "Add aria-label=\"Menu\" to the button element."
    ],
    "example": "<button class=\"nav-toggle\" aria-label=\"Menu\">",
    "expected_result": "A screen reader says \"Menu, button\"."
  },
  "decision": null,
  "untrusted_fields": ["examples[].html", "examples[].facts"]
}
```

The field `question` points to the review question that made the issue. The field `replaces` points to the old issue when the comparer linked the two. The field `source_warning` holds a text when the commit and the build ID do not agree. The field `decision` holds the record of an accepted or dismissed issue:

```json
{
  "decision": { "status": "dismissed", "reason": "false positive", "note": "The text is decorative.", "by": "Name", "date": "2026-10-13" }
}
```

For a content issue, the source gives the CMS item and not a file:

```json
{
  "origin": "content",
  "source": [
    { "cms": "wordpress", "item": "post 812", "attachment": 3041, "block": "core/image", "edit_url": "https://example.com/wp-admin/post.php?post=812&action=edit" }
  ]
}
```

### 8.4 A review question file

```json
{
  "schema": "question/2",
  "id": "Q-19c2e4d0",
  "issue": "ISS-2b7e0d4c",
  "criterion": "1.1.1",
  "fingerprint": "content:attachment-3041:in:post-812",
  "context": "The image is in the section 'Our team'. The text before it names the person.",
  "question": "Does the text alternative describe the image?",
  "evidence": { "image": "runs/2026-10-12/Q-19c2e4d0.png", "alt": "IMG_2041" },
  "ai_answer": {
    "value": "issue",
    "confidence": "high",
    "reason": "The text is a file name.",
    "model": "claude-fable-5-1",
    "prompt_version": "1",
    "date": "2026-10-12"
  },
  "sample": true,
  "person_answer": { "value": "issue", "by": "Name", "date": "2026-10-13", "note": "Agree." },
  "pages": 1
}
```

The field `issue` points to the issue that the answer made, or it is null. The field `sample` is true when the random sample selected the question for a person. The field `person_answer` is null until a person answers.

### 8.5 The rules for the data

- **One issue, one file.** The file is small and complete. It holds a maximum of five examples and the count of all occurrences.
- **Facts, not only text.** Each issue gives the selector, the HTML, the measured values, and a screenshot.
- **Certainty.** Each issue is "fail", "ai fail", or "needs review".
- **Severity.** The levels are critical, serious, moderate, and minor. The level shows the effect on the task of the user. It does not show the count.
- **Confidence of the location.** Each source file has a confidence and the method that found it.
- **Untrusted fields.** Each file names the fields that hold page content. An agent must use those fields only as data.
- **No personal data in Git.** The engine removes email addresses, phone numbers, tokens, and form values from the HTML examples. The screenshots of pages behind a login stay in the runs folder, out of Git.
- **Versions.** Each file gives the version of its format. Each issue and each run give the versions of the engine and the rule engines.

### 8.6 The report for people

The report has these parts, in this order:

1. The summary: the date, the site, the standard, the versions, the baseline flag, and the counts.
2. The changes from the last audit, with the replaced issues and the issues with the reason "rule changed".
3. The table of the 55 criteria with their results for the site, the coverage of each result, and the count of AI-only answers.
4. The result of each process.
5. The issues, in groups by principle and criterion, with location, origin, and solution. The non-interference issues come first.
6. The list of review questions and person checks. The questions that close the most pages come first.
7. The dismissed issues and the accepted issues.
8. The coverage: the pages, the states, the processes, and the tests that did not run. The uncontrolled third-party parts of each page.

## 9. Research

Each question ends with a short report and a decision.

| No. | Question | Result that we need |
|---|---|---|
| 1 | Which method can test each of the 55 criteria? | The criteria file, confirmed by tests. The start is Appendix A: 3 Auto, 41 Auto + review, 11 Person |
| 2 | Is axe-core sufficient as the rule engine? | A decision for one engine or more. axe-core has no rule for 2.4.11, 2.5.7, 3.2.6, 3.3.7, and 3.3.8. W3C also lists Alfa, IBM Equal Access, and QualWeb |
| 3 | What can we copy from other products? | A short comparison of Siteimprove, Deque axe DevTools, Accessibility Insights, and GitHub Accessibility Scanner |
| 4 | Which fingerprint stays the same after a deploy and after a change of content? | The fingerprint method, with the second match for replaced issues |
| 5 | How accurately can we find the origin and the source file on WordPress and on React? | The method of the locator, with its accuracy |
| 6 | How accurate are AI answers to narrow review questions? | The list of question types that the AI can answer, measured on the random sample |
| 7 | Which "Person" criteria can the engine or the skill decide? | A comparison of the listener test in the browser with the search in the source code, for 2.2.1, 2.5.4, 2.5.7, and 3.3.7 |
| 8 | Which scheduler can start the engine and the skill with a browser? | The recommended setup for recurrent audits |
| 9 | How much time and money does one page use, and one issue? | The measured renders, hours, flake rate, and AI cost. Limits and defaults for the settings |

## 10. Tests of the product

- **Seeded faults.** Start with a correct site. A script adds known problems, for example it removes a label or decreases a contrast. We know the answer and the origin of each fault.
- **Rule fixtures.** Each test has pass pages and fail pages. The W3C ACT test cases give 1,213 of them. They test the rules only, not the crawler, the grouper, the fingerprints, the states, or the AI answers.
- **Public demonstration sites.** The W3C "Before and After Demonstration" has five pages in a bad and a good version. The GOV.UK "Accessibility tool audit" has 142 barriers on single pages. Both are old and cover WCAG 2.0, but they test the full path.
- **Repeat test.** Two audits of the same build must give the same issue IDs.
- **Solution test.** In our tests, we apply the recommended solution to a seeded fault. The next audit must show that the issue is resolved.
- **Pilot sites.** The headless WordPress site is https://refact.co/. The WordPress site is a large news site of a client. An expert examines a sample of the issues.
- **Implementation report.** Publish an ACT implementation report in EARL, so that W3C can list the engine.

Record these numbers at each release:

| Number | Meaning |
|---|---|
| Detection rate | The part of the seeded faults that the auditor found |
| False issue rate | The part of the issues that are not real problems, including the dismissed issues |
| Location accuracy | The part of the issues with the correct origin and source file |
| ID stability | The part of the issues that keep their ID between two audits, with replaced issues counted as stable |
| Solution success rate | The part of the solutions that resolve their issue in the solution test |
| AI answer accuracy | The part of the AI answers that agree with a person, measured on the random sample |
| Flake rate | The part of the new issues that a second render did not confirm |

## 11. Build stages

Build the full path early with a small set of tests. Then add depth. Each stage operates on the whole site. This plan gives no dates, because the size of the team is not known.

| Stage | Work | Done when |
|---|---|---|
| 1. Foundations | Write the criteria file with all 55 criteria and the WCAG version of each. Write the formats of the issue, the question, the page results, and the summary. Write the settings format. Prepare the pilot sites, find their processes and test accounts, and prepare the seeded faults. Answer research questions 1 to 3 | The criteria file and the formats are complete. The processes of the pilot sites are in their settings |
| 2. Engine | Build the crawler with the sample, the tester with the rule engine and the page tests, the grouper, the locator, the solution writer, and the reporter | One command audits each pilot site. The report lists all pages and all 55 criteria with the results that the rules of section 7.2 give |
| 3. Recurrence | Build the fingerprints, the comparer, the statuses, the short check, the versions, and the history. Set up a scheduled job | Two audits give the same IDs. One seeded fault gives one new issue. Three scheduled audits run with no help |
| 4. Skill | Build the skill: the setup questions, the origin, the source file, the specific solution, and the commit record | You know the location accuracy and the solution success rate on the seeded faults |
| 5. Depth | Add the template tests, the states, the processes, the listener test, the non-interference tests, and the site tests | The summary shows a test for each criterion that has an automatic test in Appendix A |
| 6. Review | Add the review questions, the AI answers, the random sample, the commands for a person, and the decisions | You know the AI answer accuracy. One answer closes all pages of its item |
| 7. Release | Audit real sites. Record all the numbers. Write the documentation. Package the plugin and the Node package | A person who did not build the auditor can install it and complete an audit |

After version 1, add these parts only if they are necessary:

- Audits that skip the expensive tests on unchanged pages.
- A check of pull requests.
- An export to EARL and other formats, and an MCP server.
- A central service for many sites.
- A report for WCAG 2.1 AA. WCAG 2.2 contains all its criteria except 4.1.1, so this report is a filter of the table.
- Tests in other browsers.

## 12. Risks and controls

| Risk | Control |
|---|---|
| A test changes data on a live site | The protected mode on production: blocked requests, blocked navigations, no text entry, and the deny-list. Processes run on staging or with permission |
| The dry submit sends a form on a live site | The guard of `FORMS.md` section 3.2, and a test that proves it for eleven ways to send a form |
| A page contains text that looks like an instruction for an agent | The issue files name the untrusted fields. The skill writes only into the results folder |
| Screenshots and HTML show personal data or tokens | The redaction of the HTML examples. The raw data and the screenshots behind a login stay out of Git |
| The audit puts too much load on the site | The rate limit, the concurrency, and the page limits in the settings |
| Bot protection stops the browser | A setup step for a permitted address or a test header |
| False issues decrease the trust in the report | The certainty value, the false issue rate at each release, and the status "Dismissed" |
| AI answers change between two audits | Narrow questions, recorded evidence, the model and prompt versions, and answers that stay until the item changes |
| A wrong "no problem" from the AI hides an issue | The random sample, the AI answer accuracy number, and the count of AI-only answers in the report |
| A reader understands "no issue found" as "conforms" | The result names, the coverage next to each result, and no statement of conformance in the report |
| The site changes and all IDs change | The fingerprint method, the second match, and the ID stability number |
| A fix changes the element and the audit reports a resolved and a new issue | The "replaced" link between the two issues |
| A rule update looks like a fix | The pinned versions, the baseline audit, and the reason "rule changed" |
| The source code differs from the live site | The commit and the build ID in the issue, and the warning when they differ |
| The cookie banner changes the results | The test of each page with the banner open and closed |
| A live page gives different results at each load | The second render for a new issue, and the flake rate |
| An accepted third-party issue hides a non-interference failure | The non-interference flag, and the main list of the report |
| The grouper puts two causes into one issue, or one cause into two | The random sample of the template tests, and the expert review on the pilot sites |
| A "Passed" from a person is old | The scope of the result, and the void rule when a page changes |
| A full audit of a large site uses too much time | The test groups, the budgets, and the weekly schedule |
| The AI review costs too much on the first audit | The maximum of questions for each audit, the cache by content hash, and the order by reach |
| An audit of a site with no permission | The documentation says that you audit only sites that you own or have permission to test |

## 13. Answers to the open questions

The six proposals of draft 1 are approved. Section 1 lists them as decisions. On 2026-10-13, you answered the open questions of draft 2.

1. The name of the product is "Accessibility Audit". The command is `a11y`, and the skill command is `/a11y`. The Node package is `@refact/a11y`.
2. The pilot sites are https://refact.co/, a headless WordPress site, and a large WordPress news site of a client.
3. The product is private to the company for now.
4. You do the person checks, each week or each month.
5. A report for WCAG 2.1 AA is not necessary in version 1. You decided this on 2026-10-13. Version 1 reports WCAG 2.2 AA only.
6. The processes and the test accounts of the pilot sites are not known. Stage 1 finds them. The engine proposes the candidates, for example the forms, the login pages, and the search, and you confirm them.

## Appendix A: the 55 criteria

The method of each row is an assessment against the WCAG 2.2 text, the Understanding documents, the ACT rules, and the axe-core rules. "None" in the last column means that only unusual cases need a person. "Auto + review" means: a script decides the usual cases, and a review decides the flagged cases.

### Perceivable

| Criterion | Level | Method | Automatic test | Review or person check |
|---|---|---|---|---|
| 1.1.1 Non-text Content | A | Auto + review | Finds images, icons, and image buttons with no text alternative | AI compares each text alternative with its image, in its context. A person confirms the sample |
| 1.2.1 Audio-only and Video-only (Prerecorded) | A | Person | Finds each audio file, video file, and embedded player | Make sure that a transcript or an equal alternative is there |
| 1.2.2 Captions (Prerecorded) | A | Person | Finds each video with synchronized audio. A caption track is a hint only, because captions can also be in the video file | Make sure that captions are there and are correct |
| 1.2.3 Audio Description or Media Alternative (Prerecorded) | A | Person | Finds each video. A description track is a hint only, because the audio itself can give the visual information | Make sure that an audio description or a text alternative is there |
| 1.2.4 Captions (Live) | AA | Person | Finds live video players | Make sure that live captions are there |
| 1.2.5 Audio Description (Prerecorded) | AA | Person | Finds each video. A description track is a hint only | Make sure that an audio description is there |
| 1.3.1 Info and Relationships | A | Auto + review | Tests labels, table headers, lists, and groups in the code. The landmark and heading-order rules are best practice. They give notes, not issues of 1.3.1 | AI finds text that looks like a heading, a list, or a table but has no such code |
| 1.3.2 Meaningful Sequence | A | Auto + review | Compares the order in the code with the order on the screen | AI reads the content in code order and examines the sense |
| 1.3.3 Sensory Characteristics | A | Auto + review | Finds instructions with words for shape, color, size, position, or sound | AI and a person examine each instruction |
| 1.3.4 Orientation | AA | Auto + review | Loads each page in portrait and in landscape. Finds CSS that rotates or hides content on the orientation media feature | A person decides if a lock is essential |
| 1.3.5 Identify Input Purpose | AA | Auto + review | Tests the autocomplete value of each field that has one. Flags fields for personal data with no value | AI decides if a flagged field collects data about the user. A person confirms the sample |
| 1.4.1 Use of Color | A | Auto + review | Finds links in text that only color shows | AI examines screenshots for states, errors, and charts that only color shows |
| 1.4.2 Audio Control | A | Auto + review | Finds audio that starts automatically and plays for more than 3 seconds. Looks for a control that can pause, stop, or change the volume | A person confirms the control, and examines embedded players |
| 1.4.3 Contrast (Minimum) | AA | Auto + review | Calculates the contrast of all text from the code and the styles, including placeholder text and text on hover and focus. The limits are 4.5:1, and 3:1 for large text, which is 18 point or 14 point bold. Flags text on an image or a gradient | AI and a person decide the exceptions: inactive controls, decoration, invisible text, text in a picture with other significant content, and logotypes |
| 1.4.4 Resize Text | AA | Auto + review | Emulates 200% zoom. Finds a block of zoom, which is an automatic failure. Flags text that is cut or hidden | A person confirms that the cut content is not available on focus or after activation. Captions and images of text are exceptions |
| 1.4.5 Images of Text | AA | Auto + review | AI with vision finds images that contain text. Finds an image of text next to the same text, which passes | A person decides the definition and the exceptions: a picture with other significant content, "customizable", and "essential", for example a logo |
| 1.4.10 Reflow | AA | Auto + review | Sets the width to 320 CSS px for vertical content, and the height to 256 CSS px for horizontal content. Finds a scroll in two directions and cut content | A person decides the exceptions for each part with two dimensions: maps, diagrams, video, data tables, and toolbars |
| 1.4.11 Non-text Contrast | AA | Auto + review | Calculates the contrast of control borders and focus rings | AI and a person examine icons and charts |
| 1.4.12 Text Spacing | AA | Auto + review | Applies the WCAG spacing values. Flags text that is cut or that overlaps | A person confirms that the content is not available, for example after an ellipsis. Images of text and canvas are out of the scope |
| 1.4.13 Content on Hover or Focus | AA | Auto + review | Moves the pointer and the focus to each control. Tests the new content with Esc and with the pointer | A person confirms the results |

### Operable

| Criterion | Level | Method | Automatic test | Review or person check |
|---|---|---|---|---|
| 2.1.1 Keyboard | A | Auto + review | Finds controls that the keyboard cannot get to or operate | A person tests complex controls, for example a map or an editor |
| 2.1.2 No Keyboard Trap | A | Auto + review | Moves through all controls with Tab and Shift+Tab. Flags a trap | A person confirms that the page does not tell the user how to leave. A dialog that the user knows how to leave passes |
| 2.1.4 Character Key Shortcuts | A | Auto + review | Presses each character key in the protected mode. Finds shortcuts, and the listeners for single keys | A person makes sure that you can stop or change a shortcut |
| 2.2.1 Timing Adjustable | A | Auto + review | Fails a meta refresh with a delay between 1 and 72,000 seconds. Finds timers that redirect | A person tests the time limits of sessions |
| 2.2.2 Pause, Stop, Hide | A | Auto + review | Flags content that moves, blinks, or scrolls for more than 5 seconds. Flags all content that updates automatically, with no time limit | A person makes sure that a control can pause, stop, or hide it, or that it is essential |
| 2.3.1 Three Flashes or Below Threshold | A | Person | Finds animation and video | A person or a special tool measures the flash rate |
| 2.4.1 Bypass Blocks | A | Auto + review | Finds the skip link and the landmarks | A person confirms which blocks repeat on many pages, and that a way to bypass them is there |
| 2.4.2 Page Titled | A | Auto + review | Finds pages with no title and pages with the same title | AI examines if the title describes the page |
| 2.4.3 Focus Order | A | Auto + review | Compares the focus order with the visual order. Tests the focus in dialogs | A person confirms that the order keeps the meaning |
| 2.4.4 Link Purpose (In Context) | A | Auto + review | Finds links with no name, and links with general text such as "read more" | AI examines each link text in its context |
| 2.4.5 Multiple Ways | AA | Auto + review | Looks for navigation, search, and a sitemap. Finds pages that no link points to | A person confirms |
| 2.4.6 Headings and Labels | AA | Auto + review | Collects each heading and label with its content. Reports empty headings and labels under 1.3.1, 3.3.2, or 4.1.2, because 2.4.6 does not require headings | AI examines if each heading and label describes its content |
| 2.4.7 Focus Visible | AA | Auto | Sends real Tab events, scrolls each control into view, and compares a screenshot of the full viewport with focus and with no focus. Ignores animation | None. The research confirms the test on the ACT cases |
| 2.4.11 Focus Not Obscured (Minimum) | AA | Auto | Tests if a fixed header, banner, or widget hides the control that has focus completely, in the initial positions | None. Content that the user opened and can close does not count |
| 2.5.1 Pointer Gestures | A | Person | Finds sliders, carousels, and maps that use gestures | A person makes sure that one pointer can do the function |
| 2.5.2 Pointer Cancellation | A | Auto + review | Finds controls that act when the pointer goes down | A person confirms one of four options: no down-event, abort or undo, up reversal, or essential |
| 2.5.3 Label in Name | A | Auto + review | Compares the visible label with the accessible name of widgets with aria-label or aria-labelledby | AI examines labels in images of text. A symbol is not a label |
| 2.5.4 Motion Actuation | A | Person | Finds listeners for device motion in the browser, and in the source code | A person tests the alternative control |
| 2.5.7 Dragging Movements | AA | Person | Finds elements that you can drag, from the drag and pointer listeners | A person makes sure that a function with no drag is there |
| 2.5.8 Target Size (Minimum) | AA | Auto + review | Measures the size of each target and the space around it. A slider is one target. Overlapped areas do not count | A person decides the exceptions "equivalent" and "essential" |

### Understandable

| Criterion | Level | Method | Automatic test | Review or person check |
|---|---|---|---|---|
| 3.1.1 Language of Page | A | Auto + review | Tests that the language attribute is there and is valid. Compares it with the language that the page uses most | A person confirms a mismatch on a short or mixed page |
| 3.1.2 Language of Parts | AA | Auto + review | Finds text in a different language with no language attribute | AI and a person confirm short text |
| 3.2.1 On Focus | A | Auto | Moves the focus to each control in the protected mode. Fails a change of page, window, or focus. Flags content that changes the meaning | None for the automatic failure. A review decides the flagged content changes |
| 3.2.2 On Input | A | Auto + review | Changes the value of each select, checkbox, and radio button. Types in fields where permitted. Finds a change of page or window | A person makes sure that the page gave a warning |
| 3.2.3 Consistent Navigation | AA | Auto + review | Compares the relative order of the navigation on all pages of a set. Permits insertions and removals | A person confirms the differences |
| 3.2.4 Consistent Identification | AA | Auto + review | Finds controls with the same function but different names | AI and a person confirm |
| 3.2.6 Consistent Help | A | Auto + review | Finds contact links and help links. Compares their order in the code on all pages of a set, at each width | A person confirms |
| 3.3.1 Error Identification | A | Auto + review | Sends incorrect data in forms where permitted. Tests how each error shows | AI examines the error text |
| 3.3.2 Labels or Instructions | A | Auto + review | Finds fields with no visible label | AI examines if the instructions are sufficient |
| 3.3.3 Error Suggestion | AA | Auto + review | Collects the error messages from the form tests | AI examines if each message tells how to correct the error |
| 3.3.4 Error Prevention (Legal, Financial, Data) | AA | Person | Finds forms for payment, orders, and legal data, forms that change or delete data of the user, and forms with test answers | A person tests if you can check, correct, or cancel the data |
| 3.3.7 Redundant Entry | A | Person | Finds processes with more than one step | A person does the process and looks for data that you must type again |
| 3.3.8 Accessible Authentication (Minimum) | AA | Auto + review | Finds login forms. Tests paste and autocomplete in their fields, because a block fails unless an alternative exists. Finds a CAPTCHA | A person makes sure that a method with no cognitive function test is there, or one of the exceptions: alternative, mechanism, object recognition, or personal content |

### Robust

| Criterion | Level | Method | Automatic test | Review or person check |
|---|---|---|---|---|
| 4.1.2 Name, Role, Value | A | Auto + review | Tests the name, the role, and the ARIA code of each control. Operates controls in the protected mode and tests if the state changes | A person tests custom controls with a screen reader |
| 4.1.3 Status Messages | AA | Auto + review | Does actions. Finds new content that is not in a live region and does not take the focus | AI and a person confirm that the text is a status message, and the type of the live region |

## Appendix B: sources

**W3C sources for the criteria and the method**

- WCAG 2.2, W3C Recommendation of 2024-12-12: https://www.w3.org/TR/WCAG22/
- Understanding WCAG 2.2, all criteria and conformance: https://www.w3.org/WAI/WCAG22/Understanding/
- WCAG-EM 2.0, W3C Group Note of 2026-07-23: https://www.w3.org/TR/WCAG-EM/
- WCAG-EM 1.0, W3C Working Group Note of 2014-07-10: https://www.w3.org/TR/2014/NOTE-WCAG-EM-20140710/
- ACT Rules Format 1.1: https://www.w3.org/TR/act-rules-format/
- ACT rules list: https://www.w3.org/WAI/standards-guidelines/act/rules/
- ACT test cases: https://www.w3.org/WAI/content-assets/wcag-act-rules/testcases.json
- ACT implementation reports in EARL: https://www.w3.org/WAI/standards-guidelines/act/report/earl
- EARL 1.0 Schema: https://www.w3.org/TR/EARL10-Schema/
- W3C, Selecting Web Accessibility Evaluation Tools: https://www.w3.org/WAI/test-evaluate/tools/selecting/
- W3C, Before and After Demonstration: https://www.w3.org/WAI/demos/bad/
- W3C, Diverse Abilities and Barriers: https://www.w3.org/WAI/people-use-web/abilities-barriers/
- GOV.UK, Accessibility tool audit: https://alphagov.github.io/accessibility-tool-audit/
- axe-core, rule descriptions: https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md

**Other sources, not verified**

- Siteimprove help, Reviewing Potential Issues: https://help.siteimprove.com/support/solutions/articles/80000448552-accessibility-reviewing-potential-issues
- Siteimprove help, automated and manual tests: https://help.siteimprove.com/support/solutions/articles/80000448502-do-i-need-both-automated-and-manual-accessibility-testing-
- Deque, coverage report with Intelligent Guided Tests: https://www.deque.com/blog/deque-stakes-claim-as-undisputed-leader-in-automated-accessibility-testing-coverage-with-new-report/
- Microsoft, Assessment in Accessibility Insights for Web: https://accessibilityinsights.io/docs/web/getstarted/assessment/
- GitHub Accessibility Scanner: https://github.com/github/accessibility-scanner
- Study, feasibility of LLM-based automation of manual WCAG tests (2026): https://press.um.si/index.php/ump/en/catalog/book/1128/chapter/1235
- FTC order against accessiBe (April 2025): https://www.dataprivacyandsecurityinsider.com/2025/04/ftc-settles-with-accessibe-for-misleading-statements-about-wcag-compliance/
