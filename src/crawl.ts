// The crawler: finds the pages of a site from the sitemap, the links, and the settings.
// It obeys the rate limit, the permitted domains, the skip patterns, the address groups, and robots.txt.
import type { Config } from "./config.ts";

export class RateLimiter {
  private next = 0;
  private readonly interval: number;
  constructor(perSecond: number) { this.interval = 1000 / Math.max(perSecond, 0.01); }
  async wait(): Promise<void> {
    const now = Date.now();
    const at = Math.max(now, this.next);
    this.next = at + this.interval;
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
  }
}

/** A glob with ** and * on the path and the query of an address. */
export function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\?]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*");
  return new RegExp("^" + escaped + "/?$");
}

export function pathOf(url: string): string {
  const u = new URL(url);
  return u.pathname + u.search;
}

export function templateOf(config: Config, url: string): string | null {
  const path = pathOf(url);
  let best: { name: string; score: number } | null = null;
  for (const t of config.crawl.templates) {
    if (!globToRegExp(t.pattern).test(path)) continue;
    const score = t.pattern.replace(/\*/g, "").length * 10 - (t.pattern.match(/\*/g) || []).length;
    if (!best || score > best.score) best = { name: t.name, score };
  }
  return best ? best.name : null;
}

export function setOf(config: Config, url: string): string {
  const path = pathOf(url);
  for (const s of config.site.sets || []) {
    if (s.patterns.some((p) => globToRegExp(p).test(path))) return s.name;
  }
  return "site";
}

/** Normalizes an address: removes the fragment, the parameters that are not kept, and a trailing index.html. */
export function normalizeUrl(config: Config, raw: string, base: string): string | null {
  let u: URL;
  try { u = new URL(raw, base); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  const keep = new Set(config.crawl.parameters.keep);
  for (const key of [...u.searchParams.keys()]) if (!keep.has(key)) u.searchParams.delete(key);
  u.pathname = u.pathname.replace(/\/index\.html$/, "/");
  return u.toString();
}

export function isPermitted(config: Config, url: string): boolean {
  const host = new URL(url).hostname;
  const domains = config.crawl.permitted_domains.length ? config.crawl.permitted_domains : [new URL(config.site.url).hostname];
  return domains.some((d) => host === d || host.endsWith("." + d));
}

export function isSkipped(config: Config, url: string): boolean {
  const path = pathOf(url);
  return config.crawl.skip.some((g) => globToRegExp(g).test(path));
}

export interface Robots { disallow: RegExp[]; sitemaps: string[]; crawlDelay: number | null }

export function parseRobots(text: string): Robots {
  const robots: Robots = { disallow: [], sitemaps: [], crawlDelay: null };
  let applies = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase(), value = m[2].trim();
    if (key === "user-agent") applies = value === "*";
    else if (key === "sitemap") robots.sitemaps.push(value);
    else if (applies && key === "disallow" && value) robots.disallow.push(globToRegExp(value.endsWith("*") ? value : value + "**"));
    else if (applies && key === "crawl-delay") robots.crawlDelay = Number(value) || null;
  }
  return robots;
}

