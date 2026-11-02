// The scope of the crawl: hosts, redirects, error pages, files, and blocked pages. Each check is the "Check" line of one item
// of the list of problems that a large WordPress multisite showed with 1.1.1.
//
// Usage: node tests/scope.mjs
//
// One local server answers as several hosts: site.localhost (the site), www.site.localhost (the same site), sub.site.localhost
// and extra.site.localhost (other sites on subdomains), and other.localhost (another site). Node and Chromium both resolve
// *.localhost to the loopback address. Three audits run: the default settings, the subdomains permitted with a skip for one
// host, and the default settings with no error page in the settings.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAudit } from "../src/audit.ts";
import { configForUrl } from "../src/config.ts";
import { isPermitted, matchesPattern, normalizeUrl, pageKey } from "../src/crawl.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "seeded-faults", "build", "scope");
const PORT = 8093;
const SITE = `http://site.localhost:${PORT}`;
const failures = [];
const check = (ok, message) => { console.error(`${ok ? "ok  " : "FAIL"} ${message}`); if (!ok) failures.push(message); };

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const page = (title, body = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><main><h1>${title}</h1>${body}</main></body></html>`;
const links = (hrefs) => `<ul>${hrefs.map((h, i) => `<li><a href="${h}">Link ${i + 1}</a></li>`).join("")}</ul>`;

const HOME_LINKS = [
  "/about/", "/about", `http://www.site.localhost:${PORT}/contact/`, "/partner/", "/attachment/photo/", "/download", "/events/",
  "/people/jane.doe@example.com", "/learning/www.example.org", "/help/mail to:someone@example.com", "/removed-page/",
  "/blocked/", "/old.aspx", "/busy/", `http://sub.site.localhost:${PORT}/`, `http://extra.site.localhost:${PORT}/`, "/private/x/",
];

