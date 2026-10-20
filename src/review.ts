// The review page for a person: a local server that shows the questions that wait for a person, with the evidence and the
// screenshots, and writes each answer into the question file at once. Nothing leaves the machine. See PLAN.md section 7.4.
import { execFile } from "node:child_process";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join, normalize } from "node:path";
import { CRITERIA_BY_ID } from "./criteria.ts";
import type { Config } from "./config.ts";
import { answerQuestion, checkFacts, effectiveAnswer, setIssueStatus } from "./decide.ts";
import { familyOf } from "./own/families.ts";
import { loadExisting } from "./issues.ts";
import { refresh } from "./refresh.ts";
import { readHistory, type HistoryPoint, type Overview } from "./overview.ts";
import { plainOf, whoOf, whoOfAll } from "./own/plain.ts";

export interface ReviewOptions { port?: number; all?: boolean; open?: boolean; log?: (line: string) => void }

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const num = (n: number) => Number(n || 0).toLocaleString("en-US");
const plural = (n: number, word: string) => `${num(n)} ${word}${n === 1 ? "" : "s"}`;
const SEVERITY = ["critical", "serious", "moderate", "minor"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDate = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? iso.slice(0, 10) : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const firstSentence = (s: string) => { const m = String(s || "").match(/^.*?[.!?](\s|$)/); return (m ? m[0] : String(s || "")).trim(); };

/** The three groups of the page: the AI answers to confirm (the sample and the unsure ones), the checks for a person, and the open issues. */
function groups(outDir: string, all: boolean) {
  const open = [...loadExisting(outDir, "questions").values()].filter((q) => !q.person_answer);
  const byReach = (a: Record<string, any>, b: Record<string, any>) => b.pages - a.pages;
  // A question whose facts a person checked is done for the person, until the AI answers again.
  // With the verifier, a person sees only the unresolved questions: the two AI answers differ, or one is unsure. With all: every open question.
  const confirm = open.filter((q) => q.kind === "review" && !q.facts_check && (all || effectiveAnswer(q).unresolved || (!q.verification && q.sample))).sort(byReach);
  const person = open.filter((q) => q.kind === "person").sort(byReach);
  const issues = [...loadExisting(outDir, "issues").values()].filter((i) => ["new", "open", "reopened"].includes(i.status))
    .sort((a, b) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity) || b.reach.pages - a.reach.pages);
  return { confirm, person, issues };
}

function summaryOf(outDir: string): Record<string, any> | null {
  try { return JSON.parse(readFileSync(join(outDir, "summary.json"), "utf8")); } catch { return null; }
}

const NO_CHANGE = /^no (change|role|code change)\b[^.]*\bneeded|\bnot a (target|control)\b|project cannot|accepted risk|false positive|not a real problem/i;
/** True when the review found no change to make: it proposes a decision of a person instead of a fix. */
const isDecision = (i: Record<string, any>) => /\ba11y (dismiss|accept)\b/.test(String(i.solution?.example || "")) || NO_CHANGE.test(String(i.solution?.summary || ""));
const sevMark = (s: string) => `<span class="sev sev-${esc(s)}"><span class="sev-dot" aria-hidden="true"></span>${esc(s)}</span>`;
const CERTAINTY: Record<string, string> = { fail: "found by a rule", "ai fail": "two AI reviews agree" };

function answerWord(value: string): string {
  const cls = value === "issue" ? "ans-issue" : value === "no issue" ? "ans-ok" : "ans-unsure";
  return `<span class="ans ${cls}">${esc(value)}</span>`;
}

