// Links with the same name and different destinations in the same context (2.4.4, ACT rule fd3a94). The context of a link is the
// set of its list items, its paragraph, its table cell, and its aria-describedby targets. Two links share the context when the
// sets are equal, and a link with none of them has the page as its context. The AI decides: different addresses can be the same
// page, and the heading before a link can name its destination (WCAG technique H80).
import type { Page } from "playwright";
import type { Found } from "./page.ts";

/** The names that the generic-link-text question asks about already, for example "Read more". */
const GENERIC = "^(read more|more|click here|here|learn more|link|details|continue|go)\\s*[.›>→]*$";

const SAME_NAME = `(() => {
  const GENERIC = new RegExp(${JSON.stringify(GENERIC)}, "i");
  const hidden = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (n.getAttribute("aria-hidden") === "true" || n.hasAttribute("inert")) return true;
      if (getComputedStyle(n).display === "none") return true;
    }
    return getComputedStyle(el).visibility !== "visible";
  };
  // A short text alternative: aria-labelledby, aria-label, then the content (text, the alt of an image, the title of an svg), then title.
  const sub = (n) => {
    if (n.nodeType === 3) return n.textContent;
    if (n.nodeType !== 1 || n.getAttribute("aria-hidden") === "true" || getComputedStyle(n).display === "none") return "";
    if (n.getAttribute("aria-label")) return " " + n.getAttribute("aria-label") + " ";
    if (n.localName === "img" || n.localName === "area" || (n.localName === "input" && n.type === "image")) return " " + (n.getAttribute("alt") || "") + " ";
    if (n.localName === "svg") { const t = n.querySelector("title"); return t ? " " + t.textContent + " " : ""; }
    const block = /^(block|flex|grid|list-item|table)/.test(getComputedStyle(n).display) ? " " : "";
    return block + Array.from(n.childNodes).map(sub).join("") + block;
  };
  const nameOf = (el) => {
    const ids = (el.getAttribute("aria-labelledby") || "").split(/\\s+/).filter(Boolean);
    let s = ids.length ? ids.map((i) => { const r = document.getElementById(i); return r ? sub(r) : ""; }).join(" ") : "";
    if (!s.trim()) s = el.getAttribute("aria-label") || "";
    if (!s.trim()) s = Array.from(el.childNodes).map(sub).join("");
    if (!s.trim()) s = el.getAttribute("title") || "";
    return s.replace(/\\s+/g, " ").trim();
  };
  const here = location.href.split("#")[0];
  // The destination: the address with no fragment, no www, no trailing slash, no tracking parameters, and the query in order.
  // A fragment counts only on a link to the same page. An empty href, "#", and javascript: have no destination.
  const targetOf = (el) => {
    const raw = el.getAttribute("href");
    if (raw === null) return null;
    if (raw.trim() === "" || raw.trim() === "#" || /^javascript:/i.test(raw.trim())) return "(no destination)";
    let u; try { u = new URL(raw, document.baseURI); } catch { return raw.trim(); }
    if (u.protocol === "mailto:") return "mailto:" + decodeURIComponent(u.pathname).toLowerCase();
    if (u.protocol === "tel:") return "tel:" + u.pathname.replace(/[^0-9+]/g, "");
    const frag = u.hash; u.hash = "";
    for (const k of Array.from(u.searchParams.keys())) if (/^(utm_|gclid$|fbclid$|mc_)/i.test(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    const path = u.pathname.replace(/\\/+$/, "") || "/";
    const base = u.protocol + "//" + u.host.toLowerCase().replace(/^www\\./, "") + path + (u.search || "");
    const same = base === (() => { const h = new URL(here); return h.protocol + "//" + h.host.toLowerCase().replace(/^www\\./, "") + (h.pathname.replace(/\\/+$/, "") || "/") + h.search; })();
    return same && frag && frag !== "#" ? base + frag : base;
  };
  const ids = new Map();
  const idOf = (el) => { if (!ids.has(el)) ids.set(el, ids.size); return ids.get(el); };
  const contextOf = (el) => {
    const set = [], kinds = [];
    for (let n = el.parentElement; n; n = n.parentElement) if (n.localName === "li" || n.getAttribute("role") === "listitem") { set.push("li" + idOf(n)); kinds.push("list item"); }
    const p = el.parentElement && el.parentElement.closest("p");
    if (p) { set.push("p" + idOf(p)); kinds.push("paragraph"); }
    const cell = el.parentElement && el.parentElement.closest("td, th, [role=cell], [role=gridcell]");
    if (cell) { set.push("c" + idOf(cell)); kinds.push("table cell"); }
    for (const i of (el.getAttribute("aria-describedby") || "").split(/\\s+/).filter(Boolean)) { const r = document.getElementById(i); if (r) { set.push("d" + idOf(r)); kinds.push("description"); } }
    const box = set.length ? (p || cell || el.closest("li, [role=listitem]")) : null;
    return { key: set.sort().join(","), kind: kinds[0] || "none", text: box ? (box.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 200) : "" };
  };
  const headingBefore = (el) => {
    let best = null;
    for (const h of document.querySelectorAll("h1, h2, h3, h4, h5, h6, [role=heading]")) {
      if (h.contains(el)) continue;
      if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) best = h; else break;
    }
    return best ? best.innerText.replace(/\\s+/g, " ").trim().slice(0, 100) : null;
  };
  // The kind of the block around a link, for the grouping of the question: the same pattern on many pages is one question.
  const blockKind = (el) => {
    let n = el.parentElement;
    while (n && n !== document.body && !/^(block|flex|grid|list-item|table-cell|flow-root)$/.test(getComputedStyle(n).display)) n = n.parentElement;
    if (!n || n === document.body) return "body";
    const cls = typeof n.className === "string" ? n.className.trim().split(/\\s+/).filter((c) => c && !/\\d{3,}/.test(c)).slice(0, 2).join(".") : "";
    return n.localName + (cls ? "." + cls : "");
  };
  const groups = new Map();
  for (const el of document.querySelectorAll("a[href], area[href], [role=link]")) {
    if (hidden(el)) continue;
    const name = nameOf(el);
    if (!name || GENERIC.test(name)) continue;
    const target = targetOf(el);
    if (target === null) continue;
    const ctx = contextOf(el);
    const key = name.toLowerCase() + "\\u0000" + ctx.key;
    if (!groups.has(key)) groups.set(key, { name, ctx, links: [] });
    groups.get(key).links.push({ el, target, href: el.getAttribute("href"), heading: headingBefore(el), block: blockKind(el), image: !(el.innerText || "").trim() && !!el.querySelector("img, svg") });
  }
  const out = [];
  for (const g of groups.values()) {
    const targets = [...new Set(g.links.map((l) => l.target))];
    if (g.links.length < 2 || targets.length < 2) continue;
    const first = g.links[0].el;
    out.push({ selector: sel(first), html: html(first), name: g.name, contextKind: g.ctx.kind, contextText: g.ctx.text, targets: targets.length, count: g.links.length,
      blocks: [...new Set(g.links.map((l) => l.block))].sort().join("+"),
      links: g.links.slice(0, 6).map((l) => ({ href: l.href, target: l.target, heading: l.heading, image: l.image })) });
  }
  return out;
})()`;

