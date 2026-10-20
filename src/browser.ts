// The browser layer: opens pages with Playwright and Chromium, closes the cookie banner, and gives helpers to the in-page scripts.
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import type { Config } from "./config.ts";

/** The storage state file of a login role. The secret names an environment variable that holds the path. The value is never printed. */
export function storageStateFor(secretName?: string): { path?: string; warning?: string } {
  if (!secretName) return {};
  const value = process.env[secretName];
  if (!value) return { warning: `The secret ${secretName} is not set.` };
  if (!existsSync(value)) return { warning: `The file that the secret ${secretName} names does not exist.` };
  return { path: value };
}

/** In-page helper functions, as source text. Each in-page script starts with them. */
export const HELPERS = `
function sel(el) {
  if (!el || el.nodeType !== 1) return "";
  if (el.id && document.querySelectorAll("#" + CSS.escape(el.id)).length === 1) return "#" + CSS.escape(el.id);
  const parts = [];
  let node = el;
  while (node && node.nodeType === 1 && node !== document.documentElement) {
    let s = node.localName;
    const p = node.parentElement;
    if (node.id && document.querySelectorAll("#" + CSS.escape(node.id)).length === 1) { parts.unshift("#" + CSS.escape(node.id)); break; }
    if (p) {
      const same = Array.from(p.children).filter((c) => c.localName === node.localName);
      if (same.length > 1) s += ":nth-child(" + (Array.from(p.children).indexOf(node) + 1) + ")";
    }
    parts.unshift(s);
    node = p;
  }
  return parts.join(" > ");
}
function item(el) {
  if (!el || el.nodeType !== 1) return "";
  const cls = Array.from(el.classList).slice(0, 3).join(".");
  const key = el.getAttribute("src") || el.getAttribute("href") || el.getAttribute("name") || el.getAttribute("aria-label") || "";
  const text = (el.innerText || el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 40);
  return el.localName + (el.id ? "#" + el.id : "") + (cls ? "." + cls : "") + "|" + (key ? key.split("/").pop() : "") + "|" + text;
}
function visible(el) {
  if (!el || el.nodeType !== 1) return false;
  const cs = getComputedStyle(el);
  if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}
function html(el) { return el && el.outerHTML ? el.outerHTML.replace(/\\s+/g, " ").slice(0, 400) : ""; }
function nameOf(el) {
  const label = el.getAttribute("aria-label");
  if (label) return label.trim();
  const ids = el.getAttribute("aria-labelledby");
  if (ids) return ids.split(/\\s+/).map((i) => (document.getElementById(i) || {}).textContent || "").join(" ").trim();
  if (el.labels && el.labels.length) return Array.from(el.labels).map((l) => l.textContent).join(" ").trim();
  const alt = el.getAttribute("alt"); if (alt !== null && el.localName === "img") return alt.trim();
  return (el.innerText || el.textContent || el.getAttribute("title") || el.value || "").trim().replace(/\\s+/g, " ");
}
const FOCUSABLE = 'a[href], area[href], button, input:not([type=hidden]), select, textarea, iframe, summary, [tabindex], [contenteditable=true]';
function tabbable() {
  return Array.from(document.querySelectorAll(FOCUSABLE)).filter((el) => {
    if (el.disabled || el.getAttribute("tabindex") === "-1" || el.closest("[inert]")) return false;
    return visible(el);
  });
}
`;

export async function launch(): Promise<Browser> {
  return chromium.launch();
}

/** blocked: the navigations of the main frame that scripts started after the load. blockedRequests: the non-GET requests on production. */
export interface Opened { page: Page; status: number | undefined; ok: boolean; error?: string; blocked: string[]; blockedRequests: string[] }

