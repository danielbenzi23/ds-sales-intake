/* Pricing calculator for the sales intake page.
   Engine: PRICING MATRIX.xlsx (beta v0.3) tiers, minimums, protected-floor curve and installation bands (Standard),
   plus Woody's model v2 for Enterprise (platform base + one line per tech stack component, editable placeholder rates).
   Prefills from the intake: FTE (HubSpot company), SIS / CRM / degree audit (items 5 and 6), scope flags (items 1, 2, 3, 16
   and the install-base specialist rules). Approval is gated by the Sales Checklist: the five QUOTE items must be answered,
   FTE must be known, and custom scope needs a Solutions Engineer review. State is saved inside the intake answers. */
window.DSCalc = (function () {
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var money = function (n) { return '$' + Math.round(Number(n) || 0).toLocaleString('en-US'); };
  var fmt = function (n) { return Number(n || 0).toLocaleString('en-US'); };

  /* ---------- engine (PRICING MATRIX.xlsx) ---------- */
  var TIERS = [
    { id: 1, lo: 0, hi: 1500, r: { Inbound: 5, Insight: 15 } },
    { id: 2, lo: 1501, hi: 5000, r: { Inbound: 5, Insight: 14.5 } },
    { id: 3, lo: 5001, hi: 10000, r: { Inbound: 5, Insight: 11 } },
    { id: 4, lo: 10001, hi: 15000, r: { Inbound: 4, Insight: 10 } },
    { id: 5, lo: 15001, hi: 20000, r: { Inbound: 3.9, Insight: 9 } },
    { id: 6, lo: 20001, hi: 30000, r: { Inbound: 3.8, Insight: 8 } },
    { id: 7, lo: 30001, hi: Infinity, r: { Inbound: 3.7, Insight: 7.75 } }
  ];
  var MIN = { Inbound: 6000, Insight: 25000 };
  var CURVE = { Inbound: { b: 60, e: 0.73, lo: 18000, hi: 100000 }, Insight: { b: 80, e: 0.745, lo: 25000, hi: 150000 }, Planner: { b: 250, e: 0.73, lo: 100000, hi: 500000 } };
  var LINES = [
    { key: 'Installation', label: 'One-Time Installation', oneTime: true },
    { key: 'Inbound', label: 'DegreeSight "Inbound" - Annual License' },
    { key: 'Insight', label: 'DegreeSight "Insight" - Annual License' },
    { key: 'Planner', label: 'DegreeSight "Planner" - Annual License' },
    { key: 'Consultative Services', label: 'Consultative Services', oneTime: true },
    { key: 'Custom', label: '', custom: true },
    { key: 'Custom development', label: 'Custom Development (scoped by Solutions Engineering)', oneTime: true, rom: true }
  ];
  function tierFor(f) { for (var i = 0; i < TIERS.length; i++) if (f >= TIERS[i].lo && f <= TIERS[i].hi) return TIERS[i]; return TIERS[0]; }
  function installFor(f) { return f < 2500 ? 22500 : f < 8000 ? 25000 : f < 15000 ? 27500 : 35000; }
  function tierPrice(key, f) { var t = tierFor(f); if (!(key in t.r)) return null; return Math.max(t.r[key] * f, MIN[key] || 0); }
  function curvePrice(key, f) { var c = CURVE[key]; if (!c) return null; return Math.min(c.hi, Math.max(c.lo, c.b * Math.pow(f, c.e))); }
  function retail(key, f, prot) {
    if (key === 'Installation') return installFor(f);
    if (key === 'Consultative Services') return 5000;
    if (key === 'Custom') return 0;
    var tp = tierPrice(key, f), cp = curvePrice(key, f);
    return (prot && cp !== null) ? cp : (tp !== null ? tp : (cp || 0));
  }

  /* Enterprise tech stack catalog (annual integration rate per component; editable until the rate card is signed) */
  var STACK = {
    sis: [['Banner', 12000], ['Colleague', 12000], ['PeopleSoft', 15000], ['Jenzabar', 10000], ['PowerCampus', 10000], ['Anthology Student', 12000], ['Workday Student', 18000], ['Homegrown / other', 20000]],
    crm: [['None', 0], ['Slate', 6000], ['Salesforce', 8000], ['HubSpot', 4000], ['Element451', 6000], ['TargetX', 7000], ['Other', 8000]],
    audit: [['None', 0], ['Degree Works', 9000], ['DARS / uAchieve', 10000], ['Stellic', 8000], ['Other', 10000]]
  };
  var PORTAL_RATE = 12000, CAMPUS_RATE = 15000, ENT_BASE = 60000;
  var MAP_SIS = { 'Colleague': 'Colleague', 'Banner': 'Banner', 'PeopleSoft': 'PeopleSoft', 'Workday Student': 'Workday Student', 'Jenzabar J1': 'Jenzabar', 'Jenzabar CX': 'Jenzabar', 'SAP': 'Homegrown / other', 'Anthology / CampusNexus / CampusVue': 'Anthology Student', 'Ellucian PowerCampus': 'PowerCampus', 'Homegrown or other': 'Homegrown / other' };
  var MAP_CRM = { 'Slate': 'Slate', 'Salesforce (standard)': 'Salesforce', 'Salesforce Education Cloud': 'Salesforce', 'TargetX': 'TargetX', 'Element 451': 'Element451', 'HubSpot': 'HubSpot', 'None': 'None', 'Ellucian Recruit': 'Other', 'Radius': 'Other', 'EAB Navigate': 'Other', 'Generic SFTP CRM': 'Other' };
  var MAP_AUDIT = { 'DegreeWorks': 'Degree Works', 'uAchieve / DARS': 'DARS / uAchieve', 'Stellic': 'Stellic', 'Built into SIS': 'None', 'None': 'None' };
  function stackRate(kind, name) { var hit = STACK[kind].filter(function (r) { return r[0] === name; })[0]; return hit ? hit[1] : STACK[kind][STACK[kind].length - 1][1]; }

  /* Scope check: jobs-to-be-done questions. Routine prices on Standard; enterprise on the tech stack; custom needs an SE. */
  var SCOPE = [
    { q: 'campuses', level: 'enterprise', label: 'More than one campus or institution in the system' },
    { q: 'portals', level: 'enterprise', label: 'More than one portal (separate URLs, catalogs or roles)' },
    { q: 'cross', level: 'custom', label: 'People who work across portals' },
    { q: 'dashboard', level: 'custom', label: 'Central reporting dashboard across campuses' },
    { q: 'docs', level: 'custom', label: 'Document types beyond transcripts (JST, military, high school OCR)' },
    { q: 'integration', level: 'custom', label: 'Integration or tech stack that needs a specialist' },
    { q: 'custom', level: 'custom', label: 'Client asked for a feature we do not have today' },
    { q: 'unknown', level: 'custom', label: 'Not sure what they need (no transcript, no notes)' }
  ];

  var P = null, host = null, mounted = false;

  function I() { return host ? host.values() : {}; }
  function dossier() { return host ? host.dossier() : {}; }
  function has(arr, v) { return Array.isArray(arr) && arr.indexOf(v) >= 0; }

  function autoScope() {
    var v = I(), a = host ? host.assess() : { flags: [] }, out = {};
    if (v.pop_same_systems === 'No') out.campuses = 'Item 1: not every population is on the same SIS and CRM';
    if (v.pop_diff_rules === 'Yes') out.portals = 'Item 1: different rules, catalogs or minimum grades by group';
    var docs = [];
    if (v.hs_scope === 'In: bulk feed') docs.push('high school bulk feed (item 2)');
    if (v.hs_beyond_printed === 'Yes') docs.push('high school beyond GPA as printed (item 2)');
    if (v.military === 'Read the JST (roadmap)') docs.push('reading the JST (item 3)');
    if (docs.length) out.docs = docs.join('; ');
    var spec = (a.flags || []).filter(function (f) { return f.level === 'specialist'; });
    if (spec.length) out.integration = 'Install-base rules: ' + spec.map(function (f) { return f.text; }).join(' ');
    if (v.all_ga === 'Roadmap items present') out.custom = 'Item 16: roadmap items in the proposal' + (v.roadmap_items ? ' (' + v.roadmap_items + ')' : '');
    return out;
  }
  function scopeOn(q) { var o = P.scopeOverride[q]; if (o === true || o === false) return o; return !!autoScope()[q]; }
  function scopeLevel() {
    var lvl = 'routine';
    SCOPE.forEach(function (s) { if (!scopeOn(s.q)) return; if (s.level === 'custom') lvl = 'custom'; else if (lvl === 'routine') lvl = 'enterprise'; });
    return lvl;
  }
  function romExpected() { var r = P.rom; return r.lo + (r.p / 100) * Math.max(0, r.hi - r.lo); }

  function newOption(name, term, prods) {
    var lines = {};
    LINES.forEach(function (l) { lines[l.key] = { on: prods.indexOf(l.key) >= 0, price: null, conc: 0, reason: '' }; });
    return { name: name, term: term, prot: true, lines: lines, customName: '' };
  }
  function abbrFrom(name) {
    name = String(name || '').replace(/\s+-\s+.*$/, '');
    var words = name.split(/\s+/).filter(function (w) { return w && !/^(of|the|and|at|in|for)$/i.test(w); });
    if (words.length <= 1) return name;
    return words.map(function (w) { return w[0].toUpperCase(); }).join('');
  }
  function fresh() {
    var d = dossier(), inst = d.institution || {}, v = I();
    var f = parseInt(String(inst.fte || '').replace(/[^0-9]/g, ''), 10) || 0;
    var p = {
      v: 1, tab: 'standard', fte: f, fteSource: f ? 'HubSpot company' : '', inst: inst.name || (d.deal || {}).name || '', abbr: abbrFrom(inst.name || ''),
      opts: [newOption('Option 1: Inbound, 1 year', 12, ['Installation', 'Inbound']), newOption('Option 2: Inbound + Insight, 3 years', 36, ['Installation', 'Inbound', 'Insight']), newOption('Option 3: Inbound + Insight, 5 years', 60, ['Installation', 'Inbound', 'Insight'])],
      primary: 1, cur: 1,
      ent: { base: ENT_BASE, campuses: 1, portals: 1, sis: MAP_SIS[v.sis_name] || 'Homegrown / other', crm: MAP_CRM[v.crm_name] || 'None', audit: MAP_AUDIT[v.audit_engine] || 'None', rate: {} },
      scopeOverride: {}, rom: { lo: 15000, hi: 120000, p: 30 }, seReviewed: false,
      flags: { lock: true, roi: true, tcv: false, disc: false, check: false, msa: true }, eff: { mode: 'execution', date: '', other: '' }, note: '',
      status: 'draft', approvedBy: '', approvedAt: ''
    };
    p.ent.stackFromIntake = !!(v.sis_name || v.crm_name || v.audit_engine);
    return p;
  }

  function entRows() {
    var e = P.ent, r = e.rate || {};
    var rate = function (k, d) { return r[k] != null ? r[k] : d; };
    return [
      { key: 'sis', name: 'SIS integration: ' + e.sis, rate: rate('sis', stackRate('sis', e.sis)), qty: 1 },
      { key: 'crm', name: 'CRM lead delivery: ' + e.crm, rate: rate('crm', stackRate('crm', e.crm)), qty: e.crm === 'None' ? 0 : 1 },
      { key: 'audit', name: 'Degree audit sync: ' + e.audit, rate: rate('audit', stackRate('audit', e.audit)), qty: e.audit === 'None' ? 0 : 1 },
      { key: 'portals', name: 'Additional portal', rate: rate('portals', PORTAL_RATE), qty: Math.max(0, e.portals - 1) },
      { key: 'campuses', name: 'Additional campus', rate: rate('campuses', CAMPUS_RATE), qty: Math.max(0, e.campuses - 1) }
    ];
  }
  function entTotal() { return entRows().reduce(function (t, r) { return t + (Number(r.rate) || 0) * (Number(r.qty) || 0); }, Number(P.ent.base) || 0); }
  function visibleLines() { var lvl = scopeLevel(); return LINES.filter(function (l) { return !l.rom || lvl === 'custom'; }); }
  function lineRetail(o, key) {
    if (P.tab === 'enterprise' && key === 'Inbound') return entTotal();
    if (key === 'Custom development') return romExpected();
    return retail(key, P.fte, o.prot);
  }
  function lineLabel(o, l) { return l.custom ? (o.customName || 'Custom line') : l.label.replace(/^DegreeSight "(\w+)" - Annual License$/, '$1'); }
  function totals(o) {
    var annual = 0, oneTime = 0, retailAnnual = 0, rows = [], custom = scopeLevel() === 'custom';
    visibleLines().forEach(function (l) {
      var st = o.lines[l.key]; var on = l.rom ? custom : st.on; if (!on) return;
      var rt = lineRetail(o, l.key), price = st.price == null ? Math.round(rt) : st.price, q = price * (1 - (st.conc || 0) / 100);
      if (l.oneTime) oneTime += q; else { annual += q; retailAnnual += rt; }
      rows.push({ key: l.key, label: lineLabel(o, l), rt: rt, q: q, conc: st.conc, reason: st.reason, oneTime: !!l.oneTime });
    });
    var years = o.term / 12;
    return { annual: annual, oneTime: oneTime, retailAnnual: retailAnnual, rows: rows, years: years, tcv: annual * years + oneTime };
  }

  /* ---------- gate: what we need before a number goes out ---------- */
  function gate() {
    var a = host ? host.assess() : { quoteMissing: [], quoteReady: true };
    var names = { q1: 'Item 1: populations and rules', q5: 'Item 5: SIS, hosting, replacement', q7: 'Item 7: what they expect written back', q8: 'Item 8: does integration gate go-live', q13: 'Item 13: what live means, and the date' };
    var lvl = scopeLevel(), prim = P.opts[P.primary], pt = prim ? totals(prim) : { rows: [] };
    var checks = [
      { ok: a.quoteReady, text: a.quoteReady ? 'All five QUOTE items answered in the intake' : 'QUOTE items missing in the intake', items: (a.quoteMissing || []).map(function (q) { return { id: q, t: names[q] || q }; }) },
      { ok: P.fte > 0, text: P.fte > 0 ? 'FTE set (' + fmt(P.fte) + (P.fteSource ? ', from ' + P.fteSource : '') + ')' : 'FTE missing: enter it above' },
      { ok: pt.rows.some(function (r) { return !r.oneTime; }), text: 'Primary option has at least one annual license' },
      { ok: lvl !== 'custom' || P.seReviewed, text: lvl === 'custom' ? (P.seReviewed ? 'Solutions Engineer reviewed the custom scope' : 'Custom scope: a Solutions Engineer must review it first') : 'No custom development in scope' }
    ];
    return { checks: checks, ok: checks.every(function (c) { return c.ok; }) };
  }

  function touch(keepStatus) {
    if (!keepStatus && P.status === 'approved') { P.status = 'draft'; P.approvedBy = ''; P.approvedAt = ''; }
    if (host) host.dirty();
    render();
  }

  /* ---------- render ---------- */
  function render() {
    if (!mounted || !P) return;
    var box = $('pricing'); if (!box || box.hidden) return;
    var lvl = scopeLevel(), auto = autoScope(), o = P.opts[P.cur], g = gate(), v = I();
    var h = '<div class="calc-wrap">';
    // status + gate
    h += '<aside class="left calc-left">';
    h += '<div class="card gate ' + (P.status === 'approved' ? 'ready' : g.ok ? 'ready' : 'hold') + '"><div class="gate-top"><div><div class="lbl">' +
      (P.status === 'approved' ? 'Pricing approved' : g.ok ? 'Ready to approve' : 'Not ready to quote') + '</div><div class="sub">' +
      (P.status === 'approved' ? 'by ' + esc(P.approvedBy) + ', ' + new Date(P.approvedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Before a number goes out') + '</div></div></div>' +
      '<ul class="qlist">' + g.checks.map(function (c) {
        return '<li class="' + (c.ok ? '' : 'no') + '"><span class="qdot ' + (c.ok ? 'ok' : 'no') + '">' + (c.ok ? '&#10003;' : '!') + '</span><span>' + esc(c.text) +
          (c.items && c.items.length ? '<span class="gate-items">' + c.items.map(function (i) { return '<a href="#" data-goitem="' + i.id + '">' + esc(i.t) + '</a>'; }).join('') + '</span>' : '') + '</span></li>';
      }).join('') + '</ul>' +
      '<div class="card-b"><button class="btn primary" type="button" id="p-approve"' + (g.ok && P.status !== 'approved' ? '' : ' disabled') + ' style="width:100%;justify-content:center">' + (P.status === 'approved' ? 'Approved' : 'Approve pricing and save') + '</button>' +
      '<p class="hint" style="margin:8px 0 0">Approving saves the intake and writes the primary option to the HubSpot deal and company (Sales Intake card). Any later change sets it back to draft.</p></div></div>';
    var pt = totals(P.opts[P.primary]);
    h += '<div class="card"><div class="card-h">Primary option</div><div class="card-b"><div class="pk"><b>' + esc(P.opts[P.primary].name) + '</b></div>' +
      '<div class="pk-row"><span>Annual</span><b>' + money(pt.annual) + '</b></div><div class="pk-row"><span>One-time</span><b>' + money(pt.oneTime) + '</b></div><div class="pk-row"><span>Total over ' + pt.years + ' yr</span><b>' + money(pt.tcv) + '</b></div></div></div>';
    h += '</aside><main class="calc-main">';

    // scope
    h += '<section class="card"><div class="card-h">Scope check</div><div class="card-b"><p class="hint" style="margin:0 0 8px">Is this routine, or do we phone a friend? Boxes marked <span class="src-tag">intake</span> come from the answers on the intake tab; you can override any of them.</p><div class="scope-grid">' +
      SCOPE.map(function (s) {
        var on = scopeOn(s.q), why = auto[s.q], ov = P.scopeOverride[s.q];
        return '<label class="scope-q' + (on ? ' on' : '') + '"><input type="checkbox" data-scope="' + s.q + '"' + (on ? ' checked' : '') + '><span>' + esc(s.label) + (why ? ' <span class="src-tag" title="' + esc(why) + '">intake</span>' : '') + (ov === true || ov === false ? ' <span class="src-tag rep">rep</span>' : '') + (why ? '<small>' + esc(why) + '</small>' : '') + '</span></label>';
      }).join('') + '</div>' +
      '<div class="verdict ' + lvl + '">' + (lvl === 'routine' ? 'Routine: the Standard tab prices this, no one else needed.' : lvl === 'enterprise' ? 'Enterprise: price it on the Enterprise tab with campuses, portals and the tech stack. No custom development so far.' : 'Custom development: bring in a Solutions Engineer before a number goes out. A rough order of magnitude is added as a one-time line.') + '</div>';
    if (lvl === 'custom') {
      h += '<div class="rom"><div class="row3"><label>Low ($)<input class="t" type="number" step="5000" data-rom="lo" value="' + P.rom.lo + '"></label><label>High ($)<input class="t" type="number" step="5000" data-rom="hi" value="' + P.rom.hi + '"></label><label>Likelihood of the high case (%)<input class="t" type="number" min="0" max="100" step="5" data-rom="p" value="' + P.rom.p + '"></label></div>' +
        '<p class="hint" style="margin:6px 0 0">Expected one-time custom development: <b>' + money(romExpected()) + '</b>. It stays a rough order of magnitude until the SE replaces it with a scoped estimate.</p>' +
        '<label class="se"><input type="checkbox" id="p-se"' + (P.seReviewed ? ' checked' : '') + '> A Solutions Engineer reviewed the custom scope and the ROM (required before approving)</label></div>';
    }
    h += '</div></section>';

    // model + options
    h += '<div class="calc-bar"><div class="seg" role="tablist"><button type="button" data-ptab="standard" class="' + (P.tab === 'standard' ? 'on' : '') + '">Standard</button><button type="button" data-ptab="enterprise" class="' + (P.tab === 'enterprise' ? 'on' : '') + '">Enterprise</button></div>' +
      '<div class="opt-tabs">' + P.opts.map(function (x, i) { return '<button type="button" class="opt-tab' + (i === P.cur ? ' on' : '') + '" data-opt="' + i + '">' + (i === P.primary ? '<span class="star" title="Primary: syncs to HubSpot">&#9733;</span>' : '') + esc(x.name) + (P.opts.length > 1 ? ' <span class="x" data-delopt="' + i + '" title="Remove option">&times;</span>' : '') + '</button>'; }).join('') +
      '<button type="button" class="opt-add" id="p-addopt">+ Add option</button></div></div>';

    // inputs
    h += '<div class="calc-grid"><section class="card"><div class="card-h">' + (P.tab === 'standard' ? 'Standard: one school, college, or university' : 'Enterprise: systems, multi-campus and tech stack') + '</div><div class="card-b">' +
      '<div class="row2"><label>Institution<input class="t" type="text" data-p="inst" value="' + esc(P.inst) + '"></label><label>Short name<input class="t" type="text" data-p="abbr" value="' + esc(P.abbr) + '"></label></div>' +
      '<div class="row2"><label>Full-time enrollment (FTE)' + (P.fteSource ? ' <span class="src-tag">' + esc(P.fteSource) + '</span>' : '') + '<input class="t" type="number" min="0" step="50" data-p="fte" value="' + (P.fte || '') + '" placeholder="Required"></label>' +
      '<label>Contract term<select class="t" data-o="term">' + [1, 2, 3, 4, 5].map(function (y) { return '<option value="' + y * 12 + '"' + (o.term === y * 12 ? ' selected' : '') + '>' + y + ' year' + (y > 1 ? 's' : '') + '</option>'; }).join('') + '</select></label></div>' +
      '<div class="row2"><label>Protected pricing<select class="t" data-o="prot"><option value="1"' + (o.prot ? ' selected' : '') + '>Yes (use the floor)</option><option value="0"' + (!o.prot ? ' selected' : '') + '>No (workbook tier)</option></select></label><label>Option name<input class="t" type="text" data-o="name" value="' + esc(o.name) + '"></label></div>' +
      '<label class="prim"><input type="checkbox" id="p-primary"' + (P.primary === P.cur ? ' checked' : '') + '> Primary option (syncs to HubSpot)</label>' +
      (o.term > 12 ? '<div class="mybadge">Multi-year pricing: ' + (o.term / 12) + ' year term, price locked</div>' : '');
    if (P.tab === 'enterprise') {
      h += '<div class="sub-h">Tech stack' + (P.ent.stackFromIntake ? ' <span class="src-tag">intake items 5 and 6</span>' : '') + '</div>' +
        '<div class="row3">' + [['sis', 'SIS'], ['crm', 'CRM'], ['audit', 'Degree audit']].map(function (k) { return '<label>' + k[1] + '<select class="t" data-ent="' + k[0] + '">' + STACK[k[0]].map(function (r) { return '<option' + (P.ent[k[0]] === r[0] ? ' selected' : '') + '>' + esc(r[0]) + '</option>'; }).join('') + '</select></label>'; }).join('') + '</div>' +
        '<div class="row3"><label>Platform base (annual)<input class="t" type="number" step="1000" data-ent="base" value="' + P.ent.base + '"></label><label>Campuses<input class="t" type="number" min="1" step="1" data-ent="campuses" value="' + P.ent.campuses + '"></label><label>Portals<input class="t" type="number" min="1" step="1" data-ent="portals" value="' + P.ent.portals + '"></label></div>' +
        '<p class="hint" style="margin:8px 0 4px">Integration components (annual). Guesstimated rates, editable per line until the implementation team signs a rate card.</p>' +
        '<div class="ent-rows">' + entRows().map(function (r) { return '<div class="ent-row"><span>' + esc(r.name) + '</span><input class="t num" type="number" step="500" data-rate="' + r.key + '" value="' + r.rate + '" aria-label="Rate"><span class="q">&times; ' + r.qty + '</span><b>' + money(r.rate * r.qty) + '</b></div>'; }).join('') + '</div>' +
        '<p class="hint" style="margin:6px 0 0">Platform total (replaces the Inbound line): <b>' + money(entTotal()) + '</b> per year.</p>';
    }
    h += '<div class="sub-h">Products</div><p class="hint" style="margin:0 0 6px">Insight includes Inbound. Custom is a blank line you name (for example an AACRAO member credit).</p><div class="prods">' +
      visibleLines().map(function (l) {
        var st = o.lines[l.key], on = l.rom ? lvl === 'custom' : st.on;
        if (l.custom) return '<label class="prod-c"><input type="checkbox" data-line="' + l.key + '"' + (on ? ' checked' : '') + '><input class="t" type="text" data-customname="1" placeholder="Custom line name" value="' + esc(o.customName) + '"></label>';
        return '<label><input type="checkbox" data-line="' + l.key + '"' + (on ? ' checked' : '') + (l.rom ? ' disabled' : '') + '> ' + esc(lineLabel(o, l)) + (l.oneTime ? ' <span class="chip-s">one-time</span>' : '') + '</label>';
      }).join('') + '</div></div></section>';

    // tier table
    h += '<section class="card"><div class="card-h">Per product price at ' + (P.fte ? fmt(P.fte) + ' FTE' : 'this FTE') + '</div><div class="card-b"><p class="hint" style="margin:0 0 8px">Tier is the workbook step function (rate per FTE, with minimums). Curve is the smooth regression used as the protected floor. Installation comes from the proposal bands.' + (P.fte ? ' This FTE is tier ' + tierFor(P.fte).id + '.' : '') + '</p>' +
      '<div class="tbl"><table class="pt"><thead><tr><th>Line</th><th class="r">Tier</th><th class="r">Curve</th><th class="r">Retail annual</th></tr></thead><tbody>' +
      visibleLines().map(function (l) {
        var on = l.rom ? lvl === 'custom' : o.lines[l.key].on, tp = tierPrice(l.key, P.fte), cp = curvePrice(l.key, P.fte);
        return '<tr class="' + (on ? '' : 'off') + '"><td>' + esc(lineLabel(o, l)) + '</td><td class="r">' + (tp === null || !P.fte ? '-' : money(tp)) + '</td><td class="r">' + (cp === null || !P.fte ? '-' : money(cp)) + '</td><td class="r">' + (P.fte || l.rom ? money(lineRetail(o, l.key)) : '-') + '</td></tr>';
      }).join('') + '</tbody></table></div></div></section></div>';

    // negotiation table
    var t = totals(o);
    h += '<section class="card"><div class="card-h">Annual schedule and per-line concessions</div><div class="card-b"><p class="hint" style="margin:0 0 8px">Set the price per line. The concession slider models competitive scenarios; on the proposal only the percentage shows, behind the number, on the line where you call it out.</p>' +
      '<div class="tbl"><table class="pt neg"><thead><tr><th>Line</th><th class="r">Retail</th><th class="r">' + esc(P.abbr || 'School') + ' price</th><th>Concession</th><th>Reason shown on proposal</th><th class="r">Total</th></tr></thead><tbody>' +
      (t.rows.length ? t.rows.map(function (r) {
        var st = o.lines[r.key], price = st.price == null ? Math.round(r.rt) : st.price;
        return '<tr><td>' + esc(r.label) + (r.oneTime ? ' <span class="chip-s">one-time</span>' : '') + '</td><td class="r">' + money(r.rt) + '</td>' +
          '<td class="r"><input class="t num" type="number" step="100" data-price="' + r.key + '" value="' + price + '"></td>' +
          '<td class="conc"><input type="range" min="0" max="50" step="1" data-conc="' + r.key + '" value="' + (st.conc || 0) + '"><span>' + (st.conc ? st.conc + '%' : '') + '</span></td>' +
          '<td><input class="t" type="text" data-reason="' + r.key + '" placeholder="e.g. AACRAO member credit" value="' + esc(st.reason) + '"></td><td class="r"><b>' + money(r.q) + '</b></td></tr>';
      }).join('') : '<tr><td colspan="6" class="muted">Select at least one product.</td></tr>') +
      '<tr class="total"><td colspan="5">Annual total' + (t.oneTime ? ' (plus ' + money(t.oneTime) + ' one-time)' : '') + '</td><td class="r">' + money(t.annual) + '</td></tr></tbody></table></div>' +
      '<div class="kpis"><div class="kpi"><div class="l">Annual</div><div class="v">' + money(t.annual) + '</div><div class="s">Billed annually for ' + t.years + ' year' + (t.years > 1 ? 's' : '') + '</div></div>' +
      '<div class="kpi"><div class="l">One-time</div><div class="v">' + money(t.oneTime) + '</div><div class="s">Installation and services</div></div>' +
      '<div class="kpi"><div class="l">Total over term</div><div class="v">' + money(t.tcv) + '</div><div class="s">' + (P.flags.tcv ? 'Printed on the proposal' : 'Internal only') + '</div></div></div></div></section>';

    // proposal terms
    h += '<section class="card"><div class="card-h">Proposal terms</div><div class="card-b"><div class="row2"><label>Pricing note (printed under the quote)<textarea class="t" data-p="note" placeholder="Explain any concession, for example: AACRAO member credit applied to Inbound for the initial term.">' + esc(P.note) + '</textarea></label><div class="flags-c">' +
      [['lock', 'Lifetime Pricing Guarantee (price lock for the term)'], ['roi', 'Performance Out and Guaranteed ROI'], ['tcv', 'Show total over the term on the proposal'], ['disc', 'Show market rate and savings on the proposal'], ['check', 'Accept check in addition to ACH'], ['msa', 'Append the MSA (April 2026)']].map(function (f) { return '<label><input type="checkbox" data-flag="' + f[0] + '"' + (P.flags[f[0]] ? ' checked' : '') + '> ' + esc(f[1]) + '</label>'; }).join('') +
      (P.flags.msa ? '<label class="eff">MSA effective date<select class="t" data-eff="mode"><option value="execution"' + (P.eff.mode === 'execution' ? ' selected' : '') + '>Date of execution</option><option value="custom"' + (P.eff.mode === 'custom' ? ' selected' : '') + '>Custom date</option><option value="other"' + (P.eff.mode === 'other' ? ' selected' : '') + '>Other wording</option></select>' +
        (P.eff.mode === 'custom' ? '<input class="t" type="date" data-eff="date" value="' + esc(P.eff.date) + '">' : '') + (P.eff.mode === 'other' ? '<input class="t" type="text" data-eff="other" placeholder="e.g. the first day of the Spring 2027 term" value="' + esc(P.eff.other) + '">' : '') + '</label>' : '') +
      '</div></div><p class="hint" style="margin:10px 0 0">These terms are stored with the pricing for the proposal. Standard tab reproduces PRICING MATRIX.xlsx (beta v0.3); Enterprise is Woody\'s model v2 with placeholder rates.</p></div></section>';
    h += '</main></div>';
    box.innerHTML = h;
  }

  /* ---------- events ---------- */
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function onInput(e) {
    var t = e.target, o = P.opts[P.cur];
    if (t.matches('[data-p]')) { var k = t.getAttribute('data-p'); if (k !== 'fte') { P[k] = t.value; if (host) host.dirty(); } return; }
    if (t.matches('[data-o="name"]')) { o.name = t.value; if (host) host.dirty(); return; }
    if (t.matches('[data-reason]')) { o.lines[t.getAttribute('data-reason')].reason = t.value; if (host) host.dirty(); return; }
    if (t.matches('[data-customname]')) { o.customName = t.value; if (host) host.dirty(); return; }
    if (t.matches('[data-conc]')) { o.lines[t.getAttribute('data-conc')].conc = num(t.value); var sp = t.nextElementSibling; if (sp) sp.textContent = t.value > 0 ? t.value + '%' : ''; if (host) host.dirty(); return; }
  }
  function onChange(e) {
    var t = e.target, o = P.opts[P.cur];
    if (t.matches('[data-scope]')) { var q = t.getAttribute('data-scope'), autoOn = !!autoScope()[q]; P.scopeOverride[q] = t.checked === autoOn ? null : t.checked; if (q === 'campuses' || q === 'portals') { if (t.checked && P.tab === 'standard') P.tab = 'enterprise'; } touch(); return; }
    if (t.matches('[data-p="fte"]')) { P.fte = Math.max(0, num(t.value)); P.fteSource = 'rep'; touch(); return; }
    if (t.matches('[data-conc]')) { touch(); return; }
    if (t.matches('[data-rom]')) { P.rom[t.getAttribute('data-rom')] = num(t.value); touch(); return; }
    if (t.id === 'p-se') { P.seReviewed = t.checked; touch(); return; }
    if (t.matches('[data-o="term"]')) { o.term = num(t.value); touch(); return; }
    if (t.matches('[data-o="prot"]')) { o.prot = t.value === '1'; touch(); return; }
    if (t.matches('[data-o="name"]')) { render(); return; }
    if (t.id === 'p-primary') { P.primary = P.cur; touch(); return; }
    if (t.matches('[data-ent]')) { var k = t.getAttribute('data-ent'); if (k === 'sis' || k === 'crm' || k === 'audit') { P.ent[k] = t.value; delete P.ent.rate[k]; } else P.ent[k] = k === 'base' ? num(t.value) : Math.max(1, num(t.value)); touch(); return; }
    if (t.matches('[data-rate]')) { P.ent.rate[t.getAttribute('data-rate')] = num(t.value); touch(); return; }
    if (t.matches('[data-line]')) { o.lines[t.getAttribute('data-line')].on = t.checked; touch(); return; }
    if (t.matches('[data-price]')) { o.lines[t.getAttribute('data-price')].price = num(t.value); touch(); return; }
    if (t.matches('[data-reason], [data-customname]')) { render(); return; }
    if (t.matches('[data-flag]')) { P.flags[t.getAttribute('data-flag')] = t.checked; touch(true); return; }
    if (t.matches('[data-eff]')) { P.eff[t.getAttribute('data-eff')] = t.value; touch(true); return; }
  }
  function onClick(e) {
    var t = e.target;
    var del = t.closest('[data-delopt]');
    if (del) { var i = num(del.getAttribute('data-delopt')); P.opts.splice(i, 1); if (P.primary === i) P.primary = 0; else if (P.primary > i) P.primary--; if (P.cur >= P.opts.length) P.cur = P.opts.length - 1; touch(); return; }
    var ot = t.closest('[data-opt]'); if (ot) { P.cur = num(ot.getAttribute('data-opt')); render(); return; }
    var pt = t.closest('[data-ptab]'); if (pt) { P.tab = pt.getAttribute('data-ptab'); touch(); return; }
    if (t.id === 'p-addopt') { var c = JSON.parse(JSON.stringify(P.opts[P.cur])); c.name = 'Option ' + (P.opts.length + 1); P.opts.push(c); P.cur = P.opts.length - 1; touch(); return; }
    var gi = t.closest('[data-goitem]'); if (gi) { e.preventDefault(); if (host) host.goItem(gi.getAttribute('data-goitem')); return; }
    if (t.id === 'p-approve') {
      if (!gate().ok) return;
      var who = host ? host.who() : '';
      if (!who) { if (host) host.needWho(); return; }
      P.status = 'approved'; P.approvedBy = who; P.approvedAt = new Date().toISOString();
      if (host) { host.dirty(); host.save(); }
      render();
    }
  }

  /* ---------- public ---------- */
  function summary() {
    if (!P) return null;
    var p = P.opts[P.primary], t = totals(p);
    var optLine = function (o, i) { var x = totals(o); return (i === P.primary ? '* ' : '') + o.name + ': ' + x.rows.map(function (r) { return r.label + ' ' + money(r.q) + (r.oneTime ? ' one-time' : '/yr') + (r.conc ? ' (' + r.conc + '% off' + (r.reason ? ', ' + r.reason : '') + ')' : ''); }).join('; ') + '. Annual ' + money(x.annual) + ', one-time ' + money(x.oneTime) + ', ' + x.years + '-year total ' + money(x.tcv) + '.'; };
    return {
      status: P.status, approvedBy: P.approvedBy, approvedAt: P.approvedAt,
      primary: p.name, termYears: t.years, annual: Math.round(t.annual), oneTime: Math.round(t.oneTime), tcv: Math.round(t.tcv),
      products: t.rows.map(function (r) { return r.label; }).join('; '), model: P.tab === 'enterprise' ? 'Enterprise' : 'Standard', scope: scopeLevel(), fte: P.fte, protectedPricing: !!p.prot,
      options: P.opts.map(optLine).join('\n'), note: P.note
    };
  }
  function recapLines() {
    var s = summary(); if (!s) return [];
    return ['', 'Pricing (' + s.status + ', ' + s.model + ', scope ' + s.scope + ', FTE ' + fmt(s.fte) + '):'].concat(s.options.split('\n').map(function (l) { return '- ' + l; }));
  }
  return {
    mount: function (h) {
      host = h; mounted = true;
      var box = $('pricing');
      box.addEventListener('input', onInput);
      box.addEventListener('change', onChange);
      box.addEventListener('click', onClick);
    },
    load: function (saved) { P = saved && saved.v ? saved : fresh(); if (!P.scopeOverride) P.scopeOverride = {}; if (P.cur >= P.opts.length) P.cur = 0; render(); },
    state: function () { return P; },
    summary: summary,
    recapLines: recapLines,
    render: render
  };
})();
