// The review test of stage 6: an AI answer makes an issue with the certainty "ai fail", a verified disagreement leaves the
// question unresolved and a refresh keeps the verification, a person's answer wins, and the decisions of a person give
// "passed" and "not applicable" for a scope. Six audits of the seeded site, and two refreshes.
//
// Usage: node tests/review.mjs [--serve] [--out <folder>]   Needs the build of seed.py served at http://127.0.0.1:8080/.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAudit } from "../src/audit.ts";
import { configForUrl } from "../src/config.ts";
import { answerQuestion, effectiveAnswer, recordDecision, setIssueStatus, verifyQuestion } from "../src/decide.ts";
import { refresh } from "../src/refresh.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : null; };
const dir = path.resolve(flag("out") || path.join(here, "seeded-faults", "build", "review"));
const FAULT = "F02-image-empty-alt";
let server = null;
if (args.includes("--serve")) {
  server = spawn("python3", ["-m", "http.server", "8080", "--bind", "127.0.0.1", "--directory", path.join(here, "seeded-faults", "build")], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 1000));
}
fs.rmSync(dir, { recursive: true, force: true });
const build = path.join(here, "seeded-faults", "build");
const current = path.join(build, "current");
const prepare = (variant) => {
  fs.rmSync(current, { recursive: true, force: true });
  fs.cpSync(path.join(build, variant), current, { recursive: true });
  const sitemap = path.join(current, "sitemap.xml");
  fs.writeFileSync(sitemap, fs.readFileSync(sitemap, "utf8").replaceAll(`http://127.0.0.1:8080/${variant}/`, "http://127.0.0.1:8080/current/"));
};
const read = (folder) => fs.readdirSync(path.join(dir, folder)).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, folder, f), "utf8")));
const configOf = () => { const config = configForUrl("http://127.0.0.1:8080/current", "local"); config.crawl.random_sample_share = 1; return config; };
const snapshot = () => {
  const pages = fs.readFileSync(path.join(dir, "pages.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  return { issues: read("issues"), questions: read("questions"), pages, summary: JSON.parse(fs.readFileSync(path.join(dir, "summary.json"), "utf8")) };
};
const audit = async (variant) => {
  prepare(variant);
  await runAudit({ config: configOf(), outDir: dir, log: () => {} });
  return snapshot();
};
const unitOfHome = (r) => r.pages.find((p) => p.url.endsWith("/current/"))?.results["390"]["1.1.1"];
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok }); console.error(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`); };

// 1. The fault gives a review question for the AI, with a screenshot as evidence.
const r1 = await audit(FAULT);
const q = r1.questions.find((x) => x.criterion === "1.1.1" && x.kind === "review");
check("audit 1 gives a review question for 1.1.1 with a screenshot", !!q && !!q.evidence.image && fs.existsSync(path.join(dir, q.evidence.image)), q ? `${q.id} ${q.evidence.rule} image ${q.evidence.image}` : "no question");
const unit1 = r1.pages.find((p) => p.url.endsWith("/current/"))?.results["390"]["1.1.1"];
check("the unit result is needs review", unit1 === "needs review", unit1);

// 2. The AI answers "issue": the next audit has an issue with the certainty "ai fail", linked to the question.
answerQuestion(dir, q.id, "issue", { by: "ai", model: "test-model", confidence: "high", reason: "The image carries information and has an empty alt." });
const r2 = await audit(FAULT);
const q2 = r2.questions.find((x) => x.id === q.id);
const i2 = r2.issues.find((i) => i.question === q.id);
check("audit 2 makes an issue with the certainty ai fail from the AI answer", !!i2 && i2.certainty === "ai fail" && q2?.issue === i2.id, i2 ? `${i2.id} ${i2.certainty}, question.issue ${q2?.issue}` : "no issue");
check("the AI answer stays on the question, and the unit result is failed", q2?.ai_answer?.value === "issue" && r2.pages.find((p) => p.url.endsWith("/current/"))?.results["390"]["1.1.1"] === "failed", `answer ${q2?.ai_answer?.value}`);
check("the summary counts one AI-only answer for 1.1.1", r2.summary.criteria["1.1.1"].ai_only_answers === 1, `ai_only_answers ${r2.summary.criteria["1.1.1"].ai_only_answers}`);

// 2b. The verifier disagrees: the question is unresolved, the issue of this run goes, and the unit result is needs review. The refresh keeps the verification.
verifyQuestion(dir, q.id, "no issue", { by: "ai", model: "test-model", confidence: "high", reason: "The caption gives the information." });
refresh(configOf(), dir);
const r2b = snapshot();
const q2b = r2b.questions.find((x) => x.id === q.id);
const i2b = r2b.issues.find((i) => i.id === i2.id);
check("refresh: a verified disagreement stays on the question, and the question is unresolved", q2b?.verification?.value === "no issue" && q2b?.verification?.agrees === false && !!q2b && effectiveAnswer(q2b).unresolved, `verification ${q2b?.verification?.value}, agrees ${q2b?.verification?.agrees}`);
check("the issue of the same run goes, and the unit result is needs review", !i2b && unitOfHome(r2b) === "needs review" && r2b.summary.criteria["1.1.1"].open_questions === 1, `issue ${i2b?.status || "none"}, unit ${unitOfHome(r2b)}, open questions ${r2b.summary.criteria["1.1.1"].open_questions}`);

// 2c. The verifier agrees: two equal AI answers make the issue again, with the certainty ai fail.
verifyQuestion(dir, q.id, "issue", { by: "ai", model: "test-model", confidence: "high", reason: "The image carries information and has an empty alt." });
refresh(configOf(), dir);
const r2c = snapshot();
const i2c = r2c.issues.find((i) => i.id === i2.id);
check("refresh: two AI answers that agree make the issue again, with the certainty ai fail", i2c?.status === "new" && i2c?.certainty === "ai fail" && unitOfHome(r2c) === "failed", `status ${i2c?.status}, certainty ${i2c?.certainty}, unit ${unitOfHome(r2c)}`);

// 2d. The audit runs without the answer, as after a changed item: the issue resolves. Then the two answers come again in the same run,
// and the refresh opens the issue again: it was open before the run, so it is not resolved and not new.
const qPath = path.join(dir, "questions", q.id + ".json");
const qFile = JSON.parse(fs.readFileSync(qPath, "utf8"));
qFile.ai_answer = null; delete qFile.verification;
fs.writeFileSync(qPath, JSON.stringify(qFile, null, 1) + "\n");
const r2d = await audit(FAULT);
const i2d = r2d.issues.find((i) => i.id === i2.id);
check("an audit without the answer resolves the issue", i2d?.status === "resolved" && i2d?.status_by?.reason === "fixed", `status ${i2d?.status}`);
answerQuestion(dir, q.id, "issue", { by: "ai", model: "test-model", confidence: "high", reason: "The image carries information and has an empty alt." });
verifyQuestion(dir, q.id, "issue", { by: "ai", model: "test-model", confidence: "high", reason: "The image carries information and has an empty alt." });
refresh(configOf(), dir);
const r2e = snapshot();
const i2e = r2e.issues.find((i) => i.id === i2.id);
check("refresh: the answers of the same run open the issue again, not resolved and not new", i2e?.status === "open" && i2e?.certainty === "ai fail" && unitOfHome(r2e) === "failed", `status ${i2e?.status}, certainty ${i2e?.certainty}, unit ${unitOfHome(r2e)}`);

// 3. A person answers "no issue": the person wins, the issue resolves, and the unit result is no issue found.
answerQuestion(dir, q.id, "no issue", { by: "Test Person", note: "The caption gives the information." });
const r3 = await audit(FAULT);
const i3 = r3.issues.find((i) => i.id === i2.id);
const unit3 = r3.pages.find((p) => p.url.endsWith("/current/"))?.results["390"]["1.1.1"];
check("audit 3: the person's answer wins, the issue is resolved, and the unit is no issue found", i3?.status === "resolved" && unit3 === "no issue found", `status ${i3?.status}, unit ${unit3}`);
const q3 = r3.questions.find((x) => x.id === q.id);
check("the verification survives an audit", q3?.verification?.value === "issue" && q3?.verification?.agrees === true, `verification ${q3?.verification?.value}`);

// 4. Decisions: passed for a page, not applicable for a criterion, and a dismissed issue.
const audioQ = r3.questions.find((x) => x.criterion === "1.2.1");
recordDecision(dir, "1.2.1", "passed", { pages: ["/current/"] }, "Test Person", "The transcript is complete.");
recordDecision(dir, "2.5.7", "not applicable", { pages: ["/current/products.html"] }, "Test Person");
const r4 = await audit(FAULT);
const home4 = r4.pages.find((p) => p.url.endsWith("/current/"))?.results["390"];
const products4 = r4.pages.find((p) => p.url.endsWith("/current/products.html"))?.results["390"];
check("audit 4: the decisions give passed and not applicable on their pages", home4?.["1.2.1"] === "passed" && products4?.["2.5.7"] === "not applicable", `1.2.1 ${home4?.["1.2.1"]}, 2.5.7 ${products4?.["2.5.7"]}`);
// The roll-up of PLAN.md 7.2 puts "no content found" before "passed": the other pages have no media, so the site result stays "no content found".
check("the site result of 1.2.1 follows the roll-up order: no content found before passed", r4.summary.criteria["1.2.1"].result === "no content found", r4.summary.criteria["1.2.1"].result);

// 5. A person answers "issue" on the same question: the issue comes back with the certainty fail. Then the person dismisses it.
const q5 = q;
answerQuestion(dir, q5.id, "issue", { by: "Test Person" });
const r5 = await audit(FAULT);
const i5 = r5.issues.find((i) => i.question === q5.id);
check("audit 5: a person's issue answer gives the certainty fail", !!i5 && i5.certainty === "fail", i5 ? `${i5.id} ${i5.certainty}` : "no issue");
setIssueStatus(dir, i5.id, "dismissed", "Test Person", "false positive", "Checked by hand.");
const r6 = await audit(FAULT);
const i6 = r6.issues.find((i) => i.id === i5.id);
check("audit 6: the dismissed issue keeps its status and its decision", i6?.status === "dismissed" && i6?.decision?.reason === "false positive", `status ${i6?.status}`);
if (server) server.kill();
console.log(JSON.stringify({ passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length }));
process.exit(results.some((r) => !r.ok) ? 1 : 0);
