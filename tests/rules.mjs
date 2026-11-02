// Detection rules that the list of problems of 1.1.1 asked for, with pages that must give an outcome and pages that must not.
// Item 18: links with the same name and different destinations in one context (2.4.4). Item 19: contrast of a text under a
// transparent layer, and of a text that an opaque layer hides. Item 20: a skip link that a clip hides is not a small target at rest.
// Item 21: the listeners of analytics tools and of library containers do not make a control.
//
// Usage: node tests/rules.mjs
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAudit } from "../src/audit.ts";
import { configForUrl } from "../src/config.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "seeded-faults", "build", "rules");
const PORT = 8097;
const SITE = `http://rules.localhost:${PORT}`;
const failures = [];
const check = (ok, message) => { console.error(`${ok ? "ok  " : "FAIL"} ${message}`); if (!ok) failures.push(message); };
const doc = (title, body, head = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>${head}</head><body>${body}</body></html>`;
const IMG = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";

const PAGES = {
  // Item 18. T1: two "Visit us" in one paragraph. T2: one destination in other forms, and links with no destination.
  "links-paragraph": doc("Offices", `<main><h1>Offices</h1><p>We have two offices. <a href="/offices/north/">Visit us</a> or <a href="/offices/south/">Visit us</a> on weekdays.</p></main>`),
  "links-same-target": doc("Apply", `<main><h1>Apply</h1><ul><li>Applications are open. <a href="/apply/">Apply now</a> or use the short form: <a href="/apply?utm_source=news">APPLY   NOW</a></li></ul><p><a href="#">Apply now</a> <a href="javascript:void(0)">Apply now</a></p></main>`),
  // T3: two "Give now" under different headings with no paragraph around them, and a logo pair with the same name.
  "links-headings": doc("Support", `<header><a href="/department/">Example School</a></header><main><h1>Support</h1><div class="card"><h2>Scholarship fund</h2><div class="cta"><a href="https://give.example.org/?fund=1">Give now</a></div></div><div class="card"><h2>Research fund</h2><div class="cta"><a href="https://give.example.org/?fund=2">Give now</a></div></div></main><footer><a href="/" aria-label="Example School"><svg width="40" height="20" aria-hidden="true"><rect width="40" height="20"/></svg></a></footer>`),
  // T4: the same name in different list items and different table cells: each has its own context.
  "links-list": doc("Terms", `<main><h1>Terms</h1><ul><li>Spring term: <a href="/apply/spring/">Apply</a></li><li>Fall term: <a href="/apply/fall/">Apply</a></li></ul><table><tr><th>Course</th><th>Syllabus</th></tr><tr><th>Biology</th><td><a href="/syllabus/bio/">Syllabus</a></td></tr><tr><th>Chemistry</th><td><a href="/syllabus/chem/">Syllabus</a></td></tr></table></main>`),
  // T5: image links with the same alt, the same title for two events, two fragments of the page, and a copy hidden from screen readers.
  "links-images": doc("Events", `<main><h1>Events</h1><div class="event"><a href="/events/2030-01-10/"><img src="${IMG}" width="80" height="40" alt="Students in a lobby"></a><h3><a href="/events/2030-01-10/">Open day</a></h3></div><div class="event"><a href="/events/2030-02-10/"><img src="${IMG}" width="80" height="40" alt="Students in a lobby"></a><h3><a href="/events/2030-02-10/">Open day</a></h3></div><p>Read the <a href="#part-1">section notes</a> and the other <a href="#part-2">section notes</a>.</p><p aria-hidden="true"><a href="/x/">Visit us</a></p><p><a href="/y/">Visit us</a></p><h2 id="part-1">Part 1</h2><h2 id="part-2">Part 2</h2></main>`),
  // Item 19. A text that an opaque layer covers paints no pixel. A light text on a gradient under the layer of a stretched card link shows.
  "contrast-covered": doc("Report", `<h1 style="margin:8px;color:#000;font-size:16px">report-slug</h1><div style="position:absolute;inset:0;z-index:0;background:#303030"><main style="position:absolute;left:20px;top:20px;width:320px;padding:12px;background:#fff"><p style="color:#222">The page of the report.</p></main></div>`, `<style>body{margin:0;background:#303030}</style>`),
  "contrast-card": doc("Card", `<main><h1>Card</h1><div class="card"><p class="faint">Light text on a light card.</p><a href="/more/" class="stretch">More about the card</a></div></main>`, `<style>.card{position:relative;width:320px;padding:16px;background:linear-gradient(#eeeeee,#ffffff)}.faint{color:#aaaaaa;font-size:16px}.stretch{color:#1a1a8c}.stretch::after{content:"";position:absolute;inset:0}</style>`),
  // Item 19, the follow-up: text in transparent images over a light card. Yellow letters fail, dark letters pass, and a logo has no requirement.
  "image-text": doc("Report images", `<main><h1>Report images</h1><div style="background:linear-gradient(#eeeeee,#ffffff);padding:20px;width:340px"><img id="t1" alt="Discovery" width="300" height="60"><img id="t2" alt="Research" width="300" height="60"><img id="t3" alt="Example logo" width="300" height="60"></div></main>
<script>function word(id, text, color) { var c = document.createElement("canvas"); c.width = 300; c.height = 60; var x = c.getContext("2d"); x.fillStyle = color; x.font = "bold 40px sans-serif"; x.fillText(text, 10, 45); document.getElementById(id).src = c.toDataURL("image/png"); }
word("t1", "DISCOVERY", "#ffd11d"); word("t2", "RESEARCH", "#1a1a1a"); word("t3", "LOGO", "#ffd11d");</script>`),
  // Item 20. A skip link that a clip hides is 1 by 1 px at rest, with a small control next to it. With the focus it shows at full size.
  // The second skip link is still small with the focus on it, so it fails in that state.
  "skip": doc("Skip", `<header><a class="skip-link" href="#main">Skip to Content</a><a class="nav" style="left:4px" href="/">H</a><a class="tiny-skip" href="#main">Skip</a><a class="nav" style="left:104px" href="/about/">A</a></header><main id="main"><h1>Skip</h1><p>Text.</p></main>`,
    `<style>body{margin:0}header{position:relative;height:40px}.skip-link,.tiny-skip{position:absolute;top:0;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.skip-link{left:0}.tiny-skip{left:100px}.skip-link:focus{width:auto;height:auto;clip-path:none;padding:14px 20px;background:#fff;z-index:10}.tiny-skip:focus{clip-path:none;width:12px;height:12px;z-index:10;background:#fff}.nav{position:absolute;top:4px;width:20px;height:20px;overflow:hidden;background:#eee;color:#000}</style>`),
  // Item 21. An image that only an analytics script listens to, a slider of a library script, containers of known libraries, an
  // accordion container with only a keydown listener, and one real control that the keyboard cannot reach.
  "listeners": doc("Listeners", `<main><h1>Listeners</h1><p><img class="tracked" src="${IMG}" width="120" height="60" alt="Campus"></p><p><a class="tracked-link" href="/about/">About the school</a></p><div class="slider"><div class="slide">Slide one</div></div><div class="swiper"><div class="swiper-wrapper"><div class="swiper-slide">Slide two</div></div></div><div class="gsc-results"><div class="gsc-result">A search result</div></div><div class="accordion"><button type="button">Section one</button><div>Panel one</div></div><div class="own-control">Open the panel</div></main>`,
    `<script src="/js/siteanalyze_6000000.js" defer></script><script src="/js/swiper-bundle.min.js" defer></script><script src="/js/site.js" defer></script>`),
};
const SCRIPTS = {
  "/js/siteanalyze_6000000.js": `document.querySelectorAll("img, a").forEach(function (el) { el.addEventListener("mousedown", function () { window.__tracked = (window.__tracked || 0) + 1; }); });`,
  "/js/swiper-bundle.min.js": `document.querySelectorAll(".slider").forEach(function (s) { s.addEventListener("pointerdown", function () {}); s.addEventListener("click", function () {}); });`,
  "/js/site.js": `document.querySelector(".swiper").addEventListener("click", function () {});
document.querySelector(".gsc-results").addEventListener("mousedown", function () {});
document.querySelector(".gsc-results").addEventListener("click", function () {});
document.querySelector(".accordion").addEventListener("keydown", function (e) { if (e.key === "ArrowDown") e.preventDefault(); });
document.querySelector(".own-control").addEventListener("click", function () { this.textContent = "Panel open"; });`,
};

const server = http.createServer((req, res) => {
  const p = new URL(req.url, SITE).pathname;
  const name = p.match(/^\/w\/(.+)\.html$/)?.[1];
  if (name && PAGES[name]) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(PAGES[name]); return; }
  if (SCRIPTS[p]) { res.writeHead(200, { "content-type": "application/javascript" }); res.end(SCRIPTS[p]); return; }
  res.writeHead(404, { "content-type": "text/html" }); res.end(doc("Not found", "<main><h1>Not found</h1></main>"));
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

try {
  const dir = path.join(out, "audit");
  fs.rmSync(dir, { recursive: true, force: true });
  const config = configForUrl(SITE, "production");
  config.crawl.widths = [390];
  config.crawl.rate_limit = 20;
  config.interaction.max_states_per_page = 0;
  const lines = [];
  const result = await runAudit({ config, outDir: dir, only: Object.keys(PAGES).map((n) => `${SITE}/w/${n}.html`), log: (l) => lines.push(l) });
  if (process.argv.includes("--verbose")) for (const l of lines) console.error("     " + l);
  const on = (name) => result.pages.find((p) => p.url.endsWith(`/w/${name}.html`))?.outcomes || [];
  const same = (name) => on(name).filter((o) => o.rule === "same-name-different-target");

  // Item 18.
  const t1 = same("links-paragraph");
  check(t1.length === 1 && t1[0].kind === "cantTell" && t1[0].facts.name === "Visit us" && t1[0].facts.contextKind === "paragraph", `item 18: two "Visit us" in one paragraph give a question (${t1.map((o) => o.summary).join(" | ")})`);
  check(same("links-same-target").length === 0, `item 18: one destination in other forms, and links with no destination, give nothing (${same("links-same-target").map((o) => o.summary).join(" | ")})`);
  const t3 = same("links-headings").map((o) => o.facts.name).sort();
  check(JSON.stringify(t3) === JSON.stringify(["Example School", "Give now"]), `item 18: links with no context: the "Give now" pair and the logo pair give questions (${t3.join(", ")})`);
  check(same("links-headings").every((o) => o.facts.links.some((l) => l.heading)), "item 18: the facts give the heading before each link, for the AI");
  check(same("links-list").length === 0, `item 18: the same name in different list items and table cells gives nothing (${same("links-list").map((o) => o.summary).join(" | ")})`);
  const t5 = same("links-images").map((o) => o.facts.name).sort((a, b) => a.localeCompare(b));
  check(JSON.stringify(t5) === JSON.stringify(["Open day", "section notes", "Students in a lobby"]), `item 18: image links by their alt, the same title, and two fragments give questions; a copy hidden from screen readers does not (${t5.join(", ")})`);
  const questions = fs.readdirSync(path.join(dir, "questions")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, "questions", f), "utf8")));
  check(questions.filter((q) => q.evidence.rule === "same-name-different-target").every((q) => q.kind === "review"), "item 18: the questions go to the AI");

  // Item 19.
  const covered = on("contrast-covered").filter((o) => o.rule === "color-contrast");
  check(!covered.some((o) => o.kind === "failed" || o.kind === "cantTell"), `item 19: a text that an opaque layer covers gives no issue and no question (${covered.map((o) => o.kind + " " + o.selector).join(", ") || "none"})`);
  check(covered.some((o) => o.kind === "passed" && o.facts?.hidden), "item 19: the run keeps the covered text with the reason");
  const card = on("contrast-card").filter((o) => o.rule === "color-contrast" && (o.html || "").includes("faint"));
  check(card.some((o) => o.kind === "failed" || o.kind === "cantTell"), `item 19: a light text under the transparent layer of a stretched link gives a 1.4.3 outcome (${card.map((o) => o.kind + " " + (o.facts?.measured?.main ?? "")).join(", ") || "none"})`);

  const letters = on("image-text").filter((o) => o.rule === "image-text-contrast");
  check(letters.length === 1 && letters[0].kind === "cantTell" && letters[0].facts.alt === "Discovery" && letters[0].facts.measured.main < 4.5 && letters[0].facts.glyphHeight > 0, `item 19: yellow letters in a transparent image over a light card give a 1.4.3 question with the measure (${letters.map((o) => o.facts.alt + " " + o.facts.textColor + " " + o.facts.measured.main + ":1, letters " + o.facts.glyphHeight + " px").join(", ") || "none"})`);

  // Item 20.
  const small = on("skip").filter((o) => o.criterion === "2.5.8");
  check(!small.some((o) => o.selector.includes("skip-link") || (o.html || "").includes("skip-link")), `item 20: the skip link that a clip hides is not a small target (${small.map((o) => o.rule + " " + o.selector).join(", ") || "none"})`);
  check(small.some((o) => o.rule === "target-too-small" && (o.html || "").includes("tiny-skip") && o.facts?.measured === "with the focus on it"), "item 20: a skip link that is small with the focus on it fails, measured in that state");

  // Item 21.
  const controls = on("listeners").filter((o) => o.rule === "control-not-focusable" || o.rule === "control-without-role");
  const flagged = [...new Set(controls.map((o) => (o.html || "").match(/class="([^"]+)"/)?.[1] || o.selector))];
  check(JSON.stringify(flagged) === JSON.stringify(["own-control"]), `item 21: only the real control is flagged, not the analytics image, the slider, the library containers, or the keydown container (${flagged.join(", ")})`);
  check(!on("listeners").some((o) => o.rule === "down-event-listener"), "item 21: the mousedown of an analytics script does not make a down-event question");
} finally {
  await new Promise((r) => server.close(r));
}

if (failures.length) { console.error(`\n${failures.length} checks failed`); process.exit(1); }
console.error("\nall checks passed");
