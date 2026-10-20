# Research question 3: what to copy from other products?

Draft of 2026-10-13. Section 9 of `PLAN.md` asks what the engine must copy from other accessibility products, and what it must avoid. This document examines 17 products, two public monitoring programs, and the overlays.

All facts come from official product pages or official documentation. An agent fetched each page on 2026-10-13, and I reviewed the result. Section 5 gives the pages and their dates. When a page does not give a fact, the tables say "not found".

## 1. Short answer

Copy these nine things.

- **Three result bins, and only one of them counts**. axe Monitor separates "Issues" from "Needs Review". IBM Equal Access reports `violation`, `potentialviolation`, `recommendation` and `manual`, and only the levels in `failLevels` fail a build. The plan already has certainty fail, ai fail and needs review. Keep the needs-review count out of the pass or fail decision, as the `needsReview` flag of the axe Monitor API does.
- **Guided review questions with a non-technical answer**. Siteimprove reviews each "potential issue" with a step-by-step flow of questions per occurrence. The answer moves the item to Issues or to Resolved Issues, and the user can reuse an answer for identical occurrences. Accessibility Insights marks each instance Pass or Fail and offers "Pass unmarked instances". Write the review questions in this form, so that the AI and the person answer the same question.
- **A dismissal with a reason, a note, a user, a time and a scope**. Equalize Digital offers three reasons: "False positive", "Remediated" and "Confirmed accessible", plus an optional note, the user and the time. Siteimprove dismisses one occurrence or one CSS selector, and lists each decision on an Activity page with an undo. Silktide applies a decision to a website or a section, and lists all decisions on one screen. Add a dismissals file with these fields.
- **Dismissals that follow the code, not the page**. Pope Tech matches a dismissal to the HTML, so the result returns when the code changes. Siteimprove applies a single dismissal only to exact matches of the occurrence. IBM compares a scan to its baseline by `xpath` and `ruleId`. The fingerprint of the plan does the same job, so a change re-opens the issue.
- **A baseline in the repository**. The IBM `accessibility-checker` stores a baseline file per scan, and the next scan passes when the results match it. Evinced and BrowserStack compare two scans and report new, resolved and recurring issues. The issues file of the plan is this baseline. Each weekly run must report the three sets.
- **Issues grouped by the code pattern that causes them**. Evinced groups the same element on many pages into a "component" and ranks components by their share of critical issues. Equalize Digital groups issues by code snippet and dismisses the group once. axe Monitor defines "common components" from template URLs and can exclude them from page results. The origin field of the plan needs this grouping, so that one template fault is one issue.
- **A page sample with a structure and a random part**. WCAG-EM builds a structured sample of common pages, essential functions, page types and processes, and adds 10% random pages. The EU monitoring decision lists the pages of an in-depth test: home, login, site map, contact, help, legal information, one page per service, the accessibility statement, distinct page types, a document, and 10% random pages. GOV.UK adds a form and PDFs. Use this list to select the pages for the own tests and for the human sample.
- **A weekly schedule plus a re-check on publish**. Acquia Optimize scans weekly by default. Silktide tests the whole site every 5 days, and its WordPress plugin re-tests a page when an editor publishes it. Keep the weekly run, and plan a publish hook for the WordPress pilot.
- **A machine-readable issue with the element, the code, the rule and the review flags**. axe DevTools exports `selector`, `source`, `isManual`, `needsReview`, `tags` and `shareURL` in JSON, CSV and JUnit XML. IBM exports `ruleId`, `reasonId`, `path.dom`, `path.aria`, `snippet` and `message`. The WAVE API returns CSS selectors and contrast data at report level 4. Accessibility Insights groups its JSON report by WCAG criterion, with dates in ISO 8601. Keep all of these fields in the issues JSON.

## 2. What to avoid

