// The frames, the states, and the layout. Each check is one item of the list of problems of the seventh full audit of a large site,
// with 1.3.4, and of its first review cycle. 1: the focus test reads the control that has the focus inside a frame of another origin,
// not the frame element. 2: a question whose items are all in a state stays when its page leaves the sample, with its answers, and an
// open one brings its page into the sample. 3: the item of an element whose src has a fragment leaves the fragment out, so a frame
// whose script adds the times of the load to its address keeps its ID. 4: tasks --retry lists only the items of the last batches that
// still wait. 5: the report counts all the first AI answers. 6: the questions and the issues of visual-order-differs group by the kind
// of element, and the old questions of each item continue when their answers agree.
//
// Usage: node tests/frames-and-layout.mjs [--verbose]
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAudit } from "../src/audit.ts";
import { configForUrl } from "../src/config.ts";
import { answerQuestion, verifyQuestion } from "../src/decide.ts";
import { fingerprintOf, questionFingerprintOf } from "../src/issues.ts";
import { refresh } from "../src/refresh.ts";
import { stableHtml } from "../src/stable.ts";
import { writeTasks } from "../src/tasks.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "seeded-faults", "build", "frames-and-layout");
const PORT = 8104;
const SITE = `http://127.0.0.1:${PORT}`;
// The frames come from another origin, as the embedded form of a service.
const OTHER = `http://localhost:${PORT}`;
const failures = [];
const check = (ok, message) => { console.error(`${ok ? "ok  " : "FAIL"} ${message}`); if (!ok) failures.push(message); };
const verbose = process.argv.includes("--verbose");
const sha = (t) => createHash("sha1").update(t).digest("hex");

