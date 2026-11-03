# Accessibility Audit

Accessibility Audit finds what blocks people with disabilities on a website, where each problem comes from, and how to fix it. It audits a whole site against WCAG 2.2 level AA in a real browser, and it runs again when you ask. It does not fix the site: it writes the issues, the origin and the source file of each one, a specific solution, and a work order for the agent or the developer who fixes.

The product has two parts, and no person is needed between them:

- **The engine**, the command `refact-a11y`. It crawls the site, tests each page at three widths with axe-core and its own tests for the criteria that axe-core does not cover, groups the findings into issues, compares them with the last audit, and writes a results folder.
- **The skill**, a plugin for Claude Code. It answers the questions that a rule cannot decide, verifies each answer with a second independent agent, finds the origin and the source of each issue, writes the solution, and hands the fixes over.

The plan is in `PLAN.md`, the boards `STAGE-*.md` record what is built and measured, and `CHANGELOG.md` lists the versions.

## Requirements

- Node 24 or later.
- Chromium for Playwright: `npx playwright install chromium`, once on the machine.
- Claude Code, signed in, for the skill. The engine runs without it.

## Install in the repository of a site

With pnpm:

```
pnpm add -Dw github:refactco/accessibility-audit
pnpm exec refact-a11y --help
```

With npm 12 or later, which installs no git dependency by default, allow the git dependencies of the project first, once in the repository of the site:

```
echo "allow-git=root" >> .npmrc
npm install -D github:refactco/accessibility-audit
npm install-scripts approve @refact/a11y --no-allow-scripts-pin
./node_modules/.bin/refact-a11y --help
```

npm builds `dist/` when it packs the git source. The approval writes `"github:refactco/accessibility-audit": true` into `allowScripts` in `package.json`: it stops the warning about the blocked build script, and it holds for later versions. An entry with the package name alone does not cover a git source.

Then the plugin, for both:

```
claude plugin marketplace add refactco/accessibility-audit    # once on the machine
claude plugin install accessibility-audit@accessibility-audit --scope project
```

The package builds itself at install. The plugin loads from the project settings; teammates accept the trust dialog once.

Run the command as `pnpm exec refact-a11y` or `./node_modules/.bin/refact-a11y`. The old name `a11y` still works in a project that has the package, but never run `npx a11y`: `a11y` is also an unrelated package on the npm registry. When the local package is missing, `npx a11y` downloads and runs that package, and after one such run `npx` keeps a copy in its cache, so even `npx --no a11y` can run it. For the same reason, do not use `npx` with the new name either: the forms above run only the copy in the project.

To update the package to a release tag, for example `v1.3.0`:

```
pnpm add -Dw github:refactco/accessibility-audit#v1.3.0
```

With npm 12 and `allow-git=root`, an install of a new tag over an old one stops with `EALLOWGIT` ("Fetching non-root packages of type "git" have been disabled"): `package-lock.json` still names the old tag, so npm does not count the package as a dependency of the project. Remove the package first, then install the new tag:

```
npm uninstall @refact/a11y
npm install -D github:refactco/accessibility-audit#v1.3.0
npm install-scripts approve @refact/a11y --no-allow-scripts-pin
```

Then look at `allowScripts` in `package.json`: keep `"github:refactco/accessibility-audit": true`, and remove an older entry that ends in `#` and a commit, which an approval with the pin wrote.

For the plugin: `claude plugin marketplace update accessibility-audit`, then `claude plugin update accessibility-audit@accessibility-audit`. A session loads the copy of the plugin in its cache, and a new copy comes only when the version changes.

## The first audit, step by step

1. Open a terminal in the repository of the site and run `claude`. The first time, accept the trust dialog for the folder.
2. Write this message and press Enter:

   ```
   Run the whole accessibility audit cycle on this site.
   ```

   The skill asks two things: the address of the site and the environment, production, staging, or local. Then it writes `accessibility-audit/config.json` and starts.
3. Wait. A site with a few hundred pages takes about an hour for the audit and 20 to 40 minutes for the agents. The session prints each step and asks nothing else.
4. Read the result. The session ends with the counts. The folder `accessibility-audit/` holds the report, the issues, and the work order. The page for people opens with:

   ```
   pnpm exec refact-a11y review          # or: ./node_modules/.bin/refact-a11y review
   ```

The same message runs the next cycle. The audit then compares the site with the last run, and the report shows the new, open, and resolved issues.

## What happens in a cycle