- **Overlays**. accessiBe, AudioEye and UserWay inject a script that claims to repair the page for the visitor. On 2025-01-03 the FTC ordered accessiBe to pay 1 million dollars for the claim that its AI makes any website WCAG compliant. The Overlay Fact Sheet, with more than 1,000 signatories, says that full compliance is not possible with an overlay. The product reports, and it never injects.
- **A score that moves when a person dismisses an issue**. Acquia Optimize adjusts the compliance score after an ignore. Siteimprove gives points for a confirmed false positive. Lighthouse weights only automated audits, so its manual checks do not count. A score invites dismissals. Report counts per certainty level instead, with the dismissed count next to them.
- **An ignore that covers a whole rule**. Acquia Optimize ignores "the entire check", not one occurrence. The ignore of the product needs a scope: one occurrence, one fingerprint or one selector, never a rule.
- **A hosted API as the only engine**. Tenon shut down on 2023-08-07 after Level Access bought it. Microsoft deprecated its Accessibility Insights GitHub Action. The WAVE API charges credits per page. The engine runs in the repository with an open rule engine, so that no vendor can switch it off.
- **Coverage claims with no method**. Deque claims "up to 80%" of issues and "zero false positives". Evinced claims "19X more" issues. No page gives the method. The product reports only what the ACT test data in Q2 supports.
- **Documentation behind a login**. The Level Access help center and the Siteimprove API reference refused anonymous requests, and the Pope Tech help center needs a browser. Publish the formats of the product as plain files in the repository.

## 3. The products

Table 1 gives the coverage of the site and the review of issues. Table 2 gives the outputs and the business model. The two monitoring programs come after the tables. The W3C ACT results of the commercial engines are in `Q2-rule-engines.md`.

### Table 1: site coverage and review

