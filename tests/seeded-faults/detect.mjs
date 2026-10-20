// The detection rate of the engine on the seeded faults.
//
// Usage: node tests/seeded-faults/detect.mjs [--serve] [--only F01,F02] [--out <folder>]
//
// Needs the build of seed.py served at http://127.0.0.1:8080/ (the build folder as the root),
// or --serve to start that server. Audits the base and one variant for each fault, then compares
// the issues and the questions with the expected result of the fault. Writes
// tests/seeded-faults/detection.md and <out>/detection.json.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAudit } from "../../src/audit.ts";
import { configForUrl } from "../../src/config.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : null; };
const outRoot = path.resolve(flag("out") || path.join(here, "build", "detection"));
const onlyIds = flag("only") ? flag("only").split(",") : null;
const faults = JSON.parse(fs.readFileSync(path.join(here, "faults.json"), "utf8"));
const SITE_LEVEL = new Set(["2.4.2", "2.4.5", "3.2.3", "3.2.4", "3.2.6"]);

let server = null;
if (args.includes("--serve")) {
  server = spawn("python3", ["-m", "http.server", "8080", "--bind", "127.0.0.1", "--directory", path.join(here, "build")], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 1000));
}

function findings(dir) {
  const read = (folder) => fs.existsSync(path.join(dir, folder)) ? fs.readdirSync(path.join(dir, folder)).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, folder, f), "utf8"))) : [];
  const issues = read("issues").filter((i) => ["new", "open", "reopened"].includes(i.status)).map((i) => ({ kind: "issue", criterion: i.wcag.criterion, rule: i.rule.id, urls: i.examples.map((e) => e.url), summary: i.summary }));
  const questions = read("questions").map((q) => ({ kind: q.kind === "review" ? "ai question" : "person question", criterion: q.criterion, rule: q.evidence.rule, urls: q.evidence.pages || [q.evidence.url], summary: q.question }));
  return [...issues, ...questions];
}

// The processes of the base site. They run on the base and on the variants with a form fault, because they take time.
const PROCESSES = [
  { name: "order", environment: "local", steps: [
    { page: "order.html", action: "click 'Continue to the review'" },
    { page: "order.html", action: "fill 'Delivery date' with 'next week'" },
    { page: "order.html", action: "click 'Continue to the review'" },
    { page: "order.html", action: "fill 'Full name' with 'Audit Test'" },
    { page: "order.html", action: "fill 'Email' with 'audit@example.com'" },
    { page: "order.html", action: "fill 'Delivery address' with '1 Harbor Street'" },
    { page: "order.html", action: "fill 'Delivery date' with '2026-11-01'" },
    { page: "order.html", action: "fill 'Card number' with '4242424242424242'" },
    { page: "order.html", action: "click 'Continue to the review'" },
    { page: "order-review.html", action: "read the review" },
  ] },
  { name: "contact", environment: "local", steps: [
    { page: "help.html", action: "click 'Send the message'" },
  ] },
];
const PROCESS_CRITERIA = new Set(["3.3.1", "3.3.3", "3.3.4", "3.3.7"]);

async function audit(variant, pages, withProcesses) {
  const dir = path.join(outRoot, variant);
  fs.rmSync(dir, { recursive: true, force: true });
  const config = configForUrl(`http://127.0.0.1:8080/${variant}`, "local");
  config.interaction.processes = withProcesses ? PROCESSES : [];
  // Every page of the test site is in the sample, so that the template tests run on all of them.
  config.crawl.random_sample_share = 1;
  const only = pages ? pages.map((p) => `http://127.0.0.1:8080/${variant}/${p}`) : undefined;
  await runAudit({ config, outDir: dir, only, log: () => {} });
  return findings(dir);
}

