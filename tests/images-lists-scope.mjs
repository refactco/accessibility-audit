// The images of text, the lists, the labels, the players, and the pages out of scope. Each check is one item of the list of problems
// of the sample check that a person did on the seventh full audit of a large site, with 1.3.4. 1: the image-of-text test reads the
// pixels of the image itself: a photo under a banner of text, or a lazy photo, is not a candidate, and small letters on a large ground
// are. An image from another site and a transparent image are still read. 2: the list question gives the lines of the list, from the
// innermost container, and its screenshot shows them. 3: a label that only a screen reader reads is not a visible label. 4: the player
// question says that the title of the frame does not count. 5: the pages that the settings skip now end their issues as "page
// removed" with the reason "out of scope", their questions go, and the audit sends them no request.
//
// Usage: node tests/images-lists-scope.mjs [--verbose]
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { runAudit } from "../src/audit.ts";
import { configForUrl } from "../src/config.ts";
import { refresh } from "../src/refresh.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "seeded-faults", "build", "images-lists-scope");
const PORT = 8105;
const SITE = `http://127.0.0.1:${PORT}`;
// An image from another site, and the player of a service: the same server under the name localhost.
const OTHER = `http://localhost:${PORT}`;
const failures = [];
const check = (ok, message) => { console.error(`${ok ? "ok  " : "FAIL"} ${message}`); if (!ok) failures.push(message); };
const verbose = process.argv.includes("--verbose");

/** A PNG file from a function that gives the color of each pixel. */
function png(w, h, at, alpha = false) {
  const ch = alpha ? 4 : 3, row = w * ch + 1, raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = at(x, y); for (let k = 0; k < ch; k++) raw[y * row + 1 + x * ch + k] = c[k] ?? 255; }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const heightOf = (file) => fs.readFileSync(file).readUInt32BE(20);

// 1: a photo: noise of all colors. Small letters on a large red ground, in four light colors of less than 1% each, as the title image
// of a newsletter on the large site: no second color has 2%, but the letters are far from the ground. Dark letters on a white ground.
// Dark letters on a transparent ground.
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const PHOTO = png(400, 225, () => [rnd() * 255, rnd() * 255, rnd() * 255]);
const INKS = [[255, 204, 0], [255, 230, 120], [255, 255, 255], [240, 170, 40]];
const letter = (x, y, rows) => rows.some(([top, n]) => y >= top && y < top + 12 && x >= 40 && x < 40 + n * 8 && (x - 40) % 8 < 3);
const SMALL_TEXT = png(400, 225, (x, y) => letter(x, y, [[90, 40], [110, 40]]) ? INKS[Math.floor((x - 40) / 8) % 4] : [155, 0, 0]);
const OTHER_TEXT = png(400, 225, (x, y) => letter(x, y, [[60, 40], [90, 40], [120, 40], [150, 40]]) ? [20, 20, 20] : [255, 255, 255]);
const CLEAR_TEXT = png(400, 225, (x, y) => letter(x, y, [[60, 40], [90, 40], [120, 40], [150, 40]]) ? [10, 30, 90, 255] : [0, 0, 0, 0], true);
const GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";

