// The discovery of the pages: sitemaps in more than one level, the WordPress API of each subsite of a multisite, and robots.txt
// as RFC 9309 reads it. Each check is the "Check" line of one item of the list of problems of 1.1.1. No browser runs.
//
// Usage: node tests/discovery.mjs
import http from "node:http";
import { configForUrl } from "../src/config.ts";
import { RateLimiter, newFrontier, nextAddress, offer, parseRobots, queuedAddresses, robotsDisallows, seed } from "../src/crawl.ts";

const PORT = 8094;
const SITE = `http://127.0.0.1:${PORT}`;
const failures = [];
const check = (ok, message) => { console.error(`${ok ? "ok  " : "FAIL"} ${message}`); if (!ok) failures.push(message); };

const urlset = (paths) => `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((p) => `<url><loc>${SITE}${p}</loc></url>`).join("")}</urlset>`;
const index = (paths) => `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((p) => `<sitemap><loc>${SITE}${p}</loc></sitemap>`).join("")}</sitemapindex>`;
const ROBOTS = `User-agent: *
Disallow: /*/page/
Disallow: *.pdf$
Disallow: */wp-admin/
Allow: /news/tag/keep/page/
Sitemap: ${SITE}/sitemap_index.xml
`;
// A multisite with a root index, an index for each subsite, and the post sitemaps of the subsites: three levels.
const FILES = {
  "/robots.txt": ["text/plain", ROBOTS],
  "/sitemap_index.xml": ["application/xml", index(["/page-sitemap.xml", "/news/sitemap_index.xml", "/sitemap_index.xml"])],
  "/page-sitemap.xml": ["application/xml", urlset(["/", "/about/"])],
  "/news/sitemap_index.xml": ["application/xml", index(["/news/post-sitemap.xml", "/news/tag-sitemap.xml"])],
  "/news/post-sitemap.xml": ["application/xml", urlset(["/news/deep-post/", "/news/report.pdf"])],
  "/news/tag-sitemap.xml": ["application/xml", urlset(["/news/tag/science/", "/news/tag/science/page/2/", "/news/tag/keep/page/2/", "/news/wp-admin/options.php"])],
  // The API of the root site and the API of the news subsite. One post is only in the API.
  "/wp-json/wp/v2/pages": ["application/json", JSON.stringify([{ link: `${SITE}/about/` }])],
  "/wp-json/wp/v2/posts": ["application/json", "[]"],
  "/news/wp-json/wp/v2/pages": ["application/json", "[]"],
  "/news/wp-json/wp/v2/posts": ["application/json", JSON.stringify([{ link: `${SITE}/news/api-only-post/` }, { link: `${SITE}/news/deep-post/` }])],
};
const requests = [];
const server = http.createServer((req, res) => {
  const p = new URL(req.url, SITE).pathname;
  requests.push(p);
  const f = FILES[p];
  if (!f) { res.writeHead(404, { "content-type": "text/plain" }); res.end("not found"); return; }
  res.writeHead(200, { "content-type": f[0] }); res.end(f[1]);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const crawl = async (edit = () => {}) => {
  const config = configForUrl(SITE, "production");
  config.crawl.rate_limit = 50;
  edit(config);
  const f = newFrontier();
  await seed(config, f, new RateLimiter(config.crawl.rate_limit));
  return { f, queued: new Set(queuedAddresses(f).map((u) => u.replace(SITE, ""))), skipped: new Map(f.skipped.map((s) => [s.url.replace(SITE, ""), s.reason])) };
};

try {
  // Item 10: three levels of sitemaps, and an index that names itself.
  const a = await crawl();
  check(a.queued.has("/news/deep-post/"), `item 10: a post of a subsite sitemap, three levels down, is in the frontier (${a.f.sitemapUrls.length} sitemap addresses from ${a.f.sitemapFiles.length} files)`);
  check(requests.filter((p) => p === "/sitemap_index.xml").length === 1, "item 10: an index that names itself is read once");

  // Item 11: the WordPress API of the root site, and the API of the subsite that the sitemaps show.
  requests.length = 0;
  const b = await crawl((c) => { c.site.cms = { type: "wordpress", api_url: `${SITE}/wp-json/wp/v2` }; });
  check(b.queued.has("/news/api-only-post/"), "item 11: a post that only the API of a subsite lists is in the frontier");
  check(requests.includes("/news/wp-json/wp/v2/posts"), "item 11: the crawl read the API of the news subsite, found from its sitemap");
  const c = await crawl((c) => { c.site.cms = { type: "wordpress", api_url: [`${SITE}/news/wp-json/wp/v2`] }; });
  check(c.queued.has("/news/api-only-post/"), "item 11: api_url can be a list of addresses");
  requests.length = 0;
  await crawl((c) => { c.site.cms = { type: "headless-wordpress", api_url: `http://cms.localhost:${PORT}/wp-json/wp/v2` }; });
  check(!requests.includes("/news/wp-json/wp/v2/posts"), "item 11: a headless site does not look for subsite APIs on its front end");

  // Item 12: robots.txt, with * across slashes, $ at the end, and Allow.
  check(a.skipped.get("/news/tag/science/page/2/") === "robots", `item 12: /news/tag/science/page/2/ is skipped with the reason robots (${a.skipped.get("/news/tag/science/page/2/")})`);
  check(a.queued.has("/news/tag/keep/page/2/"), "item 12: a longer Allow rule wins over Disallow");
  check(a.skipped.get("/news/wp-admin/options.php") === "robots", "item 12: a leading * matches across slashes");
  const r = parseRobots(ROBOTS);
  check(robotsDisallows(r, "/files/report.pdf") && !robotsDisallows(r, "/files/report.pdf?download=1") && !robotsDisallows(r, "/files/report.pdf.html"), "item 12: a final $ anchors the end of the address");
  const named = parseRobots("User-agent: *\nDisallow: /\n\nUser-agent: Accessibility-Audit\nUser-agent: other-bot\nDisallow: /private/\n");
  check(!robotsDisallows(named, "/about/") && robotsDisallows(named, "/private/x"), "item 12: a group that names the crawler replaces the group of *");
  const tie = parseRobots("User-agent: *\nDisallow: /a/\nAllow: /a/\nDisallow: /news/*%e2%97%86\n");
  check(!robotsDisallows(tie, "/a/b") && robotsDisallows(tie, "/news/x%E2%97%86"), "item 12: Allow wins a tie, and percent-encodings compare in any letter case");

  // Item 14: the order of the visits. The settings first, then the sitemap and API pages in turn by section. Since 1.3.0 the links
  // get 1 of each 4 places after the settings (item 1 of the list of problems of 1.2.0), so a large sitemap does not keep them out.
  {
    const config = configForUrl(SITE, "production");
    const f = newFrontier();
    offer(config, f, "/sample/", SITE + "/", { tier: 0 });
    for (const p of ["/news/1/", "/news/2/", "/news/3/", "/news/4/", "/news/5/", "/news/6/", "/about/", "/research/lab/"]) offer(config, f, p, SITE + "/", { tier: 1 });
    offer(config, f, "/linked/page/", SITE + "/", { tier: 2, from: SITE + "/" });
    offer(config, f, "/news/7/", SITE + "/", { tier: 1 });
    const order = [];
    for (let u = nextAddress(f); u; u = nextAddress(f)) order.push(u.replace(SITE, ""));
    check(order[0] === "/sample/", `item 14: the pages of the settings come first (${order[0]})`);
    check(new Set(order.slice(1, 4).map((p) => p.split("/")[1])).size === 3, `item 14: the sitemap pages come in turn by section, so a budget that ends early has each section (${order.slice(1, 5).join(", ")})`);
    check(order[4] === "/linked/page/" && order.includes("/news/7/"), `item 14 and item 1 of 1.2.0: a link comes after three sitemap and API pages, not after all of them (${order.slice(1, 6).join(", ")})`);
  }
} finally {
  await new Promise((r) => server.close(r));
}

if (failures.length) { console.error(`\n${failures.length} checks failed`); process.exit(1); }
console.error("\nall checks passed");
