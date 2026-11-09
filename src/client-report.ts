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

function sevMark(s: string): string {
  const shape = s === "critical" ? '<path d="M5 0 L10 5 L5 10 L0 5 Z" fill="currentColor"/>' : s === "serious" ? '<path d="M5 0.5 L9.7 9.5 L0.3 9.5 Z" fill="currentColor"/>' : s === "moderate" ? '<rect x="1" y="1" width="8" height="8" fill="currentColor"/>' : '<circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" stroke-width="1.6"/>';
  return `<span class="sev ${s === "critical" || s === "serious" ? "high" : "low"}"><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">${shape}</svg>${esc(SEVERITY[s] || s)}</span>`;
}

/** local: the copy that the review page serves, with a link back and a download button. Without it, the file to send. */
export function clientReport(data: Record<string, any>, options: { local: boolean }): string {
  const o = data.overview;
  const open = (data.issues as Record<string, any>[]).filter((i) => OPEN.has(i.status));
  const first = open.filter((i) => !i.proposal).slice(0, 5);
  const by = data.preparedBy ? String(data.preparedBy) : "";
  const share = o.pagesNoFailure ? Math.round((o.pagesNoFailure.no_failure / Math.max(1, o.pagesNoFailure.all)) * 100) : null;
  const teams = TEAMS.map(([key, label]) => ({ key, label, rows: open.filter((i) => i.who === key) })).filter((t) => t.rows.length);
  const teamText = teams.filter((t) => t.key !== "Not known yet").map((t) => `${t.label.toLowerCase()} ${num(t.rows.length)}`).join(", ");
  const summary = open.length
    ? `The audit found <strong>${plural(open.length, "open issue")}</strong>.${o.prevRun ? ` ${num(o.newCount)} ${o.newCount === 1 ? "is" : "are"} new since the last audit on ${esc(longDate(o.prevRun))}, and ${num(o.resolvedFixed)} ${o.resolvedFixed === 1 ? "is" : "are"} fixed.` : ""}${teamText ? ` By the team that fixes them: ${esc(teamText)}.` : ""} One issue can reach many pages, because it often comes from one template or one component. ${first.length ? `The ${first.length === 1 ? "issue" : `${first.length} issues`} below ${first.length === 1 ? "is" : "are"} the most serious and ${first.length === 1 ? "reaches" : "reach"} the most pages: we suggest starting with ${first.length === 1 ? "it" : "them"}.` : ""}`
    : "The audit found no open issue on the tested pages. That is not a proof of conformance: automatic tests find failures, and no tool proves that a site has none.";
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
    <p class="meta">Audit of ${esc(longDate(data.run))} · WCAG 2.2 level AA · ${plural(o.coverage.pages, "page")}${by ? ` · prepared by ${esc(by)}` : ""}</p>
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
    <ol class="first">${first.map((i, n) => `<li><span class="n tnum" aria-hidden="true">${n + 1}</span><div><h3>${esc(i.title)}</h3><p>${esc(i.experience)}</p><p class="tags">${sevMark(i.severity)}<span class="tag tnum">${plural(i.pages, "page")}</span><span class="tag">${esc(TEAMS.find(([k]) => k === i.who)?.[1] || i.who)}</span><span class="tag tnum">WCAG ${esc(i.criterion)}</span></p></div></li>`).join("")}</ol>
  </section>` : ""}
  ${teams.length ? `<section aria-labelledby="who-h">
    <h2 id="who-h">The issues, by who fixes them</h2>
    <p>Each team can start with its own list. The order is the severity, then the number of pages.</p>
    ${teams.map((t) => `<h3 class="team">${esc(t.label)} <span class="muted tnum">${num(t.rows.length)}</span></h3>
    <div class="card"><table><caption class="sr-only">${esc(t.label)}: ${plural(t.rows.length, "issue")}</caption><thead><tr><th scope="col">Issue</th><th scope="col" class="c-sev">Severity</th><th scope="col" class="num c-pages">Pages</th><th scope="col" class="c-wcag">WCAG</th></tr></thead><tbody>
      ${t.rows.map((i) => `<tr><td>${esc(i.title)}${i.hint ? `<span class="hint">${esc(i.hint)}</span>` : ""}</td><td>${sevMark(i.severity)}</td><td class="num tnum">${num(i.pages)}</td><td class="tnum">${esc(i.criterion)}</td></tr>`).join("")}
    </tbody></table></div>`).join("\n")}
  </section>` : ""}
  ${o.prevRun ? `<section aria-labelledby="changed-h">
    <h2 id="changed-h">Since the last audit</h2>
    <ul>
      <li>${plural(o.resolvedFixed, "issue")} ${o.resolvedFixed === 1 ? "is" : "are"} fixed${o.resolvedRule ? `, and ${num(o.resolvedRule)} more closed because a test of the audit improved` : ""}.</li>
      <li>${plural(o.newCount, "issue")} ${o.newCount === 1 ? "is" : "are"} new.</li>
      ${o.reopened ? `<li>${plural(o.reopened, "issue")} came back after a fix.</li>` : ""}
      ${o.outOfScope ? `<li>${plural(o.outOfScope, "issue")} closed because ${o.outOfScope === 1 ? "its pages are" : "their pages are"} no longer part of the audit, by agreement.</li>` : ""}
    </ul>
  </section>` : ""}
  <section aria-labelledby="method-h">
    <h2 id="method-h">How we tested, and the limits</h2>
    <p>We tested ${plural(o.coverage.pages, "page")} at ${esc(o.coverage.widths.length)} screen widths (${esc(o.coverage.widths.join(", "))} px) against WCAG 2.2 level AA.${o.coverage.sample ? ` On ${plural(o.coverage.sample, "sample page")} we also opened the menus, the dialogs, and the tabs.` : ""} Automatic tests found part of the issues. Two independent AI reviews and a person checked the questions that need judgment.</p>
    <p>This report measures this audit. It is not a statement of conformance: WCAG has no score, and a page conforms to a level or it does not. Automatic testing cannot find every problem, so some issues need a person with assistive technology to confirm.</p>
  </section>
  <footer class="cfoot"><span>${by ? `Prepared by ${esc(by)} · ` : ""}${esc(longDate(data.run))}</span>${data.contact ? `<span>Questions: ${esc(data.contact)}</span>` : ""}</footer>
</main>
</body>
</html>`;
}
