// The cycle test: a fresh session runs the whole cycle of the skill on one seeded site, with no person, and this script scores it.
//
// Usage: node tests/cycle-eval.mjs prepare      writes tmp/cycle-eval/config.json for the combined site (seed.py combine cycle ...)
//        node tests/cycle-eval.mjs score        scores the results folder against tmp/cycle-eval/truth.json
//        node tests/cycle-eval.mjs score-fixes  the solution success rate: the tasks of tmp/cycle-eval/fixes-before.json that the
//                                               next cycle marks resolved, after the fixing agent applied them to the site
//
// The site: tests/seeded-faults/build/cycle, served at http://127.0.0.1:8080/cycle/. The truth: the faults that seed.py combined,
// with the origin and the files of each. The session that runs the cycle never reads the truth file, faults.json, or seed.py.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { configForUrl } from "../src/config.ts";
import { effectiveAnswer } from "../src/decide.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const mode = process.argv[2];
const work = path.join(here, "..", "tmp", "cycle-eval");
const results = path.join(work, "results");
const site = path.join(here, "seeded-faults", "build", "cycle");
const read = (folder) => { const d = path.join(results, folder); return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(d, f), "utf8"))) : []; };
const pageOf = (u) => u.replace(/^\//, "").replace(/^cycle\/?/, "").replace(/^(index\.html)?$/, "index.html");

// The same processes as the detection test: they run the form tests of 3.3.1, 3.3.3, 3.3.4, and 3.3.7.
const PROCESSES = [
  // The combined site has the fault F62: the order button is "Confirm the order" and there is no review step.
  { name: "order", environment: "local", steps: [
    { page: "order.html", action: "click 'Confirm the order'" },
    { page: "order.html", action: "fill 'Delivery date' with 'next week'" },
    { page: "order.html", action: "click 'Confirm the order'" },
    { page: "order.html", action: "fill 'Full name' with 'Audit Test'" },
    { page: "order.html", action: "fill 'Email' with 'audit@example.com'" },
    { page: "order.html", action: "fill 'Delivery address' with '1 Harbor Street'" },
    { page: "order.html", action: "fill 'Delivery date' with '2026-11-01'" },
    { page: "order.html", action: "fill 'Card number' with '4242424242424242'" },
    { page: "order.html", action: "click 'Confirm the order'" },
  ] },
  { name: "contact", environment: "local", steps: [{ page: "help.html", action: "click 'Send the message'" }] },
];

/** True when a finding is about the element of the fault: a page-level rule always is; else a token of the element appears in the evidence. */
const PAGE_RULES = new Set(["no-reflow", "no-bypass", "single-key-shortcut", "navigation-order-differs", "same-title", "page-not-linked", "page-language-mismatch", "help-position-differs", "inconsistent-control-name", "visual-order-differs", "html-has-lang", "document-title"]);
/** 0 when the finding is not about the element; 2 when an id, a class, or an attribute of the element is in the evidence; 1 for the tag only. */
function aboutElement(rule, selector, html, facts, element) {
  if (!element) return 1;
  if (PAGE_RULES.has(rule) || ["document", "body", "html", "head > title"].includes(selector)) return 1;
  const hay = ((selector || "") + " " + (html || "") + " " + JSON.stringify(facts || {})).toLowerCase();
  const parts = element.trim().toLowerCase().split(/\s+|\s*>\s*/);
  const strong = [];
  for (const part of parts) {
    for (const m of part.matchAll(/#([\w-]+)/g)) strong.push(m[1]);
    for (const m of part.matchAll(/\.([\w-]+)/g)) strong.push(m[1]);
    for (const m of part.matchAll(/\[([\w-]+)=?["']?([^\]"']*)["']?\]/g)) strong.push(m[2] || m[1]);
  }
  if (strong.some((x) => hay.includes(x))) return 2;
  const tag = parts[parts.length - 1].match(/^([a-z][\w-]*)/);
  if (tag && ["<" + tag[1], " " + tag[1] + " ", " " + tag[1] + ":", " " + tag[1] + ">"].some((x) => hay.includes(x))) return 1;
  return 0;
}
const best = (list, strengthOf) => list.map((x) => [x, strengthOf(x)]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([x]) => x);

if (mode === "prepare") {
  fs.mkdirSync(work, { recursive: true });
  const config = configForUrl("http://127.0.0.1:8080/cycle", "local");
  config.interaction.processes = PROCESSES;
  config.interaction.tests_that_send_data = true;
  config.crawl.random_sample_share = 1;
  config.site.cms = { type: "none", source_path: path.relative(results, site) };
  fs.writeFileSync(path.join(work, "config.json"), JSON.stringify(config, null, 2) + "\n");
  console.log(JSON.stringify({ config: path.join(work, "config.json"), results, site, truth: path.join(work, "truth.json") }));
} else if (mode === "score") {
  const truth = JSON.parse(fs.readFileSync(path.join(work, "truth.json"), "utf8")).faults;
  const questions = read("questions"), issues = read("issues");
  const open = issues.filter((i) => ["new", "open", "reopened"].includes(i.status));
  const rows = [];
  for (const f of truth) {
    const pages = f.pages || [f.page];
    const onPage = (urls) => urls.some((u) => pages.includes(pageOf(u)));
    if (f.decider === "engine") {
      const hits = best(open.filter((i) => i.wcag.criterion === f.criterion && onPage(i.examples.map((e) => e.url))), (i) => Math.max(...i.examples.map((e) => aboutElement(i.rule.id, e.selector, e.html, e.facts, f.element))));
      const i = hits[0];
      const files = i ? (i.source || []).filter((s) => s.file).map((s) => path.basename(s.file)) : [];
      const truthFiles = [...new Set(f.edits.map((e) => path.basename(e.file)))];
      rows.push({ fault: f.id, decider: "engine", criterion: f.criterion, found: !!i, issue: i?.id, located: !!i && i.origin !== "unknown", originOk: !!i && i.origin === f.origin, fileOk: files.some((x) => truthFiles.includes(x)), specific: i?.solution?.type === "specific" });
    } else {
      const hits = best(questions.filter((q) => q.criterion === f.criterion && onPage(q.evidence.pages || [q.evidence.url])), (q) => aboutElement(q.evidence.rule, q.evidence.selector, q.evidence.html, q.evidence.facts, f.element));
      const q = hits[0];
      const e = q ? effectiveAnswer(q) : null;
      const linked = q ? open.find((i) => i.question === q.id) : null;
      rows.push({ fault: f.id, decider: "ai", criterion: f.criterion, found: !!q, question: q?.id, first: q?.ai_answer?.value || null, verifier: q?.verification?.value || null, decision: e ? (e.unresolved ? "unresolved" : e.value || "open") : null, correct: e?.value === "issue", issue: linked?.id, located: !!linked && linked.origin !== "unknown" });
    }
  }
  // The questions that no fault explains: their truth is "no issue". A criterion that a fault on the page also touches is left out,
  // and a design fault changes a stylesheet, so its criteria are left out on every page.
  const faultKeys = new Set(truth.flatMap((f) => [f.criterion, ...(f.also || [])].flatMap((c) => (f.origin === "design" ? ["*"] : f.pages || [f.page]).map((p) => c + "|" + p))));
  const explained = (q) => (q.evidence.pages || [q.evidence.url]).some((u) => faultKeys.has(q.criterion + "|" + pageOf(u)) || faultKeys.has(q.criterion + "|*"));
  const noIssue = questions.filter((q) => !explained(q));
  const noIssueRows = noIssue.map((q) => { const e = effectiveAnswer(q); return { question: q.id, rule: q.evidence.rule, decision: e.unresolved ? "unresolved" : e.value || "open", correct: e.value === "no issue" }; });
  const verified = questions.filter((q) => q.verification), agreed = verified.filter((q) => q.verification.agrees);
  const unresolved = questions.filter((q) => effectiveAnswer(q).unresolved), unanswered = questions.filter((q) => !q.ai_answer && !q.person_answer);
  const handoff = fs.existsSync(path.join(results, "fixes.json")) ? JSON.parse(fs.readFileSync(path.join(results, "fixes.json"), "utf8")) : null;
  const engine = rows.filter((r) => r.decider === "engine"), ai = rows.filter((r) => r.decider === "ai");
  const count = (list, fn) => list.filter(fn).length;
  const summary = {
    date: new Date().toISOString().slice(0, 10), faults: truth.length,
    questions: questions.length, answered: questions.length - unanswered.length, verified: verified.length, agreed: agreed.length, unresolved: unresolved.length,
    engineFaults: engine.length, engineFound: count(engine, (r) => r.found), engineLocated: count(engine, (r) => r.located), engineOriginOk: count(engine, (r) => r.originOk), engineFileOk: count(engine, (r) => r.fileOk),
    aiFaults: ai.length, aiFound: count(ai, (r) => r.found), aiCorrect: count(ai, (r) => r.correct), aiUnresolved: count(ai, (r) => r.decision === "unresolved"), aiWrong: count(ai, (r) => r.found && r.decision === "no issue"), aiIssuesLocated: count(ai, (r) => r.correct && r.located),
    noIssueQuestions: noIssueRows.length, noIssueCorrect: count(noIssueRows, (r) => r.correct), noIssueWrong: count(noIssueRows, (r) => r.decision === "issue"),
    openIssues: open.length, openLocated: count(open, (i) => i.origin !== "unknown"), handoffTasks: handoff ? handoff.tasks.length : null, handoffUnresolved: handoff ? handoff.unresolved_questions.length : null,
  };
  const md = [`# The cycle test on the seeded site\n`, `Generated by \`tests/cycle-eval.mjs score\` on ${summary.date}. A fresh session ran the whole cycle of the skill on one site with ${truth.length} seeded faults: the audit, the first AI pass, the verifier, the locate step, and the handoff. No person took part.\n`,
    `| Questions | Answered | Verified | Agreed | Unresolved | Open issues | Located | Handoff tasks |\n|---|---|---|---|---|---|---|---|\n| ${summary.questions} | ${summary.answered} | ${summary.verified} | ${summary.agreed} | ${summary.unresolved} | ${summary.openIssues} | ${summary.openLocated} | ${summary.handoffTasks} |\n`,
    `- Faults that the engine decides: ${summary.engineFound} of ${summary.engineFaults} found as an issue, ${summary.engineLocated} located, ${summary.engineOriginOk} with the correct origin, ${summary.engineFileOk} with a correct source file.`,
    `- Faults that the AI decides: ${summary.aiFound} of ${summary.aiFaults} found as a question, ${summary.aiCorrect} decided "issue" by two agreeing passes, ${summary.aiUnresolved} unresolved, ${summary.aiWrong} decided "no issue" (wrong), ${summary.aiIssuesLocated} of the issues they made located.`,
    `- Questions that no fault explains: ${summary.noIssueQuestions}, ${summary.noIssueCorrect} decided "no issue", ${summary.noIssueWrong} decided "issue" (wrong).\n`,
    `| Fault | Decider | Criterion | Found | Decision or issue | Located | Origin ok | File ok |\n|---|---|---|---|---|---|---|---|`];
  for (const r of rows) md.push(`| ${r.fault} | ${r.decider} | ${r.criterion} | ${r.found ? "yes" : "no"} | ${r.decider === "engine" ? (r.issue || "-") : `${r.first || "-"} / ${r.verifier || "-"} → ${r.decision || "-"}`} | ${r.located ? "yes" : "no"} | ${r.decider === "engine" ? (r.originOk ? "yes" : "no") : "-"} | ${r.decider === "engine" ? (r.fileOk ? "yes" : "no") : "-"} |`);
  if (noIssueRows.length) { md.push(`\n| Question with no fault | Rule | Decision |\n|---|---|---|`); for (const r of noIssueRows) md.push(`| ${r.question} | ${r.rule} | ${r.decision}${r.correct ? "" : " (wrong)"} |`); }
  fs.writeFileSync(path.join(here, "seeded-faults", "cycle.md"), md.join("\n") + "\n");
  fs.writeFileSync(path.join(work, "score.json"), JSON.stringify({ summary, rows, noIssueRows }, null, 1));
  console.log(JSON.stringify(summary));
} else if (mode === "score-fixes") {
  const before = JSON.parse(fs.readFileSync(path.join(work, "fixes-before.json"), "utf8"));
  const issues = new Map(read("issues").map((i) => [i.id, i]));
  const replaced = new Map(read("issues").filter((i) => i.replaces).map((i) => [i.replaces, i.id]));
  const rows = before.tasks.map((t) => {
    const i = issues.get(t.issue);
    const status = i ? i.status : "missing";
    const reason = i?.status_by?.reason || null;
    const outcome = replaced.has(t.issue) ? "replaced" : status === "resolved" && reason === "fixed" ? "fixed" : status === "resolved" ? "resolved, " + reason : status === "not checked" || status === "page removed" ? "not checked" : "still open";
    return { issue: t.issue, criterion: t.criterion, origin: t.origin, summary: t.summary, solution: t.solution.summary, outcome, replacedBy: replaced.get(t.issue) || null };
  });
  const count = (o) => rows.filter((r) => r.outcome === o).length;
  const summary = { date: new Date().toISOString().slice(0, 10), tasks: rows.length, fixed: count("fixed"), stillOpen: count("still open"), replaced: count("replaced"), notChecked: count("not checked"),
    byOrigin: Object.fromEntries(["code", "design", "content", "media"].map((o) => [o, { tasks: rows.filter((r) => r.origin === o).length, fixed: rows.filter((r) => r.origin === o && r.outcome === "fixed").length }])) };
  const md = [`# The solution success rate on the seeded site\n`, `Generated by \`tests/cycle-eval.mjs score-fixes\` on ${summary.date}. A fixing agent, outside the product, applied the ${rows.length} tasks of the handoff to the site of the cycle test. Then a fresh session ran the cycle again. A task counts as fixed when the next audit marks its issue resolved with the reason "fixed". A new issue that replaces the old one counts as not fixed.\n`,
    `| Tasks | Fixed | Still open | Replaced | Not checked |\n|---|---|---|---|---|\n| ${summary.tasks} | ${summary.fixed} | ${summary.stillOpen} | ${summary.replaced} | ${summary.notChecked} |\n`,
    ...Object.entries(summary.byOrigin).filter(([, v]) => v.tasks).map(([o, v]) => `- Origin ${o}: ${v.fixed} of ${v.tasks} fixed.`), "",
    `| Issue | Criterion | Origin | Solution | Outcome |\n|---|---|---|---|---|`];
  for (const r of rows) md.push(`| ${r.issue} | ${r.criterion} | ${r.origin} | ${r.solution.replace(/\|/g, "/")} | ${r.outcome}${r.replacedBy ? " by " + r.replacedBy : ""} |`);
  fs.writeFileSync(path.join(here, "seeded-faults", "solutions.md"), md.join("\n") + "\n");
  fs.writeFileSync(path.join(work, "score-fixes.json"), JSON.stringify({ summary, rows }, null, 1));
  console.log(JSON.stringify(summary));
} else {
  console.error("Usage: node tests/cycle-eval.mjs prepare | score | score-fixes");
  process.exit(2);
}
