// The process tests: the engine runs the steps of each process in the settings, where section 4.5 of the plan permits it,
// and tests each step as a page in a state. On the way it tests the form errors (3.3.1, 3.3.3) and the redundant entry (3.3.7).
import type { Browser, Page } from "playwright";
import { AXE_TESTED_CRITERIA } from "./criteria.ts";
import { runAxe } from "./axe.ts";
import { HELPERS, closeBanner, storageStateFor } from "./browser.ts";
import type { Config } from "./config.ts";
import { normalizeUrl } from "./crawl.ts";
import { PAGE_TEST_CRITERIA, dropTargetQuestions, runPageTests, toOutcome, type Found } from "./own/page.ts";
import { decideContrastQuestions } from "./own/contrast.ts";
import { FOCUS_TEST_CRITERIA, runFocusTests } from "./own/focus.ts";
import type { Outcome, PageRecord } from "./types.ts";

export const PROCESS_TEST_CRITERIA = ["3.3.1", "3.3.3", "3.3.7"];

type Process = Config["interaction"]["processes"][number];

export type Action =
  | { kind: "read" }
  | { kind: "click"; target: string }
  | { kind: "fill"; field: string; value: string }
  | { kind: "select"; option: string; field: string }
  | { kind: "check"; target: string }
  | { kind: "press"; key: string };

