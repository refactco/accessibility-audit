// The dry submit: the engine submits each form of the sample pages, empty and with incorrect values, and tests the
// error messages that the page shows. A guard in the browser blocks each request that can carry the data, so nothing
// leaves the browser, also on production. See FORMS.md section 3.
import type { Browser, BrowserContext, Page, Request } from "playwright";
import { runAxe } from "../axe.ts";
import { HELPERS, closeBanner } from "../browser.ts";
import type { Config } from "../config.ts";
import { isPermitted } from "../crawl.ts";
import { FORM_STATE, formErrors, type FormState } from "../process.ts";
import type { Outcome, PageRecord } from "../types.ts";
import { decideContrastQuestions } from "./contrast.ts";
import { runFocusTests } from "./focus.ts";
import { dropTargetQuestions, runPageTests, toOutcome, type Found } from "./page.ts";

/** The criteria that a dry submit tests. 4.1.3 counts as tested by the operate tests already. */
export const DRY_SUBMIT_CRITERIA = ["3.3.1", "3.3.3"];
/** The value of each text field in submission B: not a correct email, date, phone, or address. */
export const DRY_VALUE = "a11y-dry-submit";
export const MAX_FORMS_PER_PAGE = 3;

export interface FormCandidate { selector: string; submit: string; name: string; signature: string; html: string; item: string; textFields: number }

/** The fields that submission B fills: text fields that a person types into. */
const TEXT = "input:not([type]), input[type=text], input[type=email], input[type=tel], input[type=url], input[type=password], textarea";
const USABLE = `const usable = (el) => visible(el) && !el.disabled && !el.readOnly && !el.closest("[aria-hidden=true], [inert]");`;
const SUBMIT_TYPES = "button[type=submit], button:not([type]), input[type=submit], input[type=image]";

/** The forms of the page: a form element with a text field and a submit control. Not a search form. */
const FIND_FORMS = `(() => {
  ${HELPERS}
  ${USABLE}
  const out = [];
  for (const form of Array.from(document.forms)) {
    if (form.getAttribute("role") === "search" || form.closest("[role=search]")) continue;
    const fields = Array.from(form.querySelectorAll(${JSON.stringify(TEXT)})).filter(usable);
    if (!fields.length) continue;
    const all = Array.from(form.elements).filter((e) => e.matches && e.matches("input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]), select, textarea") && visible(e));
    const words = (el) => [nameOf(el), el.getAttribute("placeholder"), el.getAttribute("name"), el.id].join(" ");
    if (all.length === 1 && (/\\b(search|query|keywords?)\\b/i.test(words(fields[0])) || /^(s|q)$/.test(fields[0].getAttribute("name") || ""))) continue;
    const owned = form.id ? Array.from(document.querySelectorAll('[form="' + CSS.escape(form.id) + '"]')).filter((b) => b.matches(${JSON.stringify(SUBMIT_TYPES)})) : [];
    let submit = [...Array.from(form.querySelectorAll(${JSON.stringify(SUBMIT_TYPES)})), ...owned].find((b) => visible(b) && !b.disabled);
    if (!submit) submit = Array.from(form.querySelectorAll("button, [role=button], input[type=button]")).find((b) => visible(b) && !b.disabled && /send|submit|subscribe|sign ?up|sign ?in|log ?in|join|register|continue|next|request|get started|apply/i.test(nameOf(b) || b.value || ""));
    if (!submit) continue;
    const name = (nameOf(submit) || submit.value || "").trim().replace(/\\s+/g, " ").slice(0, 60);
    let action = "";
    if (form.getAttribute("action")) { try { action = new URL(form.action).pathname; } catch { action = form.getAttribute("action"); } }
    const signature = [action, (form.getAttribute("method") || "get").toLowerCase(), all.map((e) => (e.type || e.localName) + ":" + (e.getAttribute("name") || e.id || nameOf(e))).sort().join(","), name].join("|");
    out.push({ selector: sel(form), submit: sel(submit), name: name || form.getAttribute("aria-label") || form.id || "form", signature, html: html(form).slice(0, 300), item: item(form), textFields: fields.length });
  }
  return out;
})()`;

const TEXT_FIELDS = (form: string) => `(() => {
  ${HELPERS}
  ${USABLE}
  const form = document.querySelector(${JSON.stringify(form)});
  return form ? Array.from(form.querySelectorAll(${JSON.stringify(TEXT)})).filter(usable).map(sel) : [];
})()`;

