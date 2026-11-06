// Images of text (1.4.5): the engine finds the images in the content that look like text, from their size, their place, and the
// colors of their pixels, and raises a review question with a screenshot. The AI decides from the picture: a banner, a heading,
// a button, or a quote as an image is an issue; a logo, a brand name, or text inside a photo is essential, and not an issue.
// The contrast of the text in an image (1.4.3): the letters of a transparent image over the page. axe-core does not read the pixels
// of an image, so it never measures them. An opaque image is not measured: its letters cannot be told from its ground.
import { createHash } from "node:crypto";
import type { Page } from "playwright";
import { HELPERS } from "../browser.ts";
import type { Outcome } from "../types.ts";
import { toOutcome, type Found } from "./page.ts";

interface ImageCandidate { selector: string; html: string; src: string; alt: string; width: number; height: number; inLink: boolean; nearText: string }

/** The file name in the address of an image, for the item of its question. An image whose address holds the image itself (data:)
 *  gets a short hash of it. The address of a script that sends the image, for example photo.php?id=12, names the image in
 *  its query: the item keeps it, so that the photos of one script do not share one question. Empty when the image has no address. */
export function fileName(src: string): string {
  if (!src) return "";
  if (src.startsWith("data:")) return "data-" + createHash("sha1").update(src).digest("hex").slice(0, 12);
  const [path, query] = src.split(/\?(.*)/s);
  const name = path.split("/").pop() || src;
  return query && !/\.(png|jpe?g|gif|svg|webp|avif|bmp|ico|tiff?)$/i.test(name) ? name + "?" + query.split("#")[0] : name;
}

/** The images in the content: visible, large enough, and outside the header, the navigation, and the footer, where the logos live. */
const FIND_IMAGES = `(() => {
  ${HELPERS}
  const out = [];
  const skipZone = (el) => !!el.closest("header, nav, footer, [role=banner], [role=navigation], [role=contentinfo], [aria-hidden=true]");
  for (const img of document.querySelectorAll("img")) {
    if (out.length >= 6) break;
    if (!visible(img) || skipZone(img)) continue;
    const r = img.getBoundingClientRect();
    if (r.width < 120 || r.height < 24 || r.width > 2400 || r.height > 1600) continue;
    const alt = (img.getAttribute("alt") || "").trim();
    if (/\\blogo\\b/i.test(alt) || /logo/i.test(img.getAttribute("src") || "")) continue;
    const link = img.closest("a[href]");
    const home = link && (link.getAttribute("href") === "/" || link.getAttribute("href") === location.origin + "/");
    if (home) continue;
    const parent = img.closest("figure, p, div, section, li") || img.parentElement;
    const nearText = parent ? (parent.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 200) : "";
    const html = img.outerHTML.length > 300 ? img.outerHTML.slice(0, 300) + "…" : img.outerHTML;
    out.push({ selector: sel(img), html, src: img.currentSrc || img.src || "", alt, width: Math.round(r.width), height: Math.round(r.height), inLink: !!link, nearText });
  }
  return out;
})()`;

/** The share of the pixels in the three largest color bins, and those colors. Text on a flat ground gives a high share. */
const FLATNESS = (png: string) => `(async () => {
  const img = new Image();
  img.src = "data:image/png;base64," + ${JSON.stringify(png)};
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const bins = new Map();
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    total++;
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const bin = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    bin.n++; bin.r += r; bin.g += g; bin.b += b;
    bins.set(key, bin);
  }
  const list = Array.from(bins.values()).sort((a, b) => b.n - a.n).slice(0, 3);
  const c = (bin, v) => Math.round(v / bin.n).toString(16).padStart(2, "0");
  return { total, bins: bins.size, top: list.map((bin) => ({ color: "#" + c(bin, bin.r) + c(bin, bin.g) + c(bin, bin.b), share: Math.round((bin.n / Math.max(1, total)) * 1000) / 1000 })) };
})()`;

