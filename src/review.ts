// The review page for a person: a local server that shows the results of the last audit in four views, Overview, Decisions,
// Issues, and Method, and a read-only client report. Each answer and each decision goes into its question or issue file at once.
// Nothing leaves the machine. See PLAN.md section 7.4. The page itself is in review-page.ts, the client report in client-report.ts.
// Since 1.3.7 the page has separate views, a queue of decisions with one item at a time, and an undo for each decision.
import { execFile } from "node:child_process";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join, normalize } from "node:path";
import { CRITERIA_BY_ID } from "./criteria.ts";
import type { Config } from "./config.ts";
import { answerQuestion, checkFacts, clearPersonAnswer, effectiveAnswer, personChecks, personGroup, reopenIssue, setIssueStatus, type PersonGroup } from "./decide.ts";
import { familyOf } from "./own/families.ts";
import { fileName, fixGroups } from "./fix-groups.ts";
import { loadExisting, proposesNoChange } from "./issues.ts";
import { refresh } from "./refresh.ts";
import { readHistory, type Overview } from "./overview.ts";
import { hasPlain, plainOf, whoOf } from "./own/plain.ts";
import { reviewPage } from "./review-page.ts";
import { clientReport, judgmentText } from "./client-report.ts";
import { howToSee, SHOW_RULES, showLayout } from "./show.ts";

export interface ReviewOptions { port?: number; all?: boolean; open?: boolean; log?: (line: string) => void }

const SEVERITY = ["critical", "serious", "moderate", "minor"];
const OPEN = new Set(["new", "open", "reopened"]);

/** Who fixes an issue, from its origin: the content editors, the developers, the designers, or the vendor of a third-party part. */
export function whoFixes(origin: string): string {
  if (origin === "content" || origin === "media") return "Content";
  if (origin === "code" || origin === "configuration" || origin === "third-party-controlled") return "Development";
  if (origin === "design") return "Design";
  if (origin === "third-party-uncontrolled") return "Vendor";
  return "Not known yet";
}

const decodeHtml = (s: string) => s.replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch { return " "; } })
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch { return " "; } }).replace(/&amp;/g, "&");
const short = (s: string) => s.length > 70 ? s.slice(0, 69).trimEnd() + "…" : s;

/** A short name of an element for a person, for a row of a list: its text, a text attribute, the file of an image, or the host of a
 *  frame. Never a CSS selector or HTML: the client report shows it. Before 1.3.9 a row could show a selector, for example ".avatar",
 *  or the start of an HTML that the audit cut, for example '<td style="'. */
export function labelOf(html: string): string {
  // The audit cuts a long HTML, so it can end in an open tag.
  const h = String(html || "").replace(/<[^>]*$/, "");
  const text = decodeHtml(h.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  if (text) return short(text);
  const attr = (name: string) => h.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, "i"))?.[1]?.trim() || "";
  for (const a of ["alt", "aria-label", "title", "placeholder", "label"]) { const v = attr(a); if (v) return short(decodeHtml(v).replace(/\s+/g, " ")); }
  const tag = h.match(/^\s*<\s*([a-z0-9-]+)/i)?.[1]?.toLowerCase() || "";
  if (tag === "input" && /\stype\s*=\s*"(submit|button|reset)"/i.test(h) && attr("value")) return short(decodeHtml(attr("value")));
  const src = attr("src") || attr("data-src");
  if (src) {
    try {
      const u = new URL(decodeHtml(src), "https://page.invalid/");
      if (["iframe", "embed", "object"].includes(tag)) return u.host === "page.invalid" ? "" : u.host;
      if (u.protocol === "data:") return "";
      return short(decodeURIComponent(u.pathname.split("/").pop() || ""));
    } catch { return ""; }
  }
  return "";
}

/** The title of a row: the plain title of the rule, or the summary of the rule when it has no plain words. The fallback of the
 *  criterion, for example "Info and Relationships: the page does not meet it", is the same for many rules. */