1. The engine finds the pages from the sitemap, the links, and the WordPress API when there is one, and opens each at three widths. A sample of pages gets the deep tests and the open states: menus, accordions, tabs, dialogs. Processes, for example a form, run on staging.
2. A finding that a rule is sure about becomes an issue. A finding that needs judgment becomes a question with the evidence and a screenshot.
3. Review agents answer the questions. Verifier agents answer them again without sight of the first answers. Two equal answers decide. A difference stays unresolved, and the report counts it.
4. Locate agents find the origin of each issue, code, design, content, media, a setting, or a third party, the source file, and write the solution for this project.
5. The engine compares each issue with the last audit, and writes the report, the overview, and `fixes.json`, the work order for the fixing agent.

The commands that the skill runs, which you can run yourself:

```
refact-a11y audit <config.json> --out accessibility-audit         the full audit; Ctrl+C stops it with the results so far
refact-a11y audit <config.json> --out accessibility-audit --resume   continues the last run that a stop or a crash ended
refact-a11y check <config.json> --out accessibility-audit         the short check of the pages with open issues
refact-a11y tasks review|verify|locate                            the batch files of one step, for the agents
refact-a11y refresh                                               the results with the answers of today, no crawl
refact-a11y handoff                                               fixes.json and fixes.md for the fixing agent
refact-a11y review                                                the report page, on your machine
```

The commands find `accessibility-audit/config.json` by themselves in the repository of the site.

## What leaves the machine, and what it costs

- The engine loads the pages of the site, as a browser does. On production it sends no form and changes nothing: the engine blocks every request that is not a read. Processes that enter data run on staging only, with test data.
- The dry submit clicks the submit button of each form on the sample pages, empty and with incorrect values, to see the error messages. A guard in the browser blocks each request that can carry the data, so the site gets nothing. A test proves it for eleven ways to send a form. See `FORMS.md`.
- The agents send the evidence of the questions, the HTML of the issues, and the screenshots to Claude, through your Claude Code account. Nothing else leaves the machine. The results stay in the repository of the site.
- A cycle on a site of 700 pages used about 90 minutes and the work of seven agents.

## The results folder

| File | What it holds |
|---|---|
| `config.json` | The settings of the site |
| `summary.json` | The result of each of the 55 criteria, the counts, the coverage, and the overview |
| `pages.jsonl` | One line for each page, with the result of each criterion at each width |
| `issues/ISS-*.json` | One file for each issue: the rule, the examples, the status, the origin, the source, the solution |
| `questions/Q-*.json` | One file for each question, with the two AI answers |
| `fixes.json`, `fixes.md` | The work order: one task for each open issue, in the order to apply |
| `report.md` | The report for people, as text |
| `history.jsonl` | One line for each run |
| `runs/` | The raw outcomes and the screenshots, not in Git |

Every file has a schema in `formats/`, and the engine validates each file before it writes it.

## Limits

- A result "no issue found" is not a pass. The product finds failures; it cannot prove conformance, and no tool can.
- One criterion, live media (1.2.4), has no test.
- The dry submit sees only the errors that a page shows before it sends. The errors of the server and the success message need a process on staging. A form that checks on the server only is listed in the coverage.
- The engine does not operate the content of a frame, for example an embedded form, and it logs in only with a saved browser state.
- The engine measures the contrast of the letters of a transparent image of text against the page under it. It does not measure the letters of an opaque image, where the text and its background are one picture: that image gets the question for an image of text (1.4.5).
- The two AI answers come from one model, and they can be wrong in the same way. On the seeded test site both are right on every question. On real sites they agree on about 95 percent of the questions, and the rest stay unresolved.
- Measured so far on two headless WordPress sites and one large WordPress site.

## The tests

```
npm test              the type check, the formats, and the seeded site: recurrence, review, and a few faults
npm run detect        the detection of all 74 seeded faults
npm run cycle-eval    the whole cycle on one seeded site, and the solution success rate
npm run dry-submit    the dry submit sends nothing, and finds the form errors (also in npm test)
npm run summary       the engine version and the coverage of the process steps (also in npm test)
```

The seeded site is a small correct site with 74 known faults, in `tests/seeded-faults/`. The numbers of the last measurements are in `tests/seeded-faults/*.md`: 74 of 74 faults found, 29 of 29 source files, 42 of 42 solutions that fixed their issue.

## Problems and questions

Open an issue in this repository with the command you ran, the message of the session, and the version from `CHANGELOG.md`. Never include the files of a results folder of a client without their permission.

## License

MIT, see `LICENSE`. The notices for the work of others are in `NOTICE.md`.