const doc = (title, body, head = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>${head}</head><body>${body}</body></html>`;

// 1: the field of the good form shows a red outline with the focus, as the form of a service on the large site. The field of the bad
// form shows no change. The late form is still loading when the Tab reaches it. 3: the script of the feed adds a new fragment to its address on each load, as the script of an embed does.
const inner = (focus) => doc("Form", `<form><label for="first">First name</label> <input id="first" name="first" type="text"></form>`, `<style>input { outline: none; border: 1px solid #767676; } input:focus { ${focus} }</style>`);
const forms = doc("Forms", `<main><h1>Forms</h1><p><a href="/">Home</a></p>
<iframe class="good-embed" title="Good form" src="${OTHER}/inner-good/" width="300" height="80"></iframe>
<iframe class="bad-embed" title="Bad form" src="${OTHER}/inner-bad/" width="300" height="80"></iframe>
<iframe class="late-embed" title="Late form" id="late" src="${OTHER}/placeholder/" width="300" height="80"></iframe>
<iframe class="feed-embed" id="feed" width="300" height="80"></iframe>
<p><a href="/a/">After the forms</a></p></main>
<script>document.getElementById("feed").src = "${OTHER}/feed/?v=1#" + encodeURIComponent(JSON.stringify({ os: Math.random() * 1000 }));</script>`);
// The late form loads the good form when its document gets the focus, as a lazy frame that the Tab scrolls into view.
const placeholder = doc("Loading", `<p>Loading.</p><script>addEventListener("focus", () => setTimeout(() => location.replace("/inner-good/"), 200), { once: true });</script>`);
// 2: a table with no header cells that only a click shows.
const statePage = (name, rows) => doc(name, `<main><h1>${name}</h1><p><button type="button" class="toggle" aria-expanded="false" aria-controls="panel" onclick="var p = document.getElementById('panel'); p.hidden = !p.hidden; this.setAttribute('aria-expanded', String(!p.hidden));">${name}</button></p>
<div id="panel" hidden><table>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table></div></main>`);
// 6: one layout of a template that reverses its columns, on pages with other words.
const layout = (title, cls, words) => doc(title, `<main><h1>${title}</h1><div class="${cls}" style="display:flex;flex-direction:row-reverse"><aside>Side</aside><div>${words}</div></div></main>`);
const LAYOUTS = { "/a/": ["two-col", "Alpha words of the page"], "/b/": ["two-col", "Beta words of the page"], "/c/": ["two-col", "Gamma words of the page"], "/d/": ["cards", "Delta cards"], "/e/": ["cards", "Epsilon cards"], "/f/": ["quote-box", "Zeta quote"] };
const PAGES = ["/", "/forms/", "/salary/", "/benefits/", ...Object.keys(LAYOUTS)];
const home = doc("Home", `<main><h1>Home</h1><ul>${PAGES.slice(1).map((p) => `<li><a href="${p}">Page ${p}</a></li>`).join("")}</ul></main>`);

const server = http.createServer((req, res) => {
  const p = new URL(req.url, SITE).pathname;
  const send = (body, type = "text/html; charset=utf-8", status = 200) => { res.writeHead(status, { "content-type": type }); res.end(body); };
  if (p === "/robots.txt") return send(`User-agent: *\nSitemap: ${SITE}/sitemap.xml\n`, "text/plain");
  if (p === "/sitemap.xml") return send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${PAGES.map((u) => `<url><loc>${SITE}${u}</loc></url>`).join("")}</urlset>`, "application/xml");
  if (p === "/") return send(home);
  if (p === "/forms/") return send(forms);
  if (p === "/inner-good/") return send(inner("outline: 2px solid #990000; border-color: #990000;"));
  if (p === "/inner-bad/") return send(inner("outline: none;"));
  if (p === "/feed/") return send(doc("Feed", "<p>The posts of the feed.</p>"));
  if (p === "/placeholder/") return send(placeholder);
  if (p === "/salary/") return send(statePage("Salary", [["Level", "Pay"], ["1", "100"], ["2", "200"]]));
  if (p === "/benefits/") return send(statePage("Benefits", [["Plan", "Cost"], ["A", "10"], ["B", "20"]]));
  if (LAYOUTS[p]) return send(layout("Page " + p, ...LAYOUTS[p]));
  send(doc("Not found", "<main><h1>Not found</h1></main>"), undefined, 404);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
// The other origin: the same server under the name localhost.
const other = http.createServer((req, res) => server.emit("request", req, res));
await new Promise((r) => other.listen(PORT, "::1", r).on("error", () => r()));

const config = configForUrl(SITE, "production");
config.crawl.widths = [390, 1280];
config.crawl.rate_limit = 20;
config.crawl.random_sample_share = 0;
config.crawl.load_wait_seconds = 1;
config.crawl.sample_pages = [SITE + "/", SITE + "/forms/", SITE + "/salary/", SITE + "/benefits/"];
config.interaction.max_states_per_page = 3;
config.interaction.dry_submit = false;
const readDir = (name) => fs.readdirSync(path.join(dir, name)).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, name, f), "utf8")));
const readOne = (name, id) => { try { return JSON.parse(fs.readFileSync(path.join(dir, name, id + ".json"), "utf8")); } catch { return null; } };
const writeOne = (name, data) => fs.writeFileSync(path.join(dir, name, data.id + ".json"), JSON.stringify(data, null, 1) + "\n");
const removeOne = (name, id) => fs.rmSync(path.join(dir, name, id + ".json"), { force: true });
const audit = async () => {
  const lines = [];
  const result = await runAudit({ config, outDir: dir, log: (l) => lines.push(l) });
  if (verbose) for (const l of lines) console.error("     " + l);
  const pagesFile = fs.readFileSync(path.join(dir, "pages.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  return { result, lines, pagesFile, issues: readDir("issues"), questions: readDir("questions") };
};
const outcomesOf = (r, u) => r.result.pages.find((p) => p.url === SITE + u)?.outcomes || [];
const tableQuestion = (r, u) => r.questions.find((q) => q.evidence.rule === "table-no-headers" && q.evidence.pages.includes(u));
const ai = (value, model = "test-model") => ({ by: "ai", model, confidence: "high", reason: "The test gives this answer.", facts: ["The test gives this fact."] });

try {
  fs.rmSync(dir, { recursive: true, force: true });
  const first = await audit();

  // 1: the focus test on the frames.
  const focus1 = outcomesOf(first, "/forms/").filter((o) => o.rule === "focus-not-visible");
  check(!focus1.some((o) => (o.html || "").includes("good-embed")), `1: a frame whose field shows an outline with the focus gives no focus-not-visible (${focus1.map((o) => o.kind + " " + (o.html || "").slice(0, 40)).join("; ") || "no outcome"})`);
  const bad = focus1.find((o) => (o.html || "").includes("bad-embed"));
  check(bad?.kind === "failed" && bad.facts?.frame === true && /input/.test(bad.facts?.focusedInFrame || ""), `1: a frame whose field shows no change with the focus gives focus-not-visible, with the field in the facts (${bad ? `${bad.kind}, ${JSON.stringify(bad.facts)}` : "no outcome"})`);
  const late = focus1.filter((o) => (o.html || "").includes("late-embed"));
  check(!late.length, `1: a frame that is still loading when the Tab reaches it is read after its load, and its field shows an outline (${late.map((o) => o.kind + " " + JSON.stringify(o.facts)).join("; ") || "no outcome"})`);
  const feedFocus = focus1.filter((o) => (o.html || "").includes("feed-embed"));
  check(feedFocus.length > 0 && feedFocus.every((o) => o.kind === "failed" && o.facts?.focusedInFrame === "the document of the frame"), `1: a frame with no control that takes the focus and shows no change gives focus-not-visible, as before (${feedFocus.map((o) => o.kind + " " + JSON.stringify(o.facts)).join("; ") || "no outcome"})`);
  const frameIssues = first.issues.filter((i) => i.rule.id === "focus-not-visible");
  check(frameIssues.length >= 1 && frameIssues.every((i) => !i.examples.some((e) => e.html.includes("good-embed"))) && frameIssues.some((i) => i.examples.some((e) => e.html.includes("bad-embed"))),
    `1: the issues name the bad frame only (${frameIssues.map((i) => i.id + " " + i.examples[0].html.slice(0, 40)).join("; ") || "none"})`);

  // 3: the frame whose address has a new fragment on each load.
  const feedIssue1 = first.issues.find((i) => i.rule.id === "frame-title" && i.examples.some((e) => e.html.includes("feed-embed")));
  const withFragment = outcomesOf(first, "/forms/").filter((o) => /%7B|#\{/.test(o.item || ""));
  check(!!feedIssue1 && !withFragment.length, `3: the items leave out the fragment of a src (${feedIssue1 ? feedIssue1.id : "no frame-title issue"}; items with a fragment: ${withFragment.map((o) => o.item).join(", ") || "none"})`);

  // 2: the questions of the tables that a click shows.
  const salary1 = tableQuestion(first, "/salary/"), benefits1 = tableQuestion(first, "/benefits/");
  check(salary1?.evidence.in_state === true && benefits1?.evidence.in_state === true, `2: a question whose items are all in a state says so (${salary1?.id} ${salary1?.evidence.in_state}, ${benefits1?.id} ${benefits1?.evidence.in_state})`);
  const restQuestions = first.questions.filter((q) => q.evidence.rule !== "table-no-headers" && q.evidence.in_state);
  check(!restQuestions.length, `2: a question at rest does not say in_state (${restQuestions.map((q) => q.id).join(", ") || "none"})`);

  // 6: one question for each kind of element of the layout.
  const layoutOutcomes = first.result.pages.flatMap((p) => p.outcomes).filter((o) => o.rule === "visual-order-differs");
  const kindOfPage = (o) => LAYOUTS[new URL(o.url).pathname]?.[0];
  const groupedId = (cls) => "Q-" + questionFingerprintOf(layoutOutcomes.find((o) => kindOfPage(o) === cls), config).slice(0, 8);
  const layout1 = first.questions.filter((q) => q.evidence.rule === "visual-order-differs");
  const twoCol = layout1.find((q) => q.id === groupedId("two-col"));
  check(layout1.length === 3 && twoCol?.pages === 3, `6: the layout of a template gives one question for its pages, not one for each page (${layout1.map((q) => `${q.id} ${q.pages} pages`).join(", ") || "none"})`);

  // The results of 1.3.4 and older: one question for each item, with its answers. The old questions of two-col agree on "no issue",
  // one of them with no verification yet. The old questions of cards differ. The old question of quote-box says "issue".
  const template = twoCol;
  const oldIds = { "two-col": [], cards: [], "quote-box": [] };
  for (const q of layout1) removeOne("questions", q.id);
  const byOld = new Map();
  for (const o of layoutOutcomes) { const fp = questionFingerprintOf(o, config, o.item); if (!byOld.has(fp)) byOld.set(fp, o); }
  for (const [fp, o] of byOld) {
    const { screenshot: _s, ...facts } = o.facts || {};
    const h = sha(stableHtml(o.html || "") + JSON.stringify(facts));
    const id = "Q-" + fp.slice(0, 8);
    writeOne("questions", { ...template, id, fingerprint: fp, item_hash: h, item_hashes: [h.slice(0, 16)], evidence: { ...template.evidence, url: new URL(o.url).pathname, html: o.html, facts: o.facts, pages: [new URL(o.url).pathname], occurrences: 1 }, pages: 1, ai_answer: null, verification: undefined, sample: false });
    oldIds[kindOfPage(o)].push(id);
  }
  oldIds["two-col"].forEach((id, n) => { answerQuestion(dir, id, "no issue", ai()); if (n > 0) verifyQuestion(dir, id, "no issue", ai("test-verifier")); });
  oldIds.cards.forEach((id, n) => { const v = n === 0 ? "no issue" : "issue"; answerQuestion(dir, id, v, ai()); verifyQuestion(dir, id, v, ai("test-verifier")); });
  for (const id of oldIds["quote-box"]) { answerQuestion(dir, id, "issue", ai()); verifyQuestion(dir, id, "issue", ai("test-verifier")); }
  check(oldIds["two-col"].length === 3 && oldIds.cards.length === 2 && oldIds["quote-box"].length === 1, `6: the setup has the old questions of 1.3.4, one for each page (${Object.entries(oldIds).map(([k, v]) => `${k} ${v.length}`).join(", ")})`);
  // 2: the salary question gets an answer, so the next audit does not bring its page into the sample.
  answerQuestion(dir, salary1.id, "no issue", ai()); verifyQuestion(dir, salary1.id, "no issue", ai("test-verifier"));

  refresh(config, dir);
  const after = readDir("questions");
  const gone = Object.values(oldIds).flat().filter((id) => after.some((q) => q.id === id));
  check(!gone.length, `6: the refresh removes the old questions of each item (${gone.join(", ") || "none left"})`);
  const twoColNow = readOne("questions", groupedId("two-col")), cardsNow = readOne("questions", groupedId("cards")), quoteNow = readOne("questions", groupedId("quote-box"));
  check(twoColNow?.ai_answer?.value === "no issue" && twoColNow.pages === 3, `6: the old answers that agree continue in the question of the layout (${twoColNow ? `${twoColNow.ai_answer?.value || "no answer"}, ${twoColNow.verification?.value || "no verification"}, ${twoColNow.pages} pages` : "no question"})`);
  check(cardsNow && !cardsNow.ai_answer, `6: old answers that differ do not continue: the question waits for a new answer (${cardsNow ? cardsNow.ai_answer?.value || "no answer" : "no question"})`);
  const layoutIssues = () => readDir("issues").filter((i) => i.rule.id === "visual-order-differs");
  const quoteIssue = layoutIssues()[0];
  check(quoteNow?.ai_answer?.value === "issue" && layoutIssues().length === 1 && quoteIssue.id === "ISS-" + fingerprintOf(layoutOutcomes.find((o) => kindOfPage(o) === "quote-box"), config).slice(0, 8),
    `6: an agreed "issue" gives one issue for the kind of element (${layoutIssues().map((i) => `${i.id} ${i.status}`).join(", ") || "none"})`);

  // 6: the issue of 1.3.4 had the ID of its item. The first refresh with 1.3.5 moves it to the ID of its kind of element, with its
  // status, its origin, and its solution. First an open issue, then a new one of the same run.
  const quoteOutcome = layoutOutcomes.find((o) => kindOfPage(o) === "quote-box");
  const oldIssueId = "ISS-" + sha(`a11y|visual-order-differs|1.3.2|${quoteOutcome.item}|`).slice(0, 8);
  const oldIssue = (status, origin) => ({ ...quoteIssue, id: oldIssueId, status, origin, solution: { type: "specific", summary: `Put the quote first in the code. A person can run refact-a11y dismiss ${oldIssueId} when the order is right.`, steps: ["Change the order of the code."] } });
  removeOne("issues", quoteIssue.id); writeOne("issues", oldIssue("open", "code"));
  refresh(config, dir);
  const moved = readOne("issues", quoteIssue.id), oldNow = readOne("issues", oldIssueId);
  check(moved?.status === "open" && moved.replaces === oldIssueId && moved.origin === "code" && moved.solution?.type === "specific" && moved.solution.summary.includes(quoteIssue.id) && !moved.solution.summary.includes(oldIssueId)
    && oldNow?.status === "resolved" && oldNow.status_by?.reason === "rule changed",
    `6: an open issue of an item moves to the ID of its kind, and the old ID is "rule changed" (${moved ? `${moved.status}, replaces ${moved.replaces}, origin ${moved.origin}` : "no issue"}; old ${oldNow ? `${oldNow.status} ${oldNow.status_by?.reason || ""}` : "gone"})`);
  removeOne("issues", quoteIssue.id); writeOne("issues", oldIssue("new", "content"));
  refresh(config, dir);
  const movedNew = readOne("issues", quoteIssue.id);
  check(movedNew?.status === "new" && !movedNew.replaces && movedNew.origin === "content" && !readOne("issues", oldIssueId),
    `6: a new issue of the same run moves with its work, and stays new (${movedNew ? `${movedNew.status}, replaces ${movedNew.replaces}, origin ${movedNew.origin}` : "no issue"}; old ${readOne("issues", oldIssueId) ? "stays" : "gone"})`);

  // The second audit: the state pages are not pages of the settings any more.
  config.crawl.sample_pages = [SITE + "/", SITE + "/forms/"];
  const second = await audit();
  const salary2 = second.questions.find((q) => q.id === salary1.id), benefits2 = second.questions.find((q) => q.id === benefits1.id);
  const benefitsPage = second.pagesFile.find((p) => p.url === SITE + "/benefits/");
  check(salary2?.not_checked === true && salary2.ai_answer?.value === "no issue" && salary2.verification?.value === "no issue",
    `2: an answered question of a state stays, "not checked", with its answers, when its page leaves the sample (${salary2 ? `not checked ${!!salary2.not_checked}, ${salary2.ai_answer?.value || "no answer"}` : "gone"})`);
  check(benefitsPage?.sample_reason === "open question" && benefits2 && !benefits2.not_checked, `2: an open question of a state brings its page into the sample, and the state runs (${benefitsPage?.sample_reason || "not in the sample"}; ${benefits2 ? (benefits2.not_checked ? "not checked" : "checked") : "gone"})`);
  const feedIssue2 = second.issues.find((i) => i.rule.id === "frame-title" && i.examples.some((e) => e.html.includes("feed-embed")));
  check(!!feedIssue1 && feedIssue2?.id === feedIssue1.id && feedIssue2.status === "open", `3: the frame whose script adds a new fragment keeps its issue ID in the next run (${feedIssue1?.id} then ${feedIssue2 ? `${feedIssue2.id} ${feedIssue2.status}` : "none"})`);
  const twoCol2 = second.questions.find((q) => q.id === groupedId("two-col"));
  check(twoCol2?.ai_answer?.value === "no issue" && second.questions.filter((q) => q.evidence.rule === "visual-order-differs").length === 3, `6: the next audit keeps the layout questions and their answers (${twoCol2 ? twoCol2.ai_answer?.value || "no answer" : "gone"})`);

  // 4: tasks --retry. The first call lists one question. An agent leaves it: the retry lists it again. Once it has an answer, the retry lists nothing.
  const tasksDir = path.join(dir, "runs", "tasks-test");
  const one = writeTasks(config, dir, "review", tasksDir, 20, 1);
  const firstId = JSON.parse(fs.readFileSync(one.files[0], "utf8")).questions[0];
  const retry = writeTasks(config, dir, "review", tasksDir, 20, undefined, true);
  const retryIds = retry.files.flatMap((f) => JSON.parse(fs.readFileSync(f, "utf8")).questions);
  check(one.count === 1 && retry.retry && retryIds.join(",") === firstId, `4: --retry lists the item that the last batch left, and nothing else (${firstId}; retry ${retryIds.join(", ") || "none"}, ${retry.waiting} wait)`);
  answerQuestion(dir, firstId, "unsure", { ...ai(), confidence: "low" }); verifyQuestion(dir, firstId, "unsure", ai("test-verifier"));
  const done = writeTasks(config, dir, "review", tasksDir, 20, undefined, true);
  const next = writeTasks(config, dir, "review", tasksDir, 20, 1);
  const nextId = next.files.length ? JSON.parse(fs.readFileSync(next.files[0], "utf8")).questions[0] : "";
  check(done.count === 0 && next.count === 1 && nextId !== firstId, `4: after the answer the retry lists nothing, and a call with no retry lists the next item (retry ${done.count}; next ${nextId || "none"})`);

  // 5: the report counts all the first AI answers, the unsure ones too.
  refresh(config, dir);
  const report = fs.readFileSync(path.join(dir, "report.md"), "utf8");
  const m = report.match(/The AI answered (\d+) questions \((\d+) of them unsure\), and a person answered \d+\. The verifier, a second independent AI pass, checked (\d+)/);
  check(!!m && Number(m[2]) === 1 && Number(m[1]) >= Number(m[3]), `5: the report counts the unsure first answers, so the verifier never checked more than the AI answered (${m ? m[0] : report.split("\n").find((l) => l.startsWith("The AI answered")) || "no sentence"})`);
} finally {
  await new Promise((r) => server.close(r));
  await new Promise((r) => other.close(() => r()));
}

if (failures.length) { console.error(`\n${failures.length} checks failed.`); process.exit(1); }
console.error("\nAll checks passed.");
process.exit(0);
