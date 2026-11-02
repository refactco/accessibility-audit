// The crawler: finds the pages of a site from the sitemaps, the CMS API, the links, and the settings.
// It obeys the rate limit, the permitted hosts, the skip patterns, the address groups, and robots.txt.
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

/** The key of a page in the results: the path with the query on the site host, and the whole address on another host.
 *  So the pages of two hosts never merge, and the results of a site with one host keep their paths. */
export function pageKey(siteUrl: string, url: string): string {
  let u: URL;
  try { u = new URL(url, siteUrl + "/"); } catch { return url; }
  return u.host === new URL(siteUrl).host ? u.pathname + u.search : u.origin + u.pathname + u.search;
}

/** The addresses of files that are not pages, by their extension. */
export const FILE_ADDRESS = /\.(pdf|zip|jpe?g|png|gif|svg|webp|avif|bmp|tiff?|mp4|mp3|wav|webm|mov|m4a|css|js|xml|json|txt|ico|woff2?|ttf|otf|docx?|xlsx?|pptx?|csv|rtf|odt|ods|odp|epub|gz|rar|7z|dmg|exe)(\?|$)/i;

interface Pattern { host: RegExp | null; path: RegExp }
const patterns = new Map<string, Pattern>();

/** A pattern of the settings: a path glob, for example /news/**, or a host with a path glob, for example blog.example.com/**
 *  or *.example.com/**. A pattern is for a host when the part before its first slash has a dot. */
export function parsePattern(pattern: string): Pattern {
  const known = patterns.get(pattern);
  if (known) return known;
  const slash = pattern.indexOf("/");
  const head = slash < 0 ? pattern : pattern.slice(0, slash);
  let p: Pattern;
  if (!pattern.startsWith("/") && head.includes(".")) {
    const host = new RegExp("^" + head.toLowerCase().replace(/[.+^${}()|[\]\\?]/g, "\\$&").replace(/\*/g, "[^/]*") + "$");
    p = { host, path: globToRegExp(slash < 0 ? "/**" : pattern.slice(slash)) };
  } else p = { host: null, path: globToRegExp(pattern) };
  patterns.set(pattern, p);
  return p;
}

/** True when a pattern of the settings matches the address. A pattern with a host matches that host only. A path pattern
 *  matches on each host ("all", for the skip patterns and the address groups) or on the site host only ("site", for the
 *  templates and the sets: another host has its own templates). */
export function matchesPattern(config: Config, pattern: string, url: string, scope: "all" | "site"): boolean {
  const u = new URL(url);
  const p = parsePattern(pattern);
  if (p.host) return (p.host.test(u.hostname) || p.host.test(u.host)) && p.path.test(u.pathname + u.search);
  if (scope === "site" && u.host !== new URL(config.site.url).host) return false;
  return p.path.test(u.pathname + u.search);
}

export function templateOf(config: Config, url: string): string | null {
  let best: { name: string; score: number } | null = null;
  for (const t of config.crawl.templates) {
    if (!t.pattern || !matchesPattern(config, t.pattern, url, "site")) continue;
    const score = t.pattern.replace(/\*/g, "").length * 10 - (t.pattern.match(/\*/g) || []).length;
    if (!best || score > best.score) best = { name: t.name, score };
  }
  return best ? best.name : null;
}

/** The set of web pages of an address. A page of another host is in a set with the name of its host, unless a pattern names it. */
export function setOf(config: Config, url: string): string {
  for (const s of config.site.sets || []) {
    if (s.patterns.some((p) => matchesPattern(config, p, url, "site"))) return s.name;
  }
  const u = new URL(url);
  return u.host === new URL(config.site.url).host ? "site" : u.hostname;
}

const bareHost = (host: string) => host.replace(/^www\./, "");

/** Normalizes an address: removes the fragment, the parameters that are not kept, and a trailing index.html. The www host of
 *  the site and the bare host are the same site: both become the host of the settings, with the scheme of the settings. */
