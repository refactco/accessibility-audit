// The dry submit sends nothing, and it finds the form errors. See FORMS.md section 3.7.
//
// Usage: node tests/dry-submit.mjs [--serve]
//
// Part 1: a local site whose forms send data in eleven ways, and a server that records each request and each
// WebSocket message. First a control run with no guard proves that each way reaches the server. Then an audit with
// production settings must send nothing: no request to the form address, no WebSocket message, no typed value.
// Part 2: the seeded faults F59 (3.3.1) and F61 (3.3.3) with production settings and no process. Needs the build of
// seed.py served at http://127.0.0.1:8080/, or --serve to start that server, as detect.mjs does.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { runAudit } from "../src/audit.ts";
import { configForUrl } from "../src/config.ts";
import { DRY_VALUE } from "../src/own/dry-submit.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "seeded-faults", "build", "dry-submit");
const PORT = 8091;
const failures = [];
const check = (ok, message) => { console.error(`${ok ? "ok  " : "FAIL"} ${message}`); if (!ok) failures.push(message); };

// Each way to send the data of a form. js: the script that sends the form f. native: the attributes of a form that the browser sends.
const WAYS = {
  "fetch-post": { js: `fetch("/api/collect", { method: "POST", body: new FormData(f) });` },
  "post-form": { native: `method="post" action="/api/collect"` },
  "get-form": { native: `method="get" action="/api/collect"` },
  "fetch-get": { js: `fetch("/api/collect?" + new URLSearchParams(new FormData(f)));` },
  "jsonp-site": { js: `var s = document.createElement("script"); s.src = "/api/collect?" + new URLSearchParams(new FormData(f)) + "&c=cb"; document.head.appendChild(s);` },
  "jsonp-other": { js: `var s = document.createElement("script"); s.src = "http://localhost:${PORT}/api/collect?" + new URLSearchParams(new FormData(f)) + "&c=cb"; document.head.appendChild(s);` },
  "beacon": { js: `navigator.sendBeacon("/api/collect", new FormData(f));` },
  "new-window": { native: `method="get" action="/api/collect" target="_blank"` },
  "frame": { native: `method="post" action="/api/collect" target="sink"`, extra: `<iframe name="sink" title="Result" style="width:40px;height:40px"></iframe>` },
  "pixel-other": { js: `new Image().src = "http://localhost:${PORT}/api/collect?" + new URLSearchParams(new FormData(f));` },
  "websocket": { js: `window.socket.send(JSON.stringify(Object.fromEntries(new FormData(f))));`, head: `window.socket = new WebSocket("ws://127.0.0.1:${PORT}/ws");` },
};

