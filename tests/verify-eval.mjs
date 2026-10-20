// The accuracy of the AI answers and of the verifier on the seeded faults, with no person.
//
// Usage: node tests/verify-eval.mjs prepare [--detect <folder>]    the questions to answer, and the truth, from the last detection run
//        node tests/verify-eval.mjs prepare-verify                  the same questions without the first answer, for the verifier
//        node tests/verify-eval.mjs score                           the accuracy of the first pass, of the verifier, and of the decision
//
// The truth: each seeded fault that the AI decides gives a question whose answer is "issue". The correct base site gives questions
// whose answer is "no issue". The agents that answer and verify never see the truth file.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { effectiveAnswer, exportVerifyTasks } from "../src/decide.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const mode = args[0];
const flag = (name) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : null; };
const detect = path.resolve(flag("detect") || path.join(here, "..", "tmp", "detect-full"));
const work = path.join(here, "..", "tmp", "verify");
const faults = JSON.parse(fs.readFileSync(path.join(here, "seeded-faults", "faults.json"), "utf8")).faults;
const questionsOf = (dir) => { const q = path.join(dir, "questions"); return fs.existsSync(q) ? fs.readdirSync(q).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(q, f), "utf8"))) : []; };
const pageOf = (u, id) => u.replace(/^\//, "").replace(new RegExp("^" + id + "/?"), "").replace(/^(index\.html)?$/, "index.html");

/** True when a question is about the element of the fault. A page-level rule always is. Else a token of the element (its id, class, tag,
 *  or attribute value) must appear in the selector or the HTML of the evidence. A fault with no element matches every question of its criterion. */
const PAGE_RULES = new Set(["no-reflow", "no-bypass", "single-key-shortcut", "navigation-order-differs", "same-title", "page-not-linked", "page-language-mismatch", "help-position-differs", "inconsistent-control-name", "visual-order-differs"]);
function aboutElement(q, element) {
  if (!element) return true;
  if (PAGE_RULES.has(q.evidence.rule) || ["document", "body", "html", "head > title"].includes(q.evidence.selector)) return true;
  const hay = ((q.evidence.selector || "") + " " + (q.evidence.html || "") + " " + JSON.stringify(q.evidence.facts || {})).toLowerCase();
  const last = element.trim().split(/\s+|\s*>\s*/).pop().toLowerCase();
  const tokens = [];
  for (const m of last.matchAll(/#([\w-]+)/g)) tokens.push(m[1]);
  for (const m of last.matchAll(/\.([\w-]+)/g)) tokens.push(m[1]);
  for (const m of last.matchAll(/\[([\w-]+)=?["']?([^\]"']*)["']?\]/g)) tokens.push(m[2] || m[1]);
  const tag = last.match(/^([a-z][\w-]*)/);
  if (tag) tokens.push("<" + tag[1], " " + tag[1] + " ", " " + tag[1] + ":", " " + tag[1] + ">");
  return tokens.some((x) => hay.includes(x));
}

if (mode === "prepare") {
  fs.mkdirSync(work, { recursive: true });
  const tasks = [], truth = [];
  const base = path.join(detect, "base");
  for (const fault of faults) {
    if (fault.decider !== "ai") continue;
    const dir = path.join(detect, fault.id);
    const pages = fault.pages || [fault.page];
    // The questions of the fault's criterion on its page that the base does not have, about the element of the fault. The others have no known truth.
    const same = questionsOf(dir).filter((q) => q.kind === "review" && q.criterion === fault.criterion && (q.evidence.pages || [q.evidence.url]).some((u) => pages.includes(pageOf(u, fault.id))));
    // One question of the criterion on the page is the fault's. Several need the element of the fault to tell them apart.
    const qs = same.length === 1 ? same : same.filter((q) => aboutElement(q, fault.element));
    if (!qs.length) { console.error(`no question for ${fault.id}`); continue; }
    for (const q of qs) { tasks.push({ results: dir, id: q.id }); truth.push({ results: dir, id: q.id, fault: fault.id, criterion: fault.criterion, truth: "issue" }); }
  }
  for (const q of questionsOf(base).filter((q) => q.kind === "review")) { tasks.push({ results: base, id: q.id }); truth.push({ results: base, id: q.id, fault: "base", criterion: q.criterion, truth: "no issue" }); }
  fs.writeFileSync(path.join(work, "tasks.json"), JSON.stringify(tasks, null, 1));
  fs.writeFileSync(path.join(work, "truth.json"), JSON.stringify(truth, null, 1));
  console.log(JSON.stringify({ questions: tasks.length, issue: truth.filter((t) => t.truth === "issue").length, noIssue: truth.filter((t) => t.truth === "no issue").length }));
} else if (mode === "prepare-verify") {
  const truth = JSON.parse(fs.readFileSync(path.join(work, "truth.json"), "utf8"));
  const list = [];
  for (const dir of new Set(truth.map((t) => t.results))) {
    const file = path.join(work, "verify-" + path.basename(dir) + ".json");
    exportVerifyTasks(dir, file, true);
    const wanted = new Set(truth.filter((t) => t.results === dir).map((t) => t.id));
    for (const q of JSON.parse(fs.readFileSync(file, "utf8")).questions) if (wanted.has(q.id)) list.push({ results: dir, ...q });
  }
  fs.writeFileSync(path.join(work, "verify-tasks.json"), JSON.stringify({ questions: list }, null, 1));
  console.log(JSON.stringify({ questions: list.length }));
} else if (mode === "score") {
  const truth = JSON.parse(fs.readFileSync(path.join(work, "truth.json"), "utf8"));
  const rows = truth.map((t) => {
    const q = JSON.parse(fs.readFileSync(path.join(t.results, "questions", t.id + ".json"), "utf8"));
    const e = effectiveAnswer(q);
    return { ...t, first: q.ai_answer?.value || "none", verifier: q.verification?.value || "none", agrees: !!q.verification?.agrees, decision: e.unresolved ? "unresolved" : e.value || "none" };
  });
  const n = rows.length;
  const count = (f) => rows.filter(f).length;
  const summary = {
    questions: n,
    firstCorrect: count((r) => r.first === r.truth), verifierCorrect: count((r) => r.verifier === r.truth),
    agreed: count((r) => r.agrees), decided: count((r) => r.decision === "issue" || r.decision === "no issue"), decidedCorrect: count((r) => r.decision === r.truth), decidedWrong: count((r) => (r.decision === "issue" || r.decision === "no issue") && r.decision !== r.truth), unresolved: count((r) => r.decision === "unresolved"),
  };
  const md = [`# The accuracy of the AI answers and of the verifier on the seeded faults\n`, `Generated by \`tests/verify-eval.mjs score\` on ${new Date().toISOString().slice(0, 10)}. Two independent AI passes answered each question. The truth comes from the fault list: a seeded fault gives "issue", the correct base site gives "no issue".\n`,
    `| Questions | First pass correct | Verifier correct | Agreed | Decided | Decided correct | Decided wrong | Unresolved |\n|---|---|---|---|---|---|---|---|\n| ${n} | ${summary.firstCorrect} | ${summary.verifierCorrect} | ${summary.agreed} | ${summary.decided} | ${summary.decidedCorrect} | ${summary.decidedWrong} | ${summary.unresolved} |\n`,
    `| Fault | Criterion | Truth | First pass | Verifier | Decision |\n|---|---|---|---|---|---|`];
  for (const r of rows) md.push(`| ${r.fault} | ${r.criterion} | ${r.truth} | ${r.first} | ${r.verifier} | ${r.decision}${r.decision === r.truth ? "" : r.decision === "unresolved" ? "" : " (wrong)"} |`);
  fs.writeFileSync(path.join(here, "seeded-faults", "verification.md"), md.join("\n") + "\n");
  console.log(JSON.stringify(summary));
} else {
  console.error("Usage: node tests/verify-eval.mjs prepare|prepare-verify|score");
  process.exit(2);
}
