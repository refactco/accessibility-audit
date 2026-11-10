// The fixes of 1.3.8 that need no browser. (1) The item of an image of text has the path of the file: two uploads with the same name in
// two folders are two questions, one file from two subsites is one question, and a question of 1.3.7 continues with its answer and its
// issue. (2) The method text of the client report comes from the counts of the answers, and names a person only when a person answered.
//
// Usage: node tests/counts-images.mjs
import { configForUrl } from "../src/config.ts";
import { buildIssues, buildQuestions } from "../src/issues.ts";
import { judgmentText } from "../src/client-report.ts";
import { imageKey } from "../src/own/images.ts";
import { legacyItems } from "../src/stable.ts";

const failures = [];
const check = (ok, message) => { console.error(`${ok ? "ok  " : "FAIL"} ${message}`); if (!ok) failures.push(message); };
const SITE = "https://site.example";
const config = configForUrl(SITE, "production");

// (1) The key of an image.
const up = (prefix, folder, name) => `${SITE}${prefix}/wp-content/uploads/sites/68/${folder}/${name}`;
check(imageKey(up("/news", "2023/11", "Image-1-768x432.jpg")) === "uploads/sites/68/2023/11/Image-1-768x432.jpg", `the key is the path after /wp-content/ (${imageKey(up("/news", "2023/11", "Image-1-768x432.jpg"))})`);
check(imageKey(up("/news", "2026/10", "AAO.png")) === imageKey(up("/ophthalmology", "2026/10", "AAO.png")), "one file reached from two subsites has one key");
check(imageKey(up("/news", "2023/11", "Image-1.jpg")) !== imageKey(up("/news", "2024/02", "Image-1.jpg")), "two uploads with one name in two folders have two keys");
check(imageKey(`${SITE}/img/team/banner.png?v=3`) === "img/team/banner.png", `another site keeps the whole path, without the query of an image file (${imageKey(`${SITE}/img/team/banner.png?v=3`)})`);
check(imageKey(`${SITE}/cgi/photo.php?id=12`) === "cgi/photo.php?id=12", "the query of a script that sends the image stays");
check(imageKey("data:image/png;base64,AAAA").startsWith("data-"), "an image in a data address keeps its hash");
check(legacyItems("image|uploads/sites/68/2023/11/Image-1.jpg", "<img>").includes("image|Image-1.jpg"), "the item of 1.3.7 comes back from the item of 1.3.8");
check(legacyItems("image|text-contrast|uploads/2024/02/chart.png", "<img>").includes("image|text-contrast|chart.png"), "also for the text contrast of an image");

// A question and an issue of 1.3.7 continue under the item of 1.3.8.
const outcome = (item, src, extra = {}) => ({ engine: "a11y", engineVersion: "1.3.7", rule: "image-of-text", criterion: "1.4.5", kind: "candidate", decider: "ai", url: SITE + "/news/a/", width: 1280, state: [], selector: "figure img",
  item, html: `<img src="${src}" alt="Download the brochure">`, question: "Is this an image of text?", summary: "An image of text.", severity: "moderate", facts: { src, alt: "Download the brochure", inLink: false, nearText: "" },
  solution: { summary: "Put the text in the page.", steps: ["Replace the image with text."] }, ...extra });
const src = up("/news", "2023/11", "brochure.png");
const page = (outcomes) => [{ url: SITE + "/news/a/", tested: true, sample: true, outcomes, states: [] }];
const old = buildQuestions(page([outcome("image|brochure.png", src)]), config, new Map())[0];
old.ai_answer = { value: "issue", confidence: "high", reason: "Text.", model: "test", prompt_version: "1", date: "2026-11-09" };
old.verification = { value: "issue", confidence: "high", reason: "Text.", model: "test", prompt_version: "1", date: "2026-11-09", agrees: true };
const now = buildQuestions(page([outcome("image|" + imageKey(src), src)]), config, new Map([[old.id, old]]));
check(now.length === 1 && now[0].id !== old.id && now[0].ai_answer?.value === "issue" && now[0].verification?.agrees === true, `the question of 1.3.7 continues under its new ID with its answers (${old.id} -> ${now[0]?.id}, ${now[0]?.ai_answer?.value || "no answer"})`);
const two = buildQuestions(page([outcome("image|" + imageKey(src), src), outcome("image|" + imageKey(up("/news", "2024/02", "brochure.png")), up("/news", "2024/02", "brochure.png"), { selector: "p img" })]), config, new Map());
check(two.length === 2, `two uploads with one name are two questions (${two.length})`);

const oldIssues = buildIssues(page([{ ...outcome("image|brochure.png", src), kind: "failed" }]), config, "2026-11-09T10:00:00Z", "2026-11-09", new Map());
const oldIssue = { ...oldIssues[0], status: "open", origin: "content", solution: { ...oldIssues[0].solution, summary: "Put the text of the brochure in the page.", type: "specific" } };
const newIssues = buildIssues(page([{ ...outcome("image|" + imageKey(src), src), kind: "failed", engineVersion: "1.3.8" }]), config, "2026-11-12T10:00:00Z", "2026-11-12", new Map([[oldIssue.id, oldIssue]]), { testedPaths: new Set(["/news/a/"]), samplePaths: new Set(["/news/a/"]), gonePaths: new Set(), versions: { engine: "1.3.8", axe_core: "x", browser: "x" } });
const moved = newIssues.find((i) => i.id !== oldIssue.id && i.rule.id === "image-of-text");
const left = newIssues.find((i) => i.id === oldIssue.id);
check(!!moved && moved.origin === "content" && moved.solution.summary === "Put the text of the brochure in the page." && ["open", "new"].includes(moved.status), `the issue moves to the new ID with its origin and its solution (${moved?.id} ${moved?.status} ${moved?.origin})`);
check(left?.status === "resolved" && left?.status_by?.reason === "rule changed", `the old ID is "resolved", "rule changed", not "fixed" (${left?.status} ${left?.status_by?.reason})`);

// (2) The method text.
const none = judgmentText({ questions: 1888, person: 0, agreed: 138, aiOnly: 0, unresolved: 21, waitingAi: 1729, personChecks: 0 });
check(none.includes("1,888 questions") && none.includes("138 have two independent AI answers that agree") && none.includes("1,729 wait for a first review") && none.includes("No person has answered") && !/a person (answered|checked) \d/.test(none), `with no answer of a person, the text says so (${none})`);
const some = judgmentText({ questions: 10, person: 2, agreed: 5, aiOnly: 1, unresolved: 1, waitingAi: 0, personChecks: 1 });
check(some.includes("a person answered 2") && some.includes("1 has one AI answer that a second review did not check yet") && some.includes("1 is a check that only a person can do") && !some.includes("No person"), `with answers of a person, the text gives their count (${some})`);
check(judgmentText({ questions: 0 }) === "No finding needed judgment.", "with no question, the text says that no finding needed judgment");

if (failures.length) { console.error(`\n${failures.length} failed`); process.exit(1); }
console.error("\nall passed");
