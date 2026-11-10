// The grouper and a first comparer: outcomes become issues and questions with fingerprints, and the stored issues give the statuses.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { itemFromHtml } from "./axe.ts";
import { CRITERIA_BY_ID } from "./criteria.ts";
import { pageKey, templateOf } from "./crawl.ts";
import type { Config } from "./config.ts";
import { effectiveAnswer } from "./decide.ts";
import { legacyItems, selectHtml, stableHtml, stableIdsHtml, withoutClass } from "./stable.ts";
import { compareVersions, detectionVersion } from "./own/versions.ts";
import { FOCUS_RULES } from "./own/focus.ts";
import { LISTENER_RULES } from "./own/listeners.ts";
import { OPERATE_RULES } from "./own/operate.ts";
import type { Outcome, PageRecord, Severity } from "./types.ts";

/** The rules of the tests that run on the sample pages only. The dry submit gives its outcomes a state, so they count as states. */
const SAMPLE_RULES = new Set<string>([...LISTENER_RULES, ...FOCUS_RULES, ...OPERATE_RULES]);

/** True when the test of a rule runs on the sample pages only: a template criterion, a test of the sample, or a state. axe-core runs
 *  on each tested page, so its rules need the sample only in a state, also for a template criterion such as 2.1.1. */
export function needsSample(rule: string, criterion: string, inState: boolean, engine?: string): boolean {
  if (engine === "axe-core") return inState;
  return CRITERIA_BY_ID.get(criterion)?.test_groups?.[0] === "template" || SAMPLE_RULES.has(rule) || inState;
}

/** The other form of a path: with no trailing slash when it has one, and with one when it has none. Since 1.3.0 the engine merges
 *  the two forms into one page, but the results of older versions kept the form of the link, for example /about. */
export function otherSlash(p: string): string {
  const q = p.indexOf("?");
  const path = q < 0 ? p : p.slice(0, q);
  if (!path || path === "/" || /^[a-z][a-z0-9+.-]*:\/\/[^/]*\/?$/i.test(path)) return p;
  return (path.endsWith("/") ? path.slice(0, -1) : path + "/") + (q < 0 ? "" : p.slice(q));
}

/** True when a set of page paths has the path in one of its two forms. */
export function hasPath(set: Set<string>, p: string): boolean {
  return set.has(p) || set.has(otherSlash(p));
}

const SEVERITY_ORDER: Severity[] = ["critical", "serious", "moderate", "minor"];

export function sha(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}

/** Rules whose cause is a style or a shared component. Their issues group by the kind of element, not by its text. */
const STYLE_RULES = new Set(["color-contrast", "link-in-text-block", "target-size", "avoid-inline-spacing", "focus-not-visible", "focus-entirely-hidden", "target-too-small", "placeholder-contrast", "control-border-contrast", "focus-indicator-contrast", "text-cut-with-spacing", "text-cut-at-zoom", "change-of-context-on-focus", "control-not-focusable", "control-without-role", "composite-parts-unreachable", "expanded-state-not-updated", "drag-listener", "down-event-listener"]);

/** The kind of an element: its tag and its classes, from the HTML of the outcome. A contrast issue has the kind of its color pair.
 *  ownRole takes the role from the start tag of the element only. The style rules take the first role in the HTML, also of a child,
 *  and keep it so that their IDs stay. A layout rule takes its own role: a child, for example a search form in a sidebar, is content. */
