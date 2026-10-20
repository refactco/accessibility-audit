// The results: the result of each criterion on each unit, the roll-up, and the coverage. See PLAN.md section 7.2.
import { CRITERIA, CRITERIA_BY_ID, unitDefinition } from "./criteria.ts";
import { pathOf } from "./crawl.ts";
import { decisionFor, type Decision } from "./decide.ts";
import { RESULT_ORDER, type Outcome, type PageRecord, type UnitResult } from "./types.ts";

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
  const decision = decisions.length ? decisionFor(decisions, criterion, pathOf(page.url), page.content_hash) : null;
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
  coverage: { tested_units: number; all_units: number; definition: "page" | "template" | "site" | "process" };
  issues: number; open_questions: number; ai_only_answers: number;
}

/** pages: the crawled pages and the process pages together. processes: how many the settings have, and how many the audit tested. */
export function siteSummary(pages: PageRecord[], widths: number[], processes: { all: number; tested: number }, issueCounts: Map<string, number>, questionCounts: Map<string, number>, aiOnly: Map<string, number> = new Map(), decisions: Decision[] = []): Record<string, CriterionSummary> {
  const out: Record<string, CriterionSummary> = {};
  const crawled = pages.filter((p) => !p.process);
  const tested = crawled.filter((p) => p.tested);
  const sample = tested.filter((p) => p.sample);
  for (const c of CRITERIA) {
    const results: UnitResult[] = [];
    for (const p of pages) for (const w of widths) results.push(unitResult(p, w, c.id, decisions));
    const definition = unitDefinition(c.id);
    let all = 0, done = 0;
    if (definition === "page") { all = crawled.length * widths.length; done = tested.reduce((n, p) => n + widths.filter((w) => p.testedCriteria[w]?.has(c.id)).length, 0); }
    else if (definition === "template") { all = sample.length * widths.length + (crawled.length - tested.length) * widths.length; done = sample.reduce((n, p) => n + widths.filter((w) => p.testedCriteria[w]?.has(c.id)).length, 0); }
    else if (definition === "site") { all = 1; done = tested.some((p) => widths.some((w) => p.testedCriteria[w]?.has(c.id))) ? 1 : 0; }
    else { all = processes.all; done = processes.tested; }
    out[c.id] = { result: done === 0 && definition !== "process" ? rollUp(results.filter((r) => r !== "not tested")) === "not tested" ? "not tested" : rollUp(results) : rollUp(results), method: c.method,
      coverage: { tested_units: done, all_units: all, definition }, issues: issueCounts.get(c.id) || 0, open_questions: questionCounts.get(c.id) || 0, ai_only_answers: aiOnly.get(c.id) || 0 };
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
