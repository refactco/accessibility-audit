// The focus tests: one pass with real Tab events over the page, forward and backward.
// They test focus visible (2.4.7), focus not obscured (2.4.11), a change of context on focus (3.2.1),
// a keyboard trap (2.1.2), the exit of a dialog (2.1.2), the focus in a dialog (2.4.3), and the contrast of the focus indicator (1.4.11).
import type { Page } from "playwright";
import { HELPERS } from "../browser.ts";
import { toOutcome, type Found } from "./page.ts";
import type { Outcome } from "../types.ts";

export const FOCUS_TEST_CRITERIA = ["2.4.7", "2.4.11", "3.2.1", "2.1.2", "2.1.1", "2.4.3"];

const STYLE_KEYS = ["outlineStyle", "outlineWidth", "outlineColor", "outlineOffset", "boxShadow", "borderTopColor", "borderBottomColor", "backgroundColor", "color", "textDecorationLine", "filter", "transform"];

/** Reads the focused element: its selector, styles, box, and if it is entirely covered. */
const READ = `(() => {
  ${HELPERS}
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return { selector: "", body: true };
  const cs = getComputedStyle(el);
  const styles = {}; for (const k of ${JSON.stringify(STYLE_KEYS)}) styles[k] = cs[k];
  const r = el.getBoundingClientRect();
  const points = [];
  for (const fx of [0.1, 0.5, 0.9]) for (const fy of [0.1, 0.5, 0.9]) points.push([r.left + r.width * fx, r.top + r.height * fy]);
  let covered = 0, inViewport = r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  let coverer = "";
  for (const [x, y] of points) {
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) { covered++; continue; }
    const hit = document.elementFromPoint(x, y);
    if (!hit) { covered++; continue; }
    if (hit === el || el.contains(hit) || hit.contains(el)) continue;
    covered++; coverer = coverer || sel(hit);
  }
  function lum(c) { const m = c.match(/[\\d.]+/g); if (!m) return null; const [rr, g, b] = m.slice(0, 3).map(Number); const a = m[3] !== undefined ? Number(m[3]) : 1; if (a === 0) return null; const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(rr) + 0.7152 * f(g) + 0.0722 * f(b); }
  function bg(node) { let n = node; while (n && n !== document.documentElement) { const c = getComputedStyle(n).backgroundColor; const l = lum(c); if (l !== null) return l; n = n.parentElement; } return 1; }
  const outlineLum = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 ? lum(cs.outlineColor) : null;
  const back = bg(el.parentElement || el);
  const outlineContrast = outlineLum === null ? null : Math.round(((Math.max(outlineLum, back) + 0.05) / (Math.min(outlineLum, back) + 0.05)) * 100) / 100;
  return { selector: sel(el), item: item(el), html: html(el), tag: el.localName, styles, inViewport, covered, points: points.length, coverer, outlineContrast, rect: { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) }, href: el.getAttribute("href") || "" };
})()`;

