// The results pipeline after an audit: refresh and tasks. Each check is the "Check" line, or the fix, of one item of the list of
// problems of 1.1.1. Item 15: a refresh after a person removes page records counts the pages again. Item 16: a refresh keeps a
// verified answer when the page of its example goes. Item 17: the task files keep to the budgets of the settings.
//
// Usage: node tests/refresh.mjs
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAudit } from "../src/audit.ts";
import { configForUrl } from "../src/config.ts";
import { answerQuestion, verifyQuestion } from "../src/decide.ts";
import { refresh } from "../src/refresh.ts";
import { writeTasks } from "../src/tasks.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "seeded-faults", "build", "refresh");
const PORT = 8096;
const SITE = `http://refresh.localhost:${PORT}`;
const failures = [];
const check = (ok, message) => { console.error(`${ok ? "ok  " : "FAIL"} ${message}`); if (!ok) failures.push(message); };

const page = (title, body = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><main><h1>${title}</h1>${body}</main></body></html>`;
const server = http.createServer((req, res) => {
  const p = new URL(req.url, SITE).pathname;
  if (p === "/") { res.writeHead(200, { "content-type": "text/html" }); res.end(page("Home", `<ul><li><a href="/a/">A</a></li><li><a href="/b/">B</a></li><li><a href="/c/">C</a></li></ul>`)); return; }
  if (["/a/", "/b/", "/c/"].includes(p)) { res.writeHead(200, { "content-type": "text/html" }); res.end(page("Page " + p.slice(1, 2).toUpperCase(), "<p>Text.</p>")); return; }
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const config = configForUrl(SITE, "local");
config.crawl.widths = [390];
config.crawl.rate_limit = 20;
config.crawl.random_sample_share = 0;
config.interaction.max_states_per_page = 0;
const pagesFile = path.join(dir, "pages.jsonl");
const readPages = () => fs.readFileSync(pagesFile, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const removePage = (p) => fs.writeFileSync(pagesFile, readPages().filter((x) => new URL(x.url).pathname !== p).map((x) => JSON.stringify(x)).join("\n") + "\n");
const questions = () => fs.readdirSync(path.join(dir, "questions")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, "questions", f), "utf8")));
const issues = () => fs.readdirSync(path.join(dir, "issues")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, "issues", f), "utf8")));
const summary = () => JSON.parse(fs.readFileSync(path.join(dir, "summary.json"), "utf8"));

try {
  fs.rmSync(dir, { recursive: true, force: true });
  const result = await runAudit({ config, outDir: dir, log: () => {} });
  check(summary().coverage.pages_found === 4, `the audit found 4 pages (${summary().coverage.pages_found})`);

  // Item 15: a person removes the record of /c/, then refreshes.
  removePage("/c/");
  refresh(config, dir);
  const cov = summary().coverage;
  check(cov.pages_found === 3 && cov.pages_tested === 3 && cov.pages_not_tested === 0, `item 15: the refresh counts the pages again (${cov.pages_found} found, ${cov.pages_tested} tested)`);
  check(fs.readFileSync(path.join(dir, "report.md"), "utf8").includes("| 3 | 3 |"), "item 15: the report and the summary give the same page counts");

  // Item 16: one review question with an item on /a/ and an item on /b/, and seven other questions and three issues for item 17.
  const outcomesFile = path.join(dir, "runs", result.run.replace(/:/g, "-"), "outcomes.jsonl");
  const outcome = (p, extra) => ({ criterion: "1.3.1", engine: "a11y", engineVersion: "test", url: SITE + p, width: 390, state: [], selector: "div.card", severity: "serious", solution: { summary: "Fix it.", steps: ["Fix it."] }, ...extra });
  const review = (p, item, html) => outcome(p, { rule: "test-review", kind: "cantTell", decider: "ai", item, html, summary: "A card to review.", question: "Does the card convey its structure?" });
  const extra = [review("/a/", "div.card|shared", '<div class="card">Card on A</div>'), review("/b/", "div.card|shared", '<div class="card">Card on B</div>')];
  for (let i = 1; i <= 7; i++) extra.push(review("/b/", `div.card|q${i}`, `<div class="card">Question ${i}</div>`));
  for (let i = 1; i <= 3; i++) extra.push(outcome("/b/", { rule: "test-fail", kind: "failed", item: `div.card|f${i}`, html: `<div class="card">Issue ${i}</div>`, summary: `A failed card ${i}.` }));
  fs.appendFileSync(outcomesFile, extra.map((o) => JSON.stringify(o)).join("\n") + "\n");
  refresh(config, dir);
  const shared = questions().find((q) => q.evidence.rule === "test-review" && q.evidence.pages.length === 2);
  check(!!shared, `the refresh makes one question for the card on /a/ and /b/ (${shared?.id}, example ${shared?.evidence.url})`);
  answerQuestion(dir, shared.id, "issue", { by: "ai", model: "test-model", reason: "The card has no heading.", confidence: "high" });
  verifyQuestion(dir, shared.id, "issue", { by: "ai", model: "test-verifier", reason: "No heading.", confidence: "high" });
  refresh(config, dir);
  const issue = issues().find((i) => i.question === shared.id);
  check(!!issue && ["new", "open"].includes(issue.status), `the verified answer gives an issue (${issue?.id} ${issue?.status})`);

  // The page of the example goes, as when a person removes the records of pages that are not in scope.
  removePage(shared.evidence.url);
  refresh(config, dir);
  const after = questions().find((q) => q.id === shared.id);
  check(after?.ai_answer?.value === "issue" && after?.verification?.value === "issue", `item 16: the refresh keeps the verified answer when the page of its example goes (answer ${after?.ai_answer?.value}, verification ${after?.verification?.value})`);
  check(after?.evidence.url !== shared.evidence.url && after?.pages === 1, `item 16: the example moves to the page that stays (${after?.evidence.url})`);
  const issueAfter = issues().find((i) => i.id === issue?.id);
  check(!!issueAfter && ["new", "open"].includes(issueAfter.status), `item 16: the issue of the answer stays (${issueAfter?.status})`);

  // Item 17: the budgets. One AI answer came today, so the review budget of 4 leaves 3.
  const budget = structuredClone(config);
  budget.budgets.max_questions_per_audit = 4;
  budget.budgets.max_issues_for_skill = 2;
  const tasksDir = path.join(dir, "runs", "tasks");
  const r = writeTasks(budget, dir, "review", tasksDir, 2);
  check(r.waiting >= 7 && r.count === 3 && r.batches === 2, `item 17: tasks review keeps to max_questions_per_audit less the answers of the run (${r.count} of ${r.waiting}, budget ${r.budget})`);
  const listed = fs.readdirSync(tasksDir).filter((f) => f.startsWith("review-")).flatMap((f) => JSON.parse(fs.readFileSync(path.join(tasksDir, f), "utf8")).questions);
  check(listed.length === 3, `item 17: the batch files hold 3 questions (${listed.length})`);
  const l = writeTasks(budget, dir, "locate", tasksDir);
  check(l.waiting >= 3 && l.count === 2, `item 17: tasks locate keeps to max_issues_for_skill (${l.count} of ${l.waiting})`);
  const n = writeTasks(budget, dir, "review", tasksDir, 20, 5);
  check(n.count === 5, `item 17: --limit replaces the budget (${n.count})`);
  const v = writeTasks(budget, dir, "verify", tasksDir);
  check(v.count === 0 && !JSON.stringify(v).includes("item_hashes"), "tasks verify lists the answers with no verification");
} finally {
  await new Promise((r) => server.close(r));
}

if (failures.length) { console.error(`\n${failures.length} checks failed`); process.exit(1); }
console.error("\nall checks passed");
