// Regroups the outcomes of a stored run into issues and questions with the current grouper, and prints the counts.
// Usage: node tools/regroup.mjs <results folder> [--ids <file.json>]
// It does not change the results folder. With --ids it writes the IDs of the issues and the questions to a file, for a comparison of two runs.
import fs from "node:fs";
import path from "node:path";
import { buildIssues, buildQuestions } from "../src/issues.ts";
import { detectLanguage } from "../src/own/page.ts";

const dir = process.argv[2];
const idsFile = process.argv.indexOf("--ids") >= 0 ? process.argv[process.argv.indexOf("--ids") + 1] : null;
const config = JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8"));
const runs = fs.readdirSync(path.join(dir, "runs")).sort();
const outcomes = fs.readFileSync(path.join(dir, "runs", runs[runs.length - 1], "outcomes.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
// The language detector of today, applied again to the stored language questions.
let kept = outcomes.filter((o) => {
  if (o.rule !== "block-language") return true;
  const d = detectLanguage(o.facts?.text || "");
  return d.lang && d.lang !== o.facts.page;
});
// Outcomes of an older run get the facts that the grouper of today reads, and the rules of today.
kept = kept.filter((o) => !(o.rule === "drag-listener" && !o.facts?.draggable && (o.facts?.listeners || []).every((l) => l === "dragstart")));
for (const o of kept) {
  if (o.rule === "generic-link-text" && o.facts?.name) { o.item = "link|generic|" + String(o.facts.name).toLowerCase().replace(/\s+/g, " ").trim(); o.context = ""; }
  if (o.rule === "page-not-linked") o.item = "page|not-linked";
  if (o.rule === "color-contrast" && !o.facts?.colors) {
    const m = (o.facts?.messages?.[0] || "").match(/foreground color: (#[0-9a-f]+), background color: (#[0-9a-f]+)/i);
    if (m) o.facts = { ...(o.facts || {}), colors: { fg: m[1], bg: m[2] } };
  }
}
const pages = new Map();
for (const o of kept) {
  if (!pages.has(o.url)) pages.set(o.url, { url: o.url, template: null, set: "site", sample: true, tested: true, testedCriteria: {}, outcomes: [], links: [], renders: 0, facts: {}, states: [] });
  pages.get(o.url).outcomes.push(o);
}
const records = [...pages.values()];
const issues = buildIssues(records, config, "regroup", "2026-10-14", new Map());
const questions = buildQuestions(records, config, new Map());
const count = (list, key) => { const c = new Map(); for (const x of list) c.set(key(x), (c.get(key(x)) || 0) + 1); return [...c].sort((a, b) => b[1] - a[1]); };
console.log(`outcomes ${outcomes.length} (${outcomes.length - kept.length} language questions dropped), issues ${issues.length}, questions ${questions.length}`);
console.log("issues by rule:", count(issues, (i) => i.wcag.criterion + " " + i.rule.id).map(([k, n]) => `${k} ${n}`).join("; "));
console.log("questions by rule:", count(questions, (q) => q.criterion + " " + q.evidence.rule).map(([k, n]) => `${k} ${n}`).join("; "));
console.log("one-page issues:", issues.filter((i) => i.reach.pages === 1).length);
if (idsFile) fs.writeFileSync(idsFile, JSON.stringify({
  issues: Object.fromEntries(issues.map((i) => [i.id, `${i.wcag.criterion} ${i.rule.id} | ${i.reach.pages} pages | ${i.examples[0].url} ${(i.examples[0].state || []).join(">")}`])),
  questions: Object.fromEntries(questions.map((q) => [q.id, `${q.criterion} ${q.evidence.rule} | ${q.pages} pages | ${q.evidence.url}`])),
}, null, 1));