const doc = (title, body, head = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title><style>img{display:block;width:400px;height:225px}</style>${head}</head><body>${body}</body></html>`;
const long = (n) => Array.from({ length: n }, (_, i) => `<p>Paragraph ${i + 1} of the article tells a part of the story in full sentences, as a news article does, with no number at its start.</p>`).join("");
// 1: a lazy photo with a placeholder from a data address, and a photo that a fixed banner of text covers when it is in the middle of
// the window. A script of the page opens a notice at the top when the window changes its size, as a script of the large site moved
// its page during the element screenshot of 1.3.5: the screenshot then showed the paragraphs above the photo.
const photos = doc("Photos", `<main><div id="notice" style="height:0;overflow:hidden"></div><h1>Photos</h1>${long(3)}<div style="height:1200px"></div>
<img class="lazyload" src="${GIF}" data-src="/img/lazy-photo.png" alt="Three nurses in masks">
<div style="height:600px"></div>${long(4)}<img src="/img/covered-photo.png" alt="A crowd at the campus">${long(2)}</main>
<div class="consent" style="position:fixed;left:0;right:0;bottom:0;height:70vh;background:#111;color:#fff;font:20px/1.5 sans-serif;padding:16px">We value your privacy. We use cookies to make the site better. Press Accept or Reject.</div>
<script>
const io = new IntersectionObserver((list) => { for (const e of list) if (e.isIntersecting) { e.target.src = e.target.dataset.src; e.target.classList.replace("lazyload", "lazyloaded"); io.unobserve(e.target); } });
document.querySelectorAll("img.lazyload").forEach((i) => io.observe(i));
addEventListener("resize", () => { const n = document.getElementById("notice"); n.style.height = "300px"; setTimeout(() => { n.style.height = "0px"; }, 3000); });
</script>`);
const textImages = doc("Images of text", `<main><h1>Images of text</h1><img src="/img/small-text.png" alt="Family Medicine Department">
<img src="${OTHER}/img/other-text.png" alt="Annual lecture"><div style="background:#ffeecc;padding:8px"><img src="/img/clear-text.png" alt="Open house"></div></main>`);
// 2: an article whose list of five points comes low, after a tall photo, as one item a line in its own paragraph. A list of steps with
// line breaks in one paragraph.
const article = doc("Article", `<main><h1>Article</h1><div class="entry"><div class="wysiwyg">${long(6)}<div style="height:1200px;background:#ddd"></div>
<p>The authors set out a five-point call to action:</p><p>1. Evidence must lead the decisions.</p><p>2. Ask the scientists for advice.</p><p>3. Fund the research.</p><p>4. Track the environment.</p><p>5. Do not pause the work on the climate.</p>${long(1)}</div></div></main>`);
const steps = doc("Steps", `<main><h1>Steps</h1><div class="box"><p>To apply:<br>1. Open the form.<br>2. Fill in the fields.<br>3. Send the form.</p></div></main>`);
// 3: a field with a label that only a screen reader reads, one with a label off the screen, and one with a visible label.
const form = doc("Form", `<main><h1>Form</h1><form action="/form/" method="get">
<label class="visually-hidden" for="q">Search the site</label><input id="q" name="q" type="text">
<label for="full">Full name</label><input id="full" name="full" type="text" autocomplete="name">
<label for="mail" style="position:absolute;left:-10000px">Email address</label><input id="mail" name="mail" type="email" autocomplete="email">
<button type="submit">Go</button></form></main>`, `<style>.visually-hidden{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}</style>`);
// 4: an embedded player with a title.
const media = doc("Media", `<main><h1>Media</h1><iframe title="Our video about the school" src="${OTHER}/player/" width="400" height="225"></iframe></main>`);
// 5: two old pages outside the WordPress site, as the static annual reports of the large site. One button with no name is on both
// old pages. One image with no alt is on an old page and on a page that stays. A list is on an old page only.
const oldPage = (n) => doc(`Old report ${n}`, `<main><h1>Old report ${n}</h1><button class="old-button" type="button"></button>${n === 1 ? `<img class="shared" src="/img/covered-photo.png">` : `<p>The year:<br>1. We grew.<br>2. We built.<br>3. We hired.</p>`}</main>`);
const keep = doc("Keep", `<main><h1>Keep</h1><img class="shared" src="/img/covered-photo.png"></main>`);

let phase = 1;
const requests = [];
const PAGES = ["/", "/photos/", "/text-images/", "/article/", "/steps/", "/form/", "/media/", "/keep/"];
const OLD = ["/old/1.html", "/old/2.html"];
const linked = () => [...PAGES.slice(1), ...(phase === 1 ? OLD : [])];
const server = http.createServer((req, res) => {
  const p = new URL(req.url, SITE).pathname;
  requests.push({ phase, path: p });
  const send = (body, type = "text/html; charset=utf-8", status = 200) => { res.writeHead(status, { "content-type": type }); res.end(body); };
  if (p === "/robots.txt") return send(`User-agent: *\nSitemap: ${SITE}/sitemap.xml\n`, "text/plain");
  if (p === "/sitemap.xml") return send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["/", ...linked()].map((u) => `<url><loc>${SITE}${u}</loc></url>`).join("")}</urlset>`, "application/xml");
  if (p === "/") return send(doc("Home", `<main><h1>Home</h1><ul>${linked().map((u) => `<li><a href="${u}">Page ${u}</a></li>`).join("")}</ul></main>`));
  const images = { "/img/lazy-photo.png": PHOTO, "/img/covered-photo.png": PHOTO, "/img/small-text.png": SMALL_TEXT, "/img/other-text.png": OTHER_TEXT, "/img/clear-text.png": CLEAR_TEXT };
  if (images[p]) return send(images[p], "image/png");
  const pages = { "/photos/": photos, "/text-images/": textImages, "/article/": article, "/steps/": steps, "/form/": form, "/media/": media, "/keep/": keep, "/old/1.html": oldPage(1), "/old/2.html": oldPage(2) };
  if (pages[p]) return send(pages[p]);
  if (p === "/player/") return send(doc("Player", "<p>The video player.</p>"));
  send(doc("Not found", "<main><h1>Not found</h1></main>"), undefined, 404);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
const other = http.createServer((req, res) => server.emit("request", req, res));
await new Promise((r) => other.listen(PORT, "::1", r).on("error", () => r()));

