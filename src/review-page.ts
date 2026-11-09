// The HTML of the review page: the side bar, the four empty views, the data of the lists, and the style and the script from the
// folder review/ of the package, put inline so that the page is one document. The script fills the views. Since 1.3.7.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./config.ts";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? "" : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

/** A file of the folder review/, read at each request, so that a change shows after a reload. */
export function asset(name: string): string {
  return readFileSync(join(ROOT, "review", name), "utf8");
}

/** JSON in a script element: "<" becomes \\u003c, so that no text of the site can close the element. */
export function scriptJson(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

const ICONS = {
  overview: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>',
  decisions: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M2 9h3l1 2h4l1-2h3"/><path d="M3.5 3h9L14 9v4H2V9z"/></svg>',
  issues: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M6 4h8M6 8h8M6 12h8"/><path d="M2.5 4h.5M2.5 8h.5M2.5 12h.5"/></svg>',
  method: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M2 3h4a2 2 0 0 1 2 2v8a1.5 1.5 0 0 0-1.5-1.5H2z"/><path d="M14 3h-4a2 2 0 0 0-2 2v8a1.5 1.5 0 0 1 1.5-1.5H14z"/></svg>',
  client: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M8 2v8M5 5l3-3 3 3"/><path d="M3 9v4h10V9"/></svg>',
};

export function reviewPage(data: Record<string, any>): string {
  const open = (data.issues as Record<string, any>[]).filter((i) => ["new", "open", "reopened"].includes(i.status)).length;
  const waiting = (data.decisions as Record<string, any>[]).filter((d) => !d.done).length;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accessibility review of ${esc(data.host)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap" rel="stylesheet">
<style>
${asset("page.css")}
</style>
</head>
<body>
<a class="skip" href="#main">Skip to the content</a>
<div class="app">
  <nav class="side" aria-label="Main">
    <div class="brand"><span class="logo" aria-hidden="true">A</span><span class="brand-name">Accessibility review</span></div>
    <p class="brand-meta">${esc(data.host)}${data.run ? ` · ${esc(shortDate(data.run))}` : ""}</p>
    <a class="nav" href="#overview" data-view="overview">${ICONS.overview}Overview</a>
    <a class="nav" href="#decisions" data-view="decisions">${ICONS.decisions}Decisions <span class="badge tnum" id="nav-left">${waiting}</span></a>
    <a class="nav" href="#issues" data-view="issues">${ICONS.issues}Issues <span class="count tnum" id="nav-issues">${open}</span></a>
    <a class="nav" href="#method" data-view="method">${ICONS.method}Method</a>
    <div class="side-sep"></div>
    <a class="nav" href="/client">${ICONS.client}Client report</a>
    <div class="side-foot">
      <div class="who"><span class="avatar" id="who-avatar" aria-hidden="true">?</span><span class="who-name" id="who-name">No name yet</span><button type="button" class="linkish" id="who-change">Add your name</button></div>
      <form class="name-form" id="name-form" hidden><label class="field"><span>Your name</span><input type="text" id="name-input" autocomplete="name"></label><div class="row"><button type="submit" class="btn small primary">Save</button><button type="button" class="btn small" id="name-cancel">Cancel</button></div></form>
      <div class="keys"><span id="keys-label">Keys 1 to 3 answer</span><button type="button" class="btn small" id="keys-toggle" aria-describedby="keys-label" aria-pressed="true">On</button></div>
    </div>
  </nav>
  <main class="main" id="main" tabindex="-1">
    <div class="stale" id="stale" hidden><span id="stale-text" role="status"></span><button type="button" class="btn small" id="refresh">Refresh the report</button></div>
    <noscript><p class="empty">The review page needs JavaScript. The report is also in report.md in the results folder.</p></noscript>
    <section class="view" id="view-overview" aria-label="Overview" hidden></section>
    <section class="view" id="view-decisions" aria-label="Decisions" hidden></section>
    <section class="view" id="view-issues" aria-label="Issues" hidden></section>
    <section class="view" id="view-method" aria-label="Method" hidden></section>
  </main>
</div>
<div class="sr-only" id="announce" role="status" aria-live="polite"></div>
<script id="data" type="application/json">${scriptJson(data)}</script>
<script>
${asset("page.js")}
</script>
</body>
</html>`;
}
