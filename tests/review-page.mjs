// The review page of 1.3.7, and the engine fixes of the same release.
//
// Part 1, the engine. (a) An image-of-text answer stays when the measured colors change: 1.3.6 measured them in a new way, and all its
// answers went. (b) A select with a placeholder keeps its item and its answer when the site adds an option and the address of the
// options changes, as a weekly archive does: 1.3.6 gave it a new question each week, and its issue was "fixed". (c) The item of a select
// in the browser, and the item of 1.3.6 from the HTML. (d) The dry submit presses a submit control that takes no click with the keyboard.
// Part 2, the page. The four views, the queue of decisions with the name, the keys, the change of an answer, the AI answers of a sample
// question that open after the answer, a kept issue that goes back to the locate step, the undo of a dismiss, a write that does not come
// from the page, the client report, axe-core on each view, and the width of a phone.
//
// Usage: node tests/review-page.mjs [--verbose]
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { runAudit } from "../src/audit.ts";
import { HELPERS } from "../src/browser.ts";
import { configForUrl } from "../src/config.ts";
import { answerQuestion, locateIssue, verifyQuestion } from "../src/decide.ts";
import { buildQuestions } from "../src/issues.ts";
import { refresh } from "../src/refresh.ts";
import { serveReview } from "../src/review.ts";
import { legacyItems, placeholderOf, selectHtml } from "../src/stable.ts";
import { writeTasks } from "../src/tasks.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "seeded-faults", "build", "review-page");
const PORT = 8106, REVIEW = 4199;
const SITE = `http://127.0.0.1:${PORT}`;
const failures = [];
const check = (ok, message) => { console.error(`${ok ? "ok  " : "FAIL"} ${message}`); if (!ok) failures.push(message); };
const verbose = process.argv.includes("--verbose");
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");

// Part 1 (a) and (b): the answers of buildQuestions, with no browser.
{
  const config = configForUrl(SITE, "production");
  const page = (o) => [{ url: SITE + "/", outcomes: [o], states: [] }];
  const image = (facts) => ({ engine: "a11y", rule: "image-of-text", criterion: "1.4.5", kind: "candidate", decider: "ai", url: SITE + "/", width: 1280, state: [], selector: "a > img", item: "img|brochure.png|",
    html: '<img src="/up/brochure.png" alt="Download a Brochure">', question: "Is this an image of text?", summary: "An image of text.", facts });
  const before = buildQuestions(page(image({ src: SITE + "/up/brochure.png", alt: "Download a Brochure", width: 325, height: 43, inLink: true, colors: [{ color: "#990000", share: 0.781 }], flatShare: 0.887, nearText: "" })), config, new Map())[0];
  before.ai_answer = { value: "issue", confidence: "high", reason: "Text in the image.", model: "test", prompt_version: "1", date: "2026-11-06" };
  before.verification = { value: "issue", confidence: "high", reason: "Text.", model: "test", prompt_version: "1", date: "2026-11-06", agrees: true };
  // The item hash of 1.3.6 included the measured facts: an old file keeps that hash. The example in the file is what the answer saw.
  const after = buildQuestions(page(image({ src: SITE + "/up/brochure.png", alt: "Download a Brochure", width: 324, height: 43, inLink: true, colors: [{ color: "#990000", share: 0.821 }], flatShare: 0.9, ink: 0.132, nearText: "" })), config, new Map([[before.id, before]]))[0];
  check(after.id === before.id && after.ai_answer?.value === "issue" && after.verification?.agrees === true, `(a) the image-of-text answer stays when the colors, the size, and ink change (${after.ai_answer?.value || "no answer"})`);
  const other = buildQuestions(page(image({ src: SITE + "/up/brochure.png", alt: "Brochure of 2027", width: 325, height: 43, inLink: true, colors: [{ color: "#990000", share: 0.781 }], flatShare: 0.887, nearText: "" })), config, new Map([[before.id, before]]))[0];
  check(!other.ai_answer, "(a) the answer goes when the alt text changes");

  const select = (week, html) => ({ engine: "a11y", rule: "change-of-context-on-input", criterion: "3.2.2", kind: "cantTell", decider: "ai", url: SITE + "/", width: 1280, state: [], selector: "#archive", item: "select#archive|archive-dropdown|Select Week",
    html, question: "Does the page tell the user?", summary: "A change of a select loads a new page.", facts: { navigation: [`${SITE}/?w=${week}`], url: SITE + "/" } });
  const html = (week) => `<select id="archive" name="archive-dropdown" onchange="location.href=this.value"> <option value="">Select Week</option> <option value="/?w=${week}"> Week ${week}, November 2, 2026&#8211;November 8, 2026 </option> <option value="/?w=${week - 1}"> Week ${week - 1} </option></select>`;
  const week44 = buildQuestions(page(select(44, html(44))), config, new Map())[0];
  week44.ai_answer = { value: "issue", confidence: "high", reason: "No warning.", model: "test", prompt_version: "1", date: "2026-11-06" };
  const week45 = buildQuestions(page(select(45, html(45))), config, new Map([[week44.id, week44]]))[0];
  check(week45.id === week44.id && week45.ai_answer?.value === "issue", `(b) the select keeps its question and its answer when a week is added and the address changes (${week45.id} ${week45.ai_answer?.value || "no answer"})`);

  // (c) the item of 1.3.6 from the HTML: the text of all the options, as the browser showed it.
  check(placeholderOf(html(45)) === "Select Week" && placeholderOf('<select><option value="a">A</option></select>') === null, "(c) the placeholder of a select is the first option with no value");
  check(selectHtml(html(45)) === '<select id="archive" name="archive-dropdown" onchange="location.href=this.value"><option value="">Select Week</option>', `(c) the hash of a select keeps its tag and its placeholder (${selectHtml(html(45))})`);
  const old = legacyItems("select#archive|archive-dropdown|Select Week", html(45));
  check(old.includes("select#archive|archive-dropdown|Select Week Week 45, November 2, 2026\u2013No"), `(c) the old item of the select comes from its HTML, 40 characters, with the entity as the browser shows it (${old.join(" ; ")})`);
}

