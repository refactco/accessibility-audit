// The fixes of 1.3.9 that need no browser. (1) The queue of a person: two "unsure" answers have their own group, the sample stays
// after the verifier, and a low confidence answer of the verifier joins the sample. (2) An issue that a new issue replaces has the
// reason "replaced", also after a refresh of the same run. (3) The fix groups: the issues that one change fixes, in the handoff and
// in the client report. (4) The labels of the rows have no selector and no cut HTML. (5) The client report says where the new issues
// came from and gives the date of the results. (6) The history keeps the failed and the unknown units.
//
// Usage: node tests/queue-groups.mjs
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configForUrl } from "../src/config.ts";
import { answerQuestion, personGroup, verifyQuestion, waitsForPerson } from "../src/decide.ts";
import { buildIssues, buildQuestions } from "../src/issues.ts";
import { countIssues } from "../src/results.ts";
import { fixGroups } from "../src/fix-groups.ts";
import { writeHandoff } from "../src/handoff.ts";
import { labelOf } from "../src/review.ts";
import { clientReport, judgmentText } from "../src/client-report.ts";
import { historyOverview } from "../src/overview.ts";
import { hasPlain } from "../src/own/plain.ts";

const failures = [];
const check = (ok, message) => { console.error(`${ok ? "ok  " : "FAIL"} ${message}`); if (!ok) failures.push(message); };
const SITE = "https://site.example";
const config = configForUrl(SITE, "production");
const dir = mkdtempSync(join(tmpdir(), "a11y-queue-"));

