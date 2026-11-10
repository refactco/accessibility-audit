// The script of the review page. It reads the data that the server puts in the page, shows one view at a time (Overview, Decisions,
// Issues, Method) with its own address, loads the details of one item when a person chooses it, and saves each answer and decision
// at once. No build step and no library.
(function () {
  "use strict";
  var DATA = JSON.parse(document.getElementById("data").textContent);
  var VIEWS = ["overview", "decisions", "issues", "method"];
  var VIEW_TITLES = { overview: "Overview", decisions: "Decisions", issues: "Issues", method: "Method" };
  var GROUPS = [
    { key: "differ", label: "The AI reviews differ", tag: "k-differ", hint: "The two AI reviews did not agree, or one is unsure. Look at the page first, then open their answers if they help." },
    { key: "sample", label: "Sample: check the AI", tag: "k-sample", hint: "A sample question checks the AI. Its answers open after your answer." },
    { key: "person", label: "Checks for a person", tag: "k-person", hint: "Only a person can check this. Follow the steps." },
    { key: "proposal", label: "Proposed: no change", tag: "", hint: "The review found no change to make. Keep the issue, or close it with a reason." },
    { key: "other", label: "Other open questions", tag: "", hint: "" }
  ];
  var GROUP_BY_KEY = {}; GROUPS.forEach(function (g) { GROUP_BY_KEY[g.key] = g; });
  var Q_ANSWERS = [{ value: "issue", label: "Issue" }, { value: "no issue", label: "Not an issue" }, { value: "not applicable", label: "Not applicable" }];
  var P_ANSWERS = [{ value: "dismissed", label: "Dismiss: not a real problem", needs: true }, { value: "accepted", label: "Accept as a known risk", needs: true }, { value: "kept", label: "Keep as an issue", needs: false }];
  var SEVERITY_LABEL = { critical: "Critical", serious: "Serious", moderate: "Moderate", minor: "Minor" };
  var STATUS_LABEL = { "new": "New", open: "Open", reopened: "Reopened", accepted: "Accepted", dismissed: "Dismissed", resolved: "Resolved" };
  var OPEN = { "new": 1, open: 1, reopened: 1 };
  var PAGE = 100;

  var state = {
    view: "overview",
    d: { sel: null, search: "", kind: "", wcag: "", status: "", shown: PAGE },
    i: { sel: null, search: "", who: "", sev: "", level: "", status: "open", shown: PAGE },
    decisionsMade: 0,
    aiOpen: false, rawOpen: false, open: {}
  };
  var cache = {};
  var narrow = window.matchMedia("(max-width: 1099px)");

  // Small helpers.
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u || "")) ? String(u) : "#"; }
  function num(n) { return Number(n || 0).toLocaleString("en-US"); }
  function plural(n, word, many) { return num(n) + " " + (n === 1 ? word : (many || word + "s")); }
  function $(id) { return document.getElementById(id); }
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function longDate(iso) { var d = new Date(iso); return isNaN(d.getTime()) ? String(iso || "").slice(0, 10) : d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear(); }
  function shortDate(iso) { var d = new Date(iso); return isNaN(d.getTime()) ? String(iso || "").slice(0, 10) : d.getUTCDate() + " " + MONTHS[d.getUTCMonth()].slice(0, 3); }
  function getName() { try { return localStorage.getItem("a11y-by") || ""; } catch (e) { return window.__a11yBy || ""; } }
  function setName(v) { try { localStorage.setItem("a11y-by", v); } catch (e) { window.__a11yBy = v; } }
  function keysOn() { try { return localStorage.getItem("a11y-keys") !== "off"; } catch (e) { return true; } }
  function setKeys(on) { try { localStorage.setItem("a11y-keys", on ? "on" : "off"); } catch (e) { /* the setting stays for this page */ } }
  function announce(text) { var a = $("announce"); a.textContent = ""; setTimeout(function () { a.textContent = text; }, 30); }
  var ICON = {
    chevron: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 4l4 4-4 4"/></svg>',
    up: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 10l4-4 4 4"/></svg>',
    down: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>',
    back: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M10 4l-4 4 4 4"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 8.5l3 3 7-7"/></svg>',
    search: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>'
  };
  function sevMark(s) {
    var shape = s === "critical" ? '<path d="M5 0 L10 5 L5 10 L0 5 Z" fill="currentColor"/>' : s === "serious" ? '<path d="M5 0.5 L9.7 9.5 L0.3 9.5 Z" fill="currentColor"/>' : s === "moderate" ? '<rect x="1" y="1" width="8" height="8" fill="currentColor"/>' : '<circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" stroke-width="1.6"/>';
    return '<span class="sev ' + (s === "critical" || s === "serious" ? "high" : "low") + '"><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">' + shape + "</svg>" + esc(SEVERITY_LABEL[s] || s) + "</span>";
  }
  function post(url, body) {
    return fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-a11y-review": "1" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "error " + r.status); return d; }); });
  }
  function details(id) {
    if (cache[id]) return Promise.resolve(cache[id]);
    return fetch("/api/item?id=" + encodeURIComponent(id)).then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "error"); cache[id] = d; return d; }); });
  }

  // The address: #view, #view/ID, and the filters of the issues after a question mark, so that a link opens the same list.
  function parseHash() {
    var h = decodeURIComponent(location.hash.replace(/^#/, ""));
    var q = "", at = h.indexOf("?");
    if (at >= 0) { q = h.slice(at + 1); h = h.slice(0, at); }
    var parts = h.split("/");
    var view = VIEWS.indexOf(parts[0]) >= 0 ? parts[0] : null;
    return { view: view, id: parts[1] || null, params: new URLSearchParams(q) };
  }
  function hashFor(view) {
    var s = view === "decisions" ? state.d : view === "issues" ? state.i : null;
    var h = "#" + view + (s && s.sel ? "/" + s.sel : "");
    if (view === "issues") {
      var p = new URLSearchParams();
      if (state.i.who) p.set("who", state.i.who);
      if (state.i.sev) p.set("severity", state.i.sev);
      if (state.i.level) p.set("level", state.i.level);
      if (state.i.status !== "open") p.set("status", state.i.status);
      if (p.toString()) h += "?" + p.toString();
    }
    return h;
  }
  function replaceHash() { history.replaceState(null, "", hashFor(state.view)); }

  // The counts that change with each decision.
  function left() { return DATA.decisions.filter(function (d) { return !d.done; }).length; }
  function updateCounts() {
    var n = left();
    var badge = $("nav-left");
    badge.textContent = num(n);
    badge.className = "badge tnum" + (n ? "" : " zero");
    badge.setAttribute("aria-label", n ? plural(n, "decision") + " waiting" : "no decision waiting");
    var openCount = DATA.issues.filter(function (i) { return OPEN[i.status]; }).length;
    $("nav-issues").textContent = num(openCount);
    $("nav-issues").setAttribute("aria-label", plural(openCount, "open issue"));
    var sum = $("d-sum");
    if (sum) sum.innerHTML = n ? '<span class="wait-text">' + plural(n, "decision") + " wait for you</span> · " + num(DATA.decisions.length - n) + " done" : "Nothing waits for you · " + num(DATA.decisions.length) + " done";
    var stale = $("stale");
    stale.hidden = !state.decisionsMade;
    if (state.decisionsMade) $("stale-text").textContent = "You made " + plural(state.decisionsMade, "decision") + " on this page. The numbers of the overview and the report change after a refresh.";
  }

  // The views.
  function show(view, focus) {
    state.view = view;
    VIEWS.forEach(function (v) { $("view-" + v).hidden = v !== view; });
    document.querySelectorAll("a.nav[data-view]").forEach(function (a) { if (a.dataset.view === view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    document.title = VIEW_TITLES[view] + " · Accessibility review of " + DATA.host;
    if (view === "overview") renderOverview();
    if (view === "decisions") renderDecisions();
    if (view === "issues") renderIssues();
    if (view === "method") renderMethod();
    if (focus) { var h = document.querySelector("#view-" + view + " h1"); if (h) h.focus(); }
  }

  function renderOverview() {
    var o = DATA.overview;
    var n = left();
    var diff = o.prevOpen == null ? null : o.open - o.prevOpen;
    var groups = GROUPS.map(function (g) { return { g: g, n: DATA.decisions.filter(function (d) { return d.group === g.key && !d.done; }).length }; }).filter(function (x) { return x.n; });
    var first = DATA.issues.filter(function (i) { return OPEN[i.status] && !i.proposal; }).slice(0, 5);
    var trend = o.trend || [];
    var max = Math.max.apply(null, [1].concat(trend.map(function (t) { return t.open; })));
    var html = '<header class="vhead"><h1 tabindex="-1">Overview</h1><p class="vsum">' + plural(o.open, "issue") + " open" +
      (o.prevOpen == null ? "" : diff === 0 ? ", the same as the last audit" : diff > 0 ? ", up from " + num(o.prevOpen) : ", down from " + num(o.prevOpen)) +
      (n ? ' · <span class="wait-text">' + plural(n, "decision") + " wait for you</span>" : "") + "</p></header>" +
      '<div class="ov">' +
      '<div class="stats">' +
      '<div class="stat"><span class="v tnum">' + num(o.open) + '</span><span class="d">' + (diff == null ? "first audit" : diff === 0 ? "the same as " + esc(shortDate(o.prevRun)) : (diff > 0 ? "up " : "down ") + num(Math.abs(diff)) + " since " + esc(shortDate(o.prevRun))) + '</span><span class="l">Open issues</span></div>' +
      '<div class="stat"><span class="v tnum">' + num(o.newCount) + '</span><span class="d">' + num(o.resolved) + ' resolved</span><span class="l">New in this audit</span></div>' +
      '<a class="stat" href="#decisions"><span class="v tnum' + (n ? " wait" : "") + '">' + num(n) + '</span><span class="d">for a person</span><span class="l">Decisions waiting</span></a>' +
      (o.share == null ? "" : '<div class="stat"><span class="v tnum">' + esc(o.share) + '%</span><span class="d">' + (o.prevShare == null ? "levels A and AA" : (o.share === o.prevShare ? "the same as the last audit" : (o.share > o.prevShare ? "up " : "down ") + (Math.round(Math.abs(o.share - o.prevShare) * 10) / 10) + " points since the last audit")) + '</span><span class="l">Checks with no failure</span></div>') +
      "</div>" +
      '<div class="row2">' +
      (trend.length >= 2 ? '<section class="wide" aria-labelledby="trend-h"><div class="sechead"><h2 id="trend-h">Open issues, last ' + trend.length + ' audits</h2><span class="aside">Lower is better</span></div>' +
        '<figure class="card chart" style="margin:0"><div class="bars" role="img" aria-label="' + esc("Open issues: " + trend.map(function (t) { return t.open + " on " + longDate(t.run); }).join(", ")) + '">' +
        trend.map(function (t, k) { return '<div class="bar' + (k === trend.length - 1 ? " last" : "") + '" aria-hidden="true"><span class="bv tnum">' + num(t.open) + '</span><span class="bb" style="height:' + Math.max(2, Math.round(t.open / max * 120)) + 'px"></span></div>'; }).join("") +
        '</div><div class="blabels" aria-hidden="true">' + trend.map(function (t) { return "<span>" + esc(shortDate(t.run)) + "</span>"; }).join("") + "</div></figure></section>" : "") +
      '<section aria-labelledby="wait-h"><div class="sechead"><h2 id="wait-h">Waiting for you</h2></div><div class="card">' +
      (groups.length ? '<ul class="waitlist">' + groups.map(function (x) { return '<li><a href="#decisions" data-kind="' + x.g.key + '"><span class="dot" aria-hidden="true"></span>' + esc(x.g.label) + '<span class="n tnum">' + num(x.n) + "</span></a></li>"; }).join("") + "</ul>" : '<p class="empty">Nothing waits for you. The last audit was on ' + esc(longDate(DATA.run)) + ".</p>") +
      '<div class="cardfoot"><span class="small muted">Each answer saves at once.</span>' + (n ? '<a class="btn primary" href="#decisions" id="start">Start reviewing</a>' : '<a class="btn" href="#issues">Open the issues</a>') + "</div></div></section>" +
      "</div>" +
      (first.length ? '<section aria-labelledby="first-h"><div class="sechead"><h2 id="first-h">Fix first</h2><span class="aside">The highest severity, then the most pages</span><a href="#issues">All ' + num(o.open) + ' issues</a></div><div class="card">' +
        '<table class="tbl"><caption class="sr-only">The five issues to fix first</caption><thead><tr><th scope="col">Issue</th><th scope="col" class="c-sev">Severity</th><th scope="col" class="num c-pages">Pages</th><th scope="col" class="c-who">Who fixes it</th><th scope="col" class="c-wcag">WCAG</th></tr></thead><tbody>' +
        first.map(function (i) { return '<tr class="item"><td class="title"><a href="#issues/' + esc(i.id) + '">' + esc(i.title) + "</a></td><td>" + sevMark(i.severity) + '</td><td class="num tnum c-pages">' + num(i.pages) + '</td><td class="c-who"><span class="who-chip">' + esc(i.who) + '</span></td><td class="tnum c-wcag">' + esc(i.criterion) + "</td></tr>"; }).join("") +
        "</tbody></table></div></section>" : "") +
      '<div class="row2">' +
      '<section aria-labelledby="changed-h"><div class="sechead"><h2 id="changed-h">' + (o.prevRun ? "Since the last audit, " + esc(longDate(o.prevRun)) : "This audit") + '</h2></div><div class="card"><dl class="dl">' +
      "<div><dt>New</dt><dd class=\"tnum\">" + num(o.newCount) + "</dd></div>" +
      "<div><dt>Resolved" + (o.resolvedRule ? ' <span class="small">(' + num(o.resolvedFixed) + " fixed, " + num(o.resolvedRule) + " because a test changed)</span>" : "") + '</dt><dd class="tnum">' + num(o.resolved) + "</dd></div>" +
      '<div><dt>Reopened</dt><dd class="tnum">' + num(o.reopened) + "</dd></div>" +
      (o.outOfScope ? '<div><dt>Out of scope now <span class="small">(pages that the settings leave out)</span></dt><dd class="tnum">' + num(o.outOfScope) + "</dd></div>" : "") +
      "</dl></div></section>" +
      '<section aria-labelledby="covered-h"><div class="sechead"><h2 id="covered-h">What the audit covered</h2><a href="#method">Method and limits</a></div><div class="card prose">' +
      "<p>" + plural(o.coverage.pages, "page") + " at " + esc(o.coverage.widths.join(", ")) + " px, against WCAG 2.2 level AA." + (o.coverage.sample ? " On " + plural(o.coverage.sample, "sample page") + " the audit also opened " + plural(o.coverage.states, "menu, dialog, or tab", "menus, dialogs, and tabs") + "." : "") + (o.coverage.processes ? " It ran " + plural(o.coverage.processes, "process", "processes") + "." : "") + "</p>" +
      "<p>Automatic tests find only part of the problems. The rest are questions for the AI and checks for a person." + (DATA.answers && (DATA.answers.waitingAi || DATA.answers.unresolved) ? " " + plural(DATA.answers.waitingAi, "question") + (DATA.answers.waitingAi === 1 ? " waits" : " wait") + " for a first AI review, and " + plural(DATA.answers.unresolved, "question") + (DATA.answers.unresolved === 1 ? " has" : " have") + " AI answers that do not agree." : "") + "</p></div></section>" +
      "</div></div>";
    $("view-overview").innerHTML = html;
    document.querySelectorAll('#view-overview a[data-kind]').forEach(function (a) { a.addEventListener("click", function () { state.d.kind = a.dataset.kind; state.d.status = "waiting"; state.d.sel = null; }); });
  }

  function renderMethod() {
    var o = DATA.overview, c = o.coverage, lv = o.levels;
    var rows = lv ? [["Level A", lv.A], ["Levels A and AA", lv.AA]].map(function (r) { var l = r[1]; return '<tr><th scope="row">' + r[0] + '</th><td class="num tnum">' + l.criteria.all + '</td><td class="num tnum">' + l.criteria.met + '</td><td class="num tnum">' + l.criteria.failed + '</td><td class="num tnum">' + l.criteria.unknown + '</td><td class="num tnum">' + l.criteria.no_content + '</td><td class="num tnum">' + l.criteria.not_tested + '</td><td class="num tnum">' + num(l.pages.no_failure) + " of " + num(l.pages.all) + "</td></tr>"; }).join("") : "";
    var v = DATA.versions;
    $("view-method").innerHTML = '<header class="vhead"><h1 tabindex="-1">Method and limits</h1><p class="vsum">Audit of ' + esc(longDate(DATA.run)) + " · " + esc(DATA.environment) + "</p></header>" +
      '<div class="method">' +
      '<section aria-labelledby="m-how"><div class="sechead"><h2 id="m-how">How the audit works</h2></div><div class="card prose">' +
      "<p>An engine opened " + plural(c.pages, "page") + " in a real browser at " + esc(c.widths.join(", ")) + " px and ran the rules of axe-core and its own tests for the 55 criteria of WCAG 2.2 at levels A and AA." + (c.sample ? " On " + plural(c.sample, "sample page") + " it also opened " + plural(c.states, "menu, dialog, or tab", "menus, dialogs, and tabs") + "." : "") + (c.forms ? " It submitted " + plural(c.forms, "form") + " empty and with incorrect values, with a guard that kept the data in the browser." : "") + "</p>" +
      "<p>A finding that a rule is sure about became an issue. A finding that needs judgment became a question. Two independent AI reviews answer a question from the evidence and a screenshot, and two equal answers decide. A person decides the rest on this page. A third review finds the origin of each issue in the code or the content and writes the fix.</p>" +
      "<p>" + esc(DATA.answersText) + "</p>" +
      "<p>The numbers measure this audit. They are not a conformance claim: WCAG has no score, and a page conforms to a level or it does not. A check that found nothing is not a pass, and automatic testing cannot find every problem.</p>" +
      (o.definition ? '<p class="small">' + esc(o.definition) + "</p>" : "") + "</div></section>" +
      (rows ? '<section aria-labelledby="m-crit"><div class="sechead"><h2 id="m-crit">The 55 criteria by level</h2></div><div class="card" style="overflow-x:auto"><table class="tbl"><caption class="sr-only">The criteria of each level: met, failed, waiting, no content, and not tested</caption><thead><tr><th scope="col">Level</th><th scope="col" class="num">Criteria</th><th scope="col" class="num">Met</th><th scope="col" class="num">Failed</th><th scope="col" class="num">Waiting</th><th scope="col" class="num">No content</th><th scope="col" class="num">Not tested</th><th scope="col" class="num">Pages with no failure</th></tr></thead><tbody>' + rows + '</tbody></table></div><p class="small muted">"Met" means that the tests found nothing, or that a person passed it. "No content" means that the site has no content of that kind, for example no video.</p></section>' : "") +
      (c.notRun.length ? '<section aria-labelledby="m-not"><div class="sechead"><h2 id="m-not">Tests that did not run, ' + c.notRun.length + '</h2></div><div class="card prose"><ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px">' + c.notRun.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div></section>" : "") +
      (v ? '<p class="small muted">Engine ' + esc(v.engine) + ", axe-core " + esc(v.axe_core) + ", " + esc(v.browser) + ". This page runs on your machine and reads " + esc(DATA.outDir) + ".</p>" : "") +
      "</div>";
  }

  // The decisions: a list grouped by kind, and the chosen item beside it.
  function decisionRows() {
    var s = state.d, term = s.search.toLowerCase();
    return DATA.decisions.filter(function (d) {
      if (s.kind && d.group !== s.kind) return false;
      if (s.wcag && d.criterion !== s.wcag) return false;
      if (s.status === "waiting" && d.done) return false;
      if (s.status === "done" && !d.done) return false;
      if (term && (d.title + " " + d.hint + " " + d.path + " " + d.id).toLowerCase().indexOf(term) < 0) return false;
      return true;
    }).sort(function (a, b) { var ga = GROUPS.indexOf(GROUP_BY_KEY[a.group]), gb = GROUPS.indexOf(GROUP_BY_KEY[b.group]); return ga - gb; });
  }
  function renderDecisions() {
    var view = $("view-decisions");
    if (!view.dataset.built) {
      var criteria = {}; DATA.decisions.forEach(function (d) { criteria[d.criterion] = (criteria[d.criterion] || 0) + 1; });
      var crit = Object.keys(criteria).sort(function (a, b) { return a.localeCompare(b, "en", { numeric: true }); });
      view.innerHTML = '<header class="vhead"><h1 tabindex="-1">Decisions</h1><p class="vsum" id="d-sum"></p></header>' +
        '<div class="filters" role="search" aria-label="Filter the decisions">' +
        '<label class="field search">' + ICON.search + '<span class="sr-only">Search the decisions</span><input type="search" id="d-search" placeholder="Search"></label>' +
        '<label class="chip">Kind <select id="d-kind"><option value="">Any</option>' + GROUPS.filter(function (g) { return DATA.decisions.some(function (d) { return d.group === g.key; }); }).map(function (g) { return '<option value="' + g.key + '">' + esc(g.label) + "</option>"; }).join("") + "</select></label>" +
        '<label class="chip">WCAG <select id="d-wcag"><option value="">Any</option>' + crit.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + " (" + criteria[c] + ")</option>"; }).join("") + "</select></label>" +
        '<label class="chip">Status <select id="d-status"><option value="">Any</option><option value="waiting">Waiting</option><option value="done">Done</option></select></label>' +
        '<span class="fcount tnum" id="d-count" aria-live="polite"></span></div>' +
        '<div class="split" id="d-split"><section class="list" aria-label="The list of decisions"><div class="card" id="d-list"></div></section>' +
        '<aside class="panel" id="d-panel" aria-label="The chosen decision"></aside></div>';
      view.dataset.built = "1";
      $("d-search").addEventListener("input", function (e) { state.d.search = e.target.value; state.d.shown = PAGE; drawDecisionList(); });
      [["d-kind", "kind"], ["d-wcag", "wcag"], ["d-status", "status"]].forEach(function (p) { $(p[0]).addEventListener("change", function (e) { state.d[p[1]] = e.target.value; state.d.shown = PAGE; drawDecisionList(); }); });
    }
    $("d-kind").value = state.d.kind; $("d-wcag").value = state.d.wcag; $("d-status").value = state.d.status; $("d-search").value = state.d.search;
    updateCounts();
    drawDecisionList();
  }
  function drawDecisionList() {
    var rows = decisionRows();
    var s = state.d;
    if (!narrow.matches && (!s.sel || !rows.some(function (r) { return r.id === s.sel; }))) {
      var firstWaiting = rows.filter(function (r) { return !r.done; })[0] || rows[0];
      if (!s.sel || !DATA.decisions.some(function (r) { return r.id === s.sel; })) s.sel = firstWaiting ? firstWaiting.id : null;
    }
    var waiting = rows.filter(function (r) { return !r.done; }).length;
    $("d-count").textContent = rows.length === DATA.decisions.length ? num(waiting) + " waiting" : num(rows.length) + " of " + num(DATA.decisions.length) + " shown";
    var shown = rows.slice(0, s.shown);
    var html = "";
    if (!DATA.decisions.length) html = '<p class="empty">Nothing waits for you. The audit of ' + esc(longDate(DATA.run)) + ' has no question for a person. <a href="#issues">Open the issues</a>.</p>';
    else if (!rows.length) html = '<p class="empty">No decision matches the filters.</p>';
    else {
      html = '<table class="tbl"><caption class="sr-only">Decisions, grouped by kind. Choose one to see it beside the list.</caption><thead><tr><th scope="col">Question</th><th scope="col" class="num c-pages">Pages</th><th scope="col" class="c-wcag">WCAG</th><th scope="col" class="c-status">Status</th></tr></thead><tbody>';
      var last = null;
      shown.forEach(function (r) {
        if (r.group !== last) {
          last = r.group;
          var all = rows.filter(function (x) { return x.group === r.group; });
          html += '<tr class="grp"><th scope="colgroup" colspan="4">' + esc(GROUP_BY_KEY[r.group].label) + ' <span class="gcount tnum">' + num(all.filter(function (x) { return !x.done; }).length) + " waiting of " + num(all.length) + "</span></th></tr>";
        }
        var sel = r.id === s.sel;
        html += '<tr class="item' + (sel ? " sel" : "") + (r.done ? " done" : "") + '" data-id="' + esc(r.id) + '"><td><button type="button" class="rowbtn" data-id="' + esc(r.id) + '"' + (sel ? ' aria-current="true"' : "") + '><span class="t">' + esc(r.title) + '</span><span class="h">' + esc([r.path, r.hint].filter(Boolean).join(" · ")) + "</span></button></td>" +
          '<td class="num tnum c-pages">' + num(r.pages) + '</td><td class="tnum c-wcag">' + esc(r.criterion) + '</td><td class="c-status"><span class="st"><span class="dot' + (r.done ? " done" : "") + '" aria-hidden="true"></span>' + (r.done ? "Done" : "Waiting") + "</span></td></tr>";
      });
      html += "</tbody></table>";
      if (rows.length > shown.length) html += '<div class="list-foot"><span>' + num(shown.length) + " of " + num(rows.length) + ' shown</span><button type="button" class="btn small" id="d-more">Show ' + Math.min(PAGE, rows.length - shown.length) + " more</button></div>";
    }
    $("d-list").innerHTML = html;
    $("d-list").querySelectorAll("button.rowbtn").forEach(function (b) { b.addEventListener("click", function () { pickDecision(b.dataset.id, narrow.matches ? "panel" : "row"); }); });
    var more = $("d-more"); if (more) more.addEventListener("click", function () { s.shown += PAGE; drawDecisionList(); var btns = $("d-list").querySelectorAll("button.rowbtn"); if (btns[s.shown - PAGE]) btns[s.shown - PAGE].focus(); });
    $("d-split").classList.toggle("has-sel", !!s.sel && narrow.matches && !!parseHash().id);
    drawDecisionPanel();
  }
  function pickDecision(id, focus) {
    state.d.sel = id; state.aiOpen = false; state.rawOpen = false;
    replaceHash();
    document.querySelectorAll("#d-list tr.item").forEach(function (tr) { var on = tr.dataset.id === id; tr.classList.toggle("sel", on); var b = tr.querySelector("button"); if (on) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current"); });
    $("d-split").classList.toggle("has-sel", narrow.matches);
    drawDecisionPanel(focus);
  }
  function rowOf(id) { for (var k = 0; k < DATA.decisions.length; k++) if (DATA.decisions[k].id === id) return DATA.decisions[k]; return null; }

  var drawnDecision = null;
  function drawDecisionPanel(focus) {
    var panel = $("d-panel");
    var r = rowOf(state.d.sel);
    // A new item starts with its disclosures closed, also when the address chose it.
    if (r && r.id !== drawnDecision) { state.aiOpen = false; state.rawOpen = false; drawnDecision = r.id; }
    if (!r) { panel.innerHTML = '<div class="pbody"><p class="muted">Choose a decision in the list.</p></div>'; return; }
    var rows = decisionRows();
    var pos = rows.map(function (x) { return x.id; }).indexOf(r.id);
    var g = GROUP_BY_KEY[r.group];
    panel.innerHTML = '<div class="pbar"><button type="button" class="btn small back" id="d-back">' + ICON.back + 'Back to the list</button><span class="tnum">Decision ' + (pos >= 0 ? num(pos + 1) + " of " + num(rows.length) : "") + '</span><span class="nav2"><button type="button" class="iconbtn" id="d-prev" aria-label="Previous decision">' + ICON.up + '</button><button type="button" class="iconbtn" id="d-nextitem" aria-label="Next decision in the list">' + ICON.down + "</button></span></div>" +
      '<div class="pbody" id="d-body"><div><div class="tags"><span class="tag ' + g.tag + '"><span class="pip" aria-hidden="true"></span>' + esc(g.label) + '</span><span class="tag tnum">' + esc(r.criterion) + '</span><span class="tag tnum">' + plural(r.pages, "page") + '</span></div><h2 class="ptitle" id="d-title" tabindex="-1">' + esc(r.title) + '</h2><p class="small muted">Loading the details…</p></div></div>' +
      '<div class="pfoot" id="d-foot"></div>';
    $("d-back").addEventListener("click", function () { $("d-split").classList.remove("has-sel"); history.replaceState(null, "", "#decisions"); var b = document.querySelector('#d-list button[data-id="' + state.d.sel + '"]'); if (b) b.focus(); });
    $("d-prev").addEventListener("click", function () { step(-1, false); });
    $("d-nextitem").addEventListener("click", function () { step(1, false); });
    if (focus === "panel") $("d-title").focus();
    details(r.id).then(function (d) { if (state.d.sel === r.id) fillDecision(r, d, focus); }).catch(function (e) {
      $("d-body").innerHTML = '<p class="err">The details did not load: ' + esc(e.message) + ". Reload the page.</p>";
    });
  }
  function step(dir, waitingOnly) {
    var rows = decisionRows();
    if (!rows.length) return;
    var at = rows.map(function (x) { return x.id; }).indexOf(state.d.sel);
    for (var k = 1; k <= rows.length; k++) {
      var next = rows[(at + dir * k + rows.length * 2) % rows.length];
      if (!waitingOnly || !next.done) { ensureShown(next.id); pickDecision(next.id, "panel"); return; }
    }
    announce("Nothing else waits for you in this list.");
  }
  function ensureShown(id) {
    var rows = decisionRows(); var at = rows.map(function (x) { return x.id; }).indexOf(id);
    if (at >= state.d.shown) { state.d.shown = Math.ceil((at + 1) / PAGE) * PAGE; drawDecisionList(); }
  }

  function opinionsHtml(d) {
    return d.ai.map(function (a) {
      var cls = a.value === "issue" ? "issue" : a.value === "no issue" ? "ok" : "unsure";
      var word = a.value === "issue" ? "Issue" : a.value === "no issue" ? "Not an issue" : a.value === "unsure" ? "Unsure" : a.value;
      return '<div class="box op"><div class="top"><span>' + esc(a.who) + "</span><span>" + esc(a.confidence) + ' confidence</span></div><span class="val ' + cls + '">' + esc(word) + "</span>" +
        (a.reason ? '<span class="muted">' + esc(a.reason) + "</span>" : "") + (a.facts.length ? "<ul>" + a.facts.map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + "</ul>" : "") + "</div>";
    }).join("");
  }
  function fillDecision(r, d, focus) {
    var isIssue = d.type === "issue";
    var answered = isIssue ? !!d.decision : !!(d.person || d.factsCheck);
    var locked = !isIssue && d.sample && !answered;
    var g = GROUP_BY_KEY[r.group];
    var body = '<div><div class="tags"><span class="tag ' + g.tag + '"><span class="pip" aria-hidden="true"></span>' + esc(g.label) + '</span><span class="tag">' + esc(d.criterion + " " + d.criterionName) + '</span><span class="tag tnum">' + plural(d.pages, "page") + "</span>" + (isIssue ? '<span class="tag">' + esc(d.who) + "</span>" : "") + "</div>" +
      '<h2 class="ptitle" id="d-title" tabindex="-1">' + esc(isIssue ? "Keep this issue, or close it? " + d.title : d.question) + "</h2>" +
      '<p class="mono where">' + esc((isIssue ? d.example.path : d.path) + (d.inState ? " · in a state, after an action" : "") + (isIssue ? " · " + d.id : "")) + "</p>" +
      (isIssue ? '<p class="muted">The review says: “' + esc(d.fix.summary) + "”</p>" : "") + "</div>";
    if (!isIssue && d.steps && d.steps.length) body += '<section aria-labelledby="d-steps-h"><h3 class="h3" id="d-steps-h">What to do</h3><ol class="box">' + d.steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol></section>";
    var img = isIssue ? d.example.image : d.image, url = isIssue ? d.example.url : d.url;
    body += '<section aria-labelledby="d-shot-h"><div class="shead"><h3 class="h3" id="d-shot-h">The element on the page</h3><a href="' + esc(safeUrl(url)) + '" target="_blank" rel="noopener">Open the page<span class="sr-only"> (opens a new tab)</span> ↗</a></div>' +
      (img ? '<figure class="shot"><img src="' + esc(img) + '" alt="A screenshot of the element on the page, with the area around it."></figure>' : '<p class="small muted">No screenshot for this item.</p>') + "</section>";
    if (!isIssue && d.counts) body += '<section aria-labelledby="d-counts-h"><h3 class="h3" id="d-counts-h">What counts as an issue</h3><p class="muted">' + esc(d.counts) + "</p></section>";
    if (isIssue) body += '<section aria-labelledby="d-wrong-h"><h3 class="h3" id="d-wrong-h">What the rule found</h3><p class="muted">' + esc(d.experience) + " It affects " + esc(d.affects) + ".</p></section>";
    if (!isIssue && d.ai.length) {
      var hint = locked ? "A sample question checks the AI. Its answers open after your answer." : d.unresolved ? "The two AI reviews did not agree, or one is unsure. Look at the page first, then open their answers if they help." : "Shown on request.";
      body += '<section class="disc"><h3><button type="button" class="disc-btn" id="d-ai-btn" aria-expanded="' + (state.aiOpen && !locked) + '" aria-controls="d-ai"' + (locked ? ' aria-disabled="true"' : "") + ">" + ICON.chevron + 'AI answers <span class="n tnum">' + d.ai.length + '</span></button></h3><p class="small muted" id="d-ai-hint">' + esc(hint) + "</p>" +
        '<div id="d-ai"' + (state.aiOpen && !locked ? "" : " hidden") + ' style="display:flex;flex-direction:column;gap:8px">' + opinionsHtml(d) +
        (d.factsButtons ? '<div class="factsrow"><span class="small muted">The facts of the first review:</span><button type="button" class="btn small" id="d-facts-ok">They are right</button><button type="button" class="btn small" id="d-facts-wrong">One is wrong: send back to the AI</button></div><p class="small muted">"One is wrong" needs a note that says which fact, and what you see.</p>' : "") + "</div></section>";
    }
    body += '<section class="disc"><h3><button type="button" class="disc-btn" id="d-raw-btn" aria-expanded="' + state.rawOpen + '" aria-controls="d-raw">' + ICON.chevron + "The element and the facts</button></h3><pre id=\"d-raw\"" + (state.rawOpen ? "" : " hidden") + ">" + esc(isIssue ? d.element : d.raw) + "</pre></section>";
    $("d-body").innerHTML = body;

    var answers = isIssue ? P_ANSWERS : Q_ANSWERS;
    var current = isIssue ? (d.decision ? d.decision.status : "") : (d.person ? d.person.value : "");
    var foot = '<div class="answers" role="group" aria-labelledby="d-ans-l"><span class="lbl" id="d-ans-l">Your answer</span>' +
      answers.map(function (a, k) { return '<button type="button" class="ans" data-value="' + esc(a.value) + '" aria-pressed="' + (current === a.value) + '"><span class="key" aria-hidden="true">' + (k + 1) + "</span>" + esc(a.label) + "</button>"; }).join("") + "</div>" +
      '<label class="field"><span>' + (isIssue ? "Reason" : "Note") + '</span><input type="text" id="d-note" placeholder="' + (isIssue ? "Needed to dismiss or accept" : d.factsButtons ? "Needed when a fact is wrong" : "Optional") + '" value="' + esc(isIssue ? (d.decision && d.decision.reason) || "" : (d.person && d.person.note) || "") + '"></label>' +
      '<div class="namebox" id="d-namebox" hidden><label class="field"><span>Your name</span><input type="text" id="d-name" autocomplete="name"></label><div class="row"><button type="button" class="btn primary" id="d-name-save">Save the name and the answer</button><span class="small muted">Your name goes with each answer.</span></div></div>' +
      '<div class="frow"><div class="fmsg"><span id="d-msg" role="status" aria-live="polite"></span><button type="button" class="linkish" id="d-change" hidden>Change</button>' + (answered ? "" : '<span class="hintline" id="d-keyhint">' + (keysOn() ? "Keys 1 to " + answers.length + " answer · they do nothing while you type · turn them off in the menu" : "") + "</span>") + "</div>" +
      '<button type="button" class="btn' + (answered ? " primary" : "") + '" id="d-next">' + (answered ? "Next decision" : "Skip") + "</button></div>";
    $("d-foot").innerHTML = foot;
    if (answered) showSaved(r, d);

    var aiBtn = $("d-ai-btn");
    if (aiBtn) aiBtn.addEventListener("click", function () {
      if (aiBtn.getAttribute("aria-disabled") === "true") { announce("The AI answers open after your answer."); return; }
      state.aiOpen = !state.aiOpen; aiBtn.setAttribute("aria-expanded", String(state.aiOpen)); $("d-ai").hidden = !state.aiOpen;
    });
    $("d-raw-btn").addEventListener("click", function () { state.rawOpen = !state.rawOpen; $("d-raw-btn").setAttribute("aria-expanded", String(state.rawOpen)); $("d-raw").hidden = !state.rawOpen; });
    $("d-foot").querySelectorAll("button.ans").forEach(function (b) { b.addEventListener("click", function () { answer(r, d, b.dataset.value); }); });
    var ok = $("d-facts-ok"), wrong = $("d-facts-wrong");
    if (ok) ok.addEventListener("click", function () { facts(r, d, "confirmed"); });
    if (wrong) wrong.addEventListener("click", function () { facts(r, d, "wrong"); });
    $("d-next").addEventListener("click", function () { step(1, answered || r.done); });
    $("d-change").addEventListener("click", function () { takeBack(r, d); });
    if (focus === "panel") $("d-title").focus();
  }

  // Saving. The name goes with each answer: the first answer asks for it.
  var pending = null;
  function withName(action) {
    if (getName()) return action(getName());
    pending = action;
    var box = $("d-namebox"); box.hidden = false; $("d-name").focus();
    $("d-name-save").onclick = function () {
      var v = $("d-name").value.trim();
      if (!v) { msg("Give your name first.", true); $("d-name").focus(); return; }
      setName(v); drawName(); box.hidden = true;
      var a = pending; pending = null; if (a) a(v);
    };
    $("d-name").onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); $("d-name-save").click(); } };
  }
  function msg(text, error) { var m = $("d-msg"); m.className = error ? "err" : ""; m.textContent = text; }
  function markDone(r, text) {
    var was = r.done; r.done = !!text; r.answer = text || "";
    if (r.done && !was) state.decisionsMade++;
    var tr = document.querySelector('#d-list tr[data-id="' + r.id + '"]');
    if (tr) { tr.classList.toggle("done", r.done); tr.querySelector(".c-status").innerHTML = '<span class="st"><span class="dot' + (r.done ? " done" : "") + '" aria-hidden="true"></span>' + (r.done ? "Done" : "Waiting") + "</span>"; }
    updateCounts();
  }
  function showSaved(r) {
    var m = $("d-msg"); m.className = "saved"; m.innerHTML = ICON.check + esc("Saved: " + r.answer + " · " + plural(left(), "decision") + " left");
    $("d-change").hidden = false;
    var next = $("d-next"); next.className = "btn primary"; next.textContent = "Next decision";
    var hint = $("d-keyhint"); if (hint) hint.hidden = true;
  }
  function answer(r, d, value) {
    var note = $("d-note").value.trim();
    if (d.type === "issue") {
      var a = P_ANSWERS.filter(function (x) { return x.value === value; })[0];
      if (a.needs && !note) { msg("Give a reason first, in the field above.", true); $("d-note").focus(); return; }
      withName(function (by) {
        post("/decide", { id: r.id, status: value, by: by, reason: note }).then(function () { afterSave(r, a.label, value); }).catch(function (e) { msg("Not saved: " + e.message + ". Try again.", true); });
      });
      return;
    }
    withName(function (by) {
      var label = Q_ANSWERS.filter(function (x) { return x.value === value; })[0].label;
      post("/answer", { id: r.id, value: value, by: by, note: note }).then(function () { afterSave(r, label, value); }).catch(function (e) { msg("Not saved: " + e.message + ". Try again.", true); });
    });
  }
  function facts(r, d, result) {
    var note = $("d-note").value.trim();
    if (result === "wrong" && !note) { msg("Say in the note which fact is wrong, and what you see.", true); $("d-note").focus(); return; }
    withName(function (by) {
      post("/facts", { id: r.id, result: result, by: by, note: note }).then(function () { afterSave(r, result === "confirmed" ? "The facts are right" : "A fact is wrong, sent back to the AI"); }).catch(function (e) { msg("Not saved: " + e.message + ". Try again.", true); });
    });
  }
  function afterSave(r, label, value) {
    delete cache[r.id];
    markDone(r, label);
    var inNote = document.activeElement && document.activeElement.id === "d-note";
    details(r.id).then(function (d) {
      if (state.d.sel !== r.id) return;
      // The panel draws again with the answer. The focus goes to the chosen answer, or to the next button after a check of the
      // facts, so that it is not lost. A person who typed a note keeps the focus in the note.
      fillDecision(r, d, null);
      if (inNote) { $("d-note").focus(); return; }
      var b = value ? $("d-foot").querySelector('button.ans[data-value="' + value + '"]') : null;
      (b || $("d-next")).focus();
    });
  }
  function takeBack(r, d) {
    var url = d.type === "issue" ? "/reopen" : "/clear";
    post(url, { id: r.id, by: getName() }).then(function () {
      delete cache[r.id];
      if (r.done) state.decisionsMade = Math.max(0, state.decisionsMade - 1);
      r.done = false; r.answer = "";
      markDone(r, "");
      details(r.id).then(function (nd) { fillDecision(r, nd, null); msg("The answer is taken back. " + plural(left(), "decision") + " left."); var b = $("d-foot").querySelector("button.ans"); if (b) b.focus(); });
    }).catch(function (e) { msg("Not changed: " + e.message + ". Try again.", true); });
  }

  // The issues: a list with filters, and the chosen issue beside it.
  function issueRows() {
    var s = state.i, term = s.search.toLowerCase();
    return DATA.issues.filter(function (i) {
      if (s.status === "open" && !OPEN[i.status]) return false;
      if (s.status === "new" && i.status !== "new") return false;
      if (s.status === "reopened" && i.status !== "reopened") return false;
      if (s.status === "decided" && i.status !== "accepted" && i.status !== "dismissed") return false;
      if (s.status === "resolved" && i.status !== "resolved") return false;
      if (s.who && i.who !== s.who) return false;
      if (s.sev && i.severity !== s.sev) return false;
      if (s.level && i.level !== s.level) return false;
      if (term && (i.title + " " + i.hint + " " + i.id + " " + i.criterion).toLowerCase().indexOf(term) < 0) return false;
      return true;
    });
  }
  function countBy(key, value) { return DATA.issues.filter(function (i) { return OPEN[i.status] && i[key] === value; }).length; }
  function renderIssues() {
    var view = $("view-issues");
    if (!view.dataset.built) {
      var whos = ["Content", "Development", "Design", "Vendor", "Not known yet"].filter(function (w) { return DATA.issues.some(function (i) { return i.who === w; }); });
      view.innerHTML = '<header class="vhead"><h1 tabindex="-1">Issues</h1><p class="vsum" id="i-sum"></p></header>' +
        '<div class="filters" role="search" aria-label="Filter the issues">' +
        '<label class="field search">' + ICON.search + '<span class="sr-only">Search the issues</span><input type="search" id="i-search" placeholder="Search"></label>' +
        '<label class="chip">Who fixes it <select id="i-who"><option value="">Any</option>' + whos.map(function (w) { return '<option value="' + esc(w) + '">' + esc(w) + " (" + countBy("who", w) + ")</option>"; }).join("") + "</select></label>" +
        '<label class="chip">Severity <select id="i-sev"><option value="">Any</option>' + ["critical", "serious", "moderate", "minor"].map(function (s) { return '<option value="' + s + '">' + SEVERITY_LABEL[s] + " (" + countBy("severity", s) + ")</option>"; }).join("") + "</select></label>" +
        '<label class="chip">WCAG <select id="i-level"><option value="">A and AA</option><option value="A">Level A (' + countBy("level", "A") + ')</option><option value="AA">Level AA (' + countBy("level", "AA") + ")</option></select></label>" +
        '<label class="chip">Status <select id="i-status"><option value="open">Open</option><option value="new">New in this audit</option><option value="reopened">Reopened</option><option value="decided">Accepted or dismissed</option><option value="resolved">Resolved in this audit</option><option value="all">All</option></select></label>' +
        '<span class="fcount tnum" id="i-count" aria-live="polite"></span></div>' +
        '<div class="split" id="i-split"><section class="list" aria-label="The list of issues"><div class="card" id="i-list"></div></section><aside class="panel" id="i-panel" aria-label="The chosen issue"></aside></div>';
      view.dataset.built = "1";
      $("i-search").addEventListener("input", function (e) { state.i.search = e.target.value; state.i.shown = PAGE; drawIssueList(); });
      [["i-who", "who"], ["i-sev", "sev"], ["i-level", "level"], ["i-status", "status"]].forEach(function (p) { $(p[0]).addEventListener("change", function (e) { state.i[p[1]] = e.target.value; state.i.shown = PAGE; replaceHash(); drawIssueList(); }); });
    }
    $("i-who").value = state.i.who; $("i-sev").value = state.i.sev; $("i-level").value = state.i.level; $("i-status").value = state.i.status; $("i-search").value = state.i.search;
    drawIssueList();
  }
  function drawIssueList() {
    var rows = issueRows(), s = state.i;
    var openCount = DATA.issues.filter(function (i) { return OPEN[i.status]; }).length;
    $("i-sum").textContent = plural(openCount, "issue") + " open · " + num(DATA.issues.filter(function (i) { return i.status === "new"; }).length) + " new in this audit";
    if (!narrow.matches && (!s.sel || !DATA.issues.some(function (i) { return i.id === s.sel; }))) s.sel = rows[0] ? rows[0].id : null;
    $("i-count").textContent = num(rows.length) + (rows.length === 1 ? " issue" : " issues");
    var shown = rows.slice(0, s.shown), html;
    if (!rows.length) html = '<p class="empty">No issue matches the filters.</p>';
    else {
      html = '<table class="tbl"><caption class="sr-only">Issues, by severity, then by pages. Choose one to see it beside the list.</caption><thead><tr><th scope="col">Issue</th><th scope="col" class="c-sev">Severity</th><th scope="col" class="num c-pages">Pages</th><th scope="col" class="c-who">Who fixes it</th><th scope="col" class="c-wcag">WCAG</th></tr></thead><tbody>' +
        shown.map(function (i) {
          var sel = i.id === s.sel;
          var sub = [STATUS_LABEL[i.status] || i.status, i.decision && !OPEN[i.status] ? "" : i.decision, i.hint].filter(Boolean).join(" · ");
          return '<tr class="item' + (sel ? " sel" : "") + '" data-id="' + esc(i.id) + '"><td><button type="button" class="rowbtn" data-id="' + esc(i.id) + '"' + (sel ? ' aria-current="true"' : "") + '><span class="t">' + esc(i.title) + '</span><span class="h">' + esc(sub) + "</span></button></td><td class=\"c-sev\">" + sevMark(i.severity) + '</td><td class="num tnum c-pages">' + num(i.pages) + '</td><td class="c-who"><span class="who-chip">' + esc(i.who) + '</span></td><td class="tnum c-wcag">' + esc(i.criterion) + "</td></tr>";
        }).join("") + "</tbody></table>";
      if (rows.length > shown.length) html += '<div class="list-foot"><span>' + num(shown.length) + " of " + num(rows.length) + ' shown</span><button type="button" class="btn small" id="i-more">Show ' + Math.min(PAGE, rows.length - shown.length) + " more</button></div>";
    }
    $("i-list").innerHTML = html;
    $("i-list").querySelectorAll("button.rowbtn").forEach(function (b) { b.addEventListener("click", function () { pickIssue(b.dataset.id, narrow.matches ? "panel" : "row"); }); });
    var more = $("i-more"); if (more) more.addEventListener("click", function () { s.shown += PAGE; drawIssueList(); var btns = $("i-list").querySelectorAll("button.rowbtn"); if (btns[s.shown - PAGE]) btns[s.shown - PAGE].focus(); });
    $("i-split").classList.toggle("has-sel", !!s.sel && narrow.matches && !!parseHash().id);
    drawIssuePanel();
  }
  function pickIssue(id, focus) {
    state.i.sel = id; state.open = {};
    replaceHash();
    document.querySelectorAll("#i-list tr.item").forEach(function (tr) { var on = tr.dataset.id === id; tr.classList.toggle("sel", on); var b = tr.querySelector("button"); if (on) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current"); });
    $("i-split").classList.toggle("has-sel", narrow.matches);
    drawIssuePanel(focus);
  }
  function issueRow(id) { for (var k = 0; k < DATA.issues.length; k++) if (DATA.issues[k].id === id) return DATA.issues[k]; return null; }
  var drawnIssue = null;
  function drawIssuePanel(focus) {
    var panel = $("i-panel"), r = issueRow(state.i.sel);
    if (r && r.id !== drawnIssue) { state.open = {}; drawnIssue = r.id; }
    if (!r) { panel.innerHTML = '<div class="pbody"><p class="muted">Choose an issue in the list.</p></div>'; return; }
    var rows = issueRows(), pos = rows.map(function (x) { return x.id; }).indexOf(r.id);
    panel.innerHTML = '<div class="pbar"><button type="button" class="btn small back" id="i-back">' + ICON.back + 'Back to the list</button><span class="ids">' + esc(r.id) + '</span><span aria-hidden="true" style="color:var(--sep)">/</span><span class="tnum">' + (pos >= 0 ? num(pos + 1) + " of " + num(rows.length) : "not in the list") + '</span><span class="nav2"><button type="button" class="iconbtn" id="i-prev" aria-label="Previous issue">' + ICON.up + '</button><button type="button" class="iconbtn" id="i-next" aria-label="Next issue">' + ICON.down + "</button></span></div>" +
      '<div class="pbody" id="i-body"><div><h2 class="ptitle" id="i-title" tabindex="-1">' + esc(r.title) + '</h2><p class="small muted">Loading the details…</p></div></div><div class="pfoot" id="i-foot"></div>';
    $("i-back").addEventListener("click", function () { $("i-split").classList.remove("has-sel"); state.i.sel = state.i.sel; history.replaceState(null, "", "#issues"); var b = document.querySelector('#i-list button[data-id="' + r.id + '"]'); if (b) b.focus(); });
    $("i-prev").addEventListener("click", function () { stepIssue(-1); });
    $("i-next").addEventListener("click", function () { stepIssue(1); });
    if (focus === "panel") $("i-title").focus();
    details(r.id).then(function (d) { if (state.i.sel === r.id) fillIssue(r, d, focus); }).catch(function (e) { $("i-body").innerHTML = '<p class="err">The details did not load: ' + esc(e.message) + ". Reload the page.</p>"; });
  }
  function stepIssue(dir) {
    var rows = issueRows(); if (!rows.length) return;
    var at = rows.map(function (x) { return x.id; }).indexOf(state.i.sel);
    var next = rows[(at + dir + rows.length) % rows.length];
    var idx = rows.indexOf(next);
    if (idx >= state.i.shown) { state.i.shown = Math.ceil((idx + 1) / PAGE) * PAGE; drawIssueList(); }
    pickIssue(next.id, "panel");
  }
  function disclosure(key, label, body) {
    var open = !!state.open[key];
    return '<div class="disc"><h3><button type="button" class="disc-btn" data-disc="' + key + '" aria-expanded="' + open + '" aria-controls="i-d-' + key + '">' + ICON.chevron + esc(label) + "</button></h3><div id=\"i-d-" + key + '"' + (open ? "" : " hidden") + ">" + body + "</div></div>";
  }
  function fillIssue(r, d, focus) {
    var sevHigh = d.severity === "critical" || d.severity === "serious";
    var statusText = d.decision ? (d.decision.status === "kept" ? (STATUS_LABEL[d.status] || d.status) + " · " : "") + d.decisionText + " by " + d.decision.by + " on " + d.decision.date
      : (STATUS_LABEL[d.status] || d.status) + (d.status === "resolved" && d.reason ? " (" + d.reason + ")" : "");
    var body = '<div><div class="tags"><span class="tag' + (sevHigh ? " sev-high" : "") + '">' + sevMark(d.severity) + '</span><span class="tag">' + esc(d.criterion + " " + d.criterionName) + '</span><span class="tag tnum">' + plural(d.pages, "page") + '</span><span class="tag">' + esc(d.who) + "</span></div>" +
      '<h2 class="ptitle" id="i-title" tabindex="-1">' + esc(d.title) + '</h2><p class="small muted">' + esc(d.certainty + " · " + statusText) + "</p></div>" +
      '<section aria-labelledby="i-wrong-h"><h3 class="h3" id="i-wrong-h">What is wrong</h3><p>' + esc(d.experience) + '</p><p class="muted">It affects ' + esc(d.affects) + ".</p>" + (d.rule ? '<p class="small muted">The rule: ' + esc(d.rule) + "</p>" : "") +
      (d.proposal ? '<p class="muted">The review found no change to make. It asks a person to keep the issue or to close it, in Decisions.</p>' : "") + "</section>" +
      '<section aria-labelledby="i-ex-h"><h3 class="h3" id="i-ex-h">Example</h3><p class="mono" style="overflow-wrap:anywhere"><a href="' + esc(safeUrl(d.example.url)) + '" target="_blank" rel="noopener">' + esc(d.example.path) + '<span class="sr-only"> (opens a new tab)</span> ↗</a></p>' +
      (d.example.width || d.example.state ? '<p class="small muted">' + esc([d.example.width ? d.example.width + " px" : "", d.example.state ? "after: " + d.example.state : ""].filter(Boolean).join(" · ")) + "</p>" : "") +
      (d.example.image ? '<figure class="shot"><img src="' + esc(d.example.image) + '" alt="A screenshot of the element on the page."></figure>' : '<p class="small muted">No screenshot for this issue.</p>') + "</section>" +
      '<section aria-labelledby="i-src-h"><h3 class="h3" id="i-src-h">Where it comes from</h3><p class="muted">' + esc(originText(d.origin)) + "</p>" +
      (d.source.length ? '<ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px">' + d.source.map(function (s) { return '<li class="mono" style="overflow-wrap:anywhere">' + esc(s.text) + (s.edit ? ' <a href="' + esc(safeUrl(s.edit)) + '" target="_blank" rel="noopener" style="font-family:inherit">Edit<span class="sr-only"> in the CMS (opens a new tab)</span> ↗</a>' : "") + "</li>"; }).join("") + "</ul>" : "") +
      (d.sourceWarning ? '<p class="small muted">' + esc(d.sourceWarning) + "</p>" : "") + "</section>" +
      '<section aria-labelledby="i-fix-h"><h3 class="h3" id="i-fix-h">' + (d.proposal ? "The review" : "The fix" + (d.fix.specific ? "" : ", general")) + '</h3><div class="box" style="display:flex;flex-direction:column;gap:8px"><p style="font-weight:500">' + esc(d.fix.summary) + "</p>" +
      (d.fix.steps.length ? "<ol>" + d.fix.steps.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol>" : "") + "</div></section>" +
      "<div>" + (d.fix.example ? disclosure("code", "Code example", "<pre>" + esc(d.fix.example) + "</pre>") : "") +
      disclosure("element", "The element", "<pre>" + esc(d.element) + "</pre>") +
      disclosure("pages", "Pages (" + num(d.pages) + ")", '<ul style="margin:0;padding-left:18px">' + d.paths.map(function (p) { return '<li class="mono">' + esc(p) + "</li>"; }).join("") + "</ul>" + (d.pages > d.paths.length ? '<p class="small muted">The examples of ' + plural(d.pages, "page") + ". The issue file lists where it comes from.</p>" : "")) +
      (d.fix.expected ? disclosure("expected", "Expected result", "<p>" + esc(d.fix.expected) + "</p>") : "") + "</div>";
    $("i-body").innerHTML = body;
    $("i-body").querySelectorAll("button[data-disc]").forEach(function (b) { b.addEventListener("click", function () { var k = b.dataset.disc; state.open[k] = !state.open[k]; b.setAttribute("aria-expanded", String(state.open[k])); $("i-d-" + k).hidden = !state.open[k]; }); });

    var decided = d.decision && (d.status === "accepted" || d.status === "dismissed" || d.decision.status === "kept");
    var canDecide = OPEN[d.status] && !decided;
    var foot = "";
    if (canDecide) foot += '<p class="small muted">Only when the issue will not be fixed. The next audit keeps the decision.</p><label class="field"><span>Reason</span><input type="text" id="i-reason" placeholder="For example: a false positive"></label>' +
      '<div class="namebox" id="i-namebox" hidden><label class="field"><span>Your name</span><input type="text" id="i-name" autocomplete="name"></label><div class="row"><button type="button" class="btn primary" id="i-name-save">Save the name and the decision</button></div></div>' +
      '<div class="frow"><button type="button" class="btn" id="i-accept">Accept as a known risk</button><button type="button" class="btn" id="i-dismiss">Dismiss</button></div>';
    foot += '<div class="frow"><span id="i-msg" role="status" aria-live="polite"></span>' + (decided ? '<button type="button" class="linkish" id="i-undo">Undo</button>' : "") + "</div>";
    $("i-foot").innerHTML = foot;
    if (decided) { var m = $("i-msg"); m.className = "saved"; m.innerHTML = ICON.check + esc(d.decisionText + " by " + d.decision.by + (d.decision.reason ? ": " + d.decision.reason : "") + "." + (d.decision.status === "kept" ? " The next locate step writes a fix." : " The issue leaves the open list.")); }
    if (canDecide) {
      $("i-accept").addEventListener("click", function () { decideIssue(r, "accepted"); });
      $("i-dismiss").addEventListener("click", function () { decideIssue(r, "dismissed"); });
    }
    var undo = $("i-undo"); if (undo) undo.addEventListener("click", function () { undoIssue(r); });
    if (focus === "panel") $("i-title").focus();
  }
  function originText(o) {
    return { content: "The content of a page: an editor can fix it in the CMS.", media: "A media file: an image, a document, or a video.", code: "The code of the theme or of a plugin.", configuration: "A setting of the site or of a plugin.", design: "The design: the colors, the sizes, or the layout.", "third-party-controlled": "A third-party part that the site sets up.", "third-party-uncontrolled": "A third-party part that only its vendor can change.", unknown: "Not known yet: the next locate step looks for it." }[o] || o;
  }
  function decideIssue(r, status) {
    var reason = $("i-reason").value.trim(), m = $("i-msg");
    if (!reason) { m.className = "err"; m.textContent = "Give a reason first."; $("i-reason").focus(); return; }
    var go = function (by) {
      post("/decide", { id: r.id, status: status, by: by, reason: reason }).then(function () {
        r.status = status; r.decision = status === "accepted" ? "Accepted as a known risk" : "Dismissed";
        state.decisionsMade++;
        var dr = rowOf(r.id); if (dr) { dr.done = true; dr.answer = r.decision; }
        delete cache[r.id]; updateCounts();
        var tr = document.querySelector('#i-list tr[data-id="' + r.id + '"] .h'); if (tr) tr.textContent = STATUS_LABEL[status];
        details(r.id).then(function (d) { fillIssue(r, d, null); var u = $("i-undo"); if (u) u.focus(); });
      }).catch(function (e) { m.className = "err"; m.textContent = "Not saved: " + e.message + ". Try again."; });
    };
    if (getName()) return go(getName());
    var box = $("i-namebox"); box.hidden = false; $("i-name").focus();
    $("i-name-save").onclick = function () { var v = $("i-name").value.trim(); if (!v) { m.className = "err"; m.textContent = "Give your name first."; $("i-name").focus(); return; } setName(v); drawName(); box.hidden = true; go(v); };
  }
  function undoIssue(r) {
    post("/reopen", { id: r.id, by: getName() }).then(function () {
      r.status = "open"; r.decision = "";
      state.decisionsMade = Math.max(0, state.decisionsMade - 1);
      var dr = rowOf(r.id); if (dr) { dr.done = false; dr.answer = ""; }
      delete cache[r.id]; updateCounts();
      details(r.id).then(function (d) { fillIssue(r, d, null); var m = $("i-msg"); m.className = ""; m.textContent = "The decision is taken back. The issue is open."; var a = $("i-accept"); if (a) a.focus(); });
    }).catch(function (e) { var m = $("i-msg"); m.className = "err"; m.textContent = "Not changed: " + e.message + ". Try again."; });
  }

  // The name and the keys in the side bar.
  function drawName() {
    var n = getName();
    $("who-name").textContent = n || "No name yet";
    $("who-avatar").textContent = (n || "?").trim().charAt(0).toUpperCase() || "?";
    $("who-change").textContent = n ? "Change" : "Add";
    $("who-change").setAttribute("aria-label", n ? "Change your name" : "Add your name");
  }
  function drawKeys() { var on = keysOn(); var b = $("keys-toggle"); b.setAttribute("aria-pressed", String(on)); b.textContent = on ? "On" : "Off"; }
  $("who-change").addEventListener("click", function () { $("name-form").hidden = false; $("name-input").value = getName(); $("name-input").focus(); });
  $("name-form").addEventListener("submit", function (e) { e.preventDefault(); setName($("name-input").value.trim()); drawName(); $("name-form").hidden = true; $("who-change").focus(); announce("Your name is saved."); });
  $("name-cancel").addEventListener("click", function () { $("name-form").hidden = true; $("who-change").focus(); });
  $("keys-toggle").addEventListener("click", function () { setKeys(!keysOn()); drawKeys(); announce(keysOn() ? "The keys 1 to 3 answer a decision." : "The keys 1 to 3 do nothing now."); var hint = $("d-keyhint"); if (hint) hint.textContent = keysOn() ? "Keys 1 to 3 answer · they do nothing while you type · turn them off in the menu" : ""; });

  // The keys 1 to 3 answer the decision on the screen. They do nothing in a text field, with a modifier, or when they are off.
  document.addEventListener("keydown", function (e) {
    if (state.view !== "decisions" || !keysOn() || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    var t = e.target, tag = (t && t.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || (t && t.isContentEditable)) return;
    if (!/^[1-3]$/.test(e.key)) return;
    var b = $("d-foot") && $("d-foot").querySelectorAll("button.ans")[Number(e.key) - 1];
    if (b) { e.preventDefault(); b.click(); }
  });

  $("refresh").addEventListener("click", function () {
    var t = $("stale-text"); t.textContent = "Refreshing the report…";
    post("/refresh", {}).then(function () { location.reload(); }).catch(function (e) { t.textContent = "Not refreshed: " + e.message + ". Try again."; });
  });

  function route(focus) {
    var h = parseHash();
    var view = h.view || (left() ? "decisions" : "overview");
    if (view === "decisions" && h.id) state.d.sel = h.id;
    if (view === "issues") {
      if (h.id) state.i.sel = h.id;
      if (h.params.has("who")) state.i.who = h.params.get("who");
      if (h.params.has("severity")) state.i.sev = h.params.get("severity");
      if (h.params.has("level")) state.i.level = h.params.get("level");
      if (h.params.has("status")) state.i.status = h.params.get("status");
    }
    show(view, focus);
    if (h.id && narrow.matches) { var t = $(view === "issues" ? "i-title" : "d-title"); if (t && focus) t.focus(); }
  }
  window.addEventListener("hashchange", function () { route(true); });
  narrow.addEventListener("change", function () { if (state.view === "decisions") drawDecisionList(); if (state.view === "issues") drawIssueList(); });
  drawName(); drawKeys(); updateCounts();
  route(false);
})();