/** A review question for each image in the content whose pixels look like text on a flat ground. */
export async function runImageOfTextTest(page: Page, url: string, width: number, state: string[]): Promise<Outcome[]> {
  let candidates: ImageCandidate[] = [];
  try { candidates = await page.evaluate(FIND_IMAGES) as ImageCandidate[]; } catch { return []; }
  const found: Found[] = [];
  for (const c of candidates) {
    let flat: { total: number; bins: number; top: { color: string; share: number }[] };
    let src = "";
    try {
      // A lazy image is a flat placeholder until it loads: scroll it into view, and wait for its pixels.
      const el = page.locator(c.selector).first();
      await el.scrollIntoViewIfNeeded({ timeout: 2000 });
      await page.waitForFunction((sel: string) => { const img = document.querySelector(sel) as HTMLImageElement | null; return !!img && img.complete && img.naturalWidth > 0; }, c.selector, { timeout: 4000 });
      // The address of the image after its load. Before its load a lazy image has no address, or the address of a placeholder, and
      // an image with a srcset has the address of its src. Before 1.3.4 the item used the address before the load: the images that
      // had not loaded yet shared the item "image|" and one question, and the item of an image changed with the timing of the load.
      const loaded = await el.evaluate((img) => (img as HTMLImageElement).currentSrc || (img as HTMLImageElement).src || "").catch(() => "");
      src = loaded || (c.src.startsWith("data:") ? "" : c.src);
      const png = (await el.screenshot({ timeout: 3000, animations: "disabled" })).toString("base64");
      flat = await page.evaluate(FLATNESS(png)) as typeof flat;
    } catch { continue; }
    if (!flat.total || flat.top.length < 2) continue;
    const topShare = flat.top.reduce((n, b) => n + b.share, 0);
    // Text on a flat ground: three colors cover most of the pixels, and the second color is more than a trace. A photo spreads over many colors.
    if (topShare < 0.85 || flat.top[1].share < 0.02) continue;
    const name = fileName(src);
    if (!name) continue;
    found.push({
      criterion: "1.4.5", rule: "image-of-text", kind: "candidate", selector: c.selector, html: c.html, item: "image|" + name,
      facts: { src, alt: c.alt, width: c.width, height: c.height, inLink: c.inLink, colors: flat.top, flatShare: Math.round(topShare * 1000) / 1000, nearText: c.nearText },
      summary: "An image in the content looks like text on a flat ground.", severity: "moderate", context: c.nearText || undefined,
      question: `Does this image show text that real text could present? Its text alternative is "${c.alt || ""}".`,
      solution: { summary: "Replace the image of text with real text and styles.", steps: ["Put the text in the page as HTML text.", "Give it the font, the color, and the layout of the image with CSS.", "Keep the image only when it is a logo, or when the look cannot be made with styles."] },
    });
  }
  return found.map((f) => toOutcome(f, url, width, state));
}

interface TextContrast { textColor: string; main: number; worst: number; best: number; passShare: number; passShareLarge: number; background: { color: string; share: number }[]; glyphHeight: number | null; colors?: { textColor: string; main: number; passShare: number }[] }

/** A review question on the contrast of the text in an image. The AI confirms that the image shows text and checks its size:
 *  large text needs 3 to 1, and a logo needs no contrast. */
function imageContrastQuestion(c: { selector: string; html: string; src: string; alt: string; width: number; height: number }, name: string, m: TextContrast): Found {
  return {
    criterion: "1.4.3", rule: "image-text-contrast", kind: "cantTell", selector: c.selector, html: c.html, item: "image|text-contrast|" + name,
    facts: { src: c.src, alt: c.alt, width: c.width, height: c.height, textColor: m.textColor, glyphHeight: m.glyphHeight, ...(m.colors && m.colors.length > 1 ? { textColors: m.colors } : {}), measured: { main: m.main, worst: m.worst, best: m.best, required: 4.5, passShare: m.passShare, passShareLarge: m.passShareLarge, background: m.background } },
    summary: `The text in the image "${c.alt || name}" has a contrast of about ${m.main}:1 with the colors under it.`, severity: "serious",
    question: `Does the image "${c.alt || name}" show text, other than a logo or a brand name? The engine measured its letters in ${m.textColor} against the colors under them: ${m.main}:1 for most of the letters, ${m.worst}:1 at the worst places, and ${Math.round(m.passShare * 100)}% of the letters pass 4.5:1. Is the text readable: at least 4.5:1, or 3:1 for large text?`,
    solution: { summary: "Give the text of the image enough contrast with its background, or use real text.", steps: ["Change the color of the text or of the background in the image, or add a solid band behind the text.", "Better: put the text in the page as HTML text, and check its contrast."] },
  };
}

/** The images with alpha that can show letters over the page: visible, with a text alternative, not a logo or an icon, at most 8.
 *  The images of the skip list were measured before on this page. */
