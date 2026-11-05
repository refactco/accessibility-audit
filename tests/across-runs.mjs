// The results from run to run, and the refresh. Each check is one item of the list of problems of the third full audit of a large
// site with 1.3.1. 1: a question whose pages a run did not test stays, with its answer. 2: the page of an open issue of a sample test
// joins the sample. 3: a release that does not change a test is not a rule change. 4: the classes of a lazy load are not part of the
// identity of an item. 5, 6, 7: a refresh keeps "replaces", the example of a question, and the parts of the report. 8: the report
// counts the pages that a budget left, by source and by section. 9: the "Resolved" column counts the resolutions of this run.
// 10: a page whose stylesheet did not apply loads once more.
//
// Usage: node tests/across-runs.mjs [--verbose]
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAudit } from "../src/audit.ts";
import { configForUrl } from "../src/config.ts";
import { loadQuestions } from "../src/decide.ts";
import { fingerprintOf, questionFingerprintOf } from "../src/issues.ts";
import { refresh } from "../src/refresh.ts";
import { stableHtml, stableIdsHtml } from "../src/stable.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "seeded-faults", "build", "across-runs");
const dirBudget = path.join(here, "seeded-faults", "build", "across-runs-budget");
const PORT = 8101;
const SITE = `http://127.0.0.1:${PORT}`;
const failures = [];
const check = (ok, message) => { console.error(`${ok ? "ok  " : "FAIL"} ${message}`); if (!ok) failures.push(message); };
const verbose = process.argv.includes("--verbose");
const sha = (s) => createHash("sha1").update(s).digest("hex");