/** The focus, the text of the live regions, and the validity that the browser itself checks. */
const AFTER = (form: string, submit: string) => `(() => {
  ${HELPERS}
  const form = document.querySelector(${JSON.stringify(form)});
  const submit = document.querySelector(${JSON.stringify(submit)});
  const a = document.activeElement;
  const focus = a && a !== document.body && a !== document.documentElement ? sel(a) : "";
  const live = Array.from(document.querySelectorAll("[aria-live]:not([aria-live=off]), [role=alert], [role=status], [role=log], output")).filter(visible).map((e) => (e.innerText || "").trim().replace(/\\s+/g, " ")).filter(Boolean);
  return { focus, focusOnSubmit: !!(submit && a === submit), live, nativeInvalid: !!(form && !form.noValidate && form.querySelector(":invalid")) };
})()`;

export async function findForms(page: Page): Promise<FormCandidate[]> {
  return (await page.evaluate(FIND_FORMS) as FormCandidate[]).slice(0, MAX_FORMS_PER_PAGE);
}

/** The guard of one browser context. When it is armed, it blocks each request that can carry the data of a form. */
export interface Guard { armed: boolean; values: string[]; blocked: string[] }

/** True when the address carries the value, as it is or encoded. */
function carries(url: string, value: string): boolean {
  if (!value) return false;
  let decoded = url;
  try { decoded = decodeURIComponent(url.replace(/\+/g, " ")); } catch { /* not encoded */ }
  return url.includes(value) || url.includes(encodeURIComponent(value)) || decoded.includes(value);
}

/** Why the armed guard blocks the request, or null. See FORMS.md section 3.2. */
export function blockReason(config: Config, req: Pick<Request, "method" | "resourceType" | "url">, guard: Guard): string | null {
  const method = req.method();
  const url = req.url();
  if (method !== "GET" && method !== "HEAD") return "method " + method;
  if (guard.values.some((v) => carries(url, v))) return "typed value";
  let permitted = false;
  try { permitted = isPermitted(config, url); } catch { permitted = false; }
  if (!permitted) return "host";
  const type = req.resourceType();
  if (type === "stylesheet" || type === "image" || type === "font" || type === "media") return null;
  if (type === "script") return /\.m?js$/i.test(new URL(url).pathname) ? null : "script with no .js path";
  return "type " + type;
}

/** A new context with the guard: no service workers, the requests and the WebSockets routed, and new windows closed.
 *  Before the guard is armed, the rules of the other pages apply: after the load, no navigation, and on production no request that is not GET. */
export async function guardedContext(browser: Browser, config: Config, width: number, contextOptions: Record<string, unknown> = {}): Promise<{ context: BrowserContext; guard: Guard; open(url: string): Promise<Page>; closeWindows(): Promise<void> }> {
  const guard: Guard = { armed: false, values: [], blocked: [] };
  const context = await browser.newContext({ viewport: { width, height: 900 }, ...contextOptions, serviceWorkers: "block" });
  let main: Page | null = null;
  let loaded = false;
  await context.route("**/*", async (route) => {
    const req = route.request();
    if (guard.armed) {
      const reason = blockReason(config, req, guard);
      // "aborted" keeps the document of the page. A block "by client" would replace it with an error page.
      if (reason) { guard.blocked.push(`${req.method()} ${req.url().slice(0, 200)} (${reason})`); await route.abort("aborted").catch(() => {}); return; }
    } else if (loaded && ((main && req.isNavigationRequest() && req.frame() === main.mainFrame()) || (req.method() !== "GET" && config.site.environment === "production"))) {
      await route.abort("aborted").catch(() => {});
      return;
    }
    await route.continue().catch(() => {});
  });
  await context.routeWebSocket(/.*/, (ws) => {
    // A WebSocket that opens after the guard is armed never connects. One that was open before cannot send to the server.
    if (guard.armed) { guard.blocked.push(`WebSocket ${ws.url()} (opened after the guard)`); return; }
    const server = ws.connectToServer();
    ws.onMessage((message) => {
      if (guard.armed) { guard.blocked.push(`WebSocket message to ${ws.url()}`); return; }
      server.send(message);
    });
  });
  // A new window stays open until the guard has blocked its first request, so that the block shows in the record.
  const windows: Page[] = [];
  context.on("page", (p) => { if (main && p !== main) windows.push(p); });
  const closeWindows = async () => { for (const w of windows.splice(0)) await w.close().catch(() => {}); };
  const open = async (url: string) => {
    main = await context.newPage();
    await main.goto(url, { waitUntil: "load", timeout: 45000 });
    await main.evaluate("document.fonts ? document.fonts.ready.then(() => true) : true").catch(() => {});
    await main.waitForTimeout(400);
    loaded = true;
    await closeBanner(main, config);
    // The analytics of the page view can start late. They meet the rules of each other page before the guard starts,
    // so that a block after the click belongs to the form. A page that never goes quiet waits 5 seconds at most.
    await main.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    return main;
  };
  return { context, guard, open, closeWindows };
}

