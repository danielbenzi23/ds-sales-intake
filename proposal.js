/* Proposal tab: builds the client proposal (degreesight-proposal layout) from the approved pricing, the intake and the
   deal. Every option from the calculator prints, the starred one is marked primary. The MSA (April 2026) is appended
   verbatim; edits are allowed but flag the proposal for legal review. Generating needs approved pricing. */
window.DSProposal = (function () {
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var money2 = function (n) { return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var money = function (n) { return '$' + Math.round(Number(n) || 0).toLocaleString('en-US'); };
  var fmtD = function (iso) { return iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; };

  var DESC = {
    'Installation': 'One-time implementation and onboarding: policy review workshop, {SIS} equivalency import, sandbox validation, {CRM} integration, single sign-on, and training.',
    'Inbound': 'A {SCHOOL}-branded transcript evaluation engine to help you recruit and enroll more students with prior credit (transfer, AP, CLEP, IB, dual enrollment), including transcript OCR, instant unofficial credit evaluation, and lead delivery into {CRM}.',
    'Insight': 'A {SCHOOL}-branded "what-if" audit engine that helps prospective students determine how their credits fit a given program of study at your institution.',
    'Planner': 'Degree planning for admitted and enrolled students, built on the same equivalency and audit data.',
    'Consultative Services': 'Transfer policy and workflow consulting delivered by the Partner Success team, scoped in the kickoff workshop.',
    'Custom': 'Custom line as agreed with {SCHOOL}.',
    'Custom development': 'Custom development as scoped in the Solutions Engineering review: a rough order of magnitude until the stories and prototype are defined.'
  };
  var NAME = { 'Installation': 'One-Time Installation', 'Inbound': 'DegreeSight "Inbound" - Annual License', 'Insight': 'DegreeSight "Insight" - Annual License', 'Planner': 'DegreeSight "Planner" - Annual License', 'Consultative Services': 'Consultative Services', 'Custom development': 'Custom Development (scoped by Solutions Engineering)' };

  var host = null, X = null, mounted = false;

  function V() { return host ? host.values() : {}; }
  function D() { return host ? host.dossier() : {}; }
  function PD() { return window.DSCalc ? DSCalc.proposalData() : null; }
  function lines(t) { return String(t || '').split('\n').map(function (s) { return s.replace(/^\s*[-*•]\s*/, '').trim(); }).filter(Boolean); }
  function sisName() { var v = V(); return v.sis_name && v.sis_name !== 'Unknown' ? v.sis_name : 'your SIS'; }
  function crmName() { var v = V(); return v.crm_name && ['Unknown', 'None'].indexOf(v.crm_name) < 0 ? v.crm_name : 'your CRM'; }

  function defaults() {
    var v = V(), d = D(), pd = PD() || {}, abbr = pd.abbr || ((d.institution || {}).name) || 'your institution', inst = pd.inst || (d.institution || {}).name || '';
    var ch = [];
    if (v.incumbent) ch.push('Today ' + abbr + ' relies on ' + v.incumbent.replace(/\.$/, '') + '.');
    if (Array.isArray(v.rules_source) && v.rules_source.length) ch.push('Equivalency rules live in ' + v.rules_source.join(', ').toLowerCase() + ', so every evaluation depends on a few people.');
    ch.push('Prospective transfer students cannot see how their credits apply before they apply, and many never start an application.');
    if (ch.length < 3) ch.push('Transfer credit evaluation is manual and slow, and applicants drop off while they wait.');
    var go = ['Give prospective transfer students a self-service answer to "how will my credits transfer" before they apply.'];
    if (v.live_date || v.live_driver) go.push('Be live for students' + (v.live_date ? ' by ' + fmtD(v.live_date + 'T12:00:00') : '') + (v.live_driver ? ' (' + v.live_driver.replace(/\.$/, '') + ')' : '') + '.');
    go.push('Grow transfer enrollment while keeping faculty governance over equivalency decisions.');
    var signer = v.signer || '';
    var c = (d.contacts || [])[0] || {};
    return {
      challenge: ch.join('\n'), goals: go.join('\n'),
      summary: inst + ' wants to grow its transfer student population and give prospective students a fast, responsive answer about their credits. DegreeSight helps institutions convert more of their prospects while reducing the time spent between the Enrollment and Registrar offices.',
      contact: signer || [c.name, c.title].filter(Boolean).join(', ') + (c.email ? ' (' + c.email + ')' : ''),
      address: (d.institution || {}).domain ? (d.institution || {}).domain : ''
    };
  }

  function fresh() { return { v: 1, text: defaults(), ref: '', issuedAt: '', expiresAt: '', generatedBy: '', pricingApprovedAt: '', msaEdited: null, edited: {} }; }

  function msaVerbatim(inst) {
    return MSA_HTML.replace('_____________ ("Client")', esc(inst) + ' ("Client")')
      .replace(/effective as of date of execution/, 'effective as of ' + esc((PD() || {}).effText || 'date of execution'))
      .replace(/<h1 data-part="(\w+)">/g, '<h1 id="msa-part-$1" data-part="$1">');
  }
  function msaModified(inst) { return X.msaEdited != null && X.msaEdited !== msaVerbatim(inst); }

  function gate() {
    var pd = PD();
    if (!pd) return { ok: false, why: 'Pricing has not loaded.' };
    if (pd.status !== 'approved') return { ok: false, why: 'Approve the pricing first (Pricing calculator tab). The proposal prints every option and needs a number that passed the quote gate.' };
    return { ok: true };
  }
  function stale() { var pd = PD(); return !!(X.ref && pd && (pd.status !== 'approved' || pd.approvedAt !== X.pricingApprovedAt)); }

  function nextRef(abbr) {
    var d = new Date(), mmyy = ('0' + (d.getMonth() + 1)).slice(-2) + String(d.getFullYear()).slice(-2);
    var base = 'DS-' + String(abbr || 'SCHOOL').toUpperCase().replace(/[^A-Z0-9]/g, '') + '-' + mmyy;
    var seq = 1;
    if (X.ref && X.ref.indexOf(base) === 0) seq = (parseInt(X.ref.slice(base.length), 10) || 0) + 1;
    return base + ('00' + seq).slice(-3);
  }

  function doc() {
    var pd = PD() || { opts: [], flags: {} }, d = D(), deal = d.deal || {}, t = X.text;
    var inst = pd.inst || (d.institution || {}).name || 'Your institution', abbr = pd.abbr || inst;
    var rep = deal.ownerName || (host ? host.who() : '') || 'DegreeSight', repMail = deal.ownerEmail || '';
    var ref = X.ref || 'DRAFT', issue = X.issuedAt ? fmtD(X.issuedAt) : fmtD(new Date().toISOString()), exp = X.expiresAt ? fmtD(X.expiresAt) : fmtD(new Date(Date.now() + 90 * 86400000).toISOString());
    var f = pd.flags || {};
    var sub = function (s) { return esc(s).replace(/\{SCHOOL\}/g, esc(abbr)).replace(/\{SIS\}/g, esc(sisName())).replace(/\{CRM\}/g, esc(crmName())); };
    var h = '';
    h += '<div class="cover"><div class="logo">Degree<span>Sight</span></div><div class="tagline">Credit Transparency</div><div class="headline">Guarantee transfer <em>success.</em></div><div class="for">A proposal for ' + esc(inst) + '</div><div class="wavec"></div></div>';
    h += '<div class="cover-foot"><span>Prepared by <b>' + esc(rep) + '</b>, DegreeSight</span><span>' + esc(ref) + ' · ' + esc(issue) + '</span></div><div class="body">';
    h += '<div><div class="eb">What We Heard</div><h3>Listening first: your challenge in your words</h3>' +
      '<h4>Challenge</h4><ul class="d">' + lines(t.challenge).map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' +
      '<h4>Goals / Objectives</h4><ul class="d">' + lines(t.goals).map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' +
      '<h4>National trends</h4><ul class="d"><li>First-time, first-year pipelines are softening nationally; institutions are diversifying enrollment with transfer, online, graduate, and adult learners.</li><li>80% of U.S. colleges cannot tell a student how their credits will transfer before the point of application, yet more than 50% of students will not consider applying without that answer.</li></ul></div>';
    h += '<div><div class="eb">The Impact</div><h3>Credit transparency drives enrollment</h3><div class="pills"><span class="pill">2x More Transfer Leads</span><span class="pill">3x Faster Processing</span><span class="pill">25% Higher Yield</span></div><p>DegreeSight is a Transfer Credit Workflow Engine: a cloud-based enrollment, degree audit, and student success platform designed to help higher education institutions grow enrollment and evaluate and manage transfer credits efficiently.</p></div>';
    h += '<div><div class="eb">Implementation</div><h3>30 days to go-live. We do the heavy lifting.</h3><p>Inbound and the equivalency management system typically launch within three to four weeks. Insight follows and is generally live within 90 to 120 days of contract signature, depending on your team availability and data readiness.</p>' +
      (pd.scope === 'custom' ? '<p><b>Scope note.</b> Custom development is scoped by our Solutions Engineering team and priced as a rough order of magnitude until the stories and prototype are defined.</p>' : '') + '</div>';
    h += '<div><div class="eb">Executive Summary</div><h3>Growing transfer at ' + esc(inst) + '</h3><p>' + esc(t.summary) + '</p><p>DegreeSight will empower ' + esc(inst) + ' with a ' + esc(abbr) + '-branded transcript evaluation engine integrated with ' + esc(sisName()) + (crmName() !== 'your CRM' ? ' and ' + esc(crmName()) : '') + ', so students receive an instant unofficial evaluation and your team receives the lead.</p></div>';
    h += '<div><div class="eb">The Investment</div><h3>Quote</h3><div class="cards"><div class="card"><div class="ml">Quote ref.</div><div class="mv">' + esc(ref) + '</div></div><div class="card"><div class="ml">Issue date</div><div class="mv">' + esc(issue) + '</div></div><div class="card"><div class="ml">Expires</div><div class="mv">' + esc(exp) + '</div></div><div class="card"><div class="ml">Currency</div><div class="mv">USD</div></div></div>' +
      '<div class="cards two" style="margin-top:8px"><div class="card"><div class="ml">Seller</div><div class="pn">DegreeSight</div>1401 Lavaca St, Unit 41477<br>Austin, TX 78701, US<div class="ml" style="margin-top:6px">Contact</div>' + esc(rep) + (repMail ? ' (' + esc(repMail) + ')' : '') + '</div>' +
      '<div class="card"><div class="ml">Buyer</div><div class="pn">' + esc(inst) + '</div>' + lines(t.address).map(esc).join('<br>') + '<div class="ml" style="margin-top:6px">Contact</div>' + esc(t.contact || '') + '</div></div></div>';
    var showDisc = !!f.disc, cols = showDisc ? 4 : 2;
    pd.opts.forEach(function (o) {
      h += '<div><div class="option-head"><h3 style="margin:0">' + esc(o.name) + '</h3>' + (o.primary && pd.opts.length > 1 ? '<span class="primary">Primary option</span>' : '') + '</div>' +
        '<div class="cards three" style="margin:10px 0"><div class="card"><div class="ml">Effective date</div><div class="mv">' + esc(pd.effText === 'date of execution' ? 'Date of execution' : pd.effText) + '</div></div><div class="card"><div class="ml">Term length</div><div class="mv">' + o.years + ' year' + (o.years > 1 ? 's' : '') + '</div></div>' +
        (o.term > 12 ? '<div class="card"><div class="ml">Multi-year</div><span class="mybadge"><span class="coin">$</span>Multi-year pricing, locked for the term</span></div>' : '<div class="card"><div class="ml">Protected pricing</div><div class="mv">' + (o.prot ? 'Yes' : 'No') + '</div></div>') + '</div>';
      h += '<table class="prod"><thead><tr><th>Products and Pricing</th>' + (showDisc ? '<th class="n">Market rate</th><th class="n">Your savings</th><th class="n">Your rate</th>' : '<th class="n">Price</th>') + '</tr></thead>';
      o.rows.forEach(function (r) {
        var name = r.key === 'Custom' ? (o.customName || 'Custom') : (NAME[r.key] || r.label), per = r.oneTime ? '' : ' / year';
        var tag = r.conc ? ' <span class="conc">' + r.conc + '% off' + (r.reason ? ', ' + esc(r.reason) : '') + '</span>' : '';
        h += '<tbody><tr><td class="nm">' + esc(name) + '</td>' + (showDisc ? '<td class="n">' + money2(r.rt) + per + '</td><td class="n">' + (r.rt - r.q > 0.5 ? money2(r.rt - r.q) + per : '&mdash;') + '</td><td class="n">' + money2(r.q) + per + tag + '</td>' : '<td class="n">' + money2(r.q) + per + tag + '</td>') + '</tr>' +
          '<tr class="desc"><td colspan="' + cols + '">' + sub(DESC[r.key] || '') + '</td></tr><tr class="bill"><td colspan="' + cols + '">Billing summary: ' + (r.oneTime ? 'Starts on effective date' : 'Starts on effective date, billed annually for ' + o.years + ' year' + (o.years > 1 ? 's' : '')) + '</td></tr></tbody>';
      });
      h += '</table><div class="stats"><div class="stat"><div class="n">' + money(o.annual + o.oneTime) + '</div><div class="l">Year one total</div></div>' +
        (o.years > 1 ? '<div class="stat"><div class="n">' + money(o.annual) + '</div><div class="l">Per year, years two' + (o.years > 2 ? ' to ' + o.years : '') + '</div></div>' : '<div class="stat"><div class="n">' + money(o.annual) + '</div><div class="l">Annual license total</div></div>') +
        (f.tcv ? '<div class="stat"><div class="n">' + money(o.tcv) + '</div><div class="l">' + o.years + '-year total cost of ownership</div></div>' : '<div class="stat"><div class="n">Net 30</div><div class="l">Payment terms</div></div>') + '</div>';
      if (showDisc && o.retailAnnual - o.annual > 0.5) h += '<p style="margin-top:8px"><b>Total savings:</b> ' + money2((o.retailAnnual - o.annual) * o.years) + ' over the term.</p>';
      h += '</div>';
    });
    if (pd.note) h += '<div><div class="eb">Pricing note</div><p>' + esc(pd.note) + '</p></div>';
    h += '<div><div class="eb">Terms</div>';
    if (f.lock) h += '<h4>Lifetime Pricing Guarantee</h4><p>Client is guaranteed the quoted price for the entire life of the partnership so long as there is no break in service. This contract does NOT auto-renew after the initial term, and it is incumbent upon client and DegreeSight to agree to any future terms.</p>';
    if (f.roi) h += '<h4>Performance Out and Guaranteed ROI</h4><p>After a full academic year of utilizing DegreeSight, if the net tuition revenue generated as a direct outcome of these solutions does not at least equal the annual contract price, the client is entitled to terminate the agreement without penalty. Both parties agree to meet in October of each calendar year to review the ROI.</p>';
    h += '<h4>Payments</h4><p>Invoices are due within 30 days of notice. Client will incur a one percent (1%) increase in invoice for every 30 days beyond the first 60 days.</p><div>' + ['ACH (direct debit)'].concat(f.check ? ['Check'] : []).map(function (p) { return '<span class="chipp">' + esc(p) + '</span>'; }).join('') + '</div></div>';
    if (f.msa) {
      h += '<div id="msa-sec"><div class="eb">The Agreement</div><h3>Master Services Agreement</h3>' +
        '<div class="msa-bar no-print"><button type="button" class="btn" id="msa-edit">Edit agreement text</button><button type="button" class="btn" id="msa-reset">Reset to verbatim (' + esc(MSA_VERSION) + ')</button><span id="msa-status">' + (msaModified(inst) ? '<span class="mod">Modified from the ' + esc(MSA_VERSION) + ' text. Legal review required before sending.</span>' : '<span class="ok">Verbatim ' + esc(MSA_VERSION) + ' text, only the client name and effective date substituted.</span>') + '</span></div>' +
        '<div class="msa-toc no-print"><a href="#msa-part-msa">Master Services Agreement</a><a href="#msa-part-dpe">Data Processing Exhibit</a><a href="#msa-part-ferpa">FERPA Addendum</a></div>' +
        '<div class="legal" id="msa-body">' + (X.msaEdited != null ? X.msaEdited : msaVerbatim(inst)) + '</div></div>';
    }
    h += '<div><div class="eb">Signature</div><h3>Acceptance</h3><p>By signing below, the undersigned acknowledges that they have read and agree to the terms and conditions of this proposal and the appended agreement, and represents that they are duly authorized to execute it on behalf of ' + esc(inst) + '.</p><div class="sig"><div class="sigline">Signature</div><div class="sigline">Printed name</div><div class="sigline">Title</div><div class="sigline">Date</div></div></div>';
    h += '<div class="foot"><span><b>' + esc(rep) + '</b> · DegreeSight' + (repMail ? ' · ' + esc(repMail) : '') + '</span><span>' + esc(ref) + ' · valid through ' + esc(exp) + '</span></div></div>';
    return h;
  }

  function render() {
    if (!mounted || !X) return;
    var box = $('proposal'); if (!box || box.hidden) return;
    var g = gate(), pd = PD() || {}, inst = pd.inst || (D().institution || {}).name || '';
    var st = X.ref ? (stale() ? 'stale' : 'ok') : 'none';
    var side = '<aside class="left prop-side no-print">' +
      '<div class="card gate ' + (st === 'ok' ? 'ready' : 'hold') + '"><div class="gate-top"><div><div class="lbl">' + (st === 'ok' ? 'Proposal ' + esc(X.ref) : st === 'stale' ? 'Pricing changed since ' + esc(X.ref) : g.ok ? 'Ready to generate' : 'Draft preview') + '</div><div class="sub">' +
      (st !== 'none' ? 'Generated ' + fmtD(X.issuedAt) + ' by ' + esc(X.generatedBy) + ' · valid through ' + fmtD(X.expiresAt) : esc(g.ok ? 'Pricing approved by ' + pd.approvedBy : g.why)) + '</div></div></div>' +
      '<div class="card-b" style="display:grid;gap:8px"><button class="btn primary" type="button" id="pr-gen"' + (g.ok ? '' : ' disabled') + ' style="justify-content:center">' + (X.ref ? 'Regenerate (new ref) and save' : 'Generate proposal and save') + '</button>' +
      '<button class="btn" type="button" id="pr-print" style="justify-content:center">Print or save as PDF</button>' +
      (X.ref && msaModified(inst) ? '<p class="hint" style="margin:0;color:var(--amber)">The MSA text was edited: legal review before sending.</p>' : '') +
      '<p class="hint" style="margin:0">Generating stamps the quote ref, issue date and a 90-day expiry, saves it, and writes the ref and dates to the HubSpot deal and company card. All ' + (pd.opts || []).length + ' options print; the starred one is primary.</p></div></div>' +
      '<div class="card"><div class="card-h">What we heard</div><div class="card-b prop-edit">' +
      '<label>Challenge (one bullet per line)<textarea class="t" data-pt="challenge">' + esc(X.text.challenge) + '</textarea></label>' +
      '<label>Goals / objectives<textarea class="t" data-pt="goals">' + esc(X.text.goals) + '</textarea></label>' +
      '<label>Executive summary<textarea class="t" data-pt="summary">' + esc(X.text.summary) + '</textarea></label>' +
      '<label>Buyer contact<input class="t" data-pt="contact" value="' + esc(X.text.contact) + '"></label>' +
      '<label>Buyer address (one line per row)<textarea class="t" data-pt="address" style="min-height:60px">' + esc(X.text.address) + '</textarea></label>' +
      '<button class="btn" type="button" id="pr-reset" style="justify-content:center">Refill from the intake</button>' +
      '<p class="hint" style="margin:0">Prefilled from the intake (items 9, 11, 13, 14) and the deal contacts. Edit the words before it goes out; they are saved with the intake.</p></div></div>' +
      '<p class="hint no-print">Pricing, terms and the effective date come from the Pricing calculator tab.</p></aside>';
    box.innerHTML = '<div class="calc-wrap prop-wrap">' + side + '<main class="calc-main"><div class="doc' + (X.ref && !stale() ? '' : ' draft') + '" id="proposal-doc">' + doc() + '</div></main></div>';
    wireMsa(inst);
  }

  function wireMsa(inst) {
    var body = $('msa-body'), edit = $('msa-edit'), reset = $('msa-reset');
    if (!body) return;
    edit.addEventListener('click', function () {
      var on = body.getAttribute('contenteditable') === 'true';
      body.setAttribute('contenteditable', on ? 'false' : 'true'); edit.classList.toggle('on', !on); edit.textContent = on ? 'Edit agreement text' : 'Done editing';
      if (on) render(); else body.focus();
    });
    body.addEventListener('input', function () { X.msaEdited = body.innerHTML; if (host) host.dirty(); });
    reset.addEventListener('click', function () { X.msaEdited = null; if (host) host.dirty(); render(); });
  }

  function onInput(e) {
    var t = e.target;
    if (t.matches('[data-pt]')) { X.text[t.getAttribute('data-pt')] = t.value; X.edited[t.getAttribute('data-pt')] = true; if (host) host.dirty(); var dd = $('proposal-doc'); if (dd) { dd.innerHTML = doc(); wireMsa((PD() || {}).inst || ''); } }
  }
  function onClick(e) {
    var t = e.target;
    if (t.id === 'pr-print') { document.body.classList.add('print-proposal'); window.print(); setTimeout(function () { document.body.classList.remove('print-proposal'); }, 500); return; }
    if (t.id === 'pr-reset') { X.text = defaults(); X.edited = {}; if (host) host.dirty(); render(); return; }
    if (t.id === 'pr-gen') {
      if (!gate().ok) return;
      var who = host ? host.who() : '';
      if (!who) { if (host) host.needWho(); return; }
      var pd = PD();
      X.ref = nextRef(pd.abbr || pd.inst); X.issuedAt = new Date().toISOString(); X.expiresAt = new Date(Date.now() + 90 * 86400000).toISOString();
      X.generatedBy = who; X.pricingApprovedAt = pd.approvedAt;
      if (host) { host.dirty(); host.save(); }
      render();
    }
  }

  return {
    mount: function (h) { host = h; mounted = true; var box = $('proposal'); box.addEventListener('input', onInput); box.addEventListener('click', onClick); },
    load: function (saved) {
      X = saved && saved.v ? saved : fresh();
      if (!X.edited) X.edited = {};
      var d = defaults(); Object.keys(d).forEach(function (k) { if (!X.edited[k] && !X.ref) X.text[k] = d[k]; });
      render();
    },
    refreshDefaults: function () { if (!X || X.ref) return; var d = defaults(); Object.keys(d).forEach(function (k) { if (!X.edited[k]) X.text[k] = d[k]; }); },
    state: function () { return X; },
    summary: function () { if (!X || !X.ref) return null; var inst = (PD() || {}).inst || ''; return { ref: X.ref, issuedAt: X.issuedAt, expiresAt: X.expiresAt, generatedBy: X.generatedBy, stale: stale(), msaModified: msaModified(inst) }; },
    render: function () { if (X && !X.ref) this.refreshDefaults(); render(); }
  };
})();
