// The accessibility overview: the numbers for people, as honest measures. WCAG has no score: a page conforms to a level or not.
// An unknown unit is not a pass, and a tool measure is not a conformance claim. The overview goes into the summary, the history,
// the report, and the review page.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CRITERIA } from "./criteria.ts";
import type { Decision } from "./decide.ts";
import type { IssueFile } from "./issues.ts";
import { unitResult, type CriterionSummary } from "./results.ts";
import type { PageRecord, Severity, UnitResult } from "./types.ts";
import { validate } from "./write.ts";

export interface LevelOverview {
  criteria: { all: number; met: number; failed: number; unknown: number; no_content: number; not_tested: number };
  units: { tested: number; met: number; no_content: number; failed: number; unknown: number; share_no_failure: number; share_failed: number; share_unknown: number };
  pages: { all: number; no_failure: number; share: number };
}
export interface Overview {
  definition: string;
  levels: { A: LevelOverview; AA: LevelOverview };
  issues: { open: number; by_severity: Record<Severity, number>; by_certainty: { fail: number; ai_fail: number } };
  score: { value: number; definition: string };
}
export interface HistoryPoint { run: string; date: string; kind: string; counts: Record<string, number>; overview?: { share_no_failure_A: number; share_no_failure_AA: number; open_issues: number } }

const MET = new Set<UnitResult>(["no issue found", "passed", "not applicable"]);
const UNKNOWN = new Set<UnitResult>(["needs review", "needs a person"]);
const OPEN = new Set(["new", "open", "reopened"]);
const SEVERITIES: Severity[] = ["critical", "serious", "moderate", "minor"];

export const OVERVIEW_DEFINITION = "A tool measure of this audit, not a conformance claim: WCAG has no score, and a page conforms to a level or not. A unit is one page at one width for one criterion. The share with no failure counts the units where the tests found nothing, and the units with no content of that type. An unknown unit waits for an answer or for a person: it is not a pass. Level AA counts the criteria of levels A and AA together.";
export const SCORE_DEFINITION = "The share of the tested units of levels A and AA with no failure found, from 0 to 100. The same number as the level AA bar. It is a tool measure, not a conformance claim, and a site with no issue found is not proven accessible.";

const share = (n: number, all: number) => (all ? Math.round((n / all) * 1000) / 10 : 0);

function levelOverview(ids: string[], pages: PageRecord[], widths: number[], criteria: Record<string, CriterionSummary>, decisions: Decision[]): LevelOverview {
  const c = { all: ids.length, met: 0, failed: 0, unknown: 0, no_content: 0, not_tested: 0 };
  for (const id of ids) {
    const r = criteria[id]?.result;
    if (!r || r === "not tested") c.not_tested++; else if (r === "failed") c.failed++; else if (MET.has(r)) c.met++; else if (UNKNOWN.has(r)) c.unknown++; else c.no_content++;
  }
  const u = { tested: 0, met: 0, no_content: 0, failed: 0, unknown: 0, share_no_failure: 0, share_failed: 0, share_unknown: 0 };
  let noFailure = 0;
  for (const p of pages) {
    let failedHere = false;
    for (const w of widths) for (const id of ids) {
      const r = unitResult(p, w, id, decisions);
      if (r === "not tested") continue;
      u.tested++;
      if (r === "failed") { u.failed++; failedHere = true; } else if (MET.has(r)) u.met++; else if (UNKNOWN.has(r)) u.unknown++; else u.no_content++;
    }
    if (!failedHere) noFailure++;
  }
  u.share_no_failure = share(u.met + u.no_content, u.tested); u.share_failed = share(u.failed, u.tested); u.share_unknown = share(u.unknown, u.tested);
  return { criteria: c, units: u, pages: { all: pages.length, no_failure: noFailure, share: share(noFailure, pages.length) } };
}

