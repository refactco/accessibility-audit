// Runs axe-core in the page and turns its results into outcomes.
import { createRequire } from "node:module";
import type { Page } from "playwright";
import { AXE_RULE_CRITERIA } from "./criteria.ts";
import type { Outcome, Severity } from "./types.ts";

const require = createRequire(import.meta.url);
export const AXE_PATH: string = require.resolve("axe-core/axe.min.js");
export const AXE_VERSION: string = require("axe-core/package.json").version;

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

interface AxeCheck { message: string; data?: Record<string, any> }
interface AxeNode { target: string[]; html: string; failureSummary?: string; any: AxeCheck[]; all: AxeCheck[]; none: AxeCheck[] }
interface AxeResult { id: string; impact: Severity | null; help: string; helpUrl: string; description: string; nodes: AxeNode[] }

export async function runAxe(page: Page, url: string, width: number, state: string[]): Promise<Outcome[]> {
  await page.addScriptTag({ path: AXE_PATH });
  const result = await page.evaluate(async (tags) => {
    const axe = (window as unknown as { axe: { run: (c: Document, o: unknown) => Promise<{ violations: unknown[]; incomplete: unknown[] }> } }).axe;
    return await axe.run(document, {
      runOnly: { type: "tag", values: tags },
      rules: { "target-size": { enabled: true } },
      resultTypes: ["violations", "incomplete"],
      elementRef: false,
    });
  }, TAGS) as { violations: AxeResult[]; incomplete: AxeResult[] };
  const outcomes: Outcome[] = [];
  const convert = (list: AxeResult[], kind: "failed" | "cantTell") => {
    for (const r of list) {
      const criteria = AXE_RULE_CRITERIA.get(r.id);
      if (!criteria || !criteria.length) continue;
      for (const node of r.nodes) {
        const selector = node.target.join(" ");
        const messages = [...node.any, ...node.all, ...node.none].map((m) => m.message).filter(Boolean);
        for (const criterion of criteria) {
          outcomes.push({
            criterion, rule: r.id, engine: "axe-core", engineVersion: AXE_VERSION, kind,
            decider: kind === "cantTell" ? "ai" : undefined,
            url, width, state, selector, html: node.html.slice(0, 400),
            facts: { messages: messages.slice(0, 4), ...(r.id === "color-contrast" && node.any[0]?.data ? { colors: { fg: node.any[0].data.fgColor, bg: node.any[0].data.bgColor, ratio: node.any[0].data.contrastRatio, expected: node.any[0].data.expectedContrastRatio } } : {}) },
            item: itemFromHtml(node.html, selector),
            summary: r.help,
            severity: r.impact || "moderate",
            question: kind === "cantTell" ? `${r.help}. axe-core could not decide: ${messages[0] || r.description}` : undefined,
            solution: { summary: r.help + ".", steps: [r.description, "See " + r.helpUrl] },
          });
        }
      }
    }
  };
  convert(result.violations, "failed");
  convert(result.incomplete, "cantTell");
  return outcomes;
}

/** The identity of an element without its position: the tag, the id, the classes, and a key attribute or the text. */
export function itemFromHtml(html: string, selector: string): string {
  const tag = (html.match(/^<([a-z0-9-]+)/i) || [, "el"])[1].toLowerCase();
  const id = (html.match(/\sid="([^"]*)"/) || [])[1];
  const cls = (html.match(/\sclass="([^"]*)"/) || [, ""])[1].split(/\s+/).filter(Boolean).slice(0, 3).join(".");
  const key = (html.match(/\s(?:src|href|name|aria-label)="([^"]*)"/) || [, ""])[1].split("/").pop() || "";
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
  if (!id && !cls && !key && !text) return selector.replace(/:nth-child\(\d+\)/g, "");
  return `${tag}${id ? "#" + id : ""}${cls ? "." + cls : ""}|${key}|${text}`;
}
