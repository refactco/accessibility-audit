// The grouper and a first comparer: outcomes become issues and questions with fingerprints, and the stored issues give the statuses.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CRITERIA_BY_ID } from "./criteria.ts";
import { pathOf, templateOf } from "./crawl.ts";
import type { Config } from "./config.ts";
import { effectiveAnswer } from "./decide.ts";
import type { Outcome, PageRecord, Severity } from "./types.ts";

const SEVERITY_ORDER: Severity[] = ["critical", "serious", "moderate", "minor"];

export function sha(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}

/** Rules whose cause is a style or a shared component. Their issues group by the kind of element, not by its text. */
const STYLE_RULES = new Set(["color-contrast", "link-in-text-block", "target-size", "avoid-inline-spacing", "focus-not-visible", "focus-entirely-hidden", "target-too-small", "placeholder-contrast", "control-border-contrast", "focus-indicator-contrast", "text-cut-with-spacing", "text-cut-at-zoom", "change-of-context-on-focus", "control-not-focusable", "control-without-role", "composite-parts-unreachable", "expanded-state-not-updated", "drag-listener", "down-event-listener"]);

/** The kind of an element: its tag and its classes, from the HTML of the outcome. A contrast issue has the kind of its color pair. */
export function kindOf(o: Outcome): string {
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
  const role = (html.match(/\srole="([^"]*)"/) || [, ""])[1];
  return `${tag}${cls ? "." + cls : ""}${role ? "[" + role + "]" : ""}`;
}

/** The fingerprint of an issue: the rule, the element without its position and its page, and the state.
 *  A shared component gives one issue for all its pages, in all states, because its cause is one style or one component.
 *  A content item, with its source or address, gives one issue for each item and each state. */
export function fingerprintOf(o: Outcome, _config: Config): string {
  if (STYLE_RULES.has(o.rule)) return sha(`${o.engine}|${o.rule}|${o.criterion}|${kindOf(o)}`);
  return sha(`${o.engine}|${o.rule}|${o.criterion}|${o.item}|${o.state.join(">")}`);
}

export function questionFingerprintOf(o: Outcome, _config: Config): string {
  const c = CRITERIA_BY_ID.get(o.criterion);
  const context = c?.context_dependent ? "|" + (o.context || "") : "";
  // A page-level rule gives one question for each page. The same-title and page-not-linked rules group their pages into one question.
  const place = o.rule.startsWith("page-") && o.rule !== "page-not-linked" ? "|" + pathOf(o.url) : "";
  const item = STYLE_RULES.has(o.rule) ? kindOf(o) : o.item;
  return sha(`${o.engine}|${o.rule}|${o.criterion}|${item}${context}${place}`);
}

export type IssueFile = Record<string, any>;
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
  /** The paths of the pages that the audit tested, with their query. */
  testedPaths: Set<string>;
  /** The paths of the pages in the sample: the template tests and the states ran only there. */
  samplePaths?: Set<string>;
  /** The paths of the pages that gave 404 or 410. */
  gonePaths: Set<string>;
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
  const issues: IssueFile[] = [];
  for (const [fp, list] of groups) {
    const first = list[0];
    const c = CRITERIA_BY_ID.get(first.criterion)!;
    const id = "ISS-" + fp.slice(0, 8);
    const old = existing.get(id);
    // A rule or a person gives "fail". The AI alone gives "ai fail".
    const certainty = first.kind === "failed" ? "fail" : list.some((o) => o.answeredBy === "person") ? "fail" : "ai fail";
    const urls = [...new Set(list.map((o) => o.url))];
    const templates = [...new Set(urls.map((u) => templateOf(config, u)).filter((t): t is string => !!t))];
    const severity = SEVERITY_ORDER.find((s) => list.some((o) => o.severity === s)) || "moderate";
    const seenExamples = new Set<string>();
    const examples = list.filter((o) => { const k = o.url + "|" + o.width + "|" + o.selector; if (seenExamples.has(k)) return false; seenExamples.add(k); return true; }).slice(0, 5)
      .map((o) => ({ url: pathOf(o.url), width: o.width, state: o.state, selector: o.selector, html: o.html || "", facts: o.facts || {} }));
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
      question: list.find((o) => o.questionId)?.questionId || null, replaces: null, origin: old?.origin || "unknown", source: old?.source || [], source_warning: old?.source_warning ?? null,
      examples,
      // The specific solution of the skill stays. The general solution of the engine is only for an issue with no specific one yet.
      solution: old?.solution?.type === "specific" ? old.solution : { type: "general", summary: first.solution.summary, steps: first.solution.steps, ...(first.solution.example ? { example: first.solution.example } : {}) },
      decision: old?.decision || null,
      untrusted_fields: ["examples[].html", "examples[].facts"],
    });
  }
  // Stored issues that the audit did not find again: resolved when all their pages were tested, not checked when not,
  // page removed when all their pages are gone, and resolved with the reason "rule changed" when the engine version changed.
  const resolvedNow: IssueFile[] = [];
  for (const [id, old] of existing) {
    if (issues.some((i) => i.id === id)) continue;
    // A new issue of this same run that the refresh does not find again came from an answer that changed since, for example
    // a first AI answer that the verifier did not confirm. It never existed in a finished run, so it goes, with no resolution.
    if (old.status === "new" && old.status_by?.run === run) continue;
    if (old.status === "resolved" || old.status === "page removed" || old.status === "dismissed") { issues.push(old); continue; }
    const paths: string[] = (old.examples || []).map((e: { url: string }) => e.url);
    const by = { who: "engine", mode: "automatic", date, run };
    if (context && paths.length && paths.every((p) => context.gonePaths.has(p))) { issues.push({ ...old, status: "page removed", status_by: { ...by, reason: "page removed" } }); continue; }
    // An issue from a template test or a state needs its pages in the sample of this run, because those tests run only there.
    const criterion = CRITERIA_BY_ID.get(old.wcag?.criterion);
    const templateIssue = criterion?.test_groups?.[0] === "template" || (old.examples || []).some((e: { state?: string[] }) => e.state && e.state.length);
    const checked = templateIssue && context?.samplePaths ? context.samplePaths : context?.testedPaths;
    if (context && checked && !paths.every((p) => checked.has(p))) { issues.push({ ...old, status: "not checked", status_by: by }); continue; }
    const current = old.rule?.engine === "axe-core" ? context?.versions.axe_core : context?.versions.engine;
    const reason = context && current && old.rule?.engine_version !== current ? "rule changed" : "fixed";
    const resolved = { ...old, status: "resolved", status_by: { ...by, reason } };
    issues.push(resolved);
    if (reason === "fixed") resolvedNow.push(resolved);
  }
  // A new issue with the rule and the pages of an issue that was resolved in this run replaces it: the markup changed.
  for (const i of issues) {
    if (i.status !== "new") continue;
    const pagesOf = (x: IssueFile) => new Set((x.examples || []).map((e: { url: string }) => e.url));
    const mine = pagesOf(i);
    const old = resolvedNow.find((r) => r.rule.id === i.rule.id && r.wcag.criterion === i.wcag.criterion && [...pagesOf(r)].some((p) => mine.has(p)));
    if (old) { i.replaces = old.id; i.first_seen = old.first_seen; }
  }
  return issues.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || b.reach.pages - a.reach.pages);
}

