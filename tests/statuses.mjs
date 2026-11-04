// The statuses of the stored issues, the second try of a load, and the count of the states. Each check is one problem of the
// second full audit of a large site with 1.3.0. 1: several old IDs of one element give one new ID: each old ID is "rule changed",
// none is "fixed", and a refresh or the next audit corrects a false "fixed" of 1.3.0. 2: an issue of a test that runs on the sample
// only is "not checked" when its page is not in the sample, and a refresh corrects a false "resolved" of 1.3.0. 3: a load that a short network fault stops gets one more try. 4: the states with the cookie
// banner open have their own count, so the planned and the tested states agree.
//
// Usage: node tests/statuses.mjs [--verbose]
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAudit } from "../src/audit.ts";
import { configForUrl } from "../src/config.ts";
import { refresh } from "../src/refresh.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "seeded-faults", "build", "statuses");
const PORT = 8100;
const SITE = `http://127.0.0.1:${PORT}`;
const failures = [];
const check = (ok, message) => { console.error(`${ok ? "ok  " : "FAIL"} ${message}`); if (!ok) failures.push(message); };
const verbose = process.argv.includes("--verbose");
const version = JSON.parse(fs.readFileSync(path.join(here, "..", "package.json"), "utf8")).version;

const doc = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;
const digits = () => String(1000000000 + Math.floor(Math.random() * 8999999999));
const home = () => doc("Home", `<div id="cookie-banner" style="position:fixed;bottom:0;left:0;right:0;background:#fff;padding:12px">We use cookies.
<button type="button" id="cookie-accept" onclick="document.getElementById('cookie-banner').remove()">Accept</button></div>
<main><h1>Home</h1><p>Departments: <select name="swiper-${digits()}"><option>Choose a department</option><option>Sales</option></select></p>
<p><button type="button" aria-expanded="false" onclick="var p = document.getElementById('hours'); p.hidden = !p.hidden; this.setAttribute('aria-expanded', String(!p.hidden));">Opening hours</button></p>
<div id="hours" hidden><p>The office opens at nine.</p></div>
<p><a href="/other/">Other page</a> <a href="/flaky/">A page on a slow network</a></p></main>`);
const plain = (title) => doc(title, `<main><h1>${title}</h1><p>Text of the page.</p></main>`);

