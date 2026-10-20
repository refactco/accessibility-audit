// The contrast measurement for the texts that axe-core could not decide: the engine reads the pixels of its own screenshot.
// axe-core gives up on a background image, an overlap, or a child image. The measurement samples the colors around the text
// and compares the text color with the common background colors. A clear pass drops the question, a clear fail becomes an occurrence,
// and a mixed background keeps the question with the measured numbers.
import type { Page } from "playwright";
import type { Outcome } from "../types.ts";

function lum(hex: string): number | null {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  if (!m) return null;
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(parseInt(m[1], 16)) + 0.7152 * f(parseInt(m[2], 16)) + 0.0722 * f(parseInt(m[3], 16));
}

export function contrastRatio(a: string, b: string): number | null {
  const la = lum(a), lb = lum(b);
  if (la === null || lb === null) return null;
  return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 100) / 100;
}

/** Reads the pixels of a PNG in the page, in a canvas, and gives the colors of the box by their share. The screenshot was taken
 *  with the text made transparent, so the pixels are the real background under the text: a band, an image, or a gradient. */
const READ_PIXELS = (png: string) => `(async () => {
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
    const r = data[i], g = data[i + 1], b = data[i + 2];
    total++;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bin = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    bin.n++; bin.r += r; bin.g += g; bin.b += b;
    bins.set(key, bin);
  }
  const list = Array.from(bins.values()).sort((a, b) => b.n - a.n);
  const out = [];
  let covered = 0;
  for (const bin of list) {
    if (covered >= total * 0.9) break;
    covered += bin.n;
    const c = (v) => Math.round(v / bin.n).toString(16).padStart(2, "0");
    out.push({ color: "#" + c(bin.r) + c(bin.g) + c(bin.b), share: Math.round((bin.n / total) * 1000) / 1000 });
  }
  return { width: canvas.width, height: canvas.height, background: out };
})()`;

/** The text color of an element as r, g, b in 0 to 255 and a in 0 to 1: a canvas paints the color and gives the pixel, for every color form of the browser. */
const TEXT_COLOR = (selector: string) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return null;
  const canvas = document.createElement("canvas"); canvas.width = 1; canvas.height = 1;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = getComputedStyle(el).color;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return { r: d[0], g: d[1], b: d[2], a: Math.round((d[3] / 255) * 100) / 100 };
})()`;

const HIDE_TEXT = (selector: string, on: boolean) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return false;
  let style = document.getElementById("a11y-hide-text");
  if (!style) { style = document.createElement("style"); style.id = "a11y-hide-text"; style.textContent = "[data-a11y-hide-text], [data-a11y-hide-text] * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; }"; document.head.appendChild(style); }
  if (${on}) el.setAttribute("data-a11y-hide-text", "1"); else el.removeAttribute("data-a11y-hide-text");
  return true;
})()`;

export interface Measured { worst: number; best: number; main: number; required: number; passShare: number; covered?: boolean; colors: { color: string; share: number }[] }

