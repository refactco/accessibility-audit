// Changes from run to run with no change of the site. Each check is one item of the list of problems of the fourth full audit of a
// large site with 1.3.2. 1: the focus test does not report a control that is still moving after the key. 2: an issue in a state whose
// name changed continues under its new ID. 3: an old example path with no trailing slash is checked. 4: the pages of earlier results
// that the crawl did not find get one request. 5: the pages of the open questions of the sample tests join the sample. 6: the report
// and summary.json give the same counts. 7: a refresh writes the same summary.json. 8: when two old questions give one new ID, the
// answer stays. 9: the watch of the content that changes by itself skips the body. D: an issue of axe-core of a template criterion
// does not need the sample.
//
// Usage: node tests/false-changes.mjs [--verbose]
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AXE_VERSION } from "../src/axe.ts";
import { runAudit } from "../src/audit.ts";
import { configForUrl } from "../src/config.ts";
import { questionFingerprintOf } from "../src/issues.ts";
import { refresh } from "../src/refresh.ts";
import { stableIdsHtml } from "../src/stable.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "seeded-faults", "build", "false-changes");
const PORT = 8102;
const SITE = `http://127.0.0.1:${PORT}`;
const failures = [];
const check = (ok, message) => { console.error(`${ok ? "ok  " : "FAIL"} ${message}`); if (!ok) failures.push(message); };
const verbose = process.argv.includes("--verbose");
const sha = (s) => createHash("sha1").update(s).digest("hex");