/** A page with two forms: "loose" sends with no check, "checked" sends only when no field is empty. */
function pageOf(way) {
  const w = WAYS[way];
  const attrs = w.native || `action=""`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Dry submit ${way}</title><script>${w.head || ""}</script></head><body><main>
<h1>Contact ${way}</h1>
<form id="loose" novalidate ${attrs}>
  <input type="hidden" name="way" value="token-${way}-loose">
  <p><label for="l-name">Name for ${way}</label> <input id="l-name" name="name" type="text" autocomplete="name"></p>
  <p><label for="l-email">Email for ${way}</label> <input id="l-email" name="email" type="email" autocomplete="email"></p>
  <button type="submit">Send loose ${way}</button>
</form>
<form id="checked" novalidate ${attrs}>
  <input type="hidden" name="way" value="token-${way}-checked">
  <p><label for="c-name">Name</label> <input id="c-name" name="name" type="text" autocomplete="name" aria-describedby="c-name-error"> <span id="c-name-error"></span></p>
  <p><label for="c-email">Email</label> <input id="c-email" name="email" type="email" autocomplete="email" aria-describedby="c-email-error"> <span id="c-email-error"></span></p>
  <button type="submit">Send checked ${way}</button>
</form>
${w.extra || ""}
<script>
  var NATIVE = ${w.native ? "true" : "false"};
  function send(f) { ${w.js || ""} }
  document.getElementById("loose").addEventListener("submit", function (e) { if (!NATIVE) { e.preventDefault(); send(this); } });
  document.getElementById("checked").addEventListener("submit", function (e) {
    e.preventDefault();
    var bad = null;
    [["c-name", "your name"], ["c-email", "your email"]].forEach(function (x) {
      var field = document.getElementById(x[0]); var empty = !field.value.trim();
      field.setAttribute("aria-invalid", empty ? "true" : "false");
      document.getElementById(x[0] + "-error").textContent = empty ? "Enter " + x[1] + "." : "";
      if (empty && !bad) bad = field;
    });
    if (bad) { bad.focus(); return; }
    if (NATIVE) this.submit(); else send(this);
  });
</script></main></body></html>`;
}

/** Two forms that send nothing: "silent" shows its errors with no live region and keeps the focus, "alert" puts them in role=alert. */
const ANNOUNCE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Dry submit announce</title></head><body><main>
<h1>Announce</h1>
<form id="silent" novalidate action="">
  <p><label for="s-name">Your name</label> <input id="s-name" name="sname" type="text" autocomplete="name" aria-describedby="s-name-error"> <span id="s-name-error"></span></p>
  <button type="submit">Send silent</button>
</form>
<form id="alert" novalidate action="">
  <div id="a-summary" role="alert"></div>
  <p><label for="a-name">Your name</label> <input id="a-name" name="aname" type="text" autocomplete="name" aria-describedby="a-name-error"> <span id="a-name-error"></span></p>
  <button type="submit">Send alert</button>
</form>
<script>
  document.getElementById("silent").addEventListener("submit", function (e) { e.preventDefault(); var f = document.getElementById("s-name"); var empty = !f.value.trim(); f.setAttribute("aria-invalid", empty ? "true" : "false"); document.getElementById("s-name-error").textContent = empty ? "Enter your name." : ""; });
  document.getElementById("alert").addEventListener("submit", function (e) { e.preventDefault(); var f = document.getElementById("a-name"); var empty = !f.value.trim(); f.setAttribute("aria-invalid", empty ? "true" : "false"); document.getElementById("a-name-error").textContent = empty ? "Enter your name." : ""; document.getElementById("a-summary").textContent = empty ? "There is a problem: Enter your name." : ""; });
</script></main></body></html>`;

// The server: the pages under /w/, the form address /api/collect, and a WebSocket at /ws. It records everything.
const record = [];
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (d) => { body += d; });
  req.on("end", () => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    record.push({ kind: "http", method: req.method, host: req.headers.host, url: req.url, path: url.pathname, body });
    const way = url.pathname.match(/^\/w\/(.+)\.html$/)?.[1];
    if (way && WAYS[way]) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(pageOf(way)); return; }
    if (way === "announce") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(ANNOUNCE); return; }
    if (url.pathname === "/api/collect") { res.writeHead(200, { "content-type": url.searchParams.has("c") ? "application/javascript" : "text/plain" }); res.end(url.searchParams.has("c") ? "/* ok */" : "ok"); return; }
    res.writeHead(404, { "content-type": "text/plain" }); res.end("not found");
  });
});
server.on("upgrade", (req, socket) => {
  const accept = crypto.createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  record.push({ kind: "ws-open", url: req.url });
  let buf = Buffer.alloc(0);
  socket.on("data", (d) => {
    buf = Buffer.concat([buf, d]);
    while (buf.length >= 2) {
      const opcode = buf[0] & 0x0f;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const masked = (buf[1] & 0x80) !== 0;
      const mask = masked ? buf.subarray(off, off + 4) : null;
      if (masked) off += 4;
      if (buf.length < off + len) return;
      const payload = Buffer.from(buf.subarray(off, off + len));
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      buf = buf.subarray(off + len);
      if (opcode === 1 || opcode === 2) record.push({ kind: "ws-message", body: payload.toString() });
      if (opcode === 8) { socket.end(); return; }
    }
  });
  socket.on("error", () => {});
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
const base = `http://127.0.0.1:${PORT}/w`;
const pages = Object.keys(WAYS).map((w) => `${base}/${w}.html`);
const text = (r) => `${r.url || ""} ${r.body || ""}`;

// The control: with no guard, each way reaches the server. Else the audit below proves nothing.
console.error("control run, no guard");
const browser = await chromium.launch();
for (const way of Object.keys(WAYS)) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${base}/${way}.html`, { waitUntil: "load" });
  await page.fill("#c-name", "Control");
  await page.fill("#c-email", "control@example.com");
  await page.click(`text=Send checked ${way}`);
  await page.waitForTimeout(800);
  await context.close();
  check(record.some((r) => (r.kind === "http" && r.path === "/api/collect" || r.kind === "ws-message") && text(r).includes(`token-${way}-checked`)), `control: ${way} reaches the server with no guard`);
}
await browser.close();

// The audit with production settings: nothing may reach the form address.
console.error("audit with production settings");
record.length = 0;
const config = configForUrl(base, "production");
config.crawl.widths = [390];
config.crawl.random_sample_share = 1;
config.crawl.rate_limit = 10;
const lines = [];
fs.rmSync(path.join(out, "leaks"), { recursive: true, force: true });
const result = await runAudit({ config, outDir: path.join(out, "leaks"), only: [...pages, `${base}/announce.html`], log: (l) => lines.push(l) });
for (const l of lines.filter((l) => l.includes("dry submit"))) console.error("     " + l.trim());
const sent = record.filter((r) => (r.kind === "http" && r.path === "/api/collect") || r.kind === "ws-message");
check(sent.length === 0, `the server got no submission (${sent.length}${sent.length ? ": " + sent.map((r) => `${r.method || r.kind} ${r.url || r.body}`).join("; ") : ""})`);
check(!record.some((r) => text(r).includes(DRY_VALUE)), "no request carried the typed value");
check(record.some((r) => r.kind === "ws-open"), "the WebSocket of the page opened before the guard");
check(result.dryRuns.length === 24, `24 forms got a dry submit (${result.dryRuns.length})`);
const announce = result.pages.find((p) => p.url.endsWith("/announce.html"))?.outcomes.filter((o) => o.rule === "error-not-announced") || [];
check(announce.some((o) => o.selector === "#silent"), "4.1.3: the errors of the silent form are not announced");
check(!announce.some((o) => o.selector === "#alert"), "4.1.3: the errors in role=alert count as announced");
for (const way of Object.keys(WAYS)) {
  const loose = result.dryRuns.find((r) => r.form.name === `Send loose ${way}`);
  const checked = result.dryRuns.find((r) => r.form.name === `Send checked ${way}`);
  check(!!loose && loose.serverOnly && loose.submissions[0].blocked.length > 0, `${way}: the guard blocked the form with no check (${loose ? loose.submissions.map((s) => s.kind + " " + s.blocked.join(", ")).join("; ") : "not run"})`);
  check(!!checked && checked.submissions[0].kind === "browser" && checked.submissions[1]?.kind === "server" && checked.submissions[1].blocked.length > 0, `${way}: errors shown when empty, the guard blocked the send with values (${checked ? checked.submissions.map((s) => s.kind + " " + s.blocked.join(", ")).join("; ") : "not run"})`);
}
const summary = JSON.parse(fs.readFileSync(path.join(out, "leaks", "summary.json"), "utf8"));
check(summary.coverage.forms_tested === 24, `the coverage gives 24 forms (${summary.coverage.forms_tested})`);
check(summary.coverage.tests_not_run.filter((t) => t.includes("checks its fields on the server only")).length === 11, "the coverage lists the 11 forms that check on the server only");
await new Promise((r) => server.close(r));

// Part 2: the seeded form faults with production settings and no process.
let seeded = null;
if (process.argv.includes("--serve")) {
  seeded = spawn("python3", ["-m", "http.server", "8080", "--bind", "127.0.0.1", "--directory", path.join(here, "seeded-faults", "build")], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 1000));
}
const FORM_RULES = new Set(["error-not-in-text", "error-not-linked", "error-without-suggestion", "error-not-announced"]);
async function auditSeeded(variant, files) {
  const dir = path.join(out, variant);
  fs.rmSync(dir, { recursive: true, force: true });
  const c = configForUrl(`http://127.0.0.1:8080/${variant}`, "production");
  c.crawl.widths = [390];
  c.crawl.random_sample_share = 1;
  const r = await runAudit({ config: c, outDir: dir, only: files.map((f) => `http://127.0.0.1:8080/${variant}/${f}`), log: () => {} });
  const read = (folder) => fs.existsSync(path.join(dir, folder)) ? fs.readdirSync(path.join(dir, folder)).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, folder, f), "utf8"))) : [];
  return { run: r, issues: read("issues").filter((i) => ["new", "open", "reopened"].includes(i.status)), questions: read("questions") };
}
try {
  console.error("seeded faults with production settings");
  const b = await auditSeeded("base", ["help.html", "order.html", "order-review.html", "account.html"]);
  const formFindings = [...b.issues.map((i) => i.rule.id), ...b.questions.map((q) => q.evidence.rule)].filter((r) => FORM_RULES.has(r));
  check(formFindings.length === 0, `base: no form finding (${formFindings.join(", ") || "none"})`);
  check(b.run.dryRuns.length === 4 && b.run.dryRuns.every((r) => r.submissions[0].kind === "browser"), `base: 4 forms checked in the browser (${b.run.dryRuns.map((r) => r.form.name + " " + r.submissions.map((s) => s.kind).join("/")).join(", ")})`);
  const f59 = await auditSeeded("F59-error-by-color-only", ["help.html"]);
  check(f59.issues.some((i) => i.wcag.criterion === "3.3.1" && i.rule.id === "error-not-in-text"), `F59: issue 3.3.1 error-not-in-text (${f59.issues.map((i) => i.rule.id).join(", ")})`);
  const f61 = await auditSeeded("F61-error-no-suggestion", ["order.html"]);
  check(f61.questions.some((q) => q.criterion === "3.3.3" && q.evidence.rule === "error-without-suggestion"), `F61: question 3.3.3 error-without-suggestion (${f61.questions.map((q) => q.evidence.rule).join(", ")})`);
} finally {
  if (seeded) seeded.kill();
}

if (failures.length) { console.error(`\n${failures.length} checks failed`); process.exit(1); }
console.error("\nall checks passed");