const key = (f) => `${f.kind}|${f.criterion}|${f.rule}`;
console.error("base");
const base = await audit("base", undefined, true);
const baseKeys = new Set(base.map(key));
const rows = [];
for (const fault of faults.faults) {
  if (onlyIds && !onlyIds.some((id) => fault.id.startsWith(id))) continue;
  const pageOf = (u) => u.replace(/^\//, "").replace(new RegExp("^" + fault.id + "/?"), "").replace(/^(index\.html)?$/, "index.html");
  const pages = fault.pages || [fault.page];
  const full = SITE_LEVEL.has(fault.criterion) || fault.criterion === "2.4.2";
  const t0 = Date.now();
  const found = await audit(fault.id, full ? undefined : pages, PROCESS_CRITERIA.has(fault.criterion));
  const onPage = (f) => f.urls.some((u) => pages.includes(pageOf(u)));
  const hit = found.filter((f) => f.criterion === fault.criterion && onPage(f));
  const related = found.filter((f) => (fault.also || []).includes(f.criterion) && onPage(f));
  const expectedKind = fault.decider === "engine" ? "issue" : fault.decider === "ai" ? "ai question" : "person question";
  const exact = hit.some((f) => f.kind === expectedKind);
  const falseNew = found.filter((f) => !baseKeys.has(key(f)) && f.criterion !== fault.criterion && !(fault.also || []).includes(f.criterion));
  const result = exact ? "found" : hit.length ? "found as " + hit[0].kind : related.length ? "related" : "missed";
  rows.push({ id: fault.id, criterion: fault.criterion, decider: fault.decider, expectedKind, result, hits: hit.map((f) => f.kind + " " + f.rule), related: related.map((f) => f.criterion + " " + f.rule), falseNew: falseNew.map((f) => f.criterion + " " + f.rule), seconds: Math.round((Date.now() - t0) / 1000) });
  console.error(`${fault.id.padEnd(36)} ${result.padEnd(24)} ${rows[rows.length - 1].hits.join(", ")}${falseNew.length ? "  | new elsewhere: " + falseNew.map((f) => f.criterion).join(",") : ""}`);
}
if (server) server.kill();

const count = (r) => rows.filter((x) => x.result === r).length;
const summary = { date: new Date().toISOString().slice(0, 10), faults: rows.length, found: count("found"), foundOtherKind: rows.filter((x) => x.result.startsWith("found as")).length, related: count("related"), missed: count("missed"), baseFindings: base.map(key), rows };
fs.mkdirSync(outRoot, { recursive: true });
fs.writeFileSync(path.join(outRoot, "detection.json"), JSON.stringify(summary, null, 1));
const md = [`# Detection of the seeded faults\n`, `Generated by \`detect.mjs\` on ${summary.date}. "Found" means that the audit reported the criterion of the fault on its page, as the issue or the question that the decider of the fault expects. "Found as" means another kind of finding for the same criterion. "Related" means a finding for a criterion in the "also" list only.\n`,
  `| Faults | Found | Found as another kind | Related only | Missed |\n|---|---|---|---|---|\n| ${summary.faults} | ${summary.found} | ${summary.foundOtherKind} | ${summary.related} | ${summary.missed} |\n`];
for (const d of ["engine", "ai", "person"]) { const sub = rows.filter((r) => r.decider === d); md.push(`- Decider ${d}: ${sub.filter((r) => r.result === "found").length} found of ${sub.length}, ${sub.filter((r) => r.result === "missed").length} missed.`); }
md.push(`\nThe base site gives ${base.filter((f) => f.kind === "issue").length} issues, ${base.filter((f) => f.kind === "ai question").length} questions for the AI, and ${base.filter((f) => f.kind === "person question").length} checks for a person: ${[...baseKeys].join("; ") || "none"}.\n`);
md.push(`| Fault | Criterion | Expected | Result | Findings on the page | New findings elsewhere |\n|---|---|---|---|---|---|`);
for (const r of rows) md.push(`| ${r.id} | ${r.criterion} | ${r.expectedKind} | ${r.result} | ${r.hits.join(", ") || r.related.join(", ") || "-"} | ${r.falseNew.join(", ") || "-"} |`);
// A partial run with --only is a check, not the record: the record of all faults stays in detection.md.
if (!onlyIds) fs.writeFileSync(path.join(here, "detection.md"), md.join("\n") + "\n");
console.log(JSON.stringify({ faults: summary.faults, found: summary.found, foundOtherKind: summary.foundOtherKind, related: summary.related, missed: summary.missed }));