function titleOf(rule: string, criterion: string, summary: string): string {
  if (hasPlain(rule) || !summary) return plainOf(rule, criterion).title;
  const s = String(summary).trim().replace(/\.$/, "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** What a person meets, in plain words. A rule with no plain words gets the criterion it fails: the text of the criterion's review
 *  describes another kind of problem, for example a heading with no code for a rule about ARIA roles. */
function experienceOf(rule: string, criterion: string): string {
  if (hasPlain(rule)) return plainOf(rule, criterion).experience;
  const c = CRITERIA_BY_ID.get(criterion);
  return c ? `This fails WCAG ${criterion} ${c.name}, level ${c.level}.` : "This fails a criterion of WCAG.";
}

function absolute(site: string, url: string): string {
  try { return new URL(url, site + "/").toString(); } catch { return site + url; }
}

function summaryOf(outDir: string): Record<string, any> | null {
  try { return JSON.parse(readFileSync(join(outDir, "summary.json"), "utf8")); } catch { return null; }
}

/** The group of a question in the queue of decisions (personGroup in decide.ts). null: the question is not for a person. With all,
 *  every open review question is in the queue. */
function groupOf(q: Record<string, any>, all: boolean): PersonGroup | "other" | null {
  return personGroup(q) || (all && q.kind === "review" ? "other" : null);
}

/** The date of the decision of a person on a question, or "". */
function decidedOn(q: Record<string, any>): string {
  return String(q.person_answer?.date || q.facts_check?.date || "");
}

function answerText(q: Record<string, any>): string {
  if (q.person_answer) return ({ issue: "Issue", "no issue": "Not an issue", "not applicable": "Not applicable" } as Record<string, string>)[q.person_answer.value] || q.person_answer.value;
  if (q.facts_check) return q.facts_check.result === "confirmed" ? "The facts are right" : "A fact is wrong, sent back to the AI";
  return "";
}

const DECISION_TEXT: Record<string, string> = { accepted: "Accepted as a known risk", dismissed: "Dismissed", kept: "Kept as an issue" };

/** The data of the page: the rows of the lists and the numbers of the overview. The details of one item come from /api/item. */
export function reviewData(config: Config, outDir: string, all: boolean): Record<string, any> {
  const site = config.site.url;
  const host = site.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const summary = summaryOf(outDir);
  const run = String(summary?.run || "");
  const runDate = run.slice(0, 10);
  const questions = [...loadExisting(outDir, "questions").values()].filter((q) => !q.not_checked);
  const issues = [...loadExisting(outDir, "issues").values()];
  const byReach = (a: Record<string, any>, b: Record<string, any>) => (b.pages || 0) - (a.pages || 0);

  // The queue: the questions for a person, waiting or decided in this audit, and the issues for which the review proposed no change.
  const decisions: Record<string, any>[] = [];
  for (const q of questions.sort(byReach)) {
    const group = groupOf(q, all);
    if (!group) continue;
    const decided = decidedOn(q);
    if (decided && decided < runDate) continue;
    decisions.push({ id: q.id, type: "question", group, title: titleOf(q.evidence?.rule, q.criterion, q.evidence?.summary), hint: labelOf(q.evidence?.html), path: q.evidence?.url || "", pages: q.pages || 0,
      criterion: q.criterion, done: !!decided, answer: answerText(q), sample: group === "sample" });
  }
  for (const i of issues.filter((x) => OPEN.has(x.status) || (x.decision && ["accepted", "dismissed"].includes(x.status))).sort((a, b) => (b.reach?.pages || 0) - (a.reach?.pages || 0))) {
    if (!proposesNoChange(i)) continue;
    const decided = i.decision?.date ? String(i.decision.date) : "";
    if (!OPEN.has(i.status) && !(decided && decided >= runDate)) continue;
    if (i.decision && decided < runDate) continue;
    decisions.push({ id: i.id, type: "issue", group: "proposal", title: titleOf(i.rule.id, i.wcag.criterion, i.summary), hint: labelOf(i.examples?.[0]?.html), path: i.examples?.[0]?.url || "",
      pages: i.reach?.pages || 0, criterion: i.wcag.criterion, done: !!i.decision, answer: i.decision ? DECISION_TEXT[i.decision.status] || i.decision.status : "", sample: false });
  }

  // The issues: the open ones, the ones a person decided, and the ones this audit resolved.
  const { groups, byIssue } = fixGroups(issues);
  const issueRows = issues.filter((i) => OPEN.has(i.status) || ["accepted", "dismissed"].includes(i.status) || (i.status === "resolved" && i.status_by?.run === run))
    .sort((a, b) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity) || (b.reach?.pages || 0) - (a.reach?.pages || 0))
    .map((i) => {
      const c = CRITERIA_BY_ID.get(i.wcag.criterion);
      return { id: i.id, title: titleOf(i.rule.id, i.wcag.criterion, i.summary), experience: experienceOf(i.rule.id, i.wcag.criterion), hint: labelOf(i.examples?.[0]?.html), path: i.examples?.[0]?.url || "", severity: i.severity, pages: i.reach?.pages || 0,
        criterion: i.wcag.criterion, level: c?.level || "", who: whoFixes(i.origin), status: i.status, isNew: i.status === "new", proposal: proposesNoChange(i),
        decision: i.decision ? DECISION_TEXT[i.decision.status] || i.decision.status : "", reason: i.status === "resolved" ? i.status_by?.reason || "" : "",
        fix: byIssue.get(i.id)?.id || "", fromAnswer: !!i.question };
    });

  const open = issueRows.filter((i) => OPEN.has(i.status));
  // The things to fix: each open issue, or one fix group for all its issues, in the order of the severity and then the pages. The
  // client report and the overview list them, so that one change shows as one line. Since 1.3.9.
  const fixes: Record<string, any>[] = [];
  const seen = new Set<string>();
  for (const i of open) {
    const g = byIssue.get(i.id);
    if (!g) { fixes.push({ id: i.id, ids: [i.id], fix: "", count: 1, title: i.title, experience: i.experience, hint: i.hint, path: i.path, severity: i.severity, pages: i.pages, pagesExact: true,
      who: i.who, criterion: i.criterion, proposal: i.proposal, file: "", line: null }); continue; }
    if (seen.has(g.id)) continue;
    seen.add(g.id);
    const members = open.filter((x) => byIssue.get(x.id) === g);
    const top = members[0];
    fixes.push({ id: top.id, ids: members.map((x) => x.id), fix: g.id, count: members.length, title: top.title, experience: top.experience,
      hint: `One change fixes ${members.length} issues: ${fileName(g.file)}, line ${g.line}`, path: top.path, severity: top.severity, pages: g.pages, pagesExact: g.pages_exact,
      who: top.who, criterion: top.criterion, proposal: members.every((x) => x.proposal), file: g.file, line: g.line });
  }
  fixes.sort((a, b) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity) || b.pages - a.pages);
  // Who answered the questions of the run: the method text of the page and of the client report says it from these counts, never
  // from a fixed sentence. Since 1.3.8.
  // The groups do not overlap: a person's answer first, then the review questions by their AI answers, then the checks for a person.
  const byPerson = questions.filter((q) => q.person_answer);
  const review = questions.filter((q) => !q.person_answer && q.kind === "review").map((q) => effectiveAnswer(q));
  const answers = {
    questions: questions.length,
    person: byPerson.length,
    agreed: review.filter((e) => e.by === "agreement").length,
    aiOnly: review.filter((e) => e.by === "ai").length,
    unresolved: review.filter((e) => e.unresolved).length,
    // Of the unresolved: the AI answers say that only a person can decide, for example by playing a video. Since 1.3.9.
    unsure: questions.filter((q) => !q.person_answer && personGroup(q) === "unsure" && effectiveAnswer(q).unresolved).length,
    waitingAi: review.filter((e) => !e.by && !e.unresolved).length,
    personChecks: questions.filter((q) => !q.person_answer && q.kind === "person").length,
    // The answers of the AI that a person checked, and how many of them the person agreed with: all of them, and the random sample
    // alone. The client report says it. Since 1.3.10.
    ...(() => { const c = personChecks(questions); return { checkedByPerson: c.checked.length, personAgreed: c.agreed, checkedRandom: c.random, randomAgreed: c.randomAgreed }; })(),
  };
  const history = readHistory(outDir).filter((h) => h.overview);
  const prev = history.length >= 2 ? history[history.length - 2] : null;
  const o: Overview | undefined = summary?.overview;
  const counts = summary?.counts || {};
  const cov = summary?.coverage || {};
  // The issues that this audit closed because the settings leave their pages out now. Since 1.3.6.
  const outOfScope = issues.filter((i) => i.status === "page removed" && i.status_by?.reason === "out of scope" && i.status_by?.run === run).length;
  // The new issues that came from an answer to a question, and the ones that came from the tests. Answers to the questions of earlier
  // audits make new issues, so the open issues can go up while the site stays the same. Since 1.3.9.
  const newIssues = issues.filter((i) => i.status === "new" && !i.replaces);
  const newFromAnswers = newIssues.filter((i) => i.question).length;
  // The date of the results: the last answer, decision, or refresh, and not only the date of the run. Since 1.3.9.
  const dates = [runDate, String(summary?.versions?.refreshed_on || ""),
    ...questions.flatMap((q) => [q.ai_answer?.date, q.verification?.date, q.person_answer?.date, q.facts_check?.date]), ...issues.map((i) => i.decision?.date)]
    .filter(Boolean).map((d) => String(d).slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const updated = dates.length ? dates[dates.length - 1] : runDate;
  const grouped = groups.reduce((n, g) => n + g.issues.length, 0);
  return {
    host, site, run, runDate, updated, environment: config.site.environment, all, outDir,
    versions: summary?.versions || null,
    preparedBy: config.report?.prepared_by || "", contact: config.report?.contact || "",
    overview: {
      open: open.length,
      prevOpen: prev ? prev.overview!.open_issues : null,
      prevRun: prev ? prev.run : null,
      newCount: counts.new || 0,
      newFromAnswers: Math.min(newFromAnswers, counts.new || 0),
      newFromTests: Math.max(0, (counts.new || 0) - newFromAnswers),
      resolved: (counts.resolved || 0) + (counts.resolved_rule_changed || 0) + (counts.resolved_not_an_issue || 0),
      resolvedFixed: counts.resolved || 0,
      resolvedRule: counts.resolved_rule_changed || 0,
      // A person found that the issue is not an issue. Not a fix. Since 1.3.10.
      resolvedNotIssue: counts.resolved_not_an_issue || 0,
      reopened: counts.reopened || 0,
      pageRemoved: counts.page_removed || 0,
      outOfScope,
      share: o ? o.levels.AA.units.share_no_failure : null,
      prevShare: prev ? prev.overview!.share_no_failure_AA : null,
      failedUnits: o ? o.levels.AA.units.failed : null,
      unknownUnits: o ? o.levels.AA.units.unknown : null,
      prevFailedUnits: prev?.overview?.failed_units_AA ?? null,
      prevUnknownUnits: prev?.overview?.unknown_units_AA ?? null,
      fixGroups: { groups: groups.length, issues: grouped },
      pagesNoFailure: o ? o.levels.AA.pages : null,
      levels: o ? o.levels : null,
      definition: o?.definition || "",
      trend: history.slice(-5).map((h) => ({ run: h.run, open: h.overview!.open_issues })),
      coverage: { pages: cov.pages_tested || 0, sample: cov.pages_in_sample || 0, states: cov.states_tested || 0, forms: cov.forms_tested || 0, processes: cov.processes_tested || 0,
        widths: config.crawl.widths, notRun: cov.tests_not_run || [] },
    },
    answers, answersText: judgmentText(answers),
    decisions,
    issues: issueRows,
    fixes,
  };
}

/** The widths of a question: the widths of its issue, or else the widths of the audit. A question file keeps no width. */
function widthsOf(outDir: string, q: Record<string, any>, config: Config): number[] {
  if (q.issue) {
    try { const i = JSON.parse(readFileSync(join(outDir, "issues", q.issue + ".json"), "utf8")); if (i.reach?.widths?.length) return i.reach.widths; } catch { /* no issue file */ }
  }
  return config.crawl.widths;
}

/** The details of one question or one issue, for the side panel. */
export function itemDetails(config: Config, outDir: string, id: string): Record<string, any> | null {
  const site = config.site.url;
  if (/^Q-[0-9a-f]{8}$/.test(id)) {
    const q = loadExisting(outDir, "questions").get(id);
    if (!q) return null;
    const ex = q.evidence || {};
    const c = CRITERIA_BY_ID.get(q.criterion);
    const ai: Record<string, any>[] = [];
    if (q.ai_answer) ai.push({ who: q.kind === "person" ? "What the AI found" : "First AI review", ...q.ai_answer });
    if (q.verification) ai.push({ who: "Second AI review", ...q.verification });
    const effective = effectiveAnswer(q);
    return {
      type: "question", id: q.id, kind: q.kind, title: titleOf(ex.rule, q.criterion, ex.summary), question: q.question, criterion: q.criterion, criterionName: c?.name || "", level: c?.level || "",
      pages: q.pages || 0, pagesList: ex.pages || [], url: absolute(site, ex.url || ""), path: ex.url || "", inState: !!ex.in_state, counts: familyOf(ex.rule) || "",
      experience: experienceOf(ex.rule, q.criterion), steps: q.kind === "person" ? q.steps || [] : [], image: ex.image ? `/shot?p=${encodeURIComponent(ex.image)}` : "",
      // A layout finding shows only under the conditions of its test: the steps to see it, and the button that opens the page with
      // them. Since 1.3.10.
      ...(SHOW_RULES.has(ex.rule) ? { howTo: howToSee(ex.rule, widthsOf(outDir, q, config), config.crawl.widths), showable: true } : {}),
      ai: ai.map((a) => ({ who: a.who, value: a.value, confidence: a.confidence || "", reason: a.reason || "", facts: a.facts || [] })),
      factsButtons: q.kind === "review" && !!q.ai_answer && q.ai_answer.value !== "unsure",
      sample: groupOf(q, false) === "sample", unresolved: effective.unresolved,
      raw: `${ex.selector || ""}\n${ex.html || ""}\n${JSON.stringify(ex.facts || {}, null, 1)}`,
      person: q.person_answer || null, factsCheck: q.facts_check || null, answer: answerText(q), issue: q.issue || null,
    };
  }
  if (/^ISS-[0-9a-f]{8}$/.test(id)) {
    const all = loadExisting(outDir, "issues");
    const i = all.get(id);
    if (!i) return null;
    const g = fixGroups([...all.values()]).byIssue.get(id);
    const c = CRITERIA_BY_ID.get(i.wcag.criterion);
    const ex = (i.examples || [])[0] || {};
    const shot = (i.examples || []).find((e: Record<string, any>) => e.facts?.screenshot)?.facts?.screenshot;
    const source = (i.source || []).filter((s: Record<string, unknown>) => s.file || s.item).slice(0, 4).map((s: Record<string, any>) => ({
      text: s.file ? `${s.file}${s.line ? `, line ${s.line}` : ""}` : [s.item, s.block].filter(Boolean).join(" · "), edit: s.edit_url || "" }));
    const paths = [...new Set((i.examples || []).map((e: Record<string, any>) => e.url))];
    return {
      type: "issue", id: i.id, title: titleOf(i.rule.id, i.wcag.criterion, i.summary), experience: experienceOf(i.rule.id, i.wcag.criterion), affects: whoOf(i.wcag.criterion), rule: hasPlain(i.rule.id) ? i.summary || "" : "",
      severity: i.severity, criterion: i.wcag.criterion, criterionName: c?.name || "", level: c?.level || "", pages: i.reach?.pages || 0, who: whoFixes(i.origin),
      certainty: i.certainty === "fail" ? "Found by a rule or a person" : i.certainty === "ai fail" ? "Two AI reviews agree" : i.certainty,
      status: i.status, reason: i.status_by?.reason || "", firstSeen: i.first_seen || "",
      example: { url: absolute(site, ex.url || ""), path: ex.url || "", width: ex.width || null, state: (ex.state || []).join(" › "), image: shot ? `/shot?p=${encodeURIComponent(shot)}` : "" },
      origin: i.origin, source, sourceWarning: i.source_warning || "",
      fix: { summary: i.solution?.summary || "", steps: i.solution?.steps || [], example: i.solution?.example || "", expected: i.solution?.expected_result || "", specific: i.solution?.type === "specific" },
      proposal: proposesNoChange(i), paths, element: `${ex.selector || ""}\n${ex.html || ""}`, question: i.question || null,
      fixGroup: g ? { id: g.id, file: g.file, line: g.line, count: g.issues.length, pages: g.pages, pagesExact: g.pages_exact } : null,
      decision: i.decision || null, decisionText: i.decision ? DECISION_TEXT[i.decision.status] || i.decision.status : "",
    };
  }
  return null;
}

function readBody(req: IncomingMessage): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; if (data.length > 1e6) reject(new Error("too large")); });
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
  });
}

