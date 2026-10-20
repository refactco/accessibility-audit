#!/usr/bin/env node
// The a11y command. Usage: a11y audit <url or config.json> [--out <folder>] [--only <url,url>] [--max-pages <n>] [--widths <w,w,w>]
import { join, resolve } from "node:path";
import { runAudit } from "./audit.ts";
import { loadConfig } from "./config.ts";
import { existsSync, readFileSync } from "node:fs";
import { answerQuestion, checkFacts, exportVerifyTasks, locateIssue, recordDecision, setIssueStatus, verifyQuestion, type AnswerValue } from "./decide.ts";
import { pagesWithOpenIssues } from "./issues.ts";
import { refresh } from "./refresh.ts";
import { writeHandoff } from "./handoff.ts";
import { writeTasks, type Step } from "./tasks.ts";
import { serveReview } from "./review.ts";

function usage(): never {
  console.error(`Usage:
  a11y audit <url or config.json> [--out <folder>] [--only <url,url>] [--max-pages <n>] [--widths <w,w,w>] [--sample-limit <n>] [--concurrency <n>] [--time-budget <minutes>] [--started-by person|schedule|skill] [--quiet]
  a11y check <url or config.json> [--out <folder>] [--concurrency <n>] [--started-by person|schedule|skill] [--quiet]
  a11y answer <Q-id> <issue | no issue | unsure | not applicable> --by <name or ai> [--reason <text>] [--fact <text>]... [--note <text>] [--confidence low|medium|high] [--model <name>] [--prompt-version <v>] [--out <folder>]
  a11y facts <Q-id> <confirmed | wrong> --by <name> [--note <text>] [--out <folder>]     a person confirms the facts of the AI answer, or marks one as wrong
  a11y verify-tasks --file <tasks.json> [--all] [--out <folder>]     writes the questions that wait for a verification, without the first answer
  a11y tasks <review | verify | locate> [--out <folder>] [--dir <tasks folder>] [--batch <n>]     writes the batch files of one step of the cycle for the agents of the skill
  a11y verify <Q-id> <issue | no issue | unsure> --by ai --model <name> [--reason <text>] [--fact <text>]... [--confidence low|medium|high] [--out <folder>]     the second, independent AI answer
  a11y pass <criterion> --pages <path,path> | --templates <name,name> --by <name> [--note <text>] [--out <folder>]
  a11y not-applicable <criterion> --pages <path,path> | --templates <name,name> --by <name> [--note <text>] [--out <folder>]
  a11y accept <ISS-id> --by <name> --reason <text> [--note <text>] [--out <folder>]
  a11y dismiss <ISS-id> --by <name> --reason <text> [--note <text>] [--out <folder>]
  a11y locate <ISS-id> --file <found.json> [--out <folder>]      the skill writes the origin, the source, and the specific solution
  a11y refresh <url or config.json> [--out <folder>]              rebuilds the summary, the page results, and the report from the last run, with the answers and the decisions of today
  a11y review [config.json] [--out <folder>] [--port <n>] [--all] [--no-open]   opens the review page for a person in the browser; without the settings file, it uses <folder>/config.json
  a11y handoff <url or config.json> [--out <folder>] [--file <fixes.json>] [--brief <fixes.md>]   writes the tasks for the fixing agent from the open issues

The results go into <folder>, by default ./accessibility-audit next to the settings file or in the current folder.
The check is the short check: it tests only the pages with open issues in <folder>, and it resolves an issue only when it tested all its pages.
--sample-limit caps the random part and the technology part of the sample (default 60). --concurrency and --time-budget override the budgets of the settings.
An answer or a decision changes the question or issue file at once. Run refresh to put it into the summary, the page results, and the report.`);
  process.exit(2);
}

