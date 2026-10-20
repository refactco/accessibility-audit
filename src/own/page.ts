// Own page tests that read the page at rest: language, media, moving content, bypass blocks, target size,
// contrast of placeholders and borders, orientation lock, and the content checks that make review questions.
import type { Page } from "playwright";
import { HELPERS } from "../browser.ts";
import { deciderOf } from "../criteria.ts";
import type { Outcome, Severity } from "../types.ts";

export const ENGINE_VERSION = "0.1.0";

export interface Found {
  criterion: string; rule: string; kind: Outcome["kind"]; selector: string; html?: string; item: string;
  facts?: Record<string, unknown>; summary: string; severity?: Severity; question?: string; steps?: string[];
  solution: { summary: string; steps: string[] }; context?: string;
}

export function toOutcome(f: Found, url: string, width: number, state: string[]): Outcome {
  return {
    ...f, engine: "a11y", engineVersion: ENGINE_VERSION, url, width, state,
    severity: f.severity || "serious",
    decider: f.kind === "cantTell" || f.kind === "candidate" ? deciderOf(f.criterion) : undefined,
  };
}

/** The criteria that this file tests on each page. A page with no finding counts as tested for them. */
export const PAGE_TEST_CRITERIA = ["1.1.1", "1.2.1", "1.2.2", "1.2.3", "1.2.5", "1.3.1", "1.3.2", "1.3.3", "1.3.4", "1.3.5", "1.4.2", "1.4.3", "1.4.11", "2.2.1", "2.2.2", "2.3.1", "2.4.1", "2.4.3", "2.4.4", "2.4.6", "2.5.8", "3.1.1", "3.1.2", "3.3.2", "3.3.4", "3.3.8"];

const STOPWORDS: Record<string, string[]> = {
  en: ["the", "and", "of", "to", "in", "is", "for", "with", "on", "that", "this", "are", "you", "your", "from", "at", "by", "it", "or", "as", "a", "an", "not", "we", "our", "do", "be", "can", "have", "has", "will", "they", "their", "if", "but", "about", "all", "more", "no", "into", "than", "when", "how", "what", "which", "who", "also", "so", "was", "were"],
  fr: ["le", "la", "les", "de", "des", "et", "un", "une", "est", "pour", "dans", "que", "qui", "pas", "sur", "vous", "nous", "au", "aux", "du"],
  de: ["der", "die", "das", "und", "ist", "nicht", "mit", "für", "auf", "ein", "eine", "sie", "wir", "von", "zu", "den", "dem", "des", "im", "auch"],
  es: ["el", "la", "los", "las", "de", "y", "que", "en", "un", "una", "es", "por", "para", "con", "del", "se", "su", "al", "lo", "como"],
  it: ["il", "la", "di", "e", "che", "un", "una", "per", "non", "con", "del", "della", "gli", "le", "sono", "in", "da", "al", "come", "più"],
  nl: ["de", "het", "een", "en", "van", "is", "op", "dat", "die", "voor", "met", "zijn", "niet", "aan", "ook", "je", "er", "bij", "om", "naar"],
  pt: ["o", "a", "os", "as", "de", "e", "que", "do", "da", "em", "um", "uma", "para", "com", "não", "por", "mais", "dos", "das", "se"],
};

