// The decisions of the AI and of a person: the answers to the review questions, the passed and not applicable results
// for a scope, and the accepted and dismissed issues. See PLAN.md sections 7.3, 7.4, and 6.1.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lastRun } from "./issues.ts";
import { validate } from "./write.ts";

export type AnswerValue = "issue" | "no issue" | "unsure" | "not applicable";
export interface AnswerOptions { by: string; reason?: string; note?: string; confidence?: "low" | "medium" | "high"; model?: string; promptVersion?: string; date?: string; sampleShare?: number; facts?: string[] }

const today = () => new Date().toISOString().slice(0, 10);

/** The share of the AI answers that a person confirms: from the settings of the results folder, by default one in ten. */
export function sampleShareOf(dir: string): number {
  try { const c = JSON.parse(readFileSync(join(dir, "config.json"), "utf8")); const s = c?.budgets?.sample_share; return typeof s === "number" ? s : 0.1; } catch { return 0.1; }
}

/** Records the answer of the AI or of a person on a question file. The AI answer marks one in ten questions for a person, and all low confidence answers. */
export function answerQuestion(dir: string, id: string, value: AnswerValue, o: AnswerOptions): Record<string, any> {
  const path = join(dir, "questions", id + ".json");
  if (!existsSync(path)) throw new Error(`No question ${id} in ${dir}.`);
  const q = JSON.parse(readFileSync(path, "utf8"));
  const date = o.date || today();
  if (o.by.toLowerCase() === "ai") {
    if (value === "not applicable") throw new Error("The AI answers issue, no issue, or unsure. Only a person answers not applicable.");
    if (!o.model) throw new Error("An AI answer needs --model.");
    q.ai_answer = { value, confidence: o.confidence || "medium", reason: o.reason || o.note || "", model: o.model, prompt_version: o.promptVersion || "1", date, ...(o.facts && o.facts.length ? { facts: o.facts } : {}) };
    // A new AI answer starts a new facts check.
    q.facts_check = null;
    // A new first answer needs a new verification: the old one compared with the old answer.
    delete q.verification;
    const share = o.sampleShare ?? sampleShareOf(dir);
    q.sample = q.ai_answer.confidence === "low" || parseInt(createHash("sha1").update(id).digest("hex").slice(0, 6), 16) % 1000 < Math.round(share * 1000);
  } else {
    if (value === "unsure") throw new Error("A person answers issue, no issue, or not applicable.");
    q.person_answer = { value, by: o.by, date, ...(o.note || o.reason ? { note: o.note || o.reason } : {}) };
  }
  validate("question/2", q);
  writeFileSync(path, JSON.stringify(q, null, 1) + "\n");
  return q;
}

/** Records the second, independent AI answer: the verification. It never sees the first answer; the command compares them. */
export function verifyQuestion(dir: string, id: string, value: "issue" | "no issue" | "unsure", o: AnswerOptions): Record<string, any> {
  const path = join(dir, "questions", id + ".json");
  if (!existsSync(path)) throw new Error(`No question ${id} in ${dir}.`);
  const q = JSON.parse(readFileSync(path, "utf8"));
  if (!o.model) throw new Error("A verification needs --model.");
  if (!q.ai_answer) throw new Error(`The question ${id} has no first AI answer to verify.`);
  const agrees = q.ai_answer.value === value && value !== "unsure";
  q.verification = { value, confidence: o.confidence || "medium", reason: o.reason || o.note || "", model: o.model, prompt_version: o.promptVersion || "1", date: o.date || today(), ...(o.facts && o.facts.length ? { facts: o.facts } : {}), agrees };
  validate("question/2", q);
  writeFileSync(path, JSON.stringify(q, null, 1) + "\n");
  return q;
}

/** The answer that counts for a question: a person's answer, then two AI answers that agree, then a first AI answer that no verifier checked yet.
 *  A verified disagreement, or an unsure answer, is unresolved: the question stays open and the report counts it. */
export function effectiveAnswer(q: Record<string, any>): { value: "issue" | "no issue" | "not applicable" | null; by: "person" | "agreement" | "ai" | null; unresolved: boolean } {
  if (q.person_answer) return { value: q.person_answer.value, by: "person", unresolved: false };
  const first = q.ai_answer && q.ai_answer.value !== "unsure" ? q.ai_answer.value : null;
  if (q.verification) {
    if (first && q.verification.agrees) return { value: first, by: "agreement", unresolved: false };
    return { value: null, by: null, unresolved: true };
  }
  if (q.ai_answer && q.ai_answer.value === "unsure") return { value: null, by: null, unresolved: true };
  if (first) return { value: first, by: "ai", unresolved: false };
  return { value: null, by: null, unresolved: false };
}

/** Writes the questions that wait for a verification to a work file, without the first answer, so that the verifier decides on its own. */
export function exportVerifyTasks(dir: string, file: string, all = false): number {
  const list: Record<string, any>[] = [];
  for (const q of loadQuestions(dir)) {
    if (q.kind !== "review" || q.person_answer || !q.ai_answer || (q.verification && !all)) continue;
    const { ai_answer: _a, verification: _v, facts_check: _f, sample: _s, ...rest } = q;
    list.push(rest);
  }
  list.sort((a, b) => b.pages - a.pages);
  writeFileSync(file, JSON.stringify({ results: dir, questions: list }, null, 1) + "\n");
  return list.length;
}