const args = process.argv.slice(2);
const command = args.shift();
const COMMANDS = ["audit", "check", "answer", "facts", "verify", "verify-tasks", "tasks", "pass", "not-applicable", "accept", "dismiss", "locate", "refresh", "review", "handoff"];
if (!command || !COMMANDS.includes(command) || (!args.length && !["verify-tasks", "review", "refresh", "handoff", "check", "audit"].includes(command))) usage();
// The commands that take the settings file find it in the results folder when the call gives none: `a11y review` works in the repository of a site.
const NEEDS_SETTINGS = ["audit", "check", "refresh", "review", "handoff"];
const outFlag = (() => { const i = args.indexOf("--out"); return i >= 0 ? args[i + 1] : undefined; })();
const defaultSettings = join(resolve(outFlag || "accessibility-audit"), "config.json");
let target = command === "verify-tasks" && (args[0] || "").startsWith("--") ? "" : (!args.length || args[0].startsWith("--")) && NEEDS_SETTINGS.includes(command) ? "" : args.shift()!;
if (!target && NEEDS_SETTINGS.includes(command)) {
  if (!existsSync(defaultSettings)) { console.error(`No settings file: give <config.json>, or run in a folder with ${defaultSettings}.`); process.exit(2); }
  target = defaultSettings;
}
const words: string[] = [];
while (args.length && !args[0].startsWith("--")) words.push(args.shift()!);
const flags: Record<string, string | boolean> = {};
const facts: string[] = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (!a.startsWith("--")) usage();
  const key = a.slice(2);
  if (key === "quiet" || key === "all" || key === "no-open") flags[key] = true;
  else if (key === "fact") facts.push(args[++i]);
  else flags[key] = args[++i];
}
const str = (key: string) => (flags[key] === undefined ? undefined : String(flags[key]));

if (command === "review") {
  const outDir = resolve(str("out") || "accessibility-audit");
  const { url } = await serveReview(loadConfig(target), outDir, { port: flags["port"] ? Number(flags["port"]) : undefined, all: !!flags["all"], open: !flags["no-open"], log: (line) => console.error(line) });
  console.error(`Open ${url} in your browser. Press Ctrl+C to stop.`);
  // The server runs until the person stops it.
  await new Promise(() => {});
} else if (command === "handoff") {
  const outDir = resolve(str("out") || "accessibility-audit");
  const file = resolve(str("file") || join(outDir, "fixes.json"));
  const brief = resolve(str("brief") || join(outDir, "fixes.md"));
  try {
    const r = writeHandoff(loadConfig(target), outDir, file, { markdown: brief });
    console.log(JSON.stringify({ tasks: r.tasks, unresolved: r.unresolved, file, brief }));
  } catch (e) { console.error((e as Error).message); process.exit(1); }
  process.exit(0);
}

if (command === "tasks") {
  const outDir = resolve(str("out") || "accessibility-audit");
  if (!["review", "verify", "locate"].includes(target)) { console.error("The step is review, verify, or locate."); process.exit(2); }
  try {
    const r = writeTasks(loadConfig(join(outDir, "config.json")), outDir, target as Step, resolve(str("dir") || join(outDir, "runs", "tasks")), flags["batch"] ? Number(flags["batch"]) : 20);
    console.log(JSON.stringify(r));
  } catch (e) { console.error((e as Error).message); process.exit(1); }
  process.exit(0);
}

if (command === "verify-tasks") {
  const outDir = resolve(str("out") || "accessibility-audit");
  const file = str("file");
  if (!file) { console.error("--file <tasks.json> is needed."); process.exit(2); }
  try {
    const n = exportVerifyTasks(outDir, resolve(file), !!flags["all"]);
    console.log(JSON.stringify({ questions: n, file: resolve(file) }));
  } catch (e) { console.error((e as Error).message); process.exit(1); }
  process.exit(0);
}

if (command === "refresh") {
  const outDir = resolve(str("out") || "accessibility-audit");
  try {
    const r = refresh(loadConfig(target), outDir, (line) => console.error(line));
    console.log(JSON.stringify({ run: r.run, issues: r.issues, questions: r.questions, out: outDir }));
  } catch (e) { console.error((e as Error).message); process.exit(1); }
  process.exit(0);
}

if (command === "locate") {
  const outDir = resolve(str("out") || "accessibility-audit");
  const file = str("file");
  if (!file) { console.error("--file <found.json> is needed."); process.exit(2); }
  try {
    const i = locateIssue(outDir, target, JSON.parse(readFileSync(file, "utf8")));
    console.log(JSON.stringify({ issue: i.id, origin: i.origin, source: i.source.length, solution: i.solution.type }));
  } catch (e) { console.error((e as Error).message); process.exit(1); }
  process.exit(0);
}

