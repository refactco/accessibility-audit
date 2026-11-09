// Parts of an id or a name that a site makes new on each render, for example slider-4823019576 or heading-1-1-qtw3vXnaPK.
// The identity of an element, its selector, and the hash of a question leave them out. So a new render of the page gives the
// same issue, finds the control of a state again, and keeps the answer of a question.

/** Replaces each part of an id or a name that looks made at random with "*". A part is the text between the separators - _ : .
 *  A part looks random when it has 5 or more digits in a row, when letters and digits alternate in 6 or more characters
 *  (qtw3vXnaPK), when it is a hex string of 8 or more characters, or when it mixes upper and lower case in 6 or more characters
 *  after the first part (heading-1-1-QtwvXnaPKs). The function has no outside references: the in-page helpers use its source. */
export function unrandom(value: string): string {
  let index = 0;
  return String(value).split(/([-_:.\s]+)/).map((p) => {
    if (p === "" || /^[-_:.\s]+$/.test(p)) return p;
    const first = index++ === 0;
    const random = /\d{5,}/.test(p)
      || (p.length >= 6 && /[a-z]\d+[a-z]|\d[a-z]+\d/i.test(p))
      || (p.length >= 8 && /^[0-9a-f]+$/i.test(p) && /\d/.test(p) && /[a-f]/i.test(p))
      || (!first && p.length >= 6 && /[a-z]/.test(p) && /[A-Z]/.test(p));
    return random ? "*" : p;
  }).join("");
}

/** The attributes whose values are ids or names, in the HTML of an outcome. */
const ID_ATTRIBUTES = /\s(id|name|for|aria-controls|aria-labelledby|aria-describedby|aria-owns|aria-activedescendant|aria-details|aria-errormessage)="([^"]*)"/g;

/** The classes that a lazy-load script sets for the state of an image: they change with the cache and the timing of a render, so the
 *  identity of an element and the hash of a question leave them out. For example lazysizes adds ls-is-cached when the image is in
 *  the cache of the browser. The pattern has no backslash: the in-page helpers use its source. */
export const LAZY_CLASS = /^(lazy|lazyload|lazyloaded|lazyloading|lazy-loaded|lazy-hidden|ls-is-cached|rocket-lazyload|jetpack-lazy-image|jetpack-lazy-image--handled|b-lazy|b-loaded)$/;

/** The HTML of an outcome with the random parts of its ids and names left out, as 1.3.0 and 1.3.1 made it. Only for the old hashes. */
export function stableIdsHtml(html: string): string {
  return html.replace(ID_ATTRIBUTES, (_m, attr: string, value: string) => ` ${attr}="${value.split(/\s+/).map(unrandom).join(" ")}"`);
}

/** A class value with one class removed, with one space next to it, as the value was before a script added it: lazysizes makes
 *  " lazyloaded" from an empty value, and " ls-is-cached lazyloaded" when the image is in the cache. */
function removeClass(value: string, name: string): string {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value.replace(new RegExp(`^${esc}(\\s+|$)`), "").replace(new RegExp(`\\s${esc}(?=\\s|$)`, "g"), "");
}

/** The HTML of an outcome with the random parts of its ids and names and the classes of a lazy load left out, for the hash of a question.
 *  A class value with no such class stays as it is, with its spaces, so that its hash is the same as in 1.3.1. */
export function stableHtml(html: string): string {
  return stableIdsHtml(html).replace(/\sclass="([^"]*)"/g, (m, value: string) => {
    const lazy = value.split(/\s+/).filter((c) => LAZY_CLASS.test(c));
    return lazy.length ? ` class="${lazy.reduce(removeClass, value)}"` : m;
  });
}

/** The HTML with one class removed from each class attribute, as the value was before a script added the class. */
export function withoutClass(html: string, name: string): string {
  return html.replace(/\sclass="([^"]*)"/g, (_m, value: string) => ` class="${removeClass(value, name)}"`);
}

