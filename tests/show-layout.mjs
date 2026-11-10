// "How to see it" and "Show it with the test" of 1.3.10: a layout finding shows only under the conditions of its test, so the review
// page gives the steps and opens the page with the test. A local page, no network.
//
// Usage: node tests/show-layout.mjs
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configForUrl } from "../src/config.ts";
import { launch } from "../src/browser.ts";
import { howToSee, showLayout, summaryOf } from "../src/show.ts";
import { itemDetails } from "../src/review.ts";

const failures = [];
const check = (ok, message) => { console.error(`${ok ? "ok  " : "FAIL"} ${message}`); if (!ok) failures.push(message); };

// A stat box that fits its number with normal spacing and cuts it with the text spacing of 1.4.12, and a box wider than 320 px.
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Stats</title><style>
body { margin: 0; font-family: monospace; }
.row { display: flex; gap: 16px; padding: 20px; }
.stat { width: 200px; overflow: hidden; }
.stat h3 { font-size: 60px; margin: 0; white-space: nowrap; font-weight: normal; }
.wide { width: 600px; background: #eee; }
</style></head><body><main>
<div class="row"><div class="stat" id="s1"><h3>97.4%</h3><p>Match rate</p></div><div class="stat"><h3>209</h3><p>Students</p></div></div>
<div class="wide" id="w">A wide box</div>
</main></body></html>`;
const server = createServer((req, res) => { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(PAGE); });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const site = `http://127.0.0.1:${server.address().port}`;
const config = configForUrl(site, "staging");
const dir = mkdtempSync(join(tmpdir(), "a11y-show-"));
const browser = await launch();

try {
  // The steps.
  const spacing = howToSee("text-cut-with-spacing", [768, 1280], [390, 768, 1280]);
  check(spacing.steps[0].includes("768 or 1280 px wide") && spacing.code.includes("letter-spacing: 0.12em") && spacing.steps[1].includes("0.12 times"), "the steps of the text spacing give the widths of the finding and the CSS of 1.4.12");
  check(howToSee("text-cut-with-spacing", [], [390, 768, 1280]).steps[0].includes("390, 768 or 1280 px"), "with no widths of the finding, the steps give the widths of the audit");
  check(howToSee("text-cut-at-zoom", [], [390, 768, 1280]).steps.join(" ").includes("1280 px wide") && howToSee("text-cut-at-zoom", [], [1280]).steps[1].includes("200%"), "the steps of the zoom give the largest width and 200%");
  check(howToSee("no-reflow", [], [1280]).steps[0].includes("320 px"), "the steps of the reflow give 320 px");
  check(howToSee("image-alt", [], [1280]) === null, "a rule with no layout test has no steps");

  // The side panel of a layout question has the steps and the button. Another question does not.
  mkdirSync(join(dir, "questions"), { recursive: true });
  const q = (id, rule, selector, text) => ({ schema: "question/2", id, kind: "review", issue: null, criterion: rule === "no-reflow" ? "1.4.10" : rule === "text-cut-at-zoom" ? "1.4.4" : "1.4.12", fingerprint: id, item_hash: id, context: null,
    question: "Is the cut text available in another way?", evidence: { url: "/", selector, html: "", facts: { text }, rule, summary: "s", occurrences: 1, pages: ["/"] }, ai_answer: null, sample: false, person_answer: null, pages: 1 });
  writeFileSync(join(dir, "questions", "Q-00000001.json"), JSON.stringify(q("Q-00000001", "text-cut-with-spacing", "#s1", "97.4%\n\nMatch rate")));
  writeFileSync(join(dir, "questions", "Q-00000002.json"), JSON.stringify(q("Q-00000002", "image-alt", "img", "")));
  const d1 = itemDetails(config, dir, "Q-00000001"), d2 = itemDetails(config, dir, "Q-00000002");
  check(d1?.showable === true && d1.howTo?.steps.length === 3 && d1.howTo.steps[0].includes(config.crawl.widths.join(", ").replace(/, (\d+)$/, " or $1")), "the side panel of a text spacing question has the steps with the widths of the audit, and the button");
  check(!d2?.howTo && !d2?.showable, "the side panel of another question has no steps and no button");

  // The test, before and after.
  const png = (b64) => typeof b64 === "string" && b64.startsWith("iVBOR");
  const r1 = await showLayout(config, q("Q-1", "text-cut-with-spacing", "#s1", "97.4%\n\nMatch rate"), [768], { browser });
  const v1 = r1.views[0];
  check(r1.views.length === 1 && v1.found && v1.cutBefore <= 2 && v1.cutAfter > 2, `the number fits with normal spacing and is cut with the text spacing (${v1.cutBefore} px, ${v1.cutAfter} px)`);
  check(png(v1.before) && png(v1.after), "the view has a screenshot before and after the test");
  check(r1.summary.includes("768 px: the element hides") && r1.summary.includes("with the text spacing"), `the summary says what the test shows (${r1.summary})`);
  const r2 = await showLayout(config, q("Q-2", "text-cut-with-spacing", "#gone > div:nth-child(9)", "97.4%\n\nMatch rate"), [390, 768], { browser });
  check(r2.views.length === 2 && r2.views.every((v) => v.found), "a selector that does not match finds the element by its text, in the smallest container with hidden overflow, at each width");
  const r3 = await showLayout(config, q("Q-3", "no-reflow", "#w", ""), [1280], { browser });
  check(r3.views[0].found && r3.views[0].cutAfter > 8 && png(r3.views[0].after) && r3.summary.includes("needs a horizontal scroll"), `at 320 px the page needs a horizontal scroll (${r3.views[0].cutAfter} px)`);
  const r4 = await showLayout(config, q("Q-4", "text-cut-at-zoom", "#s1", "97.4%"), [390, 1280], { browser });
  check(r4.views.length === 1 && r4.views[0].label.startsWith("1280 px") && png(r4.views[0].before) && png(r4.views[0].after), "the zoom test shows the largest width at 100% and at 200%");
  const r5 = await showLayout(config, q("Q-5", "text-cut-with-spacing", "#nope", "no such text"), [768], { browser });
  check(!r5.views[0].found && /not on the page now/.test(r5.summary), "an element that is not on the page now gives a note, not an error");
  let refused = "";
  const running = showLayout(config, q("Q-6", "text-cut-with-spacing", "#s1", "97.4%"), [768], { browser });
  try { await showLayout(config, q("Q-7", "text-cut-with-spacing", "#s1", "97.4%"), [768], { browser }); } catch (e) { refused = e.message; }
  await running;
  check(/runs already/.test(refused), "a second test while one runs is refused");
  let wrongRule = "";
  try { await showLayout(config, q("Q-8", "image-alt", "img", ""), [768], { browser }); } catch (e) { wrongRule = e.message; }
  check(/no test to show/.test(wrongRule), "a question with no layout test is refused");
  check(summaryOf("text-cut-with-spacing", [{ label: "768 px", width: 768, found: true, cutBefore: 30, cutAfter: 30 }]).includes("also without the test"), "text that is cut also without the test says so");
} finally {
  await browser.close();
  server.close();
  rmSync(dir, { recursive: true, force: true });
}

if (failures.length) { console.error(`\n${failures.length} failed`); process.exit(1); }
console.error("\nall passed");