/** True when a request comes from the page itself: a write needs the header that only a script of the page sends, so that another
 *  site in the same browser cannot post a form to the local server. */
function fromPage(req: IncomingMessage): boolean {
  return req.headers["x-a11y-review"] === "1" && String(req.headers["content-type"] || "").startsWith("application/json");
}

export function serveReview(config: Config, outDir: string, options: ReviewOptions = {}): Promise<{ url: string; close: () => void }> {
  const port = options.port || 4111;
  const log = options.log || (() => {});
  const all = !!options.all;
  const json = (res: ServerResponse, code: number, body: unknown) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(body)); };
  const html = (res: ServerResponse, body: string, extra: Record<string, string> = {}) => { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...extra }); res.end(body); };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/") { html(res, reviewPage(reviewData(config, outDir, all))); return; }
      if (req.method === "GET" && url.pathname === "/client") {
        const download = url.searchParams.get("download") === "1";
        const data = reviewData(config, outDir, false);
        const name = `accessibility-report-${data.host.replace(/[^a-z0-9.-]+/gi, "-")}-${data.runDate || "latest"}.html`;
        html(res, clientReport(data, { local: !download }), download ? { "content-disposition": `attachment; filename="${name}"` } : {});
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/item") {
        const d = itemDetails(config, outDir, String(url.searchParams.get("id") || ""));
        if (!d) { json(res, 404, { error: "no such item" }); return; }
        json(res, 200, d);
        return;
      }
      if (req.method === "GET" && url.pathname === "/shot") {
        // Only a screenshot under runs/ of this results folder.
        const p = normalize(url.searchParams.get("p") || "");
        if (!p.startsWith("runs/") || !p.endsWith(".png") || p.includes("..")) { json(res, 400, { error: "not a screenshot" }); return; }
        const file = join(outDir, p);
        if (!existsSync(file)) { json(res, 404, { error: "no file" }); return; }
        res.writeHead(200, { "content-type": "image/png", "content-length": statSync(file).size });
        createReadStream(file).pipe(res);
        return;
      }
      if (req.method === "POST") {
        if (!fromPage(req)) { json(res, 403, { error: "The request does not come from the review page." }); return; }
        const b = await readBody(req);
        const by = String(b.by || "").trim();
        const id = String(b.id || "");
        const needName = () => { if (!by) throw new Error("Give your name first."); };
        if (url.pathname === "/answer") {
          needName();
          if (!["issue", "no issue", "not applicable"].includes(b.value)) throw new Error("The answer is issue, no issue, or not applicable.");
          const q = answerQuestion(outDir, id, b.value, { by, note: b.note ? String(b.note) : undefined });
          log(`answer ${q.id}: ${b.value} by ${by}`);
          json(res, 200, { ok: true, id: q.id }); return;
        }
        if (url.pathname === "/facts") {
          needName();
          const result = b.result === "confirmed" ? "confirmed" : "wrong";
          if (result === "wrong" && !String(b.note || "").trim()) throw new Error("Say in the note which fact is wrong.");
          const q = checkFacts(outDir, id, result, by, b.note ? String(b.note) : undefined);
          log(`facts ${q.id}: ${result} by ${by}`);
          json(res, 200, { ok: true, id: q.id }); return;
        }
        if (url.pathname === "/clear") {
          const q = clearPersonAnswer(outDir, id);
          log(`answer taken back ${q.id}`);
          json(res, 200, { ok: true, id: q.id }); return;
        }
        if (url.pathname === "/decide") {
          needName();
          const status = b.status === "accepted" ? "accepted" : b.status === "kept" ? "kept" : "dismissed";
          const i = setIssueStatus(outDir, id, status, by, String(b.reason || ""), b.note ? String(b.note) : undefined);
          log(`${status} ${i.id} by ${by}`);
          json(res, 200, { ok: true, id: i.id, status: i.status }); return;
        }
        if (url.pathname === "/reopen") {
          const i = reopenIssue(outDir, id, by || "reviewer");
          log(`decision taken back ${i.id}`);
          json(res, 200, { ok: true, id: i.id, status: i.status }); return;
        }
        if (url.pathname === "/show") {
          // Opens the page of a layout question with the conditions of its test, and gives the screenshots. Since 1.3.10.
          const q = loadExisting(outDir, "questions").get(id);
          if (!q) throw new Error(`No question ${id}.`);
          log(`show ${id}: ${q.evidence?.rule} on ${q.evidence?.url}`);
          json(res, 200, await showLayout(config, q, widthsOf(outDir, q, config))); return;
        }
        if (url.pathname === "/refresh") {
          const r = refresh(config, outDir, log);
          json(res, 200, { ok: true, issues: r.issues, questions: r.questions }); return;
        }
      }
      json(res, 404, { error: "not found" });
    } catch (e) {
      json(res, 400, { error: (e as Error).message });
    }
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const url = `http://127.0.0.1:${port}/`;
      log(`the review page is at ${url}`);
      if (options.open !== false && process.platform === "darwin") execFile("open", [url], () => {});
      resolve({ url, close: () => server.close() });
    });
  });
}
