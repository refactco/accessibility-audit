// The site tests: all pages together. Same titles (2.4.2), consistent navigation (3.2.3), consistent names (3.2.4),
// consistent help (3.2.6), and pages that no link points to (2.4.5).
import type { Page } from "playwright";
import { HELPERS } from "../browser.ts";
import { toOutcome, type Found } from "./page.ts";
import type { Outcome, PageRecord } from "../types.ts";

export const SITE_TEST_CRITERIA = ["2.4.2", "3.2.3", "3.2.4", "3.2.6", "2.4.5"];

export interface SiteFacts { title: string; nav: string[]; searchButtons: string[]; helpLinks: { text: string; region: string }[]; hasSearch: boolean; hasNav: boolean }

export async function collectSiteFacts(page: Page): Promise<SiteFacts> {
  return await page.evaluate(`(() => {
    ${HELPERS}
    const nav = document.querySelector("nav, [role=navigation]");
    const navTexts = nav ? Array.from(nav.querySelectorAll("a[href]")).filter(visible).map((a) => nameOf(a)).filter(Boolean) : [];
    const searchButtons = Array.from(document.querySelectorAll("form[role=search] button, form[role=search] input[type=submit], [role=search] button")).map((b) => nameOf(b));
    const region = (el) => el.closest("header, [role=banner]") ? "header" : el.closest("footer, [role=contentinfo]") ? "footer" : el.closest("nav, [role=navigation]") ? "nav" : "main";
    const helpLinks = Array.from(document.querySelectorAll("a[href]")).filter(visible).filter((a) => /^(help|contact|contact us|support|faq)$/i.test(nameOf(a))).map((a) => ({ text: nameOf(a).toLowerCase(), region: region(a) }));
    return { title: document.title.trim(), nav: navTexts, searchButtons, helpLinks, hasSearch: !!document.querySelector("form[role=search], input[type=search]"), hasNav: !!nav };
  })()`) as SiteFacts;
}

/** The longest common subsequence of two lists, for the relative order of the navigation. */
function lcs(a: string[], b: string[]): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return dp[a.length][b.length];
}

