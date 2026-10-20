// Writes the results folder: the settings, the summary, the page results, the issues, the questions, the history, and the report.
// Each file is validated against its schema in formats/ before it is written.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
// ajv and ajv-formats are CommonJS modules: Node gives their module.exports, which carries the class and the function, and a default property.
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
const addFormats = ((addFormatsModule as unknown as { default?: unknown }).default ?? addFormatsModule) as (ajv: Ajv2020) => Ajv2020;
import { ROOT } from "./config.ts";

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
for (const f of readdirSync(join(ROOT, "formats"))) {
  if (f.endsWith(".schema.json")) ajv.addSchema(JSON.parse(readFileSync(join(ROOT, "formats", f), "utf8")));
}

export function validate(name: string, data: unknown): void {
  const v = ajv.getSchema(`https://refact.co/a11y/formats/${name}`);
  if (!v) throw new Error("No schema " + name);
  if (!v(data)) throw new Error(`${name} is not valid: ` + (v.errors || []).map((e) => `${e.instancePath || "/"} ${e.message}`).join("; "));
}

export interface Output {
  config: unknown; summary: Record<string, unknown>; pages: Record<string, unknown>[]; issues: Record<string, any>[]; questions: Record<string, any>[];
  /** null for a refresh: the history and the stored outcomes stay as they are. */
  history: Record<string, unknown> | null; report: string; run: string; outcomes: unknown[] | null;
}

export function writeResults(dir: string, out: Output): void {
  mkdirSync(dir, { recursive: true });
  validate("config/1", out.config);
  validate("summary/1", out.summary);
  for (const p of out.pages) validate("page/1", p);
  for (const i of out.issues) validate("issue/2", i);
  for (const q of out.questions) validate("question/2", q);
  if (out.history) validate("history/1", out.history);
  writeFileSync(join(dir, "config.json"), JSON.stringify(out.config, null, 2) + "\n");
  writeFileSync(join(dir, "summary.json"), JSON.stringify(out.summary, null, 1) + "\n");
  writeFileSync(join(dir, "pages.jsonl"), out.pages.map((p) => JSON.stringify(p)).join("\n") + "\n");
  for (const folder of ["issues", "questions"]) {
    const path = join(dir, folder);
    if (existsSync(path)) for (const f of readdirSync(path)) if (f.endsWith(".json")) rmSync(join(path, f));
    mkdirSync(path, { recursive: true });
  }
  for (const i of out.issues) writeFileSync(join(dir, "issues", i.id + ".json"), JSON.stringify(i, null, 1) + "\n");
  for (const q of out.questions) writeFileSync(join(dir, "questions", q.id + ".json"), JSON.stringify(q, null, 1) + "\n");
  if (out.history) appendFileSync(join(dir, "history.jsonl"), JSON.stringify(out.history) + "\n");
  writeFileSync(join(dir, "report.md"), out.report);
  const runDir = join(dir, "runs", out.run.replace(/[:]/g, "-"));
  mkdirSync(runDir, { recursive: true });
  if (out.outcomes) writeFileSync(join(runDir, "outcomes.jsonl"), out.outcomes.map((o) => JSON.stringify(o)).join("\n") + "\n");
  const ignore = join(dir, ".gitignore");
  if (!existsSync(ignore)) writeFileSync(ignore, "runs/\n");
}
