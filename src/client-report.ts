// The client report: a read-only page of the last audit for the client, in plain words. It shows the numbers, the issues to fix
// first, the open issues by the team that fixes them, the changes since the last audit, and the method. It has no decision, no
// question, and no AI answer. The review page serves it at /client, and its button saves it as one HTML file to send. Since 1.3.7.
import { asset } from "./review-page.ts";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const num = (n: number) => Number(n || 0).toLocaleString("en-US");
const plural = (n: number, word: string, many?: string) => `${num(n)} ${n === 1 ? word : many || word + "s"}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDate = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? String(iso || "").slice(0, 10) : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const SEVERITY: Record<string, string> = { critical: "Critical", serious: "Serious", moderate: "Moderate", minor: "Minor" };
const TEAMS: [string, string][] = [["Content", "Content editors"], ["Development", "Developers"], ["Design", "Designers"], ["Vendor", "The vendors of third-party parts"], ["Not known yet", "Not assigned yet"]];
const OPEN = new Set(["new", "open", "reopened"]);

/** The sentences on the findings that need judgment, from the counts of the answers: who answered how many, and how many still wait.
 *  A sentence names a person only when a person answered. Before 1.3.8 a fixed sentence said that two AI reviews and a person checked
 *  the questions, also when no person had answered and most questions waited. */
export function judgmentText(a: Record<string, number> | undefined): string {
  if (!a || !a.questions) return "No finding needed judgment.";
  const done: string[] = [];
  if (a.agreed) done.push(`${num(a.agreed)} ${a.agreed === 1 ? "has" : "have"} two independent AI answers that agree`);
  if (a.aiOnly) done.push(`${num(a.aiOnly)} ${a.aiOnly === 1 ? "has" : "have"} one AI answer that a second review did not check yet`);
  if (a.person) done.push(`a person answered ${num(a.person)}`);
  const open: string[] = [];
  // The unresolved questions: the AI answers differ, or they say that only a person can decide. Before 1.3.9 the text said "do not
  // agree" also for two "unsure" answers.
  const unsure = Math.min(a.unsure || 0, a.unresolved || 0), differ = (a.unresolved || 0) - unsure;
  if (differ) open.push(`${num(differ)} ${differ === 1 ? "has" : "have"} two AI answers that do not agree`);
  if (unsure) open.push(`${num(unsure)} ${unsure === 1 ? "needs" : "need"} a person, because the AI reviews could not decide`);
  if (a.waitingAi) open.push(`${num(a.waitingAi)} ${a.waitingAi === 1 ? "waits" : "wait"} for a first review`);
  if (a.personChecks) open.push(`${num(a.personChecks)} ${a.personChecks === 1 ? "is a check" : "are checks"} that only a person can do, for example the captions of a video`);
  const list = (parts: string[]) => parts.length > 1 ? parts.slice(0, -1).join(", ") + ", and " + parts[parts.length - 1] : parts[0];
  const out = [`The findings that need judgment became ${plural(a.questions, "question")}.`];
  if (done.length) out.push(`Of them, ${list(done)}.`);
  if (open.length) out.push(`${list(open).replace(/^./, (c) => c.toUpperCase())}. The report does not count these open questions as issues.`);
  if (!a.person) out.push("No person has answered a question of this audit yet.");
  return out.join(" ");
}

function sevMark(s: string): string {
  const shape = s === "critical" ? '<path d="M5 0 L10 5 L5 10 L0 5 Z" fill="currentColor"/>' : s === "serious" ? '<path d="M5 0.5 L9.7 9.5 L0.3 9.5 Z" fill="currentColor"/>' : s === "moderate" ? '<rect x="1" y="1" width="8" height="8" fill="currentColor"/>' : '<circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" stroke-width="1.6"/>';
  return `<span class="sev ${s === "critical" || s === "serious" ? "high" : "low"}"><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">${shape}</svg>${esc(SEVERITY[s] || s)}</span>`;
}

