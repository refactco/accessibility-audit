// The fixes of 1.3.10 that need no browser. (1) The sample for a person comes from the answers, not only from the stored flag: a low
// confidence verification of an older version joins it, and so does an answer that reaches many pages. (2) An issue that a person
// answers with "no issue" is resolved with the reason "not an issue", not "fixed", and the counts and the client report do not count
// it as a fix. (3) The client report says how often a person agreed with the AI, and on the random sample apart.
//
// Usage: node tests/sample-reach.mjs
import { configForUrl } from "../src/config.ts";
import { LARGE_REACH_PAGES, personChecks, personGroup, sampleReasonOf, waitsForPerson } from "../src/decide.ts";
import { applyAnswers, buildIssues, buildQuestions } from "../src/issues.ts";
import { countIssues } from "../src/results.ts";
import { judgmentText, resolvedOther } from "../src/client-report.ts";
import { validate } from "../src/write.ts";

const failures = [];
const check = (ok, message) => { console.error(`${ok ? "ok  " : "FAIL"} ${message}`); if (!ok) failures.push(message); };
const SITE = "https://site.example";
const config = configForUrl(SITE, "production");

// (1) The sample.
const ai = (value, confidence = "high") => ({ value, confidence, reason: "r", model: "m", prompt_version: "1", date: "2026-11-10" });
const agreed = (extra = {}, conf = "high", vconf = "high") => ({ kind: "review", pages: 1, sample: false, ai_answer: ai("issue", conf), verification: { ...ai("issue", vconf), agrees: true }, ...extra });
check(personGroup(agreed({}, "medium", "low")) === "sample" && sampleReasonOf(agreed({}, "medium", "low")) === "low confidence", "a low confidence verification with no stored flag (an answer of 1.3.8) is in the sample");
check(personGroup(agreed({}, "low", "high")) === "sample", "a low confidence first answer with no stored flag is in the sample");
check(personGroup(agreed({ pages: LARGE_REACH_PAGES })) === "sample" && sampleReasonOf(agreed({ pages: LARGE_REACH_PAGES })) === "large reach", `an answer that reaches ${LARGE_REACH_PAGES} pages is in the sample`);
check(personGroup(agreed({ pages: LARGE_REACH_PAGES - 1 })) === null, `an answer that reaches ${LARGE_REACH_PAGES - 1} pages, with no flag and a high confidence, is not in the sample`);
check(sampleReasonOf(agreed({ sample: true, pages: 50 })) === "random", "a random pick stays random, also with a large reach");
check(personGroup(agreed({ pages: 50, verification: { ...ai("no issue"), agrees: false } })) === "differ", "answers that differ stay in the group differ, also with a large reach");
check(waitsForPerson(agreed({ pages: 56 })) && !waitsForPerson(agreed({ pages: 56, person_answer: { value: "issue", by: "P", date: "2026-11-10" } })), "a large reach answer waits until a person answers it");

// The answers that a person checked.
const person = (value) => ({ person_answer: { value, by: "P", date: "2026-11-10" } });
const checkedSet = [agreed({ sample: true, ...person("issue") }), agreed({ sample: true, ...person("issue") }), agreed({ pages: 15, ...person("no issue") }),
  agreed({ ...person("not applicable") }), agreed({ facts_check: { result: "confirmed", by: "P", date: "2026-11-10" } }), agreed({ sample: true })];
const pc = personChecks(checkedSet);
check(pc.checked.length === 4 && pc.agreed === 3 && pc.random === 2 && pc.randomAgreed === 2, `a person checked 4 AI answers, agreed with 3, and 2 of 2 random (${pc.checked.length}, ${pc.agreed}, ${pc.random}, ${pc.randomAgreed})`);

// (2) The reason "not an issue".
const outcome = (extra = {}) => ({ engine: "a11y", engineVersion: "1.3.9", rule: "text-cut-with-spacing", criterion: "1.4.12", kind: "candidate", decider: "ai", url: SITE + "/news/a/", width: 1280, state: [],
  selector: ".card p", item: "layout|card", html: '<p class="card">Text</p>', question: "Is the text cut?", summary: "A container cuts its text.", severity: "serious", facts: {},
  solution: { summary: "Let the container grow.", steps: ["Remove the fixed height."] }, ...extra });
