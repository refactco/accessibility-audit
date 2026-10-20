// The task files of the cycle: the batches of work for the agents of the skill. The engine lists the work, and the agents do it.
// review: the questions that wait for a first answer. verify: the answered questions without a verification, without the first
// answer, so that the verifier decides on its own. locate: the open issues with no origin yet.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Config } from "./config.ts";
import { loadQuestions } from "./decide.ts";
import { loadExisting } from "./issues.ts";

export type Step = "review" | "verify" | "locate";
export interface TaskSummary { step: Step; count: number; batches: number; files: string[] }

const OPEN = new Set(["new", "open", "reopened"]);

/** Writes the batch files of one step into the tasks folder, the largest reach first, and removes the old files of that step. */
export function writeTasks(config: Config, outDir: string, step: Step, tasksDir: string, batch = 20): TaskSummary {
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
      .map((q) => { const { ai_answer: _a, verification: _v, facts_check: _f, sample: _s, ...rest } = q; return rest; });
    body = (part) => ({ results: outDir, step, questions: part });
  } else {
    const source = resolve(outDir, String(config.site.cms?.source_path || ".."));
    items = [...loadExisting(outDir, "issues").values()]
      .filter((i: any) => OPEN.has(i.status) && i.origin === "unknown")
      .sort((a: any, b: any) => (b.reach?.pages || 0) - (a.reach?.pages || 0)).map((i: any) => i.id);
    body = (part) => ({ results: outDir, step, source, issues: part });
  }
  const files: string[] = [];
  const size = Math.max(1, batch);
  for (let i = 0; i < items.length; i += size) {
    const file = join(tasksDir, `${step}-${files.length + 1}.json`);
    writeFileSync(file, JSON.stringify(body(items.slice(i, i + size)), null, 1) + "\n");
    files.push(file);
  }
  return { step, count: items.length, batches: files.length, files };
}