export function runSiteTests(pages: PageRecord[], facts: Map<string, SiteFacts>, sitemapUrls: string[], width: number): Outcome[] {
  const found: { f: Found; url: string }[] = [];
  const tested = pages.filter((p) => p.tested && facts.has(p.url));
  // 2.4.2: pages with the same title.
  const byTitle = new Map<string, string[]>();
  for (const p of tested) { const t = facts.get(p.url)!.title; byTitle.set(t, [...(byTitle.get(t) || []), p.url]); }
  // The pages of one list with pagination share the title of the list by design, and a copy of a page is the same page.
  const listKey = (u: string) => { const x = new URL(u); x.searchParams.delete("page"); x.searchParams.delete("pg"); x.searchParams.delete("paged"); x.pathname = x.pathname.replace(/\/page\/\d+\/?$/, "/").replace(/\/+$/, "") || "/"; return x.toString(); };
  for (const [title, urls] of byTitle) {
    if (urls.length < 2) continue;
    if (new Set(urls.map(listKey)).size < 2) continue;
    found.push({ url: urls[0], f: { criterion: "2.4.2", rule: "same-title", kind: "cantTell", selector: "head > title", item: "title|" + title, facts: { title, pages: urls.slice(0, 10) },
      summary: `${urls.length} pages have the same title "${title}".`, severity: "serious", question: `Does the title "${title}" describe each of these pages? Pages: ${urls.slice(0, 5).join(", ")}`,
      solution: { summary: "Give each page a title with its own topic first.", steps: ["Put the topic of the page at the start of the title, then the site name."] } } });
  }
  // 3.2.3: the relative order of the navigation.
  const withNav = tested.filter((p) => facts.get(p.url)!.nav.length >= 2);
  if (withNav.length >= 2) {
    const reference = withNav.map((p) => facts.get(p.url)!.nav).sort((a, b) => b.length - a.length)[0];
    for (const p of withNav) {
      const nav = facts.get(p.url)!.nav;
      const common = nav.filter((t) => reference.includes(t));
      if (common.length >= 2 && lcs(common, reference) < common.length) {
        found.push({ url: p.url, f: { criterion: "3.2.3", rule: "navigation-order-differs", kind: "cantTell", selector: "nav", item: "nav|order", facts: { page: nav, reference },
          summary: "The navigation links are in a different relative order on this page.", severity: "serious", question: "Did the user start this change of the navigation order, or is it a different navigation?",
          solution: { summary: "Keep the same relative order of the navigation links on all pages.", steps: ["Use one navigation component for all pages."] } } });
      }
    }
  }
  // 3.2.4: the same function with different names, here the search button.
  const searchNames = new Map<string, string[]>();
  for (const p of tested) for (const n of facts.get(p.url)!.searchButtons) searchNames.set(n, [...(searchNames.get(n) || []), p.url]);
  if (searchNames.size > 1) {
    const [common] = [...searchNames.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    for (const [name, urls] of searchNames) {
      if (name === common) continue;
      found.push({ url: urls[0], f: { criterion: "3.2.4", rule: "inconsistent-control-name", kind: "cantTell", selector: "form[role=search] button", item: "search-button|" + name, facts: { name, common, pages: urls.slice(0, 5) },
        summary: `The search button is named "${name}" on ${urls.length} pages and "${common}" on the others.`, severity: "moderate", question: `Do "${name}" and "${common}" start the same function, so that they need the same name?`,
        solution: { summary: "Use the same name for the same function on all pages.", steps: [`Name the button "${common}" on all pages.`] } } });
    }
  }
  // 3.2.6: the position of the help links.
  const helpPositions = new Map<string, string[]>();
  for (const p of tested) {
    const f = facts.get(p.url)!;
    if (!f.helpLinks.length) continue;
    const key = f.helpLinks.map((h) => h.region + ":" + h.text).join(",");
    helpPositions.set(key, [...(helpPositions.get(key) || []), p.url]);
  }
  if (helpPositions.size > 1) {
    const [common] = [...helpPositions.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    for (const [key, urls] of helpPositions) {
      if (key === common) continue;
      found.push({ url: urls[0], f: { criterion: "3.2.6", rule: "help-position-differs", kind: "cantTell", selector: "a", item: "help|" + key, facts: { here: key, common, pages: urls.slice(0, 5) },
        summary: "The help and contact links are in a different place on this page.", severity: "moderate", question: "Did the user start this change of the help links, or do they belong in the same place as on the other pages?",
        solution: { summary: "Keep the help links in the same relative place on all pages.", steps: ["Put the help and contact links in the header on all pages."] } } });
    }
  }
  // 2.4.5: pages that no link points to.
  // A link from a page to itself, for example a skip link, does not count.
  const linked = new Set<string>();
  for (const p of tested) for (const l of p.links) {
    const target = l.replace(/#.*$/, "").replace(/\/index\.html$/, "/");
    if (target !== p.url) linked.add(target);
  }
  const anyNavOrSearch = tested.some((p) => facts.get(p.url)!.hasNav) && tested.some((p) => facts.get(p.url)!.hasSearch);
  for (const u of sitemapUrls) {
    const norm = u.replace(/#.*$/, "").replace(/\/index\.html$/, "/");
    const page = pages.find((p) => p.url === norm);
    if (!page || !page.tested || linked.has(norm) || norm === pages[0]?.url) continue;
    found.push({ url: norm, f: { criterion: "2.4.5", rule: "page-not-linked", kind: "cantTell", selector: "html", item: "page|not-linked", facts: { url: norm, inSitemap: true, siteHasNavAndSearch: anyNavOrSearch },
      summary: "No link on the crawled pages points to this page. It is in the XML sitemap only.", severity: "moderate",
      question: "Do these pages have a second way to reach them, for example a list page that the crawl did not open, a sitemap page, or a search? The crawl skips list pages beyond the address group limit.",
      solution: { summary: "Link to each page from a list page, the navigation, or the sitemap page.", steps: ["Add a link to the page where it belongs."] } } });
  }
  return found.map(({ f, url }) => toOutcome(f, url, width, []));
}
