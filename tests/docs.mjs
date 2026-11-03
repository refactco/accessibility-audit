// The install notes. Item 22 of the list of problems of 1.1.1: the name a11y is also an unrelated package on the npm registry,
// so no document may tell a person or an agent to run `npx a11y`. The command is `refact-a11y` since 1.2.0, and `npx` with that
// name is not safe either: it falls back to the registry when the project has no copy. Item 23: the notes for npm 12, which installs no git dependency
// by default and blocks the build scripts of dependencies. Item 12 of the list of problems of 1.2.0: the upgrade to a new tag under npm 12.
//
// Usage: node tests/docs.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const check = (ok, message) => { console.error(`${ok ? "ok  " : "FAIL"} ${message}`); if (!ok) failures.push(message); };
const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : e.name.endsWith(".md") ? [path.join(dir, e.name)] : []));
const docs = [path.join(root, "README.md"), ...files(path.join(root, "plugin"))];
// A line that warns against the command may name it.
const advice = docs.flatMap((f) => fs.readFileSync(f, "utf8").split("\n").map((line, i) => ({ f, i, line }))).filter((l) => /npx (--no )?(refact-)?a11y/.test(l.line) && !/\bnever\b|\bNever\b|so even|do not use `npx`/.test(l.line));
check(advice.length === 0, `item 22: no document tells to run npx a11y or npx refact-a11y (${advice.map((l) => path.relative(root, l.f) + ":" + (l.i + 1)).join(", ") || "none"})`);
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
check(readme.includes("./node_modules/.bin/refact-a11y") && readme.includes("pnpm exec refact-a11y"), "item 22: the README gives the safe forms of the new command name");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
check(pkg.bin["refact-a11y"] === "./dist/cli.js" && pkg.bin.a11y === "./dist/cli.js", "item 22: the package installs the command as refact-a11y, and as a11y for the projects that call the old name");
check(readme.includes("allow-git=root") && readme.includes("npm install-scripts approve @refact/a11y --no-allow-scripts-pin"), "item 23: the README gives the npm 12 steps");
// Item 12 of the list of problems of 1.2.0: under npm 12, an install of a new tag over an old one stops with EALLOWGIT. The package goes first.
const upgrade = readme.indexOf("npm uninstall @refact/a11y");
check(readme.includes("EALLOWGIT") && upgrade > 0 && readme.indexOf("npm install -D github:refactco/accessibility-audit#v", upgrade) > upgrade, "item 12 of 1.2.0: the README gives the upgrade steps for npm 12: remove the package, then install the new tag");
const skill = fs.readFileSync(path.join(root, "plugin", "skills", "a11y", "SKILL.md"), "utf8");
check(/Never run `npx a11y` or `npx refact-a11y`/.test(skill) && /The command is `refact-a11y`/.test(skill), "item 22: the skill names the new command and tells the agent never to run it with npx");

if (failures.length) { console.error(`\n${failures.length} checks failed`); process.exit(1); }
console.error("\nall checks passed");
