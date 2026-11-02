// A graceful stop and a resume. The "Check" line of item 13 of the list of problems of 1.1.1: Ctrl+C during an audit gives a
// results folder with the pages tested so far. Then --resume finishes the run and does not open those pages again. A run that
// a hard kill ends (no results at all) can resume too, from runs/<run>/pages.partial.jsonl.
//
// Usage: node tests/stop.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "seeded-faults", "build", "stop");
const PORT = 8095;
const SITE = `http://stop.localhost:${PORT}`;
const PAGES = 14;
const failures = [];
const check = (ok, message) => { console.error(`${ok ? "ok  " : "FAIL"} ${message}`); if (!ok) failures.push(message); };

// Each page answers after 250 ms, so that the audit takes long enough to stop it in the middle.
const requests = [];
const page = (title, body = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body><main><h1>${title}</h1>${body}</main></body></html>`;
const server = http.createServer((req, res) => {
  const p = new URL(req.url, SITE).pathname;
  if (p === "/robots.txt" || p.endsWith(".xml")) { res.writeHead(404); res.end(); return; }
  requests.push(p);
  setTimeout(() => {
    if (p === "/") { res.writeHead(200, { "content-type": "text/html" }); res.end(page("Home", `<ul>${Array.from({ length: PAGES }, (_, i) => `<li><a href="/p${i + 1}/">Page ${i + 1}</a></li>`).join("")}</ul>`)); return; }
    if (/^\/p\d+\/$/.test(p)) { res.writeHead(200, { "content-type": "text/html" }); res.end(page("Page " + p.slice(2, -1), "<p>Text of the page.</p>")); return; }
    res.writeHead(404, { "content-type": "text/html" }); res.end(page("Not found"));
  }, 250);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const settings = (dir) => {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "settings.json");
  fs.writeFileSync(file, JSON.stringify({ schema: "config/1", site: { url: SITE, environment: "local" }, crawl: { widths: [390], rate_limit: 20, random_sample_share: 0 }, interaction: { max_states_per_page: 0, dry_submit: false }, budgets: { concurrency: 2 } }));
  return file;
};
/** Runs the command, and sends the signal after the log shows `after` pages. Returns the exit code and the log. */
const cli = (args, signal, after) => new Promise((resolve) => {
  const child = spawn(process.execPath, [path.join(here, "..", "src", "cli.ts"), ...args], { stdio: ["ignore", "pipe", "pipe"] });
  let log = "", sent = false;
  child.stderr.on("data", (d) => {
    log += d;
    if (signal && !sent && (log.match(/ page \d+: /g) || []).length >= after) { sent = true; child.kill(signal); }
  });
  child.stdout.on("data", (d) => { log += d; });
  child.on("exit", (code, sig) => resolve({ code, sig, log }));
});
const read = (dir) => ({
  pages: fs.readFileSync(path.join(dir, "pages.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)),
  summary: JSON.parse(fs.readFileSync(path.join(dir, "summary.json"), "utf8")),
  history: fs.readFileSync(path.join(dir, "history.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)),
});

try {
  // Part 1: Ctrl+C after 5 pages started.
  console.error("audit, then Ctrl+C");
  const dir = path.join(out, "graceful");
  const file = settings(dir);
  const results = path.join(dir, "results");
  const a = await cli(["audit", file, "--out", results], "SIGINT", 5);
  check(a.code === 0, `the audit ends normally after Ctrl+C (exit ${a.code}${a.sig ? ", " + a.sig : ""})`);
  check(fs.existsSync(path.join(results, "summary.json")) && fs.existsSync(path.join(results, "report.md")), "item 13: Ctrl+C gives a results folder with a summary and a report");
  const r1 = read(results);
  const tested1 = r1.pages.filter((p) => p.tested).map((p) => new URL(p.url).pathname);
  const stopped = r1.pages.filter((p) => p.not_tested_reason === "stopped");
  check(tested1.length >= 3 && tested1.length < PAGES + 1, `item 13: the results have the pages tested so far (${tested1.length} tested)`);
  check(stopped.length > 0 && tested1.length + stopped.length === PAGES + 1, `the addresses that the audit did not open have the reason "stopped" (${stopped.length})`);
  check(r1.summary.coverage.budget_reached.includes("stopped") && r1.summary.coverage.tests_not_run.some((t) => t.includes("the audit was stopped")), "the summary says that the audit was stopped");
  const runDir = path.join(results, "runs", r1.summary.run.replace(/:/g, "-"));
  const state = JSON.parse(fs.readFileSync(path.join(runDir, "state.json"), "utf8"));
  check(state.finished && state.stopped, "the state of the run says: finished, stopped");

  // Part 2: --resume finishes the run, with the same run ID, and does not open the tested pages again.
  console.error("resume");
  requests.length = 0;
  const b = await cli(["audit", file, "--out", results, "--resume"]);
  check(b.code === 0, `the resume ends normally (exit ${b.code})`);
  const r2 = read(results);
  check(r2.summary.run === r1.summary.run, `the resume keeps the run ID (${r2.summary.run})`);
  check(r2.pages.filter((p) => p.tested).length === PAGES + 1 && !r2.pages.some((p) => p.not_tested_reason === "stopped"), `after the resume, all ${PAGES + 1} pages are tested (${r2.pages.filter((p) => p.tested).length})`);
  const again = tested1.filter((p) => requests.includes(p));
  check(again.length === 0, `the resume does not open the pages that the stopped run tested (${again.join(", ") || "none"})`);
  check(r2.history.length === 1 && !r2.summary.coverage.budget_reached.includes("stopped"), `the history keeps one line for the run (${r2.history.length})`);
  const r3 = await cli(["audit", file, "--out", results, "--resume"]);
  check(r3.code === 1 && /nothing to resume/.test(r3.log), "a run that finished cannot resume");

  // Part 3: a hard kill writes no results. The partial file keeps the pages, and --resume finishes the run.
  console.error("audit, then a hard kill");
  const dir2 = path.join(out, "killed");
  const file2 = settings(dir2);
  const results2 = path.join(dir2, "results");
  const c = await cli(["audit", file2, "--out", results2], "SIGKILL", 6);
  check(c.sig === "SIGKILL" && !fs.existsSync(path.join(results2, "summary.json")), "a hard kill leaves no summary");
  const runs = fs.readdirSync(path.join(results2, "runs"));
  const partial = fs.readFileSync(path.join(results2, "runs", runs[0], "pages.partial.jsonl"), "utf8").trim().split("\n").filter(Boolean);
  check(partial.length >= 3, `the partial file keeps the pages that finished before the kill (${partial.length})`);
  requests.length = 0;
  const d = await cli(["audit", file2, "--out", results2, "--resume"]);
  const r4 = read(results2);
  const kept = partial.map((l) => new URL(JSON.parse(l).record.url).pathname);
  check(d.code === 0 && r4.pages.filter((p) => p.tested).length === PAGES + 1, `the resume after a kill tests all pages (${r4.pages.filter((p) => p.tested).length})`);
  check(!kept.some((p) => requests.includes(p)), `the resume after a kill does not open the saved pages again (${kept.filter((p) => requests.includes(p)).join(", ") || "none"})`);
} finally {
  await new Promise((r) => server.close(r));
}

if (failures.length) { console.error(`\n${failures.length} checks failed`); process.exit(1); }
console.error("\nall checks passed");
