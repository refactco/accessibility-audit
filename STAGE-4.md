# Stage 4: Skill

The work of stage 4, from `PLAN.md` section 11: the skill with the setup questions, the origin, the source file, the specific solution, and the commit record. Done when you know the location accuracy and the solution success rate on the seeded faults.

Started on 2026-10-14.

## The plugin

The skill is a Claude Code plugin in `plugin/`: the manifest `.claude-plugin/plugin.json` and the skill `skills/a11y/SKILL.md` with two reference files. It is independent of any other plugin.

| Part | Where | Status |
|---|---|---|
| The setup and the run | `SKILL.md` | Done. The skill finds or writes the settings, runs the audit in the background, and reads the results folder |
| The answers to the review questions | `SKILL.md`, `references/review.md` | Done. The loop over the open questions, by reach, and the rules of each question family |
| The origin, the source, and the solution | `SKILL.md`, `references/locate.md` | Done as instructions and as the command `a11y locate <ISS-id> --file <found.json>`, which validates the fields against the issue format |
| The decisions of a person | `SKILL.md` | Done. The skill records them with the commands of stage 6 and never decides for the person |
| The cycle | `SKILL.md`, `references/cycle.md`, `src/tasks.ts` | Done on 2026-10-15. The skill runs the whole work on a site in one session, with no person: the audit, the first AI pass, the verifier, the locate step, and the handoff. `a11y tasks review`, `a11y tasks verify`, and `a11y tasks locate` write the batch files of each step, and the skill starts one agent for each batch with the prompts of `cycle.md`. The main agent never answers a question itself, so the verifier stays independent. A scheduled job runs the cycle with `claude -p` |
| The handoff | `src/handoff.ts`, `formats/handoff.schema.json` | Done. `a11y handoff` writes `fixes.json` and `fixes.md` from the open issues: one task each, ordered by the severity and the reach, with the origin, the source, the solution, the examples, and the check that confirms the fix. The fixing agent is outside the product |
| The commit record | | Not built. The issue format has the commit field of a source; the skill does not fill it yet |
| The never-fix rule | `SKILL.md` | Done. The skill explains that the audit lists and recommends, and a developer fixes |

## The checks of "done when"

| Check | Result | Where |
|---|---|---|
| The location accuracy on the seeded faults | Measured on 2026-10-14. Three agents ran the skill's locate step on the 29 issues of the seeded faults that the engine decides, with the answer keys hidden. The source file is correct for 29 of 29. The origin is correct for 28 of 29: one fixed banner in the HTML got "code" and the fault list says "design". All files are correct for 27 of 29: two faults name a second file that only supports the cause. All 29 issues got a specific solution | `tests/seeded-faults/location.md`, `node tests/locate-eval.mjs prepare` then `score` |
| The solution success rate on the seeded faults | Measured on 2026-10-15 on the site of the cycle test. A fixing agent, outside the product, applied the 42 tasks of the handoff to the site. Then a fresh session ran the cycle again: the audit marked all 42 issues resolved with the reason "fixed", no issue replaced an old one, and no new issue appeared. 42 of 42 tasks fixed: 18 code, 14 design, 10 content. The 4 new questions of the second cycle got "no issue" from both passes | `tests/cycle-eval.mjs score-fixes`, `tests/seeded-faults/solutions.md` |
| The cycle test | Measured on 2026-10-15. A fresh Claude Code session with the plugin ran the whole cycle on one seeded site with 31 faults, with no help: 19 minutes, 7 agents, 13 pages. All 27 questions got two answers, and the two passes agreed on all 27. The engine found the 14 faults that it decides, and all 14 got the correct origin and source file. The AI found 15 of the 17 faults that it decides, and decided "issue" on all 15. The 3 questions that no fault explains got "no issue". All 42 open issues got a solution, and the handoff has 42 tasks. The session read no answer key. The 2 faults not found show in the detection test alone: other faults change the same element in the combined site | `tests/cycle-eval.mjs`, `tests/seeded-faults/cycle.md`, `seed.py combine` |

## Next

The first full cycle on refact.co ran on 2026-10-14, in the results folder `accessibility-audit/` of the refact repository. The audit found 696 pages and 54 issues. Three agents ran the locate step on the 54 issues: 54 got an origin, 47 a source file in `apps/web`, and 7 a CMS item. All 54 got a specific solution for the Next.js components.

The first autonomous cycle on refact.co ran on 2026-10-14, from the fourth audit to the handoff, with no click of a person. Three agents answered the 64 open questions. Five agents verified the 104 AI answers without the first answers. Four agents found the origin of the 20 issues that had none. The handoff wrote one task for each of the 70 open issues, all with a source and a specific solution. It also lists the 7 unresolved questions.

That cycle ran from the session of the auditor: a person started each pass. On 2026-10-15 the skill got the cycle, and a fresh session ran it on the seeded site with no help. The same day the solution success rate was measured: 42 of 42. The two checks of "done when" are met.

The plugin is installed in the refact repository since 2026-10-15, and the weekly job of stage 3 runs the cycle from there. See `STAGE-7.md` for the release work: the repository on GitHub, the package, the marketplace, and the install.

1. The commit record: the skill does not fill the commit field of a source yet.
2. The cycle test again with the processes: the order process of the test site did not run, because a fault renames its button.
