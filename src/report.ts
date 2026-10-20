// The report for people, in Markdown.
import { CRITERIA } from "./criteria.ts";
import { pathOf } from "./crawl.ts";
import type { Config } from "./config.ts";
import { effectiveAnswer, type Decision } from "./decide.ts";
import type { IssueFile, QuestionFile } from "./issues.ts";
import type { ProcessRun } from "./process.ts";
import type { CriterionSummary } from "./results.ts";
import type { PageRecord } from "./types.ts";
import { renderOverviewMarkdown, type HistoryPoint, type Overview } from "./overview.ts";

export interface TemplateDifference { template: string; example: string; page: string; onlyInPage: string[]; onlyInExample: string[] }

export interface ReportInput {
  config: Config; run: string; date: string; versions: { engine: string; axe_core: string; browser: string };
  criteria: Record<string, CriterionSummary>; issues: IssueFile[]; questions: QuestionFile[]; pages: PageRecord[];
  processes: ProcessRun[]; differences: TemplateDifference[]; statesTested: number; decisions: Decision[];
  skipped: { url: string; reason: string }[]; durationSeconds: number; renders: number; budgetReached: string[];
  overview?: Overview; history?: HistoryPoint[];
}

export function renderReport(r: ReportInput): string {
  const lines: string[] = [];
  const tested = r.pages.filter((p) => p.tested);
  const counts = (status: string) => r.issues.filter((i) => i.status === status).length;
  lines.push(`# Accessibility audit of ${r.config.site.url}\n`);
  lines.push(`Run ${r.run}, ${r.config.site.environment}, WCAG 2.2 AA. Engine ${r.versions.engine}, axe-core ${r.versions.axe_core}, ${r.versions.browser}. ${Math.round(r.durationSeconds)} seconds, ${r.renders} renders.\n`);
  lines.push(`## Summary\n`);
  const results = Object.values(r.criteria).map((c) => c.result);
  const count = (x: string) => results.filter((v) => v === x).length;
  lines.push(`| Pages found | Pages tested | In the sample | States | Processes | Issues new | Issues open | Resolved | Questions for the AI | Questions for a person |\n|---|---|---|---|---|---|---|---|---|---|`);
  lines.push(`| ${r.pages.length} | ${tested.length} | ${tested.filter((p) => p.sample).length} | ${r.statesTested} | ${r.processes.filter((p) => p.tested).length} of ${r.processes.length} | ${counts("new")} | ${counts("open") + counts("reopened")} | ${counts("resolved")} | ${r.questions.filter((q) => q.kind === "review" && !q.ai_answer).length} | ${r.questions.filter((q) => q.kind === "person" && !q.person_answer).length} |\n`);
  lines.push(`Criteria: ${count("failed")} failed, ${count("needs review")} need a review, ${count("needs a person")} need a person, ${count("no issue found")} with no issue found, ${count("no content found")} with no content found, ${count("not tested")} not tested, ${count("passed")} passed, ${count("not applicable")} not applicable.\n`);
  if (r.budgetReached.length) lines.push(`The audit reached a budget: ${r.budgetReached.join(", ")}. The pages that it did not test are in the page list.\n`);
  lines.push(`A result "no issue found" means that the tests ran and found nothing. It is not a pass. Only a person gives "passed". A result "no content found" means that the engine found no content of that type, and the engine can miss content.\n`);
  if (r.overview) lines.push(...renderOverviewMarkdown(r.overview, r.history || []));

  lines.push(`## The 55 criteria\n`);
  lines.push(`| Criterion | Level | Result | Method | Coverage | Issues | Open questions |\n|---|---|---|---|---|---|---|`);
  for (const c of CRITERIA) {
    const s = r.criteria[c.id];
    const q = r.questions.filter((x) => x.criterion === c.id && !x.person_answer && !(x.ai_answer && x.ai_answer.value !== "unsure")).length;
    lines.push(`| ${c.id} ${c.name} | ${c.level} | ${s.result} | ${s.method} | ${s.coverage.tested_units} of ${s.coverage.all_units} ${s.coverage.definition} units | ${s.issues} | ${q} |`);
  }
  lines.push("");

  const open = r.issues.filter((i) => ["new", "open", "reopened"].includes(i.status));
  lines.push(`## Issues (${open.length})\n`);
  if (!open.length) lines.push("No issue with the certainty fail.\n");
  for (const i of open) {
    lines.push(`### ${i.id}: ${i.summary}\n`);
    lines.push(`- Criterion ${i.wcag.criterion}, severity ${i.severity}, certainty ${i.certainty}, status ${i.status}. Rule \`${i.rule.id}\` of ${i.rule.engine}.`);
    lines.push(`- Reach: ${i.reach.pages} pages, ${i.reach.occurrences} occurrences, widths ${i.reach.widths.join(", ")}${i.reach.templates.length ? ", templates " + i.reach.templates.join(", ") : ""}.`);
    const ex = i.examples[0];
    if (ex) lines.push(`- Example: ${ex.url} at ${ex.width} px${ex.state && ex.state.length ? ", state: " + ex.state.join(" > ") : ""}, \`${ex.selector}\`${ex.html ? ": `" + ex.html.replace(/`/g, "'").slice(0, 160) + "`" : ""}.`);
    lines.push(`- Solution: ${i.solution.summary} ${i.solution.steps.join(" ")}`);
    lines.push(`- Origin: ${i.origin}. ${i.source.length ? "Source: " + i.source.map((s: Record<string, unknown>) => s.file || s.item).join(", ") : "The skill finds the source file."}\n`);
  }
  const resolved = r.issues.filter((i) => i.status === "resolved" && i.status_by.run === r.run);
  if (resolved.length) lines.push(`${resolved.length} issues are resolved in this audit: ${resolved.map((i) => i.id + (i.status_by.reason === "rule changed" ? " (rule changed)" : "")).join(", ")}.\n`);
  const notChecked = r.issues.filter((i) => i.status === "not checked");
  if (notChecked.length) lines.push(`${notChecked.length} issues are not checked, because the audit did not test all their pages: ${notChecked.map((i) => i.id).join(", ")}.\n`);
  const replaced = r.issues.filter((i) => i.replaces);
  if (replaced.length) lines.push(`${replaced.length} new issues replace an older issue after a change of the markup: ${replaced.map((i) => i.id + " replaces " + i.replaces).join(", ")}.\n`);
  const decided = r.issues.filter((i) => i.status === "accepted" || i.status === "dismissed");
  if (decided.length) lines.push(`${decided.length} issues are accepted or dismissed: ${decided.map((i) => i.id + " (" + i.status + ")").join(", ")}.\n`);

  // The answers: how many the AI gave, how many wait for a person, and how often the AI and the person agree.
  const aiAnswered = r.questions.filter((q) => q.ai_answer && q.ai_answer.value !== "unsure");
  const forPerson = r.questions.filter((q) => q.kind === "review" && !q.person_answer && !q.facts_check && !q.verification && (q.sample || (q.ai_answer && q.ai_answer.value === "unsure")));
  // A person agrees with the AI by the same answer, or by a confirmation of the facts of the AI answer.
  const both = r.questions.filter((q) => q.ai_answer && q.ai_answer.value !== "unsure" && ((q.person_answer && q.person_answer.value !== "not applicable") || q.facts_check));
  const agree = both.filter((q) => (q.person_answer && q.ai_answer.value === q.person_answer.value) || (!q.person_answer && q.facts_check?.result === "confirmed")).length;
  const wrongFacts = r.questions.filter((q) => q.facts_check?.result === "wrong" && !q.person_answer);
  const verified = r.questions.filter((q) => q.verification);
  const agreed = verified.filter((q) => q.verification.agrees);
  const unresolved = r.questions.filter((q) => q.kind === "review" && effectiveAnswer(q).unresolved);
  const unverified = r.questions.filter((q) => q.kind === "review" && effectiveAnswer(q).by === "ai");
  lines.push(`## Answers\n`);
  lines.push(`The AI answered ${aiAnswered.length} questions, and a person answered ${r.questions.filter((q) => q.person_answer).length}. The verifier, a second independent AI pass, checked ${verified.length} and agreed on ${agreed.length}. ${unresolved.length} questions are unresolved: the two AI answers differ, or one is unsure. ${unverified.length} answers count on the first AI answer alone, with no verification yet.${both.length ? ` On the ${both.length} questions that a person checked, the AI and the person agree on ${agree}.` : ""}${wrongFacts.length ? ` ${wrongFacts.length} questions go back to the AI, because a person found a fact wrong: ${wrongFacts.map((q) => q.id).join(", ")}.` : ""}\n`);
  if (unresolved.length) lines.push(`Unresolved: ${unresolved.slice(0, 40).map((q) => `${q.id} (${q.criterion}, AI ${q.ai_answer?.value}, verifier ${q.verification?.value || "none"})`).join("; ")}.\n`);
  for (const q of forPerson.slice(0, 40)) lines.push(`- ${q.id} (${q.criterion}, ${q.pages} pages): ${q.question}${q.ai_answer ? " AI: " + q.ai_answer.value + ", " + q.ai_answer.confidence + " confidence, " + q.ai_answer.reason : ""}`);
  if (forPerson.length) lines.push("");
  if (r.decisions.length) lines.push(`${r.decisions.length} decisions of a person give "passed" or "not applicable" for a scope. The last: ${r.decisions.slice(-5).map((d) => `${d.criterion} ${d.result} on ${Object.keys(d.scope.pages || {}).length} pages by ${d.by}`).join("; ")}.\n`);
  const reviews = r.questions.filter((q) => q.kind === "review");
  const persons = r.questions.filter((q) => q.kind === "person");
  lines.push(`## Review questions for the AI (${reviews.length})\n`);
  for (const q of reviews) lines.push(`- ${q.id} (${q.criterion}, ${q.pages} pages): ${q.question} Evidence: ${q.evidence.url}, \`${q.evidence.selector}\`.${q.ai_answer ? " AI: " + q.ai_answer.value + "." : ""}${q.person_answer ? " Person: " + q.person_answer.value + "." : ""}`);
  lines.push("");
  lines.push(`## Checks for a person (${persons.length})\n`);
  for (const q of persons) lines.push(`- ${q.id} (${q.criterion}, ${q.pages} pages): ${q.question} Where: ${q.evidence.url}, \`${q.evidence.selector}\`. Steps: ${(q.steps || []).join(" ")}${q.person_answer ? " Answer: " + q.person_answer.value + "." : ""}`);
  lines.push("");

  if (r.processes.length) {
    lines.push(`## Processes (${r.processes.length})\n`);
    for (const p of r.processes) {
      if (!p.tested) { lines.push(`- ${p.name}: not tested. ${p.reason}`); continue; }
      const failed = new Set(p.records.flatMap((rec) => rec.outcomes.filter((o) => o.kind === "failed").map((o) => o.criterion)));
      lines.push(`- ${p.name}: ${p.steps} steps on ${p.records.length} pages, ${p.records.reduce((n, rec) => n + rec.states.length, 0)} states. ${failed.size ? "Failed criteria: " + [...failed].sort().join(", ") + "." : "No issue found."}`);
    }
    lines.push("");
  }

  if (r.differences.length) {
    lines.push(`## Templates with different results\n`);
    lines.push(`A random page of the sample gave template-test results that differ from the example page of its template. The template may need a split.\n`);
    for (const d of r.differences) lines.push(`- Template ${d.template}: ${d.page} differs from ${d.example}.${d.onlyInPage.length ? " Only on the page: " + d.onlyInPage.join(", ") + "." : ""}${d.onlyInExample.length ? " Only on the example: " + d.onlyInExample.join(", ") + "." : ""}`);
    lines.push("");
  }

  lines.push(`## Pages (${r.pages.length})\n`);
  lines.push(`| Page | Template | Tested | Sample | States | Failed criteria | Title |\n|---|---|---|---|---|---|---|`);
  for (const p of r.pages) {
    const failed = new Set(p.outcomes.filter((o) => o.kind === "failed").map((o) => o.criterion));
    lines.push(`| ${pathOf(p.url)} | ${p.template || "-"} | ${p.tested ? "yes" : "no: " + (p.not_tested_reason || "")} | ${p.sample ? p.sampleReason || "yes" : "-"} | ${p.states.length || "-"} | ${[...failed].sort().join(", ") || "-"} | ${(p.title || "").replace(/\|/g, "/").slice(0, 60)} |`);
  }
  if (r.skipped.length) {
    lines.push(`\n${r.skipped.length} addresses were not crawled: ${[...new Set(r.skipped.map((s) => s.reason))].map((reason) => reason + " (" + r.skipped.filter((s) => s.reason === reason).length + ")").join(", ")}.`);
  }
  lines.push("");
  return lines.join("\n");
}