export function loadQuestions(dir: string): Record<string, any>[] {
  const path = join(dir, "questions");
  if (!existsSync(path)) return [];
  return readdirSync(path).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(path, f), "utf8")));
}

/** A person confirms the facts of the AI answer, or marks one as wrong. Confirmed facts count as agreement. A wrong fact sends the question back to the AI. */
export function checkFacts(dir: string, id: string, result: "confirmed" | "wrong", by: string, note?: string): Record<string, any> {
  const path = join(dir, "questions", id + ".json");
  if (!existsSync(path)) throw new Error(`No question ${id} in ${dir}.`);
  const q = JSON.parse(readFileSync(path, "utf8"));
  if (!q.ai_answer) throw new Error(`The question ${id} has no AI answer to check.`);
  q.facts_check = { result, by, date: today(), ...(note ? { note } : {}) };
  if (result === "wrong") { q.sample = true; }
  validate("question/2", q);
  writeFileSync(path, JSON.stringify(q, null, 1) + "\n");
  return q;
}

export interface Decision { schema: "decision/1"; result: "passed" | "not applicable"; criterion: string; scope: { templates?: string[]; pages?: Record<string, string> }; by: string; date: string; note?: string }

function readPages(dir: string): { path: string; template: string | null; hash: string }[] {
  const file = join(dir, "pages.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => { const p = JSON.parse(l); const u = new URL(p.url); return { path: u.pathname + u.search, template: p.template, hash: p.content_hash || "" }; });
}

/** Records "passed" or "not applicable" for a criterion on a scope of pages or templates, with the content hash of each page. */
export function recordDecision(dir: string, criterion: string, result: "passed" | "not applicable", scope: { pages?: string[]; templates?: string[] }, by: string, note?: string): Decision {
  const known = readPages(dir);
  const paths = new Set<string>(scope.pages || []);
  for (const t of scope.templates || []) for (const p of known) if (p.template === t) paths.add(p.path);
  if (!paths.size) throw new Error("The scope names no page. Give --pages or --templates that the last audit knows.");
  const pages: Record<string, string> = {};
  for (const p of paths) pages[p] = known.find((k) => k.path === p)?.hash || "";
  const d: Decision = { schema: "decision/1", result, criterion, scope: { ...(scope.templates?.length ? { templates: scope.templates } : {}), pages }, by, date: today(), ...(note ? { note } : {}) };
  validate("decision/1", d);
  appendFileSync(join(dir, "decisions.jsonl"), JSON.stringify(d) + "\n");
  return d;
}

export function loadDecisions(dir: string): Decision[] {
  const file = join(dir, "decisions.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Decision);
}

/** The decision that applies to a criterion on a page, or null. A decision is void for a page whose content changed. */
export function decisionFor(decisions: Decision[], criterion: string, path: string, hash: string | undefined): Decision | null {
  for (let i = decisions.length - 1; i >= 0; i--) {
    const d = decisions[i];
    if (d.criterion !== criterion || !d.scope.pages || !(path in d.scope.pages)) continue;
    const recorded = d.scope.pages[path];
    if (recorded && hash && recorded !== hash) return null;
    return d;
  }
  return null;
}

/** Marks an issue as accepted or dismissed, with the reason and the name. */
export function setIssueStatus(dir: string, id: string, status: "accepted" | "dismissed", by: string, reason: string, note?: string): Record<string, any> {
  const path = join(dir, "issues", id + ".json");
  if (!existsSync(path)) throw new Error(`No issue ${id} in ${dir}.`);
  const i = JSON.parse(readFileSync(path, "utf8"));
  const date = today();
  i.status = status;
  i.status_by = { who: "person", mode: "manual", date, run: lastRun(dir)?.run || i.status_by?.run || "none" };
  i.decision = { status, reason, ...(note ? { note } : {}), by, date };
  validate("issue/2", i);
  writeFileSync(path, JSON.stringify(i, null, 1) + "\n");
  return i;
}

/** Writes the origin, the source, and the specific solution that the skill found into an issue file. The fields come from a JSON file. */
export function locateIssue(dir: string, id: string, found: { origin?: string; source?: unknown[]; solution?: Record<string, unknown>; source_warning?: string | null }): Record<string, any> {
  const path = join(dir, "issues", id + ".json");
  if (!existsSync(path)) throw new Error(`No issue ${id} in ${dir}.`);
  const i = JSON.parse(readFileSync(path, "utf8"));
  if (found.origin !== undefined) i.origin = found.origin;
  if (found.source !== undefined) i.source = found.source;
  if (found.solution !== undefined) i.solution = { ...i.solution, ...found.solution, type: "specific" };
  if (found.source_warning !== undefined) i.source_warning = found.source_warning;
  validate("issue/2", i);
  writeFileSync(path, JSON.stringify(i, null, 1) + "\n");
  return i;
}
