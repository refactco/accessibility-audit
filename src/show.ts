// A layout finding under the conditions of its test, for the review page: the text spacing of 1.4.12, the zoom of 200% of 1.4.4,
// and the width of 320 px of 1.4.10. A person who opens the page in a normal window does not see these findings, so a person could
// answer "no issue" to a real issue. The steps say how to see the finding by hand, and showLayout opens the page with the conditions
// of the test and takes the screenshots, before and after. It writes no file. Since 1.3.10.
import type { Browser } from "playwright";
import { launch, openPage } from "./browser.ts";
import type { Config } from "./config.ts";
import { SPACING_CSS } from "./own/layout.ts";

export const SHOW_RULES = new Set(["text-cut-with-spacing", "text-cut-at-zoom", "no-reflow"]);

const list = (xs: (string | number)[]) => xs.length > 1 ? xs.slice(0, -1).join(", ") + " or " + xs[xs.length - 1] : String(xs[0] ?? "");

/** The steps that let a person see a layout finding by hand. widths: the widths of the finding, or else the widths of the audit. */
export function howToSee(rule: string, widths: number[], auditWidths: number[]): { steps: string[]; code?: string } | null {
  const largest = Math.max(...(auditWidths.length ? auditWidths : [1280]));
  if (rule === "text-cut-with-spacing") return {
    steps: [
      `Make the browser window ${list(widths.length ? widths : auditWidths)} px wide, and open the page.`,
      "Apply the text spacing of WCAG 1.4.12: a line height of 1.5 times the font size, a letter spacing of 0.12 times, a word spacing of 0.16 times, and a space after each paragraph of 2 times. To do this, add the CSS below in the developer tools of the browser, or use a text spacing bookmarklet.",
      "Look at the element of the question: is part of its text cut off or hidden? Only then, answer.",
    ],
    code: SPACING_CSS,
  };
  if (rule === "text-cut-at-zoom") return {
    steps: [
      `Make the browser window ${largest} px wide, and open the page.`,
      "Zoom the browser to 200%, for example with Ctrl or Command and the plus key.",
      "Look at the element of the question: is part of its text cut off or hidden? Only then, answer.",
    ],
  };
  if (rule === "no-reflow") return {
    steps: [
      `Make the browser window 320 px wide, or make it ${largest} px wide and zoom to 400%, and open the page.`,
      "Look for a horizontal scroll bar: must you scroll in two directions to read the content?",
      "Content that needs two dimensions is an exception, for example a map, a data table, or a toolbar.",
    ],
  };
  return null;
}

export interface ShowView { label: string; width: number; found: boolean; cutBefore?: number; cutAfter?: number; before?: string; after?: string; note?: string }
export interface ShowResult { rule: string; url: string; views: ShowView[]; summary: string }

/** Finds the element of the finding: its selector, or else the smallest container with hidden overflow that holds its text. Marks it
 *  with an outline, which does not change the layout, and gives the hidden part of its content. */
const FIND = (selector: string, text: string) => `(() => {
  const want = ${JSON.stringify(text)}.replace(/\\s+/g, " ").trim();
  const norm = (e) => (e.innerText || "").replace(/\\s+/g, " ").trim();
  let el = null;
  try { el = document.querySelector(${JSON.stringify(selector)}); } catch (e) { el = null; }
  if (el && want && !norm(el).includes(want)) el = null;
  if (!el && want) {
    let area = Infinity;
    for (const e of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(e);
      if (!["hidden", "clip"].includes(cs.overflowX) && !["hidden", "clip"].includes(cs.overflowY)) continue;
      if (!norm(e).includes(want)) continue;
      const r = e.getBoundingClientRect(), a = r.width * r.height;
      if (a > 0 && a < area) { el = e; area = a; }
    }
  }
  document.querySelectorAll("[data-a11y-show]").forEach((e) => e.removeAttribute("data-a11y-show"));
  if (!el) return null;
  el.setAttribute("data-a11y-show", "");
  if (!document.getElementById("a11y-show-style")) {
    const s = document.createElement("style"); s.id = "a11y-show-style";
    s.textContent = "[data-a11y-show] { outline: 3px solid #d0021b !important; outline-offset: 2px !important; }";
    document.head.appendChild(s);
  }
  document.documentElement.style.scrollBehavior = "auto";
  el.scrollIntoView({ block: "center", behavior: "instant" });
  const doc = document.scrollingElement || document.documentElement;
  return { cut: Math.max(0, el.scrollWidth - el.clientWidth) + Math.max(0, el.scrollHeight - el.clientHeight), pageWidth: doc.scrollWidth, viewport: doc.clientWidth };
})()`;

let busy = false;

/** Opens the page of a layout question with the conditions of its test, and takes a screenshot of the element before and after.
 *  One page load for each view, one after the other. On a production site the page sends no form: openPage blocks the requests
 *  that are not GET. */