| Product | What it is | Whole site and schedule | Manual checks and needs review | Issue lifecycle |
|---|---|---|---|---|
| Deque axe DevTools for Web | Browser extension, linter and CI tools on axe-core | No. One page, one component or one recorded user flow. axe Monitor does the site | "Intelligent Guided Tests" for tables, keyboard, modal dialogs, interactive elements, lists, images, structure and forms. Each test asks simple questions and saves progress. "Auto Replay" reruns three of them. Each issue has a needs-review flag | Save, share and send to Jira. Ignore with a reason: not found |
| Deque axe Monitor | Hosted site scanner on axe-core | Scans from start URLs, a CSV of URLs or user-flow scripts. Presets hold the axe-core version, the standard, URL scope rules and common components. Schedule page exists, not readable. Page limits: not found | "Needs Review" is a separate type that "must be verified by a person". After review it becomes an Issue or Ignored | API statuses: open, fixed, ignored. Reason: not found. Re-detection: not found |
| Microsoft Accessibility Insights for Web | Free browser extension on axe-core, MIT license | No. One page. The GitHub Action is deprecated | FastPass: automated checks, tab stops and a "Needs review" tab with "How to check" steps. Assessment: 24 tests for WCAG 2.2 AA, each requirement automated, assisted or manual, each instance Pass or Fail, "Pass unmarked instances", undo | Save and load an assessment file. No ignore |
| Siteimprove Accessibility | Hosted platform on the Alfa engine | Crawl on a schedule in Crawler Management. Support changes the frequency. Single Page Check on demand | "Potential issues" are assisted checks with a guided step-by-step flow per occurrence. Outcomes: "This is an issue" or "This is not an issue". Answers can be reused. History shows who and when | Dismiss as "can't fix" or "false positive", per occurrence or per CSS selector across the site. Activity page with who, when, reason, pages and undo. "Can't fix" keeps the score. A confirmed false positive earns points |
| Pope Tech | Hosted platform on the WAVE engine | Crawler with default crawl and scan settings per website. Scheduled scans with reports by email. Scan behind login on Business Plus | Alerts need a manual check. "Manual Scorecard" tracks manual tests. Manual test scheduling on Professional | Dismiss errors, contrast errors and alerts with notes, user and time. A dismissal matches the HTML and returns when the code changes |
| Level Access Platform, Access Continuum. Tenon retired on 2023-08-07 | Enterprise platform with scanner, browser extension and CI SDK | Monitoring with scheduled scans per digital asset, from help center snippets only. VPN pages excluded | Browser extension with "Test Accelerator" guided manual evaluations on Enterprise. Older Access Assistant has a "Manual Testing Wizard" | Not found |
| Evinced Site Scanner | Hosted crawler with own engine | Crawl mode up to 1,500 pages by default, or list mode. Seeds. Form login. On-premise through outbound HTTPS. Schedule: not found | Needs review: not found | "Compare Scans" shows new, resolved and reoccurring issues. Ignore with a reason: not found |
| Silktide | Hosted platform | Tests the whole site every 5 days by default. Custom schedule or never. Retest one page on demand | "Automated Checks" on 23 criteria, "Assisted Checks" on 25 criteria, and guided manual reviews. Claims all 86 WCAG 2.2 criteria | Decisions: ignore or approve, scope website or section, Decisions screen with undo. Reason: not found |
| Acquia Optimize, former Monsido, now Acquia Web Governance | Hosted platform | "Crawl Automatically" weekly by default, 2 to 12 weeks as add-on. "Max scanned pages" by contract. Path constraints and link exclusions. Login: form, basic auth, Office 365, custom | "Assisted checks" need human verification. "Reviewed" marks an issue that cannot or need not be repaired | "Ignore on this page" per check, and the score adjusts. "Mark as fixed on this page". A poor fix is re-flagged on the next scan. An ignored check covers the entire rule. Reason: not found |
| UsableNet AQA | Hosted platform | Tests "customer journeys" from a URL. Scheduled monitoring: not found on the page | "separates what automation can reliably detect from what needs human judgment". Guided manual testing with step-by-step guidance. Assistive technology previews | Status sync with Jira and Azure DevOps. False positive: not found |
| Equalize Digital Accessibility Checker | WordPress plugin | Scans posts and pages in the editor. Pro adds a full-site scan with custom post types and archives, and WP-CLI | "Problems", "Needs Review" and "Accessibility Fixes". Manual testing guide | Dismiss with a reason, optional note, user and time. "Global Dismissal" for identical code. Reopen. Issues Explorer groups by code snippet |
| Sa11y | Open-source in-page checker for content authors, GPL-2.0 | No crawl. Runs on page load for editors | Warnings mark items for a manual check. "Developer checks" toggle | `dismissAnnotations` lets editors dismiss warnings. `dismissAll`. Stored in browser storage |
| Editoria11y | Open-source checker for content authors, GPL-2.0 | No crawl. Runs for logged-in editors. A site-wide dashboard fills as editors view pages, stored on the own server | "alerts" for definite problems, "manual checks" that can be acceptable | "Ignore" per page for one user or all users. "Mark as Checked and OK" for false positives. Site-wide dismissals in 3.0. Restore |
| WAVE and WAVE API | Browser extension and remote API from WebAIM | No crawl. One page per request. Pope Tech is the site-wide product | Alerts need human review | None |
| Google Lighthouse | Open-source audit tool, Apache-2.0. The accessibility category runs axe-core | No. One URL per run. Lighthouse CI runs on each commit | "Manual checks" listed, not scored. Each audit passes or fails, no partial credit | None |
| IBM Equal Access Toolkit, `accessibility-checker` | Open-source engine, Node package and browser extensions, Apache-2.0 | Scans files, directories or URLs from a list. Selenium, Puppeteer, Playwright. No crawler | Levels `violation`, `potentialviolation`, `recommendation`, `potentialrecommendation`, `manual`, `pass`. `failLevels` decide the build | Baseline file per scan label. Return 0 match, 1 differ, 2 no baseline. Compare by xpath and ruleId. README recommends baselines for false positives and resolved needs-review items |
| BrowserStack Website Scanner | Hosted scanner | Crawl from a sitemap or a crawler. Daily or weekly schedules. Page limit: not found | Not found | "new, fixed, & active issues with report comparison". Ignore: not found |

### Table 2: outputs and business model

