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
import { answerQuestion, checkFacts, clearPersonAnswer, effectiveAnswer, reopenIssue, setIssueStatus } from "./decide.ts";
import { familyOf } from "./own/families.ts";
import { loadExisting, proposesNoChange } from "./issues.ts";
import { refresh } from "./refresh.ts";
import { readHistory, type Overview } from "./overview.ts";
import { hasPlain, plainOf, whoOf } from "./own/plain.ts";
import { reviewPage } from "./review-page.ts";
import { clientReport } from "./client-report.ts";

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

/** The text of an HTML in a few words, for a row of a list: the text of the element, or its tag. */
function hintOf(html: string, selector: string): string {
  const text = String(html || "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 70);
  const alt = String(html || "").match(/\salt="([^"]*)"/)?.[1] || String(html || "").match(/\saria-label="([^"]*)"/)?.[1];
  if (alt) return alt.slice(0, 70);
  const last = String(selector || "").split(" > ").pop() || "";
  return /^(html|body|main)$/.test(last) ? "" : last.slice(0, 70);
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

/** The group of a question in the queue of decisions, from the AI answers alone, so that a question keeps its group after a person
 *  answers it. null: the question is not for a person. With all, every open review question is in the queue. */
function groupOf(q: Record<string, any>, all: boolean): "differ" | "sample" | "person" | "other" | null {
  if (q.kind === "person") return "person";
  if (q.kind !== "review") return null;
  const ai = q.ai_answer, v = q.verification;
  if ((ai && ai.value === "unsure") || (v && !v.agrees)) return "differ";
  if (ai && !v && q.sample) return "sample";
  return all ? "other" : null;
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
    decisions.push({ id: q.id, type: "question", group, title: titleOf(q.evidence?.rule, q.criterion, q.evidence?.summary), hint: hintOf(q.evidence?.html, q.evidence?.selector), path: q.evidence?.url || "", pages: q.pages || 0,
      criterion: q.criterion, done: !!decided, answer: answerText(q), sample: group === "sample" });
  }
  for (const i of issues.filter((x) => OPEN.has(x.status) || (x.decision && ["accepted", "dismissed"].includes(x.status))).sort((a, b) => (b.reach?.pages || 0) - (a.reach?.pages || 0))) {
    if (!proposesNoChange(i)) continue;
    const decided = i.decision?.date ? String(i.decision.date) : "";
    if (!OPEN.has(i.status) && !(decided && decided >= runDate)) continue;
    if (i.decision && decided < runDate) continue;
    decisions.push({ id: i.id, type: "issue", group: "proposal", title: titleOf(i.rule.id, i.wcag.criterion, i.summary), hint: hintOf(i.examples?.[0]?.html, i.examples?.[0]?.selector), path: i.examples?.[0]?.url || "",
      pages: i.reach?.pages || 0, criterion: i.wcag.criterion, done: !!i.decision, answer: i.decision ? DECISION_TEXT[i.decision.status] || i.decision.status : "", sample: false });
  }

  // The issues: the open ones, the ones a person decided, and the ones this audit resolved.
  const issueRows = issues.filter((i) => OPEN.has(i.status) || ["accepted", "dismissed"].includes(i.status) || (i.status === "resolved" && i.status_by?.run === run))
    .sort((a, b) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity) || (b.reach?.pages || 0) - (a.reach?.pages || 0))
    .map((i) => {
      const c = CRITERIA_BY_ID.get(i.wcag.criterion);
      return { id: i.id, title: titleOf(i.rule.id, i.wcag.criterion, i.summary), experience: experienceOf(i.rule.id, i.wcag.criterion), hint: hintOf(i.examples?.[0]?.html, i.examples?.[0]?.selector), severity: i.severity, pages: i.reach?.pages || 0,
        criterion: i.wcag.criterion, level: c?.level || "", who: whoFixes(i.origin), status: i.status, isNew: i.status === "new", proposal: proposesNoChange(i),
        decision: i.decision ? DECISION_TEXT[i.decision.status] || i.decision.status : "", reason: i.status === "resolved" ? i.status_by?.reason || "" : "" };
    });

  const open = issueRows.filter((i) => OPEN.has(i.status));
  const history = readHistory(outDir).filter((h) => h.overview);
  const prev = history.length >= 2 ? history[history.length - 2] : null;
  const o: Overview | undefined = summary?.overview;
  const counts = summary?.counts || {};
  const cov = summary?.coverage || {};
  // The issues that this audit closed because the settings leave their pages out now. Since 1.3.6.
  const outOfScope = issues.filter((i) => i.status === "page removed" && i.status_by?.reason === "out of scope" && i.status_by?.run === run).length;
  return {
    host, site, run, runDate, environment: config.site.environment, all, outDir,
    versions: summary?.versions || null,
    preparedBy: config.report?.prepared_by || "", contact: config.report?.contact || "",
    overview: {
      open: open.length,
      prevOpen: prev ? prev.overview!.open_issues : null,
      prevRun: prev ? prev.run : null,
      newCount: counts.new || 0,
      resolved: (counts.resolved || 0) + (counts.resolved_rule_changed || 0),
      resolvedFixed: counts.resolved || 0,
      resolvedRule: counts.resolved_rule_changed || 0,
      reopened: counts.reopened || 0,
      pageRemoved: counts.page_removed || 0,
      outOfScope,
      share: o ? o.levels.AA.units.share_no_failure : null,
      prevShare: prev ? prev.overview!.share_no_failure_AA : null,
      pagesNoFailure: o ? o.levels.AA.pages : null,
      levels: o ? o.levels : null,
      definition: o?.definition || "",
      trend: history.slice(-5).map((h) => ({ run: h.run, open: h.overview!.open_issues })),
      coverage: { pages: cov.pages_tested || 0, sample: cov.pages_in_sample || 0, states: cov.states_tested || 0, forms: cov.forms_tested || 0, processes: cov.processes_tested || 0,
        widths: config.crawl.widths, notRun: cov.tests_not_run || [] },
    },
    decisions,
    issues: issueRows,
  };
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
      ai: ai.map((a) => ({ who: a.who, value: a.value, confidence: a.confidence || "", reason: a.reason || "", facts: a.facts || [] })),
      factsButtons: q.kind === "review" && !!q.ai_answer && q.ai_answer.value !== "unsure",
      sample: groupOf(q, false) === "sample", unresolved: effective.unresolved,
      raw: `${ex.selector || ""}\n${ex.html || ""}\n${JSON.stringify(ex.facts || {}, null, 1)}`,
      person: q.person_answer || null, factsCheck: q.facts_check || null, answer: answerText(q), issue: q.issue || null,
    };
  }
  if (/^ISS-[0-9a-f]{8}$/.test(id)) {
    const i = loadExisting(outDir, "issues").get(id);
    if (!i) return null;
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