export async function showLayout(config: Config, q: Record<string, any>, widths: number[], options: { browser?: Browser } = {}): Promise<ShowResult> {
  const ev = q.evidence || {};
  const rule = String(ev.rule || "");
  if (!SHOW_RULES.has(rule)) throw new Error("This question has no test to show.");
  if (busy) throw new Error("A test runs already. Wait until it ends.");
  busy = true;
  const url = new URL(String(ev.url || "/"), config.site.url).toString();
  const text = String(ev.facts?.text || "").split("\n")[0].trim();
  let browser: Browser | undefined = options.browser;
  const views: ShowView[] = [];
  // A screenshot of the element and some space around it, in the coordinates of the whole page: a page with a smooth scroll can
  // still move after scrollIntoView. The element of a reflow finding goes past the right edge of the window, so its screenshot is as
  // wide as the page.
  const shot = async (page: import("playwright").Page, full = false): Promise<string | undefined> => {
    const r = await page.evaluate(`(() => { const e = document.querySelector("[data-a11y-show]"); if (!e) return null; const b = e.getBoundingClientRect(); const d = document.scrollingElement || document.documentElement;
      return { x: b.left + window.scrollX, y: b.top + window.scrollY, w: b.width, h: b.height, pw: d.scrollWidth, ph: d.scrollHeight }; })()`) as { x: number; y: number; w: number; h: number; pw: number; ph: number } | null;
    if (!r || r.w <= 0 || r.h <= 0) return undefined;
    const x = full ? 0 : Math.max(0, Math.floor(r.x - 24)), y = Math.max(0, Math.floor(r.y - 24));
    const width = Math.min(r.pw - x, full ? 1600 : Math.ceil(r.w + 48)), height = Math.min(r.ph - y, Math.ceil(r.h + 48), 1200);
    if (width <= 0 || height <= 0) return undefined;
    return (await page.screenshot({ fullPage: true, clip: { x, y, width, height } })).toString("base64");
  };
  // One view: the page in a new context, the element before, the condition of the test, and the element after.
  const view = async (label: string, width: number, contextOptions: Record<string, unknown>, apply?: (page: import("playwright").Page) => Promise<void>): Promise<ShowView> => {
    const context = await browser!.newContext({ viewport: { width, height: 900 }, ...contextOptions });
    try {
      const opened = await openPage(context, url, config);
      if (!opened.ok || opened.challenge) return { label, width, found: false, note: opened.challenge ? "The site asked for a check of the browser, so the page did not open." : `The page did not open: ${opened.error || "error " + opened.status}.` };
      const page = opened.page;
      const first = await page.evaluate(FIND(String(ev.selector || ""), text)) as { cut: number; pageWidth: number; viewport: number } | null;
      if (!first) return { label, width, found: false, note: "The element is not on the page now. The page can have changed since the audit." };
      if (!apply) return { label, width, found: true, cutAfter: rule === "no-reflow" ? Math.max(0, first.pageWidth - first.viewport) : first.cut, after: await shot(page, rule === "no-reflow") };
      const before = await shot(page);
      await apply(page);
      await page.waitForTimeout(300);
      const second = await page.evaluate(FIND(String(ev.selector || ""), text)) as { cut: number } | null;
      return { label, width, found: true, cutBefore: first.cut, cutAfter: second?.cut ?? 0, before, after: await shot(page) };
    } finally {
      await context.close();
    }
  };
  try {
    browser = browser || await launch();
    if (rule === "text-cut-with-spacing") {
      for (const w of widths) views.push(await view(`${w} px`, w, {}, async (page) => { await page.addStyleTag({ content: SPACING_CSS }); }));
    } else if (rule === "text-cut-at-zoom") {
      // 200% zoom: half the width with a device scale factor of 2, as the audit does. Before: the same window at 100%.
      const w = Math.max(...widths);
      const normal = await view(`${w} px at 100%`, w, {});
      const zoomed = await view(`${w} px at 200%`, Math.round(w / 2), { deviceScaleFactor: 2 });
      views.push({ label: `${w} px, 100% and 200% zoom`, width: w, found: normal.found || zoomed.found, cutBefore: normal.cutAfter, cutAfter: zoomed.cutAfter, before: normal.after, after: zoomed.after, note: zoomed.note || normal.note });
    } else {
      views.push(await view("320 px", 320, {}));
    }
  } finally {
    busy = false;
    if (!options.browser && browser) await browser.close().catch(() => {});
  }
  return { rule, url, views, summary: summaryOf(rule, views) };
}

/** One sentence for each view: what the test shows, in pixels. */
export function summaryOf(rule: string, views: ShowView[]): string {
  return views.map((v) => {
    if (!v.found) return `${v.label}: ${v.note || "the element is not on the page now."}`;
    if (rule === "no-reflow") return (v.cutAfter || 0) > 8 ? `At 320 px the page is ${v.cutAfter} px wider than the window, so it needs a horizontal scroll.` : "At 320 px the page needs no horizontal scroll now.";
    const what = rule === "text-cut-at-zoom" ? "at 200% zoom" : "with the text spacing";
    if ((v.cutAfter || 0) > (v.cutBefore || 0) + 2) return `${v.label}: the element hides ${v.cutAfter} px of its content ${what}, and ${v.cutBefore || 0} px without.`;
    if ((v.cutAfter || 0) > 2) return `${v.label}: the element hides ${v.cutAfter} px of its content, also without the test.`;
    return `${v.label}: the element hides none of its content ${what} now.`;
  }).join(" ");
}