export function normalizeUrl(config: Config, raw: string, base: string): string | null {
  let u: URL;
  try { u = new URL(raw, base); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  const keep = new Set(config.crawl.parameters.keep);
  for (const key of [...u.searchParams.keys()]) if (!keep.has(key)) u.searchParams.delete(key);
  u.pathname = u.pathname.replace(/\/index\.html$/, "/");
  const site = new URL(config.site.url);
  if (bareHost(u.hostname) === bareHost(site.hostname) && (!u.port || u.port === site.port)) {
    u.protocol = site.protocol;
    u.host = site.host;
  }
  return u.toString();
}

/** True for the site host, and for the hosts of permitted_domains: a name is one host, and *.example.com is each subdomain of example.com. */
export function isPermitted(config: Config, url: string): boolean {
  const u = new URL(url);
  if (u.host === new URL(config.site.url).host) return true;
  return config.crawl.permitted_domains.some((d) => {
    const name = d.toLowerCase();
    return name.startsWith("*.") ? u.hostname.endsWith(name.slice(1)) : u.hostname === name || u.host === name;
  });
}

export function isSkipped(config: Config, url: string): boolean {
  return config.crawl.skip.some((g) => matchesPattern(config, g, url, "all"));
}

/** The product token of the crawler in robots.txt. */
export const ROBOTS_AGENT = "accessibility-audit";

export interface RobotsRule { allow: boolean; length: number; re: RegExp }
export interface Robots { rules: RobotsRule[]; sitemaps: string[]; crawlDelay: number | null }

/** Percent-encodings in upper case, so that a pattern and a path compare the same octets. */
const upperEscapes = (s: string) => s.replace(/%[0-9a-f]{2}/gi, (m) => m.toUpperCase());

/** A rule path of robots.txt as RFC 9309 defines it: * matches any characters, the slash too, and a final $ anchors the end. */
function robotsPattern(value: string): RegExp {
  const end = value.endsWith("$");
  const body = upperEscapes(end ? value.slice(0, -1) : value).replace(/[.+^${}()|[\]\\?]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp("^" + body + (end ? "$" : ""));
}

/** Reads robots.txt as RFC 9309 does: the groups that name the crawler, or else the groups of *. */
export function parseRobots(text: string, agent: string = ROBOTS_AGENT): Robots {
  interface Group { agents: string[]; rules: RobotsRule[]; crawlDelay: number | null }
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let current: Group | null = null;
  let afterAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase(), value = m[2].trim();
    if (key === "user-agent") {
      // Lines of user-agent in a row start one group together.
      if (!current || !afterAgent) { current = { agents: [], rules: [], crawlDelay: null }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      afterAgent = true;
      continue;
    }
    afterAgent = false;
    if (key === "sitemap") { sitemaps.push(value); continue; }
    if (!current) continue;
    if ((key === "allow" || key === "disallow") && value) current.rules.push({ allow: key === "allow", length: upperEscapes(value).length, re: robotsPattern(value) });
    else if (key === "crawl-delay") current.crawlDelay = Number(value) || null;
  }
  const me = agent.toLowerCase();
  const named = groups.filter((g) => g.agents.includes(me));
  const chosen = named.length ? named : groups.filter((g) => g.agents.includes("*"));
  return { rules: chosen.flatMap((g) => g.rules), sitemaps, crawlDelay: chosen.find((g) => g.crawlDelay !== null)?.crawlDelay ?? null };
}

/** True when robots.txt disallows the path with its query: the longest matching rule decides, and Allow wins a tie. */
export function robotsDisallows(robots: Robots | null, pathAndQuery: string): boolean {
  if (!robots || pathAndQuery === "/robots.txt") return false;
  const path = upperEscapes(pathAndQuery);
  let best: RobotsRule | null = null;
  for (const r of robots.rules) {
    if (!r.re.test(path)) continue;
    if (!best || r.length > best.length || (r.length === best.length && r.allow)) best = r;
  }
  return !!best && !best.allow;
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

const decodeXml = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");

export interface SitemapResult { pages: string[]; files: string[] }

/** Reads the sitemaps and the sitemap indexes to a depth of 4, for example a multisite index, then the index of a subsite, then
 *  its post sitemap. Each file is read once, the files must be on a permitted host, and the counts have caps. */
export async function readSitemaps(urls: string[], limiter: RateLimiter, options: { permitted?: (url: string) => boolean; maxDepth?: number; maxFiles?: number; maxPages?: number } = {}): Promise<SitemapResult> {
  const maxDepth = options.maxDepth ?? 4, maxFiles = options.maxFiles ?? 2000, maxPages = options.maxPages ?? 100000;
  const pages: string[] = [];
  const files: string[] = [];
  const read = new Set<string>();
  let level = urls.map((u) => ({ url: u, depth: 0 }));
  while (level.length) {
    const next: { url: string; depth: number }[] = [];
    for (const { url, depth } of level) {
      if (read.has(url) || files.length >= maxFiles || pages.length >= maxPages) continue;
      read.add(url);
      if (options.permitted && !options.permitted(url)) continue;
      const r = await fetchText(url, limiter);
      if (!r || r.status !== 200) continue;
      files.push(url);
      const locs = [...r.text.matchAll(/<loc>\s*(?:<!\[CDATA\[\s*)?([^<\s\]]+)\s*(?:\]\]>\s*)?<\/loc>/g)].map((m) => decodeXml(m[1]));
      if (/<sitemapindex/i.test(r.text)) { if (depth < maxDepth) for (const l of locs) next.push({ url: l, depth: depth + 1 }); }
      else for (const l of locs) if (pages.length < maxPages) pages.push(l);
    }
    level = next;
  }
  return { pages, files };
}

/** A queue that gives its addresses in turn by section: the host and the first part of the path. So a budget that ends early
 *  has tested some pages of each section, not all the posts of one large section. */
export class SectionQueue {
  private readonly sections = new Map<string, string[]>();
  private order: string[] = [];
  private turn = 0;
  get length(): number { let n = 0; for (const q of this.sections.values()) n += q.length; return n; }
  push(url: string): void {
    const u = new URL(url);
    const key = u.host + "/" + (u.pathname.split("/")[1] || "");
    const q = this.sections.get(key);
    if (q) q.push(url);
    else { this.sections.set(key, [url]); this.order.push(key); }
  }
  shift(): string | undefined {
    for (let i = 0; i < this.order.length; i++) {
      const key = this.order[(this.turn + i) % this.order.length];
      const q = this.sections.get(key)!;
      if (q.length) { this.turn = (this.turn + i + 1) % this.order.length; return q.shift(); }
    }
    return undefined;
  }
  /** All addresses, for a test. */
  flat(): string[] { return [...this.sections.values()].flat(); }
}

export interface Frontier {
  /** The addresses to open, by priority: 0 the settings, in their order; 1 the sitemaps and the CMS API; 2 the links. Tiers 1
   *  and 2 give their addresses in turn by section. */
  queues: [string[], SectionQueue, SectionQueue];
  seen: Set<string>;
  skipped: { url: string; reason: string }[];
  groupCounts: Map<string, number>;
  /** robots.txt of the site host. */
  robots: Robots | null;
  /** robots.txt of each origin, read on the first visit to that origin. */
  robotsByOrigin: Map<string, Promise<Robots | null>>;
  sitemapUrls: string[];
  sitemapFiles: string[];
  /** The pages that link to each address, up to 5, for the list of broken links. */
  linkedFrom: Map<string, string[]>;
}

export function newFrontier(): Frontier {
  return { queues: [[], new SectionQueue(), new SectionQueue()], seen: new Set(), skipped: [], groupCounts: new Map(), robots: null, robotsByOrigin: new Map(), sitemapUrls: [], sitemapFiles: [], linkedFrom: new Map() };
}

/** The next address to open: the settings first, then the sitemaps and the API, then the links. */
export function nextAddress(f: Frontier): string | undefined {
  for (const q of f.queues) if (q.length) return q.shift();
  return undefined;
}

export function queuedCount(f: Frontier): number {
  return f.queues[0].length + f.queues[1].length + f.queues[2].length;
}

/** All queued addresses, for a test. */
export function queuedAddresses(f: Frontier): string[] {
  return [...f.queues[0], ...f.queues[1].flat(), ...f.queues[2].flat()];
}

/** robots.txt of the origin of an address, read once for each origin. */
export function robotsFor(f: Frontier, url: string, limiter: RateLimiter): Promise<Robots | null> {
  const origin = new URL(url).origin;
  let known = f.robotsByOrigin.get(origin);
  if (!known) {
    known = fetchText(origin + "/robots.txt", limiter).then((r) => (r && r.status === 200 ? parseRobots(r.text) : null));
    f.robotsByOrigin.set(origin, known);
  }
  return known;
}

/** Adds an address to the frontier when the rules permit it. Returns the reason when it does not.
 *  tier: 0 the settings, 1 the sitemaps and the API, 2 the links. from: the page that links to the address. */
export function offer(config: Config, f: Frontier, raw: string, base: string, options: { tier?: number; from?: string } = {}): string | null {
  const url = normalizeUrl(config, raw, base);
  if (!url) return "not an address";
  if (options.from) {
    const list = f.linkedFrom.get(url) || [];
    if (list.length < 5 && !list.includes(options.from)) { list.push(options.from); f.linkedFrom.set(url, list); }
  }
  if (f.seen.has(url)) return null;
  if (!isPermitted(config, url)) { f.seen.add(url); return null; }
  if (FILE_ADDRESS.test(pathOf(url))) { f.seen.add(url); return null; }
  let reason: string | null = null;
  // robots.txt of the site host is known before the crawl. The robots.txt of another host is read on the first visit to it.
  const siteOrigin = new URL(config.site.url).origin;
  if (isSkipped(config, url)) reason = "skipped";
  else if (config.crawl.obey_robots && new URL(url).origin === siteOrigin && robotsDisallows(f.robots, pathOf(url))) reason = "robots";
  else {
    for (const g of config.crawl.address_groups) {
      if (matchesPattern(config, g.pattern, url, "all")) {
        const n = f.groupCounts.get(g.pattern) || 0;
        if (n >= g.limit) { reason = "address group limit"; break; }
        f.groupCounts.set(g.pattern, n + 1);
      }
    }
  }
  f.seen.add(url);
  if (reason) { f.skipped.push({ url, reason }); return reason; }
  f.queues[Math.min(Math.max(options.tier ?? 2, 0), 2)].push(url);
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

/** Reads the pages and the posts of a WordPress REST API, as a source of addresses. At most 50 requests of 100 items for each kind. */
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

/** The WordPress REST APIs to read: the addresses of the settings, and for a WordPress multisite on one host, the API of each
 *  subsite whose sitemap the crawl read, for example /news/sitemap_index.xml gives /news/wp-json/wp/v2. At most 300. */
export function wordPressApis(config: Config, sitemapFiles: string[]): string[] {
  const cms = config.site.cms;
  if (!cms || (cms.type !== "wordpress" && cms.type !== "headless-wordpress")) return [];
  const given = (Array.isArray(cms.api_url) ? cms.api_url : typeof cms.api_url === "string" ? [cms.api_url] : []).filter((u): u is string => typeof u === "string");
  const apis = new Set(given.map((u) => u.replace(/\/$/, "")));
  // A headless front end has its API on another host, so its sitemaps say nothing about the subsites.
  const root = given.find((u) => new URL(u).host === new URL(config.site.url).host && /\/wp-json\/wp\/v2\/?$/.test(u));
  if (cms.type === "wordpress" && root) {
    for (const file of sitemapFiles) {
      let dir: URL;
      try { dir = new URL(".", file); } catch { continue; }
      if (!isPermitted(config, dir.toString())) continue;
      apis.add(new URL("wp-json/wp/v2", dir).toString());
      if (apis.size >= 300) break;
    }
  }
  return [...apis];
}

/** Seeds the frontier: the start address, the settings, robots.txt, the sitemaps, and the CMS API. */
export async function seed(config: Config, f: Frontier, limiter: RateLimiter, only?: string[]): Promise<void> {
  const base = config.site.url + "/";
  if (only && only.length) {
    for (const u of only) offer(config, f, u, base, { tier: 0 });
    return;
  }
  const robots = await fetchText(new URL("/robots.txt", base).toString(), limiter);
  if (robots && robots.status === 200) f.robots = parseRobots(robots.text);
  f.robotsByOrigin.set(new URL(base).origin, Promise.resolve(f.robots));
  offer(config, f, base, base, { tier: 0 });
  for (const p of config.crawl.sample_pages) offer(config, f, p, base, { tier: 0 });
  for (const t of config.crawl.templates) if (t.example_page) offer(config, f, t.example_page, base, { tier: 0 });
  for (const p of config.interaction.processes) for (const s of p.steps) offer(config, f, s.page, base, { tier: 0 });
  const sitemaps = f.robots?.sitemaps.length ? [...f.robots.sitemaps] : [new URL("/sitemap.xml", base).toString()];
  // A site under a path, for example a test site, can have its own sitemap under that path.
  if (new URL(base).pathname !== "/") sitemaps.push(new URL("sitemap.xml", base).toString());
  const read = await readSitemaps([...new Set(sitemaps)], limiter, { permitted: (u) => { try { return isPermitted(config, normalizeUrl(config, u, base) || u); } catch { return false; } } });
  f.sitemapUrls = read.pages;
  f.sitemapFiles = read.files;
  for (const u of f.sitemapUrls) offer(config, f, u, base, { tier: 1 });
  for (const api of wordPressApis(config, f.sitemapFiles)) {
    for (const u of await readWordPressApi(api, limiter)) offer(config, f, u, base, { tier: 1 });
  }
}
