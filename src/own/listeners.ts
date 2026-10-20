// The listener test: reads the event listeners of the page through the browser protocol.
// It finds candidates for 2.1.4, 2.5.1, 2.5.2, 2.5.4, and 2.5.7, and controls that the keyboard cannot reach (2.1.1).
import type { Page } from "playwright";
import { HELPERS } from "../browser.ts";
import { toOutcome, type Found } from "./page.ts";
import type { Outcome } from "../types.ts";

export const LISTENER_TEST_CRITERIA = ["2.1.4", "2.5.1", "2.5.2", "2.5.4", "2.5.7", "2.1.1", "4.1.2"];

const INTERACTIVE = "a[href], button, input, select, textarea, [role=button], [role=link], [role=checkbox], [role=radio], [role=switch], [role=tab], [role=menuitem], [tabindex], summary";

/** Presses each character key with the focus on the body and records a change of focus, of the address, or of the page. */
async function pressCharacterKeys(page: Page): Promise<{ key: string; effect: string }[]> {
  const effects: { key: string; effect: string }[] = [];
  const startUrl = page.url();
  await page.evaluate("document.activeElement && document.activeElement.blur(); window.__a11yMut = 0; window.__a11yKeyObs = new MutationObserver((ms) => { window.__a11yMut += ms.length; }); window.__a11yKeyObs.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });");
  // The page can change by itself, for example an advertisement or a slider. Three windows with no key give the background.
  let background = 0;
  for (let i = 0; i < 3; i++) {
    await page.evaluate("window.__a11yMut = 0");
    await page.waitForTimeout(30);
    background = Math.max(background, await page.evaluate("window.__a11yMut") as number);
  }
  for (const key of "abcdefghijklmnopqrstuvwxyz0123456789/?.,") {
    await page.evaluate("window.__a11yMut = 0");
    await page.keyboard.press(key);
    await page.waitForTimeout(30);
    const r = await page.evaluate("({ focus: document.activeElement && document.activeElement !== document.body ? document.activeElement.localName : '', mut: window.__a11yMut })") as { focus: string; mut: number };
    if (page.url() !== startUrl) { effects.push({ key, effect: "the address changed to " + page.url() }); await page.goBack().catch(() => {}); break; }
    if (r.focus) { effects.push({ key, effect: "the focus moved to " + r.focus }); await page.evaluate("document.activeElement.blur()"); }
    else if (r.mut > background * 2 + 2) effects.push({ key, effect: "the page changed, " + r.mut + " mutations" });
    if (effects.length >= 3) break;
  }
  await page.evaluate("window.__a11yKeyObs && window.__a11yKeyObs.disconnect()");
  return effects;
}