export async function fetchText(url: string, limiter: RateLimiter): Promise<{ status: number; text: string } | null> {
  await limiter.wait();
  try {
    const r = await fetch(url, { headers: { "user-agent": "accessibility-audit/0.1 (+a11y)" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
    return { status: r.status, text: await r.text() };
  } catch {
    return null;
  }
}

/** Reads a sitemap or a sitemap index, with one level of nesting. */
export async function readSitemaps(urls: string[], limiter: RateLimiter, depth = 0): Promise<string[]> {
  const out: string[] = [];
  for (const url of urls) {
    const r = await fetchText(url, limiter);
    if (!r || r.status !== 200) continue;
    const locs = [...r.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
    if (/<sitemapindex/i.test(r.text) && depth < 1) out.push(...(await readSitemaps(locs, limiter, depth + 1)));
    else out.push(...locs);
  }
  return out;
}

export interface Frontier {
  /** The addresses to open, in order, with their origin. */
  queue: string[];
  seen: Set<string>;
  skipped: { url: string; reason: string }[];
  groupCounts: Map<string, number>;
  robots: Robots | null;
  sitemapUrls: string[];
}

export function newFrontier(): Frontier {
  return { queue: [], seen: new Set(), skipped: [], groupCounts: new Map(), robots: null, sitemapUrls: [] };
}

/** Adds an address to the frontier when the rules permit it. Returns the reason when it does not. */
export function offer(config: Config, f: Frontier, raw: string, base: string): string | null {
  const url = normalizeUrl(config, raw, base);
  if (!url) return "not an address";
  if (f.seen.has(url)) return null;
  if (!isPermitted(config, url)) { f.seen.add(url); return null; }
  if (/\.(pdf|zip|jpe?g|png|gif|svg|webp|mp4|mp3|wav|webm|css|js|xml|json|txt|ico|woff2?)(\?|$)/i.test(new URL(url).pathname + new URL(url).search)) { f.seen.add(url); return null; }
  let reason: string | null = null;
  if (isSkipped(config, url)) reason = "skipped";
  else if (config.crawl.obey_robots && f.robots && f.robots.disallow.some((d) => d.test(pathOf(url)))) reason = "robots";
  else {
    for (const g of config.crawl.address_groups) {
      if (globToRegExp(g.pattern).test(pathOf(url))) {
        const n = f.groupCounts.get(g.pattern) || 0;
        if (n >= g.limit) { reason = "address group limit"; break; }
        f.groupCounts.set(g.pattern, n + 1);
      }
    }
  }
  f.seen.add(url);
  if (reason) { f.skipped.push({ url, reason }); return reason; }
  f.queue.push(url);
  return null;
}

/** The common pages of WCAG-EM and of the EU decision 2018/1524, by the last part of the path. */
const COMMON = /^(login|log-in|signin|sign-in|register|sign-up|signup|sitemap|contact|contact-us|help|support|faq|faqs|privacy|privacy-policy|terms|terms-of-service|terms-and-conditions|legal|imprint|impressum|cookies|cookie-policy|accessibility|accessibility-statement|search|404|not-found)$/i;

/** True for a page of the common list: login, sitemap, contact, help, legal pages, search, the error page, and the accessibility statement. */
export function isCommonPage(url: string): boolean {
  const path = new URL(url).pathname.replace(/\/$/, "").replace(/\.(html?|php)$/, "");
  if (path === "") return true;
  const last = path.split("/").pop() || "";
  return COMMON.test(last);
}

/** Reads the pages and the posts of a WordPress REST API, as a source of addresses. */
export async function readWordPressApi(apiUrl: string, limiter: RateLimiter): Promise<string[]> {
  const out: string[] = [];
  for (const kind of ["pages", "posts"]) {
    for (let page = 1; page <= 50; page++) {
      const r = await fetchText(`${apiUrl.replace(/\/$/, "")}/${kind}?per_page=100&page=${page}&_fields=link`, limiter);
      if (!r || r.status !== 200) break;
      let items: { link?: string }[];
      try { items = JSON.parse(r.text); } catch { break; }
      if (!Array.isArray(items) || !items.length) break;
      for (const i of items) if (i.link) out.push(i.link);
      if (items.length < 100) break;
    }
  }
  return out;
}

/** Seeds the frontier: the start address, the settings, robots.txt, the sitemaps, and the CMS API. */
export async function seed(config: Config, f: Frontier, limiter: RateLimiter, only?: string[]): Promise<void> {
  const base = config.site.url + "/";
  if (only && only.length) {
    for (const u of only) offer(config, f, u, base);
    return;
  }
  const robots = await fetchText(new URL("/robots.txt", base).toString(), limiter);
  if (robots && robots.status === 200) f.robots = parseRobots(robots.text);
  offer(config, f, base, base);
  for (const p of config.crawl.sample_pages) offer(config, f, p, base);
  for (const t of config.crawl.templates) if (t.example_page) offer(config, f, t.example_page, base);
  for (const p of config.interaction.processes) for (const s of p.steps) offer(config, f, s.page, base);
  const sitemaps = f.robots?.sitemaps.length ? f.robots.sitemaps : [new URL("/sitemap.xml", base).toString()];
  // A site under a path, for example a test site, can have its own sitemap under that path.
  if (new URL(base).pathname !== "/") sitemaps.push(new URL("sitemap.xml", base).toString());
  f.sitemapUrls = await readSitemaps([...new Set(sitemaps)], limiter);
  for (const u of f.sitemapUrls) offer(config, f, u, base);
  const cms = config.site.cms;
  if (cms && typeof cms.api_url === "string" && (cms.type === "wordpress" || cms.type === "headless-wordpress")) {
    for (const u of await readWordPressApi(cms.api_url, limiter)) offer(config, f, u, base);
  }
}
