// Short faults of the site and the timing of a load must not change the results. Each check is one item of the list of problems of the
// sixth full audit of a large site, with 1.3.3. 1: a server error, for example the 502 page of a proxy during a short outage, is not
// tested as a page of the site: the load gets one more try, and a width that gives the error again did not load. 2: the item of an
// image of text uses the address of the image after its load, so a lazy image does not share the item "image|" with other images,
// and the photos that one script sends do not share one item.
//
// Usage: node tests/short-faults.mjs [--verbose]
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAudit } from "../src/audit.ts";
import { configForUrl } from "../src/config.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "seeded-faults", "build", "short-faults");
const PORT = 8103;
const SITE = `http://127.0.0.1:${PORT}`;
const failures = [];
const check = (ok, message) => { console.error(`${ok ? "ok  " : "FAIL"} ${message}`); if (!ok) failures.push(message); };
const verbose = process.argv.includes("--verbose");

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
// Black blocks on a white ground: the pixels of text on a flat ground.
const BANNER = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100"><rect width="300" height="100" fill="#fff"/><rect x="20" y="30" width="60" height="40" fill="#000"/><rect x="100" y="30" width="80" height="40" fill="#000"/><rect x="200" y="30" width="70" height="40" fill="#000"/></svg>`;
const doc = (title, body, head = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>${head}</head><body>${body}</body></html>`;
// The error page of a proxy, as Cloudflare gives it: a link with no name, and a heading with low contrast.
const proxyError = (status) => doc(`example.com | ${status}: Bad gateway`, `<div id="cf-wrapper"><h1>Bad gateway <span>Error code ${status}</span></h1>
<div id="cf-browser-status"><h3 style="color:#bbb">Working</h3></div><a href="https://www.cloudflare.com/5xx-error-landing?utm_source=errorcode_${status}"><img src="/img/cf.png" width="40" height="40" alt=""></a></div>`);
const LINKS = ["/flaky/", "/down/", "/partial/", "/lazy/"];
const home = () => doc("Home", `<main><h1>Home</h1>${LINKS.map((p) => `<p><a href="${p}">Go to ${p.replace(/\//g, "")}</a></p>`).join("")}</main>`);
// An image with no alt, and an image with an empty alt and a caption: an issue and a question on the page.
const down = () => doc("Down", `<main><h1>Down</h1><img src="/img/a.png" width="40" height="40">
<figure><img src="/img/cap.png" alt="" width="40" height="40"><figcaption>Our office at night</figcaption></figure></main>`);
// An image with no alt, and an image with an empty alt and a caption, that only a wide screen shows: an issue and a question at
// 1280 px only.
const partial = () => doc("Partial", `<main><h1>Partial</h1><p>Text of the page.</p><div class="wide"><img src="/img/w.png" width="40" height="40">
<figure><img src="/img/cap2.png" alt="" width="40" height="40"><figcaption>Our lab at noon</figcaption></figure></div></main>`,
  `<style>.wide { display: none; } @media (min-width: 1000px) { .wide { display: block; } }</style>`);
// Two images of text that load when they come into view, far below the first screen. Before their load they have no address, and
// a style gives them their size, as a theme does for its lazy images. Two images come from one script, with the image in the query.
const lazy = () => doc("Lazy", `<main><h1>Lazy</h1><p><img class="lazy" src="/img/photo.ashx?id=1" alt="Photo one"></p>
<p><img class="lazy" src="/img/photo.ashx?id=2" alt="Photo two"></p><div style="height: 3000px">Text of the page.</div>
<p><img class="lazy" data-src="/img/banner-one.svg" alt="Banner one"></p><div style="height: 1500px"></div>
<p><img class="lazy" data-src="/img/banner-two.svg" alt="Banner two"></p></main>
<script>const io = new IntersectionObserver((list) => { for (const e of list) if (e.isIntersecting) { e.target.src = e.target.dataset.src; io.unobserve(e.target); } });
document.querySelectorAll("img[data-src]").forEach((img) => io.observe(img));</script>`, `<style>img.lazy { display: block; width: 300px; height: 100px; }</style>`);

// The behavior of the site in each run. The loads of a page count by run: the first load of /flaky/ gives 502, all loads of /down/
// give 502 in the second run, and the loads of /partial/ after its first one give 504 in the second run.
let run = 1;
const loads = new Map();
const server = http.createServer((req, res) => {
  const p = new URL(req.url, SITE).pathname;
  const send = (body, type = "text/html; charset=utf-8", status = 200) => { res.writeHead(status, { "content-type": type }); res.end(body); };
  if (p === "/robots.txt") return send("User-agent: *\nAllow: /\n", "text/plain");
  if (p.startsWith("/img/banner") || p === "/img/photo.ashx") return send(BANNER, "image/svg+xml");
  if (p.startsWith("/img/")) return send(PNG, "image/png");
  const n = req.headers["sec-fetch-mode"] === "navigate" ? (loads.set(p, (loads.get(p) || 0) + 1), loads.get(p)) : 0;
  if (p === "/") return send(home());
  if (p === "/flaky/") return n === 1 ? send(proxyError(502), undefined, 502) : send(doc("Flaky", "<main><h1>Flaky</h1><p>Text of the page.</p></main>"));
  if (p === "/down/") return run === 2 && n > 0 ? send(proxyError(502), undefined, 502) : send(down());
  if (p === "/partial/") return run === 2 && n > 1 ? send(proxyError(504), undefined, 504) : send(partial());
  if (p === "/lazy/") return send(lazy());
  send(doc("Not found", "<main><h1>Not found</h1></main>"), undefined, 404);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const config = configForUrl(SITE, "production");
config.crawl.widths = [390, 1280];
config.crawl.rate_limit = 20;
config.crawl.random_sample_share = 0;
config.crawl.load_wait_seconds = 1;
config.crawl.sample_pages = [SITE + "/", SITE + "/down/"];
config.interaction.max_states_per_page = 0;
config.interaction.dry_submit = false;
const readDir = (name) => fs.readdirSync(path.join(dir, name)).map((f) => JSON.parse(fs.readFileSync(path.join(dir, name, f), "utf8")));
const audit = async () => {
  loads.clear();
  const lines = [];
  const result = await runAudit({ config, outDir: dir, log: (l) => lines.push(l) });
  if (verbose) for (const l of lines) console.error("     " + l);
  const pagesFile = fs.readFileSync(path.join(dir, "pages.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  return { result, lines, pagesFile, issues: readDir("issues"), questions: readDir("questions") };
};
const outcomesOf = (r, u) => r.result.pages.find((p) => p.url === SITE + u)?.outcomes || [];
const recordOf = (r, u) => r.pagesFile.find((p) => p.url === SITE + u);
const fromErrorPage = (r) => [...r.issues, ...r.questions].filter((x) => JSON.stringify(x).includes("5xx-error-landing") || JSON.stringify(x).includes("cf-browser-status"));

try {
  fs.rmSync(dir, { recursive: true, force: true });
  const first = await audit();

  // 1: the first load of /flaky/ gives 502. The second load gives the page.
  const flaky = recordOf(first, "/flaky/");
  check(flaky?.tested && flaky.title === "Flaky" && flaky.http_status === 200 && first.lines.some((l) => /server error 502 at 390 for \/flaky\/, one more try/.test(l)),
    `1: a page whose first load gives 502 gets one more try, and is tested with the page of the site (${flaky ? `tested ${flaky.tested}, title "${flaky.title}", status ${flaky.http_status}` : "no record"}; ${first.lines.find((l) => /server error/.test(l))?.trim() || "no log line"})`);
  check(!fromErrorPage(first).length, `1: no issue and no question come from the error page (${fromErrorPage(first).map((x) => x.id).join(", ") || "none"})`);
  // 2: the lazy images of text, before their load.
  const images1 = outcomesOf(first, "/lazy/").filter((o) => o.rule === "image-of-text");
  const items1 = images1.map((o) => o.item).sort();
  check(items1.filter((i) => i.includes("banner")).join(",") === "image|banner-one.svg,image|banner-two.svg", `2: each lazy image of text has the file name of its address in its item, never "image|" (${items1.join(", ") || "no outcome"})`);
  check(items1.filter((i) => i.includes("photo")).join(",") === "image|photo.ashx?id=1,image|photo.ashx?id=2", `2: the images of one script keep the query in their items (${items1.filter((i) => i.includes("photo")).join(", ") || "no outcome"})`);
  check(images1.length === 4 && images1.every((o) => /\/img\/(banner-(one|two)\.svg|photo\.ashx\?id=[12])$/.test(o.facts.src)), `2: the facts give the address of the loaded image (${images1.map((o) => o.facts.src || "empty").join(", ")})`);
  const lazyQuestions1 = first.questions.filter((q) => q.evidence.rule === "image-of-text").map((q) => q.id).sort();
  check(lazyQuestions1.length === 4, `2: the four images have four questions, not one for several (${lazyQuestions1.join(", ") || "none"})`);

  // The results that the second run compares with.
  const downIssue = first.issues.find((i) => i.rule.id === "image-alt" && i.examples.some((e) => e.url === "/down/"));
  const downQuestion = first.questions.find((q) => q.evidence.rule === "alt-empty-with-caption" && q.evidence.pages.includes("/down/"));
  const wideIssue = first.issues.find((i) => i.rule.id === "image-alt" && i.examples.some((e) => e.url === "/partial/"));
  const wideQuestion = first.questions.find((q) => q.evidence.rule === "alt-empty-with-caption" && q.evidence.pages.includes("/partial/"));
  const wideOutcomes = outcomesOf(first, "/partial/").filter((o) => o.rule === "image-alt" || o.rule === "alt-empty-with-caption");
  check(!!downIssue && !!downQuestion && !!wideQuestion && wideOutcomes.length >= 2 && wideOutcomes.every((o) => o.width === 1280),
    `the first run gives an issue and a question on /down/, and an issue and a question on /partial/ at 1280 px only (${downIssue?.id}, ${downQuestion?.id}, ${wideIssue?.id}, ${wideQuestion?.id}; widths ${[...new Set(wideOutcomes.map((o) => o.width))].join(", ")})`);

  // The site has an outage in the second run: /down/ gives 502 each time, and /partial/ gives 504 after its first load.
  run = 2;
  const second = await audit();
  const i2 = new Map(second.issues.map((i) => [i.id, i]));
  const q2 = new Map(second.questions.map((q) => [q.id, q]));

  // 1: /down/ did not load, so its issue and its question are not checked.
  const downRecord = recordOf(second, "/down/");
  check(downRecord && !downRecord.tested && downRecord.not_tested_reason === "did not load" && second.lines.some((l) => /did not load at 390: status 502/.test(l)),
    `1: a page that gives 502 again after one more try did not load (${downRecord ? `tested ${downRecord.tested}, ${downRecord.not_tested_reason || "no reason"}` : "no record"}; ${second.lines.find((l) => /did not load at 390/.test(l))?.trim() || "no log line"})`);
  check(i2.get(downIssue?.id)?.status === "not checked", `1: the issue of a page that did not load is "not checked", not "fixed" (${i2.get(downIssue?.id)?.status} ${i2.get(downIssue?.id)?.status_by?.reason || ""})`);
  check(q2.get(downQuestion?.id)?.not_checked === true, `1: the question of a page that did not load stays, "not checked" (${q2.has(downQuestion?.id) ? (q2.get(downQuestion.id).not_checked ? "not checked" : "counted") : "gone"})`);
  // 1: /partial/ loaded at 390 and not at 1280.
  const partialRecord = recordOf(second, "/partial/");
  check(partialRecord?.tested && (partialRecord.widths_not_loaded || []).join(",") === "1280" && partialRecord.http_status === 200,
    `1: a page that gives 504 at one width is tested at the other width, with the status of the width that loaded (${partialRecord ? `widths not loaded ${(partialRecord.widths_not_loaded || []).join(", ") || "none"}, status ${partialRecord.http_status}` : "no record"})`);
  check(i2.get(wideIssue?.id)?.status === "not checked", `1: an issue at the width that did not load is "not checked", not "fixed" (${i2.get(wideIssue?.id)?.status} ${i2.get(wideIssue?.id)?.status_by?.reason || ""})`);
  check(q2.get(wideQuestion?.id)?.not_checked === true, `1: a question at the width that did not load stays, "not checked" (${q2.has(wideQuestion?.id) ? (q2.get(wideQuestion.id).not_checked ? "not checked" : "counted") : "gone"})`);
  check(!fromErrorPage(second).length && !second.issues.some((i) => i.status === "new"), `1: the outage gives no new issue and nothing from the error page (new ${second.issues.filter((i) => i.status === "new").map((i) => i.id).join(", ") || "none"}; from the error page ${fromErrorPage(second).map((x) => x.id).join(", ") || "none"})`);
  // 2: the same items and question IDs in a second run with no change of the images.
  const lazyQuestions2 = second.questions.filter((q) => q.evidence.rule === "image-of-text").map((q) => q.id).sort();
  check(lazyQuestions2.length === 4 && lazyQuestions2.join(",") === lazyQuestions1.join(","), `2: a second run gives the same question IDs for the images of text (${lazyQuestions2.join(", ") || "none"})`);
} finally {
  await new Promise((r) => server.close(r));
}

if (failures.length) { console.error(`\n${failures.length} checks failed`); process.exit(1); }
console.error("\nall checks passed");