/** local: the copy that the review page serves, with a link back and a download button. Without it, the file to send. */
export function clientReport(data: Record<string, any>, options: { local: boolean }): string {
  const o = data.overview;
  const open = (data.issues as Record<string, any>[]).filter((i) => OPEN.has(i.status));
  // The things to fix: an issue, or a fix group whose issues one change fixes. Before 1.3.9 each issue had its own line, so one
  // change could fill the list of what to fix first, and a table could repeat one line of a style sheet a hundred times.
  const fixes = ((data.fixes || open.map((i) => ({ ...i, ids: [i.id], count: 1, pagesExact: true }))) as Record<string, any>[]);
  const first = fixes.filter((f) => !f.proposal).slice(0, 5);
  const by = data.preparedBy ? String(data.preparedBy) : "";
  const share = o.pagesNoFailure ? Math.round((o.pagesNoFailure.no_failure / Math.max(1, o.pagesNoFailure.all)) * 100) : null;
  const teams = TEAMS.map(([key, label]) => ({ key, label, issues: open.filter((i) => i.who === key).length, rows: fixes.filter((f) => f.who === key) })).filter((t) => t.rows.length);
  const teamText = teams.filter((t) => t.key !== "Not known yet").map((t) => `${t.label.toLowerCase()} ${num(t.issues)}`).join(", ");
  const updated = data.updated && data.updated > (data.runDate || "") ? String(data.updated) : "";
  // The new issues: from the tests, or from the answers to questions that needed judgment. Since 1.3.9.
  const fromAnswers = o.newFromAnswers || 0;
  const newText = !o.prevRun ? "" : fromAnswers
    ? ` ${num(o.newCount)} ${o.newCount === 1 ? "is" : "are"} new since the last audit on ${esc(longDate(o.prevRun))}: ${num(o.newFromTests || 0)} from the automatic tests, and ${num(fromAnswers)} from the review of the findings that need judgment. ${num(o.resolvedFixed)} ${o.resolvedFixed === 1 ? "is" : "are"} fixed.`
    : ` ${num(o.newCount)} ${o.newCount === 1 ? "is" : "are"} new since the last audit on ${esc(longDate(o.prevRun))}, and ${num(o.resolvedFixed)} ${o.resolvedFixed === 1 ? "is" : "are"} fixed.`;
  const groupText = o.fixGroups?.groups ? ` ${num(o.fixGroups.issues)} of the issues come from only ${plural(o.fixGroups.groups, "place")} in the code: one change at each place fixes all its issues.` : "";
  const summary = open.length
    ? `The audit found <strong>${plural(open.length, "open issue")}</strong>.${newText}${teamText ? ` By the team that fixes them: ${esc(teamText)}.` : ""} One issue can reach many pages, because it often comes from one template or one component.${groupText} ${first.length ? `The ${first.length === 1 ? "item" : `${first.length} items`} below ${first.length === 1 ? "is" : "are"} the most serious and ${first.length === 1 ? "reaches" : "reach"} the most pages: we suggest starting with ${first.length === 1 ? "it" : "them"}.` : ""}`
    : "The audit found no open issue on the tested pages. That is not a proof of conformance: automatic tests find failures, and no tool proves that a site has none.";
  const pagesText = (f: Record<string, any>) => `${f.pagesExact === false ? "at least " : ""}${plural(f.pages, "page")}`;
  const bar = `<header class="cbar"><div class="cbar-in">
    <span class="logo" aria-hidden="true">${esc((by || "A").charAt(0).toUpperCase())}</span><span class="cname">${esc(by || "Accessibility Audit")}</span><span aria-hidden="true" class="slash">/</span><span class="muted">Accessibility report</span>
    <span class="cactions">${options.local ? '<a class="btn" href="/">Back to the review</a><a class="btn" href="/client?download=1">Download the HTML file</a>' : ""}<button type="button" class="btn primary" onclick="window.print()">Print or save as PDF</button></span>
  </div></header>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accessibility report of ${esc(data.host)}${data.run ? `, ${esc(longDate(data.run))}` : ""}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap" rel="stylesheet">
<style>
${asset("client.css")}
</style>
</head>
<body>
<a class="skip" href="#report">Skip to the report</a>
${bar}
<main class="doc" id="report">
  <section class="intro" aria-labelledby="report-title">
    <p class="eyebrow">Accessibility report</p>
    <h1 id="report-title">${esc(data.host)}</h1>
    <p class="meta">Audit of ${esc(longDate(data.run))}${updated ? ` · results of ${esc(longDate(updated))}` : ""} · WCAG 2.2 level AA · ${plural(o.coverage.pages, "page")}${by ? ` · prepared by ${esc(by)}` : ""}</p>
    <p class="lede">${summary}</p>
  </section>
  <dl class="stats">
    <div><dt>Open issues</dt><dd class="tnum">${num(open.length)}</dd></div>
    ${share === null ? "" : `<div><dt>Pages with no AA failure</dt><dd class="tnum">${share}%</dd></div>`}
    ${o.share === null ? "" : `<div><dt>Checks with no failure</dt><dd class="tnum">${esc(o.share)}%</dd></div>`}
    ${o.prevRun ? `<div><dt>Fixed since the last audit</dt><dd class="tnum">${num(o.resolvedFixed)}</dd></div>` : ""}
  </dl>
  ${first.length ? `<section aria-labelledby="first-h">
    <h2 id="first-h">What to fix first</h2>
    <ol class="first">${first.map((i, n) => `<li><span class="n tnum" aria-hidden="true">${n + 1}</span><div><h3>${esc(i.title)}</h3><p>${esc(i.experience)}${i.count > 1 ? ` One change in ${esc(String(i.file).split("/").pop())}, line ${esc(i.line)}, fixes ${num(i.count)} issues of this kind.` : ""}</p><p class="tags">${sevMark(i.severity)}${i.count > 1 ? `<span class="tag tnum">${plural(i.count, "issue")}</span>` : ""}<span class="tag tnum">${pagesText(i)}</span><span class="tag">${esc(TEAMS.find(([k]) => k === i.who)?.[1] || i.who)}</span><span class="tag tnum">WCAG ${esc(i.criterion)}</span></p></div></li>`).join("")}</ol>
  </section>` : ""}
  ${teams.length ? `<section aria-labelledby="who-h">
    <h2 id="who-h">The issues, by who fixes them</h2>
    <p>Each team can start with its own list. The order is the severity, then the number of pages. When one change fixes many issues, they have one line.</p>
    ${teams.map((t) => `<h3 class="team">${esc(t.label)} <span class="muted tnum">${num(t.issues)}</span></h3>
    <div class="card"><table><caption class="sr-only">${esc(t.label)}: ${plural(t.issues, "issue")}${t.rows.length !== t.issues ? `, in ${plural(t.rows.length, "line")}` : ""}</caption><thead><tr><th scope="col">Issue</th><th scope="col" class="c-sev">Severity</th><th scope="col" class="num c-pages">Pages</th><th scope="col" class="c-wcag">WCAG</th></tr></thead><tbody>
      ${t.rows.map((i) => { const where = i.hint || i.path || ""; return `<tr><td>${esc(i.title)}${where ? `<span class="hint">${esc(where)}</span>` : ""}</td><td>${sevMark(i.severity)}</td><td class="num tnum">${i.pagesExact === false ? "at least " : ""}${num(i.pages)}</td><td class="tnum">${esc(i.criterion)}</td></tr>`; }).join("")}
    </tbody></table></div>`).join("\n")}
  </section>` : ""}
  ${o.prevRun ? `<section aria-labelledby="changed-h">
    <h2 id="changed-h">Since the last audit</h2>
    <ul>
      <li>${plural(o.resolvedFixed, "issue")} ${o.resolvedFixed === 1 ? "is" : "are"} fixed${o.resolvedRule ? `, and ${num(o.resolvedRule)} more closed because a test of the audit improved` : ""}.</li>
      <li>${plural(o.newCount, "issue")} ${o.newCount === 1 ? "is" : "are"} new.${fromAnswers ? ` ${num(o.newFromTests || 0)} came from the automatic tests. ${num(fromAnswers)} came from the review of the findings that need judgment: the review answered questions, and the answers showed issues. These issues can be older than the last audit.` : ""}</li>
      ${o.reopened ? `<li>${plural(o.reopened, "issue")} came back after a fix.</li>` : ""}
      ${o.outOfScope ? `<li>${plural(o.outOfScope, "issue")} closed because ${o.outOfScope === 1 ? "its pages are" : "their pages are"} no longer part of the audit, by agreement.</li>` : ""}
    </ul>
  </section>` : ""}
  <section aria-labelledby="method-h">
    <h2 id="method-h">How we tested, and the limits</h2>
    <p>We tested ${plural(o.coverage.pages, "page")} at ${esc(o.coverage.widths.length)} screen widths (${esc(o.coverage.widths.join(", "))} px) against WCAG 2.2 level AA.${o.coverage.sample ? ` On ${plural(o.coverage.sample, "sample page")} we also opened the menus, the dialogs, and the tabs.` : ""} Automatic tests found part of the issues. ${esc(judgmentText(data.answers))}</p>
    <p>This report measures this audit. It is not a statement of conformance: WCAG has no score, and a page conforms to a level or it does not. Automatic testing cannot find every problem, so some issues need a person with assistive technology to confirm.</p>
  </section>
  <footer class="cfoot"><span>${by ? `Prepared by ${esc(by)} · ` : ""}${esc(longDate(updated || data.run))}</span>${data.contact ? `<span>Questions: ${esc(data.contact)}</span>` : ""}</footer>
</main>
</body>
</html>`;
}
