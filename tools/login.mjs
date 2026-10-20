// Signs in one time as a login role, with a person, and saves the storage state file that the audits use.
//
// Usage: node tools/login.mjs <config.json> <role name> [--email <address>] [--code-file <path>] [--out <file>]
//
// It opens a visible browser window on the login page of the settings and fills the email. The site sends a code
// to that address. The person types the code in the window, or writes it into the code file, and the script types it.
// When the site shows the signed-in state, the script saves the storage state to <file>, by default ~/.a11y/<host>-<role>.json,
// and prints the line that sets the environment variable of the role. The file is a secret: it never goes into a repository.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { loadConfig } from "../src/config.ts";

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : null; };
const config = loadConfig(args[0]);
const roleName = args[1];
const role = (config.login.roles || []).find((r) => r.name === roleName);
if (!role) { console.error(`The settings have no login role named "${roleName}".`); process.exit(2); }
const host = new URL(config.site.url).hostname.replace(/^www\./, "");
const out = path.resolve(flag("out") || path.join(os.homedir(), ".a11y", `${host}-${roleName}.json`));
const codeFile = path.resolve(flag("code-file") || path.join(os.tmpdir(), `a11y-code-${host}.txt`));
const email = flag("email");
const loginUrl = new URL(config.login.login_url || "/", config.site.url + "/").toString();
const say = (line) => console.error(new Date().toISOString().slice(11, 19) + " " + line);

fs.rmSync(codeFile, { force: true });
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
const page = await context.newPage();
say(`opening ${loginUrl}`);
await page.goto(loginUrl, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(1500);
if (email) {
  const field = page.locator("input[type=email]").first();
  await field.waitFor({ state: "visible", timeout: 20000 });
  await field.fill(email);
  say(`email filled: ${email}. Clicking the button that sends the code.`);
  const button = page.locator("form:has(input[type=email]) button[type=submit], form:has(input[type=email]) button").first();
  await button.click({ timeout: 5000 }).catch(() => say("could not click the send button: click it in the window"));
}
say(`waiting for the sign-in. Type the code in the window, or write it to ${codeFile}`);

const signedIn = async () => page.evaluate(() => {
  if (window.creAccounts && window.creAccounts.nonce) return true;
  const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
  const success = document.querySelector("[data-cre-code-success]");
  return vis(success);
}).catch(() => false);

let typed = false;
const started = Date.now();
while (Date.now() - started < 15 * 60 * 1000) {
  if (await signedIn()) break;
  if (!typed && fs.existsSync(codeFile)) {
    const code = fs.readFileSync(codeFile, "utf8").replace(/\D/g, "");
    if (code.length >= 4) {
      typed = true;
      const box = page.locator("[data-cre-code] input, input[maxlength='1'], input[autocomplete='one-time-code']").first();
      await box.waitFor({ state: "visible", timeout: 20000 }).catch(() => say("no code box is visible yet"));
      await box.click().catch(() => {});
      await page.keyboard.type(code, { delay: 80 });
      say(`code typed (${code.length} digits)`);
      await page.waitForTimeout(800);
      const verify = page.locator("[data-cre-verify]").first();
      if (await verify.count()) await verify.click({ timeout: 3000 }).catch(() => {});
      else await page.keyboard.press("Enter");
    }
  }
  const error = await page.evaluate(() => { const el = document.querySelector("[data-cre-code-error], [data-cre-error], [data-cre-expired-error]"); const r = el && el.getBoundingClientRect(); return el && r && r.width > 0 && el.textContent.trim() ? el.textContent.trim().slice(0, 160) : ""; }).catch(() => "");
  if (error) say(`the page says: ${error}`);
  await page.waitForTimeout(2000);
}
if (!(await signedIn())) { say("not signed in after 15 minutes. Nothing saved."); await browser.close(); process.exit(1); }
await page.waitForTimeout(2000);
fs.mkdirSync(path.dirname(out), { recursive: true, mode: 0o700 });
await context.storageState({ path: out });
fs.chmodSync(out, 0o600);
fs.rmSync(codeFile, { force: true });
say(`signed in. The storage state is saved to ${out}`);
console.log(`export ${role.secret_name}=${out}`);
await browser.close();
