// The refresh: rebuilds the issues, the questions, the summary, the page results, and the report of a results folder
// from the stored outcomes of its last run, with the answers and the decisions of today. No page is opened.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CRITERIA } from "./criteria.ts";
import type { Config } from "./config.ts";
import { pageKey } from "./crawl.ts";
import { effectiveAnswer, loadDecisions } from "./decide.ts";
import { applyAnswers, buildIssues, buildQuestions, lastRun, loadExisting, type CompareContext } from "./issues.ts";
import { buildOverview, historyOverview, readHistory, updateHistoryLine } from "./overview.ts";
import { ENGINE_VERSION } from "./own/page.ts";
import { renderReport, type ReportData } from "./report.ts";
import { countIssues, issuesByPage, pageCoverage, pageFileOf, processSummary, siteSummary } from "./results.ts";
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
    return { url: p.url, template: p.template, set: p.set, sample: p.sample, process: p.process || null, states: p.states || [], tested: p.tested, not_tested_reason: p.not_tested_reason, http_status: p.http_status, redirects_to: p.redirects_to, linked_from: p.linked_from, found_in: p.found_in, widths_not_loaded: p.widths_not_loaded, content_hash: p.content_hash, sampleReason: p.sample_reason, title: p.title, testedCriteria, outcomes: [], links: [], renders: 0, facts: { ...(p.load_incomplete ? { loadIncomplete: p.load_incomplete } : {}), ...(p.styles_missing ? { stylesMissing: p.styles_missing } : {}) } };
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
  const key = (u: string) => pageKey(config.site.url, u);
  const context: CompareContext = {
    testedPaths: new Set(records.filter((p) => p.tested).map((p) => key(p.url))),
    samplePaths: new Set(records.filter((p) => p.tested && p.sample).map((p) => key(p.url))),
    // A refresh keeps the statuses of the run: no page is gone in a refresh.
    gonePaths: new Set<string>(),
    widthsNotLoaded: new Map(records.filter((p) => p.tested && p.widths_not_loaded?.length).map((p) => [key(p.url), p.widths_not_loaded!])),
    versions,
  };
  // The questions of the run. The old questions whose pages the run did not test stay with their answers, out of the counts.
  const allQuestions = buildQuestions(records, config, existingQuestions, context);
  const questions = allQuestions.filter((q) => !q.not_checked);
  applyAnswers(records, config, questions);
  const issues = buildIssues(records, config, run, date, existingIssues, context);
  for (const i of issues) if (i.question) { const q = questions.find((x) => x.id === i.question); if (q) q.issue = i.id; }
  const decisions = loadDecisions(outDir, config.site.url);
  const aiOnly = new Map<string, number>();
  for (const q of questions) if (effectiveAnswer(q).by === "ai") aiOnly.set(q.criterion, (aiOnly.get(q.criterion) || 0) + 1);
  const issueCounts = new Map<string, number>();
  for (const i of issues) if (["new", "open", "reopened", "accepted"].includes(i.status)) issueCounts.set(i.wcag.criterion, (issueCounts.get(i.wcag.criterion) || 0) + 1);
  const questionCounts = new Map<string, number>();
  for (const q of questions) if (!effectiveAnswer(q).value) questionCounts.set(q.criterion, (questionCounts.get(q.criterion) || 0) + 1);
  const processNames: string[] = Object.keys(summary.processes || {});
  const processesTested = processNames.filter((name) => summary.processes[name].tested).length;
  const criteria = siteSummary(records, widths, { all: processNames.length, tested: processesTested }, issueCounts, questionCounts, aiOnly, decisions);
  const counts = countIssues(issues, run);
  const processes = Object.fromEntries(processNames.map((name) => {
    const old = summary.processes[name];
    if (!old.tested) return [name, old];
    const recs = records.filter((r) => r.process === name);
    return [name, { tested: true, ...processSummary(recs, [first]) }];
  }));
  const overview = buildOverview(records, widths, criteria, issues, decisions);
  // The page counts come from the page records of today: a person can remove the records of addresses that are not pages of the site.
  const { pages_out_of_scope: _old, pages_not_opened: _unknown, ...kept } = summary.coverage || {};
  // The page counts first, then the other parts, as the audit writes them: a refresh with no new answer gives the same file.
  const pageCounts = pageCoverage(records);
  const coverage = { ...pageCounts, ...kept, ...pageCounts };
  // The engine of the refresh can be newer than the engine of the run: the hashes, the items, and the statuses come from it, so the
  // summary and the report name it. A refresh with the engine of the run adds nothing: it writes the same files. Since 1.3.8.
  type Versions = { engine: string; axe_core: string; browser: string; refreshed_with?: string; refreshed_on?: string };
  const { refreshed_with: _rw, refreshed_on: _ro, ...runVersions } = versions as Versions;
  const refreshedVersions: Versions = ENGINE_VERSION === runVersions.engine ? runVersions
    : { ...runVersions, refreshed_with: ENGINE_VERSION, refreshed_on: versions.refreshed_with === ENGINE_VERSION && versions.refreshed_on ? versions.refreshed_on : new Date().toISOString().slice(0, 10) };
  const newSummary = { ...summary, versions: refreshedVersions, counts, coverage, criteria, processes, overview };
  updateHistoryLine(outDir, run, { counts, overview: historyOverview(overview) });
  const byPage = issuesByPage(issues as { id: string; examples: { url: string }[] }[]);
  const pageFiles = records.map((p) => pageFileOf(p, run, p.process ? [first] : widths, decisions, byPage, config.site.url));
  const processRuns = processNames.map((name) => ({ name, tested: !!summary.processes[name].tested, reason: summary.processes[name].reason, records: records.filter((r) => r.process === name), steps: 0, renders: 0 }));
  // The parts of the report that come from the crawl: the audit wrote them to the run folder. A run of 1.3.1 or older has no such file.
  const dataPath = join(runDir, "report-data.json");
  let reportData: ReportData = { differences: [], skipped: [] };
  try { if (existsSync(dataPath)) reportData = { ...reportData, ...JSON.parse(readFileSync(dataPath, "utf8")) }; } catch { /* a broken file: the report has no crawl parts */ }
  const report = renderReport({ config, run, date, versions: refreshedVersions, criteria, issues, questions, questionsNotChecked: allQuestions.length - questions.length, pages, processes: processRuns, statesTested: summary.coverage?.states_tested || 0, coverage, ...reportData, decisions, durationSeconds: previous?.duration_seconds || 0, renders: previous?.renders || 0, budgetReached: coverage.budget_reached || [], overview, history: readHistory(outDir) });
  writeResults(outDir, { config, summary: newSummary, pages: pageFiles, issues, questions: allQuestions, history: null, report, run, outcomes: null });
  log(`refreshed: ${issues.filter((i) => ["new", "open", "reopened"].includes(i.status)).length} issues, ${questions.length} questions`);
  return { run, issues: issues.length, questions: questions.length };
}