const config = configForUrl(SITE, "production");
config.crawl.widths = [390, 1280];
config.crawl.rate_limit = 20;
config.crawl.random_sample_share = 0;
config.crawl.load_wait_seconds = 1;
config.crawl.sample_pages = [...PAGES, ...OLD].map((u) => SITE + u);
config.interaction.dry_submit = false;
const readDir = (name) => fs.readdirSync(path.join(dir, name)).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, name, f), "utf8")));
const audit = async () => {
  const lines = [];
  const result = await runAudit({ config, outDir: dir, log: (l) => lines.push(l) });
  if (verbose) for (const l of lines) console.error("     " + l);
  return { result, lines, issues: readDir("issues"), questions: readDir("questions"), report: fs.readFileSync(path.join(dir, "report.md"), "utf8") };
};
const outcomesOf = (r, u, rule) => (r.result.pages.find((p) => p.url === SITE + u)?.outcomes || []).filter((o) => o.rule === rule);
const questionsOn = (r, u, rule) => r.questions.filter((q) => q.evidence.rule === rule && (q.evidence.pages || []).includes(u));

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const formats = path.join(here, "..", "formats");
const validIssue = ajv.compile(JSON.parse(fs.readFileSync(path.join(formats, "issue.schema.json"), "utf8")));
const validQuestion = ajv.compile(JSON.parse(fs.readFileSync(path.join(formats, "question.schema.json"), "utf8")));
const invalid = (list, valid) => list.filter((x) => !valid(x)).map((x) => `${x.id}: ${ajv.errorsText(valid.errors)}`);