/** The groups of links on the page with the same name and different destinations in one context, as review questions. */
export async function sameNameLinks(page: Page, helpers: string): Promise<Found[]> {
  const groups = await page.evaluate(`(() => { ${helpers} return ${SAME_NAME}; })()`) as { selector: string; html: string; name: string; contextKind: string; contextText: string; targets: number; count: number; blocks: string; links: unknown[] }[];
  return groups.map((g) => {
    const where = g.contextKind === "none" ? "with no paragraph, list item, or table cell around them" : `in the same ${g.contextKind}`;
    return {
      criterion: "2.4.4", rule: "same-name-different-target", kind: "cantTell" as const, selector: g.selector, html: g.html,
      item: `link|same-name|${g.name.toLowerCase()}|${g.contextKind}`, context: `${g.contextKind}|${g.blocks}`,
      facts: { name: g.name, contextKind: g.contextKind, contextText: g.contextText, targets: g.targets, links: g.links },
      summary: `${g.count} links named "${g.name}" go to ${g.targets} different places, ${where}.`, severity: "serious" as const,
      question: `Can a person tell where each link named "${g.name}" goes, from the link text with its sentence, list item, table cell, description, or the heading just before it?`,
      solution: { summary: "Give each link a name that says where it goes, or put each link in its own context.", steps: ["Change the link text so that it names the destination, for example \"Give to the research fund\".", "Or add the destination to the name with visually hidden text or aria-describedby."] },
    };
  });
}
