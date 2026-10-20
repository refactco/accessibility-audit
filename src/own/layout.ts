// Layout tests that need their own render: reflow at 320 px, zoom at 200%, and text spacing.
import type { Browser, Page } from "playwright";
import { HELPERS, openPage } from "../browser.ts";
import type { Config } from "../config.ts";
import { toOutcome, type Found } from "./page.ts";
import type { Outcome } from "../types.ts";

export const LAYOUT_TEST_CRITERIA = ["1.4.4", "1.4.10", "1.4.12"];

/** Finds visible text that a container with hidden overflow cuts. */
const CLIPPED = `(() => {
  ${HELPERS}
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    if (out.length >= 12 || !visible(el)) continue;
    const cs = getComputedStyle(el);
    const clips = ["hidden", "clip"].includes(cs.overflowY) || ["hidden", "clip"].includes(cs.overflowX);
    if (!clips) continue;
    const dy = el.scrollHeight - el.clientHeight, dx = el.scrollWidth - el.clientWidth;
    if (dy < 4 && dx < 4) continue;
    const box = el.getBoundingClientRect();
    if (box.width <= 2 || box.height <= 2 || /rect\\(/.test(cs.clip)) continue; // visually hidden text, by design
    const text = (el.innerText || "").trim();
    if (text.length < 3) continue;
    if (el.closest("[role=tablist], [aria-hidden=true], marquee")) continue;
    out.push({ selector: sel(el), html: html(el), item: item(el), hiddenHeight: dy, hiddenWidth: dx, text: text.slice(0, 120) });
  }
  const doc = document.scrollingElement || document.documentElement;
  return { clipped: out, scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, scrollHeight: doc.scrollHeight };
})()`;

const SPACING_CSS = `* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }`;

export async function runSpacing(page: Page, url: string, width: number, state: string[]): Promise<Outcome[]> {
  const before = await page.evaluate(CLIPPED) as { clipped: { selector: string; hiddenHeight: number; hiddenWidth: number }[] };
  const seen = new Map(before.clipped.map((c) => [c.selector, c.hiddenHeight + c.hiddenWidth]));
  await page.addStyleTag({ content: SPACING_CSS });
  await page.waitForTimeout(150);
  const after = await page.evaluate(CLIPPED) as { clipped: Record<string, any>[] };
  // New cut text, or cut text that grew by more than 8 px with the spacing.
  const found: Found[] = after.clipped.filter((c) => !seen.has(c.selector) || c.hiddenHeight + c.hiddenWidth > (seen.get(c.selector) || 0) + 8).map((c) => ({
    criterion: "1.4.12", rule: "text-cut-with-spacing", kind: "cantTell", selector: c.selector, html: c.html, item: c.item,
    facts: { hiddenHeight: c.hiddenHeight, hiddenWidth: c.hiddenWidth, text: c.text },
    summary: "A container cuts its text when the user applies the text spacing of 1.4.12.", severity: "serious",
    question: "Is the cut text available in another way, for example after an ellipsis or on focus?",
    solution: { summary: "Let the container grow with its text.", steps: ["Remove the fixed height or the hidden overflow of the container."] },
  }));
  return found.map((f) => toOutcome(f, url, width, state));
}

/** Renders the page at 320 CSS px and finds a scroll in two directions. */
export async function runReflow(browser: Browser, config: Config, url: string, contextOptions: Record<string, unknown> = {}): Promise<Outcome[]> {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 }, ...contextOptions });
  try {
    const opened = await openPage(context, url, config);
    if (!opened.ok) return [];
    const d = await opened.page.evaluate(CLIPPED) as { scrollWidth: number; clientWidth: number; clipped: Record<string, any>[] };
    const found: Found[] = [];
    if (d.scrollWidth > d.clientWidth + 8) {
      const wide = await opened.page.evaluate(`(() => { ${HELPERS} const w = document.documentElement.clientWidth; const out = []; for (const el of document.querySelectorAll("body *")) { if (!visible(el)) continue; const r = el.getBoundingClientRect(); if (r.right > w + 8 && r.width > 40 && !Array.from(el.children).some((c) => c.getBoundingClientRect().right > w + 8)) { out.push({ selector: sel(el), html: html(el), item: item(el), width: Math.round(r.width) }); if (out.length >= 5) break; } } return out; })()`) as Record<string, any>[];
      const first = wide[0] || { selector: "html", html: "", item: "html|reflow", width: d.scrollWidth };
      found.push({ criterion: "1.4.10", rule: "no-reflow", kind: "cantTell", selector: first.selector, html: first.html, item: first.item,
        facts: { scrollWidth: d.scrollWidth, viewport: 320, elements: wide.map((w) => w.selector) },
        summary: `At 320 px the page needs a horizontal scroll, ${d.scrollWidth} px wide.`, severity: "serious",
        question: "Is the content that needs two dimensions an exception, for example a map, a data table, or a toolbar?",
        solution: { summary: "Let the content wrap at 320 px.", steps: ["Remove fixed widths and minimum widths larger than 320 px.", "Stack the columns at small widths."] } });
    }
    return found.map((f) => toOutcome(f, url, 320, []));
  } finally {
    await context.close();
  }
}

/** Emulates 200% zoom with half the viewport width and a device scale factor of 2, and finds cut text. */
export async function runZoom(browser: Browser, config: Config, url: string, width: number, contextOptions: Record<string, unknown> = {}): Promise<Outcome[]> {
  const context = await browser.newContext({ viewport: { width: Math.round(width / 2), height: 450 }, deviceScaleFactor: 2, ...contextOptions });
  try {
    const opened = await openPage(context, url, config);
    if (!opened.ok) return [];
    const d = await opened.page.evaluate(CLIPPED) as { clipped: Record<string, any>[] };
    const found: Found[] = d.clipped.map((c) => ({
      criterion: "1.4.4", rule: "text-cut-at-zoom", kind: "cantTell", selector: c.selector, html: c.html, item: c.item,
      facts: { hiddenHeight: c.hiddenHeight, hiddenWidth: c.hiddenWidth, text: c.text, zoom: "200%" },
      summary: "A container cuts its text at 200% zoom.", severity: "serious",
      question: "Is the cut text available in another way at 200% zoom, for example on focus or after activation?",
      solution: { summary: "Let the container grow with its text at 200% zoom.", steps: ["Remove the fixed height or the hidden overflow.", "Use relative units."] },
    }));
    return found.map((f) => toOutcome(f, url, width, []));
  } finally {
    await context.close();
  }
}
