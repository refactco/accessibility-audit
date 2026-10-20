// The states of a page: the actions from the first load that show more content, for example "click Menu".
// The engine finds them from the ARIA attributes, the details element, and the roles, as PLAN.md section 5.2 says.
import type { Page } from "playwright";
import { HELPERS } from "../browser.ts";
import type { Config } from "../config.ts";

export type StateKind = "menu" | "disclosure" | "tab" | "details" | "popup";

export interface StateAction { label: string; kind: StateKind; selector: string; name: string; item: string; html: string }

const ORDER: Record<StateKind, number> = { menu: 0, disclosure: 1, tab: 2, details: 3, popup: 4 };

/** Finds the controls that open a state. Each control gives one candidate, by its item identity. */
const FIND = `(() => {
  ${HELPERS}
  const out = [];
  const seen = new Set();
  const add = (el, kind) => {
    if (!visible(el) || el.disabled || el.closest("[aria-hidden=true], [inert]")) return;
    const key = item(el);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind, selector: sel(el), name: nameOf(el), item: key, html: html(el) });
  };
  for (const el of document.querySelectorAll("button, [role=button]")) {
    if (el.hasAttribute("aria-expanded") || el.hasAttribute("aria-haspopup")) continue;
    const n = nameOf(el).toLowerCase();
    const c = String(el.className || "").toLowerCase();
    if (/(^|\\s)menu($|\\s)|navigation|hamburger/.test(n) || /hamburger|menu-toggle|nav-toggle|burger|menu-button/.test(c)) add(el, "menu");
  }
  for (const el of document.querySelectorAll('[aria-expanded="false"]')) add(el, "disclosure");
  for (const el of document.querySelectorAll('[role=tab][aria-selected="false"], [role=tab]:not([aria-selected])')) add(el, "tab");
  for (const el of document.querySelectorAll("details:not([open]) > summary")) add(el, "details");
  for (const el of document.querySelectorAll("[aria-haspopup]:not([aria-expanded])")) add(el, "popup");
  return out;
})()`;

export async function findStates(page: Page, config: Config, max: number): Promise<StateAction[]> {
  if (max <= 0) return [];
  const list = await page.evaluate(FIND) as Omit<StateAction, "label">[];
  const denied = (name: string) => config.interaction.deny_list.some((d) => name.toLowerCase().includes(d.toLowerCase()));
  return list.filter((s) => !denied(s.name)).sort((a, b) => ORDER[a.kind] - ORDER[b.kind]).slice(0, max)
    .map((s) => ({ ...s, label: `click ${s.name || s.selector}`.replace(/\s+/g, " ").slice(0, 80) }));
}

export interface Applied { ok: boolean; dialog: string | null; focusInside: boolean }

const SNAPSHOT = `(() => {
  ${HELPERS}
  const count = Array.from(document.querySelectorAll("body *")).filter(visible).length;
  const text = (document.body.innerText || "").length;
  const dlg = Array.from(document.querySelectorAll("[role=dialog], [role=alertdialog], [aria-modal=true], dialog[open]")).find(visible);
  return { count, text, dialog: dlg ? sel(dlg) : null, focusInside: !!(dlg && document.activeElement && dlg.contains(document.activeElement)) };
})()`;

/** Performs the action of a state. The state counts when the visible content changed, or when a dialog opened. */
export async function applyState(page: Page, action: StateAction): Promise<Applied> {
  const before = await page.evaluate(SNAPSHOT) as { count: number; text: number };
  try {
    const loc = page.locator(action.selector).first();
    await loc.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
    await loc.click({ timeout: 2000 });
  } catch {
    return { ok: false, dialog: null, focusInside: false };
  }
  await page.waitForTimeout(500);
  const after = await page.evaluate(SNAPSHOT) as { count: number; text: number; dialog: string | null; focusInside: boolean };
  return { ok: after.count !== before.count || after.text !== before.text || !!after.dialog, dialog: after.dialog, focusInside: after.focusInside };
}

/** True when the cookie banner of the settings is on the page and visible. */
export async function bannerVisible(page: Page, config: Config): Promise<boolean> {
  const selector = config.crawl.cookie_banner?.selector || config.crawl.cookie_banner?.dismiss_selector;
  if (!selector) return false;
  try {
    // A banner or a popup can open some seconds after the load.
    await page.locator(selector).first().waitFor({ state: "visible", timeout: 12000 });
    return await page.evaluate(`(() => { ${HELPERS} const el = document.querySelector(${JSON.stringify(selector)}); return !!el && visible(el); })()`) as boolean;
  } catch {
    return false;
  }
}
