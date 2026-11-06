// The report for people, in Markdown.
import { CRITERIA } from "./criteria.ts";
import { pageKey } from "./crawl.ts";
import type { Config } from "./config.ts";
import { effectiveAnswer, type Decision } from "./decide.ts";
import type { IssueFile, QuestionFile } from "./issues.ts";
import type { ProcessRun } from "./process.ts";
import { countIssues, type CriterionSummary } from "./results.ts";
import { inScope, notOpened, type PageRecord } from "./types.ts";
import { renderOverviewMarkdown, type HistoryPoint, type Overview } from "./overview.ts";

export interface TemplateDifference { template: string; example: string; page: string; onlyInPage: string[]; onlyInExample: string[] }

/** The parts of the report that come from the crawl. The audit writes them to runs/<run>/report-data.json, and a refresh reads them. */
export interface ReportData {
  differences: TemplateDifference[];
  skipped: { url: string; reason: string }[];
  /** The addresses that the audit did not open, by the source that gave them. */
  notOpenedBySource?: { settings: number; sources: number; links: number };
  /** The pages that a budget left after the quick check found them, by source and by section. */
  budgetLeft?: { count: number; bySource: { settings: number; sources: number; links: number }; bySection: Record<string, number> };
  /** How each address group with a limit chose its addresses. */
  groupChoices?: { pattern: string; order: string; chosen: number; found: number }[];
  /** The pages of earlier issues and questions that the crawl did not find: the count of the gone pages, and the pages that still
   *  answer. Since 1.3.3. */
  earlierPages?: { gone: number; found: string[] };
}

export interface ReportInput extends ReportData {
  config: Config; run: string; date: string; versions: { engine: string; axe_core: string; browser: string };
  criteria: Record<string, CriterionSummary>; issues: IssueFile[]; questions: QuestionFile[]; pages: PageRecord[];
  processes: ProcessRun[]; statesTested: number; decisions: Decision[];
  durationSeconds: number; renders: number; budgetReached: string[];
  overview?: Overview; history?: HistoryPoint[];
  /** The coverage of the summary: the state phase. */
  coverage?: Record<string, any>;
  /** The old questions that stay with their answers, because this run did not test their pages. */
  questionsNotChecked?: number;
}

/** A guess at the cause of a broken link from its address: an email address or a web address with no scheme, or a mailto with a typo. */
export function brokenLinkHint(url: string): string | null {
  let path: string;
  try { path = decodeURIComponent(new URL(url).pathname); } catch { return null; }
  const last = path.replace(/\/+$/, "").split("/").pop() || "";
  if (/mail\s*to:/i.test(path)) return "a mailto: link with a typo";
  if (/^[^@\s/]+@[^@\s/]+\.[a-z]{2,}$/i.test(last)) return "an email address with no mailto:";
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|edu|gov|io|co|us|uk|ca|de|fr|ru|info|biz|me)$/i.test(last)) return "a web address with no https://";
  return null;
}

