// Loads criteria/criteria.json and gives the maps that the engine needs.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./config.ts";
import type { Criterion } from "./types.ts";

const file = JSON.parse(readFileSync(join(ROOT, "criteria", "criteria.json"), "utf8"));

export const CRITERIA: Criterion[] = file.criteria;
export const CRITERIA_BY_ID = new Map<string, Criterion>(CRITERIA.map((c) => [c.id, c]));
export const AXE_VERSION_IN_CRITERIA: string = file.sources.axe_core.version;

/** axe-core rule id to the criteria of WCAG 2.2 A and AA that it maps to. */
export const AXE_RULE_CRITERIA = new Map<string, string[]>();
for (const c of CRITERIA) {
  for (const r of c.axe_rules) {
    if (r.category !== "wcag") continue;
    const list = AXE_RULE_CRITERIA.get(r.id) || [];
    list.push(c.id);
    AXE_RULE_CRITERIA.set(r.id, list);
  }
}

/** The criteria that axe-core tests, so that a page with no axe finding counts as tested for them. */
export const AXE_TESTED_CRITERIA = new Set<string>([...AXE_RULE_CRITERIA.values()].flat());

/** Who decides a review of an auto+review criterion: the AI or a person. */
/** Who decides a question. Since 2026-10-14 the AI decides every question, with the facts of the engine, and the verifier checks it.
 *  A person can still answer, and a person's answer wins. The criteria with the method "person" keep that method in the criteria file. */
export function deciderOf(_criterion: string): "ai" | "person" {
  return "ai";
}

/** The definition of "all units" for a criterion: its first test group. */
export function unitDefinition(criterion: string): "page" | "template" | "site" | "process" {
  const c = CRITERIA_BY_ID.get(criterion);
  const g = c?.test_groups[0];
  return g === "template" || g === "site" || g === "process" ? g : "page";
}
