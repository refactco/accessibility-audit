// The summary: the engine version, and the coverage of a criterion that only the processes tested.
//
// Usage: node tests/summary.mjs
import fs from "node:fs";
import { ENGINE_VERSION } from "../src/own/page.ts";
import { siteSummary } from "../src/results.ts";

const failures = [];
const check = (ok, message) => { console.error(`${ok ? "ok  " : "FAIL"} ${message}`); if (!ok) failures.push(message); };

// The version that the audit records is the version of the package. Before 1.1.1 it stayed 0.1.0.
const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
check(ENGINE_VERSION === pkg.version, `the engine version is the package version (${ENGINE_VERSION}, ${pkg.version})`);

// One sample page whose form checks on the server only: the dry submit did not test 3.3.1 there. One process step tested it.
const W = 390;
const page = (url, extra) => ({ url, template: "page", set: "site", states: [], tested: true, links: [], renders: 1, facts: {}, outcomes: [], ...extra });
const crawled = page("https://example.com/contact/", { sample: true, testedCriteria: { [W]: new Set(["1.1.1", "4.1.2"]) } });
const step = page("https://example.com/contact/", { sample: true, process: "contact", testedCriteria: { [W]: new Set(["1.1.1", "3.3.1", "3.3.3", "3.3.7"]) } });
const summary = siteSummary([crawled, step], [W], { all: 1, tested: 1 }, new Map(), new Map());

const c331 = summary["3.3.1"];
check(c331.result === "no issue found", `3.3.1: the process gives "no issue found" (${c331.result})`);
check(c331.coverage.tested_units === 0 && c331.coverage.all_units === 1, `3.3.1: the template units stay 0 of 1 (${c331.coverage.tested_units} of ${c331.coverage.all_units})`);
check(c331.coverage.process_units?.tested === 1 && c331.coverage.process_units?.all === 1, `3.3.1: the coverage names the process step (${JSON.stringify(c331.coverage.process_units)})`);
check(!summary["1.1.1"].coverage.process_units, "1.1.1: a criterion with no process test has no process units");
check(summary["3.3.7"].coverage.definition === "process" && !summary["3.3.7"].coverage.process_units, "3.3.7: a process criterion counts the processes, as before");

// With no process, a criterion that the dry submit could not test stays "not tested".
const alone = siteSummary([crawled], [W], { all: 0, tested: 0 }, new Map(), new Map());
check(alone["3.3.1"].result === "not tested" && !alone["3.3.1"].coverage.process_units, `3.3.1 with no process: "not tested" (${alone["3.3.1"].result})`);

if (failures.length) { console.error(`\n${failures.length} checks failed`); process.exit(1); }
console.error("\nall checks passed");
