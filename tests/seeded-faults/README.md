# Seeded faults

The test corpus of the product, from `PLAN.md` section 10. It has two parts.

1. **A correct site with seeded faults.** `site/` is Harbor Market, a static site of 12 pages. It passes WCAG 2.2 AA as far as we know. `faults.json` lists 70 known faults. The script `seed.py` applies each fault to a copy of the site. We know the answer, the page, the element, and the origin of each fault.
2. **The ACT rule fixtures.** `act/cases.json` lists the 1,213 test cases of the W3C ACT rules, with the expected outcome of each. `act/download.py` fetches the files for runs with no network.

## The site

Harbor Market has these pages:

- A home page with an image, an audio recording with a transcript, a disclosure, and product cards.
- An articles page with tabs, a table, a tooltip, and a quote in French. One article page.
- A products page with filters, a sortable list, and icon buttons.
- An order in two steps, with a review step.
- A help page with disclosures and a contact form. A sign-in form.
- A sitemap, a privacy page, and a search page.

The site has a skip link, landmarks, visible focus, and 44 px targets. It has live regions for status messages, error summaries in forms, and autocomplete on personal fields. The scripts are in `app.js`. Nothing is sent to a server.

The base site is not clean for every criterion. `base_expected` in `faults.json` lists the exceptions. The base gives "needs a person" for 1.2.1, because of the audio recording. It gives "no content found" for the video criteria. Everything else must give "no issue found".

Serve a built site from its folder. The XML sitemap names `http://127.0.0.1:8080/`.

```
python3 -I tests/seeded-faults/seed.py check
python3 -I tests/seeded-faults/seed.py build
python3 -m http.server 8080 --directory tests/seeded-faults/build/F42-focus-not-visible
```

`build/` is in `.gitignore`. It holds `base/` and one folder for each fault, with a `fault.json` that records the fault and the line of each edit. `build/index.html` lists them.

## A fault

```json
{
  "id": "F42-focus-not-visible",
  "criterion": "2.4.7",
  "also": ["1.4.11"],
  "title": "The focus outline is removed on all controls",
  "edits": [{ "file": "styles.css", "find": "...", "replace": "..." }],
  "page": "index.html",
  "element": "a[href], button",
  "expected": "failed",
  "decider": "engine",
  "origin": "design",
  "solution": "Restore the outline on :focus-visible."
}
```

| Field | Meaning |
|---|---|
| `criterion` | The criterion that the audit must report. `also` lists other criteria that it can report for the same fault, which do not count as false issues |
| `edits` | Exact replacements, appends, or new files in the base site. Each find string occurs one time |
| `page`, `pages` | The page where the audit must report the fault. The element is a CSS selector, or null for a page-level fault |
| `expected` | The result with the AI and the person in the loop: `failed`, `needs review`, or `needs a person` |
| `decider` | Who gives the result in the plan: `engine` with no help, `ai` from a question with evidence, or `person` |
| `origin` | `code`, `content`, or `design`, for the test of the skill |
| `non_interference` | True for the faults of 1.4.2, 2.1.2, 2.2.2, and 2.3.1 |

The deciders follow the criteria file. A fault that an axe-core rule catches has the decider `engine`, also when the criterion is `auto+review` in the plan.

## The numbers

| Number | How to measure it on this corpus |
|---|---|
| Detection rate | The part of the faults where the audit reports the criterion on the page, as an issue or as a question |
| False issue rate | The issues on the base site, and the issues on a variant that are not the fault and not in `also` |
| Location accuracy | The part of the faults where the skill names the file and the line in `fault.json` |
| Solution success rate | Apply the solution to the variant, and audit it again. The issue must be resolved |

## The ACT cases

`act/cases.json` comes from `criteria/sources/act/testcases.json` and `criteria/criteria.json`, with `act/build_cases.py`. Of the 1,213 cases, 878 are in scope, because their rule maps to one of the 55 criteria with the conformance relation. 449 of those belong to approved rules. The engine must give the expected outcome of each case of the 26 approved rules that axe-core passes, see `research/Q2-rule-engines.md`. The cases of the rules that no engine covers test the own tests of the engine and the AI review.

```
python3 -I tests/seeded-faults/act/build_cases.py criteria/sources/act/testcases.json criteria/criteria.json tests/seeded-faults/act/cases.json
python3 -I tests/seeded-faults/act/download.py tests/seeded-faults/act/cases.json tests/seeded-faults/act/cases
```

The files are W3C content under the ACT rules license, see the `license` field in `cases.json`. They stay out of Git.

## How to add a fault

1. Find the smallest edit of the base site that makes the fault. Copy the find string from the file.
2. Add the fault to `faults.json`, with the page, the element, the expected result, the decider, and the solution.
3. Run `seed.py check`. It confirms that each find string occurs one time and that the fields are complete.
