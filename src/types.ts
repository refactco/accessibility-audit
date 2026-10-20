// Shared types of the engine. Node 24 strips the types at run time, so only erasable syntax is used.

export type Severity = "critical" | "serious" | "moderate" | "minor";
export type Method = "auto" | "auto+review" | "person";
export type UnitResult =
  | "failed" | "needs review" | "needs a person" | "no issue found"
  | "no content found" | "not tested" | "passed" | "not applicable";

export const RESULT_ORDER: UnitResult[] = [
  "failed", "needs review", "needs a person", "no issue found", "no content found", "not tested", "passed", "not applicable",
];

export interface Criterion {
  id: string;
  name: string;
  level: "A" | "AA";
  principle: string;
  since: string;
  method: Method;
  test_groups: string[];
  automatic_test: string | null;
  review_or_person_check: string | null;
  conditions: string | null;
  non_interference: boolean;
  finder_reliable: boolean;
  context_dependent: boolean;
  person_task: string | null;
  affects: string[];
  notes: string;
  axe_rules: { id: string; category: string; issue_type: string; impact?: string; description?: string }[];
  act_rules: { id: string; approved: boolean }[];
}

/** One outcome of one test for one element on one unit, as the ACT Rules Format does. */
export interface Outcome {
  criterion: string;
  rule: string;
  engine: "axe-core" | "a11y";
  engineVersion: string;
  /** failed: an occurrence. cantTell: a review question. candidate: content for a person check. passed: the rule found nothing. */
  kind: "failed" | "cantTell" | "candidate" | "passed";
  /** Who decides a cantTell or a candidate. */
  decider?: "ai" | "person";
  url: string;
  width: number;
  state: string[];
  selector: string;
  html?: string;
  facts?: Record<string, unknown>;
  /** The item identity without the position: a content id, a normalized selector, or a hash. */
  item: string;
  summary: string;
  severity: Severity;
  question?: string;
  steps?: string[];
  solution: { summary: string; steps: string[]; example?: string };
  context?: string;
  /** The answer of the review question of this outcome, when one exists: it comes from the stored question files. */
  answer?: "issue" | "no issue" | "not applicable";
  answeredBy?: "ai" | "person";
  questionId?: string;
}

export interface PageRecord {
  url: string;
  template: string | null;
  set: string;
  sample: boolean;
  /** Why the page is in the sample: settings, template example, process, common page, template, technology, or random. */
  sampleReason?: string;
  /** The process that this page is a step of. */
  process?: string | null;
  /** The states that the engine tested on this page, with their actions from the first load. */
  states: { id: string; actions: string[] }[];
  tested: boolean;
  not_tested_reason?: "did not load" | "page limit" | "time budget" | "removed" | "skipped" | "permission";
  http_status?: number;
  content_hash?: string;
  title?: string;
  lang?: string | null;
  /** The tests that ran on this page, by criterion, at each width. */
  testedCriteria: Record<number, Set<string>>;
  outcomes: Outcome[];
  links: string[];
  renders: number;
  facts: Record<string, unknown>;
}

export interface CrawlResult {
  pages: PageRecord[];
  skipped: { url: string; reason: string }[];
  sitemapUrls: string[];
  budgetReached: ("pages" | "time" | "states" | "questions" | "issues")[];
}
