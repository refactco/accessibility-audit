// The axe-core baseline on the seeded faults: which faults axe-core alone finds.
//
// Usage: node tests/seeded-faults/baseline-axe.mjs [build_dir]
//
// Serves build_dir on 127.0.0.1:8080, loads the page of each fault in Chromium,
// runs axe-core with the WCAG tags and target-size on, and compares the rules
// that fired with the criterion of the fault. Writes build_dir/baseline-axe.json
// and tests/seeded-faults/baseline-axe.md.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] || path.join(here, "build"));
const axePath = require.resolve("axe-core/axe.min.js");
const axeVersion = require("axe-core/package.json").version;
const criteria = JSON.parse(fs.readFileSync(path.join(here, "..", "..", "criteria", "criteria.json"), "utf8"));
const faults = JSON.parse(fs.readFileSync(path.join(here, "faults.json"), "utf8"));

const ruleToCriteria = new Map();
for (const entry of criteria.criteria) {
  for (const rule of entry.axe_rules || []) {
    if (!ruleToCriteria.has(rule.id)) ruleToCriteria.set(rule.id, new Set());
    ruleToCriteria.get(rule.id).add(entry.id);
  }
}

const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".wav": "audio/wav", ".xml": "application/xml", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(8080, "127.0.0.1", resolve));

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });

async function audit(variant, page) {
  const tab = await context.newPage();
  await tab.goto(`http://127.0.0.1:8080/${variant}/${page}`, { waitUntil: "load" });
  await tab.addScriptTag({ path: axePath });
  const result = await tab.evaluate(async () => {
    return await window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
      rules: { "target-size": { enabled: true } },
      resultTypes: ["violations", "incomplete"],
    });
  });
  await tab.close();
  const pick = (list) => list.map((r) => ({ rule: r.id, criteria: [...(ruleToCriteria.get(r.id) || [])], nodes: r.nodes.length, targets: r.nodes.slice(0, 3).map((n) => n.target.join(" ")) }));
  return { violations: pick(result.violations), incomplete: pick(result.incomplete) };
}

const pages = ["index.html", "articles.html", "storage.html", "products.html", "order.html", "order-review.html", "order-done.html", "help.html", "account.html", "sitemap.html", "privacy.html", "search.html"];
const base = {};
for (const page of pages) base[page] = await audit("base", page);

const rows = [];
for (const fault of faults.faults) {
  const also = new Set(fault.also || []);
  const result = await audit(fault.id, fault.page);
  const baseline = base[fault.page];
  const newOnly = (list, baseList) => list.filter((r) => !baseList.some((b) => b.rule === r.rule && b.nodes === r.nodes));
  const violations = newOnly(result.violations, baseline.violations);
  const incomplete = newOnly(result.incomplete, baseline.incomplete);
  const hit = (list) => list.filter((r) => r.criteria.includes(fault.criterion));
  const related = (list) => list.filter((r) => !r.criteria.includes(fault.criterion) && r.criteria.some((c) => also.has(c)));
  const v = hit(violations), i = hit(incomplete), rel = [...related(violations), ...related(incomplete)];
  const other = violations.filter((r) => !v.includes(r) && !rel.includes(r));
  // found: the rule maps to the criterion of the fault. related: it maps to a criterion in "also" only.
  rows.push({ id: fault.id, criterion: fault.criterion, decider: fault.decider, page: fault.page,
    found: v.length ? "violation" : i.length ? "incomplete" : rel.length ? "related" : "no",
    rules: [...v, ...i, ...rel].map((r) => r.rule), other: other.map((r) => r.rule) });
}

await browser.close();
server.close();

const baseViolations = Object.entries(base).flatMap(([page, r]) => r.violations.map((v) => ({ page, ...v })));
const baseIncomplete = Object.entries(base).flatMap(([page, r]) => r.incomplete.map((v) => ({ page, ...v })));
const summary = {
  date: new Date().toISOString().slice(0, 10), axe: axeVersion,
  faults: rows.length, violation: rows.filter((r) => r.found === "violation").length, incomplete: rows.filter((r) => r.found === "incomplete").length,
  byDecider: {},
  baseViolations, baseIncomplete, rows,
};
for (const d of ["engine", "ai", "person"]) {
  const sub = rows.filter((r) => r.decider === d);
  summary.byDecider[d] = { faults: sub.length, violation: sub.filter((r) => r.found === "violation").length, incomplete: sub.filter((r) => r.found === "incomplete").length };
}
fs.writeFileSync(path.join(root, "baseline-axe.json"), JSON.stringify(summary, null, 1));

const md = [];
md.push(`# The axe-core baseline on the seeded faults\n`);
md.push(`Generated by \`baseline-axe.mjs\` on ${summary.date} with axe-core ${axeVersion}, Chromium, the WCAG tags, and \`target-size\` on. Do not edit by hand.\n`);
const relatedCount = rows.filter((r) => r.found === "related").length;
md.push(`A fault is found when a rule of its criterion fires. "Related" means that only a rule of a criterion in the "also" list fired.\n`);
md.push(`| Faults | Found as a violation | Found as incomplete | Related only | Not found |\n|---|---|---|---|---|\n| ${summary.faults} | ${summary.violation} | ${summary.incomplete} | ${relatedCount} | ${summary.faults - summary.violation - summary.incomplete - relatedCount} |\n`);
md.push(`| Decider in the plan | Faults | Violation | Incomplete |\n|---|---|---|---|`);
for (const [d, s] of Object.entries(summary.byDecider)) md.push(`| ${d} | ${s.faults} | ${s.violation} | ${s.incomplete} |`);
md.push(`\nThe base site gives ${baseViolations.length} violations and ${baseIncomplete.length} incomplete results over ${pages.length} pages.\n`);
if (baseViolations.length) md.push(`| Base page | Rule | Nodes |\n|---|---|---|\n${baseViolations.map((v) => `| ${v.page} | ${v.rule} | ${v.nodes} |`).join("\n")}\n`);
if (baseIncomplete.length) md.push(`Incomplete on the base: ${[...new Set(baseIncomplete.map((v) => `${v.rule} (${v.page})`))].join(", ")}.\n`);
md.push(`| Fault | Criterion | Decider | Found | Rules | Other new violations |\n|---|---|---|---|---|---|`);
for (const r of rows) md.push(`| ${r.id} | ${r.criterion} | ${r.decider} | ${r.found} | ${r.rules.join(", ") || "-"} | ${r.other.join(", ") || "-"} |`);
fs.writeFileSync(path.join(here, "baseline-axe.md"), md.join("\n") + "\n");
console.log(`faults ${summary.faults}: violation ${summary.violation}, incomplete ${summary.incomplete}; base violations ${baseViolations.length}, base incomplete ${baseIncomplete.length}`);
