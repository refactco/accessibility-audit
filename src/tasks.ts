// The task files of the cycle: the batches of work for the agents of the skill. The engine lists the work, and the agents do it.
// review: the questions that wait for a first answer. verify: the answered questions without a verification, without the first
// answer, so that the verifier decides on its own. locate: the open issues with no origin yet.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Config } from "./config.ts";
import { loadQuestions } from "./decide.ts";
import { loadExisting } from "./issues.ts";

export type Step = "review" | "verify" | "locate";
/** count: the items in the batch files. waiting: all the items that wait for this step. budget: the most items for this call. */
export interface TaskSummary { step: Step; count: number; waiting: number; budget: number | null; batches: number; files: string[] }

const OPEN = new Set(["new", "open", "reopened"]);

/** Writes the batch files of one step into the tasks folder, the largest reach first, and removes the old files of that step.
 *  The budgets of the settings apply: review takes at most max_questions_per_audit questions, less the AI answers given since
 *  the run; locate takes at most max_issues_for_skill issues. limit replaces the budget. */
export function writeTasks(config: Config, outDir: string, step: Step, tasksDir: string, batch = 20, limit?: number): TaskSummary {
  mkdirSync(tasksDir, { recursive: true });
  for (const f of readdirSync(tasksDir)) if (f.startsWith(step + "-") && f.endsWith(".json")) rmSync(join(tasksDir, f));
  let items: unknown[] = [];
  let body: (part: unknown[]) => Record<string, unknown>;
  if (step === "review") {
    // No answer yet, or a fact that a person marked wrong. A question with a person's answer is closed.
    items = loadQuestions(outDir)
      .filter((q) => q.kind === "review" && !q.person_answer && (!q.ai_answer || q.facts_check?.result === "wrong"))
      .sort((a, b) => b.pages - a.pages).map((q) => q.id);
    body = (part) => ({ results: outDir, step, questions: part });
  } else if (step === "verify") {
    items = loadQuestions(outDir)
      .filter((q) => q.kind === "review" && !q.person_answer && q.ai_answer && !q.verification)
      .sort((a, b) => b.pages - a.pages)
      .map((q) => { const { ai_answer: _a, verification: _v, facts_check: _f, sample: _s, item_hashes: _h, ...rest } = q; return rest; });
    body = (part) => ({ results: outDir, step, questions: part });
  } else {
    const source = resolve(outDir, String(config.site.cms?.source_path || ".."));
    items = [...loadExisting(outDir, "issues").values()]
      .filter((i: any) => OPEN.has(i.status) && i.origin === "unknown")
      .sort((a: any, b: any) => (b.reach?.pages || 0) - (a.reach?.pages || 0)).map((i: any) => i.id);
    body = (part) => ({ results: outDir, step, source, issues: part });
  }
  const waiting = items.length;
  let budget: number | null = limit ?? null;
  if (budget === null && step === "review") {
    // The AI answers since the run count against the budget of the run. The date of an answer is a day, so the day of the run counts.
    let runDate = "";
    try { runDate = String(JSON.parse(readFileSync(join(outDir, "summary.json"), "utf8")).run || "").slice(0, 10); } catch { /* no summary */ }
    const answered = runDate && existsSync(join(outDir, "questions")) ? loadQuestions(outDir).filter((q) => q.kind === "review" && q.ai_answer && String(q.ai_answer.date || "") >= runDate).length : 0;
    budget = Math.max(0, config.budgets.max_questions_per_audit - answered);
  }
  if (budget === null && step === "locate") budget = config.budgets.max_issues_for_skill;
  if (budget !== null) items = items.slice(0, Math.max(0, budget));
  const files: string[] = [];
  const size = Math.max(1, batch);
  for (let i = 0; i < items.length; i += size) {
    const file = join(tasksDir, `${step}-${files.length + 1}.json`);
    writeFileSync(file, JSON.stringify(body(items.slice(i, i + size)), null, 1) + "\n");
    files.push(file);
  }
  return { step, count: items.length, waiting, budget, batches: files.length, files };
}