/** The overview of one run, from the tested pages (not the process pages), the roll-up of the criteria, and the issues. */
export function buildOverview(pages: PageRecord[], widths: number[], criteria: Record<string, CriterionSummary>, issues: IssueFile[], decisions: Decision[] = []): Overview {
  const tested = pages.filter((p) => p.tested && !p.process);
  const a = CRITERIA.filter((c) => c.level === "A").map((c) => c.id);
  const aa = CRITERIA.map((c) => c.id);
  const levels = { A: levelOverview(a, tested, widths, criteria, decisions), AA: levelOverview(aa, tested, widths, criteria, decisions) };
  const open = issues.filter((i) => OPEN.has(i.status));
  const by_severity = Object.fromEntries(SEVERITIES.map((s) => [s, open.filter((i) => i.severity === s).length])) as Record<Severity, number>;
  return {
    definition: OVERVIEW_DEFINITION, levels,
    issues: { open: open.length, by_severity, by_certainty: { fail: open.filter((i) => i.certainty === "fail").length, ai_fail: open.filter((i) => i.certainty === "ai fail").length } },
    score: { value: levels.AA.units.share_no_failure, definition: SCORE_DEFINITION },
  };
}

/** The part of the overview that the history keeps for each run. */
export function historyOverview(o: Overview): NonNullable<HistoryPoint["overview"]> {
  return { share_no_failure_A: o.levels.A.units.share_no_failure, share_no_failure_AA: o.levels.AA.units.share_no_failure, open_issues: o.issues.open };
}

export function readHistory(outDir: string): HistoryPoint[] {
  const path = join(outDir, "history.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

/** A refresh of the same run puts its counts and its overview into the history line of that run. The history stays one line for each run. */
export function updateHistoryLine(outDir: string, run: string, patch: Record<string, unknown>): void {
  const path = join(outDir, "history.jsonl");
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  let changed = false;
  for (const line of lines) if (line.run === run) { Object.assign(line, patch); validate("history/1", line); changed = true; }
  if (changed) writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
}

const pct = (n: number) => `${n}%`;

/** The overview section of the report. */
export function renderOverviewMarkdown(o: Overview, history: HistoryPoint[]): string[] {
  const lines: string[] = [];
  lines.push(`## Accessibility overview\n`);
  lines.push(`${o.definition}\n`);
  lines.push(`| Level | Units with no failure | Failed | Unknown | Criteria met | Failed | Unknown | No content | Not tested | Pages with no failure |\n|---|---|---|---|---|---|---|---|---|---|`);
  for (const [name, l] of [["A", o.levels.A], ["AA, with A", o.levels.AA]] as const) {
    lines.push(`| ${name} | ${pct(l.units.share_no_failure)} of ${l.units.tested.toLocaleString("en-US")} | ${pct(l.units.share_failed)} | ${pct(l.units.share_unknown)} | ${l.criteria.met} of ${l.criteria.all} | ${l.criteria.failed} | ${l.criteria.unknown} | ${l.criteria.no_content} | ${l.criteria.not_tested} | ${pct(l.pages.share)} (${l.pages.no_failure} of ${l.pages.all}) |`);
  }
  lines.push("");
  const sev = o.issues.by_severity;
  lines.push(`Open issues: ${o.issues.open}. By severity: ${sev.critical} critical, ${sev.serious} serious, ${sev.moderate} moderate, ${sev.minor} minor. By certainty: ${o.issues.by_certainty.fail} from the rules or a person, ${o.issues.by_certainty.ai_fail} from two AI answers that agree.\n`);
  lines.push(`Score: ${o.score.value} of 100. ${o.score.definition}\n`);
  const points = history.filter((h) => h.overview);
  if (points.length) {
    lines.push(`The runs with an overview:\n`);
    lines.push(`| Run | Level A, no failure | Level AA, no failure | Open issues | New | Resolved |\n|---|---|---|---|---|---|`);
    for (const h of points.slice(-12)) lines.push(`| ${h.run} | ${pct(h.overview!.share_no_failure_A)} | ${pct(h.overview!.share_no_failure_AA)} | ${h.overview!.open_issues} | ${h.counts?.new ?? "-"} | ${h.counts?.resolved ?? "-"} |`);
    lines.push("");
  }
  return lines;
}
