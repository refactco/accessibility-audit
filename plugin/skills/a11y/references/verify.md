# The verifier: the second, independent answer

Each review question gets two AI answers, from two separate passes. The second pass is the verifier. It must not know the first answer, so that the two answers are independent: an agreement then means something, and a disagreement shows a question that the evidence does not settle.

## How the verifier works

1. Export the questions that wait for a verification. The command writes them without the first answer:

```
a11y verify-tasks --file /tmp/verify-tasks.json --out accessibility-audit
```

2. Read only that file and the screenshots it names. Do not open the question files in `questions/`, and do not read the report: both hold the first answer.
3. For each question, decide on your own with the rules of `review.md`: `issue`, `no issue`, or `unsure`. Open the page read-only when the evidence is not enough. Give the facts you relied on, one `--fact` each, and a reason.
4. Record the verification:

```
a11y verify Q-19c2e4d0 issue --by ai --model <your model name> --confidence high --fact "The alt text is a file name." --reason "A file name does not describe the image." --out accessibility-audit
```

The command compares the two answers and records `agrees`.

## What the two answers give

- Two equal answers decide the question. The answer counts in the results as "ai fail" for an issue, or as no finding for no issue.
- A disagreement, or an unsure answer on either side, leaves the question unresolved. The result of its criterion stays "needs review", and the report counts the unresolved questions. No person needs to act. A person may answer later on the review page.
- A person's answer always wins over both.

## The stance of the verifier

Be the reviewer who looks for the error of the first pass. Do not lean to "no issue" because most questions end that way. Do not lean to "issue" to be safe. Decide from what the picture and the page show, and name the facts. When the facts are not visible, answer `unsure` and say what is missing.

Never estimate a contrast ratio by eye. The engine measures contrast from the pixels; when a contrast question remains, it carries the measured numbers in `evidence.facts.measured`, and the question is whether the text is readable on all parts of a mixed background.
