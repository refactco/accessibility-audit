// The crawl order, the budgets, and the load of a page. Each check is the "Check" line, or the fix, of one item of the list of
// problems of 1.2.0. Item 1: the links get a share of the page time, and a quick check finds the redirects, the broken links, and
// the files that a budget left. Item 2: an address that the audit did not open does not count in the pages found or in the page
// limit, and a copy with another trailing slash goes. Item 3: an address group chooses from the whole list. Item 5: a page that
// loads at one width only stays tested. Item 6: a broken link from a sitemap names the sitemap. Item 8: a page with a slow image
// is tested. Item 11: the log gives the count from each source.
//
// Usage: node tests/budget.mjs [--verbose]
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAudit } from "../src/audit.ts";
import { configForUrl } from "../src/config.ts";
import { RateLimiter, newFrontier, nextAddress, offer, queuedAddresses, seed } from "../src/crawl.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "seeded-faults", "build", "budget");
const PORT = 8098;
const SITE = `http://127.0.0.1:${PORT}`;
const failures = [];
const check = (ok, message) => { console.error(`${ok ? "ok  " : "FAIL"} ${message}`); if (!ok) failures.push(message); };
const verbose = process.argv.includes("--verbose");

const page = (title, body = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><main><h1>${title}</h1><p>Text of the page.</p>${body}</main></body></html>`;
const day = (i) => new Date(Date.UTC(2023, 0, 1) + i * 86400000).toISOString().slice(0, 10);
const two = (i) => String(i).padStart(2, "0");
// The sitemap: pages of one section, the news posts with the oldest first as Yoast lists them, and a post that is gone.
const SITEMAP = [
  ...Array.from({ length: 24 }, (_, i) => ({ loc: `/s/${two(i + 1)}/`, lastmod: day(400) })),
  ...Array.from({ length: 20 }, (_, i) => ({ loc: `/news/p${two(i + 1)}/`, lastmod: day(i * 30) })),
  { loc: "/gone/x/", lastmod: day(10) },
];
// The links of the home page: nine pages that only links give, then a broken link, a redirect to another site, a file, and a copy
// of a settings page with no trailing slash. They are in late sections of the link queue.
const LINKS = [...Array.from({ length: 9 }, (_, i) => `/a${i + 1}/x/`), "/broken/x/", "/off/x/", "/file/x/", "/s/03"];
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
let flakyRequests = 0;

const server = http.createServer((req, res) => {
  const p = new URL(req.url, SITE).pathname;
  const html = (body, status = 200) => { res.writeHead(status, { "content-type": "text/html; charset=utf-8" }); res.end(body); };
  if (p === "/robots.txt") { res.writeHead(200, { "content-type": "text/plain" }); res.end(`User-agent: *\nDisallow: /*/page/\nSitemap: ${SITE}/sitemap.xml\n`); return; }
  if (p === "/sitemap.xml") { res.writeHead(200, { "content-type": "application/xml" }); res.end(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${SITEMAP.map((e) => `<url><loc>${SITE}${e.loc}</loc><lastmod>${e.lastmod}</lastmod></url>`).join("")}</urlset>`); return; }
  if (p === "/wp-json/wp/v2/pages") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify([{ link: `${SITE}/api/only/`, modified_gmt: "2026-01-01T00:00:00" }])); return; }
  if (p === "/wp-json/wp/v2/posts") { res.writeHead(200, { "content-type": "application/json" }); res.end("[]"); return; }
  if (p === "/") return html(page("Home", `<ul>${LINKS.map((l) => `<li><a href="${l}">Link ${l}</a></li>`).join("")}</ul>`));
  if (p === "/off/x/") { res.writeHead(302, { location: "http://localhost:1/away/" }); res.end(); return; }
  if (p === "/file/x/") { res.writeHead(200, { "content-type": "application/pdf" }); res.end("%PDF-1.4"); return; }
  // Item 5: the first request loads, the next ones close the connection.
  if (p === "/flaky/") { if (flakyRequests++ === 0) return html(page("Flaky")); req.socket.destroy(); return; }
  // Item 8: an image that answers after 6 seconds holds the load event.
  if (p === "/slow-image/") return html(page("Slow image", `<img src="/slow.png" alt="A slow image" width="40" height="40">`));
  if (p === "/slow.png") { setTimeout(() => { res.writeHead(200, { "content-type": "image/png" }); res.end(PNG); }, 6000); return; }
  // A bot challenge for a request with no browser on the last pages of the section, as a CDN can give: the quick check learns nothing.
  if (/^\/s\/2\d\/$/.test(p) && /accessibility-audit/.test(req.headers["user-agent"] || "")) { res.writeHead(403, { "content-type": "text/html", "cf-mitigated": "challenge" }); res.end("<title>Just a moment...</title>"); return; }
  if (/^\/(s|news|a\d)\/[^/]+\/$/.test(p) || p === "/api/only/" || p === "/s/03/") return html(page("Page " + p));
  html(page("Not found"), 404);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const baseConfig = () => {
  const config = configForUrl(SITE, "production");
  config.crawl.widths = [390];
  config.crawl.rate_limit = 20;
  config.crawl.random_sample_share = 0;
  config.interaction.max_states_per_page = 0;
  config.interaction.dry_submit = false;
  return config;
};
const readJsonl = (f) => fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

try {
  // Item 1, the order: after the settings, 1 address of each 4 comes from the links while the sitemaps have addresses.
  {
    const config = baseConfig();
    const f = newFrontier();
    offer(config, f, "/settings/", SITE + "/", { tier: 0 });
    for (let i = 1; i <= 9; i++) offer(config, f, `/s/${i}/`, SITE + "/", { tier: 1 });
    for (let i = 1; i <= 3; i++) offer(config, f, `/l${i}/x/`, SITE + "/", { tier: 2, from: SITE + "/" });
    const order = [];
    for (let u = nextAddress(f); u; u = nextAddress(f)) order.push(u.replace(SITE, ""));
    check(order[0] === "/settings/" && order[4] === "/l1/x/" && order[8] === "/l2/x/", `item 1: the links get 1 of each 4 addresses after the settings (${order.slice(0, 9).join(", ")})`);
  }

  // Item 3: the choice of an address group, before the crawl, with no browser.
  {
    const chosen = async (order, limit) => {
      const config = baseConfig();
      config.crawl.address_groups = [{ pattern: "/news/*/", limit, ...(order ? { order } : {}) }];
      const f = newFrontier();
      await seed(config, f, new RateLimiter(50));
      return queuedAddresses(f).filter((u) => u.includes("/news/")).map((u) => u.replace(SITE, "")).sort();
    };
    const newest = await chosen("newest", 3);
    check(JSON.stringify(newest) === JSON.stringify(["/news/p18/", "/news/p19/", "/news/p20/"]), `item 3: the order "newest" takes the posts with the last lastmod, not the first of the sitemap (${newest.join(", ")})`);
    const sample = await chosen(undefined, 5);
    const index = sample.map((u) => Number(u.match(/p(\d+)/)[1]));
    check(sample.length === 5 && Math.max(...index) > 10 && Math.min(...index) <= 10, `item 3: the default order "sample" takes posts from the whole date range (${sample.join(", ")})`);
    check(JSON.stringify(await chosen(undefined, 5)) === JSON.stringify(sample), "item 3: the order \"sample\" takes the same posts in each audit");
    check(JSON.stringify(await chosen("first", 3)) === JSON.stringify(["/news/p01/", "/news/p02/", "/news/p03/"]), "item 3: the order \"first\" keeps the order of the sitemap");
  }

  // Items 1, 2, 3, 6, 11: a full crawl that the time budget stops. The pages get 15 seconds, the quick check runs until 27 seconds.
  {
    const dir = path.join(out, "crawl");
    fs.rmSync(dir, { recursive: true, force: true });
    const config = baseConfig();
    config.site.cms = { type: "wordpress", api_url: `${SITE}/wp-json/wp/v2` };
    config.crawl.sample_pages = ["/s/03/", "/this-page-does-not-exist/"];
    config.crawl.address_groups = [{ pattern: "/news/*/", limit: 3, order: "newest" }];
    config.crawl.max_pages = 25;
    config.budgets.max_pages = 25;
    config.budgets.concurrency = 2;
    config.budgets.time_budget_minutes = 1;
    const lines = [];
    await runAudit({ config, outDir: dir, log: (l) => lines.push(l), shares: { pages: 0.25, quick: 0.45 } });
    if (verbose) for (const l of lines) console.error("     " + l);
    const pages = readJsonl(path.join(dir, "pages.jsonl"));
    const rec = (p) => pages.find((x) => x.url === SITE + p);
    const summary = JSON.parse(fs.readFileSync(path.join(dir, "summary.json"), "utf8"));
    const report = fs.readFileSync(path.join(dir, "report.md"), "utf8");
    const cov = summary.coverage;

    // Item 1.
    check(rec("/a1/x/")?.tested === true, `item 1: the page time opens addresses that only links give (/a1/x/: ${rec("/a1/x/")?.tested ? "tested" : rec("/a1/x/")?.not_tested_reason})`);
    check(/addresses were not opened[^\n]*From the settings: \d+, from the sitemaps and the API: \d+, from the links: \d+\./.test(report), `item 1: the report gives the addresses that were not opened, for each source (${(report.match(/[^\n]*addresses were not opened[^\n]*/) || ["none"])[0].slice(0, 160)})`);
    const quick = lines.filter((l) => /^ {2}quick check \//.test(l));
    check(lines.some((l) => /^quick check of \d+ addresses/.test(l)) && quick.length > 0, `item 1: the quick check ran on the addresses that the budget left (${quick.length} lines, for example "${(quick[0] || "").trim()}")`);
    check(lines.some((l) => /^quick check: .*page \d+.*bot challenge 5/.test(l)), `item 1: the quick check keeps the pages "not tested" with their status, and leaves the addresses with a bot challenge unknown (${(lines.find((l) => l.startsWith("quick check: ")) || "").slice(0, 160)})`);
    const reasons = { "/broken/x/": "broken link", "/off/x/": "redirects off site", "/file/x/": "not a page" };
    for (const [p, reason] of Object.entries(reasons)) check(rec(p)?.not_tested_reason === reason, `item 1: ${p} is "${reason}", from the page time or the quick check (${rec(p)?.not_tested_reason})`);

    // Item 2.
    check(JSON.stringify(cov.budget_reached) === JSON.stringify(["time"]), `item 2: the time budget stopped the run, and the page limit counts only opened pages (budget_reached ${JSON.stringify(cov.budget_reached)})`);
    const NOT_OPENED = ["time budget", "page limit", "stopped"];
    const OUT = ["redirects off site", "skipped after redirect", "not a page", "broken link", "blocked"];
    const unknown = pages.filter((p) => NOT_OPENED.includes(p.not_tested_reason) && !p.http_status).length;
    const found = pages.filter((p) => !OUT.includes(p.not_tested_reason) && !(NOT_OPENED.includes(p.not_tested_reason) && !p.http_status)).length;
    check(unknown > 0 && (cov.pages_not_opened || 0) === unknown && cov.pages_found === found, `item 2: pages_found counts the opened pages and the pages that the quick check found, and the addresses with no request are pages_not_opened (${cov.pages_found} found, ${cov.pages_not_opened} not opened, ${cov.pages_tested} tested)`);
    check(rec("/s/03/")?.tested && !rec("/s/03") && lines.some((l) => /^1 addresses that the audit did not open differ from an opened page only by the trailing slash/.test(l)), `item 2: an address that the audit did not open and that differs from a tested page only by the trailing slash has no record (${rec("/s/03") ? rec("/s/03").not_tested_reason : "none"})`);

    // Item 3, in the crawl: the newest posts, and the report names the choice.
    const news = pages.filter((p) => /\/news\/p\d+\/$/.test(p.url)).map((p) => p.url.replace(SITE, "")).sort();
    check(JSON.stringify(news) === JSON.stringify(["/news/p18/", "/news/p19/", "/news/p20/"]), `item 3: the crawl has the 3 newest posts only (${news.join(", ")})`);
    check(report.includes('/news/*/ took 3 of 20 addresses from the sitemaps and the API, order "newest"'), "item 3: the report says which rule chose the posts");

    // Item 6.
    const gone = rec("/gone/x/");
    check(gone?.not_tested_reason === "broken link" && gone?.found_in === "/sitemap.xml", `item 6: a 404 address from a sitemap names its sitemap file in pages.jsonl (${gone?.not_tested_reason}, found_in ${gone?.found_in})`);
    check(report.includes("/gone/x/: status 404. Found in /sitemap.xml."), "item 6: the list of broken links in report.md names the sitemap file");

    // Item 11.
    const sources = lines.find((l) => l.startsWith("sources: "));
    check(/^sources: 3 from the settings, 45 from 1 sitemap files, 1 from 1 WordPress APIs$/.test(sources || ""), `item 11: the log gives the count from each source (${sources})`);
    check(lines.some((l) => l.trim() === "API /wp-json/wp/v2: 1 addresses"), "item 11: the log gives the count of each API");
    check(lines.some((l) => /addresses to start \(\d+ from the settings, \d+ from the sitemaps and the API\), not crawled: address group limit 17/.test(l)), `item 11: the log gives what the rules left (${(lines.find((l) => l.includes("addresses to start")) || "").slice(0, 160)})`);
  }

  // Items 5 and 8: two widths, a page that closes the connection after its first load, and a page with a slow image.
  {
    const dir = path.join(out, "load");
    fs.rmSync(dir, { recursive: true, force: true });
    const config = baseConfig();
    config.crawl.widths = [390, 768];
    config.crawl.load_wait_seconds = 1;
    const lines = [];
    const result = await runAudit({ config, outDir: dir, only: [`${SITE}/flaky/`, `${SITE}/slow-image/`], log: (l) => lines.push(l) });
    if (verbose) for (const l of lines) console.error("     " + l);
    const pages = readJsonl(path.join(dir, "pages.jsonl"));
    const flaky = pages.find((p) => p.url.endsWith("/flaky/"));
    check(!pages.some((p) => p.tested && p.not_tested_reason), `item 5: no record has tested: true and a not_tested_reason (${pages.filter((p) => p.tested && p.not_tested_reason).map((p) => p.url).join(", ") || "none"})`);
    check(flaky?.tested === true && JSON.stringify(flaky.widths_not_loaded) === "[768]", `item 5: the page that loaded at 390 only is tested, with the width that did not load (${JSON.stringify(flaky?.widths_not_loaded)})`);
    const slow = result.pages.find((p) => p.url.endsWith("/slow-image/"));
    check(slow?.tested === true && JSON.stringify(slow.facts.loadIncomplete) === "[390,768]", `item 8: a page with a slow image is tested, with the note (${JSON.stringify(slow?.facts.loadIncomplete)})`);
    check(fs.readFileSync(path.join(dir, "report.md"), "utf8").includes("1 pages were tested before their load event"), "item 8: the report names the page");
  }
} finally {
  await new Promise((r) => server.close(r));
}

if (failures.length) { console.error(`\n${failures.length} checks failed`); process.exit(1); }
console.error("\nall checks passed");