try {
  fs.rmSync(dir, { recursive: true, force: true });
  const first = await audit();

  // 1: the images of text.
  const photoOutcomes = outcomesOf(first, "/photos/", "image-of-text");
  check(!photoOutcomes.length, `1: a lazy photo and a photo under a banner of text are not images of text (${photoOutcomes.map((o) => `${o.item} ${JSON.stringify(o.facts?.colors)}`).join("; ") || "no candidate"})`);
  const textOutcomes = outcomesOf(first, "/text-images/", "image-of-text");
  const small = textOutcomes.find((o) => o.item === "image|small-text.png");
  check(!!small && small.facts.ink >= 0.01 && small.facts.colors[1].share < 0.02, `1: small letters on a large ground are an image of text, by their ink (${small ? `ink ${small.facts.ink}, second color ${small.facts.colors[1].share}` : "no candidate"})`);
  check(textOutcomes.some((o) => o.item === "image|other-text.png"), `1: an image of text from another site is read from its file (${textOutcomes.map((o) => o.item).join(", ") || "no candidate"})`);
  check(textOutcomes.some((o) => o.item === "image|clear-text.png"), `1: a transparent image of text is read over the color of its container (${textOutcomes.map((o) => o.item).join(", ") || "no candidate"})`);

  // 2: the lists.
  const list = questionsOn(first, "/article/", "list-without-list-code");
  const l = list[0];
  check(list.length === 1 && l.evidence.html.startsWith('<div class="wysiwyg">'), `2: the list gives one question, on the innermost container (${list.map((q) => q.evidence.html.slice(0, 30)).join("; ") || "none"})`);
  check(l?.evidence.facts.lines[0] === "The authors set out a five-point call to action:" && l.evidence.facts.lines.length === 6 && l.evidence.facts.lines[5] === "5. Do not pause the work on the climate." && l.evidence.facts.itemLines === 5 && /5 lines start with a number/.test(l.question),
    `2: the evidence gives the line before the list and the five items, not the first lines of the article (${l ? JSON.stringify(l.evidence.facts.lines) : "no question"})`);
  const shot = l?.evidence.image ? path.join(dir, l.evidence.image) : null;
  const shotHeight = shot && fs.existsSync(shot) ? heightOf(shot) : 0;
  check(shotHeight > 60 && shotHeight < 450, `2: the screenshot shows the lines of the list, not the top of the long container (${shot ? `${shotHeight} px high` : "no screenshot"})`);
  const stepList = questionsOn(first, "/steps/", "list-without-list-code");
  check(stepList.length === 1 && stepList[0].evidence.html.startsWith("<p>") && stepList[0].evidence.facts.lines[0] === "To apply:", `2: a list with line breaks in one paragraph gives the paragraph (${stepList.map((q) => q.evidence.html.slice(0, 30)).join("; ") || "none"})`);

  // 3: the labels.
  const fields = questionsOn(first, "/form/", "field-no-visible-label");
  const hidden = fields.find((q) => /id="q"/.test(q.evidence.html)), away = fields.find((q) => /id="mail"/.test(q.evidence.html));
  check(hidden?.evidence.facts.hiddenLabel === "Search the site" && /only a screen reader reads/.test(hidden.question) && hidden.question.includes('"Search the site"'),
    `3: a label that only a screen reader reads is not a visible label (${hidden ? `${hidden.evidence.facts.hiddenLabel}; ${hidden.question.slice(-80)}` : "no question"})`);
  check(away?.evidence.facts.hiddenLabel === "Email address", `3: a label off the screen is not a visible label (${away ? away.evidence.facts.hiddenLabel : "no question"})`);
  check(!fields.some((q) => /id="full"/.test(q.evidence.html)), `3: a field with a visible label gives no question (${fields.map((q) => q.evidence.html.slice(0, 40)).join("; ")})`);

  // 4: the player.
  const player = questionsOn(first, "/media/", "player-found")[0];
  check(!!player && /captions that a person wrote/.test(player.question) && /The title of the frame does not count/.test(player.question), `4: the player question names the alternatives, and says that the title of the frame does not count (${player ? player.question.slice(0, 90) : "no question"})`);

  // 5: the setup on the old pages.
  const button1 = first.issues.find((i) => i.rule.id === "button-name");
  const image1 = first.issues.find((i) => i.rule.id === "image-alt");
  const oldList1 = questionsOn(first, "/old/2.html", "list-without-list-code")[0];
  check(button1?.examples.every((e) => OLD.includes(e.url)) && image1?.examples.some((e) => e.url === "/old/1.html") && image1.examples.some((e) => e.url === "/keep/") && !!oldList1,
    `5: the setup has an issue on the old pages only, one on an old page and a page that stays, and a question on an old page (${button1?.id}, ${image1?.id} on ${image1?.examples.map((e) => e.url).join(" ")}, ${oldList1?.id})`);
  check(!invalid(first.issues, validIssue).length && !invalid(first.questions, validQuestion).length, `the files of the first audit follow the formats (${[...invalid(first.issues, validIssue), ...invalid(first.questions, validQuestion)].slice(0, 3).join("; ") || "all valid"})`);

  // The second audit: the settings skip the old pages, and the site does not link them any more. The pages still answer.
  phase = 2;
  config.crawl.skip = [...config.crawl.skip, "/old/**"];
  config.crawl.sample_pages = PAGES.map((u) => SITE + u);
  const second = await audit();
  const oldRequests = requests.filter((r) => r.phase === 2 && r.path.startsWith("/old/"));
  check(!oldRequests.length, `5: the audit sends no request to the pages that the settings skip now (${oldRequests.map((r) => r.path).join(", ") || "none"})`);
  const button2 = second.issues.find((i) => i.id === button1?.id);
  check(button2?.status === "page removed" && button2.status_by?.reason === "out of scope", `5: an issue on skipped pages only is "page removed", with the reason "out of scope" (${button2 ? `${button2.status} ${button2.status_by?.reason || ""}` : "gone"})`);
  const image2 = second.issues.find((i) => i.id === image1?.id);
  check(image2?.status === "open" && image2.examples.every((e) => e.url === "/keep/"), `5: an issue that is also on a page that stays is still open there (${image2 ? `${image2.status} on ${image2.examples.map((e) => e.url).join(" ")}` : "gone"})`);
  check(!second.questions.some((q) => q.id === oldList1?.id), `5: a question on a skipped page goes (${second.questions.some((q) => q.id === oldList1?.id) ? "it stays" : "gone"})`);
  check(/2 pages of earlier results are out of scope now/.test(second.report) && /1 of their issues are "page removed" with the reason "out of scope", and 1 of their questions went/.test(second.report),
    `5: the report says which results ended with the scope (${(second.report.match(/[^\n]*out of scope now[^\n]*/) || ["no line"])[0].slice(0, 160)})`);
  check(!invalid(second.issues, validIssue).length, `the issue files with the reason "out of scope" follow the format (${invalid(second.issues, validIssue).slice(0, 3).join("; ") || "all valid"})`);

  // The refresh keeps the end of the old results, and the line of the report.
  refresh(config, dir);
  const button3 = readDir("issues").find((i) => i.id === button1?.id);
  const report3 = fs.readFileSync(path.join(dir, "report.md"), "utf8");
  check(button3?.status === "page removed" && button3.status_by?.reason === "out of scope" && /out of scope now/.test(report3), `5: the refresh keeps the status and the line of the report (${button3 ? `${button3.status} ${button3.status_by?.reason}` : "gone"})`);
} catch (e) {
  console.error(e);
  failures.push(String(e));
} finally {
  server.close(); other.close();
}
console.error(failures.length ? `\n${failures.length} check(s) failed` : "\nall checks passed");
process.exit(failures.length ? 1 : 0);