const UNFOCUSED = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  el.blur();
  const cs = getComputedStyle(el);
  const styles = {}; for (const k of ${JSON.stringify(STYLE_KEYS)}) styles[k] = cs[k];
  return styles;
})()`;

/** The state of a dialog: open, the focus inside it, and a control that closes it. */
const DIALOG = (selector: string) => `(() => {
  ${HELPERS}
  const d = document.querySelector(${JSON.stringify(selector)});
  if (!d) return { open: false, inside: false, closeControl: false };
  const open = visible(d) && !(d.localName === "dialog" && !d.open);
  const closeControl = Array.from(d.querySelectorAll("button, [role=button], a[href], input[type=button], input[type=submit]")).some((b) => visible(b) && /close|dismiss|cancel|back|×|✕|✖|^x$|^ok$|done|got it|accept|decline|continue|skip|later|no thanks/i.test(nameOf(b)));
  return { open, inside: d.contains(document.activeElement), closeControl };
})()`;

export interface FocusOptions {
  /** The maximum of Tab presses in one pass. */
  limit?: number;
  /** The selector of an open dialog. The pass starts from the focus inside it, and tests its exit. */
  dialog?: string | null;
}

export async function runFocusTests(page: Page, url: string, width: number, state: string[], blocked: string[], options: FocusOptions = {}): Promise<Outcome[]> {
  const limit = options.limit ?? 80;
  const dialog = options.dialog || null;
  const found: Found[] = [];
  const count = await page.evaluate(`(() => { ${HELPERS} return tabbable().length; })()`) as number;
  if (count === 0) return [];
  const startUrl = page.url();
  const seen = new Set<string>();
  let trapped: Record<string, any> | null = null;
  let trapKey = "";
  let leftDialog = false;
  let dialogClosed = false;
  const blockedBefore = blocked.length;

  const pass = async (key: "Tab" | "Shift+Tab", forward: boolean) => {
    if (!dialog) await page.evaluate("document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0);");
    let previous = "";
    let repeats = 0;
    let first = "";
    for (let i = 0; i < limit; i++) {
      await page.keyboard.press(key);
      await page.waitForTimeout(25);
      if (page.url() !== startUrl) {
        found.push({ criterion: "3.2.1", rule: "change-of-context-on-focus", kind: "failed", selector: previous || "body", item: "focus|navigation", facts: { from: startUrl, to: page.url() },
          summary: "The page changed when a control got the focus.", severity: "critical",
          solution: { summary: "Do not change the page on focus. Use a button or a submit for the change.", steps: ["Remove the handler that navigates on focus."] } });
        return;
      }
      const r = await page.evaluate(READ) as Record<string, any>;
      if (r.body) break;
      if (dialog) {
        const d = await page.evaluate(DIALOG(dialog)) as { open: boolean; inside: boolean };
        if (!d.open) { dialogClosed = true; break; }
        if (!d.inside) {
          leftDialog = true;
          found.push({ criterion: "2.4.3", rule: "focus-leaves-dialog", kind: "cantTell", selector: dialog, html: r.html, item: "dialog|" + dialog, facts: { focusedOutside: r.selector, after: i + 1 },
            summary: "The focus leaves an open dialog with the Tab key.", severity: "serious",
            question: "Is this dialog modal? A modal dialog must keep the focus inside it until it closes.",
            solution: { summary: "Keep the focus inside the modal dialog.", steps: ["Make the content behind the dialog inert, for example with the inert attribute or showModal().", "Move the focus to the first control of the dialog when it opens."] } });
          break;
        }
      }
      if (!first) first = r.selector;
      else if (r.selector === first && i > 1) break; // The focus went around the page.
      if (r.selector === previous) {
        repeats++;
        // A media player or an iframe has its own tab stops inside one element.
        const internal = r.tag === "audio" || r.tag === "video" || r.tag === "iframe";
        if (repeats >= (internal ? 12 : 2) && !trapped) { trapped = r; trapKey = key; break; }
        continue;
      }
      repeats = 0;
      previous = r.selector;
      if (blocked.length > blockedBefore) {
        found.push({ criterion: "3.2.1", rule: "change-of-context-on-focus", kind: "failed", selector: r.selector, html: r.html, item: r.item, facts: { blocked: blocked.slice(blockedBefore) },
          summary: "A control starts a navigation when it gets the focus.", severity: "critical",
          solution: { summary: "Do not change the page on focus.", steps: ["Remove the handler that navigates on focus."] } });
        blocked.length = blockedBefore;
      }
      // Focus not obscured: all sampled points of the control are covered by other content.
      if (r.inViewport && r.covered >= r.points && r.rect.width > 0) {
        found.push({ criterion: "2.4.11", rule: "focus-entirely-hidden", kind: "failed", selector: r.selector, html: r.html, item: r.item + "|" + (forward ? "forward" : "backward"), facts: { coveredBy: r.coverer, direction: forward ? "forward" : "backward", rect: r.rect },
          summary: "The control that has the focus is entirely hidden by other content.", severity: "serious",
          solution: { summary: "Keep the focused control visible, for example with scroll-padding for fixed bars.", steps: ["Add scroll-padding-top or scroll-padding-bottom equal to the height of the fixed bar.", "Or make the bar static."] } });
      }
      if (!forward || seen.has(r.selector)) continue;
      seen.add(r.selector);
      // Focus visible: the styles of the control with focus and with no focus.
      const unfocused = await page.evaluate(UNFOCUSED) as Record<string, string> | null;
      await page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(r.selector)}); if (el) el.focus({ preventScroll: true }); })()`);
      if (unfocused) {
        const changed = STYLE_KEYS.filter((k) => r.styles[k] !== unfocused[k]);
        if (changed.length === 0) {
          found.push({ criterion: "2.4.7", rule: "focus-not-visible", kind: "failed", selector: r.selector, html: r.html, item: r.item, facts: { outline: r.styles.outlineStyle, outlineWidth: r.styles.outlineWidth },
            summary: "The control shows no change when it has the focus.", severity: "serious",
            solution: { summary: "Show a visible focus indicator.", steps: ["Add an outline on :focus-visible, with a contrast of at least 3:1."] } });
        } else if (r.outlineContrast !== null && r.outlineContrast < 3 && changed.every((k) => k.startsWith("outline"))) {
          found.push({ criterion: "1.4.11", rule: "focus-indicator-contrast", kind: "cantTell", selector: r.selector, html: r.html, item: r.item, facts: { outlineColor: r.styles.outlineColor, contrast: r.outlineContrast },
            summary: `The focus indicator has a contrast of ${r.outlineContrast}:1 with the background.`, severity: "serious",
            question: "Is the focus indicator the only visual indication of the focus, and does it have a contrast of 3:1?",
            solution: { summary: "Give the focus indicator a contrast of at least 3:1.", steps: ["Change the outline color."] } });
        }
      }
    }
  };

  await pass("Tab", true);
  // The pass assigns trapped inside a function, so the type is read again here.
  const trap = trapped as Record<string, any> | null;
  if (dialog) {
    // A modal dialog keeps the focus inside it, by design. The user must be able to close it with the keyboard.
    if (!leftDialog && !dialogClosed) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      const d = await page.evaluate(DIALOG(dialog)) as { open: boolean; closeControl: boolean };
      if (d.open && !d.closeControl) {
        found.push({ criterion: "2.1.2", rule: "dialog-without-exit", kind: "failed", selector: dialog, html: trap?.html || "", item: "dialog|" + dialog, facts: { escape: "does not close", closeControl: false },
          summary: "A dialog keeps the focus. Esc does not close it, and it has no control that closes it.", severity: "critical",
          solution: { summary: "Close the dialog with Esc, and add a Close button.", steps: ["Add a keydown handler for Escape that closes the dialog.", "Add a visible Close button inside the dialog."] } });
      }
    }
  } else if (trap) {
    found.push({ criterion: "2.1.2", rule: "keyboard-trap", kind: "cantTell", selector: trap.selector, html: trap.html, item: trap.item, facts: { key: trapKey },
      summary: "The focus cannot leave an element with the Tab key.", severity: "critical",
      question: "Does the page tell the user how to leave this element with the keyboard, for example with Esc?",
      solution: { summary: "Let the Tab key leave the element, or tell the user how to leave it.", steps: ["Remove the handler that stops the Tab key."] } });
  }
  if (!trapped && !dialog) await pass("Shift+Tab", false);
  await page.evaluate("document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0);");
  return found.map((f) => toOutcome(f, url, width, state));
}