/** The classes of the first tag of an HTML, as the class attribute lists them. */
function classesOf(html: string): string[] {
  const tag = html.match(/^<[^>]*>/)?.[0] || "";
  return ((tag.match(/\sclass="([^"]*)"/) || [, ""])[1] as string).split(/\s+/).filter(Boolean);
}

/** The last part of an address in an item: the last part of the path, with the query. Since 1.3.5 the fragment of a src is not part
 *  of it: the script of an embed can add one with the times of the load, for example #{"os":487.3}, and the item changed in each run. */
export function addressTail(attr: string, value: string): string {
  return (attr === "src" ? value.split("#")[0] : value).split("/").pop() || "";
}

/** The text of an HTML as the browser shows it, with the 4 entities of a serialized text node and the numbered ones. */
function textOf(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&(amp|lt|gt|nbsp|quot|#39|#(\d+)|#x([0-9a-f]+));/gi, (_m, name: string, dec?: string, hex?: string) =>
    dec ? String.fromCodePoint(Number(dec)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : ({ amp: "&", lt: "<", gt: ">", nbsp: " ", quot: '"', "#39": "'" } as Record<string, string>)[name.toLowerCase()]);
}

/** The placeholder of a select: the text of its first option when that option has no value, for example "Select Week". Null for
 *  another element, or for a select whose first option has a value. Since 1.3.7. */
export function placeholderOf(html: string): string | null {
  const m = html.match(/^<select\b[^>]*>\s*<option\b([^>]*)>([^<]*)/i);
  if (!m || !/\svalue=(""|'')/.test(m[1])) return null;
  return textOf(m[2]).replace(/\s+/g, " ").trim().slice(0, 40);
}

/** The HTML of a select for the hash of a question: its tag and its placeholder, without the other options. The options are content
 *  of the site, for example the weeks of an archive, and the answer to a question about the select does not depend on them. Since 1.3.7. */
export function selectHtml(html: string): string {
  const open = html.match(/^<select\b[^>]*>/i)?.[0];
  if (!open) return html;
  const first = placeholderOf(html) === null ? "" : html.slice(open.length).match(/^\s*<option\b[^>]*>[^<]*(<\/option>)?/i)?.[0].trim() || "";
  return open + first;
}

/** The items that older versions gave for the same element. 1.3.1 and older, for an element with the classes of a lazy load: the first
 *  three classes as they were, the same without ls-is-cached, the class that changes with the cache, and the same with ls-is-cached
 *  before lazyloaded. 1.3.4 and older, for an element whose src has a fragment: the item with the fragment. Empty for other elements. */
export function legacyItems(item: string, html: string): string[] {
  const out = new Set<string>();
  // The items of 1.3.6 and older versions gave a select the text of all its options. Since 1.3.7 a select with a placeholder has the
  // text of the placeholder, so that a new option, for example a new week in an archive, does not give a new item. The old text comes
  // from the HTML, as the browser showed it.
  const placeholder = placeholderOf(html);
  const parts = item.split("|");
  if (placeholder !== null && parts.length >= 3 && parts[2] === placeholder) {
    const before = textOf(html).replace(/\s+/g, " ").trim().slice(0, 40);
    if (before !== placeholder) out.add([parts[0], parts[1], before, ...parts.slice(3)].join("|"));
  }
  // The items of 1.3.4 and older versions kept the fragment of the address of a src. A fragment that does not change, for example
  // #page=2 of a document, gives the old item again, so its question and its issue continue.
  const src = (html.match(/^<[^>]*?\ssrc="([^"]*)"/) || [])[1];
  if (src && src.includes("#")) for (const value of new Set([src, src.replace(/&amp;/g, "&")])) {
    const now = addressTail("src", value), before = value.split("/").pop() || "";
    if (before !== now && item.includes("|" + now + "|")) out.add(item.replace("|" + now + "|", () => "|" + before + "|"));
  }
  const raw = classesOf(html);
  const bar = item.indexOf("|");
  if (!raw.some((c) => LAZY_CLASS.test(c)) || bar < 0) { out.delete(item); return [...out]; }
  const head = item.slice(0, bar);
  const now = raw.filter((c) => !LAZY_CLASS.test(c)).slice(0, 3).join(".");
  if (now && !head.endsWith("." + now)) { out.delete(item); return [...out]; }
  const base = now ? head.slice(0, head.length - now.length - 1) : head;
  const lists = [raw, raw.filter((c) => c !== "ls-is-cached")];
  // The same image with ls-is-cached, when it was in the cache of the browser in the old run and not in this one.
  const at = raw.indexOf("lazyloaded");
  if (at >= 0 && !raw.includes("ls-is-cached")) lists.push([...raw.slice(0, at), "ls-is-cached", ...raw.slice(at)]);
  for (const list of lists) {
    const cls = list.slice(0, 3).join(".");
    out.add(base + (cls ? "." + cls : "") + item.slice(bar));
  }
  out.delete(item);
  return [...out];
}

/** A selector with the random parts of its ids left out, for an identity. */
export function stableSelector(selector: string): string {
  return selector.replace(/#((?:\\.|[A-Za-z0-9_-])+)/g, (m, id: string) => { const plain = id.replace(/\\(.)/g, "$1"); const s = unrandom(plain); return s === plain ? m : "#" + s; });
}