function opinion(title: string, a: Record<string, any> | null | undefined): string {
  if (!a) return `<div class="opinion"><p class="opinion-head">${esc(title)}</p><p class="meta">Not given yet.</p></div>`;
  const facts: string[] = a.facts && a.facts.length ? a.facts : [];
  return `<div class="opinion">
      <p class="opinion-head">${esc(title)}: ${answerWord(a.value)} <span class="meta">${esc(a.confidence)} confidence</span></p>
      ${facts.length ? `<ul class="facts">${facts.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      ${a.reason ? `<p class="reason">${esc(a.reason)}</p>` : ""}
    </div>`;
}

function questionEntry(q: Record<string, any>, site: string): string {
  const c = CRITERIA_BY_ID.get(q.criterion);
  const ex = q.evidence || {};
  const state = ex.state && ex.state.length ? ex.state.join(" › ") : "";
  const ai = q.ai_answer;
  const plain = plainOf(ex.rule, q.criterion);
  return `<article class="card entry" id="${esc(q.id)}" aria-labelledby="${esc(q.id)}-h" data-kind="${esc(q.kind)}">
  <div class="entry-head">
    <h3 id="${esc(q.id)}-h">${esc(plain.title)}</h3>
    <p class="meta">${esc(q.criterion)} ${esc(c?.name || "")} · ${esc(plural(q.pages, "page"))} · <span class="mono">${esc(q.id)}</span></p>
  </div>
  <p class="question">${esc(q.question)}</p>
  <p class="meta">Page <a href="${esc(site + ex.url)}" target="_blank" rel="noopener">${esc(ex.url)}</a>${state ? ` · State: ${esc(state)}` : ""}${familyOf(ex.rule) ? ` · What counts as an issue: ${esc(familyOf(ex.rule))}` : ""}</p>
  <div class="entry-body${ex.image ? "" : " single"}">
    <div class="opinions">
      ${ai ? opinion("First review", ai) : ""}
      ${ai ? opinion("Second review", q.verification) : ""}
      ${q.steps && q.steps.length ? `<div class="opinion"><p class="opinion-head">What to do</p><ol class="steps">${q.steps.map((s: string) => `<li>${esc(s)}</li>`).join("")}</ol></div>` : ""}
    </div>
    ${ex.image ? `<figure class="shot"><img src="/shot?p=${encodeURIComponent(ex.image)}" alt="The element on the page, with the area around it" loading="lazy"></figure>` : ""}
  </div>
  <details class="more"><summary>The element and the facts</summary><pre>${esc(ex.selector || "")}\n${esc(ex.html || "")}\n${esc(JSON.stringify(ex.facts || {}, null, 1))}</pre></details>
  <details class="more decide-box"><summary>Decide as a reviewer</summary><div class="actions">
    <label class="note-field"><span>Note</span><input type="text" class="note" aria-label="Note for ${esc(q.id)}"${ai && ai.value !== "unsure" ? ' placeholder="when a fact is wrong: which one, and what you see"' : ""}></label>
    ${ai && ai.value !== "unsure" ? `<div class="buttons">
      <button type="button" class="btn btn-primary" data-facts="confirmed">The facts are right</button>
      <button type="button" class="btn" data-facts="wrong">A fact is wrong</button>
      <button type="button" class="btn" data-value="issue">This is an issue</button>
      <button type="button" class="btn" data-value="no issue">This is not an issue</button>
      <button type="button" class="btn" data-value="not applicable">Not applicable</button>
    </div>` : `<div class="buttons">
      <button type="button" class="btn btn-primary" data-value="issue">This is an issue</button>
      <button type="button" class="btn" data-value="no issue">This is not an issue</button>
      <button type="button" class="btn" data-value="not applicable">Not applicable</button>
    </div>`}
    <p class="status" role="status" aria-live="polite"></p>
  </div></details>
</article>`;
}

function issueEntry(i: Record<string, any>, site: string): string {
  const c = CRITERIA_BY_ID.get(i.wcag.criterion);
  const ex = i.examples[0] || {};
  const plain = plainOf(i.rule.id, i.wcag.criterion);
  const sources: Record<string, any>[] = (i.source || []).filter((s: Record<string, unknown>) => s.file || s.item);
  const sourceText = sources.slice(0, 2).map((s) => s.file ? `<span class="mono">${esc(s.file)}</span>${s.line ? `, line ${esc(s.line)}` : ""}` : esc(s.item)).join("; ");
  const steps: string[] = i.solution.steps || [];
  return `<article class="card entry" id="${esc(i.id)}" aria-labelledby="${esc(i.id)}-h" data-kind="issue">
  <div class="entry-head">
    <h3 id="${esc(i.id)}-h">${esc(plain.title)}</h3>
    <p class="meta">${sevMark(i.severity)} · ${esc(plural(i.reach.pages, "page"))} · ${esc(i.wcag.criterion)} ${esc(c?.name || "")} · ${esc(CERTAINTY[i.certainty] || i.certainty)}${i.status === "new" ? " · new in this run" : i.status === "reopened" ? " · reopened" : ""} · <span class="mono">${esc(i.id)}</span></p>
  </div>
  <p class="experience">${esc(plain.experience)} This affects ${esc(whoOf(i.wcag.criterion))}.</p>
  ${isDecision(i) ? `<p class="meta note-review">The review found no change to make here. It asks a reviewer to confirm that, and to dismiss the issue or accept it as a known risk.</p>` : ""}
  <p class="meta">The rule: ${esc(i.summary)}</p>
  <dl class="meta-list">
    <div><dt>Example</dt><dd><a href="${esc(site + (ex.url || ""))}" target="_blank" rel="noopener">${esc(ex.url || "")}</a>${ex.state && ex.state.length ? ` · state: ${esc(ex.state.join(" › "))}` : ""}${ex.width ? ` · ${esc(ex.width)} px` : ""}</dd></div>
    <div><dt>Origin</dt><dd>${esc(i.origin)}</dd></div>
    ${sourceText ? `<div><dt>Source</dt><dd>${sourceText}</dd></div>` : ""}
    ${i.source_warning ? `<div><dt>Note</dt><dd>${esc(i.source_warning)}</dd></div>` : ""}
  </dl>
  <div class="entry-body${ex.facts?.screenshot ? "" : " single"}">
    <div class="solution">
      <p class="opinion-head">${isDecision(i) ? "The review" : `The fix${i.solution.type === "specific" ? "" : ", general"}`}</p>
      <p>${esc(i.solution.summary)}</p>
      ${steps.length ? `<ol class="steps">${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
      ${i.solution.example ? `<pre>${esc(i.solution.example)}</pre>` : ""}
      ${i.solution.expected_result ? `<p class="reason">Expected result: ${esc(i.solution.expected_result)}</p>` : ""}
    </div>
    ${ex.facts?.screenshot ? `<figure class="shot"><img src="/shot?p=${encodeURIComponent(ex.facts.screenshot)}" alt="The element on the page" loading="lazy"></figure>` : ""}
  </div>
  <details class="more"><summary>The element</summary><pre>${esc(ex.selector || "")}\n${esc(ex.html || "")}</pre></details>
  <details class="more decide-box"><summary>Decide as a reviewer</summary><div class="actions">
    <label class="note-field"><span>Reason</span><input type="text" class="note" aria-label="Reason for ${esc(i.id)}" placeholder="accepted risk, false positive, ..."></label>
    <div class="buttons">
      <button type="button" class="btn" data-status="accepted">Accept as a known risk</button>
      <button type="button" class="btn" data-status="dismissed">Dismiss</button>
    </div>
    <p class="status" role="status" aria-live="polite"></p>
  </div></details>
</article>`;
}

/** The chart of the runs: the open issues as bars, and the share of checks with no failure at level AA as a line. Direct labels, no legend. */
function trendChart(points: HistoryPoint[]): string {
  const pts = points.filter((h) => h.overview);
  if (pts.length < 2) return "";
  const w = 640, h = 260, left = 16, right = 16, top = 36, bottom = 40;
  const n = pts.length;
  const slot = (w - left - right) / n;
  const plotH = h - top - bottom;
  const maxOpen = Math.max(1, ...pts.map((p) => p.overview!.open_issues));
  const yOpen = (v: number) => top + (1 - v / maxOpen) * plotH;
  const yShare = (v: number) => top + (1 - v / 100) * plotH;
  const barW = Math.min(64, slot * 0.5);
  const bars = pts.map((p, i) => { const x = left + slot * i + (slot - barW) / 2; const y = yOpen(p.overview!.open_issues); return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${(h - bottom - y).toFixed(1)}" class="bar-open"/><text x="${(x + barW / 2).toFixed(1)}" y="${(y - 8).toFixed(1)}" text-anchor="middle" class="value">${p.overview!.open_issues}</text>`; }).join("");
  const line = pts.map((p, i) => `${(left + slot * i + slot / 2).toFixed(1)},${yShare(p.overview!.share_no_failure_AA).toFixed(1)}`).join(" ");
  const dots = pts.map((p, i) => { const x = left + slot * i + slot / 2; const y = yShare(p.overview!.share_no_failure_AA); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" class="dot-share"/><text x="${x.toFixed(1)}" y="${(y - 11).toFixed(1)}" text-anchor="middle" class="value value-share">${p.overview!.share_no_failure_AA}%</text>`; }).join("");
  const labels = pts.map((p, i) => `<text x="${(left + slot * i + slot / 2).toFixed(1)}" y="${h - 12}" text-anchor="middle" class="tick">${esc(longDate(p.run))}</text>`).join("");
  const first = pts[0], last = pts[n - 1];
  return `<figure class="trend">
    <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Over ${n} runs, the open issues went from ${first.overview!.open_issues} to ${last.overview!.open_issues}, and the share of checks with no failure at level AA from ${first.overview!.share_no_failure_AA} to ${last.overview!.share_no_failure_AA} percent.">
      <text x="${left}" y="18" class="tick">Open issues, bars, and the share of checks with no failure, line</text>
      <line x1="${left}" y1="${h - bottom}" x2="${w - right}" y2="${h - bottom}" class="axis-line"/>
      ${bars}
      <polyline points="${line}" class="line-share"/>
      ${dots}
      ${labels}
    </svg>
    <figcaption>Each bar is the count of open issues after a run. The line is the share of the page and rule checks at level AA with no failure. The share can stay high while issues remain, because a few issues can reach every page.</figcaption>
  </figure>`;
}

/** The opening: the claim, the lede in plain words, and the decisive values. */
function opening(summary: Record<string, any> | null, history: HistoryPoint[], issues: Record<string, any>[], unresolved: number, host: string): string {
  const o: Overview | undefined = summary?.overview;
  const counts = summary?.counts || {};
  const open = issues.length;
  const sev = { critical: 0, serious: 0, moderate: 0, minor: 0 } as Record<string, number>;
  for (const i of issues) sev[i.severity] = (sev[i.severity] || 0) + 1;
  const runs = history.filter((h) => h.overview);
  const prev = runs.length >= 2 ? runs[runs.length - 2] : null;
  const prevOpen = prev ? prev.overview!.open_issues : null;
  const resolved = counts.resolved || 0;
  let claim: string;
  if (prevOpen === null) claim = open ? `${num(open)} accessibility ${open === 1 ? "issue stands" : "issues stand"} between ${host} and the people it must serve` : `The audit found no accessibility issue on ${host}`;
  else if (open < prevOpen) claim = `${num(open)} accessibility ${open === 1 ? "issue remains" : "issues remain"} open on ${host}, down from ${num(prevOpen)}`;
  else if (open > prevOpen) claim = `${num(open)} accessibility issues are open on ${host}, up from ${num(prevOpen)}`;
  else claim = `${num(open)} accessibility issues are open on ${host}, the same as the last audit`;
  const sevText = [sev.critical ? `${num(sev.critical)} critical` : "", sev.serious ? `${num(sev.serious)} serious` : "", sev.moderate ? `${num(sev.moderate)} moderate` : "", sev.minor ? `${num(sev.minor)} minor` : ""].filter(Boolean).join(", ");
  const who = whoOfAll(issues.slice(0, 8).map((i) => i.wcag.criterion));
  const failed = o ? o.levels.AA.criteria.failed : 0;
  const lede = open
    ? `${sevText ? `Of them, ${sevText}. ` : ""}They affect ${who}. ${failed ? `${num(failed)} of the 55 criteria of WCAG 2.2 fail on at least one page, so the site does not conform yet.` : ""}${prev && resolved ? ` ${num(resolved)} ${resolved === 1 ? "issue" : "issues"} of the last audit ${resolved === 1 ? "is" : "are"} fixed.` : ""}${unresolved ? ` ${num(unresolved)} ${unresolved === 1 ? "question" : "questions"} could not be settled and ${unresolved === 1 ? "waits" : "wait"} for a person.` : ""}`
    : `The rules and the two AI reviews found nothing on the tested pages. That is not a proof of conformance: the audit finds failures, and no tool proves that a site has none.`;
  const stats: string[] = [];
  stats.push(`<div class="stat"><p class="stat-label">Open issues</p><p class="stat-value">${num(open)}</p><p class="stat-detail">${sevText || "none"}</p></div>`);
  if (prev) stats.push(`<div class="stat"><p class="stat-label">Fixed since the last audit</p><p class="stat-value">${num(resolved)}</p><p class="stat-detail">of ${num(prevOpen || 0)} open on ${esc(longDate(prev.run))}</p></div>`);
  else if (summary?.coverage) stats.push(`<div class="stat"><p class="stat-label">Pages tested</p><p class="stat-value">${num(summary.coverage.pages_tested)}</p><p class="stat-detail">at three widths, with ${num(summary.coverage.states_tested || 0)} open menus and panels</p></div>`);
  if (o) stats.push(`<div class="stat"><p class="stat-label">Checks with no failure</p><p class="stat-value">${o.levels.AA.units.share_no_failure}<span class="unit">%</span></p><p class="stat-detail">of ${num(o.levels.AA.units.tested)} page and rule checks, levels A and AA</p></div>`);
  const chart = trendChart(history);
  return `<section class="opening" aria-labelledby="claim">
  <h1 id="claim" class="claim">${esc(claim)}</h1>
  <p class="lede">${esc(lede)}</p>
  <div class="proof${chart ? " with-chart" : ""}">
    <div class="stat-strip">${stats.join("")}</div>
    ${chart}
  </div>
</section>`;
}

/** The issues to fix first: the largest by severity and reach, in plain words. */
function fixFirst(issues: Record<string, any>[]): string {
  if (!issues.length) return "";
  // An issue whose review found no change to make waits for a reviewer's decision; it does not lead the list.
  const actionable = issues.filter((i) => !isDecision(i));
  const top = (actionable.length ? actionable : issues).slice(0, 5);
  const rows = top.map((i, n) => {
    const plain = plainOf(i.rule.id, i.wcag.criterion);
    return `<li class="fix">
      <div class="fix-head"><span class="fix-n">${n + 1}</span><h3><a href="#${esc(i.id)}">${esc(plain.title)}</a></h3></div>
      <p class="meta">${sevMark(i.severity)} · ${esc(plural(i.reach.pages, "page"))} · affects ${esc(whoOf(i.wcag.criterion))}</p>
      <p>${esc(plain.experience)}</p>
      <p><strong>${isDecision(i) ? "The review." : "The fix."}</strong> ${esc(firstSentence(i.solution.summary))}</p>
    </li>`;
  }).join("");
  return `<section id="first" aria-labelledby="first-h">
  <h2 id="first-h">What to fix first</h2>
  <p class="section-lede">The ${top.length === 1 ? "largest issue" : `${top.length} largest issues`}, by how serious ${top.length === 1 ? "it is" : "they are"} and how many pages ${top.length === 1 ? "it reaches" : "they reach"}. Each one links to its full entry with the source file and the code to change.</p>
  <ol class="fix-list">${rows}</ol>
</section>`;
}

/** The coverage and the criteria of each level. */
function coverage(summary: Record<string, any> | null): string {
  const o: Overview | undefined = summary?.overview;
  const cov = summary?.coverage;
  if (!o || !cov) return "";
  const levels: [string, Overview["levels"]["A"]][] = [["Level A", o.levels.A], ["Level AA, with A", o.levels.AA]];
  const rows = levels.map(([name, l]) => `<tr><th scope="row">${esc(name)}</th><td class="numeric">${l.criteria.all}</td><td class="numeric">${l.criteria.met}</td><td class="numeric">${l.criteria.failed}</td><td class="numeric">${l.criteria.unknown}</td><td class="numeric">${l.criteria.no_content}</td><td class="numeric">${l.criteria.not_tested}</td><td class="numeric">${num(l.pages.no_failure)} of ${num(l.pages.all)}</td></tr>`).join("");
  const notRun: string[] = cov.tests_not_run || [];
  return `<section id="coverage" aria-labelledby="coverage-h">
  <h2 id="coverage-h">What the audit covered</h2>
  <p class="section-lede">The audit opened ${esc(plural(cov.pages_tested, "page"))} in a real browser at three widths, phone, tablet, and desktop, and ${num(cov.states_tested || 0)} open menus and panels. ${cov.processes_tested ? `It ran ${esc(plural(cov.processes_tested, "process"))}, for example a form from start to end. ` : ""}Each page met each of the 55 criteria of WCAG 2.2 at levels A and AA: ${o.levels.AA.criteria.failed} fail on at least one page, ${o.levels.AA.criteria.met} pass on every tested page, ${o.levels.AA.criteria.no_content} have no content of that kind on the site, ${o.levels.AA.criteria.unknown} wait for an answer, and ${o.levels.AA.criteria.not_tested} were not tested.</p>
  <div class="table-scroll"><table class="criteria">
    <caption>The 55 criteria by level. "Met" means that the tests found nothing, or that a person passed it. "No content" means that the site has no content of that kind, for example no video.</caption>
    <thead><tr><th scope="col">Level</th><th scope="col" class="numeric">Criteria</th><th scope="col" class="numeric">Met</th><th scope="col" class="numeric">Failed</th><th scope="col" class="numeric">Waiting</th><th scope="col" class="numeric">No content</th><th scope="col" class="numeric">Not tested</th><th scope="col" class="numeric">Pages with no failure</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
  ${notRun.length ? `<details class="more"><summary>Tests that did not run</summary><ul class="meta">${notRun.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></details>` : ""}
</section>`;
}

function page(config: Config, outDir: string, all: boolean): string {
  const { confirm, person, issues } = groups(outDir, all);
  const site = config.site.url;
  const host = site.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const summary = summaryOf(outDir);
  const history = readHistory(outDir);
  const run = summary?.run || "";
  const unresolved = confirm.length;
  const o: Overview | undefined = summary?.overview;
  const section = (id: string, title: string, lead: string, entries: string[], empty: string) => `<section id="${id}" aria-labelledby="${id}-h">
  <h2 id="${id}-h">${title}</h2>
  <p class="section-lede">${lead}</p>
  ${entries.join("\n") || `<p class="meta">${empty}</p>`}
</section>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accessibility audit of ${esc(host)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400..600&family=Geist+Mono:wght@400..600&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #ffffff; --bg-2: #fafafa; --fg: #171717; --fg-2: #666666; --fg-3: #8f8f8f; --line: #ebebeb; --line-2: #d9d9d9;
    --accent: #0a5c50; --focus: #0070f3; --ok: #0a7a68; --bad: #b42318;
    --critical: #b42318; --serious: #b54708; --moderate: #8a6d00; --minor: #6b7280;
    --mono: "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0a0a0a; --bg-2: #111111; --fg: #ededed; --fg-2: #a1a1a1; --fg-3: #7a7a7a; --line: #262626; --line-2: #333333;
      --accent: #4cc3b1; --focus: #52a8ff; --ok: #4cc3b1; --bad: #ff8a70; --critical: #ff8a70; --serious: #f2b45c; --moderate: #e6c45a; --minor: #a1a1a1; color-scheme: dark; }
  }
  * { box-sizing: border-box; }
  html { font-family: Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; font-size: 16px; line-height: 1.6; color: var(--fg); background: var(--bg); -webkit-font-smoothing: antialiased; }
  body { margin: 0; }
  a { color: inherit; text-decoration-thickness: 1px; text-underline-offset: 3px; } a:hover { color: var(--accent); }
  h1, h2, h3 { font-weight: 600; letter-spacing: -0.015em; margin: 0; } h2 { font-size: 1.5rem; line-height: 1.25; } h3 { font-size: 1.125rem; line-height: 1.35; }
  p { margin: 0; }
  .mono { font-family: var(--mono); font-size: 0.86em; }
  .wrap { max-width: 1120px; margin: 0 auto; padding: 0 32px; } @media (max-width: 640px) { .wrap { padding: 0 20px; } }
  .skip { position: absolute; left: -999px; top: 8px; background: var(--bg); padding: 8px 12px; z-index: 10; } .skip:focus { left: 8px; }

  .mast { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 8px 24px; padding: 28px 0 0; }
  .identity { font-weight: 600; font-size: 0.95rem; } .doc-meta { color: var(--fg-2); font-size: 0.9rem; }

  .opening { padding: 72px 0 56px; } @media (max-width: 640px) { .opening { padding: 44px 0 36px; } }
  .claim { font-size: clamp(1.9rem, 1.2rem + 2.6vw, 2.75rem); line-height: 1.12; letter-spacing: -0.025em; max-width: 24ch; text-wrap: balance; }
  .lede { font-size: 1.25rem; line-height: 1.5; color: var(--fg); max-width: 64ch; margin-top: 22px; }
  .proof { margin-top: 44px; display: grid; gap: 32px 48px; align-items: start; } .proof.with-chart { grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); } @media (max-width: 900px) { .proof.with-chart { grid-template-columns: 1fr; } }
  .stat-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 24px 32px; } .proof.with-chart .stat-strip { grid-template-columns: 1fr; gap: 24px; }
  .stat-label { font-size: 0.9rem; color: var(--fg-2); } .stat-value { font-size: 2.6rem; line-height: 1.1; font-weight: 600; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; margin-top: 2px; } .stat-value .unit { font-size: 1.2rem; color: var(--fg-2); font-weight: 500; margin-left: 2px; } .stat-detail { font-size: 0.9rem; color: var(--fg-2); margin-top: 2px; max-width: 32ch; }
  .trend { margin: 0; } .trend svg { width: 100%; height: auto; display: block; } .trend figcaption { color: var(--fg-2); font-size: 0.9rem; margin-top: 10px; max-width: 64ch; }
  .trend .axis-line { stroke: var(--line-2); } .trend .tick { fill: var(--fg-2); font-size: 11.5px; } .trend .bar-open { fill: var(--line-2); } .trend .line-share { fill: none; stroke: var(--fg); stroke-width: 2; } .trend .dot-share { fill: var(--fg); }
  .trend .value { fill: var(--fg); font-size: 12px; font-weight: 600; paint-order: stroke; stroke: var(--bg); stroke-width: 4px; stroke-linejoin: round; } .trend .value-share { font-weight: 500; }
  .trend .dot-share { stroke: var(--bg); stroke-width: 2px; }

  section { padding: 56px 0 0; } .end { padding-bottom: 72px; }
  .section-lede { color: var(--fg-2); max-width: 66ch; margin-top: 10px; }
  .fix-list { list-style: none; margin: 28px 0 0; padding: 0; } .fix { padding: 22px 0; border-top: 1px solid var(--line); max-width: 72ch; } .fix p { margin-top: 6px; }
  .fix-head { display: flex; gap: 14px; align-items: baseline; } .fix-n { font-variant-numeric: tabular-nums; color: var(--fg-3); font-size: 0.95rem; min-width: 1.2em; }
  .meta { color: var(--fg-2); font-size: 0.9rem; } .meta-list { display: flex; flex-wrap: wrap; gap: 4px 28px; margin: 10px 0 0; font-size: 0.9rem; } .meta-list div { display: flex; gap: 8px; min-width: 0; } .meta-list dt { color: var(--fg-2); } .meta-list dd { margin: 0; overflow-wrap: anywhere; }
  .sev { display: inline-flex; gap: 6px; align-items: center; font-weight: 500; color: var(--fg); } .sev-dot { width: 8px; height: 8px; border-radius: 2px; background: currentColor; display: inline-block; }
  .sev-critical .sev-dot { background: var(--critical); } .sev-serious .sev-dot { background: var(--serious); } .sev-moderate .sev-dot { background: var(--moderate); } .sev-minor .sev-dot { background: var(--minor); }

  table.criteria { border-collapse: collapse; width: 100%; margin-top: 24px; font-size: 0.95rem; font-variant-numeric: tabular-nums; }
  table.criteria caption { text-align: left; color: var(--fg-2); font-size: 0.9rem; caption-side: bottom; padding-top: 10px; max-width: 72ch; }
  table.criteria th, table.criteria td { text-align: left; padding: 10px 12px 10px 0; border-bottom: 1px solid var(--line); vertical-align: baseline; } table.criteria .numeric { text-align: right; } table.criteria thead th { font-weight: 500; color: var(--fg-2); font-size: 0.85rem; vertical-align: bottom; } table.criteria th[scope=row] { font-weight: 500; white-space: nowrap; }
  @media (max-width: 760px) { .table-scroll { overflow-x: auto; } table.criteria { min-width: 640px; } }

  .tools { margin-top: 16px; } .tools summary { color: var(--fg-2); font-size: 0.9rem; cursor: pointer; } .tools-row { display: flex; flex-wrap: wrap; gap: 10px 20px; align-items: center; padding: 12px 0 0; font-size: 0.9rem; color: var(--fg-2); } .tools-row label { display: flex; gap: 8px; align-items: center; }
  input[type=text] { font: inherit; padding: 7px 10px; border: 1px solid var(--line-2); border-radius: 6px; background: var(--bg); color: var(--fg); min-width: 0; }
  .entry { padding: 26px 0; border-top: 1px solid var(--line); overflow-wrap: anywhere; } .entry:last-of-type { border-bottom: 1px solid var(--line); }
  .entry.done { opacity: 0.55; } .entry.done .entry-body, .entry.done .more, .entry.done .meta-list { display: none; } .hide-done .entry.done { display: none; }
  .entry-head h3 { max-width: 72ch; } .entry-head .meta { margin-top: 4px; }
  .experience { margin-top: 10px; max-width: 72ch; } .question { margin-top: 10px; max-width: 72ch; font-size: 1.05rem; }
  .entry-body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 340px); gap: 16px 32px; align-items: start; margin-top: 16px; } .entry-body.single { grid-template-columns: minmax(0, 1fr); } .entry-body > * { min-width: 0; } @media (max-width: 820px) { .entry-body { grid-template-columns: minmax(0, 1fr); } }
  .solution, .opinion { padding: 14px 16px; background: var(--bg-2); border-radius: 8px; } .opinions { display: grid; gap: 10px; } .solution p + p, .solution p + ol { margin-top: 8px; }
  .opinion-head { font-weight: 600; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; } .ans { font-weight: 600; } .ans-issue { color: var(--bad); } .ans-ok { color: var(--ok); } .ans-unsure { color: var(--moderate); }
  .facts { margin: 8px 0 0; padding-left: 18px; } .facts li { margin: 3px 0; } .reason { margin-top: 8px; color: var(--fg-2); font-size: 0.92rem; } .steps { margin: 6px 0 0; padding-left: 20px; } .steps li { margin: 3px 0; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; font-family: var(--mono); font-size: 0.82rem; line-height: 1.5; background: var(--bg); border: 1px solid var(--line); padding: 10px 12px; border-radius: 6px; max-height: 280px; overflow: auto; margin: 10px 0 0; }
  .more { margin-top: 10px; } summary { cursor: pointer; color: var(--fg-2); font-size: 0.9rem; }
  .shot { margin: 0; max-height: 380px; overflow: auto; border: 1px solid var(--line); border-radius: 6px; background: #fff; } .shot img { max-width: 100%; height: auto; display: block; }
  .actions { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; padding-top: 12px; } .note-field { flex: 1 1 260px; display: flex; gap: 10px; align-items: center; color: var(--fg-2); font-size: 0.9rem; } .note-field input { flex: 1; } .buttons { display: flex; gap: 8px; flex-wrap: wrap; }
  .btn { font: inherit; font-size: 0.9rem; font-weight: 500; padding: 7px 12px; border-radius: 6px; border: 1px solid var(--line-2); background: var(--bg); color: var(--fg); cursor: pointer; } .btn-primary { background: var(--fg); border-color: var(--fg); color: var(--bg); } .btn:hover { border-color: var(--fg); }
  .btn:focus-visible, input:focus-visible, a:focus-visible, summary:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .status { flex-basis: 100%; font-weight: 500; color: var(--ok); min-height: 1.2em; font-size: 0.9rem; }
  .method p { max-width: 66ch; margin-top: 10px; color: var(--fg); } .method p:first-of-type { margin-top: 10px; }
  .foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 24px; padding: 40px 0 48px; color: var(--fg-2); font-size: 0.88rem; border-top: 1px solid var(--line); margin-top: 72px; }
  @media print { .tools, .decide-box, .skip { display: none !important; } .entry { break-inside: avoid; } }
</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<div class="wrap">
  <header class="mast">
    <span class="identity">Accessibility audit</span>
    <span class="doc-meta">${esc(host)}${run ? ` · ${esc(longDate(run))}` : ""} · ${esc(config.site.environment)}</span>
  </header>
  <main id="main">
    ${opening(summary, history, issues, unresolved, host)}
    ${fixFirst(issues)}
    ${coverage(summary)}
    <section id="issues" aria-labelledby="issues-h">
      <h2 id="issues-h">All open issues${issues.length ? `, ${issues.length}` : ""}</h2>
      <p class="section-lede">Each entry is one cause, with the pages it reaches, where it comes from in the code or the content, and the fix for this project. The order is the severity, then the reach. A reviewer can accept an issue as a known risk or dismiss one that is not a real problem.</p>
      <details class="tools"><summary>Reviewer tools</summary><div class="tools-row">
        <label>Name <input type="text" id="by" autocomplete="name" size="18"></label>
        <label><input type="checkbox" id="hide-done"> Hide done</label>
        <span id="progress" aria-live="polite"></span>
        <button type="button" class="btn" id="refresh">Refresh the report</button>
        <span class="status" id="refresh-status" role="status" aria-live="polite" style="flex-basis:auto"></span>
      </div></details>
      <div class="entries">${issues.map((i) => issueEntry(i, site)).join("\n") || '<p class="meta">No open issue.</p>'}</div>
    </section>
    ${section("confirm", `Questions the audit could not settle${confirm.length ? `, ${confirm.length}` : ""}`, "Two AI reviews answer each question on their own, without sight of each other. These are the ones where they differ, or where one is unsure. They are not counted as issues. A reviewer can settle them here.", confirm.map((q) => questionEntry(q, site)), "Every question is settled.")}
    ${person.length ? section("person", `Checks for a person, ${person.length}`, "Only a person can check these: media, drag, time limits, and forms. The steps say what to do.", person.map((q) => questionEntry(q, site)), "") : ""}
    <section id="method" class="method end" aria-labelledby="method-h">
      <h2 id="method-h">Method and limits</h2>
      <p>An engine opened every page in a real browser and ran the rules of axe-core and its own tests for the 55 criteria. A finding that a rule is sure about became an issue. A finding that needs judgment became a question, which two independent AI reviews answered from the evidence and a screenshot. Two equal answers decide. The engine then compared each issue with the last audit, and a third review found its origin in the source code and wrote the fix.</p>
      <p>The numbers are a measure of this audit, not a conformance claim. WCAG has no score: a page conforms to a level or it does not. A check that found nothing is not a pass, and a site with no issue found is not proven accessible. ${o ? `The audit did not test ${o.levels.AA.criteria.not_tested} of the 55 criteria here, for example live media, and the forms run only in a process on a test environment.` : ""}</p>
      <p>${esc(o?.definition || "")}</p>
    </section>
  </main>
  <footer class="foot">
    <span>Prepared with Accessibility Audit${summary?.versions ? `, engine ${esc(summary.versions.engine)}, axe-core ${esc(summary.versions.axe_core)}, ${esc(summary.versions.browser)}` : ""}</span>
    <span>This page runs on your machine and reads ${esc(outDir)}</span>
  </footer>
</div>
<script>
  var by = document.getElementById("by");
  try { by.value = localStorage.getItem("a11y-by") || ""; } catch (e) {}
  by.addEventListener("input", function () { try { localStorage.setItem("a11y-by", by.value); } catch (e) {} });
  var hide = document.getElementById("hide-done");
  hide.addEventListener("change", function () { document.body.classList.toggle("hide-done", hide.checked); });
  var cards = Array.prototype.slice.call(document.querySelectorAll(".card"));
  function progress() {
    var todo = cards.filter(function (c) { return c.dataset.kind !== "issue"; });
    var done = todo.filter(function (c) { return c.classList.contains("done"); }).length;
    document.getElementById("progress").textContent = done + " of " + todo.length + " questions done";
  }
  function post(url, body) {
    return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "error"); return d; }); });
  }
  cards.forEach(function (card, index) {
    var status = card.querySelector(".status");
    var note = card.querySelector(".note");
    card.querySelectorAll("button[data-value], button[data-status], button[data-facts]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (!by.value.trim()) { status.textContent = "Give your name in the reviewer tools first."; by.focus(); return; }
        var p, what;
        if (button.dataset.facts) {
          if (button.dataset.facts === "wrong" && !note.value.trim()) { status.textContent = "Say which fact is wrong, in the note."; note.focus(); return; }
          what = button.dataset.facts === "confirmed" ? "the facts are right" : "a fact is wrong, back to the AI";
          p = post("/facts", { id: card.id, result: button.dataset.facts, by: by.value.trim(), note: note.value.trim() });
        } else if (button.dataset.value) { what = button.dataset.value; p = post("/answer", { id: card.id, value: button.dataset.value, by: by.value.trim(), note: note.value.trim() }); }
        else { if (!note.value.trim()) { status.textContent = "Give a reason first."; note.focus(); return; } what = button.dataset.status; p = post("/decide", { id: card.id, status: button.dataset.status, by: by.value.trim(), reason: note.value.trim() }); }
        p.then(function () {
          status.textContent = "Recorded: " + what + ", by " + by.value.trim() + ".";
          card.classList.add("done");
          progress();
        }).catch(function (e) { status.textContent = "Not recorded: " + e.message; });
      });
    });
  });
  progress();
  document.getElementById("refresh").addEventListener("click", function () {
    var s = document.getElementById("refresh-status");
    s.textContent = "Refreshing...";
    post("/refresh", {}).then(function (d) { s.textContent = "Done: " + d.issues + " issues, " + d.questions + " questions. Reload for the new list."; })
      .catch(function (e) { s.textContent = "Not refreshed: " + e.message; });
  });
</script>
</body>
</html>`;
}

function readBody(req: IncomingMessage): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; if (data.length > 1e6) reject(new Error("too large")); });
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
  });
}

export function serveReview(config: Config, outDir: string, options: ReviewOptions = {}): Promise<{ url: string; close: () => void }> {
  const port = options.port || 4111;
  const log = options.log || (() => {});
  const json = (res: ServerResponse, code: number, body: unknown) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(page(config, outDir, !!options.all)); return; }
      if (req.method === "GET" && url.pathname === "/shot") {
        // Only a screenshot under runs/ of this results folder.
        const p = normalize(url.searchParams.get("p") || "");
        if (!p.startsWith("runs/") || !p.endsWith(".png") || p.includes("..")) { json(res, 400, { error: "not a screenshot" }); return; }
        const file = join(outDir, p);
        if (!existsSync(file)) { json(res, 404, { error: "no file" }); return; }
        res.writeHead(200, { "content-type": "image/png", "content-length": statSync(file).size });
        createReadStream(file).pipe(res);
        return;
      }
      if (req.method === "POST" && url.pathname === "/answer") {
        const b = await readBody(req);
        const q = answerQuestion(outDir, String(b.id), b.value, { by: String(b.by), note: b.note ? String(b.note) : undefined });
        log(`answer ${q.id}: ${b.value} by ${b.by}`);
        json(res, 200, { ok: true, id: q.id });
        return;
      }
      if (req.method === "POST" && url.pathname === "/facts") {
        const b = await readBody(req);
        const q = checkFacts(outDir, String(b.id), b.result === "confirmed" ? "confirmed" : "wrong", String(b.by), b.note ? String(b.note) : undefined);
        log(`facts ${q.id}: ${b.result} by ${b.by}`);
        json(res, 200, { ok: true, id: q.id });
        return;
      }
      if (req.method === "POST" && url.pathname === "/decide") {
        const b = await readBody(req);
        const i = setIssueStatus(outDir, String(b.id), b.status === "accepted" ? "accepted" : "dismissed", String(b.by), String(b.reason), b.note ? String(b.note) : undefined);
        log(`${i.status} ${i.id} by ${b.by}`);
        json(res, 200, { ok: true, id: i.id });
        return;
      }
      if (req.method === "POST" && url.pathname === "/refresh") {
        const r = refresh(config, outDir, log);
        json(res, 200, { ok: true, issues: r.issues, questions: r.questions });
        return;
      }
      json(res, 404, { error: "not found" });
    } catch (e) {
      json(res, 400, { error: (e as Error).message });
    }
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const url = `http://127.0.0.1:${port}/`;
      log(`the review page is at ${url}`);
      if (options.open !== false && process.platform === "darwin") execFile("open", [url], () => {});
      resolve({ url, close: () => server.close() });
    });
  });
}
