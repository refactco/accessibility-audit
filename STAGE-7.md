# Stage 7: Release

The work of stage 7, from `PLAN.md` section 11: audit real sites, record all the numbers, write the documentation, and package the plugin and the Node package. Done when a person who did not build the auditor can install it and complete an audit.

Started on 2026-10-15.

## The parts

| Part | Where | Status |
|---|---|---|
| The repository | `github.com/refactco/accessibility-audit`, private | Done on 2026-10-15. The user created it, and the code of the auditor is on its `main` branch |
| The package | `package.json`, `tsconfig.build.json` | Done. Node runs no TypeScript from inside `node_modules`, so the package builds `dist/` with the TypeScript compiler on install, and the command `a11y` runs `dist/cli.js`. The browser, the rule engine, and the validator are dependencies. A site repository installs it with `pnpm add -Dw "git+ssh://git@github.com/refactco/accessibility-audit.git#main"`, then `npx a11y` works there |
| The plugin marketplace | `.claude-plugin/marketplace.json` | Done. The repository is a marketplace with one plugin, `accessibility-audit`, whose skill is `a11y`. A Mac adds it once with `claude plugin marketplace add refactco/accessibility-audit`, and a project installs it with `claude plugin install accessibility-audit@accessibility-audit --scope project` |
| The install in the pilot repository | the refact repository: `package.json`, `.claude/settings.json` | Done on 2026-10-15. The package is a dev dependency, and the plugin is enabled in the project settings. A session in that repository, also with `claude -p`, has the skill. The changes and the results of the first cycles are in the pull request 155 of the refact repository, on the branch `chore/accessibility-audit`, as the git workflow of that project asks |
| The weekly job | | Built and proved on 2026-10-15 with three runs. Removed on 2026-10-16 by the decision of the user: not needed at this stage. A person starts the cycle in a session, and the results go into a pull request by hand |
| The documentation | `README.md` | Started on 2026-10-15: what the product does, the install, the commands, the cycle, the results folder, the job, and the tests |
| The numbers | the boards, `CHANGELOG.md` | Recorded on the boards of stages 2, 4, and 6, and in the changelog. The false issue rate is not measured: it needs an expert, or the dismissals of a person |
| The version | `package.json`, `plugin/.claude-plugin/plugin.json`, `CHANGELOG.md` | Version 1.0.0 on 2026-10-16, with the tag `v1.0.0` and the changelog: all seven stages are done, and the seven checks are met. A machine gets a new copy of the plugin only when the version changes, so each release of the skill must raise it |
| The public release | `LICENSE`, `NOTICE.md`, `README.md`, `.github/workflows/ci.yml`, `tsconfig.json` | Prepared on 2026-10-20, by the decisions of the user: the MIT license, the name kept, GitHub as the only source of the package. The notices name the work of others in the research data and the engine. The README speaks to people outside the company. The type check is on with no error, `npm test` runs the type check, the formats, and the seeded site, and a GitHub Actions job runs it on each change. The settings and the notes of the client site are gone, and the public repository starts from a clean history; the private history lives on in `accessibility-audit-history`. The user flips the repository to public |
| The install test by another person | `README.md` | Done on 2026-10-15. The user installed the auditor in the repository of fioredesigns.com, a headless WordPress site of 740 pages, with the README alone, and asked a session for the cycle. The skill wrote the settings, found the WordPress API, and ran the whole cycle in 96 minutes with no help: 420 states, 192 questions answered and verified with 184 agreements and 8 unresolved, 113 issues, all with an origin and a specific solution, and 113 tasks. The plugin went in at the user scope of the Mac, not the project scope |

## The checks of "done when"

| Check | Result | Where |
|---|---|---|
| A person who did not build the auditor can install it and complete an audit | Yes, on 2026-10-15: the user installed it in another project with the README and completed the cycle with no help | `README.md`, the results folder of fioredesigns.com |

## Not built

- The full audit of the second pilot, a large WordPress news site: about 6 hours at its rate limit.