// /flaky/: the requests of the first 1.5 seconds lose their connection with no answer, as in a short change of the network.
let flakyFrom = 0;
let flakyCut = 0;
const server = http.createServer((req, res) => {
  const p = new URL(req.url, SITE).pathname;
  const send = (body, type = "text/html; charset=utf-8", status = 200) => { res.writeHead(status, { "content-type": type }); res.end(body); };
  if (p === "/robots.txt") return send("User-agent: *\nAllow: /\n", "text/plain");
  if (p === "/") return send(home());
  if (p === "/other/") return send(plain("Other page"));
  if (p === "/flaky/") {
    if (!flakyFrom) flakyFrom = Date.now();
    if (Date.now() - flakyFrom < 1500) { flakyCut++; return req.socket.destroy(); }
    return send(plain("A page on a slow network"));
  }
  send(plain("Not found"), "text/html", 404);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const config = configForUrl(SITE, "production");
config.crawl.widths = [390];
config.crawl.rate_limit = 20;
config.crawl.random_sample_share = 0;
config.crawl.cookie_banner = { selector: "#cookie-banner", dismiss_selector: "#cookie-accept" };
config.interaction.max_states_per_page = 2;
config.interaction.dry_submit = false;
const readDir = (name) => fs.readdirSync(path.join(dir, name)).map((f) => JSON.parse(fs.readFileSync(path.join(dir, name, f), "utf8")));
const writeIssue = (issue) => fs.writeFileSync(path.join(dir, "issues", issue.id + ".json"), JSON.stringify(issue, null, 1));
const audit = async () => {
  const lines = [];
  const result = await runAudit({ config, outDir: dir, log: (l) => lines.push(l) });
  if (verbose) for (const l of lines) console.error("     " + l);
  return { result, lines, summary: JSON.parse(fs.readFileSync(path.join(dir, "summary.json"), "utf8")), report: fs.readFileSync(path.join(dir, "report.md"), "utf8") };
};
// The identity of an axe-core element as 1.2.0 and older versions made it, with the random part, for the ID of an old issue.
const oldItem = (html) => {
  const tag = (html.match(/^<([a-z0-9-]+)/i) || [, "el"])[1].toLowerCase();
  const id = (html.match(/\sid="([^"]*)"/) || [])[1];
  const cls = (html.match(/\sclass="([^"]*)"/) || [, ""])[1].split(/\s+/).filter(Boolean).slice(0, 3).join(".");
  const key = (html.match(/\s(?:src|href|name|aria-label)="([^"]*)"/) || [, ""])[1].split("/").pop() || "";
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
  return `${tag}${id ? "#" + id : ""}${cls ? "." + cls : ""}|${key}|${text}`;
};
const oldIdOf = (issue, html) => "ISS-" + createHash("sha1").update(`axe-core|${issue.rule.id}|${issue.wcag.criterion}|${oldItem(html)}|`).digest("hex").slice(0, 8);

try {
  fs.rmSync(dir, { recursive: true, force: true });
  const first = await audit();
  const page = (u) => first.result.pages.find((p) => p.url === SITE + u);

  // 3: the second try after a network fault.
  const flaky = page("/flaky/");
  check(flakyCut > 0 && flaky?.tested === true && !flaky?.not_tested_reason, `3: a page whose first load lost its connection is tested after one more try (${flakyCut} connections cut, tested ${flaky?.tested}, ${flaky?.not_tested_reason || "no reason"}, ${flaky?.facts?.loadError?.split("\n")[0] || "no error"})`);
  check(first.lines.some((l) => /network error at 390, one more try in 5 s: .*net::ERR_/.test(l)), `3: the log names the network error and the second try (${first.lines.filter((l) => l.includes("network error") || l.includes("did not load")).map((l) => l.trim()).join("; ") || "no line"})`);

  // 4: the states with the cookie banner open.
  const cov = first.summary.coverage;
  const line = first.report.match(/State phase: (\d+) states planned, (\d+) tested, (\d+) not applied[^\n]*/);
  check(cov.banner_states_tested === 1 && cov.states_planned >= 1 && line && cov.states_tested === Number(line[2]) + cov.banner_states_tested, `4: the summary counts the cookie banner states apart, and the states tested are the tested states of the state phase plus them (planned ${cov.states_planned}, tested ${cov.states_tested}, banner ${cov.banner_states_tested})`);
  check(!!line && line[0].includes("Other states: 1 with the cookie banner open, one for each template.") && line[0].includes(`${cov.states_tested} states tested in all.`), `4: the report gives the cookie banner states and the total after the state phase (${line?.[0] || "no line"})`);

  // The pages of the next checks: the home page is in the sample, the other page is not.
  check(page("/")?.sample === true && page("/other/")?.tested === true && !page("/other/")?.sample, `the home page is in the sample, and /other/ is tested but not in the sample (${page("/")?.sample}, ${page("/other/")?.tested}, ${page("/other/")?.sample})`);

  // The second audit. Before it, the issue of the select is put back as two issues of an older version: the select had a new random
  // name on each render, so two runs gave two IDs. One has the origin and the solution of the skill. And two issues of the listener
  // test, which runs on the sample pages only: one on the home page, in the sample, and one on /other/, which is not.
  const select = readDir("issues").find((i) => i.rule.id === "select-name");
  check(!!select, `the first audit finds the select with no name (${select?.id})`);
  const htmlA = select.examples[0].html.replace(/name="[^"]+"/, 'name="swiper-1122334455"');
  const htmlB = select.examples[0].html.replace(/name="[^"]+"/, 'name="swiper-5544332211"');
  const oldA = oldIdOf(select, htmlA), oldB = oldIdOf(select, htmlB);
  fs.rmSync(path.join(dir, "issues", select.id + ".json"));
  const withHtml = (html) => select.examples.map((e) => ({ ...e, html }));
  writeIssue({ ...select, id: oldA, status: "open", examples: withHtml(htmlA), origin: "unknown" });
  writeIssue({ ...select, id: oldB, status: "open", examples: withHtml(htmlB), origin: "code", solution: { type: "specific", summary: "Add a label to the select of the slider.", steps: ["Add aria-label to the select."] } });
  const control = (id, url, engineVersion) => ({
    ...select, id, status: "open", certainty: "fail", rule: { id: "control-without-role", engine: "accessibility-audit", engine_version: engineVersion },
    wcag: { ...select.wcag, criterion: "4.1.2" }, question: null, replaces: null, origin: "code", source: [], source_warning: null, decision: null,
    summary: "A control that a screen reader does not announce.", solution: { type: "general", summary: "Give the control a role.", steps: ["Use a button element."] },
    examples: [{ url, width: 390, state: [], selector: "div.card", html: '<div class="card">Open</div>', facts: {} }],
  });
  writeIssue(control("ISS-0c0c0c01", "/", version));
  writeIssue(control("ISS-0c0c0c02", "/other/", version));
  const second = await audit();
  const issues = new Map(readDir("issues").map((i) => [i.id, i]));
  const now = issues.get(select.id);
  const a = issues.get(oldA), b = issues.get(oldB);

  // 1: the old IDs that merge into one new ID.
  check(now?.status === "open" && [oldA, oldB].includes(now?.replaces), `1: the select keeps its ID of this version, open, and replaces one of the two old IDs (${now?.id} ${now?.status}, replaces ${now?.replaces})`);
  check(a?.status === "resolved" && a?.status_by.reason === "rule changed" && b?.status === "resolved" && b?.status_by.reason === "rule changed", `1: each of the two old IDs is resolved with the reason "rule changed", none with "fixed" (${a?.status} ${a?.status_by?.reason}, ${b?.status} ${b?.status_by?.reason})`);
  check(now?.origin === "code" && now?.solution.type === "specific", `1: the new ID takes the origin and the solution of the skill from the old ID that has them, in any order (origin ${now?.origin}, solution ${now?.solution.type})`);

  // 2: the issues of the listener test.
  const onHome = issues.get("ISS-0c0c0c01"), onOther = issues.get("ISS-0c0c0c02");
  check(onOther?.status === "not checked", `2: an issue of the listener test on a page that is not in the sample is not checked, because the test did not run there (${onOther?.status} ${onOther?.status_by?.reason || ""})`);
  check(onHome?.status === "resolved" && onHome?.status_by.reason === "fixed", `2: the same issue on a page of the sample is resolved: the test ran there and did not find it (${onHome?.status} ${onHome?.status_by?.reason || ""})`);
  check(second.summary.counts.resolved === 1, `1, 2: only the issue on the sample page counts as a fix (${second.summary.counts.resolved} resolved, ${second.summary.counts.resolved_rule_changed} rule changed)`);

  // The results of 1.3.0. One old ID of the select is put back as 1.3.0 wrote it: resolved with the reason "fixed" in the run where
  // the new ID was open. The issue of the listener test on /other/ is put back resolved in the same run. A refresh corrects both.
  const falseFix = { ...b, status_by: { ...b.status_by, reason: "fixed" } };
  writeIssue(falseFix);
  writeIssue({ ...onOther, status: "resolved", status_by: { ...onOther.status_by, reason: "fixed" } });
  refresh(config, dir);
  const refreshed = new Map(readDir("issues").map((i) => [i.id, i]));
  const summaryAfter = JSON.parse(fs.readFileSync(path.join(dir, "summary.json"), "utf8"));
  check(refreshed.get(oldB)?.status_by.reason === "rule changed" && refreshed.get(oldB)?.status_by.run === falseFix.status_by.run, `1: a refresh corrects a false "fixed" of 1.3.0 to "rule changed", with the run of the resolution (${refreshed.get(oldB)?.status} ${refreshed.get(oldB)?.status_by?.reason})`);
  check(refreshed.get("ISS-0c0c0c02")?.status === "not checked" && refreshed.get("ISS-0c0c0c01")?.status === "resolved" && refreshed.get("ISS-0c0c0c01")?.status_by.reason === "fixed", `2: a refresh corrects a false "resolved" of 1.3.0 on a page out of the sample to "not checked", and keeps the resolution on the sample page (${refreshed.get("ISS-0c0c0c02")?.status}, ${refreshed.get("ISS-0c0c0c01")?.status} ${refreshed.get("ISS-0c0c0c01")?.status_by?.reason})`);
  check(summaryAfter.counts.resolved === 1, `1, 2: after the refresh, only the issue on the sample page counts as a fix (${summaryAfter.counts.resolved} resolved)`);

  // The next audit corrects the false "fixed" too, and keeps the run and the date of the resolution.
  writeIssue(falseFix);
  await audit();
  const corrected = readDir("issues").find((i) => i.id === oldB);
  check(corrected?.status === "resolved" && corrected?.status_by.reason === "rule changed" && corrected?.status_by.run === falseFix.status_by.run, `1: the next audit corrects a false "fixed" of 1.3.0 to "rule changed", with the run of the resolution (${corrected?.status} ${corrected?.status_by?.reason}, run ${corrected?.status_by?.run === falseFix.status_by.run ? "kept" : corrected?.status_by?.run})`);
} finally {
  await new Promise((r) => server.close(r));
}

if (failures.length) { console.error(`\n${failures.length} checks failed`); process.exit(1); }
console.error("\nall checks passed");
