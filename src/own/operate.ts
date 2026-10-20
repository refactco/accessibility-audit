// Tests that operate the page in the protected mode: disclosure states (4.1.2), a change of a select (3.2.2),
// status messages after a button (4.1.3), and content on hover or focus (1.4.13).
import type { Page } from "playwright";
import { HELPERS } from "../browser.ts";
import type { Config } from "../config.ts";
import { toOutcome, type Found } from "./page.ts";
import type { Outcome } from "../types.ts";

export const OPERATE_TEST_CRITERIA = ["4.1.2", "3.2.2", "4.1.3", "1.4.13"];

function denied(name: string, config: Config): boolean {
  const n = name.toLowerCase();
  return config.interaction.deny_list.some((d) => n.includes(d.toLowerCase()));
}

export async function runOperateTests(page: Page, config: Config, url: string, width: number, state: string[], blocked: string[]): Promise<Outcome[]> {
  const found: Found[] = [];
  const startUrl = page.url();

  // 4.1.2: controls with aria-expanded must change their state when operated.
  const expanders = await page.evaluate(`(() => { ${HELPERS} return Array.from(document.querySelectorAll("[aria-expanded]")).filter(visible).slice(0, 15).map((el) => ({ selector: sel(el), html: html(el), item: item(el), name: nameOf(el), expanded: el.getAttribute("aria-expanded"), controls: el.getAttribute("aria-controls") })); })()`) as Record<string, any>[];
  for (const e of expanders) {
    if (denied(e.name, config)) continue;
    try {
      const loc = page.locator(e.selector).first();
      await loc.click({ timeout: 1500, trial: false });
      await page.waitForTimeout(250);
      const after = await page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(e.selector)}); if (!el) return null; const id = el.getAttribute("aria-controls"); const panel = id ? document.getElementById(id) : null; return { expanded: el.getAttribute("aria-expanded"), panelVisible: panel ? !panel.hidden && getComputedStyle(panel).display !== "none" : null }; })()`) as { expanded: string; panelVisible: boolean | null } | null;
      if (after && after.expanded === e.expanded && after.panelVisible !== null && after.panelVisible === (e.expanded !== "true" ? true : false)) {
        found.push({ criterion: "4.1.2", rule: "expanded-state-not-updated", kind: "failed", selector: e.selector, html: e.html, item: e.item, facts: { before: e.expanded, after: after.expanded, panelVisible: after.panelVisible },
          summary: "A control opens its panel, but its aria-expanded state does not change.", severity: "serious",
          solution: { summary: "Set aria-expanded to true when the panel opens, and to false when it closes.", steps: ["Update the aria-expanded attribute in the click handler."] } });
      }
      await loc.click({ timeout: 1500 });
      await page.waitForTimeout(150);
    } catch { /* the control did not respond */ }
    if (page.url() !== startUrl) { await page.goBack().catch(() => {}); break; }
  }

  // 3.2.2: a change of a select must not load a new page without a warning.
  const selects = await page.evaluate(`(() => { ${HELPERS} return Array.from(document.querySelectorAll("select")).filter((s) => visible(s) && s.options.length > 1 && !s.disabled).slice(0, 10).map((s) => ({ selector: sel(s), html: html(s), item: item(s), name: nameOf(s), value: s.value, other: Array.from(s.options).map((o) => o.value).find((v) => v !== s.value) })); })()`) as Record<string, any>[];
  for (const s of selects) {
    if (denied(s.name, config) || s.other === undefined) continue;
    const before = blocked.length;
    try {
      await page.selectOption(s.selector, s.other, { timeout: 1500 });
      await page.waitForTimeout(400);
      if (page.url() !== startUrl || blocked.length > before) {
        found.push({ criterion: "3.2.2", rule: "change-of-context-on-input", kind: "cantTell", selector: s.selector, html: s.html, item: s.item, facts: { navigation: blocked.slice(before), url: page.url() },
          summary: "A change of a select loads a new page.", severity: "serious", question: "Does the page tell the user, before the select, that a change loads a new page?",
          solution: { summary: "Add a button that applies the change, or a note before the select.", steps: ["Remove the onchange navigation and add an Apply button."] } });
        blocked.length = before;
        if (page.url() !== startUrl) { await page.goBack().catch(() => {}); break; }
      }
      await page.selectOption(s.selector, s.value, { timeout: 1500 }).catch(() => {});
    } catch { /* the select did not respond */ }
  }

  // 4.1.3: a button that adds text to the page must put it in a live region, or move the focus to it.
  const buttons = await page.evaluate(`(() => { ${HELPERS} return Array.from(document.querySelectorAll('button[type=button], [role=button]')).filter((b) => visible(b) && !b.hasAttribute("aria-expanded") && !b.closest("[role=tablist]")).slice(0, 12).map((b) => ({ selector: sel(b), html: html(b), item: item(b), name: nameOf(b) })); })()`) as Record<string, any>[];
  for (const b of buttons) {
    if (denied(b.name, config)) continue;
    try {
      // Nodes that were in the page before the click are moves, not new content. Content in a dialog is not a status message.
      await page.evaluate(`window.__a11yBefore = new WeakSet(Array.from(document.body.querySelectorAll("*"))); window.__a11yAdded = []; const inDialog = (el) => !!(el && el.closest && el.closest("dialog, [role=dialog], [role=alertdialog], [aria-modal=true]")); window.__a11yObs = new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) { if (n.nodeType === 1 && window.__a11yBefore.has(n)) continue; if (inDialog(n.nodeType === 1 ? n : n.parentElement)) continue; const t = (n.textContent || "").trim(); if (t) window.__a11yAdded.push({ text: t.slice(0, 120), live: !!(n.parentElement && n.parentElement.closest("[aria-live], [role=status], [role=alert], [role=log], output")) }); } for (const m of ms) if (m.type === "characterData") { const p = m.target.parentElement; if (inDialog(p)) continue; const t = (m.target.textContent || "").trim(); if (t) window.__a11yAdded.push({ text: t.slice(0, 120), live: !!(p && p.closest("[aria-live], [role=status], [role=alert], [role=log], output")) }); } }); window.__a11yObs.observe(document.body, { childList: true, subtree: true, characterData: true });`);
      await page.locator(b.selector).first().click({ timeout: 1500 });
      await page.waitForTimeout(400);
      const result = await page.evaluate(`(() => { ${HELPERS} window.__a11yObs.disconnect(); const added = window.__a11yAdded; const focus = sel(document.activeElement); const dialog = Array.from(document.querySelectorAll("dialog[open], [role=dialog], [role=alertdialog], [aria-modal=true]")).some(visible); return { added, focus, dialog }; })()`) as { added: { text: string; live: boolean }[]; focus: string; dialog: boolean };
      const notLive = result.added.filter((a) => !a.live);
      const focusMoved = result.focus !== b.selector && result.focus !== "";
      if (page.url() !== startUrl) { await page.goBack().catch(() => {}); break; }
      if (result.dialog) {
        // The button opened a dialog. Close it, so that the next tests see the page.
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);
        await page.evaluate(`(() => { ${HELPERS} for (const d of document.querySelectorAll("dialog[open], [role=dialog], [role=alertdialog], [aria-modal=true]")) { if (!visible(d)) continue; if (d.localName === "dialog") { d.close(); continue; } const close = Array.from(d.querySelectorAll("button, [role=button]")).find((x) => visible(x) && /close|dismiss|cancel|×|✕/i.test(nameOf(x))); if (close) close.click(); } })()`).catch(() => {});
      }
      if (notLive.length && !focusMoved && !result.dialog) {
        found.push({ criterion: "4.1.3", rule: "message-not-in-live-region", kind: "cantTell", selector: b.selector, html: b.html, item: b.item, facts: { button: b.name, added: notLive.slice(0, 3).map((a) => a.text) },
          summary: `After "${b.name}", new text appeared outside a live region, and the focus did not move to it.`, severity: "serious",
          question: `Is this new text a status message that a screen reader must announce? Text: "${notLive[0].text}"`,
          solution: { summary: "Put the message in a live region.", steps: ["Add role=\"status\" to the container of the message."] } });
      }
    } catch { /* the button did not respond */ }
  }

  // 2.1.1: in a composite widget, the arrow keys must reach the parts that have tabindex -1.
  const composites = await page.evaluate(`(() => { ${HELPERS} return Array.from(document.querySelectorAll("[role=tablist], [role=menubar], [role=menu], [role=radiogroup], [role=listbox], [role=toolbar], [role=tree], [role=grid]")).filter(visible).slice(0, 8).map((c) => { const parts = Array.from(c.querySelectorAll("[role=tab], [role=menuitem], [role=menuitemradio], [role=menuitemcheckbox], [role=radio], [role=option], [role=treeitem], [role=gridcell], button, a[href]")).filter(visible); const active = parts.find((p) => p.getAttribute("tabindex") !== "-1") || parts[0]; return { selector: sel(c), html: html(c), item: item(c), role: c.getAttribute("role"), parts: parts.length, unreachable: parts.filter((p) => p.getAttribute("tabindex") === "-1").length, active: active ? sel(active) : null }; }); })()`) as Record<string, any>[];
  for (const c of composites) {
    if (!c.active || c.unreachable === 0) continue;
    try {
      await page.locator(c.active).first().focus({ timeout: 1500 });
      let moved = false;
      for (const key of ["ArrowRight", "ArrowDown"]) {
        await page.keyboard.press(key);
        await page.waitForTimeout(80);
        const now = await page.evaluate(`(() => { ${HELPERS} return sel(document.activeElement); })()`) as string;
        if (now !== c.active) { moved = true; break; }
      }
      if (!moved) {
        found.push({ criterion: "2.1.1", rule: "composite-parts-unreachable", kind: "failed", selector: c.selector, html: c.html, item: c.item, facts: { role: c.role, parts: c.parts, unreachable: c.unreachable },
          summary: `A ${c.role} has ${c.unreachable} parts with tabindex -1, and the arrow keys do not reach them.`, severity: "critical",
          solution: { summary: "Move between the parts with the arrow keys, or give each part tabindex 0.", steps: ["Add a keydown handler for the arrow keys that moves the focus between the parts."] } });
      }
      await page.evaluate("document.activeElement && document.activeElement.blur()");
    } catch { /* the widget did not respond */ }
  }

  // 1.4.13: content on hover or focus must be dismissible with Esc and hoverable.
  await page.mouse.move(0, 0);
  await page.keyboard.press("Escape");
  await page.evaluate("document.activeElement && document.activeElement.blur()");
  await page.waitForTimeout(150);
  const triggers = await page.evaluate(`(() => { ${HELPERS} return Array.from(document.querySelectorAll("[aria-describedby]")).filter(visible).slice(0, 10).map((t) => ({ selector: sel(t), html: html(t), item: item(t), target: t.getAttribute("aria-describedby") })); })()`) as Record<string, any>[];
  for (const t of triggers) {
    try {
      // A point inside the content and inside the viewport, so that the pointer does not leave the page.
      const shown = async () => await page.evaluate(`(() => { const el = document.getElementById(${JSON.stringify(t.target)}); if (!el) return null; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); if (el.hidden || cs.display === "none" || cs.visibility === "hidden" || r.width <= 0) return null; const x = Math.min(Math.max(r.left + Math.min(r.width / 2, 20), 1), innerWidth - 1); const y = Math.min(Math.max(r.top + Math.min(r.height / 2, 10), 1), innerHeight - 1); return { x, y }; })()`) as { x: number; y: number } | null;
      if (await shown()) continue; // The content is already visible, so it is not content on hover.
      await page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(t.selector)}); if (el) el.scrollIntoView({ block: "center" }); })()`);
      await page.locator(t.selector).first().hover({ timeout: 1500 });
      await page.waitForTimeout(250);
      const pos = await shown();
      if (!pos) continue;
      await page.mouse.move(pos.x, pos.y);
      await page.waitForTimeout(250);
      const hoverable = (await shown()) !== null;
      await page.locator(t.selector).first().hover({ timeout: 1500 });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(250);
      const dismissible = (await shown()) === null;
      await page.mouse.move(0, 0);
      if (!hoverable || !dismissible) {
        found.push({ criterion: "1.4.13", rule: "hover-content", kind: "cantTell", selector: t.selector, html: t.html, item: t.item, facts: { hoverable, dismissible },
          summary: `Content on hover is ${hoverable ? "" : "not hoverable"}${!hoverable && !dismissible ? " and " : ""}${dismissible ? "" : "not dismissible with Esc"}.`, severity: "serious",
          question: "Can the user dismiss the content with Esc, keep it while the pointer is on it, and does it stay until dismissed?",
          solution: { summary: "Close the content with Esc, and keep it open while the pointer is on it.", steps: ["Add an Escape handler.", "Keep the content open on mouseenter of the content."] } });
      }
    } catch { /* the trigger did not respond */ }
  }
  return found.map((f) => toOutcome(f, url, width, state));
}