export function detectLanguage(text: string): { lang: string | null; words: number; score: number } {
  const words = text.toLowerCase().split(/[^\p{L}']+/u).filter(Boolean);
  if (words.length < 8) return { lang: null, words: words.length, score: 0 };
  const counts: Record<string, number> = {};
  for (const [lang, list] of Object.entries(STOPWORDS)) {
    const set = new Set(list);
    counts[lang] = words.filter((w) => set.has(w)).length;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [best, n] = sorted[0];
  const second = sorted[1][1];
  // The best language needs three hits, a share of the words, and twice the hits of the second language.
  if (n < 3 || n / words.length < 0.04 || n < second * 2) return { lang: null, words: words.length, score: n / words.length };
  return { lang: best, words: words.length, score: n / words.length };
}

/** Facts from the page that the tests of this file need. */
const COLLECT = `(() => {
  ${HELPERS}
  const out = { media: [], blocks: [], images: [], tables: [], fakeLists: [], order: [], sensory: [], fields: [], links: [], headings: [], targets: [], placeholders: [], borders: [], orientation: false, animations: [], skipLink: false, landmarks: 0, tabindexPositive: [], payment: [], login: [], captcha: false, timers: [], text: "" };
  out.text = (document.body ? document.body.innerText : "").replace(/\\s+/g, " ").trim().slice(0, 20000);
  for (const m of document.querySelectorAll("audio, video, iframe, object, embed")) {
    const isPlayer = m.localName === "audio" || m.localName === "video" || /youtube|vimeo|player|spotify|soundcloud|wistia/i.test(m.getAttribute("src") || "");
    if (!isPlayer) continue;
    // The facts that decide the media alternatives: the caption and description tracks, and a transcript link near the media.
    const trackList = m.textTracks ? Array.from(m.textTracks) : [];
    const box = m.closest("figure, section, article") || m.parentElement || m;
    const near = Array.from(box.querySelectorAll("a[href]")).filter((a) => /transcript|caption|subtitle|audio description|text version|read the/i.test((a.textContent || "") + " " + (a.getAttribute("href") || ""))).map((a) => ({ text: (a.textContent || "").trim().slice(0, 80), href: a.getAttribute("href") })).slice(0, 3);
    out.media.push({ selector: sel(m), html: html(m), item: item(m), tag: m.localName, src: (m.getAttribute("src") || (m.querySelector("source") || {}).getAttribute?.("src") || "").slice(0, 120), autoplay: m.hasAttribute("autoplay") || (m.autoplay === true), controls: m.hasAttribute("controls"), muted: m.muted === true || m.hasAttribute("muted"), duration: isFinite(m.duration) ? m.duration : null, paused: m.paused, tracks: trackList.length, captionTracks: trackList.filter((t) => t.kind === "captions" || t.kind === "subtitles").length, descriptionTracks: trackList.filter((t) => t.kind === "descriptions").length, hasAudioTrack: m.localName === "video" ? (m.mozHasAudio || !!(m.webkitAudioDecodedByteCount) || (m.audioTracks ? m.audioTracks.length > 0 : null)) : true, nearbyLinks: near, title: m.getAttribute("title") || "" });
  }
  const pageLang = (document.documentElement.getAttribute("lang") || "").toLowerCase().split("-")[0];
  for (const b of document.querySelectorAll("p, li, blockquote, h1, h2, h3, h4, td, dd, figcaption")) {
    if (!visible(b)) continue;
    const t = (b.innerText || "").replace(/\\s+/g, " ").trim();
    if (t.split(" ").length < 8) continue;
    const own = b.closest("[lang]");
    out.blocks.push({ selector: sel(b), item: item(b), text: t.slice(0, 400), lang: own ? (own.getAttribute("lang") || "").toLowerCase().split("-")[0] : pageLang, hasOwnLang: own !== null && own !== document.documentElement });
  }
  for (const img of document.querySelectorAll("img")) {
    if (!visible(img)) continue;
    const alt = img.getAttribute("alt");
    const fig = img.closest("figure");
    out.images.push({ selector: sel(img), html: html(img), item: item(img), alt, src: (img.currentSrc || img.src || "").split("/").pop(), caption: fig && fig.querySelector("figcaption") ? fig.querySelector("figcaption").textContent.trim().slice(0, 200) : null, context: (img.closest("p, figure, li, a, section, main, body") || document.body).innerText.replace(/\\s+/g, " ").trim().slice(0, 300) });
  }
  for (const t of document.querySelectorAll("table")) {
    if (!visible(t) || t.getAttribute("role") === "presentation") continue;
    const rows = t.rows.length, cols = t.rows[0] ? t.rows[0].cells.length : 0;
    if (rows >= 2 && cols >= 2 && !t.querySelector("th")) out.tables.push({ selector: sel(t), html: html(t), item: item(t), rows, cols });
  }
  for (const p of document.querySelectorAll("p, div")) {
    if (!visible(p) || p.children.length === 0) continue;
    const lines = (p.innerText || "").split(/\\n+/).map((l) => l.trim()).filter(Boolean);
    if (lines.length >= 3 && lines.filter((l) => /^(\\d+[.)]|[-*•])\\s/.test(l)).length >= 3 && !p.querySelector("ol, ul")) out.fakeLists.push({ selector: sel(p), html: html(p), item: item(p), lines: lines.slice(0, 5) });
  }
  for (const c of document.querySelectorAll("ol, ul, nav, section, main, div")) {
    if (!visible(c) || c.children.length < 2) continue;
    const cs = getComputedStyle(c);
    const reversed = cs.flexDirection === "column-reverse" || cs.flexDirection === "row-reverse";
    const ordered = Array.from(c.children).some((k) => getComputedStyle(k).order !== "0");
    if (reversed || ordered) out.order.push({ selector: sel(c), html: html(c), item: item(c), flexDirection: cs.flexDirection, ordered });
  }
  const sensory = /\\b(click|press|select|use|tap)\\b[^.]{0,40}\\b(round|square|circular|green|red|blue|yellow|orange|big|large|small)\\b[^.]{0,40}\\b(button|icon|link|arrow|box|menu|tab)\\b|\\b(button|icon|link|arrow|box|menu|tab)\\b[^.]{0,30}\\b(on the (right|left)|at the (top|bottom)|below|above)\\b/i;
  for (const b of document.querySelectorAll("p, li, label, legend, span, div")) {
    if (!visible(b) || b.children.length > 3) continue;
    const t = (b.innerText || "").replace(/\\s+/g, " ").trim();
    if (t.length < 15 || t.length > 400) continue;
    const m = t.match(sensory);
    if (m) out.sensory.push({ selector: sel(b), html: html(b), item: item(b), text: t.slice(0, 300), match: m[0] });
  }
  const personal = /name|email|e-mail|phone|tel|address|street|postal|zip|city|country|birthday|card|cc-/i;
  for (const f of document.querySelectorAll("input, select, textarea")) {
    if (!visible(f) || ["hidden", "submit", "button", "checkbox", "radio", "search", "file", "image", "reset"].includes(f.type)) continue;
    const labelled = (f.labels && f.labels.length > 0 && Array.from(f.labels).some(visible)) || (f.getAttribute("aria-labelledby") || "").split(/\\s+/).some((i) => i && visible(document.getElementById(i)));
    out.fields.push({ selector: sel(f), html: html(f), item: item(f), type: f.type, name: f.name || "", id: f.id || "", autocomplete: f.getAttribute("autocomplete"), placeholder: f.getAttribute("placeholder"), ariaLabel: f.getAttribute("aria-label"), visibleLabel: labelled, personal: personal.test((f.name || "") + " " + (f.id || "") + " " + nameOf(f) + " " + (f.type || "")), onpaste: f.hasAttribute("onpaste"), form: f.form ? sel(f.form) : null });
  }
  const generic = /^(read more|more|click here|here|learn more|link|details|continue|go)\\s*[.›>→]*$/i;
  for (const a of document.querySelectorAll("a[href]")) {
    if (!visible(a)) continue;
    const name = nameOf(a);
    if (generic.test(name)) { const box = a.closest("li, p, td, article, div") || a; out.links.push({ selector: sel(a), html: html(a), item: item(a), name, href: a.getAttribute("href"), context: box.innerText.replace(/\\s+/g, " ").trim().slice(0, 200), containerKind: box.localName + (typeof box.className === "string" && box.className.trim() ? "." + box.className.trim().split(/\\s+/).slice(0, 2).join(".") : "") }); }
  }
  for (const h of document.querySelectorAll("h1, h2, h3, h4, h5, h6, [role=heading]")) {
    if (!visible(h)) continue;
    const t = (h.innerText || "").replace(/\\s+/g, " ").trim();
    if (/^(section|part|chapter|heading|title|untitled|lorem ipsum)\\s*\\d*$/i.test(t) || /^lorem ipsum/i.test(t)) out.headings.push({ selector: sel(h), html: html(h), item: item(h), text: t });
  }
  const interactive = Array.from(document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=checkbox], [role=radio], [role=switch], [role=tab], [role=menuitem], [tabindex]:not([tabindex="-1"])')).filter(visible);
  const rects = interactive.map((el) => ({ el, r: el.getBoundingClientRect() }));
  for (const { el, r } of rects) {
    if (r.width >= 24 && r.height >= 24) continue;
    if (window.__a11ySkipTargets && window.__a11ySkipTargets.has(el)) continue;
    const cs = getComputedStyle(el);
    // The inline exception: a target whose height the line height of text constrains.
    const lineHeight = parseFloat(getComputedStyle(el.parentElement || el).lineHeight) || 0;
    const inline = cs.display === "inline" && (r.height <= lineHeight + 1 || ((el.parentElement.innerText || "").trim().length > nameOf(el).length + 20));
    if (inline) continue;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    // A target under another element, for example the page under an open menu, is not a target in this state.
    if (cx >= 0 && cy >= 0 && cx < innerWidth && cy < innerHeight) { const hit = document.elementFromPoint(cx, cy); if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) continue; }
    const tooClose = rects.some((o) => o.el !== el && !(o.r.right < cx - 12 || o.r.left > cx + 12 || o.r.bottom < cy - 12 || o.r.top > cy + 12));
    if (tooClose) out.targets.push({ selector: sel(el), html: html(el), item: item(el), width: Math.round(r.width), height: Math.round(r.height), name: nameOf(el) });
  }
  function lum(c) { const m = c.match(/[\\d.]+/g); if (!m) return null; const [r, g, b] = m.slice(0, 3).map(Number); const a = m[3] !== undefined ? Number(m[3]) : 1; if (a < 1) return null; const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
  function bg(el) { let n = el; while (n && n !== document.documentElement) { const c = getComputedStyle(n).backgroundColor; const l = lum(c); if (l !== null && !/rgba\\(0, 0, 0, 0\\)/.test(c)) return l; n = n.parentElement; } return 1; }
  function contrast(l1, l2) { const a = Math.max(l1, l2), b = Math.min(l1, l2); return (a + 0.05) / (b + 0.05); }
  for (const f of document.querySelectorAll("input, textarea")) {
    if (!visible(f) || !f.getAttribute("placeholder")) continue;
    const pc = getComputedStyle(f, "::placeholder").color;
    const l = lum(pc); const b = lum(getComputedStyle(f).backgroundColor); const back = b === null ? bg(f) : b;
    if (l !== null) { const c = contrast(l, back); if (c < 4.5) out.placeholders.push({ selector: sel(f), html: html(f), item: item(f), color: pc, contrast: Math.round(c * 100) / 100 }); }
  }
  for (const f of document.querySelectorAll("input:not([type=hidden]), select, textarea, button")) {
    if (!visible(f)) continue;
    const cs = getComputedStyle(f);
    if (parseFloat(cs.borderTopWidth) < 1 || cs.borderTopStyle === "none") continue;
    const l = lum(cs.borderTopColor); const inner = lum(cs.backgroundColor); const outer = bg(f.parentElement || f);
    if (l === null) continue;
    const c = Math.max(contrast(l, outer), inner === null ? 0 : contrast(l, inner));
    if (c < 3) out.borders.push({ selector: sel(f), html: html(f), item: item(f), color: cs.borderTopColor, contrast: Math.round(c * 100) / 100 });
  }
  try {
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      for (const rule of rules) {
        if (rule.media && /orientation/.test(rule.media.mediaText) && /rotate/.test(rule.cssText)) out.orientation = true;
        if (rule.type === 7 || (rule.constructor && rule.constructor.name === "CSSKeyframesRule")) continue;
      }
    }
  } catch {}
  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.animationName === "none" || cs.animationIterationCount !== "infinite") continue;
    const dur = parseFloat(cs.animationDuration) || 0;
    const r = el.getBoundingClientRect();
    out.animations.push({ selector: sel(el), html: html(el), item: item(el), name: cs.animationName, duration: dur, area: Math.round(r.width * r.height) });
    if (out.animations.length > 20) break;
  }
  if (document.querySelector("marquee")) out.animations.push({ selector: "marquee", html: html(document.querySelector("marquee")), item: "marquee", name: "marquee", duration: 0, area: 0 });
  const first = tabbable().slice(0, 3);
  out.skipLink = first.some((a) => a.localName === "a" && (a.getAttribute("href") || "").startsWith("#") && document.querySelector(a.getAttribute("href").length > 1 ? "#" + CSS.escape(a.getAttribute("href").slice(1)) : "x") !== null);
  out.landmarks = document.querySelectorAll("main, [role=main], nav, [role=navigation]").length;
  for (const el of document.querySelectorAll("[tabindex]")) { const t = parseInt(el.getAttribute("tabindex"), 10); if (t > 0) out.tabindexPositive.push({ selector: sel(el), html: html(el), item: item(el), tabindex: t }); }
  for (const form of document.querySelectorAll("form")) {
    const fields = Array.from(form.querySelectorAll("input, select, textarea"));
    const names = fields.map((f) => (f.getAttribute("autocomplete") || "") + " " + f.name + " " + f.id).join(" ");
    const text = (form.innerText || "").slice(0, 2000);
    const submit = form.querySelector("button[type=submit], input[type=submit], button:not([type])");
    const stepText = (text.match(/step\\s*\\d+\\s*(of|\\/)\\s*\\d+/i) || [""])[0];
    if (/cc-number|card|payment|iban|checkout|order|purchase|legal|agree|terms/i.test(names + " " + text) && fields.length >= 2) out.payment.push({ selector: sel(form), html: html(form).slice(0, 200), item: item(form), submitText: submit ? nameOf(submit).slice(0, 60) : "", stepText, reviewWords: /review|confirm|summary|check your/i.test(text), hint: (names.match(/cc-number|card|payment|iban|checkout|order|purchase|legal|agree|terms/i) || [""])[0] });
    const pw = form.querySelector("input[type=password]");
    if (pw || /sign in|log in|login|sign-in/i.test(text.slice(0, 300))) out.login.push({ selector: sel(form), html: html(form).slice(0, 200), item: item(form), password: pw ? { autocomplete: pw.getAttribute("autocomplete"), onpaste: pw.hasAttribute("onpaste") || typeof pw.onpaste === "function" } : null, alternative: /sign-in link|magic link|passkey|code by email|one-time|single sign|google|microsoft|apple/i.test(text) });
    if (/captcha|type the (letters|characters|words)|i am not a robot/i.test(text) || form.querySelector("img[alt*=captcha i], .g-recaptcha, .cf-turnstile, iframe[src*=captcha]")) out.captcha = true;
  }
  for (const s of document.querySelectorAll("script:not([src])")) {
    const t = s.textContent || "";
    if (t.length > 60000 || /axe-core|__a11y/.test(t.slice(0, 2000))) continue;
    if (/setTimeout\\s*\\(/.test(t) && /location\\.(href|replace|assign)|location\\s*=/.test(t)) out.timers.push({ selector: sel(s), item: "script|timer", snippet: t.replace(/\\s+/g, " ").slice(0, 200) });
  }
  return out;
})()`;

/** Watches the page with no user action, and reports content that changes by itself (2.2.2). */
export async function runUpdateWatch(page: Page, url: string, width: number, state: string[], seconds = 3.5): Promise<Outcome[]> {
  // The text before the first change counts too, so that one change within the watch is enough.
  await page.evaluate(`window.__a11yUpd = new Map(); window.__a11yUpdObs = new MutationObserver((ms) => { for (const m of ms) { const el = m.type === "characterData" ? m.target.parentElement : m.target; if (!el || el.nodeType !== 1 || el.closest("[aria-live], [role=status], [role=alert], [role=log], [role=timer], [role=marquee], script, style")) continue; const key = el; const t = (el.innerText || el.textContent || "").trim().slice(0, 120); if (!t) continue; const prev = window.__a11yUpd.get(key) || { count: 0, texts: new Set() }; prev.count++; prev.texts.add(t); if (m.type === "characterData" && m.oldValue) prev.texts.add(m.oldValue.trim().slice(0, 120)); for (const n of m.removedNodes) { const o = (n.textContent || "").trim().slice(0, 120); if (o) prev.texts.add(o); } window.__a11yUpd.set(key, prev); } }); window.__a11yUpdObs.observe(document.body, { childList: true, subtree: true, characterData: true, characterDataOldValue: true });`);
  await page.waitForTimeout(seconds * 1000);
  const changed = await page.evaluate(`(() => { ${HELPERS} window.__a11yUpdObs.disconnect(); const out = []; for (const [el, v] of window.__a11yUpd) { if (v.texts.size < 2 || !visible(el)) continue; out.push({ selector: sel(el), html: html(el), item: item(el), changes: v.count, texts: Array.from(v.texts).slice(0, 3) }); if (out.length >= 5) break; } return out; })()`) as Record<string, any>[];
  return changed.map((c) => toOutcome({
    criterion: "2.2.2", rule: "content-updates-by-itself", kind: "cantTell", selector: c.selector, html: c.html, item: c.item, facts: { changes: c.changes, texts: c.texts, seconds },
    summary: `Content changed ${c.changes} times in ${seconds} seconds with no user action.`, severity: "serious",
    question: "Does this content update automatically, and is there a control to pause, stop, or hide it, or to control the frequency?",
    solution: { summary: "Add a pause control, or stop the automatic update.", steps: ["Add a button that pauses the update.", "Or update only on a user action."] },
  }, url, width, state));
}

export async function runPageTests(page: Page, url: string, width: number, state: string[], siteLang: string | null, axeTargets: string[] = []): Promise<{ outcomes: Outcome[]; facts: Record<string, unknown> }> {
  // The elements that axe-core already reported for the target size are skipped by the own test.
  await page.evaluate(`window.__a11ySkipTargets = new Set(${JSON.stringify(axeTargets)}.map((s) => { try { return document.querySelector(s); } catch { return null; } }).filter(Boolean));`);
  const d = await page.evaluate(COLLECT) as Record<string, any>;
  const found: Found[] = [];
  const pageLang = (siteLang || "").toLowerCase().split("-")[0];

  // 3.1.1: the declared language against the language of the text.
  const detected = detectLanguage(d.text);
  if (pageLang && detected.lang && detected.lang !== pageLang) {
    found.push({ criterion: "3.1.1", rule: "page-language-mismatch", kind: "failed", selector: "html", html: `<html lang="${siteLang}">`, item: "html|lang", facts: { declared: siteLang, detected: detected.lang, words: detected.words },
      summary: `The page declares the language "${siteLang}", but its text is in "${detected.lang}".`, severity: "serious",
      solution: { summary: "Set the lang attribute of the html element to the language of the page.", steps: [`Change lang="${siteLang}" to lang="${detected.lang}".`] } });
  }
  // 3.1.2: blocks in another language with no lang attribute.
  for (const b of d.blocks) {
    if (b.hasOwnLang) continue;
    const det = detectLanguage(b.text);
    if (det.lang && pageLang && det.lang !== pageLang && det.words >= 8) {
      found.push({ criterion: "3.1.2", rule: "block-language", kind: "cantTell", selector: b.selector, item: b.item, facts: { detected: det.lang, page: pageLang, text: b.text.slice(0, 160) },
        summary: `A passage seems to be in "${det.lang}" and has no lang attribute.`, severity: "moderate", context: b.text.slice(0, 300),
        question: `Is this passage in a different language than the page, and does it need a lang attribute? Text: "${b.text.slice(0, 160)}"`,
        solution: { summary: "Add a lang attribute to the passage.", steps: [`Add lang="${det.lang}" to the element.`] } });
    }
  }
  // 1.4.2 and 1.2.x: media.
  for (const m of d.media) {
    if (m.tag === "audio" || m.tag === "video") {
      if (m.autoplay && !m.muted && (m.duration === null || m.duration > 3)) {
        if (!m.controls) found.push({ criterion: "1.4.2", rule: "autoplay-no-control", kind: "failed", selector: m.selector, html: m.html, item: m.item, facts: { duration: m.duration, controls: m.controls },
          summary: "Audio starts automatically, plays for more than 3 seconds, and has no control to pause or stop it.", severity: "critical",
          solution: { summary: "Remove autoplay, or add controls that pause or stop the audio.", steps: ["Remove the autoplay attribute.", "Or add the controls attribute, or a visible pause button."] } });
        else found.push({ criterion: "1.4.2", rule: "autoplay-with-control", kind: "cantTell", selector: m.selector, html: m.html, item: m.item, facts: { duration: m.duration },
          summary: "Audio starts automatically and has controls.", severity: "moderate", question: "Is the control to pause or stop the audio at the start of the page, and easy to find?",
          solution: { summary: "Remove autoplay, or keep a pause control near the start of the page.", steps: ["Remove the autoplay attribute."] } });
      }
      const crit = m.tag === "audio" ? ["1.2.1"] : ["1.2.1", "1.2.2", "1.2.3", "1.2.5"];
      for (const c of crit) found.push({ criterion: c, rule: "media-found", kind: "candidate", selector: m.selector, html: m.html, item: m.item, facts: { tag: m.tag, src: m.src, tracks: m.tracks, captionTracks: m.captionTracks, descriptionTracks: m.descriptionTracks, hasAudioTrack: m.hasAudioTrack, duration: m.duration, muted: m.muted, nearbyLinks: m.nearbyLinks },
        summary: `A ${m.tag} element is on the page.`, severity: "serious",
        question: c === "1.2.1" ? "Does the media have a transcript or an equal text alternative next to it?" : c === "1.2.2" ? "Does the video have correct captions?" : c === "1.2.3" ? "Does the video have an audio description or a text alternative?" : "Does the video have an audio description?",
        steps: ["Play the media.", "Look for a transcript, captions, or an audio description, as the question says."],
        solution: { summary: "Add the alternative that the criterion asks for.", steps: ["Add a transcript, captions, or an audio description."] } });
    } else {
      found.push({ criterion: "1.2.1", rule: "player-found", kind: "candidate", selector: m.selector, html: m.html, item: m.item, facts: { title: m.title },
        summary: "An embedded player is on the page.", severity: "serious", question: "Does the media in this player have the alternatives of 1.2.1 to 1.2.5?",
        steps: ["Play the media in the player.", "Look for a transcript, captions, and an audio description."],
        solution: { summary: "Add the alternatives that the media needs.", steps: ["Add a transcript, captions, or an audio description."] } });
    }
  }
  // 2.2.2 and 2.3.1: animations that do not end.
  for (const a of d.animations) {
    if (a.duration > 0 && a.duration < 0.34 && a.area > 10000) {
      found.push({ criterion: "2.3.1", rule: "fast-animation", kind: "candidate", selector: a.selector, html: a.html, item: a.item, facts: { animation: a.name, duration: a.duration, area: a.area },
        summary: "An element animates more than three times each second over a large area.", severity: "critical", question: "Does the element flash more than three times in one second, over an area larger than the threshold?",
        steps: ["Open the page.", "Count the flashes in one second, or measure them with a tool."],
        solution: { summary: "Remove the fast animation.", steps: ["Remove the animation, or slow it to less than three changes each second."] } });
    } else {
      found.push({ criterion: "2.2.2", rule: "moving-content", kind: "cantTell", selector: a.selector, html: a.html, item: a.item, facts: { animation: a.name, duration: a.duration },
        summary: "Content moves or scrolls without an end.", severity: "serious", question: "Does the moving content last more than 5 seconds, and is there a control to pause, stop, or hide it?",
        solution: { summary: "Add a pause control, or stop the movement after 5 seconds.", steps: ["Add a button that pauses the animation.", "Or respect the prefers-reduced-motion setting and stop after 5 seconds."] } });
    }
  }
  // 2.4.1: a way to bypass blocks.
  if (!d.skipLink && d.landmarks === 0) {
    found.push({ criterion: "2.4.1", rule: "no-bypass", kind: "cantTell", selector: "body", item: "body|bypass", facts: { skipLink: false, landmarks: 0 },
      summary: "The page has no skip link and no landmarks.", severity: "serious", question: "Do blocks of content repeat on many pages, with no way to skip them?",
      solution: { summary: "Add a skip link to the main content, and landmarks.", steps: ["Add a link at the start of the page to the main content.", "Use main, nav, and header elements."] } });
  }
  // 2.4.3: a positive tabindex.
  for (const t of d.tabindexPositive) {
    found.push({ criterion: "2.4.3", rule: "positive-tabindex", kind: "cantTell", selector: t.selector, html: t.html, item: t.item, facts: { tabindex: t.tabindex },
      summary: "An element has a positive tabindex, which changes the focus order.", severity: "serious", question: "Does the focus order still keep the meaning and the operation of the page?",
      solution: { summary: "Remove the positive tabindex.", steps: ["Remove the tabindex attribute, or set it to 0."] } });
  }
  // 2.5.8: small targets with no space.
  for (const t of d.targets) {
    found.push({ criterion: "2.5.8", rule: "target-too-small", kind: "failed", selector: t.selector, html: t.html, item: t.item, facts: { width: t.width, height: t.height, name: t.name },
      summary: `A target of ${t.width} by ${t.height} px has another target within 24 px.`, severity: "serious",
      solution: { summary: "Make the target at least 24 by 24 px, or give it 24 px of space.", steps: ["Increase the size of the control, or add space between the controls."] } });
  }
  // 1.4.3: placeholder contrast. 1.4.11: border contrast.
  for (const p of d.placeholders) {
    found.push({ criterion: "1.4.3", rule: "placeholder-contrast", kind: "failed", selector: p.selector, html: p.html, item: p.item, facts: { color: p.color, contrast: p.contrast },
      summary: `The placeholder text has a contrast of ${p.contrast}:1.`, severity: "serious",
      solution: { summary: "Give the placeholder a contrast of at least 4.5:1.", steps: ["Change the color of ::placeholder."] } });
  }
  for (const b of d.borders) {
    found.push({ criterion: "1.4.11", rule: "control-border-contrast", kind: "cantTell", selector: b.selector, html: b.html, item: b.item, facts: { color: b.color, contrast: b.contrast },
      summary: `The border of a control has a contrast of ${b.contrast}:1.`, severity: "moderate", question: "Is the border the only visual indication of the control, so that it needs a contrast of 3:1?",
      solution: { summary: "Give the border a contrast of at least 3:1 with the background.", steps: ["Darken the border color."] } });
  }
  // 1.3.4: an orientation lock in CSS.
  if (d.orientation) {
    found.push({ criterion: "1.3.4", rule: "orientation-lock", kind: "cantTell", selector: "html", item: "html|orientation", facts: {},
      summary: "A style rotates the page on the orientation media feature.", severity: "serious", question: "Is the lock to one orientation essential for this page?",
      solution: { summary: "Remove the rotation on the orientation media feature.", steps: ["Remove the transform rule in the orientation media query."] } });
  }
  // 2.2.1: a timer that redirects.
  for (const t of d.timers) {
    found.push({ criterion: "2.2.1", rule: "timer-redirect", kind: "candidate", selector: t.selector, item: t.item, facts: { snippet: t.snippet },
      summary: "A script has a timer that changes the location.", severity: "serious", question: "Does the page move the user after a time limit, with no warning and no way to extend it?",
      steps: ["Open the page and wait.", "Note if the page changes by itself, and if a warning came first."],
      solution: { summary: "Remove the time limit, or warn the user and let them extend it.", steps: ["Remove the timer, or add a warning with a way to extend the time."] } });
  }
  // 1.1.1: alt texts that need a judgment.
  for (const img of d.images) {
    if (img.alt === null) continue;
    const file = /^(img|dsc|image|photo|picture)[_-]?\d*$|\.(png|jpe?g|gif|svg|webp)$/i.test(img.alt.trim()) || (img.src && img.alt.trim() === img.src);
    if (file) found.push({ criterion: "1.1.1", rule: "alt-is-file-name", kind: "cantTell", selector: img.selector, html: img.html, item: img.item, facts: { alt: img.alt, src: img.src }, context: img.context,
      summary: "The text alternative of an image looks like a file name.", severity: "serious", question: `Does the alt text "${img.alt}" describe the image in its context?`,
      solution: { summary: "Replace the file name with a description of the image.", steps: ["Write what the image shows, in its context."] } });
    else if (img.alt.trim() === "" && img.caption) found.push({ criterion: "1.1.1", rule: "alt-empty-with-caption", kind: "cantTell", selector: img.selector, html: img.html, item: img.item, facts: { alt: "", caption: img.caption }, context: img.context,
      summary: "An image with a caption is marked as decorative.", severity: "serious", question: `The image has an empty alt and the caption "${img.caption}". Does the image carry information that the alt text must give?`,
      solution: { summary: "Give the image a description, or keep the empty alt if the caption says everything.", steps: ["Write an alt text that describes the image."] } });
  }
  // 1.3.1: tables with no headers, lists with no list code.
  for (const t of d.tables) found.push({ criterion: "1.3.1", rule: "table-no-headers", kind: "cantTell", selector: t.selector, html: t.html, item: t.item, facts: { rows: t.rows, cols: t.cols },
    summary: "A table has no header cells.", severity: "serious", question: "Is this a data table whose first row or first column are headers?",
    solution: { summary: "Mark the header cells with th and scope.", steps: ["Use th elements for the header row and the header column."] } });
  for (const l of d.fakeLists) found.push({ criterion: "1.3.1", rule: "list-without-list-code", kind: "cantTell", selector: l.selector, html: l.html, item: l.item, facts: { lines: l.lines },
    summary: "Text looks like a list but is not in a list element.", severity: "moderate", question: "Are these lines a list that needs ol or ul code?",
    solution: { summary: "Use a list element.", steps: ["Use ol or ul with one li for each item."] } });
  // 1.3.2: a visual order that differs from the code order.
  for (const o of d.order) found.push({ criterion: "1.3.2", rule: "visual-order-differs", kind: "cantTell", selector: o.selector, html: o.html, item: o.item, facts: { flexDirection: o.flexDirection, ordered: o.ordered },
    summary: "A style changes the visual order of the items.", severity: "serious", question: "Does the code order give a different meaning than the visual order?",
    solution: { summary: "Put the items in the code in the order that they show.", steps: ["Remove the reverse direction or the order property, or change the code order."] } });
  // 1.3.3: sensory instructions.
  for (const s of d.sensory) found.push({ criterion: "1.3.3", rule: "sensory-instruction", kind: "cantTell", selector: s.selector, html: s.html, item: s.item, facts: { match: s.match }, context: s.text,
    summary: "An instruction refers to shape, color, size, or position.", severity: "moderate", question: `Does this instruction depend on a sensory characteristic only? "${s.text.slice(0, 160)}"`,
    solution: { summary: "Name the control in the instruction, next to the sensory words.", steps: ["Add the name of the control to the instruction."] } });
  // 1.3.5 and 3.3.2: fields.
  for (const f of d.fields) {
    if (f.personal && !f.autocomplete && ["text", "email", "tel", "password", ""].includes(f.type)) found.push({ criterion: "1.3.5", rule: "personal-field-no-autocomplete", kind: "cantTell", selector: f.selector, html: f.html, item: f.item, facts: { name: f.name, type: f.type },
      summary: "A field seems to collect personal data and has no autocomplete attribute.", severity: "moderate", question: "Does this field collect data about the user that an autocomplete token covers?",
      solution: { summary: "Add the autocomplete attribute.", steps: ["Add autocomplete with the token of the data, for example name or email."] } });
    if (!f.visibleLabel) found.push({ criterion: "3.3.2", rule: "field-no-visible-label", kind: "cantTell", selector: f.selector, html: f.html, item: f.item, facts: { placeholder: f.placeholder, ariaLabel: f.ariaLabel },
      summary: "A field has no visible label.", severity: "serious", question: "Does the field have a visible label or instruction that stays while the user types?",
      solution: { summary: "Add a visible label to the field.", steps: ["Add a label element with a for attribute."] } });
  }
  // 2.4.4 and 2.4.6: generic link texts and headings.
  // One question for each link text in each kind of container: the answer for one "Read more" in a card holds for all cards.
  for (const l of d.links) found.push({ criterion: "2.4.4", rule: "generic-link-text", kind: "cantTell", selector: l.selector, html: l.html, item: "link|generic|" + l.name.toLowerCase().replace(/\s+/g, " ").trim(), facts: { name: l.name, href: l.href, context: l.context }, context: l.containerKind,
    summary: `A link says "${l.name}".`, severity: "serious", question: `Does the link text "${l.name}" with its context tell where the link goes? Context: "${l.context.slice(0, 160)}"`,
    solution: { summary: "Say where the link goes in the link text.", steps: ["Replace the generic text with the topic of the target page."] } });
  for (const h of d.headings) found.push({ criterion: "2.4.6", rule: "generic-heading", kind: "cantTell", selector: h.selector, html: h.html, item: h.item, facts: { text: h.text },
    summary: `A heading says "${h.text}".`, severity: "moderate", question: `Does the heading "${h.text}" describe the content under it?`,
    solution: { summary: "Write a heading that describes the content.", steps: ["Replace the heading text with the topic of the section."] } });
  // 3.3.4 and 3.3.8: forms for a person.
  for (const p of d.payment) found.push({ criterion: "3.3.4", rule: "financial-form", kind: "candidate", selector: p.selector, html: p.html, item: p.item, facts: { hint: p.hint, submitText: p.submitText, stepText: p.stepText, reviewWords: p.reviewWords },
    summary: "A form seems to make a financial or legal commitment.", severity: "serious", question: "Can the user check, correct, or cancel the data before the commitment?",
    steps: ["Fill the form on a test environment.", "Look for a review step, a confirmation, or a way to cancel."],
    solution: { summary: "Add a review step, or let the user cancel.", steps: ["Show the data for review before the final step."] } });
  for (const l of d.login) {
    const facts: Record<string, unknown> = { password: l.password, alternative: l.alternative, captcha: d.captcha };
    found.push({ criterion: "3.3.8", rule: "login-form", kind: "candidate", selector: l.selector, html: l.html, item: l.item, facts,
      summary: "A login form is on the page.", severity: "serious", question: "Does the login need a cognitive function test, for example a password typed from memory, or a CAPTCHA, with no alternative?",
      steps: ["Try to paste the password and to fill it with a password manager.", "Look for a method with no memory test, or an exception."],
      solution: { summary: "Permit the paste and the autofill, and give a method with no cognitive function test.", steps: ["Remove the paste block.", "Set autocomplete on the fields.", "Offer a sign-in link or a passkey."] } });
  }
  return { outcomes: found.map((f) => toOutcome(f, url, width, state)), facts: { detectedLanguage: detected.lang, media: d.media.length, fields: d.fields.length, skipLink: d.skipLink, landmarks: d.landmarks, animations: d.animations.length } };
}

/** axe-core cannot decide the target size of some elements, for example with overflow. The own test decides them.
 *  When the own test fails an element, the axe-core question for the same element is dropped. */
export async function dropTargetQuestions(page: Page, axe: Outcome[], own: Outcome[]): Promise<Outcome[]> {
  const questions = axe.filter((o) => o.rule === "target-size" && o.kind === "cantTell");
  const failed = own.filter((o) => o.rule === "target-too-small").map((o) => o.selector);
  if (!questions.length || !failed.length) return axe;
  const drop = await page.evaluate(`(() => { const own = new Set(${JSON.stringify(failed)}.map((s) => { try { return document.querySelector(s); } catch { return null; } }).filter(Boolean)); return ${JSON.stringify(questions.map((q) => q.selector))}.filter((s) => { try { const el = document.querySelector(s); return !!el && own.has(el); } catch { return false; } }); })()`) as string[];
  const set = new Set(drop);
  return axe.filter((o) => !(o.rule === "target-size" && o.kind === "cantTell" && set.has(o.selector)));
}
