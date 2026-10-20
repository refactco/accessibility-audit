// Images of text (1.4.5): the engine finds the images in the content that look like text, from their size, their place, and the
// colors of their pixels, and raises a review question with a screenshot. The AI decides from the picture: a banner, a heading,
// a button, or a quote as an image is an issue; a logo, a brand name, or text inside a photo is essential, and not an issue.
import type { Page } from "playwright";
import { HELPERS } from "../browser.ts";
import type { Outcome } from "../types.ts";
import { toOutcome, type Found } from "./page.ts";

interface ImageCandidate { selector: string; html: string; src: string; alt: string; width: number; height: number; inLink: boolean; nearText: string }

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
    try {
      // A lazy image is a flat placeholder until it loads: scroll it into view, and wait for its pixels.
      const el = page.locator(c.selector).first();
      await el.scrollIntoViewIfNeeded({ timeout: 2000 });
      await page.waitForFunction((sel: string) => { const img = document.querySelector(sel) as HTMLImageElement | null; return !!img && img.complete && img.naturalWidth > 0; }, c.selector, { timeout: 4000 });
      const png = (await el.screenshot({ timeout: 3000, animations: "disabled" })).toString("base64");
      flat = await page.evaluate(FLATNESS(png)) as typeof flat;
    } catch { continue; }
    if (!flat.total || flat.top.length < 2) continue;
    const topShare = flat.top.reduce((n, b) => n + b.share, 0);
    // Text on a flat ground: three colors cover most of the pixels, and the second color is more than a trace. A photo spreads over many colors.
    if (topShare < 0.85 || flat.top[1].share < 0.02) continue;
    const name = c.src.split("?")[0].split("/").pop() || c.src;
    found.push({
      criterion: "1.4.5", rule: "image-of-text", kind: "candidate", selector: c.selector, html: c.html, item: "image|" + name,
      facts: { src: c.src, alt: c.alt, width: c.width, height: c.height, inLink: c.inLink, colors: flat.top, flatShare: Math.round(topShare * 1000) / 1000, nearText: c.nearText },
      summary: "An image in the content looks like text on a flat ground.", severity: "moderate", context: c.nearText || undefined,
      question: `Does this image show text that real text could present? Its text alternative is "${c.alt || ""}".`,
      solution: { summary: "Replace the image of text with real text and styles.", steps: ["Put the text in the page as HTML text.", "Give it the font, the color, and the layout of the image with CSS.", "Keep the image only when it is a logo, or when the look cannot be made with styles."] },
    });
  }
  return found.map((f) => toOutcome(f, url, width, state));
}
