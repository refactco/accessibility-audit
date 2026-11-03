// The identity of an element when the site makes its ids and names new on each render, and the questions of a page with a
// slideshow and of pages that no link reaches. Each check is the "Check" line, or the fix, of one item of the list of problems of
// 1.2.0. Item 4: the issue ID stays when the name of a select changes. Item 7: one page-not-linked question for each section.
// Item 9: the letters of an image of text on the first slide of a slideshow. Item 10: a state whose control has a random id is
// tested, and each planned state is tested or has a reason. Also: a dialog that is open before a click is not the dialog of the state.
//
// Usage: node tests/identity.mjs [--verbose]
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAudit } from "../src/audit.ts";
import { configForUrl } from "../src/config.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "seeded-faults", "build", "identity");
const PORT = 8099;
const SITE = `http://127.0.0.1:${PORT}`;
const failures = [];
const check = (ok, message) => { console.error(`${ok ? "ok  " : "FAIL"} ${message}`); if (!ok) failures.push(message); };
const verbose = process.argv.includes("--verbose");

const doc = (title, body, head = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>${head}</head><body>${body}</body></html>`;
const pick = (chars, n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
// A random part as a theme makes it, for example qtw3vXnaPK: new on each render.
const random = () => pick("abcdefghijklmnopqrstuvwxyz", 3) + pick("0123456789", 1) + pick("abcdefghijklmnopqrstuvwxyz", 4) + pick("ABCDEFGHIJKLMNOPQRSTUVWXYZ", 2);
const digits = () => pick("123456789", 1) + pick("0123456789", 9);

const home = () => {
  const r = random();
  return doc("Home", `<header><div class="site-search" role="dialog" aria-label="Site search"><button type="button" class="search-button">Search</button></div>
<button type="button" class="menu-toggle" onclick="document.getElementById('menu').hidden = !document.getElementById('menu').hidden">Menu</button>
<nav id="menu" hidden><a href="/slides/">Slides</a> <a href="/news/page/2/">Older news</a></nav></header>
<main><h1>Home</h1><p>Departments: <select name="swiper-${digits()}"><option>Choose a department</option><option>Sales</option></select></p>
<div class="accordion"><h2><button type="button" class="accordion-button" aria-expanded="false" id="heading-1-1-${r}" aria-controls="section-1-1-${r}" onclick="var p = document.getElementById(this.getAttribute('aria-controls')); p.hidden = !p.hidden; this.setAttribute('aria-expanded', String(!p.hidden));">Opening hours</button></h2>
<div id="section-1-1-${r}" hidden><p>The office opens at nine and closes at five.</p></div></div>
<p><button type="button" class="filters" aria-expanded="false">More filters</button></p>
<p><a href="/slides/">The slides of the report</a></p></main>`);
};
// Item 9: the first slide has a transparent image of yellow letters over a light ground. The slideshow hides it after 2.5 seconds,
// and shows a second slide with another image.
const slides = doc("Report", `<main><h1>Report</h1><div class="show" style="background:linear-gradient(#eeeeee,#ffffff);padding:20px;width:340px;height:90px">
<div id="slide1"><img id="t1" alt="Discovery" width="300" height="60"></div><div id="slide2" hidden><img id="t2" alt="Research" width="300" height="60"></div></div></main>
<script>function word(id, text) { var c = document.createElement("canvas"); c.width = 300; c.height = 60; var x = c.getContext("2d"); x.fillStyle = "#ffd11d"; x.font = "bold 40px sans-serif"; x.fillText(text, 10, 45); document.getElementById(id).src = c.toDataURL("image/png"); }
word("t1", "DISCOVERY"); word("t2", "RESEARCH");
setTimeout(function () { document.getElementById("slide1").hidden = true; document.getElementById("slide2").hidden = false; }, 2500);</script>`);
const plain = (title) => doc(title, `<main><h1>${title}</h1><p>Text of the page.</p></main>`);
const SITEMAP = ["/", "/slides/", "/news/a/", "/news/b/", "/events/x/"];

const server = http.createServer((req, res) => {
  const p = new URL(req.url, SITE).pathname;
  const send = (body, type = "text/html; charset=utf-8", status = 200) => { res.writeHead(status, { "content-type": type }); res.end(body); };
  if (p === "/robots.txt") return send(`User-agent: *\nDisallow: /*/page/\nSitemap: ${SITE}/sitemap.xml\n`, "text/plain");
  if (p === "/sitemap.xml") return send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${SITEMAP.map((u) => `<url><loc>${SITE}${u}</loc></url>`).join("")}</urlset>`, "application/xml");
  if (p === "/") return send(home());
  if (p === "/slides/") return send(slides);
  if (["/news/a/", "/news/b/", "/events/x/"].includes(p)) return send(plain("Page " + p));
  send(plain("Not found"), "text/html", 404);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const config = configForUrl(SITE, "production");
config.crawl.widths = [390];
config.crawl.rate_limit = 20;
config.crawl.random_sample_share = 0;
config.interaction.max_states_per_page = 5;
config.interaction.dry_submit = false;
const readDir = (name) => fs.readdirSync(path.join(dir, name)).map((f) => JSON.parse(fs.readFileSync(path.join(dir, name, f), "utf8")));
const audit = async () => {
  const lines = [];
  const result = await runAudit({ config, outDir: dir, log: (l) => lines.push(l) });
  if (verbose) for (const l of lines) console.error("     " + l);
  return { result, lines, summary: JSON.parse(fs.readFileSync(path.join(dir, "summary.json"), "utf8")), report: fs.readFileSync(path.join(dir, "report.md"), "utf8") };
};
// The identity of an axe-core element as 1.2.0 made it, with the random part, for the ID of an issue of that version.
const oldItem = (html) => {
  const tag = (html.match(/^<([a-z0-9-]+)/i) || [, "el"])[1].toLowerCase();
  const id = (html.match(/\sid="([^"]*)"/) || [])[1];
  const cls = (html.match(/\sclass="([^"]*)"/) || [, ""])[1].split(/\s+/).filter(Boolean).slice(0, 3).join(".");
  const key = (html.match(/\s(?:src|href|name|aria-label)="([^"]*)"/) || [, ""])[1].split("/").pop() || "";
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
  return `${tag}${id ? "#" + id : ""}${cls ? "." + cls : ""}|${key}|${text}`;
};

try {
  fs.rmSync(dir, { recursive: true, force: true });
  const first = await audit();
  const selectIssue = readDir("issues").find((i) => i.rule.id === "select-name");
  check(!!selectIssue, `the first audit finds the select with no name (${selectIssue?.id}, ${selectIssue?.examples[0].html.slice(0, 60)})`);

  // Item 10, and the dialog that is open before the click.
  const homeRecord = first.result.pages.find((p) => p.url === SITE + "/");
  const actions = homeRecord.states.flatMap((s) => s.actions);
  check(actions.includes("click Opening hours"), `item 10: the state of the accordion button with a random id is tested in its own render (${actions.join(", ") || "no state"})`);
  const cov = first.summary.coverage;
  const notApplied = Object.values(cov.states_not_applied || {}).reduce((n, v) => n + v, 0);
  const line = first.report.match(/State phase: (\d+) states planned, (\d+) tested, (\d+) not applied/);
  check(cov.states_planned > 0 && line && Number(line[1]) === cov.states_planned && Number(line[2]) + Number(line[3]) === Number(line[1]) && Number(line[3]) === notApplied, `item 10: the planned states equal the tested states plus the states not applied, in the report and the summary (${line ? line[0] : "no line"}, ${JSON.stringify(cov.states_not_applied)})`);
  check(cov.states_not_applied?.["no change"] === 1 && first.lines.filter((l) => l.includes("state not applied")).length === notApplied && first.lines.some((l) => l.includes("state not applied (no change): / at 390, click More filters")), `item 10: a button that changes nothing is a state not applied, and the log names it with the reason (${first.lines.filter((l) => l.includes("state not applied")).map((l) => l.trim()).join("; ") || "no line"})`);
  const dialogOutcomes = first.result.pages.flatMap((p) => p.outcomes).filter((o) => ["focus-leaves-dialog", "dialog-without-exit"].includes(o.rule));
  check(!dialogOutcomes.length, `a search box with role=dialog that is open before the click of the menu is not the dialog of the menu state (${dialogOutcomes.map((o) => o.rule + " " + o.state.join(">")).join(", ") || "none"})`);

  // Item 7.
  const notLinked = readDir("questions").filter((q) => q.evidence.rule === "page-not-linked");
  const news = notLinked.find((q) => q.evidence.facts.section === "/news/");
  check(notLinked.length === 2 && !!news && notLinked.some((q) => q.evidence.facts.section === "/events/"), `item 7: one page-not-linked question for each section (${notLinked.map((q) => q.evidence.facts.section + " " + q.pages + " pages").join(", ")})`);
  check(!!news && news.question.includes("/news/") && news.question.includes("Disallow: /*/page/") && news.question.includes("/news/page/2/"), `item 7: the question for the news posts names /news/ and the robots.txt rule (${news?.question.slice(0, 240)})`);

  // Item 9.
  const slidesRecord = first.result.pages.find((p) => p.url === SITE + "/slides/");
  const letters = slidesRecord.outcomes.filter((o) => o.rule === "image-text-contrast");
  check(letters.some((o) => o.facts.alt === "Discovery" && o.facts.measured.main < 4.5), `item 9: the image of text on the first slide gets a 1.4.3 question before the slideshow hides it (${letters.map((o) => o.facts.alt + " " + o.facts.measured.main + ":1").join(", ") || "none"})`);
  check(letters.length === 2 && letters.some((o) => o.facts.alt === "Research"), `item 9: the second measure after the other tests finds the image of the later slide, and does not measure the first image again (${letters.map((o) => o.facts.alt).join(", ")})`);

  // Item 4: a second audit, with a new name of the select in each render. Before it, the issue of the select is put back as 1.2.0
  // stored it: an ID from the identity with the random part, with a status and a solution of the skill.
  const oldId = "ISS-" + createHash("sha1").update(`axe-core|select-name|${selectIssue.wcag.criterion}|${oldItem(selectIssue.examples[0].html)}|`).digest("hex").slice(0, 8);
  const issuesDir = path.join(dir, "issues");
  fs.rmSync(path.join(issuesDir, selectIssue.id + ".json"));
  fs.writeFileSync(path.join(issuesDir, oldId + ".json"), JSON.stringify({ ...selectIssue, id: oldId, status: "open", origin: "code", solution: { type: "specific", summary: "Add a label to the select of the slider.", steps: ["Add aria-label to the select."] } }, null, 1));
  const second = await audit();
  const issues = readDir("issues");
  const now = issues.find((i) => i.rule.id === "select-name" && ["new", "open", "reopened"].includes(i.status));
  check(now?.id === selectIssue.id, `item 4: two audits of a page whose select name changes give the same issue ID (${selectIssue.id}, then ${now?.id}; names ${selectIssue.examples[0].html.match(/name="([^"]+)"/)?.[1]} and ${now?.examples[0].html.match(/name="([^"]+)"/)?.[1]})`);
  const old = issues.find((i) => i.id === oldId);
  check(old?.status === "resolved" && old?.status_by.reason === "rule changed", `item 4: the issue under its ID of 1.2.0 is resolved with the reason "rule changed", not "fixed" (${old?.status}, ${old?.status_by?.reason})`);
  check(now?.replaces === oldId && now?.status === "open" && now?.origin === "code" && now?.solution.type === "specific", `item 4: the issue under its new ID keeps the status, the origin, and the solution of the old one (${now?.status}, replaces ${now?.replaces}, origin ${now?.origin}, solution ${now?.solution.type})`);
  check(second.summary.counts.resolved === 0, `item 4: the change of the ID does not count as a fix (${second.summary.counts.resolved} resolved)`);
} finally {
  await new Promise((r) => server.close(r));
}

if (failures.length) { console.error(`\n${failures.length} checks failed`); process.exit(1); }
console.error("\nall checks passed");