// The parts of the site that change between the two runs: the text of the control of a state, and the image of /p/.
let sponsors = "Sponsors: Alpha Fund, Beta Trust";
let photo = "a-1.png";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const doc = (title, body, head = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>${head}</head><body>${body}</body></html>`;
const LINKS = ["/states/", "/other/", "/third/", "/fourth/", "/p/", "/ticker/", "/missing/", "/missing-2/"];
// 1: a skip link that slides down from under a fixed header in one second. 25 ms after the Tab key it is still under the header; at
// the end it is below the header and visible. 8: an image with a caption and the class that lazysizes sets.
const home = () => doc("Home", `<a class="skip" href="#main">Skip to content</a>
<header class="bar"><span>Site name</span></header>
<main id="main"><h1>Home</h1>${LINKS.map((p) => `<p><a href="${p}">Go to ${p.replace(/\//g, "") || "home"}</a></p>`).join("")}
<figure><img class=" lazyloaded" src="/img/cap.png" alt="" width="40" height="40"><figcaption>Our office at night</figcaption></figure></main>`,
`<style>.bar { position: fixed; top: 0; left: 0; right: 0; height: 50px; background: #fff; z-index: 10; } main { margin-top: 120px; }
.skip { position: absolute; top: 60px; left: 8px; padding: 10px; background: #000; color: #fff; z-index: 5; transform: translateY(-80px); transition: transform 1s linear; }
.skip:focus { transform: translateY(0); }</style>`);
const plain = (title) => doc(title, `<main><h1>${title}</h1><p>Text of the page.</p></main>`);
// 2: a disclosure whose name is the text of a list, as a select of a plugin. Its panel has an image with no alt.
const states = () => doc("States", `<main><h1>Funding</h1><button type="button" aria-expanded="false" aria-controls="panel"
onclick="const p = document.getElementById('panel'); p.hidden = !p.hidden; this.setAttribute('aria-expanded', String(!p.hidden));">${sponsors}</button>
<div id="panel" hidden><p>The list of the sponsors.</p><img src="/img/sponsor.png" width="40" height="40"></div></main>`);
// 9: a script adds an empty element to the body and hides the main content for a moment, again and again. A ticker changes its text.
const ticker = () => doc("Ticker", `<p id="tick">Item 1</p><div id="wrap"><main><h1>Ticker</h1><p>Text of the page.</p></main></div>
<script>let n = 1; setInterval(() => { document.getElementById("tick").textContent = "Item " + (++n); }, 300);
setInterval(() => { document.body.appendChild(document.createElement("div")); const w = document.getElementById("wrap"); w.hidden = !w.hidden; }, 400);</script>`);

const server = http.createServer((req, res) => {
  const p = new URL(req.url, SITE).pathname;
  const send = (body, type = "text/html; charset=utf-8", status = 200) => { res.writeHead(status, { "content-type": type }); res.end(body); };
  if (p === "/robots.txt") return send("User-agent: *\nAllow: /\n", "text/plain");
  if (p.startsWith("/img/")) return send(PNG, "image/png");
  // 3: an address with no trailing slash redirects to the page, as WordPress does.
  if (["/third", "/fourth", "/other"].includes(p)) { res.writeHead(301, { location: p + "/" }); return res.end(); }
  if (p === "/") return send(home());
  if (p === "/states/") return send(states());
  if (p === "/ticker/") return send(ticker());
  if (p === "/p/") return send(doc("Photo", `<main><h1>Photo</h1><img src="/img/${photo}" width="40" height="40"></main>`));
  // 4: a page that no link gives, but that still answers.
  if (["/other/", "/third/", "/fourth/", "/hidden-post/"].includes(p)) return send(plain("Page " + p));
  send(plain("Not found"), "text/html", 404);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const config = configForUrl(SITE, "production");
config.crawl.widths = [390];
config.crawl.rate_limit = 20;
config.crawl.random_sample_share = 0;
config.crawl.load_wait_seconds = 1;
config.crawl.sample_pages = [SITE + "/", SITE + "/states/"];
config.interaction.max_states_per_page = 2;
config.interaction.dry_submit = false;
const readDir = (name) => fs.readdirSync(path.join(dir, name)).map((f) => JSON.parse(fs.readFileSync(path.join(dir, name, f), "utf8")));
const byId = (name) => new Map(readDir(name).map((x) => [x.id, x]));
const write = (name, obj) => fs.writeFileSync(path.join(dir, name, obj.id + ".json"), JSON.stringify(obj, null, 1));
const remove = (name, id) => fs.rmSync(path.join(dir, name, id + ".json"), { force: true });
const audit = async () => {
  const lines = [];
  const result = await runAudit({ config, outDir: dir, log: (l) => lines.push(l) });
  if (verbose) for (const l of lines) console.error("     " + l);
  const pagesFile = fs.readFileSync(path.join(dir, "pages.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  return { result, lines, pagesFile, summary: JSON.parse(fs.readFileSync(path.join(dir, "summary.json"), "utf8")), report: fs.readFileSync(path.join(dir, "report.md"), "utf8") };
};
const outcomesOf = (r, u) => r.result.pages.find((p) => p.url === SITE + u)?.outcomes || [];
const stableFactsOf = (facts = {}) => { const { screenshot, measured, changes, texts, seconds, hiddenWidth, hiddenHeight, ...rest } = facts; return rest; };
const answer = { value: "no issue", confidence: "high", reason: "The caption says what the image shows.", model: "test", prompt_version: "1", date: "2026-11-01" };
const verification = { value: "no issue", agrees: true, confidence: "high", reason: "Same.", model: "test", prompt_version: "1", date: "2026-11-01" };

try {
  fs.rmSync(dir, { recursive: true, force: true });
  const first = await audit();

  // 1: the skip link is under the header only while it moves.
  const hidden1 = outcomesOf(first, "/").filter((o) => o.rule === "focus-entirely-hidden" && o.kind === "failed");
  check(!hidden1.length, `1: the focus test does not report a skip link that is still moving 25 ms after the key (${hidden1.map((o) => `${o.selector} top ${o.facts.rect?.top}, covered by ${o.facts.coveredBy || "nothing"}`).join("; ") || "no outcome"})`);
  // 9: the body is not content that changes by itself. The ticker is, with no text in its item.
  const watch = outcomesOf(first, "/ticker/").filter((o) => o.rule === "content-updates-by-itself");
  check(!watch.some((o) => /^body\b/.test(o.selector) || o.item.startsWith("body")), `9: the watch does not report the body when a script adds an element to it (${watch.map((o) => o.selector).join(", ") || "no outcome"})`);
  const tick = watch.find((o) => o.selector === "#tick");
  check(!!tick && tick.item === "p#tick||" && tick.html === '<p id="tick">', `9: the ticker is reported, with no text in its item and its HTML, so that its ID and its answer do not change with the timing (${tick ? `${tick.item}, ${tick.html}` : "not reported"})`);

  // The results that the second run compares with.
  const issues1 = readDir("issues");
  const stateIssue = issues1.find((i) => i.rule.id === "image-alt" && i.examples.some((e) => e.state?.length));
  const photoIssue = issues1.find((i) => i.rule.id === "image-alt" && i.examples.some((e) => e.url === "/p/"));
  check(!!stateIssue && stateIssue.examples[0].state[0] === "click " + sponsors && !!photoIssue, `the first run gives the image-alt issue in the state "click ${sponsors}" and on /p/ (${stateIssue?.id} ${stateIssue?.examples[0].state.join(">")}, ${photoIssue?.id})`);
  // The skill located the issue of the state.
  write("issues", { ...stateIssue, origin: "third-party-controlled", solution: { type: "specific", summary: "Give the sponsor image an alt text in the plugin settings.", steps: ["Open the plugin settings."] } });
  // An issue of the listener test that 1.1.1 found on /third, with no trailing slash. 1.3.0 merged the two forms of the address.
  const base = { ...photoIssue, certainty: "fail", question: null, replaces: null, origin: "unknown", source: [], source_warning: null, decision: null, status_by: { who: "engine", mode: "automatic", date: "2026-11-01", run: "2026-11-01T00:00:00Z" } };
  write("issues", { ...base, id: "ISS-3a3a3a01", status: "not checked", rule: { id: "control-without-role", engine: "a11y", engine_version: "1.3.0" }, wcag: { ...photoIssue.wcag, criterion: "4.1.2" },
    examples: [{ url: "/third", width: 390, state: [], selector: "div.card", html: '<div class="card">Open</div>', facts: {} }] });
  // 4: an issue and a question on a post that the site removed, and a question on a post that no link gives.
  write("issues", { ...base, id: "ISS-4a4a4a01", status: "open", examples: [{ ...photoIssue.examples[0], url: "/gone-post/", selector: "main > img", html: '<img src="/img/gone.png" width="40" height="40">' }] });
  const questions1 = readDir("questions");
  const cap = questions1.find((q) => q.evidence.rule === "alt-empty-with-caption");
  const q = (id, rule, criterion, pages, extra = {}) => ({ ...cap, id, fingerprint: sha(id), criterion, item_hashes: [], ai_answer: null, verification: undefined, evidence: { ...cap.evidence, url: pages[0], rule, pages }, ...extra });
  write("questions", q("Q-4a4a4a01", "no-reflow", "1.4.10", ["/gone-post/"]));
  write("questions", q("Q-4a4a4a02", "no-reflow", "1.4.10", ["/hidden-post/"]));
  // 5: a question of the focus test with no answer on /fourth/, a page out of the sample.
  write("questions", q("Q-5a5a5a01", "keyboard-trap", "2.1.2", ["/fourth/"]));
  // D: an issue of axe-core of 2.1.1, a template criterion, on /other/, a page out of the sample.
  write("issues", { ...base, id: "ISS-dadada01", status: "open", rule: { id: "scrollable-region-focusable", engine: "axe-core", engine_version: AXE_VERSION }, wcag: { ...photoIssue.wcag, criterion: "2.1.1" },
    examples: [{ url: "/other/", width: 390, state: [], selector: "div.scroll", html: '<div class="scroll">', facts: {} }] });
  // 8: the caption question as 1.3.1 stored it, twice: once with the class as it is now, once with ls-is-cached, the class of an
  // image in the cache of the browser. Only the second has an answer.
  const capOutcome = outcomesOf(first, "/").find((o) => o.rule === "alt-empty-with-caption");
  const cachedHtml = capOutcome.html.replace('class=" lazyloaded"', 'class=" ls-is-cached lazyloaded"');
  const legacy = (item, html, extra) => { const fp = questionFingerprintOf({ ...capOutcome, item }, config); const h = sha(stableIdsHtml(html) + JSON.stringify(stableFactsOf(capOutcome.facts))); return { ...cap, id: "Q-" + fp.slice(0, 8), fingerprint: fp, item_hash: h, item_hashes: [h.slice(0, 16)], evidence: { ...cap.evidence, html }, ...extra }; };
  const plainOld = legacy(capOutcome.item.replace(/^img\|/, "img.lazyloaded|"), capOutcome.html, { ai_answer: null });
  const cachedOld = legacy(capOutcome.item.replace(/^img\|/, "img.ls-is-cached.lazyloaded|"), cachedHtml, { ai_answer: answer, verification });
  check(capOutcome.html.includes('class=" lazyloaded"') && plainOld.id !== cachedOld.id && plainOld.id !== cap.id, `8: the two old caption questions have two IDs of 1.3.1 (${plainOld.id}, ${cachedOld.id}), and the ID of now is ${cap.id}`);
  remove("questions", cap.id); write("questions", plainOld); write("questions", cachedOld);

  // The site changes: the list of the sponsors and the photo of /p/.
  sponsors = "Sponsors: Alpha Fund, Gamma Foundation";
  photo = "a-2.png";
  const second = await audit();
  const i2 = byId("issues");
  const q2 = byId("questions");

  const hidden2 = outcomesOf(second, "/").filter((o) => o.rule === "focus-entirely-hidden" && o.kind === "failed");
  check(!hidden2.length, `1: the second run does not report the skip link either (${hidden2.length} outcomes)`);
  // 2: the issue of the state continues under its new ID.
  const cont = [...i2.values()].find((i) => i.rule.id === "image-alt" && i.examples.some((e) => e.state?.[0] === "click " + sponsors));
  const oldState = i2.get(stateIssue.id);
  check(!!cont && cont.id !== stateIssue.id && cont.replaces === stateIssue.id && cont.status === "open" && cont.origin === "third-party-controlled" && cont.solution.type === "specific" && cont.first_seen === stateIssue.first_seen,
    `2: the issue in the state with a new name continues the old one: open, with its origin and its solution (${cont ? `${cont.id} ${cont.status}, replaces ${cont.replaces}, origin ${cont.origin}, solution ${cont.solution.type}` : "no issue"})`);
  check(oldState?.status === "resolved" && oldState?.status_by.reason === "rule changed", `2: the old ID is resolved with the reason "rule changed", not "fixed" (${oldState?.status} ${oldState?.status_by?.reason || ""})`);
  check(/1 issues continue an older issue under a new ID/.test(second.report), `2: the report names the issue that continues an older one (${second.report.match(/\d+ issues continue[^\n]*/)?.[0] || "no line"})`);
  // 3: the path with no trailing slash.
  check(i2.get("ISS-3a3a3a01")?.status === "resolved" && i2.get("ISS-3a3a3a01")?.status_by.reason === "fixed", `3: an issue with the old path /third is checked on /third/, and resolved (${i2.get("ISS-3a3a3a01")?.status} ${i2.get("ISS-3a3a3a01")?.status_by?.reason || ""})`);
  // 4: the pages that the crawl did not find.
  check(i2.get("ISS-4a4a4a01")?.status === "page removed" && !q2.has("Q-4a4a4a01"), `4: the issue and the question of a post that gives 404 now are closed: page removed, and the question goes (issue ${i2.get("ISS-4a4a4a01")?.status}, question ${q2.has("Q-4a4a4a01") ? "kept" : "gone"})`);
  const earlierLine = second.report.match(/\d+ pages of earlier issues and questions were not found by the crawl[^\n]*/)?.[0] || "";
  check(q2.get("Q-4a4a4a02")?.not_checked === true && earlierLine.includes("/hidden-post/") && /1 are gone/.test(earlierLine), `4: the question of a page that still answers stays "not checked", and the report names the page (${earlierLine || "no line"})`);
  // 5: the page of the open question of the focus test.
  const fourth = second.pagesFile.find((p) => p.url === SITE + "/fourth/");
  check(fourth?.sample_reason === "open question" && !q2.has("Q-5a5a5a01") && second.lines.some((l) => /1 pages of open questions of the sample tests/.test(l)), `5: the page of an open question of the focus test joins the sample, so the question is checked (${fourth?.sample_reason || "not in the sample"}, question ${q2.has("Q-5a5a5a01") ? (q2.get("Q-5a5a5a01").not_checked ? "not checked" : "kept") : "gone"})`);
  // 6: the counts.
  const newPhoto = [...i2.values()].find((i) => i.rule.id === "image-alt" && i.examples.some((e) => e.url === "/p/") && i.status === "new");
  const row = second.report.split("\n").findIndex((l) => l.startsWith("| Pages found |"));
  const cells = second.report.split("\n")[row + 2]?.split("|").map((c) => c.trim());
  const c = second.summary.counts;
  check(newPhoto?.replaces === photoIssue.id && c.replaced === 1, `6: the new photo issue replaces the old one, and summary.json counts the pair as replaced (${newPhoto?.id} replaces ${newPhoto?.replaces}, replaced ${c.replaced})`);
  check(Number(cells?.[6]) === c.new && Number(cells?.[8]) === c.resolved + c.resolved_rule_changed, `6: the "Issues new" and "Resolved" columns of the report equal the counts of summary.json (columns ${cells?.[6]} and ${cells?.[8]}; summary new ${c.new}, resolved ${c.resolved} + ${c.resolved_rule_changed})`);
  // 8: the answer of the old question with ls-is-cached.
  const capNow = [...q2.values()].find((x) => x.evidence.rule === "alt-empty-with-caption" && x.evidence.url === "/");
  check(capNow?.ai_answer?.value === "no issue" && !!capNow?.verification && !q2.has(plainOld.id) && !q2.has(cachedOld.id), `8: when two old questions give one new ID, the answer of the one with an answer stays (${capNow?.id}, answer ${capNow?.ai_answer?.value || "none"}; old IDs ${q2.has(plainOld.id) || q2.has(cachedOld.id) ? "kept" : "gone"})`);
  // D: the axe-core issue of 2.1.1.
  const other = second.pagesFile.find((p) => p.url === SITE + "/other/");
  check(!other?.sample && i2.get("ISS-dadada01")?.status === "resolved" && i2.get("ISS-dadada01")?.status_by.reason === "fixed", `D: an axe-core issue of a template criterion on a page out of the sample is checked there, with no place in the sample (sample ${other?.sample_reason || "no"}, ${i2.get("ISS-dadada01")?.status} ${i2.get("ISS-dadada01")?.status_by?.reason || ""})`);

  // 7: a refresh with no new answer gives the same summary.json, issues, questions, and report.
  const files = (name) => Object.fromEntries(fs.readdirSync(path.join(dir, name)).map((f) => [f, fs.readFileSync(path.join(dir, name, f), "utf8")]));
  const before = { summary: fs.readFileSync(path.join(dir, "summary.json"), "utf8"), issues: files("issues"), questions: files("questions"), report: second.report };
  check(!!second.summary.coverage.pages_out_of_scope, `7: the summary has pages out of scope, the part that a refresh moved (${JSON.stringify(second.summary.coverage.pages_out_of_scope)})`);
  refresh(config, dir);
  const now = { summary: fs.readFileSync(path.join(dir, "summary.json"), "utf8"), issues: files("issues"), questions: files("questions"), report: fs.readFileSync(path.join(dir, "report.md"), "utf8") };
  const changed = (name) => Object.keys({ ...before[name], ...now[name] }).filter((f) => before[name][f] !== now[name][f]);
  check(before.summary === now.summary, `7: a refresh writes the same summary.json, byte for byte (${before.summary === now.summary ? "same" : "changed"})`);
  check(!changed("issues").length && !changed("questions").length && before.report === now.report, `7: a refresh changes no issue, no question, and no line of the report (issues ${changed("issues").join(", ") || "none"}, questions ${changed("questions").slice(0, 3).join(", ") || "none"}, report ${before.report === now.report ? "same" : "changed"})`);

  // 2: the results of 1.3.2 for the same change: the new ID is "new", with no origin, and the old ID is "fixed". A refresh corrects them.
  const cont132 = JSON.parse(now.issues[cont.id + ".json"]);
  const old132 = JSON.parse(now.issues[stateIssue.id + ".json"]);
  write("issues", { ...cont132, status: "new", origin: "unknown", solution: { type: "general", summary: "Add an alt text.", steps: ["Add an alt attribute."] } });
  write("issues", { ...old132, status_by: { ...old132.status_by, reason: "fixed" } });
  refresh(config, dir);
  const i3 = byId("issues");
  check(i3.get(cont.id)?.status === "open" && i3.get(cont.id)?.origin === "third-party-controlled" && i3.get(cont.id)?.solution.type === "specific" && i3.get(stateIssue.id)?.status_by.reason === "rule changed",
    `2: a refresh corrects the results of 1.3.2 for a new name of a state (${i3.get(cont.id)?.status}, origin ${i3.get(cont.id)?.origin}, old ${i3.get(stateIssue.id)?.status_by?.reason})`);
} finally {
  await new Promise((r) => server.close(r));
}

if (failures.length) { console.error(`\n${failures.length} checks failed`); process.exit(1); }
console.error("\nall checks passed");