export function buildQuestions(pages: PageRecord[], config: Config, existing: Map<string, QuestionFile>): QuestionFile[] {
  const groups = new Map<string, Outcome[]>();
  for (const p of pages) for (const o of p.outcomes) {
    if (o.kind !== "cantTell" && o.kind !== "candidate") continue;
    const fp = questionFingerprintOf(o, config);
    groups.set(fp, [...(groups.get(fp) || []), o]);
  }
  const questions: QuestionFile[] = [];
  for (const [fp, list] of groups) {
    const first = list[0];
    const c = CRITERIA_BY_ID.get(first.criterion)!;
    const id = "Q-" + fp.slice(0, 8);
    // The item hash tells when the item changed, so that an answer stays valid until then. The screenshot path changes with each run,
    // and the measurements vary with the animation, the timing, and the fonts of a run: they are not part of it.
    const { screenshot: _shot, ...factsOfRun } = (first.facts || {}) as Record<string, unknown>;
    const { measured: _m, changes: _c, texts: _t, seconds: _s, hiddenWidth: _w, hiddenHeight: _h, ...stableFacts } = factsOfRun;
    const itemHash = sha((first.html || "") + JSON.stringify(stableFacts));
    // The files before 2026-10-15 hashed the measurements too. Their answers stay when the facts of this run give that hash.
    const legacyHash = sha((first.html || "") + JSON.stringify(factsOfRun));
    const old = existing.get(id);
    const keep = old && (old.item_hash === itemHash || old.item_hash === legacyHash);
    const kind = first.decider === "ai" ? "review" : "person";
    questions.push({
      schema: "question/2", id, kind, issue: keep ? old.issue : null, criterion: c.id, fingerprint: fp, item_hash: itemHash,
      context: first.context || null,
      question: first.question || first.summary,
      evidence: { url: pathOf(first.url), selector: first.selector, html: first.html || "", facts: first.facts || {}, rule: first.rule, summary: first.summary, occurrences: list.length, pages: [...new Set(list.map((o) => pathOf(o.url)))].slice(0, 50), ...(list.find((o) => o.facts?.screenshot) ? { image: list.find((o) => o.facts?.screenshot)!.facts!.screenshot } : {}) },
      ai_answer: keep ? old.ai_answer : null, sample: keep ? old.sample : false, person_answer: keep ? old.person_answer : null,
      // The verification and the facts check belong to the answer: they stay while the item is the same, and go with it when the item changes.
      ...(keep && old.verification ? { verification: old.verification } : {}),
      ...(keep && old.facts_check ? { facts_check: old.facts_check } : {}),
      pages: new Set(list.map((o) => o.url)).size,
      ...(kind === "person" ? { steps: first.steps || (c.person_task ? [c.person_task] : [c.review_or_person_check || "Check the item."]) } : {}),
    });
  }
  return questions.sort((a, b) => a.criterion.localeCompare(b.criterion, undefined, { numeric: true }) || b.pages - a.pages);
}