/** What a submission showed. browser: the page checked the fields. native: the browser checked them. server: the form tried to
 *  send, so the site checks on the server only. none: nothing changed. error: the engine could not do the submission. */
export type SubmissionKind = "browser" | "native" | "server" | "none" | "error";

export interface Submission { variant: "empty" | "incorrect"; kind: SubmissionKind; state: string[]; blocked: string[]; rules: string[]; reason?: string }

export interface DryRun { form: FormCandidate; url: string; submissions: Submission[]; renders: number; states: number; tested: boolean; serverOnly: boolean; unchanged: boolean; error?: string }

export interface DryOptions {
  contextOptions?: Record<string, unknown>;
  limiter: { wait(): Promise<void> };
  siteLang: string | null;
  shoot?: (page: Page, outcomes: Outcome[]) => Promise<void>;
}

/** The outcomes that the page record does not have yet at this width. */
function fresh(record: PageRecord, width: number, outcomes: Outcome[]): Outcome[] {
  const keys = new Set(record.outcomes.filter((o) => o.width === width).flatMap((o) => [o.rule + "|" + o.selector, o.rule + "|" + o.item, o.rule + "|" + (o.html || "")]));
  return outcomes.filter((o) => !keys.has(o.rule + "|" + o.selector) && !keys.has(o.rule + "|" + o.item) && !(o.html && keys.has(o.rule + "|" + o.html)));
}

/** 4.1.3: error text appeared, the focus stayed on the submit control or left the page, and no live region holds the text. */
function notAnnounced(form: FormCandidate, before: FormState, after: FormState, focus: string, focusOnSubmit: boolean, live: string[]): Found | null {
  const textsBefore = new Set(before.fields.flatMap((f) => f.texts));
  const shown = Array.from(new Set([...after.alerts.filter((a) => !before.alerts.includes(a)), ...after.fields.filter((f) => f.invalid).flatMap((f) => f.texts.filter((t) => !textsBefore.has(t)))]));
  if (!shown.length) return null;
  if (focus && !focusOnSubmit) return null;
  if (shown.some((t) => live.some((l) => l.includes(t.slice(0, 60))))) return null;
  return { criterion: "4.1.3", rule: "error-not-announced", kind: "cantTell", selector: form.selector, html: form.html, item: form.item,
    facts: { button: form.name, errors: shown.slice(0, 3), focus: focus || "body", live: live.slice(0, 3) },
    summary: `After a submission with errors, the form shows "${shown[0].slice(0, 80)}", but the focus ${focus ? "stays on the button" : "leaves the form"} and no live region holds the text.`, severity: "serious",
    question: `After the submission of the form "${form.name}" with errors, the text "${shown[0].slice(0, 120)}" appears. The focus ${focus ? "stays on the button" : "goes to the page"}, and no live region holds the text. Does a screen reader announce the errors?`,
    steps: ["Submit the form empty with a screen reader on.", "Listen for an announcement of the errors."],
    solution: { summary: "Tell a screen reader about the errors: move the focus to an error summary or to the first field with an error, or put the errors in a live region.", steps: ["After a submission with errors, move the focus to the error summary or to the first invalid field.", "Or put the error summary in an element with role=alert."] } };
}

