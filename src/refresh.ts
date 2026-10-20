// The refresh: rebuilds the issues, the questions, the summary, the page results, and the report of a results folder
// from the stored outcomes of its last run, with the answers and the decisions of today. No page is opened.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CRITERIA } from "./criteria.ts";
import type { Config } from "./config.ts";
import { pathOf } from "./crawl.ts";
import { effectiveAnswer, loadDecisions } from "./decide.ts";
import { applyAnswers, buildIssues, buildQuestions, lastRun, loadExisting, type CompareContext } from "./issues.ts";
import { buildOverview, historyOverview, readHistory, updateHistoryLine } from "./overview.ts";
import { renderReport } from "./report.ts";
import { pageResults, processSummary, siteSummary } from "./results.ts";
import { writeResults } from "./write.ts";
import type { Outcome, PageRecord } from "./types.ts";

export interface RefreshResult { run: string; issues: number; questions: number }

export function refresh(config: Config, outDir: string, log: (line: string) => void = () => {}): RefreshResult {
  const summaryPath = join(outDir, "summary.json");
  if (!existsSync(summaryPath)) throw new Error(`No summary.json in ${outDir}. Run an audit first.`);
  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  const previous = lastRun(outDir);
  const run: string = summary.run;
  const date: string = summary.date;
  const runDir = join(outDir, "runs", run.replace(/:/g, "-"));
  const outcomesPath = join(runDir, "outcomes.jsonl");
  if (!existsSync(outcomesPath)) throw new Error(`No stored outcomes for the run ${run} in ${runDir}. The runs folder is not in Git, so a refresh needs the machine of the audit.`);
  const widths: number[] = config.crawl.widths;
  const first = widths[0];

  // The page records come back from pages.jsonl. The tested criteria of a page are the ones whose result is not "not tested".
  const pageLines = readFileSync(join(outDir, "pages.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const records: PageRecord[] = pageLines.map((p) => {
    const testedCriteria: Record<number, Set<string>> = {};
    for (const [w, results] of Object.entries(p.results || {})) testedCriteria[Number(w)] = new Set(Object.entries(results as Record<string, string>).filter(([, r]) => r !== "not tested").map(([c]) => c));
    return { url: p.url, template: p.template, set: p.set, sample: p.sample, process: p.process || null, states: p.states || [], tested: p.tested, not_tested_reason: p.not_tested_reason, http_status: p.http_status, content_hash: p.content_hash, testedCriteria, outcomes: [], links: [], renders: 0, facts: {} };
  });
  const byUrl = new Map<string, PageRecord>();
  for (const r of records) if (!r.process || !byUrl.has(r.url)) byUrl.set(r.url, r);
  for (const r of records) if (!r.process) byUrl.set(r.url, r);
  const stateKeys = new Map<string, PageRecord>();
  for (const r of records) if (r.process) for (const s of r.states) stateKeys.set(r.url + "|" + s.actions.join(">"), r);
  let n = 0;
  for (const line of readFileSync(outcomesPath, "utf8").split("\n")) {
    if (!line) continue;
    const o = JSON.parse(line) as Outcome;
    // An outcome of a process step belongs to the process page with that state. The other outcomes belong to the crawled page.
    const record = stateKeys.get(o.url + "|" + o.state.join(">")) || byUrl.get(o.url);
    if (!record) continue;
    record.outcomes.push(o);
    n++;
  }
  log(`${n} outcomes of the run ${run} on ${records.length} pages`);

  const pages = records.filter((r) => !r.process);
  const existingIssues = loadExisting(outDir, "issues");
  const existingQuestions = loadExisting(outDir, "questions");
  const versions = summary.versions;
  const context: CompareContext = {
    testedPaths: new Set(records.filter((p) => p.tested).map((p) => pathOf(p.url))),
    samplePaths: new Set(records.filter((p) => p.tested && p.sample).map((p) => pathOf(p.url))),
    // A refresh keeps the statuses of the run: no page is gone in a refresh.
    gonePaths: new Set<string>(),
    versions,
  };
  const questions = buildQuestions(records, config, existingQuestions);
  applyAnswers(records, config, questions);
  const issues = buildIssues(records, config, run, date, existingIssues, context);
  for (const i of issues) if (i.question) { const q = questions.find((x) => x.id === i.question); if (q) q.issue = i.id; }
  const decisions = loadDecisions(outDir);
  const aiOnly = new Map<string, number>();
  for (const q of questions) if (effectiveAnswer(q).by === "ai") aiOnly.set(q.criterion, (aiOnly.get(q.criterion) || 0) + 1);
  const issueCounts = new Map<string, number>();
  for (const i of issues) if (["new", "open", "reopened", "accepted"].includes(i.status)) issueCounts.set(i.wcag.criterion, (issueCounts.get(i.wcag.criterion) || 0) + 1);
  const questionCounts = new Map<string, number>();
  for (const q of questions) if (!effectiveAnswer(q).value) questionCounts.set(q.criterion, (questionCounts.get(q.criterion) || 0) + 1);
  const processNames: string[] = Object.keys(summary.processes || {});
  const processesTested = processNames.filter((name) => summary.processes[name].tested).length;
  const criteria = siteSummary(records, widths, { all: processNames.length, tested: processesTested }, issueCounts, questionCounts, aiOnly, decisions);
  const count = (s: string) => issues.filter((i) => i.status === s).length;
  const replaced = new Set(issues.filter((i) => i.replaces).map((i) => i.replaces));
  const counts = { new: issues.filter((i) => i.status === "new" && !i.replaces).length, open: count("open"), resolved: issues.filter((i) => i.status === "resolved" && i.status_by.run === run && i.status_by.reason === "fixed" && !replaced.has(i.id)).length, resolved_rule_changed: issues.filter((i) => i.status === "resolved" && i.status_by.run === run && i.status_by.reason === "rule changed").length, reopened: count("reopened"), not_checked: count("not checked"), page_removed: count("page removed"), accepted: count("accepted"), dismissed: count("dismissed") };
  const processes = Object.fromEntries(processNames.map((name) => {
    const old = summary.processes[name];
    if (!old.tested) return [name, old];
    const recs = records.filter((r) => r.process === name);
    return [name, { tested: true, ...processSummary(recs, [first]) }];
  }));
  const overview = buildOverview(records, widths, criteria, issues, decisions);
  const newSummary = { ...summary, counts, criteria, processes, overview };
  updateHistoryLine(outDir, run, { counts, overview: historyOverview(overview) });
  const pageFiles = records.map((p) => ({ schema: "page/1", url: p.url, template: p.template, set: p.set, sample: p.sample, process: p.process || null, states: p.states, run, tested: p.tested, ...(p.not_tested_reason ? { not_tested_reason: p.not_tested_reason } : {}), ...(p.http_status ? { http_status: p.http_status } : {}), ...(p.content_hash ? { content_hash: p.content_hash } : {}), results: pageResults(p, p.process ? [first] : widths, decisions), issues: issues.filter((i) => i.examples.some((e: { url: string }) => e.url === pathOf(p.url))).map((i) => i.id) }));
  const processRuns = processNames.map((name) => ({ name, tested: !!summary.processes[name].tested, reason: summary.processes[name].reason, records: records.filter((r) => r.process === name), steps: 0, renders: 0 }));
  const report = renderReport({ config, run, date, versions, criteria, issues, questions, pages, processes: processRuns, differences: [], statesTested: summary.coverage?.states_tested || 0, decisions, skipped: [], durationSeconds: previous?.duration_seconds || 0, renders: previous?.renders || 0, budgetReached: summary.coverage?.budget_reached || [], overview, history: readHistory(outDir) });
  writeResults(outDir, { config, summary: newSummary, pages: pageFiles, issues, questions, history: null, report, run, outcomes: null });
  log(`refreshed: ${issues.filter((i) => ["new", "open", "reopened"].includes(i.status)).length} issues, ${questions.length} questions`);
  return { run, issues: issues.length, questions: questions.length };
}
