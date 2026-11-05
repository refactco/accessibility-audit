// The results: the result of each criterion on each unit, the roll-up, and the coverage. See PLAN.md section 7.2.
import { CRITERIA, CRITERIA_BY_ID, unitDefinition } from "./criteria.ts";
import { pageKey } from "./crawl.ts";
import { decisionFor, type Decision } from "./decide.ts";
import { RESULT_ORDER, inScope, notOpened, type Outcome, type PageRecord, type UnitResult } from "./types.ts";

export function rollUp(results: UnitResult[]): UnitResult {
  for (const r of RESULT_ORDER) if (results.includes(r)) return r;
  return "not tested";
}

/** The result of one criterion on one unit: a page at one width. An answered question counts as its answer. A decision of a person
 *  gives "passed" or "not applicable", unless a rule or an answer failed the unit. */
export function unitResult(page: PageRecord, width: number, criterion: string, decisions: Decision[] = []): UnitResult {
  const c = CRITERIA_BY_ID.get(criterion);
  if (!c) return "not tested";
  const tested = page.tested && page.testedCriteria[width]?.has(criterion);
  const outcomes = page.outcomes.filter((o) => o.criterion === criterion && o.width === width && o.answer !== "no issue" && o.answer !== "not applicable");
  if (outcomes.some((o) => o.kind === "failed" || o.answer === "issue")) return "failed";
  const decision = decisions.length ? decisionFor(decisions, criterion, page.url, page.content_hash) : null;
  if (decision) return decision.result;
  if (outcomes.some((o) => o.kind === "cantTell")) return "needs review";
  // A candidate goes to the AI too, since 2026-10-14. "Needs a person" stays for a question that only a person answers.
  if (outcomes.some((o) => o.kind === "candidate" && o.decider === "person")) return "needs a person";
  if (outcomes.some((o) => o.kind === "candidate")) return "needs review";
  if (!tested) return "not tested";
  // A test ran and found nothing. A criterion whose finder is not reliable, or that needs a person, gets "no content found".
  if (c.method === "person" || !c.finder_reliable) return "no content found";
  return "no issue found";
}

export function pageResults(page: PageRecord, widths: number[], decisions: Decision[] = []): Record<string, Record<string, UnitResult>> {
  const out: Record<string, Record<string, UnitResult>> = {};
  for (const w of widths) {
    out[String(w)] = {};
    for (const c of CRITERIA) out[String(w)][c.id] = unitResult(page, w, c.id, decisions);
  }
  return out;
}

export interface CriterionSummary {
  result: UnitResult; method: "auto" | "auto+review" | "person";
  coverage: { tested_units: number; all_units: number; definition: "page" | "template" | "site" | "process"; process_units?: { tested: number; all: number } };
  issues: number; open_questions: number; ai_only_answers: number;
}

/** pages: the crawled pages and the process pages together. processes: how many the settings have, and how many the audit tested. */
export function siteSummary(pages: PageRecord[], widths: number[], processes: { all: number; tested: number }, issueCounts: Map<string, number>, questionCounts: Map<string, number>, aiOnly: Map<string, number> = new Map(), decisions: Decision[] = []): Record<string, CriterionSummary> {
  const out: Record<string, CriterionSummary> = {};
  // An address that is not a page of the site, for example a broken link or a redirect to another site, is not a unit.
  const crawled = pages.filter((p) => !p.process && inScope(p));
  const tested = crawled.filter((p) => p.tested);
  const sample = tested.filter((p) => p.sample);
  for (const c of CRITERIA) {
    const results: UnitResult[] = [];
    for (const p of pages) if (inScope(p)) for (const w of widths) results.push(unitResult(p, w, c.id, decisions));
    const definition = unitDefinition(c.id);
    let all = 0, done = 0;
    if (definition === "page") { all = crawled.length * widths.length; done = tested.reduce((n, p) => n + widths.filter((w) => p.testedCriteria[w]?.has(c.id)).length, 0); }
    else if (definition === "template") { all = sample.length * widths.length + (crawled.length - tested.length) * widths.length; done = sample.reduce((n, p) => n + widths.filter((w) => p.testedCriteria[w]?.has(c.id)).length, 0); }
    else if (definition === "site") { all = 1; done = tested.some((p) => widths.some((w) => p.testedCriteria[w]?.has(c.id))) ? 1 : 0; }
    else { all = processes.all; done = processes.tested; }
    // A criterion that the processes also test, for example 3.3.1 on staging: the steps of the processes are units too.
    // They stay apart from the units of the definition, so that the report names both.
    let processUnits: { tested: number; all: number } | undefined;
    if (definition !== "process" && c.test_groups.includes("process")) {
      processUnits = { tested: 0, all: 0 };
      for (const p of pages) if (p.process) for (const w of widths) if (p.testedCriteria[w]) { processUnits.all++; if (p.testedCriteria[w].has(c.id)) processUnits.tested++; }
      if (!processUnits.all) processUnits = undefined;
    }
    const anyDone = done + (processUnits?.tested || 0);
    out[c.id] = { result: anyDone === 0 && definition !== "process" ? rollUp(results.filter((r) => r !== "not tested")) === "not tested" ? "not tested" : rollUp(results) : rollUp(results), method: c.method,
      coverage: { tested_units: done, all_units: all, definition, ...(processUnits ? { process_units: processUnits } : {}) }, issues: issueCounts.get(c.id) || 0, open_questions: questionCounts.get(c.id) || 0, ai_only_answers: aiOnly.get(c.id) || 0 };
    if (definition === "process" && processes.all === 0) out[c.id].result = rollUp(results);
  }
  return out;
}