export async function runListenerTest(page: Page, url: string, width: number, state: string[]): Promise<Outcome[]> {
  const client = await page.context().newCDPSession(page);
  const found: Found[] = [];
  const listenersOf = async (expression: string): Promise<string[]> => {
    const { result } = await client.send("Runtime.evaluate", { expression, objectGroup: "a11y" });
    if (!result.objectId) return [];
    const { listeners } = await client.send("DOMDebugger.getEventListeners", { objectId: result.objectId, depth: 0 });
    return listeners.map((l: { type: string }) => l.type);
  };
  try {
    const global = [...(await listenersOf("window")), ...(await listenersOf("document")), ...(await listenersOf("document.body"))];
    if (global.some((t) => t === "devicemotion" || t === "deviceorientation")) {
      found.push({ criterion: "2.5.4", rule: "device-motion-listener", kind: "candidate", selector: "window", item: "window|devicemotion", facts: { listeners: global.filter((t) => t.startsWith("device")) },
        summary: "The page listens to the motion of the device.", severity: "serious", question: "Does a motion of the device start a function, and can the user do the same with a control and switch the motion off?",
        steps: ["Shake or tilt the device on the page.", "Look for a control that does the same, and a setting that switches the motion off."],
        solution: { summary: "Add a control for the function, and a way to switch the motion off.", steps: ["Add a button that does the same as the motion."] } });
    }
    if (global.some((t) => t === "keydown" || t === "keypress" || t === "keyup")) {
      // The page listens to keys. Press each character key with the focus on the body, and look for an effect.
      const effects = await pressCharacterKeys(page);
      if (effects.length) found.push({ criterion: "2.1.4", rule: "single-key-shortcut", kind: "candidate", selector: "document", item: "document|shortcut|" + effects.map((e) => e.key).join(""), facts: { effects },
        summary: `The key "${effects[0].key}" does something on the page with no modifier: ${effects[0].effect}.`, severity: "serious", question: "Can the user switch this single-key shortcut off, change it to use a modifier, or does it work only when a control has the focus?",
        steps: ["Press the key on the page with no control in focus.", "Look for a setting that switches the shortcut off or changes it."],
        solution: { summary: "Require a modifier key, or let the user switch the shortcut off or change it.", steps: ["Use a modifier key with the shortcut."] } });
    }
    // Element listeners, on the interactive elements and on elements with handlers but no interactive role.
    const nodes = await page.evaluate(`(() => { ${HELPERS} const out = []; let i = 0; for (const el of document.querySelectorAll("body *")) { if (!visible(el) || i > 600) continue; const interactive = el.matches(${JSON.stringify(INTERACTIVE)}); const role = el.getAttribute("role"); out.push({ i: i++, selector: sel(el), item: item(el), parentItem: item(el.parentElement || el), html: html(el), tag: el.localName, interactive, role, tabindex: el.getAttribute("tabindex"), draggable: el.getAttribute("draggable") === "true", touchAction: getComputedStyle(el).touchAction, name: nameOf(el).slice(0, 60), buttonsNearby: el.parentElement ? Array.from(el.parentElement.querySelectorAll("button, [role=button], a[href]")).filter(visible).map((b) => nameOf(b).slice(0, 40)).slice(0, 8) : [] }); el.setAttribute("data-a11y-i", String(i - 1)); } return out; })()`) as Record<string, any>[];
    const dragSeen = new Set<string>();
    for (const n of nodes) {
      const types = await listenersOf(`document.querySelector('[data-a11y-i="${n.i}"]')`);
      if (!types.length && !n.draggable) continue;
      const set = new Set(types);
      const acts = set.has("click") || set.has("pointerdown") || set.has("mousedown") || set.has("touchstart") || set.has("pointerup") || set.has("mouseup") || set.has("keydown");
      if (acts && !n.interactive && !["html", "body", "main", "form", "nav", "header", "footer", "section", "article", "ul", "ol", "table", "tbody"].includes(n.tag) && !["dialog", "region", "group", "list", "tablist", "presentation", "none"].includes(n.role || "")) {
        found.push({ criterion: "2.1.1", rule: "control-not-focusable", kind: "failed", selector: n.selector, html: n.html, item: n.item, facts: { listeners: types, tag: n.tag, role: n.role },
          summary: `A ${n.tag} element acts on a pointer event, but the keyboard cannot reach it.`, severity: "critical",
          solution: { summary: "Use a button or a link, or add tabindex=\"0\", a role, and a keyboard handler.", steps: ["Replace the element with a button element.", "Or add tabindex=\"0\", a role, and handlers for Enter and Space."] } });
        found.push({ criterion: "4.1.2", rule: "control-without-role", kind: "failed", selector: n.selector, html: n.html, item: n.item, facts: { listeners: types, tag: n.tag, role: n.role, name: n.name },
          summary: `A ${n.tag} element acts as a control, but has no role${n.name ? "" : " and no name"}.`, severity: "serious",
          solution: { summary: "Give the control a role, a name, and a state.", steps: ["Use a native control, or add role, aria-label, and the state attribute that fits."] } });
      }
      if ((set.has("pointerdown") || set.has("mousedown") || set.has("touchstart")) && !set.has("click") && !set.has("pointerup") && !set.has("mouseup") && n.interactive && !n.draggable) {
        found.push({ criterion: "2.5.2", rule: "down-event-listener", kind: "candidate", selector: n.selector, html: n.html, item: n.item, facts: { listeners: types },
          summary: "A control acts on the down event of the pointer.", severity: "serious", question: "Does the function complete on the down event, with no way to abort or undo it, and is that essential?",
          steps: ["Press the pointer on the control and move away before you release it.", "Note if the function ran."],
          solution: { summary: "Act on the up event, or let the user abort before the up event.", steps: ["Use the click event."] } });
      }
      // A dragstart handler on an element that is not draggable usually blocks the drag of an image. It is not a drag operation.
      const moves = (set.has("mousedown") || set.has("pointerdown") || set.has("touchstart")) && (set.has("mousemove") || set.has("pointermove") || set.has("touchmove"));
      if ((n.draggable || set.has("drop") || moves) && !dragSeen.has(n.parentItem)) {
        dragSeen.add(n.parentItem); // One question for each list of draggable items.
        found.push({ criterion: "2.5.7", rule: "drag-listener", kind: "candidate", selector: n.selector, html: n.html, item: n.parentItem, facts: { listeners: types, draggable: n.draggable, buttonsNearby: n.buttonsNearby, focusable: n.interactive || n.tabindex !== null },
          summary: "An element can be dragged.", severity: "serious", question: "Can the user do the same function with no drag, for example with buttons, and is the drag not essential?",
          steps: ["Find the function of the drag.", "Look for buttons or another control that does the same with one pointer press."],
          solution: { summary: "Add a control that does the same with no drag.", steps: ["Add buttons that move the item."] } });
      }
      if ((set.has("touchmove") || set.has("gesturestart") || set.has("wheel")) && n.touchAction === "none" && !n.interactive) {
        found.push({ criterion: "2.5.1", rule: "gesture-listener", kind: "candidate", selector: n.selector, html: n.html, item: n.item, facts: { listeners: types, touchAction: n.touchAction },
          summary: "An element handles touch gestures and blocks the default touch actions.", severity: "serious", question: "Does the element need a multipoint or path-based gesture, with no control that does the same with one pointer?",
          steps: ["Use the element with a pinch or a two-finger drag.", "Look for buttons that zoom or pan."],
          solution: { summary: "Add single-pointer controls for the gesture.", steps: ["Add zoom and pan buttons."] } });
      }
    }
    await page.evaluate("document.querySelectorAll('[data-a11y-i]').forEach((el) => el.removeAttribute('data-a11y-i'))");
  } finally {
    await client.send("Runtime.releaseObjectGroup", { objectGroup: "a11y" }).catch(() => {});
    await client.detach().catch(() => {});
  }
  return found.map((f) => toOutcome(f, url, width, state));
}