export function renderReport(r: ReportInput): string {
  const lines: string[] = [];
  const site = r.config.site.url;
  const key = (u: string) => pageKey(site, u);
  const crawled = r.pages.filter(inScope);
  const found = crawled.filter((p) => !notOpened(p));
  const unopened = crawled.filter(notOpened);
  const outside = r.pages.filter((p) => !inScope(p));
  const tested = crawled.filter((p) => p.tested);
  // The counts of summary.json. A new issue that replaces an issue that this run resolved counts in neither column: the line of the
  // replaced issues names the pairs.
  const n = countIssues(r.issues, r.run);
  const replacedIds = new Set(r.issues.filter((i) => i.status === "new" && i.replaces).map((i) => i.replaces));
  // The issues that this run resolved, for any reason, but not the replaced ones. The resolutions of older runs are not of this run.
  const resolved = r.issues.filter((i) => i.status === "resolved" && i.status_by.run === r.run && !replacedIds.has(i.id));
  lines.push(`# Accessibility audit of ${r.config.site.url}\n`);
  lines.push(`Run ${r.run}, ${r.config.site.environment}, WCAG 2.2 AA. Engine ${r.versions.engine}, axe-core ${r.versions.axe_core}, ${r.versions.browser}. ${Math.round(r.durationSeconds)} seconds, ${r.renders} renders.\n`);
  lines.push(`## Summary\n`);
  const results = Object.values(r.criteria).map((c) => c.result);
  const count = (x: string) => results.filter((v) => v === x).length;
  lines.push(`| Pages found | Pages tested | In the sample | States | Processes | Issues new | Issues open | Resolved | Questions for the AI | Questions for a person |\n|---|---|---|---|---|---|---|---|---|---|`);
  lines.push(`| ${found.length} | ${tested.length} | ${tested.filter((p) => p.sample).length} | ${r.statesTested} | ${r.processes.filter((p) => p.tested).length} of ${r.processes.length} | ${n.new} | ${n.open + n.reopened} | ${n.resolved + n.resolved_rule_changed} | ${r.questions.filter((q) => q.kind === "review" && !q.ai_answer).length} | ${r.questions.filter((q) => q.kind === "person" && !q.person_answer).length} |\n`);
  lines.push(`Criteria: ${count("failed")} failed, ${count("needs review")} need a review, ${count("needs a person")} need a person, ${count("no issue found")} with no issue found, ${count("no content found")} with no content found, ${count("not tested")} not tested, ${count("passed")} passed, ${count("not applicable")} not applicable.\n`);
  if (r.budgetReached.length) lines.push(`The audit reached a budget: ${r.budgetReached.join(", ")}. The pages that it did not test are in the page list.\n`);
  const left = r.budgetLeft;
  if (left?.count) {
    const sections = Object.entries(left.bySection).sort((a, b) => b[1] - a[1]);
    lines.push(`${left.count} pages were found but not tested, because a budget came first. From the settings: ${left.bySource.settings}, from the sitemaps and the API: ${left.bySource.sources}, from the links: ${left.bySource.links}. By section: ${sections.slice(0, 10).map(([k, v]) => `${k} ${v}`).join(", ")}${sections.length > 10 ? `, and ${sections.length - 10} more sections` : ""}.\n`);
  }
  const ep = r.earlierPages;
  if (ep && (ep.gone || ep.found.length)) lines.push(`${ep.gone + ep.found.length} pages of earlier issues and questions were not found by the crawl: no sitemap, API, or link gives them now.${ep.gone ? ` ${ep.gone} are gone (404, 410, or a redirect), so their issues are "page removed" and their questions go.` : ""}${ep.found.length ? ` ${ep.found.length} still answer, so their issues and questions stay "not checked": ${ep.found.slice(0, 10).join(", ")}${ep.found.length > 10 ? ", and more" : ""}. Add them to crawl.sample_pages to test them, or remove their results.` : ""}\n`);
  if (r.questionsNotChecked) lines.push(`${r.questionsNotChecked} questions of earlier runs are not checked: this run did not test their pages, or their test runs on the sample only and their pages were not in it. They keep their answers, and they do not count here.\n`);
  if (unopened.length) {
    const by = (reason: string) => unopened.filter((p) => p.not_tested_reason === reason).length;
    const reasons = ["time budget", "page limit", "stopped"].filter((x) => by(x)).map((x) => `${x} ${by(x)}`).join(", ");
    const s = r.notOpenedBySource;
    lines.push(`${unopened.length} addresses were not opened, because a budget or a stop came first (${reasons}). They do not count in the pages found, because nothing is known about them.${s ? ` From the settings: ${s.settings}, from the sitemaps and the API: ${s.sources}, from the links: ${s.links}.` : ""}\n`);
  }
  const c = r.coverage;
  // The states outside the state phase, so that the planned and the tested states of the state phase and the total agree.
  const otherStates = [c?.banner_states_tested ? `${c.banner_states_tested} with the cookie banner open, one for each template` : "", c?.form_states_tested ? `${c.form_states_tested} after a dry submit` : ""].filter(Boolean);
  const otherLine = otherStates.length ? ` Other states: ${otherStates.join(", ")}. ${c?.states_tested} states tested in all.` : "";
  if (c?.states_planned) {
    const notApplied = Object.entries((c.states_not_applied || {}) as Record<string, number>);
    const failed = notApplied.reduce((n, [, v]) => n + v, 0);
    lines.push(`State phase: ${c.states_planned} states planned, ${c.states_planned - failed} tested, ${failed} not applied${notApplied.length ? ": " + notApplied.map(([k, v]) => `${k} ${v}`).join(", ") : ""}. The log names each state that was not applied.${otherLine}\n`);
  } else if (otherLine) lines.push(otherLine.trim() + "\n");
  if (r.groupChoices?.length) lines.push(`Address groups: ${r.groupChoices.map((g) => `${g.pattern} took ${g.chosen} of ${g.found} addresses from the sitemaps and the API, order "${g.order}"`).join("; ")}.\n`);
  const partial = tested.filter((p) => p.widths_not_loaded?.length);
  if (partial.length) lines.push(`${partial.length} pages did not load at some widths and are tested at the others: ${partial.slice(0, 20).map((p) => `${key(p.url)} (not at ${p.widths_not_loaded!.join(", ")})`).join(", ")}${partial.length > 20 ? ", and more" : ""}.\n`);
  const early = tested.filter((p) => Array.isArray(p.facts?.loadIncomplete) && (p.facts.loadIncomplete as number[]).length);
  if (early.length) lines.push(`${early.length} pages were tested before their load event, which did not come in ${r.config.crawl.load_wait_seconds ?? 20} seconds: ${early.slice(0, 20).map((p) => key(p.url)).join(", ")}${early.length > 20 ? ", and more" : ""}. A slow image or script can be the cause.\n`);
  const unstyled = tested.filter((p) => Array.isArray(p.facts?.stylesMissing) && (p.facts.stylesMissing as string[]).length);
  if (unstyled.length) {
    const sheets = [...new Set(unstyled.flatMap((p) => p.facts.stylesMissing as string[]))];
    lines.push(`${unstyled.length} pages were tested without a stylesheet that did not apply, also after a second load: ${unstyled.slice(0, 20).map((p) => key(p.url)).join(", ")}${unstyled.length > 20 ? ", and more" : ""}. The stylesheets: ${sheets.slice(0, 5).join(", ")}${sheets.length > 5 ? ", and more" : ""}. A broken stylesheet can give faults that a person with the full style does not see. Check that the site serves it.\n`);
  }
  lines.push(`A result "no issue found" means that the tests ran and found nothing. It is not a pass. Only a person gives "passed". A result "no content found" means that the engine found no content of that type, and the engine can miss content.\n`);
  if (r.overview) lines.push(...renderOverviewMarkdown(r.overview, r.history || []));

  lines.push(`## The 55 criteria\n`);
  lines.push(`| Criterion | Level | Result | Method | Coverage | Issues | Open questions |\n|---|---|---|---|---|---|---|`);
  for (const c of CRITERIA) {
    const s = r.criteria[c.id];
    const q = r.questions.filter((x) => x.criterion === c.id && !x.person_answer && !(x.ai_answer && x.ai_answer.value !== "unsure")).length;
    lines.push(`| ${c.id} ${c.name} | ${c.level} | ${s.result} | ${s.method} | ${s.coverage.tested_units} of ${s.coverage.all_units} ${s.coverage.definition} units${s.coverage.process_units ? `, ${s.coverage.process_units.tested} of ${s.coverage.process_units.all} process steps` : ""} | ${s.issues} | ${q} |`);
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
  if (resolved.length) lines.push(`${resolved.length} issues are resolved in this audit: ${resolved.map((i) => i.id + (i.status_by.reason === "rule changed" ? " (rule changed)" : "")).join(", ")}.\n`);
  const notChecked = r.issues.filter((i) => i.status === "not checked");
  if (notChecked.length) lines.push(`${notChecked.length} issues are not checked, because the audit did not test all their pages: ${notChecked.map((i) => i.id).join(", ")}.\n`);
  const replaced = r.issues.filter((i) => i.status === "new" && i.replaces);
  if (replaced.length) lines.push(`${replaced.length} new issues replace an older issue after a change of the markup: ${replaced.map((i) => i.id + " replaces " + i.replaces).join(", ")}. They do not count as new or as resolved.\n`);
  const continued = r.issues.filter((i) => i.status !== "new" && i.replaces && r.issues.some((o) => o.id === i.replaces && o.status_by?.run === r.run));
  if (continued.length) lines.push(`${continued.length} issues continue an older issue under a new ID, for example after a new name of a state: ${continued.map((i) => i.id + " continues " + i.replaces).join(", ")}. The old ID is resolved with the reason "rule changed".\n`);
  const decided = r.issues.filter((i) => i.status === "accepted" || i.status === "dismissed");
  if (decided.length) lines.push(`${decided.length} issues are accepted or dismissed: ${decided.map((i) => i.id + " (" + i.status + ")").join(", ")}.\n`);

  // The answers: how many the AI gave, how many wait for a person, and how often the AI and the person agree.
  // All the first AI answers, the unsure ones too: the verifier checks those too, so the count of the verifier is never larger. Before
  // 1.3.5 the count left out the unsure answers, and the report said that the verifier checked more answers than the AI gave.
  const aiAnswered = r.questions.filter((q) => q.ai_answer);
  const aiUnsure = aiAnswered.filter((q) => q.ai_answer.value === "unsure").length;
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
  lines.push(`The AI answered ${aiAnswered.length} questions${aiUnsure ? ` (${aiUnsure} of them unsure)` : ""}, and a person answered ${r.questions.filter((q) => q.person_answer).length}. The verifier, a second independent AI pass, checked ${verified.length} and agreed on ${agreed.length}. ${unresolved.length} questions are unresolved: the two AI answers differ, or one is unsure. ${unverified.length} answers count on the first AI answer alone, with no verification yet.${both.length ? ` On the ${both.length} questions that a person checked, the AI and the person agree on ${agree}.` : ""}${wrongFacts.length ? ` ${wrongFacts.length} questions go back to the AI, because a person found a fact wrong: ${wrongFacts.map((q) => q.id).join(", ")}.` : ""}\n`);
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

  // The broken links: the error pages that pages of the site link to, with the linking pages. The error template that the audit tested is one of them.
  const broken = r.pages.filter((p) => p.not_tested_reason === "broken link" || (p.tested && (p.http_status || 0) >= 400 && p.linked_from?.length)).sort((a, b) => a.url.localeCompare(b.url));
  if (broken.length) {
    lines.push(`## Broken links (${broken.length})\n`);
    lines.push(`Each address answers with an error. The audit tests the error page once, as a template, and lists the other addresses here, with the pages that link to them, or the sitemap file or the API that gave them.\n`);
    for (const p of broken) {
      const hint = brokenLinkHint(p.url);
      lines.push(`- ${key(p.url)}${p.redirects_to ? " (redirects to " + key(p.redirects_to) + ")" : ""}: status ${p.http_status || "unknown"}${p.tested ? ", tested as the error page" : ""}.${p.linked_from?.length ? " Linked from " + p.linked_from.join(", ") + "." : ""}${p.found_in ? " Found in " + p.found_in + "." : ""}${hint ? " It looks like " + hint + "." : ""}`);
    }
    lines.push("");
  }
  const others = outside.filter((p) => p.not_tested_reason !== "broken link");
  if (others.length) {
    lines.push(`## Addresses that are not pages of the site (${others.length})\n`);
    lines.push(`The audit opened each address once and did not test it. They do not count in the pages found or in the coverage.\n`);
    for (const reason of ["redirects off site", "skipped after redirect", "not a page", "blocked"]) {
      const list = others.filter((p) => p.not_tested_reason === reason).sort((a, b) => a.url.localeCompare(b.url));
      if (!list.length) continue;
      const what: Record<string, string> = { "redirects off site": "Redirects to another site", "skipped after redirect": "Redirects to an address that the settings or robots.txt skip", "not a page": "A file, not a page", blocked: "Blocked by a bot challenge or a rate limit" };
      lines.push(`${what[reason]} (${list.length}):\n`);
      for (const p of list) lines.push(`- ${key(p.url)}${p.redirects_to ? " redirects to " + p.redirects_to : ""}${p.http_status ? ", status " + p.http_status : ""}${p.found_in ? ", found in " + p.found_in : ""}`);
      lines.push("");
    }
  }

  lines.push(`## Pages (${crawled.length})\n`);
  lines.push(`| Page | Template | Tested | Sample | States | Failed criteria | Title |\n|---|---|---|---|---|---|---|`);
  for (const p of crawled) {
    const failed = new Set(p.outcomes.filter((o) => o.kind === "failed").map((o) => o.criterion));
    lines.push(`| ${key(p.url)} | ${p.template || "-"} | ${p.tested ? "yes" : "no: " + (p.not_tested_reason || "")} | ${p.sample ? p.sampleReason || "yes" : "-"} | ${p.states.length || "-"} | ${[...failed].sort().join(", ") || "-"} | ${(p.title || "").replace(/\|/g, "/").slice(0, 60)} |`);
  }
  if (r.skipped.length) {
    lines.push(`\n${r.skipped.length} addresses were not crawled: ${[...new Set(r.skipped.map((s) => s.reason))].map((reason) => reason + " (" + r.skipped.filter((s) => s.reason === reason).length + ")").join(", ")}.`);
  }
  lines.push("");
  return lines.join("\n");
}
