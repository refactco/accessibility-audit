// The fix groups: the open issues that one change fixes. Issues of the same rule whose first source is the same line of the same file,
// with an origin in the code or the design, need one change at that line. For example, one rule of a style sheet can make the
// content of many pages too wide, and each page gives its own issue. The issues stay separate, because each has its own pages and
// its own example. The handoff, the review page, and the client report show the group. Since 1.3.9.
import { createHash } from "node:crypto";

/** The origins whose fix is a change in the files of the site. A content issue needs a change of each content item, and a media
 *  issue a change of each media file, so they do not group. */
const CODE_ORIGINS = new Set(["code", "design", "configuration", "third-party-controlled"]);
const OPEN = new Set(["new", "open", "reopened"]);

export interface FixGroup {
  id: string;
  rule: string;
  origin: string;
  file: string;
  line: number;
  issues: string[];
  /** The pages that the issues of the group reach: the largest reach of one issue, or more when the examples show more pages. */
  pages: number;
  /** True when the examples of each issue list all its pages, so that pages is the exact count. */
  pages_exact: boolean;
}

/** The place of the fix of an issue: its rule, and the file and the line of its first source that is certain or probable. */
function placeOf(i: Record<string, any>): string | null {
  if (!CODE_ORIGINS.has(i.origin)) return null;
  const s = (i.source || []).find((x: Record<string, any>) => x.file && x.line && (x.confidence === "certain" || x.confidence === "probable"));
  return s ? `${i.rule?.id}|${s.file}|${s.line}` : null;
}

/** The groups of two issues or more, with the most issues first, and the group of each issue. */
export function fixGroups(issues: Record<string, any>[]): { groups: FixGroup[]; byIssue: Map<string, FixGroup> } {
  const places = new Map<string, Record<string, any>[]>();
  for (const i of issues) {
    if (!OPEN.has(i.status)) continue;
    const place = placeOf(i);
    if (place) places.set(place, [...(places.get(place) || []), i]);
  }
  const groups: FixGroup[] = [];
  for (const [place, list] of places) {
    if (list.length < 2) continue;
    const [rule, file, line] = place.split("|");
    const pageSet = new Set(list.flatMap((i) => (i.examples || []).map((e: { url: string }) => e.url)));
    const largest = Math.max(...list.map((i) => i.reach?.pages || 0));
    const exact = list.every((i) => new Set((i.examples || []).map((e: { url: string }) => e.url)).size >= (i.reach?.pages || 0));
    groups.push({
      id: "FIX-" + createHash("sha1").update(place).digest("hex").slice(0, 8),
      rule, origin: list[0].origin, file, line: Number(line),
      issues: list.map((i) => i.id).sort(),
      pages: Math.max(largest, pageSet.size), pages_exact: exact,
    });
  }
  groups.sort((a, b) => b.issues.length - a.issues.length || b.pages - a.pages || a.id.localeCompare(b.id));
  const byIssue = new Map<string, FixGroup>();
  for (const g of groups) for (const id of g.issues) byIssue.set(id, g);
  return { groups, byIssue };
}

/** The name of the file of a group, for a person: the last part of its path. */
export function fileName(path: string): string {
  return String(path || "").split("/").pop() || path;
}