try {
  // (1) The groups of the queue.
  const ai = (value, confidence = "high") => ({ value, confidence, reason: "r", model: "m", prompt_version: "1", date: "2026-11-10" });
  const q = (extra) => ({ kind: "review", ...extra });
  check(personGroup(q({ ai_answer: ai("unsure"), verification: { ...ai("unsure"), agrees: false } })) === "unsure", "two unsure answers: the group unsure");
  check(personGroup(q({ ai_answer: ai("unsure") })) === "unsure", "an unsure first answer with no verification yet: the group unsure");
  check(personGroup(q({ ai_answer: ai("issue"), verification: { ...ai("unsure"), agrees: false } })) === "differ", "issue and unsure: the group differ");
  check(personGroup(q({ ai_answer: ai("no issue"), verification: { ...ai("issue"), agrees: false } })) === "differ", "no issue and issue: the group differ");
  check(personGroup(q({ ai_answer: ai("issue"), verification: { ...ai("issue"), agrees: true }, sample: true })) === "sample", "two answers that agree, with sample: the sample stays after the verifier");
  check(personGroup(q({ ai_answer: ai("issue"), verification: { ...ai("issue"), agrees: true }, sample: false })) === null, "two answers that agree, with no sample: not for a person");
  check(personGroup(q({})) === null, "no AI answer: not in the queue");
  check(personGroup({ kind: "person" }) === "person", "a check for a person: the group person");
  check(!waitsForPerson(q({ ai_answer: ai("issue"), verification: { ...ai("issue"), agrees: true }, sample: true, person_answer: { value: "issue", by: "P", date: "2026-11-10" } })), "a sample question that a person answered does not wait");
  check(waitsForPerson(q({ ai_answer: ai("issue"), verification: { ...ai("issue"), agrees: true }, sample: true })), "a sample question with no person answer waits");

  // A low confidence answer of the verifier joins the sample.
  const outcome = (item, src, extra = {}) => ({ engine: "a11y", engineVersion: "1.3.8", rule: "image-of-text", criterion: "1.4.5", kind: "candidate", decider: "ai", url: SITE + "/news/a/", width: 1280, state: [], selector: "figure img",
    item, html: `<img src="${src}" alt="Download">`, question: "Is this an image of text?", summary: "An image of text.", severity: "moderate", facts: { src, alt: "Download", inLink: false, nearText: "" },
    solution: { summary: "Put the text in the page.", steps: ["Replace the image with text."] }, ...extra });
  const page = (outcomes) => [{ url: SITE + "/news/a/", tested: true, sample: true, outcomes, states: [] }];
  const question = buildQuestions(page([outcome("image|uploads/2026/11/a.png", SITE + "/wp-content/uploads/2026/11/a.png")]), config, new Map())[0];
  mkdirSync(join(dir, "questions"), { recursive: true });
  writeFileSync(join(dir, "questions", question.id + ".json"), JSON.stringify(question));
  const first = answerQuestion(dir, question.id, "issue", { by: "ai", model: "m", confidence: "high", sampleShare: 0 });
  check(first.sample === false, "a high confidence first answer with a share of 0 is not in the sample");
  const verified = verifyQuestion(dir, question.id, "issue", { by: "ai", model: "m", confidence: "low" });
  check(verified.sample === true && personGroup(verified) === "sample", "a low confidence answer of the verifier puts the question in the sample");

  // (2) The reason "replaced".
  const failed = (item, src) => ({ ...outcome(item, src), kind: "failed" });
  const srcA = SITE + "/wp-content/uploads/2026/11/a.png", srcB = SITE + "/wp-content/uploads/2026/11/b.png";
  const ctx = (engine) => ({ testedPaths: new Set(["/news/a/"]), samplePaths: new Set(["/news/a/"]), gonePaths: new Set(), versions: { engine, axe_core: "x", browser: "x" } });
  const run1 = "2026-11-09T10:00:00Z", run2 = "2026-11-10T10:00:00Z";
  const old = buildIssues(page([failed("image|uploads/2026/11/a.png", srcA)]), config, run1, "2026-11-09", new Map(), ctx("1.3.8"))[0];
  const oldOpen = { ...old, status: "open" };
  const second = buildIssues(page([failed("image|uploads/2026/11/b.png", srcB)]), config, run2, "2026-11-10", new Map([[oldOpen.id, oldOpen]]), ctx("1.3.9"));
  const replacing = second.find((i) => i.status === "new");
  const replacedOld = second.find((i) => i.id === old.id);
  check(replacing?.replaces === old.id, `the new issue replaces the old one (${replacing?.replaces})`);
  check(replacedOld?.status === "resolved" && replacedOld?.status_by?.reason === "replaced", `the old issue is "resolved", "replaced", not "fixed" (${replacedOld?.status} ${replacedOld?.status_by?.reason})`);
  const counts = countIssues(second, run2);
  check(counts.resolved === 0 && counts.replaced === 1, `the counts: 0 resolved, 1 replaced (${counts.resolved}, ${counts.replaced})`);
  const again = buildIssues(page([failed("image|uploads/2026/11/b.png", srcB)]), config, run2, "2026-11-10", new Map(second.map((i) => [i.id, i])), ctx("1.3.9"));
  check(again.find((i) => i.id === old.id)?.status_by?.reason === "replaced" && again.find((i) => i.id === replacing.id)?.replaces === old.id, "a refresh of the same run keeps the reason replaced");

  // (3) The fix groups.
  const issue = (id, extra = {}) => ({ id, status: "open", origin: "design", rule: { id: "no-reflow" }, reach: { pages: 1 }, examples: [{ url: `/p-${id}/` }],
    source: [{ file: "theme/styles/wysiwyg.scss", line: 122, confidence: "certain", method: "m" }], ...extra });
  const set = [issue("ISS-00000001"), issue("ISS-00000002"), issue("ISS-00000003", { reach: { pages: 4 }, examples: [{ url: "/p-3/" }] }),
    issue("ISS-00000004", { origin: "content" }), issue("ISS-00000005", { source: [{ file: "theme/styles/wysiwyg.scss", line: 122, confidence: "possible", method: "m" }] }),
    issue("ISS-00000006", { rule: { id: "color-contrast" } }), issue("ISS-00000007", { status: "resolved" }), issue("ISS-00000008", { source: [{ file: "theme/styles/base.scss", line: 9, confidence: "probable", method: "m" }] })];
  const { groups, byIssue } = fixGroups(set);
  check(groups.length === 1 && groups[0].issues.join() === "ISS-00000001,ISS-00000002,ISS-00000003", `one group of the 3 open design issues with one rule, file, and line (${groups.map((g) => g.issues.join("+")).join(" ")})`);
  check(!byIssue.has("ISS-00000004") && !byIssue.has("ISS-00000005") && !byIssue.has("ISS-00000006") && !byIssue.has("ISS-00000008"), "a content issue, a possible source, another rule, and a single issue are not in a group");
  check(groups[0].pages === 4 && groups[0].pages_exact === false && /^FIX-[0-9a-f]{8}$/.test(groups[0].id), `the group gives at least 4 pages, not an exact count (${groups[0].pages}, ${groups[0].pages_exact})`);

  // The handoff: the groups and the group of each task, valid against the schema.
  const out = join(dir, "results");
  mkdirSync(join(out, "issues"), { recursive: true }); mkdirSync(join(out, "questions"), { recursive: true });
  writeFileSync(join(out, "summary.json"), JSON.stringify({ run: run2 }));
  const real = (n, item) => ({ ...buildIssues(page([{ ...failed(item, srcA), kind: "failed", rule: "no-reflow", criterion: "1.4.10", url: SITE + `/p-${n}/` }].map((o) => ({ ...o }))), config, run2, "2026-11-10", new Map())[0] });
  const made = [1, 2, 3].map((n) => ({ ...real(n, `layout|page-${n}`), status: "open", origin: "design", source: [{ file: "theme/styles/wysiwyg.scss", line: 122, confidence: "certain", method: "m" }] }));
  for (const i of made) writeFileSync(join(out, "issues", i.id + ".json"), JSON.stringify(i));
  writeHandoff(config, out, join(out, "fixes.json"), { markdown: join(out, "fixes.md") });
  const h = JSON.parse(readFileSync(join(out, "fixes.json"), "utf8"));
  const ids = new Set(made.map((i) => i.id));
  check(made.length === 3 && ids.size === 3, `three issues for the handoff (${ids.size})`);
  check(h.fix_groups?.length === 1 && h.fix_groups[0].issues.length === 3 && h.tasks.every((t) => t.fix_group === h.fix_groups[0].id), `fixes.json has one group, and each task names it (${h.fix_groups?.length})`);
  const md = readFileSync(join(out, "fixes.md"), "utf8");
  check(md.includes("## Changes that fix many tasks") && md.includes("`theme/styles/wysiwyg.scss:122`") && md.includes(`Fix group ${h.fix_groups[0].id}`), "fixes.md lists the group and names it in each task");

  // (4) The labels of the rows.
  check(labelOf('<td style="width: 50%') === "", "a cut HTML gives no label, not the HTML");
  check(labelOf('<a id="OWAe639b30a" title="Original URL: h') === "", "a cut opening tag gives no label");
  check(labelOf('<img src="https://site.example/wp-content/uploads/2024/02/resized-3.jpg" alt="">') === "resized-3.jpg", `an image with an empty alt gives its file (${labelOf('<img src="https://site.example/wp-content/uploads/2024/02/resized-3.jpg" alt="">')})`);
  check(labelOf('<iframe src="https://www.youtube.com/embed/x" width="560"></iframe>') === "www.youtube.com", "a frame with no title gives its host");
  check(labelOf('<div id="message-list" aria-label="Chat messages"></div>') === "Chat messages", "an aria-label gives the label");
  check(labelOf('<p>Fall &amp; Spring&#8217;s</p>') === "Fall & Spring’s", `the entities are decoded (${labelOf('<p>Fall &amp; Spring&#8217;s</p>')})`);
  check(labelOf('<div class="avatar"></div>') === "", "an element with no text gives no label, not its selector");
  check(labelOf(`<p>${"word ".repeat(30)}</p>`).endsWith("…") && labelOf(`<p>${"word ".repeat(30)}</p>`).length <= 70, "a long text is cut with an ellipsis");

  // (5) The client report.
  const text = judgmentText({ questions: 1888, person: 14, agreed: 1586, aiOnly: 0, unresolved: 288, unsure: 172, waitingAi: 0, personChecks: 0 });
  check(text.includes("116 have two AI answers that do not agree") && text.includes("172 need a person, because the AI reviews could not decide"), `the method text separates the answers that differ from the unsure ones (${text})`);
  const rows = [
    { id: "ISS-00000001", status: "new", title: "The page needs a sideways scroll", experience: "e", hint: "", path: "/p-1/", severity: "serious", pages: 1, criterion: "1.4.10", who: "Design", proposal: false, fix: "FIX-0000000a" },
    { id: "ISS-00000002", status: "new", title: "The page needs a sideways scroll", experience: "e", hint: "", path: "/p-2/", severity: "serious", pages: 1, criterion: "1.4.10", who: "Design", proposal: false, fix: "FIX-0000000a" },
    { id: "ISS-00000009", status: "open", title: "An image with no text alternative", experience: "e", hint: "", path: "/news/x/", severity: "critical", pages: 4, criterion: "1.1.1", who: "Content", proposal: false, fix: "" },
  ];
  const fixes = [
    { id: "ISS-00000009", ids: ["ISS-00000009"], fix: "", count: 1, title: rows[2].title, experience: "e", hint: "", path: "/news/x/", severity: "critical", pages: 4, pagesExact: true, who: "Content", criterion: "1.1.1", proposal: false, file: "", line: null },
    { id: "ISS-00000001", ids: ["ISS-00000001", "ISS-00000002"], fix: "FIX-0000000a", count: 2, title: rows[0].title, experience: "e", hint: "One change fixes 2 issues: wysiwyg.scss, line 122", path: "/p-1/", severity: "serious", pages: 2, pagesExact: false, who: "Design", criterion: "1.4.10", proposal: false, file: "theme/styles/wysiwyg.scss", line: 122 },
  ];
  const data = { host: "site.example", run: "2026-11-09T10:29:32Z", runDate: "2026-11-09", updated: "2026-11-10", preparedBy: "Team", contact: "",
    overview: { open: 3, prevRun: "2026-11-06T09:16:11Z", newCount: 2, newFromAnswers: 2, newFromTests: 0, resolvedFixed: 0, resolvedRule: 0, reopened: 0, outOfScope: 0, share: 97.9, pagesNoFailure: { no_failure: 1, all: 2 },
      fixGroups: { groups: 1, issues: 2 }, coverage: { pages: 2, sample: 1, states: 0, widths: [390, 1280] } },
    answers: { questions: 3, person: 0, agreed: 3, aiOnly: 0, unresolved: 0, unsure: 0, waitingAi: 0, personChecks: 0 }, issues: rows, fixes };
  const html = clientReport(data, { local: false });
  const plain = html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  check(plain.includes("2 are new since the last audit on 6 November 2026: 0 from the automatic tests, and 2 from the review of the findings that need judgment"), "the client report says where the new issues came from");
  check(plain.includes("2 of the issues come from only 1 place in the code"), "the client report gives the issues of the fix groups");
  check(plain.includes("One change in wysiwyg.scss, line 122, fixes 2 issues of this kind") && plain.includes("at least 2 pages"), "what to fix first shows the group as one item, with at least its pages");
  check((plain.match(/The page needs a sideways scroll/g) || []).length === 2, "the group has one line in what to fix first and one line in the table of its team");
  check(plain.includes("results of 10 November 2026") && plain.includes("Team · 10 November 2026"), "the client report gives the date of the results in the header and the footer");
  check(html.includes('<span class="hint">/news/x/</span>'), "a row with no label shows its page");

  // (6) The history line, and the plain titles.
  const ho = historyOverview({ levels: { A: { units: { share_no_failure: 96.9 } }, AA: { units: { share_no_failure: 97.9, failed: 9809, unknown: 1151 } } }, issues: { open: 707 } });
  check(ho.failed_units_AA === 9809 && ho.unknown_units_AA === 1151, "the history line keeps the failed and the unknown units of level AA");
  check(["frame-title", "aria-required-children", "nested-interactive", "aria-allowed-attr", "definition-list"].every(hasPlain), "the five rules with no plain words before 1.3.9 have them");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (failures.length) { console.error(`\n${failures.length} failed`); process.exit(1); }
console.error("\nall passed");
