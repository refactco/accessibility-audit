// One audit, step by step: crawl, render at each width, run the rule engine and the own tests, the states, the processes, group, compare, write.
// Several workers audit pages at the same time. The rate limit is shared, so the load on the site stays the same.
import { AXE_TESTED_CRITERIA } from "./criteria.ts";
import { AXE_VERSION, runAxe } from "./axe.ts";
import { LOAD_WAIT_SECONDS, launch, openPage, pageFacts, storageStateFor, type Opened } from "./browser.ts";
import type { Config } from "./config.ts";
import { FILE_ADDRESS, RateLimiter, isCommonPage, isPermitted, isSkipped, newFrontier, nextAddress, normalizeUrl, offer, pageKey, pathOf, queuedCount, quickCheck, robotsDisallows, robotsFor, seed, setOf, templateOf } from "./crawl.ts";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { effectiveAnswer, loadDecisions } from "./decide.ts";
import { applyAnswers, buildIssues, buildQuestions, loadExisting, sha, type CompareContext } from "./issues.ts";
import { ENGINE_VERSION, PAGE_TEST_CRITERIA, dropTargetQuestions, runPageTests, runUpdateWatch } from "./own/page.ts";
import { runImageOfTextTest, runImageTextContrastTest } from "./own/images.ts";
import { LAYOUT_TEST_CRITERIA, runReflow, runSpacing, runZoom } from "./own/layout.ts";
import { FOCUS_TEST_CRITERIA, runFocusTests } from "./own/focus.ts";
import { LISTENER_TEST_CRITERIA, runListenerTest } from "./own/listeners.ts";
import { OPERATE_TEST_CRITERIA, runOperateTests } from "./own/operate.ts";
import { SITE_TEST_CRITERIA, collectSiteFacts, runSiteTests, type SiteFacts } from "./own/site.ts";
import { applyState, bannerVisible, findStates, type NotApplied, type StateAction } from "./own/states.ts";
import { decideContrastQuestions } from "./own/contrast.ts";
import { runProcesses, type ProcessRun } from "./process.ts";
import { DRY_SUBMIT_CRITERIA, findForms, runDrySubmit, type DryRun, type FormCandidate } from "./own/dry-submit.ts";
import { renderReport, type TemplateDifference } from "./report.ts";
import { issuesByPage, pageCoverage, pageFileOf, processSummary, siteSummary } from "./results.ts";
import { writeResults } from "./write.ts";
import { buildOverview, historyOverview, readHistory } from "./overview.ts";
import { NOT_OPENED, inScope, notOpened, type NotTestedReason, type Outcome, type PageRecord } from "./types.ts";

export interface AuditOptions {
  config: Config; outDir: string; only?: string[]; maxPages?: number;
  /** The maximum of pages in the random part and the technology part of the sample. */
  sampleLimit?: number;
  concurrency?: number;
  /** A short check tests only the pages with open issues. The caller gives them in `only`. */
  kind?: "full" | "short check";
  log?: (line: string) => void; startedBy?: "schedule" | "person" | "skill";
  /** A stop request, for example Ctrl+C: the open pages finish, then the results come from what exists. */
  signal?: AbortSignal;
  /** Continue the last run of the results folder that a stop or a crash ended, from its pages in runs/<run>/pages.partial.jsonl. */
  resume?: boolean;
  /** The shares of the time budget: the pages end at `pages` (0.85), the quick check at `quick` (0.9). The states, the dry submits,
   *  and the processes have the rest. A test can give other shares. */
  shares?: { pages?: number; quick?: number };
}

/** The state of a run in runs/<run>/state.json: what a resume needs. finished: the results were written. */
interface RunState { run: string; started: string; only?: string[]; kind?: "full" | "short check"; finished: boolean; stopped: boolean }
/** One line of runs/<run>/pages.partial.jsonl: one address that a worker finished, as it was at the end of the crawl phase. */
interface PartialLine { address: string; claimed: string[]; elapsed: number; record?: Record<string, any>; siteFacts?: SiteFacts; candidates?: { width: number; states: StateAction[] }[]; forms?: FormCandidate[] }

