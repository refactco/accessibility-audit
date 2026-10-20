# Stage 3: Recurrence

The work of stage 3, from `PLAN.md` section 11: the fingerprints, the comparer, the statuses, the short check, the versions, and the history. Set up a scheduled job. Done when two audits give the same IDs, one seeded fault gives one new issue, and three scheduled audits run with no help.

Started on 2026-10-14, next to stage 2.

## The commands

```
node src/cli.ts audit <url or config.json> --out <folder>     the full audit
node src/cli.ts check <url or config.json> --out <folder>     the short check: the pages with open issues only
node tests/recurrence.mjs [--serve]                            the recurrence test on the seeded site
```

| Part | Where | Status |
|---|---|---|
| Fingerprints | `src/issues.ts` | Done. A style rule groups by the kind of element, with no page and no state. A contrast issue groups by its color pair. A hidden focused control groups by its cover. A content item groups by its item and its state. The questions group the same way, with the context for the context-dependent criteria |
| Statuses | `src/issues.ts` | Done for new, open, reopened, resolved, not checked, page removed, accepted, and dismissed, as section 6.1 says. "Not checked" when the audit did not test all pages of the issue. "Page removed" when all pages of the issue gave 404 or 410. The rule "absent from three audits" is not built. A refresh of the same run keeps the statuses, and a new issue of the same run that the refresh does not find again goes with no resolution: the answer that made it changed |
| Resolved with "rule changed" | `src/issues.ts` | Done. An issue that disappears after a change of the version of its engine gets the reason "rule changed", and the report does not count it as a fix |
| Replaced issues | `src/issues.ts` | Done. A new issue with the rule and a page of an issue resolved in the same audit replaces it, keeps its first-seen date, and the pair does not count as one fix and one new issue |
| Versions and the baseline | `src/audit.ts` | Done. Each run and each issue records the versions. The first audit of a results folder, and an audit after a change of a version, is a baseline audit |
| History | `src/write.ts` | Done. One line for each run, with its kind, its counts, its coverage, and its versions |
| The short check | `src/cli.ts` | Done. `a11y check` audits the pages with open issues in the results folder, as a run of the kind "short check" |
| The scheduled job | | Built on 2026-10-15 as a launchd job on the Mac of the user, with a template for GitHub Actions, and proved with three runs. Removed on 2026-10-16 by the decision of the user: not needed at this stage. The job files are gone from the Mac and from the repository. A person starts the cycle in a session |

## The checks of "done when"

| Check | Result | Where |
|---|---|---|
| Two audits give the same IDs | Yes on the seeded site: audits 1 and 6 of the recurrence test give the same question IDs. On refact.co, two audits of the same 15 pages give the same 35 issue IDs, and 84 of 86 question IDs. Two full audits of the site, with the random sample that changes by design, gave 58 open issues in both, 5 new, and 5 resolved. The resolved ones came from states on pages that left the sample, which the comparer now marks "not checked". A third full audit after that fix gave 62 open issues, 0 new, 0 resolved, and 1 not checked: the same IDs | `npm run recurrence`, `STAGE-2.md` |
| One seeded fault gives one new issue | Yes. The fault F01 gives one new issue, `image-alt`. Then: not tested its page, "not checked". The short check tests the page, "open". The fault removed, "resolved" with the reason "fixed". One more audit, no new fix | `npm run recurrence`, 8 checks pass |
| Three scheduled audits run with no help | Yes, on 2026-10-15: three runs of the weekly job on refact.co, each from the audit to the handoff with no person, in 100, 90, and 93 minutes. The results are in the pull requests 155 and 156 of the refact repository. The third run found 4 new issues and 1 reopened, all in the open states of two pages that the random sample added: the churn of the random sample, as the plan expects. The second run took 90 minutes: 700 pages and 286 states, 17 questions answered and verified, 69 open issues, 69 tasks, and the first overview: 98.5 percent of the units at level A and 95.1 percent at level AA with no failure. A first attempt of that run was seven times slower from its first pages, while test sessions ran on the same Mac. The user stopped it. On the idle Mac the engine was at its normal pace, and the run again was normal. One of three. The user chose the launchd job on the Mac on 2026-10-15. The job is loaded for each Monday at 03:00, and it runs the whole cycle from the refact repository with the installed package and plugin, then commits the results folder. The first run, started by hand on 2026-10-15, took 100 minutes: the audit of 696 pages and 338 states in 77 minutes, then 14 questions answered and verified with full agreement, and the handoff with 69 tasks, all with an origin and a solution. The session installed the browser of the new Playwright version itself. The run found one defect, fixed the same day: see `STAGE-6.md`. Two more scheduled runs must complete | `docs/schedule-launchd.md`, `~/.a11y/weekly-refact.sh`, `~/Library/LaunchAgents/co.refact.a11y.weekly-refact.plist` |

## Not built

- The rule "page removed after three audits with the page absent". The 404 and 410 rule is built.
- A dismissed issue reappears only when the element changes. The engine keeps the dismissed status by the fingerprint, and a changed element gets a new fingerprint. A person's dismissal with a reason and a note needs the commands of stage 6.
- A scheduled job, after the decision of 2026-10-16. The three runs of 2026-10-15 proved it.