const FIND_TEXT_IMAGES = (skip: string[]) => `(() => {
  ${HELPERS}
  const skip = new Set(${JSON.stringify(skip)});
  const out = [];
  for (const img of document.querySelectorAll("img")) {
    if (out.length >= 8) break;
    if (!visible(img) || !img.complete || !img.naturalWidth || img.closest("[aria-hidden=true]")) continue;
    const src = img.currentSrc || img.src || "";
    if (skip.has(src)) continue;
    if (!/\\.(png|gif|webp|svg)(\\?|#|$)|^data:image\\/(png|gif|webp|svg)/i.test(src)) continue;
    const alt = (img.getAttribute("alt") || "").trim();
    if (!alt || /\\b(logo|icon)\\b/i.test(alt) || /logo|icon/i.test(src.slice(0, 300))) continue;
    const r = img.getBoundingClientRect();
    if (r.width < 40 || r.height < 16 || r.width > 2400 || r.height > 1600) continue;
    const html = img.outerHTML.length > 300 ? img.outerHTML.slice(0, 300) + "…" : img.outerHTML;
    out.push({ selector: sel(img), html, src, alt, width: Math.round(r.width), height: Math.round(r.height) });
  }
  return out;
})()`;

/** The letters of a transparent image: the pixels that change when the image is hidden. The second screenshot gives the color
 *  under each letter. The text color is the main color of the pixels that change most. */
const LETTERS = (shown: string, hidden: string) => `(async () => {
  const load = async (b64) => { const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode(); const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight; const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0); return { w: c.width, h: c.height, d: ctx.getImageData(0, 0, c.width, c.height).data }; };
  const a = await load(${JSON.stringify(shown)}), b = await load(${JSON.stringify(hidden)});
  if (a.w !== b.w || a.h !== b.h) return null;
  const total = a.w * a.h, changed = [];
  let top = a.h, bottom = -1;
  for (let p = 0; p < total; p++) {
    const i = p * 4, d = Math.abs(a.d[i] - b.d[i]) + Math.abs(a.d[i + 1] - b.d[i + 1]) + Math.abs(a.d[i + 2] - b.d[i + 2]);
    if (d > 24) { changed.push([p, d]); const y = Math.floor(p / a.w); if (y < top) top = y; if (y > bottom) bottom = y; }
  }
  const share = changed.length / total;
  // An opaque image changes all its pixels: its letters cannot be told from its ground here. A trace is not text.
  if (share < 0.01 || share > 0.85) return { skip: true, share };
  const bin = (d, i, key) => { const k = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4); const x = key.get(k) || { n: 0, r: 0, g: 0, b: 0 }; x.n++; x.r += d[i]; x.g += d[i + 1]; x.b += d[i + 2]; key.set(k, x); };
  const hex = (x) => "#" + [x.r, x.g, x.b].map((v) => Math.round(v / x.n).toString(16).padStart(2, "0")).join("");
  // The solid letter pixels: the inside of the strokes, where the four neighbors changed too. The smooth edges of the letters are
  // blends with the ground, and small text has more edge pixels than solid ones, so the edges do not count. Very thin letters
  // have no inside: then the pixels that differ most from the ground stand for them.
  const mask = new Uint8Array(total);
  for (const [p] of changed) mask[p] = 1;
  let solid = changed.filter(([p]) => { const x = p % a.w; return x > 0 && x < a.w - 1 && p >= a.w && p < total - a.w && mask[p - 1] && mask[p + 1] && mask[p - a.w] && mask[p + a.w]; });
  if (solid.length < Math.max(20, changed.length * 0.05)) {
    const ds = changed.map((x) => x[1]).sort((x, y) => x - y);
    const ref = ds[Math.min(ds.length - 1, Math.floor(ds.length * 0.95))];
    solid = changed.filter((x) => x[1] >= ref * 0.5);
  }
  // The text colors: the main colors of the solid pixels, each with at least a tenth of them, at most 3. An image can have a title
  // in one color and a year in another.
  const fgBins = new Map(); for (const [p] of solid) bin(a.d, p * 4, fgBins);
  const colors = [...fgBins.values()].sort((x, y) => y.n - x.n).filter((x, i) => i === 0 || x.n >= solid.length * 0.1).slice(0, 3).map((x) => ({ x, r: x.r / x.n, g: x.g / x.n, b: x.b / x.n }));
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (r, g, bl) => 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl);
  // Each solid pixel belongs to the nearest text color, and is measured against the color under it.
  const groups = colors.map((c) => ({ c, lf: lum(c.r, c.g, c.b), ratios: [], bgBins: new Map() }));
  for (const [p] of solid) {
    const i = p * 4;
    let best = groups[0], dist = Infinity;
    for (const g of groups) { const d = Math.abs(a.d[i] - g.c.r) + Math.abs(a.d[i + 1] - g.c.g) + Math.abs(a.d[i + 2] - g.c.b); if (d < dist) { dist = d; best = g; } }
    const lb = lum(b.d[i], b.d[i + 1], b.d[i + 2]);
    best.ratios.push((Math.max(best.lf, lb) + 0.05) / (Math.min(best.lf, lb) + 0.05));
    bin(b.d, i, best.bgBins);
  }
  const results = groups.filter((g) => g.ratios.length >= Math.max(1, solid.length * 0.1)).map((g) => {
    const ratios = g.ratios.sort((x, y) => x - y);
    const at = (q) => Math.round(ratios[Math.min(ratios.length - 1, Math.floor(ratios.length * q))] * 100) / 100;
    const background = [...g.bgBins.values()].sort((x, y) => y.n - x.n).slice(0, 4).map((x) => ({ color: hex(x), share: Math.round((x.n / ratios.length) * 1000) / 1000 }));
    return { textColor: hex(g.c.x), main: at(0.5), worst: at(0.1), best: at(0.9), passShare: Math.round((ratios.filter((r) => r >= 4.5).length / ratios.length) * 1000) / 1000, passShareLarge: Math.round((ratios.filter((r) => r >= 3).length / ratios.length) * 1000) / 1000, background };
  }).sort((x, y) => x.passShare - y.passShare || x.main - y.main);
  if (!results.length) return { skip: true, share };
  // The text color that passes least decides. The others stay in the facts.
  return { share, ...results[0], colors: results.map((r) => ({ textColor: r.textColor, main: r.main, passShare: r.passShare })), glyphHeight: bottom - top + 1 };
})()`;