export function kindOf(o: Outcome, ownRole = false): string {
  const colors = o.facts?.colors as { fg?: string; bg?: string } | undefined;
  if (o.rule === "color-contrast" && colors?.fg && colors?.bg) return `color|${colors.fg}|${colors.bg}`;
  // A hidden focused control has one cause: in a state, the open panel that stays open when the focus leaves it;
  // in the first state, the element that covers the control, for example a sticky header.
  const coverer = o.facts?.coveredBy as string | undefined;
  if (o.rule === "focus-entirely-hidden" && coverer) {
    if (o.state.length) return "covered-in-state";
    // An id with a hash, for example #header-block_7f3a..., is the same block on each page.
    const parts = coverer.replace(/:nth-child\(\d+\)/g, "").split(" > ").map((p) => p.replace(/^#([a-zA-Z][a-zA-Z-]*?)[-_][0-9a-f]{6,}.*$/, "#$1"));
    const landmark = parts.find((p) => /(^|[#.-])(header|nav|footer|aside|dialog|main|form)\b/.test(p));
    return "covered-by|" + (landmark || parts[parts.length - 1]);
  }
  const html = o.html || "";
  const tag = (html.match(/^<([a-z0-9-]+)/i) || [, o.item.split(/[#.|]/)[0] || "el"])[1].toLowerCase();
  // The classes of the element, or of its first child with a class when the element is a plain wrapper.
  const ownClass = html.match(/^<[a-z0-9-]+[^>]*?\sclass="([^"]*)"/i);
  const firstClass = html.match(/\sclass="([^"]*)"/);
  const cls = ((ownClass || firstClass || [, ""])[1] as string).split(/\s+/).filter((c) => c && !/\d{3,}|^(is|has)-|active|open|focus|hover|^slick-(active|current)/.test(c)).slice(0, 3).join(".");
  const role = ((ownRole ? html.match(/^<[^>]*>/)?.[0] || "" : html).match(/\srole="([^"]*)"/) || [, ""])[1];
  return `${tag}${cls ? "." + cls : ""}${role ? "[" + role + "]" : ""}`;
}

/** Rules of the layout: the question asks about the layout of a kind of element, not about its content. A template that reverses
 *  the order of its columns gives one question and one issue for all its pages. The item of such an element has the first words of
 *  its text, so before 1.3.5 each page with other words had its own question: on a large site, 2,332 questions from 17 kinds of
 *  element. The old questions continue in the new one when their answers agree. */
export const LAYOUT_RULES = new Set(["visual-order-differs"]);

/** The facts that a rule measures, or that change with the content of the site, and that the answer to its question does not depend
 *  on: the hash of a question leaves them out, so the answer stays. image-of-text measures the colors and the size of the image, and
 *  1.3.6 measured them in a new way; the answer depends on the image file and its alt text. change-of-context-on-input records the
 *  address that the select loads, which can change each week. Since 1.3.7. */
const MEASURED_FACTS: Record<string, string[]> = {
  "image-of-text": ["colors", "flatShare", "ink", "width", "height"],
  "change-of-context-on-input": ["navigation"],
};

/** The fingerprint of an issue by its item, as all the rules that do not group by the kind of element give it. */
function itemFingerprintOf(o: Outcome, item: string): string {
  return sha(`${o.engine}|${o.rule}|${o.criterion}|${item}|${o.state.join(">")}`);
}

/** The fingerprint of an issue: the rule, the element without its position and its page, and the state.
 *  A shared component gives one issue for all its pages, in all states, because its cause is one style or one component.
 *  A content item, with its source or address, gives one issue for each item and each state. */
export function fingerprintOf(o: Outcome, _config: Config): string {
  if (STYLE_RULES.has(o.rule)) return sha(`${o.engine}|${o.rule}|${o.criterion}|${kindOf(o)}`);
  if (LAYOUT_RULES.has(o.rule)) return sha(`${o.engine}|${o.rule}|${o.criterion}|${kindOf(o, true)}|${o.state.join(">")}`);
  return itemFingerprintOf(o, o.item);
}

/** The fingerprint of a question. item gives the fingerprint with that item, as the versions before 1.3.5 gave it for all the rules
 *  that do not group by the kind of element: the search for the old ID of a question uses it. */
export function questionFingerprintOf(o: Outcome, config: Config, item?: string): string {
  const c = CRITERIA_BY_ID.get(o.criterion);
  const context = c?.context_dependent ? "|" + (o.context || "") : "";
  // A page-level rule gives one question for each page. The same-title and page-not-linked rules group their pages into one question.
  const place = o.rule.startsWith("page-") && o.rule !== "page-not-linked" ? "|" + pageKey(config.site.url, o.url) : "";
  const key = item ?? (STYLE_RULES.has(o.rule) ? kindOf(o) : LAYOUT_RULES.has(o.rule) ? kindOf(o, true) : o.item);
  return sha(`${o.engine}|${o.rule}|${o.criterion}|${key}${context}${place}`);
}

export type IssueFile = Record<string, any>;

const NO_CHANGE = /^no (change|role|code change)\b[^.]*\bneeded|\bnot a (target|control)\b|project cannot|accepted risk|false positive|not a real problem/i;
/** True when the locate step found no change to make: its solution proposes a decision of a person, dismiss or accept, instead of a
 *  fix. The review page asks a person for that decision. A person who keeps the issue sends it back to the locate step. */
export function proposesNoChange(i: Record<string, any>): boolean {
  return /\ba11y (dismiss|accept)\b/.test(String(i.solution?.example || "")) || NO_CHANGE.test(String(i.solution?.summary || ""));
}

/** The solution of an issue, with its own ID in the commands of a decision: `refact-a11y dismiss`, `accept`, and `locate`. A solution
 *  that an issue takes from the older ID that it continues names that ID: from gives it, and each time it is in the text it becomes
 *  the ID of the issue. Other IDs in the text, for example of a related issue, stay. Before 1.3.4 the copied solution told a person
 *  to dismiss the old ID, not the open issue. */
export function solutionFor(solution: any, id: string, from?: string): any {
  if (!solution) return solution;
  const before = JSON.stringify(solution);
  let text = from && from !== id ? before.split(from).join(id) : before;
  text = text.replace(/\b((?:refact-)?a11y\s+(?:accept|dismiss|locate)\s+)ISS-[0-9a-f]{8}\b/g, `$1${id}`);
  return text === before ? solution : JSON.parse(text);
}

export type QuestionFile = Record<string, any>;

export function loadExisting(dir: string, folder: "issues" | "questions"): Map<string, IssueFile> {
  const out = new Map<string, IssueFile>();
  const path = join(dir, folder);
  if (!existsSync(path)) return out;
  for (const f of readdirSync(path)) {
    if (!f.endsWith(".json")) continue;
    try { const data = JSON.parse(readFileSync(join(path, f), "utf8")); out.set(data.id, data); } catch { /* skip a broken file */ }
  }
  return out;
}

/** What the comparer needs from the run: the pages it tested, the pages that are gone, and the versions of the engines. */
export interface CompareContext {
  /** The keys of the pages that the audit tested: the path with the query on the site host, the whole address on another host. */
  testedPaths: Set<string>;
  /** The paths of the pages in the sample: the template tests and the states ran only there. */
  samplePaths?: Set<string>;
  /** The keys of the pages of the last audit that are gone: they give 404 or 410 now, or their address redirects now. */
  gonePaths: Set<string>;
  /** The paths of the pages of earlier results that the settings leave out now: a skip pattern, or a host that is not permitted.
   *  Since 1.3.6. */
  outOfScopePaths?: Set<string>;
  /** The widths at which a tested page did not load, by the key of the page, for example during a short outage of the server. */
  widthsNotLoaded?: Map<string, number[]>;
  versions: { engine: string; axe_core: string };
}

/** The paths of the pages with an open issue in a results folder, for the short check. */
export function pagesWithOpenIssues(dir: string): string[] {
  const out = new Set<string>();
  for (const i of loadExisting(dir, "issues").values()) {
    if (!["new", "open", "reopened", "not checked"].includes(i.status)) continue;
    for (const e of i.examples) out.add(e.url);
  }
  return [...out].sort();
}

/** The last run of a results folder, from its history. */
export function lastRun(dir: string): Record<string, any> | null {
  const path = join(dir, "history.jsonl");
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
  try { return lines.length ? JSON.parse(lines[lines.length - 1]) : null; } catch { return null; }
}

/** Marks each review outcome with the answer of its question, from the question files: a person's answer first, then the AI's. */
export function applyAnswers(pages: PageRecord[], config: Config, questions: QuestionFile[]): void {
  const byFingerprint = new Map(questions.map((q) => [q.fingerprint, q]));
  for (const p of pages) for (const o of p.outcomes) {
    if (o.kind !== "cantTell" && o.kind !== "candidate") continue;
    // A stored outcome can carry the answer of the run that wrote it. The answer of today replaces it, or clears it when the question is open again.
    delete o.answer; delete o.answeredBy;
    const q = byFingerprint.get(questionFingerprintOf(o, config));
    if (!q) continue;
    o.questionId = q.id;
    const e = effectiveAnswer(q);
    if (e.value) { o.answer = e.value; o.answeredBy = e.by === "person" ? "person" : "ai"; }
  }
}

export function buildIssues(pages: PageRecord[], config: Config, run: string, date: string, existing: Map<string, IssueFile>, context?: CompareContext): IssueFile[] {
  const groups = new Map<string, Outcome[]>();
  for (const p of pages) for (const o of p.outcomes) {
    if (o.kind !== "failed" && o.answer !== "issue") continue;
    const fp = fingerprintOf(o, config);
    groups.set(fp, [...(groups.get(fp) || []), o]);
  }
  // The issues that a person's answer closes: the question of the issue has the answer "no issue" or "not applicable" of a person.
  // The site did not change, so the issue is not fixed. Before 1.3.10 such an issue was resolved as "fixed", and the client report
  // counted it as a fix. By the ID that the outcome gives an issue, and by the question.
  const personNoIds = new Set<string>(), personNoQuestions = new Set<string>();
  for (const p of pages) for (const o of p.outcomes) {
    if (o.answeredBy !== "person" || (o.answer !== "no issue" && o.answer !== "not applicable")) continue;
    personNoIds.add("ISS-" + fingerprintOf(o, config).slice(0, 8));
    if (o.questionId) personNoQuestions.add(o.questionId);
  }
  const issues: IssueFile[] = [];
  // The IDs that 1.3.1 and older versions gave to the elements with the classes of a lazy load, and the ID of each now. Also the IDs
  // that 1.3.4 and older versions gave to the issues of a layout rule, one for each item, and the ID of their kind of element now.
  const movedFrom = new Map<string, string>();
  const regrouped = new Set<string>();
  for (const [fp, list] of groups) {
    const first = list[0];
    const c = CRITERIA_BY_ID.get(first.criterion)!;
    const id = "ISS-" + fp.slice(0, 8);
    if (LAYOUT_RULES.has(first.rule)) for (const o of list) for (const item of [o.item, ...legacyItems(o.item, o.html || "")]) {
      const before = "ISS-" + itemFingerprintOf(o, item).slice(0, 8);
      movedFrom.set(before, id); regrouped.add(before);
    }
    else if (!STYLE_RULES.has(first.rule)) for (const o of list.slice(0, 20)) for (const item of legacyItems(o.item, o.html || "")) movedFrom.set("ISS-" + fingerprintOf({ ...o, item }, config).slice(0, 8), id);
    const old = existing.get(id);
    // A rule or a person gives "fail". The AI alone gives "ai fail".
    const certainty = first.kind === "failed" ? "fail" : list.some((o) => o.answeredBy === "person") ? "fail" : "ai fail";
    const urls = [...new Set(list.map((o) => o.url))];
    const templates = [...new Set(urls.map((u) => templateOf(config, u)).filter((t): t is string => !!t))];
    const severity = SEVERITY_ORDER.find((s) => list.some((o) => o.severity === s)) || "moderate";
    const seenExamples = new Set<string>();
    const examples = list.filter((o) => { const k = o.url + "|" + o.width + "|" + o.selector; if (seenExamples.has(k)) return false; seenExamples.add(k); return true; }).slice(0, 5)
      .map((o) => ({ url: pageKey(config.site.url, o.url), width: o.width, state: o.state, selector: o.selector, html: o.html || "", facts: o.facts || {} }));
    let status = "new";
    // A refresh of the same run keeps the status of the run, except when the run had closed the issue: an answer that came after the
    // audit found the issue again, so it is open, as it was before the run. A new run moves it: new and not checked become open, resolved becomes reopened.
    if (old && old.status_by?.run === run) status = ["resolved", "not checked", "page removed"].includes(old.status) ? "open" : old.status;
    else if (old) status = old.status === "accepted" || old.status === "dismissed" ? old.status : old.status === "resolved" || old.status === "page removed" ? "reopened" : "open";
    issues.push({
      schema: "issue/2", id, status,
      status_by: { who: "engine", mode: "automatic", date, run },
      certainty, non_interference: c.non_interference,
      rule: { id: first.rule, engine: first.engine, engine_version: first.engineVersion },
      wcag: { criterion: c.id, level: c.level, principle: c.principle },
      affects: c.affects, severity, summary: first.summary,
      reach: { pages: urls.length, occurrences: list.length, templates, widths: [...new Set(list.map((o) => o.width))].sort((a, b) => a - b) },
      first_seen: old?.first_seen || date, last_seen: date, environment: config.site.environment,
      // The old issue that this one replaces or continues stays in the next runs, so that the file tells the history of its ID. Before
      // 1.3.4 a new run cleared it. The counts and the report use it only for a "new" issue, and for an old ID resolved in this run.
      question: list.find((o) => o.questionId)?.questionId || null, replaces: old ? (old.replaces ?? null) : null, origin: old?.origin || "unknown", source: old?.source || [], source_warning: old?.source_warning ?? null,
      examples,
      // The specific solution of the skill stays. The general solution of the engine is only for an issue with no specific one yet.
      solution: old?.solution?.type === "specific" ? solutionFor(old.solution, id) : { type: "general", summary: first.solution.summary, steps: first.solution.steps, ...(first.solution.example ? { example: first.solution.example } : {}) },
      decision: old?.decision || null,
      untrusted_fields: ["examples[].html", "examples[].facts"],
    });
  }
  // The ID that an older issue has with the identity of this version: before 1.3.0 the identity kept the random parts of ids and
  // names, and before 1.3.2 the classes of a lazy load. When that ID is an issue of this run, the issue is the same, under a new ID.
  // Only an issue that this run found: the loop below adds the old issues to the list too.
  const foundNow = new Set(issues.map((i) => i.id));
  const sameUnderNewId = (old: IssueFile): IssueFile | undefined => {
    const moved = movedFrom.get(old.id);
    if (moved && moved !== old.id && foundNow.has(moved)) return issues.find((i) => i.id === moved);
    const e = old.examples?.[0];
    if (old.rule?.engine !== "axe-core" || STYLE_RULES.has(old.rule?.id) || !e?.html) return undefined;
    const id = "ISS-" + sha(`axe-core|${old.rule.id}|${old.wcag?.criterion}|${itemFromHtml(e.html, e.selector || "")}|${(e.state || []).join(">")}`).slice(0, 8);
    return id === old.id || !foundNow.has(id) ? undefined : issues.find((i) => i.id === id);
  };
  // Stored issues that the audit did not find again: resolved when all their pages were tested, not checked when not,
  // page removed when all their pages are gone, and resolved with the reason "rule changed" when the engine version changed.
  const resolvedNow: IssueFile[] = [];
  for (const [id, old] of existing) {
    if (issues.some((i) => i.id === id)) continue;
    // A new issue of this same run that the refresh does not find again came from an answer that changed since, for example
    // a first AI answer that the verifier did not confirm. It never existed in a finished run, so it goes, with no resolution.
    // A new issue of a layout rule that the first refresh with 1.3.5 moves to the ID of its kind of element is the same new issue:
    // the work of the skill goes with it, and the old ID goes, as it never existed in a finished run under the new identity.
    const same = sameUnderNewId(old);
    if (old.status === "new" && old.status_by?.run === run) {
      if (same && regrouped.has(id)) {
        if (same.origin === "unknown" && old.origin) same.origin = old.origin;
        if (!same.source?.length && old.source?.length) { same.source = old.source; same.source_warning = old.source_warning ?? null; }
        if (same.solution?.type !== "specific" && old.solution?.type === "specific") same.solution = solutionFor(old.solution, same.id, old.id);
        if (!same.decision && old.decision) same.decision = old.decision;
        if (old.first_seen && old.first_seen < same.first_seen) same.first_seen = old.first_seen;
      }
      continue;
    }
    const by = { who: "engine", mode: "automatic", date, run };
    // An issue that a run resolved as fixed while the same issue under its new ID was open in that same run was not fixed: 1.3.0
    // did this when several old IDs gave one new ID. The reason becomes "rule changed". The run and the date of the resolution stay.
    if (same && old.status === "resolved" && old.status_by?.reason === "fixed") {
      const then = existing.get(same.id);
      if (then && ["new", "open", "reopened"].includes(then.status) && then.status_by?.run === old.status_by?.run) {
        issues.push({ ...old, status_by: { ...old.status_by, reason: "rule changed" } });
        continue;
      }
    }
    // The same issue under a new ID. The old one is resolved with the reason "rule changed": it is not a fix. The first old ID gives
    // the new issue its status, origin, source, specific solution, and decision. Several old IDs can give one new ID, for example
    // one select whose random name was different on each page: each other old ID gives only what the new issue does not have yet.
    // A refresh of the same run moves an issue of a layout rule to the ID of its kind of element too, with the status of the run: the
    // first refresh with 1.3.5 of the results of an older version.
    const sameRun = old.status_by?.run === run;
    if (same && (!sameRun || regrouped.has(old.id))) {
      if (same.status === "new") {
        Object.assign(same, {
          status: sameRun ? old.status : old.status === "accepted" || old.status === "dismissed" ? old.status : old.status === "resolved" || old.status === "page removed" ? "reopened" : "open",
          replaces: old.id, first_seen: old.first_seen || same.first_seen, origin: old.origin || same.origin, source: old.source || same.source, source_warning: old.source_warning ?? same.source_warning,
          solution: old.solution?.type === "specific" ? solutionFor(old.solution, same.id, old.id) : same.solution, decision: old.decision || same.decision,
        });
      } else {
        if (old.first_seen && old.first_seen < same.first_seen) same.first_seen = old.first_seen;
        if (same.origin === "unknown" && old.origin) same.origin = old.origin;
        if (!same.source?.length && old.source?.length) { same.source = old.source; same.source_warning = old.source_warning ?? null; }
        if (same.solution?.type !== "specific" && old.solution?.type === "specific") same.solution = solutionFor(old.solution, same.id, old.id);
        if (!same.decision && old.decision) same.decision = old.decision;
      }
      issues.push(["resolved", "page removed", "dismissed"].includes(old.status) ? old : { ...old, status: "resolved", status_by: { ...by, reason: "rule changed" } });
      continue;
    }
    // A person answered that the finding is not an issue: the issue is resolved with the reason "not an issue", and it is not a fix.
    // A refresh of the same run also corrects an issue that 1.3.9 or older resolved as "fixed" for this reason. Since 1.3.10.
    const personSaysNo = personNoIds.has(old.id) || (!!old.question && personNoQuestions.has(old.question));
    if (personSaysNo && (["new", "open", "reopened", "not checked"].includes(old.status) || (old.status === "resolved" && old.status_by?.reason === "fixed" && sameRun))) {
      issues.push({ ...old, status: "resolved", status_by: { who: "person", mode: "manual", date: sameRun && old.status === "resolved" ? old.status_by.date : date, run, reason: "not an issue" } });
      continue;
    }
    // A refresh of the same run corrects a resolution of 1.3.0: it checked the issues of the sample tests against all the tested pages,
    // so an issue on a tested page out of the sample was resolved, although its test did not run there.
    if (old.status === "resolved" && old.status_by?.run === run && !same && context?.samplePaths && SAMPLE_RULES.has(old.rule?.id)
      && (old.examples || []).some((e: { url: string }) => hasPath(context.testedPaths, e.url) && !hasPath(context.samplePaths!, e.url))) {
      issues.push({ ...old, status: "not checked", status_by: by });
      continue;
    }
    if (old.status === "resolved" || old.status === "page removed" || old.status === "dismissed") {
      // A refresh of the same run looks at its fixes again, so that it can correct a fix of 1.3.2 that a new name of a state gave.
      // An issue that a new issue replaced in this run is "fixed" again until a new issue replaces it again. Since 1.3.9.
      if (old.status === "resolved" && ["fixed", "replaced"].includes(old.status_by?.reason) && old.status_by?.run === run) {
        const copy = { ...old, status_by: { ...old.status_by, reason: "fixed" } }; issues.push(copy); resolvedNow.push(copy); continue;
      }
      issues.push(old); continue;
    }
    const paths: string[] = (old.examples || []).map((e: { url: string }) => e.url);
    // A page that the settings leave out now cannot have the issue in the audit: the issue ends as "page removed", with the reason
    // "out of scope". A page that is gone counts the same. Since 1.3.6.
    const outside = (p: string) => !!context?.outOfScopePaths && hasPath(context.outOfScopePaths, p);
    if (context && paths.length && paths.some(outside) && paths.every((p) => outside(p) || hasPath(context.gonePaths, p))) { issues.push({ ...old, status: "page removed", status_by: { ...by, reason: "out of scope" } }); continue; }
    if (context && paths.length && paths.every((p) => hasPath(context.gonePaths, p))) { issues.push({ ...old, status: "page removed", status_by: { ...by, reason: "page removed" } }); continue; }
    // An issue from a template test, a sample test, or a state needs its pages in the sample of this run, because those tests run
    // only there. The rule decides, not the criterion: 4.1.2 has page tests, but its listener test runs on the sample only.
    const criterion = CRITERIA_BY_ID.get(old.wcag?.criterion);
    const templateIssue = needsSample(old.rule?.id, criterion?.id || old.wcag?.criterion, (old.examples || []).some((e: { state?: string[] }) => e.state && e.state.length), old.rule?.engine);
    const checked = templateIssue && context?.samplePaths ? context.samplePaths : context?.testedPaths;
    // A page that is gone cannot have the issue any more: it counts as checked. A path of an older version can differ from the
    // tested page by the trailing slash.
    if (context && checked && !paths.every((p) => hasPath(checked, p) || hasPath(context.gonePaths, p) || outside(p))) { issues.push({ ...old, status: "not checked", status_by: by }); continue; }
    // A page that did not load at the width of an example did not check the issue there: the page is tested at its other widths only.
    const notAt = (u: string) => context?.widthsNotLoaded?.get(u) || context?.widthsNotLoaded?.get(otherSlash(u)) || [];
    if ((old.examples || []).some((e: { url: string; width?: number }) => e.width !== undefined && notAt(e.url).includes(e.width))) { issues.push({ ...old, status: "not checked", status_by: by }); continue; }
    // An axe-core rule changed when the version of axe-core changed. An own rule changed when the engine that found the issue had an
    // older detection of that rule than this engine: a release that does not change the test is not a rule change.
    const changed = old.rule?.engine === "axe-core"
      ? !!context?.versions.axe_core && old.rule?.engine_version !== context.versions.axe_core
      : compareVersions(old.rule?.engine_version || "0", detectionVersion(old.rule?.id)) < 0;
    const reason = context && changed ? "rule changed" : "fixed";
    const resolved = { ...old, status: "resolved", status_by: { ...by, reason } };
    issues.push(resolved);
    if (reason === "fixed") resolvedNow.push(resolved);
  }
  // A new issue with the rule and the pages of an issue that was resolved in this run replaces it: the markup changed.
  const slashless = (p: string) => p.length > 1 ? p.replace(/\/(?=\?|$)/, "") : p;
  const pagesOf = (x: IssueFile) => new Set((x.examples || []).map((e: { url: string }) => slashless(e.url)));
  // The elements of the examples in a state, by page: the tag, the id, and the classes, with no text.
  const stateElements = (x: IssueFile) => new Set((x.examples || []).filter((e: { state?: string[] }) => e.state?.length)
    .map((e: { url: string; html?: string; selector?: string }) => slashless(e.url) + "|" + itemFromHtml(e.html || "", e.selector || "").split("|")[0]));
  for (const i of issues) {
    if (i.status !== "new") continue;
    const mine = pagesOf(i);
    const old = resolvedNow.find((r) => r.rule.id === i.rule.id && r.wcag.criterion === i.wcag.criterion && [...pagesOf(r)].some((p) => mine.has(p)));
    if (!old) continue;
    i.replaces = old.id; i.first_seen = old.first_seen;
    // The old issue was not fixed: its element changed, and the new issue has the problem. Before 1.3.9 its reason stayed "fixed", and
    // the issue list showed a fix that the counts did not count.
    old.status_by = { ...old.status_by, reason: "replaced" };
    // The same element fails in a state of the same page, and only the name of the state changed: the name comes from the text of
    // its control, for example a list whose name is the text of its options. It is the same issue: the new ID continues the old
    // one, with its status, origin, source, solution, and decision, and the old ID is resolved with the reason "rule changed", as
    // for the other changes of an ID. Before 1.3.3 the old ID was "fixed", and the work of the locate step went.
    const mineElements = stateElements(i);
    if (![...stateElements(old)].some((k) => mineElements.has(k))) continue;
    const was = existing.get(old.id) || old;
    Object.assign(i, {
      status: was.status === "accepted" || was.status === "dismissed" ? was.status : "open",
      origin: i.origin === "unknown" && old.origin ? old.origin : i.origin,
      source: i.source?.length ? i.source : old.source || [], source_warning: i.source?.length ? i.source_warning : old.source_warning ?? null,
      solution: i.solution?.type !== "specific" && old.solution?.type === "specific" ? solutionFor(old.solution, i.id, old.id) : i.solution,
      decision: i.decision || old.decision || null,
    });
    old.status_by = { ...old.status_by, reason: "rule changed" };
    resolvedNow.splice(resolvedNow.indexOf(old), 1);
  }
  return issues.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || b.reach.pages - a.reach.pages);
}

export function buildQuestions(pages: PageRecord[], config: Config, existing: Map<string, QuestionFile>, context?: CompareContext): QuestionFile[] {
  const groups = new Map<string, Outcome[]>();
  for (const p of pages) for (const o of p.outcomes) {
    if (o.kind !== "cantTell" && o.kind !== "candidate") continue;
    const fp = questionFingerprintOf(o, config);
    groups.set(fp, [...(groups.get(fp) || []), o]);
  }
  const questions: QuestionFile[] = [];
  // The item hash tells when the item changed, so that an answer stays valid until then. The screenshot path changes with each run,
  // and the measurements vary with the animation, the timing, and the fonts of a run: they are not part of it. The random parts
  // of the ids and the names in the HTML are not part of it either: the site makes them new on each render.
  const hashes = (o: Outcome) => {
    const { screenshot: _shot, ...factsOfRun } = (o.facts || {}) as Record<string, unknown>;
    const { measured: _m, changes: _c, texts: _t, seconds: _s, hiddenWidth: _w, hiddenHeight: _h, ...stableFacts } = factsOfRun;
    // The facts that a rule measures, or that change with the content of the site, are not part of it either. Since 1.3.7.
    const leave = MEASURED_FACTS[o.rule] || [];
    const own = Object.fromEntries(Object.entries(stableFacts).filter(([k]) => !leave.includes(k)));
    // The files before 2026-10-15 hashed the measurements too, and the files before 1.3.0 hashed the HTML as it was. Their answers
    // stay when the item of this run gives one of those hashes.
    // The files of 1.3.0 and 1.3.1 kept the classes of a lazy load in the HTML: their hash, as it was and without ls-is-cached.
    // The files of 1.3.6 and older hashed the measured facts and all the options of a select.
    const html = o.html || "";
    const facts = JSON.stringify(stableFacts);
    return { item: sha(stableHtml(selectHtml(html)) + JSON.stringify(own)), legacy: [sha(stableHtml(html) + facts), sha(html + facts), sha(html + JSON.stringify(factsOfRun)), sha(stableIdsHtml(html) + facts), sha(stableIdsHtml(withoutClass(html, "ls-is-cached")) + facts)] };
  };
  // The old questions that a question of this run continues: the same ID, or the ID that 1.3.1 and older versions gave to an item
  // with the classes of a lazy load.
  const continued = new Set<string>();
  for (const [fp, list] of groups) {
    const id = "Q-" + fp.slice(0, 8);
    let old = existing.get(id);
    const layout = LAYOUT_RULES.has(list[0].rule);
    if (!old && (layout || !STYLE_RULES.has(list[0].rule))) {
      // All the old IDs of the group: items that differed only by a class of a lazy load are one item now. The question with an
      // answer continues, a person's answer first. The others go with it. Before 1.3.3 the first old ID that the search found
      // continued, and an answer of another one could go. A layout rule had one question for each item before 1.3.5: the search
      // looks at all the items of the group.
      const found = new Map<string, QuestionFile>();
      for (const o of layout ? list : list.slice(0, 20)) for (const item of [...(layout ? [o.item] : []), ...legacyItems(o.item, o.html || "")]) {
        const before = existing.get("Q-" + questionFingerprintOf(o, config, item).slice(0, 8));
        if (before && !groups.has(before.fingerprint)) found.set(before.id, before);
      }
      const olds = [...found.values()].sort((a, b) => a.id.localeCompare(b.id));
      // The old questions of a layout rule were answered one by one. Their answer continues for the whole group only when all the
      // answered ones agree. When they differ, the group waits for a new answer.
      const answerOf = (q: QuestionFile) => { const e = effectiveAnswer(q); return e.value || (e.unresolved ? "unresolved" : ""); };
      const agree = !layout || new Set(olds.filter((q) => q.person_answer || q.ai_answer).map(answerOf)).size <= 1;
      old = !agree ? undefined : olds.find((q) => q.person_answer) || olds.find((q) => q.ai_answer && q.verification) || olds.find((q) => q.ai_answer) || olds[0];
      for (const q of olds) continued.add(q.id);
    }
    if (old) continued.add(old.id);
    // The answer stays while one item of the group has a hash that the answer saw: the hash of its example, or one of the hashes
    // of its group. So a page that goes, for example after a person removes a page record, does not take the answer with it.
    const short = (h: string) => h.slice(0, 16);
    // The example of the old question, hashed as this version hashes: an item hash of an older version can differ only by a part
    // that this version leaves out, for example the class ls-is-cached.
    const now = old?.evidence ? short(hashes({ rule: old.evidence.rule, html: old.evidence.html || "", facts: old.evidence.facts || {} } as Outcome).item) : "";
    const known = new Set<string>([...(old?.item_hash ? [short(old.item_hash)] : []), ...(old?.item_hashes || []), ...(now ? [now] : [])]);
    const all = list.map((o) => ({ o, h: hashes(o) }));
    // The example that the answer saw comes first, so that the example stays when it is still in the group. Then any item that the answer saw.
    const was = old?.item_hash ? short(old.item_hash) : "";
    const match = old ? (all.find((x) => (!!was && (short(x.h.item) === was || x.h.legacy.some((h) => short(h) === was))) || (!!now && short(x.h.item) === now))
      || all.find((x) => known.has(short(x.h.item)) || x.h.legacy.some((h) => known.has(short(h))))) : undefined;
    // The example of the question: the item that the answer saw, when it is still there.
    const first = match ? match.o : list[0];
    const c = CRITERIA_BY_ID.get(first.criterion)!;
    const itemHash = hashes(first).item;
    // The short hashes of the items of the group, at most 50: enough to find one item again, and small in the question file.
    const itemHashes = [...new Set(all.map((x) => short(x.h.item)))].sort().slice(0, 50);
    const kept: QuestionFile | null = match && old ? old : null;
    const kind = first.decider === "ai" ? "review" : "person";
    questions.push({
      schema: "question/2", id, kind, issue: kept ? kept.issue : null, criterion: c.id, fingerprint: fp, item_hash: itemHash, item_hashes: itemHashes,
      context: first.context || null,
      question: first.question || first.summary,
      evidence: { url: pageKey(config.site.url, first.url), selector: first.selector, html: first.html || "", facts: first.facts || {}, rule: first.rule, summary: first.summary, occurrences: list.length, pages: [...new Set(list.map((o) => pageKey(config.site.url, o.url)))].slice(0, 50), ...(list.find((o) => o.facts?.screenshot) ? { image: list.find((o) => o.facts?.screenshot)!.facts!.screenshot } : {}),
        // All the items of the question are in a state, for example after a click: the states run on the sample pages only. Since 1.3.5.
        ...(list.every((o) => o.state?.length) ? { in_state: true } : {}) },
      ai_answer: kept ? kept.ai_answer : null, sample: kept ? kept.sample : false, person_answer: kept ? kept.person_answer : null,
      // The verification and the facts check belong to the answer: they stay while the item is the same, and go with it when the item changes.
      ...(kept && kept.verification ? { verification: kept.verification } : {}),
      ...(kept && kept.facts_check ? { facts_check: kept.facts_check } : {}),
      pages: new Set(list.map((o) => o.url)).size,
      ...(kind === "person" ? { steps: first.steps || (c.person_task ? [c.person_task] : [c.review_or_person_check || "Check the item."]) } : {}),
    });
  }
  // An old question whose pages this run did not test stays, with its answers, and is "not checked": a budget or a short check left
  // its pages, or its test runs on the sample only and its pages were not in the sample. The next run that tests a page decides it.
  if (context) {
    const now = new Set(questions.map((q) => q.id));
    for (const [id, old] of existing) {
      if (now.has(id) || continued.has(id)) continue;
      const paths: string[] = old.evidence?.pages || [];
      // A question whose items are all in a state is checked on the sample pages only, as an issue in a state. Before 1.3.5 such a
      // question went when its page left the sample, with its answers.
      const checked = needsSample(old.evidence?.rule || "", old.criterion, !!old.evidence?.in_state) && context.samplePaths ? context.samplePaths : context.testedPaths;
      // A page that did not load at a width checked the question only at its other widths: a question has no width, so the page does
      // not count as checked. The question stays one more run, with its answers.
      const partial = (p: string) => !!(context.widthsNotLoaded?.get(p) || context.widthsNotLoaded?.get(otherSlash(p)))?.length;
      // A page that the settings leave out now ends the question, as a page that is gone does. Since 1.3.6.
      const outside = (p: string) => !!context.outOfScopePaths && hasPath(context.outOfScopePaths, p);
      if (!paths.length || paths.some((p) => (hasPath(checked, p) && !partial(p)) || hasPath(context.gonePaths, p)) || paths.every(outside)) continue;
      questions.push({ ...old, not_checked: true });
    }
  }
  return questions.sort((a, b) => a.criterion.localeCompare(b.criterion, undefined, { numeric: true }) || b.pages - a.pages);
}