| Product | Output formats | CMS or WordPress | Points at code | AI use | License or price |
|---|---|---|---|---|---|
| axe DevTools for Web | CSV, JSON, JUnit XML with selector, source code, tags, share URL | Not found | CSS selector and HTML snippet. The Linter flags source code in the IDE | IGTs "Powered by AI". axe Assistant chatbot. MCP server. Monthly AI credits | Free extension. Pro per user with a 14-day trial, price page not readable. Bundle through sales |
| axe Monitor | JSON API: scans, runs, pages, issues with `axeRuleId`, `impact`, `needsReview`, `selector`, `status`. Dashboards, Jira | Not found | Selector | Not found | Enterprise, "unlimited user seats", demo |
| Accessibility Insights for Web | HTML report by test. JSON by WCAG criterion with ISO 8601 dates | None | Highlight on the page, copy of failure details | Not found | Free, MIT |
| Siteimprove | Page Report, REST API v2 behind login, MCP server. Code Checker for Playwright, Cypress, Selenium and Puppeteer with terminal output and a CI gate | Plugins for WordPress, Drupal, AEM, Optimizely and Sitecore. Read-only overlay. Prepublish needs a subscription. Some plugins run a Single Page Check on publish | Page View and HTML view of the element | Agents, "AI Remediate", PDF alt text agent | Enterprise, demo |
| Pope Tech | HTML, PDF, CSV, email. Developer API on Business Plus. GitHub and Bitbucket CI | Not found. Canvas LMS only | WAVE view, Inspect and Code | Not found | Free to 25 pages. Team USD 25 per month. Business Plus USD 225 per month. Page tiers |
| Level Access | Continuum gives JSON or sends to AMP. VPAT and ACR. API | Not found | Not found | "AI-Powered Accessibility Agents", automated remediation | Enterprise quote. Help center behind login |
| Evinced Site Scanner | Pages CSV and Issues CSV with Selector and DOM snippet. MCP server | Not found | Selector and DOM snippet. "Components" group the same element across pages | Computer vision finds interactable elements and headings. ML finds reused code, reading order and focus order | Trial and demo. Price not found |
| Silktide | Reports. Tasks to Jira and Linear. Developer API site not readable. Export formats: not found | WordPress plugin: retest on publish. "CMS" button opens the page in WordPress | Inspector shows the DOM code | Optional. An administrator selects the providers. AI strategy reports and a statement generator | Tailored quote |
| Acquia Optimize | CSV export of a view. Scan history. API with export jobs, reference not readable | Drupal and WordPress integrations. Browser extension | Code snippet of the issue. "Fast track" by code snippet | "Remediation Companion". MCP server | Subscription. Price not found |
| UsableNet AQA | Dashboards and exports. API. Formats not found | Not found | AI-generated selectors. Components and page templates | Tests "5 success criteria that previously required manual review". Generates selectors | Free trial. Price not found |
| Equalize Digital | CSV export add-on. Audit history add-on | It is a WordPress plugin | Affected code highlighted. Origin by theme or plugin: not labelled | Not found | Free. Professional USD 190 per year. Small Business USD 750. Agency USD 2,250 |
| Sa11y | CSV or HTML with `exportResultsPlugin`. `headless` mode. `selectorPath` | WordPress, Joomla, Drupal and Pressbooks plugins | The element on the page | None | Free, GPL-2.0, version 5.1.0 |
| Editoria11y | Reports in the Drupal or WordPress admin | Drupal module 3.0.11 of 2026-10-09. WordPress plugin 3.0.7 of 2026-10-07. Squarespace injector | The element on the page | None | Free. Paid "CSA" add-ons for developer tests |
| WAVE API | JSON or XML. `reporttype` 1 to 4. Level 4 adds CSS selectors and contrast data. `viewportwidth`, `evaldelay`. Stand-alone API renders in a headless browser | None | XPath or CSS selector | None | 100 free credits, then USD 0.025 to 0.04 per credit, 1 to 3 credits per page. Stand-alone license |
| Lighthouse | JSON, HTML, CSV with `--output` | None | Element snippet in the report | None | Free, Apache-2.0 |
| IBM Equal Access | JSON, CSV, XLSX, HTML. JSON has `ruleId`, `reasonId`, `path.dom`, `path.aria`, `snippet`, `message`, `bounds` | None | DOM path, ARIA path and snippet | None | Free, Apache-2.0 |
| BrowserStack Website Scanner | CSV export. Reports API | Not found | Not found | "A11y issue detection agent" and "A11y remediation agent" named | Price not found |