if (command !== "audit" && command !== "check") {
  const outDir = resolve(str("out") || "accessibility-audit");
  const by = str("by");
  if (!by) { console.error("--by <name or ai> is needed."); process.exit(2); }
  try {
    if (command === "answer") {
      const value = words.join(" ") as AnswerValue;
      if (!["issue", "no issue", "unsure", "not applicable"].includes(value)) usage();
      const q = answerQuestion(outDir, target, value, { by, reason: str("reason"), note: str("note"), confidence: str("confidence") as "low" | "medium" | "high" | undefined, model: str("model"), promptVersion: str("prompt-version"), facts });
      console.log(JSON.stringify({ question: q.id, value, by, sample: q.sample }));
    } else if (command === "verify") {
      const value = words.join(" ");
      if (!["issue", "no issue", "unsure"].includes(value)) usage();
      const q = verifyQuestion(outDir, target, value as "issue" | "no issue" | "unsure", { by, reason: str("reason"), note: str("note"), confidence: str("confidence") as "low" | "medium" | "high" | undefined, model: str("model"), promptVersion: str("prompt-version"), facts });
      console.log(JSON.stringify({ question: q.id, verification: value, agrees: q.verification.agrees }));
    } else if (command === "facts") {
      const result = words.join(" ");
      if (result !== "confirmed" && result !== "wrong") usage();
      const q = checkFacts(outDir, target, result, by, str("note"));
      console.log(JSON.stringify({ question: q.id, facts: result, by }));
    } else if (command === "pass" || command === "not-applicable") {
      const d = recordDecision(outDir, target, command === "pass" ? "passed" : "not applicable", { pages: str("pages")?.split(",").map((p) => p.trim()).filter(Boolean), templates: str("templates")?.split(",").map((p) => p.trim()).filter(Boolean) }, by, str("note"));
      console.log(JSON.stringify({ criterion: d.criterion, result: d.result, pages: Object.keys(d.scope.pages || {}).length, by }));
    } else {
      const reason = str("reason");
      if (!reason) { console.error("--reason <text> is needed."); process.exit(2); }
      const i = setIssueStatus(outDir, target, command === "accept" ? "accepted" : "dismissed", by, reason, str("note"));
      console.log(JSON.stringify({ issue: i.id, status: i.status, by }));
    }
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
  process.exit(0);
}

const config = loadConfig(target);
if (flags["max-pages"]) config.crawl.max_pages = Number(flags["max-pages"]);
if (flags["time-budget"]) config.budgets.time_budget_minutes = Number(flags["time-budget"]);
if (flags["widths"]) config.crawl.widths = String(flags["widths"]).split(",").map(Number);
const outDir = resolve(String(flags["out"] || "accessibility-audit"));
let only = flags["only"] ? String(flags["only"]).split(",").map((u) => new URL(u, config.site.url + "/").toString()) : undefined;
if (command === "check") {
  const paths = pagesWithOpenIssues(outDir);
  if (!paths.length) { console.error("No open issue in " + outDir + ". Nothing to check."); process.exit(0); }
  only = paths.map((p) => new URL(p, config.site.url + "/").toString());
  console.error(`short check of ${only.length} pages with open issues`);
}

const t0 = Date.now();
const stamp = () => String(Math.round((Date.now() - t0) / 1000)).padStart(5) + "s ";
const startedBy = (["person", "schedule", "skill"].includes(str("started-by") || "") ? str("started-by") : "person") as "person" | "schedule" | "skill";
const result = await runAudit({ config, outDir, only, kind: command === "check" ? "short check" : "full", startedBy, sampleLimit: flags["sample-limit"] ? Number(flags["sample-limit"]) : undefined, concurrency: flags["concurrency"] ? Number(flags["concurrency"]) : undefined, log: flags["quiet"] ? undefined : (line) => console.error(stamp() + line) });
console.log(JSON.stringify({ run: result.run, pages: result.pages.length, states: result.statesTested, processes: result.processes.filter((p) => p.tested).length, issues: result.issues, questions: result.questions, seconds: result.durationSeconds, out: outDir }));