/** Opens a page at the width of the context. Blocks navigations that scripts start after the load, and records them. */
export async function openPage(context: BrowserContext, url: string, config: Config, options: { blockNavigation?: boolean; closeBanner?: boolean } = {}): Promise<Opened> {
  const page = await context.newPage();
  const blocked: string[] = [];
  const blockedRequests: string[] = [];
  let loaded = false;
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (loaded && options.blockNavigation !== false && req.isNavigationRequest() && req.frame() === page.mainFrame()) {
      blocked.push(req.url());
      await route.abort("aborted");
      return;
    }
    if (loaded && req.method() !== "GET" && config.site.environment === "production") {
      blockedRequests.push(req.method() + " " + req.url());
      await route.abort("aborted");
      return;
    }
    await route.continue();
  });
  let status: number | undefined;
  let ok = true;
  let error: string | undefined;
  try {
    const response = await page.goto(url, { waitUntil: "load", timeout: 45000 });
    status = response?.status();
    // The fonts change the layout, so the tests wait for them.
    await page.evaluate("document.fonts ? document.fonts.ready.then(() => true) : true").catch(() => {});
    await page.waitForTimeout(400);
  } catch (e) {
    ok = false;
    error = (e as Error).message.split("\n")[0];
  }
  loaded = true;
  if (ok && options.closeBanner !== false) await closeBanner(page, config);
  return { page, status, ok, error, blocked, blockedRequests };
}

/** The contexts whose first page waited for the banner. A banner or a popup can open some seconds after the load. */
const bannerWaited = new WeakSet<BrowserContext>();

export async function closeBanner(page: Page, config: Config): Promise<boolean> {
  const dismiss = config.crawl.cookie_banner?.dismiss_selector;
  if (!dismiss) return false;
  try {
    const button = page.locator(dismiss).first();
    const context = page.context();
    if (!bannerWaited.has(context)) {
      // The first page of a context waits up to 12 seconds for the banner, so that one close keeps it closed for the context.
      bannerWaited.add(context);
      await button.waitFor({ state: "visible", timeout: 12000 }).catch(() => {});
    }
    if (await button.count()) {
      await button.click({ timeout: 2000 });
      await page.waitForTimeout(300);
      return true;
    }
  } catch { /* the banner is not there */ }
  return false;
}

export interface PageFacts { title: string; lang: string | null; text: string; links: string[]; canonical: string | null; alternates: string[]; technologies: string[]; hash: string }

export async function pageFacts(page: Page): Promise<PageFacts> {
  const facts = await page.evaluate(() => {
    const technologies: string[] = [];
    const has = (q: string) => document.querySelector(q) !== null;
    if (has("video")) technologies.push("video");
    if (has("audio")) technologies.push("audio");
    if (has("iframe, object, embed")) technologies.push("iframe");
    if (has("canvas")) technologies.push("canvas");
    if (has("[role=slider], input[type=range]")) technologies.push("slider");
    if (has("[role=application]")) technologies.push("application");
    if (has(".leaflet-container, .mapboxgl-map, .gm-style, iframe[src*='maps.google'], iframe[src*='openstreetmap']")) technologies.push("map");
    if (has("a[href$='.pdf'], a[href*='.pdf?'], a[href$='.docx'], a[href$='.xlsx'], a[href$='.pptx']")) technologies.push("document link");
    if (has("table")) technologies.push("table");
    const link = document.querySelector("link[rel=canonical]") as HTMLLinkElement | null;
    return {
      title: document.title,
      lang: document.documentElement.getAttribute("lang"),
      text: (document.body ? document.body.innerText : "").replace(/\s+/g, " ").trim(),
      // The target of a form counts as a linked page too, for example the search results.
      links: [...Array.from(document.querySelectorAll("a[href]")).map((a) => (a as HTMLAnchorElement).href), ...Array.from(document.querySelectorAll("form[action]")).map((f) => (f as HTMLFormElement).action)],
      canonical: link && link.href ? link.href : null,
      alternates: Array.from(document.querySelectorAll("link[rel=alternate][hreflang]")).map((l) => (l as HTMLLinkElement).href).filter(Boolean),
      technologies,
    };
  });
  return { ...facts, hash: createHash("sha1").update(facts.title + "\n" + facts.text).digest("hex").slice(0, 16) };
}