/** The run to resume: the last run of the folder, when a stop or a crash ended it. */
function runToResume(outDir: string): { state: RunState; lines: PartialLine[] } {
  const runsDir = join(outDir, "runs");
  const dirs = existsSync(runsDir) ? readdirSync(runsDir).filter((d) => existsSync(join(runsDir, d, "state.json"))).sort() : [];
  if (!dirs.length) throw new Error(`No run to resume in ${runsDir}.`);
  const dir = join(runsDir, dirs[dirs.length - 1]);
  const state = JSON.parse(readFileSync(join(dir, "state.json"), "utf8")) as RunState;
  if (state.finished && !state.stopped) throw new Error(`The last run, ${state.run}, finished. There is nothing to resume.`);
  const lines = existsSync(join(dir, "pages.partial.jsonl")) ? readFileSync(join(dir, "pages.partial.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as PartialLine) : [];
  return { state, lines };
}

const toLine = (r: PageRecord) => ({ ...r, testedCriteria: Object.fromEntries(Object.entries(r.testedCriteria).map(([w, set]) => [w, [...set]])) });
const fromLine = (r: Record<string, any>): PageRecord => ({ ...r, testedCriteria: Object.fromEntries(Object.entries(r.testedCriteria || {}).map(([w, list]) => [Number(w), new Set(list as string[])])) } as PageRecord);

export interface AuditResult { run: string; pages: PageRecord[]; issues: number; questions: number; durationSeconds: number; statesTested: number; processes: ProcessRun[]; dryRuns: DryRun[] }

/** The non-interference criteria that run with the cookie banner open. */
const NON_INTERFERENCE = new Set(["1.4.2", "2.1.2", "2.2.2", "2.3.1", "2.4.3"]);
const TEMPLATE_CRITERIA = new Set([...FOCUS_TEST_CRITERIA, ...LISTENER_TEST_CRITERIA, ...OPERATE_TEST_CRITERIA]);
/** The errors of a load that a short fault of the network gives, not the site: the load gets one more try after a pause. */
const TRANSIENT_NETWORK_ERROR = /net::ERR_(NETWORK_CHANGED|INTERNET_DISCONNECTED|NETWORK_IO_SUSPENDED|CONNECTION_RESET|CONNECTION_CLOSED|CONNECTION_ABORTED|CONNECTION_TIMED_OUT|TIMED_OUT|EMPTY_RESPONSE|ADDRESS_UNREACHABLE|NAME_NOT_RESOLVED)\b/;
const NETWORK_RETRY_PAUSE = 5000;

const sameUrl = (a: string, b: string) => a.replace(/\/$/, "") === b.replace(/\/$/, "");

/** The outcomes of a state that the first render of the page did not give at this width. */
function newOnly(record: PageRecord, width: number, outcomes: Outcome[]): Outcome[] {
  const keys = new Set(record.outcomes.filter((o) => o.width === width).flatMap((o) => [o.rule + "|" + o.selector, o.rule + "|" + o.item, o.rule + "|" + (o.html || "")]));
  return outcomes.filter((o) => !keys.has(o.rule + "|" + o.selector) && !keys.has(o.rule + "|" + o.item) && !(o.html && keys.has(o.rule + "|" + o.html)));
}

/** Takes a screenshot of the element of each review question of a render, as evidence, into runs/<run>/screenshots. */
async function shootQuestions(page: import("playwright").Page, outcomes: Outcome[], outDir: string, shotDir: string): Promise<void> {
  let n = 0;
  const seen = new Set<string>();
  for (const o of outcomes) {
    if ((o.kind !== "cantTell" && o.kind !== "candidate") || o.facts?.screenshot) continue;
    const key = o.rule + "|" + o.item;
    if (seen.has(key)) continue;
    seen.add(key);
    if (n >= 15) break;
    const file = join(shotDir, sha(key + "|" + o.url + "|" + o.width + "|" + o.state.join(">")).slice(0, 16) + ".png");
    try {
      // Only the page itself gets a viewport screenshot: "body > div > ..." is an element, not the page.
      if (!o.selector || o.selector === "document" || /^(html|body|head)(\s*>\s*title)?$/.test(o.selector)) await page.screenshot({ path: file, timeout: 3000 });
      else {
        // The element with 32 px around it, so that the picture shows the background and the neighbors.
        const loc = page.locator(o.selector).first();
        await loc.scrollIntoViewIfNeeded({ timeout: 1500 });
        const box = await loc.boundingBox({ timeout: 1500 });
        const size = page.viewportSize() || { width: 1280, height: 900 };
        if (!box || box.width === 0 || box.height === 0) continue;
        // The box and the clip of a viewport screenshot are both relative to the viewport.
        const x = Math.max(0, box.x - 32), y = Math.max(0, box.y - 32);
        const clip = { x, y, width: Math.min(size.width - x, box.width + 64), height: Math.min(size.height - y, box.height + 64) };
        await page.screenshot({ path: file, clip, timeout: 3000, animations: "disabled" });
      }
      o.facts = { ...(o.facts || {}), screenshot: relative(outDir, file) };
      n++;
    } catch { /* the element is not visible, or it is gone */ }
  }
}

export async function runAudit(options: AuditOptions): Promise<AuditResult> {
  const { config, outDir } = options;
  const log = options.log || (() => {});
  const resumed = options.resume ? runToResume(outDir) : null;
  // A resumed run keeps its ID, its start, and its pages. Its time budget counts the time that the run used before.
  const usedBefore = resumed ? Math.max(0, ...resumed.lines.map((l) => l.elapsed)) * 1000 : 0;
  const startedAt = Date.now() - usedBefore;
  const started = resumed ? new Date(resumed.state.started) : new Date();
  // The run ID has seconds, so that two audits in one minute, for example a short check after an audit, stay apart.
  const run = resumed ? resumed.state.run : started.toISOString().slice(0, 19) + "Z";
  const date = started.toISOString().slice(0, 10);
  const only = resumed ? resumed.state.only : options.only;
  const kind = resumed ? resumed.state.kind : options.kind;
  if (resumed) log(`resume of the run ${run}: ${resumed.lines.length} addresses done, ${Math.round(usedBefore / 1000)} s used`);
  let stopping = false;
  const onStop = () => { if (!stopping) { stopping = true; log("stop: the open pages finish, then the audit writes the results"); } };
  options.signal?.addEventListener("abort", onStop);
  if (options.signal?.aborted) onStop();
  const widths = config.crawl.widths;
  const first = widths[0];
  const last = widths[widths.length - 1];
  const base = config.site.url + "/";
  const maxPages = Math.min(options.maxPages || Infinity, config.crawl.max_pages, config.budgets.max_pages);
  const sampleLimit = options.sampleLimit ?? 60;
  const concurrency = Math.max(1, options.concurrency ?? config.budgets.concurrency);
  const limiter = new RateLimiter(config.crawl.rate_limit);
  const runDir = join(outDir, "runs", run.replace(/:/g, "-"));
  const shotDir = join(runDir, "screenshots");
  mkdirSync(shotDir, { recursive: true });
  // The pages go to runs/<run>/pages.partial.jsonl as they finish, so that a stop or a crash keeps them.
  const partialPath = join(runDir, "pages.partial.jsonl");
  const writeState = (finished: boolean) => writeFileSync(join(runDir, "state.json"), JSON.stringify({ run, started: started.toISOString(), ...(only ? { only } : {}), ...(kind ? { kind } : {}), finished, stopped: stopping } satisfies RunState, null, 1) + "\n");
  if (!resumed) writeFileSync(partialPath, "");
  writeState(false);
  const shoot = (page: import("playwright").Page, outcomes: Outcome[]) => shootQuestions(page, outcomes, outDir, shotDir);
  const frontier = newFrontier();
  const seedStats = await seed(config, frontier, limiter, only);
  // The count from each source, then what the rules left, so that a person can check the discovery.
  const fromApis = seedStats.apis.reduce((n, a) => n + a.addresses, 0);
  log(`sources: ${seedStats.settings} from the settings, ${seedStats.sitemapAddresses} from ${seedStats.sitemapFiles} sitemap files${seedStats.apis.length ? `, ${fromApis} from ${seedStats.apis.length} WordPress APIs` : ""}`);
  for (const a of seedStats.apis) log(`  API ${pageKey(config.site.url, a.url)}: ${a.addresses} addresses`);
  for (const g of frontier.groupChoices) log(`  address group ${g.pattern}: ${g.chosen} of ${g.found} addresses chosen, order "${g.order}"`);
  const notCrawled = Object.entries(seedStats.skipped).map(([r, n]) => `${r} ${n}`).join(", ");
  log(`${queuedCount(frontier)} addresses to start (${seedStats.queued.settings} from the settings, ${seedStats.queued.sources} from the sitemaps and the API)${notCrawled ? ", not crawled: " + notCrawled : ""}, ${seedStats.repeated} repeated or not permitted, ${concurrency} workers`);

  const browser = await launch();
  const browserVersion = "Chromium " + browser.version();
  const login = config.login.method === "storage_state" ? storageStateFor(config.login.roles?.[0]?.secret_name) : {};
  if (login.warning) log(`login: ${login.warning}`);
  const contextOptions = login.path ? { storageState: login.path } : {};
  const contexts = new Map<number, Awaited<ReturnType<typeof browser.newContext>>>();
  for (const w of widths) contexts.set(w, await browser.newContext({ viewport: { width: w, height: 900 }, ...contextOptions }));
  const pages: PageRecord[] = [];
  const siteFacts = new Map<string, SiteFacts>();
  const budgetReached: ("pages" | "time" | "states" | "questions" | "issues" | "stopped")[] = [];
  let renders = 0;
  let statesTested = 0;
  // The states outside the state phase: the cookie banner open, once for each template, and the dry submits. They count in statesTested too.
  let bannerStates = 0;
  let formStates = 0;
  let bannerRan = false;
  const siteLang = config.site.languages?.[0] || null;

  // The sample: the required parts come from the settings and the common pages. The random part and the technology part have the limit.
  // The key of a page of the settings, with no trailing slash. A page of another host keeps its origin, so the paths of two hosts stay apart.
  const pathKey = (u: string) => { try { const x = new URL(u, base); return (x.host === new URL(base).host ? "" : x.origin) + x.pathname.replace(/\/$/, "") + x.search; } catch { return u; } };
  const required = new Map<string, string>();
  for (const p of only || []) required.set(pathKey(p), "settings");
  for (const p of config.crawl.sample_pages) required.set(pathKey(p), "settings");
  for (const t of config.crawl.templates) if (t.example_page) required.set(pathKey(t.example_page), "template example");
  for (const p of config.interaction.processes) for (const s of p.steps) required.set(pathKey(s.page), "process");
  const templateSeen = new Set(config.crawl.templates.filter((t) => t.example_page).map((t) => t.name));
  const technologySeen = new Set<string>();
  let extraSample = 0;
  const sampleReasonFor = (url: string, template: string | null): string | null => {
    const r = required.get(pathKey(url));
    if (r) return r;
    if (isCommonPage(url)) return "common page";
    if (template && !templateSeen.has(template)) { templateSeen.add(template); return "template"; }
    if (extraSample < sampleLimit && parseInt(sha(url + run).slice(0, 8), 16) / 0xffffffff < config.crawl.random_sample_share) { extraSample++; return "random"; }
    return null;
  };
  const candidatesOf = new Map<PageRecord, { width: number; states: StateAction[] }[]>();
  // The forms of each sample page for the dry submit. A page with no form has an empty list, and counts as tested.
  const formsOf = new Map<PageRecord, FormCandidate[]>();
  const bannerTested = new Set<string>();
  const siteOrigin = new URL(base).origin;
  const key = (u: string) => pageKey(config.site.url, u);
  // The addresses that a worker opened or that a redirect reached: each page is tested once, whatever the address that led to it.
  const claimed = new Set<string>();
  // A page that the canonical check removed, with its canonical address. When the canonical address redirects back to it, the page is tested.
  const copyOf = new Map<string, string>();
  // Each address that redirects, with its target: an old address that redirects now is gone, for the issues of the last audit.
  const redirected = new Map<string, string>();
  let errorPageTested = false;
  // The record that each address gave, and the records that a redirect or the canonical check removed, for runs/<run>/pages.partial.jsonl.
  const recordOf = new Map<string, PageRecord>();
  const dropped = new Set<PageRecord>();
  /** Writes one finished address to runs/<run>/pages.partial.jsonl. An address that a budget stopped is not written: a resume tests it. */
  const persist = (address: string) => {
    const record = recordOf.get(address);
    // An address that gave no record, for example one that a redirect had reached already, needs no line.
    if (!record) return;
    recordOf.delete(address);
    const kept = !dropped.has(record) ? record : undefined;
    if (kept && (kept.not_tested_reason === "time budget" || kept.not_tested_reason === "page limit")) return;
    const line: PartialLine = { address, claimed: [...new Set([address, ...(kept ? [kept.url] : [])])], elapsed: Math.round((Date.now() - startedAt) / 100) / 10,
      ...(kept ? { record: toLine(kept), siteFacts: siteFacts.get(kept.url), candidates: candidatesOf.get(kept), forms: formsOf.get(kept) } : {}) };
    try { appendFileSync(partialPath, JSON.stringify(line) + "\n"); } catch (e) { log(`  could not save the page: ${(e as Error).message}`); }
  };

  /** After the first load, or after a quick check: is the address a page of the site to test? "out": a page record that is not
   *  tested, with the reason. "drop": no page record, because the redirect reached a page that another address gave. "unknown": a
   *  quick check that met a bot challenge, so nothing is known. A quick check that finds a page gives "test", and the page stays not
   *  tested, with its status. */
  const scopeAfterLoad = async (record: PageRecord, opened: Pick<Opened, "finalUrl" | "status" | "contentType" | "challenge">, errorTemplate: boolean, quick = false): Promise<"test" | "out" | "drop" | "unknown"> => {
    const url = record.url;
    const final = normalizeUrl(config, opened.finalUrl || url, url) || url;
    const moved = final !== url;
    if (moved) redirected.set(url, final);
    const where = quick ? `  quick check ${key(url)}: ` : "  ";
    const out = (reason: NotTestedReason, detail?: string) => {
      record.not_tested_reason = reason;
      if (moved) record.redirects_to = final;
      // The sitemap file or the API that gave the address, so that a person can correct the source.
      const source = frontier.foundIn.get(url);
      if (source && !inScope(record)) record.found_in = key(source);
      log(`${where}not tested: ${reason}${moved ? ", redirects to " + final : ""}${detail ? " (" + detail + ")" : ""}`);
      return "out" as const;
    };
    if (moved && !isPermitted(config, final)) return out("redirects off site");
    if (moved && (isSkipped(config, final) || (config.crawl.obey_robots && robotsDisallows(await robotsFor(frontier, final, limiter), pathOf(final))))) {
      frontier.skipped.push({ url, reason: "skipped after redirect" });
      return out("skipped after redirect");
    }
    const status = opened.status || 0;
    if (opened.challenge || status === 429) return quick ? "unknown" : out("blocked", `status ${status}`);
    if (status === 401) return out("permission");
    if (status >= 400 && status < 500) {
      const from = frontier.linkedFrom.get(url);
      if (from?.length) record.linked_from = from.map(key);
      // The error template is tested once: the error page of the settings, or one broken link after the crawl. The other errors are broken links.
      const errorPage = !quick && (status === 404 || status === 410) && (errorTemplate || required.has(pathKey(url)) || required.has(pathKey(final)));
      if (!errorPage) return out("broken link", `status ${status}`);
      errorPageTested = true;
    }
    if ((opened.contentType && !/html/i.test(opened.contentType)) || FILE_ADDRESS.test(pathOf(final))) return out("not a page", opened.contentType || "file");
    if (moved) {
      if (claimed.has(final) && copyOf.get(final) !== url) {
        frontier.skipped.push({ url, reason: "redirects to a page that the audit tests" });
        log(`${where}redirects to ${final}, a page that the audit tests`);
        return "drop";
      }
      claimed.add(final); copyOf.delete(final); frontier.seen.add(final);
      record.facts.redirectedFrom = url;
      record.url = final; record.template = templateOf(config, final); record.set = setOf(config, final);
    }
    return "test";
  };

  const auditOne = async (address: string, opts: { errorTemplate?: boolean } = {}) => {
    let url = address;
    if (!opts.errorTemplate) { if (claimed.has(url)) return; claimed.add(url); }
    // robots.txt of another permitted host: read on the first visit to that host.
    if (config.crawl.obey_robots && new URL(url).origin !== siteOrigin && robotsDisallows(await robotsFor(frontier, url, limiter), pathOf(url))) { frontier.skipped.push({ url, reason: "robots" }); return; }
    const record: PageRecord = { url, template: templateOf(config, url), set: setOf(config, url), sample: false, tested: false, testedCriteria: {}, outcomes: [], links: [], renders: 0, facts: {}, states: [] };
    pages.push(record);
    recordOf.set(address, record);
    const elapsed = (Date.now() - startedAt) / 60000;
    // The page limit counts the pages that the audit opened: an address that a budget left is not a page that the audit tested.
    // An address that a budget leaves is not claimed: the quick check and a redirect from another address can still reach it.
    if (pages.filter((p) => inScope(p) && !(p.not_tested_reason && NOT_OPENED.has(p.not_tested_reason))).length > maxPages) { record.not_tested_reason = "page limit"; claimed.delete(url); if (!budgetReached.includes("pages")) budgetReached.push("pages"); return; }
    // The pages get 85% of the time budget. The quick check, the states, and the processes get the rest.
    if (elapsed > config.budgets.time_budget_minutes * (options.shares?.pages ?? 0.85) && !opts.errorTemplate) { record.not_tested_reason = "time budget"; claimed.delete(url); if (!budgetReached.includes("time")) budgetReached.push("time"); return; }
    log(`page ${pages.length}: ${url}`);
    const candidates: { width: number; states: StateAction[] }[] = [];
    const imagesMeasured = new Set<string>();
    for (const w of widths) {
      await limiter.wait();
      let opened = await openPage(contexts.get(w)!, url, config);
      renders++; record.renders++;
      if (!opened.ok && (/Timeout/.test(opened.error || "") || TRANSIENT_NETWORK_ERROR.test(opened.error || ""))) {
        // A load that ran into the time limit gets one more try. So does a load that a short network fault stopped, for example a
        // change of the network of the audit machine, after a pause.
        await opened.page.close();
        if (!/Timeout/.test(opened.error || "")) { log(`  network error at ${w}, one more try in ${NETWORK_RETRY_PAUSE / 1000} s: ${opened.error?.split("\n")[0]}`); await new Promise((r) => setTimeout(r, NETWORK_RETRY_PAUSE)); }
        await limiter.wait();
        opened = await openPage(contexts.get(w)!, url, config);
        renders++; record.renders++;
      }
      if (!opened.ok) {
        await opened.page.close();
        // A file that the browser downloads, for example a PDF at an address with no extension, is not a page.
        if (w === first && /download is starting/i.test(opened.error || "")) { record.not_tested_reason = "not a page"; log("  not tested: not a page (a download)"); return; }
        record.facts.loadError = opened.error;
        if (!record.tested) { record.not_tested_reason = "did not load"; log(`  did not load at ${w}: ${opened.error}`); break; }
        // The page loaded at an earlier width: it stays tested there, and the widths that did not load are listed.
        record.widths_not_loaded = [...(record.widths_not_loaded || []), w];
        log(`  did not load at ${w}: ${opened.error}. The page is tested at the other widths`);
        continue;
      }
      record.http_status = opened.status;
      if (opened.loadIncomplete) {
        record.facts.loadIncomplete = [...((record.facts.loadIncomplete as number[] | undefined) || []), w];
        log(`  the load event did not come in ${config.crawl.load_wait_seconds ?? LOAD_WAIT_SECONDS} s at ${w}: the page is tested as it is`);
      }
      if (w === first) {
        const scope = await scopeAfterLoad(record, opened, !!opts.errorTemplate);
        if (scope !== "test") { await opened.page.close(); if (scope === "drop") { pages.splice(pages.indexOf(record), 1); dropped.add(record); } return; }
        url = record.url;
        // The sample, after the load: an address that is not a page of the site takes no place in it.
        const reason = opts.errorTemplate ? "error page" : sampleReasonFor(url, record.template);
        if (reason) { record.sample = true; record.sampleReason = reason; log(`  sample: ${reason}`); }
      }
      const tested = new Set<string>();
      const { page } = opened;
      try {
        if (w === first) {
          const facts = await pageFacts(page);
          record.title = facts.title; record.lang = facts.lang; record.content_hash = facts.hash; record.links = facts.links;
          // A page whose canonical link points to another permitted page is a copy of that page.
          // Not for an error page, and not for a page that the settings ask for: an error page often names the home page as its canonical.
          const canonical = facts.canonical ? normalizeUrl(config, facts.canonical, url) : null;
          const wanted = opts.errorTemplate || required.has(pathKey(url)) || required.has(pathKey(address)) || (record.http_status || 0) >= 400;
          if (canonical && !wanted && !sameUrl(canonical, url) && isPermitted(config, canonical) && !isSkipped(config, canonical) && !only
            && !(config.crawl.obey_robots && robotsDisallows(await robotsFor(frontier, canonical, limiter), pathOf(canonical)))) {
            pages.splice(pages.indexOf(record), 1);
            dropped.add(record);
            frontier.skipped.push({ url, reason: "copy of the canonical page" });
            copyOf.set(url, canonical);
            offer(config, frontier, canonical, url, { tier: 1 });
            return;
          }
          // The contrast of the letters of a transparent image of text, right after the load: a slideshow changes its slides some
          // seconds later, and then the image is hidden or moves. A second run after the other tests measures the images that came later.
          record.outcomes.push(...(await runImageTextContrastTest(page, url, w, [], imagesMeasured)));
          await page.evaluate("window.scrollTo(0, 0)").catch(() => {});
          siteFacts.set(url, await collectSiteFacts(page));
          if (!only) for (const l of [...facts.links, ...facts.alternates]) offer(config, frontier, l, url, { tier: 2, from: url });
          record.facts.technologies = facts.technologies;
          // A page with a technology that the sample does not have yet for this template joins the sample.
          const owner = record.template || "";
          const newTech = facts.technologies.filter((t) => !technologySeen.has(owner + "|" + t));
          for (const t of newTech) technologySeen.add(owner + "|" + t);
          if (!record.sample && newTech.length && extraSample < sampleLimit) { extraSample++; record.sample = true; record.sampleReason = "technology: " + newTech.join(", "); }
        }
        const pageLang = record.lang || siteLang;
        if (w === first) record.outcomes.push(...(await runUpdateWatch(page, url, w, [])));
        // The contrast questions that axe-core could not decide get a measurement of the pixels.
        const axeOutcomes = await decideContrastQuestions(page, await runAxe(page, url, w, []));
        for (const c of AXE_TESTED_CRITERIA) tested.add(c);
        // The own target test skips the elements that axe-core failed, and decides the elements that axe-core could not.
        const own = await runPageTests(page, url, w, [], pageLang, axeOutcomes.filter((o) => o.rule === "target-size" && o.kind === "failed").map((o) => o.selector));
        record.outcomes.push(...(await dropTargetQuestions(page, axeOutcomes, own.outcomes)), ...own.outcomes);
        if (w === first) Object.assign(record.facts, own.facts);
        for (const c of PAGE_TEST_CRITERIA) tested.add(c);
        // The images of text look the same at every width: one pass at the first width, and the criterion counts as tested at all.
        if (w === first) {
          record.outcomes.push(...(await runImageTextContrastTest(page, url, w, [], imagesMeasured)));
          record.outcomes.push(...(await runImageOfTextTest(page, url, w, [])));
          tested.add("1.4.5");
        }
        // The forms for the dry submit, before the operate tests change the page.
        if (record.sample && w === first && config.interaction.dry_submit) formsOf.set(record, await findForms(page));
        if (record.sample && (w === first || w === last)) {
          // The controls of the states, before the focus pass and the operate tests change the page: the state phase opens a new render.
          if (config.interaction.max_states_per_page > 0) candidates.push({ width: w, states: await findStates(page, config, config.interaction.max_states_per_page) });
          // The focus pass runs at the smallest and the largest width.
          record.outcomes.push(...(await runFocusTests(page, url, w, [], opened.blocked)));
          for (const c of FOCUS_TEST_CRITERIA) tested.add(c);
          if (w === first) {
            record.outcomes.push(...(await runListenerTest(page, url, w, [])));
            for (const c of LISTENER_TEST_CRITERIA) tested.add(c);
            record.outcomes.push(...(await runOperateTests(page, config, url, w, [], opened.blocked)));
            for (const c of OPERATE_TEST_CRITERIA) tested.add(c);
          }
        }
        await shoot(page, record.outcomes.filter((o) => o.url === url && o.width === w));
        record.outcomes.push(...(await runSpacing(page, url, w, [])));
        tested.add("1.4.12");
        record.tested = true;
      } catch (e) {
        log(`  test error at ${w}: ${(e as Error).message.split("\n")[0]}`);
      } finally {
        await page.close();
      }
      record.testedCriteria[w] = tested;
    }
    if (!record.tested) return;

    // The states of the page run in their own phase after the pages, in a fixed order, so that two audits test the same states.
    if (candidates.length) candidatesOf.set(record, candidates);

    // The cookie banner open: the non-interference tests, once for each template, in a new context so that the banner shows.
    const owner = record.template || url;
    if (record.sample && config.crawl.cookie_banner && !bannerTested.has(owner)) {
      bannerTested.add(owner);
      const context = await browser.newContext({ viewport: { width: first, height: 900 }, ...contextOptions });
      try {
        await limiter.wait();
        const opened = await openPage(context, url, config, { closeBanner: false });
        renders++; record.renders++;
        if (opened.ok && (await bannerVisible(opened.page, config))) {
          const state = ["cookie banner open"];
          const outcomes: Outcome[] = [];
          outcomes.push(...(await runUpdateWatch(opened.page, url, first, state)));
          outcomes.push(...(await runPageTests(opened.page, url, first, state, record.lang || siteLang)).outcomes.filter((o) => NON_INTERFERENCE.has(o.criterion)));
          outcomes.push(...(await runFocusTests(opened.page, url, first, state, opened.blocked, { limit: 30 })).filter((o) => NON_INTERFERENCE.has(o.criterion)));
          record.outcomes.push(...newOnly(record, first, outcomes));
          record.states.push({ id: `S${record.states.length + 1}`, actions: state });
          statesTested++; bannerStates++;
          bannerRan = true;
        }
      } catch (e) {
        log(`  banner state error: ${(e as Error).message.split("\n")[0]}`);
      } finally {
        await context.close();
      }
    }

    try {
      record.outcomes.push(...(await runReflow(browser, config, url, contextOptions))); renders++; record.renders++;
      record.outcomes.push(...(await runZoom(browser, config, url, last, contextOptions))); renders++; record.renders++;
      record.testedCriteria[first]?.add("1.4.10");
      record.testedCriteria[last]?.add("1.4.4");
      for (const o of record.outcomes) if (o.rule === "no-reflow") o.width = first;
      for (const c of LAYOUT_TEST_CRITERIA) for (const w of widths) if (c !== "1.4.10" && c !== "1.4.4") record.testedCriteria[w]?.add(c);
      if (record.testedCriteria[first]?.has("1.4.5")) for (const w of widths) record.testedCriteria[w]?.add("1.4.5");
    } catch (e) {
      log(`  layout error: ${(e as Error).message.split("\n")[0]}`);
    }
  };

  // The workers take addresses from the frontier until it is empty and no worker is busy.
  let active = 0;
  const worker = async () => {
    for (;;) {
      // After a stop, no worker takes a new address. The open pages finish.
      if (stopping) return;
      const url = nextAddress(frontier);
      if (url === undefined) {
        if (active === 0) return;
        await new Promise((r) => setTimeout(r, 250));
        continue;
      }
      active++;
      try { await auditOne(url); persist(url); } catch (e) { log(`  page error at ${url}: ${(e as Error).message.split("\n")[0]}`); } finally { active--; }
    }
  };

  // The state phase: each planned state is tested or not applied, with the reason.
  let statesPlanned = 0;
  const statesNotApplied = new Map<NotApplied, number>();
  const notApplied = (record: PageRecord, w: number, s: StateAction, reason: NotApplied, detail?: string) => {
    statesNotApplied.set(reason, (statesNotApplied.get(reason) || 0) + 1);
    log(`  state not applied (${reason}): ${key(record.url)} at ${w}, ${s.label}${detail ? ": " + detail : ""}`);
  };

  /** One state of one page: its own render, the action, then the rule engine, the page tests, and a focus pass. */
  const runStateJob = async (record: PageRecord, w: number, s: StateAction) => {
    await limiter.wait();
    const opened = await openPage(contexts.get(w)!, record.url, config);
    renders++; record.renders++;
    if (!opened.ok || opened.challenge) { await opened.page.close(); notApplied(record, w, s, "page did not open", opened.challenge ? "bot challenge" : opened.error); return; }
    try {
      const applied = await applyState(opened.page, s);
      if (!applied.ok) { notApplied(record, w, s, applied.reason || "no change"); return; }
      const state = [s.label];
      const outcomes: Outcome[] = [];
      const axe = await decideContrastQuestions(opened.page, await runAxe(opened.page, record.url, w, state));
      const own = await runPageTests(opened.page, record.url, w, state, record.lang || siteLang, axe.filter((o) => o.rule === "target-size" && o.kind === "failed").map((o) => o.selector));
      outcomes.push(...(await dropTargetQuestions(opened.page, axe, own.outcomes)), ...own.outcomes);
      outcomes.push(...(await runFocusTests(opened.page, record.url, w, state, opened.blocked, { limit: 50, dialog: applied.dialog })));
      const fresh = newOnly(record, w, outcomes);
      await shoot(opened.page, fresh);
      record.outcomes.push(...fresh);
      record.states.push({ id: `S${record.states.length + 1}`, actions: state });
      statesTested++;
    } catch (e) {
      notApplied(record, w, s, "error", (e as Error).message.split("\n")[0]);
    } finally {
      await opened.page.close();
    }
  };

  let processRuns: ProcessRun[] = [];
  const dryRuns: DryRun[] = [];
  // A resume: the pages of the partial file come back as they were at the end of the crawl phase. Their links go into the frontier
  // again, and the workers skip each address that the run already finished.
  if (resumed) {
    const last = new Map(resumed.lines.map((l) => [l.address, l]));
    for (const l of last.values()) {
      for (const c of l.claimed) claimed.add(c);
      if (!l.record) continue;
      const r = fromLine(l.record);
      pages.push(r);
      renders += r.renders || 0;
      if (l.siteFacts) siteFacts.set(r.url, l.siteFacts);
      if (l.candidates?.length) candidatesOf.set(r, l.candidates);
      if (l.forms) formsOf.set(r, l.forms);
      if (r.sample && r.sampleReason === "template" && r.template) templateSeen.add(r.template);
      if (r.sample && (r.sampleReason === "random" || r.sampleReason?.startsWith("technology"))) extraSample++;
      for (const t of (r.facts.technologies as string[] | undefined) || []) technologySeen.add((r.template || "") + "|" + t);
      if (r.states.some((st) => st.actions.includes("cookie banner open"))) { bannerTested.add(r.template || r.url); bannerRan = true; statesTested++; bannerStates++; }
      if (r.tested && (r.http_status === 404 || r.http_status === 410)) errorPageTested = true;
      if (typeof r.facts.redirectedFrom === "string") redirected.set(r.facts.redirectedFrom, r.url);
      if (r.redirects_to) redirected.set(r.url, r.redirects_to);
    }
    if (!only) for (const r of pages) for (const l of r.links) offer(config, frontier, l, r.url, { tier: 2, from: r.url });
    log(`${pages.length} pages back from the partial file, ${queuedCount(frontier)} addresses in the frontier`);
  }

  try {
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    if (stopping) {
      // The addresses that the audit did not open get a page record with the reason "stopped". A resume tests them.
      let left = 0;
      for (let u = nextAddress(frontier); u !== undefined; u = nextAddress(frontier)) {
        if (claimed.has(u)) continue;
        pages.push({ url: u, template: templateOf(config, u), set: setOf(config, u), sample: false, tested: false, not_tested_reason: "stopped", testedCriteria: {}, outcomes: [], links: [], renders: 0, facts: {}, states: [] });
        left++;
      }
      budgetReached.push("stopped");
      log(`stopped: ${pages.filter((p) => p.tested).length} pages tested, ${left} addresses not opened`);
    }

    // The addresses that a budget left. One that differs from an opened address only by the trailing slash is that page: its record goes.
    if (!stopping && !only) {
      const openedKeys = new Set(pages.filter((p) => !notOpened(p) && inScope(p)).map((p) => p.url.replace(/\/$/, "")));
      const copies = pages.filter((p) => notOpened(p) && openedKeys.has(p.url.replace(/\/$/, "")));
      for (const p of copies) { pages.splice(pages.indexOf(p), 1); frontier.skipped.push({ url: p.url, reason: "copy of an opened address" }); }
      if (copies.length) log(`${copies.length} addresses that the audit did not open differ from an opened page only by the trailing slash: their records go`);
      // The quick check: one request with no browser for each address that is left, until 90% of the time budget. It finds the
      // redirects, the broken links, and the files, so that only the pages stay "not tested". A bot challenge leaves the address unknown.
      const left = pages.filter(notOpened);
      if (left.length) {
        log(`quick check of ${left.length} addresses that the audit did not open`);
        const follow = (from: string) => (next: string) => {
          const n = normalizeUrl(config, next, from);
          return !!n && isPermitted(config, n) && !isSkipped(config, n) && !FILE_ADDRESS.test(pathOf(n)) && !claimed.has(n)
            && !(config.crawl.obey_robots && new URL(n).origin === siteOrigin && robotsDisallows(frontier.robots, pathOf(n)));
        };
        const results = new Map<string, number>();
        const count = (what: string) => results.set(what, (results.get(what) || 0) + 1);
        let nextQuick = 0;
        const quickWorker = async () => {
          for (;;) {
            if (stopping || nextQuick >= left.length || (Date.now() - startedAt) / 60000 > config.budgets.time_budget_minutes * (options.shares?.quick ?? 0.9)) return;
            const record = left[nextQuick++];
            if (claimed.has(record.url)) { pages.splice(pages.indexOf(record), 1); frontier.skipped.push({ url: record.url, reason: "redirects to a page that the audit tests" }); count("copy of a page"); continue; }
            const answer = await quickCheck(record.url, limiter, follow(record.url)).catch(() => null);
            if (!answer) { count("no answer"); continue; }
            const kept = record.not_tested_reason;
            const scope = await scopeAfterLoad(record, answer, false, true);
            if (scope === "unknown") { count("bot challenge"); continue; }
            if (scope === "drop") { pages.splice(pages.indexOf(record), 1); count("copy of a page"); continue; }
            record.http_status = answer.status;
            if (scope === "test") { record.not_tested_reason = kept; count("page"); } else count(record.not_tested_reason || "page");
          }
        };
        await Promise.all(Array.from({ length: concurrency }, () => quickWorker()));
        const unchecked = left.length - nextQuick;
        log(`quick check: ${[...results].map(([w, n]) => `${w} ${n}`).join(", ")}${unchecked ? `, ${unchecked} not checked before 90% of the time budget` : ""}`);
      }
    }

    // The error template: when the settings name no error page, one broken link is tested as the error page, the first by its address.
    if (!stopping && !errorPageTested && !only && (Date.now() - startedAt) / 60000 < config.budgets.time_budget_minutes) {
      const broken = pages.filter((p) => p.not_tested_reason === "broken link" && (p.http_status === 404 || p.http_status === 410)).sort((a, b) => a.url.localeCompare(b.url))[0];
      if (broken) {
        pages.splice(pages.indexOf(broken), 1);
        try { await auditOne(broken.url, { errorTemplate: true }); } catch (e) { log(`  page error at ${broken.url}: ${(e as Error).message.split("\n")[0]}`); }
      }
    }

    // The state phase. The example page of a template goes first, then the other pages in the order of their addresses.
    // A state that another page of the same template gave is not repeated, so the set of tested states is the same in two audits.
    const first_ = (p: PageRecord) => (p.sampleReason === "template example" || p.sampleReason === "template" ? "0" : "1") + p.url;
    const seenStates = new Set<string>();
    const jobs: { record: PageRecord; width: number; state: StateAction }[] = [];
    for (const p of [...candidatesOf.keys()].sort((a, b) => first_(a).localeCompare(first_(b)))) {
      const owner = p.template || p.url;
      let n = 0;
      for (const { width: w, states } of candidatesOf.get(p)!) {
        for (const s of states) {
          const key = `${owner}|${s.item}`;
          if (seenStates.has(key) || n >= config.interaction.max_states_per_page) continue;
          seenStates.add(key); n++;
          jobs.push({ record: p, width: w, state: s });
        }
      }
    }
    if (stopping) jobs.length = 0;
    else log(`${jobs.length} states on ${candidatesOf.size} pages`);
    statesPlanned = jobs.length;
    const testedBefore = statesTested;
    let next = 0;
    const stateWorker = async () => {
      for (;;) {
        if (next >= jobs.length) return;
        const job = jobs[next];
        if (stopping) return;
        if ((Date.now() - startedAt) / 60000 > config.budgets.time_budget_minutes) { if (!budgetReached.includes("time")) budgetReached.push("time"); return; }
        next++;
        try { await runStateJob(job.record, job.width, job.state); } catch (e) { notApplied(job.record, job.width, job.state, "error", (e as Error).message.split("\n")[0]); }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, () => stateWorker()));
    // The states that a budget or a stop left: not applied, with that reason.
    const left = jobs.length - next;
    if (left > 0) statesNotApplied.set(stopping ? "stopped" : "time budget", (statesNotApplied.get(stopping ? "stopped" : "time budget") || 0) + left);
    if (jobs.length) log(`states: ${statesTested - testedBefore} of ${jobs.length} tested${statesNotApplied.size ? ", not applied: " + [...statesNotApplied].map(([r, n]) => `${r} ${n}`).join(", ") : ""}`);

    // The dry submits, after the states, in the same order. A form that another page gave is not repeated. See FORMS.md.
    const seenForms = new Set<string>();
    const dryJobs: { record: PageRecord; form: FormCandidate }[] = [];
    for (const p of [...formsOf.keys()].sort((a, b) => first_(a).localeCompare(first_(b)))) {
      for (const f of formsOf.get(p)!) {
        if (seenForms.has(f.signature)) continue;
        seenForms.add(f.signature);
        dryJobs.push({ record: p, form: f });
      }
    }
    if (dryJobs.length) log(`${dryJobs.length} forms for the dry submit`);
    let nextDry = 0;
    const dryWorker = async () => {
      for (;;) {
        const job = dryJobs[nextDry++];
        if (!job || stopping) return;
        if ((Date.now() - startedAt) / 60000 > config.budgets.time_budget_minutes) { if (!budgetReached.includes("time")) budgetReached.push("time"); return; }
        try {
          const r = await runDrySubmit(browser, config, job.record, first, job.form, { contextOptions, limiter, siteLang, shoot });
          dryRuns.push(r);
          renders += r.renders;
          statesTested += r.states; formStates += r.states;
          log(`  dry submit ${pathOf(job.record.url)} '${job.form.name}': ${r.submissions.map((s) => `${s.variant} ${s.kind}${s.blocked.length ? ` (${s.blocked.length} blocked)` : ""}`).join(", ")}${r.error ? " - " + r.error : ""}`);
        } catch (e) {
          log(`  dry submit error at ${job.record.url}: ${(e as Error).message.split("\n")[0]}`);
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, () => dryWorker()));
    // A sample page counts as tested for the form criteria, unless one of its forms checks on the server only or did not run.
    // A form that is hidden in a new render shows only after an action or a delay, as a form in a closed dialog: it does not count.
    const formResult = new Map(dryRuns.map((r) => [r.form.signature, r]));
    for (const [p, forms] of formsOf) {
      if (!p.tested) continue;
      if (forms.some((f) => { const r = formResult.get(f.signature); return !r || (!r.tested && !r.hidden) || r.serverOnly; })) continue;
      for (const c of DRY_SUBMIT_CRITERIA) p.testedCriteria[first]?.add(c);
    }

    // The site tests, on all pages together.
    const siteOutcomes = runSiteTests(pages, siteFacts, frontier.sitemapUrls, first, { siteUrl: config.site.url, skipped: frontier.skipped, robots: frontier.robots });
    for (const o of siteOutcomes) pages.find((p) => p.url === o.url)?.outcomes.push(o);
    for (const p of pages) if (p.tested) for (const c of SITE_TEST_CRITERIA) p.testedCriteria[first]?.add(c);
    // The processes, after the pages, so that their outcomes do not repeat the outcomes of the pages.
    if (!stopping) processRuns = await runProcesses(browser, config, first, pages, limiter, log, shoot);
    renders += processRuns.reduce((n, r) => n + r.renders, 0);
  } finally {
    await browser.close();
  }

  const processPages = processRuns.flatMap((r) => r.records);
  const all = [...pages, ...processPages];
  const existingIssues = loadExisting(outDir, "issues");
  const existingQuestions = loadExisting(outDir, "questions");
  // The last run before this one. A resumed run that a stop ended is in the history already.
  const previous = (readHistory(outDir) as Record<string, any>[]).filter((h) => h.run !== run).pop() || null;
  const versions = { engine: ENGINE_VERSION, axe_core: AXE_VERSION, browser: browserVersion };
  // A baseline audit: the first one in the results folder, or one after a change of the engine versions. Issues that disappear in it are not fixes.
  const baseline = !previous || previous.versions?.engine !== versions.engine || previous.versions?.axe_core !== versions.axe_core;
  // A page is gone when it gives 404 or 410 now and did not in the last run. The error page of the settings always gives 404.
  const previousStatus = new Map<string, number>();
  try { for (const line of readFileSync(join(outDir, "pages.jsonl"), "utf8").split("\n")) { if (!line) continue; const p = JSON.parse(line); if (p.http_status && !p.redirects_to) previousStatus.set(key(p.url), p.http_status); } } catch { /* the first run */ }
  // A page of the last audit is gone when it gives 404 or 410 now, or when its address redirects now.
  const wasPage = (u: string) => previousStatus.has(key(u)) && (previousStatus.get(key(u)) || 0) < 400;
  const gone = new Set([...pages.filter((p) => (p.http_status === 404 || p.http_status === 410) && wasPage(p.url)).map((p) => key(p.url)), ...[...redirected.keys()].filter(wasPage).map(key)]);
  const context: CompareContext = {
    testedPaths: new Set(all.filter((p) => p.tested).map((p) => key(p.url))),
    samplePaths: new Set(all.filter((p) => p.tested && p.sample).map((p) => key(p.url))),
    gonePaths: gone,
    versions,
  };
  const questions = buildQuestions(all, config, existingQuestions);
  applyAnswers(all, config, questions);
  const issues = buildIssues(all, config, run, date, existingIssues, context);
  for (const i of issues) if (i.question) { const q = questions.find((x) => x.id === i.question); if (q) q.issue = i.id; }
  const decisions = loadDecisions(outDir, config.site.url);
  const aiOnly = new Map<string, number>();
  for (const q of questions) if (effectiveAnswer(q).by === "ai") aiOnly.set(q.criterion, (aiOnly.get(q.criterion) || 0) + 1);
  const issueCounts = new Map<string, number>();
  for (const i of issues) if (["new", "open", "reopened", "accepted"].includes(i.status)) issueCounts.set(i.wcag.criterion, (issueCounts.get(i.wcag.criterion) || 0) + 1);
  const questionCounts = new Map<string, number>();
  for (const q of questions) if (!effectiveAnswer(q).value) questionCounts.set(q.criterion, (questionCounts.get(q.criterion) || 0) + 1);
  const processesTested = processRuns.filter((r) => r.tested).length;
  const criteria = siteSummary(all, widths, { all: config.interaction.processes.length, tested: processesTested }, issueCounts, questionCounts, aiOnly, decisions);
  const durationSeconds = Math.round((Date.now() - startedAt) / 1000);
  const count = (s: string) => issues.filter((i) => i.status === s).length;
  // A replaced pair does not count as one resolved issue and one new issue.
  const replaced = new Set(issues.filter((i) => i.replaces).map((i) => i.replaces));
  const counts = { new: issues.filter((i) => i.status === "new" && !i.replaces).length, open: count("open"), resolved: issues.filter((i) => i.status === "resolved" && i.status_by.run === run && i.status_by.reason === "fixed" && !replaced.has(i.id)).length, resolved_rule_changed: issues.filter((i) => i.status === "resolved" && i.status_by.run === run && i.status_by.reason === "rule changed").length, reopened: count("reopened"), not_checked: count("not checked"), page_removed: count("page removed"), accepted: count("accepted"), dismissed: count("dismissed") };
  const tested = pages.filter((p) => p.tested);

  // The tests that did not run, with the reason.
  const testsNotRun: string[] = [];
  if (stopping) testsNotRun.push("the audit was stopped: the addresses that it did not open are pages with the reason \"stopped\", and the states, the dry submits, and the processes that had not run did not run. Run refact-a11y audit --resume to continue the run");
  if (!config.crawl.cookie_banner) testsNotRun.push("the non-interference tests with the cookie banner open: the settings have no banner selector");
  else if (!bannerRan) testsNotRun.push("the non-interference tests with the cookie banner open: no banner was visible on the sample pages");
  if (config.interaction.max_states_per_page === 0) testsNotRun.push("states: max_states_per_page is 0");
  if (!config.interaction.dry_submit) testsNotRun.push("dry submit: dry_submit is false in the settings. The form tests (3.3.1, 3.3.3) run in the processes only");
  for (const r of [...dryRuns].sort((a, b) => a.url.localeCompare(b.url))) {
    const where = `the form '${r.form.name}' on ${key(r.url)}`;
    if (r.serverOnly) testsNotRun.push(`dry submit: ${where} checks its fields on the server only. Its errors and its success message need a process on staging`);
    else if (r.unchanged) testsNotRun.push(`dry submit: ${where} did not change after the submission`);
    else if (r.hidden) testsNotRun.push(`dry submit: ${where} shows only after an action or a delay, for example in a popup. The dry submit skipped it`);
    else if (!r.tested) testsNotRun.push(`dry submit: ${where} was not tested: ${r.error}`);
  }
  if (!config.interaction.processes.length) testsNotRun.push("processes: the settings have none. The success message of a form and the redundant entry test (3.3.7) run in the processes only");
  for (const r of processRuns) if (!r.tested) testsNotRun.push(`process ${r.name}: ${r.reason}`);
  if (config.interaction.processes.length && !processesTested) testsNotRun.push("the success message of a form and redundant entry (3.3.7): they run in the processes only");

  // A random page whose template tests differ from the example page of its template.
  const rulesOf = (p: PageRecord) => new Set(p.outcomes.filter((o) => o.kind === "failed" && TEMPLATE_CRITERIA.has(o.criterion)).map((o) => o.rule));
  const differences: TemplateDifference[] = [];
  for (const t of new Set(tested.map((p) => p.template).filter((x): x is string => !!x))) {
    const example = tested.find((p) => p.template === t && p.sample && (p.sampleReason === "template example" || p.sampleReason === "template"));
    if (!example) continue;
    const a = rulesOf(example);
    for (const other of tested.filter((p) => p.template === t && p.sample && p !== example && p.sampleReason === "random")) {
      const b = rulesOf(other);
      const onlyInPage = [...b].filter((x) => !a.has(x));
      const onlyInExample = [...a].filter((x) => !b.has(x));
      if (onlyInPage.length || onlyInExample.length) differences.push({ template: t, example: key(example.url), page: key(other.url), onlyInPage, onlyInExample });
    }
  }

  const coverage = { ...pageCoverage(pages), states_tested: statesTested, ...(statesPlanned ? { states_planned: statesPlanned, states_not_applied: Object.fromEntries(statesNotApplied) } : {}), ...(bannerStates ? { banner_states_tested: bannerStates } : {}), ...(formStates ? { form_states_tested: formStates } : {}), forms_tested: dryRuns.filter((r) => r.tested).length, processes_tested: processesTested, processes_not_tested: config.interaction.processes.length - processesTested, tests_not_run: testsNotRun, budget_reached: budgetReached };
  const processes = Object.fromEntries(processRuns.map((r) => [r.name, r.tested ? { tested: true, ...processSummary(r.records, [first]) } : { tested: false, reason: r.reason || "not tested" }]));
  const overview = buildOverview(all, widths, criteria, issues, decisions);
  const summary = { schema: "summary/1", site: config.site.url, run, date, standard: "WCAG 2.2", level: "AA", versions, baseline, counts, coverage, criteria, processes, overview };
  const byPage = issuesByPage(issues as { id: string; examples: { url: string }[] }[]);
  const pageFiles = all.map((p) => pageFileOf(p, run, p.process ? [first] : widths, decisions, byPage, config.site.url));
  const questionsAnswered = { ai: questions.filter((q) => q.ai_answer).length, person: questions.filter((q) => q.person_answer).length };
  const history = { schema: "history/1", run, started: started.toISOString(), duration_seconds: durationSeconds, kind: kind || "full", started_by: options.startedBy || "person", environment: config.site.environment, versions, baseline, counts, coverage, renders, questions_answered: questionsAnswered, overview: historyOverview(overview) };
  const notOpenedBySource = { settings: 0, sources: 0, links: 0 };
  for (const p of pages) if (notOpened(p)) { const t = frontier.tierOf.get(p.url) ?? 2; notOpenedBySource[t === 0 ? "settings" : t === 1 ? "sources" : "links"]++; }
  const report = renderReport({ config, run, date, versions, criteria, issues, questions, pages, processes: processRuns, differences, statesTested, coverage, notOpenedBySource, groupChoices: frontier.groupChoices, decisions, skipped: frontier.skipped, durationSeconds, renders, budgetReached, overview, history: [...readHistory(outDir).filter((h) => h.run !== run), { run, date, kind: history.kind, counts, overview: history.overview }] });
  writeResults(outDir, { config, summary, pages: pageFiles, issues, questions, history, report, run, outcomes: all.flatMap((p) => p.outcomes) });
  writeState(true);
  options.signal?.removeEventListener("abort", onStop);
  log(`done: ${pages.length} pages, ${statesTested} states, ${processesTested} of ${config.interaction.processes.length} processes, ${issues.filter((i) => ["new", "open", "reopened"].includes(i.status)).length} issues, ${questions.length} questions, ${durationSeconds} s`);
  return { run, pages, issues: issues.length, questions: questions.length, durationSeconds, statesTested, processes: processRuns, dryRuns };
}