/** True when another element covers the center of the element, for example an open menu panel over the page. */
const COVERED = (selector: string) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return true;
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(Math.min(innerWidth - 1, r.left + r.width / 2), Math.min(innerHeight - 1, r.top + r.height / 2));
  return !!hit && hit !== el && !el.contains(hit) && !hit.contains(el);
})()`;

/** Measures the contrast of the text of an outcome against the colors around it. Returns null when the measurement is not possible. */
export async function measureContrast(page: Page, o: Outcome): Promise<Measured | null> {
  // A background image or a canvas far down the page paints a moment after the scroll. A fail gets a second measurement.
  const first = await measureOnce(page, o, 150);
  if (!first || first.covered || first.main >= first.required) return first;
  const second = await measureOnce(page, o, 500);
  return second && second.main > first.main ? second : first;
}

async function measureOnce(page: Page, o: Outcome, settle: number): Promise<Measured | null> {
  const colors = o.facts?.colors as { fg?: string; expected?: string } | undefined;
  const required = parseFloat(String(colors?.expected || "4.5")) || 4.5;
  try {
    const loc = page.locator(o.selector).first();
    await loc.scrollIntoViewIfNeeded({ timeout: 1500 });
    await page.waitForTimeout(settle);
    if (await page.evaluate(COVERED(o.selector))) return { worst: 0, best: 0, main: 0, required, passShare: 0, covered: true, colors: [] };
    const style = await page.evaluate(TEXT_COLOR(o.selector)) as { r: number; g: number; b: number; a: number } | null;
    if (!style) return null;
    const box = await loc.boundingBox({ timeout: 1500 });
    const size = page.viewportSize() || { width: 1280, height: 900 };
    if (!box || box.width < 3 || box.height < 3) return null;
    const x = Math.max(0, box.x + 1), y = Math.max(0, box.y + 1);
    const clip = { x, y, width: Math.min(size.width - x, box.width - 2), height: Math.min(size.height - y, box.height - 2) };
    if (clip.width < 2 || clip.height < 2) return null;
    // The screenshot of the box with the text made transparent gives the background under the text.
    await page.evaluate(HIDE_TEXT(o.selector, true));
    let png: string;
    try { png = (await page.screenshot({ clip, timeout: 3000, animations: "disabled" })).toString("base64"); }
    finally { await page.evaluate(HIDE_TEXT(o.selector, false)).catch(() => {}); }
    const r = await page.evaluate(READ_PIXELS(png)) as { background: { color: string; share: number }[] };
    if (!r.background.length) return null;
    const hex = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
    // A transparent text blends with each background color.
    const blend = (bg: string) => { const m = bg.replace("#", "").match(/../g)!.map((v) => parseInt(v, 16)); return "#" + hex(style.r * style.a + m[0] * (1 - style.a)) + hex(style.g * style.a + m[1] * (1 - style.a)) + hex(style.b * style.a + m[2] * (1 - style.a)); };
    const ratios = r.background.map((b) => ({ ...b, ratio: contrastRatio(blend(b.color), b.color) || 0 }));
    const passShare = Math.round(ratios.filter((b) => b.ratio >= required).reduce((n, b) => n + b.share, 0) * 1000) / 1000;
    return { worst: Math.min(...ratios.map((b) => b.ratio)), best: Math.max(...ratios.map((b) => b.ratio)), main: ratios[0].ratio, required, passShare, colors: ratios.map((b) => ({ color: b.color, share: b.share })) };
  } catch {
    return null;
  }
}

/** Applies the measurement to the contrast questions of axe-core: a clear pass is dropped, a clear fail becomes an occurrence, the rest keeps the question with the numbers. */
export async function decideContrastQuestions(page: Page, outcomes: Outcome[]): Promise<Outcome[]> {
  const out: Outcome[] = [];
  const seen = new Map<string, "pass" | "fail" | "keep">();
  for (const o of outcomes) {
    if (o.rule !== "color-contrast" || o.kind !== "cantTell") { out.push(o); continue; }
    const m = await measureContrast(page, o);
    if (!m) { out.push(o); continue; }
    // A text behind another element, for example under an open menu panel, is not visible in this state.
    if (m.covered) continue;
    const facts = { ...(o.facts || {}), measured: { worst: m.worst, main: m.main, best: m.best, required: m.required, passShare: m.passShare, background: m.colors.slice(0, 4) } };
    if (m.worst >= m.required) { seen.set(o.selector, "pass"); continue; }
    // A clear fail: the main background fails, and less than a quarter of the background passes.
    if (m.main < m.required && m.passShare < 0.25) {
      out.push({ ...o, kind: "failed", decider: undefined, question: undefined, facts, summary: `The text has a contrast of ${m.main}:1 with its background in the screenshot, under ${m.required}:1.`, severity: "serious" });
      continue;
    }
    out.push({ ...o, facts, question: `${o.summary}. The engine measured the contrast against the colors under the text: the main background gives ${m.main}:1, the worst ${m.worst}:1, the best ${m.best}:1, and ${Math.round(m.passShare * 100)}% of the background passes the ${m.required}:1 of the rule. Is the text readable on all parts of its background?` });
  }
  return out;
}
