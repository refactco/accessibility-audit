// The recurrence test of stage 3: two audits give the same IDs, one seeded fault gives one new issue, and the statuses follow PLAN.md 6.1.
//
// Usage: node tests/recurrence.mjs [--serve] [--out <folder>]
// Needs the build of seed.py served at http://127.0.0.1:8080/, or --serve. Six audits go into one results folder:
//   1 base          all pages   -> the baseline: 0 issues, N questions
//   2 fault F01     all pages   -> 1 new issue
//   3 fault F01     help.html   -> the issue is "not checked": its page was not tested
//   4 fault F01     short check -> the issue is "open" again
//   5 base          all pages   -> the issue is "resolved", reason "fixed"
//   6 base          all pages   -> the same question IDs as audit 1, and the issue stays resolved
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAudit } from "../src/audit.ts";
import { configForUrl } from "../src/config.ts";
import { pagesWithOpenIssues } from "../src/issues.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : null; };
const dir = path.resolve(flag("out") || path.join(here, "seeded-faults", "build", "recurrence"));
const FAULT = "F01-image-no-alt";
let server = null;
if (args.includes("--serve")) {
  server = spawn("python3", ["-m", "http.server", "8080", "--bind", "127.0.0.1", "--directory", path.join(here, "seeded-faults", "build")], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 1000));
}
fs.rmSync(dir, { recursive: true, force: true });

// The site keeps one address, http://127.0.0.1:8080/current/, so that the paths of the issues stay the same between the audits.
// Each audit copies the base or the variant into build/current and rewrites its sitemap.
const build = path.join(here, "seeded-faults", "build");
const current = path.join(build, "current");
const prepare = (variant) => {
  fs.rmSync(current, { recursive: true, force: true });
  fs.cpSync(path.join(build, variant), current, { recursive: true });
  const sitemap = path.join(current, "sitemap.xml");
  fs.writeFileSync(sitemap, fs.readFileSync(sitemap, "utf8").replaceAll(`http://127.0.0.1:8080/${variant}/`, "http://127.0.0.1:8080/current/"));
};
const read = (folder) => fs.readdirSync(path.join(dir, folder)).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, folder, f), "utf8")));
const audit = async (variant, only, kind) => {
  prepare(variant);
  const config = configForUrl("http://127.0.0.1:8080/current", "local");
  config.crawl.random_sample_share = 1;
  const r = await runAudit({ config, outDir: dir, only, kind, log: () => {} });
  const issues = read("issues");
  const history = fs.readFileSync(path.join(dir, "history.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).pop();
  return { run: r.run, issues, questions: read("questions").map((q) => q.id).sort(), counts: history.counts, baseline: history.baseline, kind: history.kind };
};
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.error(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };

const r1 = await audit("base");
check("audit 1 is the baseline with 0 issues", r1.baseline === true && r1.issues.length === 0, `issues ${r1.issues.length}, questions ${r1.questions.length}`);
const r2 = await audit(FAULT);
const newIssues = r2.issues.filter((i) => i.status === "new");
check("audit 2 gives one new issue for one seeded fault", newIssues.length === 1 && r2.counts.new === 1, newIssues.map((i) => i.id + " " + i.rule.id).join(", "));
check("audit 2 is not a baseline", r2.baseline === false);
const id = newIssues[0]?.id;
const r3 = await audit(FAULT, ["http://127.0.0.1:8080/current/help.html"]);
const i3 = r3.issues.find((i) => i.id === id);
check("audit 3 did not test the page: the issue is not checked", i3?.status === "not checked", `status ${i3?.status}`);
const open = pagesWithOpenIssues(dir);
const r4 = await audit(FAULT, open.map((p) => `http://127.0.0.1:8080${p}`), "short check");
const i4 = r4.issues.find((i) => i.id === id);
check("audit 4, the short check, tests the page of the issue: the issue is open", i4?.status === "open" && r4.kind === "short check", `pages ${open.join(", ")}, status ${i4?.status}`);
const r5 = await audit("base");
const i5 = r5.issues.find((i) => i.id === id);
check("audit 5 without the fault: the issue is resolved, reason fixed", i5?.status === "resolved" && i5?.status_by.reason === "fixed" && r5.counts.resolved === 1, `status ${i5?.status}, reason ${i5?.status_by.reason}`);
const r6 = await audit("base");
const i6 = r6.issues.find((i) => i.id === id);
check("audit 6 keeps the issue resolved and counts no new fix", i6?.status === "resolved" && r6.counts.resolved === 0 && r6.counts.new === 0, `status ${i6?.status}, resolved ${r6.counts.resolved}`);
check("audits 1 and 6 give the same question IDs", JSON.stringify(r1.questions) === JSON.stringify(r6.questions), `${r1.questions.length} and ${r6.questions.length}, in one only: ${r1.questions.filter((q) => !r6.questions.includes(q)).concat(r6.questions.filter((q) => !r1.questions.includes(q))).join(", ") || "none"}`);
if (server) server.kill();
console.log(JSON.stringify({ passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, run: r6.run }));
process.exit(results.some((r) => !r.ok) ? 1 : 0);
