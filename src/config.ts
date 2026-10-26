// Loads the settings of an audit and validates them against formats/config.schema.json.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// ajv and ajv-formats are CommonJS modules: Node gives their module.exports, which carries the class and the function, and a default property.
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
const addFormats = ((addFormatsModule as unknown as { default?: unknown }).default ?? addFormatsModule) as (ajv: Ajv2020) => Ajv2020;

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export interface Config {
  schema: "config/1";
  site: { url: string; environment: "production" | "staging" | "local"; standard: "WCAG 2.2"; level: "AA"; languages?: string[]; sets?: { name: string; patterns: string[] }[]; cms?: Record<string, unknown> };
  crawl: {
    widths: number[]; max_pages: number; skip: string[]; address_groups: { pattern: string; limit: number }[];
    parameters: { keep: string[] }; rate_limit: number; permitted_domains: string[]; obey_robots: boolean;
    cookie_banner?: { selector?: string; dismiss_selector?: string };
    templates: { name: string; pattern: string; example_page?: string }[]; sample_pages: string[]; random_sample_share: number;
  };
  interaction: { deny_list: string[]; tests_that_send_data: boolean; dry_submit: boolean; max_states_per_page: number; processes: { name: string; environment: string; account?: string; steps: { page: string; action: string }[] }[] };
  login: { method: "none" | "form" | "storage_state"; login_url?: string; roles?: { name: string; secret_name: string }[] };
  budgets: { concurrency: number; time_budget_minutes: number; max_pages: number; max_questions_per_audit: number; max_issues_for_skill: number; sample_share: number };
  baseline: { assistive_technologies?: string[] };
  schedule: { interval: string };
}

const DEFAULT_DENY = ["delete", "remove", "pay", "buy", "order", "send", "submit", "subscribe", "unsubscribe", "log out", "sign out", "cancel"];

/** A minimal settings object for a bare address, with the defaults of the plan. */
export function configForUrl(url: string, environment: Config["site"]["environment"] = "production"): Config {
  const host = new URL(url).hostname;
  return {
    schema: "config/1",
    site: { url: url.replace(/\/$/, ""), environment, standard: "WCAG 2.2", level: "AA", languages: [], sets: [{ name: "site", patterns: ["/**"] }] },
    crawl: { widths: [390, 768, 1280], max_pages: 500, skip: [], address_groups: [], parameters: { keep: [] }, rate_limit: 2, permitted_domains: [host], obey_robots: true, templates: [], sample_pages: [], random_sample_share: 0.1 },
    interaction: { deny_list: DEFAULT_DENY, tests_that_send_data: environment !== "production", dry_submit: true, max_states_per_page: 10, processes: [] },
    login: { method: "none" },
    budgets: { concurrency: 4, time_budget_minutes: 240, max_pages: 500, max_questions_per_audit: 500, max_issues_for_skill: 200, sample_share: 0.1 },
    baseline: { assistive_technologies: [] },
    schedule: { interval: "weekly" },
  };
}

export function loadConfig(pathOrUrl: string): Config {
  if (/^https?:\/\//.test(pathOrUrl)) return configForUrl(pathOrUrl);
  const raw = JSON.parse(readFileSync(pathOrUrl, "utf8"));
  const errors = validateConfig(raw);
  if (errors.length) throw new Error("The settings file is not valid:\n" + errors.join("\n"));
  const defaults = configForUrl(raw.site.url, raw.site.environment);
  return {
    ...defaults, ...raw,
    site: { ...defaults.site, ...raw.site },
    crawl: { ...defaults.crawl, ...raw.crawl },
    interaction: { ...defaults.interaction, ...raw.interaction },
    login: { ...defaults.login, ...raw.login },
    budgets: { ...defaults.budgets, ...raw.budgets },
    baseline: { ...defaults.baseline, ...raw.baseline },
    schedule: { ...defaults.schedule, ...raw.schedule },
  };
}

let validator: ((data: unknown) => boolean) & { errors?: { instancePath: string; message?: string }[] | null } | null = null;

export function validateConfig(data: unknown): string[] {
  if (!validator) {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    validator = ajv.compile(JSON.parse(readFileSync(join(ROOT, "formats", "config.schema.json"), "utf8")));
  }
  if (validator(data)) return [];
  return (validator.errors || []).map((e) => `${e.instancePath || "/"} ${e.message}`);
}