const HIDE_IMAGE = (selector: string, on: boolean) => `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; if (${on}) el.style.setProperty("opacity", "0", "important"); else el.style.removeProperty("opacity"); return true; })()`;

/** A review question for each transparent image whose letters fail 4.5 to 1 against the page under them. The audit runs it right
 *  after the load, and again after the other tests: a slideshow shows other images later. `measured` holds the images that a run
 *  measured on the page, so the second run measures only the new ones. */
export async function runImageTextContrastTest(page: Page, url: string, width: number, state: string[], measured: Set<string> = new Set()): Promise<Outcome[]> {
  let candidates: { selector: string; html: string; src: string; alt: string; width: number; height: number }[] = [];
  try { candidates = await page.evaluate(FIND_TEXT_IMAGES([...measured])) as typeof candidates; } catch { return []; }
  for (const c of candidates) measured.add(c.src);
  const found: Found[] = [];
  for (const c of candidates) {
    let m = null as (TextContrast & { skip?: boolean; share: number }) | null;
    try {
      const el = page.locator(c.selector).first();
      await el.scrollIntoViewIfNeeded({ timeout: 2000 });
      const box = await el.boundingBox({ timeout: 1500 });
      const size = page.viewportSize() || { width: 1280, height: 900 };
      if (!box) continue;
      const x = Math.max(0, box.x), y = Math.max(0, box.y);
      const clip = { x, y, width: Math.min(size.width - x, box.width - (x - box.x)), height: Math.min(size.height - y, box.height - (y - box.y)) };
      if (clip.width < 8 || clip.height < 8) continue;
      // A slideshow can change the ground between two screenshots. The screenshot with the image comes before and after the one
      // without it, and the measure runs only when those two are the same. Three tries, then the image is skipped.
      let pair: { shown: Buffer; hidden: Buffer } | null = null;
      for (let attempt = 0; attempt < 3 && !pair; attempt++) {
        if (attempt) await page.waitForTimeout(700);
        const before = await page.screenshot({ clip, timeout: 3000, animations: "disabled" });
        await page.evaluate(HIDE_IMAGE(c.selector, true));
        let hidden: Buffer;
        try { hidden = await page.screenshot({ clip, timeout: 3000, animations: "disabled" }); }
        finally { await page.evaluate(HIDE_IMAGE(c.selector, false)).catch(() => {}); }
        const after = await page.screenshot({ clip, timeout: 3000, animations: "disabled" });
        if (before.equals(after)) pair = { shown: before, hidden };
      }
      if (!pair || pair.shown.equals(pair.hidden)) continue;
      m = await page.evaluate(LETTERS(pair.shown.toString("base64"), pair.hidden.toString("base64"))) as typeof m;
    } catch { continue; }
    if (!m || m.skip) continue;
    // A clear pass: the letters pass 4.5 to 1, or they are large and pass 3 to 1.
    if (m.passShare >= 0.9 || (m.glyphHeight !== null && m.glyphHeight >= 32 && m.passShareLarge >= 0.9)) continue;
    const name = c.src.startsWith("data:") ? "inline image " + c.alt.toLowerCase().slice(0, 40) : c.src.split("?")[0].split("/").pop() || c.src;
    found.push(imageContrastQuestion(c, name, m));
  }
  return found.map((f) => toOutcome(f, url, width, state));
}