const server = http.createServer((req, res) => {
  const host = (req.headers.host || "").split(":")[0];
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  const html = (status, body, headers = {}) => { res.writeHead(status, { "content-type": "text/html; charset=utf-8", ...headers }); res.end(body); };
  const redirect = (to) => { res.writeHead(301, { location: to }); res.end(); };
  if (p === "/robots.txt") { res.writeHead(200, { "content-type": "text/plain" }); res.end("User-agent: *\nDisallow: /wp-admin/\n"); return; }
  if (p === "/pic.png" || p === "/uploads/photo.jpg") { res.writeHead(200, { "content-type": "image/png" }); res.end(PNG); return; }
  if (host === "other.localhost") return html(200, page("Another site"));
  if (host === "sub.site.localhost") return html(200, page("A subdomain site", links(["/sub-page/"])));
  if (host === "extra.site.localhost") {
    if (p === "/") return html(200, page("Extra home", `<p><img src="/pic.png" width="40" height="40"></p>${links(["/private/x/"])}`));
    if (p === "/private/x/") return html(200, page("Extra private"));
    return html(404, page("Not found"));
  }
  if (host !== "site.localhost") return html(404, page("Not found"));
  switch (p) {
    case "/": return html(200, page("Home", links(HOME_LINKS)));
    case "/about": return redirect("/about/");
    case "/about/": return html(200, page("About"));
    case "/contact/": return html(200, page("Contact"));
    case "/private/x/": return html(200, page("Site private"));
    case "/partner/": return redirect(`http://other.localhost:${PORT}/partner/`);
    case "/attachment/photo/": return redirect("/uploads/photo.jpg");
    case "/download": res.writeHead(200, { "content-type": "application/octet-stream", "content-disposition": "attachment; filename=report.bin" }); res.end(Buffer.alloc(2048)); return;
    case "/events/": return redirect("/calendar/events/");
    case "/calendar/events/": return html(200, page("Calendar"));
    case "/blocked/": return html(403, `<!doctype html><html lang="en"><head><title>Just a moment...</title></head><body><p>Checking your browser.</p></body></html>`, { "cf-mitigated": "challenge" });
    case "/old.aspx": return html(403, `<!doctype html><html lang="en"><head><title>Please wait</title><script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script></head><body><p>One moment.</p></body></html>`);
    case "/busy/": return html(429, page("Too many requests"));
    default: return html(404, page("Page not found", `<p>Sorry.</p>${links(["/"])}`));
  }
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

// The rules of the crawl, with no browser.
{
  const c = configForUrl("https://site.example");
  check(normalizeUrl(c, "http://site.example/a/", c.site.url) === "https://site.example/a/", "item 6: an http address of the site gets the scheme of the site");
  check(normalizeUrl(c, "https://www.site.example/a/", c.site.url) === "https://site.example/a/", "item 1: the www host is the site host");
  check(!isPermitted(c, "https://shop.site.example/"), "item 1: by default a subdomain is not permitted");
  c.crawl.permitted_domains = ["*.site.example"];
  check(isPermitted(c, "https://shop.site.example/") && !isPermitted(c, "https://site.example.evil.test/"), "item 1: *.site.example permits each subdomain, and nothing else");
  check(matchesPattern(c, "shop.site.example/**", "https://shop.site.example/cart/", "all") && !matchesPattern(c, "shop.site.example/**", "https://site.example/cart/", "all"), "item 2: a host pattern matches that host only");
  check(!matchesPattern(c, "/**", "https://shop.site.example/cart/", "site") && matchesPattern(c, "/**", "https://shop.site.example/cart/", "all"), "item 2: a path template stays on the site host, a path skip matches each host");
  check(pageKey(c.site.url, "https://site.example/a/") === "/a/" && pageKey(c.site.url, "https://shop.site.example/a/") === "https://shop.site.example/a/", "item 3: the key of a page of another host is its whole address");
}

const read = (dir) => {
  const pages = fs.readFileSync(path.join(dir, "pages.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const issues = fs.readdirSync(path.join(dir, "issues")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, "issues", f), "utf8")));
  const run = fs.readdirSync(path.join(dir, "runs")).filter((d) => d !== "tasks").sort().pop();
  const outcomes = fs.readFileSync(path.join(dir, "runs", run, "outcomes.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  return { pages, issues, outcomes, summary: JSON.parse(fs.readFileSync(path.join(dir, "summary.json"), "utf8")), report: fs.readFileSync(path.join(dir, "report.md"), "utf8") };
};
const audit = async (name, edit) => {
  const dir = path.join(out, name);
  fs.rmSync(dir, { recursive: true, force: true });
  const config = configForUrl(SITE, "production");
  config.crawl.widths = [390];
  config.crawl.rate_limit = 20;
  config.crawl.random_sample_share = 0;
  config.crawl.skip = ["/calendar/**"];
  config.interaction.max_states_per_page = 0;
  edit(config);
  const lines = [];
  await runAudit({ config, outDir: dir, log: (l) => lines.push(l) });
  if (process.argv.includes("--verbose")) for (const l of lines) console.error("     " + l);
  return read(dir);
};
const byPath = (pages, p) => pages.find((x) => x.url === SITE + p);

try {
  // Audit 1: the default settings, with the error page in the settings.
  console.error("audit 1: the default settings");
  const a = await audit("default", (c) => { c.crawl.sample_pages = ["/this-page-does-not-exist/"]; });
  const hosts = [...new Set(a.pages.map((p) => new URL(p.url).host))];
  check(hosts.length === 1 && hosts[0] === `site.localhost:${PORT}`, `item 1: the crawl opens no page on another host (${hosts.join(", ")})`);
  check(!!byPath(a.pages, "/contact/")?.tested, "item 1: a link to the www host is a page of the site");

  const partner = byPath(a.pages, "/partner/");
  check(partner && !partner.tested && partner.not_tested_reason === "redirects off site" && partner.redirects_to === `http://other.localhost:${PORT}/partner/`, `item 4: /partner/ is not tested, with "redirects off site" to the other site (${JSON.stringify(partner && { r: partner.not_tested_reason, to: partner.redirects_to })})`);
  check(!a.outcomes.some((o) => new URL(o.url).host !== `site.localhost:${PORT}`), "item 4: no outcome is on another site");

  const photo = byPath(a.pages, "/attachment/photo/");
  check(photo && !photo.tested && photo.not_tested_reason === "not a page", `item 5: a redirect to an image is not tested, reason "not a page" (${photo?.not_tested_reason})`);
  const download = byPath(a.pages, "/download");
  check(download && !download.tested && download.not_tested_reason === "not a page", `item 5: a download is not tested, reason "not a page" (${download?.not_tested_reason})`);
  check(!a.outcomes.some((o) => o.rule === "image-alt" || o.rule === "html-has-lang"), "item 5: no image-alt or html-has-lang outcome from the image viewer");

  const finals = a.pages.filter((p) => p.tested).map((p) => p.url);
  check(finals.length === new Set(finals).size && !byPath(a.pages, "/about"), `item 6: no two page records have the same final address, and /about is not a record (${a.pages.filter((p) => p.url.includes("/about")).map((p) => p.url).join(", ")})`);
  check(byPath(a.pages, "/about/")?.tested, "item 6: /about/ is tested once");

  const events = byPath(a.pages, "/events/");
  check(events && !events.tested && events.not_tested_reason === "skipped after redirect" && !byPath(a.pages, "/calendar/events/"), `item 7: /events/ is not tested, reason "skipped after redirect" (${events?.not_tested_reason})`);
  check(/skipped after redirect \(1\)/.test(a.report) && a.report.includes("- /events/ redirects to " + SITE + "/calendar/events/"), "item 7: the report lists /events/ in the skipped addresses");

  const errors = a.pages.filter((p) => (p.http_status === 404 || p.http_status === 410));
  const testedErrors = errors.filter((p) => p.tested);
  check(testedErrors.length === 1 && testedErrors[0].url === SITE + "/this-page-does-not-exist/", `item 8: one 404 page is tested, the error page of the settings (${testedErrors.map((p) => p.url).join(", ")})`);
  const broken = errors.filter((p) => p.not_tested_reason === "broken link");
  check(broken.length === 4 && broken.every((p) => (p.linked_from || []).includes("/")), `item 8: the other 404 pages are broken links, linked from the home page (${broken.map((p) => p.url.replace(SITE, "") + " < " + (p.linked_from || []).join(",")).join("; ")})`);
  check(/## Broken links \(4\)/.test(a.report) && a.report.includes("- /people/jane.doe@example.com: status 404. Linked from /. It looks like an email address with no mailto:.") && a.report.includes("It looks like a web address with no https://.") && a.report.includes("It looks like a mailto: link with a typo."), "item 8: report.md lists the broken links with their linking pages and a hint");

  const blocked = a.pages.filter((p) => p.not_tested_reason === "blocked").map((p) => p.url.replace(SITE, "")).sort();
  check(JSON.stringify(blocked) === JSON.stringify(["/blocked/", "/busy/", "/old.aspx"]), `item 9: the challenge pages and the rate limit are blocked (${blocked.join(", ")})`);
  const statusOf = new Map(a.pages.map((p) => [p.url, p.http_status]));
  check(!a.outcomes.some((o) => statusOf.get(o.url) === 403), "item 9: no outcome has an address whose status is 403");
  const cov = a.summary.coverage;
  check(cov.pages_found === a.pages.filter((p) => !["redirects off site", "skipped after redirect", "not a page", "broken link", "blocked"].includes(p.not_tested_reason)).length && cov.pages_out_of_scope?.["broken link"] === 4 && cov.pages_out_of_scope?.blocked === 3, `items 4-9: the pages found leave out the addresses that are not pages of the site (${JSON.stringify(cov)})`);

  // Audit 2: the subdomains permitted, one host skipped, and a template for the other host.
  console.error("audit 2: the subdomains permitted");
  const b = await audit("subdomains", (c) => {
    c.crawl.permitted_domains = ["*.site.localhost"];
    c.crawl.skip = ["/calendar/**", "sub.site.localhost/**"];
    c.crawl.templates = [{ name: "page", pattern: "/**", example_page: "/about/" }, { name: "extra", pattern: "extra.site.localhost/**", example_page: `http://extra.site.localhost:${PORT}/` }];
  });
  const bHosts = new Set(b.pages.map((p) => new URL(p.url).hostname));
  check(!bHosts.has("sub.site.localhost") && bHosts.has("extra.site.localhost"), `item 2: skip "sub.site.localhost/**" skips that host only (${[...bHosts].join(", ")})`);
  const extraHome = b.pages.find((p) => p.url === `http://extra.site.localhost:${PORT}/`);
  check(extraHome?.template === "extra" && extraHome?.set === "extra.site.localhost", `item 2: a page of the other host gets its own template and set, not the templates of the site (${extraHome?.template}, ${extraHome?.set})`);
  check(b.pages.find((p) => p.url === `http://extra.site.localhost:${PORT}/private/x/`)?.template === "extra" && byPath(b.pages, "/private/x/")?.template === "page", "item 2: the same path on two hosts gets the template of its host");
  const alt = b.issues.find((i) => i.rule.id === "image-alt");
  check(alt && alt.examples.every((e) => e.url === `http://extra.site.localhost:${PORT}/`), `item 3: the issue of the other host has the whole address in its examples (${alt?.examples.map((e) => e.url).join(", ")})`);
  check(!byPath(b.pages, "/").issues.includes(alt?.id), "item 3: the issue of the other host is not on the home page of the site");
  const testedUrls = new Set(b.pages.filter((p) => p.tested).map((p) => p.url));
  const exampleUrls = b.issues.flatMap((i) => i.examples.map((e) => new URL(e.url, SITE + "/").toString()));
  check(exampleUrls.every((u) => testedUrls.has(u)), `item 3: every example address opens a tested page (${exampleUrls.filter((u) => !testedUrls.has(u)).join(", ") || "all"})`);

  // Audit 3: no error page in the settings. The first broken link by its address is the error page.
  console.error("audit 3: no error page in the settings");
  const c3 = await audit("no-error-page", () => {});
  const tested404 = c3.pages.filter((p) => p.tested && p.http_status === 404).map((p) => p.url.replace(SITE, ""));
  check(tested404.length === 1 && tested404[0] === "/help/mail%20to:someone@example.com", `item 8: with no error page in the settings, the first broken link is tested as the error page (${tested404.join(", ")})`);
  check(c3.report.includes("status 404, tested as the error page"), "item 8: the report names the broken link that the audit tested as the error page");
} finally {
  await new Promise((r) => server.close(r));
}

if (failures.length) { console.error(`\n${failures.length} checks failed`); process.exit(1); }
console.error("\nall checks passed");
