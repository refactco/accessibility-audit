// One audit, step by step: crawl, render at each width, run the rule engine and the own tests, the states, the processes, group, compare, write.
// Several workers audit pages at the same time. The rate limit is shared, so the load on the site stays the same.
import { AXE_TESTED_CRITERIA } from "./criteria.ts";
import { AXE_VERSION, runAxe } from "./axe.ts";
import { launch, openPage, pageFacts, storageStateFor } from "./browser.ts";
import type { Config } from "./config.ts";
import { RateLimiter, isCommonPage, isPermitted, isSkipped, newFrontier, normalizeUrl, offer, pathOf, seed, setOf, templateOf } from "./crawl.ts";
import { mkdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { effectiveAnswer, loadDecisions } from "./decide.ts";
import { applyAnswers, buildIssues, buildQuestions, lastRun, loadExisting, sha, type CompareContext } from "./issues.ts";
import { ENGINE_VERSION, PAGE_TEST_CRITERIA, dropTargetQuestions, runPageTests, runUpdateWatch } from "./own/page.ts";
import { runImageOfTextTest } from "./own/images.ts";
import { LAYOUT_TEST_CRITERIA, runReflow, runSpacing, runZoom } from "./own/layout.ts";
import { FOCUS_TEST_CRITERIA, runFocusTests } from "./own/focus.ts";
import { LISTENER_TEST_CRITERIA, runListenerTest } from "./own/listeners.ts";
import { OPERATE_TEST_CRITERIA, runOperateTests } from "./own/operate.ts";
import { SITE_TEST_CRITERIA, collectSiteFacts, runSiteTests, type SiteFacts } from "./own/site.ts";
import { applyState, bannerVisible, findStates, type StateAction } from "./own/states.ts";
import { decideContrastQuestions } from "./own/contrast.ts";
import { runProcesses, type ProcessRun } from "./process.ts";
import { renderReport, type TemplateDifference } from "./report.ts";
import { pageResults, processSummary, siteSummary } from "./results.ts";
import { writeResults } from "./write.ts";
import { buildOverview, historyOverview, readHistory } from "./overview.ts";
import type { Outcome, PageRecord } from "./types.ts";

export interface AuditOptions {
  config: Config; outDir: string; only?: string[]; maxPages?: number;
  /** The maximum of pages in the random part and the technology part of the sample. */
  sampleLimit?: number;
  concurrency?: number;
  /** A short check tests only the pages with open issues. The caller gives them in `only`. */
  kind?: "full" | "short check";
  log?: (line: string) => void; startedBy?: "schedule" | "person" | "skill";
}

export interface AuditResult { run: string; pages: PageRecord[]; issues: number; questions: number; durationSeconds: number; statesTested: number; processes: ProcessRun[] }

/** The non-interference criteria that run with the cookie banner open. */
const NON_INTERFERENCE = new Set(["1.4.2", "2.1.2", "2.2.2", "2.3.1", "2.4.3"]);
const TEMPLATE_CRITERIA = new Set([...FOCUS_TEST_CRITERIA, ...LISTENER_TEST_CRITERIA, ...OPERATE_TEST_CRITERIA]);

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
  const started = new Date();
  // The run ID has seconds, so that two audits in one minute, for example a short check after an audit, stay apart.
  const run = started.toISOString().slice(0, 19) + "Z";
  const date = started.toISOString().slice(0, 10);
  const widths = config.crawl.widths;
  const first = widths[0];
  const last = widths[widths.length - 1];
  const base = config.site.url + "/";
  const maxPages = Math.min(options.maxPages || Infinity, config.crawl.max_pages, config.budgets.max_pages);
  const sampleLimit = options.sampleLimit ?? 60;
  const concurrency = Math.max(1, options.concurrency ?? config.budgets.concurrency);
  const limiter = new RateLimiter(config.crawl.rate_limit);
  const shotDir = join(outDir, "runs", run.replace(/:/g, "-"), "screenshots");
  mkdirSync(shotDir, { recursive: true });
  const shoot = (page: import("playwright").Page, outcomes: Outcome[]) => shootQuestions(page, outcomes, outDir, shotDir);
  const frontier = newFrontier();
  await seed(config, frontier, limiter, options.only);
  log(`${frontier.queue.length} addresses to start, ${frontier.sitemapUrls.length} from the sitemap, ${concurrency} workers`);

  const browser = await launch();
  const browserVersion = "Chromium " + browser.version();
  const login = config.login.method === "storage_state" ? storageStateFor(config.login.roles?.[0]?.secret_name) : {};
  if (login.warning) log(`login: ${login.warning}`);
  const contextOptions = login.path ? { storageState: login.path } : {};
  const contexts = new Map<number, Awaited<ReturnType<typeof browser.newContext>>>();
  for (const w of widths) contexts.set(w, await browser.newContext({ viewport: { width: w, height: 900 }, ...contextOptions }));
  const pages: PageRecord[] = [];
  const siteFacts = new Map<string, SiteFacts>();
  const budgetReached: ("pages" | "time" | "states" | "questions" | "issues")[] = [];
  let renders = 0;
  let statesTested = 0;
  let bannerRan = false;
  const siteLang = config.site.languages?.[0] || null;

  // The sample: the required parts come from the settings and the common pages. The random part and the technology part have the limit.
  const pathKey = (u: string) => { try { const x = new URL(u, base); return x.pathname.replace(/\/$/, "") + x.search; } catch { return u; } };
  const required = new Map<string, string>();
  for (const p of options.only || []) required.set(pathKey(p), "settings");
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
  const bannerTested = new Set<string>();

  const auditOne = async (url: string) => {
    const record: PageRecord = { url, template: templateOf(config, url), set: setOf(config, url), sample: false, tested: false, testedCriteria: {}, outcomes: [], links: [], renders: 0, facts: {}, states: [] };
    pages.push(record);
    const elapsed = (Date.now() - started.getTime()) / 60000;
    if (pages.length > maxPages) { record.not_tested_reason = "page limit"; if (!budgetReached.includes("pages")) budgetReached.push("pages"); return; }
    // The pages get 85% of the time budget. The states and the processes get the rest.
    if (elapsed > config.budgets.time_budget_minutes * 0.85) { record.not_tested_reason = "time budget"; if (!budgetReached.includes("time")) budgetReached.push("time"); return; }
    const reason = sampleReasonFor(url, record.template);
    if (reason) { record.sample = true; record.sampleReason = reason; }
    log(`page ${pages.length}: ${url}${reason ? " (sample: " + reason + ")" : ""}`);
    const candidates: { width: number; states: StateAction[] }[] = [];
    for (const w of widths) {
      await limiter.wait();
      let opened = await openPage(contexts.get(w)!, url, config);
      renders++; record.renders++;
      if (!opened.ok && /Timeout/.test(opened.error || "")) {
        // A load that ran into the time limit gets one more try.
        await opened.page.close();
        await limiter.wait();
        opened = await openPage(contexts.get(w)!, url, config);
        renders++; record.renders++;
      }
      if (!opened.ok) { await opened.page.close(); record.not_tested_reason = "did not load"; record.facts.loadError = opened.error; log(`  did not load at ${w}: ${opened.error}`); break; }
      record.http_status = opened.status;
      const tested = new Set<string>();
      const { page } = opened;
      try {
        if (w === first) {
          const facts = await pageFacts(page);
          record.title = facts.title; record.lang = facts.lang; record.content_hash = facts.hash; record.links = facts.links;
          // A page whose canonical link points to another permitted page is a copy of that page.
          // Not for an error page, and not for a page that the settings ask for: an error page often names the home page as its canonical.
          const canonical = facts.canonical ? normalizeUrl(config, facts.canonical, url) : null;
          const wanted = required.has(pathKey(url)) || (record.http_status || 0) >= 400;
          if (canonical && !wanted && !sameUrl(canonical, url) && isPermitted(config, canonical) && !isSkipped(config, canonical) && !options.only) {
            pages.splice(pages.indexOf(record), 1);
            frontier.skipped.push({ url, reason: "copy of the canonical page" });
            offer(config, frontier, canonical, url);
            return;
          }
          siteFacts.set(url, await collectSiteFacts(page));
          if (!options.only) for (const l of [...facts.links, ...facts.alternates]) offer(config, frontier, l, url);
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
        if (w === first) { record.outcomes.push(...(await runImageOfTextTest(page, url, w, []))); tested.add("1.4.5"); }
        if (record.sample && (w === first || w === last)) {
          // The focus pass runs at the smallest and the largest width.
          record.outcomes.push(...(await runFocusTests(page, url, w, [], opened.blocked)));
          for (const c of FOCUS_TEST_CRITERIA) tested.add(c);
          if (w === first) {
            record.outcomes.push(...(await runListenerTest(page, url, w, [])));
            for (const c of LISTENER_TEST_CRITERIA) tested.add(c);
            record.outcomes.push(...(await runOperateTests(page, config, url, w, [], opened.blocked)));
            for (const c of OPERATE_TEST_CRITERIA) tested.add(c);
          }
          if (config.interaction.max_states_per_page > 0) candidates.push({ width: w, states: await findStates(page, config, config.interaction.max_states_per_page) });
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
          statesTested++;
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
      const url = frontier.queue.shift();
      if (url === undefined) {
        if (active === 0) return;
        await new Promise((r) => setTimeout(r, 250));
        continue;
      }
      active++;
      try { await auditOne(url); } catch (e) { log(`  page error at ${url}: ${(e as Error).message.split("\n")[0]}`); } finally { active--; }
    }
  };

  /** One state of one page: its own render, the action, then the rule engine, the page tests, and a focus pass. */
  const runStateJob = async (record: PageRecord, w: number, s: StateAction) => {
    await limiter.wait();
    const opened = await openPage(contexts.get(w)!, record.url, config);
    renders++; record.renders++;
    if (!opened.ok) { await opened.page.close(); return; }
    try {
      const applied = await applyState(opened.page, s);
      if (!applied.ok) return;
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
      log(`  state error (${s.label}): ${(e as Error).message.split("\n")[0]}`);
    } finally {
      await opened.page.close();
    }
  };

  let processRuns: ProcessRun[] = [];
  try {
    await Promise.all(Array.from({ length: concurrency }, () => worker()));

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
    log(`${jobs.length} states on ${candidatesOf.size} pages`);
    let next = 0;
    const stateWorker = async () => {
      for (;;) {
        const job = jobs[next++];
        if (!job) return;
        if ((Date.now() - started.getTime()) / 60000 > config.budgets.time_budget_minutes) { if (!budgetReached.includes("time")) budgetReached.push("time"); return; }
        try { await runStateJob(job.record, job.width, job.state); } catch (e) { log(`  state error at ${job.record.url}: ${(e as Error).message.split("\n")[0]}`); }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, () => stateWorker()));

    // The site tests, on all pages together.
    const siteOutcomes = runSiteTests(pages, siteFacts, frontier.sitemapUrls, first);
    for (const o of siteOutcomes) pages.find((p) => p.url === o.url)?.outcomes.push(o);
    for (const p of pages) if (p.tested) for (const c of SITE_TEST_CRITERIA) p.testedCriteria[first]?.add(c);
    // The processes, after the pages, so that their outcomes do not repeat the outcomes of the pages.
    processRuns = await runProcesses(browser, config, first, pages, limiter, log, shoot);
    renders += processRuns.reduce((n, r) => n + r.renders, 0);
  } finally {
    await browser.close();
  }

  const processPages = processRuns.flatMap((r) => r.records);
  const all = [...pages, ...processPages];
  const existingIssues = loadExisting(outDir, "issues");
  const existingQuestions = loadExisting(outDir, "questions");
  const previous = lastRun(outDir);
  const versions = { engine: ENGINE_VERSION, axe_core: AXE_VERSION, browser: browserVersion };
  // A baseline audit: the first one in the results folder, or one after a change of the engine versions. Issues that disappear in it are not fixes.
  const baseline = !previous || previous.versions?.engine !== versions.engine || previous.versions?.axe_core !== versions.axe_core;
  // A page is gone when it gives 404 or 410 now and did not in the last run. The error page of the settings always gives 404.
  const previousStatus = new Map<string, number>();
  try { for (const line of readFileSync(join(outDir, "pages.jsonl"), "utf8").split("\n")) { if (!line) continue; const p = JSON.parse(line); if (p.http_status) previousStatus.set(pathOf(p.url), p.http_status); } } catch { /* the first run */ }
  const context: CompareContext = {
    testedPaths: new Set(all.filter((p) => p.tested).map((p) => pathOf(p.url))),
    samplePaths: new Set(all.filter((p) => p.tested && p.sample).map((p) => pathOf(p.url))),
    gonePaths: new Set(pages.filter((p) => (p.http_status === 404 || p.http_status === 410) && (previousStatus.get(pathOf(p.url)) || 0) < 400 && previousStatus.has(pathOf(p.url))).map((p) => pathOf(p.url))),
    versions,
  };
  const questions = buildQuestions(all, config, existingQuestions);
  applyAnswers(all, config, questions);
  const issues = buildIssues(all, config, run, date, existingIssues, context);
  for (const i of issues) if (i.question) { const q = questions.find((x) => x.id === i.question); if (q) q.issue = i.id; }
  const decisions = loadDecisions(outDir);
  const aiOnly = new Map<string, number>();
  for (const q of questions) if (effectiveAnswer(q).by === "ai") aiOnly.set(q.criterion, (aiOnly.get(q.criterion) || 0) + 1);
  const issueCounts = new Map<string, number>();
  for (const i of issues) if (["new", "open", "reopened", "accepted"].includes(i.status)) issueCounts.set(i.wcag.criterion, (issueCounts.get(i.wcag.criterion) || 0) + 1);
  const questionCounts = new Map<string, number>();
  for (const q of questions) if (!effectiveAnswer(q).value) questionCounts.set(q.criterion, (questionCounts.get(q.criterion) || 0) + 1);
  const processesTested = processRuns.filter((r) => r.tested).length;
  const criteria = siteSummary(all, widths, { all: config.interaction.processes.length, tested: processesTested }, issueCounts, questionCounts, aiOnly, decisions);
  const durationSeconds = Math.round((Date.now() - started.getTime()) / 1000);
  const count = (s: string) => issues.filter((i) => i.status === s).length;
  // A replaced pair does not count as one resolved issue and one new issue.
  const replaced = new Set(issues.filter((i) => i.replaces).map((i) => i.replaces));
  const counts = { new: issues.filter((i) => i.status === "new" && !i.replaces).length, open: count("open"), resolved: issues.filter((i) => i.status === "resolved" && i.status_by.run === run && i.status_by.reason === "fixed" && !replaced.has(i.id)).length, resolved_rule_changed: issues.filter((i) => i.status === "resolved" && i.status_by.run === run && i.status_by.reason === "rule changed").length, reopened: count("reopened"), not_checked: count("not checked"), page_removed: count("page removed"), accepted: count("accepted"), dismissed: count("dismissed") };
  const tested = pages.filter((p) => p.tested);

  // The tests that did not run, with the reason.
  const testsNotRun: string[] = [];
  if (!config.crawl.cookie_banner) testsNotRun.push("the non-interference tests with the cookie banner open: the settings have no banner selector");
  else if (!bannerRan) testsNotRun.push("the non-interference tests with the cookie banner open: no banner was visible on the sample pages");
  if (config.interaction.max_states_per_page === 0) testsNotRun.push("states: max_states_per_page is 0");
  if (!config.interaction.processes.length) testsNotRun.push("processes: the settings have none. The form tests (3.3.1, 3.3.3) and the redundant entry test (3.3.7) run in the processes only");
  for (const r of processRuns) if (!r.tested) testsNotRun.push(`process ${r.name}: ${r.reason}`);
  if (config.interaction.processes.length && !processesTested) testsNotRun.push("form tests (3.3.1, 3.3.3) and redundant entry (3.3.7): they run in the processes only");

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
      if (onlyInPage.length || onlyInExample.length) differences.push({ template: t, example: pathOf(example.url), page: pathOf(other.url), onlyInPage, onlyInExample });
    }
  }

  const coverage = { pages_found: pages.length, pages_tested: tested.length, pages_not_tested: pages.length - tested.length, pages_in_sample: tested.filter((p) => p.sample).length, states_tested: statesTested, processes_tested: processesTested, processes_not_tested: config.interaction.processes.length - processesTested, tests_not_run: testsNotRun, budget_reached: budgetReached };
  const processes = Object.fromEntries(processRuns.map((r) => [r.name, r.tested ? { tested: true, ...processSummary(r.records, [first]) } : { tested: false, reason: r.reason || "not tested" }]));
  const overview = buildOverview(all, widths, criteria, issues, decisions);
  const summary = { schema: "summary/1", site: config.site.url, run, date, standard: "WCAG 2.2", level: "AA", versions, baseline, counts, coverage, criteria, processes, overview };
  const pageFiles = all.map((p) => ({ schema: "page/1", url: p.url, template: p.template, set: p.set, sample: p.sample, process: p.process || null, states: p.states, run, tested: p.tested, ...(p.not_tested_reason ? { not_tested_reason: p.not_tested_reason } : {}), ...(p.http_status ? { http_status: p.http_status } : {}), ...(p.content_hash ? { content_hash: p.content_hash } : {}), results: pageResults(p, p.process ? [first] : widths, decisions), issues: issues.filter((i) => i.examples.some((e: { url: string }) => e.url === pathOf(p.url))).map((i) => i.id) }));
  const questionsAnswered = { ai: questions.filter((q) => q.ai_answer).length, person: questions.filter((q) => q.person_answer).length };
  const history = { schema: "history/1", run, started: started.toISOString(), duration_seconds: durationSeconds, kind: options.kind || "full", started_by: options.startedBy || "person", environment: config.site.environment, versions, baseline, counts, coverage, renders, questions_answered: questionsAnswered, overview: historyOverview(overview) };
  const report = renderReport({ config, run, date, versions, criteria, issues, questions, pages, processes: processRuns, differences, statesTested, decisions, skipped: frontier.skipped, durationSeconds, renders, budgetReached, overview, history: [...readHistory(outDir), { run, date, kind: history.kind, counts, overview: history.overview }] });
  writeResults(outDir, { config, summary, pages: pageFiles, issues, questions, history, report, run, outcomes: all.flatMap((p) => p.outcomes) });
  log(`done: ${pages.length} pages, ${statesTested} states, ${processesTested} of ${config.interaction.processes.length} processes, ${issues.filter((i) => ["new", "open", "reopened"].includes(i.status)).length} issues, ${questions.length} questions, ${durationSeconds} s`);
  return { run, pages, issues: issues.length, questions: questions.length, durationSeconds, statesTested, processes: processRuns };
}