/** One submission in its own render. skip: the rules that submission A of the same form found already, for one issue for each cause. */
async function submitOnce(browser: Browser, config: Config, record: PageRecord, width: number, form: FormCandidate, variant: Submission["variant"], options: DryOptions, skip: Set<string> = new Set()): Promise<Submission> {
  const state = [`dry submit of the form '${form.name}', ${variant === "empty" ? "empty" : "with incorrect values"}`];
  const { context, guard, open, closeWindows } = await guardedContext(browser, config, width, options.contextOptions);
  try {
    await options.limiter.wait();
    let page: Page;
    try { page = await open(record.url); } catch (e) { return { variant, kind: "error", state, blocked: [], rules: [], reason: "the page did not load: " + (e as Error).message.split("\n")[0] }; }
    // The guard starts before the first action on the form, and stays on until the context closes.
    guard.armed = true;
    guard.values.push(DRY_VALUE);
    const present = await page.evaluate(`!!document.querySelector(${JSON.stringify(form.selector)}) && !!document.querySelector(${JSON.stringify(form.submit)})`) as boolean;
    if (!present) return { variant, kind: "error", state, blocked: [], rules: [], reason: "the form is not on the page in a new render" };
    if (variant === "incorrect") {
      for (const f of await page.evaluate(TEXT_FIELDS(form.selector)) as string[]) await page.locator(f).first().fill(DRY_VALUE, { timeout: 3000 }).catch(() => {});
    }
    // The form just before the click, after the typing: only what the click changes counts.
    const before = await page.evaluate(FORM_STATE) as FormState;
    const blockedBefore = guard.blocked.length;
    try {
      await page.locator(form.submit).first().click({ timeout: 3000 });
    } catch (e) {
      return { variant, kind: "error", state, blocked: guard.blocked.slice(blockedBefore), rules: [], reason: "the submit control did not respond: " + (e as Error).message.split("\n")[0] };
    }
    await page.waitForLoadState("load", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);
    await closeWindows();
    const after = await page.evaluate(FORM_STATE) as FormState;
    const extra = await page.evaluate(AFTER(form.selector, form.submit)) as { focus: string; focusOnSubmit: boolean; live: string[]; nativeInvalid: boolean };
    const blocked = guard.blocked.slice(blockedBefore);
    // The page reacted when a field became invalid, when an invalid field got new text near it, or when an alert appeared.
    const was = (f: { selector: string }) => before.fields.find((b) => b.selector === f.selector);
    const reacted = after.fields.some((f) => f.invalid && (!was(f)?.invalid || f.texts.some((t) => !(was(f)?.texts || []).includes(t))))
      || after.alerts.some((a) => !before.alerts.includes(a));
    const kind: SubmissionKind = reacted ? "browser" : extra.nativeInvalid ? "native" : blocked.length ? "server" : "none";
    if (kind !== "browser") return { variant, kind, state, blocked, rules: [] };

    // The error state: the form tests, the announcement, then the tests of a state.
    const outcomes: Outcome[] = formErrors(before, after).map((f) => toOutcome(f, record.url, width, state));
    const announced = notAnnounced(form, before, after, extra.focus, extra.focusOnSubmit, extra.live);
    if (announced) outcomes.push(toOutcome(announced, record.url, width, state));
    try {
      const axe = await decideContrastQuestions(page, await runAxe(page, record.url, width, state));
      const own = await runPageTests(page, record.url, width, state, record.lang || options.siteLang, axe.filter((o) => o.rule === "target-size" && o.kind === "failed").map((o) => o.selector));
      outcomes.push(...(await dropTargetQuestions(page, axe, own.outcomes)), ...own.outcomes);
      outcomes.push(...(await runFocusTests(page, record.url, width, state, [], { limit: 50 })));
    } catch { /* the form tests above stay */ }
    const add = fresh(record, width, outcomes.filter((o) => !skip.has(o.rule)));
    if (options.shoot) await options.shoot(page, add).catch(() => {});
    record.outcomes.push(...add);
    record.states.push({ id: `S${record.states.length + 1}`, actions: state });
    return { variant, kind, state, blocked, rules: add.map((o) => o.rule) };
  } finally {
    await context.close().catch(() => {});
  }
}

/** The dry submit of one form: submission A empty, then submission B with incorrect values when A showed errors on the page. */
export async function runDrySubmit(browser: Browser, config: Config, record: PageRecord, width: number, form: FormCandidate, options: DryOptions): Promise<DryRun> {
  const run: DryRun = { form, url: record.url, submissions: [], renders: 0, states: 0, tested: false, serverOnly: false, unchanged: false };
  const a = await submitOnce(browser, config, record, width, form, "empty", options);
  run.submissions.push(a); run.renders++;
  if (a.kind === "browser" && form.textFields > 0) {
    // "error-not-in-text" is one issue for the form: submission B does not give it again for another field.
    const b = await submitOnce(browser, config, record, width, form, "incorrect", options, new Set(a.rules.filter((r) => r === "error-not-in-text")));
    run.submissions.push(b); run.renders++;
  }
  record.renders += run.renders;
  run.states = run.submissions.filter((s) => s.kind === "browser").length;
  run.tested = a.kind !== "error";
  run.serverOnly = a.kind === "server";
  run.unchanged = a.kind === "none";
  if (a.kind === "error") run.error = a.reason;
  return run;
}