/** The result of one process: the roll-up of its pages, and the result of each criterion. */
export function processSummary(records: PageRecord[], widths: number[]): { result: UnitResult; criteria: Record<string, UnitResult> } {
  const criteria: Record<string, UnitResult> = {};
  for (const c of CRITERIA) {
    const results: UnitResult[] = [];
    for (const p of records) for (const w of widths) if (p.testedCriteria[w]) results.push(unitResult(p, w, c.id));
    criteria[c.id] = rollUp(results);
  }
  return { result: rollUp(Object.values(criteria)), criteria };
}

export function outcomesOf(pages: PageRecord[]): Outcome[] {
  return pages.flatMap((p) => p.outcomes);
}

/** The page counts of the coverage. pages_found counts the pages of the site only: an address that is not a page of the site,
 *  for example a broken link, a redirect to another site, a file, or a blocked page, is in pages_out_of_scope with its reason. */
/** The page counts. pages_found: the pages of the site that the audit opened, or that a quick request found. pages_not_opened: the
 *  addresses that a budget or a stop left with no request, so nothing is known about them. pages_out_of_scope: the addresses that are
 *  not pages of the site. */
export function pageCoverage(pages: PageRecord[]): { pages_found: number; pages_tested: number; pages_not_tested: number; pages_in_sample: number; pages_not_opened?: number; pages_out_of_scope?: Record<string, number> } {
  const crawled = pages.filter((p) => !p.process);
  const found = crawled.filter((p) => inScope(p) && !notOpened(p));
  const tested = found.filter((p) => p.tested);
  const unknown = crawled.filter(notOpened).length;
  const out: Record<string, number> = {};
  for (const p of crawled) if (!inScope(p)) out[p.not_tested_reason!] = (out[p.not_tested_reason!] || 0) + 1;
  return { pages_found: found.length, pages_tested: tested.length, pages_not_tested: found.length - tested.length, pages_in_sample: tested.filter((p) => p.sample).length, ...(unknown ? { pages_not_opened: unknown } : {}), ...(Object.keys(out).length ? { pages_out_of_scope: out } : {}) };
}

/** One line of pages.jsonl. The issues of a page match by the key of the page, so that the same path on two hosts stays apart. */
export function pageFileOf(p: PageRecord, run: string, widths: number[], decisions: Decision[], issuesByKey: Map<string, string[]>, siteUrl: string): Record<string, unknown> {
  return {
    schema: "page/1", url: p.url, template: p.template, set: p.set, sample: p.sample, process: p.process || null, states: p.states, run, tested: p.tested,
    // The reason of the sample and the title, for the page list of the report: a refresh writes it from this file.
    ...(p.sample && p.sampleReason ? { sample_reason: p.sampleReason } : {}), ...(p.title ? { title: p.title } : {}),
    ...(p.not_tested_reason ? { not_tested_reason: p.not_tested_reason } : {}), ...(p.http_status ? { http_status: p.http_status } : {}),
    ...(p.redirects_to ? { redirects_to: p.redirects_to } : {}), ...(p.linked_from?.length ? { linked_from: p.linked_from } : {}),
    ...(p.found_in ? { found_in: p.found_in } : {}), ...(p.widths_not_loaded?.length ? { widths_not_loaded: p.widths_not_loaded } : {}),
    ...(p.content_hash ? { content_hash: p.content_hash } : {}),
    // The widths where the load event did not come in time: the page is tested as it was. A refresh gives them to the report again.
    ...(Array.isArray(p.facts?.loadIncomplete) && (p.facts.loadIncomplete as number[]).length ? { load_incomplete: p.facts.loadIncomplete } : {}),
    ...(Array.isArray(p.facts?.stylesMissing) && (p.facts.stylesMissing as string[]).length ? { styles_missing: p.facts.stylesMissing } : {}),
    results: pageResults(p, widths, decisions), issues: issuesByKey.get(pageKey(siteUrl, p.url)) || [],
  };
}

/** The IDs of the issues by the key of each page of their examples. */
export function issuesByPage(issues: { id: string; examples: { url: string }[] }[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const i of issues) for (const key of new Set(i.examples.map((e) => e.url))) out.set(key, [...(out.get(key) || []), i.id]);
  return out;
}