### The monitoring programs

GOV.UK runs a monitoring program, not a product. A simplified test covers a small sample: the home page, the contact page, pages with varied layouts, a form and PDFs. The team runs axe, then tabs through each page, zooms to 400% and views a small screen.

A detailed test covers all A and AA criteria on page templates and one end-to-end service, with assistive technology. The organisation receives a report of findings, has 12 weeks to fix the issues, and gets a partial retest. Usability issues go in a separate list, marked as not failures.

The 2022 to 2024 report counts 1,151 simplified tests and 52 detailed tests. The most common failures were 2.4.7, 1.4.3 and 2.1.1. Organisations fixed 55.3% of the 29,787 issues.

The EU Decision 2018/1524 defines two methods for the member states. The in-depth method verifies all requirements, all steps of each process, and the interaction with forms, controls and dialog boxes. The simplified method uses automated tests across nine user needs, from use without vision to use with limited cognition. Point 3.2 of Annex I lists the pages of an in-depth sample. Point 3.4 adds pages in proportion to the site size for the simplified method.

The member states report every three years. WADEX is the expert group of the directive, not a tool. The Commission page names no monitoring tool.

## 4. Consequences for the plan

The plan already has most of the nine items. This table maps each item to the plan, and names what changes.

| Item to copy | In the plan | Change |
|---|---|---|
| Three result bins, only one fails | The certainty `fail`, `ai fail`, and `needs review`, and the roll-up of section 7.2 | None |
| Guided review questions with a plain answer | The question file of section 8.4, with the same question for the AI and the person | Write each question so that the answer is "This is an issue" or "This is not an issue", plus the reason |
| A dismissal with a reason, a note, a user, a time, and a scope | The statuses `accepted` and `dismissed`, with `status_by` and its reason, in the issue file | Add an optional note field. The scope is the fingerprint |
| Dismissals that follow the code | The fingerprint and the status `reopened` | None |
| A baseline in the repository | The issue files in Git, and the history file with the counts of new, resolved, and reopened | None |
| Issues grouped by the code pattern | The fingerprint, the templates, and the origin | None |
| A structured sample plus a random part | Section 5.2, from WCAG-EM | Add the EU list of pages to the sample: login, sitemap, contact, help, legal, one page per service, a document |
| A weekly schedule plus a re-check on publish | The weekly full audit | A publish hook for WordPress stays after version 1 |
| Machine-readable issues with the element, the code, the rule, and the review flags | The issue file of section 8.3 | None |

The items to avoid confirm the plan. The product has no score, no rule-wide ignore, no overlay, and no hosted engine.

## 5. Sources

I fetched all pages on 2026-10-13. The page date is the date on the page, when the page shows one.