/** The actions that a step can give. The grammar is in formats/config.schema.json. */
export function parseAction(text: string): Action | null {
  const t = text.trim().replace(/\.$/, "");
  const unquote = (s: string) => s.trim().replace(/^['"‘“]/, "").replace(/['"’”]$/, "").trim();
  let m: RegExpMatchArray | null;
  if (/^(?:read|see|look|wait)\b/i.test(t)) return { kind: "read" };
  if ((m = t.match(/^click\s+(.+)$/i))) return { kind: "click", target: unquote(m[1]) };
  if ((m = t.match(/^(?:fill|type)\s+(.+?)\s+with\s+(.+)$/i))) return { kind: "fill", field: unquote(m[1]), value: unquote(m[2]) };
  if ((m = t.match(/^select\s+(.+?)\s+in\s+(.+)$/i))) return { kind: "select", option: unquote(m[1]), field: unquote(m[2]) };
  if ((m = t.match(/^(?:check|tick)\s+(.+)$/i))) return { kind: "check", target: unquote(m[1]) };
  if ((m = t.match(/^press\s+(\S+)$/i))) return { kind: "press", key: m[1] };
  return null;
}

/** Finds a control by its name, or by a CSS selector. Returns the selector of the control. */
const FIND_CONTROL = (text: string, kind: "click" | "fill" | "select" | "check") => `(() => {
  ${HELPERS}
  const text = ${JSON.stringify(text)};
  const norm = (s) => (s || "").trim().replace(/\\s+/g, " ").toLowerCase();
  const want = norm(text);
  if (/^[#.\\[]|\\s>\\s|^[a-z]+[#.\\[]/.test(text)) { try { const el = document.querySelector(text); return el ? sel(el) : null; } catch { return null; } }
  const queries = {
    click: "button, [role=button], a[href], [role=link], [role=tab], [role=menuitem], input[type=submit], input[type=button], summary",
    fill: "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]):not([type=file]), textarea, [contenteditable=true]",
    select: "select",
    check: "input[type=checkbox], input[type=radio], [role=checkbox], [role=radio], [role=switch]",
  };
  const els = Array.from(document.querySelectorAll(queries[${JSON.stringify(kind)}])).filter(visible);
  const names = (el) => [nameOf(el), el.getAttribute("placeholder"), el.getAttribute("name"), el.getAttribute("title"), el.localName === "input" && /submit|button/.test(el.type) ? el.value : ""].map(norm).filter(Boolean);
  const el = els.find((e) => names(e).includes(want)) || els.find((e) => names(e).some((n) => n.includes(want)));
  return el ? sel(el) : null;
})()`;

/** The key of a field for the redundant entry test: its autocomplete token, or its name. */
const FIELD_KEY = (selector: string) => `(() => {
  ${HELPERS}
  const f = document.querySelector(${JSON.stringify(selector)});
  if (!f) return "";
  const token = (f.getAttribute("autocomplete") || "").toLowerCase().replace(/^section-\\S+\\s+/, "").replace(/^(shipping|billing)\\s+/, "").trim();
  return token && token !== "on" && token !== "off" ? token : nameOf(f).toLowerCase().trim();
})()`;

const FIELDS = `(() => {
  ${HELPERS}
  return Array.from(document.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=password]):not([type=checkbox]):not([type=radio]):not([type=file]), textarea")).filter(visible).map((f) => {
    const token = (f.getAttribute("autocomplete") || "").toLowerCase().replace(/^section-\\S+\\s+/, "").replace(/^(shipping|billing)\\s+/, "").trim();
    return { selector: sel(f), html: html(f), item: item(f), key: token && token !== "on" && token !== "off" ? token : nameOf(f).toLowerCase().trim(), value: f.value || "", label: nameOf(f) };
  });
})()`;

/** The visible fields, each with its validity and the text that is linked to it or near it, and the visible alerts. */
const FORM_STATE = `(() => {
  ${HELPERS}
  const fields = Array.from(document.querySelectorAll("input:not([type=hidden]), select, textarea")).filter(visible).map((f) => {
    const invalid = f.getAttribute("aria-invalid") === "true" || !!(f.form && f.form.noValidate && f.matches(":invalid") && f.value);
    const ids = [f.getAttribute("aria-describedby") || "", f.getAttribute("aria-errormessage") || ""].join(" ").split(/\\s+/).filter(Boolean);
    const linked = ids.map((id) => document.getElementById(id)).filter((e) => e && visible(e) && (e.innerText || "").trim());
    const container = f.closest(".field, .form-group, .form-row, .form-item, .form-field, .input-group, .hs-form-field, label, li, p, fieldset") || f.parentElement;
    const near = container ? Array.from(container.querySelectorAll("*")).filter((e) => e !== f && visible(e) && !e.contains(f) && (e.innerText || "").trim() && !linked.includes(e)) : [];
    const texts = Array.from(new Set([...linked, ...near].map((e) => e.innerText.trim().replace(/\\s+/g, " ").slice(0, 160))));
    return { selector: sel(f), html: html(f), item: item(f), label: nameOf(f), invalid, texts };
  });
  const alerts = Array.from(document.querySelectorAll("[role=alert], [aria-live=assertive], .error, .errors, .error-summary, [class*=error], [class*=invalid], [id*=error]")).filter((e) => visible(e) && (e.innerText || "").trim()).map((e) => e.innerText.trim().replace(/\\s+/g, " ").slice(0, 200));
  return { fields, alerts, text: (document.body.innerText || "").length };
})()`;

interface FormField { selector: string; html: string; item: string; label: string; invalid: boolean; texts: string[] }
interface FormState { fields: FormField[]; alerts: string[]; text: number }

/** An error message gives a suggestion when it names the field, a format, an example, or a limit. */
function hasSuggestion(message: string, label: string): boolean {
  const words = label.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
  const m = message.toLowerCase();
  return words.some((w) => m.includes(w)) || /format|example|must|between|at least|at most|digits|characters|\d|@|select|choose|required/.test(m);
}

function formErrors(before: FormState, after: FormState): Found[] {
  const found: Found[] = [];
  // A field counts when it became invalid, or when the text near it changed. Only the text that appeared after the action counts as error text.
  const textsBefore = (selector: string) => before.fields.find((x) => x.selector === selector)?.texts || [];
  const own = (f: FormField) => f.texts.filter((t) => !textsBefore(f.selector).includes(t));
  const newInvalid = after.fields.filter((f) => { if (!f.invalid) return false; const b = before.fields.find((x) => x.selector === f.selector); return !b || !b.invalid || own(f).length > 0; });
  if (!newInvalid.length) return found;
  const newAlerts = after.alerts.filter((a) => !before.alerts.includes(a));
  const texts = [...newAlerts, ...newInvalid.flatMap(own)];
  if (!texts.length && after.text <= before.text + 2) {
    const f = newInvalid[0];
    found.push({ criterion: "3.3.1", rule: "error-not-in-text", kind: "failed", selector: f.selector, html: f.html, item: f.item, facts: { invalidFields: newInvalid.map((x) => x.label), alerts: after.alerts.slice(0, 3) },
      summary: `The form marks ${newInvalid.length} fields as invalid, but no text identifies the error.`, severity: "critical",
      solution: { summary: "Show each error in text, next to the field and in a summary.", steps: ["Add a text message for each invalid field.", "Connect the message to the field with aria-describedby."] } });
    return found;
  }
  for (const f of newInvalid) {
    const mine = own(f);
    if (!mine.length) {
      found.push({ criterion: "3.3.1", rule: "error-not-linked", kind: "cantTell", selector: f.selector, html: f.html, item: f.item, facts: { label: f.label, alerts: newAlerts.slice(0, 3) },
        summary: `The field "${f.label}" is invalid, and no error text is connected to it or near it.`, severity: "serious",
        question: `Does the error text on the page identify the field "${f.label}"? Text: "${(newAlerts[0] || "").slice(0, 120)}"`,
        solution: { summary: "Put the error text next to the field and connect it with aria-describedby.", steps: ["Add an error element after the field.", "Point aria-describedby of the field to it."] } });
    }
    for (const message of mine.slice(0, 2)) {
      if (hasSuggestion(message, f.label)) continue;
      found.push({ criterion: "3.3.3", rule: "error-without-suggestion", kind: "cantTell", selector: f.selector, html: f.html, item: f.item, facts: { label: f.label, message },
        summary: `The error for "${f.label}" says "${message.slice(0, 80)}" and gives no suggestion for the correction.`, severity: "serious",
        question: `Does the error message "${message.slice(0, 120)}" tell the user how to correct the input of the field "${f.label}"?`,
        solution: { summary: "Say in the error what input the field needs.", steps: ["Add the expected format or an example to the message."] } });
    }
  }
  return found;
}

export interface ProcessRun { name: string; tested: boolean; reason?: string; records: PageRecord[]; steps: number; renders: number }

interface Entered { value: string; step: number; url: string }

function permission(config: Config, p: Process): string | null {
  if (p.environment !== config.site.environment) return `The process runs on ${p.environment} only, and these settings are for ${config.site.environment}.`;
  const actions = p.steps.map((s) => parseAction(s.action));
  const bad = actions.findIndex((a) => !a);
  if (bad >= 0) return `Step ${bad + 1} is not an action that the engine knows: "${p.steps[bad].action}". Use click, fill ... with ..., select ... in ..., check, press, or read.`;
  if (!config.interaction.tests_that_send_data && actions.some((a) => a && (a.kind === "fill" || a.kind === "select" || a.kind === "check"))) return "The steps enter data, and tests_that_send_data is false in the settings.";
  if (p.account) {
    const role = (config.login.roles || []).find((r) => r.name === p.account);
    if (!role) return `The settings have no login role named "${p.account}".`;
    const storage = storageStateFor(role.secret_name);
    if (!storage.path) return storage.warning || "The account is not available.";
  }
  return null;
}

async function perform(page: Page, action: Action, config: Config, entered: Map<string, Entered>, step: number): Promise<string | null> {
  switch (action.kind) {
    case "read": return null;
    case "press": await page.keyboard.press(action.key); return null;
    case "click": {
      const selector = await page.evaluate(FIND_CONTROL(action.target, "click")) as string | null;
      if (!selector) return `no control named "${action.target}" is visible`;
      const submits = await page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el || !el.form) return false; const t = (el.getAttribute("type") || (el.localName === "button" ? "submit" : "")).toLowerCase(); return t === "submit"; })()`) as boolean;
      if (submits && !config.interaction.tests_that_send_data) return "the control submits a form, and tests_that_send_data is false in the settings";
      await page.locator(selector).first().click({ timeout: 5000 });
      return null;
    }
    case "fill": {
      const selector = await page.evaluate(FIND_CONTROL(action.field, "fill")) as string | null;
      if (!selector) return `no field named "${action.field}" is visible`;
      await page.locator(selector).first().fill(action.value, { timeout: 5000 });
      const key = await page.evaluate(FIELD_KEY(selector)) as string;
      if (key) entered.set(key, { value: action.value, step, url: page.url() });
      return null;
    }
    case "select": {
      const selector = await page.evaluate(FIND_CONTROL(action.field, "select")) as string | null;
      if (!selector) return `no select named "${action.field}" is visible`;
      const loc = page.locator(selector).first();
      try { await loc.selectOption({ label: action.option }, { timeout: 3000 }); } catch { await loc.selectOption(action.option, { timeout: 3000 }); }
      return null;
    }
    case "check": {
      const selector = await page.evaluate(FIND_CONTROL(action.target, "check")) as string | null;
      if (!selector) return `no checkbox or radio named "${action.target}" is visible`;
      await page.locator(selector).first().check({ timeout: 3000 });
      return null;
    }
  }
}

/** Fields on this page that ask again for a value the user entered on an earlier page of the process. */
async function redundantEntry(page: Page, entered: Map<string, Entered>, url: string): Promise<Found[]> {
  if (!entered.size) return [];
  const fields = await page.evaluate(FIELDS) as { selector: string; html: string; item: string; key: string; value: string; label: string }[];
  const found: Found[] = [];
  for (const f of fields) {
    const e = entered.get(f.key);
    if (!e || e.url === url || f.value.trim()) continue;
    found.push({ criterion: "3.3.7", rule: "redundant-entry", kind: "candidate", selector: f.selector, html: f.html, item: f.item, facts: { key: f.key, enteredAtStep: e.step, enteredOn: new URL(e.url).pathname },
      summary: `The field "${f.label}" asks again for a value that the user entered at step ${e.step}.`, severity: "moderate",
      question: `Is the value of "${f.label}" the same information the user entered at step ${e.step}, and is a new entry essential, for example for security?`,
      steps: ["Do the process up to this step.", "Check if the field is filled, or offers the earlier value for selection."],
      solution: { summary: "Fill the field with the earlier value, or offer it for selection.", steps: ["Store the value of the earlier step and fill the field with it."] } });
  }
  return found;
}

const same = (a: string, b: string) => a.replace(/\/$/, "") === b.replace(/\/$/, "");

type Shoot = (page: Page, outcomes: Outcome[]) => Promise<void>;

export async function runProcess(browser: Browser, config: Config, width: number, crawled: PageRecord[], p: Process, limiter: { wait(): Promise<void> }, log: (line: string) => void, shoot?: Shoot): Promise<ProcessRun> {
  const denied = permission(config, p);
  if (denied) return { name: p.name, tested: false, reason: denied, records: [], steps: 0, renders: 0 };
  const role = p.account ? (config.login.roles || []).find((r) => r.name === p.account) : config.login.method === "storage_state" ? config.login.roles?.[0] : undefined;
  const storage = role ? storageStateFor(role.secret_name) : {};
  const context = await browser.newContext({ viewport: { width, height: 900 }, ...(storage.path ? { storageState: storage.path } : {}) });
  const page = await context.newPage();
  const base = config.site.url + "/";
  const siteLang = config.site.languages?.[0] || null;
  const records: PageRecord[] = [];
  const entered = new Map<string, Entered>();
  const blocked: string[] = [];
  let actionsOnPage: string[] = [];
  let tested = true;
  let reason: string | undefined;
  let renders = 0;
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (req.method() !== "GET" && config.site.environment === "production" && !config.interaction.tests_that_send_data) { await route.abort("aborted"); return; }
    await route.continue();
  });
  try {
    for (let i = 0; i < p.steps.length; i++) {
      const step = p.steps[i];
      const action = parseAction(step.action)!;
      const target = normalizeUrl(config, step.page, base);
      if (!target) { tested = false; reason = `Step ${i + 1}: "${step.page}" is not an address.`; break; }
      const current = normalizeUrl(config, page.url(), base) || "";
      if (!same(current, target)) {
        await limiter.wait();
        const response = await page.goto(target, { waitUntil: "load", timeout: 45000 }).catch(() => null);
        renders++;
        if (!response || response.status() >= 400) { tested = false; reason = `Step ${i + 1}: the page ${step.page} did not load${response ? " (" + response.status() + ")" : ""}.`; break; }
        await page.waitForTimeout(400);
        await closeBanner(page, config);
        actionsOnPage = [];
      }
      const before = await page.evaluate(FORM_STATE) as FormState;
      const urlBefore = page.url();
      const error = await perform(page, action, config, entered, i + 1).catch((e: Error) => e.message.split("\n")[0]);
      if (error) { tested = false; reason = `Step ${i + 1} (${step.action}): ${error}.`; break; }
      await page.waitForLoadState("load", { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(600);
      if (page.url() !== urlBefore) { actionsOnPage = []; renders++; await closeBanner(page, config); }
      if (action.kind !== "read") actionsOnPage.push(step.action);
      const state = [...actionsOnPage];
      const url = page.url();
      let record = records.find((r) => r.url === url);
      if (!record) {
        record = { url, template: null, set: "site", sample: true, sampleReason: "process", process: p.name, tested: true, testedCriteria: { [width]: new Set() }, outcomes: [], links: [], renders: 0, facts: {}, states: [] };
        records.push(record);
      }
      record.states.push({ id: `S${record.states.length + 1}`, actions: state });
      record.renders++;
      log(`  process ${p.name}, step ${i + 1}: ${step.action} (${new URL(url).pathname})`);
      const outcomes: Outcome[] = [];
      try {
        const axe = await decideContrastQuestions(page, await runAxe(page, url, width, state));
        const own = await runPageTests(page, url, width, state, siteLang, axe.filter((o) => o.rule === "target-size" && o.kind === "failed").map((o) => o.selector));
        outcomes.push(...(await dropTargetQuestions(page, axe, own.outcomes)), ...own.outcomes);
        if (action.kind === "click" || action.kind === "press") {
          const after = await page.evaluate(FORM_STATE) as FormState;
          if (page.url() === urlBefore) outcomes.push(...formErrors(before, after).map((f) => toOutcome(f, url, width, state)));
        }
        outcomes.push(...(await redundantEntry(page, entered, url)).map((f) => toOutcome(f, url, width, state)));
        outcomes.push(...(await runFocusTests(page, url, width, state, blocked, { limit: 60 })));
      } catch (e) {
        log(`  process ${p.name}: test error at step ${i + 1}: ${(e as Error).message.split("\n")[0]}`);
      }
      // An outcome that the crawled page or an earlier step gave is not repeated.
      const crawledPage = crawled.find((r) => same(r.url, url));
      const keys = new Set([...(crawledPage?.outcomes.filter((o) => o.width === width) || []), ...record.outcomes].flatMap((o) => [o.rule + "|" + o.selector, o.rule + "|" + o.item, o.rule + "|" + (o.html || "")]));
      const fresh = outcomes.filter((o) => !keys.has(o.rule + "|" + o.selector) && !keys.has(o.rule + "|" + o.item) && !(o.html && keys.has(o.rule + "|" + o.html)));
      if (shoot) await shoot(page, fresh).catch(() => {});
      record.outcomes.push(...fresh);
      for (const c of [...AXE_TESTED_CRITERIA, ...PAGE_TEST_CRITERIA, ...FOCUS_TEST_CRITERIA, ...PROCESS_TEST_CRITERIA]) record.testedCriteria[width].add(c);
    }
  } finally {
    await context.close();
  }
  return { name: p.name, tested, reason, records, steps: p.steps.length, renders };
}

export async function runProcesses(browser: Browser, config: Config, width: number, crawled: PageRecord[], limiter: { wait(): Promise<void> }, log: (line: string) => void, shoot?: Shoot): Promise<ProcessRun[]> {
  const out: ProcessRun[] = [];
  for (const p of config.interaction.processes) {
    const r = await runProcess(browser, config, width, crawled, p, limiter, log, shoot);
    if (!r.tested) log(`  process ${p.name} not tested: ${r.reason}`);
    out.push(r);
  }
  return out;
}