const page = () => [{ url: SITE + "/news/a/", tested: true, sample: true, outcomes: [outcome()], states: [] }];
const ctx = { testedPaths: new Set(["/news/a/"]), samplePaths: new Set(["/news/a/"]), gonePaths: new Set(), versions: { engine: "1.3.10", axe_core: "x", browser: "x" } };
const q = buildQuestions(page(), config, new Map())[0];
const withAnswer = (extra) => { const pages = page(); applyAnswers(pages, config, [{ ...q, ai_answer: ai("issue"), verification: { ...ai("issue"), agrees: true }, ...extra }]); return pages; };
const run1 = "2026-11-06T10:00:00Z", run2 = "2026-11-09T10:00:00Z";
const found = buildIssues(withAnswer({}), config, run1, "2026-11-06", new Map(), ctx);
check(found.length === 1 && found[0].certainty === "ai fail", `two AI answers that agree give an issue (${found.length})`);
const openOld = { ...found[0], status: "open" };
const closed = buildIssues(withAnswer(person("no issue")), config, run2, "2026-11-09", new Map([[openOld.id, openOld]]), ctx);
const c1 = closed.find((i) => i.id === openOld.id);
check(c1?.status === "resolved" && c1.status_by.reason === "not an issue" && c1.status_by.who === "person", `the open issue is resolved, "not an issue", by a person (${c1?.status} ${c1?.status_by?.reason} ${c1?.status_by?.who})`);
let valid = true; try { validate("issue/2", c1); } catch (e) { valid = false; console.error(String(e)); }
check(valid, "the issue is valid against the schema");
const n = countIssues(closed, run2);
check(n.resolved === 0 && n.resolved_not_an_issue === 1, `the counts: 0 fixed, 1 not an issue (${n.resolved}, ${n.resolved_not_an_issue})`);
const na = buildIssues(withAnswer(person("not applicable")), config, run2, "2026-11-09", new Map([[openOld.id, openOld]]), ctx).find((i) => i.id === openOld.id);
check(na?.status_by?.reason === "not an issue", "the answer not applicable of a person also gives the reason not an issue");
// A result of 1.3.9: the same run resolved the issue as "fixed" after the answer of a person. A refresh corrects the reason.
const wrong = { ...openOld, status: "resolved", status_by: { who: "engine", mode: "automatic", date: "2026-11-09", run: run2, reason: "fixed" } };
const fixedNow = buildIssues(withAnswer(person("no issue")), config, run2, "2026-11-09", new Map([[wrong.id, wrong]]), ctx).find((i) => i.id === wrong.id);
check(fixedNow?.status_by?.reason === "not an issue" && fixedNow.status_by.date === "2026-11-09", `a refresh corrects the reason "fixed" of 1.3.9 (${fixedNow?.status_by?.reason})`);
// With no answer of a person, an issue that the audit does not find again is still a fix.
const pagesNone = page(); pagesNone[0].outcomes = [];
const realFix = buildIssues(pagesNone, config, run2, "2026-11-09", new Map([[openOld.id, openOld]]), ctx).find((i) => i.id === openOld.id);
check(realFix?.status === "resolved" && realFix.status_by.reason === "fixed", `with no answer of a person, the issue is fixed (${realFix?.status_by?.reason})`);

// (3) The client report.
const text = judgmentText({ questions: 1888, person: 175, agreed: 1423, unresolved: 288, unsure: 172, checkedByPerson: 173, personAgreed: 172, checkedRandom: 151, randomAgreed: 151 });
check(text.includes("A person checked 173 answers of the AI, 151 of them chosen at random, and agreed with 172.") && text.includes("the answer of the person counts"), "the method text gives the agreement of the person, and the random sample");
check(!text.includes("On the random answers"), "no separate sentence for the random sample when the person agreed with all of it");
check(judgmentText({ questions: 1888, person: 175, agreed: 1425, checkedByPerson: 173, personAgreed: 173, checkedRandom: 151, randomAgreed: 151 }).includes("151 of them chosen at random, and agreed with all of them.") , "when the person agreed with each answer, the text says all of them");
check(judgmentText({ questions: 10, person: 3, agreed: 7, checkedByPerson: 3, personAgreed: 2, checkedRandom: 2, randomAgreed: 1 }).includes("On the random answers, the person agreed with 1 of 2."), "a disagreement in the random sample has its own sentence");
check(!judgmentText({ questions: 10, agreed: 10 }).includes("A person checked"), "no sentence on the person when no person checked an answer");
check(resolvedOther({ resolvedFixed: 0, resolvedRule: 2, resolvedNotIssue: 1 }) === ", and 2 closed because a test of the audit improved, and 1 closed because a person found that it is not an issue", "the client report closes the issue as not an issue, not as a fix");
check(resolvedOther({ resolvedFixed: 3, resolvedNotIssue: 2 }) === ", and 2 more closed because a person found that they are not an issue", "with fixes, the other closed issues are \"more\"");

if (failures.length) { console.error(`\n${failures.length} failed`); process.exit(1); }
console.error("\nall passed");