// The site of the audits. WEEK changes between the audits, as a weekly archive does.
let WEEK = 44;
const doc = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const home = () => doc("Bulletin", `<main><h1>Bulletin</h1>
<p>The archive of the bulletin.</p>
<select id="archive" name="archive-dropdown" onchange="location.href=this.value"><option value="">Select Week</option><option value="/other/?w=${WEEK}">Week ${WEEK}</option><option value="/other/?w=${WEEK - 1}">Week ${WEEK - 1}</option></select>
<form id="join" action="/join/" method="post"><p><label for="n">Your name</label> <input id="n" name="fullname" required></p><p><label for="m">Your email</label> <input id="m" type="email" name="mail" autocomplete="email" required></p><button type="submit" style="pointer-events:none">Join</button></form>
<p><a href="/other/"><img src="/logo.png" width="40" height="40"></a></p>
<p><input type="email" name="news" aria-label="Email for the news"></p>
<p><video controls width="320" height="180" src="/clip.mp4"></video></p>
</main>`);
const other = () => doc("Other page", `<main><h1>Other page</h1><p>Text of the page.</p><p><a href="/">Home</a></p></main>`);
const server = http.createServer((req, res) => {
  const p = new URL(req.url, SITE).pathname;
  const send = (body, type = "text/html; charset=utf-8", status = 200) => { res.writeHead(status, { "content-type": type }); res.end(body); };
  if (p === "/robots.txt") return send("User-agent: *\nAllow: /\n", "text/plain");
  if (p === "/") return send(home());
  if (p === "/other/") return send(other());
  if (p === "/logo.png") return send(PNG, "image/png");
  send(doc("Not found", "<main><h1>Not found</h1></main>"), "text/html; charset=utf-8", 404);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const config = configForUrl(SITE, "production");
config.crawl.widths = [1280];
config.crawl.rate_limit = 20;
config.crawl.random_sample_share = 0;
config.interaction.max_states_per_page = 1;
config.report = { prepared_by: "Example Studio", contact: "audits@example.test" };
const read = (kind, id) => JSON.parse(fs.readFileSync(path.join(dir, kind, id + ".json"), "utf8"));
const all = (kind) => fs.readdirSync(path.join(dir, kind)).map((f) => JSON.parse(fs.readFileSync(path.join(dir, kind, f), "utf8")));
const audit = async () => { const lines = []; const result = await runAudit({ config, outDir: dir, log: (l) => lines.push(l) }); if (verbose) for (const l of lines) console.error("     " + l); return { result, lines }; };

let browser, review;
try {
  fs.rmSync(dir, { recursive: true, force: true });
  const first = await audit();

  // (d) The submit control with pointer-events: none takes the keyboard.
  const find = first.result.dryRuns.find((r) => r.form.selector === "#join");
  check(!!find && find.submissions[0].kind !== "error" && find.submissions[0].pressed === "keyboard", `(d) the dry submit pressed the control that takes no click with the keyboard (${find ? find.submissions.map((s) => `${s.kind}${s.pressed ? " by " + s.pressed : ""}${s.reason ? " " + s.reason : ""}`).join("; ") : "no dry submit of #join"})`);
  check(first.lines.some((l) => l.includes("dry submit / 'Join'") && l.includes("by the keyboard")), `(d) the log says that the keyboard pressed it (${first.lines.filter((l) => l.includes("dry submit")).map((l) => l.trim()).join("; ") || "no line"})`);

  // (b) in a real audit: the question of the select, answered, then a new week.
  const archive = all("questions").find((q) => q.evidence.rule === "change-of-context-on-input");
  check(!!archive, `audit 1 gives a question for the archive select (${all("questions").map((q) => q.evidence.rule).join(", ")})`);
  if (archive) {
    answerQuestion(dir, archive.id, "issue", { by: "ai", model: "test", confidence: "high", reason: "No text says that a choice loads a page." });
    verifyQuestion(dir, archive.id, "issue", { by: "ai", model: "test", confidence: "high", reason: "The page changes at once." });
    refresh(config, dir);
    const issue = all("issues").find((i) => i.rule.id === "change-of-context-on-input");
    WEEK = 45;
    await audit();
    const again = all("questions").find((q) => q.evidence.rule === "change-of-context-on-input");
    const issueAgain = issue ? read("issues", issue.id) : null;
    check(again?.id === archive.id && again?.ai_answer?.value === "issue", `(b) after a new week, the select has the same question and its answer (${again?.id} ${again?.ai_answer?.value || "no answer"})`);
    check(!!issue && issueAgain?.status === "open", `(b) its issue stays open, not "fixed" (${issue?.id} ${issueAgain?.status} ${issueAgain?.status_by?.reason || ""})`);
  }

  // The data of the page: a question where the AI reviews differ, a sample question, and an issue for which the review proposes no change.
  const questions = all("questions");
  const label = questions.find((q) => q.evidence.rule === "field-no-visible-label");
  const sample = questions.find((q) => q.kind === "review" && q !== label && q.evidence.rule !== "change-of-context-on-input" && !q.ai_answer);
  check(!!label && !!sample, `the audit gives a label question and one more review question (${questions.map((q) => q.evidence.rule).join(", ")})`);
  if (label) { answerQuestion(dir, label.id, "no issue", { by: "ai", model: "test", confidence: "medium", reason: "The text before it names the field.", facts: ["The field has the label Email for the news only for a screen reader."] }); verifyQuestion(dir, label.id, "issue", { by: "ai", model: "test", confidence: "medium", reason: "No visible label." }); }
  if (sample) answerQuestion(dir, sample.id, "no issue", { by: "ai", model: "test", confidence: "medium", reason: "Fine.", facts: ["A fact."], sampleShare: 1 });
  const logo = all("issues").find((i) => ["link-name", "image-alt"].includes(i.rule.id));
  check(!!logo, `the audit gives an issue for the logo link (${all("issues").map((i) => i.rule.id).join(", ")})`);
  if (logo) locateIssue(dir, logo.id, { origin: "content", source: [], solution: { summary: "No change is needed: the logo link repeats the link to the other page.", steps: [] } });
  const fixable = all("issues").find((i) => i.id !== logo?.id && ["new", "open"].includes(i.status));
  // The results of an older engine, refreshed with this one. A refresh with the engine of the run adds nothing (false-changes.mjs).
  const summaryPath = path.join(dir, "summary.json");
  const older = JSON.parse(fs.readFileSync(summaryPath, "utf8")); older.versions.engine = "1.3.7"; fs.writeFileSync(summaryPath, JSON.stringify(older, null, 1) + "\n");
  refresh(config, dir);
  const version = JSON.parse(fs.readFileSync(path.join(here, "..", "package.json"), "utf8")).version;
  const refreshed = JSON.parse(fs.readFileSync(path.join(dir, "summary.json"), "utf8")).versions;
  check(refreshed.refreshed_with === version && /^\d{4}-\d{2}-\d{2}$/.test(refreshed.refreshed_on || ""), `the summary names the newer engine of the refresh (${JSON.stringify(refreshed)})`);
  check(fs.readFileSync(path.join(dir, "report.md"), "utf8").includes(`Refreshed on ${refreshed.refreshed_on} with engine ${version}.`), "the report names the engine of the refresh");

  review = await serveReview(config, dir, { port: REVIEW, open: false });
  const base = review.url;
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text()); });
  const axe = async (name) => {
    await page.addScriptTag({ path: AXE });
    const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } })).violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0]?.target?.join(" ")}`));
    check(r.length === 0, `axe-core finds no violation on ${name} (${r.join("; ") || "none"})`);
  };

  // The overview opens when decisions wait? No: the decisions open first when some wait, and the overview has the call to start.
  await page.goto(base); await page.waitForTimeout(500);
  check(page.url().endsWith("/") && await page.isVisible("#view-decisions"), "the page opens on Decisions when decisions wait");
  await page.goto(base + "#overview"); await page.waitForTimeout(400);
  check(await page.isVisible("#start") && (await page.textContent("#view-overview h1")) === "Overview", "the overview has the button that starts the review");
  check((await page.title()).startsWith("Overview · "), `the title names the view (${await page.title()})`);
  await axe("the overview");
  await page.goto(base + "#method"); await page.waitForTimeout(300);
  await axe("the method");

  // Decisions: the label question, then the name, then key 2 answers "Not an issue".
  await page.goto(base + `#decisions/${label?.id}`); await page.waitForTimeout(600);
  const groups = await page.$$eval("#d-list tr.grp th", (t) => t.map((x) => x.textContent));
  check(groups.some((g) => g.startsWith("The AI reviews differ")) && groups.some((g) => g.startsWith("Sample: check the AI")) && groups.some((g) => g.startsWith("Proposed: no change")), `the queue has the groups (${groups.join(" | ")})`);
  await page.click("#d-ai-btn"); await page.click("#d-raw-btn"); await page.waitForTimeout(150);
  await axe("the decisions with the AI answers open");
  await page.focus("#d-title");
  await page.keyboard.press("2"); await page.waitForTimeout(200);
  check(await page.isVisible("#d-namebox"), "the first answer asks for the name");
  await page.fill("#d-name", "Test Reviewer"); await page.click("#d-name-save"); await page.waitForTimeout(600);
  check(read("questions", label.id).person_answer?.value === "no issue" && read("questions", label.id).person_answer?.by === "Test Reviewer", "key 2 saves the answer Not an issue with the name");
  check((await page.textContent("#d-msg")).startsWith("Saved: Not an issue"), `the page says that the answer is saved (${await page.textContent("#d-msg")})`);
  await page.focus("#d-note"); await page.keyboard.type("1"); await page.waitForTimeout(200);
  check(read("questions", label.id).person_answer?.value === "no issue", "a key in a text field does not answer");
  await page.click("#d-change"); await page.waitForTimeout(500);
  check(read("questions", label.id).person_answer === null, "Change takes the answer back");

  // The sample question: its AI answers open after the answer.
  if (sample) {
    await page.goto(base + `#decisions/${sample.id}`); await page.waitForTimeout(600);
    check(await page.getAttribute("#d-ai-btn", "aria-disabled") === "true" && await page.isHidden("#d-ai"), "the AI answers of a sample question stay closed before the answer");
    await page.click('#d-foot button.ans[data-value="issue"]'); await page.waitForTimeout(600);
    check(await page.getAttribute("#d-ai-btn", "aria-disabled") === null, "they can open after the answer");
    await page.click("#d-ai-btn"); await page.click("#d-facts-wrong"); await page.waitForTimeout(200);
    check((await page.textContent("#d-msg")).includes("which fact is wrong") && !read("questions", sample.id).facts_check, "A fact is wrong needs a note");
  }

  // The proposed no change: keep the issue. It goes back to the locate step.
  if (logo) {
    await page.goto(base + `#decisions/${logo.id}`); await page.waitForTimeout(600);
    await page.click('#d-foot button.ans[data-value="kept"]'); await page.waitForTimeout(600);
    const kept = read("issues", logo.id);
    check(kept.decision?.status === "kept" && ["new", "open"].includes(kept.status), `Keep as an issue saves a kept decision and the issue stays open (${kept.decision?.status} ${kept.status})`);
    const tasks = writeTasks(config, dir, "locate", path.join(dir, "tasks-test"));
    const ids = tasks.files.flatMap((f) => JSON.parse(fs.readFileSync(f, "utf8")).issues);
    check(ids.includes(logo.id), `the kept issue goes back to the locate step (${ids.join(", ") || "no task"})`);
  }

  // Issues: the filter of who fixes it, a dismiss that needs a reason, and the undo.
  await page.goto(base + "#issues?who=Content"); await page.waitForTimeout(600);
  check(await page.inputValue("#i-who") === "Content", "the filter of the address applies");
  if (fixable) {
    await page.goto(base + `#issues/${fixable.id}`); await page.waitForTimeout(600);
    await page.$$eval("#i-body button[data-disc]", (b) => b.forEach((x) => x.click()));
    await axe("the issues with the details open");
    await page.click("#i-dismiss"); await page.waitForTimeout(200);
    check(read("issues", fixable.id).status !== "dismissed" && (await page.textContent("#i-msg")).includes("reason"), "Dismiss needs a reason");
    await page.fill("#i-reason", "false positive"); await page.click("#i-dismiss"); await page.waitForTimeout(600);
    check(read("issues", fixable.id).status === "dismissed" && read("issues", fixable.id).decision?.reason === "false positive", "Dismiss saves the decision");
    await page.click("#i-undo"); await page.waitForTimeout(600);
    check(read("issues", fixable.id).status === "open" && read("issues", fixable.id).decision === null, "Undo opens the issue again");
  }
  check(await page.isVisible("#stale") && (await page.textContent("#stale-text")).startsWith("You made 2 decisions"), `the banner asks for a refresh after the decisions (${await page.textContent("#stale-text")})`);

  // A write that does not come from the page.
  const forged = await fetch(base + "answer", { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ id: label?.id, value: "issue", by: "x" }) });
  check(forged.status === 403 && read("questions", label.id).person_answer === null, `a write without the header of the page is refused (${forged.status})`);

  // The client report.
  await page.goto(base + "client"); await page.waitForTimeout(400);
  const text = await page.textContent("body");
  check(text.includes("What to fix first") && text.includes("Example Studio") && text.includes("audits@example.test"), "the client report has the issues to fix first, who prepared it, and the contact");
  check(!text.includes("First AI review") && !text.includes("Second AI review") && !text.includes("Show the AI") && await page.$$eval("button[data-value]", (b) => b.length) === 0 && !text.includes("Dismiss"), "the client report shows no AI opinion and no decision");
  check(text.includes("a person answered 1") && !text.includes("and a person checked"), `the method of the client report gives the count of the answers of a person (${(text.match(/The findings that need judgment[^\n]*?issues\./) || [""])[0]})`);
  await axe("the client report");
  const download = await fetch(base + "client?download=1");
  const file = await download.text();
  check(/attachment; filename="accessibility-report-127\.0\.0\.1-8106-\d{4}-\d{2}-\d{2}\.html"/.test(download.headers.get("content-disposition") || "") && !file.includes("Back to the review"), `the download is one HTML file with no link back to the local page (${download.headers.get("content-disposition")})`);

  // The width of a phone: no sideways scroll, and the list and the details one at a time.
  const phone = await browser.newPage({ viewport: { width: 320, height: 720 } });
  phone.on("pageerror", (e) => errors.push("phone: " + e.message));
  for (const v of ["overview", "decisions", "issues", "method"]) {
    await phone.goto(base + "#" + v); await phone.waitForTimeout(400);
    const wide = await phone.evaluate(() => document.documentElement.scrollWidth);
    check(wide <= 320, `at 320 px the ${v} view has no sideways scroll (${wide})`);
  }
  await phone.goto(base + "#decisions"); await phone.waitForTimeout(400);
  await phone.click("#d-list button.rowbtn"); await phone.waitForTimeout(500);
  check(await phone.isHidden("#d-list") && await phone.evaluate(() => document.activeElement?.id) === "d-title", "on a phone, a chosen decision replaces the list, and the focus goes to its heading");
  await phone.click("#d-back"); await phone.waitForTimeout(200);
  check(await phone.isVisible("#d-list") && await phone.evaluate(() => document.activeElement?.classList.contains("rowbtn")), "Back to the list shows the list and puts the focus on the row");
  check(errors.length === 0, `no script error (${errors.join("; ") || "none"})`);

  // (c) The item in the browser.
  const items = await phone.evaluate(`(() => { ${HELPERS}
    document.body.innerHTML = '<select id="a" name="archive-dropdown"><option value="">Select Week</option><option value="/w45">Week 45</option></select><select id="b"><option value="1">One</option><option value="2">Two</option></select>';
    return [item(document.getElementById("a")), item(document.getElementById("b"))]; })()`);
  check(items[0] === "select#a|archive-dropdown|Select Week" && items[1] === "select#b||One Two", `(c) the item of a select with a placeholder has the placeholder, another select all its options (${items.join(" ; ")})`);
} catch (e) {
  check(false, "the test ran: " + (e && e.stack || e));
} finally {
  if (browser) await browser.close();
  if (review) review.close();
  server.close();
}
if (failures.length) { console.error(`\n${failures.length} failed`); process.exit(1); }
console.error("\nall passed");