| Product | Page | Page date |
|---|---|---|
| axe DevTools for Web | https://docs.deque.com/devtools-for-web/4/en/devtools-export | Version 4 docs, no date |
| axe DevTools for Web | https://docs.deque.com/devtools-for-web/4/en/devtools-igt | Version 4 docs, no date |
| axe DevTools for Web | https://www.deque.com/axe/devtools/web-accessibility/ | No date |
| axe DevTools for Web | https://www.deque.com/axe/devtools/pricing/ | No date, no prices |
| axe Monitor | https://docs.deque.com/monitor/8.8/en/issues_index1 | Version 8.8, no date |
| axe Monitor | https://docs.deque.com/monitor/8.8/en/monitor-api | Version 8.8, no date |
| axe Monitor | https://docs.deque.com/monitor/8.8/en/presets | Version 8.8, no date |
| axe Monitor | https://docs.deque.com/monitor/8.8/en/basic_scans | Version 8.8, no date |
| axe Monitor | https://www.deque.com/axe/monitor/ | No date |
| Accessibility Insights | https://accessibilityinsights.io/docs/web/overview/ | No date |
| Accessibility Insights | https://accessibilityinsights.io/docs/web/getstarted/fastpass/ | No date |
| Accessibility Insights | https://accessibilityinsights.io/docs/web/getstarted/assessment/ | No date |
| Accessibility Insights | https://github.com/microsoft/accessibility-insights-web | No date |
| Accessibility Insights | https://github.com/microsoft/accessibility-insights-action | Deprecation notice, no date |
| Siteimprove | https://help.siteimprove.com/support/solutions/articles/80000448552 | 2026-05-19 |
| Siteimprove | https://help.siteimprove.com/support/solutions/articles/80000962686-next-generation-accessibility-how-to-dismiss-occurrences-of-accessibility-issues | 2026-06-02 |
| Siteimprove | https://help.siteimprove.com/support/solutions/articles/80001215105-how-crawling-scheduling-and-indexing-work | 2026-06-11 |
| Siteimprove | https://help.siteimprove.com/support/solutions/articles/80001151769-accessibility-code-checker | 2026-05-20 |
| Siteimprove | https://help.siteimprove.com/support/solutions/articles/80000863888-cms-plugin-frequently-asked-questions | 2026-09-24 |
| Siteimprove | https://www.siteimprove.com/platform/accessibility/ | No date |
| Siteimprove | https://api.siteimprove.com/v2/ | HTTP 401 |
| Pope Tech | https://www.pope.tech/websites/features | Copyright 2025 |
| Pope Tech | https://pope.tech/pricing/ | Copyright 2025 |
| Pope Tech | https://pope.tech/ | Copyright 2025 |
| Pope Tech | https://blog.pope.tech/2022/08/10/august-updates/ | 2022-08-11 |
| Pope Tech | https://app.pope.tech/help-center/article/about-pope-tech-reports | Title only, needs a browser |
| Level Access | https://www.levelaccess.com/solutions/software/ | No date |
| Level Access | https://www.levelaccess.com/solutions/software/access-continuum | No date |
| Level Access | https://www.levelaccess.com/tenon-retiring-faqs/ | Shutdown on 2023-08-07 |
| Level Access | https://client.levelaccess.com/hc/en-us/articles/13844879206807-Access-Continuum-overview | HTTP 403 |
| Evinced | https://evinced.com/products/site-scanner/product-documentation | No date |
| Evinced | https://www.evinced.com/products/site-scanner | No date |
| Evinced | https://www.evinced.com/ai/detection | No date |
| Silktide | https://help.silktide.com/en/articles/8011889-what-are-decisions | 2025-04-25 |
| Silktide | https://help.silktide.com/en/articles/9085178-which-wcag-guidelines-can-silktide-help-me-test | 2025-04-25 |
| Silktide | https://help.silktide.com/en/articles/8012023-how-to-set-an-automatic-retest-schedule | 2025-04-25 |
| Silktide | https://help.silktide.com/en/articles/8020912-how-to-integrate-silktide-with-wordpress | 2025-04-25 |
| Silktide | https://help.silktide.com/en/articles/8012016-how-to-retest-specific-pages | 2026-01-14 |
| Silktide | https://silktide.com/platform/accessibility/ | Governance page, no date |
| Silktide | https://silktide.com/pricing/ | No date |
| Acquia Optimize | https://docs.acquia.com/en/articles/5534546-configure-domains | No date |
| Acquia Optimize | https://docs.acquia.com/node/96596 | No date |
| Acquia Optimize | https://docs.acquia.com/node/59486 | No date |
| Acquia Optimize | https://docs.acquia.com/web-governance/how-make-accessibility-decisions | No date |
| Acquia Optimize | https://acquia.com/products/acquia-optimize | No date |
| Acquia Optimize | https://docs.acquia.com/acquia-optimize/optimize-api | Content did not load |
| UsableNet AQA | https://usablenet.com/technology/aqa | Copyright 2026 |
| Equalize Digital | https://equalizedigital.com/accessibility-checker/documentation/ | No date |
| Equalize Digital | https://equalizedigital.com/accessibility-checker/when-to-ignore-accessibility-errors/ | No date |
| Equalize Digital | https://equalizedigital.com/accessibility-checker/pricing/ | No date |
| Equalize Digital | https://equalizedigital.com/changelog-014-meet-issues-explorer-find-and-fix-faster/ | 2026-07-01 |
| Equalize Digital | https://equalizedigital.com/accessibility-checker/errors-in-theme/ | No date |
| Sa11y | https://sa11y.netlify.app/ | Version 5.1.0 |
| Sa11y | https://sa11y.netlify.app/developers/props/ | Version 5.1.0 |
| Sa11y | https://github.com/ryersondmp/sa11y | No date |
| Sa11y | https://wordpress.org/plugins/sa11y/ | 2026-07-30 |
| Editoria11y | https://editoria11y.princeton.edu/ | Version 3.0 of 2026-04-23 |
| Editoria11y | https://www.drupal.org/project/editoria11y | Release 3.0.11 of 2026-10-09 |
| Editoria11y | https://wordpress.org/plugins/editoria11y-accessibility-checker/ | 2026-10-07 |
| WAVE | https://wave.webaim.org/api/ | No date |
| WAVE | https://wave.webaim.org/api/details | API version 3.3 |
| WAVE | https://wave.webaim.org/sitewide | No date |
| Lighthouse | https://developer.chrome.com/docs/lighthouse/accessibility/scoring | 2025-10-22 |
| Lighthouse | https://github.com/GoogleChrome/lighthouse/blob/main/readme.md | No date |
| IBM Equal Access | https://github.com/IBMa/equal-access | No date |
| IBM Equal Access | https://github.com/IBMa/equal-access/blob/master/accessibility-checker/README.md | No date |
| IBM Equal Access | https://github.com/IBMa/equal-access/blob/master/accessibility-checker/src/README.md | No date |
| IBM Equal Access | https://github.com/IBMa/equal-access/blob/master/accessibility-checker-engine/README.md | No date |
| IBM Equal Access | https://www.ibm.com/able/toolkit/ | Page truncated, not readable |
| BrowserStack | https://www.browserstack.com/accessibility-testing/features/website-scanner | No date |
| GOV.UK | https://www.gov.uk/guidance/accessibility-monitoring-how-we-test | 2024-09-30 |
| GOV.UK | https://www.gov.uk/government/publications/accessibility-monitoring-of-public-sector-websites-and-mobile-apps-from-2022-to-2024/accessibility-monitoring-of-public-sector-websites-and-mobile-apps-from-2022-to-2024 | 2024-12-17 |
| EU | https://www.legislation.gov.uk/eudn/2018/1524/pdfs/eudn_20181524_adopted_en.pdf | Decision of 2018-10-11, OJ L 256 of 2018-10-12 |
| EU | https://digital-strategy.ec.europa.eu/en/policies/web-accessibility-monitoring | 2025-07-16 |
| EU | https://eur-lex.europa.eu/eli/dec_impl/2018/1524/oj | Empty response |
| WCAG-EM | https://www.w3.org/TR/WCAG-EM/ | 2026-07-23 |
| Overlays | https://overlayfactsheet.com/en/ | No date |
| Overlays | https://www.ftc.gov/news-events/news/press-releases/2025/01/ftc-order-requires-online-marketer-pay-1-million-deceptive-claims-its-ai-product-could-make-websites | 2025-01-03 |

Eight sources gave no readable content: the axe DevTools plans page, the IBM toolkit pages, the Level Access help center and the Siteimprove API reference. The Acquia API reference, the Pope Tech help center, the Silktide developer site and EUR-Lex also failed. For these, the facts come from the other official pages in the table, and the gaps say "not found".