// lazysizes writes " lazyloaded" into an empty class, and " ls-is-cached lazyloaded" when the image is in the cache of the browser.
let lazy = " lazyloaded";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const doc = (title, body, head = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>${head}</head><body>${body}</body></html>`;
const PAGES = ["/other/", "/third/", "/fourth/", "/p1/", "/p2/", "/slowimg/", "/private/x/"];
const home = () => doc("Home", `<header><nav class="tiny">${PAGES.map((p) => `<a href="${p}">${p.replace(/\//g, "") || "x"}</a>`).join(" ")}</nav></header>
<main><h1>Home</h1>
<figure><img class="${lazy}" src="/img/photo-1.png" alt="" width="40" height="40"><figcaption>Our office at night</figcaption></figure>
<p><img class="${lazy}" src="/img/photo-2.png" width="40" height="40"></p></main>`, '<link rel="stylesheet" href="/style.css">');
const plain = (title) => doc(title, `<main><h1>${title}</h1><p>Text of the page.</p></main>`);
// Two pages with the same image and caption: one question with two items. Only a data attribute differs, so the items have two hashes.
const shared = (n) => doc("Shared " + n, `<main><h1>Shared</h1><figure><img src="/img/shared.png" data-v="${n}" alt="" width="40" height="40"><figcaption>The shared caption</figcaption></figure></main>`);

// /style.css: the requests of the first 1.5 seconds lose their connection, as in a short fault of the network.
let cssFrom = 0;
let cssCut = 0;
const server = http.createServer((req, res) => {
  const p = new URL(req.url, SITE).pathname;
  const send = (body, type = "text/html; charset=utf-8", status = 200) => { res.writeHead(status, { "content-type": type }); res.end(body); };
  if (p === "/robots.txt") return send("User-agent: *\nDisallow: /private/\n", "text/plain");
  if (p === "/") return send(home());
  if (p === "/style.css") {
    if (!cssFrom) cssFrom = Date.now();
    if (Date.now() - cssFrom < 1500) { cssCut++; return req.socket.destroy(); }
    return send(".tiny a { display: inline-block; padding: 14px; margin: 4px; }", "text/css");
  }
  if (p === "/hang.png") return setTimeout(() => send(PNG, "image/png"), 2500);
  if (p.startsWith("/img/")) return send(PNG, "image/png");
  if (p === "/p1/" || p === "/p2/") return send(shared(p[2]));
  if (p === "/slowimg/") return send(doc("Slow image", `<main><h1>Slow image</h1><img src="/hang.png" alt="A chart" width="40" height="40"></main>`));
  if (["/other/", "/third/", "/fourth/"].includes(p)) return send(plain("Page " + p));
  send(plain("Not found"), "text/html", 404);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const config = configForUrl(SITE, "production");
config.crawl.widths = [390];
config.crawl.rate_limit = 20;
config.crawl.random_sample_share = 0;
config.crawl.load_wait_seconds = 1;
config.interaction.max_states_per_page = 0;
config.interaction.dry_submit = false;
const readDir = (d, name) => fs.readdirSync(path.join(d, name)).map((f) => JSON.parse(fs.readFileSync(path.join(d, name, f), "utf8")));
const files = (name) => Object.fromEntries(fs.readdirSync(path.join(dir, name)).map((f) => [f, fs.readFileSync(path.join(dir, name, f), "utf8")]));
const write = (name, obj) => fs.writeFileSync(path.join(dir, name, obj.id + ".json"), JSON.stringify(obj, null, 1));
const remove = (name, id) => fs.rmSync(path.join(dir, name, id + ".json"), { force: true });
const audit = async (options = {}, out = dir) => {
  const lines = [];
  const result = await runAudit({ config, outDir: out, log: (l) => lines.push(l), ...options });
  if (verbose) for (const l of lines) console.error("     " + l);
  return { result, lines, summary: JSON.parse(fs.readFileSync(path.join(out, "summary.json"), "utf8")), report: fs.readFileSync(path.join(out, "report.md"), "utf8") };
};
// The item hash of a question, as the engine makes it, with the HTML as 1.3.1 kept it: the ids with no random part, all classes.
const stableFactsOf = (facts = {}) => { const { screenshot, measured, changes, texts, seconds, hiddenWidth, hiddenHeight, ...rest } = facts; return rest; };
const oldItemHash = (html, facts) => sha(stableIdsHtml(html) + JSON.stringify(stableFactsOf(facts)));
const answer = { value: "no issue", confidence: "high", reason: "The caption says what the image shows.", model: "test", prompt_version: "1", date: "2026-11-01" };

try {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(dirBudget, { recursive: true, force: true });
  const first = await audit();
  const outcomesOf = (r, u) => r.result.pages.find((p) => p.url === SITE + u)?.outcomes || [];

  // 10: the stylesheet of the home page did not apply in the first load.
  const homeRecord = first.result.pages.find((p) => p.url === SITE + "/");
  const small = outcomesOf(first, "/").filter((o) => (o.rule === "target-size" || o.rule === "target-too-small") && o.kind === "failed");
  check(cssCut > 0 && first.lines.some((l) => l.includes("stylesheet not applied at 390, one more load in 3 s")), `10: a page whose stylesheet did not apply loads once more, and the log says so (${cssCut} connections cut; ${first.lines.filter((l) => l.includes("stylesheet")).map((l) => l.trim()).join("; ") || "no line"})`);
  check(!small.length && !homeRecord?.facts?.stylesMissing, `10: the second load has the style, so the small unstyled links give no target failure (${small.length} failures, missing ${JSON.stringify(homeRecord?.facts?.stylesMissing || [])})`);

  // The results as 1.3.1 stored them. The question of the image with a caption and the issue of the image with no alt get the IDs and
  // the hash that 1.3.1 gave: the class " lazyloaded" was part of the identity. The question has an AI answer, the issue a solution.
  const capOutcome = outcomesOf(first, "/").find((o) => o.rule === "alt-empty-with-caption");
  const altOutcome = outcomesOf(first, "/").find((o) => o.rule === "image-alt");
  check(!!capOutcome && !!altOutcome && capOutcome.html.includes('class=" lazyloaded"'), `the home page gives the caption question and the image-alt issue on the lazy-loaded images (${capOutcome?.item}, ${altOutcome?.item})`);
  const withLazy = (item) => item.replace(/^img\|/, "img.lazyloaded|");
  const questions = readDir(dir, "questions");
  const cap = questions.find((q) => q.evidence.rule === "alt-empty-with-caption" && q.evidence.url === "/");
  const capOldFp = questionFingerprintOf({ ...capOutcome, item: withLazy(capOutcome.item) }, config);
  const capOld = { ...cap, id: "Q-" + capOldFp.slice(0, 8), fingerprint: capOldFp, item_hash: oldItemHash(cap.evidence.html, cap.evidence.facts), ai_answer: answer };
  capOld.item_hashes = [capOld.item_hash.slice(0, 16)];
  remove("questions", cap.id); write("questions", capOld);
  const issues = readDir(dir, "issues");
  const alt = issues.find((i) => i.rule.id === "image-alt");
  const altOld = { ...alt, id: "ISS-" + fingerprintOf({ ...altOutcome, item: withLazy(altOutcome.item) }, config).slice(0, 8), status: "open", origin: "code", solution: { type: "specific", summary: "Give the photo an alt text.", steps: ["Add an alt attribute."] } };
  remove("issues", alt.id); write("issues", altOld);
  // A question of the focus test, which runs on the sample only, on /third/, a page out of the sample. It has an AI answer.
  const trap = { ...capOld, id: "Q-0d0d0d01", fingerprint: sha("keyboard-trap on /third/"), criterion: "2.1.2", evidence: { ...capOld.evidence, url: "/third/", rule: "keyboard-trap", pages: ["/third/"] }, item_hashes: [] };
  write("questions", trap);
  // Issues of the listener test. On /other/ and on the home page, found by 1.3.0, whose detection is that of this version. On the
  // home page also one found by 1.2.0, whose detection was older.
  const control = (id, url, engineVersion) => ({ ...alt, id, status: "open", certainty: "fail", rule: { id: "control-without-role", engine: "a11y", engine_version: engineVersion },
    wcag: { ...alt.wcag, criterion: "4.1.2" }, question: null, replaces: null, origin: "code", source: [], source_warning: null, decision: null,
    summary: "A control that a screen reader does not announce.", solution: { type: "general", summary: "Give the control a role.", steps: ["Use a button element."] },
    examples: [{ url, width: 390, state: [], selector: "div.card", html: '<div class="card">Open</div>', facts: {} }] });
  write("issues", control("ISS-0c0c0c11", "/other/", "1.3.0"));
  write("issues", control("ISS-0c0c0c12", "/", "1.2.0"));

  // 1: a short check of /other/ does not test the home page or /third/.
  const second = await audit({ only: [SITE + "/other/"], kind: "short check" });
  const after = new Map(readDir(dir, "questions").map((q) => [q.id, q]));
  check(after.get(capOld.id)?.not_checked === true && after.get(capOld.id)?.ai_answer?.value === "no issue", `1: a question whose page the run did not test stays, "not checked", with its AI answer (${after.has(capOld.id) ? `not_checked ${after.get(capOld.id).not_checked}, answer ${after.get(capOld.id).ai_answer?.value}` : "the file is gone"})`);
  check(after.get(trap.id)?.not_checked === true, `1: a question of a sample test on a page out of the sample stays too (${after.has(trap.id) ? "kept" : "the file is gone"})`);
  const kept = [...after.values()].filter((q) => q.not_checked).length;
  const keptLine = second.report.match(/(\d+) questions of earlier runs are not checked/);
  check(!loadQuestions(dir).some((q) => q.not_checked) && kept >= 2 && Number(keptLine?.[1]) === kept, `1: the questions that were not checked are not review tasks, and the report counts them apart (${kept} kept files; ${keptLine?.[0] || "no line"})`);
  const ctl = new Map(readDir(dir, "issues").map((i) => [i.id, i]));
  check(ctl.get("ISS-0c0c0c11")?.status === "resolved" && ctl.get("ISS-0c0c0c11")?.status_by.reason === "fixed", `3: an issue that 1.3.0 found, whose test did not change since, is "fixed" when it goes away (${ctl.get("ISS-0c0c0c11")?.status} ${ctl.get("ISS-0c0c0c11")?.status_by?.reason || ""})`);

  // The next full audit. The images are in the cache now: the class is " ls-is-cached lazyloaded". A new issue of the listener test
  // is on /fourth/, a page out of the sample.
  lazy = " ls-is-cached lazyloaded";
  write("issues", control("ISS-0c0c0c13", "/fourth/", "1.3.0"));
  const third = await audit();
  const q3 = readDir(dir, "questions");
  const capNow = q3.find((q) => q.evidence.rule === "alt-empty-with-caption" && q.evidence.url === "/");
  check(!!capNow && capNow.id !== capOld.id && capNow.ai_answer?.value === "no issue" && !capNow.not_checked && !q3.some((q) => q.id === capOld.id), `4: the question of the lazy-loaded image keeps its AI answer under its new ID, when the class changes with the cache (${capOld.id} -> ${capNow?.id}, answer ${capNow?.ai_answer?.value || "none"})`);
  const i3 = new Map(readDir(dir, "issues").map((i) => [i.id, i]));
  const altNow = [...i3.values()].find((i) => i.rule.id === "image-alt" && ["new", "open", "reopened"].includes(i.status));
  check(altNow?.replaces === altOld.id && altNow?.status === "open" && altNow?.origin === "code" && altNow?.solution.type === "specific" && i3.get(altOld.id)?.status_by?.reason === "rule changed", `4: the issue of the lazy-loaded image keeps its status, origin, and solution under its new ID, and the old ID is "rule changed" (${altNow?.id} ${altNow?.status}, replaces ${altNow?.replaces}, old ${i3.get(altOld.id)?.status} ${i3.get(altOld.id)?.status_by?.reason})`);
  const fourth = third.result.pages.find((p) => p.url === SITE + "/fourth/");
  check(fourth?.sample === true && third.lines.some((l) => /pages of open issues of the sample tests: they open first and join the sample/.test(l)), `2: the page of an open issue of the listener test joins the sample (sample ${fourth?.sample}, ${fourth?.sampleReason || "no reason"})`);
  check(i3.get("ISS-0c0c0c13")?.status === "resolved" && i3.get("ISS-0c0c0c13")?.status_by.reason === "fixed", `2, 3: so the issue is checked: resolved as fixed, not "not checked" (${i3.get("ISS-0c0c0c13")?.status} ${i3.get("ISS-0c0c0c13")?.status_by?.reason || ""})`);
  check(i3.get("ISS-0c0c0c12")?.status === "resolved" && i3.get("ISS-0c0c0c12")?.status_by.reason === "rule changed", `3: an issue that 1.2.0 found, with an older detection, is "rule changed" (${i3.get("ISS-0c0c0c12")?.status} ${i3.get("ISS-0c0c0c12")?.status_by?.reason || ""})`);
  check(q3.find((q) => q.id === trap.id)?.not_checked === true, `1: the question of the focus test stays "not checked": /third/ is tested, but not in the sample (${q3.some((q) => q.id === trap.id) ? "kept" : "gone"})`);
  // 9: the "Resolved" column.
  const row = third.report.split("\n").findIndex((l) => l.startsWith("| Pages found |"));
  const cells = third.report.split("\n")[row + 2]?.split("|").map((c) => c.trim());
  const resolvedNow = [...i3.values()].filter((i) => i.status === "resolved" && i.status_by.run === third.result.run).length;
  const resolvedAll = [...i3.values()].filter((i) => i.status === "resolved").length;
  check(Number(cells?.[8]) === resolvedNow && resolvedNow < resolvedAll, `9: the "Resolved" column counts the issues that this run resolved, not those of earlier runs (column ${cells?.[8]}, this run ${resolvedNow}, all ${resolvedAll})`);

  // 5, 6, 7: a refresh with no new answer changes no issue, no question, and no line of the report.
  const before = { issues: files("issues"), questions: files("questions"), report: third.report };
  refresh(config, dir);
  const now = { issues: files("issues"), questions: files("questions"), report: fs.readFileSync(path.join(dir, "report.md"), "utf8") };
  const changed = (name) => Object.keys({ ...before[name], ...now[name] }).filter((f) => before[name][f] !== now[name][f]);
  const replacesNow = JSON.parse(now.issues[altNow.id + ".json"] || "{}").replaces;
  check(replacesNow === altOld.id && !changed("issues").length, `5: a refresh keeps "replaces" and changes no issue file (replaces ${replacesNow}, changed: ${changed("issues").join(", ") || "none"})`);
  check(!changed("questions").length, `6: a refresh changes no question file (changed: ${changed("questions").slice(0, 5).join(", ") || "none"})`);
  const lost = before.report.split("\n").filter((l) => !now.report.split("\n").includes(l));
  if (lost.length) { fs.writeFileSync(path.join(dir, "report-audit.md"), before.report); fs.writeFileSync(path.join(dir, "report-refresh.md"), now.report); }
  check(!lost.length && /pages were tested before their load event/.test(now.report) && /addresses were not crawled: robots/.test(now.report), `7: a refresh keeps every line of the report, with the load event and the addresses that the crawl did not open (${lost.length ? "lost: " + lost.slice(0, 3).join(" / ").slice(0, 300) : "all kept"})`);

  // 6: the example of a question with two items stays the item that the answer saw, also when it is not the first page.
  const sharedQ = readDir(dir, "questions").find((q) => q.evidence.rule === "alt-empty-with-caption" && q.evidence.pages.length === 2);
  const other = ["/p1/", "/p2/"].find((u) => u !== sharedQ?.evidence.url);
  const otherOutcome = outcomesOf(third, other).find((o) => o.rule === "alt-empty-with-caption");
  const otherHash = sha(stableHtml(otherOutcome.html) + JSON.stringify(stableFactsOf(otherOutcome.facts)));
  write("questions", { ...sharedQ, item_hash: otherHash, evidence: { ...sharedQ.evidence, url: other, html: otherOutcome.html, selector: otherOutcome.selector }, ai_answer: answer });
  refresh(config, dir);
  const sharedNow = readDir(dir, "questions").find((q) => q.id === sharedQ.id);
  check(sharedNow?.item_hash === otherHash && sharedNow?.evidence.url === other && sharedNow?.ai_answer?.value === "no issue", `6: a refresh keeps the example that the answer saw, ${other}, not the first page of the group (${sharedNow?.evidence.url}, hash ${sharedNow?.item_hash === otherHash ? "kept" : "changed"})`);

  // 8: an audit that the page limit stops, in its own folder.
  const limited = await audit({ maxPages: 3 }, dirBudget);
  const leftRecords = limited.result.pages.filter((p) => !p.tested && p.not_tested_reason === "page limit" && p.http_status);
  const line = limited.report.match(/(\d+) pages were found but not tested, because a budget came first\. From the settings: (\d+), from the sitemaps and the API: (\d+), from the links: (\d+)\. By section: [^\n]+/);
  check(!!line && Number(line[1]) === leftRecords.length && Number(line[2]) + Number(line[3]) + Number(line[4]) === leftRecords.length && leftRecords.length > 0, `8: the report counts the pages that a budget left, by source and by section (${line ? line[0] : "no line"}; ${leftRecords.length} records)`);
} finally {
  await new Promise((r) => server.close(r));
}

if (failures.length) { console.error(`\n${failures.length} checks failed`); process.exit(1); }
console.error("\nall checks passed");
